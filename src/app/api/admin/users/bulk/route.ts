import { NextResponse, type NextRequest } from "next/server";
import { requireSessionUserFromRequest } from "@/lib/auth/guards";
import { getDbPool } from "@/lib/db";

export async function POST(request: NextRequest) {
  try {
    const user = await requireSessionUserFromRequest(request);
    if (user.role !== "admin" && user.role !== "dev") {
      return NextResponse.json({ error: "Admin required" }, { status: 403 });
    }
    const body = await request.json();
    const { action, userIds } = body as { action: string; userIds: number[] };
    if (!Array.isArray(userIds) || userIds.length === 0) {
      return NextResponse.json({ error: "userIds required" }, { status: 400 });
    }
    const pool = getDbPool();
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