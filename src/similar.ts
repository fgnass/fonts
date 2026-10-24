// Fonts that look like one font, by their measurements: the distance over the
// positions of the look sliders (the same values the filters use).
import { type Font, fonts } from './data';
import { fontValue } from './filter';
import { LOOK_KEYS, SLIDERS } from './sliders';

const LOOKS = SLIDERS.filter((s) => LOOK_KEYS.includes(s.key));
/** A distance needs at least this many measurements that both fonts have. */
const MIN_SHARED = 10;
/** Fonts closer than this have the same Latin letters: one design in families for several scripts (Tiro, Kaisei, Noto). */
export const SAME_LATIN = 0.002;

let positions: (number | null)[][] | null = null;
/** The slider positions of each font in its default style, measured once. */
function allPositions() {
  positions ??= fonts.map((f) => LOOKS.map((s) => {
    const v = fontValue(f, s);
    return v == null ? null : s.pos(v);
  }));
  return positions;
}

/** Root mean square distance between the slider positions of two fonts (Infinity with too few measurements in common). */
export function lookDistance(a: number, b: number) {
  const all = allPositions(), x = all[a], y = all[b];
  let sum = 0, n = 0;
  x.forEach((v, i) => {
    const w = y[i];
    if (v != null && w != null) {
      sum += (v - w) ** 2;
      n++;
    }
  });
  return n >= MIN_SHARED ? Math.sqrt(sum / n) : Infinity;
}

/**
 * `list` ordered by how close the fonts look to `target`, the target first.
 * Of fonts with the same Latin letters, only the first stays.
 */
export function bySimilarity<T extends Font>(list: T[], target: Font): T[] {
  const distance = new Map(list.map((f) => [f.index, f.index === target.index ? -1 : lookDistance(target.index, f.index)]));
  const sorted = list.filter((f) => isFinite(distance.get(f.index)!)).sort((a, b) => distance.get(a.index)! - distance.get(b.index)!);
  const kept: T[] = [];
  for (const f of sorted) {
    // Fonts with the same Latin have the same distance to the target, so only those just before can be one.
    const same = kept.slice(-8).some((k) => Math.abs(distance.get(k.index)! - distance.get(f.index)!) < SAME_LATIN && lookDistance(k.index, f.index) < SAME_LATIN);
    if (!same) kept.push(f);
  }
  return kept;
}
