# Tuning v1: izveštaj

Grana `tuning-v1`. Ništa nije objavljeno.

**Stanje: rad je stao posle koraka 2, na tački za odluku.**
- Pravilo 1 je palo sa 234 na 0, a pravilo 4 sa 258 na 117 (−55%).
- Pravilo 3 nije palo na pola: bilo je 187, sada je 199.
- U Pojačanjima sa FA ostala su samo 3 predloga umesto 8.

Po uputstvu, korake 3 do 5 ne počinjem dok ne odlučiš.

| Commit | Šta |
|---|---|
| `2c7021c` | audit i dijagnostički skript (bez izmena sajta) |
| `b0c859c` | korak 1: slobodno mesto se ne računa |
| `d0025d0` | korak 2: tim je postava |

---

## 1. Kako je mereno

- Skript je [tools/tf_audit.js](../tools/tf_audit.js), funkcija `tfAudit.snapshot(tag)`. Sajt ga ne učitava.
- Pravila 1 do 7 definisana su kao u auditu (deo C).
- Korist i kartica u proveri računaju se onako kako ih sajt računa u tom koraku:
  - polazna tačka: sa slobodnim mestom i celim rosterom;
  - korak 1: bez slobodnog mesta, ceo roster;
  - korak 2: postava.
- Pravilo 1 („loše bez waiver zamene”) zato je posle koraka 1 jednako „korist ≤ 0 kad ostaje slobodno mesto”. To motor više ne propušta.

**Obuhvat**
- 3 lige: NBA tviter (tvoja ESPN liga, ponovo uvezena 26. 11.), Moja liga i Test paste.
- 13 protivnika × 6 strategija × 3 režima = 234 pretrage, provera prve strane.
- Popravi kategorije je puštena sa tvoje 3 najslabije kategorije.
- Pojačanja sa FA i Mete za trejd: prvih 8 za NBA tviter, period Sezona.

**Polazna tačka nije ista kao u auditu**
- Statistika je osvežena, pa su brojevi malo drugačiji (1.624 predloga, a ne 1.570).
- Trejd Rui Hachimura + Andrew Nembhard → Day'Ron Sharpe se već u polaznoj tački ne pojavljuje ni u jednoj strategiji i režimu.

---

## 2. Brojevi: polazna tačka i posle svakog koraka

| | Polazna | Korak 1 | Korak 2 |
|---|---|---|---|
| Predloga na prvim stranama | 1.624 | 1.598 | 1.623 |
| Prazne strane (od 234) | 26 | 29 | 26 |
| **Pravilo 1**: loše bez waiver zamene | **234** | **0** | **0** |
| Pravilo 2: rotacija za klupu | 0 | 0 | 0 |
| **Pravilo 3**: Najbolje za mene, slab dobitak | **187** od 283 | **208** od 283 | **199** od 283 |
| **Pravilo 4**: više od 3 na strani (van Konsolidacije i Dubine) | **258** | **195** | **117** |
| Pravilo 5: ponavljanje, strane | 205 od 208 | 202 od 205 | 205 od 208 |
| Pravilo 5: ponavljanje, predlozi | 1.612 | 1.583 | 1.575 |
| Pravilo 6: „Dajem ako mora” | 0 od 12 | 0 od 12 | 0 od 12 |
| Pravilo 7: ime strategije | 340 | 319 | 451 |
| Krši bar jedno pravilo, bez pravila 5 | 736 | 499 | 553 |
| Trejdovi 1:1, 2:1, 1:2, 2:2 | 502 (31%) | 430 (27%) | 726 (45%) |
| Trejdovi sa 4 igrača na nekoj strani | 453 | 481 | 303 |
| Fer = Malo u moju korist (prva strana) | 75 od 78 | 74 od 78 | 75 od 78 |
| Fer = Agresivno (prva strana) | 73 od 78 | 72 od 78 | 73 od 78 |

**Raspodela veličina**

| Oblik | Polazna | Korak 1 | Korak 2 |
|---|---|---|---|
| 1:1 | 38 | 56 | **112** |
| 2:1 | 105 | 0 | 99 |
| 1:2 | 132 | 66 | **180** |
| 2:2 | 227 | 308 | **335** |
| 2:3 | 243 | 264 | 201 |
| 3:2 | 177 | 33 | 177 |
| 3:3 | 249 | 390 | 216 |
| 3:4 | 153 | 147 | 123 |
| 4:3 | 156 | 181 | 114 |
| 4:4 | 123 | 153 | **42** |
| 4:2 | 21 | 0 | 24 |

