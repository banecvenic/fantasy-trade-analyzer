// Testovi za filtere igrača (Mete za trejd i Pronađi trejd): polja po ligi, unos brojeva (47 ili .470), važeći filter,
// prolaz kroz filtere, predlog koji filter da se skloni, zaokruživanje kao na ekranu i pravilo "bar jedan" u motoru Pronađi trejd.
// Pokretanje: node tools/test_filters.js
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const src = fs.readFileSync(path.join(__dirname, '..', 'assets', 'app.js'), 'utf8');
const grab = (a, b) => { const i = src.indexOf(a), j = src.indexOf(b, i); if (i < 0 || j < 0) throw new Error(`Nije nađeno: ${a}`); return src.slice(i, j); };
const F = new Function(`${grab('/* ==== Filteri: čista logika ==== */', '/* ==== kraj: Filteri čista logika ==== */')}
return { FLT_DEF, FLT_POS, fltFields, fltParse, fltNorm, fltItems, fltPassOne, fltPass, fltSuggest, fltWithout, fltVals };`)();
const fin = src.indexOf('   Fer trejd: čiste funkcije'), finEnd = src.indexOf('/* ==== kraj: Fer trejd, čiste funkcije ==== */');
const engCode = src.slice(src.lastIndexOf('/*', fin), finEnd);
const { TF, E } = new Function(`${engCode}\nreturn { TF, E: tfEngine() };`)();
const E2 = new Function(`return (${new Function(`${engCode}\nreturn tfEngine;`)().toString()})();`)(); // kao u Web Workeru

let n = 0;
const test = (name, fn) => { fn(); n++; console.log(`ok  ${name}`); };
const keys = list => new Set(list);

test('polja: samo kategorije lige, MIN i GP uvek, FPts prvo u poen ligi, TO samo ako ga liga ima', () => {
  const nine = F.fltFields(false, keys(['PTS', 'REB', 'AST', 'TPM', 'STL', 'BLK', 'FGP', 'FTP', 'TO'])).map(d => d.k);
  assert.deepStrictEqual(nine, ['MIN', 'PTS', 'REB', 'AST', 'STL', 'BLK', 'TPM', 'FGP', 'FTP', 'GP', 'TO']);
  const eight = F.fltFields(false, keys(['PTS', 'REB', 'AST', 'TPM', 'STL', 'BLK', 'FGP', 'FTP'])).map(d => d.k);
  assert.ok(!eight.includes('TO') && eight.includes('MIN') && eight.includes('GP'));
  const pts = F.fltFields(true, keys(['PTS', 'REB', 'AST', 'STL', 'BLK', 'TO', 'FGM', 'FGA'])).map(d => d.k);
  assert.strictEqual(pts[0], 'FPTS');
  assert.ok(!pts.includes('FGP') && pts.includes('TO'));
  assert.ok(!F.fltFields(false, keys(['PTS'])).some(d => d.k === 'FPTS'));
  assert.deepStrictEqual(F.FLT_DEF.filter(d => d.max).map(d => d.k), ['TO']); // TO je jedino "najviše"
});

test('unos: samo brojevi, zarez kao tačka, FG% 47 i .470 su isto', () => {
  assert.strictEqual(F.fltParse('35'), 35);
  assert.strictEqual(F.fltParse('2,5'), 2.5);
  assert.strictEqual(F.fltParse('.5'), 0.5);
  assert.strictEqual(F.fltParse(''), null);
  assert.strictEqual(F.fltParse('abc'), null);
  assert.strictEqual(F.fltParse('3-4'), null);
  assert.strictEqual(F.fltParse('47', true), 0.47);
  assert.strictEqual(F.fltParse('.470', true), 0.47);
  assert.strictEqual(F.fltParse('47.5', true), 0.475);
});

test('važeći filter: kategorija koje liga nema se ignoriše i ne broji se', () => {
  const fields = F.fltFields(false, keys(['PTS', 'REB']));
  const G = F.fltNorm({ min: { MIN: 35, PTS: 20, BLK: 2 }, max: { TO: 2 }, pos: ['PG', 'XX'], healthy: true }, fields);
  assert.deepStrictEqual(G.min, { MIN: 35, PTS: 20 });
  assert.deepStrictEqual(G.max, {});
  assert.deepStrictEqual(G.pos, ['PG']);
  assert.strictEqual(F.fltItems(G).length, 4); // MIN, PTS, pozicije, samo zdravi
  assert.strictEqual(F.fltItems(F.fltNorm(null, fields)).length, 0);
});

