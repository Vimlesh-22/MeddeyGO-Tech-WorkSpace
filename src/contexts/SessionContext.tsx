"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { SessionUser } from "@/lib/auth/types";

const SessionContext = createContext<{
  user: SessionUser | null;
  loading: boolean;
  refresh: () => Promise<void>;
}>({
  user: null,
  loading: true,
  refresh: async () => undefined,
});

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchSession = async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/session", { cache: "no-store" });
      if (!response.ok) {
        setUser(null);
        return;
      }

      const data = (await response.json()) as { user: SessionUser };
      setUser(data.user);
      
      // Load theme preferences after successful session
      try {
        const themeResponse = await fetch("/api/user/theme");
        if (themeResponse.ok) {
          const themeData = await themeResponse.json();
          
          // Apply theme mode (light/dark) to localStorage so ThemeContext picks it up
          if (themeData.themeMode && (themeData.themeMode === 'light' || themeData.themeMode === 'dark')) {
            localStorage.setItem('app-theme', themeData.themeMode);
            document.documentElement.classList.remove('dark', 'light');
            document.documentElement.classList.add(themeData.themeMode);
          }
        }
      } catch (themeError) {
        console.error("Failed to load theme preferences:", themeError);
      }
    } catch (error) {
      console.error("Failed to load session", error);
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchSession();
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      refresh: fetchSession,
    }),
    [user, loading],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  return useContext(SessionContext);
}
