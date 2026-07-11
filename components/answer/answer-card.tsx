import { AlertTriangle } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { ReliabilityStamp } from "@/components/answer/reliability-stamp";
import { ResultTable } from "@/components/answer/result-table";
import { SqlBlock } from "@/components/answer/sql-block";
import { ProvenanceDrawer } from "@/components/answer/provenance-drawer";
import type { AnswerView } from "@/lib/types";

/**
 * Renders a full `Answer`. A refusal is the fail-closed story: the escalation is
 * shown prominently with no SQL and no number. Otherwise: the two-axis stamp, the
 * answer text, the collapsible result table, read-only SQL, and the provenance
 * drawer.
 */
export function AnswerCard({ answer }: { answer: AnswerView }) {
  const refused = answer.tier === "refused" || (!answer.result && !answer.sql);

  return (
    <Card>
      <CardContent className="space-y-3 pt-0">
        <ReliabilityStamp
          tier={answer.tier}
          safetyClearance={answer.safety_clearance}
          semanticAssurance={answer.semantic_assurance}
        />

        {refused ? (
          <div className="flex gap-3 rounded-md border border-tier-refused/30 bg-tier-refused/5 p-3">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-tier-refused" />
            <p className="text-sm">
              {answer.escalation ?? "This question can't be answered as asked."}
            </p>
          </div>
        ) : (
          <>
            {answer.text && <p className="text-sm leading-relaxed">{answer.text}</p>}
            {answer.result && <ResultTable result={answer.result} />}
            {answer.sql && <SqlBlock sql={answer.sql} />}
            <div className="flex items-center gap-2 pt-1">
              <ProvenanceDrawer provenance={answer.provenance} />
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
