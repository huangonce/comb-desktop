import { Page } from 'playwright-core'
import { BrowserService } from './browser.service'
import { logger } from './logger.service'
import { getErrorMessage } from './alibaba/utils'

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
 */
export class TianyanchaService {
  private browserService: BrowserService
  private loginInfo: TianyanchaLoginInfo | null = null
  private readonly TIANYANCHA_URL = 'https://www.tianyancha.com'
  private readonly LOGIN_CHECK_TIMEOUT = 30000 // 30秒超时

  constructor(browserService: BrowserService) {
    this.browserService = browserService
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

      // 创建新页面检查登录状态
      const pageId = await this.browserService.createPage()

      try {
        const page = this.browserService.getPage(pageId)
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
      } finally {
        await this.browserService.closePage(pageId)
      }
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

      // 创建新的浏览器页面用于登录
      const pageId = await this.browserService.createPage()

      try {
        const page = this.browserService.getPage(pageId)

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
      } finally {
        // 等待一段时间让用户看到结果，然后关闭窗口
        await new Promise((resolve) => setTimeout(resolve, 2000))
        await this.browserService.closePage(pageId)
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
}
