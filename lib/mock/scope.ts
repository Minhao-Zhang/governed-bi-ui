/**
 * Mock-only server simulation for the D15 scope-on-demand contract. In a live
 * D15 deployment the ENGINE scopes/bounds graphs and computes boundary edges;
 * in fallback mode there is no scoping at all (the whole graph is returned). So
 * this logic exists purely so mock mode (no backend) can exercise the scoped
 * flow — schema narrowing, focus/radius neighborhoods, node_budget truncation,
 * and navigable cross-schema boundary stubs — end to end.
 *
 * Truncation mirrors the engine's deterministic order (D15 Q8): BFS distance
 * from the focus node, then edge-confidence desc, then id asc.
 */

import type {
  BoundaryEdge,
  ErGraph,
  ErGraphEdge,
  GraphMeta,
  KnowledgeGraph,
  SchemaScope,
} from "@/lib/types";

const DEFAULT_ER_BUDGET = 60;
const DEFAULT_KG_BUDGET = 150;

function scopeMeta(
  totalNodes: number,
  returnedNodes: number,
  totalEdges: number,
  scope: SchemaScope | undefined,
): GraphMeta {
  return {
    total_nodes: totalNodes,
    returned_nodes: returnedNodes,
    total_edges: totalEdges,
    truncated: returnedNodes < totalNodes,
    scope: scope
      ? {
          schema: scope.schema ?? null,
          focus: scope.focus ?? null,
          radius: scope.radius ?? null,
          node_budget: scope.nodeBudget ?? null,
        }
      : undefined,
  };
}

/** BFS distance from a focus id over an undirected view of the edges. */
function bfsDistances(
  focus: string,
  adjacency: Map<string, Set<string>>,
  radius: number,
): Map<string, number> {
  const dist = new Map<string, number>([[focus, 0]]);
  let frontier = [focus];
  for (let d = 1; d <= radius && frontier.length; d++) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const nbr of adjacency.get(id) ?? []) {
        if (!dist.has(nbr)) {
          dist.set(nbr, d);
          next.push(nbr);
        }
      }
    }
    frontier = next;
  }
  return dist;
}

/* ── ER graph (table↔table) ──────────────────────────────────────────────── */

export function applyErGraphScope(base: ErGraph, scope: SchemaScope | undefined): ErGraph {
  if (!scope || (!scope.schema && !scope.focus)) {
    return {
      ...base,
      boundary: [],
      meta: scopeMeta(base.nodes.length, base.nodes.length, base.edges.length, scope),
    };
  }

  const nodeById = new Map(base.nodes.map((n) => [n.id, n]));
  const adjacency = new Map<string, Set<string>>();
  for (const e of base.edges) {
    if (!adjacency.has(e.source)) adjacency.set(e.source, new Set());
    if (!adjacency.has(e.target)) adjacency.set(e.target, new Set());
    adjacency.get(e.source)!.add(e.target);
    adjacency.get(e.target)!.add(e.source);
  }

  // 1. Candidate node set from schema filter and/or focus neighborhood.
  let candidates = base.nodes;
  if (scope.schema) candidates = candidates.filter((n) => n.schema === scope.schema);

  let distances: Map<string, number> | null = null;
  if (scope.focus) {
    distances = bfsDistances(scope.focus, adjacency, scope.radius ?? 1);
    candidates = base.nodes.filter((n) => distances!.has(n.id));
  }

  // 2. Deterministic order + node_budget truncation.
  const budget = scope.nodeBudget ?? DEFAULT_ER_BUDGET;
  const ordered = [...candidates].sort((a, b) => {
    if (distances) {
      const da = distances.get(a.id) ?? Infinity;
      const db = distances.get(b.id) ?? Infinity;
      if (da !== db) return da - db;
    }
    return a.id.localeCompare(b.id);
  });
  const kept = ordered.slice(0, budget);
  const keptIds = new Set(kept.map((n) => n.id));

  // 3. In-scope edges + boundary edges (one endpoint in scope, one out).
  const inScopeEdges: ErGraphEdge[] = [];
  const boundary: BoundaryEdge[] = [];
  for (const e of base.edges) {
    const srcIn = keptIds.has(e.source);
    const tgtIn = keptIds.has(e.target);
    if (srcIn && tgtIn) {
      inScopeEdges.push(e);
    } else if (srcIn || tgtIn) {
      const inId = srcIn ? e.source : e.target;
      const outId = srcIn ? e.target : e.source;
      const out = nodeById.get(outId);
      const inNode = nodeById.get(inId);
      // Only a crossing into a *different* schema is a boundary worth showing.
      if (out && inNode && out.schema && out.schema !== inNode.schema) {
        boundary.push({
          id: `boundary_${e.id}`,
          in_scope_table: inId,
          other_schema: out.schema,
          other_table_id: out.id,
          other_label: out.physical_name,
          on: e.on,
          cardinality: e.cardinality,
          confidence: e.confidence,
          low_confidence: e.low_confidence,
        });
      }
    }
  }

  return {
    nodes: kept,
    edges: inScopeEdges,
    boundary,
    meta: scopeMeta(candidates.length, kept.length, inScopeEdges.length, scope),
  };
}

