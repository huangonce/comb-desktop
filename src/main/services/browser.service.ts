import { chromium, Browser, BrowserContext, Page } from 'playwright-core'
import path from 'path'
import os from 'os'
import { app } from 'electron'
import { logger } from './logger.service'

export type LoadState = 'load' | 'domcontentloaded' | 'networkidle' | 'commit'
// Playwright资源类型定义
export type ResourceType =
  | 'document'
  | 'stylesheet'
  | 'image'
  | 'media'
  | 'font'
  | 'script'
  | 'texttrack'
  | 'xhr'
  | 'fetch'
  | 'eventsource'
  | 'websocket'
  | 'manifest'
  | 'other'

// 浏览器配置接口
export interface BrowserConfig {
  headless: boolean
  executablePath?: string
  userAgent: string
  viewport: { width: number; height: number }
  timeout: number
  maxRetries?: number
  retryDelay?: number
  blockedDomains?: string[]
  blockedResourceTypes?: ResourceType[]
}

// 导航选项接口
export interface NavigationOptions {
  waitUntil?: LoadState
  timeout?: number
  retries?: number
}

// 页面创建选项
export interface PageOptions {
  contextId?: string
  setActive?: boolean
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

// 页面元数据
interface PageMeta {
  id: string
  contextId: string
  createdAt: Date
  lastUsed: Date
}

export class BrowserService {
  private browser: Browser | null = null // Playwright浏览器实例
  private contexts: Map<string, BrowserContext> = new Map() // 浏览器上下文映射
  private pages: Map<string, Page> = new Map() // 页面ID到Page对象的映射
  private pageMeta: Map<string, PageMeta> = new Map() // 页面元数据映射
  private activePageId: string | null = null // 当前活动页面ID
  private config: BrowserConfig // 浏览器配置
  private resolvedExecutablePath: string | undefined // 解析后的可执行文件路径
  private state: BrowserState = BrowserState.UNINITIALIZED // 浏览器状态
  private initPromise: Promise<void> | null = null // 初始化Promise
  private healthCheckInterval: NodeJS.Timeout | null = null // 健康检查定时器
  private idleCleanupTimeout: NodeJS.Timeout | null = null // 空闲清理定时器
  // private lastActivity: number = Date.now() // 最后活动时间（暂未使用）

  // 常量定义
  private static readonly DEFAULT_USER_AGENT =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

  private static readonly IDLE_CLEANUP_DELAY = 5 * 60 * 1000 // 5分钟空闲后清理
  private static readonly HEALTH_CHECK_INTERVAL = 30 * 1000 // 30秒健康检查间隔

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

  private static readonly DEFAULT_BLOCKED_DOMAINS = [
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
  ]

  private static readonly DEFAULT_CONFIG: BrowserConfig = {
    headless: process.env.NODE_ENV !== 'development',
    userAgent: BrowserService.DEFAULT_USER_AGENT,
    viewport: { width: 1920, height: 1080 },
    timeout: 60000,
    maxRetries: 3,
    retryDelay: 2000,
    blockedDomains: BrowserService.DEFAULT_BLOCKED_DOMAINS,
    blockedResourceTypes: ['image', 'font', 'media']
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
   * 初始化浏览器实例
   */
  public async initialize(): Promise<void> {
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
      if (!this.browser?.isConnected() || this.contexts.size === 0) {
        return false
      }

      // 检查第一个上下文是否健康
      const [firstContext] = this.contexts.values()
      const testPage = await firstContext.newPage()
      try {
        await testPage.evaluate(() => document.readyState)
        return true
      } finally {
        await testPage.close()
      }
    } catch (error) {
      logger.debug('健康检查失败:', error)
      return false
    }
  }

