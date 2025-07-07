/**
 * IPC处理器管理器
 * 统一管理所有IPC处理器的注册和清理
 */
import { registerAlibabaHandlers, cleanupAlibabaService } from './alibaba.handler'
import { registerUpdateHandlers, cleanupUpdateService } from './update.handler'

/**
 * 注册所有IPC处理器
 */
export function registerAllHandlers(): void {
  // 注册阿里巴巴相关处理器
  registerAlibabaHandlers()

  // 注册更新相关处理器
  registerUpdateHandlers()

  // 未来可以在这里添加其他处理器
  // registerOtherHandlers()
}

/**
 * 清理所有服务资源
 */
export async function cleanupAllServices(): Promise<void> {
  // 清理阿里巴巴服务
  await cleanupAlibabaService()

  // 清理更新服务
  await cleanupUpdateService()

  // 未来可以在这里添加其他服务的清理
  // await cleanupOtherServices()
}
