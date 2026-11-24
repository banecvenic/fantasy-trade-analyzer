// Testovi za utakmice: dabl-dablovi iz statistike utakmice, bonusi za prag, prosek za period, FPts sa bonusom i bez, keš.
// Pokretanje: node tools/test_games.js
// Deo app.js između oznaka "Utakmice: čiste funkcije" i "kraj: Utakmice" se izvršava bez browsera.
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const src = fs.readFileSync(path.join(__dirname, '..', 'assets', 'app.js'), 'utf8');
const start = src.indexOf('   Utakmice: čiste funkcije');
const end = src.indexOf('/* ==== kraj: Utakmice, čiste funkcije ==== */');
if (start < 0 || end < 0) throw new Error('Nije nađen modul utakmica u app.js');
const code = src.slice(src.lastIndexOf('/*', start), end);
const { multiCount, derivedOf, gameBonusPts, periodAgg, fptsCalc, logsStale, gameLogRows } = new Function(`${code}\nreturn { multiCount, derivedOf, gameBonusPts, periodAgg, fptsCalc, logsStale, gameLogRows };`)();

// formatski modul (normalizeFormat, kategorije)
const fStart = src.indexOf('   Formati lige: katalog statistika');
const fEnd = src.indexOf('const leagueFormatOf');
const fmtCode = src.slice(src.lastIndexOf('/*', fStart), src.indexOf('\n', fEnd));
const F = new Function('LANG', `${fmtCode}\nreturn { normalizeFormat, mapEspnFormat, STAT_BY_ID };`)('sr');

let n = 0;
const test = (name, fn) => { fn(); n++; console.log(`ok  ${name}`); };
const DAY = 864e5, NOW = Date.UTC(2026, 10, 23, 12);
const line = o => ({ PTS: 0, REB: 0, AST: 0, STL: 0, BLK: 0, TO: 0, ...o });
// igrač: 4 utakmice (od najstarije): 12 poena i 21 skok (dabl-dabl, pre 20 dana), ništa, dabl-dabl, 42 poena i tripl-dabl (42/11/10)
const games = [
  { date: NOW - 20 * DAY, line: line({ PTS: 12, REB: 21, AST: 2 }) },
  { date: NOW - 5 * DAY, line: line({ PTS: 18, REB: 4, AST: 3 }) },
  { date: NOW - 3 * DAY, line: line({ PTS: 22, REB: 10, AST: 4 }) },
  { date: NOW - 1 * DAY, line: line({ PTS: 42, REB: 11, AST: 10, STL: 1 }) },
];
const BONUS = [{ s: 'PTS', n: 40, w: 2 }, { s: 'PTS', n: 50, w: 2 }, { s: 'REB', n: 20, w: 5 }, { s: 'AST', n: 15, w: 5 }];
const W = { PTS: 0.5, REB: 1, AST: 1, DD: 1, TD: 2 };

test('dabl-dabl, tripl-dabl i četvorostruki: iz statistike utakmice, tripl-dabl je i dabl-dabl', () => {
  assert.strictEqual(multiCount(games[3].line), 3);
  assert.deepStrictEqual(derivedOf(games[3].line), { DD: 1, TD: 1, QD: 0 });
  assert.deepStrictEqual(derivedOf(games[2].line), { DD: 1, TD: 0, QD: 0 });
  assert.deepStrictEqual(derivedOf(games[1].line), { DD: 0, TD: 0, QD: 0 });
  assert.deepStrictEqual(derivedOf(line({ PTS: 10, REB: 10, AST: 10, BLK: 10 })), { DD: 1, TD: 1, QD: 1 });
});

test('bonus za prag: 42 poena = samo 40+, 50 poena = 40+ i 50+, 21 skok = 20+', () => {
  assert.strictEqual(gameBonusPts(games[3].line, BONUS), 2);
  assert.strictEqual(gameBonusPts(line({ PTS: 50 }), BONUS), 4);
  assert.strictEqual(gameBonusPts(games[0].line, BONUS), 5);
  assert.strictEqual(gameBonusPts(games[1].line, BONUS), 0);
});

test('prosek za period: sezona i poslednjih 7 dana', () => {
  const s = periodAgg(games, BONUS, null, NOW);
  assert.strictEqual(s.n, 4);
  assert.strictEqual(s.B, (5 + 2) / 4);
  assert.strictEqual(s.DD, 3 / 4);
  assert.strictEqual(s.TD, 1 / 4);
  const w = periodAgg(games, BONUS, 7, NOW);
  assert.strictEqual(w.n, 3);
  assert.strictEqual(w.B, 2 / 3);
  assert.strictEqual(periodAgg(games, BONUS, 7, NOW + 30 * DAY), null);
});

