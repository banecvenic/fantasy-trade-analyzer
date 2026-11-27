# Popis pred čišćenje

Ovaj dokument je spisak svih pravila motora preporuka i svih elemenata na ekranu, sa preporukom šta da se zadrži, spoji ili obriše. Ništa u kodu sajta nije promenjeno.

**Kako je mereno.** Snimak predloga Pronađi trejd za tri lige (NBA tviter, Fantrax Roto, Sleeper na poene): svaki protivnik × svaka strategija × svaki režim, ukupno 561 pokretanje i 121.444 predloga. Za svaku preporuku "spoji" ili "obriši" koja menja predloge, izmena je privremeno uključena u browseru (bez izmene fajlova), snimak je ponovljen i upoređen sa osnovnim. Prve strane su proverene sa 7 pravila iz tools/tf_audit.js. Osnovni snimak: 121.444 predloga, 3.154 predloga na prvim stranama, 0 kršenja pravila.

Faze: **pre tuning-v1** (do b4f1833), **tuning-v1** (2c7021c do c91f0f4), **tuning-v2** (bdfeadd do 78982c6), **kasnije** (ed138cb, f21feb2).

## A) Pravila i konstante motora

### A1. Konstante (144)

| naziv | šta radi | kad je dodato | zamenilo ili dodato preko | koristi se | preklapa se sa | preporuka | uticaj ako se ukloni ili spoji |
|---|---|---|---|---|---|---|---|
| TREND.RECENT_STAT_ID = `02${CONFIG.SEASON}` | Odakle se čitaju brojke za poslednjih 15 dana. | pre tuning-v1 | nova stvar | da | – | **zadrži** | – |
| TREND.MIN_GP = 4 | Strelica trenda tek kad igrač ima bar 4 utakmice u 15 dana. | pre tuning-v1 | nova stvar | da | MINUTES.MIN_GP (ista vrednost 4) | **spoji sa MINUTES.MIN_GP** | 0 (ista vrednost; ne utiče na predloge) |
| TREND.COUNT_REL = 0.15 | Strelica za zbirne kategorije kad je razlika bar 15%. | pre tuning-v1 | nova stvar | da | – | **zadrži** | – |
| TREND.PCT_ABS = 0.03 | Strelica za FG% i FT% kad je razlika bar 3 poena. | pre tuning-v1 | nova stvar | da | – | **zadrži** | – |
| TREND.MIN_ABS = 0.1 | Strelica samo kad se i prikazane brojke razlikuju. | pre tuning-v1 | nova stvar | da | – | **zadrži** | – |
| MINUTES.TREND_KEYS = ['season', 'l30', 'l15', 'l7'] | Redosled perioda za trend minuta. | pre tuning-v1 | nova stvar | da | – | **zadrži** | – |
| MINUTES.ALERT = 3 | Strelica minuta kad je razlika bar 3 minuta. | pre tuning-v1 | nova stvar | da | TF.ROLE.UP, FA.SIG.MIN_UP, TT.MIN_UP (svi mere skok minuta) | **zadrži** | – |
| MINUTES.STRONG = 5 | Dupla strelica kad je razlika bar 5 minuta. | pre tuning-v1 | nova stvar | da | TF.ROLE.UP (isto 5) | **zadrži** | – |
| MINUTES.MIN_GP = 4 | Trend minuta tek posle 4 utakmice. | pre tuning-v1 | nova stvar | da | TREND.MIN_GP | **spoji sa TREND.MIN_GP** | 0 (ista vrednost) |
| DURABILITY.GOOD = 0.85 | Zelena boja za igrača koji igra bar 85% utakmica. | pre tuning-v1 | nova stvar | da | TT.FRAGILE (0,85) | **zadrži** | – |
| DURABILITY.OK = 0.70 | Žuta boja od 70% utakmica. | pre tuning-v1 | nova stvar | da | TT.FRAGILE (0,6, slično) | **zadrži** | – |
| BENCH.MIN_GP = 5 | Igrač ulazi u rang liste lige sa bar 5 utakmica. | pre tuning-v1 | nova stvar | da | VALUE.SMALL_SAMPLE_GP (isto 5) | **spoji sa VALUE.SMALL_SAMPLE_GP** | 0 (ista vrednost; ne utiče na predloge) |
| BENCH.RANK_TOP = 15 | Vrh lige u kategoriji je prvih 15. | pre tuning-v1 | nova stvar | da | TT.STAR_TOP (isto 15, drugo značenje) | **zadrži** | – |
| BENCH.TEAM_Z = 1.5 | Kategorija tima je jaka ili slaba od ±1,5 z. | pre tuning-v1 | nova stvar | da | – | **zadrži** | – |
| ROSTER.STALE_DAYS = 7 | Upozorenje kad roster nije osvežen 7 dana. | pre tuning-v1 | nova stvar | da | – | **zadrži** | – |
| ALERT.STATUS_HOURS = 72 | Upozorenje za promenu statusa u poslednja 72 sata. | pre tuning-v1 | nova stvar | da | – | **zadrži** | – |
| ALERT.LONG_OUT_DAYS = 7 | Duga povreda: bar 7 dana. | pre tuning-v1 | nova stvar | da | TF.INJ (druga merila za povredu) | **zadrži** | – |
| ALERT.LONG_OUT_GAMES = 4 | Duga povreda: bar 4 utakmice. | pre tuning-v1 | nova stvar | da | – | **zadrži** | – |
| ALERT.NEWS_HOURS = 24 | Vesti mlađe od 24 sata. | pre tuning-v1 | nova stvar | da | – | **zadrži** | – |
| ALERT.OFFER_DAYS = 2 | Podsetnik za ponudu posle 2 dana. | pre tuning-v1 | nova stvar | da | – | **zadrži** | – |
| ALERT.MAX = 4 | Najviše 4 upozorenja na ekranu. | pre tuning-v1 (menjano: pre tuning-v1) | nova stvar | da | – | **zadrži** | – |
| ALERT.HIDDEN_NEWS_MS = 2 * 864e5 | Sakrivena vest se ne vraća 2 dana. | pre tuning-v1 | nova stvar | da | – | **zadrži** | – |
| VALUE.DEFAULT_TEAMS = 12 | Bez lige: računa se kao liga od 12 timova. | pre tuning-v1 | nova stvar | da | – | **zadrži** | – |
| VALUE.DEFAULT_ACTIVE = 13 | Bez lige: 13 aktivnih igrača po timu. | pre tuning-v1 | nova stvar | da | – | **zadrži** | – |
| VALUE.SMALL_SAMPLE_GP = 5 | Oznaka mali uzorak ispod 5 utakmica. | pre tuning-v1 | nova stvar | da | BENCH.MIN_GP | **spoji sa BENCH.MIN_GP** | 0 (ista vrednost) |
| VALUE.NEED_WEIGHT = { bottom: 1.5, middle: 1, top: 0.6 } | Kategorija u kojoj si slab vredi više (1,5), jaka manje (0,6). | pre tuning-v1 | nova stvar | da | FA.MANUAL_OFF, TF.FOCUS_W, TT.SOLO_WEAK_W (sve su težine potreba) | **zadrži** | – |
| FA.BLEND = { proj: 0.5, season: 0.35, l15: 0.3, l7: 0.2 } | Mešavina perioda za vrednost igrača: projekcija, sezona, 15 i 7 dana. | pre tuning-v1 (menjano: pre tuning-v1) | nova stvar | da | – | **zadrži** | – |
| FA.BLEND_FULL_GP = { season: 20, l15: 6, l7: 3 } | Period sa malo utakmica dobija manju težinu. | pre tuning-v1 (menjano: pre tuning-v1) | nova stvar | da | FA.SHORT_MIN_K (isto smanjuje kratke periode, po minutima) | **zadrži** | – |
| FA.MIN_GAIN = 0.05 | FA: predlog se prikazuje tek uz bar 0,05 kategorije koristi. | pre tuning-v1 (menjano: pre tuning-v1) | nova stvar | da | TF.MIN_GAIN, TF.CATS_GAIN, TF.BEST_GAIN (sve su najmanja korist) | **pojednostavi: jedna tabela najmanje koristi** | 0 (vrednosti ostaju iste) |
| FA.MIN_GAIN_PTS = 1.5 | Isto za poene: bar 1,5 FPts. | pre tuning-v1 | nova stvar | da | TF.MIN_GAIN_PTS | **pojednostavi (ista tabela)** | 0 |
| FA.TOP = 9 | 9 kartica u glavnoj listi FA. | pre tuning-v1 (menjano: pre tuning-v1) | nova stvar | da | TT.PER_PAGE (9) | **zadrži** | – |
| FA.WATCH = 5 | 5 igrača u listi Prati. | pre tuning-v1 | nova stvar | da | – | **zadrži** | – |
| FA.RISING = 8 | 8 igrača u listi U usponu. | pre tuning-v1 | nova stvar | da | – | **zadrži** | – |
| FA.STASH = 5 | 5 igrača u sekciji IR stash. | pre tuning-v1 | nova stvar | da | – | **zadrži** | – |
| FA.SIG = { MIN_UP: 5, MIN_GP: 3, OWN_UP: 1, MATE_MIN: 20, BONUS: 0.01 | Znaci da igrač ulazi u rotaciju (minuti, vlasništvo, saigrač OUT) blago dižu rang u FA. | pre tuning-v1 (menjano: pre tuning-v1) | nova stvar | da | TF.ROLE (isti znaci, drugi pragovi: saigrač 20 vs 24 minuta), TT.MIN_UP | **spoji pragove sa TF.ROLE** | Pronađi trejd: 0. FA: menja se samo saigrač 20 → 24 minuta; nije mereno ovim snimkom |
| FA.MANUAL_OFF = 0.5 | Ručno izabrane kategorije: ostale vrede pola. | pre tuning-v1 | nova stvar | da | VALUE.NEED_WEIGHT | **zadrži** | – |
| FA.PUBLIC_MAX_OWN = 60 | Javna lista U usponu: vlasništvo ispod 60%. | pre tuning-v1 | nova stvar | da | FA.DROP_MAX_OWN (50) | **zadrži** | – |
| FA.DROP_MAX_OWN = 50 | Automatski predlog za otpuštanje samo za igrače ispod 50% vlasništva. | pre tuning-v1 | nova stvar | da | – | **zadrži** | – |
| FA.TRADE_CAND = 3 | Najviše 3 igrača sa oznakom Trejd kandidat. | pre tuning-v1 | nova stvar | da | – | **zadrži** | – |
| FA.PAGE = 25 | 25 redova u tabeli svih FA. | pre tuning-v1 | nova stvar | da | – | **zadrži** | – |
| TF.STAR_POW = 1.2 | Zvezde vrede nešto više nego zbir manjih igrača. | pre tuning-v1 | nova stvar | da | – | **zadrži** | – |
| TF.LIMITS = { fair: [-0.10, 0.10], slight: [0, 0.125], aggr: [0.05, 0.20 | Granice razlike u vrednosti za Fer, Malo u moju korist i Agresivno. | pre tuning-v1 (menjano: tuning-v1) | nova stvar | da | TF.TRADE_WIDEN | **zadrži** | – |
| TF.SLIDERS = ['fair', 'slight', 'aggr'] | Redosled tri režima. | pre tuning-v1 | nova stvar | da | – | **zadrži** | – |
| TF.CAT_MAX_DIFF = 1 | Protivnik sme da izgubi najviše 1 kategoriju više nego što dobije. | pre tuning-v1 | nova stvar | da | – | **zadrži** | – |
| TF.PTS_MAX_LOSS = 1.5 | Poeni: protivnik ne sme da izgubi više od 1,5 FPts. | pre tuning-v1 | nova stvar | da | – | **zadrži** | – |
| TF.OPP_PUNT_Z = 1.25 | Prepoznaje kategoriju koju protivnik puntuje. | pre tuning-v1 | nova stvar | da | – | **zadrži** | – |
| TF.SOFT_PENALTY = 0.25 | Kazna u rangu za trejd sa igračem Dajem ako mora. | pre tuning-v1 | nova stvar | da | pravilo strane: Dajem ako mora ide posle svih ostalih predloga | **obriši** | M2: 0 promena |
| TF.SOFT_PENALTY_PTS = 2.5 | Isto, poeni. | pre tuning-v1 | nova stvar | da | isto | **obriši (zajedno)** | M2: 0 promena |
| TF.FORM_GAP = 1.0 | Stari prag forme za Prodaj skupo i Kupi jeftino. | pre tuning-v1 | zamenjeno sa RANK_GAP (tuning-v1) | ne (nigde se ne čita) | TF.RANK_GAP | **obriši** | 0 (ne koristi se) |
| TF.FORM_GAP_PTS = 4 | Isto, poeni. | pre tuning-v1 | zamenjeno sa RANK_GAP | ne | TF.RANK_GAP | **obriši** | 0 |
| TF.FORM_BONUS = 0.15 | Prednost trejdu sa igračem za Prodaj skupo ili Kupi jeftino. | pre tuning-v1 | nova stvar | da, ali u Prodaj skupo nema efekta (svi predlozi ga dobiju) | – | **pojednostavi: samo za Kupi jeftino** | 0 (u Prodaj skupo isti dodatak svima ne menja redosled) |
| TF.FOCUS_W = 2 | Popravi kategorije: izabrane kategorije vrede duplo. | pre tuning-v1 | nova stvar | da | VALUE.NEED_WEIGHT | **zadrži** | – |
| TF.KEEP_DROP = 0.12 | Popravi kategorije: ostale kategorije ne smeju previše da padnu. | pre tuning-v1 | nova stvar | da | TF.CATS_LOSE_EXTRA (isto štiti ostale kategorije, po kartici) | **zadrži** | – |
| TF.MIN_GAIN = 0.01 | Trejd mora bar malo da pomogne tvom timu. | pre tuning-v1 | nova stvar | da | BEST_GAIN, CATS_GAIN, FA.MIN_GAIN | **pojednostavi: jedna tabela najmanje koristi po strategiji** | 0 |
| TF.MIN_GAIN_PTS = 0.2 | Isto, poeni. | pre tuning-v1 | nova stvar | da | isto | **pojednostavi** | 0 |
| TF.MAX_SIDE = 4 | Najviše 4 igrača po strani. | pre tuning-v1 | nova stvar | da | TT.TRADE_MAX_SIDE (2 u Metama) | **zadrži** | – |
| TF.KEEP = 400 | Koliko predloga se čuva za Generiši novih 8. | pre tuning-v1 | nova stvar | da | – | **zadrži** | – |
| TF.PER_PAGE = 8 | 8 predloga na strani. | pre tuning-v1 (menjano: pre tuning-v1) | nova stvar | da | – | **zadrži** | – |
| TF.WINDOW_MARGIN = 0.06 | Brza gruba provera pre tačnog računa (brzina). | pre tuning-v1 | nova stvar | da | – | **zadrži** | – |
| TF.TIE = { count: 0.05, pct: 0.001, ratio: 0.01 } | Prag nerešenog po kategoriji kad nema lige (samo bez drugih timova). | pre tuning-v1 | nova stvar | samo bez lige | TF.CARD_SD, TEAM_PCT_TIE | **spoji sa CARD_SD** | Snimak: 0 (sve tri lige imaju timove). Menja samo pretragu bez lige |
| TF.MARKET = { GEN: 0.45, PROD: 0.25, MIN: 0.15, OWN: 0.10, RANK: 0.05 } | Težine za cenu igrača na tržištu. | pre tuning-v1 (menjano: pre tuning-v1) | nova stvar | da | – | **zadrži** | – |
| TF.MARKET_Z_MIN = -2 | Tržište ne kažnjava slabu efikasnost ispod -2. | pre tuning-v1 | nova stvar | da | – | **zadrži** | – |
| TF.PROD_W = { PTS: 1, TPM: 0.5, REB: 1.25, AST: 1.5, STL: 2, BLK: 2, TO: | Sirova produkcija za cenu na tržištu (kako je vide rang liste). | pre tuning-v1 (menjano: pre tuning-v1) | nova stvar | da | – | **zadrži** | – |
| TF.MAX_DIFF = 1 | Razlika u broju igrača najviše 1. | pre tuning-v1 | nova stvar | da | GET_MORE_MAX, GIVE_MORE_MAX | **zadrži** | – |
| TF.MAX_DIFF_WIDE = 2 | Konsolidacija i Dubina: razlika do 2. | pre tuning-v1 | nova stvar | da | – | **zadrži** | – |
| TF.TOP_TOL = 0.20 | Tvoj najbolji igrač u trejdu sme biti najviše 20% bolji od najboljeg kog dobijaš. | pre tuning-v1 | nova stvar | da | TF.TOP_TOL_OPP | **zadrži** | – |
| TF.TOP_TOL_OPP = 0.30 | Obrnuto za protivnika, 30%. | pre tuning-v1 | nova stvar | da | TF.TOP_TOL | **zadrži** | M5: spajanje na 20% briše 12.920 predloga i menja 335 od 561 prvih strana |
| TF.SIZE_PEN = 0.13 | Kazna u rangu za svakog igrača iznad 2 u trejdu. | pre tuning-v1 (menjano: pre tuning-v1) | nova stvar | da | TF.SIZE_TIE | **zadrži** | – |
| TF.SIZE_PEN_PTS = 1.3 | Isto, poeni. | pre tuning-v1 (menjano: pre tuning-v1) | nova stvar | da | – | **zadrži** | – |
| TF.VETO_MAX = 3 | Savet za veto na najviše 3 od 8 kartica. | pre tuning-v1 | nova stvar | da | – | **zadrži** | – |
| TF.GET_MORE_MAX = 2 | Najviše 2 od 8 predloga gde dobijaš više igrača. | pre tuning-v1 | nova stvar | da | TF.GIVE_MORE_MAX (ista vrednost) | **spoji sa GIVE_MORE_MAX** | 0 (ista vrednost) |
| TF.GET_MORE_STRATS = ['best', 'cats', 'sell', 'buy'] | Strategije u kojima važe ova dva ograničenja. | pre tuning-v1 | nova stvar | da | – | **zadrži** | – |
| TF.SLOT_FROM = 3 | Realna zamena: od 3. najboljeg slobodnog igrača. | pre tuning-v1 | nova stvar | da | – | **zadrži** | – |
| TF.SLOT_TO = 5 | …do 5. najboljeg. | pre tuning-v1 | nova stvar | da | – | **zadrži** | – |
| TF.SLOT_WAIVER = 0.8 | Igrač na waiveru se računa sa 80%. | pre tuning-v1 | nova stvar | da | – | **zadrži** | – |
| TF.SIZE_PEN_WIDE = 0.07 | Isto za Konsolidaciju i Dubinu, blaže. | pre tuning-v1 | nova stvar | da | – | **zadrži** | – |
| TF.SIZE_PEN_WIDE_PTS = 0.7 | Isto, poeni. | pre tuning-v1 | nova stvar | da | – | **zadrži** | – |
| FA.PROJ_FADE_GP = 25 | Projekcija gubi težinu kako igrač igra, do 25 utakmica. | pre tuning-v1 | nova stvar | da | FA.REAL_PROJ_FADE_GP (ista vrednost 25) | **spoji sa REAL_PROJ_FADE_GP** | 0 (ista vrednost) |
| FA.PROJ_FLOOR = 0.25 | Projekcija nikad ispod 25% težine. | pre tuning-v1 | nova stvar | da | FA.REAL_PROJ_FLOOR (ista vrednost) | **spoji sa REAL_PROJ_FLOOR** | 0 (ista vrednost) |
| TF.GIVE_MORE_MAX = 2 | Najviše 2 od 8 gde daješ više igrača. | pre tuning-v1 | nova stvar | da | TF.GET_MORE_MAX | **spoji** | 0 |
| FA.REAL_PROJ_FADE_GP = 25 | Isto, za stvarnu vrednost. | pre tuning-v1 (menjano: tuning-v2) | zamenilo raniji pad do 15 utakmica (tuning-v2) | da | FA.PROJ_FADE_GP | **spoji (jedna konstanta)** | 0 |
| FA.REAL_PROJ_FLOOR = 0.25 | Isto, donja granica za stvarnu vrednost. | pre tuning-v1 (menjano: tuning-v2) | zamenilo pad bez granice (tuning-v2) | da | FA.PROJ_FLOOR | **spoji (jedna konstanta)** | 0 |
| FA.DROP_PRICE_MARGIN = 0 | Rezerva cene za otpuštanje. Sada 0, pa ne dodaje ništa. | pre tuning-v1 | nova stvar | formalno da, ali sa 0 nema efekta | – | **obriši** | 0 (vrednost je 0) |
| TF.INJ = { DEFAULT_WEEKS: 6, // nema procene ni u ESPN-u ni u vestima | Povređeni: procena povratka, IR, plejof i 6 malih prednosti u rangu (B_PRESSURE, B_CONTEND, B_REBUILD, B_MY_IR, B_BUY, B_SELL_MY). | pre tuning-v1 | nova stvar | da | ALERT.LONG_OUT_* | **spoji 5 malih prednosti u jednu (0,05), B_BUY ostaje** | M4: 18 od 561 prvih strana, 32 nova predloga, 0 kršenja, nisu gori |
| TT.REFINE = 40 | Mete: posle grubog ranga 40 kandidata dobija tačan račun. | pre tuning-v1 | nova stvar | da | – | **zadrži** | – |
| TT.PER_PAGE = 9 | 9 meta na računaru. | pre tuning-v1 (menjano: pre tuning-v1) | nova stvar | da | FA.TOP | **zadrži** | – |
| TT.MAX_OWNER = 2 | Najviše 2 mete istog vlasnika na strani. | pre tuning-v1 | nova stvar | da | TF.ALL_OPP_PER_PAGE (isto pravilo, 2) | **zadrži** | – |
| TT.W = { cat: 1, unreach: 0.6, willing: 0.3, form: 0.25, cheap: 0.2 | Težine razloga za metu (korist, nedostižnost, spremnost, forma...). | pre tuning-v1 | nova stvar | da | – | **zadrži** | – |
| TT.NEG = ['unreach', 'fragile'] | Koji razlozi oduzimaju (nedostižnost, krhkost). | pre tuning-v1 | nova stvar | da | – | **zadrži** | – |
| TT.UNREACH_OWNER = [1, 0.6] | Najbolji i drugi igrač vlasnika su teško dostižni. | pre tuning-v1 | nova stvar | da | – | **zadrži** | – |
| TT.STAR_TOP = 15 | Zvezda: među prvih 15 po ceni. | pre tuning-v1 | nova stvar | da | BENCH.RANK_TOP | **zadrži** | – |
| TT.WILL = { surplus: 0.4, need: 0.3, pressure: 0.15, bottom: 0.15 } | Delovi spremnosti vlasnika (višak, potreba, pritisak, dno). | pre tuning-v1 | nova stvar | da | TF.INJ B_* (slični razlozi u Pronađi trejd) | **zadrži** | – |
| TT.TOP_THIRD = 1 / 3 | Jak ili slab u kategoriji: gornja ili donja trećina. | pre tuning-v1 | nova stvar | da | – | **zadrži** | – |
| TT.CAT_FULL = 0.05 | Korist: pun deo od vrha 5% kandidata. | pre tuning-v1 | nova stvar | da | – | **zadrži** | – |
| TT.CHEAP_RANKS = 30 | Jeftina meta: 30 mesta razlike između vrednosti i cene. | pre tuning-v1 | nova stvar | da | TF.RANK_GAP (15) | **zadrži** | – |
| TT.STRONG_Z = 0.6 | Igrač nosi kategoriju od z 0,6. | pre tuning-v1 | nova stvar | da | – | **zadrži** | – |
| TT.FORM_FULL = 3 | Forma: pun deo kod razlike 3 z. | pre tuning-v1 | nova stvar | da | – | **zadrži** | – |
| TT.FORM_FULL_PTS = 5 | Isto, poeni: 5 FPts. | pre tuning-v1 | nova stvar | da | – | **zadrži** | – |
| TT.MIN_UP = 4 | Skok minuta se računa od 4. | pre tuning-v1 | nova stvar | da | TF.ROLE.UP (5), FA.SIG.MIN_UP (5), MINUTES.ALERT (3) | **spoji sa TF.ROLE.UP** | Pronađi trejd: 0. Mete: menja red meta; nije mereno ovim snimkom |
| TT.MIN_FULL = 8 | Pun deo kod skoka od 8 minuta. | pre tuning-v1 | nova stvar | da | – | **zadrži** | – |
| TT.MATE_OUT = 0.5 | Saigrač OUT daje pola dela forme i uloge. | pre tuning-v1 | nova stvar | da | TF.ROLE.MATE_MIN | **zadrži** | – |
| TT.INJ_HIGH = 0.5 | Visoko na tabeli: gornja polovina. | pre tuning-v1 | nova stvar | da | – | **zadrži** | – |
| TT.PLAYOFF_LOW = 0.5 | Utakmice u plejofu vrede manje kad nisi visoko. | pre tuning-v1 | nova stvar | da | – | **zadrži** | – |
| TT.STABLE_CV = [0.12, 0.35] | Stabilnost minuta u poslednjih 10 utakmica. | pre tuning-v1 | nova stvar | da | – | **zadrži** | – |
| TT.STABLE_GAMES = 6 | Stabilnost tek od 6 utakmica. | pre tuning-v1 | nova stvar | da | – | **zadrži** | – |
| TT.FRAGILE = [0.85, 0.6] | Krhkost po udelu odigranih utakmica (85% i 60%). | pre tuning-v1 | nova stvar | da | DURABILITY (85% i 70%) | **zadrži** | – |
| TT.CLOSE_SD = 0.15 | Blizina sledećeg tima u kategoriji (0,15 SD). | pre tuning-v1 | nova stvar | da | – | **zadrži** | – |
| TT.SOLO_WEAK_W = 1.5 | Bez drugih timova: slabe kategorije vrede 1,5. | pre tuning-v1 | nova stvar | da | VALUE.NEED_WEIGHT | **zadrži** | – |
| TT.TRADE_MAX_SIDE = 2 | Mogući trejd za metu: do 2 igrača po strani. | pre tuning-v1 | nova stvar | da | TF.MAX_SIDE | **zadrži** | – |
| TT.PER_PAGE_PHONE = 8 | 8 meta na telefonu. | pre tuning-v1 | nova stvar | da | – | **zadrži** | – |
| VALUE.BENCH = 3 | Postava = aktivni roster minus 3 mesta klupe (kad liga ne kaže). | tuning-v1 | zamenilo ceo roster kao tim (tuning-v1) | da | – | **zadrži** | – |
| VALUE.LINEUP_MIN = 5 | Postava ima bar 5 igrača. | tuning-v1 | dodato (tuning-v1) | da | – | **zadrži** | – |
| VALUE.SHARE_EXTRA = 4 | Tabela udela startova ima 4 ranga više. | tuning-v1 | dodato (tuning-v1) | da | – | **zadrži** | – |
| VALUE.SHARE_TRIALS = 400 | 400 nasumičnih rostera za udeo startova. | tuning-v1 | dodato (tuning-v1) | da | – | **zadrži** | – |
| VALUE.DAY_SHIFT_H = 10 | Kasne utakmice ostaju u istom danu. | tuning-v1 | dodato (tuning-v1) | da | WEEK_TZ (ista briga, drugi način) | **zadrži** | – |
| TF.ROLE = { MIN: 15, UP: 5, UP_GP: 3, MATE_MIN: 24, MATE_WEEKS: 2, W:  | Igrač kog dobijaš mora da igra bar 15 minuta, osim ako mu uloga raste. Podključevi W (0) i STRICT (false) se ne koriste. | tuning-v1 | dodato (tuning-v1) | da; W, STRICT, STRICT_PTS, STRICT_MIN ne | FA.SIG, TT.MIN_UP, TT.MATE_OUT, MINUTES | **obriši W, STRICT, STRICT_PTS, STRICT_MIN** | 0 (grana se nikad ne izvršava) |
| TF.TRADE_WIDEN = 0.05 | Kad obeležiš igrača U trejd, gornja granica je 5 poena šira. | tuning-v1 | dodato preko LIMITS (tuning-v1) | da | TF.LIMITS | **zadrži** | – |
| TF.CARD_SD = 0.15 | Kategorija se broji na kartici tek kad se promeni bar 0,15 SD lige. | tuning-v1 | zamenilo TF.TIE u Pronađi trejd i analizi (tuning-v1) | da | TF.TIE, TEAM_PCT_TIE (stari pragovi nerešenog) | **zadrži** | – |
| TF.BEST_GAIN = 0.10 | Najbolje za mene: korist bar 0,10. | tuning-v1 | dodato preko MIN_GAIN (tuning-v1) | da | TF.MIN_GAIN, TT.TRADE_BEST_GAIN | **pojednostavi (tabela)** | 0 |
| TF.BEST_GAIN_PTS = 1.0 | Isto, poeni: bar 1 FPts. | tuning-v1 | dodato (tuning-v1) | da | – | **pojednostavi (tabela)** | 0 |
| TF.BEST_CARD = 2 | Najbolje za mene: kartica bar +2. | tuning-v1 | dodato (tuning-v1) | da | TT.TRADE_BEST_CARD | **zadrži** | – |
| TF.RANK_GAP = 15 | Prodaj skupo / Kupi jeftino: cena na tržištu i stvarna vrednost se razlikuju bar 15 mesta. | tuning-v1 | zamenilo FORM_GAP (tuning-v1) | da | TT.CHEAP_RANKS (30, isto pitanje u Metama) | **zadrži** | – |
| TF.DIV_MINE = 3 | Isti tvoj igrač najviše u 3 od 8 predloga. | tuning-v1 | dodato (tuning-v1) | da | – | **zadrži** | – |
| TF.DIV_THEIRS = 2 | Isti njegov igrač najviše u 2 od 8. | tuning-v1 | dodato (tuning-v1) | da | TF.DIV_THEIRS_HI | **zadrži** | – |
| TF.FLT_FEW = 3 | Ako filtere prolazi najviše 3 njegova igrača, oni nemaju ograničenje raznovrsnosti. | tuning-v1 | dodato (tuning-v1) | da | – | **zadrži** | – |
| TF.BIG_GAIN = 0.10 | Trejd sa 4 igrača na strani samo kad je bar 0,10 bolji od najboljeg manjeg. | tuning-v1 | dodato (tuning-v1) | da | TF.SIZE_PEN | **zadrži** | – |
| TF.BIG_GAIN_PTS = 1.0 | Isto, poeni. | tuning-v1 | dodato (tuning-v1) | da | – | **zadrži** | – |
| TF.BIG_PER_PAGE = 1 | Najviše 1 trejd sa 4 igrača na strani. | tuning-v1 | dodato (tuning-v1) | da | – | **zadrži** | – |
| TF.SIZE_TIE = 0.07 | Kad su dva trejda skoro jednaka, manji ide ispred. | tuning-v1 | dodato preko SIZE_PEN (tuning-v1) | da | TF.SIZE_PEN | **zadrži** | M1: bez njega 395 novih predloga na prvim stranama, veći trejdovi |
| TT.TRADE_BEST_CARD = 0 | Mogući trejd za metu: kartica bar nerešena (ne +2). | tuning-v1 | dodato preko BEST_CARD (tuning-v1) | da | TF.BEST_CARD | **zadrži** | – |
| TT.TRADE_BEST_GAIN = 0 | Mogući trejd za metu: korist iznad nule. | tuning-v1 | dodato preko BEST_GAIN (tuning-v1) | da | TF.BEST_GAIN, TF.MIN_GAIN | **pojednostavi (tabela najmanje koristi)** | 0 |
| TF.VETO_SIDE_MAX = 3 | Savet za veto ne pravi trejd sa više od 3 igrača po strani. | tuning-v2 | dodato preko VETO_MAX (tuning-v2) | da | TF.MAX_SIDE | **zadrži** | – |
| VALUE.NO_GAMES_DISC = 0.7 | Igrač bez utakmica: vrednost iz projekcije × 0,7. | tuning-v2 | dodato (tuning-v2) | da | – | **zadrži** | – |
| TF.DIV_THEIRS_HI = 3 | Ako bi strana imala manje od 6, njegov igrač sme u 3. | tuning-v2 | dodato preko DIV_THEIRS (tuning-v2) | da | TF.DIV_THEIRS, DIV_MIN_FILL | **zadrži** | M3: bez njega 84 pokretanja više ima prvu stranu kraću od 6 |
| TF.DIV_MIN_FILL = 6 | Granica od 6 predloga za pravilo iznad i napomenu o kraćoj strani. | tuning-v2 | dodato (tuning-v2) | da | TF.DIV_THEIRS_HI | **zadrži** | vidi M3 |
| FA.SHORT_MIN_K = 300 | Kratki periodi vrede srazmerno odigranim minutima; vruć niz od par utakmica ne naduvava vrednost. | tuning-v2 | dodato preko BLEND_FULL_GP (tuning-v2) | da | FA.BLEND_FULL_GP | **zadrži** | – |
| TF.ALL_OPP_PER_PAGE = 2 | Svi timovi: najviše 2 predloga istog protivnika na strani. | tuning-v2 | dodato (tuning-v2) | da | – | **zadrži** | – |
| TF.DROP_ANY = true | Prekidač: otpušta se najslabiji igrač bez Zaključaj i van IR-a. Uvek uključen. | tuning-v2 | zamenilo staro pravilo otpuštanja (tuning-v2) | da, ali je uvek true | tfDropOk (staro pravilo, sad samo u testovima) | **obriši prekidač i staru granu** | 0 |
| TF.WHY_TOP = 3 | Zašto bi prihvatio ne navodi kategoriju gde je protivnik već među prva 3. | tuning-v2 | dodato (tuning-v2) | da | – | **zadrži** | – |
| TF.FAIR_D_TIE = 0.05 | Fer: kod skoro jednakih trejdova ispred je onaj bliži nuli. | tuning-v2 | dodato (tuning-v2) | da | TF.SIZE_TIE (drugi kriterijum za iste slučajeve) | **zadrži** | – |
| TF.FAIR_D_TIE_PTS = 0.5 | Isto, poeni. | tuning-v2 | dodato (tuning-v2) | da | – | **zadrži** | – |
| TF.SLOT_PTS = true | Prekidač: u ligama na poene slobodno mesto se računa. Uvek uključen. | tuning-v2 | dodato (tuning-v2) | da, ali je uvek true | – | **obriši prekidač (ponašanje ostaje)** | 0 (kod ostaje isti) |
| TF.CATS_GAIN = 0.05 | Popravi kategorije: korist bar 0,05. | tuning-v2 | dodato preko MIN_GAIN (tuning-v2) | da | TF.MIN_GAIN, FA.MIN_GAIN | **pojednostavi (tabela najmanje koristi)** | 0 |
| TF.CATS_LOSE_EXTRA = 1 | Popravi kategorije: izgubljenih najviše dobijenih + 1. | tuning-v2 | dodato (tuning-v2) | da | TF.KEEP_DROP | **zadrži** | – |

Obrisano ranije (nema ih više u kodu): FA.OUT_LOSS, TF.ENOUGH.

### A2. Posebni uslovi u kodu (43)

| naziv | šta radi | kad je dodato | zamenilo ili dodato preko | koristi se | preklapa se sa | preporuka | uticaj |
|---|---|---|---|---|---|---|---|
| Meta je najvredniji igrač (Mete) | U mogućem trejdu za metu niko od igrača koje dobijaš ne sme biti skuplji od mete. | pre tuning-v1 | nova stvar | da | – | **zadrži** | – |
| Najbolji igrač u trejdu (TOP_TOL) | Tvoj najbolji igrač u trejdu ne sme biti mnogo bolji od najboljeg kog dobijaš; u Prodaj skupo važi izuzetak. | pre tuning-v1 | nova stvar | da | TOP_TOL_OPP | **zadrži** | – |
| Povređeni ide na slobodno IR mesto | Povređeni igrač ne zauzima aktivno mesto ako primalac ima slobodan IR. | pre tuning-v1 | nova stvar | da | – | **zadrži** | – |
| Nema koga da otpusti | Trejd se odbacuje ako strana koja dobija više igrača nema koga da otpusti. | pre tuning-v1 | nova stvar | da | – | **zadrži** | – |
| Dolazni igrač bi odmah bio otpušten | Trejd se odbacuje: niko ne dobija igrača kog bi odmah pustio. | pre tuning-v1 | nova stvar | da | – | **zadrži** | – |
| Trejd kandidat se ne otpušta | Igrač sa oznakom Trejd kandidat nikad nije onaj koji se otpušta. | pre tuning-v1 | nova stvar | da | – | **zadrži** | – |
| Pravilo otpuštanja (DROP_ANY i stari uslov vd !== 'keep') | Ko sme da bude otpušten. Stari uslov ostaje u kodu kao druga grana prekidača. | tuning-v2 | zamenilo staro pravilo | nova grana da, stara ne | tfDropOk (samo u testovima) | **obriši staru granu i prekidač** | 0 (prekidač je uvek uključen) |
| Slobodno mesto u ligama na poene (slotPts) | Igrač sa waivera ulazi u postavu sa svojim udelom starta. | tuning-v2 | dodato preko pravila da se slobodno mesto ne računa | da (samo poeni) | SLOT_PTS prekidač | **zadrži, obriši samo prekidač** | 0 |
| Granica razlike u vrednosti (band) | Razlika u vrednosti mora biti u granicama izabranog režima. | tuning-v1 | zamenilo stari prag fer trejda | da | LIMITS, TRADE_WIDEN | **zadrži** | – |
| Prihvatanje: protivnik ne gubi previše | Kategorije: najviše 1 izgubljena više nego dobijena. Poeni: najviše 1,5 FPts manje. | pre tuning-v1 | nova stvar | da | – | **zadrži** | – |
| Prihvatanje: prednosti za povrede | Pet malih prednosti u rangu kad povreda pomaže trejdu (pritisak na roster, plejof, dno tabele, IR mesto). | pre tuning-v1 | nova stvar | da | TT.WILL | **spoji 5 vrednosti u jednu** | M4: 32 nova predloga na 18 prvih strana, 0 kršenja |
| Popravi kategorije: ostale ne padaju | Ostale kategorije ne smeju da padnu više od 0,12. | pre tuning-v1 | nova stvar | da | CATS_LOSE_EXTRA | **zadrži** | – |
| Bez lige: rezultat po kategorijama (TIE) | Bez drugih timova korist je broj dobijenih kategorija, uz prag nerešenog TIE. | pre tuning-v1 | nova stvar | samo bez lige | CARD_SD | **spoji prag sa CARD_SD** | Snimak: 0 |
| Najmanja korist | Trejd mora da pomogne bar 0,01 (poeni 0,2). | pre tuning-v1 | nova stvar | da | BEST_GAIN, CATS_GAIN | **pojednostavi (tabela)** | 0 |
| Najbolje za mene: korist i kartica | Korist bar 0,10 i kartica bar +2. | tuning-v1 | dodato preko najmanje koristi | da | MIN_GAIN | **zadrži** | – |
| Kartica bar nerešena | Sve strategije osim Popravi kategorije: na kartici ne gubiš više kategorija nego što dobijaš. | tuning-v1 | nova stvar | da | – | **zadrži** | – |
| Popravi kategorije: kartica i izabrane kategorije | Izgubljenih najviše dobijenih + 1, korist bar 0,05, bar jedna izabrana kategorija dobijena. | tuning-v2 | dodato preko stare provere | da | KEEP_DROP | **zadrži** | – |
| Konsolidacija: najbolji igrač dolazi tebi | U Konsolidaciji najbolji igrač u trejdu mora doći tebi. | tuning-v1 | nova stvar | da | – | **zadrži** | – |
| Dubina: dodatni igrač ulazi u postavu | U Dubini bar jedan novi igrač mora ući u tvoju postavu. | tuning-v1 | nova stvar | da | – | **zadrži** | – |
| Poeni: tvoji FPts ne smeju pasti | Provera da FPts ne padnu ispod nule posle trejda. | pre tuning-v1 | nova stvar | ne (najmanja korist 0,2 već traži više od nule, pa ova provera nikad ne odbija) | Najmanja korist | **obriši** | 0 (nikad se ne izvršava) |
| Prodaj skupo: mora tvoj igrač za prodaju | Trejd mora da sadrži igrača koga tržište precenjuje; svaki dobija istu prednost. | pre tuning-v1 | nova stvar | da | FORM_BONUS | **zadrži uslov, prednost ukloni (ista je za sve)** | 0 |
| Kupi jeftino: igrač za kupovinu ili kratka povreda | Trejd mora da sadrži jeftinog igrača ili kratko povređenog koji ide na tvoj IR. | pre tuning-v1 | nova stvar | da | B_BUY | **zadrži** | – |
| Dajem ako mora: kazna u rangu | Trejd sa takvim igračem dobija minus u rangu. | pre tuning-v1 | nova stvar | da, ali nema efekta | Dajem ako mora: posle svih ostalih (tuning-v2) | **obriši** | M2: 0 promena |
| Dajem ako mora: posle svih ostalih | Takvi predlozi dolaze tek kad nema drugih. | tuning-v2 | dodato preko kazne u rangu | da | SOFT_PENALTY | **zadrži** | – |
| Kazna za veličinu | Veći trejd dobija minus u rangu po igraču iznad 2. | pre tuning-v1 | nova stvar | da | SIZE_TIE, BIG_GAIN | **zadrži** | – |
| Otpušteni ulaze u trejd (convert) | Igrač kog bi strana otpustila, a drugoj vredi više od zamene, ide u trejd. | pre tuning-v1 | nova stvar | da | – | **zadrži** | – |
| Trejd sa 4 igrača (bigBar) | Strana od 4 samo kad pobedi najbolji manji trejd za 0,10; najviše 1 na strani. | tuning-v1 | nova stvar | da | SIZE_PEN | **zadrži** | – |
| Fer: bliže nuli ispred (dTie) | U režimu Fer, kod skoro istih trejdova ispred je ravnopravniji. | tuning-v2 | dodato preko redosleda po koristi | da | sizeTie | **zadrži** | – |
| Manji ispred (sizeTie) | Kod skoro istih trejdova ispred je manji. | tuning-v1 | dodato preko kazne za veličinu | da | SIZE_PEN | **zadrži** | M1: bez njega 395 novih na prvim stranama |
| Izuzeci od raznovrsnosti | U trejd igrači i retki igrači koji prolaze filtere nemaju ograničenje ponavljanja. | tuning-v1 | nova stvar | da | – | **zadrži** | – |
| Strane od 8: isto jezgro jednom | Dva predloga koja se razlikuju samo po igraču bez vrednosti ne idu oba. | pre tuning-v1 | nova stvar | da | – | **zadrži** | – |
| Strane od 8: više/manje igrača najviše 2 | Najviše 2 trejda gde dobijaš više i 2 gde daješ više; popušta kad nema drugih. | pre tuning-v1 | nova stvar | da | MAX_DIFF | **zadrži** | – |
| Strane od 8: srednje pravilo za njegovog igrača | Ako bi strana bila kraća od 6, njegov igrač sme u 3 umesto u 2. | tuning-v2 | dodato preko DIV_THEIRS | da | DIV_THEIRS | **zadrži** | M3: bez njega 84 pokretanja više ima prvu stranu kraću od 6 |
| Strane od 8: isti protivnik (Svi timovi) | Najviše 2 predloga istog protivnika na strani. | tuning-v2 | nova stvar | da | TT.MAX_OWNER | **zadrži** | – |
| Savet za veto | Na najviše 3 kartice: dodaj igrača da trejd bude a:a. | pre tuning-v1 | nova stvar | da | VETO_SIDE_MAX | **zadrži** | – |
| Igrač van do kraja sezone | Ne ulazi u predloge, osim ako je obeležen U trejd. | pre tuning-v1 | nova stvar | da | – | **zadrži** | – |
| Uloga igrača kog dobijaš (roleOk) | Igrač mora da igra bar 15 minuta ili da mu uloga raste. | tuning-v1 | nova stvar | da | FA.SIG, TT.MIN_UP | **zadrži** | – |
| Oblik trejda po strategiji (shapeOk) | Konsolidacija daje više, Dubina dobija više, Ne otpuštam nikoga ne dobija više. | pre tuning-v1 | nova stvar | da | – | **zadrži** | – |
| Filteri: bar jedan igrač prolazi | Svaki predlog ima bar jednog njegovog igrača koji prolazi filtere. | pre tuning-v1 | nova stvar | da | – | **zadrži** | – |
| tier (nivo predloga) | Ostatak starog sistema nivoa; uvek je 0. | tuning-v1 | ostatak starog | ne (uvek 0) | – | **obriši** | 0 (uvek 0); treba skloniti i iz izvoza ocena, testa i tf_audit |
| Brza gruba provera (WINDOW_MARGIN) | Pre tačnog računa preskače parove koji sigurno ne prolaze. Samo brzina. | pre tuning-v1 | nova stvar | da | – | **zadrži** | – |
| Igrač bez utakmica (NO_GAMES_DISC) | Vrednost iz projekcije ili prošle sezone, × 0,7. | tuning-v2 | nova stvar | da | – | **zadrži** | – |
| Slobodno mesto u analizi (SPOT_MODES) | Tri načina: realna zamena, izabran igrač, ništa. | pre tuning-v1 | nova stvar | da | SLOT_FROM/TO | **zadrži** | – |

### A3. Merenja (privremeno uključeno, nije commitovano)

| oznaka | izmena | predloga ukupno | na istom mestu | prva strana promenjena | novih predloga na prvim stranama | korist novih / izbačenih | igrača u trejdu novih / izbačenih | kršenja 7 pravila (osnova 0) | zaključak |
|---|---|---|---|---|---|---|---|---|---|
| M1 | TF.SIZE_TIE = 0 (obriši) | 121.444 → 121.444 | 36,0% | 158 od 561 | 395 | 0,554 / 0,410 | 5,5 / 4,6 | 0 | Bez njega na prve strane ulaze veći trejdovi. Pravilo radi svoj posao: zadrži. |
| M2 | SOFT_PENALTY i SOFT_PENALTY_PTS = 0 (obriši) | 121.444 → 121.444 | 100% | 0 od 561 | 0 | – | – | 0 (i provera sa obeleženim Dajem ako mora: isti rezultat) | Bez efekta, jer Dajem ako mora ionako ide posle svih ostalih. Obriši. |
| M3 | DIV_THEIRS_HI = DIV_THEIRS (obriši srednje pravilo) | 121.444 → 121.444 | 42,9% | 164 od 561 | 57 | 0,534 / 0,593 | 5,4 / 5,1 | 0 | Prva strana kraća od 6 u 248 umesto 164 pokretanja. Pravilo puni strane: zadrži. |
| M4 | TF.INJ: B_PRESSURE, B_CONTEND, B_REBUILD, B_MY_IR, B_SELL_MY = 0,05 (spoji) | 121.444 → 121.444 | 83,3% | 18 od 561 | 32 | 0,778 / 0,686 | 4,5 / 4,4 | 0 | Mala promena, novi predlozi nisu gori po 7 pravila. Može se spojiti uz tvoje odobrenje. |
| M5 | TOP_TOL_OPP = TOP_TOL (spoji na 20%) | 121.444 → 108.524 | 7,9% | 335 od 561 | 863 | 0,987 / 1,023 | 4,9 / 4,6 | 0 | Velika promena (12.920 predloga manje), novi malo slabiji. Zadrži. |

Izmene označene sa "0 (ista vrednost)", "0 (ne koristi se)" ili "0 (nikad se ne izvršava)" nisu posebno merene: kod koji bi se obrisao se ne izvršava ili daje isti broj, pa predlozi ostaju isti po konstrukciji. Pre stvarnog čišćenja i one se proveravaju snimkom.

## B) Elementi na ekranu (91)

"Tražio": da znači da se tekst ili tema elementa pominje u tvojim porukama; "ne vidi se" znači da nije nađeno (moguće je da si tražio drugim rečima).

| element | gde je | šta korisniku kaže | kad je dodato | korisnik tražio | ponavlja informaciju na istom ekranu | preporuka |
|---|---|---|---|---|---|---|
| Traka perioda (Sezona, 30, 15, 7 dana, Projekcija) | Analiza, Quick compare | Na kom periodu se računa cela analiza | pre tuning-v1 | da | ne | **zadrži** |
| Natpis rezultata | Analiza, Quick compare | Trejd ti donosi X kategorija, gubiš Y | pre tuning-v1 | da | ne | **zadrži** |
| Natpis za Roto | Analiza (Roto liga) | Popravljaš se u X kategorija, slabiš u Y | pre tuning-v1 | da | ne (zamenjuje natpis u Roto) | **zadrži** |
| Kućice Dobijaš kat. / Gubiš kat. / nerešeno | Analiza, Quick compare | Isti brojevi kao natpis, u kućicama | pre tuning-v1 (tekst promenjen kasnije) | ne vidi se | da: isti brojevi kao natpis iznad | **spoji sa natpisom** |
| Dugme Zameni strane + tooltip | Analiza | Daješ postaje Dobijaš i obrnuto | pre tuning-v1 | da | ne | **zadrži** |
| Dugme Sačuvaj ideju + tooltip | Analiza | Čuva samo ideju u Istoriju; rosteri se ne menjaju | pre tuning-v1 | ne vidi se | ne | **zadrži** |
| Dugme Trejd se dogodio + tooltip | Analiza | Tek ovo menja sačuvane rostere | pre tuning-v1 | da | da: ista rečenica stoji i u napomeni ispod | **zadrži** |
| Napomena o ideji | Analiza | Ovo je ideja, roster se ne menja dok ne klikneš Trejd se dogodio | pre tuning-v1 | ne vidi se | da: ponavlja tooltip dugmeta Trejd se dogodio | **obriši (ostaje tooltip)** |
| Dugme Kopiraj link | Analiza, Quick compare | Deli trejd linkom | pre tuning-v1 | da | ne | **zadrži** |
| Dugme Otvori ovaj trejd u mojoj ligi | Quick compare | Prebacuje trejd u tvoju ligu | pre tuning-v1 | da | ne | **zadrži** |
| Izbor Poređenje kategorija / Procena plasmana | Analiza | Dva prikaza tabele | pre tuning-v1 | da | ne | **zadrži, pitanje za tebe: da li se Procena plasmana koristi** |
| ⓘ uz Poređenje kategorija | Analiza, Quick compare | Zeleno i crveno trejd stvarno menja, sivo sa ≈ je premalo | kasnije | da | ne | **zadrži** |
| Boje ćelija: zeleno, crveno, sivo sa ≈ | Analiza, Quick compare | Da li kategorija stvarno raste ili pada u tvom timu | pre tuning-v1 (≈ kasnije) | da | ne | **zadrži** |
| Oznaka mali obim + tooltip | Analiza (FG%, FT%) | Procenat na malom broju šuteva skoro ne utiče na tim | pre tuning-v1 | da | delimično: sivo sa ≈ već kaže da je razlika premala | **spoji sa ≈ (jedna oznaka za premalu razliku)** |
| Tooltip Premala razlika da utiče na tim | Analiza | Objašnjava ≈ | kasnije | da | ne | **zadrži** |
| Klik na kategoriju: punt | Analiza | Klik isključuje kategoriju | pre tuning-v1 | da | ne | **zadrži** |
| Red tim: bez promene / tim: +X | Analiza | Koliko se menja zbir tvog tima | pre tuning-v1 | ne vidi se | ne | **zadrži** |
| Kolona Razlika + tooltip | Analiza | Dobijaš minus Daješ, iz tvoje perspektive | pre tuning-v1 | ne vidi se | ne | **zadrži** |
| Oznake ispod imena strane: X FPts / bolje u N kat. | Analiza | Koliko je strana bolja | pre tuning-v1 | da | da: broj kategorija već piše u natpisu | **obriši** |
| Red Slobodno mesto + tooltip | Analiza | Prosek 3. do 5. najboljeg slobodnog igrača | pre tuning-v1 | da | ne | **zadrži** |
| Izbor Kako se računa slobodno mesto | Analiza | Bira način računanja slobodnog mesta | pre tuning-v1 | ne vidi se | ne | **pojednostavi (proveri da li treba izbor)** |
| Polje Waiver dodatak a/b · opciono | Analiza | Dodaješ igrača sa waivera u trejd | pre tuning-v1 | da | ne | **zadrži** |
| Tooltip Nema podataka za ovaj period | Analiza (red igrača) | Igrač se ne računa u ovom periodu | pre tuning-v1 | ne vidi se | ne | **zadrži** |
| Oznaka Bez utakmica ove sezone | Analiza | Igrač nije igrao | tuning-v2 | da | ne | **zadrži** |
| Dugmad Posle trejda (pregled) / Sačuvan roster | Analiza, sekcija Moj tim | Koji roster gledaš | pre tuning-v1 | ne vidi se | ne | **zadrži** |
| Oznaka Izbacuje | Analiza (balans rostera) | Ko ispada iz rostera | pre tuning-v1 | ne vidi se | ne | **zadrži** |
| Oznaka mali uzorak | Profil igrača | Manje od N utakmica u periodu | pre tuning-v1 | da | ne | **zadrži** |
| Dugme Označi sve (Kopiraj za AI) | Analiza | Tekst za AI asistenta | pre tuning-v1 | da | ne | **zadrži** |
| 6 dugmadi strategija + tooltip | Pronađi trejd | Najbolje za mene, Popravi kategorije, Prodaj skupo, Kupi jeftino, Konsolidacija, Dubina | pre tuning-v1 | da | ne | **zadrži** |
| Klizač Fer / Malo u moju korist / Agresivno + ⓘ | Pronađi trejd | Granice razlike u vrednosti | tuning-v1 | da | ne | **zadrži** |
| Prekidač Ne otpuštam nikoga + tooltip | Pronađi trejd | Samo trejdovi bez otpuštanja | pre tuning-v1 | da | ne | **zadrži** |
| Dugme Pronađi trejdove, traka napretka, Prekini | Pronađi trejd | Pokreće pretragu | pre tuning-v1 | ne vidi se | ne | **zadrži** |
| Oznake igrača: Zaključaj, Dajem ako mora, U trejd, Isključi | Pronađi trejd, Mete | Pravila za pojedinog igrača | pre tuning-v1 | da | ne | **zadrži** |
| Dugmad Poništi sve / Dodaj protivnika / Unesi roster | Pronađi trejd | Rad sa oznakama i protivnikom | pre tuning-v1 | ne vidi se | ne | **zadrži** |
| Kartica: oznake Daješ / Dobijaš | Pronađi trejd | Strane trejda | pre tuning-v1 | ne vidi se | ne | **zadrži** |
| Kartica: natpis rezultata + ⓘ | Pronađi trejd | Dobijaš X, gubiš Y; računato na formu, sezonu i projekciju | pre tuning-v1 (ⓘ kasnije) | da | ne | **zadrži** |
| Kartica: 3 najveće promene (AST +2,1 ...) | Pronađi trejd | Koliko se kategorije pomeraju | pre tuning-v1 | ne vidi se | delimično: čipovi ispod pokazuju iste kategorije bez brojeva | **zadrži** |
| Kartica: čipovi kategorija ✓ ✗ = | Pronađi trejd | Svaka kategorija: dobijaš, gubiš, isto | pre tuning-v1 | ne vidi se | delimično: zbir čipova je natpis | **zadrži** |
| Kartica: Zašto bi prihvatio | Pronađi trejd | Razlog za protivnika | pre tuning-v1 | da | ne | **zadrži** |
| Kartica: Otpuštaš / Kad se X vrati sa IR-a / slobodno mesto | Pronađi trejd | Ko se otpušta i šta je sa slobodnim mestom | pre tuning-v1 | da | ne | **zadrži** |
| Kartica: Broj IR mesta je procena | Pronađi trejd | Upozorenje da IR mesta nisu sigurna | pre tuning-v1 | ne vidi se | ne | **zadrži** |
| Kartica: oznaka ide na IR | Pronađi trejd | Povređeni ide na slobodno IR mesto | pre tuning-v1 | da | ne | **zadrži** |
| Kartica: 💲 Dajem ako mora | Pronađi trejd | Igrač kog nerado daješ | pre tuning-v1 | da | da: oznaka je već na rosteru iznad | **zadrži** |
| Kartica: ↗ Uloga raste + tooltip | Pronađi trejd, Mete, FA | Minuti rastu ili je saigrač OUT | tuning-v1 | da | ne | **zadrži** |
| Kartica: oznaka filtera ✓ | Pronađi trejd | Igrač prolazi filtere | pre tuning-v1 | da | ne | **zadrži** |
| Kartica: status povrede i povratak | Pronađi trejd | OUT, vraća se oko datuma | pre tuning-v1 | da | ne | **zadrži** |
| Kartica: Za veto lige: dodaj X | Pronađi trejd | Kako da trejd prođe veto | pre tuning-v1 | da | ne | **zadrži** |
| Kartica: 👍 / 👎 | Pronađi trejd | Tvoja ocena predloga | pre tuning-v1 | da | ne | **zadrži** |
| Kartica: Sačuvaj / ✓ Sačuvano | Pronađi trejd | Čuva trejd u tab analize | pre tuning-v1 | da | ne | **zadrži** |
| Kartica: Trejd sa timom X | Pronađi trejd (Svi timovi) | Sa kim je trejd | tuning-v2 | da | ne | **zadrži** |
| Napomena kraća strana | Pronađi trejd | Zašto na strani ima manje od 8 | tuning-v1 | da | ne | **zadrži** |
| Napomena Pretraga sa N timova je trajala S s | Pronađi trejd (Svi timovi) | Koliko je pretraga trajala | tuning-v2 | ne vidi se | ne, ali korisniku ne kaže ništa korisno | **obriši** |
| Dugme Generiši novih 8 + tooltip kad nema više | Pronađi trejd | Sledeća strana predloga | pre tuning-v1 | da | ne | **zadrži** |
| Filteri: dugme, Obriši sve filtere, Skloni f, tip trejda | Pronađi trejd, FA | Sužava predloge | pre tuning-v1 | da | ne | **zadrži** |
| Uputstva: Obeleži igrače..., Promenio si izbor..., Rosteri su se promenili... | Pronađi trejd | Šta da uradiš | pre tuning-v1 | ne vidi se | ne | **zadrži** |
| Dugme Sačuvaj kao ligu | Pronađi trejd i Mete (javne strane) | Pravi ligu od unetih timova | pre tuning-v1 | da | ne | **zadrži** |
| Dugmad kategorija za fokus (uključena, punt) | Popravi kategorije | Koje kategorije popravljaš | pre tuning-v1 | da | ne | **zadrži** |
| Tooltip strategije: bez izbora tvoje 3 najslabije | Popravi kategorije | Šta se dešava bez izbora | tuning-v1 | ne vidi se | ne | **zadrži** |
| Proceni sam / Biram kategorije + ⓘ | Mete za trejd, FA | Ko bira potrebe tima | pre tuning-v1 | da | ne (isto i u FA, deljen element) | **zadrži** |
| Lista zaključanih + ⓘ, Klik uklanja | Mete za trejd | Igrači koji ne ulaze u trejd | pre tuning-v1 | da | ne | **zadrži** |
| Lista želja: oznake Tvoj tim / Slobodan, sortiranje | Mete za trejd | Ko je čiji | pre tuning-v1 | ne vidi se | ne | **zadrži** |
| Kartica mete: Vlasnik, Procena bez protivnika | Mete za trejd | Čiji je igrač, umesto koga ulazi | pre tuning-v1 | ne vidi se | ne | **zadrži** |
| Dugmad Trejduj / Predloži trejd sa ovim igračem | Mete za trejd | Otvara mogući trejd | pre tuning-v1 | da | ne | **zadrži** |
| Izveštaj: Šta ti donosi | Mete za trejd | Korist za tvoj tim | pre tuning-v1 | ne vidi se | ne | **zadrži** |
| Izveštaj: Zašto bi vlasnik pristao | Mete za trejd | Višak, potreba, dno tabele | pre tuning-v1 | da | delimično: isto pitanje kao Zašto bi prihvatio u Pronađi trejd, drugi tekstovi | **spoji tekstove sa Zašto bi prihvatio** |
| Izveštaj: Forma i uloga, Stabilnost minuta | Mete za trejd | Forma, minuti | pre tuning-v1 | ne vidi se | ne | **zadrži** |
| Izveštaj: Mogući trejd (do 2 za 2, Najbolje za mene, Fer) | Mete za trejd | Konkretan trejd za metu | pre tuning-v1 | da | ne | **zadrži** |
| Izveštaj: Izaberi drugi trejd sa ovim igračem | Mete za trejd | Druga ponuda za istu metu | pre tuning-v1 | ne vidi se | ne | **zadrži** |
| Izveštaj: Povreda, Plejof, Vesti, Poslednje utakmice | Mete za trejd | Detalji igrača | pre tuning-v1 | ne vidi se | da: isto ima u Profilu igrača | **zadrži** |
| Dugme Generiši novih N | Mete za trejd | Sledeće mete | pre tuning-v1 | ne vidi se | ne | **zadrži** |
| Opis na vrhu: Igrači sa drugih timova... | Mete za trejd | Šta je ova lista | pre tuning-v1 | ne vidi se | ne | **zadrži** |
| ⓘ Predlozi su dugoročni | Pojačanja sa FA | Dugoročno, ne dnevni izbor | tuning-v1 | da | ne | **zadrži** |
| Opis Svaka izmena se računa kao trejd 1 za 1 | Pojačanja sa FA | Kako se računa | pre tuning-v1 | da | ne | **zadrži** |
| Kartica: Odlazi, Predloži drugog | Pojačanja sa FA | Koga otpuštaš, promeni ga | pre tuning-v1 | da | ne | **zadrži** |
| Kartica: Profil, Izveštaj | Pojačanja sa FA | Detalji | pre tuning-v1 | ne vidi se | ne | **zadrži** |
| Kartica: N ut. u narednih 7 dana | Pojačanja sa FA | Broj utakmica | pre tuning-v1 | da | ne | **zadrži** |
| Oznake Waiver / Slobodan, Na waiveru do | Pojačanja sa FA | Status igrača | pre tuning-v1 | da | ne | **zadrži** |
| Otpuštanje: Automatski / izbor igrača | Pojačanja sa FA | Koga otpuštaš | pre tuning-v1 | ne vidi se | ne | **zadrži** |
| Oznaka Trejd kandidat + Pronađi trejd | Pojačanja sa FA | Slab za tebe, ali ima cenu | pre tuning-v1 | da | ne | **zadrži** |
| Zaključaj: nikad ne predlaži za otpuštanje | Pojačanja sa FA | Igrač se ne otpušta | pre tuning-v1 | da | ne | **zadrži** |
| Tooltip Dobijaš u proseku p% mečeva | Pojačanja sa FA | Kategorija kao procenat mečeva | pre tuning-v1 | ne vidi se | ne | **zadrži** |
| Izveštaj: nedelja meča, preuzimanja, Streaming | Pojačanja sa FA | Utakmice ove nedelje, limit | pre tuning-v1 | ne vidi se | ne | **zadrži** |
| Napomena Uključeni filteri | Pojačanja sa FA | Koji filteri rade | pre tuning-v1 | ne vidi se | da: filteri se vide i na dugmetu | **zadrži** |
| Snaga trenutnog rostera + ⓘ, jak / slab | Liga, Pregled | Rang tvog sadašnjeg rostera | pre tuning-v1 | da | delimično: Stvarni plasman je slična tabela | **zadrži** |
| Stvarni plasman u sezoni + ⓘ, jak / slab | Liga, Pregled | Gde tim stvarno stoji | pre tuning-v1 | da | delimično: vidi gore | **zadrži** |
| Moj tim ukratko: Forma rostera, Trka za plejof, linija plejofa | Liga, Pregled | Mesto, skor, zdravi igrači | pre tuning-v1 | da | ne | **zadrži** |
| Upozorenja + Sakrij + Otvori trejd | Liga, Pregled | Promene statusa igrača | pre tuning-v1 | da | ne | **zadrži** |
| Otvoreni trejdovi / Poslednji trejdovi | Liga, Pregled | Trejdovi u radu | pre tuning-v1 | ne vidi se | ne | **zadrži** |
| Tabela lige: jak / slab po timu, Nalepi tim, Preimenuj, Obriši | Liga | Timovi lige i njihove jake kategorije | pre tuning-v1 | ne vidi se | ne | **zadrži** |
| Brojač u meniju: otvoreni tabovi, ponude | Meni | Koliko tabova i ponuda čeka | pre tuning-v1 | da | ne | **zadrži** |
| Oznake istorije: ponuda poslata, prihvaćen, čeka, odbijen, ideja | Istorija | Status trejda | pre tuning-v1 | da | ne | **zadrži** |

## C) Mrtav kod (124)

**Funkcije koje niko ne poziva (8):** importFlag, injRetHTML, myTeamValue, pageLabel, pct3, publicHome, statName, tradePages.

**Funkcije koje koriste samo testovi (3):** pairScore, sleeperGroup, tfDropOk (tfDropOk je staro pravilo otpuštanja; sajt ga ne koristi).

**Konstante i uslovi motora bez efekta (10):** TF.FORM_GAP; TF.FORM_GAP_PTS; TF.ROLE.W; TF.ROLE.STRICT; TF.ROLE.STRICT_PTS; TF.ROLE.STRICT_MIN; FA.DROP_PRICE_MARGIN (0, bez efekta); TF.SLOT_PTS i TF.DROP_ANY (prekidači, uvek uključeni) i stara grana otpuštanja; tier (uvek 0; i u izvozu ocena, test_finder.js i tf_audit.js); provera u ligama na poene da FPts ne padnu ispod nule (nikad ne odbija, jer najmanja korist već traži više od nule).

**Prevodi koji se nigde ne prikazuju (71):**

- Moj tim ukratko
- Nađi bolji trejd sa ovim timom
- Opcije
- Daješ više igrača nego što dobijaš, pa ti posle trejda ostaje slobodno mesto. Igrač sa waivera menja tvoj tim, ali ne i …
- Nije na rosteru tvog tima: {list}
- Na osnovu proseka ({per}) trejd ti se &lt;span class="w">isplati&lt;/span>: dobijaš {w}, gubiš {l} {kat}.
- Na osnovu proseka ({per}) trejd ti se &lt;span class="l">ne isplati&lt;/span>: dobijaš {w}, gubiš {l} {kat}.
- Na osnovu proseka ({per}) trejd je izjednačen: {w} : {l}.
- Waiver dodatak (opciono, {a}/{b}) biraš gore, u kartici Dobijaš.
- Izaberi sačuvanog protivnika ili unesi novog.
- Roster je pun ({a} + {b} IR). Ukloni igrača da dodaš novog.
- Novi protivnik…
- moj roster: {n} igrača · protivnici: {o}{names} · istorija: {h}
- Svi tvoji podaci (moj roster, protivnici, IR oznake, istorija, punt i podešavanja) čuvaju se samo u ovom browseru. Napra…
- Trenutno: {s}
- Nalepi tekst rezervne kopije. Postojeći podaci biće zamenjeni tek posle potvrde.
- Istorija u kopiji nije u ispravnom formatu.
- raspored nije dostupan (potreban za datume utakmica)
- Razlika u sekciji Moj tim: ceo roster pre i posle trejda (ponderisano)
- Uticaj na moj tim
- Dok u Daješ nema igrača sa tvog rostera, sekcija Moj tim ne menja ništa (nije tvoj trejd).
- tim: {a} → {b}
- Dodaj ligu…
- Za {f} lige
- {n} protivnika
- Uvezi rostere sa {p}, uskoro
- Rang ({p})
- {n} je {s}, više nije OUT, a još je na IR.
- Koliko fantasy poena po utakmici igrač donosi više od igrača koga bi lako našao na waiveru. 0 je nivo zamene.
- Koliko igrač doprinosi u kategorijama tvoje lige u odnosu na igrače koji su na rosterima. 0 je prosečan igrač sa rostera…
- Po kategorijama, u odnosu na prosečnog igrača sa rostera:
- {a} → {b} FPts po utakmici
- Razlika FPts po utakmici: igrač koji dolazi minus igrač koji odlazi (sezona, 15 i 7 dana i projekcija).
- Neto dobit za tvoj tim: vrednost igrača koji dolazi minus vrednost igrača koji odlazi, po potrebama tvog tima (sezona, 1…
- Predlog za otpuštanje
- najslabiji aktivni igrač za tvoj tim
- Svi aktivni igrači su zaključani.
- Otpuštaš
- Neka platforma predloži
- Ko odlazi
- Izaberi sam
- Izabrao si {n} igrača, pa tražimo isto toliko pojačanja.
- Katanci: igrači koje nikad ne otpuštam
- Istaknute su kategorije koje tvom timu najviše trebaju: slabe po plasmanu u ligi i po trenutnom rosteru, i one koje gubi…
- Prikaži još
- Nijedan slobodan igrač ne donosi dovoljno više od igrača koji bi otišao. Ne spuštamo kriterijum da bi lista bila puna.
- Predlozi su po FPts po utakmici (mešavina sezone, poslednjih 15 i 7 dana i projekcije), u odnosu na igrača koji odlazi.
- Predlozi su po vrednosti za tvoj tim (mešavina sezone, poslednjih 15 i 7 dana i projekcije), u odnosu na igrača koji odl…
- Najbolja kombinacija
- FPts tima po utakmici
- Ove nedelje meča: {a} ut. za igrača koji dolazi, {b} za igrača koji odlazi.
- Procena za ovu nedelju
- Tvoj tim pre i posle
- po utakmici, {p}
- Bolja vrednost za tvoj tim od igrača koji odlazi.
- Do kraja nedelje meča: {a} ut. za {n1}, {b} za {n2}.
- Dobija {c}, gde je {n}. u ligi.
- Dobija {c}, gde je slabiji od tebe.
- Dobija {c}.
- Dobijaš slobodno mesto za igrača sa waivera.
- Daješ više igrača nego što dobijaš: slobodno mesto popunjavaš igračem sa waivera i to ulazi u rezultat. Uvezena liga: na…
- Daješ više igrača nego što dobijaš, pa ti posle trejda ostaje slobodno mesto. Igrač sa waivera ulazi u rezultat trejda. …
- Daješ više igrača nego što dobijaš: slobodno mesto popunjavaš igračem sa waivera i to ulazi u rezultat. Uvezena liga: re…
- Igrači sa drugih timova u ligi koji najviše dižu FPts tvog tima, a realno ih je dobiti. Za svakog tražimo i fer trejd sa…
- Igrači sa drugih timova u ligi koji najviše popravljaju kategorije koje ti trebaju, a realno ih je dobiti. Za svakog tra…
- Mogući trejd: računam…
- Nema fer trejda sa tvojim rosterom
- Sada u tvom timu
- Procena čeka raspored utakmica.
- Procena: (Dobijaš − Daješ) po utakmici × preostale utakmice NBA timova, dodato na zbir tvog tima iz {p}. Ostali timovi o…
- Rosteri su nalepljeni. Svaki tim možeš da nalepiš ponovo na stranici Liga.

**CSS klase koje se nigde ne koriste (32):** bal-row, brand-desc, fa-drop-now, fa-locks, fa-more, fa-rep-pts, hcenter, home-link, hright, inmodal, lang-link, leagues-link, ml-chip, ml-t, my-leagues, rp-opp, shot-ph, site-h, site-nav, tt-btns, tt-ex, tt-st, tt-stats, tt-sugg, tt-tl, tt-trade, tt-trade-none, tt-trade-wait, tt-wl, tt-wlist, tt-wrow, wsh-note.

Nisu u spisku, ali proveriti ručno (18, prave se iz promenljive pa ih pretraga ne vidi): al-back, al-dl, al-inj, al-ir, al-irback, al-news, al-offer, gp-bad, gp-good, gp-ok, m-lock, m-trade, min-down, min-up, mk-excl, mk-lock, mk-soft, mk-trade.


## D) Top 5 predloga

Izabrani su predlozi koji najviše pojednostavljuju sistem, a po merenju ne menjaju predloge (ili ih menjaju nula puta po konstrukciji). Ništa od ovoga nije urađeno; čeka tvoje odobrenje.

**1. Obriši pravila motora bez efekta.** FORM_GAP i FORM_GAP_PTS (ne čitaju se), ROLE.W, ROLE.STRICT, STRICT_PTS, STRICT_MIN (grana se ne izvršava), prekidači SLOT_PTS i DROP_ANY sa starom granom otpuštanja, FA.DROP_PRICE_MARGIN (0), SOFT_PENALTY i SOFT_PENALTY_PTS (M2: 0 promena), tier i provera da FPts ne padnu ispod nule. Dobitak: oko 14 konstanti i grana manje, motor se lakše čita. Rizik: greška pri brisanju; proverava se istim snimkom (mora ostati 121.444 identičnih predloga).

**2. Spoji konstante sa istom vrednošću.** PROJ_FADE_GP i REAL_PROJ_FADE_GP, PROJ_FLOOR i REAL_PROJ_FLOOR, GET_MORE_MAX i GIVE_MORE_MAX, TREND.MIN_GP i MINUTES.MIN_GP, BENCH.MIN_GP i VALUE.SMALL_SAMPLE_GP, TF.TIE.pct i TEAM_PCT_TIE. Dobitak: 6 konstanti manje, jedno mesto za podešavanje. Rizik: ako kasnije zatreba različita vrednost, moraju opet da se razdvoje.

**3. Jedna tabela najmanje koristi po strategiji.** Danas je to pet odvojenih pravila: MIN_GAIN, BEST_GAIN i BEST_CARD, CATS_GAIN i CATS_LOSE_EXTRA, TT.TRADE_BEST_GAIN i TRADE_BEST_CARD, FA.MIN_GAIN. Jedna tabela "strategija: najmanja korist, najmanji rezultat kartice" sa istim brojevima. Dobitak: na jednom mestu se vidi šta svaki alat traži. Rizik: nema promene predloga; pažljivo prepisati vrednosti.

**4. Obriši mrtav kod van motora.** 8 funkcija koje niko ne poziva, 71 prevod koji se ne prikazuje, 27 CSS klasa koje se ne koriste. Dobitak: manji app.js i rečnik, lakše traženje. Rizik: prevod ili klasa koja se pravi iz promenljive; zato su takve klase izdvojene za ručnu proveru.

**5. Skloni ponavljanja na ekranu analize.** Kućice "Dobijaš kat. / Gubiš kat." pored natpisa sa istim brojevima, oznaka "bolje u N kat." ispod imena strane, napomena o ideji koja ponavlja tooltip dugmeta Trejd se dogodio, oznaka "mali obim" pored sivog ≈, napomena "Pretraga sa N timova je trajala S s". Dobitak: čistiji ekran, jedna informacija na jednom mestu. Rizik: ne utiče na predloge, ali menja izgled; svaki element posebno odobravaš.

Sledeći kandidat posle ovih pet: spajanje 5 malih prednosti za povrede u jednu (M4: 32 nova predloga na 18 prvih strana, 0 kršenja pravila) i jedan prag za "uloga raste" (TF.ROLE, FA.SIG, TT.MIN_UP), koji ne menja Pronađi trejd, ali traži poseban snimak FA i Meta.

