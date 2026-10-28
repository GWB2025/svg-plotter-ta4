const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
class Element {
  constructor() { this.value='';this.checked=false;this.disabled=false;this.children=[];this.dataset={};this.style={}; }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children=children; }
  setAttribute(key,value) { this[key]=value; }
  removeAttribute(key) { delete this[key]; }
  querySelector() { return new Element(); }
  addEventListener() {}
  scrollIntoView() {}
  focus() {}
  showModal() { this.open=true; }
  close() { this.open=false; }
}

function makeSurface() {
  const html=fs.readFileSync('docs/catalogue-panels.html','utf8')+fs.readFileSync('docs/plotting.html','utf8');
  const elements=new Map([...html.matchAll(/id="([^"]+)"/g)].map(m=>[m[1],new Element()]));
  const get=id=>{assert.ok(elements.has(id),'Missing UI element '+id);return elements.get(id);};
  const listeners={};
  const document={getElementById:get,querySelector:()=>({content:'test'}),querySelectorAll:()=>[],
    createElement:()=>new Element(),createElementNS:()=>new Element(),body:new Element(),
    addEventListener:(name,handler)=>{listeners[name]=handler;},
    dispatchEvent:event=>listeners[event.type]?.(event)};
  const context={document,structuredClone,AbortSignal,PenInventory:require('../assets/pens.js'),
    CustomEvent:class {constructor(type,options){this.type=type;this.detail=options.detail;}},
    setTimeout:()=>{},PenSwatches:require('../assets/pen-swatches.js')};
  context.window=context;
  return {context,get,listeners};
}


async function editorSurface() {
  const surface=makeSurface();
  const {context,get}=surface;
  let data={pens:[{id:'pen-one',brand:'Refillable pen',colour:'Blue',size:'Fine',ink:'#001188',set:'My pens'}],inks:[],themes:[],revision:0};
  const calls=[];
  get('stock-availability').value='all';get('inks-availability').value='all';
  context.fetch=async(url,options)=>{
    if(options.body){
      const body=JSON.parse(options.body);calls.push(body);
      const field=body.action==='save_ink'?'inks':'pens';
      const item={...body.item,id:body.item.id||'ink-new'};
      data={...data,[field]:[...data[field].filter(i=>i.id!==item.id),item],revision:data.revision+1};
    }
    return {ok:true,json:async()=>data};
  };
  vm.runInNewContext(fs.readFileSync('assets/catalogue.js','utf8'),context);
  vm.runInNewContext(fs.readFileSync('assets/ink-stock.js','utf8'),context);
  await context.PersonalCatalogue.ready;await Promise.resolve();
  return {...surface,calls,catalogue:context.PersonalCatalogue,editor:context.InkStock};
}

test('ink editor creates, edits and duplicates bottles with RGB, notes and availability',async()=>{
  const {get,calls,catalogue,editor}=await editorSurface();
  get('ink-add').onclick();
  get('bottle-brand').value='Example';get('bottle-colour').value='Teal';
  get('bottle-kind').value='Fountain pen ink';get('bottle-paper').value='Bristol';
  get('bottle-notes').value='Dry sample';
  for(const [id,value] of [['red','18'],['green','128'],['blue','128']])get('bottle-'+id).value=value;
  get('bottle-blue').oninput();assert.equal(get('bottle-ink-hex').value,'#128080');
  await editor.save();
  assert.equal(calls[0].action,'save_ink');assert.equal(calls[0].revision,0);
  assert.equal(catalogue.data.inks[0].ink,'#128080');
  assert.equal(catalogue.data.inks[0].paper,'Bristol');
  assert.equal(get('ink-editor').open,false);
  editor.edit(catalogue.data.inks[0]);get('bottle-ink-hex').value='#abcdef';get('bottle-ink-hex').oninput();
  assert.deepEqual(['red','green','blue'].map(id=>get('bottle-'+id).value),[171,205,239]);
  get('bottle-available').checked=false;await editor.save();
  assert.equal(calls[1].item.id,'ink-new');assert.equal(calls[1].item.available,false);
  editor.edit(catalogue.data.inks[0],true);assert.equal(editor.item.id,undefined);
  get('bottle-red').value='256';get('bottle-red').oninput();
  await assert.rejects(editor.save(),/RGB/);assert.equal(calls.length,2);
});

test('linking a bottle preserves a pen reading until explicitly copied, and can be removed',async()=>{
  const {get,calls,catalogue,editor,context}=await editorSurface();
  const ink={id:'bottle',brand:'Example',colour:'Teal',ink:'#128080',kind:'Fountain pen ink',available:true};
  catalogue.publish({...catalogue.data,inks:[ink]});
  catalogue.editPen(catalogue.data.pens[0]);
  get('pen-bottle').value='bottle';get('pen-bottle').onchange();
  assert.equal(get('pen-ink-hex').value,'#001188');
  get('pen-copy-ink').onclick();assert.equal(get('pen-ink-hex').value,'#128080');
  await catalogue.savePen();assert.equal(calls[0].item.ink_id,'bottle');assert.equal(calls[0].item.ink,'#128080');
  assert.equal(context.PenInventory.label({...catalogue.data.pens[0],ink_name:'Example Teal'}).includes('Ink: Example Teal'),true);
  catalogue.publish({...catalogue.data,inks:[ink]});
  catalogue.editPen(catalogue.data.pens[0]);get('pen-bottle').value='';get('pen-bottle').onchange();
  assert.equal(get('pen-copy-ink').disabled,true);
  await catalogue.savePen();assert.equal(calls[1].item.ink_id,null);
  assert.equal(calls[1].item.ink,'#128080');
});

test('ink search and availability work without catalogue writes',async()=>{
  const {get,calls,catalogue}=await editorSurface();
  const inks=[{id:'a',brand:'Example',colour:'Teal',ink:'#128080',kind:'Fountain pen ink',paper:'Bristol',available:true},
    {id:'b',brand:'Example',colour:'Black',ink:'#000000',kind:'Technical drawing ink',available:false}];
  catalogue.publish({...catalogue.data,inks});
  assert.equal(get('inks-rows').children.length,2);
  get('inks-search').value='bristol teal';get('inks-search').oninput();
  assert.equal(get('inks-rows').children.length,1);
  get('inks-availability').value='unavailable';get('inks-availability').onchange();
  assert.equal(get('inks-rows').children.length,0);assert.equal(get('inks-empty').hidden,false);
  assert.equal(calls.length,0);
});

test('import preview accepts old and new backups and rejects missing ink records',async()=>{
  const {get,catalogue}=await editorSurface();
  for(const schema of [1,2]){
    const backup={format:'svg-plotter-catalogue',schema,pens:[],themes:[],...(schema===2?{inks:[{id:'sample'}]}:{})};
    get('inks-import').files=[{name:'backup.json',size:100,text:async()=>JSON.stringify(backup)}];
    await catalogue.readImport('inks-import');
    assert.equal(get('import-editor').open,true);
    assert.match(get('import-summary').textContent,schema===2?/1 inks/:/0 inks/);
    assert.equal(catalogue.importData.schema,schema);
    get('import-editor').close();
  }
  get('inks-import').files=[{name:'bad.json',size:100,text:async()=>JSON.stringify({format:'svg-plotter-catalogue',schema:2,pens:[],themes:[]})}];
  await catalogue.readImport('inks-import');
  assert.equal(get('import-editor').open,false);
  assert.match(get('inks-error').textContent,/backup/);
});
