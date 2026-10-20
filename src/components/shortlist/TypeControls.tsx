import type { Signal } from '@preact/signals';
import { styled } from 'classname-variants/preact';
import type { Font } from '../../data';
import { bodyLeading, bodySize, headingLeading, headingSize, pairing, type Role, savedFonts, styleFor, styles, weightsOf } from '../../shortlist-state';
import { Slider } from '../Slider';
import { Eyebrow } from '../ui';

/** A group of type settings: its label above a row of sliders, which wraps on a narrow pane. A line separates the groups. */
const TypeGroup = styled('section', 'flex flex-col gap-1.5 pt-4.5 pb-5.5 not-first:border-t not-first:border-line');

/** The label of a group and, for the body text, its font. */
const TypeGroupHead = styled('div', 'flex min-h-6.5 items-center gap-3');

const TypeRow = styled('div', 'flex flex-wrap items-end gap-x-10 gap-y-3.5');

interface TypeSliderProps {
  /** The group, for the accessible label, e.g. "Heading". */
  group: string;
  /** The setting, shown above the slider, e.g. "size". */
  name: string;
  value: number;
  /** The value as shown beside the name. */
  text: string;
  min: number;
  max: number;
  step?: number;
  disabled?: boolean;
  onChange: (v: number) => void;
}

/** One setting of the specimen: a name, the value and a slider. */
function TypeSlider({ group, name, value, text, min, max, step, disabled, onChange }: TypeSliderProps) {
  return (
    <div class="w-50">
      <div class="mb-0.5 flex justify-between gap-3 font-cond text-[12px]/[1.4] text-muted">
        <span>{name}</span>
        <span class="font-mono text-[11px]/[1.4] text-soft tabular-nums">{text}</span>
      </div>
      <Slider label={`${group} ${name}`} min={min} max={max} step={step} value={value} disabled={disabled} onChange={onChange} />
    </div>
  );
}

/**
 * The weight of a font. A variable font moves along its weight axis, a
 * static font steps through its weights (upright, or italic for an italic-only family).
 */
function WeightSlider({ role, font, group }: { role: Role; font: Font; group: string }) {
  const style = styleFor(role, font);
  const axis = font.axes?.wght;
  const set = (weight: number) => { styles.value = { ...styles.value, [role]: { ...style, weight } }; };
  if (axis) return <TypeSlider group={group} name="weight" value={style.weight} text={`${Math.round(style.weight)}`} min={axis[0]} max={axis[1]} step={10} onChange={set} />;
  const weights = weightsOf(font, style.italic);
  return <TypeSlider group={group} name="weight" value={Math.max(0, weights.indexOf(style.weight))} text={`${style.weight}`} min={0} max={Math.max(1, weights.length - 1)} disabled={weights.length < 2} onChange={(i) => set(weights[i])} />;
}

/** The font of the body text: the heading font or another saved font. */
function PairingSelect({ font, paired }: { font: Font; paired?: Font }) {
  return (
    <select class="h-6.5 rounded-md border border-line2 bg-transparent pr-7 pl-2.25 text-[12px] text-soft select-chevron hover:border-muted" aria-label="Body text font" value={paired?.family ?? ''} onChange={(e) => { pairing.value = e.currentTarget.value; }}>
      <option value="">Same as heading</option>
      {savedFonts.value.filter((f) => f.family !== font.family).map((f) => <option key={f.family} value={f.family}>{f.family}</option>)}
    </select>
  );
}

interface Group {
  role: Role;
  label: string;
  /** The prefix of the accessible slider labels. */
  short: string;
  size: Signal<number>;
  sizeRange: [number, number];
  leading: Signal<number>;
  leadingRange: [number, number];
}

const GROUPS: Group[] = [
  { role: 'heading', label: 'Heading', short: 'Heading', size: headingSize, sizeRange: [20, 120], leading: headingLeading, leadingRange: [0.8, 1.8] },
  { role: 'body', label: 'Body text', short: 'Body', size: bodySize, sizeRange: [10, 48], leading: bodyLeading, leadingRange: [1, 2.2] },
];

/** Size, line height and weight of the heading and the body text, a block each above the specimen. */
export function TypeControls({ font, paired }: { font: Font; paired?: Font }) {
  return (
    <div class="flex flex-col border-b border-line px-6">
      {GROUPS.map(({ role, label, short, size, sizeRange, leading, leadingRange }) => (
        <TypeGroup key={role} aria-label={label}>
          <TypeGroupHead>
            <Eyebrow>{label}</Eyebrow>
            {role === 'body' && <PairingSelect font={font} paired={paired} />}
          </TypeGroupHead>
          <TypeRow>
            <TypeSlider group={short} name="size" value={size.value} text={`${size.value} px`} min={sizeRange[0]} max={sizeRange[1]} onChange={(v) => { size.value = v; }} />
            <TypeSlider group={short} name="line height" value={leading.value} text={leading.value.toFixed(2)} min={leadingRange[0]} max={leadingRange[1]} step={0.05} onChange={(v) => { leading.value = v; }} />
            <WeightSlider role={role} font={role === 'body' ? (paired ?? font) : font} group={short} />
          </TypeRow>
        </TypeGroup>
      ))}
    </div>
  );
}
