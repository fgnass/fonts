# /// script
# dependencies = ["fonttools", "brotli", "uharfbuzz"]
# ///
"""Libre fonts from independent foundries (see docs/LIBRE-FONTS.md).

The catalog is catalog/*.json: one file per source, each a list of families.

uv run scripts/libre.py discover <url> [...]
    Reads the font files of a GitHub, GitLab or Codeberg repo or of a ZIP
    archive and prints proposed catalog entries. Check them by hand: weights,
    widths and italics in the files are often wrong, and category, designers
    and url are not in the files. Families with the name of a Google family
    are left out.

uv run scripts/libre.py find-variable
    Looks for an upright variable file in the source of each family and adds
    it to the catalog as "variable": the specimen of the app shows a slider for
    each of its axes. The static files stay the ones the app filters and measures.

uv run scripts/libre.py check
    Checks the catalog: required keys, licenses, names of Google families and
    families that are in more than one entry.

uv run scripts/libre.py download
    For each family of the catalog: downloads the files into
    data/libre/<slug>/, writes the subsets that the pipeline reads
    (data/fonts/, data/fonts-v/), the web files for the app
    (public/libre/<slug>/, made anew each time) and data/libre.json, the
    manifest entries that scripts/download.mjs adds after the Google families.
"""
import glob
import hashlib
import io
import json
import os
import re
import shutil
import sys
import urllib.parse
import urllib.request
import zipfile

import uharfbuzz as hb

from fontTools import subset
from fontTools.pens.recordingPen import DecomposingRecordingPen
from fontTools.ttLib import TTFont

CATALOG = 'catalog'
DATA = 'data/libre'
WEB = 'public/libre'
LICENSES = {'OFL-1.1'}

# The characters of the pipeline subsets: src/chars.js (CHARS) and scripts/download-variants.mjs (VARIANT_CHARS).
CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789' + 'äöüßÄÖÜ' + '&@?!#$%+*' + '{}§"€'
VARIANT_CHARS = 'HIOabdehlnopqux'
# The characters of the small web file that most preview texts need: ASCII, German letters and typographic
# punctuation. The same characters are in src/fontload.ts (BASE).
BASE_CHARS = ''.join(map(chr, range(0x20, 0x7F))) + 'äöüßÄÖÜ€–—‘’‚“”„…'
# The characters of the second web file: Latin, Greek, Cyrillic, punctuation, currency and letterlike symbols.
# Box drawing, symbols and other scripts would make the files of some families (Iosevka) many times larger.
EXT_RANGES = [(0x0, 0x52F), (0x1E00, 0x1FFF), (0x2000, 0x20CF), (0x2100, 0x218F), (0x2C60, 0x2C7F), (0xA720, 0xA7FF), (0xFB00, 0xFB06)]

WIDTHS = {1: 'Ultra Condensed', 2: 'Extra Condensed', 3: 'Condensed', 4: 'Semi Condensed',
          6: 'Semi Expanded', 7: 'Expanded', 8: 'Extra Expanded', 9: 'Ultra Expanded'}
FONT_FILES = ('.otf', '.ttf', '.woff2', '.woff')


def slug(family):
    """The file name of a family, as in scripts/download.mjs."""
    return re.sub(r'[^a-z0-9]+', '-', family.lower())


def get(url):
    headers = {'User-Agent': 'Mozilla/5.0 (compatible; fonts.gnass.buzz)'}
    if 'api.github.com' in url and os.environ.get('GITHUB_TOKEN'):
        headers['Authorization'] = 'Bearer ' + os.environ['GITHUB_TOKEN']
    return urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=120).read()


