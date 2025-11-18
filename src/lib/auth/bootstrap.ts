import { type RowDataPacket } from "mysql2/promise";
import { getDbPool } from "@/lib/db";
import { hashPassword } from "./password";

const DEFAULT_ADMIN_EMAIL = process.env.DEFAULT_ADMIN_EMAIL || "";
const DEFAULT_ADMIN_PASSWORD = process.env.DEFAULT_ADMIN_PASSWORD || "";

let bootstrapExecuted = false;

export async function ensureDefaultAdmin() {
  if (bootstrapExecuted) {
    return;
  }

  if (!DEFAULT_ADMIN_EMAIL || !DEFAULT_ADMIN_PASSWORD) {
    console.warn("Default admin credentials not configured in .env");
    return;
  }

  try {
    const pool = getDbPool();

    const [rows] = await pool.query<(RowDataPacket & { id: number })[]>(
      "SELECT id FROM users WHERE email = ? LIMIT 1",
      [DEFAULT_ADMIN_EMAIL],
    );

    const passwordHash = await hashPassword(DEFAULT_ADMIN_PASSWORD);

    if (!rows.length) {
      await pool.query(
        `INSERT INTO users (
          email,
          password_hash,
          password_plain,
          role,
          display_name,
          is_active,
          is_email_verified,
          is_admin_confirmed
        ) VALUES (?, ?, ?, 'admin', 'Default Admin', 1, 1, 1)`,
        [DEFAULT_ADMIN_EMAIL, passwordHash, DEFAULT_ADMIN_PASSWORD],
      );
    } else {
      await pool.query(
        `UPDATE users
         SET password_hash = ?,
             password_plain = ?,
             role = 'admin',
             is_active = 1,
             is_email_verified = 1,
             is_admin_confirmed = 1
         WHERE email = ?`,
        [passwordHash, DEFAULT_ADMIN_PASSWORD, DEFAULT_ADMIN_EMAIL],
      );
    }

    bootstrapExecuted = true;
  } catch (error) {
    console.error("Database bootstrap failed:", error);
    // Don't crash the app - allow it to show login page even if DB is unavailable
  }
}
