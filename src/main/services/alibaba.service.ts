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
    }
  }

  /**
   * 执行供应商搜索操作
   * @param keyword 搜索关键词
   */
  private async executeSupplierSearch(keyword: string): Promise<SupplierInfo[]> {
    const MAX_RETRIES = 3
    const RETRY_DELAY_BASE = 2000

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        logger.info(`开始搜索供应商 (尝试 ${attempt}/${MAX_RETRIES}): ${keyword}`)

        const page = await this.browserService.launchBrowser()
        const searchUrl = this.buildSearchUrl(keyword)

        await this.browserService.navigateToUrl(searchUrl)

        // 处理验证码
        const captchaPresent = await this.handleCaptchaIfPresent(page)
        if (captchaPresent) {
          logger.warn('验证码处理失败，跳过本次尝试')
          throw new Error('验证码处理失败')
        }

        // 等待供应商卡片加载
        await page.waitForSelector(AlibabaService.SUPPLIER_CARD_SELECTOR, {
          timeout: 10_000,
          state: 'visible'
        })

        return await this.extractSuppliersFromPage(page)
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
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
  private buildSearchUrl(keyword: string): string {
    const encodedKeyword = encodeURIComponent(keyword)

    return `https://www.alibaba.com/trade/search?fsb=y&IndexArea=product_en&keywords=${encodedKeyword}&originKeywords=${encodedKeyword}&tab=supplier&&page=1`
  }

  /**
   * 从页面提取供应商信息
   * @param page 页面实例
   */
  private async extractSuppliersFromPage(page: Page): Promise<SupplierInfo[]> {
    const suppliers: SupplierInfo[] = []
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
      logger.info(`找到 ${supplierCards.length} 个供应商卡片`)

      // 并行处理供应商信息提取
      const extractionPromises = supplierCards.map((card, index) =>
        this.processSupplierCard(card, index + 1)
      )

      const results = await Promise.allSettled(extractionPromises)

      // 收集成功提取的供应商
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
      logger.error(`供应商提取失败: ${error instanceof Error ? error.message : String(error)}`)
      return suppliers
    }
  }

  /**
   * 处理单个供应商卡片
   * @param card 供应商卡片元素
   * @param index 供应商索引
   */
  private async processSupplierCard(card: Locator, index: number): Promise<SupplierInfo | null> {
    try {
      const companyName = await this.extractTextWithFallback(card, [
        AlibabaService.COMPANY_NAME_SELECTOR
      ])

      const companyURL = await this.extractAttributeWithFallback(
        card,
        [AlibabaService.COMPANY_NAME_SELECTOR],
        'href'
      )

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
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.warn(`处理供应商 ${index} 失败: ${errorMessage}`)
      return null
    }
  }

  /**
   * 定位供应商卡片
   * @param page 页面实例
   */
  private async locateSupplierCards(page: Page): Promise<Locator[]> {
    const cards = page.locator(AlibabaService.SUPPLIER_CARD_SELECTOR)
    const count = await cards.count()

    if (count === 0) {
      logger.warn('未找到供应商卡片')
      return []
    }

    return cards.all()
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
      logger.warn(`验证码处理失败: ${error instanceof Error ? error.message : String(error)}`)
      return true
    }
  }

  /**
   * 解决滑动验证码
   * @param page 页面实例
   */
  private async solveSliderCaptcha(page: Page): Promise<boolean> {
    const MAX_ATTEMPTS = 5
    const SLIDER_DISTANCE = 300
    const SLIDE_DURATION = 1000

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        logger.info(`尝试解决滑动验证码 (${attempt}/${MAX_ATTEMPTS})`)

        const slider = page.locator(AlibabaService.SLIDER_SELECTOR)
        if ((await slider.count()) === 0) {
          logger.info('未找到滑块，验证码可能已消失')
          return true
        }

        const sliderBox = await slider.boundingBox()
        if (!sliderBox) {
          logger.warn('无法获取滑块位置')
          return false
        }

        const startX = sliderBox.x + sliderBox.width / 2
        const startY = sliderBox.y + sliderBox.height / 2

        await page.mouse.move(startX, startY)
        await page.mouse.down()

        // 模拟人类滑动行为
        await this.simulateHumanSlide(page, startX, startY, SLIDER_DISTANCE, SLIDE_DURATION)

        await page.mouse.up()
        logger.debug('滑动操作完成')

        // 等待验证结果
        await page.waitForTimeout(1000)

        // 检查验证是否成功
        const wrapperClass = await page
          .locator(AlibabaService.CAPTCHA_WRAPPER_SELECTOR)
          .getAttribute('class')
        if (wrapperClass?.includes('success')) {
          logger.info('滑动验证成功')
          return true
        }

        // 尝试刷新验证码
        if (await this.refreshCaptcha(page)) {
          continue
        }

        // 尝试其他验证方式
        if (await this.tryAlternativeCaptchaSolutions(page)) {
          return true
        }
      } catch (error) {
        logger.error(`滑动验证失败: ${error instanceof Error ? error.message : String(error)}`)
      }
    }

    logger.warn(`滑动验证失败，已达最大尝试次数 (${MAX_ATTEMPTS})`)
    return false
  }

  /**
   * 模拟人类滑动行为
   * @param page 页面实例
   * @param startX 起始X坐标
   * @param startY 起始Y坐标
   * @param distance 滑动距离
   * @param duration 滑动持续时间
   */
  private async simulateHumanSlide(
    page: Page,
    startX: number,
    startY: number,
    distance: number,
    duration: number
  ): Promise<void> {
    const steps = 20
    const stepSize = distance / steps
    const stepDuration = duration / steps

    for (let i = 0; i < steps; i++) {
      const currentX = startX + (i + 1) * stepSize

      // 添加随机偏移模拟人手抖动
      const jitterX = (Math.random() - 0.5) * 5
      const jitterY = (Math.random() - 0.5) * 3

      await page.mouse.move(currentX + jitterX, startY + jitterY, { steps: 1 })

      // 随机等待时间
      const waitTime = stepDuration * (0.8 + Math.random() * 0.4)
      await page.waitForTimeout(waitTime)
    }
  }

  /**
   * 刷新验证码
   * @param page 页面实例
   */
  private async refreshCaptcha(page: Page): Promise<boolean> {
    const refreshButton = page.locator(AlibabaService.CAPTCHA_REFRESH_SELECTOR)
    if ((await refreshButton.count()) === 0) return false

    try {
      logger.info('点击验证码刷新按钮')
      await refreshButton.click()
      await page.waitForTimeout(2000)
      return true
    } catch (error) {
      logger.error(`滑动验证处理失败: ${error instanceof Error ? error.message : String(error)}`)
      return false
    }
  }

  /**
   * 尝试其他验证码解决方案
   * @param page 页面实例
   */
  private async tryAlternativeCaptchaSolutions(page: Page): Promise<boolean> {
    const nocaptchaButton = page.locator(AlibabaService.CAPTCHA_NOCAPTCHA_SELECTOR)
    if ((await nocaptchaButton.count()) === 0) return false

    try {
      logger.info('尝试替代验证码解决方案')
      await nocaptchaButton.click()
      await page.waitForTimeout(3000)

      // 检查验证是否成功
      const slider = page.locator(AlibabaService.SLIDER_SELECTOR)
      if ((await slider.count()) === 0) {
        logger.info('替代解决方案成功')
        return true
      }
    } catch (error) {
      logger.error(`替代解决方案失败: ${error instanceof Error ? error.message : String(error)}`)
    }

    return false
  }

  /**
   * 安全提取文本内容
   * @param element 父元素
   * @param selectors 选择器列表
   * @param timeout 超时时间
   */
  private async extractTextWithFallback(
    element: Locator,
    selectors: string[],
    timeout = 2000
  ): Promise<string> {
    for (const selector of selectors) {
      try {
        const textContent = await element.locator(selector).first().textContent({ timeout })
        if (textContent?.trim()) return textContent.trim()
      } catch {
        // 忽略错误继续尝试下一个选择器
      }
    }
    return ''
  }

  /**
   * 安全提取元素属性
   * @param element 父元素
   * @param selectors 选择器列表
   * @param attribute 属性名称
   * @param timeout 超时时间
   */
  private async extractAttributeWithFallback(
    element: Locator,
    selectors: string[],
    attribute: string,
    timeout = 2000
  ): Promise<string> {
    for (const selector of selectors) {
      try {
        const attrValue = await element
          .locator(selector)
          .first()
          .getAttribute(attribute, { timeout })
        if (attrValue?.trim()) return this.normalizeUrl(attrValue.trim())
      } catch {
        // 忽略错误继续尝试下一个选择器
      }
    }
    return ''
  }

  /**
   * 标准化URL
   * @param url 原始URL
   * @param baseUrl 基础URL
   */
  private normalizeUrl(url: string, baseUrl = 'https://www.alibaba.com'): string {
    if (!url) return ''

    try {
      // 处理相对路径
      if (url.startsWith('/')) {
        return new URL(url, baseUrl).href
      }

      // 处理缺少协议的URL
      if (!/^https?:\/\//i.test(url)) {
        return 'https://' + url
      }

      return new URL(url).href
    } catch {
      return url
    }
  }
}
