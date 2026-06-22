/* ============================================================
   OAK engineering – gemeinsame Interaktionen
   1) Interaktives Gitter (Canvas #gridCanvas, reagiert auf Maus)
   2) Akkordeon (.acc-head öffnet/schließt .acc-item)
   ============================================================ */

/* ── 1) Interaktives Gitter ──────────────────────────── */
(function(){
  const canvas = document.getElementById('gridCanvas');
  if(!canvas) return;
  const ctx = canvas.getContext('2d');
  const GAP = 32, R = 140, PUSH = 24;
  let w = 0, h = 0, cols = 0, rows = 0, dots = [];
  const mouse = { x: -9999, y: -9999 };

  function build(){
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = rect.width; h = rect.height;
    if(w === 0 || h === 0) return;
    canvas.width = w * dpr; canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cols = Math.ceil(w / GAP) + 1;
    rows = Math.ceil(h / GAP) + 1;
    dots = [];
    for(let r = 0; r < rows; r++) for(let c = 0; c < cols; c++)
      dots.push({ x: c*GAP, y: r*GAP, bx: c*GAP, by: r*GAP, c, r, glow: 0 });
  }
  const at = (c, r) => (c < 0 || r < 0 || c >= cols || r >= rows) ? null : dots[r*cols + c];

  function draw(t){
    ctx.clearRect(0, 0, w, h);
    for(const d of dots){
      const wave = Math.sin((d.bx + d.by) * 0.01 + t * 0.0006) * 1.8;
      let tx = d.bx, ty = d.by + wave;
      const dx = tx - mouse.x, dy = ty - mouse.y, dist = Math.hypot(dx, dy);
      if(dist < R){
        const f = 1 - dist / R, ang = Math.atan2(dy, dx);
        tx += Math.cos(ang) * f * PUSH; ty += Math.sin(ang) * f * PUSH;
        d.glow = Math.max(d.glow, f);
      }
      d.glow *= 0.9;
      d.x += (tx - d.x) * 0.18; d.y += (ty - d.y) * 0.18;
    }
    ctx.lineWidth = 1;
    for(const d of dots){
      for(const n of [at(d.c+1, d.r), at(d.c, d.r+1)]){
        if(!n) continue;
        const g = Math.max(d.glow, n.glow);
        ctx.strokeStyle = 'rgba(116,198,157,' + (0.05 + g*0.4) + ')';
        ctx.beginPath(); ctx.moveTo(d.x, d.y); ctx.lineTo(n.x, n.y); ctx.stroke();
      }
    }
    for(const d of dots){
      const g = d.glow;
      ctx.fillStyle = 'rgba(' + Math.round(116+g*120) + ',' + Math.round(198+g*57) + ',' + Math.round(157+g*60) + ',' + (0.3 + g*0.7) + ')';
      ctx.beginPath(); ctx.arc(d.x, d.y, 1.3 + g*2.2, 0, 6.2832); ctx.fill();
    }
    requestAnimationFrame(draw);
  }
  window.addEventListener('pointermove', e => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    if(x >= 0 && y >= 0 && x <= rect.width && y <= rect.height){ mouse.x = x; mouse.y = y; }
    else { mouse.x = -9999; mouse.y = -9999; }
  });
  let rt;
  window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(build, 150); });
  build();
  requestAnimationFrame(draw);
})();

/* ── 2) Akkordeon ────────────────────────────────────── */
document.addEventListener('click', e => {
  const head = e.target.closest('.acc-head');
  if(!head) return;
  const item = head.closest('.acc-item');
  const open = item.classList.contains('open');
  // optional: andere offen lassen (kein Auto-Close) – Klavier-Stil mit Mehrfach-Öffnen
  item.classList.toggle('open', !open);
});

/* ── 3) Mobiles Menü (Burger) + Dropdown „Leistungen" ── */
document.addEventListener('click', e => {
  // Dropdown „Leistungen" auf-/zuklappen (Klick/Touch)
  const ddBtn = e.target.closest('.nav-dd-btn');
  if(ddBtn){ ddBtn.closest('.nav-dd').classList.toggle('open'); return; }
  const burger = e.target.closest('.nav-burger');
  if(burger){
    const links = burger.closest('nav').querySelector('.nav-links');
    if(links) links.classList.toggle('open');
    return;
  }
  // Klick außerhalb schließt offene Dropdowns
  if(!e.target.closest('.nav-dd')) document.querySelectorAll('.nav-dd.open').forEach(d => d.classList.remove('open'));
  // Menü schließen, wenn ein Navigationslink geklickt wird (nicht beim Tippen in die Suche)
  const link = e.target.closest('.nav-links a');
  if(link){ const l = link.closest('.nav-links'); if(l) l.classList.remove('open'); }
});
