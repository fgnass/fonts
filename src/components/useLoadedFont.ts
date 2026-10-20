import { useEffect, useState } from 'preact/hooks';
import type { Font, Style } from '../data';
import { fontAlias, loadFont, retain } from '../fontload';

interface Options {
  /** Waits this long before loading, so that quick changes load only the last font. */
  delay?: number;
  enabled?: boolean;
}

/**
 * Loads a font for the text and keeps it loaded while it is shown. Returns its
 * alias once the font can be used; until then, the alias of the font before.
 */
export function useLoadedFont(
  font: Pick<Font, 'family' | 'axes'> | undefined,
  style: Style | undefined,
  text: string,
  { delay = 0, enabled = true }: Options = {},
) {
  const [alias, setAlias] = useState<string>();
  const want = font && style && text && enabled ? fontAlias(font, style, text) : undefined;
  useEffect(() => {
    if (!want) return;
    let live = true;
    const load = () => {
      const loaded = loadFont(font!, style!, text);
      loaded.ready.then((ok) => { if (live && ok) setAlias(loaded.alias); });
    };
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (delay) {
      timer = setTimeout(load, delay);
    } else {
      load();
    }
    return () => { live = false; clearTimeout(timer); };
  }, [want]);
  useEffect(() => (alias ? retain(alias) : undefined), [alias]);
  return alias;
}
