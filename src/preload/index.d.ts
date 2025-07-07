/**
 * @file Electron 更新 API 的预加载脚本
 * @description 此文件定义了 Electron 应用预加载脚本中使用的 Electron 更新 API 的类型和接口。
 * @module preload/index.d.ts
 */
import { ElectronAPI } from '@electron-toolkit/preload'
import type { UpdateInfo, ProgressInfo, UpdateDownloadedEvent } from 'electron-updater'

interface SupplierInfo {
  id: number
  chineseName: string
  englishName: string
  phone: string
  email: string
  country: string
  province: string
  city: string
  district: string
  address: string
  website: string
  establishedYear: string
  creditCode: string
  companyType?: string
  businessScope?: string
  yearRange?: string
  tradeCapacity?: string
}

interface UnifiedElectronAPI extends ElectronAPI {
  /**
   * 调用主进程方法
   * @param channel 要调用的 IPC 通道名称
   * @param args 要传递给主进程的参数
   * @returns 主进程返回的结果
   */
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>

  /**
   * 监听主进程方法
   * @param channel 要监听的 IPC 通道名称
   * @param listener 监听函数
   */
  on: (channel: string, listener: (...args: unknown[]) => void) => void

  /**
   * 移除主进程方法的监听
   * @param channel 要移除监听的 IPC 通道名称
   * @param listener 要移除的监听函数
   */
  removeAllListeners: (channel: string) => void

  updater?: {
    checkForUpdate: () => Promise<void>
    startUpdateDownload: () => Promise<void>
    installUpdate: () => Promise<void>

    onUpdateAvailable: (callback: (info: UpdateInfo) => void) => void
    onUpdateNotAvailable: (callback: (info: UpdateInfo) => void) => void
    onDownloadProgress: (callback: (progress: ProgressInfo) => void) => void
    onUpdateDownloaded: (callback: (event: UpdateDownloadedEvent) => void) => void
    onUpdateError: (callback: (error: string) => void) => void
  }

  alibaba?: {
    searchSuppliers: (
      keyword: string
    ) => Promise<{ success: boolean; data?: SupplierInfo[]; error?: string }>
    onSearchProgress: (callback: (message: string) => void) => void
    onSearchComplete: (callback: (suppliers: SupplierInfo[]) => void) => void
    onSearchError: (callback: (error: string) => void) => void
  }
}

declare global {
  interface Window {
    electron: UnifiedElectronAPI
  }
}
