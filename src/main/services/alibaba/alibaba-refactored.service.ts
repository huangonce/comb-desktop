import { Page } from 'playwright-core'
import { BrowserService } from '../browser.service'
import { logger } from '../logger.service'
import { SupplierInfo } from '../../../shared/SupplierInfo'
import { getErrorMessage } from './utils'

/**
 * 重构后的阿里巴巴供应商搜索服务
 * 提供更简洁、健壮的API
 */
export class AlibabaService {
  private browserService: BrowserService

  constructor(browserService?: BrowserService) {
    this.browserService =
      browserService ||
      new BrowserService({
        headless: true,
        maxPages: 5,
        maxInstances: 2,
        enableResourceBlocking: true,
        blockedResourceTypes: ['image', 'font', 'media']
      })
  }

  /**
   * 搜索供应商
   */
  async searchSuppliers(
    keyword: string,
    onPageComplete?: (suppliers: SupplierInfo[], pageNumber: number) => void,
    maxPages?: number
  ): Promise<SupplierInfo[]> {
    logger.info(`开始搜索供应商: ${keyword}`)

    try {
      await this.browserService.initialize()

      // 构建搜索 URL
      const searchUrl = `https://s.1688.com/selloffer/offer_search.htm?keywords=${encodeURIComponent(keyword)}`

      // 导航到搜索页面
      const page = await this.browserService.navigateTo(searchUrl)

      // 等待页面稳定
      await this.browserService.waitForPageStable(page)

      const allSuppliers: SupplierInfo[] = []
      let pageNumber = 1

      while (true) {
        // 检查最大页数限制
        if (maxPages && pageNumber > maxPages) {
          logger.info(`达到最大页数限制: ${maxPages}`)
          break
        }

        logger.info(`处理第 ${pageNumber} 页`)

        // 提取当前页面的供应商信息
        const suppliers = await this.extractSuppliersFromPage(page, pageNumber)

        if (suppliers.length === 0) {
          logger.info('没有找到更多供应商，搜索结束')
          break
        }

        allSuppliers.push(...suppliers)

        // 调用页面完成回调
        if (onPageComplete) {
          onPageComplete(suppliers, pageNumber)
        }

        // 检查是否有下一页
        const hasNextPage = await this.hasNextPage(page)
        if (!hasNextPage) {
          logger.info('没有更多页面')
          break
        }

        // 点击下一页
        await this.goToNextPage(page)
        await this.browserService.waitForPageStable(page)

        pageNumber++
      }

      // 释放页面
      await this.browserService.releasePage(page)

      logger.info(`搜索完成，共找到 ${allSuppliers.length} 个供应商`)
      return allSuppliers
    } catch (error) {
      const errorMessage = getErrorMessage(error)
      logger.error(`搜索供应商失败: ${errorMessage}`)
      throw new Error(`搜索供应商失败: ${errorMessage}`)
    }
  }

  /**
   * 流式搜索供应商
   */
  async *searchSuppliersStream(
    keyword: string,
    maxPages?: number
  ): AsyncGenerator<SupplierInfo, void, unknown> {
    logger.info(`开始流式搜索供应商: ${keyword}`)

    try {
      await this.browserService.initialize()

      // 构建搜索 URL
      const searchUrl = `https://s.1688.com/selloffer/offer_search.htm?keywords=${encodeURIComponent(keyword)}`

      // 导航到搜索页面
      const page = await this.browserService.navigateTo(searchUrl)

      // 等待页面稳定
      await this.browserService.waitForPageStable(page)

      let pageNumber = 1

      while (true) {
        // 检查最大页数限制
        if (maxPages && pageNumber > maxPages) {
          logger.info(`达到最大页数限制: ${maxPages}`)
          break
        }

        logger.info(`处理第 ${pageNumber} 页`)

        // 提取当前页面的供应商信息
        const suppliers = await this.extractSuppliersFromPage(page, pageNumber)

        if (suppliers.length === 0) {
          logger.info('没有找到更多供应商，搜索结束')
          break
        }

        // 逐个yield供应商信息
        for (const supplier of suppliers) {
          yield supplier
        }

        // 检查是否有下一页
        const hasNextPage = await this.hasNextPage(page)
        if (!hasNextPage) {
          logger.info('没有更多页面')
          break
        }

        // 点击下一页
        await this.goToNextPage(page)
        await this.browserService.waitForPageStable(page)

        pageNumber++
      }

      // 释放页面
      await this.browserService.releasePage(page)
    } catch (error) {
      const errorMessage = getErrorMessage(error)
      logger.error(`流式搜索供应商失败: ${errorMessage}`)
      throw new Error(`流式搜索供应商失败: ${errorMessage}`)
    }
  }

