// Groups of similar-looking fonts, from the style vectors, and the browse
// order that mixes them.
//
// The groups are computed once for all fonts, at several levels of detail
// (groups-worker.ts). Filtering only picks a passing font of each group. Group membership
// and order stay fixed while a slider moves.
import { computed, signal } from '@preact/signals';
import { type Font, fonts, hasStyle, STYLE_DIMS, styleDistance, textFonts, vectors } from './data';
import type { GroupLevel, GroupRequest } from './groups-worker';
import { random } from './random';

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

/** The seed of the browse order: a new one on each visit. */
export const shuffleSeed = signal((Math.random() * 2 ** 32) | 0);

/**
 * The browse order, as a rank per font index, and the rank of each group.
 * The fonts of each group and the groups are shuffled, then the groups take
 * turns: first one font of every group, then a second one, and so on. So the
 * first fonts give a broad overview, and every font has the same chance to be
 * seen. Fonts without a group (all of them until the groups are computed)
 * take part as groups of their own. The order does not depend on the filters,
 * so the fonts keep their relative order while a slider moves.
 */
export const browseOrder = computed(() => {
  const level = groupLevels.value.get(LEVELS[0]);
  const rand = random(shuffleSeed.value);
  const shuffled = <T>(a: T[]) => {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const members = new Map<number, number[]>();
  const loose: number[][] = [];
  for (const f of textFonts) {
    const id = level ? level.assign[f.index] : -1;
    if (id < 0) loose.push([f.index]);
    else if (members.has(id)) members.get(id)!.push(f.index);
    else members.set(id, [f.index]);
  }
  const ids = shuffled([...members.keys(), ...loose.map(() => -1)]);
  const lists = ids.map((id) => (id < 0 ? loose.pop()! : shuffled(members.get(id)!)));
  const rank = new Int32Array(fonts.length).fill(fonts.length);
  let next = 0;
  for (let round = 0; next < textFonts.length; round++) {
    for (const list of lists) if (round < list.length) rank[list[round]] = next++;
  }
  const groupRank = new Map(ids.map((id, i) => [id, i]));
  return { rank, groupRank };
});

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
 * One passing representative per fixed group: the first in the browse order,
 * so that every font of the group gets its turn when the order is shuffled.
 * The other fonts of the group follow, closest to its center first. Groups
 * keep their place in the browse order even when representatives change.
 * Empty groups disappear; remaining groups retain their relative order.
 */
export function groupFonts<T extends Font>(list: T[], k: number): Rep<T>[] {
  const level = groupLevels.value.get(k);
  if (!level) return list.map((f) => ({ ...f, group: [f] }));
  const { rank, groupRank } = browseOrder.value;
  return [...bucket(list, level).entries()]
    .sort(([a], [b]) => (groupRank.get(a) ?? 0) - (groupRank.get(b) ?? 0))
    .map(([, group]) => {
      const rep = group.reduce((a, b) => (rank[b.index] < rank[a.index] ? b : a));
      group.sort((a, b) => +(b === rep) - +(a === rep) || level.sim[b.index] - level.sim[a.index] || a.index - b.index);
      return { ...rep, group };
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
