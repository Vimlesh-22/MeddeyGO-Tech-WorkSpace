import { NextResponse, type NextRequest } from "next/server";
import { requireSessionUserFromRequest } from "@/lib/auth/guards";
import { getDbPool } from "@/lib/db";
import { type ResultSetHeader } from "mysql2/promise";

export async function POST(request: NextRequest) {
  try {
    const user = await requireSessionUserFromRequest(request);
    if (user.role !== "admin" && user.role !== "dev") {
      return NextResponse.json({ error: "Admin required" }, { status: 403 });
    }
    const body = await request.json();
    const { userIds, notification } = body as { userIds: number[]; notification: { title: string; content: string; type: string } };
    if (!Array.isArray(userIds) || userIds.length === 0) {
      return NextResponse.json({ error: "userIds required" }, { status: 400 });
    }
    const pool = getDbPool();
    for (const uid of userIds) {
      await pool.query<ResultSetHeader>(
        `INSERT INTO user_messages (user_id, title, content, type, priority, dismissed)
         VALUES (?, ?, ?, ?, 'medium', 0)`,
        [uid, notification.title, notification.content, notification.type || 'message']
      );
    }
    return NextResponse.json({ ok: true, count: userIds.length });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}