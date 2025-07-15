// 自动更新事件通道
export const UPDATE_EVENTS = {
  AVAILABLE: 'update-available',
  NOT_AVAILABLE: 'update-not-available',
  PROGRESS: 'download-progress',
  DOWNLOADED: 'update-downloaded',
  ERROR: 'update-error'
}

// 自动更新操作通道
export const UPDATE_ACTIONS = {
  CHECK: 'check-for-update',
  DOWNLOAD: 'start-update-download',
  INSTALL: 'install-update'
}

// 阿里巴巴采集通道
export const ALIBABA_CHANNELS = {
  SEARCH_SUPPLIERS: 'alibaba-search-suppliers',
  SEARCH_SUPPLIERS_STREAM: 'alibaba-search-suppliers-stream',
  SEARCH_PROGRESS: 'alibaba-search-progress',
  SEARCH_PAGE_START: 'alibaba-search-page-start',
  SEARCH_PAGE_COMPLETE: 'alibaba-search-page-complete',
  SEARCH_COMPLETE: 'alibaba-search-complete',
  SEARCH_ERROR: 'alibaba-search-error',
  SEARCH_CANCEL: 'alibaba-search-cancel'
}
