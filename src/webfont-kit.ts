// The download to self-host fonts of Google: the WOFF2 files that the Google
// Fonts API serves, a subset each, and fonts.css with their @font-face blocks
// and the rules of the usages. Loaded on demand, with the ZIP writer.
import { strToU8, zipSync } from 'fflate';
import { fetchGoogle } from './consent';
import { cssRules, type KitFile, localFontFaces, selfHostSpec, type Usage } from './css-snippet';

export interface WebfontKit {
  name: string;
  blob: Blob;
  /** The paths in the ZIP. */
  paths: string[];
}

async function text(url: string) {
  const r = await fetchGoogle(url);
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
  return r.text();
}

async function bytes(url: string) {
  const r = await fetchGoogle(url);
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
  return new Uint8Array(await r.arrayBuffer());
}

/** The ZIP for the Google families of the usages (libre families have their files at their foundry). */
export async function buildWebfontKit(usages: Usage[]): Promise<WebfontKit> {
  const families = new Map<string, Usage[]>();
  for (const u of usages) if (!u.font.libre) families.set(u.font.family, [...(families.get(u.font.family) ?? []), u]);
  const faces = await Promise.all(
    [...families.values()].map(async (list) => {
      const css = await text(`https://fonts.googleapis.com/css2?family=${selfHostSpec(list[0].font, list.map((u) => u.style))}&display=swap`);
      return localFontFaces(css, list[0].font.family);
    }),
  );
  const files: KitFile[] = faces.flatMap((f) => f.files);
  const data = await Promise.all(files.map((f) => bytes(f.url)));
  const css = `${faces.map((f) => f.css).join('\n\n')}\n\n/* As set in the specimen */\n\n${cssRules(usages)}\n`;
  const entries: Record<string, [Uint8Array, { level: 0 | 6 }]> = { 'fonts.css': [strToU8(css), { level: 6 }] };
  // WOFF2 is compressed already: the files are stored as they are.
  files.forEach((f, i) => { entries[f.path] = [data[i], { level: 0 }]; });
  const zip = zipSync(entries);
  const name = `${[...families.keys()].map((f) => f.replace(/\s+/g, '')).join('-')}-webfonts.zip`;
  return { name, blob: new Blob([zip as BlobPart], { type: 'application/zip' }), paths: Object.keys(entries) };
}

/** Builds the kit and saves it. */
export async function downloadWebfontKit(usages: Usage[]) {
  const { name, blob } = await buildWebfontKit(usages);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
