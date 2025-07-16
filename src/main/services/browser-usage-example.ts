/**
 * 浏览器服务使用示例
 */

import { BrowserService } from './browser.service'
import { logger } from './logger.service'

// 基本用法示例
export async function basicUsage(): Promise<void> {
  const browserService = new BrowserService()
  await browserService.initialize()

  const pageWrapper = await browserService.getPage()
  await pageWrapper.page.goto('https://example.com')
  const title = await pageWrapper.page.title()
  logger.info(`页面标题: ${title}`)

  await browserService.releasePage(pageWrapper)
  await browserService.terminate()
}

// 多实例示例
export async function multiInstanceUsage(): Promise<void> {
  const browserService = new BrowserService({ maxInstances: 3, maxPages: 5 })
  await browserService.initialize()

  const page1 = await browserService.getPage({ instanceId: 'instance-1' })
  const page2 = await browserService.getPage({ instanceId: 'instance-2' })

  await Promise.all([
    page1.page.goto('https://example.com'),
    page2.page.goto('https://google.com')
  ])

  const titles = await Promise.all([
    page1.page.title(),
    page2.page.title()
  ])

  logger.info('页面标题:', titles)

  await Promise.all([
    browserService.releasePage(page1),
    browserService.releasePage(page2)
  ])

  await browserService.terminate()
}

// 页面池复用示例
export async function pagePoolUsage(): Promise<void> {
  const browserService = new BrowserService()
  await browserService.initialize()

  const pages = await Promise.all([
    browserService.getPage(),
    browserService.getPage(),
    browserService.getPage()
  ])

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
  await browserService.terminate()
}
