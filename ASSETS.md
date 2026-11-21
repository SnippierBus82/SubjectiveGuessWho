# Assets and licenses

**Current implementation:** folder-based image boards plus one online-first Random AI faces option. See [BOARDS.md](BOARDS.md). The supplied SGW logo is reused in the app and sharing banner. Procedural portraits and the catalogs described below are retained only for saved-game compatibility and source records; they are not selectable new-game boards. The fallback portraits now live in `public/ai-face-cache/`.

## Realistic portrait board option

The game now also offers fixed and shuffled realistic portrait boards using **144 AI-generated faces** from [RichardErkhov/OneMillionFaces](https://huggingface.co/datasets/RichardErkhov/OneMillionFaces). The dataset card declares MIT. Locally bundled 512px WebP assets total 3.07 MiB; a shuffled game uses 24. [The import documentation](artwork/one-million-faces/README.md) explains the source revision, exact source keys/ranges, original and derivative hashes, fictional names, limited visual check, and absent trait annotations. The [shipped source/license notice](public/boards/one-million-faces-v1/NOTICE.txt) preserves the upstream declaration and MIT terms. No image-generation service was called for this integration.

This is a separate selectable option; it does not complete or replace the owner's external 72-image production kit. The illustrated renderer remains the default for compatibility.

## External 3D portrait production kit

The modular artwork below was rejected as the final visual direction. Its renderer remains available until an approved replacement cast is ready.

The replacement direction is **72 curated expressive adult 3D portraits**, generated separately by the owner. [The generation kit](artwork/3d-cast/README.md) includes a shared style prompt, 72 individually written character briefs, 72 complete copy/paste prompts, spreadsheet export, and a JSON Schema. `characters.json` is the canonical manifest. All records currently have `status: planned`; their observed traits, actual image dimensions, checksums and approval fields are unset.

Requested traits are kept separate from observed image metadata. Only visually approved portraits should be activated in the future game catalog. The kit makes no image-generation calls and does not change the current game or database. Validate or regenerate its exports with `node scripts/portrait-kit.mjs --check` or `node scripts/portrait-kit.mjs`.

## Character pack

The standard illustrated board uses the modular **renderer v1** in `src/game/portraits.ts`: 8 face shapes, 8 noses, 8 eye shapes, 6 brows, 8 mouths, 20 hairstyles, 8 headwear shapes, 12 outfits, 8 glasses, 8 facial-hair styles, 8 earrings, and 8 skin-detail treatments. Palettes include ten skin tones, sixteen hair colours, eight eye colours, and sixteen clothing/accessory colours. These are authored vector paths, not remote or generated bitmap images.

The server creates and stores a 24-character cast for each game. `rendererVersion: 1` fixes the rendering contract; preserve this renderer when introducing a future version. The browser and PostgreSQL descriptor generators are tested against each other, and each pair of characters differs in at least three feature families. Preview uses the same descriptor contract. No runtime image API is needed.

`tests/e2e/artwork.spec.ts` renders every part and three representative casts into ignored `.local/previews/character-*.png` contact sheets. Review both enlarged portraits and the actual mobile board; visual inspection complements the descriptor and SVG checks.

### Legacy portraits

The original 24 portraits in `public/characters/*.svg` are vector drawings authored for this repository in `scripts/create-portraits.mjs`: shapes, custom hair silhouettes, skin/clothing/background palettes, glasses, facial hair, freckles, jewelry, and expressions. No real people, external portrait service, AI image generation, copied game characters, or runtime image API is used. All SVGs are bundled locally and contain only vector geometry and text titles.

Regenerate deterministically with `npm run assets`. Catalog IDs/order are mirrored in `src/game/characters.ts` and the migration; a database test checks the match. A future pack can add catalog/asset entries and select a `pack_id`; game rules are based on catalog IDs, not portrait appearance. These fixed catalog entries are preserved for existing version 1 games; new games use per-game generated casts.

The updated logo combines two portrait cards, contrasting expressions, and a question mark. Its SVG favicon and standalone web app icons are bundled locally; regenerate the PNG icons with `node scripts/create-app-icons.mjs` after installing Playwright Chromium. The working product name should be reviewed by the owner before commercial/public release. No repository-wide open-source license has been selected automatically.

## Bundled dependencies

- Fredoka and DM Sans are distributed by Fontsource under the SIL Open Font License. Font CSS and binaries are bundled at build time; no Google Fonts network request is made. License texts ship in the installed `@fontsource/fredoka` and `@fontsource/dm-sans` packages.
- Lucide React icons use the ISC license; its package contains the notice.
- `public/THIRD_PARTY_NOTICES.txt` preserves the installed production dependency notices, including both complete font OFL licenses. It ships with the website. Regenerate after dependency changes with `npm run notices`.
- React, Vite, Tailwind, Supabase JS, and test tools retain their respective package licenses. Review dependency notices before choosing a public-source license or packaging native releases.

Do not assume a generated portrait resolves name/trademark clearance or substitutes for the owner's asset review. Preserve each pack's source and license metadata, and review rights before future monetization.
