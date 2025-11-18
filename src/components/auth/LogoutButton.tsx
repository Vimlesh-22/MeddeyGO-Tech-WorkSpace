"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSession } from "@/contexts/SessionContext";

export function LogoutButton() {
  const router = useRouter();
  const { refresh } = useSession();
  const [loading, setLoading] = useState(false);

  const handleLogout = async () => {
    setLoading(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      await refresh();
      router.push("/login");
      router.refresh();
    } catch (error) {
      console.error("Logout failed", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button variant="outline" size="sm" onClick={handleLogout} disabled={loading}>
      <LogOut className="mr-2 size-4" />
      {loading ? "Signing out…" : "Sign out"}
    </Button>
  );
}
