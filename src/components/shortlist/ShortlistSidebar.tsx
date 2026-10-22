import { ArrowLeft, Star } from 'lucide-preact';
import { styled } from 'classname-variants/preact';
import { displayedStyle, type Font } from '../../data';
import { primary, savedFonts, secondary, selection } from '../../shortlist-state';
import { selectWorkspace, toggleShortlist } from '../../state';
import { useLoadedFont } from '../useLoadedFont';

const Row = styled('div', {
  base: 'flex items-center rounded-lg border',
  variants: { selected: { true: 'border-accent bg-tile', false: 'border-line' } },
});

/** The name of a family, set in the family itself once its font has loaded. */
function FamilyName({ font }: { font: Font }) {
  const alias = useLoadedFont(font, displayedStyle(font), font.family);
  // The name in its own font; it switches without a jump once the font is there.
  return <span class="block text-[18px]/[1.3] text-bright transition-opacity" style={alias ? { fontFamily: `'${alias}'` } : undefined}>{font.family}</span>;
}

/** What the font is used for in the specimen, or else how many styles it has. */
function roleLabel(font: Font) {
  if (primary.value?.family === font.family) return 'Heading';
  if (secondary.value?.family === font.family) return 'Body text';
  return `${font.variants.length} styles`;
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
              <button type="button" class="cursor-pointer p-2.5 text-accent" aria-label={`Remove ${font.family} from shortlist`} title="Remove from shortlist" onClick={() => toggleShortlist(font.family)}><Star size={18} fill="currentColor" aria-hidden="true" /></button>
            </Row>
          );
        })}
      </div>
      {!savedFonts.value.length && <p class="text-[12px] text-muted">Star fonts in Explore to collect them here.</p>}
      <button type="button" class="mt-auto inline-flex cursor-pointer items-center gap-1.5 pt-3 text-left text-soft narrow:hidden" onClick={() => selectWorkspace(false)}><ArrowLeft size={14} aria-hidden="true" /> Explore fonts</button>
    </div>
  );
}
