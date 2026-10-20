// Shortlist selection and specimen settings, kept while switching workspaces.
import { computed, signal } from '@preact/signals';
import { type Font, type Style, textFonts } from './data';
import { shortlist } from './state';

export const savedFonts = computed(() => [...shortlist.value].map((name) => textFonts.find((f) => f.family === name)).filter((f): f is Font => !!f));
export const selection = signal('');
export const primary = computed(() => savedFonts.value.find((f) => f.family === selection.value) ?? savedFonts.value[0]);
export const pairing = signal('');
export const secondary = computed(() => savedFonts.value.find((f) => f.family === pairing.value && f.family !== primary.value?.family));
export type Role = 'heading' | 'body';
/** The chosen style per role; it stays when the font changes, as far as the font supports it. */
export const styles = signal<Record<Role, Style | null>>({ heading: null, body: null });
export const heading = signal('A little more character.');
export const body = signal('Good typography gives words a voice. It sets the pace, shapes the mood, and makes room for ideas to unfold.\n\nTry a few sentences of your own. A font should feel as good in a paragraph as it does in a single word.');
/** Type settings of the specimen: size in px and line height as a factor. */
export const headingSize = signal(48);
export const headingLeading = signal(1.15);
export const bodySize = signal(18);
export const bodyLeading = signal(1.55);

/** The style of a role in a font: the chosen weight, or the nearest one the font has. */
export function styleFor(role: Role, font: Font): Style {
  const wanted = styles.value[role];
  if (!wanted) return { weight: font.weight, italic: font.italic };
  const italic = font.variants.some((v) => v.endsWith('i') === wanted.italic) ? wanted.italic : !wanted.italic;
  const axis = font.axes?.wght;
  const weight = axis ? Math.min(axis[1], Math.max(axis[0], wanted.weight)) : nearest(weightsOf(font, italic), wanted.weight);
  return { weight, italic };
}

/** The static weights of a family for upright or italic, in order. */
export const weightsOf = (font: Font, italic: boolean) => [...new Set(font.variants.filter((v) => v.endsWith('i') === italic).map((v) => parseInt(v)))].sort((a, b) => a - b);

const nearest = (list: number[], w: number) => list.reduce((a, b) => (Math.abs(b - w) < Math.abs(a - w) ? b : a), list[0] ?? w);
