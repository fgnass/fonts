# The catalog of libre families

One JSON file per source, each a list of families. `scripts/libre.py download` builds them; see [docs/LIBRE-FONTS.md](../docs/LIBRE-FONTS.md) for the reasons behind these rules.

## How to add a source

1. Find where the font files are: a GitHub, GitLab or Codeberg repo (best), else a ZIP archive at a stable URL, else direct file URLs.
2. `uv run scripts/libre.py discover <repo-or-zip-url> …` prints proposed entries. Set `GITHUB_TOKEN=$(gh auth token)` for GitHub repos.
3. Check and correct every entry by hand (see the rules below), then add it to `catalog/<source>.json`.
4. `uv run scripts/libre.py check` must print `ok`.

## Rules

- **License:** only the SIL Open Font License (`"license": "OFL-1.1"`). Read the license file (or the license statement of the foundry). Fonts under other licenses (GPL, CC, CUTE, "free for personal use", unclear) are not added. `licenseFile` is the path of the license text in the repo or archive, or `null` when there is none (then the family needs a clear OFL statement on `url`).
- **Reserved Font Names:** `rfn` lists the names that the license reserves ("with Reserved Font Name X" in its copyright lines), else `[]`. With an RFN, the build serves only the unchanged files.
- **Not on Google Fonts:** `discover` and `check` leave out families with the name of a Google family. A family that is on Google Fonts under another name (for example an older version) is not added either.
- **One entry per family, no duplicates across files.** `check` reports duplicates.
- **Static files**, one per style: the app filters and measures them. Prefer OTF, else TTF, else WOFF2/WOFF. An upright variable font of the family goes into `variable` (its path): the specimen shows a slider for each of its axes. `uv run scripts/libre.py find-variable` adds it where the source has one.
- **Variant keys** are the weight (100–900, rounded to a multiple of 100) plus `i` for italic: `"400"`, `"700i"`. The values in the files are often wrong: check the style names in the file names (Thin 100, ExtraLight 200, Light 300, Regular/Book 400, Medium 500, SemiBold/Demi 600, Bold 700, ExtraBold/Heavy 800, Black 900) and that no two styles share a key.
- **Widths are families of their own**, as on Google Fonts: "Sprat Condensed", "Sprat Extended". Use the names the foundry uses. Leave out intermediate steps when a family has more than three widths.
- **Latin only:** the family must have a–z and A–Z. Families for other scripts (also invented alphabets and runes mapped to Latin letters), symbol and icon fonts, and color fonts are not added. `download` checks the default style with HarfBuzz, as the browser shows it: a family with missing or empty letters, or with more than two letters of the same shape, fails.
- **Look at the result.** After `download`, look at every new family in a browser with a sample text: some files are broken in a way that no check finds (letters drawn wrong or not at all). Leave out families with names that do not belong in a public app.
- **Required keys:** `family`, `foundry` (the foundry or collective; the designer's name for individual designers), `designers` (list of names), `license`, `licenseFile`, `rfn`, `url` (the page of the family at the foundry, else the repo), `category` (one of `Sans Serif`, `Serif`, `Display`, `Handwriting`, `Monospace`, by looking at the font), `files`, and the source: `repo` + `rev` (a commit SHA), or `zip` (with `files` as paths in the archive), or neither (then `files` are full URLs).
