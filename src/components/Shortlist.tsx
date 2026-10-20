import { computed, signal } from '@preact/signals';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { displayedStyle, type Font, type Style, textFonts } from '../data';
import { loadFont, retain, variationSettings } from '../fontload';
import { selectWorkspace, shortlist, showShortlist, toggleShortlist } from '../state';
import { GoogleFontsLink } from './GoogleFontsLink';
import { Slider } from './Slider';

const savedFonts = computed(() => [...shortlist.value].map((name) => textFonts.find((f) => f.family === name)).filter((f): f is Font => !!f));
const selection = signal('');
const primary = computed(() => savedFonts.value.find((f) => f.family === selection.value) ?? savedFonts.value[0]);
const pairing = signal('');
const secondary = computed(() => savedFonts.value.find((f) => f.family === pairing.value && f.family !== primary.value?.family));
type Role = 'heading' | 'body';
/** The chosen style per role; it stays when the font changes, as far as the font supports it. */
const styles = signal<Record<Role, Style | null>>({ heading: null, body: null });
const heading = signal('A little more character.');
const body = signal('Good typography gives words a voice. It sets the pace, shapes the mood, and makes room for ideas to unfold.\n\nTry a few sentences of your own. A font should feel as good in a paragraph as it does in a single word.');
/** Type settings of the specimen: size in px and line height as a factor. */
const headingSize = signal(48);
const headingLeading = signal(1.15);
const bodySize = signal(18);
const bodyLeading = signal(1.55);

/** The style of a role in a font: the chosen weight, or the nearest one the font has. */
function styleFor(role: Role, font: Font): Style {
  const wanted = styles.value[role];
  if (!wanted) return { weight: font.weight, italic: font.italic };
  const italic = font.variants.some((v) => v.endsWith('i') === wanted.italic) ? wanted.italic : !wanted.italic;
  const axis = font.axes?.wght;
  const weight = axis ? Math.min(axis[1], Math.max(axis[0], wanted.weight)) : nearest(weightsOf(font, italic), wanted.weight);
  return { weight, italic };
}

/** The static weights of a family for upright or italic, in order. */
const weightsOf = (font: Font, italic: boolean) => [...new Set(font.variants.filter((v) => v.endsWith('i') === italic).map((v) => parseInt(v)))].sort((a, b) => a - b);

const nearest = (list: number[], w: number) => list.reduce((a, b) => (Math.abs(b - w) < Math.abs(a - w) ? b : a), list[0] ?? w);

function useSpecimenFont(role: Role, font: Font | undefined, text: string) {
  const [alias, setAlias] = useState('');
  const style = font ? styleFor(role, font) : undefined;
  const enabled = showShortlist.value;
  useEffect(() => {
    if (!font || !style || !enabled) return;
    let live = true;
    const timer = setTimeout(() => {
      const loaded = loadFont(font, style, text);
      loaded.ready.then((ok) => { if (live && ok) setAlias(loaded.alias); });
    }, 180);
    return () => { live = false; clearTimeout(timer); };
  }, [font?.family, style?.weight, style?.italic, text, enabled]);
  useEffect(() => (alias ? retain(alias) : undefined), [alias]);
  return { fontFamily: alias ? `'${alias}'` : undefined, fontVariationSettings: style ? variationSettings(style) : undefined };
}

/** The name of a family, set in the family itself once its font has loaded. */
function FamilyName({ font }: { font: Font }) {
  const [alias, setAlias] = useState('');
  useEffect(() => {
    let live = true;
    const loaded = loadFont(font, displayedStyle(font), font.family);
    loaded.ready.then((ok) => { if (live && ok) setAlias(loaded.alias); });
    return () => { live = false; };
  }, [font.family]);
  useEffect(() => (alias ? retain(alias) : undefined), [alias]);
  return <span class={'family-name' + (alias ? ' ready' : '')} style={alias ? { fontFamily: `'${alias}'` } : undefined}>{font.family}</span>;
}

export function ShortlistSidebar() {
  return (
    <div class="shortlist-sidebar">
      <div class="shortlist-list">
        {savedFonts.value.map((font) => (
          <div key={font.family} class={'shortlist-row' + (primary.value?.family === font.family ? ' selected' : '')}>
            <button type="button" class="shortlist-select" aria-pressed={primary.value?.family === font.family} onClick={() => { selection.value = font.family; }}>
              <FamilyName font={font} />
              <small>{primary.value?.family === font.family ? 'Heading' : secondary.value?.family === font.family ? 'Body text' : `${font.variants.length} styles`}</small>
            </button>
            <button type="button" class="shortlist-remove" aria-label={`Remove ${font.family} from shortlist`} title="Remove from shortlist" onClick={() => toggleShortlist(font.family)}>★</button>
          </div>
        ))}
      </div>
      {!savedFonts.value.length && <p class="shortlist-hint">Star fonts in Explore to collect them here.</p>}
      <button type="button" class="back-to-explore" onClick={() => selectWorkspace(false)}>← Explore fonts</button>
    </div>
  );
}

/** One setting of the specimen: a label, the value and a slider. */
function TypeSlider({ label, value, text, min, max, step, disabled, onChange }: { label: string; value: number; text: string; min: number; max: number; step?: number; disabled?: boolean; onChange: (v: number) => void }) {
  return (
    <div class="type-slider">
      <div class="type-slider-head"><span>{label.replace(/^(Heading|Body) /, '')}</span><span class="value">{text}</span></div>
      <Slider label={label} min={min} max={max} step={step} value={value} disabled={disabled} onChange={onChange} />
    </div>
  );
}

