/**
 * @module main/services/logger.service.ts
 * @description 该模块配置应用程序的日志记录服务
 * 使用 electron-log 库来记录应用程序的日志信息
 */
import { app } from 'electron'
import log from 'electron-log'
import path from 'path'
import fs from 'fs'

const configureLogger = (): typeof log => {
  // 设置日志文件位置
  const logsDir = app.isPackaged
    ? path.join(app.getPath('logs'), `${app.getName()}.log`) // 生产环境
    : path.join(app.getAppPath(), 'logs', 'app.log') // 开发环境

  const logFileName = app.isPackaged ? `${app.getName()}.log` : 'app-debug.log'
  const logPath = path.join(logsDir, logFileName)

  // 确保日志目录存在
  try {
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true })
    }
  } catch (error) {
    console.error('无法创建日志目录:', error)
  }

  log.transports.file.resolvePathFn = () => logPath

  // 通用配置
  log.transports.file.level = 'info'
  log.transports.file.maxSize = 10 * 1024 * 1024 // 10MB
  log.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}] [{level}] {text}'

  // 控制台配置（开发环境增强）
  log.transports.console.format = (msg) => {
    const date = new Date().toISOString()
    return [`[${date}] [${msg.level}] ${msg.data.join(' ')}`]
  }

  // 开发环境增加调试级别
  if (!app.isPackaged) {
    log.transports.console.level = 'debug'
    log.transports.file.level = 'debug'
  }

  process.on('uncaughtException', (error) => {
    log.error('Uncaught Exception:', error)
  })

  process.on('unhandledRejection', (reason, promise) => {
    log.error('Unhandled Rejection at:', promise, 'reason:', reason)
  })

  return log
}

// 导出预配置的logger实例
export const logger = configureLogger()
