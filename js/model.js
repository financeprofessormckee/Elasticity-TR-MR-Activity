/* Elasticity, TR, MR — demand-curve mathematics (no DOM).
   Economic concept: David Friedman (Living Paper, Proposal 6). Implementation: Eric McKee.
   Classic script: exposes window.ElasticityModel in the browser and module.exports under Node. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ElasticityModel = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* Demand is P(Q) through control points in a 0–100 unit × $0–$10 box, joined by a
     monotone cubic Hermite spline (Fritsch–Butland tangents, as in PCHIP). */
  var CONFIG = {
    qMax: 100,
    pMax: 10,
    minPoints: 2,
    maxPoints: 12,
    minDq: 0.5,
    minDp: 0.05,
    eCap: 5,              // elasticity right-axis range 0–5
    rescaleCap: 10,       // auto-rescale grows the view to at most 10× the base range
    sketchPoints: 7,
    minSketchSpan: 5,     // a sketch must cover at least 5 units of quantity
    mrFloor: -20,         // the price axis extends at most to −$20 for MR
    peakTolerance: 1.5,   // guided prompt 1
    revenueBand: 0.05     // guided prompt 2: TR within 5% of its average
  };

  var PRESETS = [
    { id: 'linear', name: 'Straight line', points: [{ q: 0, p: 10 }, { q: 100, p: 0 }] },
    { id: 'exact-unit', name: 'Exact unit elasticity · P = 200/Q', kind: 'constant-revenue', points: geometric(9, 20, 100).map(function (q) { return { q: q, p: 200 / q }; }) },
    { id: 'unit', name: 'Nearly unit-elastic (TR ≈ constant)', points: geometric(9, 20, 100).map(function (q) { return { q: q, p: 200 / q }; }) },
    { id: 'convex', name: 'Bowed in (convex)', points: even(7).map(function (q) { return { q: q, p: 10 * Math.pow(1 - q / 100, 2) }; }) },
    { id: 'concave', name: 'Bowed out (concave)', points: even(7).map(function (q) { return { q: q, p: 10 * (1 - Math.pow(q / 100, 2)) }; }) }
  ];

  function geometric(n, lo, hi) {
    var out = [];
    for (var i = 0; i < n; i++) out.push(round(lo * Math.pow(hi / lo, i / (n - 1)), 1));
    return out;
  }
  function even(n) {
    var out = [];
    for (var i = 0; i < n; i++) out.push(round(100 * i / (n - 1), 1));
    return out;
  }

  function round(x, d) { var f = Math.pow(10, d); return Math.round(x * f) / f; }
  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }
  function copyPoints(pts) { return pts.map(function (o) { return { q: o.q, p: o.p }; }); }
  function getPreset(id) {
    for (var i = 0; i < PRESETS.length; i++) if (PRESETS[i].id === id) return PRESETS[i];
    return PRESETS[0];
  }

  /* ---------- Validation ---------- */

  // Returns null for a valid point list, or a sentence explaining the first problem.
  function validatePoints(pts) {
    if (!Array.isArray(pts) || pts.length < CONFIG.minPoints) return 'A demand curve needs at least two points.';
    if (pts.length > CONFIG.maxPoints) return 'A demand curve can have at most ' + CONFIG.maxPoints + ' points.';
    for (var i = 0; i < pts.length; i++) {
      var o = pts[i];
      if (!o || typeof o.q !== 'number' || typeof o.p !== 'number' || !isFinite(o.q) || !isFinite(o.p)) return 'Point ' + (i + 1) + ' needs both a quantity and a price.';
      if (o.q < 0 || o.q > CONFIG.qMax) return 'Point ' + (i + 1) + ': quantity must be between 0 and ' + CONFIG.qMax + '.';
      if (o.p < 0 || o.p > CONFIG.pMax) return 'Point ' + (i + 1) + ': price must be between $0 and $' + CONFIG.pMax + '.';
      if (i > 0) {
        var a = pts[i - 1];
        if (o.q - a.q < CONFIG.minDq - 1e-9) return 'Point ' + (i + 1) + ' must have a quantity at least ' + CONFIG.minDq + ' above point ' + i + '.';
        if (a.p - o.p < CONFIG.minDp - 1e-9) return 'Point ' + (i + 1) + ' must have a price at least $' + CONFIG.minDp.toFixed(2) + ' below point ' + i + ', because demand slopes downward.';
      }
    }
    return null;
  }

  // Move point i toward (q, p), stopping at the nearest position that keeps the curve valid.
  function clampMove(pts, i, q, p) {
    var prev = pts[i - 1], next = pts[i + 1];
    var qLo = prev ? prev.q + CONFIG.minDq : 0, qHi = next ? next.q - CONFIG.minDq : CONFIG.qMax;
    var pHi = prev ? prev.p - CONFIG.minDp : CONFIG.pMax, pLo = next ? next.p + CONFIG.minDp : 0;
    qLo = Math.max(0, qLo); qHi = Math.min(CONFIG.qMax, qHi);
    pLo = Math.max(0, pLo); pHi = Math.min(CONFIG.pMax, pHi);
    var nq = round(clamp(q, qLo, qHi), 2), np = round(clamp(p, pLo, pHi), 3);
    // Rounding can step just past a bound; nudge back inside.
    if (nq < qLo) nq = qLo; if (nq > qHi) nq = qHi;
    if (np < pLo) np = pLo; if (np > pHi) np = pHi;
    var out = copyPoints(pts);
    out[i] = { q: nq, p: np };
    return { points: out, clamped: Math.abs(nq - q) > 1e-6 || Math.abs(np - p) > 1e-6 };
  }

  // Line tool: two clicked points in either order.
  function lineFrom(a, b) {
    var lo = a.q <= b.q ? a : b, hi = a.q <= b.q ? b : a;
    lo = { q: round(clamp(lo.q, 0, CONFIG.qMax), 2), p: round(clamp(lo.p, 0, CONFIG.pMax), 3) };
    hi = { q: round(clamp(hi.q, 0, CONFIG.qMax), 2), p: round(clamp(hi.p, 0, CONFIG.pMax), 3) };
    if (hi.q - lo.q < CONFIG.minDq) return { error: 'Those points are almost directly above each other, which would make a vertical line. Pick points further apart in quantity.' };
    if (Math.abs(lo.p - hi.p) < CONFIG.minDp) return { error: 'Those points are at almost the same price, which would make a flat line. A demand curve here must slope downward.' };
    if (hi.p > lo.p) return { error: 'That line slopes upward. Demand slopes downward: the point further right must be lower.' };
    return { points: [lo, hi] };
  }

  /* ---------- Freehand sketch ---------- */

  // Friedman's smoothing: the curve's end grows toward the cursor at a speed proportional to the distance.
  function smoothStep(end, cursor, fraction) {
    var f = clamp(fraction, 0, 1);
    return { q: end.q + (cursor.q - end.q) * f, p: end.p + (cursor.p - end.p) * f };
  }

  // Keep the downward-sloping part of a sketched path, then resample it to evenly spaced control points.
  function fitSketch(path) {
    var kept = [];
    (path || []).forEach(function (raw) {
      var o = { q: clamp(raw.q, 0, CONFIG.qMax), p: clamp(raw.p, 0, CONFIG.pMax) };
      if (!isFinite(o.q) || !isFinite(o.p)) return;
      var last = kept[kept.length - 1];
      if (!last || (o.q > last.q + 1e-6 && o.p < last.p - 1e-6)) kept.push(o);
    });
    if (kept.length < 2 || kept[kept.length - 1].q - kept[0].q < CONFIG.minSketchSpan) {
      return { error: 'That sketch did not trace enough of a downward-sloping curve. Draw from upper left toward lower right.' };
    }
    var q0 = kept[0].q, q1 = kept[kept.length - 1].q, n = CONFIG.sketchPoints, out = [], j = 0;
    for (var i = 0; i < n; i++) {
      var q = q0 + (q1 - q0) * i / (n - 1);
      while (j < kept.length - 2 && kept[j + 1].q < q) j++;
      var a = kept[j], b = kept[j + 1], t = (q - a.q) / (b.q - a.q);
      out.push({ q: round(q, 2), p: round(a.p + (b.p - a.p) * clamp(t, 0, 1), 3) });
    }
    // Drop interior points that sit too close in price to their predecessor (flat stretches).
    var clean = [out[0]];
    for (var k = 1; k < out.length; k++) {
      var isLast = k === out.length - 1;
      var prev = clean[clean.length - 1];
      if (prev.p - out[k].p >= CONFIG.minDp && out[k].q - prev.q >= CONFIG.minDq) clean.push(out[k]);
      else if (isLast && clean.length > 1) {
        clean[clean.length - 1] = out[k];
        if (validatePoints(clean)) clean.pop();
      }
    }
    var err = validatePoints(clean);
    if (err) return { error: 'That sketch is too flat to make a demand curve. Draw a steeper downward curve.' };
    return { points: clean };
  }

  /* ---------- Spline ---------- */

  function sign(x) { return x > 0 ? 1 : x < 0 ? -1 : 0; }

  function edgeTangent(h0, h1, d0, d1) {
    var d = ((2 * h0 + h1) * d0 - h0 * d1) / (h0 + h1);
    if (sign(d) !== sign(d0)) return 0;
    if (sign(d0) !== sign(d1) && Math.abs(d) > Math.abs(3 * d0)) return 3 * d0;
    return d;
  }

  function buildCurve(points) {
    var pts = copyPoints(points), n = pts.length, h = [], d = [], m = new Array(n);
    for (var k = 0; k < n - 1; k++) {
      h.push(pts[k + 1].q - pts[k].q);
      d.push((pts[k + 1].p - pts[k].p) / h[k]);
    }
    if (n === 2) { m[0] = m[1] = d[0]; }
    else {
      for (k = 1; k < n - 1; k++) {
        if (sign(d[k - 1]) !== sign(d[k]) || d[k - 1] === 0 || d[k] === 0) { m[k] = 0; continue; }
        var w1 = 2 * h[k] + h[k - 1], w2 = h[k] + 2 * h[k - 1];
        m[k] = (w1 + w2) / (w1 / d[k - 1] + w2 / d[k]);
      }
      m[0] = edgeTangent(h[0], h[1], d[0], d[1]);
      m[n - 1] = edgeTangent(h[n - 2], h[n - 3] != null ? h[n - 3] : h[n - 2], d[n - 2], d[n - 3] != null ? d[n - 3] : d[n - 2]);
    }
    return { points: pts, tangents: m, q0: pts[0].q, q1: pts[n - 1].q };
  }

  function segment(curve, q) {
    var pts = curve.points, lo = 0, hi = pts.length - 2;
    while (lo < hi) {
      var mid = (lo + hi + 1) >> 1;
      if (pts[mid].q <= q) lo = mid; else hi = mid - 1;
    }
    return lo;
  }

  // Price and slope dP/dQ at q (q is clamped to the curve's range).
  function evaluate(curve, q) {
    q = clamp(q, curve.q0, curve.q1);
    if (curve.kind === 'constant-revenue') return {q: q, p: curve.revenue / q, slope: -curve.revenue / (q * q)};
    var k = segment(curve, q), a = curve.points[k], b = curve.points[k + 1];
    var h = b.q - a.q, t = (q - a.q) / h, ma = curve.tangents[k], mb = curve.tangents[k + 1];
    var t2 = t * t, t3 = t2 * t;
    var p = (2 * t3 - 3 * t2 + 1) * a.p + (t3 - 2 * t2 + t) * h * ma + (-2 * t3 + 3 * t2) * b.p + (t3 - t2) * h * mb;
    var s = (6 * t2 - 6 * t) / h * a.p + (3 * t2 - 4 * t + 1) * ma + (-6 * t2 + 6 * t) / h * b.p + (3 * t2 - 2 * t) * mb;
    return { q: q, p: Math.max(0, p), slope: s };
  }

  function priceAt(curve, q) { return evaluate(curve, q).p; }

  // Elasticity (a positive number), total revenue and marginal revenue at q.
  function measures(curve, q) {
    var v = evaluate(curve, q), e;
    if (curve.kind === 'constant-revenue') return {q: v.q, p: v.p, slope: v.slope, e: 1, tr: curve.revenue, mr: 0};
    if (v.p <= 1e-12) e = 0;
    else if (v.q <= 1e-12 || v.slope >= -1e-12) e = Infinity;
    else e = -v.p / (v.q * v.slope);
    return { q: v.q, p: v.p, slope: v.slope, e: e, tr: v.p * v.q, mr: v.p + v.q * v.slope };
  }

  /* ---------- Total-revenue maximum ---------- */

  // Coefficients in normalized segment coordinates t = (Q − Qa) / h.
  function revenueDerivative(curve, k) {
    var a = curve.points[k], b = curve.points[k + 1], h = b.q - a.q;
    var ma = curve.tangents[k], mb = curve.tangents[k + 1];
    var A = 2 * (a.p - b.p) + h * (ma + mb);
    var B = 3 * (b.p - a.p) - h * (2 * ma + mb), C = h * ma;
    var r = a.q / h;
    return [a.p + r * C, 2 * C + 2 * r * B, 3 * B + 3 * r * A, 4 * A];
  }

  function polynomial(coeffs, x) {
    var y = 0;
    for (var i = coeffs.length - 1; i >= 0; i--) y = y * x + coeffs[i];
    return y;
  }

  // Isolate every root in [0, 1], splitting at derivative roots. Each remaining
  // interval is monotone, so bisection cannot skip a narrow peak or a repeated root.
  function rootsInUnitInterval(coeffs) {
    var c = coeffs.slice();
    while (c.length > 1 && c[c.length - 1] === 0) c.pop();
    if (c.length < 2) return [];
    var derivative = c.slice(1).map(function (v, i) { return v * (i + 1); });
    var cuts = [0].concat(rootsInUnitInterval(derivative), [1]), roots = [];
    var tolerance = 1e-12 * Math.max.apply(null, c.map(Math.abs));
    function add(x) { if (!roots.some(function (r) { return Math.abs(r - x) < 1e-10; })) roots.push(x); }
    cuts.forEach(function (x) { if (Math.abs(polynomial(c, x)) <= tolerance) add(x); });
    for (var i = 1; i < cuts.length; i++) {
      var lo = cuts[i - 1], hi = cuts[i], fl = polynomial(c, lo), fh = polynomial(c, hi);
      if (fl * fh >= 0) continue;
      for (var j = 0; j < 55; j++) {
        var mid = (lo + hi) / 2, fm = polynomial(c, mid);
        if ((fl > 0) === (fm > 0)) { lo = mid; fl = fm; } else hi = mid;
      }
      add((lo + hi) / 2);
    }
    return roots.sort(function (a, b) { return a - b; });
  }

  function stationaryQuantities(curve) {
    if (curve.kind === 'constant-revenue') return []; // Every point is stationary.
    var qs = [];
    for (var k = 0; k < curve.points.length - 1; k++) {
      var a = curve.points[k], h = curve.points[k + 1].q - a.q;
      rootsInUnitInterval(revenueDerivative(curve, k)).forEach(function (t) {
        var q = a.q + t * h;
        if (q > curve.q0 && q < curve.q1 && !qs.some(function (v) { return Math.abs(v - q) < 1e-8; })) qs.push(q);
      });
    }
    return qs.sort(function (a, b) { return a - b; });
  }

  function trMax(curve) {
    if (curve.kind === 'constant-revenue') return {q: (curve.q0 + curve.q1) / 2, tr: curve.revenue, interior: true, flat: true, e: 1, mr: 0};
    // TR is quartic on each spline segment. Its global maximum is at an
    // endpoint, a knot, or a root of the cubic MR; examine all candidates.
    var candidates = curve.points.map(function (p) { return p.q; }).concat(stationaryQuantities(curve));
    var best = measures(curve, curve.q0);
    candidates.forEach(function (q) { var m = measures(curve, q); if (m.tr > best.tr) best = m; });
    var interior = best.q > curve.q0 && best.q < curve.q1;
    return { q: best.q, tr: best.tr, interior: interior, end: interior ? null : best.q === curve.q0 ? 'low' : 'high', e: best.e, mr: best.mr };
  }

  /* ---------- Tangent (Friedman's calc tool) ---------- */

  function tangent(curve, q) {
    var m = measures(curve, q), s = m.slope;
    var flat = s >= -1e-12, degenerate = flat && m.p <= 1e-12;
    var qInt = degenerate ? NaN : flat ? Infinity : m.q - m.p / s;
    var pInt = m.p - s * m.q;                       // where it reaches Q = 0
    var eSegments = degenerate ? NaN : m.q <= 1e-12 ? Infinity : (flat ? Infinity : (qInt - m.q) / m.q);
    return { q: m.q, p: m.p, slope: s, qInt: qInt, pInt: pInt, eFormula: m.e, eSegments: eSegments, degenerate: degenerate };
  }

  /* ---------- Tables and views ---------- */

  function sample(curve, n) {
    n = n || 11;
    var rows = [];
    for (var i = 0; i < n; i++) rows.push(measures(curve, curve.q0 + (curve.q1 - curve.q0) * i / (n - 1)));
    return rows;
  }

  function niceCeil(v) {
    if (!(v > 0)) return 1;
    var k = Math.pow(10, Math.floor(Math.log10(v))), r = v / k;
    var steps = [1, 2, 2.5, 5, 10];
    for (var i = 0; i < steps.length; i++) if (r <= steps[i] + 1e-9) return steps[i] * k;
    return 10 * k;
  }

  // Plot ranges. Grows to fit MR below zero and, when requested, both tangent intercepts.
  function viewFor(curve, opts) {
    opts = opts || {};
    var v = { qMax: CONFIG.qMax, pMin: 0, pMax: CONFIG.pMax, mrClipped: false, offscale: null };
    if (opts.showMR) {
      var minMR = mrRange(curve).min;
      if (minMR < 0) {
        v.pMin = -niceCeil(-minMR);
        if (v.pMin < CONFIG.mrFloor) { v.pMin = CONFIG.mrFloor; v.mrClipped = true; }
      }
    }
    if (opts.tangentAt != null) {
      var t = tangent(curve, opts.tangentAt), capQ = CONFIG.qMax * CONFIG.rescaleCap, capP = CONFIG.pMax * CONFIG.rescaleCap;
      if (t.qInt > v.qMax) {
        if (!isFinite(t.qInt)) { v.offscale = 'quantity'; }
        else if (t.qInt > capQ) { v.qMax = capQ; v.offscale = 'quantity'; } else v.qMax = niceCeil(t.qInt);
      }
      if (t.pInt > v.pMax) {
        if (t.pInt > capP) { v.pMax = capP; v.offscale = v.offscale ? 'both' : 'price'; } else v.pMax = niceCeil(t.pInt);
      }
    }
    return v;
  }

  // Top of the TR right axis: a nice round number at or above the curve's largest TR.
  function trScaleTop(curve) {
    return niceCeil(Math.max(trMax(curve).tr, 1));
  }

  /* ---------- Guided prompts ---------- */

  // Unit elasticity everywhere is the same as constant total revenue. Spline end slopes drift,
  // so the check is on TR (within 5% of its average), which hand-entered curves can meet.
  function isUnitElastic(curve) {
    var rows = sample(curve, 201), sum = 0;
    rows.forEach(function (r) { sum += r.tr; });
    var mean = sum / rows.length;
    if (!(mean > 0)) return false;
    for (var i = 0; i < rows.length; i++) if (Math.abs(rows[i].tr - mean) > CONFIG.revenueBand * mean) return false;
    return true;
  }

  function promptStatus(curve, selectedQ, showTangent) {
    var peak = trMax(curve), at = measures(curve, selectedQ);
    return {
      peak: !!peak.flat || peak.interior && Math.abs(at.q - peak.q) <= CONFIG.peakTolerance,
      unit: isUnitElastic(curve),
      elasticLine: curve.points.length === 2 && at.e > 1 && isFinite(at.e),
      calc: !!showTangent && curve.points.length >= 3 && at.q > 0 && at.p > 0 && isFinite(at.e)
    };
  }

  /* ---------- Sharing ---------- */

  function encodePoints(pts) {
    // Preserve the actual curve, including full-precision preset prices and tight gaps.
    return pts.map(function (o) { return o.q + ':' + o.p; }).join(',');
  }

  function decodePoints(str) {
    if (typeof str !== 'string' || !str || str.length > 2048) return null;
    var pairs = str.split(','), number = /^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;
    if (pairs.length < CONFIG.minPoints || pairs.length > CONFIG.maxPoints) return null;
    var pts = pairs.map(function (pair) {
      var bits = pair.split(':');
      if (bits.length !== 2 || !number.test(bits[0]) || !number.test(bits[1])) return null;
      return { q: Number(bits[0]), p: Number(bits[1]) };
    });
    return validatePoints(pts) ? null : pts;
  }

  /* ---------- Formatting ---------- */

  function money(v, decimals) {
    if (!isFinite(v)) return v > 0 ? '∞' : '−∞';
    var d = decimals == null ? 2 : decimals, s = Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
    return (v < -0.5 * Math.pow(10, -d) ? '−$' : '$') + s;
  }
  function qty(v) { return isFinite(v) ? round(v, 1).toLocaleString('en-US', { maximumFractionDigits: 1 }) : '∞'; }
  function elasticity(e) { return Number.isNaN(e) ? 'Undefined' : isFinite(e) ? e.toFixed(2) : '∞ (undefined)'; }

  // An exact teaching reference, explicitly converted to a spline before editing.
  function constantRevenueCurve() {
    var curve = buildCurve(getPreset('exact-unit').points);
    curve.kind = 'constant-revenue'; curve.revenue = 200;
    return curve;
  }

  function mrRange(curve) {
    if (curve.kind === 'constant-revenue') return {min: 0, max: 0};
    var values = [];
    for (var k = 0; k < curve.points.length - 1; k++) {
      var c = revenueDerivative(curve,k);
      var roots = rootsInUnitInterval(c.slice(1).map(function(v,i){return v*(i+1);}));
      [0,1].concat(roots).forEach(function(t){values.push(polynomial(c,t));});
    }
    return {min: Math.min.apply(null,values), max: Math.max.apply(null,values)};
  }

  function revenueChange(curve, from, to) {
    var a = measures(curve,from), b = measures(curve,to), delta = b.tr - a.tr;
    var tolerance = 1e-9 * Math.max(1,Math.abs(a.tr),Math.abs(b.tr));
    return {from:a, to:b, delta:delta, direction:Math.abs(delta)<=tolerance?'same':delta>0?'increase':'decrease'};
  }

  function valuesCsv(curve, selectedQ) {
    var qs = sample(curve,101).map(function(r){return r.q;}).concat(stationaryQuantities(curve),[clamp(selectedQ,curve.q0,curve.q1)]);
    qs.sort(function(a,b){return a-b;});
    var rows = ['Quantity (units/week),Price ($/unit),Elasticity,Total revenue ($/week),Marginal revenue ($/unit),Demand model'];
    qs.forEach(function(q,i){
      if(i && Math.abs(q-qs[i-1])<1e-10) return;
      var m=measures(curve,q);
      rows.push([m.q,m.p,isFinite(m.e)?m.e:'undefined',m.tr,m.mr,curve.kind==='constant-revenue'?'P=200/Q':'Monotone cubic spline'].join(','));
    });
    return rows.join('\r\n')+'\r\n';
  }

  return {
    CONFIG: CONFIG,
    PRESETS: PRESETS,
    getPreset: getPreset,
    copyPoints: copyPoints,
    validatePoints: validatePoints,
    clampMove: clampMove,
    lineFrom: lineFrom,
    smoothStep: smoothStep,
    fitSketch: fitSketch,
    buildCurve: buildCurve,
    evaluate: evaluate,
    priceAt: priceAt,
    measures: measures,
    trMax: trMax,
    stationaryQuantities: stationaryQuantities,
    constantRevenueCurve: constantRevenueCurve,
    mrRange: mrRange,
    revenueChange: revenueChange,
    valuesCsv: valuesCsv,
    tangent: tangent,
    sample: sample,
    niceCeil: niceCeil,
    viewFor: viewFor,
    trScaleTop: trScaleTop,
    isUnitElastic: isUnitElastic,
    promptStatus: promptStatus,
    encodePoints: encodePoints,
    decodePoints: decodePoints,
    money: money,
    qty: qty,
    elasticity: elasticity,
    round: round
  };
});
