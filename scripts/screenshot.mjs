/**
 * Portfolio screenshot generator
 *
 * Starts the Vite dev server and captures the real app at an iPhone-class
 * viewport scaled 2× → exactly 780 × 1688. The font data must be built
 * (make) before.
 *
 * They land in public/screenshots/, so the deployed site serves them at
 * https://fonts.gnass.buzz/screenshots/*.png.
 *
 *   public/screenshots/shape.png      a drawn "A" in the Shape tab, with the
 *                                     fonts that match it
 *   public/screenshots/explore.png    the contrast slider slid out of the
 *                                     rail, set to high contrast
 *   public/screenshots/shortlist.png  a shortlist with a heading/body pair
 *   public/screenshots/og.png         the link preview (og:image): the name,
 *                                     the tagline and two short phones
 *                                     (360 × 700), shape and explore, on the
 *                                     amber of the app, 2400 × 1260
 *
 * Re-run any time the UI changes:  npm run screenshot
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const outDir = resolve(root, 'public', 'screenshots');

// Target output is 780 × 1688: half that on a high-DPI viewport, captured at
// the native device pixels.
const VIEWPORT = { width: 390, height: 844 };
const SCALE = 2;

const PORT = 5173;
const BASE = `http://127.0.0.1:${PORT}/`;

// Viewport of the phones in the link preview
const PREVIEW_VIEWPORT = { width: 360, height: 700 };

// Frame colors: the black console of the app on its amber
const ACCENT = '#e8b84a';
const INK = '#2a1f05';
const FRAME = '#121212';

const SHORTLIST = ['Playfair Display', 'Fraunces', 'Inter', 'DM Sans'];

const wait = (page, ms) => page.waitForTimeout(ms);

/** Waits until the fonts of the visible cards are in. */
async function settle(page) {
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.fonts.ready);
  await wait(page, 800);
}

/** Closes the start page. */
async function start(page) {
  await page.getByRole('button', { name: 'Start exploring' }).click();
  await settle(page);
}

// The Shortlist tab adds the count of saved fonts to its name.
const tab = (page, name) => page.getByRole('tab', { name: new RegExp(`^${name}`) }).click();

/** A capital A on the sketch pad: two legs and a crossbar, slightly uneven, like by hand. */
async function drawA(page) {
  const box = await page.locator('#pad').boundingBox();
  // Points in the 0..1 square of the pad; cap line and base line are at about 0.22 and 0.78.
  const strokes = [
    [[0.2, 0.78], [0.33, 0.5], [0.5, 0.21]],
    [[0.5, 0.21], [0.66, 0.5], [0.81, 0.78]],
    [[0.31, 0.58], [0.5, 0.57], [0.7, 0.58]],
  ];
  for (const stroke of strokes) {
    const at = ([x, y]) => [box.x + x * box.width, box.y + y * box.height];
    await page.mouse.move(...at(stroke[0]));
    await page.mouse.down();
    for (let i = 1; i < stroke.length; i++) {
      const [x0, y0] = stroke[i - 1], [x1, y1] = stroke[i];
      for (let t = 1; t <= 8; t++) await page.mouse.move(...at([x0 + ((x1 - x0) * t) / 8, y0 + ((y1 - y0) * t) / 8]));
    }
    await page.mouse.up();
  }
}

/** Each shot: how to bring the app into its state. */
const SHOTS = {
  shape: {
    async stage(page) {
      await start(page);
      await tab(page, 'Shape');
      await drawA(page);
      await wait(page, 1500);
      await settle(page);
    },
  },
  explore: {
    async stage(page) {
      await start(page);
      await page.getByRole('textbox', { name: 'Text to preview, up to three lines' }).fill('Vogue');
      await page.getByRole('button', { name: 'Contrast', exact: true }).click();
      const min = page.getByRole('slider', { name: 'Contrast minimum' });
      await min.focus();
      for (let i = 0; i < 6; i++) await min.press('Shift+ArrowRight');
      await wait(page, 500);
      await settle(page);
    },
  },
  shortlist: {
    saved: SHORTLIST,
    async stage(page) {
      await start(page);
      await tab(page, 'Shortlist');
      await page.getByRole('combobox', { name: 'Body text font' }).selectOption('Inter');
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      // The specimen loads its fonts on demand: wait until each font it uses is in.
      await page.waitForFunction(async () => {
        const families = new Set([...document.querySelectorAll('#font-workspace *')].map((e) => getComputedStyle(e).fontFamily).filter((f) => f.startsWith('fs-')));
        const faces = await Promise.all([...families].map((f) => document.fonts.load(`16px "${f}"`)));
        return families.size >= 2 && faces.every((list) => list.length);
      });
      await settle(page);
    },
  },
};

