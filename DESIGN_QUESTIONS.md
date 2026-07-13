# Schema Visualization at Scale — Findings, Proposed Design, and Open Questions

> **Superseded (2026-07-12).** This draft captured the pre-D15 discussion.
> **Current wire contract:** namespace is **`schema` only** — no `?db=` / response
> `db`. See engine `docs/ui-frontend-handoff.md` §4 / §10 and
> `docs/openapi.json`. **Shipped:** server-side graph scoping (`?schema=` /
> focus / radius / node_budget + `boundary` / `meta`); UI prefers engine
> `meta.scope` when it matches and keeps client re-scope as fallback. Keep this
> file for historical Q1–Q8 context; do not treat `?db=` examples below as live.

**Status:** Historical draft (superseded by D15 wire hard-cut)
**Author:** Frontend (governed-bi-ui)
**Date:** 2026-07-11 (banner added 2026-07-12)
**Companion repos:** `governed-bi-ui` (this repo, pure frontend) ↔ `governed-bi` (engine, contract source of truth)

---

## 0. Purpose

The Schema tab renders the full semantic layer in one shot. That works for a demo
corpus (a handful of tables) but collapses once we point at a realistic warehouse:
**≥1 database connection, multiple schemas per connection, and potentially hundreds
of tables per schema.**

This document captures three things so we can have a focused conversation:

1. **What we found** — the current contract and rendering, verified against source.
2. **The proposed design** — a scalable navigation/visualization flow and the API
   changes it needs.
3. **Open questions** — decisions that need the backend owner's input, especially the
   `db`-vs-`schema` modeling question, which changes the shape of everything else.

The frontend is a pure companion: it renders what the engine serves and gates
features on `GET /capabilities`. So most of the leverage here is a **contract/API
conversation**, which is why this doc exists.

---

## 1. Problem statement

At hundreds of tables, the current approach fails on three axes at once:

| Axis | Failure today |
|---|---|
| **Payload** | `GET /schema` returns *every* table with *every* column's full detail (`sample_values`, `evidence`, `description`) in one response. This grows linearly with the whole corpus. |
| **Render** | The ER and semantic graphs lay out *all* nodes with dagre (synchronous, layered) inside React Flow. Hundreds of nodes → an unreadable hairball + main-thread jank. |
| **Cognition** | A flat, unscoped list/graph of hundreds of tables gives the user no way to find or reason about anything. |

The domain has structure we are currently throwing away: relationships are
**common within a schema, uncommon across schemas, and almost never across
databases.** That locality means a schema is a natural, near-independent unit we can
navigate *into* rather than render *all at once*.

---

## 2. What we found (verified against source)

All references below were read directly from the two repos.

### 2.1 The contract is flat and returns everything

- **`GET /schema`** → `list[TableResponse]`, **no query params**, every table with full
  columns. (`governed-bi/src/governed_bi/api/app.py` ~L111)
- **`GET /graph`** (ER) and **`GET /knowledge-graph`** → the entire graph, **no params**.
  (`app.py` ~L116, ~L121)
- **`TableResponse`** carries a `db: str` field but **no `schema` field**.
  (`governed-bi/src/governed_bi/api/schemas.py`; `TableAsset.db` at
  `governed-bi/src/governed_bi/corpus/schemas.py:269`)
- The heavy per-column fields live on `ColumnResponse`: `sample_values`
  (`api/schemas.py:52`) and `evidence` (`api/schemas.py:62`), plus `description`. These
  dominate the `/schema` payload and are **not needed** for a list/graph overview.

### 2.2 THE KEY FINDING — `schema` is flattened into `db` today

This is the finding that reframes the whole design. The multi-schema profiler does:

```python
# governed-bi/src/governed_bi/curator/build.py  (build_facts_all_schemas)
# L57 docstring: "Profile EVERY schema (one db_id each) into root/<schema>/."
for schema in schemas:
    connector = connector_factory(replace(datasource, schema=schema, db=schema))  # L85
    written[schema] = len(build_facts_corpus(connector, schema, root))
```

Consequences:

- **Each source schema is profiled into its own `db_id`; the connection identity is
  discarded** ("one db_id each"). SQLite has no schema level at all.
