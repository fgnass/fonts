import { useLayoutEffect, useRef } from 'preact/hooks';
import { DEFAULT_TEXT, MAX_LINES, text } from '../state';

/** Keeps the text to MAX_LINES lines. */
const limitLines = (value: string) => value.split('\n').slice(0, MAX_LINES).join('\n');

/** The preview text: a field that grows with its lines, up to MAX_LINES. */
export function PreviewTextField({ id, autofocus, class: className }: { id?: string; autofocus?: boolean; class?: string }) {
  const field = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = field.current;
    if (!el) return;
    el.style.height = '';
    if (el.value) el.style.height = `${el.scrollHeight}px`;
  }, [text.value]);
  return (
    <textarea
      id={id}
      class={'h-10 min-w-0 resize-none overflow-hidden rounded-lg border border-line2 bg-tile px-3.5 py-1.75 text-[18px]/6 font-medium whitespace-pre placeholder:text-muted focus:border-accent focus:outline-none ' + (className ?? '')}
      ref={field}
      rows={1}
      autofocus={autofocus}
      placeholder="Up to three lines…"
      title={`Shown when empty: ${DEFAULT_TEXT.replace(/\n/g, ' · ')}`}
      aria-label="Text to preview, up to three lines"
      autocomplete="off"
      spellcheck={false}
      value={text.value}
      onKeyDown={(e) => {
        // A fourth line is not shown: keep Enter from adding one.
        if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey && e.currentTarget.value.split('\n').length >= MAX_LINES) e.preventDefault();
      }}
      onInput={(e) => (text.value = limitLines(e.currentTarget.value))}
    />
  );
}
