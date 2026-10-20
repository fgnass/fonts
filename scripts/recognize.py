"""Measure letter recognition from the raw DINOv2 skeleton embeddings.

Usage: python3 scripts/recognize.py [--dry] [family ...]

Writes `lr` (0..1) into public/data/metrics.json. Named families only print
scores; --dry prints the excluded families without writing. Requires NumPy
and data/emb-skel/ from embed.mjs --skeleton. Run after measure.mjs and
distinct.mjs. Unlike public/data/e/, these embeddings share a coordinate
system across characters (the packed files have a separate PCA per letter).

Subtract each font's mean feature vector to remove its shared texture/style.
For 12 upper/lowercase pairs, ask whether the five nearest reference glyphs
belong to the same letter (either case). Exclude the query family from all
references. Score each case separately and keep the better one, so caps-only
fonts and scripts with decorative capitals can still pass. Fewer than six
available glyphs in both cases means unknown, rather than a failed score.

References are the first 300 catalogue entries (ordered by popularity), with
dx >= 0.8, selected by measurements, never family names. A score below 0.2
is a conservative exclusion threshold; chance is about 1/12. This measures
recognition, not semantic certainty: e.g. captions in barcode fonts can
still contain recognizable letters.
"""
import argparse
import json
from pathlib import Path

import numpy as np

PAIRS = 'abdeghmnorst'
CHARS = PAIRS.upper() + PAIRS
MIN_LETTERS = 6
THRESHOLD = 0.2


def recognition(features, references, neighbors=5):
    """Return one score per family (NaN when unknown), from chars x fonts x dims."""
    valid = np.linalg.norm(features, axis=-1) > 0
    counts = valid.sum(axis=0)
    mean = features.sum(axis=0) / np.maximum(counts[:, None], 1)
    centered = features - mean
    norms = np.linalg.norm(centered, axis=-1, keepdims=True)
    centered = centered / np.maximum(norms, 1e-9)
    centered[~valid] = 0
    pool = centered[:, references].reshape(-1, centered.shape[-1])
    labels = np.repeat(np.arange(len(CHARS)), len(references))
    families = np.tile(references, len(CHARS))
    pool_valid = valid[:, references].reshape(-1)
    votes = np.full(valid.shape, np.nan)
    for k in range(len(CHARS)):
        similarity = centered[k] @ pool.T
        similarity[:, ~pool_valid] = -np.inf
        similarity[np.arange(features.shape[1])[:, None] == families[None, :]] = -np.inf
        nearest = np.argpartition(similarity, -neighbors, axis=1)[:, -neighbors:]
        available = np.isfinite(np.take_along_axis(similarity, nearest, axis=1)).all(axis=1)
        known = valid[k] & available
        votes[k, known] = (labels[nearest[known]] % len(PAIRS) == k % len(PAIRS)).mean(axis=1)
    cases = []
    for case in np.split(votes, 2):
        count = np.isfinite(case).sum(axis=0)
        score = np.nansum(case, axis=0) / np.maximum(count, 1)
        score[count < MIN_LETTERS] = np.nan
        cases.append(score)
    return np.fmax(*cases)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--dry', action='store_true')
    parser.add_argument('families', nargs='*')
    args = parser.parse_args()
    fonts = json.loads(Path('public/data/fonts.json').read_text())
    path = Path('public/data/metrics.json')
    metrics = json.loads(path.read_text())
    if len(fonts) != len(metrics):
        raise ValueError('Font and metric row counts differ; rebuild the index first.')
    rows = []
    for ch in CHARS:
        raw = np.fromfile(f'data/emb-skel/{ord(ch)}.f32', dtype=np.float32)
        if raw.size != len(fonts) * 17 * 384 or not np.isfinite(raw).all():
            raise ValueError(f'{ch}: invalid embedding data; rebuild skeleton embeddings first.')
        rows.append(raw.reshape(len(fonts), 17, 384)[:, 1:].reshape(len(fonts), -1))
    features = np.stack(rows)
    references = np.array([i for i in range(min(300, len(fonts))) if metrics[i].get('dx', 0) >= 0.8])
    if len(references) < 6:
        raise ValueError('Too few references; run distinct.mjs first.')
    scores = recognition(features, references)
    for font, metric, score in zip(fonts, metrics, scores):
        score = round(float(score), 3) if np.isfinite(score) else None
        if score is None:
            metric.pop('lr', None)
        else:
            metric['lr'] = score
        if font['family'] in args.families or (args.dry and score is not None and score < THRESHOLD):
            print(f"{font['family']:<36} {score}")
    if not args.dry and not args.families:
        path.write_text(json.dumps(metrics, separators=(',', ':')))
    print(f'{np.sum(scores < THRESHOLD)} of {len(fonts)} below {THRESHOLD}; '
          f'{np.sum(~np.isfinite(scores))} unknown')


if __name__ == '__main__':
    main()
