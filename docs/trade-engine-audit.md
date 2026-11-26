# Pronađi trejd: pregled logike i dijagnoza

Datum: 26. 11. 2026. Stanje koda: commit `b4f1833`. U ovom koraku nije menjano ponašanje sajta.

**Kako je mereno**
- Dodat je jedan privremeni skript, [tools/tf_audit.js](../tools/tf_audit.js). Sajt ga ne učitava.
- Skript pokreće motor iz app.js preko `tfEngine.toString()` i u tu kopiju ubacuje brojače. Logika motora se ne menja.
- Oznake (Lock, „Dajem ako mora”), strategiju i režim postavlja samo u memoriji. localStorage ne dira.

**Podaci**
- Tvoja ESPN liga 2069440345 („NBA tviter”, tim Red Galaxy), uvezena na localhostu 26. 11.
- Format: H2H most categories, 9 kategorija: FG%, FT%, 3PM, REB, AST, STL, BLK, TO, PTS.
- 12 timova, 13 aktivnih mesta i 2 IR mesta. Nijedna kategorija nije puntovana.
- Na „Proveri zdravog razuma” (deo C) pored nje su i dve ručne lige iz profila na localhostu: „Moja liga” (protivnik Marko) i „Test paste”.
- Lige koje postoje samo u tvom Chrome-u ovde nisu bile dostupne.

**Napomena o brojevima**
- Slobodno mesto se računa iz waiver liste. Lista stiže nekoliko sekundi posle otvaranja lige.
- Pre nego što stigne, vrednost slobodnog mesta je bila 7,01, a posle 4,58.
- Svi brojevi ispod su posle učitavanja (4,58).
- Rezultati se menjaju sa svakim osvežavanjem statistike, pa tvoj ekran od ranije može malo da se razlikuje.

Skraćenice u tekstu:
- **v**: tržišna vrednost (cena). Polje `v` u motoru.
- **rv**: stvarna (realna) vrednost. Polje `rv`.
- **OP**: očekivane pobede po kategorijama, u proseku protiv svih ostalih timova lige.
- **S**: skor za rangiranje.

---

## A. KAKO TRENUTNO RADI

Sve je u `assets/app.js`.

- Čist motor je `tfEngine()` (red ~955). Isti tekst radi u Web Workeru i u testovima.
- Priprema podataka je u `tfBase()` (~10300), `tfModel()` (~10446) i `tfInput()` (~10518).
- Prikaz kartica je u `tfCardView()`, `tfWhy()` i `tfCardHTML()` (~10712 do 10808).

### A1. Tok od klika do 8 kartica

**1. Klik na „Pronađi trejdove” → `tfAction('tf-run')` → `tfRun()`**

**2. `tfCtx()` određuje strane**
- Moji igrači su `lg.roster.players`, a protivnikovi `lg.opps[oppKey].players`.
- Zajedno sa njima stiže i oznaka `ir` (da li je igrač na IR-u).

**3. `tfModel(ctx)` pravi model**
- Za svakog igrača pravi zapis:
  `{ id, v, rv, t, vec, mark, ir, out, gone, wk, fr, irOk, late, drop, tc }`
- Sve vrednosti dolaze iz `tfBase()`. Detalji su u A2.
- Pravi zbirove ostalih timova (`opps`) i SD po kategoriji (`sd`).
- Određuje moje kategorije (`myIdx`, bez punta).
- Određuje protivnikove kategorije: `oppIdx` (bez njegovog punta) i `oppW` (njegove težine).
- Pravi spiskove `sell` i `buy` za Prodaj skupo i Kupi jeftino.

**4. `tfInput(M)` pravi ulaz za motor**
- `limits` su granice za izabrani režim i sve blaže pre njega:
  - Fer: `[[0,10, 0,15]]`
  - Malo u moju korist: `[[0,10, 0,15], [0,125, 0,175]]`
  - Agresivno: dodaje i `[0,15, 0,20]`
- `w` su težine mojih kategorija. Postoje samo u Popravi kategorije sa izabranim kategorijama (FOCUS_W = 2), inače su `null`.
- `fa` su četiri jednaka slobodna mesta.
- Ulaz nosi i `noDrop`, `myIrFree`, `thIrFree` i `sit`.

**5. `search(inp)` u Workeru**

- **a) Ko sme u trejd.** Igrač sme ako:
  - nije zaključan;
  - nije na IR-u, osim ako ima oznaku „U trejd”;
  - nije van do kraja sezone (`gone`), osim ako ima oznaku „U trejd”.
- **b) Kombinacije.** `combos()` daje sve kombinacije od 1 do MAX_SIDE = 4 igrača sa svake strane, uz obavezne „U trejd”. Ako je uključen filter, ostaju samo protivnikove kombinacije sa bar jednim igračem koji prolazi filtere.
  - Sa 13 slobodnih igrača po strani: 13 + 78 + 286 + 715 = **1.092** kombinacije.
- **c) Dozvoljeni oblik (`shapeOk`):**
  - |broj igrača koje dobijam − broj koje dajem| ≤ 1 (2 u Konsolidaciji i Dubini);
  - Konsolidacija traži da dajem više igrača nego što dobijam, Dubina obrnuto;
  - „Ne otpuštam nikoga” zabranjuje da dobijam više nego što dajem.
- **d) Gruba provera vrednosti.** Protivnikove kombinacije su sortirane po zbiru `v`. Za svaku moju kombinaciju binarnom pretragom se uzimaju samo one u prozoru oko fer vrednosti.
  - Granica: `L = min(0,95; maxL × 1,06 + 0,06)`.
  - Uz to se računa gruba korekcija za otpuštanje ili slobodno mesto. Rezerva je ±50% te korekcije.
- **e) Tačna provera para (`evalPair`)**, redom:
  1. Pravilo najboljeg igrača (A2.9).
  2. IR mesta: povređeni sa `irOk` ide na slobodno IR mesto primaoca.
  3. Otpuštanja i slobodna mesta (A2.10).
  4. Tačna fer granica: `valueGap(A, B) ≤ granica`, sa A i B posle otpuštanja i slobodnih mesta (A2.6).
  5. Pravilo za protivnika: kategorije, ili FPts u poenskoj ligi (A2.7).
  6. Korist za mene: `gain > MIN_GAIN` (0,01 OP; u poenima 0,2 FPts).
  7. U Popravi kategorije, ostale kategorije ne smeju da padnu više od KEEP_DROP.
  8. Kartica bar nerešena: pobede ≥ porazi. Ne važi za Popravi kategorije. U poenima se traži da FPts ne padne.
  9. Skor: `S = gain − kazna za veličinu + bonusi za povrede`.
  10. Uslov strategije: Prodaj skupo, Kupi jeftino.
  11. „Dajem ako mora”: S −= 0,25.
- **f) Pretvaranje otpuštanja u trejd (`convert`, A2.11).** Ako pretvoreni trejd prođe sve provere, on zamenjuje originalni.
- **g) Razvrstavanje po stepenu.** Prošli trejd ide u stepen (tier) prve granice koju zadovoljava. Kad stepen ima više od 12.000 trejdova, sortira se i seče na KEEP × 10 = 4.000.
- **h) `orderTiers`.** Stepeni se ređaju redom od najbližeg fer. Sledeći stepen se uzima samo ako ih do tada ima manje od ENOUGH = 10.
  - Unutar stepena redosled je po S, pa po `ob` (korist za protivnika), pa po manjem broju igrača.
- **i) `paginate`.** Slaže strane od 8 (detalji u A6). Čuva se do KEEP = 400 predloga.

**6. Prikaz**
- `tfResultsHTML` prikazuje prvih 8.
- „Generiši novih 8” prikazuje sledećih 8 iz istog spiska (bez novog računanja).

**Koliko se računa (tvoja ESPN liga, Lajkovacka pruga, Najbolje za mene, Fer)**

| Šta | Bez Lock-a | Powell zaključan |
|---|---|---|
| Kombinacije | 1.092 × 1.092 | 1.092 × 793 |
| Mogućih parova | 1.192.488 | 865.956 |
| Odbijeno zbog oblika | 137.566 | 107.107 |
| Ušlo u tačnu proveru | 235.863 | 170.320 |
| Prošlo fer granicu | 95.868 | 70.913 |
| Prošlo i pravilo za protivnika | 67.949 | 50.767 |
| Prošlo sve | 19.112 | 14.126 |
| Ostalo za rangiranje (posle sečenja na 4.000) | 11.648 | 6.553 |
| Trajanje | ~0,3 s | ~0,2 s |

Veliki trejdovi preovlađuju već u broju kandidata. Oblika 4:4 ima 511.225, a 1:1 samo 169.

### A2. Formule i konstante

#### A2.1 Mešavina perioda (`blendWeights`, `blendValue`, `blendLine`; konstante u `FA`)

