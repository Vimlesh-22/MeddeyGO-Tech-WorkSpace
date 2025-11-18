import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getUserByEmail, markUserLogin } from "@/lib/auth/users";
import { verifyPassword } from "@/lib/auth/password";
import { buildSessionCookie, createSession } from "@/lib/auth/session";
import { logActivity } from "@/lib/auth/activity";
import { consumeCode, findActiveCode } from "@/lib/auth/otp";
import { verifyFallbackCredentials, verifyFallbackOTP } from "@/lib/auth/fallback";
import { signJWT } from "@/lib/jwt";
import { normalizeEmail } from "@/lib/security/validation";
import { checkRateLimit, RATE_LIMITS } from "@/lib/security/rateLimit";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1).optional(),
  otp: z.string().length(6).optional(),
  method: z.enum(["password", "otp"]).default("password"),
});

function extractClientIp(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json().catch(() => null);
    if (!payload) {
      return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
    }

    const { email, password, otp, method } = loginSchema.parse(payload);
    // SECURITY: Normalize and validate email server-side
    const normalizedEmail = normalizeEmail(email);

    // SECURITY: Rate limiting for login attempts per IP
    const clientIp = extractClientIp(request);
    const ipRateLimit = checkRateLimit(clientIp, RATE_LIMITS.LOGIN_ATTEMPT);
    if (!ipRateLimit.allowed) {
      return NextResponse.json(
        {
          error: `Rate limit exceeded. Maximum 5 login attempts per 15 minutes. Try again after ${new Date(ipRateLimit.resetAt).toLocaleString()}`,
        },
        { status: 429 }
      );
    }

    // Try database first
    let user;
    let useFallback = false;
    
    try {
      user = await getUserByEmail(normalizedEmail);
    } catch (dbError) {
      console.warn("Database unavailable, using fallback authentication:", dbError);
      useFallback = true;
    }

    // Fallback mode: only allow default admin with env credentials
    if (useFallback) {
      if (method === "password") {
        if (!password) {
          return NextResponse.json({ error: "Password required" }, { status: 400 });
        }

        const fallbackUser = await verifyFallbackCredentials(normalizedEmail, password);
        if (!fallbackUser) {
          return NextResponse.json({ error: "Invalid credentials or database unavailable" }, { status: 401 });
        }

        // Issue JWT for fallback mode
        const token = await signJWT({
          userId: fallbackUser.id,
          email: fallbackUser.email,
          role: fallbackUser.role,
        }, "7d");

        const response = NextResponse.json({
          user: fallbackUser,
          fallbackMode: true,
          message: "Logged in with fallback mode - database unavailable"
        });

        // Set JWT as cookie for fallback auth
        response.cookies.set({
          name: "project_hub_fallback_token",
          value: token,
          httpOnly: true,
          sameSite: "lax",
          secure: process.env.NODE_ENV === "production",
          path: "/",
          maxAge: 60 * 60 * 24 * 7, // 7 days
        });

        return response;
      } else {
        // OTP fallback
        if (!otp) {
          return NextResponse.json({ error: "OTP required" }, { status: 400 });
        }

        const otpValid = verifyFallbackOTP(normalizedEmail, otp);
        if (!otpValid) {
          return NextResponse.json({ error: "Invalid OTP or only default admin supported in fallback mode" }, { status: 401 });
        }

        const fallbackUser = await verifyFallbackCredentials(normalizedEmail, process.env.DEFAULT_ADMIN_PASSWORD || "");
        if (!fallbackUser) {
          return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
        }

        const token = await signJWT({
          userId: fallbackUser.id,
          email: fallbackUser.email,
          role: fallbackUser.role,
        }, "7d");

        const response = NextResponse.json({
          user: fallbackUser,
          fallbackMode: true,
          message: "Logged in with OTP fallback mode"
        });

        response.cookies.set({
          name: "project_hub_fallback_token",
          value: token,
          httpOnly: true,
          sameSite: "lax",
          secure: process.env.NODE_ENV === "production",
          path: "/",
          maxAge: 60 * 60 * 24 * 7,
        });

        return response;
      }
    }

    // Normal database flow
    if (!user || !user.is_active) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    if (!user.is_admin_confirmed) {
      return NextResponse.json({ error: "Admin confirmation pending" }, { status: 403 });
    }

    if (!user.is_email_verified) {
      return NextResponse.json({ error: "Email verification required" }, { status: 403 });
    }

    if (method === "password") {
      if (!password) {
        return NextResponse.json({ error: "Password required" }, { status: 400 });
      }

      const passwordMatches = await verifyPassword(password, user.password_hash);
      if (!passwordMatches) {
        // SECURITY: Log failed login attempt
        await logActivity(user.id, "login_failed", {
          ip: clientIp,
          userAgent: request.headers.get("user-agent") || "unknown",
          reason: "invalid_password",
        });
        return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
      }
    } else {
      if (!otp) {
        return NextResponse.json({ error: "OTP required" }, { status: 400 });
      }

      // SECURITY: Pass IP for rate limiting
      let record;
      try {
        record = await findActiveCode(user.id, "login_otp", otp, clientIp);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Invalid or expired OTP";
        return NextResponse.json({ error: errorMessage }, { status: 401 });
      }

      if (!record) {
        // SECURITY: Log failed OTP login attempt
        await logActivity(user.id, "login_otp_failed", {
          ip: clientIp,
          userAgent: request.headers.get("user-agent") || "unknown",
          reason: "invalid_or_expired_otp",
        });
        return NextResponse.json({ error: "Invalid or expired OTP" }, { status: 401 });
      }

      await consumeCode(record.id);
      await logActivity(user.id, "login_otp_consumed", { codeId: record.id });
    }

    const { sessionId, expiresAt } = await createSession(user.id);
    await markUserLogin(user.id);
    
    // SECURITY: Comprehensive logging (reuse clientIp from rate limiting above)
    await logActivity(user.id, method === "otp" ? "login_otp" : "login", {
      ip: clientIp,
      userAgent: request.headers.get("user-agent") || "unknown",
      method,
      success: true,
    });

    const response = NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        displayName: user.display_name,
        passwordPlain: user.password_plain,
        emailVerified: Boolean(user.is_email_verified),
        adminConfirmed: Boolean(user.is_admin_confirmed),
      },
    });

    response.cookies.set(buildSessionCookie(sessionId, expiresAt));
    return response;
  } catch (error) {
    if (error instanceof z.ZodError) {
      // SECURITY: Log validation error
      const validationClientIp = extractClientIp(request);
      await logActivity(null, "login_validation_error", {
        ip: validationClientIp,
        userAgent: request.headers.get("user-agent") || "unknown",
        errors: error.errors,
      });
      return NextResponse.json({ error: "Invalid credentials" }, { status: 400 });
    }

    // SECURITY: Log unexpected errors
    const errorClientIp = extractClientIp(request);
    console.error("[SECURITY] Login error", {
      error: error instanceof Error ? error.message : String(error),
      ip: errorClientIp,
      path: request.nextUrl.pathname,
    });

    return NextResponse.json({ error: "Unable to login" }, { status: 500 });
  }
}
