import { styled } from 'classname-variants/preact';
import { describe, isAny } from './sliders';
import { activeShapeQuery, filtered, setCorridor, showShortlist, suggestions, welcome, withinFilters } from './state';
import { Results } from './components/Results';
import { Sidebar } from './components/Sidebar';
import { Toolbar } from './components/Toolbar';
import { ViewTabs } from './components/ViewTabs';
import { ShortlistHeader } from './components/shortlist/ShortlistHeader';
import { ShortlistPreview } from './components/shortlist/ShortlistPreview';
import { ShortlistSidebar } from './components/shortlist/ShortlistSidebar';
import { FontFeedback } from './components/FontFeedback';
import { Welcome } from './components/Welcome';

/** A scrolling pane of the console. */
const SidebarPane = styled('div', 'min-h-0 flex-1 overflow-y-auto px-4.5 pt-3 pb-5');

const fontCount = (n: number) => `${n} font${n === 1 ? '' : 's'}`;

/** Suggestions for wider corridors when few fonts pass. */
function Compromises() {
  if (activeShapeQuery.value && !withinFilters.value) return null;
  const options = suggestions.value;
  if (!options) return null;
  const count = filtered.value.list.length;
  return (
    <div id="compromise" class="mx-6 mt-4 flex flex-wrap items-center gap-2 rounded-[10px] border border-line bg-tile px-3.5 py-3 font-mono text-[11px]/[1.5] text-soft">
      <p class="basis-full">
        {count ? `Only ${fontCount(count)} ${count === 1 ? 'matches' : 'match'}. Compromises:` : 'No fonts match. Compromises:'}
        {!options.length && ' none.'}
      </p>
      {options.map((o) => (
        <button key={o.slider.key + o.lo + o.hi} class="h-6.5 cursor-pointer rounded-md border border-line2 px-2 text-fg hover:border-muted" onClick={() => setCorridor(o.slider.key, [o.lo, o.hi])}>
          <b class="font-normal text-muted">{o.slider.label}:</b> {isAny([o.lo, o.hi]) ? 'Any' : describe(o.slider, [o.lo, o.hi])} <span class="ml-1 text-accent">+{fontCount(o.gain)}</span>
        </button>
      ))}
    </div>
  );
}

export function App() {
  return (
    <div class="grid min-h-screen grid-cols-[360px_minmax(0,1fr)] narrow:grid-cols-1">
      {welcome.value && <Welcome />}
      <aside class="sticky top-0 col-start-1 row-start-1 flex h-screen flex-col overflow-hidden border-r border-line bg-panel narrow:static narrow:h-auto narrow:border-r-0 narrow:border-b" aria-label="Font tools">
        <ViewTabs />
        {!showShortlist.value && <FontFeedback />}
        <SidebarPane data-scroll-pane hidden={showShortlist.value}><Sidebar /></SidebarPane>
        <SidebarPane data-scroll-pane class="narrow:max-h-[40vh]" hidden={!showShortlist.value}><ShortlistSidebar /></SidebarPane>
      </aside>
      <main class="col-start-2 row-start-1 flex min-w-0 flex-col narrow:col-start-1 narrow:row-start-2">
        <header class="sticky top-0 z-1 bg-base">
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
