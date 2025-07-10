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
  private activePage: Page | null = null
  private config: BrowserConfig
  private resolvedExecutablePath: string | undefined

  // 提取为常量提高可读性
  private static readonly DEFAULT_USER_AGENT =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

  // 添加启动参数注释说明
  private static readonly LAUNCH_ARGS = [
    '--no-sandbox', // 禁用沙箱
    '--disable-setuid-sandbox', // 禁用setuid沙箱
    '--disable-dev-shm-usage', // 解决/dev/shm内存问题
    '--disable-web-security', // 禁用同源策略
    '--disable-features=VizDisplayCompositor', // 禁用合成器特性
    '--disable-background-timer-throttling', // 禁用后台计时器节流
    '--disable-backgrounding-occluded-windows', // 禁用后台窗口管理
    '--disable-renderer-backgrounding', // 禁用渲染器后台化
    '--disable-blink-features=AutomationControlled', // 隐藏自动化痕迹
    '--no-first-run', // 跳过首次运行
    '--no-default-browser-check', // 禁用默认浏览器检查
    '--disable-extensions', // 禁用扩展
    '--disable-plugins', // 禁用插件
    '--disable-default-apps' // 禁用默认应用
  ]

  // 预定义需要拦截的域名
  private static readonly BLOCKED_DOMAINS = [
    'google-analytics',
    'googletagmanager',
    'facebook.com',
    'doubleclick'
  ]

  /**
   * 构造函数
   * @param config {Partial<BrowserConfig>}
   * @description 创建浏览器服务实例
   */
  constructor(config?: Partial<BrowserConfig>) {
    const isDev = process.env.NODE_ENV === 'development'

    this.config = {
      headless: !isDev, // 开发环境默认非无头模式
      userAgent: BrowserService.DEFAULT_USER_AGENT,
      viewport: { width: 1920, height: 1080 },
      timeout: 60000,
      ...config
    }

    // 开发环境强制非无头模式
    if (isDev) {
      this.config.headless = false
    }
  }

  /**
   * 获取Chromium可执行路径
   * @returns {string|undefined} 可执行文件路径或undefined
   */
  private resolveChromiumPath(): string | undefined {
    try {
      if (process.env.NODE_ENV === 'development') return undefined

      const userDataPath = app.getPath('userData')
      const platform = process.platform

      // 根据平台确定路径
      const platformPaths: Record<string, [string, string]> = {
        win32: [path.join(userDataPath, 'chromium', 'chrome-win'), 'chrome.exe'],
        darwin: [path.join(userDataPath, 'chromium', 'chrome-mac'), 'chrome'],
        linux: [path.join(userDataPath, 'chromium', 'chrome-linux'), 'chrome']
      }

      const [baseDir, executable] = platformPaths[platform] || platformPaths.linux
      return path.join(baseDir, executable)
    } catch (error) {
      logger.warn('无法获取Chromium路径，使用默认配置', error)
      return undefined
    }
  }

  /**
   * 优化页面性能设置
   * @param page {Page} 页面实例
   */
  private async setupPerformanceOptimizations(page: Page): Promise<void> {
    try {
      // 单次执行脚本优化
      await page.addInitScript(() => {
        // 禁用动画
        Object.defineProperty(window, 'requestAnimationFrame', {
          value: (callback: FrameRequestCallback) => setTimeout(callback, 16)
        })

        // 禁用自动播放
        Object.defineProperty(HTMLMediaElement.prototype, 'autoplay', {
          set: () => {}
        })
      })

      // 路由拦截优化
      await page.route('**/*', (route) => {
        const url = route.request().url()
        const shouldBlock = BrowserService.BLOCKED_DOMAINS.some((domain) => url.includes(domain))
        return shouldBlock ? route.abort() : route.continue()
      })
    } catch (error) {
      logger.warn('性能优化设置失败:', error)
    }
  }

  /**
   * 清理当前页面和上下文
   */
  private async cleanupSession(): Promise<void> {
    const cleanupTasks: Promise<void>[] = []

    if (this.activePage) {
      cleanupTasks.push(
        (async () => {
          try {
            await this.activePage!.close()
            logger.info('页面已关闭')
          } catch (error) {
            logger.warn('关闭页面失败:', error)
          } finally {
            this.activePage = null
          }
        })()
      )
    }

    if (this.context) {
      cleanupTasks.push(
        (async () => {
          try {
            await this.context!.close()
            logger.info('浏览器上下文已关闭')
          } catch (error) {
            logger.warn('关闭上下文失败:', error)
          } finally {
            this.context = null
          }
        })()
      )
    }

    await Promise.all(cleanupTasks)
  }

  /**
   * 初始化浏览器实例
   * @returns {Promise<Page>} 初始化后的页面
   */
  async launchBrowser(): Promise<Page> {
    try {
      await this.cleanupSession()

      // 按需解析可执行路径
      if (!this.resolvedExecutablePath) {
        this.resolvedExecutablePath = this.resolveChromiumPath()
      }

      // 创建或复用浏览器实例
      if (!this.browser?.isConnected()) {
        this.browser = await chromium.launch({
          headless: this.config.headless,
          executablePath: this.resolvedExecutablePath,
          args: BrowserService.LAUNCH_ARGS,
          timeout: 30_000
        })
        logger.info('Chromium浏览器已启动')
      }

      // 创建浏览器上下文
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
      this.activePage = await this.context.newPage()
      await this.setupPerformanceOptimizations(this.activePage)
      logger.info('新页面已创建')

      return this.activePage
    } catch (error) {
      logger.error('浏览器初始化失败:', error)
      throw new Error(`浏览器启动失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * 关闭浏览器实例
   */
  async terminateBrowser(): Promise<void> {
    try {
      await this.cleanupSession()

      if (this.browser?.isConnected()) {
        await this.browser.close()
        this.browser = null
        logger.info('浏览器已终止')
      }
    } catch (error) {
      logger.error('终止浏览器失败:', error)
    }
  }

  /**
   * 检查浏览器健康状态
   * @returns {Promise<boolean>} 是否健康
   */
  async checkHealthStatus(): Promise<boolean> {
    try {
      const isConnected = this.browser?.isConnected() ?? false
      if (!isConnected || !this.context || !this.activePage) return false

      // 简单的心跳检测
      await this.activePage.evaluate(() => true)
      return true
    } catch (error) {
      logger.error('健康检查失败:', error)
      return false
    }
  }

  /**
   * 重置浏览器会话
   */
  async resetSession(): Promise<void> {
    logger.info('重置浏览器会话...')
    await this.terminateBrowser()
    await this.launchBrowser()
  }

  /**
   * 导航到指定URL
   * @param url {string} 目标URL
   * @param options 导航选项
   */
  async navigateToUrl(
    url: string,
    options: {
      waitUntil?: 'load' | 'domcontentloaded' | 'networkidle' | 'commit'
      timeout?: number
    } = {}
  ): Promise<void> {
    try {
      const page = this.getActivePage()
      const { waitUntil = 'domcontentloaded', timeout = 90_000 } = options

      logger.info(`导航至: ${url}`)
      await page.goto(url, { waitUntil, timeout })
      await this.optimizedWaitForStableState()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      logger.error(`导航失败: ${message}`)
      throw new Error(`导航错误: ${message}`)
    }
  }

  /**
   * 高效等待页面稳定状态
   * @param timeout 超时时间(毫秒) - 默认30秒
   */
  async optimizedWaitForStableState(timeout: number = 30_000): Promise<void> {
    const STABILITY_THRESHOLD = 1000
    const POLL_INTERVAL = 300
    const RESOURCE_QUIET_PERIOD = 800

    const page = this.getActivePage()
    const startTime = Date.now()
    let stableStart = 0

    while (Date.now() - startTime < timeout) {
      try {
        const [networkIdle, domStable] = await Promise.all([
          page.evaluate((quietPeriod: number) => {
            const resources = performance.getEntriesByType(
              'resource'
            ) as PerformanceResourceTiming[]
            return !resources.some((r) => r.responseEnd > performance.now() - quietPeriod)
          }, RESOURCE_QUIET_PERIOD),

          page.evaluate(() => {
            if (document.readyState !== 'complete') return false
            return !document.querySelector('[aria-busy="true"], [data-loading="true"]')
          })
        ])

        if (networkIdle && domStable) {
          const now = Date.now()
          if (stableStart === 0) {
            stableStart = now
          } else if (now - stableStart > STABILITY_THRESHOLD) {
            logger.debug('页面已达稳定状态')
            return
          }
        } else {
          stableStart = 0
        }
      } catch (error) {
        logger.warn(`稳定性检查异常: ${error instanceof Error ? error.message : String(error)}`)
        stableStart = 0
      }

      // 动态调整等待时间
      const remaining = timeout - (Date.now() - startTime)
      if (remaining <= 0) break

      await page.waitForTimeout(Math.min(POLL_INTERVAL, remaining))
    }

    logger.warn(`页面稳定状态检测超时 (${timeout}ms)`)
  }

  /**
   * 获取当前活动页面
   * @returns {Page} 页面实例
   */
  getActivePage(): Page {
    if (!this.activePage) {
      throw new Error('页面未初始化，请先启动浏览器')
    }
    return this.activePage
  }
}