**Osnovne težine:** `FA.BLEND = { proj: 0,5, season: 0,35, l15: 0,3, l7: 0,2 }`

Težina perioda se smanjuje kad igrač u njemu ima malo utakmica:
- `težina = osnovna × min(1, GP / FULL)`
- `FA.BLEND_FULL_GP = { season: 20, l15: 6, l7: 3 }`

**Projekcija slabi sa odigranim utakmicama.** Ima dve varijante:
- Opšta i tržišna vrednost:
  - `proj × max(PROJ_FLOOR, 1 − GP_sezone / PROJ_FADE_GP)`
  - PROJ_FADE_GP = 25, PROJ_FLOOR = 0,25
- Stvarna vrednost:
  - `proj × max(0, 1 − GP_sezone / 15)`
  - REAL_PROJ_FADE_GP = 15, REAL_PROJ_FLOOR = 0
  - Posle 15 utakmica projekcija nestaje.

Težine se na kraju normalizuju da im je zbir 1.

**Primer: Rui Hachimura, 14 utakmica u sezoni**

| Težine | proj | season | l15 | l7 |
|---|---|---|---|---|
| Opšta | 0,228 | 0,254 | 0,311 | 0,207 |
| Stvarna | 0,043 | 0,315 | 0,385 | 0,257 |

Linija igrača (`lineOf`) je mešavina linija perioda sa opštim težinama.
- Povređenom se zbirne statistike množe sa `fr`, delom preostalih utakmica posle povratka.
- MIN, GP i procenti se ne množe.

#### A2.2 Z-score po kategorijama (`categoryValues`, `zScores`, `catContribution`)

**Bazen:** broj timova × aktivna mesta = 12 × 13 = **156**.

Računa se u dva prolaza:
1. Prvi prolaz rangira sve igrače.
2. Drugi računa prosek i SD samo na najboljih 156.

**Doprinos igrača u kategoriji:**
- Zbirne kategorije: vrednost po utakmici.
- Procenti: `pogoci − procenat_bazena × pokušaji`.

Formula: `z = (doprinos − prosek) / SD`. Za TO se znak obrće.

Ukupna vrednost igrača je zbir z po kategorijama, bez težina.

U poenskoj ligi (`pointsValues`) vrednost je `FPts po utakmici − nivo zamene`.
- Nivo zamene je prosek igrača rangiranih od 157. do 168. mesta.

#### A2.3 Opšta vrednost (`genRaw`, u `tfBase`)

- Opšta vrednost: `genRaw = blendValue(z po periodima, opšte težine).total`
- Nivo zamene: `repl` je prosek genRaw igrača na mestima 157 do 168. U tvojoj ligi `repl = −2,675`.
- Opšta vrednost služi:
  - kao komponenta tržišne vrednosti;
  - za redosled otpuštanja kad su vrednosti iste (`t`);
  - kao granica „najboljeg slobodnog” (`dropBar`).

#### A2.4 Tržišna vrednost v (`tfMarket` i `market` u `tfBase`)

**1. Komponente po igraču**

| Komponenta | Šta je | Težina (`TF.MARKET`) |
|---|---|---|
| GEN | opšta vrednost genRaw | 0,45 |
| PROD | sirova produkcija, vidi ispod | 0,25 |
| MIN | minuti po utakmici iz mešavine | 0,15 |
| OWN | ESPN vlasništvo u % | 0,10 |
| RANK | −ln(rang po vlasništvu) | 0,05 |

PROD je zbir statistike sa težinama `TF.PROD_W`:
- PTS 1, TPM 0,5, REB 1,25, AST 1,5, STL 2, BLK 2, TO −0,5.
- U poenskoj ligi je to FPts.

**2. Z-score komponenti** se računa u bazenu 156 igrača sa najvećim vlasništvom. Svaki z je najmanje −2 (`MARKET_Z_MIN`).

**3. Ocena po utakmici:** `m = Σ težina × z`.

**4. Nivo zamene i skala**
- `replM`: prosek ocena na mestima 157 do 168. U tvojoj ligi −1,165.
- `S`: prosek pozitivnih `m − replM` u top 156. U tvojoj ligi 1,203.

**5. Dodatak za zvezde (`star`)**
- `star(x) = S × (x / S)^1,2` za x > 0 (`STAR_POW` = 1,2).
- Negativne vrednosti ostaju iste.

**6. Vrednost do kraja sezone**
- `v = star(m − replM) × preostale utakmice tima × dostupnost`
- Dostupnost (`availT`):
  - zdrav igrač: `GP / moguće utakmice` (`durability`), između 0 i 1;
  - povređen igrač: ista vrednost × `fr`.
- Ako se igrač vraća posle početka plejofa, a tim primaoca se bori za plejof, v se još množi sa `PLAYOFF_LATE` = 0,4. Statistika ostaje ista.

#### A2.5 Stvarna (realna) vrednost rv (`real` u `tfBase`)

- Kao opšta vrednost, ali sa težinama perioda za stvarnu vrednost. Projekcija nestaje posle 15 utakmica.
- Bez vlasništva, imena i minuta.
- `rv = star(realPG − replR; SR) × utakmice × dostupnost`
- U tvojoj ligi: `replR = −2,652`, `SR = 2,839`.

**Gde se koristi rv:**
- redosled otpuštanja (`wk`);
- presuda za otpuštanje (`dropVerdict`, A2.10);
- vrednost slobodnog mesta za otpuštanje.

**rv se NE koristi** ni u fer granici, ni u koristi, ni u rangiranju.

#### A2.6 Fer granica (`valueGap`, `TF.LIMITS`)

**Formula:** `gap = |A − B| / max(A, B)`
- A je ono što ja dobijam: zbir `v` dolazećih − `v` igrača koje otpuštam + `v` slobodnih mesta.
- B je isto za protivnika.
- Udeo „kasnijih” otpuštanja i privremenih mesta ide sa težinom utakmica dok je povređeni na IR-u.

| Režim | Bez „U trejd” | Sa igračem „U trejd” |
|---|---|---|
| Fer | 10% | 15% |
| Malo u moju korist | 12,5% | 17,5% |
| Agresivno | 15% | 20% |

**Granica je simetrična:** gleda se apsolutna razlika. „Malo u moju korist” i „Agresivno” ne traže da razlika bude u moju korist. Samo dozvoljavaju veću razliku u bilo kom smeru.

Gruba provera pre tačne koristi `WINDOW_MARGIN` = 0,06 (A1, korak 5d).

#### A2.7 Pravilo za protivnika (`catFilterOk`, `sideResult`)

**Kategorije:**
- Protivnikov tim se poredi pre i posle trejda, po kategoriji, na njegovim kategorijama `oppIdx` (bez njegovog punta).
- Uslov: `porazi − pobede ≤ CAT_MAX_DIFF` = 1. Nerešeno se ne broji.
- Njegov punt: kategorija u kojoj je poslednji ili pretposlednji i bar `OPP_PUNT_Z` = 1,25 SD ispod proseka lige.

**Prag za nerešeno (`TF.TIE`):**
- zbirne kategorije: 0,05 po utakmici za ceo tim;
- procenti: 0,001;
- odnosi: 0,01.

**Poeni:** protivnik ne sme da izgubi više od `PTS_MAX_LOSS` = 1,5 FPts po utakmici.

**`ob`** (korist za protivnika) = Σ rezultat × `oppW`, gde je rezultat +1, −1 ili 0.
- `oppW` po protivnikovom mestu u kategoriji (`VALUE.NEED_WEIGHT`):
  - donja trećina 1,5;
  - sredina 1;
  - gornja trećina 0,6.
- `ob` služi samo kao drugi ključ u redosledu i nigde drugde.

#### A2.8 Korist za mene (`expWins`)

**Tim** je zbir linija po utakmici svih mojih igrača koji nisu na IR-u. U tvom slučaju to je 13 igrača.
- Ne gleda se ko je u postavi niti koliko ko igra nedeljno.
- Svaki igrač sa rostera se broji kao da igra svaku utakmicu, uz `fr` za povređene.

**OP po kategoriji:**
- Za svakog drugog tima: `Φ((moj − njegov) / SD)`, gde je Φ normalna raspodela.
- SD je rasipanje zbirova svih timova u toj kategoriji.
- Ukupno: `OP = Σ_k w_k × prosek_po_timovima`.
- `w` je 1 u svim strategijama. Izuzetak je Popravi kategorije sa izborom: izabrane kategorije imaju težinu 2.

**Korist:** `gain = OP_posle − OP_pre`. Mora biti > `MIN_GAIN` = 0,01 (poeni: > 0,2 FPts).
- Popravi kategorije uz izbor ima i uslov da nijedna neizabrana kategorija ne padne više od `KEEP_DROP` = 0,12 OP.

