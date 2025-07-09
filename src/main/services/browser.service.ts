import { chromium, Browser, BrowserContext, Page } from 'playwright-core'
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
  private readonly executablePath: string | undefined

  // 提取为常量提高可读性
  private static readonly DEFAULT_USER_AGENT =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  private static readonly LAUNCH_ARGS = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-web-security',
    '--disable-features=VizDisplayCompositor',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-blink-features=AutomationControlled',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--disable-plugins',
    '--disable-default-apps'
  ]

  /**
   * 构造函数
   * @param config {Partial<BrowserConfig>}
   * @description 创建浏览器服务实例
   */
  constructor(config?: Partial<BrowserConfig>) {
    this.config = {
      headless: false,
      userAgent: BrowserService.DEFAULT_USER_AGENT,
      viewport: { width: 1280, height: 800 },
      timeout: 60000,
      ...config
    }

    if (!this.config.executablePath) {
      this.executablePath = this.getChromiumExecutablePath()
    }
  }

  private getChromiumExecutablePath(): string | undefined {
    try {
      if (process.env.NODE_ENV === 'development') return undefined

      const userDataPath = app.getPath('userData')
      const platform = process.platform

      let executableName: string
      let chromiumDir: string

      switch (platform) {
        case 'win32':
          chromiumDir = path.join(userDataPath, 'chromium', 'chrome-win')
          executableName = 'chrome.exe'
          break
        case 'darwin':
          chromiumDir = path.join(userDataPath, 'chromium', 'chrome-mac')
          executableName = 'chrome'
          break
        default: // linux
          chromiumDir = path.join(userDataPath, 'chromium', 'chrome-linux')
          executableName = 'chrome'
      }

      return path.join(chromiumDir, executableName)
    } catch (error) {
      logger.warn('无法获取 Chromium 路径，使用默认配置', error)
      return undefined
    }
  }

  private async optimizePagePerformance(page: Page): Promise<void> {
    try {
      // 禁用动画和自动播放
      await page.addInitScript(() => {
        Object.defineProperty(window, 'requestAnimationFrame', {
          value: (callback: FrameRequestCallback) => setTimeout(callback, 16)
        })

        Object.defineProperty(HTMLMediaElement.prototype, 'autoplay', {
          set: () => {}
        })
      })

      // 优化资源拦截逻辑
      const blockedDomains = ['google-analytics', 'googletagmanager', 'facebook.com', 'doubleclick']

      await page.route('**/*', (route) => {
        const url = route.request().url()
        if (blockedDomains.some((domain) => url.includes(domain))) {
          route.abort()
        } else {
          route.continue()
        }
      })
    } catch (error) {
      logger.warn('设置页面性能优化失败:', error)
    }
  }

  private async closePageAndContext(): Promise<void> {
    if (this.page) {
      try {
        await this.page.close()
        logger.info('页面已关闭')
      } catch (error) {
        logger.warn('关闭页面失败:', error)
      } finally {
        this.page = null
      }
    }

    if (this.context) {
      try {
        await this.context.close()
        logger.info('浏览器上下文已关闭')
      } catch (error) {
        logger.warn('关闭上下文失败:', error)
      } finally {
        this.context = null
      }
    }
  }

  async initBrowser(): Promise<Page> {
    try {
      await this.closePageAndContext()

      // 创建浏览器实例（如果不存在）
      if (!this.browser || !this.browser.isConnected()) {
        this.browser = await chromium.launch({
          headless: this.config.headless,
          executablePath: this.executablePath,
          args: BrowserService.LAUNCH_ARGS,
          timeout: 30_000
        })
        logger.info('Chromium 浏览器启动成功')
      }

      // 创建新上下文
      this.context = await this.browser.newContext({
        viewport: this.config.viewport,
        userAgent: this.config.userAgent,
        extraHTTPHeaders: {
          'Accept-Language': 'en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7',
          'Accept-Encoding': 'gzip, deflate, br',
          Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8'
        },
        ignoreHTTPSErrors: true,
        javaScriptEnabled: true
      })

      // 创建新页面
      this.page = await this.context.newPage()
      await this.optimizePagePerformance(this.page)
      logger.info('页面创建成功')

      return this.page
    } catch (error) {
      logger.error('初始化浏览器失败:', error)
      throw new Error(`浏览器初始化失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  async closeBrowser(): Promise<void> {
    try {
      await this.closePageAndContext()

      if (this.browser?.isConnected()) {
        await this.browser.close()
        this.browser = null
        logger.info('浏览器已关闭')
      }
    } catch (error) {
      logger.error('关闭浏览器失败:', error)
    }
  }

  async checkBrowserHealth(): Promise<boolean> {
    try {
      if (!this.browser?.isConnected()) return false
      if (!this.context || !this.page) return false

      // 检查页面响应性
      await this.page.evaluate('() => true')
      return true
    } catch (error) {
      logger.error('浏览器健康检查失败:', error)
      return false
    }
  }

  async resetBrowserSession(): Promise<void> {
    logger.info('重置浏览器会话...')
    await this.closeBrowser()
    await this.initBrowser()
  }

  async navigateTo(
    url: string,
    options: {
      waitUntil?: 'load' | 'domcontentloaded' | 'networkidle' | 'commit'
      timeout?: number
    } = {}
  ): Promise<void> {
    try {
      const page = this.getPage()
      const { waitUntil = 'domcontentloaded', timeout = 90000 } = options

      logger.info(`导航到: ${url}`)
      await page.goto(url, { waitUntil, timeout })
      await this.waitForPageStability()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      logger.error(`导航到页面失败: ${message}`)
      throw new Error(`导航失败: ${message}`)
    }
  }

  async waitForPageStability(timeout = 30000): Promise<void> {
    const page = this.getPage()
    const startTime = Date.now()
    let lastStableTime = 0
    const STABILITY_THRESHOLD = 2000 // 2秒稳定期

    while (Date.now() - startTime < timeout) {
      const [isNetworkIdle, isDomStable] = await Promise.all([
        page.evaluate(() => {
          return performance
            .getEntriesByType('resource')
            .every((r) => (r as PerformanceResourceTiming).responseEnd < Date.now() - 1000)
        }),
        page.evaluate(() => {
          return (
            document.readyState === 'complete' &&
            !document.querySelector('[aria-busy="true"], [data-loading="true"]')
          )
        })
      ])

      if (isNetworkIdle && isDomStable) {
        if (lastStableTime === 0) {
          lastStableTime = Date.now()
        } else if (Date.now() - lastStableTime > STABILITY_THRESHOLD) {
          logger.debug('页面已稳定')
          return
        }
      } else {
        lastStableTime = 0
      }

      await page.waitForTimeout(500)
    }

    logger.warn(`等待页面稳定超时 (${timeout}ms)`)
  }

  getPage(): Page {
    if (!this.page) {
      throw new Error('页面未初始化')
    }
    return this.page
  }
}
