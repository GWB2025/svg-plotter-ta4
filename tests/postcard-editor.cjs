const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const fonts=require('../assets/postcard-fonts.json'),defaults=require('../assets/postcard-defaults.json');

async function fixture() {
  const elements=new Map();
  class Element {
    constructor(tag='div'){this.tag=tag;this.children=[];this.style={};this.dataset={};this.value='';this.checked=false;this.files=[];}
    set id(id){this.identifier=id;elements.set(id,this);}
    get id(){return this.identifier;}
    get valueAsNumber(){return Number(this.value);}
    append(...items){this.children.push(...items);}
    replaceChildren(...items){this.children=items;}
    setAttribute(key,value){this[key]=value;}
    addEventListener(){}
    focus(){this.focused=true;}
    querySelectorAll(){return this.children.flatMap(child=>[child,...child.querySelectorAll()]).filter(c=>['input','textarea','select'].includes(c.tag));}
  }
  for(const match of fs.readFileSync('docs/postcard-panel.html','utf8').matchAll(/id="([^"]+)"/g))elements.set(match[1],new Element());
  const get=id=>{assert.ok(elements.has(id),'Missing '+id);return elements.get(id);};
  const subscribers=[];
  const library={fonts:structuredClone(fonts),load:async()=>({fonts:library.fonts}),subscribe:fn=>subscribers.push(fn),
    importFiles:async()=>{const result={fonts:library.fonts,added:0};subscribers.forEach(fn=>fn(result));return result;}};
  const context={document:{getElementById:get,querySelector:()=>({content:'token'}),createElement:tag=>new Element(tag),createElementNS:(ns,tag)=>new Element(tag)},
    structuredClone,AbortSignal,setTimeout:()=>1,clearTimeout:()=>{},PlotterFonts:library,
    PostcardLayout:require('../assets/postcard-layout'),
    fetch:async url=>{assert.equal(url,'/api/postcard');return {ok:true,json:async()=>({document:structuredClone(defaults),defaults:structuredClone(defaults),revision:'new',error:null})};},
  };context.window=context;
  vm.runInNewContext(fs.readFileSync('assets/postcard-editor.js','utf8'),context);
  await context.PostcardEditor.ready;
  return {get,editor:context.PostcardEditor,library,subscribers};
}

test('fonts imported in ASCII appear in both postcard menus without losing edits or history',async()=>{
  const {get,editor,library,subscribers}=await fixture();
  get('pc-message-text').value='Rōmānī īte domum';get('pc-message-font').value='italic';editor.change();
  const before=JSON.stringify(editor.document),history=editor.history.length;
  library.fonts=[...library.fonts,{...fonts[1],id:'ttf-cinzel',name:'Cinzel Regular',kind:'outline'}];
  subscribers.forEach(fn=>fn({fonts:library.fonts}));
  assert.equal(get('pc-message-font').children.length,5);assert.equal(get('pc-address-font').children.length,5);
  assert.equal(get('pc-message-font').value,'italic');assert.equal(JSON.stringify(editor.document),before);assert.equal(editor.history.length,history);
  get('pc-message-font').value='ttf-cinzel';editor.change();editor.render();assert.deepEqual(editor.result.errors,[]);
});

test('postcard imports use the shared font service and retain a draft when import fails',async()=>{
  const {get,editor,library}=await fixture();
  get('pc-message-text').value='Keep this message';editor.change();const before=JSON.stringify(editor.document);
  get('postcard-font-files').files=[{name:'bad.ttf'}];library.importFiles=async()=>{throw Error('Invalid font');};
  await editor.importFonts();assert.match(get('postcard-font-status').textContent,/Invalid font/);
  assert.equal(JSON.stringify(editor.document),before);assert.equal(get('postcard-font-import').disabled,false);
});

test('each postcard Clear text button preserves the other block and supports Undo and Redo',async()=>{
  const {get,editor}=await fixture();
  get('pc-message-text').value='Rōmānī īte domum';get('pc-address-text').value='Brian\nRome';
  get('pc-message-font').value='italic';get('pc-address-size').value='14';
  editor.change();editor.render();const before=JSON.parse(JSON.stringify(editor.document));
  const saved=editor.lastSaved;
  for(const key of ['message','address']){
    const other=key==='message'?'address':'message';
    const button=get('pc-'+key+'-clear');assert.equal(button.textContent,'Clear text');
    assert.equal(button.disabled,false);button.onclick();
    assert.equal(editor.document[key].text,'');assert.equal(get('pc-'+key+'-text').focused,true);
    assert.deepEqual(editor.document[other],before[other]);
    assert.deepEqual({...editor.document[key],text:before[key].text},before[key]);
    assert.equal(editor.result.blocks[key].paths.length,0);assert.equal(button.disabled,true);
    assert.match(get('postcard-draft-status').textContent,/Unsaved/);assert.equal(editor.lastSaved,saved);
    const count=editor.history.length;button.onclick();assert.equal(editor.history.length,count);
    get('postcard-undo').onclick();assert.equal(JSON.stringify(editor.document),JSON.stringify(before));
    get('postcard-redo').onclick();assert.equal(editor.document[key].text,'');
    get('postcard-undo').onclick();
  }
});

test('clearing both postcard blocks cannot prepare an empty drawing or change a prepared copy',async()=>{
  const {get,editor}=await fixture();
  get('pc-message-text').value='Message';get('pc-address-text').value='Address';editor.change();editor.render();
  const prepared=structuredClone(editor.result),paths=JSON.stringify(prepared.paths);
  editor.preparing=true;editor.controls();assert.equal(get('pc-message-clear').disabled,true);
  get('pc-message-clear').onclick();assert.equal(editor.document.message.text,'Message');
  editor.preparing=false;editor.setPlotAvailability(false);
  get('pc-message-clear').onclick();get('pc-address-clear').onclick();
  assert.equal(editor.document.message.text,'');assert.equal(editor.document.address.text,'');
  assert.equal(get('postcard-prepare').disabled,true);assert.equal(get('postcard-export').disabled,true);
  assert.equal(JSON.stringify(prepared.paths),paths);
});
