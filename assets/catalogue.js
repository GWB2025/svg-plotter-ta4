'use strict';
(function(root){
 const $=id=>document.getElementById(id);
 const token=document.querySelector('meta[name="plotter-token"]')?.content;
 if(!token)return;
 function node(tag,text,parent){const el=document.createElement(tag);if(text!==null)el.textContent=text;if(parent)parent.append(el);return el;}
 function help(el,text){el.title=text;el.dataset.help=text;return el;}
 function button(text,action,parent,description){const el=node('button',text,parent);el.type='button';el.onclick=action;if(description)help(el,description);return el;}
 function download(data,name){const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)+'\n'],{type:'application/json'}));const a=node('a',null,document.body);a.href=url;a.download=name;a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 class ColourReading {
  constructor(prefix){
   this.prefix=prefix;
   this.field('ink').oninput=()=>this.set(this.field('ink').value);
   this.field('ink-hex').oninput=()=>{this.edited=false;if(/^#[0-9a-f]{6}$/i.test(this.field('ink-hex').value))this.set(this.field('ink-hex').value);};
   for(const channel of ['red','green','blue'])this.field(channel).oninput=()=>{
    this.edited=true;
    try{const hex=PenInventory.rgbToHex(this.rgb());this.field('ink').value=hex;this.field('ink-hex').value=hex;}catch{/* Save reports incomplete or out-of-range RGB. */}
   };
  }
  field(name){return $(this.prefix+'-'+name);}
  rgb(){return ['red','green','blue'].map(name=>this.field(name).value);}
  set(hex){const rgb=PenInventory.hexToRgb(hex);this.edited=false;this.field('ink').value=hex.toLowerCase();this.field('ink-hex').value=hex;['red','green','blue'].forEach((name,i)=>{this.field(name).value=rgb[i];});}
  read(){return this.edited?PenInventory.rgbToHex(this.rgb()):this.field('ink-hex').value.trim();}
 }
 root.CatalogueUI={node,help,button,ColourReading};
 class PersonalCatalogue {
  constructor(){
   this.data=null;this.saving=false;this.pen=null;this.theme=null;this.importData=null;
   this.dialogs=['pen-editor','ink-editor','theme-editor','import-editor','about-dialog'];
   for(const id of this.dialogs){const dialog=$(id);dialog.removeAttribute('aria-modal');dialog.querySelector('[data-close]').onclick=()=>dialog.close();dialog.addEventListener('close',()=>{dialog.removeAttribute('aria-modal');this.opener?.focus();});}
   $('about-open').onclick=()=>this.open('about-dialog');
   $('pen-add').onclick=()=>this.editPen();
   $('theme-add').onclick=()=>this.editTheme();
   $('stock-search').oninput=()=>this.renderPens();
   $('stock-availability').onchange=()=>this.renderPens();
   $('catalogue-refresh').onclick=()=>this.run(()=>this.refresh());
   $('catalogue-export').onclick=()=>this.run(()=>this.export());
   $('catalogue-import').onchange=()=>this.readImport();
   $('import-confirm').onclick=()=>this.run(async()=>{await this.save('import',this.importData,this.importRevision);$('import-editor').close();$('catalogue-status').textContent='Import complete. Your existing pens, inks and themes have been retained.';},'import-error');
   $('pen-form').onsubmit=e=>{e.preventDefault();this.run(()=>this.savePen(),'pen-editor-error');};
   $('theme-form').onsubmit=e=>{e.preventDefault();this.run(()=>this.saveTheme(),'theme-editor-error');};
   $('theme-row-add').onclick=()=>{this.readRows();this.theme.slots.push({colour:'#f9f0de',pen_id:null});this.renderRows();};
   this.penReading=new ColourReading('pen');
   $('pen-bottle').onchange=()=>{$('pen-copy-ink').disabled=!$('pen-bottle').value;};
   $('pen-copy-ink').onclick=()=>{const ink=(this.data.inks||[]).find(i=>i.id===$('pen-bottle').value);if(ink)this.setInk(ink.ink);};
   this.ready=this.refresh().catch(error=>{$('catalogue-error').textContent=error.message;throw error;});
   // A failed initial request is also displayed by the plotting and theme views.
   this.ready.catch(()=>{});
  }
  async request(path,data){const response=await fetch('/api/'+path,{method:data?'POST':'GET',headers:{'X-Plotter-Token':token,...(data?{'Content-Type':'application/json'}:{})},...(data?{body:JSON.stringify(data)}:{}),cache:'no-store',signal:AbortSignal.timeout(15000)});const result=await response.json();if(!response.ok)throw Error(result.error||'Could not save the catalogue.');return result;}
  async export(){download(await this.request('catalogue/export'),'SVG-Plotter-Catalogue.json');}
  async refresh(){this.publish(await this.request('catalogue'));return this.data;}
  publish(data){this.data=data;this.renderPens();$('catalogue-error').textContent=data.error||'';document.dispatchEvent(new CustomEvent('catalogue-changed',{detail:data}));this.controls();}
  controls(){for(const id of ['pen-add','ink-add','theme-add','catalogue-import','catalogue-export','inks-import','inks-export'])$(id).disabled=this.saving||!this.data||!!this.data.error;for(const el of document.querySelectorAll('[data-catalogue-write]'))el.disabled=this.saving||!!this.data?.error;}
  async run(action,errorId='catalogue-error'){if(this.saving)return;this.saving=true;this.controls();$(errorId).textContent='';try{await action();}catch(error){$(errorId).textContent=error.message;}finally{this.saving=false;this.controls();}}
  async save(action,item,revision=this.data.revision){const result=await this.request('catalogue',{action,item,revision});this.publish(result);return result;}
  open(id){this.opener=document.activeElement;const dialog=$(id);document.body.append(dialog);dialog.setAttribute('aria-modal','true');dialog.showModal();}
  renderPens(){
   if(!this.data)return;
   const search=$('stock-search').value.trim().toLocaleLowerCase(),filter=$('stock-availability').value;
   const pens=this.data.pens.filter(p=>(filter==='all'||(p.available!==false)===(filter==='available'))&&[p.brand,p.colour,p.size,p.reference,p.set,p.ink_name].join(' ').toLocaleLowerCase().includes(search));
   $('stock-count').textContent=pens.length+' shown · '+this.data.pens.filter(p=>p.available!==false).length+' available · '+this.data.pens.length+' in your stock';
   const rows=pens.map(p=>{
    const row=node('tr',null);const swatch=node('td',null,row),chip=node('span',null,swatch);chip.className='ink-chip';chip.style.backgroundColor=p.ink;chip.setAttribute('role','img');chip.setAttribute('aria-label','Approximate ink '+p.ink);help(chip,'Approximate ink colour '+p.ink+'. Actual ink depends on the pen and paper.');
    const details=node('td',null,row);node('strong',p.brand+' '+p.colour,details);node('span',p.size+(p.reference?' · '+p.reference:''),details).className='stock-detail';
    if(p.ink_name)node('span','Ink: '+p.ink_name,details).className='stock-detail';
    node('td',p.set,row);
    const status=node('td',null,row),label=node('label',null,status);label.className='stock-check';const checkbox=node('input',null,label);checkbox.type='checkbox';checkbox.checked=p.available!==false;checkbox.dataset.catalogueWrite='';checkbox.setAttribute('aria-label','Available: '+PenInventory.label(p));help(checkbox,'Unavailable pens stay in your stock and saved jobs, but are excluded from new suggestions and theme application.');node('span',p.available!==false?'Available':'Unavailable',label);
    checkbox.onchange=()=>this.run(async()=>{try{await this.save('save_pen',{...p,available:checkbox.checked});}finally{this.renderPens();}});
    const actions=node('td',null,row);actions.className='stock-actions';
    const edit=button('Edit',()=>this.editPen(p),actions,'Change this pen for future drawing assignments. Existing drawings keep their saved pen details.');edit.dataset.catalogueWrite='';edit.setAttribute('aria-label','Edit '+PenInventory.label(p));
    const duplicate=button('Duplicate',()=>this.editPen(p,true),actions,'Create a separate pen using these details as a starting point.');duplicate.dataset.catalogueWrite='';duplicate.setAttribute('aria-label','Duplicate '+PenInventory.label(p));
    const sample=button('Swatch',()=>root.SwatchEditor?.selectPen(p),actions,'Prepare a labelled colour patch using this physical pen.');sample.disabled=p.available===false;sample.setAttribute('aria-label','Swatch '+PenInventory.label(p));return row;
   });
   $('stock-rows').replaceChildren(...rows);$('stock-empty').hidden=!!rows.length;this.controls();
  }
  editPen(pen=null,duplicate=false){
   this.pen=pen?structuredClone(pen):{brand:'',colour:'',size:'',reference:'',set:'My pens',ink:'#203832',available:true,matches:[]};
   if(duplicate){delete this.pen.id;this.pen.colour+=' (copy)';this.pen.matches=[];}
   this.penRevision=this.data.revision;
   $('pen-editor-title').textContent=duplicate?'Duplicate pen':pen?'Edit pen':'Add pen';
   for(const field of ['brand','colour','size','reference','set','ink'])$('pen-'+field).value=this.pen[field]||'';
   const select=$('pen-bottle'),none=node('option','No bottled ink / built-in pen ink');none.value='';select.replaceChildren(none);
   for(const ink of this.data.inks||[]){const option=node('option',ink.brand+' '+ink.colour+(ink.available===false?' (unavailable)':''),select);option.value=ink.id;option.disabled=ink.available===false&&ink.id!==this.pen.ink_id;}
   select.value=this.pen.ink_id||'';$('pen-copy-ink').disabled=!select.value;
   this.setInk(this.pen.ink);$('pen-available').checked=this.pen.available!==false;$('pen-editor-error').textContent='';this.open('pen-editor');
  }
  setInk(hex){this.penReading.set(hex);}
  async savePen(){
   const item={...this.pen};for(const field of ['brand','colour','size','reference','set'])item[field]=$('pen-'+field).value.trim();item.ink=this.penReading.read();item.ink_id=$('pen-bottle').value||null;item.available=$('pen-available').checked;
   await this.save('save_pen',item,this.penRevision);$('pen-editor').close();$('catalogue-status').textContent='Pen saved. Existing drawings keep their original pen details.';
  }
  editTheme(theme=null,duplicate=false){
   const byId=new Map(this.data.pens.map(p=>[p.id,p]));
   this.theme=theme?structuredClone(theme):{name:'',note:'',slots:[{colour:'#203832',pen_id:this.data.pens.find(p=>p.available!==false)?.id||null}],outline:null};
   if(!this.theme.slots){
    this.theme.slots=this.theme.pens.map(id=>({colour:byId.get(id).ink,pen_id:id}));
    const luminance=slot=>slot.colour.slice(1).match(/../g).reduce((sum,v,i)=>sum+parseInt(v,16)*[.2126,.7152,.0722][i],0);
    this.theme.outline=this.theme.slots.reduce((best,s,i)=>luminance(s)<luminance(this.theme.slots[best])?i:best,0);
   }
   if(duplicate){delete this.theme.id;this.theme.name+=' (copy)';}
   this.themeRevision=this.data.revision;
   $('theme-editor-title').textContent=duplicate?'Duplicate theme':theme?'Edit theme':'Create theme';
   $('theme-name').value=this.theme.name;$('theme-note').value=this.theme.note;$('theme-editor-error').textContent='';this.renderRows();this.open('theme-editor');
  }
  readRows(){this.theme.slots=[...$('theme-rows').children].map(row=>({colour:row.querySelector('input[type=color]').value,pen_id:row.querySelector('select').value||null}));this.theme.outline=$('theme-outline').value===''?null:Number($('theme-outline').value);}
  renderRows(){
   const rows=this.theme.slots.map((slot,index)=>{
    const row=node('div',null);row.className='palette-row';node('span',String(index+1),row).className='palette-number';
    const colourLabel=node('label','Palette colour',row),colour=node('input',null,colourLabel);colour.type='color';colour.value=slot.colour;help(colour,'The digital palette swatch. The drawing preview uses the assigned pen’s approximate ink colour.');colour.setAttribute('aria-label','Palette colour '+(index+1));
    const label=node('label','Physical pen',row),select=node('select',null,label);select.setAttribute('aria-label','Pen for palette row '+(index+1));help(select,'Assign a pen from your stock, or leave this colour group as bare paper.');const paper=node('option','Leave as bare paper',select);paper.value='';
    for(const pen of this.data.pens){const option=node('option',PenInventory.label(pen)+(pen.available===false?' (unavailable)':''),select);option.value=pen.id;option.disabled=pen.available===false&&pen.id!==slot.pen_id;}
    select.value=slot.pen_id||'';select.onchange=()=>{const pen=this.data.pens.find(p=>p.id===select.value);colour.value=pen?.ink||'#f9f0de';};
    const actions=node('div',null,row);actions.className='palette-actions';
    const move=delta=>{this.readRows();const target=index+delta;[this.theme.slots[index],this.theme.slots[target]]=[this.theme.slots[target],this.theme.slots[index]];if(this.theme.outline===index)this.theme.outline=target;else if(this.theme.outline===target)this.theme.outline=index;this.renderRows();};
    const up=button('↑',()=>move(-1),actions,'Move this palette row earlier.');up.disabled=index===0;up.setAttribute('aria-label','Move row '+(index+1)+' up');
    const down=button('↓',()=>move(1),actions,'Move this palette row later.');down.disabled=index===this.theme.slots.length-1;down.setAttribute('aria-label','Move row '+(index+1)+' down');
    const remove=button('Remove',()=>{this.readRows();this.theme.slots.splice(index,1);if(this.theme.outline===index)this.theme.outline=null;else if(this.theme.outline>index)this.theme.outline--;this.renderRows();},actions,'Remove this row from the theme. The pen stays in your stock.');remove.disabled=this.theme.slots.length===1;remove.setAttribute('aria-label','Remove palette row '+(index+1));return row;
   });
   $('theme-rows').replaceChildren(...rows);
   const outline=$('theme-outline');outline.replaceChildren();const none=node('option','No separate outline colour',outline);none.value='';this.theme.slots.forEach((_,i)=>{const option=node('option','Row '+(i+1),outline);option.value=String(i);});outline.value=this.theme.outline===null?'':String(this.theme.outline);
   $('theme-row-add').disabled=this.theme.slots.length>=32;
  }
  async saveTheme(){this.readRows();const item={name:$('theme-name').value.trim(),note:$('theme-note').value.trim(),slots:this.theme.slots,outline:this.theme.outline};if(this.theme.id)item.id=this.theme.id;await this.save('save_theme',item,this.themeRevision);$('theme-editor').close();$('theme-error').textContent='';$('theme-status').textContent='Theme saved. Apply it to a drawing when you are ready.';}
  async readImport(inputId='catalogue-import'){
   const file=$(inputId).files[0];$(inputId).value='';if(!file)return;
   await this.run(async()=>{if(file.size>2*1024*1024)throw Error('Choose a backup smaller than 2 MB.');let data;try{data=JSON.parse(await file.text());}catch{throw Error('This is not a valid JSON backup.');}if(data?.format!=='svg-plotter-catalogue'||![1,2].includes(data.schema)||!Array.isArray(data.pens)||!Array.isArray(data.themes)||(data.schema===2&&!Array.isArray(data.inks)))throw Error('Choose an SVG Plotter catalogue backup.');this.importData=data;this.importRevision=this.data.revision;$('import-summary').textContent=file.name+' contains '+data.pens.length+' pens, '+(data.inks?.length||0)+' inks and '+data.themes.length+' themes.';$('import-error').textContent='';this.open('import-editor');},inputId==='inks-import'?'inks-error':'catalogue-error');
  }
 }
 root.PersonalCatalogue=new PersonalCatalogue();
})(window);
