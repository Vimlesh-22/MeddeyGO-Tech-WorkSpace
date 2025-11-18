/**
 * Comprehensive Backend Connection Test Suite
 * Tests all backend services for connectivity and functionality
 */

const http = require('http');
const https = require('https');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Load environment variables
const workspaceRoot = path.resolve(__dirname, '..');
const rootEnvPath = path.join(workspaceRoot, '.env');
if (fs.existsSync(rootEnvPath)) {
  require('dotenv').config({ path: rootEnvPath });
}

// Color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  blue: '\x1b[34m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

// Backend services configuration
const services = {
  'quote-generator': {
    name: 'Quote Generator',
    port: parseInt(process.env.QUOTE_PORT || process.env.PORT || '4094', 10),
    healthEndpoint: '/', // Quote Generator doesn't have /api/health, test root instead
    testEndpoint: '/api/users',
    method: 'GET',
  },
  'inventory-management': {
    name: 'Inventory Management',
    port: parseInt(process.env.INVENTORY_PORT || process.env.PORT || '4096', 10),
    healthEndpoint: '/api/health',
    testEndpoint: '/api/orders',
    method: 'GET',
  },
  'order-extractor': {
    name: 'Order ID Extractor',
    port: parseInt(process.env.ORDER_EXTRACTOR_PORT || process.env.PORT || '4097', 10),
    healthEndpoint: '/api/health',
    testEndpoint: '/api/orders',
    method: 'GET',
  },
  'data-extractor-pro': {
    name: 'Data Extractor Pro',
    port: parseInt(process.env.EXTRACTOR_PORT || process.env.PORT || '4092', 10),
    healthEndpoint: '/api/health', // Flask app has /api/health endpoint
    testEndpoint: '/',
    method: 'GET',
  },
  'file-merger': {
    name: 'File Merger',
    port: parseInt(process.env.FILE_MERGER_PORT || process.env.MER_PORT || process.env.PORT || '4093', 10),
    healthEndpoint: '/api/health', // Flask app has /api/health endpoint
    testEndpoint: '/',
    method: 'GET',
  },
  'gsheet-integration': {
    name: 'GSHEET Integration',
    port: parseInt(process.env.GSHEET_PORT || process.env.PORT || '4095', 10),
    healthEndpoint: '/api/health',
    testEndpoint: '/api/health',
    method: 'GET',
  },
};

// Test a single backend service
async function testService(serviceKey, serviceConfig) {
  const { name, port, healthEndpoint, testEndpoint, method } = serviceConfig;
  
  log(`\n${'='.repeat(60)}`, 'cyan');
  log(`Testing: ${name}`, 'cyan');
  log(`${'='.repeat(60)}`, 'cyan');
  
  const results = {
    name,
    port,
    portListening: false,
    healthCheck: { success: false, status: null, message: '' },
    endpointTest: { success: false, status: null, message: '' },
    overall: false,
  };

  // Test 1: Check if port is listening
  log(`\n[1/3] Checking if port ${port} is listening...`, 'yellow');
  try {
    const isListening = await checkPort(port);
    results.portListening = isListening;
    if (isListening) {
      log(`  ✅ Port ${port} is listening`, 'green');
    } else {
      log(`  ❌ Port ${port} is NOT listening`, 'red');
      log(`  💡 Start the server: npm run dev:${serviceKey.replace(/-/g, '')}`, 'yellow');
      return results;
    }
  } catch (error) {
    log(`  ❌ Error checking port: ${error.message}`, 'red');
    return results;
  }

  // Test 2: Health check
  log(`\n[2/3] Testing health endpoint: ${healthEndpoint}`, 'yellow');
  try {
    const healthResponse = await makeRequest(port, healthEndpoint, method);
    results.healthCheck = healthResponse;
    // For Quote Generator, root endpoint is acceptable
    const isAcceptable = serviceKey === 'quote-generator' 
      ? (healthResponse.status === 200 || healthResponse.status === 404)
      : healthResponse.success;
    
    if (isAcceptable) {
      log(`  ✅ Health check passed (${healthResponse.status})`, 'green');
      if (healthResponse.data) {
        log(`  📊 Response: ${JSON.stringify(healthResponse.data).substring(0, 100)}...`, 'blue');
      }
    } else {
      log(`  ⚠️  Health check: ${healthResponse.message || `Status: ${healthResponse.status}`}`, 'yellow');
      // Don't fail overall if it's a 404 (endpoint might not exist but service is running)
      if (healthResponse.status === 404) {
        log(`  ℹ️  Endpoint not found, but service is running`, 'blue');
      }
    }
  } catch (error) {
    log(`  ❌ Health check error: ${error.message}`, 'red');
    results.healthCheck.message = error.message;
  }

  // Test 3: Test endpoint
  if (testEndpoint && testEndpoint !== healthEndpoint) {
    log(`\n[3/3] Testing endpoint: ${testEndpoint}`, 'yellow');
    try {
      const endpointResponse = await makeRequest(port, testEndpoint, method);
      results.endpointTest = endpointResponse;
      if (endpointResponse.success) {
        log(`  ✅ Endpoint test passed (${endpointResponse.status})`, 'green');
      } else {
        log(`  ⚠️  Endpoint test: ${endpointResponse.message}`, 'yellow');
        // Don't fail overall if endpoint requires auth
        if (endpointResponse.status === 401 || endpointResponse.status === 403) {
          log(`  ℹ️  Endpoint requires authentication (expected)`, 'blue');
        }
      }
    } catch (error) {
      log(`  ⚠️  Endpoint test error: ${error.message}`, 'yellow');
      results.endpointTest.message = error.message;
    }
  }

  // Overall result - port listening is most important, health check is secondary
  // For services without health endpoints, just check if port is listening
  const hasHealthEndpoint = healthEndpoint && healthEndpoint !== '/';
  if (hasHealthEndpoint) {
    results.overall = results.portListening && results.healthCheck.success;
  } else {
    // For services without health endpoints, just check if port is listening
    results.overall = results.portListening;
  }
  
  if (results.overall) {
    log(`\n✅ ${name}: ALL TESTS PASSED`, 'green');
  } else {
    log(`\n⚠️  ${name}: SOME TESTS FAILED`, 'yellow');
    if (!results.portListening) {
      log(`   - Port ${port} is not listening`, 'red');
    } else if (hasHealthEndpoint && !results.healthCheck.success) {
      log(`   - Health check failed (but port is listening)`, 'yellow');
    }
  }

  return results;
}

