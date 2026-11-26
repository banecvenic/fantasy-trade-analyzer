# Tuning v2: izveštaj

Grana `tuning-v2`, od `main` (2fe7f4c). Ništa nije objavljeno.

## Ukratko

| Korak | Commit | Šta |
|---|---|---|
| 1 | bdfeadd | Ne želim, zaključano dugme sa tooltipom, Otvori trejd, veto do 3 po strani, raznovrsnost, Dajem ako mora za celu ligu, vrednost igrača bez utakmica, kontekst u izvozu ocena |
| 1b | d3adcfe | Srednje rešenje za raznovrsnost (tvoja odluka) |
| 2 | a0dcfd9 | Vrednost igrača: kratki periodi po minutima, projekcija u stvarnoj vrednosti kao u tržišnoj |
| 3 | 8c1ce26 | Svi timovi u ligi, filter tipa trejda; usput: predlozi posle osvežavanja |
| 4 | 40f16ac | Mete za trejd, Biram kategorije: redosled, prag 0,15 SD, tekst |
| 5 | a15edf7 | Provera iz ugla 12 timova i u 2 druga formata, uzorak od 30 predloga; Popravi kategorije samo u ligama sa kategorijama |
| 6 | af091ab | Odgovori: TO po ligi, Fer bliže nuli, Zašto bi prihvatio bez kategorija iz prva 3, otpuštanje u trejdu (Dubina u dubokim ligama) |
| 7 | 15e2d46 | Slobodno mesto u ligama na poene: realni slobodan igrač × udeo starta, u koristi i u fer granici (tvoja odluka) |
| 8 | (ovaj) | Popravi kategorije: izgubljenih najviše dobijenih + 1, korist bar 0,05; novi uzorak od 30 |

**Pravila 1 do 7 posle svakog koraka:**

| Merenje | Polazna | Korak 1 | Srednje rešenje | Korak 2 | Korak 3 | Korak 5 |
|---|---|---|---|---|---|---|
| Tvoje lige (3 lige, 234 pretrage) | 1.221 (pravila 4 i 5) | 0 | 0 | 0 | 0 | |
| Iz ugla svih 12 timova (2.376 pretraga) | | | | | | 0 |
| Sleeper poeni + Fantrax Roto (363 pretrage) | | | | | | 0 (254 pre ispravke) |
| Posle odgovora i slobodnog mesta u poen ligama | | | | | | 0 |

Korak 4 menja samo Mete za trejd, pa Pronađi trejd posle njega nije ponovo meren. Korak 5 je meren posle koraka 4.

**Glavni brojevi:**
- Vrednost igrača (prvih 50 / 150 po stvarnoj vrednosti, Spearman sa tržištem): 0,70 → 0,80 / 0,83 → 0,90. Sa ESPN vlasništvom: 0,38 → 0,62 / 0,60 → 0,75.
- 20 najvećih odstupanja: prosečna razlika 81 → 56 mesta (stvarna bolja) i 105 → 72 (stvarna lošija). Igrača sa razlikom 50+ mesta: 42 → 21.
- Tvoje ocene (dodatno, nije meta): 👍 trejd ima veću korist od 👎 u 53% parova pre, 61% posle koraka 2.
- Srednje rešenje: prva strana prosečno 5,9 predloga, sve strane 5,2, pune prve strane 59 od 201 (posle koraka 2).
- Svi timovi: 0,3 do 2,9 s računanja za 11 timova, zavisno od strategije (u skrivenom panelu u Workeru 11,6 do 12,5 s).

## Odstupanja od plana

1. **Polazna tačka** nije kraj tuning-v1: dopuna strane do 8 (2fe7f4c) je popuštala raznovrsnost, pa su pravila 4 i 5 na startu bila 125 i 1.096.
2. **Raznovrsnost:** strogo pravilo (2 od 8) je davalo kratke strane, pa sam pitao. Ti si izabrao srednje rešenje, i tako je urađeno.
3. **Korak 2, bez faktora uloge i bez izmene procenata i TO:** dijagnoza je pokazala da ostatak razlike dolazi od toga što tržište namerno uključuje minute i ne broji TO kao punu kategoriju. Izmereno je i upisano. Manja težina TO bi popravila slaganje sa tržištem, ali je to odluka o pravilu lige, pa je ostavljena tebi.
4. **Korak 3, tip trejda ne pokreće novu pretragu:** sakriva predloge iz poslednje pretrage i ponovo slaže strane. Zato brojač u modalu odmah zna koliko ostaje. Malih trejdova (1 za 1, 2 za 1) zaista ima malo i u punim listama.
5. **Korak 3, usput:** ispravljena stara greška. Predlozi posle osvežavanja stranice su pokazivali „Promenio si izbor”.
6. **Korak 4, bez lige:** prag 0,15 važi za razliku z vrednosti igrača, jer nema timova za SD.
7. **Korak 5:** provera iz ugla drugih timova radi na privremenim kopijama lige (posle obrisane). Druga dva formata su uvezena iz javnih test liga i posle obrisana. Ispravljena je greška koju je provera našla (Popravi kategorije u poen ligi). Prazne strategije u Sleeper i Fantrax ligama su zapisane kao nalaz, bez izmene.
8. **Trajanje Svi timovi** je izmereno u test browseru čiji je panel bio skriven. Broj za vidljivu stranicu je procena iz računanja na glavnoj niti.

## Kako je mereno

- Isti skript i ista pravila kao u tuning-v1: [tools/tf_audit.js](../tools/tf_audit.js), `tfAudit.snapshot(tag)`, pravila 1 do 7 (pravilo 4 po definiciji iz koraka 5).
- 3 lige: NBA tviter (ESPN 2069440345, ponovo uvezena 26. 11. jer je posle tuning-v1 obrisana iz test browsera), Moja liga, Test paste.
- 13 protivnika × 6 strategija × 3 režima = 234 pretrage, provera prve strane.

| | Polazna (main) | Korak 1 |
|---|---|---|
| Predloga na prvim stranama | 1.564 | 1.095 |
| Prazne strane (od 234) | 30 | 32 |
| Pravilo 1, 2, 3, 6, 7 | 0 | 0 |
| **Pravilo 4**: 4 igrača | 125 | **0** |
| **Pravilo 5**: ponavljanje igrača | 1.096 | **0** |
| Mali trejdovi (1:1, 2:1, 1:2, 2:2) | 40% | 55% |
| Trejdovi sa 4 igrača na nekoj strani | 189 | 54 |
| Mete za trejd: meta sa trejdom (od 8) | 6 | 5 |

