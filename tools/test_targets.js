// Testovi za Mete za trejd: kandidati, nedostižnost, spremnost vlasnika, povređeni kao investicija, jačina pondera,
// stranice (najviše 2 igrača istog vlasnika), mogući trejd = prvi predlog Pronađi trejd, lista želja, samo moj tim.
// Pokretanje: node tools/test_targets.js
// Izvršava se deo app.js od "Fer trejd: čiste funkcije" do "kraj: Mete za trejd, čiste funkcije".
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const src = fs.readFileSync(path.join(__dirname, '..', 'assets', 'app.js'), 'utf8');
const start = src.indexOf('   Fer trejd: čiste funkcije');
const end = src.indexOf('/* ==== kraj: Mete za trejd, čiste funkcije ==== */');
if (start < 0 || end < 0) throw new Error('Nije nađen modul Mete za trejd u app.js');
const code = src.slice(src.lastIndexOf('/*', start), end);
const M = new Function(`${code}\nreturn { TF, TT, E: tfEngine(), ttCandidates, ttUnreach, ttWilling, ttForm, ttInjInvest, ttStable, ttFragile, ttScore, ttCoarse, ttPage, ttWishToggle, ttWishHas, ttTradeInput, ttSoloGain, ttMode };`)();
const { TF, TT, E } = M;

let n = 0;
const test = (name, fn) => { fn(); n++; console.log(`ok  ${name}`); };
// glavni deo isti za oba igrača, menja se samo jedan ponder
const parts = o => ({ cat: 0.6, unreach: 0, willing: 0.3, form: 0.2, cheap: 0.1, inj: 0, playoff: 0.5, stable: 0.5, fragile: 0, close: 0, ...o });

test('kandidati: samo tuđi rosteri (i IR), bez igrača van do kraja sezone', () => {
  const rosters = [{ owner: 'a', players: [{ id: 1 }, { id: 2, ir: true }] }, { owner: 'b', players: [{ id: 3 }, { id: 4 }] }];
  const c = M.ttCandidates(rosters, id => id === 4);
  assert.deepStrictEqual(c.map(x => x.id), [1, 2, 3]);
  assert.strictEqual(c.find(x => x.id === 2).ir, true);
  assert.strictEqual(c.find(x => x.id === 3).owner, 'b');
});

test('nedostižnost: najbolji igrač vlasnika ima nižu ocenu od sličnog igrača koji nije stub tima', () => {
  const star = M.ttScore(parts({ unreach: M.ttUnreach(1, 40) })).s, other = M.ttScore(parts({ unreach: M.ttUnreach(5, 42) })).s;
  assert.ok(star < other, `${star} >= ${other}`);
  assert.strictEqual(M.ttUnreach(2, 100), TT.UNREACH_OWNER[1]);
  assert.strictEqual(M.ttUnreach(6, 3), 1); // zvezda iz vrha lige, i kad nije najbolji kod vlasnika
  assert.strictEqual(M.ttUnreach(6, 200), 0);
});

test('spremnost vlasnika: višak u igračevim kategorijama daje veću ocenu', () => {
  const a = M.ttScore(parts({ willing: M.ttWilling({ surplus: 1 }) })).s, b = M.ttScore(parts({ willing: M.ttWilling({ surplus: 0 }) })).s;
  assert.ok(a > b);
  assert.ok(M.ttWilling({ surplus: 1, need: 1, pressure: true, bottom: true }) <= 1);
});

test('povređeni kao investicija: samo kad sam visoko na tabeli i imam slobodno IR mesto', () => {
  const base = { out: true, gone: false, irOk: true, good: true, myHigh: true, myIrFree: 1 };
  assert.strictEqual(M.ttInjInvest(base), 1);
  assert.strictEqual(M.ttInjInvest({ ...base, myHigh: false }), 0);
  assert.strictEqual(M.ttInjInvest({ ...base, myIrFree: 0 }), 0);
  assert.strictEqual(M.ttInjInvest({ ...base, gone: true }), 0);
  assert.strictEqual(M.ttInjInvest({ ...base, out: false }), 0);
});

test('dodatni ponderi su slabiji od glavnih: ista promena dela menja ocenu manje', () => {
  const s0 = M.ttScore(parts({})).s;
  const main = ['cat', 'willing', 'form', 'cheap', 'inj'], extra = ['playoff', 'stable', 'close'];
  const d = k => Math.abs(M.ttScore(parts({ [k]: parts({})[k] + 0.4 })).s - s0);
  const dNeg = k => Math.abs(M.ttScore(parts({ [k]: 0.4 })).s - s0);
  const minMain = Math.min(...main.map(d), dNeg('unreach')), maxExtra = Math.max(...extra.map(d), dNeg('fragile'));
  assert.ok(maxExtra < minMain, `${maxExtra} >= ${minMain}`);
});

test('stranica: najviše 2 igrača istog vlasnika od 8, sledeća stranica bez prikazanih', () => {
  const list = Array.from({ length: 20 }, (_, i) => ({ id: i + 1, owner: i < 10 ? 'a' : `t${i}` }));
  const p1 = M.ttPage(list);
  assert.strictEqual(p1.length, 8);
  assert.strictEqual(p1.filter(x => x.owner === 'a').length, 2);
  const p2 = M.ttPage(list, new Set(p1.map(x => x.id)));
  assert.ok(p2.every(x => !p1.includes(x)) && p2.filter(x => x.owner === 'a').length <= 2);
  const solo = M.ttPage(list.map(x => ({ ...x, owner: null })));
  assert.deepStrictEqual(solo.map(x => x.id), [1, 2, 3, 4, 5, 6, 7, 8]); // bez vlasnika: bez ograničenja
});

