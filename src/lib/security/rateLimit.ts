/**
 * Rate limiting system for security
 * In-memory rate limiting (can be upgraded to Redis in production)
 */

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

const rateLimitStore = new Map<string, RateLimitEntry>();

export type RateLimitConfig = {
  maxRequests: number;
  windowMs: number;
  keyPrefix: string;
};

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetAt: number;
};

/**
 * Check rate limit for a given key
 */
export function checkRateLimit(
  key: string,
  config: RateLimitConfig
): RateLimitResult {
  const now = Date.now();
  const fullKey = `${config.keyPrefix}:${key}`;
  const entry = rateLimitStore.get(fullKey);

  // If no entry or window expired, create new entry
  if (!entry || now > entry.resetAt) {
    const resetAt = now + config.windowMs;
    rateLimitStore.set(fullKey, { count: 1, resetAt });
    return {
      allowed: true,
      remaining: config.maxRequests - 1,
      resetAt,
    };
  }

  // Check if limit exceeded
  if (entry.count >= config.maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: entry.resetAt,
    };
  }

  // Increment count
  entry.count++;
  return {
    allowed: true,
    remaining: config.maxRequests - entry.count,
    resetAt: entry.resetAt,
  };
}

/**
 * Clear rate limit for a key (for testing or manual reset)
 */
export function clearRateLimit(key: string, keyPrefix: string): void {
  const fullKey = `${keyPrefix}:${key}`;
  rateLimitStore.delete(fullKey);
}

/**
 * Clean up expired entries (should be called periodically)
 */
export function cleanupExpiredEntries(): void {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (now > entry.resetAt) {
      rateLimitStore.delete(key);
    }
  }
}

// Cleanup expired entries every 5 minutes
if (typeof setInterval !== "undefined") {
  setInterval(cleanupExpiredEntries, 5 * 60 * 1000);
}

// Predefined rate limit configurations
export const RATE_LIMITS = {
  OTP_REQUEST: {
    maxRequests: 3,
    windowMs: 15 * 60 * 1000, // 15 minutes
    keyPrefix: "otp_request",
  },
  OTP_REQUEST_ADMIN_DEV: {
    maxRequests: 20,
    windowMs: 15 * 60 * 1000, // 15 minutes
    keyPrefix: "otp_request_admin_dev",
  },
  LOGIN_ATTEMPT: {
    maxRequests: 5,
    windowMs: 15 * 60 * 1000, // 15 minutes
    keyPrefix: "login_attempt",
  },
  VERIFICATION_ATTEMPT: {
    maxRequests: 5,
    windowMs: 15 * 60 * 1000, // 15 minutes
    keyPrefix: "verification_attempt",
  },
  EMAIL_SEND: {
    maxRequests: 10,
    windowMs: 60 * 60 * 1000, // 1 hour
    keyPrefix: "email_send",
  },
  PASSWORD_VIEW: {
    maxRequests: 10,
    windowMs: 60 * 60 * 1000, // 1 hour
    keyPrefix: "password_view",
  },
  FILE_UPLOAD: {
    maxRequests: 20,
    windowMs: 60 * 60 * 1000, // 1 hour
    keyPrefix: "file_upload",
  },
} as const;

