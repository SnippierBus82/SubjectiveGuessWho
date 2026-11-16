# Verification

## Fast checks, no infrastructure credentials

```sh
npm ci
npm test
npm run build
npx playwright install chromium
npm run test:e2e
npm audit
```

`npm test` runs the **actual production migration** in PGlite's WebAssembly PostgreSQL. A small test-only bootstrap supplies Supabase-like `auth.uid()`, `auth.users`, database roles, and `realtime.send/topic` contracts. Each call sets the caller identity and executes under the `authenticated`/`anon` role. Tests exercise real PL/pgSQL, grants, constraints, and RLS; they do not replace the game RPCs with a JavaScript model.

Covered: ordered 24-person catalog/assets, room creation, idempotent create retries, joins, concurrent join requests, third-player rejection, isolated reads/actions, unauthenticated/direct-write denial, secret selection/protection, readiness, random initial player, alternating turns, question validation/immutability, duplicate and unauthorized actions, both authoritative deadlines, unanswered values, long-disconnection catch-up, refreshed state, both guess outcomes, rematch reset, private-topic authorization, and room retention.

PGlite has a single serialized database connection. Concurrent requests test deterministic admission/invariants but **do not prove real transaction lock contention**. The Auth bootstrap does not verify JWT issuance, CAPTCHA, Supabase's private-channel probes, WebSocket delivery, replication, or production quotas.

The Playwright preview suite uses Chromium, checks 360/390/768/1440px without horizontal overflow, clicks the last mobile board row, and exercises both local seats, private per-seat eliminations, draft/refresh restoration, questions/answers, reactions, final guesses, and rematches. Axe checks the home, lobby, game, and guess dialog for WCAG A/AA rules. Screenshots are saved in ignored `.local/previews`. These tests are explicitly local preview tests, not evidence of online multiplayer. Automated accessibility does not replace screen-reader, physical-device, or manual keyboard testing.

## True parallel PostgreSQL connections

Use a **new empty disposable PostgreSQL 17 database**, owned by a test superuser permitted to create roles/schemas. The harness refuses databases containing `public.rooms` or `auth.users` before mutating them. Never point it at production or an initialized Supabase project.

```powershell
$env:TEST_DATABASE_URL = 'postgres://TEST_USER:TEST_PASSWORD@localhost:5432/EMPTY_TEST_DATABASE'
$env:TEST_ALLOW_EMPTY_DATABASE = 'yes'
npm run test:postgres
```

This runs the same RPC/RLS suite via `pg.Pool` with up to 12 real concurrent connections, including competing joins and duplicate requests. The GitHub Actions `postgres` job automatically provides a fresh PostgreSQL 17 service. The test database retains its schema after the run; use a fresh empty database for each new run.

## Actual online multiplayer, two independent browsers

Create an isolated Supabase test project, apply the migration, enable anonymous sign-ins, and disable CAPTCHA **only on that test project**. This automation does not bypass production CAPTCHA. Two new anonymous identities count toward signup limits.

```powershell
$env:E2E_SUPABASE_URL = 'https://YOUR_TEST_PROJECT.supabase.co'
$env:E2E_SUPABASE_PUBLISHABLE_KEY = 'YOUR_PUBLIC_TEST_KEY'
npm run test:live
```

This starts Vite on port 5174 and creates two independent browser contexts. They create/join, choose secrets, ready, ask/answer through actual private Broadcast notifications, preserve a draft and private eliminations across refresh, exchange a reaction, resolve a correct guess, reveal both secrets, and rematch. There are no mocked network routes or local game adapters. Without those environment variables, it reports **skipped**, not passed.

Also run the manual different-device/network, timeout, third-player, CAPTCHA, and mobile-keyboard checklist in [SETUP.md](SETUP.md). Follow [SCALING.md](SCALING.md) for controlled load testing. A single successful browser test does not prove 1,000-player capacity.

## Release evidence

Record actual commands/results and limitations in `IMPLEMENTATION_REPORT.md` when delivering or releasing. Check both frontend CI and the PostgreSQL job before merging. GitHub CI, live hosted tests, billing/alerts, cleanup schedules, HTTPS, backup restore, iOS/Android browser behavior, and capacity must be verified in the owner-provisioned environment before public launch.
