/* Model tests for Elasticity, TR, MR. Run: node tests/model-tests.cjs */
'use strict';
const M = require('../js/model.js');

let failures = 0, checks = 0;
function ok(cond, msg) { checks++; if (!cond) { failures++; if (failures <= 40) console.error('FAIL: ' + msg); } }
function close(a, b, tol, msg) { ok(Math.abs(a - b) <= tol, msg + ' (' + a + ' vs ' + b + ')'); }

// Deterministic generator (mulberry32).
function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A random valid demand curve with 2–12 points.
function randomPoints(r) {
  for (;;) {
    const n = 2 + Math.floor(r() * 11);
    const qs = [], ps = [];
    for (let i = 0; i < n; i++) { qs.push(M.round(r() * 100, 2)); ps.push(M.round(r() * 10, 3)); }
    qs.sort((a, b) => a - b); ps.sort((a, b) => b - a);
    const pts = qs.map((q, i) => ({ q, p: ps[i] }));
    if (!M.validatePoints(pts)) return pts;
  }
}

// 1. Linear demand P = 10 − 0.1Q.
{
  const c = M.buildCurve(M.getPreset('linear').points);
  const mid = M.measures(c, 50);
  close(mid.e, 1, 1e-12, 'linear e = 1 at the midpoint');
  close(mid.mr, 0, 1e-12, 'linear MR = 0 at the midpoint');
  for (let q = 0; q <= 100; q += 2.5) {
    const m = M.measures(c, q);
    close(m.p, 10 - 0.1 * q, 1e-12, 'linear price at ' + q);
    close(m.mr, 10 - 0.2 * q, 1e-12, 'linear MR at ' + q);
    close(m.tr, q * (10 - 0.1 * q), 1e-10, 'linear TR at ' + q);
    if (q > 0 && q < 50) ok(m.e > 1, 'linear elastic above the midpoint price at ' + q);
    if (q > 50 && q < 100) ok(m.e < 1, 'linear inelastic below the midpoint price at ' + q);
  }
  ok(M.measures(c, 0).e === Infinity, 'e is infinite (undefined) at Q = 0');
  ok(M.measures(c, 100).e === 0, 'e is 0 at P = 0');
  const pk = M.trMax(c);
  ok(pk.interior, 'linear TR maximum is interior');
  close(pk.q, 50, 1e-6, 'linear TR maximum at Q = 50');
  close(pk.tr, 250, 1e-6, 'linear TR maximum is $250');
  const st = M.promptStatus(c, 30, false);
  ok(st.elasticLine && !st.peak && !st.calc, 'prompt 3 passes above the midpoint price; 1 and 4 do not');
  ok(M.promptStatus(c, 50.5, false).peak, 'prompt 1 passes within tolerance of the peak');
  ok(!M.promptStatus(c, 52, false).peak, 'prompt 1 fails 2 units from the peak');
  ok(!M.promptStatus(c, 70, false).elasticLine, 'prompt 3 fails below the midpoint price');
}

// 2. Unit-elastic preset.
{
  const c = M.buildCurve(M.getPreset('unit').points);
  const rows = M.sample(c, 401);
  let eMin = Infinity, eMax = 0, trSum = 0;
  rows.forEach(r => { eMin = Math.min(eMin, r.e); eMax = Math.max(eMax, r.e); trSum += r.tr; });
  const trMean = trSum / rows.length;
  ok(eMin >= 0.95 && eMax <= 1.15, 'unit-elastic preset e in [0.95, 1.15] (measured ' + eMin.toFixed(4) + '–' + eMax.toFixed(4) + ')');
  const pts = M.getPreset('unit').points;
  rows.filter(r => r.q >= pts[1].q && r.q <= pts[pts.length - 2].q).forEach(r => ok(Math.abs(r.e - 1) <= 0.02, 'unit-elastic preset e within 0.02 of 1 between its end segments at ' + r.q.toFixed(2)));
  const hand = M.buildCurve([20, 40, 50, 80, 100].map(q => ({ q, p: M.round(200 / q, 2) })));
  ok(M.isUnitElastic(hand), 'prompt 2 passes for five hand-entered points with P × Q = 200');
  ok(!M.isUnitElastic(M.buildCurve([20, 40, 100].map(q => ({ q, p: 200 / q })))), 'prompt 2 fails for only three such points (TR varies > 5%)');
  rows.forEach(r => ok(Math.abs(r.tr - trMean) / trMean <= 0.05, 'unit-elastic TR within 5% at ' + r.q.toFixed(2)));
  ok(M.isUnitElastic(c) && M.promptStatus(c, 50, false).unit, 'prompt 2 passes for the unit-elastic preset');
  ok(!M.isUnitElastic(M.buildCurve(M.getPreset('linear').points)), 'prompt 2 fails for a straight line');
  console.log('Unit-elastic preset: e ranges ' + eMin.toFixed(4) + ' to ' + eMax.toFixed(4));
}

