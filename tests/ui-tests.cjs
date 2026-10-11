'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {JSDOM} = require('jsdom');
const root = path.resolve(__dirname, '..');

function boot(t, query = '') {
  const dom = new JSDOM(fs.readFileSync(path.join(root,'index.html'),'utf8'), {
    url: 'https://example.test/activity/' + query, runScripts: 'outside-only', pretendToBeVisual: true
  });
  t.after(()=>dom.window.close());
  const w = dom.window;
  for (const name of ['model','graph','linked-graphs','app']) w.eval(fs.readFileSync(path.join(root,'js',name+'.js'),'utf8'));
  const $ = id=>w.document.getElementById(id);
  function change(input,value,type='change') { input.value=value;input.dispatchEvent(new w.Event(type,{bubbles:true})); }
  function preset(id) { change($('preset'),id);$('apply-preset').click(); }
  return {w,$,change,preset};
}

test('point edits preserve DOM identity and the next keyboard target', t=>{
  const {w,$,change} = boot(t);
  const q = $('points').querySelector('[data-index="0"][data-field="q"]');
  const p = $('points').querySelector('[data-index="0"][data-field="p"]');
  q.focus();change(q,'2.123');
  assert.equal($('points').querySelector('[data-index="0"][data-field="q"]'),q);
  p.focus();assert.equal(w.document.activeElement,p);
  change(p,'-1');assert.equal(p.getAttribute('aria-invalid'),'true');
  change(p,'9');assert.equal(p.getAttribute('aria-invalid'),null);
  assert.equal(w.document.activeElement,p);
});

test('typed selection clamps the visible number as well as the readout', t=>{
  const {w,$,change} = boot(t);
  $('sel-q-num').focus();change($('sel-q-num'),'200');
  assert.equal($('sel-q-num').value,'100');
  assert.equal($('sel-q').value,'100');
});

test('flat zero-price tangent never claims infinite elasticity', t=>{
  const {$,change,preset} = boot(t);preset('convex');
  change($('sel-q-num'),'100');$('show-tangent').click();
  assert.match($('calc').textContent,/undefined.*0 ÷ 0/);
  assert.match($('calc').textContent,/limiting elasticity of 0/);
  assert.doesNotMatch($('calc').textContent,/elasticity is infinite/);
  assert.match($('prompts').lastChild.textContent,/Not yet/);
});

test('endpoint maximum copy does not imply globally monotone revenue', t=>{
  const pts='20.48:8.677,21.59:7.775,37.61:4.154,42.12:2.917,53.37:1.81,57.98:0.058';
  const {$}=boot(t,'?pts='+encodeURIComponent(pts));
  assert.match($('peak-note').textContent,/left.*endpoint/);
  assert.doesNotMatch($('peak-note').textContent,/negative everywhere|positive everywhere|rises all the way/);
});

test('invalid links are explained; valid links preserve other URL state', t=>{
  const {$,w}=boot(t,'?course=101&pts=%3A10%2C100%3A0#main');
  assert.match($('points-note').textContent,/invalid points/);
  const url=new URL($('share-link').href);
  assert.equal(url.searchParams.get('course'),'101');assert.equal(url.hash,'#main');
});

test('adding searches past a wide but flat gap', t=>{
  const {$}=boot(t,'?pts=0:10,90:9.95,100:0');
  $('add-point').click();
  assert.equal($('points').tBodies[0].rows.length,4);
  assert.doesNotMatch($('points-note').textContent,/no room/);
});

test('line-tool feedback persists; Escape cancels the first point', t=>{
  const {w,$}=boot(t), svg=$('graph');
  svg.createSVGPoint=()=>({matrixTransform(){return {x:this.x,y:this.y};}});
  svg.getScreenCTM=()=>({inverse(){return this;}});
  let captured=false;svg.setPointerCapture=()=>{captured=true};svg.hasPointerCapture=()=>captured;svg.releasePointerCapture=()=>{captured=false};
  const radio=w.document.querySelector('[value="line"]');radio.checked=true;radio.dispatchEvent(new w.Event('change'));
  function pointer(type,id){const ev=new w.MouseEvent(type,{bubbles:true,clientX:100,clientY:100});Object.defineProperty(ev,'pointerId',{value:id});svg.dispatchEvent(ev);}
  pointer('pointerdown',1);pointer('pointerup',2);
  assert.equal(svg.querySelector('.line-first'),null);
  pointer('pointerup',1);
  assert.match($('graph-note').textContent,/Click the second point/);
  svg.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
  assert.equal(svg.querySelector('.line-first'),null);
});

