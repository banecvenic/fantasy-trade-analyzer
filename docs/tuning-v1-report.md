# Tuning v1: izveštaj

Grana `tuning-v1`. Ništa nije objavljeno.

**Stanje: koraci 1 do 5 su urađeni, sa merenjem i commitom posle svakog.**

| Uslov iz završne provere | Rezultat |
|---|---|
| Pravila 1, 3, 4, 5, 7: nula kršenja | **0, 0, 0, 0, 0** (pravilo 4 po novoj definiciji, deo 9) |
| Mali trejdovi (1:1, 2:1, 1:2, 2:2) bar 50% | **51,7%** (polazno 30,9%) |
| Rui Hachimura + Andrew Nembhard → Day'Ron Sharpe se ne pojavljuje | ne pojavljuje se ni u jednoj strategiji i režimu |
| Tri režima daju različite prve strane | Fer = Malo: 11 od 68 nepraznih (polazno 75 od 78), Fer = Agresivno: 3 od 70 (polazno 73 od 78); isti su samo kad ima 1 do 6 predloga |
| Brzina ista ili bolja | **249 ms** prema polaznih **348 ms** (ista mašina, prava pravila) |
| FA i Mete nisu gori | FA: 8 predloga (posle koraka 2 bilo 3); Mete: iste mete, mogući trejd uz 6 od 8 |
| Filteri rade | Mete MIN 30+ i PTS 18+: 9 igrača, svi prolaze; Pronađi trejd PTS 20+: svaki predlog ima igrača sa 20+ |

| Commit | Šta |
|---|---|
| `2c7021c` | audit i dijagnostički skript (bez izmena sajta) |
| `b0c859c` | korak 1: slobodno mesto se ne računa |
| `d0025d0` | korak 2: tim je postava |
| `d74daa0` | izveštaj na tački za odluku |
| `ac3e0fc` | ispravka koraka 2: dnevna postava po udelu startova, limit utakmica, FA rečenica |
| `2aad4bb` | korak 3: uloga igrača koga dobijam, oznaka „Uloga raste” |
| `ea333df` | korak 4: zajednička funkcija prihvatanja, pravi razlog u „Zašto bi prihvatio” |
| `924a3c6` | korak 5: pravila po alatu na zajedničkoj kartici, brži motor |
| `4b8d281` | analiza: veliki rezultat koristi istu karticu kao Pronađi trejd |
| `3503d1f` | Mete za trejd: mogući trejd za izabranu metu traži nerešenu karticu, ne +2 |

---

## 1. Kako je mereno

- Skript je [tools/tf_audit.js](../tools/tf_audit.js), funkcija `tfAudit.snapshot(tag)`. Sajt ga ne učitava.
- Pravila 1 do 7 definisana su kao u auditu (deo C). Pravilo 4 je posle koraka 5 redefinisano (deo 9).
- Korist i kartica u proveri računaju se onako kako ih sajt računa u tom koraku (posle koraka 2: postava; posle koraka 5: prag 0,15 SD).
- Od koraka 5 provera gleda pravu prvu stranu (broj strane `pg`), a ne prvih 8 iz liste, jer strana sada može biti kraća.

**Obuhvat**
- 3 lige: NBA tviter (tvoja ESPN liga, ponovo uvezena 26. 11.), Moja liga i Test paste.
- 13 protivnika × 6 strategija × 3 režima = 234 pretrage, provera prve strane.
- Popravi kategorije je puštena sa 3 najslabije kategorije (ista funkcija kao na sajtu, `tfWeakIdx`).
- Pojačanja sa FA i Mete za trejd: prvih 8 za NBA tviter, period Sezona.

**Polazna tačka nije ista kao u auditu**
- Statistika je osvežena, pa su brojevi malo drugačiji (1.624 predloga, a ne 1.570).
- Trejd Rui Hachimura + Andrew Nembhard → Day'Ron Sharpe se već u polaznoj tački ne pojavljuje.

---

## 2. Brojevi po koracima

