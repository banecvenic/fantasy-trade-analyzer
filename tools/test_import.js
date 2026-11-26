// Testovi za uvoz lige: ID iz URL-a, prepoznavanje imena, parser nalepljenog rostera, roto plasman.
// Pokretanje: node tools/test_import.js
// Deo app.js između oznaka "Uvoz lige: čiste funkcije" i "kraj: Uvoz lige" se izvršava bez browsera.
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const src = fs.readFileSync(path.join(__dirname, '..', 'assets', 'app.js'), 'utf8');
const start = src.indexOf('   Uvoz lige: čiste funkcije');
const end = src.indexOf('/* ==== kraj: Uvoz lige, čiste funkcije ==== */');
if (start < 0 || end < 0) throw new Error('Nije nađen modul uvoza u app.js');
const code = src.slice(src.lastIndexOf('/*', start), end);
const api = new Function(`${code}\nreturn { parseEspnLeagueId, parseFantraxLeagueId, parseSleeperInput, nameKey, buildNameIndex, matchName, parseRosterText, rotoRanks, rotoProjection };`)();
const { parseEspnLeagueId, parseFantraxLeagueId, parseSleeperInput, nameKey, buildNameIndex, matchName, parseRosterText, rotoRanks, rotoProjection } = api;

let n = 0;
const test = (name, fn) => { fn(); n++; console.log(`ok  ${name}`); };

test('ESPN ID: broj, URL sa leagueId, URL sa više parametara, neispravno', () => {
  assert.strictEqual(parseEspnLeagueId('411647'), '411647');
  assert.strictEqual(parseEspnLeagueId(' 411647 '), '411647');
  assert.strictEqual(parseEspnLeagueId('https://fantasy.espn.com/basketball/league?leagueId=411647'), '411647');
  assert.strictEqual(parseEspnLeagueId('https://fantasy.espn.com/basketball/team?leagueId=123456&teamId=3&seasonId=2027'), '123456');
  assert.strictEqual(parseEspnLeagueId('fantasy.espn.com/basketball/league/standings?seasonId=2027&leagueId=98765'), '98765');
  for (const x of ['', 'abc', 'https://fantasy.espn.com/basketball/league', '12', null]) assert.strictEqual(parseEspnLeagueId(x), null, String(x));
});

test('Fantrax ID: URL lige, sam ID, neispravno', () => {
  assert.strictEqual(parseFantraxLeagueId('https://www.fantrax.com/fantasy/league/ab12cd34ef56gh78/home'), 'ab12cd34ef56gh78');
  assert.strictEqual(parseFantraxLeagueId('https://www.fantrax.com/fantasy/league/ab12cd34ef56gh78/team/roster;teamId=xyz'), 'ab12cd34ef56gh78');
  assert.strictEqual(parseFantraxLeagueId('ab12cd34ef56gh78'), 'ab12cd34ef56gh78');
  for (const x of ['', 'league', '12345678', 'https://example.com/league/x']) assert.strictEqual(parseFantraxLeagueId(x), null, String(x));
});

test('Sleeper: URL lige, broj lige, korisničko ime', () => {
  assert.deepStrictEqual(parseSleeperInput('https://sleeper.com/leagues/1180226123456789012/team'), { leagueId: '1180226123456789012' });
  assert.deepStrictEqual(parseSleeperInput('1180226123456789012'), { leagueId: '1180226123456789012' });
  assert.deepStrictEqual(parseSleeperInput('bane_cvenic'), { username: 'bane_cvenic' });
  assert.strictEqual(parseSleeperInput(''), null);
  assert.strictEqual(parseSleeperInput('ime sa razmakom'), null);
});

const POOL = [
  { id: 1, name: 'Nikola Jokić' }, { id: 2, name: 'Nikola Vučević' }, { id: 3, name: 'Jaren Jackson Jr.' },
  { id: 4, name: "De'Aaron Fox" }, { id: 5, name: 'P.J. Washington' }, { id: 6, name: 'Luka Dončić' },
  { id: 7, name: 'Jalen Williams' }, { id: 8, name: 'Jaylin Williams' }, { id: 9, name: 'Gary Trent Jr.' },
  { id: 10, name: 'Kelly Oubre Jr.' }, { id: 11, name: 'Trae Young' }, { id: 12, name: 'Marcus Morris Sr.' },
  { id: 13, name: 'Jalen Johnson' }, { id: 14, name: 'Jamal Murray' }, { id: 15, name: 'Robert Williams III' },
];
const IDX = buildNameIndex(POOL);

