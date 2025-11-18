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
      is_active: number;
      display_order: number;
      created_at: Date;
    })[]>(
      `SELECT id, name, file_url, file_size, mime_type, is_active, display_order, created_at
       FROM user_banners
       WHERE user_id = ?
       ORDER BY display_order ASC, created_at DESC`,
      [user.id]
    );

    const banners = rows.map((row) => ({
      id: row.id,
      name: row.name,
      fileUrl: row.file_url,
      fileSize: row.file_size,
      mimeType: row.mime_type,
      isActive: Boolean(row.is_active),
      displayOrder: row.display_order,
      createdAt: row.created_at.toISOString(),
    }));

    return NextResponse.json({ banners });
  } catch (error) {
    if (error instanceof Error && "status" in error) {
      const httpError = error as { status: number; message: string };
      return NextResponse.json({ error: httpError.message }, { status: httpError.status });
    }

    console.error("Get banners error:", error);
    return NextResponse.json({ error: "Unable to fetch banners" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await requireSessionUserFromRequest(request);
    const body = await request.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const { id, isActive, displayOrder } = z.object({
      id: z.number(),
      isActive: z.boolean().optional(),
      displayOrder: z.number().optional(),
    }).parse(body);

    const pool = getDbPool();
    const assignments: string[] = [];
    const values: Array<number | boolean> = [];

    if (isActive !== undefined) {
      assignments.push("is_active = ?");
      values.push(isActive ? 1 : 0);
    }
    if (displayOrder !== undefined) {
      assignments.push("display_order = ?");
      values.push(displayOrder);
    }

    if (assignments.length === 0) {
      return NextResponse.json({ error: "No updates provided" }, { status: 400 });
    }

    assignments.push("updated_at = CURRENT_TIMESTAMP");
    values.push(id, user.id);

    await pool.query<ResultSetHeader>(
      `UPDATE user_banners SET ${assignments.join(", ")} WHERE id = ? AND user_id = ?`,
      values
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

    console.error("Update banner error:", error);
    return NextResponse.json({ error: "Unable to update banner" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await requireSessionUserFromRequest(request);
    const { searchParams } = new URL(request.url);
    const bannerId = searchParams.get("id");

    if (!bannerId) {
      return NextResponse.json({ error: "Banner ID required" }, { status: 400 });
    }

    const pool = getDbPool();
    await pool.query<ResultSetHeader>(
      `DELETE FROM user_banners WHERE id = ? AND user_id = ?`,
      [parseInt(bannerId, 10), user.id]
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && "status" in error) {
      const httpError = error as { status: number; message: string };
      return NextResponse.json({ error: httpError.message }, { status: httpError.status });
    }

    console.error("Delete banner error:", error);
    return NextResponse.json({ error: "Unable to delete banner" }, { status: 500 });
  }
}

