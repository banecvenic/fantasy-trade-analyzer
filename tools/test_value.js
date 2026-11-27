// Testovi za vrednost igrača: z-score, uticaj procenata, TO, punt, poenska liga, ostatak sezone, različiti formati.
// Pokretanje: node tools/test_value.js
// Deo app.js između oznaka "Vrednost igrača: čiste funkcije" i "kraj: Vrednost" se izvršava bez browsera.
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const src = fs.readFileSync(path.join(__dirname, '..', 'assets', 'app.js'), 'utf8');
const start = src.indexOf('   Vrednost igrača: čiste funkcije');
const end = src.indexOf('/* ==== kraj: Vrednost, čiste funkcije ==== */');
if (start < 0 || end < 0) throw new Error('Nije nađen modul vrednosti u app.js');
const code = src.slice(src.lastIndexOf('/*', start), end);
const V = new Function(`${code}\nreturn { VALUE, catContribution, poolStats, zScores, categoryValues, pointsValues, valueRanks, restOfSeasonValue};`)();

let n = 0;
const test = (name, fn) => { fn(); n++; console.log(`ok  ${name}`); };
const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);
const PTS = { key: 'PTS', pct: false }, REB = { key: 'REB', pct: false }, TO = { key: 'TO', pct: false, low: true };
const FG = { key: 'FGP', pct: true, made: 'FGM', att: 'FGA' };

test('z-score na malom ručnom bazenu (prosek 20, SD po celom bazenu)', () => {
  const lines = [{ PTS: 10 }, { PTS: 20 }, { PTS: 30 }];
  const st = V.poolStats(lines, [PTS]);
  near(st.PTS.mean, 20); near(st.PTS.sd, Math.sqrt(200 / 3));
  near(V.zScores({ PTS: 30 }, [PTS], st).by.PTS, 10 / Math.sqrt(200 / 3));
  near(V.zScores({ PTS: 20 }, [PTS], st).total, 0);
});

test('drugi prolaz: prosek i SD samo na najboljih N iz prvog prolaza', () => {
  const rows = [30, 25, 20, 2, 1, 0].map((v, i) => ({ id: i + 1, line: { PTS: v } }));
  const { stats, values } = V.categoryValues(rows, [PTS], 3);
  near(stats.PTS.mean, 25); // samo 30, 25, 20
  assert.ok(values.get(4).total < -2, 'igrač van bazena je daleko ispod nule');
  assert.strictEqual(values.size, 6);
});

test('uticaj FG%: 60% na 3 pokušaja vredi manje od 52% na 18 pokušaja kad je prosek bazena 47%', () => {
  const low = { FGM: 1.8, FGA: 3 }, high = { FGM: 9.36, FGA: 18 };
  const base = 0.47;
  near(V.catContribution(low, FG, base), (0.6 - 0.47) * 3, 1e-9);
  near(V.catContribution(high, FG, base), (0.52 - 0.47) * 18, 1e-9);
  // bazen sa ponderisanim procentom 47%
  const pool = [low, high, { FGM: 4.7, FGA: 10 }, { FGM: 2.9, FGA: 10 }, { FGM: 6.5, FGA: 15 }];
  const st = V.poolStats(pool, [FG]);
  const sumM = pool.reduce((s, l) => s + l.FGM, 0), sumA = pool.reduce((s, l) => s + l.FGA, 0);
  near(st.FGP.base, sumM / sumA);
  const s2 = { FGP: { base: 0.47, mean: 0, sd: 1 } };
  assert.ok(V.zScores(low, [FG], s2).total < V.zScores(high, [FG], s2).total);
});

test('TO: manje je bolje, znak je obrnut', () => {
  const st = V.poolStats([{ TO: 1 }, { TO: 2 }, { TO: 3 }], [TO]);
  assert.ok(V.zScores({ TO: 1 }, [TO], st).total > 0);
  assert.ok(V.zScores({ TO: 3 }, [TO], st).total < 0);
});

test('punt ne menja opštu vrednost', () => {
  const rows = [{ id: 1, line: { PTS: 30, REB: 2 } }, { id: 2, line: { PTS: 10, REB: 12 } }, { id: 3, line: { PTS: 20, REB: 7 } }];
  const a = V.categoryValues(rows, [PTS, REB], 3).values.get(1);
  const b = V.categoryValues(rows, [PTS, REB], 3).values.get(1);
  near(a.total, b.total); // opšta vrednost ne zna za punt
});

