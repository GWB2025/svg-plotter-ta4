const {test} = require('node:test');
const assert = require('node:assert/strict');
const {placePaths, makeGcode} = require('../assets/svg-import.js');

test('fit preserves aspect and centres within 20 mm margins', () => {
  const p = placePaths([[[0, 0], [100, 50]]], {mode: 'fit', margin: 20});
  assert.deepEqual(p, [[[20, 106], [190, 191]]]);
});
test('actual size preserves page coordinates and rejects oversize', () => {
  const p = [[[20, 30], [90, 100]]];
  assert.deepEqual(placePaths(p, {mode: 'actual', margin: 20}), p);
  assert.throws(() => placePaths([[[0, 0], [211, 1]]], {mode: 'actual'}), /A4/);
});
test('rejects invalid points and empty designs', () => {
  assert.throws(() => placePaths([], {}), /drawing/);
  assert.throws(() => placePaths([[[0, 0], [NaN, 1]]], {}), /coordinate/);
});
test('G-code uses verified negative Y, pen lift and final return', () => {
  const g = makeGcode([[[20, 30], [40, 50]]]);
  assert.ok(g.startsWith('G21\nG90 G1 Z0.5 F1200\n'));
  assert.ok(g.includes('G90 G1 X20.0000 Y-30.0000 F2400'));
  assert.ok(g.includes('G90 G1 Z5 F3000'));
  assert.ok(g.endsWith('G90 G1 Z0.5 F3000\nG90 G1 X0 Y0 F2400\n'));
});

test('colour groups preserve shared placement and park between pens', () => {
  const {makeColourGcode} = require('../assets/svg-import.js');
  const paths = [[[20,30],[25,35]], [[80,90],[85,95]], [[40,50],[45,55]]];
  const g = makeColourGcode(paths, ['#ff0000', '#0000ff', '#ff0000']);
  assert.equal((g.match(/; PEN_CHANGE/g)||[]).length, 2);
  assert.ok(g.indexOf('X45.0000') < g.indexOf('; PEN_CHANGE #0000ff'));
  assert.ok(g.includes('G90 G1 Z0.5 F3000\nG90 G1 X0 Y0 F2400\n; PEN_CHANGE #0000ff'));
});


test('pen-change controls require readiness and still permit cancel', () => {
  const {permissions} = require('../assets/plotting.js');
  const state={phase:'pen_change',connected:true,busy:true};
  assert.equal(permissions(state,true,false).continue,false);
  assert.equal(permissions(state,true,true).continue,true);
  assert.equal(permissions(state,true,false).cancel,true);
  assert.equal(permissions(state,true,true).start,false);
});

test('page sizes fit and centre within the chosen sheet', () => {
  for (const [width,height] of [[148,210],[105,148],[148,105],[114,162],[110,220],[162,229],[120,180]]) {
    const paths=placePaths([[[0,0],[100,100]]],{width,height,margin:10});
    const [a,b]=paths[0];
    assert.ok(a[0]>=10 && a[1]>=10 && b[0]<=width-10 && b[1]<=height-10);
    assert.ok(Math.abs(a[0]+b[0]-width)<1e-8);
    assert.ok(Math.abs(a[1]+b[1]-height)<1e-8);
  }
});
test('page validation rejects unsafe sizes, margins and actual-size overflow', () => {
  const p=[[[0,0],[106,100]]];
  for(const options of [{width:0},{width:211},{height:298},{width:NaN},{width:105,height:148,margin:53},{width:105,height:148,mode:'actual'}])
    assert.throws(()=>placePaths(p,options));
});