**Kartica:** `sideResult` za moj tim pre i posle, na `myIdx`, sa istim pragovima `TIE`. Mora biti pobede ≥ porazi, osim u Popravi kategorije.

**Bez uvezene lige** (nema drugih timova): korist je rezultat kartice po kategorijama + `0,05 × prosečna razlika u SD`, ograničena na ±2 po kategoriji.

#### A2.9 Pravilo najboljeg igrača (`TOP_TOL`, `TOP_TOL_OPP`)

- `gTop` je moj najvredniji igrač u trejdu po `v`. `rTop` je isto za igrače koje dobijam.
- **Moja strana:** ako je `rTop < gTop × (1 − 0,20)`, trejd otpada.
  - Važi u Najbolje za mene, Popravi kategorije, Kupi jeftino i Konsolidaciji.
  - U Prodaj skupo važi samo ako moj najbolji nije na spisku `sell`.
  - U Dubini ne važi.
- **Protivnikova strana:** ako je `gTop < rTop × (1 − 0,30)`, trejd otpada. Važi uvek.
- Mete za trejd imaju dodatno pravilo: meta mora biti najvredniji igrač kog dobijam (`topId`, `mk`).

#### A2.10 Otpuštanje i realna zamena sa waivera

**Ko sme da bude otpušten (`dropVerdict` + `dropOk`)**
- Igrač nije zaključan i nije na IR-u.
- `rv` je ispod `rv` slobodnog mesta, a `v` ispod `v` slobodnog mesta (`DROP_PRICE_MARGIN` = 0).
- Vlasništvo je ispod `DROP_MAX_OWN` = 50%.
- Ako je rv nisko, a cena ili vlasništvo više, igrač je **Trejd kandidat** (`tc`). Ne otpušta se, a trejd koji bi ga otpustio otpada.

Tvoj roster po presudi:

| Presuda | Igrači |
|---|---|
| Sme da bude otpušten | Dillon Brooks (rv −67,3, v 2,1, 31%) |
| Trejd kandidat | Peyton Watson, Rui Hachimura, Andrew Nembhard, John Collins |
| Ostaju | svi ostali |

**Koliko se otpušta**
- `myD0 = broj zdravih koje dobijam − broj zdravih koje dajem`. Ako je > 0, toliko mojih najslabijih ide.
- Redosled (`weakest`, `wk`):
  1. Trejd kandidat poslednji.
  2. Manje rv.
  3. Manje v.
  4. Manje t.
- U izbor ulaze i dolazeći igrači. Ako bi neko od njih bio otpušten, trejd otpada (`drop_incoming`).
- Ako nema dovoljno igrača koji smeju da budu otpušteni, trejd otpada (`no_drop`).

**Slobodno mesto (`tfSlotValue`)**
- Kad dajem više nego što dobijam, svako prazno mesto popunjava ista „realna zamena”.
- U uvezenoj ligi to je prosek **3. do 5.** zdravog slobodnog igrača po rv (`SLOT_FROM` = 3, `SLOT_TO` = 5).
- Igrač na waiveru ulazi sa ×0,8 (`SLOT_WAIVER`).
- U ručnoj ligi to je nivo zamene iz bazena: prosek igrača na mestima 157 do 168.

Tvoja liga sada:

| Igrač | rv | v | Napomena |
|---|---|---|---|
| Quentin Grimes | 80,9 | 36,5 | na waiveru, ×0,8 |
| Kenrich Williams | 49,8 | −13,1 | |
| Jordan Goodwin | 40,2 | −2,4 | |
| **Slobodno mesto** | **51,5** | **4,58** | prosek |

Statistika slobodnog mesta po utakmici:
- 9,8 PTS, 4,3 REB, 2,7 AST, 1,0 STL, 0,3 BLK, 1,7 3PM, 0,8 TO
- FG 3,4/7,6, FT 1,3/1,7

**Važno:** slobodno mesto u fer granici donosi samo **4,58** (cena), a u koristi za moj tim donosi celog igrača sa statistikom iznad.

#### A2.11 Pretvaranje otpuštanja u trejd (`convert`)

- Igrač kog bi neka strana otpustila, a koji drugoj strani vredi više od `v` slobodnog mesta (ili je Trejd kandidat), dodaje se u trejd drugoj strani.
- U Konsolidaciji i Dubini dodavanje ne sme da pokvari oblik.
- Novi trejd ponovo prolazi sve provere. Ako prođe, zamenjuje originalni.
- Na proveri: 102 od 1.570 predloga sa prvih strana bila su pretvorena.

#### A2.12 Kazna za veličinu i ograničenja oblika

**Kazna za veličinu**

| | Najbolje, Popravi kategorije, Prodaj skupo, Kupi jeftino | Konsolidacija i Dubina |
|---|---|---|
| Kategorije | `0,13 × max(0, kG + kR − 2)` OP (`SIZE_PEN`) | `0,07 × 3 × max(0, max(kG, kR) − 2)` (`SIZE_PEN_WIDE`) |
| Poeni | 1,3 FPts po igraču (`SIZE_PEN_PTS`) | 0,7 FPts (`SIZE_PEN_WIDE_PTS`) |

Primeri kazne u prvoj koloni, kategorije: 2:1 −0,13, 2:2 −0,26, 3:3 −0,52, 4:4 −0,78.

**Neravnomerni trejdovi**
- `MAX_DIFF` = 1: razlika u broju igrača. U Konsolidaciji i Dubini `MAX_DIFF_WIDE` = 2.
- Na svakoj strani od 8 najviše 2 trejda gde dobijam više (`GET_MORE_MAX`) i najviše 2 gde dajem više (`GIVE_MORE_MAX`).
- Ta dva ograničenja važe u Najbolje, Popravi kategorije, Prodaj skupo i Kupi jeftino.

#### A2.13 Povrede (`tfInjury`, `tfInjFrac`, `tfIrOk`, bonusi `TF.INJ`)

**Povratak igrača koji je OUT**
1. ESPN datum povratka. Ako je prošao, a igrač je i dalje OUT: danas + `PAST_DAYS` = 3 dana.
2. Broj nedelja iz vesti (`tfNewsWeeks`).
3. Inače `DEFAULT_WEEKS` = 6 nedelja.

**Van do kraja sezone (`gone`):** ESPN `outForSeason` ili tekst vesti (`TF_GONE`). Takav igrač ne ulazi u predloge, osim ako ima oznaku „U trejd”.

**`fr`:** udeo preostalih utakmica njegovog tima posle povratka. Množi zbirne statistike i dostupnost.

**IR**
- Na IR primaoca ide samo:
  - povreda od bar `IR_MIN_WEEKS` = 2 nedelje;
  - ako to pravilo lige dozvoljava;
  - dok ima slobodnih IR mesta.
- Protivnikova IR mesta se znaju samo u uvezenoj ligi.
- U tvojoj ligi: ti imaš 1 slobodno IR mesto, Lajkovacka pruga 0.

**Bonusi u skoru** (OP; u poenima ×10)

| Bonus | Vrednost | Kada |
|---|---|---|
| `B_PRESSURE` | +0,05 | protivnik ima više povređenih nego IR mesta, a daje povređenog |
| `B_CONTEND` | +0,04 | bori se za plejof (mesto ≤ broj timova u plejofu + `CONTEND_EXTRA` = 1) i daje povređenog za zdravog |
| `B_REBUILD` | +0,04 | pri dnu je i daje povređenog |
| `B_MY_IR` | +0,05 | dobijam kratku povredu (do `SHORT_WEEKS` = 3) koja ide na moj slobodan IR |
| `B_BUY` | +0,15 | isto, u strategiji Kupi jeftino |
| `B_SELL_MY` | +0,05 | ja imam više povređenih nego IR mesta, a on ima slobodno IR mesto |

Svi važeći bonusi se sabiraju. Najveći od njih postaje tekst „Zašto bi prihvatio”.

#### A2.14 „Ne otpuštam nikoga” (`tfNoDrop`, `shapeOk`)

- Zabranjuje oblike u kojima dobijam više igrača nego što dajem.
- Ništa drugo ne menja. Moje otpuštanje i dalje može da nastane kad dolazi povređeni koji ne može na IR.

#### A2.15 Ostale konstante

| Konstanta | Vrednost | Šta radi |
|---|---|---|
| `KEEP` | 400 | koliko predloga se čuva |
| `PER_PAGE` | 8 | predloga po strani |
| `ENOUGH` | 10 | posle koliko trejdova se ne uzima sledeći stepen |
| `FOCUS_W` | 2 | težina izabranih kategorija |
| `KEEP_DROP` | 0,12 | koliko neizabrana kategorija sme da padne |
| `FORM_GAP` | 1,0 z (poeni: 4 FPts) | razlika forme i projekcije za Prodaj skupo i Kupi jeftino |
| `FORM_BONUS` | 0,15 OP (poeni: ×10) | bonus za Prodaj skupo i Kupi jeftino |
| `SOFT_PENALTY` | 0,25 OP (poeni: 2,5 FPts) | kazna za „Dajem ako mora” |
| `VETO_MAX` | 3 | najviše kartica sa savetom za veto |

