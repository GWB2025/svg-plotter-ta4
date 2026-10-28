const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const SVGImport = require('../assets/svg-import.js');

class Element {
  constructor() {
    this.value = ''; this.checked = false; this.disabled = false;
    this.style = {}; this.dataset = {}; this.options = []; this.events = {};
  }
  append(...children) { this.options.push(...children); }
  replaceChildren(...children) { this.options = children; }
  setAttribute(name, value) { this[name] = value; }
  addEventListener(name, handler) { this.events[name] = handler; }
  click() {}
}

async function windowFixture() {
  const elements = new Map([...fs.readFileSync('docs/plotting.html', 'utf8')
    .matchAll(/id="([^"]+)"/g)].map(match => [match[1], new Element()]));
  elements.set('postcard-loaded', new Element());
  const get = id => {
    assert.ok(elements.has(id), 'Missing element ' + id);
    return elements.get(id);
  };
  for (const [id,value] of Object.entries({'page-width':'210','page-height':'297',
    'svg-mode':'actual','svg-margin':'20','svg-rotation':'0',
    'svg-treatment':'outlines','svg-spacing':'.5'})) get(id).value = value;
  get('page-size').options = ['210,297','148,105','105,148','custom'].map(value => ({value}));
  const state = {phase:'ready',connected:true,busy:false,homed:true,saved_plot:false};
  const source = Object.assign([[[10,20],[287,190]]],
    {width:297,height:210,colours:['#ff0000']});
  const loads = [], timers = [], textImports = [], events = {};
  const context = {
    document: {
      getElementById: get,
      querySelector: () => ({content:'test-token'}),
      querySelectorAll: () => [],
      createElement: () => new Element(),
      createElementNS: () => new Element(),
      addEventListener: () => {},
    },
    PlotPreview:{CanvasPreview:class { async render() {} }},
    SVGImport:{...SVGImport,extractPaths:() => structuredClone(source)},
    PenInventory:{suggest:() => ''},
    PageGuides: require('../assets/page-guides.js'),
    PenSwatches: require('../assets/pen-swatches.js'),
    TextImport: require('../assets/text-import.js'),
    TextEditor: {open:async (text,name)=>textImports.push({text,name}),setPlotAvailability:()=>{}},
    PersonalCatalogue:{ready:Promise.resolve({pens:[]})},
    AbortSignal, structuredClone,
    addEventListener: (name, callback) => { events[name] = callback; },
    setTimeout: callback => { timers.push(callback); },
    fetch: async (url, options) => {
      let result;
      switch (url) {
        case '/api/status': result = structuredClone(state); break;
        case '/api/devices': result = {devices:[]}; break;
        case '/api/job': result = {job:null}; break;
        case '/api/identity': result = {pen_inventory:true}; break;
        case '/api/load': {
          const payload = JSON.parse(options.body); loads.push(payload);
          result = {job:{id:String(loads.length),name:payload.name,commands:10,
            paths:[],pen_changes:[],bounds:[0,0,20,20],seconds:1,draw_mm:10}};
          break;
        }
        default: throw Error('Unexpected request ' + url);
      }
      return {ok:true,json:async () => result};
    },
  };
  context.window = context;
  vm.runInNewContext(fs.readFileSync('assets/plotting.js', 'utf8'), context);
  const settle = async () => { for (let i=0;i<100;i++) await Promise.resolve(); };
  await settle();
  async function loadSVG() {
    get('plot-file').files = [{name:'landscape.svg',size:100,text:async () => '<svg/>'}];
    await get('plot-file').events.change();
  }
  return {get,loads,state,context,loadSVG,settle,textImports,async profileChanged() { await events['plotter-profile-changed'](); },async poll() { await timers.shift()(); }};
}

test('plain .txt opens the fixed-width editor without loading commands; G-code .txt still loads', async () => {
  const ui = await windowFixture();
  const text='   /\\\n  |__|';
  ui.get('plot-file').files=[{name:'House.txt',size:20,text:async()=>text,arrayBuffer:async()=>new TextEncoder().encode(text).buffer}];
  await ui.get('plot-file').events.change();
  assert.equal(ui.loads.length,0);
  assert.equal(ui.textImports.length,1);
  assert.equal(ui.textImports[0].text,text);
  assert.equal(ui.get('plot-start').disabled,true);
  const gcode=SVGImport.makeGcode([[[10,10],[20,20]]]);
  ui.get('plot-file').files=[{name:'studio.txt',size:gcode.length,text:async()=>gcode,arrayBuffer:async()=>new TextEncoder().encode(gcode).buffer}];
  await ui.get('plot-file').events.change();
  assert.equal(ui.loads.at(-1).text,gcode);
  assert.equal(ui.textImports.length,1);
});

test('prepared text fits the selected page, resets stale readiness, and rotates', async () => {
  const ui=await windowFixture();
  const font=require('../assets/postcard-fonts.json')[0];
  const result=ui.context.TextImport.layout('  /\\\n /__\\\n |__|',{},font);
  ui.get('plot-ready').checked=true;
  assert.equal(await ui.context.PlotterText.load(result,'House.txt'),true);
  assert.equal(ui.get('plot-ready').checked,false);
  assert.equal(ui.get('svg-mode').value,'fit');
  assert.equal(ui.loads.at(-1).name,'House.gcode');
  const first=ui.loads.at(-1).text;
  assert.match(first,/; PEN_CHANGE #000000/);
  assert.equal(ui.get('svg-treatment').disabled,true,'pen strokes have no colour fills to hatch');
  ui.get('svg-treatment').value='layered';
  await ui.get('svg-rotate').onclick();
  assert.notEqual(ui.loads.at(-1).text,first);
  assert.equal(ui.get('svg-download').disabled,false);
});

test('text preparation cannot replace an active drawing or saved recovery', async () => {
  const ui=await windowFixture();
  const result=ui.context.TextImport.layout('hello',{},require('../assets/postcard-fonts.json')[0]);
  for(const state of [{busy:true},{busy:false,saved_plot:true}]){
    Object.assign(ui.state,state);await ui.poll();
    await assert.rejects(()=>ui.context.PlotterText.load(result,'test.txt'),/Finish|recovery/);
  }
  assert.equal(ui.loads.length,0);
});

test('a landscape SVG rejected at actual size can be rotated, exported, and reset without stale output', async () => {
  const ui = await windowFixture();
  assert.equal(ui.get('svg-rotate').disabled, true);
  await ui.loadSVG();
  assert.match(ui.get('plot-error').textContent, /beyond/);
  assert.equal(ui.get('svg-rotate').disabled, false);
  await ui.get('svg-rotate').onclick();
  assert.equal(ui.get('svg-rotation').value, '90');
  assert.equal(ui.get('plot-error').textContent, '');
  assert.ok(ui.loads.at(-1).text.includes('X190.0000 Y-10.0000'));
  assert.equal(ui.get('svg-download').disabled, false);
  ui.get('plot-ready').checked = true;
  await ui.get('svg-rotate').onclick(); // 180 degrees does not fit portrait at 1:1.
  assert.equal(ui.get('plot-ready').checked, false);
  assert.equal(ui.get('svg-download').disabled, true);
  assert.equal(ui.get('plot-start').disabled, true);
  await ui.get('svg-rotate').onclick();
  assert.equal(ui.get('svg-rotation').value, '270');
  assert.ok(ui.loads.at(-1).text.includes('X20.0000 Y-287.0000'));
  await ui.get('svg-rotate').onclick();
  assert.equal(ui.get('svg-rotation').value, '0');
  ui.get('svg-mode').value = 'fit';
  await ui.get('svg-mode').onchange();
  await ui.settle();
  ui.get('svg-rotation').value = '90';
  await ui.get('svg-rotation').onchange();
  await ui.settle();
  assert.equal(ui.get('svg-download').disabled, false);
  await ui.loadSVG();
  assert.equal(ui.get('svg-rotation').value, '0');
});

test('rotation is unavailable during drawing, pause, recovery, and for a positioning guide', async () => {
  const ui = await windowFixture();
  await ui.loadSVG();
  for (const phase of ['plotting','paused','pen_change']) {
    Object.assign(ui.state, {phase,busy:true}); await ui.poll();
    assert.equal(ui.get('svg-rotate').disabled, true);
    assert.equal(ui.get('svg-rotation').disabled, true);
  }
  Object.assign(ui.state, {phase:'offline',busy:false,saved_plot:true}); await ui.poll();
  assert.equal(ui.get('svg-rotate').disabled, true);
  Object.assign(ui.state, {phase:'ready',saved_plot:false}); await ui.poll();
  assert.equal(ui.get('svg-rotate').disabled, false);
  await ui.get('guide-load').onclick();
  assert.equal(ui.get('svg-rotation').value, '0');
  assert.equal(ui.get('svg-rotate').disabled, true);
});

test('postcard text rotates at exact size and swaps the physical stock dimensions', async () => {
  const ui = await windowFixture();
  await ui.context.PlotterPostcard.load({errors:[],paths:[[[5,10],[140,90]]],colours:['#000000']});
  await ui.get('svg-rotate').onclick();
  assert.equal(ui.get('svg-rotation').value, '90');
  assert.equal(ui.get('page-width').value, 105);
  assert.equal(ui.get('page-height').value, 148);
  assert.ok(ui.loads.at(-1).text.includes('X95.0000 Y-5.0000'));
  assert.ok(ui.loads.at(-1).text.includes('X15.0000 Y-140.0000'));
});

test('swatch preparation preserves exact pens and page size and never starts movement', async () => {
  const ui = await windowFixture();
  const pens = require('../assets/pens.json').filter(p=>p.brand.includes('Sharpie')).slice(0,2);
  const font = require('../assets/postcard-fonts.json')[0];
  const sheet = ui.context.PenSwatches.create(pens, {}, font).sheets[0];
  await ui.context.PlotterSwatches.load(sheet);
  assert.ok(ui.loads.at(-1).text.startsWith('; SWATCH_SHEET v1'));
  assert.equal(ui.get('page-width').value, 210);
  assert.equal(ui.get('page-height').value, 297);
  assert.equal(ui.get('page-size').disabled, true);
  assert.equal(ui.get('svg-rotate').disabled, true);
  assert.equal(ui.get('svg-apply').disabled, true);
  assert.equal(ui.get('plot-ready').checked, false);
  assert.equal(ui.get('svg-download').disabled, false);
  await ui.context.PlotterThemes.apply({name:'test'});
  assert.match(ui.get('plot-error').textContent, /labelled physical pen/);
  assert.equal(ui.loads.length, 1);
  await ui.loadSVG();
  assert.equal(ui.get('page-size').disabled, false);
});

test('a busy plot or saved recovery rejects swatch preparation without replacing its job', async () => {
  const ui = await windowFixture();
  for (const state of [{busy:true,saved_plot:false},{busy:false,saved_plot:true}]) {
    Object.assign(ui.state,state);await ui.poll();
    await assert.rejects(ui.context.PlotterSwatches.load({}), /Finish the current drawing/);
    assert.equal(ui.loads.length,0);
  }
});


test('switching to a smaller export-only bed clears stale output and blocks direct controls', async()=>{
  const ui=await windowFixture();await ui.loadSVG();
  ui.state.profile={id:'small',driver:'svg',width:100,height:100,x_direction:1,y_direction:1,pen_up:3,pen_down:0};
  Object.assign(ui.state,{connected:false,homed:false});
  await ui.profileChanged();
  assert.equal(ui.get('page-width').value,100);
  assert.equal(ui.get('page-height').value,100);
  assert.equal(ui.get('svg-download').disabled,true);
  assert.equal(ui.get('plot-start').disabled,true);
  assert.equal(ui.get('plot-connect').disabled,true);
  assert.equal(ui.get('plot-ready').checked,false);
  assert.equal(ui.get('prepared-svg-download').disabled,true);
});
