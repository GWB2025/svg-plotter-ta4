const {test}=require('node:test'),assert=require('node:assert/strict');
const {FontLibraryClient}=require('../assets/font-library-client.js');

function fixture({broken=false}={}) {
  const calls=[],saved=[{id:'ttf-cinzel',name:'Cinzel Regular',kind:'outline'}];
  const client=new FontLibraryClient({token:'session-token',parser:{},
    converter:{MAX_BYTES:2*1024*1024,base64:()=> 'encoded',convert:()=>({name:'New Bold'})},
    fetch:async (url,options={})=>{
      calls.push({url,options});
      if(url.includes('postcard-fonts')) return {ok:true,json:async()=>[{id:'sans',name:'Hershey Sans'}]};
      assert.equal(options.headers['X-Plotter-Token'],'session-token');
      if(broken) return {ok:false,json:async()=>({error:'Saved font library is damaged.'})};
      if(options.method==='POST') saved.push({id:'ttf-new',name:'New Bold',kind:'outline'});
      return {ok:true,json:async()=>({fonts:[...saved],added:1})};
    }});
  return {client,calls};
}
const file=()=>({name:'New-Bold.ttf',size:16,arrayBuffer:async()=>new ArrayBuffer(16)});

test('both editors share one initial load and retain fonts imported in previous sessions', async()=>{
  const {client,calls}=fixture();
  const [a,b]=await Promise.all([client.load(),client.load()]);
  assert.deepEqual(a,b);assert.deepEqual(a.fonts.map(f=>f.id),['sans','ttf-cinzel']);
  assert.equal(calls.length,2);
});

test('a successful import notifies both editors with all fonts and authenticated upload',async()=>{
  const {client,calls}=fixture();await client.load();
  const postcard=[],ascii=[];client.subscribe(value=>postcard.push(value));client.subscribe(value=>ascii.push(value));
  const result=await client.importFiles([file()]);
  assert.equal(result.added,1);assert.equal(result.fonts.length,3);
  assert.deepEqual(postcard,ascii);assert.equal(postcard.length,1);
  assert.deepEqual(postcard[0].fonts.map(f=>f.id),['sans','ttf-cinzel','ttf-new']);
  const post=calls.find(c=>c.options.method==='POST');
  assert.equal(JSON.parse(post.options.body).fonts[0].font.name,'New Bold');
});

test('invalid imports do not publish changes or send partial batches',async()=>{
  const {client,calls}=fixture();await client.load();let updates=0;client.subscribe(()=>updates++);
  for(const files of [[],Array.from({length:21},file),[{...file(),name:'bad.otf'}],[file(),{...file(),size:3*1024*1024}]])
    await assert.rejects(()=>client.importFiles(files));
  assert.equal(updates,0);assert.equal(calls.length,2);
  await client.importFiles([file()]);assert.equal(updates,1,'a rejected batch must not block later imports');
});

test('a broken saved library leaves bundled fonts usable and rejects imports without notification',async()=>{
  const {client}=fixture({broken:true});let updates=0;client.subscribe(()=>updates++);
  const result=await client.load();assert.equal(result.fonts[0].id,'sans');assert.match(result.error,/damaged/);
  await assert.rejects(()=>client.importFiles([file()]),/damaged/);assert.equal(updates,0);
});
