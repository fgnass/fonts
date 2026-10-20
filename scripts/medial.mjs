// The skeleton of a glyph as curves: an approximation of its medial axis
// (the line where the outline, pushed inwards, meets itself).
//
// The outline is flattened and sampled densely; the Voronoi vertices of the
// samples (circumcenters of the Delaunay triangles) that lie inside the glyph
// approximate the medial axis, their circumradius is the half stroke width
// there. Branches that run into corners (and the hair towards every sample)
// are pruned: a terminal branch shorter than the half width at its junction
// is not a stroke. Overlapping contours are handled with a raster mask for
// the inside test; samples on outline parts inside the shape are dropped.
import Delaunator from 'delaunator';
import { createCanvas, Path2D } from '@napi-rs/canvas';
import { pathData } from './glyph.mjs';

const MASK = 1024; // raster for the inside test, pixels
const PAD = 8;
const SAMPLES = 140; // samples along the larger side of the glyph (sets the spacing)
const PRUNE = 0.9; // a terminal branch shorter than this times the half width at its junction goes (what is left of corner branches)
// Towards a corner, the radius of the axis shrinks at sin(angle / 2) per unit of length: faster than
// TRIM_SLOPE for corners wider than about 40°. Pointed strokes (tapers, script tails) shrink slower and stay.
const TRIM_SLOPE = 0.35;
const TRIM_MAX = 4; // never trim further from an end than this times the radius there
const TRIM_THIN = 0.7; // only trim while the radius is below this share of the stroke's (a short stem keeps poking out)
const EXTEND = 2.5; // an end is carried on straight to the outline, at most this times the radius there
const DUST = 3; // isolated pieces shorter than this many spacings go

/** Flattens an opentype.Path into closed polygons (lists of [x, y]). */
export function flatten(path, tol = 1.5) {
  const contours = [];
  let cur = null, x = 0, y = 0;
  const bez = (f, n) => {
    for (let i = 1; i <= n; i++) cur.push(f(i / n));
  };
  for (const c of path.commands) {
    if (c.type === 'M') {
      if (cur && cur.length > 2) contours.push(cur);
      cur = [[c.x, c.y]];
    } else if (c.type === 'L') cur.push([c.x, c.y]);
    else if (c.type === 'Q') {
      const n = Math.max(2, Math.ceil(Math.hypot(c.x - x, c.y - y) / (tol * 4)));
      const [x0, y0, x1, y1, x2, y2] = [x, y, c.x1, c.y1, c.x, c.y];
      bez((t) => [(1 - t) ** 2 * x0 + 2 * (1 - t) * t * x1 + t * t * x2, (1 - t) ** 2 * y0 + 2 * (1 - t) * t * y1 + t * t * y2], n);
    } else if (c.type === 'C') {
      const n = Math.max(2, Math.ceil(Math.hypot(c.x - x, c.y - y) / (tol * 4)));
      const [x0, y0, x1, y1, x2, y2, x3, y3] = [x, y, c.x1, c.y1, c.x2, c.y2, c.x, c.y];
      bez((t) => {
        const u = 1 - t;
        return [u ** 3 * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t ** 3 * x3, u ** 3 * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t ** 3 * y3];
      }, n);
    } else if (c.type === 'Z') {
      if (cur && cur.length > 2) contours.push(cur);
      cur = null;
      continue;
    }
    if (c.type !== 'Z') (x = c.x), (y = c.y);
  }
  if (cur && cur.length > 2) contours.push(cur);
  // Drop a closing point that repeats the first.
  for (const c of contours) {
    const [a, b] = [c[0], c[c.length - 1]];
    if (c.length > 1 && Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-6) c.pop();
  }
  return contours;
}

