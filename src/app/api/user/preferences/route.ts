import { NextRequest, NextResponse } from 'next/server';
import { getSessionUserFromRequest } from '@/lib/auth/session';
import { getDbPool } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const user = await getSessionUserFromRequest(request);
    
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const pool = getDbPool();

    // Check if user_preferences table exists, create if not
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS user_preferences (
          id INT AUTO_INCREMENT PRIMARY KEY,
          user_id INT NOT NULL UNIQUE,
          disable_welcome_tour BOOLEAN DEFAULT FALSE,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          INDEX idx_user_id (user_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
    } catch (error: unknown) {
      if (error instanceof Error && !error.message?.includes('already exists')) {
        console.error('Error creating user_preferences table:', error);
      }
    }

    // Get user preferences
    const [rows] = await pool.query<({ disable_welcome_tour: number })[]>(`
      SELECT disable_welcome_tour
      FROM user_preferences
      WHERE user_id = ?
    `, [user.id]);

    const preferences = rows.length > 0 ? {
      disableWelcomeTour: Boolean(rows[0].disable_welcome_tour),
    } : {
      disableWelcomeTour: false,
    };

    return NextResponse.json({ preferences });
  } catch (error: unknown) {
    console.error('Error fetching user preferences:', error);
    return NextResponse.json(
      { error: 'Failed to fetch preferences', message: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getSessionUserFromRequest(request);
    
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { disableWelcomeTour } = body;

    const pool = getDbPool();

    // Check if user_preferences table exists, create if not
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS user_preferences (
          id INT AUTO_INCREMENT PRIMARY KEY,
          user_id INT NOT NULL UNIQUE,
          disable_welcome_tour BOOLEAN DEFAULT FALSE,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          INDEX idx_user_id (user_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
    } catch (error: unknown) {
      if (error instanceof Error && !error.message?.includes('already exists')) {
        console.error('Error creating user_preferences table:', error);
      }
    }

    // Update or insert user preferences
    await pool.query(`
      INSERT INTO user_preferences (user_id, disable_welcome_tour)
      VALUES (?, ?)
      ON DUPLICATE KEY UPDATE 
        disable_welcome_tour = ?,
        updated_at = CURRENT_TIMESTAMP
    `, [user.id, disableWelcomeTour ? 1 : 0, disableWelcomeTour ? 1 : 0]);

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('Error updating user preferences:', error);
    return NextResponse.json(
      { error: 'Failed to update preferences', message: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

