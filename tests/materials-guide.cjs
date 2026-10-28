const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');

test('materials search combines words and category, handles no matches and clear',()=>{
  const source=fs.readFileSync('assets/materials-guide.js','utf8');
  const cards=[
    {dataset:{category:'Pen'},textContent:'Sakura Pigma Micron Smooth Bristol fibre tip'},
    {dataset:{category:'Pen'},textContent:'Rotring Isograph refillable metal nib textured paper'},
    {dataset:{category:'Paper'},textContent:'Bristol Paper Smooth paper for fibre tip pens'}
  ];
  const fields=Object.fromEntries(['materials-search','materials-category','materials-count','materials-empty','materials-clear'].map(id=>[id,{value:'',hidden:true}]));
  const document={getElementById:id=>fields[id],querySelectorAll:()=>cards};
  vm.runInNewContext(source,{document});
  assert.ok(cards.every(c=>!c.hidden));
  fields['materials-search'].value=' BRISTOL  smooth ';
  fields['materials-search'].oninput();
  assert.deepEqual(cards.map(c=>c.hidden),[false,true,false]);
  fields['materials-category'].value='Paper';fields['materials-category'].onchange();
  assert.deepEqual(cards.map(c=>c.hidden),[true,true,false]);
  assert.equal(fields['materials-count'].textContent,'1 of 3 materials shown');
  fields['materials-search'].value='missing';fields['materials-search'].oninput();
  assert.equal(fields['materials-empty'].hidden,false);
  fields['materials-clear'].onclick();
  assert.ok(cards.every(c=>!c.hidden));
  assert.equal(fields['materials-search'].value,'');
  assert.equal(fields['materials-category'].value,'');
  assert.equal(fields['materials-empty'].hidden,true);
});

test('materials tab joins the keyboard navigation without catalogue writes',()=>{
  const ids=['plot','text','postcard','themes','stock','inks','materials'];
  const fields={};let focused;
  for(const id of ids){
    fields[id+'-panel']={hidden:id!=='plot'};
    fields[id+'-tab']={getAttribute:()=>id+'-panel',setAttribute(k,v){this[k]=v;},focus(){focused=id;}};
  }
  fields['theme-restore']={};
  const document={getElementById:id=>fields[id],addEventListener:()=>{}};
  const window={PersonalCatalogue:{ready:new Promise(()=>{})}};
  vm.runInNewContext(fs.readFileSync('assets/themes.js','utf8'),{document,window});
  fields['inks-tab'].onkeydown({key:'ArrowRight',preventDefault(){}});
  assert.equal(focused,'materials');assert.equal(fields['materials-panel'].hidden,false);
  assert.ok(ids.slice(0,-1).every(id=>fields[id+'-panel'].hidden));
  fields['materials-tab'].onkeydown({key:'ArrowRight',preventDefault(){}});
  assert.equal(focused,'plot');assert.equal(fields['materials-panel'].hidden,true);
});
