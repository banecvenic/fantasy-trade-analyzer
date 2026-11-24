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
    sr: { home: 'Početna', tools: 'Alati', leagues: 'Moje lige', analyzer: 'Analiza trejda', builder: 'Pronađi trejd', finder: 'Mete za trejd', fa: 'Pojačanja sa FA', soon: 'Uskoro', ok: 'U redu', pick: 'Izaberi ligu', pickSub: 'Radi za uvezene lige.', addLeague: 'Dodaj ligu', howWorks: 'Kako radi?', manual: 'Ručna liga', locked: 'Radi samo za uvezene lige, jer su nam potrebni svi rosteri.', howImport: 'Kako da uvezem ligu?', noLeagues: 'Još nemaš sačuvanu ligu. Uvezi svoju ligu sa ESPN-a, Sleepera ili Fantraxa.', close: 'Zatvori',
      quick: 'Brzo poređenje', all: 'Sve lige', add: 'Dodaj ligu', settings: 'Podešavanja lige', none: 'Još nemaš sačuvanu ligu', myLeague: 'Moja liga' },
    en: { home: 'Home', tools: 'Tools', leagues: 'My leagues', analyzer: 'Trade analyzer', builder: 'Find a trade', finder: 'Trade targets', fa: 'Free agent pickups', soon: 'Coming soon', ok: 'OK', pick: 'Choose a league', pickSub: 'Works for imported leagues.', addLeague: 'Add league', howWorks: 'How it works', manual: 'Manual league', locked: 'Works only for imported leagues, because we need all rosters.', howImport: 'How do I import a league?', noLeagues: 'No saved leagues yet. Import your league from ESPN, Sleeper or Fantrax.', close: 'Close',
      quick: 'Quick compare', all: 'All leagues', add: 'Add league', settings: 'League settings', none: 'No saved leagues yet', myLeague: 'My league' },
  };
  let lang = H.dataset.lang === 'sr' ? 'sr' : 'en';
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pre = () => (lang === 'sr' ? 'sr/' : '');
  const href = {
    home: () => `${ROOT}${pre()}` || './',
    analyzer: () => `${ROOT}${pre()}trade-analyzer/`,
    builder: () => `${ROOT}${pre()}trade-finder/`,
    finder: () => `${ROOT}${pre()}trade-targets/`,
    app: () => `${ROOT}app/`,
  };
  const profile = () => { try { return JSON.parse(localStorage.getItem('fbaTrade.profile.v2')); } catch { return null; } };
  const openTrades = id => { try { const s = JSON.parse(localStorage.getItem('fbaTrade.trades.v1')).scopes[id]; return (s?.tabs || []).filter(tb => (tb.teams || []).some(x => x.ids?.length)).length; } catch { return 0; } };
  const activeLeague = () => (location.hash.match(/^#league-([\w-]+)/) || [])[1] || null;
  // podrazumevani naziv lige prati jezik stranice
  const lgName = l => (['Moja liga', 'My league'].includes(l.name) ? T[lang].myLeague : l.name);
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
          <span class="pm-dot" aria-hidden="true"></span><span class="pm-name">${esc(lgName(l))}</span>${n ? `<span class="cnt">${n}</span>` : ''}</a>`; }).join('')
      : `<span class="pm-item pm-league off">${esc(T[lang].none)}</span>`;
    // Podešavanja lige: samo u aplikaciji, dok je otvorena liga (akciju izvršava aplikacija)
    settings.innerHTML = inApp && cur && document.body.dataset.view === 'league'
      ? `<button type="button" role="menuitem" class="pm-item" data-action="league-settings">${ICON.gear}<span>${esc(T[lang].settings)}</span></button>` : '';
    H.querySelectorAll('[data-href="all"]').forEach(a => a.setAttribute('href', `${app || ''}#home&lang=${lang}`));
    H.querySelectorAll('[data-href="add"]').forEach(a => a.setAttribute('href', `${app || ''}#home&addleague=1&lang=${lang}`));
  }
  const ICON = { gear: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>' };

  /** Zaključan alat: isti kratak opis kao u meniju lige (u aplikaciji ga otvara app.js) */
  const SOON = {
    finder: { t: 'builder', sr: 'Za igrača kog želiš ili kategoriju koja ti fali, predlaže trejdove sa timovima iz tvoje lige koji imaju smisla za obe strane.',
      en: 'For a player you want or a category you need, suggests trades with teams in your league that make sense for both sides.' },
    targets: { t: 'finder', sr: 'Pokazuje igrače iz drugih timova u tvojoj ligi koji najviše pomažu tvom timu, i kojim timovima bi trejd takođe odgovarao.',
      en: 'Shows players on other teams in your league who help your team the most, and which teams a trade could also suit.' },
    fa: { t: 'fa', sr: 'Iz tvoje uvezene lige pronalazi slobodne igrače koji odgovaraju tvom timu, uključujući one kojima minutaža raste.',
      en: 'Uses your imported league to find free agents who fit your team, including players whose minutes are growing.' },
  };
  function toolSoon(id) {
    if (inApp && typeof window.openToolSoon === 'function') { window.openToolSoon(id); return; }
    const s = SOON[id]; if (!s) return;
    document.getElementById('modal')?.remove();
    const m = document.createElement('div');
    m.id = 'modal';
    m.innerHTML = `<div class="modal-back" data-nav-close></div><div class="modal-box" tabindex="-1" role="dialog" aria-modal="true" aria-labelledby="modal-t">
      <h3 id="modal-t">${esc(T[lang][s.t])} <span class="soon-tag">${esc(T[lang].soon)}</span></h3><div class="modal-body"><p>${esc(s[lang])}</p></div>
      <div class="modal-actions"><button type="button" class="btn" data-nav-close>${esc(T[lang].ok)}</button></div></div>`;
    document.body.appendChild(m);
    m.addEventListener('click', e => { if (e.target.closest('[data-nav-close]')) m.remove(); });
    m.querySelector('.btn').focus();
  }

  /** "Izaberi ligu" za alat (Pojačanja sa FA): uvezene lige su aktivne, ručne zaključane uz objašnjenje. Isti modal na javnim stranicama i u aplikaciji. */
  const SRC = { espn: 'ESPN', sleeper: 'Sleeper', fantrax: 'Fantrax', yahoo: 'Yahoo' };
  const imported = l => !!(l.import && l.import.extId && l.import.source !== 'paste');
  const PAGE = { fa: 'free-agents' };
  const LOCK = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>';
  function pickLeague(tool = 'fa') {
    const L = T[lang], list = [...(profile()?.leagues || [])].sort((a, b) => imported(b) - imported(a)); // uvezene prve
    const app = inApp ? '' : href.app();
    const howImport = `${ROOT}${pre()}how-to-import/`, howTool = `${ROOT}${pre()}${PAGE[tool]}/`;
    const row = l => {
      const plat = imported(l) ? SRC[l.import.source] || l.import.source : L.manual;
      const team = l.teamName || l.roster?.name || '';
      const meta = `<span class="lpk-meta"><span class="pbadge">${esc(plat)}</span>${team ? ` ${esc(team)}` : ''}</span>`;
      if (imported(l)) return `<a class="lpk-row" href="${app}#league-${l.id}/${PAGE[tool]}&lang=${lang}" data-lpk-go><span class="lpk-name">${esc(lgName(l))}</span>${meta}</a>`;
      return `<div class="lpk-row off" title="${esc(L.locked)}"><button type="button" class="lpk-lock" data-lpk-lock aria-expanded="false"><span class="lpk-name">${LOCK} ${esc(lgName(l))}</span>${meta}</button>
        <p class="lpk-msg" hidden>${esc(L.locked)} <a href="${howImport}">${esc(L.howImport)}</a></p></div>`;
    };
    document.getElementById('modal')?.remove();
    const m = document.createElement('div');
    m.id = 'modal'; m.className = 'lpk-modal';
    m.innerHTML = `<div class="modal-back" data-nav-close></div><div class="modal-box lpk-box" tabindex="-1" role="dialog" aria-modal="true" aria-labelledby="modal-t">
      <button type="button" class="iconbtn lpk-x" data-nav-close aria-label="${esc(L.close)}">✕</button>
      <h3 id="modal-t">${esc(L.pick)}</h3><p class="lpk-sub">${esc(T[lang][tool] || '')} · ${esc(L.pickSub)}</p>
      <div class="lpk-list">${list.length ? list.map(row).join('') : `<p class="lpk-empty">${esc(L.noLeagues)}</p>`}</div>
      <div class="lpk-actions"><a class="btn" href="${app}#home&addleague=1&lang=${lang}" data-lpk-go>＋ ${esc(L.addLeague)}</a><a class="linkbtn" href="${howTool}">${esc(L.howWorks)}</a></div></div>`;
    document.body.appendChild(m);
    m.addEventListener('click', e => {
      if (e.target.closest('[data-nav-close]')) { m.remove(); return; }
      const lk = e.target.closest('[data-lpk-lock]');
      if (lk) { const msg = lk.parentElement.querySelector('.lpk-msg'); msg.hidden = !msg.hidden; lk.setAttribute('aria-expanded', String(!msg.hidden)); return; }
      // u aplikaciji: hash se menja u mestu, modal se zatvara
      if (e.target.closest('[data-lpk-go]') && inApp) setTimeout(() => m.remove(), 0);
    });
    (m.querySelector('a.lpk-row') || m.querySelector('.btn')).focus();
  }
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-pick-league]');
    if (!b) return;
    e.preventDefault(); closeAll(); pickLeague(b.dataset.pickLeague);
  });

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
    const soon = e.target.closest('[data-tool-soon]');
    if (soon) { closeAll(); toolSoon(soon.dataset.toolSoon); return; }
    if (e.target.closest('.gmenu a, .gmenu button')) setTimeout(() => closeAll(), 0);
  });
  document.addEventListener('click', e => { if (!e.target.closest('header.gnav .dd-wrap')) closeAll(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeAll(); const m = document.getElementById('modal'); if (m && (!inApp || m.classList.contains('lpk-modal'))) m.remove(); } });

  // jezik: javne stranice idu na drugu adresu, aplikacija menja jezik u mestu (app.js)
  const ps = H.querySelector('[data-publang]');
  if (ps) ps.addEventListener('change', () => { location.href = ps.selectedOptions[0].dataset.go + (/[?&]home\b/.test(location.search) ? '?home' : ''); });

  window.RSNav = { setLang(l) { lang = l === 'sr' ? 'sr' : 'en'; apply(); }, refresh: fillLeagues, pickLeague };
  apply();
})();