Polazna tačka nije ista kao kraj tuning-v1: dopuna strane do 8 (commit 2fe7f4c, posle završnog merenja tuning-v1) popuštala je raznovrsnost i ograničenje za 4 igrača, pa su pravila 4 i 5 ponovo rasla.


## Srednje rešenje za raznovrsnost (tvoja odluka posle koraka 1)

- Njegov igrač najviše 2 puta na strani od 8. Ako bi strana tako imala manje od 6 predloga, granica se za tu stranu podiže na 3, nikad više (`TF.DIV_THEIRS_HI = 3`, `TF.DIV_MIN_FILL = 6`). Moj igrač ostaje najviše 3. U trejd i retki igrači koji prolaze filtere su izuzeti kao i do sada; zaključani igrači ionako ne ulaze u trejd.
- Ako ni sa granicom 3 nema 6 predloga, a ima još predloga za sledeće strane, prikazuje se koliko ima, uz napomenu (vraćena napomena iz koraka 5 tuning-v1, dopunjena pravilom).
- Pravilo 5 u proveri je usklađeno: granica 3 za njegovog igrača je dozvoljena samo kad strana sa granicom 2 (računata na pravom redosledu po rangu) ne bi imala 6 predloga.

| 3 lige, 234 pretrage | Strogo (2 od 8) | Srednje rešenje | Srednje, posle koraka 2 |
|---|---|---|---|
| Prve strane sa bar 1 predlogom | 202 | 202 | 201 |
| Pune prve strane (8) | 16 od 64 (samo NBA tviter, Fer) | **52** | **59** |
| Prva strana, prosečno predloga | oko 4,2 (samo NBA tviter, Fer) | **6,0** | **5,9** |
| Sve strane, prosečno predloga | | **5,5** | **5,2** |
| Prve strane sa bar 6 predloga | | 160 | 146 |
| Granica podignuta na 3 | | 87 pretraga | 88 pretraga |
| Pravila 1 do 7 | 0 | 0 | 0 |
| Predloga na prvim stranama | 1.095 | 1.210 | 1.182 |

Raspodela prve strane: 1: 17, 2: 4, 3: 11, 4: 6, 5: 4, 6: 64, 7: 44, 8: 52. Strane sa 1 do 3 predloga su pretrage koje ukupno imaju malo predloga (najviše Konsolidacija).

Strogo pravilo je mereno samo na NBA tviter ligi (13 protivnika × 6 strategija, Fer), pre odluke o srednjem rešenju.

## Korak 1: sitne greške i tekstovi

**1.1 Ne želim.** Protivnički igrač ima dugme „Ne želim” (EN „Exclude”) sa ikonom ⊘ i tooltipom „Ovaj igrač neće biti u predlozima”. U podacima je to ista oznaka kao ranije, pa postojeće oznake ostaju. Moji igrači i dalje imaju „Zaključaj” sa katancem. Mete za trejd nemaju isključivanje protivničkih igrača (samo „Ne dam” za moje i listu želja), pa tamo nema šta da se menja. Savet kad nema predloga sada razlikuje „zaključaj manje igrača” i „isključi manje igrača (Ne želim)”.

**1.2 Zaključano dugme.** Kad nema novih predloga, „Generiši novih 8” je neaktivno, a „To su svi predlozi za ovaj izbor.” je tooltip (hover na računaru, dodir na telefonu). Neaktivno dugme ne prima događaje, pa je tooltip na omotaču oko dugmeta.

**1.3 Otvori trejd.** Na srpskom kartica u Pronađi trejd i mogući trejd u Metama imaju „Otvori trejd”. Engleski ostaje „Open in Trade analyzer”.

**1.4 Veto.** Savet za veto se prikazuje samo kad posle dopune nijedna strana nema više od 3 igrača (`TF.VETO_SIDE_MAX = 3`): 3:4 i 4:3 više nemaju savet.

**1.5 Kupi jeftino: Mara i Durant.**
- Ponavljanje: uzrok je dopuna strane do 8 iz 2fe7f4c, koja je popuštala raznovrsnost. Sada raznovrsnost (moj igrač najviše 3, njegov najviše 2 na strani) i najviše 1 trejd sa 4 igrača nikad ne popuštaju. Popušta samo ograničenje za trejdove gde dobijam ili dajem više igrača. Pravila 4 i 5 su 0 u svim strategijama, režimima, sa filterima i oznakama (izuzeci ostaju kao ranije: U trejd i retki igrači koji prolaze filtere).
- IR: Mara nije prošao uslov za IR. Za njega `tfIrOk` vraća „ne” (OUT oko 3 dana, a IR traži bar 2 nedelje), pa ne ulazi na IR ni u motoru ni na kartici. U Kupi jeftino je ušao drugim putem iz opisa strategije: razlika u rangu između cene na tržištu (19) i stvarne vrednosti (85) je veća od 15 mesta. Obe vrednosti uračunavaju povredu istim faktorom, pa razliku ne pravi povreda nego razilaženje stvarne i tržišne vrednosti (korak 2). Durant nije jeftin po ovom pravilu, ulazio je uz Maru.
- **Cena strogog pravila (odluka za tebe):** stroga raznovrsnost i „uvek 8 na strani” ne mogu oba da važe. Trejd 3:3 troši 3 njegova igrača, pa strana od 8 traži oko 24 mesta. Uz najviše 2 po igraču treba oko 12 različitih njegovih igrača, a protivnik obično ima 12 do 13. U NBA tviter ligi (13 protivnika × 6 strategija, Fer) je puno samo 16 od 64 prvih strana, a prosečna strana ima oko 4 predloga. Predlozi koji bi prekršili pravilo idu na sledeću stranu, pa „Generiši novih 8” i dalje radi dok ima predloga.