### A3. Lock, „U trejd” i „Dajem ako mora”

**Lock (🔒)**
- Moj igrač: ne ulazi u trejd i ne može da bude otpušten. Važi za celu ligu, za sve protivnike (`TF_LOCK_K`).
- Protivnikov igrač („Ne želim ga”): isto, samo za tog protivnika.
- Zaključan igrač ostaje u zbiru tima, pa i dalje utiče na korist.

**U trejd (⇄)**
- Igrač mora biti u svakoj kombinaciji na svojoj strani (`mReq`, `tReq`).
- Fer granica postaje šira (druga vrednost u `LIMITS`).
- Igrač na IR-u ili van do kraja sezone sa ovom oznakom ipak sme u trejd.
- Ako je na jednoj strani više od 4 takva igrača, nema rezultata.

**Dajem ako mora (💲)**
- Samo za moje igrače, po protivniku.
- Trejd sa takvim igračem dobija S − 0,25 OP (poeni: − 2,5 FPts).
- Nije zabrana ni stepen, nego samo kazna u skoru.

### A4. Strategije i režimi: šta stvarno menjaju

| Strategija | Šta menja u kodu | Ocena |
|---|---|---|
| **Najbolje za mene** (`best`) | Ništa posebno. Važe sva opšta pravila. Skor je `gain − kazna za veličinu + bonusi`. | Delimično. Skor jeste „korist za moj tim”, ali korist se računa sa slobodnim mestom kao punim igračem i sa celim rosterom kao „timom” (A2.8, A2.10). Zato ime obećava više nego što pravila garantuju. |
| **Popravi kategorije** (`cats`) | Izabrane kategorije dobijaju težinu 2 u OP. Ostale ne smeju da padnu više od 0,12 OP. Ne traži se da kartica bude bar nerešena. **Bez izbora kategorija:** isto što i Najbolje, samo bez uslova za karticu. | Sa izborom radi ono što kaže. Pošto težina 2 duplira korist, a kazna za veličinu ostaje ista, ova strategija daje najveće trejdove: 120 od 273 predloga imaju 4 igrača na strani. |
| **Prodaj skupo** (`sell`) | Trejd mora da sadrži bar jednog mog igrača sa spiska `sell`, gde je forma (mešavina l15 0,6 i l7 0,4) − projekcija ≥ 1,0 z (poeni 4 FPts). +0,15 OP. Pravilo najboljeg igrača ne važi ako je moj najbolji sa spiska. | Ne odgovara tvojoj definiciji. Meri „vruću formu u odnosu na projekciju”, ne „cena veća od stvarne vrednosti”. Motor ima obe vrednosti (v i rv), ali ih ovde ne koristi. |
| **Kupi jeftino** (`buy`) | Bar jedan protivnikov igrač sa spiska `buy` (projekcija u top 156 i projekcija − forma ≥ 1,0 z), ili kratka povreda koja ide na moj slobodan IR. +0,15 OP za spisak; za IR slučaj +0,15 (`B_BUY`). | Isto: meri lošu formu, ne „cena niža od stvarne vrednosti”. Na proveri 63 od 264 predloga ne sadrže igrača čiji je rang po ceni bar 15 mesta lošiji od ranga po stvarnoj vrednosti. |
| **Konsolidacija** (`cons`) | Samo oblici gde dajem više nego što dobijam, razlika do 2. Kazna za veličinu po većoj strani. Pravilo najboljeg igrača: moj najbolji najviše 25% vredniji od njegovog najboljeg (`rTop ≥ 0,8 × gTop`). | Oblik da, „za jačeg igrača” ne. Ništa ne traži da dobijem najboljeg igrača u trejdu: 27 od 240 predloga to krše. Svaki predlog ima slobodno mesto, a 165 od 240 (69%) je loše kad se slobodno mesto ne računa. |
| **Dubina** (`depth`) | Samo oblici gde dobijam više nego što dajem, razlika do 2. Pravilo mog najboljeg igrača ne važi. | Oblik odgovara imenu. Svaki predlog traži moje otpuštanje, osim kad dolazeći povređeni ide na IR. |

**Režimi (Fer, Malo u moju korist, Agresivno)**
- **Menjaju:**
  - fer granicu: 10%, 12,5% ili 15%;
  - broj stepena u `limits`.
- **Ne menjaju:**
  - smer: granica je simetrična, ne traži da razlika ide u moju korist;
  - redosled: blaži stepen se uzima samo ako stroži ima manje od 10 trejdova. U praksi stroži uvek ima hiljade.

**Izmereno** (78 kombinacija liga × protivnik × strategija):
- Prva strana je ista u Fer i Malo u moju korist u **78 od 78** slučajeva.
- Prva strana je ista u Fer i Agresivno u **75 od 78** slučajeva.
- Primer, Lajkovacka pruga, Najbolje za mene:
  - Fer: stepen 0 ima 11.648 trejdova.
  - Malo u moju korist: dodatnih 4.954 trejdova u stepenu 1 se nikad ne prikažu.
  - Agresivno: isto, dodatnih 4.954 + 5.014.
- Udeo predloga gde dobijam veću tržišnu vrednost od protivnika: 72,2% u Fer, 72,2% u Malo u moju korist i 72,4% u Agresivno.
- Prosečna razlika u moju korist: 3,1%, 3,1% i 3,2%.

**Ocena:** imena režima trenutno ne odgovaraju ponašanju.

### A5. „Dobijaš X kategorija, gubiš Y” i „Zašto bi prihvatio”

**Natpis na kartici (`tfCardView` → `faWL`)**
- Računa se ovako:
  - „pre” je zbir linija mojih igrača koji nisu na IR-u;
  - „posle” je: − igrači koje dajem + igrači koje dobijam − moja otpuštanja + slobodna mesta (vektor realne zamene);
  - zatim `sideResult` po mojim kategorijama, sa pragovima `TIE`.
- Prag je mali: **0,05 po utakmici za ceo tim od 13 igrača**. Zato i promena od 0,1 TO ili 0,3 STL po utakmici donosi „dobijenu kategoriju”.
- Natpis ne kaže da deo statistike dolazi od igrača sa waivera. To piše samo sitno: „Slobodno mesto: realna zamena sa waivera.”
- Ispod natpisa su tri najveće promene (po SD) i čipovi ✓, ✗ i = po kategoriji.
- U poenskoj ligi natpis je „±X FPts po utakmici”.

**„Zašto bi prihvatio” (`tfWhy`)**
1. Ako postoji situacija sa povredom (`sit`), ispisuje se ona:
   - pressure: „Ima N povređenih, a M IR mesta.”
   - contend, rebuild, sellmy, myir
2. Poeni: „Dobija +X FPts po utakmici.”
3. Kategorije: od kategorija koje protivnik dobija (`ow`, njegove kategorije sa rezultatom +1) bira onu u kojoj je **najlošije plasiran**: „Dobija AST, gde je 11. u ligi.”
   - Ako nema plasmana: „Dobija X, gde je slabiji od tebe.”
   - Ako ne dobija ništa: „Trejd je za njega ravnopravan po vrednosti.”

Tekst ne zavisi od toga koliko protivnik ukupno gubi. U slučaju 1 njegov ponderisani rezultat je −0,3, a tekst ipak navodi razlog za prihvatanje.

### A6. Raznovrsnost

Postoji, u `paginate()`. Za svaku stranu od 8 važi:

1. **Isto jezgro samo jednom.** Jezgro su igrači sa v > 0 ili oznakom U trejd. Dodaci bez vrednosti ne prave nov predlog.
2. **Najviše 3 predloga po svakom ključu** (`cap` = 3). Ključevi su:
   - **isti moj najvredniji igrač** u trejdu,
   - **isti protivnikov najvredniji igrač** koga dobijam,
   - **isti oblik** (npr. 2:3).
3. **Neravnomerni trejdovi:** najviše 2 gde dobijam više i najviše 2 gde dajem više (A2.12).
4. **Kad strana ne može da se popuni,** prvo popušta raznovrsnost, pa ograničenje neravnomernih.

**Nema ograničenja za igrača koji nije najvredniji u svom trejdu.**
- Dillon Brooks se pojavljuje kao otpuštanje, a Aday Mara i Andrew Nembhard kao „dodaci”.
- Takvi igrači mogu da budu u svim predlozima.
- Na proveri, **196 od 202** prve strane imaju bar jednog igrača preko tvojih granica (moj u više od 3, protivnikov u više od 2).

### A7. Šta se deli sa drugim alatima

