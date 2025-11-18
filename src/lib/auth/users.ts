import { type ResultSetHeader, type RowDataPacket } from "mysql2/promise";
import { getDbPool } from "@/lib/db";
import { hashPassword } from "./password";
import type { AdminUserSummary, DbUser, SessionUser, UserRole } from "./types";

const USER_FIELDS = `id, email, password_hash, password_plain, role, display_name, is_active, is_email_verified, is_admin_confirmed, created_at, updated_at, last_login_at`;

type UserRow = RowDataPacket & {
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

function mapUser(row: UserRow): DbUser {
  return {
    id: row.id,
    email: row.email,
    password_hash: row.password_hash,
    password_plain: row.password_plain,
    role: row.role,
    display_name: row.display_name,
    is_active: row.is_active,
    is_email_verified: row.is_email_verified,
    is_admin_confirmed: row.is_admin_confirmed,
    created_at: row.created_at,
    updated_at: row.updated_at,
    last_login_at: row.last_login_at,
  };
}

export async function getUserByEmail(email: string): Promise<DbUser | null> {
  const pool = getDbPool();
  const [rows] = await pool.query<UserRow[]>(
    `SELECT ${USER_FIELDS} FROM users WHERE email = ? LIMIT 1`,
    [email],
  );

  if (!rows.length) {
    return null;
  }

  return mapUser(rows[0]);
}

export async function getUserById(id: number): Promise<DbUser | null> {
  const pool = getDbPool();
  const [rows] = await pool.query<UserRow[]>(
    `SELECT ${USER_FIELDS} FROM users WHERE id = ? LIMIT 1`,
    [id],
  );

  if (!rows.length) {
    return null;
  }

  return mapUser(rows[0]);
}

export async function markUserLogin(userId: number): Promise<void> {
  const pool = getDbPool();
  await pool.query<ResultSetHeader>(
    `UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [userId],
  );
}

export type CreateUserInput = {
  email: string;
  password: string;
  role?: UserRole;
  displayName?: string | null;
  isActive?: boolean;
  createdByAdminId?: number | null;
  createdByAdminName?: string | null;
};

export async function createUser(input: CreateUserInput): Promise<SessionUser> {
  const pool = getDbPool();
  const hashed = await hashPassword(input.password);
  const role = input.role ?? "user";
  const isActive = input.isActive ?? true;

  // Check if created_by_admin_id column exists in the users table
  let hasCreatedByColumns = false;
  try {
    const [columns] = await pool.query<RowDataPacket[]>(
      `SHOW COLUMNS FROM users LIKE 'created_by_admin_id'`
    );
    hasCreatedByColumns = columns.length > 0;
  } catch {
    // If check fails, assume columns don't exist
    hasCreatedByColumns = false;
  }

  let query: string;
  let params: (string | number | null)[];

  if (hasCreatedByColumns) {
    // Include created_by_admin_id and created_by_admin_name if they exist
    query = `INSERT INTO users (email, password_hash, password_plain, role, display_name, is_active, is_email_verified, is_admin_confirmed, created_by_admin_id, created_by_admin_name)
             VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?, ?)`;
    params = [
      input.email, 
      hashed, 
      input.password, 
      role, 
      input.displayName ?? null, 
      isActive ? 1 : 0,
      input.createdByAdminId ?? null,
      input.createdByAdminName ?? null
    ];
  } else {
    // Exclude created_by_admin_id and created_by_admin_name if they don't exist
    query = `INSERT INTO users (email, password_hash, password_plain, role, display_name, is_active, is_email_verified, is_admin_confirmed)
             VALUES (?, ?, ?, ?, ?, ?, 0, 0)`;
    params = [
      input.email, 
      hashed, 
      input.password, 
      role, 
      input.displayName ?? null, 
      isActive ? 1 : 0
    ];
  }

  const [result] = await pool.query<ResultSetHeader>(query, params);

  return {
    id: result.insertId,
    email: input.email,
    role,
    displayName: input.displayName ?? null,
    passwordPlain: input.password,
    emailVerified: false,
    adminConfirmed: false,
  };
}

export type UpdateUserInput = {
  password?: string;
  role?: UserRole;
  displayName?: string | null;
  isActive?: boolean;
  emailVerified?: boolean;
  adminConfirmed?: boolean;
};

export async function updateUser(userId: number, input: UpdateUserInput): Promise<void> {
  const pool = getDbPool();
  const assignments: string[] = [];
  const values: Array<string | number | null> = [];

  if (input.password) {
    const hashed = await hashPassword(input.password);
    assignments.push("password_hash = ?");
    values.push(hashed);
    assignments.push("password_plain = ?");
    values.push(input.password);
  }

  if (input.role) {
    assignments.push("role = ?");
    values.push(input.role);
  }

  if (input.displayName !== undefined) {
    assignments.push("display_name = ?");
    values.push(input.displayName ?? null);
  }

  if (input.isActive !== undefined) {
    assignments.push("is_active = ?");
    values.push(input.isActive ? 1 : 0);
  }

  if (input.emailVerified !== undefined) {
    assignments.push("is_email_verified = ?");
    values.push(input.emailVerified ? 1 : 0);
  }

  if (input.adminConfirmed !== undefined) {
    assignments.push("is_admin_confirmed = ?");
    values.push(input.adminConfirmed ? 1 : 0);
  }

  if (!assignments.length) {
    return;
  }

  assignments.push("updated_at = CURRENT_TIMESTAMP");
  const setClause = assignments.join(", ");

  await pool.query<ResultSetHeader>(
    `UPDATE users SET ${setClause} WHERE id = ?`,
    [...values, userId],
  );
}

export async function deleteUser(userId: number): Promise<void> {
  const pool = getDbPool();
  await pool.query<ResultSetHeader>(`DELETE FROM users WHERE id = ?`, [userId]);
}

export async function listUsers(): Promise<AdminUserSummary[]> {
  const pool = getDbPool();
  const [rows] = await pool.query<(RowDataPacket & {
    id: number;
    email: string;
    role: UserRole;
    display_name: string | null;
    is_active: number;
    created_at: Date;
    password_plain: string | null;
    is_email_verified: number;
    is_admin_confirmed: number;
  })[]>(
    `SELECT id, email, role, display_name, is_active, created_at, password_plain, is_email_verified, is_admin_confirmed FROM users ORDER BY created_at DESC`,
  );

  return rows.map((row) => ({
    id: row.id,
    email: row.email,
    role: row.role,
    displayName: row.display_name,
    isActive: Boolean(row.is_active),
    createdAt: row.created_at.toISOString(),
    passwordPlain: row.password_plain,
    emailVerified: Boolean(row.is_email_verified),
    adminConfirmed: Boolean(row.is_admin_confirmed),
  }));
}
