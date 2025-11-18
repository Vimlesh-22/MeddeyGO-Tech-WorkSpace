import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireAdminFromRequest } from "@/lib/auth/guards";
import { getDbPool } from "@/lib/db";
import type { RowDataPacket } from "mysql2/promise";
import { logActivity } from "@/lib/auth/activity";

const updateLoginSettingsSchema = z.object({
  tool_slug: z.string().min(1),
  use_own_login: z.boolean(),
  login_url: z.string().url().nullable().optional(),
  logout_url: z.string().url().nullable().optional(),
});

export type ApplicationLoginSetting = {
  id: number;
  tool_slug: string;
  tool_name: string;
  use_own_login: boolean;
  login_url: string | null;
  logout_url: string | null;
  created_at: string;
  updated_at: string;
};

export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdminFromRequest(request);
    const pool = getDbPool();

    const [rows] = await pool.query<RowDataPacket[]>(
      "SELECT * FROM application_login_settings ORDER BY tool_name"
    );

    const settings = rows.map((row) => ({
      id: row.id,
      tool_slug: row.tool_slug,
      tool_name: row.tool_name,
      use_own_login: Boolean(row.use_own_login),
      login_url: row.login_url,
      logout_url: row.logout_url,
      created_at: row.created_at,
      updated_at: row.updated_at,
    }));

    await logActivity(admin.id === -1 ? null : admin.id, "admin_fetch_app_login_settings", {
      count: settings.length,
    });

    return NextResponse.json({ settings });
  } catch (error) {
    console.error("Get application login settings error", error);
    return NextResponse.json(
      { error: "Unable to load application login settings" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const admin = await requireAdminFromRequest(request);
    const payload = await request.json().catch(() => null);
    if (!payload) {
      return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
    }

    const data = updateLoginSettingsSchema.parse(payload);
    const pool = getDbPool();

    // Check if setting exists
    const [existing] = await pool.query<RowDataPacket[]>(
      "SELECT id, tool_name FROM application_login_settings WHERE tool_slug = ?",
      [data.tool_slug]
    );

    if (existing.length === 0) {
      // Create new setting
      await pool.query(
        `INSERT INTO application_login_settings (tool_slug, tool_name, use_own_login, login_url, logout_url)
         VALUES (?, ?, ?, ?, ?)`,
        [
          data.tool_slug,
          data.tool_slug.replace(/-/g, " ").replace(/\b\w/g, (l) => l.toUpperCase()),
          data.use_own_login ? 1 : 0,
          data.login_url || null,
          data.logout_url || null,
        ]
      );
    } else {
      // Update existing setting
      await pool.query(
        `UPDATE application_login_settings
         SET use_own_login = ?, login_url = ?, logout_url = ?, updated_at = CURRENT_TIMESTAMP
         WHERE tool_slug = ?`,
        [
          data.use_own_login ? 1 : 0,
          data.login_url || null,
          data.logout_url || null,
          data.tool_slug,
        ]
      );
    }

    await logActivity(admin.id === -1 ? null : admin.id, "admin_update_app_login_settings", {
      tool_slug: data.tool_slug,
      use_own_login: data.use_own_login,
    });

    return NextResponse.json({
      success: true,
      message: `Application login settings updated for ${data.tool_slug}`,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request data" }, { status: 400 });
    }

    console.error("Update application login settings error", error);
    return NextResponse.json(
      { error: "Unable to update application login settings" },
      { status: 500 }
    );
  }
}

