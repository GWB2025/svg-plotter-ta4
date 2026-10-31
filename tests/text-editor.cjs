const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const bundled=require('../assets/postcard-fonts.json');

class Element {
  constructor(){this.value='';this.disabled=false;this.checked=false;this.files=[];this.children=[];this.style={};this.textContent='';}
  get valueAsNumber(){return this.value===''?NaN:Number(this.value);}
  append(...children){this.children.push(...children);}
  replaceChildren(...children){this.children=children;}
  setAttribute(key,value){this[key]=value;}
  click(){}
}
async function fixture({broken=false}={}) {
  const html=fs.readFileSync('docs/text-panel.html','utf8');
  const elements=new Map([...html.matchAll(/id="([^"]+)"/g)].map(m=>[m[1],new Element()]));
  const get=id=>{assert.ok(elements.has(id),'Missing '+id);return elements.get(id);};
  for(const [id,value] of Object.entries({'text-cell':'3','text-row':'5','text-tabs':'8','text-size':'12','text-sizing':'fit'}))get(id).value=value;
  get('text-auto-spacing').checked=true;
  const imported={...bundled[1],id:'ttf-existing',name:'Imported Serif Bold',kind:'outline'};
  const subscribers=[],prepared=[],library={fonts:[...bundled,imported],
    load:async()=>({fonts:library.fonts,error:broken?'Saved font library is damaged.':null}),
    subscribe:fn=>subscribers.push(fn),
    importFiles:async()=>{
      library.fonts=[...library.fonts,{...bundled[2],id:'ttf-new',name:'Imported Italic',kind:'outline'}];
      const result={fonts:library.fonts,added:1};subscribers.forEach(fn=>fn(result));return result;
    }};
  const context={document:{getElementById:get,querySelector:()=>({content:'token'}),createElement:()=>new Element(),createElementNS:()=>new Element()},
    TextImport:require('../assets/text-import'),PlotterFonts:library,
    PlotterText:{load:async result=>prepared.push(result)},setTimeout:()=>1,clearTimeout:()=>{},
  };context.window=context;
  vm.runInNewContext(fs.readFileSync('assets/text-editor.js','utf8'),context);
  await context.TextEditor.ready;
  return {get,editor:context.TextEditor,library,prepared};
}

test('ASCII font/style menu loads saved fonts and selected style changes real pen paths',async()=>{
  const {get,editor,prepared}=await fixture();
  assert.equal(get('text-font').children.length,5);
  get('text-content').value='  Hi\n  Hi';editor.render();const original=editor.result.paths;
  get('text-font').value='ttf-existing';get('text-font').onchange();editor.render();
  assert.notDeepEqual(editor.result.paths,original);assert.match(get('text-font-note').textContent,/outline/i);
  assert.equal(get('text-prepare').disabled,true);assert.equal(prepared.length,0);
  editor.setPlotAvailability(true);await editor.prepare();
  assert.deepEqual(prepared[0].paths,editor.result.paths);
});

test('point size, automatic spacing and manual clipping checks control preview and export',async()=>{
  const {get,editor}=await fixture();get('text-content').value='Rōmānī īte domum';
  get('text-sizing').value='points';get('text-sizing').onchange();editor.render();
  assert.equal(editor.result.size,12);assert.equal(get('text-size').disabled,false);assert.equal(get('text-cell').disabled,true);
  const width=editor.result.width;
  get('text-size').value='24';get('text-size').oninput();editor.render();assert.ok(editor.result.width>width*1.9);
  get('text-auto-spacing').checked=false;get('text-cell').value='.5';editor.render();
  assert.equal(editor.result,null);assert.match(get('text-error').textContent,/column spacing/);assert.equal(get('text-export').disabled,true);
  get('text-sizing').value='fit';editor.render();assert.ok(editor.result);assert.equal(get('text-size').disabled,true);
});

test('imports from either editor preserve ASCII text, spacing and selected font',async()=>{
  const {get,editor,library,prepared}=await fixture();
  get('text-content').value='  House\n   ||';get('text-font').value='ttf-existing';get('text-cell').value='4';editor.render();
  const before=editor.result.paths;
  await library.importFiles([]);
  assert.equal(get('text-font').children.length,6);assert.equal(get('text-font').value,'ttf-existing');
  assert.equal(get('text-content').value,'  House\n   ||');assert.equal(get('text-cell').value,'4');assert.deepEqual(editor.result.paths,before);
  get('text-font-files').files=[{name:'another.ttf'}];await editor.importFonts();
  assert.match(get('text-font-status').textContent,/added/);assert.equal(prepared.length,0);
});

test('a saved font error leaves the built-in text fonts available',async()=>{
  const {get,editor}=await fixture({broken:true});
  assert.match(get('text-font-status').textContent,/damaged/);
  get('text-content').value='Hello';editor.render();assert.ok(editor.result);
});
