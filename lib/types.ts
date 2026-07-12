/**
 * TypeScript types for the engine contract, inferred from the zod schemas in
 * `lib/schemas.ts` (one source of truth). Import these anywhere in the app;
 * import the schemas only where you parse a network response.
 */

import type { z } from "zod";
import type {
  answerViewSchema,
  assetRowSchema,
  boundaryEdgeSchema,
  capabilitiesSchema,
  columnViewSchema,
  corpusHealthSchema,
  editResponseSchema,
  erGraphEdgeSchema,
  erGraphNodeSchema,
  erGraphSchema,
  graphEdgeSchema,
  graphMetaSchema,
  graphNodeKindSchema,
  graphNodeSchema,
  knowledgeGraphSchema,
  leanColumnSchema,
  reliabilityTierSchema,
  resultTableSchema,
  schemaSummaryResponseSchema,
  searchHitSchema,
  searchResponseSchema,
  semanticAssuranceSchema,
  skillViewSchema,
  tableSummarySchema,
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

/* ── D15 scope-on-demand (gated on capabilities.can_scope / can_search) ───── */
export type LeanColumn = z.infer<typeof leanColumnSchema>;
export type TableSummary = z.infer<typeof tableSummarySchema>;
export type SchemaSummaryResponse = z.infer<typeof schemaSummaryResponseSchema>;
export type BoundaryEdge = z.infer<typeof boundaryEdgeSchema>;
export type GraphMeta = z.infer<typeof graphMetaSchema>;
export type SearchHit = z.infer<typeof searchHitSchema>;
export type SearchResponse = z.infer<typeof searchResponseSchema>;

/**
 * Normalized catalog row for the search omnibox + schema rail. Produced
 * client-side from either the full `/schema` dump (`namespace` ← `db`, fallback
 * mode) or the lean `/schema/summary` (`namespace` ← `schema`, scoped mode), so
 * the rail/search are source-agnostic and survive the eventual db→schema rename.
 */
export interface CatalogItem {
  id: string;
  physical_name: string;
  namespace: string;
  row_count: number | null;
  n_columns: number;
  excluded: boolean;
  has_suspect: boolean;
  provenance_status: string | null;
}

/**
 * The scope the Schema tab drives its views by. Empty `{}` = whole corpus
 * (today's flat behavior / fallback). `schema` narrows to one namespace;
 * `focus`+`radius`+`nodeBudget` bound a graph to a table's neighborhood.
 */
export interface SchemaScope {
  schema?: string;
  focus?: string;
  radius?: number;
  nodeBudget?: number;
  kinds?: string[]; // knowledge-graph node-kind filter
}

/**
 * A node selected in either graph, lifted to the page and passed to the detail
 * sheet. `node` carries the full knowledge-graph node when available (for the
 * non-table generic detail); ER selections omit it (always a table → lazy detail).
 */
export interface GraphSelection {
  id: string;
  kind: string;
  label: string;
  node?: GraphNode;
}

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
