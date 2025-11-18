"use client";

import { useMemo, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  ExternalLink,
  Sheet,
  Sparkles,
  Database,
  Waypoints,
  ArrowRight,
  Play,
  Lock,
  type LucideIcon,
} from "lucide-react";
import { Project } from "@/data/projects";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const ICONS: Record<Project["icon"], LucideIcon> = {
  sheet: Sheet,
  sparkles: Sparkles,
  database: Database,
  waypoints: Waypoints,
};

// Available accent colors
const COLOR_KEYS = ['blue', 'green', 'purple', 'orange', 'red', 'teal'] as const;

// Accent color mappings
const ACCENT_COLORS: Record<string, { gradient: string; bg: string; hover: string }> = {
  blue: {
    gradient: "from-blue-500 to-cyan-500",
    bg: "bg-blue-500/10",
    hover: "hover:bg-blue-500/20",
  },
  green: {
    gradient: "from-emerald-500 to-teal-500",
    bg: "bg-emerald-500/10",
    hover: "hover:bg-emerald-500/20",
  },
  purple: {
    gradient: "from-purple-500 to-pink-500",
    bg: "bg-purple-500/10",
    hover: "hover:bg-purple-500/20",
  },
  orange: {
    gradient: "from-orange-500 to-amber-500",
    bg: "bg-orange-500/10",
    hover: "hover:bg-orange-500/20",
  },
  red: {
    gradient: "from-red-500 to-rose-500",
    bg: "bg-red-500/10",
    hover: "hover:bg-red-500/20",
  },
  teal: {
    gradient: "from-teal-500 to-cyan-500",
    bg: "bg-teal-500/10",
    hover: "hover:bg-teal-500/20",
  },
};

// Simple hash function to generate consistent color from project ID
// This ensures the same project always gets the same color (server and client match)
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

type ScheduleData = {
  schedule: {
    openAt: string;
    closeAt: string | null;
    surpriseMessage: string | null;
    customMessage: string | null;
  } | null;
  surpriseMessage: string | null;
  isScheduled: boolean;
  isOpen: boolean;
};

type Tutorial = {
  id: number;
  title: string;
  description: string | null;
  videoFileUrl: string | null;
};

