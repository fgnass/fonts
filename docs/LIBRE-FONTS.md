# Libre fonts beyond Google Fonts

Status: implemented, with about 800 families from 23 sources (catalog/*.json).

## Goal

Besides Google Fonts, the app shows libre fonts that are not on Google Fonts, so that people find them and their foundries and designers get more visibility.

| Source | Families | Notes |
|---|---|---|
| [Font Library](https://fontlibrary.org/) | about 400 | OFL families only; copies of Google families left out, also under other names (compared by rendering) |
| [Use & Modify](https://usemodify.com/) | about 115 | a directory; entries name the foundry of each family |
| [Velvetyne](https://velvetyne.fr/) | 53 | GitLab and designers' repos, Degheest collection |
| [Typothèque ESA Le 75](https://www.esa-le75.be/) | 30 | student fonts |
| [Fontsource](https://fontsource.org/) | 28 | the families that are not on Google Fonts |
| [Dasick Fonts](https://github.com/nervousattack) | 26 | experimental display fonts |
| [Collletttivo](https://www.collletttivo.it/typefaces/) | 24 | |
| [Tunera](https://www.tunera.xyz/), [OSP](https://osp.kitchen/foundry/) | 19 each | |
| X Cicéro, ANRT, Luuse, Fond de riz, The League of Moveable Type, Indestructible Type, Dot Colon, Republish, myfffonts, Studio MuchoGusto, Libre fonts by womxn, Omnibus-Type, Fontain | 1–18 each | |

Not added: Bye Bye Binary (all fonts under CUTE or OIFL), fonderie.download (WTFPL), and sources whose fonts may not be shared on or are free for personal use only (for example Fontshare, Dinamo, Atipo).

**Licenses:** only the SIL Open Font License for now (decided 2026-10-23). CUTE (Bye Bye Binary) adds use conditions and a donation scale to the free license, so it is not included. Simple permissive licenses (CC0, MIT, Apache, WTFPL) can come later.

## 1. The catalog

Hand-maintained files in git: `catalog/<source>.json`, one per source, each a list of families. [catalog/README.md](../catalog/README.md) has the rules for new entries. One entry:

```json
{
  "family": "Ronzino",
  "foundry": "Collletttivo",
  "designers": ["Luigi Gorlero", "Nunzio Mazzaferro"],
  "license": "OFL-1.1",
  "licenseFile": "LICENSE.txt",
  "rfn": [],
  "url": "https://www.collletttivo.it/typefaces/ronzino",
  "repo": "https://github.com/collletttivo/ronzino",
  "rev": "<commit sha>",
  "category": "Sans Serif",
  "files": {
    "400": "fonts/Ronzino-Regular.otf",
    "400i": "fonts/Ronzino-Oblique.otf",
    "700": "fonts/Ronzino-Bold.otf"
  }
}
```

- `files` uses the variant keys of the manifest (`"400"`, `"700i"`): one static file per style, which the filters and measurements use. Variable files can have axis values outside the CSS ranges (for example `wght` 10–200 in Sprat), so they serve only the specimen: `variable` is the path of the upright variable font, whose axes get sliders there (about 45 families).
- Widths are families of their own, as on Google Fonts ("Sprat Condensed", "Sprat Extended").
- `rev` pins a commit, so that a build is reproducible and a change in the repo does not move the index.
- `rfn`: the Reserved Font Names of the license (see section 3). `"subset": "permitted"` marks a foundry's permission for web subsets in spite of an RFN.
- `category` uses the Google categories (`Sans Serif`, `Serif`, `Display`, `Handwriting`, `Monospace`). It is set by hand. The app shows it only in the specimen.
- `family` must not be the name of a Google family: `scripts/download.mjs` stops with an error.

`uv run scripts/libre.py discover <repo-url> …` proposes entries: it reads the file tree through the GitHub, GitLab or Codeberg API, the names, weights and widths from the `name` and `OS/2` tables, and the Reserved Font Names from the license. **Check the proposal by hand.** In the pilot, several files had wrong values (for example two weights with weight class 400, or wrong width classes), and category, designers and url are not in the files. The `METADATA.yml` files of Velvetyne are not reliable either (the Ouroboros file has a merge conflict).

## 2. Pipeline

`uv run scripts/libre.py download` (part of `make download`). For each catalog entry it:

1. downloads the files at `rev` into `data/libre/<slug>/` (cached),
2. writes the subset for `src/chars.js` to `data/fonts/<slug>.ttf`, with all OpenType features, like the Google subsets,
3. writes the variant subsets to `data/fonts-v/<slug>-<variant>.ttf` (the cache that `download-variants.mjs` checks first),
4. writes the web files and the license to `public/libre/<slug>/` (see section 3),
5. checks a–z and A–Z of the default style (see catalog/README.md),
6. writes `data/libre.json`: the manifest entries, with `libre` (foundry, designers, license, url, dir, subset) and `full` (the full file of the default style, for `tech.py`).

`scripts/download.mjs` adds the entries of `data/libre.json` after the Google families. Known families keep their position, so the existing index and embeddings stay valid. `embed.mjs --only` grows its files for families added at the end, so only the new families need the slow skeleton features. `tech.py` reads the full file from disk for libre families.

## 3. Loading the fonts in the app

Google Fonts makes a subset for each text. For libre fonts there is no such service, so we host the files on our site (`public/libre/`, served by GitHub Pages; about 160 MB for all families, most of it the unchanged files of families with a Reserved Font Name). A CDN is no option for all foundries: jsDelivr works only for GitHub, not for GitLab and Codeberg.

**Two files per style, with `unicode-range`.** Without per-text subsets, the browser would load the whole file for each tile (15–60 KB for the Collletttivo fonts). So there are two files per style:

1. `<variant>-base.woff2`: ASCII, German letters and typographic punctuation (usually 8–25 KB),
2. `<variant>-ext.woff2`: the other Latin, Greek and Cyrillic characters, punctuation, currency and letterlike symbols. Box drawing, symbols and other scripts are left out: they made the files of some families (Iosevka) many times larger. The browser shows such characters in a fallback font.

Both have the default OpenType features only and no hinting. `src/fontload.ts` adds both as `FontFace` objects with the same alias: the base file with its characters as `unicode-range`, the ext file with all other characters. The browser loads only the faces whose `unicode-range` the text touches. One alias per style serves all texts.

**Subsets and the OFL.** A subset is a "Modified Version" under the OFL. This is a problem only if the license declares a Reserved Font Name (RFN): then a modified version must not use that name. For families without an RFN, the build makes the subsets and publishes the license with them. For families with an RFN, the app loads only the unchanged file of the foundry (`<variant>-full.<format>`, its woff2 file when there is one), until the foundry gives permission for web subsets (the OFL FAQ suggests to ask). No Collletttivo family has an RFN. Some Velvetyne families have one (Ouroboros, Basteleur, Mourier).

The subsets in `data/` are only for our measurements and are not published.

## 4. UI

- `SourceLink` (was `GoogleFontsLink`): "Google Fonts" for Google families, the foundry name for libre families, with a link to `url`.
- Specimen: rows for Foundry, Designer and License.
- "Show fonts from" Everywhere · Google Fonts · Elsewhere, on the start page and in the toolbar (metric `elsewhere`).
- Specimen: a slider for each axis of the variable font of the family (`variable` in the catalog).
- Browse order (`browseOrder` in `src/groups.ts`): no popularity any more, because popularity hides libre fonts and unknown Google families alike. The fonts of each look-alike group and the groups are shuffled with a seed, then the groups take turns: first one font from every group, then a second one, and so on. The seed changes per visit. The order does not depend on the filters, so positions stay stable while a slider moves.
- Shape search and similar fonts need no change: the libre fonts are in the same index.

## 5. Maintenance

- Retired fonts (Velvetyne retires fonts from time to time) must leave the catalog when this happens.
- Foundries can report errors in their entries; those with a Reserved Font Name can allow web subsets (`"subset": "permitted"`).
