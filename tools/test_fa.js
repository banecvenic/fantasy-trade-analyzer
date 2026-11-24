// Testovi za Pojačanja sa FA: lista FA igrača, neto dobit i prag, zaključani igrači, više igrača za otpuštanje,
// mešavina perioda sa malim uzorkom, IR stash, javna lista u usponu.
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
const F = new Function(`${code}\nreturn { FA, VALUE, freeAgentIds, blendWeights, blendValue, faNeedWeights, dropCandidates, rotationSignals, pickups, watchList, irStash, publicRising };`)();

let n = 0;
const test = (name, fn) => { fn(); n++; console.log(`ok  ${name}`); };
const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

test('FA lista = svi igrači minus rosteri lige (i IR)', () => {
  const all = [1, 2, 3, 4, 5, 6, 7];
  const rosters = [[1, 2], [3], [6 /* IR */]];
  assert.deepStrictEqual(F.freeAgentIds(all, rosters), [4, 5, 7]);
});

test('neto dobit i prag: predlog samo kad FA vredi više od igrača koji odlazi za više od praga', () => {
  const drop = [{ id: 100, value: 1.0 }];
  const fa = [{ id: 1, value: 2.0 }, { id: 2, value: 1.3 }, { id: 3, value: 0.5 }];
  const r = F.pickups(fa, drop, { min: 0.5 });
  assert.deepStrictEqual(r.map(x => x.id), [1]);
  near(r[0].gain, 1.0);
  assert.strictEqual(r[0].drop, 100);
});

test('nema predloga kad niko ne prelazi prag', () => {
  const r = F.pickups([{ id: 1, value: 1.2 }, { id: 2, value: 0.9 }], [{ id: 100, value: 1.0 }], { min: 0.5 });
  assert.deepStrictEqual(r, []);
});

test('signali blago podižu rang, ali ne puštaju igrača ispod praga', () => {
  const drop = [{ id: 100, value: 0 }];
  const fa = [{ id: 1, value: 1.0 }, { id: 2, value: 0.95, signals: [{ kind: 'min' }] }, { id: 3, value: 0.4, signals: [{ kind: 'min' }, { kind: 'own' }] }];
  const r = F.pickups(fa, drop, { min: 0.5, bonus: 0.15 });
  assert.deepStrictEqual(r.map(x => x.id), [2, 1]); // 0.95 + 0.15 > 1.0; igrač 3 (0.4) ostaje ispod praga i sa bonusom
});

test('zaključan igrač se ne predlaže za otpuštanje; "Predloži drugog" daje sledećeg', () => {
  const mine = [{ id: 1, value: 3 }, { id: 2, value: -1 }, { id: 3, value: 0.5 }, { id: 4, value: -0.2 }];
  const c = F.dropCandidates(mine, new Set([2]));
  assert.deepStrictEqual(c.map(x => x.id), [4, 3, 1]); // najslabiji je 2, ali je zaključan
  assert.strictEqual(c[1].id, 3); // sledeći kandidat
});

test('više igrača za otpuštanje daje isto toliko pojačanja (pohlepno, bez ponavljanja)', () => {
  const drops = [{ id: 100, value: 0.2 }, { id: 101, value: -0.5 }];
  const fa = [{ id: 1, value: 2 }, { id: 2, value: 1.5 }, { id: 3, value: 0.1 }];
  const r = F.pickups(fa, drops, { min: 0.5 });
  assert.strictEqual(r.length, 2);
  assert.deepStrictEqual(r.map(x => [x.drop, x.id]), [[101, 1], [100, 2]]);
  assert.strictEqual(new Set(r.map(x => x.id)).size, 2);
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

test('šta treba timu: punt je 0, ručni izbor, kategorija koju gubim zbog OUT igrača', () => {
  const cats = [{ key: 'PTS' }, { key: 'REB' }, { key: 'AST' }];
  const ranks = { PTS: { rank: 1, of: 12 }, REB: { rank: 6, of: 12 }, AST: { rank: 2, of: 12 } };
  const w = F.faNeedWeights(cats, { ranks, punt: new Set(['REB']), outBy: { AST: 1.4 } });
  assert.strictEqual(w.REB, 0); assert.strictEqual(w.PTS, F.VALUE.NEED_WEIGHT.top); assert.strictEqual(w.AST, F.VALUE.NEED_WEIGHT.bottom);
  const m = F.faNeedWeights(cats, { manual: new Set(['PTS']), punt: new Set(['REB']) });
  assert.deepStrictEqual(m, { PTS: F.VALUE.NEED_WEIGHT.bottom, REB: 0, AST: F.FA.MANUAL_OFF });
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

console.log(`\n${n} testova prošlo`);
