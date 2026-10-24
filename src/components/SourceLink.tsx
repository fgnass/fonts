import type { Font } from '../data';

export const linkClass = 'text-[13px] font-normal text-soft hover:text-fg';

interface Props {
  font: Pick<Font, 'family' | 'libre'>;
  class?: string;
}

/** Opens the family where it comes from: on Google Fonts, or on the page of its foundry. */
export function SourceLink({ font, class: className = linkClass }: Props) {
  const source = font.libre?.foundry ?? 'Google Fonts';
  const href = font.libre?.url ?? `https://fonts.google.com/specimen/${encodeURIComponent(font.family)}`;
  return (
    <a class={className} href={href} target="_blank" rel="noreferrer" title={`Open ${font.family} on ${font.libre ? `the site of ${source}` : source}`}>
      {source} <span aria-hidden="true">↗</span>
    </a>
  );
}
