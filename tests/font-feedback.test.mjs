import assert from 'node:assert/strict';
import fs from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';

// Exercise the browser's filtering code with the real font measurements.
const moduleURL = (source) => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const source = (path) => stripTypeScriptTypes(fs.readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8'));
const originalFetch = globalThis.fetch;
globalThis.fetch = async (path) => {
  try { return new Response(fs.readFileSync(new URL(`../public${path}`, import.meta.url))); }
  catch { return new Response(null, { status: 404 }); }
};
const dataURL = moduleURL(source('data.ts'));
const slidersURL = moduleURL(source('sliders.ts'));
const data = await import(dataURL);
globalThis.fetch = originalFetch;
const { SLIDERS } = await import(slidersURL);
const { activeRanges, exclusionSuggestions, filterFonts, fontValue } = await import(moduleURL(source('filter.ts')
  .replace("'./data'", JSON.stringify(dataURL)).replace("'./sliders'", JSON.stringify(slidersURL))));
const any = () => Object.fromEntries(SLIDERS.map((s) => [s.key, [0, 1]]));
const slider = (key) => SLIDERS.find((s) => s.key === key);

test('hover measurements follow the displayed weight, width and slant', () => {
  const font = data.byFamily.get('Roboto');
  const weights = Object.entries(data.metrics[font.index].v).filter(([key]) => !key.endsWith('i')).sort((a, b) => parseInt(a[0]) - parseInt(b[0]));
  const [lo, hi] = [weights[0], weights[1]];
  const weight = (parseInt(lo[0]) + parseInt(hi[0])) / 2;
  assert.equal(fontValue(font, slider('weight'), { weight, italic: false }), (lo[1][0] + hi[1][0]) / 2);
  const variableWidth = data.textFonts.find((f) => data.metrics[f.index].wd?.length >= 2);
  const [a, b] = [...data.metrics[variableWidth.index].wd].sort((x, y) => x[0] - y[0]);
  assert.ok(Math.abs(fontValue(variableWidth, slider('width'), { weight: variableWidth.weight, italic: false, wdth: (a[0] + b[0]) / 2 }) - (a[1] + b[1]) / 2) < 1e-10);
  const upright = fontValue(font, slider('slant'), { weight: font.weight, italic: false });
  assert.equal(fontValue(font, slider('slant'), { weight: font.weight, italic: false, slnt: -10 }), upright + 10);
});

test('suggestions exclude whole families, report losses and preserve other constraints', () => {
  for (const name of ['Great Vibes', 'Monoton', 'Bungee Shade', 'Caveat']) {
    const font = data.byFamily.get(name), corridors = any();
    corridors.glyphs = [0, 0.95];
    const snapshot = structuredClone(corridors);
    const baseline = filterFonts(activeRanges(corridors)).list;
    const plans = exclusionSuggestions(font, corridors);
    assert.ok(plans.length > 0 && plans.length <= 3, name);
    assert.equal(new Set(plans.map((p) => p.slider.key)).size, plans.length);
    assert.deepEqual(corridors, snapshot, 'requesting suggestions must not modify filters');
    for (const plan of plans) {
      assert.ok(!plan.slider.technical);
      const next = { ...corridors, [plan.slider.key]: plan.corridor };
      const result = filterFonts(activeRanges(next)).list;
      assert.ok(!result.some((f) => f.index === font.index), `${name} must not reappear in another variant`);
      assert.equal(baseline.length - result.length, plan.removed);
      assert.equal(result.length, plan.remaining);
      assert.ok(result.length > 0);
      const before = new Set(baseline.map((f) => f.index));
      assert.ok(result.every((f) => before.has(f.index)));
      for (const s of SLIDERS) if (s.key !== plan.slider.key) assert.deepEqual(next[s.key], corridors[s.key]);
    }
  }
});

test('an ornate script suggests ornament before weight, slant or technical properties', () => {
  const plans = exclusionSuggestions(data.byFamily.get('Great Vibes'), any());
  assert.equal(plans[0].slider.key, 'o');
  assert.equal(plans[0].label, 'Less ornate');
  assert.ok(plans.every((p) => !p.slider.technical));
  assert.ok(plans.every((p) => !['weight', 'slant'].includes(p.slider.key)));
  const dimensional = exclusionSuggestions(data.byFamily.get('Bungee Shade'), any());
  assert.ok(dimensional.length > 0);
  assert.ok(dimensional.every((p) => !['weight', 'slant'].includes(p.slider.key)));
  assert.ok(dimensional.every((p) => !p.label.match(/3D|shadow/i)), 'unmeasured effects must not be claimed');
});

test('weak differences and inseparable selections produce no recommendations', () => {
  assert.deepEqual(exclusionSuggestions(data.byFamily.get('Roboto'), any()), []);
  const font = data.byFamily.get('Great Vibes'), peer = data.byFamily.get('Roboto');
  const cohort = new Set([font.index, peer.index]);
  const plans = exclusionSuggestions(font, any(), cohort);
  assert.ok(plans.length > 0);
  for (const plan of plans) {
    assert.equal(plan.removed, 1);
    assert.equal(plan.remaining, 1);
    const next = filterFonts(activeRanges({ ...any(), [plan.slider.key]: plan.corridor })).list;
    assert.ok(next.some((f) => f.index === peer.index));
  }
  assert.deepEqual(exclusionSuggestions(font, any(), new Set([font.index])), []);
  const constrained = any();
  constrained.o = [0, 0.01];
  assert.deepEqual(exclusionSuggestions(font, constrained), []);
});

test('broken-outline rejection offers solid strokes as its primary explanation', () => {
  const font = data.byFamily.get('Rubik Burned');
  const plans = exclusionSuggestions(font, any());
  assert.equal(plans[0].slider.key, 'hf');
  assert.equal(plans[0].label, 'More solid strokes');
  const result = filterFonts(activeRanges({ ...any(), hf: plans[0].corridor })).list;
  assert.ok(!result.some((f) => f.index === font.index));
  assert.ok(result.some((f) => f.family === 'Roboto'));
});

test('all sliders have explicit fixed endpoint labels', () => {
  for (const s of SLIDERS) {
    assert.equal(s.ends.length, 2, s.key);
    assert.ok(s.ends.every((end) => typeof end === 'string' && end.length > 0), s.key);
    assert.notEqual(s.ends[0], s.ends[1], s.key);
  }
  assert.deepEqual(slider('hf').ends, ['Solid', 'Outline']);
  assert.deepEqual(slider('mo').ends, ['Equal letter widths', 'Varied letter widths']);
});

test('solid/outline endpoints have contrasting real font samples, including less popular outline families', async () => {
  const { samplePair } = await import(moduleURL(source('samples.ts')
    .replace("'./data'", JSON.stringify(dataURL)).replace("'./sliders'", JSON.stringify(slidersURL))));
  const s = slider('hf'), pair = samplePair(s);
  assert.ok(pair);
  assert.ok(s.pos(data.metrics[pair[0].font.index].hf) <= 0.3);
  assert.ok(s.pos(data.metrics[pair[1].font.index].hf) >= 0.7);
});

test('axis interpolation keeps styles inside corridors even beyond the slider scale', () => {
  for (const [family, key, range] of [
    ['Inconsolata', 'width', [0.9, 0.95]],
    ['Bitcount', 'weight', [0.35, 0.4]],
  ]) {
    const result = filterFonts(activeRanges({ ...any(), [key]: range }));
    const font = result.list.find((f) => f.family === family);
    assert.ok(font, `${family} has a reachable style`);
    const position = slider(key).pos(fontValue(font, slider(key), font.pick));
    assert.ok(position >= range[0] - 1e-9 && position <= range[1] + 1e-9, `${family}: ${position}`);
  }
});

test('slant selection follows the chosen weight and rejects incompatible weight/slant corridors', () => {
  const slant = [0.4, 0.45]; // 7–8.5 degrees; Labrada 400 italic measures 9.5 degrees.
  const find = (corridors) => filterFonts(activeRanges({ ...any(), ...corridors })).list.find((f) => f.family === 'Labrada');
  const font = find({ slant });
  assert.ok(font, 'another weight has the requested slant');
  assert.notEqual(font.pick.weight, 400);
  const angle = fontValue(font, slider('slant'), font.pick);
  assert.ok(angle >= 7 - 1e-9 && angle <= 8.5 + 1e-9);
  assert.equal(find({ slant, weight: [slider('weight').pos(0.09), slider('weight').pos(0.10)] }), undefined);
  assert.ok(find({ slant, weight: [slider('weight').pos(0.03), slider('weight').pos(0.07)] }));
});

test('displayed styles satisfy all active style corridors across the real font collection', () => {
  const configurations = [];
  for (const key of ['weight', 'width', 'slant']) {
    for (const lo of [0, 0.2, 0.4, 0.7, 0.9]) configurations.push({ [key]: [lo, lo + 0.05] });
  }
  configurations.push({ weight: [0.2, 0.3], slant: [0.4, 0.45], width: [0.3, 0.5] });
  configurations.push({ weight: [0.7, 1], slant: [0.1, 0.2], width: [0.9, 1] });
  for (const corridors of configurations) {
    const ranges = activeRanges({ ...any(), ...corridors });
    for (const font of filterFonts(ranges).list) {
      for (const { slider, lo, hi } of ranges.values()) {
        const value = fontValue(font, slider, font.pick);
        assert.notEqual(value, null, `${font.family}: ${slider.key}`);
        const p = slider.pos(value);
        assert.ok(p >= lo - 1e-9 && p <= hi + 1e-9, `${font.family}: ${slider.key} ${p} outside [${lo}, ${hi}]`);
      }
    }
  }
});
