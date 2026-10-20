# /// script
# requires-python = ">=3.11"
# dependencies = [
#     "fonttools>=4.60",
# ]
# ///
"""Technical statistics of every family, from the full font files.

Usage: uv run scripts/tech.py [family ...]   (with families: only print their values)

The files in data/fonts/ are subsets, which lack most OpenType features, so
this script reads the full file of each family from Google Fonts: the one
variable upright file, else the regular static file. It downloads only the
parts it needs with HTTP range requests (the table directory, then the maxp,
fvar, GSUB and GPOS tables), not the whole file. Writes
public/data/tech.json, one entry per family in manifest order (null when the
file could not be read):

  g: number of glyphs
  f: OpenType feature tags (GSUB and GPOS), sorted
  l: number of ligatures (in liga, clig, rlig and dlig)
  a: variable axis tags, sorted (empty for static fonts)
  c: 1 for color fonts, 0 otherwise

Results per family are kept in data/tech/, so a second run only fetches the
missing ones.
"""
import json
import os
import struct
import sys
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor

from fontTools.ttLib import TTFont, newTable

CACHE = 'data/tech'
LIGATURE_FEATURES = {'liga', 'clig', 'rlig', 'dlig'}
TABLES = ['maxp', 'fvar', 'GSUB', 'GPOS']
COLOR_TABLES = {'COLR', 'SVG ', 'CBDT', 'sbix'}

os.makedirs(CACHE, exist_ok=True)
manifest = json.load(open('data/manifest.json'))


def get(url, start=None, end=None):
    headers = {'User-Agent': 'Mozilla/5.0'}
    if start is not None:
        headers['Range'] = f'bytes={start}-{end}'
    response = urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=60)
    data = response.read()
    # Some files come whole (status 200) instead of the requested range.
    if start is not None and response.status == 200:
        data = data[start:end + 1]
    return data


def font_url(m):
    """URL of the full file: the variable upright file, else the regular (or closest upright) static file."""
    data = get('https://fonts.google.com/download/list?family=' + urllib.parse.quote(m['family']))
    refs = json.loads(data[data.index(b'{'):])['manifest']['fileRefs']
    files = [r for r in refs if r['filename'].endswith(('.ttf', '.otf'))]
    upright = [r for r in files if 'italic' not in r['filename'].lower()] or files
    variable = [r for r in upright if 'VariableFont' in r['filename']]
    if variable:
        return variable[0]['url']
    regular = [r for r in upright if r['filename'].rsplit('-', 1)[-1].split('.')[0] == 'Regular']
    return (regular or upright)[0]['url']


def read_tables(url):
    """The wanted tables of a remote font file, decompiled, with placeholder glyph names."""
    head = get(url, 0, 1023)
    num_tables = struct.unpack('>H', head[4:6])[0]
    if 12 + 16 * num_tables > len(head):
        head = get(url, 0, 12 + 16 * num_tables - 1)
    directory = {}
    for i in range(num_tables):
        tag, _, offset, length = struct.unpack('>4sIII', head[12 + 16 * i:28 + 16 * i])
        directory[tag.decode('latin-1')] = (offset, length)
    font = TTFont()
    # Presence alone identifies color fonts; their potentially large tables need not be downloaded.
    for tag in COLOR_TABLES & directory.keys():
        font[tag] = newTable(tag)
    raw = {tag: get(url, *(lambda o, n: (o, o + n - 1))(*directory[tag])) for tag in TABLES if tag in directory and directory[tag][1]}
    maxp = newTable('maxp')
    maxp.decompile(raw['maxp'], font)
    font['maxp'] = maxp
    font.setGlyphOrder([f'g{i}' for i in range(maxp.numGlyphs)])
    for tag in TABLES[1:]:
        if tag in raw:
            table = newTable(tag)
            table.decompile(raw[tag], font)
            font[tag] = table
    return font


def stats(font):
    features, ligatures = set(), 0
    for tag in ['GSUB', 'GPOS']:
        if tag not in font or not font[tag].table.FeatureList:
            continue
        table = font[tag].table
        features |= {r.FeatureTag for r in table.FeatureList.FeatureRecord}
        if tag != 'GSUB':
            continue
        lookups = {i for r in table.FeatureList.FeatureRecord if r.FeatureTag in LIGATURE_FEATURES for i in r.Feature.LookupListIndex}
        for i in lookups:
            for st in table.LookupList.Lookup[i].SubTable:
                st = getattr(st, 'ExtSubTable', st)
                ligatures += sum(len(v) for v in (getattr(st, 'ligatures', None) or {}).values())
    axes = sorted(a.axisTag for a in font['fvar'].axes) if 'fvar' in font else []
    return {'g': font['maxp'].numGlyphs, 'f': sorted(features), 'l': ligatures, 'a': axes,
            'c': int(bool(COLOR_TABLES & set(font.keys())))}


def measure(i):
    m = manifest[i]
    cache = f"{CACHE}/{m['file'].replace('.ttf', '.json')}"
    if os.path.exists(cache):
        result = json.load(open(cache))
        if 'c' in result:
            return i, result
        # Older caches lack color metadata. The local subsets retain the color tables.
        local = f"data/fonts/{m['file']}"
        if os.path.exists(local):
            with TTFont(local, lazy=True) as font:
                result['c'] = int(bool(COLOR_TABLES & set(font.keys())))
            json.dump(result, open(cache, 'w'))
            return i, result
    result = stats(read_tables(font_url(m)))
    json.dump(result, open(cache, 'w'))
    return i, result


names = sys.argv[1:]
if names:
    for name in names:
        i = next(i for i, m in enumerate(manifest) if m['family'] == name)
        print(name, measure(i)[1])
    sys.exit()

out = [None] * len(manifest)
failed = 0
with ThreadPoolExecutor(16) as pool:
    futures = [pool.submit(measure, i) for i in range(len(manifest))]
    i_of = {f: i for i, f in enumerate(futures)}
    for n, future in enumerate(futures):
        try:
            i, result = future.result()
            out[i] = result
        except Exception as e:  # noqa: BLE001
            failed += 1
            print(f'\nfailed: {manifest[i_of[future]]["family"]}: {e!r}')
        if sys.stdout.isatty():
            print(f'\r{n + 1}/{len(manifest)}', end='', flush=True)
json.dump(out, open('public/data/tech.json', 'w'), separators=(',', ':'))
print(f'\n{len(manifest) - failed} families, {failed} failed')
