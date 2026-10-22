# /// script
# requires-python = ">=3.11"
# dependencies = [
#     "numpy>=2",
#     "scipy>=1.13",
# ]
# ///
"""Compares the measured look metrics with crowdsourced font attributes.

Usage: uv run eval/attributes.py

Reads the attribute scores of O'Donovan et al., "Exploratory Font Selection
Using Crowdsourced Attributes" (SIGGRAPH 2014), from
data/odonovan/attribute/attributeData/estimatedAttributes.csv (unzipped
attribute.zip from https://www.dgp.toronto.edu/~donovan/font/), maps their
200 fonts to our families and styles, and computes the Spearman rank
correlation for pairs of a metric and an attribute where a relation is
expected, plus a few control pairs where none is expected. The 95% CI uses
the Fisher z transform with the Bonett-Wright standard error. Also computes
the ROC AUC (with Hanley-McNeil CI) of the serif metric for the Google Fonts
categories Serif vs Sans Serif over all families.

Writes eval/results/attributes.json.
"""
import csv
import json
import os
import re
import numpy as np
from scipy.stats import rankdata, spearmanr

SRC = 'data/odonovan/attribute/attributeData/estimatedAttributes.csv'
OUT = 'eval/results/attributes.json'

# Their font names that are older names of families on Google Fonts now.
ALIASES = {
    'Muli': 'Mulish',
    'SourceSansPro': 'Source Sans 3',
    'OFLGoudyStMTT': 'Sorts Mill Goudy',
    'Tulpen': 'Tulpen One',
    'GentiumBasic': 'Gentium Plus',
    'Andada': 'Andada Pro',
}

STYLE_WORDS = {
    'extralight': 200, 'semibold': 600, 'regular': 400, 'roman': 400, 'medium': 500,
    'light': 300, 'black': 900, 'bold': 700, 'thin': 100,
    'italic': 'i', 'oblique': 'i', 'it': 'i', 'condensed': 'c', 'osf': None,
}

# (metric, attribute, expected sign, note). Per-variant metrics use the matching style.
PAIRS = [
    ('weight', 'thin', -1, ''),
    ('weight', 'strong', 1, ''),
    ('w', 'wide', 1, ''),
    ('slant', 'italic', 1, ''),
    ('s', 'serif', 1, ''),
    ('sb', 'delicate', -1, 'serif fonts only: slab vs hairline'),
    ('c', 'delicate', 1, ''),
    ('c', 'formal', 1, ''),
    ('mo', 'monospace', -1, ''),
    ('cn', 'cursive', 1, ''),
    ('o', 'complex', 1, ''),
    ('o', 'artistic', 1, ''),
    ('o', 'graceful', 1, ''),
    ('r', 'angular', 1, ''),
    ('r', 'soft', -1, ''),
    ('e', 'soft', -1, ''),
    ('e', 'sharp', 1, ''),
    ('x', 'legible', 1, 'weak expectation'),
    ('ap', 'legible', 1, 'weak expectation'),
]
CONTROLS = [
    ('ap', 'dramatic'),
    ('x', 'warm'),
    ('ge', 'pretentious'),
    ('mo', 'happy'),
    ('sb', 'fresh'),
]
METRICS = ['weight', 'slant', 'w', 'x', 'c', 's', 'sb', 'e', 'ap', 'ge', 'r', 'o', 'cn', 'hf', 'mo']
BINARY = ['capitals', 'cursive', 'display', 'italic', 'monospace', 'serif']


def norm_name(s):
    return re.sub(r'[^a-z0-9]', '', s.lower())


def parse_style(rest):
    """'BoldItalicOSF' -> (700, True, False); None if a word is unknown."""
    rest, weight, italic, condensed = rest.lower(), 400, False, False
    words = sorted(STYLE_WORDS, key=len, reverse=True)
    while rest:
        word = next((w for w in words if rest.startswith(w)), None)
        if word is None:
            return None
        val = STYLE_WORDS[word]
        if val == 'i':
            italic = True
        elif val == 'c':
            condensed = True
        elif val:
            weight = val
        rest = rest[len(word):]
    return weight, italic, condensed


