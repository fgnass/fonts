# /// script
# requires-python = ">=3.11"
# dependencies = [
#     "fonttools>=4.60",
# ]
# ///
"""Extracts the ligatures of every font.

Usage: uv run scripts/extract-ligatures.py

Reads the GSUB ligature lookups of the default ligature features (liga, clig,
rlig) and of discretionary ligatures (dlig) from data/fonts/ and writes
public/data/ligatures.json: {"<font index>": {"liga": ["ft", ...], "dlig": [...]}}
for fonts that have ligatures made of a-z, A-Z and 0-9.
"""
import json
from fontTools.ttLib import TTFont

FEATURES = {'liga': 'liga', 'clig': 'liga', 'rlig': 'liga', 'dlig': 'dlig'}
CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'

manifest = json.load(open('data/manifest.json'))
out = {}
for index, m in enumerate(manifest):
    try:
        font = TTFont(f"data/fonts/{m['file']}")
    except Exception:
        continue
    if 'GSUB' not in font or not font['GSUB'].table.FeatureList:
        continue
    cmap = font.getBestCmap()
    char_of = {cmap[ord(c)]: c for c in CHARS if ord(c) in cmap}
    gsub = font['GSUB'].table
    found = {'liga': set(), 'dlig': set()}
    for record in gsub.FeatureList.FeatureRecord:
        kind = FEATURES.get(record.FeatureTag)
        if not kind:
            continue
        for li in record.Feature.LookupListIndex:
            for st in gsub.LookupList.Lookup[li].SubTable:
                st = getattr(st, 'ExtSubTable', st)
                for first, ligs in (getattr(st, 'ligatures', None) or {}).items():
                    for lig in ligs:
                        glyphs = [first] + list(lig.Component)
                        if all(g in char_of for g in glyphs):
                            found[kind].add(''.join(char_of[g] for g in glyphs))
    found['dlig'] -= found['liga']
    entry = {k: sorted(v) for k, v in found.items() if v}
    if entry:
        out[index] = entry

json.dump(out, open('public/data/ligatures.json', 'w'), separators=(',', ':'))
liga = sum(1 for e in out.values() if 'liga' in e)
dlig = sum(1 for e in out.values() if 'dlig' in e)
print(f'{len(out)} fonts with ligatures ({liga} default, {dlig} discretionary)')
for word in ['drift']:
    hits = [(manifest[int(i)]['family'], e) for i, e in out.items()
            if any(l in word for l in e.get('liga', []) + e.get('dlig', []))]
    print(word, len(hits), hits[:15])
