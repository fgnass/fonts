// The preview text as SVG paths, shaped as the browser shows it: the font
// file is fetched and (for WOFF2) unpacked, HarfBuzz applies ligatures, kerning
// and the variable axes and returns the outlines. Loaded on demand: the two
// WASM modules weigh about 1 MB.
import * as hb from 'harfbuzzjs';
import type { Font, Style } from './data';
import { fontFile, fontFileUrls } from './font-bytes';
import { type PlacedGlyph, svgFromLines } from './svg-text';

export interface ExportOptions {
  /** The font size in px: the size of an em in the SVG. */
  size: number;
  /** The line height as a factor of the size. */
  lineHeight: number;
  /** The values of the variable axes, tag -> value (see axisValues). */
  axes: Record<string, number>;
  /** OpenType features switched on or off, tag -> on (see featureValues). */
  features?: Record<string, boolean>;
}

/** A font ready for shaping, and the code points it has, so that a text can be split between the files of a family. */
interface Shaper {
  font: hb.Font;
  covers: Set<number>;
}

/** The runs of a line, each with the index of the first shaper that has its characters (the first shaper for characters no file has). */
function runs(line: string, shapers: Shaper[]) {
  const out: { text: string; shaper: number }[] = [];
  for (const ch of line) {
    const i = Math.max(0, shapers.findIndex((s) => s.covers.has(ch.codePointAt(0)!)));
    const last = out[out.length - 1];
    if (last && last.shaper === i) last.text += ch;
    else out.push({ text: ch, shaper: i });
  }
  return out;
}

/**
 * The lines of text in the font and style as an SVG with one path, or null
 * when nothing is left to draw. The axes are applied as given; an optical
 * size axis without a value follows the font size, as in the browser.
 */
export async function textToSvg(font: Font, style: Style, lines: string[], { size, lineHeight, axes, features = {} }: ExportOptions): Promise<string | null> {
  const hbFeatures = Object.entries(features).map(([tag, on]) => new hb.Feature(tag, on ? 1 : 0));
  const urls = await fontFileUrls(font, style, lines.join(''));
  const faces = (await Promise.all(urls.map(fontFile))).map((bytes) => new hb.Face(new hb.Blob(bytes)));
  const variations = { ...axes };
  const opsz = faces[0].getAxisInfos().opsz;
  if (opsz && variations.opsz == null) variations.opsz = Math.min(opsz.max, Math.max(opsz.min, size));
  const shapers: Shaper[] = faces.map((face) => {
    const hbFont = new hb.Font(face);
    hbFont.setVariations(Object.entries(variations).map(([tag, value]) => new hb.Variation(tag, value)));
    return { font: hbFont, covers: new Set(face.collectUnicodes()) };
  });
  const placed = lines.map((line) => {
    const glyphs: PlacedGlyph[] = [];
    let x = 0;
    for (const run of runs(line, shapers)) {
      const { font: hbFont } = shapers[run.shaper];
      const buffer = new hb.Buffer();
      buffer.addText(run.text);
      buffer.guessSegmentProperties();
      hb.shape(hbFont, buffer, hbFeatures);
      for (const g of buffer.getGlyphInfosAndPositions()) {
        glyphs.push({ path: hbFont.glyphToJson(g.codepoint), x: x + (g.xOffset ?? 0), y: g.yOffset ?? 0 });
        x += g.xAdvance ?? 0;
      }
    }
    return glyphs;
  });
  const { upem } = faces[0];
  return svgFromLines(placed, { upem, size, lineHeight, ascender: shapers[0].font.hExtents().ascender });
}
