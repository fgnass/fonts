import { styled } from 'classname-variants/preact';

/**
 * The parts of a slider in the look of the range sliders. The container sets
 * --lo and --hi (0–1); band and handles take their positions from them.
 */
export const Range = styled('div', {
  // Keep the layers of the slider to itself, so that its handles stay under the sticky header when the pane scrolls.
  base: 'relative isolate mx-1.25 touch-none',
  variants: {
    small: { true: 'h-4', false: 'h-6' },
    disabled: { true: 'cursor-default', false: 'cursor-pointer' },
  },
});

export const Track = styled('div', 'absolute inset-x-0 bottom-1 z-1 h-0.5 bg-track');

/** The band between the ends, with a larger hit area; transparent while the slider has no effect. */
export const Band = styled('div', {
  base: 'absolute bottom-1 left-[calc(var(--lo)*100%)] right-[calc((1_-_var(--hi))*100%)] z-3 h-0.5 before:absolute before:-inset-y-2 before:inset-x-0',
  variants: {
    off: { true: 'bg-transparent', false: 'bg-accent' },
    // The band of a range slider moves the whole corridor.
    movable: { true: 'cursor-grab in-data-dragging:cursor-grabbing', false: 'cursor-pointer' },
  },
});

/** A thin soft shadow under each handle: it darkens the histogram and the track, not the band. */
export const Shade = styled('span', 'pointer-events-none absolute bottom-0 z-2 -ml-1.25 size-2.5 rounded-full shadow-[0_0_2px_1px_rgb(0_0_0/0.6)]');

/** A handle, with a larger hit area. */
export const Handle = styled('div', {
  base: 'absolute bottom-0 z-4 -ml-1.25 size-2.5 rounded-full before:absolute before:-inset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
  variants: {
    end: { lo: 'left-[calc(var(--lo)*100%)]', hi: 'left-[calc(var(--hi)*100%)]' },
    off: { true: 'bg-dim', false: 'bg-accent' },
    disabled: { true: 'cursor-default', false: 'cursor-ew-resize' },
    // The ends glow, one after the other, until a slider is used.
    hint: { true: 'animate-handle-glow motion-reduce:animate-none motion-reduce:shadow-[0_0_0_3px_rgb(232_184_74/0.35)]' },
  },
  compoundVariants: [{ variants: { hint: true, end: 'lo' }, className: '[animation-delay:0.8s]' }],
});
