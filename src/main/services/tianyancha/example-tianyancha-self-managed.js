/**
 * 天眼查服务自管理浏览器实例示例
 *
 * 演示如何使用新的自管理架构，天眼查服务现在：
 * 1. 内部管理自己的浏览器实例
 * 2. 使用持久化页面保持登录状态
 * 3. 实现更好的登录信息共享
 * 4. 提供独立的资源管理
 */

const { TianyanchaService } = require('../tianyancha.service.ts')

async function demonstrateSelfManagedTianyancha() {
  console.log('=== 天眼查服务自管理浏览器实例演示 ===\n')

  // 创建天眼查服务实例 - 不再需要传入浏览器服务
  const tianyanchaService = new TianyanchaService()

  try {
    console.log('1. 检查初始登录状态...')
    let isLoggedIn = await tianyanchaService.checkLoginStatus()
    console.log(`   登录状态: ${isLoggedIn ? '已登录' : '未登录'}\n`)

    if (!isLoggedIn) {
      console.log('2. 执行自动登录...')
      isLoggedIn = await tianyanchaService.ensureLoggedIn()
      console.log(`   登录结果: ${isLoggedIn ? '成功' : '失败'}\n`)
    }

    if (isLoggedIn) {
      console.log('3. 再次检查登录状态（测试持久化）...')
      const persistentStatus = await tianyanchaService.checkLoginStatus()
      console.log(`   持久化状态: ${persistentStatus ? '保持登录' : '登录失效'}\n`)

      console.log('4. 获取登录信息...')
      const loginInfo = tianyanchaService.getLoginInfo()
      if (loginInfo) {
        console.log('   登录信息:')
        console.log(`   - 用户已登录: ${loginInfo.isLoggedIn}`)
        console.log(`   - 会话有效期: ${new Date(loginInfo.expiresAt).toLocaleString()}`)
        console.log(`   - Cookie数量: ${loginInfo.cookies.length}`)
        console.log(`   - 用户代理: ${loginInfo.userAgent}\n`)
      }
    }

    console.log('5. 架构优势说明:')
    console.log('   ✅ 独立浏览器实例：天眼查登录不影响主采集流程')
    console.log('   ✅ 持久化页面：登录状态在多次检查间保持')
    console.log('   ✅ 资源隔离：登录窗口和采集窗口完全分离')
    console.log('   ✅ 自动清理：服务实例负责自己的资源管理')
    console.log('   ✅ 登录共享：同一服务实例内的所有操作共享登录状态\n')

  } catch (error) {
    console.error('演示过程中出错:', error.message)
  } finally {
    console.log('6. 清理资源...')
    await tianyanchaService.cleanup()
    console.log('   ✅ 天眼查服务资源清理完成')
  }
}

// 架构对比说明
function showArchitectureComparison() {
  console.log('\n=== 架构对比 ===\n')

  console.log('【旧架构 - 外部依赖】:')
  console.log('```javascript')
  console.log('const browserService = new BrowserService()')
  console.log('const tianyancha = new TianyanchaService(browserService)')
  console.log('// 问题：')
  console.log('// - 登录状态容易受到主浏览器实例操作影响')
  console.log('// - 资源管理复杂，需要外部协调')
  console.log('// - 登录窗口可能被主流程干扰')
  console.log('```\n')

  console.log('【新架构 - 自我管理】:')
  console.log('```javascript')
  console.log('const tianyancha = new TianyanchaService()')
  console.log('// 优势：')
  console.log('// - 独立浏览器实例，完全隔离')
  console.log('// - 持久化页面保持登录状态')
  console.log('// - 自动资源管理和清理')
  console.log('// - 更好的登录状态共享')
  console.log('```\n')

  console.log('【实际效果】:')
  console.log('✅ 解决了"浏览器间歇性出现"问题')
  console.log('✅ 登录状态更加稳定和持久')
  console.log('✅ 减少了服务间的耦合度')
  console.log('✅ 提高了整体系统的可靠性')
}

// 运行演示
if (require.main === module) {
  demonstrateSelfManagedTianyancha()
    .then(() => {
      showArchitectureComparison()
      console.log('\n演示完成! 🎉')
    })
    .catch((error) => {
      console.error('演示失败:', error)
      process.exit(1)
    })
}

module.exports = {
  demonstrateSelfManagedTianyancha,
  showArchitectureComparison
}