/** Points at equal spacing along a closed polygon, each with its outward-ish normal (sign unknown). */
function sample(contour, spacing) {
  const out = [];
  const n = contour.length;
  let carry = 0;
  for (let i = 0; i < n; i++) {
    const [ax, ay] = contour[i], [bx, by] = contour[(i + 1) % n];
    const len = Math.hypot(bx - ax, by - ay);
    if (len < 1e-9) continue;
    const nx = -(by - ay) / len, ny = (bx - ax) / len;
    for (let d = carry; d < len; d += spacing) {
      const t = d / len;
      out.push({ x: ax + (bx - ax) * t, y: ay + (by - ay) * t, nx, ny });
    }
    carry = ((carry - len) % spacing + spacing) % spacing;
  }
  return out;
}

const mask = createCanvas(MASK, MASK), mctx = mask.getContext('2d');

/**
 * The medial axis of a glyph path as polylines (flat [x, y, ...] lists in
 * the path's units), or null if the glyph is empty.
 */
export function medialAxis(path) {
  const b = path.getBoundingBox();
  if (!isFinite(b.x1) || b.x2 - b.x1 <= 0 || b.y2 - b.y1 <= 0) return null;
  const size = Math.max(b.x2 - b.x1, b.y2 - b.y1);
  const spacing = size / SAMPLES;

  // Inside test on a raster mask (nonzero fill handles overlapping and self-intersecting contours).
  const s = (MASK - 2 * PAD) / size;
  const ox = PAD - b.x1 * s + (MASK - 2 * PAD - (b.x2 - b.x1) * s) / 2, oy = PAD - b.y1 * s + (MASK - 2 * PAD - (b.y2 - b.y1) * s) / 2;
  mctx.setTransform(1, 0, 0, 1, 0, 0);
  mctx.clearRect(0, 0, MASK, MASK);
  mctx.setTransform(s, 0, 0, s, ox, oy);
  mctx.fill(new Path2D(pathData(path)), 'nonzero');
  const px = mctx.getImageData(0, 0, MASK, MASK).data;
  const inside = (x, y) => {
    const mx = Math.round(x * s + ox), my = Math.round(y * s + oy);
    return mx >= 0 && my >= 0 && mx < MASK && my < MASK && px[(my * MASK + mx) * 4 + 3] >= 128;
  };

  // Samples: drop those on outline parts that lie inside the shape (overlapping contours).
  const eps = Math.max(spacing * 0.6, 2 / s);
  const pts = [], boundary = new Set(); // boundary: Delaunay edges that follow the outline, as "i-j"
  for (const contour of flatten(path)) {
    const ring = sample(contour, spacing).filter((p) => !(inside(p.x + p.nx * eps, p.y + p.ny * eps) && inside(p.x - p.nx * eps, p.y - p.ny * eps)));
    const start = pts.length;
    for (const p of ring) pts.push(p.x, p.y);
    for (let i = 0; i < ring.length; i++) {
      const a = start + i, c = start + ((i + 1) % ring.length);
      boundary.add(a < c ? `${a}-${c}` : `${c}-${a}`);
    }
  }
  if (pts.length < 6) return null;

  const del = new Delaunator(pts);
  const T = del.triangles, H = del.halfedges;
  const nt = T.length / 3;
  // Voronoi vertices: circumcenters inside the glyph, with their radius.
  const cx = new Float64Array(nt), cy = new Float64Array(nt), cr = new Float64Array(nt), ok = new Uint8Array(nt);
  for (let t = 0; t < nt; t++) {
    const [a, b2, c] = [T[3 * t], T[3 * t + 1], T[3 * t + 2]];
    const ax = pts[2 * a], ay = pts[2 * a + 1], bx = pts[2 * b2], by = pts[2 * b2 + 1], qx = pts[2 * c], qy = pts[2 * c + 1];
    const d = 2 * (ax * (by - qy) + bx * (qy - ay) + qx * (ay - by));
    if (Math.abs(d) < 1e-9) continue;
    const ux = ((ax * ax + ay * ay) * (by - qy) + (bx * bx + by * by) * (qy - ay) + (qx * qx + qy * qy) * (ay - by)) / d;
    const uy = ((ax * ax + ay * ay) * (qx - bx) + (bx * bx + by * by) * (ax - qx) + (qx * qx + qy * qy) * (bx - ax)) / d;
    if (!inside(ux, uy)) continue;
    cx[t] = ux; cy[t] = uy; cr[t] = Math.hypot(ux - ax, uy - ay); ok[t] = 1;
  }
  // Edges between adjacent inside triangles whose shared edge does not follow the outline.
  const adj = Array.from({ length: nt }, () => []);
  for (let e = 0; e < H.length; e++) {
    const o = H[e];
    if (o < 0 || o < e) continue;
    const t = Math.floor(e / 3), u = Math.floor(o / 3);
    if (!ok[t] || !ok[u]) continue;
    const p = T[e], q = T[e % 3 === 2 ? e - 2 : e + 1];
    if (boundary.has(p < q ? `${p}-${q}` : `${q}-${p}`)) continue;
    if (!inside((cx[t] + cx[u]) / 2, (cy[t] + cy[u]) / 2)) continue;
    adj[t].push(u); adj[u].push(t);
  }
  const dist = (t, u) => Math.hypot(cx[t] - cx[u], cy[t] - cy[u]);

  const alive = ok.slice();
  const degree = (t) => adj[t].filter((u) => alive[u]).length;

  // Trim the ends that run into corners: from each end inwards while the radius grows like at a corner.
  const dead = new Uint8Array(nt);
  for (let t = 0; t < nt; t++) {
    if (!alive[t] || degree(t) !== 1) continue;
    const nodes = [t], at = [0];
    let prev = t, cur = adj[t].find((u) => alive[u]);
    while (cur != null) {
      nodes.push(cur);
      at.push(at[at.length - 1] + dist(prev, cur));
      if (degree(cur) !== 2) break;
      const next = adj[cur].find((u) => alive[u] && u !== prev);
      prev = cur; cur = next;
    }
    // The stroke's radius: the median along the chain (a short stem's own width, not that of the junction it
    // runs into), but at least 70% of the radius at the junction, so that a corner branch is trimmed to a stub.
    const last = nodes[nodes.length - 1];
    const sorted = nodes.map((k) => cr[k]).sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const cap = Math.max(0.92 * median, degree(last) > 2 ? TRIM_THIN * cr[last] : 0);
    // The slope over a window behind each node: steady along a corner branch, about zero once the axis runs
    // along the stroke. The first two spacings from the corner are too jittery to judge and always go.
    let cut = 0;
    for (let i = 1; i < nodes.length; i++) {
      const rho = cr[nodes[i]];
      if (!(at[i] < TRIM_MAX * rho && rho < cap)) break;
      if (at[i] >= 2 * spacing) {
        const window = Math.max(2 * spacing, 0.4 * rho);
        let j = i - 1;
        while (j > 0 && at[i] - at[j] < window) j--;
        const slope = (rho - cr[nodes[j]]) / Math.max(at[i] - at[j], 1e-9);
        if (slope <= TRIM_SLOPE) break;
      }
      cut = i;
    }
    for (let i = 0; i < cut; i++) dead[nodes[i]] = 1;
  }
  for (let t = 0; t < nt; t++) if (dead[t]) alive[t] = 0;

  // Prune terminal branches that are shorter than the half width where they join: what is left of corner branches, and hair.
  let changed = true;
  while (changed) {
    changed = false;
    for (let t = 0; t < nt; t++) {
      if (!alive[t] || degree(t) !== 1) continue;
      // Walk the chain to its junction (or other end).
      const chain = [t];
      let prev = t, cur = adj[t].find((u) => alive[u]);
      let len = dist(t, cur);
      while (cur != null && degree(cur) === 2) {
        chain.push(cur);
        const next = adj[cur].find((u) => alive[u] && u !== prev);
        if (next == null) break;
        len += dist(cur, next);
        prev = cur; cur = next;
      }
      if (cur == null) continue;
      const atJunction = degree(cur) > 2;
      const drop = atJunction ? len < PRUNE * cr[cur] : len < DUST * spacing;
      if (!drop) continue;
      for (const k of chain) alive[k] = 0;
      if (!atJunction) alive[cur] = 0; // an isolated piece: the far end goes too
      changed = true;
    }
  }

  // Extract the polylines between endpoints and junctions (and closed loops).
  const done = new Set();
  const key = (t, u) => (t < u ? `${t}-${u}` : `${u}-${t}`);
  const lines = [];
  const walk = (from, to) => {
    const line = [from, to];
    done.add(key(from, to));
    let prev = from, cur = to;
    while (degree(cur) === 2) {
      const next = adj[cur].find((u) => alive[u] && u !== prev);
      if (next == null || done.has(key(cur, next))) break;
      done.add(key(cur, next));
      line.push(next);
      prev = cur; cur = next;
    }
    return line;
  };
  for (let t = 0; t < nt; t++) {
    if (!alive[t] || degree(t) === 2) continue;
    for (const u of adj[t]) if (alive[u] && !done.has(key(t, u))) lines.push(walk(t, u));
  }
  for (let t = 0; t < nt; t++) {
    if (!alive[t]) continue;
    for (const u of adj[t]) if (alive[u] && !done.has(key(t, u))) lines.push(walk(t, u));
  }
  // At each free end, the last radius of the axis is dropped (where it may already lean towards a corner)
  // and the axis is carried on straight, in the direction it had before, to the outline: it then ends in
  // the middle of the stroke's end, not where the last inscribed disk sits.
  const extend = (line) => {
    let nodes = line;
    const ends = [];
    for (const atStart of [true, false]) {
      const e = atStart ? nodes[0] : nodes[nodes.length - 1];
      if (degree(e) !== 1) continue;
      const rho = Math.max(cr[e], 2 * spacing);
      // Walk back one radius (the new end) and another one (for the direction).
      const walkBack = (from, span) => {
        let k = from, back = 0;
        while (back < span && (atStart ? k < nodes.length - 1 : k > 0)) {
          const n = atStart ? k + 1 : k - 1;
          back += dist(nodes[k], nodes[n]);
          k = n;
        }
        return k;
      };
      const a = walkBack(atStart ? 0 : nodes.length - 1, rho), b = walkBack(a, rho);
      if (a === b) continue;
      const ta = nodes[a], tb = nodes[b];
      const dx = cx[ta] - cx[tb], dy = cy[ta] - cy[tb], len = Math.hypot(dx, dy);
      if (len < 1e-9) continue;
      const step = spacing / 4;
      let x = cx[ta], y = cy[ta], gone = 0;
      while (gone + step <= EXTEND * rho + rho && inside(x + (dx / len) * step, y + (dy / len) * step)) {
        x += (dx / len) * step; y += (dy / len) * step; gone += step;
      }
      nodes = atStart ? nodes.slice(a) : nodes.slice(0, a + 1);
      ends.push({ atStart, x, y });
    }
    const pts = nodes.flatMap((t) => [cx[t], cy[t]]);
    for (const { atStart, x, y } of ends) atStart ? pts.unshift(x, y) : pts.push(x, y);
    return pts;
  };
  return lines.map((line) => simplify(extend(line), spacing * 0.35));
}

/** Douglas-Peucker on a flat polyline. */
function simplify(p, tol) {
  const n = p.length / 2;
  if (n < 3) return p;
  const keep = new Uint8Array(n);
  keep[0] = keep[n - 1] = 1;
  const stack = [[0, n - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const ax = p[2 * a], ay = p[2 * a + 1], bx = p[2 * b], by = p[2 * b + 1];
    const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy);
    let far = 0, at = -1;
    for (let i = a + 1; i < b; i++) {
      const x = p[2 * i], y = p[2 * i + 1];
      const d = len ? Math.abs(dy * (x - ax) - dx * (y - ay)) / len : Math.hypot(x - ax, y - ay);
      if (d > far) (far = d), (at = i);
    }
    if (at >= 0 && far > tol) {
      keep[at] = 1;
      stack.push([a, at], [at, b]);
    }
  }
  const out = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(p[2 * i], p[2 * i + 1]);
  return out;
}
