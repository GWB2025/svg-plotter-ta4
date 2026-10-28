'use strict';
(function(root){
 const active=new Set(['connecting','homing','plotting','pausing','paused','reconnecting','finishing','cancelling','pen_change','resuming','rehome','recovery_pen']);
 function permissions(s,hasJob,ready,rehomeReady=false){const idle=s.connected&&!s.busy&&!active.has(s.phase);return {
  file:!s.busy&&!s.saved_plot,refresh:!s.busy,connect:!s.connected&&!s.busy&&!s.saved_plot,disconnect:idle,home:idle&&!s.saved_plot,
  resume:!!s.recovery_available&&!s.connected&&!s.busy&&hasJob&&ready,discard:!!s.saved_plot&&!s.busy,
  rehome:!!s.saved_plot&&!!s.rehome_available&&!s.connected&&!s.busy&&hasJob&&rehomeReady,
  start:idle&&s.homed&&hasJob&&ready&&!s.saved_plot,pause:s.phase==='plotting'||s.phase==='finishing',
  continue:s.phase==='paused'||(['pen_change','recovery_pen'].includes(s.phase)&&ready),cancel:['plotting','pausing','paused','reconnecting','finishing','pen_change','resuming','rehome','recovery_pen'].includes(s.phase)
 };}
 const duration=seconds=>seconds==null?'—':seconds<60?Math.ceil(seconds)+' sec':Math.ceil(seconds/60)+' min';
 const api={permissions,duration};if(typeof module!=='undefined'&&module.exports)module.exports=api;
 if(typeof document==='undefined')return;
 const token=document.querySelector('meta[name="plotter-token"]')?.content;if(!token)return;
 const $=id=>document.getElementById(id),ns='http://www.w3.org/2000/svg';let job=null,state={phase:'offline',connected:false,busy:false},busy=false,lastPhase='',lastPen='',lastRecovery='',cursor,svgPaths=null,svgName='',currentGcode='',inventory=[],penListKey='',themeSource=null,activeTheme=null;
 const preview=new PlotPreview.CanvasPreview($('preview-ink'),$('preview-travel'));
 let guideSettings=null,postcardSettings=null,swatchSheet=false;
 $('plot-setup').hidden=true;$('plot-local').hidden=false;
 async function request(path,data){const response=await fetch('/api/'+path,{method:data?'POST':'GET',headers:{'X-Plotter-Token':token,...(data?{'Content-Type':'application/json'}:{})},...(data?{body:JSON.stringify(data)}:{}),cache:'no-store',signal:AbortSignal.timeout(15000)});const result=await response.json();if(!response.ok)throw Error(result.error||'The plotting window did not respond.');return result;}
 function controls(){
  const frozen=state.busy||state.saved_plot;
  const p=permissions(state,!!job,$('plot-ready').checked,$('plot-rehome-ready').checked);
  const profile=machineProfile();
  root.PlotterProfiles?.setAvailability(!busy&&!frozen&&!state.connected, state.profile);
  if(profile?.driver==='svg')for(const key of ['connect','home','start','resume','rehome'])p[key]=false;
  for(const [key,value] of Object.entries(p))$('plot-'+key).disabled=busy||!value;
  const page=pageOptions(),bounds=job?.bounds;
  if((bounds&&(bounds[2]>page.width||bounds[3]>page.height))||(profile&&(page.width>profile.width||page.height>profile.height)))$('plot-start').disabled=true;
  $('plot-port').disabled=busy||state.connected||state.busy;
  $('plot-ready').disabled=busy||(state.busy&&!['pen_change','recovery_pen'].includes(state.phase));
  $('plot-rehome-ready').disabled=busy||state.busy;
  for(const id of ['page-size','page-width','page-height','svg-example','guide-load','guide-save'])$(id).disabled=busy||frozen;
  if(postcardSettings||swatchSheet)for(const id of ['page-size','page-width','page-height'])$(id).disabled=true;
  for(const id of ['svg-mode','svg-margin','svg-treatment','svg-spacing','svg-white'])$(id).disabled=busy||frozen||!!guideSettings||!!postcardSettings||swatchSheet;
  if(svgPaths?.textDrawing)for(const id of ['svg-treatment','svg-spacing','svg-white'])$(id).disabled=true;
  for(const id of ['svg-example-load','svg-example-save'])$(id).disabled=busy||frozen||!$('svg-example').value;
  $('svg-apply').disabled=busy||frozen||!svgPaths;
  for(const id of ['svg-rotation','svg-rotate'])$(id).disabled=busy||frozen||!svgPaths||!!guideSettings;
  $('svg-download').disabled=busy||state.busy||!currentGcode||profile?.driver==='svg';
  $('prepared-svg-download').disabled=busy||state.busy||!job?.paths?.length;
  for(const select of document.querySelectorAll('.pen-choice'))select.disabled=busy||state.busy||state.saved_plot||swatchSheet;
  for(const button of document.querySelectorAll('.theme-apply'))button.disabled=busy||frozen||!!guideSettings||!!postcardSettings||swatchSheet||!job?.paths?.length||button.dataset.unavailable==='true';
  $('theme-restore').disabled=busy||frozen||!themeSource;
  const size=page.width+' × '+page.height+' mm';
  if($('guide-size').textContent!==size)$('guide-size').textContent=size;
  root.PostcardEditor?.setPlotAvailability(!busy&&!frozen);
  root.SwatchEditor?.setPlotAvailability(!busy&&!frozen);
  root.TextEditor?.setPlotAvailability(!busy&&!frozen);
 }
 function penName(colour){return ({'#d32f2f':'red','#1565c0':'blue','#2e7d32':'green','#7b1fa2':'purple','#ff0000':'red','#0000ff':'blue','#000000':'black'})[colour]||colour;}
 function render(){
  const pen=state.pending_pen;
  const recovering=state.saved_plot&&!state.busy;
  const fittingPen=['pen_change','recovery_pen'].includes(state.phase);
  const plan=state.rehome_plan;
  const recoveryKey=recovering&&plan?(job?.id||'')+':'+plan.next_index+':'+state.phase:'';
  if(recoveryKey!==lastRecovery){$('plot-rehome-ready').checked=false;lastRecovery=recoveryKey;}
  $('plot-reset-recovery').hidden=!(recovering&&state.rehome_available&&plan);
  $('plot-readiness').hidden=!!(recovering&&!state.recovery_available);
  if(plan){
   const p=plan.position;
   $('plot-rehome-summary').textContent='Return to X '+p[0].toFixed(2)+', Y '+p[1].toFixed(2)+' mm with the pen raised, then continue from command '+(plan.next_index+1).toLocaleString()+' using '+plan.pen_label+'.';
   $('plot-rehome-detail').textContent=plan.source==='verified'?'This is the last confirmed completed stroke. Any unfinished stroke after it will be traced again.':'This older job saved a sampled position. Recovery returns to the earliest matching stroke, so nearby strokes may be traced again. Earlier colour passes are retained.';
  }
  $('plot-recovery').hidden=!recovering;
  $('plot-recovery').textContent=state.recovery_available ? 'Saved progress is available.'+(state.recovery_pen?' Keep '+state.recovery_pen+' fitted.':'')+' Reconnect the USB cable without switching off, resetting or homing the plotter. Keep the same paper and pen fitted. Resume may first finish movement already queued in the controller.' : state.rehome_available?'Saved progress and pen order are retained. Use Recover after reset below to re-establish the drawing origin.':'Saved progress is retained, but no recovery position can be identified. Discard saved recovery only when you intend to abandon it.';
  const penKey=fittingPen&&pen ? state.phase+String(pen.index)+pen.colour : '';
  if(penKey!==lastPen){$('plot-ready').checked=false;lastPen=penKey;}
  $('plot-message').textContent=state.message;
  const required=pen?.pen_label||pen?.colour||'';
  $('plot-continue').textContent=fittingPen ? 'Continue with '+required : 'Continue';
  $('pen-ready-label').textContent=fittingPen ? required+' is fitted at the original tip height and ready' : recovering ? 'The plotter has stayed powered, has not been reset, homed or moved; the paper and the same pen are unchanged' : guideSettings ? 'A carrier sheet covers the guide area, is fixed to the bed, and the pen is ready' : 'Paper is in place and the pen and bed are ready';
  const listKey=(job?.id||'')+String(!!state.busy)+String(!!state.saved_plot);
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
     for(const item of inventory.filter(item=>item.set===set&&(item.available!==false||item.id===p.pen_id))){
      const option=document.createElement('option');option.value=item.id;option.textContent=(item.id===p.pen_id?p.pen_label:PenInventory.label(item))+(item.available===false?' (unavailable)':'');option.disabled=item.available===false&&item.id!==p.pen_id;group.append(option);
     }
     select.append(group);
    }
    select.title='Choose the physical pen for this colour pass. Existing pen details remain fixed until you explicitly reassign them.';select.dataset.help=select.title;select.value=p.pen_id||'';select.disabled=busy||state.busy||state.saved_plot;
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
  $('plot-progress-text').textContent=total?accepted.toLocaleString()+' of '+total.toLocaleString()+' commands acknowledged ('+Math.floor(percent)+'%).'+(accepted===total&&state.phase!=='completed'?' Waiting for confirmed completion.':''):'No drawing started.';
  $('plot-time').textContent=state.elapsed?'Elapsed: '+duration(state.elapsed)+(state.remaining!=null&&active.has(state.phase)?' · remaining movement: at least '+duration(state.remaining):''):'';
  const pos=state.controller?.position;$('plot-position').textContent=pos?'Last reported position: X '+pos[0].toFixed(2)+' · Y '+pos[1].toFixed(2)+' mm · '+(Math.abs(pos[2]-(machineProfile()?.pen_up??.5))<.02?'pen up':Math.abs(pos[2]-(machineProfile()?.pen_down??5))<.02?'pen down':'pen moving'):'';
  if(cursor&&pos){cursor.setAttribute('cx',pos[0]*(machineProfile()?.x_direction??1));cursor.setAttribute('cy',pos[1]*(machineProfile()?.y_direction??-1));cursor.hidden=false;}
  $('plot-events').replaceChildren(...(state.events||[]).slice(-8).map(message=>{const li=document.createElement('li');li.textContent=message;return li;}));
  if(lastPhase!==state.phase&&['completed','cancelled','error','offline'].includes(state.phase))$('plot-ready').checked=false;
  lastPhase=state.phase;controls();
 }
 function machineProfile(){return state.profile||root.PlotterProfiles?.current;}
 function pageOptions(){return {width:Number($('page-width').value),height:Number($('page-height').value),profile:machineProfile()};}
 function updateBed(profile){
  if(!profile)return;
  $('page-width').max=profile.width;$('page-height').max=profile.height;
  for(const option of $('page-size').options){if(option.value==='custom')continue;const [w,h]=option.value.split(',').map(Number);option.disabled=w>profile.width||h>profile.height;}
  if(Number($('page-width').value)>profile.width||Number($('page-height').value)>profile.height)selectPage(profile.width,profile.height);
 }
 function selectPage(width,height){
  const value=width+','+height;
  const preset=[...$('page-size').options].some(option=>option.value===value);
  $('page-size').value=preset?value:'custom';
  $('page-width').value=width;$('page-height').value=height;
  $('page-width').readOnly=preset;$('page-height').readOnly=preset;
 }
 function setGuideMode(enabled){
  swatchSheet=false;
  if(enabled){
   if(!guideSettings)guideSettings=Object.fromEntries(['svg-mode','svg-margin','svg-treatment'].map(id=>[id,$(id).value]));
   $('svg-mode').value='actual';$('svg-margin').value='0';$('svg-treatment').value='outlines';
   $('svg-rotation').value='0';
   $('theme-status').textContent='Positioning guides use one pen at exact size. Load artwork to use colour themes.';
  }else if(guideSettings){
   for(const [id,value] of Object.entries(guideSettings))$(id).value=value;
   guideSettings=null;
   $('theme-status').textContent='Choose a theme after loading your drawing.';
  }
  $('guide-active').hidden=!enabled;
 }
 function setPostcardMode(enabled){
  swatchSheet=false;
  if(enabled){
   if(!postcardSettings)postcardSettings=Object.fromEntries(['svg-mode','svg-margin','svg-treatment'].map(id=>[id,$(id).value]));
   $('svg-mode').value='actual';$('svg-margin').value='0';$('svg-treatment').value='outlines';selectPage(148,105);
   $('svg-rotation').value='0';
   $('theme-status').textContent='Postcard text keeps its exact layout. Choose its physical pen in Plot drawing.';
  }else if(postcardSettings){
   for(const [id,value] of Object.entries(postcardSettings))$(id).value=value;
   postcardSettings=null;
  }
  $('postcard-loaded').hidden=!enabled;
 }
 function downloadSVG(svg,name){
  const url=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml'}));
  const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
 }
 function draw(){const svg=$('plot-preview');svg.replaceChildren();function el(tag,attrs,parent=svg){const node=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs))node.setAttribute(k,v);parent.append(node);return node;}
  const {width,height}=pageOptions(), margin=Number($('svg-margin').value);
  svg.setAttribute('viewBox',`0 0 ${width} ${height}`);
  if(!guideSettings&&!postcardSettings&&!swatchSheet&&2*margin<Math.min(width,height))el('rect',{x:margin,y:margin,width:width-2*margin,height:height-2*margin,fill:'none',stroke:'#ccd8d0','stroke-width':.4,'stroke-dasharray':'2 2'});
  cursor=el('circle',{cx:0,cy:0,r:1.7,fill:'#b56d29'});
  return preview.render(job,{width,height},$('plot-travel').checked);
 }
 async function describeJob(){if(job){const b=job.bounds;$('plot-file-info').textContent=job.name+' · '+job.commands.toLocaleString()+' checked commands · '+(b?'drawing '+(b[2]-b[0]).toFixed(1)+' × '+(b[3]-b[1]).toFixed(1)+' mm':'pen-up movement or pen check')+'.';$('plot-estimate').textContent=machineProfile()?.driver==='svg'?'Prepared pen paths: '+(job.draw_mm/1000).toFixed(1)+' m drawn. Plot time is calculated by the target software.':'Estimated movement time: at least '+duration(job.seconds)+' · '+(job.draw_mm/1000).toFixed(1)+' m drawn. Acceleration, pauses and connection delays add time.';}await draw();}
 async function perform(fn,message='Updating…'){if(busy)return;busy=true;controls();$('plot-working').textContent=message;$('plot-working').hidden=false;$('plot-error').textContent='';try{await fn();}catch(error){$('plot-error').textContent=error.message;$('theme-error').textContent=error.message;}finally{busy=false;$('plot-working').hidden=true;controls();}}
 async function refreshPorts(){const data=await request('devices'),selected=$('plot-port').value;$('plot-port').replaceChildren(...data.devices.map(p=>{const option=document.createElement('option');option.value=p.port;option.textContent=p.name+' · '+p.port.split('/').pop();return option;}));if(!data.devices.length){const o=document.createElement('option');o.value='';o.textContent=machineProfile()?.driver==='svg'?'SVG export · no USB connection':'No matching USB plotter found';$('plot-port').append(o);}else if(data.devices.some(p=>p.port===selected))$('plot-port').value=selected;}
 async function loadDrawing(text,name,assignDefaults=true){
  if(assignDefaults)text=text.replace(/^; PEN_CHANGE (#[0-9a-fA-F]{6})$/gm,(_,colour)=>{
   const id=PenInventory.suggest(colour,inventory);return '; PEN_CHANGE '+colour+(id?' '+id:'');
  });
  const result=await request('load',{name,text});job=result.job;currentGcode=text;await describeJob();state=await request('status');render();
 }
 async function applySVG(){
  themeSource=null;
  const pens=Object.fromEntries((job?.pen_changes||[]).map(p=>[p.colour,p.pen_id||'']));
  job=null;currentGcode='';$('plot-ready').checked=false;
  if(postcardSettings){const sideways=Number($('svg-rotation').value)%180!==0;selectPage(sideways?105:148,sideways?148:105);}
  $('plot-file-info').textContent='Preparing '+svgName+'…';$('plot-estimate').textContent='';draw();
  if(guideSettings){const guide=PageGuides.create(pageOptions());svgPaths=guide.paths;svgName=guide.name;}
  if(svgPaths.colours?.length){const identity=await request('identity');if(!identity.pen_inventory)throw Error('Restart SVG Plotter with python3 launch.py to enable the pen inventory, then reload this drawing.');}
  const options={...pageOptions(),rotation:Number($('svg-rotation').value),mode:guideSettings||postcardSettings?'actual':$('svg-mode').value,margin:guideSettings||postcardSettings?0:Number($('svg-margin').value),spacing:Number($('svg-spacing').value),leaveWhite:$('svg-white').checked};
  const layered=!guideSettings&&!postcardSettings&&!svgPaths.textDrawing&&$('svg-treatment').value==='layered';
  const paths=layered?await SVGImport.layeredPaths(svgPaths,options):SVGImport.placePaths(svgPaths,options);
  const colours=layered?paths.colours:svgPaths.colours;
  await loadDrawing(SVGImport.makeColourGcode(paths,colours,pens,options),svgName.replace(/\.svg$/i,'')+'.gcode');
  if(activeTheme)await applyTheme(activeTheme);
 }
 $('plot-file').addEventListener('change',()=>perform(async()=>{
  const file=$('plot-file').files[0];if(!file)return;setGuideMode(false);setPostcardMode(false);themeSource=null;activeTheme=null;job=null;svgPaths=null;currentGcode='';$('plot-ready').checked=false;$('theme-status').textContent='Choose a theme after loading your drawing.';draw();
  $('svg-rotation').value='0';
  $('plot-file-info').textContent='Checking '+file.name+'…';$('plot-estimate').textContent='';
  if(file.size>8*1024*1024)throw Error('Choose a file no larger than 8 MB.');
  const text=/\.txt$/i.test(file.name)?TextImport.decode(await file.arrayBuffer(),8*1024*1024):(await file.text()).replace(/^\ufeff/,'');
  try{
   const kind=TextImport.kind(file.name,text);
   if(kind==='text'){
    await root.TextEditor.open(text,file.name);
    $('plot-file-info').textContent=file.name+' is open in Text & ASCII art. Choose Prepare to plot there.';
   }else if(kind==='svg'){
    svgPaths=SVGImport.extractPaths(text);svgName=file.name;
    if(svgPaths.positioningGuide){PageGuides.create({...svgPaths,profile:machineProfile()});selectPage(svgPaths.width,svgPaths.height);setGuideMode(true);}
    else if(svgPaths.postcardText){if(Math.abs(svgPaths.width-148)>.001||Math.abs(svgPaths.height-105)>.001)throw Error('Postcard text must use a 148 × 105 mm page.');setPostcardMode(true);}
    await applySVG();
   }else {swatchSheet=text.startsWith('; SWATCH_SHEET v1\n');if(swatchSheet)selectPage(210,297);await loadDrawing(text,file.name);}
  }catch(error){$('plot-file-info').textContent='Drawing could not be loaded.';throw error;}
 }));
 for(const [index, example] of SVGImport.examples.entries()){
  const option=document.createElement('option');option.value=String(index);option.textContent=example.title;$('svg-example').append(option);
 }
 $('svg-example').onchange=()=>{
  const value=$('svg-example').value;
  $('svg-example-description').textContent=value===''?'Choose an example to try the preview and plotting controls.':SVGImport.examples[Number(value)].description+' Loads at its original size on the selected page.';
  controls();
 };
 $('svg-example-load').onclick=()=>perform(async()=>{
  const example=SVGImport.examples[Number($('svg-example').value)];
  setGuideMode(false);setPostcardMode(false);activeTheme=null;themeSource=null;job=null;svgPaths=null;currentGcode='';$('plot-ready').checked=false;$('plot-file').value='';draw();
  $('svg-rotation').value='0';
  $('plot-file-info').textContent='Checking '+example.name+'…';$('plot-estimate').textContent='';
  svgPaths=SVGImport.extractPaths(example.svg);svgName=example.name;$('svg-mode').value='actual';
  await applySVG();
 });
 $('svg-example-save').onclick=()=>{
  const example=SVGImport.examples[Number($('svg-example').value)];
  downloadSVG(example.svg,example.name);
 };
 $('guide-load').onclick=()=>perform(async()=>{
  PageGuides.create(pageOptions());
  setPostcardMode(false);
  setGuideMode(true);activeTheme=null;themeSource=null;$('plot-file').value='';
  await applySVG();
 });
 $('guide-save').onclick=()=>perform(()=>{const guide=PageGuides.create(pageOptions());downloadSVG(guide.svg,guide.name);});
 $('svg-apply').onclick=()=>perform(applySVG);
 $('svg-rotate').onclick=()=>perform(async()=>{
  $('svg-rotation').value=String((Number($('svg-rotation').value)+90)%360);
  await applySVG();
 });
 $('page-size').onchange=()=>{const custom=$('page-size').value==='custom';if(!custom){const [w,h]=$('page-size').value.split(',');$('page-width').value=w;$('page-height').value=h;}$('page-width').readOnly=!custom;$('page-height').readOnly=!custom;if(svgPaths)perform(applySVG);else {draw();controls();}};
 for(const id of ['page-width','page-height','svg-mode','svg-margin','svg-treatment','svg-spacing','svg-white','svg-rotation'])$(id).onchange=()=>{if(svgPaths)perform(applySVG);else {draw();controls();}};
 $('svg-download').onclick=()=>{if(!currentGcode)return;const url=URL.createObjectURL(new Blob([currentGcode],{type:'text/plain'}));const a=document.createElement('a');a.href=url;a.download=job.name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);};
 $('prepared-svg-download').onclick=()=>perform(async()=>{
  const {width,height}=pageOptions();
  const response=await fetch(`/api/job/svg?width=${width}&height=${height}`,{headers:{'X-Plotter-Token':token},signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw Error((await response.json()).error);
  downloadSVG(await response.text(),(job.name||'prepared-drawing').replace(/\.[^.]*$/,'')+'.svg');
 });
 for(const action of ['connect','disconnect','home','start','pause','continue','cancel','resume'])$('plot-'+action).onclick=()=>perform(async()=>{state=await request('action',{action,port:$('plot-port').value,job_id:job?.id,ready:$('plot-ready').checked,pen_index:state.pending_pen?.index});render();});
 $('plot-rehome').onclick=()=>perform(async()=>{state=await request('action',{action:'rehome',job_id:job?.id,rehome_ready:$('plot-rehome-ready').checked});render();});
 $('plot-rehome-ready').onchange=controls;
 $('plot-discard').onclick=()=>perform(async()=>{if(!window.confirm('Abandon recovery of this saved plot? This does not stop or move the plotter.'))return;state=await request('action',{action:'discard'});render();});
 async function applyTheme(theme){
   if(swatchSheet)throw Error('Swatches keep their labelled physical pen assignments. Load artwork to apply a theme.');
   if(guideSettings)throw Error('Load artwork before applying a colour theme. Positioning guides keep all their marks.');
   if(postcardSettings)throw Error('Choose the physical pen for postcard text in Plot drawing.');
   if(state.busy||!job?.paths?.length)throw Error('Load an idle drawing before applying a theme.');
   const status=await request('status');if(status.busy)throw Error('Wait for the current drawing to finish.');
   if(!themeSource)themeSource={paths:job.paths,colours:job.path_colours,name:job.name,gcode:currentGcode};
   await root.PersonalCatalogue.refresh();
   const result=DrawingThemes.applyTheme(themeSource,theme,inventory);
   $('plot-ready').checked=false;$('theme-error').textContent='';
   await loadDrawing(SVGImport.makeColourGcode(result.paths,result.colours,result.pens,pageOptions()),themeSource.name,false);
   $('theme-status').textContent=theme.name+' applied. Review the preview and pen order in Plot drawing before starting.';
   activeTheme=theme;$('plot-tab').click();
 }
 root.PlotterThemes={
  refreshControls:controls,
  apply:theme=>perform(()=>applyTheme(theme),'Applying '+theme.name+'…'),
  restore:()=>perform(async()=>{
   if(state.busy||!themeSource)return;
   const original=themeSource;
   $('plot-ready').checked=false;
   await loadDrawing(original.gcode,original.name,false);themeSource=null;activeTheme=null;
   $('theme-status').textContent='Original colours restored.';$('plot-tab').click();
  })
 };
 root.PlotterPostcard={load:async result=>{
  if(busy||state.busy||state.saved_plot)throw Error('Finish the current drawing or resolve saved recovery before preparing postcard text.');
  if(result.errors.length)throw Error('Correct the postcard layout before preparing it.');
  let loaded=false;
  await perform(async()=>{
   setGuideMode(false);setPostcardMode(true);activeTheme=null;themeSource=null;$('plot-file').value='';
   svgPaths=structuredClone(result.paths);svgPaths.colours=[...result.colours];svgPaths.width=148;svgPaths.height=105;svgName='postcard-text.svg';
   await applySVG();loaded=true;$('plot-tab').click();
  },'Preparing postcard text…');
  return loaded;
 }};
 root.PlotterText={load:async (result,name)=>{
  if(busy||state.busy||state.saved_plot)throw Error('Finish the current drawing or resolve saved recovery before preparing text.');
  if(!result?.paths?.length)throw Error('Correct the text before preparing it.');
  let loaded=false;
  await perform(async()=>{
   setGuideMode(false);setPostcardMode(false);activeTheme=null;themeSource=null;
   $('plot-file').value='';$('svg-rotation').value='0';$('svg-mode').value='fit';$('svg-treatment').value='outlines';
   svgPaths=structuredClone(result.paths);svgPaths.colours=[...result.colours];svgPaths.width=result.width;svgPaths.height=result.height;
   svgPaths.textDrawing=true;
   svgName=name.replace(/\.txt$/i,'')+'.svg';
   await applySVG();loaded=true;$('plot-tab').click();
  },'Preparing text drawing…');
  if(!loaded)throw Error($('plot-error').textContent||'Could not prepare text.');
  return loaded;
 }};
 root.PlotterSwatches={load:async sheet=>{
  if(busy||state.busy||state.saved_plot)throw Error('Finish the current drawing or resolve saved recovery before preparing swatches.');
  let loaded=false;
  await perform(async()=>{
   const text=root.PenSwatches.gcode(sheet,{profile:machineProfile()});
   setGuideMode(false);setPostcardMode(false);swatchSheet=true;selectPage(210,297);
   svgPaths=null;activeTheme=null;themeSource=null;job=null;currentGcode='';$('plot-file').value='';$('svg-rotation').value='0';$('plot-ready').checked=false;
   $('theme-status').textContent='Swatch sheets keep the labelled pen assignments and exact patch size. Load artwork to use themes.';
   await loadDrawing(text,'pen-swatches-sheet-'+sheet.number+'-of-'+sheet.total+'.gcode',false);
   loaded=true;$('plot-tab').click();
  },'Preparing pen swatches…');
  if(!loaded)throw Error($('plot-error').textContent||'Could not prepare swatches.');
  return loaded;
 }};
 $('plot-refresh').onclick=()=>perform(refreshPorts);$('plot-ready').onchange=controls;$('plot-travel').onchange=()=>{preview.showTravel($('plot-travel').checked).catch(error=>{$('plot-error').textContent=error.message;});};
 document.addEventListener('catalogue-changed',event=>{inventory=event.detail.pens;penListKey='';render();});
 async function poll(){try{state=await request('status');render();}catch(error){state={...state,phase:'unavailable',connected:false,busy:true};controls();$('plot-error').textContent='Cannot reach the Mac sender. Check the plotter locally; movement may continue. '+error.message;}setTimeout(poll,750);}
 root.addEventListener?.('plotter-profile-changed',()=>perform(async()=>{
  state=await request('status');job=null;currentGcode='';themeSource=null;activeTheme=null;
  setGuideMode(false);setPostcardMode(false);swatchSheet=false;$('plot-ready').checked=false;
  updateBed(machineProfile());await refreshPorts();
  $('plot-file-info').textContent='Plotter changed. Load a drawing or choose Apply placement to prepare it for this profile.';$('plot-estimate').textContent='';
  await draw();render();
 }));
 perform(async()=>{await root.PlotterProfiles?.ready;updateBed(machineProfile());const catalogue=await root.PersonalCatalogue.ready;inventory=catalogue.pens;await refreshPorts();const saved=await request('job');job=saved.job;currentGcode=saved.text||'';swatchSheet=currentGcode.startsWith('; SWATCH_SHEET v1\n');if(swatchSheet)selectPage(210,297);state=await request('status');updateBed(machineProfile());await describeJob();render();}).finally(poll);
})(typeof window==='undefined'?globalThis:window);
