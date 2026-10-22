// The state of the app as signals, and the searches that follow from it.
import { batch, computed, effect, type Signal, signal } from '@preact/signals';
import { CHARS } from './chars.js';
import { type Font, fonts, hasSkeleton, hasStyles, ligaturesIn, metrics, type Style, textFonts } from './data';
import { activeRanges, compromises, exclusionSuggestions, filterFonts, type ExclusionPlan } from './filter';
import { groupFonts } from './groups';
import type { SearchPart } from './search-types';
import { createShapeSearch } from './shape-search';
import { sketchPoints } from './shape.js';
import { type Corridor, isAny, SLIDERS } from './sliders';

/** The preview when nothing is typed. */
export const DEFAULT_TEXT = 'Abc';
export const MAX_LINES = 3;

export interface Point {
  x: number;
  y: number;
}

/** A card in the results. */
export type Item = Font & {
  pick?: Style;
  /** Ligatures the font uses in the preview text. */
  ligs: string[];
  /** Other fonts of its group (when grouping). */
  group?: Font[];
  /** Shape search: score, the matched character (search over all characters) and the skeletons of the query letters. */
  score?: number;
  ch?: string;
  skeletons?: Uint8Array[];
};

/** A copy of a signal that follows it after `ms` of quiet. */
function debounced<T>(source: Signal<T>, ms: number) {
  const out = signal(source.peek());
  let timer: ReturnType<typeof setTimeout>;
  effect(() => {
    const v = source.value;
    clearTimeout(timer);
    timer = setTimeout(() => (out.value = v), ms);
  });
  return out;
}

/** A copy of a signal that follows it at most every `ms` while it changes, and always takes the last value. */
function throttled<T>(source: Signal<T>, ms: number) {
  const out = signal(source.peek());
  let last = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  effect(() => {
    source.value;
    clearTimeout(timer);
    const wait = last + ms - performance.now();
    const apply = () => {
      last = performance.now();
      out.value = source.peek();
    };
    if (wait <= 0) apply();
    else timer = setTimeout(apply, wait);
  });
  return out;
}

// --- Inputs ------------------------------------------------------------------

export const corridors = signal<Record<string, Corridor>>(Object.fromEntries(SLIDERS.map((s) => [s.key, [0, 1] as Corridor])));
// A slider that needs another one (serif type needs serifs) is hidden while that one allows its left end, so it must not filter then.
effect(() => {
  const c = corridors.value;
  for (const s of SLIDERS) {
    if (s.requires && c[s.requires][0] <= 0 && !isAny(c[s.key])) corridors.value = { ...c, [s.key]: [0, 1] };
  }
});
export const text = signal('');
/** The start screen, shown when the app opens. */
export const welcome = signal(true);
/** A hint on the first slider that its ends can be dragged, shown on every visit until a slider is used. */
export const sliderHint = signal(true);
export const dismissSliderHint = () => { sliderHint.value = false; };
export const DEFAULT_GROUP_COUNT = 80;
export const groupCount = signal(hasStyles ? DEFAULT_GROUP_COUNT : 0);
export const previewSize = signal(44);

const SHORTLIST_KEY = 'fonts.shortlist';
function readShortlist(): Set<string> {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(SHORTLIST_KEY) ?? '[]');
    return new Set(Array.isArray(saved) ? saved.filter((name): name is string => typeof name === 'string' && textFonts.some((f) => f.family === name)) : []);
  } catch {
    return new Set();
  }
}
export const shortlist = signal(readShortlist());
export const showShortlist = signal(false);
const workspaceScroll = { explore: 0, shortlist: 0 };
/** Switch workspaces without changing discovery settings or losing either scroll position. */
export function selectWorkspace(saved: boolean) {
  if (saved === showShortlist.value) return;
  workspaceScroll[showShortlist.value ? 'shortlist' : 'explore'] = window.scrollY;
  showShortlist.value = saved;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    window.scrollTo(0, workspaceScroll[saved ? 'shortlist' : 'explore']);
  }));
}
effect(() => {
  const saved = [...shortlist.value];
  try { localStorage.setItem(SHORTLIST_KEY, JSON.stringify(saved)); } catch { /* Storage may be unavailable. */ }
});
export function toggleShortlist(family: string) {
  const next = new Set(shortlist.value);
  if (next.has(family)) next.delete(family);
  else next.add(family);
  shortlist.value = next;
}
// The shape query is made of letters: those of the typed name (plus one extra character), each either
// drawn on the pad or taken from the example font. The user leaves letters out by excluding them.
/** The example font: fills every query letter that is not drawn. */
export const likeFont = signal<Font | null>(null);
/** One more character, typed into the small field next to the letters of the name. */
export const extra = signal('');
/** Letters of the name that are left out of the query. */
export const excluded = signal<string[]>([]);
/** Strokes drawn per letter ('' for a sketch compared with all characters). */
export const sketches = signal<Record<string, Point[][]>>({});
/** The letter shown on the pad (null: the first letter of the name; '': any character). */
export const focus = signal<string | null>(null);
export const showSkeletons = signal(false);
/** The open tab of the console. */
export const tab = signal<'look' | 'technical' | 'shape' | null>('look');

