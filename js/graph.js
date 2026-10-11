/* Elasticity, TR, MR — SVG graph rendering. Draws from a plain view object; holds no activity state.
   Plotted marks are hidden from assistive technology (the page's text and tables carry the values);
   the control-point handles are real focusable buttons that persist across renders so keyboard focus survives. */
(function (root) {
  'use strict';
  var M = root.ElasticityModel;
  var NS = 'http://www.w3.org/2000/svg';
  var LEFT = 58, TOP = 18, W = 300, H = 280, RIGHT_GAP = 58;
  var WIDTH = LEFT + W + RIGHT_GAP, HEIGHT = TOP + H + 48;

  function el(name, attrs, text) {
    var n = document.createElementNS(NS, name);
    for (var a in attrs) n.setAttribute(a, attrs[a]);
    if (text != null) n.textContent = text;
    return n;
  }

  function mapper(v) {
    return {
      x: function (q) { return LEFT + q / v.qMax * W; },
      y: function (p) { return TOP + (v.pMax - p) / (v.pMax - v.pMin) * H; }
    };
  }

  function tickStep(span) { return M.niceCeil(span / 5); }
  function fmtTick(v) { return (v < 0 ? '−' : '') + Math.abs(M.round(v, 2)).toLocaleString('en-US', { maximumFractionDigits: 2 }); }

  // Build an SVG path from f(q) -> price-axis value, sampled over [q0, q1]. Non-finite values break the path.
  function pathFor(f, q0, q1, map, lo, hi, curve) {
    var d = '', pen = false, N = 240, qs = [];
    for (var n = 0; n <= N; n++) qs.push(q0+(q1-q0)*n/N);
    if (curve) {
      qs = qs.concat(M.stationaryQuantities(curve));
      for (var k = 1; k < curve.points.length; k++) for (var j = 0; j <= 20; j++) qs.push(curve.points[k-1].q+(curve.points[k].q-curve.points[k-1].q)*j/20);
    }
    qs.sort(function(a,b){return a-b;});
    for (var i = 0; i < qs.length; i++) {
      var q = qs[i], v = f(q);
      if (!isFinite(v)) { pen = false; continue; }
      v = Math.max(lo, Math.min(hi, v));
      d += (pen ? 'L' : 'M') + map.x(q).toFixed(2) + ' ' + map.y(v).toFixed(2);
      pen = true;
    }
    return d;
  }

  /* view = { curve, view (from M.viewFor), show {e, tr, mr}, rightAxis 'e'|'tr'|null, trTop,
              selectedQ, tangent (from M.tangent) | null, peak (from M.trMax) | null,
              lineFirst {q,p} | null, sketch [{q,p}] | null, handlesOn (bool) } */
  function render(svg, view) {
    var v = view.view, map = mapper(v), c = view.curve;
    var scale = Math.max(1, WIDTH / (svg.getBoundingClientRect().width || WIDTH));
    svg.style.setProperty('--tick-size', (11 * scale) + 'px');
    svg.style.setProperty('--axis-size', (11.5 * scale) + 'px');
    var marks = svg.querySelector('g.marks');
    if (!marks) {
      marks = el('g', { 'class': 'marks', 'aria-hidden': 'true' });
      svg.insertBefore(marks, svg.querySelector('g.handles'));
    }
    while (marks.firstChild) marks.removeChild(marks.firstChild);

    var defs = el('defs', {});
    var clip = el('clipPath', { id: 'plot-clip' });
    clip.appendChild(el('rect', { x: LEFT, y: TOP, width: W, height: H }));
    defs.appendChild(clip);
    marks.appendChild(defs);
    marks.appendChild(el('rect', { x: LEFT, y: TOP, width: W, height: H, 'class': 'plot-bg' }));

    // Grid and ticks.
    var ps = tickStep(v.pMax - v.pMin), qs = tickStep(v.qMax);
    for (var p = Math.ceil(v.pMin / ps) * ps; p <= v.pMax + 1e-9; p += ps) {
      marks.appendChild(el('line', { x1: LEFT, y1: map.y(p), x2: LEFT + W, y2: map.y(p), 'class': p === 0 ? 'axis' : 'gridline' }));
      marks.appendChild(el('text', { x: LEFT - 6, y: map.y(p) + 4, 'class': 'tick', 'text-anchor': 'end' }, (p < 0 ? '−$' : '$') + fmtTick(Math.abs(p))));
      if (view.rightAxis && p >= 0) {
        var top = view.rightAxis === 'e' ? M.CONFIG.eCap : view.trTop, rv = p / v.pMax * top;
        marks.appendChild(el('text', { x: LEFT + W + 6, y: map.y(p) + 4, 'class': 'tick tick--right' }, (view.rightAxis === 'tr' ? '$' : '') + fmtTick(rv)));
      }
    }
    for (var q = 0; q <= v.qMax + 1e-9; q += qs) {
      if (q > 0) marks.appendChild(el('line', { x1: map.x(q), y1: TOP, x2: map.x(q), y2: TOP + H, 'class': 'gridline' }));
      marks.appendChild(el('text', { x: map.x(q), y: TOP + H + 16, 'class': 'tick', 'text-anchor': 'middle' }, fmtTick(q)));
    }
    marks.appendChild(el('line', { x1: LEFT, y1: TOP, x2: LEFT, y2: TOP + H, 'class': 'axis' }));
    marks.appendChild(el('line', { x1: LEFT, y1: TOP + H, x2: LEFT + W, y2: TOP + H, 'class': 'axis axis--frame' }));
    if (view.rightAxis) marks.appendChild(el('line', { x1: LEFT + W, y1: TOP, x2: LEFT + W, y2: map.y(0), 'class': 'axis' }));
    marks.appendChild(el('text', { x: LEFT + W / 2, y: TOP + H + 38, 'class': 'axis-title', 'text-anchor': 'middle' }, 'Quantity (units per week)'));
    marks.appendChild(el('text', { x: 14, y: TOP + H / 2, 'class': 'axis-title', 'text-anchor': 'middle',
      transform: 'rotate(-90 14 ' + (TOP + H / 2) + ')' }, 'Price and MR ($ per unit)'));
    if (view.rightAxis) {
      var rx = WIDTH - 10;
      marks.appendChild(el('text', { x: rx, y: TOP + H / 2, 'class': 'axis-title axis-title--' + view.rightAxis, 'text-anchor': 'middle',
        transform: 'rotate(90 ' + rx + ' ' + (TOP + H / 2) + ')' }, view.rightAxis === 'e' ? 'Elasticity (pure number)' : 'Total revenue ($ per week)'));
    }

    var plot = el('g', { 'clip-path': 'url(#plot-clip)' });
    marks.appendChild(plot);
    var lo = v.pMin - 1, hi = v.pMax + 1;

    // Total-revenue peak guide.
    if (c && view.peak && view.peak.interior && !view.peak.flat) {
      plot.appendChild(el('line', { x1: map.x(view.peak.q), y1: TOP, x2: map.x(view.peak.q), y2: TOP + H, 'class': 'peak-guide' }));
    }
    // Selected-quantity guide.
    if (c && view.selectedQ != null) {
      plot.appendChild(el('line', { x1: map.x(view.selectedQ), y1: TOP, x2: map.x(view.selectedQ), y2: TOP + H, 'class': 'sel-guide' }));
    }

    if (c) {
      if (view.showArea && view.selectedQ != null) {
        var area = M.measures(c, view.selectedQ);
        plot.appendChild(el('rect', {x: map.x(0), y: map.y(area.p), width: map.x(area.q)-map.x(0), height: map.y(0)-map.y(area.p), 'class': 'revenue-area'}));
      }
      if (view.reference) plot.appendChild(el('path', {d: pathFor(function(q){return M.priceAt(view.reference,q);}, view.reference.q0, view.reference.q1,map,lo,hi,view.reference), 'class':'reference-series'}));
      if (view.show.tr) {
        var ktr = v.pMax / view.trTop;
        plot.appendChild(el('path', { d: pathFor(function (q) { return M.measures(c, q).tr * ktr; }, c.q0, c.q1, map, lo, hi, c), 'class': 'series series--tr' }));
      }
      if (view.show.e) {
        var ke = v.pMax / M.CONFIG.eCap;
        plot.appendChild(el('path', { d: pathFor(function (q) { var e = M.measures(c, q).e; return isFinite(e) ? e * ke : hi; }, c.q0, c.q1, map, lo, hi, c), 'class': 'series series--e' }));
      }
      if (view.show.mr) {
        plot.appendChild(el('path', { d: pathFor(function (q) { return M.measures(c, q).mr; }, c.q0, c.q1, map, lo, hi, c), 'class': 'series series--mr' }));
      }
      plot.appendChild(el('path', { d: pathFor(function (q) { return M.priceAt(c, q); }, c.q0, c.q1, map, lo, hi, c), 'class': 'series series--demand' }));
    }

    // Tangent: upper segment (to the price axis) and lower segment (to the quantity axis).
    var t = view.tangent;
    if (c && t && isFinite(t.qInt)) {
      plot.appendChild(el('line', { x1: map.x(0), y1: map.y(t.pInt), x2: map.x(t.q), y2: map.y(t.p), 'class': 'tangent tangent--upper' }));
      plot.appendChild(el('line', { x1: map.x(t.q), y1: map.y(t.p), x2: map.x(t.qInt), y2: map.y(0), 'class': 'tangent tangent--lower' }));
      plot.appendChild(el('text', { x: (map.x(0) + map.x(t.q)) / 2 + 6, y: (map.y(t.pInt) + map.y(t.p)) / 2 - 6, 'class': 'seg-label' }, 'upper'));
      plot.appendChild(el('text', { x: (map.x(t.q) + map.x(t.qInt)) / 2 + 6, y: (map.y(t.p) + map.y(0)) / 2 - 6, 'class': 'seg-label' }, 'lower'));
      plot.appendChild(el('circle', { cx: map.x(t.qInt), cy: map.y(0), r: 3.5, 'class': 'intercept' }));
      plot.appendChild(el('circle', { cx: map.x(0), cy: map.y(t.pInt), r: 3.5, 'class': 'intercept' }));
    } else if (c && t && !t.degenerate) {
      plot.appendChild(el('line', { x1: LEFT, y1: map.y(t.p), x2: LEFT + W, y2: map.y(t.p), 'class': 'tangent tangent--lower' }));
    }

    if (c && view.peak && view.peak.interior && !view.peak.flat) {
      var pk = view.peak;
      if (view.show.tr) plot.appendChild(el('circle', { cx: map.x(pk.q), cy: map.y(pk.tr * v.pMax / view.trTop), r: 4, 'class': 'peak-mark' }));
      if (view.show.e) plot.appendChild(el('circle', { cx: map.x(pk.q), cy: map.y(pk.e * v.pMax / M.CONFIG.eCap), r: 4, 'class': 'peak-mark' }));
      if (view.show.mr) plot.appendChild(el('circle', { cx: map.x(pk.q), cy: map.y(pk.mr), r: 4, 'class': 'peak-mark' }));
      plot.appendChild(el('rect', { x: map.x(pk.q) - 4.5, y: map.y(M.priceAt(c, pk.q)) - 4.5, width: 9, height: 9, 'class': 'peak-mark', transform: 'rotate(45 ' + map.x(pk.q) + ' ' + map.y(M.priceAt(c, pk.q)) + ')' }));
      marks.appendChild(el('text', { x: Math.min(map.x(pk.q) + 5, LEFT + W - 60), y: TOP + 12, 'class': 'peak-label' }, 'TR peak'));
    }
    if (c && view.selectedQ != null) {
      plot.appendChild(el('circle', { cx: map.x(view.selectedQ), cy: map.y(M.priceAt(c, view.selectedQ)), r: 5, 'class': 'sel-mark' }));
    }

    // Tool feedback.
    if (view.lineFirst) {
      plot.appendChild(el('circle', { cx: map.x(view.lineFirst.q), cy: map.y(view.lineFirst.p), r: 5, 'class': 'line-first' }));
    }
    if (view.sketch && view.sketch.length > 1) {
      plot.appendChild(el('polyline', { points: view.sketch.map(function (o) { return map.x(o.q).toFixed(1) + ',' + map.y(o.p).toFixed(1); }).join(' '), 'class': 'sketch' }));
    }

    renderHandles(svg, view, map);
  }

  // Handles persist between renders (updated in place) so a focused handle keeps focus while it moves.
  function renderHandles(svg, view, map) {
    var layer = svg.querySelector('g.handles');
    var pts = view.handlesOn && view.curve ? view.curve.points : [];
    var pixels = svg.getBoundingClientRect().width || WIDTH;
    var hitSize = Math.max(28, 24 * WIDTH / pixels);
    while (layer.childNodes.length > pts.length) layer.removeChild(layer.lastChild);
    pts.forEach(function (o, i) {
      var h = layer.childNodes[i];
      if (!h) {
        h = el('g', { 'class': 'handle', tabindex: '0', role: 'button', 'aria-describedby': 'handle-help' });
        h.appendChild(el('rect', { 'class': 'handle__hit', width: 28, height: 28 }));
        h.appendChild(el('rect', { 'class': 'handle__box', width: 10, height: 10 }));
        layer.appendChild(h);
      }
      var x = map.x(o.q), y = map.y(o.p);
      h.setAttribute('data-index', i);
      h.setAttribute('aria-label', 'Point ' + (i + 1) + ': quantity ' + M.qty(o.q) + ', price ' + M.money(o.p));
      h.childNodes[0].setAttribute('width', hitSize); h.childNodes[0].setAttribute('height', hitSize);
      h.childNodes[0].setAttribute('x', x - hitSize / 2); h.childNodes[0].setAttribute('y', y - hitSize / 2);
      h.childNodes[1].setAttribute('x', x - 5); h.childNodes[1].setAttribute('y', y - 5);
    });
  }

  // Convert a pointer event to data coordinates for the current view.
  function toData(svg, evt, v) {
    var pt = svg.createSVGPoint();
    pt.x = evt.clientX; pt.y = evt.clientY;
    var m = svg.getScreenCTM();
    if (!m) return null;
    var s = pt.matrixTransform(m.inverse());
    var q = (s.x - LEFT) / W * v.qMax, p = v.pMax - (s.y - TOP) / H * (v.pMax - v.pMin);
    var inside = s.x >= LEFT - 6 && s.x <= LEFT + W + 6 && s.y >= TOP - 6 && s.y <= TOP + H + 6;
    return { q: q, p: p, inside: inside };
  }

  root.ElasticityGraph = { render: render, toData: toData, WIDTH: WIDTH, HEIGHT: HEIGHT };
})(this);
