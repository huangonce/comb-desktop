import { Page, Locator } from 'playwright-core'
import { BrowserService } from './browser.service'
import { logger } from './logger.service'
import { SupplierInfo } from '../../shared/SupplierInfo'

// 供应商信息接口

export class AlibabaService {
  private browserService: BrowserService

  constructor() {
    // 在 Electron 应用中，Chromium 可执行文件路径
    this.browserService = new BrowserService()
  }

  /**
   * 搜索阿里巴巴供应商
   * @param keyword 搜索关键词
   * @returns 供应商信息列表
   */
  async searchSuppliers(keyword: string): Promise<SupplierInfo[]> {
    const maxRetries = 3
    let lastError: Error | null = null

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        logger.log(`开始第 ${attempt} 次搜索尝试，关键词: ${keyword}`)
        const page = await this.browserService.initBrowser()

        const searchUrl = `https://www.alibaba.com/trade/search?spm=a2700.galleryofferlist.page-tab-top.2.533913a0tlCuJh&fsb=y&IndexArea=product_en&SearchText=${encodeURIComponent(keyword)}&tab=supplier`

        logger.log('正在访问:', searchUrl)

        // 访问供应商目录页面
        await page.goto(searchUrl, {
          waitUntil: 'domcontentloaded',
          timeout: 60000 // 增加超时时间
        })

        // 等待页面加载完成
        await page.waitForTimeout(5_000)

        // 检查是否有验证码或登录重定向
        if (await this.hasCaptchaOrLoginRedirect(page)) {
          logger.log('检测到验证码或登录重定向')
          return []
        }

        // 提取供应商信息
        const suppliers = await this.extractSupplierInfo(page)
        logger.log(`第 ${attempt} 次尝试成功，找到 ${suppliers.length} 个供应商`)

        return suppliers
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))
        logger.error(`第 ${attempt} 次搜索尝试失败:`, lastError.message)

        if (attempt < maxRetries) {
          const waitTime = attempt * 2000
          logger.log(`等待 ${waitTime / 1000} 秒后重试...`)
          await new Promise((resolve) => setTimeout(resolve, waitTime))

          // 重置浏览器会话
          await this.browserService.resetBrowserSession()
        }
      }
    }

    // 如果所有重试都失败
    logger.log('所有搜索尝试都失败')
    return []
  }

  /**
   * 提取供应商信息
   */
  private async extractSupplierInfo(page: Page): Promise<SupplierInfo[]> {
    const suppliers: SupplierInfo[] = []
    const startTime = Date.now()

    try {
      // 检查浏览器健康状态
      const isHealthy = await this.browserService.checkBrowserHealth()
      if (!isHealthy) {
        logger.log('浏览器状态不健康，重置会话')
        await this.browserService.resetBrowserSession()
        throw new Error('浏览器会话已重置，需要重试')
      }

      // 多种可能的供应商卡片选择器，基于实际页面分析
      const cardSelectors = ['[class="factory-card"]']
      const supplierCards: Locator[] = await this.checkSupplierResults(page, cardSelectors)

      // 限制处理的供应商数量，避免超时

      logger.log(`开始处理 ${supplierCards.length} 个供应商`)
      for (let i = 0; i < supplierCards.length; i++) {
        try {
          const card = supplierCards[i]

          // // 检查处理时间，避免超时
          // const currentTime = Date.now()
          // if (currentTime - startTime > 45000) {
          //   logger.log('处理时间超过45秒，停止处理')
          //   break
          // }

          // 提取基本信息 - 使用安全的提取方法
          const companyName = await this.extractTextSafe(card, [
            '.card-title .detail-info h3 a' // 常见的标题标签
          ])
          const companyURL = await this.extractAttributeSafe(
            card,
            ['.card-title .detail-info h3 a'],
            'href'
          )

          // if (!companyName) {
          //   logger.log(`第 ${i + 1} 个供应商没有公司名称，跳过`)
          //   continue // 如果没有公司名称，跳过
          // }

          // const location = await this.extractTextSafe(card, [
          //   '.company-location',
          //   '.location',
          //   '[class*="location"]',
          //   '[class*="address"]',
          //   '.address',
          //   '.country',
          //   '.region'
          // ])

          // const website = await this.extractAttributeSafe(
          //   card,
          //   ['a[href*="alibaba.com"]', 'a[href]', '[href*="alibaba.com"]'],
          //   'href'
          // )

          // const yearText = await this.extractTextSafe(card, [
          //   '[class*="year"]',
          //   '[class*="establish"]',
          //   '.company-year',
          //   '.founded',
          //   '.since'
          // ])

          // const contactInfo = await this.extractTextSafe(card, [
          //   '.contact',
          //   '[class*="contact"]',
          //   '.phone',
          //   '.email',
          //   '.tel',
          //   '.mobile'
          // ])

          // // 解析位置信息
          // const { country, province, city, district } = this.parseLocation(location)

          // // 解析年份
          // const establishedYear = this.parseYear(yearText)

          const supplier: SupplierInfo = {
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
            // phone: this.extractPhone(contactInfo),
            // email: this.extractEmail(contactInfo),
            // country: country || '中国',
            // province: province || '',
            // city: city || '',
            // district: district || '',
            // address: location || '',
            // website: website || '',
            // establishedYear: establishedYear || '',
            creditCode: ''
          }

          suppliers.push(supplier)
          logger.log(`成功处理第 ${i + 1} 个供应商: ${companyName}`)
        } catch (error) {
          logger.error(`处理第 ${i + 1} 个供应商时出错:`, error)
          continue
        }
      }

      const processingTime = Date.now() - startTime
      logger.log(
        `供应商信息提取完成，用时 ${processingTime}ms，成功提取 ${suppliers.length} 个供应商`
      )

      // 如果没有提取到供应商
      if (suppliers.length === 0) {
        logger.log('未找到有效的供应商信息')
        return []
      }

      return suppliers
    } catch (error) {
      logger.error('提取供应商信息时出错:', error)

      // 如果提取失败但已有部分数据，返回已有数据
      if (suppliers.length > 0) {
        logger.log(`提取过程中出错，但已获得 ${suppliers.length} 个供应商数据`)
        return suppliers
      }

      // 完全失败时返回空数组
      return []
    }
  }

  /**
   * 规范化 URL
   */
  private normalizeUrl(url: string): string {
    if (!url) return ''

    try {
      // 如果URL不包含协议，添加https
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url
      }

      const urlObj = new URL(url)
      return urlObj.href
    } catch {
      return url // 如果URL无效，返回原始字符串
    }
  }

  /**
   * 安全的文本提取，带超时控制
   */
  private async extractTextSafe(
    element: Locator,
    selectors: string[],
    timeout = 2000
  ): Promise<string> {
    for (const selector of selectors) {
      try {
        const textElement = element.locator(selector).first()
        const text = await textElement.textContent({ timeout })
        if (text && text.trim()) {
          return text.trim()
        }
      } catch {
        continue
      }
    }
    return ''
  }

  /**
   * 安全的属性提取，带超时控制
   */
  private async extractAttributeSafe(
    element: Locator,
    selectors: string[],
    attribute: string,
    timeout = 2000
  ): Promise<string> {
    for (const selector of selectors) {
      try {
        const attrElement = element.locator(selector).first()
        const value = await attrElement.getAttribute(attribute, { timeout })
        if (value && value.trim()) {
          return this.normalizeUrl(value.trim())
        }
      } catch {
        continue
      }
    }
    return ''
  }

  /**
   * 解析位置信息
   */
  private parseLocation(location: string): {
    country: string
    province: string
    city: string
    district: string
  } {
    if (!location) {
      return { country: '', province: '', city: '', district: '' }
    }

    // 简单的位置解析逻辑
    const parts = location.split(/[,，\s]+/).filter((part) => part.trim())

    let country = ''
    let province = ''
    let city = ''
    let district = ''

    if (parts.length >= 1) {
      country = parts[0].includes('China') || parts[0].includes('中国') ? '中国' : parts[0]
    }
    if (parts.length >= 2) {
      province = parts[1]
    }
    if (parts.length >= 3) {
      city = parts[2]
    }
    if (parts.length >= 4) {
      district = parts[3]
    }

    return { country, province, city, district }
  }

  /**
   * 解析年份
   */
  private parseYear(yearText: string): string {
    if (!yearText) return ''

    const yearMatch = yearText.match(/(\d{4})/)
    return yearMatch ? yearMatch[1] : ''
  }

  /**
   * 提取电话号码
   */
  private extractPhone(text: string): string {
    if (!text) return ''

    const phoneMatch = text.match(/(\+?\d{1,4}[-.\s]?\d{3,4}[-.\s]?\d{3,4}[-.\s]?\d{3,4})/g)
    return phoneMatch ? phoneMatch[0] : ''
  }

  /**
   * 提取邮箱地址
   */
  private extractEmail(text: string): string {
    if (!text) return ''

    const emailMatch = text.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g)
    return emailMatch ? emailMatch[0] : ''
  }

  /**
   * 检查是否有验证码或登录重定向
   */
  private async hasCaptchaOrLoginRedirect(page: Page): Promise<boolean> {
    try {
      // 检查验证码
      const captchaSelectors = [
        'iframe[src*="captcha"]',
        '.nc_wrapper',
        '[class*="captcha"]',
        '[class*="verify"]',
        '[class*="security"]'
      ]

      for (const selector of captchaSelectors) {
        if ((await page.locator(selector).count()) > 0) {
          logger.log('检测到验证码元素:', selector)
          return true
        }
      }

      // 检查是否被重定向到登录页面
      const currentUrl = page.url()
      if (currentUrl.includes('login') || currentUrl.includes('signin')) {
        logger.log('检测到登录重定向:', currentUrl)
        return true
      }

      return false
    } catch (error) {
      logger.warn('验证码检查失败:', error)
      return false
    }
  }

  private async checkSupplierResults(page: Page, cardSelectors: string[]): Promise<Locator[]> {
    let supplierCards: Locator[] = []

    for (const selector of cardSelectors) {
      try {
        supplierCards = await page.locator(selector).all()
        if (supplierCards.length > 0) {
          logger.log(`使用选择器 ${selector} 找到 ${supplierCards.length} 个供应商卡片`)
          break
        }
      } catch (error) {
        logger.warn('检查供应商卡片时出错:', error)
        continue
      }
    }

    return supplierCards
  }
}
