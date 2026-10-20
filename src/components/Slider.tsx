import { useEffect, useRef } from 'preact/hooks';
import { dismissSliderHint } from '../state';

const clamp = (p: number) => Math.min(1, Math.max(0, p));

interface Props {
  label: string;
  min: number;
  max: number;
  value: number;
  /** Granularity of the value (default 1). */
  step?: number;
  /** Shown dimmed and ignores input (e.g. a font with one weight only). */
  disabled?: boolean;
  onChange: (value: number) => void;
}

/**
 * A slider with one handle, in the look of the range sliders: the band runs
 * from the left end to the handle. Drag the handle or click the track to set
 * the value. Arrow keys move the focused handle (with Shift in larger steps).
 */
export function Slider({ label, min, max, value, step = 1, disabled, onChange }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const handle = useRef<HTMLDivElement>(null);
  const latest = useRef({ value, onChange });
  latest.current = { value, onChange };
  const endDrag = useRef<(() => void) | null>(null);
  useEffect(() => () => endDrag.current?.(), []);

  const pos = max > min ? clamp((value - min) / (max - min)) : 0;
  const set = (p: number) => {
    const v = +(Math.round((min + clamp(p) * (max - min)) / step) * step).toFixed(4);
    // Keep it until the next render, so that fast key presses build on it.
    latest.current.value = v;
    latest.current.onChange(v);
  };

  /** Position (0–1) of a pointer event along the track. */
  const at = (e: PointerEvent) => {
    const r = el.current!.getBoundingClientRect();
    return clamp((e.clientX - r.left) / r.width);
  };

  const onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0 || disabled) return;
    e.preventDefault();
    dismissSliderHint();
    set(at(e));
    handle.current!.focus();
    endDrag.current?.();
    const node = el.current!;
    try {
      node.setPointerCapture(e.pointerId);
    } catch {}
    node.classList.add('dragging');
    const move = (e: PointerEvent) => {
      if (!(e.buttons & 1)) return stop();
      set(at(e));
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
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
    window.addEventListener('blur', stop);
    node.addEventListener('lostpointercapture', stop);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    // A key moves by 2% of the range (10% with Shift), but at least one step.
    const span = max - min;
    const d = Math.max(step, span * (e.shiftKey ? 0.1 : 0.02));
    const dv = ({ ArrowRight: d, ArrowUp: d, ArrowLeft: -d, ArrowDown: -d, Home: -span, End: span } as Record<string, number>)[e.key];
    if (dv == null || disabled) return;
    e.preventDefault();
    set((latest.current.value - min + dv) / span);
  };

  return (
    <div class={'range single' + (disabled ? ' disabled' : '')} ref={el} onPointerDown={onPointerDown} style={{ '--lo': 0, '--hi': pos }}>
      <div class="track" />
      <span class="shade" aria-hidden="true" style={{ left: `${pos * 100}%` }} />
      <div class="band" />
      <div class="handle hi" ref={handle} role="slider" tabindex={0} aria-label={label} aria-valuemin={min} aria-valuemax={max} aria-valuenow={value} aria-disabled={disabled} onKeyDown={onKeyDown} />
    </div>
  );
}
