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
const A = new Function(`${code}\nreturn { sleeperGroup, trackStatus, statusEvent, irVerdict, sortAlerts, keepHidden, availFactor, sleeperDeadline, SLEEPER_IR_KEY };`)();

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

console.log(`\n${n} testova prošlo`);
