// Testovi za Pronađi trejd (motor za fer trejd): korekcija za neravnomeran trejd, dodatak za zvezde, filter kategorija,
// punt protivnika, granice klizača, Zaključaj / Dajem ako mora / U trejd, strategije, stranice rezultata, poenska liga.
// Pokretanje: node tools/test_finder.js
// Izvršava se deo app.js od "Fer trejd: čiste funkcije" do "kraj: Fer trejd, čiste funkcije".
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const src = fs.readFileSync(path.join(__dirname, '..', 'assets', 'app.js'), 'utf8');
const start = src.indexOf('   Fer trejd: čiste funkcije');
const end = src.indexOf('/* ==== kraj: Fer trejd, čiste funkcije ==== */');
if (start < 0 || end < 0) throw new Error('Nije nađen modul Fer trejd u app.js');
const code = src.slice(src.lastIndexOf('/*', start), end);
const { TF, E, tfMarket, tfVetoPick, tfVetoShown, tfDropOk, tfTabFor, tfSlotValue, tfProd, tfRateKey, tfRateApply, tfInjury, tfInjFrac, tfNewsWeeks, tfLate } = new Function(`${code}\nreturn { TF, E: tfEngine(), tfMarket, tfVetoPick, tfVetoShown, tfDropOk, tfTabFor, tfSlotValue, tfProd, tfRateKey, tfRateApply, tfInjury, tfInjFrac, tfNewsWeeks, tfLate };`)();
// i motor kao tekst (kako ga dobija Web Worker) mora da radi samostalno
const E2 = new Function(`return (${new Function(`${code}\nreturn tfEngine;`)().toString()})();`)();

let n = 0;
const test = (name, fn) => { fn(); n++; console.log(`ok  ${name}`); };

// vektor: [PTS, REB, AST, TO, FGM, FGA, FPTS]
const KEYS = ['PTS', 'REB', 'AST', 'TO', 'FGM', 'FGA', 'FPTS'];
const cats = [
  { key: 'PTS', k: 0 }, { key: 'REB', k: 1 }, { key: 'AST', k: 2 }, { key: 'TO', k: 3, low: true }, { key: 'FGP', pct: true, m: 4, a: 5 },
];
const vec = (o) => KEYS.map(k => o[k] || 0);
const pl = (id, v, o = {}, extra = {}) => ({ id, v, vec: vec(o), mark: null, ir: false, ...extra });
const base = over => ({
  pts: false, n: KEYS.length, cats, myIdx: [0, 1, 2, 3, 4], oppIdx: [0, 1, 2, 3, 4], fIdx: 6,
  fa: [pl(900, 1, { PTS: 5, REB: 2, AST: 1, TO: 1, FGM: 2, FGA: 4.5 }), pl(901, 0.8, { PTS: 4, REB: 2, AST: 1, TO: 1, FGM: 2, FGA: 4.5 })],
  opps: [], sd: [5, 3, 2, 1, 0.01], w: null, oppW: [1, 1, 1, 1, 1],
  limits: [TF.LIMITS.fair], strategy: 'best', sell: [], buy: [], focus: [], TF, ...over,
});

test('dodatak za zvezde: zvezda vredi više od dva igrača iste ukupne vrednosti', () => {
  const S = 4;
  const starV = E.star(12, S, TF.STAR_POW), two = 2 * E.star(6, S, TF.STAR_POW);
  assert.ok(starV > two, `${starV} <= ${two}`);
  assert.strictEqual(E.star(-2, S, TF.STAR_POW), -2); // negativna vrednost se ne menja
});

test('korekcija 2 za 1: ko dobija više igrača gubi najslabijeg, druga strana dobija najboljeg slobodnog', () => {
  const roster = [{ i: 0, id: 1, v: 1 }, { i: 1, id: 2, v: 3 }, { i: 2, id: 3, v: 8 }].sort((a, b) => a.v - b.v);
  // ja dajem igrača 3, dobijam dva igrača (v 5 i 4): otpuštam 1 najslabijeg posle trejda = igrač 1 (v 1)
  const drop = E.weakest(roster, new Set([2]), [{ id: 10, v: 5 }, { id: 11, v: 4 }], 1);
  assert.deepStrictEqual(drop.map(x => x.id), [1]);
  // ceo trejd kroz pretragu: ja dajem 1 (v 10), dobijam 2 (v 6 + 5): moja strana = 11 − 1 (otpušten), njegova = 10 + 1 (FA) -> fer
  const inp = base({
    mine: [pl(1, 10, { PTS: 20, AST: 1, REB: 4 }), pl(2, 1, { PTS: 3 }), pl(3, 3, { PTS: 8 })],
    theirs: [pl(20, 6, { PTS: 14, REB: 3 }), pl(21, 5, { PTS: 12, REB: 2 }), pl(22, 30, { PTS: 30 })],
  });
  inp.mine[1].mark = null; inp.theirs[2].mark = 'lock';
  inp.mine[0].mark = 'trade';
  inp.strategy = 'depth'; // u Najbolje za mene bi pravilo najboljeg igrača odbilo 10 za 6 + 5
  const res = E.search(inp);
  const t = res.list.find(x => x.g.join() === '1' && x.r.slice().sort().join() === '20,21');
  assert.ok(t, 'trejd 1 za 2 nije nađen');
  assert.deepStrictEqual(t.md, [2]);   // otpuštam najslabijeg
  assert.strictEqual(t.of, 1);          // on dobija jedno slobodno mesto
  assert.ok(E.valueGap(11 - 1, 10 + 1) <= TF.LIMITS.fair[1]);
});

test('filter kategorija: 3:6 iz ugla protivnika ne prolazi, 4:5 prolazi, nerešeno se ne broji', () => {
  assert.strictEqual(E.catFilterOk({ win: 3, lose: 6 }, TF.CAT_MAX_DIFF), false);
  assert.strictEqual(E.catFilterOk({ win: 4, lose: 5 }, TF.CAT_MAX_DIFF), true);
  assert.strictEqual(E.catFilterOk({ win: 3, lose: 4 }, TF.CAT_MAX_DIFF), true); // 2 nerešene ne ulaze
  const before = vec({ PTS: 100, REB: 40, AST: 20, TO: 10, FGM: 40, FGA: 85 });
  const after = vec({ PTS: 100.02, REB: 41, AST: 19, TO: 10, FGM: 40, FGA: 85 }); // PTS i FG% nerešeno, TO isto
  const r = E.sideResult(before, after, cats, [0, 1, 2, 3, 4], TF.TIE);
  assert.deepStrictEqual([r.win, r.lose], [1, 1]);
});

test('punt protivnika se ne računa u njegov rezultat', () => {
  const before = vec({ PTS: 100, REB: 40, AST: 20, TO: 10, FGM: 40, FGA: 85 });
  const after = vec({ PTS: 96, REB: 38, AST: 23, TO: 12, FGM: 40, FGA: 85 }); // gubi PTS, REB, TO; dobija AST
  const all = E.sideResult(before, after, cats, [0, 1, 2, 3], TF.TIE);
  assert.strictEqual(E.catFilterOk(all, 1), false); // 1:3
  const noPunt = E.sideResult(before, after, cats, [0, 2], TF.TIE); // REB i TO su njegov punt
  assert.strictEqual(E.catFilterOk(noPunt, 1), true); // 1:1
});

