/* NYCTA 1970 → Web — plate widths (DEC-030)
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

  function size() {
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
})();

/* Print simulation layer (DEC-038): only with <html data-print>. Injects the ink-edge filter the CSS
   points at (filter: url(#nycta-ink)); its strength is --print-edge in px. NYCTAPrint.update() re-reads it. */
(function () {
  var NS = 'http://www.w3.org/2000/svg', disp;
  function update() {
    if (!disp) return;
    var v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--print-edge'));
    disp.setAttribute('scale', isFinite(v) ? v : 1);
  }
  function init() {
    if (!document.documentElement.hasAttribute('data-print') || document.getElementById('nycta-ink')) return update();
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('aria-hidden', 'true');
    svg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
    svg.innerHTML = '<filter id="nycta-ink" x="-2%" y="-2%" width="104%" height="104%" color-interpolation-filters="sRGB">' +
      '<feTurbulence type="fractalNoise" baseFrequency="1.1" numOctaves="2" seed="7" result="t"/>' +
      '<feDisplacementMap in="SourceGraphic" in2="t" scale="1" xChannelSelector="R" yChannelSelector="G"/></filter>';
    document.body.insertBefore(svg, document.body.firstChild);
    disp = svg.querySelector('feDisplacementMap');
    update();
  }
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
  window.NYCTAPrint = { init: init, update: update, set: set };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire); else wire();
})();