// 3. Every preset is valid.
M.PRESETS.forEach(p => ok(!M.validatePoints(p.points), 'preset ' + p.id + ' is valid: ' + M.validatePoints(p.points)));

// 4–5. Random curves: interpolation, monotonicity, tangent geometry, TR maximum.
{
  const r = rng(20260930);
  let interior = 0;
  for (let n = 0; n < 10000; n++) {
    const pts = randomPoints(r), c = M.buildCurve(pts);
    pts.forEach((o, i) => close(M.priceAt(c, o.q), o.p, 1e-9, `curve ${n} passes through point ${i + 1}`));
    for (let i = 0; i <= 60; i++) {
      const q = c.q0 + (c.q1 - c.q0) * i / 60, m = M.measures(c, q);
      ok(m.slope <= 1e-9, `curve ${n} slope ≤ 0 at ${q.toFixed(2)} (${m.slope})`);
      ok(m.e >= 0, `curve ${n} elasticity ≥ 0 at ${q.toFixed(2)}`);
      ok(m.p >= 0 && m.p <= 10 + 1e-9, `curve ${n} price stays in the box at ${q.toFixed(2)}`);
      if (q > 0.01 && m.slope < -1e-6 && m.p > 1e-6) {
        const t = M.tangent(c, q);
        close(t.eSegments, t.eFormula, 1e-9 * Math.max(1, t.eFormula), `curve ${n} segment ratio equals formula at ${q.toFixed(2)}`);
        close(t.p, t.slope * (t.q - t.qInt), 1e-9 * Math.max(1, t.p), `curve ${n} tangent reaches P = 0 at its Q-intercept`);
      }
    }
    const pk = M.trMax(c);
    if (pk.interior) {
      interior++;
      ok(Math.abs(pk.mr) < 0.01, `curve ${n} MR ≈ 0 at interior TR maximum (${pk.mr})`);
      ok(Math.abs(pk.e - 1) < 0.01, `curve ${n} e ≈ 1 at interior TR maximum (${pk.e})`);
    }
    const s = M.sample(c, 201);
    s.forEach(row => ok(row.tr <= pk.tr + 1e-6, `curve ${n} TR maximum is global`));
  }
  console.log('Random curves with an interior TR maximum: ' + interior + ' of 10000');
  ok(interior > 1000, 'many random curves have an interior TR maximum');
}

