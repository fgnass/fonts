import { isShapeQuery, openWorkspace, shortlist, workspace, type Workspace } from '../state';

const TABS: { id: Workspace; label: string }[] = [
  { id: 'explore', label: 'Explore' },
  { id: 'shape', label: 'Shape' },
  { id: 'shortlist', label: 'Shortlist' },
];

/** Selects and focuses the tab reached by an arrow key, Home or End. */
function onTabKeyDown(event: KeyboardEvent, current: Workspace) {
  const i = TABS.findIndex((t) => t.id === current);
  let next: number;
  switch (event.key) {
    case 'ArrowLeft':
      next = (i + TABS.length - 1) % TABS.length;
      break;
    case 'ArrowRight':
      next = (i + 1) % TABS.length;
      break;
    case 'Home':
      next = 0;
      break;
    case 'End':
      next = TABS.length - 1;
      break;
    default:
      return;
  }
  event.preventDefault();
  openWorkspace(TABS[next].id);
  document.getElementById(`${TABS[next].id}-tab`)?.focus({ preventScroll: true });
}

/** The tabs at the top of the sidebar: the overview, the shape query and the shortlist. */
export function ViewTabs() {
  const current = workspace.value;
  return (
    <div class="flex min-h-[65px] flex-none gap-6 border-b border-line px-4.5" role="tablist" aria-label="Font workspace">
      {TABS.map((t) => {
        const selected = current === t.id;
        return (
          <button
            key={t.id}
            id={`${t.id}-tab`}
            type="button"
            class="-mb-px flex cursor-pointer items-center gap-2 border-b-2 border-transparent pt-4 pb-3 font-medium text-muted hover:text-fg aria-selected:border-accent aria-selected:text-fg"
            role="tab"
            aria-selected={selected}
            aria-controls="font-workspace"
            tabIndex={selected ? 0 : -1}
            onClick={() => openWorkspace(t.id)}
            onKeyDown={(e) => onTabKeyDown(e, t.id)}
          >
            {t.label}
            {/* A shape query that waits for this tab. */}
            {t.id === 'shape' && !selected && isShapeQuery.value && <span class="size-1.5 rounded-full bg-accent" title="Shape query saved" />}
            {t.id === 'shortlist' && <span class="rounded-lg bg-line2 px-1.5 py-px text-[11px] text-soft">{shortlist.value.size}</span>}
          </button>
        );
      })}
    </div>
  );
}
