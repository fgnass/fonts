import { styled } from 'classname-variants/preact';
import { primary, secondary, shortlistView } from '../../shortlist-state';
import { GoogleFontsLink, linkClass } from '../GoogleFontsLink';
import { RemoveButton } from './ShortlistSidebar';

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
  const next = shortlistView.value === 'specimen' ? 'pairing' : 'specimen';
  shortlistView.value = next;
  document.getElementById(`${next}-view-tab`)?.focus({ preventScroll: true });
}

/** The tabs between the font on its own and the pairing, in the look of the workspace tabs. */
function ViewTabs() {
  return (
    <div class="flex gap-6 narrow:gap-5" role="tablist" aria-label="Shortlist view">
      {VIEWS.map((v) => {
        const selected = shortlistView.value === v.id;
        return (
          <button
            key={v.id}
            id={`${v.id}-view-tab`}
            type="button"
            class="-mb-px flex cursor-pointer items-center border-b-2 border-transparent pt-4 pb-3 font-medium text-muted hover:text-fg aria-selected:border-accent aria-selected:text-fg narrow:pt-3 narrow:pb-2.5"
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => { shortlistView.value = v.id; }}
            onKeyDown={onTabKeyDown}
          >
            {v.label}
          </button>
        );
      })}
    </div>
  );
}

/** The header of the specimen pane: the font in use (and its pairing), the views and its Google Fonts page. */
export function ShortlistHeader() {
  const font = primary.value, paired = shortlistView.value === 'pairing' ? secondary.value : undefined;
  if (!font) return <PaneTitle as="h1" class="items-center">Shortlist</PaneTitle>;
  return (
    <PaneTitle>
      {/* The tabs come first, so that they keep their place when the selected font changes. */}
      <ViewTabs />
      <div class="ml-auto flex min-w-0 items-center gap-4">
        {/* On narrow screens, the strip of saved fonts above shows the selected font. */}
        <h1 class="truncate text-[15px] font-medium narrow:sr-only">{font.family}{paired && <span class="font-normal text-muted"> + {paired.family}</span>}</h1>
        <GoogleFontsLink font={font} class={'flex-none ' + linkClass}>Google Fonts</GoogleFontsLink>
        {/* On wide screens, the stars of the list remove fonts. */}
        <RemoveButton font={font} size={16} class="-ml-3 -mr-2 hidden flex-none p-2 narrow:block" />
      </div>
    </PaneTitle>
  );
}
