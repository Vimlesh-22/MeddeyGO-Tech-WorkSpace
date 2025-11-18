import type { SessionUser } from "./types";
import { sendEmail } from "../email";

const DEFAULT_ADMIN_EMAIL = process.env.DEFAULT_ADMIN_EMAIL || "";
const DEFAULT_ADMIN_PASSWORD = process.env.DEFAULT_ADMIN_PASSWORD || "";

// In-memory storage for fallback mode (temporary until DB is available)
interface PendingUser {
  email: string;
  password: string;
  displayName: string | null;
  role: "user" | "admin";
  createdAt: number;
  emailVerificationOTP?: string;
  emailVerificationSentAt?: number;
  adminConfirmationCode?: string;
  adminConfirmationGeneratedAt?: number;
  isEmailVerified: boolean;
  isAdminConfirmed: boolean;
}

const pendingUsers = new Map<string, PendingUser>();
let fallbackModeActive = true;

/**
 * Check if fallback mode should be active
 */
export function isFallbackModeActive(): boolean {
  return fallbackModeActive;
}

/**
 * Disable fallback mode (called after successful DB sync)
 */
export function disableFallbackMode(): void {
  fallbackModeActive = false;
  console.log("✓ Fallback mode disabled - database is now available");
}

/**
 * Get all pending users created in fallback mode
 */
export function getPendingUsers(): PendingUser[] {
  return Array.from(pendingUsers.values());
}

/**
 * Clear all pending users (after successful sync)
 */
export function clearPendingUsers(): void {
  pendingUsers.clear();
  console.log("✓ Cleared all pending fallback users");
}

/**
 * Create a new user in fallback mode
 */
export async function createFallbackUser(
  email: string,
  password: string,
  displayName: string | null,
  role: "user" | "admin" = "user"
): Promise<{ success: boolean; message: string }> {
  const normalizedEmail = email.toLowerCase();

  if (pendingUsers.has(normalizedEmail)) {
    return { success: false, message: "User already exists in pending list" };
  }

  const user: PendingUser = {
    email: normalizedEmail,
    password,
    displayName,
    role,
    createdAt: Date.now(),
    isEmailVerified: false,
    isAdminConfirmed: false,
  };

  pendingUsers.set(normalizedEmail, user);
  
  console.log(`✓ Created pending user in fallback mode: ${normalizedEmail}`);
  return { success: true, message: "User created in fallback mode" };
}

/**
 * Generate and send email verification OTP
 */
export async function sendEmailVerificationOTP(email: string): Promise<{ success: boolean; message: string }> {
  const normalizedEmail = email.toLowerCase();
  const user = pendingUsers.get(normalizedEmail);

  if (!user) {
    return { success: false, message: "User not found in pending list" };
  }

  // Generate 6-digit OTP
  const otp = String(Math.floor(100000 + Math.random() * 900000));
  user.emailVerificationOTP = otp;
  user.emailVerificationSentAt = Date.now();

  try {
    await sendEmail({
      to: normalizedEmail,
      subject: "Verify Your Email - Meddey Tech Workspace",
      replyTo: process.env.SMTP_FROM,
      text: `Hello ${user.displayName || normalizedEmail},

Welcome to Meddey Tech Workspace! Please verify your email address.

Your Email Verification OTP: ${otp}

This OTP will expire in 10 minutes.

Note: System is currently in fallback mode. Your account will be finalized once the database is available.

If you didn't create this account, please ignore this email.

Best regards,
Meddey Tech Workspace Team`,
      html: `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
    .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
    .otp-box { background: white; border: 2px solid #667eea; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center; }
    .otp-code { font-size: 32px; font-weight: bold; color: #667eea; letter-spacing: 5px; }
    .warning { background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 15px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>📧 Email Verification</h1>
    </div>
    <div class="content">
      <p>Hello <strong>${user.displayName || normalizedEmail}</strong>,</p>
      
      <p>Welcome to Meddey Tech Workspace! Please verify your email address to complete your registration.</p>
      
      <div class="otp-box">
        <p style="margin: 0 0 10px 0; color: #666;">Your Verification OTP:</p>
        <div class="otp-code">${otp}</div>
        <p style="margin: 10px 0 0 0; color: #666;">Valid for 10 minutes</p>
      </div>
      
      <div class="warning">
        <strong>⚠️ Fallback Mode:</strong> System is currently operating in fallback mode. Your account will be finalized once the database connection is restored.
      </div>
      
      <p style="font-size: 12px; color: #999;">
        If you didn't create this account, please ignore this email.
      </p>
    </div>
  </div>
</body>
</html>`,
    });

    console.log(`✓ Email verification OTP sent to ${normalizedEmail}`);
    return { success: true, message: "Verification OTP sent to email" };
  } catch (error) {
    console.error("Failed to send verification OTP:", error);
    return { success: false, message: "Failed to send verification email" };
  }
}

/**
 * Verify email verification OTP
 */
