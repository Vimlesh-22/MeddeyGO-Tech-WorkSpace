import { NextResponse, type NextRequest } from "next/server";
import { requireDevFromRequest } from "@/lib/auth/guards";
import { getDbPool } from "@/lib/db";
import { type RowDataPacket, type ResultSetHeader } from "mysql2/promise";
import { z } from "zod";

export async function GET(request: NextRequest) {
  try {
    await requireDevFromRequest(request);
    const { searchParams } = new URL(request.url);
    const toolId = searchParams.get("toolId");

    const pool = getDbPool();
    let query: string;
    let params: (string | number)[];

    if (toolId) {
      query = `SELECT id, message, tool_id, is_active, created_at
               FROM surprise_messages
               WHERE tool_id = ? AND is_active = 1
               ORDER BY RAND()
               LIMIT 1`;
      params = [toolId];
    } else {
      query = `SELECT id, message, tool_id, is_active, created_at
               FROM surprise_messages
               WHERE is_active = 1
               ORDER BY created_at DESC`;
      params = [];
    }

    const [rows] = await pool.query<(RowDataPacket & {
      id: number;
      message: string;
      tool_id: string | null;
      is_active: number;
      created_at: Date;
    })[]>(query, params);

    const messages = rows.map((row) => ({
      id: row.id,
      message: row.message,
      toolId: row.tool_id,
      isActive: Boolean(row.is_active),
      createdAt: row.created_at.toISOString(),
    }));

    return NextResponse.json({ messages: toolId ? (messages[0] || null) : messages });
  } catch (error) {
    if (error instanceof Error && "status" in error) {
      const httpError = error as { status: number; message: string };
      return NextResponse.json({ error: httpError.message }, { status: httpError.status });
    }

    console.error("Get surprise messages error:", error);
    return NextResponse.json({ error: "Unable to fetch messages" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const dev = await requireDevFromRequest(request);
    const body = await request.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const { message, toolId } = z.object({
      message: z.string().min(1),
      toolId: z.string().nullable().optional(),
    }).parse(body);

    const pool = getDbPool();
    await pool.query<ResultSetHeader>(
      `INSERT INTO surprise_messages (message, tool_id, created_by) VALUES (?, ?, ?)`,
      [message, toolId || null, dev.id]
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

    console.error("Create surprise message error:", error);
    return NextResponse.json({ error: "Unable to create message" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await requireDevFromRequest(request);
    const { searchParams } = new URL(request.url);
    const messageId = searchParams.get("id");

    if (!messageId) {
      return NextResponse.json({ error: "Message ID required" }, { status: 400 });
    }

    const pool = getDbPool();
    await pool.query<ResultSetHeader>(
      `DELETE FROM surprise_messages WHERE id = ?`,
      [parseInt(messageId, 10)]
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && "status" in error) {
      const httpError = error as { status: number; message: string };
      return NextResponse.json({ error: httpError.message }, { status: httpError.status });
    }

    console.error("Delete surprise message error:", error);
    return NextResponse.json({ error: "Unable to delete message" }, { status: 500 });
  }
}