- So the *populated* hierarchy is **one level today**. For a multi-schema Postgres
  source, **one `db_id` already equals one schema.**
- There is **no `schema` field** in the corpus model to build a real two-level
  `db → schema → table` tree from. If the UI built that tree now, it would collapse to
  `db → (null) → table`.

**Implication:** the "schema-level grouping" we want is available *today* by grouping on
the existing `db` field. A *true* two-level hierarchy (connection **and** schema, plus
cross-schema edges) is a **separate engine change**, not an additive field bump (see
§7, Phase 4).

### 2.3 Runtime serves a single corpus/DB

At serve time a single SQLite/corpus is mounted; multi-schema/multi-db corpora are a
**curator/build-time** concern. So even the "one db_id per schema" fan-out is not
currently exposed as multiple namespaces at the serve layer. Scaling work must be
**backward-compatible with the single-served-corpus engine** and with the frontend's
**mock mode** (no engine attached).

### 2.4 Rendering hot paths (frontend, secondary but relevant)

Flagged during review; worth fixing when we touch these files regardless of the API:

- `components/schema/er-diagram.tsx:161` — `resolveEndpoints` builds
  `new Map(er.nodes.map(...))` **inside** a function called per edge (L224), i.e. O(E·N)
  on every render.
- `components/schema/knowledge-graph.tsx:496` — `fitView` + `minZoom={0.15}` zooms the
  whole graph out to a "soup" for large corpora instead of a sane default + jump-to-focus.
- `lib/graph-layout.ts:58` — dagre layout runs **synchronously** on the main thread and
  re-runs on every filter toggle/refetch (no memo key), so it blocks even after scoping.
- `components/schema/table-browser.tsx:150` — the table list is **not virtualized**.

### 2.5 Contract already relies on globally-unique ids

Table ids are type-prefixed and globally unique (`governed-bi/src/governed_bi/corpus/ids.py:22,35`,
e.g. `tbl_…`). A per-table detail route can therefore key on `id` alone — no
`(db, id)` compound key needed.

---

## 3. Proposed design — search-first, scope-on-demand

**Principle: never mount the whole corpus. Every graph is either server-scoped to one
namespace or bounded to a focus table's neighborhood. Search is the primary way in.**

### 3.1 Navigation flow

1. **Default landing = search + namespace rail, empty canvas.** A prominent
   Cmd+K/omnibox search bar sits above a compact left rail of `db` namespaces, each with
   health-rollup badges (`n_suspect_columns` / `n_excluded` / `n_low_confidence_joins`).
   The graph canvas starts **empty** with a "pick a namespace or search a table" state —
   never a whole-corpus dump, never a giant overview graph.
