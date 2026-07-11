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
  Search,
  Table2,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { layoutGraph } from "@/lib/graph-layout";
import { useFocusContext } from "@/components/schema/use-focus-context";
import type { GraphNode, GraphNodeKind, KnowledgeGraph } from "@/lib/types";

/* ── Per-kind presentation ────────────────────────────────────────────────── */

type Shape = "square" | "circle" | "rounded" | "diamond" | "hexagon" | "octagon";

type KindMeta = {
  label: string;
  icon: LucideIcon;
  /** Shape encodes the asset kind (accessible, colorblind-safe; Chen-ER
   * convention: entity = rectangle, relationship = diamond). */
  shape: Shape;
  /** A COOL categorical fill for the kind — deliberately avoids green/amber/red,
   * which stay reserved for the reliability channel (suspect / excluded). */
  fill: string;
};

const KIND_META: Record<GraphNodeKind, KindMeta> = {
  table: { label: "Table", icon: Table2, shape: "square", fill: "bg-slate-600" },
  join: { label: "Join", icon: Link2, shape: "diamond", fill: "bg-cyan-600" },
  metric: { label: "Metric", icon: Gauge, shape: "circle", fill: "bg-violet-600" },
  term: { label: "Term", icon: BookText, shape: "rounded", fill: "bg-indigo-600" },
  rule: { label: "Rule", icon: Scale, shape: "hexagon", fill: "bg-blue-600" },
  few_shot: { label: "Few-shot", icon: Lightbulb, shape: "rounded", fill: "bg-sky-600" },
  negative_example: { label: "Negative", icon: Ban, shape: "octagon", fill: "bg-fuchsia-600" },
};

/** Non-rectangular shapes via clip-path (inline style — reliable, unlike JIT
 * arbitrary utilities); the icon stays upright and centered inside. */