| | Polazna | Korak 1 | Korak 2 | Ispravka k. 2 | Korak 3 | Korak 4 | **Korak 5** |
|---|---|---|---|---|---|---|---|
| Predloga na prvim stranama | 1.624 | 1.598 | 1.623 | 1.596 | 1.596 | 1.596 | **1.076** |
| Prazne strane (od 234) | 26 | 29 | 26 | 29 | 29 | 29 | 30 |
| **Pravilo 1**: loše bez waiver zamene | 234 | 0 | 0 | 0 | 0 | 0 | **0** |
| Pravilo 2: rotacija za klupu | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| **Pravilo 3**: Najbolje za mene, slab dobitak | 187 | 208 | 199 | 196 | 196 | 196 | **0** |
| **Pravilo 4** (stara definicija do koraka 4, nova u koraku 5) | 258 | 195 | 117 | 189 | 189 | 189 | **0** |
| **Pravilo 5**: ponavljanje, predlozi | 1.612 | 1.583 | 1.575 | 1.572 | 1.572 | 1.572 | **0** |
| Pravilo 6: „Dajem ako mora” | 0 | 0 | 0 | 1 | 1 | 1 | 0 |
| **Pravilo 7**: ime strategije | 340 | 319 | 451 | 337 | 337 | 337 | **0** |
| Krši bar jedno pravilo, bez pravila 5 | 736 | 499 | 553 | 511 | 511 | 511 | **0** |
| Mali trejdovi (1:1, 2:1, 1:2, 2:2) | 30,9% | 26,9% | 44,7% | 30,3% | 30,3% | 30,3% | **51,7%** |
| Trejdovi sa 4 igrača na nekoj strani | 453 | 481 | 303 | 441 | 441 | 441 | **58** |
| Fer = Malo u moju korist (prva strana, sa praznim) | 75 od 78 | 74 | 75 | 75 | 75 | 75 | **21** (10 praznih) |
| Fer = Agresivno (prva strana, sa praznim) | 73 od 78 | 72 | 73 | 73 | 73 | 73 | **11** (8 praznih) |

- Korak 3 sa podrazumevanim podešavanjem (`TF.ROLE.W = 0`) ne menja brojeve pravila: menja samo ko sme da dođe (deo 5).
- Korak 4 ne menja ni brojeve pravila: menja razlog prihvatanja i rang (deo 6).
- Korak 5 ima manje predloga jer raznovrsnost ne popušta: kad bi se igrač ponovio više nego što je dozvoljeno, strana je kraća, uz napomenu.

**Raspodela veličina**

| Oblik | Polazna | Korak 2 | Ispravka k. 2 | **Korak 5** |
|---|---|---|---|---|
| 1:1 | 38 | 112 | 55 | **83** |
| 2:1 | 105 | 99 | 3 | 0 |
| 1:2 | 132 | 180 | 108 | **63** |
| 2:2 | 227 | 335 | 317 | **410** |
| 2:3 | 243 | 201 | 231 | 260 |
| 3:2 | 177 | 177 | 57 | 29 |
| 3:3 | 249 | 216 | 384 | 173 |
| 3:4 | 153 | 123 | 144 | 15 |
| 4:3 | 156 | 114 | 156 | 20 |
| 4:4 | 123 | 42 | 141 | **23** |
| 4:2 | 21 | 24 | 0 | 0 |

**Korak 5 po strategiji (prva strana)**

| Strategija | Predloga | Oblici |
|---|---|---|
| Najbolje za mene | 205 | 2:2 78, 3:3 50, 2:3 47, 1:2 14, 1:1 9, 4:4 4, 3:4 3 |
| Popravi kategorije | 211 | 3:3 85, 2:2 64, 1:1 28, 4:4 19, 2:3 11, 1:2 3, 3:4 1 |
| Prodaj skupo | 253 | 2:2 155, 2:3 36, 1:1 24, 1:2 19, 3:3 18, 3:4 1 |
| Kupi jeftino | 203 | 2:2 113, 2:3 36, 1:1 22, 3:3 20, 1:2 11, 3:4 1 |
| Konsolidacija | 49 | 3:2 29, 4:3 20 |
| Dubina | 155 | 2:3 130, 1:2 16, 3:4 9 |

---

## 3. Ispravka koraka 2: postava po pravim startovima

### Šta platforme daju

