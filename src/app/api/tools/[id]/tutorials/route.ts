import { NextResponse, type NextRequest } from "next/server";
import { requireDevFromRequest } from "@/lib/auth/guards";
import { getDbPool } from "@/lib/db";
import { type RowDataPacket, type ResultSetHeader } from "mysql2/promise";

import { fallbackToolTutorials } from "@/data/toolContent";

const isMissingTableError = (error: unknown): boolean =>
  Boolean(
    error &&
    typeof error === "object" &&
    "code" in error &&
    (error as { code?: string }).code === "ER_NO_SUCH_TABLE"
  );

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: toolId } = await params;
    let pool: ReturnType<typeof getDbPool> | null = null;
    try {
      pool = getDbPool();
    } catch (poolError) {
      console.warn(`[Tutorials] Database pool unavailable, using fallback data for ${toolId}`, poolError);
    }

    let rows: (RowDataPacket & {
      id: number;
      tool_id: string;
      tool_name: string;
      title: string;
      description: string | null;
      video_file_url: string | null;
      thumbnail_url: string | null;
      duration_seconds: number | null;
      display_order: number;
      is_active: number;
    })[] = [];
    let usingFallbackData = false;

    if (pool) {
      try {
        [rows] = await pool.query<(RowDataPacket & {
          id: number;
          tool_id: string;
          tool_name: string;
          title: string;
          description: string | null;
          video_file_url: string | null;
          thumbnail_url: string | null;
          duration_seconds: number | null;
          display_order: number;
          is_active: number;
        })[]>(
          `SELECT id, tool_id, tool_name, title, description, video_file_url, thumbnail_url, duration_seconds, display_order, is_active
           FROM tool_tutorials
           WHERE tool_id = ? AND is_active = 1
           ORDER BY display_order ASC, created_at ASC`,
          [toolId]
        );
      } catch (error) {
        if (isMissingTableError(error)) {
          usingFallbackData = true;
          console.warn(`[Tutorials] Missing tool_tutorials table. Using fallback data for ${toolId}`);
        } else {
          throw error;
        }
      }
    } else {
      usingFallbackData = true;
    }

    const tutorials = usingFallbackData
      ? (fallbackToolTutorials[toolId] ?? []).map((tutorial) => ({
        id: tutorial.id,
        toolId: tutorial.toolId,
        toolName: tutorial.toolName,
        title: tutorial.title,
        description: tutorial.description,
        videoFileUrl: tutorial.videoFileUrl,
        thumbnailUrl: tutorial.thumbnailUrl,
        durationSeconds: tutorial.durationSeconds,
        displayOrder: tutorial.displayOrder,
        isActive: tutorial.isActive,
      }))
      : rows.map((row) => ({
        id: row.id,
        toolId: row.tool_id,
        toolName: row.tool_name,
        title: row.title,
        description: row.description,
        videoFileUrl: row.video_file_url,
        thumbnailUrl: row.thumbnail_url,
        durationSeconds: row.duration_seconds,
        displayOrder: row.display_order,
        isActive: Boolean(row.is_active),
      }));

    return NextResponse.json({ tutorials });
  } catch (error) {
    console.error("Get tutorials error:", error);
    return NextResponse.json({ error: "Unable to fetch tutorials" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const dev = await requireDevFromRequest(request);
    const { id: toolId } = await params;
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const title = formData.get("title") as string;
    const description = formData.get("description") as string | null;
    const displayOrder = parseInt(formData.get("displayOrder") as string) || 0;

    if (!file || !title) {
      return NextResponse.json({ error: "File and title are required" }, { status: 400 });
    }

    // Upload video file
    const uploadFormData = new FormData();
    uploadFormData.append("file", file);
    uploadFormData.append("type", "video");

    const uploadUrl = new URL("/api/upload", request.url);
    const uploadResponse = await fetch(uploadUrl, {
      method: "POST",
      body: uploadFormData,
      headers: {
        Cookie: request.headers.get("cookie") || "",
      },
    });

    if (!uploadResponse.ok) {
      const error = await uploadResponse.json().catch(() => null);
      return NextResponse.json({ error: error?.error || "Failed to upload video" }, { status: 500 });
    }

    const uploadData = await uploadResponse.json();

    // Get tool name from projects data
    const { projects } = await import("@/data/projects");
    const tool = projects.find((p) => p.id === toolId);
    const toolName = tool?.name || toolId;

    // Save to tool_tutorials table
    const pool = getDbPool();
    await pool.query<ResultSetHeader>(
      `INSERT INTO tool_tutorials (tool_id, tool_name, title, description, video_file_path, video_file_url, video_file_size, video_mime_type, display_order, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        toolId,
        toolName,
        title,
        description || null,
        uploadData.file.fileUrl.replace("/uploads/", ""),
        uploadData.file.fileUrl,
        uploadData.file.fileSize,
        uploadData.file.mimeType,
        displayOrder,
        dev.id,
      ]
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Create tutorial error:", error);
    return NextResponse.json({ error: "Unable to create tutorial" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { }: { params: Promise<{ id: string }> }
) {
  try {
    await requireDevFromRequest(request);
    const { searchParams } = new URL(request.url);
    const tutorialId = searchParams.get("tutorialId");

    if (!tutorialId) {
      return NextResponse.json({ error: "Tutorial ID required" }, { status: 400 });
    }

    const pool = getDbPool();
    await pool.query<ResultSetHeader>(
      `DELETE FROM tool_tutorials WHERE id = ?`,
      [parseInt(tutorialId, 10)]
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && "status" in error) {
      const httpError = error as { status: number; message: string };
      return NextResponse.json({ error: httpError.message }, { status: httpError.status });
    }

    console.error("Delete tutorial error:", error);
    return NextResponse.json({ error: "Unable to delete tutorial" }, { status: 500 });
  }
}

