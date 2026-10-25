import { Copy, Download } from 'lucide-preact';
import type { Font } from '../../data';
import { axisValues, specimenStyle } from '../../shortlist-state';
import { useFlash } from '../useFlash';

/** The line height of the exported text, as in the Sizes section. */
const LINE_HEIGHT = 1.15;

type State = 'idle' | 'busy' | 'copied' | 'saved' | 'failed';

const LABELS: Record<State, string> = { idle: '', busy: 'Preparing…', copied: 'Copied', saved: 'Saved', failed: 'Failed' };

const buttonClass = 'inline-flex cursor-pointer items-center gap-1.25 text-[11px] font-medium text-muted hover:text-fg disabled:cursor-default disabled:hover:text-muted';

/** A file name for the SVG: the family and the first words of the text. */
const fileName = (font: Font, lines: string[]) => `${font.family} ${lines.join(' ')}`.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 60) + '.svg';

/**
 * Two buttons that turn the preview text into SVG paths in the font and the
 * style of the specimen, with its axis values: to the clipboard, or as a
 * file. The code that shapes the text loads on the first click.
 */
export function SvgExport({ font, lines, size }: { font: Font; lines: string[]; size: number }) {
  const [state, setState] = useFlash<'copied' | 'saved' | 'failed'>();

  const make = async () => {
    const { textToSvg } = await import('../../svg-export');
    const style = specimenStyle(font);
    const svg = await textToSvg(font, style, lines, { size, lineHeight: LINE_HEIGHT, axes: axisValues(font, style) });
    if (!svg) throw new Error('nothing to draw');
    return svg;
  };

  const run = (deliver: (svg: string) => Promise<void> | void, done: State) => async () => {
    setState('busy');
    try {
      await deliver(await make());
      setState(done);
    } catch (e) {
      console.error('SVG export failed', e);
      setState('failed');
    }
  };

  const copy = run((svg) => navigator.clipboard.writeText(svg), 'copied');
  const download = run((svg) => {
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName(font, lines);
    a.click();
    URL.revokeObjectURL(url);
  }, 'saved');

  const license = font.libre ? `Its license (${font.libre.license}) applies.` : 'Its license applies.';
  const busy = state === 'busy';
  return (
    <div class="flex items-center gap-4" aria-live="polite">
      {state !== 'idle' && <span class={'text-[11px] ' + (state === 'failed' ? 'text-accent' : 'text-muted')}>{LABELS[state]}</span>}
      <button type="button" class={buttonClass} disabled={busy} title={`Copy the text as SVG paths in this font, e.g. for a logo. ${license}`} onClick={copy}>
        <Copy size={12} aria-hidden="true" /> Copy SVG
      </button>
      <button type="button" class={buttonClass} disabled={busy} title={`Download the text as an SVG file with paths in this font, e.g. for a logo. ${license}`} onClick={download}>
        <Download size={12} aria-hidden="true" /> Download SVG
      </button>
    </div>
  );
}
