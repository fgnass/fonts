import { useEffect, useLayoutEffect, useRef } from 'preact/hooks';
import { BINS, type Corridor } from '../sliders';
import { dismissSliderHint } from '../state';

const clamp = (p: number) => Math.min(1, Math.max(0, p));

interface Props {
  label: string;
  value: Corridor;
  valueText?: [string, string];
  onChange: (value: Corridor) => void;
  /** Histogram: how many fonts fall into each of the BINS bins. */
  bins?: Uint16Array;
  marker?: number;
  markerLabel?: string;
  preview?: Corridor;
  /** Shows that the ends can be dragged: glowing handles and a label. */
  hint?: boolean;
}

type Drag = 'lo' | 'hi' | { start: number; lo: number; hi: number };

/**
 * A range slider with two handles on one track. Drag a handle to move one
 * end, drag the band between them to move the whole corridor, click the track
 * to move the nearest end there. Arrow keys move the focused handle (with
 * Shift in larger steps). Behind the track, a histogram shows where the fonts are.
 */
export function RangeSlider({ label, value, valueText, onChange, bins, marker, markerLabel, preview, hint }: Props) {
  const [lo, hi] = value;
  const el = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const handles = { lo: useRef<HTMLDivElement>(null), hi: useRef<HTMLDivElement>(null) };
  // The latest value and callback, for the window listeners of a drag.
  const latest = useRef({ value, onChange });
  latest.current = { value, onChange };
  const endDrag = useRef<(() => void) | null>(null);
  useEffect(() => () => endDrag.current?.(), []);

  const set = (a: number, b: number) => {
    const next: Corridor = [clamp(Math.min(a, b)), clamp(Math.max(a, b))];
    // Keep it until the next render, so that fast key presses and moves build on it.
    latest.current.value = next;
    latest.current.onChange(next);
  };

  /** Position (0–1) of a pointer event along the track. */
  const at = (e: PointerEvent) => {
    const r = el.current!.getBoundingClientRect();
    return clamp((e.clientX - r.left) / r.width);
  };

  const onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    dismissSliderHint();
    const p = at(e);
    const target = e.target as HTMLElement;
    let drag: Drag;
    if (target === handles.lo.current) drag = 'lo';
    else if (target === handles.hi.current) drag = 'hi';
    else if (target.classList.contains('band') && hi - lo < 1) drag = { start: p, lo, hi };
    else {
      // Click on the track: move the nearest end there.
      drag = Math.abs(p - lo) < Math.abs(p - hi) ? 'lo' : 'hi';
      set(drag === 'lo' ? p : lo, drag === 'hi' ? p : hi);
    }
    if (typeof drag === 'string') handles[drag].current!.focus();
    endDrag.current?.();
    const node = el.current!;
    try {
      node.setPointerCapture(e.pointerId);
    } catch {}
    node.classList.add('dragging');
    const move = (e: PointerEvent) => {
      // The release can get lost (outside the window, lost capture): no pressed button means the drag is over.
      if (!(e.buttons & 1)) return stop();
      const q = at(e);
      const [lo, hi] = latest.current.value;
      if (drag === 'lo') set(Math.min(q, hi), hi);
      else if (drag === 'hi') set(lo, Math.max(q, lo));
      else {
        const d = Math.min(1 - drag.hi, Math.max(-drag.lo, q - drag.start));
        set(drag.lo + d, drag.hi + d);
      }
    };
    const stop = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
      window.removeEventListener('blur', stop);
      node.removeEventListener('lostpointercapture', stop);
      node.classList.remove('dragging');
      endDrag.current = null;
    };
    endDrag.current = stop;
    // Listen on the window, so that the drag ends wherever the pointer is released.
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
    window.addEventListener('blur', stop);
    node.addEventListener('lostpointercapture', stop);
  };

  const onKeyDown = (end: 'lo' | 'hi') => (e: KeyboardEvent) => {
    const step = e.shiftKey ? 0.1 : 0.02;
    const d = ({ ArrowRight: step, ArrowUp: step, ArrowLeft: -step, ArrowDown: -step, Home: -1, End: 1 } as Record<string, number>)[e.key];
    if (d == null) return;
    e.preventDefault();
    dismissSliderHint();
    const [lo, hi] = latest.current.value;
    if (end === 'lo') set(Math.min(lo + d, hi), hi);
    else set(lo, Math.max(hi + d, lo));
  };

  // Draw at the actual device-pixel size, with every bar edge on a whole pixel.
  useLayoutEffect(() => {
    const c = canvas.current!;
    const draw = () => {
      const bounds = c.getBoundingClientRect();
      const ratio = window.devicePixelRatio || 1;
      const width = Math.round(bounds.width * ratio);
      const height = Math.round(bounds.height * ratio);
      if (c.width !== width) c.width = width;
      if (c.height !== height) c.height = height;
      const ctx = c.getContext('2d')!;
      ctx.clearRect(0, 0, width, height);
      if (!bins || !width || !height) return;
      const css = getComputedStyle(c);
      // Logarithmic scale keeps rare features visible beside a dominant bin.
      const max = Math.log1p(Math.max(1, ...bins));
      const step = width / BINS;
      const gap = Math.max(1, Math.round(ratio));
      const markedBin = marker == null ? -1 : Math.min(BINS - 1, Math.floor(clamp(marker) * BINS));
      const off = lo <= 0 && hi >= 1;
      bins.forEach((n, i) => {
        if (!n) return;
        const inside = !off && (i + 1) / BINS > lo && i / BINS < hi;
        const marked = i === markedBin;
        // The bin of the inspected font shows in full accent, the others faded.
        ctx.fillStyle = css.getPropertyValue(marked || inside ? '--accent' : '--muted').trim();
        ctx.globalAlpha = marked ? 1 : inside ? 0.45 : 0.28;
        const len = Math.min(height, Math.max(Math.round(1.2 * ratio), Math.round((Math.log1p(n) / max) * height)));
        const left = Math.round(i * step + gap / 2);
        const right = Math.round((i + 1) * step - gap / 2);
        ctx.fillRect(left, height - len, Math.max(1, right - left), len);
      });
    };
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(c);
    window.addEventListener('resize', draw);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', draw);
    };
  }, [bins, lo, hi, marker]);

  // When the handles meet at the right end, only the lower one can move away, so put it on top.
  return (
    <div class={'range' + (hint ? ' hint' : '')} ref={el} onPointerDown={onPointerDown} style={{ '--lo': lo, '--hi': hi }}>
      <canvas class="hist" ref={canvas} title={markerLabel} />
      <div class="track" />
      <span class="shade" aria-hidden="true" style={{ left: `${lo * 100}%` }} />
      <span class="shade" aria-hidden="true" style={{ left: `${hi * 100}%` }} />
      <div class="band" />
      {preview && <>
        <span class="preview-band" aria-hidden="true" style={{ left: `${preview[0] * 100}%`, right: `${(1 - preview[1]) * 100}%` }} />
        {preview[0] !== lo && <span class="preview-boundary" aria-hidden="true" style={{ left: `${preview[0] * 100}%` }} />}
        {preview[1] !== hi && <span class="preview-boundary" aria-hidden="true" style={{ left: `${preview[1] * 100}%` }} />}
      </>}
      <div
        class="handle lo"
        ref={handles.lo}
        role="slider"
        tabindex={0}
        aria-label={`${label} minimum`}
        aria-valuenow={Math.round(lo * 100)}
        aria-valuetext={valueText?.[0]}
        style={{ zIndex: lo > 0.5 ? 5 : 4 }}
        onKeyDown={onKeyDown('lo')}
      />
      <div class="handle hi" ref={handles.hi} role="slider" tabindex={0} aria-label={`${label} maximum`} aria-valuenow={Math.round(hi * 100)} aria-valuetext={valueText?.[1]} onKeyDown={onKeyDown('hi')} />
      {hint && <span class="drag-hint" aria-hidden="true">drag me</span>}
    </div>
  );
}
