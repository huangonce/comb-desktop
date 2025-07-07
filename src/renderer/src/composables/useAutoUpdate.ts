import { ref, onMounted, onBeforeUnmount, computed } from 'vue'
import { type UpdateInfo, type ProgressInfo, type UpdateDownloadedEvent } from 'electron-updater'
import { useQuasar, type QDialogOptions, type DialogChainObject } from 'quasar'
import { UPDATE_EVENTS } from '../../../shared/ipc-channels'

type UpdateStatus = 'idle' | 'available' | 'downloading' | 'downloaded' | 'error'
interface UpdateProgress {
  percent: number
  bytesPerSecond: number
  transferred: number
  total: number
}

// 检查是否在Electron环境中
const isElectron = (): boolean => !!window.electron

const useAutoUpdate = (): {
  updateStatus: typeof updateStatus
  updateInfo: typeof updateInfo
  downloadProgress: typeof downloadProgress
  errorMessage: typeof errorMessage
  checkForUpdates: typeof checkForUpdates
} => {
  const $q = useQuasar()

  const updateStatus = ref<UpdateStatus>('idle')
  const updateInfo = ref<unknown>(null)
  const downloadProgress = ref<UpdateProgress>({
    percent: 0,
    bytesPerSecond: 0,
    transferred: 0,
    total: 0
  })
  const errorMessage = ref('')
  const dialog = ref<DialogChainObject | null>()

  // 格式化下载速度
  const downloadSpeed = computed(() => {
    if (!downloadProgress.value.bytesPerSecond) return ''
    const speed = downloadProgress.value.bytesPerSecond
    if (speed < 1024) return `${speed.toFixed(0)} B/s`
    if (speed < 1024 * 1024) return `${(speed / 1024).toFixed(1)} KB/s`
    return `${(speed / (1024 * 1024)).toFixed(1)} MB/s`
  })

  // 格式化已下载大小
  const transferredSize = computed(() => {
    if (!downloadProgress.value.transferred) return ''
    const size = downloadProgress.value.transferred
    if (size < 1024) return `${size.toFixed(0)} B`
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
    return `${(size / (1024 * 1024)).toFixed(1)} MB`
  })

  // 格式化总大小
  const totalSize = computed(() => {
    if (!downloadProgress.value.total) return ''
    const size = downloadProgress.value.total
    if (size < 1024) return `${size.toFixed(0)} B`
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
    return `${(size / (1024 * 1024)).toFixed(1)} MB`
  })

  function clearDialog(): void {
    if (dialog.value) {
      dialog.value.hide()
      dialog.value = null
    }
  }

  function handleDialog(options: QDialogOptions): DialogChainObject {
    dialog.value = $q.dialog({
      ...options,
      dark: $q.dark.isActive,
      persistent: true
    })

    return dialog.value
  }

  function showNoUpdateUpdateNotify(): void {
    updateStatus.value = 'idle'

    $q.notify({
      progress: true,
      message: '当前已是最新版本',
      icon: 'info',
      color: 'white',
      textColor: 'primary',
      timeout: 3000
    })
  }

  /**
   * 显示可用更新对话框
   * @param info 更新信息
   */
  function showAvailableUpdaterDialog(info: UpdateInfo): void {
    // 如果已经显示过更新对话框，则不再显示
    if (updateStatus.value === 'available') return

    updateStatus.value = 'available'
    updateInfo.value = info

    handleDialog({
      title: '更新可用',
      message: `发现新版本：${info.version}`,
      ok: {
        label: '下载更新',
        color: 'primary'
      }
    })

    dialog.value?.onOk(() => {
      clearDialog()
      window.electron.updater?.startUpdateDownload()
    })
  }

  /**
   * 显示下载进度对话框
   * @param progress 下载进度信息
   */
  function showDownloadingDialog(progress: ProgressInfo): void {
    updateStatus.value = 'downloading'

    downloadProgress.value = {
      percent: Math.floor(progress.percent),
      bytesPerSecond: progress.bytesPerSecond,
      transferred: progress.transferred,
      total: progress.total
    }

    if (downloadProgress.value.percent < 100) {
      if (dialog.value) {
        dialog.value.update({
          title: '下载中',
          message: `<div>每秒下载：${downloadSpeed.value}</div>
                    <div>已下载：${transferredSize.value} / ${totalSize.value}</div>`,
          html: true,
          ok: false
        })
      } else {
        handleDialog({
          title: '下载中',
          message: `<div>每秒下载：${downloadSpeed.value}</div>
                    <div>已下载：${transferredSize.value} / ${totalSize.value}</div>`,
          html: true,
          ok: false
        })
      }
    } else {
      clearDialog()
    }
  }

  /**
   * 显示更新下载完成对话框
   * @param event 更新下载事件
   */
  function showDownloadedDialog(event: UpdateDownloadedEvent): void {
    updateStatus.value = 'downloaded'

    handleDialog({
      title: '更新下载完成',
      message: `更新已下载完成，版本：${event.version}`,
      ok: {
        label: '安装更新',
        color: 'primary',
        icon: 'check_circle',
        flat: true
      }
    })

    dialog.value?.onOk(() => {
      clearDialog()
      window.electron.updater?.installUpdate()
    })
  }

  function showUpdaterErrorDialog(error: string): void {
    updateStatus.value = 'error'
    errorMessage.value = error

    // 截断过长的错误信息
    const truncatedError = error.length > 100 ? `${error.substring(0, 250)}...` : error

    handleDialog({
      title: '更新错误',
      message: `更新过程中发生错误：${truncatedError}`,
      style: {
        width: '400px'
      },
      ok: {
        label: '重试',
        icon: 'refresh'
      }
    })

    dialog.value?.onOk(() => {
      clearDialog()
      window.electron.updater?.checkForUpdate()
    })
  }

  // 添加手动检查更新方法
  const checkForUpdates = (): void => {
    if (!isElectron()) return

    updateStatus.value = 'idle'
    errorMessage.value = ''

    window.electron.updater?.checkForUpdate().catch((error: Error) => {
      showUpdaterErrorDialog(error.message)
    })
  }

  const initEventListeners = (): void => {
    if (!isElectron()) {
      console.warn('AutoUpdater is only available in Electron environment.')
      return
    }

    // 监听更新事件
    window.electron.updater?.onUpdateAvailable(showAvailableUpdaterDialog)
    window.electron.updater?.onUpdateNotAvailable(showNoUpdateUpdateNotify)
    window.electron.updater?.onDownloadProgress(showDownloadingDialog)
    window.electron.updater?.onUpdateDownloaded(showDownloadedDialog)
    window.electron.updater?.onUpdateError(showUpdaterErrorDialog)

    // 检查更新
    // window.electron.updater?.checkForUpdate().catch((error: Error) => {
    //   showUpdaterErrorDialog(error.message)
    // })
  }
  const cleanupEventListeners = (): void => {
    if (!isElectron()) {
      console.warn('AutoUpdater is only available in Electron environment.')
      return
    }

    // 取消监听更新事件
    if (window.electron?.removeAllListeners) {
      window.electron.removeAllListeners(UPDATE_EVENTS.AVAILABLE)
      window.electron.removeAllListeners(UPDATE_EVENTS.NOT_AVAILABLE)
      window.electron.removeAllListeners(UPDATE_EVENTS.PROGRESS)
      window.electron.removeAllListeners(UPDATE_EVENTS.DOWNLOADED)
      window.electron.removeAllListeners(UPDATE_EVENTS.ERROR)
    }
  }

  onMounted(() => {
    initEventListeners()
  })

  onBeforeUnmount(() => {
    cleanupEventListeners()
  })

  return {
    updateStatus,
    updateInfo,
    downloadProgress,
    errorMessage,

    checkForUpdates
  }
}

export default useAutoUpdate
