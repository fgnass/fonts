import { styled } from 'classname-variants/preact';
import { displayedStyle, fonts } from '../../data';
import { styleName } from '../../fontload';
import { activeShapeQuery, type Item, likeFont, openFont, pendingExclusion, similarTo } from '../../state';
import { CardActions } from './CardActions';
import { Glyph } from './Glyph';
import { ShortlistStar } from './ShortlistStar';
import { Skeletons } from './Skeletons';
import { showOnHover } from './styles';
import { useInspection } from './useInspection';

const CardBox = styled('div', {
  // On touch devices the controls show at all times: star and actions need the height of two rows, and the name a row above the preview.
  base: 'group/card relative z-1 flex flex-col items-center overflow-hidden rounded-lg border bg-tile px-2.5 py-1.5 text-bright hover:border-accent touch:min-h-24 touch:justify-center touch:pt-8',
  variants: { query: { true: 'border-accent shadow-[0_0_0_1px_var(--color-accent)]', false: 'border-line' } },
});

/** On touch devices the name shows at all times: one quiet line above the preview, so that it does not mix with the preview. */
const touchName = 'touch:max-w-full touch:truncate touch:text-[11px] touch:text-muted';

/** Name and actions sit at opposite edges without reserving preview space. */
const Overlay = styled('div', 'pointer-events-none absolute inset-0 flex flex-col justify-between px-2.5 py-3 font-sans text-[12px]/[1.4] text-soft opacity-0 ' + showOnHover);

/**
 * A result: the preview in the font, with its name, a star and actions. A tap
 * on the card (or on the name, for the keyboard) opens the font.
 * While skeletons show, a shape search result shows its skeletons instead of its text.
 */
export function Card({ item, lines: text, skeletons }: { item: Item; lines: string[]; skeletons?: boolean }) {
  // In a search over all characters, each result has its own character.
  const lines = item.ch ? [item.ch] : text;
  const inspection = useInspection(item);
  const details = styleName(displayedStyle(item), item).trim();
  const open = () => openFont(fonts[item.index]);
  return (
    <CardBox
      // The example font of the shape query or of the similar fonts, and the card whose exclusion suggestions are open, show framed.
      query={(activeShapeQuery.value ? item.index === likeFont.value?.index : item.index === similarTo.value?.index) || pendingExclusion.value?.family === item.family}
      class="cursor-pointer"
      data-font-index={item.index}
      {...inspection}
      onClick={(e: MouseEvent) => { if (!(e.target as Element).closest('button, a, input')) open(); }}
    >
      <Glyph item={item} lines={lines} hidden={skeletons && !!item.skeletons} />
      {item.skeletons && <Skeletons skeletons={item.skeletons} shown={skeletons} />}
      <ShortlistStar family={item.family} />
      <Overlay>
        <div class="pr-9.5">
          <button type="button" class={"pointer-events-auto block cursor-pointer text-left leading-[1.5] font-medium wrap-anywhere text-fg hover:text-accent " + touchName} title="Open this font" onClick={open}>
            {item.family}
          </button>
          {details && <span class="mt-0.5 block text-[11px] text-muted touch:hidden">{details}</span>}
        </div>
        <CardActions item={item} />
      </Overlay>
    </CardBox>
  );
}