| Platforma | Promena postave | Limit utakmica | Izvor |
|---|---|---|---|
| ESPN | dnevno ili nedeljno | da, ako je podešen | `lineupLocktimeType`, `rosterLocktimeType` (nedeljno ako sadrži MATCHUP ili WEEK); `lineupSlotStatLimits` (zbir `limitValue`, bez klupe i IR-a) |
| Sleeper | dnevno | ne daje | nema podešavanja; Sleeper menja postavu po utakmici |
| Fantrax | dnevno ili nedeljno | ne daje | dužina prvog `rosterPeriod` (duže od 2 dana = nedeljno) |
| Ručne lige | dnevno | bez limita | po uputstvu |

- NBA tviter: `INDIVIDUAL_GAME` i `FIRSTGAME_SCORINGPERIOD`, `lineupSlotStatLimits` prazan: **dnevno, bez limita**.
- Uvoz čuva `slots.weekly` i `slots.gpCap`. Testovi uvoza pokrivaju oba slučaja (limit 164).

### Kako se broji
- **Dnevno:** svaki igrač vredi koliko svojih preostalih utakmica bi startovao. Svakog dana startuje N najboljih po vrednosti koji tog dana igraju (pozicije se ne gledaju).
- Udeo po rangu meri se na pravom preostalom NBA rasporedu za ligu (N, veličina rostera): `startShares`, 400 ponavljanja sa slučajnim redom timova, rezultat monoton. Dan je po istočnom vremenu (UTC − 10 h).
- **Nedeljno:** prvih N po 1.
- **Limit utakmica:** sečenje na limitu, najslabiji prvi. Limit se deli srazmerno preostalim danima.
- Isto za Pronađi trejd (motor i kartica), Mete za trejd, Pojačanja sa FA i procenu plasmana u analizi (`tfBase().share`, `lineupW`, `lineupSum`).

### Tabele udela (120 preostalih dana, prosečno 15,5 NBA timova dnevno)

| Rang | N=10, roster 13 (sve tvoje lige, i NBA tviter) | Yahoo 15+2, N=12 | Sleeper, N=9, roster 14 | Fantrax, N=10, roster 14 |
|---|---|---|---|---|
| 1 do N | 100% | 100% | 100% | 100% |
| N+1 | 94% | 95% | 93% | 94% |
| N+2 | 89% | 91% | 87% | 89% |
| N+3 | 83% | 87% | 81% | 83% |
| N+4 | 77% | 82% | 73% | 77% |
| N+5 | 70% | 76% | 66% | 70% |
| N+6 | 64% | 71% | 59% | 64% |
| N+7 | 57% | 65% | 51% | 57% |
| N+8 | | | 45% | 51% |
| N+9 | | | 39% | |

Igrač na klupi tako i dalje donosi deo vrednosti, jer startuje kad neko od prvih N ne igra.

### FA posle ispravke
- Rečenica uz naslov (ⓘ) i u prozoru za izbor lige, SR i EN: „Predlozi su dugoročni: igrač koji je bolji od tvog za ostatak sezone. Dnevni izbor po rasporedu i stanju meča dolazi uz prikaz matchupa.”
- `FA.MIN_GAIN` ostaje 0,05.
- **Broj predloga: 8** (posle koraka 2 bilo je 3).

---

## 4. Brzina

| Merenje (Node, ista mašina, medijana) | Polazno (`2c7021c`) | Korak 4 | **Korak 5** |
|---|---|---|---|
| 13 na 13 igrača, prava pravila | 348 ms | 352 ms | **249 ms** |
| Lajkovacka pruga, pravi ulaz, Prodaj skupo, Fer | 353 ms | 353 ms | **315 ms** |
| Lajkovacka pruga, pravi ulaz, Najbolje za mene, Fer | 261 ms | 269 ms | **199 ms** |

- Ubrzanje: postava posle trejda se slaže po indeksima i unapred izračunatim vrednostima, bez pravljenja novih nizova po paru; dolazeći igrači kao kandidati za otpuštanje računaju se jednom, ne po paru.
- Test „brzina: 13 na 13” sada radi sa pravim pravilima, kao aplikacija.
- Vreme u pregledaču nije pouzdano kad je panel sakriven: ista provera je trajala 175 ms po pretrazi sa vidljivim panelom i oko 1 s sa sakrivenim. U glavnoj niti motor za Lajkovacka pruga traje oko 390 ms i u audit verziji i u pravoj.

