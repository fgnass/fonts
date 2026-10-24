import { computed, effect, signal } from '@preact/signals';
import { ChevronDown, PencilLine, RotateCcw, SlidersHorizontal, Star, Undo2, X } from 'lucide-preact';
import { styled } from 'classname-variants/preact';
import { type RefObject } from 'preact';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { isAny, LOOK_KEYS, TECHNICAL_KEYS, type Slider } from '../sliders';
import { activeRanges } from '../filter';
import { canUndo, corridors, exclusionMessage, filtered, isShapeQuery, lastExclusion, likeFont, openWorkspace, parts, setCorridor, shortlist, tab, undoFilters, workspace } from '../state';
import { querySummary, Shape } from './Sidebar';
import { useFresh } from './ui';
import { byKey, ChoiceRow, samples, SampleText, SliderRow } from './SliderList';

const query = matchMedia('(max-width: 760px)');
/** Whether the screen is narrow: the console is a rail of slider buttons instead of a sidebar. */
export const isNarrow = signal(query.matches);
query.addEventListener('change', () => { isNarrow.value = query.matches; });

/** The key of the slider that the rail has open. */
const open = signal<string | null>(null);
/** Whether the pad shows under the strip of the Shape tab. */
const padOpen = signal(false);

/** The strip and the pad show above the results in the Shape tab, also without a query yet. */
export const shapeOnTop = computed(() => isNarrow.value && workspace.value === 'shape');
/** The filters do not apply to the shortlist: there, the rail is gone. */
export const railHidden = computed(() => isNarrow.value && workspace.value === 'shortlist');

// A tab change closes the slider panel; the Shape tab opens its pad while there is nothing to compare yet.
effect(() => {
  const current = workspace.value;
  open.value = null;
  if (current === 'shape' && !isShapeQuery.peek()) padOpen.value = true;
});

/** Short names of the technical sliders, which have no sample letters. */
const SHORT: Record<string, string> = { glyphs: 'Gly', features: 'OT', ligatures: 'Lig', axes: 'Var', styles: 'Sty' };

const Item = styled('button', {
  base: 'relative flex min-h-13 w-full flex-none cursor-pointer flex-col items-center justify-center gap-0.5 border-l-2 text-muted',
  variants: {
    open: { true: 'border-accent bg-raised text-fg', false: 'border-transparent' },
    // The slider that the last exclusion changed.
    changed: { true: 'outline-1 -outline-offset-4 outline-accent' },
  },
  defaultProps: { type: 'button' },
});

/** A dot in the corner of an item whose filter is active. */
const Dot = () => <span class="absolute top-2 right-2 size-1.5 rounded-full bg-accent" />;

/** The sample letter of each end of a look slider, one above the other; a short name for a technical slider. */
function ItemFace({ slider }: { slider: Slider }) {
  if (!slider.sample) return <span class="font-mono text-[11px]/none">{SHORT[slider.key] ?? slider.label.slice(0, 3)}</span>;
  const pair = samples.value[slider.key];
  return <>
    <span class="text-[11px]/none opacity-70"><SampleText sample={pair?.[0]} text={slider.sample} name={slider.ends[0]} /></span>
    <span class="text-[11px]/none"><SampleText sample={pair?.[1]} text={slider.sample} name={slider.ends[1]} /></span>
  </>;
}

/** The slider of the open item, beside the rail at the height of its item. */
function SliderPanel({ slider, anchor }: { slider: Slider; anchor: HTMLElement }) {
  const panel = useRef<HTMLDivElement>(null);
  const active = !isAny(corridors.value[slider.key]);

  // Keep the panel beside its item, also while the rail scrolls, but inside the screen.
  useLayoutEffect(() => {
    const place = () => {
      const el = panel.current;
      if (!el) return;
      const box = anchor.getBoundingClientRect();
      const center = box.top + box.height / 2;
      const bottom = innerHeight - (document.querySelector<HTMLElement>('[data-tabbar]')?.offsetHeight ?? 0);
      const top = Math.max(8, Math.min(bottom - el.offsetHeight - 8, center - el.offsetHeight / 2));
      el.style.top = `${top}px`;
      // The pointer stays at the item, also where the panel is pushed into the screen, but not past its corners.
      el.style.setProperty('--pointer', `${Math.max(18, Math.min(el.offsetHeight - 18, center - top))}px`);
    };
    place();
    const pane = anchor.closest('[data-scroll-pane]');
    pane?.addEventListener('scroll', place);
    addEventListener('resize', place);
    return () => {
      pane?.removeEventListener('scroll', place);
      removeEventListener('resize', place);
    };
  }, [anchor, slider]);

  return (
    <div ref={panel} data-rail-panel class="fixed right-2 left-[62px] z-20 rounded-xl border border-accent/35 bg-raised/60 px-4 pt-2.5 pb-4 shadow-[0_12px_40px_rgb(0_0_0/0.6)] backdrop-blur-xl backdrop-saturate-150" role="dialog" aria-label={slider.label}>
      {/* The pointer to the item in the rail: the outer half of a turned square, with the border of the panel; its fill reaches a little past the half to cover the border of the panel there. */}
      <span class="absolute top-(--pointer) -left-[6.5px] -mt-1.5 size-3 rotate-45 border-b border-l border-accent/35 bg-raised [clip-path:polygon(0_-20%,0_100%,120%_100%)]" aria-hidden="true" />
      <div class="mb-3 flex h-6 items-center gap-2">
        <span class="flex-1 text-[13px] font-medium text-fg">{slider.label}</span>
        {active && (
          <button type="button" class="inline-flex h-6 cursor-pointer items-center gap-1.25 rounded-md px-1.75 text-[11px] font-medium text-muted" onClick={() => setCorridor(slider.key, [0, 1])}>
            <RotateCcw size={12} aria-hidden="true" />
            Any
          </button>
        )}
        <button type="button" class="-mr-2.5 grid size-8 flex-none cursor-pointer place-items-center rounded-md text-muted" aria-label="Close" title="Close" onClick={() => { open.value = null; }}>
          <X size={16} aria-hidden="true" />
        </button>
      </div>
      {slider.choices ? <ChoiceRow slider={slider} /> : <SliderRow slider={slider} />}
    </div>
  );
}

