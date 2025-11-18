import { NextResponse, type NextRequest } from "next/server";
import { requireDevFromRequest } from "@/lib/auth/guards";
import { getDbPool } from "@/lib/db";
import { type RowDataPacket, type ResultSetHeader } from "mysql2/promise";
import { z } from "zod";

async function ensurePollsTable(pool: ReturnType<typeof getDbPool>) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS dev_polls (
      id INT AUTO_INCREMENT PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      description TEXT NULL,
      options JSON NOT NULL,
      isActive BOOLEAN DEFAULT true,
      allowMultipleVotes BOOLEAN DEFAULT false,
      targetRole VARCHAR(20) DEFAULT 'all',
      expiresAt TIMESTAMP NULL,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_active (isActive),
      INDEX idx_targetRole (targetRole),
      INDEX idx_expiresAt (expiresAt)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

async function ensurePollVotesTable(pool: ReturnType<typeof getDbPool>) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS dev_poll_votes (
      id INT AUTO_INCREMENT PRIMARY KEY,
      pollId INT NOT NULL,
      userId INT NOT NULL,
      optionId VARCHAR(100) NOT NULL,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (pollId) REFERENCES dev_polls(id) ON DELETE CASCADE,
      UNIQUE KEY unique_user_poll (pollId, userId),
      INDEX idx_pollId (pollId),
      INDEX idx_userId (userId)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

export async function GET(request: NextRequest) {
  try {
    await requireDevFromRequest(request);
    const pool = getDbPool();

    try {
      const [rows] = await pool.query<(RowDataPacket & {
        id: number;
        title: string;
        description: string | null;
        options: string;
        isActive: boolean;
        allowMultipleVotes: boolean;
        targetRole: string;
        expiresAt: string | null;
        createdAt: string;
        totalVotes: number;
      })[]>(`
        SELECT p.*, COUNT(pv.id) as totalVotes
        FROM dev_polls p
        LEFT JOIN dev_poll_votes pv ON p.id = pv.pollId
        GROUP BY p.id
        ORDER BY p.createdAt DESC
      `);

      const polls = rows.map(row => ({
        ...row,
        options: JSON.parse(row.options),
        totalVotes: Number(row.totalVotes)
      }));

      return NextResponse.json({ polls });
    } catch (dbError: unknown) {
      if (dbError && typeof dbError === "object" && "code" in dbError && dbError.code === "ER_NO_SUCH_TABLE") {
        console.warn("dev_polls table missing; creating automatically.");
        await ensurePollsTable(pool);
        await ensurePollVotesTable(pool);
        return NextResponse.json({ polls: [] });
      }
      throw dbError;
    }
  } catch (error) {
    if (error instanceof Error && "status" in error) {
      const httpError = error as { status: number; message: string };
      return NextResponse.json({ error: httpError.message }, { status: httpError.status });
    }

    console.error("Get polls error:", error);
    return NextResponse.json({ error: "Unable to fetch polls" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireDevFromRequest(request);
    const body = await request.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const pollSchema = z.object({
      title: z.string().min(1).max(255),
      description: z.string().nullable().optional(),
      options: z.array(z.string().min(1)).min(2),
      isActive: z.boolean().optional().default(true),
      allowMultipleVotes: z.boolean().optional().default(false),
      targetRole: z.enum(["user", "admin", "dev", "all"]).optional().default("all"),
      expiresAt: z.string().nullable().optional(),
    });

    const validatedData = pollSchema.parse(body);

    const pool = getDbPool();
    
    try {
      // Generate unique IDs for options
      const optionsWithIds = validatedData.options.map((text, index) => ({
        id: `option_${index + 1}`,
        text,
        votes: 0
      }));

      const [result] = await pool.query<ResultSetHeader>(
        `INSERT INTO dev_polls (title, description, options, isActive, allowMultipleVotes, targetRole, expiresAt)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          validatedData.title,
          validatedData.description || null,
          JSON.stringify(optionsWithIds),
          validatedData.isActive,
          validatedData.allowMultipleVotes,
          validatedData.targetRole,
          validatedData.expiresAt || null
        ]
      );

      return NextResponse.json({ 
        id: result.insertId,
        message: "Poll created successfully" 
      });
    } catch (dbError: unknown) {
      if (dbError && typeof dbError === "object" && "code" in dbError && dbError.code === "ER_NO_SUCH_TABLE") {
        console.warn("dev_polls table missing on write; creating automatically.");
        await ensurePollsTable(pool);
        await ensurePollVotesTable(pool);
        
        // Retry the insert
        const optionsWithIds = validatedData.options.map((text, index) => ({
          id: `option_${index + 1}`,
          text,
          votes: 0
        }));

        const [result] = await pool.query<ResultSetHeader>(
          `INSERT INTO dev_polls (title, description, options, isActive, allowMultipleVotes, targetRole, expiresAt)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            validatedData.title,
            validatedData.description || null,
            JSON.stringify(optionsWithIds),
            validatedData.isActive,
            validatedData.allowMultipleVotes,
            validatedData.targetRole,
            validatedData.expiresAt || null
          ]
        );

        return NextResponse.json({ 
          id: result.insertId,
          message: "Poll created successfully" 
        });
      }
      throw dbError;
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request data" }, { status: 400 });
    }

    if (error instanceof Error && "status" in error) {
      const httpError = error as { status: number; message: string };
      return NextResponse.json({ error: httpError.message }, { status: httpError.status });
    }

    console.error("Create poll error:", error);
    return NextResponse.json({ error: "Unable to create poll" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await requireDevFromRequest(request);
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id || isNaN(Number(id))) {
      return NextResponse.json({ error: "Invalid poll ID" }, { status: 400 });
    }

    const pool = getDbPool();
    
    const [result] = await pool.query<ResultSetHeader>(
      "DELETE FROM dev_polls WHERE id = ?",
      [Number(id)]
    );

    if (result.affectedRows === 0) {
      return NextResponse.json({ error: "Poll not found" }, { status: 404 });
    }

    return NextResponse.json({ message: "Poll deleted successfully" });
  } catch (error) {
    if (error instanceof Error && "status" in error) {
      const httpError = error as { status: number; message: string };
      return NextResponse.json({ error: httpError.message }, { status: httpError.status });
    }

    console.error("Delete poll error:", error);
    return NextResponse.json({ error: "Unable to delete poll" }, { status: 500 });
  }
}