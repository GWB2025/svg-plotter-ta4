const {test} = require('node:test');
const assert = require('node:assert/strict');
const Swatches = require('../assets/pen-swatches.js');
const {rgbToHex, hexToRgb} = require('../assets/pens.js');
const pens = require('../assets/pens.json');
const font = require('../assets/postcard-fonts.json')[0];
const sharpies = pens.filter(p => p.set === 'Sharpie Glam Pop · 24');

test('all 24 Sharpies fit on one labelled A4 sheet with clear 20 mm scan patches', () => {
  const before = JSON.stringify(sharpies);
  const plan = Swatches.create(sharpies, {}, font);
  assert.equal(plan.sheets.length, 1);
  assert.equal(plan.sheets[0].entries.length, 24);
  assert.equal(JSON.stringify(sharpies), before);
  for (const [i,entry] of plan.sheets[0].entries.entries()) {
    assert.equal(entry.pen.id, sharpies[i].id);
    assert.equal(entry.number, i+1);
    assert.equal(entry.patch.size, 20);
    assert.ok(entry.labelLines.join(' ').includes(entry.pen.colour));
    assert.ok(entry.labelPaths.length > 0);
    for (const path of entry.labelPaths) for (const [x,y] of path)
      assert.ok(y > entry.patch.y + 20, 'no label enters the scan patch');
    for (const path of entry.paths) for (const [x,y] of path)
      assert.ok(x >= 12 && x <= 198 && y >= 12 && y <= 285, 'inside bed margins');
  }
  const patches = plan.sheets[0].entries.map(e => e.patch);
  for (const [i,a] of patches.entries()) for (const b of patches.slice(i+1))
    assert.ok(a.x+a.size < b.x || b.x+b.size < a.x || a.y+a.size < b.y || b.y+b.size < a.y);
});

test('one pen and multi-sheet sets retain stable identities and sequence numbers', () => {
  assert.equal(Swatches.create([sharpies[3]], {}, font).sheets[0].entries[0].pen.id, sharpies[3].id);
  const many = Array.from({length:53}, (_,i) => ({...sharpies[0],id:'test-'+i}));
  const plan = Swatches.create(many, {}, font);
  assert.equal(plan.sheets.length, 3);
  assert.deepEqual(plan.sheets.flatMap(s=>s.entries.map(e=>e.number)), many.map((_,i)=>i+1));
  assert.equal(Swatches.create(sharpies, {size:30}, font).sheets.length, 2);
});

test('dense serpentine filling stays inside each patch and cross-hatching adds a perpendicular pass', () => {
  const entry = Swatches.create([sharpies[0]], {spacing:.25,crossHatch:true}, font).sheets[0].entries[0];
  assert.equal(entry.fillPaths.length, 2);
  const {x,y,size} = entry.patch;
  for (const path of entry.fillPaths) for (const [px,py] of path)
    assert.ok(px>=x && px<=x+size && py>=y && py<=y+size);
  const rows = [...new Set(entry.fillPaths[0].map(p=>p[1]))];
  assert.equal(rows.length, 80);
  assert.ok(Math.abs(rows[1]-rows[0]-.25)<1e-8);
  assert.equal(entry.fillPaths[0][0][1], entry.fillPaths[0][1][1]);
  assert.equal(entry.fillPaths[1][0][0], entry.fillPaths[1][1][0]);
  const fine = Swatches.create([sharpies[0]], {spacing:.02}, font).sheets[0].entries[0];
  assert.equal(fine.fillPaths[0].length, 2000, 'very fine pens can cover a patch without white gaps');
});

test('distinct physical pens with identical RGB values get separate parked pen changes', () => {
  const same = sharpies.slice(0,2).map(p=>({...p,ink:'#112233'}));
  const sheet = Swatches.create(same, {}, font).sheets[0];
  const gcode = Swatches.gcode(sheet);
  assert.ok(gcode.startsWith('; SWATCH_SHEET v1\nG21\nG90 G1 Z0.5 F1200\n'));
  assert.deepEqual([...gcode.matchAll(/^; PEN_CHANGE (#[0-9a-f]{6}) ([a-z0-9-]+)$/gm)].map(m=>m[2]), same.map(p=>p.id));
  assert.ok(gcode.includes('G90 G1 X0 Y0 F2400\n; PEN_CHANGE #112233 '+same[1].id));
  assert.ok(gcode.endsWith('G90 G1 Z0.5 F3000\nG90 G1 X0 Y0 F2400\n'));
});

test('invalid settings or unavailable pens never produce a plotting job', () => {
  for (const options of [{size:5},{size:31},{size:NaN},{spacing:0},{spacing:.01},{spacing:2},{spacing:NaN}])
    assert.throws(()=>Swatches.create(sharpies, options, font));
  assert.throws(()=>Swatches.create([], {}, font));
  assert.throws(()=>Swatches.create([{...sharpies[0],available:false}], {}, font), /unavailable/i);
  assert.throws(()=>Swatches.create([{...sharpies[0],id:'bad; G1'}], {}, font));
  assert.throws(()=>Swatches.create([sharpies[0],sharpies[0]], {}, font), /duplicate/i);
});

test('long or non-Latin names keep labels inside the cell and preserve the full on-screen identity', () => {
  const pen = {...sharpies[0],colour:'Very long custom pen name '.repeat(4)+'墨',reference:'Ref '.repeat(30)};
  const entry = Swatches.create([pen], {}, font).sheets[0].entries[0];
  assert.equal(entry.pen.colour, pen.colour);
  for (const path of [...entry.fillPaths,...entry.labelPaths]) for (const [x,y] of path) assert.ok(x>=12&&x<=58.5&&y<70);
});

test('RGB entry converts exactly to the saved six-digit HEX ink colour', () => {
  assert.equal(rgbToHex(['0','128','255']), '#0080ff');
  assert.deepEqual(hexToRgb('#12ABff'), [18,171,255]);
  for (const rgb of [[-1,0,0],[256,0,0],[1.5,0,0],['',0,0],[NaN,0,0],[1,2]])
    assert.throws(()=>rgbToHex(rgb), /RGB/);
  assert.throws(()=>hexToRgb('#fff'), /HEX/);
});
