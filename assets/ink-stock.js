'use strict';
(function(root){
  if(!root.PersonalCatalogue)return;
  const $=id=>document.getElementById(id);
  const {node,button,ColourReading}=root.CatalogueUI;
  class InkStock {
    constructor(catalogue){
      this.catalogue=catalogue;
      this.reading=new ColourReading('bottle');
      $('ink-add').onclick=()=>this.edit();
      $('inks-search').oninput=()=>this.render();
      $('inks-availability').onchange=()=>this.render();
      $('inks-refresh').onclick=()=>catalogue.run(()=>catalogue.refresh(),'inks-error');
      $('inks-export').onclick=()=>catalogue.run(()=>catalogue.export(),'inks-error');
      $('inks-import').onchange=()=>catalogue.readImport('inks-import');
      $('ink-form').onsubmit=event=>{event.preventDefault();catalogue.run(()=>this.save(),'ink-editor-error');};
      document.addEventListener('catalogue-changed',()=>this.render());
      catalogue.ready.then(()=>this.render()).catch(error=>{$('inks-error').textContent=error.message;});
    }
    render(){
      const data=this.catalogue.data;if(!data)return;
      const all=data.inks||[],words=$('inks-search').value.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean),filter=$('inks-availability').value;
      const inks=all.filter(ink=>{
        const text=[ink.brand,ink.colour,ink.kind,ink.reference,ink.lightfastness,ink.waterproof,ink.paper,ink.notes].join(' ').toLocaleLowerCase();
        return words.every(word=>text.includes(word))&&(filter==='all'||(ink.available!==false)===(filter==='available'));
      });
      const rows=inks.map(ink=>{
        const row=node('tr',null),colour=node('td',null,row),chip=node('span',null,colour);chip.className='ink-chip';chip.style.backgroundColor=ink.ink;chip.setAttribute('role','img');chip.setAttribute('aria-label','Ink colour '+ink.ink);
        node('span',ink.ink,colour).className='stock-detail';
        const identity=node('td',null,row);node('strong',ink.brand+' '+ink.colour,identity);node('span',ink.kind+(ink.reference?' · '+ink.reference:''),identity).className='stock-detail';
        const used=data.pens.filter(p=>p.ink_id===ink.id);node('span',used.length+' linked pen'+(used.length===1?'':'s'),identity).className='stock-detail';
        const notes=node('td',null,row);notes.className='ink-record-notes';
        for(const [label,value] of [['Lightfastness',ink.lightfastness||'Unknown'],['Water resistance',ink.waterproof||'Unknown'],['Paper',ink.paper],['Notes',ink.notes]])if(value)node('span',label+': '+value,notes).className='stock-detail';
        const availability=node('td',null,row),label=node('label',null,availability),check=node('input',null,label);label.className='stock-check';check.type='checkbox';check.checked=ink.available!==false;check.dataset.catalogueWrite='';check.setAttribute('aria-label','Available: '+ink.brand+' '+ink.colour);node('span',check.checked?'Available':'Unavailable',label);
        check.onchange=()=>this.catalogue.run(async()=>{try{await this.catalogue.save('save_ink',{...ink,available:check.checked});}finally{this.render();}},'inks-error');
        const actions=node('td',null,row);actions.className='stock-actions';
        for(const [text,duplicate] of [['Edit',false],['Duplicate',true]]){const b=button(text,()=>this.edit(ink,duplicate),actions);b.dataset.catalogueWrite='';b.setAttribute('aria-label',text+' ink '+ink.brand+' '+ink.colour);}
        return row;
      });
      $('inks-rows').replaceChildren(...rows);$('inks-count').textContent=inks.length+' shown · '+all.filter(i=>i.available!==false).length+' available · '+all.length+' in your stock';
      $('inks-empty').hidden=!!rows.length;$('inks-empty').textContent=all.length?'No inks match your search.':'No inks yet. Choose Add ink to record your first bottle.';
      $('inks-error').textContent=data.error||'';this.catalogue.controls();
    }
    edit(ink=null,duplicate=false){
      this.item=ink?structuredClone(ink):{brand:'',colour:'',kind:'Unspecified',reference:'',lightfastness:'Unknown',waterproof:'Unknown',paper:'',notes:'',ink:'#203832',available:true};
      if(duplicate){delete this.item.id;this.item.colour+=' (copy)';}
      this.revision=this.catalogue.data.revision;
      $('ink-editor-title').textContent=duplicate?'Duplicate ink':ink?'Edit ink':'Add ink';
      for(const field of ['brand','colour','kind','reference','lightfastness','waterproof','paper','notes'])$('bottle-'+field).value=this.item[field]||'';
      this.reading.set(this.item.ink);$('bottle-available').checked=this.item.available!==false;$('ink-editor-error').textContent='';
      this.catalogue.open('ink-editor');
    }
    async save(){
      const item={...this.item};
      for(const field of ['brand','colour','kind','reference','lightfastness','waterproof','paper','notes'])item[field]=$('bottle-'+field).value.trim();
      item.ink=this.reading.read();item.available=$('bottle-available').checked;
      await this.catalogue.save('save_ink',item,this.revision);
      $('ink-editor').close();$('inks-status').textContent='Ink saved. Pen readings and loaded drawings are unchanged.';
    }
  }
  root.InkStock=new InkStock(root.PersonalCatalogue);
})(window);
