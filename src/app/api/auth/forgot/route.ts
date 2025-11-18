import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getUserByEmail } from "@/lib/auth/users";
import { createVerificationCode } from "@/lib/auth/otp";
import { sendEmail } from "@/lib/email";
import { logActivity } from "@/lib/auth/activity";
import { generateFallbackOTP } from "@/lib/auth/fallback";
import { getBaseUrl } from "@/lib/domain-config";

const schema = z.object({
  email: z.string().email(),
});

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json().catch(() => null);
    if (!payload) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const { email } = schema.parse(payload);
    const normalizedEmail = email.toLowerCase();

    let user;
    let useFallback = false;

    try {
      user = await getUserByEmail(normalizedEmail);
    } catch (dbError) {
      console.warn("Database unavailable for password reset:", dbError);
      useFallback = true;
    }

    // Fallback mode: only support default admin
    if (useFallback) {
      const defaultEmail = process.env.DEFAULT_ADMIN_EMAIL || "";
      if (!defaultEmail || normalizedEmail !== defaultEmail.toLowerCase()) {
        return NextResponse.json({ error: "Password reset only available for default admin in fallback mode" }, { status: 403 });
      }

      const resetCode = generateFallbackOTP(normalizedEmail);
      
      // Get the base URL for password reset link
      const baseUrl = getBaseUrl();
      const resetLink = `${baseUrl}/login?email=${encodeURIComponent(normalizedEmail)}&resetCode=${resetCode}`;
      
      // Try to send email even in fallback mode
      try {
        await sendEmail({
          to: normalizedEmail,
          subject: "Meddey Tech Workspace - Password Reset Request (Fallback Mode)",
          replyTo: process.env.SMTP_FROM,
          text: `Hello,

You requested to reset your password for Meddey Tech Workspace.

Password Reset Code: ${resetCode}

This code expires in 2 minutes (fallback mode).

Quick Reset: Click the link below to reset your password:
${resetLink}

Note: System is running in fallback mode due to database unavailability.

If you didn't request this password reset, please ignore this email.

Best regards,
Meddey Tech Workspace Team`,
          html: `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
    .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
    .code-box { background: white; border: 2px solid #f5576c; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center; }
    .code { font-size: 32px; font-weight: bold; color: #f5576c; letter-spacing: 5px; }
    .button { display: inline-block; background: #f5576c; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; font-weight: bold; }
    .warning-box { background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 15px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🔒 Password Reset Request</h1>
    </div>
    <div class="content">
      <p>Hello <strong>${normalizedEmail}</strong>,</p>
      
      <p>You requested to reset your password for your Meddey Tech Workspace account.</p>
      
      <div class="code-box">
        <p style="margin: 0 0 10px 0; color: #666;">Password Reset Code:</p>
        <div class="code">${resetCode}</div>
        <p style="margin: 10px 0 0 0; color: #666;">Valid for 2 minutes</p>
      </div>
      
      <p style="text-align: center;">
        <a href="${resetLink}" class="button">🔑 Reset Password</a>
      </p>
      
      <div class="warning-box">
        <strong>⚠️ Note:</strong> System is running in fallback mode due to temporary database unavailability.
      </div>
      
      <div class="warning-box" style="background: #f8d7da; border-left-color: #dc3545;">
        <strong>🔐 Security Notice:</strong><br>
        If you didn't request this password reset, please ignore this email. Your password will remain unchanged.
      </div>
    </div>
  </div>
</body>
</html>`,
        });
        
        console.log(`✓ Fallback password reset email sent to ${normalizedEmail}`);
        
        return NextResponse.json({ 
          ok: true,
          fallbackMode: true,
          message: "Reset code sent to your email (fallback mode)"
        });
      } catch (emailError) {
        console.error("Failed to send fallback reset email:", emailError);
        
        // Log to console as last resort
        console.log("\n" + "=".repeat(60));
        console.log("PASSWORD RESET CODE (Fallback Mode)");
        console.log("Email:", normalizedEmail);
        console.log("Reset Code:", resetCode);
        console.log("Reset Link:", resetLink);
        console.log("Valid for 2 minutes");
        console.log("=".repeat(60) + "\n");
        
        return NextResponse.json({ 
          ok: true,
          fallbackMode: true,
          message: "Reset code generated. Check console logs (email failed to send)."
        });
      }
    }

    // Normal database flow
    if (!user || !user.is_active) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    const record = await createVerificationCode(user.id, "password_reset", 30);

    // Get the base URL for password reset link
    const baseUrl = getBaseUrl();
    const resetLink = `${baseUrl}/login?email=${encodeURIComponent(user.email)}&resetCode=${record.code}`;

    try {
      await sendEmail({
        to: user.email,
        subject: "Meddey Tech Workspace - Password Reset Request",
        replyTo: process.env.SMTP_FROM,
        text: `Hello ${user.display_name || user.email},

You requested to reset your password for Meddey Tech Workspace.

Password Reset Code: ${record.code}

This code expires in 30 minutes.

Quick Reset: Click the link below to reset your password:
${resetLink}

Or manually enter the code on the password reset page.

If you didn't request this password reset, please ignore this email and your password will remain unchanged.

Best regards,
Meddey Tech Workspace Team`,
        html: `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
    .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
    .code-box { background: white; border: 2px solid #f5576c; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center; }
    .code { font-size: 32px; font-weight: bold; color: #f5576c; letter-spacing: 5px; }
    .button { display: inline-block; background: #f5576c; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; font-weight: bold; }
    .warning-box { background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 15px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🔒 Password Reset Request</h1>
    </div>
    <div class="content">
      <p>Hello <strong>${user.display_name || user.email}</strong>,</p>
      
      <p>You requested to reset your password for your Meddey Tech Workspace account.</p>
      
      <div class="code-box">
        <p style="margin: 0 0 10px 0; color: #666;">Password Reset Code:</p>
        <div class="code">${record.code}</div>
        <p style="margin: 10px 0 0 0; color: #666;">Valid for 30 minutes</p>
      </div>
      
      <p style="text-align: center;">
        <a href="${resetLink}" class="button">🔑 Reset Password</a>
      </p>
      
      <p style="font-size: 14px; color: #666;">
        Click the "Reset Password" button above to proceed, or manually enter the code on the password reset page.
      </p>
      
      <div class="warning-box">
        <strong>⚠️ Security Notice:</strong><br>
        If you didn't request this password reset, please ignore this email. Your password will remain unchanged.
      </div>
      
      <p style="font-size: 12px; color: #999; margin-top: 30px;">
        This is an automated email. Please do not reply to this message.
      </p>
    </div>
  </div>
</body>
</html>`,
      });
      
      console.log(`✓ Password reset email sent to ${user.email}`);
    } catch (emailError) {
      console.error("Failed to send password reset email:", emailError);
      
      // Log to console as fallback
      console.log("\n" + "=".repeat(60));
      console.log("PASSWORD RESET EMAIL FAILED - Details:");
      console.log("To:", user.email);
      console.log("Reset Code:", record.code);
      console.log("Reset Link:", resetLink);
      console.log("=".repeat(60) + "\n");
      
      return NextResponse.json({ 
        error: "Failed to send password reset email. Please contact administrator." 
      }, { status: 500 });
    }

    await logActivity(user.id, "password_reset_requested");

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    console.error("Forgot password error", error);
    return NextResponse.json({ error: "Unable to send reset code" }, { status: 500 });
  }
}
