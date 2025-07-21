import { AlibabaService } from '../alibaba.service'
import { logger } from '../logger.service'

/**
 * 天眼查登录集成使用示例
 * 演示如何在阿里巴巴供应商搜索之前自动处理天眼查登录
 */

async function runTianyanchaIntegrationExample(): Promise<void> {
  const alibabaService = new AlibabaService()

  try {
    logger.info('=== 天眼查登录集成示例 ===')

    // 1. 检查当前天眼查登录状态
    logger.info('1. 检查天眼查登录状态...')
    const isLoggedIn = await alibabaService.getTianyanchaLoginStatus()
    logger.info(`当前登录状态: ${isLoggedIn ? '已登录' : '未登录'}`)

    if (isLoggedIn) {
      const loginInfo = alibabaService.getTianyanchaLoginInfo()
      if (loginInfo) {
        logger.info('登录信息:', {
          userName: loginInfo.userName || '未知',
          loginTime: new Date(loginInfo.loginTime).toLocaleString(),
          isValid: true
        })
      }
    }

    // 2. 手动触发登录（可选）
    if (!isLoggedIn) {
      logger.info('2. 触发天眼查登录窗口...')
      const loginSuccess = await alibabaService.loginTianyancha()
      if (loginSuccess) {
        logger.info('手动登录成功')
      } else {
        logger.warn('手动登录失败或用户取消')
        return
      }
    }

    // 3. 开始搜索供应商（会自动检查和处理登录）
    logger.info('3. 开始搜索供应商（集成天眼查登录检查）...')

    let totalSuppliers = 0
    for await (const pageSuppliers of alibabaService.searchSuppliersStream('laptop', undefined, 3)) {
      totalSuppliers += pageSuppliers.length
      logger.info(`获得一页供应商: ${pageSuppliers.length} 个，累计: ${totalSuppliers} 个`)

      // 显示前3个供应商信息
      pageSuppliers.slice(0, 3).forEach((supplier, index) => {
        logger.info(`  ${index + 1}. ${supplier.cnName}`)
        logger.info(`     URL: ${supplier.alibabaURL}`)
        logger.info(`     地址: ${supplier.address}`)
      })
    }

    logger.info(`搜索完成，共找到 ${totalSuppliers} 个供应商`)

  } catch (error) {
    logger.error('天眼查集成示例失败:', error)
  }
}

async function runProgressExample(): Promise<void> {
  const alibabaService = new AlibabaService()

  try {
    logger.info('=== 带进度回调的天眼查集成示例 ===')

    // 使用带进度回调的搜索方法
    for await (const result of alibabaService.searchSuppliersWithProgress('smartphone', {
      onPageStart: (pageNumber) => {
        logger.info(`开始采集第 ${pageNumber} 页`)
      },
      onPageComplete: (suppliers, pageNumber, totalFound) => {
        logger.info(`第 ${pageNumber} 页完成，找到 ${suppliers.length} 个供应商，累计 ${totalFound} 个`)
      },
      onError: (error, pageNumber) => {
        logger.error(`第 ${pageNumber} 页采集失败: ${error.message}`)
      },
      maxPages: 2 // 限制最大页数
    })) {
      const { suppliers, pageNumber, totalFound } = result
      logger.info(`处理第 ${pageNumber} 页的 ${suppliers.length} 个供应商，累计 ${totalFound} 个`)
    }

  } catch (error) {
    logger.error('进度示例失败:', error)
  }
}

async function runLoginManagementExample(): Promise<void> {
  const alibabaService = new AlibabaService()

  try {
    logger.info('=== 天眼查登录管理示例 ===')

    // 1. 检查登录状态
    const isLoggedIn = await alibabaService.getTianyanchaLoginStatus()
    logger.info(`当前登录状态: ${isLoggedIn}`)

    // 2. 如果已登录，显示登录信息
    if (isLoggedIn) {
      const loginInfo = alibabaService.getTianyanchaLoginInfo()
      logger.info('当前登录信息:', loginInfo)

      // 3. 清除登录信息（演示）
      logger.info('清除登录信息...')
      alibabaService.clearTianyanchaLogin()

      // 4. 再次检查状态
      const statusAfterClear = await alibabaService.getTianyanchaLoginStatus()
      logger.info(`清除后的登录状态: ${statusAfterClear}`)
    }

    // 5. 重新登录
    logger.info('重新登录天眼查...')
    const loginSuccess = await alibabaService.loginTianyancha()
    logger.info(`重新登录结果: ${loginSuccess}`)

  } catch (error) {
    logger.error('登录管理示例失败:', error)
  }
}

// 导出示例函数供其他模块调用
export {
  runTianyanchaIntegrationExample,
  runProgressExample,
  runLoginManagementExample
}

// 如果直接运行此文件，执行示例
if (require.main === module) {
  (async () => {
    await runTianyanchaIntegrationExample()
    await new Promise(resolve => setTimeout(resolve, 5000)) // 等待5秒
    await runProgressExample()
    await new Promise(resolve => setTimeout(resolve, 5000)) // 等待5秒
    await runLoginManagementExample()
  })().catch(error => {
    logger.error('示例执行失败:', error)
    process.exit(1)
  })
}
