import { signal } from '@preact/signals';
import { styled } from 'classname-variants/preact';
import type { ComponentChildren } from 'preact';
import { clearPad, clearQuery, corridors, excluded, exclusionPreview, extra, focused, isShapeQuery, lastExclusion, letters, likeFont, parts, pickLetter, resetCorridors, sketches, undoStroke, workspace } from '../state';
import { isAny, LOOK_KEYS, SLIDERS, TECHNICAL_KEYS } from '../sliders';
import { ChevronDown, Eraser, Trash2, Undo2 } from 'lucide-preact';
import { SliderList } from './SliderList';
import { SketchPad } from './SketchPad';
import { plural, ResetButton } from './ui';

/** A letter tab beside the pad: the focused one is marked on the side of the pad, a left-out one struck through (also while focused), a sketched one has a dot. */
const Target = styled('button', {
  base: 'relative h-10 w-10 flex-none cursor-pointer border-r-2 text-center',
  variants: {
    kind: {
      letter: 'text-[24px] hover:text-soft',
      other: 'text-[24px] outline-none placeholder:text-dim focus:text-soft',
      any: 'font-mono text-[11px]/none hover:text-soft',
    },
    state: { idle: 'border-transparent text-muted', on: 'border-accent text-accent', 'on-off': 'border-accent text-accent line-through', off: 'border-transparent text-dim line-through' },
    drawn: { true: 'after:absolute after:bottom-1.5 after:left-1/2 after:-ml-0.5 after:size-1 after:rounded-full after:bg-accent' },
  },
});

/** The count of active filters in a section heading. */
const Count = styled('span', 'font-mono text-[10px]/none tracking-normal text-accent');

/** Whether the focused letter has a sketch. */
const strokesOnPad = () => (sketches.value[focused.value]?.length ?? 0) > 0;

/**
 * The letters of the query as a column of tabs beside the pad: those of the
 * typed name, one extra character and "any". A click shows a letter on the
 * pad; a second click leaves it out.
 */
