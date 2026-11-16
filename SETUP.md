# Developer setup

This guide takes you from a preview on your computer to online play using a hosted Supabase project. Supabase provides the database, anonymous player sign-in, and live updates between players.

| What you want to do | What you need | Where to start |
| ------------------ | ------------- | -------------- |
| Try the game on one device | Node.js and Git | Step 1 only |
| Play online with two browsers or devices | Node.js, Git, and a hosted Supabase project | Steps 1–5; no Docker needed |
| Run Supabase itself on your computer | Docker Desktop as well | Optional local setup at the end |

Run terminal commands from the project folder containing `package.json` and the `supabase` folder. Copy only the commands inside the code blocks, without the `PS ...>` prompt. Replace values such as `YOUR_PROJECT_REF` with your own values.

## 1. Install and preview

Install Node.js 22.12+ (22 or 24 LTS) and Git. Open a new terminal after installing them, and check:

```sh
node --version
npm --version
git --version
```

In the project folder, install the app's dependencies and start the development server:

```sh
npm ci
npm run dev
```

Open the address printed by Vite, usually http://localhost:5173. Keep this terminal running; use a second terminal in the same folder for the following steps. Press Ctrl+C when you want to stop the server.

No `.env` file is necessary for local preview. Create a game and use **Switch seat** to play both sides. Local storage remembers the seat, secrets, draft, and eliminations. This is one device only. The invitation code `PREVIEW` is intentionally not a real online room code.

## 2. Create a managed Supabase project

### Create and link the project

