const {test}=require('node:test');
const assert=require('node:assert/strict');
const pens=require('../assets/pens.js');
const inventory=require('../assets/pens.json');
const {makeColourGcode}=require('../assets/svg-import.js');

test('unavailable stock is never suggested, and a new custom ink is recognised',()=>{
 const pen={id:'custom',colour:'Teal',brand:'Test',size:'Fine',ink:'#128080',matches:[]};
 assert.equal(pens.suggest('#128080',[pen]),'custom');
 assert.equal(pens.suggest('#128080',[{...pen,available:false}]),'');
 assert.equal(pens.label(pen),'Test Teal Fine');
});

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
 assert.equal(pens.length,53);
 assert.equal(new Set(pens.map(p=>p.id)).size,pens.length);
 assert.equal(pens.filter(p=>p.brand==='Sharpie Glam Pop').length,24);
 assert.equal(pens.filter(p=>p.brand==='Stabilo Point 88 fine').length,7);
 assert.equal(pens.filter(p=>p.brand==='Uni-ball Eye UB-157E').length,3);
 const yellow=pens.find(p=>p.id==='stabilo-point88-yellow');
 assert.match(label(yellow),/Stabilo.*Yellow.*0.4 mm.*88\/44/);
 assert.match(label(pens.find(p=>p.id==='uniball-eye-black')),/Uni-ball.*315156/);
});
