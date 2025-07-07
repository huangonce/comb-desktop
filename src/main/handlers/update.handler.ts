/**
 * 更新相关的处理器
 */
import { initAutoUpdate } from '../services/update.service'
import { logger } from '../services/logger.service'

/**
 * 注册更新相关的处理器
 */
export function registerUpdateHandlers(): void {
  try {
    // 初始化自动更新功能
    initAutoUpdate()
    logger.info('自动更新功能已初始化')
  } catch (error) {
    logger.error('初始化自动更新功能失败:', error)
  }
}

/**
 * 清理更新相关的资源
 */
export async function cleanupUpdateService(): Promise<void> {
  // 如果有需要清理的更新资源，可以在这里添加
  logger.info('更新服务已清理')
}
