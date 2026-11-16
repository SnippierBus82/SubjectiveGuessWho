# Assets and licenses

## Character pack

The original 24 portraits in `public/characters/*.svg` are vector drawings authored for this repository in `scripts/create-portraits.mjs`: shapes, custom hair silhouettes, skin/clothing/background palettes, glasses, facial hair, freckles, jewelry, and expressions. No real people, external portrait service, AI image generation, copied game characters, or runtime image API is used. All SVGs are bundled locally and contain only vector geometry and text titles.

Regenerate deterministically with `npm run assets`. Catalog IDs/order are mirrored in `src/game/characters.ts` and the migration; a database test checks the match. A future pack can add catalog/asset entries and select a `pack_id`; game rules are based on catalog IDs, not portrait appearance. This release ships only the original pack.

The favicon is an original vector question-mark mark. The working product name should be reviewed by the owner before commercial/public release. The owner should review the art and choose the repository's distribution/license policy; no repository-wide open-source license has been selected automatically.

## Bundled dependencies

- Fredoka and DM Sans are distributed by Fontsource under the SIL Open Font License. Font CSS and binaries are bundled at build time; no Google Fonts network request is made. License texts ship in the installed `@fontsource/fredoka` and `@fontsource/dm-sans` packages.
- Lucide React icons use the ISC license; its package contains the notice.
- `public/THIRD_PARTY_NOTICES.txt` preserves the installed production dependency notices, including both complete font OFL licenses. It ships with the website. Regenerate after dependency changes with `npm run notices`.
- React, Vite, Tailwind, Supabase JS, and test tools retain their respective package licenses. Review dependency notices before choosing a public-source license or packaging native releases.

Do not assume a generated drawing resolves name/trademark clearance or substitutes for the owner's asset review. No paid asset licenses or third-party character-photo consent are required by the current bundled artwork.
