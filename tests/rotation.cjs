const {test} = require('node:test');
const assert = require('node:assert/strict');
const {placePaths, makeColourGcode, layeredPaths} = require('../assets/svg-import.js');

function drawing(paths, width = 297, height = 210) {
  return Object.assign(paths, {width, height, colours: ['#ff0000', '#0000ff']});
}

test('90 degree clockwise rotation fits landscape A4 at actual size with margins intact', () => {
  const source = drawing([[[10,20],[287,20]], [[287,190],[10,190]]]);
  const before = structuredClone(source);
  assert.throws(() => placePaths(source, {mode:'actual'}), /beyond/);
  const result = placePaths(source, {mode:'actual',rotation:90});
  assert.deepEqual(result, [[[190,10],[190,287]], [[20,287],[20,10]]]);
  assert.deepEqual(source, before);
  const gcode = makeColourGcode(result, source.colours, {'#ff0000':'red-pen'});
  assert.ok(gcode.includes('; PEN_CHANGE #ff0000 red-pen'));
  assert.ok(gcode.includes('X190.0000 Y-287.0000'));
  assert.ok(gcode.includes('X20.0000 Y-10.0000'));
  assert.ok(gcode.indexOf('#ff0000') < gcode.indexOf('#0000ff'));
});

test('quarter turns use the original SVG viewport and a full turn restores coordinates', () => {
  const source = drawing([[[10,5],[90,45]]], 100, 50);
  for (const [rotation, expected] of [
    [90, [[[45,10],[5,90]]]],
    [180, [[[90,45],[10,5]]]],
    [270, [[[5,90],[45,10]]]],
    [360, [[[10,5],[90,45]]]],
    [0, [[[10,5],[90,45]]]],
  ]) assert.deepEqual(Array.from(placePaths(source, {mode:'actual',rotation})), expected);
});

test('fitting happens after rotation and preserves aspect ratio', () => {
  const source = drawing([[[10,5],[90,45]]], 100, 50);
  assert.deepEqual(placePaths(source, {rotation:90, width:105, height:148, margin:10}),
    [[[84.5,10],[20.5,138]]]);
});

test('rotation validates angles, viewport size and the final physical page', () => {
  const source = drawing([[[0,0],[297,210]]]);
  for (const rotation of [45, NaN, Infinity])
    assert.throws(() => placePaths(source, {mode:'actual', rotation}), /rotation/i);
  assert.throws(() => placePaths(source, {mode:'actual',rotation:90,width:105,height:148}), /beyond/);
  assert.throws(() => placePaths(drawing([[[0,0],[10,10]]], NaN), {rotation:90}), /dimensions/i);
  assert.deepEqual(placePaths(source, {mode:'actual',rotation:90}), [[[210,0],[0,297]]]);
});

test('fractional zero-margin fitting exports at bed edges without floating-point overflow', () => {
  const source = drawing([[[2/7,2/9],[123.4,98.7]]], 150, 120);
  for (const rotation of [0,90,180,270])
    assert.doesNotThrow(() => makeColourGcode(placePaths(source, {rotation,margin:0}), ['#ff0000']));
  assert.throws(() => placePaths([[[0,0],[210.001,297]]], {mode:'actual'}), /beyond/);
  assert.throws(() => placePaths([[[-.001,0],[210,297]]], {mode:'actual'}), /beyond/);
});

test('layered rendering uses the same rotated placement as outline paths', async () => {
  const source = drawing([[[10,5],[90,45]]], 100, 50);
  source.paintSvg = '<svg/>'; source.paintColours = ['#ff0000'];
  let matrix;
  const context = {
    setTransform: (...values) => { matrix = values; },
    drawImage: () => {},
    getImageData: () => ({width:1, height:10, data:new Uint8ClampedArray(Array.from({length:10}, () => [255,0,0,255]).flat())}),
  };
  global.document = {createElement: () => ({getContext: () => context})};
  global.Image = class { set src(value) { this.onload(); } };
  try {
    for (const rotation of [0,90,180,270]) {
      const options = {rotation, width:105, height:148, margin:10};
      await layeredPaths(source, options);
      const [a,b,c,d,e,f] = matrix.map(value => value / 10);
      const actual = source.map(path => path.map(([x,y]) => [a*x+c*y+e,b*x+d*y+f]));
      assert.deepEqual(actual, placePaths(source, options));
    }
  } finally { delete global.document; delete global.Image; }
});
