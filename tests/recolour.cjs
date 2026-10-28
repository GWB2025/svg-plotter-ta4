const {test}=require('node:test');
const assert=require('node:assert/strict');
const {recolour}=require('../assets/recolour.js');
const {applyTheme}=require('../assets/recolour.js');
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

test('custom palette maps accents, omits bare paper and explicitly assigns outlines',()=>{
 const theme={slots:[{colour:'#ffffff',pen_id:null},{colour:'#c93f55',pen_id:'red-05'},
                    {colour:'#000000',pen_id:'black-05'}],outline:2};
 const result=applyTheme(source,theme,inventory);
 assert.deepEqual(result.paths,[paths[1],paths[2]]);
 assert.deepEqual(result.colours,['#c93f55','#000000']);
 assert.deepEqual(result.pens,{'#c93f55':'red-05','#000000':'black-05'});
 assert.equal(source.paths.length,3);
});

test('custom stock inks work without changing the theme or source arrays',()=>{
 const custom={id:'custom-teal',colour:'Sea',ink:'#008080',available:true};
 const theme={slots:[{colour:'#336688',pen_id:custom.id}],outline:null};
 assert.deepEqual(applyTheme(source,theme,[custom]).colours,['#008080','#008080','#008080']);
 assert.equal(theme.slots[0].colour,'#336688');
 assert.throws(()=>applyTheme(source,theme,[{...custom,available:false}]),/unavailable/i);
});

test('ambiguous identical ink swatches cannot silently select a different pen',()=>{
 assert.throws(()=>applyTheme(source,{pens:['a','b']},[
  {id:'a',colour:'Black',ink:'#000000'},{id:'b',colour:'Black',ink:'#000000'}]),/same ink/i);
});
