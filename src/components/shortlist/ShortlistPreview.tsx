import { Pencil } from 'lucide-preact';
import type { Font } from '../../data';
import { variationSettings } from '../../fontload';
import { body, bodyLeading, bodySize, heading, headingLeading, headingSize, primary, type Role, secondary, fontView, styleFor } from '../../shortlist-state';
import { selectWorkspace, showShortlist } from '../../state';
import { useLoadedFont } from '../useLoadedFont';
import { Editable } from './Editable';
import { Specimen } from './Specimen';
import { TypeControls } from './TypeControls';

/** The font of a role in the specimen, loaded only while the shortlist shows. */
function useSpecimenFont(role: Role, font: Font | undefined, text: string) {
  const style = font ? styleFor(role, font) : undefined;
  const alias = useLoadedFont(font, style, text, { delay: 180, enabled: showShortlist.value && fontView.value === 'pairing' });
  return { fontFamily: alias ? `'${alias}'` : undefined, fontVariationSettings: style ? variationSettings(style) : undefined };
}

/** The selected font on its own, or the pairing: type controls above an editable heading and body text. */
export function ShortlistPreview() {
  const font = primary.value, paired = secondary.value;
  const text = heading.value + '\n' + body.value;
  const headingStyle = useSpecimenFont('heading', font, text);
  const bodyStyle = useSpecimenFont('body', paired ?? font, text);
  if (!font) return (
    <div class="px-6 py-20 text-center">
      <h2 class="text-[20px] font-medium">Your shortlist is empty</h2>
      <p class="my-[1em] text-muted">Star fonts while exploring to compare them here.</p>
      <button type="button" class="mt-3 cursor-pointer rounded-lg border border-line2 bg-panel px-3.5 py-2.25 text-fg hover:border-accent" onClick={() => selectWorkspace(false)}>Explore fonts</button>
    </div>
  );
  if (fontView.value === 'specimen') return <Specimen font={font} />;
  return (
    <>
      <TypeControls font={font} paired={paired} />
      <article class="mx-auto max-w-[960px] px-10 pt-14 pb-20 narrow:px-4 narrow:pt-7 narrow:pb-12" aria-label="Specimen">
        <p class="mb-6 flex items-center gap-1.5 text-[12px] text-accent"><Pencil size={12} aria-hidden="true" /> Click the heading or the text to edit it.</p>
        <Editable
          tag="h2"
          class="mb-[0.6em] text-bright"
          aria-label="Specimen heading"
          placeholder="Type a heading"
          value={heading.value}
          onChange={(t) => { heading.value = t; }}
          style={{ ...headingStyle, fontSize: `${headingSize.value}px`, lineHeight: `${headingLeading.value}` }}
        />
        <Editable
          tag="p"
          class="text-fg"
          aria-label="Specimen body text"
          placeholder="Type some body text"
          value={body.value}
          onChange={(t) => { body.value = t; }}
          style={{ ...bodyStyle, fontSize: `${bodySize.value}px`, lineHeight: `${bodyLeading.value}` }}
        />
      </article>
    </>
  );
}
