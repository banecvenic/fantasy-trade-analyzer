// PRIVREMENI dijagnostički skript za Pronađi trejd (docs/trade-engine-audit.md). Sajt ga NE učitava.
// Pokretanje (localhost, stranica /app/ sa otvorenom uvezenom ligom), u konzoli:
//   eval(await (await fetch('/tools/tf_audit.js')).text());  pa  tfAudit.case1(...), tfAudit.funnel(...), await tfAudit.sweep(...)
// Ne menja app.js ni localStorage: oznake (Lock, "Dajem ako mora"), strategija i režim postavljaju se samo u memoriji za jedno računanje.
// Motor je kopija tfEngine iz app.js (tfEngine.toString()) sa umetnutim brojačima i tragom jednog trejda; logika se ne menja.
(function () {
  'use strict';
  const A = (window.tfAudit = {});
  const r3 = v => (v == null || !Number.isFinite(v) ? v : Math.round(v * 1000) / 1000);
  const nm = id => state.byId.get(id)?.name || String(id);

  /* ---------- 1) Motor sa brojačima ---------- */
  function patchedSrc() {
    let s = tfEngine.toString();
    const rep = (from, to) => { const i = s.indexOf(from); if (i < 0) throw new Error('patch: ' + from.slice(0, 70)); s = s.slice(0, i) + to + s.slice(i + from.length); };
    // dijagnostika po pretrazi
    rep('stats.myCombos = mCombos.length;',
      `const C = inp.__dbg || null; const D = C ? { tot: {}, shapeRej: {}, bneg: {}, out: {}, small: [], trunc: 0, mK: {}, tK: {} } : null; let __lf = null;
       const __add = (o, k, n) => { o[k] = (o[k] || 0) + n; };
       const __want = C && C.wantG ? ((g, r) => { const a = g.map(i => mine[i].id).sort().join(','), b = r.map(i => theirs[i].id).sort().join(','); return a === C.wantG && b === C.wantR; }) : null;
       const __F = (lab, quiet, t, R) => { if (!quiet) __lf = lab; if (t) { t.fail = lab; if (lab === 'ok' && R.x) t.s = R.x.s; } return R; };
       if (D) { for (const c of mCombos) __add(D.mK, c.length, 1); for (const c of tCombos) __add(D.tK, c.length, 1); }
       stats.myCombos = mCombos.length;`);
    // evalPair: oznaka za svaki "return R;"
    const a = s.indexOf('function evalPair('), b = s.indexOf('function convert(');
    let body = s.slice(a, b);
    const labels = ['tt_top', 'top_mine', 'top_mine_sell', 'top_opp', 'no_drop', 'drop_incoming', 'drop_tc', 'value_gap', 'opp_pts', 'opp_cats', 'cats_keep', 'min_gain', 'card_wl', 'pts_neg', 'sell_none', 'buy_none', 'ok'];
    let k = 0;
    body = body.replace(/return R;/g, () => `return __F('${labels[k++]}', quiet, __t, R);`);
    if (k !== labels.length) throw new Error('patch: return R count ' + k);
    const addAfter = (from, extra) => { const i = body.indexOf(from); if (i < 0) throw new Error('patch evalPair: ' + from.slice(0, 60)); body = body.slice(0, i + from.length) + extra + body.slice(i + from.length); };
    addAfter('R = { x: null, myDrop: null, thDrop: null };', ` const __t = __want && !quiet && __want(g, r) ? (D.trace = { gTop, rTop, gV, rV, kG, kR }) : null;`);
    addAfter('const gap = valueGap(A, Bx);', ` if (__t) Object.assign(__t, { A, Bx, gap, lim, myDrop: myDrop.map(x => x.id), thDrop: thDrop.map(x => x.id), myDropV: myDrop.map(x => x.v), thDropV: thDrop.map(x => x.v), myFaV: myFa.map(x => x.v), thFaV: thFa.map(x => x.v), irR: irR.map(i => theirs[i].id), irG: irG.map(i => mine[i].id) });`);
    addAfter('thFa.forEach((x, k) => add(thAfter, x.vec, thFw(k)));', ` if (__t) Object.assign(__t, { myTot: Array.from(myTot), myAfter: Array.from(myAfter), thTot: Array.from(thTot), thAfter: Array.from(thAfter) });`);
    addAfter('const or = sideResult(thTot, thAfter, cats, inp.oppIdx, T.TIE);', ` if (__t) __t.opp = { win: or.win, lose: or.lose, res: Array.from(or.res) };`);
    addAfter('const fd = thAfter[inp.fIdx] - thTot[inp.fIdx];', ` if (__t) __t.oppFd = fd;`);
    addAfter('const aw = expWins(myAfter, inp.opps, cats, inp.myIdx, inp.sd, inp.w);', ` if (__t) __t.aw = { total: aw.total, by: Array.from(aw.by), base: myBase.total, baseBy: Array.from(myBase.by) };`);
    addAfter('let s = gain - sizePen(kG, kR);', ` if (__t) { __t.gain = gain; __t.sizePen = sizePen(kG, kR); }`);
    s = s.slice(0, a) + body + s.slice(b);
    // glavna petlja
    rep('if (!shapeOk(kG, kR)) continue;', 'if (!shapeOk(kG, kR)) { if (D) __add(D.shapeRej, kG + \':\' + kR, arr.length); continue; }');
    rep('if (!(B > 0)) continue;', 'if (!(B > 0)) { if (D) __add(D.bneg, kG + \':\' + kR, arr.length); continue; }');
    rep('for (let j = lowerBound(arr, lo);', 'if (D) __add(D.tot, kG + \':\' + kR, arr.length);\n        for (let j = lowerBound(arr, lo);');
    rep('const R = evalPair(g, arr[j].c, P, arr[j].v, arr[j].top);', '__lf = null; const R = evalPair(g, arr[j].c, P, arr[j].v, arr[j].top);');
    rep('if (!x) continue;\n          const tier = x.tier;',
      `if (D) { const sh = kG + ':' + kR, o = D.out[sh] || (D.out[sh] = {}), lab = x ? (x.conv ? 'conv' : 'ok') : (__lf || '?'); o[lab] = (o[lab] || 0) + 1;
            if (C.small && kG === kR && kG <= 2) D.small.push({ g: g.map(i => mine[i].id), r: r.map(i => theirs[i].id), lab }); }
          if (!x) continue;
          const tier = x.tier;`);
    rep('if (tiers[tier].length > 12000) {', 'if (tiers[tier].length > 12000) { if (D) D.trunc++;');
    rep('const list = paginate(orderTiers(tiers, T.ENOUGH, Infinity),', 'const __ord = orderTiers(tiers, T.ENOUGH, Infinity); if (D) { D.tierN = tiers.map(t => t.length); D.ordN = __ord.length; if (C.ordered) D.ordered = __ord; }\n    const list = paginate(__ord,');
    rep('return { list: list.slice(0, T.KEEP), stats, hasTrade };', 'return { list: list.slice(0, T.KEEP), stats, hasTrade, dbg: D };');
    return s;
  }
  A.src = patchedSrc();
  A.E = new Function(`return (${A.src})();`)();

  /* ---------- 2) Model i ulaz (oznake samo u memoriji) ---------- */
  A.ctx = oppKey => { const lg = currentLeague(), o = lg.opps[oppKey]; return { lg, scopeKey: lg.id, oppKey, opps: [], my: lg.roster?.players || [], opp: o.players, oppName: o.name }; };
  A.model = (oppKey, { lockTheirs = [], lockMine = [], soft = [] } = {}) => {
    const M = tfModel(A.ctx(oppKey));
    for (const x of M.mine) { x.mark = lockMine.includes(x.id) ? 'lock' : soft.includes(x.id) ? 'soft' : null; if (x.mark === 'lock') x.drop = false; }
    for (const x of M.theirs) { x.mark = lockTheirs.includes(x.id) ? 'lock' : null; if (x.mark === 'lock') x.drop = false; }
    M.marks = { mine: Object.fromEntries(M.mine.filter(x => x.mark).map(x => [x.id, x.mark])), theirs: Object.fromEntries(M.theirs.filter(x => x.mark).map(x => [x.id, x.mark])) };
    return M;
  };
  A.input = (M, { strat = 'best', slider = 'fair', focus = [] } = {}) => {
    const S = state.tf, keep = { strat: S.strat, slider: S.slider, focus: S.focus };
    Object.assign(S, { strat, slider, focus });
    try { return tfInput(M); } finally { Object.assign(S, keep); }
  };
  /** Moje 3 najslabije kategorije (očekivane pobede po kategoriji protiv ostalih timova, bez punta) */
  A.weakCats = (M, n = 3) => { const inp = A.input(M); const myTot = A.myTot(M); const b = A.E.expWins(myTot, inp.opps, M.cats, M.myIdx, M.sd, null); return M.myIdx.map(i => ({ i, key: M.cats[i].key, e: b.by[i] })).sort((x, y) => x.e - y.e).slice(0, n); };
  A.myTot = M => { const v = new Float64Array(M.keys.length); for (const x of M.mine) if (!x.ir) x.vec.forEach((a, i) => { v[i] += a; }); return v; };

  /* ---------- 3) Igrač: tržišna i stvarna vrednost, komponente cene ---------- */
  let mkCache = null;
  function marketParts() {
    const B = tfBase();
    if (mkCache?.key === B.key) return mkCache;
    const pts = B.pts, lineRaw = p => { const w = blendWeights(B.gpOf(p)); const per = { proj: valueLine(p, 'proj', B.vcats), season: statOf(p, 'season'), l15: statOf(p, 'l15'), l7: statOf(p, 'l7') }; return blendLine(per, w); };
    const ownOf = p => p.own?.pct ?? 0, ownRank = new Map([...state.players].sort((a, b) => ownOf(b) - ownOf(a)).map((p, i) => [p.id, i + 1]));
    const rows = state.players.filter(p => B.genRaw.has(p.id)).map(p => { const l = lineRaw(p); return { id: p.id, gen: B.genRaw.get(p.id), prod: l ? (pts ? +l.FPTS || 0 : tfProd(l, TF.PROD_W)) : 0, min: +(l?.MIN ?? statOf(p, 'season')?.MIN ?? 0) || 0, own: ownOf(p), rank: ownRank.get(p.id) }; });
    const comp = r => [r.gen || 0, r.prod || 0, r.min || 0, r.own || 0, -Math.log(r.rank || 9999)];
    const pool = [...rows].sort((a, b) => (b.own || 0) - (a.own || 0)).slice(0, B.pool.n).map(comp);
    const K = [0, 1, 2, 3, 4], W = TF.MARKET, wv = [W.GEN, W.PROD, W.MIN, W.OWN, W.RANK];
    const mu = K.map(k => pool.reduce((s, c) => s + c[k], 0) / (pool.length || 1));
    const sd = K.map(k => Math.sqrt(pool.reduce((s, c) => s + (c[k] - mu[k]) ** 2, 0) / (pool.length || 1)) || 1);
    const mk = tfMarket(rows, { W, poolN: B.pool.n, teams: B.pool.teams, zMin: TF.MARKET_Z_MIN });
    const byId = new Map(rows.map(r => [r.id, r]));
    const genRank = new Map([...B.genRaw.entries()].sort((a, b) => b[1] - a[1]).map(([id], i) => [id, i + 1]));
    const all = state.players.filter(p => B.genRaw.has(p.id));
    const mvRank = new Map(all.map(p => [p.id, B.ros(p)]).sort((a, b) => b[1] - a[1]).map(([id], i) => [id, i + 1]));
    const rvRank = new Map(all.map(p => [p.id, B.real(p) ?? -1e9]).sort((a, b) => b[1] - a[1]).map(([id], i) => [id, i + 1]));
    mkCache = { key: B.key, byId, mu, sd, wv, mk, comp, genRank, mvRank, rvRank, lineRaw };
    return mkCache;
  }
  A.player = id => {
    const B = tfBase(), P = marketParts(), p = state.byId.get(id); if (!p) return null;
    const gp = B.gpOf(p), w = blendWeights(gp), wR = blendWeights(gp, FA.BLEND, FA.BLEND_FULL_GP, FA.REAL_PROJ_FLOOR, FA.REAL_PROJ_FADE_GP);
    const V = k => B.LV[k].values.get(id), vals = { proj: V('proj'), season: V('season'), l15: V('l15'), l7: V('l7') };
    const gen = blendValue(vals, w), real = blendValue(vals, wR), row = P.byId.get(id), c = row ? P.comp(row) : null;
    const z = c ? c.map((x, k) => Math.max(TF.MARKET_Z_MIN, (x - P.mu[k]) / P.sd[k])) : null;
    const l = B.lineOf(p);
    const round = o => (o ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k, r3(v)])) : null);
    return { id, name: p.name, team: p.team, own: p.own?.pct ?? null, status: playerStatus(p, currentLeague()).g, gamesLeft: gamesLeft(p.tid), dur: durability(p), fr: r3(B.fracOf(p)),
      blendW: round(w), realW: round(wR), line: l ? { MIN: r3(l.MIN), PTS: r3(l.PTS), REB: r3(l.REB), AST: r3(l.AST), STL: r3(l.STL), BLK: r3(l.BLK), TPM: r3(l.TPM), TO: r3(l.TO), FGA: r3(l.FGA), FGP: l.FGA ? r3(l.FGM / l.FGA) : null, FTA: r3(l.FTA), FTP: l.FTA ? r3(l.FTM / l.FTA) : null, FPTS: r3(l.FPTS) } : null,
      genPG: r3(gen?.total), realPG: r3(real?.total), realBy: round(real?.by), genBy: round(gen?.by),
      mkComp: row ? { gen: r3(row.gen), prod: r3(row.prod), min: r3(row.min), own: row.own, rank: row.rank } : null, mkZ: z ? z.map(r3) : null,
      mkPG: r3(P.mk.score.get(id)), mkRepl: r3(P.mk.repl), mkS: r3(P.mk.S),
      market: r3(B.ros(p)), real: r3(B.real(p)), genRank: P.genRank.get(id), mvRank: P.mvRank.get(id), rvRank: P.rvRank.get(id) };
  };

  /* ---------- 4) Tim posle trejda (isto kao kartica tfCardView), sa ili bez slobodnog mesta ---------- */
  A.after = (M, x, { slot = true } = {}) => {
    const keys = M.keys, vec = id => M.vecOf(M.lineOf(state.byId.get(id)));
    const before = new Array(keys.length).fill(0);
    for (const y of M.ctx.my) if (!y.ir) vec(y.id).forEach((v, i) => { before[i] += v; });
    const after = [...before], addI = (id, s) => vec(id).forEach((v, i) => { after[i] += s * v; });
    const irSet = new Set([...M.ctx.my, ...M.ctx.opp].filter(y => y.ir).map(y => y.id));
    for (const id of x.g) if (!irSet.has(id)) addI(id, -1);
    for (const id of x.r) if (!irSet.has(id)) addI(id, 1);
    const mdNow = x.md.length - (x.mdl || 0), mfP = x.mf - (x.mft || 0), wr = x.wr || 0;
    x.md.forEach((id, k) => addI(id, k < mdNow ? -1 : -(1 - wr)));
    if (slot) for (let k = 0; k < x.mf; k++) { const s = k < mfP ? 1 : wr; (M.fa[k]?.vec || M.replVec).forEach((a, i) => { after[i] += s * a; }); }
    return { before, after };
  };
  A.oppAfter = (M, x, { slot = true } = {}) => {
    const keys = M.keys, vec = id => M.vecOf(M.lineOf(state.byId.get(id)));
    const before = new Array(keys.length).fill(0);
    for (const y of M.ctx.opp) if (!y.ir) vec(y.id).forEach((v, i) => { before[i] += v; });
    const after = [...before], addI = (id, s) => vec(id).forEach((v, i) => { after[i] += s * v; });
    const irSet = new Set([...M.ctx.my, ...M.ctx.opp].filter(y => y.ir).map(y => y.id));
    for (const id of x.r) if (!irSet.has(id)) addI(id, -1);
    for (const id of x.g) if (!irSet.has(id)) addI(id, 1);
    const odNow = x.od.length - (x.odl || 0), ofP = x.of - (x.oft || 0), wg = x.wg || 0;
    x.od.forEach((id, k) => addI(id, k < odNow ? -1 : -(1 - wg)));
    if (slot) for (let k = 0; k < x.of; k++) { const s = k < ofP ? 1 : wg; (M.fa[k]?.vec || M.replVec).forEach((a, i) => { after[i] += s * a; }); }
    return { before, after };
  };
  const cv = (v, c) => (c.pct ? (v[c.a] > 0 ? v[c.m] / v[c.a] : null) : v[c.k]);
  /** Ocena predloga za proveru pravila: korist sa i bez slobodnog mesta, kartica W:L, stvarna i tržišna vrednost */
  A.judge = (M, inp, x) => {
    const E = A.E, tie = TF.TIE, wl = (b, a) => E.sideResult(b, a, M.cats, M.myIdx, tie);
    const S = A.after(M, x), N = A.after(M, x, { slot: false });
    let gain, gainNo, card, cardNo;
    if (M.pts) { gain = S.after[M.ki.FPTS] - S.before[M.ki.FPTS]; gainNo = N.after[M.ki.FPTS] - N.before[M.ki.FPTS]; }
    else {
      const base = E.expWins(Float64Array.from(S.before), inp.opps, M.cats, M.myIdx, M.sd, inp.w).total;
      gain = E.expWins(Float64Array.from(S.after), inp.opps, M.cats, M.myIdx, M.sd, inp.w).total - base;
      gainNo = E.expWins(Float64Array.from(N.after), inp.opps, M.cats, M.myIdx, M.sd, inp.w).total - base;
      card = wl(S.before, S.after); cardNo = wl(N.before, N.after);
    }
    const B = tfBase(), byId = new Map([...M.mine, ...M.theirs].map(e => [e.id, e]));
    const sumF = (ids, f) => ids.reduce((s, id) => s + f(byId.get(id)), 0);
    const rvG = sumF(x.g, e => e.rv), rvR = sumF(x.r, e => e.rv), rvMd = sumF(x.md, e => e.rv), rvOd = sumF(x.od, e => e.rv);
    const vG = sumF(x.g, e => e.v), vR = sumF(x.r, e => e.v), vMd = sumF(x.md, e => e.v), vOd = sumF(x.od, e => e.v);
    const realNo = rvR - rvG - rvMd, realSlot = realNo + x.mf * (B.slot.rv ?? 0);
    const mA = vR - vMd + x.mf * B.slot.v, mB = vG - vOd + x.of * B.slot.v; // tržišna vrednost koju dobija svaka strana (bez udela za IR)
    return { gain, gainNo, card, cardNo, realNo, realSlot, mA, mB };
  };

  /* ---------- 5) Pretraga (glavna nit, sa dijagnostikom) ---------- */
  A.run = (M, opt = {}, dbg = {}) => { const inp = A.input(M, opt); inp.__dbg = dbg; const t0 = performance.now(); const res = A.E.search(inp); res.ms = performance.now() - t0; res.inp = inp; return res; };
  const key = x => `${[...x.g].sort().join(',')}|${[...x.r].sort().join(',')}`;
  A.key = key;

  /** Slučaj 1: tačan trejd (imena), trag kroz sve provere, mesto među kandidatima, račun bez slobodnog mesta */
  A.case1 = (oppKey, giveNames, getNames, opt = {}, marks = {}) => {
    const M = A.model(oppKey, marks);
    const id = (list, n) => list.find(e => state.byId.get(e.id).name === n)?.id;
    const g = giveNames.map(n => id(M.mine, n)), r = getNames.map(n => id(M.theirs, n));
    const res = A.run(M, opt, { wantG: [...g].sort().join(','), wantR: [...r].sort().join(','), ordered: true });
    const D = res.dbg, tr = D.trace, k = `${[...g].sort().join(',')}|${[...r].sort().join(',')}`;
    const ordIdx = D.ordered.findIndex(x => key(x) === k), listIdx = res.list.findIndex(x => key(x) === k);
    const x = ordIdx >= 0 ? D.ordered[ordIdx] : listIdx >= 0 ? res.list[listIdx] : null;
    const conv = D.ordered.filter(y => y.conv && y.g.some(i => g.includes(i)) && y.r.some(i => r.includes(i))).slice(0, 5).map(y => ({ g: y.g.map(nm), r: y.r.map(nm), s: r3(y.s) }));
    const cats = M.cats.map(c => c.label);
    const team = tr?.myTot ? { cats, myBefore: M.cats.map(c => r3(cv(tr.myTot, c))), myAfter: M.cats.map(c => r3(cv(tr.myAfter, c))), thBefore: M.cats.map(c => r3(cv(tr.thTot, c))), thAfter: M.cats.map(c => r3(cv(tr.thAfter, c))) } : null;
    const J = x ? A.judge(M, res.inp, x) : null;
    const noSlot = x ? A.after(M, x, { slot: false }) : null;
    const B = tfBase();
    return {
      ms: Math.round(res.ms), ids: { g, r }, players: [...g, ...r, ...(x ? [...x.md, ...x.od] : [])].map(A.player),
      slot: { v: r3(B.slot.v), rv: r3(B.slot.rv), picks: (B.slot.picks || []).map(q => ({ ...A.player(q.id), w: q.w })), vec: Object.fromEntries(M.keys.map((k2, i) => [k2, r3(B.slot.vec[i])])) },
      trace: tr ? { ...tr, myTot: undefined, myAfter: undefined, thTot: undefined, thAfter: undefined, A: r3(tr.A), Bx: r3(tr.Bx), gap: r3(tr.gap), gain: r3(tr.gain), s: r3(tr.s) } : null,
      team, ordIdx, ordN: D.ordN, listIdx, page: listIdx >= 0 ? Math.floor(listIdx / 8) + 1 : null, x: x ? { ...x, s: r3(x.s), gain: r3(x.gain) } : null, judge: J,
      noSlotCats: noSlot ? { after: M.cats.map(c => r3(cv(noSlot.after, c))) } : null, conv,
      oppW: M.oppW.map(r3), oppIdx: M.oppIdx, myIdx: M.myIdx, oppRanks: M.oppRanks, sd: M.sd.map(r3), top8: res.list.slice(0, 8).map(y => ({ g: y.g.map(nm), r: y.r.map(nm), md: y.md.map(nm), mf: y.mf, s: r3(y.s), gain: r3(y.gain), conv: !!y.conv, shape: y.shape })),
    };
  };

  /** Slučaj 2: levak po veličini, top 8 i zašto mali trejdovi ne ulaze */
  A.funnel = (oppKey, opt = {}, marks = {}) => {
    const M = A.model(oppKey, marks);
    const res = A.run(M, opt, { ordered: true, small: true }), D = res.dbg;
    const ord = D.ordered, top = res.list.slice(0, 8), s8 = top.length ? Math.min(...top.map(y => y.s)) : null;
    const bestOf = sh => ord.map((y, i) => ({ y, i })).filter(o => o.y.shape === sh).slice(0, 3).map(o => ({ rank: o.i + 1, g: o.y.g.map(nm), r: o.y.r.map(nm), md: o.y.md.map(nm), mf: o.y.mf, s: r3(o.y.s), gain: r3(o.y.gain), minusS: r3(o.y.gain - o.y.s), sit: o.y.sit, conv: !!o.y.conv }));
    // mali trejdovi (1:1 i 2:2) koji nisu stigli do rangiranja: korist za moj tim (prosta zamena, kao motor bez otpuštanja), razlog
    const inp = res.inp, E = A.E, myTot = A.myTot(M), base = M.pts ? null : E.expWins(myTot, inp.opps, M.cats, M.myIdx, M.sd, inp.w).total;
    const evald = new Map(D.small.map(o => [`${[...o.g].sort().join(',')}|${[...o.r].sort().join(',')}`, o.lab]));
    const usable = e => e.mark !== 'lock' && !e.ir && !e.gone;
    const mi = M.mine.filter(usable), ti = M.theirs.filter(usable);
    const pairs = [];
    const cmb = (l, k) => (k === 1 ? l.map(e => [e]) : l.flatMap((e, i) => l.slice(i + 1).map(f => [e, f])));
    for (const k of [1, 2]) for (const G of cmb(mi, k)) for (const R of cmb(ti, k)) {
      const after = Float64Array.from(myTot); for (const e of G) e.vec.forEach((v, i) => { after[i] -= v; }); for (const e of R) e.vec.forEach((v, i) => { after[i] += v; });
      const gain = M.pts ? after[M.ki.FPTS] - myTot[M.ki.FPTS] : E.expWins(after, inp.opps, M.cats, M.myIdx, M.sd, inp.w).total - base;
      const gV = G.reduce((s, e) => s + e.v, 0), rV = R.reduce((s, e) => s + e.v, 0);
      const k2 = `${G.map(e => e.id).sort().join(',')}|${R.map(e => e.id).sort().join(',')}`;
      const inOrd = ord.findIndex(y => key(y) === k2);
      pairs.push({ G, R, gain, gap: E.valueGap(rV, gV), gV, rV, lab: inOrd >= 0 ? 'ranked' : evald.get(k2) || 'window', rank: inOrd + 1 });
    }
    const rejected = pairs.filter(p => p.lab !== 'ranked' && p.lab !== 'ok' && p.lab !== 'conv').sort((a, b) => b.gain - a.gain).slice(0, 5)
      .map(p => ({ g: p.G.map(e => nm(e.id)), r: p.R.map(e => nm(e.id)), gain: r3(p.gain), gap: r3(p.gap), gV: r3(p.gV), rV: r3(p.rV), reason: p.lab }));
    const rejNear = pairs.filter(p => p.lab !== 'ranked' && p.lab !== 'ok' && p.lab !== 'conv' && p.gap <= 0.25).sort((a, b) => b.gain - a.gain).slice(0, 5)
      .map(p => ({ g: p.G.map(e => nm(e.id)), r: p.R.map(e => nm(e.id)), gain: r3(p.gain), gap: r3(p.gap), gV: r3(p.gV), rV: r3(p.rV), reason: p.lab }));
    const rankedSmall = pairs.filter(p => p.lab === 'ranked').sort((a, b) => a.rank - b.rank).slice(0, 5).map(p => ({ rank: p.rank, g: p.G.map(e => nm(e.id)), r: p.R.map(e => nm(e.id)), gain: r3(p.gain), gap: r3(p.gap) }));
    const smallStat = {}; for (const p of pairs) { const sh = `${p.G.length}:${p.R.length}`; const o = smallStat[sh] || (smallStat[sh] = {}); o[p.lab === 'ranked' ? 'ranked' : p.lab] = (o[p.lab === 'ranked' ? 'ranked' : p.lab] || 0) + 1; }
    return { ms: Math.round(res.ms), stats: res.stats, mK: D.mK, tK: D.tK, tot: D.tot, shapeRej: D.shapeRej, bneg: D.bneg, out: D.out, trunc: D.trunc, tierN: D.tierN, ordN: D.ordN, listN: res.list.length,
      top8: top.map(y => ({ rank: ord.indexOf(y) + 1, g: y.g.map(nm), r: y.r.map(nm), md: y.md.map(nm), od: y.od.map(nm), mf: y.mf, of: y.of, s: r3(y.s), gain: r3(y.gain), minusS: r3(y.gain - y.s), sit: y.sit, shape: y.shape, conv: !!y.conv })), s8: r3(s8),
      best: { '1:1': bestOf('1:1'), '2:2': bestOf('2:2'), '2:1': bestOf('2:1'), '1:2': bestOf('1:2') }, rejected, rejNear, rankedSmall, smallStat,
      shapesOrd: ord.reduce((o, y) => { o[y.shape] = (o[y.shape] || 0) + 1; return o; }, {}) };
  };

  /* ---------- 6) Provera zdravog razuma: sve lige x protivnici x strategije x režimi (Web Workeri) ---------- */
  const STRATS = ['best', 'cats', 'sell', 'buy', 'cons', 'depth'], SLIDERS = ['fair', 'slight', 'aggr'];
  function pool(n) {
    const src = `const E=(${A.src})();onmessage=e=>{const t0=Date.now();const r=E.search(e.data.inp);postMessage({id:e.data.id,r:{list:r.list,stats:r.stats,dbg:r.dbg},ms:Date.now()-t0});};`;
    const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
    const ws = Array.from({ length: n }, () => new Worker(url)), q = [], wait = new Map(); let seq = 0;
    const next = w => { const j = q.shift(); if (!j) { w.busy = false; return; } w.busy = true; wait.set(j.id, j); w.postMessage({ id: j.id, inp: j.inp }); };
    ws.forEach(w => { w.onmessage = e => { const j = wait.get(e.data.id); wait.delete(e.data.id); j.res(e.data); next(w); }; });
    return { run: inp => new Promise(res => { q.push({ id: ++seq, inp, res }); const w = ws.find(x => !x.busy); if (w) next(w); }), close: () => ws.forEach(w => w.terminate()) };
  }
  /** Uslovi strategija (provera imena) */
  const RANK_GAP = 15; // tržišni rang bolji (ili lošiji) od stvarnog za bar ovoliko mesta
  function stratOk(strat, M, x, J, P, weak) {
    const byId = new Map([...M.mine, ...M.theirs].map(e => [e.id, e]));
    if (strat === 'best') return J.gain >= 0.05 && (!J.card || J.card.win - J.card.lose >= 2);
    if (strat === 'cats') return !!J.card && weak.some(w => J.card.res[w.i] > 0);
    if (strat === 'sell') return x.g.some(id => (P.rvRank.get(id) ?? 1e9) - (P.mvRank.get(id) ?? 1e9) >= RANK_GAP);
    if (strat === 'buy') return x.r.some(id => (P.mvRank.get(id) ?? 1e9) - (P.rvRank.get(id) ?? 1e9) >= RANK_GAP);
    if (strat === 'cons') { const all = [...x.g, ...x.r], best = all.reduce((b, id) => ((byId.get(id).rv ?? -1e9) > (byId.get(b).rv ?? -1e9) ? id : b), all[0]); return x.g.length > x.r.length && x.r.includes(best); }
    if (strat === 'depth') return x.r.length > x.g.length;
    return true;
  }
  A.sweep = async ({ leagues = null, workers = 4, softRun = true, log = () => {} } = {}) => {
    const startLg = currentLeague()?.id, P0 = pool(workers), out = { runs: [], viol: {}, ex: {}, perStrat: {}, sizes: {}, total: 0, anyViol: 0, sliderSame: { fairSlight: 0, fairAggr: 0, n: 0 }, myFavor: {}, emptyRuns: 0, softChk: [] };
    const ids = leagues || JSON.parse(localStorage.getItem('fbaTrade.profile.v2')).leagues.filter(l => Object.keys(l.opps || {}).length && l.roster?.players?.length).map(l => l.id);
    const push = (rule, sev, ex) => { (out.ex[rule] || (out.ex[rule] = [])).push({ sev, ...ex }); out.ex[rule].sort((a, b) => b.sev - a.sev); out.ex[rule].length = Math.min(out.ex[rule].length, 3); };
    for (const lgId of ids) {
      if (currentLeague()?.id !== lgId) { location.hash = `#league-${lgId}/overview`; for (let i = 0; i < 100 && currentLeague()?.id !== lgId; i++) await new Promise(r => setTimeout(r, 100)); await new Promise(r => setTimeout(r, 1500)); }
      const lg = currentLeague(), P = (mkCache = null, marketParts());
      for (const oppKey of Object.keys(lg.opps || {})) {
        if (!lg.opps[oppKey].players?.length) continue;
        const M = A.model(oppKey), weak = M.pts ? [] : A.weakCats(M);
        const jobs = [];
        for (const strat of STRATS) for (const slider of SLIDERS) {
          const focus = strat === 'cats' && !M.pts ? weak.map(w => w.key) : [];
          const inp = A.input(M, { strat, slider, focus }); inp.__dbg = {};
          jobs.push(P0.run(inp).then(d => ({ strat, slider, inp, d })));
        }
        const got = await Promise.all(jobs);
        const pages = {};
        for (const { strat, slider, inp, d } of got) {
          const page = d.r.list.slice(0, 8), tag = `${lg.name} · ${lg.opps[oppKey].name} · ${strat}/${slider}`;
          pages[`${strat}/${slider}`] = page.map(key).sort().join(';');
          out.runs.push({ lg: lg.name, opp: lg.opps[oppKey].name, strat, slider, n: d.r.list.length, page: page.length, ms: d.ms, tierN: d.r.dbg?.tierN, ordN: d.r.dbg?.ordN, st: { pairs: d.r.stats.pairs, value: d.r.stats.value, cats: d.r.stats.cats, gain: d.r.stats.gain, strat: d.r.stats.strat, conv: d.r.stats.conv }, slots: page.filter(x => x.mf > 0).length, drops: page.filter(x => x.md.length).length, convN: page.filter(x => x.conv).length });
          if (!page.length) out.emptyRuns++;
          const cntG = new Map(), cntR = new Map();
          for (const x of page) { x.g.forEach(id => cntG.set(id, (cntG.get(id) || 0) + 1)); x.r.forEach(id => cntR.set(id, (cntR.get(id) || 0) + 1)); }
          const ps = out.perStrat[strat] || (out.perStrat[strat] = { n: 0, any: 0, rules: {}, sizes: {}, pages: 0, repPages: 0, slots: 0 });
          if (page.length) { ps.pages++; const repG = [...cntG].filter(([, c]) => c > 3), repR = [...cntR].filter(([, c]) => c > 2); if (repG.length || repR.length) { ps.repPages++; out.repPages = (out.repPages || 0) + 1; } out.pages = (out.pages || 0) + 1; }
          ps.slots += page.filter(x => x.mf > 0).length;
          for (const x of page) {
            const J = A.judge(M, inp, x), v = [];
            const txt = `${tag}: daješ ${x.g.map(nm).join(' + ')}${x.md.length ? ` (otpuštaš ${x.md.map(nm).join(', ')})` : ''}, dobijaš ${x.r.map(nm).join(' + ')}${x.mf ? ` + ${x.mf} slobodno mesto` : ''}`;
            const desc = { txt, gain: r3(J.gain), gainNo: r3(J.gainNo), card: J.card ? `${J.card.win}:${J.card.lose}` : null, cardNo: J.cardNo ? `${J.cardNo.win}:${J.cardNo.lose}` : null, realNo: r3(J.realNo), realSlot: r3(J.realSlot), mA: r3(J.mA), mB: r3(J.mB) };
            // 1. loše bez waiver zamene
            if (x.mf > 0 && J.gainNo <= 0) { v.push(1); push(1, -J.gainNo, desc); }
            // 2. dajem 2+ igrača iz rotacije za igrače ispod 20 minuta
            const minOf = id => +(M.lineOf(state.byId.get(id))?.MIN || 0), rot = id => minOf(id) >= 24 || (P.genRank.get(id) ?? 1e9) <= 150;
            const rotG = x.g.filter(rot);
            if (rotG.length >= 2 && x.r.every(id => minOf(id) < 20)) { v.push(2); push(2, rotG.reduce((s, id) => s + minOf(id), 0) - Math.max(...x.r.map(minOf)), { ...desc, min: [...x.g, ...x.r].map(id => `${nm(id)} ${minOf(id).toFixed(1)}`).join(', ') }); }
            // 3. Najbolje za mene: razlika u kategorijama 1 ili manje, ili korist blizu nule
            if (strat === 'best' && ((J.card && J.card.win - J.card.lose <= 1) || J.gain < 0.05)) { v.push(3); push(3, 1 - (J.card ? J.card.win - J.card.lose : 0) + (0.05 - J.gain), desc); }
            // 4. više od 3 igrača na strani van Konsolidacije i Dubine
            if (!['cons', 'depth'].includes(strat) && Math.max(x.g.length, x.r.length) > 3) { v.push(4); push(4, Math.max(x.g.length, x.r.length), desc); }
            // 5. ponavljanje na strani od 8
            const rep = x.g.some(id => cntG.get(id) > 3) || x.r.some(id => cntR.get(id) > 2);
            if (rep) { v.push(5); push(5, Math.max(...x.g.map(id => cntG.get(id)), ...x.r.map(id => cntR.get(id))), { ...desc, txt: `${tag}: ${[...cntG].filter(([, c]) => c > 3).map(([id, c]) => `${nm(id)} (moj) ${c}/8`).concat([...cntR].filter(([, c]) => c > 2).map(([id, c]) => `${nm(id)} ${c}/8`)).join(', ')}` }); }
            // 7. ne odgovara imenu strategije
            if (!stratOk(strat, M, x, J, P, weak)) { v.push(7); push(`7-${strat}`, strat === 'best' ? -J.gain : 1, desc); }
            out.total++; if (v.length) out.anyViol++; if (v.some(k2 => k2 !== 5)) out.anyNo5 = (out.anyNo5 || 0) + 1;
            ps.n++; if (v.length) ps.any++;
            for (const k2 of new Set(v)) { out.viol[k2] = (out.viol[k2] || 0) + 1; ps.rules[k2] = (ps.rules[k2] || 0) + 1; }
            out.sizes[x.shape] = (out.sizes[x.shape] || 0) + 1; ps.sizes[x.shape] = (ps.sizes[x.shape] || 0) + 1;
            const mf = out.myFavor[slider] || (out.myFavor[slider] = { n: 0, mine: 0, gapSum: 0 }); mf.n++; if (J.mA > J.mB) mf.mine++; mf.gapSum += (J.mA - J.mB) / Math.max(Math.abs(J.mA), Math.abs(J.mB), 1e-9);
          }
        }
        for (const s of STRATS) { out.sliderSame.n++; if (pages[`${s}/fair`] === pages[`${s}/slight`]) out.sliderSame.fairSlight++; if (pages[`${s}/fair`] === pages[`${s}/aggr`]) out.sliderSame.fairAggr++; }
        // 6. "Dajem ako mora": moj igrač koji je najčešće u predlozima (Najbolje za mene, Fer) dobija oznaku; da li i dalje ulazi iako ima dovoljno predloga bez njega
        if (softRun) {
          const base = got.find(o => o.strat === 'best' && o.slider === 'fair').d.r.list.slice(0, 8), c = new Map();
          base.forEach(x => x.g.forEach(id => c.set(id, (c.get(id) || 0) + 1)));
          const top = [...c].sort((a, b) => b[1] - a[1])[0];
          if (top) {
            const Ms = A.model(oppKey, { soft: [top[0]] }), inp = A.input(Ms, { strat: 'best', slider: 'fair' }); inp.__dbg = {};
            const d = await P0.run(inp), list = d.r.list, page = list.slice(0, 8), withIt = page.filter(x => x.g.includes(top[0])).length, without = list.filter(x => !x.g.includes(top[0])).length;
            out.softChk.push({ lg: lg.name, opp: lg.opps[oppKey].name, player: nm(top[0]), before: top[1], after: withIt, alt: without });
            if (withIt && without >= 8) { out.viol[6] = (out.viol[6] || 0) + 1; push(6, withIt, { txt: `${lg.name} · ${lg.opps[oppKey].name}: ${nm(top[0])} (Dajem ako mora) u ${withIt} od 8, a bez njega postoji ${without} predloga`, ranks: page.map((x, i) => (x.g.includes(top[0]) ? i + 1 : null)).filter(Boolean) }); }
          }
        }
        log(`${lg.name} · ${lg.opps[oppKey].name} gotovo`);
      }
    }
    P0.close();
    if (startLg && currentLeague()?.id !== startLg) location.hash = `#league-${startLg}/overview`;
    return out;
  };
})();