---

## 5. Korak 3: uloga igrača koga dobijam

**Pravilo:** igrač koga dobijam mora da ima pravu ulogu: bar 15 minuta, ili mu uloga raste. Uloga raste kad:
- su mu minuti u poslednjih 7 ili 15 dana bar 5 iznad sezone (uz bar 3 utakmice), ili
- je saigrač sa 24+ minuta OUT bar 2 nedelje ili je otišao, a on sam nije povređen.

Važi za Pronađi trejd (osim igrača obeleženog „U trejd”), Mete za trejd i Pojačanja sa FA. Oznaka „↗ Uloga raste” sa objašnjenjem stoji na kartici.

U NBA tviter rosterima je 29 igrača kojima uloga raste (npr. Barnes, Castle, Claxton, Naz Reid, Keegan Murray).

**Varijante (TF.ROLE)**

| Varijanta | Pronađi trejd | Pojačanja sa FA | Mete za trejd |
|---|---|---|---|
| **W 0** (izabrano): samo filter uloge | pravila kao pre koraka 3 | Jalen Slawson (14,5 min) izlazi, Isaiah Joe ulazi | bez promene |
| W 0,5: mešavina pomerena ka 15 i 7 dana | 1.576 predloga, pravilo 4 raste na 264, mali trejdovi 23,9%; Lajkovacka: ulazi 4:4 Booker + George + Watson + Nembhard (korist 1,038) i trejdovi sa Vassellom i Kumingom | Grimes prvi; Graves i Kispert ulaze | Kelly Oubre Jr. ulazi (uloga raste: Haliburton OUT), Haliburton ulazi; Reaves i Turner izlaze |
| W 1 | 1.267 predloga, 65 praznih strana, Dubina prazna | **prazno** | (nije mereno dalje) |
| Strogo (22 min i 10 PTS) | pravilo 7 raste na 349 | Caruso, Martin, Goodwin, R. Williams III izlaze; Isaiah Stewart, Wiggins, Graves, Stirtz ulaze | bez promene |

- Zašto W 1 prazni FA: vrednost slobodnog mesta pada sa 6,6 na −0,6, pa Brooks postaje Trejd kandidat i niko ne sme da se otpusti. W ostaje 0.
- Strogi prag isključuje 17 igrača iz rotacije (npr. Josh Hart sa 32 minuta, Thybulle, Gobert), zato nije uključen.

---

## 6. Korak 4: prihvatanje

- Jedna funkcija `accept` u motoru za sve: obe strane, situacije (pritisak na tabeli, borba za vrh, obnova, IR, prodaja moga), bonus u rangu i da li je situacija presudna.
- „Zašto bi prihvatio” sada piše pravi razlog, ovim redom:
  1. situacija, samo kad je ona presudila;
  2. „Dobija najboljeg igrača u trejdu (ime).”;
  3. „Najviše mu raste KAT, gde je N. u ligi.” (ili bez mesta u ligi).

| | Korak 4 | Korak 5 |
|---|---|---|
| Predloga | 1.596 | 1.076 |
| Protivnik ukupno gubi (po njegovoj kartici), a prihvatanje prolazi | 999 (63%) | 722 (67%) |
| Postoji situacija | 426 | 214 |
| Situacija je presudna | 369 | 176 |
| Razlog: kategorija / najbolji igrač / situacija / drugo | 693 / 534 / 369 / 0 | 518 / 375 / 176 / 7 |

- Kad protivnik ukupno gubi, prolazi zbog situacije, najboljeg igrača ili rasta u kategoriji koja mu treba. Primeri: Moja liga, Marko: Zion → Clingan; Test paste: Trae Young → LeBron James (Popravi kategorije).
- Ovo je nalaz, ne prekršaj: plan ne traži da protivnik dobija ukupno.

---

## 7. Korak 5: pravila po alatu

**Zajednička kartica** (`cardResult`, `tfBase().cardOf`): kategorija se broji kad se moj tim (postava, udeli startova) promeni za bar 0,15 SD tima. Istu karticu koriste motor, kartica u Pronađi trejd, zaglavlja u analizi i veliki rezultat u analizi.

