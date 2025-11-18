import { NextRequest, NextResponse } from 'next/server';
import { getSessionUserFromRequest } from '@/lib/auth/session';
import { getDbPool } from '@/lib/db';

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
    const { toolIds } = body;

    const pool = getDbPool();

    // Check if user_tours table exists, create if not
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS user_tours (
          id INT AUTO_INCREMENT PRIMARY KEY,
          user_id INT NOT NULL,
          tour_type VARCHAR(50) NOT NULL DEFAULT 'main',
          tool_id VARCHAR(100) NULL,
          completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE KEY unique_user_tour (user_id, tour_type, tool_id),
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          INDEX idx_user_id (user_id),
          INDEX idx_tour_type (tour_type)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
    } catch (error: unknown) {
      // Table might already exist, ignore error
      if (error instanceof Error && !error.message?.includes('already exists')) {
        console.error('Error creating user_tours table:', error);
      }
    }

    // Mark main tour as complete
    if (!toolIds || toolIds.length === 0) {
      // Use a transaction with proper isolation level and retry logic
      const maxRetries = 5;
      let retries = 0;
      while (retries < maxRetries) {
        const connection = await pool.getConnection();
        try {
          await connection.beginTransaction();
          
          // Use INSERT IGNORE first, then UPDATE if needed to avoid lock contention
          await connection.query(`
            INSERT IGNORE INTO user_tours (user_id, tour_type, tool_id, completed_at)
            VALUES (?, 'main', NULL, CURRENT_TIMESTAMP)
          `, [user.id]);
          
          // Update if record already exists (INSERT IGNORE won't update)
          await connection.query(`
            UPDATE user_tours 
            SET completed_at = CURRENT_TIMESTAMP
            WHERE user_id = ? AND tour_type = 'main' AND tool_id IS NULL
          `, [user.id]);
          
          await connection.commit();
          connection.release();
          break; // Success, exit retry loop
        } catch (error: unknown) {
          await connection.rollback();
          connection.release();
          
          if (error instanceof Error && 'code' in error && error.code === 'ER_LOCK_WAIT_TIMEOUT' && retries < maxRetries - 1) {
            retries++;
            // Exponential backoff with jitter
            const waitTime = Math.min(50 * Math.pow(2, retries) + Math.random() * 100, 1000);
            await new Promise(resolve => setTimeout(resolve, waitTime));
            continue;
          }
          throw error; // Re-throw if not a lock timeout or max retries reached
        }
      }
    } else {
      // Mark tool-specific tours as complete - use single batch INSERT to minimize lock contention
      const maxRetries = 5;
      let retries = 0;
      while (retries < maxRetries) {
        const connection = await pool.getConnection();
        try {
          await connection.beginTransaction();
          
          // Use a single batch INSERT with ON DUPLICATE KEY UPDATE to handle all toolIds at once
          // This significantly reduces lock contention compared to individual inserts
          if (toolIds.length > 0) {
            const placeholders = toolIds.map(() => '(?, ?, ?, CURRENT_TIMESTAMP)').join(', ');
            const values: (string | number)[] = [];
            toolIds.forEach(toolId => {
              values.push(user.id, 'tool', toolId);
            });
            
            await connection.query(`
              INSERT INTO user_tours (user_id, tour_type, tool_id, completed_at)
              VALUES ${placeholders}
              ON DUPLICATE KEY UPDATE completed_at = CURRENT_TIMESTAMP
            `, values);
          }
          
          await connection.commit();
          connection.release();
          break; // Success, exit retry loop
        } catch (error: unknown) {
          await connection.rollback();
          connection.release();
          
          if (error instanceof Error && 'code' in error && error.code === 'ER_LOCK_WAIT_TIMEOUT' && retries < maxRetries - 1) {
            retries++;
            // Exponential backoff with jitter - increased wait times for better reliability
            const baseWait = 100 * Math.pow(2, retries);
            const jitter = Math.random() * 200;
            const waitTime = Math.min(baseWait + jitter, 2000); // Max 2 seconds
            console.log(`[Tour Complete] Lock timeout, retrying in ${waitTime.toFixed(0)}ms (attempt ${retries + 1}/${maxRetries})`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
            continue;
          }
          throw error; // Re-throw if not a lock timeout or max retries reached
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('Error marking tour as complete:', error);
    return NextResponse.json(
      { error: 'Failed to mark tour as complete', message: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

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

    // Check if user_tours table exists, create if not
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS user_tours (
          id INT AUTO_INCREMENT PRIMARY KEY,
          user_id INT NOT NULL,
          tour_type VARCHAR(50) NOT NULL DEFAULT 'main',
          tool_id VARCHAR(100) NULL,
          completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE KEY unique_user_tour (user_id, tour_type, tool_id),
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          INDEX idx_user_id (user_id),
          INDEX idx_tour_type (tour_type)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
    } catch (error: unknown) {
      // Table might already exist, ignore error
      if (error instanceof Error && !error.message?.includes('already exists')) {
        console.error('Error creating user_tours table:', error);
      }
    }

    // Get all completed tours for this user
    const [rows] = await pool.query<({ tour_type: string; tool_id: string | null; completed_at: Date })[]>(`
      SELECT tour_type, tool_id, completed_at
      FROM user_tours
      WHERE user_id = ?
    `, [user.id]);

    const completedTours = {
      main: false,
      tools: [] as string[],
    };

    for (const row of rows) {
      if (row.tour_type === 'main') {
        completedTours.main = true;
      } else if (row.tour_type === 'tool' && row.tool_id) {
        completedTours.tools.push(row.tool_id);
      }
    }

    return NextResponse.json({ completedTours });
  } catch (error: unknown) {
    console.error('Error fetching tour status:', error);
    return NextResponse.json(
      { error: 'Failed to fetch tour status', message: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

