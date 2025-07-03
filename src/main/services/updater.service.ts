/**
 * 更新服务
 * 负责检查和应用应用程序的更新
 * @module main/services/updater.service.ts
 * @description 该模块使用 electron-updater 库来处理自动更新
 */
import { ipcMain, dialog, app } from 'electron'
import {
  autoUpdater,
  type UpdateInfo,
  type ProgressInfo,
  type UpdateDownloadedEvent
} from 'electron-updater'
import DOMPurify from 'dompurify'
import path from 'path'
import fs from 'fs/promises'
import { getMainWindow } from '../windows/mainWindow'
import { logger } from './logger.service'

// 配置常量
const INITIAL_UPDATE_DELAY = 5_000
const DEV_MOCK_UPDATE_DELAY = 5_000
const AUTO_INSTALL_ON_QUIT = true

// 确保安全发送消息到渲染进程
function safeSend(channel: string, ...args: unknown[]): void {
  const window = getMainWindow()

  if (window && !window.isDestroyed()) {
    window.webContents.send(channel, ...args)
  }
}

function sanitizeUpdateInfo(info: UpdateInfo): UpdateInfo {
  const sanitize = (text: string): string => DOMPurify.sanitize(text || '')

  let releaseNotes = ''
  if (typeof info.releaseNotes === 'string') {
    releaseNotes = sanitize(info.releaseNotes)
  } else if (Array.isArray(info.releaseNotes)) {
    releaseNotes = sanitize(
      info.releaseNotes.map((note) => (typeof note === 'string' ? note : note.note)).join('\n')
    )
  }

  return {
    ...info,
    releaseName: sanitize(info.releaseName || ''),
    releaseNotes,
    releaseDate: info.releaseDate || new Date().toISOString()
  }
}

async function setupDevAutoUpdater(): Promise<void> {
  if (app.isPackaged) return

  const configPath = path.join(app.getAppPath(), 'dev-app-update.yml')

  try {
    await fs.access(configPath)
    autoUpdater.updateConfigPath = configPath
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logger.warn(`Dev update config not found: ${configPath}`, message)

    // 创建示例配置
    await fs.writeFile(
      configPath,
      `provider: generic
url: http://localhost:3000/updates
channel: beta`
    )
    logger.info('Created dev environment update config file:', configPath)
    autoUpdater.updateConfigPath = configPath
  }

  autoUpdater.forceDevUpdateConfig = true

  setTimeout(() => {
    const fakeInfo: UpdateInfo = {
      version: '1.0.3',
      releaseDate: new Date().toISOString(),
      releaseName: 'Dev Environment Mock Update',
      releaseNotes: `## New Features
- Added mock update functionality
- Optimized development experience

## Fixes
- Fixed several known issues`,
      path: '',
      sha512: '',
      files: []
    }

    safeSend('update-available', fakeInfo)
    logger.info('Mock update check: New version 1.0.3 found')
  }, DEV_MOCK_UPDATE_DELAY)
}

function setupAutoUpdaterListeners(): void {
  autoUpdater.on('update-available', (info: UpdateInfo) => {
    logger.info(`New version found: ${info.version}`)
    safeSend('update-available', sanitizeUpdateInfo(info))
  })

  autoUpdater.on('update-not-available', (info: UpdateInfo) => {
    logger.info(`Already on latest version: ${app.getVersion()}`)
    safeSend('update-not-available', sanitizeUpdateInfo(info))
  })

  autoUpdater.on('download-progress', (progress: ProgressInfo) => {
    const roundedPercent = Math.floor(progress.percent)
    logger.info(`Download progress: ${roundedPercent}%`)
    safeSend('download-progress', {
      percent: roundedPercent,
      bytesPerSecond: progress.bytesPerSecond,
      transferred: progress.transferred,
      total: progress.total
    })
  })

  autoUpdater.on('update-downloaded', (event: UpdateDownloadedEvent) => {
    logger.info(`Update downloaded: ${event.version}`)
    safeSend('update-downloaded', sanitizeUpdateInfo(event))
  })

  autoUpdater.on('error', (error: Error) => {
    logger.error('Update error:', error)
    if (!app.isPackaged) {
      dialog.showErrorBox('Update Error', error.message)
    }
    safeSend('update-error', DOMPurify.sanitize(error.message))
  })
}

function setupIpcHandlers(): void {
  ipcMain.handle('check-for-update', async () => {
    console.log('11111111111111')

    try {
      logger.info('Starting manual update check...')
      await autoUpdater.checkForUpdates()
      logger.info('Manual update check completed')
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      logger.error('Manual update check failed:', message)
      safeSend('update-error', DOMPurify.sanitize(message))
    }
  })

  ipcMain.handle('start-update-download', () => {
    autoUpdater.downloadUpdate().catch((error) => {
      const message = error instanceof Error ? error.message : String(error)
      logger.error('Download update failed:', message)
      safeSend('update-error', DOMPurify.sanitize(message))
    })
  })

  ipcMain.handle('install-update', () => {
    autoUpdater.quitAndInstall(true, AUTO_INSTALL_ON_QUIT)
  })
}

export const setupAutoUpdater = (): void => {
  // 基本配置
  Object.assign(autoUpdater, {
    autoDownload: false, // 让用户决定是否下载
    autoInstallOnAppQuit: AUTO_INSTALL_ON_QUIT, // 退出时自动安装更新
    allowDowngrade: false, // 不允许降级
    allowPrerelease: false, // 默认不允许预发布版本
    fullChangelog: true // 获取完整的变更日志
  })

  // 开发环境特殊处理
  !app.isPackaged && setupDevAutoUpdater().catch(logger.error)

  // 设置监听器和处理器
  setupAutoUpdaterListeners()
  setupIpcHandlers()

  // 生产环境自动检查更新
  app.isPackaged &&
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch((error) => {
        logger.error('Startup update check failed:', error)
      })
    }, INITIAL_UPDATE_DELAY)
}

export const initAutoUpdater = (): void => {
  // 在应用启动时设置自动更新
  setupAutoUpdater()
}
