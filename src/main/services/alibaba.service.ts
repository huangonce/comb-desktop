import { Page, Locator } from 'playwright-core'
import { BrowserService } from './browser.service'
import { logger } from './logger.service'
import { SupplierInfo } from '../../shared/SupplierInfo'

// 供应商信息接口

export class AlibabaService {
  private browserService: BrowserService
  private currentTask: Promise<SupplierInfo[]> | null = null

  constructor() {
    this.browserService = new BrowserService()
  }

  /**
   * 搜索阿里巴巴供应商
   * @param keyword 搜索关键词
   * @returns 供应商信息列表
   */
  async searchSuppliers(keyword: string): Promise<SupplierInfo[]> {
    if (this.currentTask) {
      logger.warn('已有任务正在进行中，等待当前任务完成')
      return this.currentTask
    }

    this.currentTask = this.performSearch(keyword)

    try {
      return await this.currentTask
    } finally {
      this.currentTask = null
      // this.browserService.closeBrowser()
    }
  }

  private async performSearch(keyword: string): Promise<SupplierInfo[]> {
    const maxRetries = 3
    let attempt = 1 // 修复：改为可变变量
    let lastError: Error | null = null

    while (attempt <= maxRetries) {
      try {
        logger.log(`开始第 ${attempt} 次搜索尝试，关键词: ${keyword}`)

        const page = await this.browserService.initBrowser()
        const searchUrl = this.buildSearchUrl(keyword)
        logger.log('正在访问:', searchUrl)

        // 导航到目标页面
        await this.browserService.navigateTo(searchUrl)

        if (await this.hasCaptcha(page)) {
          logger.log('验证码验证不通过，尝试重新加载页面')
          return []
        }

        await page.waitForSelector('.factory-card', {
          timeout: 10000,
          state: 'visible'
        })
        logger.log('页面加载完成，开始提取供应商信息')

        return await this.extractSupplierInfo(page)
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))
        logger.error(`第 ${attempt} 次搜索尝试失败: ${lastError.message}`)

        if (attempt < maxRetries) {
          const waitTime = attempt * 2000
          logger.info(`等待 ${waitTime / 1000} 秒后重试...`)
          await new Promise((resolve) => setTimeout(resolve, waitTime))
          await this.browserService.resetBrowserSession()
        }
        attempt++ // 修复：递增重试计数器
      }
    }

    // 如果所有重试都失败
    logger.log('所有搜索尝试都失败', lastError)
    return []
  }

  private buildSearchUrl(keyword: string): string {
    const encodedKeyword = encodeURIComponent(keyword)
    return `https://www.alibaba.com/trade/search?spm=a2700.galleryofferlist.page-tab-top.2.533913a0tlCuJh&fsb=y&IndexArea=product_en&SearchText=${encodedKeyword}&tab=supplier`
  }

  private async extractSupplierInfo(page: Page): Promise<SupplierInfo[]> {
    const suppliers: SupplierInfo[] = []
    const startTime = Date.now()

    try {
      if (!(await this.browserService.checkBrowserHealth())) {
        logger.warn('浏览器状态不健康，重置会话')
        await this.browserService.resetBrowserSession()
        throw new Error('浏览器会话已重置')
      }

      const cardSelectors = ['.factory-card']
      const supplierCards = await this.checkSupplierResults(page, cardSelectors)

      logger.log(`开始处理 ${supplierCards.length} 个供应商`)
      for (let i = 0; i < supplierCards.length; i++) {
        try {
          const card = supplierCards[i]
          const companyName = await this.extractTextSafe(card, [
            '.card-title .detail-info h3 a' // 常见的标题标签
          ])
          const companyURL = await this.extractAttributeSafe(
            card,
            ['.card-title .detail-info h3 a'],
            'href'
          )

          suppliers.push({
            id: i + 1,
            chineseName: '',
            englishName: companyName, // 阿里巴巴国际站主要显示英文名
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
          })
          logger.log(`成功处理第 ${i + 1} 个供应商: ${companyName}`)
        } catch (error) {
          logger.warn(
            `处理第 ${i + 1} 个供应商时出错: ${error instanceof Error ? error.message : String(error)}`
          )
        }
      }

      const duration = Date.now() - startTime
      logger.info(`提取完成，用时 ${duration}ms，成功 ${suppliers.length} 个供应商`)
      return suppliers
    } catch (error) {
      logger.error(`提取供应商信息失败: ${error instanceof Error ? error.message : String(error)}`)
      return suppliers.length > 0 ? suppliers : []
    }
  }

  private normalizeUrl(url: string, baseUrl = 'https://www.alibaba.com'): string {
    if (!url) return ''

    try {
      // 处理相对路径
      if (url.startsWith('/')) {
        return new URL(url, baseUrl).href
      }

      if (!/^https?:\/\//i.test(url)) {
        url = 'https://' + url
      }
      return new URL(url).href
    } catch {
      return url
    }
  }

  private async extractTextSafe(
    element: Locator,
    selectors: string[],
    timeout = 2000
  ): Promise<string> {
    for (const selector of selectors) {
      try {
        const text = await element.locator(selector).first().textContent({ timeout })
        if (text?.trim()) return text.trim()
      } catch {
        /* 忽略错误继续尝试下一个选择器 */
      }
    }
    return ''
  }

  private async extractAttributeSafe(
    element: Locator,
    selectors: string[],
    attribute: string,
    timeout = 2000
  ): Promise<string> {
    for (const selector of selectors) {
      try {
        const value = await element.locator(selector).first().getAttribute(attribute, { timeout })
        if (value?.trim()) return this.normalizeUrl(value.trim())
      } catch {
        /* 忽略错误继续尝试下一个选择器 */
      }
    }
    return ''
  }

  /**
   * 检查是否有验证码
   */
  private async hasCaptcha(page: Page): Promise<boolean> {
    try {
      // 优化：合并选择器减少DOM查询
      const captchaSelectors = [
        'iframe[src*="captcha"]',
        '.nc_wrapper',
        '[class*="captcha"]',
        '[class*="verify"]',
        '[class*="security"]'
      ].join(', ')

      const captchaCount = await page.locator(captchaSelectors).count()
      if (captchaCount === 0) {
        return false
      }

      const slideCaptchaHandled = await this.handleSlideCaptcha(page)
      if (slideCaptchaHandled) {
        logger.info('滑动验证码处理成功')
        return false
      }

      return true
    } catch (error) {
      logger.warn(`验证码检查失败: ${error instanceof Error ? error.message : String(error)}`)
      return false
    }
  }

  private async handleSlideCaptcha(page: Page): Promise<boolean> {
    const maxRetries = 100 // 最大重试次数
    let retryCount = 0

    while (retryCount < maxRetries) {
      const sliderSelector = '#nc_1_n1z' // 滑块选择器
      const slider = page.locator(sliderSelector)

      if ((await slider.count()) === 0) {
        return false
      }

      logger.info(`检测到滑动验证码，尝试第 ${retryCount + 1}/${maxRetries} 次处理...`)

      try {
        // 获取滑块位置信息
        const sliderBox = await slider.boundingBox()
        if (!sliderBox) {
          logger.warn('无法获取滑块位置信息')
          return false
        }

        const startX = sliderBox.x + sliderBox.width / 2
        const startY = sliderBox.y + sliderBox.height / 2
        const targetX = startX + 300 // 滑动距离

        // 模拟鼠标操作
        await page.mouse.move(startX, startY)
        await page.mouse.down()

        // 每次重试使用不同的滑动速度
        const speedFactor = 1.0 + retryCount * 0.2 // 随重试次数增加速度
        const baseSteps = 15 // 基础步数
        const steps = Math.max(5, Math.floor(baseSteps / speedFactor)) // 根据速度因子调整步

        const stepSize = (targetX - startX) / steps
        const minWait = Math.max(10, 30 - retryCount * 2) // 最小等待时间
        const maxWait = Math.max(20, 50 - retryCount * 3) // 最大等待时间

        for (let i = 0; i < steps; i++) {
          // 添加随机偏移模拟人手抖动
          const jitterX = Math.random() * 3 - 1.5
          const jitterY = Math.random() * 3 - 1.5

          const currentX = startX + (i + 1) * stepSize
          await page.mouse.move(currentX + jitterX, startY + jitterY, { steps: 1 })

          // 根据速度因子调整等待时间
          const waitTime = minWait + Math.random() * (maxWait - minWait)
          await page.waitForTimeout(waitTime)
        }

        await page.mouse.up()
        logger.info('快速滑动模拟完成')

        // 等待验证结果
        await page.waitForTimeout(1000)

        // 检查验证是否成功 - 使用更可靠的检测方法
        const successIndicator = await page.locator('#nc_1_wrapper').getAttribute('class')
        if (successIndicator && successIndicator.includes('success')) {
          logger.info('滑动验证成功')
          return true
        }

        // 检查是否有刷新按钮
        const refreshButton = page.locator('#nc_1_refresh')
        if ((await refreshButton.count()) > 0) {
          logger.warn('验证失败，点击刷新按钮重试...')
          await refreshButton.click()

          // 等待刷新动画完成
          await page.waitForTimeout(2000 + Math.random() * 1000)

          // 检查滑块是否重新出现
          if ((await slider.count()) === 0) {
            logger.info('刷新后滑块消失，可能验证成功')
            return true
          }

          retryCount++
          continue // 重试
        }

        // 检查是否有nocaptcha按钮
        const noCaptchaButton = page.locator('#nc_1_nocaptcha')
        if ((await noCaptchaButton.count()) > 0) {
          logger.warn('检测到nocaptcha按钮，尝试点击...')
          await noCaptchaButton.click()
          await page.waitForTimeout(3000)

          // 检查滑块是否重新出现
          if ((await slider.count()) > 0) {
            logger.info('nocaptcha点击后滑块仍在，继续尝试')
            retryCount++
            continue
          }

          logger.info('nocaptcha点击后滑块消失，可能验证成功')
          return true
        }

        // 如果没有刷新按钮，直接重试
        retryCount++
        logger.warn('验证失败，准备重试...')
        await page.waitForTimeout(2000 + Math.random() * 1000)
      } catch (error) {
        logger.error(`滑动验证处理失败: ${error instanceof Error ? error.message : String(error)}`)
        retryCount++
        await page.waitForTimeout(3000) // 错误后等待更长时间
      }
    }

    logger.warn(`滑动验证失败，已达最大重试次数 (${maxRetries}次)`)
    return false
  }

  private async checkSupplierResults(page: Page, cardSelectors: string[]): Promise<Locator[]> {
    for (const selector of cardSelectors) {
      const cards = page.locator(selector)
      const count = await cards.count()

      if (count > 0) {
        logger.info(`找到 ${count} 个供应商卡片 (${selector})`)
        return await cards.all()
      }
    }

    logger.warn('未找到供应商卡片')
    return []
  }
}
