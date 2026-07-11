"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, Boxes, MessagesSquare, Network } from "lucide-react";

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
      <div className="flex h-14 items-center gap-2 border-b px-4">
        <span className="font-mono text-sm font-semibold tracking-tight">governed-bi</span>
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
