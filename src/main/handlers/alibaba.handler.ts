/**
 * 阿里巴巴相关的IPC处理器
 */
import { ipcMain, IpcMainInvokeEvent } from 'electron'
import { AlibabaService } from '../services/alibaba.service'
import { logger } from '../services/logger.service'
import { ALIBABA_CHANNELS } from '../../shared/ipc-channels'

// 创建阿里巴巴服务实例
const alibabaService = new AlibabaService()

// 当前搜索的控制器
let currentSearchController: AbortController | null = null

/**
 * 注册阿里巴巴相关的IPC处理器
 */
export function registerAlibabaHandlers(): void {
  // 阿里巴巴供应商搜索IPC处理 - 兼容性方法
  ipcMain.handle(
    ALIBABA_CHANNELS.SEARCH_SUPPLIERS,
    async (event: IpcMainInvokeEvent, keyword: string, maxPages?: number) => {
      try {
        logger.info(`开始搜索阿里巴巴供应商，关键词: ${keyword}`)

        // 发送进度更新
        event.sender.send(ALIBABA_CHANNELS.SEARCH_PROGRESS, '正在初始化浏览器...')

        const suppliers = await alibabaService.searchSuppliers(keyword, maxPages)

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

  // 阿里巴巴供应商流式搜索IPC处理 - 新方法
  ipcMain.handle(
    ALIBABA_CHANNELS.SEARCH_SUPPLIERS_STREAM,
    async (event: IpcMainInvokeEvent, keyword: string, maxPages?: number) => {
      try {
        logger.info(`开始流式搜索阿里巴巴供应商，关键词: ${keyword}`)

        // 创建新的控制器
        currentSearchController = new AbortController()

        // 发送进度更新
        event.sender.send(ALIBABA_CHANNELS.SEARCH_PROGRESS, '正在初始化浏览器...')

        let totalSuppliers = 0

        // 使用流式搜索
        for await (const result of alibabaService.searchSuppliersWithProgress(keyword, {
          onPageStart: (pageNumber) => {
            event.sender.send(ALIBABA_CHANNELS.SEARCH_PAGE_START, {
              pageNumber,
              message: `开始采集第 ${pageNumber} 页`
            })
          },
          onPageComplete: (suppliers, pageNumber, totalFound) => {
            event.sender.send(ALIBABA_CHANNELS.SEARCH_PAGE_COMPLETE, {
              suppliers,
              pageNumber,
              totalFound,
              message: `第 ${pageNumber} 页完成，找到 ${suppliers.length} 个供应商`
            })
          },
          onError: (error, pageNumber) => {
            event.sender.send(ALIBABA_CHANNELS.SEARCH_ERROR, {
              error: error.message,
              pageNumber,
              message: `第 ${pageNumber} 页采集失败: ${error.message}`
            })
          },
          maxPages // 使用传入的最大页数
        })) {
          // 检查是否被取消
          if (currentSearchController?.signal.aborted) {
            logger.info('流式搜索被用户取消')
            break
          }

          const { suppliers, pageNumber, totalFound } = result
          totalSuppliers = totalFound

          // 发送页面完成事件（实时数据）
          event.sender.send(ALIBABA_CHANNELS.SEARCH_PAGE_COMPLETE, {
            suppliers,
            pageNumber,
            totalFound,
            message: `第 ${pageNumber} 页完成，找到 ${suppliers.length} 个供应商，累计 ${totalFound} 个`
          })

          // 发送进度更新
          event.sender.send(
            ALIBABA_CHANNELS.SEARCH_PROGRESS,
            `已完成第 ${pageNumber} 页，累计找到 ${totalFound} 个供应商`
          )
        }

        // 发送最终完成事件
        event.sender.send(ALIBABA_CHANNELS.SEARCH_COMPLETE, {
          totalSuppliers,
          message: `流式搜索完成，共找到 ${totalSuppliers} 个供应商`
        })

        logger.info(`流式搜索完成，找到 ${totalSuppliers} 个供应商`)
        return { success: true, totalSuppliers }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        logger.error('流式搜索阿里巴巴供应商失败:', error)

        // 发送错误事件
        event.sender.send(ALIBABA_CHANNELS.SEARCH_ERROR, {
          error: errorMessage,
          message: `搜索失败: ${errorMessage}`
        })

        return { success: false, error: errorMessage }
      } finally {
        currentSearchController = null
      }
    }
  )

  // 取消搜索
  ipcMain.handle(ALIBABA_CHANNELS.SEARCH_CANCEL, async () => {
    if (currentSearchController) {
      currentSearchController.abort()
      logger.info('用户取消了搜索操作')
      return { success: true }
    }
    return { success: false, message: '没有正在进行的搜索任务' }
  })
}

/**
 * 清理阿里巴巴服务资源
 */
export async function cleanupAlibabaService(): Promise<void> {
  //
}