| Pravilo | Vrednost |
|---|---|
| Režimi (smer: + = dobijam više) | Fer −10% do +10%; Malo u moju korist 0 do +12,5%; Agresivno +5% do +20%; „U trejd” širi gornju granicu za 5% |
| Najbolje za mene | korist bar 0,10 (poeni: 1,0 FPts) i kartica bar +2 |
| Ostale strategije | kartica bar nerešena; Popravi kategorije sme da izgubi kategorije, ali mora da dobije bar jednu izabranu |
| Konsolidacija | najbolji igrač u trejdu (stvarna vrednost) dolazi meni |
| Dubina | bar jedan igrač više ulazi u moju postavu nego što iz nje izlazi |
| Prodaj skupo / Kupi jeftino | rang po ceni na tržištu bolji (lošiji) od ranga po stvarnoj vrednosti za bar 15 mesta |
| Raznovrsnost (strana od 8) | moj igrač u najviše 3, njegov u najviše 2; ne popušta (kraća strana uz objašnjenje); izuzeti „U trejd” i igrači koji prolaze filter kad ih je 3 ili manje |
| 4 igrača na strani | samo kad korist pobedi najbolji trejd do 3 po strani za 0,10 (poeni 1,0); najviše 1 na strani |
| Veličina | manji trejd ide ispred većeg kad je razlika u oceni manja od 0,07 |
| „Dajem ako mora” | trejdovi sa njim tek posle svih ostalih |

Konstante su u `TF` sa komentarima (`LIMITS`, `TRADE_WIDEN`, `CARD_SD`, `BEST_*`, `RANK_GAP`, `DIV_*`, `FLT_FEW`, `BIG_*`, `SIZE_TIE`). `TF.ENOUGH` i `orderTiers` su uklonjeni.

**Mali trejdovi:** sa pragom veličine 0,02 bilo je 46,1%, sa 0,05 tačno 49,95%, sa **0,07 51,7%**. Uzeta je 0,07.

**Režimi:** prve strane su iste samo gde ima 1 do 6 predloga, pa svi padaju u preklop Fer i Malo (0 do +10%). U NBA tviter to su Konsolidacija (5 protivnika), Dubina (2) i Kupi jeftino (2). Najbolje za mene, Popravi kategorije i Prodaj skupo se uvek razlikuju.

**Testovi:** novi testovi za karticu i prag, Najbolje za mene, Konsolidaciju i Dubinu, stranu sa 4 igrača, veličinu, raznovrsnost (moj 3, njegov 2, izuzetak „U trejd”, kraća strana), „Dajem ako mora” na kraju, smer režima. Vraćena je provera `KORAK2` (neravnomeran trejd u Konsolidaciji i Dubini, sa postavom od 7). Svih 10 test fajlova prolazi (finder 56 testova).

---

## 8. Pre i posle: FA, Mete, Lajkovacka pruga

### Pojačanja sa FA (NBA tviter, Sezona)

| # | Polazno | Korist | Posle koraka 5 | Korist | Kartica |
|---|---|---|---|---|---|
| 1 | Alex Caruso ↔ Dillon Brooks | 0,345 | Alex Caruso ↔ Brooks | 0,281 | 4:3 |
| 2 | Caleb Martin ↔ Brooks | 0,281 | Quentin Grimes ↔ Brooks | 0,263 | 4:3 |
| 3 | Quentin Grimes ↔ Brooks | 0,262 | Caleb Martin ↔ Brooks | 0,223 | 4:4 |
| 4 | Jalen Slawson ↔ Brooks | 0,247 | Kenrich Williams ↔ Brooks | 0,164 | 5:3 |
| 5 | Robert Williams III ↔ Brooks | 0,230 | Christian Anderson ↔ Brooks | 0,145 | 3:5 |
| 6 | Kenrich Williams ↔ Brooks | 0,206 | Jordan Goodwin ↔ Brooks | 0,151 | 4:3 |
| 7 | Christian Anderson ↔ Brooks | 0,175 | Robert Williams III ↔ Brooks | 0,147 | 6:3 |
| 8 | Allen Graves ↔ Brooks | 0,159 | Isaiah Joe ↔ Brooks | 0,105 | 4:3 |