// A "similar" search starts with the pad open, so that its letters explain the results; later steps keep the choice.
let hadFont = false;
effect(() => {
  const hasFont = !!likeFont.value;
  if (hasFont && !hadFont) padOpen.value = true;
  hadFont = hasFont;
});

const StripButton = styled('button', {
  base: 'grid size-10 flex-none cursor-pointer place-items-center rounded-md disabled:cursor-default disabled:text-dim',
  variants: { on: { true: 'text-accent', false: 'text-muted' } },
  defaultVariants: { on: false },
  defaultProps: { type: 'button' },
});

/**
 * The top bar of Filters and Shape: the name of the tab and a line about the
 * results (or what the shape query consists of, or what the last exclusion
 * did), the undo of filter changes and, in Shape, a toggle for the pad. The
 * shape query applies whether the pad shows or not. The bar stays at the
 * top; the pad scrolls away with the results.
 */
export function TopBar() {
  const shape = workspace.value === 'shape';
  const message = useFresh(exclusionMessage.value);
  const count = filtered.value.list.length;
  const line = message ?? (shape ? querySummary() : `${count} ${count === 1 ? 'font' : 'fonts'}`);
  return (
    <>
      <div data-bar class="sticky top-0 z-2 flex h-14 items-center gap-1 border-b border-line bg-panel pr-1 pl-3">
        <div class="min-w-0 flex-1">
          <div class="truncate text-[15px]/[1.3] font-medium text-fg">{shape ? 'Find by shape' : 'Filters'}</div>
          <div class={'truncate text-[11px] ' + (message ? 'text-accent' : 'text-muted')} role="status">{line}</div>
        </div>
        <StripButton disabled={!canUndo.value} aria-label="Undo the last filter change" title="Undo the last filter change" onClick={undoFilters}>
          <Undo2 size={19} aria-hidden="true" />
        </StripButton>
        {shape && (
          <StripButton class="relative" on={padOpen.value} aria-expanded={padOpen.value} aria-label="Letters" title={padOpen.value ? 'Hide the letters' : 'Show the letters'} onClick={() => { padOpen.value = !padOpen.value; }}>
            <ChevronDown size={20} class={padOpen.value ? 'rotate-180' : undefined} aria-hidden="true" />
            {/* While the pad is hidden, a dot tells that its shapes still apply. */}
            {!padOpen.value && isShapeQuery.value && <span class="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-accent" />}
          </StripButton>
        )}
      </div>
      {shape && padOpen.value && (
        <div class="border-b border-line bg-panel px-3 pt-3 pb-4">
          <Shape />
        </div>
      )}
    </>
  );
}

const Tab = styled('button', {
  base: 'relative flex flex-1 cursor-pointer flex-col items-center justify-center gap-1 text-[11px]/none font-medium',
  variants: { on: { true: 'text-accent', false: 'text-muted' } },
  defaultVariants: { on: false },
  defaultProps: { type: 'button', role: 'tab' },
});

/** The tab bar on narrow screens: always at the bottom, above the home indicator. */
export function TabBar() {
  const current = workspace.value;
  return (
    <nav data-tabbar data-bar class="fixed inset-x-0 bottom-0 z-30 flex h-(--tabbar) border-t border-line bg-panel pb-[env(safe-area-inset-bottom)]" role="tablist" aria-label="Font workspace">
      <Tab on={current === 'explore'} aria-selected={current === 'explore'} onClick={() => openWorkspace('explore')}>
        <SlidersHorizontal size={20} strokeWidth={1.75} aria-hidden="true" />
        Filters
        {/* Filters that are set apply in every tab. */}
        {activeRanges(corridors.value).size > 0 && <span class="absolute top-2 left-[calc(50%+10px)] size-1.5 rounded-full bg-accent" />}
      </Tab>
      <Tab on={current === 'shape'} aria-selected={current === 'shape'} onClick={() => openWorkspace('shape')}>
        <PencilLine size={20} strokeWidth={1.75} aria-hidden="true" />
        Shape
        {/* A shape query is set (as on the tabs of wide screens). */}
        {isShapeQuery.value && <span class="absolute top-2 left-[calc(50%+10px)] size-1.5 rounded-full bg-accent" />}
      </Tab>
      <Tab on={current === 'shortlist'} aria-selected={current === 'shortlist'} onClick={() => openWorkspace('shortlist')}>
        <Star size={20} strokeWidth={1.75} aria-hidden="true" />
        Shortlist{shortlist.value.size > 0 && ` · ${shortlist.value.size}`}
      </Tab>
    </nav>
  );
}

