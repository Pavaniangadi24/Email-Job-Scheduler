# Outbox | ReachInbox Email Job Scheduler

A Docker-first email scheduling workspace with a TypeScript/Express API, PostgreSQL as the source of truth, BullMQ backed by persistent Redis, an Elasticsearch search index, real Google and Slack OAuth integrations, Ethereal SMTP, and a React dashboard.

## Start locally with Docker

Prerequisites: Docker Desktop with Compose v2, Node.js 22 or newer, npm, and Google/Slack OAuth app credentials for interactive sign-in and Slack notifications.

1. Copy `.env.example` to `.env` and replace `SESSION_SECRET` with a long random secret. The checked-out workspace has an ignored development `.env`; never commit it or use its development secret in a shared environment.
2. Create the SMTP test account with `npm run ethereal:setup`, then add the printed `ETHEREAL_USER` and `ETHEREAL_PASS` to `.env`.
3. Create Google OAuth web credentials. Add `http://localhost:4000/api/auth/google/callback` as an authorized redirect URI and set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.
4. Create a Slack app with OAuth v2, `chat:write` and `incoming-webhook` bot scopes, and redirect URI `http://localhost:4000/api/integrations/slack/callback`. Set `SLACK_CLIENT_ID` and `SLACK_CLIENT_SECRET`.
5. Start the full stack:

   ```sh
   docker compose up --build
   ```

  Docker starts PostgreSQL, AOF-persisted Redis, Elasticsearch, a one-shot Prisma migration service, the pruned API/worker runtime, and the web UI. The API waits for a successful migration before starting. Open `http://localhost:5173`; API health is at `http://localhost:4000/health`. The authenticated Bull Board is at `http://localhost:4000/admin/queues`.

  PostgreSQL is published on host port `5433` to avoid colliding with an existing local PostgreSQL listener; inside Compose it remains `postgres:5432`.

Stop with `Ctrl+C`; volumes preserve Postgres and Redis state. `docker compose down` preserves them. `docker compose down -v` permanently deletes the local database, queue, and search data.

## Run services without containerized app builds

Docker can still run the stateful dependencies: `docker compose up -d postgres redis elasticsearch`. Install workspace packages with `npm install`, generate the client with `npm run db:generate`, migrate with `npm run db:migrate`, and start API plus web with `npm run dev`. This mode reads local connection URLs from `.env`.

