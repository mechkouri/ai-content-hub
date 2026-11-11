# Development Roadmap

## Working method: backend first, then frontend, feature by feature

For each feature, in this order:

1. **Backend**: database schema, NestJS module, API endpoints, validation, tests (organization isolation included).
2. **Frontend**: UI for that feature on top of the finished, tested API.
3. Review and merge, then start the next feature.

No Docker until the product is finished. Dev DB: hosted Supabase Postgres. Run with `pnpm dev`.

## Feature order (MVP slice first)

| #   | Feature                                                            | Backend | Frontend                           |
| --- | ------------------------------------------------------------------ | ------- | ---------------------------------- |
| 1   | Monorepo foundation (pnpm, Turborepo, NestJS, Next.js, Prisma, CI) | yes     | minimal shell                      |
| 2   | Auth, organizations, memberships, roles                            | yes     | login, org selector                |
| 3   | Brand kit and media library                                        | yes     | brand pages                        |
| 4   | AI provider layer (OpenRouter text, Cloudflare images)             | yes     | AI admin page                      |
| 5   | Content input and fact extraction (text, PDF, DOCX, URL)           | yes     | source submission and fact editing |
| 6   | AI content studio (SEO article, social posts, FR/AR/EN)            | yes     | studio UI                          |
| 7   | Campaigns and approvals                                            | yes     | campaign board                     |
| 8   | Design Studio (editable carousel)                                  | yes     | Konva/Fabric editor                |
| 9   | WordPress integration (drafts)                                     | yes     | integration settings               |
| 10  | Calendar and scheduling                                            | yes     | calendar                           |
| 11  | Social integrations (Facebook, Instagram, LinkedIn)                | yes     | connect and publish                |
| 12  | n8n automation, SEO intelligence                                   | yes     | later                              |
| 13  | Hardening, billing, release, then Docker                           | yes     | yes                                |

The full dashboard design (Stitch) is produced in parallel and applied when each feature reaches its frontend step.
