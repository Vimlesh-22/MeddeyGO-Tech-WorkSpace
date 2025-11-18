import { NextResponse, type NextRequest } from "next/server";
import { requireAdminFromRequest, HttpError } from "@/lib/auth/guards";
import { getPendingUsers, isFallbackModeActive } from "@/lib/auth/fallback";

export async function GET(request: NextRequest) {
  try {
    // Require admin authentication
    await requireAdminFromRequest(request);

    // Check if fallback mode is active
    if (!isFallbackModeActive()) {
      return NextResponse.json({
        ok: true,
        fallbackMode: false,
        users: [],
        message: "Fallback mode is not active",
      });
    }

    const pendingUsers = getPendingUsers();

    return NextResponse.json({
      ok: true,
      fallbackMode: true,
      users: pendingUsers.map(user => ({
        email: user.email,
        displayName: user.displayName,
        role: user.role,
        isEmailVerified: user.isEmailVerified,
        isAdminConfirmed: user.isAdminConfirmed,
        createdAt: new Date(user.createdAt).toISOString(),
      })),
      count: pendingUsers.length,
    });
  } catch (error) {
    if (error instanceof HttpError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error("List pending users error:", error);
    return NextResponse.json({ error: "Unable to list pending users" }, { status: 500 });
  }
}
