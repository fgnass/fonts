// Groups of similar-looking fonts, from the style vectors.
//
// The groups are computed once for all fonts, at several levels of detail
// (groups-worker.ts). Filtering only picks the best passing font of each group. Group membership
// and order stay fixed while a slider moves.
import { signal } from '@preact/signals';
import { type Font, hasStyle, STYLE_DIMS, styleDistance, textFonts, vectors } from './data';
import type { GroupLevel, GroupRequest } from './groups-worker';

const SIMILAR = 120; // fonts shown for "similar fonts" when not grouping
/** Fixed browsing groups; filtering must not select a different partition. */
const LEVELS = [80];

/** A font with the group of similar fonts it stands for (the representative first). */
export type Rep<T extends Font> = T & { group: T[] };

/** The levels computed so far, by number of groups. */
export const groupLevels = signal<Map<number, GroupLevel>>(new Map());

const worker = new Worker(new URL('./groups-worker.ts', import.meta.url), { type: 'module' });
worker.onmessage = ({ data }: MessageEvent<GroupLevel>) => (groupLevels.value = new Map(groupLevels.value).set(data.k, data));
worker.postMessage({ vectors, hasStyle, dims: STYLE_DIMS, levels: LEVELS } satisfies GroupRequest);

// Rank each group by its unfiltered representative's popularity. Replacements
// inherit this position rather than crossing their neighbours.
const groupOrders = new WeakMap<GroupLevel, Map<number, number>>();
function groupOrder(level: GroupLevel) {
  let order = groupOrders.get(level);
  if (order) return order;
  order = new Map<number, number>();
  for (const f of textFonts) {
    const id = level.assign[f.index];
    if (id < 0) continue;
    const current = order.get(id);
    if (current == null || level.sim[f.index] > level.sim[current]) order.set(id, f.index);
  }
  groupOrders.set(level, order);
  return order;
}

/** Fonts of `list` by group at a level (fonts without a style vector are left out). */
function bucket<T extends Font>(list: T[], level: GroupLevel) {
  const groups = new Map<number, T[]>();
  for (const f of list) {
    const g = level.assign[f.index];
    if (g < 0) continue;
    const members = groups.get(g);
    if (members) members.push(f);
    else groups.set(g, [f]);
  }
  return groups;
}

/**
 * One passing representative per fixed group, closest to its center. Groups
 * keep their unfiltered popularity order even when representatives change.
 * Empty groups disappear; remaining groups retain their relative order.
 */
export function groupFonts<T extends Font>(list: T[], k: number): Rep<T>[] {
  const level = groupLevels.value.get(k);
  if (!level) return list.map((f) => ({ ...f, group: [f] }));
  const order = groupOrder(level);
  return [...bucket(list, level).entries()]
    .sort(([a], [b]) => order.get(a)! - order.get(b)!)
    .map(([, group]) => {
      group.sort((a, b) => level.sim[b.index] - level.sim[a.index] || a.index - b.index);
      return { ...group[0], group };
    });
}

/** The fonts in `list` that look like `font`, most similar first (its group, when grouping with k groups). */
export function similarFonts<T extends Font>(list: T[], font: Font, k: number): T[] {
  if (k) {
    const rep = groupFonts(list, k).find((r) => r.group.some((f) => f.index === font.index));
    if (rep && rep.group.length > 1) return rep.group;
  }
  return list
    .map((f) => ({ f, d: styleDistance(font.index, f.index) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, SIMILAR)
    .map(({ f }) => f);
}

/** Maps each font of the groups to its group. */
export function groupOf<T extends Font>(reps: Rep<T>[]) {
  const map = new Map<number, T[]>();
  for (const r of reps) for (const f of r.group) map.set(f.index, r.group);
  return map;
}

/** The best result of each group (results are sorted, best first), with its group. Fonts without a group stay. */
export function bestOfGroups<R extends { index: number }>(results: R[], groups: Map<number, Font[]>, limit: number) {
  const seen = new Set<Font[] | undefined>();
  const out: (R & { group?: Font[] })[] = [];
  for (const r of results) {
    const group = groups.get(r.index);
    if (group && seen.has(group)) continue;
    seen.add(group);
    out.push({ ...r, group });
    if (out.length === limit) break;
  }
  return out;
}
