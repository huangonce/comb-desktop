/**
 * 更新服务
 * 负责检查和应用应用程序的更新
 * @module main/services/updater.service.ts
 * @description 该模块使用 electron-updater 库来处理自动更新
 */
import { ipcMain, app } from 'electron'
import {
  autoUpdater,
  type UpdateInfo,
  type ProgressInfo,
  type UpdateDownloadedEvent
} from 'electron-updater'
// import DOMPurify from 'dompurify'
import path from 'path'
import fs from 'fs/promises'
import { getMainWindow } from '../windows/mainWindow'
import { logger } from './logger.service'

// 配置常量
const INITIAL_UPDATE_DELAY = 5_000
// const DEV_MOCK_UPDATE_DELAY = 5_000
const AUTO_INSTALL_ON_QUIT = true

// 确保安全发送消息到渲染进程
function safeSend(channel: string, ...args: unknown[]): void {
  const window = getMainWindow()

  if (window && !window.isDestroyed()) {
    window.webContents.send(channel, ...args)
  }
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function createDevConfig(configPath: string): Promise<void> {
  const configContent = `provider: generic
url: http://localhost:3000/updates
channel: beta`

  try {
    await fs.writeFile(configPath, configContent)
    logger.info('创建开发环境更新配置文件:', configPath)
  } catch (error) {
    const message = getErrorMessage(error)
    logger.error('创建开发环境更新配置失败:', message)
  }
}

// function scheduleMockUpdate(): void {
//   setTimeout(() => {
//     const fakeInfo: UpdateInfo = {
//       version: '1.0.3',
//       releaseDate: new Date().toISOString(),
//       releaseName: 'Dev Environment Mock Update',
//       releaseNotes: `## New Features
// - Added mock update functionality
// - Optimized development experience

// ## Fixes
// - Fixed several known issues`,
//       path: '',
//       sha512: '',
//       files: []
//     }

//     safeSend('update-available', fakeInfo)
//     logger.info('Mock update check: New version 1.0.3 found')
//   }, DEV_MOCK_UPDATE_DELAY)
// }

async function setupDevAutoUpdate(): Promise<void> {
  if (app.isPackaged) return

  const configPath = path.join(app.getAppPath(), 'dev-app-update.yml')

  try {
    await fs.access(configPath)
    autoUpdater.updateConfigPath = configPath
  } catch (error) {
    const message = getErrorMessage(error)
    logger.warn(`开发环境更新配置未找到: ${configPath}`, message)

    await createDevConfig(configPath)
    autoUpdater.updateConfigPath = configPath
  }

  autoUpdater.forceDevUpdateConfig = true

  // setTimeout(() => {
  //   autoUpdater.checkForUpdates().catch((error) => {
  //     logger.error('Startup update check failed:', error)
  //   })
  // }, INITIAL_UPDATE_DELAY)
  // scheduleMockUpdate()
}

function setupListeners(): void {
  autoUpdater.on('update-available', (info: UpdateInfo) => {
    logger.info(`发现新版本: ${info.version}`)
    safeSend('update-available', info)
  })

  autoUpdater.on('update-not-available', (info: UpdateInfo) => {
    logger.info(`已经是最新版本: ${app.getVersion()}`)
    safeSend('update-not-available', info)
  })

  autoUpdater.on('download-progress', (progress: ProgressInfo) => {
    const roundedPercent = Math.floor(progress.percent)
    logger.info(`下载进度: ${roundedPercent}%`)
    safeSend('download-progress', progress)
  })

  autoUpdater.on('update-downloaded', (event: UpdateDownloadedEvent) => {
    logger.info(`更新下载完成: ${event.version}`)
    safeSend('update-downloaded', event)
  })

  autoUpdater.on('error', (error: Error) => {
    logger.error('更新错误:', error)
    // if (!app.isPackaged) {
    //   dialog.showErrorBox('Update Error', error.message)
    // }
    safeSend('update-error', error.message)
  })
}

function setupIpcHandlers(): void {
  ipcMain.handle('check-for-update', async () => {
    try {
      logger.info('开始手动更新检查...')
      await autoUpdater.checkForUpdates()
      logger.info('手动更新检查完成')
    } catch (error) {
      const message = getErrorMessage(error)
      logger.error('手动更新检查失败:', message)
      safeSend('update-error', message)
    }
  })

  ipcMain.handle('start-update-download', () => {
    autoUpdater.downloadUpdate().catch((error) => {
      const message = getErrorMessage(error)
      logger.error('下载更新失败:', message)
      safeSend('update-error', message)
    })
  })

  ipcMain.handle('install-update', () => {
    autoUpdater.quitAndInstall(true, AUTO_INSTALL_ON_QUIT)
  })
}

export const setupAutoUpdate = (): void => {
  // 基本配置
  Object.assign(autoUpdater, {
    autoDownload: false, // 让用户决定是否下载
    autoInstallOnAppQuit: AUTO_INSTALL_ON_QUIT, // 退出时自动安装更新
    allowDowngrade: false, // 不允许降级
    allowPrerelease: false, // 默认不允许预发布版本
    fullChangelog: true // 获取完整的变更日志
  })

  // 开发环境特殊处理
  !app.isPackaged && setupDevAutoUpdate().catch(logger.error)

  // 设置监听器和处理器
  setupListeners()
  setupIpcHandlers()

  // 生产环境自动检查更新
  app.isPackaged &&
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch((error) => {
        logger.error('启动更新检查失败:', error)
      })
    }, INITIAL_UPDATE_DELAY)
}

export const initAutoUpdate = (): void => {
  // 在应用启动时设置自动更新
  setupAutoUpdate()
}
