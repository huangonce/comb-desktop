/**
 * 重构后的浏览器服务 API 使用示例
 * 展示更简洁、健壮的 API 使用方式
 */

import { BrowserService } from './browser.service'
import { logger } from './logger.service'

/**
 * 基本用法示例
 */
export async function basicUsageExample(): Promise<void> {
  // 创建浏览器服务实例
  const browserService = new BrowserService({
    headless: false,
    maxPages: 5,
    maxInstances: 2
  })

  try {
    // 初始化服务
    await browserService.initialize()

    // 创建页面并导航
    const page = await browserService.navigateTo('https://example.com')

    // 等待页面稳定
    await browserService.waitForPageStable(page)

    // 获取页面信息
    const title = await page.title()
    const url = page.url()

    logger.info(`页面标题: ${title}`)
    logger.info(`页面URL: ${url}`)

    // 释放页面（返回到空闲状态）
    await browserService.releasePage(page)

  } finally {
    // 销毁服务
    await browserService.destroy()
  }
}

/**
 * 并发处理示例
 */
export async function concurrentUsageExample(): Promise<void> {
  const browserService = new BrowserService({
    maxPages: 10,
    maxInstances: 3
  })

  try {
    await browserService.initialize()

    // 并发处理多个URL
    const urls = [
      'https://example.com',
      'https://google.com',
      'https://github.com',
      'https://stackoverflow.com'
    ]

    const results = await Promise.all(
      urls.map(async (url) => {
        try {
          const page = await browserService.navigateTo(url)
          await browserService.waitForPageStable(page)

          const title = await page.title()
          const finalUrl = page.url()

          await browserService.releasePage(page)

          return { url, title, finalUrl, success: true }
        } catch (error) {
          logger.error(`处理 ${url} 失败:`, error)
          return { url, error: error.message, success: false }
        }
      })
    )

    // 输出结果
    results.forEach(result => {
      if (result.success) {
        logger.info(`✅ ${result.url} - ${result.title}`)
      } else {
        logger.error(`❌ ${result.url} - ${result.error}`)
      }
    })

  } finally {
    await browserService.destroy()
  }
}

/**
 * 页面管理示例
 */
export async function pageManagementExample(): Promise<void> {
  const browserService = new BrowserService({
    pageIdleTimeout: 60000 // 1分钟空闲超时
  })

  try {
    await browserService.initialize()

    // 创建多个页面
    const page1 = await browserService.createPage()
    const page2 = await browserService.createPage()
    const page3 = await browserService.createPage()

    // 导航到不同的页面
    await page1.goto('https://example.com')
    await page2.goto('https://google.com')
    await page3.goto('https://github.com')

    // 获取页面信息列表
    const pageInfoList = browserService.getPageInfoList()
    logger.info('当前页面信息:')
    pageInfoList.forEach(info => {
      logger.info(`- ${info.id}: ${info.title} (${info.url})`)
    })

    // 获取浏览器实例信息
    const instanceInfoList = browserService.getBrowserInstanceInfoList()
    logger.info('浏览器实例信息:')
    instanceInfoList.forEach(info => {
      logger.info(`- ${info.id}: ${info.pageCount} 页面 (连接状态: ${info.isConnected})`)
    })

    // 释放页面
    await browserService.releasePage(page1)
    await browserService.releasePage(page2)

    // 关闭特定页面
    await browserService.closePage(page3)

  } finally {
    await browserService.destroy()
  }
}

/**
 * 错误处理和恢复示例
 */
export async function errorHandlingExample(): Promise<void> {
  const browserService = new BrowserService({
    maxRetries: 3,
    retryDelay: 1000,
    healthCheckInterval: 30000
  })

  try {
    await browserService.initialize()

    // 检查服务状态
    logger.info('服务状态:', browserService.getState())
    logger.info('服务就绪:', browserService.isReady())

    // 健康检查
    const isHealthy = await browserService.healthCheck()
    logger.info('健康状态:', isHealthy)

    // 尝试导航到可能失败的URL
    try {
      const page = await browserService.navigateTo('https://invalid-url-that-will-fail.com')
      logger.info('不应该到达这里')
    } catch (error) {
      logger.warn('导航失败（预期的）:', error.message)
    }

    // 导航到正常的URL
    const page = await browserService.navigateTo('https://example.com')
    logger.info('成功导航到:', page.url())

    await browserService.releasePage(page)

  } catch (error) {
    logger.error('示例执行失败:', error)

    // 尝试重置服务
    try {
      await browserService.reset()
      logger.info('服务重置成功')
    } catch (resetError) {
      logger.error('服务重置失败:', resetError)
    }
  } finally {
    await browserService.destroy()
  }
}

/**
 * 配置示例
 */
export async function configurationExample(): Promise<void> {
  const browserService = new BrowserService({
    // 基础配置
    headless: true,
    viewport: { width: 1366, height: 768 },
    timeout: 30000,

    // 实例和页面限制
    maxInstances: 2,
    maxPages: 8,

    // 重试配置
    maxRetries: 3,
    retryDelay: 2000,

    // 资源优化
    enableResourceBlocking: true,
    blockedResourceTypes: ['image', 'font', 'media'],
    blockedDomains: ['google-analytics', 'facebook.com'],

    // 页面管理
    pageIdleTimeout: 300000, // 5分钟
    enablePageOptimizations: true,

    // 健康检查
    healthCheckInterval: 60000 // 1分钟
  })

  try {
    await browserService.initialize()

    // 创建页面
    const page = await browserService.createPage({ reuse: true })

    // 导航
    await page.goto('https://example.com')

    // 等待页面稳定
    await browserService.waitForPageStable(page, 10000)

    logger.info('页面处理完成')

    await browserService.releasePage(page)

  } finally {
    await browserService.destroy()
  }
}

/**
 * 运行所有示例
 */
export async function runAllExamples(): Promise<void> {
  const examples = [
    { name: '基本用法', fn: basicUsageExample },
    { name: '并发处理', fn: concurrentUsageExample },
    { name: '页面管理', fn: pageManagementExample },
    { name: '错误处理', fn: errorHandlingExample },
    { name: '配置示例', fn: configurationExample }
  ]

  for (const example of examples) {
    try {
      logger.info(`\n=== 运行示例: ${example.name} ===`)
      await example.fn()
      logger.info(`✅ 示例完成: ${example.name}`)
    } catch (error) {
      logger.error(`❌ 示例失败: ${example.name}`, error)
    }
  }
}
