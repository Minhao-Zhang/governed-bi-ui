/**
 * TypeScript types for the engine contract, inferred from the zod schemas in
 * `lib/schemas.ts` (one source of truth). Import these anywhere in the app;
 * import the schemas only where you parse a network response.
 */

import type { z } from "zod";
import type {
  answerViewSchema,
  assetRowSchema,
  capabilitiesSchema,
  columnViewSchema,
  corpusHealthSchema,
  editResponseSchema,
  erGraphEdgeSchema,
  erGraphNodeSchema,
  erGraphSchema,
  graphEdgeSchema,
  graphNodeKindSchema,
  graphNodeSchema,
  knowledgeGraphSchema,
  reliabilityTierSchema,
  resultTableSchema,
  semanticAssuranceSchema,
  skillViewSchema,
  tableViewSchema,
} from "./schemas";

export type ReliabilityTier = z.infer<typeof reliabilityTierSchema>;
export type SemanticAssurance = z.infer<typeof semanticAssuranceSchema>;
export type Capabilities = z.infer<typeof capabilitiesSchema>;
export type CorpusHealth = z.infer<typeof corpusHealthSchema>;
export type ColumnView = z.infer<typeof columnViewSchema>;
export type TableView = z.infer<typeof tableViewSchema>;
export type GraphNodeKind = z.infer<typeof graphNodeKindSchema>;
export type GraphNode = z.infer<typeof graphNodeSchema>;
export type GraphEdge = z.infer<typeof graphEdgeSchema>;
export type KnowledgeGraph = z.infer<typeof knowledgeGraphSchema>;
export type ErGraphNode = z.infer<typeof erGraphNodeSchema>;
export type ErGraphEdge = z.infer<typeof erGraphEdgeSchema>;
export type ErGraph = z.infer<typeof erGraphSchema>;
export type AssetRow = z.infer<typeof assetRowSchema>;
export type SkillView = z.infer<typeof skillViewSchema>;
export type ResultTable = z.infer<typeof resultTableSchema>;
export type AnswerView = z.infer<typeof answerViewSchema>;
export type EditResponse = z.infer<typeof editResponseSchema>;

/** One prior turn sent to the non-streaming POST /chat (TurnIn). */
export interface ChatTurn {
  role: "user" | "assistant";
  text: string;
}

/** Non-table corpus asset types, for the `/corpus/assets?type=` filter. */
export const ASSET_TYPES = [
  "metric",
  "term",
  "join",
  "rule",
  "few_shot",
  "negative_example",
] as const;
export type AssetType = (typeof ASSET_TYPES)[number];
