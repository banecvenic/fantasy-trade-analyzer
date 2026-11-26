// Testovi za Pojačanja sa FA: lista FA igrača, par kao trejd 1 za 1 (zbirovi tima), pravila za otpuštanje, Trejd kandidat,
// ručni izbor sa upozorenjem, prag, mešavina perioda sa malim uzorkom, IR stash, javna lista u usponu, stranice tabele.
// Pokretanje: node tools/test_fa.js
// Izvršava se deo app.js od "Vrednost igrača: čiste funkcije" do "kraj: FA, čiste funkcije" (FA koristi needWeights iz vrednosti).
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const src = fs.readFileSync(path.join(__dirname, '..', 'assets', 'app.js'), 'utf8');
const start = src.indexOf('   Vrednost igrača: čiste funkcije');
const end = src.indexOf('/* ==== kraj: FA, čiste funkcije ==== */');
if (start < 0 || end < 0) throw new Error('Nije nađen FA modul u app.js');
const code = src.slice(src.lastIndexOf('/*', start), end);
const F = new Function(`${code}\nreturn { FA, VALUE, freeAgentIds, blendWeights, blendValue, blendLine, sumLines, swapTotals, expWins, leagueSpread, pairGain, pairScore, canDrop, dropVerdict, faSuggest, tradeCandidates, pageOf, rotationSignals, watchList, irStash, publicRising, startShares };`)();

let n = 0;
const test = (name, fn) => { fn(); n++; console.log(`ok  ${name}`); };
const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

test('FA lista = svi igrači minus rosteri lige (i IR)', () => {
  const all = [1, 2, 3, 4, 5, 6, 7];
  const rosters = [[1, 2], [3], [6 /* IR */]];
  assert.deepStrictEqual(F.freeAgentIds(all, rosters), [4, 5, 7]);
});

test('mešavina perioda: mali uzorak smanjuje težinu perioda, bez podataka period ne postoji', () => {
  const full = F.blendWeights({ proj: 1, l15: 7, l7: 4 });
  near(full.proj, 0.5); near(full.l15, 0.3); near(full.l7, 0.2);
  const small = F.blendWeights({ proj: 1, l15: 3, l7: 1 }); // 3/6 i 1/3 utakmica
  assert.ok(small.l7 < 0.2 && small.l15 < 0.3 && small.proj > 0.5);
  near(small.proj + small.l15 + small.l7, 1);
  const noRecent = F.blendWeights({ proj: 1, l15: 0, l7: 0 });
  assert.deepStrictEqual(Object.keys(noRecent), ['proj']); near(noRecent.proj, 1);
  const v = F.blendValue({ proj: { total: 2, by: { PTS: 2 } }, l15: { total: 0, by: { PTS: 0 } }, l7: null }, { proj: 0.5, l15: 0.5 });
  near(v.total, 1); near(v.by.PTS, 1);
});

test('mešavina sa sezonom: projekcija gubi težinu kako igrač igra, najmanje PROJ_FLOOR', () => {
  const early = F.blendWeights({ proj: 1, season: 2, l15: 2, l7: 1 });
  const mid = F.blendWeights({ proj: 1, season: 15, l15: 7, l7: 4 });
  const late = F.blendWeights({ proj: 1, season: 60, l15: 7, l7: 4 });
  assert.ok(early.proj > 0.5, `rano u sezoni projekcija vodi (${early.proj})`);
  assert.ok(mid.proj < 0.25 && mid.season > mid.proj, `posle 15 utakmica sezona važi više od projekcije (${mid.proj}, ${mid.season})`);
  near(late.proj / late.season, (F.FA.BLEND.proj * F.FA.PROJ_FLOOR) / F.FA.BLEND.season); // pod: projekcija ne nestaje
  for (const w of [early, mid, late]) near(Object.values(w).reduce((a, b) => a + b, 0), 1);
});

