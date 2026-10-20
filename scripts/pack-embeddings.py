"""Packs the skeleton embeddings for the browser.

Usage: python3 scripts/pack-embeddings.py [chars]

Reads data/emb-skel/<charCode>.f32 (rows of [CLS, 4x4 grid] x 384 floats),
uses the 4x4 grid (each cell L2-normalized), reduces it with PCA to DIMS
dimensions, L2-normalizes and quantizes to int8. Writes
public/data/e/<charCode>.bin: one row of DIMS int8 values per font in
fonts.json order; missing glyphs are zero rows.
"""
import os
import sys
import numpy as np

CHARS = sys.argv[1] if len(sys.argv) > 1 else 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
DIM, CELLS, DIMS = 384, 4, 256
SRC, OUT = 'data/emb-skel', 'public/data/e'
os.makedirs(OUT, exist_ok=True)


def l2(x):
    return x / (np.linalg.norm(x, axis=-1, keepdims=True) + 1e-9)


for ch in CHARS:
    path = f'{SRC}/{ord(ch)}.f32'
    if not os.path.exists(path):
        print(f'{ch}: missing, skipped')
        continue
    X = np.fromfile(path, dtype=np.float32).reshape(-1, 1 + CELLS * CELLS, DIM)
    valid = np.abs(X).sum((1, 2)) > 0
    F = l2(X[:, 1:]).reshape(len(X), -1)
    mu = F[valid].mean(0)
    _, _, Vt = np.linalg.svd(F[valid] - mu, full_matrices=False)
    Z = l2((F - mu) @ Vt[:DIMS].T)
    Q = np.round(Z * 127).astype(np.int8)
    Q[~valid] = 0
    Q.tofile(f'{OUT}/{ord(ch)}.bin')

    # Check: overlap of the top 20 neighbours (full features vs. packed).
    idx = np.where(valid)[0]
    full = l2(F[idx] - mu)
    packed = Q[idx].astype(np.float32)
    rng = np.random.default_rng(0)
    overlap = []
    for q in rng.choice(len(idx), 100, replace=False):
        a = set(np.argsort(-(full @ full[q]))[:20])
        b = set(np.argsort(-(packed @ packed[q]))[:20])
        overlap.append(len(a & b) / 20)
    print(f'{ch}: {valid.sum()} glyphs, top-20 overlap {np.mean(overlap) * 100:.0f}%', flush=True)
