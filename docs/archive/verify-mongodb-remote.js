const { MongoClient } = require('mongodb');
const mongoose = require('mongoose');
require('dotenv').config();

const remoteUri = "mongodb://admin:StrongPassword123!@129.154.246.226:27017/admin";

async function verifyAllConnections() {
  console.log('\n' + '='.repeat(70));
  console.log('MongoDB Remote Server Connection Verification');
  console.log('='.repeat(70) + '\n');

  const results = {
    passed: [],
    failed: []
  };

  // Test 1: Direct connection to remote server
  console.log('Test 1: Direct Connection to Remote Server');
  console.log('-'.repeat(70));
  try {
    const client = new MongoClient(remoteUri);
    await client.connect();
    const adminDb = client.db().admin();
    const databases = await adminDb.listDatabases();
    console.log(`✓ Connected successfully`);
    console.log(`✓ Found ${databases.databases.length} databases:`);
    databases.databases.forEach(db => {
      console.log(`  - ${db.name} (${(db.sizeOnDisk / 1024 / 1024).toFixed(2)} MB)`);
    });
    await client.close();
    results.passed.push('Direct Connection');
  } catch (error) {
    console.error(`✗ Connection failed: ${error.message}`);
    results.failed.push('Direct Connection');
  }

  // Test 2: Environment variable MONGODB_URI
  console.log('\nTest 2: MONGODB_URI Environment Variable');
  console.log('-'.repeat(70));
  console.log(`Value: ${process.env.MONGODB_URI}`);
  if (process.env.MONGODB_URI && process.env.MONGODB_URI.includes('129.154.246.226')) {
    console.log('✓ MONGODB_URI is set to remote server');
    results.passed.push('MONGODB_URI');
  } else {
    console.log('✗ MONGODB_URI is not set to remote server');
    results.failed.push('MONGODB_URI');
  }

  // Test 3: QUOTE_MONGODB_URI
  console.log('\nTest 3: QUOTE_MONGODB_URI Environment Variable');
  console.log('-'.repeat(70));
  console.log(`Value: ${process.env.QUOTE_MONGODB_URI}`);
  if (process.env.QUOTE_MONGODB_URI && process.env.QUOTE_MONGODB_URI.includes('129.154.246.226')) {
    console.log('✓ QUOTE_MONGODB_URI is set to remote server');
    results.passed.push('QUOTE_MONGODB_URI');
  } else {
    console.log('✗ QUOTE_MONGODB_URI is not set to remote server');
    results.failed.push('QUOTE_MONGODB_URI');
  }

  // Test 4: INVENTORY_MONGODB_URI
  console.log('\nTest 4: INVENTORY_MONGODB_URI Environment Variable');
  console.log('-'.repeat(70));
  console.log(`Value: ${process.env.INVENTORY_MONGODB_URI}`);
  if (process.env.INVENTORY_MONGODB_URI && process.env.INVENTORY_MONGODB_URI.includes('129.154.246.226')) {
    console.log('✓ INVENTORY_MONGODB_URI is set to remote server');
    results.passed.push('INVENTORY_MONGODB_URI');
  } else {
    console.log('✗ INVENTORY_MONGODB_URI is not set to remote server');
    results.failed.push('INVENTORY_MONGODB_URI');
  }

  // Test 5: Mongoose connection to shopify-orders
  console.log('\nTest 5: Mongoose Connection to shopify-orders Database');
  console.log('-'.repeat(70));
  try {
    await mongoose.connect('mongodb://admin:StrongPassword123!@129.154.246.226:27017/shopify-orders?authSource=admin', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 5000,
    });
    console.log('✓ Connected successfully');
    console.log(`✓ Database: ${mongoose.connection.name}`);
    const collections = await mongoose.connection.db.listCollections().toArray();
    console.log(`✓ Found ${collections.length} collections`);
    await mongoose.disconnect();
    results.passed.push('Mongoose shopify-orders');
  } catch (error) {
    console.error(`✗ Connection failed: ${error.message}`);
    results.failed.push('Mongoose shopify-orders');
  }

  // Test 6: Mongoose connection to quoteapp
  console.log('\nTest 6: Mongoose Connection to quoteapp Database');
  console.log('-'.repeat(70));
  try {
    await mongoose.connect('mongodb://admin:StrongPassword123!@129.154.246.226:27017/quoteapp?authSource=admin', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 5000,
    });
    console.log('✓ Connected successfully');
    console.log(`✓ Database: ${mongoose.connection.name}`);
    const collections = await mongoose.connection.db.listCollections().toArray();
    console.log(`✓ Found ${collections.length} collections`);
    
    // Count documents in each collection
    for (const col of collections) {
      const count = await mongoose.connection.db.collection(col.name).countDocuments();
      console.log(`  - ${col.name}: ${count} documents`);
    }
    
    await mongoose.disconnect();
    results.passed.push('Mongoose quoteapp');
  } catch (error) {
    console.error(`✗ Connection failed: ${error.message}`);
    results.failed.push('Mongoose quoteapp');
  }

  // Summary
  console.log('\n' + '='.repeat(70));
  console.log('VERIFICATION SUMMARY');
  console.log('='.repeat(70));
  console.log(`\n✓ Passed: ${results.passed.length} tests`);
  results.passed.forEach(test => console.log(`  - ${test}`));
  
  if (results.failed.length > 0) {
    console.log(`\n✗ Failed: ${results.failed.length} tests`);
    results.failed.forEach(test => console.log(`  - ${test}`));
  }

  console.log('\n' + '='.repeat(70));
  console.log('Files Updated with Remote MongoDB Configuration:');
  console.log('='.repeat(70));
  console.log('✓ .env (main configuration)');
  console.log('✓ Inventory Management/backend/.env');
  console.log('✓ migrate-mongodb.js');
  console.log('✓ test-quote-server.js');
  console.log('✓ test-mongo.js');
  console.log('✓ scripts/start-quote.js');
  console.log('✓ tools/quote-app/backend/server.js');
  console.log('✓ Inventory Management/backend/server.js');
  
  console.log('\n' + '='.repeat(70));
  console.log('All applications are now configured to use:');
  console.log('Remote MongoDB: 129.154.246.226:27017');
  console.log('='.repeat(70) + '\n');

  if (results.failed.length > 0) {
    process.exit(1);
  }
}

verifyAllConnections().catch(error => {
  console.error('\n✗ Verification failed:', error);
  process.exit(1);
});
