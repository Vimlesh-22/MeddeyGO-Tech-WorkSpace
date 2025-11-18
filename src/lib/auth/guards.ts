import type { NextRequest } from "next/server";
import { getSessionUserFromCookies, getSessionUserFromRequest } from "./session";
import type { SessionUser } from "./types";

export class HttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function requireSessionUserFromRequest(request: NextRequest): Promise<SessionUser> {
  const user = await getSessionUserFromRequest(request);
  if (!user) {
    throw new HttpError(401, "Authentication required");
  }

  return user;
}

export async function requireAdminFromRequest(request: NextRequest): Promise<SessionUser> {
  const user = await requireSessionUserFromRequest(request);
  // Both admin and dev roles have admin privileges
  if (user.role !== "admin" && user.role !== "dev") {
    throw new HttpError(403, "Admin privileges required");
  }

  return user;
}

export async function requireSessionUser(): Promise<SessionUser> {
  const user = await getSessionUserFromCookies();
  if (!user) {
    throw new HttpError(401, "Authentication required");
  }

  return user;
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireSessionUser();
  // Both admin and dev roles have admin privileges
  if (user.role !== "admin" && user.role !== "dev") {
    throw new HttpError(403, "Admin privileges required");
  }

  return user;
}

export async function requireDevFromRequest(request: NextRequest): Promise<SessionUser> {
  const user = await requireSessionUserFromRequest(request);
  if (user.role !== "dev") {
    throw new HttpError(403, "Dev privileges required");
  }

  return user;
}

export async function requireDev(): Promise<SessionUser> {
  const user = await requireSessionUser();
  if (user.role !== "dev") {
    throw new HttpError(403, "Dev privileges required");
  }

  return user;
}