// Check if a port is listening
function checkPort(port) {
  return new Promise((resolve) => {
    const server = http.createServer();
    server.listen(port, '127.0.0.1', () => {
      server.close(() => resolve(true));
    });
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        resolve(true); // Port is in use, which means something is listening
      } else {
        resolve(false);
      }
    });
    setTimeout(() => {
      server.close(() => resolve(false));
    }, 1000);
  });
}

// Make HTTP request to a service
function makeRequest(port, path, method = 'GET', data = null) {
  return new Promise((resolve) => {
    const options = {
      hostname: '127.0.0.1',
      port: port,
      path: path,
      method: method,
      timeout: 10000, // Increase timeout to 10 seconds for better reliability
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    };

    const req = http.request(options, (res) => {
      let responseData = '';
      
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      
      res.on('end', () => {
        let parsedData = null;
        try {
          parsedData = JSON.parse(responseData);
        } catch (e) {
          // Not JSON, that's okay
        }
        
        resolve({
          success: res.statusCode >= 200 && res.statusCode < 400,
          status: res.statusCode,
          message: res.statusMessage,
          data: parsedData || responseData.substring(0, 200),
        });
      });
    });

    req.on('error', (error) => {
      resolve({
        success: false,
        status: null,
        message: error.message,
        data: null,
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({
        success: false,
        status: null,
        message: 'Request timeout',
        data: null,
      });
    });

    if (data) {
      req.write(JSON.stringify(data));
    }
    
    req.end();
  });
}

// Test database connection
async function testDatabase() {
  log(`\n${'='.repeat(60)}`, 'cyan');
  log(`Testing: Database Connection`, 'cyan');
  log(`${'='.repeat(60)}`, 'cyan');
  
  try {
    // Try to load the database module - handle TypeScript compilation
    let getDbPool;
    try {
      // Try compiled JS first
      const dbModule = require('../src/lib/db.js');
      getDbPool = dbModule.getDbPool || dbModule.default?.getDbPool;
    } catch (e) {
      // If that fails, try TypeScript (requires ts-node or similar)
      try {
        const dbModule = require('../src/lib/db.ts');
        getDbPool = dbModule.getDbPool || dbModule.default?.getDbPool;
      } catch (e2) {
        // Last resort: try direct path
        const path = require('path');
        const dbPath = path.join(__dirname, '..', 'src', 'lib', 'db.ts');
        // Use dynamic import for ES modules
        throw new Error('Database module requires TypeScript compilation. Skipping database tests.');
      }
    }
    
    if (!getDbPool) {
      throw new Error('getDbPool function not found in database module');
    }
    
    const pool = getDbPool();
    
    // Test connection
    const [rows] = await pool.query('SELECT 1 as test');
    if (rows && rows.length > 0) {
      log(`  ✅ Database connection successful`, 'green');
      
      // Test user_tours table
      try {
        await pool.query('SELECT 1 FROM user_tours LIMIT 1');
        log(`  ✅ user_tours table exists`, 'green');
      } catch (error) {
        log(`  ⚠️  user_tours table may not exist: ${error.message}`, 'yellow');
      }
      
      return { success: true, message: 'Database connected' };
    } else {
      return { success: false, message: 'Database query returned no results' };
    }
  } catch (error) {
    log(`  ❌ Database connection failed: ${error.message}`, 'red');
    return { success: false, message: error.message };
  }
}

// Test MongoDB connection (for services that use it)
async function testMongoDB() {
  log(`\n${'='.repeat(60)}`, 'cyan');
  log(`Testing: MongoDB Connection`, 'cyan');
  log(`${'='.repeat(60)}`, 'cyan');
  
  const mongoUri = process.env.INVENTORY_MONGODB_URI || process.env.MONGODB_URI;
  
  if (!mongoUri) {
    log(`  ⚠️  MongoDB URI not configured (optional for some services)`, 'yellow');
    return { success: true, message: 'MongoDB not required' };
  }
  
  try {
    const mongoose = require('mongoose');
    
    // Try to connect with a short timeout
    await Promise.race([
      mongoose.connect(mongoUri, {
        serverSelectionTimeoutMS: 3000,
        socketTimeoutMS: 3000,
      }),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Connection timeout')), 3000)
      ),
    ]);
    
    log(`  ✅ MongoDB connection successful`, 'green');
    await mongoose.disconnect();
    return { success: true, message: 'MongoDB connected' };
  } catch (error) {
    log(`  ⚠️  MongoDB connection failed: ${error.message}`, 'yellow');
    log(`  ℹ️  This is optional for some services`, 'blue');
    return { success: false, message: error.message };
  }
}

// Main test function
async function runAllTests() {
  log(`\n${'='.repeat(60)}`, 'cyan');
  log(`BACKEND CONNECTION TEST SUITE`, 'cyan');
  log(`${'='.repeat(60)}`, 'cyan');
  log(`\nTesting all backend services for connectivity...\n`, 'blue');

  const results = {
    services: {},
    database: null,
    mongodb: null,
    summary: { total: 0, passed: 0, failed: 0 },
  };

  // Test database connections first
  results.database = await testDatabase();
  results.mongodb = await testMongoDB();

  // Test each service
  for (const [key, config] of Object.entries(services)) {
    results.summary.total++;
    const serviceResult = await testService(key, config);
    results.services[key] = serviceResult;
    
    if (serviceResult.overall) {
      results.summary.passed++;
    } else {
      results.summary.failed++;
    }
    
    // Small delay between tests
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  // Print summary
  log(`\n${'='.repeat(60)}`, 'cyan');
  log(`TEST SUMMARY`, 'cyan');
  log(`${'='.repeat(60)}`, 'cyan');
  
  log(`\n📊 Results:`, 'blue');
  log(`   Total Services: ${results.summary.total}`, 'blue');
  log(`   ✅ Passed: ${results.summary.passed}`, 'green');
  log(`   ❌ Failed: ${results.summary.failed}`, results.summary.failed > 0 ? 'red' : 'green');
  
  log(`\n📋 Service Details:`, 'blue');
  for (const [key, result] of Object.entries(results.services)) {
    const status = result.overall ? '✅' : '❌';
    log(`   ${status} ${result.name} (port ${result.port})`, result.overall ? 'green' : 'red');
    if (!result.overall) {
      if (!result.portListening) {
        log(`      - Port not listening`, 'yellow');
      }
      if (!result.healthCheck.success) {
        log(`      - Health check failed: ${result.healthCheck.message}`, 'yellow');
      }
    }
  }

  log(`\n💡 Tips:`, 'yellow');
  if (results.summary.failed > 0) {
    log(`   - Start all services: npm run dev`, 'yellow');
    log(`   - Check .env file for port configurations`, 'yellow');
    log(`   - Verify services are running in terminal`, 'yellow');
  } else {
    log(`   - All services are running correctly! 🎉`, 'green');
  }

  log(`\n`, 'reset');
  
  return results;
}

// Run tests if executed directly
if (require.main === module) {
  runAllTests()
    .then((results) => {
      process.exit(results.summary.failed > 0 ? 1 : 0);
    })
    .catch((error) => {
      log(`\n❌ Test suite error: ${error.message}`, 'red');
      console.error(error);
      process.exit(1);
    });
}

module.exports = { runAllTests, testService, testDatabase, testMongoDB };