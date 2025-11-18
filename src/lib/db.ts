import mysql, { type Pool, type RowDataPacket } from "mysql2/promise";
import * as fs from "fs";
import * as path from "path";

let client: Pool | null = null;
let migrationChecked = false;

function createPool(): Pool {
  const { DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME } = process.env;

  if (!DB_HOST || !DB_USER || !DB_PASSWORD || !DB_NAME) {
    throw new Error(
      "Database environment variables missing. Set DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, and DB_NAME.",
    );
  }

  return mysql.createPool({
    host: DB_HOST,
    port: Number(DB_PORT ?? "3306"),
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
  });
}

async function runSqlFile(
  pool: Pool,
  relativePath: string,
  label: string,
  options: { ignoreExists?: boolean } = {},
): Promise<void> {
  const { ignoreExists = true } = options;
  const migrationPath = path.join(process.cwd(), relativePath);

  if (!fs.existsSync(migrationPath)) {
    console.warn(`[DB] Migration file missing: ${relativePath}`);
    return;
  }

  const statements = fs
    .readFileSync(migrationPath, "utf-8")
    .split(";")
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0 && !statement.startsWith("--"));

  for (const statement of statements) {
    if (!statement) continue;

    try {
      await pool.query(statement);
    } catch (err) {
      const error = err as { code?: string };
      const ignoreableErrors = new Set([
        "ER_TABLE_EXISTS_ERROR",
        "ER_DUP_FIELDNAME",
        "ER_DUP_KEYNAME",
      ]);

      if (ignoreExists && error.code && ignoreableErrors.has(error.code)) {
        continue;
      }

      console.error(`[DB] Migration "${label}" failed:`, err);
      throw err;
    }
  }

  console.log(`[DB] ${label} migration applied.`);
}

async function ensureDatabaseSchema(pool: Pool): Promise<void> {
  if (migrationChecked) {
    return;
  }

  try {
    const [usersTable] = await pool.query<RowDataPacket[]>(
      "SHOW TABLES LIKE 'users'",
    );

    if (usersTable.length === 0) {
      console.log('[DB] Users table missing. Running "001_initial_schema.sql"...');
      await runSqlFile(
        pool,
        "database/migrations/001_initial_schema.sql",
        "Initial schema",
      );
    }

    const [roleColumn] = await pool.query<RowDataPacket[]>(
      "SHOW COLUMNS FROM users LIKE 'role'",
    );
    if (roleColumn.length > 0) {
      const columnType = (roleColumn[0].Type || roleColumn[0].type || "") as string;
      if (!columnType.includes("'dev'")) {
        console.log("[DB] Updating users.role enum to include 'dev'.");
        await runSqlFile(
          pool,
          "database/migrations/002_add_dev_role.sql",
          "Add dev role",
          { ignoreExists: false },
        );
      }
    }

    const [workspaceTables] = await pool.query<RowDataPacket[]>(
      "SHOW TABLES LIKE 'tool_jobs'",
    );
    if (workspaceTables.length === 0) {
      console.log("[DB] Workspace storage tables missing. Applying migration 004_workspace_storage.sql");
      await runSqlFile(
        pool,
        "database/migrations/004_workspace_storage.sql",
        "Workspace storage",
      );
    }

    const [loginSettingsTables] = await pool.query<RowDataPacket[]>(
      "SHOW TABLES LIKE 'application_login_settings'",
    );
    if (loginSettingsTables.length === 0) {
      console.log("[DB] Application login settings missing. Applying migration 005_application_login_settings.sql");
      await runSqlFile(
        pool,
        "database/migrations/005_application_login_settings.sql",
        "Application login settings",
      );
    }

    migrationChecked = true;
  } catch (error) {
    console.error("[DB] Auto-migration check failed:", error);
    // Continue running - downstream code handles missing tables gracefully
  }
}

export function getDbPool(): Pool {
  if (!client) {
    client = createPool();
    ensureDatabaseSchema(client).catch((err) => {
      console.error("Database schema check failed:", err);
    });
  }

  return client;
}
