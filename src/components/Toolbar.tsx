import { hasStyles } from '../data';
import { Slider } from './Slider';
import { DEFAULT_GROUP_COUNT, groupCount, previewSize, showShortlist } from '../state';
import { PreviewTextField } from './PreviewText';

/** Preview text (up to three lines), grouping and preview size. */
export function Toolbar() {
  const grouped = groupCount.value > 0;
  return (
    <div class="toolbar">
      <PreviewTextField id="text" />
      {!showShortlist.value && (
        <label class="switch" title="Show one font per group of similar-looking fonts">
          <input type="checkbox" checked={grouped} disabled={!hasStyles} onChange={(e) => (groupCount.value = e.currentTarget.checked ? DEFAULT_GROUP_COUNT : 0)} />
          <span class="knob" />
          Hide look-alikes
        </label>
      )}
      <div class="size" title="Preview size">
        <span class="a" style={{ fontSize: 10 }} aria-hidden="true">A</span>
        <Slider label="Preview size" min={20} max={120} value={previewSize.value} onChange={(v) => (previewSize.value = v)} />
        <span class="a" style={{ fontSize: 17 }} aria-hidden="true">A</span>
      </div>
    </div>
  );
}
