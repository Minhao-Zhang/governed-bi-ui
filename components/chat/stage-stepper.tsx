"use client";

import { Check, Circle, Loader2 } from "lucide-react";

import { STAGES, STAGE_IDS, type StageId } from "@/lib/stages";
import { cn } from "@/lib/utils";

/**
 * Vertical stepper over the governed serve pipeline
 * (Route → Retrieve → Generate SQL → Guardrails → Execute → Compose).
 *
 * `activeStage` reflects real backend progress conceptually: stages before it
 * are done, the active one is in-progress, later ones are pending. With the mock
 * transport this is timer-driven; with a live backend it comes from streamed
 * node updates mapped through nodeToStage() — the rendering here is identical.
 */

type StepState = "done" | "active" | "pending";

function stepState(activeStage: StageId | null, index: number): StepState {
  if (activeStage === null) return "pending";
  const activeIndex = STAGE_IDS.indexOf(activeStage);
  if (index < activeIndex) return "done";
  if (index === activeIndex) return "active";
  return "pending";
}

export function StageStepper({ activeStage }: { activeStage: StageId | null }) {
  return (
    <ol className="flex flex-col gap-2" aria-label="Serve pipeline progress">
      {STAGES.map((stage, index) => {
        const state = stepState(activeStage, index);
        return (
          <li key={stage.id} className="flex items-center gap-2 text-sm">
            <StageIcon state={state} />
            <span
              className={cn(
                state === "pending" && "text-muted-foreground",
                state === "active" && "font-medium",
              )}
            >
              {stage.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function StageIcon({ state }: { state: StepState }) {
  if (state === "done") {
    // Completed — green check keeps color meaning trust level.
    return <Check className="size-4 shrink-0 text-tier-governed" aria-hidden />;
  }
  if (state === "active") {
    // In progress — spinner.
    return <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />;
  }
  // Not started yet.
  return <Circle className="size-4 shrink-0 text-muted-foreground/40" aria-hidden />;
}