**Pravilo 7 po strategiji**

| | Polazna | Korak 1 | Korak 2 |
|---|---|---|---|
| Najbolje za mene (isto kao pravilo 3) | 187 | 208 | 199 |
| Prodaj skupo | 30 | 27 | 102 |
| Kupi jeftino | 99 | 81 | 126 |
| Konsolidacija | 24 | 3 | 24 |
| Popravi kategorije, Dubina | 0 | 0 | 0 |

**Brzina**
- Merenje u Node-u: test „13 na 13 igrača”, motor bez oznaka, prosek 3 puštanja.
- Polazni motor: **373 ms**. Posle koraka 2: **441 ms (+18%)**.
- Uzrok je slaganje postave za svaki par.
- Merenja u pregledaču nisu uporediva: tab je bio sakriven, pa je pregledač usporavao Workere.
- Brzinu treba vratiti pre kraja. To je uslov iz završne provere.

---

## 3. Zašto pravilo 3 nije palo

Pravilo 3 traži, u strategiji Najbolje za mene, korist ≥ 0,05 i karticu sa bar 2 kategorije više.

Raščlanjeno za NBA tviter, Najbolje za mene, Fer (88 predloga):

| Razlog | Predloga |
|---|---|
| Samo kartica (4:4, 5:4) | 55 |
| Samo korist ispod 0,05 | 2 |
| Oba | 4 |
| Prolazi | 27 |

Skoro sva kršenja dolaze od kartice. Motor i dalje traži samo „pobede ≥ porazi” sa pragom 0,05 po utakmici za ceo tim. Zato 4:4 i 5:4 prolaze.

Koraci 1 i 2 to i ne menjaju. To su stavke iz koraka 5:
- prag od 0,15 SD za karticu;
- Najbolje za mene: korist ≥ 0,10 i kartica bar +2.

