# AI Content Hub — Project Audit (2026-11-11)

## Environment

| Item       | Status                                                |
| ---------- | ----------------------------------------------------- |
| OS         | Windows 11 Pro, 15.8 GB RAM, ~150 GB free disk        |
| Git        | 2.43.0 OK                                             |
| Node.js    | v24.21.0 OK (pin an LTS in `.nvmrc` later)            |
| npm        | 10.8.0 OK                                             |
| pnpm       | MISSING                                               |
| Docker     | MISSING (needed for PostgreSQL, Redis, n8n)           |
| WSL2       | Not installed (Docker Desktop will need it / Hyper-V) |
| GitHub CLI | 2.103.3 installed, NOT authenticated                  |

## Repository

- Empty folder `C:\Users\pc\Desktop\ai-content-hub`, `git init -b main` done.
- No remote, no commits, no existing code, no env files, no workflows.

## Blockers / actions for the user

1. `corepack enable && corepack prepare pnpm@latest --activate` (or `npm i -g pnpm`)
2. Install Docker Desktop (requires WSL2: `wsl --install`, then reboot).
3. `gh auth login`, then `gh repo create ai-content-hub --private --source . --remote origin`.
4. Create accounts (free tiers): Supabase, OpenRouter, Cloudflare (Workers AI + R2).

## Architecture conflicts / risks

- Without Docker, local Postgres/Redis can't run; alternative: Supabase hosted Postgres + Upstash Redis for dev.
- Scope is large: build MVP slice first (org → brand kit → text → facts → article → social → carousel → approval → WordPress draft).
- Defer: Instagram/Facebook publishing (app review delays), SEO intelligence, n8n builder.
- Arabic RTL and Design Studio (Konva/Fabric) are the highest-effort areas.

## Decision: no Docker until the product is finished

- Do not create Dockerfiles, docker-compose or Docker CI jobs yet.
- Dev database: hosted Supabase Postgres (free tier) via Prisma.
- Dev Redis/BullMQ: hosted Upstash Redis, or run Redis-free until queues are needed.
- Run apps directly with `pnpm dev`. Containerization is a final-phase task.

## Next step

Step 2: product documentation and architecture (PRODUCT_SPECIFICATION.md, ARCHITECTURE.md, ADRs...).
