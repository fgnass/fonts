import { dislikeFont, type Item, showShortlist } from '../../state';
import { exclusionAnchor } from '../FontFeedback';
import { SourceLink } from '../SourceLink';
import { ThumbsDown } from 'lucide-preact';
import { Chip, chip, showOnHover } from './styles';

/** A button to exclude the font (a link to its source in the shortlist). */
export function CardActions({ item }: { item: Item }) {
  return (
    // At the bottom edge, like the star at the top edge: a name over two lines does not move it.
    <div class={'pointer-events-auto absolute inset-x-2.5 bottom-3 flex items-center justify-end gap-2 opacity-0 ' + showOnHover}>
      {showShortlist.value ? (
        <SourceLink font={item} class={chip({ kind: 'similar' })} />
      ) : (
        <Chip
          kind="dislike"
          aria-label={`Exclude ${item.family} by adjusting filters`}
          title="Adjust the sliders to exclude this font while keeping as many others as possible"
          onClick={(e: MouseEvent) => {
            exclusionAnchor.value = e.currentTarget as HTMLElement;
            dislikeFont(item);
          }}
        >
          <ThumbsDown size={15} strokeWidth={1.75} aria-hidden="true" />
        </Chip>
      )}
    </div>
  );
}
