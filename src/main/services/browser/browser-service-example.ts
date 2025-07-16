/**
 * 浏览器服务使用示例
 * 展示如何使用新的多实例和页面池功能
 */

import { BrowserService } from '../browser.service'
import { logger } from '../logger.service'

// 示例1: 基本用法
export async function basicUsage(): Promise<void> {
  const browserService = new BrowserService()

  try {
    // 初始化服务
    await browserService.initialize()

    // 获取页面
    const pageWrapper = await browserService.createPage()

    // 导航到URL
    await pageWrapper.page.goto('https://example.com')

    // 使用页面
    const title = await pageWrapper.page.title()
    logger.info(`页面标题: ${title}`)

    // 释放页面（返回到池中）
    await browserService.releasePage(pageWrapper)
  } finally {
    await browserService.terminate()
  }
}

// 示例2: 多实例使用
export async function multiInstanceUsage() {
  const browserService = new BrowserService({
    maxInstances: 3,
    maxPages: 5
  })

  try {
    await browserService.initialize()

    // 获取不同实例的页面
    const page1 = await browserService.getPage({ instanceId: 'instance-1' })
    const page2 = await browserService.getPage({ instanceId: 'instance-2' })
    const page3 = await browserService.getPage({ instanceId: 'instance-3' })

    // 并行处理多个页面
    await Promise.all([
      page1.page.goto('https://example.com'),
      page2.page.goto('https://google.com'),
      page3.page.goto('https://github.com')
    ])

    // 获取所有页面的标题
    const titles = await Promise.all([page1.page.title(), page2.page.title(), page3.page.title()])

    logger.info('页面标题:', titles)

    // 释放所有页面
    await Promise.all([
      browserService.releasePage(page1),
      browserService.releasePage(page2),
      browserService.releasePage(page3)
    ])
  } finally {
    await browserService.terminate()
  }
}

// 示例3: 页面池复用
export async function pagePoolUsage() {
  const browserService = new BrowserService()

  try {
    await browserService.initialize()

    // 创建多个页面
    const pages = await Promise.all([
      browserService.getPage(),
      browserService.getPage(),
      browserService.getPage()
    ])

    // 使用页面
    for (const pageWrapper of pages) {
      await pageWrapper.page.goto('https://example.com')
      const title = await pageWrapper.page.title()
      logger.info(`页面标题: ${title}`)
    }

    // 释放页面到池中
    for (const pageWrapper of pages) {
      await browserService.releasePage(pageWrapper)
    }

    // 重新获取页面（应该复用之前的页面）
    const reusedPage = await browserService.getPage({ reuseIdle: true })
    logger.info(`复用页面: ${reusedPage.id}`)

    await browserService.releasePage(reusedPage)
  } finally {
    await browserService.terminate()
  }
}

// 示例4: 与现有代码兼容
export async function legacyCompatibility() {
  const browserService = new BrowserService()

  try {
    await browserService.initialize()

    // 使用传统方式获取页面
    const page = await browserService.getActivePage()

    // 或者创建额外页面
    const additionalPage = await browserService.createAdditionalPage()

    // 使用页面
    await page.goto('https://example.com')
    await additionalPage.goto('https://google.com')

    logger.info('页面标题:', await page.title())
    logger.info('额外页面标题:', await additionalPage.title())

    // 关闭额外页面
    await additionalPage.close()
  } finally {
    await browserService.terminate()
  }
}

// 示例5: 错误处理和健康检查
export async function errorHandlingExample() {
  const browserService = new BrowserService()

  try {
    await browserService.initialize()

    // 检查服务状态
    logger.info('服务状态:', browserService.getState())
    logger.info('服务就绪:', browserService.isReady())

    // 健康检查
    const isHealthy = await browserService.checkHealth()
    logger.info('健康状态:', isHealthy)

    // 获取页面
    const pageWrapper = await browserService.getPage()

    try {
      // 尝试导航到一个可能失败的URL
      await pageWrapper.page.goto('https://invalid-url-that-might-fail.com')
    } catch (error) {
      logger.error('导航失败:', error)
      // 页面仍然可用，可以导航到其他URL
      await pageWrapper.page.goto('https://example.com')
    }

    await browserService.releasePage(pageWrapper)
  } finally {
    await browserService.terminate()
  }
}
