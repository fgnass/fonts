import type { ComponentChildren, RefObject } from 'preact';
import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import { styled } from 'classname-variants/preact';
import { type Font, metrics, type Style, tech } from '../../data';
import { axisName } from '../../axis-names';
import { axesOf, axisSettings, fontView, setSpecimenAxis, specimenAxes, specimenStyle, specimenStyles, stylesOf, weightIsStyle } from '../../shortlist-state';
import { previewLines, showShortlist } from '../../state';
import { PreviewTextField } from '../PreviewText';
import { Slider } from '../Slider';
import { useLoadedFont } from '../useLoadedFont';
import { RotateCcw } from 'lucide-preact';
import { Eyebrow } from '../ui';

/** The sizes of the preview text, in px. */
const SIZES = [120, 80, 56, 36, 24, 16];
/** The size of the preview text in the list of styles, in px. */
const STYLE_SIZE = 36;
/** A smaller size is left out when it is this close to the size that fills the width. */
const NEAR_FIT = 0.85;
/** The size at which the text is measured, in px. */
const MEASURE_SIZE = 100;

type FontStyle = Record<string, string | number | undefined>;

const Section = styled('section', 'flex flex-col gap-4 border-b border-line px-6 pt-5 pb-7 narrow:px-3');

// Text that does not fit is clipped, but only beyond the padding of the section: glyphs that reach left of
// their origin or beyond their advance (swashes, brush strokes) still show. (overflow-clip-margin would be
// simpler, but Chrome ignores it when only one axis clips.)
const clipBeyondEdge = 'overflow-x-clip -mx-6 px-6 narrow:-mx-3 narrow:px-3';

/**
 * The font in a style, loaded only while the specimen shows. With `axes`, with
 * the whole range of every axis (for a libre family: its variable font) and
 * the values of the axis sliders.
 */
function useStyleFont(font: Font, style: Style, text: string, axes = true) {
  const alias = useLoadedFont(font, style, text, { delay: 120, enabled: showShortlist.value && fontView.value === 'specimen', allAxes: axes });
  return { fontFamily: alias ? `'${alias}'` : undefined, fontVariationSettings: axes ? axisSettings(font, style) : undefined };
}

const styleLabel = (style: Style) => `${style.weight}${style.italic ? ' italic' : ''}`;

/**
 * The largest size in px at which the text fits the width of the box: the
 * text is measured at MEASURE_SIZE in a hidden copy, again when the font
 * loads or the box changes its width.
 */
function useFitSize() {
  const box = useRef<HTMLDivElement>(null);
  const probe = useRef<HTMLSpanElement>(null);
  const [fit, setFit] = useState(Infinity);
  useLayoutEffect(() => {
    const update = () => {
      const width = probe.current?.offsetWidth;
      if (!box.current || !width) return;
      const { paddingLeft, paddingRight } = getComputedStyle(box.current);
      const inner = box.current.clientWidth - parseFloat(paddingLeft) - parseFloat(paddingRight);
      setFit(Math.floor((inner / width) * MEASURE_SIZE));
    };
    const observer = new ResizeObserver(update);
    if (box.current) observer.observe(box.current);
    if (probe.current) observer.observe(probe.current);
    return () => observer.disconnect();
  }, []);
  return { box, probe, fit };
}

/** The preview text, one line per line of the text. */
function Lines({ lines, style }: { lines: string[]; style: FontStyle }) {
  return <div class="leading-[1.15] whitespace-pre text-bright" style={style}>{lines.join('\n')}</div>;
}

/** A hidden copy of the text at MEASURE_SIZE, for useFitSize. */
function Probe({ lines, style, probe }: { lines: string[]; style: FontStyle; probe: RefObject<HTMLSpanElement> }) {
  return <span ref={probe} class="invisible absolute top-0 left-0 whitespace-pre" style={{ ...style, fontSize: `${MEASURE_SIZE}px` }} aria-hidden="true">{lines.join('\n')}</span>;
}

/**
 * The preview text at falling sizes, in the selected style. The text does not
 * wrap: when the largest size does not fit, the size that fills the width
 * comes first, followed by the sizes below it.
 */
