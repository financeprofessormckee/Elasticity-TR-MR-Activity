/* Elasticity, TR, MR — page controller: curve state, tools, DOM wiring, announcements. */
(function () {
  'use strict';
  var M = window.ElasticityModel;
  var Graph = window.ElasticityGraph;
  var CFG = M.CONFIG;

  function $(id) { return document.getElementById(id); }
  var svg = $('graph');

  var state = {
    points: null,
    curve: null,
    show: { e: false, tr: false, mr: false },
    rightAxis: 'e',
    tool: 'reshape',
    selectedQ: 50,
    showTangent: false,
    lineFirst: null,
    sketch: null,
    view: null
  };

  /* ---------- Curve changes ---------- */
  function setPoints(pts, message) {
    state.points = M.copyPoints(pts);
    state.curve = M.buildCurve(state.points);
    state.selectedQ = Math.min(state.curve.q1, Math.max(state.curve.q0, state.selectedQ));
    buildPointTable();
    render();
    if (message) announce(message);
  }

  function describeCurve() {
    var pts = state.points, a = pts[0], b = pts[pts.length - 1];
    return (pts.length === 2 ? 'Straight demand line' : 'Demand curve through ' + pts.length + ' points') +
      ' from quantity ' + M.qty(a.q) + ' at ' + M.money(a.p) + ' to quantity ' + M.qty(b.q) + ' at ' + M.money(b.p) + '.';
  }

  /* ---------- Rendering ---------- */
  function rightAxis() {
    if (state.show.e && state.show.tr) return state.rightAxis;
    if (state.show.e) return 'e';
    if (state.show.tr) return 'tr';
    return null;
  }

  function render() {
    var c = state.curve, tan = state.showTangent ? M.tangent(c, state.selectedQ) : null;
    state.view = M.viewFor(c, { showMR: state.show.mr, tangentAt: state.showTangent ? state.selectedQ : null });
    var peak = M.trMax(c);
    Graph.render(svg, {
      curve: c,
      view: state.view,
      show: state.show,
      rightAxis: rightAxis(),
      trTop: M.trScaleTop(c),
      selectedQ: state.selectedQ,
      tangent: tan,
      peak: peak,
      lineFirst: state.lineFirst,
      sketch: state.sketch && state.sketch.path,
      handlesOn: state.tool === 'reshape' && !state.sketch
    });
    renderToggles();
    renderReadout(peak, tan);
    renderValues();
    renderPrompts();
    renderDesc(peak, tan);
    renderShare();
  }

  function renderToggles() {
    ['e', 'tr', 'mr'].forEach(function (k) { $('show-' + k).setAttribute('aria-pressed', state.show[k] ? 'true' : 'false'); });
    var btn = $('right-axis'), both = state.show.e && state.show.tr;
    btn.hidden = !both;
    if (both) btn.textContent = 'Right axis: ' + (state.rightAxis === 'e' ? 'elasticity' : 'total revenue') + ' (switch)';
  }

  function renderReadout(peak, tan) {
    var c = state.curve, m = M.measures(c, state.selectedQ);
    var sl = $('sel-q'), num = $('sel-q-num');
    sl.min = num.min = M.round(c.q0, 1); sl.max = num.max = M.round(c.q1, 1);
    sl.value = M.round(m.q, 1);
    if (document.activeElement !== num) num.value = M.round(m.q, 1);
    sl.setAttribute('aria-valuetext', M.qty(m.q) + ' units');
    $('readout').innerHTML = '';
    [['Price', M.money(m.p)], ['Elasticity', M.elasticity(m.e) + (isFinite(m.e) ? (m.e > 1 ? ' (elastic)' : m.e < 1 ? ' (inelastic)' : ' (unit-elastic)') : '')],
     ['Total revenue', M.money(m.tr)], ['Marginal revenue', M.money(m.mr)]].forEach(function (row) {
      var dt = document.createElement('dt'), dd = document.createElement('dd');
      dt.textContent = row[0]; dd.textContent = row[1];
      $('readout').appendChild(dt); $('readout').appendChild(dd);
    });

    var calc = $('calc');
    calc.hidden = !tan;
    if (tan) calc.innerHTML = calcHtml(tan);

    var note;
    if (peak.interior) note = 'Total revenue peaks at quantity ' + M.qty(peak.q) + ' (price ' + M.money(M.priceAt(c, peak.q)) + ', TR ' + M.money(peak.tr) + '). There, elasticity is ' + M.elasticity(peak.e) + ' and marginal revenue is ' + M.money(Math.abs(peak.mr) < 0.005 ? 0 : peak.mr) + '.';
    else if (peak.end === 'high') note = 'Total revenue rises all the way to the right end of this curve: demand is elastic (e > 1) and MR is positive everywhere on it, so TR has no peak inside the curve.';
    else note = 'Total revenue is highest at the left end of this curve: demand is inelastic (e < 1) and MR is negative everywhere on it, so TR has no peak inside the curve.';
    $('peak-note').textContent = note;
    var gn = [];
    if (state.show.e) gn.push('Elasticity above ' + CFG.eCap + ' runs off the top of the graph.');
    if (state.view.mrClipped) gn.push('MR below ' + M.money(CFG.mrFloor, 0) + ' is not drawn.');
    if (state.view.offscale) gn.push('The tangent reaches the ' + (state.view.offscale === 'price' ? 'price axis' : state.view.offscale === 'quantity' ? 'quantity axis' : 'axes') + ' beyond the enlarged view.');
    else if (tan && (state.view.qMax > CFG.qMax || state.view.pMax > CFG.pMax)) gn.push('The view has zoomed out so the whole tangent fits.');
    $('graph-note').textContent = gn.join(' ');
  }

  function calcHtml(t) {
    function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;'); }
    if (!(t.q > 0)) return '<p>At quantity 0 elasticity is undefined (infinite): the lower segment is finite but the upper segment has zero length. Pick a quantity greater than 0.</p>';
    if (!isFinite(t.qInt)) return '<p>The curve is flat at this point, so the tangent never reaches the quantity axis and elasticity is infinite.</p>';
    var slope = t.slope, ratio = t.eSegments;
    return '<p><strong>Point:</strong> Q = ' + esc(M.qty(t.q)) + ', P = ' + esc(M.money(t.p)) + '. <strong>Slope of the tangent:</strong> <span class="nowrap">' + esc(M.money(slope, 3)) + '</span> per unit.</p>' +
      '<p>The tangent meets the price axis at ' + esc(M.money(t.pInt)) + ' and the quantity axis at Q = ' + esc(M.qty(t.qInt)) + '.</p>' +
      '<p><strong>Segments:</strong> e = lower segment ÷ upper segment = (' + esc(M.qty(t.qInt)) + ' − ' + esc(M.qty(t.q)) + ') ÷ ' + esc(M.qty(t.q)) + ' = <strong>' + esc(M.elasticity(ratio)) + '</strong></p>' +
      '<p><strong>Formula:</strong> e = −(1 ÷ slope) × (P ÷ Q) = −(1 ÷ ' + esc(slope.toFixed(3).replace('-', '−')) + ') × (' + esc(t.p.toFixed(2)) + ' ÷ ' + esc(M.qty(t.q)) + ') = <strong>' + esc(M.elasticity(t.eFormula)) + '</strong></p>' +
      '<p class="calc__agree">The two methods agree. Along a straight line, each segment\'s length is proportional to how far it runs in quantity.</p>';
  }

  function renderValues() {
    var body = $('values').tBodies[0];
    body.innerHTML = '';
    M.sample(state.curve, 11).forEach(function (r) {
      var tr = document.createElement('tr');
      [M.qty(r.q), M.money(r.p), M.elasticity(r.e), M.money(r.tr), M.money(r.mr)].forEach(function (v, i) {
        var cell = document.createElement(i === 0 ? 'th' : 'td');
        if (i === 0) cell.scope = 'row';
        cell.className = 'num';
        cell.textContent = v;
        tr.appendChild(cell);
      });
      body.appendChild(tr);
    });
  }

  var PROMPTS = [
    { key: 'peak', text: 'Move the selected quantity to where total revenue peaks. What are elasticity and MR there?' },
    { key: 'unit', text: 'Make demand unit-elastic everywhere, so total revenue is the same at every quantity. Hint: choose points where price × quantity is the same (five or more points).' },
    { key: 'elasticLine', text: 'On a straight line, pick a quantity above the midpoint price. Is demand elastic there?' },
    { key: 'calc', text: 'On a curved demand (three or more points), show the tangent calculation and check that both methods agree.' }
  ];
  var promptDone = {};

  function renderPrompts() {
    var st = M.promptStatus(state.curve, state.selectedQ, state.showTangent), list = $('prompts');
    if (!list.childNodes.length) {
      PROMPTS.forEach(function (p) {
        var li = document.createElement('li');
        li.innerHTML = '<span class="prompt__text"></span> <span class="prompt__status"></span>';
        li.firstChild.textContent = p.text;
        list.appendChild(li);
      });
    }
    PROMPTS.forEach(function (p, i) {
      var li = list.childNodes[i], done = !!st[p.key];
      li.className = done ? 'prompt--done' : '';
      li.lastChild.textContent = done ? '✓ Done' : 'Not yet';
      if (done && !promptDone[p.key]) announce('Try this ' + (i + 1) + ' done.');
      promptDone[p.key] = done;
    });
  }

  function renderDesc(peak, tan) {
    var parts = [describeCurve()];
    var shown = [];
    if (state.show.e) shown.push('elasticity');
    if (state.show.tr) shown.push('total revenue');
    if (state.show.mr) shown.push('marginal revenue on the price axis');
    parts.push(shown.length ? 'Also drawn: ' + shown.join(', ') + '.' : 'No other curves are drawn.');
    var ra = rightAxis();
    if (ra) parts.push('The right axis shows ' + (ra === 'e' ? 'elasticity from 0 to ' + CFG.eCap : 'total revenue from $0 to ' + M.money(M.trScaleTop(state.curve), 0)) + '.');
    parts.push('Selected quantity ' + M.qty(state.selectedQ) + '.');
    if (peak.interior) parts.push('A marker shows the total revenue peak at quantity ' + M.qty(peak.q) + '.');
    if (tan && isFinite(tan.qInt) && tan.q > 0) parts.push('The tangent at the selected point runs from ' + M.money(tan.pInt) + ' on the price axis to quantity ' + M.qty(tan.qInt) + ' on the quantity axis.');
    parts.push('Values appear in the readout and the tables below.');
    $('graph-desc').textContent = parts.join(' ');
  }

  function shareUrl() {
    var base = window.location.href.split('?')[0].split('#')[0];
    return base + '?pts=' + encodeURIComponent(M.encodePoints(state.points));
  }
  function renderShare() {
    var url = shareUrl();
    $('share-link').href = url;
    try { window.history.replaceState(null, '', url); } catch (e) { /* file:// may refuse; the link still works */ }
  }

  /* ---------- Point table ---------- */
  function buildPointTable() {
    var body = $('points').tBodies[0];
    body.innerHTML = '';
    state.points.forEach(function (o, i) {
      var tr = document.createElement('tr');
      var th = document.createElement('th'); th.scope = 'row'; th.textContent = String(i + 1); tr.appendChild(th);
      [['q', o.q, 0.1], ['p', o.p, 0.01]].forEach(function (f) {
        var td = document.createElement('td'), inp = document.createElement('input');
        inp.type = 'number'; inp.step = f[2]; inp.inputMode = 'decimal';
        inp.min = 0; inp.max = f[0] === 'q' ? CFG.qMax : CFG.pMax;
        inp.value = f[0] === 'q' ? M.round(f[1], 2) : M.round(f[1], 3);
        inp.setAttribute('aria-label', 'Point ' + (i + 1) + (f[0] === 'q' ? ' quantity' : ' price in dollars'));
        inp.dataset.index = i; inp.dataset.field = f[0];
        inp.addEventListener('change', onPointInput);
        td.appendChild(inp); tr.appendChild(td);
      });
      var tdb = document.createElement('td'), rm = document.createElement('button');
      rm.type = 'button'; rm.className = 'btn btn--quiet btn--small'; rm.textContent = 'Remove';
      rm.setAttribute('aria-label', 'Remove point ' + (i + 1));
      rm.disabled = state.points.length <= CFG.minPoints;
      rm.addEventListener('click', function () { removePoint(i); });
      tdb.appendChild(rm); tr.appendChild(tdb);
      body.appendChild(tr);
    });
    $('add-point').disabled = state.points.length >= CFG.maxPoints;
  }

  function onPointInput(evt) {
    var inp = evt.target, i = Number(inp.dataset.index), f = inp.dataset.field;
    var pts = M.copyPoints(state.points);
    pts[i][f] = inp.value === '' ? NaN : Number(inp.value);
    var err = M.validatePoints(pts);
    if (err) {
      inp.setAttribute('aria-invalid', 'true');
      inp.setAttribute('aria-describedby', 'points-note');
      $('points-note').textContent = err + ' The curve still uses the previous value.';
      announce(err);
      return;
    }
    $('points-note').textContent = '';
    var focusId = { i: i, f: f };
    setPoints(pts, 'Point ' + (i + 1) + ' updated. ' + describeCurve());
    restoreTableFocus(focusId);
  }

  function restoreTableFocus(id) {
    var inp = $('points').querySelector('input[data-index="' + id.i + '"][data-field="' + id.f + '"]');
    if (inp) inp.focus();
  }

  function removePoint(i) {
    if (state.points.length <= CFG.minPoints) return;
    var pts = M.copyPoints(state.points);
    pts.splice(i, 1);
    if (M.validatePoints(pts)) return;
    $('points-note').textContent = '';
    setPoints(pts, 'Point ' + (i + 1) + ' removed. ' + describeCurve());
    var btn = $('points').querySelectorAll('tbody button')[Math.min(i, pts.length - 1)];
    if (btn && !btn.disabled) btn.focus(); else $('add-point').focus();
  }

  // Add a point on the current curve in the middle of the widest gap, so the curve does not change shape much.
  function addPoint() {
    var pts = state.points, best = 0;
    for (var i = 1; i < pts.length - 1; i++) if (pts[i + 1].q - pts[i].q > pts[best + 1].q - pts[best].q) best = i;
    var q = M.round((pts[best].q + pts[best + 1].q) / 2, 2), p = M.round(M.priceAt(state.curve, q), 3);
    var out = M.copyPoints(pts);
    out.splice(best + 1, 0, { q: q, p: p });
    if (M.validatePoints(out)) { $('points-note').textContent = 'There is no room for another point: the neighbouring points are too close together.'; announce($('points-note').textContent); return; }
    $('points-note').textContent = '';
    setPoints(out, 'Point ' + (best + 2) + ' added at quantity ' + M.qty(q) + ', price ' + M.money(p) + '.');
    restoreTableFocus({ i: best + 1, f: 'q' });
  }

  /* ---------- Handles (keyboard) ---------- */
  function onHandleKey(evt) {
    var h = evt.target.closest && evt.target.closest('.handle');
    if (!h) return;
    var i = Number(h.getAttribute('data-index')), o = state.points[i];
    var mult = evt.shiftKey ? 10 : 1, dq = 0, dp = 0;
    if (evt.key === 'ArrowLeft') dq = -CFG.minDq * mult;
    else if (evt.key === 'ArrowRight') dq = CFG.minDq * mult;
    else if (evt.key === 'ArrowUp') dp = CFG.minDp * mult;
    else if (evt.key === 'ArrowDown') dp = -CFG.minDp * mult;
    else if (evt.key === 'Enter' || evt.key === ' ') { evt.preventDefault(); pickQuantity(o.q); return; }
    else return;
    evt.preventDefault();
    moveHandle(i, o.q + dq, o.p + dp, true);
  }

  function moveHandle(i, q, p, speak) {
    var res = M.clampMove(state.points, i, q, p), o = res.points[i];
    state.points = res.points;
    state.curve = M.buildCurve(state.points);
    state.selectedQ = Math.min(state.curve.q1, Math.max(state.curve.q0, state.selectedQ));
    buildPointTable();
    render();
    var msg = res.clamped ? 'Point ' + (i + 1) + ' stopped at quantity ' + M.qty(o.q) + ', price ' + M.money(o.p) + ': each point must stay right of and below the one before, inside the graph.' : '';
    $('graph-note').textContent = msg || $('graph-note').textContent;
    if (speak) announce(msg || 'Point ' + (i + 1) + ': quantity ' + M.qty(o.q) + ', price ' + M.money(o.p) + '.');
  }

  /* ---------- Pointer tools ---------- */
  var press = null, drag = null;

  function onPointerDown(evt) {
    if (evt.button != null && evt.button !== 0) return;
    var d = Graph.toData(svg, evt, state.view);
    if (!d) return;
    press = { x: evt.clientX, y: evt.clientY, moved: false };
    var h = evt.target.closest && evt.target.closest('.handle');
    if (state.tool === 'reshape' && h) {
      drag = Number(h.getAttribute('data-index'));
      svg.setPointerCapture(evt.pointerId);
      evt.preventDefault();
    } else if (state.tool === 'sketch' && d.inside) {
      var start = clampBox(d);
      state.sketch = { path: [start], end: start, cursor: start, raf: 0 };
      svg.setPointerCapture(evt.pointerId);
      evt.preventDefault();
      tickSketch();
    }
  }

  function onPointerMove(evt) {
    if (!press) return;
    if (!press.moved && Math.abs(evt.clientX - press.x) < 6 && Math.abs(evt.clientY - press.y) < 6) return;
    press.moved = true;
    var d = Graph.toData(svg, evt, state.view);
    if (!d) return;
    if (drag != null) moveHandle(drag, d.q, d.p, false);
    else if (state.sketch) state.sketch.cursor = clampBox(d);
  }

  function onPointerUp(evt) {
    var d = Graph.toData(svg, evt, state.view), wasMoved = press && press.moved;
    if (drag != null) {
      var i = drag; drag = null; press = null;
      // A press on a handle that never moved is an ordinary click: pick that point's quantity.
      if (!wasMoved) { pickQuantity(state.points[i].q); return; }
      var o = state.points[i];
      announce('Point ' + (i + 1) + ' moved to quantity ' + M.qty(o.q) + ', price ' + M.money(o.p) + '.');
      return;
    }
    if (state.sketch) { finishSketch(); press = null; return; }
    if (press && !wasMoved && d && d.inside) {
      if (state.tool === 'line') lineClick(clampBox(d));
      else if (state.tool === 'reshape') pickQuantity(d.q);
    }
    press = null;
  }

  function clampBox(d) { return { q: Math.min(CFG.qMax, Math.max(0, d.q)), p: Math.min(CFG.pMax, Math.max(0, d.p)) }; }

  function pickQuantity(q) {
    state.selectedQ = M.round(Math.min(state.curve.q1, Math.max(state.curve.q0, q)), 1);
    render();
    var m = M.measures(state.curve, state.selectedQ);
    announce('Quantity ' + M.qty(m.q) + ': price ' + M.money(m.p) + ', elasticity ' + M.elasticity(m.e) + ', total revenue ' + M.money(m.tr) + ', marginal revenue ' + M.money(m.mr) + '.');
  }

  function lineClick(pt) {
    if (!state.lineFirst) {
      state.lineFirst = pt;
      $('graph-note').textContent = 'First point placed at quantity ' + M.qty(pt.q) + ', price ' + M.money(pt.p) + '. Click the second point.';
      announce($('graph-note').textContent);
      render();
      return;
    }
    var res = M.lineFrom(state.lineFirst, pt);
    state.lineFirst = null;
    if (res.error) { render(); $('graph-note').textContent = res.error; announce(res.error); return; }
    $('points-note').textContent = '';
    setPoints(res.points, 'New demand line. ' + describeCurve());
  }

  // Friedman's smoothing: each frame the sketch's end moves a fixed fraction of the way to the cursor.
  function tickSketch() {
    var s = state.sketch;
    if (!s) return;
    s.end = M.smoothStep(s.end, s.cursor, 0.2);
    var last = s.path[s.path.length - 1];
    if (Math.abs(s.end.q - last.q) + Math.abs(s.end.p - last.p) > 0.15) s.path.push(s.end);
    render();
    s.raf = window.requestAnimationFrame(tickSketch);
  }

  function finishSketch() {
    var s = state.sketch;
    window.cancelAnimationFrame(s.raf);
    s.path.push(s.cursor);
    state.sketch = null;
    var fit = M.fitSketch(s.path);
    if (fit.error) { render(); $('graph-note').textContent = fit.error; announce(fit.error); return; }
    $('points-note').textContent = '';
    setPoints(fit.points, 'New sketched demand curve. ' + describeCurve());
  }

  /* ---------- Controls ---------- */
  var TOOL_HELP = {
    reshape: 'Drag a square handle to reshape the curve, or Tab to a handle and use the arrow keys. Click anywhere else on the graph to pick a quantity.',
    line: 'Click two spots on the graph for the two ends of a straight demand line. No dragging needed.',
    sketch: 'Press and drag from upper left to lower right. The curve follows your pointer smoothly; release to finish. The Line tool and the point table do the same job without dragging.'
  };

  function setTool(tool) {
    state.tool = tool;
    state.lineFirst = null;
    $('tool-help').textContent = TOOL_HELP[tool];
    svg.setAttribute('data-tool', tool);
    render();
  }

  function announce(msg) {
    var s = $('status');
    s.textContent = '';
    window.setTimeout(function () { s.textContent = msg; }, 30);
  }

  function init() {
    M.PRESETS.forEach(function (p) {
      var o = document.createElement('option');
      o.value = p.id; o.textContent = p.name;
      $('preset').appendChild(o);
    });
    var params = null;
    try { params = new URLSearchParams(window.location.search); } catch (e) { /* older browsers */ }
    var pts = params && M.decodePoints(params.get('pts'));
    state.points = pts || M.getPreset('linear').points;
    state.curve = M.buildCurve(state.points);
    state.selectedQ = M.round((state.curve.q0 + state.curve.q1) / 2, 1);

    document.querySelectorAll('input[name="tool"]').forEach(function (r) {
      r.addEventListener('change', function () { if (r.checked) setTool(r.value); });
    });
    ['e', 'tr', 'mr'].forEach(function (k) {
      $('show-' + k).addEventListener('click', function () {
        state.show[k] = !state.show[k];
        if (k === 'e' && state.show.e) state.rightAxis = 'e';
        if (k === 'tr' && state.show.tr) state.rightAxis = 'tr';
        render();
        announce($('show-' + k).textContent.trim() + (state.show[k] ? ' shown' : ' hidden') + '.');
      });
    });
    $('right-axis').addEventListener('click', function () {
      state.rightAxis = state.rightAxis === 'e' ? 'tr' : 'e';
      render();
      announce('Right axis now shows ' + (state.rightAxis === 'e' ? 'elasticity' : 'total revenue') + '.');
    });
    $('sel-q').addEventListener('input', function () { state.selectedQ = Number($('sel-q').value); render(); });
    $('sel-q-num').addEventListener('change', function () {
      var v = Number($('sel-q-num').value);
      if ($('sel-q-num').value === '' || !isFinite(v)) { $('sel-q-num').value = M.round(state.selectedQ, 1); return; }
      pickQuantity(v);
    });
    $('show-tangent').addEventListener('change', function () {
      state.showTangent = $('show-tangent').checked;
      render();
      if (state.showTangent) {
        var t = M.tangent(state.curve, state.selectedQ);
        announce('Tangent shown. Elasticity by segments ' + M.elasticity(t.eSegments) + '; by formula ' + M.elasticity(t.eFormula) + '.');
      } else announce('Tangent hidden.');
    });
    $('apply-preset').addEventListener('click', function () {
      var p = M.getPreset($('preset').value);
      $('points-note').textContent = '';
      state.selectedQ = M.round((p.points[0].q + p.points[p.points.length - 1].q) / 2, 1);
      setPoints(p.points, p.name + ' preset. ' + describeCurve());
    });
    $('add-point').addEventListener('click', addPoint);
    $('share-link').addEventListener('click', function (evt) {
      if (navigator.clipboard && window.isSecureContext) {
        evt.preventDefault();
        navigator.clipboard.writeText(shareUrl()).then(function () { announce('Link to this curve copied.'); }, function () { window.location.href = shareUrl(); });
      }
    });

    svg.addEventListener('pointerdown', onPointerDown);
    svg.addEventListener('pointermove', onPointerMove);
    svg.addEventListener('pointerup', onPointerUp);
    svg.addEventListener('pointercancel', function () { drag = null; press = null; if (state.sketch) { window.cancelAnimationFrame(state.sketch.raf); state.sketch = null; render(); } });
    svg.addEventListener('keydown', onHandleKey);

    buildPointTable();
    setTool('reshape');
  }

  init();
})();