test('IR stash poštuje irRule i slobodno IR mesto', () => {
  const fa = [{ id: 1, k: 'OUT', out: true, healthy: 3 }, { id: 2, k: 'DTD', out: false, healthy: 4 }, { id: 3, k: 'IR', out: true, healthy: 2 }, { id: 4, k: 'OUT', out: true, healthy: -1 }];
  assert.deepStrictEqual(F.irStash(fa, { irRule: ['OUT', 'IR'], freeIr: 0 }), []);
  assert.deepStrictEqual(F.irStash(fa, { irRule: ['OUT', 'IR'], freeIr: 1 }).map(x => x.id), [1, 3]);
  assert.deepStrictEqual(F.irStash(fa, { irRule: ['IR'], freeIr: 1 }).map(x => x.id), [3]);
  assert.deepStrictEqual(F.irStash(fa, { irRule: null, freeIr: 2 }).map(x => x.id), [1, 3]); // platforma ne daje pravilo: OUT statusi
});

test('signali rotacije: minuti, saigrač OUT, rast vlasništva', () => {
  const s = F.rotationSignals({ minSeason: 18, minRecent: 29, recentGp: 4, ownChg: 2.5, matesOut: ['X'] });
  assert.deepStrictEqual(s.map(x => x.kind), ['min', 'mate', 'own']);
  assert.deepStrictEqual(F.rotationSignals({ minSeason: 18, minRecent: 29, recentGp: 1, ownChg: 0.2 }), []); // premalo utakmica, mali rast
});

test('javna lista u usponu: samo vlasništvo ispod 60%, najveći rast prvi', () => {
  const ps = [{ id: 1, own: { pct: 75, chg: 9 } }, { id: 2, own: { pct: 40, chg: 3 } }, { id: 3, own: { pct: 12, chg: 6 } }, { id: 4, own: { pct: 30, chg: -2 } }, { id: 5, own: null }];
  assert.deepStrictEqual(F.publicRising(ps).map(p => p.id), [3, 2]);
});

test('lista Prati: igrači sa signalom koji nisu u predlozima', () => {
  const fa = [{ id: 1, value: 1, signals: [{}] }, { id: 2, value: 2, signals: [] }, { id: 3, value: 0.5, signals: [{}] }];
  assert.deepStrictEqual(F.watchList(fa, [1]).map(x => x.id), [3]);
});

// mali model lige: 3 kategorije (PTS, AST, FG%), moj tim + 3 protivnika
const CATS3 = [{ key: 'PTS' }, { key: 'AST' }, { key: 'FGP', pct: true, made: 'FGM', att: 'FGA' }];
const L = (PTS, AST, FGM, FGA) => ({ PTS, AST, FGM, FGA });
const myLines = { a: L(20, 2, 8, 17), b: L(12, 9, 5, 11), c: L(15, 3, 6, 13) }; // b nosi asistencije
const opps = [L(50, 15, 20, 44), L(46, 13, 18, 40), L(44, 12, 17, 38)];
function ctxOf() {
  const tot = F.sumLines(Object.values(myLines));
  const sd = F.leagueSpread([tot, ...opps], CATS3);
  return { pts: false, cats: CATS3, tot, opps, sd, weights: null, base: F.expWins(tot, opps, CATS3, sd) };
}

test('par se računa preko zbirova tima: izbacivanje igrača koji nosi jaku kategoriju spušta rang para', () => {
  const ctx = ctxOf();
  const fa = L(16, 2, 6, 13); // strelac bez asistencija
  const outB = F.pairGain(ctx, fa, myLines.b), outC = F.pairGain(ctx, fa, myLines.c);
  assert.ok(outC.gain > outB.gain, `${outC.gain} > ${outB.gain}`); // c je slabiji po opštem utisku, ali b nosi AST
  assert.ok(outB.by.AST < 0);
  // FG% se računa ponderisano iz zbirova (made/att), ne kao prosek procenata
  const sc = F.pairScore(CATS3, ctx.tot, fa, myLines.c);
  near(sc.d.FGP.after, (19 + 6 - 6) / (41 + 13 - 13));
  assert.strictEqual(sc.res.PTS, 1); assert.strictEqual(sc.res.AST, -1);
  assert.strictEqual(sc.win, 1); assert.strictEqual(sc.lose, 1);
});

const mine = [
  { id: 1, general: 3.0, own: 99 },  // zvezda
  { id: 2, general: -1.0, own: 70 }, // slab, ali visoko vlasništvo
  { id: 3, general: -2.0, own: 20 }, // slab i nisko vlasništvo
  { id: 4, general: 0.5, own: 30 },  // jači od FA igrača koji dolazi
];
const faList = [{ id: 100, general: 0.2, signals: [] }];
const gainAll = (x, m) => ({ 1: -1, 2: 0.6, 3: 0.4, 4: 0.8 })[m.id];

