import { styled } from 'classname-variants/preact';
import { describe, isAny } from './sliders';
import { activeShapeQuery, filtered, setCorridor, showShortlist, suggestions, welcome, workspace } from './state';
import { Results } from './components/Results';
import { Sidebar } from './components/Sidebar';
import { Toolbar } from './components/Toolbar';
import { ViewTabs } from './components/ViewTabs';
import { ShortlistHeader } from './components/shortlist/ShortlistHeader';
import { ShortlistPreview } from './components/shortlist/ShortlistPreview';
import { ShortlistSidebar, ShortlistStrip } from './components/shortlist/ShortlistSidebar';
import { ExclusionPopover } from './components/FontFeedback';
import { Welcome } from './components/Welcome';
import { isNarrow, Rail, railHidden, shapeOnTop, TabBar, TopBar } from './components/Rail';

/** A scrolling pane of the console. */
const SidebarPane = styled('div', 'min-h-0 flex-1 overflow-y-auto px-4.5 pt-3 pb-5');

const fontCount = (n: number) => `${n} font${n === 1 ? '' : 's'}`;

/** Suggestions for wider corridors when few fonts pass. */
function Compromises() {
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
    <>
      {welcome.value && <Welcome />}
      {/* Behind the start page, the app renders hidden, so that it is ready when the start page closes. */}
      <div class={'grid min-h-screen grid-cols-[360px_minmax(0,1fr)] transition-[grid-template-columns] duration-200 ' + (railHidden.value ? 'narrow:grid-cols-[0px_minmax(0,1fr)]' : 'narrow:grid-cols-[56px_minmax(0,1fr)]') + ' narrow:pb-(--tabbar)' + (welcome.value ? ' invisible fixed inset-0 overflow-hidden' : '')} inert={welcome.value}>
        {isNarrow.value ? <Rail /> : (
          <aside class="sticky top-0 col-start-1 row-start-1 flex h-screen flex-col overflow-hidden border-r border-line bg-panel" aria-label="Font tools">
            <ViewTabs />
            <SidebarPane data-scroll-pane hidden={showShortlist.value}><Sidebar /></SidebarPane>
            <SidebarPane data-scroll-pane hidden={!showShortlist.value}><ShortlistSidebar /></SidebarPane>
          </aside>
        )}
        <main class="col-start-2 row-start-1 flex min-w-0 flex-col">
          {/* On narrow screens, a top bar stays at the top of Explore and Shape; the toolbar of Explore scrolls away. */}
          {isNarrow.value && !showShortlist.value ? (
            <>
              <TopBar />
              {!shapeOnTop.value && <header class="bg-base"><Toolbar /></header>}
            </>
          ) : (
            <header class="sticky top-0 z-1 bg-base">
              <div hidden={showShortlist.value}><Toolbar /></div>
              <div hidden={!showShortlist.value}>
                {/* On narrow screens, the saved fonts come first and the views of the selected font below them. */}
                {isNarrow.value && <ShortlistStrip />}
                <ShortlistHeader />
              </div>
            </header>
          )}
          <section id="font-workspace" role="tabpanel" aria-labelledby={`${workspace.value}-tab`}>
            <div hidden={showShortlist.value}>
              <Compromises />
              <Results />
            </div>
            <div hidden={!showShortlist.value}>
              <ShortlistPreview />
            </div>
          </section>
        </main>
        {isNarrow.value && <TabBar />}
        {!showShortlist.value && <ExclusionPopover />}
      </div>
    </>
  );
}
