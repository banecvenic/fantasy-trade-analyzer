// Testovi za alerte i koeficijent dostupnosti: pamćenje statusa po ligi, alert jednom, sakrivanje, redosled, IR pravila.
// Pokretanje: node tools/test_alerts.js
// Deo app.js između oznaka "Alerti i dostupnost: čiste funkcije" i "kraj: Alerti" se izvršava bez browsera.
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const src = fs.readFileSync(path.join(__dirname, '..', 'assets', 'app.js'), 'utf8');
const start = src.indexOf('   Alerti i dostupnost: čiste funkcije');
const end = src.indexOf('/* ==== kraj: Alerti, čiste funkcije ==== */');
if (start < 0 || end < 0) throw new Error('Nije nađen modul alerta u app.js');
const code = src.slice(src.lastIndexOf('/*', start), end);
const A = new Function(`${code}\nreturn { sleeperGroup, trackStatus, statusEvent, irVerdict, sortAlerts, keepHidden, availFactor, sleeperDeadline, SLEEPER_IR_KEY, sleeperStatus, stGroup, resolveStatus, orJoin, isStatusNews };`)();

let n = 0;
const test = (name, fn) => { fn(); n++; console.log(`ok  ${name}`); };
const H = 36e5, DAY = 864e5, T0 = Date.UTC(2026, 10, 23, 12);

test('prvo pokretanje: samo pamti stanje, bez promena (nema alerta)', () => {
  const { mem, changed } = A.trackStatus(null, [{ id: 1, g: 'OUT', label: 'OUT' }, { id: 2, g: 'OK', label: '' }], T0);
  assert.strictEqual(changed, true);
  assert.deepStrictEqual(mem[1], ['OUT', 0, null, 'OUT']);
  assert.strictEqual(A.statusEvent(mem[1], T0, 72), false);
  assert.strictEqual(A.statusEvent(mem[2], T0, 72), false);
});

test('promena statusa okida alert jednom: važi 72 h, posle se ne ponavlja dok je igrač i dalje OUT', () => {
  let { mem } = A.trackStatus(null, [{ id: 1, g: 'OK', label: '' }], T0);
  ({ mem } = A.trackStatus(mem, [{ id: 1, g: 'OUT', label: 'Out' }], T0 + H));
  assert.deepStrictEqual(mem[1], ['OUT', T0 + H, 'OK', 'Out']);
  assert.strictEqual(A.statusEvent(mem[1], T0 + 2 * H, 72), true);
  // isti status sledećih dana: vreme promene se ne menja, alert ističe posle 72 h
  const again = A.trackStatus(mem, [{ id: 1, g: 'OUT', label: 'Out' }], T0 + 2 * DAY);
  assert.strictEqual(again.changed, false);
  assert.strictEqual(again.mem[1][1], T0 + H);
  assert.strictEqual(A.statusEvent(again.mem[1], T0 + 4 * DAY, 72), false);
});

test('DTD -> OUT je nova promena; DTD -> GTD (ista grupa) nije', () => {
  let { mem } = A.trackStatus(null, [{ id: 1, g: A.sleeperGroup('DTD'), label: 'DTD' }], T0);
  const same = A.trackStatus(mem, [{ id: 1, g: A.sleeperGroup('GTD'), label: 'GTD' }], T0 + H);
  assert.strictEqual(same.mem[1][1], 0);
  assert.strictEqual(same.mem[1][3], 'GTD'); // oznaka se osvežava
  const out = A.trackStatus(same.mem, [{ id: 1, g: A.sleeperGroup('Out'), label: 'Out' }], T0 + 2 * H);
  assert.strictEqual(A.statusEvent(out.mem[1], T0 + 3 * H, 72), true);
});

test('igrač koji više nije na rosteru se briše iz pamćenja', () => {
  const { mem } = A.trackStatus(null, [{ id: 1, g: 'OK', label: '' }, { id: 2, g: 'OK', label: '' }], T0);
  const r = A.trackStatus(mem, [{ id: 1, g: 'OK', label: '' }], T0 + H);
  assert.strictEqual(r.changed, true);
  assert.deepStrictEqual(Object.keys(r.mem), ['1']);
});

test('sakriven alert se ne vraća bez nove promene, a nova promena (novi ključ) se prikazuje', () => {
  let hidden = { 'st:1:1000': T0, 'min:2': T0 };
  // isti alerti i dalje aktivni: ostaju sakriveni
  hidden = A.keepHidden(hidden, new Set(['st:1:1000', 'min:2']));
  assert.deepStrictEqual(Object.keys(hidden).sort(), ['min:2', 'st:1:1000']);
  // nova promena statusa igrača 1 ima novi ključ: nije sakrivena
  const list = [{ key: 'st:1:5000' }, { key: 'min:2' }];
  assert.deepStrictEqual(list.filter(a => !hidden[a.key]).map(a => a.key), ['st:1:5000']);
  // pad minuta je prestao: sakrivanje se briše, pa se sledeći pad opet prikazuje
  hidden = A.keepHidden(hidden, new Set(['st:1:5000']));
  assert.deepStrictEqual(hidden, {});
});