**1.6 Dajem ako mora.** Oznaka je radila kako je dogovoreno, ali samo za protivnika kod koga je postavljena: čuvala se po protivniku, kao U trejd. U tvojim ocenama posle 13:40 UTC Brunson je u 23 predloga protiv 7 različitih protivnika, a Booker u 14 protiv 5. Protiv Fruškogorskih Bizona Brunson je bio prvi u 5 predloga, što je moguće samo kad za tog protivnika oznaka ne postoji. Provera sa oznakom na oba igrača (Blok 23, Fruškogorski Bizoni, Otac Makarije; Najbolje za mene i Konsolidacija): ti predlozi idu posle svih ostalih, i na prvu stranu ulaze samo kad ostalih nema 8 (Blok 23 / Konsolidacija: 7 ostalih, pa je osmi „Dajem ako mora”). Isto važi za sledeće strane („Generiši novih 8”), jer se redosled pravi jednom za celu listu.
- Ispravka: „Dajem ako mora” sada važi za celu ligu, kao Zaključaj, jer je to odluka o mom igraču, a ne o protivniku. Postojeće oznake kod bilo kog protivnika prelaze na celu ligu (Zaključaj ima prednost). U trejd i oznake protivničkih igrača ostaju po protivniku. Važi i za Mete za trejd, jer koriste iste oznake. „Poništi sve” pita da li da ukloni i oznake za celu ligu.
- Tooltip oznake sada opisuje dogovoreno ponašanje: „Igrač ulazi u predloge samo kad bez njega nema 8 predloga, i ti predlozi su na kraju liste.”

**1.7 Igrači bez utakmica ove sezone.**
- Uzrok: vrednost je bila tačno 0 zbog dostupnosti, a ne zbog statistike. Kevin Porter Jr. ima ESPN projekciju (14,1 poena, 26,8 minuta), ali je odigrao 0 od 17 utakmica svog tima, pa je dostupnost bila 0, a vrednost 0 × sve ostalo.
- Ispravka u zajedničkoj osnovi: za igrača bez utakmica ove sezone dostupnost je `VALUE.NO_GAMES_DISC = 0,7` (popust za neizvesnu ulogu), umesto 0. Linija statistike je ESPN projekcija, a ako nje nema, prosek prošle sezone (sada se čuva za takve igrače, keš igrača je v9). Kad igrač odigra prvu utakmicu, sezona preuzima kao i do sada.
- Igrač čija vrednost ne može da se proceni ni iz čega (nema sezone, projekcije ni prošle sezone) u pretrazi se tretira kao Zaključan, pa nikad nije dopuna u trejdu, osim kad ga korisnik označi U trejd.
- Oznaka „Bez utakmica ove sezone” / „No games this season” stoji uz status igrača u svim tabelama i na kartici predloga. Tooltip kaže odakle je vrednost.
- Tvoja liga: 2 takva igrača. Kevin Porter Jr. (Fruškogorski Bizoni): cena na tržištu 0 → 30,6, stvarna vrednost 0 → 106,8. Jusuf Nurkić (Otac Makarije, OUT, na IR-u): 0 → −5,2 i 0 → −28,1 (povreda smanjuje udeo preostalih utakmica). Igrača bez ikakve procene u ligi nema. U celoj bazi 454 igrača sa NBA timom nema utakmica, a 23 od njih imaju prošlu sezonu, ali ne i projekciju.
- Napomena: Porter sada ima stvarnu vrednost znatno iznad cene, pa se često javlja u predlozima protiv Fruškogorskih Bizona (raznovrsnost ga drži na najviše 2 po strani). To je isti obrazac kao u koraku 2.

**1.8 Izvoz ocena.** Svaka nova ocena ima `ctx`: `app` (oznaka verzije app.js iz `app.js?v=…`, ista kao u build_pages.py; lokalno „dev”), `filters` (aktivni filteri i period, ili null), `marks` (lock, soft, trade za moje igrače; excl, want za njegove; imena i ID), `page` (stvarni broj strane) i `searchNo` (redni broj pretrage u ovom browseru). Važi za Pronađi trejd, Mete za trejd (bez rednog broja pretrage) i Pojačanja sa FA (oznake = zaključani igrači u FA). `result` u Pronađi trejd dobija i `soft`. Tekst u profilu sada pominje i Mete za trejd.

## Korak 2: vrednost igrača

### 2a. Dijagnoza (NBA tviter, pre izmene)

Stvarna vrednost = zbir z-vrednosti po kategorijama po utakmici, mešavina perioda (projekcija, sezona, poslednjih 15, poslednjih 7 dana), minus nivo zamene, puta preostale utakmice i dostupnost. Tržišna vrednost je posebna mešavina (ESPN projekcija, produkcija, minuti, vlasništvo, rang).

| Igrač | rang stvarna / tržište pre | udeo poslednjih 15 + 7 dana |
|---|---|---|
| Christian Braun | 8 / 39 | 64% |
| Ausar Thompson | 9 / 30 | 64% |
| Matisse Thybulle | 30 / 103 | 58% |
| Day'Ron Sharpe | 31 / 82 | 63% |
| Aday Mara | 83 / 108 | 53% |
| Devin Booker | 39 / 21 | 63% |
| Jalen Brunson | 51 / 25 | 62% |
| Andrew Nembhard | 260 / 116 | 61% |

- Braun: sezona z 1,68 (16 utakmica), poslednjih 15 dana 3,52 (7), poslednjih 7 dana 5,07 (3 utakmice). Tri utakmice nosile su oko pola vrednosti.
- Booker (sezona 1,95) i Brunson (−0,02) su dosledni u 9 kategorija: niži su od tržišta zbog procenata i TO, ne zbog greške.
- 20 najvećih odstupanja u oba smera (prvih 150 po bilo kojoj vrednosti): precenjeni u proseku 21 minut, 6,7 šuteva, „vrući” (+0,97 z u kratkim periodima iznad sezone). Potcenjeni: 31 minut, 12,8 šuteva, „hladni” (−0,65).
- Korelacija razlike u rangu sa: minutima 0,53, TO −0,46, FG% −0,38, vrućinom −0,30.

**Uzroci, po veličini:**
1. Kratki periodi (7 i 15 dana) imali su istu težinu bez obzira na broj odigranih minuta: 3 utakmice od 20 minuta vredele su kao 3 od 36.
2. Projekcija je u stvarnoj vrednosti padala na 0 posle 15 utakmica, a u tržišnoj ostaje 25% do kraja. Stvarna vrednost je zato skoro sasvim zavisila od tekuće forme.
3. Procenti i TO: deo odstupanja je stvarna razlika u 9 kategorija (Gobert FT z −4,85, Booker, Brunson). To nije greška nego pravilo lige.

### 2b. Izmena (samo prva dva uzroka)