const row = (v, pos = ['SG'], ok = true) => ({ v, pos, ok });
test('prolaz: najmanje, TO najviše, pozicija (bar jedna), samo zdravi; igrač bez podataka ne prolazi', () => {
  const fields = F.fltFields(false, keys(['PTS', 'TO']));
  const G = F.fltNorm({ min: { MIN: 35, PTS: 20 }, max: { TO: 3 }, pos: ['PG', 'SG'], healthy: true }, fields);
  assert.ok(F.fltPass(row({ MIN: 35, PTS: 20, TO: 3 }), G));
  assert.ok(!F.fltPass(row({ MIN: 34.9, PTS: 25, TO: 2 }), G));
  assert.ok(!F.fltPass(row({ MIN: 36, PTS: 25, TO: 3.1 }), G));
  assert.ok(F.fltPass(row({ MIN: 36, PTS: 25, TO: 1 }, ['PG', 'SF']), G));
  assert.ok(!F.fltPass(row({ MIN: 36, PTS: 25, TO: 1 }, ['C']), G));
  assert.ok(!F.fltPass(row({ MIN: 36, PTS: 25, TO: 1 }, ['SG'], false), G));
  assert.ok(!F.fltPass(row({}), G));
  const posOnly = F.fltNorm({ pos: ['C'] }, fields);
  assert.ok(F.fltPass(row({}, ['PF', 'C']), posOnly)); // samo pozicija: statistika nije potrebna
});

test('vrednosti kao na ekranu: 34.96 min prolazi MIN 35, procenat iz pogođenih i pokušaja, FPts samo kad je dat', () => {
  const v = F.fltVals({ MIN: 34.96, PTS: 19.96, GP: 7, FGM: 8, FGA: 17, FTM: 0, FTA: 0, TO: 2.04 }, null);
  assert.strictEqual(v.MIN, 35);
  assert.strictEqual(v.PTS, 20);
  assert.strictEqual(v.FGP, 0.471);
  assert.strictEqual(v.FTP, null);
  assert.strictEqual(v.TO, 2);
  assert.strictEqual(v.FPTS, null);
  assert.strictEqual(F.fltVals({ MIN: 30, GP: 3 }, 41.26).FPTS, 41.3);
  assert.deepStrictEqual(F.fltVals(null), {});
});

test('predlog: filter koji najviše oslobađa i koliko bi igrača prošlo bez njega', () => {
  const fields = F.fltFields(false, keys(['PTS', 'STL']));
  const G = F.fltNorm({ min: { MIN: 35, PTS: 20, STL: 3 } }, fields);
  const rows = [row({ MIN: 36, PTS: 25, STL: 1 }), row({ MIN: 37, PTS: 22, STL: 1.5 }), row({ MIN: 30, PTS: 30, STL: 3 }), row({ MIN: 20, PTS: 5, STL: 0.5 })];
  const s = F.fltSuggest(rows, G);
  assert.deepStrictEqual(s, { it: { kind: 'min', k: 'STL' }, n: 2 });
  const H = F.fltWithout({ min: { MIN: 35, PTS: 20, STL: 3 }, max: {}, pos: ['PG'], healthy: true }, s.it);
  assert.deepStrictEqual(H.min, { MIN: 35, PTS: 20 });
  assert.deepStrictEqual(F.fltWithout(H, { kind: 'pos' }).pos, []);
  assert.strictEqual(F.fltWithout(H, { kind: 'healthy' }).healthy, false);
  assert.strictEqual(F.fltSuggest(rows, F.fltNorm({}, fields)), null);
});

