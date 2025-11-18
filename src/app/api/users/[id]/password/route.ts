import { NextResponse, type NextRequest } from "next/server";
import { requireAdminFromRequest } from "@/lib/auth/guards";
import { getUserById } from "@/lib/auth/users";
import { logActivity } from "@/lib/auth/activity";
import { checkRateLimit, RATE_LIMITS } from "@/lib/security/rateLimit";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireAdminFromRequest(request);
    const { id } = await params;
    const userId = parseInt(id, 10);

    if (isNaN(userId)) {
      return NextResponse.json({ error: "Invalid user ID" }, { status: 400 });
    }

    // SECURITY: Rate limiting for password views
    const rateLimit = checkRateLimit(String(admin.id), RATE_LIMITS.PASSWORD_VIEW);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          error: `Rate limit exceeded. Maximum 10 password views per hour. Try again after ${new Date(rateLimit.resetAt).toLocaleString()}`,
        },
        { status: 429 }
      );
    }

    // Get user from database
    const user = await getUserById(userId);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Log password view access
    await logActivity(admin.id, "password_viewed", {
      targetUserId: userId,
      targetUserEmail: user.email,
      remainingViews: rateLimit.remaining,
    });

    return NextResponse.json({
      password: user.password_plain || null,
      remainingViews: rateLimit.remaining,
    });
  } catch (error) {
    if (error instanceof Error && "status" in error) {
      const httpError = error as { status: number; message: string };
      return NextResponse.json({ error: httpError.message }, { status: httpError.status });
    }

    console.error("Password view error:", error);
    return NextResponse.json({ error: "Unable to retrieve password" }, { status: 500 });
  }
}

