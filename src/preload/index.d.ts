/**
 * @file Electron 更新 API 的预加载脚本
 * @description 此文件定义了 Electron 应用预加载脚本中使用的 Electron 更新 API 的类型和接口。
 * @module preload/index.d.ts
 */
import { ElectronAPI } from '@electron-toolkit/preload'
import type { UpdateInfo, ProgressInfo, UpdateDownloadedEvent } from 'electron-updater'

interface ElectronUpdaterAPI {
  onUpdateAvailable: (callback: (info: UpdateInfo) => void) => void
  onUpdateNotAvailable: (callback: (info: UpdateInfo) => void) => void
  onDownloadProgress: (callback: (progress: ProgressInfo) => void) => void
  onUpdateDownloaded: (callback: (event: UpdateDownloadedEvent) => void) => void
  onUpdateError: (callback: (error: string) => void) => void

  checkForUpdate: () => Promise<void>
  startUpdateDownload: () => Promise<void>
  installUpdate: () => Promise<void>
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: ElectronUpdaterAPI
  }
}
