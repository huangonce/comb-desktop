import { chromium, Browser, BrowserContext, Page } from 'playwright-core'
import { logger } from './logger.service'

// 浏览器配置接口
export interface BrowserServiceConfig {
  headless?: boolean
  executablePath?: string
  userAgent?: string
  viewport?: { width: number; height: number }
  timeout?: number
  maxRetries?: number
  retryDelay?: number
  maxPages?: number
  maxInstances?: number
  enableResourceBlocking?: boolean
  blockedResourceTypes?: string[]
  blockedDomains?: string[]
  enablePageOptimizations?: boolean
  pageIdleTimeout?: number
  healthCheckInterval?: number
}

// 导航选项接口
export interface NavigationOptions {
  waitUntil?: 'load' | 'domcontentloaded' | 'networkidle' | 'commit'
  timeout?: number
  retries?: number
}

// 页面创建选项
export interface PageCreateOptions {
  reuse?: boolean
  timeout?: number
}

// 浏览器状态枚举
export enum BrowserState {
  UNINITIALIZED = 'uninitialized',
  INITIALIZING = 'initializing',
  READY = 'ready',
  ERROR = 'error',
  CLOSED = 'closed'
}

// 页面状态枚举
export enum PageState {
  IDLE = 'idle',
  ACTIVE = 'active',
  ERROR = 'error',
  CLOSED = 'closed'
}

// 页面信息接口
export interface PageInfo {
  id: string
  url: string
  title: string
  state: PageState
  lastUsed: number
  createdAt: number
}

// 浏览器实例信息
export interface BrowserInstanceInfo {
  id: string
  state: BrowserState
  pageCount: number
  createdAt: number
  lastUsed: number
  isConnected: boolean
}

// 错误类
export class BrowserServiceError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly cause?: Error
  ) {
    super(message)
    this.name = 'BrowserServiceError'
  }
}

// 内部页面包装器
interface ManagedPage {
  id: string
  page: Page
  state: PageState
  lastUsed: number
  createdAt: number
  url: string
  title: string
}

// 内部浏览器实例包装器
interface ManagedBrowserInstance {
  id: string
  browser: Browser
  context: BrowserContext
  pages: Map<string, ManagedPage>
  state: BrowserState
  createdAt: number
  lastUsed: number
}

/**
 * 重构后的浏览器服务
 * 提供更简洁、健壮的API
 */
export class BrowserService {
  private instances: Map<string, ManagedBrowserInstance> = new Map()
  private config: BrowserServiceConfig
  private state: BrowserState = BrowserState.UNINITIALIZED
  private instanceCounter = 0
  private pageCounter = 0
  private cleanupTimer?: NodeJS.Timeout
  private healthCheckTimer?: NodeJS.Timeout
  private resolvedExecutablePath?: string

