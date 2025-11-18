import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireAdminFromRequest, HttpError } from "@/lib/auth/guards";
import { verifyEmailOTP, isFallbackModeActive } from "@/lib/auth/fallback";

const verifyEmailSchema = z.object({
  email: z.string().email(),
  otp: z.string().length(6),
});

export async function POST(request: NextRequest) {
  try {
    // Require admin authentication
    await requireAdminFromRequest(request);

    // Check if fallback mode is active
    if (!isFallbackModeActive()) {
      throw new HttpError(403, "Fallback mode is not active");
    }

    const body = await request.json().catch(() => null);
    if (!body) {
      throw new HttpError(400, "Invalid payload");
    }

    const { email, otp } = verifyEmailSchema.parse(body);
    const cleanEmail = email.trim().toLowerCase();
    const cleanOTP = otp.trim();

    // Verify email OTP
    const result = verifyEmailOTP(cleanEmail, cleanOTP);

    if (!result.success) {
      throw new HttpError(400, result.message);
    }

    return NextResponse.json({
      ok: true,
      message: result.message,
    });
  } catch (error) {
    if (error instanceof HttpError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    console.error("Verify email OTP error:", error);
    return NextResponse.json({ error: "Unable to verify email" }, { status: 500 });
  }
}
