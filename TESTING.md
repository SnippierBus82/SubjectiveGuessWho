# Verification

## Local checks

```sh
npm ci
npm test
node scripts/face-pool.mjs --check
npm run build
npx playwright install chromium webkit
npm run test:e2e
```

`npm test` applies every committed migration in filename order to PGlite PostgreSQL. The test bootstrap supplies Supabase-like Auth roles, `auth.uid()`, and private Broadcast contracts. It executes the actual SQL RPCs, constraints, grants, and RLS rather than a JavaScript substitute.

The legacy suite preserves the original room/rule checks. The v2 suite covers generated casts, SQL/browser generator agreement, private submissions, overlapping readiness, the four agreed timing examples, mixed unlimited timers, missed deadlines, disconnect recovery, unscored endings, fresh rematches, compact heartbeats, reaction attribution/rate limits, matchmaking FIFO/leases/cancellation/no-shows, and legacy upgrade compatibility. The artwork checks cover all 110 shape variants and diversity across 100 board seeds; the suggestion library has 200 unique questions within the 50-code-point limit.

PGlite serializes requests. Its concurrency tests check admission invariants but do not prove PostgreSQL row/advisory-lock contention. Run the real PostgreSQL checks below too.

`tests/boards.test.ts` adds 14 cases covering all board choices, SQL/browser shuffle agreement, durable shared snapshots, secret selection/final guesses, fixed/shuffled rematches, invalid IDs and permissions, creation retry binding, disabled-source durability, asset/provenance hashes, concurrent same-board pairing, preference changes and FIFO within a board. All 144 images are bundled and checked offline; no Hugging Face request is made by the deterministic automated suites. Online gameplay now fetches faces during preparation.

## Browser and artwork checks

The Playwright suite runs in Chromium and WebKit. It uses a dedicated local Vite server on port **5183**, with public Supabase values cleared, so it does not reuse a running development server or silently connect to your hosted database. Online transport/picker/search checks use mocked service responses and are labelled separately from live tests.

`tests/e2e/app.spec.ts` covers Play/Boards/Profile navigation, persistent avatar/name preferences, browser Back and reload protection during games, explicit leave confirmation, and account flows through the real Supabase browser SDK with mocked HTTP responses. Account scenarios include email verification and expired codes, incorrect passwords, two separate browser contexts syncing a profile, logout cleanup, password recovery, current-password checks for account changes, and guest identity preservation. CAPTCHA tests also check account creation gating. These checks do not verify managed Auth settings, SMTP delivery, real email links or provider-enforced rate limits; verify those against an isolated hosted project using the account setup guide before deployment.

Covered: full two-seat preview, concurrent writing/review, hidden submitted questions, saved drafts/eliminations, correct final guesses, rematches with fresh casts, both CAPTCHA widgets, custom HTTP development hosts, search/cancel/refresh handoff, suggestion rotation and shuffling, emoji/mute preferences, timeout/resume, and keyboard resizing. Layout checks at 360×640, 390×844, 768×1024, 1440×1000, and 844×390 verify that the last board row is reachable and controls do not cover the board. Axe checks the game, answer controls, and emoji dialog.

Screenshots and all-part contact sheets are written to ignored `.local/previews/`. Inspect `character-parts.png`, the three `character-cast-*.png` files, `v2-390.png`, and `v2-answer.png`. Automated geometry checks and screenshots do not replace human visual review, a real software keyboard, VoiceOver/TalkBack, or physical-device Safari/Chrome testing.

`tests/e2e/boards.spec.ts` plays online/cache outcomes for the AI option and discovers a newly added filename-only folder at 390×844 in Chromium and WebKit: selection persistence, all 24 image loads, secret portrait answering, refresh, final guess, fixed/shuffled rematches, axe checks, and no Hugging Face image requests. Screenshots are named `*-million-faces*-mobile.png`. The mocked online search tests also verify the chosen board is sent on join/pulse/cancel and restored after refresh.

## Real concurrent PostgreSQL

