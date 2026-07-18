# Project-local AI memory (`.claude/memory/`)

This folder is the **project-local memory for AI assistants**, committed with the code (not in any
machine's global `~/.claude`). Any developer or Claude/AI account that opens this package should read
these files for full context. Keep them updated as work proceeds.

- [status.md](status.md) — current build status + session log (what's done, what's next).
- [requirements.md](requirements.md) — the COMPLETE requirements backlog (every request, tracked).
- Human-facing docs live in [`/docs`](../../docs/) (ROADMAP / SETUP / ARCHITECTURE) and [`/CLAUDE.md`](../../CLAUDE.md).

## Hard rules (do not violate)
- **Never `git commit` / `git push`** — the user does that. Never commit secrets.
- API keys live only in `apps/web/.env.local` (gitignored), read **server-side** only.
- Every feature is **optional via `features` flags**. End goal: **backend (Supabase), no localStorage reliance**
  (localStorage is the dev fallback only until Supabase creds are provided).
- Prefer **free** tech; if no free option, build our own. If a cloud key (e.g. Gemini) is missing/invalid,
  fall back to a **local model** (e.g. `@imgly/background-removal` for remove-bg).
- UI must be **meaningful for a WEB gallery** (not iOS) — e.g. no "App Store"; "Albums" not "Projects".