test('granice klizača: sa igračem obeleženim U trejd granica je šira', () => {
  const mk = (mark) => base({ mine: [pl(1, 10, { PTS: 20, REB: 2 }, { mark }), pl(2, 2, { PTS: 4 })], theirs: [pl(20, 8.8, { PTS: 15, REB: 8, AST: 3 }), pl(21, 20, { PTS: 30 }, { mark: 'lock' })] });
  // razlika 12%: ne prolazi Fer (10%) bez oznake, prolazi sa oznakom (15%)
  assert.ok(Math.abs(E.valueGap(10, 8.8) - 0.12) < 1e-9);
  assert.strictEqual(E.search(mk(null)).list.some(x => x.g.join() === '1' && x.r.join() === '20'), false);
  assert.strictEqual(E.search(mk('trade')).list.some(x => x.g.join() === '1' && x.r.join() === '20'), true);
  // Agresivno (15%) prolazi i bez oznake
  const ag = mk(null); ag.limits = TF.SLIDERS.map(k => TF.LIMITS[k]);
  assert.strictEqual(E.search(ag).list.some(x => x.g.join() === '1' && x.r.join() === '20'), true);
});

const bigTeam = (off, n, seed) => Array.from({ length: n }, (_, i) => {
  const v = 1 + ((i * 7 + seed) % 9);
  return pl(off + i, v, { PTS: 6 + v * 2, REB: 2 + (i % 5), AST: 1 + ((i + seed) % 4), TO: 1 + (i % 3) * 0.5, FGM: 3 + v * 0.4, FGA: 7 + v * 0.7 });
});

test('Zaključaj nikad nije u trejdu, U trejd je uvek u trejdu', () => {
  const inp = base({ mine: bigTeam(1, 8, 1), theirs: bigTeam(100, 8, 4) });
  inp.mine[2].mark = 'lock'; inp.mine[5].mark = 'trade'; inp.theirs[3].mark = 'lock'; inp.theirs[6].mark = 'trade';
  inp.limits = TF.SLIDERS.map(k => TF.LIMITS[k]);
  const res = E.search(inp);
  assert.ok(res.list.length > 0);
  for (const x of res.list) {
    assert.ok(!x.g.includes(3) && !x.r.includes(103));
    assert.ok(x.g.includes(6) && x.r.includes(106));
  }
});

test('zaključan igrač se ni ne otpušta; primalac ne dobija igrača kog bi odmah otpustio', () => {
  const inp = base({ mine: bigTeam(1, 9, 1), theirs: bigTeam(100, 9, 3), limits: TF.SLIDERS.map(k => TF.LIMITS[k]) });
  const weak = [...inp.mine].sort((a, b) => a.v - b.v).slice(0, 2).map(x => x.id);
  for (const x of inp.mine) if (weak.includes(x.id)) x.mark = 'lock';
  const res = E.search(inp);
  assert.ok(res.list.length > 0);
  for (const x of res.list) {
    assert.ok(!x.md.some(id => weak.includes(id)), 'zaključan otpušten');
    assert.ok(!x.md.some(id => x.r.includes(id)) && !x.od.some(id => x.g.includes(id)), 'dobijen pa otpušten');
  }
});

test('raznovrsnost: isto jezgro trejda samo jednom', () => {
  const L = [{ core: 'a|b', top: 1, rtop: 5, shape: '1:1' }, { core: 'a|b', top: 1, rtop: 5, shape: '1:1' }, { core: 'a|c', top: 1, rtop: 6, shape: '2:2' },
    { core: 'a|d', top: 1, rtop: 7, shape: '3:3' }, { core: 'a|e', top: 1, rtop: 8, shape: '2:1' }, { core: 'f|b', top: 2, rtop: 5, shape: '1:2' }];
  const out = E.diversify(L, 8, 3);
  // isto jezgro samo jednom; četvrti sa istim glavnim igračem (1) ide posle ostalih
  assert.deepStrictEqual(out.map(x => x.core), ['a|b', 'a|c', 'a|d', 'f|b', 'a|e']);
});

test('IR igrač ulazi u kombinacije samo ako je obeležen U trejd', () => {
  const inp = base({ mine: bigTeam(1, 6, 2), theirs: bigTeam(100, 6, 3) });
  inp.mine[0].ir = true; inp.limits = TF.SLIDERS.map(k => TF.LIMITS[k]);
  assert.ok(E.search(inp).list.every(x => !x.g.includes(1)));
});

test('Dajem ako mora: ulazi u top 5 samo kad je korist jasno veća', () => {
  const inp = base({ mine: bigTeam(1, 8, 1), theirs: bigTeam(100, 8, 5) });
  inp.opps = [vec({ PTS: 110, REB: 40, AST: 22, TO: 12, FGM: 42, FGA: 90 }), vec({ PTS: 95, REB: 45, AST: 18, TO: 10, FGM: 38, FGA: 82 })];
  inp.limits = TF.SLIDERS.map(k => TF.LIMITS[k]);
  const plain = E.search(inp).list;
  const softId = plain[0].g[0];
  inp.mine.find(x => x.id === softId).mark = 'soft';
  const marked = E.search(inp).list;
  const bestWithout = marked.filter(x => !x.soft)[0];
  // trejd sa njim je u top 5 ispred trejda bez njega samo kad mu je korist veća bar za kaznu
  const pen = z => TF.SIZE_PEN * Math.max(0, z.n - 2); // ocena bez kazne "Dajem ako mora" = korist − kazna za veličinu
  const ranked = [...marked].sort(E.cmpRank); // čist rang (raznovrsnost i ograničenje 2 od 8 mogu da pomere predloge)
  ranked.slice(0, 5).forEach((x, i) => { if (!x.soft) return; for (const y of ranked.slice(i + 1)) if (!y.soft && y.tier === x.tier) assert.ok(x.gain - pen(x) >= y.gain - pen(y) + TF.SOFT_PENALTY - 1e-9); });
  assert.ok(bestWithout);
  // trejd sa njim gubi kaznu u rangu
  const withSoft = marked.find(x => x.soft);
  assert.ok(Math.abs(withSoft.s - (withSoft.gain - TF.SOFT_PENALTY - TF.SIZE_PEN * Math.max(0, withSoft.n - 2))) < 1e-9);
  // ako je kazna ogromna, nijedan trejd sa njim nije ispred trejda bez njega
  const huge = { ...inp, TF: { ...TF, SOFT_PENALTY: 99 } };
  const top = E.search(huge).list.slice(0, 5);
  assert.ok(top.every(x => !x.soft) || top.filter(x => !x.soft).length === top.length);
});

test('Konsolidacija daje samo trejdove gde dajem više igrača, Dubina obrnuto', () => {
  const inp = base({ mine: bigTeam(1, 8, 1), theirs: bigTeam(100, 8, 6), limits: TF.SLIDERS.map(k => TF.LIMITS[k]) });
  const cons = E.search({ ...inp, strategy: 'cons' }).list;
  assert.ok(cons.length > 0 && cons.every(x => x.g.length > x.r.length));
  const depth = E.search({ ...inp, strategy: 'depth' }).list;
  assert.ok(depth.length > 0 && depth.every(x => x.r.length > x.g.length));
});

test('Generiši novih 8: 8 kartica po strani, sledećih 8 bez ponavljanja', () => {
  assert.strictEqual(TF.PER_PAGE, 8);
  const inp = base({ mine: bigTeam(1, 10, 1), theirs: bigTeam(100, 10, 2), limits: TF.SLIDERS.map(k => TF.LIMITS[k]) });
  const list = E.search(inp).list;
  assert.ok(list.length >= 16, `samo ${list.length}`);
  const a = E.pageItems(list, 0, TF.PER_PAGE), b = E.pageItems(list, 1, TF.PER_PAGE);
  assert.strictEqual(a.length, 8);
  const key = x => `${x.g.join()}|${x.r.join()}`;
  assert.strictEqual(new Set([...a, ...b].map(key)).size, 16);
});

