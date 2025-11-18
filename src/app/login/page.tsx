import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LoginForm } from "@/components/auth/LoginForm";
import { getSessionUserFromCookies } from "@/lib/auth/session";
import { ThemeControls } from "@/components/ThemeControls";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string }>;
}) {
  const existing = await getSessionUserFromCookies();
  if (existing) {
    const params = await searchParams;
    const redirectTo = params?.redirect || "/";
    redirect(redirectTo);
  }

  return (
    <div className="min-h-screen bg-background text-foreground relative overflow-hidden">
      <div className="absolute right-6 top-6 z-30">
        <ThemeControls />
      </div>
      <div className="relative mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 z-20">
        <Card className="border-border/80 bg-card/80 backdrop-blur">
          <CardHeader>
            <CardTitle className="text-2xl">Sign in to MeddeyGO Tech Workspace</CardTitle>
            <CardDescription>Use your MeddeyGO Tech Workspace email and password.</CardDescription>
          </CardHeader>
          <CardContent>
            <LoginForm />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
