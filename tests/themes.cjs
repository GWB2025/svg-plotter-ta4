const {test}=require('node:test');
const assert=require('node:assert/strict');
const themes=require('../assets/themes.js');
const pens=require('../assets/pens.json');

test('each theme refers only to pens Gordon owns',()=>{
 const ids=new Set(pens.map(p=>p.id));
 assert.equal(themes.length,9);
 for(const theme of themes){
  assert.ok(theme.swatches.length>=2,theme.name);
  assert.ok(theme.pens.every(id=>ids.has(id)),theme.name);
 }
});
