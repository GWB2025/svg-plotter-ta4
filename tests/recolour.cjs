const {test}=require('node:test');
const assert=require('node:assert/strict');
const {recolour}=require('../assets/recolour.js');
const inventory=require('../assets/pens.json');
const paths=[[[10,10],[20,20]],[[30,30],[40,40]],[[15,15],[25,25]]];
const source={paths,colours:['#df7b28','#a97850','#493126']};
test('Brubeck replaces Kyoto inks and preserves every coordinate',()=>{
 const result=recolour(source,['blue-05','red-05','black-05'],inventory);
 assert.deepEqual(result.paths,paths);
 assert.deepEqual(result.colours,['#2685bd','#c93f55','#000000']);
 assert.equal(result.pens['#000000'],'black-05');
 assert.deepEqual(source.colours,['#df7b28','#a97850','#493126']);
});
test('a single-pen theme and subsequent colour theme retain original groups',()=>{
 assert.equal(new Set(recolour(source,['dark-brown-05'],inventory).colours).size,1);
 assert.equal(new Set(recolour(source,['blue-05','red-05','black-05'],inventory).colours).size,3);
});
test('unknown pens and inconsistent drawing metadata are rejected',()=>{
 assert.throws(()=>recolour(source,['missing'],inventory));
 assert.throws(()=>recolour({paths,colours:[]},['black-05'],inventory));
});

test('every theme exports its assigned pens without changing geometry',()=>{
 const themes=require('../assets/themes.js');
 const {makeColourGcode}=require('../assets/svg-import.js');
 for(const theme of themes){
  const result=recolour(source,theme.pens,inventory);
  assert.deepEqual(result.paths,source.paths,theme.name);
  const gcode=makeColourGcode(result.paths,result.colours,result.pens);
  for(const [colour,id] of Object.entries(result.pens)){
   assert.ok(gcode.includes('; PEN_CHANGE '+colour+' '+id),theme.name+' '+id);
  }
 }
});