1. Open the [Supabase dashboard](https://supabase.com/dashboard) and create a project. Choose a suitable region and save its database password in your password manager. Wait until the project is ready.
2. Find the **Project Reference** in the project's general settings. It is also the reference in the dashboard URL: `https://supabase.com/dashboard/project/YOUR_PROJECT_REF`. Use this reference, rather than the project's display name.
3. Sign in using the official command-line tool (CLI). `npx` runs the tool; accept the package installation prompt if one appears. Follow the login instructions in your terminal/browser:

```sh
npx supabase login
```

4. Link this project folder to your hosted project, replacing `YOUR_PROJECT_REF`:

```sh
npx supabase link --project-ref YOUR_PROJECT_REF
```

If prompted for a database password, enter the password saved when creating the project, rather than your Supabase account password. Do not commit or paste credentials into chat. `Finished supabase link` means the link succeeded; it does not create the game's tables yet.

### Apply the game's database migration

A migration is a SQL file that creates or updates the database structure. This project's initial migration also adds the 24 characters.

First preview the pending changes without applying them:

```sh
npx supabase db push --remote --dry-run
```

Check that the `Target:` line names your intended hosted project. On a new database, the pending migration should be `202611150001_game.sql`. Then apply it:

```sh
npx supabase db push --remote
```

Review the listed changes and confirm when prompted. Wait for the command to finish successfully. Already-applied migrations are skipped on later pushes.

**Keep `--remote` in both commands.** The current CLI targets the database on your computer by default, even after linking a hosted project. Linking remembers which project `--remote` should use. See [Supabase's local and hosted project guide](https://supabase.com/docs/guides/local-development/local-and-hosted-projects).

### If you see `ECONNREFUSED 127.0.0.1:54322`

`127.0.0.1` means your own computer. This error means the CLI tried to reach a local database and nothing was listening on that port. If you are following the hosted setup, run:

```sh
npx supabase db push --remote
```

You do not need to repeat a successful link or install Docker for this hosted workflow. The failed connection did not apply the migration. If the command still prints `Target: local stack`, check that you included `--remote`.

If the CLI does not recognize `--remote`, check `npx supabase --version` and `npx supabase db push --help`. Older CLI versions used different targeting defaults; use `npx supabase@latest db push --remote` to run the current CLI.

### Check that the migration worked

Open **SQL Editor** in the same Supabase dashboard project and run this read-only query:

```sql
select count(*) as original_characters
from public.characters
where pack_id = 'original';
```

The result should be **24**. Continue with Auth and Realtime below; creating the tables alone does not enable online play.

`supabase/seed.sql` runs this same verification query during local resets; it creates no fake users or rooms. Use CLI migrations for ongoing development. If you already ran the migration manually in SQL Editor, its tables may exist without CLI migration history: do not rerun the entire file or reset the hosted database to resolve that mismatch.

## 3. Configure Auth and realtime

- Enable **Anonymous sign-ins** in Supabase Authentication settings. Anonymous users still use the `authenticated` database role. Do not add email/password account forms.
- Set the Auth Site URL to your frontend origin. Add only the development and preview redirect origins you use. This app does not use an email redirect flow.
- For a public project, configure **hCaptcha or Cloudflare Turnstile**. In Supabase, open **Authentication → Bot and Abuse Protection → CAPTCHA protection** (the dashboard may group this under Authentication settings), enable protection, select your provider, and save its **secret key there**. Only its public **site key** goes into the frontend.
- The frontend renders the selected provider when a new anonymous session needs one, passes the token to `signInAnonymously`, and restores existing sessions without making a new user.
- Check Auth's anonymous-signup rate limits. The documented default is 30 per IP per hour; tune for your expected audience and abuse exposure. Separate load-test projects need a different controlled setup. [Supabase anonymous auth](https://supabase.com/docs/guides/auth/auth-anonymous), [CAPTCHA](https://supabase.com/docs/guides/auth/auth-captcha).
- Enable Realtime; prefer its private-only channel setting for this dedicated project. The migration adds membership RLS policies to `realtime.messages`. No application tables need to be added to Postgres Changes publications: RPCs call `realtime.send` with a small version notification.
- Realtime must be able to create its daily Broadcast message partition. Establish a frontend connection before diagnosing missing database broadcasts. [Supabase Broadcast documentation](https://supabase.com/docs/guides/realtime/broadcast).

## 4. Add public frontend configuration

Create `.env.local` in the project root by copying `.env.example`. In PowerShell, run the following only if you do not already have a `.env.local` file:

```powershell
Copy-Item .env.example .env.local
```

Open `.env.local` in your editor and fill in your project's public values:

```dotenv
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_BROWSER_PUBLISHABLE_KEY
VITE_HCAPTCHA_SITE_KEY=YOUR_PUBLIC_HCAPTCHA_SITE_KEY
VITE_TURNSTILE_SITE_KEY=
VITE_APP_URL=http://localhost:5173
VITE_SUPPORT_EMAIL=YOUR_SUPPORT_ADDRESS
```

The placeholders are not working credentials. Get the URL and **publishable** key from the project's Connect/API settings. A local Supabase legacy `anon` JWT can also occupy the publishable-key variable; never use `service_role` or a secret key. The app rejects known administrative key formats.

| Variable                        | Visibility                                   | Required                                   |
| ------------------------------- | -------------------------------------------- | ------------------------------------------ |
| `VITE_SUPABASE_URL`             | Public, compiled into JavaScript             | Online play                                |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Public browser key, compiled into JavaScript | Online play                                |
| `VITE_TURNSTILE_SITE_KEY`       | Public                                       | CAPTCHA enabled with Turnstile; leave hCaptcha empty |
| `VITE_HCAPTCHA_SITE_KEY`        | Public                                       | CAPTCHA enabled with hCaptcha; leave Turnstile empty |
| `VITE_APP_URL`                  | Public canonical origin                      | Optional; falls back to current origin     |
| `VITE_SUPPORT_EMAIL`            | Public support address                       | Before public launch                       |

Restart Vite after editing `.env.local`. Every `VITE_` value is public. Database passwords, Supabase access tokens, secret API keys, CAPTCHA secret keys, and Vercel tokens must never use that prefix. [Vite environment documentation](https://vite.dev/guide/env-and-mode).

To restart, press Ctrl+C in the terminal running Vite, then run `npm run dev` again. With both Supabase values filled in, the app switches to online mode and should stop showing the single-device preview. Set only the site key for the provider selected in Supabase. hCaptcha takes precedence if both are filled in. For Turnstile, leave `VITE_HCAPTCHA_SITE_KEY` empty and fill in `VITE_TURNSTILE_SITE_KEY`. Leave both CAPTCHA site keys empty only if CAPTCHA is disabled for your private development project.

If the app still shows preview mode, check that the file is named exactly `.env.local` (not `.env.local.txt`), sits beside `package.json`, and contains both Supabase values. Then restart Vite.

### Set up hCaptcha

1. In the hCaptcha dashboard, copy your site's public **Sitekey** into `VITE_HCAPTCHA_SITE_KEY` in `.env.local`. Leave `VITE_TURNSTILE_SITE_KEY` empty.
2. Copy your hCaptcha **secret** into Supabase's CAPTCHA protection settings, select **hCaptcha**, and save. A secret stored only in `.env.local` does not configure Supabase. Do not add a `VITE_` variable for the secret; those values can be included in browser JavaScript.
3. Restart Vite, reload the game, complete the hCaptcha challenge, and create or join a game.

For real hCaptcha keys, use a development hostname or a hosted frontend. hCaptcha documents limitations with `localhost` and prohibits `localhost`/`127.0.0.1` as supplied hostnames. On Windows, you can open Notepad as administrator, edit `C:\Windows\System32\drivers\etc\hosts`, and add `127.0.0.1 guesswho.local`. Then use `http://guesswho.local:5173` in your browser and as `VITE_APP_URL`; configure your Supabase Auth Site URL for that address too. The project's Vite configuration allows `guesswho.local`. If you enable hCaptcha's domain allowlist, add `guesswho.local` to it. See [hCaptcha local development](https://docs.hcaptcha.com/#local-development) and [Supabase CAPTCHA setup](https://supabase.com/docs/guides/auth/auth-captcha).

If you accidentally used your hCaptcha **secret** in any `VITE_` setting while running or building the app, rotate it in hCaptcha and save the replacement only in Supabase's CAPTCHA settings. The public site key can remain in `.env.local`.

### If the connection check says “Invalid sitekey” (Turnstile)

If you use hCaptcha and see a Cloudflare widget, move your hCaptcha site key out of `VITE_TURNSTILE_SITE_KEY` and into `VITE_HCAPTCHA_SITE_KEY`, clear the Turnstile setting, and restart Vite. A key from one provider cannot be used with the other provider's widget.

This message comes from Cloudflare Turnstile. Check the widget's **Site Key** in the Cloudflare dashboard and copy it into `VITE_TURNSTILE_SITE_KEY` in `.env.local`. This value must be the Turnstile public site key, rather than its secret key, a Supabase key, or the example placeholder. In Supabase Authentication's CAPTCHA settings, select Turnstile and save the **Secret Key from that same widget**.

For development at `http://localhost:5173`, allow `localhost` in the Turnstile widget's hostname settings. Add `127.0.0.1` too if you use that address. Enter hostnames without `http://`, ports, or paths. A hostname rejection is a separate problem from an invalid key; verify the key first. Restart Vite and reload the page after correcting `.env.local`. See [Cloudflare's error codes](https://developers.cloudflare.com/turnstile/troubleshooting/client-side-errors/error-codes/) and [localhost guidance](https://developers.cloudflare.com/turnstile/troubleshooting/testing/).

For a private development project where you deliberately leave Supabase Auth CAPTCHA protection disabled, leave the frontend setting empty too:

```dotenv
VITE_TURNSTILE_SITE_KEY=
VITE_HCAPTCHA_SITE_KEY=
```

Clearing this setting only removes the frontend widget; it does not disable Supabase's CAPTCHA requirement. Keep both sides configured consistently. Enable CAPTCHA with real matching keys before public launch. Cloudflare's test site keys require matching test secret keys; a test site key paired with a production secret will fail verification.

## 5. Verify with two browsers

Start with two independent browser profiles on your computer at the Vite address. `localhost` on a second device refers to that second device, so it cannot use your computer's localhost invitation URL. For two-device testing, use a frontend address reachable from both devices and configure Auth/CAPTCHA for that address; see [DEPLOYMENT.md](DEPLOYMENT.md) for hosting the frontend.

1. Open normal Chrome and a separate browser/private profile. Two tabs in one profile share the same anonymous player and are not two players.
2. Create as player A. Share the invitation URL, then join as player B with a nickname.
3. Pick different secrets; check B cannot see A's choice. Ready up and confirm both boards have the same order.
4. Ask a question. Verify only B can answer A's question and that YES/NO, active player, and history update on both screens immediately.
5. Draft while waiting, eliminate a few faces, then refresh. Your secret, draft, and eliminations should return; the other board stays unchanged.
6. Let both kinds of timer expire. A missed answer must show **No answer**, never YES/NO.
7. Briefly disable the network or background one tab. Reconnect and check the canonical turn and countdown recover.
8. Send reactions and try a final guess. Both characters reveal only on the result screen. Test both correct and incorrect guesses and a mutual rematch.
9. Try a third independent profile: a full room must reject it. Inspect network responses for early secret leakage.

Run [TESTING.md](TESTING.md)'s automated suites too. An online project has not been verified merely because the local preview works.

## Optional: run Supabase on your computer

Skip this section when using the hosted project above. This starts a separate local backend; it does not start or configure your hosted project.

Install and open Docker Desktop, wait until its engine is running, then run from the project folder:

```sh
npx supabase start
```

The CLI starts the local services and applies migrations on the first start. Use `npx supabase status` to find their local API URL and public browser key. To connect the app to this backend, put those local values in `.env.local` and restart Vite. The checked-in `supabase/config.toml` enables anonymous Auth locally; dashboard settings for your hosted project do not configure this local stack.

If you deliberately want to erase and rebuild your **local** database from the migrations, run:

```sh
npx supabase db reset
```

This deletes local game data. Keep `--remote` off this reset command. Embedded database tests (`npm test`) need no Docker or running Supabase stack.