export function ProjectCard({ project }: { project: Project }) {
  const router = useRouter();
  const Icon = ICONS[project.icon];
  const [copiedResource, setCopiedResource] = useState<string | null>(null);
  const [scheduleData, setScheduleData] = useState<ScheduleData | null>(null);
  const [tutorials, setTutorials] = useState<Tutorial[]>([]);
  const [tutorialsEnabled, setTutorialsEnabled] = useState(true);
  const [loadingSchedule, setLoadingSchedule] = useState(true);

  const repoBase = useMemo(() => project.repoPath.trim(), [project.repoPath]);
  
  // Generate deterministic color based on project ID only
  // This ensures the same project always gets the same color on both server and client
  const randomColor = useMemo(() => {
    const hash = hashString(project.id);
    const colorIndex = hash % COLOR_KEYS.length;
    return COLOR_KEYS[colorIndex];
  }, [project.id]);
  
  const accentColors = ACCENT_COLORS[randomColor] || ACCENT_COLORS.blue;

  // Build URL from port number dynamically (client-side only)
  const buildUrl = (port?: number) => {
    if (typeof window === 'undefined' || !port) return undefined;
    const { protocol, hostname } = window.location;
    // Use current protocol and hostname (works for both localhost and domain)
    return `${protocol}//${hostname}:${port}`;
  };

  // Find the primary app URL (first resource with a route, href, or port)
  const primaryResource = useMemo(() => {
    return project.resources.find((r) => r.route || r.href || r.port);
  }, [project.resources]);

  // Use state to handle client-side URL generation for port-based URLs
  // This ensures server and client render the same initial content
  const [clientPrimaryUrl, setClientPrimaryUrl] = useState<string | undefined>(undefined);
  
  const primaryUrl = useMemo(() => {
    if (!primaryResource) return undefined;
    // Prefer internal route for integrated tools
    if (primaryResource.route) {
      return primaryResource.route;
    }
    // Use href if available (proxy URL)
    if (primaryResource.href) {
      return primaryResource.href;
    }
    // For port-based URLs, use client-side state to avoid hydration mismatch
    if (primaryResource.port) {
      return clientPrimaryUrl;
    }
    return undefined;
  }, [primaryResource, clientPrimaryUrl]);

  // Update client-side URL after mount to avoid hydration mismatch
  useEffect(() => {
    if (primaryResource?.port && !primaryResource.route && !primaryResource.href) {
      setClientPrimaryUrl(buildUrl(primaryResource.port));
    }
  }, [primaryResource]);

  // Load schedule and tutorial data
  useEffect(() => {
    const loadData = async () => {
      try {
        const [scheduleRes, tutorialsRes, settingsRes] = await Promise.all([
          fetch(`/api/tools/${project.id}/schedule`),
          fetch(`/api/tools/${project.id}/tutorials`),
          fetch("/api/settings/dev/tutorial-settings"),
        ]);

        if (scheduleRes.ok) {
          const scheduleData = await scheduleRes.json();
          setScheduleData(scheduleData);
        }

        if (tutorialsRes.ok) {
          const tutorialsData = await tutorialsRes.json();
          setTutorials(tutorialsData.tutorials || []);
        }

        if (settingsRes.ok) {
          const settingsData = await settingsRes.json();
          setTutorialsEnabled(settingsData.settings?.tutorialsEnabled === "true");
        }
      } catch (err) {
        console.error("Failed to load schedule/tutorial data:", err);
      } finally {
        setLoadingSchedule(false);
      }
    };

    loadData();
  }, [project.id]);

  const handleResourceClick = async (
    e: React.MouseEvent,
    label: string,
    route?: string,
    port?: number,
    href?: string,
    note?: string
  ) => {
    e.stopPropagation(); // Prevent card click when clicking resource buttons

    // Priority: route (internal) > href (external) > port (dynamic)
    if (route) {
      // Internal route - use Next.js router to stay in dashboard
      router.push(route);
      return;
    }

    const url = href || (port ? buildUrl(port) : undefined);
    
    if (url) {
      window.open(url, "_blank", "noopener,noreferrer");
    }

    if (note && typeof navigator !== "undefined" && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(`${repoBase}${note.startsWith("/") ? note : note ? `/${note}` : ""}`);
        setCopiedResource(label);
        window.setTimeout(() => setCopiedResource(null), 2000);
      } catch (error) {
        console.warn("Unable to copy resource path", error);
      }
    }
  };

  const isScheduled = scheduleData?.isScheduled ?? false;
  const surpriseMsg = scheduleData?.surpriseMessage || scheduleData?.schedule?.surpriseMessage || null;
  const customMsg = scheduleData?.schedule?.customMessage;

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.4 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="group h-full"
    >
      <Card className={`relative flex h-full flex-col overflow-hidden border-border bg-card/50 backdrop-blur-sm transition-all duration-300 hover:border-primary/50 hover:shadow-xl hover:shadow-primary/10 dark:hover:shadow-primary/20 ${isScheduled ? "blur-sm pointer-events-none" : ""}`}>
        {/* Gradient accent bar */}
        <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${accentColors.gradient}`} />
        
        {/* Animated background gradient on hover */}
        <div
          className={`absolute inset-0 bg-gradient-to-br ${accentColors.gradient} opacity-0 transition-opacity duration-500 group-hover:opacity-5`}
        />

        <CardHeader className="relative z-10 pb-3">
          <div className="flex items-start justify-between gap-3">
            {/* Icon with gradient background */}
            <div className={`relative flex size-12 shrink-0 items-center justify-center rounded-xl ${accentColors.bg} transition-all duration-300 group-hover:scale-110 group-hover:shadow-lg`}>
              <div className={`absolute inset-0 rounded-xl bg-gradient-to-br ${accentColors.gradient} opacity-0 transition-opacity duration-300 group-hover:opacity-20`} />
              <Icon className="relative z-10 size-6 text-primary transition-colors duration-300 group-hover:text-primary" strokeWidth={1.5} />
            </div>
            
            {/* Category badge */}
            <Badge 
              variant="outline" 
              className={`shrink-0 bg-muted/50 text-xs font-semibold uppercase tracking-wide transition-all duration-300 ${accentColors.hover} group-hover:border-primary/50`}
            >
              {project.category}
            </Badge>
          </div>

          {/* Title and headline */}
          <div className="mt-3 space-y-0.5">
            <CardTitle className="text-xl font-bold tracking-tight transition-colors duration-300 group-hover:text-primary">
              {project.name}
            </CardTitle>
            <CardDescription className="text-xs font-medium text-muted-foreground">
              {project.headline}
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent className="relative z-10 flex flex-1 flex-col gap-3 pb-3">
          {/* Summary */}
          <p className="text-xs leading-relaxed text-muted-foreground line-clamp-2">
            {project.summary}
          </p>

          {/* Highlights */}
          <div className="space-y-1.5">
            <h4 className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Key Features
            </h4>
            <ul className="space-y-1.5">
              {project.highlights.slice(0, 3).map((highlight, index) => (
                <li key={index} className="flex items-start gap-2 text-xs">
                  <span className={`mt-1 size-1 shrink-0 rounded-full bg-gradient-to-r ${accentColors.gradient} transition-transform duration-300 group-hover:scale-125`} />
                  <span className="text-muted-foreground transition-colors duration-300 group-hover:text-foreground">
                    {highlight}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* Tags */}
          <div className="mt-auto flex flex-wrap gap-1.5">
            {project.tags.slice(0, 3).map((tag) => (
              <Badge 
                key={tag} 
                variant="secondary" 
                className={`text-[10px] transition-all duration-300 ${accentColors.hover} group-hover:border-primary/30`}
              >
                {tag}
              </Badge>
            ))}
            {project.tags.length > 3 && (
              <Badge variant="secondary" className="text-[10px]">
                +{project.tags.length - 3}
              </Badge>
            )}
          </div>
        </CardContent>

        <CardFooter className="relative z-10 flex flex-col gap-2 border-t border-border bg-muted/30 pt-3">
          {/* Tutorials Section */}
          {tutorialsEnabled && tutorials.length > 0 && !isScheduled && (
            <div className="mb-2 space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Tutorials
              </h4>
              <div className="space-y-1">
                {tutorials.slice(0, 2).map((tutorial) => (
                  <div
                    key={tutorial.id}
                    className="flex items-center gap-2 rounded-md border border-border bg-background/50 p-2 text-xs transition-colors hover:bg-muted/50"
                  >
                    <Play className="size-3 text-primary" />
                    <span className="flex-1 truncate">{tutorial.title}</span>
                    {tutorial.videoFileUrl && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-2"
                        onClick={(e) => {
                          e.stopPropagation();
                          window.open(tutorial.videoFileUrl!, "_blank", "noopener,noreferrer");
                        }}
                      >
                        Watch
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Primary Launch Button */}
          {primaryUrl && !isScheduled && (
            <Button
              className={`w-full bg-gradient-to-r ${accentColors.gradient} text-white shadow-lg transition-all duration-300 hover:shadow-xl hover:shadow-primary/50 hover:scale-[1.02]`}
              size="default"
              onClick={() => {
                // Check if it's an internal route (starts with /)
                if (primaryUrl && primaryUrl.startsWith('/')) {
                  // Use Next.js router to navigate within the dashboard
                  router.push(primaryUrl);
                } else if (primaryUrl) {
                  window.open(primaryUrl, "_blank", "noopener,noreferrer");
                }
              }}
            >
              <span className="flex items-center justify-center gap-2 text-sm font-semibold">
                Launch Application
                <ArrowRight className="size-3.5 transition-transform duration-300 group-hover:translate-x-1" />
              </span>
            </Button>
          )}
          
          {/* Resource links */}
          {project.resources.length > 0 && !isScheduled && (
            <div className="flex w-full flex-wrap gap-1.5">
              {project.resources.map((resource) => (
                <Button
                  key={resource.label}
                  variant="ghost"
                  className="h-7 rounded-lg border border-border bg-background/50 px-2.5 text-[11px] font-medium transition-all duration-300 hover:border-primary/50 hover:bg-primary/10 hover:scale-105"
                  type="button"
                  onClick={(e) => handleResourceClick(e, resource.label, resource.route, resource.port, resource.href, resource.note)}
                >
                  <span className="flex items-center gap-1">
                    {resource.label}
                    {(resource.route || resource.port || resource.href || resource.note) && (
                      <ExternalLink className="size-2.5 transition-transform duration-300 group-hover:translate-x-0.5" />
                    )}
                  </span>
                  {resource.note && (
                    <span className="ml-1.5 rounded bg-muted px-1.5 py-0.5 font-mono text-[9px]">
                      {resource.note}
                    </span>
                  )}
                </Button>
              ))}
              {copiedResource && (
                <span className="ml-auto flex items-center text-[10px] font-medium uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
                  ✓ Copied {copiedResource}
                </span>
              )}
            </div>
          )}
        </CardFooter>
      </Card>
    </motion.div>
  );
}
