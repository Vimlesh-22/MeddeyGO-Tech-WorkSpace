import { redirect } from "next/navigation";
import { HeaderBar } from "@/components/HeaderBar";
import { getSessionUserFromCookies } from "@/lib/auth/session";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BannerManager } from "@/components/account/BannerManager";
import { VideoManager } from "@/components/account/VideoManager";
import { ToolManager } from "@/components/account/ToolManager";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function AccountPage() {
  const user = await getSessionUserFromCookies();
  if (!user) {
    redirect("/login");
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.15),_transparent_55%)] dark:bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.18),_transparent_55%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_80%,_rgba(244,114,182,0.06),_transparent_55%)] dark:bg-[radial-gradient(circle_at_20%_80%,_rgba(244,114,182,0.08),_transparent_55%)]" />

      <main className="relative mx-auto flex min-h-screen max-w-6xl flex-col gap-10 px-6 pb-24 pt-16 sm:px-10 lg:px-16">
        <HeaderBar />

        <div className="flex flex-col gap-6">
          <div>
            <h1 className="text-4xl font-semibold leading-tight text-foreground">My Account</h1>
            <p className="mt-2 text-base leading-relaxed text-muted-foreground">
              Manage your banners, videos, tools, and customizations
            </p>
          </div>

          <Tabs defaultValue="banners" className="w-full">
            <TabsList>
              <TabsTrigger value="banners">Banners</TabsTrigger>
              <TabsTrigger value="videos">Videos</TabsTrigger>
              <TabsTrigger value="tools">Tools</TabsTrigger>
              <TabsTrigger value="customization">Customization</TabsTrigger>
            </TabsList>

            <TabsContent value="banners">
              <BannerManager />
            </TabsContent>

            <TabsContent value="videos">
              <VideoManager />
            </TabsContent>

            <TabsContent value="tools">
              <ToolManager />
            </TabsContent>

            <TabsContent value="customization">
              <Card>
                <CardHeader>
                  <CardTitle>System Customization</CardTitle>
                  <CardDescription>
                    Customize system elements like colors, themes, and display preferences
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    System customization features are managed through the Tools tab. Edit individual tools to customize their appearance and behavior.
                  </p>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  );
}

