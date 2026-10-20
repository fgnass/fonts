import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { displayedStyle, fonts, hasStyle, metrics } from '../data';
import { fontAlias, isLoaded, loadFont, retain, styleName, textChars, variationSettings } from '../fontload';
import { GRID } from '../shape.js';
import { drawSkeleton } from '../skeleton';
import { activeShapeQuery, dislikeFont, inspectedFont, type Item, likeFont, shortlist, showShortlist, showSimilar, toggleShortlist } from '../state';
import { GoogleFontsLink } from './GoogleFontsLink';

// Loads a card's font only when the card comes near the viewport.
const onVisible = new Map<Element, () => void>();
const observer = new IntersectionObserver(
  (entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      observer.unobserve(e.target);
      onVisible.get(e.target)?.();
      onVisible.delete(e.target);
    }
  },
  { rootMargin: '400px' },
);

/**
 * The preview text in the font of the item. It stays hidden until the font
 * has loaded the first time; after that, it keeps showing the old font until
 * a new one (another style or text) has loaded, so that nothing flickers. The
 * old font is a subset with just its own characters, so it only stays while
 * it has every character of the new text (otherwise the missing ones would
 * show in the fallback font).
 */
function Glyph({ item, lines }: { item: Item; lines: string[] }) {
  const el = useRef<HTMLDivElement>(null);
  const style = displayedStyle(item);
  const text = lines.join('');
  const want = fontAlias(item, style, text);
  // A font that has loaded before (for example ahead, see Results) shows at once.
  const [shown, setShown] = useState<{ alias: string; chars: string } | null>(() => (isLoaded(want) ? { alias: want, chars: textChars(text) } : null));
  const [visible, setVisible] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [shrink, setShrink] = useState(1);
  const covers = shown != null && [...text].every((c) => shown.chars.includes(c));
  // Scale each font so that all cards show the same cap height (0.7 em at --size).
  const scale = 0.7 / Math.min(1, Math.max(0.5, metrics[item.index].h ?? 0.7));

  useEffect(() => {
    const node = el.current!;
    onVisible.set(node, () => setVisible(true));
    observer.observe(node);
    return () => {
      observer.unobserve(node);
      onVisible.delete(node);
    };
  }, []);

  useEffect(() => {
    if (want === shown?.alias) return;
    const chars = textChars(text);
    if (isLoaded(want)) return setShown({ alias: want, chars });
    if (!visible) return;
    const { alias, ready } = loadFont(item, style, text);
    let live = true;
    let retry: ReturnType<typeof setTimeout> | undefined;
    ready.then((ok) => {
      if (!live) return;
      if (ok) setShown({ alias, chars });
      // A failed load (for example a network hiccup) tries again, with growing pauses.
      else retry = setTimeout(() => setAttempt((n) => n + 1), Math.min(30_000, 1000 * 2 ** attempt));
    });
    return () => {
      live = false;
      clearTimeout(retry);
    };
  }, [visible, want, attempt]);

  // Keep the shown font loaded while the card shows it.
  useEffect(() => (shown ? retain(shown.alias) : undefined), [shown?.alias]);

  // Shrink wide fonts so that the text fits into the card. Before paint, so that no overflow shows.
  useLayoutEffect(() => {
    const node = el.current!;
    if (!covers) return;
    const width = Math.max(...[...node.querySelectorAll('span')].map((s) => s.offsetWidth));
    const next = Math.min(1, node.clientWidth / (width / shrink));
    if (Math.abs(next - shrink) > 0.01) setShrink(next);
  });

  return (
    <div
      ref={el}
      class={'glyph' + (covers ? ' ready' : '')}
      style={{
        fontSize: `calc(var(--size) * ${(scale * shrink).toFixed(3)})`,
        fontFamily: shown ? `'${shown.alias}'` : undefined,
        fontVariationSettings: variationSettings(style),
      }}
    >
      {lines.map((line, i) => (
        <div key={i}>
          <span>{line}</span>
        </div>
      ))}
    </div>
  );
}