Use a disposable PostgreSQL 17 cluster and an **empty** database, with a user permitted to create roles and databases. Never point these checks at production or an initialized Supabase project.

```powershell
$env:TEST_DATABASE_URL = 'postgres://TEST_USER:TEST_PASSWORD@localhost:5432/EMPTY_TEST_DATABASE'
$env:TEST_ALLOW_EMPTY_DATABASE = 'yes'
npm run test:postgres
```

The harness rejects an initialized target. The runner creates one uniquely named disposable database per suite, closes its connections, and removes only those databases after execution. Tests use a real `pg.Pool`, including racing joins, matching admissions, private creation versus search, duplicate requests, and cancellation versus assignment. CI provisions its own PostgreSQL 17 service and runs all four database suites.

## Actual Supabase integration

Provision an isolated Supabase test project, apply **all** migrations, enable anonymous sign-ins, and disable CAPTCHA **only on that test project**. The automation creates anonymous users and game data there.

```powershell
$env:E2E_SUPABASE_URL = 'https://YOUR_TEST_PROJECT.supabase.co'
$env:E2E_SUPABASE_PUBLISHABLE_KEY = 'YOUR_PUBLIC_TEST_KEY'
npm run test:live
```

The live suite uses two independent browser contexts, actual Auth/RPC/private Broadcast, the overlapping review gate, private portrait reminders, refresh recovery, reactions, final guesses, and rematches. A separate live case exercises automatic pairing and leaving. The dedicated server runs on port 5174; CAPTCHA keys and `VITE_APP_URL` are overridden for that test environment. Without the explicit test-project variables, tests report **skipped**, not passed.

Use the manual [SETUP.md](SETUP.md) checklist on real devices with production hCaptcha enabled before a public release. Record actual results and limits in [V2_IMPLEMENTATION_REPORT.md](V2_IMPLEMENTATION_REPORT.md). Controlled managed-service load testing remains in [SCALING.md](SCALING.md); local correctness tests are not a hosted-capacity measurement.

## Folder boards and board backend

`tests/folder-boards.test.ts` covers filename/Unicode discovery, missing/duplicate images and names, sampling, source deadlines, online-first success without reading fallback, cache-only-on-outage behavior, WebP conversion, storage errors, HTTP authorization, preparation leases, finalization, replay, rematches and matching deadlines. The PostgreSQL cases also run under `npm run test:postgres`.

Browser fixtures replace only `/api/boards` source preparation with explicit online/cache results served from local images. They do not claim to validate Hugging Face or managed Storage. A separate browser case adds a real 25-image folder while Vite is running and verifies discovery, filename labels and selection of 24 unique images without metadata files. Source/provider and SQL behavior are tested separately.

Actual isolated Supabase tests now also need `E2E_SUPABASE_SECRET_KEY` from that **test project**; it is passed only to the local backend, never the browser. Without all three explicit test credentials, the live suite is skipped. Never substitute production credentials. Verify an actual Vercel deployment separately, including a successful live source fetch and the saved-image URLs. Source availability in this execution environment does not prove availability from Vercel.

### Recorded verification — 17 November 2026

- Automated suite: **98 passed**. The final shared-preparation cases also passed on native **PostgreSQL 17.11**, including concurrent claims, expired-room authorization and selection timing after preparation.
- Browser suite: **42 passed** across Chromium and WebKit, plus both filename-only folder checks repeated after making their temporary directories collision-safe.
- Production build passed both with a temporary 24-image custom folder and again without that fixture. The Node API entry bundled successfully. A dummy server-only key was absent from browser JavaScript.
- Cached-image checksums and the external 72-portrait prompt kit validate. The new sharing banner was visually inspected.
- A live OneMillionFaces acquisition attempt timed out here at roughly **12 seconds** and correctly returned a cached board with **24 unique names**. Successful upstream retrieval is covered with controlled provider responses; it still needs a live Vercel smoke test. No hosted Supabase/Auth/Storage test or deployment was performed.
