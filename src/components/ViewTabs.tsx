import { selectWorkspace, shortlist, showShortlist } from '../state';

type TabId = 'explore-tab' | 'shortlist-tab';

const TABS: { id: TabId; label: string }[] = [
  { id: 'explore-tab', label: 'Explore' },
  { id: 'shortlist-tab', label: 'Shortlist' },
];

/** Selects and focuses the tab reached by an arrow key, Home or End. */
function onTabKeyDown(event: KeyboardEvent, current: TabId) {
  let next: TabId;
  switch (event.key) {
    case 'ArrowLeft':
    case 'ArrowRight':
      next = current === 'explore-tab' ? 'shortlist-tab' : 'explore-tab';
      break;
    case 'Home':
      next = 'explore-tab';
      break;
    case 'End':
      next = 'shortlist-tab';
      break;
    default:
      return;
  }
  event.preventDefault();
  selectWorkspace(next === 'shortlist-tab');
  document.getElementById(next)?.focus({ preventScroll: true });
}

export function ViewTabs() {
  const selectedId = showShortlist.value ? 'shortlist-tab' : 'explore-tab';
  return (
    <div class="flex min-h-[65px] flex-none gap-6 border-b border-line px-4.5" role="tablist" aria-label="Font workspace">
      {TABS.map((t) => {
        const selected = selectedId === t.id;
        return (
          <button
            key={t.id}
            id={t.id}
            type="button"
            class="-mb-px flex cursor-pointer items-center gap-2 border-b-2 border-transparent pt-4 pb-3 font-medium text-muted hover:text-fg aria-selected:border-accent aria-selected:text-fg"
            role="tab"
            aria-selected={selected}
            aria-controls="font-workspace"
            tabIndex={selected ? 0 : -1}
            onClick={() => selectWorkspace(t.id === 'shortlist-tab')}
            onKeyDown={(e) => onTabKeyDown(e, t.id)}
          >
            {t.label}
            {t.id === 'shortlist-tab' && <span class="rounded-lg bg-line2 px-1.5 py-px text-[11px] text-soft">{shortlist.value.size}</span>}
          </button>
        );
      })}
    </div>
  );
}
