/* NYCTA 1970 → Web — route map (DEC-036)
   Article = station, series = line, similar series = one bundle of one colour.
     <figure class="map" aria-label="…"><script type="application/json">{ … }</script></figure>
   Data (coordinates are grid points; one grid step = --map-unit strand pitches):
     groups:   { id: { color: "orange" | any CSS colour, name?: "…" } }      similar series; colour tokens:
               yellow orange red magenta green lightblue blue grey black
     articles: { id: { at: [x, y], name?: "line 1\nline 2", href?, side?: "e|w|n|s|ne|nw|se|sw", dx?, dy?, lang? } }
     series:   [ { id, group, name?, href?, path: ["articleId" | [x, y], …] } ]
   A series stops at the articles its path lists (black circle on its strand) and runs on through the bare
   points ([x, y], for bends or for running alongside the other series of its group). An article listed by
   series of two groups is a transfer. Series of one group run side by side, one strand each, in the order
   listed, first strand on the left of the direction the path is written in: write a group's series in the
   same direction and over the same points where they run together. Adding a series to a group re-centres
   the bundle; adding an article is one entry in articles plus its id in the series path.
   Articles are the fixed points: every circle sits on its article's grid point (offset to its own strand), and
   the line is drawn through them. Bends at bare points are concentric arcs (innermost strand --map-radius
   pitches, each further strand one pitch more), made smaller where needed so they never start curving before
   an article; an article on a corner is turned on directly (no arc through the article). For heavy curves,
   put the corner on a bare point between articles. Names clear every strand at their article, including
   similar series passing by. "grid": true draws the grid underneath (for checking alignment). */
