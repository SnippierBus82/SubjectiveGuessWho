# 72-character 3D portrait generation kit

This kit supplies prompts and metadata for generating the artwork outside this workspace. It contains **72 character briefs and 72 complete copy/paste prompts**, not 72 generated images. None of these records is approved or installed in the game yet.

## Generate the images

1. Start with the six pilots: `sgw-001` Amara, `sgw-002` Milo, `sgw-003` Cleo, `sgw-004` Hugo, `sgw-005` Priya, and `sgw-006` Felix.
2. Open the matching file in [prompts/](prompts/), copy its entire contents into your image generator, and generate **one portrait**. Every prompt already includes the common style, that character's features, framing and filename. Do not ask for a grid of 72 faces.
3. Review the six together and at phone-card size before producing the remaining 66. Choose an approved portrait as the shared style reference. Give subsequent generations that same reference and tell the tool to match its style, not its face.
4. Export one PNG per character, ideally **1024 × 1152 pixels** (8:9 portrait). Keep the entire hair/hat and approximately 8% headroom; show both shoulders and upper chest. Generate at the same framing and lighting throughout.
5. Save files in [images/](images/) with exactly the ID filename: `sgw-001.png`, `sgw-002.png`, …, `sgw-072.png`. If your tool saves arbitrary names, rename them after export. Renaming a JPEG to `.png` does not convert it; export PNG properly.

[STYLE_PROMPT.txt](STYLE_PROMPT.txt) is the reusable master template. The per-character prompt files have its placeholders filled in. [HANDOFF_PROMPT.txt](HANDOFF_PROMPT.txt) is an optional starting instruction for an external assistant that can read the attached manifest and master template.

## Files and source of truth

| File                     | Purpose                                                                                             |
| ------------------------ | --------------------------------------------------------------------------------------------------- |
| `characters.json`        | Canonical editable manifest: IDs, names, briefs, requested traits, observed traits and review state |
| `characters.csv`         | Spreadsheet view of the requested character designs; generated from the JSON                        |
| `characters.schema.json` | JSON Schema documenting the complete metadata structure                                             |
| `STYLE_PROMPT.txt`       | Shared art direction and single-image output instructions                                           |
| `prompts/sgw-NNN.txt`    | 72 ready-to-use prompts, one per image                                                              |
| `images/sgw-NNN.png`     | Your externally generated originals, initially absent and ignored by Git                            |

Edit **characters.json** to change a design. Regenerate the prompts and CSV from the repository root:

```sh
node scripts/portrait-kit.mjs
node scripts/portrait-kit.mjs --check
```

The script makes no image-generation or network calls. `--check` verifies the inventory, identities, filenames, metadata states, and that the exported prompts/CSV match the JSON. It does not evaluate artwork quality or certify that the pictures match the brief.

## Metadata: requested is not observed

Each character has **two separate trait objects**:

- `intendedTraits` is the design request. It can be written before any image exists and is what the prompt asks for.
- `observedTraits` describes the finished image after inspection. It starts as `null`. Do not fill it by blindly copying the requested traits. If glasses, colours, jewellery, or facial details differ in the result, regenerate the image or record the actual visible result for review.

For example, if Milo was requested with round brass glasses but the output has no glasses, his `intendedTraits.glasses` still records the request. The eventual `observedTraits.glasses` must record `{"style":"none","color":null}`. He is not ready for approval until that difference is deliberately accepted or fixed.

### Required identity and production fields

| Field            | Meaning / how to fill it                                                                                                       |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `id`             | Permanent identity such as `sgw-002`; never recycle it for another character                                                   |
| `name`           | Display name, kept associated with this character                                                                              |
| `fileName`       | Exact exported PNG filename; must equal the ID plus `.png`                                                                     |
| `brief`          | Short character and expression direction, not a factual personality profile                                                    |
| `intendedTraits` | Requested appearance, already provided for all 72 records                                                                      |
| `observedTraits` | The same structured fields, completed only after viewing the image                                                             |
| `altText`        | Concise accessible description of the actual approved portrait; initially `null`                                               |
| `generation`     | Actual tool/model, supported seed, approved reference ID and generation timestamp; unknown or unsupported values remain `null` |
| `image`          | Actual PNG width, height and SHA-256 checksum, obtained from the file rather than guessed by an image model                    |
| `review`         | Reviewer, ISO timestamp and notes about the result or intentional deviations                                                   |

Accessory fields use `{"style":"none","color":null}` when absent. An empty string means neither unknown nor absent: use `null` for unknown fields, and `none` explicitly for an inspected absence. An empty `skinDetails` array means no such details are visible. Hair colour/texture can be `null` for a bald/shaved head. Keep colours descriptive and consistent (`dark-brown`, `silver-grey`, `navy`) rather than inventing lighting-dependent hex codes.

Age bands are approximate visual design descriptors, not exact age measurements. Presentation and expressions guide styling. Appearance metadata can help vary board composition and supply accessible descriptions; **players still decide subjective answers themselves**.

### Status workflow

| Status      | What it establishes                                                                                                                                              |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `planned`   | Brief/prompt exists. Image and appearance have not been verified. This is the current state of all 72 records.                                                   |
| `generated` | An image file exists; its real dimensions and checksum have been recorded. Appearance review may still be incomplete.                                            |
| `verified`  | A reviewer inspected the image, filled `observedTraits` and accurate `altText`, and recorded their name/date. This does not itself approve the artistic quality. |
| `approved`  | The verified portrait also passes visual review as part of the coherent cast and at actual phone-card size.                                                      |

Only approved portraits should enter the future game catalog. Do not mark a whole batch approved just because filenames and image dimensions are valid.

## What to return with the artwork

Return the PNG files using their ID filenames and the `characters.json` manifest. Preserve `intendedTraits` as the original brief. Leave unknown metadata `null` rather than making up tool details, seeds, checksums, or observations. You can return just the images with the unchanged planned manifest if you want the visual metadata review to happen during import.

For a portable handoff, put the files in one archive containing `images/sgw-001.png` … `images/sgw-072.png` plus `characters.json`. Source PNGs in this workspace are ignored by Git; archive them separately. Optimized web assets will be produced and integrated after review. The current game renderer and database have not been switched to this unfinished catalog.

The two Amara explorations generated before the external-generation handoff remain under `../3d-prototypes/`. They are exploratory references, not automatically approved catalog entries.
