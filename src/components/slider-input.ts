import { useRef } from 'preact/hooks';
import { clamp } from '../sliders';

/** Position (0–1) of a pointer event along the track. */
export function trackPosition(track: HTMLElement, e: PointerEvent) {
  const r = track.getBoundingClientRect();
  return clamp((e.clientX - r.left) / r.width);
}

/** How far a key moves a handle: `step` for the arrow keys, `all` for Home and End. */
export function keyDelta(key: string, step: number, all: number): number | undefined {
  return ({ ArrowRight: step, ArrowUp: step, ArrowLeft: -step, ArrowDown: -step, Home: -all, End: all } as Record<string, number>)[key];
}

/**
 * The latest value and callback, for the window listeners of a drag. A change
 * also updates the value before the next render, so that fast key presses and
 * moves build on it.
 */
export function useSliderValue<T>(value: T, onChange: (value: T) => void) {
  const latest = useRef({ value, onChange });
  latest.current = { value, onChange };
  const getValue = () => latest.current.value;
  const changeValue = (next: T) => {
    latest.current.value = next;
    latest.current.onChange(next);
  };
  return { getValue, changeValue };
}
