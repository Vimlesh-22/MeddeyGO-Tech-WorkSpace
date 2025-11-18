import { randomUUID } from "crypto";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { type ResultSetHeader, type RowDataPacket } from "mysql2/promise";
import { getDbPool } from "@/lib/db";
import type { SessionUser, UserRole } from "./types";
import { verifyJWT } from "@/lib/jwt";

export const SESSION_COOKIE_NAME = "project_hub_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

type SessionRow = RowDataPacket & {
  id: string;
  user_id: number;
  expires_at: Date;
  email: string;
  role: UserRole;
  display_name: string | null;
  password_plain: string | null;
  is_email_verified: number;
  is_admin_confirmed: number;
};

function mapSession(row: SessionRow): SessionUser {
  return {
    id: row.user_id,
    email: row.email,
    role: row.role,
    displayName: row.display_name,
    passwordPlain: row.password_plain,
    emailVerified: Boolean(row.is_email_verified),
    adminConfirmed: Boolean(row.is_admin_confirmed),
  };
}

export async function createSession(userId: number) {
  const pool = getDbPool();
  const sessionId = randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);

  await pool.query<ResultSetHeader>(
    `INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)`,
    [sessionId, userId, expiresAt],
  );

  return { sessionId, expiresAt };
}

export async function deleteSession(sessionId: string): Promise<void> {
  const pool = getDbPool();
  await pool.query<ResultSetHeader>(`DELETE FROM sessions WHERE id = ?`, [sessionId]);
}

export async function getSessionById(sessionId: string): Promise<{ sessionId: string; user: SessionUser } | null> {
  try {
    const pool = getDbPool();
    const [rows] = await pool.query<SessionRow[]>(
    `SELECT s.id, s.user_id, s.expires_at, u.email, u.role, u.display_name, u.password_plain, u.is_email_verified, u.is_admin_confirmed
       FROM sessions s
       INNER JOIN users u ON u.id = s.user_id
       WHERE s.id = ?
       LIMIT 1`,
      [sessionId],
    );

    if (!rows.length) {
      return null;
    }

    const row = rows[0];
    if (row.expires_at.getTime() <= Date.now()) {
      await deleteSession(sessionId);
      return null;
    }

    return {
      sessionId: row.id,
      user: mapSession(row),
    };
  } catch (error) {
    console.error("Session lookup failed:", error);
    return null;
  }
}

export async function getSessionUserFromRequest(request: NextRequest): Promise<SessionUser | null> {
  // Try fallback JWT token first
  const fallbackToken = request.cookies.get("project_hub_fallback_token")?.value;
  if (fallbackToken) {
    const payload = await verifyJWT(fallbackToken);
    if (payload) {
      return {
        id: payload.userId,
        email: payload.email,
        role: payload.role as UserRole,
        displayName: "Admin (Fallback Mode)",
        passwordPlain: process.env.DEFAULT_ADMIN_PASSWORD || null,
        emailVerified: true,
        adminConfirmed: true,
      };
    }
  }

  // Try normal session cookie
  const sessionId = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!sessionId) {
    return null;
  }

  const session = await getSessionById(sessionId);
  return session?.user ?? null;
}

export async function getSessionUserFromCookies(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  
  // Try fallback JWT token first
  const fallbackToken = cookieStore.get("project_hub_fallback_token")?.value;
  if (fallbackToken) {
    const payload = await verifyJWT(fallbackToken);
    if (payload) {
      return {
        id: payload.userId,
        email: payload.email,
        role: payload.role as UserRole,
        displayName: "Admin (Fallback Mode)",
        passwordPlain: process.env.DEFAULT_ADMIN_PASSWORD || null,
        emailVerified: true,
        adminConfirmed: true,
      };
    }
  }

  // Try normal session cookie
  const sessionId = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!sessionId) {
    return null;
  }

  const session = await getSessionById(sessionId);
  return session?.user ?? null;
}

export function buildSessionCookie(sessionId: string, expiresAt: Date) {
  return {
    name: SESSION_COOKIE_NAME,
    value: sessionId,
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  };
}

export function buildExpiredSessionCookie() {
  return {
    name: SESSION_COOKIE_NAME,
    value: "",
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(0),
  };
}
