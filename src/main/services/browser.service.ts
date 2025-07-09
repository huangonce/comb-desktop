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

/**
 * 浏览器服务类
 * @description 提供浏览器的初始化、关闭、健康检查等功能
 * @class BrowserService
 */
export class BrowserService {
  private browser: Browser | null = null
  private context: BrowserContext | null = null
  private page: Page | null = null
  private config: BrowserConfig
  private readonly executablePath: string | undefined

  /**
   * 构造函数
   * @param config {Partial<BrowserConfig>}
   * @description 创建浏览器服务实例
   */
  constructor(config?: Partial<BrowserConfig>) {
    // 默认配置
    const defaultConfig: BrowserConfig = {
      headless: true,
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 800 },
      timeout: 60000 // 60秒超时
    }

    this.config = { ...defaultConfig, ...config }

    if (!this.config.executablePath) {
      // 设置默认的浏览器可执行路径
      this.executablePath = this.getChromiumExecutablePath()
    }
  }

  /**
   * 获取 Chromium 浏览器的可执行路径
   * @returns {string | undefined}
   * @description 获取 Chromium 浏览器的可执行路径
   * @return {string | undefined} 返回 Chromium 可执行文件的路径，如果未找到则返回 undefined
   * @throws {Error} 如果获取路径失败
   * @example
   * const executablePath = browserService.getChromiumExecutablePath();
   * if (executablePath) {
   *   console.log('Chromium 可执行路径:', executablePath);
   * } else {
   *   console.log('未找到 Chromium 可执行路径');
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
   * 优化页面性能
   * @param page {Page}
   * @returns {Promise<void>}
   * @description 通过禁用不必要的功能和资源拦截来优化页面加载性能
   * @throws {Error} 如果设置页面性能优化失败
   * @example
   * await browserService.optimizePagePerformance(page);
   * @memberof BrowserService
   */
  private async optimizePagePerformance(page: Page): Promise<void> {
    try {
      // 禁用不必要的功能以提高性能
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

      // 设置请求拦截，只允许必要的资源
      await page.route('**/*', (route) => {
        const request = route.request()
        const url = request.url()
        // const resourceType = request.resourceType()

        // 阻止广告、追踪和分析脚本
        if (
          url.includes('google-analytics') ||
          url.includes('googletagmanager') ||
          url.includes('facebook.com') ||
          url.includes('doubleclick')
          // resourceType === 'image' ||
          // resourceType === 'font' ||
          // resourceType === 'media'
        ) {
          route.abort()
        } else {
          route.continue()
        }
      })
    } catch (error) {
      logger.warn('设置页面性能优化失败:', error)
    }
  }

  /**
   * 初始化浏览器
   * @returns {Promise<void>}
   * @description 创建浏览器实例，设置上下文和页面
   * @throws {Error} 如果浏览器已存在或初始化失败
   */
  async initBrowser(): Promise<Page> {
    try {
      //
      if (!this.browser) {
        const launchOptions = {
          headless: false, // 在生产环境中建议设置为 true
          executablePath: this.executablePath, // 使用指定的 Chromium 路径
          args: [
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
          ],
          timeout: 30_000
        }

        this.browser = await chromium.launch(launchOptions)
        logger.log('Chromium 浏览器启动成功')
      }

      if (!this.context) {
        this.context = await this.browser.newContext({
          viewport: { width: 1920, height: 1080 },
          userAgent:
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
          extraHTTPHeaders: {
            'Accept-Language': 'en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7',
            'Accept-Encoding': 'gzip, deflate, br',
            Accept:
              'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8'
          },
          ignoreHTTPSErrors: true,
          javaScriptEnabled: true
        })
      }

      if (!this.page) {
        this.page = await this.context.newPage()

        await this.optimizePagePerformance(this.page)
        logger.log('页面创建成功')
      }

      return this.page
    } catch (error) {
      logger.error('初始化浏览器失败:', error)
      throw new Error(`浏览器初始化失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * 关闭浏览器
   * @returns {Promise<void>}
   * @description 关闭浏览器实例，释放资源
   * @throws {Error} 如果浏览器未初始化或关闭失败
   */
  async closeBrowser(): Promise<void> {
    //
    try {
      if (this.page) {
        await this.page.close()
        this.page = null
        logger.log('页面已关闭')
      }

      if (this.context) {
        await this.context.close()
        this.context = null
        logger.log('浏览器上下文已关闭')
      }

      if (this.browser) {
        await this.browser.close()
        this.browser = null
        logger.log('浏览器已关闭')
      }
    } catch (error) {
      logger.error('关闭浏览器失败:', error)
    }
  }

  /**
   * 检查浏览器健康状态
   * @returns {Promise<boolean>}
   * @description 检查浏览器的健康状态，确保浏览器和页面仍然可用
   * @throws {Error} 如果浏览器健康检查失败
   * @return {Promise<boolean>} 返回 true 表示浏览器健康，false 表示浏览器不可用
   * @example
   * const isHealthy = await browserService.checkBrowserHealth();
   * if (!isHealthy) {
   *   console.error('浏览器不健康');
   * }
   */
  async checkBrowserHealth(): Promise<boolean> {
    try {
      if (!this.browser || !this.context || !this.page) {
        return false
      }

      // 检查浏览器是否仍然连接
      const isConnected = this.browser.isConnected()
      if (!isConnected) {
        console.log('浏览器连接已断开')
        return false
      }

      // 检查页面是否响应
      await this.page.evaluate('() => document.readyState')
      return true
    } catch (error) {
      console.error('浏览器健康检查失败:', error)
      return false
    }
  }

  /**
   * 重置浏览器会话
   * @returns {Promise<void>}
   * @description 关闭当前浏览器实例并重新初始化
   * @throws {Error} 如果重置浏览器会话失败
   * @return {Promise<void>} 返回一个 Promise，表示重置操作完成
   * @example
   * await browserService.resetBrowserSession();
   * console.log('浏览器会话已重置');
   */
  async resetBrowserSession(): Promise<void> {
    console.log('重置浏览器会话...')
    await this.closeBrowser()
    await this.initBrowser()
  }

  /**
   * 获取当前页面实例
   * @returns {Page | null}
   * @description 获取当前页面实例
   * @return {Page | null} 返回当前页面实例，如果未创建则返回 null
   * @example
   * const page = browserService.getPage();
   * if (page) {
   *   console.log('当前页面已创建');
   * } else {
   *   console.log('当前页面未创建');
   * }
   * @throws {Error} 如果获取页面失败
   * @memberof BrowserService
   * @description 获取当前页面实例
   */
  getPage(): Page | null {
    return this.page
  }
}
