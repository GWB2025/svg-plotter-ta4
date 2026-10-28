'use strict';
(function(root) {
  const $ = id => document.getElementById(id), ns = 'http://www.w3.org/2000/svg';
  if(!document.querySelector('meta[name="plotter-token"]')?.content) return;
  class TextEditor {
    constructor() {
      this.name='text-drawing.txt'; this.allowed=false; this.working=false;
      this.result=null; this.readId=0;
      this.ready=this.start();
      this.ready.catch(error => { $('text-error').textContent=error.message; });
      $('text-file').onchange=()=>this.readFile();
      for(const id of ['text-content','text-cell','text-row','text-tabs']) $(id).oninput=()=>this.changed();
      $('text-save').onclick=()=>this.download($('text-content').value,this.name,'text/plain;charset=utf-8');
      $('text-export').onclick=()=>{this.render();if(this.result)this.download(root.TextImport.svg(this.result),this.stem()+'.svg','image/svg+xml');};
      $('text-prepare').onclick=()=>this.prepare();
    }
    async start() {
      const response=await fetch('/assets/postcard-fonts.json');
      if(!response.ok) throw Error('The text stroke font could not be loaded. Reopen the app to try again.');
      this.font=(await response.json()).find(font=>font.id==='sans');
      if(!this.font) throw Error('The text stroke font is missing.');
      this.render();
    }
    stem() { return this.name.replace(/\.txt$/i,'') || 'text-drawing'; }
    setPlotAvailability(allowed) { this.allowed=allowed;this.controls(); }
    controls() {
      $('text-save').disabled=!$('text-content').value||this.working;
      $('text-export').disabled=!this.result||this.working;
      $('text-prepare').disabled=!this.result||!this.allowed||this.working;
      $('text-plot-status').textContent=this.allowed?'':'Finish the current drawing or resolve saved recovery before preparing another drawing. You can still edit this text.';
    }
    changed() {
      clearTimeout(this.timer);this.result=null;this.controls();
      $('text-summary').textContent='Updating pen paths…';
      this.timer=setTimeout(()=>this.render(),120);
    }
    async open(text,name='text-drawing.txt') {
      await this.ready;
      if(text.length>50000) throw Error('Text is too long: the limit is 50,000 characters.');
      this.name=name.replace(/^.*[\\/]/,'').replace(/\.[^.]+$/, '')+'.txt';
      $('text-content').value=text.replace(/^\ufeff/,'').replace(/\r\n?/g,'\n');
      $('text-source').textContent=this.name+' · edit below or prepare the complete file.';
      $('text-tab').click();this.render();
    }
    async readFile() {
      const file=$('text-file').files[0], id=++this.readId;
      if(!file) return;
      try {
        if(file.size>2*1024*1024) throw Error('The text file is too large. Choose a file under 2 MB.');
        const text=root.TextImport.decode(await file.arrayBuffer());
        if(id===this.readId) await this.open(text,file.name);
      } catch(error) { $('text-error').textContent=error.message; }
      finally { if(id===this.readId)$('text-file').value=''; }
    }
    render() {
      clearTimeout(this.timer);this.result=null;
      $('text-content').style.tabSize=$('text-tabs').value;
      const preview=$('text-preview');preview.replaceChildren();$('text-error').textContent='';
      try {
        if(!this.font) return;
        if(!$('text-content').value) { $('text-summary').textContent='Choose a .txt file, or paste text to preview.';return; }
        this.result=root.TextImport.layout($('text-content').value,{
          cellWidth:$('text-cell').valueAsNumber,lineHeight:$('text-row').valueAsNumber,tabSize:$('text-tabs').valueAsNumber,
        },this.font);
        const r=this.result;preview.setAttribute('viewBox','0 0 '+r.width+' '+r.height);
        const path=document.createElementNS(ns,'path');
        path.setAttribute('d',r.paths.map(stroke=>stroke.map(([x,y],i)=>(i?'L':'M')+x.toFixed(4)+' '+y.toFixed(4)).join(' ')).join(' '));
        for(const [key,value] of Object.entries({fill:'none',stroke:'#203832','stroke-width':.25,'stroke-linecap':'round','stroke-linejoin':'round'})) path.setAttribute(key,value);
        preview.append(path);
        $('text-summary').textContent=r.columns+' columns × '+r.rows+' rows · '+r.width.toFixed(1)+' × '+r.height.toFixed(1)+' mm before fitting · '+r.paths.length.toLocaleString()+' pen strokes.';
      } catch(error) {
        $('text-error').textContent=error.message;$('text-summary').textContent='Correct the text or spacing before exporting or preparing.';
      } finally { this.controls(); }
    }
    async prepare() {
      if(this.working||!this.allowed) return;
      this.render();if(!this.result) return;
      this.working=true;this.controls();
      try { await root.PlotterText.load(this.result,this.name); }
      catch(error) { $('text-error').textContent=error.message; }
      finally { this.working=false;this.controls(); }
    }
    download(text,name,type) {
      const url=URL.createObjectURL(new Blob([text],{type}));
      const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();
      setTimeout(()=>URL.revokeObjectURL(url),1000);
    }
  }
  root.TextEditor=new TextEditor();
})(window);
