/**
 * 阿里巴巴供应商搜索 - 流式处理使用示例
 *
 * 这个文件展示了如何使用新的流式API来实时处理供应商数据
 */

import { AlibabaService } from '../alibaba.service'
import { SupplierInfo } from '../../../shared/SupplierInfo'
import { logger } from '../logger.service'

/**
 * 示例1: 基础流式搜索
 * 每采集完一页就立即处理数据
 */
async function basicStreamingExample(): Promise<void> {
  const alibabaService = new AlibabaService()
  const processedSuppliers: SupplierInfo[] = []

  logger.info('开始基础流式搜索示例')

  try {
    for await (const pageSuppliers of alibabaService.searchSuppliersStream('laptop')) {
      logger.info(`获得一页供应商数据: ${pageSuppliers.length} 个`)

      // 立即处理这批数据，无需等待全部完成
      for (const supplier of pageSuppliers) {
        // 这里可以进行数据处理、存储、验证等操作
        processedSuppliers.push(supplier)

        // 模拟处理延迟
        await new Promise((resolve) => setTimeout(resolve, 10))
      }

      logger.info(`已处理供应商总数: ${processedSuppliers.length}`)
    }
  } catch (error) {
    logger.error(`基础流式搜索失败: ${error}`)
  }

  logger.info(`基础流式搜索完成，共处理 ${processedSuppliers.length} 个供应商`)
}

/**
 * 示例2: 带进度回调的流式搜索
 * 提供更丰富的进度反馈和错误处理
 */
async function progressStreamingExample(): Promise<void> {
  const alibabaService = new AlibabaService()
  const processedSuppliers: SupplierInfo[] = []

  logger.info('开始带进度回调的流式搜索示例')

  try {
    for await (const result of alibabaService.searchSuppliersWithProgress('laptop', {
      onPageStart: (pageNumber) => {
        logger.info(`🔄 开始采集第 ${pageNumber} 页`)
      },
      onPageComplete: (suppliers, pageNumber, totalFound) => {
        logger.info(
          `✅ 第 ${pageNumber} 页完成，找到 ${suppliers.length} 个供应商，累计 ${totalFound} 个`
        )
      },
      onError: (error, pageNumber) => {
        logger.error(`❌ 第 ${pageNumber} 页采集失败: ${error.message}`)
      },
      maxPages: 5 // 限制最多采集5页
    })) {
      const { suppliers, pageNumber } = result

      logger.info(`📊 处理第 ${pageNumber} 页的 ${suppliers.length} 个供应商`)

      // 实时处理数据
      for (const supplier of suppliers) {
        // 数据验证
        if (supplier.englishName && supplier.englishName.length > 0) {
          processedSuppliers.push(supplier)
        }
      }

      // 可以在这里更新UI、保存到数据库、发送进度通知等
      logger.info(
        `📈 进度更新: ${pageNumber} 页已完成，累计有效供应商 ${processedSuppliers.length} 个`
      )
    }
  } catch (error) {
    logger.error(`带进度回调的流式搜索失败: ${error}`)
  }

  logger.info(`带进度回调的流式搜索完成，共处理 ${processedSuppliers.length} 个有效供应商`)
}

/**
 * 示例3: 兼容性使用（批量模式）
 * 保持原有的使用方式，等待所有数据采集完成后返回
 */
async function compatibilityExample(): Promise<void> {
  const alibabaService = new AlibabaService()

  logger.info('开始兼容性批量搜索示例')

  try {
    const allSuppliers = await alibabaService.searchSuppliers('laptop')
    logger.info(`获得全部供应商: ${allSuppliers.length} 个`)

    // 批量处理所有数据
    const validSuppliers = allSuppliers.filter(
      (supplier) => supplier.englishName && supplier.englishName.length > 0
    )

    logger.info(`有效供应商: ${validSuppliers.length} 个`)
  } catch (error) {
    logger.error(`兼容性批量搜索失败: ${error}`)
  }
}

/**
 * 示例4: 数据实时存储
 * 每获得一页数据就立即存储，避免内存占用过高
 */
async function realTimeStorageExample(): Promise<void> {
  const alibabaService = new AlibabaService()

  logger.info('开始实时存储示例')

  try {
    let pageCount = 0
    let totalSuppliers = 0

    for await (const pageSuppliers of alibabaService.searchSuppliersStream('laptop')) {
      pageCount++
      totalSuppliers += pageSuppliers.length

      // 立即存储数据（模拟）
      await saveToDatabase(pageSuppliers, pageCount)

      logger.info(
        `第 ${pageCount} 页数据已存储，本页 ${pageSuppliers.length} 个，累计 ${totalSuppliers} 个`
      )

      // 内存清理 - 处理完就可以释放内存
      // 不需要将所有数据保存在内存中
    }

    logger.info(`实时存储完成，共处理 ${pageCount} 页，${totalSuppliers} 个供应商`)
  } catch (error) {
    logger.error(`实时存储失败: ${error}`)
  }
}

/**
 * 示例5: 带错误处理的流式搜索
 * 展示如何处理采集过程中的各种错误情况
 */
