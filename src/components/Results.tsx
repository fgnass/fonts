import type { RefObject } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { displayedStyle } from '../data';
import { loadFont } from '../fontload';
import { type Item, parts, previewLines, previewSize, showSkeletons, view } from '../state';
import { Card } from './card/Card';
import { useCardAnimations } from '../useCardAnimations';

const CHUNK = 48; // cards rendered at a time while scrolling
const PRELOAD = 2; // fonts loaded ahead per group, for when the representative drops out

// Estimated advance widths in em, for the minimum card width.
const LOWER_WIDTH = 0.5;
const UPPER_WIDTH = 0.62;

/** Estimated width of the widest line in em; capitals are wider than lowercase letters. */
const estimateWidth = (lines: string[]) => Math.max(...lines.map((l) => [...l].reduce((w, c) => w + (c === c.toLowerCase() ? LOWER_WIDTH : UPPER_WIDTH), 0)));

/**
 * When the representative of a group drops out of the filters, the next fonts
 * of the group take its place, so load their fonts ahead while the browser is idle.
 */
function usePreloadGroupFonts(items: Item[], count: number, lines: string[]) {
  useEffect(() => {
    const next = items.slice(0, count).flatMap((item) => (item.group ?? []).filter((f) => f.index !== item.index).slice(0, PRELOAD));
    const text = lines.join('');
    let i = 0;
    let handle = requestIdleCallback(function preload(deadline) {
      while (i < next.length && deadline.timeRemaining() > 2) {
        const f = next[i++] as Item;
        loadFont(f, displayedStyle(f), text);
      }
      if (i < next.length) handle = requestIdleCallback(preload);
    });
    return () => cancelIdleCallback(handle);
  }, [items, count, lines]);
}

/**
 * How many items to render: one more chunk each time the sentinel comes near
 * the viewport. The count is kept while filtering: resetting it for every
 * slider update would remove lower cards, and the sentinel would add them back on the next frame.
 */
function useRevealedCount(total: number, sentinel: RefObject<HTMLElement>) {
  const [count, setCount] = useState(CHUNK);
  useEffect(() => {
    if (count >= total || !sentinel.current) return;
    const observer = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && setCount((n) => n + CHUNK), { rootMargin: '1000px' });
    observer.observe(sentinel.current);
    return () => observer.disconnect();
  }, [count, total]);
  return count;
}

/** The result cards, rendered in chunks while scrolling. */
export function Results() {
  const grid = useRef<HTMLDivElement>(null);
  const exits = useRef<HTMLDivElement>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  useCardAnimations(grid, exits);
  const items = view.value.items;
  const lines = previewLines.value;
  const size = previewSize.value;
  const skeletons = showSkeletons.value;
  const count = useRevealedCount(items.length, sentinel);
  usePreloadGroupFonts(items, count, lines);

  let width = estimateWidth(lines);
  // With skeletons shown, a card holds one skeleton per query letter side by side.
  if (skeletons) width = Math.max(width, 1.1 * Math.max(1, parts.value.length));
  return (
    <div
      id="results"
      ref={grid}
      class="relative isolate grid grid-cols-[repeat(auto-fill,minmax(min(100%,var(--card-min)),1fr))] narrow:grid-cols-1 content-start gap-2.5 px-6 pt-5 pb-6 narrow:px-3 narrow:pt-3"
      style={{ '--size': `${size}px`, '--card-min': `${Math.max(160, size * 1.6, size * width + 16)}px` }}
    >
      {items.slice(0, count).map((item) => (
        <Card key={item.index} item={item} lines={lines} skeletons={skeletons} />
      ))}
      <div class="col-span-full h-px" ref={sentinel} />
      <div class="pointer-events-none absolute inset-0 z-0 overflow-clip" ref={exits} aria-hidden="true" />
    </div>
  );
}
