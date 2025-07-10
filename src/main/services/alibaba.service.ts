import { Page, Locator } from 'playwright-core'
import { BrowserService } from './browser.service'
import { logger } from './logger.service'
import { SupplierInfo } from '../../shared/SupplierInfo'

export class AlibabaService {
  private browserService: BrowserService
  private activeSearchTask: Promise<SupplierInfo[]> | null = null

  // 选择器常量
  private static readonly SUPPLIER_CARD_SELECTOR = '.factory-card'
  private static readonly COMPANY_NAME_SELECTOR = '.card-title .detail-info h3 a'
  private static readonly CAPTCHA_SELECTORS = [
    'iframe[src*="captcha"]',
    '.nc_wrapper',
    '[class*="captcha"]',
    '[class*="verify"]',
    '[class*="security"]'
  ]
  private static readonly SLIDER_SELECTOR = '#nc_1_n1z'
  private static readonly CAPTCHA_WRAPPER_SELECTOR = '#nc_1_wrapper'
  private static readonly CAPTCHA_REFRESH_SELECTOR = '#nc_1_refresh'
  private static readonly CAPTCHA_NOCAPTCHA_SELECTOR = '#nc_1_nocaptcha'
  private static readonly NO_MORE_RESULTS_SELECTOR = '#sse-less-result'

  constructor() {
    this.browserService = new BrowserService()
  }

  /**
   * 搜索阿里巴巴供应商
   * @param keyword 搜索关键词
   * @returns 供应商信息列表
   */
  async searchSuppliers(keyword: string): Promise<SupplierInfo[]> {
    if (this.activeSearchTask) {
      logger.warn('已有搜索任务正在进行中，等待当前任务完成')
      return this.activeSearchTask
    }

    try {
      this.activeSearchTask = this.executeSupplierSearch(keyword)
      return await this.activeSearchTask
    } finally {
      this.activeSearchTask = null
      this.browserService.terminateBrowser()
    }
  }

