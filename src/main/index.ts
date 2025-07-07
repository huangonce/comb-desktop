import { app, BrowserWindow, ipcMain } from 'electron'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { createMainWindow } from './windows/mainWindow'
import { initAutoUpdate } from './services/update.service'
import { logger } from './services/logger.service'
import { AlibabaService } from './services/alibaba.service'
import { ALIBABA_CHANNELS } from '../shared/ipc-channels'

// 创建阿里巴巴服务实例
const alibabaService = new AlibabaService()

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC test
  ipcMain.on('ping', () => console.log('pong'))

  // 阿里巴巴供应商搜索IPC处理
  ipcMain.handle(ALIBABA_CHANNELS.SEARCH_SUPPLIERS, async (event, keyword: string) => {
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
  })

  const mainWindow = createMainWindow({
    width: 1600,
    height: 1000
  })
  logger.info('Main Window:', mainWindow.id)

  initAutoUpdate()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', async () => {
  // 关闭阿里巴巴服务的浏览器
  await alibabaService.closeBrowser()

  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
