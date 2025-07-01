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

// 确保安全发送消息到渲染进程
function safeSend(channel: string, ...args: unknown[]): void {
  const window = getMainWindow()

  if (window && !window.isDestroyed()) {
    window.webContents.send(channel, ...args)
  }
}

export const setupAutoUpdater = (): void => {
  // 配置自动更新
  autoUpdater.autoDownload = false // 让用户决定是否下载
  autoUpdater.autoInstallOnAppQuit = true // 退出时自动安装更新
  autoUpdater.allowDowngrade = false // 不允许降级
  autoUpdater.allowPrerelease = false // 默认不允许预发布版本
  autoUpdater.fullChangelog = true // 获取完整的变更日志

  if (!app.isPackaged) {
    setupDevAutoUpdater().catch((error) => {
      logger.error('Dev environment auto-update setup failed:', error)
    })
  }

  ipcMain.handle('check-for-update', async () => {
    try {
      logger.info('Starting update check...')
      await autoUpdater.checkForUpdates()
      logger.info('Manual update check completed')
    } catch (error: Error | unknown) {
      logger.error('Manual update check failed:', error)
      const errorMessage = error instanceof Error ? error.message : String(error)
      safeSend('update-error', DOMPurify.sanitize(errorMessage))
    }
  })

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

  ipcMain.handle('start-update-download', async () => {
    autoUpdater.downloadUpdate().catch((err) => {
      logger.error('Download update failed:', err)
      safeSend('update-error', DOMPurify.sanitize(err.message))
    })
  })

  ipcMain.handle('install-update', async () => {
    autoUpdater.quitAndInstall(true, true) // 退出前不提示用户
  })

  if (app.isPackaged) {
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch((err) => {
        logger.error('Startup update check failed:', err)
      })
    }, 5000) // 延迟5秒检查，让应用完全启动
  }
}

export const setupDevAutoUpdater = async (): Promise<void> => {
  if (!app.isPackaged) {
    const configPath = path.join(app.getAppPath(), 'dev-app-update.yml')
    try {
      await fs.access(configPath)
      autoUpdater.updateConfigPath = configPath
    } catch (error) {
      logger.warn(`Update config file not found in dev environment: ${configPath}`, error)

      // Create sample config file
      const sampleConfig = `provider: generic
url: http://localhost:3000/updates
channel: beta`

      await fs.writeFile(configPath, sampleConfig)
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
    }, 10000)
  }
}

export const initAutoUpdater = (): void => {
  // 在应用启动时设置自动更新
  setupAutoUpdater()
}

function sanitizeUpdateInfo(info: UpdateInfo): UpdateInfo {
  return {
    ...info,
    releaseName: DOMPurify.sanitize(info.releaseName || ''),
    releaseNotes: DOMPurify.sanitize(
      typeof info.releaseNotes === 'string'
        ? info.releaseNotes
        : Array.isArray(info.releaseNotes)
          ? info.releaseNotes
              .map((note) => (typeof note === 'string' ? note : note.note))
              .join('\n')
          : ''
    ),
    releaseDate: info.releaseDate || new Date().toISOString()
  }
}
