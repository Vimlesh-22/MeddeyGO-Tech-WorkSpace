import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { SessionProvider } from "@/contexts/SessionContext";
import { NotificationContainer } from "@/components/ui/NotificationPopup";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap", // Improve font loading behavior
  preload: true, // Explicitly enable preload
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap", // Improve font loading behavior
  preload: true, // Explicitly enable preload
});

export const metadata: Metadata = {
  title: "MeddeyGo Automation",
  description:
    "Centralized automation hub for MeddeyGo operations. Launch applications from one unified dashboard.",
};

export const dynamic = "force-dynamic";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} min-h-screen bg-background text-foreground antialiased`}
      >
        <ThemeProvider>
          <SessionProvider>
            {children}
            <NotificationContainer 
              position="top-right" 
              autoDismiss={15000} 
              maxNotifications={3} 
            />
          </SessionProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
