// Loading fonts on demand: small subsets of Google Fonts for the text, or the
// files of the libre families (scripts/libre.py).
import type { Font, Style } from './data';

interface Entry {
  /** Resolves to true when the font can be used, false when loading failed. */
  promise: Promise<boolean>;
  faces?: FontFace[];
  /** Components that show the font right now (see retain). */
  refs: number;
  /** Last use, for eviction (see evict). */
  used: number;
  /** When the face was loaded: a fresh face is not evicted before its consumers could retain it. */
  loadedAt: number;
}

/** Loaded faces beyond this many are evicted when nothing shows them any more. */
const MAX_FACES = 400;
/** How long a freshly loaded face is safe from eviction, ms. */
const GRACE = 2000;

const entries = new Map<string, Entry>(); // alias -> loading or loaded font
let clock = 0;

/** What the loader needs to know about a family. */
export type FontRef = Pick<Font, 'family' | 'axes' | 'variants' | 'libre' | 'pinned'>;

/** True when the font with this alias can be used without waiting. */
export function isLoaded(alias: string) {
  const e = entries.get(alias);
  if (e?.faces) e.used = ++clock;
  return !!e?.faces;
}

/** The distinct characters of a text, sorted. */
export const textChars = (text: string) => [...new Set(text)].sort().join('');

/** Options of loadFont. */
export interface LoadOptions {
  /** Loads the whole range of every variable axis (custom ones too), for the axis sliders of the specimen; for a libre family, its variable font. */
  allAxes?: boolean;
}

/** The alias, characters and CSS2 family spec for a font, style and text. */
function request(font: Pick<Font, 'family' | 'axes' | 'pinned'>, { weight, italic, slnt, wdth }: Style, text: string, { allAxes }: LoadOptions = {}) {
  const chars = textChars(text);
  let hash = 0;
  for (const c of chars) hash = (hash * 31 + c.codePointAt(0)!) >>> 0;
  const axes = font.axes ?? {};
  const range = (tag: string) => (axes[tag] ? `${axes[tag]![0]}..${axes[tag]![1]}` : undefined);
  // Custom axes (upper-case tags): their whole range for the specimen, else only the pinned values.
  const custom = allAxes
    ? Object.keys(axes).filter((t) => t !== t.toLowerCase()).sort().map((t) => [t, range(t)])
    : Object.keys(font.pinned ?? {}).sort().map((t) => [t, font.pinned![t]]);
  // Registered axes in alphabetical order, then custom ones, as the CSS2 API wants them. The
  // whole opsz range loads, so that the browser sets the optical size for the font size.
  const list = (
    [
      ['ital', italic ? 1 : 0],
      ['opsz', range('opsz')],
      ['slnt', range('slnt') ?? slnt],
      ['wdth', range('wdth') ?? wdth],
      ['wght', range('wght') ?? weight],
      ...custom,
    ] as [string, number | string | undefined][]
  ).filter(([, v]) => v != null);
  const alias = `fs-${font.family.replace(/\W/g, '')}-${list.map(([t, v]) => t + v).join('-').replace(/\W/g, '_')}-${hash.toString(36)}`;
  return { alias, chars, spec: `${font.family}:${list.map(([t]) => t).join(',')}@${list.map(([, v]) => v).join(',')}` };
}

/** The alias loadFont uses for a font, style and text (without loading anything). */
export const fontAlias = (font: FontRef, style: Style, text: string, options?: LoadOptions) =>
  font.libre ? (options?.allAxes && font.libre.variable ? libreVariableAlias(font) : libreStyle(font as LibreFont, style).alias) : request(font, style, text, options).alias;

/**
 * Loads a subset of the font with just the characters of `text` under a
 * unique alias. For the variable axes of the family, it loads the whole range
 * once, so that other values of the same style only need other
 * font-variation-settings (see variationSettings), not another file. Returns
 * the alias and a promise that resolves to true when the font can be used, or
 * to false when loading failed. Libre families load their own files (see
 * loadLibre).
 */
export function loadFont(font: FontRef, style: Style, text: string, options?: LoadOptions) {
  if (font.libre && options?.allAxes && font.libre.variable) return loadLibreVariable(font as LibreFont);
  if (font.libre) return loadLibre(font as LibreFont, style, text);
  const { alias, chars, spec } = request(font, style, text, options);
  return cached(alias, () =>
    fetch(`https://fonts.googleapis.com/css2?family=${encodeURIComponent(spec)}&text=${encodeURIComponent(chars)}`)
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((css) => {
        const url = css.match(/src:\s*url\(([^)]+)\)/)?.[1];
        if (!url) throw new Error('no font source in CSS');
        return new FontFace(alias, `url(${url})`).load();
      })
      .then((face) => [face]),
  );
}

type LibreFont = Pick<Font, 'family' | 'variants'> & { libre: NonNullable<Font['libre']> };

// The characters of the small file of a libre style (BASE_CHARS in scripts/libre.py), and all other characters
// (the second file has only those of EXT_RANGES, the browser shows the others in a fallback font).
const BASE = [...Array.from({ length: 0x5f }, (_, i) => 0x20 + i), ...[...'äöüßÄÖÜ€–—‘’‚“”„…'].map((c) => c.codePointAt(0)!)].sort((a, b) => a - b);
const hex = (n: number) => n.toString(16);
const BASE_RANGE = BASE.map((c) => 'U+' + hex(c)).join(',');
const OTHER_RANGE = [-1, ...BASE]
  .map((c, i, all) => [c + 1, (all[i + 1] ?? 0x110000) - 1])
  .filter(([a, b]) => a <= b)
  .map(([a, b]) => `U+${hex(a)}-${hex(b)}`)
  .join(',');