function Sizes({ font, lines }: { font: Font; lines: string[] }) {
  const style = specimenStyle(font);
  const fontStyle = useStyleFont(font, style, lines.join(''));
  const { box, probe, fit } = useFitSize();
  const sizes = fit >= SIZES[0] ? SIZES : [fit, ...SIZES.filter((s) => s < fit * NEAR_FIT)];
  return (
    <Section aria-label="Sizes">
      <Eyebrow>Sizes · {styleLabel(style)}</Eyebrow>
      <div ref={box} class={'relative flex flex-col gap-4 ' + clipBeyondEdge}>
        <Probe lines={lines} style={fontStyle} probe={probe} />
        {sizes.map((size) => (
          <div key={size} class="flex flex-col gap-1">
            <span class="font-mono text-[11px] text-muted tabular-nums">{size} px</span>
            <Lines lines={lines} style={{ ...fontStyle, fontSize: `${size}px` }} />
          </div>
        ))}
      </div>
    </Section>
  );
}

/** One style of the family; a click sets the sizes in it. */
function StyleRow({ font, style, lines, selected }: { font: Font; style: Style; lines: string[]; selected: boolean }) {
  // The styles of a libre family are its static files, without the axis sliders of its variable font.
  const fontStyle = useStyleFont(font, style, lines.join(''), !font.libre);
  // Each style at the same size, unless the text would not fit.
  const { box, probe, fit } = useFitSize();
  return (
    <button
      type="button"
      class={'grid cursor-pointer grid-cols-[72px_minmax(0,1fr)] items-baseline gap-4 rounded-lg border px-3 py-2.5 text-left narrow:grid-cols-1 narrow:gap-1 ' + (selected ? 'border-accent bg-tile' : 'border-transparent hover:border-line2')}
      aria-pressed={selected}
      title="Show the sizes in this style"
      onClick={() => { specimenStyles.value = { ...specimenStyles.value, [font.family]: style }; }}
    >
      <span class="font-mono text-[11px] text-muted">{styleLabel(style)}</span>
      <div ref={box} class={'relative min-w-0 ' + clipBeyondEdge}>
        <Probe lines={lines} style={fontStyle} probe={probe} />
        <Lines lines={lines} style={{ ...fontStyle, fontSize: `${Math.min(STYLE_SIZE, fit)}px` }} />
      </div>
    </button>
  );
}

/** All styles of the family, each with the preview text. */
function Styles({ font, lines }: { font: Font; lines: string[] }) {
  const current = specimenStyle(font);
  const list = stylesOf(font);
  return (
    <Section aria-label="Styles">
      <Eyebrow>{list.length} {list.length === 1 ? 'style' : 'styles'}</Eyebrow>
      <div class="-mx-3 grid gap-1 narrow:mx-0">
        {list.map((style) => (
          <StyleRow key={styleLabel(style)} font={font} style={style} lines={lines} selected={style.weight === current.weight && style.italic === current.italic} />
        ))}
      </div>
    </Section>
  );
}

function Detail({ label, children }: { label: string; children: ComponentChildren }) {
  return (
    <div class="flex flex-col gap-1">
      <dt class="font-cond text-[12px] text-muted">{label}</dt>
      <dd class="text-fg">{children}</dd>
    </div>
  );
}

const REGISTERED = ['wght', 'wdth', 'slnt', 'opsz'];

/** A step for an axis slider: fine for small ranges (WONK 0–1), whole units for large ones. */
const axisStep = (min: number, max: number) => (max - min <= 2 ? 0.01 : max - min <= 20 ? 0.1 : 1);

/**
 * A slider for each variable axis of the family. The weight is that of the
 * selected style; the optical size follows the font size until it is set.
 */
