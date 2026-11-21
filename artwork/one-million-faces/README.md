# OneMillionFaces import archive

**Current usage:** these source records document the 144-image outage fallback, now served from `public/ai-face-cache/`. It is not a selectable fixed board. New AI games try the online dataset first and assign names from the single neutral-name list. See [BOARDS.md](../../BOARDS.md). The catalog and board IDs below describe the previous integration and remain for provenance/compatibility.

The game includes 144 realistic **AI-generated** portraits from [RichardErkhov/OneMillionFaces](https://huggingface.co/datasets/RichardErkhov/OneMillionFaces), alongside its existing illustrations. The dataset card labels the source MIT and describes its faces as entirely synthetic. These are not photos of identified real people. No images were generated for this integration.

Players select a board before **Create game** or **Find a player**:

| Stable board ID | Behavior |
| --- | --- |
| `generated-v1` | Existing illustrated cast; fresh each game. Still the default. |
| `million-faces-v1` | Fixed, selected cast: the first 24 entries in our versioned pool. Rematches keep this cast. |
| `million-faces-shuffle-v1` | Deterministic shuffle selects 24 unique entries from our 144-face pool. Rematches choose a fresh cast. |

This is a small bundled selection, not runtime access to the million-image dataset. The initial 144 were selected from the first 240 entries of one source shard, after a contact-sheet check for obvious artifacts and adult-looking faces. This sample is not representative of the full dataset. Synthetic image artifacts may remain; review the board at actual playing size before adding or changing portraits.

Both players receive the same saved definitions and order. Joining a room inherits its board; reconnecting never reshuffles it. Board selection stays fixed for the room, including rematches. Start a new room to change packs. Matchmaking pairs the oldest eligible player **with the same board preference**. Changing the waiting preference starts a new FIFO position; pulses and no-show requeues retain the saved board.

## Files and metadata

| File | Meaning |
| --- | --- |
| `manifest.json` | Canonical provenance for the imported image pool, including each source/derivative hash. |
| `UPSTREAM_README.md` | Unmodified dataset card at the pinned revision. It is the source of the MIT declaration. |
| `../../src/game/face-pool.json` | Lightweight client catalog: stable ID, fictional name, background, local image URL and alt text. |
| `../../public/boards/one-million-faces-v1/` | 144 square 512px WebP derivatives, about 3.07 MiB total, plus the shipped source/license notice. |
| `../../supabase/migrations/202611160002_board_choices.sql` | Server catalog and identical portrait definitions. Applies after the v2 gameplay migration. |

Per-face manifest fields:

- `character.id`: permanent app ID, e.g. `omf-seed0000`. Used for selections and guesses. Never change its meaning.
- `character.name`: a fictional game nickname assigned here. The dataset supplies no names.
- `character.image`: local versioned asset URL. No signed or temporary Hugging Face image URLs are used in gameplay.
- `character.alt`: accessible synthetic-portrait label; no inferred personality or sensitive attributes.
- `source.key`: original tar entry without its extension. A key like `seed0000` is a source identifier, not a verified reproducible model seed.
- `source.shard`, `offset`, `length`: exact tar file and byte range containing the source PNG.
- `source.sha256`: checksum of the original PNG, before conversion.
- `image.width`, `height`, `format`, `quality`, `bytes`, `sha256`: actual derivative properties and checksum.
- `observedTraits: null`: this source does not provide trait annotations. We have not invented gender, age, ethnicity, personality, generation-model, or verified feature metadata. `review` records the limited initial visual check; it is not identity/age verification or owner approval.

The root `revision` pins the upstream commit. Root `encoding` records Pillow 11.3.0, libwebp 1.5.0, Lanczos resizing, WebP quality 82 and method 6. Preserve the square source framing. The running game only needs the lightweight catalog and bundled images; it never downloads a dataset shard.

## Validate or restore

```sh
node scripts/face-pool.mjs --check
```

This is offline and checks all deployed image hashes and client/manifest agreement. Database tests also compare the SQL pool to the client catalog.

Assets are already included. If files are missing or changed, install Python with Pillow 11.3.0 (`python -m pip install Pillow==11.3.0`), then explicitly run:

```sh
node scripts/face-pool.mjs --restore
```

Restore only fetches missing/mismatched portraits from their pinned byte ranges, verifies the original hashes, reproduces derivatives, and checks their expected hashes before writing. A full restore can download roughly 190 MiB of source PNGs. It refuses a server response that would download the full 39 GB shard. WebP encoder differences can change hashes: use the recorded encoder environment rather than accepting a silent asset replacement. The default `--check` never accesses the network.

The [shipped notice](../../public/boards/one-million-faces-v1/NOTICE.txt) retains source credit and the declared MIT terms. The upstream repository has no separate LICENSE or copyright notice at this revision; preserve that provenance rather than asserting a verified chain of rights. Revisit licensing and any necessary pack permissions before a future commercial launch.

## Adding future boards

`src/game/boards.ts` is the UI catalog. `private.board_catalog` is the server allowlist; an arbitrary client ID cannot activate a board. All current packs are free, and no purchase, subscription, checkout, or entitlement system is implemented.

Use new stable board and asset version IDs for future packs. Add an additive SQL migration, client definition, source/license metadata and reviewed images together. Server selection copies the definitions into `public.game_characters` once per game; preserve old assets and renderers so stored rounds remain readable. Any future monetization should add server-side entitlement checks at creation/matchmaking, without trusting purchase flags sent by a client.
