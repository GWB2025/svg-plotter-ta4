'use strict';
(function(root) {
  const $ = id => document.getElementById(id);
  const token = document.querySelector('meta[name="plotter-token"]')?.content;
  if (!token) return;
  let data, current, locked = true, saving = false, editing = null;
  const fields = ['name','make','model','driver','width','height','x_direction','y_direction',
    'pen_up','pen_down','draw_feed','travel_feed','lift_feed','stroke_feed','baudrate',
    'usb_vid','usb_pid','banner'];
  const numeric = new Set(fields.filter(key => !['name','make','model','driver','banner'].includes(key)));
  async function request(action, item) {
    const response = await fetch('/api/profiles', {
      method:action ? 'POST' : 'GET',
      headers:{'X-Plotter-Token':token,...(action?{'Content-Type':'application/json'}:{})},
      ...(action?{body:JSON.stringify({action,item,revision:data.revision})}:{}),
      signal:AbortSignal.timeout(15000), cache:'no-store',
    });
    const result = await response.json();
    if (!response.ok) throw Error(result.error || 'Could not save the plotter profile.');
    return result;
  }
  function render() {
    if (!data) return;
    $('profile-select').replaceChildren(...data.profiles.map(profile => {
      const option = document.createElement('option');
      option.value = profile.id;
      option.textContent = profile.name + ' · ' + profile.width + ' × ' + profile.height + ' mm' + (profile.driver==='svg'?' · SVG export':'');
      return option;
    }));
    $('profile-select').value = current.id;
    $('profile-summary').textContent = current.driver === 'svg'
      ? current.make+' · '+current.model+' · Export prepared SVG paths and open them in this plotter’s own software.'
      : current.make+' · '+current.model+' · Home at top left (X0 Y0), '+(current.x_direction===1?'+':'−')+'X right, '+(current.y_direction===1?'+':'−')+'Y down · pen up Z'+current.pen_up+', down Z'+current.pen_down+'.';
    $('profile-lock-note').hidden = !locked;
    for (const id of ['profile-select','profile-add','profile-duplicate','profile-edit','profile-remove']) $(id).disabled=locked||saving;
    $('profile-edit').disabled ||= current.id==='ta4';
    $('profile-remove').disabled ||= current.id==='ta4';
    $('profile-save').disabled=locked||saving;
  }
  function changed() {
    root.dispatchEvent(new CustomEvent('plotter-profile-changed', {detail:current}));
  }
  async function refresh() {
    data = await request();
    current = data.profiles.find(p=>p.id===data.selected);
    render();
    return current;
  }
  async function perform(operation) {
    if (locked || saving) return;
    saving=true;render();$('profile-error').textContent='';$('profile-form-error').textContent='';
    try { await operation(); }
    catch(error) {
      $('profile-error').textContent=error.message;
      $('profile-form-error').textContent=error.message;
      // Keep the open form and its values so a failed save can be retried.
      try { await refresh(); } catch (_) {}
    } finally { saving=false;render(); }
  }
  function driverFields() {
    const exportOnly=$('profile-driver').value==='svg';
    $('profile-controller').hidden=exportOnly;
    $('profile-controller').disabled=exportOnly;
  }
  function openForm(duplicate=false, blank=false) {
    if(locked||saving)return;
    const source=blank?{...data.profiles[0],name:'',make:'',model:'',driver:'svg',usb_vid:null,usb_pid:null,banner:'Grbl'}:current;
    editing=duplicate||blank?null:current.id;
    for(const field of fields)$('profile-'+field).value=source[field]??'';
    if(duplicate)$('profile-name').value=current.name+' copy';
    $('profile-editor-title').textContent=editing?'Edit plotter':'Add plotter';
    $('profile-form-error').textContent='';driverFields();$('profile-editor').showModal();$('profile-name').focus();
  }
  $('profile-select').onchange=()=>{const id=$('profile-select').value;return perform(async()=>{
    data=await request('select',{id});current=data.profiles.find(p=>p.id===data.selected);changed();
  });};
  $('profile-add').onclick=()=>openForm(false,true);
  $('profile-duplicate').onclick=()=>openForm(true);
  $('profile-edit').onclick=()=>openForm();
  $('profile-close').onclick=()=>$('profile-editor').close();
  $('profile-driver').onchange=driverFields;
  $('profile-form').onsubmit=event=>{
    event.preventDefault();
    perform(async()=>{
      const item={id:editing};
      for(const field of fields) {
        const value=$('profile-'+field).value.trim();
        item[field]=numeric.has(field)?(value===''&&field.startsWith('usb_')?null:Number(value)):value;
      }
      const ids=new Set(data.profiles.map(p=>p.id));
      data=await request('save',item);
      const saved=editing?data.profiles.find(p=>p.id===editing):data.profiles.find(p=>!ids.has(p.id));
      if(data.selected!==saved.id)data=await request('select',{id:saved.id});
      current=data.profiles.find(p=>p.id===data.selected);
      $('profile-editor').close();changed();
    });
  };
  $('profile-remove').onclick=()=>perform(async()=>{
    if(!root.confirm('Remove '+current.name+' and return to the T-A4 profile?'))return;
    const id=current.id;
    data=await request('select',{id:'ta4'});
    data=await request('delete',{id});current=data.profiles[0];changed();
  });
  root.PlotterProfiles={
    get current(){return current;},
    ready:refresh(),
    setAvailability(available, activeProfile) {
      const was=locked;locked=!available;
      // A retained job carries its exact profile, even if a settings file changed.
      if(activeProfile&&current?.fingerprint!==activeProfile.fingerprint) {
        current=activeProfile;
        if(data&&!data.profiles.some(p=>p.id===current.id))data.profiles.push(current);
        render();
      } else if(was!==locked)render();
    },
  };
})(window);
