// The look sliders: measured visual properties (see scripts/measure.mjs,
// scripts/form.mjs and scripts/ornate.mjs).
//
// Each slider works on positions from 0 to 1. `pos` maps a measured value to
// a position (values beyond the ends go to 0 or 1), `value` maps back. A
// slider sets a corridor [lo, hi]; the full range [0, 1] means "any".

export interface Slider {
  key: string;
  label: string;
  /** Fixed, self-explanatory endpoint labels, independent of the selected corridor. */
  ends: [string, string];
  /** Explains what the slider measures (shown as a tooltip on either endpoint). */
  tip: string;
  /** Text that shows a font at each end of the slider (only for the look sliders). */
  sample?: string;
  /** Technical sliders measure what a font contains, not how it looks. */
  technical?: boolean;
  /** Style sliders choose the style (instance or variable axis values) to show for each family; the others filter families. */
  style?: boolean;
  /** Shown only while the corridor of this slider excludes its left end (e.g. the serif type needs serifs). */
  requires?: string;
  /** Shown as a checkbox that sets this corridor instead of a range (for bimodal values like fixed width). */
  toggle?: Corridor;
  pos: (value: number) => number;
  value: (pos: number) => number;
  format: (value: number) => string;
}

export type Corridor = [lo: number, hi: number];

export const BINS = 40;

const clamp = (p: number) => Math.min(1, Math.max(0, p));
const names = (list: [number, string][]) => (v: number) => list.find(([max]) => v < max)![1];

