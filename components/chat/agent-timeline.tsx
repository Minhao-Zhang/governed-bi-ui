"use client";

import { useState } from "react";
import { Check, ChevronRight, Loader2 } from "lucide-react";

import { StepRow } from "@/components/chat/step-row";
import { summarizeSteps, type TimelineStep } from "@/lib/steps";
import { cn } from "@/lib/utils";

/**
 * The agent-path progress view: a live, append-only timeline that represents a
 * dynamic governed loop (N inspects, M query attempts), not a fixed rail. Outer
 * rails (route/assemble/finalize) render as top-level rows; the variable tool
 * loop renders indented under a "Reasoning" group.
 *
 * While running it is always expanded and grows as events arrive. When complete
 * (used by the provenance drawer over `governance_ledger`) it collapses to a
 * one-line summary that re-expands — same rows, same data as the live run.
 */
export function AgentTimeline({
  steps,
  isRunning,
  title = "How the answer was reached",
}: {
  steps: TimelineStep[];
  isRunning: boolean;
  title?: string;
}) {
  // Live runs stay open; a completed trace starts collapsed to its summary.
  const [open, setOpen] = useState(isRunning);

  const firstToolIdx = steps.findIndex((s) => s.kind === "tool");
  const lastToolIdx = findLastIndex(steps, (s) => s.kind === "tool");
  const hasTools = firstToolIdx >= 0;

  const leading = hasTools ? steps.slice(0, firstToolIdx) : steps;
  const tools = hasTools ? steps.slice(firstToolIdx, lastToolIdx + 1).filter((s) => s.kind === "tool") : [];
  // Any non-tool steps interleaved in the tool span, plus everything after it.
  const trailing = hasTools
    ? [
        ...steps.slice(firstToolIdx, lastToolIdx + 1).filter((s) => s.kind !== "tool"),
        ...steps.slice(lastToolIdx + 1),
      ].sort((a, b) => a.seq - b.seq)
    : [];

  const reasoningRunning = isRunning && tools.some((s) => s.status === "running");

  if (!isRunning && !open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={false}
        className="flex items-center gap-1.5 rounded py-0.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronRight className="size-3.5 shrink-0" aria-hidden />
        <Check className="size-4 shrink-0 text-tier-governed" aria-hidden />
        {summarizeSteps(steps)}
      </button>
    );
  }

  return (
    <div className="space-y-2">
      {!isRunning && (
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-expanded
          className="flex items-center gap-1.5 rounded py-0.5 text-sm font-medium hover:text-foreground"
        >
          <ChevronRight className="size-3.5 shrink-0 rotate-90 text-muted-foreground" aria-hidden />
          {summarizeSteps(steps)}
        </button>
      )}

      <ol className="flex flex-col gap-0.5" aria-label={title} aria-live="polite">
        {leading.map((s) => (
          <StepRow key={s.key} step={s} />
        ))}

        {hasTools && (
          <li>
            <div className="flex items-center gap-2 py-0.5 pl-[1.125rem] text-sm">
              {reasoningRunning ? (
                <Loader2 className="size-4 shrink-0 animate-spin" aria-label="in progress" />
              ) : (
                <Check className="size-4 shrink-0 text-tier-governed" aria-hidden />
              )}
              <span className={cn(reasoningRunning && "font-medium")}>Reasoning</span>
            </div>
            <ol className="mt-0.5 flex flex-col gap-0.5">
              {tools.map((s) => (
                <StepRow key={s.key} step={s} indent />
              ))}
            </ol>
          </li>
        )}

        {trailing.map((s) => (
          <StepRow key={s.key} step={s} />
        ))}
      </ol>
    </div>
  );
}

/** `Array.prototype.findLastIndex` isn't in the current lib target — inline it. */
function findLastIndex<T>(arr: T[], pred: (x: T) => boolean): number {
  for (let i = arr.length - 1; i >= 0; i--) {
    if (pred(arr[i])) return i;
  }
  return -1;
}
