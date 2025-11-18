import { NextResponse, type NextRequest } from "next/server";
import { requireSessionUserFromRequest } from "@/lib/auth/guards";
import { getDbPool } from "@/lib/db";
import { type RowDataPacket } from "mysql2/promise";

export async function GET(request: NextRequest) {
  try {
    const user = await requireSessionUserFromRequest(request);
    if (user.role !== "admin" && user.role !== "dev") {
      return NextResponse.json({ error: "Admin required" }, { status: 403 });
    }

    const url = new URL(request.url);
    const query = (url.searchParams.get("query") || "").trim();
    const role = url.searchParams.get("role") || "all";
    const status = url.searchParams.get("status") || "all";
    const page = parseInt(url.searchParams.get("page") || "1", 10);
    const pageSize = Math.min(parseInt(url.searchParams.get("pageSize") || "50", 10), 200);
    const offset = (page - 1) * pageSize;

    const pool = getDbPool();

    const where: string[] = [];
    const params: (string | number)[] = [];

    if (query) {
      where.push("(email LIKE ? OR display_name LIKE ?)");
      params.push(`%${query}%`, `%${query}%`);
    }
    if (role !== "all") {
      where.push("role = ?");
      params.push(role);
    }
    if (status === "verified") {
      where.push("email_verified = 1");
    } else if (status === "unverified") {
      where.push("email_verified = 0");
    } else if (status === "confirmed") {
      where.push("admin_confirmed = 1");
    } else if (status === "pending") {
      where.push("admin_confirmed = 0");
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const [rows] = await pool.query<(RowDataPacket & {
      id: number;
      email: string;
      display_name: string | null;
      role: string;
      email_verified: number;
      admin_confirmed: number;
      created_at: Date;
      last_login_at: Date | null;
    })[]>(
      `SELECT id, email, display_name, role, email_verified, admin_confirmed, created_at, last_login_at
       FROM users
       ${whereSql}
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );

    const users = rows.map((r) => ({
      id: r.id,
      email: r.email,
      displayName: r.display_name,
      role: r.role,
      emailVerified: Boolean(r.email_verified),
      adminConfirmed: Boolean(r.admin_confirmed),
      createdAt: r.created_at.toISOString(),
      lastLoginAt: r.last_login_at ? r.last_login_at.toISOString() : null,
    }));

    return NextResponse.json({ users, page, pageSize });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireSessionUserFromRequest(request);
    if (user.role !== "admin" && user.role !== "dev") {
      return NextResponse.json({ error: "Admin required" }, { status: 403 });
    }
    const pool = getDbPool();
    const body = await request.json();
    const { action, userIds } = body as { action: string; userIds: number[] };

    if (!Array.isArray(userIds) || userIds.length === 0) {
      return NextResponse.json({ error: "userIds required" }, { status: 400 });
    }

    if (action === "confirm") {
      await pool.query(`UPDATE users SET admin_confirmed = 1 WHERE id IN (${userIds.map(() => "?").join(",")})`, userIds);
    } else if (action === "unconfirm") {
      await pool.query(`UPDATE users SET admin_confirmed = 0 WHERE id IN (${userIds.map(() => "?").join(",")})`, userIds);
    } else if (action === "verify") {
      await pool.query(`UPDATE users SET email_verified = 1 WHERE id IN (${userIds.map(() => "?").join(",")})`, userIds);
    } else if (action === "unverify") {
      await pool.query(`UPDATE users SET email_verified = 0 WHERE id IN (${userIds.map(() => "?").join(",")})`, userIds);
    } else {
      return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}