import type { ComponentChildren, RefObject } from 'preact';
import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import { styled } from 'classname-variants/preact';
import { type Font, metrics, type Style, tech } from '../../data';
import { variationSettings } from '../../fontload';
import { shortlistView, specimenStyle, specimenStyles, stylesOf } from '../../shortlist-state';
import { previewLines, showShortlist } from '../../state';
import { PreviewTextField } from '../PreviewText';
import { useLoadedFont } from '../useLoadedFont';
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

/** The font in a style, loaded only while the specimen shows. */
function useStyleFont(font: Font, style: Style, text: string) {
  const alias = useLoadedFont(font, style, text, { delay: 120, enabled: showShortlist.value && shortlistView.value === 'specimen' });
  return { fontFamily: alias ? `'${alias}'` : undefined, fontVariationSettings: variationSettings(style) };
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
      if (box.current && width) setFit(Math.floor((box.current.clientWidth / width) * MEASURE_SIZE));
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
      <div ref={box} class="relative flex flex-col gap-4 overflow-x-clip">
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
  const fontStyle = useStyleFont(font, style, lines.join(''));
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
      <div ref={box} class="relative min-w-0 overflow-x-clip">
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

/** Facts about the family: its category, styles, variable axes and technical statistics. */
function Details({ font, class: className }: { font: Font; class?: string }) {
  const t = tech[font.index], m = metrics[font.index];
  const axes = Object.entries(font.axes ?? {}).map(([tag, [min, max]]) => `${tag} ${min}–${max}`);
  // Axes that the CSS API does not load (e.g. opsz) are still part of the font file.
  const otherAxes = (t?.a ?? []).filter((tag) => !(tag in (font.axes ?? {})));
  return (
    <Section aria-label="Details" class={className}>
      <dl class="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-x-8 gap-y-4">
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
      <Sizes font={font} lines={lines} />
      <Styles font={font} lines={lines} />
    </div>
  );
}
