'use strict';
(function(root){
 const active=new Set(['connecting','homing','plotting','pausing','paused','reconnecting','finishing','cancelling','pen_change']);
 function permissions(s,hasJob,ready){const idle=s.connected&&!s.busy&&!active.has(s.phase);return {
  file:!s.busy,refresh:!s.busy,connect:!s.connected&&!s.busy,disconnect:idle,home:idle,
  start:idle&&s.homed&&hasJob&&ready,pause:s.phase==='plotting'||s.phase==='finishing',
  continue:s.phase==='paused'||(s.phase==='pen_change'&&ready),cancel:['plotting','pausing','paused','reconnecting','finishing','pen_change'].includes(s.phase)
 };}
 const duration=seconds=>seconds==null?'—':seconds<60?Math.ceil(seconds)+' sec':Math.ceil(seconds/60)+' min';
 const api={permissions,duration};if(typeof module!=='undefined'&&module.exports)module.exports=api;
 if(typeof document==='undefined')return;
 const token=document.querySelector('meta[name="plotter-token"]')?.content;if(!token)return;
 const $=id=>document.getElementById(id),ns='http://www.w3.org/2000/svg';let job=null,state={phase:'offline',connected:false,busy:false},busy=false,lastPhase='',lastPen='',travelGroup,cursor,svgPaths=null,svgName='',currentGcode='',inventory=[],penListKey='',themeSource=null,activeTheme=null;
 $('plot-setup').hidden=true;$('plot-local').hidden=false;
 async function request(path,data){const response=await fetch('/api/'+path,{method:data?'POST':'GET',headers:{'X-Plotter-Token':token,...(data?{'Content-Type':'application/json'}:{})},...(data?{body:JSON.stringify(data)}:{}),cache:'no-store',signal:AbortSignal.timeout(15000)});const result=await response.json();if(!response.ok)throw Error(result.error||'The plotting window did not respond.');return result;}
 function controls(){const p=permissions(state,!!job,$('plot-ready').checked);for(const [key,value] of Object.entries(p))$('plot-'+key).disabled=busy||!value;$('plot-port').disabled=busy||state.connected||state.busy;$('plot-ready').disabled=busy||(state.busy&&state.phase!=='pen_change');for(const id of ['svg-mode','svg-margin','svg-example'])$(id).disabled=busy||state.busy;for(const id of ['svg-example-load','svg-example-save'])$(id).disabled=busy||state.busy||!$('svg-example').value;$('svg-apply').disabled=busy||state.busy||!svgPaths;$('svg-download').disabled=busy||state.busy||!currentGcode;for(const select of document.querySelectorAll('.pen-choice'))select.disabled=busy||state.busy;for(const button of document.querySelectorAll('.theme-apply'))button.disabled=busy||state.busy||!job?.paths?.length;$('theme-restore').disabled=busy||state.busy||!themeSource;}
 function penName(colour){return ({'#d32f2f':'red','#1565c0':'blue','#2e7d32':'green','#7b1fa2':'purple','#ff0000':'red','#0000ff':'blue','#000000':'black'})[colour]||colour;}
 function render(){
  const pen=state.pending_pen;
  const penKey=state.phase==='pen_change'&&pen ? String(pen.index)+pen.colour : '';
  if(penKey!==lastPen){$('plot-ready').checked=false;lastPen=penKey;}
  $('plot-message').textContent=state.message;
  const required=pen?.pen_label||pen?.colour||'';
  $('plot-continue').textContent=state.phase==='pen_change' ? 'Continue with '+required : 'Continue';
  $('pen-ready-label').textContent=state.phase==='pen_change' ? required+' is fitted and ready' : 'Paper is in place and the pen and bed are ready';
  const listKey=(job?.id||'')+String(!!state.busy);
  if(listKey!==penListKey){
   penListKey=listKey;
   $('pen-sequence').replaceChildren(...(job?.pen_changes||[]).map((p,i)=>{
    const li=document.createElement('li');
    li.style.borderLeft='6px solid '+p.colour;li.style.paddingLeft='8px';
    const label=document.createElement('label');label.textContent='Pass '+(i+1)+' · '+p.colour+' ';
    const select=document.createElement('select');select.className='pen-choice';select.setAttribute('aria-label','Pen for pass '+(i+1));
    const unspecified=document.createElement('option');unspecified.value='';unspecified.textContent='Unspecified pen — '+p.colour;select.append(unspecified);
    for(const set of [...new Set(inventory.map(p=>p.set))]){
     const group=document.createElement('optgroup');group.label=set;
     for(const item of inventory.filter(p=>p.set===set)){
      const option=document.createElement('option');option.value=item.id;option.textContent=PenInventory.label(item);group.append(option);
     }
     select.append(group);
    }
    select.value=p.pen_id||'';select.disabled=busy||state.busy;
    select.onchange=()=>perform(async()=>{
     const choices=Object.fromEntries(job.pen_changes.map(p=>[p.colour,p.pen_id||'']));choices[p.colour]=select.value;
     const text=currentGcode.replace(/^; PEN_CHANGE (#[0-9a-fA-F]{6})(?: [a-z0-9-]+)?$/gm,(_,colour)=>'; PEN_CHANGE '+colour+(choices[colour]?' '+choices[colour]:''));
     $('plot-ready').checked=false;
     await loadDrawing(text,job.name,false);
    });
    label.append(select);li.append(label);return li;
   }));
  }

  const accepted=state.accepted||0,total=state.total||0,percent=total?100*accepted/total:0;
  $('plot-progress').value=state.phase==='completed'?100:Math.min(percent,99.9);
  $('plot-progress-text').textContent=total?accepted.toLocaleString()+' of '+total.toLocaleString()+' commands sent ('+Math.floor(percent)+'%).'+(accepted===total&&state.phase!=='completed'?' Waiting for confirmed completion.':''):'No drawing started.';
  $('plot-time').textContent=state.elapsed?'Elapsed: '+duration(state.elapsed)+(state.remaining!=null&&active.has(state.phase)?' · remaining movement: at least '+duration(state.remaining):''):'';
  const pos=state.controller?.position;$('plot-position').textContent=pos?'Last reported position: X '+pos[0].toFixed(2)+' · Y '+pos[1].toFixed(2)+' mm · '+(Math.abs(pos[2]-.5)<.02?'pen up':Math.abs(pos[2]-5)<.02?'pen down':'pen moving'):'';
  if(cursor&&pos){cursor.setAttribute('cx',pos[0]);cursor.setAttribute('cy',-pos[1]);cursor.hidden=false;}
  $('plot-events').replaceChildren(...(state.events||[]).slice(-8).map(message=>{const li=document.createElement('li');li.textContent=message;return li;}));
  if(lastPhase!==state.phase&&['completed','cancelled','error','offline'].includes(state.phase))$('plot-ready').checked=false;
  lastPhase=state.phase;controls();
 }
 function draw(){const svg=$('plot-preview');svg.replaceChildren();function el(tag,attrs,parent=svg){const node=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs))node.setAttribute(k,v);parent.append(node);return node;}
  el('rect',{x:0,y:0,width:210,height:297,fill:'white'});el('rect',{x:20,y:20,width:170,height:257,fill:'none',stroke:'#ccd8d0','stroke-width':.4,'stroke-dasharray':'2 2'});
  travelGroup=el('g',{fill:'none',stroke:'#7c9aad','stroke-width':.25,'stroke-dasharray':'1 1'});
  for(const path of job?.travel||[])el('path',{d:path.map((p,i)=>(i?'L':'M')+p.join(' ')).join(' ')},travelGroup);
  const ink=el('g',{fill:'none',stroke:'#203832','stroke-width':.3,'stroke-linecap':'round','stroke-linejoin':'round'});
  for(const [pathIndex,path] of (job?.paths||[]).entries()){const colour=job.path_colours?.[pathIndex]||'#203832';if(path.length===1||path.every(p=>p[0]===path[0][0]&&p[1]===path[0][1]))el('circle',{cx:path[0][0],cy:path[0][1],r:.15,fill:colour},ink);else el('path',{d:path.map((p,i)=>(i?'L':'M')+p.join(' ')).join(' '),stroke:colour},ink);}
  cursor=el('circle',{cx:0,cy:0,r:1.7,fill:'#b56d29'});travelGroup.style.display=$('plot-travel').checked?'':'none';
 }
 function describeJob(){draw();if(!job)return;const b=job.bounds;$('plot-file-info').textContent=job.name+' · '+job.commands.toLocaleString()+' checked commands · '+(b?'drawing '+(b[2]-b[0]).toFixed(1)+' × '+(b[3]-b[1]).toFixed(1)+' mm':'pen-up movement or pen check')+'.';$('plot-estimate').textContent='Estimated movement time: at least '+duration(job.seconds)+' · '+(job.draw_mm/1000).toFixed(1)+' m drawn. Acceleration, pauses and connection delays add time.';}
 async function perform(fn){if(busy)return;busy=true;controls();$('plot-error').textContent='';try{await fn();}catch(error){$('plot-error').textContent=error.message;$('theme-error').textContent=error.message;}finally{busy=false;controls();}}
 async function refreshPorts(){const data=await request('devices'),selected=$('plot-port').value;$('plot-port').replaceChildren(...data.devices.map(p=>{const option=document.createElement('option');option.value=p.port;option.textContent=p.name+' · '+p.port.split('/').pop();return option;}));if(!data.devices.length){const o=document.createElement('option');o.value='';o.textContent='No T-A4 plotter found';$('plot-port').append(o);}else if(data.devices.some(p=>p.port===selected))$('plot-port').value=selected;}
 async function loadDrawing(text,name,assignDefaults=true){
  if(assignDefaults)text=text.replace(/^; PEN_CHANGE (#[0-9a-fA-F]{6})$/gm,(_,colour)=>{
   const id=PenInventory.suggest(colour,inventory);return '; PEN_CHANGE '+colour+(id?' '+id:'');
  });
  const result=await request('load',{name,text});job=result.job;currentGcode=text;describeJob();state=await request('status');render();
 }
 async function applySVG(){
  themeSource=null;
  const pens=Object.fromEntries((job?.pen_changes||[]).map(p=>[p.colour,p.pen_id||'']));
  job=null;currentGcode='';$('plot-ready').checked=false;draw();
  if(svgPaths.colours?.length){const identity=await request('identity');if(!identity.pen_inventory)throw Error('Restart SVG Plotter with python3 launch.py to enable the pen inventory, then reload this drawing.');}
  const paths=SVGImport.placePaths(svgPaths,{mode:$('svg-mode').value,margin:Number($('svg-margin').value)});
  await loadDrawing(SVGImport.makeColourGcode(paths,svgPaths.colours,pens),svgName.replace(/\.svg$/i,'')+'.gcode');
  if(activeTheme)await applyTheme(activeTheme);
 }
 $('plot-file').addEventListener('change',()=>perform(async()=>{
  const file=$('plot-file').files[0];if(!file)return;themeSource=null;activeTheme=null;job=null;svgPaths=null;currentGcode='';$('plot-ready').checked=false;$('theme-status').textContent='Choose a theme after loading your drawing.';draw();
  $('plot-file-info').textContent='Checking '+file.name+'…';$('plot-estimate').textContent='';
  if(file.size>8*1024*1024)throw Error('Choose a file no larger than 8 MB.');
  const text=await file.text();
  try{
   if(/\.svg$/i.test(file.name)||/^\s*(?:<\?xml[^>]*>\s*)?<svg[\s>]/i.test(text)){
    svgPaths=SVGImport.extractPaths(text);svgName=file.name;await applySVG();
   }else await loadDrawing(text,file.name);
  }catch(error){$('plot-file-info').textContent='Drawing could not be loaded.';throw error;}
 }));
 for(const [index, example] of SVGImport.examples.entries()){
  const option=document.createElement('option');option.value=String(index);option.textContent=example.title;$('svg-example').append(option);
 }
 $('svg-example').onchange=()=>{
  const value=$('svg-example').value;
  $('svg-example-description').textContent=value===''?'Choose an example to try the preview and plotting controls.':SVGImport.examples[Number(value)].description+' Loads at its original size on A4.';
  controls();
 };
 $('svg-example-load').onclick=()=>perform(async()=>{
  const example=SVGImport.examples[Number($('svg-example').value)];
  activeTheme=null;themeSource=null;job=null;svgPaths=null;currentGcode='';$('plot-ready').checked=false;$('plot-file').value='';draw();
  $('plot-file-info').textContent='Checking '+example.name+'…';$('plot-estimate').textContent='';
  svgPaths=SVGImport.extractPaths(example.svg);svgName=example.name;$('svg-mode').value='actual';
  await applySVG();
 });
 $('svg-example-save').onclick=()=>{
  const example=SVGImport.examples[Number($('svg-example').value)];
  const url=URL.createObjectURL(new Blob([example.svg],{type:'image/svg+xml'}));
  const a=document.createElement('a');a.href=url;a.download=example.name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
 };
 $('svg-apply').onclick=()=>perform(applySVG);
 for(const id of ['svg-mode','svg-margin'])$(id).onchange=()=>{if(svgPaths)perform(applySVG);};
 $('svg-download').onclick=()=>{if(!currentGcode)return;const url=URL.createObjectURL(new Blob([currentGcode],{type:'text/plain'}));const a=document.createElement('a');a.href=url;a.download=job.name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);};
 for(const action of ['connect','disconnect','home','start','pause','continue','cancel'])$('plot-'+action).onclick=()=>perform(async()=>{state=await request('action',{action,port:$('plot-port').value,job_id:job?.id,ready:$('plot-ready').checked,pen_index:state.pending_pen?.index});render();});
 async function applyTheme(theme){
   if(state.busy||!job?.paths?.length)throw Error('Load an idle drawing before applying a theme.');
   const status=await request('status');if(status.busy)throw Error('Wait for the current drawing to finish.');
   if(!themeSource)themeSource={paths:job.paths,colours:job.path_colours,name:job.name,gcode:currentGcode};
   const result=DrawingThemes.recolour(themeSource,theme.pens,inventory);
   $('plot-ready').checked=false;$('theme-error').textContent='';
   await loadDrawing(SVGImport.makeColourGcode(result.paths,result.colours,result.pens),themeSource.name,false);
   $('theme-status').textContent=theme.name+' applied. Review the preview and pen order in Plot drawing before starting.';
   activeTheme=theme;$('plot-tab').click();
 }
 root.PlotterThemes={
  apply:theme=>perform(()=>applyTheme(theme)),
  restore:()=>perform(async()=>{
   if(state.busy||!themeSource)return;
   const original=themeSource;
   $('plot-ready').checked=false;
   await loadDrawing(original.gcode,original.name,false);themeSource=null;activeTheme=null;
   $('theme-status').textContent='Original colours restored.';$('plot-tab').click();
  })
 };
 $('plot-refresh').onclick=()=>perform(refreshPorts);$('plot-ready').onchange=controls;$('plot-travel').onchange=()=>{if(travelGroup)travelGroup.style.display=$('plot-travel').checked?'':'none';};
 async function poll(){try{state=await request('status');render();}catch(error){state={...state,phase:'unavailable',connected:false,busy:true};controls();$('plot-error').textContent='Cannot reach the Mac sender. Check the plotter locally; movement may continue. '+error.message;}setTimeout(poll,750);}
 perform(async()=>{const response=await fetch('/assets/pens.json',{cache:'no-store'});if(!response.ok)throw Error('Cannot load the pen inventory. Restart the app.');inventory=await response.json();await refreshPorts();job=(await request('job')).job;describeJob();state=await request('status');render();}).finally(poll);
})(typeof window==='undefined'?globalThis:window);
