import { ref, onMounted, onBeforeUnmount } from 'vue'
import { useQuasar, type QDialogOptions, type DialogChainObject } from 'quasar'

type UpdateStatus = 'idle' | 'available' | 'downloading' | 'downloaded' | 'error'
interface UpdateProgress {
  percent: number
  bytesPerSecond: number
  transferred: number
  total: number
}

// 检查是否在Electron环境中
const isElectron = (): boolean => !!window.api

const useAutoUpdater = (): {
  updateStatus: typeof updateStatus
  updateInfo: typeof updateInfo
  downloadProgress: typeof downloadProgress
  errorMessage: typeof errorMessage
} => {
  const $q = useQuasar()

  console.log($q)

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

  function handleDialog(options: QDialogOptions): void {
    dialog.value = $q.dialog({
      ...options,
      dark: $q.dark.isActive,
      persistent: true
    })
  }

  function showAvailableDialog(): void {
    updateStatus.value = 'available'

    handleDialog({})
  }

  function showNoUpdateNotify(): void {
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

  const initAutoUpdater = (): void => {}

  const cleanupAutoUpdater = (): void => {}

  onMounted(() => {
    initAutoUpdater()
  })

  onBeforeUnmount(() => {
    cleanupAutoUpdater()
  })

  return {
    updateStatus,
    updateInfo,
    downloadProgress,
    errorMessage
  }
}

export default useAutoUpdater
