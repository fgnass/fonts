// Turns shaped text into an SVG of paths, without any dependency: the
// outlines come from HarfBuzz (see svg-export.ts), this file only places them.

/** A segment of a glyph outline, as HarfBuzz returns it: M, L, Q, C or Z with its coordinates. */
export interface PathSegment {
  type: string;
  values: number[];
}

/** A glyph placed on a line: its outline and its position in font units, relative to the start of the line. */
export interface PlacedGlyph {
  path: PathSegment[];
  x: number;
  y: number;
}

export interface SvgOptions {
  /** Units per em of the font. */
  upem: number;
  /** The font size in px: the size of an em in the SVG. */
  size: number;
  /** The line height as a factor of the size. */
  lineHeight: number;
  /** The ascender of the font in font units, so that the first baseline is below the top. */
  ascender: number;
}

const n = (v: number) => String(+v.toFixed(2));

/**
 * One SVG path for the glyphs of all lines, left-aligned, the y axis turned
 * to point down. The viewBox fits the outlines. Returns null when there is
 * no outline (empty text, or only spaces).
 */
export function svgFromLines(lines: PlacedGlyph[][], { upem, size, lineHeight, ascender }: SvgOptions): string | null {
  const s = size / upem;
  let d = '';
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  lines.forEach((glyphs, i) => {
    const baseline = ascender * s + i * lineHeight * size;
    for (const g of glyphs) {
      for (const seg of g.path) {
        const points: string[] = [];
        for (let k = 0; k < seg.values.length; k += 2) {
          const x = (g.x + seg.values[k]) * s, y = baseline - (g.y + seg.values[k + 1]) * s;
          minX = Math.min(minX, x); maxX = Math.max(maxX, x);
          minY = Math.min(minY, y); maxY = Math.max(maxY, y);
          points.push(n(x), n(y));
        }
        d += seg.type + points.join(' ');
      }
    }
  });
  if (!d) return null;
  const w = maxX - minX, h = maxY - minY;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${n(w)}" height="${n(h)}" viewBox="${n(minX)} ${n(minY)} ${n(w)} ${n(h)}"><path d="${d}"/></svg>`;
}
