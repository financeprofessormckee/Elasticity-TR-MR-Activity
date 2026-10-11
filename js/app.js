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
    show: { e: true, tr: true, mr: true },
    layout: 'panels',
    showArea: true,
    reference: null,
    rightAxis: 'e',
    tool: 'reshape',
    selectedQ: 50,
    showTangent: false,
    lineFirst: null,
    sketch: null,
    view: null
  };

  /* ---------- Curve changes ---------- */
  function setPoints(pts, message, kind) {
    var before = state.curve ? snapshot() : null;
    state.points = M.copyPoints(pts);
    state.curve = kind === 'constant-revenue' ? M.constantRevenueCurve() : M.buildCurve(state.points);
    state.selectedQ = Math.min(state.curve.q1, Math.max(state.curve.q0, state.selectedQ));
    if (before && !restoring) recordHistory(before);
    buildPointTable();
    render();
    if (message) announce(message + ' ' + describeCurve());
  }

  function describeCurve() {
    var pts = state.points, a = pts[0], b = pts[pts.length - 1];
    if (state.curve.kind === 'constant-revenue') return 'Exact demand P = 200/Q, from Q = 20 to Q = 100. Total revenue is $200 per week at every quantity.';
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
    state.view = gestureView || M.viewFor(c, { showMR: state.show.mr, tangentAt: state.showTangent ? state.selectedQ : null });
    var peak = M.trMax(c);
    Graph.render(svg, {
      curve: c,
      view: state.view,
      show: state.layout === 'panels' ? {e:false,tr:false,mr:state.show.mr} : state.show,
      rightAxis: state.layout === 'panels' ? null : rightAxis(),
      trTop: revenueScale(),
      showArea: state.showArea,
      reference: state.reference,
      selectedQ: state.selectedQ,
      tangent: tan,
      peak: peak,
      lineFirst: state.lineFirst,
      sketch: state.sketch && state.sketch.path,
      handlesOn: state.tool === 'reshape' && !state.sketch && c.kind !== 'constant-revenue'
    });
    renderToggles();
    renderReadout(peak, tan);
    renderValues();
    renderPrompts();
    renderDesc(peak, tan);
    renderWorkspace(peak);
    renderShare();
  }

  function renderToggles() {
    ['e', 'tr', 'mr'].forEach(function (k) { $('show-' + k).setAttribute('aria-pressed', state.show[k] ? 'true' : 'false'); });
    var btn = $('right-axis'), both = state.layout === 'overlay' && state.show.e && state.show.tr;
    btn.hidden = !both;
    if (both) btn.textContent = 'Right axis: ' + (state.rightAxis === 'e' ? 'elasticity' : 'total revenue') + ' (switch)';
  }

  function renderReadout(peak, tan) {
    var c = state.curve, m = M.measures(c, state.selectedQ);
    var sl = $('sel-q'), num = $('sel-q-num');
    sl.min = num.min = c.q0; sl.max = num.max = c.q1;
    sl.value = m.q;
    num.value = m.q;
    sl.setAttribute('aria-valuetext', M.qty(m.q) + ' units');
    $('readout').innerHTML = '';
    [['Price ($/unit)', M.money(m.p)], ['Elasticity', M.elasticity(m.e) + (isFinite(m.e) ? (Math.abs(m.e - 1) < 1e-8 ? ' (unit-elastic)' : m.e > 1 ? ' (elastic)' : ' (inelastic)') : '')],
     ['TR ($/week)', M.money(m.tr)], ['MR ($/unit)', M.money(m.mr)]].forEach(function (row) {
      var dt = document.createElement('dt'), dd = document.createElement('dd');
      dt.textContent = row[0]; dd.textContent = row[1];
      $('readout').appendChild(dt); $('readout').appendChild(dd);
    });

    var calc = $('calc');
    calc.hidden = !tan;
    if (tan) calc.innerHTML = calcHtml(tan);

    var note;
    if (peak.flat) note = 'Every quantity from 20 to 100 earns $200 per week: TR is constant, e = 1, and MR = 0 everywhere. There is no unique revenue-maximizing quantity.';
    else if (peak.interior) note = 'Total revenue peaks at quantity ' + M.qty(peak.q) + ' (price ' + M.money(M.priceAt(c, peak.q)) + ', TR ' + M.money(peak.tr) + '). There, elasticity is ' + M.elasticity(peak.e) + ' and marginal revenue is ' + M.money(Math.abs(peak.mr) < 0.005 ? 0 : peak.mr) + '.';
    else note = 'The highest total revenue in the drawn range is ' + M.money(peak.tr) + ' at the ' + (peak.end === 'high' ? 'right' : 'left') + ' endpoint (Q = ' + M.qty(peak.q) + '). The interior-maximum rule does not apply at a boundary. Revenue can still rise and fall elsewhere on this curve.';
    $('peak-note').textContent = note;
    var gn = [];
    if (state.show.e) gn.push('Elasticity above ' + CFG.eCap + ' runs off the top of the graph.');
    if (state.view.mrClipped) gn.push('MR below ' + M.money(CFG.mrFloor, 0) + ' is not drawn.');
    if (tan && !isFinite(tan.qInt)) gn.push(tan.degenerate ? 'At this zero-price endpoint the tangent lies on the quantity axis.' : 'This horizontal tangent has no finite quantity intercept.');
    else if (state.view.offscale) gn.push('The tangent reaches the ' + (state.view.offscale === 'price' ? 'price axis' : state.view.offscale === 'quantity' ? 'quantity axis' : 'axes') + ' beyond the enlarged view.');
    else if (tan && (state.view.qMax > CFG.qMax || state.view.pMax > CFG.pMax)) gn.push('The view has zoomed out so the whole tangent fits.');
    $('graph-note').textContent = gn.join(' ');
  }

  function calcHtml(t) {
    function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;'); }
    if (t.degenerate) return '<p>At this zero-price endpoint the tangent lies on the quantity axis, so the segment ratio and point formula are undefined (0 ÷ 0). The readout uses the one-sided limiting elasticity of 0. Choose an interior point to compare the two calculations.</p>';
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
    { key: 'unit', text: 'Compare the exact P = 200/Q reference with an editable approximation. Constant TR means e = 1 and MR = 0 at every interior point; the spline only approximates this.' },
    { key: 'elasticLine', text: 'On a straight line, pick a point with elasticity greater than one. What is the sign of marginal revenue there?' },
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
    if (state.layout === 'panels') parts.push('Revenue and elasticity use separate aligned panels, each with its own labelled scale.');
    if (ra && state.layout === 'overlay') parts.push('The right axis shows ' + (ra === 'e' ? 'elasticity from 0 to ' + CFG.eCap : 'total revenue from $0 to ' + M.money(revenueScale(), 0)) + '.');
    parts.push('Selected quantity ' + M.qty(state.selectedQ) + '.');
    if (peak.flat) parts.push('Total revenue is constant throughout the range; there is no unique peak.');
    else if (peak.interior) parts.push('A marker shows the total revenue peak at quantity ' + M.qty(peak.q) + '.');
    if (tan && isFinite(tan.qInt) && tan.q > 0) parts.push('The tangent at the selected point runs from ' + M.money(tan.pInt) + ' on the price axis to quantity ' + M.qty(tan.qInt) + ' on the quantity axis.');
    parts.push('Values appear in the readout and the tables below.');
    $('graph-desc').textContent = parts.join(' ');
  }

  function shareUrl() {
    var url = new URL(window.location.href);
    if (state.curve.kind === 'constant-revenue') { url.searchParams.set('model','unit'); url.searchParams.delete('pts'); }
    else { url.searchParams.set('pts', M.encodePoints(state.points)); url.searchParams.delete('model'); }
    url.searchParams.set('q', state.selectedQ);
    url.searchParams.set('show', ['e','tr','mr'].filter(function(k){return state.show[k];}).join(','));
    url.searchParams.set('layout', state.layout);
    url.searchParams.set('axis', state.rightAxis);
    url.searchParams.set('tangent', state.showTangent ? '1' : '0');
    url.searchParams.set('area', state.showArea ? '1' : '0');
    return url.href;
  }
  function renderShare() {
    var url = shareUrl();
    $('share-link').href = url;
    $('share-url').value = url;
    try { if (window.location.href !== url) window.history.replaceState(null, '', url); } catch (e) { /* file:// may refuse; the link still works */ }
  }

  /* ---------- Point table ---------- */
  function buildPointTable() {
    var body = $('points').tBodies[0];
    // Keep inputs in place during edits: rebuilding on change steals Tab/click focus.
    if (body.rows.length === state.points.length) {
      body.querySelectorAll('input').forEach(function (inp) {
        inp.value = state.points[Number(inp.dataset.index)][inp.dataset.field];
        inp.removeAttribute('aria-invalid'); inp.removeAttribute('aria-describedby');
      });
      syncPointControls();
      return;
    }
    body.innerHTML = '';
    state.points.forEach(function (o, i) {
      var tr = document.createElement('tr');
      var th = document.createElement('th'); th.scope = 'row'; th.textContent = String(i + 1); tr.appendChild(th);
      [['q', o.q, 0.1], ['p', o.p, 0.01]].forEach(function (f) {
        var td = document.createElement('td'), inp = document.createElement('input');
        inp.type = 'number'; inp.step = 'any'; inp.inputMode = 'decimal';
        inp.min = 0; inp.max = f[0] === 'q' ? CFG.qMax : CFG.pMax;
        inp.value = f[1];
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
    syncPointControls();
  }

  function onPointInput(evt) {
    if (state.curve.kind === 'constant-revenue') return;
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
    setPoints(pts, 'Point ' + (i + 1) + ' updated.');
  }

  function restoreTableFocus(id) {
    var inp = $('points').querySelector('input[data-index="' + id.i + '"][data-field="' + id.f + '"]');
    if (inp) inp.focus();
  }

  function removePoint(i) {
    if (state.curve.kind === 'constant-revenue') return;
    if (state.points.length <= CFG.minPoints) return;
    var pts = M.copyPoints(state.points);
    pts.splice(i, 1);
    if (M.validatePoints(pts)) return;
    $('points-note').textContent = '';
    setPoints(pts, 'Point ' + (i + 1) + ' removed.');
    var btn = $('points').querySelectorAll('tbody button')[Math.min(i, pts.length - 1)];
    if (btn && !btn.disabled) btn.focus(); else $('add-point').focus();
  }

  // Add a point on the current curve in the middle of the widest gap, so the curve does not change shape much.
  function addPoint() {
    if (state.curve.kind === 'constant-revenue') return;
    var pts = state.points, best = -1, out, q, p, width = 0;
    if (pts.length >= CFG.maxPoints) return;
    // The widest gap may be too flat. Try every gap before reporting no room.
    for (var i = 0; i < pts.length - 1; i++) {
      var span = pts[i + 1].q - pts[i].q;
      if (span < 2 * CFG.minDq || pts[i].p - pts[i + 1].p < 2 * CFG.minDp || span <= width) continue;
      var nq = (pts[i].q + pts[i + 1].q) / 2;
      var np = Math.max(pts[i + 1].p + CFG.minDp, Math.min(pts[i].p - CFG.minDp, M.priceAt(state.curve, nq)));
      var candidate = M.copyPoints(pts);
      candidate.splice(i + 1, 0, { q: nq, p: np });
      if (!M.validatePoints(candidate)) { best = i; out = candidate; q = nq; p = np; width = span; }
    }
    if (best < 0) { $('points-note').textContent = 'There is no room for another point: the neighbouring points are too close together.'; announce($('points-note').textContent); return; }
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
    if (state.curve.kind === 'constant-revenue') return;
    var before = snapshot();
    var res = M.clampMove(state.points, i, q, p), o = res.points[i];
    state.points = res.points;
    state.curve = M.buildCurve(state.points);
    if (!press) recordHistory(before);
    state.selectedQ = Math.min(state.curve.q1, Math.max(state.curve.q0, state.selectedQ));
    buildPointTable();
    render();
    var msg = res.clamped ? 'Point ' + (i + 1) + ' stopped at quantity ' + M.qty(o.q) + ', price ' + M.money(o.p) + ': each point must stay right of and below the one before, inside the graph.' : '';
    $('graph-note').textContent = msg || $('graph-note').textContent;
    if (speak) announce(msg || 'Point ' + (i + 1) + ': quantity ' + M.qty(o.q) + ', price ' + M.money(o.p) + '.');
  }

  /* ---------- Pointer tools ---------- */
  var press = null, drag = null, gestureView = null;

  function onPointerDown(evt) {
    if (press || evt.isPrimary === false || (evt.button != null && evt.button !== 0)) return;
    var d = Graph.toData(svg, evt, state.view);
    if (!d) return;
    if (!d.inside) return;
    press = { x: evt.clientX, y: evt.clientY, moved: false, id: evt.pointerId, before: snapshot() };
    gestureView = state.view;
    svg.setPointerCapture(evt.pointerId);
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
    if (!press || evt.pointerId !== press.id) return;
    if (!press.moved && Math.abs(evt.clientX - press.x) < 6 && Math.abs(evt.clientY - press.y) < 6) return;
    press.moved = true;
    var d = Graph.toData(svg, evt, state.view);
    if (!d) return;
    if (drag != null) moveHandle(drag, d.q, d.p, false);
    else if (state.sketch) state.sketch.cursor = clampBox(d);
  }

  function onPointerUp(evt) {
    if (!press || evt.pointerId !== press.id) return;
    gestureView = null;
    if (svg.hasPointerCapture(evt.pointerId)) svg.releasePointerCapture(evt.pointerId);
    var d = Graph.toData(svg, evt, state.view), wasMoved = press.moved, before = press.before;
    if (drag != null) {
      var i = drag; drag = null; press = null;
      // A press on a handle that never moved is an ordinary click: pick that point's quantity.
      if (!wasMoved) { pickQuantity(state.points[i].q); return; }
      var o = state.points[i];
      recordHistory(before);
      render();
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
    state.selectedQ = Math.min(state.curve.q1, Math.max(state.curve.q0, q));
    render();
    var m = M.measures(state.curve, state.selectedQ);
    announce('Quantity ' + M.qty(m.q) + ': price ' + M.money(m.p) + ', elasticity ' + M.elasticity(m.e) + ', total revenue ' + M.money(m.tr) + ', marginal revenue ' + M.money(m.mr) + '.');
  }

  function lineClick(pt) {
    if (!state.lineFirst) {
      state.lineFirst = pt;
      render();
      $('graph-note').textContent = 'First point placed at quantity ' + M.qty(pt.q) + ', price ' + M.money(pt.p) + '. Click the second point, or press Escape to cancel.';
      announce($('graph-note').textContent);
      return;
    }
    var res = M.lineFrom(state.lineFirst, pt);
    state.lineFirst = null;
    if (res.error) { render(); $('graph-note').textContent = res.error; announce(res.error); return; }
    $('points-note').textContent = '';
    setPoints(res.points, 'New demand line.');
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
    setPoints(fit.points, 'New sketched demand curve.');
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

  var announceTimer;
  function announce(msg) {
    window.clearTimeout(announceTimer);
    var s = $('status');
    s.textContent = '';
    announceTimer = window.setTimeout(function () { s.textContent = msg; }, 30);
  }

  /* ---------- Reversible editing, linked views, and classroom exploration ---------- */
  var undoStack = [], redoStack = [], restoring = false, challenge = null;

  function snapshot() {
    return {points:M.copyPoints(state.points), kind:state.curve.kind || 'spline', q:state.selectedQ};
  }
  function recordHistory(before) {
    if (before.kind === (state.curve.kind || 'spline') && M.encodePoints(before.points) === M.encodePoints(state.points)) return;
    undoStack.push(before); if (undoStack.length > 50) undoStack.shift();
    redoStack = [];
  }
  function restoreSnapshot(saved) {
    restoring = true;
    state.selectedQ = saved.q;
    setPoints(saved.points, '', saved.kind);
    restoring = false;
  }
  function syncPointControls() {
    var exact = state.curve.kind === 'constant-revenue';
    $('points').querySelectorAll('input').forEach(function(input){input.disabled=exact;});
    $('points').querySelectorAll('button').forEach(function(button){button.disabled=exact || state.points.length<=CFG.minPoints;});
    $('add-point').disabled = exact || state.points.length >= CFG.maxPoints;
    $('points-model-note').hidden = !exact;
  }
  function revenueScale() {
    return Math.max(M.trScaleTop(state.curve), state.reference ? M.trScaleTop(state.reference) : 0);
  }
  function renderWorkspace(peak) {
    $('undo').disabled = !undoStack.length; $('redo').disabled = !redoStack.length;
    $('linked-panels').hidden = state.layout !== 'panels';
    var exact = state.curve.kind === 'constant-revenue';
    $('make-editable').hidden = !exact;
    $('model-note').textContent = exact ? 'Exact reference: P = 200/Q. All quantities from 20 to 100 earn $200/week. Convert to a spline before editing its points.' : 'Editable demand: a smooth, downward-sloping spline through your points. For exact constant revenue, choose P = 200/Q.';
    $('select-peak').disabled = !!peak.flat;
    $('reference-legend').hidden = !state.reference;
    ['tr','e'].forEach(function(k){
      $(k+'-panel').hidden = !state.show[k];
      if (state.layout==='panels' && state.show[k]) window.ElasticityPanels.render($(k+'-graph'),{
        kind:k,curve:state.curve,reference:state.reference,qMax:state.view.qMax,trTop:revenueScale(),selectedQ:state.selectedQ,peak:peak
      });
    });
    var m=M.measures(state.curve,state.selectedQ), interpretation;
    if (exact) interpretation='Unit-elastic at every quantity: price falls in exactly the proportion needed to keep revenue at $200/week. MR = 0 throughout.';
    else if (m.q<=0 || m.p<=0 || !isFinite(m.e)) interpretation='At an endpoint or horizontal tangent, use the formula and limiting-value notes with care. Choose an interior positive-price point to compare elasticity with MR.';
    else if (Math.abs(m.mr)<1e-8) interpretation='MR = 0 and e = 1 here. Revenue is locally stationary; check neighboring quantities to tell a maximum from a minimum.';
    else interpretation=m.mr>0 ? 'Elastic demand (e > 1): a small quantity increase and price cut raises revenue. MR is positive.' : 'Inelastic demand (e < 1): a small quantity increase and price cut lowers revenue. MR is negative.';
    $('interpretation').textContent=interpretation;
    $('linked-desc').textContent='All panels use the same quantity axis. At Q = '+M.qty(m.q)+', TR = '+M.money(m.tr)+' per week, e = '+M.elasticity(m.e)+', and MR = '+M.money(m.mr)+' per unit. '+(peak.flat?'Revenue is constant throughout.':$('peak-note').textContent)+' Elasticity above 5 is clipped. Exact values are in the tables.';
    renderComparison();
    renderPrediction();
  }
  function renderComparison() {
    var box=$('comparison');box.hidden=!state.reference;$('clear-curve').hidden=!state.reference;
    if (!state.reference) return;
    box.replaceChildren();
    if (state.selectedQ<state.reference.q0 || state.selectedQ>state.reference.q1) {
      box.textContent='The selected quantity is outside the pinned curve’s range ('+M.qty(state.reference.q0)+'–'+M.qty(state.reference.q1)+'). Choose a quantity in both curves to compare values; no extrapolation is used.';
      return;
    }
    var a=M.measures(state.reference,state.selectedQ),b=M.measures(state.curve,state.selectedQ);
    var table=document.createElement('table');table.className='comparison-table';
    var caption=table.createCaption();caption.textContent='At Q = '+M.qty(state.selectedQ)+' units/week';
    var head=table.createTHead().insertRow();
    ['Measure','Pinned','Current'].forEach(function(label){var th=document.createElement('th');th.scope='col';th.textContent=label;head.appendChild(th);});
    var body=table.createTBody();
    [['Price ($/unit)','p',M.money],['TR ($/week)','tr',M.money],['MR ($/unit)','mr',M.money],['Elasticity','e',M.elasticity]].forEach(function(row){
      var tr=body.insertRow(),th=document.createElement('th');th.scope='row';th.textContent=row[0];tr.appendChild(th);
      [a,b].forEach(function(m){var td=tr.insertCell();td.textContent=row[2](m[row[1]]);});
    });
    box.appendChild(table);
    var note=document.createElement('p');note.className='small';note.textContent='Revenue difference: '+M.money(b.tr-a.tr)+'/week at this quantity.';box.appendChild(note);
  }
  function renderPrediction() {
    var delta=Number($('prediction-step').value), valid=$('prediction-step').value!=='' && isFinite(delta) && delta!==0 && Math.abs(delta)<=100;
    var target=valid?Math.min(state.curve.q1,Math.max(state.curve.q0,state.selectedQ+delta)):state.selectedQ;
    var key=M.encodePoints(state.points)+'|'+(state.curve.kind||'spline')+'|'+state.selectedQ+'|'+target+'|'+valid;
    if (!challenge || challenge.key!==key) {
      challenge={key:key,from:state.selectedQ,to:target,checked:false};
      $('prediction-answer').value='';$('prediction-result').hidden=true;$('inspect-prediction').hidden=true;
    }
    var usable=valid && Math.abs(target-state.selectedQ)>1e-10;
    $('prediction-question').textContent=usable ? 'Move along this demand curve from Q = '+M.qty(state.selectedQ)+' to Q = '+M.qty(target)+' units/week. What happens to total revenue?' : 'Enter a nonzero quantity change within the drawn range (−100 to 100). At the right endpoint, try a negative change.';
    $('check-prediction').disabled=!usable;
  }
  function initWorkspace() {
    $('undo').addEventListener('click',function(){if(!undoStack.length)return;redoStack.push(snapshot());restoreSnapshot(undoStack.pop());announce('Curve edit undone. '+describeCurve());});
    $('redo').addEventListener('click',function(){if(!redoStack.length)return;undoStack.push(snapshot());restoreSnapshot(redoStack.pop());announce('Curve edit restored. '+describeCurve());});
    $('graph-layout').addEventListener('change',function(){state.layout=this.value;render();announce(state.layout==='panels'?'Aligned panels shown.':'Original overlay shown.');});
    $('show-area').addEventListener('change',function(){state.showArea=this.checked;render();});
    $('make-editable').addEventListener('click',function(){setPoints(state.points,'Converted the exact reference to an editable spline approximation.');});
    $('select-peak').addEventListener('click',function(){pickQuantity(M.trMax(state.curve).q);});
    $('pin-curve').addEventListener('click',function(){state.reference=state.curve.kind==='constant-revenue'?M.constantRevenueCurve():M.buildCurve(state.points);render();announce('Current curve pinned for comparison.');});
    $('clear-curve').addEventListener('click',function(){state.reference=null;render();announce('Pinned reference cleared.');});
    ['tr','e'].forEach(function(k){$(k+'-graph').addEventListener('click',function(evt){var q=window.ElasticityPanels.quantityAt(this,evt,state.view.qMax);if(q!=null)pickQuantity(q);});});
    $('prediction-step').addEventListener('input',renderPrediction);
    $('check-prediction').addEventListener('click',function(){
      var answer=$('prediction-answer').value, box=$('prediction-result');box.hidden=false;
      if (!answer) {box.textContent='Choose a prediction first.';return;}
      var result=M.revenueChange(state.curve,challenge.from,challenge.to);
      challenge.checked=true;
      box.textContent=(answer===result.direction?'Your prediction matches. ':'Check the two revenues. ')+'TR changes from '+M.money(result.from.tr)+' to '+M.money(result.to.tr)+' per week: '+M.money(result.delta)+'/week. '+(result.direction==='same'?'Revenue is unchanged.':result.direction==='increase'?'Revenue increases.':'Revenue decreases.')+' Starting MR describes a small local change; this comparison uses the full move between the two quantities.';
      $('inspect-prediction').hidden=false;
    });
    $('inspect-prediction').addEventListener('click',function(){if(challenge && challenge.checked)pickQuantity(challenge.to);});
    $('download-csv').addEventListener('click',function(){
      var blob=new Blob([M.valuesCsv(state.curve,state.selectedQ)],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),link=document.createElement('a');
      link.href=url;link.download='elasticity-revenue-values.csv';document.body.appendChild(link);link.click();link.remove();
      window.setTimeout(function(){URL.revokeObjectURL(url);},1000);announce('Values downloaded as CSV.');
    });
    window.addEventListener('resize',function(){render();});
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
    state.points = M.copyPoints(pts || M.getPreset('linear').points);
    state.curve = params && params.get('model') === 'unit' ? M.constantRevenueCurve() : M.buildCurve(state.points);
    state.points = M.copyPoints(state.curve.points);
    var savedQ = params && params.get('q');
    state.selectedQ = savedQ !== null && savedQ !== '' && isFinite(Number(savedQ)) ? Math.max(state.curve.q0,Math.min(state.curve.q1,Number(savedQ))) : state.curve.q0+(state.curve.q1-state.curve.q0)*0.3;
    if (params && params.has('show')) { var shown=params.get('show').split(','); ['e','tr','mr'].forEach(function(k){state.show[k]=shown.indexOf(k)>=0;}); }
    if (params && params.get('layout') === 'overlay') state.layout='overlay';
    if (params && params.get('axis') === 'tr') state.rightAxis='tr';
    state.showTangent=!!(params && params.get('tangent')==='1');
    state.showArea=!(params && params.get('area')==='0');
    $('show-tangent').checked=state.showTangent; $('show-area').checked=state.showArea; $('graph-layout').value=state.layout;

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
    $('sel-q').addEventListener('change', function () { pickQuantity(Number($('sel-q').value)); });
    $('sel-q-num').addEventListener('change', function () {
      var v = Number($('sel-q-num').value);
      if ($('sel-q-num').value === '' || !isFinite(v)) { $('sel-q-num').value = state.selectedQ; return; }
      pickQuantity(v);
    });
    $('show-tangent').addEventListener('change', function () {
      state.showTangent = $('show-tangent').checked;
      render();
      if (state.showTangent) {
        var t = M.tangent(state.curve, state.selectedQ);
        announce(t.degenerate ? 'The tangent calculation is undefined at this zero-price flat endpoint. Choose an interior point.' : 'Tangent shown. Elasticity by segments ' + M.elasticity(t.eSegments) + '; by formula ' + M.elasticity(t.eFormula) + '.');
      } else announce('Tangent hidden.');
    });
    $('apply-preset').addEventListener('click', function () {
      var p = M.getPreset($('preset').value);
      $('points-note').textContent = '';
      setPoints(p.points, p.name + ' preset.', p.kind);
      state.selectedQ = (state.curve.q0+state.curve.q1)/2;
      render();
    });
    $('add-point').addEventListener('click', addPoint);
    $('share-link').addEventListener('click', function (evt) {
      if (evt.ctrlKey || evt.metaKey || evt.shiftKey || evt.altKey) return;
      evt.preventDefault();
      function revealLink() { $('share-fallback').hidden=false; $('share-url').value=shareUrl(); $('share-url').focus(); $('share-url').select(); announce('Select and copy the curve link.'); }
      if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(shareUrl()).then(function(){announce('Curve and view link copied.');},revealLink);
      else revealLink();
    });

    initWorkspace();
    svg.addEventListener('pointerdown', onPointerDown);
    svg.addEventListener('pointermove', onPointerMove);
    svg.addEventListener('pointerup', onPointerUp);
    svg.addEventListener('pointercancel', function (evt) {
      if (!press || press.id !== evt.pointerId) return;
      var before = press.before, wasDragging = drag != null;
      drag = null; press = null; gestureView = null;
      if (wasDragging) restoreSnapshot(before);
      if (state.sketch) { window.cancelAnimationFrame(state.sketch.raf); state.sketch = null; }
      render();
    });
    document.addEventListener('keydown', function (evt) {
      if (evt.key === 'Escape' && state.lineFirst) { state.lineFirst = null; render(); announce('First line point cancelled.'); }
    });
    svg.addEventListener('keydown', onHandleKey);

    buildPointTable();
    setTool('reshape');
    if (params && params.has('pts') && !pts) {
      $('points-note').textContent = 'The curve link contains invalid points. The straight-line preset is shown instead.';
      announce($('points-note').textContent);
    }
  }

  init();
})();
