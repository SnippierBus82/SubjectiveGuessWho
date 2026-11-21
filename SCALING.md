# Capacity and operations

## Design target

The design target is **1,000 concurrent players / 500 rooms**, not a measured production guarantee. This implementation has not been tested at that concurrency. The frontend is static on Vercel; PostgreSQL and Realtime are managed by Supabase. A stateless Vercel function registers folder packs and prepares game images; gameplay remains authoritative in PostgreSQL, with no per-room process or Redis.

Every player has one Realtime connection with two private channels: a receive-only game topic and a social Broadcast/Presence topic. Gameplay writes lock one indexed room row and execute atomically. Notifications contain only `{version}`; clients fetch a caller-specific snapshot and ignore older versions. Concurrent invalidations coalesce with a follow-up fetch if another notification arrives during a request.

Timers cause no per-second writes. Clients render the countdown, reconcile once at a deadline, on reconnect/focus/visibility, and at a low-frequency 60-second safety interval. A 2.5-second retry is active only while a displayed deadline remains expired. The database uses its own clock and catches up missed empty turns arithmetically. Backgrounded clients need no scheduler.

Room/member/game/history lookups have primary/foreign-key indexes; catalog and SVGs are static. Questions and secrets remain in PostgreSQL. Emoji events are not inserted into application tables. Incoming emoji overlays are deduplicated/capped; sending is throttled to one per 1.2 seconds. Client throttling is UX protection, not an unbypassable per-user server quota: private membership, Realtime provider rate/size limits, and project monitoring are the network abuse boundary. Game notifications are client receive-only.

## Provider limits

Checked against the [Supabase Realtime limits](https://supabase.com/docs/guides/realtime/limits) on 15 November 2026; recheck the dashboard before purchase/launch:

| Limit                    | Free | Pro with spend cap | Pro without spend cap / Team |
| ------------------------ | ---- | ------------------ | ---------------------------- |
| Concurrent connections   | 200  | 500                | 10,000                       |
| Messages per second      | 100  | 500                | 2,500                        |
| Channel joins per second | 100  | 500                | 2,500                        |

A 1,000-player target exceeds both Free and default capped-Pro connection limits. Arrange at least 1,000 connections plus reconnect/headroom, adequate message throughput, and a controlled budget. Extra tabs can add connections. Two private channels per player mean a reconnect surge produces about twice as many channel joins as players. Authorization also uses a database connection pool; review its size, token-refresh bursts, and latency under load. [Realtime settings](https://supabase.com/docs/guides/realtime/settings).

Anonymous signup is independently rate-limited (documented default 30/IP/hour); use CAPTCHA in production and check cohorts behind shared NAT. Auth monthly-active-user allowances, Realtime message usage/overages, database compute, storage/egress, and Vercel bandwidth/build limits are distinct. Upgrade and tune the affected managed service rather than promising a free plan can serve the target.

## Reproducible load method

Use a **separate migrated Supabase test project**, with private Broadcast and anonymous Auth enabled. Get permission for the load, set alerts, and never disable production CAPTCHA to run it.

Small smoke test, using at most 20 new anonymous users to stay within ordinary signup limits (PowerShell):

```powershell
$env:LOAD_SUPABASE_URL = 'https://YOUR_TEST_PROJECT.supabase.co'
$env:LOAD_SUPABASE_PUBLISHABLE_KEY = 'YOUR_PUBLIC_TEST_KEY'
$env:LOAD_CONFIRM = 'isolated-test-project'
$env:LOAD_CREATE_SESSIONS = 'yes'
$env:LOAD_PAIRS = '2'
$env:LOAD_SECONDS = '30'
npm run load
```

The script creates/join pairs, subscribes to both actual private topics per player, selects/readies, alternates questions/answers, and fetches reconnection snapshots. It reports RPC p50/p95/p99, errors, completed pairs, and received version notifications without logging user/session content.

For a 1,000-player soak, pre-provision **1,000 isolated test Auth sessions** using the test project's controlled signup configuration and save an array of `{access_token, refresh_token}` objects in an ignored local file, e.g. `.local/load.sessions.json`. These are secret bearer credentials; do not upload the file or commit it. The script does not need an admin key. Remove `LOAD_CREATE_SESSIONS`; set:

```powershell
$env:LOAD_SESSIONS_FILE = '.local/load.sessions.json'
$env:LOAD_PAIRS = '500'
$env:LOAD_SECONDS = '600'
$env:LOAD_RAMP_MS = '150'
npm run load
```

Ramp through 10, 50, 100, 250, then 500 rooms. Watch database CPU/locks/connections, slow queries, Auth failures, private-channel authorization, Realtime message/drop/disconnect rates, egress, and billed usage. Compare all runs with actual provider quotas. Test reconnect bursts separately with the live browser suite and controlled network interruption. The load script's final snapshot is not a full transport-disconnection simulation.

Suggested acceptance targets to validate, not claims of measured behavior: no forbidden joins or secret leaks, no conflicting winners, <1% transient request failures, p95 actions <500ms in-region, and UI recovery within a few seconds of a normal reconnect. A successful zero-error run must also have received notifications; unexpectedly low Broadcast counts require investigation.

## Retention and upgrade path

- Run `supabase/maintenance.sql`'s hourly cleanup. It deletes rooms inactive for 24 hours, cascades game data/secrets/receipts, prunes old rate buckets and old rounds/receipts in active rooms. Keep at most 20 previous rounds per active room.
- Choose and enable a separate anonymous-user retention job. Supabase does not automatically remove old anonymous users. The supplied optional job preserves users in retained rooms.
- At first, increase Realtime connection/message capacity and database compute as measurements require; keep Vercel serving cached immutable assets. Enable monitoring and recovery before traffic spikes.
- If snapshots become large, cap/display or page long history and reduce reconciliation to missing versions. If region latency dominates, choose a region close to users before adding architecture.
- Track receipt/rate-limit table growth and cleanup success. Review slow-query plans, authorization pool settings, timeout conflicts, and storage weekly after launch.

The managed-service architecture supports growth without a backend rewrite, within measured PostgreSQL/Realtime limits. A different architecture should follow demonstrated bottlenecks.

## Board preparation in load tests

Set `LOAD_APP_URL` to the isolated app deployment (whose server key points to the same isolated Supabase project), in addition to the existing test-project variables. The script registers the selected pack, waits for shared preparation, and selects actual returned character IDs. Use `LOAD_BOARD_ID=folder/Your%20board` with a deployed folder pack when measuring gameplay capacity so the test does not generate a burst of public Hugging Face requests. The default `ai-random` includes source acquisition and Storage costs; measure that separately at low concurrency.

The board backend is stateless and uses database preparation leases, rate limits and immutable Storage images. Timeouts fall back only on upstream source failure. Record preparation latency/source outcomes separately from gameplay RPC latency. Existing capacity figures above are design targets, not measurements of this added backend.
