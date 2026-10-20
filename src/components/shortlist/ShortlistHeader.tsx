import { styled } from 'classname-variants/preact';
import { primary, secondary } from '../../shortlist-state';
import { GoogleFontsLink, linkClass } from '../GoogleFontsLink';

/** The header of the right pane in the shortlist view, on the line of the tabs. */
const PaneTitle = styled('div', 'flex min-h-[65px] items-center gap-4.5 border-b border-line px-6 text-[13px] font-medium');

/** The header of the specimen pane: the fonts in use and their Google Fonts pages. */
export function ShortlistHeader() {
  const font = primary.value, paired = secondary.value;
  if (!font) return <PaneTitle as="h1">Pairing</PaneTitle>;
  return (
    <PaneTitle>
      <h1 class="text-[15px] font-medium">{font.family}{paired && <span class="font-normal text-muted"> + {paired.family}</span>}</h1>
      <GoogleFontsLink font={font} class={'ml-auto ' + linkClass} />
    </PaneTitle>
  );
}
