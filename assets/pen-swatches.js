'use strict';
(function(root) {
  const fail = message => { throw Error(message); };
  const SVG = typeof module !== 'undefined' && module.exports ? require('./svg-import.js') : root.SVGImport;
  const WIDTH = 210, HEIGHT = 297, MARGIN = 12, TOP = 24;

  function label(text, font, x, y, width) {
    const scale = 2.1 / font.cap_height;
    const glyph = char => font.glyphs[char] || font.glyphs['?'];
    const measure = text => {
      let advance=0, min=0, max=0;
      for(const char of text) {
        const g=glyph(char);
        if(g.bounds) { min=Math.min(min,advance+g.bounds[0]); max=Math.max(max,advance+g.bounds[2]); }
        advance+=g.advance;
      }
      return {min,width:(Math.max(advance,max)-min)*scale};
    };
    text = String(text).normalize('NFC');
    if(measure(text).width > width) {
      let shortened = text;
      while(shortened.length && measure(shortened+'...').width > width) shortened=shortened.slice(0,-1);
      text=shortened+'...';
    }
    const paths=[], offset=-measure(text).min;
    let advance=0;
    for(const char of text) {
      const g=glyph(char);
      for(const path of g.paths) paths.push(path.map(([px,py])=>[x+(offset+advance+px)*scale,y+2.1-py*scale]));
      advance+=g.advance;
    }
    return {text,paths};
  }

  function fill(patch, spacing, vertical=false) {
    const {x,y,size}=patch, rows=Math.ceil(size/spacing), step=size/rows, path=[];
    for(let row=0;row<rows;row++) {
      const across=(row+.5)*step, start=row%2?size:0, end=size-start;
      path.push(...(vertical ? [[x+across,y+start],[x+across,y+end]] : [[x+start,y+across],[x+end,y+across]]));
    }
    return path;
  }

  function create(pens, options={}, font) {
    if(!Array.isArray(pens)||!pens.length||pens.length>1000) fail('Choose between 1 and 1,000 pens.');
    if(!font?.glyphs?.['?']||!Number.isFinite(font.cap_height)||font.cap_height<=0) fail('The swatch label font is unavailable.');
    const size=Number(options.size??20), spacing=Number(options.spacing??.3), crossHatch=!!options.crossHatch;
    if(!Number.isFinite(size)||size<10||size>30) fail('Choose a patch size between 10 and 30 mm.');
    if(!Number.isFinite(spacing)||spacing<.02||spacing>1) fail('Choose line spacing between 0.02 and 1 mm.');
    const ids=new Set();
    for(const pen of pens) {
      if(!/^[a-z0-9-]{1,60}$/.test(pen.id)||!/^#[0-9a-f]{6}$/i.test(pen.ink)) fail('Choose a valid pen from your stock.');
      if(pen.available===false) fail('This pen is unavailable. Mark it available in Pen stock before making a swatch.');
      if(ids.has(pen.id)) fail('Duplicate pen in swatch selection.');
      ids.add(pen.id);
    }
    const columns=Math.floor((WIDTH-2*MARGIN)/Math.max(44,size+16));
    const cellWidth=(WIDTH-2*MARGIN)/columns, cellHeight=size+20;
    const rows=Math.floor((HEIGHT-MARGIN-TOP)/cellHeight), capacity=columns*rows;
    const sheets=[], total=Math.ceil(pens.length/capacity);
    for(let start=0;start<pens.length;start+=capacity) {
      const number=sheets.length+1, entries=pens.slice(start,start+capacity).map((source,i)=>{
        const pen=structuredClone(source), number=start+i+1;
        const left=MARGIN+(i%columns)*cellWidth, top=TOP+Math.floor(i/columns)*cellHeight;
        const patch={x:left+(cellWidth-size)/2,y:top,size};
        const fillPaths=[fill(patch,spacing)];
        if(crossHatch)fillPaths.push(fill(patch,spacing,true));
        const labels=[String(number).padStart(2,'0')+' '+pen.colour,pen.brand+' '+pen.size,pen.reference||pen.id]
          .map((text,j)=>label(text,font,left+2,top+size+3+j*4,cellWidth-4));
        const labelPaths=labels.flatMap(l=>l.paths);
        return {number,pen,patch,fillPaths,labelPaths,labelLines:labels.map(l=>l.text),paths:[...fillPaths,...labelPaths]};
      });
      const title='Pen swatches - '+(options.title||pens[0].set||'Selected pens')+' - sheet '+number+'/'+total;
      const header=label(title,font,MARGIN,14,WIDTH-2*MARGIN);
      entries[0].paths=[...header.paths,...entries[0].paths];
      sheets.push({number,total,width:WIDTH,height:HEIGHT,size,spacing,crossHatch,title,entries});
    }
    return {sheets,count:pens.length,size,spacing,crossHatch};
  }

  function gcode(sheet, options = {}) {
    if(!sheet?.entries?.length)fail('Prepare a swatch sheet first.');
    const header=SVG.makeGcode([[[0,0],[1,1]]],options).trim().split('\n').slice(0,options.profile?.fingerprint?3:2);
    if(options.profile&&(options.profile.width<210||options.profile.height<297))throw Error('Swatch sheets need a 210 × 297 mm bed.');
    const lines=['; SWATCH_SHEET v1',...header];
    // Preserve physical pen identities even when two digital ink colours match.
    for(const entry of sheet.entries) {
      if(!/^[a-z0-9-]{1,60}$/.test(entry.pen.id)||!/^#[0-9a-f]{6}$/i.test(entry.pen.ink))fail('Invalid swatch pen.');
      lines.push('; PEN_CHANGE '+entry.pen.ink.toLowerCase()+' '+entry.pen.id);
      lines.push(...SVG.makeGcode(entry.paths,options).trim().split('\n').slice(header.length));
    }
    return lines.join('\n')+'\n';
  }

  const api={create,gcode};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.PenSwatches=api;
})(typeof window==='undefined'?globalThis:window);
