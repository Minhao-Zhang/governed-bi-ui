# governed-bi-ui

The web frontend for **[governed-bi](https://github.com/Minhao-Zhang/governed-bi)** —
an agentic BI / Generative-BI engine that turns natural-language questions into
**grounded, governed, auditable** answers over relational data.

This is a **companion repo**: it holds no BI logic of its own. It is a pure client
that renders what the engine serves — the governed answer with its two-axis
reliability stamp, the semantic layer (schema, relationships, corpus), and the
per-answer audit trail. The engine, its contracts, and the canonical design docs
live in the [governed-bi](https://github.com/Minhao-Zhang/governed-bi) repo; read
those first (start with `docs/ui-frontend-handoff.md` there).

> **Status:** early, and honest about it — matching the engine's own maturity.
> By default the UI runs on neutral **mock data** so every surface renders with no
> backend attached; point it at a running engine to see live, governed answers.

## What it shows

- **Chat** — ask a question, watch the governed pipeline (Route → Retrieve →
  Generate SQL → Guardrails → Execute → Compose), and get an answer card: the
  **two-axis stamp** (`safety_clearance` + `semantic_assurance`, never collapsed
  into one score), the answer text, a collapsible result table, read-only
  (highlighted) SQL, and a provenance/audit drawer. Refusals show the escalation,
  never a fabricated number.
- **Schema** — the semantic layer, three ways:
  - **Relationships** — a column-level ER diagram (tables, columns, FK edges with
    cardinality).
  - **Semantic graph** — the full corpus as a typed, filterable knowledge graph
    (metrics, terms, joins, rules, few-shots, negatives).
  - **Tables** — a plain, auditable table/column browser with governance flags.
- **Corpus** — the non-table assets and skills, with provenance and exclusion state.
- **Health** — corpus health: CI status and the flags a reviewer triages first
  (suspect columns, exclusions, low-confidence joins).

Reliability is the one "loud" color channel (green/amber/red = trust level);
everything else stays neutral, so color always means *trust*.

## Architecture

The UI is a **pure client** of the engine's **LangGraph Server** (see
[ADR 0001](https://github.com/Minhao-Zhang/governed-bi/blob/main/docs/adr/0001-langgraph-server-chat-runtime.md)):
chat streams over the LangChain **`useStream`** protocol; schema / corpus / health
are **custom REST routes** on that same server; the UI adapts its affordances to
`GET /capabilities`. It owns no database — conversation state is the runtime's
thread state. When no backend URL is configured, all reads resolve to mock
fixtures and chat uses a synthetic transport, so the app is fully explorable
offline.

**Stack:** Next.js 16 (App Router) · React 19 · TypeScript (strict) · Tailwind CSS
v4 · shadcn/ui · `@xyflow/react` + dagre (graphs) · TanStack Query · zod ·
`@langchain/langgraph-sdk` / `@langchain/react`.

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — it runs in **mock mode**
(neutral placeholder data) out of the box.

### Wire it to a live engine

1. Run the engine's LangGraph Server (from the
   [governed-bi](https://github.com/Minhao-Zhang/governed-bi) repo):

   ```bash
   uv run --extra agents --extra api langgraph dev   # serves http://localhost:2024
   ```

   Set `OPENAI_API_KEY` for live NL answers; CORS already allows `http://localhost:3000`.

2. Create `.env.local` here (git-ignored):

   ```
   NEXT_PUBLIC_LANGGRAPH_URL=http://localhost:2024
   NEXT_PUBLIC_ASSISTANT_ID=serve
   ```

3. Restart `npm run dev`. Leave the URL empty (or delete `.env.local`) to return
   to mock mode.

## Deployment

Config-driven, no code change: the UI deploys to Vercel and points
`NEXT_PUBLIC_LANGGRAPH_URL` at a hosted LangGraph Server (the engine runs the same
way locally, as a public demo over bundled SQLite, or internally against a real
database).

## License

MIT © 2026 Minhao Zhang. The bundled BI data is third-party and separately
licensed — see the [governed-bi](https://github.com/Minhao-Zhang/governed-bi) repo.
