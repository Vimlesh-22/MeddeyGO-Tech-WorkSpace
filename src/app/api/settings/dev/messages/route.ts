import { NextResponse, type NextRequest } from "next/server";
import { requireDevFromRequest } from "@/lib/auth/guards";
import { getDbPool } from "@/lib/db";
import { listUsers } from "@/lib/auth/users";
import { sendEmail } from "@/lib/email";
import { logActivity } from "@/lib/auth/activity";
import { type RowDataPacket, type ResultSetHeader } from "mysql2/promise";
import { z } from "zod";

const isMissingTableError = (error: unknown): boolean =>
  Boolean(
    error &&
    typeof error === "object" &&
    "code" in error &&
    (error as { code?: string }).code === "ER_NO_SUCH_TABLE"
  );

const messageSchema = z.object({
  title: z.string().min(1).max(255),
  content: z.string().min(1),
  targetRole: z.enum(["user", "admin", "dev", "all"]).default("all"),
  isActive: z.boolean().default(true),
  expiresAt: z.string().nullable().optional(),
  deliveryMethod: z.enum(["in-app", "email", "both"]).default("in-app"),
  priority: z.enum(["low", "medium", "high"]).default("medium"),
  imageUrl: z.string().url().nullable().optional(),
  videoUrl: z.string().url().nullable().optional(),
  type: z.enum(["message", "banner", "video"]).default("message"),
});

