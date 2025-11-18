import { NextResponse, type NextRequest } from "next/server";
import { requireAdminFromRequest, HttpError } from "@/lib/auth/guards";
import { 
  getPendingUsers, 
  clearPendingUsers, 
  disableFallbackMode,
  isFallbackModeActive 
} from "@/lib/auth/fallback";
import { createUser } from "@/lib/auth/users";
import { getDbPool } from "@/lib/db";

export async function POST(request: NextRequest) {
  try {
    // Require admin authentication
    await requireAdminFromRequest(request);

    // Check if fallback mode is active
    if (!isFallbackModeActive()) {
      return NextResponse.json({
        ok: true,
        message: "Fallback mode is already disabled",
        syncedCount: 0,
      });
    }

    const pendingUsers = getPendingUsers();

    if (pendingUsers.length === 0) {
      return NextResponse.json({
        ok: true,
        message: "No pending users to sync",
        syncedCount: 0,
      });
    }

    // Check database connection
    let dbAvailable = false;
    try {
      const pool = getDbPool();
      await pool.query("SELECT 1");
      dbAvailable = true;
    } catch (dbError) {
      console.error("Database not available for sync:", dbError);
      throw new HttpError(503, "Database connection not available yet");
    }

    if (!dbAvailable) {
      throw new HttpError(503, "Database not available");
    }

    // Sync all verified and confirmed users to database
    const results = {
      synced: [] as string[],
      skipped: [] as string[],
      errors: [] as { email: string; error: string }[],
    };

    for (const user of pendingUsers) {
      // Only sync users that are fully verified and confirmed
      if (!user.isEmailVerified || !user.isAdminConfirmed) {
        results.skipped.push(user.email);
        console.log(`⊘ Skipped ${user.email} - not fully verified/confirmed`);
        continue;
      }

      try {
        await createUser({
          email: user.email,
          password: user.password,
          displayName: user.displayName,
          role: user.role,
          isActive: true,
        });

        // Update email verification and admin confirmation in database
        const pool = getDbPool();
        await pool.query(
          `UPDATE users SET is_email_verified = 1, is_admin_confirmed = 1 WHERE email = ?`,
          [user.email]
        );

        results.synced.push(user.email);
        console.log(`✓ Synced ${user.email} to database`);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : "Unknown error";
        results.errors.push({ email: user.email, error: errorMsg });
        console.error(`✗ Failed to sync ${user.email}:`, error);
      }
    }

    // Clear pending users and disable fallback mode
    clearPendingUsers();
    disableFallbackMode();

    return NextResponse.json({
      ok: true,
      message: "Fallback data synced successfully",
      syncedCount: results.synced.length,
      skippedCount: results.skipped.length,
      errorCount: results.errors.length,
      details: results,
    });
  } catch (error) {
    if (error instanceof HttpError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error("Sync fallback data error:", error);
    return NextResponse.json({ error: "Unable to sync fallback data" }, { status: 500 });
  }
}
