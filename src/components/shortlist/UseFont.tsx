import { Download, ExternalLink, Check, Copy } from 'lucide-preact';
import { cssSnippet, downloadLink, type Hosting, type Usage } from '../../css-snippet';
import { hosting } from '../../shortlist-state';
import { Eyebrow } from '../ui';
import { useFlash } from '../useFlash';
import { Section } from './Section';

const linkClass = 'inline-flex cursor-pointer items-center gap-1.5 text-[13px] text-accent hover:text-bright disabled:cursor-default disabled:text-muted';

const MODES: { id: Hosting; label: string; title: string }[] = [
  { id: 'self', label: 'Self-hosted', title: 'Files of your own: WOFF2 files and fonts.css, in one download' },
  { id: 'google', label: 'Google Fonts', title: 'Loaded from the Google Fonts API' },
];

/** The switch between files of one's own and the Google Fonts API. */
function HostingSwitch() {
  return (
    <div class="inline-flex rounded-md border border-line2 p-0.5" role="radiogroup" aria-label="Hosting">
      {MODES.map((m) => {
        const on = hosting.value === m.id;
        return (
          <button key={m.id} type="button" role="radio" aria-checked={on} title={m.title} class={'cursor-pointer rounded-[5px] px-2 py-0.5 text-[11px] font-medium ' + (on ? 'bg-line2 text-fg' : 'text-muted hover:text-fg')} onClick={() => { hosting.value = m.id; }}>
            {m.label}
          </button>
        );
      })}
    </div>
  );
}

/** The download of the WOFF2 files and fonts.css for the Google families in use. */
function KitDownload({ usages }: { usages: Usage[] }) {
  const [state, setState] = useFlash<'saved' | 'failed'>();
  const download = async () => {
    setState('busy');
    try {
      const { downloadWebfontKit } = await import('../../webfont-kit');
      await downloadWebfontKit(usages);
      setState('saved');
    } catch (e) {
      console.error('Web font download failed', e);
      setState('failed');
    }
  };
  const families = [...new Set(usages.map((u) => u.font.family))];
  return (
    <button type="button" class={linkClass} disabled={state === 'busy'} title={`A ZIP with the WOFF2 files of ${families.join(' and ')} (one per subset) and fonts.css`} onClick={download}>
      <Download size={14} aria-hidden="true" />
      {state === 'busy' ? 'Preparing…' : state === 'saved' ? 'Saved' : state === 'failed' ? 'Failed, try again' : `Download web fonts${families.length > 1 ? '' : ` of ${families[0]}`}`}
    </button>
  );
}

/** Where to get the files: the download for Google families (self-hosted) or their TTFs, and the page of each foundry. */
function Downloads({ usages }: { usages: Usage[] }) {
  const fonts = [...new Map(usages.map((u) => [u.font.family, u.font])).values()];
  const google = usages.filter((u) => !u.font.libre);
  return (
    <div class="flex flex-wrap items-center gap-x-8 gap-y-2">
      {google.length > 0 && hosting.value === 'self' && <KitDownload usages={google} />}
      {fonts.filter((f) => f.libre || hosting.value === 'google').map((font) => {
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
 * How to use the fonts on a website: self-hosted (a download with the WOFF2
 * files and fonts.css) or from the Google Fonts API, and the CSS that loads
 * them and sets them as shown (see cssSnippet).
 */
export function UseFont({ title, usages, class: className }: { title: string; usages: Usage[]; class?: string }) {
  return (
    <Section aria-label={title} class={className}>
      <div class="flex flex-wrap items-center justify-between gap-3">
        <Eyebrow>{title}</Eyebrow>
        {usages.some((u) => !u.font.libre) && <HostingSwitch />}
      </div>
      <Downloads usages={usages} />
      <Snippet css={cssSnippet(usages, hosting.value)} />
    </Section>
  );
}
