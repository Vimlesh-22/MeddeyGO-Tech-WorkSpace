"use client";

import { useMemo, useState, useTransition } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Sparkles } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Project } from "@/data/projects";
import { ProjectCard } from "@/components/project-card";
import { cn } from "@/lib/utils";

export type CategoryOption = {
  value: string;
  label: string;
};

type ProjectExplorerProps = {
  projects: Project[];
  categories: CategoryOption[];
};

export function ProjectExplorer({ projects, categories }: ProjectExplorerProps) {
  const [activeCategory, setActiveCategory] = useState<string>(categories[0]?.value ?? "all");
  const [query, setQuery] = useState("");
  const [isPending, startTransition] = useTransition();

  const results = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return projects.filter((project) => {
      const matchesCategory =
        activeCategory === "all" || project.category === activeCategory;
      if (!matchesCategory) {
        return false;
      }

      if (!normalized) {
        return true;
      }

      const haystack = [
        project.name,
        project.headline,
        project.summary,
        ...project.tags,
        ...project.highlights,
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalized);
    });
  }, [projects, activeCategory, query]);

  const handleCategoryChange = (value: string) => {
    startTransition(() => {
      setActiveCategory(value);
    });
  };

  const handleSearchChange = (value: string) => {
    startTransition(() => {
      setQuery(value);
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card/60 p-6 backdrop-blur">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <label className="flex w-full items-center gap-3 rounded-xl border border-border bg-muted/50 px-4 py-3 shadow-inner">
            <Search className="size-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => handleSearchChange(event.target.value)}
              placeholder="Search by feature, tech stack, or name"
              className="h-auto border-none bg-transparent px-0 text-sm text-foreground placeholder:text-muted-foreground focus-visible:ring-0"
            />
            {query && (
              <button
                type="button"
                onClick={() => handleSearchChange("")}
                className="text-xs uppercase tracking-wide text-muted-foreground transition hover:text-foreground"
              >
                Clear
              </button>
            )}
          </label>
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.25em] text-muted-foreground">
            <Sparkles className="size-4 text-emerald-500 dark:text-emerald-300" />
            <span>{isPending ? "Updating" : "Instant filters"}</span>
          </div>
        </div>
        <Tabs value={activeCategory} onValueChange={handleCategoryChange} className="w-full">
          <TabsList className="flex w-full flex-wrap justify-start gap-2 bg-transparent p-0">
            {categories.map((category) => (
              <TabsTrigger
                key={category.value}
                value={category.value}
                className={cn(
                  "data-[state=active]:bg-primary/10 data-[state=active]:text-primary dark:data-[state=active]:bg-white/10 dark:data-[state=active]:text-white",
                  "rounded-full border border-border bg-muted/50 px-4 py-2 text-sm font-medium text-muted-foreground",
                )}
              >
                {category.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          Showing <strong className="text-foreground">{results.length}</strong> of {" "}
          <strong className="text-foreground">{projects.length}</strong> apps
        </span>
        {query && (
          <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs uppercase tracking-wide text-emerald-600 dark:text-emerald-200">
            Filtered by &ldquo;{query}&rdquo;
          </span>
        )}
      </div>

      <AnimatePresence mode="popLayout">
        <motion.div
          key={`${activeCategory}-${query}`}
          layout
          className="grid gap-6 md:grid-cols-2"
        >
          {results.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </motion.div>
      </AnimatePresence>

      {results.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-10 text-center text-muted-foreground">
          No apps match your filters yet. Try tweaking the search or selecting a different category.
        </div>
      )}
    </div>
  );
}
