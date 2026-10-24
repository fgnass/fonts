// The data the app works with, loaded once at start: the font list, the
// measured metrics, the ligatures and the style vectors.

export interface Font {
  family: string;
  category: string;
  weight: number;
  italic: boolean;
  variants: string[];
  /** Variable axes: tag -> [min, max, default]. The filters use wght, wdth and slnt; with opsz, the browser picks the optical size; the specimen has a slider for each. */
  axes?: Partial<Record<string, [number, number, number]>>;
  /** Custom axes that load at the designers' default instead of Google's (see PINNED in scripts/download.mjs). */
  pinned?: Record<string, number>;
  /** For libre families that are not on Google Fonts (catalog/*.json); Google families have none. */
  libre?: Libre;
  index: number;
}

/** Where a libre family comes from (see scripts/libre.py). */
export interface Libre {
  foundry: string;
  designers: string[];
  /** SPDX identifier, e.g. "OFL-1.1". */
  license: string;
  /** The page of the family at the foundry. */
  url: string;
  /** The directory of its web files in public/libre/. */
  dir: string;
  /** Whether there are subsets: a small file with the common characters and one with other Latin, Greek and Cyrillic characters (not allowed under a Reserved Font Name). */
  subset: boolean;
  /** The format of the unchanged files of the foundry when it is not woff2 (families without subsets). */
  format?: string;
  /** A variable font of the family, for the axis sliders of the specimen (filters and measurements use the static files). */
  variable?: { format: string; axes: Partial<Record<string, [number, number, number]>> };
}

/** Measured values of a family (see scripts/measure.mjs and the other scripts for the keys). */
export interface Metric {
  /** Consistent hollow/outlined strokes (scripts/stroke-fill.mjs), 0..1. */
  hf?: number;
  /** Per variant ("400", "700i", …): [weight, slant]. */
  v?: Record<string, [number | null, number]>;
  /** Width along the wdth axis: [[wdth, width], …]. */
  wd?: [number, number][];
  /** 0 for fonts without real lowercase letters. */
  lc?: number;
  /** How distinct the letters are from one another (scripts/distinct.mjs): about 1 for a text face, 0 when all letters look the same. */
  dx?: number;
  /** Letter recognition among reference glyphs (scripts/recognize.py), 0..1; below 0.2 has no recognizable letters. */
  lr?: number;
  /** Cap height in em. */
  h?: number | null;
  [key: string]: unknown;
}

/** The style to show a font in. */
export interface Style {
  weight: number;
  italic: boolean;
  slnt?: number;
  wdth?: number;
}

/** The style a font is shown in: its pick from the filters, or the default style of the family. */
export const displayedStyle = (font: Font & { pick?: Style }): Style => font.pick ?? { weight: font.weight, italic: font.italic };

export const STYLE_DIMS = 128;

/** Technical statistics of a family, from the full font file (see scripts/tech.py). */
export interface Tech {
  /** Number of glyphs. */
  g: number;
  /** OpenType feature tags. */
  f: string[];
  /** Number of ligatures. */
  l: number;
  /** Variable axis tags. */
  a: string[];
  /** 1 for fonts with embedded color tables, 0 for monochrome fonts. */
  c?: number;
}

const [fontList, metricList, ligatureList, styleBuffer, techList] = await Promise.all([
  fetch('/data/fonts.json').then((r) => r.json() as Promise<Omit<Font, 'index'>[]>),
  fetch('/data/metrics.json').then((r) => r.json() as Promise<Metric[]>),
  fetch('/data/ligatures.json').then((r) => r.json() as Promise<({ liga?: string[] } | null)[]>),
  fetch('/data/style.bin').then((r) => (r.ok && r.headers.get('content-type') !== 'text/html' ? r.arrayBuffer() : null)),
  fetch('/data/tech.json').then((r) => (r.ok && r.headers.get('content-type') !== 'text/html' ? (r.json() as Promise<(Tech | null)[]>) : [])),
]);

export const fonts: Font[] = fontList.map((f, index) => ({ ...f, index }));
export const metrics = metricList;

