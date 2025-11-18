import { NextResponse, type NextRequest } from "next/server";
import { requireDevFromRequest } from "@/lib/auth/guards";
import { getDbPool } from "@/lib/db";
import { type RowDataPacket, type ResultSetHeader } from "mysql2/promise";
import { z } from "zod";

const scheduleSchema = z.object({
  toolId: z.string().min(1),
  toolName: z.string().min(1),
  openAt: z.string(), // ISO date string
  closeAt: z.string().nullable().optional(),
  isActive: z.boolean().default(true),
  surpriseMessage: z.string().nullable().optional(),
  customMessage: z.string().nullable().optional(),
});

export async function GET(request: NextRequest) {
  try {
    await requireDevFromRequest(request);
    const pool = getDbPool();

    const [rows] = await pool.query<(RowDataPacket & {
      id: number;
      tool_id: string;
      tool_name: string;
      open_at: Date;
      close_at: Date | null;
      is_active: number;
      surprise_message: string | null;
      custom_message: string | null;
      created_at: Date;
    })[]>(
      `SELECT id, tool_id, tool_name, open_at, close_at, is_active, surprise_message, custom_message, created_at
       FROM tool_schedules
       ORDER BY open_at ASC`
    );

    const schedules = rows.map((row) => ({
      id: row.id,
      toolId: row.tool_id,
      toolName: row.tool_name,
      openAt: row.open_at.toISOString(),
      closeAt: row.close_at?.toISOString() || null,
      isActive: Boolean(row.is_active),
      surpriseMessage: row.surprise_message,
      customMessage: row.custom_message,
      createdAt: row.created_at.toISOString(),
    }));

    return NextResponse.json({ schedules });
  } catch (error) {
    if (error instanceof Error && "status" in error) {
      const httpError = error as { status: number; message: string };
      return NextResponse.json({ error: httpError.message }, { status: httpError.status });
    }

    console.error("Get schedules error:", error);
    return NextResponse.json({ error: "Unable to fetch schedules" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const dev = await requireDevFromRequest(request);
    const body = await request.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const data = scheduleSchema.parse(body);
    const pool = getDbPool();

    const openAt = new Date(data.openAt);
    const closeAt = data.closeAt ? new Date(data.closeAt) : null;

    await pool.query<ResultSetHeader>(
      `INSERT INTO tool_schedules (tool_id, tool_name, open_at, close_at, is_active, surprise_message, custom_message, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         tool_name = VALUES(tool_name),
         open_at = VALUES(open_at),
         close_at = VALUES(close_at),
         is_active = VALUES(is_active),
         surprise_message = VALUES(surprise_message),
         custom_message = VALUES(custom_message),
         updated_at = CURRENT_TIMESTAMP`,
      [
        data.toolId,
        data.toolName,
        openAt,
        closeAt,
        data.isActive ? 1 : 0,
        data.surpriseMessage || null,
        data.customMessage || null,
        dev.id,
      ]
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    if (error instanceof Error && "status" in error) {
      const httpError = error as { status: number; message: string };
      return NextResponse.json({ error: httpError.message }, { status: httpError.status });
    }

    console.error("Create schedule error:", error);
    return NextResponse.json({ error: "Unable to create schedule" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await requireDevFromRequest(request);
    const { searchParams } = new URL(request.url);
    const scheduleId = searchParams.get("id");

    if (!scheduleId) {
      return NextResponse.json({ error: "Schedule ID required" }, { status: 400 });
    }

    const pool = getDbPool();
    await pool.query<ResultSetHeader>(
      `DELETE FROM tool_schedules WHERE id = ?`,
      [parseInt(scheduleId, 10)]
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && "status" in error) {
      const httpError = error as { status: number; message: string };
      return NextResponse.json({ error: httpError.message }, { status: httpError.status });
    }

    console.error("Delete schedule error:", error);
    return NextResponse.json({ error: "Unable to delete schedule" }, { status: 500 });
  }
}

