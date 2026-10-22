import { useEffect, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { styled } from 'classname-variants/preact';
import { RotateCcw } from 'lucide-preact';

/** A small label in capitals above or beside a group of controls. */
export const Eyebrow = styled('span', 'font-mono text-[11px]/[1.4] tracking-[0.08em] text-muted uppercase');

/** The word in singular or plural form, for a count of n. */
export const plural = (n: number, word: string) => (n === 1 ? word : `${word}s`);

interface SwitchProps {
  checked: boolean;
  disabled?: boolean;
  title?: string;
  onChange: (checked: boolean) => void;
  children: ComponentChildren;
}

/** A switch: a checkbox drawn as a knob in a pill. */
export function Switch({ checked, disabled, title, onChange, children }: SwitchProps) {
  return (
    <label class="flex cursor-pointer items-center gap-2 whitespace-nowrap text-soft" title={title}>
      <input type="checkbox" class="peer absolute size-px opacity-0" checked={checked} disabled={disabled} onChange={(e) => onChange(e.currentTarget.checked)} />
      <span class="relative h-4.5 w-7.5 rounded-[9px] bg-line2 transition-colors peer-checked:bg-accent peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent peer-disabled:opacity-40 after:absolute after:top-0.5 after:left-0.5 after:size-3.5 after:rounded-full after:bg-base after:transition-[left] peer-checked:after:left-3.5" />
      {children}
    </label>
  );
}

/** A button that puts every slider of a group back to "any" (shown in the heading of the group). */
export function ResetButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      class="absolute top-1/2 right-6.5 inline-flex h-6 -translate-y-1/2 cursor-pointer items-center gap-1.25 rounded-md px-1.75 text-[11px] font-medium text-muted hover:bg-line hover:text-fg"
      type="button"
      title="Set all sliders of this group back to any"
      onClick={onClick}
    >
      <RotateCcw size={12} aria-hidden="true" />
      Reset
    </button>
  );
}

/** The message while it is new: it shows for a few seconds, then gives way. */
export function useFresh(message: string | null, ms = 4000) {
  const [fresh, setFresh] = useState<string | null>(null);
  useEffect(() => {
    setFresh(message);
    if (!message) return;
    const timer = setTimeout(() => setFresh(null), ms);
    return () => clearTimeout(timer);
  }, [message]);
  return fresh;
}
