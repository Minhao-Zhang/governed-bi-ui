"use client";

/**
 * Column-level ER "Relationships" diagram.
 *
 * Table-card nodes come from GET /schema (per-column detail); FK edges come from
 * GET /graph (cardinality + the join predicate). Edges are anchored to the actual
 * participating COLUMNS by parsing the edge's `on` equality
 * ("table_b.a_id = table_a.id") and mapping physical names → node ids, with a
 * card-level fallback handle so an edge never silently vanishes. Layout is dagre
 * LR (see lib/graph-layout). Reliability is the only loud channel: suspect columns
 * amber, low-confidence FKs red-dashed, excluded tables/columns dimmed.
 */

import { useEffect, useMemo } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  MarkerType,
  useNodesState,
  useEdgesState,
  type Node,
  type NodeHandle,
  type Edge,
  type NodeProps,
  type NodeMouseHandler,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { KeyRound, Link2, TriangleAlert } from "lucide-react";

import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { QueryState } from "@/components/common/query-state";
import { useFocusContext } from "@/components/schema/use-focus-context";
import { useErGraph, useSchema } from "@/hooks/queries";
import { layoutGraph, type LayoutEdge, type LayoutNode } from "@/lib/graph-layout";
import type { ColumnView, ErGraph, TableView } from "@/lib/types";

const CARD_W = 248;
const HEADER_H = 40;
const ROW_H = 26;
const PAD_Y = 6;
const EDGE_STROKE = "#94a3b8";
const LOW_STROKE = "#c0392b";

const cardHeight = (t: TableView) => HEADER_H + t.columns.length * ROW_H + PAD_Y * 2;
const rowCenterY = (i: number) => HEADER_H + PAD_Y + i * ROW_H + ROW_H / 2;

const CARDINALITY_LABEL: Record<string, string> = {
  many_to_one: "N:1",
  one_to_many: "1:N",
  one_to_one: "1:1",
  many_to_many: "N:N",
};

/* ── Custom table-card node ───────────────────────────────────────────────── */

type ErNodeData = { table: TableView };
type ErFlowNode = Node<ErNodeData, "erTable">;

/** Predefined handle bounds (edge anchoring is measurement-free) — a west target
 * + east source per column, plus card-level fallbacks. */
function nodeHandles(t: TableView): NodeHandle[] {
  const hs: NodeHandle[] = [
    { id: "t-__card", type: "target", position: Position.Left, x: 0, y: HEADER_H / 2, width: 1, height: 1 },
    { id: "s-__card", type: "source", position: Position.Right, x: CARD_W, y: HEADER_H / 2, width: 1, height: 1 },
  ];
  t.columns.forEach((c, i) => {
    const y = rowCenterY(i);
    hs.push({ id: `t-${c.physical_name}`, type: "target", position: Position.Left, x: 0, y, width: 1, height: 1 });
    hs.push({ id: `s-${c.physical_name}`, type: "source", position: Position.Right, x: CARD_W, y, width: 1, height: 1 });
  });
  return hs;
}

function ErTableCard({ data, selected }: NodeProps<ErFlowNode>) {
  const t = data.table;
  return (
    <div
      style={{ width: CARD_W }}
      className={cn(
        "relative overflow-hidden rounded-md border bg-card text-left shadow-sm ring-1 ring-foreground/5",
        selected && "ring-2 ring-ring",
        t.excluded && "border-dashed opacity-60",
      )}
    >
      {/* Card-level fallback handles (invisible). */}
      <Handle id="t-__card" type="target" position={Position.Left} className="opacity-0!" style={{ top: HEADER_H / 2 }} />
      <Handle id="s-__card" type="source" position={Position.Right} className="opacity-0!" style={{ top: HEADER_H / 2 }} />

      <div
        className="flex items-center justify-between gap-2 border-b bg-muted/40 px-2"
        style={{ height: HEADER_H }}
      >
        <span className="truncate font-mono text-sm font-semibold" title={t.physical_name}>
          {t.physical_name}
        </span>
        <span className="shrink-0 text-[0.65rem] text-muted-foreground">
          {t.row_count?.toLocaleString() ?? "—"} rows
        </span>
      </div>

      <div style={{ paddingTop: PAD_Y, paddingBottom: PAD_Y }}>
        {t.columns.map((col, i) => (
          <ErColumnRow key={col.physical_name} col={col} y={rowCenterY(i)} />
        ))}
      </div>
    </div>
  );
}

function ErColumnRow({ col, y }: { col: ColumnView; y: number }) {
  const suspect = col.reliability === "suspect";
  return (
    <div
      className={cn(
        "relative flex items-center gap-1.5 px-2",
        suspect && "bg-tier-lineage/10",
        col.excluded && "opacity-50",
      )}
      style={{ height: ROW_H }}
    >
      {/* Column-level anchors (invisible), vertically aligned to this row. */}
      <Handle id={`t-${col.physical_name}`} type="target" position={Position.Left} className="opacity-0!" style={{ top: y }} />
      <Handle id={`s-${col.physical_name}`} type="source" position={Position.Right} className="opacity-0!" style={{ top: y }} />

      {col.role === "primary_key" ? (
        <KeyRound className="size-3 shrink-0 text-amber-500" aria-label="primary key" />
      ) : col.role === "foreign_key" ? (
        <Link2 className="size-3 shrink-0 text-blue-500" aria-label="foreign key" />
      ) : (
        <span className="size-3 shrink-0" />
      )}
      <span className="truncate font-mono text-xs">{col.physical_name}</span>
      {suspect && <TriangleAlert className="size-3 shrink-0 text-tier-lineage" aria-label="suspect" />}
      <span className="ml-auto shrink-0 truncate font-mono text-[0.6rem] text-muted-foreground">
        {col.physical_type}
        {col.nullable ? "" : " ·NN"}
        {col.is_unique ? " ·U" : ""}
      </span>
    </div>
  );
}

