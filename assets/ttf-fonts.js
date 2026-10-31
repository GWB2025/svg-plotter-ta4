'use strict';
(function(root){
  const MAX_BYTES=2*1024*1024, MAX_POINTS=450000;
  function parse(buffer,parser){
    if(!(buffer instanceof ArrayBuffer)||buffer.byteLength<12||buffer.byteLength>MAX_BYTES)throw Error('Choose a TrueType font smaller than 2 MB.');
    const signature=new DataView(buffer).getUint32(0);
    if(signature!==0x00010000&&signature!==0x74727565)throw Error('Choose a .ttf TrueType font. SVG fonts and other file types need a different importer.');
    let font;try{font=parser.parse(buffer);}catch{throw Error('This TrueType font could not be read. The existing fonts have been kept.');}
    if(!Number.isFinite(font.unitsPerEm)||font.unitsPerEm<16||font.unitsPerEm>16384||!Number.isInteger(font.numGlyphs)||font.numGlyphs<1||font.numGlyphs>10000)throw Error('This font has unsupported dimensions or too many characters.');
    const name=String(font.getEnglishName('fullName')||font.getEnglishName('fontFamily')||'Imported font').slice(0,120);
    return {font,name,credit:String(font.getEnglishName('copyright')||'').slice(0,500)};
  }
  // Turn each font contour into a separate plotter path. Closing a contour
  // deliberately traces its outline; this is never a centre-line conversion.
  function contours(commands,tolerance=0.015){
    if(!Array.isArray(commands)||commands.length>20000)throw Error('A font character is too complex.');
    const paths=[];let points=[],p=null,start=null,total=0;
    const point=(x,y)=>{if(!Number.isFinite(x)||!Number.isFinite(y)||Math.abs(x)>100000||Math.abs(y)>100000)throw Error('Invalid font coordinates.');return [x,y];};
    function add(q){if(++total>100000)throw Error('A font character is too complex.');if(!points.length||q[0]!==points.at(-1)[0]||q[1]!==points.at(-1)[1])points.push(q);p=q;}
    function finish(){if(points.length>1)paths.push(points);points=[];p=null;start=null;}
    const mid=(a,b)=>a.map((v,i)=>(v+b[i])/2);
    function curve(poly,depth=0){
      const a=poly[0],z=poly.at(-1),dx=z[0]-a[0],dy=z[1]-a[1],length=Math.hypot(dx,dy);
      const error=Math.max(...poly.slice(1,-1).map(b=>length?Math.abs(dy*b[0]-dx*b[1]+z[0]*a[1]-z[1]*a[0])/length:Math.hypot(b[0]-a[0],b[1]-a[1])));
      // Also bound control-polygon length: collinear curves can turn back.
      const excess=poly.slice(1).reduce((s,b,i)=>s+Math.hypot(b[0]-poly[i][0],b[1]-poly[i][1]),0)-length;
      if(error<=tolerance&&excess<=tolerance){add(z);return;}
      if(depth>=18)throw Error('A font curve is too complex.');
      const rows=[poly];while(rows.at(-1).length>1)rows.push(rows.at(-1).slice(1).map((b,i)=>mid(rows.at(-1)[i],b)));
      curve(rows.map(r=>r[0]),depth+1);curve(rows.map(r=>r.at(-1)).reverse(),depth+1);
    }
    for(const c of commands){
      if(c.type==='M'){finish();start=point(c.x,c.y);add(start);}
      else if(c.type==='L'&&p)add(point(c.x,c.y));
      else if(c.type==='Q'&&p)curve([p,point(c.x1,c.y1),point(c.x,c.y)]);
      else if(c.type==='C'&&p)curve([p,point(c.x1,c.y1),point(c.x2,c.y2),point(c.x,c.y)]);
      else if(c.type==='Z'&&p){add(start);finish();}
      else throw Error('Unsupported font outline.');
    }
    finish();return paths;
  }

  // Normalize to Y-up font coordinates. At the largest text size (72 pt),
  // 0.5 unit is less than 0.013 mm (under 0.008 mm at 40 pt for postcards).
  function convert(buffer,parser){
    const parsed=parse(buffer,parser),font=parsed.font,scale=1000/font.unitsPerEm;
    const map=font.tables?.cmap?.glyphIndexMap;
    if(!map||Object.keys(map).length>4096)throw Error('Choose a font with at most 4,096 characters.');
    for(const c of [' ','?','H'])if(!font.charToGlyphIndex(c))throw Error('This font needs a space, question mark and capital H.');
    const cap=font.charToGlyph('H').getMetrics().yMax*scale;
    if(!Number.isFinite(cap)||cap<1||cap>4000)throw Error('Invalid capital-letter height.');
    const glyphs={};let total=0;
    for(const code of Object.keys(map).map(Number)){
      if(!Number.isInteger(code)||code<32||code>0x10ffff||(code>=0xd800&&code<=0xdfff)||!map[code])continue;
      const c=String.fromCodePoint(code),glyph=font.charToGlyph(c),commands=glyph.path.commands;
      if(commands.length>20000)throw Error('A character is too complex to import.');
      const paths=contours(commands.map(command=>{
        const out={type:command.type};for(const key of ['x','y','x1','y1','x2','y2'])if(key in command)out[key]=command[key]*scale;return out;
      }),0.5).map(path=>path.map(point=>point.map(n=>Number(n.toFixed(5)))));
      for(const path of paths){total+=path.length;if(path.length>10000||total>200000)throw Error('This font is too complex (200,000 points maximum).');}
      const advance=glyph.advanceWidth*scale;
      if(!Number.isFinite(advance)||advance<0||advance>10000)throw Error('Unsupported font spacing.');
      glyphs[c]={advance,paths};
    }
    return {name:parsed.name,credit:parsed.credit,units:1000,cap_height:cap,glyphs};
  }
  function base64(buffer){
    const bytes=new Uint8Array(buffer);let binary='';
    for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
    return btoa(binary);
  }
  const api={convert,base64,contours,MAX_BYTES};if(typeof module!=='undefined')module.exports=api;else root.TrueTypeFonts=api;
})(typeof window==='undefined'?globalThis:window);
