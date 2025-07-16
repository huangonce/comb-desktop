/**
 * @file Electron 更新 API 的预加载脚本
 * @description 此文件定义了 Electron 应用预加载脚本中使用的 Electron 更新 API 的类型和接口。
 * @module preload/index.d.ts
 */
import { ElectronAPI } from '@electron-toolkit/preload'
import type { UpdateInfo, ProgressInfo, UpdateDownloadedEvent } from 'electron-updater'
import type { SupplierInfo } from '../../shared/supplierInfo'

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
    // 批量搜索（兼容性方法）
    searchSuppliers: (
      keyword: string,
      maxPages?: number
    ) => Promise<{ success: boolean; data?: SupplierInfo[]; error?: string }>
    // 流式搜索
    searchSuppliersStream: (
      keyword: string,
      maxPages?: number
    ) => Promise<{ success: boolean; totalSuppliers?: number; error?: string }>
    // 取消搜索
    cancelSearch: () => Promise<{ success: boolean; message?: string }>
    // 监听搜索进度
    onSearchProgress: (callback: (message: string) => void) => void
    // 监听搜索页面开始
    onSearchPageStart: (callback: (data: { pageNumber: number; message: string }) => void) => void
    // 监听搜索页面完成
    onSearchPageComplete: (
      callback: (data: {
        suppliers: SupplierInfo[]
        pageNumber: number
        totalFound: number
        message: string
      }) => void
    ) => void
    // 监听搜索完成
    onSearchComplete: (
      callback: (data: { totalSuppliers?: number; message: string } | SupplierInfo[]) => void
    ) => void
    // 监听搜索错误
    onSearchError: (
      callback: (data: { error: string; pageNumber?: number; message: string } | string) => void
    ) => void
    // 清理监听器
    removeAllListeners: () => void
  }
}

declare global {
  interface Window {
    electron: UnifiedElectronAPI
  }
}
