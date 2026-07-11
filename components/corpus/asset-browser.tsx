"use client";

/**
 * Corpus asset browser. Lists the non-table corpus assets (metrics, terms,
 * joins, rules, few-shots, negatives) with a type filter. Read-only by design:
 * an "Edit" affordance only appears when the attached backend reports it can
 * edit (`capabilities.can_edit`), and in mock mode it is a no-op that toasts.
 */

import { useState } from "react";
import { Pencil } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { ASSET_TYPES, type AssetRow, type AssetType } from "@/lib/types";
import { canEdit } from "@/lib/capabilities";
import { useAssets, useCapabilities } from "@/hooks/queries";
import { QueryState } from "@/components/common/query-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/** Filter values: the six asset types plus an "all" pseudo-filter. */
type Filter = AssetType | "all";

/** Human label for a type/filter token (`few_shot` → `few shot`). */
function typeLabel(token: string): string {
  return token.replace(/_/g, " ");
}

/**
 * Outline-badge className for a provenance status, matching the app's trust
 * semantics: certified → governed (green), heuristic → lineage (amber),
 * anything else (incl. null) → muted.
 */
function provenanceClass(status: string | null): string {
  if (status === "certified") return "border-tier-governed/40 text-tier-governed";
  if (status === "heuristic") return "border-tier-lineage/50 text-tier-lineage";
  return "text-muted-foreground";
}

export function AssetBrowser() {
  // A single query for every asset; we filter client-side to keep the cache warm
  // and avoid a separate request per type.
  const assets = useAssets();
  const { data: caps } = useCapabilities();
  const [filter, setFilter] = useState<Filter>("all");

  const editable = canEdit(caps);

  return (
    <div className="space-y-4">
      {/* Filter row: "All" plus one toggle per asset type. */}
      <div className="flex flex-wrap items-center gap-1.5">
        <FilterToggle active={filter === "all"} onClick={() => setFilter("all")}>
          All
        </FilterToggle>
        {ASSET_TYPES.map((type) => (
          <FilterToggle
            key={type}
            active={filter === type}
            onClick={() => setFilter(type)}
          >
            {typeLabel(type)}
          </FilterToggle>
        ))}
      </div>

      <QueryState
        query={assets}
        isEmpty={(data) => data.length === 0}
        emptyMessage="No corpus assets."
      >
        {(data) => {
          const rows =
            filter === "all"
              ? data
              : data.filter((asset) => asset.asset_type === filter);

          // The corpus has assets, but none match the active filter.
          if (rows.length === 0) {
            return (
              <p className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
                No {typeLabel(filter)} assets.
              </p>
            );
          }

          return (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="w-full">Summary</TableHead>
                  <TableHead>Provenance</TableHead>
                  <TableHead>Status</TableHead>
                  {editable && <TableHead className="text-right">Edit</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <AssetTableRow
                    key={`${row.asset_type}:${row.id}`}
                    row={row}
                    editable={editable}
                  />
                ))}
              </TableBody>
            </Table>
          );
        }}
      </QueryState>
    </div>
  );
}

/** One asset row. Kept separate so the (optional) edit action stays tidy. */
function AssetTableRow({ row, editable }: { row: AssetRow; editable: boolean }) {
  return (
    <TableRow>
      <TableCell className="font-mono text-xs">{row.id}</TableCell>
      <TableCell>
        <Badge variant="outline" className="capitalize">
          {typeLabel(row.asset_type)}
        </Badge>
      </TableCell>
      <TableCell className="whitespace-normal text-muted-foreground">
        {row.summary}
      </TableCell>
      <TableCell>
        {row.provenance_status ? (
          <Badge variant="outline" className={provenanceClass(row.provenance_status)}>
            {row.provenance_status}
          </Badge>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell>
        {row.excluded ? (
          <Badge variant="outline" className="border-tier-refused/40 text-tier-refused">
            excluded
          </Badge>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </TableCell>
      {editable && (
        <TableCell className="text-right">
          <Button
            variant="ghost"
            size="xs"
            // Mock mode is strictly read-only: never write, just explain.
            onClick={() => toast("Editing requires a connected dev backend")}
          >
            <Pencil />
            Edit
          </Button>
        </TableCell>
      )}
    </TableRow>
  );
}

/** A pill-style toggle for the filter row. */
function FilterToggle({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant={active ? "secondary" : "ghost"}
      aria-pressed={active}
      onClick={onClick}
      className={cn("capitalize", !active && "text-muted-foreground")}
    >
      {children}
    </Button>
  );
}
