'use strict';
(function(root) {
  const WIDTH=148, HEIGHT=105, HALF=74, POINT_MM=25.4/72;
  const names={message:'Message',address:'Address'};
  const aliases={'’':"'",'‘':"'",'…':'...', '\t':'    '};
  const fail=message=>{throw Error(message);};
  function number(value,label,min,max){
    if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max)
      fail(label+' must be between '+min+' and '+max+'.');
    return value;
  }
  function bounds(paths){
    let left=Infinity,top=Infinity,right=-Infinity,bottom=-Infinity;
    for(const path of paths)for(const [x,y] of path){left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);}
    return left===Infinity?null:[left,top,right,bottom];
  }
  function validate(doc,fonts){
    if(!doc||doc.format!=='svg-plotter-postcard'||doc.schema!==1||typeof doc.divider!=='boolean')fail('Choose a valid postcard layout.');
    for(const key of Object.keys(names)){
      const b=doc[key],label=names[key];
      if(!b||typeof b.text!=='string'||b.text.length>(key==='message'?2000:600))fail(label+' text is too long or invalid.');
      if(typeof b.enabled!=='boolean'||!fonts.some(font=>font.id===b.font)||!['left','centre','right'].includes(b.align))fail('Choose valid '+label.toLowerCase()+' settings.');
      if(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(b.text))fail(label+' contains unsupported control characters.');
      for(const [field,min,max] of [['size',6,40],['spacing',2,25],['x',0,148],['y',0,105],['width',1,148]])number(b[field],label+' '+field,min,max);
    }
  }
  function blockLayout(block,font,key){
    const label=names[key],errors=[],paths=[],lines=[],unknown=new Set();let points=0;
    if(!block.enabled)return {paths,lines,bounds:null,errors};
    const scale=block.size*POINT_MM/font.units;
    const text=block.text.replace(/\r\n?/g,'\n').normalize('NFC')
      .replace(/[’‘…\t]/g,character=>aliases[character]);
    function glyph(character){
      if(Object.hasOwn(font.glyphs,character))return font.glyphs[character];
      unknown.add(character);return font.glyphs['?'];
    }
    function measure(line){
      let advance=0,min=0,max=0;
      for(const character of line){const g=glyph(character);if(g.bounds){min=Math.min(min,advance+g.bounds[0]);max=Math.max(max,advance+g.bounds[2]);}advance+=g.advance;}
      return {width:(Math.max(max,advance)-min)*scale,offset:-min*scale};
    }
    const wrapped=[];
    for(const paragraph of text.split('\n')){
      const words=paragraph.match(/\S+/gu)||[];
      if(!words.length){wrapped.push('');continue;}
      let line='';
      for(const word of words){const candidate=line?line+' '+word:word;
        if(line&&measure(candidate).width>block.width){wrapped.push(line);line=word;}
        else line=candidate;
      }
      wrapped.push(line);
    }
    let previous=null;
    for(const [index,line] of wrapped.entries()){
      const metrics=measure(line),baseline=block.y+font.cap_height*scale+index*block.spacing;
      const start=block.x+metrics.offset+(block.align==='right'?block.width-metrics.width:block.align==='centre'?(block.width-metrics.width)/2:0);
      const linePaths=[];let advance=0;
      for(const character of line){const g=glyph(character);
        for(const stroke of g.paths){
          points+=stroke.length;if(points>240000)fail(label+' is too complex to plot. Use less text or a simpler font.');
          linePaths.push(stroke.map(([x,y])=>[start+(advance+x)*scale,baseline-y*scale]));
        }
        advance+=g.advance;
      }
      const box=bounds(linePaths);
      if(metrics.width>block.width+1e-6)errors.push(label+' has a word wider than its text box. Widen the box or reduce the text size.');
      if(box&&previous&&box[1]<previous[3]+0.2)errors.push(label+' lines overlap. Increase the line spacing.');
      previous=box;
      lines.push({text:line,width:metrics.width,baseline,bounds:box});paths.push(...linePaths);
    }
    if(unknown.size)errors.push(label+' font does not contain: '+[...unknown].join(' ') + '. Choose another font or replace these characters.');
    const box=bounds(paths),left=key==='message'?0:HALF,right=key==='message'?HALF:WIDTH;
    if(block.x<left||block.x+block.width>right+1e-6)errors.push(label+' text box must stay within the '+(key==='message'?'left':'right')+' half of the card. Adjust X or width.');
    if(box&&(box[0]<left-1e-6||box[2]>right+1e-6||box[1]<0||box[3]>HEIGHT))errors.push(label+' text extends outside its half of the postcard. Move it, reduce its size or use fewer lines.');
    return {paths,lines,bounds:box,errors:[...new Set(errors)]};
  }
  function layout(doc,fonts){
    validate(doc,fonts);
    const blocks={},paths=[],errors=[];
    for(const key of Object.keys(names)){
      blocks[key]=blockLayout(doc[key],fonts.find(font=>font.id===doc[key].font),key);
      paths.push(...blocks[key].paths);errors.push(...blocks[key].errors);
    }
    if(doc.divider)paths.push([[HALF,6],[HALF,99]]);
    if(!paths.length)errors.push('Enter message or address text, or enable the divider line.');
    return {width:WIDTH,height:HEIGHT,paths,colours:paths.map(()=>'#000000'),blocks,errors,bounds:bounds(paths)};
  }
  function svg(result){
    if(result.errors.length)fail('Adjust the postcard layout: '+result.errors.join(' '));
    const n=value=>String(Number(value.toFixed(4)));
    return [
      '<svg xmlns="http://www.w3.org/2000/svg" width="148mm" height="105mm" viewBox="0 0 148 105" data-plotter-postcard="text-v1">',
      '<title>Postcard message and address</title>',
      '<desc>Plot at actual size with the postcard at the top-left home position. Text is stored as pen paths. Layout guides are not plotted.</desc>',
      '<g fill="none" stroke="#000000" stroke-width="0.3" stroke-linecap="round" stroke-linejoin="round">',
      ...result.paths.map(path=>'<path d="'+path.map(([x,y],i)=>(i?'L':'M')+n(x)+' '+n(y)).join(' ')+'"/>'),
      '</g>','</svg>','',
    ].join('\n');
  }
  const api={layout,svg,validate};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.PostcardLayout=api;
})(typeof window==='undefined'?globalThis:window);