- Kratki periodi dobijaju težinu srazmerno odigranim minutima: težina × m / (m + 300), gde je m = utakmice × minuti u periodu (`FA.SHORT_MIN_K = 300`). Primer: 3 utakmice po 20 minuta = 60 minuta, težina ×0,17; 7 utakmica po 34 = 238, ×0,44.
- Projekcija u stvarnoj vrednosti bledi do 25 utakmica i ostaje 25% (`REAL_PROJ_FADE_GP = 25`, `REAL_PROJ_FLOOR = 0,25`), isto kao u tržišnoj.
- Obe vrednosti, FA i Mete koriste istu funkciju (`periodGp`), pa prag za otpuštanje, slobodno mesto i FA ostaju na istoj skali.
- Bez faktora uloge: posle izmene korelacija sa minutima pada na 0,43, a ostatak dolazi od toga što tržište namerno uključuje minute (15%). Faktor uloge bi stvarnu vrednost samo približio tržištu, bez dokaza da je pogrešna.
- Bez ograničenja procenata i bez manje težine TO. Izmereno (simulacija na istim podacima):

| Varijanta | prvih 50: tržište / vlasništvo | prvih 150: tržište / vlasništvo |
|---|---|---|
| Usvojeno | 0,80 / 0,63 | 0,90 / 0,75 |
| Procenti ograničeni na ±3 z | 0,80 / 0,63 | 0,90 / 0,75 |
| Procenti ograničeni na ±2 z | 0,81 / 0,62 | 0,90 / 0,75 |
| TO težina 0,5 | 0,89 / 0,68 | 0,92 / 0,77 |
| TO težina 0,25 | 0,91 / 0,70 | 0,94 / 0,79 |

  Ograničenje procenata menja samo Goberta (rang 308 → 252 sa ±3) i ne popravlja slaganje. Manja težina TO popravlja slaganje, ali samo zato što tržište (ESPN) ne broji TO kao punu kategoriju: TO je jedna od 9 kategorija u ligi i vredi isto koliko i ostale. To bi bilo podešavanje prema tržištu, a ne ispravka. **Odluka je tvoja**, ako želiš da TO ima manju težinu.

### 2c. Merenje

Spearman korelacija ranga po stvarnoj vrednosti sa tržištem i sa ESPN vlasništvom (NBA tviter, svi igrači na NBA timovima sa procenom):

| | Pre | Posle |
|---|---|---|
| Prvih 50: tržište | 0,697 | **0,800** |
| Prvih 50: vlasništvo | 0,377 | **0,624** |
| Prvih 150: tržište | 0,832 | **0,896** |
| Prvih 150: vlasništvo | 0,600 | **0,750** |
| Samo kratki periodi (K = 300), bez projekcije | 0,704 / 0,506 | 0,846 / 0,691 |

| Igrač | stvarna / tržište pre | posle |
|---|---|---|
| Christian Braun | 8 / 39 | 32 / 57 |
| Ausar Thompson | 9 / 30 | 21 / 39 |
| Matisse Thybulle | 30 / 103 | 51 / 135 |
| Day'Ron Sharpe | 31 / 82 | 60 / 107 |
| Aday Mara | 83 / 108 | 123 / 150 |
| Devin Booker | 39 / 21 | 26 / 17 |
| Jalen Brunson | 51 / 25 | 44 / 20 |
| Andrew Nembhard | 260 / 116 | 197 / 114 |

Rang tržišta se takođe malo menja, jer i tržište koristi istu težinu kratkih perioda.

**20 najvećih odstupanja** (10 u svakom smeru, rang stvarna / tržište):
- Pre, stvarna mnogo bolja: Bennett Stirtz 133/260, Charles Bassey 125/249, Christian Anderson 132/250, Jalen Slawson 102/209, Robert Williams III 142/240, Caleb Martin 55/150, Kenrich Williams 73/159, Jaylen Wells 121/201, Buddy Hield 81/156, Matisse Thybulle 30/103.
- Pre, stvarna mnogo lošija: Rudy Gobert 384/148, Darius Acuff Jr. 280/73, Naz Reid 231/65, Anthony Black 258/111, Andrew Nembhard 260/116, Payton Pritchard 249/132, Ajay Mitchell 225/112, De'Aaron Fox 213/104, RJ Barrett 210/105, Mikal Bridges 220/122.
- Posle, stvarna mnogo bolja: Kenrich Williams 150/268, Kris Dunn 138/235, Matisse Thybulle 51/135, Robert Williams III 113/192, Meleek Thomas 139/206, Jordan Goodwin 122/185, De'Anthony Melton 129/187, Cam Spencer 42/97, Alex Caruso 102/155, Mo Bamba 118/166.
- Posle, stvarna mnogo lošija: Rudy Gobert 336/149, Darius Acuff Jr. 222/70, RJ Barrett 216/98, Jonathan Kuminga 231/123, Jalen Green 226/118, Andrew Nembhard 197/114, AJ Dybantsa 152/80, Aaron Gordon 212/143, Naz Reid 134/66, Anthony Black 164/106.
- Prosečna razlika 20 najvećih: precenjeni 81 → 56 mesta, potcenjeni 105 → 72. Igrača sa razlikom od 50 i više mesta: 42 → 21.
- Šta je zajedničko posle: precenjeni su igrači uloge sa malo TO (prosek TO z +0,85) i dobrim STL/BLK, uglavnom oko granice zamene (rang 100 do 150), gde razlika u rangu malo znači u vrednosti. Potcenjeni imaju mnogo šuteva i TO (TO −0,50, FG −0,76). Korelacija sa vrućinom je nestala (−0,30 → 0,08).

**Pravila i alati posle izmene** (3 lige, 234 pretrage):

| | Srednje rešenje (pre koraka 2) | Korak 2 |
|---|---|---|
| Pravila 1 do 7 | 0 | **0** |
| Predloga na prvim stranama | 1.210 | 1.182 |
| Pune prve strane | 52 / 202 | 59 / 201 |
| Prva strana, prosečno / sve strane | 5,99 / 5,46 | 5,88 / 5,24 |
| Mali trejdovi | 52% | 55% |
| Pojačanja sa FA (Red Galaxy) | 8 predloga | 8 predloga, sve korist > 0 |
| Mete za trejd | 8 meta, 5 sa trejdom | 8 meta, 5 sa trejdom |
| Slobodno mesto (tržište / stvarna) | 9,5 / 79,1 | 4,7 / 30,2 |

Slobodno mesto je niže jer najbolji slobodni igrači više ne dobijaju vrednost od nekoliko vrućih utakmica. Prag za otpuštanje je na istoj skali kao vrednost igrača, jer obe idu kroz istu funkciju.

