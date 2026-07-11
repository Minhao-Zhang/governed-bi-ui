/**
 * Synchronous graph layout via dagre, shared by the ER diagram and the knowledge
 * graph. Dagre is sync (unlike ELK), so callers compute positions in a `useMemo`
 * from their nodes/edges — no layout-in-effect, no React Flow #4153 loop guard.
 *
 * Dagre reports node positions as CENTER coordinates; we convert to the TOP-LEFT
 * origin React Flow expects. Node dimensions are supplied by the caller (React
 * Flow measures the DOM, but layered layout needs sizes up front, so we pass
 * estimates — card width is fixed, height derived from row count).
 */

import dagre from "@dagrejs/dagre";

export interface LayoutNode {
  id: string;
  width: number;
  height: number;
  /** Optional dagre rank partition (lower = earlier column/row). */
  rank?: number;
}

export interface LayoutEdge {
  source: string;
  target: string;
}

export interface LayoutOptions {
  direction?: "LR" | "TB";
  nodeSep?: number;
  rankSep?: number;
}

export type Positions = Record<string, { x: number; y: number }>;

export function layoutGraph(
  nodes: LayoutNode[],
  edges: LayoutEdge[],
  opts: LayoutOptions = {},
): Positions {
  const g = new dagre.graphlib.Graph();
  g.setGraph({
    rankdir: opts.direction ?? "LR",
    nodesep: opts.nodeSep ?? 56,
    ranksep: opts.rankSep ?? 120,
    marginx: 24,
    marginy: 24,
  });
  g.setDefaultEdgeLabel(() => ({}));

  for (const n of nodes) g.setNode(n.id, { width: n.width, height: n.height });
  for (const e of edges) {
    // Dagre requires both endpoints to exist; skip dangling edges defensively.
    if (g.hasNode(e.source) && g.hasNode(e.target) && e.source !== e.target) {
      g.setEdge(e.source, e.target);
    }
  }

  dagre.layout(g);

  const positions: Positions = {};
  for (const n of nodes) {
    const laid = g.node(n.id);
    // Dangling/unlaid nodes fall back to origin; dagre gives all set nodes a spot.
    positions[n.id] = laid
      ? { x: laid.x - n.width / 2, y: laid.y - n.height / 2 }
      : { x: 0, y: 0 };
  }
  return positions;
}
