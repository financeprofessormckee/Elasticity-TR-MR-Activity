/* Aligned, independently labelled revenue and elasticity panels. No activity state. */
(function(root) {
  'use strict';
  var M = root.ElasticityModel, NS = 'http://www.w3.org/2000/svg';
  var L = 58, W = 300, T = 14, H = 108;
  function el(tag, attrs, text) {
    var n = document.createElementNS(NS, tag);
    Object.keys(attrs || {}).forEach(function(k){ n.setAttribute(k,attrs[k]); });
    if (text != null) n.textContent = text;
    return n;
  }
  function render(svg, options) {
    var scale=Math.max(1,416/(svg.getBoundingClientRect().width||416));
    svg.style.setProperty('--tick-size',(11*scale)+'px');
    svg.style.setProperty('--axis-size',(11.5*scale)+'px');
    var kind=options.kind, top=kind==='e'?M.CONFIG.eCap:options.trTop, qMax=options.qMax;
    function x(q){return L+q/qMax*W;}
    function y(v){return T+H-v/top*H;}
    while(svg.firstChild) svg.removeChild(svg.firstChild);
    var marks=el('g',{'aria-hidden':'true'}), clipId=svg.id+'-clip';svg.appendChild(marks);
    var defs=el('defs'),clip=el('clipPath',{id:clipId});clip.appendChild(el('rect',{x:L,y:T,width:W,height:H}));defs.appendChild(clip);marks.appendChild(defs);
    marks.appendChild(el('rect',{x:L,y:T,width:W,height:H,fill:'#fff'}));
    if(kind==='e') marks.appendChild(el('rect',{x:L,y:y(1),width:W,height:y(0)-y(1),fill:'#f5e9ee'}));
    for(var i=0;i<=4;i++) {
      var value=top*i/4;
      marks.appendChild(el('line',{x1:L,y1:y(value),x2:L+W,y2:y(value),class:i?'gridline':'axis'}));
      marks.appendChild(el('text',{x:L-7,y:y(value)+4,'text-anchor':'end',class:'tick'},kind==='tr'?M.money(value,0):M.round(value,2)));
    }
    var step=M.niceCeil(qMax/5);
    for(var q=0;q<=qMax;q+=step) {
      marks.appendChild(el('line',{x1:x(q),y1:T,x2:x(q),y2:T+H,class:'gridline'}));
      marks.appendChild(el('text',{x:x(q),y:T+H+18,'text-anchor':'middle',class:'tick'},M.qty(q)));
    }
    marks.appendChild(el('line',{x1:L,y1:T,x2:L,y2:T+H,class:'axis'}));
    marks.appendChild(el('text',{x:L+W/2,y:160,'text-anchor':'middle',class:'axis-title'},'Quantity (units per week)'));
    var plot=el('g',{'clip-path':'url(#'+clipId+')'});marks.appendChild(plot);
    if(kind==='e') {
      plot.appendChild(el('line',{x1:L,y1:y(1),x2:L+W,y2:y(1),class:'unit-guide'}));
      marks.appendChild(el('text',{x:L+W+5,y:y(1)+4,class:'tick'},'e = 1'));
    }
    function series(curve,isReference) {
      var qs=M.sample(curve,241).map(function(m){return m.q;}).concat(curve.points.map(function(p){return p.q;}), M.stationaryQuantities(curve));
      // Every spline segment gets samples, even when it is narrower than the global grid.
      for(var k=1;k<curve.points.length;k++) for(var n=1;n<20;n++) qs.push(curve.points[k-1].q+(curve.points[k].q-curve.points[k-1].q)*n/20);
      qs.sort(function(a,b){return a-b;});
      var d='',pen=false;
      qs.forEach(function(q){
        var value=M.measures(curve,q)[kind];
        if(!isFinite(value)){pen=false;return;}
        var py=y(Math.max(-top,Math.min(top*1.1,value)));
        d+=(pen?'L':'M')+x(q).toFixed(3)+' '+py.toFixed(3);pen=true;
      });
      plot.appendChild(el('path',{d:d,class:isReference?'reference-series':'series series--'+kind}));
    }
    if(options.reference) series(options.reference,true);
    series(options.curve,false);
    var pk=options.peak;
    if(pk.interior && !pk.flat) {
      plot.appendChild(el('line',{x1:x(pk.q),y1:T,x2:x(pk.q),y2:T+H,class:'peak-guide'}));
      plot.appendChild(el('circle',{cx:x(pk.q),cy:y(kind==='e'?pk.e:pk.tr),r:4,class:'peak-mark'}));
    }
    var m=M.measures(options.curve,options.selectedQ);
    plot.appendChild(el('line',{x1:x(m.q),y1:T,x2:x(m.q),y2:T+H,class:'sel-guide'}));
    if(isFinite(m[kind]) && m[kind]<=top) plot.appendChild(el('circle',{cx:x(m.q),cy:y(m[kind]),r:4.5,class:'sel-mark'}));
  }
  function quantityAt(svg, evt, qMax) {
    var pt=svg.createSVGPoint(),ctm=svg.getScreenCTM();if(!ctm)return null;
    pt.x=evt.clientX;pt.y=evt.clientY;var p=pt.matrixTransform(ctm.inverse());
    return p.x>=L&&p.x<=L+W&&p.y>=T&&p.y<=T+H?(p.x-L)/W*qMax:null;
  }
  root.ElasticityPanels={render:render,quantityAt:quantityAt};
})(this);
