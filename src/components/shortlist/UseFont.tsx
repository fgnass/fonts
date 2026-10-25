import { Check, Copy, Download, ExternalLink } from 'lucide-preact';
import { cssSnippet, downloadLink, type Usage } from '../../css-snippet';
import { Eyebrow } from '../ui';
import { useFlash } from '../useFlash';
import { Section } from './Section';

const linkClass = 'inline-flex cursor-pointer items-center gap-1.5 text-[13px] text-accent hover:text-bright';

/** The files of each family in use: the ZIP of Google Fonts, or the page of the foundry. */
function Downloads({ usages }: { usages: Usage[] }) {
  const fonts = [...new Map(usages.map((u) => [u.font.family, u.font])).values()];
  return (
    <div class="flex flex-wrap gap-x-8 gap-y-2">
      {fonts.map((font) => {
        const { href, label, title } = downloadLink(font);
        return (
          <a key={font.family} class={linkClass} href={href} target="_blank" rel="noopener" title={title}>
            {font.libre ? <ExternalLink size={14} aria-hidden="true" /> : <Download size={14} aria-hidden="true" />}
            {label}
          </a>
        );
      })}
    </div>
  );
}

/** The CSS snippet in a code block, with a button that copies it. */
function Snippet({ css }: { css: string }) {
  const [state, setState] = useFlash<'copied' | 'failed'>();
  const copy = () => navigator.clipboard.writeText(css).then(() => setState('copied'), () => setState('failed'));
  return (
    <div class="relative">
      <pre class="overflow-x-auto rounded-lg border border-line bg-panel px-4 py-3.5 pr-28 font-mono text-[12px]/[1.6] text-soft">{css}</pre>
      <button
        type="button"
        class="absolute top-2.5 right-2.5 inline-flex h-6 cursor-pointer items-center gap-1.25 rounded-md border border-line2 bg-base px-2 text-[11px] font-medium text-muted hover:border-muted hover:text-fg"
        title="Copy the CSS to the clipboard"
        onClick={copy}
        aria-live="polite"
      >
        {state === 'copied' ? <Check size={12} aria-hidden="true" /> : <Copy size={12} aria-hidden="true" />}
        {state === 'copied' ? 'Copied' : state === 'failed' ? 'Failed' : 'Copy CSS'}
      </button>
    </div>
  );
}

/**
 * How to use the fonts on a website: where to get their files, and the CSS
 * that loads them and sets them as shown (see cssSnippet).
 */
export function UseFont({ title, usages, class: className }: { title: string; usages: Usage[]; class?: string }) {
  return (
    <Section aria-label={title} class={className}>
      <Eyebrow>{title}</Eyebrow>
      <Downloads usages={usages} />
      <Snippet css={cssSnippet(usages)} />
    </Section>
  );
}
