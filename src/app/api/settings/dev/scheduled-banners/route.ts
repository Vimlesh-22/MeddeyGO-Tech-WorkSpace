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
      file_url: string;
      target_role: string;
      scheduled_at: Date;
      scheduled_until: Date | null;
      is_active: number;
      created_at: Date;
    })[]>(
      `SELECT id, name, file_url, target_role, scheduled_at, scheduled_until, is_active, created_at
       FROM scheduled_banners
       ORDER BY scheduled_at DESC`
    );

    const banners = rows.map((row) => ({
      id: row.id,
      name: row.name,
      fileUrl: row.file_url,
      targetRole: row.target_role,
      scheduledAt: row.scheduled_at.toISOString(),
      scheduledUntil: row.scheduled_until?.toISOString() || null,
      isActive: Boolean(row.is_active),
      createdAt: row.created_at.toISOString(),
    }));

    return NextResponse.json({ banners });
  } catch (error) {
    if (error instanceof Error && "status" in error) {
      const httpError = error as { status: number; message: string };
      return NextResponse.json({ error: httpError.message }, { status: httpError.status });
    }

    if (isMissingTableError(error)) {
      console.warn("[Scheduled Banners] Table missing. Returning empty list.");
      return NextResponse.json({ banners: [] });
    }

    console.error("Get scheduled banners error:", error);
    return NextResponse.json({ error: "Unable to fetch banners" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const dev = await requireDevFromRequest(request);
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const name = formData.get("name") as string;
    const targetRole = formData.get("targetRole") as string;
    const scheduledAt = formData.get("scheduledAt") as string;
    const scheduledUntil = formData.get("scheduledUntil") as string | null;

    if (!file || !name || !scheduledAt) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Upload file first
    const uploadFormData = new FormData();
    uploadFormData.append("file", file);
    uploadFormData.append("type", "dev-image");

    const uploadResponse = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"}/api/upload`, {
      method: "POST",
      body: uploadFormData,
      headers: {
        "Cookie": request.headers.get("cookie") || "",
      },
    });

    if (!uploadResponse.ok) {
      const error = await uploadResponse.json().catch(() => null);
      return NextResponse.json({ error: error?.error || "Failed to upload file" }, { status: 500 });
    }

    const uploadData = await uploadResponse.json();

    // Save to scheduled_banners table
    const pool = getDbPool();
    await pool.query<ResultSetHeader>(
      `INSERT INTO scheduled_banners (name, file_path, file_url, file_size, mime_type, target_role, scheduled_at, scheduled_until, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        name,
        uploadData.file.fileUrl.replace("/uploads/", ""),
        uploadData.file.fileUrl,
        uploadData.file.fileSize,
        uploadData.file.mimeType,
        targetRole || "all",
        new Date(scheduledAt),
        scheduledUntil ? new Date(scheduledUntil) : null,
        dev.id,
      ]
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Create scheduled banner error:", error);
    return NextResponse.json({ error: "Unable to create scheduled banner" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await requireDevFromRequest(request);
    const { searchParams } = new URL(request.url);
    const bannerId = searchParams.get("id");

    if (!bannerId) {
      return NextResponse.json({ error: "Banner ID required" }, { status: 400 });
    }

    const pool = getDbPool();
    await pool.query<ResultSetHeader>(
      `DELETE FROM scheduled_banners WHERE id = ?`,
      [parseInt(bannerId, 10)]
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && "status" in error) {
      const httpError = error as { status: number; message: string };
      return NextResponse.json({ error: httpError.message }, { status: httpError.status });
    }

    if (isMissingTableError(error)) {
      console.warn("[Scheduled Banners] Table missing on delete. Treating as success.");
      return NextResponse.json({ ok: true });
    }

    console.error("Delete scheduled banner error:", error);
    return NextResponse.json({ error: "Unable to delete banner" }, { status: 500 });
  }
}

