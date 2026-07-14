"use client";

import { Loader2 } from "lucide-react";

import { AgentTimeline } from "@/components/chat/agent-timeline";
import { StageStepper } from "@/components/chat/stage-stepper";
import type { StageId } from "@/lib/stages";
import type { TimelineStep } from "@/lib/steps";

/**
 * Picks the running-progress renderer per serve path (§ agent-step-visualization):
 *  • agent path (dynamic governed loop) → the live append-only <AgentTimeline/>;
 *  • flow path / mock / rest (fixed rails) → the classic <StageStepper/>.
 *
 * The change is additive: with no `servePath`/`steps` (rest transport, or an
 * agent turn before its first event) it falls back to the stepper unchanged.
 */
export function ServeProgress({
  isRunning,
  activeStage,
  steps,
  servePath,
}: {
  isRunning: boolean;
  activeStage: StageId | null;
  steps?: TimelineStep[];
  servePath?: "flow" | "agent" | null;
}) {
  if (servePath === "agent" && steps && steps.length > 0) {
    return <AgentTimeline steps={steps} isRunning={isRunning} />;
  }
  // Flow path (or the rest/mock transports): drive the fixed stepper once a
  // stage is known.
  if (activeStage !== null) {
    return <StageStepper activeStage={activeStage} />;
  }
  // Path not yet known — the run has started but no event has arrived to reveal
  // flow vs. agent. Show a neutral placeholder so the fixed stepper doesn't
  // flash before an agent timeline takes over.
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />
      <span>Working…</span>
    </div>
  );
}
