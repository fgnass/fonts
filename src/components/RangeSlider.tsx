import { useRef } from 'preact/hooks';
import { clamp, type Corridor } from '../sliders';
import { dismissSliderHint } from '../state';
import { Histogram } from './Histogram';
import { keyDelta, trackPosition, useSliderValue } from './slider-input';
import { Band, Handle, Range, Shade, Track } from './track';
import { usePointerDrag } from './usePointerDrag';

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

type End = 'lo' | 'hi';
type Drag = End | { start: number; lo: number; hi: number };

/**
 * A range slider with two handles on one track. Drag a handle to move one
 * end, drag the band between them to move the whole corridor, click the track
 * to move the nearest end there. Arrow keys move the focused handle (with
 * Shift in larger steps). Behind the track, a histogram shows where the fonts are.
 */
export function RangeSlider({ label, value, valueText, onChange, bins, marker, markerLabel, preview, hint }: Props) {
  const [lo, hi] = value;
  // A corridor over the whole range has no effect: band and handles show dimmed.
  const off = lo <= 0 && hi >= 1;
  const el = useRef<HTMLDivElement>(null);
  const band = useRef<HTMLDivElement>(null);
  const handles = { lo: useRef<HTMLDivElement>(null), hi: useRef<HTMLDivElement>(null) };
  const { getValue, changeValue } = useSliderValue(value, onChange);
  const startDrag = usePointerDrag(el, true);

  const set = (a: number, b: number) => changeValue([clamp(Math.min(a, b)), clamp(Math.max(a, b))]);

  /** Moves one end to p, but not past the other end. */
  const moveEnd = (end: End, p: number) => {
    const [lo, hi] = getValue();
    if (end === 'lo') set(Math.min(p, hi), hi);
    else set(lo, Math.max(p, lo));
  };

  const onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    dismissSliderHint();
    const p = trackPosition(el.current!, e);
    const target = e.target as HTMLElement;
    let drag: Drag;
    if (target === handles.lo.current) drag = 'lo';
    else if (target === handles.hi.current) drag = 'hi';
    else if (target === band.current && hi - lo < 1) drag = { start: p, lo, hi };
    else {
      // Click on the track: move the nearest end there.
      drag = Math.abs(p - lo) < Math.abs(p - hi) ? 'lo' : 'hi';
      moveEnd(drag, p);
    }
    if (typeof drag === 'string') handles[drag].current!.focus();
    startDrag(e, (e) => {
      const q = trackPosition(el.current!, e);
      if (typeof drag === 'string') return moveEnd(drag, q);
      const d = Math.min(1 - drag.hi, Math.max(-drag.lo, q - drag.start));
      set(drag.lo + d, drag.hi + d);
    });
  };

  const onKeyDown = (end: End) => (e: KeyboardEvent) => {
    const d = keyDelta(e.key, e.shiftKey ? 0.1 : 0.02, 1);
    if (d == null) return;
    e.preventDefault();
    dismissSliderHint();
    moveEnd(end, getValue()[end === 'lo' ? 0 : 1] + d);
  };

  return (
    <Range ref={el} onPointerDown={onPointerDown} style={{ '--lo': lo, '--hi': hi }}>
      <Histogram bins={bins} value={value} marker={marker} markerLabel={markerLabel} />
      <Track />
      <Shade aria-hidden="true" style={{ left: `${lo * 100}%` }} />
      <Shade aria-hidden="true" style={{ left: `${hi * 100}%` }} />
      <Band ref={band} off={off} movable />
      {preview && <>
        <PreviewBand value={preview} />
        {preview[0] !== lo && <PreviewBoundary at={preview[0]} />}
        {preview[1] !== hi && <PreviewBoundary at={preview[1]} />}
      </>}
      {(['lo', 'hi'] as const).map((end, i) => (
        <Handle
          key={end}
          end={end}
          off={off}
          hint={hint}
          ref={handles[end]}
          role="slider"
          tabindex={0}
          aria-label={`${label} ${end === 'lo' ? 'minimum' : 'maximum'}`}
          aria-valuenow={Math.round(value[i] * 100)}
          aria-valuetext={valueText?.[i]}
          // When the handles meet at the right end, only the lower one can move away, so put it on top.
          style={end === 'lo' ? { zIndex: lo > 0.5 ? 5 : 4 } : undefined}
          onKeyDown={onKeyDown(end)}
        />
      ))}
      {hint && (
        <span class="pointer-events-none absolute top-full left-[calc(var(--hi)*100%)] z-5 mt-1 -translate-x-full pr-0.5 font-mono text-[10px]/none tracking-[0.06em] whitespace-nowrap text-accent" aria-hidden="true">
          drag me ↑
        </span>
      )}
    </Range>
  );
}

/** The corridor that a suggestion would set. */
const PreviewBand = ({ value: [lo, hi] }: { value: Corridor }) => (
  <span class="pointer-events-none absolute bottom-[3px] z-3 h-[5px] bg-accent opacity-40" aria-hidden="true" style={{ left: `${lo * 100}%`, right: `${(1 - hi) * 100}%` }} />
);

/** An end of the corridor that a suggestion would move. */
const PreviewBoundary = ({ at }: { at: number }) => (
  <span class="pointer-events-none absolute -bottom-0.5 z-6 h-7 border-l-2 border-dashed border-accent" aria-hidden="true" style={{ left: `${at * 100}%` }} />
);
