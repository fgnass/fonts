import type { ComponentChildren } from 'preact';
import type { Font } from '../data';

/** Opens the family on Google Fonts. */
export function GoogleFontsLink({ font, class: className = 'gf-link', children = 'View on Google Fonts' }: { font: Pick<Font, 'family'>; class?: string; children?: ComponentChildren }) {
  return (
    <a class={className} href={`https://fonts.google.com/specimen/${encodeURIComponent(font.family)}`} target="_blank" rel="noreferrer" title={`Open ${font.family} on Google Fonts`}>
      {children} <span aria-hidden="true">↗</span>
    </a>
  );
}
