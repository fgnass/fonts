// Filtering the fonts by the look sliders, the style to show for each family,
// and compromise suggestions when few fonts pass.
import { displayedStyle, type Font, metrics, metricValue, type Style, textFonts } from './data';
import { BINS, type Corridor, SLIDERS, STYLE, type Slider } from './sliders';

export const FEW = 10; // below this many results, suggest compromises

/** An active slider with its corridor. */
export interface Range {
  slider: Slider;
  lo: number;
  hi: number;
}

/** A font that passes the filters, with the style to show it in. */
export type Passing = Font & { pick: Style };

interface Instance {
  wght: number;
  weight: number;
  slant: number;
}

interface Candidate {
  italic: boolean;
  instances: Instance[];
  /** Per style slider, the range of positions this candidate can reach. */
  span: Record<'weight' | 'slant' | 'width', [number, number]>;
}

/** How far position `p` is outside the corridor [lo, hi] (0 inside, negative below). */
const outside = (p: number, lo: number, hi: number) => (p < lo ? p - lo : p > hi ? p - hi : 0);

/** The measured value of the style actually shown on a card. */
export function fontValue(font: Font, slider: Slider, style: Style = font): number | null {
  if (!slider.style) return metricValue(font.index, slider.key);
  const m = metrics[font.index];
  const interpolate = (points: [number, number][], at: number): number | null => {
    if (!points.length) return null;
    points.sort((a, b) => a[0] - b[0]);
    if (at <= points[0][0]) return points[0][1];
    for (let i = 1; i < points.length; i++) {
      const [a, x] = points[i - 1], [b, y] = points[i];
      if (at <= b) return x + (y - x) * (at - a) / (b - a);
    }
    return points.at(-1)![1];
  };
  if (slider.key === 'width') return style.wdth != null && m.wd ? interpolate([...m.wd], style.wdth) : metricValue(font.index, 'w');
  const points: [number, number][] = slider.key === 'weight'
    ? weightPoints(font, style.italic)
    : Object.entries(m.v ?? {})
      .filter(([v, values]) => v.endsWith('i') === style.italic && values[1] != null)
      .map(([v, values]) => [parseInt(v), values[1]]);
  const value = interpolate(points, style.weight);
  return value == null ? null : slider.key === 'slant' ? value - (style.slnt ?? 0) : value;
}

let slope: number | undefined;
/**
 * How much the measured weight grows per wght unit, relative to the weight at
 * wght 400: the median over the families with several measurements on a wght
 * axis. Estimates the unmeasured weights of a family with a single measurement.
 */
function weightSlope() {
  if (slope != null) return slope;
  const slopes: number[] = [];
  for (const f of textFonts) {
    if (!f.axes?.wght) continue;
    const points = measuredWeights(f, false);
    if (points.length < 2) continue;
    const a = points[0], b = points.at(-1)!;
    const at400 = a[1] + ((b[1] - a[1]) * (400 - a[0])) / (b[0] - a[0]);
    if (at400 > 0) slopes.push((b[1] - a[1]) / (b[0] - a[0]) / at400);
  }
  slopes.sort((a, b) => a - b);
  return (slope = slopes[slopes.length >> 1] ?? 0.0023);
}

/** The measured [wght, weight] points of the upright or italic variants, by wght. */
const measuredWeights = (f: Font, italic: boolean): [number, number][] =>
  Object.entries(metrics[f.index].v ?? {})
    .filter(([v, values]) => v.endsWith('i') === italic && values[0] != null)
    .map(([v, values]) => [parseInt(v), values[0]!] as [number, number])
    .sort((a, b) => a[0] - b[0]);

/**
 * The [wght, weight] points of the upright or italic variants. A family with a
 * wght axis but a single measurement gets estimated points at both ends of
 * the axis (see weightSlope), so that its whole axis stays reachable.
 */
function weightPoints(f: Font, italic: boolean): [number, number][] {
  const points = measuredWeights(f, italic);
  const axis = f.axes?.wght;
  if (axis && points.length === 1) {
    const [[w0, x0]] = points;
    const estimate = (w: number): [number, number] => [w, Math.max(0.2 * x0, x0 * (1 + weightSlope() * (w - w0)))];
    if (axis[0] < w0) points.unshift(estimate(axis[0]));
    if (axis[1] > w0) points.push(estimate(axis[1]));
  }
  return points;
}

/**
 * The ways a family can be shown, for the style sliders (weight, slant,
 * width). Each candidate has, per style slider, the range of positions it can
 * reach: a point for a fixed instance, a span along a variable axis. Without
 * a wght axis, each instance is a candidate; with one, each adjacent pair
 * of measurements is a linear segment. Weight and slant stay coupled.
 */
