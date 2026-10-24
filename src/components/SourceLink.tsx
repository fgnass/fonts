import type { ComponentChildren } from 'preact';
import type { Font } from '../data';

export const linkClass = 'text-[13px] font-normal text-soft hover:text-fg';

interface Props {
  font: Pick<Font, 'family'>;
  class?: string;
  children?: ComponentChildren;
}

/** Opens the family on Google Fonts. */
export function GoogleFontsLink({ font, class: className = linkClass, children = 'View on Google Fonts' }: Props) {
  return (
    <a class={className} href={`https://fonts.google.com/specimen/${encodeURIComponent(font.family)}`} target="_blank" rel="noreferrer" title={`Open ${font.family} on Google Fonts`}>
      {children} <span aria-hidden="true">↗</span>
    </a>
  );
}
