import { useEffect } from 'preact/hooks';
import { inspectedFont, type Item } from '../../state';

/**
 * Makes the item the inspected font (its values show on the Look sliders)
 * while the pointer or the focus is on the card. Returns the event handlers for the card.
 */
export function useInspection(item: Item) {
  const clear = () => { if (inspectedFont.peek()?.index === item.index) inspectedFont.value = null; };
  useEffect(() => clear, [item.index]);
  // While the pointer stays on the card, Look must follow the style the card shows now (for example after a slider move).
  useEffect(() => { if (inspectedFont.peek()?.index === item.index) inspectedFont.value = item; }, [item]);
  const inspect = () => { inspectedFont.value = item; };
  return {
    onPointerEnter: inspect,
    onFocusIn: inspect,
    onPointerLeave: (e: PointerEvent) => { if (!(e.currentTarget as HTMLElement).contains(document.activeElement)) clear(); },
    onFocusOut: (e: FocusEvent) => {
      const card = e.currentTarget as HTMLElement;
      if (!card.contains(e.relatedTarget as Node | null) && !card.matches(':hover')) clear();
    },
  };
}