class Repo:
    """A repo on GitHub, GitLab or Codeberg at a revision."""

    def __init__(self, url, rev=None):
        parts = urllib.parse.urlparse(url.rstrip('/'))
        self.host, self.path = parts.netloc, parts.path.strip('/')
        if self.host not in ('github.com', 'gitlab.com', 'codeberg.org'):
            raise ValueError('unknown host: ' + self.host)
        self.rev = rev or self.head()

    def head(self):
        if self.host == 'github.com':
            return json.loads(get(f'https://api.github.com/repos/{self.path}/commits/HEAD'))['sha']
        if self.host == 'gitlab.com':
            project = json.loads(get(f'https://gitlab.com/api/v4/projects/{urllib.parse.quote(self.path, safe="")}'))
            branch = urllib.parse.quote(project['default_branch'], safe='')
            return json.loads(get(f'https://gitlab.com/api/v4/projects/{project["id"]}/repository/branches/{branch}'))['commit']['id']
        info = json.loads(get(f'https://codeberg.org/api/v1/repos/{self.path}'))
        return json.loads(get(f'https://codeberg.org/api/v1/repos/{self.path}/branches/{info["default_branch"]}'))['commit']['id']

    def files(self):
        if self.host == 'github.com':
            tree = json.loads(get(f'https://api.github.com/repos/{self.path}/git/trees/{self.rev}?recursive=1'))['tree']
            return [t['path'] for t in tree if t['type'] == 'blob']
        if self.host == 'gitlab.com':
            project = urllib.parse.quote(self.path, safe='')
            paths, page = [], 1
            while True:
                items = json.loads(get(f'https://gitlab.com/api/v4/projects/{project}/repository/tree?ref={self.rev}&recursive=true&per_page=100&page={page}'))
                paths += [t['path'] for t in items if t['type'] == 'blob']
                if len(items) < 100:
                    return paths
                page += 1
        tree = json.loads(get(f'https://codeberg.org/api/v1/repos/{self.path}/git/trees/{self.rev}?recursive=true&per_page=10000'))['tree']
        return [t['path'] for t in tree if t['type'] == 'blob']

    def read(self, path):
        quoted = urllib.parse.quote(path)
        if self.host == 'github.com':
            return get(f'https://raw.githubusercontent.com/{self.path}/{self.rev}/{quoted}')
        if self.host == 'gitlab.com':
            return get(f'https://gitlab.com/{self.path}/-/raw/{self.rev}/{quoted}')
        return get(f'https://codeberg.org/{self.path}/raw/commit/{self.rev}/{quoted}')


class Archive:
    """A ZIP archive at a URL, downloaded once into data/libre/_archives/."""

    def __init__(self, url):
        file = f'{DATA}/_archives/{hashlib.sha1(url.encode()).hexdigest()[:16]}.zip'
        if not os.path.exists(file):
            os.makedirs(os.path.dirname(file), exist_ok=True)
            data = get(url)
            with open(file, 'wb') as f:
                f.write(data)
        self.zip = zipfile.ZipFile(file)

    def files(self):
        return [n for n in self.zip.namelist() if not n.endswith('/') and '__MACOSX' not in n and not n.rsplit('/', 1)[-1].startswith('._')]

    def read(self, path):
        return self.zip.read(path)


class Urls:
    """Files at their own URLs (an entry without "repo" and "zip")."""

    def read(self, url):
        return get(url)


def source(entry):
    if entry.get('repo'):
        return Repo(entry['repo'], entry['rev'])
    if entry.get('zip'):
        return Archive(entry['zip'])
    return Urls()


def reserved_names(text):
    """The Reserved Font Names in the copyright header of an OFL text."""
    header = text.split('This Font Software is licensed', 1)[0]
    return [n.strip() for n in re.findall(r'Reserved\s+Font\s+Names?\s*:?\s*["“]?([^"”,.\n]+)', header)]


def variant_key(font):
    """The variant key as in the manifest: weight class plus "i" for italic, e.g. "700i"."""
    italic = font['OS/2'].fsSelection & 1 or font['head'].macStyle & 2 or font['post'].italicAngle != 0
    return f"{font['OS/2'].usWeightClass}{'i' if italic else ''}"


def google_families():
    """The names of all Google Fonts families (cached in data/google-families.json)."""
    file = 'data/google-families.json'
    if not os.path.exists(file):
        meta = json.loads(get('https://fonts.google.com/metadata/fonts'))
        with open(file, 'w') as f:
            json.dump(sorted(m['family'] for m in meta['familyMetadataList']), f)
    return {re.sub(r'[^a-z0-9]', '', n.lower()) for n in json.load(open(file))}