export const inspectedFont = signal<Item | null>(null);
export const exclusionMessage = signal<string | null>(null);
export const lastExclusion = signal<{
  plan: ExclusionPlan;
  before: Record<string, Corridor>;
  tab: typeof tab.value;
} | null>(null);
export const exclusionPreview = signal<ExclusionPlan | null>(null);
export const pendingExclusion = signal<{
  family: string;
  options: ExclusionPlan[];
  before: Record<string, Corridor>;
  tab: typeof tab.value;
  searching: boolean;
  query: SearchPart[];
} | null>(null);

export function cancelExclusion() {
  batch(() => {
    pendingExclusion.value = null;
    exclusionPreview.value = null;
  });
}

export function dismissExclusion() {
  cancelExclusion();
  lastExclusion.value = null;
  exclusionMessage.value = null;
}

export function dislikeFont(font: Font) {
  const before = corridors.value, previousTab = tab.value;
  const searching = activeShapeQuery.value;
  const needsLower = searching && parts.value.some((p) => p.ch >= 'a' && p.ch <= 'z');
  const allowed = searching ? new Set(textFonts.filter((f) =>
    (hasSkeleton(f.index) || f.index === likeFont.value?.index) && !(needsLower && metrics[f.index].lc === 0)).map((f) => f.index)) : undefined;
  batch(() => {
    inspectedFont.value = null;
    exclusionPreview.value = null;
    pendingExclusion.value = { family: font.family, options: exclusionSuggestions(font, before, allowed), before, tab: previousTab, searching, query: parts.value };
  });
}

export function applyExclusion(plan: ExclusionPlan) {
  const pending = pendingExclusion.value;
  if (!pending || !pending.options.includes(plan)) return;
  batch(() => {
    cancelExclusion();
    lastExclusion.value = { plan, before: pending.before, tab: pending.tab };
    exclusionMessage.value = `${plan.label} · ${pending.family} removed · ${plan.removed} font${plan.removed === 1 ? '' : 's'} excluded`;
    corridors.value = { ...pending.before, [plan.slider.key]: plan.corridor };
    if (!pending.searching) tab.value = 'look';
  });
}

export const setCorridor = (key: string, value: Corridor) => {
  dismissExclusion();
  corridors.value = { ...corridors.value, [key]: value };
};
/** Sets the sliders (all by default) back to any. */
export const resetCorridors = (sliders = SLIDERS) => {
  dismissExclusion();
  corridors.value = { ...corridors.value, ...Object.fromEntries(sliders.map((s) => [s.key, [0, 1] as Corridor])) };
};

// --- Derived -----------------------------------------------------------------

// Filtering all fonts takes about 10 ms, so while a slider moves it runs at most every 50 ms.
const appliedCorridors = throttled(corridors, 50);
const appliedText = debounced(text, 250);

/** One shared text for the cards and query, including the default when the input is empty. */
export const previewText = computed(() => appliedText.value.trim() || DEFAULT_TEXT);

/** How many letters a shape query can have. */
export const MAX_QUERY_LETTERS = 4;
/** The letters that can be part of the query: the first ones of the preview (indexed characters only) and the extra one. */
export const letters = computed(() => {
  const list = [...new Set([...previewText.value].filter((c) => CHARS.includes(c)))];
  const x = extra.value;
  // The extra character always has a place, also when the text has it beyond the first letters.
  if (x) return [...list.filter((c) => c !== x).slice(0, MAX_QUERY_LETTERS - 1), x];
  return list.slice(0, MAX_QUERY_LETTERS);
});
/** The letter on the pad: the chosen one while it is a letter of the query, else the first letter. A sketch of a letter that left the text is kept but ignored. */
export const focused = computed(() => {
  const f = focus.value;
  return f === '' || (f != null && letters.value.includes(f)) ? f : letters.value[0] ?? '';
});
/** The strokes on the pad: the sketch of the focused letter. */
export const strokes = computed(() => sketches.value[focused.value] ?? []);
/**
 * The parts of the shape query, one per letter: its sketch, else the glyph of
 * the example font. With "any" on the pad, its sketch alone, compared with all characters.
 */
