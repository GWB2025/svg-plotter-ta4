const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

class Element {
  constructor(){this.value='';this.disabled=false;this.hidden=false;this.options=[];this.textContent='';}
  replaceChildren(...children){this.options=children;}
  showModal(){this.open=true;}
  close(){this.open=false;}
  focus(){}
}
async function fixture(){
  const elements=new Map([...fs.readFileSync('docs/plotting.html','utf8').matchAll(/id="([^"]+)"/g)].map(m=>[m[1],new Element()]));
  const get=id=>{assert.ok(elements.has(id),id);return elements.get(id);};
  const ta4={id:'ta4',name:'Writing Robot T-A4',make:'UUNA TEK',model:'T-A4',driver:'grbl-z',width:210,height:297,x_direction:1,y_direction:-1,pen_up:.5,pen_down:5,draw_feed:900,travel_feed:2400,lift_feed:1200,stroke_feed:3000,baudrate:115200,usb_vid:6790,usb_pid:32832,banner:'DrawCore',fingerprint:'default'};
  let state={revision:0,selected:'ta4',profiles:[ta4]},fail=false;
  const requests=[],events=[];
  const context={document:{getElementById:get,querySelector:()=>({content:'token'}),createElement:()=>new Element()},
    AbortSignal,CustomEvent:class {constructor(type,options){this.type=type;this.detail=options.detail;}},
    dispatchEvent:event=>events.push(event),confirm:()=>true,
    fetch:async(url,options)=>{
      assert.equal(url,'/api/profiles');
      if(options.body){
        const data=JSON.parse(options.body);requests.push(data);
        if(fail)return {ok:false,json:async()=>({error:'Disk full'})};
        assert.equal(data.revision,state.revision);
        if(data.action==='save'){
          const profile={...data.item,id:data.item.id||'custom',fingerprint:'custom-fingerprint'};
          const index=state.profiles.findIndex(p=>p.id===profile.id);
          if(index<0)state.profiles.push(profile);else state.profiles[index]=profile;
        }
        if(data.action==='select')state.selected=data.item.id;
        if(data.action==='delete')state.profiles=state.profiles.filter(p=>p.id!==data.item.id);
        state.revision++;
      }
      return {ok:true,json:async()=>structuredClone(state)};
    },
  };
  context.window=context;
  vm.runInNewContext(fs.readFileSync('assets/plotter-profiles.js','utf8'),context);
  await context.PlotterProfiles.ready;
  const settle=async()=>{for(let i=0;i<80;i++)await Promise.resolve();};
  return {get,requests,events,context,settle,fail:()=>{fail=true;},add:async()=>{
    context.PlotterProfiles.setAvailability(true);get('profile-add').onclick();
    for(const [key,value] of Object.entries({name:'A3 machine',make:'Workshop',model:'A3',width:'420',height:'297'}))get('profile-'+key).value=value;
    // Native inputs stringify assigned numeric values.
    for(const element of elements.values())element.value=String(element.value);
    get('profile-form').onsubmit({preventDefault(){}});await settle();
  }};
}
test('add and select an export-only profile, then switch back to the original',async()=>{
  const ui=await fixture();await ui.add();
  assert.deepEqual(ui.requests.map(r=>r.action),['save','select']);
  assert.equal(ui.context.PlotterProfiles.current.driver,'svg');
  assert.equal(ui.context.PlotterProfiles.current.width,420);
  assert.equal(ui.events[0].detail.id,'custom');
  assert.equal(ui.get('profile-editor').open,false);
  ui.get('profile-select').value='ta4';await ui.get('profile-select').onchange();
  assert.equal(ui.requests.at(-1).item.id,'ta4');
  assert.equal(ui.get('profile-edit').disabled,true);
});
test('failed save preserves the form and values; connection/recovery lock rejects edits',async()=>{
  const ui=await fixture();ui.fail();await ui.add();
  assert.equal(ui.get('profile-editor').open,true);
  assert.equal(ui.get('profile-name').value,'A3 machine');
  assert.equal(ui.get('profile-form-error').textContent,'Disk full');
  ui.context.PlotterProfiles.setAvailability(false);
  assert.equal(ui.get('profile-save').disabled,true);
  ui.get('profile-form').onsubmit({preventDefault(){}});await ui.settle();
  assert.equal(ui.requests.length,1);
});
test('duplicate retains controller settings and remove returns to supplied profile',async()=>{
  const ui=await fixture();ui.context.PlotterProfiles.setAvailability(true);
  ui.get('profile-duplicate').onclick();
  assert.equal(ui.get('profile-driver').value,'grbl-z');
  assert.equal(ui.get('profile-name').value,'Writing Robot T-A4 copy');
  await ui.add();await ui.get('profile-remove').onclick();
  assert.deepEqual(ui.requests.slice(-2).map(r=>r.action),['select','delete']);
  assert.equal(ui.context.PlotterProfiles.current.id,'ta4');
});