def discover(url):
    if url.lower().split('?')[0].endswith('.zip'):
        src, base = Archive(url), {'zip': url}
    else:
        src = Repo(url)
        base = {'repo': url.rstrip('/'), 'rev': src.rev}
    paths = src.files()
    fonts = [p for p in paths if p.lower().endswith(FONT_FILES)]
    # One format per style: OTF, else TTF, else the web formats.
    stems = {}
    for p in sorted(fonts, key=lambda p: FONT_FILES.index('.' + p.lower().rsplit('.', 1)[1])):
        stems.setdefault(p.rsplit('.', 1)[0].lower().replace('webfonts/', '').replace('webfont/', '').replace('web/', ''), p)
    licenses = [p for p in paths if re.fullmatch(r'(LICEN[CS]E|OFL|COPYING)[^/]*', p.rsplit('/', 1)[-1], re.I)]
    license_text = src.read(licenses[0]).decode('utf-8', 'replace') if licenses else ''
    google = google_families()
    families = {}
    for path in stems.values():
        try:
            font = TTFont(io.BytesIO(src.read(path)), lazy=True)
            if 'fvar' in font:
                print(f'skipped variable font {path}', file=sys.stderr)
                continue
            name = font['name'].getBestFamilyName()
            width = font['OS/2'].usWidthClass
            key = variant_key(font)
            mono = bool(font['post'].isFixedPitch)
        except Exception as e:  # noqa: BLE001
            print(f'skipped {path}: {e!r}', file=sys.stderr)
            continue
        family = name + (' ' + WIDTHS[width] if width in WIDTHS and WIDTHS[width] not in name else '')
        if re.sub(r'[^a-z0-9]', '', family.lower()) in google:
            print(f'skipped {family}: a Google family', file=sys.stderr)
            continue
        entry = families.setdefault(family, {
            'family': family, 'foundry': '', 'designers': [],
            'license': 'OFL-1.1' if 'Open Font License' in license_text else '?',
            'licenseFile': licenses[0] if licenses else None,
            'rfn': reserved_names(license_text),
            'url': '', **base,
            'category': 'Monospace' if mono else '?',
            'files': {},
        })
        if key in entry['files']:
            print(f'{family}: {path} has the same variant {key} as {entry["files"][key]}', file=sys.stderr)
            continue
        entry['files'][key] = path
    for entry in families.values():
        entry['files'] = dict(sorted(entry['files'].items(), key=lambda kv: (kv[0].endswith('i'), int(kv[0].rstrip('i')))))
    return list(families.values())


def load_catalog():
    """All entries of catalog/*.json, with the file each comes from."""
    entries = []
    for file in sorted(glob.glob(f'{CATALOG}/*.json')):
        entries += [dict(e, _file=file) for e in json.load(open(file))]
    return entries


def check(entries):
    """Problems of the catalog, as messages."""
    problems = []
    google = google_families()
    seen = {}
    for e in entries:
        where = f"{e['_file']}: {e.get('family')}"
        for key in ('family', 'foundry', 'designers', 'license', 'rfn', 'url', 'category', 'files'):
            if key not in e:
                problems.append(f'{where}: no "{key}"')
        if e.get('license') not in LICENSES:
            problems.append(f'{where}: license {e.get("license")}')
        if e.get('repo') and not e.get('rev'):
            problems.append(f'{where}: repo without "rev"')
        if not e.get('files'):
            problems.append(f'{where}: no files')
        for key in e.get('files', {}):
            if not re.fullmatch(r'[1-9]00i?', key):
                problems.append(f'{where}: variant key {key}')
        if e.get('category') not in ('Sans Serif', 'Serif', 'Display', 'Handwriting', 'Monospace'):
            problems.append(f'{where}: category {e.get("category")}')
        name = re.sub(r'[^a-z0-9]', '', e.get('family', '').lower())
        if name in google:
            problems.append(f'{where}: a Google family')
        if slug(e.get('family', '')) in seen:
            problems.append(f'{where}: also in {seen[slug(e["family"])]}')
        seen[slug(e.get('family', ''))] = e['_file']
    return problems


def fetch(src, path, file):
    if not os.path.exists(file):
        data = src.read(path)
        with open(file, 'wb') as f:
            f.write(data)
    return file


def write_subset(source, chars, out, flavor=None, unicodes=()):
    """A subset with all OpenType features and names (for the pipeline), or for the web: with the default
    features, without hinting, and with the names that identify the font, its copyright and its license."""
    font = TTFont(source)
    options = subset.Options()
    # Some fonts have a BASE table that fontTools cannot read; nothing here needs it.
    options.drop_tables += ['BASE']
    if flavor:
        options.name_IDs = [0, 1, 2, 3, 4, 5, 6, 13, 14]
        options.hinting = False
    else:
        options.layout_features = ['*']
        options.name_IDs = ['*']
        options.name_languages = ['*']
    options.notdef_outline = True
    options.flavor = flavor
    subsetter = subset.Subsetter(options)
    subsetter.populate(text=chars, unicodes=unicodes)
    subsetter.subset(font)
    font.flavor = flavor
    font.save(out)


