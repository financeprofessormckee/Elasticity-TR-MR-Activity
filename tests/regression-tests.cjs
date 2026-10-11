'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const M = require('../js/model.js');

test('a narrow interior revenue maximum near the boundary is not labelled an endpoint', () => {
  const points = [[38.19,8.811],[43.13,6.818],[46.02,4.857],[49.48,4.553],[68.7,4.317],[81.54,1.148],[95.05,0.821]].map(([q,p])=>({q,p}));
  const curve = M.buildCurve(points), peak = M.trMax(curve);
  assert.equal(peak.interior, true);
  assert.ok(Math.abs(peak.q - 38.19789149806235) < 1e-8);
  assert.ok(Math.abs(peak.mr) < 1e-8);
  assert.ok(Math.abs(peak.e - 1) < 1e-8);
  for (const row of M.sample(curve, 50001)) assert.ok(row.tr <= peak.tr + 1e-8);
});

test('arbitrary and preset curves share without changing a single coordinate', () => {
  for (const preset of M.PRESETS) assert.deepEqual(M.decodePoints(M.encodePoints(preset.points)), preset.points);
  const pts = [{q: 0.123456789, p: 9.999999}, {q: 0.62345679, p: 9.949999}, {q: 100, p: 0.00000001}];
  assert.equal(M.validatePoints(pts), null);
  assert.deepEqual(M.decodePoints(M.encodePoints(pts)), pts);
});

test('malformed shared curves never become plausible zero-valued points', () => {
  for (const str of [':10,100:0','0:10:extra,100:0','0:10,100:','0:10,,100:0','0:10,Infinity:0','0:10,0x64:0','0:10,100:0,' + '0'.repeat(3000)]) assert.equal(M.decodePoints(str), null, str.slice(0,80));
  for (const pts of [[null,{}],[{q:null,p:10},{q:100,p:0}], [{q:'0',p:10},{q:100,p:0}]]) assert.ok(M.validatePoints(pts));
});

test('flat endpoint geometry is explicitly degenerate; a horizontal tangent does not shrink the plot', () => {
  const c = M.buildCurve(M.getPreset('convex').points), t = M.tangent(c,100);
  assert.equal(t.degenerate, true);
  assert.ok(Number.isNaN(t.eSegments));
  assert.equal(t.eFormula, 0); // documented one-sided limiting convention
  assert.equal(M.promptStatus(c,100,true).calc,false);
  assert.equal(M.viewFor(c,{tangentAt:100}).qMax,100);
  const flat = M.buildCurve([{q:0,p:10},{q:95,p:9.9},{q:100,p:0}]);
  assert.equal(M.viewFor(flat,{tangentAt:0}).qMax,100);
});

test('stationary quantities include every sign change, not only the global maximum', () => {
  const c = M.buildCurve(M.getPreset('unit').points), qs = M.stationaryQuantities(c);
  assert.ok(qs.length > 2);
  for (const q of qs) assert.ok(Math.abs(M.measures(c,q).mr) < 1e-7);
});

test('the analytical reference is exactly unit-elastic, including its endpoints', () => {
  const curve=M.constantRevenueCurve(),peak=M.trMax(curve);
  assert.equal(peak.flat,true);
  for (let q=20;q<=100;q+=0.125) {
    const m=M.measures(curve,q), tangent=M.tangent(curve,q);
    assert.equal(m.e,1);assert.equal(m.tr,200);assert.equal(m.mr,0);
    assert.ok(Math.abs(m.p-200/q)<1e-12);
    assert.ok(Math.abs(tangent.eSegments-1)<1e-12);
  }
  assert.deepEqual(M.mrRange(curve),{min:0,max:0});
});

test('prediction feedback uses the finite revenue change, even across a peak', () => {
  const c=M.buildCurve(M.getPreset('linear').points);
  assert.equal(M.revenueChange(c,30,35).direction,'increase');
  assert.equal(M.revenueChange(c,60,65).direction,'decrease');
  assert.equal(M.revenueChange(c,40,60).direction,'same');
  // MR starts positive at Q=40, but moving beyond 60 lowers revenue overall.
  assert.ok(M.measures(c,40).mr>0);
  assert.equal(M.revenueChange(c,40,80).direction,'decrease');
  assert.equal(M.revenueChange(M.constantRevenueCurve(),20,100).direction,'same');
});

test('MR bounds include narrow extrema between spline knots', () => {
  const c=M.buildCurve([{q:0,p:10},{q:50,p:9.9},{q:50.5,p:0.2},{q:100,p:0}]);
  const bounds=M.mrRange(c);
  for(const m of M.sample(c,50001)) assert.ok(m.mr>=bounds.min-1e-7&&m.mr<=bounds.max+1e-7);
  assert.equal(M.viewFor(c,{showMR:true}).mrClipped,true);
});

test('CSV includes labelled units, selected quantity, and analytic curve metadata', () => {
  const csv=M.valuesCsv(M.constantRevenueCurve(),33.333),lines=csv.trim().split('\r\n');
  assert.match(lines[0],/Quantity \(units\/week\).*Marginal revenue \(\$\/unit\)/);
  assert.ok(lines.some(line=>line.startsWith('33.333,')));
  for(const line of lines.slice(1)) {const row=line.split(',');assert.equal(row[2],'1');assert.equal(row[3],'200');assert.equal(row[4],'0');assert.equal(row[5],'P=200/Q');}
});
