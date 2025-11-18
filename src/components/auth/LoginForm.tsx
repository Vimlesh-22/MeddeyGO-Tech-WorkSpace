"use client";

import { FormEvent, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Mail, KeyRound, ShieldCheck, RefreshCw, Eye, EyeOff, AlertTriangle } from "lucide-react";
import { useSession } from "@/contexts/SessionContext";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { validatePasswordStrength, sanitizeInput } from "@/lib/security/encryption";

type LoginMethod = "password" | "otp";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { refresh } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [loginMethod, setLoginMethod] = useState<LoginMethod>("password");
  const [showPassword, setShowPassword] = useState(false);
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [otpLoading, setOtpLoading] = useState(false);
  const [resetMode, setResetMode] = useState(false);
  const [resetCode, setResetCode] = useState("");
  const [resetPassword, setResetPassword] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [autoLoginAttempted, setAutoLoginAttempted] = useState(false);
  const [passwordStrength, setPasswordStrength] = useState<{
    isValid: boolean;
    strength: string;
    issues: string[];
  } | null>(null);

  // Validate password strength when typing new password
  useEffect(() => {
    if (resetMode && resetPassword) {
      const strength = validatePasswordStrength(resetPassword);
      setPasswordStrength(strength);
    } else {
      setPasswordStrength(null);
    }
  }, [resetPassword, resetMode]);

  // Handle direct links from email (OTP, reset code, verification)
  useEffect(() => {
    if (autoLoginAttempted) return;

    const emailParam = searchParams.get("email");
    const otpParam = searchParams.get("otp");
    const resetCodeParam = searchParams.get("resetCode");
    const verifyParam = searchParams.get("verify");

    if (!emailParam) return;

    // Auto-fill email
    setEmail(emailParam);
    setAutoLoginAttempted(true);

    // Handle OTP direct login
    if (otpParam) {
      setLoginMethod("otp");
      setOtp(otpParam);
      setInfo("🔗 Auto-filling OTP from email link...");
      
      // Auto-submit OTP login after a brief delay
      setTimeout(async () => {
        try {
          setLoading(true);
          const response = await fetch("/api/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email: emailParam,
              otp: otpParam,
              method: "otp",
            }),
          });

          if (!response.ok) {
            const body = (await response.json().catch(() => null)) as { error?: string } | null;
            setError(body?.error ?? "OTP login failed. Please try again.");
            return;
          }

          await refresh();
          // Check for redirect parameter
          const redirectTo = searchParams.get("redirect") || "/";
          router.push(redirectTo);
          router.refresh();
        } catch (err) {
          console.error("Auto OTP login failed", err);
          setError("Unable to auto-login. Please submit manually.");
        } finally {
          setLoading(false);
        }
      }, 500);
    }
    
    // Handle password reset code
    else if (resetCodeParam) {
      setLoginMethod("password");
      setResetMode(true);
      setResetCode(resetCodeParam);
      setInfo("🔗 Reset code auto-filled from email. Enter your new password below.");
    }
    
    // Handle verification code
    else if (verifyParam) {
      setInfo("🔗 Auto-verifying your account from email link...");
      
      // Auto-submit verification
      setTimeout(async () => {
        try {
          setLoading(true);
          const response = await fetch("/api/auth/verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email: emailParam,
              code: verifyParam,
            }),
          });

          if (!response.ok) {
            const body = (await response.json().catch(() => null)) as { error?: string } | null;
            setError(body?.error ?? "Verification failed. Please contact administrator.");
            return;
          }

          setInfo("✅ Account verified successfully! You can now sign in with your password.");
          setLoginMethod("password");
        } catch (err) {
          console.error("Auto verification failed", err);
          setError("Unable to auto-verify. Please contact administrator.");
        } finally {
          setLoading(false);
        }
      }, 500);
    }
  }, [searchParams, autoLoginAttempted, refresh, router]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setInfo(null);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: email.trim(),
          password: loginMethod === "password" ? password : undefined,
          otp: loginMethod === "otp" ? otp.trim().replace(/\D/g, '') : undefined,
          method: loginMethod,
        }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? "Login failed. Check your credentials.");
        return;
      }

      await refresh();
      // Check for redirect parameter
      const redirectTo = searchParams.get("redirect") || "/";
      router.push(redirectTo);
      router.refresh();
    } catch (submissionError) {
      console.error("Login failed", submissionError);
      setError("Unable to reach the server. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleRequestOtp = async () => {
    setOtpLoading(true);
    setError(null);
    setInfo(null);

    try {
      const response = await fetch("/api/auth/request-otp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email: email.trim() }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? "Unable to send OTP.");
        return;
      }

      setInfo("OTP sent to your email. It remains valid for 10 minutes.");
    } catch (otpError) {
      console.error("OTP request error", otpError);
      setError("Unable to send OTP. Please try again.");
    } finally {
      setOtpLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    setOtpLoading(true);
    setError(null);
    setInfo(null);

    try {
      const response = await fetch("/api/auth/forgot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? "Unable to send reset code.");
        return;
      }

      setInfo("Reset code sent. Enter the code and new password below.");
      setResetMode(true);
    } catch (forgotError) {
      console.error("Forgot password error", forgotError);
      setError("Unable to send reset code. Try again later.");
    } finally {
      setOtpLoading(false);
    }
  };

  const handleResetPassword = async () => {
    const trimmedEmail = email.trim();
    const trimmedCode = resetCode.trim().replace(/\D/g, ''); // Remove non-digits
    
    if (!trimmedEmail || !trimmedCode || !resetPassword) {
      setError("Please fill in all fields.");
      return;
    }
    
    if (trimmedCode.length !== 6) {
      setError("Reset code must be exactly 6 digits.");
      return;
    }

    // Validate password strength
    const strength = validatePasswordStrength(resetPassword);
    if (!strength.isValid) {
      setError(`Password too weak: ${strength.issues.join(", ")}`);
      return;
    }

    setResetLoading(true);
    setError(null);
    setInfo(null);

    try {
      const response = await fetch("/api/auth/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          email: sanitizeInput(trimmedEmail), 
          code: sanitizeInput(trimmedCode), 
          password: resetPassword // Don't sanitize password, keep original
        }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? "Unable to reset password.");
        return;
      }

      const result = await response.json();
      
      if (result.fallbackMode) {
        setInfo(result.message);
      } else {
        setInfo("✅ Password updated successfully! You can now sign in with your new password.");
        setResetMode(false);
        setResetCode("");
        setResetPassword("");
        setLoginMethod("password");
      }
    } catch (resetError) {
      console.error("Reset password error", resetError);
      setError("Unable to reset password. Check the code and try again.");
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <form className="space-y-4" onSubmit={handleSubmit}>
        <div className="flex items-center justify-between rounded-md border border-border bg-muted/40 p-2 text-xs uppercase tracking-wide text-muted-foreground">
          <button
            type="button"
            className={`flex-1 rounded-md px-3 py-2 transition ${loginMethod === "password" ? "bg-background text-foreground" : "hover:bg-muted/60"}`}
            onClick={() => setLoginMethod("password")}
          >
            <KeyRound className="mr-2 inline size-4" /> Password
          </button>
          <button
            type="button"
            className={`flex-1 rounded-md px-3 py-2 transition ${loginMethod === "otp" ? "bg-background text-foreground" : "hover:bg-muted/60"}`}
            onClick={() => setLoginMethod("otp")}
          >
            <ShieldCheck className="mr-2 inline size-4" /> OTP
          </button>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground" htmlFor="email">
            Email
          </label>
          <div className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2">
            <Mail className="size-4 text-muted-foreground" />
            <Input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value.trim())}
              onBlur={(event) => setEmail(event.target.value.trim())}
              className="border-none bg-transparent px-0 shadow-none focus-visible:ring-0"
              placeholder="you@meddey.co.in"
            />
          </div>
        </div>

        {loginMethod === "password" ? (
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground" htmlFor="password">
              Password
            </label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                required
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="bg-background pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground" htmlFor="otp">
              One-time passcode
            </label>
            <Input
              id="otp"
              type="text"
              inputMode="numeric"
              required
              maxLength={6}
              value={otp}
              onChange={(event) => {
                // Remove spaces and non-numeric characters, keep only digits
                const cleanValue = event.target.value.replace(/\D/g, '').trim();
                setOtp(cleanValue);
              }}
              onBlur={(event) => {
                // Trim spaces when field loses focus
                setOtp(event.target.value.trim().replace(/\D/g, ''));
              }}
              className="bg-background"
              placeholder="6-digit code"
            />
            <Button type="button" variant="outline" size="sm" onClick={handleRequestOtp} disabled={otpLoading || !email}>
              {otpLoading ? (
                <span className="flex items-center gap-2"><RefreshCw className="size-4 animate-spin" /> Sending OTP...</span>
              ) : (
                <span className="flex items-center gap-2"><Mail className="size-4" /> Send OTP to Email</span>
              )}
            </Button>
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}
        {info && <p className="text-sm text-emerald-500">{info}</p>}

        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Signing in…" : "Sign in"}
        </Button>

        <div className="text-xs text-muted-foreground">
          <button
            type="button"
            className="underline"
            onClick={() => {
              setLoginMethod("password");
              setResetMode(false);
              void handleForgotPassword();
            }}
            disabled={!email || otpLoading}
          >
            Forgot password? Send reset code
          </button>
        </div>
      </form>

      {resetMode && (
        <div className="space-y-3 rounded-lg border border-border bg-card/60 p-4">
          <h3 className="text-sm font-semibold text-foreground">🔒 Reset Password</h3>
          <p className="text-xs text-muted-foreground">
            Enter the reset code from your email plus a new password to finish the reset.
          </p>
          
          <div className="space-y-2">
            <label className="text-xs font-medium text-foreground">Reset Code</label>
            <Input
              placeholder="6-digit code"
              value={resetCode}
              onChange={(event) => {
                // Remove spaces and non-numeric characters, keep only digits
                const cleanValue = event.target.value.replace(/\D/g, '').trim();
                setResetCode(cleanValue);
              }}
              onBlur={(event) => {
                // Trim spaces when field loses focus
                setResetCode(event.target.value.trim().replace(/\D/g, ''));
              }}
              maxLength={6}
              inputMode="numeric"
              className="bg-background"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-foreground">New Password</label>
            <div className="relative">
              <Input
                placeholder="Minimum 8 characters"
                type={showResetPassword ? "text" : "password"}
                value={resetPassword}
                onChange={(event) => setResetPassword(event.target.value)}
                className="bg-background pr-10"
              />
              <button
                type="button"
                onClick={() => setShowResetPassword(!showResetPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition"
                aria-label={showResetPassword ? "Hide password" : "Show password"}
              >
                {showResetPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>

            {/* Password Strength Indicator */}
            {passwordStrength && resetPassword.length > 0 && (
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <div className="h-1 flex-1 rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full transition-all ${
                        passwordStrength.strength === "very-strong" ? "bg-emerald-500 w-full" :
                        passwordStrength.strength === "strong" ? "bg-green-500 w-3/4" :
                        passwordStrength.strength === "medium" ? "bg-yellow-500 w-1/2" :
                        "bg-red-500 w-1/4"
                      }`}
                    />
                  </div>
                  <span className={`text-xs font-medium ${
                    passwordStrength.strength === "very-strong" || passwordStrength.strength === "strong" 
                      ? "text-emerald-600" 
                      : passwordStrength.strength === "medium" 
                      ? "text-yellow-600" 
                      : "text-red-600"
                  }`}>
                    {passwordStrength.strength === "very-strong" ? "Very Strong" :
                     passwordStrength.strength === "strong" ? "Strong" :
                     passwordStrength.strength === "medium" ? "Medium" : "Weak"}
                  </span>
                </div>
                {passwordStrength.issues.length > 0 && (
                  <div className="text-xs text-muted-foreground flex items-start gap-1">
                    <AlertTriangle className="size-3 mt-0.5 flex-shrink-0" />
                    <span>{passwordStrength.issues.join(", ")}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          <Button 
            onClick={handleResetPassword} 
            disabled={resetLoading || !resetCode || !resetPassword || (passwordStrength !== null && !passwordStrength.isValid)}
            className="w-full"
          >
            {resetLoading ? (
              <span className="flex items-center gap-2">
                <RefreshCw className="size-4 animate-spin" /> Updating Password...
              </span>
            ) : (
              "🔑 Update Password"
            )}
          </Button>

          <button
            type="button"
            onClick={() => {
              setResetMode(false);
              setResetCode("");
              setResetPassword("");
              setError(null);
            }}
            className="w-full text-xs text-muted-foreground hover:text-foreground underline"
          >
            Cancel password reset
          </button>
        </div>
      )}
    </div>
  );
}
