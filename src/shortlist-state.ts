// The font view: the shortlist and the opened font, the selected font, and the
// specimen and pairing settings, kept while switching workspaces.
import { computed, signal } from '@preact/signals';
import { type Font, type Style, textFonts } from './data';
import { fontView, selection, shortlist, toggleShortlist, viewedFont } from './state';

export { fontView, selection };

export const savedFonts = computed(() => [...shortlist.value].map((name) => textFonts.find((f) => f.family === name)).filter((f): f is Font => !!f));
/** The fonts of the list: the opened font first while it is not saved, then the saved fonts. */
export const listedFonts = computed(() => {
  const font = viewedFont.value, saved = savedFonts.value;
  return font && !saved.some((f) => f.family === font.family) ? [font, ...saved] : saved;
});
export const primary = computed(() => listedFonts.value.find((f) => f.family === selection.value) ?? listedFonts.value[0]);
export const pairing = signal('');
export const secondary = computed(() => savedFonts.value.find((f) => f.family === pairing.value && f.family !== primary.value?.family));

/** The style the sizes of the specimen are set in, per family. */
export const specimenStyles = signal<Record<string, Style>>({});
/** The type settings above the pairing are open; on narrow screens, they start closed to leave room for the text. */
export const typeSettingsOpen = signal(!matchMedia('(max-width: 760px)').matches);
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

/** The styles of a family, upright before italic, each by weight. */
export const stylesOf = (font: Font): Style[] =>
  [false, true].flatMap((italic) => weightsOf(font, italic).map((weight) => ({ weight, italic })));

/** The values of the axis sliders of the specimen, per family: tag -> value. A missing tag has its default; a missing opsz follows the font size. */
export const specimenAxes = signal<Record<string, Record<string, number>>>({});

/** Sets an axis of the specimen of a family; undefined goes back to the default. */
export function setSpecimenAxis(font: Font, tag: string, value: number | undefined) {
  const { [tag]: _, ...rest } = specimenAxes.value[font.family] ?? {};
  specimenAxes.value = { ...specimenAxes.value, [font.family]: value == null ? rest : { ...rest, [tag]: value } };
}

/** The axes of the specimen sliders: those of a Google family, or of the variable font of a libre family. */
export const axesOf = (font: Font) => font.libre?.variable?.axes ?? font.axes ?? {};

/**
 * Whether the weight slider sets the weight of the selected style: for Google
 * families. The variable font of a libre family may have its own weight scale
 * (Sprat: 10–200), so there it is an axis like the others.
 */
export const weightIsStyle = (font: Font) => !font.libre;

/**
 * The font-variation-settings of the specimen for a style: the weight of the
 * style, the values of the sliders, else the axis defaults (pinned ones as
 * pinned). opsz only when set: else the browser picks it for the font size.
 */
export function axisSettings(font: Font, style: Style) {
  const values = specimenAxes.value[font.family] ?? {};
  const styled: Record<string, number | undefined> = weightIsStyle(font) ? { wght: style.weight, wdth: style.wdth, slnt: style.slnt } : {};
  return Object.entries(axesOf(font))
    .map(([tag, axis]): [string, number | undefined] => [tag, tag === 'wght' && weightIsStyle(font) ? style.weight : tag === 'opsz' ? values.opsz : values[tag] ?? styled[tag] ?? font.pinned?.[tag] ?? axis?.[2]])
    .filter(([, v]) => v != null)
    .map(([tag, v]) => `'${tag}' ${v}`)
    .join(', ');
}

/** The style of the specimen sizes: the one chosen for the family, or its default style. */
export const specimenStyle = (font: Font): Style => specimenStyles.value[font.family] ?? { weight: font.weight, italic: font.italic };

/**
 * Removes a font from the shortlist; when it was selected, the font after it
 * (or else before it) takes its place. The opened font stays in the list, unsaved.
 */
export function removeFromShortlist(font: Font) {
  const list = savedFonts.value, i = list.findIndex((f) => f.family === font.family);
  const opened = viewedFont.value?.family === font.family;
  if (!opened && primary.value?.family === font.family) selection.value = (list[i + 1] ?? list[i - 1])?.family ?? '';
  toggleShortlist(font.family);
}
