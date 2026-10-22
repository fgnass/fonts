// Shape helpers shared by the index build (Node) and the search (browser).
// Glyph skeletons are curves (the medial axis, see scripts/medial.mjs),
// stored as polylines in a GRID x GRID frame with SCALE steps per cell;
// sketches are strokes. For the chamfer distance, both become points on the
// GRID x GRID raster.

export const GRID = 64;
const MARGIN = 4;
/** Steps per grid cell in a stored polyline (coordinates are uint8, so GRID * SCALE must stay below 256). */
export const SCALE = 4;

/** Zhang-Suen thinning. Modifies `img` (0/1 values) in place. */
export function thin(img, w, h) {
  // Only foreground pixels (not on the border) are candidates for deletion.
  let fg = [];
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) if (img[y * w + x]) fg.push(y * w + x);
  const del = [];
  let changed = true;
  while (changed) {
    changed = false;
    for (let pass = 0; pass < 2; pass++) {
      del.length = 0;
      for (const i of fg) {
        const p2 = img[i - w], p3 = img[i - w + 1], p4 = img[i + 1], p5 = img[i + w + 1];
        const p6 = img[i + w], p7 = img[i + w - 1], p8 = img[i - 1], p9 = img[i - w - 1];
        const b = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
        if (b < 2 || b > 6) continue;
        const a =
          (!p2 && p3) + (!p3 && p4) + (!p4 && p5) + (!p5 && p6) +
          (!p6 && p7) + (!p7 && p8) + (!p8 && p9) + (!p9 && p2);
        if (a !== 1) continue;
        if (pass === 0 ? p2 * p4 * p6 || p4 * p6 * p8 : p2 * p4 * p8 || p2 * p6 * p8) continue;
        del.push(i);
      }
      if (!del.length) continue;
      for (const i of del) img[i] = 0;
      fg = fg.filter((i) => img[i]);
      changed = true;
    }
  }
  return img;
}

/** Fit a bounding box into the grid (keeping the aspect ratio) and return a mapping function. */
function fitter(minX, minY, maxX, maxY) {
  const bw = maxX - minX, bh = maxY - minY;
  const s = (GRID - 1 - 2 * MARGIN) / Math.max(bw, bh, 1e-6);
  const ox = (GRID - 1 - bw * s) / 2, oy = (GRID - 1 - bh * s) / 2;
  return (x, y) => [ox + (x - minX) * s, oy + (y - minY) * s];
}

/**
 * Encodes polylines (flat [x, y, ...] lists in any units) fitted into the
 * grid: uint16 LE line count, then per line a uint16 LE point count and the
 * points as uint8 pairs in SCALE steps per cell.
 */
export function encodeLines(lines) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const l of lines) {
    for (let i = 0; i < l.length; i += 2) {
      minX = Math.min(minX, l[i]); maxX = Math.max(maxX, l[i]);
      minY = Math.min(minY, l[i + 1]); maxY = Math.max(maxY, l[i + 1]);
    }
  }
  const fit = fitter(minX, minY, maxX, maxY);
  const out = [lines.length & 255, lines.length >> 8];
  for (const l of lines) {
    const n = l.length / 2;
    out.push(n & 255, n >> 8);
    for (let i = 0; i < l.length; i += 2) {
      const [x, y] = fit(l[i], l[i + 1]);
      out.push(Math.round(x * SCALE), Math.round(y * SCALE));
    }
  }
  return Uint8Array.from(out);
}

/** Decodes a block from encodeLines into polylines in grid coordinates (flat Float32Arrays). */
export function decodeLines(block) {
  const lines = [];
  if (block.length < 2) return lines;
  const count = block[0] | (block[1] << 8);
  let o = 2;
  for (let k = 0; k < count && o + 1 < block.length; k++) {
    const n = block[o] | (block[o + 1] << 8);
    o += 2;
    const l = new Float32Array(n * 2);
    for (let i = 0; i < n * 2; i++) l[i] = block[o + i] / SCALE;
    o += n * 2;
    lines.push(l);
  }
  return lines;
}