test('igrač sa opštom vrednošću većom od igrača koji dolazi se ne predlaže automatski', () => {
  assert.strictEqual(F.canDrop(mine[3], faList[0]), false);
  const r = F.faSuggest(faList, mine, gainAll, { min: 0.05 });
  assert.strictEqual(r.list[0].drop, 3); // 4 bi najviše popravio tim, ali vredi više od igrača 100
  assert.strictEqual(r.list[0].warn, false);
});

test('pravilo otpuštanja ide po tržišnoj vrednosti (kao Pronađi trejd), ne po opštoj vrednosti', () => {
  // niska opšta vrednost, ali tržišna vrednost veća od igrača koji dolazi: ne predlaže se za otpuštanje
  const fa = { id: 100, general: 0.2, mv: 5 };
  assert.strictEqual(F.canDrop({ id: 9, general: -3, mv: 12, own: 30 }, fa), false);
  assert.strictEqual(F.canDrop({ id: 9, general: 1.5, mv: 2, own: 30 }, fa), true);
  const tc = F.tradeCandidates([{ id: 9, general: -3, mv: 12, own: 30 }], [fa], () => 1, { min: 0.05 });
  assert.deepStrictEqual(tc.map(x => x.id), [9]); // vredniji od najboljeg FA po tržišnoj vrednosti -> trejd kandidat
});

test('igrač sa vlasništvom 50% ili više se ne predlaže automatski i dobija "Trejd kandidat"', () => {
  assert.strictEqual(F.canDrop(mine[1], faList[0]), false);
  assert.strictEqual(F.canDrop({ id: 9, general: -3, own: 50 }, faList[0]), false);
  assert.strictEqual(F.canDrop({ id: 9, general: -3, own: 49.9 }, faList[0]), true);
  const tc = F.tradeCandidates(mine, faList, gainAll, { min: 0.05 });
  assert.deepStrictEqual(tc.map(x => x.id), [4, 2]); // 4: opšta vrednost veća od najboljeg FA; 2: vlasništvo 70%
});

test('zaključan igrač se ne predlaže; "Predloži drugog" daje sledeći par za istu karticu', () => {
  const r = F.faSuggest(faList, mine, gainAll, { min: 0.05, locks: new Set([3]) });
  assert.strictEqual(r.list.length, 0); // ostali ne smeju (vlasništvo ili opšta vrednost)
  const two = [...mine, { id: 5, general: -1.5, own: 10 }];
  const g = (x, m) => ({ 3: 0.4, 5: 0.3 })[m.id] ?? -1;
  assert.strictEqual(F.faSuggest(faList, two, g, { min: 0.05 }).list[0].drop, 3);
  assert.strictEqual(F.faSuggest(faList, two, g, { min: 0.05, skipBy: { 100: 1 } }).list[0].drop, 5);
});

test('za svakog FA igrača njemu najbolji par, pa kartice mogu imati različite igrače koji odlaze', () => {
  const two = [{ id: 3, general: -2, own: 20 }, { id: 5, general: -1.5, own: 10 }];
  const fas = [{ id: 100, general: 1 }, { id: 101, general: 1 }];
  const g = (x, m) => (x.id === 100 ? { 3: 0.5, 5: 0.2 } : { 3: 0.1, 5: 0.4 })[m.id];
  const r = F.faSuggest(fas, two, g, { min: 0.05 });
  assert.deepStrictEqual(r.list.map(s => [s.id, s.drop]), [[100, 3], [101, 5]]);
});

test('poruka "Tvoj roster je jači...": niko ne ispunjava uslove (eligible = false)', () => {
  const strong = [{ id: 1, general: 3, own: 99 }, { id: 2, general: 1, own: 40 }];
  const r = F.faSuggest(faList, strong, gainAll, { min: 0.05 });
  assert.deepStrictEqual(r.list, []);
  assert.strictEqual(r.eligible, false);
  // ima ko sme da ode, ali nijedna izmena ne prelazi prag: druga poruka (eligible = true)
  const r2 = F.faSuggest(faList, [{ id: 3, general: -2, own: 20 }], () => 0.01, { min: 0.05 });
  assert.deepStrictEqual(r2.list, []); assert.strictEqual(r2.eligible, true);
});