2. **Search (primary path).** Typing ≥2 chars queries a lean catalog: server `GET /search`
   when `capabilities.can_search`, else a client-side [Fuse](https://fusejs.io) index over
   cached `GET /schema/summary`. Results group by `db`, show suspect/excluded flags; Enter
   jumps straight into the scoped view with that table pre-focused. This is the 1-action
   path to the dominant task: "find *this* table."
3. **Drill by namespace.** Clicking a `db` in the rail scopes the three sub-tabs —
   Relationships (`GET /graph?db=`), Tables (`GET /schema/summary?db=`, virtualized),
   Semantic (`GET /knowledge-graph?db=`). Dagre only ever lays out one namespace.
4. **Within-namespace sub-grouping (the realistic worst case).** A single db can itself
   hold hundreds of tables, so the Tables list and ER canvas sub-group (table-name prefix /
   connected component / grain), and **the ER canvas defaults to focus mode** rather than
   rendering the whole namespace. A namespace is not a hard bound.
5. **Focus + radius graph interaction.** Selecting a table calls
   `GET /graph?focus=<id>&radius=<1-3>&node_budget=<n>`; the canvas shows only that induced
   neighborhood, capped by `node_budget`, with `meta.truncated` surfaced as "N more —
   expand." Frontier nodes get an "expand neighbors" affordance. **This is the only model
   that survives hundreds-of-tables-in-one-db.**
6. **Graph → matrix → list fallback.** Driven by the response `meta` (returned nodes vs
   budget, density): node-link graph when small + sparse; **adjacency matrix** when
   mid-size/dense; virtualized grouped list otherwise. The user can drill into focus mode
   from a matrix cell or list row.
7. **Lazy table detail.** Opening any node/row fetches `GET /schema/{table_id}`
   (`sample_values`, `evidence`, descriptions) **only on open**, feeding the existing
   `NodeDetailSheet`. The page stops passing the whole `/schema` array around.
8. **Cross-boundary jump.** A join whose other endpoint is outside the current scope
   renders as a labelled **off-canvas boundary stub** (distinct DB badge for the rare
   cross-db case); clicking it re-scopes + re-focuses on the other endpoint — one
   deliberate hop, never importing foreign nodes into the layout.

---

## 4. Proposed API / contract changes

Everything below is **additive and optional**: param-less calls behave exactly as today,
and new fields are nullable, so an older engine's response still passes the frontend's
fail-loud zod parse. The UI gates the new flow on new capability flags and falls back to
today's behavior when they are absent.

### 4.1 Endpoints

| Endpoint | New? | Purpose | Backed by data that exists today? |
|---|---|---|---|
| `GET /schema/summary?db=&limit=&offset=` | **new** | Lean, scopeable, paginated catalog for the virtualized Tables list + client search index. Pure projection of existing data with heavy fields stripped. **Biggest single payload win, zero new data.** | ✅ pure projection |
| `GET /schema/{table_id}` | **new** | One table's full detail, fetched lazily on detail-sheet open. `id` alone is unique, so no compound key. 404 when absent. | ✅ existing detail |
| `GET /graph?db=&focus=&radius=&node_budget=` | modify | Optional `db` scoping **and** focus+radius induced neighborhood + `meta`/`boundary` envelope. No params = today's full graph. | ✅ existing `JoinAsset` edges |
| `GET /knowledge-graph?db=&focus=&radius=&node_budget=&kinds=` | modify | Same scoping/bounding as `/graph` for the semantic graph. | ✅ existing assets |
| `GET /search?q=` | **new (later)** | Optional server-ranked search over tables+columns, gated on `can_search`. **Deferred** — a client Fuse index over `/schema/summary` is the default and is sufficient at these sizes (engine has no FTS today). | ⚠️ new work |
| `GET /schema?db=&limit=&offset=` | modify | Add optional scoping; retained as the backward-compat full dump. Gains additive nullable `schema`. | ✅ |
| `GET /capabilities` | modify | Add `can_scope` and `can_search` booleans so the UI gates the new flow and falls back gracefully. | ✅ |

### 4.2 Response shapes (proposed)

`GET /schema/summary` — lean catalog (drops `sample_values`/`evidence`/`description`):

```jsonc
{
  "total": 412,
  "items": [
    {
      "id": "tbl_sales_orders",
      "physical_name": "orders",
      "db": "sales",                 // == schema today (see §2.2)
      "schema": null,                // forward-compat; null until Phase 4
      "row_count": 1200000,
      "n_columns": 24,
      "excluded": false,
      "has_suspect": true,
      "provenance_status": "certified",
      "columns": [                   // lean column rows for search/preview only
        { "physical_name": "id", "physical_type": "INTEGER", "role": "primary_key",
          "reliability": "ok", "excluded": false }
      ]
    }
  ]
}
```

`GET /schema/{table_id}` → the existing full `TableResponse` (plus additive nullable
`schema`). 404 when the id is unknown.

`GET /graph` (and `/knowledge-graph`) — scoped/bounded with a `meta` + `boundary` envelope:

```jsonc
{
  "nodes": [ /* SchemaGraphNode + db, schema:string|null */ ],
  "edges": [ /* SchemaGraphEdge[] */ ],
  "boundary": [
    {
      "id": "join_x",
      "in_scope_table": "tbl_sales_orders",
      "other_db": "billing",
      "other_table_id": "tbl_billing_invoices",
      "other_label": "invoices",
      "on": "orders.invoice_id = invoices.id",
      "cardinality": "many_to_one",
      "confidence": 0.9,
      "low_confidence": false,
      "cross_db": true
    }
  ],
  "meta": {
    "total_nodes": 380,
    "returned_nodes": 52,
    "total_edges": 640,
    "truncated": true,
    "scope": { "db": "sales", "focus": "tbl_sales_orders", "radius": 2, "node_budget": 60 }
  }
}
```

`GET /search`:

```jsonc
{
  "query": "invoice",
  "total": 7,
  "hits": [
    { "kind": "table", "id": "tbl_billing_invoices", "table_id": "tbl_billing_invoices",
      "label": "invoices", "db": "billing", "schema": null, "detail": null,
      "excluded": false, "has_suspect": false, "score": 0.98 }
  ]
}
```

`GET /capabilities` → existing shape + `{ "can_scope": bool, "can_search": bool }`.

### 4.3 Model/field changes

1. Add **`schema: str | None`** to `TableAsset` / `TableView` / `TableResponse`, and add
   `db` (recoverable today: node → its table's `db`) **+ nullable `schema`** to
   `SchemaGraphNodeResponse` and `KnowledgeGraphNodeResponse`. All **additive + nullable**
   so older responses still validate.
2. **Do not** build a `db → schema` two-level tree as the navigation backbone yet — group
   by the real, populated `db` field. `schema` stays null until Phase 4.
3. **Deterministic truncation:** when `node_budget` truncates a neighborhood, the survivor
   set must be deterministic (e.g. BFS ordered by confidence desc, then id) so cached
   scopes and "expand" don't flicker.

### 4.4 Backend behavior notes / feasibility

- `/schema/summary` and `/schema/{id}` are **projections of data the engine already
  computes** — no new profiling, no new storage. This is the cheapest, highest-value change.
- `/graph` scoping and focus/radius operate on the **existing `JoinAsset` edge set**;
  the induced-subgraph BFS is server-side graph traversal, not new data.
- **Boundary edges are computed against the full corpus** even when the node list is
  scoped, so a crossing is never silently dropped. Today **only cross-db boundaries are
  detectable** (there is no `schema` axis to compare, and joins carry no namespace). Since
  cross-db joins are "almost never" and are unexecutable at runtime (single connector),
  this list is nearly always empty and never threatens payload/legibility bounds.
- Server `/search` is **real, unspecified work** (no FTS today) and is explicitly deferred;
  the client Fuse index is the default.

---

## 5. Cross-boundary relationship strategy

- Surface boundaries as **compact, server-computed descriptors**, never by importing
  foreign nodes into the layout.
- The client draws each boundary as a **labelled off-canvas stub**; clicking re-scopes and
  re-focuses on the other endpoint (one click, one hop).
- Give **cross-db** stubs a distinct DB badge so an unexpected one is visually loud — it is
  a **governance signal** (a join that cannot back a real query at runtime), arguably shown
  as a warning rather than a navigable relationship (see Open Question Q7).
- **Cross-schema** boundaries are deferred to the real-schema phase (Phase 4); do not build
  cross-schema external-edge machinery against an axis that is currently null.

---

## 6. Frontend plan (context for the discussion)

Mostly our side; listed so the backend owner sees how the API is consumed.

| Component | Change |
|---|---|
| `app/schema/page.tsx` | Restructure from "three tabs over the whole corpus" to search-first: omnibox + db rail landing, empty canvas until scoped. Lift `scope:{db, focus?, radius?}` state; add breadcrumb; stop passing the whole `/schema` array into the detail sheet (`page.tsx:70-73`). |
| `components/schema/schema-search.tsx` **(new)** | Command palette wired to `useSearch`: server `/search` when `can_search`, else Fuse index over `/schema/summary`. Grouped by db; Enter → scoped view with table pre-focused. |
| `components/schema/table-browser.tsx` | Virtualize with `@tanstack/react-virtual` (`~L150`); accept scope + pagination; feed from `/schema/summary`; hydrate full columns via `useTableDetail` on expand; within-namespace sub-grouping. |
| `components/schema/er-diagram.tsx` | Scope-driven; default focus mode; enforce `node_budget` + `meta.truncated` "expand"; `onlyRenderVisibleElements`; boundary stubs. Fix O(E·N) `resolveEndpoints` map (`L160-161`) and fitView-to-everything. |
| `components/schema/knowledge-graph.tsx` | Accept scope/focus/radius/kinds; same budget/meta treatment; boundary stubs; fix `fitView`/`minZoom` (`L496`). |
| `components/schema/adjacency-matrix.tsx` **(new, later)** | Tables×tables matrix fallback when `meta` says the scope is too big/dense; drill into focus mode from a cell. |
| `components/schema/node-detail-sheet.tsx` | Read from `useTableDetail(id)` (lazy `/schema/{id}`) instead of the whole `/schema` array. **Load-bearing** — without it the eager full-corpus fetch silently remains. |
| `hooks/queries.ts` | Add `useSchemaSummary(scope)`, `useTableDetail(id)`, `useSearch(q)` (debounced, `enabled: q.length>=2`, `keepPreviousData`), scope-aware `useErGraph`/`useKnowledgeGraph`; keys map 1:1 to endpoints so each scope caches independently. Prefetch-on-hover. |
| `lib/api-client.ts` | Add `schemaSummary`/`tableDetail`/`search`; thread `?db=`/`focus`/`radius`/`node_budget`; parse each through zod. Under `USE_MOCKS`, derive lean summary, per-table detail, and a Fuse catalog from the existing `MOCK_SCHEMA` so offline mode exercises the full flow. |
| `lib/schemas.ts` + `lib/types.ts` | Add `tableSummarySchema` (+ envelope), `searchResponseSchema`, `boundaryEdgeSchema`, `graphMetaSchema`; extend graph nodes with `db` + nullable `schema`; wrap graph responses in `{nodes,edges,boundary,meta}`; add `can_scope`/`can_search`. All new fields optional/nullable. |
| `lib/graph-layout.ts` | Memoize dagre by a stable scope key (`L58`); consider a worker for large single-namespace scopes. |

---

## 7. Phasing (each phase ships value independently)

| Phase | Scope | Value |
|---|---|---|
| **1 — Lean payloads + lazy detail + search-first landing** *(no engine hierarchy change)* | Engine: `GET /schema/summary`, `GET /schema/{id}`, optional `?db=&limit=&offset=` on existing routes, `can_scope` flag. Frontend: virtualized list off `/schema/summary`, lazy detail sheet, rail grouped by `db`, client Fuse search as default landing. | Removes **every** whole-corpus dump and the every-column serialization immediately — on the current single-db engine and in mock mode. **The bulk of the win, zero new data, no schema-axis dependency.** |
| **2 — Bounded graph engine** | Engine: `?db=` + `focus/radius/node_budget` on `/graph` and `/knowledge-graph`, `meta` envelope with deterministic truncation, cross-db boundary descriptors. Frontend: scoped ER defaulting to focus mode, `onlyRenderVisibleElements`, budget + "expand", boundary stubs, within-namespace sub-grouping, hot-path fixes. | Makes the graph views survive **hundreds of tables in a single db** — the case a db-level hierarchy alone cannot solve. |
| **3 — Fallback renderers + server search** | Frontend: adjacency-matrix / grouped-list fallbacks driven by `meta`. Engine: optional `GET /search` (server ranking) gated on `can_search`, Fuse retained. | Handles dense scopes a node-link graph reads poorly; upgrades search where the engine can support it. Non-blocking. |
| **4 — Real schema axis** *(separate, honest engine work)* | Engine pipeline: change `build.py` to record connection **and** schema separately (stop `db=schema` at `build.py:85`), populate `TableAsset.schema`, **re-profile existing corpora**. Then light up the second rail level + cross-schema boundary detection. | Only then is the true two-level `db → schema` tree and cross-schema boundary real. Deferred because it is a data-pipeline + re-ingestion change, not an additive bump. |

**Recommendation: do Phase 1 now regardless of the hierarchy decision.** It is
backward-compatible, fixes the payload/render problem on the current engine, and needs no
`db`-vs-`schema` decision. Decide Phase 4 based on Q1/Q2 below.

Overall effort: **M → L.** Phase 1 alone is a solid **M** and is most of the value.

---

## 8. Backward compatibility & mock mode

- New query params are **defaulted** (FastAPI optional `Query`), so existing param-less
  calls behave exactly as today.
- New fields (`schema`, node `db`/`schema`, `boundary`, `meta`) are **additive/nullable**,
  so an older engine's response still passes the frontend's fail-loud zod `.parse()`.
- The UI gates the new flow on `capabilities.can_scope` / `can_search` and **falls back** to
  today's whole-corpus dumps + client-side grouping-by-`db` + Fuse search when the flags are
  absent — so it works against the current single-served-corpus engine and any pre-upgrade
  engine.
- **Mock mode** is preserved by deriving `MOCK_SCHEMA_SUMMARY`, per-table detail, and the
  Fuse catalog from the existing `MOCK_SCHEMA` fixture, treating the single db as one
  namespace.
- `GET /schema` is retained unchanged as the fallback/full dump.

---

## 9. Open questions for the backend owner

> These are the decisions that need your input. **Q1 is the fork that shapes everything.**

1. **Do we want the *true* two-level `connection → schema → table` tree (Phase 4), or is
   grouping by the flattened `db_id`-per-schema enough?**
   Today `build.py:85` sets `db = schema` and drops the connection identity. A real
   two-level tree requires recording connection **and** schema separately and re-profiling
   all corpora. If we will only ever serve one `db_id` per schema, we should **drop the
   two-level tree entirely** and leave `schema` permanently null — no dead UI affordances.

2. **Do real deployments actually put hundreds of tables in a *single* db/schema?**
   This is make-or-break for effort ordering. If yes → Phase 2 (focus/radius +
   within-namespace sub-grouping) is **mandatory**. If tables are spread thin across many
   schemas, the namespace rail alone nearly solves it and Phase 2 can wait. Can we validate
   against real BIRD/Postgres corpora?

3. **Field naming:** alias the wire field as **`schema_name`** (avoids colliding with the
   `/schema` route and the zod `schema` identifier) or keep `schema` and map on serialize?

4. **`node_budget` sizing:** what is the right per-view cap given DOM weight (each ER card =
   one row + two React Flow handles per column)? Rough starting point: ~50–60 ER cards vs
   ~150 semantic-graph glyphs — needs measurement on target hardware. Should `node_budget`
   be server-enforced, client-requested, or both?

5. **Within-namespace sub-grouping key:** which is most meaningful to auditors — table-name
   prefix, connected component, or grain? This decides whether sub-grouping is deterministic
   or needs curator input.

6. **Is server `/search` (Phase 3) ever worth building**, or is the client Fuse index over
   `/schema/summary` permanently sufficient at expected corpus sizes? The engine has no FTS
   today, so server search is real, unspecified work.

7. **Cross-db boundary edges are unexecutable at runtime** (single connector). Should they
   be shown as a **governance warning** ("unexpected cross-db join detected") rather than a
   navigable relationship?

8. **Truncation determinism:** confirm the engine can return a **stable** survivor ordering
   for `node_budget` (e.g. BFS by confidence desc, then id) so cached scopes and "expand"
   don't reshuffle.

---

## 10. Appendix — verification evidence

Claims in this doc were read from source, not assumed:

- Flattening: `governed-bi/src/governed_bi/curator/build.py:85` +
  docstring L57 ("one db_id each").
- No `schema` field: `governed-bi/src/governed_bi/corpus/schemas.py` (`TableAsset.db` at L269, no schema).
- Parameterless routes: `governed-bi/src/governed_bi/api/app.py` (`/schema` ~L111, `/graph` ~L116, `/knowledge-graph` ~L121).
- Heavy column fields: `governed-bi/src/governed_bi/api/schemas.py` (`sample_values` L52, `evidence` L62).
- Globally-unique ids: `governed-bi/src/governed_bi/corpus/ids.py:22,35`.
- Frontend hot paths: `er-diagram.tsx:160-161,224`; `knowledge-graph.tsx:496`;
  `graph-layout.ts:58`; `table-browser.tsx:150`; `app/schema/page.tsx:70-73`.

> Methodology note: the design was produced by generating three independent approaches
> (hierarchy-first, graph focus+context, search-first), running two adversarial critiques
> (API feasibility, UX/perf), and synthesizing. The API-feasibility critique is what
> surfaced the `db`-vs-`schema` flattening (§2.2), which corrected an initial
> "make schema the backbone" instinct.