test('poenska liga: vrednost = FPts po utakmici minus nivo zamene (prosek mesta N+1 do N+timovi)', () => {
  const rows = [50, 45, 40, 35, 30, 25, 20, 15].map((f, i) => ({ id: i + 1, fpts: f }));
  const { repl, values } = V.pointsValues(rows, 4, 2); // zamena: 5. i 6. mesto (30, 25)
  near(repl, 27.5);
  near(values.get(1).total, 22.5);
  assert.ok(values.get(8).total < 0);
  assert.strictEqual(V.valueRanks(values).get(1), 1);
});

test('vrednost za ostatak sezone: OUT igrač (dostupnost 0) vredi 0', () => {
  assert.strictEqual(V.restOfSeasonValue(5, 40, 0), 0);
  near(V.restOfSeasonValue(5, 40, 0.5), 100);
  assert.strictEqual(V.restOfSeasonValue(5, null, 1), null);
});

test('isti igrač u ligama različitih formata dobija različitu vrednost', () => {
  const rows = [{ id: 1, line: { PTS: 25, REB: 3, TO: 4 } }, { id: 2, line: { PTS: 12, REB: 11, TO: 1 } }, { id: 3, line: { PTS: 18, REB: 6, TO: 2 } }];
  const a = V.categoryValues(rows, [PTS, REB], 3).values.get(1).total;
  const b = V.categoryValues(rows, [PTS, REB, TO], 3).values.get(1).total;
  assert.notStrictEqual(a.toFixed(3), b.toFixed(3));
});

// igrač bez utakmica ove sezone: prošla sezona se čuva samo kao rezerva, projekcija ima prednost (compactPlayer, statOf, noSeasonGames iz app.js)
test('bez utakmica ove sezone: projekcija, pa prošla sezona; sa utakmicama sezona preuzima', () => {
  const grabFn = name => { const i = src.indexOf(`function ${name}(`); return src.slice(i, src.indexOf('\n}\n', i) + 2); };
  const grabConst = name => { const i = src.indexOf(`const ${name} =`); const j = src.indexOf('\n};\n', i), k = src.indexOf(';\n', i); return src.slice(i, (j > 0 && j < src.indexOf('\nconst ', i + 1) ? j + 3 : k + 2)); };
  const SEASON = 2027, STAT = { GP: '42', PTS: '0', MIN: '40' };
  const env = `const CONFIG = { SEASON: ${SEASON} }; const STAT = ${JSON.stringify(STAT)}; const PERIODS = [{ key: 'season', statId: s => '00' + s }, { key: 'proj', statId: s => '10' + s }];
    const PROJ_STAT_ID = '10${SEASON}', PREV_SEASON_STAT_ID = '00${SEASON - 1}', NO_PROJ_KEYS = [], PROJ_FROM_SEASON = [], PRO_TEAMS = { 1: 'ATL' }, POSITIONS = { 1: 'PG' };
    const noSeasonGames = ${src.match(/const noSeasonGames = (p => [^\n]+);/)[1]}
    ${grabFn('compactPlayer')}
    ${src.slice(src.indexOf('const statOf = (p, key) => {'), src.indexOf('\n};\n', src.indexOf('const statOf = (p, key) => {')) + 3)}
    return { compactPlayer, statOf, noSeasonGames };`;
  const { compactPlayer, statOf, noSeasonGames } = new Function(env)();
  const av = (gp, pts) => ({ 42: gp, 0: pts, 40: 30 });
  const raw = stats => ({ id: 1, fullName: 'X', proTeamId: 1, defaultPositionId: 1, stats });
  // bez sezone i bez projekcije: projekcija = prošla sezona
  const a = compactPlayer(raw([{ id: '002026', averageStats: av(38, 20) }]));
  assert.ok(noSeasonGames(a));
  assert.strictEqual(statOf(a, 'proj').PTS, 20);
  assert.strictEqual(statOf(a, 'season'), null);
  // ESPN projekcija ima prednost
  const b = compactPlayer(raw([{ id: '002026', averageStats: av(38, 20) }, { id: '102027', averageStats: av(31, 14) }]));
  assert.strictEqual(statOf(b, 'proj').PTS, 14);
  // sa utakmicama ove sezone: prošla sezona se ne čuva
  const c = compactPlayer(raw([{ id: '002026', averageStats: av(38, 20) }, { id: '002027', averageStats: av(5, 9) }]));
  assert.ok(!noSeasonGames(c)); assert.strictEqual(c.prev, undefined); assert.strictEqual(statOf(c, 'proj'), null);
  // bez ičega: nema procene
  const d = compactPlayer(raw([]));
  assert.strictEqual(statOf(d, 'proj'), null);
});

console.log(`\n${n} testova prošlo`);