def match(name, families):
    """Their font name -> (family, weight, italic, condensed), or None."""
    for old, new in ALIASES.items():
        if re.split(r'[-_]', name)[0] == old:
            name = new.replace(' ', '') + name[len(old):]
    key = norm_name(name)
    for fam in sorted(families, key=len, reverse=True):
        if key.startswith(fam):
            style = parse_style(key[len(fam):])
            if style:
                return (families[fam], *style)
    return None


def interpolate(points, x):
    xs, ys = zip(*points)
    return float(np.interp(x, xs, ys))


def value(m, font, key, weight, italic, condensed):
    if key in ('weight', 'slant'):
        v = m['v'].get(f'{weight}{"i" if italic else ""}')
        return None if v is None else v[0 if key == 'weight' else 1]
    if key == 'w' and condensed:
        return interpolate(m['wd'], 75) if m.get('wd') else None
    return m.get(key)


def rho_ci(x, y):
    x, y = np.asarray(x, float), np.asarray(y, float)
    ok = ~(np.isnan(x) | np.isnan(y))
    x, y, n = x[ok], y[ok], int(ok.sum())
    if n < 10 or np.ptp(x) == 0 or np.ptp(y) == 0:
        return None
    r = float(spearmanr(x, y)[0])
    se = np.sqrt((1 + r * r / 2) / (n - 3))
    lo, hi = np.tanh(np.arctanh(r) + np.array([-1.96, 1.96]) * se)
    return {'rho': round(r, 3), 'lo': round(float(lo), 3), 'hi': round(float(hi), 3), 'n': n}


def auc_ci(pos, neg):
    pos, neg = np.asarray(pos, float), np.asarray(neg, float)
    n1, n2 = len(pos), len(neg)
    ranks = rankdata(np.r_[pos, neg])
    a = (ranks[:n1].sum() - n1 * (n1 + 1) / 2) / (n1 * n2)
    q1, q2 = a / (2 - a), 2 * a * a / (1 + a)
    se = np.sqrt((a * (1 - a) + (n1 - 1) * (q1 - a * a) + (n2 - 1) * (q2 - a * a)) / (n1 * n2))
    return {'auc': round(a, 3), 'lo': round(max(0, a - 1.96 * se), 3), 'hi': round(min(1, a + 1.96 * se), 3), 'n_pos': n1, 'n_neg': n2}


fonts = json.load(open('public/data/fonts.json'))
metrics = json.load(open('public/data/metrics.json'))
families = {norm_name(f['family']): i for i, f in enumerate(fonts)}

rows = list(csv.reader(open(SRC, newline='')))
attrs = rows[0][1:]
scores = {r[0]: [float(v) for v in r[1:]] for r in rows[1:]}

matched, unmatched = [], []
for name in scores:
    m = match(name, families)
    if m is None:
        unmatched.append(name)
        continue
    i, weight, italic, condensed = m
    font, met = fonts[i], metrics[i]
    default = weight == font['weight'] and italic == font['italic'] and not condensed
    vals = {k: value(met, font, k, weight, italic, condensed) for k in METRICS}
    matched.append({'name': name, 'family': font['family'], 'weight': weight, 'italic': italic,
                    'condensed': condensed, 'default_style': default,
                    'style_found': vals['weight'] is not None, 'metrics': vals})

A = np.array([scores[f['name']] for f in matched])
M = {k: np.array([np.nan if f['metrics'][k] is None else f['metrics'][k] for f in matched], float) for k in METRICS}
same = np.array([f['default_style'] for f in matched])


def pair(k, a):
    j = attrs.index(a)
    whole = rho_ci(M[k], A[:, j])
    sub = rho_ci(M[k][same], A[same, j])
    return whole, sub


results = []
for k, a, sign, note in PAIRS:
    whole, sub = pair(k, a)
    ok = whole and np.sign(whole['rho']) == sign and (whole['lo'] > 0 if sign > 0 else whole['hi'] < 0)
    auc = None
    if a in BINARY:  # bimodal scores: above 50 counts as having the attribute
        x, y = sign * M[k], A[:, attrs.index(a)]
        x, y = x[~np.isnan(x)], y[~np.isnan(x)]
        auc = auc_ci(x[y > 50], x[y <= 50])
    results.append({'metric': k, 'attribute': a, 'expected': sign, **whole, 'confirmed': bool(ok), 'auc': auc,
                    'rho_default_style': sub and sub['rho'], 'n_default_style': sub and sub['n'], 'note': note})