const candidateCache = new WeakMap<Font, Candidate[]>();
function candidates(f: Font): Candidate[] {
  const cached = candidateCache.get(f);
  if (cached) return cached;
  const m = metrics[f.index];
  const axes = f.axes ?? {};
  const styles = new Map<boolean, Instance[]>(); // italic -> instances
  for (const v of f.variants) {
    const italic = v.endsWith('i');
    const values = m.v?.[v];
    if (values?.[0] == null) continue;
    if (!styles.has(italic)) styles.set(italic, []);
    styles.get(italic)!.push({ wght: parseInt(v), weight: values[0], slant: values[1] });
  }
  const out: Candidate[] = [];
  for (const [italic, list] of styles) {
    // A single measurement on a wght axis: add the estimated ends of the axis (slant stays as measured).
    if (axes.wght && list.length === 1) {
      const [x] = list;
      for (const [wght, weight] of weightPoints(f, italic)) if (wght !== x.wght) list.push({ wght, weight, slant: x.slant });
    }
    list.sort((a, b) => a.wght - b.wght);
    const groups = axes.wght && list.length > 1 ? list.slice(1).map((x, i) => [list[i], x]) : list.map((x) => [x]);
    for (const instances of groups) out.push(candidate(f, italic, instances));
  }
  // Without measured instances, the default style is the only candidate (it fails active style sliders).
  if (!out.length) out.push(candidate(f, f.italic, [{ wght: f.weight, weight: NaN, slant: NaN }]));
  candidateCache.set(f, out);
  return out;
}

/** Reachable values of one linear weight segment, including independent slant and width axes. */
function candidate(f: Font, italic: boolean, instances: Instance[]): Candidate {
  const axes = f.axes ?? {}, m = metrics[f.index];
  const weights = instances.map((x) => STYLE.weight.pos(x.weight));
  const slants = instances.flatMap((x) => axes.slnt ? [x.slant - axes.slnt[1], x.slant - axes.slnt[0]] : [x.slant]);
  const w = metricValue(f.index, 'w');
  const widths = m.wd ? m.wd.map(([, w]) => w) : [w ?? NaN];
  return { italic, instances, span: {
    weight: [Math.min(...weights), Math.max(...weights)],
    slant: [STYLE.slant.pos(Math.min(...slants)), STYLE.slant.pos(Math.max(...slants))],
    width: [STYLE.width.pos(Math.min(...widths)), STYLE.width.pos(Math.max(...widths))],
  } };
}

/** Clip a segment to all active style corridors, optionally leaving one free for its histogram. */
function constrain(f: Font, c: Candidate, ranges: Map<string, Range>, omit?: string): Candidate | null {
  let lo = 0, hi = 1;
  const a = c.instances[0], b = c.instances.at(-1)!;
  for (const key of ['weight', 'slant', 'width'] as const) {
    const r = ranges.get(key);
    if (!r || key === omit) continue;
    if (key === 'width') {
      if (spanOutside(c.span.width, r.lo, r.hi) !== 0) return null;
      continue;
    }
    const slider = STYLE[key];
    // Slider endpoints also include measurements beyond the displayed scale.
    let min = r.lo <= 0 ? -Infinity : slider.value(r.lo);
    let max = r.hi >= 1 ? Infinity : slider.value(r.hi);
    if (key === 'slant' && f.axes?.slnt) {
      min += f.axes.slnt[0];
      max += f.axes.slnt[1];
    }
    const x = a[key], y = b[key];
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    if (x === y) {
      if (x < min || x > max) return null;
    } else {
      const t0 = (min - x) / (y - x), t1 = (max - x) / (y - x);
      lo = Math.max(lo, Math.min(t0, t1));
      hi = Math.min(hi, Math.max(t0, t1));
      if (lo > hi) return null;
    }
  }
  if (lo === 0 && hi === 1) return c;
  const at = (t: number): Instance => ({ wght: a.wght + t * (b.wght - a.wght), weight: a.weight + t * (b.weight - a.weight), slant: a.slant + t * (b.slant - a.slant) });
  return candidate(f, c.italic, c.instances.length === 1 ? [a] : [at(lo), at(hi)]);
}

/** How far the span [a, b] is outside the corridor [lo, hi] (0 when they overlap, NaN when unknown). */
const spanOutside = ([a, b]: [number, number], lo: number, hi: number) => (isNaN(a) ? NaN : b < lo ? b - lo : a > hi ? a - hi : 0);

