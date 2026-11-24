/* NYCTA 1970 → Web — first-letter pull (DEC-043) and plate widths (DEC-030)
   Identification plates hug the name, then round up to ½ ft; when that leaves less than 1in of room
   (the name already ends on a ½ ft line), one more ½ ft. The result in ft depends only on the font
   and weight, not on the module size, so it is measured once and set as --plate-w = module × ft.
   Without this script the plate is the bare hug width (CSS fallback). */
(function () {
  var STEP = 0.5;          // ft — DEC-030
  var MIN_ROOM = 1 / 12;   // ft = 1in — DEC-030

  function moduleOf(el) {
    var probe = document.createElement('div');
    probe.style.cssText = 'position:absolute;visibility:hidden;width:var(--module)';
    el.appendChild(probe);
    var m = probe.getBoundingClientRect().width;
    el.removeChild(probe);
    return m;
  }

  function platesFt(hug) {
    var ft = Math.ceil(hug / STEP - 1e-6) * STEP;
    if (ft - hug < MIN_ROOM) ft += STEP;
    return ft;
  }

  /* First-letter pull (DEC-043): each line-starting element is pulled left by its own first glyph's side
     bearing (minus the master inset), read from the --lsb-table token the font build writes. Without this
     script every element keeps the one straight-stem value --lsb-comp (DEC-025). Runs before the plate
     widths are measured, because the pull changes the name's hug width. */
  var PULLED = '.t-ident, .t-direction, .t-info, h1, .h1, h2, .h2, h3, .h3, .compact__title, .compact__item, .popup__text > *';
  var tableSrc = null, table = {};

  function readTable() {
    var raw = getComputedStyle(document.documentElement).getPropertyValue('--lsb-table').trim().replace(/^["']|["']$/g, '');
    if (raw === tableSrc) return;
    tableSrc = raw; table = {};
    raw.split(/\s+/).forEach(function (t) { if (t.length > 1) table[t.charAt(0)] = parseFloat(t.slice(1)); });
  }

  function firstChar(el) {
    var w = document.createTreeWalker(el, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT), n;
    while ((n = w.nextNode())) {
      if (n.nodeType === 1) {
        if (n.matches('.disc, svg, img, .arrow')) return null;   // line opens with a symbol: leave it
        continue;
      }
      var t = n.nodeValue.replace(/^\s+/, '');
      if (t) return t.charAt(0);
    }
    return null;
  }

  function pullForChar(c) {
    readTable();
    var v = c && table[c];
    return typeof v === 'number' && !isNaN(v) ? v : null;
  }

  function pull() {
    readTable();
    var els = document.querySelectorAll(PULLED);
    for (var i = 0; i < els.length; i++) {
      var v = pullForChar(firstChar(els[i]));
      if (v !== null) els[i].style.setProperty('--lsb-pull', v + 'em');
      else els[i].style.removeProperty('--lsb-pull');
    }
  }

  function ensureArrow() {
    if (document.getElementById('arrow') || !document.querySelector('use[href="#arrow"]')) return;
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('aria-hidden', 'true');
    svg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
    svg.innerHTML = '<symbol id="arrow" viewBox="-0.5 -0.5 1 1">' +
      '<path d="M -0.488 -0.1015 L 0.119 -0.1015 L -0.048 -0.269 L 0.096 -0.403 L 0.5 0 L 0.096 0.403 L -0.048 0.269 L 0.119 0.1015 L -0.488 0.1015 Z"/></symbol>';
    document.body.insertBefore(svg, document.body.firstChild);
  }

  function size() {
    ensureArrow();
    pull();
    var cells = document.querySelectorAll('.sign-ident > .m');
    for (var i = 0; i < cells.length; i++) cells[i].style.removeProperty('--plate-w');
    for (var j = 0; j < cells.length; j++) {
      var cell = cells[j], m = moduleOf(cell);
      if (!m) continue;
      var hug = cell.getBoundingClientRect().width / m;
      var ft = platesFt(hug);
      cell.style.setProperty('--plate-w', 'calc(var(--module) * ' + ft + ')');
      cell.dataset.ft = ft;
    }
  }

  function run() { (document.fonts ? document.fonts.ready : Promise.resolve()).then(size); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run); else run();
  if (document.fonts) document.fonts.addEventListener('loadingdone', size);
  // dark mode changes the weight (DEC-019), which changes the name width
  if (window.matchMedia) {
    var mq = window.matchMedia('(prefers-color-scheme: dark)');
    if (mq.addEventListener) mq.addEventListener('change', size);
  }
  window.NYCTA = window.NYCTA || {};
  window.NYCTA.sizePlates = size;
  window.NYCTA.pullFirstLetters = pull;
  window.NYCTA.pullForChar = pullForChar;
})();

/* Print simulation layer (DEC-038): only with <html data-print>. Injects the ink-edge filter the CSS
   points at (filter: url(#nycta-ink)); its strength is --print-edge in px. NYCTAPrint.update() re-reads it.
   Pre-baked tiles (DEC-038, 2026-11-24): both the ink-edge displacement noise and the paper grain are baked
   once onto small seamless PNG data URIs when data-print turns on (lazy: 0ms when off), replacing live
   feTurbulence which stalled WebKit/iOS Safari on filtered plates, scrolling blocks and moving trains.
   Zoom (DEC-039): the texture is held at screen-pixel size, so it reads the same at any zoom. z = device px per
   CSS px / 2 (1 = 100 % on a retina screen, where the values were tuned). The displacement tile size follows
   1/z (bumps stay ~1.8 device px, never finer than the screen can show, never blown up into waves); the edge
   displacement follows 1/z when zoomed in (stays ±1.5 device px) but stays in CSS px when zoomed out, so small
   type is not shredded. The grain tile is sized the same way (--print-grain-size). */
(function () {
  var NS = 'http://www.w3.org/2000/svg', disp, img, EDGE_TILE = 128, GRAIN = 240, noiseURI = null, grainReady = false, lastZ = 0, lastEdge = null;
  function rng(seed) {
    var s = seed >>> 0;
    return function () {
      s |= 0; s = s + 0x6D2B79F5 | 0;
      var t = Math.imul(s ^ s >>> 15, 1 | s);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function bakeNoise() {
    if (noiseURI) return noiseURI;
    var T = EDGE_TILE, S = T * 2, c = document.createElement('canvas');
    c.width = c.height = S;
    var ctx = c.getContext('2d'), im = ctx.createImageData(S, S), d = im.data;
    var R = rng(20261119), co = new Float32Array(T * T * 2);
    for (var n = 0; n < co.length; n++) co[n] = R();
    function at(ch, u, v) {
      var u0 = u | 0, v0 = v | 0, fu = u - u0, fv = v - v0, u1 = (u0 + 1) % T, v1 = (v0 + 1) % T;
      u0 %= T; v0 %= T;
      var a = co[(v0 * T + u0) * 2 + ch], b = co[(v0 * T + u1) * 2 + ch],
          e = co[(v1 * T + u0) * 2 + ch], f = co[(v1 * T + u1) * 2 + ch];
      return (a + (b - a) * fu) * (1 - fv) + (e + (f - e) * fu) * fv;
    }
    for (var j = 0; j < S; j++) for (var i = 0; i < S; i++) {
      var k = (j * S + i) * 4;
      for (var ch = 0; ch < 2; ch++) d[k + ch] = Math.round(255 * (0.5 + ((at(ch, i / 2, j / 2) - 0.5) * 0.55 + (R() - 0.5) * 0.45) * 0.8));
      d[k + 2] = 128; d[k + 3] = 255;
    }
    ctx.putImageData(im, 0, 0);
    noiseURI = c.toDataURL();
    return noiseURI;
  }
  // Seamless paper-fibre grain tile (DEC-038): replaces the 3-octave SVG feTurbulence background on body::after
  // with a decoded bitmap PNG (light = warm fibre rgb(82,69,51), dark = white specks), matching the SVG's alpha curve.
  function bakeGrain() {
    if (grainReady) return;
    grainReady = true;
    var S = 192, c = document.createElement('canvas');
    c.width = c.height = S;
    var ctx = c.getContext('2d'), R = rng(20261124);
    var G1 = 96, g1 = new Float32Array(G1 * G1);
    for (var n = 0; n < g1.length; n++) g1[n] = R();
    var alpha = new Uint8Array(S * S);
    for (var j = 0; j < S; j++) for (var i = 0; i < S; i++) {
      var u = i * 0.5, v = j * 0.5, u0 = u | 0, v0 = v | 0, fu = u - u0, fv = v - v0, u1 = (u0 + 1) % G1, v1 = (v0 + 1) % G1;
      var c0 = (g1[v0 * G1 + u0] * (1 - fu) + g1[v0 * G1 + u1] * fu) * (1 - fv) +
               (g1[v1 * G1 + u0] * (1 - fu) + g1[v1 * G1 + u1] * fu) * fv;
      var val = c0 * 0.62 + R() * 0.38;
      var a = val * 1.8 - 0.82;
      alpha[j * S + i] = a <= 0 ? 0 : a >= 1 ? 255 : Math.round(a * 255);
    }
    function tile(r, g, b) {
      var im = ctx.createImageData(S, S), d = im.data;
      for (var p = 0; p < alpha.length; p++) {
        var k = p * 4; d[k] = r; d[k + 1] = g; d[k + 2] = b; d[k + 3] = alpha[p];
      }
      ctx.putImageData(im, 0, 0);
      return 'url("' + c.toDataURL() + '")';
    }
    var root = document.documentElement.style;
    root.setProperty('--print-grain-tex-light', tile(82, 69, 51));
    root.setProperty('--print-grain-tex-dark', tile(255, 255, 255));
  }
  function zoom() {
    var vv = window.visualViewport, z = (window.devicePixelRatio || 1) * (vv && vv.scale ? vv.scale : 1) / 2;
    return z > 0 ? z : 1;
  }
  function update(force) {
    var root = document.documentElement, z = zoom();
    if (!force && z === lastZ && disp) return;
    lastZ = z;
    root.style.setProperty('--print-grain-size', (GRAIN / z).toFixed(2) + 'px');
    if (!disp) return;
    var v = parseFloat(getComputedStyle(root).getPropertyValue('--print-edge'));
    if (!isFinite(v)) v = 1;
    var sc = (v * Math.min(1, 1 / z)).toFixed(3), ts = (EDGE_TILE / z).toFixed(2);
    if (sc !== lastEdge || force) { lastEdge = sc; disp.setAttribute('scale', sc); }
    img.setAttribute('width', ts);
    img.setAttribute('height', ts);
  }
  function init() {
    if (!document.documentElement.hasAttribute('data-print')) return;
    bakeGrain();
    if (document.getElementById('nycta-ink')) return update(true);
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('aria-hidden', 'true');
    svg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
    svg.innerHTML = '<filter id="nycta-ink" x="-2%" y="-2%" width="104%" height="104%" color-interpolation-filters="sRGB">' +
      '<feImage id="nycta-ink-noise" x="0" y="0" width="128" height="128" preserveAspectRatio="none" result="n"/>' +
      '<feTile in="n" result="t"/>' +
      '<feDisplacementMap in="SourceGraphic" in2="t" scale="1" xChannelSelector="R" yChannelSelector="G"/></filter>';
    document.body.insertBefore(svg, document.body.firstChild);
    disp = svg.querySelector('feDisplacementMap');
    img = svg.querySelector('feImage');
    img.setAttribute('href', bakeNoise());
    update(true);
  }
  // Browser zoom changes devicePixelRatio and fires resize; pinch zoom changes visualViewport.scale.
  var queued = false;
  function onZoom() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(function () { queued = false; if (document.documentElement.hasAttribute('data-print')) update(false); });
  }
  window.addEventListener('resize', onZoom);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', onZoom);
  // Viewer switch: any <button data-print-toggle> turns the layer on/off; the choice is remembered per browser.
  var KEY = 'nycta-print';
  function set(on) {
    var root = document.documentElement;
    if (on) root.setAttribute('data-print', ''); else root.removeAttribute('data-print');
    var btns = document.querySelectorAll('[data-print-toggle]');
    for (var i = 0; i < btns.length; i++) btns[i].setAttribute('aria-pressed', on ? 'true' : 'false');
    init();
  }
  function wire() {
    var btns = document.querySelectorAll('[data-print-toggle]');
    if (btns.length) {
      var saved = null;
      try { saved = localStorage.getItem(KEY); } catch (e) {}
      set(saved === null ? document.documentElement.hasAttribute('data-print') : saved === '1');
    } else init();
    for (var i = 0; i < btns.length; i++) btns[i].addEventListener('click', function () {
      var on = !document.documentElement.hasAttribute('data-print');
      set(on);
      try { localStorage.setItem(KEY, on ? '1' : '0'); } catch (e) {}
    });
  }
  window.NYCTAPrint = { init: init, update: function () { update(true); }, set: set, noiseURI: bakeNoise };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire); else wire();
})();
