import { Undo2 } from 'lucide-preact';
import { hasStyles } from '../data';
import { Slider } from './Slider';
import { canUndo, DEFAULT_GROUP_COUNT, exclusionMessage, groupCount, previewSize, showShortlist, undoFilters } from '../state';
import { PreviewTextField } from './PreviewText';
import { Switch, useFresh } from './ui';

/** Preview text (up to three lines), grouping, preview size and the undo of filter changes (narrow screens have it in the top bar). */
export function Toolbar() {
  const grouped = groupCount.value > 0;
  const message = useFresh(exclusionMessage.value);
  return (
    <div class="flex flex-wrap items-center gap-4 border-b border-line bg-base px-6 py-3">
      <PreviewTextField id="text" class="flex-[1_1_240px]" />
      {!showShortlist.value && (
        <Switch title="Show one font per group of similar-looking fonts" checked={grouped} disabled={!hasStyles} onChange={(on) => (groupCount.value = on ? DEFAULT_GROUP_COUNT : 0)}>
          Hide look-alikes
        </Switch>
      )}
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