- I dalje 8 predloga. Korist je manja i realnija, jer Brooks na klupi i dalje vredi deo startova.
- Slawson je izašao zbog uloge (14,5 min), Graves zbog manje koristi.
- FA kartica je iz izabranog perioda, a korist iz mešavine; zato Anderson ima +0,145 i karticu 3:5 (kao i ranije).

### Mete za trejd (NBA tviter)

| # | Polazno | Mogući trejd | Posle koraka 5 | Mogući trejd |
|---|---|---|---|---|
| 1 | Ausar Thompson | Brunson (otpušta Brooks) → Thompson + Zubac | Christian Braun | K. George → Braun |
| 2 | Christian Braun | K. George + Nembhard → Braun + Thybulle | Ausar Thompson | Brunson (otpušta Brooks) → Thompson + Zubac |
| 3 | Kawhi Leonard | nema | Kawhi Leonard | nema |
| 4 | Day'Ron Sharpe | Buzelis + Nembhard → Sharpe + slobodno mesto | Day'Ron Sharpe | Buzelis + Nembhard → Sharpe + Mara |
| 5 | Jalen Smith | Nembhard + Carter → Smith + Porter Jr. + slobodno mesto | Jalen Smith | nema |
| 6 | Austin Reaves | Brunson (otpušta Brooks) → Reaves + Thybulle | Austin Reaves | K. George → Reaves |
| 7 | Matisse Thybulle | Rui + Nembhard → Thybulle + Gordon | VJ Edgecombe | K. George + Nembhard → Edgecombe + Porter Jr. |
| 8 | VJ Edgecombe | Brunson (otpušta Brooks) → Edgecombe + Porter Jr. | Myles Turner | Buzelis → Turner |

- 7 od 8 meta je isto kao polazno; Thybulle izlazi, Turner ulazi. Nijedan mogući trejd više ne ostavlja slobodno mesto.
- Mogući trejd: posle koraka 5 je u prvom puštanju bio uz samo 3 od 8 meta, jer je prolazio strogo pravilo za Najbolje (+2). Za izabranu metu sada važi opšte pravilo (kartica bar nerešena, korist iznad nule): **6 od 8**, kao posle koraka 4 (`TT.TRADE_BEST_CARD`, `TT.TRADE_BEST_GAIN`).

### Lajkovacka pruga, Najbolje za mene, Fer

| # | Bez oznaka | Korist | Kartica | Powell zaključan | Korist | Kartica |
|---|---|---|---|---|---|---|
| 1 | Carter → Sharpe | 0,149 | 4:2 | Carter → Sharpe | 0,149 | 4:2 |
| 2 | K. George + Rui → Lillard + Gafford | 0,308 | 4:2 | K. George + Rui → Lillard + Gafford | 0,308 | 4:2 |
| 3 | Okongwu + K. George → Lillard + Powell + Vassell, otpušta Brooks | 0,349 | 5:3 | Brunson + K. George + Nembhard → Tatum + Sharpe + Vassell | 0,631 | 5:3 |
| 4 | Brunson + K. George + Nembhard → Tatum + Sharpe + Vassell | 0,631 | 5:3 | Okongwu + Carter → Lillard + Vassell | 0,236 | 5:3 |
| 5 | Buzelis + Brooks → Powell + Gafford | 0,153 | 4:2 | Flagg + Nembhard → Durant + Bridges | 0,226 | 5:3 |
| 6 | Flagg + Nembhard → Durant + Bridges | 0,226 | 5:3 | Brunson + Nembhard → Durant + Kuminga + Gafford, otpušta Brooks | 0,345 | 5:3 |
| 7 | Brunson + Buzelis → Durant + Lendeborg | 0,155 | 5:3 | Brunson + K. George → Tatum + Dosunmu | 0,149 | 4:2 |
| 8 | Watson + Rui + Nembhard → Kuminga + Mara + Bridges | 0,198 | 5:3 | (strana od 7: ostali bi ponovili igrača) | | |

- Svaki predlog ima karticu bar +2. Nema 4:4. Moj igrač je u najviše 3 predloga (K. George, Nembhard), njegov u najviše 2 (Sharpe, Lillard, Powell, Gafford, Vassell, Durant, Bridges).
- Sa zaključanim Powellom dva predloga sa njim nestaju, a strana se dopunjava drugim trejdovima.
- Pre koraka 5 je na vrhu bio Brunson + Avdija + Nembhard → Tatum + Lillard + Sharpe (0,762), ali sa karticom 5:4 (+1), pa ne prolazi Najbolje za mene. Sharpe je bio u 6 od 8.
- Rang (`s`) uključuje postojeću kaznu za veličinu (3:3 −0,52), zato 1:1 sa korišću 0,149 stoji ispred 3:3 sa 0,631.

