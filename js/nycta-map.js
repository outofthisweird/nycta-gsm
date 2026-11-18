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
   the line is drawn through them. Bends belong on bare points between articles, never on an article. A bend is
   a set of concentric arcs at full radius (innermost strand --map-radius pitches, each further strand one pitch
   more), so the inside of a bend is always round; arcs are shortened only where two bends are too close for
   both. An article on a corner, or so close to a bend that the curve reaches it, is a data error: the console
   warns and the circle moves onto the curve. Names clear every strand at their article (similar series passing
   by included); a name that would touch another stretch of line or another name moves to the nearest free side.
   At a transfer where one group's circle is left out (it would touch the other group's), that group's line is
   drawn over the other bundle up to the circle, so the station reads as shared. "grid": true draws the grid
   underneath (for checking alignment).
   Other renderers (eee-map's interactive map) use the same geometry instead of copying the rules:
     NYCTAMap.geometry = { version, SIDES, offset(i, n, pitch), bundleRadius(radius, pitch, n),
       runOn(pts, ext, atStart, atEnd), strand(pts, d, R0) → path model { segs, total, d, at, len, curved },
       pointAt(model, s) → [x, y, angle], subPath(model, from, to, back), samples(model, hw, step),
       blocked(box, samples, nameBoxes, gap), sidesFrom(side) }
   Bump geometry.version when a function's inputs or outputs change. */
(function () {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';
  var TOKENS = ['yellow', 'orange', 'red', 'magenta', 'green', 'lightblue', 'blue', 'grey', 'black'];
  var SIDES = { e: [1, 0], w: [-1, 0], n: [0, -1], s: [0, 1], ne: [1, -1], nw: [-1, -1], se: [1, 1], sw: [-1, 1] };
  var uid = 0;

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
  var pt = function (p) { return f(p[0]) + ' ' + f(p[1]); };

  /* ---------------------------------------------------------------------------------------------------------
     Geometry core, shared with other renderers through NYCTAMap.geometry (eee-map draws its own interactive
     map with it). Pure functions on plain [x, y] points in px, y down; no DOM. Change the rules here once.
     --------------------------------------------------------------------------------------------------------- */

  /* Strand offset of series i of n in a bundle (positive = right of travel), and the bundle's centre-line bend
     radius: innermost strand `radius`, one pitch more per strand outward (DEC-036). */
  function offset(i, n, pitch) { return (i - (n - 1) / 2) * pitch; }
  function bundleRadius(radius, pitch, n) { return radius + (n - 1) / 2 * pitch; }

  /* A series that ends at an article runs on past it by `ext` (half the strand width), so the end circle keeps
     the same margin at the end as at the sides. Returns new points; shift = 1 when one was added in front. */
  function runOn(pts, ext, atStart, atEnd) {
    var out = pts.slice(), n = pts.length;
    if (n > 1 && atEnd) out.push(add(pts[n - 1], mul(unit(sub(pts[n - 1], pts[n - 2])), ext)));
    if (n > 1 && atStart) out.unshift(add(pts[0], mul(unit(sub(pts[0], pts[1])), ext)));
    return { pts: out, shift: n > 1 && atStart ? 1 : 0 };
  }

  /* One strand: the centre path shifted by d, each turn filleted with r = R0 − turn·d so every strand of a bundle
     bends round the same centre. Turns keep the full radius (the inside of a bend is never square); arcs are
     shortened only where two neighbouring turns (or a turn and a path end) leave too little room.
     Returns a path model:
       segs   [{t:'L', a, b, len, s0} | {t:'A', a, b, c, r, a0, sg, len, s0}]   (s0 = length along the path)
       total  path length;  d  SVG path
       at[j]  where point j is drawn;  len[j]  how far along the path it is
       curved[j]  true when point j is a corner or lies where an arc has replaced the straight: an article there
                  is a data error (DEC-036), its circle is drawn on the curve */
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
    var turns = [0], bend = [];
    for (var b = 1; b < n - 1; b++) {
      var c = cross(u[b - 1], u[b]);
      if (Math.abs(c) < 1e-9 && dot(u[b - 1], u[b]) > 0) continue;
      turns.push(b);
      var theta = Math.acos(Math.max(-1, Math.min(1, dot(u[b - 1], u[b]))));
      var turn = c > 0 ? 1 : -1, r = Math.max(0, R0 - turn * d);
      if (r < 0.01 || theta > Math.PI - 1e-3) continue; // radius 0 (or a U-turn): turns on the point
      bend[b] = { turn: turn, theta: theta, tan: Math.tan(theta / 2), r: r, t: r * Math.tan(theta / 2) };
    }
    turns.push(n - 1);
    for (var k = 0; k < turns.length - 1; k++) {
      var A = bend[turns[k]], B = bend[turns[k + 1]], L = len(sub(q[turns[k + 1]], q[turns[k]]));
      var need = (A ? A.t : 0) + (B ? B.t : 0);
      if (need > L && need > 0) {
        var s = L / need;
        if (A) { A.t *= s; A.r = A.t / A.tan; }
        if (B) { B.t *= s; B.r = B.t / B.tan; }
      }
    }
    turns.forEach(function (v) {
      var bv = bend[v];
      if (!bv) return;
      bv.a = sub(q[v], mul(u[v - 1], bv.t));
      bv.e = add(q[v], mul(u[v], bv.t));
      bv.c = add(bv.a, mul(nn[v - 1], bv.turn * bv.r));
      bv.a0 = Math.atan2(bv.a[1] - bv.c[1], bv.a[0] - bv.c[0]);
      bv.sg = bv.turn > 0 ? 1 : -1;                  // screen angles grow clockwise (y down) = SVG sweep 1
    });

    var segs = [], total = 0, cur = q[0], at = [q[0]], lens = [0], curved = [], seg = 0;
    var line = function (p) { var l = len(sub(p, cur)); if (l > 1e-6) { segs.push({ t: 'L', a: cur, b: p, len: l, s0: total }); total += l; } cur = p; };
    var onArc = function (bv, p) {                     // nearest point of the arc, and its length along the path
      var ang = Math.atan2(p[1] - bv.c[1], p[0] - bv.c[0]), da = Math.atan2(Math.sin(ang - bv.a0), Math.cos(ang - bv.a0)) * bv.sg;
      da = Math.max(0, Math.min(bv.theta, da));
      var m = bv.a0 + bv.sg * da;
      return { p: [bv.c[0] + bv.r * Math.cos(m), bv.c[1] + bv.r * Math.sin(m)], s: bv.s0 + bv.r * da };
    };
    for (var v = 1; v < n; v++) {
      while (turns[seg + 1] < v) seg++;              // turns[seg] < v <= turns[seg + 1]
      var bv = bend[v];
      if (bv) {
        line(bv.a);
        bv.s0 = total;
        segs.push({ t: 'A', a: bv.a, b: bv.e, c: bv.c, r: bv.r, a0: bv.a0, sg: bv.sg, len: bv.r * bv.theta, s0: total });
        total += bv.r * bv.theta; cur = bv.e;
        var mid = onArc(bv, add(bv.c, mul(unit(sub(q[v], bv.c)), bv.r)));
        at[v] = mid.p; lens[v] = mid.s; curved[v] = true;
        continue;
      }
      if (turns[seg + 1] !== v) {                   // on a straight: a neighbouring arc may already cover it
        var prev = bend[turns[seg]], next = bend[turns[seg + 1]], cov = null;
        if (prev && len(sub(q[v], q[turns[seg]])) < prev.t - 1e-6) cov = prev;
        if (next && len(sub(q[v], q[turns[seg + 1]])) < next.t - 1e-6) cov = next;
        if (cov) { at[v] = q[v]; curved[v] = cov; continue; }   // placed on the arc once its length is known
      }
      line(q[v]); at[v] = q[v]; lens[v] = total;
    }
    for (var w = 1; w < n; w++) if (curved[w] && curved[w] !== true) {
      var o = onArc(curved[w], q[w]); at[w] = o.p; lens[w] = o.s; curved[w] = true;
    }
    var model = { segs: segs, total: total, at: at, len: lens, curved: curved };
    model.d = subPath(model, 0, total);
    return model;
  }

  /* Point at length s along a path model: [x, y, direction in radians]. */
  function pointAt(model, s) {
    var segs = model.segs;
    if (!segs.length) return [model.at[0][0], model.at[0][1], 0];
    s = Math.max(0, Math.min(model.total, s));
    for (var i = 0; i < segs.length; i++) {
      var g = segs[i];
      if (s <= g.s0 + g.len + 1e-9 || i === segs.length - 1) {
        var t = Math.max(0, Math.min(g.len, s - g.s0));
        if (g.t === 'L') {
          var k = g.len ? t / g.len : 0;
          return [g.a[0] + (g.b[0] - g.a[0]) * k, g.a[1] + (g.b[1] - g.a[1]) * k, Math.atan2(g.b[1] - g.a[1], g.b[0] - g.a[0])];
        }
        var m = g.a0 + g.sg * t / g.r;
        return [g.c[0] + g.r * Math.cos(m), g.c[1] + g.r * Math.sin(m), m + g.sg * Math.PI / 2];
      }
    }
  }

  /* SVG path of the stretch [from, to] of a path model (drawn to → from when back): for growth animations. */
  function subPath(model, from, to, back) {
    var parts = [];
    model.segs.forEach(function (g) {
      var a = Math.max(from, g.s0), b = Math.min(to, g.s0 + g.len);
      if (b - a > 1e-6) parts.push({ g: g, p: pointAt(model, a), q: pointAt(model, b) });
    });
    if (!parts.length) { var z = pointAt(model, from); return 'M' + pt(z); }
    if (back) parts.reverse();
    var dstr = 'M' + pt(back ? parts[0].q : parts[0].p);
    parts.forEach(function (x) {
      var e = back ? x.p : x.q;
      dstr += x.g.t === 'L' ? 'L' + pt(e) : 'A' + f(x.g.r) + ' ' + f(x.g.r) + ' 0 0 ' + ((x.g.sg > 0) !== !!back ? 1 : 0) + ' ' + pt(e);
    });
    return dstr;
  }

  /* Points every `step` px along a path model, each standing for a disc of half width hw. The ends are butt-cut,
     so sampling stops one half width short of them. For checking names against the lines. */
  function samples(model, hw, step) {
    var out = [], e = Math.min(hw, model.total / 2);
    for (var s = e; s <= model.total - e + 1e-6; s += step || 2) { var p = pointAt(model, s); out.push([p[0], p[1], hw]); }
    return out;
  }

  /* Is a name box [x0, y0, x1, y1] closer than `gap` to any line sample or other name box? Name boxes are cap
     boxes (cap line to last baseline; descenders ignored, as the ½in clearance is measured on caps). */
  function blocked(box, lineSamples, nameBoxes, gap) {
    for (var i = 0; i < lineSamples.length; i++) {
      var s = lineSamples[i], dx = Math.max(box[0] - s[0], 0, s[0] - box[2]), dy = Math.max(box[1] - s[1], 0, s[1] - box[3]);
      if (Math.hypot(dx, dy) < s[2] + gap - 1.5) return true;
    }
    return (nameBoxes || []).some(function (o) { var e = gap / 2; return box[0] < o[2] + e && box[2] > o[0] - e && box[1] < o[3] + e && box[3] > o[1] - e; });
  }

  /* The eight sides, the asked one first, then by angle from it: the order to try when a name is blocked. */
  function sidesFrom(want) {
    var ang = function (k) { return Math.atan2(SIDES[k][1], SIDES[k][0]); }, w = SIDES[want] ? want : 'e';
    var dif = function (k) { return Math.abs(Math.atan2(Math.sin(ang(k) - ang(w)), Math.cos(ang(k) - ang(w)))); };
    return Object.keys(SIDES).sort(function (k1, k2) { return dif(k1) - dif(k2); });
  }

  function draw(host) {
    var src = host.querySelector('script[type="application/json"]');
    if (!src) return;
    var data = JSON.parse(src.textContent);
    var old = host.querySelector('svg.map__svg');
    if (old) old.remove();

    var P = px(host, '--map-pitch'), gap = px(host, '--map-gap'), stop = px(host, '--map-stop');
    var cap = px(host, '--map-cap'), lgap = px(host, '--map-label-gap'), fs = px(host, '--map-fs');
    var G = (data.unit || num(host, '--map-unit', 2)) * P;
    var R = (data.radius != null ? data.radius : num(host, '--map-radius', 1)) * P;
    var lh = num(host, '--lh-g1', 0.9545) * fs;
    var groups = data.groups || {}, articles = data.articles || {}, series = data.series || [];
    var warned = host.__nyctaMapWarned = host.__nyctaMapWarned || {}; // once per map, not on every redraw
    var warn = function (key, msg) { if (!warned[key]) { warned[key] = 1; console.warn('map: ' + msg + ' (DEC-036)'); } };

    var svg = el('svg', { class: 'map__svg', role: 'group' });
    if (host.getAttribute('aria-label')) svg.setAttribute('aria-label', host.getAttribute('aria-label'));
    host.insertBefore(svg, host.firstChild); // in the document from the start: names are measured as they are placed
    var defs = el('defs', {}, svg);
    var root = el('g', {}, svg);
    var gLines = el('g', { class: 'map__lines' }, root);
    var gOver = el('g', { class: 'map__over' }, root);
    var gLinks = el('g', { class: 'map__transfers' }, root);
    var gStops = el('g', { class: 'map__stops' }, root);
    var gNames = el('g', { class: 'map__names' }, root);

    // group membership → strand offsets
    var members = {};
    series.forEach(function (sr) { (members[sr.group] = members[sr.group] || []).push(sr); });
    var order = Object.keys(groups).concat(Object.keys(members).filter(function (g) { return !(g in groups); }));

    var drawn = []; // { id, group, col, pts, ids, d, s }
    order.forEach(function (gid) {
      var list = members[gid];
      if (!list) return;
      var nG = list.length, R0 = bundleRadius(R, P, nG);
      var col = colour((groups[gid] || {}).color || 'black');
      var gEl = el('g', { class: 'map__group', 'data-group': gid, style: '--line:' + col }, gLines);
      var casings = el('g', { class: 'map__casings' }, gEl);
      var strokes = el('g', { class: 'map__strokes' }, gEl);
      list.forEach(function (sr, i) {
        var pts = [], ids = [];
        sr.path.forEach(function (p) {
          var xy = typeof p === 'string' ? (articles[p] || {}).at : p;
          if (!xy) throw new Error('map: unknown article ' + p);
          var q = [xy[0] * G, xy[1] * G];
          if (pts.length && len(sub(q, pts[pts.length - 1])) < 1e-6) { if (typeof p === 'string') ids[ids.length - 1] = p; return; }
          pts.push(q); ids.push(typeof p === 'string' ? p : null);
        });
        var ro = runOn(pts, (P - gap) / 2, !!ids[0], !!ids[ids.length - 1]);
        if (ro.pts.length > pts.length) { if (ro.shift) ids.unshift(null); if (ro.pts.length - ro.shift > pts.length) ids.push(null); }
        pts = ro.pts;
        var d = offset(i, nG, P), s = strand(pts, d, R0);
        ids.forEach(function (aid, j) {
          if (aid && s.curved[j]) warn(sr.id + ' ' + aid, 'article "' + aid + '" sits on a bend of series "' + sr.id +
            '"; put the bend on a bare point [x, y] between articles, at least one bend length away');
        });
        el('path', { class: 'map__casing', d: s.d, 'stroke-width': f(P + gap) }, casings);
        var parent = strokes;
        if (sr.href) parent = el('a', { href: sr.href, 'aria-label': sr.name || sr.id }, strokes);
        var path = el('path', { class: 'map__line', d: s.d, 'stroke-width': f(P - gap), 'data-series': sr.id }, parent);
        if (sr.name) el('title', {}, path).textContent = sr.name;
        drawn.push({ id: sr.id, group: gid, col: col, pts: pts, ids: ids, d: d, s: s });
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

    var names = [];
    Object.keys(articles).forEach(function (id) {
      var ar = articles[id], S = [ar.at[0] * G, ar.at[1] * G], hits = [];
      drawn.forEach(function (sd) {
        var k = sd.ids.indexOf(id), stopHere = k >= 0;
        var p = stopHere ? sd.s.at[k] : strandAt(sd, S);
        if (p) hits.push({ p: p, stop: stopHere, group: sd.group, sd: sd, k: k });
      });
      var stops = hits.filter(function (h) { return h.stop; });
      if (!stops.length) return; // on no series yet
      /* Circles: bundles with the most stops at the article go first; a circle that would sit on (or touch)
         one already placed is left out, so a crossing reads as one cluster (the bigger bundle's). */
      var count = {};
      stops.forEach(function (h) { count[h.group] = (count[h.group] || 0) + 1; });
      var rank = function (h) { return [count[h.group], members[h.group].length, order.indexOf(h.group)]; };
      var placed = [];
      stops.slice().sort(function (h1, h2) {          // most stops here, then the bigger bundle, then the one drawn on top
        var a = rank(h1), b = rank(h2);
        return b[0] - a[0] || b[1] - a[1] || b[2] - a[2];
      }).forEach(function (h) {
        if (placed.some(function (q) { return len(sub(q.p, h.p)) < stop * 1.25; })) return;
        placed.push(h);
      });
      var shown = {};
      placed.forEach(function (h) { shown[h.group] = 1; });
      /* Circles of two groups merged into one: every stopping group's line but the top-drawn one crosses over
         the other bundles up to the shared circle (casing included), instead of being cut by their casing,
         so the station reads as shared. */
      var stopGroups = Object.keys(count);
      var merged = stopGroups.some(function (g) { return !shown[g]; });
      var top = stopGroups.reduce(function (m, g) { return order.indexOf(g) > order.indexOf(m) ? g : m; }, stopGroups[0]);
      stops.forEach(function (h) {
        if (!merged || h.group === top) return;
        var others = hits.filter(function (o) { return o.group !== h.group; });
        if (!others.length) return;
        var sd = h.sd, a = sd.pts[Math.max(0, h.k - 1)], b = sd.pts[Math.min(sd.pts.length - 1, h.k + 1)];
        var dir = unit(sub(b, a)), nrm = [-dir[1], dir[0]], C = h.p;
        var Lh = others.reduce(function (m, o) { return Math.max(m, Math.abs(dot(sub(o.p, C), dir))); }, 0) + P + gap;
        var W = (P + gap) / 2 + 0.5;
        // the line copy reaches a little past its casing copy, so the two never share an anti-aliased clip edge
        var clip = function (L) {
          var cid = 'map-clip-' + (++uid), cp = el('clipPath', { id: cid }, defs);
          el('polygon', { points: [add(add(C, mul(dir, -L)), mul(nrm, -W)), add(add(C, mul(dir, L)), mul(nrm, -W)),
            add(add(C, mul(dir, L)), mul(nrm, W)), add(add(C, mul(dir, -L)), mul(nrm, W))].map(pt).join(' ') }, cp);
          return 'url(#' + cid + ')';
        };
        var g = el('g', { class: 'map__group', 'data-group': h.group, style: '--line:' + sd.col }, gOver);
        el('path', { class: 'map__casing', d: sd.s.d, 'stroke-width': f(P + gap), 'clip-path': clip(Lh) }, g);
        el('path', { class: 'map__line', d: sd.s.d, 'stroke-width': f(P - gap), 'clip-path': clip(Lh + P / 2) }, g);
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
      if (ar.name) names.push({ id: id, ar: ar, S: S, hits: hits, placed: placed });
    });

    /* Names. Every stretch of line is sampled (arcs included) so a name can be checked against all of it,
       not only against the strands at its own article. */
    var lineSamples = [];
    drawn.forEach(function (sd) { lineSamples = lineSamples.concat(samples(sd.s, (P - gap) / 2, 2)); });
    var boxes = [];
    function place(nm, key) {
      var ar = nm.ar, S = nm.S, side = SIDES[key];
      // clear every strand at the article (stopping or passing), per axis
      var reach = function (ax, sg) { return nm.hits.reduce(function (m, h) { return Math.max(m, sg * (h.p[ax] - S[ax])); }, 0) + P / 2 + lgap; };
      var A = [S[0] + (side[0] ? side[0] * reach(0, side[0]) : 0), S[1] + (side[1] ? side[1] * reach(1, side[1]) : 0)];
      // beside a bundle the name lines up with its own circles, not the bundle's centre line
      var mean = function (ax) { return nm.placed.reduce(function (m, h) { return m + h.p[ax]; }, 0) / nm.placed.length; };
      if (!side[1]) A[1] = mean(1);
      if (!side[0]) A[0] = mean(0);
      A = add(A, [(ar.dx || 0) * P, (ar.dy || 0) * P]);
      var rows = String(ar.name).split('\n'), k = rows.length, block = cap + (k - 1) * lh, y0;
      if (side[1] === 0) y0 = A[1] - block / 2 + cap;
      else if (side[1] < 0) y0 = A[1] - (k - 1) * lh;
      else y0 = A[1] + cap;
      var anchor = side[0] > 0 ? 'start' : side[0] < 0 ? 'end' : 'middle';
      var node = ar.href ? el('a', { href: ar.href, tabindex: '-1', 'aria-hidden': 'true' }, gNames) : gNames;
      var t = el('text', { class: 'map__name', x: f(A[0]), y: f(y0), 'text-anchor': anchor }, node);
      if (ar.lang) t.setAttribute('lang', ar.lang);
      rows.forEach(function (row, r) {
        var ts = el('tspan', { x: f(A[0]), y: f(y0 + r * lh) }, t);
        ts.textContent = row;
        // first-letter side bearing (DEC-025 / DEC-033) for flush-left names
        if (anchor === 'start') ts.setAttribute('x', f(A[0] - (parseFloat(getComputedStyle(ts).getPropertyValue('--lsb-pull')) || 0) * fs));
      });
      var bb = t.getBBox();
      return { node: node === gNames ? t : node, rect: [bb.x, y0 - cap, bb.x + bb.width, y0 + (k - 1) * lh] };
    }
    names.forEach(function (nm) {
      var want = SIDES[nm.ar.side] ? nm.ar.side : 'e', keys = sidesFrom(want), got = null;
      for (var i = 0; i < keys.length && !got; i++) {
        var tryIt = place(nm, keys[i]);
        if (!blocked(tryIt.rect, lineSamples, boxes, lgap)) got = tryIt; else tryIt.node.remove();
      }
      if (!got) { got = place(nm, want); warn('name ' + nm.id, 'name of "' + nm.id + '" touches a line or a name on every side'); }
      boxes.push(got.rect);
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
  window.NYCTAMap = {
    draw: draw, redraw: run,
    geometry: { version: 1, SIDES: SIDES, offset: offset, bundleRadius: bundleRadius, runOn: runOn, strand: strand,
                pointAt: pointAt, subPath: subPath, samples: samples, blocked: blocked, sidesFrom: sidesFrom }
  };
  function start() { (document.fonts ? document.fonts.ready : Promise.resolve()).then(run); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
  if (document.fonts) document.fonts.addEventListener('loadingdone', run);
})();
