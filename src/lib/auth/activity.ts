import { type RowDataPacket, type ResultSetHeader } from "mysql2/promise";
import { getDbPool } from "@/lib/db";
import type { ActivityLogEntry } from "./types";

export async function logActivity(
  userId: number | null,
  action: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  const pool = getDbPool();
  const payload = metadata ? JSON.stringify(metadata) : null;

  await pool.query<ResultSetHeader>(
    `INSERT INTO activity_log (user_id, action, details) VALUES (?, ?, ?)`
      .replace(/\s+/g, " "),
    [userId, action, payload],
  );
}

export async function listRecentActivity(limit = 50): Promise<ActivityLogEntry[]> {
  const pool = getDbPool();
  const [rows] = await pool.query<(RowDataPacket & {
    id: number;
    user_id: number | null;
    action: string;
    details: string | null;
    created_at: Date;
    email: string | null;
  })[]>(
    `SELECT al.id, al.user_id, al.action, al.details, al.created_at, u.email
     FROM activity_log al
     LEFT JOIN users u ON u.id = al.user_id
     ORDER BY al.created_at DESC
     LIMIT ?`,
    [limit],
  );

  return rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    userEmail: row.email,
    action: row.action,
    metadata: row.details ? safeParseJSON(row.details) : null,
    createdAt: row.created_at.toISOString(),
  }));
}

function safeParseJSON(value: string): Record<string, unknown> | null {
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return null;
  }
}
