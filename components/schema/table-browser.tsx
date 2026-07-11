"use client";

/**
 * Plain, auditable table browser: an expandable list of tables, each revealing a
 * columns table with governance flags. No accordion primitive ships in the UI
 * kit, so we roll a tiny controlled one with useState.
 */

import { useState } from "react";
import { ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ColumnView, TableView } from "@/lib/types";

function ColumnRow({ column }: { column: ColumnView }) {
  const suspect = column.reliability === "suspect";
  return (
    <TableRow className={cn(column.excluded && "opacity-60")}>
      <TableCell className="font-mono text-xs">{column.physical_name}</TableCell>
      <TableCell className="font-mono text-xs text-muted-foreground">
        {column.logical_type || column.physical_type}
        {!column.nullable && <span className="ml-1 text-[0.65rem]" title="not null">·NN</span>}
        {column.is_unique && <span className="ml-1 text-[0.65rem]" title="unique">·U</span>}
      </TableCell>
      <TableCell className="text-xs">{column.role ?? "—"}</TableCell>
      <TableCell className="font-mono text-xs text-muted-foreground">
        {column.references ?? "—"}
      </TableCell>
      <TableCell>
        <div className="flex flex-wrap gap-1">
          {suspect && (
            <Badge
              variant="outline"
              className="border-tier-lineage/50 text-tier-lineage"
              title={column.reliability_note ?? undefined}
            >
              suspect
            </Badge>
          )}
          {column.excluded && (
            <Badge
              variant="outline"
              className="border-tier-refused/40 text-tier-refused"
              title={column.excluded_reason ?? undefined}
            >
              excluded
            </Badge>
          )}
          {!suspect && !column.excluded && (
            <span className="text-xs text-muted-foreground">—</span>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}

function TableItem({ table }: { table: TableView }) {
  const [open, setOpen] = useState(false);
  const suspectCount = table.columns.filter((c) => c.reliability === "suspect").length;
  const excludedCount = table.columns.filter((c) => c.excluded).length;

  return (
    <div className="rounded-md border">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/50"
      >
        <ChevronRight
          className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-mono text-sm font-medium">{table.physical_name}</span>
            <span className="text-xs text-muted-foreground">{table.db}</span>
          </div>
          <div className="mt-0.5 truncate text-xs text-muted-foreground">
            {table.row_count !== null && <span>{table.row_count.toLocaleString()} rows</span>}
            {table.row_count !== null && table.grain && <span> · </span>}
            {table.grain && <span>grain: {table.grain}</span>}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
          {suspectCount > 0 && (
            <Badge variant="outline" className="border-tier-lineage/50 text-tier-lineage">
              {suspectCount} suspect
            </Badge>
          )}
          {excludedCount > 0 && (
            <Badge variant="outline" className="border-tier-refused/40 text-tier-refused">
              {excludedCount} excluded col
            </Badge>
          )}
          {table.excluded && (
            <Badge
              variant="outline"
              className="border-tier-refused/40 text-tier-refused"
              title={table.excluded_reason ?? undefined}
            >
              excluded
            </Badge>
          )}
          {table.provenance_status && (
            <Badge variant="outline" className="text-muted-foreground">
              {table.provenance_status}
            </Badge>
          )}
        </div>
      </button>

      {open && (
        <div className="border-t">
          {table.description && (
            <p className="px-3 py-2 text-xs text-muted-foreground">{table.description}</p>
          )}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Column</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>References</TableHead>
                <TableHead>Governance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {table.columns.map((col) => (
                <ColumnRow key={col.physical_name} column={col} />
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

export function TableBrowser({ tables }: { tables: TableView[] }) {
  return (
    <div className="space-y-2">
      {tables.map((table) => (
        <TableItem key={table.id} table={table} />
      ))}
    </div>
  );
}