test('tržišna vrednost: Nembhard (31 min, 15 PTS, 7 AST, 70%) vredi znatno iznad nule iako mu je z-score nizak', () => {
  const rows = Array.from({ length: 260 }, (_, i) => ({ id: i + 1, gen: 6 - i * 0.045, prod: 46 - i * 0.14, min: 36 - i * 0.06, own: Math.max(0.5, 100 - i * 0.42), rank: i + 1 }));
  const nem = { id: 999, gen: -3.8, prod: 15 + 1.2 * 3.5 + 1.5 * 7, min: 31, own: 70, rank: 70 };
  const weak = { id: 998, gen: -3.8, prod: 12, min: 18, own: 8, rank: 230 }; // isti z-score, mala uloga
  const mk = tfMarket([...rows, nem, weak], { W: TF.MARKET, poolN: 156, teams: 12, zMin: TF.MARKET_Z_MIN });
  const vN = mk.score.get(999) - mk.repl, vW = mk.score.get(998) - mk.repl;
  assert.ok(vN > 0.25 * mk.S, `Nembhard ${vN.toFixed(2)}, S ${mk.S.toFixed(2)}`);
  assert.ok(vW < 0, `slab igrač ${vW.toFixed(2)} (negativna vrednost ostaje negativna)`);
});

test('otpuštanje: vlasništvo 50% ili više se ne otpušta; neravnomeran trejd bez legitimnog otpuštanja se ne predlaže', () => {
  const mk = drop => base({ mine: bigTeam(1, 9, 1).map(x => ({ ...x, drop })), theirs: bigTeam(100, 9, 4).map(x => ({ ...x, drop })), limits: TF.SLIDERS.map(k => TF.LIMITS[k]) });
  const none = E.search(mk(false)).list;
  assert.ok(none.length > 0 && none.every(x => x.g.length === x.r.length && !x.md.length && !x.od.length));
  const inp = mk(false); inp.mine[0].drop = true; inp.theirs[0].drop = true;
  const some = E.search({ ...inp, strategy: 'depth' }).list;
  assert.ok(some.length > 0, 'nema neravnomernih trejdova kad postoji legitimno otpuštanje');
  for (const x of some) { assert.ok(x.md.every(id => id === 1)); assert.ok(x.od.every(id => id === 100)); }
});

test('najbolji igrač: Najbolje za mene ne daje Flagga za tri srednja igrača, Dubina može', () => {
  const junk = (id) => pl(id, 0.5, { PTS: 3, REB: 1, AST: 0.5, TO: 0.5, FGM: 1.2, FGA: 3 }, { drop: true });
  const inp = base({
    mine: [pl(1, 30, { PTS: 28, REB: 8, AST: 5, TO: 3, FGM: 10, FGA: 20 }, { mark: 'trade' }), pl(2, 6, { PTS: 10, REB: 4, AST: 2, TO: 1, FGM: 4, FGA: 9 }), junk(3), junk(4)],
    theirs: [10, 11, 12].map(id => pl(id, 10, { PTS: 14, REB: 5, AST: 2.5, TO: 1.2, FGM: 5.5, FGA: 12 })).concat([pl(13, 6, { PTS: 10, REB: 4, AST: 2, TO: 1, FGM: 4, FGA: 9 }), junk(14), junk(15)]),
    fa: [pl(900, 0.5, { PTS: 8, REB: 4, AST: 2, TO: 1, FGM: 3, FGA: 6.5 }), pl(901, 0.4, { PTS: 8, REB: 4, AST: 2, TO: 1, FGM: 3, FGA: 6.5 })],
    limits: TF.SLIDERS.map(k => TF.LIMITS[k]),
  });
  const three = x => x.g.includes(1) && [10, 11, 12].every(id => x.r.includes(id));
  const best = E.search(inp).list;
  assert.ok(!best.some(three), 'Najbolje za mene predlaže Flagga za tri srednja');
  for (const x of best) assert.ok(Math.max(...x.r.map(id => inp.theirs.find(y => y.id === id).v)) >= 30 * (1 - TF.TOP_TOL) - 1e-9);
  const depth = E.search({ ...inp, strategy: 'depth' }).list;
  assert.ok(depth.some(three), 'Dubina ne nalazi Flagga za tri srednja');
});

test('broj igrača: razlika najviše 1, a u Konsolidaciji i Dubini do 2', () => {
  const mk = st => E.search(base({ mine: bigTeam(1, 10, 1).map(x => ({ ...x, drop: true })), theirs: bigTeam(100, 10, 6).map(x => ({ ...x, drop: true })), limits: TF.SLIDERS.map(k => TF.LIMITS[k]), strategy: st })).list;
  for (const st of ['best', 'sell', 'buy']) assert.ok(mk(st).every(x => Math.abs(x.g.length - x.r.length) <= 1), st);
  const cons = mk('cons'), depth = mk('depth');
  assert.ok(cons.length && cons.every(x => x.g.length > x.r.length && x.g.length - x.r.length <= 2));
  assert.ok(depth.length && depth.every(x => x.r.length > x.g.length && x.r.length - x.g.length <= 2));
  assert.ok([...cons, ...depth].some(x => Math.abs(x.g.length - x.r.length) === 2), 'nema nijednog trejda sa razlikom 2');
});

test('kazna za veličinu: kod iste koristi manji trejd ima prednost', () => {
  const inp = base({ mine: bigTeam(1, 10, 1).map(x => ({ ...x, drop: true })), theirs: bigTeam(100, 10, 6).map(x => ({ ...x, drop: true })), limits: TF.SLIDERS.map(k => TF.LIMITS[k]) });
  const list = E.search(inp).list;
  assert.ok(list.length > 0);
  for (const x of list) assert.ok(Math.abs(x.gain - x.s - TF.SIZE_PEN * Math.max(0, x.g.length + x.r.length - 2)) < 1e-9);
  const small = { s: 0.5 - TF.SIZE_PEN * 0, ob: 0, n: 2 }, big = { s: 0.5 - TF.SIZE_PEN * 6, ob: 0, n: 8 };
  assert.deepStrictEqual([big, small].sort(E.cmpRank)[0], small);
  // Konsolidacija gleda veću stranu: 2:1 bez kazne, 3:2 manje od 4:3
  const cons = E.search({ ...inp, strategy: 'cons' }).list;
  for (const x of cons) assert.ok(Math.abs(x.gain - x.s - TF.SIZE_PEN_WIDE * 3 * Math.max(0, Math.max(x.g.length, x.r.length) - 2)) < 1e-9);
});

test('kazna za veličinu: dobar 1:1 ispred 4:4 sa malo većom koristi; Konsolidacija i Dubina sa starom kaznom', () => {
  const one = { s: 0.25 - TF.SIZE_PEN * 0, ob: 0, n: 2 }, four = { s: 0.9 - TF.SIZE_PEN * 6, ob: 0, n: 8 };
  assert.deepStrictEqual([four, one].sort(E.cmpRank)[0], one); // 1:1 +0,25 ispred 4:4 +0,90
  assert.deepStrictEqual([TF.SIZE_PEN, TF.SIZE_PEN_PTS, TF.SIZE_PEN_WIDE, TF.SIZE_PEN_WIDE_PTS], [0.13, 1.3, 0.07, 0.7]);
  // tržišna vrednost: vlasništvo meri koliko je igrač poznat, pa ima manju težinu od opšte vrednosti
  assert.ok(TF.MARKET.OWN <= 0.10 && TF.MARKET.GEN > TF.MARKET.OWN * 4);
  assert.ok(Math.abs(Object.values(TF.MARKET).reduce((a, b) => a + b, 0) - 1) < 1e-9);
});

