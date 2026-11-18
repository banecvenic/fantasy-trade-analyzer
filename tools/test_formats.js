// Testovi za model formata lige (normalizeFormat, postavke, podrazumevani format).
// Pokretanje: node tools/test_formats.js
// Deo app.js između oznaka "Formati lige:" i "leagueFormatOf" se izvršava sa malim zamenama za browser.
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const src = fs.readFileSync(path.join(__dirname, '..', 'assets', 'app.js'), 'utf8');
const start = src.indexOf('   Formati lige: katalog statistika');
const end = src.indexOf('const leagueFormatOf');
if (start < 0 || end < 0) throw new Error('Nije nađen modul formata u app.js');
const code = src.slice(src.lastIndexOf('/*', start), src.indexOf('\n', end));
const api = new Function('LANG', `${code}\nreturn { STAT_CATALOG, STAT_BY_ID, FORMAT_PRESETS, normalizeFormat, defaultFormatFor, legacyFormat, leagueFormatOf, encodeFormat, decodeFormat, sameFormat, mapEspnFormat };`)('sr');
const { STAT_CATALOG, FORMAT_PRESETS, normalizeFormat, defaultFormatFor, leagueFormatOf, encodeFormat, decodeFormat, sameFormat, mapEspnFormat } = api;

let n = 0;
const test = (name, fn) => { fn(); n++; console.log(`ok  ${name}`); };
const NINE = FORMAT_PRESETS['9cat'].categories;

test('katalog: jedinstveni id, odnosi upućuju na postojeće zbirove', () => {
  const ids = STAT_CATALOG.map(x => x.id);
  assert.strictEqual(new Set(ids).size, ids.length);
  for (const x of STAT_CATALOG) {
    assert.ok(['sum', 'ratio'].includes(x.type), x.id);
    assert.ok(['high', 'low'].includes(x.dir), x.id);
    assert.ok(x.en && x.sr && x.label && x.espn.length, x.id);
    if (x.type === 'ratio') { assert.strictEqual(api.STAT_BY_ID.get(x.num).type, 'sum'); assert.strictEqual(api.STAT_BY_ID.get(x.den).type, 'sum'); assert.ok(x.lowVol > 0); }
  }
});

test('prazno i neispravno -> 9-cat H2H', () => {
  for (const raw of [null, undefined, 5, 'x', {}]) {
    const f = normalizeFormat(raw);
    assert.strictEqual(f.scoringType, 'h2h_each');
    assert.deepStrictEqual(f.categories, NINE);
    assert.strictEqual(f.preset, '9cat');
    assert.strictEqual(f.source, 'manual');
  }
});

test('stara liga (bez leagueFormat) -> 9-cat H2H, ručni unos', () => {
  const f = leagueFormatOf({ format: 'h2h-cat' });
  assert.deepStrictEqual(f, { scoringType: 'h2h_each', categories: NINE, weights: {}, preset: '9cat', source: 'manual', unsupported: [] });
});

test('8cat postavka', () => {
  const f = normalizeFormat({ scoringType: 'h2h_each', preset: '8cat' });
  assert.deepStrictEqual(f.categories, NINE.filter(x => x !== 'TO'));
});

test('custom kategorije: nepoznate se izbacuju, duplikati takođe, redosled ostaje', () => {
  const f = normalizeFormat({ scoringType: 'roto', categories: ['FGP', 'OREB', 'XYZ', 'ATO', 'OREB', 'PTS'], preset: 'custom' });
  assert.deepStrictEqual(f.categories, ['FGP', 'OREB', 'ATO', 'PTS']);
  assert.strictEqual(f.preset, 'custom');
  assert.strictEqual(f.scoringType, 'roto');
});

test('custom isti kao 9cat (drugi redosled) -> preset 9cat, redosled ostaje', () => {
  const cats = [...NINE].reverse();
  const f = normalizeFormat({ scoringType: 'h2h_most', categories: cats, preset: 'custom' });
  assert.strictEqual(f.preset, '9cat');
  assert.deepStrictEqual(f.categories, cats);
});

test('preset 9cat sa 12 kategorija -> custom', () => {
  const f = normalizeFormat({ scoringType: 'h2h_each', categories: [...NINE, 'TPP', 'OREB', 'ATO'], preset: '9cat' });
  assert.strictEqual(f.preset, 'custom');
  assert.strictEqual(f.categories.length, 12);
});

test('manje od 2 kategorije -> postavka', () => {
  assert.deepStrictEqual(normalizeFormat({ scoringType: 'h2h_each', categories: ['PTS'] }).categories, NINE);
});

