import { getDbPool } from "@/lib/db";
import { isFallbackModeActive } from "@/lib/auth/fallback";

let lastCheckTime = 0;
const CHECK_INTERVAL = 30000; // 30 seconds

/**
 * Check if database is available
 */
export async function checkDatabaseConnection(): Promise<boolean> {
  try {
    const pool = getDbPool();
    await pool.query("SELECT 1");
    return true;
  } catch {
    return false;
  }
}

/**
 * Auto-check database connection and trigger sync if available
 * This should be called periodically or on specific events
 */
export async function autoCheckAndSync(): Promise<{
  dbAvailable: boolean;
  fallbackModeActive: boolean;
  message: string;
}> {
  const now = Date.now();
  
  // Rate limit checks
  if (now - lastCheckTime < CHECK_INTERVAL) {
    return {
      dbAvailable: false,
      fallbackModeActive: isFallbackModeActive(),
      message: "Database check rate-limited",
    };
  }

  lastCheckTime = now;

  // Only check if fallback mode is active
  if (!isFallbackModeActive()) {
    return {
      dbAvailable: true,
      fallbackModeActive: false,
      message: "Fallback mode already disabled",
    };
  }

  const dbAvailable = await checkDatabaseConnection();

  if (dbAvailable) {
    console.log("✓ Database connection restored! Fallback mode can be synced and disabled.");
    return {
      dbAvailable: true,
      fallbackModeActive: true,
      message: "Database available - ready to sync fallback data",
    };
  }

  return {
    dbAvailable: false,
    fallbackModeActive: true,
    message: "Database still unavailable - fallback mode active",
  };
}

/**
 * Initialize auto-check on application start
 */
export function initializeAutoCheck() {
  // Check immediately on start
  setTimeout(async () => {
    const result = await autoCheckAndSync();
    if (result.dbAvailable && result.fallbackModeActive) {
      console.log("💡 Database is available. Call /api/admin/fallback/sync to sync pending users.");
    }
  }, 5000); // Wait 5 seconds after app start

  // Check periodically
  setInterval(async () => {
    const result = await autoCheckAndSync();
    if (result.dbAvailable && result.fallbackModeActive) {
      console.log("💡 Database connection detected. Ready to sync fallback data.");
    }
  }, CHECK_INTERVAL);
}
