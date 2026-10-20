// Groups all fonts into similar-looking groups (spherical k-means on the style
// vectors) at several levels of detail, once, in the background. Posts each
// level when it is done.

export interface GroupRequest {
  vectors: Float32Array;
  hasStyle: Uint8Array;
  dims: number;
  levels: number[];
}

export interface GroupLevel {
  k: number;
  /** Group of each font (-1 without a style vector). */
  assign: Int32Array;
  /** Similarity of each font to its group center. */
  sim: Float32Array;
}

/** Small seeded random generator (mulberry32), so that the groups do not change between runs. */
function random(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32;
  };
}

function kmeans(X: Float32Array, n: number, D: number, k: number) {
  const dot = (a: Float32Array, ao: number, b: Float32Array, bo: number) => {
    let s = 0;
    for (let d = 0; d < D; d++) s += a[ao + d] * b[bo + d];
    return s;
  };
  k = Math.min(k, n);
  // k-means++ seeds: each new seed is far from the seeds so far.
  const rand = random(1);
  const C = new Float32Array(k * D);
  const best = new Float32Array(n).fill(Infinity);
  let seed = 0;
  for (let c = 0; c < k; c++) {
    C.set(X.subarray(seed * D, seed * D + D), c * D);
    let total = 0;
    for (let i = 0; i < n; i++) {
      best[i] = Math.min(best[i], Math.max(0, 1 - dot(X, i * D, C, c * D)));
      total += best[i] ** 2;
    }
    let r = rand() * total;
    for (seed = 0; seed < n - 1 && (r -= best[seed] ** 2) > 0; seed++);
  }
  const assign = new Int32Array(n);
  const sim = new Float32Array(n);
  for (let iter = 0; iter < 15; iter++) {
    let changed = 0;
    for (let i = 0; i < n; i++) {
      let bc = 0, bs = -Infinity;
      for (let c = 0; c < k; c++) {
        const s = dot(X, i * D, C, c * D);
        if (s > bs) (bs = s), (bc = c);
      }
      if (assign[i] !== bc || iter === 0) changed++;
      assign[i] = bc;
      sim[i] = bs;
    }
    if (!changed) break;
    C.fill(0);
    for (let i = 0; i < n; i++) for (let d = 0; d < D; d++) C[assign[i] * D + d] += X[i * D + d];
    for (let c = 0; c < k; c++) {
      const len = Math.sqrt(dot(C, c * D, C, c * D)) || 1;
      for (let d = 0; d < D; d++) C[c * D + d] /= len;
    }
  }
  return { assign, sim };
}

onmessage = ({ data }: MessageEvent<GroupRequest>) => {
  const { vectors, hasStyle, dims: D, levels } = data;
  // Only fonts with a style vector take part.
  const fonts: number[] = [];
  hasStyle.forEach((has, i) => has && fonts.push(i));
  const X = new Float32Array(fonts.length * D);
  fonts.forEach((f, i) => X.set(vectors.subarray(f * D, f * D + D), i * D));
  for (const k of levels) {
    const r = kmeans(X, fonts.length, D, k);
    const assign = new Int32Array(hasStyle.length).fill(-1);
    const sim = new Float32Array(hasStyle.length);
    fonts.forEach((f, i) => ((assign[f] = r.assign[i]), (sim[f] = r.sim[i])));
    postMessage({ k, assign, sim } satisfies GroupLevel, { transfer: [assign.buffer, sim.buffer] });
  }
};