**Analiza trejda**
- Deli `tfBase()`: mešavinu perioda, tržišnu i stvarnu vrednost, presudu za otpuštanje, slobodno mesto i nivo zamene (`replLine`, `fa`, `slot`).
- Koristi i `tfIrOk` i `tfIrBound` (IR).
- Kad otvoriš predlog, analiza dobija isti trejd sa otpuštanjima i mešavinom perioda (`tfOpenX`, `mixOn`).
- Red „Slobodno mesto: realna zamena” u analizi je isti `tfBase().slot`.

**Mete za trejd**
- Za „mogući trejd” koriste isti `tfModel`, `tfInput` i `tfEngine.search` (`ttInputs`, `ttTradeInput`), sa:
  - strategijom best i granicom Fer;
  - najviše 2 igrača po strani;
  - metom kao obaveznim igračem (`topId`);
  - uzima se samo prvi predlog.
- Rangiranje meta koristi `tfBase().market` i `real`.

**Pojačanja sa FA**
- Dele mešavinu perioda (`FA.BLEND`), tržišnu i stvarnu vrednost (`faModel` → `tfBase(lg).market` / `real`) i `dropVerdict`, tj. pravilo ko sme da bude otpušten.

Svaka promena u A2.1 do A2.5 i A2.10 menja sva četiri alata.

---

## B. DVA KONKRETNA SLUČAJA

Uslovi:
- Tvoja ESPN liga, protivnik Lajkovacka pruga (`e6`).
- Najbolje za mene, Fer.
- Period u zaglavlju: Sezona. Pronađi trejd ga ne koristi, nego uvek meša periode.
- Bez oznaka, osim gde piše.

### Slučaj 1: daješ Rui Hachimura + Andrew Nembhard, dobijaš Day'Ron Sharpe, slobodno mesto: realna waiver zamena

Reprodukovan je. Kartica je **„Dobijaš 6 kategorija, gubiš 3”**.

**Mesto predloga**

| | Bez Lock-a | Powell zaključan |
|---|---|---|
| Kandidata koji su prošli sve provere | 11.648 | 6.553 |
| Mesto po skoru | 18. | 17. |
| Mesto na prvoj strani | 5. od 8 | 5. od 8 |

- Pre učitavanja waiver liste (slobodno mesto 7,01) bio je 3. na strani.
- Na 5. mesto stiže jer `paginate` preskače rangove 3 do 6 i 8 do 13. Neravnomernih trejdova je već dovoljno (A2.12).

#### Igrači i waiver zamena

| Igrač | MIN | GP/moguće | Opšta/utak. | Stvarna/utak. | v (cena) | rv (stvarna) | Rang po v | Rang po rv |
|---|---|---|---|---|---|---|---|---|
| Rui Hachimura (dajem) | 29,2 | 14/16 | −2,17 | −1,98 | 10,6 | 28,3 | 131 | 122 |
| Andrew Nembhard (dajem) | 32,2 | 14/18 | −3,83 | −4,01 | 14,9 | **−65,5** | 117 | **275** |
| Day'Ron Sharpe (dobijam) | 23,9 | 16/16 | −0,93 | −0,57 | 16,4 | **125,1** | 115 | **67** |
| Daniel Gafford (protivnik otpušta) | 23,7 | 18/18 | −1,86 | −2,01 | 2,3 | 29,8 | 151 | 121 |
| Slobodno mesto (Grimes ×0,8, K. Williams, Goodwin) | 21 do 32 | | | | 4,58 | 51,5 | | |

**Tržišna vrednost po utakmici** (m, nivo zamene −1,165):
- Rui −0,907, Nembhard −0,777, Sharpe −0,833, Gafford −1,099.

**Z komponenti cene** (GEN, PROD, MIN, OWN, RANK):

| Igrač | GEN | PROD | MIN | OWN | RANK |
|---|---|---|---|---|---|
| Rui | −0,80 | −0,93 | −0,40 | −2,00 | −1,09 |
| Nembhard | −1,47 | −0,53 | +0,43 | −0,19 | −0,55 |
| Sharpe | −0,30 | −0,79 | −1,87 | −1,72 | −0,98 |

Nembhard je „skup” zbog minuta (32) i vlasništva (69,5%). Po stvarnoj 9-cat vrednosti je 275., zbog FG% 40,8% i 2,7 TO.

**Z po kategorijama (stvarna vrednost, po utakmici)**

| | FG% | FT% | 3PM | REB | AST | STL | BLK | TO | PTS | Zbir |
|---|---|---|---|---|---|---|---|---|---|---|
| Rui | +0,13 | −0,64 | +0,45 | +0,13 | −0,94 | −0,68 | −0,69 | +0,42 | −0,16 | −1,98 |
| Nembhard | −1,22 | −0,77 | +0,35 | −1,18 | +1,82 | −0,63 | −1,07 | −1,10 | −0,20 | −4,01 |
| **Dajem ukupno** | −1,10 | −1,40 | +0,81 | −1,05 | +0,88 | −1,31 | −1,76 | −0,69 | −0,36 | **−5,99** |
| Sharpe (dobijam) | +0,78 | −0,27 | −1,45 | +0,70 | +0,15 | −0,35 | +0,56 | +0,33 | −1,01 | −0,57 |
| **Razlika** (dobijam − dajem) | +1,87 | +1,13 | −2,25 | +1,75 | −0,73 | +0,96 | +2,32 | +1,02 | −0,65 | **+5,42** |

Tim posle dobija još i slobodno mesto. Njegova linija je u A2.10.

#### Moj tim i protivnikov tim, po kategorijama (zbir po utakmici)

| Kategorija | Ja pre | Ja posle, sa slobodnim mestom | Ja posle, bez slobodnog mesta | Protivnik pre | Protivnik posle (otpušta Gafforda) |
|---|---|---|---|---|---|
| FT% | 0,780 | 0,785 ✓ | 0,785 ✓ | 0,792 | 0,797 ✓ |
| REB | 68,05 | 71,75 ✓ | 67,49 ✗ | 72,60 | 67,37 ✗ |
| PTS | 231,05 | 221,51 ✗ | 211,67 ✗ | 212,86 | 223,21 ✓ |
| BLK | 8,94 | 9,82 ✓ | 9,54 ✓ | 9,18 | 7,07 ✗ |
| 3PM | 28,29 | 25,99 ✗ | 24,28 ✗ | 22,25 | 26,18 ✓ |
| STL | 10,81 | 11,19 ✓ | 10,20 ✗ | 11,28 | 11,06 (njegov punt, ne broji se) |
| TO | 28,30 | 26,64 ✓ | 25,81 ✓ | 26,04 | 27,38 ✗ |
| AST | 49,67 | 47,30 ✗ | 44,57 ✗ | 43,45 | 46,32 ✓ |
| FG% | 0,472 | 0,477 ✓ | 0,479 ✓ | 0,468 | 0,455 ✗ |
| **Kartica** | | **6:3** | **4:5** | | **4:4** |

- Tri od šest „dobijenih” kategorija (FT%, TO, FG%) dobijam jer gubim obim i Nembhardov loš šut. STL je +0,38 po utakmici, tj. 0,24 SD.
- Bez igrača sa waivera gubim i REB i STL, pa je kartica 4:5.

#### Po vrednosti

- **Tržišna vrednost:**
  - A (ja dobijam) = Sharpe 16,40 + slobodno mesto 4,58 = **20,98**
  - B (protivnik dobija) = Rui 10,61 + Nembhard 14,93 − Gafford 2,28 = **23,27**
- **Stvarna vrednost** (rv, iznad nivoa zamene):
  - Dobijam 125,1 − dajem (28,3 − 65,5) = **+162,3** bez slobodnog mesta.
  - Sa slobodnim mestom (51,5): **+213,8**.
  - Po stvarnoj vrednosti trejd je za mene dobar. Rui i Nembhard su po rv ispod realne zamene sa waivera, pa su oba Trejd kandidati.
- **OP (očekivane pobede po kategorijama):**

| | OP | Promena |
|---|---|---|
| Pre | 4,427 | |
| Posle, sa slobodnim mestom | 4,733 | **+0,307** |
| Posle, bez slobodnog mesta | 4,038 | **−0,389** |

  Samo igrač sa waivera vredi **+0,70 OP**.

#### Svaka provera