const NODE_TYPES = { erTable: ErTableCard };

/* ── FK endpoint resolution ───────────────────────────────────────────────── */

function parseSide(s: string | undefined): { table: string; col: string } | null {
  const parts = (s ?? "").trim().split(".");
  return parts.length === 2 ? { table: parts[0].trim(), col: parts[1].trim() } : null;
}

/** Resolve each edge endpoint to a column on the participating node, by matching
 * physical names in `on` to node ids. Returns null for a side we can't resolve. */
function resolveEndpoints(er: ErGraph, edge: ErGraph["edges"][number]) {
  const byPhysical = new Map(er.nodes.map((n) => [n.physical_name, n.id]));
  const [lhs, rhs] = edge.on.split("=");
  const sides = [parseSide(lhs), parseSide(rhs)];
  const colFor = (nodeId: string): string | null => {
    for (const side of sides) {
      if (side && byPhysical.get(side.table) === nodeId) return side.col;
    }
    return null;
  };
  return { srcCol: colFor(edge.source), tgtCol: colFor(edge.target) };
}

/* ── View ─────────────────────────────────────────────────────────────────── */

export function ErDiagram({ onSelect }: { onSelect: (nodeId: string) => void }) {
  const schema = useSchema();
  const er = useErGraph();

  return (
    <QueryState
      query={schema}
      isEmpty={(tables) => tables.length === 0}
      emptyMessage="No tables to diagram."
      skeleton={<Skeleton className="h-[70vh] w-full" />}
    >
      {(tables) => (
        <ErCanvas tables={tables} er={er.data ?? { nodes: [], edges: [] }} onSelect={onSelect} />
      )}
    </QueryState>
  );
}

function ErCanvas({
  tables,
  er,
  onSelect,
}: {
  tables: TableView[];
  er: ErGraph;
  onSelect: (nodeId: string) => void;
}) {
  const computed = useMemo(() => {
    const byId = new Map(tables.map((t) => [t.id, t]));

    const layoutNodes: LayoutNode[] = tables.map((t) => ({
      id: t.id,
      width: CARD_W,
      height: cardHeight(t),
    }));
    const layoutEdges: LayoutEdge[] = er.edges.map((e) => ({ source: e.source, target: e.target }));
    const pos = layoutGraph(layoutNodes, layoutEdges, { direction: "LR", rankSep: 140 });

    const nodes: ErFlowNode[] = tables.map((t) => ({
      id: t.id,
      type: "erTable",
      position: pos[t.id] ?? { x: 0, y: 0 },
      width: CARD_W,
      height: cardHeight(t),
      handles: nodeHandles(t),
      data: { table: t },
    }));

    const edges: Edge[] = er.edges.map((e) => {
      const { srcCol, tgtCol } = resolveEndpoints(er, e);
      const srcHasCol = srcCol && byId.get(e.source)?.columns.some((c) => c.physical_name === srcCol);
      const tgtHasCol = tgtCol && byId.get(e.target)?.columns.some((c) => c.physical_name === tgtCol);
      const low = e.low_confidence;
      return {
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: srcHasCol ? `s-${srcCol}` : "s-__card",
        targetHandle: tgtHasCol ? `t-${tgtCol}` : "t-__card",
        type: "smoothstep",
        label: e.cardinality ? (CARDINALITY_LABEL[e.cardinality] ?? e.cardinality) : undefined,
        labelBgPadding: [4, 2] as [number, number],
        labelStyle: { fontSize: 10 },
        markerEnd: { type: MarkerType.ArrowClosed, color: low ? LOW_STROKE : EDGE_STROKE },
        style: {
          stroke: low ? LOW_STROKE : EDGE_STROKE,
          strokeWidth: low ? 2 : 1.5,
          strokeDasharray: low ? "6 4" : undefined,
        },
      } satisfies Edge;
    });

    return { nodes, edges };
  }, [tables, er]);

  const [nodes, setNodes, onNodesChange] = useNodesState<ErFlowNode>(computed.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(computed.edges);

  useEffect(() => {
    setNodes(computed.nodes);
    setEdges(computed.edges);
  }, [computed, setNodes, setEdges]);

  const handleNodeClick: NodeMouseHandler<ErFlowNode> = (_e, node) => onSelect(node.id);

  // Focus+context: hovering a table dims everything outside its FK neighborhood.
  const focus = useFocusContext(edges);
  const shownNodes = useMemo(
    () =>
      nodes.map((n) => ({
        ...n,
        style: { ...n.style, opacity: focus.dimNode(n.id) ? 0.25 : 1, transition: "opacity 150ms" },
      })),
    [nodes, focus.dimNode],
  );
  const shownEdges = useMemo(
    () =>
      edges.map((e) => ({
        ...e,
        style: { ...e.style, opacity: focus.dimEdge(e.source, e.target) ? 0.12 : 1 },
      })),
    [edges, focus.dimEdge],
  );

  return (
    <div className="h-[70vh] w-full rounded-md border bg-card">
      <ReactFlow<ErFlowNode, Edge>
        nodes={shownNodes}
        edges={shownEdges}
        nodeTypes={NODE_TYPES}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        onNodeMouseEnter={(_e, n) => focus.focus(n.id)}
        onNodeMouseLeave={() => focus.clear()}
        nodesConnectable={false}
        fitView
        minZoom={0.2}
        proOptions={{ hideAttribution: true }}
      >
        <Background />
        <Controls showInteractive={false} />
        <MiniMap pannable zoomable className="bg-muted!" />
      </ReactFlow>
    </div>
  );
}
