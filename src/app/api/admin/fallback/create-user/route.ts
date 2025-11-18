import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireAdminFromRequest, HttpError } from "@/lib/auth/guards";
import { createFallbackUser, isFallbackModeActive } from "@/lib/auth/fallback";
import { validatePasswordStrength, sanitizeInput } from "@/lib/security/encryption";

const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  displayName: z.string().optional(),
  role: z.enum(["user", "admin"]).default("user"),
});

export async function POST(request: NextRequest) {
  try {
    // Require admin authentication
    await requireAdminFromRequest(request);

    // Check if fallback mode is active
    if (!isFallbackModeActive()) {
      throw new HttpError(403, "Fallback mode is not active. Use regular database operations.");
    }

    const body = await request.json().catch(() => null);
    if (!body) {
      throw new HttpError(400, "Invalid payload");
    }

    const { email, password, displayName, role } = createUserSchema.parse(body);

    // Sanitize inputs
    const cleanEmail = sanitizeInput(email.trim().toLowerCase());
    const cleanDisplayName = displayName ? sanitizeInput(displayName.trim()) : null;

    // Validate password strength
    const passwordCheck = validatePasswordStrength(password);
    if (!passwordCheck.isValid) {
      throw new HttpError(400, `Weak password: ${passwordCheck.issues.join(", ")}`);
    }

    // Create user in fallback mode
    const result = await createFallbackUser(cleanEmail, password, cleanDisplayName, role);

    if (!result.success) {
      throw new HttpError(400, result.message);
    }

    return NextResponse.json({
      ok: true,
      message: result.message,
      user: {
        email: cleanEmail,
        displayName: cleanDisplayName,
        role,
      },
    });
  } catch (error) {
    if (error instanceof HttpError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid payload", details: error.errors }, { status: 400 });
    }

    console.error("Fallback create user error:", error);
    return NextResponse.json({ error: "Unable to create user in fallback mode" }, { status: 500 });
  }
}
