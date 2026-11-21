# Add a board

Create a subfolder here and add at least **24 different images**. Image filenames are the character names: `Alex.webp`, `Jamie.png`, `Quinn.jpg`.

The folder name is the board's displayed name. No names file, JSON, code, or SQL changes are needed. Spaces and Unicode names work. Supported formats: PNG, JPG/JPEG, WebP, AVIF, SVG.

Names must be unique within the folder, including across extensions. Identical image copies do not count as different characters. More than 24 images produces a random selection of 24 for each new game and rematch.

`npm run dev` discovers changes automatically. Commit the folder and deploy normally to make it available online. A production build reports incomplete or invalid boards instead of publishing them silently.

Keep image URLs for ongoing games available when renaming/removing a folder. Existing legacy assets and the AI fallback are managed separately.
