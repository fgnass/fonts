# /// script
# requires-python = ">=3.11"
# dependencies = [
#     "fonttools>=4.60",
#     "brotli>=1.1",
# ]
# ///
"""Measures the real width along the wdth axis of variable fonts.

Usage: uv run scripts/measure-width.py

For every family with a wdth axis, downloads the variable font (default
weight and style, the full wdth range, a few letters) as WOFF2 into
data/fonts-wdth/, makes static instances at some points of the axis and
measures the width there as measure.mjs does (mean aspect ratio of
"HONDRBE" to the cap height and of "nohaduebpq" to the x-height). Writes
`wd: [[wdth, width], ...]` into the metric part data/metrics/width.json
(see metrics.mjs).

The CSS API sends variable WOFF2 only to browsers, so the request uses a
browser User-Agent.
"""
import io
import json
import os
import re
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor

from fontTools.pens.boundsPen import BoundsPen
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

LOWER, CAPS = 'nohaduebpq', 'HONDRBE'
OUT = 'data/fonts-wdth'
UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'
POINTS = 5  # instances along the axis

os.makedirs(OUT, exist_ok=True)
manifest = json.load(open('data/manifest.json'))


def get(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': UA})).read()


# The optical size of the subsets, as in scripts/download.mjs.
DISPLAY_OPSZ = 72


def opsz_of(m):
    axis = m.get('axes', {}).get('opsz')
    return min(axis[1], max(axis[0], DISPLAY_OPSZ)) if axis else None


def download(m):
    lo, hi, _ = m['axes']['wdth']
    file = f"{OUT}/{m['file'].replace('.ttf', '.woff2')}"
    if not os.path.exists(file):
        opsz = opsz_of(m)
        # Pinned custom axes (see scripts/download.mjs) come after the registered ones.
        pins = sorted(m.get('pinned', {}).items())
        tags, values = ''.join(f',{t}' for t, _ in pins), ''.join(f',{v:g}' for _, v in pins)
        plain = f"{m['family']}:ital,wdth,wght{tags}@{int(m['italic'])},{lo:g}..{hi:g},{m['weight']}{values}"
        # Some families refuse a single opsz value: they keep their default optical size (see scripts/download.mjs).
        specs = [f"{m['family']}:ital,opsz,wdth,wght{tags}@{int(m['italic'])},{opsz:g},{lo:g}..{hi:g},{m['weight']}{values}", plain] if opsz is not None else [plain]
        for spec in specs:
            css = get('https://fonts.googleapis.com/css2?family=' + urllib.parse.quote(spec) + '&text=' + LOWER + CAPS + 'x').decode()
            src = re.search(r'src:\s*url\(([^)]+)\)', css)
            if src:
                break
        if not src:
            raise RuntimeError('no src in css')
        open(file, 'wb').write(get(src.group(1)))
    return file


def width(font):
    glyphs = font.getGlyphSet()
    cmap = font.getBestCmap()

    def box(ch):
        if ord(ch) not in cmap:
            return None
        pen = BoundsPen(glyphs)
        glyphs[cmap[ord(ch)]].draw(pen)
        return pen.bounds

    cap, x = box('H'), box('x')
    if not cap:
        return None
    ratios = [(b[2] - b[0]) / (cap[3] - cap[1]) for b in map(box, CAPS) if b]
    # Fonts with capitals only have no lowercase proportions of their own.
    if x and x[3] - x[1] < 0.95 * (cap[3] - cap[1]):
        ratios += [(b[2] - b[0]) / (x[3] - x[1]) for b in map(box, LOWER) if b]
    return sum(ratios) / len(ratios) if ratios else None


def measure(i):
    m = manifest[i]
    file = download(m)
    font = TTFont(io.BytesIO(open(file, 'rb').read()))
    lo, hi, _ = m['axes']['wdth']
    out = []
    for k in range(POINTS):
        wdth = lo + (hi - lo) * k / (POINTS - 1)
        static = instantiateVariableFont(font, {'wdth': wdth}, inplace=False)
        w = width(static)
        if w:
            out.append([round(wdth, 1), round(w, 3)])
    return i, out


rows = [{} for _ in manifest]
todo = [i for i, m in enumerate(manifest) if m.get('axes', {}).get('wdth')]
with ThreadPoolExecutor(8) as pool:
    for future in [pool.submit(measure, i) for i in todo]:
        try:
            i, wd = future.result()
            rows[i]['wd'] = wd
        except Exception as e:  # noqa: BLE001
            print('failed:', e)
os.makedirs('data/metrics', exist_ok=True)
json.dump(rows, open('data/metrics/width.json', 'w'), separators=(',', ':'))

for family in ['Roboto', 'Roboto Flex', 'Google Sans Flex', 'Inconsolata', 'Saira', 'Open Sans', 'Archivo']:
    i = next(i for i, m in enumerate(manifest) if m['family'] == family)
    print(family, rows[i].get('wd'))
