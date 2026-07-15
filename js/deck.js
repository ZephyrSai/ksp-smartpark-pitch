/* ============================================================
   WĀHA deck controller — navigation, fullscreen, HUD, scene host
   ============================================================ */
(function () {
  const slides = Array.from(document.querySelectorAll('.slide'));
  const dots = document.getElementById('dots');
  const counter = document.getElementById('counter');
  const progress = document.getElementById('progressbar');
  let current = -1;
  let animating = false;

  // build dots
  slides.forEach((_, i) => {
    const b = document.createElement('button');
    b.setAttribute('aria-label', 'Go to slide ' + (i + 1));
    b.addEventListener('click', () => go(i));
    dots.appendChild(b);
  });

  function pad(n) { return String(n).padStart(2, '0'); }

  function go(i) {
    if (i < 0 || i >= slides.length || i === current) return;
    const prev = current;
    current = i;
    slides.forEach((s, k) => s.classList.toggle('active', k === i));
    Array.from(dots.children).forEach((d, k) => d.classList.toggle('on', k === i));
    counter.textContent = pad(i + 1) + ' / ' + pad(slides.length);
    document.body.classList.toggle('on-ops', slides[i].classList.contains('ops'));
    progress.style.width = ((i + 1) / slides.length * 100) + '%';
    // hand the shared WebGL canvas to this slide's scene
    if (window.WAHA_SCENES) window.WAHA_SCENES.activate(slides[i], prev == null ? null : slides[prev]);
  }

  const next = () => go(current + 1);
  const prevS = () => go(current - 1);

  // keyboard
  window.addEventListener('keydown', (e) => {
    if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
    switch (e.key) {
      case 'ArrowRight': case 'PageDown': case ' ': next(); e.preventDefault(); break;
      case 'ArrowLeft': case 'PageUp': prevS(); e.preventDefault(); break;
      case 'Home': go(0); e.preventDefault(); break;
      case 'End': go(slides.length - 1); e.preventDefault(); break;
      case 'f': case 'F': toggleFS(); break;
    }
  });

  // wheel (gentle, debounced)
  let wheelLock = 0;
  window.addEventListener('wheel', (e) => {
    const now = Date.now();
    if (now - wheelLock < 900) return;
    // don't hijack scrolling inside the alert feed
    if (e.target.closest && e.target.closest('#alert-feed')) return;
    if (Math.abs(e.deltaY) < 24) return;
    wheelLock = now;
    e.deltaY > 0 ? next() : prevS();
  }, { passive: true });

  // touch swipe
  let tx = null;
  window.addEventListener('touchstart', (e) => { tx = e.touches[0].clientX; }, { passive: true });
  window.addEventListener('touchend', (e) => {
    if (tx == null) return;
    const dx = e.changedTouches[0].clientX - tx;
    if (Math.abs(dx) > 60) (dx < 0 ? next() : prevS());
    tx = null;
  }, { passive: true });

  // fullscreen
  function toggleFS() {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen().catch(() => {});
  }
  document.getElementById('btn-fs').addEventListener('click', toggleFS);
  const fsHero = document.getElementById('btn-fs-hero');
  if (fsHero) fsHero.addEventListener('click', toggleFS);

  // hud buttons
  document.getElementById('btn-next').addEventListener('click', next);
  document.getElementById('btn-prev').addEventListener('click', prevS);
  const start = document.getElementById('btn-start');
  if (start) start.addEventListener('click', next);
  const restart = document.getElementById('btn-restart');
  if (restart) restart.addEventListener('click', () => go(0));

  // boot once scenes are ready
  function boot() {
    if (window.WAHA_SCENES && window.WAHA_SCENES.ready) { go(0); }
    else setTimeout(boot, 40);
  }
  boot();
})();
