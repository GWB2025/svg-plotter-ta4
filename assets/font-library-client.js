'use strict';
(function(root) {
  // One font collection for both text editors, with serialised imports.
  class FontLibraryClient {
    constructor({fetch,token,converter,parser}) {
      Object.assign(this,{fetch,token,converter,parser});
      this.listeners=new Set();this.bundled=[];this.fonts=[];
      this.ready=null;this.importQueue=Promise.resolve();
    }
    async request(data) {
      const response=await this.fetch('/api/fonts',{
        method:data?'POST':'GET',headers:{'X-Plotter-Token':this.token,...(data?{'Content-Type':'application/json'}:{})},
        ...(data?{body:JSON.stringify(data)}:{}),cache:'no-store',signal:AbortSignal.timeout(30000),
      });
      const result=await response.json();
      if(!response.ok) throw Error(result.error||'Could not read the fonts on this Mac.');
      return result;
    }
    load() {
      if(!this.ready) this.ready=this.initialise();
      return this.ready;
    }
    async initialise() {
      const [response,saved]=await Promise.all([
        this.fetch('/assets/postcard-fonts.json'),
        this.request().catch(error=>({fonts:[],error:error.message})),
      ]);
      if(!response.ok) throw Error('The bundled fonts could not be loaded. Reopen the app to try again.');
      this.bundled=await response.json();this.fonts=[...this.bundled,...saved.fonts];
      return {fonts:this.fonts,error:saved.error||null};
    }
    subscribe(listener) { this.listeners.add(listener);return ()=>this.listeners.delete(listener); }
    importFiles(files) {
      const selected=Array.from(files);
      const pending=this.importQueue.then(()=>this.importBatch(selected));
      this.importQueue=pending.catch(()=>{});
      return pending;
    }
    async importBatch(files) {
      await this.load();
      if(!files.length||files.length>20) throw Error('Choose between 1 and 20 fonts at a time.');
      for(const file of files)
        if(!/\.ttf$/i.test(file.name)||file.size>this.converter.MAX_BYTES)
          throw Error('Choose .ttf files no larger than 2 MB each.');
      const records=[];
      for(const file of files) {
        const buffer=await file.arrayBuffer();
        records.push({original_base64:this.converter.base64(buffer),font:this.converter.convert(buffer,this.parser)});
      }
      const saved=await this.request({fonts:records});
      this.fonts=[...this.bundled,...saved.fonts];
      const result={fonts:this.fonts,added:saved.added,error:null};
      // Future consumers receive the latest collection, not the startup snapshot.
      this.ready=Promise.resolve(result);
      for(const listener of this.listeners) listener(result);
      return result;
    }
  }
  if(typeof module!=='undefined'&&module.exports) module.exports={FontLibraryClient};
  else {
    const token=root.document.querySelector('meta[name="plotter-token"]')?.content;
    if(token) root.PlotterFonts=new FontLibraryClient({fetch:root.fetch.bind(root),token,converter:root.TrueTypeFonts,parser:root.opentype});
  }
})(typeof window==='undefined'?globalThis:window);