test('exact reference converts explicitly and undo/redo restores its mathematical identity', t=>{
  const {$,preset}=boot(t);preset('exact-unit');
  assert.equal($('points').querySelectorAll('input:enabled').length,0);
  assert.equal($('graph').querySelectorAll('.handle').length,0);
  assert.match($('peak-note').textContent,/no unique/);
  assert.equal($('select-peak').disabled,true);
  $('make-editable').click();
  assert.equal($('points').querySelectorAll('input:enabled').length,18);
  assert.equal($('undo').disabled,false);
  $('undo').click();assert.equal($('make-editable').hidden,false);
  assert.match($('model-note').textContent,/Exact reference/);
  $('redo').click();assert.equal($('make-editable').hidden,true);
  assert.match($('model-note').textContent,/Editable demand/);
});

test('linked graphs share the selection coordinate and toggles hide only the requested series', t=>{
  const {$,change}=boot(t);
  assert.equal($('linked-panels').hidden,false);
  change($('sel-q-num'),'37');
  const demandX=Number($('graph').querySelector('.sel-guide').getAttribute('x1'));
  for(const id of ['tr-graph','e-graph']) assert.equal(Number($(id).querySelector('.sel-guide').getAttribute('x1')),demandX);
  assert.equal($('graph').querySelector('.series--tr'),null);
  $('show-tr').click();assert.equal($('tr-panel').hidden,true);assert.equal($('e-panel').hidden,false);
  change($('graph-layout'),'overlay');assert.equal($('linked-panels').hidden,true);
  assert.ok($('graph').querySelector('.series--e'));
});

test('share link restores exact model, selected quantity, toggles, tangent, layout, and axis', t=>{
  const first=boot(t);first.preset('exact-unit');first.change(first.$('sel-q-num'),'73.25');
  first.change(first.$('graph-layout'),'overlay');first.$('right-axis').click();first.$('show-tangent').click();first.$('show-area').click();first.$('show-mr').click();
  const url=new URL(first.$('share-link').href),second=boot(t,url.search);
  assert.match(second.$('model-note').textContent,/Exact reference/);
  assert.equal(second.$('sel-q-num').value,'73.25');
  assert.equal(second.$('show-tangent').checked,true);assert.equal(second.$('show-area').checked,false);
  assert.equal(second.$('show-mr').getAttribute('aria-pressed'),'false');
  assert.equal(second.$('graph-layout').value,'overlay');assert.match(second.$('right-axis').textContent,/total revenue/);
  assert.equal(new URL(second.$('share-link').href).searchParams.get('model'),'unit');
});

test('pinned reference is independent of edits and comparisons never extrapolate', t=>{
  const {$,preset,change}=boot(t);preset('exact-unit');$('pin-curve').click();preset('linear');
  change($('sel-q-num'),'50');assert.match($('comparison').textContent,/\$200\.00.*\$250\.00/);
  assert.ok($('tr-graph').querySelector('.reference-series'));
  change($('sel-q-num'),'10');assert.match($('comparison').textContent,/outside.*range/);
  $('clear-curve').click();assert.equal($('comparison').hidden,true);assert.equal($('reference-legend').hidden,true);
});

test('prediction is checked against full revenue change and invalidated by curve edits', t=>{
  const {$,change,preset}=boot(t);change($('sel-q-num'),'40');change($('prediction-step'),'40','input');
  change($('prediction-answer'),'decrease');$('check-prediction').click();
  assert.match($('prediction-result').textContent,/Your prediction matches/);
  assert.match($('prediction-result').textContent,/\$240\.00.*\$160\.00/);
  $('inspect-prediction').click();assert.equal($('sel-q-num').value,'80');assert.equal($('prediction-result').hidden,true);
  preset('exact-unit');change($('prediction-answer'),'same');$('check-prediction').click();
  assert.match($('prediction-result').textContent,/Revenue is unchanged/);
  $('make-editable').click();assert.equal($('prediction-result').hidden,true);assert.equal($('prediction-answer').value,'');
});

test('clipboard fallback preserves the current page and offers a selected copyable URL', t=>{
  const {w,$}=boot(t),before=w.location.href;
  $('share-link').click();
  assert.equal(w.location.href,before);assert.equal($('share-fallback').hidden,false);
  assert.equal(w.document.activeElement,$('share-url'));assert.equal($('share-url').value,$('share-link').href);
});

test('CSV download creates a local file link with the expected filename', t=>{
  const {w,$}=boot(t);let size=0,name='';
  w.URL.createObjectURL=blob=>{size=blob.size;return 'blob:https://example.test/export';};
  w.URL.revokeObjectURL=()=>{};
  w.HTMLAnchorElement.prototype.click=function(){name=this.download;};
  $('download-csv').click();assert.equal(name,'elasticity-revenue-values.csv');assert.ok(size>1000);
});
