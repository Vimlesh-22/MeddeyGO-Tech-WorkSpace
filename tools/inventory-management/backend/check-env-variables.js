/**
 * Script to check if all required Google Sheets environment variables are set
 */

const dotenv = require('dotenv');
const path = require('path');

// Load environment variables from project-hub/.env (same as server.js)
// server.js uses: path.join(__dirname, '..', '..', '.env')
const envPath = path.join(__dirname, '..', '..', '.env');

const fs = require('fs');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  // Try default dotenv behavior (current directory)
  dotenv.config();
}

console.log('\n=== Google Sheets Environment Variables Check ===\n');
if (envPath) {
  console.log(`Loading environment variables from: ${envPath}\n`);
} else {
  console.log('No .env file found in expected locations. Using system environment variables.\n');
}

// Required environment variables
const requiredVars = {
  // Authentication (one of these is required)
  authentication: [
    'GOOGLE_SHEETS_API_KEY',
    'GOOGLE_APPLICATION_CREDENTIALS'
  ],
  // Spreadsheet IDs (required if authentication is set)
  spreadsheetIds: [
    'GOOGLE_SHEETS_PACK_SHEET_ID',
    'GOOGLE_SHEETS_OKHLA_SHEET_ID',
    'GOOGLE_SHEETS_BAHADURGARH_SHEET_ID'
  ],
  // Sheet names (required if authentication is set)
  sheetNames: [
    'GOOGLE_SHEETS_PACK_SHEET_NAME',
    'GOOGLE_SHEETS_PACK_PRODUCTS_SHEET_NAME',
    'GOOGLE_SHEETS_COMBO_PRODUCTS_SHEET_NAME',
    'GOOGLE_SHEETS_OKHLA_INVENTORY_NAME',
    'GOOGLE_SHEETS_BAHADURGARH_INVENTORY_NAME',
    'GOOGLE_SHEETS_INVENTORY_TAB_NAME'
  ]
};

// Check authentication variables
console.log('🔐 Authentication Variables:');
let hasAuth = false;
requiredVars.authentication.forEach(varName => {
  const value = process.env[varName];
  if (value && value.trim() !== '') {
    hasAuth = true;
    if (varName === 'GOOGLE_APPLICATION_CREDENTIALS') {
      // Check if it's a file path or JSON string
      if (value.includes('.json') || value.startsWith('./') || value.startsWith('../') || value.startsWith('/')) {
        console.log(`  ⚠️  ${varName}: Set to file path (${value})`);
        console.log(`      ⚠️  WARNING: Code expects JSON string, not file path!`);
        console.log(`      ⚠️  Convert the JSON file content to a string in .env`);
        hasAuth = false; // Don't count file paths as valid auth
      } else {
        try {
          // Handle both single-quoted and unquoted JSON strings
          let jsonStr = value.trim();
          if (jsonStr.startsWith("'") && jsonStr.endsWith("'")) {
            jsonStr = jsonStr.slice(1, -1);
          }
          const parsed = JSON.parse(jsonStr);
          console.log(`  ✅ ${varName}: Set (JSON credentials, client_email: ${parsed.client_email || 'N/A'})`);
        } catch (e) {
          console.log(`  ⚠️  ${varName}: Set but invalid JSON format (${e.message})`);
          console.log(`      Value preview: ${value.substring(0, 100)}...`);
          hasAuth = false; // Don't count invalid JSON as valid auth
        }
      }
    } else {
      console.log(`  ✅ ${varName}: Set (${value.substring(0, 20)}...)`);
    }
  } else {
    console.log(`  ❌ ${varName}: Not set or empty`);
  }
});

if (!hasAuth) {
  console.log('\n⚠️  WARNING: No authentication method configured. Google Sheets integration will be disabled.');
  console.log('   Set either GOOGLE_SHEETS_API_KEY or GOOGLE_APPLICATION_CREDENTIALS to enable.\n');
} else {
  console.log('\n✅ Authentication configured.\n');
  
  // Check spreadsheet IDs
  console.log('📊 Spreadsheet IDs:');
  let allSpreadsheetIdsSet = true;
  requiredVars.spreadsheetIds.forEach(varName => {
    const value = process.env[varName];
    if (value) {
      console.log(`  ✅ ${varName}: ${value}`);
    } else {
      console.log(`  ❌ ${varName}: Not set`);
      allSpreadsheetIdsSet = false;
    }
  });
  
  if (!allSpreadsheetIdsSet) {
    console.log('\n⚠️  WARNING: Some spreadsheet IDs are missing. Google Sheets operations may fail.\n');
  } else {
    console.log('\n✅ All spreadsheet IDs configured.\n');
  }
  
  // Check sheet names
  console.log('📋 Sheet Names:');
  let allSheetNamesSet = true;
  requiredVars.sheetNames.forEach(varName => {
    const value = process.env[varName];
    if (value) {
      console.log(`  ✅ ${varName}: ${value}`);
    } else {
      console.log(`  ❌ ${varName}: Not set`);
      allSheetNamesSet = false;
    }
  });
  
  if (!allSheetNamesSet) {
    console.log('\n⚠️  WARNING: Some sheet names are missing. Google Sheets operations may fail.\n');
  } else {
    console.log('\n✅ All sheet names configured.\n');
  }
}

// Summary
console.log('\n=== Summary ===');
if (!hasAuth) {
  console.log('❌ Google Sheets integration: DISABLED (no authentication)');
} else {
  // Check if all variables are set (only if auth is configured)
  const allSpreadsheetIdsSet = requiredVars.spreadsheetIds.every(v => process.env[v] && process.env[v].trim() !== '');
  const allSheetNamesSet = requiredVars.sheetNames.every(v => process.env[v] && process.env[v].trim() !== '');
  
  if (!allSpreadsheetIdsSet || !allSheetNamesSet) {
    console.log('⚠️  Google Sheets integration: PARTIALLY CONFIGURED (some variables missing)');
  } else {
    console.log('✅ Google Sheets integration: FULLY CONFIGURED');
  }
}

console.log('\n=== All Required Variables ===\n');
console.log('Authentication (one required):');
requiredVars.authentication.forEach(v => console.log(`  - ${v}`));
console.log('\nSpreadsheet IDs (required if auth is set):');
requiredVars.spreadsheetIds.forEach(v => console.log(`  - ${v}`));
console.log('\nSheet Names (required if auth is set):');
requiredVars.sheetNames.forEach(v => console.log(`  - ${v}`));
console.log('\n');

