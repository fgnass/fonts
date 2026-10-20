import { variants } from 'classname-variants';
import { styled } from 'classname-variants/preact';

/** The preview dims while the hover controls show. */
export const dimOnHover = 'group-hover/card:opacity-15 group-focus-within/card:opacity-15';

/** Shows on hover or focus, and at all times on devices without hover. */
export const showOnHover = 'transition-opacity duration-100 group-hover/card:opacity-100 group-focus-within/card:opacity-100 touch:opacity-100';

/** The small buttons on a card; the link to Google Fonts looks like one too. */
const chipConfig = {
  base: 'h-6 flex-none cursor-pointer rounded-md border border-line2 bg-panel px-2 leading-[22px] text-soft hover:border-accent hover:text-accent',
  variants: {
    kind: {
      similar: 'mr-auto',
      dislike: 'inline-flex items-center justify-center',
      // The star of a shortlisted font shows at all times.
      star: 'absolute top-3 right-2.5 text-[17px] opacity-0 aria-pressed:text-accent aria-pressed:opacity-100 ' + showOnHover,
    },
  },
};

export const chip = variants(chipConfig);
export const Chip = styled('button', { ...chipConfig, defaultProps: { type: 'button' } });
