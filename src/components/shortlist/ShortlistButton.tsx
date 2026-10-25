import { Star, X } from 'lucide-preact';
import type { Font } from '../../data';
import { removeFromShortlist } from '../../shortlist-state';
import { shortlist, toggleShortlist } from '../../state';

interface Props {
  font: Font;
  size: number;
  class: string;
  /** A saved font shows its button only on hover or focus (always on touch screens), so that a list of saved fonts stays quiet. */
  reveal?: boolean;
}

/**
 * The button that saves a font to the shortlist (a star, for the opened font)
 * or removes it (a cross: in the shortlist, every font is saved, so a star
 * would say nothing).
 */
export function ShortlistButton({ font, size, class: className, reveal }: Props) {
  const saved = shortlist.value.has(font.family);
  const hidden = saved && reveal ? ' opacity-0 group-hover:opacity-100 focus-visible:opacity-100 touch:opacity-100' : '';
  return (
    <button
      type="button"
      class={'cursor-pointer text-muted hover:text-fg ' + className + hidden}
      aria-label={`${saved ? 'Remove' : 'Add'} ${font.family} ${saved ? 'from' : 'to'} shortlist`}
      aria-pressed={saved}
      title={saved ? 'Remove from shortlist' : 'Add to shortlist'}
      onClick={() => (saved ? removeFromShortlist(font) : toggleShortlist(font.family))}
    >
      {saved ? <X size={size} aria-hidden="true" /> : <Star size={size} aria-hidden="true" />}
    </button>
  );
}
