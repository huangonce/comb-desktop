import { shell, BrowserWindow, session } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'

// 导出主窗口实例，方便其他模块访问
export let mainWindow: BrowserWindow | null = null

const getDefaultWindowOptions = (): Electron.BrowserWindowConstructorOptions => {
  return {
    width: 1200,
    height: 800,
    minWidth: 1200,
    minHeight: 800,
    show: false, // 重要：防止窗口闪烁
    autoHideMenuBar: true,
    center: true, // 窗口居中显示
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    ...(process.platform === 'linux'
      ? { icon: join(__dirname, '../../../resources/icon.png') }
      : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true // 生产环境建议启用
    }
  }
}

/**
 * 创建主窗口
 * @param options - 窗口选项
 * @returns 主窗口实例
 */
export const createMainWindow = (
  options?: Electron.BrowserWindowConstructorOptions
): BrowserWindow => {
  // 创建浏览器窗口
  const window = new BrowserWindow({
    ...getDefaultWindowOptions(),
    ...options
  })

  // 设置 CSP 安全策略
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders
      }
    })
  })

  // 事件处理封装到独立方法
  setupWindowEvents(window)

  // 基于 electron-vite cli 的渲染器的 HMR。
  // 加载远程 URL 用于开发，或加载本地 html 文件用于生产。
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    window.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    window.loadFile(join(__dirname, '../renderer/index.html'))
  }

  // 开发模式下自动打开开发者工具
  if (is.dev) {
    window.webContents.openDevTools({ mode: 'detach' })
  }

  // 如果这是主窗口，则保存引用
  if (!mainWindow) {
    mainWindow = window
  }

  return window
}

export const getMainWindow = (): BrowserWindow | null => {
  return mainWindow
}

const setupWindowEvents = (window: BrowserWindow): void => {
  // 窗口准备就绪时显示
  window.on('ready-to-show', () => {
    window.show()

    // 开发模式下聚焦窗口
    if (is.dev) {
      window.focus()
    }
  })

  // 处理新窗口打开事件（在默认浏览器中打开）
  window.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // 窗口关闭时清理引用
  window.on('closed', () => {
    if (mainWindow === window) {
      mainWindow = null
    }
  })
}
