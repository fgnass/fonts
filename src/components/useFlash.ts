import { useEffect, useState } from 'preact/hooks';

/**
 * A status that shows for a moment: 'idle' or 'busy' stay, any other value
 * goes back to 'idle' after `ms`. For the result of a button, e.g. "Copied".
 */
export function useFlash<S extends string>(ms = 2000) {
  const [state, setState] = useState<S | 'idle' | 'busy'>('idle');
  useEffect(() => {
    if (state === 'idle' || state === 'busy') return;
    const timer = setTimeout(() => setState('idle'), ms);
    return () => clearTimeout(timer);
  }, [state]);
  return [state, setState] as const;
}
