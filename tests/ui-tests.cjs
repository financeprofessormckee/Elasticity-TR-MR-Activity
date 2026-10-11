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
  for (const name of ['model','graph','app']) w.eval(fs.readFileSync(path.join(root,'js',name+'.js'),'utf8'));
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
