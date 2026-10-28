'use strict';
const $ = id => document.getElementById(id);
const pad = $('pad'), ctx = pad.getContext('2d');
let mode = 'practice', character = 'a', strokes = [], active = null, origin = null;
let reviewSettings = {};
let reviewDirty = false;
let samples = {}, busy = false, svgURL = null;
const drafts = {};
let characterDefinition = null;
let groupId = 'lowercase';
function selectedGroup() {
  return characterDefinition?.groups.find(group => group.id === groupId) || {characters:''};
}
function captureHint() {
  return 'Write one character. Capitals reach the top guide; g, j, p, q and y extend below the baseline. Keep punctuation at its natural height. Review can adjust size and baseline.';
}
let writingLocked = false;
function setWritingLock(locked) {
  writingLocked = locked;
  document.documentElement.classList.toggle('writing-locked', locked);
  $('writingLock').textContent = locked ? 'Unlock page' : 'Lock page for writing';
  $('writingLock').setAttribute('aria-pressed', String(locked));
}
$('writingLock').onclick = () => {
  // Unlock must remain available even after a missed Pencil release.
  if(writingLocked) { cancel(); setWritingLock(false); }
  else if(!active) setWritingLock(true);
};
// Non-passive handlers also cover Safari's native pinch and rubber-band gestures.
// Keep touchstart untouched so deliberate taps on buttons still work.
for(const type of ['touchmove', 'gesturestart', 'gesturechange']) {
  document.addEventListener(type, e => {
    const control = e.target.closest?.('button, input, select, a');
    if(writingLocked && e.cancelable && !(type === 'touchmove' && control && e.touches.length === 1)) e.preventDefault();
  }, {passive:false});
}
document.addEventListener('keydown', e => {
  if(e.key === 'Escape') { cancel(); setWritingLock(false); }
});
function status(message) { $('captureStatus').textContent = message; }
function draw() {
  ctx.setTransform(2,0,0,2,0,0); ctx.clearRect(0,0,400,300);
  ctx.lineWidth = 0.7; ctx.strokeStyle = '#cbd8cf'; ctx.setLineDash([5,5]);
  for (const y of [60,120,220,280]) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(400,y); ctx.stroke(); }
  ctx.beginPath(); ctx.moveTo(200,0); ctx.lineTo(200,300); ctx.stroke(); ctx.setLineDash([]);
  ctx.strokeStyle = '#182d39'; ctx.fillStyle = '#182d39'; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const s of [...strokes, ...(active ? [active] : [])]) {
    ctx.beginPath(); s.points.forEach((p,i) => i ? ctx.lineTo(p.x,p.y) : ctx.moveTo(p.x,p.y)); ctx.stroke();
    if(s.points.length === 1) { const p=s.points[0]; ctx.beginPath(); ctx.arc(p.x,p.y,1,0,2*Math.PI); ctx.fill(); }
  }
}
function addPoint(e) {
  const r = pad.getBoundingClientRect();
  if(origin === null) origin = e.timeStamp;
  const previous = active.points.at(-1)?.timestamp ?? strokes.at(-1)?.points.at(-1)?.timestamp ?? 0;
  const p = {x:Math.max(0,Math.min(400,(e.clientX-r.left)*400/r.width)), y:Math.max(0,Math.min(300,(e.clientY-r.top)*300/r.height)), timestamp:Math.max(previous,e.timeStamp-origin)};
  for(const key of ['pressure','tiltX','tiltY','twist','altitudeAngle','azimuthAngle']) p[key] = Number.isFinite(e[key]) ? e[key] : null;
  active.points.push(p);
}
function traceInput(event, e) {
  const pointerType=e?.pointerType || '';
  const touchTypes=e?.changedTouches ? Array.from(e.changedTouches,t=>t.touchType || 'unknown').join(',') : '';
  const message=`Input check: ${event} ${pointerType || touchTypes}.`;
  $('inputDiagnostic').textContent=message;
  fetch('/api/input-diagnostics', {method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({event,pointerType,touchTypes,active:!!active,busy,locked:writingLocked,version:'input-check-1'})}).catch(()=>{});
}
pad.addEventListener('touchstart',e=>traceInput('touchstart',e),{passive:true});
pad.addEventListener('touchend',e=>traceInput('touchend',e),{passive:true});
pad.addEventListener('pointerdown',e=>traceInput('pointerdown',e),true);
window.addEventListener('pointerup',e=>{if(active || e.target===pad) traceInput('pointerup',e);},true);
window.addEventListener('pointercancel',e=>{if(active || e.target===pad) traceInput('pointercancel',e);},true);

