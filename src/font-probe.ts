// What the OpenType features of a font do in its web file, for the samples of
// the specimen. The file Google serves lacks some features of the TTFs, so
// each feature is checked: is it in the file, and does it change the sample?
// For alternates, the sample is found by trying the feature on each of the
// Latin letters, figures and common signs. Loaded on demand, with HarfBuzz.
import * as hb from 'harfbuzzjs';
import type { Font, Style } from './data';
import { fontFile, fontFileUrls } from './font-bytes';

/** The characters tried one at a time for a feature without a sample of its own. */
const PROBE = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789&@§ßäöüÄÖÜéèêçñøå€$£.,;:!?*#'];

export interface ProbeResult {
  /** The feature is in the GSUB or GPOS table of the web file. */
  present: boolean;
  /** The text that shows the feature; empty when it changes nothing visible. */
  sample: string;
}

/** Checks each feature of the font: the given sample, or (without one) the characters the feature changes. */
export async function probeFeatures(font: Font, style: Style, items: { tag: string; sample?: string }[]): Promise<Record<string, ProbeResult>> {
  const [url] = await fontFileUrls(font, style, PROBE.join(''), true);
  const face = new hb.Face(new hb.Blob(await fontFile(url)));
  const hbFont = new hb.Font(face);
  const inFile = new Set([...face.getTableFeatureTags('GSUB'), ...face.getTableFeatureTags('GPOS')]);
  // Glyphs and positions, so that a change of spacing (kerning) counts too.
  const shaped = (text: string, features: hb.Feature[]) => {
    const buffer = new hb.Buffer();
    buffer.addText(text);
    buffer.guessSegmentProperties();
    hb.shape(hbFont, buffer, features);
    return buffer.getGlyphInfosAndPositions().map((g) => `${g.codepoint}:${g.xAdvance}:${g.xOffset}:${g.yOffset}`).join(' ');
  };
  const changes = (text: string, tag: string) => shaped(text, [new hb.Feature(tag, 0)]) !== shaped(text, [new hb.Feature(tag, 1)]);
  const out: Record<string, ProbeResult> = {};
  for (const { tag, sample } of items) {
    const present = inFile.has(tag);
    if (!present) out[tag] = { present, sample: '' };
    else if (sample != null) out[tag] = { present, sample: changes(sample, tag) ? sample : '' };
    else out[tag] = { present, sample: PROBE.filter((ch) => changes(ch, tag)).join(' ') };
  }
  return out;
}
