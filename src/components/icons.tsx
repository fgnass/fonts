const stroke = { fill: 'none', stroke: 'currentColor', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' } as const;

/** A circular arrow, for resetting. */
export const ResetIcon = () => (
  <svg {...stroke} width="12" height="12" viewBox="0 0 12 12" stroke-width="1.4">
    <path d="M2.2 6a3.8 3.8 0 1 0 1.1-2.7" />
    <path d="M2 1.8v2.4h2.4" />
  </svg>
);

/** A chevron that points down, for an accordion heading. */
export const ChevronIcon = ({ class: className }: { class?: string }) => (
  <svg {...stroke} class={className} width="14" height="14" viewBox="0 0 14 14" stroke-width="1.6">
    <path d="M3 5l4 4 4-4" />
  </svg>
);

/** A thumb down. */
export const DislikeIcon = () => (
  <svg {...stroke} width="15" height="15" viewBox="0 0 24 24" stroke-width="1.6">
    <path d="M17 3h4v11h-4zM17 13l-5 8h-1a2 2 0 0 1-2-2l1-5H5a2 2 0 0 1-2-2l1-7a2 2 0 0 1 2-2h11" />
  </svg>
);