test('poeni: postavke ESPN, ESPN classic, Yahoo', () => {
  assert.deepStrictEqual(normalizeFormat({ scoringType: 'h2h_points', preset: 'espn_points' }).weights, { PTS: 1, TPM: 1, FGM: 2, FGA: -1, FTM: 1, FTA: -1, REB: 1, AST: 2, STL: 4, BLK: 4, TO: -2 });
  assert.deepStrictEqual(normalizeFormat({ scoringType: 'h2h_points', preset: 'espn_points_classic' }).weights, { PTS: 1, FGM: 1, FGA: -1, FTM: 1, FTA: -1, REB: 1, AST: 1, STL: 1, BLK: 1, TO: -1 });
  assert.deepStrictEqual(normalizeFormat({ scoringType: 'season_points', preset: 'yahoo_points' }).weights, { PTS: 1, REB: 1.2, AST: 1.5, STL: 3, BLK: 3, TO: -1 });
  assert.deepStrictEqual(normalizeFormat({ scoringType: 'h2h_points', preset: 'yahoo_points' }).categories, []);
});

test('poeni: izmenjena težina -> custom; odnosi, nule i nepoznato se izbacuju', () => {
  const w = { ...FORMAT_PRESETS.yahoo_points.weights, BLK: 4, FGP: 10, XYZ: 2, PF: 0, DD: '2.5' };
  const f = normalizeFormat({ scoringType: 'h2h_points', preset: 'yahoo_points', weights: w });
  assert.strictEqual(f.preset, 'custom');
  assert.deepStrictEqual(f.weights, { PTS: 1, REB: 1.2, AST: 1.5, STL: 3, BLK: 4, TO: -1, DD: 2.5 });
});

test('poeni: custom težine iste kao ESPN -> preset espn_points', () => {
  const f = normalizeFormat({ scoringType: 'h2h_points', preset: 'custom', weights: { ...FORMAT_PRESETS.espn_points.weights } });
  assert.strictEqual(f.preset, 'espn_points');
});

test('kategorije u ligi na poene i težine u ligi na kategorije se brišu', () => {
  assert.deepStrictEqual(normalizeFormat({ scoringType: 'h2h_points', preset: 'espn_points', categories: NINE }).categories, []);
  assert.deepStrictEqual(normalizeFormat({ scoringType: 'h2h_each', preset: '9cat', weights: { PTS: 1 } }).weights, {});
});

test('unsupported: očišćeno, bez duplikata, ograničena dužina; izvor uvoza', () => {
  const f = normalizeFormat({ scoringType: 'h2h_points', preset: 'espn_points', unsupported: ['  Technical  fouls ', 'Technical fouls', '', null, 'x'.repeat(80)], source: 'import:espn' });
  assert.deepStrictEqual(f.unsupported, ['Technical fouls', 'x'.repeat(40)]);
  assert.strictEqual(f.source, 'import:espn');
  assert.strictEqual(normalizeFormat({ source: 'hack<script>' }).source, 'manual');
});

test('podrazumevano po platformi', () => {
  assert.strictEqual(defaultFormatFor('espn', 'cat').preset, '9cat');
  assert.strictEqual(defaultFormatFor('espn', 'points').preset, 'espn_points');
  assert.strictEqual(defaultFormatFor('yahoo', 'cat').preset, '9cat');
  assert.strictEqual(defaultFormatFor('yahoo', 'points').preset, 'yahoo_points');
  assert.strictEqual(defaultFormatFor('cbs', 'points').preset, 'custom');
  assert.strictEqual(defaultFormatFor('sleeper', 'cat').preset, '9cat');
});

test('normalizacija je stabilna (dva puta isto)', () => {
  for (const raw of [{}, { scoringType: 'roto', categories: ['PTS', 'TPP', 'ATO'] }, { scoringType: 'h2h_points', weights: { PTS: 1, DD: 3 } }]) {
    const a = normalizeFormat(raw);
    assert.deepStrictEqual(normalizeFormat(a), a);
  }
});

test('link: format tam i nazad (postavke, svoje kategorije, svoje težine sa decimalama i minusom)', () => {
  const cases = [
    normalizeFormat(null),
    normalizeFormat({ scoringType: 'h2h_most', preset: '8cat' }),
    normalizeFormat({ scoringType: 'roto', categories: ['PTS', 'TPP', 'OREB', 'ATO', 'FGP'] }),
    normalizeFormat({ scoringType: 'h2h_points', preset: 'yahoo_points' }),
    normalizeFormat({ scoringType: 'season_points', weights: { PTS: 1, REB: 1.25, TO: -1.5, DD: 3 } }),
  ];
  for (const f of cases) { const back = decodeFormat(encodeFormat(f)); assert.deepStrictEqual(back, f, encodeFormat(f)); assert.ok(sameFormat(back, f)); }
  assert.strictEqual(encodeFormat(normalizeFormat(null)), 'e.9cat');
  assert.strictEqual(encodeFormat(cases[4]), 's.c.PTS_1,REB_1.25,TO_-1.5,DD_3');
});

