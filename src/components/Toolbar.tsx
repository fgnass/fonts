import { hasStyles } from '../data';
import { Slider } from './Slider';
import { DEFAULT_GROUP_COUNT, groupCount, previewSize, showShortlist } from '../state';
import { PreviewTextField } from './PreviewText';
import { Switch } from './ui';

/** Preview text (up to three lines), grouping and preview size. */
export function Toolbar() {
  const grouped = groupCount.value > 0;
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
    </div>
  );
}
