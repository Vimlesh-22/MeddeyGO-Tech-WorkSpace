/**
 * Structured Logger Utility
 * Replaces console.log/error with structured logging
 */

const LOG_LEVELS = {
  FATAL: 0,
  ERROR: 1,
  WARN: 2,
  INFO: 3,
  DEBUG: 4
};

class Logger {
  constructor(serviceName = 'app') {
    this.serviceName = serviceName;
  }

  getLogLevel() {
    // Re-read environment variable each time to support dynamic changes
    const envLevel = (process.env.LOG_LEVEL || 'INFO').toUpperCase();
    return LOG_LEVELS[envLevel] !== undefined ? LOG_LEVELS[envLevel] : LOG_LEVELS.INFO;
  }

  formatLog(level, message, context = {}) {
    return JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      service: this.serviceName,
      message,
      context: {
        ...context,
        env: process.env.NODE_ENV,
        pid: process.pid
      },
      ...(context.error && {
        error: {
          message: context.error.message,
          stack: context.error.stack,
          code: context.error.code
        }
      })
    });
  }

  fatal(message, context = {}) {
    const level = this.getLogLevel();
    if (level >= LOG_LEVELS.FATAL) {
      console.error(this.formatLog('FATAL', message, context));
    }
  }

  error(message, context = {}) {
    const level = this.getLogLevel();
    if (level >= LOG_LEVELS.ERROR) {
      console.error(this.formatLog('ERROR', message, context));
    }
  }

  warn(message, context = {}) {
    const level = this.getLogLevel();
    if (level >= LOG_LEVELS.WARN) {
      console.warn(this.formatLog('WARN', message, context));
    }
  }

  info(message, context = {}) {
    const level = this.getLogLevel();
    if (level >= LOG_LEVELS.INFO) {
      console.log(this.formatLog('INFO', message, context));
    }
  }

  debug(message, context = {}) {
    const level = this.getLogLevel();
    if (level >= LOG_LEVELS.DEBUG) {
      console.log(this.formatLog('DEBUG', message, context));
    }
  }
}

// Create singleton instance
const logger = new Logger(process.env.SERVICE_NAME || 'meddeygo');

module.exports = logger;