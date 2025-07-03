import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { UpdateInfo, ProgressInfo, UpdateDownloadedEvent } from 'electron-updater'

// 自动更新事件通道
const UPDATE_EVENTS = {
  AVAILABLE: 'update-available',
  NOT_AVAILABLE: 'update-not-available',
  PROGRESS: 'download-progress',
  DOWNLOADED: 'update-downloaded',
  ERROR: 'update-error'
}

// 自动更新操作通道
const UPDATE_ACTIONS = {
  CHECK: 'check-for-update',
  DOWNLOAD: 'start-update-download',
  INSTALL: 'install-update'
}

const updaterAPI = {
  onUpdateAvailable: (callback: (info: UpdateInfo) => void) => {
    ipcRenderer.on(UPDATE_EVENTS.AVAILABLE, (_, info: UpdateInfo) => callback(info))
  },
  onUpdateNotAvailable: (callback: (info: UpdateInfo) => void) => {
    ipcRenderer.on(UPDATE_EVENTS.NOT_AVAILABLE, (_, info: UpdateInfo) => callback(info))
  },
  onDownloadProgress: (callback: (progress: ProgressInfo) => void) => {
    ipcRenderer.on(UPDATE_EVENTS.PROGRESS, (_, progress: ProgressInfo) => callback(progress))
  },
  onUpdateDownloaded: (callback: (event: UpdateDownloadedEvent) => void) => {
    ipcRenderer.on(UPDATE_EVENTS.DOWNLOADED, (_, event: UpdateDownloadedEvent) => callback(event))
  },
  onUpdateError: (callback: (error: string) => void) => {
    ipcRenderer.on(UPDATE_EVENTS.ERROR, (_, error: string) => callback(error))
  },

  checkForUpdate: () => {
    console.log('222222222222')
    ipcRenderer.invoke(UPDATE_ACTIONS.CHECK)
  },
  startUpdateDownload: () => ipcRenderer.invoke(UPDATE_ACTIONS.DOWNLOAD),
  installUpdate: () => ipcRenderer.invoke(UPDATE_ACTIONS.INSTALL)
}

// Custom APIs for renderer
const api = {
  ...updaterAPI
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
