/* Zajedničko zaglavlje (javne stranice i aplikacija): Početna, Alati ▾, Moje lige ▾, jezik.
   Markup pravi tools/build_pages.py (i u app/index.html), ovde su samo meniji, lige iz browsera i jezik.
   <header class="gnav" data-root="putanja do korena sajta" data-lang="sr|en" data-app-page="1 u aplikaciji"> */
(function () {
  'use strict';
  const H = document.querySelector('header.gnav');
  if (!H) return;
  const ROOT = H.dataset.root || '';
  const inApp = H.dataset.appPage === '1';
  const T = {
    sr: { home: 'Početna', tools: 'Alati', leagues: 'Moje lige', analyzer: 'Analiza trejda', finder: 'Igrač za tim', builder: 'Trejd između dva tima', soon: 'Uskoro',
      quick: 'Brzo poređenje', all: 'Sve lige', add: 'Dodaj ligu', settings: 'Podešavanja lige', none: 'Još nemaš sačuvanu ligu' },
    en: { home: 'Home', tools: 'Tools', leagues: 'My leagues', analyzer: 'Trade analyzer', finder: 'Player for your team', builder: 'Trade between two teams', soon: 'Coming soon',
      quick: 'Quick compare', all: 'All leagues', add: 'Add league', settings: 'League settings', none: 'No saved leagues yet' },
  };
  let lang = H.dataset.lang === 'sr' ? 'sr' : 'en';
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pre = () => (lang === 'sr' ? 'sr/' : '');
  const href = {
    home: () => `${ROOT}${pre()}` || './',
    analyzer: () => `${ROOT}${pre()}trade-analyzer/`,
    app: () => `${ROOT}app/`,
  };
  const profile = () => { try { return JSON.parse(localStorage.getItem('fbaTrade.profile.v2')); } catch { return null; } };
  const openTrades = id => { try { const s = JSON.parse(localStorage.getItem('fbaTrade.trades.v1')).scopes[id]; return (s?.tabs || []).filter(tb => (tb.teams || []).some(x => x.ids?.length)).length; } catch { return 0; } };
  const activeLeague = () => (location.hash.match(/^#league-([\w-]+)/) || [])[1] || null;
  const returning = () => !!(profile()?.leagues?.length);

  /** Tekstovi i adrese po jeziku (u aplikaciji se jezik menja u mestu) */
  function apply() {
    H.dataset.lang = lang;
    H.querySelectorAll('[data-t]').forEach(el => { el.textContent = T[lang][el.dataset.t]; });
    H.querySelectorAll('[data-href]').forEach(el => {
      const k = el.dataset.href;
      if (!href[k]) return;
      // povratnik: veza ka početnoj ne preusmerava u ligu
      el.setAttribute('href', href[k]() + (k === 'home' && (inApp || returning()) ? '?home' : ''));
    });
  }

  /** Meni Moje lige: Brzo poređenje · Sve lige › lige · Podešavanja lige · Dodaj ligu */
  function fillLeagues() {
    const box = H.querySelector('[data-leagues]');
    const settings = H.querySelector('[data-league-settings]');
    const p = profile(), list = p?.leagues || [];
    const cur = activeLeague();
    const app = inApp ? '' : href.app();
    box.innerHTML = list.length
      ? list.map(l => { const n = openTrades(l.id); return `<a role="menuitem" class="pm-item pm-league ${l.id === cur ? 'on' : ''}" href="${app}#league-${l.id}/overview&lang=${lang}" data-gnav-league="${l.id}">
          <span class="pm-dot" aria-hidden="true"></span><span class="pm-name">${esc(l.name)}</span>${n ? `<span class="cnt">${n}</span>` : ''}</a>`; }).join('')
      : `<span class="pm-item pm-league off">${esc(T[lang].none)}</span>`;
    // Podešavanja lige: samo u aplikaciji, dok je otvorena liga (akciju izvršava aplikacija)
    settings.innerHTML = inApp && cur && document.body.dataset.view === 'league'
      ? `<button type="button" role="menuitem" class="pm-item" data-action="league-settings">${ICON.gear}<span>${esc(T[lang].settings)}</span></button>` : '';
    H.querySelectorAll('[data-href="all"]').forEach(a => a.setAttribute('href', `${app || ''}#home&lang=${lang}`));
    H.querySelectorAll('[data-href="add"]').forEach(a => a.setAttribute('href', `${app || ''}#home&addleague=1&lang=${lang}`));
  }
  const ICON = { gear: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>' };

  function closeAll(except) {
    H.querySelectorAll('[data-gmenu]').forEach(b => {
      if (b === except) return;
      b.setAttribute('aria-expanded', 'false');
      document.getElementById(`gmenu-${b.dataset.gmenu}`).hidden = true;
    });
  }
  H.addEventListener('click', e => {
    const b = e.target.closest('[data-gmenu]');
    if (b) {
      const m = document.getElementById(`gmenu-${b.dataset.gmenu}`);
      const open = m.hidden;
      closeAll(b);
      if (open && b.dataset.gmenu === 'leagues') fillLeagues();
      m.hidden = !open; b.setAttribute('aria-expanded', String(open));
      if (open) m.querySelector('a,button')?.focus({ preventScroll: true });
      return;
    }
    if (e.target.closest('.gmenu a, .gmenu button')) setTimeout(() => closeAll(), 0);
  });
  document.addEventListener('click', e => { if (!e.target.closest('header.gnav .dd-wrap')) closeAll(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeAll(); });

  // jezik: javne stranice idu na drugu adresu, aplikacija menja jezik u mestu (app.js)
  const ps = H.querySelector('[data-publang]');
  if (ps) ps.addEventListener('change', () => { location.href = ps.selectedOptions[0].dataset.go + (/[?&]home\b/.test(location.search) ? '?home' : ''); });

  window.RSNav = { setLang(l) { lang = l === 'sr' ? 'sr' : 'en'; apply(); }, refresh: fillLeagues };
  apply();
})();
