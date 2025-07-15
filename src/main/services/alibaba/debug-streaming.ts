/**
 * 阿里巴巴搜索流式数据调试工具
 *
 * 用于诊断数据丢失、重复等问题
 */

import { AlibabaService } from '../alibaba.service'
import { SupplierInfo } from '../../../shared/SupplierInfo'
import { logger } from '../logger.service'

/**
 * 调试流式搜索数据一致性
 */
export async function debugStreamingDataConsistency(keyword: string): Promise<void> {
  const alibabaService = new AlibabaService()

  logger.info('=== 开始调试流式搜索数据一致性 ===')

  // 统计数据
  const pageStats: Array<{
    pageNumber: number
    supplierCount: number
    suppliers: SupplierInfo[]
  }> = []

  let totalSuppliers = 0
  let totalPages = 0

  try {
    // 使用带进度的流式搜索
    for await (const result of alibabaService.searchSuppliersWithProgress(keyword, {
      onPageStart: (pageNumber) => {
        logger.info(`🔄 开始采集第 ${pageNumber} 页`)
      },
      onPageComplete: (suppliers, pageNumber, totalFound) => {
        logger.info(`✅ 第 ${pageNumber} 页完成:`)
        logger.info(`  - 本页供应商: ${suppliers.length}`)
        logger.info(`  - 累计供应商: ${totalFound}`)
        logger.info(`  - 实际累计: ${totalSuppliers + suppliers.length}`)

        // 检查是否有重复的供应商
        const duplicates = findDuplicatesInPage(suppliers)
        if (duplicates.length > 0) {
          logger.warn(`  - 本页重复供应商: ${duplicates.length}`)
          duplicates.forEach((dup) => {
            logger.warn(`    重复: ${dup.englishName} (${dup.albabaURL})`)
          })
        }
      },
      onError: (error, pageNumber) => {
        logger.error(`❌ 第 ${pageNumber} 页失败: ${error.message}`)
      },
      maxPages: 10 // 限制页数便于调试
    })) {
      const { suppliers, pageNumber, totalFound } = result

      // 记录页面统计
      pageStats.push({
        pageNumber,
        supplierCount: suppliers.length,
        suppliers: [...suppliers] // 深拷贝
      })

      totalSuppliers += suppliers.length
      totalPages++

      logger.info(`📊 第 ${pageNumber} 页数据分析:`)
      logger.info(`  - 供应商数量: ${suppliers.length}`)
      logger.info(
        `  - 有效英文名称: ${suppliers.filter((s) => s.englishName && s.englishName.length > 0).length}`
      )
      logger.info(
        `  - 有效URL: ${suppliers.filter((s) => s.albabaURL && s.albabaURL.length > 0).length}`
      )
      logger.info(`  - 累计总数: ${totalSuppliers}`)
      logger.info(`  - 后端报告总数: ${totalFound}`)

      // 检查数据质量
      const dataQuality = analyzeDataQuality(suppliers)
      logger.info(`  - 数据质量: ${JSON.stringify(dataQuality)}`)
    }
  } catch (error) {
    logger.error(`调试过程中发生错误: ${error}`)
  }

  // 最终统计分析
  logger.info('=== 最终统计分析 ===')
  logger.info(`总页数: ${totalPages}`)
  logger.info(`总供应商数: ${totalSuppliers}`)
  logger.info(`平均每页供应商: ${(totalSuppliers / totalPages).toFixed(2)}`)

  // 检查跨页面重复
  const allSuppliers = pageStats.flatMap((stat) => stat.suppliers)
  const crossPageDuplicates = findCrossPageDuplicates(allSuppliers)

  if (crossPageDuplicates.length > 0) {
    logger.warn(`发现跨页面重复供应商: ${crossPageDuplicates.length}`)
    crossPageDuplicates.forEach((dup) => {
      logger.warn(`  重复: ${dup.englishName} (${dup.albabaURL})`)
    })
  }

  // 统计每页数据质量
  pageStats.forEach((stat) => {
    const quality = analyzeDataQuality(stat.suppliers)
    logger.info(`第 ${stat.pageNumber} 页质量统计: ${JSON.stringify(quality)}`)
  })

  logger.info('=== 调试完成 ===')
}

