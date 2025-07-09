/**
 * 阿里巴巴相关的IPC处理器
 */
import { ipcMain, IpcMainInvokeEvent } from 'electron'
import { AlibabaService } from '../services/alibaba.service'
import { logger } from '../services/logger.service'
import { ALIBABA_CHANNELS } from '../../shared/ipc-channels'

// 创建阿里巴巴服务实例
const alibabaService = new AlibabaService()

/**
 * 注册阿里巴巴相关的IPC处理器
 */
export function registerAlibabaHandlers(): void {
  // 阿里巴巴供应商搜索IPC处理
  ipcMain.handle(
    ALIBABA_CHANNELS.SEARCH_SUPPLIERS,
    async (event: IpcMainInvokeEvent, keyword: string) => {
      try {
        logger.info(`开始搜索阿里巴巴供应商，关键词: ${keyword}`)

        // 发送进度更新
        event.sender.send(ALIBABA_CHANNELS.SEARCH_PROGRESS, '正在初始化浏览器...')

        const suppliers = await alibabaService.searchSuppliers(keyword)

        // 发送完成事件
        event.sender.send(ALIBABA_CHANNELS.SEARCH_COMPLETE, suppliers)

        logger.info(`搜索完成，找到 ${suppliers.length} 个供应商`)
        return { success: true, data: suppliers }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        logger.error('搜索阿里巴巴供应商失败:', error)

        // 发送错误事件
        event.sender.send(ALIBABA_CHANNELS.SEARCH_ERROR, errorMessage)

        return { success: false, error: errorMessage }
      }
    }
  )
}

/**
 * 清理阿里巴巴服务资源
 */
export async function cleanupAlibabaService(): Promise<void> {
  //
}