test('Najbolje za mene ne prikazuje predlog sa rezultatom 4:5, Popravi kategorije može', () => {
  // liga: korist = očekivane pobede; rezultat kartice = moj tim pre i posle
  const opps = [vec({ PTS: 60, REB: 30, AST: 14, TO: 8, FGM: 24, FGA: 52 }), vec({ PTS: 70, REB: 22, AST: 18, TO: 9, FGM: 27, FGA: 58 })];
  const mk = st => base({ mine: bigTeam(1, 9, 1).map(x => ({ ...x, drop: true })), theirs: bigTeam(100, 9, 3).map(x => ({ ...x, drop: true })), opps,
    limits: TF.SLIDERS.map(k => TF.LIMITS[k]), strategy: st, focus: [], w: st === 'cats' ? [1, 6, 1, 1, 1] : null });
  const result = (inp, x) => {
    const byId = id => [...inp.mine, ...inp.theirs].find(y => y.id === id);
    const before = new Float64Array(KEYS.length); inp.mine.forEach(y => y.vec.forEach((v, i) => { before[i] += v; }));
    const after = Float64Array.from(before);
    x.g.forEach(id => byId(id).vec.forEach((v, i) => { after[i] -= v; })); x.r.forEach(id => byId(id).vec.forEach((v, i) => { after[i] += v; }));
    x.md.forEach(id => byId(id).vec.forEach((v, i) => { after[i] -= v; })); inp.fa.slice(0, x.mf).forEach(f => f.vec.forEach((v, i) => { after[i] += v; }));
    return E.sideResult(before, after, cats, inp.myIdx, TF.TIE);
  };
  const bi = mk('best'), best = E.search(bi).list;
  assert.ok(best.length > 0);
  for (const x of best) { const r = result(bi, x); assert.ok(r.win >= r.lose, `${r.win}:${r.lose}`); }
  const ci = mk('cats'), cl = E.search(ci).list;
  assert.ok(cl.some(x => { const r = result(ci, x); return r.win < r.lose; }), 'Popravi kategorije nema nijedan predlog sa gorim rezultatom');
});

test('savet za veto lige: samo kad postoji igrač na granici rostera', () => {
  const side = [{ id: 1, t: 2, v: 5, own: 90 }, { id: 2, t: -3, v: -4, own: 30 }, { id: 3, t: -4, v: -6, own: 60 }, { id: 4, t: -5, v: -8, own: 20, mark: 'lock' }, { id: 5, t: -6, v: -9, own: 10, ir: true }];
  assert.strictEqual(tfVetoPick(side, new Set(), -1, 50).id, 2);
  assert.strictEqual(tfVetoPick(side, new Set([2]), -1, 50), null);
  assert.strictEqual(tfVetoPick(side, new Set(), -5, 50), null); // niko nije slabiji od najboljeg slobodnog (po tržišnoj vrednosti)
});

test('savet za veto: ne kad je igrač za dopunu iznad nivoa zamene; najviše 3 od 8 kartica', () => {
  // ispod granice otpuštanja po opštoj vrednosti, ali tržišna vrednost iznad nivoa zamene: nema saveta
  assert.strictEqual(tfVetoPick([{ id: 7, t: -3, v: 2, own: 30 }], new Set(), 5, 50), null);
  assert.strictEqual(tfVetoPick([{ id: 7, t: -3, v: 0, own: 30 }], new Set(), 5, 50), null);
  assert.strictEqual(tfVetoPick([{ id: 7, t: -3, v: -0.5, own: 30 }], new Set(), 5, 50).id, 7);
  assert.strictEqual(tfVetoPick([{ id: 7, t: -9, v: -0.5, own: 30 }], new Set(), -1, 50), null); // vredniji od najboljeg slobodnog: nije dopuna
  // 8 kartica, savet moguć na 6: prikazuje se na 3 sa najnižom vrednošću igrača za dopunu
  const picks = [{ v: -1 }, null, { v: -9 }, { v: -3 }, null, { v: -7 }, { v: -2 }, { v: -8 }];
  const shown = tfVetoShown(picks, TF.VETO_MAX);
  assert.strictEqual(TF.VETO_MAX, 3);
  assert.deepStrictEqual([...shown].sort(), [2, 5, 7]);
  assert.strictEqual(tfVetoShown([null, null], 3).size, 0);
});

test('Otvori u analizi: otpuštanja i slobodno mesto preneti, rezultat isti kao na kartici (kategorije i poeni)', () => {
  // analiza trejda: Daješ = moji igrači + moja otpuštanja, Dobijaš = njegovi igrači + moje slobodno mesto (najbolji slobodan ili nivo zamene);
  // kategorije: zbir Dobijaš − Daješ (nerešeno ispod 0.05), procenti po promeni mog tima; poeni: razlika FPts
  const analysis = (inp, x) => {
    const byId = id => [...inp.mine, ...inp.theirs].find(y => y.id === id);
    const sum = list => { const o = new Float64Array(KEYS.length); list.forEach(v => v.forEach((a, i) => { o[i] += a; })); return o; };
    const give = sum([...x.g, ...x.md].map(id => byId(id).vec)), get = sum([...x.r.map(id => byId(id).vec), ...inp.fa.slice(0, x.mf).map(f => f.vec)]);
    const before = sum(inp.mine.map(y => y.vec)), after = Float64Array.from(before);
    get.forEach((v, i) => { after[i] += v; }); give.forEach((v, i) => { after[i] -= v; });
    if (inp.pts) return +(get[inp.fIdx] - give[inp.fIdx]).toFixed(1);
    let win = 0, lose = 0;
    for (const i of inp.myIdx) {
      const c = cats[i];
      const d = c.pct ? after[c.m] / after[c.a] - before[c.m] / before[c.a] : get[c.k] - give[c.k];
      if (Math.abs(d) < (c.pct ? TF.TIE.pct : TF.TIE.count)) continue;
      if (c.low ? d < 0 : d > 0) win++; else lose++;
    }
    return `${win}:${lose}`;
  };
  const card = (inp, x) => {
    const byId = id => [...inp.mine, ...inp.theirs].find(y => y.id === id);
    const before = new Float64Array(KEYS.length); inp.mine.forEach(y => y.vec.forEach((v, i) => { before[i] += v; }));
    const after = Float64Array.from(before);
    x.g.forEach(id => byId(id).vec.forEach((v, i) => { after[i] -= v; })); x.r.forEach(id => byId(id).vec.forEach((v, i) => { after[i] += v; }));
    x.md.forEach(id => byId(id).vec.forEach((v, i) => { after[i] -= v; })); inp.fa.slice(0, x.mf).forEach(f => f.vec.forEach((v, i) => { after[i] += v; }));
    if (inp.pts) return +(after[inp.fIdx] - before[inp.fIdx]).toFixed(1);
    const r = E.sideResult(before, after, cats, inp.myIdx, TF.TIE); return `${r.win}:${r.lose}`;
  };
  const withF = (list, f) => list.map(x => ({ ...x, drop: true, vec: x.vec.map((v, i) => (i === 6 ? f(x.vec) : v)) }));
  const fp = v => v[0] + 1.2 * v[1] + 1.5 * v[2] - v[3];
  // poeni: mali rosteri sa FPts u skladu sa vrednošću (2 za 1 i 1 za 2 prolaze)
  const P = (id, v, f) => ({ ...pl(id, v, { PTS: f * 0.6, REB: f * 0.15, AST: f * 0.1, FGM: f * 0.2, FGA: f * 0.42, FPTS: f }), drop: true });
  for (const strategy of ['best', 'cons', 'depth']) {
    const inp = base({ pts: true, mine: [P(1, 10, 40), P(2, 6, 26), P(3, 4.5, 21), P(4, 0.5, 9), P(5, 3, 17)], theirs: [P(20, 7, 31), P(21, 5, 23), P(22, 9.6, 39), P(23, 0.4, 8), P(24, 3.2, 18)],
      fa: [P(900, 0.3, 10), P(901, 0.2, 9)], limits: TF.SLIDERS.map(k => TF.LIMITS[k]), strategy });
    const list = E.search(inp).list.slice(0, 8);
    for (const x of list) assert.strictEqual(analysis(inp, x), card(inp, x), `poeni ${strategy} ${x.shape}`);
    if (strategy !== 'best') assert.ok(list.some(x => x.g.length !== x.r.length && (x.md.length || x.mf)), `poeni ${strategy}: nema neravnomernog trejda`);
  }
  for (const pts of [false]) {
    for (const strategy of ['best', 'cons', 'depth']) {
      const inp = base({ pts, mine: withF(bigTeam(1, 9, 1), fp), theirs: withF(bigTeam(100, 9, 5), v => fp(v) * (pts ? 1.15 : 1)), fa: withF(base({}).fa, fp), limits: TF.SLIDERS.map(k => TF.LIMITS[k]), strategy });
      const list = E.search(inp).list.slice(0, 8);
      assert.ok(list.length > 0, `${pts} ${strategy}`);
      if (strategy !== 'best') assert.ok(list.some(x => x.g.length !== x.r.length && (x.md.length || x.mf)), 'nema neravnomernog trejda sa otpuštanjem ili slobodnim mestom');
      for (const x of list) assert.strictEqual(analysis(inp, x), card(inp, x), `${pts ? 'poeni' : 'kategorije'} ${strategy} ${x.shape}`);
    }
  }
});

