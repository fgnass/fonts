import { applyExclusion, cancelExclusion, dismissExclusion, exclusionMessage, exclusionPreview, lastExclusion, pendingExclusion, undoExclusion } from '../state';

export function FontFeedback() {
  const pending = pendingExclusion.value;
  if (pending) return (
    <section class="filter-feedback" aria-label={`Suggestions for ${pending.family}`} onKeyDown={(e) => { if (e.key === 'Escape') cancelExclusion(); }}>
      <h2>What should change?</h2>
      <p class="feedback-family">{pending.family}</p>
      {pending.options.length ? <>
        <div class="exclusion-options" role="group" aria-label="Suggested filter adjustments">
          {pending.options.map((plan) => (
            <button
              key={plan.slider.key}
              type="button"
              class="exclusion-option"
              onPointerEnter={() => { exclusionPreview.value = plan; }}
              onPointerLeave={(e) => { if (document.activeElement !== e.currentTarget) exclusionPreview.value = null; }}
              onFocus={() => { exclusionPreview.value = plan; }}
              onBlur={() => { exclusionPreview.value = null; }}
              onClick={() => applyExclusion(plan)}
              title="Hover or focus to preview the slider boundary; click to apply"
            >
              <span>{plan.label}</span><small>{plan.removed} fewer font{plan.removed === 1 ? '' : 's'}</small>
            </button>
          ))}
        </div>
        <p class="feedback-hint">Hover to preview. Click to apply.</p>
      </> : <p>No clear visual difference stands out enough to suggest a filter change.</p>}
      <p class="feedback-hint">Suggestions describe measured letter shapes. Shadows and 3D effects aren’t measured.</p>
      <div><button type="button" onClick={cancelExclusion}>Cancel</button></div>
    </section>
  );
  if (!exclusionMessage.value) return null;
  return (
    <div class="filter-feedback" role="status">
      <p>{exclusionMessage.value}</p>
      <div>
        {lastExclusion.value && <button type="button" onClick={undoExclusion}>Undo</button>}
        <button type="button" class="dismiss" aria-label="Dismiss filter adjustment" onClick={dismissExclusion}>×</button>
      </div>
    </div>
  );
}
