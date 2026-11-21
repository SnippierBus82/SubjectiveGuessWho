# Publish to Vercel + Supabase

## Your required actions

This repository is implemented locally. **No production deployment or managed-backend verification has been performed.** Before inviting the public, the owner must:

- [ ] Create or select GitHub, Supabase, Vercel, and hCaptcha or Cloudflare Turnstile accounts/projects.
- [ ] Provide the Supabase URL and **public publishable key** via local/Vercel configuration, never secrets in chat.
- [ ] Apply the database migration and enable anonymous Auth and private Realtime.
- [ ] Enable Email Auth, confirmed emails, secure email changes, manual identity linking for guests, a 12-character server password minimum, and working SMTP. Add email codes to the signup, email-change and reset templates; follow [account setup](SETUP.md#email-and-password-accounts).
- [ ] Configure CAPTCHA: public site key in Vercel, private secret only in Supabase Auth, correct allowed hostnames.
- [ ] Select the final game name/domain and check naming/trademark availability.
- [ ] Set a monitored `VITE_SUPPORT_EMAIL`; review the privacy page for the actual operator and retention practices.
- [ ] Review the original portrait assets and third-party font/icon licenses in [ASSETS.md](ASSETS.md).
- [ ] Enable the retention job, choose Auth record retention, and confirm backups/recovery.
- [ ] Configure provider billing, budget/usage alerts, capacity limits, and operational ownership.
- [ ] Run the live two-browser test and the manual mobile/reconnect/security checklist below.
- [ ] Review the preview deployment and explicitly approve production publication.

Do not send database passwords, access tokens, administrative keys, or CAPTCHA secrets through chat or Git. Set secrets directly in the provider's secure interface. All `VITE_` variables are public build inputs.

## 1. Create the GitHub repository

From this project directory, after creating an empty private repository on GitHub:

The local Git repository is already initialized on `main`; skip `git init` below when using this workspace.

```sh
git init -b main
git add .
git commit -m "Build Subjective Guess Who multiplayer game"
git remote add origin https://github.com/YOUR_ACCOUNT/YOUR_REPOSITORY.git
git push -u origin main
```

Inspect `git diff --cached` before committing; `.env*` files, dependencies, build output, test artifacts, and local session files are ignored. The included GitHub Actions workflow runs TypeScript/build, embedded database tests, browser/accessibility tests, and a disposable PostgreSQL 17 connection-pool suite. Its PostgreSQL service is CI test infrastructure only.

## 2. Prepare Supabase

Follow [SETUP.md](SETUP.md) to create the project, configure Auth/CAPTCHA, and run:

```sh
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push --remote
```

Verify SQL catalog count is 24, all public game tables have RLS, and `private` is absent from the exposed API schemas. The migration restricts function execution and direct table writes. Keep only `public`/the default approved schemas exposed; never expose `private`.

Enable Supabase's `pg_cron` extension and run the first statement in `supabase/maintenance.sql` once to schedule hourly expired-room cleanup. The commented second job is an optional 30-day anonymous-user cleanup policy; review and enable deliberately. Check scheduled job success in `cron.job_run_details`. Rooms expire after 24 hours without activity even if cleanup is delayed.

## 3. Connect Vercel

For a preview-first release, create/link a Vercel project with the CLI below, then connect its GitHub integration when you are ready for automatic deployments. Dashboard repository import normally starts a production deployment; wait until production publication is approved before pressing its Deploy button. Select Vite, repository root, build command `npm run build`, output `dist`, and Node.js 22 or 24. `vercel.json` defines SPA fallback and security headers. Configure **Preview** and **Production** environments separately:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
VITE_HCAPTCHA_SITE_KEY
VITE_TURNSTILE_SITE_KEY
VITE_APP_URL
VITE_SUPPORT_EMAIL
```

Use an isolated Supabase project for preview/test if possible. `VITE_APP_URL` must be that environment's canonical HTTPS origin. For dynamic preview URLs, omit it to use the actual current origin; ensure Auth/CAPTCHA hostname settings permit the selected stable preview host. `VITE_APP_URL` controls invitation links, not server authority.

Create a preview deployment first. With the Vercel CLI, the equivalent is:

```sh
npx vercel login
npx vercel link
npx vercel
```

After reviewing the preview and obtaining owner production approval:

```sh
npx vercel --prod
```

Environment variables are compiled by Vite. Changing them requires a new deployment. No secret or service-role key belongs in this static frontend. [Vercel Vite deployment](https://vercel.com/docs/frameworks/frontend/vite), [environment changes](https://vercel.com/docs/environment-variables/managing-environment-variables).

### If the deployed website says Local preview

Your computer's `.env.local` is ignored by Git and is not uploaded to Vercel. Configure the hosted build separately:

1. Open your project in Vercel, then **Settings → Environment Variables**.
2. Add the following values for **Production** (and Preview too if you want online play on preview deployments):

| Name | Value |
| ---- | ----- |
| `VITE_SUPABASE_URL` | Your Supabase project URL, copied from `.env.local` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Your public browser key, copied from `.env.local` |
| `VITE_HCAPTCHA_SITE_KEY` | Your public hCaptcha site key |
| `VITE_APP_URL` | Your live frontend URL, such as `https://subjective-guess-who.vercel.app`, without a trailing slash |
| `VITE_SUPPORT_EMAIL` | Your public support email address |

For hCaptcha, leave `VITE_TURNSTILE_SITE_KEY` unset or empty. The CAPTCHA secret stays in Supabase Auth's CAPTCHA settings; it does not belong in Vercel's frontend variables. Do not upload `.env.local` or add it to Git.

3. Set your Supabase Auth **Site URL** to the live frontend URL. If you use hCaptcha's domain allowlist, add the live hostname, such as `subjective-guess-who.vercel.app`, without a protocol or path.
4. Open Vercel **Deployments**, choose the latest production deployment, and select **Redeploy**. Confirm the deployment uses the saved Production variables. Refresh the live website after the deployment is ready. Saving variables alone does not change an existing deployment.

Both Supabase variables are required to switch the app from Local preview to online play. If only one is set, the app shows an incomplete-configuration error. After switching to online mode, create a new online room; the preview code `PREVIEW` cannot be used on another device.

## 4. Verify the live deployment

Use two independent browser profiles on different devices/networks, then the complete [SETUP.md](SETUP.md) checklist. Also verify:

- HTTPS, certificate, room invitation URLs, clipboard, native share, and refresh/deep links.
- Anonymous Auth persists across refresh, CAPTCHA works for new sessions, and session loss cannot hijack another member.
- A third profile cannot join a full room, read that room's tables, call actions, or subscribe to its private channels.
- Inspect RPC payloads/responses and Broadcast messages before a result: no opponent selection should be present. Never test this using an admin key.
- Off-turn and repeated actions fail safely; secret changes after start fail. A late answer remains unanswered and never becomes an invented YES/NO.
- Background one tab through several turns; restore it and compare deadlines, active player, history, and results.
- Check 360px/390px mobile, tablet, desktop, keyboard-open controls, iOS Safari, Android Chrome, keyboard navigation, and reduced motion.
- Verify a correct and incorrect guess, both reveal screens, and two rematch votes preserving the room.
- Inspect response headers. The CSP permits the default `*.supabase.co` hostnames, hCaptcha, and Cloudflare Turnstile. If you use a custom Supabase domain or native wrapper, explicitly adapt the CSP for those origins.

## 5. Monitoring, recovery, and privacy

The frontend logs only the RPC operation and error code on request failures, never tokens, nickname, question, room code, or secret. Users get actionable errors and saved drafts. No external error-reporting/analytics product is configured. Monitor Supabase Auth errors, RPC/database logs, Realtime disconnects/delivery, CPU, query latency, storage, and Vercel deployment errors. If adding error reporting later, scrub identifiers, questions, keys, and session data first.

Enable provider billing/usage notifications and set an operational budget. Supabase backups/PITR and retention vary by plan; select a recovery option, document who can restore it, and test a restore on a separate project before launch. Revert a frontend via Vercel deployment history; evolve the database with forward migrations rather than assuming a frontend rollback reverses SQL.

The basic privacy page explains anonymous sessions, room/question storage, local drafts/eliminations, ephemeral reactions, providers, and inactivity expiry. Supply the actual operator/support address and confirm it matches enabled jobs and applicable obligations. Do not add tracking or a cookie banner unless future functionality calls for it.

## 6. Optional custom domain

Add the domain in Vercel Project Settings → Domains and apply exactly the DNS records Vercel provides. Wait for domain/HTTPS verification. Update `VITE_APP_URL`, Supabase Auth Site URL/allowed origins, and your CAPTCHA provider's allowed hostnames; redeploy and test invitation links again.

## Gameplay v2 rollout

1. In the linked checkout, run `npx supabase db push --remote --dry-run`, verify the project target, and apply all pending migrations, including `202611160001_game_v2.sql`, `202611160002_board_choices.sql`, and `202611170001_folder_boards.sql`, with `npx supabase db push --remote`.
2. The migration expands the schema and adds versioned RPCs. Existing version 1 rooms keep their original rules/portraits; updated clients create version 2 rooms. Do not edit or replay the original migration.
3. Run the isolated integration tests in TESTING.md, then deploy the updated frontend with the public environment values above. New RPC-not-found errors indicate a missing migration, rather than missing frontend configuration.
4. Verify hCaptcha, two-device play, pause/resume, and Find a player on the deployed frontend. Review the generated casts and phone screenshots before inviting players.

Matchmaking uses a FIFO queue filtered by board preference with the 120/30/60 preset. Tickets lease for 30 seconds with ten-second visible-page renewals; matched players have two minutes to choose and ready. The existing retention job now also removes abandoned tickets and stale reaction-rate records. Game heartbeats run every 15 seconds, returning a complete snapshot only when the room version changes. Match and game notifications contain no secret choices or queued question text.

The earlier board migration added `create_room_board_v2` and `matchmake_board_v2`. The folder-board upgrade below supersedes its selectable packs and adds server preparation. Existing rooms retain their saved faces; new games require the current backend configuration. Source records remain in `artwork/one-million-faces/README.md`, with current instructions in BOARDS.md. No monetization is enabled.

The web app manifest and icons support standalone installation. Gameplay still connects to Supabase; native iOS/Android packaging remains a separate future task.

## Folder-board and online-face rollout

Follow [BOARDS.md](BOARDS.md): apply the additive migration, set **server-only** `SUPABASE_SECRET_KEY` in Vercel alongside the public Supabase values, then redeploy. It must be a Supabase secret/service_role key, not an hCaptcha secret, and must never have a `VITE_` prefix. The app uses a Vercel function, not a separately deployed Edge Function.

The migration creates the public-read, server-write `game-faces` Storage bucket. The frontend's CSP now permits Supabase-hosted images, and SPA routing excludes `/api/boards`, cached portraits and the generated sharing banner. Verify the deployed API returns JSON and never exposes its privileged key. Legacy asset URLs still resolve.

Check live online acquisition, an outage fallback, shared preparation on two devices, retry after failure, a custom 24+ image folder, matching and rematches. Adding later folders needs only the normal build/deployment, with no per-board SQL. `npm run brand` and production builds create `social-preview.png` using the owner's logo and bundled fonts. See TESTING.md for automated and hosted-test boundaries.