const CLIP: Partial<Record<Shape, string>> = {
  diamond: "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)",
  hexagon: "polygon(25% 6%, 75% 6%, 100% 50%, 75% 94%, 25% 94%, 0% 50%)",
  octagon: "polygon(30% 0%, 70% 0%, 100% 30%, 100% 70%, 70% 100%, 30% 100%, 0% 70%, 0% 30%)",
};
const RADIUS: Partial<Record<Shape, string>> = {
  square: "rounded-[3px]",
  circle: "rounded-full",
  rounded: "rounded-lg",
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

/** Kinds hidden by default to reduce clutter. Joins are the structural table↔table
 * relationships, shown primarily (with cardinality) in the Relationships (ER) view;
 * here they can be toggled back on. */
const DEFAULT_HIDDEN_KINDS: GraphNodeKind[] = ["join"];

const defaultVisible = (present: GraphNodeKind[]): Set<GraphNodeKind> =>
  new Set(present.filter((k) => !DEFAULT_HIDDEN_KINDS.includes(k)));

const COL_SPACING = 220;
const ROW_SPACING = 90;

// Fixed node box: a shape glyph at the top, label + kind caption below. Declaring
// width/height + predefined handle bounds lets React Flow anchor edges without
// waiting on DOM measurement (which can silently never complete in flex/tab
// containers, leaving edges unrendered).
const GLYPH = 52;
const GLYPH_TOP = 6;
const GLYPH_CY = GLYPH_TOP + GLYPH / 2; // edges attach at the glyph's centre
const NODE_W = 132;
const NODE_H = 108;

/** Edge anchor points (glyph centre height), resolved measurement-free. */
const PREDEFINED_HANDLES: NodeHandle[] = [
  { id: null, type: "target", position: Position.Left, x: 0, y: GLYPH_CY, width: 1, height: 1 },
  { id: null, type: "source", position: Position.Right, x: NODE_W, y: GLYPH_CY, width: 1, height: 1 },
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

/** The shape glyph: a shaped, colored badge (shape+color+icon all encode the
 * kind) with reliability overlays — an amber dot for a suspect column, a red dot
 * + dimming when excluded. */
function ShapeGlyph({
  kind,
  suspect,
  excluded,
  selected,
}: {
  kind: GraphNodeKind;
  suspect: boolean;
  excluded: boolean;
  selected: boolean;
}) {
  const meta = KIND_META[kind];
  const Icon = meta.icon;
  const clip = CLIP[meta.shape];

  return (
    <div className="relative" style={{ width: GLYPH, height: GLYPH }}>
      {/* Selection halo (behind, unclipped — a ring on a clipped shape is cut off). */}
      {selected && <div className="absolute -inset-1 rounded-xl ring-2 ring-ring" aria-hidden />}
      <div
        className={cn("flex size-full items-center justify-center text-white shadow-sm", meta.fill, RADIUS[meta.shape])}
        style={clip ? { clipPath: clip } : undefined}
      >
        <Icon className="size-5" strokeWidth={2} aria-hidden />
      </div>
      {suspect && (
        <span
          className="absolute -right-1 -top-1 size-3 rounded-full bg-tier-lineage ring-2 ring-card"
          title="Contains a suspect column"
          aria-hidden
        />
      )}
      {excluded && (
        <span
          className="absolute -bottom-1 -right-1 size-3 rounded-full bg-tier-refused ring-2 ring-card"
          title="Excluded from the served surface"
          aria-hidden
        />
      )}
    </div>
  );
}

/** A typed node: shape/color/icon all encode the kind (redundant + accessible),
 * with a clear label + kind caption below. */
function GraphNodeCard({ data, selected }: NodeProps<GraphFlowNode>) {
  const meta = KIND_META[data.kind];

  return (
    <div
      className={cn("flex cursor-pointer flex-col items-center gap-1.5", data.excluded && "opacity-60")}
      style={{ width: NODE_W }}
    >
      {/* Edges attach at the glyph centre. */}
      <Handle type="target" position={Position.Left} className="opacity-0!" style={{ top: GLYPH_CY }} />
      <Handle type="source" position={Position.Right} className="opacity-0!" style={{ top: GLYPH_CY }} />

      <ShapeGlyph kind={data.kind} suspect={data.hasSuspect} excluded={data.excluded} selected={selected} />

      <div
        className="line-clamp-2 max-w-full text-center text-sm font-medium leading-tight break-words"
        title={data.label}
      >
        {data.label}
      </div>
      <div className="text-[0.6rem] font-medium uppercase tracking-wide text-muted-foreground">
        {meta.label}
      </div>
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

/** Build flow nodes for the nodes passing `include` (initial grid positions are
 * overwritten by dagre in `computed`). */
function layoutNodes(graph: KnowledgeGraph, include: (n: GraphNode) => boolean): GraphFlowNode[] {
  const rowInColumn: Partial<Record<GraphNodeKind, number>> = {};
  return graph.nodes
    .filter(include)
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

  // Visible kinds; start with the default-visible set (joins hidden). New Set on
  // each toggle so the memo below recomputes.
  const [visibleKinds, setVisibleKinds] = useState<Set<GraphNodeKind>>(() =>
    defaultVisible(presentKinds),
  );
  // Name filter + a governance toggle to hide excluded assets.
  const [query, setQuery] = useState("");
  const [hideExcluded, setHideExcluded] = useState(false);

  // Re-seed the filter set only when the SET of present kinds actually changes
  // (keyed by content, not the graph object's identity — otherwise a refetch that
  // returns the same kinds would wipe the user's filter selection).
  useEffect(() => {
    setVisibleKinds(defaultVisible(presentKinds));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presentKinds.join(",")]);

  const computed = useMemo(() => {
    const q = query.trim().toLowerCase();
    const include = (n: GraphNode) =>
      visibleKinds.has(n.kind) &&
      (!hideExcluded || !(n.excluded ?? false)) &&
      (q === "" || n.label.toLowerCase().includes(q));

    const nodes = layoutNodes(graph, include);
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
    return { nodes: positioned, edges, shown: positioned.length, total: graph.nodes.length };
  }, [graph, visibleKinds, query, hideExcluded]);

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

  const reset = () => {
    setQuery("");
    setHideExcluded(false);
    setVisibleKinds(defaultVisible(presentKinds));
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
    <div className="space-y-2">
      {/* Name filter + governance toggle + reset + count. */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by name…"
            aria-label="Filter nodes by name"
            className="h-8 w-56 pl-7"
          />
        </div>
        <Badge asChild variant={hideExcluded ? "secondary" : "outline"}>
          <button
            type="button"
            onClick={() => setHideExcluded((v) => !v)}
            aria-pressed={hideExcluded}
            className="cursor-pointer"
          >
            Hide excluded
          </button>
        </Badge>
        <button
          type="button"
          onClick={reset}
          className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          Reset
        </button>
        <span className="ml-auto text-xs text-muted-foreground">
          {computed.shown} of {computed.total} shown
        </span>
      </div>

      {/* Per-kind filter toggles (joins hidden by default — shown in Relationships). */}
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
                <span className={cn("size-2 rounded-full", meta.fill)} aria-hidden />
                {meta.label}
                <span className="text-muted-foreground">{countByKind[kind] ?? 0}</span>
              </button>
            </Badge>
          );
        })}
      </div>

      <div className="h-[70vh] w-full rounded-md border bg-card">
        {computed.shown === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
            <span>No assets match the current filters.</span>
            <button
              type="button"
              onClick={reset}
              className="text-xs underline underline-offset-2 hover:text-foreground"
            >
              Reset filters
            </button>
          </div>
        ) : (
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
        )}
      </div>
    </div>
  );
}
