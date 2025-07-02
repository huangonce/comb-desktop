/**
 * @module main/services/logger.service.ts
 * @description 该模块配置应用程序的日志记录服务
 * 使用 electron-log 库来记录应用程序的日志信息
 */
import { app } from 'electron'
import log from 'electron-log'
import path from 'path'
import fs from 'fs'
import dayjs from 'dayjs'

const configureLogger = (): typeof log => {
  // 获取基础日志目录
  const baseLogsDir = app.isPackaged
    ? app.getPath('logs') // 生产环境：系统日志目录
    : path.join(app.getAppPath(), 'logs') // 开发环境：应用目录下的logs文件夹

  // 确保日志目录存在
  try {
    if (!fs.existsSync(baseLogsDir)) {
      fs.mkdirSync(baseLogsDir, { recursive: true })
    }
  } catch (error) {
    console.error('无法创建日志目录:', error)
  }

  // 动态生成每日日志文件名
  const getDailyLogPath = (): string => {
    const now = new Date()
    const dateStr = dayjs(now).format('YYYYMMDD') // yyyyMMdd
    const logFileName = app.isPackaged ? `${dateStr}.log` : `${dateStr}-debug.log`

    return path.join(baseLogsDir, logFileName)
  }

  // 设置动态日志路径
  log.transports.file.resolvePathFn = () => getDailyLogPath()

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
