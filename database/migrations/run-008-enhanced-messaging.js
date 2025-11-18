/**
 * Migration: Enhanced Messaging System (008)
 * Adds priority/type/media/dismissal/expiry fields and the dismissals table
 */

const dotenv = require('dotenv');
const path = require('path');
const mysql = require('mysql2/promise');
const fs = require('fs');

dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

async function runMigration() {
  console.log('\n' + '='.repeat(70));
  console.log('  Running Migration: 008 Enhanced Messaging System');
  console.log('='.repeat(70) + '\n');

  let conn;
  try {
    conn = await mysql.createConnection({
      host: process.env.DB_HOST,
      port: process.env.DB_PORT || 3306,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      multipleStatements: true,
    });

    console.log('✅ Connected to database\n');

    const migrationPath = path.join(__dirname, '008_enhanced_messaging_system.sql');
    const sql = fs.readFileSync(migrationPath, 'utf-8');

    console.log('📝 Executing migration...');

    const statements = sql
      .split(';')
      .map((s) => s.trim())
      .filter((s) => s && !s.startsWith('--'));

    for (const stmt of statements) {
      try {
        await conn.query(stmt);
      } catch (err) {
        const msg = err?.message || String(err);
        if (!/already exists|Duplicate column name|Unknown table/i.test(msg)) {
          console.error('  ⚠️  Error executing statement:', msg);
        }
      }
    }

    console.log('✅ Base migration statements executed\n');

    // Verify key columns exist
    async function columnExists(table, column) {
      const [rows] = await conn.query(
        'SELECT COUNT(*) as cnt FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?',
        [process.env.DB_NAME, table, column]
      );
      return rows[0]?.cnt > 0;
    }

    const checks = [
      ['user_messages', 'priority'],
      ['user_messages', 'image_url'],
      ['user_messages', 'video_url'],
      ['user_messages', 'type'],
      ['user_messages', 'dismissed'],
      ['user_messages', 'dismissed_at'],
      ['user_messages', 'expires_at'],
      ['dev_messages', 'delivery_method'],
      ['dev_messages', 'priority'],
      ['dev_messages', 'image_url'],
      ['dev_messages', 'video_url'],
      ['dev_messages', 'type'],
      ['user_message_dismissals', 'id'],
    ];

    console.log('📊 Verifying columns/tables...');
    for (const [table, column] of checks) {
      try {
        let ok = await columnExists(table, column);
        if (!ok) {
          // Attempt to add missing columns programmatically (handles MySQL versions without IF NOT EXISTS)
          const alters = {
            'user_messages.priority': "ALTER TABLE user_messages ADD COLUMN priority ENUM('low','medium','high') NOT NULL DEFAULT 'medium' AFTER content",
            'user_messages.image_url': "ALTER TABLE user_messages ADD COLUMN image_url VARCHAR(500) NULL AFTER priority",
            'user_messages.video_url': "ALTER TABLE user_messages ADD COLUMN video_url VARCHAR(500) NULL AFTER image_url",
            'user_messages.type': "ALTER TABLE user_messages ADD COLUMN type ENUM('message','banner','video') NOT NULL DEFAULT 'message' AFTER video_url",
            'user_messages.dismissed': "ALTER TABLE user_messages ADD COLUMN dismissed TINYINT(1) NOT NULL DEFAULT 0 AFTER type",
            'user_messages.dismissed_at': "ALTER TABLE user_messages ADD COLUMN dismissed_at DATETIME NULL AFTER dismissed",
            'user_messages.expires_at': "ALTER TABLE user_messages ADD COLUMN expires_at DATETIME NULL AFTER dismissed_at",
            'dev_messages.delivery_method': "ALTER TABLE dev_messages ADD COLUMN delivery_method ENUM('in-app','email','both') NOT NULL DEFAULT 'in-app' AFTER expires_at",
            'dev_messages.priority': "ALTER TABLE dev_messages ADD COLUMN priority ENUM('low','medium','high') NOT NULL DEFAULT 'medium' AFTER delivery_method",
            'dev_messages.image_url': "ALTER TABLE dev_messages ADD COLUMN image_url VARCHAR(500) NULL AFTER priority",
            'dev_messages.video_url': "ALTER TABLE dev_messages ADD COLUMN video_url VARCHAR(500) NULL AFTER image_url",
            'dev_messages.type': "ALTER TABLE dev_messages ADD COLUMN type ENUM('message','banner','video') NOT NULL DEFAULT 'message' AFTER video_url",
          };

          const key = `${table}.${column}`;
          const stmt = alters[key];
          if (stmt) {
            try {
              await conn.query(stmt);
              ok = await columnExists(table, column);
            } catch (e) {
              console.log(`  ⚠️  Failed to add ${key}:`, e?.message || e);
            }
          }
        }
        console.log(`  ${ok ? '✅' : '❌'} ${table}.${column}`);
      } catch (e) {
        console.log(`  ❌ ${table}.${column} check failed:`, e?.message || e);
      }
    }

    await conn.end();
    console.log('\n' + '='.repeat(70));
    console.log('  Migration 008 Completed Successfully');
    console.log('='.repeat(70) + '\n');
    return true;
  } catch (error) {
    console.error('\n❌ Migration 008 failed:', error?.message || error);
    if (conn) await conn.end();
    return false;
  }
}

if (require.main === module) {
  runMigration()
    .then((ok) => process.exit(ok ? 0 : 1))
    .catch(() => process.exit(1));
}

module.exports = { runMigration };