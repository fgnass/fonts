import { useRef } from 'preact/hooks';
import { clamp } from '../sliders';
import { dismissSliderHint } from '../state';
import { keyDelta, trackPosition, useSliderValue } from './slider-input';
import { Band, Handle, Range, Shade, Track } from './track';
import { usePointerDrag } from './usePointerDrag';

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
  class?: string;
}

/**
 * A slider with one handle, in the look of the range sliders: the band runs
 * from the left end to the handle. Drag the handle or click the track to set
 * the value. Arrow keys move the focused handle (with Shift in larger steps).
 */
export function Slider({ label, min, max, value, step = 1, disabled, onChange, class: className }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const handle = useRef<HTMLDivElement>(null);
  const { getValue, changeValue } = useSliderValue(value, onChange);
  const startDrag = usePointerDrag(el);

  const span = max - min;
  const pos = span > 0 ? clamp((value - min) / span) : 0;
  const set = (p: number) => changeValue(+(Math.round((min + clamp(p) * span) / step) * step).toFixed(4));

  const onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0 || disabled) return;
    e.preventDefault();
    dismissSliderHint();
    set(trackPosition(el.current!, e));
    handle.current!.focus();
    startDrag(e, (e) => set(trackPosition(el.current!, e)));
  };

  const onKeyDown = (e: KeyboardEvent) => {
    // A key moves by 2% of the range (10% with Shift), but at least one step.
    const d = keyDelta(e.key, Math.max(step, span * (e.shiftKey ? 0.1 : 0.02)), span);
    if (d == null || disabled) return;
    e.preventDefault();
    set((getValue() - min + d) / span);
  };

  return (
    <Range small disabled={disabled} class={className} ref={el} onPointerDown={onPointerDown} style={{ '--lo': 0, '--hi': pos }}>
      <Track />
      <Shade aria-hidden="true" style={{ left: `${pos * 100}%` }} />
      <Band off={disabled} />
      <Handle
        end="hi"
        off={disabled}
        disabled={disabled}
        ref={handle}
        role="slider"
        tabindex={0}
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-disabled={disabled}
        onKeyDown={onKeyDown}
      />
    </Range>
  );
}