export const parts = computed((): SearchPart[] => {
  const sk = sketches.value, font = likeFont.value;
  if (focused.value === '') return sk['']?.length ? [{ ch: '', pts: sketchPoints(sk['']) }] : [];
  const out: SearchPart[] = [];
  for (const ch of letters.value) {
    if (excluded.value.includes(ch)) continue;
    if (sk[ch]?.length) out.push({ ch, pts: sketchPoints(sk[ch]) });
    else if (font) out.push({ ch, fontIndex: font.index });
  }
  return out;
});
export const isShapeQuery = computed(() => parts.value.length > 0);
/** Shape settings are preserved in other tabs, but only affect results in Shape. */
export const activeShapeQuery = computed(() => tab.value === 'shape' && isShapeQuery.value);
// A proposal is valid only for the selection it was calculated from.
effect(() => {
  const pending = pendingExclusion.value;
  if (pending && (showShortlist.value || corridors.value !== pending.before  || tab.value !== pending.tab || parts.value !== pending.query)) cancelExclusion();
});
export const filtered = computed(() => filterFonts(activeRanges(appliedCorridors.value)));
export const suggestions = computed(() => showShortlist.value ? null : compromises(filtered.value));

/** The lines shown on each card: the lines of the text as typed, at most MAX_LINES. */
export const previewLines = computed(() => {
  const lines = previewText.value.split('\n').map((l) => l.trim()).filter(Boolean);
  return [...new Set(lines)].slice(0, MAX_LINES);
});

export interface View {
  items: Item[];
  status: string;
}

const fontCount = (n: number) => `${n} font${n === 1 ? '' : 's'}`;

/** Browsing: all fonts that pass the filters, in popularity order, with stable group positions when grouping. */
const browseView = computed((): View => {
  const t = previewText.value;
  const k = groupCount.value;
  let list: (Font & { pick?: Style; group?: Font[] })[] = filtered.value.list;
  let status = fontCount(list.length);
  if (k) {
    list = groupFonts(list, k);
    status += ` in ${list.length} groups of similar-looking fonts`;
  }
  const items = list.map((f) => ({ ...f, ligs: ligaturesIn(f, t) }));
  return { items, status };
});

// --- Shape search ------------------------------------------------------------

const shapeView = createShapeSearch({
  open: () => tab.value === 'shape',
  query: () => parts.value,
  extra: () => extra.value,
  filtered: () => filtered.value,
  font: () => likeFont.value,
  groupCount: () => groupCount.value,
  text: () => previewText.value,
});

export const view = computed(() => (activeShapeQuery.value ? shapeView.value : browseView.value));

// --- Actions -----------------------------------------------------------------

// --- Workspaces ---------------------------------------------------------------

/** The tabs: the overview, the shape query and the shortlist (tabs at the top left, or the tab bar on narrow screens). */
export type Workspace = 'explore' | 'shape' | 'shortlist';
export const workspace = computed<Workspace>(() => (showShortlist.value ? 'shortlist' : tab.value === 'shape' ? 'shape' : 'explore'));

/** Opens a tab; leaving Shape keeps its query for later. */
export function openWorkspace(next: Workspace) {
  if (next === workspace.value) return;
  batch(() => {
    selectWorkspace(next === 'shortlist');
    if (next === 'shape') tab.value = 'shape';
    else if (next === 'explore' && tab.value === 'shape') tab.value = 'look';
  });
  if (next === 'shape') window.scrollTo(0, 0);
}

// --- Undo of filter changes --------------------------------------------------

/** Filters before each change; a drag counts as one change once it rests. */
const undoStack = signal<Record<string, Corridor>[]>([]);
const SETTLE_MS = 500;
let settled = corridors.peek();
let settleTimer: ReturnType<typeof setTimeout> | undefined;
let undoing = false;
effect(() => {
  const now = corridors.value;
  clearTimeout(settleTimer);
  if (undoing) return void (settled = now);
  settleTimer = setTimeout(() => {
    if (now === settled) return;
    undoStack.value = [...undoStack.value.slice(-49), settled];
    settled = now;
  }, SETTLE_MS);
});

