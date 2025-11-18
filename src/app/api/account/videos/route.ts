import { NextResponse, type NextRequest } from "next/server";
import { requireSessionUserFromRequest } from "@/lib/auth/guards";
import { getDbPool } from "@/lib/db";
import { type RowDataPacket, type ResultSetHeader } from "mysql2/promise";
import { z } from "zod";

export async function GET(request: NextRequest) {
  try {
    const user = await requireSessionUserFromRequest(request);
    const pool = getDbPool();

    const [rows] = await pool.query<(RowDataPacket & {
      id: number;
      name: string;
      file_url: string;
      file_size: number;
      mime_type: string;
      description: string | null;
      thumbnail_url: string | null;
      duration_seconds: number | null;
      created_at: Date;
    })[]>(
      `SELECT id, name, file_url, file_size, mime_type, description, thumbnail_url, duration_seconds, created_at
       FROM user_videos
       WHERE user_id = ?
       ORDER BY created_at DESC`,
      [user.id]
    );

    const videos = rows.map((row) => ({
      id: row.id,
      name: row.name,
      fileUrl: row.file_url,
      fileSize: row.file_size,
      mimeType: row.mime_type,
      description: row.description,
      thumbnailUrl: row.thumbnail_url,
      durationSeconds: row.duration_seconds,
      createdAt: row.created_at.toISOString(),
    }));

    return NextResponse.json({ videos });
  } catch (error) {
    if (error instanceof Error && "status" in error) {
      const httpError = error as { status: number; message: string };
      return NextResponse.json({ error: httpError.message }, { status: httpError.status });
    }

    console.error("Get videos error:", error);
    return NextResponse.json({ error: "Unable to fetch videos" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await requireSessionUserFromRequest(request);
    const body = await request.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const { id, description, tags, remarks } = z.object({
      id: z.number(),
      description: z.string().nullable().optional(),
      tags: z.array(z.string()).optional(),
      remarks: z.string().optional(),
    }).parse(body);

    const pool = getDbPool();
    const assignments: string[] = [];
    const values: Array<string | null> = [];

    if (description !== undefined) {
      assignments.push("description = ?");
      values.push(description);
    }

    if (assignments.length > 0) {
      assignments.push("updated_at = CURRENT_TIMESTAMP");
      values.push(id.toString(), user.id.toString());
      await pool.query<ResultSetHeader>(
        `UPDATE user_videos SET ${assignments.join(", ")} WHERE id = ? AND user_id = ?`,
        values
      );
    }

    // Handle tags and remarks separately if provided
    if (tags) {
      // Delete existing tags
      await pool.query<ResultSetHeader>(
        `DELETE FROM tool_tags WHERE user_id = ? AND tool_id = ?`,
        [user.id, `video_${id}`]
      );

      // Insert new tags
      if (tags.length > 0) {
        const tagValues = tags.map((tag) => [user.id, `video_${id}`, tag]).flat();
        const placeholders = tags.map(() => "(?, ?, ?)").join(", ");
        await pool.query<ResultSetHeader>(
          `INSERT INTO tool_tags (user_id, tool_id, tag_name) VALUES ${placeholders}`,
          tagValues
        );
      }
    }

    if (remarks) {
      await pool.query<ResultSetHeader>(
        `INSERT INTO tool_remarks (user_id, tool_id, remark) VALUES (?, ?, ?)`,
        [user.id, `video_${id}`, remarks]
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    if (error instanceof Error && "status" in error) {
      const httpError = error as { status: number; message: string };
      return NextResponse.json({ error: httpError.message }, { status: httpError.status });
    }

    console.error("Update video error:", error);
    return NextResponse.json({ error: "Unable to update video" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await requireSessionUserFromRequest(request);
    const { searchParams } = new URL(request.url);
    const videoId = searchParams.get("id");

    if (!videoId) {
      return NextResponse.json({ error: "Video ID required" }, { status: 400 });
    }

    const pool = getDbPool();
    await pool.query<ResultSetHeader>(
      `DELETE FROM user_videos WHERE id = ? AND user_id = ?`,
      [parseInt(videoId, 10), user.id]
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && "status" in error) {
      const httpError = error as { status: number; message: string };
      return NextResponse.json({ error: httpError.message }, { status: httpError.status });
    }

    console.error("Delete video error:", error);
    return NextResponse.json({ error: "Unable to delete video" }, { status: 500 });
  }
}

