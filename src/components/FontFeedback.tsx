import { signal } from '@preact/signals';
import { X } from 'lucide-preact';
import { useLayoutEffect, useRef } from 'preact/hooks';
import { styled } from 'classname-variants/preact';
import type { ExclusionPlan } from '../filter';
import { applyExclusion, cancelExclusion, exclusionPreview, pendingExclusion } from '../state';
import { plural } from './ui';

/** Frosted glass like the slider panels of the rail. */
const Box = styled('div', 'relative min-h-0 overflow-y-auto rounded-xl border border-accent/35 bg-raised/60 px-4 pt-2.5 pb-4 shadow-[0_12px_40px_rgb(0_0_0/0.6)] backdrop-blur-xl backdrop-saturate-150');

const Text = styled('p', {
  variants: { hint: { true: 'mt-2.5 text-[11px]/[1.5] text-muted', false: 'text-[12px]/[1.5]' } },
});

const Option = styled('button', {
  base: 'flex w-full cursor-pointer items-center justify-between gap-2 rounded-sm border border-line2 bg-panel px-2 py-2.25 text-left hover:border-accent focus-visible:border-accent',
  defaultProps: { type: 'button' },
});

/** A suggested filter change; hover or focus previews it on its slider. */
function Suggestion({ plan }: { plan: ExclusionPlan }) {
  return (
    <Option
      onPointerEnter={() => { exclusionPreview.value = plan; }}
      onPointerLeave={(e: PointerEvent) => { if (document.activeElement !== e.currentTarget) exclusionPreview.value = null; }}
      onFocus={() => { exclusionPreview.value = plan; }}
      onBlur={() => { exclusionPreview.value = null; }}
      onClick={() => applyExclusion(plan)}
      title="Hover or focus to preview the slider boundary; click to apply"
    >
      <span>{plan.label}</span>
      <small class="flex-none text-[10px] text-muted">{plan.removed} fewer {plural(plan.removed, 'font')}</small>
    </Option>
  );
}

/** The filter changes that would exclude a disliked font. */
function Suggestions({ family, options }: { family: string; options: ExclusionPlan[] }) {
  return (
    <Box as="section" aria-label={`Suggestions for ${family}`} onKeyDown={(e: KeyboardEvent) => { if (e.key === 'Escape') cancelExclusion(); }}>
      <div class="mb-1 flex items-start gap-2">
        <h2 class="flex-1 text-[13px]/6 font-medium">What should change?</h2>
        <button type="button" class="-mt-1 -mr-2.5 grid size-8 flex-none cursor-pointer place-items-center rounded-md text-muted" aria-label="Close" title="Close" onClick={cancelExclusion}>
          <X size={16} aria-hidden="true" />
        </button>
      </div>
      <Text class="mb-2.5 text-soft">{family}</Text>
      {options.length ? <>
        <div class="grid gap-1.5" role="group" aria-label="Suggested filter adjustments">
          {options.map((plan) => <Suggestion key={plan.slider.key} plan={plan} />)}
        </div>
        <Text hint><span class="touch:hidden">Hover to preview. Click to apply.</span><span class="hidden touch:inline">Tap to apply. Undo is at the top.</span></Text>
      </> : <Text>No clear visual difference stands out enough to suggest a filter change.</Text>}
      <Text hint>Suggestions describe measured letter shapes. Shadows and 3D effects aren’t measured.</Text>
    </Box>
  );
}

/** The thumb-down button that asked for the suggestions: the popover shows beside it. */
export const exclusionAnchor = signal<HTMLElement | null>(null);

const MARGIN = 8; // to the edges of the results
const GAP = 10; // between the button and the popover, room for the pointer

/**
 * Places the popover below the button (above it where there is more room),
 * right-aligned with the button, inside the results and above the tab bar;
 * it follows the button while the page scrolls.
 */
function usePlaceAtAnchor(box: { current: HTMLDivElement | null }, pending: typeof pendingExclusion.value, anchor: HTMLElement | null) {
  useLayoutEffect(() => {
    if (!pending) return;
    const place = () => {
      const el = box.current;
      const area = document.querySelector('main')?.getBoundingClientRect();
      if (!el || !area || !anchor?.isConnected) return;
      const a = anchor.getBoundingClientRect();
      const bottom = innerHeight - (document.querySelector<HTMLElement>('[data-tabbar]')?.offsetHeight ?? 0) - MARGIN;
      const width = Math.min(380, area.width - 2 * MARGIN);
      const left = Math.max(area.left + MARGIN, Math.min(area.right - MARGIN - width, a.right + 12 - width));
      el.style.width = `${width}px`;
      el.style.left = `${left}px`;
      const natural = (el.firstElementChild as HTMLElement | null)?.scrollHeight ?? 0;
      const below = bottom - a.bottom - GAP, above = a.top - GAP - MARGIN;
      const down = below >= natural || below >= above;
      const height = Math.min(natural, down ? below : above);
      el.style.maxHeight = `${height}px`;
      el.style.top = `${down ? a.bottom + GAP : a.top - GAP - height}px`;
      el.dataset.side = down ? 'below' : 'above';
      el.style.setProperty('--pointer-x', `${a.left + a.width / 2 - left}px`);
    };
    place();
    addEventListener('scroll', place, { passive: true });
    addEventListener('resize', place);
    return () => {
      removeEventListener('scroll', place);
      removeEventListener('resize', place);
    };
  }, [pending, anchor]);
}

/** The pointer to the button: the outer half of a turned square with the border of the popover, its fill a little past the half to cover that border. */
const pointer = 'absolute left-(--pointer-x) -ml-1.5 size-3 rotate-45 border-accent/35 bg-raised';

/** The suggestions for a disliked font, floating beside its thumb-down button while they are pending. */
export function ExclusionPopover() {
  const pending = pendingExclusion.value;
  const box = useRef<HTMLDivElement>(null);
  usePlaceAtAnchor(box, pending, exclusionAnchor.value);
  if (!pending) return null;
  return (
    <div ref={box} class="fixed z-25 flex flex-col" data-side="below">
      <Suggestions family={pending.family} options={pending.options} />
      <span class={pointer + ' -top-[6.5px] border-t border-l in-data-[side=above]:hidden [clip-path:polygon(0_0,120%_0,0_120%)]'} aria-hidden="true" />
      <span class={pointer + ' -bottom-[6.5px] border-r border-b in-data-[side=below]:hidden [clip-path:polygon(100%_100%,-20%_100%,100%_-20%)]'} aria-hidden="true" />
    </div>
  );
}