export const SLIDERS: Slider[] = [
  {
    key: 'weight',
    label: 'Weight',
    ends: ['Thin', 'Heavy'],
    tip: 'How heavy the strokes are: the mean stroke width relative to the cap height, measured for each style of a family. Variable fonts can show any weight in their range.',
    sample: 'a',
    style: true,
    pos: (w) => clamp((w - 0.02) / 0.3),
    value: (p) => 0.02 + p * 0.3,
    format: names([[0.05, 'Thin'], [0.09, 'Light'], [0.14, 'Regular'], [0.18, 'Medium'], [0.23, 'Bold'], [Infinity, 'Black']]),
  },
  {
    key: 'width',
    label: 'Width',
    ends: ['Narrow', 'Wide'],
    tip: 'How wide the letters are: the mean width of capitals relative to the cap height and of lowercase letters relative to the x-height. Variable fonts with a width axis can show any width in their range.',
    sample: 'n',
    style: true,
    pos: (w) => clamp((w - 0.3) / 1.1),
    value: (p) => 0.3 + p * 1.1,
    format: names([[0.5, 'Compressed'], [0.7, 'Condensed'], [0.95, 'Normal'], [1.15, 'Wide'], [Infinity, 'Extended']]),
  },
  {
    key: 'slant',
    label: 'Slant',
    ends: ['Leans left', 'Leans right'],
    tip: 'How far the letters lean, in degrees from the vertical strokes. Italic styles and the slant axis of variable fonts count.',
    sample: 'H',
    style: true,
    pos: (a) => clamp((a + 5) / 30),
    value: (p) => p * 30 - 5,
    format: (a) => `${Math.round(a)}°`,
  },
  {
    key: 'x',
    label: 'x-height',
    ends: ['Small x-height', 'Large x-height'],
    tip: 'Height of the lowercase letters relative to the capitals. A large x-height makes a word look bigger and more open, a small one more classic.',
    sample: 'Hx',
    pos: (x) => clamp((x - 0.45) / 0.45),
    value: (p) => 0.45 + p * 0.45,
    format: (x) => `${Math.round(x * 100)}%`,
  },
  {
    key: 'c',
    label: 'Contrast',
    ends: ['Even strokes', 'High contrast'],
    tip: 'Difference between the thick and the thin parts of the strokes (thick divided by thin). None for monoline fonts, high for fonts like Bodoni with hairline thin strokes.',
    sample: 'o',
    pos: (c) => clamp(Math.log(c) / Math.log(6)),
    value: (p) => 6 ** p,
    format: names([[1.25, 'None'], [1.8, 'Low'], [3, 'Medium'], [Infinity, 'High']]),
  },
  {
    key: 's',
    label: 'Serifs',
    ends: ['Sans serif', 'Pronounced serifs'],
    tip: 'How far the feet and heads of I, H and n reach beyond their stems, relative to the cap height. None for sans serifs.',
    sample: 'n',
    pos: (s) => clamp(s / 0.18),
    value: (p) => p * 0.18,
    format: names([[0.02, 'None'], [0.07, 'Subtle'], [0.13, 'Strong'], [Infinity, 'Heavy']]),
  },
  {
    key: 'sb',
    label: 'Serif type',
    ends: ['Hairline serifs', 'Slab serifs'],
    tip: 'Thickness of the serifs relative to the stems: thin hairlines (Bodoni), wedges (Garamond) or slabs about as thick as the stems (Rockwell). Only fonts with clear serifs have a value.',
    sample: 'I',
    requires: 's',
    pos: (t) => clamp(t),
    value: (p) => p,
    format: names([[0.3, 'Hairline'], [0.6, 'Wedge'], [Infinity, 'Slab']]),
  },
  {
    key: 'e',
    label: 'Ends',
    ends: ['Rounded ends', 'Sharp ends'],
    tip: 'Shape of the stroke ends in a–z: the share of ends that are square or pointed. Round ends look soft and friendly, square ends technical.',
    sample: 'c',
    pos: (e) => clamp(e),
    value: (p) => p,
    format: names([[0.25, 'Round'], [0.6, 'Mixed'], [Infinity, 'Sharp']]),
  },
  {
    key: 'ap',
    label: 'Aperture',
    ends: ['Closed apertures', 'Open apertures'],
    tip: 'How open c and e are: the angle in which one sees out of their counters. Closed apertures (Helvetica) look compact and strict, open ones (Frutiger) friendly and easy to read.',
    sample: 'ce',
    pos: (a) => clamp(a / 90),
    value: (p) => p * 90,
    format: names([[30, 'Closed'], [50, 'Medium'], [Infinity, 'Open']]),
  },
  {
    key: 'ge',
    label: 'Circular o',
    ends: ['Oval / squarish o', 'Circular o'],
    tip: 'How close o and O are to a circle. Geometric fonts like Futura have a circular o, most other fonts an oval or squarish one.',
    sample: 'o',
    pos: (g) => clamp(1 - g / 0.15),
    value: (p) => (1 - p) * 0.15,
    format: names([[0.02, 'Circle'], [0.05, 'Round'], [0.1, 'Oval'], [Infinity, 'Squarish']]),
  },
  {
    key: 'r',
    label: 'Straight',
    ends: ['Curved strokes', 'Straight strokes'],
    tip: 'Share of the outlines that are straight lines instead of curves. Straight fonts look technical and angular, curvy fonts soft or calligraphic.',
    sample: 'R',
    pos: (r) => clamp((r - 0.2) / 0.8),
    value: (p) => 0.2 + p * 0.8,
    format: (r) => (r < 0.4 ? 'Curvy' : r < 0.75 ? 'Mixed' : 'Straight'),
  },
  {
    key: 'o',
    label: 'Ornate',
    ends: ['Plain', 'Flourished'],
    tip: 'How far flourishes reach beyond the space of the letters: the ink left and right of each letter and below the baseline, relative to the x-height.',
    sample: 'R',
    pos: (o) => clamp(o),
    value: (p) => p,
    format: names([[0.25, 'Plain'], [0.5, 'Some'], [0.75, 'Ornate'], [Infinity, 'Flourished']]),
  },
  {
    key: 'cn',
    label: 'Connected',
    ends: ['Separate letters', 'Joined letters'],
    tip: 'Share of letter pairs (an, no, ou …) whose letters touch when set, as in connected scripts. Measured from the shaped glyphs, allowing a hairline gap. Ligatures and flourishes do not count.',
    sample: 'an',
    pos: (c) => clamp(c),
    value: (p) => p,
    format: names([[0.15, 'Separate'], [0.6, 'Partly'], [Infinity, 'Joined']]),
  },
  {
    key: 'hf',
    label: 'Stroke fill',
    ends: ['Solid', 'Outline'],
    tip: 'How hollow the strokes are: white gaps through normally solid stems in I, l, E, F, L and T. Agreement across letters reduces false matches from handwriting loops. Also detects broken outlines and some inline or shaded lettering.',
    sample: 'Il',
    pos: (v) => clamp(v / 0.8),
    value: (p) => p * 0.8,
    format: names([[0.08, 'Solid'], [0.35, 'Partly hollow'], [0.65, 'Hollow'], [Infinity, 'Outline']]),
  },
  {
    key: 'glyphs',
    label: 'Glyphs',
    ends: ['Few glyphs', 'Many glyphs'],
    tip: 'Number of glyphs in the font: more glyphs mean more languages, symbols and alternates.',
    technical: true,
    pos: (n) => clamp(Math.log(n / 100) / Math.log(100)),
    value: (p) => 100 * 100 ** p,
    format: (n) => (n >= 10000 ? `${Math.round(n / 1000)}k` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${Math.round(n / 10) * 10}`),
  },
  {
    key: 'features',
    label: 'OpenType features',
    ends: ['Few features', 'Many features'],
    tip: 'Number of OpenType features, such as small caps, old-style figures, stylistic sets or fractions (the feature tags in GSUB and GPOS).',
    technical: true,
    pos: (n) => clamp(n / 50),
    value: (p) => p * 50,
    format: (n) => `${Math.round(n)}`,
  },
  {
    key: 'ligatures',
    label: 'Ligatures',
    ends: ['Few ligatures', 'Many ligatures'],
    tip: 'Number of ligatures in the font (standard, contextual, required and discretionary), for all characters, not only the preview text.',
    technical: true,
    pos: (n) => clamp(Math.log1p(n) / Math.log1p(200)),
    value: (p) => Math.expm1(p * Math.log1p(200)),
    format: (n) => `${Math.round(n)}`,
  },
  {
    key: 'axes',
    label: 'Variable axes',
    ends: ['Static', 'Many variable axes'],
    tip: 'Number of variable axes (such as weight, width, slant or optical size). 0 means a static font; move the left end to 1 for variable fonts only.',
    technical: true,
    pos: (n) => clamp(n / 5),
    value: (p) => p * 5,
    format: (n) => (Math.round(n) === 0 ? 'Static' : `${Math.round(n)}`),
  },
  {
    key: 'styles',
    label: 'Styles',
    ends: ['One style', 'Many styles'],
    tip: 'Number of styles of the family: weights and italics, as listed by Google Fonts.',
    technical: true,
    pos: (n) => clamp((n - 1) / 19),
    value: (p) => 1 + p * 19,
    format: (n) => `${Math.round(n)}`,
  },
  {
    key: 'mo',
    label: 'Width variation',
    ends: ['Equal letter widths', 'Varied letter widths'],
    tip: 'How much the allotted widths of a–z differ, including spacing: their standard deviation divided by their mean. Zero means monospaced. Independent of how wide the font is overall.',
    sample: 'imw',
    // Give the typical proportional-font range (20–32%) most of the track.
    pos: (v) => clamp(v <= 0.2 ? v * 1.5 : v <= 0.32 ? 0.3 + (v - 0.2) * 5 : 0.9 + (v - 0.32) / 1.8),
    value: (p) => p <= 0.3 ? p / 1.5 : p <= 0.9 ? 0.2 + (p - 0.3) / 5 : 0.32 + (p - 0.9) * 1.8,
    format: (v) => v < 0.001 ? 'Equal' : v >= 0.5 ? 'Varied' : `${Math.round(v * 100)}%`,
  },
];

/** The look sliders in groups: what one sets first, the voice of a font, and fine-tuning (collapsed at first). */
export const LOOK_KEYS = ['weight', 'width', 'slant', 's', 'sb', 'c', 'e', 'r', 'o', 'cn', 'hf', 'x', 'ge', 'ap', 'mo'];

export const STYLE = Object.fromEntries(SLIDERS.filter((s) => s.style).map((s) => [s.key, s])) as Record<'weight' | 'width' | 'slant', Slider>;

export const isAny = ([lo, hi]: Corridor) => lo <= 0 && hi >= 1;

/** Text for a corridor, e.g. "Light – Bold". */
export function describe(slider: Slider, [lo, hi]: Corridor) {
  const a = slider.format(slider.value(lo)), b = slider.format(slider.value(hi));
  return a === b ? a : `${a} – ${b}`;
}
