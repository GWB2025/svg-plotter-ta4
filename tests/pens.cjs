const {test}=require('node:test');
const assert=require('node:assert/strict');
const pens=require('../assets/pens.js');
const inventory=require('../assets/pens.json');
const {makeColourGcode}=require('../assets/svg-import.js');

test('postcard colours select the available Kyoto pens',()=>{
 assert.equal(pens.suggest('#df7b28',inventory),'orange-05');
 assert.equal(pens.suggest('#a97850',inventory),'light-brown-05');
 assert.equal(pens.suggest('#493126',inventory),'dark-brown-05');
 assert.equal(pens.suggest('#000000',inventory),'black-05');
 assert.equal(pens.suggest('#abcdef',inventory),'');
});
test('selected black size is retained in exported pen marker',()=>{
 const g=makeColourGcode([[[20,20],[30,30]]],['#000000'],{'#000000':'black-003'});
 assert.ok(g.includes('; PEN_CHANGE #000000 black-003\n'));
 assert.throws(()=>makeColourGcode([[[20,20],[30,30]]],['#000000'],{'#000000':'bad\nG1'}));
});

test('all added pen families have distinct labels and stable references', () => {
 const pens=require('../assets/pens.json');
 const {label}=require('../assets/pens.js');
 assert.equal(pens.length,29);
 assert.equal(pens.filter(p=>p.brand==='Stabilo Point 88 fine').length,7);
 assert.equal(pens.filter(p=>p.brand==='Uni-ball Eye UB-157E').length,3);
 const yellow=pens.find(p=>p.id==='stabilo-point88-yellow');
 assert.match(label(yellow),/Stabilo.*Yellow.*0.4 mm.*88\/44/);
 assert.match(label(pens.find(p=>p.id==='uniball-eye-black')),/Uni-ball.*315156/);
});
