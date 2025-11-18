import { NextResponse, type NextRequest } from "next/server";
import { requireDevFromRequest } from "@/lib/auth/guards";
import { getDbPool } from "@/lib/db";
import { type RowDataPacket, type ResultSetHeader } from "mysql2/promise";
import { z } from "zod";

const isMissingTableError = (error: unknown): boolean =>
  Boolean(
    error &&
    typeof error === "object" &&
    "code" in error &&
    (error as { code?: string }).code === "ER_NO_SUCH_TABLE"
  );

const settingSchema = z.object({
  key: z.string().min(1).max(100),
  value: z.string().nullable(),
});

export async function GET(request: NextRequest) {
  try {
    await requireDevFromRequest(request);
    const pool = getDbPool();

    const [rows] = await pool.query<(RowDataPacket & {
      id: number;
      key_name: string;
      value: string | null;
      updated_at: Date;
    })[]>(
      `SELECT id, key_name, value, updated_at FROM dev_settings ORDER BY key_name`
    );

    const settings = rows.reduce((acc, row) => {
      acc[row.key_name] = {
        id: row.id,
        value: row.value,
        updatedAt: row.updated_at.toISOString(),
      };
      return acc;
    }, {} as Record<string, { id: number; value: string | null; updatedAt: string }>);

    return NextResponse.json({ settings });
  } catch (error) {
    if (error instanceof Error && "status" in error) {
      const httpError = error as { status: number; message: string };
      return NextResponse.json({ error: httpError.message }, { status: httpError.status });
    }

    if (isMissingTableError(error)) {
      console.warn("[Dev Settings] Table missing. Returning empty settings.");
      return NextResponse.json({ settings: {} });
    }

    console.error("Get dev settings error:", error);
    return NextResponse.json({ error: "Unable to fetch settings" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireDevFromRequest(request);
    const body = await request.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const { key, value } = settingSchema.parse(body);
    const pool = getDbPool();

    // Upsert setting
    await pool.query<ResultSetHeader>(
      `INSERT INTO dev_settings (key_name, value) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE value = ?, updated_at = CURRENT_TIMESTAMP`,
      [key, value, value]
    );

    return NextResponse.json({ ok: true, message: "Setting saved" });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    if (error instanceof Error && "status" in error) {
      const httpError = error as { status: number; message: string };
      return NextResponse.json({ error: httpError.message }, { status: httpError.status });
    }

    console.error("Save dev setting error:", error);
    return NextResponse.json({ error: "Unable to save setting" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await requireDevFromRequest(request);
    const { searchParams } = new URL(request.url);
    const key = searchParams.get("key");

    if (!key) {
      return NextResponse.json({ error: "Key parameter required" }, { status: 400 });
    }

    const pool = getDbPool();
    await pool.query<ResultSetHeader>(
      `DELETE FROM dev_settings WHERE key_name = ?`,
      [key]
    );

    return NextResponse.json({ ok: true, message: "Setting deleted" });
  } catch (error) {
    if (error instanceof Error && "status" in error) {
      const httpError = error as { status: number; message: string };
      return NextResponse.json({ error: httpError.message }, { status: httpError.status });
    }

    if (isMissingTableError(error)) {
      console.warn("[Dev Settings] Table missing on delete. Treating as success.");
      return NextResponse.json({ ok: true, message: "Setting deleted" });
    }

    console.error("Delete dev setting error:", error);
    return NextResponse.json({ error: "Unable to delete setting" }, { status: 500 });
  }
}

