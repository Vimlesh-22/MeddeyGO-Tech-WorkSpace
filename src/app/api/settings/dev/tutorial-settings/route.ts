import { NextResponse, type NextRequest } from "next/server";
import { requireAdminFromRequest, requireDevFromRequest } from "@/lib/auth/guards";
import { getDbPool } from "@/lib/db";
import { type RowDataPacket, type ResultSetHeader } from "mysql2/promise";
import { z } from "zod";

async function ensureTutorialSettingsTable(pool: ReturnType<typeof getDbPool>) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tutorial_settings (
      id INT AUTO_INCREMENT PRIMARY KEY,
      setting_key VARCHAR(100) NOT NULL UNIQUE,
      setting_value TEXT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_key (setting_key)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

export async function GET(request: NextRequest) {
  try {
    // Allow both admin and dev users to access tutorial settings
    try {
      await requireAdminFromRequest(request);
    } catch {
      // If not admin, try dev access
      await requireDevFromRequest(request);
    }
    const pool = getDbPool();

    try {
      const [rows] = await pool.query<(RowDataPacket & {
        setting_key: string;
        setting_value: string | null;
      })[]>(
        `SELECT setting_key, setting_value FROM tutorial_settings`
      );

      const settings = rows.reduce((acc, row) => {
        acc[row.setting_key] = row.setting_value;
        return acc;
      }, {} as Record<string, string | null>);

      return NextResponse.json({ settings });
    } catch (dbError: unknown) {
      if (dbError && typeof dbError === "object" && "code" in dbError && dbError.code === "ER_NO_SUCH_TABLE") {
        console.warn("tutorial_settings table missing; creating automatically.");
        await ensureTutorialSettingsTable(pool);
        return NextResponse.json({ settings: {} });
      }
      throw dbError;
    }
  } catch (error) {
    if (error instanceof Error && "status" in error) {
      const httpError = error as { status: number; message: string };
      return NextResponse.json({ error: httpError.message }, { status: httpError.status });
    }

    console.error("Get tutorial settings error:", error);
    return NextResponse.json({ error: "Unable to fetch settings" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    // Allow both admin and dev users to modify tutorial settings
    try {
      await requireAdminFromRequest(request);
    } catch {
      // If not admin, try dev access
      await requireDevFromRequest(request);
    }
    const body = await request.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const { key, value } = z.object({
      key: z.string().min(1),
      value: z.string().nullable(),
    }).parse(body);

    const pool = getDbPool();
    
    try {
      await pool.query<ResultSetHeader>(
        `INSERT INTO tutorial_settings (setting_key, setting_value)
         VALUES (?, ?)
         ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_at = CURRENT_TIMESTAMP`,
        [key, value]
      );

      return NextResponse.json({ ok: true });
    } catch (dbError: unknown) {
      if (dbError && typeof dbError === "object" && "code" in dbError && dbError.code === "ER_NO_SUCH_TABLE") {
        console.warn("tutorial_settings table missing on write; creating automatically.");
        await ensureTutorialSettingsTable(pool);
        await pool.query<ResultSetHeader>(
          `INSERT INTO tutorial_settings (setting_key, setting_value)
           VALUES (?, ?)
           ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_at = CURRENT_TIMESTAMP`,
          [key, value]
        );
        return NextResponse.json({ ok: true });
      }
      throw dbError;
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    if (error instanceof Error && "status" in error) {
      const httpError = error as { status: number; message: string };
      return NextResponse.json({ error: httpError.message }, { status: httpError.status });
    }

    console.error("Update tutorial settings error:", error);
    return NextResponse.json({ error: "Unable to update settings" }, { status: 500 });
  }
}

