# Subjective Guess Who

**24 faces. One secret person. The vibes are the evidence.**

A mobile-first two-player party game built with React, strict TypeScript, Vite, Tailwind CSS, Lucide, and Supabase. Play, Boards, and Profile have separate app screens, with bottom navigation on phones and a sidebar on desktop. Choose a folder-based board or Random AI faces from OneMillionFaces. Play as a guest, or create an email/password account to sync your player name, avatar and board choice across devices. No AI answers or tracking.

## Run it

Use **Node.js 22.12+ (22 LTS or 24 LTS)** and npm.

```sh
npm ci
npm run dev
```

Open http://localhost:5173. Without environment configuration, this is a **clearly labeled single-device preview**. Enter a nickname, create a game, choose a person, and ready up. Use **Switch seat** to choose and play for the second player. Nobody answers automatically. Preview saves both seats and secrets in this browser; it provides no online multiplayer or security boundary.

Start at **Play → Create game** or **Join game**. **Boards** holds your available boards; **Profile** edits your player and handles account creation, login, recovery and account settings. During a game, app navigation is locked until you choose **Menu → Leave game → Yes, leave game**. Browser Back opens the game menu and refresh restores the room. Account setup is described in [SETUP.md](SETUP.md#email-and-password-accounts).

For two devices, follow [SETUP.md](SETUP.md) to connect Supabase. The frontend automatically switches to online mode when both public Supabase environment values are present. Incomplete configuration produces a visible error.

See [BOARDS.md](BOARDS.md) for the simple folder workflow and the one-time server key needed for online preparation.

## Implemented

- Nicknames, 7-character room codes, invitation links, clipboard/native sharing, and exactly two room members.
- Add custom boards by placing 24+ images in a subfolder of `public/boards/`. Filenames supply names; larger folders sample 24 unique images for each game. No names file or per-board SQL.
- One built-in Random AI faces option: OneMillionFaces online first, a 12-second acquisition budget, cached portraits only on source failure, and unique names from one gender-neutral list. Shared preparation, immutable stored images, retries and board-aware matching. All boards are free.
- Overlapping question writing and board review: 120/30/60-second defaults, private room timer settings, unlimited activities, and a pause/rejoin flow for missed timers. Two questions make a round.
- Automatic FIFO pairing through **Find a player**, with expiring waiting leases, cancellation, reconnect recovery, and no-show requeueing.
- 200 rotating question ideas, category/shuffle controls, and a private portrait reminder while answering.
- Free text up to 50 Unicode characters, persistent drafts, private reversible eliminations, remaining count, and question history.
- Private realtime state notifications, canonical snapshots, lightweight heartbeats, version checks, clock correction, and server-authenticated ephemeral reactions with an emoji picker and opponent mute control.
- Server-validated final guesses, both-character reveals, winner display, and a mutual rematch in the same room.
- Reconnect/refresh recovery, RLS, locked room transactions, idempotency receipts, input validation, rate limits, and retention SQL.
- An app layout with a separately scrolling board and controls that never cover it; keyboard resizing, safe areas, reduced motion, and installable web app icons/manifest.
- Basic privacy page at `/?page=privacy`, provider configuration guides, CI, database tests, browser tests, and a managed-service load script.

## Checks

```sh
npm test                  # Real PostgreSQL via embedded PGlite: RPCs, RLS, timing, rules
npm run build             # Strict TypeScript + production bundle
npx playwright install chromium webkit
npm run test:e2e           # Local preview, refresh, 360/390/768/1440px, axe accessibility
npm run test:postgres      # Optional empty PostgreSQL DB, truly concurrent connections
npm run test:live          # Optional two browsers against an isolated Supabase project
```

[TESTING.md](TESTING.md) describes the evidence and each test environment's limits. PGlite serializes connections; it cannot prove PostgreSQL lock contention or validate the managed Realtime/Auth services. The live test has independent browser contexts and uses the actual online service, with no fake transport.

## Source map

| Location                   | Purpose                                                        |
| -------------------------- | -------------------------------------------------------------- |
| `src/components/`          | Home, lobby, board, controls, history, dialogs, results        |
| `src/game/`                | Platform-independent types, small rules, character catalog     |
| `src/services/supabase.ts` | Anonymous Auth, RPCs, private Broadcast/Presence               |
| `src/services/preview.ts`  | Explicitly local two-seat preview, lazy loaded                 |
| `src/hooks/useGame.ts`     | Reconciliation, subscriptions, actions, clock offset           |
| `src/lib/platform.ts`      | Storage, clipboard, sharing, routing; future native seam       |
| `supabase/migrations/`     | Production schema, RLS, RPCs, immutable character seed         |
| `public/characters/`       | 24 original, bundled SVG portraits                             |
| `public/boards/`           | Bundled realistic portraits and their source/license notice    |
| `artwork/one-million-faces/` | Pinned dataset provenance, hashes and import documentation    |
| `tests/`                   | PostgreSQL/RLS, rules, preview browser, live multiplayer tests |

**Publishing is not completed.** A Supabase project, deployment configuration, CAPTCHA, support contact, and the owner's production approval remain external actions. See [DEPLOYMENT.md](DEPLOYMENT.md), [SCALING.md](SCALING.md), [APP_STORES.md](APP_STORES.md), and [ASSETS.md](ASSETS.md).

Actual delivery checks and the complete A–G handoff are recorded in [IMPLEMENTATION_REPORT.md](IMPLEMENTATION_REPORT.md).

The current gameplay upgrade and verification are described in [V2_IMPLEMENTATION_REPORT.md](V2_IMPLEMENTATION_REPORT.md). Apply **all** pending database migrations before deploying this frontend; the original migration remains unchanged for existing games.
