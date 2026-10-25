import type { Font } from '../../data';
import { axisSettings, fontView, gridSize, listedFonts, selection, specimenStyle } from '../../shortlist-state';
import { previewLines, showShortlist } from '../../state';
import { PreviewTextField } from '../PreviewText';
import { Slider } from '../Slider';
import { Eyebrow } from '../ui';
import { useLoadedFont } from '../useLoadedFont';
import { ShortlistButton } from './ShortlistButton';

/** The range of the size slider, in px. */
const SIZE_RANGE: [number, number] = [16, 96];

/** The size of the preview text: a label, the slider and the value. */
function SizeSlider() {
  return (
    <div class="flex items-center gap-3">
      <Slider class="flex-1" label="Preview size" min={SIZE_RANGE[0]} max={SIZE_RANGE[1]} value={gridSize.value} onChange={(v) => { gridSize.value = v; }} />
      <span class="w-10 text-right font-mono text-[11px] text-soft tabular-nums">{gridSize.value} px</span>
    </div>
  );
}

/** The text and the size of the preview in the grid, in the sidebar on wide screens. */
export function GridControls() {
  return (
    <div class="flex flex-col gap-5 pt-1">
      <label class="flex flex-col gap-2">
        <Eyebrow>Preview text</Eyebrow>
        <PreviewTextField />
      </label>
      <div class="flex flex-col gap-2">
        <Eyebrow>Size</Eyebrow>
        <SizeSlider />
      </div>
    </div>
  );
}

/**
 * One saved font with the preview text in its specimen style; a click opens
 * its specimen. Text that does not fit is clipped, but glyphs that reach
 * beyond their advance still show in the padding (see Specimen).
 */
function Tile({ font, lines }: { font: Font; lines: string[] }) {
  const style = specimenStyle(font);
  const alias = useLoadedFont(font, style, lines.join(''), { delay: 120, enabled: showShortlist.value && fontView.value === 'grid', allAxes: true });
  return (
    <div class="group relative flex rounded-lg border border-line hover:border-line2">
      <button
        type="button"
        class="flex min-w-0 flex-1 cursor-pointer flex-col gap-3 overflow-x-clip p-4 text-left"
        title="Open the specimen of this font"
        onClick={() => { selection.value = font.family; fontView.value = 'specimen'; }}
      >
        <span class="mr-8 truncate font-mono text-[11px] text-muted">{font.family} · {style.weight}{style.italic ? ' italic' : ''}</span>
        <div
          class="leading-[1.15] whitespace-pre text-bright"
          style={{ fontFamily: alias ? `'${alias}'` : undefined, fontVariationSettings: axisSettings(font, style), fontSize: `${gridSize.value}px` }}
        >
          {lines.join('\n')}
        </div>
      </button>
      <ShortlistButton font={font} size={16} class="absolute top-2 right-2 p-2" reveal />
    </div>
  );
}

/**
 * The overview of the shortlist: all saved fonts side by side, each with the
 * preview text at one size. On narrow screens, the text and the size come
 * first; on wide screens, they are in the sidebar.
 */
export function Grid() {
  const lines = previewLines.value;
  return (
    <div class="flex flex-col">
      <div class="hidden flex-col gap-3 border-b border-line px-3 py-3 narrow:flex">
        <PreviewTextField />
        <div class="flex items-center gap-3">
          <span class="font-cond text-[12px] text-muted">Size</span>
          <div class="flex-1"><SizeSlider /></div>
        </div>
      </div>
      <div class="grid grid-cols-[repeat(auto-fill,minmax(min(320px,100%),1fr))] gap-3 px-6 py-6 narrow:px-3 narrow:py-3" aria-label="Saved fonts">
        {listedFonts.value.map((font) => <Tile key={font.family} font={font} lines={lines} />)}
      </div>
    </div>
  );
}
