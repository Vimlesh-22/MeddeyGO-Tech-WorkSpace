import { Suspense } from "react";
import Image from "next/image";
import { redirect } from "next/navigation";
import { projects } from "@/data/projects";
import { ProjectExplorer, type CategoryOption } from "@/components/project-explorer";
import { HeaderBar } from "@/components/HeaderBar";
import { getSessionUserFromCookies } from "@/lib/auth/session";
import { ensureDefaultAdmin } from "@/lib/auth/bootstrap";
import { TourWrapper } from "@/components/welcome/TourWrapper";

const categoryLabels = {
  automation: "Automation",
  data: "Data Tools",
  quotations: "Quotations",
  ai: "AI Assistants",
} as const;

const baseCategories = Array.from(
  new Set(projects.map((project) => project.category)),
) as (keyof typeof categoryLabels)[];

const categories: CategoryOption[] = [
  { value: "all", label: "All apps" },
  ...baseCategories.map((value) => ({
    value,
    label: categoryLabels[value],
  })),
];

export const dynamic = "force-dynamic";

export default async function Home() {
  await ensureDefaultAdmin();
  
  const sessionUser = await getSessionUserFromCookies();
  if (!sessionUser) {
    redirect("/login");
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
        {/* Welcome Tour */}
      <TourWrapper userId={sessionUser.id} userEmail={sessionUser.email} />
      
      {/* Theme gradients - visible on both themes */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.15),_transparent_55%)] dark:bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.18),_transparent_55%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_80%,_rgba(244,114,182,0.06),_transparent_55%)] dark:bg-[radial-gradient(circle_at_20%_80%,_rgba(244,114,182,0.08),_transparent_55%)]" />
      
      <main className="relative mx-auto flex min-h-screen max-w-6xl flex-col gap-10 px-6 pb-24 pt-16 sm:px-10 lg:px-16">
        <HeaderBar />

        <header className="flex flex-col gap-8">
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-4 flex-1">
              <span className="w-fit rounded-full border border-border bg-muted/50 px-4 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-muted-foreground">
                MeddeyGo Automation
              </span>
              <h1 className="text-4xl font-semibold leading-tight text-foreground md:text-5xl lg:text-[52px]">
                Welcome back, {sessionUser.displayName ?? sessionUser.email}
              </h1>
              <p className="max-w-3xl text-base leading-relaxed text-muted-foreground md:text-lg">
                Centralize access to every productivity tool in your toolkit. Consistent theme experiences.
              </p>
            </div>
          </div>
          <div className="flex flex-col gap-6 rounded-2xl border border-border bg-card/60 p-6 backdrop-blur">
            <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
              <strong className="rounded-full bg-emerald-500/10 px-3 py-1 text-emerald-600 dark:text-emerald-400">
                {projects.length} curated apps
              </strong>
              <span className="flex items-center gap-2 rounded-full bg-sky-500/10 px-3 py-1 text-sky-600 dark:text-sky-400">
                <Image
                  src="https://meddey.com/cdn/shop/files/Meddey_1_a9e7c93d-6b1b-4d73-b4cb-bb110a73204f.png"
                  alt="MeddeyGo"
                  width={16}
                  height={16}
                  className="h-4 w-auto"
                />
                Powered By MeddeyGo
              </span>
              <span className="rounded-full bg-fuchsia-500/10 px-3 py-1 text-fuchsia-600 dark:text-fuchsia-400">
                Animated interactions
              </span>
            </div>
            <div className="flex flex-wrap gap-3">
              {categories.map((category) => (
                <div
                  key={`nav-${category.value}`}
                  className="rounded-full border border-border bg-muted/50 px-3 py-1 text-xs uppercase tracking-wide text-muted-foreground"
                >
                  {category.label}
                </div>
              ))}
            </div>
          </div>
        </header>

        <Suspense fallback={<div className="text-muted-foreground">Loading apps…</div>}>
          <ProjectExplorer projects={projects} categories={categories} />
        </Suspense>
      </main>
    </div>
  );
}
