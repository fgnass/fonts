import { Star } from 'lucide-preact';
import { shortlist, toggleShortlist } from '../../state';
import { Chip } from './styles';

/** Adds the family to the shortlist or removes it. */
export function ShortlistStar({ family }: { family: string }) {
  const saved = shortlist.value.has(family);
  return (
    <Chip
      kind="star"
      aria-label={`${saved ? 'Remove' : 'Add'} ${family} ${saved ? 'from' : 'to'} shortlist`}
      aria-pressed={saved}
      title={saved ? 'Remove from shortlist' : 'Add to shortlist'}
      onClick={() => toggleShortlist(family)}
    >
      <Star size={16} strokeWidth={1.75} fill={saved ? 'currentColor' : 'none'} aria-hidden="true" />
    </Chip>
  );
}