/**
 * The weight of a font. A variable font moves along its weight axis, a
 * static font steps through its weights (upright, or italic for an italic-only family).
 */
function WeightControl({ role, font, label }: { role: Role; font: Font; label: string }) {
  const style = styleFor(role, font);
  const axis = font.axes?.wght;
  const weights = weightsOf(font, style.italic);
  const set = (weight: number) => { styles.value = { ...styles.value, [role]: { ...style, weight } }; };
  if (axis) return <TypeSlider label={`${label} weight`} value={style.weight} text={`${Math.round(style.weight)}`} min={axis[0]} max={axis[1]} step={10} onChange={set} />;
  return <TypeSlider label={`${label} weight`} value={Math.max(0, weights.indexOf(style.weight))} text={`${style.weight}`} min={0} max={Math.max(1, weights.length - 1)} disabled={weights.length < 2} onChange={(i) => set(weights[i])} />;
}

/** Size, line height and weight of the heading and the body text, a block each above the specimen. */
function TypeControls({ font, paired }: { font: Font; paired?: Font }) {
  return (
    <div class="type-controls">
      <section class="type-group" aria-label="Heading">
        <div class="type-group-head">
          <span class="eyebrow">Heading</span>
        </div>
        <div class="type-row">
          <TypeSlider label="Heading size" value={headingSize.value} text={`${headingSize.value} px`} min={20} max={120} onChange={(v) => { headingSize.value = v; }} />
          <TypeSlider label="Heading line height" value={headingLeading.value} text={headingLeading.value.toFixed(2)} min={0.8} max={1.8} step={0.05} onChange={(v) => { headingLeading.value = v; }} />
          <WeightControl role="heading" font={font} label="Heading" />
        </div>
      </section>
      <section class="type-group" aria-label="Body text">
        <div class="type-group-head">
          <span class="eyebrow">Body text</span>
          <select aria-label="Body text font" value={paired?.family ?? ''} onChange={(e) => { pairing.value = e.currentTarget.value; }}>
            <option value="">Same as heading</option>
            {savedFonts.value.filter((f) => f.family !== font.family).map((f) => <option key={f.family} value={f.family}>{f.family}</option>)}
          </select>
        </div>
        <div class="type-row">
          <TypeSlider label="Body size" value={bodySize.value} text={`${bodySize.value} px`} min={10} max={48} onChange={(v) => { bodySize.value = v; }} />
          <TypeSlider label="Body line height" value={bodyLeading.value} text={bodyLeading.value.toFixed(2)} min={1} max={2.2} step={0.05} onChange={(v) => { bodyLeading.value = v; }} />
          <WeightControl role="body" font={paired ?? font} label="Body" />
        </div>
      </section>
    </div>
  );
}

/**
 * Text that is edited in place. The element keeps its own content after the
 * first render, so that typing does not move the caret; the signal follows.
 */
function Editable({ tag: Tag, value, onChange, placeholder, ...rest }: { tag: 'h2' | 'p'; value: string; onChange: (text: string) => void; placeholder: string; style?: Record<string, string | undefined>; 'aria-label': string }) {
  const el = useRef<HTMLElement>(null);
  useLayoutEffect(() => { if (el.current) el.current.innerText = value; }, []);
  return <Tag ref={el as any} {...rest} contentEditable="plaintext-only" spellcheck={false} data-placeholder={placeholder} onInput={(e: Event) => onChange((e.currentTarget as HTMLElement).innerText)} />;
}

/** The header of the specimen pane: the fonts in use and their Google Fonts pages. */
export function ShortlistHeader() {
  const font = primary.value, paired = secondary.value;
  if (!font) return <h1 class="pane-title">Pairing</h1>;
  return (
    <div class="pane-title">
      <h1>{font.family}{paired && <span class="plus"> + {paired.family}</span>}</h1>
      <GoogleFontsLink font={font} />
    </div>
  );
}

export function ShortlistPreview() {
  const font = primary.value, paired = secondary.value;
  const text = heading.value + '\n' + body.value;
  const headingStyle = useSpecimenFont('heading', font, text);
  const bodyStyle = useSpecimenFont('body', paired ?? font, text);
  if (!font) return (
    <div class="empty-shortlist"><h2>Your shortlist is empty</h2><p>Star fonts while exploring to compare them here.</p><button type="button" onClick={() => selectWorkspace(false)}>Explore fonts</button></div>
  );
  return (
    <>
      <TypeControls font={font} paired={paired} />
      <article class="specimen" aria-label="Specimen">
      <Editable tag="h2" aria-label="Specimen heading" placeholder="Type a heading" value={heading.value} onChange={(t) => { heading.value = t; }} style={{ ...headingStyle, fontSize: `${headingSize.value}px`, lineHeight: `${headingLeading.value}` }} />
      <Editable tag="p" aria-label="Specimen body text" placeholder="Type some body text" value={body.value} onChange={(t) => { body.value = t; }} style={{ ...bodyStyle, fontSize: `${bodySize.value}px`, lineHeight: `${bodyLeading.value}` }} />
      </article>
    </>
  );
}
