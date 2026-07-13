"use client";

import { FileSearch } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

/** The per-answer audit surface: the full provenance trace as key/value rows.
 * Ordered so the fields a reviewer reads first come first. */

const PREFERRED_ORDER = [
  "route",
  "bound_terms",
  "metric_id",
  "tables_used",
  "join_ids",
  "min_join_confidence",
  "attempts",
  "uncertainty_flags",
  "graded_delivery",
  "routed_schemas",
  "suspect_columns",
  "selected_schema",
  "candidate_schemas",
  "corpus_version",
  "cache_hit",
  "refused_by",
  "negative_example",
];

function orderedEntries(provenance: Record<string, unknown>): [string, unknown][] {
  const keys = Object.keys(provenance);
  const preferred = PREFERRED_ORDER.filter((k) => k in provenance);
  const rest = keys.filter((k) => !PREFERRED_ORDER.includes(k)).sort();
  return [...preferred, ...rest].map((k) => [k, provenance[k]]);
}

function renderValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (Array.isArray(value)) return value.length ? value.map(String).join(", ") : "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function ProvenanceDrawer({ provenance }: { provenance: Record<string, unknown> }) {
  const entries = orderedEntries(provenance);

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <FileSearch className="size-3.5" />
          Provenance
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Provenance</SheetTitle>
          <SheetDescription>The audit trace for this answer.</SheetDescription>
        </SheetHeader>
        <dl className="grid gap-3 px-4 pb-6">
          {entries.map(([key, value]) => (
            <div key={key} className="grid grid-cols-[9rem_1fr] gap-2 border-b pb-2 text-sm">
              <dt className="font-mono text-xs text-muted-foreground">{key}</dt>
              <dd className="break-words font-mono text-xs">{renderValue(value)}</dd>
            </div>
          ))}
        </dl>
      </SheetContent>
    </Sheet>
  );
}
