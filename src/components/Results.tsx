import { useEffect, useRef, useState } from 'preact/hooks';
import { displayedStyle } from '../data';
import { loadFont } from '../fontload';
import { type Item, parts, previewLines, previewSize, previewText, showSkeletons, view } from '../state';
import { Card } from './Card';
import { useCardAnimations } from '../useCardAnimations';

const CHUNK = 48; // cards rendered at a time while scrolling
const PRELOAD = 2; // fonts loaded ahead per group, for when the representative drops out

/** The result cards, rendered in chunks while scrolling. */
export function Results() {
  const grid = useRef<HTMLDivElement>(null);
  const exits = useRef<HTMLDivElement>(null);
  useCardAnimations(grid, exits);
  const items = view.value.items;
  const lines = previewLines.value;
  const size = previewSize.value;
  const skeletons = showSkeletons.value;
  const [count, setCount] = useState(CHUNK);
  const sentinel = useRef<HTMLDivElement>(null);
  // Keep the revealed capacity while filtering. Resetting it for every slider
  // update removes lower cards, then the sentinel adds them back on the next frame.
  // When the representative of a group drops out of the filters, the next fonts of the group take its place,
  // so load their fonts ahead while the browser is idle.
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
  useEffect(() => {
    if (count >= items.length || !sentinel.current) return;
    const observer = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && setCount((n) => n + CHUNK), { rootMargin: '1000px' });
    observer.observe(sentinel.current!);
    return () => observer.disconnect();
  }, [count, items]);

  // Capitals are wider than lowercase letters.
  let width = Math.max(...lines.map((l) => [...l].reduce((w, c) => w + (c === c.toLowerCase() ? 0.5 : 0.62), 0)));
  // With skeletons shown, a card holds one skeleton per query letter side by side.
  if (skeletons) width = Math.max(width, 1.1 * Math.max(1, parts.value.length));
  return (
    <div
      id="results"
      ref={grid}
      class={(previewText.value.length > 1 ? 'words' : '') + (skeletons ? ' skeletons' : '')}
      style={{ '--size': `${size}px`, '--lines': lines.length, '--card-min': `${Math.max(160, size * 1.6, size * width + 16)}px` }}
    >
      {items.slice(0, count).map((item) => (
        <Card key={item.index} item={item} lines={lines} />
      ))}
      <div class="sentinel" ref={sentinel} />
      <div class="card-exits" ref={exits} aria-hidden="true" />
    </div>
  );
}
