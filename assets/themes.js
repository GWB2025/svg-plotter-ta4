'use strict';
(function(){
 const themes=[{"name": "Shirokuro", "swatches": ["#f9f0de", "#392b24"], "pens": ["dark-brown-05"], "match": "Close match", "note": "Dark brown on bare card. A quiet, minimal palette."}, {"name": "Marunouchi", "swatches": ["#f9f0de", "#e51531"], "pens": ["red-05"], "match": "Close match", "note": "Red on bare card. A simple, bold accent."}, {"name": "Edo (three-colour version)", "swatches": ["#f9f0de", "#e51531", "#392b24"], "pens": ["red-05", "dark-brown-05"], "match": "Close match", "note": "Red and dark brown, with bare card supplying paperwhite."}, {"name": "Kinopio", "swatches": ["#f9f0de", "#d0bba3", "#392b24"], "pens": ["light-brown-05", "dark-brown-05"], "match": "Adaptation", "note": "Use sparse light-brown hatching for the pale beige, dark brown for contrast and bare card for white."}, {"name": "Kafica", "swatches": ["#f9f0de", "#d0bba3", "#927154"], "pens": ["light-brown-05"], "match": "Adaptation", "note": "Use two hatch densities of light brown to suggest beige and medium brown. Bare card supplies white."}, {"name": "Kyoto", "swatches": ["#f9f0de", "#c67333", "#927154", "#392b24"], "pens": ["orange-05", "light-brown-05", "dark-brown-05"], "match": "Adaptation · Dan’s postcard", "note": "Orange replaces caramel; light and dark brown complete the warm palette. Leave selected tiles unhatched."}, {"name": "Brubeck", "swatches": ["#f9f0de", "#1d1d1b", "#224870", "#d83715", "#f7f8e6"], "pens": ["blue-05", "red-05", "black-05"], "match": "Adaptation", "note": "Blue, red and black. The original blue is darker; combine both off-whites as bare card."}, {"name": "High Fashion", "swatches": ["#cd2525", "#c04483", "#2d8579", "#1a1921", "#ddd8d4"], "pens": ["red-05", "pink-05", "green-05", "black-05"], "match": "Adaptation", "note": "Red, pink, green and black. The original green is more teal; use bare card for the pale neutral."}, {"name": "Pops", "swatches": ["#a60a33", "#a61c5c", "#380140", "#f27329", "#d91604"], "pens": ["red-05", "pink-05", "purple-05-35780", "orange-05"], "match": "Adaptation", "note": "Red, pink, purple and orange simplify the original reds and purples. Bright and lively."}];
 if(typeof module!=='undefined'&&module.exports){module.exports=themes;return;}

 const plot=document.getElementById('plot-tab'),theme=document.getElementById('themes-tab');
 const tabs=[plot,theme];
 function select(index){
  tabs.forEach((tab,i)=>{tab.setAttribute('aria-selected',String(i===index));tab.tabIndex=i===index?0:-1;});
  document.getElementById('plot-panel').hidden=index!==0;
  document.getElementById('themes-panel').hidden=index!==1;
 }
 tabs.forEach((tab,index)=>{
  tab.onclick=()=>select(index);
  tab.onkeydown=event=>{
   if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
   event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?1:1-index;
   select(next);tabs[next].focus();
  };
 });
 function node(tag,text,parent){const el=document.createElement(tag);if(text)el.textContent=text;if(parent)parent.append(el);return el;}
 async function display(){
  const response=await fetch('/assets/pens.json',{cache:'no-store'});
  if(!response.ok)throw Error('Could not load your pen inventory. Reload the app.');
  const inventory=await response.json(),byId=new Map(inventory.map(p=>[p.id,p]));
  const grid=document.getElementById('theme-cards');
  for(const item of themes){
   const card=node('article',null,grid);card.className='theme-card';
   node('h3',item.name,card);node('p',item.match,card).className='theme-match';
   const swatches=node('div',null,card);swatches.className='theme-swatches';
   for(const colour of item.swatches){const swatch=node('span',null,swatches);swatch.style.backgroundColor=colour;swatch.title=colour;swatch.setAttribute('role','img');swatch.setAttribute('aria-label','Original palette colour '+colour);}
   node('p',item.note,card);
   const apply=node('button','Apply to drawing',card);apply.className='theme-apply';apply.disabled=true;apply.onclick=()=>window.PlotterThemes?.apply(item);
   const list=node('ul',null,card);
   for(const id of item.pens)node('li',PenInventory.label(byId.get(id)),list);
  }
 }
 document.getElementById('theme-restore').onclick=()=>window.PlotterThemes?.restore();
 display().catch(error=>{document.getElementById('theme-error').textContent=error.message;});
})();
