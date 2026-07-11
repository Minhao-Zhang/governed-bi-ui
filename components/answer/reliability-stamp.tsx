import { CheckCircle2, ShieldAlert, ShieldCheck, ShieldX } from "lucide-react";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type { ReliabilityTier, SemanticAssurance } from "@/lib/types";

/**
 * The two-axis reliability stamp — rendered as two distinct badges plus a tier
 * chip, never collapsed into one score. `safety_clearance` (did it pass the
 * guardrails) and `semantic_assurance` (how well-grounded) mean different things
 * and must be read separately (engine README; design §8).
 */

const TIER_CLASSES: Record<ReliabilityTier, string> = {
  governed: "bg-tier-governed text-tier-governed-foreground",
  lineage: "bg-tier-lineage text-tier-lineage-foreground",
  fenced_raw: "bg-tier-fenced-raw text-tier-fenced-raw-foreground",
  refused: "bg-tier-refused text-tier-refused-foreground",
};

const TIER_LABEL: Record<ReliabilityTier, string> = {
  governed: "governed",
  lineage: "lineage",
  fenced_raw: "fenced raw",
  refused: "refused",
};

const ASSURANCE_CLASSES: Record<SemanticAssurance, string> = {
  certified: "border-tier-governed/40 text-tier-governed",
  heuristic: "border-tier-lineage/50 text-tier-lineage",
  unverified: "border-tier-fenced-raw/50 text-tier-fenced-raw",
  none: "border-tier-refused/40 text-tier-refused",
};

export function ReliabilityStamp({
  tier,
  safetyClearance,
  semanticAssurance,
  className,
}: {
  tier: ReliabilityTier;
  safetyClearance: boolean;
  semanticAssurance: SemanticAssurance;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <Badge className={cn("gap-1 font-medium", TIER_CLASSES[tier])}>
        {TIER_LABEL[tier]}
      </Badge>

      <Badge
        variant="outline"
        className={cn(
          "gap-1",
          safetyClearance
            ? "border-tier-governed/40 text-tier-governed"
            : "border-tier-refused/40 text-tier-refused",
        )}
      >
        {safetyClearance ? (
          <ShieldCheck className="size-3.5" />
        ) : (
          <ShieldX className="size-3.5" />
        )}
        {safetyClearance ? "cleared" : "not cleared"}
      </Badge>

      <Badge variant="outline" className={cn("gap-1", ASSURANCE_CLASSES[semanticAssurance])}>
        {semanticAssurance === "certified" ? (
          <CheckCircle2 className="size-3.5" />
        ) : (
          <ShieldAlert className="size-3.5" />
        )}
        {semanticAssurance}
      </Badge>
    </div>
  );
}