/* ── Knowledge graph (assets of every kind) ──────────────────────────────── */

export function applyKnowledgeGraphScope(
  base: KnowledgeGraph,
  scope: SchemaScope | undefined,
): KnowledgeGraph {
  if (!scope || (!scope.schema && !scope.focus)) {
    return {
      ...base,
      boundary: [],
      meta: scopeMeta(base.nodes.length, base.nodes.length, base.edges.length, scope),
    };
  }

  const nodeById = new Map(base.nodes.map((n) => [n.id, n]));
  const adjacency = new Map<string, Set<string>>();
  for (const e of base.edges) {
    if (!adjacency.has(e.source)) adjacency.set(e.source, new Set());
    if (!adjacency.has(e.target)) adjacency.set(e.target, new Set());
    adjacency.get(e.source)!.add(e.target);
    adjacency.get(e.target)!.add(e.source);
  }

  // Table nodes carry a schema; asset nodes (metric/term/join/…) don't, so an
  // asset is in scope when it connects to an in-scope table.
  let tableIds: Set<string>;
  let distances: Map<string, number> | null = null;
  if (scope.focus) {
    distances = bfsDistances(scope.focus, adjacency, scope.radius ?? 1);
    tableIds = new Set([...distances.keys()]);
  } else {
    tableIds = new Set(
      base.nodes.filter((n) => n.schema && n.schema === scope.schema).map((n) => n.id),
    );
  }

  const keep = new Set<string>(tableIds);
  // Pull in connected asset nodes (one hop) so the neighborhood stays legible.
  for (const e of base.edges) {
    if (keep.has(e.source)) keep.add(e.target);
    if (keep.has(e.target)) keep.add(e.source);
  }

  const budget = scope.nodeBudget ?? DEFAULT_KG_BUDGET;
  const ordered = [...keep]
    .map((id) => nodeById.get(id))
    .filter((n): n is NonNullable<typeof n> => Boolean(n))
    .sort((a, b) => {
      if (distances) {
        const da = distances.get(a.id) ?? Infinity;
        const db = distances.get(b.id) ?? Infinity;
        if (da !== db) return da - db;
      }
      return a.id.localeCompare(b.id);
    });
  const kept = ordered.slice(0, budget);
  const keptIds = new Set(kept.map((n) => n.id));
  const inScopeEdges = base.edges.filter((e) => keptIds.has(e.source) && keptIds.has(e.target));

  // Boundary: a join node bridging an in-scope table and an out-of-scope table
  // in a different schema (the navigable cross-schema case).
  const boundary: BoundaryEdge[] = [];
  for (const node of base.nodes) {
    if (node.kind !== "join") continue;
    const endpoints = [...(adjacency.get(node.id) ?? [])]
      .map((id) => nodeById.get(id))
      .filter((n): n is NonNullable<typeof n> => Boolean(n) && n!.kind === "table");
    if (endpoints.length !== 2) continue;
    const [x, y] = endpoints;
    const xIn = keptIds.has(x.id);
    const yIn = keptIds.has(y.id);
    if (xIn === yIn) continue; // both in or both out — not a crossing
    const inNode = xIn ? x : y;
    const out = xIn ? y : x;
    if (out.schema && out.schema !== inNode.schema) {
      boundary.push({
        id: `boundary_${node.id}`,
        in_scope_table: inNode.id,
        other_schema: out.schema,
        other_table_id: out.id,
        other_label: out.label,
        on: node.label,
        cardinality: null,
        confidence: node.confidence ?? null,
        low_confidence: (node.confidence ?? 1) < 0.7,
      });
    }
  }

  return {
    nodes: kept,
    edges: inScopeEdges,
    boundary,
    meta: scopeMeta(keep.size, kept.length, inScopeEdges.length, scope),
  };
}

/* ── /schema/summary derivation ──────────────────────────────────────────── */

export function filterSummaryItems<T extends { schema: string }>(
  items: T[],
  scope: { schema?: string; limit?: number; offset?: number } | undefined,
): { total: number; items: T[] } {
  let rows = items;
  if (scope?.schema) rows = rows.filter((r) => r.schema === scope.schema);
  const total = rows.length;
  const offset = scope?.offset ?? 0;
  const limit = scope?.limit ?? rows.length;
  return { total, items: rows.slice(offset, offset + limit) };
}
