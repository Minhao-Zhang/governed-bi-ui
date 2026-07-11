/**
 * The governed serve pipeline as labeled stages for the chat UI.
 *
 * The serve flow emits custom stage events (`get_stream_writer({stage, ...})`,
 * consumed via `useStream`'s `onCustomEvent`) — NOT node updates (the chat graph
 * has a single `answer` node). We map each event's `stage` string to a stable,
 * user-facing stage. The backend enumerates 8 stages; the fast-path ones
 * (`refuse_gate`, `cache_hit`) fold into the nearest visible step. Repairs surface
 * as `generate`/`guardrail` re-firing — real backend progress, never a timer.
 */

export const STAGES = [
  { id: "route", label: "Routing" },
  { id: "retrieve", label: "Retrieving" },
  { id: "generate", label: "Generating SQL" },
  { id: "guardrail", label: "Checking guardrails" },
  { id: "execute", label: "Executing" },
  { id: "compose", label: "Composing" },
] as const;

export type StageId = (typeof STAGES)[number]["id"];

export const STAGE_IDS: StageId[] = STAGES.map((s) => s.id);

const STAGE_ALIASES: Record<string, StageId> = {
  route: "route",
  routing: "route",
  refuse_gate: "route", // fast-path refusal folds into the routing step
  retrieve: "retrieve",
  retrieval: "retrieve",
  cache_hit: "generate", // semantic-cache hit supplies the SQL → show as generate
  generate: "generate",
  generate_sql: "generate",
  sqlgen: "generate",
  guardrail: "guardrail",
  guardrails: "guardrail",
  execute: "execute",
  stamp: "compose",
  narrate: "compose",
  compose: "compose",
};

/** Map a backend stage-event name (or node name) to a UI stage, or `null`. */
export function nodeToStage(node: string): StageId | null {
  return STAGE_ALIASES[node.trim().toLowerCase()] ?? null;
}

export function stageLabel(id: StageId): string {
  return STAGES.find((s) => s.id === id)?.label ?? id;
}
