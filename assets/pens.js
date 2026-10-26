'use strict';
(function(root){
 function label(p){return (p.brand||'Pigma Micron')+' '+p.colour+' '+p.size+' — '+p.reference;}
 function suggest(colour,inventory){return inventory.find(p=>(p.matches||[]).includes(colour.toLowerCase()))?.id||'';}
 const api={label,suggest};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 root.PenInventory=api;
})(typeof window==='undefined'?globalThis:window);
