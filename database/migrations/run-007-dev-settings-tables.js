/**
 * Migration: Add developer settings tables
 * - scheduled_banners: Scheduled banner messages
 * - dev_messages: Developer messages to users
 * - dev_images: Developer uploaded images
 * - user_messages: Track which users received messages
 */

const dotenv = require('dotenv');
const path = require('path');
const mysql = require('mysql2/promise');
const fs = require('fs');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

async function runMigration() {
  console.log('\n' + '='.repeat(70));
  console.log('  Running Migration: Add Developer Settings Tables');
  console.log('='.repeat(70) + '\n');

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
    const migrationPath = path.join(__dirname, '007_dev_settings_tables.sql');
    const sql = fs.readFileSync(migrationPath, 'utf-8');
    
    console.log('📝 Executing migration...');
    
    // Split by statements and execute individually
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s && !s.startsWith('--'));

    for (const statement of statements) {
      try {
        await pool.query(statement);
      } catch (err) {
        if (!err.message.includes('already exists')) {
          console.error('  ⚠️  Error executing statement:', err.message);
        }
      }
    }
    
    console.log('✅ Migration executed successfully\n');

    // Verify tables were created
    const tablesToCheck = ['scheduled_banners', 'dev_messages', 'dev_images', 'user_messages'];
    console.log('📊 Verifying tables...\n');

    for (const table of tablesToCheck) {
      const [rows] = await pool.query(
        `SELECT COUNT(*) as count FROM information_schema.TABLES 
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
        [process.env.DB_NAME, table]
      );
      
      const exists = rows[0].count > 0;
      console.log(`  ${exists ? '✅' : '❌'} ${table}`);
    }

    await pool.end();

    console.log('\n' + '='.repeat(70));
    console.log('  Migration Completed Successfully');
    console.log('='.repeat(70) + '\n');

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
