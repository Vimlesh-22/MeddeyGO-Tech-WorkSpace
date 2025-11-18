import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getUserByEmail } from "@/lib/auth/users";
import { createVerificationCode } from "@/lib/auth/otp";
import { sendEmail } from "@/lib/email";
import { logActivity } from "@/lib/auth/activity";
import { generateFallbackOTP } from "@/lib/auth/fallback";
import { getBaseUrl } from "@/lib/domain-config";
import { normalizeEmail } from "@/lib/security/validation";
import { checkRateLimit, RATE_LIMITS } from "@/lib/security/rateLimit";

function extractClientIp(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

const requestSchema = z.object({
  email: z.string().email(),
});

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json().catch(() => null);
    if (!payload) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const { email } = requestSchema.parse(payload);
    // SECURITY: Normalize and validate email server-side
    const normalizedEmail = normalizeEmail(email);

    let user;
    let useFallback = false;

    try {
      user = await getUserByEmail(normalizedEmail);
    } catch (dbError) {
      console.warn("Database unavailable, using fallback OTP:", dbError);
      useFallback = true;
    }

    // SECURITY: Rate limiting - check per email
    // Admin and dev users get higher limits (20 per 15 mins), regular users get 3 per 15 mins
    const isAdminOrDev = user && (user.role === "admin" || user.role === "dev");
    const otpRateLimitConfig = isAdminOrDev ? RATE_LIMITS.OTP_REQUEST_ADMIN_DEV : RATE_LIMITS.OTP_REQUEST;
    const maxRequests = isAdminOrDev ? 20 : 3;
    
    const emailRateLimit = checkRateLimit(normalizedEmail, otpRateLimitConfig);
    if (!emailRateLimit.allowed) {
      return NextResponse.json(
        {
          error: `Rate limit exceeded. Maximum ${maxRequests} OTP requests per 15 minutes. Try again after ${new Date(emailRateLimit.resetAt).toLocaleString()}`,
        },
        { status: 429 }
      );
    }

    // SECURITY: Rate limiting - check per IP
    const clientIp = extractClientIp(request);
    const ipRateLimit = checkRateLimit(clientIp, otpRateLimitConfig);
    if (!ipRateLimit.allowed) {
      return NextResponse.json(
        {
          error: `Rate limit exceeded. Maximum ${maxRequests} OTP requests per 15 minutes per IP. Try again after ${new Date(ipRateLimit.resetAt).toLocaleString()}`,
        },
        { status: 429 }
      );
    }

    // Fallback mode: generate OTP for default admin only
    if (useFallback) {
      const defaultEmail = process.env.DEFAULT_ADMIN_EMAIL || "";
      if (!defaultEmail || normalizedEmail !== defaultEmail.toLowerCase()) {
        return NextResponse.json({ error: "OTP only available for default admin in fallback mode" }, { status: 403 });
      }

      const fallbackCode = generateFallbackOTP(normalizedEmail);
      
      // Get the base URL for the login link
      const baseUrl = getBaseUrl();
      const loginLink = `${baseUrl}/login?email=${encodeURIComponent(normalizedEmail)}&otp=${fallbackCode}`;
      
      // Try to send email even in fallback mode
      // SECURITY: Use normalized email from database validation, never from request
      try {
        await sendEmail({
          to: normalizedEmail, // Already validated and normalized
          subject: "Your MeddeyGo Workspace Login OTP (Fallback Mode)",
          replyTo: process.env.SMTP_FROM,
          text: `Hello,

Your One-Time Password (OTP) for MeddeyGo Workspace Login is: ${fallbackCode}

This OTP will expire in 2 minutes.

Quick Login: Click the link below to login directly:
${loginLink}

Note: System is running in fallback mode due to database unavailability.

If you didn't request this OTP, please ignore this email.

Best regards,
Meddey Tech Workspace Team`,
          html: `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
    .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
    .otp-box { background: white; border: 2px solid #667eea; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center; }
    .otp-code { font-size: 32px; font-weight: bold; color: #667eea; letter-spacing: 5px; }
    .button { display: inline-block; background: #667eea; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; font-weight: bold; }
    .warning { background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 15px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🔐 MeddeyGo Workspace Login</h1>
    </div>
    <div class="content">
      <p>Hello <strong>${normalizedEmail}</strong>,</p>
      
      <p>Your One-Time Password (OTP) for logging into MeddeyGo Workspace is:</p>
      
      <div class="otp-box">
        <div class="otp-code">${fallbackCode}</div>
        <p style="margin: 10px 0 0 0; color: #666;">Valid for 2 minutes</p>
      </div>
      
      <p style="text-align: center;">
        <a href="${loginLink}" class="button">Quick Login</a>
      </p>
      
      <div class="warning">
        <strong>⚠️ Note:</strong> System is running in fallback mode due to temporary database unavailability.
      </div>
      
      <p style="font-size: 12px; color: #999;">
        If you didn't request this OTP, please ignore this email.
      </p>
    </div>
  </div>
</body>
</html>`,
        });
        
        console.log(`✓ Fallback OTP email sent to ${normalizedEmail}`);
        
        return NextResponse.json({ 
          ok: true, 
          fallbackMode: true,
          message: "OTP sent to your email (fallback mode)" 
        });
      } catch (emailError) {
        console.error("Failed to send fallback OTP email:", emailError);
        
        // Log to console as last resort
        console.log("=".repeat(60));
        console.log("FALLBACK MODE - OTP for", normalizedEmail);
        console.log("Your OTP code:", fallbackCode);
        console.log("Login Link:", loginLink);
        console.log("Valid for 2 minutes");
        console.log("=".repeat(60));
        
        return NextResponse.json({ 
          ok: true, 
          fallbackMode: true,
          message: "OTP generated. Check console logs (email failed to send)." 
        });
      }
    }

    // Normal database flow
    if (!user || !user.is_active) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    if (!user.is_email_verified) {
      return NextResponse.json({ error: "Email verification pending" }, { status: 403 });
    }

    if (!user.is_admin_confirmed) {
      return NextResponse.json({ error: "Admin approval pending" }, { status: 403 });
    }

    const record = await createVerificationCode(user.id, "login_otp", 10);

    // Get the base URL for the login link
    const baseUrl = getBaseUrl();
    const loginLink = `${baseUrl}/login?email=${encodeURIComponent(user.email)}&otp=${record.code}`;

    // SECURITY: Always use email from database, never from request
    try {
      await sendEmail({
        to: user.email, // From database, not from request
        subject: "Your MeddeyGo Workspace Login OTP",
        replyTo: process.env.SMTP_FROM,
        text: `Hello ${user.display_name || user.email},

Your One-Time Password (OTP) for MeddeyGo Workspace Login is: ${record.code}

This OTP will expire in 10 minutes.

Quick Login: Click the link below to login directly:
${loginLink}

Or manually enter the OTP on the login page.

If you didn't request this OTP, please ignore this email.

Best regards,
Meddey Tech Workspace Team`,
        html: `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
    .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
    .otp-box { background: white; border: 2px solid #667eea; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center; }
    .otp-code { font-size: 32px; font-weight: bold; color: #667eea; letter-spacing: 5px; }
    .button { display: inline-block; background: #667eea; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; font-weight: bold; }
    .footer { text-align: center; color: #666; font-size: 12px; margin-top: 20px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>MeddeyGo Workspace Login</h1>
    </div>
    <div class="content">
      <p>Hello <strong>${user.display_name || user.email}</strong>,</p>
      
      <p>Your One-Time Password (OTP) for logging into Meddey Tech Workspace is:</p>
      
      <div class="otp-box">
        <div class="otp-code">${record.code}</div>
        <p style="margin: 10px 0 0 0; color: #666;">Valid for 10 minutes</p>
      </div>
      
      <p style="text-align: center;">
        <a href="${loginLink}" class="button">🚀 Quick Login</a>
      </p>
      
      <p style="font-size: 14px; color: #666;">
        Click the "Quick Login" button above to login automatically, or manually enter the OTP on the login page.
      </p>
      
      <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
      
      <p style="font-size: 12px; color: #999;">
        If you didn't request this OTP, please ignore this email. This OTP will expire automatically.
      </p>
    </div>
    <div class="footer">
      <p>© ${new Date().getFullYear()} Meddey Tech Workspace. All rights reserved.</p>
    </div>
  </div>
</body>
</html>`,
      });
      
      console.log(`✓ OTP email sent to ${user.email}`);
    } catch (emailError) {
      console.error("Failed to send OTP email:", emailError);
      
      // Log to console as fallback for debugging
      console.log("\n" + "=".repeat(60));
      console.log("OTP EMAIL FAILED - Details logged below:");
      console.log("To:", user.email);
      console.log("OTP Code:", record.code);
      console.log("Direct Link:", loginLink);
      console.log("=".repeat(60) + "\n");
      
      // Return error to user
      return NextResponse.json({ 
        error: "Failed to send OTP email. Please contact administrator." 
      }, { status: 500 });
    }

    // SECURITY: Comprehensive logging
    const successClientIp = extractClientIp(request);
    await logActivity(user.id, "login_otp_requested", {
      ip: successClientIp,
      userAgent: request.headers.get("user-agent") || "unknown",
      email: normalizedEmail,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      // SECURITY: Log validation error
      const validationClientIp = extractClientIp(request);
      await logActivity(null, "otp_request_validation_error", {
        ip: validationClientIp,
        userAgent: request.headers.get("user-agent") || "unknown",
        errors: error.errors,
      });
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    // SECURITY: Log unexpected errors
    const errorClientIp = extractClientIp(request);
    console.error("[SECURITY] Request login OTP error", {
      error: error instanceof Error ? error.message : String(error),
      ip: errorClientIp,
      path: request.nextUrl.pathname,
    });

    return NextResponse.json({ error: "Unable to send OTP" }, { status: 500 });
  }
}
