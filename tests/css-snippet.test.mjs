import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';

const source = stripTypeScriptTypes(await readFile(new URL('../src/css-snippet.ts', import.meta.url), 'utf8'));
const { cssSnippet, downloadLink } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

const fraunces = { family: 'Fraunces', category: 'Serif', axes: { opsz: [9, 144, 14], wght: [100, 900, 400], SOFT: [0, 100, 0], WONK: [0, 1, 0] } };
const inter = { family: 'Inter', category: 'Sans Serif', axes: { wght: [100, 900, 400] } };
const lora = { family: 'Lora', category: 'Serif', axes: { wght: [400, 700, 400] } };
const bebas = { family: 'Bebas Neue', category: 'Display' };
const absans = { family: 'Absans', category: 'Sans Serif', libre: { url: 'https://www.collletttivo.it/typefaces/absans', foundry: 'Collletttivo', license: 'OFL-1.1' } };

test('a pairing of two Google families: one link with both, the weights in use, a rule per role', () => {
  const css = cssSnippet([
    { selector: '.heading', font: fraunces, style: { weight: 700, italic: false }, size: 48, lineHeight: 1.15 },
    { selector: '.body', font: inter, style: { weight: 400, italic: false }, size: 18, lineHeight: 1.55 },
  ]);
  assert.match(css, /href="https:\/\/fonts\.googleapis\.com\/css2\?family=Fraunces:opsz,wght@9\.\.144,700&family=Inter&display=swap"/);
  assert.match(css, /\.heading \{\n  font-family: 'Fraunces', serif;\n  font-weight: 700;\n  font-size: 48px;\n  line-height: 1\.15;\n\}/);
  assert.match(css, /\.body \{\n  font-family: 'Inter', sans-serif;\n  font-weight: 400;\n  font-size: 18px;\n  line-height: 1\.55;\n\}/);
});

test('one variable family in two weights: a range; with italic, a tuple per style', () => {
  const css = cssSnippet([
    { selector: '.heading', font: lora, style: { weight: 700, italic: true } },
    { selector: '.body', font: lora, style: { weight: 400, italic: false } },
  ]);
  assert.match(css, /family=Lora:ital,wght@0,400\.\.700;1,400\.\.700&/);
  assert.match(css, /\.heading \{\n  font-family: 'Lora', serif;\n  font-weight: 700;\n  font-style: italic;\n\}/);
});

test('custom axes off their defaults go into the link and into font-variation-settings', () => {
  const css = cssSnippet([{ selector: '.logo', font: fraunces, style: { weight: 500, italic: false }, axes: { opsz: 14, wght: 500, SOFT: 50, WONK: 0 } }]);
  assert.match(css, /family=Fraunces:opsz,wght,SOFT@9\.\.144,500,50&/);
  assert.match(css, /font-variation-settings: 'SOFT' 50;/);
});

test('a static family with a space in its name, in its only weight', () => {
  const css = cssSnippet([{ selector: '.heading', font: bebas, style: { weight: 400, italic: false } }]);
  assert.match(css, /family=Bebas\+Neue&display=swap/);
  assert.match(css, /font-family: 'Bebas Neue', sans-serif;/);
});

test('a libre family: @font-face blocks to self-host, no Google link', () => {
  const css = cssSnippet([{ selector: '.body', font: absans, style: { weight: 400, italic: false }, size: 18, lineHeight: 1.5 }]);
  assert.doesNotMatch(css, /googleapis/);
  assert.match(css, /\/\* Absans: get the files at https:\/\/www\.collletttivo\.it\/typefaces\/absans \*\/\n@font-face \{\n  font-family: 'Absans';\n  src: url\('Absans-Regular\.woff2'\) format\('woff2'\);\n  font-weight: 400;\n  font-style: normal;\n\}/);
});

test('the download link: the ZIP of Google Fonts, or the page of the foundry', () => {
  assert.equal(downloadLink(bebas).href, 'https://fonts.google.com/download?family=Bebas%20Neue');
  assert.equal(downloadLink(absans).href, 'https://www.collletttivo.it/typefaces/absans');
  assert.equal(downloadLink(absans).label, 'Get Absans at Collletttivo');
});
