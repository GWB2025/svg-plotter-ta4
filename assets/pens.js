'use strict';
(function(root){
 function label(p){return (p.brand||'Pigma Micron')+' '+p.colour+' '+p.size+(p.reference?' — '+p.reference:'')+(p.ink_name?' · Ink: '+p.ink_name:'');}
 function suggest(colour,inventory){const available=inventory.filter(p=>p.available!==false);return (available.find(p=>(p.matches||[]).includes(colour.toLowerCase()))||available.find(p=>p.ink===colour.toLowerCase()))?.id||'';}
 function rgbToHex(rgb){
  if(!Array.isArray(rgb)||rgb.length!==3||rgb.some(n=>!['number','string'].includes(typeof n)||String(n).trim()===''||!Number.isInteger(Number(n))||Number(n)<0||Number(n)>255))throw Error('Enter whole RGB values from 0 to 255.');
  return '#'+rgb.map(n=>Number(n).toString(16).padStart(2,'0')).join('');
 }
 function hexToRgb(hex){
  if(!/^#[0-9a-f]{6}$/i.test(hex))throw Error('Enter a six-digit HEX colour.');
  return hex.slice(1).match(/../g).map(n=>parseInt(n,16));
 }
 const api={label,suggest,rgbToHex,hexToRgb};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 root.PenInventory=api;
})(typeof window==='undefined'?globalThis:window);
