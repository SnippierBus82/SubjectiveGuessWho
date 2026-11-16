# Subjective Guess Who

**24 faces. One secret person. The vibes are the evidence.**

A mobile-first two-player party game built with React, strict TypeScript, Vite, Tailwind CSS, Lucide, and Supabase. Original SVG portraits and locally bundled OFL fonts give the game its own visual identity. No image services, AI answers, tracking, or account forms.

## Run it

Use **Node.js 22.12+ (22 LTS or 24 LTS)** and npm.

```sh
npm ci
npm run dev
```

Open http://localhost:5173. Without environment configuration, this is a **clearly labeled single-device preview**. Enter a nickname, create a game, choose a person, and ready up. Use **Switch seat** to choose and play for the second player. Nobody answers automatically. Preview saves both seats and secrets in this browser; it provides no online multiplayer or security boundary.

For two devices, follow [SETUP.md](SETUP.md) to connect Supabase. The frontend automatically switches to online mode when both public Supabase environment values are present. Incomplete configuration produces a visible error.

## Implemented

- Nicknames, 7-character room codes, invitation links, clipboard/native sharing, and exactly two room members.
- The same ordered 24-person illustrated board; private secrets, ready states, random first player.
- Server-enforced 30-second questions and 15-second answers. Timeouts skip empty turns or mark questions unanswered. Early actions advance immediately.
- Free text up to 50 Unicode characters, persistent drafts, private reversible eliminations, remaining count, and question history.
- Private realtime state notifications, canonical snapshots, version checks, clock correction, presence, and throttled ephemeral reactions.
- Server-validated final guesses, both-character reveals, winner display, and a mutual rematch in the same room.
- Reconnect/refresh recovery, RLS, locked room transactions, idempotency receipts, input validation, rate limits, and retention SQL.
- Responsive home/lobby/game/result screens; keyboard focus, semantic controls, reduced motion, safe areas, and local fonts/assets.
- Basic privacy page at `/?page=privacy`, provider configuration guides, CI, database tests, browser tests, and a managed-service load script.

## Checks

```sh
npm test                  # Real PostgreSQL via embedded PGlite: RPCs, RLS, timing, rules
npm run build             # Strict TypeScript + production bundle
npx playwright install chromium
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
| `tests/`                   | PostgreSQL/RLS, rules, preview browser, live multiplayer tests |

**Publishing is not completed.** A Supabase project, deployment configuration, CAPTCHA, support contact, and the owner's production approval remain external actions. See [DEPLOYMENT.md](DEPLOYMENT.md), [SCALING.md](SCALING.md), [APP_STORES.md](APP_STORES.md), and [ASSETS.md](ASSETS.md).

Actual delivery checks and the complete A–G handoff are recorded in [IMPLEMENTATION_REPORT.md](IMPLEMENTATION_REPORT.md).
