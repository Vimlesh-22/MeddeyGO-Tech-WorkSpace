import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireAdminFromRequest, HttpError } from "@/lib/auth/guards";
import { getUserByEmail } from "@/lib/auth/users";
import { verifyPassword } from "@/lib/auth/password";
import { logActivity } from "@/lib/auth/activity";

const verifySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(request: NextRequest) {
  // Add timeout wrapper to prevent hanging
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error("Request timeout")), 10000); // 10 second timeout
  });

  try {
    // Parse body first before requiring admin (to avoid hanging on invalid payload)
    let body;
    try {
      body = await Promise.race([
        request.json(),
        timeoutPromise
      ]) as unknown;
    } catch (parseError: unknown) {
      if (parseError instanceof Error && parseError.message === "Request timeout") {
        return NextResponse.json({ error: "Request timeout - please try again" }, { status: 408 });
      }
      return NextResponse.json({ error: "Invalid payload - JSON parse error" }, { status: 400 });
    }
    
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    // Validate payload structure
    try {
      verifySchema.parse(body);
    } catch (zodError) {
      if (zodError instanceof z.ZodError) {
        return NextResponse.json({ 
          error: "Invalid payload", 
          details: zodError.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')
        }, { status: 400 });
      }
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const { email, password } = body;
    
    // Now require admin authentication with timeout
    let admin;
    try {
      admin = await Promise.race([
        requireAdminFromRequest(request),
        timeoutPromise
      ]) as unknown;
    } catch (authError: unknown) {
      if (authError instanceof Error && authError.message === "Request timeout") {
        return NextResponse.json({ error: "Authentication timeout - please try again" }, { status: 408 });
      }
      throw authError;
    }
    if (email.toLowerCase() !== admin.email.toLowerCase()) {
      throw new HttpError(403, "Admin identity mismatch");
    }

    // Try database first, fallback to env if unavailable (with timeout)
    let record;
    let useFallback = false;

    try {
      record = await Promise.race([
        getUserByEmail(admin.email),
        timeoutPromise
      ]) as unknown;
    } catch (dbError: unknown) {
      if (dbError instanceof Error && dbError.message === "Request timeout") {
        console.warn("Database query timeout for admin verify, using fallback");
        useFallback = true;
      } else {
        console.warn("Database unavailable for admin verify, using fallback:", dbError instanceof Error ? dbError.message : String(dbError));
        useFallback = true;
      }
    }

    // Fallback mode: verify against env credentials
    if (useFallback) {
      const defaultEmail = process.env.DEFAULT_ADMIN_EMAIL || "";
      const defaultPassword = process.env.DEFAULT_ADMIN_PASSWORD || "";

      if (!defaultEmail || !defaultPassword) {
        throw new HttpError(500, "Admin verification unavailable - database down and no fallback configured");
      }

      if (admin.email.toLowerCase() !== defaultEmail.toLowerCase()) {
        throw new HttpError(403, "Only default admin supported in fallback mode");
      }

      if (password !== defaultPassword) {
        throw new HttpError(401, "Incorrect password");
      }

      return NextResponse.json({ 
        ok: true,
        fallbackMode: true,
        message: "Verified using fallback credentials"
      });
    }

    // Normal database flow
    if (!record) {
      throw new HttpError(404, "Admin record not found");
    }

    const valid = await Promise.race([
      verifyPassword(password, record.password_hash),
      timeoutPromise
    ]) as unknown;
    
    if (!valid) {
      throw new HttpError(401, "Incorrect password");
    }

    // Log activity with the real user ID from database (with timeout, but don't fail if it times out)
    try {
      await Promise.race([
        logActivity(record.id, "admin_console_unlocked"),
        timeoutPromise
      ]);
    } catch (logError: unknown) {
      // Don't fail verification if logging fails
      console.warn("Failed to log admin console unlock:", logError instanceof Error ? logError.message : String(logError));
    }
    
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof HttpError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    console.error("Admin verify error", error);
    return NextResponse.json({ error: "Unable to verify admin" }, { status: 500 });
  }
}
