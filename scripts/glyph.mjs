// Loads fonts and returns glyph outlines as a browser would show them: the
// character is shaped with HarfBuzz (default features such as ccmp, liga,
// calt), so substitutions like the small caps in "Anton SC" are applied.
import fs from 'node:fs';
import opentype from 'opentype.js';
import * as hb from 'harfbuzzjs';

/**
 * SVG path data for an opentype.Path. Path.toPathData() of opentype.js
 * writes "NaN" for coordinates with a tiny fraction (it rounds via strings
 * like "1.2e-13e+2"), so a canvas draws nothing from there on.
 */
export function pathData(path) {
  const n = (v) => +v.toFixed(2);
  let d = '';
  for (const c of path.commands) {
    if (c.type === 'M' || c.type === 'L') d += `${c.type}${n(c.x)} ${n(c.y)}`;
    else if (c.type === 'Q') d += `Q${n(c.x1)} ${n(c.y1)} ${n(c.x)} ${n(c.y)}`;
    else if (c.type === 'C') d += `C${n(c.x1)} ${n(c.y1)} ${n(c.x2)} ${n(c.y2)} ${n(c.x)} ${n(c.y)}`;
    else if (c.type === 'Z') d += 'Z';
  }
  return d;
}

/**
 * Returns an object with `path(ch)` (opentype.Path in units of `size` per em,
 * or null if the font lacks the character), `advance(ch)` and `glyphIds(ch)`, or null if
 * the font cannot be loaded.
 */
export function loadGlyphs(file, size = 1000) {
  let ot, font;
  try {
    const data = fs.readFileSync(file);
    const buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.length);
    ot = opentype.parse(buffer);
    font = new hb.Font(new hb.Face(new hb.Blob(buffer)));
  } catch {
    return null;
  }
  const scale = size / ot.unitsPerEm;

  const shape = (ch) => {
    const buf = new hb.Buffer();
    buf.addText(ch);
    buf.guessSegmentProperties();
    hb.shape(font, buf);
    const infos = buf.getGlyphInfos();
    const positions = buf.getGlyphPositions();
    return infos.map((info, i) => ({ id: info.codepoint, ...positions[i] }));
  };

  return {
    glyphIds: (ch) => shape(ch).map((g) => g.id),
    cmapId: (ch) => ot.charToGlyph(ch).index,
    /** Advance width of the shaped character (in units of `size` per em). */
    advance: (ch) => shape(ch).reduce((x, g) => x + g.xAdvance, 0) * scale,
    path(ch) {
      const paths = this.paths(ch);
      if (!paths) return null;
      const path = new opentype.Path();
      for (const p of paths) path.extend(p);
      return path;
    },
    /** One positioned path per shaped glyph of the text (in units of `size` per em), or null if a glyph is missing. */
    paths(text) {
      const glyphs = shape(text);
      if (!glyphs.length || glyphs.some((g) => g.id === 0)) return null;
      let x = 0;
      return glyphs.map((g) => {
        const p = ot.glyphs.get(g.id).getPath((x + g.xOffset) * scale, -g.yOffset * scale, size);
        x += g.xAdvance;
        return p;
      });
    },
  };
}
