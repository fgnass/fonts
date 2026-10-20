import { styled } from 'classname-variants/preact';
import { displayedStyle } from '../../data';
import { styleName } from '../../fontload';
import { activeShapeQuery, type Item, likeFont } from '../../state';
import { CardActions } from './CardActions';
import { Glyph } from './Glyph';
import { ShortlistStar } from './ShortlistStar';
import { Skeletons } from './Skeletons';
import { showOnHover } from './styles';
import { useInspection } from './useInspection';

const CardBox = styled('div', {
  base: 'group/card relative z-1 flex flex-col items-center overflow-hidden rounded-lg border bg-tile px-2.5 py-1.5 text-bright hover:border-accent',
  variants: { query: { true: 'border-accent shadow-[0_0_0_1px_var(--color-accent)]', false: 'border-line' } },
});

/** Name and actions sit at opposite edges without reserving preview space. */
const Overlay = styled('div', 'pointer-events-none absolute inset-0 flex flex-col justify-between px-2.5 py-3 font-sans text-[12px]/[1.4] text-soft opacity-0 ' + showOnHover);

/**
 * A result: the preview in the font, with buttons for similar fonts and Google Fonts.
 * While skeletons show, a shape search result shows its skeletons instead of its text.
 */
export function Card({ item, lines: text, skeletons }: { item: Item; lines: string[]; skeletons?: boolean }) {
  // In a search over all characters, each result has its own character.
  const lines = item.ch ? [item.ch] : text;
  const inspection = useInspection(item);
  const details = styleName(displayedStyle(item), item).trim();
  return (
    <CardBox query={!!activeShapeQuery.value && item.index === likeFont.value?.index} data-font-index={item.index} {...inspection}>
      <Glyph item={item} lines={lines} hidden={skeletons && !!item.skeletons} />
      {item.skeletons && <Skeletons skeletons={item.skeletons} shown={skeletons} />}
      <ShortlistStar family={item.family} />
      <Overlay>
        <div class="pr-9.5">
          <span class="block leading-[1.5] font-medium wrap-anywhere text-fg">{item.family}</span>
          {details && <span class="mt-0.5 block text-[11px] text-muted">{details}</span>}
        </div>
        <CardActions item={item} />
      </Overlay>
    </CardBox>
  );
}
