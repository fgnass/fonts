import { useEffect, useState } from 'preact/hooks';
import type { Style } from '../data';
import { fontAlias, type FontRef, loadFont, retain } from '../fontload';

interface Options {
  /** Waits this long before loading, so that quick changes load only the last font. */
  delay?: number;
  enabled?: boolean;
  /** Loads the whole range of every variable axis (see LoadOptions). */
  allAxes?: boolean;
}

/**
 * Loads a font for the text and keeps it loaded while it is shown. Returns its
 * alias once the font can be used; until then, the alias of the font before.
 */
export function useLoadedFont(
  font: FontRef | undefined,
  style: Style | undefined,
  text: string,
  { delay = 0, enabled = true, allAxes = false }: Options = {},
) {
  const [alias, setAlias] = useState<string>();
  const want = font && style && text && enabled ? fontAlias(font, style, text, { allAxes }) : undefined;
  useEffect(() => {
    if (!want) return;
    let live = true;
    const load = () => {
      const loaded = loadFont(font!, style!, text, { allAxes });
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
