/**
 * Typed client for the engine's custom REST routes (handoff §4), mounted on the
 * LangGraph Server. Every response is validated with zod at the boundary
 * (fail-loud). Streaming chat goes through `useStream` (see the chat feature);
 * this covers the read routes, the non-streaming `POST /chat` fallback, and the
 * dev `POST /corpus/edit`.
 *
 * In mock mode (`USE_MOCKS`, i.e. no `NEXT_PUBLIC_LANGGRAPH_URL`) each call
 * resolves to a neutral placeholder from `lib/mock/fixtures`, so the UI renders
 * with no backend. With a URL set, the mocks are never touched.
 */

import { z } from "zod";

import { LANGGRAPH_URL, USE_MOCKS } from "@/lib/env";
import {
  MOCK_ANSWER,
  MOCK_ASSETS,
  MOCK_CAPABILITIES,
  MOCK_ER_GRAPH,
  MOCK_GRAPH,
  MOCK_HEALTH,
  MOCK_REFUSAL,
  MOCK_SCHEMA,
  MOCK_SCHEMA_SUMMARY,
  MOCK_SKILLS,
} from "@/lib/mock/fixtures";
import {
  applyErGraphScope,
  applyKnowledgeGraphScope,
  filterSummaryItems,
} from "@/lib/mock/scope";
import {
  answerViewSchema,
  assetListSchema,
  capabilitiesSchema,
  corpusHealthSchema,
  editResponseSchema,
  erGraphSchema,
  knowledgeGraphSchema,
  schemaListSchema,
  schemaSummaryResponseSchema,
  searchResponseSchema,
  skillListSchema,
  tableViewSchema,
} from "@/lib/schemas";
import type {
  AnswerView,
  AssetRow,
  Capabilities,
  ChatTurn,
  CorpusHealth,
  EditResponse,
  ErGraph,
  KnowledgeGraph,
  SchemaScope,
  SchemaSummaryResponse,
  SearchResponse,
  SkillView,
  TableView,
} from "@/lib/types";

/** Questions routed to a refusal in mock mode (mirrors the engine's fail-closed
 * negative-example / excluded-field gates). */
const MOCK_REFUSAL_PATTERN = /restrict|exclud|pii|card|secret|password/i;

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function parse<T>(path: string, schema: z.ZodType<T>, data: unknown): T {
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    throw new ApiError(`${path} response did not match the expected schema.`);
  }
  return parsed.data;
}