test('redosled važnosti: rok, IR, nove povrede, minutaža, vesti, ponude; u grupi najnovije gore', () => {
  const list = [
    { kind: 'offer', ts: 9 }, { kind: 'news', ts: 5 }, { kind: 'min', ts: 1 }, { kind: 'inj', ts: 2 }, { kind: 'back', ts: 3 },
    { kind: 'irback', ts: 1 }, { kind: 'dl', ts: 0 }, { kind: 'news', ts: 8 },
  ];
  assert.deepStrictEqual(A.sortAlerts(list).map(a => `${a.kind}${a.ts}`), ['dl0', 'irback1', 'back3', 'inj2', 'min1', 'news8', 'news5', 'offer9']);
});

test('IR pravilo: ESPN dozvoljava samo oznake OUT i IR', () => {
  const rule = ['OUT', 'IR'];
  assert.strictEqual(A.irVerdict(rule, 'OUT'), 'ok');   // npr. Morant OUT na IR mestu: legalno, bez alerta
  assert.strictEqual(A.irVerdict(rule, 'IR'), 'ok');
  assert.strictEqual(A.irVerdict(rule, 'SSPD'), 'bad');
  assert.strictEqual(A.irVerdict(rule, 'DTD'), 'bad');   // npr. Avdija DTD na IR-u
  assert.strictEqual(A.irVerdict(rule, 'healthy'), 'bad');
});

test('IR pravilo: Sleeper podešavanja (reserve_allow_out, _sus, _dnr) i liga bez poznatog pravila', () => {
  const rule = ['out', 'sus', 'dnr'];
  assert.strictEqual(A.irVerdict(rule, A.SLEEPER_IR_KEY.Out), 'ok');
  assert.strictEqual(A.irVerdict(rule, A.SLEEPER_IR_KEY.IR), 'ok');
  assert.strictEqual(A.irVerdict(rule, A.SLEEPER_IR_KEY.GTD), 'bad');
  assert.strictEqual(A.irVerdict(rule, 'healthy'), 'bad');
  assert.strictEqual(A.irVerdict(null, 'DTD'), 'unknown'); // Fantrax, ručne i nalepljene lige: neutralan tekst
});

test('Sleeper statusi -> zajednički skup', () => {
  assert.strictEqual(A.sleeperGroup('Out'), 'OUT');
  assert.strictEqual(A.sleeperGroup('IR'), 'OUT');
  assert.strictEqual(A.sleeperGroup('DTD'), 'DTD');
  assert.strictEqual(A.sleeperGroup('GTD'), 'DTD');
  assert.strictEqual(A.sleeperGroup('Sus'), 'SSPD');
  assert.strictEqual(A.sleeperGroup(''), 'OK');
  assert.strictEqual(A.sleeperGroup('Nepoznato'), 'DTD');
});

test('koeficijent dostupnosti: GP igrača / utakmice tima, ograničen na 0 do 1, OUT = 0', () => {
  assert.strictEqual(A.availFactor(15, 20, false), 0.75);
  assert.strictEqual(A.availFactor(22, 20, false), 1);   // menjan tokom sezone: više utakmica nego novi tim
  assert.strictEqual(A.availFactor(18, 20, true), 0);
  assert.strictEqual(A.availFactor(0, 0, false), 1);     // nema podataka: ne menja procenu
  assert.strictEqual(A.availFactor(0, 20, false), 0);
});

test('Sleeper rok (nedelja lige) -> približan datum početka te nedelje', () => {
  const mon = Date.UTC(2026, 10, 23, 5);
  assert.strictEqual(A.sleeperDeadline(18, 6, mon), mon + 12 * 7 * DAY);
  assert.strictEqual(A.sleeperDeadline(0, 6, mon), null);
  assert.strictEqual(A.sleeperDeadline(99, 6, mon), null);
});

test('zajednički status: uvezena liga koristi status iz lige (ESPN liga ACTIVE pobeđuje DTD iz ESPN baze)', () => {
  // ESPN liga: igrač na rosteru bez st = ACTIVE, iako ESPN baza kaže DAY_TO_DAY
  const s = A.resolveStatus({ id: 1 }, 'DAY_TO_DAY', true, false);
  assert.strictEqual(s.inj, 'ACTIVE'); assert.strictEqual(s.g, 'OK'); assert.strictEqual(s.espn, false);
  // ručna liga: ESPN baza, bez oznake
  const m = A.resolveStatus(null, 'DAY_TO_DAY', false, false);
  assert.strictEqual(m.inj, 'DAY_TO_DAY'); assert.strictEqual(m.g, 'DTD'); assert.strictEqual(m.espn, false);
});