// 6. Validation, clamped moves, line tool and sketches.
{
  ok(M.validatePoints([{ q: 10, p: 5 }]), 'one point is rejected');
  ok(M.validatePoints([{ q: 10, p: 5 }, { q: 5, p: 4 }]), 'out-of-order quantities are rejected');
  ok(M.validatePoints([{ q: 10, p: 5 }, { q: 20, p: 6 }]), 'upward slope is rejected');
  ok(M.validatePoints([{ q: 10, p: 5 }, { q: 10.2, p: 4 }]), 'points too close in quantity are rejected');
  ok(M.validatePoints([{ q: 10, p: 5 }, { q: 20, p: 4.98 }]), 'points too close in price are rejected');
  ok(M.validatePoints([{ q: -1, p: 5 }, { q: 20, p: 4 }]), 'negative quantity is rejected');
  ok(M.validatePoints([{ q: 0, p: 11 }, { q: 20, p: 4 }]), 'price above $10 is rejected');
  ok(M.validatePoints(Array.from({ length: 13 }, (_, i) => ({ q: i * 5, p: 10 - i * 0.5 }))), '13 points are rejected');

  const r = rng(7);
  for (let n = 0; n < 2000; n++) {
    const pts = randomPoints(r), i = Math.floor(r() * pts.length);
    const res = M.clampMove(pts, i, r() * 140 - 20, r() * 14 - 2);
    ok(!M.validatePoints(res.points), `clamped move ${n} stays valid: ` + M.validatePoints(res.points));
  }
  const pts = [{ q: 0, p: 10 }, { q: 50, p: 5 }, { q: 100, p: 0 }];
  const res = M.clampMove(pts, 1, 120, 12);
  ok(res.clamped && res.points[1].q === 99.5 && res.points[1].p === 9.95, 'a move past both neighbours stops at the nearest valid spot');
  ok(!M.clampMove(pts, 1, 40, 6).clamped, 'a valid move is not clamped');

  ok(M.lineFrom({ q: 80, p: 2 }, { q: 10, p: 9 }).points, 'line tool accepts points in either order');
  ok(M.lineFrom({ q: 10, p: 2 }, { q: 80, p: 9 }).error, 'line tool refuses an upward line');
  ok(M.lineFrom({ q: 10, p: 2 }, { q: 10.2, p: 9 }).error, 'line tool refuses a vertical line');
  ok(M.lineFrom({ q: 10, p: 5 }, { q: 80, p: 5.01 }).error, 'line tool refuses a flat line');

  // A wobbly downward sketch is cleaned and resampled to 7 valid points.
  const wobble = [];
  for (let i = 0; i <= 200; i++) { const q = 5 + i * 0.45; wobble.push({ q: q + Math.sin(i) * 0.8, p: 9.5 - q * 0.08 + Math.cos(i * 1.7) * 0.15 }); }
  const fit = M.fitSketch(wobble);
  ok(fit.points && fit.points.length === 7 && !M.validatePoints(fit.points), 'wobbly sketch becomes 7 valid points');
  ok(M.fitSketch([{ q: 10, p: 2 }, { q: 50, p: 8 }]).error, 'upward sketch is refused');
  ok(M.fitSketch([{ q: 10, p: 8 }, { q: 12, p: 7 }]).error, 'too-short sketch is refused');
  ok(M.fitSketch([]).error, 'empty sketch is refused');
  const flatish = M.fitSketch([{ q: 0, p: 5 }, { q: 50, p: 4.99 }, { q: 100, p: 4.98 }]);
  ok(flatish.error, 'nearly flat sketch is refused');
  const s1 = M.smoothStep({ q: 0, p: 0 }, { q: 10, p: 10 }, 0.25);
  ok(s1.q === 2.5 && s1.p === 2.5, 'smoothing moves a quarter of the distance');
}

// 7. Views, scales and sharing.
{
  const lin = M.buildCurve(M.getPreset('linear').points);
  let v = M.viewFor(lin, { showMR: true });
  ok(v.pMin === -10 && !v.mrClipped, 'MR on a straight line extends the price axis to −$10');
  v = M.viewFor(lin, { tangentAt: 30 });
  ok(v.qMax === 100 && v.pMax === 10, 'a straight line tangent fits the base view');
  const convex = M.buildCurve(M.getPreset('convex').points);
  v = M.viewFor(convex, { tangentAt: 60 });
  const t = M.tangent(convex, 60);
  ok(v.qMax >= t.qInt || v.offscale, 'rescale fits the convex tangent Q-intercept (' + t.qInt.toFixed(1) + ' → ' + v.qMax + ')');
  const steep = M.buildCurve([{ q: 0, p: 10 }, { q: 50, p: 9.9 }, { q: 51, p: 0 }]);
  v = M.viewFor(steep, { showMR: true });
  ok(v.pMin === -20 && v.mrClipped, 'very negative MR is clipped at −$20');
  const flatEnd = M.buildCurve([{ q: 0, p: 10 }, { q: 95, p: 9.9 }, { q: 100, p: 0 }]);
  v = M.viewFor(flatEnd, { tangentAt: 5 });
  ok(v.qMax <= 1000, 'rescale is capped at 10× the base range');
  ok(M.niceCeil(260) === 500 && M.niceCeil(250) === 250 && M.niceCeil(101) === 200, 'nice rounding');
  ok(M.trScaleTop(lin) === 250, 'TR axis top for a straight line is $250');

  const r = rng(99);
  for (let n = 0; n < 500; n++) {
    const pts = randomPoints(r).map(o => ({ q: M.round(o.q, 1), p: M.round(o.p, 2) }));
    if (M.validatePoints(pts)) continue;
    const back = M.decodePoints(M.encodePoints(pts));
    ok(back && back.length === pts.length && back.every((o, i) => o.q === pts[i].q && o.p === pts[i].p), `URL round trip ${n}`);
  }
  ok(M.decodePoints('10:5,5:4') === null, 'invalid URL points are ignored');
  ok(M.decodePoints('junk') === null, 'garbage URL is ignored');

  ok(M.money(-3.456) === '−$3.46' && M.money(12) === '$12.00' && M.money(-0.001) === '$0.00', 'money formatting');
  ok(M.elasticity(Infinity) === '∞ (undefined)' && M.elasticity(1) === '1.00', 'elasticity formatting');
}

console.log(checks.toLocaleString('en-US') + ' checks, ' + failures + ' failures');
process.exit(failures ? 1 : 0);