def letter_problems(file):
    """What is wrong with a–z and A–Z of a font, shaped with the default OpenType features as in the browser:
    missing or empty letters, or more than two letters with the same outline (u = v or i = j in historical
    designs are fine; a capital as its lowercase in caps-only fonts too)."""
    font = TTFont(file, lazy=True)
    glyphs, order = font.getGlyphSet(), font.getGlyphOrder()
    with open(file, 'rb') as f:
        shaper = hb.Font(hb.Face(f.read()))
    missing, shapes = [], {}
    for ch in 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ':
        buf = hb.Buffer()
        buf.add_str(ch)
        buf.guess_segment_properties()
        hb.shape(shaper, buf)
        pen = DecomposingRecordingPen(glyphs)
        for info in buf.glyph_infos:
            if info.codepoint:
                glyphs[order[info.codepoint]].draw(pen)
        if not any(op in ('lineTo', 'curveTo', 'qCurveTo') for op, _ in pen.value):
            missing.append(ch)
            continue
        shapes.setdefault(repr(pen.value), set()).add(ch.lower())
    same = [''.join(sorted(s)) for s in shapes.values() if len(s) > 2]
    return ', '.join(([f'no {"".join(missing)}'] if missing else []) + [f'same {s}' for s in same])


def pick_variant(variants):
    """The style closest to regular, as pickVariant in scripts/download.mjs."""
    upright = [int(v) for v in variants if not v.endswith('i')]
    if upright:
        return min(upright, key=lambda w: abs(w - 400)), False
    return int(variants[0].rstrip('i')), True


def build(entry):
    """Downloads one family and writes its files. Returns its manifest entry."""
    family, name = entry['family'], slug(entry['family'])
    src = source(entry)
    data, web = f'{DATA}/{name}', f'{WEB}/{name}'
    os.makedirs(data, exist_ok=True)
    os.makedirs(web, exist_ok=True)
    # Subsets are modified versions under the OFL: not allowed under a Reserved Font Name without permission.
    may_subset = not entry['rfn'] or entry.get('subset') == 'permitted'
    files, formats = {}, set()
    for key, path in entry['files'].items():
        ext = path.split('?')[0].rsplit('.', 1)[-1].lower()
        files[key] = fetch(src, path, f'{data}/{key}.{ext}')
        write_subset(files[key], VARIANT_CHARS, f'data/fonts-v/{name}-{key}.ttf')
        if may_subset:
            write_subset(files[key], BASE_CHARS, f'{web}/{key}-base.woff2', 'woff2')
            write_subset(files[key], '', f'{web}/{key}-ext.woff2', 'woff2', [c for lo, hi in EXT_RANGES for c in range(lo, hi + 1)])
        else:
            # The unchanged file of the foundry: its woff2 file when there is one next to the source.
            woff2 = path.rsplit('.', 1)[0] + '.woff2'
            try:
                fetch(src, woff2, f'{web}/{key}-full.woff2')
                formats.add('woff2')
            except Exception:  # noqa: BLE001
                with open(files[key], 'rb') as a, open(f'{web}/{key}-full.{ext}', 'wb') as b:
                    b.write(a.read())
                formats.add(ext)
    if len(formats) > 1:
        raise ValueError(f'web files in several formats: {formats}')
    if entry.get('licenseFile'):
        license_file = fetch(src, entry['licenseFile'], f'{data}/LICENSE.txt')
        with open(license_file, 'rb') as a, open(f'{web}/LICENSE.txt', 'wb') as b:
            b.write(a.read())
    variants = list(entry['files'])
    weight, italic = pick_variant(variants)
    default = f"{weight}{'i' if italic else ''}"
    write_subset(files[default], CHARS, f'data/fonts/{name}.ttf')
    # The catalog rules ask for a–z and A–Z; a family without them would show gaps in every preview.
    problems = letter_problems(f'data/fonts/{name}.ttf')
    if problems:
        raise ValueError(problems)
    libre = {
        'foundry': entry['foundry'],
        'designers': entry['designers'],
        'license': entry['license'],
        'url': entry['url'],
        'dir': name,
        'subset': may_subset,
    }
    if formats - {'woff2'}:
        libre['format'] = formats.pop()
    if entry.get('variable'):
        libre['variable'] = build_variable(src, entry['variable'], data, web, may_subset)
    return {
        'family': family,
        'category': entry['category'],
        'weight': weight,
        'italic': italic,
        'variants': variants,
        'file': name + '.ttf',
        'full': files[default],
        'libre': libre,
    }