/**
 * 查找页面内重复供应商
 */
function findDuplicatesInPage(suppliers: SupplierInfo[]): SupplierInfo[] {
  const seen = new Set<string>()
  const duplicates: SupplierInfo[] = []

  for (const supplier of suppliers) {
    const key = `${supplier.englishName}-${supplier.albabaURL}`
    if (seen.has(key)) {
      duplicates.push(supplier)
    } else {
      seen.add(key)
    }
  }

  return duplicates
}

/**
 * 查找跨页面重复供应商
 */
function findCrossPageDuplicates(allSuppliers: SupplierInfo[]): SupplierInfo[] {
  const seen = new Map<string, SupplierInfo>()
  const duplicates: SupplierInfo[] = []

  for (const supplier of allSuppliers) {
    const key = `${supplier.englishName}-${supplier.albabaURL}`
    if (seen.has(key)) {
      duplicates.push(supplier)
    } else {
      seen.set(key, supplier)
    }
  }

  return duplicates
}

/**
 * 分析数据质量
 */
function analyzeDataQuality(suppliers: SupplierInfo[]): {
  total: number
  withEnglishName: number
  withURL: number
  withPhone: number
  withEmail: number
  withAddress: number
  complete: number
} {
  return {
    total: suppliers.length,
    withEnglishName: suppliers.filter((s) => s.englishName && s.englishName.length > 0).length,
    withURL: suppliers.filter((s) => s.albabaURL && s.albabaURL.length > 0).length,
    withPhone: suppliers.filter((s) => s.phone && s.phone.length > 0).length,
    withEmail: suppliers.filter((s) => s.email && s.email.length > 0).length,
    withAddress: suppliers.filter((s) => s.address && s.address.length > 0).length,
    complete: suppliers.filter(
      (s) =>
        s.englishName &&
        s.englishName.length > 0 &&
        s.albabaURL &&
        s.albabaURL.length > 0 &&
        s.phone &&
        s.phone.length > 0
    ).length
  }
}

/**
 * 调试前端数据累积逻辑
 */
export function debugFrontendDataAccumulation(): void {
  logger.info('=== 前端数据累积调试建议 ===')

  logger.info('1. 检查 AlibabaView.vue 中的数据处理逻辑:')
  logger.info('   - handleSearchPageComplete 函数是否正确累积数据')
  logger.info('   - 是否存在数据过滤或去重逻辑')
  logger.info('   - suppliers.value.push(...data.suppliers) 是否正确执行')

  logger.info('2. 建议在前端添加数据去重逻辑:')
  logger.info(`   const uniqueSuppliers = suppliers.value.filter((supplier, index, self) =>
     index === self.findIndex(s => s.englishName === supplier.englishName && s.albabaURL === supplier.albabaURL)
   )`)

  logger.info('3. 建议添加详细的前端日志:')
  logger.info('   - 每次接收到数据时记录数量')
  logger.info('   - 累积后的总数量')
  logger.info('   - 是否有数据被过滤掉')

  logger.info('4. 检查是否有条件渲染导致显示不全:')
  logger.info('   - 模板中是否有 v-if 或 v-show 条件')
  logger.info('   - 分页逻辑是否正确')
  logger.info('   - 数据绑定是否正确')
}

/**
 * 运行完整的调试套件
 */
export async function runFullDebugSuite(keyword: string = 'laptop'): Promise<void> {
  logger.info('=== 开始运行完整调试套件 ===')

  // 1. 调试后端数据一致性
  await debugStreamingDataConsistency(keyword)

  // 2. 提供前端调试建议
  debugFrontendDataAccumulation()

  logger.info('=== 调试套件运行完成 ===')
}

// 如果直接运行此文件
if (require.main === module) {
  const keyword = process.argv[2] || 'laptop'
  runFullDebugSuite(keyword).catch(console.error)
}