/** The grid cells a set of polylines passes through, as unique uint8 (x, y) pairs for the chamfer distance. */
export function linePoints(lines) {
  const seen = new Uint8Array(GRID * GRID);
  const out = [];
  const add = (x, y) => {
    const xi = Math.min(GRID - 1, Math.max(0, Math.round(x))), yi = Math.min(GRID - 1, Math.max(0, Math.round(y)));
    if (!seen[yi * GRID + xi]++) out.push(xi, yi);
  };
  for (const l of lines) {
    for (let i = 0; i < l.length - 2; i += 2) {
      const ax = l[i], ay = l[i + 1], bx = l[i + 2], by = l[i + 3];
      const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) * 2));
      for (let k = 0; k <= n; k++) add(ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n);
    }
    if (l.length === 2) add(l[0], l[1]);
  }
  return Uint8Array.from(out);
}

/** Normalize a flat [x,y,x,y,...] list of skeleton pixels into unique grid points. */
export function normalizePoints(xy) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < xy.length; i += 2) {
    minX = Math.min(minX, xy[i]); maxX = Math.max(maxX, xy[i]);
    minY = Math.min(minY, xy[i + 1]); maxY = Math.max(maxY, xy[i + 1]);
  }
  const fit = fitter(minX, minY, maxX, maxY);
  const seen = new Uint8Array(GRID * GRID);
  const out = [];
  for (let i = 0; i < xy.length; i += 2) {
    const [x, y] = fit(xy[i], xy[i + 1]).map(Math.round);
    if (!seen[y * GRID + x]++) out.push(x, y);
  }
  return Uint8Array.from(out);
}

/** Normalize hand-drawn strokes ([[{x,y},...],...]) into unique grid points. */
export function sketchPoints(strokes) {
  const all = strokes.flat();
  if (!all.length) return new Uint8Array(0);
  const fit = fitter(
    Math.min(...all.map((p) => p.x)), Math.min(...all.map((p) => p.y)),
    Math.max(...all.map((p) => p.x)), Math.max(...all.map((p) => p.y))
  );
  const seen = new Uint8Array(GRID * GRID);
  const out = [];
  const plot = (x, y) => {
    if (!seen[y * GRID + x]++) out.push(x, y);
  };
  for (const stroke of strokes) {
    const pts = stroke.map((p) => fit(p.x, p.y).map(Math.round));
    plot(...pts[0]);
    for (let i = 1; i < pts.length; i++) line(pts[i - 1], pts[i], plot);
  }
  return Uint8Array.from(out);
}

function line([x0, y0], [x1, y1], plot) {
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    plot(x0, y0);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

/** Two-pass 3-4 chamfer distance transform to the given points (result in pixels * 3). */
export function distanceField(pts, dt = new Uint16Array(GRID * GRID)) {
  const N = GRID;
  dt.fill(0xffff);
  for (let i = 0; i < pts.length; i += 2) dt[pts[i + 1] * N + pts[i]] = 0;
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const i = y * N + x;
      let d = dt[i];
      if (x > 0) d = Math.min(d, dt[i - 1] + 3);
      if (y > 0) {
        d = Math.min(d, dt[i - N] + 3);
        if (x > 0) d = Math.min(d, dt[i - N - 1] + 4);
        if (x < N - 1) d = Math.min(d, dt[i - N + 1] + 4);
      }
      dt[i] = d;
    }
  }
  for (let y = N - 1; y >= 0; y--) {
    for (let x = N - 1; x >= 0; x--) {
      const i = y * N + x;
      let d = dt[i];
      if (x < N - 1) d = Math.min(d, dt[i + 1] + 3);
      if (y < N - 1) {
        d = Math.min(d, dt[i + N] + 3);
        if (x < N - 1) d = Math.min(d, dt[i + N + 1] + 4);
        if (x > 0) d = Math.min(d, dt[i + N - 1] + 4);
      }
      dt[i] = d;
    }
  }
  return dt;
}