/** The position in span [a, b] closest to the middle of the corridor (or to `rest` without a corridor). */
const aim = ([a, b]: [number, number], r: Range | undefined, rest: number) => Math.min(b, Math.max(a, r ? (r.lo + r.hi) / 2 : rest));

/**
 * The axis value where a measured property reaches raw value `target`, by
 * linear interpolation between measured points ({ at: axis value, p: measured value }).
 */
function along(points: { at: number; p: number }[], target: number) {
  let best = points[0].at, bestDiff = Infinity;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1];
    const t = b.p === a.p ? 0 : Math.min(1, Math.max(0, (target - a.p) / (b.p - a.p)));
    const diff = Math.abs(a.p + t * (b.p - a.p) - target);
    if (diff < bestDiff) (bestDiff = diff), (best = a.at + t * (b.at - a.at));
  }
  return best;
}

/** The style to load for a candidate: weight (exact on a wght axis), italic, and slnt / wdth axis values. */
function styleFor(f: Font, c: Candidate, ranges: Map<string, Range>): Style {
  const axes = f.axes ?? {};
  // Weight: the instance (or point on the wght axis) closest to the target.
  const rw = ranges.get('weight');
  const target = aim(c.span.weight, rw, STYLE.weight.pos(metrics[f.index].v?.[String(f.weight) + (f.italic ? 'i' : '')]?.[0] ?? 0.12));
  let weight = c.instances[0].wght;
  if (c.instances.length > 1 && axes.wght) {
    weight = along(c.instances.map((x) => ({ at: x.wght, p: x.weight })), STYLE.weight.value(target));
    if (!rw) weight = Math.min(c.instances.at(-1)!.wght, Math.max(c.instances[0].wght, f.weight));
  }
  const style: Style = { weight, italic: c.italic };
  // Slant and width: only move the axis when the slider is in use.
  const rs = ranges.get('slant');
  if (axes.slnt && rs) {
    const base = fontValue(f, STYLE.slant, style)!;
    const span: [number, number] = [STYLE.slant.pos(base - axes.slnt[1]), STYLE.slant.pos(base - axes.slnt[0])];
    const angle = STYLE.slant.value(aim(span, rs, 0));
    style.slnt = Math.min(axes.slnt[1], Math.max(axes.slnt[0], base - angle));
  }
  const rd = ranges.get('width');
  const wd = metrics[f.index].wd;
  if (wd && rd) style.wdth = along(wd.map(([wdth, w]) => ({ at: wdth, p: w })), STYLE.width.value(aim(c.span.width, rd, 0)));
  return style;
}

/** Choose the passing style closest to the corridor centers, with default-style tie breaks. */
function chooseDisplayedStyle(f: Font, passing: Candidate[], ranges: Map<string, Range>, styleSliders: Slider[]): Style {
  let pick: Style = displayedStyle(f);
  if (styleSliders.some((s) => ranges.has(s.key))) {
    let bestCost = Infinity;
    for (const c of passing) {
      const style = styleFor(f, c, ranges);
      let cost = Math.abs(style.weight - 400) / 1e4; // prefer weights near 400 on a tie
      // Without a slant corridor, prefer the default style (usually upright).
      if (!ranges.has('slant') && c.italic !== f.italic) cost += 1;
      styleSliders.forEach((s) => {
        const r = ranges.get(s.key);
        if (r) cost += ((s.pos(fontValue(f, s, style)!) - (r.lo + r.hi) / 2) / (r.hi - r.lo + 0.01)) ** 2;
      });
      if (cost < bestCost) (bestCost = cost), (pick = style);
    }
  }
  return pick;
}

export interface FilterResult {
  list: Passing[];
  /** Per slider, how many fonts that pass all *other* filters fall into each bin. */
  hist: Map<string, Uint16Array>;
  /** Per active slider, how far the fonts that only fail this slider are outside its corridor. */
  misses: Map<string, number[]>;
  ranges: Map<string, Range>;
}

/** The active sliders (not "any") of a set of corridors. */
export function activeRanges(corridors: Record<string, Corridor>) {
  const ranges = new Map<string, Range>();
  for (const slider of SLIDERS) {
    const [lo, hi] = corridors[slider.key];
    if (lo > 0 || hi < 1) ranges.set(slider.key, { slider, lo, hi });
  }
  return ranges;
}

/**
 * Filters the fonts by the look sliders. Returns the passing fonts, each with
 * the style to show (`pick`), the slider histograms and the misses for
 * compromise suggestions.
 */
