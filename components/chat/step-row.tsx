"use client";

import { useState } from "react";
import {
  AlertTriangle,
  Check,
  ChevronRight,
  Loader2,
  XCircle,
} from "lucide-react";

import { SqlBlock } from "@/components/answer/sql-block";
import { type StepStatus, type TimelineStep } from "@/lib/steps";
import { cn } from "@/lib/utils";

/**
 * One row of the agent timeline: a status icon, the step label, an optional
 * `run_query` attempt badge, and an expandable governance detail. The row IS the
 * governance-ledger entry (live or from the completed audit) — same component,
 * same data (§ agent-step-visualization).
 */
export function StepRow({ step, indent = false }: { step: TimelineStep; indent?: boolean }) {
  const [open, setOpen] = useState(false);
  const detail = step.detail ?? {};
  const attempt = typeof detail.attempt === "number" ? detail.attempt : null;
  const expandable = hasDetail(step);

  const label = (
    <span className="flex min-w-0 items-center gap-2">
      <StepGlyph step={step} />
      <span className={cn("truncate", step.status === "running" && "font-medium")}>{step.label}</span>
      {attempt !== null && (
        <span
          className={cn(
            "shrink-0 rounded-full border px-1.5 py-px text-[10px] font-medium tabular-nums",
            step.status === "blocked" || step.status === "error"
              ? "border-tier-fenced-raw/50 text-tier-fenced-raw"
              : "border-border text-muted-foreground",
          )}
        >
          attempt {attempt}
        </span>
      )}
    </span>
  );

  return (
    <li
      className={cn("text-sm", indent && "ml-6")}
      aria-current={step.status === "running" ? "step" : undefined}
    >
      {expandable ? (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex w-full items-center gap-1 rounded py-0.5 text-left hover:bg-muted/50"
        >
          <ChevronRight
            className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")}
            aria-hidden
          />
          {label}
        </button>
      ) : (
        <div className="flex items-center gap-1 py-0.5 pl-[1.125rem]">{label}</div>
      )}

      {expandable && open && (
        <div className="ml-[1.125rem] mt-1 space-y-2 border-l pl-3 text-xs text-muted-foreground">
          <StepDetail step={step} />
        </div>
      )}
    </li>
  );
}

/** Status → icon, with meaning carried by an aria-label (not color alone). */
function StepGlyph({ step }: { step: TimelineStep }) {
  const cls = "size-4 shrink-0";
  switch (step.status) {
    case "running":
      return <Loader2 className={cn(cls, "animate-spin")} aria-label="in progress" />;
    case "ok":
    case "hit":
      return <Check className={cn(cls, "text-tier-governed")} aria-label="done" />;
    case "blocked":
    case "cap": {
      // Amber warning; also carry the step's own glyph is redundant — the
      // attempt badge + expand disclose the block reason.
      return <AlertTriangle className={cn(cls, "text-tier-fenced-raw")} aria-label={statusLabel(step.status)} />;
    }
    default:
      return <XCircle className={cn(cls, "text-tier-refused")} aria-label={statusLabel(step.status)} />;
  }
}

function statusLabel(status: StepStatus): string {
  switch (status) {
    case "blocked":
      return "blocked";
    case "cap":
      return "capped";
    case "error":
      return "error";
    case "refused":
      return "refused";
    case "miss":
      return "miss";
    default:
      return status;
  }
}

function hasDetail(step: TimelineStep): boolean {
  const d = step.detail ?? {};
  switch (step.step) {
    case "run_query":
      return typeof d.sql === "string" || step.status === "blocked" || typeof d.rows === "number";
    case "inspect_schema":
      return typeof d.table_id === "string" || typeof d.columns === "number";
    case "search_corpus":
      return ["tables", "few_shots", "metrics", "query"].some((k) => d[k] != null);
    case "assemble":
      return ["schema", "tables", "few_shots"].some((k) => d[k] != null);
    case "finalize":
      return ["tier", "semantic_assurance", "min_join_confidence"].some((k) => d[k] != null);
    default:
      return false;
  }
}

function StepDetail({ step }: { step: TimelineStep }) {
  const d = step.detail ?? {};
  switch (step.step) {
    case "run_query":
      return (
        <>
          {typeof d.sql === "string" && d.sql.length > 0 && <SqlBlock sql={d.sql} />}
          {step.status === "blocked" && (
            <p>
              Blocked by <span className="font-medium text-tier-fenced-raw">{String(d.layer ?? "guardrail")}</span>
              {typeof d.reason === "string" && d.reason.length > 0 ? ` — ${d.reason}` : ""}
            </p>
          )}
          {Array.isArray(d.allowed) && d.allowed.length > 0 && (
            <p>
              Licensed tables: <span className="font-mono">{d.allowed.map(String).join(", ")}</span>
            </p>
          )}
          {step.status === "ok" && typeof d.rows === "number" && <p>Returned {d.rows} row{d.rows === 1 ? "" : "s"}.</p>}
        </>
      );
    case "inspect_schema":
      return (
        <p>
          <span className="font-mono">{String(d.table_id ?? "table")}</span>
          {typeof d.columns === "number" ? ` · ${d.columns} columns` : ""}
          {d.licensed ? " · licensed" : ""}
        </p>
      );
    case "search_corpus":
      return (
        <p>
          {typeof d.query === "string" && d.query.length > 0 ? <>“{d.query}” · </> : null}
          {countLabel(d, [
            ["tables", "table"],
            ["few_shots", "example"],
            ["metrics", "metric"],
          ])}
        </p>
      );
    case "assemble":
      return (
        <p>
          {d.schema ? <>schema <span className="font-mono">{String(d.schema)}</span> · </> : null}
          {countLabel(d, [
            ["tables", "table"],
            ["few_shots", "example"],
          ])}
        </p>
      );
    case "finalize":
      return (
        <p>
          {d.tier ? `tier ${String(d.tier)}` : null}
          {d.semantic_assurance ? ` · ${String(d.semantic_assurance)}` : null}
          {typeof d.min_join_confidence === "number" ? ` · min join conf ${d.min_join_confidence}` : null}
        </p>
      );
    default:
      return null;
  }
}

/** "4 tables, 2 examples" — skips absent/zero counts. */
function countLabel(d: Record<string, unknown>, specs: [string, string][]): string {
  return specs
    .map(([key, noun]) => {
      const n = d[key];
      if (typeof n !== "number") return null;
      return `${n} ${noun}${n === 1 ? "" : "s"}`;
    })
    .filter((s): s is string => s !== null)
    .join(", ");
}
