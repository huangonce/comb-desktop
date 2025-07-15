import { Page, Locator } from 'playwright-core'
import { BrowserService, type NavigationOptions } from './browser.service'
import { logger } from './logger.service'
import { SupplierInfo } from '../../shared/SupplierInfo'
import {
  buildSearchUrl,
  getErrorMessage,
  hasNoMoreResults,
  isCaptchaPage,
  isSupplierSearchPage,
  normalizeUrl
} from './alibaba/utils'

// 第三方服务接口
interface OcrService {
  recognize(imageBuffer: Buffer): Promise<string>
}

export class AlibabaService {
  private browserService: BrowserService
  private activeSearchTask: Promise<SupplierInfo[]> | null = null
  private activePages: Set<Page> = new Set()
  private ocrService: OcrService | null = null

  // 配置常量
  private static readonly MAX_CONCURRENT_PAGES = 5
  private static readonly MAX_PAGE_RETRIES = 3
  private static readonly BASE_RETRY_DELAY = 3000

  // 选择器常量
  private static readonly SUPPLIER_CARD_SELECTOR = '.factory-card'
  private static readonly COMPANY_NAME_SELECTOR = '.card-title .detail-info h3 a'
  private static readonly CAPTCHA_IMAGE_SELECTOR = '.captcha-image img'
  private static readonly CAPTCHA_INPUT_SELECTOR = '#captcha-input'
  private static readonly CAPTCHA_SUBMIT_SELECTOR = '.captcha-submit'
  private static readonly SLIDER_SELECTOR = '#nc_1_n1z'
  private static readonly CAPTCHA_WRAPPER_SELECTOR = '#nc_1_wrapper'
  private static readonly CAPTCHA_REFRESH_SELECTOR = '#nc_1_refresh'

