import { Undo2, X } from 'lucide-preact';
import { TOOLBAR_SLIDERS } from '../sliders';
import { Slider } from './Slider';
import { ChoiceRow } from './SliderList';
import { canUndo, exclusionMessage, previewSize, showShortlist, similarTo, undoFilters } from '../state';
import { PreviewTextField } from './PreviewText';
import { useFresh } from './ui';

/** Preview text (up to three lines), the font the results are ranked by, the source of the fonts, preview size and the undo of filter changes (narrow screens have it in the top bar). */
export function Toolbar() {
  const message = useFresh(exclusionMessage.value);
  return (
    <div class="flex flex-wrap items-center gap-4 border-b border-line bg-base px-6 py-3">
      <PreviewTextField id="text" class="flex-[1_1_240px]" />
      {!showShortlist.value && similarTo.value && (
        <span class="inline-flex h-8 flex-none items-center gap-1 rounded-lg border border-accent pr-1 pl-3 text-[13px] text-fg">
          Similar to {similarTo.value.family}
          <button type="button" class="grid size-6 cursor-pointer place-items-center rounded-md text-muted hover:text-fg" aria-label="Show all fonts in the usual order" title="Show all fonts in the usual order" onClick={() => (similarTo.value = null)}>
            <X size={14} aria-hidden="true" />
          </button>
        </span>
      )}
      {!showShortlist.value && TOOLBAR_SLIDERS.map((s) => <ChoiceRow key={s.key} slider={s} compact />)}
      <div class="flex items-end gap-1.5" title="Preview size">
        <span class="pb-px text-[10px]/none text-muted" aria-hidden="true">A</span>
        <Slider class="w-30" label="Preview size" min={20} max={120} value={previewSize.value} onChange={(v) => (previewSize.value = v)} />
        <span class="pb-px text-[17px]/none text-muted" aria-hidden="true">A</span>
      </div>
      {!showShortlist.value && (
        <div class="flex items-center gap-2 narrow:hidden">
          {message && <span class="max-w-60 truncate text-[12px] text-accent" role="status">{message}</span>}
          <button
            type="button"
            class="-mx-1.5 grid size-8 cursor-pointer place-items-center rounded-md text-muted hover:text-fg disabled:cursor-default disabled:text-dim"
            disabled={!canUndo.value}
            aria-label="Undo the last filter change"
            title="Undo the last filter change"
            onClick={undoFilters}
          >
            <Undo2 size={18} aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}
