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
const api = new Function('LANG', `${code}\nreturn { STAT_CATALOG, STAT_BY_ID, FORMAT_PRESETS, normalizeFormat, defaultFormatFor, legacyFormat, leagueFormatOf };`)('sr');
const { STAT_CATALOG, FORMAT_PRESETS, normalizeFormat, defaultFormatFor, leagueFormatOf } = api;

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

console.log(`\n${n} testova prošlo`);
