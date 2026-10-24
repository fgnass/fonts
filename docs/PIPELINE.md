# Pipeline and code

How to build the data and where the code is. For the methods behind the steps and the evaluation, see [METHOD.md](METHOD.md).

## Build

`make` builds everything in `public/data/` that is out of date. It needs Node and [uv](https://docs.astral.sh/uv/). The Python scripts declare their packages in a `# /// script` header, so `uv run` installs them. There is no virtual environment to set up.

- Every step depends on its input data and its own script. After a change to a script, `make` runs that step and all steps after it.
- Shared code (`src/shape.js`, `scripts/glyph.mjs`) is no prerequisite. After a change there, run the steps that use it with `make -W <script>`, for example `make -W scripts/caps.mjs`.
- The downloads and the DINOv2 skeleton embeddings run only when `data/manifest.json` changes. To run them again, remove their stamp file in `data/.stamps/`.
- `make -n` shows what would run.

Each measuring script writes its own part `data/metrics/<part>.json` (one object per font, only its own keys). `scripts/merge-metrics.mjs` joins the parts into `public/data/metrics.json`. So one script can run again without the others.

## Steps

| Step | Script | Output | Time |
|---|---|---|---|
| Download | `scripts/libre.py download`, `scripts/download.mjs` (`make download`) | `data/fonts/`, `data/manifest.json`, `public/libre/` | |
| Skeletons | `scripts/build-index.mjs` (`make index`), uses `scripts/medial.mjs` | `public/data/g/` | ~6 min |
| Stroke ends | `scripts/build-topology.mjs` (part of `make index`) | `public/data/t/` | |
| Skeleton features | `scripts/embed.mjs --skeleton`, `scripts/pack-embeddings.py` (`make embeddings`) | `data/emb-skel/`, `public/data/e/` | ~3 min per character on a CPU |
| Style vectors | `scripts/embed-style.mjs`, `scripts/pack-style.py` | `public/data/style.bin` | ~3 min |
| Weight, slant, x-height, serifs, straightness, width, contrast, ends | `scripts/download-variants.mjs`, `scripts/measure.mjs` (part `base`) | | ~3 min |
| Width along the wdth axis | `scripts/measure-width.py` (part `width`) | | |
| Fonts without real lowercase | `scripts/caps.mjs` (part `caps`) | `lc: 0` | |
| Ornate | `scripts/ornate.mjs` (part `ornate`) | `o` | seconds |
| Aperture, roundness, extenders, serif type, width variation | `scripts/form.mjs` (part `form`) | | ~30 s |
| Stroke fill | `scripts/stroke-fill.mjs` (part `stroke-fill`) | `hf` | |
| Connected | `scripts/connected.mjs` (part `connected`) | `cn` | ~10 s |
| Distinctness | `scripts/distinct.mjs` (part `distinct`) | `dx` | seconds |
| Letter recognition | `scripts/recognize.py` (part `recognize`) | `lr` | ~1 min |
| Glyph count, OpenType features, ligatures, axes, color tables | `scripts/tech.py` | `public/data/tech.json` | ~10 min the first time |
| Ligatures of a–z, A–Z, 0–9 | `scripts/extract-ligatures.py` | `public/data/ligatures.json` | |

Notes on single steps:

- **Download.** A subset of every Latin Google Fonts family at weight 400: a–z, A–Z, 0–9, `ä ö ü ß Ä Ö Ü` and `& @ ? ! # $ % + * { } § " €` (see `src/chars.js`). Families with an optical size axis are downloaded (and so measured) at opsz 72, within their range: the app is for headlines and logos, where the display forms show. The app itself loads the whole opsz range, and the browser sets the optical size for the font size. Custom axes that Google pins to another value than the designers' default (Fraunces: WONK 1) load and are measured at the designers' default (`PINNED` in `scripts/download.mjs`). `make refresh` downloads the files of the families in the manifest again and keeps the manifest.
- **Libre families.** `catalog/*.json` lists libre families from independent foundries, one file per source, with their repo (at a pinned revision) or archive and a file per style (see [LIBRE-FONTS.md](LIBRE-FONTS.md) and [catalog/README.md](../catalog/README.md)). `uv run scripts/libre.py download` downloads them into `data/libre/`, writes the same subsets as for Google families (`data/fonts/`, `data/fonts-v/`) and the web files for the app (`public/libre/`), and writes `data/libre.json`. `scripts/download.mjs` adds these families after the Google families. `uv run scripts/libre.py discover <url>` proposes catalog entries for a repo or ZIP archive, `uv run scripts/libre.py check` checks the catalog.
- **New families.** New families go to the end of the manifest, so the existing rows stay valid. The skeleton features of only the new families: `node scripts/embed.mjs --skeleton --only=Family,Family`, then `touch data/.stamps/emb-skel` and `make`.
- **Removed families.** When families leave the manifest, the rows of the skeleton features after them would belong to the wrong families. `node scripts/remap-embeddings.mjs <old-manifest.json>` puts the rows into the new order and prints the `embed.mjs --only` command for the new families.
- **New characters.** Run only the character steps: `node scripts/build-index.mjs '<chars>'`, `node scripts/build-topology.mjs '<chars>'`, `node scripts/embed.mjs '<chars>' --skeleton` and `uv run scripts/pack-embeddings.py '<chars>'`.
- **Skeletons.** Each character is shaped with HarfBuzz, so default OpenType features apply as in the browser (for example the small caps of "Anton SC"). A glyph whose medial axis fails falls back to raster thinning.
- **Skeleton features.** `node scripts/embed.mjs --skeleton --only=Family,Family` computes only these families and writes their rows into the existing files.
- **Variants.** About 7,500 small files (weight × italic). `node scripts/measure.mjs --keep-variants` measures only the family values again.
- **Width.** For fonts with a wdth axis, the script downloads the variable WOFF2 and makes static instances with fontTools. The CSS API sends variable fonts only to browsers, so it uses a browser User-Agent.
- **Technical statistics.** The subsets in `data/fonts/` lack most OpenType features, so `tech.py` reads the table directory and the maxp, fvar, GSUB and GPOS tables of the full files with HTTP range requests. Results per family are cached in `data/tech/`. Color fonts (COLR, SVG, CBDT or sbix tables) get `c: 1` and are excluded from the app.
- **Inspection.** Most measuring scripts print their values for named families instead of writing: `node scripts/form.mjs <family> …`, `node scripts/connected.mjs <family> …`, `uv run scripts/recognize.py --dry`.

## Deploy

`npm run deploy` builds the site and force-pushes `dist/` as a single commit to the `gh-pages` branch, which GitHub Pages serves at fonts.gnass.buzz (`public/CNAME`). The font data in `public/data/` is not in git, so the site is built locally, after `make`.

## Evaluation

- `uv run eval/attributes.py`: sliders against the crowdsourced attributes of O'Donovan et al. (2014). Expects their `attribute.zip`, unpacked in `data/odonovan/`. Writes `eval/results/attributes.json`.
- `node eval/structure.mjs`: shape search on synthetic sketches. Writes `eval/results/structure.json` and `eval/results/sketches.png`, and caches the hole counts in `data/eval/holes.json`. About a minute. `--sheet` renders only the contact sheet.

`data/eval/` also has older scripts that compare feature layouts and weight invariance (`eval2.py`, with `scripts/download-weights.mjs` and `embed.mjs --weights`) and render contact sheets (`sheet.mjs`).

## Code

Preact with signals, built with Vite, in TypeScript. `npm run check` runs `tsc`. `npm test` runs the unit tests and checks shape regressions on real fonts with the generated index. The scripts in `scripts/` are plain Node modules, except the Python scripts for numerics (NumPy) and font tables (fontTools). `src/shape.js` and `src/chars.js` stay JavaScript, because both the scripts and the app use them.

- `src/data.ts`: loads fonts, metrics, ligatures and style vectors; decides which fonts the app shows.
- `src/sliders.ts`: the slider definitions (scales, names, tooltips, sample letters).
- `src/filter.ts`: filtering by the sliders, the style to show per family, compromise suggestions.
- `src/groups.ts`, `src/groups-worker.ts`: groups of similar-looking fonts (spherical k-means on the style vectors, in a worker).
- `src/samples.ts`: the sample font pairs at the ends of the sliders.
- `src/state.ts`, `src/shape-search.ts`: the app state as signals, the browse and shape-search views.
- `src/search-worker.ts`: the shape search (chamfer distance, stroke ends, skeleton features).
- `src/components/`: the UI.
