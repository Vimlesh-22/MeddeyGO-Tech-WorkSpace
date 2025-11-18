"use client";

import { useCallback, useEffect, useState } from "react";
import { History } from "lucide-react";
import type { ActivityLogEntry } from "@/lib/auth/types";
import { Button } from "@/components/ui/button";

function formatDate(value: string) {
  return new Date(value).toLocaleString();
}

export function ActivityLogViewer() {
  const [entries, setEntries] = useState<ActivityLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadLogs = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const response = await fetch("/api/activity", { cache: "no-store" });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? "Unable to load activity logs");
        return;
      }

      const body = (await response.json()) as { logs: ActivityLogEntry[] };
      setEntries(body.logs);
    } catch (loadError) {
      console.error("Load activity error", loadError);
      setError("Unable to load activity logs");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadLogs();
  }, [loadLogs]);

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card/70 p-6 backdrop-blur">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <History className="size-5 text-primary" />
          <h2 className="text-lg font-semibold text-foreground">Activity logs</h2>
        </div>
        <Button variant="outline" size="sm" onClick={() => loadLogs()} disabled={refreshing}>
          {refreshing ? "Refreshing…" : "Refresh"}
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading activity…</p>
      ) : entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">No activity recorded yet.</p>
      ) : (
        <ul className="space-y-3 text-sm">
          {entries.map((entry) => (
            <li
              key={entry.id}
              className="rounded-lg border border-border/60 bg-background/60 px-4 py-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium text-foreground">{entry.action}</span>
                <span className="text-xs text-muted-foreground">{formatDate(entry.createdAt)}</span>
              </div>
              <div className="text-xs text-muted-foreground">
                {entry.userEmail ? `Triggered by ${entry.userEmail}` : "System"}
              </div>
              {entry.metadata && (
                <pre className="mt-2 overflow-x-auto rounded bg-muted/40 p-2 text-xs">
                  {JSON.stringify(entry.metadata, null, 2)}
                </pre>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
