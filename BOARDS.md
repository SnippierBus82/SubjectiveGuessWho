# Boards and faces

## Add your own board

Put at least **24 different images** in a new folder under `public/boards/`:

```text
public/boards/My friends/Alex.webp
public/boards/My friends/Jamie.png
public/boards/My friends/Quinn.jpg
...at least 24 images in this folder
```

The folder becomes **My friends** in the board picker. Each filename, without its extension, is the character name. **There is no names file, JSON manifest, or per-board SQL to maintain.** Spaces and Unicode names work. Supported formats: PNG, JPG/JPEG, WebP, AVIF and SVG. Names must be unique within the folder, even across different extensions. Identical image copies are rejected.

Exactly 24 images uses all of them. More than 24 chooses 24 different images for each game and rematch. The server saves the selection, order and names once, so both players see the same board after joining or refreshing. Start a new room to change the selected pack.

`npm run dev` watches this folder and refreshes available boards automatically. Incomplete/invalid folders produce a clear development warning and stay out of the picker. Production builds fail with the folder's error instead of silently publishing an incomplete board. Commit your folder and deploy normally to make it available online. Preserve URLs of images used in ongoing games when renaming or removing files.

## One-time online setup

Apply all pending migrations, including `202611170001_folder_boards.sql`:

```powershell
npx supabase db push --remote --dry-run
npx supabase db push --remote
```

Check the project target before applying. This is an additive upgrade; do not reset the hosted database or edit previously applied migrations.

Add this **server-only** variable to `.env.local` for online development, and to your Vercel project's environment variables for deployment:

```dotenv
SUPABASE_SECRET_KEY=your_supabase_secret_key
```

Open the Supabase project's **Settings → API Keys → Publishable and secret API keys** and copy or create a secret key (`sb_secret_...`). A legacy `service_role` key also works. See [Supabase's API key guide](https://supabase.com/docs/guides/getting-started/api-keys). This is **not your hCaptcha secret**. Never call it `VITE_SUPABASE_SECRET_KEY`: every `VITE_` value is public. Keep `.env.local` ignored by Git. The existing public Supabase URL/key must still be configured, and hCaptcha's secret remains in Supabase Auth.

The requirement is the same locally and on Vercel: the board server uses this key to save shared boards and AI images. Vercel variables are not automatically available to Vite on your computer. Both public Supabase values select online mode even on localhost; leave both empty to use single-device preview without backend credentials.

Restart Vite after changing environment variables. Redeploy Vercel after adding its server environment variable. The Vercel function deploys with the app; no separate Supabase function or per-pack migration is required. `/api/boards` must return JSON, not the SPA HTML page.

The migration creates the `game-faces` public-read Storage bucket. Only the privileged backend can write selected AI images or finalize a prepared board. It verifies the player's Supabase session and room membership; database leases prevent two players from preparing competing casts. Selection remains disabled until the shared board is ready. Errors have a Retry button, and Leaving remains available.

## Random AI faces

There is one built-in option: **Random AI faces**, using [RichardErkhov/OneMillionFaces](https://huggingface.co/datasets/RichardErkhov/OneMillionFaces). The dataset describes these as entirely AI-generated and labels its license MIT. No new face-generation service is called.

For every new AI game, including matched games and rematches, the backend first tries the online dataset viewer. It samples from the rows the viewer actually exposes; large datasets can have a partial viewer export. It does not download the full dataset or claim that every one of its million faces is accessible through the viewer.

The acquisition budget is **12 seconds**. A source outage, invalid/unavailable images, insufficient unique faces, or timeout selects a complete fallback board from the 144 bundled portraits. No partially online/partially cached board is assembled. A short notice identifies fallback use. Configuration, authentication and Storage failures are shown as errors; they do not silently select cached portraits.

Successful online images are optimized to 512px WebP and copied to immutable Supabase Storage URLs before the board becomes available. The game never stores expiring Hugging Face asset links. Source credit is retained in upload metadata. A server-side maintenance pass runs at most hourly during board preparation, scanning bounded batches and deleting old image folders whose games have already been removed. Images belonging to stored games are retained.

`src/game/neutral-names.json` is the single active list of gender-neutral names. AI boards sample 24 unique names from it once per game; names are not inferred from appearance. Folder boards use filenames instead. No age, gender or personality annotations are invented.

The saved fallback is under `public/ai-face-cache/`, outside the discoverable board folder. Its original source revision, hashes and limited visual-review notes remain in `artwork/one-million-faces/manifest.json`; its shipped `NOTICE.txt` preserves attribution and the declared MIT terms. Old asset URLs are retained through compatibility routing. Validate these assets offline with `node scripts/face-pool.mjs --check`.

Without Supabase configuration, local two-seat preview uses the same source policy through the development server. Resolved online images are stored with the local preview so refresh preserves the selected faces. Folder preview works without backend credentials. Production online games require the server key above.

## Branding and compatibility

The supplied `public/SGW.svg` remains the source artwork. Headers and loading screens use the updated favicon artwork. Home and board-picker previews use bundled portraits without external requests. `npm run brand` generates a simple cream sharing banner with the supplied logo and game title in bundled Fredoka; `npm run build` also generates it automatically. Open Graph/Twitter metadata uses `VITE_APP_URL` when configured.

The old illustrated and fixed-photo boards are no longer choices for new games. Saved games retain their existing faces and isolated legacy renderers. A rematch from a retired pack moves to Random AI faces. The separate 72-image production kit is retained as an artwork handoff, not loaded as a game catalog.

All current boards are free. No checkout, subscriptions or entitlements are implemented.
