// Ranks the fonts by how much their glyphs look like the letters of a query:
// a sketch per letter, or the glyphs of an example font.
import { CHARS as ALL } from './chars.js';
import type { SearchHit, SearchRequest, SearchResponse } from './search-types';
import { chamfer, decodeLines, distanceField, GRID, linePoints, meanDist, sketchEnds, strokeEndDistance, strokeEnds } from './shape.js';

const EMB_DIMS = 256;
const CHARS = [...ALL];
// For a search over all characters: how many fonts per character get the full chamfer distance after the fast pre-check.
const SHORTLIST = 150;

/** A font's skeleton of one character: the stored polylines (for display) and the grid cells they cover (for the chamfer distance). */
interface Glyph {
  block: Uint8Array;
  pts: Uint8Array;
  ends: Uint8Array;
}
const glyphs = new Map<string, Glyph[]>(); // char -> one entry per font
const embeddings = new Map<string, Int8Array | null>(); // char -> fonts x EMB_DIMS, or null if not available

async function loadGlyphs(ch: string) {
  if (!glyphs.has(ch)) {
    const [buf, topology] = await Promise.all([
      fetch(`/data/g/${ch.charCodeAt(0)}.bin`).then((r) => r.arrayBuffer()).then((b) => new Uint8Array(b)),
      fetch(`/data/t/${ch.charCodeAt(0)}.json`).then((r) => r.ok ? r.json() as Promise<(number[] | null)[]> : null).catch(() => null),
    ]);
    const list: Glyph[] = [];
    for (let o = 0; o < buf.length; ) {
      const lines = buf[o] | (buf[o + 1] << 8);
      let end = o + 2;
      for (let k = 0; k < lines; k++) end += 2 + (buf[end] | (buf[end + 1] << 8)) * 2;
      const block = buf.subarray(o, end);
      const pts = linePoints(decodeLines(block));
      const ends = topology?.[list.length];
      list.push({ block, pts, ends: ends ? Uint8Array.from(ends) : strokeEnds(pts) });
      o = end;
    }
    glyphs.set(ch, list);
  }
  return glyphs.get(ch)!;
}

async function loadEmbeddings(ch: string) {
  if (!embeddings.has(ch)) {
    const res = await fetch(`/data/e/${ch.charCodeAt(0)}.bin`);
    const ok = res.ok && res.headers.get('content-type') !== 'text/html';
    embeddings.set(ch, ok ? new Int8Array(await res.arrayBuffer()) : null);
  }
  return embeddings.get(ch)!;
}

/** Cosine distance between font `q` and all fonts (null for missing glyphs). */
function embeddingDistances(E: Int8Array, q: number) {
  const D = EMB_DIMS;
  const count = E.length / D;
  const qo = q * D;
  const dist: (number | null)[] = new Array(count).fill(null);
  let qn = 0;
  for (let d = 0; d < D; d++) qn += E[qo + d] * E[qo + d];
  if (!qn) return dist;
  for (let i = 0; i < count; i++) {
    const o = i * D;
    let dot = 0, n = 0;
    for (let d = 0; d < D; d++) {
      dot += E[qo + d] * E[o + d];
      n += E[o + d] * E[o + d];
    }
    if (n) dist[i] = 1 - dot / Math.sqrt(qn * n);
  }
  return dist;
}

/**
 * Search over all characters: for each font, the character most like the
 * sketch. The pre-check uses only the cheap direction of the chamfer distance
 * (glyph points to the sketch distance field). That direction favours simple
 * glyphs (a stem of "l" lies on most sketches), so the shortlist takes the
 * best fonts of every character, including the stroke-end penalty, and these
 * get the full symmetric distance.
 */
async function searchAll(pts: Uint8Array, allowed: (i: number) => boolean, noLower: Uint8Array): Promise<SearchHit[]> {
  const lists = await Promise.all(CHARS.map(loadGlyphs));
  const sketchDt = distanceField(pts);
  const ends = sketchEnds(pts);
  const best = new Map<number, { c: number; score: number }>();
  const dt = new Uint16Array(GRID * GRID);
  CHARS.forEach((ch, c) => {
    const lower = ch >= 'a' && ch <= 'z';
    const pre: { i: number; d: number }[] = [];
    lists[c].forEach((g, i) => {
      if (g.pts.length && allowed(i) && !(lower && noLower[i])) pre.push({ i, d: meanDist(g.pts, sketchDt) + strokeEndDistance(ends, g.ends) });
    });
    pre.sort((a, b) => a.d - b.d);
    for (const { i } of pre.slice(0, SHORTLIST)) {
      const g = lists[c][i].pts;
      const score = chamfer(pts, sketchDt, g, distanceField(g, dt)) + strokeEndDistance(ends, lists[c][i].ends);
      if (!best.has(i) || score < best.get(i)!.score) best.set(i, { c, score });
    }
  });
  // slice(): a view would copy the whole buffer of the character into the message.
  return [...best].map(([index, { c, score }]) => ({ index, score, ch: CHARS[c], skeletons: [lists[c][index].block.slice()] }));
}

