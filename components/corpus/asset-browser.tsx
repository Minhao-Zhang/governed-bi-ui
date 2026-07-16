"use client";

/**
 * Corpus asset browser. Lists the non-table corpus assets (metrics, terms,
 * joins, rules, few-shots, negatives) with a type filter. An "Edit" affordance
 * appears when `capabilities.can_edit`; it opens a sheet that POSTs to
 * `/corpus/edit` and shows validation findings + diff.
 */

import { useState } from "react";
import { Pencil, Search } from "lucide-react";

import { cn } from "@/lib/utils";
import { ASSET_TYPES, type AssetRow, type AssetType } from "@/lib/types";
import { canEdit } from "@/lib/capabilities";
import { useAssets, useCapabilities } from "@/hooks/queries";
import { QueryState } from "@/components/common/query-state";
import { AssetEditSheet } from "@/components/corpus/asset-edit-sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  const [query, setQuery] = useState("");
  const [editRow, setEditRow] = useState<AssetRow | null>(null);

  const editable = canEdit(caps);
  const q = query.trim().toLowerCase();

  return (
    <div className="space-y-4">
      {/* Free-text search over id + summary. */}
      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search assets…"
          aria-label="Search corpus assets"
          className="pl-8"
        />
      </div>

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
          const rows = data.filter((asset) => {
            if (filter !== "all" && asset.asset_type !== filter) return false;
            if (!q) return true;
            return (
              asset.id.toLowerCase().includes(q) ||
              asset.summary.toLowerCase().includes(q)
            );
          });

          // The corpus has assets, but none match the active filter/search.
          if (rows.length === 0) {
            return (
              <p className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
                {q
                  ? `No assets match “${query.trim()}”.`
                  : `No ${typeLabel(filter)} assets.`}
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
                    onEdit={() => setEditRow(row)}
                  />
                ))}
              </TableBody>
            </Table>
          );
        }}
      </QueryState>

      <AssetEditSheet
        row={editRow}
        open={editRow !== null}
        onOpenChange={(next) => {
          if (!next) setEditRow(null);
        }}
      />
    </div>
  );
}

/** One asset row. Kept separate so the (optional) edit action stays tidy. */
function AssetTableRow({
  row,
  editable,
  onEdit,
}: {
  row: AssetRow;
  editable: boolean;
  onEdit: () => void;
}) {
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
          <Button variant="ghost" size="xs" onClick={onEdit}>
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
