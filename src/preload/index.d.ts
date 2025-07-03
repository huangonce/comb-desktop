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