(function () {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';
  var TOKENS = ['yellow', 'orange', 'red', 'magenta', 'green', 'lightblue', 'blue', 'grey', 'black'];
  var SIDES = { e: [1, 0], w: [-1, 0], n: [0, -1], s: [0, 1], ne: [1, -1], nw: [-1, -1], se: [1, 1], sw: [-1, 1] };

  function el(name, attrs, parent) {
    var e = document.createElementNS(NS, name);
    for (var k in attrs) if (attrs[k] != null) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function px(host, prop) {
    var probe = document.createElement('div');
    probe.style.cssText = 'position:absolute;visibility:hidden;width:var(' + prop + ')';
    host.appendChild(probe);
    var v = probe.getBoundingClientRect().width;
    host.removeChild(probe);
    return v;
  }
  function num(host, prop, dflt) {
    var v = parseFloat(getComputedStyle(host).getPropertyValue(prop));
    return isFinite(v) ? v : dflt;
  }
  function colour(c) { return TOKENS.indexOf(c) >= 0 ? 'var(--c-' + c + ')' : c; }

  var sub = function (a, b) { return [a[0] - b[0], a[1] - b[1]]; };
  var add = function (a, b) { return [a[0] + b[0], a[1] + b[1]]; };
  var mul = function (a, k) { return [a[0] * k, a[1] * k]; };
  var dot = function (a, b) { return a[0] * b[0] + a[1] * b[1]; };
  var cross = function (a, b) { return a[0] * b[1] - a[1] * b[0]; };
  var len = function (a) { return Math.hypot(a[0], a[1]); };
  var unit = function (a) { var l = len(a); return [a[0] / l, a[1] / l]; };
  var f = function (v) { return Math.round(v * 100) / 100; };

  /* One strand: the centre path shifted by d (positive = right of travel on screen), each bend filleted
     with r = R0[j] − turn·d so every strand of a bundle bends round the same centre. R0[j] = 0 makes the
     bundle turn on the point itself (an article on the corner): that strand's corner is the exact offset point.
     Returns the SVG path and where each path point ended up (on the straight, the corner, or mid-arc). */
  function strand(pts, d, R0) {
    var n = pts.length, u = [], nn = [];
    for (var i = 0; i < n - 1; i++) { u[i] = unit(sub(pts[i + 1], pts[i])); nn[i] = [-u[i][1], u[i][0]]; }
    var q = [];
    for (var j = 0; j < n; j++) {
      if (j === 0) q[j] = add(pts[0], mul(nn[0], d));
      else if (j === n - 1) q[j] = add(pts[j], mul(nn[j - 1], d));
      else {
        var m = add(nn[j - 1], nn[j]);
        q[j] = add(pts[j], mul(m, d / (1 + dot(nn[j - 1], nn[j]))));
      }
    }
    // fillet sizes, clamped so neighbouring arcs never overlap
    var bend = [];
    for (var b = 1; b < n - 1; b++) {
      var c = cross(u[b - 1], u[b]);
      if (Math.abs(c) < 1e-9 && dot(u[b - 1], u[b]) > 0) continue;
      var turn = c > 0 ? 1 : -1;
      var theta = Math.acos(Math.max(-1, Math.min(1, dot(u[b - 1], u[b]))));
      var r = Math.max(0, R0[b] - turn * d);
      if (r < 0.01) continue; // turns on the point
      bend[b] = { turn: turn, tan: Math.tan(theta / 2), r: r, t: r * Math.tan(theta / 2) };
    }
    for (var s = 0; s < n - 1; s++) {
      var L = len(sub(q[s + 1], q[s])), A = bend[s], B = bend[s + 1];
      var need = (A ? A.t : 0) + (B ? B.t : 0);
      if (need > L && need > 0) {
        var k = L / need;
        if (A) { A.t = Math.min(A.t, A.t * k); A.r = A.t / A.tan; }
        if (B) { B.t = Math.min(B.t, B.t * k); B.r = B.t / B.tan; }
      }
    }
    var dstr = 'M' + f(q[0][0]) + ' ' + f(q[0][1]), at = [q[0]];
    for (var v = 1; v < n - 1; v++) {
      var bv = bend[v];
      if (!bv) { at[v] = q[v]; dstr += 'L' + f(q[v][0]) + ' ' + f(q[v][1]); continue; }
      var a = sub(q[v], mul(u[v - 1], bv.t)), e = add(q[v], mul(u[v], bv.t));
      dstr += 'L' + f(a[0]) + ' ' + f(a[1]) + 'A' + f(bv.r) + ' ' + f(bv.r) + ' 0 0 ' + (bv.turn > 0 ? 1 : 0) + ' ' + f(e[0]) + ' ' + f(e[1]);
      var centre = add(a, mul(nn[v - 1], bv.turn * bv.r));
      at[v] = add(centre, mul(unit(sub(q[v], centre)), bv.r));
    }
    dstr += 'L' + f(q[n - 1][0]) + ' ' + f(q[n - 1][1]);
    at[n - 1] = q[n - 1];
    return { d: dstr, at: at };
  }

  function draw(host) {
    var src = host.querySelector('script[type="application/json"]');
    if (!src) return;
    var data = JSON.parse(src.textContent);
    var old = host.querySelector('svg.map__svg');
    if (old) old.remove();

    var P = px(host, '--map-pitch'), gap = px(host, '--map-gap'), stop = px(host, '--map-stop');
    var cap = px(host, '--map-cap'), lgap = px(host, '--map-label-gap');
    var G = (data.unit || num(host, '--map-unit', 2)) * P;
    var R = (data.radius || num(host, '--map-radius', 1)) * P;
    var lh = num(host, '--lh-g1', 0.9545) * px(host, '--map-fs');
    var groups = data.groups || {}, articles = data.articles || {}, series = data.series || [];

    var svg = el('svg', { class: 'map__svg', role: 'group' });
    if (host.getAttribute('aria-label')) svg.setAttribute('aria-label', host.getAttribute('aria-label'));
    var root = el('g', {}, svg);
    var gLines = el('g', { class: 'map__lines' }, root);
    var gLinks = el('g', { class: 'map__transfers' }, root);
    var gStops = el('g', { class: 'map__stops' }, root);
    var gNames = el('g', { class: 'map__names' }, root);

    // group membership → strand offsets
    var members = {};
    series.forEach(function (sr) { (members[sr.group] = members[sr.group] || []).push(sr); });
    var order = Object.keys(groups).concat(Object.keys(members).filter(function (g) { return !(g in groups); }));

    var drawn = []; // { id, group, pts, ids, d, s }
    order.forEach(function (gid) {
      var list = members[gid];
      if (!list) return;
      var nG = list.length, R0 = R + (nG - 1) / 2 * P;
      var col = colour((groups[gid] || {}).color || 'black');
      var gEl = el('g', { class: 'map__group', 'data-group': gid, style: '--line:' + col }, gLines);
      var casings = el('g', { class: 'map__casings' }, gEl);
      var strokes = el('g', { class: 'map__strokes' }, gEl);
      // every article of the group, so all strands of the bundle make the same choice at a corner
      var groupArts = [];
      list.forEach(function (sr) {
        sr.path.forEach(function (p) { if (typeof p === 'string' && articles[p]) groupArts.push([articles[p].at[0] * G, articles[p].at[1] * G]); });
      });
      list.forEach(function (sr, i) {
        var pts = [], ids = [];
        sr.path.forEach(function (p) {
          var xy = typeof p === 'string' ? (articles[p] || {}).at : p;
          if (!xy) throw new Error('map: unknown article ' + p);
          var pt = [xy[0] * G, xy[1] * G];
          if (pts.length && len(sub(pt, pts[pts.length - 1])) < 1e-6) { if (typeof p === 'string') ids[ids.length - 1] = p; return; }
          pts.push(pt); ids.push(typeof p === 'string' ? p : null);
        });
        /* A series that ends at an article runs on past it by half the strand width, so the terminal circle sits
           inside the strand with the same margin at the end as at the sides (DEC-036). */
        var ext = (P - gap) / 2, last = pts.length - 1;
        if (last > 0 && ids[last]) {
          pts.push(add(pts[last], mul(unit(sub(pts[last], pts[last - 1])), ext))); ids.push(null);
        }
        if (last > 0 && ids[0]) {
          pts.unshift(add(pts[0], mul(unit(sub(pts[0], pts[1])), ext))); ids.unshift(null);
        }
        /* Articles are the fixed points (DEC-036): an article on a corner keeps its grid point and the bundle
           turns on it; a bend at a bare point keeps its heavy radius, but is made smaller where it would
           otherwise start curving before an article on either leg, so articles always sit on a straight. */
        var R0s = pts.map(function (pt, j) {
          if (j === 0 || j === pts.length - 1) return R0;
          if (groupArts.some(function (a) { return len(sub(a, pt)) < 0.5; })) return 0;
          var uin = unit(sub(pt, pts[j - 1])), uout = unit(sub(pts[j + 1], pt));
          var theta = Math.acos(Math.max(-1, Math.min(1, dot(uin, uout))));
          if (theta < 1e-6) return R0;
          var room = Infinity;
          [[pts[j - 1], uin, -1], [pts[j + 1], uout, 1]].forEach(function (leg) {
            var Lseg = len(sub(leg[0], pt));
            groupArts.forEach(function (a) {
              var w = sub(a, pt), along = leg[2] * dot(w, leg[1]);
              if (along > 0.5 && along <= Lseg + 0.5 && Math.abs(cross(leg[1], w)) < 0.5) room = Math.min(room, along);
            });
          });
          return Math.min(R0, room / Math.tan(theta / 2));
        });
        var d = (i - (nG - 1) / 2) * P, s = strand(pts, d, R0s);
        el('path', { class: 'map__casing', d: s.d, 'stroke-width': f(P + gap) }, casings);
        var parent = strokes;
        if (sr.href) parent = el('a', { href: sr.href, 'aria-label': sr.name || sr.id }, strokes);
        var path = el('path', { class: 'map__line', d: s.d, 'stroke-width': f(P - gap), 'data-series': sr.id }, parent);
        if (sr.name) el('title', {}, path).textContent = sr.name;
        drawn.push({ id: sr.id, group: gid, pts: pts, ids: ids, d: d, s: s });
      });
    });

    /* Where each strand is at a point: an article the series lists is a stop; any other strand whose path runs
       through the point (a similar series in the same bundle, or a crossing) only has to be cleared by the name. */
    function strandAt(sd, S) {
      for (var k = 0; k < sd.pts.length; k++) if (len(sub(sd.pts[k], S)) < 0.5) return sd.s.at[k];
      for (var j = 0; j < sd.pts.length - 1; j++) {
        var a = sd.pts[j], v = sub(sd.pts[j + 1], a), L = len(v), u = mul(v, 1 / L), w = sub(S, a), t = dot(w, u);
        if (t > 0 && t < L && Math.abs(cross(u, w)) < 0.5) return add(S, mul([-u[1], u[0]], sd.d));
      }
      return null;
    }

    Object.keys(articles).forEach(function (id) {
      var ar = articles[id], S = [ar.at[0] * G, ar.at[1] * G], hits = [];
      drawn.forEach(function (sd) {
        var stopHere = sd.ids.indexOf(id) >= 0;
        var p = stopHere ? sd.s.at[sd.ids.indexOf(id)] : strandAt(sd, S);
        if (p) hits.push({ p: p, stop: stopHere, group: sd.group });
      });
      var stops = hits.filter(function (h) { return h.stop; });
      if (!stops.length) return; // on no series yet
      /* Circles: bundles with the most stops at the article go first; a circle that would sit on (or touch)
         one already placed is left out, so a crossing reads as one cluster (the bigger bundle's). */
      var count = {};
      stops.forEach(function (h) { count[h.group] = (count[h.group] || 0) + 1; });
      var placed = [];
      stops.slice().sort(function (h1, h2) { return count[h2.group] - count[h1.group]; }).forEach(function (h) {
        if (placed.some(function (q) { return len(sub(q.p, h.p)) < stop * 1.25; })) return;
        placed.push(h);
      });
      // an article in series of different groups whose circles stay apart: one bar between the nearest circles
      var byGroup = {};
      placed.forEach(function (h) { (byGroup[h.group] = byGroup[h.group] || []).push(h.p); });
      var gk = Object.keys(byGroup);
      for (var g1 = 1; g1 < gk.length; g1++) {
        var best = null;
        for (var g0 = 0; g0 < g1; g0++) byGroup[gk[g0]].forEach(function (p0) {
          byGroup[gk[g1]].forEach(function (p1) { var dd = len(sub(p1, p0)); if (!best || dd < best.d) best = { d: dd, a: p0, b: p1 }; });
        });
        if (best) el('line', { class: 'map__transfer', x1: f(best.a[0]), y1: f(best.a[1]), x2: f(best.b[0]), y2: f(best.b[1]),
          'stroke-width': f(stop / 3) }, gLinks);
      }
      var label = (ar.name || id).replace(/\n/g, ' ');
      var parent = ar.href ? el('a', { href: ar.href, 'aria-label': label }, gStops) : gStops;
      placed.forEach(function (h) {
        var c = el('circle', { class: 'map__stop', cx: f(h.p[0]), cy: f(h.p[1]), r: f(stop / 2), 'data-article': id }, parent);
        if (!ar.href) el('title', {}, c).textContent = label;
      });

      if (!ar.name) return;
      var side = SIDES[ar.side || 'e'] || SIDES.e;
      // clear every strand at the article (stopping or passing), per axis
      var reach = function (ax, sg) { return hits.reduce(function (m, h) { return Math.max(m, sg * (h.p[ax] - S[ax])); }, 0) + P / 2 + lgap; };
      var A = [S[0] + (side[0] ? side[0] * reach(0, side[0]) : 0), S[1] + (side[1] ? side[1] * reach(1, side[1]) : 0)];
      // beside a bundle the name lines up with its own circles, not the bundle's centre line
      var mean = function (ax) { return placed.reduce(function (m, h) { return m + h.p[ax]; }, 0) / placed.length; };
      if (!side[1]) A[1] = mean(1);
      if (!side[0]) A[0] = mean(0);
      A = add(A, [(ar.dx || 0) * P, (ar.dy || 0) * P]);
      var rows = String(ar.name).split('\n'), k = rows.length, block = cap + (k - 1) * lh, y0;
      if (side[1] === 0) y0 = A[1] - block / 2 + cap;
      else if (side[1] < 0) y0 = A[1] - (k - 1) * lh;
      else y0 = A[1] + cap;
      var anchor = side[0] > 0 ? 'start' : side[0] < 0 ? 'end' : 'middle';
      var tParent = ar.href ? el('a', { href: ar.href, tabindex: '-1', 'aria-hidden': 'true' }, gNames) : gNames;
      var t = el('text', { class: 'map__name', x: f(A[0]), y: f(y0), 'text-anchor': anchor }, tParent);
      if (ar.lang) t.setAttribute('lang', ar.lang);
      rows.forEach(function (row, r) {
        var ts = el('tspan', { x: f(A[0]), y: f(y0 + r * lh) }, t);
        ts.textContent = row;
      });
    });

    host.insertBefore(svg, host.firstChild);
    // first-letter side bearing (DEC-025 / DEC-033) for flush-left names
    gNames.querySelectorAll('text[text-anchor="start"] tspan').forEach(function (ts) {
      var pull = parseFloat(getComputedStyle(ts).getPropertyValue('--lsb-pull')) || 0;
      ts.setAttribute('x', f(parseFloat(ts.getAttribute('x')) - pull * px(host, '--map-fs')));
    });
    var bb = root.getBBox(), pad = gap;
    if (data.grid) {
      var gGrid = el('g', { class: 'map__grid' });
      root.insertBefore(gGrid, root.firstChild);
      for (var gx = Math.ceil(bb.x / G) * G; gx <= bb.x + bb.width; gx += G) el('line', { x1: f(gx), y1: f(bb.y), x2: f(gx), y2: f(bb.y + bb.height) }, gGrid);
      for (var gy = Math.ceil(bb.y / G) * G; gy <= bb.y + bb.height; gy += G) el('line', { x1: f(bb.x), y1: f(gy), x2: f(bb.x + bb.width), y2: f(gy) }, gGrid);
    }
    var x = bb.x - pad, y = bb.y - pad, w = bb.width + 2 * pad, h = bb.height + 2 * pad;
    svg.setAttribute('viewBox', [f(x), f(y), f(w), f(h)].join(' '));
    svg.setAttribute('width', f(w));
    svg.setAttribute('height', f(h));
  }

  function run() {
    var maps = document.querySelectorAll('.map');
    for (var i = 0; i < maps.length; i++) {
      try { draw(maps[i]); } catch (e) { console.error(e); }
    }
  }
  window.NYCTAMap = { draw: draw, redraw: run };
  function start() { (document.fonts ? document.fonts.ready : Promise.resolve()).then(run); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
  if (document.fonts) document.fonts.addEventListener('loadingdone', run);
})();
