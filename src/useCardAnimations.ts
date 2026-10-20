import { stepSpring } from './spring';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';

interface Position {
  node: HTMLElement;
  x: number;
  y: number;
  width: number;
  height: number;
  size: string;
}

interface Motion {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

/** Animate card movement and entry/exit directly, without capturing any page or toolbar snapshots. */
export function useCardAnimations(grid: { current: HTMLElement | null }, exits: { current: HTMLElement | null }) {
  const previous = useRef(new Map<string, Position>());
  const motions = useRef(new Map<HTMLElement, Motion>());
  const ghosts = useRef(new Map<string, Animation>());
  const entries = useRef(new Map<HTMLElement, Animation>());
  const frame = useRef<number | null>(null);
  const lastTime = useRef(0);

  const tick = (time: number) => {
    const seconds = Math.min((time - lastTime.current) / 1000, 0.064);
    lastTime.current = time;
    for (const [node, motion] of motions.current) {
      [motion.x, motion.vx] = stepSpring(motion.x, motion.vx, seconds);
      [motion.y, motion.vy] = stepSpring(motion.y, motion.vy, seconds);
      if (!node.isConnected || (Math.hypot(motion.x, motion.y) < 0.1 && Math.hypot(motion.vx, motion.vy) < 1)) {
        node.style.transform = '';
        motions.current.delete(node);
      } else node.style.transform = `translate(${motion.x}px, ${motion.y}px)`;
    }
    frame.current = motions.current.size ? requestAnimationFrame(tick) : null;
  };
  const [reducedMotion] = useState(() => matchMedia('(prefers-reduced-motion: reduce)'));

  useEffect(() => {
    const stop = () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
      for (const node of motions.current.keys()) node.style.transform = '';
      for (const animation of entries.current.values()) animation.cancel();
      entries.current.clear();
      motions.current.clear();
      for (const animation of ghosts.current.values()) animation.cancel();
      ghosts.current.clear();
      exits.current?.replaceChildren();
    };
    const onChange = () => { if (reducedMotion.matches) stop(); };
    reducedMotion.addEventListener('change', onChange);
    return () => { reducedMotion.removeEventListener('change', onChange); stop(); };
  }, [reducedMotion, exits]);

  useLayoutEffect(() => {
    const root = grid.current, layer = exits.current;
    if (!root || !layer) return;
    const old = previous.current;
    const bounds = root.getBoundingClientRect();
    const next = new Map<string, Position>();
    const size = root.style.getPropertyValue('--size');
    for (const node of root.querySelectorAll<HTMLElement>(':scope > [data-font-index]')) {
      const rect = node.getBoundingClientRect();
      const motion = motions.current.get(node);
      next.set(node.dataset.fontIndex!, { node, x: rect.left - bounds.left - (motion?.x ?? 0), y: rect.top - bounds.top - (motion?.y ?? 0), width: rect.width, height: rect.height, size });
    }
    previous.current = next;
    if (reducedMotion.matches || !bounds.width || !old.size) return;

    for (const [id, current] of next) {
      ghosts.current.get(id)?.cancel();
      const before = old.get(id);
      const motion = motions.current.get(current.node) ?? { x: 0, y: 0, vx: 0, vy: 0 };
      if (!before) {
        motion.y = 6;
        const animation = current.node.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 180, easing: 'ease-out' });
        entries.current.set(current.node, animation);
        const done = () => { if (entries.current.get(current.node) === animation) entries.current.delete(current.node); };
        void animation.finished.then(done, done);
      } else {
        // Preserve both the visual position and velocity when the layout changes.
        // An unchanged destination leaves the existing spring completely alone.
        motion.x += before.x - current.x;
        motion.y += before.y - current.y;
      }
      if (Math.hypot(motion.x, motion.y) > 0.1 || Math.hypot(motion.vx, motion.vy) >= 1) {
        motions.current.set(current.node, motion);
        current.node.style.transform = `translate(${motion.x}px, ${motion.y}px)`;
      }
    }
    if (motions.current.size && frame.current === null) {
      lastTime.current = performance.now();
      frame.current = requestAnimationFrame(tick);
    }

    for (const [id, before] of old) {
      if (next.has(id) || typeof before.node.animate !== 'function') continue;
      // Only retain an exit image when it is near the visible viewport.
      const offset = motions.current.get(before.node);
      motions.current.delete(before.node);
      const entry = entries.current.get(before.node);
      const opacity = entry ? Number(entry.effect?.getComputedTiming().progress ?? 1) : 1;
      entry?.cancel();
      entries.current.delete(before.node);
      const x = before.x + (offset?.x ?? 0), y = before.y + (offset?.y ?? 0);
      if (bounds.top + y + before.height < 0 || bounds.top + y > innerHeight) continue;
      const clone = before.node.cloneNode(true) as HTMLElement;
      clone.style.transform = '';
      clone.inert = true;
      clone.style.pointerEvents = 'none';
      Object.assign(clone.style, { position: 'absolute', left: `${x}px`, top: `${y}px`, width: `${before.width}px`, height: `${before.height}px`, margin: '0' });
      clone.style.setProperty('--size', before.size);
      // cloneNode does not copy a canvas's bitmap.
      const sourceCanvases = before.node.querySelectorAll('canvas');
      clone.querySelectorAll('canvas').forEach((canvas, i) => {
        if (sourceCanvases[i]) canvas.getContext('2d')?.drawImage(sourceCanvases[i], 0, 0);
      });
      layer.append(clone);
      const animation = clone.animate([{ opacity }, { opacity: 0 }], { duration: 150, easing: 'ease-out', fill: 'forwards' });
      ghosts.current.set(id, animation);
      const remove = () => { if (ghosts.current.get(id) === animation) ghosts.current.delete(id); clone.remove(); };
      void animation.finished.then(remove, remove);
    }
  });
}
