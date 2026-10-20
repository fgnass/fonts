import { styled } from 'classname-variants/preact';
import { useEffect } from 'preact/hooks';
import { welcome } from '../state';
import { PreviewTextField } from './PreviewText';
import { Eyebrow } from './ui';

const FooterLink = styled('a', { base: 'text-muted hover:text-fg', defaultProps: { target: '_blank', rel: 'noreferrer' } });

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
    <div class="fixed inset-0 z-20 flex items-center justify-center overflow-y-auto bg-[rgb(18_18_18/0.88)] p-6 backdrop-blur-[6px]" role="dialog" aria-modal="true" aria-labelledby="welcome-title">
      <div class="flex w-full max-w-[560px] flex-col gap-4.5 rounded-[14px] border border-line2 bg-panel px-10 pt-9 pb-7 shadow-[0_24px_80px_rgb(0_0_0/0.6)] max-[600px]:px-5.5 max-[600px]:pt-7 max-[600px]:pb-5.5">
        <Eyebrow>fonts.gnass.buzz</Eyebrow>
        <h1 class="text-[28px]/[1.2] font-semibold text-bright" id="welcome-title">Find your type among all Google Fonts.</h1>
        <p class="text-[14px]/[1.55] text-soft">
          Narrow down the fonts by how they look: weight, width, contrast, serifs and more. Draw a letter to find fonts with a similar shape, or start from a
          font you like. Star your favourites and pair a heading with a body text.
        </p>
        <label class="mt-1.5 flex flex-col gap-2">
          <span class="text-[12px] font-medium text-fg">Your preview text</span>
          <PreviewTextField autofocus />
          <small class="text-[11px] text-muted">Up to three lines, one per line on each card. You can change it anytime.</small>
        </label>
        <button
          type="button"
          class="h-10 cursor-pointer self-start rounded-lg bg-accent px-4.5 font-semibold text-[#1a1400] hover:brightness-108 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bright"
          onClick={close}
        >
          Start exploring
        </button>
        <footer class="mt-1.5 flex flex-wrap gap-2.5 border-t border-line pt-4 text-[12px] text-dim">
          <FooterLink href={GITHUB}>Source on GitHub</FooterLink>
          <span aria-hidden="true">·</span>
          <FooterLink href={`${GITHUB}/blob/main/LICENSE`}>MIT License</FooterLink>
          <span aria-hidden="true">·</span>
          <FooterLink href={PRIVACY}>Privacy policy</FooterLink>
        </footer>
      </div>
    </div>
  );
}
