"use client";

import { FormEvent, useState } from "react";
import { BadgeCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type AdminUnlockFormProps = {
  adminEmail: string;
  unlocked: boolean;
  onUnlocked: () => void;
};

export function AdminUnlockForm({ adminEmail, unlocked, onUnlocked }: AdminUnlockFormProps) {
  const [email, setEmail] = useState(adminEmail);
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const response = await fetch("/api/admin/verify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? "Unable to verify admin credentials.");
        return;
      }

      setSuccessMessage("Admin console unlocked.");
      onUnlocked();
      setPassword("");
    } catch (submissionError) {
      console.error("Admin verify error", submissionError);
      setError("Unable to reach the server. Try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground" htmlFor="admin-email">
            Admin email
          </label>
          <Input
            id="admin-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            autoComplete="email"
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground" htmlFor="admin-password">
            Admin password
          </label>
          <Input
            id="admin-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            autoComplete="current-password"
          />
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {successMessage && (
        <p className="flex items-center gap-2 text-sm text-emerald-500">
          <BadgeCheck className="size-4" /> {successMessage}
        </p>
      )}

      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Access is restricted. Admin approval is required before modifying users or logs.
        </p>
        <Button type="submit" disabled={loading || unlocked}>
          {unlocked ? "Unlocked" : loading ? "Verifying…" : "Unlock"}
        </Button>
      </div>
    </form>
  );
}
