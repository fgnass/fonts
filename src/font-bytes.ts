// The bytes of a font file, for HarfBuzz in the browser (the SVG export, the
// feature samples): fetched from Google or from /libre, unpacked when WOFF2.
import { fetchGoogle, googleAllowed } from './consent';
import type { Font, Style } from './data';
import { googleCssUrl, libreFileUrls } from './fontload';
import { decompressWoff2 } from './woff2';

const files = new Map<string, Promise<Uint8Array>>();

/** The bytes of a font file, unpacked when it is WOFF2; fetched once per URL. */
export function fontFile(url: string) {
  let file = files.get(url);
  if (!file) {
    // Font files of Google come from fonts.gstatic.com, those of the libre families from this site.
    file = (url.startsWith('/') ? fetch(url) : googleAllowed.then(() => fetch(url)))
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`HTTP ${r.status} for ${url}`))))
      .then((buffer) => {
        const bytes = new Uint8Array(buffer);
        const magic = String.fromCharCode(...bytes.subarray(0, 4));
        if (magic === 'wOF2') return decompressWoff2(bytes);
        if (magic === 'wOFF') throw new Error('WOFF is not supported');
        return bytes;
      });
    file.catch(() => files.delete(url));
    files.set(url, file);
  }
  return file;
}

/**
 * The URLs of the font files for a font, style and text: a libre family has
 * its own files; a Google family one file with the glyphs of the text, or,
 * for any text (`allChars`, see LoadOptions), its Latin file.
 */
export async function fontFileUrls(font: Font, style: Style, text: string, allChars = false) {
  if (font.libre) return libreFileUrls(font as Font & { libre: NonNullable<Font['libre']> }, style, { allAxes: true });
  const css = await fetchGoogle(googleCssUrl(font, style, text, { allAxes: true, allChars })).then((r) => (r.ok ? r.text() : Promise.reject(new Error(`HTTP ${r.status}`))));
  const blocks = [...css.matchAll(/(?:\/\*\s*([\w-]+)\s*\*\/\s*)?@font-face\s*\{([\s\S]*?)\}/g)].map((m) => ({ subset: m[1], url: m[2].match(/src:\s*url\(([^)]+)\)/)?.[1] }));
  const block = blocks.find((b) => b.subset === 'latin') ?? blocks[0];
  if (!block?.url) throw new Error('no font source in CSS');
  return [block.url];
}
