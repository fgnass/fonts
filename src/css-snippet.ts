// The CSS to use fonts on a website, as shown in the specimen or the pairing:
// the stylesheet link of the Google Fonts API (or @font-face blocks to self-host
// a libre family) and a rule per role. No dependencies, so that it can be tested.
import type { Font, Style } from './data';

type FontInfo = Pick<Font, 'family' | 'category' | 'axes' | 'pinned' | 'libre' | 'variants'>;

/** Where the fonts of a website come from: files of its own, or the Google Fonts API. */
export type Hosting = 'self' | 'google';

/** A font in use: the selector of its rule, its style, and (for a text role) its size and line height. */
export interface Usage {
  selector: string;
  font: FontInfo;
  style: Style;
  /** In px. */
  size?: number;
  /** As a factor of the size. */
  lineHeight?: number;
  /** The values of the variable axes, tag -> value (see axisValues); those at the default of the family are left out. */
  axes?: Record<string, number>;
}

/** The generic family that stands in until the font has loaded. */
const FALLBACKS: Record<string, string> = { Serif: 'serif', 'Sans Serif': 'sans-serif', Monospace: 'monospace', Handwriting: 'cursive', Display: 'sans-serif' };

const WEIGHT_NAMES: Record<number, string> = { 100: 'Thin', 200: 'ExtraLight', 300: 'Light', 400: 'Regular', 500: 'Medium', 600: 'SemiBold', 700: 'Bold', 800: 'ExtraBold', 900: 'Black' };

const quote = (family: string) => `'${family.replace(/'/g, "\\'")}'`;

/** The axes of a usage that need a value: not wght (that is font-weight), not those at the default of the family unless Google pins them elsewhere. */
function customAxes({ font, axes = {} }: Usage): [string, number][] {
  return Object.entries(axes)
    .filter(([tag, value]) => tag !== 'wght' && tag !== 'ital' && (value !== font.axes?.[tag]?.[2] || tag in (font.pinned ?? {})))
    .sort(([a], [b]) => a.localeCompare(b));
}

/** The usages grouped by family, in the order of first use. */
function usagesByFamily(usages: Usage[]): Usage[][] {
  const groups = new Map<string, Usage[]>();
  for (const u of usages) groups.set(u.font.family, [...(groups.get(u.font.family) ?? []), u]);
  return [...groups.values()];
}

/**
 * The family spec of the CSS2 API for the usages of one family: the axis tags
 * in the order the API wants (lower-case first, each sorted), then a tuple of
 * values per style. A variable weight covers the range of the weights in use.
 */
function familySpec(usages: Usage[]): string {
  const { font } = usages[0];
  const italics = [...new Set(usages.map((u) => u.style.italic))].sort();
  const weights = [...new Set(usages.map((u) => u.style.weight))].sort((a, b) => a - b);
  const custom = new Map<string, number>();
  for (const u of usages) for (const [tag, v] of customAxes(u)) custom.set(tag, v);
  const opsz = font.axes?.opsz && !custom.has('opsz') ? `${font.axes.opsz[0]}..${font.axes.opsz[1]}` : undefined;
  const wght = font.axes?.wght && weights.length > 1 ? `${weights[0]}..${weights[weights.length - 1]}` : undefined;
  const lower = [['ital', italics.length > 1 || italics[0] ? true : undefined], ['opsz', opsz], ['wght', true]] as const;
  const tags = [...lower.filter(([, v]) => v != null).map(([t]) => t), ...[...custom.keys()].filter((t) => t !== 'opsz').sort()];
  if (custom.has('opsz')) tags.splice(tags.indexOf('wght'), 0, 'opsz');
  const tuples: string[] = [];
  for (const italic of italics) {
    for (const weight of wght ? [wght] : weights) {
      tuples.push(tags.map((t) => (t === 'ital' ? (italic ? 1 : 0) : t === 'opsz' ? custom.get('opsz') ?? opsz : t === 'wght' ? weight : custom.get(t))).join(','));
    }
  }
  const spec = tags.length === 1 && tuples.length === 1 && tuples[0] === '400' ? '' : `:${tags.join(',')}@${tuples.join(';')}`;
  return encodeURIComponent(font.family).replace(/%20/g, '+') + spec;
}

/** The @font-face blocks to self-host a libre family, one per style in use, with the file names as placeholders. */
function fontFaces(usages: Usage[]): string {
  const { font } = usages[0];
  const name = font.family.replace(/\s+/g, '');
  const styles = [...new Map(usages.map((u) => [`${u.style.weight}${u.style.italic}`, u.style])).values()];
  const blocks = styles.map(({ weight, italic }) => {
    const file = `${name}-${WEIGHT_NAMES[weight] ?? weight}${italic ? 'Italic' : ''}.woff2`.replace('RegularItalic', 'Italic');
    return `@font-face {\n  font-family: ${quote(font.family)};\n  src: url('${file}') format('woff2');\n  font-weight: ${weight};\n  font-style: ${italic ? 'italic' : 'normal'};\n}`;
  });
  return `/* ${font.family}: get the files at ${font.libre!.url} */\n${blocks.join('\n')}`;
}

