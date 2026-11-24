/* Javna stranica Pojačanja sa FA: lista "Igrači u usponu ove nedelje" (ESPN vlasništvo ispod 60%, najveći rast).
   Podaci i profil igrača dolaze iz app.js u mini režimu (isto učitavanje i isti profil kao u aplikaciji, bez lige). */
(function () {
  'use strict';
  const root = document.getElementById('fa-rise');
  if (!root) return;
  const TXT = JSON.parse(root.dataset.txt);
  const list = document.getElementById('fa-rise-list');
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const lang = root.dataset.lang;
  const num = (v, d = 1) => (lang === 'sr' ? v.toFixed(d).replace('.', ',') : v.toFixed(d));

  function show() {
    if (!window.RSMini || !RSMini.ready()) { list.innerHTML = `<li class="empty">${esc(TXT.rising_error)}</li>`; return; }
    const ps = RSMini.rising();
    if (!ps.length) { list.innerHTML = `<li class="empty">${esc(TXT.rising_none)}</li>`; return; }
    list.innerHTML = ps.map((p, i) => {
      const dm = p.minSeason != null && p.minRecent != null ? Math.round(p.minRecent - p.minSeason) : null;
      return `<li><button type="button" class="fa-rise-row" data-id="${p.id}">
        <span class="fa-rise-n">${i + 1}</span><span class="mav" data-ini="${esc(p.ini)}"><img src="${p.img}" alt="" loading="lazy" onerror="this.remove()"></span>
        <span class="fa-rise-id"><b>${esc(p.name)}</b><small>${esc(p.team)} · ${esc(p.pos)}</small></span>
        <span class="fa-rise-own"><b class="up">+${num(p.chg)}%</b><small>${num(p.pct, 0)}% ${esc(TXT.rising_own)}</small></span>
        <span class="fa-rise-min">${dm == null ? '' : `<b class="${dm > 0 ? 'up' : dm < 0 ? 'down' : ''}">${dm > 0 ? '+' : dm < 0 ? '−' : '±'}${Math.abs(dm)}</b><small>${esc(TXT.rising_min)}</small>`}</span>
      </button></li>`;
    }).join('');
  }
  list.addEventListener('click', e => { const b = e.target.closest('[data-id]'); if (b && window.RSMini) RSMini.openPlayer(+b.dataset.id); });

  window.RS_EMBED = { lang, mini: true, rising: true };
  const sc = document.createElement('script');
  sc.src = root.dataset.app; sc.defer = true;
  sc.onload = () => { const t = setInterval(() => { if (window.RSMini && (RSMini.ready() || RSMini.error())) { clearInterval(t); show(); } }, 150); };
  sc.onerror = show;
  document.body.appendChild(sc);
})();
