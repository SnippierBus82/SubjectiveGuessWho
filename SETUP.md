# Set up online play

Start with a fresh Supabase project. The repository contains the complete initial schema in one migration.

## 1. Create the database

Create a project in the [Supabase dashboard](https://supabase.com/dashboard). From the repository root, sign in and link the project using its **project reference**.

```sh
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push --remote --dry-run
npx supabase db push --remote
```

Verify the dry run targets your intended project and lists the pending migrations. The initial schema creates the tables, game RPCs, Realtime policies, and the `game-faces` storage bucket. Keep the `private` schema out of the exposed API schemas.

For a local Supabase stack, run `npx supabase start` with Docker running and get the local URL and keys with `npx supabase status`. The local configuration already enables anonymous sign-in.

## 2. Configure Auth

- Enable **Anonymous sign-ins** for guest play and the **Email** provider for accounts. Set the Auth **Site URL** to the deployed origin and allow the local and preview URLs you use, including the `/?page=profile` return URL.
- Enable **Confirm email**, **Secure email change**, and **Allow manual linking** so guests can add an email identity without losing their player ID. Set the minimum password length to **12** and configure SMTP for public email delivery.
- Add `{{ .Token }}` to the **Confirm signup**, **Change email address**, and **Reset password** email templates so players can enter the emailed code. Keep the existing confirmation links.
- For public play, enable CAPTCHA in Supabase Auth with hCaptcha or Turnstile. Keep the provider secret in Supabase Auth and use its public site key in the app. Add the app's hostnames to the provider allowlist when applicable.
- Enable Realtime. The game uses private Broadcast and Presence channels, with access enforced by the migration.

If hCaptcha rejects the local hostname, use a development hostname such as `guesswho.local` mapped to `127.0.0.1` or test on a deployed preview.

## 3. Set environment variables

Copy [`.env.example`](.env.example) to `.env.local` for local online play. In Vercel, open **Project Settings**, then **Environment Variables**, and add the settings to each environment you use.

| Variable | Value |
| --- | --- |
| `VITE_SUPABASE_URL` | The Supabase project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | That project's browser publishable key |
| `SUPABASE_SECRET_KEY` | That project's server-only Supabase secret key (starts with `sb_secret_`) or `service_role` key |
| `VITE_HCAPTCHA_SITE_KEY` or `VITE_TURNSTILE_SITE_KEY` | Public site key for the CAPTCHA provider configured in Supabase |
| `VITE_APP_URL` | Optional canonical origin for invitations and sharing metadata |
| `VITE_SUPPORT_EMAIL` | Optional public contact address shown on the privacy page |

Get the Supabase keys from the project's **API Keys** settings. Keep all secrets out of variables prefixed with `VITE_`. Restart Vite after changing `.env.local` and redeploy after changing Vercel environment variables.

## 4. Deploy and verify

Import the repository in Vercel and select its root. The checked-in [`vercel.json`](vercel.json) configures Vite, the `dist` output, and the `/api/boards` function. Use Node.js 22 or later and deploy after the database and environment setup.

1. Open `/api/boards` on the deployed site. A browser GET should return HTTP 405 with `{"error":"Use POST."}`. If Vercel returns a 500, look for the `/api/boards` exception in **Logs**.
2. Create a game and join the invitation from a second browser profile or device. Confirm both players see the same faces and order, including after refresh.
3. Ready both players, ask and answer, make a final guess, and rematch. Try **Find a player** from both profiles on the same board.
4. Exercise sign-up, recovery, and CAPTCHA with the deployed hostname if enabled.

Each user can create up to 20 online rooms per clock hour. Rooms expire after 24 hours of inactivity and are deleted on the next hourly cleanup run. To enable automatic deletion, enable `pg_cron` and run [`supabase/maintenance.sql`](supabase/maintenance.sql) in the Supabase SQL editor.
