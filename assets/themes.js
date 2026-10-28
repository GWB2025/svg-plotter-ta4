'use strict';
(function(){
 if(typeof module!=='undefined'&&module.exports){module.exports=require('./themes.json');return;}
 const $=id=>document.getElementById(id),tabs=['plot','text','postcard','themes','stock','inks','materials'].map(id=>$(id+'-tab'));
 function select(index){tabs.forEach((tab,i)=>{tab.setAttribute('aria-selected',String(i===index));tab.tabIndex=i===index?0:-1;$(tab.getAttribute('aria-controls')).hidden=i!==index;});}
 tabs.forEach((tab,index)=>{tab.onclick=()=>select(index);tab.onkeydown=event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?tabs.length-1:(index+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;select(next);tabs[next].focus();};});
 function node(tag,text,parent){const el=document.createElement(tag);if(text!==null)el.textContent=text;if(parent)parent.append(el);return el;}
 function action(text,description,parent,fn){const b=node('button',text,parent);b.type='button';b.title=description;b.dataset.help=description;b.onclick=fn;return b;}
 function display(data){
  const inventory=data.pens,byId=new Map(inventory.map(p=>[p.id,p]));
  const cards=data.themes.map(item=>{
   const card=node('article',null);card.className='theme-card';node('h3',item.name,card);node('p',item.match,card).className='theme-match';
   const swatches=node('div',null,card);swatches.className='theme-swatches';
   for(const colour of item.swatches){const swatch=node('span',null,swatches);swatch.style.backgroundColor=colour;swatch.title='Palette colour '+colour;swatch.setAttribute('role','img');swatch.setAttribute('aria-label','Palette colour '+colour);}
   node('p',item.note,card);const list=node('ul',null,card);
   for(const id of item.pens){const pen=byId.get(id);node('li',pen?PenInventory.label(pen)+(pen.available===false?' — unavailable':''):'Missing pen',list);}
   if(item.slots?.some(s=>!s.pen_id))node('li','Bare paper for selected colour groups',list);
   const unavailable=!!data.error||item.pens.some(id=>!byId.has(id)||byId.get(id).available===false);
   if(unavailable)node('p','Assign an available replacement pen before applying this theme.',card).className='theme-warning';
   const actions=node('div',null,card);actions.className='theme-actions';
   const apply=action('Apply to drawing','Recolour the loaded drawing using these pens. Review the resulting preview before plotting.',actions,()=>window.PlotterThemes?.apply(item));apply.className='theme-apply';apply.disabled=true;apply.dataset.unavailable=String(unavailable);
   const edit=action('Edit','Edit this theme for future use. The currently loaded drawing stays unchanged.',actions,()=>window.PersonalCatalogue.editTheme(item));edit.dataset.catalogueWrite='';edit.disabled=!!data.error;edit.setAttribute('aria-label','Edit theme '+item.name);
   const duplicate=action('Duplicate','Create a personal variation while retaining this theme.',actions,()=>window.PersonalCatalogue.editTheme(item,true));duplicate.dataset.catalogueWrite='';duplicate.disabled=!!data.error;duplicate.setAttribute('aria-label','Duplicate theme '+item.name);
   return card;
  });
  $('theme-cards').replaceChildren(...cards);window.PlotterThemes?.refreshControls();window.PersonalCatalogue.controls();
 }
 $('theme-restore').onclick=()=>window.PlotterThemes?.restore();
 document.addEventListener('catalogue-changed',event=>display(event.detail));
 window.PersonalCatalogue.ready.then(display).catch(error=>{$('theme-error').textContent=error.message;});
})();