  /**
   * 带进度的搜索供应商
   */
  async *searchSuppliersWithProgress(
    keyword: string,
    options: {
      onPageStart?: (pageNumber: number) => void
      onPageComplete?: (suppliers: SupplierInfo[], pageNumber: number, totalFound: number) => void
      onError?: (error: Error, pageNumber: number) => void
      maxPages?: number
    } = {}
  ): AsyncGenerator<
    { suppliers: SupplierInfo[]; pageNumber: number; totalFound: number },
    void,
    unknown
  > {
    const { onPageStart, onPageComplete, onError, maxPages } = options
    let totalFound = 0

    logger.info(`开始带进度搜索供应商: ${keyword}`)

    try {
      await this.browserService.initialize()

      // 构建搜索 URL
      const searchUrl = `https://s.1688.com/selloffer/offer_search.htm?keywords=${encodeURIComponent(keyword)}`

      // 导航到搜索页面
      const page = await this.browserService.navigateTo(searchUrl)

      // 等待页面稳定
      await this.browserService.waitForPageStable(page)

      let pageNumber = 1

      while (true) {
        // 检查最大页数限制
        if (maxPages && pageNumber > maxPages) {
          logger.info(`达到最大页数限制: ${maxPages}`)
          break
        }

        try {
          // 页面开始回调
          if (onPageStart) {
            onPageStart(pageNumber)
          }

          logger.info(`处理第 ${pageNumber} 页`)

          // 提取当前页面的供应商信息
          const suppliers = await this.extractSuppliersFromPage(page, pageNumber)

          if (suppliers.length === 0) {
            logger.info('没有找到更多供应商，搜索结束')
            break
          }

          totalFound += suppliers.length

          // 页面完成回调
          if (onPageComplete) {
            onPageComplete(suppliers, pageNumber, totalFound)
          }

          // yield进度信息
          yield { suppliers, pageNumber, totalFound }

          // 检查是否有下一页
          const hasNextPage = await this.hasNextPage(page)
          if (!hasNextPage) {
            logger.info('没有更多页面')
            break
          }

          // 点击下一页
          await this.goToNextPage(page)
          await this.browserService.waitForPageStable(page)

          pageNumber++
        } catch (error) {
          const err = error instanceof Error ? error : new Error(String(error))
          logger.error(`处理第 ${pageNumber} 页时出错: ${err.message}`)

          if (onError) {
            onError(err, pageNumber)
          }

          // 根据错误类型决定是否继续
          if (err.message.includes('验证码') || err.message.includes('captcha')) {
            logger.error('遇到验证码，停止搜索')
            break
          }

          // 其他错误尝试继续下一页
          pageNumber++
          continue
        }
      }

      // 释放页面
      await this.browserService.releasePage(page)
    } catch (error) {
      const errorMessage = getErrorMessage(error)
      logger.error(`带进度搜索供应商失败: ${errorMessage}`)
      throw new Error(`带进度搜索供应商失败: ${errorMessage}`)
    }
  }

  /**
   * 从页面提取供应商信息
   */
  private async extractSuppliersFromPage(page: Page, pageNumber: number): Promise<SupplierInfo[]> {
    try {
      // 等待供应商卡片加载
      await page.waitForSelector('.factory-card', { timeout: 10000 })

      // 提取供应商信息
      const suppliers = await page.evaluate((currentPage) => {
        const cards = document.querySelectorAll('.factory-card')
        const results: SupplierInfo[] = []

        cards.forEach((card, index) => {
          try {
            const nameElement = card.querySelector('.card-title .detail-info h3 a')
            const name = nameElement?.textContent?.trim() || ''
            const link = nameElement?.getAttribute('href') || ''

            const locationElement = card.querySelector('.card-title .detail-info .location')
            const location = locationElement?.textContent?.trim() || ''

            const mainProductElement = card.querySelector('.card-title .detail-info .main-product')
            const mainProduct = mainProductElement?.textContent?.trim() || ''

            if (name) {
              results.push({
                index: (currentPage - 1) * 20 + index + 1, // 每页20个供应商
                cnName: name,
                enName: '',
                alibabaURL: link.startsWith('//') ? `https:${link}` : link,
                phone: '',
                email: '',
                country: '',
                province: '',
                city: location,
                district: '',
                address: '',
                website: '',
                establishedYear: '',
                creditCode: '',
                companyType: '',
                businessScope: mainProduct,
                yearRange: '',
                tradeCapacity: ''
              })
            }
          } catch (error) {
            console.warn('提取供应商信息失败:', error)
          }
        })

        return results
      }, pageNumber)

      logger.info(`第 ${pageNumber} 页提取到 ${suppliers.length} 个供应商`)
      return suppliers
    } catch (error) {
      logger.error(`提取第 ${pageNumber} 页供应商信息失败:`, error)
      return []
    }
  }

  /**
   * 检查是否有下一页
   */
  private async hasNextPage(page: Page): Promise<boolean> {
    try {
      const nextButton = await page.$('.next-pagination-item.next-btn:not(.next-disabled)')
      return nextButton !== null
    } catch (error) {
      logger.warn('检查下一页失败:', error)
      return false
    }
  }

  /**
   * 跳转到下一页
   */
  private async goToNextPage(page: Page): Promise<void> {
    try {
      const nextButton = await page.$('.next-pagination-item.next-btn:not(.next-disabled)')
      if (nextButton) {
        await nextButton.click()
        // 等待页面跳转
        await page.waitForLoadState('networkidle')
      } else {
        throw new Error('没有找到下一页按钮')
      }
    } catch (error) {
      logger.error('跳转到下一页失败:', error)
      throw error
    }
  }

  /**
   * 销毁服务
   */
  async destroy(): Promise<void> {
    await this.browserService.destroy()
  }
}
