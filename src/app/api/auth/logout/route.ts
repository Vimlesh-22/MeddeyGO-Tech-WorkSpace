import { NextResponse, type NextRequest } from "next/server";
import { buildExpiredSessionCookie, deleteSession, getSessionById, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { logActivity } from "@/lib/auth/activity";

export async function POST(request: NextRequest) {
  const sessionId = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const fallbackToken = request.cookies.get("project_hub_fallback_token")?.value;

  if (sessionId) {
    const session = await getSessionById(sessionId);
    await deleteSession(sessionId);

    if (session?.user) {
      await logActivity(session.user.id, "logout");
    }
  }

  const response = NextResponse.json({ success: true });
  response.cookies.set(buildExpiredSessionCookie());
  
  // Clear fallback token if present
  if (fallbackToken) {
    response.cookies.set({
      name: "project_hub_fallback_token",
      value: "",
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      expires: new Date(0),
    });
  }

  return response;
}