// mali par timova za motor: vektor [PTS, REB, AST, TO, FGM, FGA, FPTS]
const KEYS = ['PTS', 'REB', 'AST', 'TO', 'FGM', 'FGA', 'FPTS'];
const cats = [{ key: 'PTS', k: 0 }, { key: 'REB', k: 1 }, { key: 'AST', k: 2 }, { key: 'TO', k: 3, low: true }, { key: 'FGP', pct: true, m: 4, a: 5 }];
const vec = o => KEYS.map(k => o[k] || 0);
const pl = (id, v, o) => ({ id, v, rv: v, vec: vec(o), mark: null, ir: false, drop: true });
const team = (id0, base) => Array.from({ length: 6 }, (_, i) => pl(id0 + i, base - i, { PTS: 10 + base - i * 2, REB: 3 + (i % 3), AST: 2 + (i % 2), TO: 1.5, FGM: 4, FGA: 9 }));
const inp = {
  pts: false, n: KEYS.length, cats, myIdx: [0, 1, 2, 3, 4], oppIdx: [0, 1, 2, 3, 4], fIdx: 6,
  fa: [pl(900, 1, { PTS: 5, REB: 2, AST: 1, TO: 1, FGM: 2, FGA: 4.5 })], opps: [], sd: [5, 3, 2, 1, 0.01], w: null, oppW: [1, 1, 1, 1, 1],
  limits: [TF.LIMITS.fair, TF.LIMITS.slight], strategy: 'cats', sell: [], buy: [], focus: [1], TF,
  mine: team(1, 8), theirs: team(100, 8),
};

test('mogući trejd na kartici = prvi predlog Pronađi trejd sa tim igračem obeleženim U trejd (Najbolje za mene, Fer)', () => {
  const id = 102;
  const tin = M.ttTradeInput(inp, id);
  assert.strictEqual(tin.strategy, 'best');
  assert.deepStrictEqual(tin.limits, [TF.LIMITS.fair]);
  assert.strictEqual(tin.theirs.find(x => x.id === id).mark, 'trade');
  assert.strictEqual(inp.theirs.find(x => x.id === id).mark, null); // ulaz Pronađi trejd se ne menja
  // isto kao Pronađi trejd: strategija Najbolje za mene, Fer, igrač U trejd
  const finder = E.search({ ...inp, strategy: 'best', limits: [TF.LIMITS.fair], focus: [], w: null, theirs: inp.theirs.map(x => (x.id === id ? { ...x, mark: 'trade' } : x)) }).list[0];
  const card = E.search(tin).list[0];
  assert.deepStrictEqual(card && [card.g, card.r], finder && [finder.g, finder.r]);
  assert.ok(card, 'motor nalazi trejd'); assert.ok(card.r.includes(id));
});

test('lista želja: dodavanje, uklanjanje i pamćenje po ligi', () => {
  let all = {};
  all = M.ttWishToggle(all, 'lgA', 5); all = M.ttWishToggle(all, 'lgA', 7); all = M.ttWishToggle(all, 'lgB', 5);
  assert.ok(M.ttWishHas(all, 'lgA', 5) && M.ttWishHas(all, 'lgA', 7) && M.ttWishHas(all, 'lgB', 5));
  all = M.ttWishToggle(all, 'lgA', 5);
  assert.ok(!M.ttWishHas(all, 'lgA', 5) && M.ttWishHas(all, 'lgB', 5));
  assert.deepStrictEqual(JSON.parse(JSON.stringify(all)), { lgA: [7], lgB: [5] });
});

test('samo moj tim: režim bez vlasnika i mogućeg trejda, korist iz kategorija koje mi trebaju', () => {
  assert.strictEqual(M.ttMode(false, 0), 'solo');
  assert.strictEqual(M.ttMode(true, 0), 'solo');
  assert.strictEqual(M.ttMode(true, 3), 'league');
  const w = { REB: TT.SOLO_WEAK_W, PTS: 1 };
  assert.ok(M.ttSoloGain({ REB: 1, PTS: 0 }, { REB: 0, PTS: 0 }, w) > M.ttSoloGain({ REB: 0, PTS: 1 }, { REB: 0, PTS: 0 }, w));
  // stranica bez vlasnika
  assert.strictEqual(M.ttPage([{ id: 1, owner: null }, { id: 2, owner: null }, { id: 3, owner: null }], new Set(), 8, 2).length, 3);
});

test('forma, stabilnost i krhkost: delovi od 0 do 1', () => {
  assert.strictEqual(M.ttForm({ formDiff: 0, minUp: 2 }), 0);
  assert.strictEqual(M.ttForm({ formDiff: 0, minUp: 8 }), 1);
  assert.strictEqual(M.ttForm({ formDiff: 0, mateOut: true }), TT.MATE_OUT);
  assert.strictEqual(M.ttStable([30, 30, 31, 29, 30, 30]), 1);
  assert.strictEqual(M.ttStable([30, 10]), null);
  assert.ok(M.ttStable([10, 35, 12, 38, 9, 36]) < 0.2);
  assert.strictEqual(M.ttFragile(20, 20), 0);
  assert.strictEqual(M.ttFragile(10, 20), 1);
});

console.log(`\n${n} testova prošlo`);
