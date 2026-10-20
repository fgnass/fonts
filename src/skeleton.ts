// Draws a stored skeleton (the medial axis of a glyph as polylines in the
// GRID frame, see scripts/medial.mjs and shape.js encodeLines).
import { decodeLines } from './shape.js';

const glyphFiles = new Map<string, Promise<Uint8Array[]>>();

/** Load an indexed skeleton directly, independent of search ranking or filters. */
export async function loadSkeleton(ch: string, fontIndex: number): Promise<Uint8Array | null> {
  if (!glyphFiles.has(ch)) {
    const pending = fetch(`/data/g/${ch.charCodeAt(0)}.bin`).then(async (response) => {
      if (!response.ok || response.headers.get('content-type')?.includes('text/html')) throw new Error('Skeleton data unavailable');
      const buf = new Uint8Array(await response.arrayBuffer());
      const blocks: Uint8Array[] = [];
      for (let offset = 0; offset < buf.length;) {
        if (offset + 2 > buf.length) throw new Error('Incomplete skeleton data');
        const count = buf[offset] | (buf[offset + 1] << 8);
        let end = offset + 2;
        for (let line = 0; line < count; line++) {
          if (end + 2 > buf.length) throw new Error('Incomplete skeleton data');
          end += 2 + (buf[end] | (buf[end + 1] << 8)) * 2;
        }
        if (end > buf.length) throw new Error('Incomplete skeleton data');
        blocks.push(buf.subarray(offset, end));
        offset = end;
      }
      return blocks;
    });
    glyphFiles.set(ch, pending);
    void pending.catch(() => glyphFiles.delete(ch));
  }
  return (await glyphFiles.get(ch)!)[fontIndex] ?? null;
}

/** Strokes the skeleton on a canvas context, `scale` pixels per grid cell. */
export function drawSkeleton(ctx: CanvasRenderingContext2D, block: Uint8Array, scale: number, lineWidth: number) {
  ctx.lineWidth = lineWidth;
  ctx.lineCap = ctx.lineJoin = 'round';
  for (const l of decodeLines(block)) {
    ctx.beginPath();
    for (let i = 0; i < l.length; i += 2) {
      if (i) ctx.lineTo(l[i] * scale, l[i + 1] * scale);
      else ctx.moveTo(l[i] * scale, l[i + 1] * scale);
    }
    // A single point still shows as a dot.
    if (l.length === 2) ctx.lineTo(l[0] * scale + 0.1, l[1] * scale);
    ctx.stroke();
  }
}