/** Whether a filter change can be undone, also one that is still settling. */
export const canUndo = computed(() => undoStack.value.length > 0 || corridors.value !== settled);

/** Puts the filters back to before the last change (a slider move, a reset or an exclusion). */
export function undoFilters() {
  clearTimeout(settleTimer);
  const pending = corridors.peek() !== settled;
  const target = pending ? settled : undoStack.peek().at(-1);
  if (!target) return;
  undoing = true;
  batch(() => {
    if (!pending) undoStack.value = undoStack.value.slice(0, -1);
    corridors.value = target;
    lastExclusion.value = null;
    exclusionMessage.value = null;
  });
  undoing = false;
}


/** Makes `font` the example (or removes it with null): its glyphs stand in for every letter that is not drawn. */
export function setLikeFont(font: Font | null) {
  batch(() => {
    likeFont.value = font;
  });
}

/**
 * A tap on a card: the fonts whose letters look like those of `font`. Opens
 * the Shape tab with the font as the example. Each step is a history entry,
 * so that "back" returns to the font before; a tap outside the Shape tab
 * starts a new chain.
 */
export function showSimilar(font: Font) {
  const inShape = tab.value === 'shape' && !showShortlist.value;
  if (inShape && likeFont.value?.index === font.index) return;
  const depth = inShape ? chainDepth.value + 1 : 1;
  // The current entry may still describe an older Shape chain after returning
  // to Explore. Make it the boundary so Back from this new chain exits Shape.
  if (!inShape) history.replaceState(null, '');
  history.pushState({ similar: font.index, depth, session } satisfies SimilarEntry, '');
  chainDepth.value = depth;
  openSimilar(font);
}

/** The history entry of a "similar" step: the example font, how many steps the chain has up to it, and the page load that made it. */
type SimilarEntry = { similar: number; depth: number; session: number };
// Entries outlive a reload, but the query of that page is gone: entries of other loads only lead out of the Shape tab.
const session = Math.random();
const similarEntry = (state: unknown) => ((state as SimilarEntry | null)?.session === session ? (state as SimilarEntry) : null);
/** How many "similar" steps lead to the current example font: above 1, "back" has a font to return to. */
export const chainDepth = signal(0);

/** A new query from the font: its letters only, without the sketches and left-out letters of the query before. */
function openSimilar(font: Font) {
  batch(() => {
    showShortlist.value = false;
    sketches.value = {};
    excluded.value = [];
    setLikeFont(font);
    tab.value = 'shape';
    if (focus.value === '') focus.value = null;
  });
  window.scrollTo(0, 0);
}

// "Back" goes to the font before in the chain; before the first step, out of the Shape tab (the query stays for later).
addEventListener('popstate', (e: PopStateEvent) => {
  const entry = similarEntry(e.state);
  chainDepth.value = entry?.depth ?? 0;
  if (entry && fonts[entry.similar]) openSimilar(fonts[entry.similar]);
  else if (tab.value === 'shape') tab.value = 'look';
});

/** Shows `ch` on the pad; a left-out letter comes back into the query. */
export function pickLetter(ch: string) {
  batch(() => {
    if (excluded.value.includes(ch)) excluded.value = excluded.value.filter((c) => c !== ch);
    focus.value = ch;
  });
}

/** Adds a finished stroke to the sketch of the focused letter. */
export function addStroke(stroke: Point[]) {
  batch(() => {
    const ch = focused.value;
    sketches.value = { ...sketches.value, [ch]: [...(sketches.value[ch] ?? []), stroke] };
    // A drawing brings a left-out letter back into the query.
    if (excluded.value.includes(ch)) excluded.value = excluded.value.filter((c) => c !== ch);
  });
}

export const undoStroke = () => {
  const ch = focused.value;
  sketches.value = { ...sketches.value, [ch]: (sketches.value[ch] ?? []).slice(0, -1) };
};

/** Clears the pad: the sketch of the focused letter; without one, the letter leaves the query and the pad stays empty for a drawing. */
export function clearPad() {
  const ch = focused.value;
  if (sketches.value[ch]?.length) {
    const { [ch]: _, ...rest } = sketches.value;
    sketches.value = rest;
  } else if (ch && !excluded.value.includes(ch)) {
    excluded.value = [...excluded.value, ch];
  }
}

/** Ends the whole query: all sketches, the example font and the left-out letters. */
export function clearQuery() {
  batch(() => {
    sketches.value = {};
    likeFont.value = null;
    excluded.value = [];
  });
}
