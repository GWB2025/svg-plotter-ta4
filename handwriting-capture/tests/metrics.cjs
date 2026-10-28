const test = require('node:test');
const assert = require('node:assert/strict');
const metrics = require('../static/metrics.js');
const definition = require('../static/characters.json');

test('review keeps descenders and apostrophes at their captured heights', () => {
  const record = {character:'g',coordinates:{baseline:220},strokes:[{points:[{y:120},{y:280}]}]};
  assert.equal(metrics.y(280,record,{scale:.5,shift:10},definition),260);
  record.character="'";
  assert.equal(metrics.y(100,record,{scale:1,shift:0},definition),100);
  record.character='a';
  assert.equal(metrics.y(280,record,{scale:1,shift:0},definition),220);
});
test('next character stays within the selected capture group', () => {
  const group=definition.groups[0];
  assert.equal(metrics.next('e',group),'f');
  assert.equal(metrics.next('z',group),null);
});