const SKELETON_PX = 192; // canvas size of a skeleton on a card (3 px per grid cell)

function Skeleton({ points }: { points: Uint8Array }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = canvas.current!;
    const ctx = c.getContext('2d')!;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.strokeStyle = getComputedStyle(c).color;
    drawSkeleton(ctx, points, SKELETON_PX / GRID, 5);
  }, [points]);
  return <canvas class="skeleton" ref={canvas} width={SKELETON_PX} height={SKELETON_PX} />;
}

/** A result: the preview in the font, with buttons for similar fonts and Google Fonts. */
export function Card({ item, lines }: { item: Item; lines: string[] }) {
  // In a search over all characters, each result has its own character.
  if (item.ch) lines = [item.ch];
  const style = displayedStyle(item);
  const query = activeShapeQuery.value && item.index === likeFont.value?.index;
  const details = styleName(style, item).trim();
  const saved = shortlist.value.has(item.family);
  const clearInspection = () => { if (inspectedFont.peek()?.index === item.index) inspectedFont.value = null; };
  useEffect(() => clearInspection, [item.index]);
  // While the pointer stays on the card, Look must follow the style the card shows now (for example after a slider move).
  useEffect(() => { if (inspectedFont.peek()?.index === item.index) inspectedFont.value = item; }, [item]);
  return (
    <div
      class={'card' + (query ? ' query' : '') + (saved ? ' shortlisted' : '')}
      data-font-index={item.index}
      onPointerEnter={() => { inspectedFont.value = item; }}
      onPointerLeave={(e) => { if (!e.currentTarget.contains(document.activeElement)) clearInspection(); }}
      onFocusIn={() => { inspectedFont.value = item; }}
      onFocusOut={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null) && !e.currentTarget.matches(':hover')) clearInspection(); }}
    >
      <Glyph item={item} lines={lines} />
      {item.skeletons && (
        <div class="skeleton-row">
          {item.skeletons.map((p, i) => (
            <Skeleton key={i} points={p} />
          ))}
        </div>
      )}
      <button
        type="button"
        class="shortlist-star"
        aria-label={`${saved ? 'Remove' : 'Add'} ${item.family} ${saved ? 'from' : 'to'} shortlist`}
        aria-pressed={saved}
        title={saved ? 'Remove from shortlist' : 'Add to shortlist'}
        onClick={() => toggleShortlist(item.family)}
      >
        {saved ? '★' : '☆'}
      </button>
      {/* Name and actions sit at opposite edges without reserving preview space. */}
      <div class="bar">
        <div class="card-heading">
          <span class="name">{item.family}</span>
          {details && <span class="font-details">{details}</span>}
        </div>
        <div class="card-actions">
          {item.score != null && <span class="score">{item.score.toFixed(2)}</span>}
          {showShortlist.value ? (
            <GoogleFontsLink font={item} class="similar">Google Fonts</GoogleFontsLink>
          ) : hasStyle[item.index] ? (
            <button
              class="similar"
              title="Show fonts that look like this, among all fonts"
              onClick={() => showSimilar(fonts[item.index])}
            >
              Show similar{item.group && item.group.length > 1 ? ` · ${item.group.length - 1}` : ''}
            </button>
          ) : null}
          {!showShortlist.value && <button
            type="button"
            class="dislike"
            aria-label={`Exclude ${item.family} by adjusting filters`}
            title="Adjust the sliders to exclude this font while keeping as many others as possible"
            onClick={() => dislikeFont(item)}
          >
            <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
              <path d="M17 3h4v11h-4zM17 13l-5 8h-1a2 2 0 0 1-2-2l1-5H5a2 2 0 0 1-2-2l1-7a2 2 0 0 1 2-2h11" />
            </svg>
          </button>}
        </div>
      </div>
    </div>
  );
}