**Dodatna provera (ne podešava se prema njoj):** tvojih 98 ocena (36 👍, 62 👎), korist ponovo izračunata za iste trejdove na istim sastavima. Koliko često 👍 trejd ima veću korist od 👎 trejda: pre izmene 53%, posle **61%** (prosečna korist 👍 0,30 → 0,20, 👎 0,27 → 0,09). Korist zabeležena u trenutku ocene (stariji model): 57%.

## Korak 3: nove opcije u Pronađi trejd

### 3.1 Svi timovi u ligi

- U izboru protivnika je nova opcija „Svi timovi u ligi” (EN „All teams in the league”), kad liga ima bar 2 protivnika.
- Pretraga ide protiv svakog protivnika sa unetim rosterom, redom u istom Workeru (traka napretka ide preko svih). Rezultati se spajaju u jednu listu po rangu (`tfEngine().mergeOpps`), uz ista pravila strane i još jedno: **najviše 2 predloga istog protivnika na strani od 8** (`TF.ALL_OPP_PER_PAGE = 2`, ne popušta). Raznovrsnost mog igrača (najviše 3 na strani) važi za celu ligu.
- Kartica ima red „Trejd sa timom X”. Otvori trejd, Sačuvaj i ocena idu sa pravim protivnikom.
- Oznake: Zaključaj i Dajem ako mora su ionako za celu ligu. Moje „U trejd” postavljeno u izboru Svi timovi važi za sve protivnike. Oznake igrača drugih timova (Ne želim, U trejd) se postavljaju kad se izabere taj tim i važe i u Svi timovi. Panel protivnika u ovom izboru pokazuje spisak timova i to objašnjenje.
- Provera 7 pravila za jednog protivnika posle koraka 3 (3 lige, 234 pretrage): sve 0, isti brojevi kao posle koraka 2 (1.182 predloga). Provera Svi timovi (NBA tviter, 11 protivnika, 6 strategija × 3 režima): pravila na svim stranama 0 (protivnik najviše 2, moj igrač najviše 3, njegov najviše 3, najviše 1 trejd sa 4 igrača). Prva strana ima 8 predloga u 16 od 18 pretraga, 7 u dve pretrage Konsolidacija. Na prvoj strani je 4 do 6 različitih timova.
- **Trajanje:** računanje svih 11 pretraga na glavnoj niti je 0,3 do 0,4 s (Konsolidacija), 0,6 do 0,7 s (Dubina) i 1,4 do 2,9 s (ostale strategije). U Workeru u skrivenom panelu test browsera izmereno je 11,6 do 12,5 s, jer browser usporava pozadinske kartice. Na vidljivoj stranici očekujem blizu prve brojke. Stranica prikazuje koliko je pretraga trajala.
- Konsolidacija ima malo predloga, pa su posle prve strane strane kraće (pravilo 2 po timu ne popušta).

### 3.2 Tip trejda

- U modalu Filteri (samo Pronađi trejd) je nov red „Tip trejda”: 1 za 1, 2 za 1, 1 za 2, 2 za 2, 3+ (daješ za dobijaš; 3+ = 3 ili više igrača na nekoj strani). Može više tipova odjednom.
- Ne pokreće novu pretragu: predlozi drugih tipova se sakrivaju, a ostali se ponovo slažu u strane od 8 po istom redu i istim pravilima (`tfEngine().regroup`, rang se čuva kao `x.ri`). Brojač u modalu odmah pokazuje „Ostaje N od M predloga”. Važi i za Svi timovi.
- Kad nijedan predlog nije izabranog tipa, poruka kaže koliko ima drugih tipova i nudi da se filter skloni.
- Tip trejda se broji u znački Filteri i čuva se po ligi kao ostali filteri. Ne ulazi u potpis pretrage, pa izmena tipa ne briše predloge.
- Merenje: u Svi timovi (Najbolje za mene, Fer) od 400 predloga je 1 za 1: 5, 1 za 2: 5, 2 za 2: 77, 3+: 313. Probao sam da čuvam 1.200 spojenih predloga, ali 1 za 1 ostaje 5, pa je vraćeno na 400 (manje memorije u sesiji).

### Usput: rezultat posle ponovnog učitavanja

Posle osvežavanja stranice sačuvani predlozi su pokazivali „Promenio si izbor”, i za jednog protivnika (stara greška, ne iz ovog koraka). Uzrok: potpis rezultata uključuje slobodno mesto, a ono se promeni kad stigne lista slobodnih igrača, posle vraćanja iz sesije. Sada se potpis osveži kad je izbor isti. Provereno: posle osvežavanja 8 kartica, a izmena oznake i dalje daje „Promenio si izbor”.

## Korak 4: Mete za trejd, Biram kategorije

- **Redosled:** u Biram kategorije ponder kategorija (najjači u oceni mete) sada računa samo korist u izabranim kategorijama (očekivane pobede u tim kategorijama posle izmene). Ranije su sve kategorije ulazile sa težinom 0,5, pa su ostale kategorije zajedno često bile jače od izabranih. Ostali ponderi (spremnost vlasnika, forma, jeftina meta...) ostaju isti.
- **Prag:** meta ulazi samo ako popravlja bar jednu izabranu kategoriju za bar 0,15 SD timova lige (`TF.CARD_SD`, isti prag kao kartica trejda), računato na postavi pre i posle (meta umesto mog najslabijeg). Bez lige (samo moj tim) prag važi za razliku z vrednosti mete i mog najslabijeg igrača, jer nema timova za SD.
- **Tekst:** „Najviše ti popravlja” navodi samo izabrane kategorije koje meta popravlja bar 0,15 SD, od najveće promene (najviše 3).
- Provera (NBA tviter, 40 meta po izboru, prvih 40 po grubom rangu):

| Izabrane kategorije | kandidata sa koristi u izabranim | posle praga 0,15 SD | najmanja najbolja promena među 40 meta | prve 3 mete |
|---|---|---|---|---|
| BLK + REB | 134 | 117 | 0,41 SD | Myles Turner, Day'Ron Sharpe, Kel'el Ware |
| AST + STL | 114 | 108 | 0,35 SD | Ausar Thompson, Stephon Castle, Kevin Porter Jr. |
| FT% | 127 | 98 | 0,37 SD | Damian Lillard, Austin Reaves, Cam Spencer |
| 3PM + PTS + FT% | 95 | 90 | 0,34 SD | Damian Lillard, Austin Reaves, Stephen Curry |

  Nijedan tekst ne pominje kategoriju koja nije izabrana. Prag izbacuje slabe kandidate (5 do 29), koji ionako nisu među 40 prikazanih, pa je njegova uloga zaštita kad izabranih kategorija ima malo.