test('ime: dijakritike, sufiksi, tačke, apostrofi, "Prezime, Ime"', () => {
  assert.strictEqual(nameKey('Nikola Jokić'), 'nikola jokic');
  assert.strictEqual(nameKey('Jaren Jackson Jr.'), 'jaren jackson');
  assert.strictEqual(nameKey('Robert Williams III'), 'robert williams');
  assert.strictEqual(nameKey("De'Aaron Fox"), 'deaaron fox');
  assert.strictEqual(nameKey('P.J. Washington'), 'pj washington');
  assert.strictEqual(nameKey('Jokic, Nikola'), 'nikola jokic');
  assert.deepStrictEqual(matchName('Nikola Jokic', IDX), { id: 1 });
  assert.deepStrictEqual(matchName('Luka Doncic', IDX), { id: 6 });
  assert.deepStrictEqual(matchName('Jaren Jackson', IDX), { id: 3 });
  assert.deepStrictEqual(matchName('Jaren Jackson Jr', IDX), { id: 3 });
  assert.deepStrictEqual(matchName('DeAaron Fox', IDX), { id: 4 });
  assert.deepStrictEqual(matchName('PJ Washington', IDX), { id: 5 });
  assert.deepStrictEqual(matchName('Jokic, Nikola', IDX), { id: 1 });
  assert.deepStrictEqual(matchName('Marcus Morris', IDX), { id: 12 });
});

test('ime: skraćeno "N. Jokic" samo kad je jednoznačno; dvosmisleno se ne pogađa', () => {
  assert.deepStrictEqual(matchName('N. Jokic', IDX), { id: 1 });
  assert.deepStrictEqual(matchName('N Vucevic', IDX), { id: 2 });
  assert.deepStrictEqual(matchName('J. Williams', IDX), { ambiguous: [7, 8] });
  assert.strictEqual(matchName('Nikola', IDX), null);
  assert.strictEqual(matchName('Michael Jordan', IDX), null);
});

test('ime: nadimak i puno ime (Ron = Ronald, Nicolas = Nic), samo uz isto prezime i jednoznačno', () => {
  const idx = buildNameIndex([{ id: 1, name: 'Ronald Holland II' }, { id: 2, name: 'Nic Claxton' }, { id: 3, name: 'Jalen Williams' }, { id: 4, name: 'Jaylin Williams' }, { id: 5, name: 'Robert Williams III' }]);
  assert.deepStrictEqual(matchName('Ron Holland', idx), { id: 1 });
  assert.deepStrictEqual(matchName('Holland, Ron', idx), { id: 1 });
  assert.deepStrictEqual(matchName('Nicolas Claxton', idx), { id: 2 });
  assert.deepStrictEqual(matchName('Rob Williams', idx), { id: 5 });
  assert.strictEqual(matchName('Ja Williams', idx), null);     // kratko i dvosmisleno
  assert.deepStrictEqual(matchName('Jal Williams', idx), { id: 3 }); // samo Jalen počinje sa "jal"
  assert.strictEqual(matchName('Ron Williams', idx), null);   // isto prezime, ali nijedno ime ne počinje sa "ron"
});

