import { SignJWT, jwtVerify } from "jose";

// SECURITY: Require JWT_SECRET from environment, no hardcoded fallback
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error(
    'JWT_SECRET environment variable is required. Please set it in project-hub/.env'
  );
}

const secret = new TextEncoder().encode(JWT_SECRET);

export type JWTPayload = {
  userId: number;
  email: string;
  role: string;
  exp?: number;
};

/**
 * Sign a JWT token with user data
 */
export async function signJWT(payload: Omit<JWTPayload, "exp">, expiresIn: string = "7d"): Promise<string> {
  const token = await new SignJWT(payload as Record<string, unknown>)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(secret);

  return token;
}

/**
 * Verify and decode a JWT token
 */
export async function verifyJWT(token: string): Promise<JWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret);
    return payload as JWTPayload;
  } catch (error) {
    console.error("JWT verification failed:", error);
    return null;
  }
}
