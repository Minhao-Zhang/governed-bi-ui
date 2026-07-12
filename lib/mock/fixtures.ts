/**
 * Neutral placeholder fixtures — domain-agnostic, obviously synthetic.
 *
 * This is a **pure UI**: all real content (schema, corpus, graph, answers) comes
 * from the engine over the custom routes / `useStream`. The UI assumes nothing
 * about the data domain. These placeholders exist only so the component shells
 * render during the scaffold phase, when no backend is attached; they use
 * abstract names (`table_a`, `metric_total`) precisely so nothing here reads as
 * real data. When `NEXT_PUBLIC_LANGGRAPH_URL` is set, none of this is used.
 *
 * Shapes and counts still cover every UI state: a suspect column, an excluded
 * field, a low-confidence join, and a refusal.
 */

import type {
  AnswerView,
  AssetRow,
  Capabilities,
  CorpusHealth,
  ErGraph,
  KnowledgeGraph,
  SchemaSummaryResponse,
  SkillView,
  TableView,
} from "@/lib/types";

// Two namespaces so the schema rail and cross-schema boundary are exercised
// offline. The FK columns already cross these (table_c/table_d in `billing`
// reference table_a/table_b in `sales`), so joins across them are the D15
// navigable cross-schema case. The wire field is still `db` (renamed to
// `schema` in lockstep with the engine); mock catalog/graph nodes use `schema`.
const SALES = "sales";
const BILLING = "billing";

/* ── /capabilities — offline, no live model (mock mode) ──────────────────── */

export const MOCK_CAPABILITIES: Capabilities = {
  environment: "dev",
  dialect: "sqlite",
  can_edit: true,
  edit_mode: "file",
  can_stream: false, // no LangGraph Server attached in mock mode
  has_live_model: false,
  model: "offline (no model attached)",
  // Mock exercises the D15 scoped flow end-to-end; server /search stays deferred
  // (client Fuse index is the default), so can_search is false.
  can_scope: true,
  can_search: false,
};

/* ── /health ─────────────────────────────────────────────────────────────── */

export const MOCK_HEALTH: CorpusHealth = {
  counts: {
    table: 4,
    join: 3,
    metric: 2,
    term: 2,
    rule: 1,
    few_shot: 1,
    negative_example: 1,
  },
  n_skills: 1,
  n_suspect_columns: 1,
  n_excluded: 1,
  n_low_confidence_joins: 1,
  ci_green: true,
  findings: [],
};

/* ── /schema ─────────────────────────────────────────────────────────────── */

