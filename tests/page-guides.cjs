const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {create} = require('../assets/page-guides.js');
const {placePaths, makeColourGcode} = require('../assets/svg-import.js');

const sizes = [[210,297], [148,210], [105,148], [148,105],
  [114,162], [110,220], [162,229]];

test('every stock guide marks the exact corners, edge centres and centre', () => {
  for (const [width,height] of [...sizes, [123.4,176.8], [1,1]]) {
    const guide = create({width,height});
    const points = guide.paths.flat();
    for (const point of [[0,0],[width,0],[width,height],[0,height],
      [width/2,0],[width/2,height],[0,height/2],[width,height/2]]) {
      assert.ok(points.some(p => p[0] === point[0] && p[1] === point[1]));
    }
    const horizontal = guide.paths.find(p => p.length === 2 &&
      p[0][1] === height/2 && p[1][1] === height/2 &&
      p[0][0] < width/2 && p[1][0] > width/2);
    const vertical = guide.paths.find(p => p.length === 2 &&
      p[0][0] === width/2 && p[1][0] === width/2 &&
      p[0][1] < height/2 && p[1][1] > height/2);
    assert.ok(horizontal && vertical, 'centre cross');
    assert.ok(points.every(([x,y]) => x >= 0 && y >= 0 && x <= width && y <= height));
    assert.equal(guide.paths.length, 10, 'separate marks, no joining diagonals');
    assert.deepEqual(placePaths(guide.paths, {width,height,mode:'actual'}), guide.paths);
    const gcode = makeColourGcode(guide.paths, guide.paths.colours);
    assert.equal((gcode.match(/; PEN_CHANGE/g) || []).length, 1);
    assert.ok(gcode.endsWith('G90 G1 X0 Y0 F2400\n'));
  }
});

test('invalid stock dimensions are rejected before creating plotting paths', () => {
  for (const options of [{width:211,height:297}, {width:210,height:298},
    {width:0,height:100}, {width:100,height:-1}, {width:NaN,height:100},
    {width:100,height:Infinity}, {width:.5,height:100}]) {
    assert.throws(() => create(options), /1 mm|210 × 297/);
  }
});

test('bundled guide SVGs match generated millimetre geometry', () => {
  for (const [width,height] of sizes) {
    const guide = create({width,height});
    assert.equal(fs.readFileSync('examples/guides/' + guide.name, 'utf8'), guide.svg);
    assert.ok(guide.svg.includes(`width="${width}mm" height="${height}mm"`));
    assert.ok(guide.svg.includes(`viewBox="0 0 ${width} ${height}"`));
    assert.ok(guide.svg.includes('data-plotter-guide="stock-v1"'));
    assert.ok(!guide.svg.includes('<text'), 'all plotted content is paths');
  }
});
