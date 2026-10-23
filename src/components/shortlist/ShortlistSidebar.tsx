import { ArrowLeft, ChevronLeft, ChevronRight, Star } from 'lucide-preact';
import { styled } from 'classname-variants/preact';
import { displayedStyle, type Font } from '../../data';
import { primary, removeFromShortlist, savedFonts, secondary, selection, shortlistView } from '../../shortlist-state';
import { selectWorkspace } from '../../state';
import { useEffect, useRef } from 'preact/hooks';
import { useLoadedFont } from '../useLoadedFont';
import { plural } from '../ui';

const Row = styled('div', {
  base: 'flex items-center rounded-lg border',
  variants: { selected: { true: 'border-accent bg-tile', false: 'border-line' } },
});

/** The name of a family, set in the family itself once its font has loaded. */
function FamilyName({ font, class: className = 'block text-[18px]/[1.3]' }: { font: Font; class?: string }) {
  const alias = useLoadedFont(font, displayedStyle(font), font.family);
  // The name in its own font; it switches without a jump once the font is there.
  return <span class={className + ' text-bright transition-opacity'} style={alias ? { fontFamily: `'${alias}'` } : undefined}>{font.family}</span>;
}

/** The star that removes a font from the shortlist. */
export function RemoveButton({ font, size, class: className }: { font: Font; size: number; class: string }) {
  return (
    <button type="button" class={'cursor-pointer text-accent ' + className} aria-label={`Remove ${font.family} from shortlist`} title="Remove from shortlist" onClick={() => removeFromShortlist(font)}>
      <Star size={size} fill="currentColor" aria-hidden="true" />
    </button>
  );
}

/** What the font is used for in the pairing, or else how many styles it has. */
function roleLabel(font: Font) {
  if (shortlistView.value === 'pairing' && primary.value?.family === font.family) return 'Heading';
  if (shortlistView.value === 'pairing' && secondary.value?.family === font.family) return 'Body text';
  return `${font.variants.length} ${plural(font.variants.length, 'style')}`;
}

/** The saved fonts; a click selects the heading font of the specimen. */
export function ShortlistSidebar() {
  return (
    <div class="flex min-h-full flex-col gap-3.5">
      <div class="grid gap-1.5">
        {savedFonts.value.map((font) => {
          const selected = primary.value?.family === font.family;
          return (
            <Row key={font.family} selected={selected}>
              <button type="button" class="min-w-0 flex-1 cursor-pointer p-3 text-left wrap-anywhere" aria-pressed={selected} onClick={() => { selection.value = font.family; }}>
                <FamilyName font={font} />
                <small class="mt-1 block text-[11px] text-muted">{roleLabel(font)}</small>
              </button>
              <RemoveButton font={font} size={18} class="p-2.5" />
            </Row>
          );
        })}
      </div>
      {!savedFonts.value.length && <p class="text-[12px] text-muted">Star fonts to collect them here.</p>}
      <button type="button" class="mt-auto inline-flex cursor-pointer items-center gap-1.5 pt-3 text-left text-soft narrow:hidden" onClick={() => selectWorkspace(false)}><ArrowLeft size={14} aria-hidden="true" /> Explore fonts</button>
    </div>
  );
}

const StepButton = styled('button', {
  base: 'grid w-9 flex-none cursor-pointer place-items-center text-soft hover:text-fg disabled:cursor-default disabled:text-dim',
  defaultProps: { type: 'button' },
});

/**
 * The saved fonts on narrow screens: one row that scrolls sideways, so that
 * the specimen stays in view, with buttons for the font before and after.
 */
export function ShortlistStrip() {
  const strip = useRef<HTMLDivElement>(null);
  const list = savedFonts.value;
  const current = primary.value?.family;
  const i = list.findIndex((f) => f.family === current);
  useEffect(() => {
    strip.current?.querySelector('[aria-pressed="true"]')?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }, [current]);
  if (!list.length) return null;
  const step = (d: number) => { selection.value = list[i + d].family; };
  return (
    <div class="flex border-b border-line">
      <StepButton aria-label="Previous font" title="Previous font" disabled={i <= 0} onClick={() => step(-1)}><ChevronLeft size={20} aria-hidden="true" /></StepButton>
      <div ref={strip} class="flex min-w-0 flex-1 gap-1.5 overflow-x-auto px-2 py-2 [scrollbar-width:none] [mask-image:linear-gradient(to_right,transparent,black_12px,black_calc(100%-12px),transparent)]">
        {list.map((font) => {
          const selected = current === font.family;
          return (
            <Row key={font.family} as="button" type="button" selected={selected} class="flex-none cursor-pointer px-3 py-1.5 whitespace-nowrap" aria-pressed={selected} onClick={() => { selection.value = font.family; }}>
              <FamilyName font={font} class="text-[16px]/[1.3]" />
            </Row>
          );
        })}
      </div>
      <StepButton aria-label="Next font" title="Next font" disabled={i >= list.length - 1} onClick={() => step(1)}><ChevronRight size={20} aria-hidden="true" /></StepButton>
    </div>
  );
}