test('otpuštanje po tržišnoj vrednosti: igrač vredniji od najboljeg slobodnog se ne otpušta (Brooks)', () => {
  // Brooks: nisko vlasništvo (30%), ali tržišna vrednost veća od najboljeg slobodnog igrača -> nije otpustiv, ni kad mu je opšta vrednost (z-score) niska
  const bestFa = 4, brooks = { id: 1, v: 9, t: -2, own: 30 }, weak = { id: 2, v: 1, t: 0.5, own: 20 };
  assert.strictEqual(tfDropOk(brooks, bestFa, 50), false);
  assert.strictEqual(tfDropOk(weak, bestFa, 50), true);           // slabiji od slobodnog po tržišnoj vrednosti, iako mu je opšta vrednost veća
  assert.strictEqual(tfDropOk({ ...weak, own: 50 }, bestFa, 50), false);
  assert.strictEqual(tfDropOk({ ...weak, mark: 'lock' }, bestFa, 50), false);
  assert.strictEqual(tfDropOk({ ...weak, ir: true }, bestFa, 50), false);
  // kroz pretragu: igrač koji nije otpustiv se nikad ne pojavljuje u otpuštanjima (moja i protivnikova)
  const mine = bigTeam(1, 9, 1).map(x => ({ ...x, drop: tfDropOk({ ...x, own: 30 }, 4, 50) })), theirs = bigTeam(100, 9, 5).map(x => ({ ...x, drop: tfDropOk({ ...x, own: 30 }, 4, 50) }));
  const ban = new Set([...mine, ...theirs].filter(x => !x.drop).map(x => x.id));
  for (const strategy of ['best', 'depth', 'cons']) {
    const list = E.search(base({ mine, theirs, limits: TF.SLIDERS.map(k => TF.LIMITS[k]), strategy })).list;
    for (const x of list) for (const id of [...x.md, ...x.od]) assert.ok(!ban.has(id), `${strategy}: otpušten ${id}`);
  }
});

test('"Ne otpuštam nikoga": nema predloga gde dobijam više igrača nego što dajem', () => {
  const mk = (strategy, noDrop) => base({ mine: bigTeam(1, 9, 1).map(x => ({ ...x, drop: true })), theirs: bigTeam(100, 9, 5).map(x => ({ ...x, drop: true })), limits: TF.SLIDERS.map(k => TF.LIMITS[k]), strategy, noDrop });
  const off = E.search(mk('best', false)).list;
  assert.ok(off.some(x => x.r.length > x.g.length), 'bez prekidača ima i trejdova gde dobijam više');
  for (const strategy of ['best', 'cons', 'cats']) {
    const on = E.search(mk(strategy, true)).list;
    assert.ok(on.every(x => x.r.length <= x.g.length && !x.md.length), strategy);
  }
  assert.ok(E.search(mk('best', true)).list.length > 0);
  assert.strictEqual(E.search(mk('depth', true)).list.length, 0); // Dubina uvek dobija više igrača
});

test('Najbolje za mene: najviše 2 od 8 predloga sa više dobijenih igrača; Dubina bez ograničenja', () => {
  const mk = strategy => base({ mine: bigTeam(1, 9, 1).map(x => ({ ...x, drop: true })), theirs: bigTeam(100, 9, 5).map(x => ({ ...x, drop: true })), limits: TF.SLIDERS.map(k => TF.LIMITS[k]), strategy });
  const more = x => x.r.length > x.g.length;
  for (const strategy of ['best', 'cats']) {
    const L = E.search(mk(strategy)).list, others = L.filter(x => !more(x)).length;
    assert.ok(L.some(more), strategy + ': ima trejdova gde dobijam više');
    for (let p = 0; (p + 1) * 8 <= others; p++) assert.ok(E.pageItems(L, p, 8).filter(more).length <= TF.GET_MORE_MAX, `${strategy} strana ${p + 1}`);
  }
  const D = E.search(mk('depth')).list;
  assert.ok(E.pageItems(D, 0, 8).filter(more).length > TF.GET_MORE_MAX); // Dubina: sve dobija više
});

test('ograničenje: rang se čuva, a kad ostalih nema dovoljno, 8 mesta se popunjava', () => {
  const T = (id, kG, kR) => ({ id, g: Array(kG).fill(0), r: Array(kR).fill(0) });
  // rang: 5 sa više dobijenih na vrhu, pa 4 ostala
  const L = [T(1, 1, 2), T(2, 1, 2), T(3, 2, 3), T(4, 1, 2), T(5, 1, 2), T(6, 2, 2), T(7, 1, 1), T(8, 3, 2), T(9, 2, 2)];
  const out = E.capGetMore(L, 8, 2), ids = out.map(x => x.id);
  assert.deepStrictEqual(ids.slice(0, 8), [1, 2, 6, 7, 8, 9, 3, 4]); // 2 najbolja, pa svi ostali, pa popuna po rangu
  assert.deepStrictEqual(ids.slice(8), [5]);
  assert.strictEqual(out.length, L.length);
  // dovoljno ostalih: tačno 2 po stranici
  const L2 = [...Array(6)].map((_, i) => T(i, 1, 2)).concat([...Array(14)].map((_, i) => T(100 + i, 2, 2)));
  const o2 = E.capGetMore(L2, 8, 2);
  assert.strictEqual(o2.slice(0, 8).filter(x => x.r.length > x.g.length).length, 2);
  assert.strictEqual(o2.slice(8, 16).filter(x => x.r.length > x.g.length).length, 2);
});

// ja dajem 1 i 2 (6 + 4), dobijam 20; protivnik mora da otpusti 21 (jedini koga sme), moje slobodno mesto vredi sv
const convInp = (strategy, xv, rv, sv) => base({ strategy, limits: [TF.LIMITS.fair],
  fa: [pl(900, sv, { PTS: 5, REB: 2, AST: 1, TO: 1, FGM: 2, FGA: 4.5 }), pl(901, sv, { PTS: 5, REB: 2, AST: 1, TO: 1, FGM: 2, FGA: 4.5 })],
  mine: [pl(1, 6, { PTS: 10, REB: 2, AST: 4, TO: 2, FGM: 4, FGA: 9 }, { mark: 'trade' }), pl(2, 4, { PTS: 8, REB: 2, AST: 3, TO: 1.5, FGM: 3, FGA: 7 }, { mark: 'trade' }), pl(3, 30, { PTS: 30 }, { mark: 'lock' })],
  theirs: [pl(20, rv, { PTS: 14, REB: 6, AST: 3, TO: 1, FGM: 6, FGA: 12 }, { drop: false, mark: 'trade' }), pl(21, xv, { PTS: 2, REB: 1, AST: 0.5, TO: 0.5, FGM: 1, FGA: 2 }, { drop: true }), pl(22, 40, { PTS: 30 }, { mark: 'lock' })] });

