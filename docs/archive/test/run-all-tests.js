/**
 * Master Test Runner
 * Runs all test suites: connectivity, functions, and database
 */

const { runAllTests } = require('./test-all-backends');
const { runAllFunctionTests } = require('./test-backend-functions');

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

async function runAllTestSuites() {
  log(`\n${'='.repeat(70)}`, 'cyan');
  log(`MASTER TEST SUITE - ALL BACKEND TESTS`, 'cyan');
  log(`${'='.repeat(70)}`, 'cyan');
  log(`\nRunning comprehensive test suite...\n`, 'blue');

  const results = {
    connectivity: null,
    functions: null,
    overall: { passed: 0, failed: 0, total: 0 },
  };

  // Run connectivity tests
  log(`\n${'─'.repeat(70)}`, 'cyan');
  log(`PHASE 1: CONNECTIVITY TESTS`, 'cyan');
  log(`${'─'.repeat(70)}`, 'cyan');
  try {
    results.connectivity = await runAllTests();
    results.overall.passed += results.connectivity.summary.passed;
    results.overall.failed += results.connectivity.summary.failed;
    results.overall.total += results.connectivity.summary.total;
  } catch (error) {
    log(`\n❌ Connectivity tests failed: ${error.message}`, 'red');
    results.connectivity = { summary: { passed: 0, failed: 1, total: 1 } };
    results.overall.failed++;
    results.overall.total++;
  }

  // Run function tests
  log(`\n${'─'.repeat(70)}`, 'cyan');
  log(`PHASE 2: FUNCTIONALITY TESTS`, 'cyan');
  log(`${'─'.repeat(70)}`, 'cyan');
  try {
    results.functions = await runAllFunctionTests();
    results.overall.passed += results.functions.passed;
    results.overall.failed += results.functions.failed;
    results.overall.total += results.functions.tests.length;
  } catch (error) {
    log(`\n❌ Function tests failed: ${error.message}`, 'red');
    results.functions = { passed: 0, failed: 1, tests: [] };
    results.overall.failed++;
    results.overall.total++;
  }

  // Final summary
  log(`\n${'='.repeat(70)}`, 'cyan');
  log(`FINAL TEST SUMMARY`, 'cyan');
  log(`${'='.repeat(70)}`, 'cyan');
  
  log(`\n📊 Overall Results:`, 'blue');
  log(`   Total Tests: ${results.overall.total}`, 'blue');
  log(`   ✅ Passed: ${results.overall.passed}`, 'green');
  log(`   ❌ Failed: ${results.overall.failed}`, results.overall.failed > 0 ? 'red' : 'green');
  
  const successRate = results.overall.total > 0 
    ? ((results.overall.passed / results.overall.total) * 100).toFixed(1)
    : 0;
  log(`   📈 Success Rate: ${successRate}%`, successRate >= 80 ? 'green' : successRate >= 50 ? 'yellow' : 'red');

  log(`\n📋 Test Suite Breakdown:`, 'blue');
  if (results.connectivity) {
    log(`   Connectivity: ${results.connectivity.summary.passed}/${results.connectivity.summary.total} passed`, 
      results.connectivity.summary.failed === 0 ? 'green' : 'yellow');
  }
  if (results.functions) {
    log(`   Functions: ${results.functions.passed}/${results.functions.tests.length} passed`,
      results.functions.failed === 0 ? 'green' : 'yellow');
  }

  log(`\n`, 'reset');
  
  return results;
}

// Run if executed directly
if (require.main === module) {
  runAllTestSuites()
    .then((results) => {
      const exitCode = results.overall.failed > 0 ? 1 : 0;
      process.exit(exitCode);
    })
    .catch((error) => {
      log(`\n❌ Master test suite error: ${error.message}`, 'red');
      console.error(error);
      process.exit(1);
    });
}

module.exports = { runAllTestSuites };

