import { NextResponse, type NextRequest } from "next/server";
import { getDbPool } from "@/lib/db";
import { type RowDataPacket } from "mysql2/promise";
import { fallbackToolSchedules, fallbackSurpriseMessages } from "@/data/toolContent";

type ScheduleRow = RowDataPacket & {
  id: number;
  tool_id: string;
  tool_name: string;
  open_at: Date;
  close_at: Date | null;
  is_active: number;
  surprise_message: string | null;
  custom_message: string | null;
};

type SurpriseMessageRow = RowDataPacket & {
  id: number;
  message: string;
};

const isMissingTableError = (error: unknown): boolean =>
  Boolean(
    error &&
    typeof error === "object" &&
    "code" in error &&
    (error as { code?: string }).code === "ER_NO_SUCH_TABLE"
  );

const pickFallbackMessage = (toolId: string): string | null => {
  const scoped = fallbackSurpriseMessages[toolId] ?? [];
  const defaults = fallbackSurpriseMessages.default ?? [];
  const options = [...scoped, ...defaults];
  if (!options.length) {
    return null;
  }
  const index = Math.floor(Math.random() * options.length);
  return options[index] ?? null;
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: toolId } = await params;
    const now = new Date();

    let pool: ReturnType<typeof getDbPool> | null = null;
    try {
      pool = getDbPool();
    } catch (poolError) {
      console.warn(`[Schedule] Database pool unavailable, using fallback for ${toolId}`, poolError);
    }

    let scheduleRows: ScheduleRow[] = [];
    let usedFallbackSchedule = false;

    if (pool) {
      try {
        [scheduleRows] = await pool.query<ScheduleRow[]>(
          `SELECT id, tool_id, tool_name, open_at, close_at, is_active, surprise_message, custom_message
           FROM tool_schedules
           WHERE tool_id = ? AND is_active = 1
           AND open_at <= ? AND (close_at IS NULL OR close_at >= ?)
           ORDER BY open_at DESC LIMIT 1`,
          [toolId, now, now]
        );
      } catch (error) {
        if (isMissingTableError(error)) {
          // usedFallbackSchedule = true; // Commented out as it's not used
          console.warn(`[Schedule] Missing tool_schedules table. Using fallback data for ${toolId}`);
        } else {
          throw error;
        }
      }
    } else {
      usedFallbackSchedule = true;
    }

    const fallbackSchedule = fallbackToolSchedules[toolId];
    const schedule = scheduleRows.length > 0 ? {
      id: scheduleRows[0].id,
      toolId: scheduleRows[0].tool_id,
      toolName: scheduleRows[0].tool_name,
      openAt: scheduleRows[0].open_at.toISOString(),
      closeAt: scheduleRows[0].close_at?.toISOString() || null,
      isActive: Boolean(scheduleRows[0].is_active),
      surpriseMessage: scheduleRows[0].surprise_message,
      customMessage: scheduleRows[0].custom_message,
    } : fallbackSchedule ? {
      id: fallbackSchedule.id,
      toolId: fallbackSchedule.toolId,
      toolName: fallbackSchedule.toolName,
      openAt: fallbackSchedule.openAt,
      closeAt: fallbackSchedule.closeAt,
      isActive: fallbackSchedule.isActive,
      surpriseMessage: fallbackSchedule.surpriseMessage ?? null,
      customMessage: fallbackSchedule.customMessage ?? null,
    } : null;

    let surpriseMessage: string | null = null;
    let usedFallbackMessage = false;

    if (pool) {
      try {
        const [messageRows] = await pool.query<SurpriseMessageRow[]>(
          `SELECT id, message FROM surprise_messages
           WHERE (tool_id = ? OR tool_id IS NULL) AND is_active = 1
           ORDER BY RAND() LIMIT 1`,
          [toolId]
        );
        surpriseMessage = messageRows.length > 0 ? messageRows[0].message : null;
      } catch (error) {
        if (isMissingTableError(error)) {
          usedFallbackMessage = true;
          console.warn(`[Schedule] Missing surprise_messages table. Using fallback message for ${toolId}`);
        } else {
          throw error;
        }
      }
    } else {
      usedFallbackMessage = true;
    }

    if ((usedFallbackMessage || surpriseMessage === null) && !surpriseMessage) {
      surpriseMessage = pickFallbackMessage(toolId);
    }

    const isScheduled = Boolean(schedule && new Date(schedule.openAt) > now);
    const isOpen = Boolean(
      schedule &&
      !isScheduled &&
      (!schedule.closeAt || new Date(schedule.closeAt) >= now)
    );

    return NextResponse.json({
      schedule,
      surpriseMessage,
      isScheduled,
      isOpen,
    });
  } catch (error) {
    console.error("Get tool schedule error:", error);
    return NextResponse.json({ error: "Unable to fetch schedule" }, { status: 500 });
  }
}

