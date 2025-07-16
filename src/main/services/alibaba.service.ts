import { Page } from 'playwright-core'
import { BrowserService } from './browser.service'
import { logger } from './logger.service'
import { SupplierInfo } from '../../shared/SupplierInfo'
import { getErrorMessage } from './alibaba/utils'

// 第三方服务接口
interface OcrService {
  recognize(imageBuffer: Buffer): Promise<string>
}

/**
 * 使用示例：
 *
 * // 1. 基础流式搜索
 * const alibabaService = new AlibabaService()
 *
 * for await (const pageSuppliers of alibabaService.searchSuppliersStream('laptop', undefined, 10)) {
 *   console.log(`获得一页供应商数据: ${pageSuppliers.length} 个`)
 *   // 可以立即处理这批数据，无需等待全部完成
 *   await processSuppliersData(pageSuppliers)
 * }
 *
 * // 2. 带进度回调的流式搜索
 * for await (const result of alibabaService.searchSuppliersWithProgress('laptop', {
 *   onPageStart: (pageNumber) => {
 *     console.log(`开始采集第 ${pageNumber} 页`)
 *   },
 *   onPageComplete: (suppliers, pageNumber, totalFound) => {
 *     console.log(`第 ${pageNumber} 页完成，找到 ${suppliers.length} 个供应商，累计 ${totalFound} 个`)
 *   },
 *   onError: (error, pageNumber) => {
 *     console.error(`第 ${pageNumber} 页采集失败: ${error.message}`)
 *   },
 *   maxPages: 10 // 限制最大页数，如果为 0 或不设置则不限制
 * })) {
 *   const { suppliers, pageNumber, totalFound } = result
 *   console.log(`处理第 ${pageNumber} 页的 ${suppliers.length} 个供应商`)
 *   // 实时处理数据
 * }
 *
 * // 3. 兼容性使用（仍然支持原有的批量模式）
 * const allSuppliers = await alibabaService.searchSuppliers('laptop', 5) // 限制最大5页
 * console.log(`获得全部供应商: ${allSuppliers.length} 个`)
 */

export class AlibabaService {
  private browserService: BrowserService
  private activeSearchTask: Promise<SupplierInfo[]> | null = null
  private activePages: Set<Page> = new Set()
  private ocrService: OcrService | null = null

  // 配置常量
  private static readonly MAX_CONCURRENT_PAGES = 5 // 最大并发页面数
  private static readonly MAX_PAGE_RETRIES = 3 // 每页最大重试次数
  private static readonly BASE_RETRY_DELAY = 3000 // 基础重试延迟（毫秒）

  // 选择器常量
  private static readonly SUPPLIER_CARD_SELECTOR = '.factory-card' // 供应商卡片选择器
  private static readonly COMPANY_NAME_SELECTOR = '.card-title .detail-info h3 a' // 公司名称选择器
  private static readonly CAPTCHA_IMAGE_SELECTOR = '.captcha-image img' // 验证码图片选择器
  private static readonly CAPTCHA_INPUT_SELECTOR = '#captcha-input' // 验证码输入框选择器
  private static readonly CAPTCHA_SUBMIT_SELECTOR = '.captcha-submit' // 验证码提交按钮选择器
  private static readonly SLIDER_SELECTOR = '#nc_1_n1z' // 滑块选择器
  private static readonly CAPTCHA_WRAPPER_SELECTOR = '#nc_1_wrapper' // 验证码容器选择器
  private static readonly CAPTCHA_REFRESH_SELECTOR = '#nc_1_refresh' // 验证码刷新按钮选择器

  constructor(ocrService?: OcrService) {
    this.browserService = new BrowserService()
    this.ocrService = ocrService || null
  }

  /**
   * 搜索阿里巴巴供应商 - 流式处理
   * @param keyword 搜索关键词
   * @param onPageComplete 每页完成时的回调函数
   * @param maxPages 最大页数，如果为 0 或不设置则不限制
   * @returns 异步生成器，产出每页的供应商信息
   */
  async *searchSuppliersStream(
    keyword: string,
    onPageComplete?: (suppliers: SupplierInfo[], pageNumber: number) => void,
    maxPages?: number
  ): AsyncGenerator<SupplierInfo[], void, unknown> {
    if (this.activeSearchTask) {
      logger.warn('已有搜索任务正在进行中，等待当前任务完成')
      return
    }

    try {
      yield* this.executeSupplierSearchStream(keyword, onPageComplete, maxPages)
    } finally {
      this.activeSearchTask = null
      await this.cleanupResources()
    }
  }

  /**
   * 搜索阿里巴巴供应商 - 兼容性方法（保留原有接口）
   * @param keyword 搜索关键词
   * @param maxPages 最大页数，如果为 0 或不设置则不限制
   * @returns 供应商信息列表
   */
  async searchSuppliers(keyword: string, maxPages?: number): Promise<SupplierInfo[]> {
    const allSuppliers: SupplierInfo[] = []

    for await (const pageSuppliers of this.searchSuppliersStream(keyword, undefined, maxPages)) {
      allSuppliers.push(...pageSuppliers)
    }

    return allSuppliers
  }

  /**
   * 清理资源
   */
  private async cleanupResources(): Promise<void> {
    for (const page of this.activePages) {
      if (!page.isClosed()) {
        await page.close().catch((e) => logger.warn(`关闭页面失败: ${getErrorMessage(e)}`))
      }
    }
    this.activePages.clear()
  }

  /**
   * 执行供应商搜索操作 - 流式处理
   * @param keyword 搜索关键词
   * @param onPageComplete 每页完成时的回调函数
   * @param maxPages 最大页数，如果为 0 或不设置则不限制
   */
  private async *executeSupplierSearchStream(
    keyword: string,
    onPageComplete?: (suppliers: SupplierInfo[], pageNumber: number) => void,
    maxPages?: number
  ): AsyncGenerator<SupplierInfo[], void, unknown> {
    //
  }

  /**
   * 搜索阿里巴巴供应商 - 带进度回调的流式处理
   * @param keyword 搜索关键词
   * @param options 搜索选项
   * @returns 异步生成器，产出每页的供应商信息
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
    // 设置最大页数限制，如果 maxPages 为 0 或未设置，则不限制页数
    const { onPageStart, onPageComplete, onError, maxPages } = options
    let totalFound = 0

    try {
      // 初始化浏览器服务
      await this.browserService.initialize()

      let pageNumber = 1
      let hasMoreResults = true
    } catch (error) {
    } finally {
      this.cleanupResources()
    }
  }
}
