/**
 * Migration: Add 'dev' role to users table
 */

const dotenv = require('dotenv');
const path = require('path');
const mysql = require('mysql2/promise');
const fs = require('fs');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

async function runMigration() {
  console.log('\n' + '='.repeat(60));
  console.log('  Running Migration: Add Dev Role');
  console.log('='.repeat(60) + '\n');

  let pool;
  try {
    pool = await mysql.createConnection({
      host: process.env.DB_HOST,
      port: process.env.DB_PORT || 3306,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
    });

    console.log('✅ Connected to database\n');

    // Read and execute migration
    const migrationPath = path.join(__dirname, '006_add_dev_role.sql');
    const sql = fs.readFileSync(migrationPath, 'utf-8');
    
    console.log('📝 Executing migration...');
    await pool.query(sql);
    console.log('✅ Migration executed successfully\n');

    // Verify the change
    const [columns] = await pool.query(
      `SELECT COLUMN_TYPE 
       FROM INFORMATION_SCHEMA.COLUMNS 
       WHERE TABLE_SCHEMA = ? 
       AND TABLE_NAME = 'users' 
       AND COLUMN_NAME = 'role'`,
      [process.env.DB_NAME]
    );

    console.log('Updated role column type:', columns[0].COLUMN_TYPE);
    
    if (columns[0].COLUMN_TYPE.includes('dev')) {
      console.log('✅ Dev role added successfully!\n');
    } else {
      console.log('⚠️  Warning: Dev role might not have been added\n');
    }

    await pool.end();

    console.log('='.repeat(60));
    console.log('  Migration Completed Successfully');
    console.log('='.repeat(60) + '\n');

    return true;

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    if (pool) await pool.end();
    return false;
  }
}

// Run migration
runMigration()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
