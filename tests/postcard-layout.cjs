const {test} = require('node:test');
const assert = require('node:assert/strict');
const {layout, svg} = require('../assets/postcard-layout.js');
const fonts = require('../assets/postcard-fonts.json');
const defaults = require('../assets/postcard-defaults.json');
const draft = () => structuredClone(defaults);

test('the starting address follows the four printed card lines', () => {
  const doc = draft();
  doc.address.text = 'A. Sample\n10 Example Road\nTEST TOWN\nAB1 2CD';
  const result = layout(doc, fonts);
  assert.deepEqual(result.errors, []);
  assert.equal(doc.address.x, 80);
  assert.equal(doc.address.spacing, 12);
  assert.equal(doc.divider, false, 'the printed divider is not redrawn');
  for (const [i, line] of result.blocks.address.lines.entries()) {
    assert.ok(Math.abs(line.baseline - (49 + 12 * i)) < .5);
  }
});

test('message and address remain independent and use their own placement', () => {
  const doc = draft(); doc.message.text = 'Hello Gordon!'; doc.address.text = 'A. Sample\n10 Example Road\nTEST TOWN';
  const result = layout(doc, fonts);
  assert.deepEqual(result.errors, []);
  assert.ok(result.blocks.message.bounds[2] < 74);
  assert.ok(result.blocks.address.bounds[0] > 74);
  assert.equal(result.blocks.address.lines.length, 3);
  const before = structuredClone(result.blocks.address.paths);
  doc.message.x += 1; doc.message.y += 2; doc.message.font = 'serif';
  assert.deepEqual(layout(doc, fonts).blocks.address.paths, before);
});

test('font, point size, baseline spacing and alignment affect real paths', () => {
  const doc = draft(); doc.message.text = 'Hello\nHello';
  for (const font of fonts) {
    doc.message.font = font.id;
    const a = layout(doc, fonts).blocks.message;
    const first = a.paths[0][0];
    doc.message.spacing = 9;
    const b = layout(doc, fonts).blocks.message;
    assert.deepEqual(b.paths[0][0], first);
    assert.equal(b.lines[1].baseline - b.lines[0].baseline, 9);
    doc.message.size = 20;
    assert.ok(layout(doc, fonts).blocks.message.lines[0].width > a.lines[0].width);
    doc.message.size = 14; doc.message.spacing = 6;
  }
  const left = layout(doc, fonts).blocks.message.bounds[0];
  doc.message.align = 'right';
  assert.ok(layout(doc, fonts).blocks.message.bounds[0] > left);
});

test('word wrapping preserves paragraph breaks and never silently truncates', () => {
  const doc = draft(); doc.message.text = 'A little message with several words\n\nFrom me'; doc.message.width = 28;
  const result = layout(doc, fonts);
  assert.ok(result.blocks.message.lines.length > 4);
  assert.ok(result.blocks.message.lines.some(line => line.text === ''));
  assert.equal(result.blocks.message.lines.filter(line => line.text).map(line => line.text).join(' ').replace(/\s+/g, ' '),
    'A little message with several words From me');
  assert.ok(result.blocks.message.lines.every(line => line.width <= 28.001));
});

test('overflow, crossing halves, overlap and unsupported characters block output', () => {
  const doc = draft(); doc.message.text = 'Hello';
  for (const change of [{y:104}, {x:73}, {text:'😀'}, {text:'Hello\nHello',spacing:2,size:25}]) {
    const d = draft(); Object.assign(d.message, {text:'Hello'}, change);
    const result = layout(d, fonts);
    assert.ok(result.errors.length, JSON.stringify(change));
    assert.throws(() => svg(result), /layout|text|card|character|overlap/i);
  }
  assert.throws(() => layout({...doc,message:{...doc.message,size:NaN}}, fonts));
});

test('accents, smart punctuation and pen lifts survive path-only SVG export', () => {
  const doc = draft(); doc.message.text = 'Café £5 — “Hello”\nIt’s fine.';
  const result = layout(doc, fonts);
  assert.deepEqual(result.errors, []);
  const text = svg(result);
  assert.match(text, /width="148mm" height="105mm"/);
  assert.match(text, /data-plotter-postcard="text-v1"/);
  assert.ok(!text.includes('<text'));
  assert.ok(result.paths.length > 20, 'glyph strokes stay separate');
  assert.deepEqual(new Set(result.colours), new Set(['#000000']));
});

test('message-only and address-only drafts omit the disabled text', () => {
  const doc = draft(); doc.message.text = 'Message'; doc.address.text = 'Address';
  const both = layout(doc, fonts);
  doc.address.enabled = false;
  assert.deepEqual(layout(doc, fonts).paths, both.blocks.message.paths);
  doc.message.enabled = false; doc.divider = true;
  assert.deepEqual(layout(doc, fonts).paths, [[[74,6],[74,99]]]);
});

test('Latin macrons work in both text blocks and both Unicode forms in every bundled font', () => {
  for (const font of fonts) {
    const doc = draft();
    for (const key of ['message', 'address']) {
      Object.assign(doc[key], {text:'Rōmānī īte domum', font:font.id, size:12});
    }
    const result = layout(doc, fonts);
    assert.deepEqual(result.errors, [], font.name);
    assert.ok(!svg(result).includes('<text'), 'macrons export as plotter paths');
    for (const key of ['message', 'address']) doc[key].text = doc[key].text.normalize('NFD');
    assert.deepEqual(layout(doc, fonts), result, 'combining macrons use the same glyphs');
    const glyphCount = [...'Rōmānī īte domum'].reduce((n, c) => n + font.glyphs[c].paths.length, 0);
    assert.equal(result.paths.length, 2 * glyphCount, 'no missing or extra pen strokes');
  }
});

test('macrons participate in page clipping and line overlap checks', () => {
  for (const font of fonts) {
    const doc = draft();
    Object.assign(doc.message, {text:'Ā', font:font.id, y:0});
    const clipped = layout(doc, fonts);
    assert.ok(clipped.errors.some(e => e.includes('outside')), font.name);
    assert.throws(() => svg(clipped), /outside/);
    Object.assign(doc.message, {text:'Ā\nĀ', y:10, spacing:2});
    assert.ok(layout(doc, fonts).errors.some(e => e.includes('overlap')), font.name);
  }
});
