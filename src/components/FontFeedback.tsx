import { styled } from 'classname-variants/preact';
import type { ExclusionPlan } from '../filter';
import { applyExclusion, cancelExclusion, dismissExclusion, exclusionMessage, exclusionPreview, lastExclusion, pendingExclusion, undoExclusion } from '../state';
import { plural } from './ui';

const Box = styled('div', 'mx-4.5 mt-3 mb-1 flex-none rounded-lg border border-accent bg-tile p-3');

const Text = styled('p', {
  variants: { hint: { true: 'mt-2.5 text-[11px]/[1.5] text-muted', false: 'text-[12px]/[1.5]' } },
});

const Button = styled('button', {
  base: 'cursor-pointer',
  variants: {
    kind: {
      plain: 'rounded-sm border border-line2 bg-panel px-2 py-0.75',
      option: 'flex w-full items-center justify-between gap-2 rounded-sm border border-line2 bg-panel px-2 py-2.25 text-left hover:border-accent focus-visible:border-accent',
      quiet: 'px-2 py-0.75 text-muted',
    },
  },
  defaultVariants: { kind: 'plain' },
  defaultProps: { type: 'button' },
});

const Actions = styled('div', 'mt-2 flex items-center justify-between');

/** A suggested filter change; hover or focus previews it on its slider. */
function Suggestion({ plan }: { plan: ExclusionPlan }) {
  return (
    <Button
      kind="option"
      onPointerEnter={() => { exclusionPreview.value = plan; }}
      onPointerLeave={(e: PointerEvent) => { if (document.activeElement !== e.currentTarget) exclusionPreview.value = null; }}
      onFocus={() => { exclusionPreview.value = plan; }}
      onBlur={() => { exclusionPreview.value = null; }}
      onClick={() => applyExclusion(plan)}
      title="Hover or focus to preview the slider boundary; click to apply"
    >
      <span>{plan.label}</span>
      <small class="flex-none text-[10px] text-muted">{plan.removed} fewer {plural(plan.removed, 'font')}</small>
    </Button>
  );
}

/** The filter changes that would exclude a disliked font. */
function Suggestions({ family, options }: { family: string; options: ExclusionPlan[] }) {
  return (
    <Box as="section" aria-label={`Suggestions for ${family}`} onKeyDown={(e: KeyboardEvent) => { if (e.key === 'Escape') cancelExclusion(); }}>
      <h2 class="mb-1 text-[13px] font-medium">What should change?</h2>
      <Text class="mb-2.5 text-soft">{family}</Text>
      {options.length ? <>
        <div class="grid gap-1.5" role="group" aria-label="Suggested filter adjustments">
          {options.map((plan) => <Suggestion key={plan.slider.key} plan={plan} />)}
        </div>
        <Text hint>Hover to preview. Click to apply.</Text>
      </> : <Text>No clear visual difference stands out enough to suggest a filter change.</Text>}
      <Text hint>Suggestions describe measured letter shapes. Shadows and 3D effects aren’t measured.</Text>
      <Actions><Button onClick={cancelExclusion}>Cancel</Button></Actions>
    </Box>
  );
}

/** What the last applied exclusion changed, with an undo. */
function ExclusionStatus({ message }: { message: string }) {
  return (
    <Box role="status">
      <Text>{message}</Text>
      <Actions>
        {lastExclusion.value && <Button onClick={undoExclusion}>Undo</Button>}
        <Button kind="quiet" aria-label="Dismiss filter adjustment" onClick={dismissExclusion}>×</Button>
      </Actions>
    </Box>
  );
}

/** Feedback on a disliked font: the suggestions while one is pending, then the result. */
export function FontFeedback() {
  const pending = pendingExclusion.value;
  if (pending) return <Suggestions family={pending.family} options={pending.options} />;
  if (exclusionMessage.value) return <ExclusionStatus message={exclusionMessage.value} />;
  return null;
}
