/**
 * Electron 应用的预加载脚本
 * 此脚本用于将 Electron API 暴露给渲染进程
 * 同时通过使用上下文隔离来保证安全性。
 * 它还设置了用于处理应用更新的更新程序 API。
 * @module preload/index
 */
import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { UpdateInfo, ProgressInfo, UpdateDownloadedEvent } from 'electron-updater'
import { UPDATE_EVENTS, UPDATE_ACTIONS } from '../shared/ipc-channels'

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

  checkForUpdate: () => ipcRenderer.invoke(UPDATE_ACTIONS.CHECK),
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