async function errorHandlingExample(): Promise<void> {
  const alibabaService = new AlibabaService()
  const processedSuppliers: SupplierInfo[] = []
  let successfulPages = 0
  let failedPages = 0

  logger.info('开始错误处理示例')

  try {
    for await (const result of alibabaService.searchSuppliersWithProgress('laptop', {
      onPageStart: (pageNumber) => {
        logger.info(`🔄 开始采集第 ${pageNumber} 页`)
      },
      onPageComplete: (_suppliers, pageNumber, totalFound) => {
        successfulPages++
        logger.info(
          `✅ 第 ${pageNumber} 页成功，找到 ${_suppliers.length} 个供应商，累计 ${totalFound} 个`
        )
      },
      onError: (error, pageNumber) => {
        failedPages++
        logger.error(`❌ 第 ${pageNumber} 页失败: ${error.message}`)

        // 可以在这里记录错误统计、发送告警等
      },
      maxPages: 10
    })) {
      const { suppliers, pageNumber } = result

      // 数据质量检查
      const validSuppliers = suppliers.filter((supplier) => {
        return (
          supplier.englishName &&
          supplier.englishName.length > 0 &&
          supplier.englishName !== 'undefined'
        )
      })

      processedSuppliers.push(...validSuppliers)

      logger.info(
        `📊 第 ${pageNumber} 页处理完成，有效供应商 ${validSuppliers.length}/${suppliers.length} 个`
      )
    }
  } catch (error) {
    logger.error(`错误处理示例失败: ${error}`)
  }

  logger.info(`错误处理示例完成:`)
  logger.info(`- 成功页面: ${successfulPages}`)
  logger.info(`- 失败页面: ${failedPages}`)
  logger.info(`- 有效供应商: ${processedSuppliers.length}`)
}

/**
 * 示例6: 性能监控示例
 * 展示如何监控搜索性能和资源使用
 */
async function performanceMonitoringExample(): Promise<void> {
  const alibabaService = new AlibabaService()
  const startTime = Date.now()
  let totalSuppliers = 0
  let totalPages = 0

  logger.info('开始性能监控示例')

  try {
    for await (const result of alibabaService.searchSuppliersWithProgress('laptop', {
      onPageStart: (pageNumber) => {
        const elapsedTime = Date.now() - startTime
        logger.info(`⏱️  第 ${pageNumber} 页开始，已耗时 ${elapsedTime}ms`)
      },
      onPageComplete: (_suppliers, pageNumber, totalFound) => {
        totalPages++
        totalSuppliers = totalFound
        const elapsedTime = Date.now() - startTime
        const avgTimePerPage = elapsedTime / totalPages
        const avgSuppliersPerPage = totalSuppliers / totalPages

        logger.info(
          `📈 性能统计: 第 ${pageNumber} 页完成，` +
            `平均每页耗时 ${avgTimePerPage.toFixed(2)}ms，` +
            `平均每页供应商 ${avgSuppliersPerPage.toFixed(2)} 个`
        )
      },
      maxPages: 3 // 限制页数以演示性能监控
    })) {
      const { pageNumber } = result

      // 模拟数据处理耗时
      const processStart = Date.now()
      await new Promise((resolve) => setTimeout(resolve, 50))
      const processTime = Date.now() - processStart

      logger.info(`🔧 第 ${pageNumber} 页数据处理耗时: ${processTime}ms`)
    }
  } catch (error) {
    logger.error(`性能监控示例失败: ${error}`)
  }

  const totalTime = Date.now() - startTime
  logger.info(`性能监控示例完成:`)
  logger.info(`- 总耗时: ${totalTime}ms`)
  logger.info(`- 总页数: ${totalPages}`)
  logger.info(`- 总供应商: ${totalSuppliers}`)
  logger.info(`- 平均每页耗时: ${(totalTime / totalPages).toFixed(2)}ms`)
}

/**
 * 模拟数据库存储
 */
async function saveToDatabase(suppliers: SupplierInfo[], pageNumber: number): Promise<void> {
  // 模拟数据库存储延迟
  await new Promise((resolve) => setTimeout(resolve, 100))

  logger.debug(`模拟存储第 ${pageNumber} 页的 ${suppliers.length} 个供应商到数据库`)
}

/**
 * 运行所有示例
 */
export async function runAllExamples(): Promise<void> {
  logger.info('=== 开始运行所有阿里巴巴供应商搜索示例 ===')

  try {
    await basicStreamingExample()
    await progressStreamingExample()
    await compatibilityExample()
    await realTimeStorageExample()
    await errorHandlingExample()
    await performanceMonitoringExample()
  } catch (error) {
    logger.error(`运行示例时发生错误: ${error}`)
  }

  logger.info('=== 所有示例运行完成 ===')
}

/**
 * 运行特定示例
 */
export async function runSpecificExample(exampleName: string): Promise<void> {
  logger.info(`=== 运行示例: ${exampleName} ===`)

  try {
    switch (exampleName) {
      case 'basic':
        await basicStreamingExample()
        break
      case 'progress':
        await progressStreamingExample()
        break
      case 'compatibility':
        await compatibilityExample()
        break
      case 'storage':
        await realTimeStorageExample()
        break
      case 'error':
        await errorHandlingExample()
        break
      case 'performance':
        await performanceMonitoringExample()
        break
      default:
        logger.warn(`未知示例: ${exampleName}`)
        logger.info('可用示例: basic, progress, compatibility, storage, error, performance')
    }
  } catch (error) {
    logger.error(`运行示例 ${exampleName} 时发生错误: ${error}`)
  }

  logger.info(`=== 示例 ${exampleName} 运行完成 ===`)
}

// 如果直接运行此文件
if (require.main === module) {
  // 可以通过命令行参数指定运行特定示例
  const exampleName = process.argv[2]

  if (exampleName) {
    runSpecificExample(exampleName).catch(console.error)
  } else {
    runAllExamples().catch(console.error)
  }
}
