import { selectWorkspace, shortlist, showShortlist } from '../state';

export function ViewTabs() {
  return (
    <div class="view-tabs" role="tablist" aria-label="Font workspace">
      {[false, true].map((saved) => (
        <button
          key={String(saved)}
          id={saved ? 'shortlist-tab' : 'explore-tab'}
          type="button"
          role="tab"
          aria-selected={showShortlist.value === saved}
          aria-controls="font-workspace"
          tabIndex={showShortlist.value === saved ? 0 : -1}
          onClick={() => selectWorkspace(saved)}
          onKeyDown={(e) => {
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
            e.preventDefault();
            const next = e.key === 'Home' ? false : e.key === 'End' ? true : !saved;
            selectWorkspace(next);
            document.getElementById(next ? 'shortlist-tab' : 'explore-tab')?.focus({ preventScroll: true });
          }}
        >
          {saved ? <>Shortlist <span class="count">{shortlist.value.size}</span></> : 'Explore'}
        </button>
      ))}
    </div>
  );
}
