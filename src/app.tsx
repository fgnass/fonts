import { describe, isAny } from './sliders';
import { activeShapeQuery, filtered, setCorridor, showShortlist, suggestions, welcome, withinFilters } from './state';
import { Results } from './components/Results';
import { Sidebar } from './components/Sidebar';
import { Toolbar } from './components/Toolbar';
import { ViewTabs } from './components/ViewTabs';
import { ShortlistHeader, ShortlistPreview, ShortlistSidebar } from './components/Shortlist';
import { FontFeedback } from './components/FontFeedback';
import { Welcome } from './components/Welcome';

const fontCount = (n: number) => `${n} font${n === 1 ? '' : 's'}`;

/** Suggestions for wider corridors when few fonts pass. */
function Compromises() {
  if (activeShapeQuery.value && !withinFilters.value) return null;
  const options = suggestions.value;
  if (!options) return null;
  const count = filtered.value.list.length;
  return (
    <div id="compromise">
      <p>
        {count ? `Only ${fontCount(count)} ${count === 1 ? 'matches' : 'match'}. Compromises:` : 'No fonts match. Compromises:'}
        {!options.length && ' none.'}
      </p>
      {options.map((o) => (
        <button key={o.slider.key + o.lo + o.hi} onClick={() => setCorridor(o.slider.key, [o.lo, o.hi])}>
          <b>{o.slider.label}:</b> {isAny([o.lo, o.hi]) ? 'Any' : describe(o.slider, [o.lo, o.hi])} <span>+{fontCount(o.gain)}</span>
        </button>
      ))}
    </div>
  );
}

export function App() {
  return (
    <div class={'app-shell' + (showShortlist.value ? ' shortlist-view' : '')}>
      {welcome.value && <Welcome />}
      <aside aria-label="Font tools">
        <ViewTabs />
        {!showShortlist.value && <FontFeedback />}
        <div class="sidebar-content" hidden={showShortlist.value}><Sidebar /></div>
        <div class="sidebar-content" hidden={!showShortlist.value}><ShortlistSidebar /></div>
      </aside>
      <main>
        <header class="workspace-header">
          <div hidden={showShortlist.value}><Toolbar /></div>
          <div hidden={!showShortlist.value}><ShortlistHeader /></div>
        </header>
        <section id="font-workspace" role="tabpanel" aria-labelledby={showShortlist.value ? 'shortlist-tab' : 'explore-tab'}>
          <div hidden={showShortlist.value}>
            <Compromises />
            <Results />
          </div>
          <div hidden={!showShortlist.value}><ShortlistPreview /></div>
        </section>
      </main>
    </div>
  );
}
