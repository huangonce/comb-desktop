import { Page } from 'playwright-core'
import { logger } from '../../services/logger.service'

const TIMEOUT = 5_000
const CAPTCHA_SELECTORS = [
  'iframe[src*="captcha"]',
  '.nc_wrapper',
  '[class*="captcha"]',
  '[class*="verify"]',
  '[class*="security"]'
]

/**
 * 检查当前页面是否为供应商搜索页面
 * @param page Playwright 页面实例
 * @returns {Promise<boolean>} 是否为供应商搜索页面
 */
export const isSupplierSearchPage = async (page: Page): Promise<boolean> => {
  try {
    const bodyElement = page.locator('body')
    const dataSpm = await bodyElement.getAttribute('data-spm', { timeout: TIMEOUT })
    return dataSpm === 'supplier_search'
  } catch (error) {
    logger.warn(`检查搜索结果页失败: ${getErrorMessage(error)}`)
    return false
  }
}

/**
 * 检查当前页面是否为验证码页面
 * @param page Playwright 页面实例
 * @returns {Promise<boolean>} 是否为验证码页面
 */
export const isCaptchaPage = async (page: Page): Promise<boolean> => {
  const captchaSelector = CAPTCHA_SELECTORS.join(', ')

  console.log(`检查验证码页面: ${captchaSelector}`)

  try {
    const count = await page.locator(captchaSelector).count()

    console.log(`验证码页面元素数量: ${count}`)
    return count > 0
  } catch (error) {
    logger.warn(`检查验证码页面失败: ${getErrorMessage(error)}`)
    return false
  }
}

/**
 * 规范化URL
 * @param url 待规范化的URL
 * @returns 规范化后的URL
 */
export const normalizeUrl = (url: string): string => {
  if (!url) return ''

  try {
    // 处理协议相对URL (//example.com)
    if (url.startsWith('//')) {
      return `https:${url}`
    }

    // 处理相对路径
    if (url.startsWith('/')) {
      return `https://www.alibaba.com${url}`
    }

    // 处理缺少协议的URL
    if (!/^https?:\/\//i.test(url)) {
      return `https://${url}`
    }

    return url
  } catch {
    return url
  }
}

/**
 * 获取错误信息
 * @param error 错误对象
 * @returns 错误信息
 */
export const getErrorMessage = (error: unknown): string => {
  return error instanceof Error ? error.message : String(error)
}

/**
 * 检查是否还有更多结果
 * @param page 页面实例
 */
export const hasNoMoreResults = async (activePage: Page): Promise<boolean> => {
  try {
    const noMoreElement = activePage.locator('#sse-less-result')
    return await noMoreElement.isVisible({ timeout: TIMEOUT })
  } catch {
    return false
  }
}

/**
 * 构建搜索URL
 * @param keyword 搜索关键词
 */
export const buildSearchUrl = (keyword: string, pageNumber: number): string => {
  const encodedKeyword = encodeURIComponent(keyword)

  return `https://www.alibaba.com/trade/search?fsb=y&IndexArea=product_en&keywords=${encodedKeyword}&originKeywords=${encodedKeyword}&tab=supplier&&page=${pageNumber}`
}
