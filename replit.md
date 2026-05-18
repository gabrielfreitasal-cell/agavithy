# Agavity

Agavity is a privacy-first, local code snippet manager for developers — capturing, organizing, and semantically enriching code snippets with LLM support via Ollama.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm --filter @workspace/agavity run dev` — run the frontend (uses PORT env var)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite + TailwindCSS (artifacts/agavity)
- API: Express 5 (artifacts/api-server)
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Syntax highlighting: react-syntax-highlighter (Prism)
- LLM enrichment: Ollama (localhost:11434) with heuristic fallback

## Where things live

- `lib/api-spec/openapi.yaml` — API contract (source of truth)
- `lib/db/src/schema/snippets.ts` — DB schema (snippets, tags, snippet_tags, clipboard_state)
- `artifacts/agavity/src/` — React frontend
- `artifacts/api-server/src/routes/` — Express route handlers
  - `snippets.ts` — CRUD + stats + enrichment
  - `tags.ts` — tag listing with counts
  - `clipboard.ts` — capture and monitoring status

## Architecture decisions

- Contract-first OpenAPI spec gates all codegen (React Query hooks + Zod schemas)
- Enrichment pipeline calls Ollama locally; gracefully falls back to regex heuristics if unavailable
- Clipboard monitoring state is persisted in `clipboard_state` table (single-row pattern)
- Tag many-to-many via `snippet_tags` join table; tags auto-created on upsert
- Language detection heuristics run server-side on every capture

## Product

- Dashboard with real-time stats (total, pinned, enriched), recent captures, top languages and tags
- Snippet library with search, language/tag/source-app filters
- Snippet detail with syntax highlighting, pin toggle, inline edit, AI enrichment trigger
- Manual capture page with clipboard monitor status polling
- Tag browser

## Gotchas

- Ollama enrichment requires `ollama serve` running locally with a model (e.g. `ollama pull llama3.2`)
- After any OpenAPI spec change, always run `pnpm --filter @workspace/api-spec run codegen` before using updated types
- `react-syntax-highlighter` must be in `dependencies` of `artifacts/agavity/package.json`
