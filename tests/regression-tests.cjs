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