/** The variant of a libre family closest to the style (libre families have no variable axes), and its alias. */
function libreStyle(font: LibreFont, { weight, italic }: Style) {
  const same = font.variants.filter((v) => v.endsWith('i') === italic);
  const variant = (same.length ? same : font.variants).reduce((a, b) => (Math.abs(parseInt(b) - weight) < Math.abs(parseInt(a) - weight) ? b : a));
  return { variant, alias: `fs-${font.family.replace(/\W/g, '')}-${variant}` };
}

/**
 * Loads a style of a libre family (scripts/libre.py) under one alias for all
 * texts: when subsets are allowed, a small file with the common characters
 * and a larger one with the other Latin, Greek and Cyrillic characters, else
 * the unchanged file. The browser loads only the faces whose unicode-range
 * the text touches.
 */
const libreVariableAlias = (font: Pick<Font, 'family'>) => `fs-${font.family.replace(/\W/g, '')}-var`;

/** Loads the variable font of a libre family, one file for all styles and texts (see Libre.variable). */
function loadLibreVariable(font: LibreFont) {
  const alias = libreVariableAlias(font);
  return cached(alias, () => new FontFace(alias, `url(/libre/${font.libre.dir}/variable.${font.libre.variable!.format})`).load().then((face) => [face]));
}

function loadLibre(font: LibreFont, style: Style, text: string) {
  const { variant, alias } = libreStyle(font, style);
  return cached(alias, () => {
    const url = (part: string, format = 'woff2') => `url(/libre/${font.libre.dir}/${variant}-${part}.${format})`;
    const faces = font.libre.subset
      ? [new FontFace(alias, url('base'), { unicodeRange: BASE_RANGE }), new FontFace(alias, url('ext'), { unicodeRange: OTHER_RANGE })]
      : [new FontFace(alias, url('full', font.libre.format))];
    // document.fonts.load loads only faces that are in the set, and only those the text needs.
    faces.forEach((face) => document.fonts.add(face));
    return document.fonts.load(`16px "${alias}"`, textChars(text) || 'a').then((loaded) => {
      if (loaded.length) return faces;
      faces.forEach((face) => document.fonts.delete(face));
      throw new Error('no face loaded');
    });
  });
}

/**
 * The entry for an alias: loads its faces once and adds them to
 * document.fonts. A failed load is not cached: the next call for the same
 * alias tries again.
 */
function cached(alias: string, load: () => Promise<FontFace[]>) {
  let entry = entries.get(alias);
  if (!entry) {
    const e: Entry = { refs: 0, used: ++clock, loadedAt: 0, promise: Promise.resolve(false) };
    e.promise = load().then(
      (faces) => {
        // Evicted (or superseded) while loading: do not resurrect the entry.
        if (entries.get(alias) !== e) {
          faces.forEach((face) => document.fonts.delete(face));
          return false;
        }
        faces.forEach((face) => document.fonts.add(face));
        e.faces = faces;
        e.used = ++clock;
        e.loadedAt = performance.now();
        scheduleEviction();
        return true;
      },
      () => {
        if (entries.get(alias) === e) entries.delete(alias);
        return false;
      },
    );
    entries.set(alias, e);
    entry = e;
  }
  entry.used = ++clock;
  return { alias, ready: entry.promise };
}

/**
 * Marks the font with this alias as shown, so that it is not evicted. Returns
 * a function that releases it again.
 */
export function retain(alias: string) {
  const e = entries.get(alias);
  if (!e) return () => {};
  e.refs++;
  let held = true;
  return () => {
    if (!held) return;
    held = false;
    e.refs--;
  };
}

let eviction: ReturnType<typeof setTimeout> | undefined;
/** Runs evict once the freshly loaded faces have had their grace period. */
function scheduleEviction() {
  if (eviction) return;
  eviction = setTimeout(() => {
    eviction = undefined;
    evict();
  }, GRACE);
}

/**
 * Removes the least recently used fonts that nothing shows, down to
 * MAX_FACES. Faces loaded within the grace period stay: their consumers get
 * the loaded promise first and retain them in an effect afterwards. When
 * everything is shown or fresh, the cap is exceeded for the time being.
 */
function evict() {
  let loaded = 0;
  for (const e of entries.values()) if (e.faces) loaded++;
  if (loaded <= MAX_FACES) return;
  const now = performance.now();
  const idle = [...entries].filter(([, e]) => e.faces && e.refs <= 0 && now - e.loadedAt >= GRACE).sort(([, a], [, b]) => a.used - b.used);
  for (const [alias, e] of idle) {
    if (loaded <= MAX_FACES) break;
    e.faces!.forEach((face) => document.fonts.delete(face));
    entries.delete(alias);
    loaded--;
  }
}

/**
 * CSS font-variation-settings for a style. The API can send a variable font
 * file; without these settings the browser shows its default axis values.
 */
export const variationSettings = ({ weight, wdth, slnt }: Style) =>
  ([['wght', weight], ['wdth', wdth], ['slnt', slnt]] as [string, number | undefined][])
    .filter(([, v]) => v != null)
    .map(([t, v]) => `'${t}' ${v}`)
    .join(', ');

/** Name of a style for display, e.g. " 700 Italic wdth 75" (empty for the default style of the family). */
export function styleName(style: Style, family: { weight: number; italic: boolean }) {
  const changed = style.weight !== family.weight || style.italic !== family.italic || style.slnt != null || style.wdth != null;
  if (!changed) return '';
  const format = (value: number) => +value.toFixed(2);
  return ` ${format(style.weight)}${style.italic ? ' Italic' : ''}${style.slnt != null ? ` slnt ${format(style.slnt)}` : ''}${style.wdth != null ? ` wdth ${format(style.wdth)}` : ''}`;
}