  constructor(ocrService?: OcrService) {
    this.browserService = new BrowserService()
    this.ocrService = ocrService || null
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
      await this.cleanupResources()
    }
  }

  /**
   * 清理资源
   */
  private async cleanupResources(): Promise<void> {
    for (const page of this.activePages) {
      if (!page.isClosed()) {
        await page.close().catch((e) => logger.warn(`关闭页面失败: ${getErrorMessage(e)}`))
      }
    }
    this.activePages.clear()
  }

  /**
   * 执行供应商搜索操作
   * @param keyword 搜索关键词
   */
  private async executeSupplierSearch(keyword: string): Promise<SupplierInfo[]> {
    const MAX_RETRIES = 3
    const allSuppliers: SupplierInfo[] = []

    // 初始化浏览器服务
    await this.browserService.initialize()

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        logger.info(`开始搜索供应商 (尝试 ${attempt}/${MAX_RETRIES}): ${keyword}`)
        let pageNumber = 1
        let hasMoreResults = true

        while (hasMoreResults && pageNumber <= 50) {
          // 安全限制最多50页
          logger.info(`正在采集第 ${pageNumber} 页供应商`)
          const searchUrl = buildSearchUrl(keyword, pageNumber)

          // 获取新页面
          const page = await this.acquireNewPage()

          try {
            // 稳健导航
            const navigationSuccess = await this.robustGoto(page, searchUrl)

            if (!navigationSuccess) {
              logger.warn(`导航到第 ${pageNumber} 页失败，跳过`)
              pageNumber++
              continue
            }

            // 检查页面类型
            if (await isSupplierSearchPage(page)) {
              // 检查是否无结果
              if (await hasNoMoreResults(page)) {
                logger.info(`第 ${pageNumber} 页无更多结果，停止采集`)
                hasMoreResults = false
                break
              }

              // 提取供应商
              const pageSuppliers = await this.extractSuppliersWithRetry(page, pageNumber)
              allSuppliers.push(...pageSuppliers)
              logger.info(`第 ${pageNumber} 页采集完成: 找到 ${pageSuppliers.length} 个供应商`)

              pageNumber++
            } else if (await isCaptchaPage(page)) {
              // 处理复杂验证码
              const captchaSolved = await this.handleComplexCaptcha(page)
              if (!captchaSolved) {
                logger.warn('验证码处理失败，跳过当前页')
                pageNumber++
              }
            } else {
              logger.warn(`未知页面类型，停止采集`)
              hasMoreResults = false
              break
            }
          } finally {
            // 释放页面资源
            await this.releasePage(page)
          }
        }

        logger.info(`供应商采集完成: 共找到 ${allSuppliers.length} 个供应商`)
        return allSuppliers
      } catch (error) {
        const errorMessage = getErrorMessage(error)
        logger.error(`供应商搜索失败 (尝试 ${attempt}): ${errorMessage}`)

        if (attempt < MAX_RETRIES) {
          const delay = attempt * AlibabaService.BASE_RETRY_DELAY
          logger.info(`等待 ${delay}ms 后重试...`)
          await new Promise((resolve) => setTimeout(resolve, delay))
          await this.browserService.reset()
        } else {
          logger.error(`所有搜索尝试均失败: ${keyword}`)
        }
      }
    }

    return allSuppliers
  }

  /**
   * 获取新页面（带池管理）
   */
  private async acquireNewPage(): Promise<Page> {
    if (this.activePages.size < AlibabaService.MAX_CONCURRENT_PAGES) {
      const newPage = await this.browserService.createAdditionalPage()
      this.activePages.add(newPage)
      return newPage
    }
    return this.browserService.getActivePage()
  }

  /**
   * 释放页面资源
   */
  private async releasePage(page: Page): Promise<void> {
    if (!page.isClosed()) {
      await page.close()
    }
    this.activePages.delete(page)
  }

  /**
   * 稳健导航方法
   */
  private async robustGoto(
    page: Page,
    url: string,
    options: NavigationOptions = {}
  ): Promise<boolean> {
    const maxRetries = options.retries || AlibabaService.MAX_PAGE_RETRIES

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await page.goto(url, {
          waitUntil: options.waitUntil || 'domcontentloaded',
          timeout: options.timeout || 30000
        })

        // 导航后验证码检查
        if (await isCaptchaPage(page)) {
          const captchaSolved = await this.handleCaptchaIfPresent(page)
          if (!captchaSolved) {
            logger.warn(`导航后出现验证码 (尝试 ${attempt}/${maxRetries})`)
            continue
          }
        }

        return true
      } catch (error) {
        logger.warn(`导航尝试 ${attempt}/${maxRetries} 失败: ${getErrorMessage(error)}`)
        await this.recoverPageAfterFailure(page)
      }
    }
    return false
  }

  /**
   * 页面失败后恢复
   */
  private async recoverPageAfterFailure(page: Page): Promise<void> {
    try {
      // 尝试重置到安全页面
      await page.goto('about:blank', { timeout: 10000 })
      await page.waitForTimeout(1000)

      // 清除可能的残留状态
      await page.evaluate(() => {
        window.sessionStorage.clear()
        window.localStorage.clear()
      })
    } catch (recoveryError) {
      logger.warn(`页面恢复失败: ${getErrorMessage(recoveryError)}`)

      // 彻底重置页面
      if (!page.isClosed()) {
        await page.close()
        const newPage = await this.browserService.createAdditionalPage()
        this.activePages.add(newPage)
        this.activePages.delete(page)
      }
    }
  }

  /**
   * 带重试的供应商提取
   */
  private async extractSuppliersWithRetry(page: Page, pageNumber: number): Promise<SupplierInfo[]> {
    const MAX_EXTRACTION_RETRIES = 2

    for (let attempt = 0; attempt < MAX_EXTRACTION_RETRIES; attempt++) {
      try {
        return await this.extractSuppliersFromPage(page, pageNumber)
      } catch (error) {
        if (attempt === MAX_EXTRACTION_RETRIES - 1) throw error

        logger.warn(`供应商提取失败，尝试恢复页面...`)
        await this.recoverPageAfterFailure(page)
      }
    }
    return []
  }

  /**
   * 等待供应商卡片加载
   * @param page 页面实例
   */
  private async waitForSupplierCards(page: Page): Promise<boolean> {
    try {
      await page.waitForSelector(AlibabaService.SUPPLIER_CARD_SELECTOR, {
        timeout: 15_000,
        state: 'attached'
      })
      return true
    } catch (error) {
      logger.warn(`供应商卡片加载超时: ${getErrorMessage(error)}`)
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
      // 等待卡片加载
      if (!(await this.waitForSupplierCards(page))) {
        return []
      }

      // 定位供应商卡片
      const supplierCards = await this.locateSupplierCards(page)
      if (supplierCards.length === 0) {
        return []
      }

      logger.info(`找到 ${supplierCards.length} 个供应商卡片`)

      // 并行处理供应商信息提取（带并发控制）
      const batchSize = 5
      const suppliers: SupplierInfo[] = []

      for (let i = 0; i < supplierCards.length; i += batchSize) {
        const batch = supplierCards.slice(i, i + batchSize)
        const batchPromises = batch.map((card, index) =>
          this.processSupplierCard(card, (pageNumber - 1) * 10 + i + index + 1)
        )

        const batchResults = await Promise.allSettled(batchPromises)

        for (const result of batchResults) {
          if (result.status === 'fulfilled' && result.value) {
            suppliers.push(result.value)
          }
        }

        // 批次间延迟
        await page.waitForTimeout(500)
      }

      const duration = Math.round(performance.now() - startTime)
      logger.info(
        `供应商提取完成: 成功 ${suppliers.length}/${supplierCards.length}, 耗时 ${duration}ms`
      )
      return suppliers
    } catch (error) {
      logger.error(`供应商提取失败: ${getErrorMessage(error)}`)
      throw error // 抛出错误以便重试机制
    }
  }

  /**
   * 处理单个供应商卡片
   * @param card 供应商卡片元素
   * @param index 供应商索引
   */
  private async processSupplierCard(card: Locator, index: number): Promise<SupplierInfo | null> {
    try {
      const companyLink = card.locator(AlibabaService.COMPANY_NAME_SELECTOR).first()

      const [companyName, companyURL] = await Promise.all([
        companyLink.textContent().then((t) => t?.trim() || ''),
        companyLink.getAttribute('href').then((url) => normalizeUrl(url?.trim() || ''))
      ])

      if (!companyName) {
        logger.warn(`供应商 ${index} 名称提取失败`)
        return null
      }

      logger.debug(`处理供应商 ${index}: ${companyName}`)

      // 获取更多详情（示例）
      const supplierDetail: SupplierInfo = {
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

      // 可以在这里添加更多字段的提取逻辑

      return supplierDetail
    } catch (error) {
      logger.warn(`处理供应商 ${index} 失败: ${getErrorMessage(error)}`)
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
   * @returns 是否成功解决验证码
   */
  private async handleCaptchaIfPresent(page: Page): Promise<boolean> {
    try {
      const captchaWrapper = page.locator(AlibabaService.CAPTCHA_WRAPPER_SELECTOR)
      if (!(await captchaWrapper.count())) {
        return true // 无验证码
      }

      logger.info('检测到验证码，尝试处理...')
      return await this.handleComplexCaptcha(page)
    } catch (error) {
      logger.warn(`验证码处理失败: ${getErrorMessage(error)}`)
      return false
    }
  }

  /**
   * 处理复杂验证码（多方法尝试）
   */
  private async handleComplexCaptcha(page: Page): Promise<boolean> {
    // 方法1: 尝试滑块验证
    if (await this.solveSliderCaptcha(page)) {
      return true
    }

    // 方法2: 尝试OCR识别
    if (this.ocrService && (await this.tryOcrCaptcha(page))) {
      return true
    }

    // 方法3: 人工干预
    logger.error('需要人工干预解决验证码')
    await this.promptManualCaptchaResolution(page)

    // 最终检查
    return !(await isCaptchaPage(page))
  }

  /**
   * 尝试OCR识别验证码
   */
  private async tryOcrCaptcha(page: Page): Promise<boolean> {
    try {
      const captchaImage = await page.locator(AlibabaService.CAPTCHA_IMAGE_SELECTOR)
      if (!(await captchaImage.count())) return false

      const imageBuffer = await captchaImage.screenshot()
      const captchaText = await this.ocrService!.recognize(imageBuffer)

      if (captchaText) {
        await page.fill(AlibabaService.CAPTCHA_INPUT_SELECTOR, captchaText)
        await page.click(AlibabaService.CAPTCHA_SUBMIT_SELECTOR)
        await page.waitForTimeout(2000)

        return !(await isCaptchaPage(page))
      }
    } catch (error) {
      logger.warn(`OCR验证码识别失败: ${getErrorMessage(error)}`)
    }
    return false
  }

  /**
   * 人工干预解决验证码
   */
  private async promptManualCaptchaResolution(page: Page): Promise<void> {
    logger.error('请手动解决验证码...')

    // 暂停超时
    page.setDefaultNavigationTimeout(0)
    page.setDefaultTimeout(0)

    // 等待人工解决
    let captchaResolved = false
    const startTime = Date.now()
    const timeout = 180_000 // 3分钟

    while (!captchaResolved && Date.now() - startTime < timeout) {
      captchaResolved = !(await isCaptchaPage(page))
      if (!captchaResolved) {
        await page.waitForTimeout(5000)
      }
    }

    // 恢复超时设置
    page.setDefaultNavigationTimeout(this.browserService.getConfig().timeout)
    page.setDefaultTimeout(this.browserService.getConfig().timeout)

    if (captchaResolved) {
      logger.info('人工验证码解决成功')
    } else {
      logger.error('人工验证码解决超时')
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
        if (!(await slider.count())) {
          return true // 没有滑块，可能是其他验证码
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
        await page.waitForTimeout(1500)

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
      } catch (error) {
        logger.error(`滑动验证失败: ${getErrorMessage(error)}`)
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
    const steps = 20
    const stepSize = distance / steps
    const maxJitter = 5

    for (let i = 0; i < steps; i++) {
      const progress = i / steps
      const dynamicJitter = maxJitter * (1 - progress) // 越接近终点抖动越小

      const currentX = startX + (i + 1) * stepSize
      const jitterX = (Math.random() - 0.5) * dynamicJitter * 2
      const jitterY = (Math.random() - 0.5) * dynamicJitter

      // 非线性速度变化
      const speedVariation = 50 + Math.random() * 100
      await page.mouse.move(currentX + jitterX, startY + jitterY, { steps: 1 })
      await page.waitForTimeout(speedVariation)
    }

    // 最终微调
    const finalX = startX + distance
    await page.mouse.move(finalX, startY, { steps: 3 })
    await page.waitForTimeout(200)
  }

  /**
   * 刷新验证码
   * @param page 页面实例
   */
  private async refreshCaptcha(page: Page): Promise<boolean> {
    try {
      const refreshButton = page.locator(AlibabaService.CAPTCHA_REFRESH_SELECTOR)
      if (!(await refreshButton.count())) return false

      await refreshButton.click()
      await page.waitForTimeout(2000)
      return true
    } catch {
      return false
    }
  }
}
