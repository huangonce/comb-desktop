/**
 * 更新服务
 * 负责检查和应用应用程序的更新
 * @module main/services/updater.service.ts
 * @description 该模块使用 electron-updater 库来处理自动更新
 */

import { BrowserWindow, ipcMain, dialog, app } from 'electron'
import {
  autoUpdater,
  type UpdateInfo,
  type ProgressInfo,
  type UpdateDownloadedEvent
} from 'electron-updater'
import DOMPurify from 'dompurify'
import path from 'path'
import fs from 'fs/promises'
import log from 'electron-log'
import { getMainWindow } from '../windows/mainWindow'

log.transports.file.level = 'info'
log.transports.file.maxSize = 10 * 1024 * 1024 // 设置日志文件最大大小为10MB
log.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}] [{level}] {text}' // 设置日志格式
autoUpdater.logger = log

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
    setupDevAutoUpdate()
    return
  }
}

export const setupDevAutoUpdate = async (): Promise<void> => {
  if (!app.isPackaged) {
    const configPath = path.join(app.getAppPath(), 'dev-app-update.yml')
    try {
      await fs.access(configPath)
      autoUpdater.updateConfigPath = configPath
    } catch (error) {
      log.warn(`开发环境下未找到更新配置文件:${configPath}`, error)

      // 创建示例配置文件
      const sampleConfig = `provider: generic
url: http://localhost:3000/updates
channel: beta`

      await fs.writeFile(configPath, sampleConfig)
      log.info('已创建开发环境更新配置文件:', configPath)
      autoUpdater.updateConfigPath = configPath
    }
  }
}