// motor: [PTS, REB, AST, TO, FGM, FGA, FPTS]
const KEYS = ['PTS', 'REB', 'AST', 'TO', 'FGM', 'FGA', 'FPTS'];
const cats = [{ key: 'PTS', k: 0 }, { key: 'REB', k: 1 }, { key: 'AST', k: 2 }, { key: 'TO', k: 3, low: true }, { key: 'FGP', pct: true, m: 4, a: 5 }];
const vec = o => KEYS.map(k => o[k] || 0);
const pl = (id, v, o = {}, extra = {}) => ({ id, v, vec: vec(o), mark: null, ir: false, ...extra });
const TFL = { ...TF, BEST_GAIN: -1e9, BEST_GAIN_PTS: -1e9, BEST_CARD: -99, CARD_SD: 0.01, DIV_MINE: 99, DIV_THEIRS: 99, BIG_GAIN: -1e9, BIG_GAIN_PTS: -1e9, BIG_PER_PAGE: 99 }; // pravila pre koraka 5: testovi mehanike (Lock, otpuštanje, IR, filteri) ne zavise od pravila za Najbolje, raznovrsnost i veličinu
const inpFor = (ffIds = null) => {
  const theirs = [pl(20, 6, { PTS: 14, REB: 6, AST: 2, FGM: 5, FGA: 10 }), pl(21, 5.5, { PTS: 12, REB: 5, AST: 3, FGM: 4, FGA: 9 }),
    pl(22, 5, { PTS: 10, REB: 7, AST: 2, FGM: 4, FGA: 8 }), pl(23, 4, { PTS: 8, REB: 3, AST: 4, FGM: 3, FGA: 7 })];
  return {
    pts: false, n: KEYS.length, cats, myIdx: [0, 1, 2, 3, 4], oppIdx: [0, 1, 2, 3, 4], fIdx: 6,
    fa: [pl(900, 1, { PTS: 5, REB: 2, AST: 1, TO: 1, FGM: 2, FGA: 4.5 })], opps: [], sd: [5, 3, 2, 1, 0.05], w: null, oppW: [1, 1, 1, 1, 1],
    limits: [TF.LIMITS.fair, TF.LIMITS.slight, TF.LIMITS.aggr], strategy: 'best', sell: [], buy: [], focus: [], TF: TFL,
    mine: [pl(1, 6, { PTS: 15, REB: 2, AST: 6, TO: 2, FGM: 6, FGA: 13 }), pl(2, 5.5, { PTS: 13, REB: 2, AST: 5, TO: 2, FGM: 5, FGA: 11 }),
      pl(3, 5, { PTS: 11, REB: 3, AST: 4, TO: 1, FGM: 4, FGA: 9 }), pl(4, 4, { PTS: 9, REB: 2, AST: 3, TO: 1, FGM: 3, FGA: 7 })],
    theirs: ffIds ? theirs.map(x => ({ ...x, ff: ffIds.includes(x.id) })) : theirs, fltOn: !!ffIds,
  };
};
test('motor: bez filtera predlozi koriste razne igrače protivnika', () => {
  const res = E.search(inpFor());
  assert.ok(res.list.length > 0, 'nema predloga');
  assert.ok(res.list.some(x => !x.r.includes(22)), 'test nema smisla ako svaki predlog već ima igrača 22');
});
test('motor: sa filterom svaki predlog ima bar jednog igrača koji prolazi; ostali na strani dobijaš su bilo ko', () => {
  for (const eng of [E, E2]) {
    const res = eng.search(inpFor([22]));
    assert.ok(res.list.length > 0, 'nema predloga sa filterom');
    assert.ok(res.list.every(x => x.r.includes(22)), 'predlog bez igrača koji prolazi filter');
    // strana koju dajem se ne filtrira
    assert.ok(new Set(res.list.flatMap(x => x.g)).size > 1);
  }
  assert.strictEqual(E.search(inpFor([])).list.length, 0); // niko ne prolazi: nema predloga
});
test('povezivanje: filter ide u Worker kao deo ulaza, Mete i Pronađi trejd imaju odvojene filtere, potpis prati filter i period', () => {
  assert.ok(src.includes("theirs, fltOn: !!ff, fa:"));
  assert.ok(src.includes("if (inp.fltOn) tCombos = tCombos.filter(c => c.some(i => theirs[i].ff));"));
  assert.ok(src.includes("fltSig('tf', ctx.scopeKey)") && src.includes("fltSig('tt', ttScope(lg))"));
  assert.ok(/fltSig = \(tool, scope = fltScope\(\)\) => \{[^\n]*state\.period/.test(src));
  assert.ok(src.includes("const fltPool = list.map(x => x.id), flt = fltEff('tt', ttScope(lg));"), 'Mete: filter pre rangiranja');
  // Pojačanja sa FA: filter pre rangiranja, Trejd kandidati bez filtera, dugme samo u uvezenoj ligi
  assert.ok(src.includes("const pool = poolAll.filter(fltOk);") && src.includes("tradeCandidates(mine, poolAll,"));
  assert.ok(src.includes("state.page === 'fa' && isSynced(currentLeague()) ? 'fa'"));
  // Mete za trejd (mogući trejd u izveštaju) ne šalju filter
  assert.ok(src.includes('m = { TM, inp: tfInput(TM) }'));
});

console.log(`\n${n} testova prošlo`);
