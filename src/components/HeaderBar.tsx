"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { LayoutDashboard } from "lucide-react";
import { useSession } from "@/contexts/SessionContext";
import { Button } from "@/components/ui/button";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { ThemeControls } from "@/components/ThemeControls";

export function HeaderBar() {
  const { user, loading } = useSession();
  const router = useRouter();

  return (
    <header className="flex items-center justify-between rounded-2xl border border-border bg-card/60 p-4 backdrop-blur">
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <Image
          src="https://meddey.com/cdn/shop/files/Meddey_1_a9e7c93d-6b1b-4d73-b4cb-bb110a73204f.png"
          alt="Meddey"
          width={24}
          height={24}
          className="h-6 w-auto rounded"
        />
        <LayoutDashboard className="size-5 text-primary" />
        <div className="flex flex-col leading-tight">
          <span className="font-semibold text-foreground">MeddeyGo Workspace</span>
          {loading ? (
            <span className="text-xs text-muted-foreground">Loading session…</span>
          ) : user ? (
            <span className="text-xs text-muted-foreground">Signed in as {user.displayName ?? user.email}</span>
          ) : (
            <span className="text-xs text-muted-foreground">Authentication required</span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <ThemeControls />
        {user ? (
          <>
            <Button variant="outline" size="sm" onClick={() => router.push("/settings")}>Settings</Button>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/" prefetch={false}>Apps</Link>
            </Button>
            <LogoutButton />
          </>
        ) : (
          <Button variant="default" size="sm" onClick={() => router.push("/login")}>Login</Button>
        )}
      </div>
    </header>
  );
}
