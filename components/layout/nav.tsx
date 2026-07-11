"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { Activity, Boxes, MessagesSquare, MoonStar, Network, Sun } from "lucide-react";

import { cn } from "@/lib/utils";
import { useCapabilities } from "@/hooks/queries";

const LINKS = [
  { href: "/", label: "Chat", icon: MessagesSquare },
  { href: "/schema", label: "Schema", icon: Network },
  { href: "/corpus", label: "Corpus", icon: Boxes },
  { href: "/health", label: "Health", icon: Activity },
] as const;

function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

/** Left navigation rail + a small backend-capabilities strip at the foot. */
export function Nav() {
  const pathname = usePathname();

  return (
    <aside className="flex h-full w-56 shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground">
      <div className="flex h-14 items-center justify-between gap-2 border-b px-4">
        <span className="font-mono text-sm font-semibold tracking-tight">governed-bi</span>
        <ThemeToggle />
      </div>

      <nav className="flex-1 space-y-1 p-2">
        {LINKS.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              isActive(pathname, href)
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
            )}
          >
            <Icon className="size-4" />
            {label}
          </Link>
        ))}
      </nav>

      <CapabilitiesStrip />
    </aside>
  );
}

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const isDark = resolvedTheme === "dark";
  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      title={isDark ? "Light theme" : "Dark theme"}
      className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      {/* Render a stable icon until mounted to avoid a hydration mismatch. */}
      {mounted && isDark ? <Sun className="size-4" /> : <MoonStar className="size-4" />}
    </button>
  );
}

function CapabilitiesStrip() {
  const { data: caps } = useCapabilities();

  return (
    <div className="border-t p-3 text-xs text-muted-foreground">
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "size-2 rounded-full",
            caps?.has_live_model ? "bg-tier-governed" : "bg-muted-foreground/50",
          )}
          aria-hidden
        />
        <span className="truncate">
          {caps ? `${caps.environment} · ${caps.dialect}` : "connecting…"}
        </span>
      </div>
      <div className="mt-1 truncate font-mono">{caps?.model ?? ""}</div>
    </div>
  );
}