  /**
   * 创建新页面
   */
  public async createPage(options: PageOptions = {}): Promise<string> {
    await this.ensureReady()
    this.updateActivity()

    const contextId = options.contextId || 'default'
    let context = this.contexts.get(contextId)

    // 如果上下文不存在，则创建
    if (!context) {
      context = await this.createBrowserContext(contextId)
      this.contexts.set(contextId, context)
    }

    const page = await context.newPage()
    await this.setupPageOptimizations(page, contextId)

    const pageId = this.generatePageId()
    this.pages.set(pageId, page)
    this.pageMeta.set(pageId, {
      id: pageId,
      contextId,
      createdAt: new Date(),
      lastUsed: new Date()
    })

    // 设置事件监听
    this.setupPageEventListeners(pageId)

    logger.info(`页面已创建: ${pageId} [上下文: ${contextId}]`)

    // 如果设置为活动页面或没有活动页面，则设为活动页面
    if (options.setActive || !this.activePageId) {
      this.setActivePage(pageId)
    }

    // 启动健康检查（如果还没有启动）
    this.ensureHealthCheck()
    // 取消空闲清理
    this.cancelIdleCleanup()

    return pageId
  }

  /**
   * 导航到指定URL
   */
  public async navigateToUrl(
    url: string,
    pageId: string,
    options: NavigationOptions = {}
  ): Promise<void> {
    const {
      waitUntil = 'domcontentloaded',
      timeout = this.config.timeout,
      retries = this.config.maxRetries || 3
    } = options

    this.updateActivity()
    const page = this.getPage(pageId)
    let lastError: Error | null = null

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        logger.info(`导航至 (尝试 ${attempt}/${retries}): ${url} [页面: ${pageId}]`)

        await page.goto(url, { waitUntil, timeout })
        logger.debug(`导航成功: ${url} [页面: ${pageId}]`)

        // 更新页面最后使用时间
        this.updatePageLastUsed(pageId)
        return
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))
        logger.warn(`导航失败 (尝试 ${attempt}/${retries}): ${lastError.message} [页面: ${pageId}]`)

