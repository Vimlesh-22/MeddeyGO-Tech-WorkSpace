/**
 * Script to check which email/authentication method is being used for Google Sheets
 * Run with: node check-google-sheets-email.js
 */

require('dotenv').config({ path: '.env' });
const { getServiceAccountEmail } = require('./services/googleSheets');

console.log('\n=== Google Sheets Authentication Check ===\n');

// Check which authentication method is being used
if (process.env.GOOGLE_SHEETS_API_KEY) {
  console.log('✅ Authentication Method: API Key');
  console.log('   Using API key for public sheet access');
  console.log('   Note: No specific email is used with API key authentication');
} else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.log('✅ Authentication Method: Service Account');
  console.log('   Credentials path:', process.env.GOOGLE_APPLICATION_CREDENTIALS);
  
  const email = getServiceAccountEmail();
  
  if (email) {
    console.log('\n📧 Service Account Email:', email);
    console.log('\n⚠️  IMPORTANT: Make sure this email has access to your Google Sheets!');
    console.log('   To grant access:');
    console.log('   1. Open your Google Sheet');
    console.log('   2. Click "Share" button');
    console.log('   3. Add this email:', email);
    console.log('   4. Give it "Editor" permissions');
  } else {
    console.log('\n❌ Could not read service account email from credentials file');
    console.log('   Please check that the credentials file exists and contains client_email');
  }
} else {
  console.log('⚠️  No authentication configured!');
  console.log('   Set either GOOGLE_SHEETS_API_KEY or GOOGLE_APPLICATION_CREDENTIALS');
  console.log('   This will only work for public sheets');
}

console.log('\n=== Spreadsheet IDs ===\n');
console.log('Okhla Spreadsheet ID:', process.env.GOOGLE_SHEETS_OKHLA_SHEET_ID || 'Not set (required)');
console.log('Bahadurgarh Spreadsheet ID:', process.env.GOOGLE_SHEETS_BAHADURGARH_SHEET_ID || 'Not set (required)');
console.log('\n');

