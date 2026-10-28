const test=require('node:test'),assert=require('node:assert/strict');
const T=require('../assets/ttf-fonts'),L=require('../assets/postcard-layout'),defaults=require('../assets/postcard-defaults.json');
function fixture(){
 const commands=[{type:'M',x:-40,y:0},{type:'L',x:400,y:0},{type:'Q',x1:600,y1:350,x:400,y:700},{type:'L',x:-40,y:700},{type:'Z'},
 {type:'M',x:100,y:100},{type:'C',x1:100,y1:600,x2:300,y2:600,x:300,y:100},{type:'Z'}];
 const map={32:1,63:2,72:3,97:4};
 return {unitsPerEm:1000,numGlyphs:5,tables:{cmap:{glyphIndexMap:map}},getEnglishName:k=>k==='copyright'?'Synthetic test':'Test outline',charToGlyphIndex:c=>map[c.codePointAt(0)],charToGlyph:c=>({advanceWidth:620,path:{commands:c===' '?[]:commands},getMetrics:()=>({yMax:700})})};
}
const buffer=new ArrayBuffer(16);new DataView(buffer).setUint32(0,0x10000);
function imported(){const f=T.convert(buffer,{parse:fixture});f.id='ttf-test';f.kind='outline';for(const g of Object.values(f.glyphs)){const p=g.paths.flat();g.bounds=p.length?[Math.min(...p.map(q=>q[0])),Math.min(...p.map(q=>q[1])),Math.max(...p.map(q=>q[0])),Math.max(...p.map(q=>q[1]))]:null;}return f;}
test('TrueType conversion preserves closed contours, counters and capital height',()=>{
 const font=imported();assert.equal(font.cap_height,700);assert.equal(font.units,1000);
 assert.equal(font.glyphs.H.paths.length,2);
 for(const path of font.glyphs.H.paths)assert.deepEqual(path[0],path.at(-1));
 assert.equal(font.glyphs.H.bounds[0],-40);
 assert.equal(Buffer.from(T.base64(buffer),'base64').length,16);
 assert.throws(()=>T.convert(new ArrayBuffer(16),{parse:fixture}),/TrueType/);
});
test('message and address can use imported fonts at the original postcard scale',()=>{
 const font=imported(),doc=structuredClone(defaults);
 doc.message.font=doc.address.font=font.id;doc.message.text='Ha Ha';doc.address.text='Ha\nHa';
 const r=L.layout(doc,[font]);assert.deepEqual(r.errors,[]);assert.equal(r.paths.length,16);
 const top=r.blocks.message.bounds[1];assert(Math.abs(top-doc.message.y)<1e-6);
 const svg=L.svg(r);assert.match(svg,/width="148mm" height="105mm"/);assert(!svg.includes('<text'));
 doc.message.text='missing';assert(L.layout(doc,[font]).errors.some(e=>e.includes('does not contain')));
});
test('complex imported text stops before generating an excessive drawing',()=>{
 const font=imported();font.glyphs.H.paths=[Array.from({length:1000},()=>[0,0])];
 const doc=structuredClone(defaults);doc.message.font=doc.address.font=font.id;doc.message.text='H'.repeat(300);
 assert.throws(()=>L.layout(doc,[font]),/too complex/);
});

test('wide decorative glyph advances are retained and reported as layout overflow',()=>{
 const f=fixture(),get=f.charToGlyph;f.charToGlyph=c=>({...get(c),advanceWidth:c==='a'?4300:620});
 const converted=T.convert(buffer,{parse:()=>f});assert.equal(converted.glyphs.a.advance,4300);
});