test('FPts: prosek sa bonusom i bez', () => {
  // prosečna linija sezone (kao ESPN averageStats)
  const avg = { PTS: (12 + 18 + 22 + 42) / 4, REB: (21 + 4 + 10 + 11) / 4, AST: (2 + 3 + 4 + 10) / 4, DD: 0.75, TD: 0.25 };
  const without = fptsCalc(avg, W);
  const withB = fptsCalc(avg, W, periodAgg(games, BONUS, null, NOW));
  assert.strictEqual(+without.toFixed(4), +(11.75 + 11.5 + 4.75 + 0.75 + 0.5).toFixed(4));
  assert.strictEqual(+(withB - without).toFixed(4), 1.75); // (5 + 2) / 4
  // isto kao zbir FPts po utakmici / broj utakmica
  const perGame = games.map(g => { const d = derivedOf(g.line); return 0.5 * g.line.PTS + g.line.REB + g.line.AST + d.DD + 2 * d.TD + gameBonusPts(g.line, BONUS); });
  assert.strictEqual(+withB.toFixed(6), +(perGame.reduce((a, b) => a + b, 0) / 4).toFixed(6));
});

test('keš utakmica: sveže se ne povlači ponovo, staro posle dana ili posle nove utakmice', () => {
  const entry = { ts: NOW - 2 * 36e5 };
  const team = [{ date: NOW - 10 * 36e5 }, { date: NOW + DAY }];
  assert.strictEqual(logsStale(entry, team, NOW), false); // drugo otvaranje istog dana: bez novog poziva
  assert.strictEqual(logsStale(entry, [...team, { date: NOW - 4 * 36e5 }], NOW), true); // utakmica završena posle povlačenja
  assert.strictEqual(logsStale({ ts: NOW - 25 * 36e5 }, [], NOW), true); // stariji od dana
  assert.strictEqual(logsStale(null, team, NOW), true);
});

test('kategorije: QD (samo iz utakmica) ne može u kategorije, tehničke i flagrantne mogu', () => {
  const f = F.normalizeFormat({ scoringType: 'h2h_each', preset: 'custom', categories: ['PTS', 'REB', 'QD', 'TF', 'FF'] });
  assert.deepStrictEqual(f.categories, ['PTS', 'REB', 'TF', 'FF']);
  const espnItem = (statId, points) => ({ statId, points, isReverseItem: false, pointsOverrides: {} });
  const r = F.mapEspnFormat({ scoringSettings: { scoringType: 'H2H_CATEGORY', scoringItems: [0, 6, 3, 39, 10].map(id => espnItem(id, 0)) } });
  assert.deepStrictEqual(r.format.categories, ['PTS', 'REB', 'AST', 'TF']);
  assert.deepStrictEqual(r.format.unsupported, ['Quadruple-doubles']);
  // na poene QD ostaje (računa se iz utakmica)
  assert.strictEqual(F.normalizeFormat({ scoringType: 'h2h_points', weights: { PTS: 1, QD: 20 } }).weights.QD, 20);
});

test('game log: utakmica u toku je "next game", utakmice koje nije igrao imaju crtice i ne ulaze u proseke', () => {
  const H = 3600e3, now = 100 * DAY, done = now - 3.5 * H;
  const sched = [{ id: 1, date: now - 4 * DAY }, { id: 2, date: now - 3 * DAY }, { id: 3, date: now - 2 * DAY }, { id: 4, date: now - H }, { id: 5, date: now + DAY }];
  // odigrao 1 i 3; 2 nije igrao; 4 je u toku (ESPN već ima delimičnu liniju); 5 je sledeća
  const games = [{ date: now - 4 * DAY, gid: '1', line: { GP: 1, PTS: 10 } }, { date: now - 2 * DAY, gid: '3', line: { GP: 1, PTS: 20 } }, { date: now - H, gid: '4', line: { GP: 1, PTS: 4 } }];
  const r = gameLogRows(games, sched, now, done);
  assert.deepStrictEqual(r.played.map(g => g.gid), ['1', '2', '3']);
  assert.strictEqual(r.played[1].dnp, true);
  assert.ok(!r.played[1].line); // nema linije: ne ulazi u proseke ni GP
  assert.deepStrictEqual(r.next.map(g => [g.id, g.live]), [[4, true], [5, false]]);
  const played = r.played.filter(g => !g.dnp);
  assert.strictEqual(played.length, 2);
  assert.strictEqual(played.reduce((a, g) => a + g.line.PTS, 0) / played.length, 15);
  // prelazak u drugi tim: utakmice novog tima pre prve utakmice za njega se ne prikazuju kao "nije igrao"
  const traded = [{ date: now - 3 * DAY, gid: '99', line: { GP: 1 } }];
  assert.deepStrictEqual(gameLogRows(traded, sched, now, done).played.map(g => [g.gid, !!g.dnp]), [['99', false], ['3', true]]);
});

console.log(`\n${n} testova prošlo`);
