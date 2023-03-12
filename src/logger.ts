import pino from 'pino'

export const loggerOptions: pino.LoggerOptions = {
  level: process.env.LOG_LEVEL ?? 'info',
  formatters: {
    level: (label) => ({ level: label })
  },
  transport: {
    target: 'pino-pretty'
  }
}

export default pino(loggerOptions)
