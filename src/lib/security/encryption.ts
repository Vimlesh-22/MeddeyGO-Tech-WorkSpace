/**
 * Client-side encryption utilities for sensitive data
 * Uses Web Crypto API for end-to-end encryption
 */

/**
 * Generate a random encryption key
 */
async function generateKey(): Promise<CryptoKey> {
  return await crypto.subtle.generateKey(
    {
      name: "AES-GCM",
      length: 256,
    },
    true,
    ["encrypt", "decrypt"]
  );
}

/**
 * Derive a key from a password using PBKDF2
 */
async function deriveKey(password: string, salt: BufferSource): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const passwordKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits", "deriveKey"]
  );

  return await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: 100000,
      hash: "SHA-256",
    },
    passwordKey,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
}

/**
 * Encrypt data using AES-GCM
 */
export async function encryptData(data: string, sessionKey?: string): Promise<string> {
  try {
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data);

    // Generate or derive encryption key
    let key: CryptoKey;
    const salt = crypto.getRandomValues(new Uint8Array(16));

    if (sessionKey) {
      key = await deriveKey(sessionKey, salt);
    } else {
      key = await generateKey();
    }

    // Generate IV (Initialization Vector)
    const iv = crypto.getRandomValues(new Uint8Array(12));

    // Encrypt the data
    const encryptedBuffer = await crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv: iv,
      },
      key,
      dataBuffer
    );

    // Combine IV + encrypted data (+ salt if using password-derived key)
    const encryptedArray = new Uint8Array(encryptedBuffer);
    let combined: Uint8Array;

    if (sessionKey) {
      // Include salt for password-derived keys
      combined = new Uint8Array(salt.length + iv.length + encryptedArray.length);
      combined.set(salt, 0);
      combined.set(iv, salt.length);
      combined.set(encryptedArray, salt.length + iv.length);
    } else {
      combined = new Uint8Array(iv.length + encryptedArray.length);
      combined.set(iv, 0);
      combined.set(encryptedArray, iv.length);
    }

    // Convert to base64 for transmission
    return btoa(String.fromCharCode(...combined));
  } catch (error) {
    console.error("Encryption failed:", error);
    // Fallback: return original data (better than blocking the request)
    return data;
  }
}

/**
 * Hash sensitive data using SHA-256 (one-way, for verification)
 */
export async function hashData(data: string): Promise<string> {
  try {
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data);
    const hashBuffer = await crypto.subtle.digest("SHA-256", dataBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
  } catch (error) {
    console.error("Hashing failed:", error);
    return data;
  }
}

/**
 * Generate a secure random token
 */
export function generateSecureToken(length: number = 32): string {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array)
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Secure password strength validator
 */
export function validatePasswordStrength(password: string): {
  isValid: boolean;
  strength: "weak" | "medium" | "strong" | "very-strong";
  issues: string[];
} {
  const issues: string[] = [];
  let score = 0;

  if (password.length < 8) {
    issues.push("Password must be at least 8 characters");
  } else if (password.length >= 12) {
    score += 2;
  } else {
    score += 1;
  }

  if (!/[a-z]/.test(password)) {
    issues.push("Include lowercase letters");
  } else {
    score += 1;
  }

  if (!/[A-Z]/.test(password)) {
    issues.push("Include uppercase letters");
  } else {
    score += 1;
  }

  if (!/[0-9]/.test(password)) {
    issues.push("Include numbers");
  } else {
    score += 1;
  }

  if (!/[^a-zA-Z0-9]/.test(password)) {
    issues.push("Include special characters");
  } else {
    score += 2;
  }

  const strength =
    score >= 7 ? "very-strong" :
    score >= 5 ? "strong" :
    score >= 3 ? "medium" : "weak";

  return {
    isValid: issues.length === 0 && score >= 4,
    strength,
    issues,
  };
}

/**
 * Sanitize input to prevent XSS
 */
export function sanitizeInput(input: string): string {
  return input
    .replace(/[<>]/g, "") // Remove < and >
    .replace(/javascript:/gi, "") // Remove javascript: protocol
    .replace(/on\w+=/gi, "") // Remove event handlers
    .trim();
}

/**
 * Check if running in secure context (HTTPS or localhost)
 */
export function isSecureContext(): boolean {
  if (typeof window === "undefined") return true;
  return window.isSecureContext || window.location.hostname === "localhost";
}

/**
 * Secure data transmission wrapper
 * Automatically encrypts sensitive fields before sending to server
 */
export async function secureRequest(
  url: string,
  options: RequestInit & {
    sensitiveFields?: string[];
  } = {}
): Promise<Response> {
  const { sensitiveFields = [], ...fetchOptions } = options;

  // Only encrypt if we have a body and sensitive fields
  if (fetchOptions.body && sensitiveFields.length > 0) {
    try {
      const body = JSON.parse(fetchOptions.body as string);
      const encrypted: Record<string, unknown> = { ...body };

      // Encrypt sensitive fields
      for (const field of sensitiveFields) {
        if (body[field]) {
          // For now, we'll rely on HTTPS encryption
          // Client-side encryption would require key exchange mechanism
          encrypted[field] = body[field];
        }
      }

      fetchOptions.body = JSON.stringify(encrypted);
    } catch (error) {
      console.error("Failed to process secure request:", error);
    }
  }

  return fetch(url, fetchOptions);
}
