import { randomInt } from "crypto";
import { type ResultSetHeader, type RowDataPacket } from "mysql2/promise";
import { getDbPool } from "@/lib/db";
import { checkRateLimit, RATE_LIMITS } from "@/lib/security/rateLimit";

export type VerificationType =
  | "admin_confirm"
  | "user_verify"
  | "login_otp"
  | "password_reset";

type VerificationRow = RowDataPacket & {
  id: number;
  user_id: number;
  code: string;
  code_type: VerificationType;
  metadata: string | null;
  expires_at: Date;
  used_at: Date | null;
  attempt_count: number;
  last_attempt_at: Date | null;
  locked_until: Date | null;
};

export type VerificationRecord = {
  id: number;
  userId: number;
  code: string;
  type: VerificationType;
  metadata: Record<string, unknown> | null;
  expiresAt: Date;
  consumedAt: Date | null;
  attemptCount: number;
  lastAttemptAt: Date | null;
  lockedUntil: Date | null;
};

function mapRow(row: VerificationRow): VerificationRecord {
  return {
    id: row.id,
    userId: row.user_id,
    code: row.code,
    type: row.code_type,
    metadata: row.metadata ? (JSON.parse(row.metadata) as Record<string, unknown>) : null,
    expiresAt: row.expires_at,
    consumedAt: row.used_at,
    attemptCount: row.attempt_count || 0,
    lastAttemptAt: row.last_attempt_at || null,
    lockedUntil: row.locked_until || null,
  };
}

/**
 * Generate cryptographically secure OTP code
 * Uses crypto.randomInt for secure random number generation
 */
export function generateOtpCode(): string {
  // Generate 6-digit code using cryptographically secure random number
  return String(randomInt(100000, 999999));
}

export async function createVerificationCode(
  userId: number,
  type: VerificationType,
  ttlMinutes: number,
  metadata?: Record<string, unknown>,
): Promise<VerificationRecord> {
  const pool = getDbPool();
  const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);
  const code = generateOtpCode();
  const payload = metadata ? JSON.stringify(metadata) : null;

  const [result] = await pool.query<ResultSetHeader>(
    `INSERT INTO verification_codes (user_id, code, code_type, metadata, expires_at)
     VALUES (?, ?, ?, ?, ?)`,
    [userId, code, type, payload, expiresAt],
  );

  return {
    id: result.insertId,
    userId,
    code,
    type,
    metadata: metadata ?? null,
    expiresAt,
    consumedAt: null,
  };
}

const MAX_OTP_ATTEMPTS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000; // 15 minutes

export async function findActiveCode(
  userId: number,
  type: VerificationType,
  code: string,
  ipAddress?: string
) {
  const pool = getDbPool();
  
  // Check rate limiting per user ID
  const userRateLimit = checkRateLimit(String(userId), RATE_LIMITS.VERIFICATION_ATTEMPT);
  if (!userRateLimit.allowed) {
    throw new Error(`Rate limit exceeded. Try again after ${new Date(userRateLimit.resetAt).toLocaleString()}`);
  }

  // Check rate limiting per IP if provided
  if (ipAddress) {
    const ipRateLimit = checkRateLimit(ipAddress, RATE_LIMITS.VERIFICATION_ATTEMPT);
    if (!ipRateLimit.allowed) {
      throw new Error(`Rate limit exceeded. Try again after ${new Date(ipRateLimit.resetAt).toLocaleString()}`);
    }
  }

  const [rows] = await pool.query<VerificationRow[]>(
    `SELECT * FROM verification_codes
     WHERE user_id = ? AND code_type = ? AND code = ? AND used_at IS NULL AND expires_at > NOW()
     AND (locked_until IS NULL OR locked_until <= NOW())
     ORDER BY created_at DESC LIMIT 1`,
    [userId, type, code],
  );

  if (!rows.length) {
    // Increment attempt count for failed verification
    await incrementAttemptCount(userId, type, code);
    return null;
  }

  const record = mapRow(rows[0]);

  // Check if code is locked
  if (record.lockedUntil && new Date(record.lockedUntil) > new Date()) {
    throw new Error(`Code is locked. Try again after ${new Date(record.lockedUntil).toLocaleString()}`);
  }

  // Check attempt count
  if (record.attemptCount >= MAX_OTP_ATTEMPTS) {
    // Lock the code
    const lockUntil = new Date(Date.now() + LOCK_DURATION_MS);
    await pool.query<ResultSetHeader>(
      `UPDATE verification_codes SET locked_until = ? WHERE id = ?`,
      [lockUntil, record.id]
    );
    throw new Error(`Maximum attempts exceeded. Code locked for 15 minutes.`);
  }

  return record;
}

/**
 * Increment attempt count for a verification code
 */
async function incrementAttemptCount(
  userId: number,
  type: VerificationType,
  code: string
): Promise<void> {
  const pool = getDbPool();
  await pool.query<ResultSetHeader>(
    `UPDATE verification_codes 
     SET attempt_count = attempt_count + 1, last_attempt_at = NOW()
     WHERE user_id = ? AND code_type = ? AND code = ? AND used_at IS NULL AND expires_at > NOW()
     ORDER BY created_at DESC LIMIT 1`,
    [userId, type, code]
  );
}

export async function consumeCode(id: number): Promise<void> {
  const pool = getDbPool();
  await pool.query<ResultSetHeader>(
    `UPDATE verification_codes SET used_at = NOW() WHERE id = ?`,
    [id],
  );
}

export async function purgeExpiredCodes(): Promise<void> {
  const pool = getDbPool();
  await pool.query<ResultSetHeader>(
    `DELETE FROM verification_codes WHERE expires_at <= NOW() OR used_at IS NOT NULL AND used_at < DATE_SUB(NOW(), INTERVAL 14 DAY)`,
  );
}
