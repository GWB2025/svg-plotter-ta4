// Regression checks for interrupted Pointer Events and drawing controls.
const vm=require('node:vm'),fs=require('node:fs'),assert=require('node:assert/strict');
const elements=new Map(),windowEvents={},documentEvents={};
const context=new Proxy({}, {get:()=>()=>{},set:()=>true});
function element(id){if(!elements.has(id)) elements.set(id,{checked:false,hidden:false,textContent:'',value:'',listeners:{},getContext:()=>context,addEventListener(type,fn){this.listeners[type]=fn;},setAttribute(){},removeAttribute(){},replaceChildren(){},append(){},getBoundingClientRect:()=>({left:0,top:0,width:400,height:300}),setPointerCapture(){},hasPointerCapture:()=>true,releasePointerCapture(){this.listeners.lostpointercapture?.({pointerId:1});}});return elements.get(id);}
const sandbox={HandwritingMetrics:require('../static/metrics.js'),document:{getElementById:element,createElement:()=>element(Symbol()),documentElement:{classList:{toggle(){}}},addEventListener:(t,f)=>documentEvents[t]=f},window:{addEventListener:(t,f)=>windowEvents[t]=f},fetch:()=>new Promise(()=>{}),URL,Blob,console,Date};
vm.createContext(sandbox);vm.runInContext(fs.readFileSync('static/app.js','utf8'),sandbox);
const state=()=>vm.runInContext('({count:strokes.length,active:!!active})',sandbox);
const down=()=>element('pad').listeners.pointerdown({pointerId:1,pointerType:'pen',clientX:50,clientY:100,timeStamp:10,pressure:.5,preventDefault(){}});
down();element('undo').onclick();assert.equal(state().active,false);assert.equal(state().count,0);
down();windowEvents.pointerup({pointerId:1,clientX:60,clientY:120,timeStamp:20,pressure:0});assert.equal(state().count,1);
down();element('undo').onclick();assert.equal(state().count,1);element('undo').onclick();assert.equal(state().count,0);
down();element('clear').onclick();assert.equal(state().active,false);assert.equal(state().count,0);
windowEvents.pointerup({pointerId:1});assert.equal(state().count,0);
down();windowEvents.blur();assert.equal(state().active,false);
down();windowEvents.pointercancel({pointerId:1});assert.equal(state().active,false);
vm.runInContext('mode="capture";character="a"',sandbox);down();element('clear').onclick();assert.equal(vm.runInContext('drafts.a.strokes.length',sandbox),0);
console.log('Capture control regression checks passed.');

vm.runInContext('setWritingLock(true)',sandbox);down();element('writingLock').onclick();assert.equal(vm.runInContext('writingLocked',sandbox),false);assert.equal(state().active,false);
vm.runInContext('setWritingLock(true)',sandbox);down();documentEvents.keydown({key:'Escape'});assert.equal(vm.runInContext('writingLocked',sandbox),false);assert.equal(state().active,false);
console.log('Unlock recovery checks passed.');

// First contact must survive failure or loss of pointer capture.
element('pad').setPointerCapture=()=>{throw new Error('Capture unavailable');};
down();assert.equal(state().active,true);
element('pad').listeners.lostpointercapture({pointerId:1});assert.equal(state().active,true);
windowEvents.pointermove({pointerId:1,clientX:55,clientY:110,timeStamp:15,pressure:.5,preventDefault(){}});
windowEvents.pointerup({pointerId:1,clientX:60,clientY:120,timeStamp:20,pressure:0});
assert.equal(state().active,false);assert.equal(state().count,1);
assert.equal(vm.runInContext('strokes[0].points.length',sandbox),3);
console.log('First-contact capture failure and capture-loss checks passed.');

sandbox.characterFixture=require('../static/characters.json');
vm.runInContext('characterDefinition=characterFixture;mode="capture";character="a";groupId="lowercase"',sandbox);
element('characterGroup').value='uppercase';
element('characterGroup').onchange();
assert.equal(vm.runInContext('character',sandbox),'A');
assert.equal(vm.runInContext('drafts.a.strokes.length',sandbox),1);
element('characterGroup').value='lowercase';
element('characterGroup').onchange();
assert.equal(state().count,1);
assert.equal(vm.runInContext('character',sandbox),'a');
console.log('Character group changes preserve unsaved drafts.');

(async()=>{
  sandbox.fetch=async()=>({ok:true,json:async()=>({id:'test-sample'})});
  element('autoNext').checked=true;
  vm.runInContext('character="e"',sandbox);
  await element('save').onclick();
  assert.equal(vm.runInContext('character',sandbox),'f');
  down();windowEvents.pointerup({pointerId:1,clientX:60,clientY:120,timeStamp:30,pressure:0});
  vm.runInContext('character="z"',sandbox);
  await element('save').onclick();
  assert.equal(vm.runInContext('character',sandbox),'z');
  assert.match(element('captureStatus').textContent,/group is complete/);
  console.log('Auto-next advances past e and stops at the group boundary.');
})().catch(error=>{console.error(error);process.exitCode=1;});
