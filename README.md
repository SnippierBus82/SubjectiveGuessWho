# Subjective Guess Who

A two-player party game about first impressions. Pick a secret face, ask subjective yes-or-no questions, eliminate suspects, and make a final guess. Play by invitation or let matchmaking find someone on the same board.

## Run locally

Use Node.js 22.12+ and npm.

```sh
npm ci
npm run dev
```

Open http://localhost:5173 and choose **Create game**. With no Supabase settings, **Switch seat** lets you play both sides on one device. For online play and Vercel deployment, follow [SETUP.md](SETUP.md). To add a board, see [BOARDS.md](BOARDS.md).

## Repository

| Path | Purpose |
| --- | --- |
| `src/` | React screens, game rules, and local/online services |
| `api/boards.ts` and `server/` | Vercel board endpoint, portrait selection, and storage |
| `public/boards/` | Add a folder of named images here to publish a board |
| `assets/` | Offline portrait source archive and attribution |
| `supabase/migrations/` | Initial database schema for a fresh Supabase project |
| `tests/` | Game rules, database RPCs, browser flows, and optional hosted integration |

The board preparation script creates the ignored `.generated/boards.json` and `public/fallback-faces/`. The build also creates the sharing banner and writes the site to `dist/`.

## Run checks

```sh
npm test
npm run build
npx playwright install chromium webkit
npm run test:e2e
```

- **`npm test`** runs the rules, board source, and PostgreSQL RPC tests with PGlite. No database server or public image provider is required.
- **`npm run test:e2e`** runs Chromium and WebKit flows with local fixtures, including accounts, board discovery, matchmaking, and accessibility. Browser reports and failure artifacts go to `test-results/`.
- **`npm run test:postgres`** repeats the database suites with concurrent connections. Set `TEST_DATABASE_URL` to an empty, disposable PostgreSQL 17 database and set `TEST_ALLOW_EMPTY_DATABASE=yes`. The user needs permission to create roles and databases.
- **`npm run test:live`** uses a separate Supabase test project with the initial schema applied, anonymous sign-ins enabled, and CAPTCHA disabled. Set `E2E_SUPABASE_URL`, `E2E_SUPABASE_PUBLISHABLE_KEY`, and `E2E_SUPABASE_SECRET_KEY` for that test project.