/** The rule of a usage: family with its fallback, weight, style, size, line height and the custom axes. */
function rule(u: Usage): string {
  const lines = [`font-family: ${quote(u.font.family)}, ${FALLBACKS[u.font.category] ?? 'sans-serif'};`, `font-weight: ${Math.round(u.style.weight)};`];
  if (u.style.italic) lines.push('font-style: italic;');
  if (u.size != null) lines.push(`font-size: ${u.size}px;`);
  if (u.lineHeight != null) lines.push(`line-height: ${u.lineHeight};`);
  const custom = customAxes(u);
  if (custom.length) lines.push(`font-variation-settings: ${custom.map(([t, v]) => `'${t}' ${+v.toFixed(2)}`).join(', ')};`);
  return `${u.selector} {\n  ${lines.join('\n  ')}\n}`;
}

/** The rules of the usages. */
export const cssRules = (usages: Usage[]) => usages.map(rule).join('\n\n');

/**
 * The snippet: how to load the fonts, then a rule per usage. Self-hosted,
 * the Google families come from fonts.css of the download (see localFontFaces);
 * libre families get @font-face blocks either way.
 */
export function cssSnippet(usages: Usage[], hosting: Hosting = 'google'): string {
  const families = usagesByFamily(usages);
  const google = families.filter((f) => !f[0].font.libre), libre = families.filter((f) => f[0].font.libre);
  const parts: string[] = [];
  if (google.length && hosting === 'google') {
    const href = `https://fonts.googleapis.com/css2?${google.map((f) => `family=${familySpec(f)}`).join('&')}&display=swap`;
    parts.push(`<link rel="preconnect" href="https://fonts.googleapis.com">\n<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n<link rel="stylesheet" href="${href}">`);
  }
  if (google.length && hosting === 'self') parts.push('<!-- fonts.css and the fonts/ folder are in the download -->\n<link rel="stylesheet" href="fonts.css">');
  parts.push(...libre.map(fontFaces));
  parts.push(cssRules(usages));
  return parts.join('\n\n');
}

/**
 * The family spec of the CSS2 API for the files to self-host: a variable
 * family with the whole range of every axis (italic too, when the family has
 * it), so that one file per subset serves every style; a static family with
 * the styles in use.
 */
export function selfHostSpec(font: FontInfo, styles: Style[]): string {
  const name = encodeURIComponent(font.family).replace(/%20/g, '+');
  const axes = font.axes ?? {};
  if (axes.wght) {
    const italics = font.variants.some((v) => v.endsWith('i')) ? [0, 1] : [];
    const tags = Object.keys(axes).sort((a, b) => (a === a.toLowerCase()) === (b === b.toLowerCase()) ? a.localeCompare(b) : a === a.toLowerCase() ? -1 : 1);
    const ranges = tags.map((t) => `${axes[t]![0]}..${axes[t]![1]}`);
    const tuples = italics.length ? italics.map((i) => [i, ...ranges].join(',')) : [ranges.join(',')];
    return `${name}:${[...(italics.length ? ['ital'] : []), ...tags].join(',')}@${tuples.join(';')}`;
  }
  const tuples = [...new Set(styles.map((s) => `${s.italic ? 1 : 0},${s.weight}`))].sort();
  if (tuples.length === 1 && tuples[0] === '0,400') return name;
  return `${name}:ital,wght@${tuples.join(';')}`;
}

/** A file of the download: where Google has it, and its path in the ZIP. */
export interface KitFile {
  url: string;
  path: string;
}

/**
 * The @font-face blocks of a CSS2 response with the files of the ZIP as
 * their sources, and the files to fetch: one per subset (and style, for a
 * static family), named after family, subset, weight and style.
 */
export function localFontFaces(css: string, family: string): { css: string; files: KitFile[] } {
  const slug = family.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const files: KitFile[] = [];
  const blocks: string[] = [];
  for (const m of css.matchAll(/\/\*\s*([\w-]+)\s*\*\/\s*@font-face\s*\{([\s\S]*?)\}/g)) {
    const [, subset, body] = m;
    const url = body.match(/src:\s*url\(([^)]+)\)/)?.[1];
    if (!url) continue;
    const weight = body.match(/font-weight:\s*([\d ]+)/)?.[1].trim().replace(' ', '-') ?? '400';
    const italic = /font-style:\s*italic/.test(body);
    const path = `fonts/${slug}-${subset}-${weight}${italic ? '-italic' : ''}.woff2`;
    files.push({ url, path });
    const lines = body.trim().split('\n').map((l) => l.trim()).filter(Boolean).map((l) => (l.startsWith('src:') ? `src: url('${path}') format('woff2');` : l));
    blocks.push(`/* ${subset} */\n@font-face {\n  ${lines.join('\n  ')}\n}`);
  }
  return { css: blocks.join('\n'), files };
}

/** Where to get the files of a family: the ZIP of Google Fonts, or the page of the foundry. */
export function downloadLink(font: FontInfo): { href: string; label: string; title: string } {
  if (font.libre) return { href: font.libre.url, label: `Get ${font.family} at ${font.libre.foundry}`, title: `The page of ${font.family} at ${font.libre.foundry}, with the files and the license (${font.libre.license})` };
  return { href: `https://fonts.google.com/download?family=${encodeURIComponent(font.family)}`, label: `TTFs of ${font.family}`, title: `The desktop files of ${font.family} as a ZIP from Google Fonts` };
}