test('link: neispravan format -> null', () => {
  for (const x of [null, '', 'x', 'e', 'e.nema', 'p.9cat', 'e.c.PTS', 'p.c.', 'z.9cat']) assert.strictEqual(decodeFormat(x), null, String(x));
});

// ---- C6: uvoz ESPN podešavanja (primeri u obliku odgovora ESPN API-ja, view mSettings) ----
const espnItem = (statId, points = 0, isReverseItem = false) => ({ statId, points, isReverseItem, pointsOverrides: {} });

test('ESPN: 9-cat H2H (redosled iz lige) -> preset 9cat, izvor import:espn', () => {
  const settings = { scoringSettings: { scoringType: 'H2H_CATEGORY', scoringItems: [19, 20, 17, 6, 3, 2, 1, 11, 0].map(id => espnItem(id, 0, id === 11)) } };
  const { format, error } = mapEspnFormat(settings);
  assert.strictEqual(error, null);
  assert.strictEqual(format.scoringType, 'h2h_each');
  assert.strictEqual(format.preset, '9cat');
  assert.strictEqual(format.source, 'import:espn');
  assert.deepStrictEqual(format.categories, ['FGP', 'FTP', 'TPM', 'REB', 'AST', 'STL', 'BLK', 'TO', 'PTS']);
});

test('ESPN: 12 kategorija sa 3P%, OREB i A/TO, većina kategorija', () => {
  const ids = [0, 6, 3, 17, 2, 1, 19, 20, 11, 21, 4, 35];
  const { format } = mapEspnFormat({ scoringSettings: { scoringType: 'H2H_MOST_CATEGORIES', scoringItems: ids.map(id => espnItem(id)) } });
  assert.strictEqual(format.scoringType, 'h2h_most');
  assert.strictEqual(format.preset, 'custom');
  assert.deepStrictEqual(format.categories, ['PTS', 'REB', 'AST', 'TPM', 'STL', 'BLK', 'FGP', 'FTP', 'TO', 'TPP', 'OREB', 'ATO']);
});

test('ESPN: roto', () => {
  const { format } = mapEspnFormat({ scoringSettings: { scoringType: 'ROTO', scoringItems: [0, 6, 3, 2, 1, 19, 20, 17].map(id => espnItem(id)) } });
  assert.strictEqual(format.scoringType, 'roto');
  assert.strictEqual(format.preset, '8cat');
});

test('ESPN: H2H poeni, podrazumevano bodovanje -> espn_points', () => {
  const pts = { 0: 1, 17: 1, 13: 2, 14: -1, 15: 1, 16: -1, 6: 1, 3: 2, 2: 4, 1: 4, 11: -2 };
  const { format } = mapEspnFormat({ scoringSettings: { scoringType: 'H2H_POINTS', scoringItems: Object.entries(pts).map(([id, w]) => espnItem(+id, w)) } });
  assert.strictEqual(format.scoringType, 'h2h_points');
  assert.strictEqual(format.preset, 'espn_points');
  assert.deepStrictEqual(format.weights, FORMAT_PRESETS.espn_points.weights);
  assert.deepStrictEqual(format.categories, []);
});

test('ESPN: poeni za sezonu, svoje težine, nepoznata statistika i nula', () => {
  const items = [espnItem(0, 1), espnItem(6, 1.2), espnItem(37, 5), espnItem(9, -0.5), espnItem(3, 0), espnItem(7, 2), espnItem(19, 10)];
  const { format } = mapEspnFormat({ scoringSettings: { scoringType: 'TOTAL_POINTS', scoringItems: items } });
  assert.strictEqual(format.scoringType, 'season_points');
  assert.strictEqual(format.preset, 'custom');
  assert.deepStrictEqual(format.weights, { PTS: 1, REB: 1.2, DD: 5, PF: -0.5 });
  assert.deepStrictEqual(format.unsupported, ['ESPN stat 7', 'FG%']);
});

test('ESPN: format bez trejdova / jedna utakmica i prazna podešavanja', () => {
  assert.strictEqual(mapEspnFormat({ scoringSettings: { scoringType: 'H2H_SINGLE_SCORE', scoringItems: [] } }).error, 'type');
  assert.strictEqual(mapEspnFormat(null).error, 'empty');
  assert.strictEqual(mapEspnFormat({}).error, 'empty');
});

console.log(`\n${n} testova prošlo`);