/**
 * The rank of every allowed font for one query letter (null where the font
 * has no glyph): by AI features for a font query when they exist for the
 * character, else by the chamfer distance of the skeletons. The AI features
 * can be incomplete: a zero row for the query glyph gives no distances at
 * all, and a zero row for another font would drop it although it has a
 * skeleton. Such fonts get their skeleton rank instead.
 */
async function letterRanks(part: SearchRequest['parts'][number], list: Glyph[], allowed: (i: number) => boolean) {
  const has = (i: number) => allowed(i) && list[i].pts.length > 0;
  const E = part.fontIndex != null ? await loadEmbeddings(part.ch) : null;
  const aiDistances = E && part.fontIndex != null ? embeddingDistances(E, part.fontIndex) : null;
  // The glyph index may contain newer fonts than the embeddings. Keep every
  // glyph row so missing embeddings fall back and ineligible fonts stay null.
  const ai = aiDistances ? list.map((_, i) => (has(i) ? aiDistances[i] ?? null : null)) : null;
  const aiRank = ai?.some((d) => d != null) ? ranks(ai) : null;
  if (aiRank && !aiRank.some((r, i) => r == null && has(i))) return { rank: aiRank, ai: true };
  const pts = part.fontIndex != null ? list[part.fontIndex].pts : part.pts;
  const dist: (number | null)[] = new Array(list.length).fill(null);
  if (pts?.length) {
    const sketchDt = distanceField(pts);
    const ends = part.fontIndex == null ? sketchEnds(pts) : null;
    const dt = new Uint16Array(GRID * GRID);
    list.forEach((g, i) => {
      if (has(i)) dist[i] = chamfer(pts, sketchDt, g.pts, distanceField(g.pts, dt)) + (ends ? strokeEndDistance(ends, g.ends) : 0);
    });
  }
  const rank = ranks(dist);
  if (!aiRank) return { rank, ai: false };
  return { rank: aiRank.map((r, i) => r ?? rank[i]), ai: true };
}

/** Maps distances to ranks from 0 (best) to 1 (worst), so that letters compared by different measures weigh the same. */
function ranks(dist: (number | null)[]) {
  const order = dist.map((d, i) => (d == null ? null : { d, i })).filter((x) => x != null);
  order.sort((a, b) => a.d - b.d);
  const out: (number | null)[] = new Array(dist.length).fill(null);
  order.forEach(({ i }, r) => (out[i] = order.length > 1 ? r / (order.length - 1) : 0));
  return out;
}

onmessage = async ({ data }: MessageEvent<SearchRequest>) => {
  const { id, parts, limit } = data;
  const list = await loadGlyphs(parts[0]?.ch || 'a');
  const allowedSet = new Uint8Array(list.length), noLower = new Uint8Array(list.length);
  for (const i of data.allowed) allowedSet[i] = 1;
  for (const i of data.noLower ?? []) noLower[i] = 1;
  const reply = (usedChamfer: string[], hits: SearchHit[]) => {
    hits.sort((a, b) => a.score - b.score);
    postMessage({ id, usedChamfer, total: hits.length, results: hits.slice(0, limit) } satisfies SearchResponse);
  };

  if (parts.length === 1 && parts[0].ch === '') {
    return reply([], parts[0].pts?.length ? await searchAll(parts[0].pts, (i) => allowedSet[i] === 1, noLower) : []);
  }

  // Drawings share 80% and example glyphs share 20%, regardless of text length.
  // When only one group exists, it carries the entire score.
  const drawn = parts.filter((p) => p.fontIndex == null).length;
  const examples = parts.length - drawn;
  const sketchWeight = drawn ? (examples ? 0.8 : 1) / drawn : 0;
  const exampleWeight = examples ? (drawn ? 0.2 : 1) / examples : 0;

  // Per letter, the rank of every font; a font still needs all letters.
  const lists = await Promise.all(parts.map((p) => loadGlyphs(p.ch)));
  const usedChamfer: string[] = [];
  const sum = new Float64Array(list.length);
  const have = new Uint8Array(list.length).fill(1);
  for (const [k, part] of parts.entries()) {
    const lower = part.ch >= 'a' && part.ch <= 'z';
    const allowed = (i: number) => allowedSet[i] === 1 && !(lower && noLower[i]);
    const { rank, ai } = await letterRanks(part, lists[k], allowed);
    if (!ai && part.fontIndex != null) usedChamfer.push(part.ch);
    const weight = part.fontIndex == null ? sketchWeight : exampleWeight;
    rank.forEach((r, i) => (r == null ? (have[i] = 0) : (sum[i] += r * weight)));
  }
  const hits: SearchHit[] = [];
  for (let i = 0; i < list.length; i++) {
    if (have[i]) hits.push({ index: i, score: sum[i], skeletons: lists.map((l) => l[i].block.slice()) });
  }
  reply(usedChamfer, hits);
};