controls = []
for k, a in CONTROLS:
    whole, sub = pair(k, a)
    controls.append({'metric': k, 'attribute': a, **whole, 'rho_default_style': sub and sub['rho']})

# All metric x crowdsourced (relative) attribute pairs, as a baseline for the size of chance correlations.
matrix = {k: {a: (rho_ci(M[k], A[:, j]) or {}).get('rho') for j, a in enumerate(attrs)} for k in METRICS}
relative = [abs(matrix[k][a]) for k in METRICS for a in attrs if a not in BINARY and matrix[k][a] is not None]

# Serif metric vs Google Fonts category, over all families.
cat = np.array([f['category'] for f in fonts])
s = np.array([np.nan if m.get('s') is None else m['s'] for m in metrics], float)
mo = np.array([np.nan if m.get('mo') is None else m['mo'] for m in metrics], float)
auc_serif = auc_ci(s[(cat == 'Serif') & ~np.isnan(s)], s[(cat == 'Sans Serif') & ~np.isnan(s)])
auc_mono = auc_ci(-mo[(cat == 'Monospace') & ~np.isnan(mo)], -mo[(cat != 'Monospace') & ~np.isnan(mo)])

print(f'{len(matched)} of {len(scores)} fonts matched, {sum(not f["style_found"] for f in matched)} without their style in v, '
      f'{same.sum()} in the default style of the family')
print('Unmatched:', ', '.join(unmatched))
print('Missing styles:', ', '.join(f'{f["name"]} -> {f["family"]}' for f in matched if not f['style_found']) or '-')
print()
fmt = '{:<8} {:<11} {:>4} {:>7}  {:<17} {:>4} {:>7}  {:<3} {}'
print(fmt.format('metric', 'attribute', 'exp', 'rho', '95% CI', 'n', 'rho def', 'ok', 'note / AUC'))
for r in results:
    print(fmt.format(r['metric'], r['attribute'], '+' if r['expected'] > 0 else '-', f'{r["rho"]:+.2f}',
                     f'[{r["lo"]:+.2f}, {r["hi"]:+.2f}]', r['n'],
                     '' if r['rho_default_style'] is None else f'{r["rho_default_style"]:+.2f}',
                     'yes' if r['confirmed'] else 'no',
                     f'AUC {r["auc"]["auc"]:.3f} [{r["auc"]["lo"]:.3f}, {r["auc"]["hi"]:.3f}], {r["auc"]["n_pos"]} vs {r["auc"]["n_neg"]}'
                     if r['auc'] else r['note']))
print('\nControls (no relation expected):')
for r in controls:
    print(fmt.format(r['metric'], r['attribute'], '0', f'{r["rho"]:+.2f}', f'[{r["lo"]:+.2f}, {r["hi"]:+.2f}]', r['n'],
                     '' if r['rho_default_style'] is None else f'{r["rho_default_style"]:+.2f}', '', ''))
print(f'\n|rho| over all {len(relative)} metric x crowdsourced attribute pairs: median {np.median(relative):.2f}, '
      f'90th percentile {np.percentile(relative, 90):.2f}')
print(f'\nAUC serif metric, Serif vs Sans Serif category (all families): {auc_serif["auc"]:.3f} '
      f'[{auc_serif["lo"]:.3f}, {auc_serif["hi"]:.3f}], {auc_serif["n_pos"]} vs {auc_serif["n_neg"]}')
print(f'AUC width variation (lower = monospace), Monospace category vs rest: {auc_mono["auc"]:.3f} '
      f'[{auc_mono["lo"]:.3f}, {auc_mono["hi"]:.3f}], {auc_mono["n_pos"]} vs {auc_mono["n_neg"]}')

os.makedirs(os.path.dirname(OUT), exist_ok=True)
json.dump({
    'source': SRC,
    'coverage': {'fonts': len(scores), 'matched': len(matched), 'unmatched': unmatched,
                 'default_style': int(same.sum()), 'aliases': ALIASES},
    'pairs': results,
    'controls': controls,
    'abs_rho_all_pairs': {'n': len(relative), 'median': round(float(np.median(relative)), 3),
                          'p90': round(float(np.percentile(relative, 90)), 3)},
    'auc': {'serif_category': auc_serif, 'mono_category': auc_mono},
    'matrix': matrix,
    'fonts': matched,
}, open(OUT, 'w'), indent=1)
