import { Page } from 'playwright-core'
import { BrowserService } from './browser.service'
import { logger } from './logger.service'
import { getErrorMessage } from './alibaba/alibaba.utils'

/**
 * 天眼查登录信息
 */
export interface TianyanchaLoginInfo {
  isLoggedIn: boolean
  cookies: string
  userAgent: string
  loginTime: number
  userId?: string
  userName?: string
}

/**
 * 天眼查服务类
 * 负责管理天眼查登录状态和认证信息
 * 内部管理独立的浏览器实例以实现登录信息共享
 */
export class TianyanchaService {
  private browserService: BrowserService
  private loginInfo: TianyanchaLoginInfo | null = null
  private readonly TIANYANCHA_URL = 'https://www.tianyancha.com'
  private readonly LOGIN_CHECK_TIMEOUT = 30000 // 30秒超时
  private persistentPageId: string | null = null // 持久化页面ID，用于保持登录状态

  constructor() {
    // 创建专用于天眼查的浏览器服务实例
    this.browserService = new BrowserService({
      headless: false, // 登录窗口需要用户交互
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1200, height: 800 },
      timeout: 60000,
      // 为天眼查优化的配置
      blockedDomains: [], // 不阻止任何域名，确保登录功能正常
      blockedResourceTypes: ['image', 'font'] // 只阻止图片和字体以提高性能
    })
  }

  /**
   * 获取或创建持久化页面
   */
  private async getPersistentPage(): Promise<{ page: Page; pageId: string }> {
    // 如果已有持久化页面且仍然有效，直接返回
    if (this.persistentPageId) {
      try {
        const page = this.browserService.getPage(this.persistentPageId)
        if (page && !page.isClosed()) {
          return { page, pageId: this.persistentPageId }
        }
      } catch {
        logger.warn('持久化页面已失效，将创建新页面')
        this.persistentPageId = null
      }
    }

    // 创建新的持久化页面
    const pageId = await this.browserService.createPage()
    this.persistentPageId = pageId
    const page = this.browserService.getPage(pageId)

    return { page, pageId }
  }

  /**
   * 检查天眼查登录状态
   */
  async checkLoginStatus(): Promise<boolean> {
    try {
      // 如果有缓存的登录信息且未过期（24小时内），直接返回
      if (this.loginInfo && this.isLoginInfoValid()) {
        logger.info('使用缓存的天眼查登录信息')
        return this.loginInfo.isLoggedIn
      }

      // 使用持久化页面检查登录状态
      const { page } = await this.getPersistentPage()

      await page.goto(this.TIANYANCHA_URL, {
        waitUntil: 'networkidle',
        timeout: this.LOGIN_CHECK_TIMEOUT
      })

      // 检查是否已登录
      const isLoggedIn = await this.isUserLoggedIn(page)

      if (isLoggedIn) {
        // 获取登录信息
        await this.extractLoginInfo(page)
        logger.info('天眼查已登录')
      } else {
        logger.info('天眼查未登录')
      }

      return isLoggedIn
    } catch (error) {
      logger.error('检查天眼查登录状态失败:', getErrorMessage(error))
      return false
    }
  }

  /**
   * 弹出登录窗口等待用户登录
   */
  async showLoginWindow(): Promise<boolean> {
    try {
      logger.info('弹出天眼查登录窗口')

      // 使用持久化页面进行登录
      const { page } = await this.getPersistentPage()

      // 导航到天眼查登录页
      await page.goto(this.TIANYANCHA_URL, {
        waitUntil: 'networkidle',
        timeout: this.LOGIN_CHECK_TIMEOUT
      })

      // 等待用户登录完成
      const loginSuccess = await this.waitForUserLogin(page)

      if (loginSuccess) {
        // 提取登录信息
        await this.extractLoginInfo(page)
        logger.info('天眼查登录成功')
        return true
      } else {
        logger.warn('天眼查登录失败或用户取消')
        return false
      }
    } catch (error) {
      logger.error('天眼查登录窗口操作失败:', getErrorMessage(error))
      return false
    }
  }

  /**
   * 确保天眼查已登录
   * 如果未登录，则弹出登录窗口
   */
  async ensureLoggedIn(): Promise<boolean> {
    const isLoggedIn = await this.checkLoginStatus()

    if (isLoggedIn) {
      return true
    }

    // 未登录，弹出登录窗口
    return await this.showLoginWindow()
  }

  /**
   * 获取当前登录信息
   */
  getLoginInfo(): TianyanchaLoginInfo | null {
    return this.loginInfo
  }

  /**
   * 清除登录信息
   */
  clearLoginInfo(): void {
    this.loginInfo = null
    logger.info('天眼查登录信息已清除')
  }

  /**
   * 检查页面是否已登录
   */
  private async isUserLoggedIn(page: Page): Promise<boolean> {
    try {
      // 方法1: 检查是否存在用户信息元素
      const userInfoSelectors = [
        '.header-user-info',
        '.user-info',
        '[class*="user"]',
        '.login-after'
      ]

      for (const selector of userInfoSelectors) {
        try {
          const element = await page.locator(selector).first()
          if (await element.isVisible({ timeout: 3000 })) {
            logger.debug(`发现登录状态指示元素: ${selector}`)
            return true
          }
        } catch {
          // 继续尝试下一个选择器
        }
      }

      // 方法2: 检查登录按钮是否不存在
      const loginButtonSelectors = ['.login-btn', '[class*="login"]', 'a[href*="login"]']

      let hasLoginButton = false
      for (const selector of loginButtonSelectors) {
        try {
          const element = await page.locator(selector).first()
          if (await element.isVisible({ timeout: 3000 })) {
            hasLoginButton = true
            break
          }
        } catch {
          // 继续检查
        }
      }

      // 如果没有登录按钮，可能已经登录
      if (!hasLoginButton) {
        // 进一步验证：检查cookies中是否有登录相关信息
        const cookies = await page.context().cookies()
        const hasAuthCookies = cookies.some(
          (cookie) =>
            cookie.name.toLowerCase().includes('auth') ||
            cookie.name.toLowerCase().includes('token') ||
            cookie.name.toLowerCase().includes('session') ||
            cookie.name.toLowerCase().includes('user')
        )

        if (hasAuthCookies) {
          logger.debug('通过cookies检测到登录状态')
          return true
        }
      }

      return false
    } catch (error) {
      logger.warn('检查登录状态时出错:', getErrorMessage(error))
      return false
    }
  }

  /**
   * 等待用户完成登录
   */
  private async waitForUserLogin(page: Page): Promise<boolean> {
    const maxWaitTime = 300000 // 5分钟最大等待时间
    const checkInterval = 2000 // 每2秒检查一次
    const startTime = Date.now()

    logger.info('等待用户完成天眼查登录...')

    while (Date.now() - startTime < maxWaitTime) {
      try {
        // 检查页面是否被关闭
        if (page.isClosed()) {
          logger.info('用户关闭了登录窗口')
          return false
        }

        // 检查是否已登录
        const isLoggedIn = await this.isUserLoggedIn(page)
        if (isLoggedIn) {
          logger.info('检测到用户已登录天眼查')
          return true
        }

        // 等待一段时间后再次检查
        await new Promise((resolve) => setTimeout(resolve, checkInterval))
      } catch (error) {
        logger.error('等待登录过程中出错:', getErrorMessage(error))
        return false
      }
    }

    logger.warn('等待用户登录超时')
    return false
  }

  /**
   * 提取登录信息
   */
  private async extractLoginInfo(page: Page): Promise<void> {
    try {
      // 获取cookies
      const cookies = await page.context().cookies()
      const cookieString = cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join('; ')

      // 获取用户代理
      const userAgent = await page.evaluate(() => navigator.userAgent)

      // 尝试获取用户信息
      let userId: string | undefined
      let userName: string | undefined

      try {
        // 尝试从页面提取用户信息
        const userNameElement = page.locator('.user-name, .username, [class*="user-name"]').first()
        if (await userNameElement.isVisible({ timeout: 3000 })) {
          userName = (await userNameElement.textContent()) || undefined
        }
      } catch {
        // 用户信息提取失败，使用默认值
      }

      this.loginInfo = {
        isLoggedIn: true,
        cookies: cookieString,
        userAgent,
        loginTime: Date.now(),
        userId,
        userName: userName?.trim()
      }

      logger.info('天眼查登录信息已保存', {
        userName: userName || '未知',
        cookiesLength: cookieString.length,
        loginTime: new Date().toISOString()
      })
    } catch (error) {
      logger.error('提取天眼查登录信息失败:', getErrorMessage(error))
    }
  }

  /**
   * 检查登录信息是否有效（未过期）
   */
  private isLoginInfoValid(): boolean {
    if (!this.loginInfo) {
      return false
    }

    const now = Date.now()
    const loginTime = this.loginInfo.loginTime
    const expiryTime = 24 * 60 * 60 * 1000 // 24小时

    return now - loginTime < expiryTime
  }

  /**
   * 为请求添加认证信息
   */
  async addAuthToRequest(page: Page): Promise<void> {
    if (!this.loginInfo) {
      return
    }

    try {
      // 设置cookies
      if (this.loginInfo.cookies) {
        const cookies = this.loginInfo.cookies.split('; ').map((cookie) => {
          const [name, value] = cookie.split('=')
          return {
            name: name.trim(),
            value: value.trim(),
            domain: '.tianyancha.com',
            path: '/'
          }
        })

        await page.context().addCookies(cookies)
      }

      // 设置用户代理
      if (this.loginInfo.userAgent) {
        await page.setExtraHTTPHeaders({
          'User-Agent': this.loginInfo.userAgent
        })
      }

      logger.debug('已为页面添加天眼查认证信息')
    } catch (error) {
      logger.error('添加认证信息失败:', getErrorMessage(error))
    }
  }

  /**
   * 清理资源和关闭浏览器服务
   */
  async cleanup(): Promise<void> {
    try {
      if (this.persistentPageId) {
        await this.browserService.closePage(this.persistentPageId)
        this.persistentPageId = null
      }
      await this.browserService.destroy()
      logger.info('天眼查服务资源清理完成')
    } catch (error) {
      logger.error('清理天眼查服务资源失败:', getErrorMessage(error))
    }
  }

  /**
   * 清除登录信息缓存
   */
  clearLoginCache(): void {
    this.loginInfo = null
    logger.info('已清除天眼查登录信息缓存')
  }
}