/** Fetch + zod-parse a live route (mock handled by the caller). */
async function getLive<T>(path: string, schema: z.ZodType<T>): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${LANGGRAPH_URL}${path}`, { headers: { accept: "application/json" } });
  } catch {
    throw new ApiError(`Could not reach the backend at ${LANGGRAPH_URL}${path}.`);
  }
  if (!res.ok) throw new ApiError(`${path} returned ${res.status}.`, res.status);
  return parse(path, schema, await res.json());
}

async function get<T>(path: string, schema: z.ZodType<T>, mock: T): Promise<T> {
  if (USE_MOCKS) return mock;
  return getLive(path, schema);
}

/** Build a `?a=1&b=2` query string, dropping empty/undefined params. */
function qs(params: Record<string, string | number | undefined | null>): string {
  const parts = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return parts.length ? `?${parts.join("&")}` : "";
}

/** Map a UI `SchemaScope` onto the D15 graph query params. */
function scopeQuery(scope?: SchemaScope): string {
  if (!scope) return "";
  return qs({
    schema: scope.schema,
    focus: scope.focus,
    radius: scope.radius,
    node_budget: scope.nodeBudget,
    kinds: scope.kinds?.length ? scope.kinds.join(",") : undefined,
  });
}

async function post<T>(path: string, body: unknown, schema: z.ZodType<T>): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${LANGGRAPH_URL}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ApiError(`Could not reach the backend at ${LANGGRAPH_URL}${path}.`);
  }
  if (!res.ok) throw new ApiError(`${path} returned ${res.status}.`, res.status);
  return parse(path, schema, await res.json());
}

export const api = {
  capabilities: (): Promise<Capabilities> =>
    get("/capabilities", capabilitiesSchema, MOCK_CAPABILITIES),

  health: (): Promise<CorpusHealth> => get("/health", corpusHealthSchema, MOCK_HEALTH),

  /** The full flat schema dump (GET /schema). Retained as the pre-D15 fallback
   * and the source the client Fuse index / lazy detail read from when the engine
   * cannot scope (capabilities.can_scope === false). */
  schema: (): Promise<TableView[]> => get("/schema", schemaListSchema, MOCK_SCHEMA),

  /** Lean, scopeable, paginated catalog (GET /schema/summary; D15, gated on
   * can_scope). Backs the virtualized browser + the search index. */
  schemaSummary: (scope?: {
    schema?: string;
    limit?: number;
    offset?: number;
  }): Promise<SchemaSummaryResponse> => {
    if (USE_MOCKS) return Promise.resolve(filterSummaryItems(MOCK_SCHEMA_SUMMARY.items, scope));
    const query = qs({ schema: scope?.schema, limit: scope?.limit, offset: scope?.offset });
    return getLive(`/schema/summary${query}`, schemaSummaryResponseSchema);
  },

  /** One table's full detail (GET /schema/{id}; D15, gated on can_scope), fetched
   * lazily when a detail sheet opens. `id` is globally unique, so no compound key. */
  tableDetail: (id: string): Promise<TableView> => {
    if (USE_MOCKS) {
      const table = MOCK_SCHEMA.find((t) => t.id === id);
      if (!table) return Promise.reject(new ApiError(`/schema/${id} not found.`, 404));
      return Promise.resolve(table);
    }
    return getLive(`/schema/${encodeURIComponent(id)}`, tableViewSchema);
  },

  /** Server-ranked search (GET /search; D15 DEFERRED, gated on can_search). The
   * default path is the client Fuse index (see lib/catalog.ts); this is only
   * called when capabilities.can_search is true. */
  search: (q: string): Promise<SearchResponse> => {
    if (USE_MOCKS) {
      const needle = q.trim().toLowerCase();
      const hits = MOCK_SCHEMA_SUMMARY.items
        .filter((t) => t.physical_name.toLowerCase().includes(needle))
        .map((t) => ({
          kind: "table",
          id: t.id,
          table_id: t.id,
          label: t.physical_name,
          schema: t.schema,
          detail: null,
          excluded: t.excluded,
          has_suspect: t.has_suspect,
          score: 1,
        }));
      return Promise.resolve({ query: q, total: hits.length, hits });
    }
    return getLive(`/search${qs({ q })}`, searchResponseSchema);
  },

  /** The full knowledge graph over all asset types (GET /knowledge-graph).
   * Optional D15 scope (schema/focus/radius/node_budget/kinds) returns a bounded
   * neighborhood + boundary/meta envelope; no scope = today's full graph. */
  knowledgeGraph: (scope?: SchemaScope): Promise<KnowledgeGraph> => {
    if (USE_MOCKS) return Promise.resolve(applyKnowledgeGraphScope(MOCK_GRAPH, scope));
    return getLive(`/knowledge-graph${scopeQuery(scope)}`, knowledgeGraphSchema);
  },

  /** The ER tables+joins graph (GET /graph): FK edges with cardinality + the
   * join predicate. Combined with /schema columns to draw the ER diagram.
   * Accepts the same optional D15 scope as knowledgeGraph. */
  erGraph: (scope?: SchemaScope): Promise<ErGraph> => {
    if (USE_MOCKS) return Promise.resolve(applyErGraphScope(MOCK_ER_GRAPH, scope));
    return getLive(`/graph${scopeQuery(scope)}`, erGraphSchema);
  },

  assets: (type?: string): Promise<AssetRow[]> =>
    get(
      type ? `/corpus/assets?type=${encodeURIComponent(type)}` : "/corpus/assets",
      assetListSchema,
      type ? MOCK_ASSETS.filter((a) => a.asset_type === type) : MOCK_ASSETS,
    ),

  skills: (): Promise<SkillView[]> => get("/skills", skillListSchema, MOCK_SKILLS),

  /** Non-streaming one-shot answer (POST /chat) — the fallback when the backend
   * reports `can_stream: false`. Streaming chat uses `useStream` instead. */
  chat: (question: string, history: ChatTurn[], sessionId: string): Promise<AnswerView> => {
    if (USE_MOCKS) {
      return Promise.resolve(MOCK_REFUSAL_PATTERN.test(question) ? MOCK_REFUSAL : MOCK_ANSWER);
    }
    return post(
      "/chat",
      { question, session_id: sessionId, history },
      answerViewSchema,
    );
  },

  /** Validate + write a corpus asset (POST /corpus/edit; dev, gated on can_edit). */
  edit: (asset: Record<string, unknown>): Promise<EditResponse> => {
    if (USE_MOCKS) {
      return Promise.resolve({
        written: false,
        asset_id: String(asset.id ?? "unknown"),
        asset_type: String(asset.asset_type ?? "unknown"),
        path: null,
        findings: ["Editing requires a connected dev backend."],
        diff: "",
      });
    }
    return post("/corpus/edit", { asset }, editResponseSchema);
  },
};
