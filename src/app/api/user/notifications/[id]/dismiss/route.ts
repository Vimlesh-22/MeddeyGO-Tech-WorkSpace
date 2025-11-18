import { NextResponse, type NextRequest } from "next/server";
import { requireSessionUserFromRequest } from "@/lib/auth/guards";
import { getDbPool } from "@/lib/db";
import { type ResultSetHeader } from "mysql2/promise";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireSessionUserFromRequest(request);
    const messageId = parseInt(params.id, 10);

    if (isNaN(messageId)) {
      return NextResponse.json({ error: "Invalid message ID" }, { status: 400 });
    }

    const pool = getDbPool();

    // Check if the message exists and belongs to the user
    const [existingRows] = await pool.query(
      "SELECT id FROM user_messages WHERE id = ? AND user_id = ?",
      [messageId, user.id]
    );

    if (existingRows.length === 0) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }

    // Mark the message as dismissed
    await pool.query<ResultSetHeader>(
      `INSERT INTO user_message_dismissals (user_id, message_id, dismissed_at) 
       VALUES (?, ?, NOW()) 
       ON DUPLICATE KEY UPDATE dismissed_at = NOW()`,
      [user.id, messageId]
    );

    // Update the dismissed flag in user_messages
    await pool.query<ResultSetHeader>(
      "UPDATE user_messages SET dismissed = 1 WHERE id = ?",
      [messageId]
    );

    return NextResponse.json({ 
      ok: true, 
      message: "Notification dismissed successfully" 
    });
  } catch (error) {
    if (error instanceof Error && "status" in error) {
      const httpError = error as { status: number; message: string };
      return NextResponse.json({ error: httpError.message }, { status: httpError.status });
    }

    console.error("Dismiss notification error:", error);
    return NextResponse.json({ error: "Unable to dismiss notification" }, { status: 500 });
  }
}