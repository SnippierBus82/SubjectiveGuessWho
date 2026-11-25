# Boards and portraits

Create a folder under `public/boards/` and add 24 or more distinct images. The folder name becomes the board label and each filename becomes a character name. For example, `public/boards/Friends/Alex.webp` adds Alex to Friends.

PNG, JPEG, WebP, AVIF, and SVG are supported. Names must be unique regardless of case or extension, and image copies do not count as separate characters. Larger folders are sampled to 24 random people per game. Vite discovers changes during development and the production build reports invalid boards. Deploy the folder to make it available online.

Each bundled board needs at least 24 characters.

## Random AI faces

The **Random AI faces** board tries [OneMillionFaces](https://huggingface.co/datasets/RichardErkhov/OneMillionFaces) for up to 12 seconds. If the source is unavailable, the game samples 24 unique faces from the bundled selection. The board picker uses bundled portraits for instant previews. See the [portrait attribution and license](assets/OneMillionFaces-NOTICE.txt).

The 144 curated fallback WebPs live in `assets/fallback-faces.json.gz`. The build extracts them into ignored `public/fallback-faces/` and writes the discovery result to ignored `.generated/boards.json`. No image download is needed to install or build. Keep custom boards in `public/boards/`.

For online play, the Vercel function saves the selected online portraits in Supabase Storage and records the exact cast and order for both players. Refresh keeps that cast. Rematches prepare a new cast, and matchmaking pairs people who chose the same board.
