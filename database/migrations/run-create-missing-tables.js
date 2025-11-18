const dotenv = require('dotenv');
const path = require('path');
const mysql = require('mysql2/promise');
const fs = require('fs');

dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

async function run() {
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

    const sqlPath = path.join(process.cwd(), 'create_missing_tables.sql');
    const sql = fs.readFileSync(sqlPath, 'utf-8');

    const statements = sql
      .split(';')
      .map((s) => s.trim())
      .filter((s) => s && !s.startsWith('--'));

    for (const stmt of statements) {
      try {
        await conn.query(stmt);
      } catch (err) {
        const msg = err?.message || String(err);
        if (!/already exists|Duplicate entry|Unknown table/i.test(msg)) {
          console.error('Error executing statement:', msg);
        }
      }
    }

    const [schedules] = await conn.query(
      'SELECT COUNT(*) as cnt FROM information_schema.TABLES WHERE TABLE_SCHEMA=? AND TABLE_NAME=?',
      [process.env.DB_NAME, 'tool_schedules']
    );
    const [surprise] = await conn.query(
      'SELECT COUNT(*) as cnt FROM information_schema.TABLES WHERE TABLE_SCHEMA=? AND TABLE_NAME=?',
      [process.env.DB_NAME, 'surprise_messages']
    );
    console.log('tool_schedules exists:', schedules[0]?.cnt > 0);
    console.log('surprise_messages exists:', surprise[0]?.cnt > 0);

    await conn.end();
    return true;
  } catch (e) {
    console.error('Migration run failed:', e?.message || e);
    if (conn) await conn.end();
    return false;
  }
}

if (require.main === module) {
  run().then((ok) => process.exit(ok ? 0 : 1)).catch(() => process.exit(1));
}

module.exports = { run };