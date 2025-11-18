import { type ResultSetHeader, type RowDataPacket } from "mysql2/promise";
import { getDbPool } from "@/lib/db";

export type ThemeMode = "light" | "dark" | "system";

export type ThemePreference = {
  id: number;
  userId: number;
  themeMode: ThemeMode;
  bgColor: string | null;
  textColor: string | null;
  cardBgColor: string | null;
  borderColor: string | null;
  primaryColor: string | null;
  hoverColor: string | null;
  mutedBgColor: string | null;
  mutedTextColor: string | null;
  fontFamily: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type ThemeRow = RowDataPacket & {
  id: number;
  user_id: number;
  theme_mode: string;
  bg_color: string | null;
  text_color: string | null;
  card_bg_color: string | null;
  border_color: string | null;
  primary_color: string | null;
  hover_color: string | null;
  muted_bg_color: string | null;
  muted_text_color: string | null;
  font_family: string | null;
  created_at: Date;
  updated_at: Date;
};

function mapThemePreference(row: ThemeRow): ThemePreference {
  return {
    id: row.id,
    userId: row.user_id,
    themeMode: row.theme_mode as ThemeMode,
    bgColor: row.bg_color,
    textColor: row.text_color,
    cardBgColor: row.card_bg_color,
    borderColor: row.border_color,
    primaryColor: row.primary_color,
    hoverColor: row.hover_color,
    mutedBgColor: row.muted_bg_color,
    mutedTextColor: row.muted_text_color,
    fontFamily: row.font_family,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getUserThemePreference(userId: number): Promise<ThemePreference | null> {
  try {
    const pool = getDbPool();
    const [rows] = await pool.query<ThemeRow[]>(
      `SELECT * FROM theme_preferences WHERE user_id = ? LIMIT 1`,
      [userId]
    );

    if (!rows.length) {
      return null;
    }

    return mapThemePreference(rows[0]);
  } catch (error) {
    console.error("Error fetching theme preference:", error);
    return null;
  }
}

export async function saveUserThemePreference(
  userId: number,
  preferences: Partial<Omit<ThemePreference, "id" | "userId" | "createdAt" | "updatedAt">>
): Promise<boolean> {
  try {
    const pool = getDbPool();
    
    // Check if user exists in database (skip for fallback users with negative IDs)
    if (userId < 0) {
      // Fallback user (JWT token) - don't save to database
      // This will be handled by the fallback storage in the API route
      return false;
    }
    
    // Verify user exists before saving preferences
    const [userRows] = await pool.query<(RowDataPacket & { id: number })[]>(
      `SELECT id FROM users WHERE id = ? LIMIT 1`,
      [userId]
    );
    
    if (!userRows.length) {
      console.warn(`User ${userId} does not exist in database, skipping theme preference save`);
      return false;
    }
    
    // Build column names and values separately
    const columns: string[] = [];
    const insertValues: (string | number | null)[] = [userId];
    const updateClauses: string[] = [];
    const updateValues: (string | number | null)[] = [];
    
    // Map preference keys to database column names
    const columnMap: Record<string, string> = {
      themeMode: "theme_mode",
      bgColor: "bg_color",
      textColor: "text_color",
      cardBgColor: "card_bg_color",
      borderColor: "border_color",
      primaryColor: "primary_color",
      hoverColor: "hover_color",
      mutedBgColor: "muted_bg_color",
      mutedTextColor: "muted_text_color",
      fontFamily: "font_family",
    };
    
    // Build columns and values
    for (const [key, columnName] of Object.entries(columnMap)) {
      if (preferences[key as keyof typeof preferences] !== undefined) {
        const value = preferences[key as keyof typeof preferences];
        columns.push(columnName);
        insertValues.push(value as string | number | null);
        updateClauses.push(`${columnName} = ?`);
        updateValues.push(value as string | number | null);
      }
    }

    if (columns.length === 0) {
      return false;
    }

    // Build the INSERT ... ON DUPLICATE KEY UPDATE query
    // For UPDATE, we need to provide values again, so we combine insertValues and updateValues
    const allValues = [...insertValues, ...updateValues];
    
    await pool.query<ResultSetHeader>(
      `INSERT INTO theme_preferences (user_id, ${columns.join(", ")})
       VALUES (?, ${columns.map(() => "?").join(", ")})
       ON DUPLICATE KEY UPDATE ${updateClauses.join(", ")}`,
      allValues
    );

    return true;
  } catch (error) {
    console.error("Error saving theme preference:", error);
    return false;
  }
}
