import { activeShapeQuery, clearPad, clearQuery, corridors, excluded, exclusionPreview, extra, focused, isShapeQuery, lastExclusion, letters, pickLetter, resetCorridors, sketches, tab, undoStroke, withinFilters } from '../state';
import { isAny, SLIDERS } from '../sliders';
import { Look, ResetButton, Technical } from './Look';
import { SketchPad } from './SketchPad';

const activeCount = (technical: boolean) => SLIDERS.filter((s) => !!s.technical === technical && !isAny(corridors.value[s.key])).length;

/**
 * The letters of the query: those of the typed name, one extra character and
 * "any". A click shows a letter on the pad; a second click leaves it out.
 */
function Letters() {
  const ch = focused.value, out = excluded.value, sk = sketches.value;
  const state = (c: string) => (c === ch ? ' on' : out.includes(c) ? ' off' : '') + (sk[c]?.length ? ' drawn' : '');
  const x = extra.value;
  return (
    <div class="letters">
      <span class="eyebrow">Letters</span>
      <div class="targets" role="group" aria-label="Letters of the query">
        {letters.value
          .filter((c) => c !== x)
          .map((c) => (
            <button key={c} type="button" class={state(c)} title={out.includes(c) ? `Take the “${c}” back` : `Draw the “${c}”`} onClick={() => pickLetter(c)}>
              {c}
            </button>
          ))}
        <input
          class={'other' + state(x)}
          maxlength={1}
          placeholder="…"
          autocomplete="off"
          title="One more character"
          value={x}
          onInput={(e) => {
            extra.value = e.currentTarget.value;
            if (e.currentTarget.value) pickLetter(e.currentTarget.value);
          }}
          onFocus={(e) => e.currentTarget.select()}
        />
        <button type="button" class={'any' + state('')} title="Compare a sketch with all characters" onClick={() => pickLetter('')}>
          any
        </button>
      </div>
    </div>
  );
}

/** The shape query: a sketch per letter, or the glyphs of an example font. */
function Shape() {
  const drawing = strokesOnPad();
  const outCount = excluded.value.filter((c) => letters.value.includes(c)).length;
  return (
    <div class="shape">
      <Letters />
      <SketchPad />
      <div class="row">
        <button type="button" disabled={!drawing} onClick={undoStroke}>
          Undo
        </button>
        <button type="button" disabled={!drawing && !focused.value} title={drawing ? 'Clear the sketch of this letter' : 'Leave this letter out of the query'} onClick={clearPad}>
          Clear
        </button>
        {isShapeQuery.value && (
          <button type="button" class="quiet" title={`All sketches, the example font${outCount ? ` and the ${outCount} left-out letter${outCount > 1 ? 's' : ''}` : ''}`} onClick={clearQuery}>
            Clear all
          </button>
        )}
      </div>
      <label class="switch" title="Apply the Look and Technical filters too; results stay ordered by similarity">
        <input type="checkbox" checked={withinFilters.value} onChange={(e) => (withinFilters.value = e.currentTarget.checked)} />
        <span class="knob" />
        Apply Look filters too
      </label>
    </div>
  );
}

/** Whether the focused letter has a sketch. */
const strokesOnPad = () => (sketches.value[focused.value]?.length ?? 0) > 0;

/** Discovery tools, with one accordion section open at a time. */
export function Sidebar() {
  const look = activeCount(false), technical = activeCount(true);
  const current = exclusionPreview.value ? 'look' : tab.value;
  // A query that searches all fonts ignores the filters: their counts show struck through.
  const count = 'count' + (activeShapeQuery.value && !withinFilters.value ? ' paused' : '');
  return (
    <div class="discovery-controls">
      {(['look', 'technical', 'shape'] as const).map((key) => {
        const open = current === key;
        const active = key === 'look' ? look : key === 'technical' ? technical : 0;
        return (
          <section key={key} class={'discovery-section' + (lastExclusion.value && key === (lastExclusion.value.plan.slider.technical ? 'technical' : 'look') ? ' adjusted-section' : '')}>
            <h2>
              <button type="button" id={`heading-${key}`} aria-expanded={open} aria-controls={`discovery-${key}`} onClick={() => (tab.value = open ? null : key)}>
                <span>{key === 'look' ? 'Look' : key === 'technical' ? 'Technical' : 'Shape'}</span>
                {active > 0 && <span class={count}>{active}</span>}
                {key === 'shape' && isShapeQuery.value && <span class={'dot' + (activeShapeQuery.value ? '' : ' paused')} title={activeShapeQuery.value ? 'A shape query is active' : 'Shape query saved; open Shape to resume'} />}
                <svg class="discovery-chevron" aria-hidden="true" width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 5l4 4 4-4" /></svg>
              </button>
              {active > 0 && <ResetButton onClick={() => resetCorridors(SLIDERS.filter((s) => !!s.technical === (key === 'technical')))} />}
            </h2>
            <div id={`discovery-${key}`} role="region" aria-labelledby={`heading-${key}`} hidden={!open} class="discovery-panel">
              {open && (key === 'look' ? <Look /> : key === 'technical' ? <Technical /> : <Shape />)}
            </div>
          </section>
        );
      })}
    </div>
  );
}
