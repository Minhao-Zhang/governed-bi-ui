/**
 * Zod schemas for every custom-route response — the fail-loud boundary between
 * the UI and the engine. Shapes mirror `governed_bi.viz.presenter` view models
 * (and the handoff doc's `/capabilities` + full-knowledge-graph `/graph`), so the
 * server's re-exported OpenAPI can be diffed against these when it lands.
 *
 * TypeScript types are inferred from these schemas (see `lib/types.ts`) — one
 * source of truth.
 */

import { z } from "zod";

/* ── Reliability stamp (two axes, never collapsed) ───────────────────────── */

/** Collapsed single-axis projection, kept only for a compact chip. */
export const reliabilityTierSchema = z.enum([
  "governed",
  "lineage",
  "fenced_raw",
  "refused",
]);

/** Axis 2: how well-grounded the answer is (drives delivery, not "is it right"). */
export const semanticAssuranceSchema = z.enum([
  "certified",
  "heuristic",
  "unverified",
  "none",
]);

/* ── /capabilities ───────────────────────────────────────────────────────── */

export const capabilitiesSchema = z.object({
  environment: z.string(), // "dev" | "prod"
  dialect: z.string(), // "sqlite" | "postgres" | "redshift"
  can_edit: z.boolean(),
  edit_mode: z.string().nullable(), // "file" | "pr" | null (backend types it as str | None)
  can_stream: z.boolean(), // LangGraph Server present → useStream, else /chat fallback
  has_live_model: z.boolean(),
  model: z.string().nullable(), // null in the offline profile (no model wired)
});

/* ── /health ─────────────────────────────────────────────────────────────── */

export const corpusHealthSchema = z.object({
  counts: z.record(z.string(), z.number()), // asset_type -> count
  n_skills: z.number(),
  n_suspect_columns: z.number(),
  n_excluded: z.number(),
  n_low_confidence_joins: z.number(),
  ci_green: z.boolean(),
  findings: z.array(z.string()),
});

/* ── /schema (tables + columns) ──────────────────────────────────────────── */

export const columnViewSchema = z.object({
  // Facts (read-only)
  physical_name: z.string(),
  physical_type: z.string(),
  logical_type: z.string(),
  nullable: z.boolean(),
  is_unique: z.boolean(),
  sample_values: z.array(z.unknown()).default([]),
  // Inference (editable)
  description: z.string().nullable().optional(),
  role: z.string().nullable().optional(),
  references: z.string().nullable().optional(),
  confidence: z.number().nullable().optional(),
  // Governance + reliability + audit
  reliability: z.string().default("ok"), // "ok" | "suspect"
  reliability_note: z.string().nullable().optional(),
  excluded: z.boolean().default(false),
  excluded_reason: z.string().nullable().optional(),
  provenance_status: z.string().nullable().optional(),
  evidence: z.string().nullable().optional(),
});

export const tableViewSchema = z.object({
  id: z.string(),
  physical_name: z.string(),
  db: z.string(),
  row_count: z.number().nullable(),
  description: z.string().nullable(),
  grain: z.string().nullable(),
  confidence: z.number().nullable(),
  excluded: z.boolean(),
  excluded_reason: z.string().nullable(),
  provenance_status: z.string().nullable(),
  columns: z.array(columnViewSchema),
});

/* ── /graph (full knowledge graph over all asset types) ──────────────────── */

// Node kinds the backend emits (= asset_type): tables + the non-table assets.
// Matches KnowledgeGraphNodeResponse.kind (governed_bi.api.schemas).
export const graphNodeKindSchema = z.enum([
  "table",
  "join",
  "metric",
  "term",
  "rule",
  "few_shot",
  "negative_example",
]);

// The full knowledge-graph node is lean (GET /knowledge-graph): no physical_name/
// row_count/n_columns/summary — those live on the ER GET /graph. Rich table detail
// comes from GET /schema.
export const graphNodeSchema = z.object({
  id: z.string(),
  kind: graphNodeKindSchema,
  label: z.string(),
  excluded: z.boolean(),
  provenance_status: z.string().nullable(),
  confidence: z.number().nullable().optional(),
  has_suspect: z.boolean().optional(),
});

export const graphEdgeSchema = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  // Open vocab: join | measures | grounds | related:<rel> | scopes | exemplifies
  // (`related:<rel>` has a dynamic suffix, so this is a string, not an enum).
  relation: z.string(),
  confidence: z.number().nullable().optional(),
  low_confidence: z.boolean().optional(),
});

export const knowledgeGraphSchema = z.object({
  nodes: z.array(graphNodeSchema),
  edges: z.array(graphEdgeSchema),
});

/* ── /corpus/assets, /skills ─────────────────────────────────────────────── */

export const assetRowSchema = z.object({
  id: z.string(),
  asset_type: z.string(),
  summary: z.string(),
  provenance_status: z.string().nullable(),
  excluded: z.boolean(),
});

export const skillViewSchema = z.object({
  skill_id: z.string(),
  kind: z.string(),
  db: z.string(),
  body: z.string(),
});

/* ── Answer (chat terminal state) ────────────────────────────────────────── */

export const resultTableSchema = z.object({
  columns: z.array(z.string()),
  rows: z.array(z.array(z.unknown())),
  row_count: z.number(),
  truncated: z.boolean(),
});

export const answerViewSchema = z.object({
  tier: reliabilityTierSchema,
  safety_clearance: z.boolean(),
  semantic_assurance: semanticAssuranceSchema,
  text: z.string().nullable(),
  sql: z.string().nullable(),
  escalation: z.string().nullable(),
  provenance: z.record(z.string(), z.unknown()),
  result: resultTableSchema.nullable(),
});

export const schemaListSchema = z.array(tableViewSchema);
export const assetListSchema = z.array(assetRowSchema);
export const skillListSchema = z.array(skillViewSchema);

/* ── POST /corpus/edit (dev only; gated on capabilities.can_edit) ─────────── */

/** Response from writing/validating a corpus asset (EditResponse). */
export const editResponseSchema = z.object({
  written: z.boolean(), // false when validation blocked the write
  asset_id: z.string(),
  asset_type: z.string(),
  path: z.string().nullable(), // repo-relative path written (null when not written)
  findings: z.array(z.string()), // reference-integrity findings (empty = clean)
  diff: z.string(), // unified diff of the YAML file
});