export function filterFonts(ranges: Map<string, Range>): FilterResult {
  const familySliders = SLIDERS.filter((s) => !s.style);
  const styleSliders = SLIDERS.filter((s) => s.style) as (Slider & { key: 'weight' | 'slant' | 'width' })[];
  const hist = new Map(SLIDERS.map((s) => [s.key, new Uint16Array(BINS)]));
  const misses = new Map([...ranges.keys()].map((k) => [k, [] as number[]]));
  const bin = (p: number) => Math.min(BINS - 1, Math.floor(p * BINS));
  const list: Passing[] = [];

  for (const f of textFonts) {
    // Offset outside the corridor per family slider (NaN when the value is unknown).
    const values = familySliders.map((s) => metricValue(f.index, s.key));
    const famOff = familySliders.map((s, i) => {
      const r = ranges.get(s.key);
      if (!r) return 0;
      return values[i] == null ? NaN : outside(s.pos(values[i]!), r.lo, r.hi);
    });
    const famFails = famOff.filter((o) => o !== 0).length;
    if (famFails > 1) continue; // fails two sliders: counts for no histogram

    const cands = candidates(f);
    const passing = cands.map((c) => constrain(f, c, ranges)).filter((c): c is Candidate => c != null);
    const stylePass = passing.length > 0;
    // Histograms and misses of family sliders: the font must pass everything else.
    familySliders.forEach((s, i) => {
      if (famFails - (famOff[i] !== 0 ? 1 : 0) > 0 || !stylePass) return;
      if (values[i] != null) hist.get(s.key)![bin(s.pos(values[i]!))]++;
      if (famOff[i] !== 0 && !isNaN(famOff[i])) misses.get(s.key)!.push(famOff[i]);
    });
    // Histograms and misses of style sliders: a family counts once per bin it can reach.
    if (famFails === 0) {
      styleSliders.forEach((s) => {
        const seen = new Set<number>();
        let best = Infinity;
        for (const c of cands) {
          const free = constrain(f, c, ranges, s.key);
          if (!free) continue;
          const [a, b] = free.span[s.key];
          if (isNaN(a)) continue;
          for (let k = bin(a); k <= bin(b); k++) seen.add(k);
          const r = ranges.get(s.key);
          const off = r ? spanOutside([a, b], r.lo, r.hi) : 0;
          if (Math.abs(off) < Math.abs(best)) best = off;
        }
        for (const k of seen) hist.get(s.key)![k]++;
        if (best !== 0 && isFinite(best) && ranges.has(s.key)) misses.get(s.key)!.push(best);
      });
    }
    if (famFails || !stylePass) continue;

    const pick = chooseDisplayedStyle(f, passing, ranges, styleSliders);
    list.push({ ...f, pick });
  }
  return { list, hist, misses, ranges };
}

export interface ExclusionPlan {
  slider: Slider;
  corridor: Corridor;
  removed: number;
  remaining: number;
  label: string;
  score: number;
}

const EXCLUSION_LABELS: Record<string, [string, string]> = {
  weight: ['Lighter', 'Heavier'], width: ['Narrower', 'Wider'], slant: ['Less slanted', 'More slanted'],
  s: ['Fewer serifs', 'More pronounced serifs'], sb: ['Finer serifs', 'Heavier serifs'],
  c: ['Lower contrast', 'Higher contrast'], e: ['Softer stroke ends', 'Sharper stroke ends'],
  r: ['More curved', 'Straighter'], o: ['Less ornate', 'More ornate'], cn: ['Less connected', 'More connected'],
  x: ['Smaller x-height', 'Larger x-height'], ge: ['Less circular', 'More circular'],
  ap: ['More closed apertures', 'More open apertures'], mo: ['Less width variation', 'More width variation'],
  hf: ['More solid strokes', 'More outline-like strokes'],
};

