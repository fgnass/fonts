// Loading small subsets of Google Fonts on demand.
import type { Font, Style } from './data';

interface Entry {
  /** Resolves to true when the font can be used, false when loading failed. */
  promise: Promise<boolean>;
  face?: FontFace;
  /** Components that show the font right now (see retain). */
  refs: number;
  /** Last use, for eviction (see evict). */
  used: number;
}

/** Loaded faces beyond this many are evicted when nothing shows them any more. */
const MAX_FACES = 400;

const entries = new Map<string, Entry>(); // alias -> loading or loaded font
let clock = 0;

/** True when the font with this alias can be used without waiting. */
export function isLoaded(alias: string) {
  const e = entries.get(alias);
  if (e?.face) e.used = ++clock;
  return !!e?.face;
}

/** The distinct characters of a text, sorted. */
export const textChars = (text: string) => [...new Set(text)].sort().join('');

/** The alias, characters and CSS2 family spec for a font, style and text. */
function request(font: Pick<Font, 'family' | 'axes'>, { weight, italic, slnt, wdth }: Style, text: string) {
  const chars = textChars(text);
  let hash = 0;
  for (const c of chars) hash = (hash * 31 + c.codePointAt(0)!) >>> 0;
  const axes = font.axes ?? {};
  const value = (tag: 'slnt' | 'wdth' | 'wght', v: number | undefined) => (axes[tag] ? `${axes[tag]![0]}..${axes[tag]![1]}` : v);
  // Axis tags in alphabetical order, as the CSS2 API wants them.
  const list = (
    [
      ['ital', italic ? 1 : 0],
      ['slnt', value('slnt', slnt)],
      ['wdth', value('wdth', wdth)],
      ['wght', value('wght', weight)],
    ] as [string, number | string | undefined][]
  ).filter(([, v]) => v != null);
  const alias = `fs-${font.family.replace(/\W/g, '')}-${list.map(([t, v]) => t + v).join('-').replace(/\W/g, '_')}-${hash.toString(36)}`;
  return { alias, chars, spec: `${font.family}:${list.map(([t]) => t).join(',')}@${list.map(([, v]) => v).join(',')}` };
}

/** The alias loadFont uses for a font, style and text (without loading anything). */
export const fontAlias = (font: Pick<Font, 'family' | 'axes'>, style: Style, text: string) => request(font, style, text).alias;

/**
 * Loads a subset of the font with just the characters of `text` under a
 * unique alias. For the variable axes of the family, it loads the whole range
 * once, so that other values of the same style only need other
 * font-variation-settings (see variationSettings), not another file. Returns
 * the alias and a promise that resolves to true when the font can be used, or
 * to false when loading failed. A failed load is not cached: the next call
 * for the same alias tries again.
 */
export function loadFont(font: Pick<Font, 'family' | 'axes'>, style: Style, text: string) {
  const { alias, chars, spec } = request(font, style, text);
  let entry = entries.get(alias);
  if (!entry) {
    const e: Entry = { refs: 0, used: ++clock, promise: Promise.resolve(false) };
    e.promise = fetch(`https://fonts.googleapis.com/css2?family=${encodeURIComponent(spec)}&text=${encodeURIComponent(chars)}`)
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((css) => {
        const url = css.match(/src:\s*url\(([^)]+)\)/)?.[1];
        if (!url) throw new Error('no font source in CSS');
        return new FontFace(alias, `url(${url})`).load();
      })
      .then(
        (face) => {
          // Evicted (or superseded) while loading: do not resurrect the entry.
          if (entries.get(alias) !== e) return false;
          document.fonts.add(face);
          e.face = face;
          e.used = ++clock;
          evict();
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

/** Removes the least recently used fonts that nothing shows, down to MAX_FACES. */
function evict() {
  let loaded = 0;
  for (const e of entries.values()) if (e.face) loaded++;
  if (loaded <= MAX_FACES) return;
  const idle = [...entries].filter(([, e]) => e.face && e.refs <= 0).sort(([, a], [, b]) => a.used - b.used);
  for (const [alias, e] of idle) {
    if (loaded <= MAX_FACES) break;
    document.fonts.delete(e.face!);
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