- **Proceni sam posle koraka 2:** 152 kandidata, 40 posle grubog ranga. Prvih 8: Kawhi Leonard, Ausar Thompson, Christian Braun, Jalen Smith, Day'Ron Sharpe, Myles Turner, Donovan Clingan, Tyrese Haliburton. Tvoje slabe kategorije po proceni: FT%, REB, STL, TO, FG%. Tekstovi navode te kategorije. U proveri pravila: 8 meta, 5 sa mogućim trejdom (isto kao pre koraka 2).

## Korak 5: šira provera

### Iz ugla svih 12 timova (NBA tviter)

Za svaki tim napravljena je privremena kopija lige u kojoj je taj tim „moj” (ostalih 11 su protivnici, uključujući Red Galaxy), pa je pokrenuta ista provera: 12 timova × 11 protivnika × 6 strategija × 3 režima = **2.376 pretraga**. Kopije su posle obrisane.

| | Vrednost |
|---|---|
| Predloga na prvim stranama | 11.441 |
| **Pravila 1 do 7** | **0** |
| Prazne prve strane | 292 (Konsolidacija 163, Kupi jeftino 66, Dubina 63) |
| Pune prve strane (8) | 267 od 2.084 |
| Prva strana, prosečno / sve strane | 5,5 / 4,7 |
| Granica njegovog igrača podignuta na 3 | 1.174 pretrage |
| Mali trejdovi | 51% |
| Trejdovi sa 4 igrača na nekoj strani | 472 (najviše 1 na strani) |
| Trajanje celog prolaza | 118 s (4 Workera, skriven panel) |

Raspodela prve strane: 1: 138, 2: 29, 3: 246, 4: 117, 5: 213, 6: 680, 7: 394, 8: 267. Iz ugla drugih timova strane su kraće nego iz ugla Red Galaxy (5,9), jer neki timovi imaju manje igrača koji vrede za trejd.

### Druga dva formata (javne lige)

- Sleeper „NBA JAM 2026-2027” (H2H poeni) i Fantrax „Industry Pickup Roto” (Roto, 8 kategorija), po 12 timova, moj tim = prvi tim u ligi. Posle provere obe lige su obrisane iz test browsera.
- Prva provera je našla **254 kršenja pravila 7** u poen ligi, sva u strategiji Popravi kategorije: u poen ligi nema kategorija za izbor, pa je strategija radila kao obična pretraga, a dugme je bilo prikazano. **Ispravka:** u ligi na poene Popravi kategorije se ne prikazuje, a ako je bila izabrana, izbor prelazi na Najbolje za mene. Provera to isto preskače u poen ligama.
- Posle ispravke: 1.325 predloga, **pravila 1 do 7 = 0**, mali trejdovi 55%, pune prve strane 50 od 219.
- **Nalaz za posebnu proveru (nije menjano):** u obe lige Dubina nema nijedan predlog ni protiv jednog protivnika. U Roto ligi nijedan par ne prolazi granicu vrednosti (0 od oko 100.000), u poen ligi prolazi vrednost, ali ne i korist. U poen ligi su prazne i Prodaj skupo (nema igrača sa razlikom ranga 15+) i Konsolidacija. U ESPN ligi iste strategije rade. Moguć uzrok su podaci koje Fantrax i Sleeper ne daju (veličina rostera, IR mesta, otpuštanje), ali to traži posebnu analizu, a nije deo ovog plana.

### Uzorak od 30 predloga

[docs/tuning-v2-uzorak.md](tuning-v2-uzorak.md): nasumično izabrani tim, protivnik, strategija, režim i predlog sa prve strane, iz ugla svih 12 timova. Šta se vidi:
- Svih 30 ima korist iznad nule. Kartice su 5:3, 4:4, 4:3, 3:2, 3:3 (najčešće).
- U 27 od 30 tim koji traži dobija veću tržišnu vrednost nego što daje (pragovi Fer, Malo u moju korist i Agresivno to dozvoljavaju, a dopuna za zvezde i slobodno mesto ulaze u fer granicu). To nije pravilo iz provere, ali je vredno pažnje ako predlozi deluju previše u tvoju korist.
- „Zašto bi prihvatio” ponekad navodi kategoriju u kojoj je protivnik već jak (npr. „Najviše mu raste FG%, gde je 3. u ligi”). Tekst bira kategoriju koja mu najviše raste, ne onu koja mu najviše treba. Nije menjano.

## Odgovori na otvorena pitanja (posle koraka 5)

Pravila 1 do 7 posle svih izmena: **0** u 13.125 predloga (NBA tviter iz ugla svih 12 timova, Moja liga, Test paste, Sleeper poeni i Fantrax Roto).

### 1. TO: puna težina gde je kategorija, nula gde nije

- Stvarna vrednost je već radila tako: računa se samo iz kategorija lige, pa TO ima punu težinu u 9-cat ligama i ne postoji u ligama bez TO. Ništa nije smanjeno.
- Ispravljen je jedan ostatak: produkcija u tržišnoj ceni je uvek brojala TO, i u ligama bez TO. Sada ga broji samo ako ga liga boduje.
- NBA tviter (9-cat, ima TO): Malo u moju korist i Agresivno daju potpuno iste rezultate kao pre (357 od 391 i 393 od 395 predloga u moju korist, ista prosečna razlika). Izmena deluje samo u ligama bez TO.

### 2. Fer: kod približno iste koristi ispred je trejd sa d bližim nuli

- **Pravilo:** u režimu Fer, kad je razlika u oceni dva susedna predloga manja od 0,05 (u poen ligama 0,5 FPts), ispred je onaj čija je razlika u vrednosti `d` bliža nuli (`TF.FAIR_D_TIE`, `dTie` u motoru, isto i za Svi timovi). Malo u moju korist i Agresivno se ne menjaju.
- `d` = (vrednost koju dobijam − vrednost koju dajem) / veća od te dve; d > 0 znači da dobijam više.

NBA tviter, Red Galaxy, sve strategije, prve strane:

| Fer | Pre | Posle |
|---|---|---|
| Prosečan d | +0,027 | +0,021 |
| Prosečan \|d\| | 0,055 | 0,048 |
| Udeo gde dobijam više (d > 0) | 71% | 68% |
| Udeo sa \|d\| < 0,05 | 43% | 52% |
| Udeo gde dobijam veću tržišnu cenu | 63% | 61% |