// Exclude both repeated shapes and distinct symbols that do not resemble their assigned letters.
// Unknown measurements pass. Textures with recognizable letters can still be unsuitable for shape search.
const NO_LETTERFORMS = 0.2, NO_RECOGNITION = 0.2, NO_SKELETON = 0.5;
// Letters on built-in guide lines or a grid: the ink fills the whole box (capitals as tall as the em) while the letters barely differ.
const FILLED_BOX_HEIGHT = 0.95, FILLED_BOX_DISTINCT = 0.4;
export const hasLetterforms = (index: number) => {
  const m = metrics[index], dx = m?.dx ?? 1;
  // A cap height of null means the font was measured but has no H: its "latin" subset has no Latin letters (Ponnala).
  if (m?.h === null) return false;
  return dx >= NO_LETTERFORMS && (m?.lr ?? 1) >= NO_RECOGNITION && !((m?.h ?? 0) >= FILLED_BOX_HEIGHT && dx < FILLED_BOX_DISTINCT);
};
export const hasSkeleton = (index: number) => hasLetterforms(index) && (metrics[index]?.dx ?? 1) >= NO_SKELETON;
// Barcode fonts with a caption pass the measurements (the caption has recognizable letters), but they are no typefaces.
const NOT_A_TYPEFACE = /\bbarcode\b/i;
/** The fonts the app shows: monochrome fonts with recognizable letterforms. */
export const textFonts = fonts.filter((f) => hasLetterforms(f.index) && !techList[f.index]?.c && !NOT_A_TYPEFACE.test(f.family));
export const ligatures = ligatureList;
export const byFamily = new Map(fonts.map((f) => [f.family, f]));
export const tech = fonts.map((f) => techList[f.index] ?? null);

// The technical statistics as metrics, so that the sliders can filter by them.
fonts.forEach((f) => {
  const m = metrics[f.index], t = tech[f.index];
  m.styles = f.variants.length;
  m.elsewhere = f.libre ? 1 : 0;
  if (!t) return;
  m.glyphs = t.g;
  m.features = t.f.length;
  m.ligatures = t.l;
  m.axes = t.a.length;
});

/** A measured value of a family, or null. */
export const metricValue = (index: number, key: string) => {
  const v = metrics[index]?.[key];
  return typeof v === 'number' ? v : null;
};

// One vector per font for its overall look (weight, contrast, width, texture,
// decoration), L2-normalized. Fonts without a vector are zero rows.
export const vectors = new Float32Array(fonts.length * STYLE_DIMS);
export const hasStyle = new Uint8Array(fonts.length);
export const hasStyles = styleBuffer != null;
if (styleBuffer) {
  const raw = new Int8Array(styleBuffer);
  for (let i = 0; i < fonts.length; i++) {
    const o = i * STYLE_DIMS;
    let n = 0;
    for (let d = 0; d < STYLE_DIMS; d++) n += raw[o + d] ** 2;
    if (!n) continue;
    hasStyle[i] = 1;
    for (let d = 0; d < STYLE_DIMS; d++) vectors[o + d] = raw[o + d] / Math.sqrt(n);
  }
}

export const dot = (a: Float32Array, ao: number, b: Float32Array, bo: number) => {
  let s = 0;
  for (let d = 0; d < STYLE_DIMS; d++) s += a[ao + d] * b[bo + d];
  return s;
};

/** Cosine distance between the looks of two fonts (1 if one has no vector). */
export function styleDistance(a: number, b: number) {
  if (a === b) return 0;
  if (!hasStyle[a] || !hasStyle[b]) return 1;
  return 1 - dot(vectors, a * STYLE_DIMS, vectors, b * STYLE_DIMS);
}

/**
 * The default ligatures the font uses for `text` (greedy, longest match first,
 * like a shaper applying a ligature lookup).
 */
export function ligaturesIn(font: Font, text: string) {
  const ligs = ligatures[font.index]?.liga;
  if (!ligs) return [];
  const used: string[] = [];
  for (let i = 0; i < text.length; ) {
    let best = '';
    for (const l of ligs) if (l.length > best.length && text.startsWith(l, i)) best = l;
    if (best) {
      used.push(best);
      i += best.length;
    } else i++;
  }
  return used;
}

/** Number of characters that disappear into ligatures. */
export const ligatureScore = (ligs: string[]) => ligs.reduce((n, l) => n + l.length - 1, 0);
