/**
 * Performance Monitoring Utility
 * Track request performance, memory usage, and system metrics
 */

const logger = require('./logger');

class PerformanceMonitor {
  constructor() {
    this.metrics = new Map();
    this.requestTimes = [];
    this.maxRequestTimes = 1000; // Keep last 1000 requests
  }

  /**
   * Start tracking a request
   * @param {string} id - Unique request identifier
   * @param {Object} metadata - Request metadata
   */
  startRequest(id, metadata = {}) {
    this.metrics.set(id, {
      startTime: Date.now(),
      startMemory: process.memoryUsage(),
      metadata
    });
  }

  /**
   * End tracking a request and log performance
   * @param {string} id - Request identifier
   * @param {Object} result - Request result metadata
   * @returns {Object} Performance metrics
   */
  endRequest(id, result = {}) {
    const metric = this.metrics.get(id);
    if (!metric) {
      logger.warn('Performance metric not found', { id });
      return null;
    }

    const endTime = Date.now();
    const endMemory = process.memoryUsage();
    const duration = endTime - metric.startTime;

    const performance = {
      id,
      duration,
      memoryDelta: {
        rss: endMemory.rss - metric.startMemory.rss,
        heapTotal: endMemory.heapTotal - metric.startMemory.heapTotal,
        heapUsed: endMemory.heapUsed - metric.startMemory.heapUsed,
        external: endMemory.external - metric.startMemory.external
      },
      metadata: metric.metadata,
      result
    };

    // Store request time for statistics
    this.requestTimes.push(duration);
    if (this.requestTimes.length > this.maxRequestTimes) {
      this.requestTimes.shift();
    }

    // Log slow requests
    if (duration > 1000) {
      logger.warn('Slow request detected', {
        id,
        duration,
        metadata: metric.metadata
      });
    }

    this.metrics.delete(id);
    return performance;
  }

  /**
   * Get performance statistics
   * @returns {Object} Performance stats
   */
  getStats() {
    if (this.requestTimes.length === 0) {
      return null;
    }

    const sorted = [...this.requestTimes].sort((a, b) => a - b);
    const sum = sorted.reduce((a, b) => a + b, 0);

    return {
      count: sorted.length,
      mean: sum / sorted.length,
      median: sorted[Math.floor(sorted.length / 2)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      p99: sorted[Math.floor(sorted.length * 0.99)],
      min: sorted[0],
      max: sorted[sorted.length - 1]
    };
  }

  /**
   * Get current memory usage
   * @returns {Object} Memory usage info
   */
  getMemoryUsage() {
    const usage = process.memoryUsage();
    return {
      rss: this.formatBytes(usage.rss),
      heapTotal: this.formatBytes(usage.heapTotal),
      heapUsed: this.formatBytes(usage.heapUsed),
      external: this.formatBytes(usage.external),
      heapUsedPercent: ((usage.heapUsed / usage.heapTotal) * 100).toFixed(2)
    };
  }

  /**
   * Get CPU usage
   * @returns {Object} CPU usage info
   */
  getCPUUsage() {
    const usage = process.cpuUsage();
    return {
      user: usage.user / 1000, // Convert to milliseconds
      system: usage.system / 1000
    };
  }

  /**
   * Format bytes to human-readable format
   * @param {number} bytes - Bytes to format
   * @returns {string} Formatted string
   */
  formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Log system metrics
   */
  logSystemMetrics() {
    const stats = this.getStats();
    const memory = this.getMemoryUsage();
    const cpu = this.getCPUUsage();

    logger.info('System metrics', {
      performance: stats,
      memory,
      cpu,
      uptime: process.uptime()
    });
  }

  /**
   * Clear all metrics
   */
  clear() {
    this.metrics.clear();
    this.requestTimes = [];
  }
}

// Create singleton instance
const monitor = new PerformanceMonitor();

/**
 * Express middleware for automatic performance tracking
 */
function performanceMiddleware(req, res, next) {
  const requestId = `${req.method}-${req.path}-${Date.now()}`;
  
  monitor.startRequest(requestId, {
    method: req.method,
    path: req.path,
    ip: req.ip
  });

  // Override res.json to capture response
  const originalJson = res.json.bind(res);
  res.json = function(data) {
    const perf = monitor.endRequest(requestId, {
      statusCode: res.statusCode,
      responseSize: JSON.stringify(data).length
    });

    // Add performance headers
    if (perf) {
      res.setHeader('X-Response-Time', `${perf.duration}ms`);
    }

    return originalJson(data);
  };

  next();
}

/**
 * Schedule periodic metrics logging
 * @param {number} interval - Interval in milliseconds (default: 5 minutes)
 */
function scheduleMetricsLogging(interval = 300000) {
  setInterval(() => {
    monitor.logSystemMetrics();
  }, interval);
}

module.exports = {
  PerformanceMonitor,
  monitor,
  performanceMiddleware,
  scheduleMetricsLogging
};