test('otpušteni igrač vredniji od moje zamene sa waivera ulazi u trejd: 2:1 postaje 2:2, bez slobodnog mesta, prikazan jednom', () => {
  const res = E.search(convInp('best', 1.5, 8, 1)); // 21 vredi 1.5, moja zamena 1
  assert.strictEqual(res.list.length, 1); // originalni 2:1 i isti 2:2 iz obične pretrage se ne prikazuju dvaput
  const x = res.list[0];
  assert.deepStrictEqual([x.g, x.r, x.od, x.mf, x.conv], [[1, 2], [20, 21], [], 0, true]);
  // igrač slabiji od zamene se i dalje otpušta (nema pretvaranja)
  const low = E.search(convInp('best', 0.5, 8, 1)).list;
  assert.ok(low.some(y => y.r.join() === '20' && y.od.join() === '21' && y.mf === 1 && !y.conv));
});

test('pretvoreni trejd koji ne prolazi pravila se ne prikazuje; ostaje originalni', () => {
  // fer granica: 2:2 bi bio 5 + 3 za 10 (20%), originalni 2:1 prolazi (5 + 2 za 10 − 3)
  const a = E.search(convInp('best', 3, 5, 2)).list;
  assert.deepStrictEqual(a.map(x => [x.r.join(), x.od.join(), !!x.conv]), [['20', '21', false]]);
  // Konsolidacija: posle pretvaranja ne bih davao više igrača -> ostaje 2:1
  const c = E.search(convInp('cons', 1.5, 8, 1)).list;
  assert.deepStrictEqual(c.map(x => [x.r.join(), x.od.join(), !!x.conv]), [['20', '21', false]]);
});

test('isti trejd se ne pojavljuje dvaput, ni posle pretvaranja', () => {
  for (const strategy of ['best', 'cons', 'depth', 'cats']) {
    const inp = base({ mine: bigTeam(1, 9, 1).map(x => ({ ...x, drop: true })), theirs: bigTeam(100, 9, 5).map(x => ({ ...x, drop: true })), limits: TF.SLIDERS.map(k => TF.LIMITS[k]), strategy });
    const L = E.search(inp).list, keys = L.map(x => `${[...x.g].sort()}|${[...x.r].sort()}`);
    assert.strictEqual(new Set(keys).size, keys.length, strategy);
    for (const x of L) { // pretvoreni trejd i dalje odgovara strategiji
      if (strategy === 'cons') assert.ok(x.g.length > x.r.length);
      if (strategy === 'depth') assert.ok(x.r.length > x.g.length);
    }
  }
});

test('slobodno mesto: prosek 3. do 5. zdravog slobodnog igrača, waiver sa umanjenjem', () => {
  const F = (id, v, waiver = false) => ({ id, v, vec: [v * 2, v], waiver });
  const fas = [F(1, 40), F(2, 20), F(3, 10), F(4, 8, true), F(5, 6), F(6, 1)];
  const s = tfSlotValue(fas, TF.SLOT_FROM, TF.SLOT_TO, TF.SLOT_WAIVER);
  assert.ok(Math.abs(s.v - (10 + 8 * 0.8 + 6) / 3) < 1e-9);       // ne najbolji (40), nego 3. do 5.
  assert.deepStrictEqual(s.picks.map(x => [x.id, x.w]), [[3, 1], [4, 0.8], [5, 1]]);
  assert.ok(Math.abs(s.vec[0] - (20 + 16 * 0.8 + 12) / 3) < 1e-9); // i statistika sa umanjenjem
  assert.strictEqual(tfSlotValue(fas.slice(0, 2), 3, 5, 0.8), null);  // premalo slobodnih: nivo zamene
  assert.strictEqual(tfSlotValue(fas.slice(0, 4), 3, 5, 1).picks.length, 2);
  assert.ok(tfSlotValue([F(1, 3), F(2, 2), F(3, -2, true)], 3, 3, 0.8).v < -2); // negativna vrednost na waiveru još manja
  assert.deepStrictEqual([TF.SLOT_FROM, TF.SLOT_TO, TF.SLOT_WAIVER], [3, 5, 0.8]);
});

test('strana od 8: raznovrsnost i najviše 2 sa više dobijenih igrača važe zajedno', () => {
  // rang: na vrhu mnogo trejdova sa istim glavnim igračem (1) i trejdovi gde dobijam više
  const T = (i, top, kG, kR) => ({ core: `c${i}`, top, rtop: 100 + i, shape: `${kG}:${kR}`, g: Array(kG).fill(0), r: Array(kR).fill(0) });
  const L = [T(0, 1, 1, 2), T(1, 1, 1, 2), T(2, 1, 1, 2), T(3, 1, 1, 1), T(4, 1, 1, 1), T(5, 1, 2, 2), T(6, 1, 2, 2)];
  for (let i = 7; i < 30; i++) L.push(T(i, i, (i % 3) + 1, (i % 3) + 1));
  const out = E.paginate(L, 8, 3, 2);
  for (let p = 0; p * 8 < out.length; p++) {
    const pg = out.slice(p * 8, p * 8 + 8);
    if (pg.length < 8) break;
    assert.ok(pg.filter(x => x.top === 1).length <= 3, `strana ${p + 1}: isti glavni igrač`);
    assert.ok(pg.filter(x => x.r.length > x.g.length).length <= 2, `strana ${p + 1}: više dobijenih`);
  }
  assert.strictEqual(new Set(out.map(x => x.core)).size, L.length); // niko ne nestaje
});

test('Sačuvaj ne duplira tab; Otvori u analizi za sačuvan trejd nalazi postojeći tab', () => {
  const tabs = [{ id: 'a', teams: [{ ids: [1] }, { ids: [9] }] }];
  const save = (g, r, saved) => { let tb = tfTabFor(tabs, g, r, saved); if (!tb) { tb = { id: `t${tabs.length}`, teams: [{ ids: g }, { ids: r }] }; tabs.push(tb); } return tb.id; };
  const id = save([2, 3], [10]);
  assert.strictEqual(save([3, 2], [10], id), id);     // drugi put: isti tab
  assert.strictEqual(save([2, 3], [10]), id);         // i bez zapamćenog id-a: isti igrači = isti tab
  assert.strictEqual(tabs.length, 2);
  assert.strictEqual(tfTabFor(tabs, [2, 3], [10], id).id, id);  // Otvori u analizi: postojeći tab
  assert.strictEqual(tfTabFor(tabs, [2], [10], null), null);    // drugi trejd: nov tab
});

test('bliže fer prvo: veće odstupanje tek kad fer opcija nema dovoljno', () => {
  const mk = (tier, s) => ({ tier, s, ob: 0, n: 2 });
  const many = Array.from({ length: 12 }, (_, i) => mk(0, 1 - i * 0.01));
  const out = E.orderTiers([many, [mk(1, 5)]], 10, 100);
  assert.ok(out.every(x => x.tier === 0)); // ima dovoljno fer trejdova
  const few = E.orderTiers([[mk(0, 1)], [mk(1, 5)]], 10, 100);
  assert.deepStrictEqual(few.map(x => x.tier), [0, 1]);
});

test('poenska liga: rangiranje po FPts po utakmici, protivnik ne sme mnogo da izgubi', () => {
  const P = (id, v, f, extra) => pl(id, v, { FPTS: f }, extra);
  const inp = base({ pts: true, mine: [P(1, 10, 40), P(2, 6, 25), P(3, 2, 15)], theirs: [P(20, 9.5, 42), P(21, 6, 30), P(22, 2, 14)], limits: TF.SLIDERS.map(k => TF.LIMITS[k]) });
  const list = E.search(inp).list;
  assert.ok(list.length > 0);
  for (let i = 1; i < list.length; i++) if (list[i].tier === list[i - 1].tier) assert.ok(list[i - 1].s >= list[i].s - 1e-9);
  assert.ok(list.every(x => x.ob >= -TF.PTS_MAX_LOSS - 1e-9));
  assert.ok(list.every(x => x.gain > TF.MIN_GAIN_PTS));
});