---

## 9. Analiza trejda i kartica

- Zaglavlja tabela („bolje u X kat.”) i veliki rezultat iznad njih sada su ista kartica kao u Pronađi trejd: tim pre i posle, postava sa udelima, prag 0,15 SD, mešavina perioda.
- Primer, Lajkovacka pruga: K. George + Rui → Lillard + Gafford. Pronađi trejd: „Dobijaš 4 kategorije, gubiš 2”. Analiza: „4 : 2, Trejd ti donosi 4 kategorije, gubiš 2 · 3 nerešeno”, zaglavlja „bolje u 4 kat.” i „bolje u 2 kat.”. Pre ove izmene veliki rezultat je bio 5 : 4.
- **Tabela kategorija ostaje poređenje igrača:** zbir Daješ prema zbiru Dobijaš, bez ostatka tima, bez udela startova i bez praga od 0,15 SD (svaka razlika se vidi strelicom). Zato tabela može da pokaže prednost u kategoriji koja je na kartici nerešena: razlika između dva igrača je mala u odnosu na ceo tim. Primer iznad: FG% u tabeli pokazuje razliku između igrača, a na kartici je FG% nerešen.
- Bez lige (Brzo poređenje) i zaglavlja i rezultat i dalje porede strane.

---

## 10. Šta ostaje (potvrda)

| Stavka | Stanje | Kako je provereno |
|---|---|---|
| Pravila lige (format, kategorije, punt) | nisu menjana | punt se ne broji ni na kartici (`cardOf` preskače punt); testovi formata prolaze |
| IR mesta, povrede, povratak (`fr`) | nisu menjani | `test_finder`: IR, povratak, Kupi jeftino sa kratkom povredom, IR ide na IR |
| PLAYOFF_LATE i situacije | nisu menjani, sada u `accept` | `test_finder`: situacije, plejof |
| oppW, raspored, mešavina perioda | nisu menjani | raspored se sada koristi i za udele startova |
| Tržišna vrednost v | nije menjana | `test_finder`: tržišna vrednost (Nembhard) |
| Lock / U trejd / Dajem ako mora / Ne otpuštam nikoga | rade | testovi; „Dajem ako mora” sada ide posle svih ostalih (deo 11) |
| Pravilo najboljeg igrača | radi | test „Najbolje za mene ne daje Flagga za tri srednja” |
| Otpuštanje | radi | testovi otpuštanja, Trejd kandidat, vlasništvo 50%+ |
| Filteri | rade | `test_filters`; ručno: Mete MIN 30+ i PTS 18+, Pronađi trejd PTS 20+ (tabela na vrhu) |
| Strategije u UI | iste | samo objašnjenja (ⓘ) prate nova pravila, SR i EN |
| Slučaj 1 (Rui + Nembhard → Sharpe) | ne pojavljuje se | `case1` prazno u svim merenjima |

---

## 11. Odstupanja od plana

