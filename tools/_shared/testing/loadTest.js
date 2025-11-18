/**
 * Load Testing Suite
 * Automated load testing for APIs and services
 */

const axios = require('axios');
const logger = require('../utils/logger');

class LoadTester {
  constructor(options = {}) {
    this.baseUrl = options.baseUrl || 'http://localhost:4090';
    this.concurrency = options.concurrency || 10;
    this.duration = options.duration || 60000; // 60 seconds
    this.timeout = options.timeout || 30000; // 30 seconds
    this.results = {
      requests: [],
      errors: [],
      startTime: null,
      endTime: null
    };
  }

  /**
   * Run load test against an endpoint
   * @param {Object} testConfig - Test configuration
   * @returns {Promise<Object>} Test results
   */
  async runTest(testConfig) {
    const {
      method = 'GET',
      path = '/',
      headers = {},
      body = null,
      name = 'Load Test'
    } = testConfig;

    logger.info('Starting load test', {
      name,
      method,
      path,
      concurrency: this.concurrency,
      duration: this.duration
    });

    this.results = {
      requests: [],
      errors: [],
      startTime: Date.now(),
      endTime: null
    };

    const startTime = Date.now();
    const endTime = startTime + this.duration;
    const workers = [];

    // Start concurrent workers
    for (let i = 0; i < this.concurrency; i++) {
      workers.push(this.worker(method, path, headers, body, endTime));
    }

    // Wait for all workers to complete
    await Promise.all(workers);

    this.results.endTime = Date.now();

    // Calculate statistics
    const stats = this.calculateStats();

    logger.info('Load test completed', {
      name,
      ...stats
    });

    return {
      config: testConfig,
      results: this.results,
      stats
    };
  }

  /**
   * Worker function that makes requests until duration expires
   */
  async worker(method, path, headers, body, endTime) {
    while (Date.now() < endTime) {
      const requestStart = Date.now();

      try {
        const response = await axios({
          method,
          url: `${this.baseUrl}${path}`,
          headers,
          data: body,
          timeout: this.timeout,
          validateStatus: () => true // Don't throw on any status
        });

        const requestEnd = Date.now();

        this.results.requests.push({
          startTime: requestStart,
          endTime: requestEnd,
          duration: requestEnd - requestStart,
          statusCode: response.status,
          success: response.status >= 200 && response.status < 300
        });
      } catch (error) {
        const requestEnd = Date.now();

        this.results.errors.push({
          startTime: requestStart,
          endTime: requestEnd,
          duration: requestEnd - requestStart,
          error: error.message,
          code: error.code
        });
      }
    }
  }

  /**
   * Calculate test statistics
   * @returns {Object} Statistics
   */
  calculateStats() {
    const { requests, errors, startTime, endTime } = this.results;
    const totalRequests = requests.length + errors.length;
    const successfulRequests = requests.filter(r => r.success).length;
    const failedRequests = requests.length - successfulRequests + errors.length;
    const totalDuration = endTime - startTime;

    // Calculate response times
    const responseTimes = requests.map(r => r.duration).sort((a, b) => a - b);
    const errorTimes = errors.map(e => e.duration);

    const avgResponseTime = responseTimes.length > 0
      ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
      : 0;

    const medianResponseTime = responseTimes.length > 0
      ? responseTimes[Math.floor(responseTimes.length / 2)]
      : 0;

    const p95ResponseTime = responseTimes.length > 0
      ? responseTimes[Math.floor(responseTimes.length * 0.95)]
      : 0;

    const p99ResponseTime = responseTimes.length > 0
      ? responseTimes[Math.floor(responseTimes.length * 0.99)]
      : 0;

    const minResponseTime = responseTimes.length > 0 ? responseTimes[0] : 0;
    const maxResponseTime = responseTimes.length > 0
      ? responseTimes[responseTimes.length - 1]
      : 0;

    // Calculate throughput (requests per second)
    const throughput = (totalRequests / totalDuration) * 1000;

    // Status code distribution
    const statusCodes = {};
    requests.forEach(r => {
      const code = r.statusCode;
      statusCodes[code] = (statusCodes[code] || 0) + 1;
    });

    // Error types
    const errorTypes = {};
    errors.forEach(e => {
      const type = e.code || 'Unknown';
      errorTypes[type] = (errorTypes[type] || 0) + 1;
    });

    return {
      duration: totalDuration,
      totalRequests,
      successfulRequests,
      failedRequests,
      successRate: ((successfulRequests / totalRequests) * 100).toFixed(2) + '%',
      errorRate: ((failedRequests / totalRequests) * 100).toFixed(2) + '%',
      throughput: throughput.toFixed(2) + ' req/s',
      responseTime: {
        avg: avgResponseTime.toFixed(2) + ' ms',
        median: medianResponseTime + ' ms',
        p95: p95ResponseTime + ' ms',
        p99: p99ResponseTime + ' ms',
        min: minResponseTime + ' ms',
        max: maxResponseTime + ' ms'
      },
      statusCodes,
      errorTypes
    };
  }

