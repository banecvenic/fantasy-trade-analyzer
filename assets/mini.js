/* Mini poređenje na početnoj ("Try a quick trade"): do 2 igrača po strani kao kartice sa slikom (Daješ | Dobijaš),
   rezultat koji je i veza ka celoj analizi, traka kategorija i "Cela statistika" koja se razvlači nadole.
   Podaci o igračima se učitavaju tek kad korisnik klikne u polje (app.js u mini režimu: ista pretraga i isto računanje). */
(function () {
  'use strict';
  const root = document.getElementById('mini');
  if (!root) return;
  const TXT = JSON.parse(root.dataset.txt);
  const lang = root.dataset.lang;
  const MAX = 2;
  const sides = [[], []];
  const inputs = [0, 1].map(i => document.getElementById(`mini-${i}`));
  const dds = [0, 1].map(i => document.getElementById(`mini-dd-${i}`));
  const result = document.getElementById('mini-result');
  const full = document.getElementById('mini-full');
  const stats = document.getElementById('mini-stats');
  const table = document.getElementById('mini-table');
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const L = lang === 'sr' ? { get: 'Dobijaš', give: 'Daješ' } : { get: 'You get', give: 'You give' };
  let loading = null, sel = [0, 0];

  function load() {
    if (loading) return loading;
    window.RS_EMBED = { lang, mini: true };
    loading = new Promise(resolve => {
      const sc = document.createElement('script');
      sc.src = root.dataset.app; sc.defer = true;
      sc.onload = () => { const t = setInterval(() => { if (window.RSMini && (RSMini.ready() || RSMini.error())) { clearInterval(t); resolve(); } }, 150); };
      sc.onerror = () => resolve();
      document.body.appendChild(sc);
    });
    return loading;
  }

  function showList(i) {
    const inp = inputs[i], dd = dds[i];
    if (!window.RSMini || !RSMini.ready()) {
      dd.innerHTML = `<li class="empty">${esc(window.RSMini && RSMini.error() ? TXT.mini_error : TXT.mini_loading)}</li>`;
      dd.hidden = false; inp.setAttribute('aria-expanded', 'true');
      return;
    }
    const q = inp.value.trim();
    if (!q || sides[i].length >= MAX) { dd.hidden = true; inp.setAttribute('aria-expanded', 'false'); return; }
    const list = RSMini.search(q, [...sides[0], ...sides[1]]);
    sel[i] = Math.min(sel[i], Math.max(list.length - 1, 0));
    dd.innerHTML = list.length
      ? list.map((p, k) => `<li role="option" data-id="${p.id}" aria-selected="${k === sel[i]}"><div class="dd-main"><div>${esc(p.name)}</div><div class="meta">${esc(p.team)} · ${esc(p.pos)}</div></div></li>`).join('')
      : `<li class="empty">${esc(TXT.mini_none)}</li>`;
    dd.hidden = false; inp.setAttribute('aria-expanded', 'true');
  }

  function pick(i, id) {
    if (sides[i].length >= MAX || sides[0].includes(id) || sides[1].includes(id)) return;
    sides[i].push(id);
    inputs[i].value = ''; dds[i].hidden = true; inputs[i].setAttribute('aria-expanded', 'false');
    update();
    if (sides[i].length < MAX) inputs[i].focus();
  }

  const card = (i, p) => `<div class="mcard"><span class="mav" data-ini="${esc(p.ini)}"><img src="${p.img}" alt="" loading="lazy" onerror="this.parentNode.textContent=this.parentNode.dataset.ini"></span>
      <div class="mtxt"><b title="${esc(p.name)}">${esc(p.name)}</b><small>${esc(p.team)} · ${esc(p.pos)}</small></div>
      <button type="button" class="mrm" data-rm="${i}:${p.id}" aria-label="${esc(TXT.mini_remove)} ${esc(p.name)}">✕</button></div>`;

  /** Cela statistika: Daješ (zbir) pa igrači, Dobijaš (zbir) pa igrači, pa razlika (Dobijaš − Daješ) */
  function statsTable(sc) {
    const labels = RSMini.labels();
    const head = `<tr><th></th>${labels.map(l => `<th>${esc(l)}</th>`).join('')}</tr>`;
    const prow = p => `<tr><td class="pn"><span class="mav sm" data-ini="${esc(p.ini)}"><img src="${p.img}" alt="" loading="lazy" onerror="this.parentNode.textContent=this.parentNode.dataset.ini"></span>${esc(p.name)}</td>${p.vals.map(v => `<td>${v}</td>`).join('')}</tr>`;
    // naslov strane (sa zbirom) ide iznad svojih igrača
    const side = (i, key, cls, title) => `<tr class="tot ${cls}"><td>${esc(title)}</td>${sc.cats.map(c => `<td>${c[key]}</td>`).join('')}</tr>`
      + sides[i].map(id => prow(RSMini.player(id))).join('');
    const diff = `<tr class="diff"><td>${esc(TXT.mini_diff)}</td>${sc.cats.map(c => `<td class="${c.res > 0 ? 'good' : c.res < 0 ? 'bad' : ''}">${c.delta && c.res !== 0 ? c.delta : '='}</td>`).join('')}</tr>`;
    return `<div class="mscroll"><table><thead>${head}</thead><tbody>${side(0, 'give', 'give', L.give)}${side(1, 'getv', 'get', L.get)}${diff}</tbody></table></div>`;
  }

  function update() {
    [0, 1].forEach(i => {
      const box = root.querySelector(`.mini-side[data-side="${i}"] .mini-cards`);
      box.innerHTML = sides[i].length ? sides[i].map(id => card(i, RSMini.player(id))).join('') : '';
      inputs[i].disabled = sides[i].length >= MAX;
      inputs[i].closest('.mini-in').hidden = sides[i].length >= MAX;
    });
    const sc = sides[0].length && sides[1].length ? RSMini.score(sides[0], sides[1]) : null;
    const base = root.dataset.ta;
    const href = sides[0].length || sides[1].length ? `${base}#per=season&t=${sides[0].join(',')}|${sides[1].join(',')}` : base;
    full.href = href;
    result.innerHTML = sc
      ? `<a class="mini-scorecard" href="${href}" title="${esc(TXT.mini_open)}">
          <div class="mini-score"><span class="lbl get-t">${L.get}</span><b class="n ${sc.get > sc.give ? 'w' : ''}">${sc.get}</b><span class="sep">:</span><b class="n ${sc.give > sc.get ? 'l' : ''}">${sc.give}</b><span class="lbl give-t">${L.give}</span></div>
          <div class="mcats">${sc.cats.map(c => `<span class="mc ${c.res > 0 ? 'good' : c.res < 0 ? 'bad' : 'tie'}">${c.res > 0 ? '+' : c.res < 0 ? '−' : '='} ${esc(c.label)}</span>`).join('')}</div>
          <span class="mini-open">${esc(TXT.mini_open)} →</span></a>`
      : `<span class="mini-hint">${esc(TXT.mini_hint)}</span>`;
    stats.hidden = !sc;
    table.innerHTML = sc ? statsTable(sc) : '';
  }

  inputs.forEach((inp, i) => {
    inp.addEventListener('focus', () => { load().then(() => showList(i)); showList(i); });
    inp.addEventListener('input', () => { sel[i] = 0; showList(i); });
    inp.addEventListener('keydown', e => {
      const items = [...dds[i].querySelectorAll('li[data-id]')];
      if (e.key === 'ArrowDown' && items.length) { e.preventDefault(); sel[i] = (sel[i] + 1) % items.length; showList(i); }
      else if (e.key === 'ArrowUp' && items.length) { e.preventDefault(); sel[i] = (sel[i] - 1 + items.length) % items.length; showList(i); }
      else if (e.key === 'Enter' && items.length) { e.preventDefault(); pick(i, +items[sel[i]].dataset.id); }
      else if (e.key === 'Escape') { dds[i].hidden = true; }
    });
    inp.addEventListener('blur', () => setTimeout(() => { dds[i].hidden = true; inp.setAttribute('aria-expanded', 'false'); }, 150));
    dds[i].addEventListener('mousedown', e => { const li = e.target.closest('li[data-id]'); if (li) { e.preventDefault(); pick(i, +li.dataset.id); } });
  });
  root.addEventListener('click', e => {
    const b = e.target.closest('[data-rm]');
    if (!b) return;
    const [i, id] = b.dataset.rm.split(':').map(Number);
    sides[i] = sides[i].filter(x => x !== id);
    update();
  });
})();
