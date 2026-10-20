import { styled } from 'classname-variants/preact';
import type { ComponentChildren } from 'preact';
import { activeShapeQuery, clearPad, clearQuery, corridors, excluded, exclusionPreview, extra, focused, isShapeQuery, lastExclusion, letters, pickLetter, resetCorridors, sketches, tab, undoStroke, withinFilters } from '../state';
import { isAny, LOOK_KEYS, SLIDERS, TECHNICAL_KEYS } from '../sliders';
import { ChevronIcon } from './icons';
import { SliderList } from './SliderList';
import { SketchPad } from './SketchPad';
import { Eyebrow, plural, ResetButton, Switch } from './ui';

/** A letter of the query: the focused one is underlined, a left-out one struck through, a sketched one has a dot. */
const Target = styled('button', {
  base: 'relative h-11 cursor-pointer border-b-2 text-center',
  variants: {
    kind: {
      letter: 'w-9.5 text-[24px] hover:text-soft',
      other: 'w-7.5 text-[24px] outline-none placeholder:text-dim focus:text-soft',
      any: 'px-2 font-mono text-[11px]/none hover:text-soft',
    },
    state: { idle: 'border-transparent text-muted', on: 'border-accent text-accent', off: 'border-transparent text-dim line-through' },
    drawn: { true: 'after:absolute after:bottom-1.5 after:left-1/2 after:-ml-0.5 after:size-1 after:rounded-full after:bg-accent' },
  },
});

const Button = styled('button', {
  base: 'h-8 cursor-pointer rounded-md border px-3 disabled:cursor-default disabled:text-dim',
  variants: {
    quiet: { true: 'border-transparent text-muted', false: 'border-line2 hover:border-muted disabled:border-line' },
  },
  defaultProps: { type: 'button' },
});

/** The count of active filters in a section heading; struck through while a query that searches all fonts ignores them. */
const Count = styled('span', {
  base: 'font-mono text-[10px]/none tracking-normal',
  variants: { paused: { true: 'text-dim line-through', false: 'text-accent' } },
});

/** Whether the focused letter has a sketch. */
const strokesOnPad = () => (sketches.value[focused.value]?.length ?? 0) > 0;

/**
 * The letters of the query: those of the typed name, one extra character and
 * "any". A click shows a letter on the pad; a second click leaves it out.
 */
function Letters() {
  const left = excluded.value, extraChar = extra.value;
  /** The look of a letter's target: focused, left out or idle, and whether it has a sketch. */
  const targetState = (c: string) => ({ state: c === focused.value ? 'on' : left.includes(c) ? 'off' : 'idle', drawn: !!sketches.value[c]?.length }) as const;
  return (
    <div class="flex flex-wrap items-center gap-2.5">
      <Eyebrow>Letters</Eyebrow>
      <div class="flex items-center gap-0.5" role="group" aria-label="Letters of the query">
        {letters.value
          .filter((c) => c !== extraChar)
          .map((c) => (
            <Target key={c} type="button" kind="letter" {...targetState(c)} title={left.includes(c) ? `Take the “${c}” back` : `Draw the “${c}”`} onClick={() => pickLetter(c)}>
              {c}
            </Target>
          ))}
        <Target
          as="input"
          kind="other"
          {...targetState(extraChar)}
          maxlength={1}
          placeholder="…"
          autocomplete="off"
          title="One more character"
          value={extraChar}
          onInput={(e) => {
            extra.value = e.currentTarget.value;
            if (e.currentTarget.value) pickLetter(e.currentTarget.value);
          }}
          onFocus={(e: FocusEvent) => (e.currentTarget as HTMLInputElement).select()}
        />
        <Target type="button" kind="any" {...targetState('')} title="Compare a sketch with all characters" onClick={() => pickLetter('')}>
          any
        </Target>
      </div>
    </div>
  );
}