test('ručni izbor važi za sve kartice i prikazuje upozorenje kad igrač vredi više od onog koji dolazi', () => {
  const r = F.faSuggest(faList, mine, gainAll, { min: 0.05, picks: [mine[0]] });
  assert.strictEqual(r.list[0].drop, 1); // zvezda: par ne prelazi prag, ali ručni izbor se ipak prikazuje
  assert.strictEqual(r.list[0].warn, true);
  const r2 = F.faSuggest(faList, mine, gainAll, { min: 0.05, picks: [mine[3]] });
  assert.strictEqual(r2.list[0].drop, 4);
  assert.strictEqual(r2.list[0].warn, true);
});

test('stranice u tabeli: sortiranje važi za ceo spisak, ne samo za trenutnu stranicu', () => {
  const items = Array.from({ length: 60 }, (_, i) => ({ id: i, v: (i * 37) % 60 }));
  const sorted = [...items].sort((a, b) => b.v - a.v);
  const p1 = F.pageOf(sorted, 1, 25), p3 = F.pageOf(sorted, 3, 25);
  assert.strictEqual(p1.pages, 3); assert.strictEqual(p1.rows.length, 25); assert.strictEqual(p3.rows.length, 10);
  assert.strictEqual(p1.rows[0].v, 59); // najveći u celom spisku, a ne na prvih 25 pre sortiranja
  assert.strictEqual(p3.rows[p3.rows.length - 1].v, 0);
  assert.strictEqual(F.pageOf(sorted, 99, 25).page, 3); // van opsega: poslednja stranica
});

test('mešavina linija po periodima i zamena igrača u zbiru tima', () => {
  const l = F.blendLine({ proj: { PTS: 20, GP: 1 }, l15: { PTS: 10 } }, { proj: 0.5, l15: 0.5 });
  near(l.PTS, 15);
  const tot = F.swapTotals({ PTS: 100, FGM: 40 }, { PTS: 12, FGM: 5 }, { PTS: 8, FGM: 3 });
  assert.deepStrictEqual(tot, { PTS: 104, FGM: 42 });
});

test('otpuštanje po obe vrednosti: obe ispod realne zamene = otpust; niska stvarna, a viša cena = Trejd kandidat', () => {
  const slot = { rv: 38.2, mv: -3.9 }; // NBA tviter: Cameron Johnson, Stirtz, Slawson
  assert.strictEqual(F.dropVerdict({ rv: -39.4, mv: -18.2, own: 11 }, slot), 'drop');   // Murray-Boyles
  assert.strictEqual(F.dropVerdict({ rv: -66.8, mv: -1.4, own: 30 }, slot), 'trade');   // Brooks: cena malo iznad zamene
  assert.strictEqual(F.dropVerdict({ rv: -41.7, mv: 17.6, own: 70 }, slot), 'trade');   // Nembhard
  assert.strictEqual(F.dropVerdict({ rv: 125, mv: 75, own: 81 }, slot), 'keep');        // obe visoke
  assert.strictEqual(F.dropVerdict({ rv: -39, mv: -18, own: 60 }, slot), 'trade');      // vlasništvo od praga naviše
  assert.strictEqual(F.dropVerdict({ rv: -39, mv: -18, own: 10 }, slot, { locked: true }), 'keep');
  assert.strictEqual(F.dropVerdict({ rv: -39, mv: -18, own: 10, ir: true }, slot), 'keep');
  assert.strictEqual(F.dropVerdict({ rv: -66.8, mv: -1.4, own: 30 }, slot, { margin: 3 }), 'drop'); // DROP_PRICE_MARGIN
  assert.strictEqual(F.dropVerdict({ rv: null, mv: -20, own: 10 }, slot), 'keep');                  // bez stvarne vrednosti
  assert.deepStrictEqual([F.FA.DROP_PRICE_MARGIN, F.FA.REAL_PROJ_FADE_GP, F.FA.REAL_PROJ_FLOOR], [0, F.FA.PROJ_FADE_GP, F.FA.PROJ_FLOOR]); // tuning-v2: ista projekcija kao cena
});