pad.addEventListener('pointerdown', e => {
  if(e.pointerType === 'touch' && !$('touch').checked) { e.preventDefault(); return; }
  if(busy) { status('Still saving — wait for the saved message before drawing.'); return; }
  if(active || (e.pointerType === 'mouse' && e.button !== 0)) return;
  e.preventDefault();
  active = {pointerId:e.pointerId,pointerType:e.pointerType,points:[]};
  $('inputType').textContent = e.pointerType === 'pen' ? 'Pencil / pen detected' : `${e.pointerType} input`;
  addPoint(e); draw();
  // Begin drawing before capture: a capture failure must not swallow first contact.
  try { pad.setPointerCapture(e.pointerId); } catch (_) {
    status('Pencil contact received. Drawing continues without pointer capture.');
  }
});
window.addEventListener('pointermove', e => {
  if(!active || e.pointerId !== active.pointerId) return;
  e.preventDefault(); const events = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
  for(const point of events.length ? events : [e]) addPoint(point);
  draw();
});
function releaseActive() {
  if(!active) return false;
  const id=active.pointerId;
  active=null; // Clear first: releasing capture can synchronously dispatch lostpointercapture.
  if(pad.hasPointerCapture(id)) pad.releasePointerCapture(id);
  return true;
}
function finishStroke(e) {
  if(!active || e.pointerId !== active.pointerId) return;
  addPoint(e);
  const {pointerId,...stroke}=active;
  releaseActive(); strokes.push(stroke); draw();
}
function cancel(e) {
  if(active && (!e || e.pointerId === active.pointerId)) {
    releaseActive(); draw(); status('Interrupted stroke discarded. Please draw that stroke again.');
  }
}
// Catch releases outside the canvas as well as normal captured releases.
window.addEventListener('pointerup', finishStroke, true);
window.addEventListener('pointercancel', cancel, true);
// Losing capture alone is not a cancelled stroke. Window listeners still
// receive moves and release; pointercancel/blur handle real interruptions.
pad.addEventListener('lostpointercapture', e => {
  if(active && e.pointerId === active.pointerId) status('Drawing contact retained. Lift the Pencil to finish the stroke.');
});
window.addEventListener('blur', ()=>cancel());
document.addEventListener('visibilitychange', ()=>{if(document.hidden) cancel();});
function remember() { if(mode === 'capture') drafts[character] = {strokes,origin}; }
function loadDraft() { const d=drafts[character]; strokes=d?.strokes || []; origin=d?.origin ?? null; }
function switchMode(next) {
  if(busy || active) return;
  setWritingLock(false);
  remember(); mode = next;
  if(mode === 'capture') loadDraft(); else { strokes=[]; origin=null; }
  $('writePanel').hidden = !['practice','capture'].includes(mode);
  $('reviewPanel').hidden = mode !== 'review';
  if(mode === 'review') renderReview(); $('previewPanel').hidden = mode !== 'preview';
  $('autoNextOption').hidden = mode !== 'capture';
  $('characterGroupOption').hidden = !['capture','review'].includes(mode);
  $('letters').hidden = mode !== 'capture'; $('save').hidden = mode !== 'capture'; $('next').hidden = mode !== 'practice';
  $('heading').textContent = mode === 'practice' ? 'Get comfortable' : 'Capture your handwriting';
  $('instruction').textContent = mode === 'practice' ? 'Practise an a inside the guides. Practice marks are never saved.' : captureHint();
  for(const name of ['practice','capture','preview','review']) { $(name+'Tab').removeAttribute('aria-current'); if(name===mode) $(name+'Tab').setAttribute('aria-current','step'); }
  $('target').textContent = mode === 'practice' ? 'a' : character;
  status(mode === 'practice' ? 'Practice only — nothing on this page is saved.' : 'Only Save writes this drawing to your Mac.');
  renderLetters(); draw();
}
function renderLetters() {
  $('letters').replaceChildren();
  for(const c of selectedGroup().characters) {
    const b=document.createElement('button'); b.textContent=`${c} · ${samples[c]?.length || 0} saved`;
    b.className=c===character?'selected':''; b.setAttribute('aria-pressed',String(c===character));
    b.onclick=()=>{ if(busy || active)return; remember(); character=c; loadDraft(); $('target').textContent=c; renderLetters(); draw(); status(`Write ${c}, then save. Existing saved samples are kept.`); };
    $('letters').append(b);
  }
  $('save').textContent=`Save ${character}`;
}
$('characterGroup').onchange=()=>{
  if(busy || active) { $('characterGroup').value=groupId; return; }
  remember(); groupId=$('characterGroup').value;
  character=selectedGroup().characters[0]; loadDraft();
  $('target').textContent=character;
  renderLetters(); draw();
  if(mode==='review') renderReview();
};
for(const name of ['practice','capture','preview','review']) $(name+'Tab').onclick=()=>switchMode(name);
$('next').onclick=()=>switchMode('capture');
$('undo').onclick=()=>{
  if(busy) {status('Saving — please wait before undoing.'); return;}
  const removed=releaseActive() || Boolean(strokes.pop());
  if(!strokes.length) origin=null;
  remember(); draw(); status(removed ? 'Last unsaved stroke removed.' : 'Nothing to undo. Saved samples are kept in Review samples.');
};
$('clear').onclick=()=>{
  if(busy) {status('Saving — please wait before clearing.'); return;}
  releaseActive(); strokes=[]; origin=null; remember(); draw();
  status('Drawing area cleared. Saved samples are kept in Review samples.');
};
async function api(url, body) {
  const response=await fetch(url,body ? {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)} : {});
  if(!response.ok) { const error=await response.json(); throw new Error(error.error || 'Request failed.'); }
  return response;
}
$('save').onclick=async()=>{
  if(busy || active)return;
  if(!characterDefinition) { status('Wait for the character groups to load.'); return; }
  if(!strokes.length) { status('Draw the letter before saving.'); return; }
  busy=true; $('save').disabled=true;
  try {
    const record=await (await api('/api/samples',{character,strokes})).json();
    const savedCharacter=character;
    (samples[character] ||= []).push(record); strokes=[]; origin=null; remember();
    const nextCharacter=HandwritingMetrics.next(character,selectedGroup());
    if($('autoNext').checked && nextCharacter) {
      character=nextCharacter;
      loadDraft();
      $('target').textContent=character;
      status(`Saved ${savedCharacter}. Now write ${character}${strokes.length ? ' — your unfinished drawing is restored' : ''}.`);
    } else {
      status($('autoNext').checked ? `Saved ${character}. This group is complete; choose another group, review or compose.` : `Saved ${character}. Review or compose to check its position.`);
    }
    renderLetters(); draw();
  } catch(e) { status(`Could not save: ${e.message} Your drawing is still here.`); }
  finally { busy=false; $('save').disabled=false; }
};
function clearPreview() {
  if(svgURL) URL.revokeObjectURL(svgURL); svgURL=null;
  $('download').hidden=true; $('download').removeAttribute('href'); $('preview').replaceChildren();
}
$('phrase').addEventListener('input',clearPreview);
$('selection').addEventListener('change',clearPreview);
$('compose').onclick=async()=>{
  clearPreview(); $('compose').disabled=true; $('phrase').disabled=true;
  try {
    const svg=await (await api('/api/compose',{text:$('phrase').value,selection:$('selection').value})).text();
    const doc=new DOMParser().parseFromString(svg,'image/svg+xml');
    $('preview').append(document.importNode(doc.documentElement,true));
    svgURL=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml'}));
    $('download').href=svgURL; $('download').hidden=false; $('previewStatus').textContent='Ready to download. Each pen stroke is a separate path.';
  } catch(e) { $('previewStatus').textContent=e.message; }
  finally { $('compose').disabled=false; $('phrase').disabled=false; }
};
window.addEventListener('beforeunload',e=>{ remember(); if(reviewDirty || active || (mode==='capture' && strokes.length) || Object.values(drafts).some(d=>d.strokes.length)) { e.preventDefault(); e.returnValue=''; } });
(async()=>{ draw(); try {
  characterDefinition=await (await api('/api/characters')).json();
  $('characterGroup').replaceChildren();
  for(const group of characterDefinition.groups) {
    const option=document.createElement('option');option.value=group.id;option.textContent=group.label;
    $('characterGroup').append(option);
  }
  $('characterGroup').value=groupId;
  samples=await (await api('/api/samples')).json();
  reviewSettings=await (await api('/api/review')).json(); renderLetters();
} catch(e) { status(`Cannot load saved characters: ${e.message}. Check the server is running.`); } })();