export const MOCK_SCHEMA: TableView[] = [
  {
    id: "table_a",
    physical_name: "table_a",
    db: SALES,
    row_count: 1000,
    description: "Placeholder root table (one row per entity).",
    grain: "one row per entity",
    confidence: 0.97,
    excluded: false,
    excluded_reason: null,
    provenance_status: "certified",
    columns: [
      {
        physical_name: "id",
        physical_type: "INTEGER",
        logical_type: "id",
        nullable: false,
        is_unique: true,
        sample_values: [],
        description: "Primary key.",
        role: "primary_key",
        references: null,
        confidence: 0.99,
        reliability: "ok",
        reliability_note: null,
        excluded: false,
        excluded_reason: null,
        provenance_status: "certified",
        evidence: null,
      },
      {
        physical_name: "label",
        physical_type: "TEXT",
        logical_type: "text",
        nullable: true,
        is_unique: false,
        sample_values: [],
        description: "A display label.",
        role: "attribute",
        references: null,
        confidence: 0.9,
        reliability: "ok",
        reliability_note: null,
        excluded: false,
        excluded_reason: null,
        provenance_status: "certified",
        evidence: null,
      },
    ],
  },
  {
    id: "table_b",
    physical_name: "table_b",
    db: SALES,
    row_count: 25000,
    description: "Placeholder fact table (one row per event).",
    grain: "one row per event",
    confidence: 0.94,
    excluded: false,
    excluded_reason: null,
    provenance_status: "certified",
    columns: [
      {
        physical_name: "id",
        physical_type: "INTEGER",
        logical_type: "id",
        nullable: false,
        is_unique: true,
        sample_values: [],
        description: "Primary key.",
        role: "primary_key",
        references: null,
        confidence: 0.99,
        reliability: "ok",
        reliability_note: null,
        excluded: false,
        excluded_reason: null,
        provenance_status: "certified",
        evidence: null,
      },
      {
        physical_name: "a_id",
        physical_type: "INTEGER",
        logical_type: "id",
        nullable: false,
        is_unique: false,
        sample_values: [],
        description: "Foreign key to table_a.",
        role: "foreign_key",
        references: "table_a.id",
        confidence: 0.92,
        reliability: "ok",
        reliability_note: null,
        excluded: false,
        excluded_reason: null,
        provenance_status: "certified",
        evidence: null,
      },
      {
        physical_name: "amount",
        physical_type: "REAL",
        logical_type: "measure",
        nullable: true,
        is_unique: false,
        sample_values: [],
        description: "A numeric measure.",
        role: "measure",
        references: null,
        confidence: 0.9,
        reliability: "ok",
        reliability_note: null,
        excluded: false,
        excluded_reason: null,
        provenance_status: "certified",
        evidence: null,
      },
      {
        physical_name: "restricted_field",
        physical_type: "TEXT",
        logical_type: "text",
        nullable: true,
        is_unique: false,
        sample_values: [],
        description: "Placeholder sensitive field, excluded from the served surface.",
        role: "attribute",
        references: null,
        confidence: 0.4,
        reliability: "suspect",
        reliability_note: "Uncertain quality; treated as sensitive.",
        excluded: true,
        excluded_reason: "Excluded by governance; never served.",
        provenance_status: "certified",
        evidence: null,
      },
    ],
  },
  {
    id: "table_c",
    physical_name: "table_c",
    db: BILLING,
    row_count: 8000,
    description: "Placeholder secondary fact table.",
    grain: "one row per record",
    confidence: 0.9,
    excluded: false,
    excluded_reason: null,
    provenance_status: "heuristic",
    columns: [
      {
        physical_name: "a_id",
        physical_type: "INTEGER",
        logical_type: "id",
        nullable: false,
        is_unique: false,
        sample_values: [],
        description: "Foreign key to table_a.",
        role: "foreign_key",
        references: "table_a.id",
        confidence: 0.85,
        reliability: "ok",
        reliability_note: null,
        excluded: false,
        excluded_reason: null,
        provenance_status: "heuristic",
        evidence: null,
      },
      {
        physical_name: "score",
        physical_type: "INTEGER",
        logical_type: "measure",
        nullable: true,
        is_unique: false,
        sample_values: [],
        description: "A numeric score.",
        role: "measure",
        references: null,
        confidence: 0.9,
        reliability: "ok",
        reliability_note: null,
        excluded: false,
        excluded_reason: null,
        provenance_status: "heuristic",
        evidence: null,
      },
    ],
  },
  {
    id: "table_d",
    physical_name: "table_d",
    db: BILLING,
    row_count: 40,
    description: "Placeholder dimension table.",
    grain: "one row per category",
    confidence: 0.96,
    excluded: false,
    excluded_reason: null,
    provenance_status: "certified",
    columns: [
      {
        physical_name: "id",
        physical_type: "INTEGER",
        logical_type: "id",
        nullable: false,
        is_unique: true,
        sample_values: [],
        description: "Primary key.",
        role: "primary_key",
        references: null,
        confidence: 0.99,
        reliability: "ok",
        reliability_note: null,
        excluded: false,
        excluded_reason: null,
        provenance_status: "certified",
        evidence: null,
      },
      {
        physical_name: "name",
        physical_type: "TEXT",
        logical_type: "text",
        nullable: false,
        is_unique: true,
        sample_values: [],
        description: "Category name.",
        role: "attribute",
        references: null,
        confidence: 0.95,
        reliability: "ok",
        reliability_note: null,
        excluded: false,
        excluded_reason: null,
        provenance_status: "certified",
        evidence: null,
      },
    ],
  },
];

/* ── /schema/summary — lean catalog derived from MOCK_SCHEMA (D15) ───────── */
// Kept in sync with MOCK_SCHEMA by derivation so the two never drift; the api
// client filters/paginates this in mock mode. Namespace field is `schema`
// (the D15-renamed name; this route is D15-only).

export const MOCK_SCHEMA_SUMMARY: SchemaSummaryResponse = {
  total: MOCK_SCHEMA.length,
  items: MOCK_SCHEMA.map((t) => ({
    id: t.id,
    physical_name: t.physical_name,
    schema: t.db,
    row_count: t.row_count,
    n_columns: t.columns.length,
    excluded: t.excluded,
    has_suspect: t.columns.some((c) => c.reliability === "suspect"),
    provenance_status: t.provenance_status,
    columns: t.columns.map((c) => ({
      physical_name: c.physical_name,
      physical_type: c.physical_type,
      role: c.role ?? null,
      reliability: c.reliability,
      excluded: c.excluded,
    })),
  })),
};

