<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Companion to the governed-bi engine

This repo is the **frontend companion** to the `governed-bi` engine
(https://github.com/Minhao-Zhang/governed-bi). It owns no BI logic — it renders
what the engine serves and adapts to `GET /capabilities`.

- **The engine repo is the source of truth** for contracts, data shapes, and
  design rationale. Read its docs before building a feature — start with
  `docs/ui-frontend-handoff.md`, then `docs/ui-frontend-design.md` and the ADRs.
- The engine is exposed as a **LangGraph Server**: chat via `useStream`, plus
  custom REST routes (`/capabilities`, `/health`, `/schema`, `/graph`,
  `/knowledge-graph`, `/corpus/assets`, `/skills`, `POST /corpus/edit`). Frontend
  config: `NEXT_PUBLIC_LANGGRAPH_URL`, `NEXT_PUBLIC_ASSISTANT_ID`.
- With no `NEXT_PUBLIC_LANGGRAPH_URL`, the app runs on neutral mock fixtures
  (`lib/mock/fixtures.ts`); the contract boundary is `lib/schemas.ts` (zod).
