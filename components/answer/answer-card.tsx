import { AlertTriangle, Info } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { ReliabilityStamp } from "@/components/answer/reliability-stamp";
import { ResultTable } from "@/components/answer/result-table";
import { SqlBlock } from "@/components/answer/sql-block";
import { ProvenanceDrawer } from "@/components/answer/provenance-drawer";
import {
  deriveDelivery,
  routedSchemasLabel,
  whyLines,
} from "@/lib/answer-delivery";
import { cn } from "@/lib/utils";
import type { AnswerView } from "@/lib/types";

/**
 * Renders a full `Answer` in one of three states (handoff §13.2):
 * clean, graded delivery (SQL + result with reliability warning), or hard refusal.
 * Branch on `deriveDelivery` — never on `tier === "refused"` alone.
 */
export function AnswerCard({ answer }: { answer: AnswerView }) {
  const delivery = deriveDelivery(answer);
  const why = whyLines(answer.provenance);
  const schemasNote = routedSchemasLabel(answer.provenance);
  const heuristic = answer.semantic_assurance === "heuristic";

  return (
    <Card
      className={cn(
        delivery === "graded" && "border-tier-fenced-raw/50 bg-tier-fenced-raw/5",
      )}
    >
      <CardContent className="space-y-3 pt-0">
        <ReliabilityStamp
          tier={answer.tier}
          safetyClearance={answer.safety_clearance}
          semanticAssurance={answer.semantic_assurance}
        />

        {delivery === "refused" ? (
          <div className="flex gap-3 rounded-md border border-tier-refused/30 bg-tier-refused/5 p-3">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-tier-refused" />
            <p className="text-sm">
              {answer.escalation ?? "This question can't be answered as asked."}
            </p>
          </div>
        ) : (
          <>
            {delivery === "graded" && (
              <div className="space-y-2 rounded-md border border-tier-fenced-raw/40 bg-tier-fenced-raw/10 p-3">
                <div className="flex gap-3">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-tier-fenced-raw" />
                  <p className="text-sm font-medium">
                    We produced this answer but could not fully verify it.
                  </p>
                </div>
                {why.length > 0 && (
                  <ul className="space-y-1 pl-7 text-sm text-muted-foreground">
                    {why.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {delivery === "clean" && heuristic && (
              <div className="flex gap-3 rounded-md border border-tier-lineage/30 bg-tier-lineage/5 p-3">
                <Info className="mt-0.5 size-4 shrink-0 text-tier-lineage" />
                <div className="space-y-1 text-sm text-muted-foreground">
                  <p>Answer grounded with mild uncertainty.</p>
                  {why.length > 0 && (
                    <ul className="space-y-1">
                      {why.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}

            {answer.text && <p className="text-sm leading-relaxed">{answer.text}</p>}
            {answer.result && <ResultTable result={answer.result} />}
            {answer.sql && <SqlBlock sql={answer.sql} />}
            {schemasNote && (
              <p className="text-xs text-muted-foreground">{schemasNote}</p>
            )}
            <div className="flex items-center gap-2 pt-1">
              <ProvenanceDrawer provenance={answer.provenance} />
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
