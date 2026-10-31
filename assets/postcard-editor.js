'use strict';
(function(root){
  const $=id=>document.getElementById(id),ns='http://www.w3.org/2000/svg';
  const token=document.querySelector('meta[name="plotter-token"]')?.content;
  if(!token)return;
  function node(tag,text,parent){const el=document.createElement(tag);if(text!==null)el.textContent=text;if(parent)parent.append(el);return el;}
  function help(el,text){el.title=text;el.dataset.help=text;return el;}
  const numeric={size:['Text size (pt)',6,40,.5],spacing:['Line spacing (mm)',2,25,.1],x:['X from left (mm)',0,148,.5],y:['Y from top (mm)',0,105,.5],width:['Text box width (mm)',1,148,.5]};
  class PostcardEditor{
    constructor(){
      this.document=null;this.result=null;this.saving=false;this.allowed=false;this.blocked=false;this.history=[];this.index=-1;this.lastSaved='';
      $('postcard-guides').onchange=()=>this.render();
      $('postcard-printed').onchange=()=>this.render();
      $('postcard-divider').onchange=()=>this.change();
      $('postcard-save').onclick=()=>this.save();
      $('postcard-export').onclick=()=>this.export();
      $('postcard-prepare').onclick=()=>this.prepare();
      $('postcard-undo').onclick=()=>this.restore(this.index-1);
      $('postcard-redo').onclick=()=>this.restore(this.index+1);
      $('postcard-font-import').onclick=()=>$('postcard-font-files').click();
      $('postcard-font-files').onchange=()=>this.importFonts();
      $('postcard-reset').onclick=()=>{
        this.document=this.read();for(const key of ['message','address'])for(const field of ['x','y','width'])this.document[key][field]=this.defaults[key][field];
        this.write();this.change();
      };
      this.ready=this.start();
      this.ready.catch(error=>{$('postcard-error').textContent=error.message;});
    }
    async request(data){
      const response=await fetch('/api/postcard',{method:data?'POST':'GET',headers:{'X-Plotter-Token':token,...(data?{'Content-Type':'application/json'}:{})},...(data?{body:JSON.stringify(data)}:{}),cache:'no-store',signal:AbortSignal.timeout(15000)});
      const result=await response.json();if(!response.ok)throw Error(result.error||'Could not save the postcard draft.');return result;
    }
    async start(){
      const [snapshot,saved]=await Promise.all([this.request(),root.PlotterFonts.load()]);
      this.fonts=root.PlotterFonts.fonts;
      $('postcard-font-status').textContent=saved.error||'Imported fonts are shared with Text & ASCII art.';
      this.document=snapshot.document;this.defaults=snapshot.defaults;this.revision=snapshot.revision;this.blocked=!!snapshot.error;
      for(const key of ['message','address'])this.fields(key);
      this.write();this.lastSaved=JSON.stringify(this.document);this.remember();this.render();
      root.PlotterFonts.subscribe(result=>this.updateFonts(result.fonts));
      $('postcard-error').textContent=snapshot.error||'';
      $('postcard-draft-status').textContent=this.revision==='new'?'No saved draft yet.':'Saved draft restored.';
      $('postcard-divider').disabled=false;
      $('postcard-font-import').disabled=false;
      for(const [id,text] of Object.entries({
        'postcard-guides':'Show text-box boundaries and the postcard centre in the preview. These guides are never plotted.',
        'postcard-printed':'Show an approximate printed-card reference with address lines and stamp space. It is never exported or plotted.',
        'postcard-divider':'Add one plotted vertical line between the message and address.',
        'postcard-save':'Save both text blocks and their layout settings on this Mac for the next session.',
        'postcard-export':'Save the actual pen paths as a 148 × 105 mm SVG, with no font installation needed.',
        'postcard-prepare':'Load this exact layout into Plot drawing. Review the pen and confirm readiness there before starting.',
        'postcard-reset':'Restore the default text-box positions and widths while retaining your text, fonts, sizes and spacing.',
        'postcard-undo':'Undo the last postcard text or layout change.',
        'postcard-redo':'Reapply an undone postcard change.'
      }))help($(id),text);
    }
    fields(key){
      const title=key==='message'?'Message · left side':'Postal address · right side';
      const card=node('fieldset',null,$('postcard-fields'));card.className='postcard-block';node('legend',title,card);
      const enabled=node('label',null,card);enabled.className='inline-check';const checkbox=node('input',null,enabled);checkbox.type='checkbox';checkbox.id='pc-'+key+'-enabled';node('span','Include '+(key==='message'?'message':'address'),enabled);help(checkbox,'Include this block when exporting and preparing to plot. Untick to plot only the other block.');
      const label=node('label',key==='message'?'Your message':'Postal address',card);label.className='postcard-text-label';const text=node('textarea',null,label);text.id='pc-'+key+'-text';text.rows=4;text.maxLength=key==='message'?2000:600;text.placeholder=key==='message'?'Type your message here…':'Recipient name\nHouse number and street\nTown or city\nPOSTCODE';help(text,'Enter text and line breaks. Words wrap within the text box; blank lines are retained.');
      const settings=node('div',null,card);settings.className='postcard-settings';
      const fontLabel=node('label','Font',settings),font=node('select',null,fontLabel);font.id='pc-'+key+'-font';fontLabel.className='postcard-font';
      for(const item of this.fonts){const option=node('option',item.name+(item.kind==='outline'?' · outline':''),font);option.value=item.id;}help(font,'Choose a bundled stroke font or an imported outline font. The preview shows the actual pen paths.');
      const note=node('p',null,settings);note.id='pc-'+key+'-font-note';note.className='subtle postcard-font-note';
      for(const [field,[title,min,max,step]] of Object.entries(numeric)){
        const label=node('label',title,settings),input=node('input',null,label);input.type='number';input.id='pc-'+key+'-'+field;input.min=min;input.max=max;input.step=step;
        help(input,field==='size'?'Font size in points. One point is 0.353 mm of the font’s em square.':field==='spacing'?'Distance between successive text baselines, in millimetres.':field==='x'?'Horizontal position of the text box from the postcard’s left edge.':field==='y'?'Vertical position of the top of an ordinary capital letter from the postcard’s top edge.':'Width used to wrap and align text, in millimetres. Keep the box within its half of the card.');
      }
      const alignLabel=node('label','Alignment',settings),align=node('select',null,alignLabel);align.id='pc-'+key+'-align';
      for(const value of ['left','centre','right']){const option=node('option',value[0].toUpperCase()+value.slice(1),align);option.value=value;}
      help(align,'Align each line within this text box.');
      for(const input of card.querySelectorAll('input,textarea,select'))input.addEventListener('input',()=>this.change());
    }
    read(){
      const doc=structuredClone(this.document);doc.divider=$('postcard-divider').checked;
      for(const key of ['message','address'])for(const field of Object.keys(doc[key])){
        const el=$('pc-'+key+'-'+field);doc[key][field]=field==='enabled'?el.checked:Object.hasOwn(numeric,field)?el.valueAsNumber:el.value;
      }
      return doc;
    }
    write(){
      $('postcard-divider').checked=this.document.divider;
      for(const key of ['message','address'])for(const [field,value] of Object.entries(this.document[key])){
        const el=$('pc-'+key+'-'+field);if(field==='enabled')el.checked=value;else el.value=value??'';
      }
    }
    remember(){
      const value=JSON.stringify(this.document);if(this.history[this.index]===value)return;
      this.history.splice(this.index+1);this.history.push(value);if(this.history.length>80)this.history.shift();this.index=this.history.length-1;
    }
    change(){
      this.document=this.read();this.remember();
      $('postcard-draft-status').textContent=JSON.stringify(this.document)===this.lastSaved?'Draft matches the saved version.':'Unsaved changes — choose Save draft to keep this version.';
      clearTimeout(this.timer);this.result=null;this.valid=false;this.controls();this.timer=setTimeout(()=>this.render(),120);
    }
    restore(index){if(index<0||index>=this.history.length)return;this.index=index;this.document=JSON.parse(this.history[index]);this.write();$('postcard-draft-status').textContent='Layout restored. Save draft to keep this version.';this.render();}
    setPlotAvailability(allowed){this.allowed=allowed;this.controls();}
    controls(){
      $('postcard-save').disabled=!this.document||this.saving||this.blocked||!this.valid;
      $('postcard-export').disabled=!this.result||!!this.result.errors.length;
      $('postcard-prepare').disabled=!this.allowed||!this.result||!!this.result.errors.length||this.preparing;
      $('postcard-undo').disabled=this.index<1;$('postcard-redo').disabled=this.index>=this.history.length-1;
      $('postcard-reset').disabled=!this.document;
      $('postcard-plot-status').textContent=this.allowed?'':'You can edit this draft while a drawing is active. Finish the drawing or resolve saved recovery before preparing another layout.';
    }
    render(){
      if(!this.document)return;
      for(const key of ['message','address']){
        const font=this.fonts.find(f=>f.id===this.document[key].font);
        $('pc-'+key+'-font-note').textContent=font?.kind==='outline'?'Outline font · plots both edges of each stroke. '+font.credit:'Single-line stroke font.';
      }
      this.valid=false;this.result=null;
      let errors=[];
      try{this.result=PostcardLayout.layout(this.document,this.fonts);this.valid=true;errors=this.result.errors;}catch(error){errors=[error.message];}
      $('postcard-errors').replaceChildren(...errors.map(message=>node('li',message)));
      const svg=$('postcard-preview');svg.replaceChildren();
      const shape=(tag,attributes,text)=>{const el=document.createElementNS(ns,tag);for(const [key,value] of Object.entries(attributes))el.setAttribute(key,value);if(text)el.textContent=text;svg.append(el);return el;};
      if($('postcard-printed').checked){
        shape('path',{d:'M75 14V92 M80 49H143 M80 61H143 M80 73H143 M80 85H143',fill:'none',stroke:'#c4c0b5','stroke-width':.2});
        shape('rect',{x:124,y:4,width:20,height:26,fill:'none',stroke:'#c4c0b5','stroke-width':.2,'stroke-dasharray':'.5 .5'});
        shape('text',{x:134,y:18,'text-anchor':'middle',fill:'#b1aa9c','font-size':2.3},'Stamp');
      }
      if($('postcard-guides').checked){
        shape('path',{d:'M74 4V101',fill:'none',stroke:'#b7c7bc','stroke-width':.25,'stroke-dasharray':'1.5 1.5'});
        for(const key of ['message','address']){const b=this.document[key];if(!b.enabled||![b.x,b.y,b.width].every(Number.isFinite))continue;
          shape('rect',{x:b.x,y:b.y,width:b.width,height:Math.max(1,99-b.y),fill:'none',stroke:this.result?.blocks[key].errors.length?'#b64b40':'#b7c7bc','stroke-width':.25,'stroke-dasharray':'1 1'});
        }
      }
      if(this.result){
        const d=this.result.paths.map(path=>path.map(([x,y],i)=>(i?'L':'M')+x.toFixed(4)+' '+y.toFixed(4)).join(' ')).join(' ');
        shape('path',{d,fill:'none',stroke:'#203832','stroke-width':.3,'stroke-linecap':'round','stroke-linejoin':'round'});
        for(const [key,title] of [['message','Your message'],['address','Postal address']])if(!this.document[key].text&&this.document[key].enabled)shape('text',{x:key==='message'?12:85,y:key==='message'?24:50,fill:'#9aa99e','font-size':3},title);
        const m=this.result.blocks.message.lines.length,a=this.result.blocks.address.lines.length;
        $('postcard-summary').textContent=errors.length?'Adjust the layout before exporting or plotting.':m+' message lines · '+a+' address lines · exact pen-path preview.';
      }else $('postcard-summary').textContent='Complete the highlighted settings to update the preview.';
      this.controls();
    }
    async save(){
      if(!this.valid||this.saving||this.blocked)return;
      this.saving=true;this.controls();$('postcard-error').textContent='';
      const document=structuredClone(this.document);
      try{const result=await this.request({document,revision:this.revision});this.revision=result.revision;this.lastSaved=JSON.stringify(result.document);$('postcard-draft-status').textContent=JSON.stringify(this.document)===this.lastSaved?'Draft saved on this Mac.':'Earlier changes saved; newer edits are still unsaved.';}
      catch(error){$('postcard-error').textContent=error.message;}finally{this.saving=false;this.controls();}
    }
    export(){
      if(!this.result||this.result.errors.length)return;
      const url=URL.createObjectURL(new Blob([PostcardLayout.svg(this.result)],{type:'image/svg+xml'}));
      const a=node('a',null,document.body);a.href=url;a.download='postcard-text.svg';a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
    }
    async prepare(){
      if(!this.result||this.result.errors.length||!this.allowed)return;
      this.preparing=true;this.controls();$('postcard-error').textContent='';
      try{const result=structuredClone(this.result);if(await root.PlotterPostcard.load(result))$('postcard-draft-status').textContent='Layout prepared in Plot drawing. Save draft to keep the editable text and settings.';}
      catch(error){$('postcard-error').textContent=error.message;}finally{this.preparing=false;this.controls();}
    }
    updateFonts(fonts){
      this.fonts=fonts;
      // Keep edits, undo history and both font selections when either tab imports.
      for(const key of ['message','address']){
        const select=$('pc-'+key+'-font'),selected=select.value;select.replaceChildren();
        for(const font of fonts){const option=node('option',font.name+(font.kind==='outline'?' · outline':''),select);option.value=font.id;}
        select.value=selected;
      }
      this.render();
    }
    async importFonts(){
      const input=$('postcard-font-files'),files=[...input.files];if(!files.length||this.importing)return;
      this.importing=true;$('postcard-font-import').disabled=true;$('postcard-font-status').textContent='Reading fonts…';
      try{
        const result=await root.PlotterFonts.importFiles(files);
        $('postcard-font-status').textContent=result.added?result.added+' fonts added. Available here and in Text & ASCII art.':'These fonts are already available. Existing drafts and fonts were kept.';
      }catch(error){$('postcard-font-status').textContent=error.message+' Existing fonts and draft have been kept.';}
      finally{this.importing=false;$('postcard-font-import').disabled=false;input.value='';}
    }
  }
  root.PostcardEditor=new PostcardEditor();
})(window);