/** Closes the open panel on a tap outside the panel and the rail; the tap does nothing else. */
function useCloseOnTapOutside() {
  const isOpen = open.value !== null;
  useEffect(() => {
    if (!isOpen) return;
    const onClick = (e: MouseEvent) => {
      const target = e.target as Element;
      if (target.closest('[data-rail-panel], [data-rail]')) return;
      // The bars at the top and the bottom work with an open panel: the tap closes it and does its job.
      if (target.closest('[data-bar]')) return void (open.value = null);
      e.preventDefault();
      e.stopPropagation();
      open.value = null;
    };
    addEventListener('click', onClick, true);
    return () => removeEventListener('click', onClick, true);
  }, [isOpen]);
}

/** Whether the pane is scrolled to its top and to its bottom; updates on scroll and when its size changes. */
function useScrollEdges(pane: RefObject<HTMLElement>) {
  const [edges, setEdges] = useState({ top: true, bottom: true });
  useEffect(() => {
    const el = pane.current;
    if (!el) return;
    const update = () => {
      const next = { top: el.scrollTop <= 1, bottom: el.scrollTop + el.clientHeight >= el.scrollHeight - 1 };
      setEdges((e) => (e.top === next.top && e.bottom === next.bottom ? e : next));
    };
    update();
    el.addEventListener('scroll', update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(el);
    for (const child of el.children) observer.observe(child);
    return () => {
      el.removeEventListener('scroll', update);
      observer.disconnect();
    };
  }, []);
  return edges;
}

/**
 * The filters on narrow screens: a rail with one item per slider. A tap on an
 * item slides its slider out over the results; the results stay visible
 * above and below it. Rail and results scroll independently.
 */
export function Rail() {
  const anchors = useRef<Record<string, HTMLElement | null>>({});
  const pane = useRef<HTMLDivElement>(null);
  const edges = useScrollEdges(pane);
  useCloseOnTapOutside();
  // More items above or below fade out at that edge.
  // At the bottom, the items are gone where the arrow to more filters sits.
  const fade = `linear-gradient(to bottom, ${edges.top ? '#000' : 'transparent'} 0, #000 28px, #000 calc(100% - 64px), ${edges.bottom ? '#000' : 'transparent'} calc(100% - 28px))`;
  const current = open.value;
  const toggle = (key: string) => {
    if (open.value === key) return void (open.value = null);
    open.value = key;
    // In the Shape tab, the sliders add to the shape query.
    if (tab.value !== 'shape') tab.value = TECHNICAL_KEYS.includes(key) ? 'technical' : 'look';
  };
  const adjusted = lastExclusion.value?.plan.slider.key;

  const sliderItems = (keys: string[]) =>
    keys.map((key) => {
      const s = byKey.get(key)!;
      if (s.requires && corridors.value[s.requires][0] <= 0) return null;
      return (
        <Item key={key} ref={(el: HTMLElement | null) => { anchors.current[key] = el; }} open={current === key} changed={adjusted === key} aria-label={s.label} aria-expanded={current === key} onClick={() => toggle(key)}>
          <ItemFace slider={s} />
          {!isAny(corridors.value[key]) && <Dot />}
        </Item>
      );
    });

  const openSlider = current ? byKey.get(current) : undefined;
  const anchor = current ? anchors.current[current] : null;

  return (
    <>
      <aside data-rail class={'sticky top-0 col-start-1 row-start-1 flex h-[calc(100dvh-var(--tabbar))] w-14 flex-col overflow-hidden bg-panel transition-transform duration-200 ' + (railHidden.value ? '-translate-x-full' : 'border-r border-line')} inert={railHidden.value} aria-label="Filters">
        <div ref={pane} data-scroll-pane class="min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-width:none]" style={{ maskImage: fade, WebkitMaskImage: fade }}>
          {sliderItems(LOOK_KEYS)}
          <div class="mx-3 my-1.5 border-t border-line" />
          {sliderItems(TECHNICAL_KEYS)}
        </div>
        {!edges.bottom && (
          <button
            type="button"
            class="absolute inset-x-0 bottom-0 grid h-8 cursor-pointer place-items-center text-muted"
            aria-label="More filters"
            title="More filters"
            onClick={() => pane.current?.scrollBy({ top: pane.current.clientHeight * 0.7, behavior: 'smooth' })}
          >
            <ChevronDown size={16} class="animate-bounce [animation-duration:2s]" aria-hidden="true" />
          </button>
        )}
      </aside>
      {openSlider && anchor && <SliderPanel slider={openSlider} anchor={anchor} />}
    </>
  );
}