export async function GET(request: NextRequest) {
  try {
    await requireDevFromRequest(request);
    const pool = getDbPool();

    const [rows] = await pool.query<(RowDataPacket & {
      id: number;
      title: string;
      content: string;
      target_role: string;
      is_active: number;
      created_by: number | null;
      created_at: Date;
      updated_at: Date;
      expires_at: Date | null;
      delivery_method: string;
      priority: string;
      image_url: string | null;
      video_url: string | null;
      type: string;
    })[]>(
      `SELECT id, title, content, target_role, is_active, created_by, created_at, updated_at, expires_at,
              delivery_method, priority, image_url, video_url, type
       FROM dev_messages
       ORDER BY created_at DESC`
    );

    const messages = rows.map((row) => ({
      id: row.id,
      title: row.title,
      content: row.content,
      targetRole: row.target_role,
      isActive: Boolean(row.is_active),
      createdBy: row.created_by,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
      expiresAt: row.expires_at?.toISOString() || null,
      deliveryMethod: row.delivery_method,
      priority: row.priority,
      imageUrl: row.image_url,
      videoUrl: row.video_url,
      type: row.type,
    }));

    return NextResponse.json({ messages });
  } catch (error) {
    if (error instanceof Error && "status" in error) {
      const httpError = error as { status: number; message: string };
      return NextResponse.json({ error: httpError.message }, { status: httpError.status });
    }

    if (isMissingTableError(error)) {
      console.warn("[Dev Messages] Table missing. Returning empty list.");
      return NextResponse.json({ messages: [] });
    }

    console.error("Get dev messages error:", error);
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

    const { title, content, targetRole, isActive, expiresAt, deliveryMethod, priority, imageUrl, videoUrl, type } = messageSchema.parse(body);
    const pool = getDbPool();

    const expiresAtValue = expiresAt ? new Date(expiresAt) : null;

    const [result] = await pool.query<ResultSetHeader>(
      `INSERT INTO dev_messages (title, content, target_role, is_active, created_by, expires_at, 
                                  delivery_method, priority, image_url, video_url, type)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [title, content, targetRole, isActive ? 1 : 0, dev.id, expiresAtValue, 
       deliveryMethod, priority, imageUrl, videoUrl, type]
    );

    const messageId = result.insertId;

    // If message is active and has a target role, send to users
    if (isActive) {
      const allUsers = await listUsers();
      const targetUsers = allUsers.filter((u) => {
        if (targetRole === "all") return true;
        return u.role === targetRole;
      });

      // Create user messages for target users (for in-app notifications)
      if (targetUsers.length > 0 && (deliveryMethod === "in-app" || deliveryMethod === "both")) {
        const userMessageValues = targetUsers.map((u) => [
          u.id, messageId, title, content, priority, imageUrl, videoUrl, type
        ]);
        const placeholders = userMessageValues.map(() => "(?, ?, ?, ?, ?, ?, ?, ?)").join(", ");
        const values = userMessageValues.flat();

        await pool.query<ResultSetHeader>(
          `INSERT INTO user_messages (user_id, message_id, title, content, priority, image_url, video_url, type)
           VALUES ${placeholders}`,
          values
        );
      }

      // Send email notifications (only if email or both is selected)
      if ((deliveryMethod === "email" || deliveryMethod === "both") && targetUsers.length > 0) {
        // Only send to verified and confirmed users
        const emailUsers = targetUsers.filter((u) => u.emailVerified && u.adminConfirmed);
        for (const user of emailUsers) {
          try {
            await sendEmail({
              to: user.email,
              subject: `New Message: ${title}`,
              text: `${content}\n\n---\nThis is an automated message from Meddey Tech Workspace.`,
              html: `<p>${content.replace(/\n/g, "<br>")}</p><hr><p><small>This is an automated message from Meddey Tech Workspace.</small></p>`,
            });
          } catch (emailError) {
            console.error(`Failed to send email to ${user.email}:`, emailError);
          }
        }
      }
    }

    await logActivity(dev.id, "dev_message_created", {
      messageId,
      title,
      targetRole,
    });

    return NextResponse.json({ ok: true, messageId });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    if (error instanceof Error && "status" in error) {
      const httpError = error as { status: number; message: string };
      return NextResponse.json({ error: httpError.message }, { status: httpError.status });
    }

    if (isMissingTableError(error)) {
      console.warn("[Dev Messages] Table missing on create. Skipping DB write and returning no-op.");
      return NextResponse.json({ ok: true, messageId: 0 });
    }

    console.error("Create dev message error:", error);
    return NextResponse.json({ error: "Unable to create message" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const dev = await requireDevFromRequest(request);
    const body = await request.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const { id, ...updateData } = z.object({
      id: z.number(),
      title: z.string().min(1).max(255).optional(),
      content: z.string().min(1).optional(),
      targetRole: z.enum(["user", "admin", "dev", "all"]).optional(),
      isActive: z.boolean().optional(),
      expiresAt: z.string().nullable().optional(),
      deliveryMethod: z.enum(["in-app", "email", "both"]).optional(),
      priority: z.enum(["low", "medium", "high"]).optional(),
      imageUrl: z.string().url().nullable().optional(),
      videoUrl: z.string().url().nullable().optional(),
      type: z.enum(["message", "banner", "video"]).optional(),
    }).parse(body);

    const pool = getDbPool();
    const assignments: string[] = [];
    const values: Array<string | number | Date | null> = [];

    if (updateData.title !== undefined) {
      assignments.push("title = ?");
      values.push(updateData.title);
    }
    if (updateData.content !== undefined) {
      assignments.push("content = ?");
      values.push(updateData.content);
    }
    if (updateData.targetRole !== undefined) {
      assignments.push("target_role = ?");
      values.push(updateData.targetRole);
    }
    if (updateData.isActive !== undefined) {
      assignments.push("is_active = ?");
      values.push(updateData.isActive ? 1 : 0);
    }
    if (updateData.expiresAt !== undefined) {
      assignments.push("expires_at = ?");
      values.push(updateData.expiresAt ? new Date(updateData.expiresAt) : null);
    }
    if (updateData.deliveryMethod !== undefined) {
      assignments.push("delivery_method = ?");
      values.push(updateData.deliveryMethod);
    }
    if (updateData.priority !== undefined) {
      assignments.push("priority = ?");
      values.push(updateData.priority);
    }
    if (updateData.imageUrl !== undefined) {
      assignments.push("image_url = ?");
      values.push(updateData.imageUrl);
    }
    if (updateData.videoUrl !== undefined) {
      assignments.push("video_url = ?");
      values.push(updateData.videoUrl);
    }
    if (updateData.type !== undefined) {
      assignments.push("type = ?");
      values.push(updateData.type);
    }

    if (assignments.length === 0) {
      return NextResponse.json({ error: "No updates provided" }, { status: 400 });
    }

    assignments.push("updated_at = CURRENT_TIMESTAMP");
    values.push(id);

    await pool.query<ResultSetHeader>(
      `UPDATE dev_messages SET ${assignments.join(", ")} WHERE id = ?`,
      values
    );

    await logActivity(dev.id, "dev_message_updated", { messageId: id });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    if (error instanceof Error && "status" in error) {
      const httpError = error as { status: number; message: string };
      return NextResponse.json({ error: httpError.message }, { status: httpError.status });
    }

    if (isMissingTableError(error)) {
      console.warn("[Dev Messages] Table missing on update. Treating as success.");
      return NextResponse.json({ ok: true });
    }

    console.error("Update dev message error:", error);
    return NextResponse.json({ error: "Unable to update message" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const dev = await requireDevFromRequest(request);
    const { searchParams } = new URL(request.url);
    const messageId = searchParams.get("id");

    if (!messageId) {
      return NextResponse.json({ error: "Message ID required" }, { status: 400 });
    }

    const pool = getDbPool();
    await pool.query<ResultSetHeader>(
      `DELETE FROM dev_messages WHERE id = ?`,
      [parseInt(messageId, 10)]
    );

    await logActivity(dev.id, "dev_message_deleted", { messageId: parseInt(messageId, 10) });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && "status" in error) {
      const httpError = error as { status: number; message: string };
      return NextResponse.json({ error: httpError.message }, { status: httpError.status });
    }

    console.error("Delete dev message error:", error);
    return NextResponse.json({ error: "Unable to delete message" }, { status: 500 });
  }
}

