# Testing

AI Content Hub has three automated test levels, plus static checks. Every command below is run from the
repository root and works on Windows, macOS and Linux.

| Level       | Tool                  | What it uses                                                         | Command                       |
| ----------- | --------------------- | -------------------------------------------------------------------- | ----------------------------- |
| Static      | ESLint, TypeScript    | source only                                                          | `pnpm lint`, `pnpm typecheck` |
| Format      | Prettier              | source only                                                          | `pnpm format:check`           |
| Unit        | Vitest                | mocks only, no database, no network                                  | `pnpm test:unit`              |
| Integration | Vitest + Supertest    | real NestJS app, real Prisma, real PostgreSQL, real JWT verification | `pnpm test:integration`       |
| End-to-end  | Playwright (Chromium) | real browser, real Next.js, real API, real PostgreSQL                | `pnpm test:e2e`               |

Run everything the way CI does: `pnpm test:all`.

## One-time setup

```bash
pnpm install
pnpm e2e:install        # downloads Chromium for Playwright (once)
```

No Docker, no local PostgreSQL and no Redis are needed.

## The PostgreSQL test database

Integration and E2E tests need PostgreSQL.

- **Locally (default):** the test run starts a throwaway PostgreSQL itself (the `embedded-postgres` package),
  applies every Prisma migration to the empty database, and deletes it afterwards. Nothing to install.
- **CI, or your own server:** set `TEST_DATABASE_URL` and that database is used instead:

  ```bash
  TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/aich_test pnpm test:integration
  ```

**Safety guard:** the runner refuses any database whose host is not local or whose name does not contain
`test`. Tests empty their tables between cases, so they can never be pointed at the Supabase database.

Redis is not used by the application yet, so there is no Redis test configuration. When a feature adds
queues or caching, add a Redis service to the `integration` job in `.github/workflows/ci.yml` and a
`TEST_REDIS_URL` variable next to `TEST_DATABASE_URL`.

## Unit tests (`apps/api/src/**/*.spec.ts`)

```bash
pnpm test:unit                                  # all unit tests
pnpm --filter @aich/api test:watch              # watch mode
pnpm --filter @aich/api exec vitest run src/ai  # one folder
```

They cover business logic with mocked collaborators: AI providers (free-only enforcement, quota exhaustion,
timeouts, retries, fallbacks, JSON repair), SSRF-safe URL fetching, source extraction, brand kit rules,
permission matrix and invitation logic. No test here ever contacts a real AI provider.

## Integration tests (`apps/api/test/integration/*.int.spec.ts`)

```bash
pnpm test:integration
pnpm --filter @aich/api exec vitest run -c vitest.integration.config.ts test/integration/auth
```

| File                        | What it proves                                                                                                                                                                       |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `database.int.spec.ts`      | migrations apply on a fresh DB, no drift from `schema.prisma`, foreign keys, tenant indexes, unique rules, cascade deletes, transaction rollback                                     |
| `auth.int.spec.ts`          | missing, malformed, forged, expired and wrong-audience tokens get 401; a valid token provisions the user                                                                             |
| `organizations.int.spec.ts` | role permissions, invitation rules (hashed tokens, admins cannot grant OWNER), **cross-tenant isolation** (404 and no data change), request validation                               |
| `content.int.spec.ts`       | content pieces: read vs write permissions, edit validation (bad edits change nothing), generation errors with no AI provider (nothing saved, no quota spent), cross-tenant isolation |
| `ai-errors.int.spec.ts`     | AI endpoints with no provider configured: clear error, no quota spent, paid models refused, non-admins blocked                                                                       |

Tokens are signed with a test secret exactly like Supabase tokens, and verified by the production
`SupabaseTokenVerifier`. `test/helpers/env.ts` blanks every provider key, so no test can reach an AI service.

## End-to-end tests (`apps/web/e2e/*.e2e.ts`)

```bash
pnpm test:e2e                                           # desktop + mobile projects
pnpm --filter @aich/web exec playwright test --project=desktop
pnpm --filter @aich/web test:e2e:ui                     # interactive runner
pnpm --filter @aich/web exec playwright show-report     # HTML report after a failure
```

Playwright starts the whole stack itself: a PostgreSQL test database, the real API on port 4100 and the
Next.js app on port 3100. Free those ports first if something else uses them. Tests sign in by placing a
valid session in the browser's storage (no Supabase project is contacted) and then use the real UI and API.

- `navigation.e2e.ts`: signed-out redirects, login/signup links, form validation, onboarding redirect,
  sidebar navigation, log out, no horizontal scrolling.
- `content-workflow.e2e.ts`: create an organization, save brand kit versions, reload to prove persistence,
  switch active version, server-side validation error, a second user cannot see another organization.

Every test also fails on any uncaught page error or unexpected browser console error. A test that
deliberately provokes an HTTP error declares it with the `allowedHttpErrors` fixture.

## CI

`.github/workflows/ci.yml` runs on every pull request to `main`: `quality` (format, Prisma schema, lint, types),
`unit`, `integration` (PostgreSQL service), `e2e` (PostgreSQL service + Chromium), `build`, and a final
`CI passed` job that fails unless all of them succeeded.

To make a failing test block merging, require the **`CI passed`** check in the repository's branch protection
rule for `main` (Settings, Branches, Require status checks to pass before merging). A workflow alone cannot
block a merge; that setting does.

## Adding tests

- Business rules with no I/O: a `*.spec.ts` next to the code (unit).
- Anything touching Prisma or the HTTP layer: `apps/api/test/integration/<area>.int.spec.ts`. Call
  `resetDb()` in `beforeEach`, seed through `seedUser`/`seedOrg`, authenticate with `bearer()`.
- A new organization-scoped endpoint must get a cross-tenant test: a user from another organization receives 404
  and the database is unchanged.
- External services (AI, social networks, WordPress, email) are always mocked or run against a sandbox, never
  production. Test quota exhaustion, timeouts and provider failures with mocks.
- Database schema change: add the Prisma migration; `database.int.spec.ts` then verifies it applies cleanly and
  matches the schema.

## Known gaps

- **Campaign creation** has no test yet because campaigns do not exist (roadmap feature 7). Add the API and
  E2E tests in the same pull request that adds the feature.
- **AI generation success path** (source fact extraction and studio generation producing real content) is
  covered only by the mocked unit tests. A fake OpenRouter server (the base URL is configurable through
  `OPENROUTER_BASE_URL`) would let integration and E2E tests drive the full journey source, facts, article.
- **Migration upgrade path** (applying new migrations on top of a populated older database) is not automated;
  only fresh-database setup and schema drift are.
- **Mobile navigation:** the sidebar is hidden below the `md` breakpoint and no other navigation replaces it,
  so the sidebar E2E test is skipped on the mobile project. Remove the skip when mobile navigation exists.
- **ESLint warnings:** `@typescript-eslint/no-explicit-any` is a warning because existing code (mostly the
  content studio) uses `any`. New code should not add more.
