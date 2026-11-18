/* NYCTA 1970 → Web — route map (DEC-036)
   A map is drawn from JSON inside the element:
     <figure class="map" aria-label="…"><script type="application/json">{ … }</script></figure>
   Data (coordinates are grid points; one grid step = --map-unit strand pitches):
     groups:   { id: { color: "orange" | any CSS colour, name?: "…" } }      colour tokens: yellow orange red
               magenta green lightblue blue grey black
     stations: { id: { at: [x, y], name?: "line 1\nline 2", side?: "e|w|n|s|ne|nw|se|sw", dx?, dy? } }
     lines:    [ { id, group, path: ["stationId" | [x, y], …], title?, href?, skip?: ["stationId", …] } ]
   Lines of one group run side by side (one strand each), in the order they are listed, first strand on the
   left of the direction the path is written in. Write every line of a group in the same direction.
   Adding a line to a group re-centres the bundle on the path, so "attaching" an article is one more entry.
   Bends are concentric arcs: the innermost strand turns on --map-radius pitches, each further strand
   one pitch more. Path points that do not bend (stations on a straight run) are just stops. */
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
     with r = R0 − turn·d so every strand of a bundle bends round the same centre. Returns the SVG path and
     where each path point ended up (on the straight, or the middle of its arc). */
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
      var r = Math.max(0, R0 - turn * d);
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
      if (!bv) { at[v] = q[v]; continue; }
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
    var groups = data.groups || {}, stations = data.stations || {}, lines = data.lines || [];

    var svg = el('svg', { class: 'map__svg', role: 'group' });
    if (host.getAttribute('aria-label')) svg.setAttribute('aria-label', host.getAttribute('aria-label'));
    var root = el('g', {}, svg);
    var gLines = el('g', { class: 'map__lines' }, root);
    var gLinks = el('g', { class: 'map__transfers' }, root);
    var gStops = el('g', { class: 'map__stops' }, root);
    var gNames = el('g', { class: 'map__names' }, root);

    // group membership → strand offsets
    var members = {};
    lines.forEach(function (ln) { (members[ln.group] = members[ln.group] || []).push(ln); });
    var order = Object.keys(groups).concat(Object.keys(members).filter(function (g) { return !(g in groups); }));

    var at = {}; // station id → [{ p, stop, group }]
    order.forEach(function (gid) {
      var list = members[gid];
      if (!list) return;
      var nG = list.length, R0 = R + (nG - 1) / 2 * P;
      var col = colour((groups[gid] || {}).color || 'black');
      var gEl = el('g', { class: 'map__group', 'data-group': gid, style: '--line:' + col }, gLines);
      var casings = el('g', { class: 'map__casings' }, gEl);
      var strokes = el('g', { class: 'map__strokes' }, gEl);
      list.forEach(function (ln, i) {
        var pts = [], ids = [];
        ln.path.forEach(function (p) {
          var xy = typeof p === 'string' ? (stations[p] || {}).at : p;
          if (!xy) throw new Error('map: unknown station ' + p);
          var pt = [xy[0] * G, xy[1] * G];
          if (pts.length && len(sub(pt, pts[pts.length - 1])) < 1e-6) { if (typeof p === 'string') ids[ids.length - 1] = p; return; }
          pts.push(pt); ids.push(typeof p === 'string' ? p : null);
        });
        /* A line that ends at a station runs on past it by half the strand width, so the terminal circle sits
           inside the strand with the same margin at the end as at the sides (DEC-036). */
        var ext = (P - gap) / 2, last = pts.length - 1;
        if (last > 0 && ids[last]) {
          pts.push(add(pts[last], mul(unit(sub(pts[last], pts[last - 1])), ext))); ids.push(null);
        }
        if (last > 0 && ids[0]) {
          pts.unshift(add(pts[0], mul(unit(sub(pts[0], pts[1])), ext))); ids.unshift(null);
        }
        var s = strand(pts, (i - (nG - 1) / 2) * P, R0);
        el('path', { class: 'map__casing', d: s.d, 'stroke-width': f(P + gap) }, casings);
        var parent = strokes;
        if (ln.href) parent = el('a', { href: ln.href, 'aria-label': ln.title || ln.id }, strokes);
        var path = el('path', { class: 'map__line', d: s.d, 'stroke-width': f(P - gap), 'data-line': ln.id }, parent);
        if (ln.title) el('title', {}, path).textContent = ln.title;
        var skip = ln.skip || [];
        ids.forEach(function (id, k) {
          if (!id) return;
          (at[id] = at[id] || []).push({ p: s.at[k], stop: skip.indexOf(id) < 0, group: gid });
        });
      });
    });

    Object.keys(at).forEach(function (id) {
      var st = stations[id], hits = at[id], stops = hits.filter(function (h) { return h.stop; });
      /* Circles: bundles with the most stops at the station go first; a circle that would sit on (or touch)
         one already placed is left out, so a crossing reads as one cluster (the bigger bundle's). */
      var count = {};
      stops.forEach(function (h) { count[h.group] = (count[h.group] || 0) + 1; });
      var placed = [];
      stops.slice().sort(function (h1, h2) { return count[h2.group] - count[h1.group]; }).forEach(function (h) {
        if (placed.some(function (q) { return len(sub(q.p, h.p)) < stop * 1.25; })) return;
        placed.push(h);
      });
      // groups whose circles stay apart are joined by one bar between their nearest circles (transfer)
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
      var parent = st.href ? el('a', { href: st.href, 'aria-label': (st.name || id).replace(/\n/g, ' ') }, gStops) : gStops;
      placed.forEach(function (h) { el('circle', { class: 'map__stop', cx: f(h.p[0]), cy: f(h.p[1]), r: f(stop / 2) }, parent); });

      if (!st.name) return;
      var side = SIDES[st.side || 'e'] || SIDES.e;
      var S = [st.at[0] * G, st.at[1] * G];
      // clear every strand through the station (stopping or not), per axis
      var reach = function (ax, sg) { return hits.reduce(function (m, h) { return Math.max(m, sg * (h.p[ax] - S[ax])); }, 0) + P / 2 + lgap; };
      var A = [S[0] + (side[0] ? side[0] * reach(0, side[0]) : 0), S[1] + (side[1] ? side[1] * reach(1, side[1]) : 0)];
      A = add(A, [(st.dx || 0) * P, (st.dy || 0) * P]);
      var rows = String(st.name).split('\n'), k = rows.length, block = cap + (k - 1) * lh, y0;
      if (side[1] === 0) y0 = A[1] - block / 2 + cap;
      else if (side[1] < 0) y0 = A[1] - (k - 1) * lh;
      else y0 = A[1] + cap;
      var anchor = side[0] > 0 ? 'start' : side[0] < 0 ? 'end' : 'middle';
      var t = el('text', { class: 'map__name', x: f(A[0]), y: f(y0), 'text-anchor': anchor }, gNames);
      if (st.lang) t.setAttribute('lang', st.lang);
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
