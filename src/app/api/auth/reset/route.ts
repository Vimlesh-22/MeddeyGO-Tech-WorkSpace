import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getUserByEmail, updateUser } from "@/lib/auth/users";
import { consumeCode, findActiveCode } from "@/lib/auth/otp";
import { logActivity } from "@/lib/auth/activity";
import { verifyFallbackOTP } from "@/lib/auth/fallback";

const schema = z.object({
  email: z.string().email(),
  code: z.string().length(6),
  password: z.string().min(8),
});

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json().catch(() => null);
    if (!payload) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const { email, code, password } = schema.parse(payload);
    const normalizedEmail = email.toLowerCase();

    let user;
    let useFallback = false;

    try {
      user = await getUserByEmail(normalizedEmail);
    } catch (dbError) {
      console.warn("Database unavailable for password reset:", dbError);
      useFallback = true;
    }

    // Fallback mode: verify OTP for default admin (can't actually update password)
    if (useFallback) {
      const defaultEmail = process.env.DEFAULT_ADMIN_EMAIL || "";
      if (!defaultEmail || normalizedEmail !== defaultEmail.toLowerCase()) {
        return NextResponse.json({ error: "Password reset only available for default admin in fallback mode" }, { status: 403 });
      }

      const isValid = verifyFallbackOTP(normalizedEmail, code);
      if (!isValid) {
        return NextResponse.json({ error: "Invalid or expired reset code" }, { status: 400 });
      }

      console.log("\n" + "=".repeat(60));
      console.log("PASSWORD RESET (Fallback Mode)");
      console.log("Email:", normalizedEmail);
      console.log("Note: Password cannot be changed in fallback mode (database unavailable)");
      console.log("Update DEFAULT_ADMIN_PASSWORD in .env to change password permanently");
      console.log("=".repeat(60) + "\n");

      return NextResponse.json({ 
        ok: true,
        fallbackMode: true,
        message: "Code verified, but password update requires database access. Please update .env manually."
      });
    }

    // Normal database flow
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const record = await findActiveCode(user.id, "password_reset", code);
    if (!record) {
      return NextResponse.json({ error: "Invalid or expired code" }, { status: 400 });
    }

    await updateUser(user.id, { password });
    await consumeCode(record.id);
    await logActivity(user.id, "password_reset_completed");

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    console.error("Password reset error", error);
    return NextResponse.json({ error: "Unable to reset password" }, { status: 500 });
  }
}
