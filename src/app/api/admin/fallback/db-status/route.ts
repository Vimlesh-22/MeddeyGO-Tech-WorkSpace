import { NextResponse, type NextRequest } from "next/server";
import { requireAdminFromRequest, HttpError } from "@/lib/auth/guards";
import { checkDatabaseConnection } from "@/lib/auth/db-checker";
import { isFallbackModeActive } from "@/lib/auth/fallback";

export async function GET(request: NextRequest) {
  try {
    // Require admin authentication
    await requireAdminFromRequest(request);

    const dbAvailable = await checkDatabaseConnection();
    const fallbackActive = isFallbackModeActive();

    return NextResponse.json({
      ok: true,
      database: {
        available: dbAvailable,
        status: dbAvailable ? "connected" : "disconnected",
      },
      fallback: {
        active: fallbackActive,
        status: fallbackActive ? "enabled" : "disabled",
      },
      canSync: dbAvailable && fallbackActive,
      message: dbAvailable && fallbackActive 
        ? "Database is available. You can sync fallback data."
        : dbAvailable 
        ? "Database connected, fallback mode disabled" 
        : "Database unavailable, fallback mode active",
    });
  } catch (error) {
    if (error instanceof HttpError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error("Database status check error:", error);
    return NextResponse.json({ error: "Unable to check database status" }, { status: 500 });
  }
}