/** Mean distance (in pixels) from the points to the nearest point of the distance field's set. */
export function meanDist(pts, dt) {
  let sum = 0;
  for (let i = 0; i < pts.length; i += 2) sum += dt[pts[i + 1] * GRID + pts[i]];
  return sum / (pts.length / 2) / 3;
}

/** Symmetric chamfer distance between two point sets (lower is more similar). */
export function chamfer(aPts, aDt, bPts, bDt) {
  return (meanDist(aPts, bDt) + meanDist(bPts, aDt)) / 2;
}

/** Stroke ends on a one-pixel skeleton, including isolated dots. */
export function strokeEnds(pts) {
  const img = new Uint8Array(GRID * GRID);
  for (let i = 0; i < pts.length; i += 2) img[pts[i + 1] * GRID + pts[i]] = 1;
  thin(img, GRID, GRID);
  const ends = [];
  for (let y = 1; y < GRID - 1; y++) {
    for (let x = 1; x < GRID - 1; x++) {
      const i = y * GRID + x;
      if (!img[i]) continue;
      let neighbors = 0;
      for (const d of [-GRID - 1, -GRID, -GRID + 1, -1, 1, GRID - 1, GRID, GRID + 1]) neighbors += img[i + d];
      if (neighbors <= 1) ends.push(x, y);
    }
  }
  return Uint8Array.from(ends);
}

/** Gaps in a sketch up to this many cells are joins, not stroke ends. */
const GAP = 4;

/**
 * Stroke ends of a sketch. Strokes that should meet often stop just short of
 * each other, and each such gap would add two stroke ends. So an end counts
 * only when no part of the drawing within GAP cells is out of reach along its
 * own stroke (2 * GAP + 2 steps).
 */
export function sketchEnds(pts, gap = GAP) {
  const ends = strokeEnds(pts);
  const img = new Uint8Array(GRID * GRID);
  for (let i = 0; i < pts.length; i += 2) img[pts[i + 1] * GRID + pts[i]] = 1;
  const out = [];
  for (let e = 0; e < ends.length; e += 2) {
    const ex = ends[e], ey = ends[e + 1];
    const reached = new Set([ey * GRID + ex]);
    let frontier = [ey * GRID + ex];
    for (let step = 0; step < 2 * gap + 2 && frontier.length; step++) {
      const next = [];
      for (const i of frontier) {
        const x = i % GRID, y = (i - x) / GRID;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx, ny = y + dy, j = ny * GRID + nx;
            if (nx >= 0 && ny >= 0 && nx < GRID && ny < GRID && img[j] && !reached.has(j)) reached.add(j), next.push(j);
          }
        }
      }
      frontier = next;
    }
    let joined = false;
    for (let y = Math.max(0, ey - gap); y <= Math.min(GRID - 1, ey + gap) && !joined; y++) {
      for (let x = Math.max(0, ex - gap); x <= Math.min(GRID - 1, ex + gap); x++) {
        const i = y * GRID + x;
        if (img[i] && !reached.has(i) && Math.hypot(x - ex, y - ey) <= gap) {
          joined = true;
          break;
        }
      }
    }
    if (!joined) out.push(ex, ey);
  }
  return Uint8Array.from(out);
}

/** Extra/missing stroke ends and their positions, in the same units as chamfer distance. */
export function strokeEndDistance(a, b) {
  if (!a.length && !b.length) return 0;
  if (!a.length || !b.length) return GRID / 4;
  const directed = (from, to) => {
    let sum = 0;
    for (let i = 0; i < from.length; i += 2) {
      let nearest = Infinity;
      for (let j = 0; j < to.length; j += 2) nearest = Math.min(nearest, Math.hypot(from[i] - to[j], from[i + 1] - to[j + 1]));
      sum += nearest;
    }
    return sum / (from.length / 2);
  };
  return 0.2 * (directed(a, b) + directed(b, a)) / 2 + 4 * Math.abs(a.length - b.length) / 2;
}

