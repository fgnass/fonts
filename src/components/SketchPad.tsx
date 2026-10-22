import { useEffect, useRef } from 'preact/hooks';
import { GRID } from '../shape.js';
import { drawSkeleton, loadSkeleton } from '../skeleton';
import { addStroke, excluded, focused, likeFont, type Point, strokes } from '../state';

/** The sketch of the focused letter, or its example-font skeleton unless the letter is left out. */
export function SketchPad() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const current = useRef<Point[] | null>(null);
  const font = likeFont.value, ch = focused.value, lines = strokes.value;
  const leftOut = excluded.value.includes(ch);

  const draw = () => {
    const c = canvas.current!;
    const ctx = c.getContext('2d')!;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.lineWidth = 14;
    ctx.lineCap = ctx.lineJoin = 'round';
    ctx.strokeStyle = getComputedStyle(c).color;
    // peek(): the handlers draw between renders, so they need the latest strokes.
    const done = strokes.peek();
    for (const s of current.current ? [...done, current.current] : done) {
      ctx.beginPath();
      s.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      if (s.length === 1) ctx.lineTo(s[0].x + 0.1, s[0].y);
      ctx.stroke();
    }
  };

  useEffect(() => {
    if (!font || lines.length) return draw();
    const c = canvas.current!;
    const ctx = c.getContext('2d')!;
    ctx.clearRect(0, 0, c.width, c.height);
    if (!ch || leftOut) return;
    let live = true;
    void loadSkeleton(ch, font.index).then((skeleton) => {
      if (!live || current.current || !skeleton) return;
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.strokeStyle = getComputedStyle(c).color;
      drawSkeleton(ctx, skeleton, c.width / GRID, 14);
    }).catch(() => {});
    return () => void (live = false);
  }, [font, ch, lines, leftOut]);

  const point = (e: PointerEvent): Point => {
    const c = canvas.current!;
    const r = c.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * c.width, y: ((e.clientY - r.top) / r.height) * c.height };
  };

  return (
    <canvas
      id="pad"
      class="aspect-square w-full cursor-crosshair touch-none rounded-[10px] border border-line bg-tile text-bright dot-grid"
      ref={canvas}
      width={640}
      height={640}
      onPointerDown={(e) => {
        canvas.current!.setPointerCapture(e.pointerId);
        current.current = [point(e)];
        draw();
      }}
      onPointerMove={(e) => {
        if (!current.current) return;
        current.current.push(point(e));
        draw();
      }}
      onPointerUp={() => {
        const stroke = current.current;
        current.current = null;
        if (stroke) addStroke(stroke);
      }}
    />
  );
}
