import { signal } from '@preact/signals';
import { styled } from 'classname-variants/preact';
import { type RefObject } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { displayedStyle } from '../data';
import { variationSettings } from '../fontload';
import { type Sample, samplePair } from '../samples';
import { fontValue } from '../filter';
import { type Slider, describe, LOOK_KEYS, isAny, SLIDERS } from '../sliders';
import { corridors, exclusionPreview, filtered, inspectedFont, lastExclusion, setCorridor, sliderHint } from '../state';
import { RangeSlider } from './RangeSlider';
import { useLoadedFont } from './useLoadedFont';

const SliderBox = styled('div', {
  base: 'relative grid grid-cols-[minmax(0,1fr)] items-center gap-x-2 select-none',
  variants: {
    // The serif type sits under Serifs and shows only while serifs are required.
    sub: { true: 'ml-3' },
    // The slider that the last exclusion changed, or the one that a suggestion would change.
    mark: { none: '', adjusted: 'rounded-xs outline-1 outline-offset-6 outline-accent', previewing: 'rounded-xs outline-1 outline-offset-6 outline-accent outline-dashed' },
  },
});

/** An end label; it shows the measurement details on hover or focus. */
const EndLabel = styled('span', 'group cursor-help font-cond text-[12px]/[1.4] font-normal text-muted last:text-right');

/** The measurement details of a slider, shown below the end labels after a short delay. */
const Tooltip = styled('span', {
  base: 'pointer-events-none invisible absolute inset-x-0 top-5 z-10 rounded-lg border border-line2 bg-tile px-2.5 py-2 text-left font-sans text-[12px]/[1.45] whitespace-pre-line text-fg opacity-0 shadow-[0_8px_24px_rgb(0_0_0/0.5)] transition-[opacity,visibility] duration-120 group-hover:visible group-hover:opacity-100 group-hover:delay-300 group-focus-visible:visible group-focus-visible:opacity-100 group-focus-visible:delay-300',
  defaultProps: { role: 'tooltip' },
});

/** The track between its two ends: a sample letter (look) or a value (technical) on each side. */
const TrackRow = styled('div', {
  base: 'col-span-full grid items-end gap-x-1.5',
  variants: {
    samples: { true: 'grid-cols-[minmax(26px,auto)_minmax(0,1fr)_minmax(26px,auto)]', false: 'grid-cols-[minmax(0,1fr)]' },
  },
});

const End = styled('span', 'pb-px text-center font-cond text-[11px]/[1.2] whitespace-nowrap text-muted tabular-nums');

/** A sample font at each end, shown when its font has loaded. */
const SampleGlyph = styled('i', {
  base: 'inline-block min-w-[1em] cursor-help text-[18px]/none text-fg not-italic transition-opacity',
  variants: { ready: { true: 'opacity-100', false: 'opacity-0' } },
});

export const byKey = new Map(SLIDERS.map((s) => [s.key, s]));

/** Sample fonts for both ends of each slider, filled in one slider at a time (the pairs take some time). */
export const samples = signal<Record<string, [Sample, Sample] | null>>({});
function findSamples() {
  const queue = SLIDERS.filter((s) => s.sample);
  const next = () => {
    const s = queue.shift();
    if (!s) return;
    samples.value = { ...samples.value, [s.key]: samplePair(s) };
    setTimeout(next);
  };
  setTimeout(next);
}
findSamples();

/** A sample letter in a font, shown when the font has loaded. The name of the end is its tooltip. */
export function SampleText({ sample, text, name }: { sample?: Sample; text: string; name: string }) {
  const alias = useLoadedFont(sample?.font, sample?.style, text);
  if (!sample) return <SampleGlyph />;
  const { font, style } = sample;
  const title = `${name}: ${font.family}${style.italic ? ' Italic' : ''}${style.weight !== 400 ? ` ${style.weight}` : ''}${style.wdth != null ? ` wdth ${style.wdth}` : ''}`;
  return (
    <SampleGlyph ready={!!alias} title={title} style={{ fontFamily: alias ? `'${alias}'` : undefined, fontVariationSettings: variationSettings(style) }}>
      {text}
    </SampleGlyph>
  );
}