function Letters() {
  const left = excluded.value, extraChar = extra.value;
  /** The look of a letter's target: focused, left out or idle, and whether it has a sketch. */
  const targetState = (c: string) => ({ state: c === focused.value ? (left.includes(c) ? 'on-off' : 'on') : left.includes(c) ? 'off' : 'idle', drawn: !!sketches.value[c]?.length }) as const;
  return (
    <div class="flex flex-col">
      <div class="flex flex-col gap-0.5" role="group" aria-label="Letters of the query">
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

const IconButton = styled('button', {
  base: 'grid size-10 cursor-pointer place-items-center rounded-md border border-line2 text-soft disabled:cursor-default disabled:border-line disabled:text-dim',
  defaultProps: { type: 'button' },
});

/** The shape query: a sketch per letter, or the glyphs of an example font. The letters are tabs on the left of the pad, the actions icons on its right. */
export function Shape() {
  const drawing = strokesOnPad();
  const focusedOut = excluded.value.includes(focused.value);
  const leftOut = excluded.value.filter((c) => letters.value.includes(c)).length;
  const clearTitle = drawing ? 'Clear the sketch of this letter' : 'Leave this letter out of the query';
  const clearAllTitle = `Clear all: sketches, the example font${leftOut ? ` and the ${leftOut} left-out ${plural(leftOut, 'letter')}` : ''}`;
  return (
    <div class="flex justify-center gap-2.5">
      {/* As high as the pad; more letters scroll. */}
      <div class="relative w-10 flex-none">
        <div class="absolute inset-0 overflow-y-auto [scrollbar-width:none]">
          <Letters />
        </div>
      </div>
      <div class="w-full max-w-60 min-w-0">
        <SketchPad />
      </div>
      <div class="flex flex-none flex-col gap-2">
        <IconButton disabled={!drawing} aria-label="Undo" title="Undo" onClick={undoStroke}>
          <Undo2 size={18} aria-hidden="true" />
        </IconButton>
        <IconButton disabled={!drawing && (!focused.value || focusedOut)} aria-label={clearTitle} title={clearTitle} onClick={clearPad}>
          <Eraser size={18} aria-hidden="true" />
        </IconButton>
        {isShapeQuery.value && (
          <IconButton aria-label={clearAllTitle} title={clearAllTitle} onClick={clearQuery}>
            <Trash2 size={18} aria-hidden="true" />
          </IconButton>
        )}
      </div>
    </div>
  );
}

/** What the shape query consists of: the example font, the drawn letters, or nothing yet. */
export function querySummary() {
  const font = likeFont.value;
  const drawn = parts.value.filter((p) => p.pts).length;
  const drawing = `${drawn} drawn ${drawn === 1 ? 'letter' : 'letters'}`;
  if (font) return drawn ? `${font.family} · ${drawing}` : `Like ${font.family}`;
  return drawn ? drawing : 'Draw the letters you have in mind';
}

/** How the shape query works, below the pad. */
function ShapeHelp() {
  return (
    <div class="flex flex-col gap-2 border-t border-line pt-4 text-[12px]/[1.5] text-muted">
      <p>Draw a letter as a simple line, the way you would write it. Thickness and serifs do not matter, only the shape.</p>
      <p>The letters on the left come from your preview text. Click one to draw it; each letter you draw narrows the search. With <span class="font-mono text-[11px] text-soft">any</span>, your drawing is compared with every character.</p>
      <p>Click a font card to find fonts with letters like it.</p>
    </div>
  );
}

type SectionKey = 'look' | 'technical';

/** The accordion sections; the slider sections list the keys of their sliders. */
const SECTIONS: { key: SectionKey; label: string; keys: string[] }[] = [
  { key: 'look', label: 'Look', keys: LOOK_KEYS },
  { key: 'technical', label: 'Technical', keys: TECHNICAL_KEYS },
];

/** The open section of the accordion. */
const section = signal<SectionKey | null>('look');

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
          <ChevronDown size={14} class="ml-auto group-aria-expanded:rotate-180" aria-hidden="true" />
        </button>
        {onReset && <ResetButton onClick={onReset} />}
      </h2>
      <div id={`discovery-${id}`} role="region" aria-labelledby={`heading-${id}`} hidden={!open} class="pt-1 pb-4.5">
        {open && children}
      </div>
    </section>
  );
}

/**
 * The tools of the sidebar: in Shape, the pad and the letters; in Filters,
 * the sliders, with one accordion section open at a time. The filters apply in both.
 */
export function Sidebar() {
  const current = exclusionPreview.value ? 'look' : section.value;
  const adjustedKey = lastExclusion.value?.plan.slider.key;
  if (workspace.value === 'shape') {
    return (
      <div>
        <section class="flex flex-col gap-3 pt-1 pb-5" aria-labelledby="shape-heading">
          <div>
            <h2 id="shape-heading" class="text-[13px] font-medium text-fg">Find by shape</h2>
            <p class="mt-0.5 text-[11px] text-muted">{querySummary()}</p>
          </div>
          <Shape />
        </section>
        <ShapeHelp />
      </div>
    );
  }
  return (
    <div>
      {SECTIONS.map(({ key, label, keys }) => {
        const open = current === key;
        const active = keys.filter((k) => !isAny(corridors.value[k])).length;
        return (
          <Section
            key={key}
            id={key}
            label={label}
            open={open}
            onToggle={() => { section.value = open ? null : key; }}
            // The section with the slider that the last exclusion changed shows its name in the accent color.
            highlight={!!adjustedKey && keys.includes(adjustedKey)}
            badge={active > 0 && <Count>{active}</Count>}
            onReset={active > 0 ? () => resetCorridors(SLIDERS.filter((s) => keys.includes(s.key))) : undefined}
          >
            <SliderList id={key} keys={keys} />
          </Section>
        );
      })}
    </div>
  );
}
