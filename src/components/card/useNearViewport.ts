import { type RefObject } from 'preact';
import { useEffect, useState } from 'preact/hooks';

const onVisible = new Map<Element, () => void>();
const observer = new IntersectionObserver(
  (entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      observer.unobserve(e.target);
      onVisible.get(e.target)?.();
      onVisible.delete(e.target);
    }
  },
  { rootMargin: '400px' },
);

/** Whether the element has come near the viewport; it stays true after that. */
export function useNearViewport(el: RefObject<Element>) {
  const [near, setNear] = useState(false);
  useEffect(() => {
    const node = el.current!;
    onVisible.set(node, () => setNear(true));
    observer.observe(node);
    return () => {
      observer.unobserve(node);
      onVisible.delete(node);
    };
  }, []);
  return near;
}