test('Prodaj skupo i Kupi jeftino: samo trejdovi sa takvim igračima', () => {
  const inp = base({ mine: bigTeam(1, 8, 1), theirs: bigTeam(100, 8, 2), limits: TF.SLIDERS.map(k => TF.LIMITS[k]) });
  const sell = E.search({ ...inp, strategy: 'sell', sell: [3] }).list;
  assert.ok(sell.every(x => x.g.includes(3)));
  const buy = E.search({ ...inp, strategy: 'buy', buy: [104] }).list;
  assert.ok(buy.every(x => x.r.includes(104)));
});

test('motor radi i kao tekst (Web Worker)', () => {
  const inp = base({ mine: bigTeam(1, 7, 1), theirs: bigTeam(100, 7, 3), limits: TF.SLIDERS.map(k => TF.LIMITS[k]) });
  assert.deepStrictEqual(E2.search(inp).list.map(x => x.g.join() + '|' + x.r.join()), E.search(inp).list.map(x => x.g.join() + '|' + x.r.join()));
});

test('brzina: 13 na 13 igrača bez oznaka', () => {
  const opps = Array.from({ length: 10 }, (_, i) => vec({ PTS: 100 + i * 2, REB: 40 + i, AST: 20 + (i % 4), TO: 12 + (i % 3), FGM: 40 + i * 0.5, FGA: 86 + i }));
  const inp = base({ mine: bigTeam(1, 13, 1), theirs: bigTeam(100, 13, 4), opps, limits: [TF.LIMITS.fair] });
  const t0 = Date.now(); const r = E.search(inp); const ms = Date.now() - t0;
  console.log(`    13 na 13: ${ms} ms, parova posle odsecanja ${r.stats.pairs}, prošlo vrednost ${r.stats.value}, kategorije ${r.stats.cats}, korist ${r.stats.gain}`);
  assert.ok(ms < 5000);
});

test('strana od 8: najviše 2 gde dajem više i najviše 2 gde dobijam više, zajedno; bez dovoljno ravnomernih popunjava se po rangu', () => {
  const T = (i, kG, kR) => ({ core: `c${i}`, top: i, rtop: 100 + i, shape: `${kG}:${kR}`, g: Array(kG).fill(0), r: Array(kR).fill(0) });
  // rang: na vrhu 5 gde dajem više i 4 gde dobijam više, pa ravnomerni
  const L = [T(0, 2, 1), T(1, 3, 2), T(2, 2, 1), T(3, 1, 2), T(4, 2, 1), T(5, 1, 2), T(6, 3, 2), T(7, 1, 2), T(8, 1, 2)];
  for (let i = 9; i < 25; i++) L.push(T(i, (i % 2) + 1, (i % 2) + 1));
  const out = E.paginate(L, 8, 3, 2, Infinity, 2);
  const less = x => x.g.length > x.r.length, more = x => x.r.length > x.g.length;
  for (let p = 0; (p + 1) * 8 <= out.length - 9; p++) { const pg = out.slice(p * 8, p * 8 + 8); assert.ok(pg.filter(less).length <= 2 && pg.filter(more).length <= 2, `strana ${p + 1}`); }
  assert.deepStrictEqual(out.slice(0, 2).map(x => x.core), ['c0', 'c1']); // rang se čuva
  assert.strictEqual(new Set(out.map(x => x.core)).size, L.length);    // niko ne nestaje
  // samo neravnomerni: strana se ipak popunjava po rangu
  const U = [T(0, 2, 1), T(1, 3, 2), T(2, 2, 1), T(3, 1, 2), T(4, 2, 1), T(5, 1, 2), T(6, 3, 2), T(7, 1, 2)];
  assert.strictEqual(E.paginate(U, 8, 3, 2, Infinity, 2).slice(0, 8).length, 8);
  assert.strictEqual(TF.GIVE_MORE_MAX, 2);
});

test('motor: najviše 2 od 8 gde dajem više u Najbolje za mene; Konsolidacija bez ograničenja', () => {
  const mk = strategy => base({ mine: bigTeam(1, 9, 1).map(x => ({ ...x, drop: true })), theirs: bigTeam(100, 9, 5).map(x => ({ ...x, drop: true })), limits: TF.SLIDERS.map(k => TF.LIMITS[k]), strategy });
  const less = x => x.g.length > x.r.length;
  const L = E.search(mk('best')).list, even = L.filter(x => x.g.length === x.r.length).length;
  for (let p = 0; (p + 1) * 8 <= even; p++) assert.ok(E.pageItems(L, p, 8).filter(less).length <= TF.GIVE_MORE_MAX, `strana ${p + 1}`);
  const C = E.search(mk('cons')).list;
  assert.ok(E.pageItems(C, 0, 8).filter(less).length > TF.GIVE_MORE_MAX); // Konsolidacija: sve daje više
});

test('Trejd kandidat se ne otpušta: trejd prolazi samo kad pređe na drugu stranu', () => {
  // 21: cena 0.45 ispod moje zamene 0.5, pa se bez oznake otpušta (2:1); kao Trejd kandidat ne sme na waiver, nego prelazi na moju stranu (2:2)
  const plain = E.search(convInp('best', 0.45, 8.2, 0.5)).list;
  assert.ok(plain.some(x => x.od.includes(21) && !x.conv), 'bez oznake: otpust');
  const inp = convInp('best', 0.45, 8.2, 0.5); inp.theirs[1] = { ...inp.theirs[1], tc: true, rv: -5 };
  const L = E.search(inp).list;
  assert.ok(!L.some(x => x.od.includes(21)), 'nema otpusta Trejd kandidata');
  assert.ok(L.length && L.every(x => !x.od.length) && L.some(x => x.r.includes(21)), 'prelazi na moju stranu');
  // pravi kandidat za otpust ide pre Trejd kandidata, najslabiji po stvarnoj vrednosti
  const w = E.weakest([{ i: 0, v: 1, rv: -9, tc: true }, { i: 1, v: 2, rv: 3 }, { i: 2, v: 0, rv: 5 }].sort((a, b) => (a.tc ? 1 : 0) - (b.tc ? 1 : 0) || a.rv - b.rv), new Set(), [], 1);
  assert.deepStrictEqual(w.map(x => x.i), [1]);
});

test('igrač van do kraja sezone se ne predlaže (ni moj ni njegov) bez U trejd; ne prelazi ni pretvaranjem', () => {
  const mk = (gone, mark = null, side = 'theirs') => {
    const T0 = bigTeam(100, 6, 5).map(x => ({ ...x, drop: true })), M0 = bigTeam(1, 6, 1).map(x => ({ ...x, drop: true }));
    const L0 = side === 'theirs' ? T0 : M0; L0[0] = { ...L0[0], v: 0, rv: 0, out: true, gone, mark, tc: true };
    return base({ limits: TF.SLIDERS.map(k => TF.LIMITS[k]), mine: M0, theirs: T0 });
  };
  assert.ok(E.search(mk(false)).list.some(x => x.r.includes(100)), 'povređen sa povratkom: može');
  const L = E.search(mk(true)).list;
  assert.ok(L.length > 0 && !L.some(x => x.r.includes(100)), 'van sezone: nikad među igračima koje dobijam');
  assert.ok(E.search(mk(true, 'trade')).list.every(x => x.r.includes(100)), 'van sezone sa U trejd: može');
  assert.ok(!E.search(mk(true, null, 'mine')).list.some(x => x.g.includes(1)), 'moj van sezone: ne nudi se');
});

test('cena na tržištu: produkcija broji i ukradene lopte, blokade, trojke i izgubljene lopte', () => {
  const a = { PTS: 15, REB: 5, AST: 3 }, b = { ...a, STL: 1, BLK: 1 };
  assert.strictEqual(tfProd(b, TF.PROD_W) - tfProd(a, TF.PROD_W), 4);
  assert.strictEqual(tfProd({ PTS: 10, TPM: 2, TO: 2 }, TF.PROD_W), 10);  // +1 za trojke, −1 za izgubljene lopte
  assert.strictEqual(tfProd({ PTS: 10 }, TF.PROD_W), 10);                 // stavka koje nema = 0
});