  /**
   * 执行供应商搜索操作
   * @param keyword 搜索关键词
   */
  private async executeSupplierSearch(keyword: string): Promise<SupplierInfo[]> {
    const MAX_RETRIES = 3
    const RETRY_DELAY_BASE = 2000
    const allSuppliers: SupplierInfo[] = []

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        logger.info(`开始搜索供应商 (尝试 ${attempt}/${MAX_RETRIES}): ${keyword}`)

        const page = await this.browserService.launchBrowser()
        let pageNumber = 1
        let hasMoreResults = true

        while (hasMoreResults) {
          logger.info(`正在采集第 ${pageNumber} 页供应商`)
          const searchUrl = this.buildSearchUrl(keyword, pageNumber)

          await this.browserService.navigateToUrl(searchUrl)

          // 处理验证码
          const captchaPresent = await this.handleCaptchaIfPresent(page)
          if (captchaPresent) {
            // logger.warn('验证码处理失败，跳过本次尝试')
            // throw new Error('验证码处理失败')
            logger.warn('验证码处理失败，跳过当前页')
            // 跳过当前页继续下一页
            pageNumber++
            continue
          }

          // 检查是否还有更多结果
          if (await this.hasNoMoreResults(page)) {
            logger.info(`第 ${pageNumber} 页无更多结果，停止采集`)
            hasMoreResults = false
            break
          }

          // 等待供应商卡片加载
          await this.waitForSupplierCards(page)

          // 提取当前页供应商
          const pageSuppliers = await this.extractSuppliersFromPage(page, pageNumber)
          allSuppliers.push(...pageSuppliers)

          logger.info(`第 ${pageNumber} 页采集完成: 找到 ${pageSuppliers.length} 个供应商`)
          pageNumber++
        }

        logger.info(`供应商采集完成: 共找到 ${allSuppliers.length} 个供应商`)
        return allSuppliers
      } catch (error) {
        const errorMessage = this.getErrorMessage(error)
        logger.error(`供应商搜索失败 (尝试 ${attempt}): ${errorMessage}`)

        if (attempt < MAX_RETRIES) {
          const delay = attempt * RETRY_DELAY_BASE
          logger.info(`等待 ${delay}ms 后重试...`)
          await new Promise((resolve) => setTimeout(resolve, delay))
          await this.browserService.resetSession()
        }
      }
    }

    logger.error(`所有搜索尝试均失败: ${keyword}`)
    return []
  }

  /**
   * 构建搜索URL
   * @param keyword 搜索关键词
   */
  private buildSearchUrl(keyword: string, pageNumber: number): string {
    const encodedKeyword = encodeURIComponent(keyword)

    return `https://www.alibaba.com/trade/search?fsb=y&IndexArea=product_en&keywords=${encodedKeyword}&originKeywords=${encodedKeyword}&tab=supplier&&page=${pageNumber}`
  }

  /**
   * 检查是否还有更多结果
   * @param page 页面实例
   */
  private async hasNoMoreResults(page: Page): Promise<boolean> {
    try {
      const noMoreElement = page.locator(AlibabaService.NO_MORE_RESULTS_SELECTOR)
      return await noMoreElement.isVisible({ timeout: 3000 })
    } catch {
      return false
    }
  }

  /**
   * dddd
   * 等待供应商卡片加载
   * @param page 页面实例
   */
  private async waitForSupplierCards(page: Page): Promise<boolean> {
    try {
      await page.waitForSelector(AlibabaService.SUPPLIER_CARD_SELECTOR, {
        timeout: 10_000,
        state: 'attached'
      })
      return true
    } catch (error) {
      // 检查是否显示无结果
      if (await this.hasNoMoreResults(page)) {
        logger.info('无供应商结果')
        return false
      }
      logger.warn(`供应商卡片加载超时: ${this.getErrorMessage(error)}`)
      return false
    }
  }

  /**
   * 从页面提取供应商信息
   * @param page 页面实例
   */
  private async extractSuppliersFromPage(page: Page, pageNumber: number): Promise<SupplierInfo[]> {
    const startTime = performance.now()

    try {
      // 检查浏览器健康状态
      if (!(await this.browserService.checkHealthStatus())) {
        logger.warn('浏览器状态异常，重置会话')
        await this.browserService.resetSession()
        throw new Error('浏览器会话已重置')
      }

      // 定位供应商卡片
      const supplierCards = await this.locateSupplierCards(page)
      if (supplierCards.length === 0) {
        return []
      }

      logger.info(`找到 ${supplierCards.length} 个供应商卡片`)

      // 并行处理供应商信息提取
      const extractionPromises = supplierCards.map((card, index) =>
        this.processSupplierCard(card, (pageNumber - 1) * 10 + index + 1)
      )

      const results = await Promise.allSettled(extractionPromises)

      // 收集成功提取的供应商
      const suppliers: SupplierInfo[] = []
      for (const result of results) {
        if (result.status === 'fulfilled' && result.value) {
          suppliers.push(result.value)
        }
      }

      const duration = Math.round(performance.now() - startTime)
      logger.info(
        `供应商提取完成: 成功 ${suppliers.length}/${supplierCards.length}, 耗时 ${duration}ms`
      )
      return suppliers
    } catch (error) {
      logger.error(`供应商提取失败: ${this.getErrorMessage(error)}`)
      return []
    }
  }

  /**
   * 处理单个供应商卡片
   * @param card 供应商卡片元素
   * @param index 供应商索引
   */
  private async processSupplierCard(card: Locator, index: number): Promise<SupplierInfo | null> {
    try {
      // 使用更高效的选择器组合
      const companyName = await card
        .locator(AlibabaService.COMPANY_NAME_SELECTOR)
        .first()
        .textContent({ timeout: 1500 })
        .then((t) => t?.trim() || '')

      const companyURL = await card
        .locator(AlibabaService.COMPANY_NAME_SELECTOR)
        .first()
        .getAttribute('href', { timeout: 1500 })
        .then((url) => this.normalizeUrl(url?.trim() || ''))

      if (!companyName) {
        logger.warn(`供应商 ${index} 名称提取失败`)
        return null
      }

      logger.debug(`处理供应商 ${index}: ${companyName}`)

      return {
        id: index,
        chineseName: '',
        englishName: companyName,
        albabaURL: companyURL,
        phone: '',
        email: '',
        country: '',
        province: '',
        city: '',
        district: '',
        address: '',
        website: '',
        establishedYear: '',
        creditCode: ''
      }
    } catch (error) {
      logger.warn(`处理供应商 ${index} 失败: ${this.getErrorMessage(error)}`)
      return null
    }
  }

  /**
   * 定位供应商卡片
   * @param page 页面实例
   */
  private async locateSupplierCards(page: Page): Promise<Locator[]> {
    try {
      const cards = page.locator(AlibabaService.SUPPLIER_CARD_SELECTOR)
      const count = await cards.count()
      return count > 0 ? await cards.all() : []
    } catch {
      return []
    }
  }

  /**
   * 处理验证码（如果存在）
   * @param page 页面实例
   * @returns 是否检测到验证码
   */
  private async handleCaptchaIfPresent(page: Page): Promise<boolean> {
    try {
      const captchaSelector = AlibabaService.CAPTCHA_SELECTORS.join(', ')
      const captchaElements = page.locator(captchaSelector)

      if ((await captchaElements.count()) === 0) {
        return false
      }

      logger.info('检测到验证码，尝试处理...')
      return !(await this.solveSliderCaptcha(page))
    } catch (error) {
      logger.warn(`验证码处理失败: ${this.getErrorMessage(error)}`)
      return true
    }
  }

  /**
   * 解决滑动验证码
   * @param page 页面实例
   */
  private async solveSliderCaptcha(page: Page): Promise<boolean> {
    const MAX_ATTEMPTS = 3
    const SLIDER_DISTANCE = 300

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        logger.info(`尝试解决滑动验证码 (${attempt}/${MAX_ATTEMPTS})`)

        const slider = page.locator(AlibabaService.SLIDER_SELECTOR)
        if ((await slider.count()) === 0) {
          return true
        }

        const sliderBox = await slider.boundingBox()
        if (!sliderBox) {
          continue
        }

        const startX = sliderBox.x + sliderBox.width / 2
        const startY = sliderBox.y + sliderBox.height / 2

        await page.mouse.move(startX, startY, { steps: 2 })
        await page.mouse.down()

        // 模拟人类滑动行为（优化版）
        await this.optimizedHumanSlide(page, startX, startY, SLIDER_DISTANCE)

        await page.mouse.up()

        // 等待验证结果
        await page.waitForTimeout(800)

        // 检查验证是否成功
        const wrapperClass = await page
          .locator(AlibabaService.CAPTCHA_WRAPPER_SELECTOR)
          .getAttribute('class', { timeout: 1000 })

        if (wrapperClass?.includes('success')) {
          logger.info('滑动验证成功')
          return true
        }

        // 尝试刷新验证码
        if (await this.refreshCaptcha(page)) {
          continue
        }
      } catch (error) {
        logger.error(`滑动验证失败: ${this.getErrorMessage(error)}`)
      }
    }

    logger.warn(`滑动验证失败，已达最大尝试次数 (${MAX_ATTEMPTS})`)
    return false
  }

  /**
   * 优化的人类滑动行为模拟
   * @param page 页面实例
   * @param startX 起始X坐标
   * @param startY 起始Y坐标
   * @param distance 滑动距离
   */
  private async optimizedHumanSlide(
    page: Page,
    startX: number,
    startY: number,
    distance: number
  ): Promise<void> {
    const steps = 15
    const stepSize = distance / steps

    for (let i = 0; i < steps; i++) {
      const currentX = startX + (i + 1) * stepSize
      const jitterX = (Math.random() - 0.5) * 3
      const jitterY = (Math.random() - 0.5) * 2

      await page.mouse.move(currentX + jitterX, startY + jitterY, { steps: 1 })
      await page.waitForTimeout(30 + Math.random() * 20)
    }
  }

  /**
   * 刷新验证码
   * @param page 页面实例
   */
  private async refreshCaptcha(page: Page): Promise<boolean> {
    try {
      const refreshButton = page.locator(AlibabaService.CAPTCHA_REFRESH_SELECTOR)
      if ((await refreshButton.count()) === 0) return false

      await refreshButton.click()
      await page.waitForTimeout(1000)
      return (await page.locator(AlibabaService.SLIDER_SELECTOR).count()) === 0
    } catch {
      return false
    }
  }

  /**
   * 标准化URL
   * @param url 原始URL
   * @param baseUrl 基础URL
   */
  private normalizeUrl(url: string): string {
    if (!url) return ''

    try {
      // 处理协议相对URL (//example.com)
      if (url.startsWith('//')) {
        return `https:${url}`
      }

      // 处理相对路径
      if (url.startsWith('/')) {
        return `https://www.alibaba.com${url}`
      }

      // 处理缺少协议的URL
      if (!/^https?:\/\//i.test(url)) {
        return `https://${url}`
      }

      return url
    } catch {
      return url
    }
  }

  private getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error)
  }
}
