# Implementation report — 15 November 2026

## A. What was built

The empty workspace is now a complete React/TypeScript/Vite/Tailwind game implementation with a local Git repository, dependency lockfile, Supabase migrations, automated tests, CI, and deployment guides. No remote Git repository, cloud database, or production deployment was created.

- Distinctive cream/violet/coral/mint design, local Fredoka/DM Sans typography, Lucide icons, responsive home, lobby, board, result screen, rules/guess dialogs, and privacy page.
- 24 original local SVG character portraits, 41,084 bytes combined. Deterministic source drawings and preserved third-party notices are included. No image API, image generation, automated answers, or generated questions.
- Anonymous Supabase sessions, nicknames, seven-character room codes, invitation links, native sharing/clipboard, two-player admission, private character choices, readiness, random start, and identical board order.
- Atomic authoritative RPCs for questions, YES/NO answers, 30/15-second deadlines, safe timeout reconciliation, final-guess win/loss, reveals, and mutual rematches in the same room.
- Persistent per-player drafts and private reversible eliminations; counter, remaining faces, history, turn feedback, countdown clock correction, connection status, and reactions in a dedicated animation lane.
- Private receive-only game Broadcast topics, separate social Broadcast/Presence topics, versioned snapshots, coalesced reconciliation, reconnect/background recovery, and explicit handling of unavailable rooms.
- RLS, private secret tables, restricted writes/function grants, room locks, idempotency receipts, bounded action payloads, rate limits, indexes, inactivity expiry, and retention SQL.
- A clearly labeled single-device two-seat preview when Supabase configuration is absent. It demonstrates the full flow while keeping online play explicitly unavailable.

## B. What was tested

| Executed command/check | Actual result |
| --- | --- |
| `npm run assets` | 24 SVGs generated; catalog/order/asset size verified by database suite |
| `npm run notices` | License notices preserved for 15 production packages |
| `npm run typecheck` | Passed; strict TypeScript also runs in every production build |
| `npm run build` | Passed; `dist` includes app, local fonts, all portraits, and notices |
| `npm test` | **29 passed**: 26 database scenarios + 3 client rule/reconciliation scenarios |
| `node .local/run-native-check.mjs` | **26 database scenarios passed again on native PostgreSQL 17.11**, using a real connection pool and the final migration |
| `npm run test:e2e` / direct Playwright CLI | **7 passed** in Chromium |
| Axe checks inside the browser suite | No reported WCAG A/AA violations on home, lobby, question phase, answer phase, guess dialog, and result screen |
| Responsive browser checks | Passed at **360, 390, 768, 1440px**; no horizontal overflow; final mobile board row remains clickable |
| `npm run test:live` | **1 skipped** because no external Supabase project credentials were supplied |
| `npm audit` | **0 reported vulnerabilities** at delivery |

Database scenarios include concurrent admission, room isolation, secret protection, ready races, wrong-role/duplicate/competing commands, question limits, both timeouts, long-disconnection catch-up, restored state, both guess outcomes, rematches, private-topic policies, payload bounds, and expiry/cleanup. The native run verifies separate PostgreSQL connections and locking; PGlite alone serializes requests.

Both database environments bootstrap Auth identity and Realtime SQL contracts. Neither proves managed Supabase JWT/CAPTCHA behavior, Realtime authorization probes, replication, or WebSocket delivery. The supplied live browser test uses actual Supabase services with two independent browser contexts and no mocked transport; it still needs to be run.

The browser suite covers local two-seat gameplay, private per-seat elimination/draft refresh, questions/answers, reactions, incorrect final guessing, reveals, rematches, mobile layout, and accessibility. Screenshots are in ignored `.local/previews/`. Native iOS Safari/Android Chrome keyboards and screen readers still need physical-device checks. GitHub-hosted CI has been provided but not run remotely.

## C. What you need to do next

1. Create/select a GitHub repository, a Supabase project, Vercel project, and Cloudflare Turnstile widget.
2. Apply the migration, enable anonymous Auth and private Realtime, configure CAPTCHA, and schedule retention. See [SETUP.md](SETUP.md).
3. Configure public `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_TURNSTILE_SITE_KEY`, optional canonical `VITE_APP_URL`, and a real `VITE_SUPPORT_EMAIL`. Put CAPTCHA secrets and administrative credentials only in provider settings; never chat/Git/browser environment variables.
4. Choose the final game name/domain, review art/license notices and privacy/support wording, set billing/usage alerts, and choose/test recovery.
5. Run the live two-browser test and manual different-device/network, CAPTCHA, timeout, third-player, mobile, and reconnect checks.
6. Review a preview deployment and approve production publication.

To explore immediately in this workspace, run `npm run dev` and open http://localhost:5173. Create a local preview game, pick/ready, then use **Switch seat** to play the second side. Existing dependencies are installed.

## D. How to publish

[DEPLOYMENT.md](DEPLOYMENT.md) contains the owner checklist and complete GitHub/Supabase/Vercel instructions. The database path is `npx supabase login`, `npx supabase link --project-ref YOUR_PROJECT_REF`, then `npx supabase db push`. The Vercel CLI path is `npx vercel login`, `npx vercel link`, and `npx vercel` for a preview; use `npx vercel --prod` only after production approval. No deployment success or live HTTPS has been claimed.

## E. If the game becomes popular

The target is 1,000 concurrent players / 500 rooms. It has **not** been load-tested at that scale. There is no per-room server: Vercel serves static files; managed PostgreSQL and Realtime carry authoritative actions and private room notifications. One connection/two channels per player, indexed room locks, small notifications, and deadline-driven reconciliation keep traffic bounded by room activity.

The currently documented Supabase limits are 200 connections on Free and 500 on capped Pro; 1,000 players need increased capacity plus headroom. [SCALING.md](SCALING.md) links official limits, explains Auth/message/authorization-pool quotas, and provides a controlled load script, monitoring targets, retention, budget considerations, and managed-service upgrade path. Measure before promising capacity.

## F. App Store and Play Store

[APP_STORES.md](APP_STORES.md) explains adding Capacitor with `dist` as web assets, native platform adapters, signing/accounts, iOS/Android project setup, universal/App Links, icons/splash screens, physical-device QA, and current-policy review. No native projects were created. Store signing, privacy disclosures, testing and review remain release work; packaging does not guarantee approval.

## G. Known limitations and verification gaps

- Hosted Supabase Auth, CAPTCHA, realtime delivery, production HTTPS, provider settings/alerts, backup recovery, scheduled cleanup, and the live two-browser test remain externally unverified.
- No 1,000-player load result is claimed. Provider plan/quotas, region, load generator capacity, and billing must be measured/configured.
- Browser QA ran in Chromium. Physical mobile keyboard/safe-area behavior, Safari, TalkBack/VoiceOver, text scaling, and native wrappers need manual QA.
- Anonymous identity is tied to preserved browser/app storage. Clearing it loses that identity and cannot impersonate an existing full-room member. Room membership lasts until expiry; there is no replacement-player flow.
- Local preview stores both seats/secrets on one device and offers no cross-device play or security boundary. It is labeled accordingly throughout.
- Final naming/domain, operator contact/privacy review, licensing approval, production approval, and a repository-wide source license remain owner decisions.
- Automatic approval review rejected cleanup of temporary PostgreSQL test files with **“blocked by policy.”** The native database is stopped. Its task-created files remain in ignored `.local/`; they are excluded from the app build and Git.
