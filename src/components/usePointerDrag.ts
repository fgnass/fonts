import type { RefObject } from 'preact';
import { useEffect, useRef } from 'preact/hooks';

/** Captures a slider drag and releases its listeners on every exit path, including unmount. */
export function usePointerDrag(el: RefObject<HTMLElement>, indicateDragging = false) {
  const endDrag = useRef<(() => void) | null>(null);
  useEffect(() => () => endDrag.current?.(), []);

  return (event: PointerEvent, onMove: (event: PointerEvent) => void) => {
    endDrag.current?.();
    const node = el.current!;
    try {
      node.setPointerCapture(event.pointerId);
    } catch {}
    if (indicateDragging) node.dataset.dragging = '';

    const move = (event: PointerEvent) => {
      // Release may happen outside the window without a pointerup reaching us.
      if (!(event.buttons & 1)) return stop();
      onMove(event);
    };
    const stop = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
      window.removeEventListener('blur', stop);
      node.removeEventListener('lostpointercapture', stop);
      if (indicateDragging) delete node.dataset.dragging;
      endDrag.current = null;
    };
    endDrag.current = stop;
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
    window.addEventListener('blur', stop);
    node.addEventListener('lostpointercapture', stop);
  };
}
