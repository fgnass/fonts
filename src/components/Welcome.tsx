import { useEffect } from 'preact/hooks';
import { welcome } from '../state';
import { PreviewTextField } from './PreviewText';

const GITHUB = 'https://github.com/fgnass/fonts';
const PRIVACY = 'https://gnass.buzz/privacy';

/** The start screen: what the app does, the preview text and the small print. */
export function Welcome() {
  const close = () => { welcome.value = false; };
  // Cmd/Ctrl+Enter in the text field starts too.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return (
    <div class="welcome" role="dialog" aria-modal="true" aria-labelledby="welcome-title">
      <div class="welcome-panel">
        <span class="eyebrow">fonts.gnass.buzz</span>
        <h1 id="welcome-title">Find your type among all Google Fonts.</h1>
        <p>
          Narrow down the fonts by how they look: weight, width, contrast, serifs and more. Draw a letter to find fonts with a similar shape, or start from a
          font you like. Star your favourites and pair a heading with a body text.
        </p>
        <label class="welcome-text">
          <span>Your preview text</span>
          <PreviewTextField autofocus />
          <small>Up to three lines, one per line on each card. You can change it anytime.</small>
        </label>
        <button type="button" class="welcome-start" onClick={close}>Start exploring</button>
        <footer>
          <a href={GITHUB} target="_blank" rel="noreferrer">Source on GitHub</a>
          <span aria-hidden="true">·</span>
          <a href={`${GITHUB}/blob/main/LICENSE`} target="_blank" rel="noreferrer">MIT License</a>
          <span aria-hidden="true">·</span>
          <a href={PRIVACY} target="_blank" rel="noreferrer">Privacy policy</a>
        </footer>
      </div>
    </div>
  );
}