function Axes({ font }: { font: Font }) {
  // The registered axes first, in this order, then the custom ones.
  const order = (tag: string) => { const i = REGISTERED.indexOf(tag); return i < 0 ? REGISTERED.length : i; };
  const axes = Object.entries(axesOf(font))
    .filter((e): e is [string, [number, number, number]] => !!e[1])
    .sort(([a], [b]) => order(a) - order(b) || a.localeCompare(b));
  if (!axes.length) return null;
  const style = specimenStyle(font);
  const values = specimenAxes.value[font.family] ?? {};
  const set = (tag: string, v: number) => {
    if (tag === 'wght' && weightIsStyle(font)) specimenStyles.value = { ...specimenStyles.value, [font.family]: { ...style, weight: v } };
    else setSpecimenAxis(font, tag, v);
  };
  const reset = () => {
    specimenAxes.value = { ...specimenAxes.value, [font.family]: {} };
    specimenStyles.value = { ...specimenStyles.value, [font.family]: { weight: font.weight, italic: style.italic } };
  };
  const changed = Object.keys(values).length > 0 || style.weight !== font.weight;
  return (
    <Section aria-label="Variable axes">
      <div class="flex h-4 items-center justify-between">
        <Eyebrow>Variable axes</Eyebrow>
        {changed && (
          <button type="button" class="inline-flex cursor-pointer items-center gap-1.25 text-[11px] font-medium text-muted hover:text-fg" title="Set all axes back to the defaults of the family" onClick={reset}>
            <RotateCcw size={12} aria-hidden="true" /> Reset
          </button>
        )}
      </div>
      <div class="grid grid-cols-[minmax(110px,auto)_minmax(0,1fr)_72px] items-center gap-x-4 gap-y-3 narrow:grid-cols-[96px_minmax(0,1fr)_64px]">
        {axes.map(([tag, [min, max, def]]) => {
          const auto = tag === 'opsz' && values.opsz == null;
          const value = tag === 'wght' && weightIsStyle(font) ? style.weight : (values[tag] ?? font.pinned?.[tag] ?? def);
          return (
            <div key={tag} class="contents">
              <span class="truncate text-[13px] text-soft" title={tag}>{axisName(tag)}</span>
              <Slider label={axisName(tag)} min={min} max={max} step={axisStep(min, max)} value={value} onChange={(v) => set(tag, v)} />
              {auto ? (
                <span class="font-mono text-[11px] text-muted" title="The optical size follows the font size">Auto</span>
              ) : tag === 'opsz' ? (
                <button type="button" class="cursor-pointer text-left font-mono text-[11px] text-fg tabular-nums hover:text-accent" title="Let the optical size follow the font size again" onClick={() => setSpecimenAxis(font, 'opsz', undefined)}>{+value.toFixed(2)} ×</button>
              ) : (
                <span class="font-mono text-[11px] text-fg tabular-nums">{+value.toFixed(2)}</span>
              )}
            </div>
          );
        })}
      </div>
    </Section>
  );
}

/** Facts about the family: its foundry (for libre families), category, styles, variable axes and technical statistics. */
function Details({ font, class: className }: { font: Font; class?: string }) {
  const t = tech[font.index], m = metrics[font.index];
  const axes = Object.keys(axesOf(font)).map(axisName);
  // Axes that the metadata does not list are still part of the font file.
  const otherAxes = (t?.a ?? []).filter((tag) => !(tag in (font.axes ?? {})));
  return (
    <Section aria-label="Details" class={className}>
      <dl class="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-x-8 gap-y-4">
        {font.libre && <Detail label="Foundry">{font.libre.foundry}</Detail>}
        {font.libre && <Detail label={font.libre.designers.length > 1 ? 'Designers' : 'Designer'}>{font.libre.designers.join(', ')}</Detail>}
        {font.libre && <Detail label="License">{font.libre.license}</Detail>}
        <Detail label="Category">{font.category}</Detail>
        <Detail label="Styles">{font.variants.length}{m?.lc === 0 && ' · capitals only'}</Detail>
        <Detail label="Variable axes">{axes.length || otherAxes.length ? [...axes, ...otherAxes].join(', ') : 'None'}</Detail>
        {t && <Detail label="Glyphs">{t.g}</Detail>}
        {t && <Detail label="Ligatures">{t.l}</Detail>}
      </dl>
      {t && t.f.length > 0 && (
        <Detail label={`OpenType features (${t.f.length})`}>
          <span class="font-mono text-[11px]/[1.7] text-soft">{t.f.join(' ')}</span>
        </Detail>
      )}
    </Section>
  );
}

/** The selected font on its own: the preview text at several sizes, in each style, and facts about the family. */
export function Specimen({ font }: { font: Font }) {
  const lines = previewLines.value;
  return (
    <div class="flex flex-col">
      <div class="flex border-b border-line px-6 py-3 narrow:px-3">
        <PreviewTextField class="flex-[0_1_480px]" />
      </div>
      {/* On narrow screens, the text comes first and the facts last. */}
      <Details font={font} class="narrow:order-last" />
      <Axes font={font} />
      <Sizes font={font} lines={lines} />
      <Styles font={font} lines={lines} />
    </div>
  );
}
