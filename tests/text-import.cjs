const {test} = require('node:test');
const assert = require('node:assert/strict');
const TextImport = require('../assets/text-import.js');
const fonts = require('../assets/postcard-fonts.json');
const font = fonts.find(f => f.id === 'sans');
const SVG = require('../assets/svg-import.js');

test('preserves every column, leading/trailing space and blank line without wrapping', () => {
  const text = '   /\\  \r\n  |  |\r\n\r\n  ----\r\n';
  const result = TextImport.layout(text, {}, font);
  assert.deepEqual(result.lines, ['   /\\  ', '  |  |', '', '  ----', '']);
  assert.equal(result.columns, 7);
  assert.equal(result.rows, 5);
  assert.equal(result.width, 21);
  assert.equal(result.height, 25);
});

test('fixed-width cells ignore proportional glyph advances', () => {
  const a = TextImport.layout('iM|', {}, font);
  const b = TextImport.layout('Wi|', {}, font);
  const pipe = TextImport.layout('  |', {}, font);
  assert.deepEqual(a.paths.at(-1), pipe.paths.at(-1));
  assert.deepEqual(b.paths.at(-1), pipe.paths.at(-1));
  const shifted = TextImport.layout('   |\n\n   |', {}, font);
  assert.equal(shifted.paths[0][0][0] - pipe.paths[0][0][0], 3);
  assert.equal(shifted.paths[1][0][1] - shifted.paths[0][0][1], 10);
});

test('tabs advance to tab stops and each physical line resets its column', () => {
  assert.deepEqual(TextImport.layout('a\tb\n\tc', {tabSize:4}, font).lines, ['a   b','    c']);
  assert.equal(TextImport.layout('a\tb', {tabSize:8}, font).columns, 9);
});

test('ASCII punctuation, backslashes and literal markup become pen paths only', () => {
  const text = Array.from({length:95}, (_,i) => String.fromCharCode(i+32)).join('');
  const result = TextImport.layout(text, {}, font);
  assert.ok(result.paths.length > 100);
  assert.equal(result.columns, 95);
  assert.deepEqual(new Set(result.colours), new Set(['#000000']));
  const exported = TextImport.svg(TextImport.layout('<script>&"\\', {}, font));
  assert.ok(!exported.includes('<text'));
  assert.ok(!exported.includes('<script'));
  assert.match(exported, /<path d="M/);
});

test('rejects empty input, unsupported characters and control codes without substitution', () => {
  for (const text of ['', '  \n\t', '😀', 'A\x00B', 'A\x1bB', 'A\x7fB', 'A\u2028B'])
    assert.throws(() => TextImport.layout(text, {}, font));
  assert.throws(() => TextImport.layout('A😀', {}, font), /U\+1F600/);
});

test('text, grid, settings and path complexity have explicit limits', () => {
  for(const options of [{cellWidth:0},{lineHeight:NaN},{cellWidth:41},{tabSize:1.5},{tabSize:17}])
    assert.throws(() => TextImport.layout('hi',options,font));
  for(const text of ['a'.repeat(50001),'a'.repeat(2001),'a\n'.repeat(1001)])
    assert.throws(() => TextImport.layout(text,{},font), /large|long|limit|lines|columns/);
  const complex = {...font,glyphs:{...font.glyphs,A:{...font.glyphs.A,paths:[Array.from({length:240001},()=>[0,0])]}}};
  assert.throws(() => TextImport.layout('A', {}, complex), /complex/);
});

test('cell size changes coordinates and every glyph stays inside its own cell', () => {
  const text = '|\\_/ WMi\n[]{}~`.,;:!?';
  const a = TextImport.layout(text,{cellWidth:3,lineHeight:5},font);
  const b = TextImport.layout(text,{cellWidth:6,lineHeight:10},font);
  assert.deepEqual(b.paths, a.paths.map(p=>p.map(([x,y])=>[x*2,y*2])));
  for (const path of a.paths) for (const [x,y] of path) {
    assert.ok(x>=0 && x<=a.width && y>=0 && y<=a.height);
  }
});

test('UTF-8, UTF-8 BOM and UTF-16 BOMs decode, corrupt text is rejected', () => {
  assert.equal(TextImport.decode(new TextEncoder().encode('\ufeffCafé\r\n')), 'Café\r\n');
  assert.equal(TextImport.decode(Uint8Array.from([255,254,65,0,10,0,66,0])), 'A\nB');
  assert.equal(TextImport.decode(Uint8Array.from([254,255,0,65,0,10,0,66])), 'A\nB');
  assert.throws(() => TextImport.decode(Uint8Array.from([195,40])), /UTF/);
  assert.throws(() => TextImport.decode(new Uint8Array(2*1024*1024+1)), /large/);
});

test('drawing detection keeps Studio G-code .txt files and explicit G-code extensions', () => {
  assert.equal(TextImport.kind('House.txt','   /\\\n  |__|'),'text');
  assert.equal(TextImport.kind('words.txt','Gordon\nA house'),'text');
  assert.equal(TextImport.kind('drawing.txt','; a comment\nG21\nG90 G1 Z0.5 F1200'),'gcode');
  assert.equal(TextImport.kind('drawing.txt','\ufeffG1 X10 Y20'),'gcode');
  assert.equal(TextImport.kind('bad.gcode','not a command'),'gcode');
  assert.equal(TextImport.kind('shape.txt','<svg xmlns="http://www.w3.org/2000/svg"/>'),'svg');
});

test('paths fit the selected page and produce the existing pen-up G-code sequence', () => {
  const result = TextImport.layout('  /\\\n /__\\\n |  |\n |__|', {}, font);
  const source = Object.assign(result.paths,{width:result.width,height:result.height});
  for(const rotation of [0,90,180,270]){
    const paths = SVG.placePaths(source,{width:105,height:148,margin:10,rotation});
    for(const [x,y] of paths.flat()) assert.ok(x>=10-1e-6 && x<=95+1e-6 && y>=10-1e-6 && y<=138+1e-6);
    const gcode=SVG.makeColourGcode(paths,result.colours);
    assert.match(gcode, /^G21\nG90 G1 Z0.5 F1200\n; PEN_CHANGE #000000\n/);
    assert.ok(gcode.endsWith('G90 G1 X0 Y0 F2400\n'));
  }
});