function renderReview() {
  $('reviewCards').replaceChildren();
  for(const c of selectedGroup().characters) {
    const title=document.createElement('h3'); title.textContent=c; $('reviewCards').append(title);
    const records=samples[c] || [];
    if(!records.length) { const p=document.createElement('p'); p.textContent='No samples yet.'; $('reviewCards').append(p); }
    records.forEach((r,i)=>{
      const config=reviewSettings[r.id] ||= {enabled:i===records.length-1,scale:1,shift:0};
      const card=document.createElement('div'); card.className='sample-card';
      const canvas=document.createElement('canvas'); canvas.width=400; canvas.height=300;
      canvas.setAttribute('aria-label',`${c} sample ${i+1}`);
      const paint=()=>{
        const g=canvas.getContext('2d'); g.clearRect(0,0,400,300);
        g.strokeStyle='#cad6cf'; g.lineWidth=1;
        for(const y of [60,120,220,280]) {g.beginPath();g.moveTo(0,y);g.lineTo(400,y);g.stroke();}
        const bottom=HandwritingMetrics.anchor(r,characterDefinition);
        g.strokeStyle='#182d39';g.lineWidth=2;g.lineCap='round';
        for(const st of r.strokes) {g.beginPath(); st.points.forEach((p,j)=>{const x=200+(p.x-200)*config.scale,y=220+(p.y-bottom)*config.scale+config.shift;j?g.lineTo(x,y):g.moveTo(x,y);});g.stroke();}
      };
      card.append(canvas);
      const info=document.createElement('div');
      const feedback=document.createElement('p'); feedback.className='sample-feedback';
      feedback.setAttribute('role','status'); feedback.setAttribute('aria-live','polite');
      const changed=()=>{
        reviewDirty=true;
        const invalid=[...info.querySelectorAll('input[type=number]')].some(input=>input.value==='' || !input.checkValidity());
        feedback.textContent=invalid ? 'Not applied: size must be 50–150% and shift -3 to +3 mm.' : `Preview updated: ${Math.round(config.scale*100)}% size, ${(config.shift*.1).toFixed(1)} mm shift. ${config.enabled ? 'Enabled' : 'Excluded'}. Not saved yet.`;
        feedback.classList.toggle('invalid',invalid);
        $('reviewStatus').textContent=invalid ? 'Check the highlighted sample before saving.' : 'Unsaved changes — press Save adjustments.';
      };
      const label=document.createElement('label'), enabled=document.createElement('input');enabled.type='checkbox';enabled.checked=config.enabled;
      enabled.onchange=()=>{config.enabled=enabled.checked; changed(); if(enabled.checked) info.querySelector('input[type=number]')?.focus();};
      label.append(enabled,document.createTextNode(` Use ${c} sample ${i+1}`));info.append(label);
      for(const [key,name,factor,min,max,step] of [['scale','Size (%)',100,50,150,1],['shift','Baseline shift (mm)',.1,-3,3,.1]]) {
        const l=document.createElement('label'),input=document.createElement('input');input.type='number';input.inputMode=key==='scale'?'decimal':'text';input.addEventListener('focus',()=>input.select());input.addEventListener('click',()=>input.select());input.min=min;input.max=max;input.step=step;input.value=String(Math.round(config[key]*factor*100)/100);
        input.oninput=()=>{input.setAttribute('aria-invalid',String(input.value==='' || !input.checkValidity()));if(input.value!=='' && input.checkValidity()){config[key]=Number(input.value)/factor;paint();}changed();};
        l.append(document.createTextNode(name+' '),input);info.append(l);
      }
      info.append(feedback);
      card.append(info);$('reviewCards').append(card);paint();
    });
  }
}
$('saveReview').onclick=async()=>{
  if([...$('reviewCards').querySelectorAll('input[type=number]')].some(i=>i.value==='' || !i.checkValidity())) {$('reviewStatus').textContent='Please enter sizes from 50–150% and shifts from -3 to +3 mm.';return;}
  $('saveReview').disabled=true;
  $('reviewStatus').textContent='Saving adjustments…';
  const controls=[...$('reviewCards').querySelectorAll('input')];
  controls.forEach(input=>input.disabled=true);
  try {reviewSettings=await (await api('/api/review',reviewSettings)).json();clearPreview();reviewDirty=false;$('reviewStatus').textContent='✓ Saved on this Mac. Generate a new phrase preview to use these settings.';
    $('reviewCards').querySelectorAll('.sample-feedback').forEach(p=>{p.textContent='✓ Settings saved';p.classList.remove('invalid');});}
  catch(e){$('reviewStatus').textContent='Could not save: '+e.message+' Your changes are still here; please retry.';}
  finally{$('saveReview').disabled=false;controls.forEach(input=>input.disabled=false);}
};
