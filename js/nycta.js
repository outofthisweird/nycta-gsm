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