/** Suggest visible, distinctive differences; retention is one part of the ranking, not its entire purpose. */
export function exclusionSuggestions(font: Font, corridors: Record<string, Corridor>, allowed?: ReadonlySet<number>): ExclusionPlan[] {
  const ranges = activeRanges(corridors);
  const baseline = filterFonts(ranges).list.filter((f) => !allowed || allowed.has(f.index));
  if (!baseline.some((f) => f.index === font.index) || baseline.length < 2) return [];
  const plans: ExclusionPlan[] = [];
  for (const slider of SLIDERS) {
    if (slider.technical || slider.toggle || !EXCLUSION_LABELS[slider.key] || (slider.requires && corridors[slider.requires][0] <= 0)) continue;
    // Small incidental gaps in script loops do not justify calling a family outline-like.
    if (slider.key === 'hf' && (metricValue(font.index, 'hf') ?? 0) < 0.55) continue;
    const [lo, hi] = corridors[slider.key];
    let low: number, high: number;
    if (slider.style) {
      // Exclude every reachable variant, so a variable font cannot simply change style and reappear.
      const spans = candidates(font).map((c) => constrain(font, c, ranges))
        .filter((c): c is Candidate => c != null)
        .map((c) => c.span[slider.key as keyof Candidate['span']]).filter(([a, b]) => isFinite(a) && isFinite(b));
      if (!spans.length) continue;
      low = Math.max(lo, Math.min(...spans.map(([a]) => a)));
      high = Math.min(hi, Math.max(...spans.map(([, b]) => b)));
    } else {
      const value = metricValue(font.index, slider.key);
      if (value == null) continue;
      low = high = slider.pos(value);
    }
    const options: Corridor[] = [];
    if (low > lo) options.push([lo, low - 1e-6]);
    if (high < hi) options.push([high + 1e-6, hi]);
    const positions = baseline.map((f) => fontValue(f, slider, f.pick)).filter((v): v is number => v != null).map(slider.pos).sort((a, b) => a - b);
    if (!positions.length) continue;
    const middle = positions.length >> 1;
    const median = positions.length % 2 ? positions[middle] : (positions[middle - 1] + positions[middle]) / 2;
    let best: ExclusionPlan | null = null;
    for (const corridor of options) {
      const lowerMaximum = corridor[1] < hi;
      const distance = lowerMaximum ? low - median : median - high;
      // Tiny measurement differences are not useful explanations, even if they happen to exclude few fonts.
      if (distance < 0.06) continue;
      // Narrowing one corridor only removes fonts, so checking the baseline against
      // the new corridor gives the same result as filtering all fonts again.
      const next = activeRanges({ ...corridors, [slider.key]: corridor });
      const keeps = (f: Font) => {
        if (slider.style) return candidates(f).some((c) => constrain(f, c, next) != null);
        const value = metricValue(f.index, slider.key);
        return value != null && outside(slider.pos(value), corridor[0], corridor[1]) === 0;
      };
      if (keeps(font)) continue;
      const remaining = baseline.filter(keeps).length;
      if (!remaining) continue;
      const removed = baseline.length - remaining;
      const relevance = slider.key === 'weight' || slider.key === 'slant' ? 0.25
        : slider.key === 'hf' ? 1.1 : ['o', 'cn'].includes(slider.key) ? 1
        : ['c', 's', 'sb'].includes(slider.key) ? 0.9
        : ['r', 'e'].includes(slider.key) ? 0.8 : 0.65;
      const score = relevance * Math.min(1, distance / 0.2) * remaining / baseline.length;
      if (!best || score > best.score) best = { slider, corridor, removed, remaining, score, label: EXCLUSION_LABELS[slider.key][lowerMaximum ? 0 : 1] };
    }
    if (best) plans.push(best);
  }
  plans.sort((a, b) => b.score - a.score || a.removed - b.removed);
  // Weight/slant alone, or weak shape differences, cannot explain an unspecified dislike confidently.
  if (!plans.some((p) => !['weight', 'slant'].includes(p.slider.key) && p.score >= 0.45)) return [];
  return plans.filter((p) => p.score >= 0.15).slice(0, 3);
}

export interface Compromise {
  slider: Slider;
  lo: number;
  hi: number;
  gain: number;
}

/**
 * When few fonts pass, for each active slider the smallest widening of its
 * corridor that brings FEW more fonts, and how many fonts pass without it.
 * Smallest change first.
 */
export function compromises({ list, ranges, misses }: FilterResult): Compromise[] | null {
  if (list.length >= FEW || !ranges.size) return null;
  const options: (Compromise & { cost: number })[] = [];
  for (const [key, r] of ranges) {
    const offsets = [...misses.get(key)!].sort((a, b) => Math.abs(a) - Math.abs(b));
    if (!offsets.length) continue;
    // A toggle is on or off: the only compromise is to turn it off.
    if (r.slider.toggle) {
      options.push({ slider: r.slider, lo: 0, hi: 1, gain: offsets.length, cost: 1 + 1 - (r.hi - r.lo) });
      continue;
    }
    const near = offsets.slice(0, FEW);
    const lo = Math.min(r.lo, r.lo + Math.min(0, ...near) - 0.005);
    const hi = Math.max(r.hi, r.hi + Math.max(0, ...near) + 0.005);
    options.push({ slider: r.slider, lo, hi, gain: near.length, cost: hi - lo - (r.hi - r.lo) });
    if (offsets.length > near.length) options.push({ slider: r.slider, lo: 0, hi: 1, gain: offsets.length, cost: 1 + 1 - (r.hi - r.lo) });
  }
  return options.sort((a, b) => a.cost - b.cost);
}