test('ocene predloga: ključ bez redosleda, zamena, brisanje istom ocenom, najviše 500', () => {
  assert.strictEqual(tfRateKey('finder', 'L1', [3, 1], [9]), tfRateKey('finder', 'L1', [1, 3], [9]));
  assert.notStrictEqual(tfRateKey('finder', 'L1', [1], [9]), tfRateKey('fa', 'L1', [1], [9]));
  const e = (k, rating) => ({ k, rating, give: [{ id: 1, name: 'A' }], get: [{ id: 2, name: 'B' }], league: { id: 'L1' }, myTeam: 'Tim', opp: 'Protivnik' });
  let r = tfRateApply(null, e('x', 1));
  assert.deepStrictEqual([r.rating, r.all.items.length, r.all.v], [1, 1, 1]);
  r = tfRateApply(r.all, e('x', -1)); assert.deepStrictEqual([r.rating, r.all.items.length, r.all.items[0].rating], [-1, 1, -1]); // nova zamenjuje staru
  r = tfRateApply(r.all, e('x', -1)); assert.deepStrictEqual([r.rating, r.all.items.length], [0, 0]); // ista ocena ponovo briše
  let all = { v: 1, items: [] };
  for (let i = 0; i < 503; i++) all = tfRateApply(all, e(`k${i}`, 1), 500).all;
  assert.strictEqual(all.items.length, 500); assert.strictEqual(all.items[0].k, 'k3'); // najstarija ispada
  assert.ok(!JSON.stringify(all).match(/firstName|lastName|owner/i)); // bez imena menadžera
  assert.strictEqual(JSON.parse(JSON.stringify(all)).v, 1);
});

const DAY = 864e5, NOW = Date.UTC(2026, 10, 24);
test('povratak: ESPN datum, van sezone, vesti, bez procene (6 nedelja); prošao datum = za 3 dana', () => {
  const I = o => tfInjury({ g: 'OUT', now: NOW, T: TF.INJ, ...o });
  assert.strictEqual(tfInjury({ g: 'DTD', now: NOW, T: TF.INJ }), null);
  assert.deepStrictEqual(I({ ret: [2026, 12, 8, 0] }), { gone: false, ret: Date.UTC(2026, 11, 8), src: 'espn' });
  assert.strictEqual(I({ ret: [2027, 1, 1, 1] }).gone, true);
  assert.strictEqual(I({ news: 'He will miss the rest of the season.' }).gone, true);
  assert.strictEqual(I({ ret: [2026, 11, 1, 0] }).ret, NOW + 3 * DAY);
  assert.strictEqual(I({ news: 'Doe is expected to be out two to three weeks.' }).src, 'news');
  assert.strictEqual(I({ news: 'Doe is expected to be out two to three weeks.' }).ret, NOW + 2.5 * 7 * DAY);
  assert.deepStrictEqual([I({}).src, I({}).ret], ['default', NOW + 6 * 7 * DAY]);
  assert.strictEqual(tfNewsWeeks('will be re-evaluated in 10 days'), 10 / 7);
  assert.strictEqual(tfNewsWeeks('out at least a month'), 4.3);
  assert.strictEqual(tfNewsWeeks('scored 30 points'), null);
});

test('povređeni sa povratkom za 2 nedelje vredi (utakmice posle povratka / preostale utakmice) pune vrednosti', () => {
  const dates = Array.from({ length: 60 }, (_, i) => NOW + (i + 1) * 2 * DAY); // 60 utakmica, svaka 2 dana
  const inj = tfInjury({ g: 'OUT', ret: [2026, 12, 8, 0], now: NOW, T: TF.INJ });
  const f = tfInjFrac(inj, dates), after = dates.filter(d => d > inj.ret).length;
  assert.strictEqual(f, after / 60); assert.strictEqual(after, 53);
  assert.strictEqual(tfInjFrac(null, dates), 1);
  assert.strictEqual(tfInjFrac({ gone: true }, dates), 0);
});

test('povratak posle početka plejofa smanjuje vrednost samo za tim koji se bori za plejof', () => {
  const inj = { gone: false, ret: NOW + 100 * DAY }, start = NOW + 90 * DAY;
  assert.strictEqual(tfLate(inj, start, true, TF.INJ), TF.INJ.PLAYOFF_LATE);
  assert.strictEqual(tfLate(inj, start, false, TF.INJ), 1);
  assert.strictEqual(tfLate({ gone: false, ret: NOW + 20 * DAY }, start, true, TF.INJ), 1);
  assert.strictEqual(tfLate(inj, null, true, TF.INJ), 1);
});

// povređeni kod protivnika: 100 (jak, vraća se za 2 nedelje, sme na IR)
const injInp = (o = {}) => {
  const T0 = bigTeam(100, 7, 5).map(x => ({ ...x, drop: true })), M0 = bigTeam(1, 7, 1).map(x => ({ ...x, drop: true }));
  T0[0] = { ...T0[0], out: true, gone: false, wk: o.wk ?? 2, irOk: true, drop: false };
  return base({ limits: TF.SLIDERS.map(k => TF.LIMITS[k]), mine: M0, theirs: T0, myIrFree: 0, thIrFree: 0, sit: null, ...o });
};
test('slobodno IR mesto: povređeni ide na IR i primalac ne otpušta nikoga; bez IR mesta zauzima aktivno mesto', () => {
  const withIr = E.search(injInp({ myIrFree: 1 })).list.filter(x => x.r.includes(100) && x.r.length > x.g.length);
  assert.ok(withIr.length > 0);
  for (const x of withIr) { assert.deepStrictEqual(x.irIn, [100]); assert.strictEqual(x.md.length, Math.max(0, x.r.length - 1 - x.g.length)); }
  const noIr = E.search(injInp({ myIrFree: 0 })).list.filter(x => x.r.includes(100) && x.r.length > x.g.length);
  for (const x of noIr) { assert.deepStrictEqual(x.irIn, []); assert.strictEqual(x.md.length, x.r.length - x.g.length); }
  // 1:1 sa IR mestom: dajem jednog, povređeni na IR -> dobijam i slobodno mesto
  const one = E.search(injInp({ myIrFree: 1 })).list.find(x => x.r.join() === '100' && x.g.length === 1);
  if (one) assert.strictEqual(one.mf, 1);
});

test('protivnik sa više povređenih nego IR mesta: veća šansa (rang) kad daje povređenog', () => {
  const key = x => `${x.g}|${x.r}`;
  const a = E.search(injInp()).list.filter(x => x.r.includes(100)), b = E.search(injInp({ sit: { oppPressure: true } })).list;
  const bm = new Map(b.map(x => [key(x), x]));
  const pair = a.map(x => [x, bm.get(key(x))]).find(([, y]) => y);
  assert.ok(pair, 'isti trejd u obe pretrage');
  assert.ok(Math.abs(pair[1].s - pair[0].s - TF.INJ.B_PRESSURE) < 1e-9);
  assert.strictEqual(pair[1].sit, 'pressure');
});

test('Kupi jeftino: kratka povreda uz moje slobodno IR mesto je predlog i ima jaču prednost; duga povreda nije', () => {
  const short = E.search(injInp({ strategy: 'buy', myIrFree: 1, wk: 2 })).list;
  assert.ok(short.length > 0 && short.every(x => x.r.includes(100) && x.sit === 'myir'));
  assert.strictEqual(E.search(injInp({ strategy: 'buy', myIrFree: 1, wk: 8 })).list.length, 0);
  assert.strictEqual(E.search(injInp({ strategy: 'buy', myIrFree: 0, wk: 2 })).list.length, 0);
  const best = E.search(injInp({ myIrFree: 1, wk: 2 })).list.find(x => x.sit === 'myir');
  assert.ok(best && TF.INJ.B_BUY > TF.INJ.B_MY_IR);
});

console.log(`\n${n} testova prošlo`);
