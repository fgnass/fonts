import { useLayoutEffect, useRef } from 'preact/hooks';

interface Props {
  tag: 'h2' | 'p';
  value: string;
  onChange: (text: string) => void;
  placeholder: string;
  class: string;
  style?: Record<string, string | undefined>;
  'aria-label': string;
}

/**
 * Text that is edited in place. The element keeps its own content after the
 * first render, so that typing does not move the caret; the signal follows.
 */
export function Editable({ tag: Tag, value, onChange, placeholder, class: className, ...rest }: Props) {
  const el = useRef<HTMLElement>(null);
  useLayoutEffect(() => { if (el.current) el.current.innerText = value; }, []);
  return (
    <Tag
      ref={el as any}
      class={'rounded-sm font-normal wrap-anywhere whitespace-pre-wrap caret-accent outline-1 outline-offset-10 outline-transparent outline-dashed transition-[outline-color] empty:before:text-dim empty:before:content-[attr(data-placeholder)] hover:outline-line2 focus:outline-muted ' + className}
      {...rest}
      contentEditable="plaintext-only"
      spellcheck={false}
      data-placeholder={placeholder}
      onInput={(e: Event) => onChange((e.currentTarget as HTMLElement).innerText)}
    />
  );
}