  // 默认配置
  private static readonly DEFAULT_CONFIG: BrowserServiceConfig = {
    headless: process.env.NODE_ENV !== 'development',
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 },
    timeout: 30000,
    maxRetries: 3,
    retryDelay: 2000,
    maxPages: 10,
    maxInstances: 3,
    enableResourceBlocking: true,
    blockedResourceTypes: ['image', 'font', 'media'],
    blockedDomains: [
      'google-analytics',
      'googletagmanager',
      'facebook.com',
      'doubleclick',
      'googlesyndication',
      'adsystem'
    ],
    enablePageOptimizations: true,
    pageIdleTimeout: 300000, // 5分钟
    healthCheckInterval: 60000 // 1分钟
  }

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
    '--disable-software-rasterizer'
  ]

  constructor(config: Partial<BrowserServiceConfig> = {}) {
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
   * 初始化浏览器服务
   */
  async initialize(): Promise<void> {
    if (this.state !== BrowserState.UNINITIALIZED) {
      return
    }

    try {
      this.state = BrowserState.INITIALIZING
      logger.info('初始化浏览器服务')

      // 解析可执行路径
      this.resolvedExecutablePath = await this.resolveExecutablePath()

      // 创建默认实例
      await this.createInstance()

      // 启动定时任务
      this.startCleanupTimer()
      this.startHealthCheckTimer()

      this.state = BrowserState.READY
      logger.info('浏览器服务初始化完成')
    } catch (error) {
      this.state = BrowserState.ERROR
      throw new BrowserServiceError(
        '浏览器服务初始化失败',
        'INIT_FAILED',
        error instanceof Error ? error : new Error(String(error))
      )
    }
  }

  /**
   * 创建新页面
   */
  async createPage(options: PageCreateOptions = {}): Promise<Page> {
    await this.ensureReady()

    const { reuse = true } = options

    try {
      // 尝试重用空闲页面
      if (reuse) {
        const idlePage = this.findIdlePage()
        if (idlePage) {
          return await this.activatePage(idlePage)
        }
      }

      // 创建新页面
      const instance = await this.getBestInstance()
      const page = await this.createNewPage(instance)

      logger.debug(`创建页面成功: ${page.id}`)
      return page.page
    } catch (error) {
      throw new BrowserServiceError(
        '创建页面失败',
        'CREATE_PAGE_FAILED',
        error instanceof Error ? error : new Error(String(error))
      )
    }
  }

  /**
   * 导航到指定URL
   */
  async navigateTo(url: string, options: NavigationOptions = {}): Promise<Page> {
    await this.ensureReady()

    const {
      waitUntil = 'domcontentloaded',
      timeout = this.config.timeout,
      retries = this.config.maxRetries || 3
    } = options

    let lastError: Error | null = null

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const page = await this.createPage()

        logger.info(`导航到 ${url} (尝试 ${attempt}/${retries})`)

        await page.goto(url, { waitUntil, timeout })

        logger.debug(`导航成功: ${url}`)
        return page
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))
        logger.warn(`导航失败 (尝试 ${attempt}/${retries}): ${lastError.message}`)

        if (attempt < retries) {
          const delay = (this.config.retryDelay || 2000) * attempt
          await this.sleep(delay)
        }
      }
    }

    throw new BrowserServiceError(
      `导航失败，已重试 ${retries} 次: ${url}`,
      'NAVIGATION_FAILED',
      lastError || undefined
    )
  }

  /**
   * 关闭页面
   */
  async closePage(page: Page): Promise<void> {
    const managedPage = this.findManagedPage(page)
    if (managedPage) {
      await this.doClosePage(managedPage)
    }
  }

  /**
   * 释放页面到空闲状态
   */
  async releasePage(page: Page): Promise<void> {
    const managedPage = this.findManagedPage(page)
    if (managedPage) {
      managedPage.state = PageState.IDLE
      managedPage.lastUsed = Date.now()
      await this.updatePageInfo(managedPage)
    }
  }

  /**
   * 等待页面稳定
   */
  async waitForPageStable(page: Page, timeout: number = 30000): Promise<void> {
    const STABILITY_THRESHOLD = 1000
    const POLL_INTERVAL = 300
    const startTime = Date.now()
    let stableStart = 0

    while (Date.now() - startTime < timeout) {
      try {
        const isStable = await page.evaluate(() => {
          if (document.readyState !== 'complete') return false

          const loadingElements = document.querySelectorAll(
            '[aria-busy="true"], [data-loading="true"], .loading, .spinner'
          )
          if (loadingElements.length > 0) return false

          const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[]
          const recentRequests = resources.filter((r) => r.responseEnd > performance.now() - 800)

          return recentRequests.length === 0
        })

        if (isStable) {
          if (stableStart === 0) {
            stableStart = Date.now()
          } else if (Date.now() - stableStart > STABILITY_THRESHOLD) {
            logger.debug('页面已稳定')
            return
          }
        } else {
          stableStart = 0
        }

        await this.sleep(POLL_INTERVAL)
      } catch (error) {
        logger.warn('页面稳定性检查异常:', error)
        stableStart = 0
        await this.sleep(POLL_INTERVAL)
      }
    }

    logger.warn(`页面稳定性检查超时 (${timeout}ms)`)
  }

  /**
   * 获取服务状态
   */
  getState(): BrowserState {
    return this.state
  }

  /**
   * 检查服务是否就绪
   */
  isReady(): boolean {
    return this.state === BrowserState.READY
  }

  /**
   * 获取页面信息列表
   */
  getPageInfoList(): PageInfo[] {
    const pageInfoList: PageInfo[] = []

    for (const instance of this.instances.values()) {
      for (const page of instance.pages.values()) {
        pageInfoList.push({
          id: page.id,
          url: page.url,
          title: page.title,
          state: page.state,
          lastUsed: page.lastUsed,
          createdAt: page.createdAt
        })
      }
    }

    return pageInfoList
  }

  /**
   * 获取浏览器实例信息列表
   */
  getBrowserInstanceInfoList(): BrowserInstanceInfo[] {
    return Array.from(this.instances.values()).map((instance) => ({
      id: instance.id,
      state: instance.state,
      pageCount: instance.pages.size,
      createdAt: instance.createdAt,
      lastUsed: instance.lastUsed,
      isConnected: instance.browser.isConnected()
    }))
  }

  /**
   * 健康检查
   */
  async healthCheck(): Promise<boolean> {
    try {
      if (this.state !== BrowserState.READY) {
        return false
      }

      // 检查是否有健康的实例
      for (const instance of this.instances.values()) {
        if (instance.state === BrowserState.READY && instance.browser.isConnected()) {
          return true
        }
      }

      return false
    } catch (error) {
      logger.warn('健康检查失败:', error)
      return false
    }
  }

  /**
   * 重置服务
   */
  async reset(): Promise<void> {
    logger.info('重置浏览器服务')
    await this.destroy()
    await this.initialize()
  }

  /**
   * 销毁服务
   */
  async destroy(): Promise<void> {
    logger.info('销毁浏览器服务')

    this.state = BrowserState.CLOSED

    // 停止定时器
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer)
    }
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer)
    }

    // 清理所有实例
    const cleanupTasks = Array.from(this.instances.values()).map((instance) =>
      this.cleanupInstance(instance)
    )

    await Promise.all(cleanupTasks)
    this.instances.clear()

    logger.info('浏览器服务已销毁')
  }

  /**
   * 私有方法：确保服务就绪
   */
  private async ensureReady(): Promise<void> {
    if (this.state !== BrowserState.READY) {
      await this.initialize()
    }
  }

  /**
   * 私有方法：查找空闲页面
   */
  private findIdlePage(): ManagedPage | null {
    for (const instance of this.instances.values()) {
      for (const page of instance.pages.values()) {
        if (page.state === PageState.IDLE) {
          return page
        }
      }
    }
    return null
  }

  /**
   * 私有方法：激活页面
   */
  private async activatePage(page: ManagedPage): Promise<Page> {
    page.state = PageState.ACTIVE
    page.lastUsed = Date.now()
    await this.updatePageInfo(page)
    return page.page
  }

  /**
   * 私有方法：获取最佳实例
   */
  private async getBestInstance(): Promise<ManagedBrowserInstance> {
    let bestInstance: ManagedBrowserInstance | null = null
    let minPageCount = Infinity

    for (const instance of this.instances.values()) {
      if (instance.state === BrowserState.READY) {
        const pageCount = instance.pages.size
        if (pageCount < minPageCount && pageCount < (this.config.maxPages || 10)) {
          bestInstance = instance
          minPageCount = pageCount
        }
      }
    }

    if (bestInstance) {
      return bestInstance
    }

    // 如果没有合适的实例，创建新实例
    return await this.createInstance()
  }

  /**
   * 私有方法：创建新页面
   */
  private async createNewPage(instance: ManagedBrowserInstance): Promise<ManagedPage> {
    if (instance.pages.size >= (this.config.maxPages || 10)) {
      throw new BrowserServiceError('实例页面数量已达上限', 'MAX_PAGES_REACHED')
    }

    const pageId = `page-${++this.pageCounter}`
    const page = await instance.context.newPage()

    // 设置页面优化
    if (this.config.enablePageOptimizations) {
      await this.setupPageOptimizations(page)
    }

    const managedPage: ManagedPage = {
      id: pageId,
      page,
      state: PageState.ACTIVE,
      lastUsed: Date.now(),
      createdAt: Date.now(),
      url: '',
      title: ''
    }

    instance.pages.set(pageId, managedPage)
    instance.lastUsed = Date.now()

    logger.debug(`页面创建成功: ${pageId} (实例: ${instance.id})`)
    return managedPage
  }

  /**
   * 私有方法：查找管理的页面
   */
  private findManagedPage(page: Page): ManagedPage | null {
    for (const instance of this.instances.values()) {
      for (const managedPage of instance.pages.values()) {
        if (managedPage.page === page) {
          return managedPage
        }
      }
    }
    return null
  }

  /**
   * 私有方法：关闭页面
   */
  private async doClosePage(managedPage: ManagedPage): Promise<void> {
    try {
      await managedPage.page.close()
    } catch (error) {
      logger.warn(`关闭页面失败: ${error}`)
    }

    // 从实例中移除
    for (const instance of this.instances.values()) {
      if (instance.pages.has(managedPage.id)) {
        instance.pages.delete(managedPage.id)
        break
      }
    }

    managedPage.state = PageState.CLOSED
  }

  /**
   * 私有方法：更新页面信息
   */
  private async updatePageInfo(managedPage: ManagedPage): Promise<void> {
    try {
      managedPage.url = managedPage.page.url()
      managedPage.title = await managedPage.page.title()
    } catch (error) {
      logger.warn(`更新页面信息失败: ${error}`)
    }
  }

  /**
   * 私有方法：创建浏览器实例
   */
  private async createInstance(): Promise<ManagedBrowserInstance> {
    const instanceId = `browser-${++this.instanceCounter}`

    // 检查实例数量限制
    if (this.instances.size >= (this.config.maxInstances || 3)) {
      throw new BrowserServiceError('已达到最大实例数量限制', 'MAX_INSTANCES_REACHED')
    }

    logger.info(`创建新的浏览器实例: ${instanceId}`)

    // 启动浏览器
    const browser = await this.launchBrowser()

    // 创建上下文
    const context = await this.createBrowserContext(browser)

    const instance: ManagedBrowserInstance = {
      id: instanceId,
      browser,
      context,
      pages: new Map(),
      state: BrowserState.READY,
      createdAt: Date.now(),
      lastUsed: Date.now()
    }

    this.instances.set(instanceId, instance)
    this.setupInstanceEventListeners(instance)

    logger.info(`浏览器实例创建成功: ${instanceId}`)
    return instance
  }

  /**
   * 私有方法：启动浏览器
   */
  private async launchBrowser(): Promise<Browser> {
    const launchOptions = {
      headless: this.config.headless,
      executablePath: this.resolvedExecutablePath,
      args: [...BrowserService.LAUNCH_ARGS],
      timeout: 30000,
      slowMo: process.env.NODE_ENV === 'development' ? 100 : 0
    }

    const browser = await chromium.launch(launchOptions)
    logger.debug('Chromium浏览器实例已启动')
    return browser
  }

  /**
   * 私有方法：创建浏览器上下文
   */
  private async createBrowserContext(browser: Browser): Promise<BrowserContext> {
    const context = await browser.newContext({
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

    logger.debug('浏览器上下文已创建')
    return context
  }

  /**
   * 私有方法：设置实例事件监听器
   */
  private setupInstanceEventListeners(instance: ManagedBrowserInstance): void {
    instance.browser.on('disconnected', () => {
      logger.warn(`浏览器实例断开连接: ${instance.id}`)
      instance.state = BrowserState.ERROR
      this.handleInstanceDisconnect(instance)
    })
  }

  /**
   * 私有方法：处理实例断开连接
   */
  private async handleInstanceDisconnect(instance: ManagedBrowserInstance): Promise<void> {
    logger.warn(`处理实例断开连接: ${instance.id}`)

    // 清理页面
    for (const page of instance.pages.values()) {
      page.state = PageState.CLOSED
    }
    instance.pages.clear()

    // 从实例映射中移除
    this.instances.delete(instance.id)

    // 如果没有可用实例，尝试创建新实例
    if (this.instances.size === 0) {
      try {
        await this.createInstance()
      } catch (error) {
        logger.error('创建恢复实例失败:', error)
        this.state = BrowserState.ERROR
      }
    }
  }

  /**
   * 私有方法：启动清理定时器
   */
  private startCleanupTimer(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer)
    }

    this.cleanupTimer = setInterval(() => {
      this.cleanupIdlePages()
    }, 60000) // 每分钟清理一次
  }

  /**
   * 私有方法：启动健康检查定时器
   */
  private startHealthCheckTimer(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer)
    }

    this.healthCheckTimer = setInterval(async () => {
      const isHealthy = await this.healthCheck()
      if (!isHealthy && this.state === BrowserState.READY) {
        logger.warn('健康检查失败，尝试重新初始化')
        try {
          await this.reset()
        } catch (error) {
          logger.error('自动重置失败:', error)
          this.state = BrowserState.ERROR
        }
      }
    }, this.config.healthCheckInterval || 60000)
  }

  /**
   * 私有方法：清理空闲页面
   */
  private cleanupIdlePages(): void {
    const now = Date.now()
    const idleTimeout = this.config.pageIdleTimeout || 300000 // 5分钟

    for (const instance of this.instances.values()) {
      const pagesToClose: string[] = []

      for (const [pageId, page] of instance.pages) {
        if (page.state === PageState.IDLE && now - page.lastUsed > idleTimeout) {
          pagesToClose.push(pageId)
        }
      }

      // 异步关闭页面
      for (const pageId of pagesToClose) {
        const page = instance.pages.get(pageId)
        if (page) {
          this.doClosePage(page).catch((error) => {
            logger.warn(`清理空闲页面失败: ${error}`)
          })
        }
      }
    }
  }

  /**
   * 私有方法：清理实例
   */
  private async cleanupInstance(instance: ManagedBrowserInstance): Promise<void> {
    logger.debug(`开始清理实例: ${instance.id}`)

    const cleanupTasks: Promise<void>[] = []

    // 关闭所有页面
    for (const page of instance.pages.values()) {
      cleanupTasks.push(page.page.close().catch((error) => logger.warn(`关闭页面失败: ${error}`)))
    }

    // 关闭上下文
    cleanupTasks.push(
      instance.context.close().catch((error) => logger.warn('关闭上下文失败:', error))
    )

    // 关闭浏览器
    cleanupTasks.push(
      instance.browser.close().catch((error) => logger.warn('关闭浏览器失败:', error))
    )

    await Promise.all(cleanupTasks)
    instance.pages.clear()
    logger.debug(`实例清理完成: ${instance.id}`)
  }

  /**
   * 私有方法：解析可执行路径
   */
  private async resolveExecutablePath(): Promise<string | undefined> {
    try {
      if (this.config.executablePath) {
        return this.config.executablePath
      }

      if (process.env.NODE_ENV === 'development') {
        return undefined
      }

      const path = await import('path')
      const os = await import('os')
      const { app } = await import('electron')

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
   * 私有方法：设置页面优化
   */
  private async setupPageOptimizations(page: Page): Promise<void> {
    try {
      // 设置默认超时
      page.setDefaultTimeout(this.config.timeout || 30000)
      page.setDefaultNavigationTimeout(this.config.timeout || 30000)

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
      })

      // 设置请求拦截
      if (this.config.enableResourceBlocking) {
        await page.route('**/*', (route) => {
          const url = route.request().url()
          const resourceType = route.request().resourceType()

          if (this.shouldBlockResource(url, resourceType)) {
            return route.abort()
          }

          return route.continue()
        })
      }

      logger.debug('页面优化设置完成')
    } catch (error) {
      logger.warn('页面优化设置失败:', error)
    }
  }

  /**
   * 私有方法：判断是否应该阻止资源
   */
  private shouldBlockResource(url: string, resourceType: string): boolean {
    const blockedTypes = this.config.blockedResourceTypes || []
    const blockedDomains = this.config.blockedDomains || []

    return (
      blockedDomains.some((domain) => url.includes(domain)) || blockedTypes.includes(resourceType)
    )
  }

  /**
   * 私有方法：延迟执行
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}
