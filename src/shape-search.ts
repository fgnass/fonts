// Owns worker requests, stale-response handling and the shape-search view.
import { computed, effect, signal } from '@preact/signals';
import { CHARS, SYMBOLS } from './chars.js';
import { type Font, fonts, hasSkeleton, ligaturesIn, metrics, type Style, textFonts } from './data';
import type { FilterResult } from './filter';
import { bestOfGroups, groupFonts, groupOf } from './groups';
import type { SearchHit, SearchPart, SearchRequest, SearchResponse } from './search-types';
import type { View } from './state';

const LIMIT = 120;
const GROUPED_LIMIT = 2000; // worker hits before selecting the best font of each group

interface Inputs {
  open: () => boolean;
  query: () => SearchPart[];
  extra: () => string;
  withinFilters: () => boolean;
  filtered: () => FilterResult;
  font: () => Font | null;
  groupCount: () => number;
  text: () => string;
  pausedNote: () => string;
}

/** Accessors keep dependencies reactive without importing the app's state at runtime. */
export function createShapeSearch(inputs: Inputs) {
  const worker = new Worker(new URL('./search-worker.ts', import.meta.url), { type: 'module' });
  let searchId = 0;

  interface ShapeSearch {
    id: number;
    /** The style to show per font, from the filters. */
    picks: Map<number, Style>;
    /** Font index -> group, when grouping. */
    groups: Map<number, Font[]> | null;
  }

  /** The running shape search, or a message why there is none. */
  const shapeSearch = signal<ShapeSearch | { message: string } | null>(null);
  // Keep the last completed search together with its response while its successor runs.
  // Its style picks and groups must match the hits, even when the filters have moved on.
  const shapeResponse = signal<{ search: ShapeSearch; data: SearchResponse } | null>(null);

  worker.onmessage = ({ data }: MessageEvent<SearchResponse>) => {
    const search = shapeSearch.peek();
    if (!search || !('id' in search) || data.id !== search.id) return;
    shapeResponse.value = { search, data };
  };

  // Search only while Shape is open; keep its last response and settings while paused.
  effect(() => {
    if (!inputs.open()) return;
    const query = inputs.query();
    if (!query.length) {
      shapeSearch.value = null;
      shapeResponse.value = null;
      return;
    }
    const x = inputs.extra();
    if (x && !CHARS.includes(x)) {
      shapeResponse.value = null;
      shapeSearch.value = { message: `Only a–z, A–Z, 0–9, ä ö ü ß Ä Ö Ü and ${[...SYMBOLS].join(' ')} are indexed.` };
      return;
    }
    // Filters affect both eligibility and style only when explicitly enabled.
    const restrict = inputs.withinFilters();
    const picks = new Map<number, Style>(restrict ? inputs.filtered().list.map((f) => [f.index, f.pick]) : []);
    const list: Font[] = restrict ? inputs.filtered().list : textFonts;
    // Barcode, texture and multi-line fonts have skeletons that do not describe their letters: only the example font itself may be one.
    const font = inputs.font();
    const pool = list.filter((f) => hasSkeleton(f.index) || f.index === font?.index);
    // With groups, the worker sends more results, and only the best font of each group stays.
    const k = inputs.groupCount();
    const search: ShapeSearch = { id: ++searchId, picks, groups: k ? groupOf(groupFonts(list, k)) : null };
    shapeSearch.value = search;
    const request: SearchRequest = {
      id: search.id,
      parts: query,
      allowed: pool.map((f) => f.index),
      // In fonts without real lowercase letters, a lowercase character is a capital.
      noLower: pool.filter((f) => metrics[f.index].lc === 0).map((f) => f.index),
      limit: search.groups ? GROUPED_LIMIT : LIMIT,
    };
    worker.postMessage(request);
  });

  const quote = (chars: string[]) => chars.map((c) => `“${c}”`).join(', ');

  const shapeView = computed((): View => {
    const pending = shapeSearch.value;
    if (!pending) return { items: [], status: '' };
    if ('message' in pending) return { items: [], status: pending.message };
    const response = shapeResponse.value;
    const query = inputs.query(), font = inputs.font();
    const all = query[0]?.ch === '';
    if (!response) return { items: [], status: all ? 'Searching all characters…' : 'Searching…' };
    const { search, data } = response;
    const searching = search.id !== pending.id;
    // Preserve the worker's similarity order, including when selecting group representatives.
    const hits: (SearchHit & { group?: Font[] })[] = search.groups ? bestOfGroups(data.results, search.groups, LIMIT) : data.results;
    const fromFont = query.filter((p) => p.fontIndex != null).map((p) => p.ch);
    const drawn = query.filter((p) => p.pts).map((p) => p.ch);
    let status: string;
    if (!data.total) status = `No font has all of ${quote(query.map((p) => p.ch))}.`;
    else {
      status = `Top ${hits.length} of ${data.total} fonts`;
      if (all) status += ', each with its character most like the sketch';
      else {
        const like: string[] = [];
        if (fromFont.length && font) like.push(`${quote(fromFont)} like ${font.family}`);
        if (drawn.length) like.push(`${quote(drawn)} like your drawing`);
        status += ` with ${like.join(' and ')}`;
      }
      status += (search.groups ? ' (one per group of similar-looking fonts)' : '') + inputs.pausedNote();
      if (data.usedChamfer.length) status += ` (no AI features yet for ${quote(data.usedChamfer)}: skeleton distance)`;
    }
    const t = inputs.text();
    const items = hits.map((r) => ({
      ...fonts[r.index],
      pick: search.picks.get(r.index),
      score: r.score,
      ch: r.ch,
      skeletons: r.skeletons,
      group: r.group,
      ligs: ligaturesIn(fonts[r.index], t),
    }));
    return { items, status: searching ? (all ? 'Searching all characters…' : 'Searching…') : status };
  });

  return shapeView;
}