// The link preview (og:image) for LinkedIn, Slack etc., which use 1.91:1
const OG = { width: 1200, height: 630 };

/** A phone screenshot in a dark frame, like the windows on gnass.buzz/projects. */
function phone(png, { x, y, width }) {
  return `<div class="phone" style="left:${x}px; top:${y}px; width:${width}px">
    <img src="data:image/png;base64,${png.toString('base64')}" />
  </div>`;
}

/** Link previews, composed from the phone shots on the accent color. */
const PREVIEWS = {
  og: ({ ogShape, ogExplore }) => `
    <div class="side">
      <h1>fonts</h1>
      <p>Find your type among all Google Fonts, by how it looks.</p>
    </div>
    ${phone(ogShape, { x: 530, y: 50, width: 273 })}
    ${phone(ogExplore, { x: 837, y: 50, width: 273 })}`,
};

async function compose(browser, name, body) {
  const html = `<!doctype html>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Schibsted+Grotesk:wght@500;700&display=block" />
<style>
  * { box-sizing: border-box; margin: 0; }
  body { width: ${OG.width}px; height: ${OG.height}px; background: ${ACCENT}; overflow: hidden; font-family: 'Schibsted Grotesk', system-ui, sans-serif; color: ${INK}; }
  .phone {
    position: absolute; padding: 10px; border-radius: 44px;
    background: ${FRAME}; box-shadow: 0 10px #00000038;
  }
  .phone img { display: block; width: 100%; border-radius: 34px; }
  .side { position: absolute; left: 90px; top: 50%; transform: translateY(-50%); width: 380px; }
  .side h1 { font: 700 112px/0.9 'Schibsted Grotesk', sans-serif; letter-spacing: -0.03em; }
  .side p { margin-top: 28px; font: 500 28px/1.35 'Schibsted Grotesk', sans-serif; }
</style>
${body}`;
  const context = await browser.newContext({ viewport: OG, deviceScaleFactor: SCALE });
  try {
    const page = await context.newPage();
    await page.setContent(html, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    const out = resolve(outDir, `${name}.png`);
    await writeFile(out, await page.screenshot());
    console.log(`Saved ${out} (${OG.width * SCALE} × ${OG.height * SCALE})`);
  } finally {
    await context.close();
  }
}

function startServer() {
  return createServer({
    root,
    logLevel: 'warn',
    server: { port: PORT, strictPort: true, host: '127.0.0.1' },
  }).then((server) => server.listen());
}

/** Capture one shot in its own context (own localStorage), then dispose it. */
async function capture(browser, name, shot, viewport = VIEWPORT) {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: SCALE,
    isMobile: true,
    hasTouch: true,
  });
  try {
    if (shot.saved) await context.addInitScript((saved) => localStorage.setItem('fonts.shortlist', JSON.stringify(saved)), shot.saved);
    const page = await context.newPage();
    page.on('pageerror', (err) => console.log(`  [page] ${err.message}`));
    console.log(`Opening ${BASE} for ${name}`);
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await shot.stage(page);
    return await page.screenshot();
  } finally {
    await context.close();
  }
}

async function main() {
  await mkdir(outDir, { recursive: true });
  const server = await startServer();
  let browser;
  try {
    browser = await chromium.launch();
    // One after the other: in parallel, the shape searches compete for the CPU.
    for (const [name, shot] of Object.entries(SHOTS)) {
      const out = resolve(outDir, `${name}.png`);
      await writeFile(out, await capture(browser, name, shot));
      console.log(`Saved ${out} (${VIEWPORT.width * SCALE} × ${VIEWPORT.height * SCALE})`);
    }
    // For the link preview: shorter phones, so two of them fit completely.
    const shots = {
      ogShape: await capture(browser, 'og shape', SHOTS.shape, PREVIEW_VIEWPORT),
      ogExplore: await capture(browser, 'og explore', SHOTS.explore, PREVIEW_VIEWPORT),
    };
    for (const [name, body] of Object.entries(PREVIEWS)) {
      await compose(browser, name, body(shots));
    }
  } finally {
    await browser?.close();
    await server.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
