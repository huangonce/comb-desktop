import { TianyanchaService } from '../tianyancha.service'
import { BrowserService } from '../browser.service'
import { logger } from '../logger.service'

/**
 * 天眼查服务简单测试
 */
async function testTianyanchaService(): Promise<void> {
  const browserService = new BrowserService()
  const tianyanchaService = new TianyanchaService(browserService)

  try {
    await browserService.initialize()

    logger.info('=== 天眼查服务测试 ===')

    // 1. 测试登录状态检查
    logger.info('1. 检查登录状态...')
    const isLoggedIn = await tianyanchaService.checkLoginStatus()
    logger.info(`登录状态: ${isLoggedIn}`)

    // 2. 获取登录信息
    const loginInfo = tianyanchaService.getLoginInfo()
    if (loginInfo) {
      logger.info('登录信息:', {
        userName: loginInfo.userName || '未知',
        loginTime: new Date(loginInfo.loginTime).toLocaleString(),
        cookiesLength: loginInfo.cookies.length
      })
    } else {
      logger.info('暂无登录信息')
    }

    // 3. 测试确保登录功能
    logger.info('3. 确保登录状态...')
    const ensureResult = await tianyanchaService.ensureLoggedIn()
    logger.info(`确保登录结果: ${ensureResult}`)

    if (ensureResult) {
      logger.info('✅ 天眼查服务测试通过')
    } else {
      logger.warn('⚠️ 天眼查登录未完成')
    }

  } catch (error) {
    logger.error('❌ 天眼查服务测试失败:', error)
  } finally {
    await browserService.destroy()
  }
}

/**
 * 测试 AlibabaService 的天眼查集成
 */
async function testAlibabaServiceIntegration(): Promise<void> {
  // 注意：这个测试需要实际的网络连接和用户交互
  logger.info('=== AlibabaService 天眼查集成测试 ===')
  logger.info('提示：此测试需要用户交互，请在实际环境中运行')

  /*
  const { AlibabaService } = await import('../alibaba.service')
  const alibabaService = new AlibabaService()

  try {
    // 测试搜索前的自动登录检查
    const suppliers = await alibabaService.searchSuppliers('test', 1)
    logger.info(`测试搜索完成，找到 ${suppliers.length} 个供应商`)
  } catch (error) {
    logger.error('集成测试失败:', error)
  }
  */
}

// 导出测试函数
export { testTianyanchaService, testAlibabaServiceIntegration }

// 如果直接运行此文件，执行测试
if (require.main === module) {
  (async () => {
    await testTianyanchaService()
    await testAlibabaServiceIntegration()
  })().catch(error => {
    logger.error('测试执行失败:', error)
    process.exit(1)
  })
}
