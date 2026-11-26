# Tuning v2: izveštaj

Grana `tuning-v2`, od `main` (2fe7f4c). Ništa nije objavljeno.

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

| 202 prve strane (3 lige, 234 pretrage, bez praznih) | Strogo (2 od 8) | Srednje rešenje |
|---|---|---|
| Pune strane (8) | vidi napomenu | **52** |
| Prva strana, prosečno predloga | vidi napomenu | **6,0** |
| Sve strane, prosečno predloga | vidi napomenu | **5,5** |
| Prve strane sa bar 6 predloga | | 160 |
| Granica podignuta na 3 | | 87 pretraga |
| Pravila 1 do 7 | 0 | 0 |
| Predloga na prvim stranama | 1.095 | 1.210 |

Raspodela prve strane: 1: 17, 2: 4, 3: 11, 4: 6, 5: 4, 6: 64, 7: 44, 8: 52. Strane sa 1 do 3 predloga su pretrage koje ukupno imaju malo predloga (najviše Konsolidacija).

Napomena: strogo pravilo sam merio samo na NBA tviter ligi (13 protivnika × 6 strategija, Fer): pune prve strane 16 od 64, prosečna strana oko 4,2 predloga.

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