test('zajednički status: platforma ne daje status (Fantrax) -> ESPN uz oznaku; igrač van rostera Sleeper lige -> ESPN uz oznaku', () => {
  const f = A.resolveStatus({ id: 1, st: 'OUT' }, 'OUT', false, true);
  assert.strictEqual(f.inj, 'OUT'); assert.strictEqual(f.espn, true);
  const fa = A.resolveStatus(null, 'QUESTIONABLE', true, true);
  assert.strictEqual(fa.inj, 'QUESTIONABLE'); assert.strictEqual(fa.espn, true);
});

test('Sleeper status -> zajednički model: grupa, oznaka platforme i ključ za IR pravilo', () => {
  assert.deepStrictEqual(A.sleeperStatus('Questionable'), { st: 'QUESTIONABLE', lb: 'Questionable', k: 'dtd' });
  assert.deepStrictEqual(A.sleeperStatus('DNR'), { st: 'OUT', lb: 'DNR', k: 'dnr' });
  assert.strictEqual(A.sleeperStatus(''), null);
  const e = { id: 1, ...A.sleeperStatus('Sus') };
  const s = A.resolveStatus(e, 'ACTIVE', true, true);
  assert.strictEqual(s.g, 'SSPD'); assert.strictEqual(s.lb, 'Sus'); assert.strictEqual(s.key, 'sus'); assert.strictEqual(s.espn, false);
  // grupe se poklapaju sa starim Sleeper grupisanjem
  for (const [lbl, g] of [['Out', 'OUT'], ['IR', 'OUT'], ['GTD', 'DTD'], ['Doubtful', 'DTD'], ['NA', 'OUT'], ['COV', 'OUT'], ['Sus', 'SSPD'], ['Nešto novo', 'DTD'], ['', 'OK']]) assert.strictEqual(A.sleeperGroup(lbl), g, lbl);
});

test('ESPN ključevi za IR pravilo iz zajedničkog statusa: OUT i IR dozvoljeni, DTD i zdrav nisu', () => {
  const rule = ['OUT', 'IR'];
  assert.strictEqual(A.irVerdict(rule, A.resolveStatus({ st: 'OUT' }, null, true).key), 'ok');
  assert.strictEqual(A.irVerdict(rule, A.resolveStatus({ st: 'INJURY_RESERVE' }, null, true).key), 'ok');
  assert.strictEqual(A.irVerdict(rule, A.resolveStatus({ st: 'DAY_TO_DAY' }, null, true).key), 'bad');
  assert.strictEqual(A.irVerdict(rule, A.resolveStatus({}, null, true).key), 'bad');
  assert.strictEqual(A.orJoin(['OUT', 'IR'], 'ili'), 'OUT ili IR');
  assert.strictEqual(A.orJoin(['Out', 'Sus', 'DNR'], 'or'), 'Out, Sus or DNR');
});

test('vesti za alerte: izveštaj sa utakmice nije status, osim kad pominje povredu', () => {
  const no = [
    "Poeltl recorded 15 points (5-10 FG, 5-6 FT), 10 rebounds, three assists, one block and one steal in 28 minutes before fouling out of Monday's 116-111 loss to the Bucks.",
    'Brooks amassed 18 points (7-14 FG, 2-7 3Pt, 2-3 FT), three rebounds and two assists in 30 minutes during Friday\'s loss.',
    'Buzelis notched nine points (4-10 FG, 1-5 3Pt), five rebounds, one assist and one steal.',
    "Okongwu finished Friday's 111-97 win over the Hornets with 16 points (6-11 FG).",
  ];
  const yes = [
    'Nembhard (hip) is available for Friday\'s game against the Cavaliers.',
    'Morant has been diagnosed with a Grade 2 left hamstring strain and is expected to miss at least two weeks.',
    'Head coach said Morant met with a doctor in Los Angeles.',
    'Smith exited with a sprained right ankle after scoring 12 points (5-8 FG) in 18 minutes.',
    'Jones is questionable for Wednesday\'s game due to illness.',
  ];
  for (const h of no) assert.strictEqual(A.isStatusNews(h), false, h);
  for (const h of yes.slice(0, 2).concat(yes.slice(3))) assert.strictEqual(A.isStatusNews(h), true, h);
});

console.log(`\n${n} testova prošlo`);
