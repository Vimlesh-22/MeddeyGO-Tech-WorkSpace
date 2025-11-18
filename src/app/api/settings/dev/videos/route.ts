import { NextResponse, type NextRequest } from "next/server";
import { requireDevFromRequest } from "@/lib/auth/guards";
import { getDbPool } from "@/lib/db";
import { type RowDataPacket, type ResultSetHeader } from "mysql2/promise";

const isMissingTableError = (error: unknown): boolean =>
  Boolean(
    error &&
    typeof error === "object" &&
    "code" in error &&
    (error as { code?: string }).code === "ER_NO_SUCH_TABLE"
  );

export async function GET(request: NextRequest) {
  try {
    await requireDevFromRequest(request);
    const pool = getDbPool();

    const [rows] = await pool.query<(RowDataPacket & {
      id: number;
      name: string;
      file_path: string;
      file_url: string;
      file_size: number;
      mime_type: string;
      duration: number | null;
      thumbnail_url: string | null;
      description: string | null;
      created_at: Date;
    })[]>(
      `SELECT id, name, file_path, file_url, file_size, mime_type, duration, thumbnail_url, description, created_at
       FROM dev_videos
       ORDER BY created_at DESC`
    );

    const videos = rows.map((row) => ({
      id: row.id,
      name: row.name,
      fileUrl: row.file_url,
      filePath: row.file_path,
      fileSize: row.file_size,
      mimeType: row.mime_type,
      duration: row.duration,
      thumbnailUrl: row.thumbnail_url,
      description: row.description,
      createdAt: row.created_at.toISOString(),
    }));

    return NextResponse.json({ videos });
  } catch (error) {
    if (error instanceof Error && "status" in error) {
      const httpError = error as { status: number; message: string };
      return NextResponse.json({ error: httpError.message }, { status: httpError.status });
    }

    if (isMissingTableError(error)) {
      console.warn("[Dev Videos] Table missing. Returning empty list.");
      return NextResponse.json({ videos: [] });
    }

    console.error("Get dev videos error:", error);
    return NextResponse.json({ error: "Unable to fetch videos" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const dev = await requireDevFromRequest(request);
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const name = formData.get("name") as string;
    const description = formData.get("description") as string | null;
    const duration = formData.get("duration") as string | null;

    if (!file || !name) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Upload video file
    const uploadFormData = new FormData();
    uploadFormData.append("file", file);
    uploadFormData.append("type", "dev-video");

    const uploadResponse = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"}/api/upload`, {
      method: "POST",
      body: uploadFormData,
      headers: {
        "Cookie": request.headers.get("cookie") || "",
      },
    });

    if (!uploadResponse.ok) {
      const error = await uploadResponse.json().catch(() => null);
      return NextResponse.json({ error: error?.error || "Failed to upload video" }, { status: 500 });
    }

    const uploadData = await uploadResponse.json();

    // Save to dev_videos table
    const pool = getDbPool();
    const [result] = await pool.query<ResultSetHeader>(
      `INSERT INTO dev_videos (name, file_path, file_url, file_size, mime_type, duration, description, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        name,
        uploadData.file.fileUrl.replace("/uploads/", ""),
        uploadData.file.fileUrl,
        uploadData.file.fileSize,
        uploadData.file.mimeType,
        duration ? parseInt(duration, 10) : null,
        description || null,
        dev.id,
      ]
    );

    return NextResponse.json({ ok: true, videoId: result.insertId });
  } catch (error) {
    if (error instanceof Error && "status" in error) {
      const httpError = error as { status: number; message: string };
      return NextResponse.json({ error: httpError.message }, { status: httpError.status });
    }

    if (isMissingTableError(error)) {
      console.warn("[Dev Videos] Table missing on create. Skipping DB write and returning no-op.");
      return NextResponse.json({ ok: true, videoId: 0 });
    }

    console.error("Create dev video error:", error);
    return NextResponse.json({ error: "Unable to upload video" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await requireDevFromRequest(request);
    const { searchParams } = new URL(request.url);
    const videoId = searchParams.get("id");

    if (!videoId) {
      return NextResponse.json({ error: "Video ID required" }, { status: 400 });
    }

    const pool = getDbPool();
    
    // Get video info before deleting
    const [rows] = await pool.query<(RowDataPacket & {
      file_path: string;
    })[]>(
      `SELECT file_path FROM dev_videos WHERE id = ?`,
      [parseInt(videoId, 10)]
    );

    if (rows.length === 0) {
      return NextResponse.json({ error: "Video not found" }, { status: 404 });
    }

    // Delete from database
    await pool.query<ResultSetHeader>(
      `DELETE FROM dev_videos WHERE id = ?`,
      [parseInt(videoId, 10)]
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && "status" in error) {
      const httpError = error as { status: number; message: string };
      return NextResponse.json({ error: httpError.message }, { status: httpError.status });
    }

    if (isMissingTableError(error)) {
      console.warn("[Dev Videos] Table missing on delete. Treating as success.");
      return NextResponse.json({ ok: true });
    }

    console.error("Delete dev video error:", error);
    return NextResponse.json({ error: "Unable to delete video" }, { status: 500 });
  }
}