To use an isolated Ethereal account at any time, run `npm run ethereal:setup` and put the printed credentials in `.env`. Ethereal captures test mail; it does not deliver to real recipient inboxes. Preview messages at [Ethereal Messages](https://ethereal.email/messages).

## Configuration

See `.env.example` for all settings. The important controls are:

- `WORKER_CONCURRENCY` controls concurrent BullMQ deliveries per API instance (default `10`).
- `MIN_SEND_DELAY_MS` sets a platform-wide minimum start-to-start gap per sender (default `2000`, so at most 30 sends/minute from spacing alone).
- `MAX_EMAILS_PER_HOUR_PER_SENDER` is the hard global cap shared by workers. A campaign may request a stricter `hourlyLimit`; it cannot raise the global cap.
- The compose modal's `delayMs` schedules recipients at that interval and also requests the same per-campaign send spacing. Actual send spacing is `max(MIN_SEND_DELAY_MS, campaign delay)`.
- `COOKIE_SECURE=true` should be set behind HTTPS in production. Use a stable, random `SESSION_SECRET`; it also derives the AES-256-GCM key used to encrypt Slack tokens and incoming-webhook URLs at rest. Rotating it requires reconnecting Slack.

## Architecture and reliability

1. `POST /api/emails` validates the sender, message, future start time, up to 10,000 recipients, delay, and optional per-campaign hourly cap. An optional `Idempotency-Key` makes retries safe for that user's request. Recipient addresses are normalized and deduplicated.
2. A PostgreSQL transaction uses bulk insertion with a unique `(userId, idempotencyKey)` constraint. BullMQ delayed jobs use the email UUID as their stable job ID and are written in batches. PostgreSQL is authoritative if Redis enqueue is interrupted.
3. On every API start, scheduled rows are reconciled into BullMQ. The Redis AOF volume preserves normal queue state; stable job IDs make reconciliation idempotent if jobs still exist. Redis loss does not erase the scheduled DB rows, and startup reconstructs their delayed jobs.
4. Workers use configurable concurrency. A Lua script atomically reserves sender slots in Redis, applying the global sender cap, campaign cap, and minimum spacing across concurrent workers and API instances. Over-limit messages are moved back to BullMQ's delayed set for the next available rolling-hour slot; they are not discarded. Slack sends one real alert per sender/window through the connected workspace. No connected Slack installation means no alert and no delivery failure.
5. Elasticsearch indexing is a separate BullMQ queue with exponential retries. Search results are always filtered by the authenticated user's exact keyword ID. Startup re-indexes DB records to repair missing/stale index entries.
6. Google OAuth authenticates users; sessions live in PostgreSQL. Slack OAuth is per-user, state-checked, encrypted at rest, revocable, and can be reconnected without a deployment. Bull Board is also behind authentication.
7. The production API image keeps only runtime dependencies and generated Prisma Client. Prisma CLI runs in the separate one-shot migration image. npm's workspace audit still reports a high advisory in that dev/build-only Prisma 6 CLI's `deepmerge-ts` dependency; it is not included in the API runtime filesystem.

### Delivery semantics and load behavior

One thousand messages due together are persisted in one batch, enqueued in chunks of 500, then paced by delayed schedules and shared Redis sender reservations. Workers can run concurrently without violating sender-level limits. When a rolling hour fills, subsequent jobs wait for the oldest eligible slot to expire; a real Slack notification is attempted once per sender in that wall-clock hour.

SMTP has no general idempotency key, so true exactly-once delivery across the SMTP-accepted / database-commit crash window is impossible. This implementation chooses at-most-once retry behavior to avoid duplicate mail: it claims a row before SMTP; a worker never sends an already `PROCESSING` row again; on startup, a claim older than two minutes becomes `FAILED` with an explicit “outcome uncertain” message instead of being resent. A rare crash can therefore leave a message marked failed even if Ethereal accepted it. Future scheduled rows are recovered and continue at their original scheduled time.

The rate-limit window is rolling 60 minutes and the Slack de-duplication key is per sender and UTC wall-clock hour. BullMQ/Redis persistence assumes durable local volumes and AOF; production should use a managed Redis configured with persistence and backups plus PostgreSQL backups. Elasticsearch can always be rebuilt from PostgreSQL.

## API overview

- `GET /api/auth/google` and `/api/auth/google/callback`: Google OAuth.
- `GET /api/auth/me`, `POST /api/auth/logout`: session identity and logout.
- `POST /api/emails`: create an idempotent scheduled batch.
- `GET /api/emails?status=scheduled|sent`: user's scheduled or sent/failed rows.
- `GET /api/emails/search?q=...`: Elasticsearch search scoped to the current user.
- `GET /api/integrations/slack/connect`, `GET /api/integrations/slack/callback`, `DELETE /api/integrations/slack`: connect, OAuth callback, or revoke/disconnect Slack.
- `GET /admin/queues`: authenticated Bull Board queue visibility.
- `GET /health`: basic process health.

Example request:

```sh
curl -X POST http://localhost:4000/api/emails \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: demo-batch-01' \
  -b cookies.txt -c cookies.txt \
  -d '{"sender":"sender@example.com","subject":"A quick hello","body":"Hello from Outbox","recipients":["lead@example.com"],"startAt":"2026-10-01T12:00:00.000Z","delayMs":2000,"hourlyLimit":50}'
```

The example requires an authenticated session cookie; interactive use should go through the dashboard.

## Tests and builds

```sh
npm test
npm run build
npm run db:generate
npm run db:migrate
```

The unit suite covers recipient extraction/deduplication and campaign timing. The full runtime needs Docker services and valid external Google, Slack, and Ethereal credentials for an end-to-end OAuth/send demonstration.

Set `RUN_REDIS_INTEGRATION=1` when running the API tests to include the Redis-backed atomic hourly-limit integration tests; they run against the Compose Redis service.

## Included features and handoff notes

- Backend: relational persistence, delayed BullMQ scheduling, startup recovery, email idempotency, concurrent workers, global and per-campaign rate limits, Redis-backed pacing, Slack OAuth/alerts, Ethereal SMTP, Elasticsearch search/index recovery, authenticated Bull Board.
- Frontend: real Google sign-in, user identity/logout, scheduled and sent/failed views, CSV/TXT import and address count, compose controls, status refresh, search, CSV export, Slack connect/disconnect, responsive empty/loading/error states.
- Trade-offs: SMTP is at-most-once on ambiguous worker interruption; SMTP delivery is simulated by Ethereal; per-campaign limit is an additional cap and global environment limit is authoritative; search may briefly lag DB state while its retryable index job runs.

## GitHub publishing

Use small, named commits for coherent milestones (infrastructure, backend, dashboard/docs), then push the verified history. That gives reviewers useful checkpoints without publishing broken intermediate commits. The configured destination requested for this assignment is `https://github.com/Pavaniangadi24/Email-Job-Scheduler.git`; keep the repository private and grant access to `Mitrajit` and `Yadav036` in GitHub repository settings. Never stage `.env`.

For the demo, show sign-in, a CSV schedule, the scheduled and sent views, the authenticated queue board, the Ethereal preview, a short-delay/hourly-cap test with Slack connected, and a restart with a future job still pending and later delivered.
For the Pavani-owned, free-tier Oracle deployment procedure (including HTTPS, OAuth callbacks, and cost limits), follow [DEPLOY-FREE-ORACLE.md](DEPLOY-FREE-ORACLE.md).