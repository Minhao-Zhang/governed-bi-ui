/**
 * React Query hooks over the custom-route client. Consumers are Client
 * Components. Param-less keys stay stable so the whole app shares one cache;
 * scoped keys embed the scope so each D15 scope caches independently.
 *
 * Every D15 scope-on-demand hook is capability-gated: when `can_scope` /
 * `can_search` are absent (a pre-D15 engine, or mock with the flags off) the
 * hooks fall back to today's flat behavior — the full `/schema` dump, the whole
 * graph, and a client Fuse index — so the app runs unchanged against both engines.
 */

"use client";

import { useMemo } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api-client";
import { canScope, canSearch } from "@/lib/capabilities";
import { buildCatalogIndex, searchCatalog, summaryToCatalog, toCatalog } from "@/lib/catalog";
import type { CatalogItem, SchemaScope, TableView } from "@/lib/types";

export function useCapabilities() {
  return useQuery({ queryKey: ["capabilities"], queryFn: api.capabilities });
}

export function useHealth() {
  return useQuery({ queryKey: ["health"], queryFn: api.health });
}

/** The full flat `/schema` dump — the pre-D15 fallback + the column-detail and
 * catalog source when the engine cannot scope. Optional `schema` → wire `?schema=`. */
export function useSchema(options?: { enabled?: boolean; schema?: string }) {
  return useQuery({
    queryKey: options?.schema ? (["schema", options.schema] as const) : (["schema"] as const),
    queryFn: () => api.schema({ schema: options?.schema }),
    enabled: options?.enabled ?? true,
  });
}

/** Lean paginated catalog (GET /schema/summary; gated on can_scope). */
export function useSchemaSummary(scope?: SchemaScope, options?: { enabled?: boolean }) {
  const { data: caps } = useCapabilities();
  const scoped = canScope(caps);
  const enabled = (options?.enabled ?? true) && scoped;
  return useQuery({
    queryKey: ["schema-summary", scope?.schema ?? null],
    queryFn: () => api.schemaSummary({ schema: scope?.schema }),
    enabled,
    // Do NOT keepPreviousData: client filters stale items by the new namespace and
    // would flash an empty catalog while the next summary loads.
  });
}

/**
 * One table's full detail, resolved lazily when a detail sheet opens. In scoped
 * mode this hits GET /schema/{id}; in fallback mode it resolves the table from
 * the already-cached (or freshly fetched) `/schema` dump, so the sheet has a data
 * source without the page prop-drilling the whole array.
 */
export function useTableDetail(id: string | null) {
  const { data: caps } = useCapabilities();
  const scoped = canScope(caps);
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: ["table-detail", id, scoped],
    enabled: id !== null,
    queryFn: async (): Promise<TableView> => {
      if (scoped) return api.tableDetail(id!);
      const cached = queryClient.getQueryData<TableView[]>(["schema"]);
      const all = cached ?? (await api.schema());
      const table = all.find((t) => t.id === id);
      if (!table) throw new Error(`Table ${id} not found in the schema dump.`);
      return table;
    },
  });
}

/** The full knowledge graph (GET /knowledge-graph), optionally D15-scoped. */
export function useKnowledgeGraph(scope?: SchemaScope) {
  const { data: caps } = useCapabilities();
  const scoped = canScope(caps);
  return useQuery({
    queryKey: ["knowledge-graph", scoped ? scope ?? null : null],
    queryFn: () => api.knowledgeGraph(scoped ? scope : undefined),
    placeholderData: keepPreviousData,
  });
}

/** The ER tables+joins graph (GET /graph), optionally D15-scoped. */
export function useErGraph(scope?: SchemaScope) {
  const { data: caps } = useCapabilities();
  const scoped = canScope(caps);
  return useQuery({
    queryKey: ["er-graph", scoped ? scope ?? null : null],
    queryFn: () => api.erGraph(scoped ? scope : undefined),
    placeholderData: keepPreviousData,
  });
}

/**
 * The normalized catalog behind the search omnibox + schema rail. Source-agnostic:
 * the lean `/schema/summary` when scoped, the full `/schema` dump projected when
 * not. Callers never branch on which endpoint served it.
 */
export function useCatalog(scope?: SchemaScope) {
  const { data: caps } = useCapabilities();
  const scoped = canScope(caps);
  const summary = useSchemaSummary(scope, { enabled: scoped });
  const full = useSchema({ enabled: !scoped });
  // Primitive dep — callers often pass a fresh `{}` / scope object each render.
  const schemaFilter = scope?.schema;

  const items = useMemo<CatalogItem[]>(() => {
    const raw = scoped
      ? summary.data
        ? summaryToCatalog(summary.data.items)
        : []
      : full.data
        ? toCatalog(full.data)
        : [];
    // Belt-and-suspenders: keep the catalog aligned with the active namespace even
    // if a live summary response ignored the wire `schema` filter.
    if (schemaFilter) return raw.filter((it) => it.namespace === schemaFilter);
    return raw;
  }, [scoped, summary.data, full.data, schemaFilter]);

  return {
    items,
    isLoading: scoped ? summary.isLoading : full.isLoading,
    isError: scoped ? summary.isError : full.isError,
  };
}

/** Client-side fuzzy search over a catalog (the default; permanent at these
 * sizes per D15 Q6). Synchronous + memoized so the index isn't rebuilt per key. */
export function useCatalogSearch(items: CatalogItem[], query: string): CatalogItem[] {
  const index = useMemo(() => buildCatalogIndex(items), [items]);
  return useMemo(() => searchCatalog(index, items, query), [index, items, query]);
}

/** Server-ranked search (GET /search; gated on can_search, else no-op). */
export function useServerSearch(query: string) {
  const { data: caps } = useCapabilities();
  const enabled = canSearch(caps) && query.trim().length >= 2;
  return useQuery({
    queryKey: ["search", query],
    queryFn: () => api.search(query),
    enabled,
    placeholderData: keepPreviousData,
  });
}

export function useAssets(type?: string) {
  return useQuery({ queryKey: ["assets", type ?? "all"], queryFn: () => api.assets(type) });
}

/**
 * Every semantic-layer item touching one physical column (GET
 * /columns/{column_id}/related; §14), resolved lazily when a column is opened in
 * the detail sheet. `columnId` null disables the query. Not retried on 404 so an
 * unresolvable column surfaces immediately rather than after backoff.
 */
export function useColumnRelated(columnId: string | null) {
  return useQuery({
    queryKey: ["column-related", columnId],
    enabled: columnId !== null,
    queryFn: () => api.columnRelated(columnId!),
    retry: false,
  });
}

export function useSkills() {
  return useQuery({ queryKey: ["skills"], queryFn: api.skills });
}
