# Outbox Scheduler Workspace

- Keep the API in TypeScript with Express, Prisma/PostgreSQL, BullMQ/Redis, and no cron-based scheduling.
- Treat PostgreSQL as the authoritative email state; give every scheduled message a stable ID and preserve idempotency.
- Rate-limit sends with atomic Redis operations shared across workers. Keep the environment-wide sender cap in force even when a campaign requests a lower cap.
- Index searchable email metadata through the retryable BullMQ search queue; protect tenant boundaries in every search query.
- Keep OAuth, SMTP, session, and database credentials in environment variables. Never commit `.env` or tokens.
- Preserve the web app's compact Outbox visual system and typed API contracts.
- Validate changes with `npm run build` and `npm test` from the workspace root.