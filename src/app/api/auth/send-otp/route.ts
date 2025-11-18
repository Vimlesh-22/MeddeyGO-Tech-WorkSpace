import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireAdminFromRequest, HttpError } from "@/lib/auth/guards";
import { getUserByEmail } from "@/lib/auth/users";
import { createVerificationCode } from "@/lib/auth/otp";
import { sendEmail } from "@/lib/email";
import { logActivity } from "@/lib/auth/activity";
import { getBaseUrl } from "@/lib/domain-config";
import { normalizeEmail } from "@/lib/security/validation";

const schema = z.object({
  email: z.string().email(),
  type: z.enum(["admin_confirm", "user_verify", "both"]),
});

/**
 * Send OTP codes for user verification
 * Both admin confirmation and user email verification codes
 */
export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdminFromRequest(request);
    const payload = await request.json().catch(() => null);
    if (!payload) {
      throw new HttpError(400, "Invalid payload");
    }

    const { email, type } = schema.parse(payload);
    
    // SECURITY: Normalize and validate email server-side
    const normalizedEmail = normalizeEmail(email);
    
    console.log(`\n📨 Send OTP Request:`);
    console.log(`  User Email: ${normalizedEmail}`);
    console.log(`  Type: ${type}`);
    console.log(`  Requested by: ${admin.email}`);
    
    // SECURITY: Always fetch user from database using normalized email
    const user = await getUserByEmail(normalizedEmail);

    if (!user) {
      console.error(`❌ User not found: ${email}`);
      throw new HttpError(404, "User not found");
    }

    console.log(`✓ User found: ${user.email} (ID: ${user.id})`);

    const baseUrl = getBaseUrl();
    const emailResults: { type: string; promise: Promise<void> }[] = [];

    // Send admin confirmation code
    if (type === "admin_confirm" || type === "both") {
      console.log(`📤 Generating admin confirmation code...`);
      const adminCode = await createVerificationCode(user.id, "admin_confirm", 30, {
        requestedBy: admin.email,
      });

      console.log(`📧 Sending admin confirmation email to: ${admin.email}`);
      
      // SECURITY: Use admin email from session (database), never from request
      emailResults.push({
        type: "admin",
        promise: sendEmail({
          to: admin.email, // From authenticated session, not request
          subject: `Admin Confirmation Code for ${user.email}`,
          text: `Admin Confirmation Code: ${adminCode.code}

This code is for confirming the user account: ${user.email}

User Details:
- Email: ${user.email}
- Display Name: ${user.display_name || "Not set"}
- Role: ${user.role}

This code expires in 30 minutes.

Best regards,
Meddey Tech Workspace`,
          html: `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; background: #f4f4f4; margin: 0; padding: 20px; }
    .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 10px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
    .header { background: linear-gradient(135deg, #ec4899 0%, #f472b6 100%); color: white; padding: 30px; text-align: center; }
    .header h1 { margin: 0; font-size: 24px; }
    .content { padding: 30px; }
    .code-box { background: #fef2f2; border: 2px solid #ec4899; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center; }
    .code { font-size: 32px; font-weight: bold; color: #ec4899; letter-spacing: 3px; }
    .info-box { background: #f0f9ff; border-left: 4px solid #3b82f6; padding: 15px; margin: 15px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🔐 Admin Confirmation Required</h1>
    </div>
    <div class="content">
      <p>Hello Admin,</p>
      
      <p>Here is your confirmation code for user account:</p>
      
      <div class="code-box">
        <p style="margin: 0 0 10px 0; color: #666;">Admin Confirmation Code:</p>
        <div class="code">${adminCode.code}</div>
        <p style="margin: 10px 0 0 0; color: #666;">Valid for 30 minutes</p>
      </div>
      
      <div class="info-box">
        <strong>👤 User Details:</strong><br>
        Email: ${user.email}<br>
        Display Name: ${user.display_name || "Not set"}<br>
        Role: ${user.role}
      </div>
      
      <p style="font-size: 12px; color: #999;">
        Enter this code in the admin panel to approve the user's account.
      </p>
    </div>
  </div>
</body>
</html>`,
        }),
      });

      console.log(`✓ Admin confirmation code created and queued`);
    }

    // Send user verification code
    if (type === "user_verify" || type === "both") {
      console.log(`📤 Generating user verification code...`);
      const userCode = await createVerificationCode(user.id, "user_verify", 30);
      const verifyLink = `${baseUrl}/login?email=${encodeURIComponent(user.email)}&verify=${userCode.code}`;

      console.log(`📧 Sending user verification email to: ${user.email}`);
      
      // SECURITY: Use user email from database, never from request
      emailResults.push({
        type: "user",
        promise: sendEmail({
          to: user.email, // From database, not from request
          subject: "Verify Your Email - Meddey Tech Workspace",
          text: `Hello ${user.display_name || user.email},

Your email verification code: ${userCode.code}

This code expires in 30 minutes.

Quick Verification: Click the link below to verify automatically:
${verifyLink}

Or enter the code on the verification page.

Best regards,
Meddey Tech Workspace Team`,
          html: `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; background: #f4f4f4; margin: 0; padding: 20px; }
    .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 10px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; }
    .header h1 { margin: 0; font-size: 24px; }
    .content { padding: 30px; }
    .code-box { background: #f5f3ff; border: 2px solid #667eea; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center; }
    .code { font-size: 32px; font-weight: bold; color: #667eea; letter-spacing: 3px; }
    .button { display: inline-block; background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>📧 Verify Your Email</h1>
    </div>
    <div class="content">
      <p>Hello <strong>${user.display_name || user.email}</strong>,</p>
      
      <p>Please verify your email address using the code below:</p>
      
      <div class="code-box">
        <p style="margin: 0 0 10px 0; color: #666;">Email Verification Code:</p>
        <div class="code">${userCode.code}</div>
        <p style="margin: 10px 0 0 0; color: #666;">Valid for 30 minutes</p>
      </div>
      
      <p style="text-align: center;">
        <a href="${verifyLink}" class="button">✅ Verify Email Now</a>
      </p>
      
      <p style="font-size: 12px; color: #999;">
        If you didn't request this verification, please ignore this email.
      </p>
    </div>
  </div>
</body>
</html>`,
        }),
      });

      console.log(`✓ User verification code created and queued`);
    }

    // Send all emails
    console.log(`\n📬 Sending ${emailResults.length} email(s)...`);
    
    const sendResults = await Promise.allSettled(
      emailResults.map(item => item.promise)
    );
    
    // Check for failures
    const failures: string[] = [];
    sendResults.forEach((result, index) => {
      if (result.status === "rejected") {
        const emailType = emailResults[index].type;
        console.error(`❌ Failed to send ${emailType} email:`, result.reason);
        failures.push(emailType);
      } else {
        console.log(`✅ ${emailResults[index].type} email sent successfully`);
      }
    });
    
    if (failures.length > 0) {
      throw new Error(`Failed to send emails: ${failures.join(", ")}`);
    }

    console.log(`✅ All emails sent successfully\n`);

    // SECURITY: Comprehensive logging
    const clientIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      "unknown";
    await logActivity(
      admin.id === -1 ? null : admin.id,
      `send_otp_${type}`,
      {
        userEmail: normalizedEmail,
        ip: clientIp,
        userAgent: request.headers.get("user-agent") || "unknown",
        adminEmail: admin.email,
      }
    );

    return NextResponse.json({
      ok: true,
      message: `Verification code(s) sent successfully`,
    });
  } catch (error) {
    // SECURITY: Comprehensive error logging
    const clientIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      "unknown";
    
    console.error("\n[SECURITY] Send OTP Error:");
    console.error("Error Type:", error instanceof Error ? error.constructor.name : typeof error);
    console.error("Error Message:", error instanceof Error ? error.message : String(error));
    console.error("IP:", clientIp);
    console.error("User-Agent:", request.headers.get("user-agent") || "unknown");
    
    if (error instanceof HttpError) {
      await logActivity(null, "send_otp_error", {
        ip: clientIp,
        userAgent: request.headers.get("user-agent") || "unknown",
        status: error.status,
        message: error.message,
      });
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    if (error instanceof z.ZodError) {
      console.error("Validation Error:", error.errors);
      await logActivity(null, "send_otp_validation_error", {
        ip: clientIp,
        userAgent: request.headers.get("user-agent") || "unknown",
        errors: error.errors,
      });
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    console.error("Full Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unable to send verification code";
    await logActivity(null, "send_otp_unexpected_error", {
      ip: clientIp,
      userAgent: request.headers.get("user-agent") || "unknown",
      error: errorMessage,
    });
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