/* ── /graph — full knowledge graph over all asset types ──────────────────── */

export const MOCK_GRAPH: KnowledgeGraph = {
  nodes: [
    { id: "table_a", kind: "table", label: "table_a", excluded: false, provenance_status: "certified", has_suspect: false, schema: SALES },
    { id: "table_b", kind: "table", label: "table_b", excluded: false, provenance_status: "certified", has_suspect: true, schema: SALES },
    { id: "table_c", kind: "table", label: "table_c", excluded: false, provenance_status: "heuristic", has_suspect: false, schema: BILLING },
    { id: "table_d", kind: "table", label: "table_d", excluded: false, provenance_status: "certified", has_suspect: false, schema: BILLING },
    { id: "metric_total", kind: "metric", label: "metric_total", excluded: false, provenance_status: "certified", confidence: 0.95 },
    { id: "metric_average", kind: "metric", label: "metric_average", excluded: false, provenance_status: "certified", confidence: 0.9 },
    { id: "term_total", kind: "term", label: "total", excluded: false, provenance_status: "certified" },
    { id: "term_label", kind: "term", label: "label", excluded: false, provenance_status: "certified" },
    { id: "join_b_a", kind: "join", label: "table_b → table_a", excluded: false, provenance_status: "certified", confidence: 0.92 },
    { id: "join_c_a", kind: "join", label: "table_c → table_a", excluded: false, provenance_status: "heuristic", confidence: 0.85 },
    { id: "join_d_b", kind: "join", label: "table_d → table_b", excluded: false, provenance_status: "heuristic", confidence: 0.55 },
    { id: "rule_flags", kind: "rule", label: "boolean flags", excluded: false, provenance_status: "certified" },
    { id: "fs_001", kind: "few_shot", label: "example question", excluded: false, provenance_status: "certified" },
    { id: "neg_001", kind: "negative_example", label: "restricted field", excluded: false, provenance_status: "certified" },
  ],
  edges: [
    { id: "e1", source: "join_b_a", target: "table_b", relation: "join", confidence: 0.92, low_confidence: false },
    { id: "e2", source: "join_b_a", target: "table_a", relation: "join", confidence: 0.92, low_confidence: false },
    { id: "e3", source: "join_c_a", target: "table_c", relation: "join", confidence: 0.85, low_confidence: false },
    { id: "e4", source: "join_c_a", target: "table_a", relation: "join", confidence: 0.85, low_confidence: false },
    { id: "e5", source: "join_d_b", target: "table_d", relation: "join", confidence: 0.55, low_confidence: true },
    { id: "e6", source: "join_d_b", target: "table_b", relation: "join", confidence: 0.55, low_confidence: true },
    { id: "e7", source: "metric_total", target: "table_b", relation: "measures", confidence: null },
    { id: "e8", source: "metric_average", target: "table_c", relation: "measures", confidence: null },
    { id: "e9", source: "term_total", target: "metric_total", relation: "grounds", confidence: null },
    { id: "e10", source: "rule_flags", target: "table_b", relation: "scopes", confidence: null },
    { id: "e11", source: "fs_001", target: "term_total", relation: "exemplifies", confidence: null },
  ],
};

/* ── /graph — ER (tables + joins, with FK cardinality + predicate) ───────── */
// Consistent with MOCK_SCHEMA's real FK columns so column-anchored edges resolve.
// table_d is an isolated dimension (no FK yet) — a realistic case.

export const MOCK_ER_GRAPH: ErGraph = {
  nodes: [
    { id: "table_a", physical_name: "table_a", row_count: 1000, n_columns: 2, excluded: false, has_suspect: false, schema: SALES },
    { id: "table_b", physical_name: "table_b", row_count: 25000, n_columns: 4, excluded: false, has_suspect: true, schema: SALES },
    { id: "table_c", physical_name: "table_c", row_count: 8000, n_columns: 2, excluded: false, has_suspect: false, schema: BILLING },
    { id: "table_d", physical_name: "table_d", row_count: 40, n_columns: 2, excluded: false, has_suspect: false, schema: BILLING },
  ],
  edges: [
    { id: "er_b_a", source: "table_b", target: "table_a", on: "table_b.a_id = table_a.id", cardinality: "many_to_one", confidence: 0.92, low_confidence: false },
    // table_c (billing) → table_a (sales): a curated, executable cross-schema join (D15).
    { id: "er_c_a", source: "table_c", target: "table_a", on: "table_c.a_id = table_a.id", cardinality: "many_to_one", confidence: 0.85, low_confidence: false },
    // table_d (billing) → table_b (sales): a low-confidence cross-schema join.
    { id: "er_d_b", source: "table_d", target: "table_b", on: "table_d.b_id = table_b.id", cardinality: "many_to_one", confidence: 0.55, low_confidence: true },
  ],
};

