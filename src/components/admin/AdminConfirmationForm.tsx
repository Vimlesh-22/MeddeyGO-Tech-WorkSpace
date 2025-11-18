"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Send } from "lucide-react";

export function AdminConfirmationForm({ adminEmail }: { adminEmail: string }) {
  const [targetEmail, setTargetEmail] = useState("");
  const [code, setCode] = useState("");
  const [userOTP, setUserOTP] = useState("");
  const [loading, setLoading] = useState(false);
  const [sendingOTP, setSendingOTP] = useState<string | null>(null);
  const [verifyingUserOTP, setVerifyingUserOTP] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [userOTPVerified, setUserOTPVerified] = useState(false);

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
        body: JSON.stringify({ email: targetEmail.toLowerCase(), code, type: "admin_confirm" }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? "Unable to verify code.");
        return;
      }

      setSuccess(`Confirmation recorded for ${targetEmail}.`);
      setTargetEmail("");
      setCode("");
    } catch (verifyError) {
      console.error("Admin confirmation error", verifyError);
      setError("Unable to verify code. Try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleSendOTP = async (type: "admin_confirm" | "user_verify" | "both") => {
    if (!targetEmail) {
      setError("Please enter user email first");
      return;
    }

    setSendingOTP(type);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch("/api/auth/send-otp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email: targetEmail.toLowerCase(), type }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? "Unable to send OTP.");
        return;
      }

      const body = (await response.json()) as { message?: string };
      setSuccess(body.message ?? "OTP sent successfully");
      setTimeout(() => setSuccess(null), 3000);
    } catch (sendError) {
      console.error("Send OTP error", sendError);
      setError("Unable to send OTP. Try again.");
    } finally {
      setSendingOTP(null);
    }
  };

  const handleVerifyUserOTP = async () => {
    if (!targetEmail || !userOTP) {
      setError("Please enter user email and OTP code");
      return;
    }

    setVerifyingUserOTP(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/verify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email: targetEmail.toLowerCase(), code: userOTP, type: "user_verify" }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? "Unable to verify user OTP.");
        return;
      }

      setUserOTPVerified(true);
      setSuccess("✓ User email verified successfully!");
      setTimeout(() => setSuccess(null), 3000);
    } catch (verifyError) {
      console.error("Verify user OTP error", verifyError);
      setError("Unable to verify user OTP. Try again.");
    } finally {
      setVerifyingUserOTP(false);
    }
  };

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-card/70 p-6 backdrop-blur">
      <div className="space-y-1">
        <h3 className="text-lg font-semibold text-foreground">Finalize new user access</h3>
        <p className="text-sm text-muted-foreground">
          Enter the new user&rsquo;s email and send OTPs to both admin ({adminEmail}) and user. 
          Both parties must verify their codes to approve access.
        </p>
      </div>
      
      <Input
        placeholder="New user email"
        value={targetEmail}
        onChange={(event) => setTargetEmail(event.target.value)}
        type="email"
      />
      
      <div className="flex gap-2">
        <Button
          variant="outline"
          onClick={() => handleSendOTP("both")}
          disabled={!targetEmail || sendingOTP !== null}
          className="flex-1"
        >
          <Send className="mr-2 size-4" />
          {sendingOTP === "both" ? "Sending..." : "Send Both OTPs"}
        </Button>
        <Button
          variant="outline"
          onClick={() => handleSendOTP("admin_confirm")}
          disabled={!targetEmail || sendingOTP !== null}
          size="sm"
          title="Send admin confirmation code only"
        >
          {sendingOTP === "admin_confirm" ? "Sending..." : "Admin OTP"}
        </Button>
        <Button
          variant="outline"
          onClick={() => handleSendOTP("user_verify")}
          disabled={!targetEmail || sendingOTP !== null}
          size="sm"
          title="Send user verification code only"
        >
          {sendingOTP === "user_verify" ? "Sending..." : "User OTP"}
        </Button>
      </div>

      {/* User OTP Verification Section */}
      <div className="rounded-lg border border-purple-200 bg-purple-50/50 p-4 space-y-2">
        <h4 className="text-sm font-semibold text-purple-900">1. User Email Verification</h4>
        <p className="text-xs text-purple-700">User must verify their email with the OTP code sent to them</p>
        <div className="flex gap-2">
          <Input
            placeholder="User OTP code"
            value={userOTP}
            onChange={(event) => setUserOTP(event.target.value)}
            maxLength={6}
            inputMode="numeric"
            disabled={userOTPVerified}
            className="bg-white"
          />
          <Button 
            onClick={handleVerifyUserOTP} 
            disabled={verifyingUserOTP || userOTP.length !== 6 || !targetEmail || userOTPVerified}
            variant={userOTPVerified ? "default" : "outline"}
            className={userOTPVerified ? "bg-green-600 hover:bg-green-700" : ""}
          >
            {userOTPVerified ? "✓ Verified" : verifyingUserOTP ? "Verifying..." : "Verify User OTP"}
          </Button>
        </div>
      </div>

      {/* Admin Confirmation Section */}
      <div className="rounded-lg border border-pink-200 bg-pink-50/50 p-4 space-y-2">
        <h4 className="text-sm font-semibold text-pink-900">2. Admin Confirmation</h4>
        <p className="text-xs text-pink-700">Enter the confirmation code sent to your email</p>
        <Input
          placeholder="Admin confirmation code"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          maxLength={6}
          inputMode="numeric"
          className="bg-white"
        />
        <Button 
          onClick={handleVerify} 
          disabled={loading || code.length !== 6 || !targetEmail || !userOTPVerified}
          className="w-full"
        >
          {loading ? "Confirming..." : "Confirm User Access"}
        </Button>
        {!userOTPVerified && (
          <p className="text-xs text-amber-600">⚠️ User must verify their email first</p>
        )}
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