test('FA alat uz realnu zamenu: Trejd kandidat nije otpust; bez ijednog otpusta nema predloga', () => {
  const slot = { rv: 38, mv: -4 }, fa = [{ id: 100, general: 1, mv: 10, rv: 60, signals: [] }];
  const mine2 = [{ id: 1, rv: -66, mv: 0.5, own: 30 }, { id: 2, rv: -41, mv: 18, own: 70 }, { id: 3, rv: 125, mv: 75, own: 81 }];
  assert.strictEqual(F.canDrop(mine2[0], fa[0], new Set(), 50, slot), false);
  const r = F.faSuggest(fa, mine2, () => 1, { min: 0.05, slot });
  assert.deepStrictEqual([r.list.length, r.eligible], [0, false]); // poruka "Tvoj roster je jači..."
  assert.deepStrictEqual(F.tradeCandidates(mine2, fa, (x, m) => (m.id === 1 ? 2 : 1), { min: 0.05, slot }).map(x => x.id), [1, 2]);
  const r2 = F.faSuggest(fa, [...mine2, { id: 4, rv: -40, mv: -20, own: 10 }], () => 1, { min: 0.05, slot });
  assert.strictEqual(r2.list[0].drop, 4);
});

test('stvarna vrednost: projekcija kao kod cene (25 utakmica, najmanje 0,25); kratki periodi po odigranim minutima', () => {
  const gp = { proj: 1, season: 30, l15: 6, l7: 3 };
  const real = F.blendWeights(gp, F.FA.BLEND, F.FA.BLEND_FULL_GP, F.FA.REAL_PROJ_FLOOR, F.FA.REAL_PROJ_FADE_GP);
  assert.deepStrictEqual(real, F.blendWeights(gp)); // ista mešavina kao cena na tržištu
  assert.ok(real.proj > 0);
  // vruć niz: 3 utakmice po 30 minuta u 7 dana vrede manje nego 4 utakmice po 36 minuta
  const K = F.FA.SHORT_MIN_K; assert.strictEqual(K, 300);
  const short = F.blendWeights({ ...gp, min: { l15: 6 * 30, l7: 3 * 30 } }), long = F.blendWeights({ ...gp, min: { l15: 7 * 36, l7: 4 * 36 } });
  assert.ok(short.l7 < long.l7 && short.l15 < long.l15);
  const none = F.blendWeights(gp); // bez minuta (stari pozivi): bez umanjenja
  assert.ok(none.l7 > long.l7);
  assert.ok(Math.abs(Object.values(short).reduce((a, b) => a + b, 0) - 1) < 1e-9);
});

test('udeo startova po rangu: nedeljna = prvih N, pun raspored = prvih N, redak raspored daje klupi utakmice, ograničenje seče od dna', () => {
  const teams = Array.from({ length: 30 }, (_, i) => i + 1);
  const wk = F.startShares([[1]], teams, 3, 6, { weekly: true });
  assert.deepStrictEqual(wk, [1, 1, 1, 0, 0, 0]);
  const full = F.startShares(Array.from({ length: 20 }, () => teams), teams, 3, 6, { trials: 50 });
  assert.deepStrictEqual(full, [1, 1, 1, 0, 0, 0]);
  // svaki dan igra pola timova: 10 startnih od 13 -> najbolji uvek, klupa često
  const half = Array.from({ length: 60 }, (_, d) => teams.filter(t => (t + d) % 2 === 0));
  const sh = F.startShares(half, teams, 10, 13, { trials: 200 });
  assert.ok(sh[0] === 1 && sh[9] > 0.95, sh.join());
  assert.ok(sh[10] > 0.5 && sh[12] < sh[10] && sh[12] > 0.2, sh.join());
  for (let r = 1; r < 13; r++) assert.ok(sh[r] <= sh[r - 1] + 1e-9);
  // ograničenje: manje računatih utakmica, najslabiji prvi ispadaju, najbolji ostaju
  const cap = F.startShares(half, teams, 10, 13, { trials: 200, cap: 280 });
  assert.strictEqual(cap[0], 1);
  assert.ok(cap[12] < sh[12] && cap[12] === 0, cap.join());
});
console.log(`\n${n} testova prošlo`);
