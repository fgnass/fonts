"""Packs the style embeddings for the browser.

Usage: python3 scripts/pack-style.py

Reads data/emb-style.f32 (rows of [CLS, mean patch] x 384 floats),
L2-normalizes both parts, concatenates them, reduces them with PCA to DIMS
dimensions, L2-normalizes and quantizes to int8. Writes public/data/style.bin:
one row of DIMS int8 values per font in fonts.json order; fonts without a
specimen are zero rows.
"""
import json
import numpy as np

DIM, DIMS = 384, 128


def l2(x):
    return x / (np.linalg.norm(x, axis=-1, keepdims=True) + 1e-9)


X = np.fromfile('data/emb-style.f32', dtype=np.float32).reshape(-1, 2, DIM)
valid = np.abs(X).sum((1, 2)) > 0
F = l2(X).reshape(len(X), -1)
mu = F[valid].mean(0)
_, _, Vt = np.linalg.svd(F[valid] - mu, full_matrices=False)
Z = l2((F - mu) @ Vt[:DIMS].T)
Q = np.round(Z * 127).astype(np.int8)
Q[~valid] = 0
Q.tofile('public/data/style.bin')
print(f'{valid.sum()} of {len(X)} fonts')

# Check: nearest neighbours of some well-known fonts.
fonts = json.load(open('public/data/fonts.json'))
names = [f['family'] for f in fonts]
P = Q.astype(np.float32)
for family in ['Roboto', 'Playfair Display', 'Pacifico', 'Bungee Shade', 'Anton', 'Nabla']:
    q = names.index(family)
    near = np.argsort(-(P @ P[q]))[1:9]
    print(f'{family}: ' + ', '.join(names[i] for i in near))
