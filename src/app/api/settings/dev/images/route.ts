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
      description: string | null;
      created_at: Date;
    })[]>(
      `SELECT id, name, file_path, file_url, file_size, mime_type, description, created_at
       FROM dev_images
       ORDER BY created_at DESC`
    );

    const images = rows.map((row) => ({
      id: row.id,
      name: row.name,
      fileUrl: row.file_url,
      filePath: row.file_path,
      fileSize: row.file_size,
      mimeType: row.mime_type,
      description: row.description,
      createdAt: row.created_at.toISOString(),
    }));

    return NextResponse.json({ images });
  } catch (error) {
    if (error instanceof Error && "status" in error) {
      const httpError = error as { status: number; message: string };
      return NextResponse.json({ error: httpError.message }, { status: httpError.status });
    }

    if (isMissingTableError(error)) {
      console.warn("[Dev Images] Table missing. Returning empty list.");
      return NextResponse.json({ images: [] });
    }

    console.error("Get dev images error:", error);
    return NextResponse.json({ error: "Unable to fetch images" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await requireDevFromRequest(request);
    const { searchParams } = new URL(request.url);
    const imageId = searchParams.get("id");

    if (!imageId) {
      return NextResponse.json({ error: "Image ID required" }, { status: 400 });
    }

    const pool = getDbPool();
    
    // Get image info before deleting
    const [rows] = await pool.query<(RowDataPacket & {
      file_path: string;
    })[]>(
      `SELECT file_path FROM dev_images WHERE id = ?`,
      [parseInt(imageId, 10)]
    );

    if (rows.length === 0) {
      return NextResponse.json({ error: "Image not found" }, { status: 404 });
    }

    // Delete from database
    await pool.query<ResultSetHeader>(
      `DELETE FROM dev_images WHERE id = ?`,
      [parseInt(imageId, 10)]
    );

    // Note: File deletion from filesystem should be handled separately
    // This is just the database record deletion

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && "status" in error) {
      const httpError = error as { status: number; message: string };
      return NextResponse.json({ error: httpError.message }, { status: httpError.status });
    }

    if (isMissingTableError(error)) {
      console.warn("[Dev Images] Table missing on delete. Treating as success.");
      return NextResponse.json({ ok: true });
    }

    console.error("Delete dev image error:", error);
    return NextResponse.json({ error: "Unable to delete image" }, { status: 500 });
  }
}

