import { styled } from 'classname-variants/preact';
import { primary, secondary, fontView } from '../../shortlist-state';
import { linkClass, SourceLink } from '../SourceLink';
import { Search } from 'lucide-preact';
import { findSimilar } from '../../state';
import { StarButton } from './ShortlistSidebar';

/** The header of the right pane in the shortlist view, on the line of the tabs. */
const PaneTitle = styled('div', 'flex min-h-[65px] items-stretch gap-x-6 border-b border-line px-6 text-[13px] font-medium narrow:min-h-0 narrow:gap-x-5 narrow:px-3');

const VIEWS = [
  { id: 'specimen', label: 'Specimen' },
  { id: 'pairing', label: 'Pairing' },
] as const;

/** Selects and focuses the view reached by an arrow key. */
function onTabKeyDown(event: KeyboardEvent) {
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
  event.preventDefault();
  const i = VIEWS.findIndex((v) => v.id === fontView.value);
  const next = VIEWS[(i + (event.key === 'ArrowLeft' ? VIEWS.length - 1 : 1)) % VIEWS.length].id;
  fontView.value = next;
  document.getElementById(`${next}-view-tab`)?.focus({ preventScroll: true });
}

/** The tabs between the font on its own and the pairing, in the look of the workspace tabs. */
function ViewTabs() {
  return (
    <div class="flex gap-6 narrow:gap-5" role="tablist" aria-label="Shortlist view">
      {VIEWS.map((v) => {
        const selected = fontView.value === v.id;
        return (
          <button
            key={v.id}
            id={`${v.id}-view-tab`}
            type="button"
            class="-mb-px flex cursor-pointer items-center border-b-2 border-transparent pt-4 pb-3 font-medium text-muted hover:text-fg aria-selected:border-accent aria-selected:text-fg narrow:pt-3 narrow:pb-2.5"
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => { fontView.value = v.id; }}
            onKeyDown={onTabKeyDown}
          >
            {v.label}
          </button>
        );
      })}
    </div>
  );
}

/** The header of the specimen pane: the views, the link to similar fonts, the font in use (and its pairing) and the page of its source. */
export function ShortlistHeader() {
  const font = primary.value, paired = fontView.value === 'pairing' ? secondary.value : undefined;
  if (!font) return <PaneTitle as="h1" class="items-center">Shortlist</PaneTitle>;
  return (
    <PaneTitle>
      {/* The tabs come first, so that they keep their place when the selected font changes. */}
      <ViewTabs />
      <button
        type="button"
        // The box of a tab, so that the label sits on the line of the tab labels.
        class="-mb-px flex flex-none cursor-pointer items-center gap-1.5 border-b-2 border-transparent pt-4 pb-3 font-medium text-accent hover:text-bright narrow:pt-3 narrow:pb-2.5"
        title="Show the fonts whose measurements are closest to this font first"
        onClick={() => findSimilar(font)}
      >
        <Search size={14} aria-hidden="true" /> Find similar
      </button>
      <div class="ml-auto flex min-w-0 items-center gap-4">
        {/* On narrow screens, the strip of saved fonts above shows the selected font. */}
        <h1 class="truncate text-[15px] font-medium narrow:sr-only">{font.family}{paired && <span class="font-normal text-muted"> + {paired.family}</span>}</h1>
        <SourceLink font={font} class={'flex-none ' + linkClass} />
        {/* On wide screens, the stars of the list save and remove fonts. */}
        <StarButton font={font} size={16} class="-ml-3 -mr-2 hidden flex-none p-2 narrow:block" />
      </div>
    </PaneTitle>
  );
}
