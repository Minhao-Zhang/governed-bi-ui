"use client";

/**
 * Filterable knowledge-graph explorer built on React Flow v12.
 *
 * The engine hands us a flat {nodes, edges} graph over every asset kind. We lay
 * it out deterministically in code — one column per node kind, nodes stacked
 * within a column — so the picture is stable across renders (no dagre/elk). Trust
 * semantics ride on the *reliability* palette (suspect / excluded / low-confidence
 * joins); the per-kind accent is purely for grouping.
 */

import { useEffect, useMemo, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
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
import {
  Ban,
  BookText,
  Gauge,
  Lightbulb,
  Link2,
  Scale,
  Table2,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { layoutGraph } from "@/lib/graph-layout";
import { useFocusContext } from "@/components/schema/use-focus-context";
import type { GraphNode, GraphNodeKind, KnowledgeGraph } from "@/lib/types";

/* ── Per-kind presentation ────────────────────────────────────────────────── */

type KindMeta = {
  label: string;
  icon: LucideIcon;
  /** Tailwind classes for the left accent border + legend dot (grouping only). */
  accent: string;
  dot: string;
};

const KIND_META: Record<GraphNodeKind, KindMeta> = {
  table: { label: "Table", icon: Table2, accent: "border-l-emerald-500", dot: "bg-emerald-500" },
  join: { label: "Join", icon: Link2, accent: "border-l-amber-500", dot: "bg-amber-500" },
  metric: { label: "Metric", icon: Gauge, accent: "border-l-blue-500", dot: "bg-blue-500" },
  term: { label: "Term", icon: BookText, accent: "border-l-violet-500", dot: "bg-violet-500" },
  rule: { label: "Rule", icon: Scale, accent: "border-l-rose-500", dot: "bg-rose-500" },
  few_shot: { label: "Few-shot", icon: Lightbulb, accent: "border-l-sky-500", dot: "bg-sky-500" },
  negative_example: { label: "Negative", icon: Ban, accent: "border-l-zinc-500", dot: "bg-zinc-500" },
};

/** Column order (x position) — absolute so a kind keeps its column when toggled. */
const KIND_ORDER: GraphNodeKind[] = [
  "table",
  "join",
  "metric",
  "term",
  "rule",
  "few_shot",
  "negative_example",
];

const COL_SPACING = 220;
const ROW_SPACING = 90;

// Fixed node box. Declaring width/height + predefined handle bounds lets React
// Flow anchor edges without waiting on DOM measurement (which can silently never
// complete inside flex/tab containers, leaving edges unrendered).
const NODE_W = 176;
const NODE_H = 74;

/** Edge anchor points, so `toHandleBounds` can resolve them measurement-free. */
const PREDEFINED_HANDLES: NodeHandle[] = [
  { id: null, type: "target", position: Position.Left, x: 0, y: NODE_H / 2, width: 1, height: 1 },
  { id: null, type: "source", position: Position.Right, x: NODE_W, y: NODE_H / 2, width: 1, height: 1 },
];

/** Low-confidence joins get the "refused" red so they read as a warning. */
const LOW_CONFIDENCE_STROKE = "#c0392b";
/** Neutral stroke for ordinary edges (a concrete color so the arrow marker is
 * visible — React Flow renders an invisible marker when the color is undefined). */
const EDGE_STROKE = "#94a3b8";

/* ── Custom node ──────────────────────────────────────────────────────────── */

/** Data we carry on each React Flow node (type alias → assignable to the
 * `Record<string, unknown>` constraint React Flow expects). */
type GraphNodeData = {
  label: string;
  kind: GraphNodeKind;
  hasSuspect: boolean;
  excluded: boolean;
  provenanceStatus: string | null;
};

type GraphFlowNode = Node<GraphNodeData, "graphNode">;

/** A compact card node: kind accent + label, a warning dot when a table hides a
 * suspect column, and a dimmed dashed frame when the asset is excluded. */
function GraphNodeCard({ data, selected }: NodeProps<GraphFlowNode>) {
  const meta = KIND_META[data.kind];
  const Icon = meta.icon;

  return (
    <div
      className={cn(
        // Neutral stripe: kind is conveyed by the icon; the tier palette is
        // reserved for the reliability channel (suspect dot / excluded frame).
        "relative w-44 cursor-pointer rounded-md border border-l-4 border-l-muted-foreground/25 bg-card px-3 py-2 text-left shadow-sm ring-1 ring-foreground/5 transition-shadow hover:shadow-md",
        selected && "ring-2 ring-ring",
        data.excluded && "border-dashed opacity-60",
      )}
    >
      {/* Edges attach here; kept subtle since the graph is read-only. */}
      <Handle type="target" position={Position.Left} className="h-1.5! w-1.5! border-0! bg-muted-foreground/40!" />
      <Handle type="source" position={Position.Right} className="h-1.5! w-1.5! border-0! bg-muted-foreground/40!" />

      {data.hasSuspect && (
        <span
          className="absolute -right-1 -top-1 size-2.5 rounded-full bg-tier-lineage ring-2 ring-card"
          title="Contains a suspect column"
          aria-hidden
        />
      )}

      <div className="flex items-center gap-1.5 text-[0.65rem] font-medium uppercase tracking-wide text-muted-foreground">
        <Icon className="size-3" />
        {meta.label}
      </div>
      <div className="truncate text-sm font-medium" title={data.label}>
        {data.label}
      </div>
      {data.provenanceStatus && (
        <div className="mt-0.5 truncate font-mono text-[0.65rem] text-muted-foreground" title={data.provenanceStatus}>
          {data.provenanceStatus}
        </div>
      )}
    </div>
  );
}

/** Stable node-type map (must not be recreated per render). */
const NODE_TYPES = { graphNode: GraphNodeCard };

/* ── Layout ───────────────────────────────────────────────────────────────── */

function toFlowNode(node: GraphNode, x: number, y: number): GraphFlowNode {
  return {
    id: node.id,
    type: "graphNode",
    position: { x, y },
    width: NODE_W,
    height: NODE_H,
    handles: PREDEFINED_HANDLES,
    data: {
      label: node.label,
      kind: node.kind,
      hasSuspect: node.has_suspect ?? false,
      excluded: node.excluded ?? false,
      provenanceStatus: node.provenance_status ?? null,
    },
  };
}

/** Group visible nodes into per-kind columns and stack them vertically. */
function layoutNodes(graph: KnowledgeGraph, visible: Set<GraphNodeKind>): GraphFlowNode[] {
  const rowInColumn: Partial<Record<GraphNodeKind, number>> = {};
  return graph.nodes
    .filter((n) => visible.has(n.kind))
    .map((n) => {
      const colIndex = KIND_ORDER.indexOf(n.kind);
      const col = colIndex === -1 ? KIND_ORDER.length : colIndex;
      const row = rowInColumn[n.kind] ?? 0;
      rowInColumn[n.kind] = row + 1;
      return toFlowNode(n, col * COL_SPACING, row * ROW_SPACING);
    });
}

/** Keep only edges whose endpoints are both visible; flag low-confidence joins. */
function layoutEdges(graph: KnowledgeGraph, visibleIds: Set<string>): Edge[] {
  return graph.edges
    .filter((e) => visibleIds.has(e.source) && visibleIds.has(e.target))
    .map((e) => {
      const low = e.low_confidence ?? false;
      return {
        id: e.id,
        source: e.source,
        target: e.target,
        label: e.relation, // show the relation kind (join/measures/grounds/…)
        animated: false, // static — calmer; low-confidence reads via red dashed
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: low ? LOW_CONFIDENCE_STROKE : EDGE_STROKE,
        },
        style: {
          stroke: low ? LOW_CONFIDENCE_STROKE : EDGE_STROKE,
          strokeWidth: low ? 2 : 1.5,
          strokeDasharray: low ? "6 4" : undefined,
        },
        labelStyle: { fontSize: 10 },
        // `relation` is an open-vocab string; carried for reference only (no visual role).
        data: { relation: e.relation },
      } satisfies Edge;
    });
}

/* ── Component ────────────────────────────────────────────────────────────── */

export function KnowledgeGraph(props: {
  graph: KnowledgeGraph;
  onSelect: (nodeId: string) => void;
}) {
  // The inner component uses React Flow hooks (useUpdateNodeInternals), which
  // require a provider in scope.
  return (
    <ReactFlowProvider>
      <KnowledgeGraphInner {...props} />
    </ReactFlowProvider>
  );
}

function KnowledgeGraphInner({
  graph,
  onSelect,
}: {
  graph: KnowledgeGraph;
  /** Called with the clicked node id so a parent can open its detail sheet. */
  onSelect: (nodeId: string) => void;
}) {
  // Which kinds actually appear, in canonical column order — drives the filters.
  const presentKinds = useMemo(() => {
    const set = new Set(graph.nodes.map((n) => n.kind));
    return KIND_ORDER.filter((k) => set.has(k));
  }, [graph]);

  const countByKind = useMemo(() => {
    const counts: Partial<Record<GraphNodeKind, number>> = {};
    for (const n of graph.nodes) counts[n.kind] = (counts[n.kind] ?? 0) + 1;
    return counts;
  }, [graph]);

  // Visible kinds; start with everything present. New Set on each toggle so the
  // memo below recomputes.
  const [visibleKinds, setVisibleKinds] = useState<Set<GraphNodeKind>>(
    () => new Set(presentKinds),
  );

  // Re-seed the filter set only when the SET of present kinds actually changes
  // (keyed by content, not the graph object's identity — otherwise a refetch that
  // returns the same kinds would wipe the user's filter selection).
  useEffect(() => {
    setVisibleKinds(new Set(presentKinds));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presentKinds.join(",")]);

  const computed = useMemo(() => {
    const nodes = layoutNodes(graph, visibleKinds);
    const visibleIds = new Set(nodes.map((n) => n.id));
    const edges = layoutEdges(graph, visibleIds);
    // Real layered layout (dagre): position encodes connectivity instead of the
    // old per-kind grid, so related assets sit near the tables they attach to and
    // dagre minimizes edge crossings.
    const pos = layoutGraph(
      nodes.map((n) => ({ id: n.id, width: NODE_W, height: NODE_H })),
      edges.map((e) => ({ source: e.source, target: e.target })),
      { direction: "LR", nodeSep: 44, rankSep: 120 },
    );
    const positioned = nodes.map((n) => ({ ...n, position: pos[n.id] ?? n.position }));
    return { nodes: positioned, edges };
  }, [graph, visibleKinds]);

  // React Flow needs controlled state to reflect filter changes and allow drags.
  const [nodes, setNodes, onNodesChange] = useNodesState<GraphFlowNode>(computed.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(computed.edges);

  useEffect(() => {
    setNodes(computed.nodes);
    setEdges(computed.edges);
  }, [computed, setNodes, setEdges]);

  const toggleKind = (kind: GraphNodeKind) => {
    setVisibleKinds((prev) => {
      const next = new Set(prev);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });
  };

  const handleNodeClick: NodeMouseHandler<GraphFlowNode> = (_event, node) => {
    onSelect(node.id);
  };

  // Focus+context: hovering a node dims everything outside its 1-hop neighborhood.
  // Dim the edge path + its relation label <text> + label bg <rect> together, so
  // the relation label fades with its edge rather than staying bright.
  const focus = useFocusContext(edges);
  const shownNodes = useMemo(
    () => nodes.map((n) => ({ ...n, style: { ...n.style, opacity: focus.dimNode(n.id) ? 0.25 : 1 } })),
    [nodes, focus.dimNode],
  );
  const shownEdges = useMemo(
    () =>
      edges.map((e) => {
        const o = focus.dimEdge(e.source, e.target) ? 0.12 : 1;
        return {
          ...e,
          style: { ...e.style, opacity: o },
          labelStyle: { ...(e.labelStyle ?? {}), opacity: o },
          labelBgStyle: { ...(e.labelBgStyle ?? {}), opacity: o },
        };
      }),
    [edges, focus.dimEdge],
  );

  return (
    <div className="space-y-3">
      {/* Per-kind filter toggles. Clicking hides a kind and its incident edges. */}
      <div className="flex flex-wrap items-center gap-2">
        {presentKinds.map((kind) => {
          const meta = KIND_META[kind];
          const active = visibleKinds.has(kind);
          return (
            <Badge key={kind} asChild variant={active ? "secondary" : "outline"}>
              <button
                type="button"
                onClick={() => toggleKind(kind)}
                aria-pressed={active}
                className={cn("gap-1.5 cursor-pointer", !active && "opacity-50")}
              >
                <span className={cn("size-2 rounded-full", meta.dot)} aria-hidden />
                {meta.label}
                <span className="text-muted-foreground">{countByKind[kind] ?? 0}</span>
              </button>
            </Badge>
          );
        })}
      </div>

      <div className="h-[70vh] w-full rounded-md border bg-card">
        <ReactFlow<GraphFlowNode, Edge>
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
          minZoom={0.15}
          proOptions={{ hideAttribution: true }}
        >
          <Background />
          <Controls showInteractive={false} />
          <MiniMap pannable zoomable className="bg-muted!" />
        </ReactFlow>
      </div>
    </div>
  );
}
