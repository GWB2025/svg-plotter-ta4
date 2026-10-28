'use strict';
(function(root) {
  if(!document.querySelector('meta[name="plotter-token"]'))return;
  const $=id=>document.getElementById(id), ns='http://www.w3.org/2000/svg';
  function node(tag,text,parent) { const el=document.createElement(tag); if(text!=null)el.textContent=text; if(parent)parent.append(el); return el; }
  class SwatchEditor {
    constructor() {
      this.allowed=false; this.working=false; this.plan=null;
      $('swatch-set').onchange=()=>{this.penOptions();this.update();};
      for(const id of ['swatch-pen','swatch-size','swatch-spacing','swatch-cross'])$(id).onchange=()=>this.update();
      $('swatch-sheet').onchange=()=>this.render();
      $('swatch-prepare').onclick=()=>this.prepare();
      $('swatch-download').onclick=()=>this.download();
      document.addEventListener('catalogue-changed',event=>{this.catalogue=event.detail;this.selections();this.update();});
      this.start().catch(error=>{$('swatch-error').textContent=error.message;});
    }
    async start() {
      const [catalogue,response]=await Promise.all([root.PersonalCatalogue.ready,fetch('/assets/postcard-fonts.json')]);
      if(!response.ok)throw Error('Could not load the swatch label font.');
      const fonts=await response.json();this.font=fonts.find(f=>f.id==='sans');
      this.catalogue=root.PersonalCatalogue.data||catalogue;
      this.selections();this.update();
    }
    selections() {
      if(!this.catalogue)return;
      const previous=$('swatch-set').value, sets=[...new Set(this.catalogue.pens.map(p=>p.set))];
      $('swatch-set').replaceChildren(...sets.map(set=>{const option=node('option',set);option.value=set;return option;}));
      $('swatch-set').value=sets.includes(previous)?previous:sets.find(set=>set.startsWith('Sharpie'))||sets[0]||'';
      $('swatch-set').disabled=!sets.length;
      this.penOptions();
    }
    penOptions() {
      const select=$('swatch-pen'),previous=select.value;
      const pens=this.catalogue.pens.filter(p=>p.set===$('swatch-set').value&&p.available!==false);
      const all=node('option','All available pens in this set');all.value='';
      select.replaceChildren(all,...pens.map(p=>{const option=node('option',root.PenInventory.label(p));option.value=p.id;return option;}));
      select.value=pens.some(p=>p.id===previous)?previous:'';select.disabled=!pens.length;
    }
    selectPen(pen) {
      $('swatch-set').value=pen.set;this.penOptions();$('swatch-pen').value=pen.id;this.update();
      $('swatch-heading').scrollIntoView({block:'start',behavior:'smooth'});
      $('swatch-pen').focus();
    }
    update() {
      if(!this.font||!this.catalogue)return;
      this.plan=null;$('swatch-error').textContent='';
      try {
        if(this.catalogue.error)throw Error(this.catalogue.error);
        const pens=this.catalogue.pens.filter(p=>p.set===$('swatch-set').value&&p.available!==false&&(!$('swatch-pen').value||p.id===$('swatch-pen').value));
        this.plan=root.PenSwatches.create(pens,{title:$('swatch-set').value,size:Number($('swatch-size').value),spacing:Number($('swatch-spacing').value),crossHatch:$('swatch-cross').checked},this.font);
        const previous=Number($('swatch-sheet').value)||0;
        $('swatch-sheet').replaceChildren(...this.plan.sheets.map((sheet,i)=>{const option=node('option','Sheet '+sheet.number+' of '+sheet.total+' · '+sheet.entries.length+' pens');option.value=String(i);return option;}));
        $('swatch-sheet').value=String(Math.min(previous,this.plan.sheets.length-1));
        const omitted=this.catalogue.pens.filter(p=>p.set===$('swatch-set').value&&p.available===false).length;
        $('swatch-summary').textContent=this.plan.count+' pens · '+this.plan.sheets.length+' sheet(s) · '+this.plan.size+' × '+this.plan.size+' mm patches · '+this.plan.spacing+' mm line spacing'+(omitted?' · '+omitted+' unavailable pens omitted':'')+'.';
      } catch(error) {
        $('swatch-summary').textContent='No swatch sheet prepared.';$('swatch-error').textContent=error.message;
        $('swatch-sheet').replaceChildren();
      }
      this.render();
    }
    sheet() { return this.plan?.sheets[Number($('swatch-sheet').value)||0]; }
    controls() {
      const valid=!!this.sheet();
      $('swatch-sheet').disabled=!valid||this.working;
      $('swatch-prepare').disabled=!valid||!this.allowed||this.working;
      $('swatch-download').disabled=!valid||this.working;
    }
    setPlotAvailability(allowed) { this.allowed=allowed;this.controls(); }
    render() {
      const sheet=this.sheet(), svg=$('swatch-preview');svg.replaceChildren();$('swatch-key').replaceChildren();
      this.controls();if(!sheet)return;
      function shape(tag,attrs,text) { const el=document.createElementNS(ns,tag);for(const [k,v]of Object.entries(attrs))el.setAttribute(k,v);if(text!=null)el.textContent=text;svg.append(el); }
      shape('rect',{width:210,height:297,fill:'#fff'});
      shape('text',{x:12,y:17,'font-size':3,fill:'#203832'},'Pen swatches · sheet '+sheet.number+' of '+sheet.total);
      for(const entry of sheet.entries) {
        const {x,y,size}=entry.patch;
        shape('rect',{x,y,width:size,height:size,fill:entry.pen.ink,stroke:'#89988d','stroke-width':.15});
        entry.labelLines.forEach((text,i)=>shape('text',{x:x+size/2,y:y+size+5+i*4,'font-size':2.6,'text-anchor':'middle',fill:'#203832'},text));
        const row=node('tr',null,$('swatch-key'));node('td',String(entry.number).padStart(2,'0'),row);
        const details=node('td',null,row);node('strong',root.PenInventory.label(entry.pen),details);node('span',entry.pen.id,details).className='stock-detail';
        node('td',root.PenInventory.hexToRgb(entry.pen.ink).join(', '),row);
        const action=node('button','Enter RGB',node('td',null,row));action.type='button';action.onclick=()=>root.PersonalCatalogue.editPen(entry.pen);
        action.setAttribute('aria-label','Enter RGB for patch '+entry.number+' '+entry.pen.colour);
      }
    }
    async prepare() {
      if(this.working||!this.allowed)return;
      this.update();const sheet=this.sheet();if(!sheet)return;
      this.working=true;this.controls();
      try { await root.PlotterSwatches.load(sheet); }
      catch(error) { $('swatch-error').textContent=error.message; }
      finally { this.working=false;this.controls(); }
    }
    download() {
      this.update();const sheet=this.sheet();if(!sheet)return;
      try {
        const url=URL.createObjectURL(new Blob([root.PenSwatches.gcode(sheet)],{type:'text/plain'}));
        const a=node('a',null,document.body);a.href=url;a.download='pen-swatches-sheet-'+sheet.number+'-of-'+sheet.total+'.gcode';a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
      } catch(error) { $('swatch-error').textContent=error.message; }
    }
  }
  root.SwatchEditor=new SwatchEditor();
})(window);
