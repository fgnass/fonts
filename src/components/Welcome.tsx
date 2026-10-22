import { styled } from 'classname-variants/preact';
import { useEffect } from 'preact/hooks';
import { welcome } from '../state';
import { PreviewTextField } from './PreviewText';
import { Eyebrow } from './ui';

const FooterLink = styled('a', { base: 'text-muted hover:text-fg', defaultProps: { target: '_blank', rel: 'noreferrer' } });

const GITHUB = 'https://github.com/fgnass/fonts';
const PRIVACY = 'https://gnass.buzz/privacy';

/** The start page: what the app does, the preview text and the small print. The app renders hidden behind it, so its data and first fonts load meanwhile. */
export function Welcome() {
  const close = () => {
    welcome.value = false;
    window.scrollTo(0, 0);
  };
  // Cmd/Ctrl+Enter in the text field starts too.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return (
    <div class="flex min-h-screen flex-col bg-base px-12 max-[600px]:px-4">
      <header class="flex h-16 items-center">
        <Eyebrow>fonts.gnass.buzz</Eyebrow>
      </header>
      <main class="flex flex-1 flex-col justify-center gap-6 py-12">
        <h1 class="max-w-[14ch] text-[clamp(40px,7vw,84px)]/[1.02] font-semibold tracking-[-0.02em] text-bright">Find your type among all Google Fonts.</h1>
        <p class="max-w-[560px] text-[17px]/[1.6] text-soft max-[600px]:text-[15px]">
          Narrow down the fonts by how they look: weight, width, contrast, serifs and more. Draw a letter to find fonts with a similar shape, or start from a
          font you like. Star your favourites and pair a heading with a body text.
        </p>
        <div class="mt-4 flex max-w-[560px] flex-col gap-2">
          <label class="text-[12px] font-medium text-fg" for="welcome-text">Your preview text</label>
          <div class="flex flex-wrap items-start gap-3">
            <PreviewTextField id="welcome-text" class="min-w-[260px] flex-1" autofocus />
            <button
              type="button"
              class="h-10 cursor-pointer rounded-lg bg-accent px-4.5 font-semibold text-[#1a1400] hover:brightness-108 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bright"
              onClick={close}
            >
              Start exploring
            </button>
          </div>
          <small class="text-[11px] text-muted">Up to three lines, one per line on each card. You can change it anytime.</small>
        </div>
      </main>
      <footer class="flex flex-wrap gap-2.5 border-t border-line py-5 text-[12px] text-dim">
        <FooterLink href={GITHUB}>Source on GitHub</FooterLink>
        <span aria-hidden="true">·</span>
        <FooterLink href={`${GITHUB}/blob/main/LICENSE`}>MIT License</FooterLink>
        <span aria-hidden="true">·</span>
        <FooterLink href={PRIVACY}>Privacy policy</FooterLink>
      </footer>
    </div>
  );
}
