import { redirect } from 'next/navigation';
import { getSessionUserFromCookies } from '@/lib/auth/session';

// Protect all tool pages with authentication
export default async function ToolsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Server-side authentication check for all tools
  const user = await getSessionUserFromCookies();
  
  if (!user) {
    // Get the current path to redirect back after login
    // Note: In layout, we can't easily get the path, so we'll redirect to home
    // Individual pages can handle their own redirects
    redirect('/login?redirect=/tools');
  }
  
  return <>{children}</>;
}