def build_variable(src, path, data, web, may_subset):
    """The web file of the variable font for the specimen: its format and its axes."""
    ext = path.split('?')[0].rsplit('.', 1)[-1].lower()
    file = fetch(src, path, f'{data}/variable.{ext}')
    axes = {a.axisTag: [round(a.minValue, 3), round(a.maxValue, 3), round(a.defaultValue, 3)] for a in TTFont(file, lazy=True)['fvar'].axes}
    if may_subset:
        write_subset(file, '', f'{web}/variable.woff2', 'woff2', [c for lo, hi in EXT_RANGES for c in range(lo, hi + 1)])
        ext = 'woff2'
    else:
        with open(file, 'rb') as a, open(f'{web}/variable.{ext}', 'wb') as b:
            b.write(a.read())
    return {'format': ext, 'axes': axes}


# File names that variable fonts usually have: Family[wght].ttf, Family-VF.ttf, FamilyVF.ttf, FamilyVariable.ttf, FamilyGX.ttf.
VARIABLE_NAME = re.compile(r'variable|\[|(^|[^a-z])vf([^a-z]|$)|vf\.|gx|var\.', re.I)


def find_variable():
    """Adds the upright variable file of each family to the catalog, where its source has one."""
    catalog = {file: json.load(open(file)) for file in sorted(glob.glob(f'{CATALOG}/*.json'))}
    by_source = {}
    for entries in catalog.values():
        for e in entries:
            key = (e['repo'], e['rev']) if e.get('repo') else e.get('zip')
            if key and not e.get('variable'):
                by_source.setdefault(key, []).append(e)
    found = 0
    for entries in by_source.values():
        try:
            src = source(entries[0])
            candidates = [p for p in src.files() if p.lower().endswith(FONT_FILES) and VARIABLE_NAME.search(p.rsplit('/', 1)[-1])]
            # OTF and TTF before the web formats.
            candidates.sort(key=lambda p: FONT_FILES.index('.' + p.lower().rsplit('.', 1)[1]))
            variable = {}
            for path in candidates:
                if 'italic' in path.lower():
                    continue
                font = TTFont(io.BytesIO(src.read(path)), lazy=True)
                if 'fvar' in font and not font['post'].italicAngle:
                    variable.setdefault(font['name'].getBestFamilyName(), path)
        except Exception as ex:  # noqa: BLE001
            print(f"{entries[0]['family']}: {ex!r}", file=sys.stderr)
            continue
        for e in entries:
            # The variable font of a family also serves its widths ("Sprat Condensed" from "Sprat").
            path = variable.get(e['family']) or next((p for n, p in variable.items() if e['family'].startswith(n + ' ')), None)
            if path:
                e['variable'] = path
                found += 1
                print(f"{e['family']}: {path}")
    for file, entries in catalog.items():
        with open(file, 'w') as f:
            json.dump(entries, f, indent=1, ensure_ascii=False)
            f.write('\n')
    print(f'{found} variable files')


def download():
    entries = load_catalog()
    problems = check(entries)
    if problems:
        sys.exit('\n'.join(problems))
    shutil.rmtree(WEB, ignore_errors=True)
    manifest, failed = [], []
    for entry in entries:
        try:
            manifest.append(build(entry))
        except Exception as e:  # noqa: BLE001
            failed.append(entry['family'])
            print(f"{entry['family']}: {e!r}", file=sys.stderr)
    with open('data/libre.json', 'w') as f:
        json.dump(manifest, f, indent=1, ensure_ascii=False)
    print(f'{len(manifest)} libre families' + (f', {len(failed)} failed: {", ".join(failed)}' if failed else ''))


if __name__ == '__main__':
    os.makedirs('data/fonts', exist_ok=True)
    os.makedirs('data/fonts-v', exist_ok=True)
    command, args = sys.argv[1] if len(sys.argv) > 1 else '', sys.argv[2:]
    if command == 'discover' and args:
        print(json.dumps([e for url in args for e in discover(url)], indent=1, ensure_ascii=False))
    elif command == 'find-variable':
        find_variable()
    elif command == 'check':
        problems = check(load_catalog())
        print('\n'.join(problems) or 'ok')
        sys.exit(1 if problems else 0)
    elif command == 'download':
        download()
    else:
        sys.exit(__doc__)
