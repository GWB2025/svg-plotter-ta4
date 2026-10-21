'use strict';
(function(root){
 const inks={Red:'#c93f55',Green:'#219d80',Blue:'#2685bd',Purple:'#7b1fa2',
  'Light Brown':'#a97850',Orange:'#df7b28',Pink:'#d86294','Dark Brown':'#493126',Black:'#000000'};
 function recolour(source,penIds,inventory){
  if(!source.paths.length||source.paths.length!==source.colours.length||!penIds.length)throw Error('Load a drawing before applying a theme.');
  const palette=penIds.map(id=>{const pen=inventory.find(p=>p.id===id);if(!pen||!inks[pen.colour])throw Error('Unknown theme pen: '+id);return {id,colour:inks[pen.colour]};});
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
 const api={recolour};if(typeof module!=='undefined'&&module.exports)module.exports=api;
 root.DrawingThemes=api;
})(typeof window==='undefined'?globalThis:window);
