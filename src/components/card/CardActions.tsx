import { fonts, hasStyle } from '../../data';
import { dislikeFont, type Item, showShortlist, showSimilar } from '../../state';
import { GoogleFontsLink } from '../GoogleFontsLink';
import { DislikeIcon } from '../icons';
import { Chip, chip, showOnHover } from './styles';

/** The score of a shape search, and buttons for similar fonts and to exclude the font (Google Fonts in the shortlist). */
export function CardActions({ item }: { item: Item }) {
  return (
    <div class={'pointer-events-auto flex flex-wrap items-center justify-end gap-2 opacity-0 ' + showOnHover}>
      {item.score != null && <span class="order-1 ml-auto text-muted">{item.score.toFixed(2)}</span>}
      {showShortlist.value ? (
        <GoogleFontsLink font={item} class={chip({ kind: 'similar' })}>Google Fonts</GoogleFontsLink>
      ) : (
        <>
          {hasStyle[item.index] && (
            <Chip kind="similar" title="Show fonts that look like this, among all fonts" onClick={() => showSimilar(fonts[item.index])}>
              Show similar{item.group && item.group.length > 1 ? ` · ${item.group.length - 1}` : ''}
            </Chip>
          )}
          <Chip
            kind="dislike"
            aria-label={`Exclude ${item.family} by adjusting filters`}
            title="Adjust the sliders to exclude this font while keeping as many others as possible"
            onClick={() => dislikeFont(item)}
          >
            <DislikeIcon />
          </Chip>
        </>
      )}
    </div>
  );
}
