"use client";

import { useState, useEffect } from "react";
import { ShieldCheck, Settings } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AdminUnlockForm } from "@/components/admin/AdminUnlockForm";
import { UserManagement } from "@/components/admin/UserManagement";
import { ActivityLogs } from "@/components/admin/ActivityLogs";
import { AdminConfirmationForm } from "@/components/admin/AdminConfirmationForm";
import { ApplicationLoginManagement } from "@/components/admin/ApplicationLoginManagement";

export function AdminPanel({ adminEmail }: { adminEmail: string }) {
  const [unlocked, setUnlocked] = useState(false);
  const [disableTour, setDisableTour] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function fetchPreferences() {
      try {
        const response = await fetch('/api/user/preferences');
        if (response.ok) {
          const data = await response.json();
          setDisableTour(data.preferences?.disableWelcomeTour || false);
        }
      } catch (error) {
        console.error('Error fetching preferences:', error);
      } finally {
        setLoading(false);
      }
    }
    fetchPreferences();
  }, []);

  const handleToggleTour = async () => {
    setSaving(true);
    try {
      const newValue = !disableTour;
      const response = await fetch('/api/user/preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ disableWelcomeTour: newValue }),
      });
      if (response.ok) {
        setDisableTour(newValue);
      }
    } catch (error) {
      console.error('Error updating preferences:', error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="border-border/80 bg-card/70 backdrop-blur">
        <CardHeader className="flex flex-row items-center gap-3">
          <ShieldCheck className="size-6 text-primary" />
          <div>
            <CardTitle>Admin Console</CardTitle>
            <CardDescription>
              Verify your admin credentials to manage Meddey Tech Workspace users and audit activity logs.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <AdminUnlockForm
            adminEmail={adminEmail}
            unlocked={unlocked}
            onUnlocked={() => setUnlocked(true)}
          />
        </CardContent>
      </Card>

      {unlocked && (
        <div className="space-y-6">
          <Card className="border-border/80 bg-card/70 backdrop-blur">
            <CardHeader className="flex flex-row items-center gap-3">
              <Settings className="size-6 text-primary" />
              <div>
                <CardTitle>User Preferences</CardTitle>
                <CardDescription>
                  Manage your personal preferences and settings.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Disable Welcome Tour</p>
                  <p className="text-sm text-muted-foreground">
                    When enabled, the welcome tour will not be shown on first login or when new tools are added.
                  </p>
                </div>
                <Button
                  onClick={handleToggleTour}
                  disabled={loading || saving}
                  variant={disableTour ? "default" : "outline"}
                >
                  {loading ? "Loading..." : saving ? "Saving..." : disableTour ? "Enabled" : "Disabled"}
                </Button>
              </div>
            </CardContent>
          </Card>
          <ApplicationLoginManagement />
          <AdminConfirmationForm adminEmail={adminEmail} />
          <UserManagement />
          <ActivityLogs />
        </div>
      )}
    </div>
  );
}
