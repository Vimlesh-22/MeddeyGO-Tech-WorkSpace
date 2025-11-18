import { redirect } from "next/navigation";
import { HeaderBar } from "@/components/HeaderBar";
import { getSessionUserFromCookies } from "@/lib/auth/session";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EnhancedAdminPanel } from "@/components/admin/EnhancedAdminPanel";
import { VerificationCard } from "@/components/settings/VerificationCard";
import { EnhancedDevSettings } from "@/components/settings/EnhancedDevSettings";

export default async function SettingsPage() {
  const user = await getSessionUserFromCookies();
  if (!user) {
    redirect("/login");
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.15),_transparent_55%)] dark:bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.18),_transparent_55%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_80%,_rgba(244,114,182,0.06),_transparent_55%)] dark:bg-[radial-gradient(circle_at_20%_80%,_rgba(244,114,182,0.08),_transparent_55%)]" />

      <main className="relative mx-auto flex min-h-screen max-w-5xl flex-col gap-10 px-6 pb-24 pt-16 sm:px-10 lg:px-16">
        <HeaderBar />

        <section className="grid gap-6 md:grid-cols-2">
          <Card className="border-border/80 bg-card/70 backdrop-blur">
            <CardHeader>
              <CardTitle>Account</CardTitle>
              <CardDescription>Your personal Meddey Tech Workspace credentials.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <span className="text-muted-foreground">Email</span>
                <p className="font-medium text-foreground">{user.email}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Display name</span>
                <p className="font-medium text-foreground">
                  {user.displayName ?? "Not set"}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">Role</span>
                <p className="font-medium capitalize text-foreground">{user.role}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Password</span>
                <p className="font-mono text-sm text-foreground">
                  {user.passwordPlain ?? "Hidden by admin policy"}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">Verification status</span>
                <p className="font-medium text-foreground">
                  {user.emailVerified ? "Email verified" : "Email pending verification"}
                  {" • "}
                  {user.adminConfirmed ? "Admin confirmed" : "Awaiting admin approval"}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/80 bg-card/70 backdrop-blur">
            <CardHeader>
              <CardTitle>Support</CardTitle>
              <CardDescription>Need access updates? Contact the automation team.</CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Updates to your account are handled by admins in this console. Reach out if you need role or password resets.
            </CardContent>
          </Card>
        </section>

        {!user.emailVerified && (
          <VerificationCard
            email={user.email}
            verificationType="user_verify"
            title="Complete your email verification"
            description="Check your inbox for the Meddey Tech Workspace verification code and enter it below."
            successMessage="Email marked as verified."
          />
        )}

        {user.role !== "admin" && !user.adminConfirmed && (
          <Card className="border-border/80 bg-card/70 backdrop-blur">
            <CardHeader>
              <CardTitle>Waiting for admin approval</CardTitle>
              <CardDescription>
                An administrator must confirm your onboarding code before you can access the full dashboard. They should complete this from their admin console using the code emailed to them.
              </CardDescription>
            </CardHeader>
          </Card>
        )}

        {(user.role === "admin" || user.role === "dev") && (
          <Tabs defaultValue={user.role === "admin" ? "admin" : "dev"} className="w-full">
            <TabsList>
              {user.role === "admin" && <TabsTrigger value="admin">Admin Panel</TabsTrigger>}
              <TabsTrigger value="dev">Dev Panel</TabsTrigger>
            </TabsList>
            {user.role === "admin" && (
              <TabsContent value="admin">
                <EnhancedAdminPanel adminEmail={user.email} />
              </TabsContent>
            )}
            <TabsContent value="dev">
              <EnhancedDevSettings />
            </TabsContent>
          </Tabs>
        )}

        {user.role !== "admin" && user.role !== "dev" && (
          <Card className="border-border/80 bg-card/70 backdrop-blur">
            <CardHeader>
              <CardTitle>Admin/Dev access required</CardTitle>
              <CardDescription>
                Only admins and devs can manage settings. Contact an admin if you require elevated access.
              </CardDescription>
            </CardHeader>
          </Card>
        )}
      </main>
    </div>
  );
}
