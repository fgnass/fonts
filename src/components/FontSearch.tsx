import { Search } from 'lucide-preact';
import { useState } from 'preact/hooks';
import { type Font, textFonts } from '../data';
import { openFont } from '../state';

const MAX = 8;

/** The fonts whose names contain the query: names that start with it first. */
function matching(query: string): Font[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const starts = (f: Font) => (f.family.toLowerCase().startsWith(q) ? 0 : 1);
  return textFonts
    .filter((f) => f.family.toLowerCase().includes(q))
    .sort((a, b) => starts(a) - starts(b) || a.family.localeCompare(b.family))
    .slice(0, MAX);
}

/** A field to find a font by its name; the chosen font opens in the font view. */
export function FontSearch() {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const matches = matching(query);
  const choose = (font: Font) => {
    setQuery('');
    openFont(font);
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (matches.length) setActive((i) => (i + (e.key === 'ArrowDown' ? 1 : matches.length - 1)) % matches.length);
    } else if (e.key === 'Enter' && matches[active]) {
      e.preventDefault();
      choose(matches[active]);
    } else if (e.key === 'Escape') setQuery('');
  };
  return (
    <div class="relative">
      <Search size={14} class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" aria-hidden="true" />
      <input
        type="search"
        class="h-9 w-full rounded-lg border border-line2 bg-tile pr-3 pl-8.5 text-[13px] text-fg placeholder:text-muted focus:border-accent focus:outline-none"
        placeholder="Find a font by name"
        aria-label="Find a font by name"
        role="combobox"
        aria-expanded={matches.length > 0}
        aria-controls="font-search-list"
        aria-activedescendant={matches[active] ? `font-search-${active}` : undefined}
        value={query}
        onInput={(e) => {
          setQuery(e.currentTarget.value);
          setActive(0);
        }}
        onKeyDown={onKeyDown}
        onBlur={() => setQuery('')}
      />
      {matches.length > 0 && (
        <ul id="font-search-list" role="listbox" class="absolute inset-x-0 top-full z-10 mt-1 overflow-hidden rounded-lg border border-line2 bg-panel py-1 shadow-lg">
          {matches.map((f, i) => (
            <li
              key={f.index}
              id={`font-search-${i}`}
              role="option"
              aria-selected={i === active}
              class={'cursor-pointer truncate px-3 py-1.5 text-[13px] ' + (i === active ? 'bg-line2 text-fg' : 'text-soft')}
              // Before the blur of the field, which closes the list.
              onMouseDown={(e) => {
                e.preventDefault();
                choose(f);
              }}
              onMouseEnter={() => setActive(i)}
            >
              {f.family}
              {f.libre && <span class="text-muted"> · {f.libre.foundry}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
