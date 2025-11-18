import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getUserByEmail, updateUser } from "@/lib/auth/users";
import { consumeCode, findActiveCode, type VerificationType } from "@/lib/auth/otp";
import { logActivity } from "@/lib/auth/activity";
import { verifyFallbackOTP } from "@/lib/auth/fallback";
import { normalizeEmail } from "@/lib/security/validation";
import { checkRateLimit, RATE_LIMITS } from "@/lib/security/rateLimit";

function extractClientIp(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

const verificationTypes = ["user_verify", "admin_confirm"] as const satisfies VerificationType[];
type VerificationIntent = (typeof verificationTypes)[number];

const verifySchema = z.object({
  email: z.string().email(),
  code: z.string().length(6),
  type: z.enum(verificationTypes),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const { email, code, type } = verifySchema.parse(body);
    // SECURITY: Normalize and validate email server-side
    const normalizedEmail = normalizeEmail(email);

    // SECURITY: Rate limiting for verification attempts
    const emailRateLimit = checkRateLimit(normalizedEmail, RATE_LIMITS.VERIFICATION_ATTEMPT);
    if (!emailRateLimit.allowed) {
      return NextResponse.json(
        {
          error: `Rate limit exceeded. Maximum 5 verification attempts per 15 minutes. Try again after ${new Date(emailRateLimit.resetAt).toLocaleString()}`,
        },
        { status: 429 }
      );
    }

    const clientIp = extractClientIp(request);
    const ipRateLimit = checkRateLimit(clientIp, RATE_LIMITS.VERIFICATION_ATTEMPT);
    if (!ipRateLimit.allowed) {
      return NextResponse.json(
        {
          error: `Rate limit exceeded. Maximum 5 verification attempts per 15 minutes per IP. Try again after ${new Date(ipRateLimit.resetAt).toLocaleString()}`,
        },
        { status: 429 }
      );
    }

    let user;
    let useFallback = false;

    try {
      user = await getUserByEmail(normalizedEmail);
    } catch (dbError) {
      console.warn("Database unavailable for verification, using fallback:", dbError);
      useFallback = true;
    }

    // Fallback mode: only default admin supported
    if (useFallback) {
      const defaultEmail = process.env.DEFAULT_ADMIN_EMAIL || "";
      if (!defaultEmail || normalizedEmail !== defaultEmail.toLowerCase()) {
        return NextResponse.json({ 
          error: "Verification only available for default admin in fallback mode" 
        }, { status: 403 });
      }

      const isValid = verifyFallbackOTP(normalizedEmail, code);
      if (!isValid) {
        return NextResponse.json({ error: "Invalid or expired OTP" }, { status: 400 });
      }

      return NextResponse.json({ 
        ok: true,
        fallbackMode: true,
        message: "Code verified in fallback mode - changes will apply when database is available"
      });
    }

    // Normal database flow
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // SECURITY: Pass IP address for rate limiting
    const verifyClientIp = extractClientIp(request);
    let record;
    try {
      record = await findActiveCode(user.id, type as VerificationIntent, code, verifyClientIp);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Invalid or expired OTP";
      return NextResponse.json({ error: errorMessage }, { status: 400 });
    }

    if (!record) {
      return NextResponse.json({ error: "Invalid or expired OTP" }, { status: 400 });
    }

    await consumeCode(record.id);

    // SECURITY: Comprehensive logging (reuse verifyClientIp from above)
    if (type === "user_verify") {
      await updateUser(user.id, { emailVerified: true });
      await logActivity(user.id, "user_email_verified", {
        ip: verifyClientIp,
        userAgent: request.headers.get("user-agent") || "unknown",
        codeId: record.id,
      });
    } else if (type === "admin_confirm") {
      await updateUser(user.id, { adminConfirmed: true });
      await logActivity(user.id, "admin_confirmed", {
        ip: verifyClientIp,
        userAgent: request.headers.get("user-agent") || "unknown",
        codeId: record.id,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      // SECURITY: Log validation error
      const errorClientIp = extractClientIp(request);
      await logActivity(null, "verify_validation_error", {
        ip: errorClientIp,
        userAgent: request.headers.get("user-agent") || "unknown",
        errors: error.errors,
      });
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    // SECURITY: Log verification failures
    const clientIp = extractClientIp(request);
    console.error("[SECURITY] Verify OTP error", {
      error: error instanceof Error ? error.message : String(error),
      ip: clientIp,
      path: request.nextUrl.pathname,
    });

    return NextResponse.json({ error: "Unable to verify code" }, { status: 500 });
  }
}
