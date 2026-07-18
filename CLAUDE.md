# CLAUDE.md — project memory for AI assistants & developers

> **This file is the project-local source of truth.** It lives in the repo (not in any individual's
> `~/.claude`), so any developer — or any Claude/AI account that opens this package — can read the
> full context, decisions, and roadmap. Keep it updated as the project evolves.

## What this is

A **reusable macOS Photos–style photo gallery SDK** (`@photo-gallery/sdk`) for React / Next.js, plus a
Next.js demo (`apps/web`). Goal: a near carbon-copy of macOS Photos (light/dark/semi-dark, fully
responsive) where **every feature is optional via flags**, so each consuming project enables only what
it needs. See [`docs/ROADMAP.md`](docs/ROADMAP.md) for the complete, living feature checklist
(done / in-progress / planned) and [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the design.

## Monorepo

- `packages/photo-sdk` — the SDK (React components, Zustand store, adapters, AI provider interface,
  lib utils, self-contained CSS). **No heavy/ML deps in here** — they're injected by the host app.
- `apps/web` — Next.js demo: landing page (`/`) + gallery (`/gallery`), AI providers, server routes.

## Conventions

- SDK ships its own `styles.css` (no Tailwind required by consumers). Classes are prefixed `apg-`.
- State: a per-instance Zustand store (`createGalleryStore`) provided via React context.
- Storage is a pluggable `StorageAdapter` (default: localStorage/IndexedDB). AI is a pluggable
  `AIProvider` (object detection / faces / OCR / caption / embeddings / generativeEdit) — all optional.
- Every capability is gated by a feature flag (`features={{ editor, camera, ai, map, import, export, ... }}`).
- Security: strict per-request **nonce CSP** (middleware), input validation, URL-scheme allow-list,
  filename sanitization, server-only API keys (never `NEXT_PUBLIC_`). Don't regress this.

## Secrets

- API keys go in `apps/web/.env.local` (gitignored via `.env.*`). **Never commit keys.** Gemini is
  read server-side only in `apps/web/src/app/api/ai/edit/route.ts`. See `.env.example`.

## Run

```bash
pnpm install && pnpm dev   # http://localhost:3000  (landing → Open Gallery → /gallery)
pnpm build                 # SDK (tsup) + Next production build
pnpm typecheck
```

Full setup/troubleshooting: [`docs/SETUP.md`](docs/SETUP.md).

## Memory & status

**AI/working memory lives in [`.claude/memory/`](.claude/memory/)** (committed with the repo, not in any
machine's global `~/.claude`):
- [`.claude/memory/status.md`](.claude/memory/status.md) — current status + session log.
- [`.claude/memory/requirements.md`](.claude/memory/requirements.md) — the complete requirements backlog.

Human-facing feature checklist is [`docs/ROADMAP.md`](docs/ROADMAP.md). Read `.claude/memory/` + `docs/ROADMAP.md`
first — they are authoritative and travel with the code.
