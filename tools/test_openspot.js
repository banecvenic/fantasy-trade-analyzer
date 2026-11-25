// Testovi za analizu trejda: procena plasmana bez trenutnog statusa (OUT, DTD) i slobodno mesto (Realna zamena / Izaberi igrača / Ne računaj).
// Pokretanje: node tools/test_openspot.js
// Funkcije se izdvajaju iz app.js i izvršavaju sa malim zamenama za stanje aplikacije (bez browsera).
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const src = fs.readFileSync(path.join(__dirname, '..', 'assets', 'app.js'), 'utf8');
const grab = (startMark, endMark) => {
  const a = src.indexOf(startMark);
  if (a < 0) throw new Error(`Nije nađeno: ${startMark}`);
  const b = src.indexOf(endMark, a);
  if (b < 0) throw new Error(`Nije nađen kraj: ${endMark}`);
  return src.slice(a, b);
};
const fnBody = name => { const a = src.indexOf(`function ${name}(`); return src.slice(a, src.indexOf('\n}\n', a) + 2); };

let n = 0;
const test = (name, fn) => { fn(); n++; console.log(`ok  ${name}`); };

// availFactor (čista funkcija) + seasonOut + projAvail
const availSrc = src.slice(src.indexOf('const availFactor ='), src.indexOf('\n', src.indexOf('const availFactor =')));
const projSrc = grab('const seasonOut =', '/** Procena plasmana posle trejda');
const mk = (injRet, dur) => new Function('state', 'durability', `${availSrc}\n${projSrc}\nreturn { seasonOut, projAvail, availFactor };`)({ injRet }, () => dur);

test('procena: igrač koji je OUT se broji po tome koliko inače igra (nije nula)', () => {
  const M = mk({}, { gp: 13, n: 17 });
  assert.ok(Math.abs(M.projAvail({ id: 1, inj: 'OUT' }) - 13 / 17) < 1e-9);
  assert.strictEqual(M.availFactor(13, 17, true), 0); // stari način (OUT = 0) ostaje za ostale alate
});

test('procena: van do kraja sezone samo kad ESPN kaže outForSeason (4. polje = 1)', () => {
  const M = mk({ 1: [0, 0, 0, 1], 2: [2026, 11, 28, 0], 3: 0 }, { gp: 10, n: 10 });
  assert.strictEqual(M.seasonOut({ id: 1 }), true);
  assert.strictEqual(M.seasonOut({ id: 2 }), false); // ima datum povratka
  assert.strictEqual(M.seasonOut({ id: 3 }), false); // nema podataka
  assert.strictEqual(M.seasonOut({ id: 4 }), false); // nije u kešu
});

test('procena koristi iste igrače kao tabela: otpuštanja, slobodno mesto i dostupnost bez statusa', () => {
  const body = fnBody('rankProjection');
  assert.ok(!body.includes('playerAvail('), 'procena ne sme da koristi playerAvail (OUT = 0)');
  for (const s of ['projAvail(', 'seasonOut(', "slotPlan('my')", "freeFill('my')", 'sp.nowDrops', 'sp.laterDrops', 'permIds', 'tempIds', 'permRepl', 'replLineNow()'])
    assert.ok(body.includes(s), `procena treba da koristi ${s}`);
});

test('napomena ispod procene više ne kaže da se OUT igrač ne računa', () => {
  assert.ok(!src.includes("a igrač koji je OUT se ne računa.')"));
  assert.ok(src.includes('{n} je van do kraja sezone i ne računa se.'));
});

// spotMode / setSpotMode sa lažnim localStorage
const spotSrc = grab("const SPOT_KEY =", 'function slotPlan(kind) {');
function spotEnv(tab = {}, lgId = 'L1') {
  const store = {};
  const env = new Function('lsGet', 'lsSet', 'currentLeague', 'activeTab', 'persistTrades', 'state', `${spotSrc}\nreturn { spotMode, setSpotMode, SPOT_KEY };`)(
    k => (k in store ? JSON.parse(store[k]) : null), (k, v) => { store[k] = JSON.stringify(v); }, () => (lgId ? { id: lgId } : null), () => tab, () => {}, { teams: [] });
  return { ...env, store, tab };
}

test('slobodno mesto: podrazumevano Realna zamena, izbor se pamti po ligi', () => {
  const E = spotEnv();
  assert.strictEqual(E.spotMode(), 'repl');
  E.setSpotMode('none');
  assert.strictEqual(E.spotMode(), 'none');
  assert.deepStrictEqual(JSON.parse(E.store[E.SPOT_KEY]), { L1: 'none' });
  E.setSpotMode('nešto'); // nepoznata vrednost se ignoriše
  assert.strictEqual(E.spotMode(), 'none');
  const Q = spotEnv({}, null); // bez lige: brzo poređenje
  Q.setSpotMode('pick');
  assert.deepStrictEqual(JSON.parse(Q.store[Q.SPOT_KEY]), { quick: 'pick' });
});

test('slobodno mesto: deljeni link postavlja izbor samo za svoj tab, promena birača ga briše', () => {
  const E = spotEnv({ spotMode: 'pick' });
  assert.strictEqual(E.spotMode(), 'pick');
  E.setSpotMode('repl');
  assert.strictEqual(E.tab.spotMode, undefined);
  assert.strictEqual(E.spotMode(), 'repl');
});

test('slobodno mesto: izabran igrač važi samo u opciji Izaberi igrača, Ne računaj ne popunjava mesto', () => {
  assert.ok(fnBody('slotPlan').includes("spotMode() !== 'pick' ? []"));
  const ff = fnBody('freeFill');
  assert.ok(/spotMode\(\) === 'none'\) return \{ ids: \[\], auto: \[\], repl: 0/.test(ff));
});

test('stari izbor waivera u sekciji Moj tim je uklonjen, birač je u redu Slobodno mesto', () => {
  assert.ok(!fnBody('balanceHTML').includes("slotInputHTML('my', 'w'"));
  assert.ok(fnBody('spotRowsHTML').includes("searchBoxHTML('my-w'"));
  assert.ok(src.includes("if (key === 'my-w') return spotSearch(query);"));
});

console.log(`\n${n} testova prošlo`);
