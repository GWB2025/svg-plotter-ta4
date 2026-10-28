'use strict';
(function(root){
 const inks={Red:'#c93f55',Green:'#219d80',Blue:'#2685bd',Purple:'#7b1fa2',
  'Light Brown':'#a97850',Orange:'#df7b28',Pink:'#d86294','Dark Brown':'#493126',Black:'#000000'};
 function recolour(source,penIds,inventory){
  if(!source.paths.length||source.paths.length!==source.colours.length||!penIds.length)throw Error('Load a drawing before applying a theme.');
  const palette=penIds.map(id=>{const pen=inventory.find(p=>p.id===id);if(!pen||!(pen.ink||inks[pen.colour]))throw Error('Unknown theme pen: '+id);return {id,colour:pen.ink||inks[pen.colour]};});
  const luminance=p=>{const c=p.colour.slice(1).match(/../g).map(x=>parseInt(x,16));return .2126*c[0]+.7152*c[1]+.0722*c[2];};
  const darkest=palette.reduce((a,b)=>luminance(a)<luminance(b)?a:b);
  const accents=palette.filter(p=>p.id!==darkest.id);
  const groups=[...new Set(source.colours)];
  const mapping=new Map(groups.map((colour,i)=>[colour,
   palette.length===1?palette[0]:i===groups.length-1?darkest:accents[i%accents.length]]));
  const colours=source.colours.map(c=>mapping.get(c).colour);
  const pens=Object.fromEntries([...mapping.values()].map(p=>[p.colour,p.id]));
  return {paths:source.paths,colours,pens};
 }
 function applyTheme(source,theme,inventory){
  const ids=theme.slots?[...new Set(theme.slots.map(s=>s.pen_id).filter(Boolean))]:theme.pens;
  const seen=new Map();
  for(const id of ids||[]){
   const pen=inventory.find(p=>p.id===id);
   if(!pen)throw Error('A theme pen is missing. Edit the theme to choose another pen.');
   if(pen.available===false)throw Error('A theme pen is unavailable: '+pen.colour+'. Choose a replacement or mark it available in Pen stock.');
   const ink=pen.ink||inks[pen.colour];
   if(!ink)throw Error('Set an ink swatch for '+pen.colour+' in Pen stock.');
   if(seen.has(ink)&&seen.get(ink)!==id)throw Error('Two different pens use the same ink swatch. Choose one of them for this theme.');
   seen.set(ink,id);
  }
  if(!theme.slots)return recolour(source,ids,inventory);
  if(!source.paths.length||source.paths.length!==source.colours.length)throw Error('Load a drawing before applying a theme.');
  const palette=theme.slots.map(slot=>slot.pen_id?{id:slot.pen_id,colour:inventory.find(p=>p.id===slot.pen_id).ink||inks[inventory.find(p=>p.id===slot.pen_id).colour]}:null);
  const outline=Number.isInteger(theme.outline)?theme.outline:null;
  const accents=palette.filter((_,i)=>i!==outline);
  const groups=[...new Set(source.colours)];
  const mapping=new Map(groups.map((colour,i)=>[colour,outline!==null&&i===groups.length-1?palette[outline]:(accents.length?accents[i%accents.length]:palette[outline])]));
  const paths=[],colours=[],pens={};
  source.paths.forEach((path,i)=>{const pen=mapping.get(source.colours[i]);if(pen){paths.push(path);colours.push(pen.colour);pens[pen.colour]=pen.id;}});
  if(!paths.length)throw Error('This palette leaves the entire drawing as bare paper. Assign a pen to its colour group.');
  return {paths,colours,pens};
 }
 const api={recolour,applyTheme};if(typeof module!=='undefined'&&module.exports)module.exports=api;
 root.DrawingThemes=api;
})(typeof window==='undefined'?globalThis:window);
