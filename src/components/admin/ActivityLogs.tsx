"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";

type ActivityLog = {
  id: number;
  userId: number | null;
  userEmail: string;
  userName: string;
  userRole: string;
  action: string;
  actionType: "login" | "access" | "changes";
  details: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  timestamp: string;
  exactTime: string;
  formattedTime: string;
};

type Pagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
};

type FilterType = "all" | "login" | "access" | "changes";

export function ActivityLogs() {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
    hasNext: false,
    hasPrev: false,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterType>("all");

  const loadLogs = useCallback(async (page: number = 1, currentFilter: FilterType = filter) => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`/api/activity-logs?page=${page}&limit=20&filter=${currentFilter}`, {
        cache: "no-store",
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? "Unable to load activity logs");
        return;
      }

      const data = (await response.json()) as {
        logs: ActivityLog[];
        pagination: Pagination;
        filter?: string;
      };

      setLogs(data.logs);
      setPagination(data.pagination);
      setError(null);
    } catch (loadError) {
      console.error("Load logs error", loadError);
      setError("Unable to load activity logs");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    void loadLogs(1, filter);
  }, [filter, loadLogs]);

  const handlePageChange = (newPage: number) => {
    void loadLogs(newPage, filter);
  };

  const handleFilterChange = (newFilter: FilterType) => {
    setFilter(newFilter);
    setPagination(prev => ({ ...prev, page: 1 })); // Reset to page 1 when filter changes
  };

  const getActionBadgeColor = (actionType: string) => {
    switch (actionType) {
      case "login":
        return "bg-green-100 text-green-800 border-green-200 dark:bg-green-900/20 dark:text-green-300 dark:border-green-800";
      case "access":
        return "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-800";
      case "changes":
        return "bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-900/20 dark:text-purple-300 dark:border-purple-800";
      default:
        return "bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-900/20 dark:text-gray-300 dark:border-gray-800";
    }
  };

  const getRoleBadge = (role: string) => {
    if (role === "admin") {
      return (
        <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800 dark:bg-red-900/20 dark:text-red-300">
          Admin
        </span>
      );
    }
    if (role === "user") {
      return (
        <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-900/20 dark:text-blue-300">
          User
        </span>
      );
    }
    return (
      <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-800 dark:bg-gray-900/20 dark:text-gray-300">
        System
      </span>
    );
  };

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card/70 p-6 backdrop-blur">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Activity Logs</h2>
          <p className="text-sm text-muted-foreground">
            Login and task activities • {pagination.total} total entries
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => loadLogs(pagination.page, filter)}
          disabled={loading}
        >
          <RefreshCw className={`mr-2 size-4 ${loading ? "animate-spin" : ""}`} />
          {loading ? "Loading..." : "Refresh"}
        </Button>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 border-b border-border">
        <button
          onClick={() => handleFilterChange("all")}
          className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
            filter === "all"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          All
        </button>
        <button
          onClick={() => handleFilterChange("login")}
          className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
            filter === "login"
              ? "border-green-500 text-green-600 dark:text-green-400"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Login Activity
        </button>
        <button
          onClick={() => handleFilterChange("access")}
          className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
            filter === "access"
              ? "border-blue-500 text-blue-600 dark:text-blue-400"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Access
        </button>
        <button
          onClick={() => handleFilterChange("changes")}
          className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
            filter === "changes"
              ? "border-purple-500 text-purple-600 dark:text-purple-400"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Changes
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {error}
        </div>
      )}

      {loading && logs.length === 0 ? (
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <RefreshCw className="mx-auto size-8 animate-spin text-muted-foreground" />
            <p className="mt-2 text-sm text-muted-foreground">Loading activity logs...</p>
          </div>
        </div>
      ) : logs.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-muted/20 p-8 text-center">
          <p className="text-sm text-muted-foreground">No activity logs found</p>
        </div>
      ) : (
        <div className="space-y-2">
          {logs.map((log) => (
            <div
              key={log.id}
              className="rounded-lg border border-border bg-background p-4 transition-colors hover:bg-muted/30"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${getActionBadgeColor(
                        log.actionType
                      )}`}
                    >
                      {log.action}
                    </span>
                    {getRoleBadge(log.userRole)}
                    <span className="text-sm font-medium text-foreground">
                      {log.userName}
                    </span>
                    <span className="text-xs text-muted-foreground">({log.userEmail})</span>
                  </div>
                  
                  {log.details && Object.keys(log.details).length > 0 && (
                    <div className="text-xs text-muted-foreground">
                      {Object.entries(log.details).map(([key, value]) => (
                        <span key={key} className="mr-3">
                          <strong>{key}:</strong> {String(value)}
                        </span>
                      ))}
                    </div>
                  )}
                  
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span title={log.exactTime} className="cursor-help">
                      🕐 {log.formattedTime}
                    </span>
                    <span className="font-mono text-[10px]">
                      {log.exactTime}
                    </span>
                    {log.ipAddress && <span>📍 {log.ipAddress}</span>}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-border pt-4">
          <div className="text-sm text-muted-foreground">
            Page {pagination.page} of {pagination.totalPages} • Showing {logs.length} of{" "}
            {pagination.total} entries
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePageChange(pagination.page - 1)}
              disabled={!pagination.hasPrev || loading}
            >
              <ChevronLeft className="size-4" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePageChange(pagination.page + 1)}
              disabled={!pagination.hasNext || loading}
            >
              Next
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
