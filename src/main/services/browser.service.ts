import { chromium, Browser, BrowserContext, Page, Locator } from 'playwright-core'
import path from 'path'
import { app } from 'electron'
import { logger } from './logger.service'

// 浏览器配置接口
export interface BrowserConfig {
  headless: boolean
  executablePath?: string
  userAgent: string
  viewport: { width: number; height: number }
  timeout: number
}

export class BrowserService {
  private browser: Browser | null = null
  private context: BrowserContext | null = null
  private page: Page | null = null
  private config: BrowserConfig
  private isActive = false

  constructor(config?: Partial<BrowserConfig>) {
    // 默认配置
    const defaultConfig: BrowserConfig = {
      headless: true,
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 800 },
      timeout: 60000 // 60秒超时
    }

    // 合并配置
    this.config = { ...defaultConfig, ...config }

    // 设置可执行文件路径
    if (!this.config.executablePath) {
      this.config.executablePath = this.getChromiumExecutablePath()
    }
  }

  /**
   * 获取 Chromium 可执行文件路径
   */
  private getChromiumExecutablePath(): string | undefined {
    try {
      // 在开发环境中，使用系统安装的 Chromium
      if (process.env.NODE_ENV === 'development') {
        return undefined // 让 Playwright 自动查找
      }

      // 在生产环境中，可以指定打包后的 Chromium 路径
      const userDataPath = app.getPath('userData')
      const platform = process.platform
      let chromiumDir = ''

      if (platform === 'win32') {
        chromiumDir = path.join(userDataPath, 'chromium', 'chrome-win')
      } else if (platform === 'darwin') {
        chromiumDir = path.join(userDataPath, 'chromium', 'chrome-mac')
      } else {
        chromiumDir = path.join(userDataPath, 'chromium', 'chrome-linux')
      }

      const executableName = platform === 'win32' ? 'chrome.exe' : 'chrome'
      return path.join(chromiumDir, executableName)
    } catch (error) {
      logger.warn('无法获取 Chromium 路径，使用默认配置', error)
      return undefined
    }
  }

  /**
   * 初始化浏览器
   */
  async initBrowser(): Promise<void> {
    if (this.isBrowserInitialized()) {
      return
    }

    try {
      const launchOptions: any = {
        headless: this.config.headless,
        executablePath: this.config.executablePath,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-default-browser-check',
          '--disable-extensions',
          '--disable-plugins',
          '--disable-default-apps',
          '--disable-gpu',
          '--single-process', // 某些环境需要
          '--disable-features=IsolateOrigins,site-per-process',
          '--disable-web-security',
          '--lang=en-US,en;q=0.9'
        ],
        timeout: this.config.timeout
      }

      logger.info('正在启动 Chromium 浏览器...')
      this.browser = await chromium.launch(launchOptions)
      logger.info('Chromium 浏览器启动成功')

      this.context = await this.browser.newContext({
        viewport: this.config.viewport,
        userAgent: this.config.userAgent,
        locale: 'en-US,en;q=0.9',
        extraHTTPHeaders: {
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
          Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8'
        },
        ignoreHTTPSErrors: true
      })

      logger.info('创建浏览器上下文成功')

      this.page = await this.context.newPage()
      await this.page.setDefaultNavigationTimeout(120000) // 120秒超时
      await this.page.setDefaultTimeout(30000) // 30秒元素超时

      logger.info('页面创建成功')
      this.isActive = true
    } catch (error) {
      logger.error('初始化浏览器失败', error)
      await this.closeBrowser()
      throw new Error(`浏览器初始化失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * 检查浏览器是否已初始化
   */
  isBrowserInitialized(): boolean {
    return !!this.browser && !!this.context && !!this.page
  }

  /**
   * 获取当前页面实例
   */
  getPage(): Page {
    if (!this.page) {
      throw new Error('页面未初始化')
    }
    return this.page
  }

  /**
   * 关闭浏览器
   */
  async closeBrowser(): Promise<void> {
    this.isActive = false

    try {
      if (this.page) {
        await this.page.close().catch((e) => logger.warn('关闭页面失败', e))
        this.page = null
        logger.info('页面已关闭')
      }

      if (this.context) {
        await this.context.close().catch((e) => logger.warn('关闭上下文失败', e))
        this.context = null
        logger.info('浏览器上下文已关闭')
      }

      if (this.browser) {
        await this.browser.close().catch((e) => logger.warn('关闭浏览器失败', e))
        this.browser = null
        logger.info('浏览器已关闭')
      }
    } catch (error) {
      logger.error('关闭浏览器时出错', error)
    }
  }

  /**
   * 重置浏览器会话
   */
  async resetBrowserSession(): Promise<void> {
    logger.info('正在重置浏览器会话...')
    await this.closeBrowser()
    await this.initBrowser()
    logger.info('浏览器会话已重置')
  }

  /**
   * 检查浏览器是否健康
   */
  async isBrowserHealthy(): Promise<boolean> {
    try {
      if (!this.browser || !this.context || !this.page) {
        return false
      }

      // 检查浏览器是否仍然连接
      const isConnected = this.browser.isConnected()
      if (!isConnected) {
        logger.warn('浏览器连接已断开')
        return false
      }

      // 检查页面是否响应
      await this.page.evaluate('() => document.readyState')

      return true
    } catch (error) {
      logger.error('浏览器健康检查失败', error)
      return false
    }
  }

  /**
   * 导航到指定URL
   */
  async navigateTo(
    url: string,
    options?: { waitUntil?: 'load' | 'domcontentloaded' | 'networkidle'; timeout?: number }
  ): Promise<void> {
    const page = this.getPage()

    const waitUntil = options?.waitUntil || 'domcontentloaded'
    const timeout = options?.timeout || 90000

    logger.info(`导航到: ${url}`)
    await page.goto(url, { waitUntil, timeout })

    // 等待页面稳定
    await this.waitForPageStability()
  }

  /**
   * 等待页面稳定
   */
  async waitForPageStability(timeout = 30000): Promise<void> {
    const page = this.getPage()

    const startTime = Date.now()
    let lastNetworkIdleTime = 0
    let lastDomStableTime = 0

    while (Date.now() - startTime < timeout) {
      // 检查网络空闲
      const networkIdle = await page.evaluate(() => {
        return window.performance
          .getEntriesByType('resource')
          .every((r) => (r as PerformanceResourceTiming).responseEnd < Date.now() - 1000)
      })

      if (networkIdle) {
        if (lastNetworkIdleTime === 0) {
          lastNetworkIdleTime = Date.now()
        } else if (Date.now() - lastNetworkIdleTime > 2000) {
          logger.debug('网络空闲状态稳定')
          break
        }
      } else {
        lastNetworkIdleTime = 0
      }

      // 检查DOM稳定
      const domStable = await page.evaluate(() => {
        return (
          document.readyState === 'complete' &&
          document.querySelectorAll('[aria-busy="true"], [data-loading="true"]').length === 0
        )
      })

      if (domStable) {
        if (lastDomStableTime === 0) {
          lastDomStableTime = Date.now()
        } else if (Date.now() - lastDomStableTime > 2000) {
          logger.debug('DOM状态稳定')
          break
        }
      } else {
        lastDomStableTime = 0
      }

      await page.waitForTimeout(500)
    }
  }

  /**
   * 检查验证码
   */
  async checkForCaptcha(): Promise<boolean> {
    const page = this.getPage()

    try {
      const captchaSelectors = [
        'iframe[src*="captcha"]',
        '.nc_wrapper',
        '[class*="captcha"]',
        '[class*="verify"]',
        '[class*="security"]',
        'div#nc'
      ]

      for (const selector of captchaSelectors) {
        if (await page.$(selector)) {
          logger.warn(`检测到验证码元素: ${selector}`)
          return true
        }
      }

      // 检查验证码文本
      const captchaText = await page.evaluate(() => {
        return (
          document.body.textContent?.includes('captcha') ||
          document.body.textContent?.includes('verification')
        )
      })

      return captchaText || false
    } catch (error) {
      logger.warn('验证码检查失败', error)
      return false
    }
  }

  /**
   * 检查登录重定向
   */
  async checkForLoginRedirect(): Promise<boolean> {
    const page = this.getPage()

    const currentUrl = page.url()
    const loginKeywords = ['login', 'signin', 'log_in', 'sign_in', 'auth', 'authentication']

    if (loginKeywords.some((keyword) => currentUrl.includes(keyword))) {
      logger.warn('检测到登录重定向')
      return true
    }

    // 检查登录表单元素
    const loginFormExists = await page
      .$$('input[type="password"], [id*="login"], [id*="signin"]')
      .then((elements) => elements.length > 0)
    if (loginFormExists) {
      logger.warn('检测到登录表单')
      return true
    }

    return false
  }

  /**
   * 安全的文本提取
   */
  async extractTextSafe(element: Locator, selectors: string[], timeout = 3000): Promise<string> {
    for (const selector of selectors) {
      try {
        const target = element.locator(selector).first()
        const isVisible = await target.isVisible({ timeout: 1000 })
        if (!isVisible) continue

        const text = await target.textContent({ timeout })
        if (text && text.trim()) {
          return text.trim()
        }
      } catch (error) {
        // 继续尝试下一个选择器
      }
    }
    return ''
  }

  /**
   * 安全的属性提取
   */
  async extractAttributeSafe(
    element: Locator,
    selectors: string[],
    attribute: string,
    timeout = 3000
  ): Promise<string> {
    for (const selector of selectors) {
      try {
        const target = element.locator(selector).first()
        const isVisible = await target.isVisible({ timeout: 1000 })
        if (!isVisible) continue

        const value = await target.getAttribute(attribute, { timeout })
        if (value && value.trim()) {
          return value.trim()
        }
      } catch (error) {
        // 继续尝试下一个选择器
      }
    }
    return ''
  }

  /**
   * 检查服务是否活动
   */
  isActive(): boolean {
    return this.isActive
  }
}
