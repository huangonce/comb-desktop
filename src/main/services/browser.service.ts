import { chromium, Browser, BrowserContext, Page } from 'playwright-core'
import path from 'path'
import os from 'os'
import { app } from 'electron'
import { logger } from './logger.service'

// 浏览器配置接口
export interface BrowserConfig {
  headless: boolean
  executablePath?: string
  userAgent: string
  viewport: { width: number; height: number }
  timeout: number
  maxRetries?: number
  retryDelay?: number
}

// 导航选项接口
export interface NavigationOptions {
  waitUntil?: 'load' | 'domcontentloaded' | 'networkidle' | 'commit'
  timeout?: number
  retries?: number
}

// 浏览器状态枚举
export enum BrowserState {
  UNINITIALIZED = 'uninitialized',
  INITIALIZING = 'initializing',
  READY = 'ready',
  ERROR = 'error',
  CLOSED = 'closed'
}

// 自定义错误类
export class BrowserError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly cause?: Error
  ) {
    super(message)
    this.name = 'BrowserError'
  }
}

export class BrowserService {
  private browser: Browser | null = null
  private context: BrowserContext | null = null
  private activePage: Page | null = null
  private config: BrowserConfig
  private resolvedExecutablePath: string | undefined
  private state: BrowserState = BrowserState.UNINITIALIZED
  private initPromise: Promise<void> | null = null
  private healthCheckInterval: NodeJS.Timeout | null = null

