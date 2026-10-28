const {test} = require('node:test');
const assert = require('node:assert/strict');
const {paintPaths, CanvasPreview} = require('../assets/preview.js');

class RecordingContext {
  constructor() { this.operations = []; }
  record(name, args) { this.operations.push([name, ...args]); }
  beginPath(...args) { this.record('begin', args); }
  moveTo(...args) { this.record('move', args); }
  lineTo(...args) { this.record('line', args); }
  arc(...args) { this.record('dot', args); }
  stroke() { this.record('stroke', [this.strokeStyle]); }
  fill() { this.record('fill', [this.fillStyle]); }
  setTransform(...args) { this.record('scale', args); }
  setLineDash(...args) { this.record('dash', args); }
}

function canvas() {
  const context = new RecordingContext();
  return {context, width:0, height:0, clientWidth:600, hidden:false,
    getContext: () => context};
}

test('preview keeps separate strokes, colours, dots and source coordinates', async () => {
  const ctx = new RecordingContext();
  const paths = [[[1,2],[3,4]], [[5,6],[7,8]], [[9,10]], [[11,12],[11,12]]];
  const before = JSON.stringify(paths);
  await paintPaths(ctx, paths, ['#ff0000','#0000ff','#0000ff','#0000ff']);
  assert.deepEqual(ctx.operations.filter(p => p[0] === 'line'), [['line',3,4],['line',7,8]]);
  assert.deepEqual(ctx.operations.filter(p => p[0] === 'stroke').map(p => p[1]), ['#ff0000','#0000ff']);
  assert.deepEqual(ctx.operations.filter(p => p[0] === 'dot').map(p => p.slice(1,4)), [[9,10,.15],[11,12,.15]]);
  assert.equal(JSON.stringify(paths), before);
});

test('large previews yield to scrolling, including a single long stroke', async () => {
  for (const paths of [Array.from({length:40000}, (_,i) => [[i,0],[i,1]]),
                      [Array.from({length:80000}, (_,i) => [i,0])]]) {
    const ctx = new RecordingContext();
    let frames = 0, clock = 0;
    await paintPaths(ctx, paths, [], {
      now: () => clock += 10,
      yieldControl: async () => { frames++; },
    });
    assert.ok(frames > 10, 'long work must give the event loop opportunities to run');
    assert.equal(ctx.operations.filter(p => p[0] === 'line').length,
      paths.reduce((n,p) => n + p.length - 1, 0));
  }
});

test('a superseded preview stops at the next batch', async () => {
  const ctx = new RecordingContext();
  let current = true, clock = 0;
  const paths = Array.from({length:10000}, () => [[0,0],[1,1]]);
  await paintPaths(ctx, paths, [], {
    now: () => clock += 10,
    isCurrent: () => current,
    yieldControl: async () => { current = false; },
  });
  assert.ok(ctx.operations.filter(p => p[0] === 'line').length < paths.length);
});

test('hidden travel is drawn only on demand and reused on subsequent toggles', async () => {
  const ink = canvas(), travel = canvas();
  const preview = new CanvasPreview(ink, travel);
  const job = {paths:[[[10,10],[20,20]]], path_colours:['#ff0000'],
    travel:[[[0,0],[10,10]]]};
  await preview.render(job, {width:148,height:105}, false);
  assert.equal(travel.hidden, true);
  assert.equal(travel.context.operations.filter(p => p[0] === 'line').length, 0);
  await preview.showTravel(true);
  assert.equal(travel.hidden, false);
  assert.equal(travel.context.operations.filter(p => p[0] === 'line').length, 1);
  await preview.showTravel(false);
  await preview.showTravel(true);
  assert.equal(travel.context.operations.filter(p => p[0] === 'line').length, 1);
  assert.ok(Math.abs(ink.width / ink.height - 148 / 105) < .002);
});

test('a new drawing replaces cached travel and clears both layers', async () => {
  const ink = canvas(), travel = canvas();
  const preview = new CanvasPreview(ink, travel);
  await preview.render({paths:[],travel:[[[0,0],[1,1]]]}, {width:210,height:297}, true);
  await preview.render({paths:[],travel:[[[2,2],[3,3]]]}, {width:148,height:105}, false);
  await preview.showTravel(true);
  assert.deepEqual(travel.context.operations.filter(p => p[0] === 'line'), [['line',1,1],['line',3,3]]);
  await preview.render(null, {width:148,height:105}, false);
  assert.equal(travel.hidden, true);
});