1. **ESPN nedeljna postava** se prepoznaje po tekstu tipa zaključavanja (MATCHUP ili WEEK). Nemam ligu sa nedeljnom postavom da potvrdim tačan tekst.
2. **Udeli startova** pretpostavljaju zdrave igrače i ne gledaju pozicije. Povređeni i dalje vredi samo za utakmice posle povratka (`fr`).
3. **Limit utakmica** se deli srazmerno preostalim danima i računa na prosečan roster.
4. **„Dajem ako mora”** je strože od plana: trejdovi sa njim idu tek posle svih ostalih, a ne „u prvih 5 samo kad je korist jasno veća”.
5. **Pravilo 4 je redefinisano:** strana sa 4 igrača je dozvoljena kad korist pobedi najbolji manji trejd za 0,10, najviše 1 na strani. Važi za sve strategije, i Konsolidaciju i Dubinu. Sirov broj trejdova sa 4 igrača: 58 (polazno 453).
6. **TF.ROLE.W ostaje 0**, a strogi prag je isključen (deo 5). W 1 prazni FA.
7. **Raznovrsnost ne popušta**, pa su strane kraće: 1.076 predloga umesto 1.596. Kratka strana ima objašnjenje.
8. **Popravi kategorije** sada mora da dobije bar jednu izabranu kategoriju i na kartici. To je dodato da ime strategije odgovara rezultatu (pravilo 7).
9. **Mete za trejd:** mogući trejd za izabranu metu koristi opšte pravilo (nerešena kartica), ne +2.
10. **Režimi** daju istu prvu stranu kad ima 1 do 6 predloga (deo 7).
11. **Tabela kategorija u analizi** ostaje poređenje igrača (deo 9).
12. **Prodaj skupo / Kupi jeftino po rangu** nema poseban test, jer rang zavisi od cele baze igrača u aplikaciji. Proverava ga audit (pravilo 7: 0).
13. **Testovi mehanike** (Lock, otpuštanje, IR, filteri) rade sa olabavljenim pravilima koraka 5 (`TFL` u testovima), da ne zavise od pravila za Najbolje i raznovrsnost. Pravila koraka 5 imaju svoje testove. Test za razliku od 2 igrača i test za Trejd kandidata koriste širu granicu, jer na tim veštačkim podacima trejd ne staje u Fer.
14. **Kupi jeftino** prihvata i kratko povređenog igrača koji ide na moj IR (postojeće pravilo). Audit je to ranije brojao kao prekršaj; sada ga priznaje.

---

## 12. Istorija: stanje na tački za odluku (posle koraka 2)

### Zašto pravilo 3 tada nije palo
- Pravilo 3 traži, u Najbolje za mene, korist ≥ 0,05 i karticu bar +2.
- NBA tviter, Najbolje za mene, Fer (88 predloga): 55 pada samo na kartici (4:4, 5:4), 2 samo na koristi, 4 na oba, 27 prolazi.
- Motor je tada tražio samo „pobede ≥ porazi” sa pragom 0,05 po utakmici. Rešeno u koraku 5 (prag 0,15 SD, Najbolje +2).

### Veličina postave (N) po ligi

| Liga | Izvor | N |
|---|---|---|
| NBA tviter (ESPN) | podešavanja lige: 13 aktivnih − 3 klupe (slot BE) | **10** |
| Moja liga (ručna, 13 aktivnih) | 13 − 3 | 10 |
| Test 13+2, Test 12-cat, Yahoo liga drugari, Test paste | 13 − 3 | 10 |
| Yahoo 15+2 | 15 − 3 | 12 |
| Sleeper test liga (NBA JAM) | `roster_positions` bez BN | 9 |
| Fantrax test liga (Industry Pickup) | `rosterInfo.maxTotalActivePlayers` | 10 |

### Korak 1: slobodno mesto se ne računa
- Motor: slobodna mesta se ne dodaju ni u fer granicu ni u tim posle trejda; otpušteni igrač se oduzima po svojoj vrednosti.
- Kartica: bez igrača sa waivera, uz tekst „Ostaje ti slobodno mesto. Ne računa se u trejd: trejd je dobar i bez igrača sa waivera.”
- Otvori u analizi: tab dobija „Ne računaj” za slobodno mesto.
- Realna zamena ostaje kao prag za otpuštanje, za pretvaranje otpuštanja u trejd i kao prikaz u analizi.

### Korak 2: tim je postava
- Zajednička osnova `tfBase()`: `lineupIds`, `lineupLine`, posle ispravke i `share`, `lineupW`, `lineupSum`. U motoru `lineupOf`, `lineupW`, `teamAfter`.
- Prebačeni: Pronađi trejd (motor, kartica, `tfModel`), Mete za trejd (`ttModel`, `ttSoloChange`), Pojačanja sa FA (`faModel`, `faResult`, `faPairView`), procena plasmana u analizi.
- Uvoz čuva broj startnih mesta (`slots.start`), posle ispravke i `slots.weekly`, `slots.gpCap`.
- Konstante: `VALUE.BENCH = 3`, `VALUE.LINEUP_MIN = 5`, posle ispravke `VALUE.SHARE_EXTRA`, `SHARE_TRIALS`, `DAY_SHIFT_H`.
