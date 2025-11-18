"use client";

import { useState, useEffect, useCallback } from "react";
import { Lock, Unlock, ExternalLink } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ApplicationLoginSetting } from "@/app/api/applications/login-settings/route";

export function ApplicationLoginManagement() {
  const [settings, setSettings] = useState<ApplicationLoginSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [editing, setEditing] = useState<Record<string, boolean>>({});
  const [editForms, setEditForms] = useState<Record<string, Partial<ApplicationLoginSetting>>>({});

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/applications/login-settings");
      if (!response.ok) {
        throw new Error("Failed to load application login settings");
      }
      const data = await response.json();
      setSettings(data.settings || []);
    } catch (err) {
      console.error("Load application login settings error", err);
      setError("Unable to load application login settings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const handleToggleOwnLogin = async (setting: ApplicationLoginSetting) => {
    const toolSlug = setting.tool_slug;
    setSaving((prev) => ({ ...prev, [toolSlug]: true }));
    setError(null);

    try {
      const response = await fetch("/api/applications/login-settings", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tool_slug: toolSlug,
          use_own_login: !setting.use_own_login,
          login_url: setting.login_url,
          logout_url: setting.logout_url,
        }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Failed to update setting");
      }

      await loadSettings();
    } catch (err) {
      console.error("Toggle own login error", err);
      setError(err instanceof Error ? err.message : "Unable to update setting");
    } finally {
      setSaving((prev) => ({ ...prev, [toolSlug]: false }));
    }
  };

  const handleStartEdit = (setting: ApplicationLoginSetting) => {
    setEditing((prev) => ({ ...prev, [setting.tool_slug]: true }));
    setEditForms((prev) => ({
      ...prev,
      [setting.tool_slug]: {
        login_url: setting.login_url || "",
        logout_url: setting.logout_url || "",
      },
    }));
  };

  const handleCancelEdit = (toolSlug: string) => {
    setEditing((prev) => {
      const newState = { ...prev };
      delete newState[toolSlug];
      return newState;
    });
    setEditForms((prev) => {
      const newState = { ...prev };
      delete newState[toolSlug];
      return newState;
    });
  };

  const handleSaveEdit = async (setting: ApplicationLoginSetting) => {
    const toolSlug = setting.tool_slug;
    const form = editForms[toolSlug];
    if (!form) return;

    setSaving((prev) => ({ ...prev, [toolSlug]: true }));
    setError(null);

    try {
      const response = await fetch("/api/applications/login-settings", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tool_slug: toolSlug,
          use_own_login: setting.use_own_login,
          login_url: form.login_url || null,
          logout_url: form.logout_url || null,
        }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Failed to update setting");
      }

      await loadSettings();
      handleCancelEdit(toolSlug);
    } catch (err) {
      console.error("Save edit error", err);
      setError(err instanceof Error ? err.message : "Unable to update setting");
    } finally {
      setSaving((prev) => ({ ...prev, [toolSlug]: false }));
    }
  };

  const handleFormChange = (toolSlug: string, field: keyof ApplicationLoginSetting, value: string) => {
    setEditForms((prev) => ({
      ...prev,
      [toolSlug]: {
        ...prev[toolSlug],
        [field]: value,
      },
    }));
  };

  if (loading) {
    return (
      <Card className="border-border/80 bg-card/70 backdrop-blur">
        <CardContent className="py-8">
          <p className="text-center text-muted-foreground">Loading application login settings...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/80 bg-card/70 backdrop-blur">
      <CardHeader className="flex flex-row items-center gap-3">
        <Lock className="size-6 text-primary" />
        <div>
          <CardTitle>Application Login Management</CardTitle>
          <CardDescription>
            Configure which applications use their own login system or the project-hub login.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="space-y-3">
          {settings.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground">No applications found.</p>
          ) : (
            settings.map((setting) => {
              const isEditing = editing[setting.tool_slug];
              const form = editForms[setting.tool_slug];
              const isSaving = saving[setting.tool_slug];

              return (
                <div
                  key={setting.id}
                  className="rounded-lg border border-border bg-background/50 p-4"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h4 className="font-semibold">{setting.tool_name}</h4>
                        <span className="text-xs text-muted-foreground">({setting.tool_slug})</span>
                      </div>

                      {isEditing ? (
                        <div className="space-y-2 mt-3">
                          <div>
                            <label className="text-xs font-medium text-muted-foreground mb-1 block">
                              Login URL (optional)
                            </label>
                            <Input
                              type="url"
                              value={form?.login_url || ""}
                              onChange={(e) =>
                                handleFormChange(setting.tool_slug, "login_url", e.target.value)
                              }
                              placeholder="https://example.com/login"
                              className="text-sm"
                            />
                          </div>
                          <div>
                            <label className="text-xs font-medium text-muted-foreground mb-1 block">
                              Logout URL (optional)
                            </label>
                            <Input
                              type="url"
                              value={form?.logout_url || ""}
                              onChange={(e) =>
                                handleFormChange(setting.tool_slug, "logout_url", e.target.value)
                              }
                              placeholder="https://example.com/logout"
                              className="text-sm"
                            />
                          </div>
                          <div className="flex gap-2 mt-3">
                            <Button
                              size="sm"
                              onClick={() => handleSaveEdit(setting)}
                              disabled={isSaving}
                            >
                              {isSaving ? "Saving..." : "Save"}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleCancelEdit(setting.tool_slug)}
                              disabled={isSaving}
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-1 mt-2">
                          <div className="flex items-center gap-2 text-sm">
                            <span className="text-muted-foreground">Status:</span>
                            <span
                              className={`font-medium ${
                                setting.use_own_login ? "text-orange-600 dark:text-orange-400" : "text-green-600 dark:text-green-400"
                              }`}
                            >
                              {setting.use_own_login ? "Uses Own Login" : "Uses Project-Hub Login"}
                            </span>
                          </div>
                          {setting.use_own_login && (
                            <div className="space-y-1 text-xs text-muted-foreground">
                              {setting.login_url && (
                                <div className="flex items-center gap-1">
                                  <ExternalLink className="size-3" />
                                  <span>Login: {setting.login_url}</span>
                                </div>
                              )}
                              {setting.logout_url && (
                                <div className="flex items-center gap-1">
                                  <ExternalLink className="size-3" />
                                  <span>Logout: {setting.logout_url}</span>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {!isEditing && (
                      <div className="flex flex-col gap-2">
                        <Button
                          size="sm"
                          variant={setting.use_own_login ? "outline" : "default"}
                          onClick={() => handleToggleOwnLogin(setting)}
                          disabled={isSaving}
                          className="min-w-[140px]"
                        >
                          {isSaving ? (
                            "Saving..."
                          ) : setting.use_own_login ? (
                            <>
                              <Unlock className="size-4 mr-2" />
                              Remove Own Login
                            </>
                          ) : (
                            <>
                              <Lock className="size-4 mr-2" />
                              Add Own Login
                            </>
                          )}
                        </Button>
                        {setting.use_own_login && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleStartEdit(setting)}
                            disabled={isSaving}
                          >
                            Edit URLs
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="mt-4 rounded-md border border-border/50 bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
          <p className="font-medium mb-1">Note:</p>
          <ul className="list-disc list-inside space-y-1">
            <li>
              When &quot;Uses Own Login&quot; is enabled, the application will handle its own authentication.
            </li>
            <li>
              When &quot;Uses Project-Hub Login&quot; is enabled, users must be logged into the project-hub to access the application.
            </li>
            <li>
              Login and Logout URLs are optional and only used when the application uses its own login.
            </li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}