| Provera | Brojevi | Granica | Rezultat |
|---|---|---|---|
| Oblik 2:1 | razlika 1 | ≤ 1 | prošla |
| Prozor vrednosti (grubo) | | | prošla |
| Moj najbolji igrač | najbolji kog dobijam 16,40 ≥ 0,8 × 14,93 = 11,95 | `TOP_TOL` 0,20 | prošla |
| Njegov najbolji igrač | moj najbolji 14,93 ≥ 0,7 × 16,40 = 11,48 | `TOP_TOL_OPP` 0,30 | prošla |
| IR | niko ne ide na IR | | |
| Otpuštanje | ja dobijam slobodno mesto; protivnik dobija 2 za 1 i otpušta Daniel Gafforda (presuda „drop”) | | prošla |
| Dolazeći igrač otpušten / Trejd kandidat otpušten | ne | | prošla |
| Fer granica | gap = (23,27 − 20,98) / 23,27 = **9,8%** | 10% | prošla, za 0,2% |
| Protivnik po kategorijama | pobede 4 (FT%, PTS, 3PM, AST), porazi 4 (REB, BLK, TO, FG%); ponderisano `ob` = −0,30 | porazi − pobede ≤ 1 | prošla (0) |
| Korist | gain = +0,307 OP | > 0,01 | prošla |
| Kartica | 6:3 | pobede ≥ porazi | prošla |
| Skor | S = 0,307 − 0,13 (kazna 2:1) = **0,177**. Nema bonusa. | | |
| Zašto bi prihvatio | „Dobija AST, gde je 11. u ligi.” | | |

**Isti račun bez slobodnog mesta:**
- Fer granica: A = 16,40, B = 23,27, gap = **29,5%**. Trejd **pada** na fer granici.
- Korist: −0,389 OP. Trejd **pada** i na koristi.
- Kartica: **4:5**. Trejd **pada** i na kartici.

Trejd postoji samo zato što slobodno mesto u fer granici dodaje 4,58, a u koristi dodaje 0,70 OP.

**Sa Powellom zaključanim** brojevi su isti. Powell nije u tom trejdu, a moj tim i protivnikov tim ostaju isti. Menja se samo konkurencija: 6.553 kandidata umesto 11.648, a predlog je 17. po skoru i opet 5. na strani.

### Slučaj 2: Powell zaključan, levak

Tvoji igrači su svi dostupni, 13 bez IR-a. Kod protivnika je dostupno 12 (bez IR-a i bez Powella).

Kombinacije:
- moje: 13, 78, 286, 715 (1 do 4 igrača);
- protivnikove: 12, 66, 220, 495.

Oblik „a:b” znači: dajem a, dobijam b.

| Oblik | Kandidata | Nedozvoljen oblik | Van prozora vrednosti | Najbolji igrač (moj / njegov) | Otpuštanje (dolazeći / Trejd kandidat) | Fer granica | Protivnik kategorije | Korist ≤ 0,01 | Kartica gora | Prošlo | Pretvoreno | U rangiranju |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1:1 | 156 | 0 | 140 | 0 / 0 | 0 / 0 | 10 | 1 | 2 | 1 | 2 | 0 | 2 |
| 2:1 | 936 | 0 | 812 | 6 / 18 | 14 / 0 | 42 | 11 | 14 | 8 | 11 | 0 | 11 |
| 1:2 | 858 | 0 | 722 | 40 / 14 | 0 / 0 | 42 | 13 | 3 | 8 | 16 | 0 | 16 |
| 2:2 | 5.148 | 0 | 4.371 | 137 / 45 | 0 / 0 | 243 | 107 | 96 | 91 | 58 | 0 | 58 |
| 2:3 | 17.160 | 0 | 13.629 | 1.149 / 78 | 98 / 23 | 1.046 | 391 | 95 | 328 | 323 | 0 | 323 |
| 1:3, 1:4, 2:4 | 47.905 | 47.905 | | | | | | | | | | |
| **3 za x** (3:2, 3:3, 3:4) | 226.798 | 3.432 (3:1) | 171.499 | 11.392 / 1.122 | 3.330 / 1.245 | 15.201 | 6.205 | 3.204 | 5.474 | 4.484 | 210 | 2.514 |
| **4 za x** (4:3, 4:4) | 566.995 | 55.770 (4:1, 4:2) | 397.356 | 14.477 / 3.224 | 8.789 / 1.885 | 35.309 | 13.418 | 13.391 | 13.926 | 9.232 | 218 | 3.629 |
| **Ukupno** | 865.956 | 107.107 | 588.529 | | | | | | | 14.126 | 428 | 6.553 |

**Kako čitati tabelu**
- „Van prozora” su parovi koje gruba provera vrednosti ni ne šalje u tačnu proveru (razlika u ceni oko 16% ili više).
- Kolona „U rangiranju” je manja od kolone „Prošlo” za 3:3, 3:4, 4:3 i 4:4. Stepen je jednom prešao 12.000, pa je sečen na 4.000 najboljih.
- Pretvoreni trejdovi su upisani pod svoj novi oblik.

**Šta se vidi**
- **1:1:** 140 od 156 (90%) otpada pre tačne provere jer su razlike u ceni veće od prozora. Od 16 preostalih samo 2 prođu.
- **2:2:** 85% je van prozora. Od 777 preostalih prođe 58.
- **Veliki trejdovi:** 4:4 i 4:3 daju 9.232 od 14.126 trejdova koji prođu sve (65%), samo zbog broja kombinacija.

**Prva strana i redosled po skoru (top 25)**

| Rang | Oblik | S | Korist | Trejd | Na strani 1 |
|---|---|---|---|---|---|
| 1 | 1:2 | 0,358 | 0,398 | Booker → Durant + Aday Mara, otpuštam Brooks (+0,09 povrede) | da |
| 2 | 2:3 | 0,305 | 0,605 | Okongwu + Nembhard → Dosunmu + Sharpe + Mara, otpuštam Brooks | da |
| 3 do 6 | 1:2, 2:3 | 0,27 do 0,28 | | sve sa otpuštanjem Brooksa | ne (granica 2 „dobijam više”) |
| 7 | 2:1 | 0,254 | 0,294 | Rui + Nembhard → Aday Mara + slobodno mesto | da |
| 8 do 13 | 2:3, 1:2 | | | opet otpuštanje Brooksa | ne |
| 14 | 2:2 | 0,228 | 0,398 | Booker + Brooks → Durant + Mara | da |
| 17 | 2:1 | 0,177 | 0,307 | Rui + Nembhard → Sharpe (slučaj 1) | da |
| 18 | 1:1 | 0,176 | 0,176 | Brooks → Gafford | da |
| 21 | 3:3 | 0,157 | 0,587 | Avdija + Okongwu + Nembhard → Durant + Dosunmu + Mara | da |
| 23 | 1:1 | 0,151 | 0,151 | Okongwu → Lillard | da |

**U ovoj reprodukciji u top 8 jesu ušla dva 1:1 i jedan 2:2.** Na tvom ekranu ih nije bilo. Razlika je verovatno zbog drugačijih oznaka (Lock-ova kod tebe), ranijeg stanja waiver liste ili drugog trenutka statistike.

**Mehanizam koji gura male trejdove nadole je isti:**
1. **Prozor vrednosti.** Većina malih trejdova ni ne stigne do računanja koristi.
2. **Korist raste sa brojem igrača brže od kazne.**
   - Primer 2:3 na drugom mestu: korist 0,605, kazna 0,39, bonus +0,09.
   - Najbolji 1:1 ima korist 0,176.
   - Kazna od 0,13 po igraču ne izjednačava razliku jer svaki dodatni igrač donosi i statistiku i šansu da protivnik otpusti nekog ili da ja otpustim Brooksa (rv −67).
3. **Otpuštanje Brooksa je „besplatna” korist.**
   - Brooks je po rv najlošiji na mom rosteru (−67,3), a njegova cena je 2,1, pa u fer granici skoro ništa ne košta.
   - Zato 12 od prvih 13 trejdova po skoru ima oblik „dobijam više + otpuštam Brooksa”.
4. **Mali trejdovi ulaze samo zahvaljujući `paginate`.** Kad 2 mesta za „dobijam više” i 2 za „dajem više” budu popunjena, ostala mesta dobijaju trejdovi sa jednakim brojem igrača. Bez tog ograničenja 1:1 bi bili tek na 18. i 23. mestu.

**Tri najbolja odbačena mala trejda (po koristi, razlika u ceni do 25%)**

| Trejd | Korist (prosta zamena) | Razlika u ceni | Zašto je odbačen |
|---|---|---|---|
| Avdija + Nembhard → Durant + Aday Mara | +0,579 OP | 8,4% (fer) | **Protivnik po kategorijama:** 3 pobede, 5 poraza (gubi FT%, REB, BLK, TO, FG%). 5 − 3 = 2 > 1. Ja bih dobio 7 kategorija. |
| Avdija + Brooks → Durant + Aday Mara | +0,540 OP | 17,4% | **Van prozora vrednosti:** Durant 123,1 + Mara 19,6 = 142,7, a Avdija 115,8 + Brooks 2,1 = 117,9. |
| Okongwu + Nembhard → Lillard + Aday Mara | +0,509 OP | 12,2% | **Fer granica:** 12,2% > 10%. U režimu Agresivno ušao bi u stepen 2, ali se taj stepen nikad ne prikazuje (A4). |

