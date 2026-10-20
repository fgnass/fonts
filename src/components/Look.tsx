import { signal } from '@preact/signals';
import { useEffect, useRef, useState } from 'preact/hooks';
import { displayedStyle } from '../data';
import { loadFont, retain, variationSettings } from '../fontload';
import { type Sample, samplePair } from '../samples';
import { fontValue } from '../filter';
import { type Slider, describe, LOOK_KEYS, isAny, SLIDERS } from '../sliders';
import { corridors, exclusionPreview, filtered, inspectedFont, lastExclusion, setCorridor, sliderHint } from '../state';
import { RangeSlider } from './RangeSlider';

const byKey = new Map(SLIDERS.map((s) => [s.key, s]));

/** Sample fonts for both ends of each slider, filled in one slider at a time (the pairs take some time). */
const samples = signal<Record<string, [Sample, Sample] | null>>({});
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
function SampleText({ sample, text, name }: { sample?: Sample; text?: string; name: string }) {
  const [alias, setAlias] = useState<string | null>(null);
  useEffect(() => {
    if (!sample || !text) return;
    const { alias, ready } = loadFont(sample.font, sample.style, text);
    let live = true;
    ready.then((ok) => live && ok && setAlias(alias));
    return () => void (live = false);
  }, [sample, text]);
  useEffect(() => (alias ? retain(alias) : undefined), [alias]);
  if (!text) return null;
  if (!sample) return <i class="sample" />;
  const { font, style } = sample;
  const title = `${name}: ${font.family}${style.italic ? ' Italic' : ''}${style.weight !== 400 ? ` ${style.weight}` : ''}${style.wdth != null ? ` wdth ${style.wdth}` : ''}`;
  return (
    <i class={'sample' + (alias ? ' ready' : '')} title={title} style={{ fontFamily: alias ? `'${alias}'` : undefined, fontVariationSettings: variationSettings(style) }}>
      {text}
    </i>
  );
}

function SliderRow({ slider }: { slider: Slider }) {
  const row = useRef<HTMLDivElement>(null);
  const value = corridors.value[slider.key];
  const off = isAny(value);
  const pair = samples.value[slider.key];
  const [lo, hi] = slider.ends;
  const inspected = inspectedFont.value;
  const measured = inspected ? fontValue(inspected, slider, displayedStyle(inspected)) : null;
  const marker = measured == null ? undefined : slider.pos(measured);
  const markerLabel = inspected && measured != null ? `${inspected.family}: ${slider.format(measured)}` : undefined;
  const changed = lastExclusion.value?.plan.slider.key === slider.key;
  const preview = exclusionPreview.value?.slider.key === slider.key ? exclusionPreview.value.corridor : undefined;
  const explanation = slider.tip + (markerLabel ? `\n${markerLabel}` : '') + (preview ? `\nProposed range: ${describe(slider, preview)} (not applied)` : '');
  useEffect(() => {
    if (!preview) return;
    const frame = requestAnimationFrame(() => {
      const node = row.current, pane = node?.closest('.sidebar-content');
      if (!node || !pane) return;
      const box = node.getBoundingClientRect(), viewport = pane.getBoundingClientRect();
      if (box.top < viewport.top + 8 || box.bottom > viewport.bottom - 8) pane.scrollTop += box.top - viewport.top - 12;
    });
    return () => cancelAnimationFrame(frame);
  }, [preview]);
  return (
    <div ref={row} class={'slider' + (off ? ' off' : '') + (slider.requires ? ' sub' : '') + (changed ? ' adjusted' : '') + (preview ? ' previewing' : '')} onDblClick={() => setCorridor(slider.key, [0, 1])}>
      <div class="slider-extremes">
        {[lo, hi].map((end, i) => <span key={i} class="extreme" tabindex={0}>{end}<span class="tip" role="tooltip">{explanation}</span></span>)}
      </div>
      <div class={'track-row' + (slider.sample ? ' with-samples' : '')}>
        {slider.sample && <span class="end"><SampleText sample={pair?.[0]} text={slider.sample} name={lo} /></span>}
        <RangeSlider label={slider.label} value={value} valueText={value.map((p) => slider.format(slider.value(p))) as [string, string]} onChange={(v) => setCorridor(slider.key, v)} bins={filtered.value.hist.get(slider.key)} marker={marker} markerLabel={markerLabel} preview={preview} hint={sliderHint.value && slider.key === LOOK_KEYS[0]} />
        {slider.sample && <span class="end"><SampleText sample={pair?.[1]} text={slider.sample} name={hi} /></span>}
      </div>
    </div>
  );
}

/** A slider with a bimodal value, shown as a checkbox that sets its corridor. */
function ToggleRow({ slider }: { slider: Slider }) {
  const on = !isAny(corridors.value[slider.key]);
  return (
    <label class="check" title={slider.tip}>
      <input type="checkbox" checked={on} onChange={(e) => setCorridor(slider.key, e.currentTarget.checked ? slider.toggle! : [0, 1])} />
      {slider.label}
    </label>
  );
}

/** The slider list; a slider that requires another one shows only while that one excludes its left end. */
function Rows({ keys }: { keys: string[] }) {
  return (
    <div class="sliders">
      {keys.map((key) => {
        const s = byKey.get(key)!;
        if (s.requires && corridors.value[s.requires][0] <= 0) return null;
        return s.toggle ? <ToggleRow key={key} slider={s} /> : <SliderRow key={key} slider={s} />;
      })}
    </div>
  );
}

/** Puts every slider of a group back to "any" (shown in the heading of the group). */
export function ResetButton({ onClick }: { onClick: () => void }) {
  return (
    <button class="reset" type="button" title="Set all sliders of this group back to any" onClick={onClick}>
      <svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
        <path d="M2.2 6a3.8 3.8 0 1 0 1.1-2.7" />
        <path d="M2 1.8v2.4h2.4" />
      </svg>
      Reset
    </button>
  );
}

/** All look sliders in one continuous list, including proportions. */
export function Look() {
  return (
    <div id="look" class="sliders-group">
      <Rows keys={LOOK_KEYS} />
    </div>
  );
}

/** The technical sliders (what a font contains). */
export function Technical() {
  return (
    <div id="technical" class="sliders-group">
      <Rows keys={SLIDERS.filter((s) => s.technical).map((s) => s.key)} />
    </div>
  );
}
