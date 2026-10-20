// Sample fonts for the two ends of each slider.
import { dot, type Font, fonts, hasStyle, metrics, metricValue, STYLE_DIMS, type Style, styleDistance, textFonts, vectors } from './data';
import { SLIDERS, type Slider } from './sliders';

const POOLS = [250, 400, 600]; // the most popular fonts to choose sample pairs from, tried in this order

export interface Sample {
  font: Font;
  style: Style;
}

interface Item extends Sample {
  pos: Record<string, number>;
  p: number;
  rank: number;
  unusual: number;
}

/**
 * Ways to show family f as a sample for slider s, each with its style and its
 * positions on all sliders: for weight, every upright variant; for slant, the
 * default variant and its italic; for width, the points along the wdth axis;
 * else the default variant.
 */
function sampleOptions(f: Font, s: Slider) {
  const m = metrics[f.index];
  const key = (weight: number, italic: boolean) => String(weight) + (italic ? 'i' : '');
  const option = (style: Style, overrides: Record<string, number> = {}) => {
    const v = m.v?.[key(style.weight, style.italic)];
    const pos: Record<string, number> = {};
    for (const t of SLIDERS) {
      if (t.technical) continue;
      const value = t.key === 'weight' ? v?.[0] : t.key === 'slant' ? v?.[1] : metricValue(f.index, t.key === 'width' ? 'w' : t.key);
      if (value != null) pos[t.key] = t.pos(value);
    }
    return { style, pos: { ...pos, ...overrides } };
  };
  const base: Style = { weight: f.weight, italic: f.italic };
  if (s.key === 'weight')
    return Object.keys(m.v ?? {})
      .filter((v) => !v.endsWith('i'))
      .map((v) => option({ weight: parseInt(v), italic: false }));
  if (s.key === 'slant') {
    const list = [option(base)];
    if (m.v?.[key(f.weight, !f.italic)]) list.push(option({ weight: f.weight, italic: !f.italic }));
    return list;
  }
  if (s.key === 'width' && m.wd) return m.wd.map(([wdth, w]) => option({ ...base, wdth }, { width: s.pos(w) }));
  return [option(base)];
}

/** How unusual the look of each font is: cosine distance from the mean style of the most popular fonts. */
let oddness: number[] | null = null;
function oddOf(index: number) {
  if (!oddness) {
    const mean = new Float32Array(STYLE_DIMS);
    for (const f of fonts.slice(0, POOLS.at(-1))) {
      if (hasStyle[f.index]) for (let d = 0; d < STYLE_DIMS; d++) mean[d] += vectors[f.index * STYLE_DIMS + d];
    }
    const n = Math.hypot(...mean) || 1;
    for (let d = 0; d < STYLE_DIMS; d++) mean[d] /= n;
    oddness = fonts.map((f) => (hasStyle[f.index] ? 1 - dot(vectors, f.index * STYLE_DIMS, mean, 0) : 1));
  }
  return oddness[index];
}

/**
 * A pair of sample fonts for slider s: one at or below 0.3 and one at or
 * above 0.7, as far apart on s as possible but as alike as possible in
 * everything else (the other sliders and the style vector), preferring usual
 * and popular fonts. Looks at the most popular fonts first and takes more
 * only when they have no pair. Returns [low, high], or null.
 */
export function samplePair(s: Slider): [Sample, Sample] | null {
  // Only the look counts: technical statistics do not show in a sample.
  const others = SLIDERS.filter((t) => t.key !== s.key && !t.technical).map((t) => t.key);
  // Outline families are uncommon in the popular-font pools; still provide a real endpoint specimen.
  const pools = s.key === 'hf' ? [...POOLS, textFonts.length] : POOLS;
  for (const pool of pools) {
    const items: Item[] = [];
    let rank = 0;
    for (const f of textFonts) {
      // Fonts without real lowercase letters would show capitals for the lowercase samples.
      if (!hasStyle[f.index] || metrics[f.index].lc === 0) continue;
      if (++rank > pool) break;
      for (const o of sampleOptions(f, s)) {
        const p = o.pos[s.key];
        if (p != null) items.push({ font: f, style: o.style, pos: o.pos, p, rank, unusual: 0 });
      }
    }
    const low = items.filter((x) => x.p <= 0.3), high = items.filter((x) => x.p >= 0.7);
    if (!low.length || !high.length) continue;
    // How far a font is from the median in the other sliders.
    const median: Record<string, number> = {};
    for (const k of others) {
      const v = items.map((x) => x.pos[k]).filter((x) => x != null).sort((a, b) => a - b);
      median[k] = v[v.length >> 1];
    }
    for (const x of items) {
      const d = others.filter((k) => x.pos[k] != null && median[k] != null).map((k) => Math.abs(x.pos[k] - median[k]));
      x.unusual = d.reduce((a, b) => a + b, 0) / Math.max(1, d.length) + 0.5 * oddOf(x.font.index);
    }
    let best: { score: number; pair: [Item, Item] } | null = null;
    for (const a of low)
      for (const b of high) {
        let sum = 0;
        for (const k of others) if (a.pos[k] != null && b.pos[k] != null) sum += Math.abs(a.pos[k] - b.pos[k]);
        // A value that only one of them has (for example the serif type) counts as a difference.
        const oneSided = others.filter((k) => (a.pos[k] != null) !== (b.pos[k] != null)).length;
        const unlike = (sum + 0.5 * oneSided) / others.length + styleDistance(a.font.index, b.font.index);
        const score = 2 * (b.p - a.p) - 2 * unlike - 2 * (a.unusual + b.unusual) - (0.1 * (a.rank + b.rank)) / pool;
        if (!best || score > best.score) best = { score, pair: [a, b] };
      }
    return best!.pair;
  }
  return null;
}
