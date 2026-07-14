/**
 * The agent-path step model: wire events → UI timeline rows.
 *
 * The governed serve engine emits a **governance ledger** entry for every
 * governed action (ADR 0002 Inv #10). On the agent path those entries are
 * streamed live as custom events (`GovEvent`) instead of only at the end, so the
 * live step view and the final `Provenance` audit are one data source. This
 * module owns that contract on the frontend:
 *
 *  - `reduceSteps` folds the ordered event stream into append-only rows,
 *    merging a tool's `start` and its `ok/blocked/error` resolution into one row.
 *  - `buildStepsFromLedger` maps the completed `governance_ledger` to the SAME
 *    rows, so the post-answer audit reuses the live renderer.
 *
 * The step view is driven by these custom events only — never by the agent's
 * internal chat messages (ADR 0001 / gotcha G2), which stay node-local.
 */

import {
  Play,
  Search,
  Table2,
  Rows3,
  Filter,
  ShieldCheck,
  Sparkles,
  Database,
  type LucideIcon,
} from "lucide-react";

/** The custom stream event (backend contract). start/resolve of a tool share `id`. */
export interface GovEvent {
  seq: number;
  id?: string; // stable per logical step; start + resolve share it
  kind: "rail" | "tool" | "final";
  /** route|refuse_gate|cache|assemble|finalize | search_corpus|inspect_schema|sample_rows|run_query */
  step: string;
  status: "start" | "ok" | "blocked" | "error" | "refused" | "cap" | "hit" | "miss";
  label?: string;
  /** attempt, sql, verdict, layer, reason, rows, tables, columns, few_shots, schema, table_id, … */
  detail?: Record<string, unknown>;
  serve_path?: "flow" | "agent"; // present on the first event of a turn
}

/** The resolved statuses a row can settle into (everything except `start`). */
export type StepStatus = "running" | "ok" | "blocked" | "error" | "refused" | "cap" | "hit" | "miss";

/** The UI row (a tool's start + resolve merged into one row). */
export interface TimelineStep {
  key: string;
  seq: number;
  kind: GovEvent["kind"];
  step: string;
  status: StepStatus;
  label: string;
  detail: Record<string, unknown>;
}

const TOOL_STEPS = new Set([
  "search_corpus",
  "inspect_schema",
  "sample_rows",
  "run_query",
]);

export function isTool(step: string): boolean {
  return TOOL_STEPS.has(step);
}

export function isRail(step: string): boolean {
  return !isTool(step);
}

/** Icon per step, so rails and each tool read distinctly at a glance. */
export function stepIcon(step: string): LucideIcon {
  switch (step) {
    case "search_corpus":
      return Search;
    case "inspect_schema":
      return Table2;
    case "sample_rows":
      return Rows3;
    case "run_query":
      return Play;
    case "assemble":
      return Filter;
    case "refuse_gate":
      return ShieldCheck;
    case "cache":
      return Database;
    default:
      return Sparkles;
  }
}

function num(detail: Record<string, unknown> | undefined, key: string): number | null {
  const v = detail?.[key];
  return typeof v === "number" ? v : null;
}

function str(detail: Record<string, unknown> | undefined, key: string): string | null {
  const v = detail?.[key];
  return typeof v === "string" && v.length > 0 ? v : null;
}

/** A short human label when the backend omits `label` (mirrors the spec table). */
export function defaultLabel(ev: {
  step: string;
  status: GovEvent["status"] | StepStatus;
  detail?: Record<string, unknown>;
}): string {
  const d = ev.detail;
  switch (ev.step) {
    case "route":
      return d?.intent ? `Understood the question (${String(d.intent)})` : "Understood the question";
    case "refuse_gate":
      return ev.status === "refused" ? "Safety gate: refused" : "Safety gate: cleared";
    case "cache":
      return ev.status === "hit" ? "Served from cache" : "Checked cache";
    case "assemble":
      return "Assembled governed context";
    case "finalize":
      return ev.status === "refused" ? "Refused" : "Composed answer";
    case "search_corpus":
      return "Searched corpus";
    case "inspect_schema": {
      const table = str(d, "table_id");
      return table ? `Inspected ${table}` : "Inspected schema";
    }
    case "sample_rows": {
      const table = str(d, "table_id");
      return table ? `Sampled ${table}` : "Sampled rows";
    }
    case "run_query":
      return "Ran query";
    default:
      return ev.step;
  }
}

