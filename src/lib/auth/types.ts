export type UserRole = "admin" | "user" | "dev";

export type DbUser = {
  id: number;
  email: string;
  password_hash: string;
  password_plain: string | null;
  role: UserRole;
  display_name: string | null;
  is_active: number;
  is_email_verified: number;
  is_admin_confirmed: number;
  created_at: Date;
  updated_at: Date;
  last_login_at: Date | null;
};

export type SessionUser = {
  id: number;
  email: string;
  role: UserRole;
  displayName: string | null;
  passwordPlain: string | null;
  emailVerified: boolean;
  adminConfirmed: boolean;
};

export type AdminUserSummary = {
  id: number;
  email: string;
  role: UserRole;
  displayName: string | null;
  isActive: boolean;
  createdAt: string;
  passwordPlain: string | null;
  emailVerified: boolean;
  adminConfirmed: boolean;
};

export type ActivityLogEntry = {
  id: number;
  userId: number | null;
  userEmail: string | null;
  action: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};