/** The shape query: a sketch per letter, or the glyphs of an example font. */
function Shape() {
  const drawing = strokesOnPad();
  const leftOut = excluded.value.filter((c) => letters.value.includes(c)).length;
  return (
    <div class="flex flex-col gap-3.5">
      <Letters />
      <SketchPad />
      <div class="flex items-center gap-2">
        <Button disabled={!drawing} onClick={undoStroke}>
          Undo
        </Button>
        <Button disabled={!drawing && !focused.value} title={drawing ? 'Clear the sketch of this letter' : 'Leave this letter out of the query'} onClick={clearPad}>
          Clear
        </Button>
        {isShapeQuery.value && (
          <Button quiet title={`All sketches, the example font${leftOut ? ` and the ${leftOut} left-out ${plural(leftOut, 'letter')}` : ''}`} onClick={clearQuery}>
            Clear all
          </Button>
        )}
      </div>
      <Switch title="Apply the Look and Technical filters too; results stay ordered by similarity" checked={withinFilters.value} onChange={(on) => (withinFilters.value = on)}>
        Apply Look filters too
      </Switch>
    </div>
  );
}

/** A dot in the Shape heading while a shape query exists; faded while it is saved but not active. */
function ShapeQueryDot() {
  const active = activeShapeQuery.value;
  return <span class={'size-1.5 rounded-full bg-accent' + (active ? '' : ' opacity-35')} title={active ? 'A shape query is active' : 'Shape query saved; open Shape to resume'} />;
}

type SectionKey = 'look' | 'technical' | 'shape';

/** The accordion sections; the slider sections list the keys of their sliders. */
const SECTIONS: { key: SectionKey; label: string; keys?: string[] }[] = [
  { key: 'look', label: 'Look', keys: LOOK_KEYS },
  { key: 'technical', label: 'Technical', keys: TECHNICAL_KEYS },
  { key: 'shape', label: 'Shape' },
];

interface SectionProps {
  id: SectionKey;
  label: string;
  open: boolean;
  /** Shows the label in the accent color. */
  highlight?: boolean;
  /** Content of the heading after the label, e.g. a count of active filters. */
  badge?: ComponentChildren;
  onToggle: () => void;
  onReset?: () => void;
  children: ComponentChildren;
}

/** A section of the accordion: a heading that opens and closes it, and its content while open. */
function Section({ id, label, open, highlight, badge, onToggle, onReset, children }: SectionProps) {
  return (
    <section class="border-b border-line">
      <h2 class="relative">
        <button
          type="button"
          class="group flex w-full cursor-pointer items-center gap-2 py-3.5 text-left text-[13px] font-medium text-soft hover:text-fg aria-expanded:text-fg"
          id={`heading-${id}`}
          aria-expanded={open}
          aria-controls={`discovery-${id}`}
          onClick={onToggle}
        >
          <span class={highlight ? 'text-accent' : undefined}>{label}</span>
          {badge}
          <ChevronIcon class="ml-auto group-aria-expanded:rotate-180" />
        </button>
        {onReset && <ResetButton onClick={onReset} />}
      </h2>
      <div id={`discovery-${id}`} role="region" aria-labelledby={`heading-${id}`} hidden={!open} class="pt-1 pb-4.5">
        {open && children}
      </div>
    </section>
  );
}

/** Discovery tools, with one accordion section open at a time. */
export function Sidebar() {
  const current = exclusionPreview.value ? 'look' : tab.value;
  // A query that searches all fonts ignores the filters: their counts show struck through.
  const paused = activeShapeQuery.value && !withinFilters.value;
  const adjustedKey = lastExclusion.value?.plan.slider.key;
  return (
    <div>
      {SECTIONS.map(({ key, label, keys }) => {
        const open = current === key;
        const onToggle = () => { tab.value = open ? null : key; };
        if (!keys) return (
          <Section
            key={key}
            id={key}
            label={label}
            open={open}
            onToggle={onToggle}
            badge={isShapeQuery.value && <ShapeQueryDot />}
          >
            <Shape />
          </Section>
        );
        const active = keys.filter((k) => !isAny(corridors.value[k])).length;
        return (
          <Section
            key={key}
            id={key}
            label={label}
            open={open}
            onToggle={onToggle}
            // The section with the slider that the last exclusion changed shows its name in the accent color.
            highlight={!!adjustedKey && keys.includes(adjustedKey)}
            badge={active > 0 && <Count paused={paused}>{active}</Count>}
            onReset={active > 0 ? () => resetCorridors(SLIDERS.filter((s) => keys.includes(s.key))) : undefined}
          >
            <SliderList id={key} keys={keys} />
          </Section>
        );
      })}
    </div>
  );
}
