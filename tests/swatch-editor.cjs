const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const fonts = require('../assets/postcard-fonts.json');
const stock = require('../assets/pens.json').filter(p=>p.brand.includes('Sharpie'));

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

function surface() {
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

test('swatch panel prepares a complete set or one pen, retains sheet selection, and omits unavailable pens', async () => {
  const {context,get,listeners}=surface();
  let catalogue={pens:structuredClone(stock)}, prepared=[];
  context.PersonalCatalogue={data:catalogue,ready:Promise.resolve(catalogue)};
  context.fetch=async()=>({ok:true,json:async()=>fonts});
  context.PlotterSwatches={load:async sheet=>prepared.push(sheet)};
  get('swatch-size').value='20';get('swatch-spacing').value='.3';
  vm.runInNewContext(fs.readFileSync('assets/swatch-editor.js','utf8'),context);
  for(let i=0;i<30;i++)await Promise.resolve();
  const editor=context.SwatchEditor;
  assert.equal(editor.plan.count,24);
  assert.equal(get('swatch-key').children.length,24);
  assert.equal(get('swatch-prepare').disabled,true);
  editor.setPlotAvailability(true);await editor.prepare();
  assert.equal(prepared[0].entries.length,24);
  editor.selectPen(stock[3]);assert.equal(editor.plan.count,1);
  assert.equal(prepared.length,1,'preview changes must not replace the loaded job');
  get('swatch-pen').value='';get('swatch-size').value='30';editor.update();
  get('swatch-sheet').value='1';editor.render();await editor.prepare();
  assert.equal(prepared.at(-1).number,2);
  assert.equal(prepared.at(-1).entries.length,4);
  catalogue.pens[0].available=false;listeners['catalogue-changed']({detail:catalogue});
  assert.equal(editor.plan.count,23);
  assert.equal(prepared.length,2);
  get('swatch-spacing').value='0';editor.update();
  assert.equal(get('swatch-prepare').disabled,true);
  assert.equal(get('swatch-download').disabled,true);
  assert.match(get('swatch-error').textContent,/spacing/);
});

test('RGB and HEX stay synchronised and save the reading to the same physical pen', async () => {
  const {context,get}=surface();
  let catalogue={pens:[structuredClone(stock[0])],themes:[],revision:'one'}, saved;
  get('stock-availability').value='all';
  context.fetch=async(url,options)=>{
    if(options.body){saved=JSON.parse(options.body);catalogue={...catalogue,pens:[saved.item],revision:'two'};}
    return {ok:true,json:async()=>catalogue};
  };
  vm.runInNewContext(fs.readFileSync('assets/catalogue.js','utf8'),context);
  const editor=context.PersonalCatalogue;await editor.ready;
  editor.editPen(catalogue.pens[0]);
  get('pen-red').value='0';get('pen-green').value='128';get('pen-blue').value='255';
  get('pen-blue').oninput();assert.equal(get('pen-ink-hex').value,'#0080ff');
  await editor.savePen();
  assert.equal(saved.item.id,stock[0].id);assert.equal(saved.item.ink,'#0080ff');
  assert.equal(saved.revision,'one');
  editor.editPen(catalogue.pens[0]);get('pen-ink-hex').value='#123456';get('pen-ink-hex').oninput();
  assert.deepEqual(['pen-red','pen-green','pen-blue'].map(id=>get(id).value),[18,52,86]);
  get('pen-red').value='256';get('pen-red').oninput();
  await assert.rejects(editor.savePen(),/RGB/);
  assert.equal(catalogue.pens[0].ink,'#0080ff');
});
