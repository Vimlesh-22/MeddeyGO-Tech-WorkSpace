import { NextResponse, type NextRequest } from "next/server";
import { requireSessionUserFromRequest } from "@/lib/auth/guards";
import { getDbPool } from "@/lib/db";
import { type RowDataPacket, type ResultSetHeader } from "mysql2/promise";

export async function GET(request: NextRequest) {
  try {
    const user = await requireSessionUserFromRequest(request);
    const pool = getDbPool();

    // Get user's role for filtering
    const [userRows] = await pool.query<RowDataPacket[]>(
      "SELECT role FROM users WHERE id = ?",
      [user.id]
    );

    if (userRows.length === 0) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const userRole = userRows[0].role;

    // Get active notifications for the user
    const [notifications] = await pool.query<(RowDataPacket & {
      id: number;
      title: string;
      content: string;
      // type may not exist in DB; handled as default below
      image_url: string | null;
      video_url: string | null;
      priority: 'low' | 'medium' | 'high' | null;
      created_at: Date;
      dismissed: number;
      message_id: number;
      target_role: string;
      delivery_method: string;
      is_active: number;
      expires_at: Date | null;
    })[]>(
      `SELECT 
        um.id,
        um.title,
        um.content,
        um.priority,
        um.created_at,
        CASE WHEN umd.id IS NULL THEN 0 ELSE 1 END as dismissed,
        dm.id as message_id,
        dm.target_role,
        dm.delivery_method,
        dm.is_active,
        dm.expires_at
       FROM user_messages um
       LEFT JOIN dev_messages dm ON um.message_id = dm.id
       LEFT JOIN user_message_dismissals umd ON um.id = umd.message_id AND umd.user_id = ?
       WHERE um.user_id = ? 
         AND um.dismissed = 0
         AND (um.expires_at IS NULL OR um.expires_at > NOW())
         AND (dm.expires_at IS NULL OR dm.expires_at > NOW())
       ORDER BY um.priority DESC, um.created_at DESC
       LIMIT 10`,
      [user.id, user.id]
    );

    const activeNotifications = notifications.map((row) => ({
      id: row.id,
      title: row.title,
      content: row.content,
      type: (row as { type?: string }).type ?? 'message',
      imageUrl: null,
      videoUrl: null,
      priority: row.priority || "medium",
      createdAt: row.created_at.toISOString(),
      isDismissible: true,
    }));

    return NextResponse.json({ 
      notifications: activeNotifications,
      userRole,
      count: activeNotifications.length 
    });
  } catch (error) {
    if (error instanceof Error && "status" in error) {
      const httpError = error as { status: number; message: string };
      return NextResponse.json({ error: httpError.message }, { status: httpError.status });
    }

    console.error("Get user notifications error:", error);
    return NextResponse.json({ error: "Unable to fetch notifications" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireSessionUserFromRequest(request);
    const body = await request.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const { title, content, type = "message", imageUrl, videoUrl, priority = "medium" } = body;
    
    if (!title || !content) {
      return NextResponse.json({ error: "Title and content are required" }, { status: 400 });
    }

    const pool = getDbPool();

    // Create a user-specific message
    const [result] = await pool.query<ResultSetHeader>(
      `INSERT INTO user_messages (user_id, title, content, type, image_url, video_url, priority)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [user.id, title, content, type, imageUrl || null, videoUrl || null, priority]
    );

    return NextResponse.json({ 
      ok: true, 
      messageId: result.insertId,
      message: "Notification created successfully"
    });
  } catch (error) {
    if (error instanceof Error && "status" in error) {
      const httpError = error as { status: number; message: string };
      return NextResponse.json({ error: httpError.message }, { status: httpError.status });
    }

    console.error("Create user notification error:", error);
    return NextResponse.json({ error: "Unable to create notification" }, { status: 500 });
  }
}
