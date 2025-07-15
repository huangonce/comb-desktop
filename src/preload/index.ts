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
import { UPDATE_EVENTS, UPDATE_ACTIONS, ALIBABA_CHANNELS } from '../shared/ipc-channels'

const unifiedAPI = {
  /**
   * 调用主进程方法
   * @param channel 要调用的 IPC 通道名称
   * @param args 要传递给主进程的参数
   * @returns 主进程返回的结果
   */
  invoke: (channel: string, ...args: unknown[]): Promise<unknown> => {
    return ipcRenderer.invoke(channel, ...args)
  },
  /**
   * 监听事件
   * @param channel 要监听的 IPC 通道名称
   * @param callback 事件回调函数
   */
  on: (channel: string, callback: (...args: unknown[]) => void) => {
    ipcRenderer.on(channel, (_, ...args) => callback(...args))
  },
  /**
   * 移除事件监听
   * @param channel 要移除监听的 IPC 通道名称
   * @param listener 要移除的监听函数
   * @deprecated 使用 `removeAllListeners` 替代
   * @returns
   */
  removeAllListeners: (channel: string) => ipcRenderer.removeAllListeners(channel),

  updater: {
    checkForUpdate: () => ipcRenderer.invoke(UPDATE_ACTIONS.CHECK),
    startUpdateDownload: () => ipcRenderer.invoke(UPDATE_ACTIONS.DOWNLOAD),
    installUpdate: () => ipcRenderer.invoke(UPDATE_ACTIONS.INSTALL),

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
    }
  },

  alibaba: {
    // 兼容性方法 - 批量搜索
    searchSuppliers: (keyword: string) =>
      ipcRenderer.invoke(ALIBABA_CHANNELS.SEARCH_SUPPLIERS, keyword),

    // 新方法 - 流式搜索
    searchSuppliersStream: (keyword: string) =>
      ipcRenderer.invoke(ALIBABA_CHANNELS.SEARCH_SUPPLIERS_STREAM, keyword),

    // 取消搜索
    cancelSearch: () => ipcRenderer.invoke(ALIBABA_CHANNELS.SEARCH_CANCEL),

    // 事件监听
    onSearchProgress: (callback: (message: string) => void) => {
      ipcRenderer.on(ALIBABA_CHANNELS.SEARCH_PROGRESS, (_, message: string) => callback(message))
    },
    onSearchPageStart: (callback: (data: { pageNumber: number; message: string }) => void) => {
      ipcRenderer.on(ALIBABA_CHANNELS.SEARCH_PAGE_START, (_, data) => callback(data))
    },
    onSearchPageComplete: (
      callback: (data: {
        suppliers: unknown[]
        pageNumber: number
        totalFound: number
        message: string
      }) => void
    ) => {
      ipcRenderer.on(ALIBABA_CHANNELS.SEARCH_PAGE_COMPLETE, (_, data) => callback(data))
    },
    onSearchComplete: (
      callback: (data: { totalSuppliers?: number; message: string } | unknown[]) => void
    ) => {
      ipcRenderer.on(ALIBABA_CHANNELS.SEARCH_COMPLETE, (_, data) => callback(data))
    },
    onSearchError: (
      callback: (data: { error: string; pageNumber?: number; message: string } | string) => void
    ) => {
      ipcRenderer.on(ALIBABA_CHANNELS.SEARCH_ERROR, (_, data) => callback(data))
    },

    // 移除事件监听
    removeAllListeners: () => {
      ipcRenderer.removeAllListeners(ALIBABA_CHANNELS.SEARCH_PROGRESS)
      ipcRenderer.removeAllListeners(ALIBABA_CHANNELS.SEARCH_PAGE_START)
      ipcRenderer.removeAllListeners(ALIBABA_CHANNELS.SEARCH_PAGE_COMPLETE)
      ipcRenderer.removeAllListeners(ALIBABA_CHANNELS.SEARCH_COMPLETE)
      ipcRenderer.removeAllListeners(ALIBABA_CHANNELS.SEARCH_ERROR)
    }
  }
}

// 暴露给渲染进程的 API
const exposedAPI = {
  ...electronAPI,
  ...unifiedAPI
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', exposedAPI)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = exposedAPI
}