Bez ograničenja na razliku u ceni, najkorisniji odbačeni mali trejdovi su očigledno nefer. Primer: Brooks + Nembhard → Durant + Sharpe, razlika u ceni 88%. Odbijeni su ispravno.

**Zašto nijedan 1:1 ni 2:2 nije bliže vrhu**
- Najbolji 1:1 (Brooks → Gafford, korist 0,176) gubi od 1:2 trejdova jer oni u istoj fer granici dodaju još jednog igrača i otpuštaju Brooksa: korist ~0,40, kazna 0,13.
- Najbolji 2:2 (Booker + Brooks → Durant + Mara) ima istu korist (0,398) kao 1. mesto, ali kaznu 0,26 umesto 0,13, pa je 14.

---

## C. PROVERA ZDRAVOG RAZUMA

**Obuhvat**
- 3 lige: NBA tviter sa 11 protivnika, Moja liga (Marko), Test paste (Protivnik 1).
- 13 protivnika × 6 strategija × 3 režima = **234 pretrage** (u proseku 0,31 s po pretrazi).
- Proverena je **prva strana** (8 predloga) svake pretrage.
- Popravi kategorije je puštena sa izborom moje 3 najslabije kategorije (najmanje OP po kategoriji). To bi izabrao korisnik.
- Prazne strane: 32 od 234.
  - Moja liga ima 14 praznih od 18: ručna liga, tačna fer granica prolazi samo 3 od 107 parova.
  - Test paste ima 15 od 18: test podaci.
  - NBA tviter ima 3 od 198: Konsolidacija protiv Hakijevi bogalji.

### Pravila i kako su definisana

1. **Loše bez waiver zamene.** Predlog sa slobodnim mestom kod mene čija je korist (OP) ≤ 0 kad se slobodno mesto izbaci iz mog tima.
2. **Rotacija za klupu.** Dajem bar 2 igrača sa ≥ 24 min ili u top 150 po opštoj vrednosti, a svi koje dobijam imaju < 20 min.
3. **Najbolje za mene, slab dobitak.** Kartica pobede − porazi ≤ 1, ili korist < 0,05 OP.
   - 0,05 je prag koji alat Pojačanja sa FA koristi kao „najmanji koristan dobitak”.
4. **Više od 3 igrača na strani** van Konsolidacije i Dubine.
5. **Ponavljanje.** Moj igrač u više od 3 od 8, ili protivnikov u više od 2 od 8.
   - Broji se kao kršenje svakog predloga koji sadrži takvog igrača.
   - Odvojeno je izbrojano koliko strana ima takvog igrača.
6. **„Dajem ako mora”.**
   - Za svakog protivnika, u Najbolje za mene i Fer, moj igrač koji je najčešće u predlozima dobija oznaku 💲.
   - Kršenje: on je i dalje na prvoj strani, iako postoji bar 8 predloga bez njega.
7. **Ime strategije.** Uslovi koje sam definisao:
   - **Najbolje za mene:** korist ≥ 0,05 OP i kartica pobede − porazi ≥ 2. Ovo je obrnuto pravilo 3, pa se brojevi poklapaju.
   - **Popravi kategorije:** kartica pobeđuje u bar jednoj od moje 3 najslabije kategorije.
   - **Prodaj skupo:** dajem igrača čiji je rang po ceni bar 15 mesta bolji od ranga po stvarnoj vrednosti.
   - **Kupi jeftino:** dobijam igrača čiji je rang po ceni bar 15 mesta lošiji od ranga po stvarnoj vrednosti.
   - **Konsolidacija:** dajem više igrača nego što dobijam, a najbolji igrač u trejdu (po rv) je kod mene posle trejda.
   - **Dubina:** dobijam više igrača nego što dajem.

### Rezultat

| | Broj |
|---|---|
| Predloga ukupno | **1.570** |
| Krši bar jedno pravilo | **1.561 (99,4%)** |
| Krši bar jedno pravilo, kad se pravilo 5 ne broji | 697 (44%) |
| Pravilo 1: loše bez waiver zamene | 282 od 511 predloga sa slobodnim mestom (55%) |
| Pravilo 2: rotacija za klupu | 0 |
| Pravilo 3: Najbolje za mene, slab dobitak | 196 od 265 (74%) |
| Pravilo 4: više od 3 na strani | 195 od 1.066 van Konsolidacije i Dubine (18%) |
| Pravilo 5: ponavljanje | 1.539 predloga; 196 od 202 strane (97%) |
| Pravilo 6: „Dajem ako mora” | 2 od 11 provera |
| Pravilo 7: ime strategije | 310 |

Pravila 1, 3, 4 i 7 zajedno daju 983 kršenja na 697 predloga, jer mnogi predlozi krše više pravila odjednom.

**Raspodela veličina na prvim stranama**

| Oblik | Broj | Udeo |
|---|---|---|
| 1:1 | 54 | 3,4% |
| 2:1 | 132 | 8,4% |
| 1:2 | 198 | 12,6% |
| 2:2 | 193 | 12,3% |
| 2:3 | 210 | 13,4% |
| 3:2 | 192 | 12,2% |
| 3:3 | 231 | 14,7% |
| 3:4 | 120 | 7,6% |
| 4:3 | 108 | 6,9% |
| 4:4 | 120 | 7,6% |
| 4:2 | 12 | 0,8% |

Trejdova sa 5 ili više igrača ukupno ima 993 od 1.570 (63%).

**Kršenja po strategiji**

| Strategija | Predloga | Bar jedno | P1 | P3 | P4 | P5 (strana) | P7 | Sa slobodnim mestom |
|---|---|---|---|---|---|---|---|---|
| Najbolje za mene | 265 | 265 | 42 | 196 | 12 | 33/34 | 196 | 72 |
| Popravi kategorije | 273 | 267 | 3 | | **120** | 34/39 | 0 | 70 |
| Prodaj skupo | 264 | 261 | 36 | | 27 | 33/33 | 24 | 69 |
| Kupi jeftino | 264 | 264 | 36 | | 36 | 33/33 | 63 | 60 |
| Konsolidacija | 240 | 240 | **165** | | | 30/30 | 27 | 240 |
| Dubina | 264 | 264 | 0 | | | 33/33 | 0 | 0 |

### Najgori primeri po pravilu

Isti predlog se često ponavlja u sva tri režima jer režimi ne menjaju prvu stranu (A4). Zato ovde stoje različiti predlozi.

**Pravilo 1: loše bez waiver zamene**
1. NBA tviter · Blok 23 · Konsolidacija
   - Daješ Avdija + Brooks + Hachimura + Nembhard, dobijaš Siakam + Paul George + 2 slobodna mesta.
   - Korist sa mestima +0,72 OP, bez njih **−0,66**. Kartica 4:4, bez mesta 3:6.
2. NBA tviter · DzigiKilly · Konsolidacija
   - Daješ Buzelis + Nembhard, dobijaš Keyonte George + 1 slobodno mesto.
   - Sa mestom +0,12 OP i kartica 5:4. Bez mesta **−0,45** i kartica 2:6.
3. NBA tviter · DzigiKilly · Konsolidacija
   - Daješ Kyshawn George + Hachimura + Nembhard, dobijaš Randle + Hartenstein + 1 slobodno mesto.
   - Sa mestom +0,31 OP. Bez mesta **−0,43**, kartica 4:5.

Slučaj 1 (Rui + Nembhard → Sharpe) je isti tip: −0,39 bez mesta.

**Pravilo 2: rotacija za klupu**

Nema kršenja. Motor ne daje rotaciju za igrače ispod 20 minuta. Problem iz slučaja 1 je drugačiji: dajem 29 i 32 minuta za 24 minuta + igrača sa waivera.

**Pravilo 3: Najbolje za mene, slab dobitak**
1. Moja liga · Marko · Agresivno: daješ Sabonis, dobijaš Clingan. Korist +0,013 OP, kartica 4:4.
2. NBA tviter · Rasini rakuni · Fer: daješ Buzelis + Nembhard, dobijaš Derrick White + Podziemski. Korist +0,025 OP, kartica 4:4. Stvarna vrednost **−84,7**.
3. Najčešći oblik ovog kršenja je kartica 4:4 ili 5:4: 196 od 265 predloga u Najbolje za mene.

**Pravilo 4: više od 3 igrača na strani**
1. NBA tviter · Fruskogorski Bizoni · Najbolje za mene: daješ Flagg + Booker + Buzelis + Nembhard, dobijaš Giannis + Barnes + Jalen Smith + 1 slobodno mesto (4:3). Kartica 4:4.
2. Popravi kategorije: 120 od 273 predloga imaju 4 igrača na strani (oblici 4:4, 4:3 i 3:4).
3. Kupi jeftino: 36 predloga, a Prodaj skupo 27, većinom 4:4.

