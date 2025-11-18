import { NextResponse, type NextRequest } from "next/server";
import { requireAdminFromRequest, HttpError } from "@/lib/auth/guards";
import { getDbPool } from "@/lib/db";
import type { RowDataPacket } from "mysql2/promise";

type ActivityLogRow = RowDataPacket & {
  id: number;
  user_id: number | null;
  action: string;
  details: string | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: Date;
  user_email: string | null;
  user_name: string | null;
  user_role: "admin" | "user" | "dev" | null;
};

/**
 * Get activity logs with pagination and filtering
 * Supports filtering by action type (login, access, changes, all)
 */
export async function GET(request: NextRequest) {
  try {
    await requireAdminFromRequest(request);
    
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20")));
    const offset = (page - 1) * limit;
    const filter = searchParams.get("filter") || "all"; // all, login, access, changes
    
    const pool = getDbPool();
    
    // Define action categories
    const loginActions = [
      'login',
      'admin_login',
      'user_login',
    ];
    
    const accessActions = [
      'tool_quote_view',
      'tool_order_view',
      'gsheet_extract',
      'gsheet_export',
    ];
    
    const changesActions = [
      'admin_create_user',
      'admin_update_user',
      'admin_delete_user',
      'verify_admin_confirm',
      'verify_user_verify',
      'admin_unlock',
      'admin_finalize_user',
      'tool_quote_generate',
      'tool_order_extract',
    ];
    
    // Select actions based on filter
    let actionFilters: string[];
    switch (filter) {
      case 'login':
        actionFilters = loginActions;
        break;
      case 'access':
        actionFilters = accessActions;
        break;
      case 'changes':
        actionFilters = changesActions;
        break;
      default:
        actionFilters = [...loginActions, ...accessActions, ...changesActions];
    }
    
    const placeholders = actionFilters.map(() => '?').join(',');
    
    // Get total count
    const [countRows] = await pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) as total FROM activity_log WHERE action IN (${placeholders})`,
      actionFilters
    );
    const total = (countRows[0] as { total: number }).total;
    
    // Get paginated logs with user information
    const [logs] = await pool.query<ActivityLogRow[]>(
      `SELECT 
        al.id,
        al.user_id,
        al.action,
        al.details,
        al.ip_address,
        al.user_agent,
        al.created_at,
        u.email as user_email,
        u.display_name as user_name,
        u.role as user_role
      FROM activity_log al
      LEFT JOIN users u ON al.user_id = u.id
      WHERE al.action IN (${placeholders})
      ORDER BY al.created_at DESC
      LIMIT ? OFFSET ?`,
      [...actionFilters, limit, offset]
    );
    
    const formatted = logs.map(log => ({
      id: log.id,
      userId: log.user_id,
      userEmail: log.user_email || 'System',
      userName: log.user_name || log.user_email || 'System',
      userRole: log.user_role || 'system',
      action: formatActionName(log.action),
      actionType: getActionType(log.action),
      details: log.details ? JSON.parse(log.details) : null,
      ipAddress: log.ip_address,
      userAgent: log.user_agent,
      timestamp: log.created_at.toISOString(),
      exactTime: formatExactTimestamp(log.created_at),
      formattedTime: formatTimestamp(log.created_at),
    }));
    
    return NextResponse.json({
      logs: formatted,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1,
      },
      filter,
    });
  } catch (error) {
    if (error instanceof HttpError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error("Get activity logs error", error);
    return NextResponse.json({ error: "Unable to load activity logs" }, { status: 500 });
  }
}

function formatActionName(action: string): string {
  const map: Record<string, string> = {
    'login': 'Login',
    'admin_login': 'Admin Login',
    'user_login': 'User Login',
    'admin_create_user': 'Created User',
    'admin_update_user': 'Updated User',
    'admin_delete_user': 'Deleted User',
    'verify_admin_confirm': 'Verified Admin Code',
    'verify_user_verify': 'Verified User Email',
    'tool_quote_generate': 'Generated Quote',
    'tool_quote_view': 'Viewed Quote',
    'tool_order_extract': 'Extracted Order',
    'tool_order_view': 'Viewed Order',
    'gsheet_extract': 'Extracted from Google Sheet',
    'gsheet_export': 'Exported to Google Sheet',
    'admin_unlock': 'Unlocked Admin Panel',
    'admin_finalize_user': 'Finalized User Account',
  };
  
  return map[action] || action.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function getActionType(action: string): 'login' | 'access' | 'changes' {
  if (action.includes('login')) return 'login';
  if (action.includes('view') || action.includes('extract') || action.includes('export')) {
    return 'access';
  }
  return 'changes';
}

function formatExactTimestamp(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kolkata', // ✅ FOR IST
  }).format(date);
}

function formatTimestamp(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (seconds < 60) return `${seconds} seconds ago`;
  if (minutes < 60) return `${minutes} minutes ago`;
  if (hours < 24) return `${hours} hours ago`;
  if (days < 7) return `${days} days ago`;
  
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