test('nalepljen roster (Yahoo stil): imena iz šuma, statusi i statistike se ignorišu, neprepoznata imena se vraćaju', () => {
  const text = [
    'Starters\tPos\tStatus\tOpp\tFGM/A\tFG%\tPTS',
    'PG\tTrae Young Atl - PG\t\t@BOS\t8/19\t.421\t27',
    'C\tN. Jokic Den - C,PF\t\tvs LAL\t11/18\t.611\t30',
    'SF\tJaren Jackson Jr. Mem - PF,C\tGTD\t\t-\t-\t-',
    "G\tDe'Aaron Fox Sac - PG\tINJ",
    'Util\tLuka Dončić LAL - PG,SG\tO',
    'BN\tVictor Unknownplayer SA - C',
    'BN\tJ. Williams OKC - SF',
    'Totals\t\t\t\t45/90\t.500\t110',
    '',
    'IR\tNikola Jokic Den - C',
  ].join('\n');
  const r = parseRosterText(text, IDX);
  assert.deepStrictEqual(r.matched.map(x => x.id), [11, 1, 3, 4, 6]); // Jokić samo jednom
  assert.deepStrictEqual(r.ambiguous.map(x => x.ids), [[7, 8]]);
  assert.deepStrictEqual(r.unmatched, ['Victor Unknownplayer']);
});

test('nalepljen roster: namerno pokvaren tekst (bez imena, samo brojke i znakovi) ne pravi lažne igrače', () => {
  const r = parseRosterText('12 34 56\n---\n!!! ### \nPTS REB AST\n.500 .812\n\tGTD O INJ', IDX);
  assert.deepStrictEqual(r, { matched: [], ambiguous: [], unmatched: [] });
});

const CATS = [
  { key: 'PTS' }, { key: 'TO', lowerIsBetter: true },
  { key: 'FGP', made: 'FGM', att: 'FGA' },
];
const TEAMS = [
  { id: 'a', vals: { PTS: 9000, TO: 1200, FGM: 3300, FGA: 7000, FGP: 0.9 } }, // FGP iz zbirova: .471
  { id: 'b', vals: { PTS: 9500, TO: 1100, FGM: 3000, FGA: 6500, FGP: 0.1 } }, // .462
  { id: 'c', vals: { PTS: 9000, TO: 1300, FGM: 3500, FGA: 7300, FGP: 0.5 } }, // .479
];

test('roto plasman: zbirovi, manje je bolje, nerešeno, procenat ponderisano iz pogodaka i pokušaja', () => {
  const r = rotoRanks(TEAMS, CATS);
  assert.deepStrictEqual(r.a, { PTS: 2, TO: 2, FGP: 2 });
  assert.deepStrictEqual(r.b, { PTS: 1, TO: 1, FGP: 3 });
  assert.deepStrictEqual(r.c, { PTS: 2, TO: 3, FGP: 1 });
});

test('roto plasman: procenat bez zbirova koristi gotovu vrednost', () => {
  const r = rotoRanks([{ id: 'x', vals: { FGP: 0.48 } }, { id: 'y', vals: { FGP: 0.47 } }], [{ key: 'FGP', made: 'FGM', att: 'FGA' }]);
  assert.deepStrictEqual(r, { x: { FGP: 1 }, y: { FGP: 2 } });
});

test('roto procena posle trejda: delta po ključu i preko pogodaka i pokušaja', () => {
  // tim a dobija 600 PTS, 150 TO više; šut 300/500 (60%) podiže FG% sa .471 na .486
  const p = rotoProjection(TEAMS, 'a', { PTS: 600, TO: 150, FGM: 300, FGA: 500 }, CATS);
  assert.deepStrictEqual(p, [
    { key: 'PTS', before: 2, after: 1 },
    { key: 'TO', before: 2, after: 3 },
    { key: 'FGP', before: 2, after: 1 },
  ]);
});

// Parser ESPN lige na umanjenom uzorku prave javne lige 411647 (sezona 2019, H2H poeni).
// U uzorak su namerno ubačena imena i GUID vlasnika: parser ih ne sme preneti.
const fStart = src.indexOf('   Formati lige: katalog statistika');
const fEnd = src.indexOf('const leagueFormatOf');
const pStart = src.indexOf('/** valuesByStat (zbirovi cele sezone');
const pEnd = src.indexOf('/* ---------- Spisak imena');
if (fStart < 0 || fEnd < 0 || pStart < 0 || pEnd < 0) throw new Error('Nije nađen modul formata ili ESPN parser u app.js');
const fmtCode = src.slice(src.lastIndexOf('/*', fStart), src.indexOf('\n', fEnd));
const espn = new Function('LANG', `const IR_SLOT = 13; const BENCH_SLOT = 12; const ROSTER_DEFAULT = { ACTIVE: 13, IR: 2 };
  const cleanName = x => String(x ?? '').replace(/\\s+/g, ' ').trim().slice(0, 40);
  ${fmtCode}\n${src.slice(pStart, pEnd)}\nreturn { parseEspnLeague };`)('sr');