export function verifyEmailOTP(email: string, otp: string): { success: boolean; message: string } {
  const normalizedEmail = email.toLowerCase();
  const user = pendingUsers.get(normalizedEmail);

  if (!user) {
    return { success: false, message: "User not found" };
  }

  if (!user.emailVerificationOTP || !user.emailVerificationSentAt) {
    return { success: false, message: "No OTP has been sent" };
  }

  // Check if OTP is expired (10 minutes)
  const expiryTime = 10 * 60 * 1000; // 10 minutes
  if (Date.now() - user.emailVerificationSentAt > expiryTime) {
    return { success: false, message: "OTP has expired" };
  }

  if (user.emailVerificationOTP !== otp) {
    return { success: false, message: "Invalid OTP" };
  }

  // Mark as verified
  user.isEmailVerified = true;
  console.log(`✓ Email verified for ${normalizedEmail}`);
  
  return { success: true, message: "Email verified successfully" };
}

/**
 * Generate admin confirmation code
 */
export function generateAdminConfirmationCode(email: string): { success: boolean; message: string; code?: string } {
  const normalizedEmail = email.toLowerCase();
  const user = pendingUsers.get(normalizedEmail);

  if (!user) {
    return { success: false, message: "User not found" };
  }

  if (!user.isEmailVerified) {
    return { success: false, message: "Email must be verified first" };
  }

  // Generate 8-character alphanumeric code
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  user.adminConfirmationCode = code;
  user.adminConfirmationGeneratedAt = Date.now();

  console.log(`✓ Admin confirmation code generated for ${normalizedEmail}: ${code}`);
  
  return { 
    success: true, 
    message: "Admin confirmation code generated", 
    code 
  };
}

/**
 * Verify admin confirmation code
 */
export function verifyAdminConfirmationCode(email: string, code: string): { success: boolean; message: string } {
  const normalizedEmail = email.toLowerCase();
  const user = pendingUsers.get(normalizedEmail);

  if (!user) {
    return { success: false, message: "User not found" };
  }

  if (!user.adminConfirmationCode || !user.adminConfirmationGeneratedAt) {
    return { success: false, message: "No confirmation code has been generated" };
  }

  // Check if code is expired (30 minutes)
  const expiryTime = 30 * 60 * 1000; // 30 minutes
  if (Date.now() - user.adminConfirmationGeneratedAt > expiryTime) {
    return { success: false, message: "Confirmation code has expired" };
  }

  if (user.adminConfirmationCode !== code.toUpperCase()) {
    return { success: false, message: "Invalid confirmation code" };
  }

  // Mark as confirmed
  user.isAdminConfirmed = true;
  console.log(`✓ Admin confirmation verified for ${normalizedEmail}`);
  
  return { success: true, message: "Admin confirmation successful" };
}

/**
 * Fallback authentication when database is unavailable.
 * Only works for the default admin credentials from .env
 */
export async function verifyFallbackCredentials(
  email: string,
  password: string
): Promise<SessionUser | null> {
  if (!DEFAULT_ADMIN_EMAIL || !DEFAULT_ADMIN_PASSWORD) {
    return null;
  }

  if (email.toLowerCase() !== DEFAULT_ADMIN_EMAIL.toLowerCase()) {
    return null;
  }

  if (password !== DEFAULT_ADMIN_PASSWORD) {
    return null;
  }

  return {
    id: -1, // Temporary ID for fallback mode
    email: DEFAULT_ADMIN_EMAIL,
    role: "admin",
    displayName: "Admin (Fallback Mode)",
    passwordPlain: DEFAULT_ADMIN_PASSWORD,
    emailVerified: true,
    adminConfirmed: true,
  };
}

/**
 * Generate a simple OTP for fallback mode (when DB unavailable)
 */
export function generateFallbackOTP(email: string): string {
  if (!DEFAULT_ADMIN_EMAIL) {
    throw new Error("Default admin email not configured");
  }

  if (email.toLowerCase() !== DEFAULT_ADMIN_EMAIL.toLowerCase()) {
    throw new Error("OTP only available for default admin");
  }
  
  // Simple 6-digit OTP based on timestamp (valid for ~1 minute windows)
  const timestamp = Math.floor(Date.now() / 60000); // 1-minute buckets
  const seed = DEFAULT_ADMIN_EMAIL + timestamp;
  const hash = seed.split('').reduce((acc, char) => {
    return ((acc << 5) - acc) + char.charCodeAt(0);
  }, 0);
  
  return String(Math.abs(hash) % 1000000).padStart(6, '0');
}

/**
 * Verify OTP for fallback mode
 */
export function verifyFallbackOTP(email: string, code: string): boolean {
  if (!DEFAULT_ADMIN_EMAIL) {
    return false;
  }

  if (email.toLowerCase() !== DEFAULT_ADMIN_EMAIL.toLowerCase()) {
    return false;
  }

  const currentOTP = generateFallbackOTP(email);
  const timestamp = Math.floor(Date.now() / 60000);
  const previousTimestamp = timestamp - 1;
  const seed = DEFAULT_ADMIN_EMAIL + previousTimestamp;
  const hash = seed.split('').reduce((acc, char) => {
    return ((acc << 5) - acc) + char.charCodeAt(0);
  }, 0);
  const previousOTP = String(Math.abs(hash) % 1000000).padStart(6, '0');

  // Accept current or previous minute's OTP (2-minute window)
  return code === currentOTP || code === previousOTP;
}