/* ── /corpus/assets ──────────────────────────────────────────────────────── */

export const MOCK_ASSETS: AssetRow[] = [
  { id: "join_b_a", asset_type: "join", summary: "table_b.a_id = table_a.id (many_to_one)", provenance_status: "certified", excluded: false },
  { id: "join_c_a", asset_type: "join", summary: "table_c.a_id = table_a.id (many_to_one)", provenance_status: "heuristic", excluded: false },
  { id: "join_d_b", asset_type: "join", summary: "table_d.b_id = table_b.id (many_to_one)", provenance_status: "heuristic", excluded: false },
  { id: "metric_total", asset_type: "metric", summary: "metric_total: SUM(table_b.amount)", provenance_status: "certified", excluded: false },
  { id: "metric_average", asset_type: "metric", summary: "metric_average: AVG(table_c.score)", provenance_status: "certified", excluded: false },
  { id: "term_total", asset_type: "term", summary: "total = total, sum, aggregate", provenance_status: "certified", excluded: false },
  { id: "term_label", asset_type: "term", summary: "label = label, name, title", provenance_status: "certified", excluded: false },
  { id: "rule_flags", asset_type: "rule", summary: "[interpretation] 0/1 integer columns are booleans", provenance_status: "certified", excluded: false },
  { id: "fs_001", asset_type: "few_shot", summary: "What is the total amount by category?", provenance_status: "certified", excluded: false },
  { id: "neg_001", asset_type: "negative_example", summary: "requests for excluded/restricted fields", provenance_status: "certified", excluded: false },
];

/* ── /skills ─────────────────────────────────────────────────────────────── */

export const MOCK_SKILLS: SkillView[] = [
  {
    skill_id: "routing",
    kind: "routing",
    db: SALES,
    body: [
      "# Routing skill",
      "",
      "Classify each question into a **route** before retrieval:",
      "",
      "- `metric` — asks for an aggregate the corpus already defines.",
      "- `lookup` — filters/lists rows from a single governed table.",
      "- `join` — needs a curated join across tables.",
      "- `refuse` — matches a negative example → fail closed.",
      "",
      "When in doubt, prefer the **narrower** route and let guardrails catch overreach.",
    ].join("\n"),
  },
];

/* ── Chat: a placeholder answer + a refusal, for the mock transport ──────── */

export const MOCK_ANSWER: AnswerView = {
  tier: "governed",
  safety_clearance: true,
  semantic_assurance: "certified",
  text: "Placeholder answer: returned 4 grouped rows. See the result table below. (This is synthetic output shown because no backend is attached.)",
  sql: "SELECT d.name AS category, SUM(b.amount) AS total\nFROM table_b b\nJOIN table_a a ON b.a_id = a.id\nJOIN table_d d ON d.b_id = b.id\nGROUP BY d.name\nORDER BY total DESC\nLIMIT 5;",
  escalation: null,
  provenance: {
    route: "metric",
    bound_terms: ["total"],
    metric_id: "metric_total",
    tables_used: ["table_b", "table_a", "table_d"],
    join_ids: ["join_b_a", "join_d_b"],
    min_join_confidence: 0.55,
    attempts: 1,
    uncertainty_flags: ["low_confidence_join"],
    cache_hit: false,
    session_id: "mock-session",
    user: "demo",
  },
  result: {
    columns: ["category", "total"],
    rows: [
      ["category_1", 1840.5],
      ["category_2", 1510.0],
      ["category_3", 1329.25],
      ["category_4", 981.75],
    ],
    row_count: 40,
    truncated: true,
  },
};

export const MOCK_REFUSAL: AnswerView = {
  tier: "refused",
  safety_clearance: false,
  semantic_assurance: "none",
  text: null,
  sql: null,
  escalation:
    "This question targets a field that's excluded from the served surface, so it can't be answered. Try an aggregate over the governed columns instead.",
  provenance: {
    route: "refuse",
    refused_by: "refuse_gate",
    negative_example: "neg_001",
    session_id: "mock-session",
    user: "demo",
  },
  result: null,
};