/**
 * Fold one event into the accumulated rows. A tool's `start` and its resolution
 * share `id`, so they merge into a single row (status advances `running` → the
 * terminal status, detail deep-merges). Rows stay ordered by their first `seq`.
 */
export function reduceSteps(prev: TimelineStep[], ev: GovEvent): TimelineStep[] {
  const key = ev.id ?? `${ev.step}:${ev.seq}`;
  const status: StepStatus = ev.status === "start" ? "running" : ev.status;
  const i = prev.findIndex((s) => s.key === key);
  const detail = { ...(prev[i]?.detail ?? {}), ...(ev.detail ?? {}) };
  const merged: TimelineStep = {
    key,
    seq: i >= 0 ? prev[i].seq : ev.seq,
    kind: ev.kind,
    step: ev.step,
    status,
    label: ev.label ?? prev[i]?.label ?? defaultLabel({ ...ev, detail }),
    detail,
  };
  const next = i >= 0 ? prev.map((s, j) => (j === i ? merged : s)) : [...prev, merged];
  return next.sort((a, b) => a.seq - b.seq);
}

/** Count of `run_query` rows that were blocked/error before the final one. */
export function countRepairs(steps: TimelineStep[]): number {
  const attempts = steps.filter((s) => s.step === "run_query");
  return attempts.filter((s) => s.status === "blocked" || s.status === "error").length;
}

/** One-line summary shown when the completed trace collapses. */
export function summarizeSteps(steps: TimelineStep[]): string {
  const tools = steps.filter((s) => s.kind === "tool");
  const repairs = countRepairs(steps);
  const parts = [`${tools.length} step${tools.length === 1 ? "" : "s"}`];
  if (repairs > 0) parts.push(`${repairs} repair${repairs === 1 ? "" : "s"}`);
  return `Reasoning · ${parts.join(", ")}`;
}

/**
 * One governance-ledger entry as it lands on `answer.provenance.governance_ledger`.
 * Loosely typed — the engine owns the exact shape and it may grow; we read the
 * fields we render and pass the rest through as `detail`.
 */
export interface LedgerEntry {
  action?: string;
  step?: string;
  kind?: GovEvent["kind"];
  status?: string;
  verdict?: string;
  allowed?: boolean;
  attempt?: number;
  layer?: string;
  reason?: string;
  sql?: string;
  label?: string;
  [k: string]: unknown;
}

function ledgerStatus(entry: LedgerEntry): StepStatus {
  const explicit = entry.status;
  if (explicit === "ok" || explicit === "blocked" || explicit === "error" || explicit === "refused") {
    return explicit;
  }
  if (entry.allowed === false) return "blocked";
  const verdict = String(entry.verdict ?? "").toLowerCase();
  if (verdict.includes("block")) return "blocked";
  if (verdict.includes("error")) return "error";
  if (verdict.includes("refus")) return "refused";
  return "ok";
}

/**
 * Map a completed `governance_ledger` to the same `TimelineStep[]` the live
 * stream produces, so the audit trace and the live trace are one renderer over
 * one data shape. Returns `[]` for anything that isn't a non-empty array.
 */
export function buildStepsFromLedger(ledger: unknown): TimelineStep[] {
  if (!Array.isArray(ledger)) return [];
  return ledger
    .filter((e): e is LedgerEntry => e != null && typeof e === "object")
    .map((entry, index) => {
      const step = entry.step ?? entry.action ?? "step";
      const kind: GovEvent["kind"] =
        entry.kind ?? (step === "finalize" ? "final" : isTool(step) ? "tool" : "rail");
      const status = ledgerStatus(entry);
      const detail = { ...entry };
      return {
        key: `ledger:${index}`,
        seq: index,
        kind,
        step,
        status,
        label: entry.label ?? defaultLabel({ step, status, detail }),
        detail,
      } satisfies TimelineStep;
    });
}

/** Small helpers reused by the row renderer for counts. */
export const stepCounts = { num, str };