const FIX = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'espn_411647_2019_min.json'), 'utf8'));

test('ESPN liga 411647: naziv, mesta (klupa i IR), rok, format, timovi, IR igrači, zbirovi, bez imena vlasnika', () => {
  const r = espn.parseEspnLeague(FIX, '411647', 2019);
  assert.strictEqual(r.name, 'Back from the Future');
  assert.strictEqual(r.size, 12);
  assert.deepStrictEqual(r.slots, { active: 16, ir: 2, start: 11 }); // 11 startnih (postava) (PG…C, G, F, PF/C, 2× UT) + 5 klupa (slot 12) = 16; slot 13 = 2 IR
  assert.strictEqual(r.deadline, 1550340000000);
  assert.strictEqual(r.scoringType, 'H2H_POINTS');
  assert.strictEqual(r.format.scoringType, 'h2h_points');
  assert.strictEqual(r.teams.length, 3);
  const [a, b] = r.teams;
  assert.strictEqual(a.name, 'Flight 9'); // dupli razmaci se skupljaju
  assert.strictEqual(a.seed, 1);
  assert.deepStrictEqual(a.record, { w: 18, l: 0, t: 0 });
  assert.deepStrictEqual(a.players.filter(x => x.ir).map(x => x.id), [3995, 4277961]);
  assert.strictEqual(b.players.some(x => x.ir), false);
  assert.strictEqual(a.vals.PTS, 19146);
  assert.strictEqual(a.vals.FGM, 7112);
  assert.strictEqual(a.vals.FGA, 15124);
  assert.strictEqual(a.vals.TO, 2314);
  assert.strictEqual(r.raw.get(3995).player.id, 3995);
  const stored = JSON.stringify({ ...r, raw: undefined });
  for (const x of ['IMEVLASNIKA', 'PREZIMEVLASNIKA', 'GUID', 'nadimak1', 'owners']) assert.ok(!stored.includes(x), x);
});

// Sleeper bodovanje: ključevi kao u api.sleeper.app/v1/stats/nba (pts, reb, fgmi, pts_reb_ast, bonus_pt_40p ...)
const slp = new Function('LANG', `${fmtCode}\nreturn { mapSleeperFormat };`)('sr');
test('Sleeper bodovanje: težine, zbirne stavke, promašaji, nepodržano, prazno', () => {
  const r = slp.mapSleeperFormat({ pts: 1, reb: 1.2, ast: 1.5, stl: 3, blk: 3, to: -1, tpm: 0.5, fgmi: -0.5, pts_reb_ast: 0.1, dd: 0, tf: -2, bonus_pt_40p: 2 });
  assert.strictEqual(r.error, null);
  assert.strictEqual(r.format.scoringType, 'h2h_points');
  assert.strictEqual(r.format.source, 'import:sleeper');
  const w = r.format.weights;
  assert.strictEqual(w.PTS, 1.1); assert.strictEqual(w.REB, 1.3); assert.strictEqual(w.AST, 1.6);
  assert.strictEqual(w.FGA, -0.5); assert.strictEqual(w.FGM, 0.5); assert.strictEqual(w.TPM, 0.5); assert.strictEqual(w.TO, -1);
  assert.ok(!('DD' in w));
  assert.strictEqual(w.TF, -2); // tehničke greške su sada statistika (ESPN stat 10)
  assert.deepStrictEqual(r.format.bonus, [{ s: 'PTS', n: 40, w: 2 }]);
  assert.deepStrictEqual(r.format.unsupported, []);
  assert.deepStrictEqual(slp.mapSleeperFormat({ pts: 1, xyz: 3 }).format.unsupported, ['Sleeper: xyz']);
  assert.deepStrictEqual(slp.mapSleeperFormat({}), { format: null, error: 'empty' });
  assert.deepStrictEqual(slp.mapSleeperFormat(null), { format: null, error: 'empty' });
});

console.log(`\n${n} testova prošlo`);
