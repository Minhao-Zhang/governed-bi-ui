"use client";

/**
 * Right-hand detail panel for a selected graph node. Fully controlled by the
 * parent (open + onOpenChange). For a table node we resolve the matching
 * TableView and render its columns with governance flags; for every other kind
 * we show the node's label / kind / provenance / confidence.
 */

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ColumnView, GraphNode, KnowledgeGraph, TableView } from "@/lib/types";

/** Match a graph node to its full TableView. KG nodes are lean (no physical
 * name), so the id is the join key; the label is a last-resort fallback. */
function findTable(node: GraphNode, schema: TableView[]): TableView | undefined {
  return schema.find((t) => t.id === node.id || t.physical_name === node.label);
}

function KindBadge({ kind }: { kind: string }) {
  return (
    <Badge variant="outline" className="font-mono uppercase">
      {kind}
    </Badge>
  );
}

/** Small label/value row used in the non-table view. */
function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid grid-cols-[7rem_1fr] gap-2 border-b pb-2 text-sm">
      <dt className="font-mono text-xs text-muted-foreground">{label}</dt>
      <dd className="break-words text-sm">{value}</dd>
    </div>
  );
}

function ColumnRow({ column }: { column: ColumnView }) {
  const suspect = column.reliability === "suspect";
  return (
    <TableRow className={cn(column.excluded && "opacity-60")}>
      <TableCell className="font-mono text-xs">{column.physical_name}</TableCell>
      <TableCell className="font-mono text-xs text-muted-foreground">
        {column.logical_type || column.physical_type}
      </TableCell>
      <TableCell className="text-xs">{column.role ?? "—"}</TableCell>
      <TableCell>
        <Badge
          variant="outline"
          className={cn(
            "font-normal",
            suspect
              ? "border-tier-lineage/50 text-tier-lineage"
              : "border-tier-governed/40 text-tier-governed",
          )}
          title={column.reliability_note ?? undefined}
        >
          {suspect ? "suspect" : "ok"}
        </Badge>
      </TableCell>
      <TableCell className="font-mono text-xs text-muted-foreground">
        {column.references ?? "—"}
      </TableCell>
      <TableCell>
        {column.excluded ? (
          <Badge
            variant="outline"
            className="border-tier-refused/40 text-tier-refused"
            title={column.excluded_reason ?? undefined}
          >
            excluded
          </Badge>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </TableCell>
    </TableRow>
  );
}

function TableDetail({ table }: { table: TableView }) {
  return (
    <div className="space-y-4 px-4 pb-8">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="font-mono">
          {table.db}
        </Badge>
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

      <dl className="grid gap-2">
        <Field
          label="rows"
          value={table.row_count !== null ? table.row_count.toLocaleString() : "—"}
        />
        <Field label="grain" value={table.grain ?? "—"} />
        {table.description && <Field label="description" value={table.description} />}
      </dl>

      <div>
        <div className="mb-1 text-xs font-medium text-muted-foreground">
          Columns ({table.columns.length})
        </div>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Reliability</TableHead>
                <TableHead>References</TableHead>
                <TableHead>Excluded</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {table.columns.map((col) => (
                <ColumnRow key={col.physical_name} column={col} />
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}

function GenericDetail({ node }: { node: GraphNode }) {
  return (
    <div className="space-y-4 px-4 pb-8">
      <div className="flex flex-wrap items-center gap-2">
        {node.excluded && (
          <Badge variant="outline" className="border-tier-refused/40 text-tier-refused">
            excluded
          </Badge>
        )}
        {node.has_suspect && (
          <Badge variant="outline" className="border-tier-lineage/50 text-tier-lineage">
            suspect
          </Badge>
        )}
      </div>

      <Separator />

      <dl className="grid gap-2">
        <Field label="id" value={<span className="font-mono text-xs">{node.id}</span>} />
        <Field label="kind" value={node.kind} />
        <Field label="provenance" value={node.provenance_status ?? "—"} />
        <Field
          label="confidence"
          value={
            node.confidence !== null && node.confidence !== undefined
              ? node.confidence.toFixed(2)
              : "—"
          }
        />
      </dl>
    </div>
  );
}

export function NodeDetailSheet({
  nodeId,
  schema,
  graph,
  open,
  onOpenChange,
}: {
  nodeId: string | null;
  schema: TableView[];
  graph: KnowledgeGraph;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const node = nodeId ? graph.nodes.find((n) => n.id === nodeId) ?? null : null;
  const table = node && node.kind === "table" ? findTable(node, schema) : undefined;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        {node ? (
          <>
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2">
                <span className="truncate">{node.label}</span>
                <KindBadge kind={node.kind} />
              </SheetTitle>
              <SheetDescription>
                {node.kind === "table"
                  ? "Table columns and their governance flags."
                  : "Semantic-layer asset detail."}
              </SheetDescription>
            </SheetHeader>

            {node.kind === "table" && table ? (
              <TableDetail table={table} />
            ) : node.kind === "table" ? (
              // Table node without a resolvable TableView — fall back gracefully.
              <div className="px-4 pb-8 text-sm text-muted-foreground">
                No column detail is available for this table.
              </div>
            ) : (
              <GenericDetail node={node} />
            )}
          </>
        ) : (
          <>
            <SheetHeader>
              <SheetTitle>No selection</SheetTitle>
              <SheetDescription>Pick a node in the graph to inspect it.</SheetDescription>
            </SheetHeader>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