Raspodela d za Fer (koraci od 0,05): pre −0,10..−0,05: 52, −0,05..0: 63, 0..0,05: 108, 0,05..0,10: 173; posle 46, 80, 125, 146.

Iz ugla svih 12 timova (posle): Fer prosečan d +0,024, d > 0 u 68%, \|d\| < 0,05 u 50%.

**Da li se režimi razlikuju kako treba:**

| Režim | Prosečan d | d > 0 | \|d\| < 0,05 | Granica |
|---|---|---|---|---|
| Fer | +0,024 | 68% | 50% | −0,10 do +0,10 |
| Malo u moju korist | +0,075 | 100% | 26% | 0 do +0,125 |
| Agresivno | +0,140 | 100% | 0% | +0,05 do +0,20 |

Da. Svaki sledeći režim ima veći d, Malo u moju korist i Agresivno su uvek u moju korist, a Agresivno nikad nije blizu nule. Fer je i dalje malo u moju korist (68%), jer pretraga traži najveću korist za mene, a ona raste sa d. Tie-break pomera samo predloge sa skoro istom koristi, pa je pomak umeren (+0,027 → +0,021). Jači pomak bi tražio veći prag ili težinu za d u samoj oceni. To nije rađeno, jer bi Fer počeo da gura predloge sa manjom koristi.

### 3. Zašto bi prihvatio: samo kategorija gde je protivnik slab ili srednji

- **Pravilo:** navodi se kategorija sa najvećim rastom među onima gde protivnik nije među prva 3 u ligi (`TF.WHY_TOP = 3`, `tfWhyCat`). Ako dobija samo tamo gde je već među prva 3, navodi se situacija (povrede, plasman) kad postoji, inače ništa (red se ne prikazuje). Najbolji igrač u trejdu ostaje ispred kategorije, kao i do sada. Bez plasmana iz lige ostaje najveći rast.
- Motor sada čuva sve kategorije u kojima protivnik dobija, poređane po rastu (`ups`), a ne samo jednu.

| Iz ugla svih 12 timova + 4 lige | Broj |
|---|---|
| Predlozi gde se navodi kategorija (sa plasmanom) | 6.009 |
| Stara logika bi navela kategoriju gde je među prva 3 | 642 (11%) |
| Nova logika: kategorija među prva 3 | **0** |
| Nova logika: navodi drugu, slabiju kategoriju | 5.847 |
| Nova logika: ništa (dobija samo gde je jak, bez situacije) | 155 (2,6%) |

**Uzorak od 30** (isto seme 20261126, iz ugla svih 12 timova; 6 od 30 predloga isto kao u prvom uzorku, ostali su se promenili zbog koraka 4 i 5): stara logika bi u 5 navela kategoriju gde je protivnik među prva 3, nova ni u jednom:

| # | Trejd | Staro | Novo |
|---|---|---|---|
| 2 | Red Galaxy → Fruskogorski Bizoni | FG%, 3. u ligi | BLK, 4. u ligi |
| 5 | Red Galaxy → Hakijevi bogalji | AST, 2. | PTS, 4. |
| 6 | Fruskogorski Bizoni → Hakijevi bogalji | AST, 2. | BLK, 10. |
| 17 | Rasini rakuni → Lajkovacka pruga | BLK, 2. | AST, 10. |
| 22 | Lajkovacka pruga → Etoile rouge | BLK, 3. | FG%, 4. |

U dva predloga (19 i 21) protivnik dobija samo u kategorijama gde je 1. ili 2, ali se navodi najbolji igrač u trejdu, pa red ostaje. U uzorku nijedan predlog nije ostao bez razloga.

### 4. Prazne strategije u Sleeper i Fantrax ligama

Obe lige su ponovo uvezene (moj tim = prvi tim), za svaki par igrača izbrojano je na kom pravilu pretraga staje, a lige su posle obrisane.

**Fantrax Roto: Dubina (prazna protiv svih 11) i Konsolidacija (prazna protiv 1)**
- **Pravilo koje ih gasi:** u trejdu je smeo da se otpusti samo igrač slabiji od realne zamene sa waivera. U ovoj ligi (16 mesta, najbolji slobodan igrač vredi 1,6) niko na mom rosteru nije toliko slab. Mogli su da se otpuste samo 3 Trejd kandidata, a oni se po pravilu ne otpuštaju. Zato nijedan trejd u kom dobijam više igrača nije mogao da prođe: 0 od oko 1.000.000 parova.
- **Nije opravdano:** kad dobijem dva igrača za jednog, prirodno je da otpustim najslabijeg sa rostera (npr. Queta, vrednost 7) čak i kad je bolji od waivera. Njegova vrednost se ionako oduzima u fer granici i u koristi.
- **Izmena (`TF.DROP_ANY`):** u trejdu sme da se otpusti najslabiji igrač bez oznake Zaključaj i van IR-a. Ostaje sve ostalo: Trejd kandidat se ne otpušta, igrač koji tek dolazi se ne otpušta (trejd se odbacuje), „Ne otpuštam nikoga” i dalje važi.
- **Posle:** Fantrax Dubina ima predloge protiv svih 11 protivnika (oko 50 na prvim stranama po režimu), Konsolidacija protiv svih 11. Iz ugla 12 timova u NBA tviter prazna Dubina 66 → 10, Konsolidacija 163 → 158. Pravila 1 do 7: 0.

**Sleeper poeni: Prodaj skupo (prazna protiv svih 11)**
- **Opravdano.** Prodaj skupo traži mog igrača čija je cena na tržištu bar 15 mesta iznad stvarne vrednosti. U ligi takvih ima 18, ali nijedan nije na mom rosteru (najveća razlika kod mene je oko 10 mesta). Realnih trejdova te vrste za ovaj tim nema.

