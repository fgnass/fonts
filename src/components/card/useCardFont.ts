import { useEffect, useState } from 'preact/hooks';
import type { Style } from '../../data';
import { fontAlias, isLoaded, loadFont, retain, textChars } from '../../fontload';
import type { Item } from '../../state';

/**
 * The font in which a card shows its text, loaded once the card is near the
 * viewport. Until the font has loaded the first time, `covers` is false and
 * the text stays hidden; after that, the old font stays until a new one
 * (another style or text) has loaded, so that nothing flickers. The old font
 * is a subset with just its own characters, so it only covers the text while
 * it has every character of the new text (otherwise the missing ones would
 * show in the fallback font). A libre family has one alias for all texts that
 * covers every character (see loadLibre).
 */
export function useCardFont(item: Item, style: Style, text: string, near: boolean) {
  const want = fontAlias(item, style, text);
  // A font that has loaded before (for example ahead, see Results) shows at once.
  const [shown, setShown] = useState<{ alias: string; chars: string } | null>(() => (isLoaded(want) ? { alias: want, chars: textChars(text) } : null));
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (want === shown?.alias) return;
    const chars = textChars(text);
    if (isLoaded(want)) return setShown({ alias: want, chars });
    if (!near) return;
    const { alias, ready } = loadFont(item, style, text);
    let live = true;
    let retry: ReturnType<typeof setTimeout> | undefined;
    ready.then((ok) => {
      if (!live) return;
      if (ok) setShown({ alias, chars });
      // A failed load (for example a network hiccup) tries again, with growing pauses.
      else retry = setTimeout(() => setAttempt((n) => n + 1), Math.min(30_000, 1000 * 2 ** attempt));
    });
    return () => {
      live = false;
      clearTimeout(retry);
    };
  }, [near, want, attempt]);

  // Keep the shown font loaded while the card shows it.
  useEffect(() => (shown ? retain(shown.alias) : undefined), [shown?.alias]);

  return { alias: shown?.alias, covers: shown != null && (!!item.libre || [...text].every((c) => shown.chars.includes(c))) };
}