  /**
   * Run multiple test scenarios
   * @param {Array} scenarios - Array of test configurations
   * @returns {Promise<Array>} Results for all scenarios
   */
  async runScenarios(scenarios) {
    const results = [];

    for (const scenario of scenarios) {
      logger.info('Running test scenario', { name: scenario.name });
      
      const result = await this.runTest(scenario);
      results.push(result);

      // Wait between scenarios
      if (scenario.delay) {
        await new Promise(resolve => setTimeout(resolve, scenario.delay));
      }
    }

    return results;
  }

  /**
   * Generate HTML report
   * @param {Object} results - Test results
   * @returns {string} HTML report
   */
  generateReport(results) {
    const { config, stats } = results;

    return `
<!DOCTYPE html>
<html>
<head>
  <title>Load Test Report - ${config.name}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; }
    h1 { color: #333; }
    table { border-collapse: collapse; width: 100%; margin: 20px 0; }
    th, td { border: 1px solid #ddd; padding: 12px; text-align: left; }
    th { background-color: #4CAF50; color: white; }
    tr:nth-child(even) { background-color: #f2f2f2; }
    .success { color: green; }
    .error { color: red; }
  </style>
</head>
<body>
  <h1>Load Test Report: ${config.name}</h1>
  <h2>Configuration</h2>
  <table>
    <tr><th>Property</th><th>Value</th></tr>
    <tr><td>Method</td><td>${config.method}</td></tr>
    <tr><td>Path</td><td>${config.path}</td></tr>
    <tr><td>Duration</td><td>${stats.duration} ms</td></tr>
    <tr><td>Concurrency</td><td>${this.concurrency}</td></tr>
  </table>

  <h2>Results</h2>
  <table>
    <tr><th>Metric</th><th>Value</th></tr>
    <tr><td>Total Requests</td><td>${stats.totalRequests}</td></tr>
    <tr><td>Successful</td><td class="success">${stats.successfulRequests}</td></tr>
    <tr><td>Failed</td><td class="error">${stats.failedRequests}</td></tr>
    <tr><td>Success Rate</td><td>${stats.successRate}</td></tr>
    <tr><td>Throughput</td><td>${stats.throughput}</td></tr>
  </table>

  <h2>Response Times</h2>
  <table>
    <tr><th>Metric</th><th>Value</th></tr>
    <tr><td>Average</td><td>${stats.responseTime.avg}</td></tr>
    <tr><td>Median</td><td>${stats.responseTime.median}</td></tr>
    <tr><td>95th Percentile</td><td>${stats.responseTime.p95}</td></tr>
    <tr><td>99th Percentile</td><td>${stats.responseTime.p99}</td></tr>
    <tr><td>Min</td><td>${stats.responseTime.min}</td></tr>
    <tr><td>Max</td><td>${stats.responseTime.max}</td></tr>
  </table>

  <h2>Status Codes</h2>
  <table>
    <tr><th>Code</th><th>Count</th></tr>
    ${Object.entries(stats.statusCodes).map(([code, count]) => 
      `<tr><td>${code}</td><td>${count}</td></tr>`
    ).join('')}
  </table>

  ${Object.keys(stats.errorTypes).length > 0 ? `
  <h2>Error Types</h2>
  <table>
    <tr><th>Type</th><th>Count</th></tr>
    ${Object.entries(stats.errorTypes).map(([type, count]) => 
      `<tr><td>${type}</td><td class="error">${count}</td></tr>`
    ).join('')}
  </table>
  ` : ''}
</body>
</html>
    `.trim();
  }
}

module.exports = LoadTester;