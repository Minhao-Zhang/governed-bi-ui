/**
 * Client-side delivery state for an AnswerView (handoff §13.2).
 *
 * Until the engine adds a first-class `delivery` field, derive the three render
 * states from `sql` + `semantic_assurance` + `provenance.graded_delivery`.
 * Branch UI on this — never on `tier === "refused"` alone.
 */

import type { AnswerView } from "@/lib/types";

export type AnswerDelivery = "clean" | "graded" | "refused";

const FLAG_WHY: Record<string, string> = {
  low_confidence_join: "Joined tables on a relationship we're not fully sure of.",
  suspect_in_scope: "Used a column that may be unreliable (flagged during curation).",
  repaired: "Needed multiple attempts to produce valid SQL.",
  fenced_raw_fallback: "Fell back to a raw query without the governed layer.",
};

/** Derive the three-state delivery discriminator from a live AnswerView. */
export function deriveDelivery(answer: AnswerView): AnswerDelivery {
  if (answer.sql == null) return "refused";

  const assurance = answer.semantic_assurance;
  const gradedMarker = answer.provenance.graded_delivery === true;
  if (assurance === "unverified" || assurance === "none" || gradedMarker) {
    return "graded";
  }
  return "clean";
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string");
}

/**
 * Plain-language "why" lines from `provenance.uncertainty_flags` (§13.4).
 * When `suspect_columns` is present, name the columns on the suspect flag.
 */
export function whyLines(provenance: Record<string, unknown>): string[] {
  const flags = asStringArray(provenance.uncertainty_flags);
  const suspects = asStringArray(provenance.suspect_columns);
  const lines: string[] = [];

  for (const flag of flags) {
    if (flag === "suspect_in_scope" && suspects.length > 0) {
      lines.push(
        `Used a column that may be unreliable (flagged during curation): ${suspects.join(", ")}.`,
      );
      continue;
    }
    const text = FLAG_WHY[flag];
    if (text) lines.push(text);
  }

  return lines;
}

/** Quiet "schemas considered" line from interim `routed_schemas` (§13.6). */
export function routedSchemasLabel(provenance: Record<string, unknown>): string | null {
  const schemas = asStringArray(provenance.routed_schemas);
  if (schemas.length === 0) return null;
  return `Schemas considered: ${schemas.join(", ")}`;
}
