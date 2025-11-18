/**
 * Input validation and sanitization utilities
 * All validation happens server-side only
 */

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DOMAIN_BLACKLIST = ["example.com", "test.com", "localhost"];

export function validateEmail(email: string): { valid: boolean; error?: string } {
  if (!email || typeof email !== "string") {
    return { valid: false, error: "Email is required" };
  }

  const trimmed = email.trim();
  if (trimmed.length === 0) {
    return { valid: false, error: "Email cannot be empty" };
  }

  if (trimmed.length > 255) {
    return { valid: false, error: "Email is too long" };
  }

  if (!EMAIL_REGEX.test(trimmed)) {
    return { valid: false, error: "Invalid email format" };
  }

  const domain = trimmed.split("@")[1]?.toLowerCase();
  if (domain && DOMAIN_BLACKLIST.includes(domain)) {
    return { valid: false, error: "Email domain not allowed" };
  }

  return { valid: true };
}

export function normalizeEmail(email: string): string {
  if (!email || typeof email !== "string") {
    throw new Error("Email must be a non-empty string");
  }

  const trimmed = email.trim();
  const normalized = trimmed.toLowerCase();

  // Validate after normalization
  const validation = validateEmail(normalized);
  if (!validation.valid) {
    throw new Error(validation.error || "Invalid email");
  }

  return normalized;
}

export function sanitizeInput(input: string): string {
  if (typeof input !== "string") {
    return "";
  }

  // Remove null bytes and control characters
  return input
    .replace(/\0/g, "")
    .replace(/[\x00-\x1F\x7F]/g, "")
    .trim();
}

export function validateFileType(
  mimeType: string,
  allowedTypes: string[]
): { valid: boolean; error?: string } {
  if (!mimeType || typeof mimeType !== "string") {
    return { valid: false, error: "File type is required" };
  }

  if (!allowedTypes.includes(mimeType)) {
    return {
      valid: false,
      error: `File type not allowed. Allowed types: ${allowedTypes.join(", ")}`,
    };
  }

  return { valid: true };
}

export function validateFileSize(
  size: number,
  maxSize: number
): { valid: boolean; error?: string } {
  if (typeof size !== "number" || size < 0) {
    return { valid: false, error: "Invalid file size" };
  }

  if (size > maxSize) {
    return {
      valid: false,
      error: `File size exceeds maximum allowed size (${maxSize / 1024 / 1024}MB)`,
    };
  }

  return { valid: true };
}

/**
 * Ensure email is a single email address, never an array
 * This prevents email array manipulation attacks
 */
export function ensureSingleEmail(email: unknown): string {
  if (Array.isArray(email)) {
    throw new Error("Email cannot be an array");
  }

  if (typeof email !== "string") {
    throw new Error("Email must be a string");
  }

  return normalizeEmail(email);
}

/**
 * Validate that email addresses in an array are all valid
 * Used for server-side validation of email lists
 */
export function validateEmailArray(emails: unknown[]): string[] {
  if (!Array.isArray(emails)) {
    throw new Error("Emails must be an array");
  }

  const validated: string[] = [];
  for (const email of emails) {
    const normalized = ensureSingleEmail(email);
    validated.push(normalized);
  }

  return validated;
}

