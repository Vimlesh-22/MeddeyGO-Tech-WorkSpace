import { NextResponse, type NextRequest } from "next/server";
import { requireSessionUserFromRequest } from "@/lib/auth/guards";
import { getDbPool } from "@/lib/db";
import { type RowDataPacket, type ResultSetHeader } from "mysql2/promise";
import { z } from "zod";

export async function GET(request: NextRequest) {
  try {
    const user = await requireSessionUserFromRequest(request);
    const pool = getDbPool();

    // Get tool customizations
    const [customizations] = await pool.query<(RowDataPacket & {
      id: number;
      tool_id: string;
      tool_name: string | null;
      app_name: string | null;
      custom_colors: string | null;
      custom_settings: string | null;
    })[]>(
      `SELECT id, tool_id, tool_name, app_name, custom_colors, custom_settings
       FROM user_tool_customizations
       WHERE user_id = ?`,
      [user.id]
    );

    // Get tool tags
    const [tags] = await pool.query<(RowDataPacket & {
      tool_id: string;
      tag_name: string;
    })[]>(
      `SELECT tool_id, tag_name
       FROM tool_tags
       WHERE user_id = ?`,
      [user.id]
    );

    // Get tool remarks
    const [remarks] = await pool.query<(RowDataPacket & {
      id: number;
      tool_id: string;
      remark: string;
      created_at: Date;
    })[]>(
      `SELECT id, tool_id, remark, created_at
       FROM tool_remarks
       WHERE user_id = ?
       ORDER BY created_at DESC`,
      [user.id]
    );

    // Group by tool_id
    const toolsMap = new Map<string, {
      toolId: string;
      toolName: string | null;
      appName: string | null;
      customColors: Record<string, unknown> | null;
      customSettings: Record<string, unknown> | null;
      tags: string[];
      remarks: Array<{ id: number; remark: string; createdAt: string }>;
    }>();

    customizations.forEach((row) => {
      toolsMap.set(row.tool_id, {
        toolId: row.tool_id,
        toolName: row.tool_name,
        appName: row.app_name,
        customColors: row.custom_colors ? JSON.parse(row.custom_colors) : null,
        customSettings: row.custom_settings ? JSON.parse(row.custom_settings) : null,
        tags: [],
        remarks: [],
      });
    });

    tags.forEach((row) => {
      if (!toolsMap.has(row.tool_id)) {
        toolsMap.set(row.tool_id, {
          toolId: row.tool_id,
          toolName: null,
          appName: null,
          customColors: null,
          customSettings: null,
          tags: [],
          remarks: [],
        });
      }
      toolsMap.get(row.tool_id)!.tags.push(row.tag_name);
    });

    remarks.forEach((row) => {
      if (!toolsMap.has(row.tool_id)) {
        toolsMap.set(row.tool_id, {
          toolId: row.tool_id,
          toolName: null,
          appName: null,
          customColors: null,
          customSettings: null,
          tags: [],
          remarks: [],
        });
      }
      toolsMap.get(row.tool_id)!.remarks.push({
        id: row.id,
        remark: row.remark,
        createdAt: row.created_at.toISOString(),
      });
    });

    const tools = Array.from(toolsMap.values());

    return NextResponse.json({ tools });
  } catch (error) {
    if (error instanceof Error && "status" in error) {
      const httpError = error as { status: number; message: string };
      return NextResponse.json({ error: httpError.message }, { status: httpError.status });
    }

    console.error("Get tools error:", error);
    return NextResponse.json({ error: "Unable to fetch tools" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await requireSessionUserFromRequest(request);
    const body = await request.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const { toolId, toolName, appName, customColors, customSettings } = z.object({
      toolId: z.string(),
      toolName: z.string().nullable().optional(),
      appName: z.string().nullable().optional(),
      customColors: z.record(z.unknown()).nullable().optional(),
      customSettings: z.record(z.unknown()).nullable().optional(),
    }).parse(body);

    const pool = getDbPool();

    // Upsert tool customization
    await pool.query<ResultSetHeader>(
      `INSERT INTO user_tool_customizations (user_id, tool_id, tool_name, app_name, custom_colors, custom_settings)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         tool_name = COALESCE(VALUES(tool_name), tool_name),
         app_name = COALESCE(VALUES(app_name), app_name),
         custom_colors = COALESCE(VALUES(custom_colors), custom_colors),
         custom_settings = COALESCE(VALUES(custom_settings), custom_settings),
         updated_at = CURRENT_TIMESTAMP`,
      [
        user.id,
        toolId,
        toolName ?? null,
        appName ?? null,
        customColors ? JSON.stringify(customColors) : null,
        customSettings ? JSON.stringify(customSettings) : null,
      ]
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

    console.error("Update tool error:", error);
    return NextResponse.json({ error: "Unable to update tool" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireSessionUserFromRequest(request);
    const body = await request.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const { toolId, remark, tags } = z.object({
      toolId: z.string(),
      remark: z.string().optional(),
      tags: z.array(z.string()).optional(),
    }).parse(body);

    const pool = getDbPool();

    if (remark) {
      await pool.query<ResultSetHeader>(
        `INSERT INTO tool_remarks (user_id, tool_id, remark) VALUES (?, ?, ?)`,
        [user.id, toolId, remark]
      );
    }

    if (tags && tags.length > 0) {
      // Delete existing tags for this tool
      await pool.query<ResultSetHeader>(
        `DELETE FROM tool_tags WHERE user_id = ? AND tool_id = ?`,
        [user.id, toolId]
      );

      // Insert new tags
      const tagValues = tags.map((tag) => [user.id, toolId, tag]).flat();
      const placeholders = tags.map(() => "(?, ?, ?)").join(", ");
      await pool.query<ResultSetHeader>(
        `INSERT INTO tool_tags (user_id, tool_id, tag_name) VALUES ${placeholders}`,
        tagValues
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

    console.error("Add tool remark/tag error:", error);
    return NextResponse.json({ error: "Unable to add remark/tag" }, { status: 500 });
  }
}