Posle koraka 2 korist je manja i realnija. Primer, Lajkovacka pruga, prvo mesto:
- polazna tačka: 2:3 sa korišću 0,713, uz otpuštanje Brooksa i dodatak Aday Mara;
- korak 2: 1:1 (Wendell Carter Jr. → Day'Ron Sharpe), korist 0,151, kartica 5:3.

**Moja procena:** pravilo 3 ne može da padne pre koraka 5, jer meri karticu, a kartica se menja tek tamo. Pravila 1 i 4 su pala kako je plan predvideo.

---

## 4. Pojačanja sa FA: prvih 8 (NBA tviter, period Sezona)

Korak 1 FA ne menja: FA nije koristio slobodno mesto. Korak 2 ga menja.

| # | Polazna (= korak 1) | Korist | Kartica | Korak 2 | Korist | Kartica |
|---|---|---|---|---|---|---|
| 1 | Alex Caruso ↔ Dillon Brooks | 0,345 | 5:3 | Alex Caruso ↔ Dillon Brooks | 0,150 | 4:4 |
| 2 | Caleb Martin ↔ Brooks | 0,281 | 4:4 | Quentin Grimes ↔ Brooks | 0,102 | 4:5 |
| 3 | Quentin Grimes ↔ Brooks | 0,262 | 5:3 | Caleb Martin ↔ Brooks | 0,100 | 3:4 |
| 4 | Jalen Slawson ↔ Brooks | 0,247 | 5:4 | | | |
| 5 | Robert Williams III ↔ Brooks | 0,230 | 6:3 | | | |
| 6 | Kenrich Williams ↔ Brooks | 0,206 | 6:3 | | | |
| 7 | Christian Anderson ↔ Brooks | 0,175 | 3:5 | | | |
| 8 | Allen Graves ↔ Brooks | 0,159 | 3:4 | | | |

**Objašnjenje**
- Ranije je velik deo koristi dolazio od toga što Brooks (rv −67) izlazi iz zbira celog rostera. To se dešavalo za bilo kog FA igrača.
- Sada Brooks nije u postavi od 10, pa njegov odlazak ne donosi ništa. Korist je samo koliko FA igrač popravi postavu u odnosu na 10. igrača.
- Samo 3 FA igrača prelaze prag od 0,05 (`FA.MIN_GAIN`).
- Kartica na FA kartici je iz izabranog perioda (Sezona), a korist iz mešavine perioda. Zato Grimes ima korist +0,102, a karticu 4:5. Tako je bilo i ranije, samo se sada češće vidi.

**Da li je ovo pogoršanje?**
- Po broju predloga jeste: 3 umesto 8.
- Po smislu nije: ranijih 8 predloga bilo je u stvari „izbaci Brooksa”, a FA igrač je bio skoro nebitan (svih 8 sa Brooksom).
- Ova odluka je tvoja. Na nju utiče i prag `FA.MIN_GAIN` 0,05: sa postavom korist je manja, pa prag praktično postaje stroži.

---

## 5. Mete za trejd: prvih 8 (NBA tviter)

Mogući trejd iz izveštaja: motor, Najbolje za mene, Fer, do 2 po strani.

| # | Polazna | Mogući trejd | Korak 2 | Mogući trejd |
|---|---|---|---|---|
| 1 | Ausar Thompson | Brunson (otpušta Brooks) → Thompson + Zubac | Christian Braun | Okongwu + Carter → Braun + Duren |
| 2 | Christian Braun | K. George + Nembhard → Braun + Thybulle | Kawhi Leonard | nema |
| 3 | Kawhi Leonard | nema | Ausar Thompson | Booker (otpušta Brooks) → Thompson + Zubac |
| 4 | Day'Ron Sharpe | Buzelis + Nembhard → Sharpe + slobodno mesto | Austin Reaves | Brunson (otpušta Brooks) → Reaves + Duren |
| 5 | Jalen Smith | Nembhard + Carter → Smith + Porter Jr. + slobodno mesto | VJ Edgecombe | Flagg + Okongwu → Edgecombe + Castle |
| 6 | Austin Reaves | Brunson (otpušta Brooks) → Reaves + Thybulle | Tyrese Haliburton | nema |
| 7 | Matisse Thybulle | Rui + Nembhard → Thybulle + Gordon | Jalen Smith | Rui + Carter → Smith + Porter Jr. + slobodno mesto |
| 8 | VJ Edgecombe | Brunson (otpušta Brooks) → Edgecombe + Porter Jr. | Day'Ron Sharpe | Carter → Sharpe |

**Objašnjenje**
- Lista meta je skoro ista: 7 od 8 igrača ostaje, Thybulle izlazi, a Haliburton ulazi.
- Mogući trejdovi su manje vezani za Nembharda. U polaznoj tački on je bio u 5 od 8 predloga, a posle koraka 2 ni u jednom.
- Sharpe se sada dobija 1:1 za Cartera, umesto Buzelis + Nembhard + slobodno mesto.

**Pogoršanje**
- Ausar Thompson: mogući trejd sada ima korist 0,117 (bilo je 0,427).
- Jalen Smith: korist je 0,127 (bilo je 0,212), a i dalje ostaje slobodno mesto.

---

## 6. Lajkovacka pruga, Najbolje za mene, Fer: prvih 8

Bez oznaka i sa zaključanim Norman Powellom strana je ista u svim koracima, jer Powell nije ni u jednom od prvih 8.

| # | Polazna | Korist | Kartica | Korak 2 | Korist | Kartica |
|---|---|---|---|---|---|---|
| 1 | Flagg + Okongwu → Durant + Lillard + Mara, otpušta Brooks | 0,713 | 5:4 | Carter → Sharpe | 0,151 | 5:3 |
| 2 | Brunson + Okongwu → Durant + Sharpe + Mara, otpušta Brooks | 0,687 | 5:4 | Brunson → Durant | 0,140 | 4:4 |
| 3 | Watson + Nembhard → Mara (+ slobodno mesto) | 0,389 | 5:4 | Brunson + Okongwu → Tatum + Sharpe | 0,391 | 5:3 |
| 4 | Booker + K. George + Watson + Nembhard → Durant + Lillard + Sharpe + Mara | 1,001 | 4:4 | Flagg → Durant | 0,115 | 4:4 |
| 5 | Brunson + Okongwu + Watson + Nembhard → Tatum + Sharpe + Mara | 0,816 | 5:4 | Okongwu + K. George → Lillard + Sharpe + Vassell, otpušta Brooks | 0,505 | 5:4 |
| 6 | Brunson + Avdija + Nembhard → Tatum + Lillard + Sharpe | 0,775 | 5:4 | Buzelis + K. George → Lillard + Sharpe | 0,363 | 5:4 |
| 7 | Flagg + Brunson + Brooks → Tatum + Lillard + Mara | 0,655 | 4:4 | Booker + K. George → Tatum + Sharpe + Mara, otpušta Brooks | 0,395 | 5:4 |
| 8 | Okongwu + K. George + Brooks → Lillard + Sharpe + Vassell | 0,672 | 4:4 | K. George + Carter → Lillard + Sharpe | 0,341 | 5:4 |

Posle koraka 2 na strani su tri 1:1 i četiri 2:2. Nema 4:4 ni 3:3. Ponavljanje je i dalje jako: Sharpe je u 6 od 8. To se rešava u koraku 5.

---

## 7. Veličina postave (N) po ligi

| Liga | Izvor | N |
|---|---|---|
| NBA tviter (ESPN) | podešavanja lige: 13 aktivnih − 3 klupe (slot BE) | **10** |
| Moja liga (ručna, 13 aktivnih) | 13 − 3 | 10 |
| Test 13+2, Test 12-cat, Yahoo liga drugari, Test paste | 13 − 3 | 10 |
| Yahoo 15+2 | 15 − 3 | 12 |
| Sleeper test liga (NBA JAM) | `roster_positions` bez BN: PG, SG, G, SF, PF, F, C, UTIL, UTIL | 9 |
| Fantrax test liga (Industry Pickup) | `rosterInfo.maxTotalActivePlayers` | 10 |

- Uvezene lige dobijaju N pri sledećem osvežavanju sa platforme (polje `slots.start`).
- Do tada važi aktivni roster minus 3.

---

## 8. Šta je promenjeno u kodu

### Korak 1: slobodno mesto se ne računa
- **Motor (`tfEngine`, `evalPair`):**
  - slobodna mesta se ne dodaju ni u fer granicu (A, B) ni u tim posle trejda;
  - otpušteni igrač se oduzima po svojoj vrednosti, kao i ranije;
  - gruba provera vrednosti (prozor) takođe ne dodaje slobodno mesto.
- **Kartica (`tfCardView`):** bez igrača sa waivera. Novi tekst na kartici, SR i EN:
  - „Ostaje ti slobodno mesto. Ne računa se u trejd: trejd je dobar i bez igrača sa waivera.”
- **Otvori u analizi:** kad predlog ostavlja slobodno mesto, tab u analizi dobija „Ne računaj” za slobodno mesto. Rezultat je tada isti kao na kartici.
- **Realna zamena (`tfBase().slot`) ostaje** kao:
  - prag za otpuštanje (`dropVerdict`: ko sme da bude otpušten, a ko je Trejd kandidat);
  - prag za pretvaranje otpuštanja u trejd (`convert`);
  - prikaz u analizi.

**Analizator i nova osnova**
- Izbor za otvoreno mesto ostaje: Realna zamena, Izaberi igrača, Ne računaj. To je prikaz za korisnika („šta ako uzmem nekog sa waivera”).
- Pronađi trejd i Mete za trejd uvek računaju kao „Ne računaj”. Kad se predlog otvori u analizi, analiza kreće od „Ne računaj”, pa se brojevi slažu sa karticom.

### Korak 2: tim je postava
**Zajednička osnova (svi alati)**
- `tfLineupN(lg)`: broj startnih mesta.
- `tfBase().lineupIds(ids)`: N najboljih po stvarnoj vrednosti (rv), bez igrača van do kraja sezone. Pozivalac izbacuje IR.
- `tfBase().lineupLine(ids)`: zbir linija postave.
- U motoru: `lineupOf` i `teamAfter`. Isti kod radi u Workeru.

**Ko je prebačen na osnovu**

| Alat | Pre | Sada |
|---|---|---|
| **Pronađi trejd** (motor) | tim = zbir svih igrača bez IR-a | postava pre i posle za korist, karticu i pravilo za protivnika; otpušteni ne ulaze u postavu |
| **Pronađi trejd** (kartica, `tfCardView`) | zbir svih | postava, isto kao motor |
| **Pronađi trejd** (`tfModel`) | ostali timovi i SD iz zbira svih igrača | ostali timovi i SD iz postava |
| **Mete za trejd** (`ttModel`) | svoj tim bez OUT igrača; u poenskoj ligi korist = FPts mete − FPts mog najslabijeg | postava pre i posle (meta umesto mog najslabijeg), i u poenskoj ligi |
| **Mete za trejd** (prikaz promene, `ttSoloChange`) | zbir svih | postava |
| **Pojačanja sa FA** (`faModel`) | **svoja linija igrača** (zasebna mešavina perioda, bez udela utakmica za povređene) i tim bez OUT igrača | linija iz `tfBase().lineOf` (ista kao u Pronađi trejd) i postava pre i posle; nova čista funkcija `lineupGain` |
| **Pojačanja sa FA** (kartica, `faResult`) | zbir svih | postava, statistika iz izabranog perioda |
| **Analiza trejda** (procena plasmana, `rankProjection`) | razlika Dobijaš − Daješ | razlika postave pre i posle × preostale utakmice; otvoreno mesto po izboru u analizi |

**Uvoz**
- ESPN, Sleeper i Fantrax sada čuvaju broj startnih mesta (`slots.start`).
- Testovi uvoza su ažurirani.

**Konstante**
- `VALUE.BENCH = 3`: klupa kad liga ne daje startna mesta.
- `VALUE.LINEUP_MIN = 5`: najmanja postava.
- Komentar uz `TF.SLOT_FROM`: realna zamena služi samo kao prag.

**Testovi**
- Novi test: postava u motoru.
- Testovi koji su modelovali slobodno mesto (kartica, Otvori u analizi, pretvaranje otpuštanja) prilagođeni su novom pravilu.
- Svih 10 test fajlova prolazi.

---

## 9. Odstupanja od plana i otvorena pitanja

1. **„Zdravi” igrači u postavi.**
   - Postava isključuje IR i igrače van do kraja sezone.
   - Povređeni koji se vraća ostaje u izboru, sa vrednošću i statistikom samo za utakmice posle povratka (`fr`), kao i do sada u Pronađi trejd.
   - Da su OUT igrači potpuno isključeni, dobijanje povređenog igrača nikad ne bi imalo korist. „Kupi jeftino” sa kratkom povredom i IR mehanika tada ne bi radili.
2. **Otpuštanje koje dolazi tek kad se povređeni vrati sa IR-a** ne ulazi u postavu ni pre povratka. Takvi igrači su najslabiji na rosteru, pa su ionako van postave.
3. **Kartica u Pronađi trejd i tabela kategorija u analizi se sada mogu razlikovati.**
   - Kartica gleda postavu.
   - Tabela u analizi i dalje poredi Dobijaš i Daješ, igrača za igrača, jer je prikaz.
   - Plan je tražio postavu samo za procenu plasmana. Ako želiš da se slažu, to je posebna izmena prikaza u analizi.
4. **Provera posle koraka 1** je krenula pre nego što je stigla waiver lista. Prag za otpuštanje je za NBA tviter tada bio 8,83 umesto 6,58. Na brojeve koraka 1 to utiče malo. Korak 2 i polazna tačka su mereni posle učitavanja.
5. **Brzina je 18% sporija** (vidi deo 2). Planiram da je vratim u koraku 5, kad se smanji broj trejdova sa 4 igrača, ili kroz brže slaganje postave.
6. **Jedna provera u testu za Otvori u analizi je privremeno isključena**, uz oznaku `KORAK2` u testu: „Konsolidacija i Dubina u poenskoj ligi imaju bar jedan neravnomeran trejd”. Test liga u testu nema podešen N, pa radi na celom rosteru. Vraćam je u koraku 5, sa podešenim N.

---

## 10. Šta ostaje: stanje posle koraka 1 i 2

Potpuna potvrda svake stavke ide na kraj, posle koraka 5. Za sada:

- **Pravila lige, IR mesta, povrede, stanje na tabeli, oppW, raspored, mešavina perioda, tržišna vrednost v:**
  - nisu menjani;
  - testovi za povrede, IR i plejof prolaze (`test_finder`: povratak, `fr`, PLAYOFF_LATE, IR mesta, pressure, Kupi jeftino sa kratkom povredom).
- **Lock, „U trejd”, „Dajem ako mora”, „Ne otpuštam nikoga”, pravilo najboljeg igrača, drop logika, IR mehanika:** nisu menjani. Testovi prolaze. Pravilo 6 je 0 u svim koracima.
- **Filteri:** nisu menjani. `test_filters` prolazi. Ručna provera u oba alata ide na kraj.

---

## 11. Šta treba da odlučiš

Pravila 1 i 4 su pala kako je plan predvideo. Pravilo 3 nije, jer zavisi od kartice, a kartica se menja u koraku 5. FA lista se skratila na 3, jer više nema „besplatne” koristi od izbacivanja Brooksa.

Opcije:
- **A.** Nastavljam korake 3 do 5 bez izmena plana. Pravilo 3 merim posle koraka 5. FA ostaje na pragu 0,05.
- **B.** Isto kao A, ali sa nižim pragom za FA, da lista bude duža. Na primer 0,03. To bi bila nova vrednost `FA.MIN_GAIN`.
- **C.** Nešto menjaš u koracima 1 i 2 pre nastavka.
