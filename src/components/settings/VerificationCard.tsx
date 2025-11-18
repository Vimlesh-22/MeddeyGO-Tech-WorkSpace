"use client";

import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export type VerificationCardProps = {
  email: string;
  verificationType: "user_verify" | "admin_confirm";
  title: string;
  description: string;
  successMessage?: string;
};

export function VerificationCard({
  email,
  verificationType,
  title,
  description,
  successMessage = "Code accepted."
}: VerificationCardProps) {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleVerify = async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch("/api/auth/verify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, code, type: verificationType }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? "Unable to verify code");
        return;
      }

      setSuccess(successMessage);
      setCode("");
    } catch (verifyError) {
      console.error("Verification error", verifyError);
      setError("Unable to verify code. Try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-card/70 p-6 backdrop-blur">
      <div className="space-y-1">
        <h3 className="text-lg font-semibold text-foreground">{title}</h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="flex flex-col gap-3 md:flex-row">
        <Input
          value={code}
          onChange={(event) => setCode(event.target.value)}
          placeholder="6-digit code"
          maxLength={6}
          inputMode="numeric"
          className="md:w-48"
        />
        <Button onClick={handleVerify} disabled={loading || code.length !== 6}>
          {loading ? "Verifying…" : "Verify code"}
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {success && (
        <p className="flex items-center gap-2 text-sm text-emerald-500">
          <CheckCircle2 className="size-4" /> {success}
        </p>
      )}
    </div>
  );
}
