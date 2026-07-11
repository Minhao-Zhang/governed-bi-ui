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
  MOCK_SKILLS,
} from "@/lib/mock/fixtures";
import {
  answerViewSchema,
  assetListSchema,
  capabilitiesSchema,
  corpusHealthSchema,
  editResponseSchema,
  erGraphSchema,
  knowledgeGraphSchema,
  schemaListSchema,
  skillListSchema,
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

async function get<T>(path: string, schema: z.ZodType<T>, mock: T): Promise<T> {
  if (USE_MOCKS) return mock;

  let res: Response;
  try {
    res = await fetch(`${LANGGRAPH_URL}${path}`, { headers: { accept: "application/json" } });
  } catch {
    throw new ApiError(`Could not reach the backend at ${LANGGRAPH_URL}${path}.`);
  }
  if (!res.ok) throw new ApiError(`${path} returned ${res.status}.`, res.status);
  return parse(path, schema, await res.json());
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

  schema: (): Promise<TableView[]> => get("/schema", schemaListSchema, MOCK_SCHEMA),

  /** The full knowledge graph over all asset types (GET /knowledge-graph). */
  knowledgeGraph: (): Promise<KnowledgeGraph> =>
    get("/knowledge-graph", knowledgeGraphSchema, MOCK_GRAPH),

  /** The ER tables+joins graph (GET /graph): FK edges with cardinality + the
   * join predicate. Combined with /schema columns to draw the ER diagram. */
  erGraph: (): Promise<ErGraph> => get("/graph", erGraphSchema, MOCK_ER_GRAPH),

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
