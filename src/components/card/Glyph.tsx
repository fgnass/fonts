import { styled } from 'classname-variants/preact';
import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import { displayedStyle, metrics } from '../../data';
import { variationSettings } from '../../fontload';
import type { Item } from '../../state';
import { dimOnHover } from './styles';
import { useCardFont } from './useCardFont';
import { useNearViewport } from './useNearViewport';

/** The box is as wide as the advance widths; swashes and overhangs may paint beyond it, the card clips them at its edge. */
const GlyphBox = styled('div', {
  base: 'max-w-full py-[calc(var(--size)*0.1)] text-center leading-[calc(var(--size)*1.2)] whitespace-nowrap transition-opacity',
  variants: {
    ready: { true: 'opacity-100 ' + dimOnHover, false: 'opacity-0' },
    hidden: { true: 'hidden' },
  },
});

/** The preview text in the font of the item, a line per line of text. */
export function Glyph({ item, lines, hidden }: { item: Item; lines: string[]; hidden?: boolean }) {
  const el = useRef<HTMLDivElement>(null);
  const style = displayedStyle(item);
  const { alias, covers } = useCardFont(item, style, lines.join(''), useNearViewport(el));
  const [shrink, setShrink] = useState(1);
  // Scale each font so that all cards show the same cap height (0.7 em at --size). Some fonts have capitals
  // taller than the em (up to about 2 em); the lower limit keeps fonts with tiny capitals from growing huge.
  const scale = 0.7 / Math.min(2.5, Math.max(0.5, metrics[item.index].h ?? 0.7));

  // Shrink wide fonts so that the text fits into the card. Before paint, so that no overflow shows.
  useLayoutEffect(() => {
    const node = el.current!;
    if (!covers) return;
    const width = Math.max(...[...node.querySelectorAll('span')].map((s) => s.offsetWidth));
    const next = Math.min(1, node.clientWidth / (width / shrink));
    if (Math.abs(next - shrink) > 0.01) setShrink(next);
  });

  return (
    <GlyphBox
      ref={el}
      ready={covers}
      hidden={hidden}
      style={{
        fontSize: `calc(var(--size) * ${(scale * shrink).toFixed(3)})`,
        fontFamily: alias ? `'${alias}'` : undefined,
        fontVariationSettings: variationSettings(style),
      }}
    >
      {lines.map((line, i) => (
        <div key={i}>
          <span>{line}</span>
        </div>
      ))}
    </GlyphBox>
  );
}