/** Scrolls the element into its scroll pane while `active` is set, unless it is already in view. */
function useScrollIntoPane(el: RefObject<HTMLElement>, active: boolean) {
  useEffect(() => {
    if (!active) return;
    const frame = requestAnimationFrame(() => {
      const node = el.current, pane = node?.closest('[data-scroll-pane]');
      if (!node || !pane) return;
      const box = node.getBoundingClientRect(), viewport = pane.getBoundingClientRect();
      if (box.top < viewport.top + 8 || box.bottom > viewport.bottom - 8) pane.scrollTop += box.top - viewport.top - 12;
    });
    return () => cancelAnimationFrame(frame);
  }, [active]);
}

export function SliderRow({ slider }: { slider: Slider }) {
  const row = useRef<HTMLDivElement>(null);
  const value = corridors.value[slider.key];
  const pair = samples.value[slider.key];
  const [lo, hi] = slider.ends;

  // The value of the inspected font, shown as a marker on the histogram.
  const inspected = inspectedFont.value;
  const measured = inspected ? fontValue(inspected, slider, displayedStyle(inspected)) : null;
  const marker = measured == null ? undefined : slider.pos(measured);
  const markerLabel = inspected && measured != null ? `${inspected.family}: ${slider.format(measured)}` : undefined;

  const changed = lastExclusion.value?.plan.slider.key === slider.key;
  const preview = exclusionPreview.value?.slider.key === slider.key ? exclusionPreview.value.corridor : undefined;
  const explanation = [slider.tip, markerLabel, preview && `Proposed range: ${describe(slider, preview)} (not applied)`].filter(Boolean).join('\n');
  useScrollIntoPane(row, !!preview);

  return (
    <SliderBox ref={row} sub={!!slider.requires} mark={preview ? 'previewing' : changed ? 'adjusted' : 'none'} onDblClick={() => setCorridor(slider.key, [0, 1])}>
      <div class="flex justify-between gap-3">
        {[lo, hi].map((end, i) => (
          <EndLabel key={i} tabindex={0}>
            {end}
            <Tooltip>{explanation}</Tooltip>
          </EndLabel>
        ))}
      </div>
      <TrackRow samples={!!slider.sample}>
        {slider.sample && <End><SampleText sample={pair?.[0]} text={slider.sample} name={lo} /></End>}
        <RangeSlider
          label={slider.label}
          value={value}
          valueText={[slider.format(slider.value(value[0])), slider.format(slider.value(value[1]))]}
          onChange={(v) => setCorridor(slider.key, v)}
          bins={filtered.value.hist.get(slider.key)}
          marker={marker}
          markerLabel={markerLabel}
          preview={preview}
          hint={sliderHint.value && slider.key === LOOK_KEYS[0]}
        />
        {slider.sample && <End><SampleText sample={pair?.[1]} text={slider.sample} name={hi} /></End>}
      </TrackRow>
    </SliderBox>
  );
}

/** A slider with a bimodal value, shown as a checkbox that sets its corridor. */
export function ToggleRow({ slider }: { slider: Slider }) {
  const on = !isAny(corridors.value[slider.key]);
  return (
    <label class="flex cursor-pointer items-center gap-2 font-mono text-[11px]/[1.4]" title={slider.tip}>
      <input type="checkbox" class="m-0 size-3.5 accent-accent" checked={on} onChange={(e) => setCorridor(slider.key, e.currentTarget.checked ? slider.toggle! : [0, 1])} />
      {slider.label}
    </label>
  );
}

/** A list of sliders; a slider that requires another one shows only while that one excludes its left end. */
export function SliderList({ id, keys }: { id: string; keys: string[] }) {
  return (
    <div id={id} class="relative grid gap-9">
      {keys.map((key) => {
        const s = byKey.get(key)!;
        if (s.requires && corridors.value[s.requires][0] <= 0) return null;
        return s.toggle ? <ToggleRow key={key} slider={s} /> : <SliderRow key={key} slider={s} />;
      })}
    </div>
  );
}