**Sleeper poeni: Konsolidacija i Dubina (prazne protiv svih 11), nije menjano**
- **Pravilo koje ih gasi:** slobodno mesto se ne računa (tuning-v1, korak 1). Svi parovi koji prođu granicu vrednosti i prihvatanje padaju na koristi. Najbolja Konsolidacija je −4,4 FPts po utakmici, a najbolja Dubina −7,1.
- **Zašto baš ovde:** u poen ligi sa dnevnom postavom i igrači sa klupe startuju 50 do 93% svojih utakmica. Ko da dva igrača za jednog gubi skoro sve njihove poene, a slobodno mesto mu se ne računa. Kod Dubine se isto dešava protivniku, pa on ne prihvata. U ligama sa kategorijama korist nije linearna, pa tamo obe strategije rade.
- **Za ovu ligu pravilo nije sasvim opravdano:** najbolji slobodan igrač ima 14,7 FPts, koliko i moj 15. igrač (14,0). Ako bi se slobodno mesto računalo kao najbolji slobodan igrač puta njegov udeo starta (oko 0,5), Konsolidacija bi bila oko +3 FPts.
- Nisam ga menjao, jer je to tvoja odluka iz tuning-v1. Predlog: samo u poen ligama računati slobodno mesto po najboljem slobodnom igraču i njegovom udelu starta.

## Slobodno mesto u ligama na poene (tvoja odluka posle odgovora)

**Pravilo (`TF.SLOT_PTS`), samo u ligama na poene:**
- Slobodno mesto je konkretan realni slobodan igrač: 3. najbolji zdrav slobodan igrač po stvarnoj vrednosti, a za drugo mesto sledeći. To je ista granica kao kod postojeće „realne zamene” (3. do 5.): prva dva najbolja se ne računaju, jer ih drugi obično uzmu prvi. Igrač na waiveru ulazi sa umanjenjem 0,8.
- Računa se puta njegov udeo starta, i to isti udeo u obe provere:
  - u koristi: njegovi FPts × udeo starta;
  - u fer granici: njegova cena × udeo starta.
  - Udeo je mesto koje dobija u postavi posle trejda (tabela dnevne postave). Privremeno mesto (dok je povređeni na IR-u) se množi i delom tih utakmica.
- Važi i za protivnika kad on dobija slobodno mesto, u njegovoj koristi (prihvatanje) i u fer granici.
- Kartica piše npr. „Uračunat je igrač sa waivera: **De'Anthony Melton** (realni slobodan igrač, startuje oko 73% utakmica).” Za protivnika: „Njemu je uračunat igrač sa waivera: …”. Korist na kartici uključuje istog igrača sa istim udelom, pa se kartica i redosled slažu.
- Otvori u analizi bira istog igrača sa waivera (Izaberi igrača), umesto „Ne računaj”.
- U ligama sa kategorijama ostaje pravilo iz tuning-v1: slobodno mesto se ne računa. Na istim podacima stari i novi motor daju iste rezultate u NBA tviter (48 od 48 pretraga).

**Sleeper „NBA JAM 2026-2027”, 11 protivnika:**

| Strategija | Prazne pre | Prazne posle | Predloga na prvim stranama posle (Fer / Malo / Agresivno) |
|---|---|---|---|
| Konsolidacija | 11 od 11 | **0 od 11** | 75 / 72 / 73 |
| Dubina | 11 od 11 | **0 od 11** | 59 / 59 / 73 |
| Najbolje za mene | 0 | 0 | 84 / 82 / 86 (pre 77 / 76 / 84) |
| Kupi jeftino | 3 | 3 | 44 / 45 / 47 |
| Prodaj skupo | 11 | 11 | opravdano, vidi gore |

Primeri sa prve strane (Fer):
- **Konsolidacija:** daješ Paul Reed + Matas Buzelis, dobijaš Jarrett Allen (on otpušta Klay Thompson). Uračunat je De'Anthony Melton sa 73% starta. Korist +1,3 FPts, d = −0,02.
- **Dubina:** daješ Anthony Davis, dobijaš Joel Embiid + Fred VanVleet, otpuštaš Tre Jones. Protivniku je uračunat Melton sa 73% starta. Korist +1,6 FPts, d = +0,01.

**Pravila 1 do 7: 0** (1.984 predloga: NBA tviter, Moja liga, Test paste, Sleeper).
- Prvi prolaz je dao 304 kršenja pravila 1, 3 i 7, svi u Sleeper trejdovima sa slobodnim mestom. Uzrok: provera i kartica su tim posle trejda računale bez igrača sa waivera, a motor sa njim. Pravilo 1 („loš bez waiver zamene”) je upravo ono što si za lige na poene ukinuo.
- Ispravljeno: kartica i provera računaju istog igrača sa istim udelom. U ligama na poene pravilo 1 traži korist sa uračunatim igračem.
- Sleeper liga je posle provere obrisana iz test browsera.

## Popravi kategorije: ne gubi previše (ispravka pre objave)

- **Problem iz uzorka:** kartice 1:5 (Boozer → Giddey), 2:6 (Trae Young + Clingan → Brunson + K. George), 3:4 i 2:3 sa koristi 0,04.
- **Pravilo (`TF.CATS_GAIN = 0,05`, `TF.CATS_LOSE_EXTRA = 1`):** u Popravi kategorije broj izgubljenih kategorija na kartici je najviše broj dobijenih + 1, a korist je bar 0,05. Ostaje i staro pravilo: bar jedna izabrana slaba kategorija mora da bude dobijena.
- Provera (pravilo 7 za Popravi kategorije) proverava isto.

Iz ugla svih 12 timova (NBA tviter) + Moja liga + Test paste:

| Popravi kategorije | Pre | Posle |
|---|---|---|
| Predlozi koji krše novo pravilo | 461 od 2.512 (18%) | **0** |
| Predlozi na prvim stranama | 2.512 | 2.439 |
| Prazne prve strane, 12 timova (396 pretraga) | 0 | **0** |
| Prvih strana, Fer / Malo / Agresivno (12 timova) | 840 / 818 / 847 | 807 / 806 / 822 |
| Prazne prve strane, Moja liga + Test paste (6 pretraga) | 1 | 4 |

- Strane se popunjavaju drugim predlozima, pa prvih strana ima samo 3% manje, iako je 18% starih predloga ispalo.
- U dve male test lige (Moja liga, Test paste) Popravi kategorije je i pre imala 1 do 3 predloga. Moja liga sada nema nijedan: sva tri stara su gubila previše.

**Pravila 1 do 7: 0** (11.541 predlog).

**Novi uzorak od 30** sa istim semenom: [docs/tuning-v2-uzorak.md](tuning-v2-uzorak.md).
- U njemu je 6 predloga Popravi kategorije, sa karticama 4:3, 3:3, 5:3, 4:2, 4:4 i 5:3 i koristi od 0,050 do 0,582.
- Nijedan ne gubi više nego što dobija + 1.
- U celom uzorku nijedna kartica ne gubi više od dobijenih.
