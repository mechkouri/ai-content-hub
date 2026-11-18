# AI Content Hub

From one input (text, PDF, DOCX or a web page) to verified facts, then SEO articles and Instagram, Facebook and
LinkedIn posts in French, Arabic and English. After a human approves them, they are scheduled and published to
your social pages and your WordPress website. There are no ads, and only free AI models are ever used.

The interface is available in English, French and Arabic (right-to-left).

## How it works

1. **Source:** paste text, upload a PDF or DOCX, or give a public web page. Facts (dates, prices, links, emails)
   are extracted, each with the exact quote it came from. You confirm, edit or add facts.
2. **Studio:** the AI writes only from your **verified** facts. Anything in the text that is not in the facts
   (an invented date, price, link) is highlighted while you edit and blocks submission.
3. **Approval:** draft, review, approved. Any edit after approval sends the content back to draft.
4. **Schedule and publish:** approved content is scheduled in the calendar and published to the connected
   channels by a background worker, with retries and duplicate protection.
5. **Analytics:** what was created, approved, published and failed, per channel.

## What you need

- Node.js 20 or newer and [pnpm](https://pnpm.io)
- A [Supabase](https://supabase.com) project (Postgres database and sign-in)
- Optional, for AI: an [OpenRouter](https://openrouter.ai) key (text) and Cloudflare Workers AI (images)

## Set up

```bash
pnpm install
cp .env.example .env
cp apps/web/.env.example apps/web/.env.local
```

Fill in the two files (the tables below say what each value is), then:

```bash
pnpm --filter @aich/database generate
pnpm --filter @aich/database db:deploy
pnpm dev
```

The web app runs on http://localhost:3000 and the API on http://localhost:4000/api.

### API settings (`.env`)

| Setting                                                                                       | What it is                                                                                                        |
| --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`, `DIRECT_URL`                                                                  | Supabase Postgres connection strings (pooled and direct)                                                          |
| `SUPABASE_JWKS_URL` or `SUPABASE_JWT_SECRET`                                                  | How the API checks sign-in tokens (set one)                                                                       |
| `WEB_ORIGIN`                                                                                  | The web app's address, allowed by CORS (default `http://localhost:3000`)                                          |
| `OPENROUTER_API_KEY`                                                                          | Text generation. Only free models are called                                                                      |
| `CLOUDFLARE_IMAGE_WORKER_URL` + `_TOKEN`, or `CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_API_TOKEN` | Image generation                                                                                                  |
| `ENCRYPTION_KEY`                                                                              | Encrypts channel logins at rest. Generate with the command in `.env.example`. Do not lose or change it            |
| `PEXELS_API_KEY`                                                                              | Optional. A free key from pexels.com/api adds Pexels to the free picture search (Openverse works without any key) |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `PUBLIC_MEDIA_BUCKET`                            | Public picture storage, needed for Instagram only (see below)                                                     |
| `PUBLISH_WORKER`, `PUBLISH_POLL_SECONDS`                                                      | The background publisher. Set `PUBLISH_WORKER=off` on extra copies of the server                                  |
| `LINKEDIN_API_VERSION`                                                                        | LinkedIn retires API versions after about a year. Update it when LinkedIn says so                                 |
| `AI_*_LIMIT`, `AI_RATE_PER_MINUTE`                                                            | Platform caps per organization. Organizations can lower them, never raise them                                    |

### Web settings (`apps/web/.env.local`)

| Setting                         | What it is                                               |
| ------------------------------- | -------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | Your Supabase project address                            |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | The public (anon) key. Never put a service key here      |
| `NEXT_PUBLIC_API_URL`           | The API address, for example `http://localhost:4000/api` |

## Connecting channels

Open **Channels** in the app (owners and admins). Every login is checked against the network before it is saved,
stored encrypted, and never shown again. Start with the **test channel**: it posts nothing anywhere and lets you try
the whole workflow safely.

| Channel       | What you enter                                       | Notes                                                                                                                                 |
| ------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| **WordPress** | Site address (https), username, application password | Create the application password under Users, then Profile. Use an Editor or Administrator account. Can publish or save as drafts      |
| **Facebook**  | Page ID and a **Page** access token                  | Permissions: `pages_manage_posts`, `pages_read_engagement`. A personal user token is rejected                                         |
| **LinkedIn**  | Access token                                         | Permissions: `openid`, `profile`, `w_member_social`. Tokens last 60 days: reconnect when it expires                                   |
| **Instagram** | Instagram account ID and access token                | Business or Creator account linked to a Facebook Page. Permissions: `instagram_basic`, `instagram_content_publish`, `pages_show_list` |

### Instagram needs public picture storage

Instagram downloads pictures from a public web address, so the server briefly puts each picture online and removes
it right after posting. Until this is set up, the Instagram channel is shown as "soon".

1. In your Supabase project, open Storage and create a **public** bucket named `public-media`.
2. Put `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in the API's `.env`. The service key is a secret: it belongs
   only on the server.
3. Pictures are converted to JPEG and fitted to Instagram's size and shape automatically (white bars, never cropping).

## Checks

```bash
pnpm format:check
pnpm typecheck
pnpm test
pnpm build
```

The API tests cover tenant isolation, permissions, the fact checks, approvals, scheduling, every publisher
(against simulated network replies), and that every user-facing server message has a French and Arabic version.
The web app has no test runner of its own: its translation tables are tested from the API's test suite.

## Project layout

```
apps/api        NestJS API (modular monolith): auth, organizations, brand kit, AI, sources, studio, channels, analytics
apps/web        Next.js app (App Router), Tailwind, English / French / Arabic
packages/database  Prisma schema and migrations
docs            Roadmap, audit and UX architecture
```

## Safety rules the code follows

- **No invented facts:** claims in generated text must match verified facts, and approval is blocked otherwise.
- **Secrets stay on the server:** AI keys, channel logins and the Supabase service key are never sent to the browser.
- **Safe web requests:** imports and publishing only reach public addresses, never follow redirects with a login,
  and use strict size and time limits.
- **No double posting:** an uncertain final publish is never retried automatically.
- **Free AI only:** paid models are refused by the server.