  // 常量定义
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
    '--disable-default-apps',
    '--disable-gpu',
    '--disable-software-rasterizer',
    '--disable-background-media-suspend',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-features=TranslateUI',
    '--disable-ipc-flooding-protection'
  ] as const

  private static readonly BLOCKED_DOMAINS = [
    'google-analytics',
    'googletagmanager',
    'facebook.com',
    'doubleclick',
    'googlesyndication',
    'adsystem',
    'amazon-adsystem',
    'scorecardresearch',
    'outbrain',
    'taboola'
  ] as const

  private static readonly DEFAULT_CONFIG: BrowserConfig = {
    headless: process.env.NODE_ENV !== 'development',
    userAgent: BrowserService.DEFAULT_USER_AGENT,
    viewport: { width: 1920, height: 1080 },
    timeout: 60000,
    maxRetries: 3,
    retryDelay: 2000
  }

  /**
   * 构造函数
   */
  constructor(config?: Partial<BrowserConfig>) {
    this.config = {
      ...BrowserService.DEFAULT_CONFIG,
      ...config
    }

    // 开发环境强制非无头模式
    if (process.env.NODE_ENV === 'development') {
      this.config.headless = false
    }

    // 绑定方法以确保正确的this上下文
    this.handleBrowserDisconnect = this.handleBrowserDisconnect.bind(this)
    this.handlePageError = this.handlePageError.bind(this)
    this.handlePageCrash = this.handlePageCrash.bind(this)
  }

  /**
   * 获取浏览器状态
   */
  public getState(): BrowserState {
    return this.state
  }

  /**
   * 检查浏览器是否已准备就绪
   */
  public isReady(): boolean {
    return this.state === BrowserState.READY && this.browser?.isConnected() === true
  }

  /**
   * 初始化浏览器实例 - 支持并发调用
   */
  public async initialize(): Promise<void> {
    // 如果已经初始化或正在初始化，返回现有的Promise

    console.log('检查浏览器状态:', this.state)
    if (this.state === BrowserState.READY) {
      return
    }

    if (this.initPromise) {
      return this.initPromise
    }

    this.initPromise = this.doInitialize()
    return this.initPromise
  }

  /**
   * 检查浏览器健康状态
   */
  public async checkHealth(): Promise<boolean> {
    try {
      if (!this.browser?.isConnected() || !this.context || !this.activePage) {
        return false
      }

      // 执行简单的JavaScript来测试页面响应
      await this.activePage.evaluate(() => document.readyState)
      return true
    } catch (error) {
      logger.debug('健康检查失败:', error)
      return false
    }
  }

  /**
   * 导航到指定URL - 带重试机制
   */
  public async navigateToUrl(url: string, options: NavigationOptions = {}): Promise<void> {
    const {
      waitUntil = 'domcontentloaded',
      timeout = this.config.timeout,
      retries = this.config.maxRetries || 3
    } = options

    let lastError: Error | null = null

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        await this.ensureReady()
        const page = this.getActivePage()

        logger.info(`导航至 (尝试 ${attempt}/${retries}): ${url}`)

        await page.goto(url, { waitUntil, timeout })
        logger.debug(`导航成功: ${url}`)
        return
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))
        logger.warn(`导航失败 (尝试 ${attempt}/${retries}): ${lastError.message}`)

        if (attempt < retries) {
          const delay = (this.config.retryDelay || 2000) * attempt
          logger.info(`等待 ${delay}ms 后重试`)
          await this.sleep(delay)

          // 检查是否需要重新初始化
          if (!(await this.checkHealth())) {
            await this.initialize()
          }
        }
      }
    }

    throw new BrowserError(
      `导航失败，已重试 ${retries} 次: ${url}`,
      'NAVIGATION_FAILED',
      lastError || undefined
    )
  }

  /**
   * 等待页面稳定状态
   */
  public async waitForStableState(timeout: number = 30_000): Promise<void> {
    const STABILITY_THRESHOLD = 1000
    const POLL_INTERVAL = 300

    const page = this.getActivePage()
    const startTime = Date.now()
    let stableStart = 0

    while (Date.now() - startTime < timeout) {
      try {
        const isStable = await page.evaluate(() => {
          // 检查DOM是否完成加载
          if (document.readyState !== 'complete') return false

          // 检查是否有加载指示器
          const loadingElements = document.querySelectorAll(
            '[aria-busy="true"], [data-loading="true"], .loading, .spinner'
          )
          if (loadingElements.length > 0) return false

          // 检查网络请求是否完成
          const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[]
          const recentRequests = resources.filter((r) => r.responseEnd > performance.now() - 800)

          return recentRequests.length === 0
        })

        if (isStable) {
          if (stableStart === 0) {
            stableStart = Date.now()
          } else if (Date.now() - stableStart > STABILITY_THRESHOLD) {
            logger.debug('页面已达稳定状态')
            return
          }
        } else {
          stableStart = 0
        }

        await this.sleep(POLL_INTERVAL)
      } catch (error) {
        logger.warn('稳定性检查异常:', error)
        stableStart = 0
        await this.sleep(POLL_INTERVAL)
      }
    }

    logger.warn(`页面稳定状态检测超时 (${timeout}ms)`)
  }

  /**
   * 获取当前活动页面
   */
  public getActivePage(): Page {
    if (!this.activePage) {
      throw new BrowserError('页面未初始化', 'PAGE_NOT_INITIALIZED')
    }
    return this.activePage
  }

  /**
   * 创建额外页面（供外部使用）
   */
  public async createAdditionalPage(): Promise<Page> {
    await this.ensureReady()

    if (!this.context) {
      throw new BrowserError('浏览器上下文未创建', 'CONTEXT_NOT_CREATED')
    }

    const newPage = await this.context.newPage()
    await this.setupPageOptimizations(newPage)

    logger.info('额外页面已创建')
    return newPage
  }

  /**
   * 关闭浏览器服务
   */
  public async terminate(): Promise<void> {
    logger.info('正在关闭浏览器服务')

    // 增加事件监听器清理
    this.browser?.off('disconnected', this.handleBrowserDisconnect)
    this.activePage?.off('crash', this.handlePageCrash)

    this.state = BrowserState.CLOSED
    this.initPromise = null

    await this.cleanup()

    logger.info('浏览器服务已关闭')
  }

  /**
   * 重置浏览器会话
   */
  public async reset(): Promise<void> {
    logger.info('重置浏览器会话')
    this.initPromise = null
    await this.initialize()
  }

  /**
   * 获取配置信息
   */
  public getConfig(): Readonly<BrowserConfig> {
    return { ...this.config }
  }

  /**
   * 更新配置
   */
  public updateConfig(newConfig: Partial<BrowserConfig>): void {
    // 增加运行时生效逻辑
    if (newConfig.viewport && this.activePage) {
      this.activePage.setViewportSize(newConfig.viewport)
    }

    this.config = { ...this.config, ...newConfig }
  }

  /**
   * 销毁实例 - 清理所有资源
   */
  public async destroy(): Promise<void> {
    await this.terminate()
  }

  /**
   * 实际的初始化逻辑
   */
  private async doInitialize(): Promise<void> {
    try {
      this.state = BrowserState.INITIALIZING
      logger.info('开始初始化浏览器服务')

      // 清理现有会话
      await this.cleanup()

      // 解析可执行路径
      this.resolvedExecutablePath = await this.resolveChromiumPath()

      // 启动浏览器
      await this.launchBrowser()

      // 创建上下文和页面
      await this.createContext()
      await this.createMainPage()

      // 设置事件监听
      this.setupEventListeners()

      // 启动健康检查
      this.startHealthCheck()

      this.state = BrowserState.READY
      logger.info('浏览器服务初始化成功')
    } catch (error) {
      this.state = BrowserState.ERROR
      this.initPromise = null

      const browserError = new BrowserError(
        '浏览器初始化失败',
        'INIT_FAILED',
        error instanceof Error ? error : new Error(String(error))
      )

      logger.error('浏览器初始化失败:', browserError)
      throw browserError
    }
  }

  /**
   * 启动浏览器实例
   */
  private async launchBrowser(): Promise<void> {
    const launchOptions = {
      headless: this.config.headless,
      executablePath: this.resolvedExecutablePath,
      args: [...BrowserService.LAUNCH_ARGS],
      timeout: 30_000,
      slowMo: process.env.NODE_ENV === 'development' ? 100 : 0
    }

    this.browser = await chromium.launch(launchOptions)
    logger.info('Chromium浏览器已启动')
  }

  /**
   * 创建浏览器上下文
   */
  private async createContext(): Promise<void> {
    if (!this.browser) {
      throw new BrowserError('浏览器未初始化', 'BROWSER_NOT_INITIALIZED')
    }

    this.context = await this.browser.newContext({
      viewport: this.config.viewport,
      userAgent: this.config.userAgent,
      extraHTTPHeaders: {
        'Accept-Language': 'en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br',
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache'
      },
      ignoreHTTPSErrors: true,
      javaScriptEnabled: true,
      bypassCSP: true,
      permissions: ['geolocation', 'notifications']
    })

    logger.info('浏览器上下文已创建')
  }

  /**
   * 创建页面
   */
  private async createMainPage(): Promise<void> {
    if (!this.context) {
      throw new BrowserError('浏览器上下文未创建', 'CONTEXT_NOT_CREATED')
    }

    this.activePage = await this.context.newPage()
    await this.setupPageOptimizations(this.activePage)
    logger.info('新页面已创建')
  }

  /**
   * 设置页面优化
   */
  private async setupPageOptimizations(page: Page): Promise<void> {
    try {
      // 设置默认超时
      page.setDefaultTimeout(this.config.timeout)
      page.setDefaultNavigationTimeout(this.config.timeout)

      // 添加初始化脚本
      await page.addInitScript(() => {
        // 隐藏webdriver痕迹
        Object.defineProperty(navigator, 'webdriver', {
          get: () => undefined
        })

        // 伪造插件
        Object.defineProperty(navigator, 'plugins', {
          get: () => [1, 2, 3, 4, 5]
        })

        // 伪造语言
        Object.defineProperty(navigator, 'languages', {
          get: () => ['en-US', 'en', 'zh-CN', 'zh']
        })

        // 禁用动画
        Object.defineProperty(window, 'requestAnimationFrame', {
          value: (callback: FrameRequestCallback) => setTimeout(callback, 16)
        })

        // 禁用自动播放
        Object.defineProperty(HTMLMediaElement.prototype, 'autoplay', {
          set: () => {}
        })
      })

      // 设置请求拦截
      await page.route('**/*', (route) => {
        const url = route.request().url()
        const resourceType = route.request().resourceType()

        // 阻止不必要的资源
        if (this.shouldBlockResource(url, resourceType)) {
          return route.abort()
        }

        return route.continue()
      })

      logger.debug('页面优化设置完成')
    } catch (error) {
      logger.warn('页面优化设置失败:', error)
    }
  }

  /**
   * 判断是否应该阻止资源
   */
  private shouldBlockResource(url: string, resourceType: string): boolean {
    const blockedTypes = ['image', 'font', 'media'] // 可配置
    return (
      BrowserService.BLOCKED_DOMAINS.some((d) => url.includes(d)) ||
      blockedTypes.includes(resourceType)
    )
  }

  /**
   * 设置事件监听器
   */
  private setupEventListeners(): void {
    if (this.browser) {
      this.browser.on('disconnected', this.handleBrowserDisconnect)
    }

    if (this.activePage) {
      this.activePage.on('pageerror', this.handlePageError)
      this.activePage.on('crash', this.handlePageCrash)
    }
  }

  /**
   * 处理浏览器断开连接
   */
  private async handleBrowserDisconnect(): Promise<void> {
    logger.warn('浏览器连接断开')
    this.state = BrowserState.ERROR
    this.stopHealthCheck()

    // 尝试重新连接
    try {
      await this.initialize()
    } catch (error) {
      logger.error('浏览器重连失败:', error)
    }
  }

  /**
   * 处理页面错误
   */
  private handlePageError(error: Error): void {
    logger.error('页面错误:', error)
  }

  /**
   * 处理页面崩溃
   */
  private async handlePageCrash(): Promise<void> {
    try {
      // 增加页面恢复状态验证
      if (this.activePage?.isClosed()) {
        await this.createMainPage()
        await this.activePage.goto('about:blank') // 重置页面状态
      }
    } catch (error) {
      logger.error('页面崩溃恢复失败:', error)
      // 增加级联恢复
      await this.reset()
    }
  }

  /**
   * 启动健康检查
   */
  private startHealthCheck(): void {
    this.healthCheckInterval = setInterval(async () => {
      const isHealthy = await this.checkHealth()
      if (!isHealthy && this.state === BrowserState.READY) {
        logger.warn('健康检查失败，尝试重新初始化')
        await this.initialize()
      }
    }, 30000) // 每30秒检查一次
  }

  /**
   * 停止健康检查
   */
  private stopHealthCheck(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval)
      this.healthCheckInterval = null
    }
  }

  /**
   * 获取Chromium可执行路径
   */
  private async resolveChromiumPath(): Promise<string | undefined> {
    try {
      if (process.env.NODE_ENV === 'development') {
        return undefined
      }

      const userDataPath = process.versions.electron ? app.getPath('userData') : os.homedir()
      const platform = process.platform

      const platformPaths: Record<string, [string, string]> = {
        win32: [path.join(userDataPath, 'chromium', 'chrome-win'), 'chrome.exe'],
        darwin: [
          path.join(userDataPath, 'chromium', 'chrome-mac'),
          'Chromium.app/Contents/MacOS/Chromium'
        ],
        linux: [path.join(userDataPath, 'chromium', 'chrome-linux'), 'chrome']
      }

      const [baseDir, executable] = platformPaths[platform] || platformPaths.linux
      const executablePath = path.join(baseDir, executable)

      // 检查文件是否存在
      try {
        const fs = await import('fs/promises')
        await fs.access(executablePath)
        return executablePath
      } catch {
        logger.warn(`Chromium可执行文件不存在: ${executablePath}`)
        return undefined
      }
    } catch (error) {
      logger.warn('解析Chromium路径失败:', error)
      return undefined
    }
  }

  /**
   * 确保浏览器处于准备状态
   */
  private async ensureReady(): Promise<void> {
    if (!this.isReady()) {
      await this.initialize()
    }
  }

  /**
   * 清理资源
   */
  private async cleanup(): Promise<void> {
    logger.debug('开始清理浏览器资源')

    this.stopHealthCheck()

    const cleanupTasks: Promise<void>[] = []

    if (this.activePage) {
      cleanupTasks.push(
        this.activePage
          .close()
          .catch((error) => logger.warn('关闭页面失败:', error))
          .then(() => {
            this.activePage = null
          })
      )
    }

    if (this.context) {
      cleanupTasks.push(
        this.context
          .close()
          .catch((error) => logger.warn('关闭上下文失败:', error))
          .then(() => {
            this.context = null
          })
      )
    }

    if (this.browser) {
      cleanupTasks.push(
        this.browser
          .close()
          .catch((error) => logger.warn('关闭浏览器失败:', error))
          .then(() => {
            this.browser = null
          })
      )
    }

    await Promise.all(cleanupTasks)
    logger.debug('浏览器资源清理完成')
  }

  /**
   * 工具方法：延迟执行
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}