        if (attempt < retries) {
          const delay = (this.config.retryDelay || 2000) * attempt
          logger.info(`等待 ${delay}ms 后重试 [页面: ${pageId}]`)
          await this.sleep(delay)

          // 检查页面是否需要恢复
          if (page.isClosed()) {
            await this.restorePage(pageId)
          }
        }
      }
    }

    throw new BrowserError(
      `导航失败，已重试 ${retries} 次: ${url} [页面: ${pageId}]`,
      'NAVIGATION_FAILED',
      lastError || undefined
    )
  }

  /**
   * 等待页面稳定状态
   */
  public async waitForStableState(pageId: string, timeout: number = 30_000): Promise<void> {
    const STABILITY_THRESHOLD = 1000
    const POLL_INTERVAL = 300

    const page = this.getPage(pageId)
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
            logger.debug(`页面已达稳定状态 [页面: ${pageId}]`)
            this.updatePageLastUsed(pageId)
            return
          }
        } else {
          stableStart = 0
        }

        await this.sleep(POLL_INTERVAL)
      } catch (error) {
        logger.warn(`稳定性检查异常 [页面: ${pageId}]:`, error)
        stableStart = 0
        await this.sleep(POLL_INTERVAL)
      }
    }

    logger.warn(`页面稳定状态检测超时 (${timeout}ms) [页面: ${pageId}]`)
  }

  /**
   * 设置活动页面
   */
  public setActivePage(pageId: string): void {
    if (!this.pages.has(pageId)) {
      throw new BrowserError(`页面不存在: ${pageId}`, 'PAGE_NOT_FOUND')
    }
    this.activePageId = pageId
    logger.info(`设置活动页面: ${pageId}`)
  }

  /**
   * 获取活动页面ID
   */
  public getActivePageId(): string | null {
    return this.activePageId
  }

  /**
   * 获取页面对象
   */
  public getPage(pageId: string): Page {
    const page = this.pages.get(pageId)
    if (!page) {
      throw new BrowserError(`页面不存在: ${pageId}`, 'PAGE_NOT_FOUND')
    }
    return page
  }

  /**
   * 获取页面元数据
   */
  public getPageMeta(pageId: string): PageMeta {
    const meta = this.pageMeta.get(pageId)
    if (!meta) {
      throw new BrowserError(`页面不存在: ${pageId}`, 'PAGE_NOT_FOUND')
    }
    return meta
  }

  /**
   * 获取所有页面ID
   */
  public getAllPageIds(): string[] {
    return Array.from(this.pages.keys())
  }

  /**
   * 关闭页面
   */
  public async closePage(pageId: string): Promise<void> {
    const page = this.pages.get(pageId)
    if (!page) {
      logger.warn(`尝试关闭不存在的页面: ${pageId}`)
      return
    }

    try {
      await page.close()
      logger.info(`页面已关闭: ${pageId}`)
    } catch (error) {
      logger.error(`关闭页面失败: ${pageId}`, error)
    } finally {
      this.pages.delete(pageId)
      this.pageMeta.delete(pageId)

      // 如果关闭的是活动页面，清除活动页面
      if (this.activePageId === pageId) {
        this.activePageId = null
      }

      // 检查是否所有页面都已关闭，如果是则开始空闲清理计时
      if (this.pages.size === 0) {
        this.scheduleIdleCleanup()
      }
    }
  }

  /**
   * 关闭浏览器服务
   */
  public async terminate(): Promise<void> {
    logger.info('正在关闭浏览器服务')
    this.state = BrowserState.CLOSED
    this.stopHealthCheck()
    await this.cleanup()
    logger.info('浏览器服务已关闭')
  }

  /**
   * 重置浏览器会话
   */
  public async reset(): Promise<void> {
    logger.info('重置浏览器会话')
    await this.cleanup()
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
    // 更新视口大小
    if (newConfig.viewport) {
      for (const page of this.pages.values()) {
        if (!page.isClosed()) {
          page.setViewportSize(newConfig.viewport)
        }
      }
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

      // 创建默认上下文
      await this.createBrowserContext('default')

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
    this.browser.on('disconnected', () => this.handleBrowserDisconnect())
    logger.info('Chromium浏览器已启动')
  }

  /**
   * 创建浏览器上下文
   */
  private async createBrowserContext(contextId: string): Promise<BrowserContext> {
    if (!this.browser) {
      throw new BrowserError('浏览器未初始化', 'BROWSER_NOT_INITIALIZED')
    }

    const context = await this.browser.newContext({
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

    this.contexts.set(contextId, context)
    logger.info(`浏览器上下文已创建: ${contextId}`)
    return context
  }

  /**
   * 设置页面优化
   */
  private async setupPageOptimizations(page: Page, contextId: string): Promise<void> {
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
        const resourceType = route.request().resourceType() as ResourceType

        // 阻止不必要的资源
        if (this.shouldBlockResource(url, resourceType)) {
          return route.abort()
        }

        return route.continue()
      })

      logger.debug(`页面优化设置完成 [上下文: ${contextId}]`)
    } catch (error) {
      logger.warn('页面优化设置失败:', error)
    }
  }

  /**
   * 判断是否应该阻止资源
   */
  private shouldBlockResource(url: string, resourceType: ResourceType): boolean {
    const { blockedDomains = [], blockedResourceTypes = [] } = this.config
    return (
      blockedDomains.some((d) => url.includes(d)) || blockedResourceTypes.includes(resourceType)
    )
  }

  /**
   * 设置页面事件监听
   */
  private setupPageEventListeners(pageId: string): void {
    const page = this.getPage(pageId)

    page.on('pageerror', (error) => {
      logger.error(`页面错误 [${pageId}]:`, error)
    })

    page.on('crash', () => {
      logger.error(`页面崩溃 [${pageId}]`)
      this.restorePage(pageId).catch((error) => {
        logger.error(`恢复崩溃页面失败 [${pageId}]:`, error)
      })
    })
  }

  /**
   * 恢复页面
   */
  private async restorePage(pageId: string): Promise<void> {
    const meta = this.pageMeta.get(pageId)
    if (!meta) {
      logger.warn(`尝试恢复不存在的页面: ${pageId}`)
      return
    }

    logger.info(`尝试恢复页面: ${pageId}`)

    // 关闭当前页面
    try {
      const page = this.pages.get(pageId)
      if (page && !page.isClosed()) {
        await page.close()
      }
    } catch (error) {
      logger.warn(`关闭崩溃页面失败: ${pageId}`, error)
    }

    // 从映射中移除
    this.pages.delete(pageId)

    // 创建新页面
    try {
      const context = this.contexts.get(meta.contextId)
      if (!context) {
        throw new BrowserError(`上下文不存在: ${meta.contextId}`, 'CONTEXT_NOT_FOUND')
      }

      const newPage = await context.newPage()
      await this.setupPageOptimizations(newPage, meta.contextId)

      this.pages.set(pageId, newPage)
      this.pageMeta.set(pageId, {
        ...meta,
        lastUsed: new Date()
      })

      // 重新设置事件监听
      this.setupPageEventListeners(pageId)

      logger.info(`页面恢复成功: ${pageId}`)
    } catch (error) {
      logger.error(`页面恢复失败: ${pageId}`, error)
      this.pageMeta.delete(pageId)
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
      logger.info('浏览器重连成功')
    } catch (error) {
      logger.error('浏览器重连失败:', error)
    }
  }

  /**
   * 启动健康检查
   */
  private startHealthCheck(): void {
    if (this.healthCheckInterval) {
      return // 已经启动了
    }

    this.healthCheckInterval = setInterval(async () => {
      try {
        // 如果没有活动页面，跳过健康检查
        if (this.pages.size === 0) {
          logger.debug('无活动页面，跳过健康检查')
          return
        }

        const isHealthy = await this.checkHealth()
        if (!isHealthy && this.state === BrowserState.READY) {
          logger.warn('健康检查失败，尝试重新初始化')
          await this.initialize()
        }
      } catch (error) {
        logger.error('健康检查异常:', error)
      }
    }, BrowserService.HEALTH_CHECK_INTERVAL)

    logger.debug('健康检查已启动')
  }

  /**
   * 停止健康检查
   */
  private stopHealthCheck(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval)
      this.healthCheckInterval = null
      logger.debug('健康检查已停止')
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
    this.cancelIdleCleanup()

    // 关闭所有页面
    const closePageTasks = Array.from(this.pages.keys()).map((pageId) =>
      this.closePage(pageId).catch((error) => logger.warn(`关闭页面失败: ${pageId}`, error))
    )
    await Promise.all(closePageTasks)

    // 关闭所有上下文
    const closeContextTasks = Array.from(this.contexts.values()).map((context) =>
      context.close().catch((error) => logger.warn('关闭上下文失败:', error))
    )
    await Promise.all(closeContextTasks)
    this.contexts.clear()

    // 关闭浏览器
    if (this.browser) {
      try {
        await this.browser.close()
      } catch (error) {
        logger.warn('关闭浏览器失败:', error)
      } finally {
        this.browser = null
      }
    }

    // 重置状态
    this.pages.clear()
    this.pageMeta.clear()
    this.activePageId = null

    logger.debug('浏览器资源清理完成')
  }

  /**
   * 生成唯一页面ID
   */
  private generatePageId(): string {
    return `page-${Date.now()}-${Math.random().toString(36).substr(2, 8)}`
  }

  /**
   * 更新页面最后使用时间
   */
  private updatePageLastUsed(pageId: string): void {
    const meta = this.pageMeta.get(pageId)
    if (meta) {
      meta.lastUsed = new Date()
      this.pageMeta.set(pageId, meta)
    }
  }

  /**
   * 更新活动时间
   */
  private updateActivity(): void {
    // this.lastActivity = Date.now() // 暂时不使用时间戳，而是基于页面数量来判断空闲状态
    logger.debug('浏览器活动更新')
  }

  /**
   * 确保健康检查启动
   */
  private ensureHealthCheck(): void {
    if (!this.healthCheckInterval && this.state === BrowserState.READY) {
      this.startHealthCheck()
    }
  }

  /**
   * 安排空闲清理
   */
  private scheduleIdleCleanup(): void {
    this.cancelIdleCleanup()

    logger.debug(`安排空闲清理，${BrowserService.IDLE_CLEANUP_DELAY / 1000}秒后执行`)
    this.idleCleanupTimeout = setTimeout(async () => {
      try {
        // 再次检查是否真的没有页面
        if (this.pages.size === 0 && this.state === BrowserState.READY) {
          logger.info('执行空闲清理，关闭浏览器')
          await this.cleanup()
          this.state = BrowserState.UNINITIALIZED
        }
      } catch (error) {
        logger.error('空闲清理失败:', error)
      }
    }, BrowserService.IDLE_CLEANUP_DELAY)
  }

  /**
   * 取消空闲清理
   */
  private cancelIdleCleanup(): void {
    if (this.idleCleanupTimeout) {
      clearTimeout(this.idleCleanupTimeout)
      this.idleCleanupTimeout = null
      logger.debug('空闲清理已取消')
    }
  }

  /**
   * 工具方法：延迟执行
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}