**Pravilo 5: ponavljanje** (strane sa najviše ponavljanja)
1. NBA tviter · Fruskogorski Bizoni · Popravi kategorije · Fer:
   - moji: Okongwu u **8/8**, Avdija 6/8, Nembhard 5/8;
   - protivnikovi: Kevin Porter Jr. 6/8, Alexander-Walker 5/8, Jalen Smith 5/8, Edgecombe 4/8.
2. NBA tviter · Lajkovacka pruga · Najbolje · Fer:
   - Aday Mara (povređen, bonus „pressure”) u **5/8**;
   - Nembhard 4/8;
   - Brooks otpušten u 2 i dat u 2.
3. Najbolje za mene, uopšte: Andrew Nembhard je moj igrač koji se najčešće ponavlja (4 do 6 od 8 kod 6 od 11 protivnika).

**Pravilo 6: „Dajem ako mora”** (11 provera)
1. NBA tviter · DzigiKilly: Nembhard sa oznakom 💲 je i dalje na 6. i 8. mestu, a bez njega postoji 279 predloga.
2. NBA tviter · Rasini rakuni: Nembhard sa 💲 je na 8. mestu, a bez njega postoji 297 predloga.
3. U ostalih 9 provera oznaka je igrača izbacila sa prve strane. Primer: Okongwu, Kyshawn George i Brunson pre oznake su bili na 4 ili 5 od 8 predloga, a posle ni na jednom.

**Pravilo 7: ime strategije**
- **Najbolje za mene** (196): isti predlozi kao pravilo 3.
- **Kupi jeftino** (63 od 264):
  - Dubai Rostiljdzije: daješ Brunson (otpuštaš Brooks), dobijaš Jalen Johnson + Jalen Duren.
  - Daješ Kyshawn George + Brooks, dobijaš Duren + Kessler.
  - Igrači koje dobijaš su u lošoj formi, ali nisu jeftini na tržištu: rang po ceni nije lošiji od ranga po stvarnoj vrednosti.
- **Prodaj skupo** (24 od 264):
  - DzigiKilly: daješ Kyshawn George (otpuštaš Brooks), dobijaš VanVleet + Diabate. Kartica 6:2.
  - Wendell Carter Jr. → Diabate.
  - George i Carter su u formi, ali njihova cena nije iznad stvarne vrednosti.
- **Konsolidacija** (27 od 240): DzigiKilly, daješ Avdija + Hachimura + Nembhard, dobijaš Kyrie Irving + Diabate + slobodno mesto.
  - Najbolji igrač u trejdu po stvarnoj vrednosti je Avdija, koga daješ.
  - Bez slobodnog mesta korist je −0,26, a kartica 4:5.
- **Popravi kategorije i Dubina:** 0 kršenja po ovim uslovima.

---

## D. PROCENA

### D1. Pravila koja se sudaraju ili poništavaju

1. **Fer granica i korist ne gledaju isto slobodno mesto.**
   - U fer granici slobodno mesto vredi kao njegova cena: 4,58, skoro nula.
   - U koristi vredi kao ceo igrač: Grimes, Williams i Goodwin, 9,8 PTS, 4,3 REB, 1,0 STL po utakmici.
   - Na protivnikovoj strani važi isto, samo obrnuto: igrač kog on otpušta (Gafford, cena 2,28) mu skoro ništa ne oduzima u fer granici.
   - U slučaju 1 to je +0,70 OP „besplatno”, a trejd i dalje deluje fer.
2. **Kazna za veličinu i fer granica.**
   - Fer granica je relativna (10% veće strane), pa veći trejd ima veći apsolutni višak.
   - Kazna (0,13 po igraču) to treba da izjednači, ali korist velikih trejdova raste brže: 2:3 sa korišću 0,605 prestiže 1:1 sa 0,176.
   - U Popravi kategorije težina 2 duplira korist, a kazna ostaje ista. Zato tamo ima 120 od 273 trejdova sa 4 igrača na strani.
3. **Stepeni u `orderTiers` poništavaju režime.** Pošto je ENOUGH = 10, a stroži stepen ima hiljade trejdova, Malo u moju korist i Agresivno daju istu prvu stranu kao Fer (78/78 i 75/78).
4. **Rangiranje i strana se razlikuju.** `paginate` sa granicom 2 + 2 za neravnomerne trejdove menja redosled. Slučaj 1 je 18. po skoru, a 5. na strani; 1:1 su 18. i 23., a na strani su.
5. **Kartica i pravilo za protivnika koriste broj kategorija sa vrlo malim pragom** (0,05 po utakmici za ceo tim).
   - Za mene: „6:3” sadrži tri pobede koje su posledica manjeg obima (TO) i boljeg procenta.
   - Za protivnika: 4:4 prolazi, iako je njegov ponderisani rezultat −0,30 i gubi Gafforda.
   - Ponderisani rezultat (`ob`) se koristi samo kao drugi ključ u redosledu.
6. **„Dajem ako mora” je fiksna kazna** (0,25 OP), a korist ide od 0,15 do 1,9 OP. U velikim trejdovima kazna je premala da bi igrača sklonila (2 od 11 provera).

### D2. Pravila koja su suvišna ili rade nešto drugo nego što ime kaže

- **Režimi:** imena kažu „u moju korist”, a granica je simetrična. Režim u praksi ništa ne menja (A4).
- **Prodaj skupo i Kupi jeftino:** mere formu u odnosu na projekciju, a ne cenu u odnosu na stvarnu vrednost.
  - Motor već ima obe vrednosti po igraču (v i rv).
  - Na proveri: 63 od 264 predloga u Kupi jeftino i 24 od 264 u Prodaj skupo nemaju igrača koji je stvarno „jeftin” ili „skup”.
- **Konsolidacija:** proverava samo broj igrača, ne i da dobijam najboljeg igrača u trejdu (27 od 240).
- **Popravi kategorije bez izabranih kategorija:** isto što i Najbolje za mene, samo bez uslova za karticu.
- **Tekst „Zašto bi prihvatio”:** uvek nađe kategoriju koju protivnik dobija, čak i kad je trejd za njega ukupno lošiji. U slučaju 1 navodi AST, a protivnik ukupno gubi.
- **`TOP_TOL` i `TOP_TOL_OPP`** gledaju samo najvrednijeg igrača po ceni. Zato se pravilo ne odnosi na „dodatke”: Aday Mara se ponavlja u 5 od 8 predloga.
- **Prozor vrednosti (gruba provera)** je samo ubrzanje. Logiku ne menja, ali objašnjava zašto 90% trejdova 1:1 nikad ne stigne do koristi.

### D3. Glavni uzrok loših predloga

Po merenjima, glavni uzrok je **način na koji se računa „tim posle trejda”**, a ne sama fer granica.

**1. Slobodno mesto se računa kao pun igrač sa waivera** (prosek 3. do 5. slobodnog po stvarnoj vrednosti), a u fer granici skoro ništa ne košta.
- **Slučaj 1:**
  - Sa slobodnim mestom: +0,307 OP i kartica 6:3.
  - Bez njega: −0,389 OP, kartica 4:5, a i fer granica pada (29,5%).
- **Deo C:**
  - 282 od 511 predloga sa slobodnim mestom (55%) su loši za tebe kad se mesto ne računa.
  - U Konsolidaciji 165 od 240 (69%).
- Ovo je i razlog zašto se Rui i Nembhard stalno nude.
  - Po stvarnoj vrednosti oba su ispod realne zamene sa waivera (Nembhard je 275., Rui 122.).
  - Motor misli da za njih uvek može da uzme nekog sa waivera, a cena im je na tržištu viša.

**2. Tim je zbir svih igrača sa rostera po utakmici, bez postave i bez broja utakmica.**
- Zato:
  - svaki dodatni igrač donosi statistiku;
  - otpuštanje igrača sa negativnom vrednošću (Dillon Brooks, rv −67) donosi korist;
  - veći trejdovi uvek imaju veću korist.
- Dokaz: u slučaju 2, 12 od prvih 13 trejdova po skoru su oblika „dobijam više i otpuštam Brooksa”.
- Dokaz: u delu C 62% predloga ima 5 ili više igrača, a 1:1 je samo 3,4%.

**3. Raznovrsnost važi samo za najvrednijeg igrača sa svake strane.**
- 196 od 202 strane ponavljaju istog igrača preko tvojih granica.
- Primer: Okongwu u 8/8, Mara u 5/8.

**4. Režimi i strategije Prodaj skupo, Kupi jeftino i Konsolidacija ne rade ono što im ime kaže** (D2). Prva strana je ista u sva tri režima.

**Kratko:** motor pravilno traži trejdove koji su fer po ceni i povećavaju zbir tima. Zbir tima je naduvan slobodnim mestima, otpuštanjima i brojem igrača, pa „najbolji” ispadnu veliki i neravnomerni trejdovi. Kartica 6:3 to dodatno ulepšava jer broji i vrlo male promene kao dobijene kategorije.
