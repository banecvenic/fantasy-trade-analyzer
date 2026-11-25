'use strict';
/* =====================================================================
   KONFIGURACIJA — sve što zavisi od (nezvaničnog) ESPN API-ja je ovde.
   ===================================================================== */
const CONFIG = (() => {
  const now = new Date();
  // Sezona = godina u kojoj se završava. Od oktobra (mesec index 9) je sledeća godina.
  const SEASON = now.getMonth() >= 9 ? now.getFullYear() + 1 : now.getFullYear();
  return {
    SEASON,
    API_URL: `https://lm-api-reads.fantasy.espn.com/apis/v3/games/fba/seasons/${SEASON}/segments/0/leaguedefaults/1?view=kona_player_info`,
    // ESPN ima ~1100 igrača (provereno 24.11.2026); sa 600 se odsecalo 18 igrača sa minutima ove sezone. Gzip: 723 KB -> 781 KB.
    PLAYER_LIMIT: 1500,
    // filterStatsForSplitTypeIds [0..3] izbacuje split 5 (po utakmicama), a ExternalIds
    // ostavlja samo prošlu i tekuću sezonu. Payload: ~24 MB -> ~0,6 MB (gzip).
    FILTER: {
      players: {
        limit: 1500,
        sortPercOwned: { sortPriority: 1, sortAsc: false },
        filterStatsForSplitTypeIds: { value: [0, 1, 2, 3] },
        filterStatsForExternalIds: { value: [SEASON - 1, SEASON] },
      },
    },
    // Raspored NBA timova (datumi utakmica). Javan, CORS radi.
    SCHEDULE_URL: `https://lm-api-reads.fantasy.espn.com/apis/v3/games/fba/seasons/${SEASON}?view=proTeamSchedules_wl`,
    SCHEDULE_CACHE_KEY: `fbaTrade.schedule.v2.${SEASON}`, // v2: + domaćin i gost
    // Utakmica se računa kao odigrana kad prođe ovoliko od početka (izbegava utakmice u toku).
    GAME_DONE_AFTER_MS: 3.5 * 60 * 60 * 1000,
    PREV_SEASON_GAMES: 82,
    FETCH_TIMEOUT_MS: 25000,
    SLOW_NOTICE_MS: 5000,
    CACHE_KEY: `fbaTrade.players.v8.${SEASON}`, // v8: svi igrači (limit 1500) // v7: DD i TD u projekciji iz sezone // v6: + tehničke, flagrantne, izbacivanja, diskvalifikacije, četvorostruki dabl-dablovi // v5: + statistike za druge formate (OREB, DREB, 3PA, PF, GS, DD, TD); u projekciji ih nema (null)
    OLD_CACHE_KEYS: [`fbaTrade.players.v2.${SEASON}`, `fbaTrade.players.v3.${SEASON}`, `fbaTrade.players.v4.${SEASON}`, `fbaTrade.players.v5.${SEASON}`, `fbaTrade.players.v6.${SEASON}`, `fbaTrade.players.v7.${SEASON}`, 'fbaTrade.sleeperNames.v1'],
    // Vesti po igraču (Rotowire preko ESPN-a, na engleskom). Javno, CORS radi.
    // feed je od najnovije ka starijoj i meša Rotowire beleške sa opštim ESPN člancima i video snimcima:
    // uzima se 8 najnovijih stavki i od njih 3 najnovije Rotowire beleške o igraču
    NEWS_URL: id => `https://site.api.espn.com/apis/fantasy/v2/games/fba/news/players?limit=8&playerId=${id}`,
    NEWS_TYPE: 'Rotowire',
    NEWS_KEEP: 3,
    NEWS_TTL_MS: 30 * 60 * 1000,   // keš po igraču (prebacivanje tabova i liga ne povlači ponovo)
    NEWS_RECENT_DAYS: 7,           // "skorašnja" vest (rizici, roster u tekstu za AI)
    STATE_KEY: 'fbaTrade.state.v1',
    PUNT_KEY: 'fbaTrade.punt.v1',      // samo lokalno, ne ide u link
    MYTEAM_KEY: 'fbaTrade.myteam.v1',  // stari format (samo za migraciju)
    ROSTERS_KEY: 'fbaTrade.rosters.v1', // moj roster + protivnici, samo lokalno
    BALANCE_KEY: 'fbaTrade.balance.v1', // izbor Koga izbacuješ / Waiver, samo lokalno
    UI_KEY: 'fbaTrade.ui.v1',           // otvorene sekcije, samo lokalno
    APP_PREFIX: 'fbaTrade.',            // svi ključevi aplikacije u localStorage
    PROFILE_KEY: 'fbaTrade.profile.v2', // profil sa svim ligama (šema SCHEMA_VERSION)
    TRADE_KEY: 'fbaTrade.trade.v2',     // stari format jednog trejda (samo za migraciju u tabove)
    TRADES_KEY: 'fbaTrade.trades.v1',   // tabovi trejdova { period, scopes: { [liga|quick]: { active, tabs[] } } }
    LEGACY_BACKUP_KEY: 'fbaTrade.legacyBackup.v1', // kopija podataka stare verzije pre migracije
    BACKUP_FORMAT: { app: 'fbaTrade', version: 1 },
    HISTORY_KEY: 'fbaTrade.history.v1', // samo lokalno, ne ide u link
    // Statistika po utakmici (split 5) za izabrane igrače. NAPOMENA: filterStatsForExternalIds
    // izbacuje split 5 (externalId tih unosa je ID utakmice), zato se ovde ne koristi.
    GAMELOG_FILTER: (ids, games = null) => ({ players: { filterIds: { value: ids }, filterStatsForSplitTypeIds: { value: [5] }, ...(games ? { filterStatsForExternalIds: { value: games } } : {}) } }), // games: ID-jevi utakmica ove sezone (bez njih stiže i cela prošla sezona, ~6x više podataka)
    CACHE_TTL_MS: 6 * 60 * 60 * 1000, // 6h
    HEADSHOT_URL: id => `https://a.espncdn.com/i/headshots/nba/players/full/${id}.png`,
    DROPDOWN_MAX: 10,
  };
})();

/** Periodi: stats[].id = `${statSourceId}${statSplitTypeId}${season}` */
const PERIODS = [
  { key: 'season', sr: 'Sezona',     statId: s => `00${s}` },
  { key: 'l7',     sr: '7 dana',     statId: s => `01${s}` },
  { key: 'l15',    sr: '15 dana',    statId: s => `02${s}` },
  { key: 'l30',    sr: '30 dana',    statId: s => `03${s}` },
  { key: 'proj',   sr: 'Projekcija', statId: s => `10${s}` },
].map(p => Object.defineProperty(p, 'label', { get() { return t(this.sr); } }));

/** Ključevi u averageStats (sve vrednosti su prosek po utakmici; u "stats" su sezonski zbirovi).
 *  MIN = '40' provereno: split 5 za utakmicu 401909879 (Wembanyama) = 27, isto kao ESPN gamelog.
 *  OREB 4, DREB 5, PF 9, 3PA 18, DD 37, TD 38, GS 41 provereno 18. 11. 2026. sa ESPN stranicama igrača
 *  (Jokić, Sabonis, Young, Hachimura: zbirovi sezone i DD2/TD3/GS se poklapaju). */
const STAT = {
  PTS: '0', BLK: '1', STL: '2', AST: '3', OREB: '4', DREB: '5', REB: '6', PF: '9', TO: '11',
  FGM: '13', FGA: '14', FTM: '15', FTA: '16', TPM: '17', TPA: '18', DD: '37', TD: '38', MIN: '40', GS: '41', GP: '42',
  EJ: '7', FF: '8', TF: '10', DQ: '12', QD: '39', // retke stavke za lige na poene (proseci po periodu postoje u averageStats i u utakmicama)
};
/** Statistike kojih nema u ESPN projekciji (provereno: 0 kod svih 348 igrača sa projekcijom) */
const NO_PROJ_KEYS = ['OREB', 'DREB', 'PF', 'GS']; // DD i TD: prosek sezone kao procena (PROJ_FROM_SEASON)
const PROJ_STAT_ID = `10${CONFIG.SEASON}`;
/** Stats id za celu prošlu sezonu (za trajnost) */
const PREV_SEASON_STAT_ID = `00${CONFIG.SEASON - 1}`;
/** Strelice trenda: poslednjih 15 dana vs sezona (prikaz samo u periodu "Sezona") */
const TREND = {
  RECENT_STAT_ID: `02${CONFIG.SEASON}`,
  MIN_GP: 4,            // bar 4 utakmice u 15 dana
  COUNT_REL: 0.15,      // counting kategorije: ±15%
  PCT_ABS: 0.03,        // FG% / FT%: ±3 procentna poena
  MIN_ABS: 0.1,         // i prikazane vrednosti moraju da se razlikuju (izbegava 0.1 -> 0.2 = +100%)
};
/** Minutaža: trend sezona -> 30 -> 15 -> 7 dana; upozorenje ako 15 dana pada > 3 min ispod sezone */
/** Minutaža: poslednjih 15 dana vs sezona. ±3 min = ↑/↓, ±5 min = ↑↑/↓↓ (promena uloge).
 *  Pragovi izabrani na podacima (top 300, nov. 2026): ±3 daje ~3% igrača u svakom smeru. */
const MINUTES = { TREND_KEYS: ['season', 'l30', 'l15', 'l7'], ALERT: 3, STRONG: 5, MIN_GP: 4 };
/** Nedelja = ponedeljak–nedelja po američkom istočnom vremenu (kao ESPN fantasy nedelje),
 *  da utakmica u nedelju uveče (ET) ne pređe u sledeću nedelju po našem vremenu. */
const WEEK_TZ = 'America/New_York';
/** Podrazumevani roster (ESPN): 13 aktivnih + 2 IR. Svaka liga bira svoj broj u podešavanjima. IR igrači se ne računaju u zbirove. */
const ROSTER_DEFAULT = { ACTIVE: 13, IR: 2 };
const ROSTER = {
  get ACTIVE() { return currentLeague()?.slots?.active ?? ROSTER_DEFAULT.ACTIVE; },
  get IR() { return currentLeague()?.slots?.ir ?? ROSTER_DEFAULT.IR; },
  STALE_DAYS: 7,
};
/** Pragovi boje za trajnost (GP%) */
const DURABILITY = { GOOD: 0.85, OK: 0.70 };
/** Kolone (kategorije) aktivnog formata, redom kao u ligi. Puni ih syncCats() iz formata lige (vidi "Modul formata").
 *  Oblik: { key, label, type: 'sum' | 'pct' (odnos, ponderisano: made / att), ratio (A/TO: broj, ne procenat),
 *  lowerIsBetter, lowVol (prag "malog obima" po imeniocu), noProj (nema u projekciji), fpts (kolona FPts), w (težina u poenima) }.
 *  Niz se menja u mestu, pa sav kod uvek vidi kolone aktivne lige. */
const CATS = [];

/** proTeamId -> skraćenica (provereno preko ?view=proTeamSchedules_wl, 2027) */
const PRO_TEAMS = {
  0: 'FA', 1: 'ATL', 2: 'BOS', 3: 'NOP', 4: 'CHI', 5: 'CLE', 6: 'DAL', 7: 'DEN', 8: 'DET', 9: 'GSW',
  10: 'HOU', 11: 'IND', 12: 'LAC', 13: 'LAL', 14: 'MIA', 15: 'MIL', 16: 'MIN', 17: 'BKN', 18: 'NYK',
  19: 'ORL', 20: 'PHI', 21: 'PHX', 22: 'POR', 23: 'SAC', 24: 'SAS', 25: 'OKC', 26: 'UTA', 27: 'WAS',
  28: 'TOR', 29: 'MEM', 30: 'CHA',
};

/** ESPN lineup slot ID -> naziv (eligibleSlots). 13 = IR; ESPN ga daje svakom igraču, a na IR
 *  može samo igrač koji je van stroja (OUT / IR), pa se gleda i slot i status. */
const SLOT_NAMES = { 0: 'PG', 1: 'SG', 2: 'SF', 3: 'PF', 4: 'C', 5: 'G', 6: 'F', 7: 'SG/SF', 8: 'G/F', 9: 'PF/C', 10: 'F/C', 11: 'UT', 12: 'BE', 13: 'IR' };
const IR_SLOT = 13;
const IR_STATUSES = ['OUT', 'INJURY_RESERVE'];
/** Osnovne pozicije igrača iz eligibleSlots (PG, SG, SF, PF, C; bez kombinovanih, UT, BE, IR) */
const slotPositions = p => (p.slots || []).filter(s => s <= 4).map(s => SLOT_NAMES[s]);
/** Sve pozicije igrača za prikaz, npr. "PF/C" (bez podataka: osnovna pozicija) */
const posList = p => { const ps = slotPositions(p); return ps.length ? ps : [p.pos]; };
const posTxt = p => posList(p).join('/');
/** Status igrača uvek ide kroz injOf: u uvezenoj ligi iz lige, u ručnoj iz ESPN baze (vidi playerStatus) */
const isOut = p => ['OUT', 'INJURY_RESERVE', 'SUSPENSION'].includes(injOf(p));
const canIR = p => (p.slots || []).includes(IR_SLOT) && IR_STATUSES.includes(injOf(p));

/** defaultPositionId -> pozicija */
const POSITIONS = { 1: 'PG', 2: 'SG', 3: 'SF', 4: 'PF', 5: 'C' };

/** injuryStatus -> kratka oznaka (ACTIVE/NORMAL se ne prikazuju) */
const INJURY = {
  DAY_TO_DAY: { short: 'DTD', cls: 'dtd' }, QUESTIONABLE: { short: 'Q', cls: 'dtd' }, PROBABLE: { short: 'P', cls: 'dtd' }, DOUBTFUL: { short: 'D', cls: 'dtd' },
  OUT: { short: 'O', cls: '' }, INJURY_RESERVE: { short: 'IR', cls: '' }, SUSPENSION: { short: 'SSPD', cls: '' },
};

/** Trejd ima uvek dve strane iz moje perspektive: teams[0] = Daješ (moj tim), teams[1] = Dobijaš (protivnik). */
const SIDES = [
  { srName: 'Daješ', srSub: 'Moj tim', color: 'var(--give)' },
  { srName: 'Dobijaš', srSub: 'Protivnik', color: 'var(--get)' },
].map(x => Object.defineProperties(x, { name: { get() { return t(this.srName); } }, sub: { get() { return t(this.srSub); } } }));
const GIVE = 0, GET = 1;

/** Izvor statistike: jedan za sve platforme (tekstovi ga uzimaju odavde, nigde nije zakucan) */
const DATA_SOURCE = { name: 'ESPN' };
/** Platforme lige: utiču samo na tekstove (statistika uvek dolazi iz DATA_SOURCE) */
const PLATFORMS = [
  { id: 'espn', label: 'ESPN' }, { id: 'yahoo', label: 'Yahoo' }, { id: 'fantrax', label: 'Fantrax' },
  { id: 'cbs', label: 'CBS' }, { id: 'sleeper', label: 'Sleeper' }, { id: 'other', srLabel: 'Drugo' },
];
const platformLabel = id => { const p = PLATFORMS.find(x => x.id === id) || PLATFORMS[PLATFORMS.length - 1]; return p.label || t(p.srLabel); };
/** Formati lige. Kategorije su u CATS (jedna konfiguracija); za sada je aktivan samo H2H kategorije. */
const FORMATS = [
  { id: 'h2h-cat', srLabel: 'H2H kategorije ({n}-cat)', srShort: '{n}-cat H2H', active: true },
  { id: 'roto', srLabel: 'Roto', active: false },
  { id: 'h2h-pts', srLabel: 'H2H poeni', active: false },
];
const TEAM_COLORS = SIDES.map(x => x.color);

/* =====================================================================
   Formati lige: katalog statistika, gotove postavke i model leagueFormat.
   Jedan model za ručni unos, uvoz lige i buduću prijavu (normalizeFormat).
   ===================================================================== */
/** Katalog statistika. id = ključ u našim podacima (isti kao u STAT i CATS).
 *  type 'sum': prosek po utakmici, sabira se. type 'ratio': uvek ponderisano preko zbirova (num / den), nikad prosek procenata.
 *  dir: 'high' više je bolje, 'low' manje je bolje. lowVol: prag "malog obima" po imeniocu (po utakmici, zbir strane).
 *  proj: false = ESPN projekcija nema tu statistiku (u projekciji je uvek 0), pa se u periodu Projekcija ne računa. */
const STAT_CATALOG = [
  { id: 'PTS',  label: 'PTS',  en: 'Points',              sr: 'Poeni',                 espn: ['0'],  type: 'sum', dir: 'high' },
  { id: 'REB',  label: 'REB',  en: 'Rebounds',            sr: 'Skokovi',               espn: ['6'],  type: 'sum', dir: 'high' },
  { id: 'OREB', label: 'OREB', en: 'Offensive rebounds',  sr: 'Skokovi u napadu',      espn: ['4'],  type: 'sum', dir: 'high', proj: false },
  { id: 'DREB', label: 'DREB', en: 'Defensive rebounds',  sr: 'Skokovi u odbrani',     espn: ['5'],  type: 'sum', dir: 'high', proj: false },
  { id: 'AST',  label: 'AST',  en: 'Assists',             sr: 'Asistencije',           espn: ['3'],  type: 'sum', dir: 'high' },
  { id: 'STL',  label: 'STL',  en: 'Steals',              sr: 'Ukradene lopte',        espn: ['2'],  type: 'sum', dir: 'high' },
  { id: 'BLK',  label: 'BLK',  en: 'Blocks',              sr: 'Blokade',               espn: ['1'],  type: 'sum', dir: 'high' },
  { id: 'TPM',  label: '3PM',  en: 'Threes made',         sr: 'Pogođene trojke',       espn: ['17'], type: 'sum', dir: 'high' },
  { id: 'TPA',  label: '3PA',  en: 'Threes attempted',    sr: 'Pokušane trojke',       espn: ['18'], type: 'sum', dir: 'high' },
  { id: 'TPP',  label: '3P%',  en: 'Three-point %',       sr: 'Procenat za tri',       espn: ['17', '18'], type: 'ratio', num: 'TPM', den: 'TPA', dir: 'high', lowVol: 1 },
  { id: 'FGM',  label: 'FGM',  en: 'Field goals made',    sr: 'Pogođeni šutevi',       espn: ['13'], type: 'sum', dir: 'high' },
  { id: 'FGA',  label: 'FGA',  en: 'Field goals attempted', sr: 'Pokušani šutevi',     espn: ['14'], type: 'sum', dir: 'high' },
  { id: 'FGP',  label: 'FG%',  en: 'Field goal %',        sr: 'Procenat šuta',         espn: ['13', '14'], type: 'ratio', num: 'FGM', den: 'FGA', dir: 'high', lowVol: 3 },
  { id: 'FTM',  label: 'FTM',  en: 'Free throws made',    sr: 'Pogođena slobodna bacanja', espn: ['15'], type: 'sum', dir: 'high' },
  { id: 'FTA',  label: 'FTA',  en: 'Free throws attempted', sr: 'Pokušana slobodna bacanja', espn: ['16'], type: 'sum', dir: 'high' },
  { id: 'FTP',  label: 'FT%',  en: 'Free throw %',        sr: 'Procenat slobodnih bacanja', espn: ['15', '16'], type: 'ratio', num: 'FTM', den: 'FTA', dir: 'high', lowVol: 1.5 },
  { id: 'TO',   label: 'TO',   en: 'Turnovers',           sr: 'Izgubljene lopte',      espn: ['11'], type: 'sum', dir: 'low' },
  { id: 'ATO',  label: 'A/TO', en: 'Assist to turnover',  sr: 'Asistencije / izgubljene', espn: ['3', '11'], type: 'ratio', num: 'AST', den: 'TO', dir: 'high', lowVol: 1 },
  { id: 'PF',   label: 'PF',   en: 'Personal fouls',      sr: 'Lične greške',          espn: ['9'],  type: 'sum', dir: 'low', proj: false },
  { id: 'MIN',  label: 'MIN',  en: 'Minutes',             sr: 'Minuti',                espn: ['40'], type: 'sum', dir: 'high' },
  { id: 'GS',   label: 'GS',   en: 'Games started',       sr: 'Utakmice u startu',     espn: ['41'], type: 'sum', dir: 'high', proj: false },
  { id: 'DD',   label: 'DD',   en: 'Double-doubles',      sr: 'Dabl-dablovi',          espn: ['37'], type: 'sum', dir: 'high', proj: false },
  { id: 'TD',   label: 'TD',   en: 'Triple-doubles',      sr: 'Tripl-dablovi',         espn: ['38'], type: 'sum', dir: 'high', proj: false },
  { id: 'QD',   label: 'QD',   en: 'Quadruple-doubles',   sr: 'Četvorostruki dabl-dablovi', espn: ['39'], type: 'sum', dir: 'high', rare: true, cat: false }, // cat: false = samo za poene (računamo ga iz utakmica; ESPN polje 39 nije provereno)
  { id: 'TF',   label: 'TF',   en: 'Technical fouls',     sr: 'Tehničke greške',       espn: ['10'], type: 'sum', dir: 'low', rare: true },
  { id: 'FF',   label: 'FF',   en: 'Flagrant fouls',      sr: 'Flagrantne greške',     espn: ['8'],  type: 'sum', dir: 'low', rare: true },
  { id: 'EJ',   label: 'EJ',   en: 'Ejections',           sr: 'Izbacivanja iz igre',   espn: ['7'],  type: 'sum', dir: 'low', rare: true },
  { id: 'DQ',   label: 'DQ',   en: 'Disqualifications',   sr: 'Isključenja (6 ličnih)', espn: ['12'], type: 'sum', dir: 'low', rare: true },
];
const STAT_BY_ID = new Map(STAT_CATALOG.map(x => [x.id, x]));
const statName = id => { const x = STAT_BY_ID.get(id); return x ? (LANG === 'en' ? x.en : x.sr) : id; };

const SCORING_TYPES = ['h2h_each', 'h2h_most', 'roto', 'h2h_points', 'season_points'];
const isPointsType = st => st === 'h2h_points' || st === 'season_points';

/** Gotove postavke. Poeni: proverene vrednosti sa zvaničnih stranica ESPN i Yahoo (podrazumevano bodovanje). */
const FORMAT_PRESETS = {
  '9cat': { kind: 'cat', srLabel: '9 kategorija', categories: ['PTS', 'REB', 'AST', 'TPM', 'STL', 'BLK', 'FGP', 'FTP', 'TO'] },
  '8cat': { kind: 'cat', srLabel: '8 kategorija (bez TO)', categories: ['PTS', 'REB', 'AST', 'TPM', 'STL', 'BLK', 'FGP', 'FTP'] },
  espn_points: { kind: 'points', srLabel: 'ESPN bodovanje', weights: { PTS: 1, TPM: 1, FGM: 2, FGA: -1, FTM: 1, FTA: -1, REB: 1, AST: 2, STL: 4, BLK: 4, TO: -2 } },
  espn_points_classic: { kind: 'points', srLabel: 'ESPN bodovanje (lige pre 2020)', weights: { PTS: 1, FGM: 1, FGA: -1, FTM: 1, FTA: -1, REB: 1, AST: 1, STL: 1, BLK: 1, TO: -1 } },
  yahoo_points: { kind: 'points', srLabel: 'Yahoo bodovanje', weights: { PTS: 1, REB: 1.2, AST: 1.5, STL: 3, BLK: 3, TO: -1 } },
};
const DEFAULT_FORMAT = Object.freeze({ scoringType: 'h2h_each', categories: FORMAT_PRESETS['9cat'].categories, weights: {}, preset: '9cat', source: 'manual', unsupported: [], bonus: [] });
const FORMAT_LIMITS = { MIN_CATS: 2, MAX_UNSUPPORTED: 20, UNSUPPORTED_LEN: 40, MAX_WEIGHT: 100 };

const sameWeights = (a, b) => { const ka = Object.keys(a), kb = Object.keys(b); return ka.length === kb.length && ka.every(k => b[k] === a[k]); };

/** Bonusi po utakmici (lige na poene): [{ s: statistika, n: prag, w: poeni }], npr. 40+ poena = { s: 'PTS', n: 40, w: 2 }.
 *  Računaju se iz statistike svake utakmice (ne iz proseka). */
function normBonus(list) {
  const out = [];
  for (const b of Array.isArray(list) ? list : []) {
    const n = Math.round(+b?.n), w = Math.round(+b?.w * 100) / 100;
    if (STAT_BY_ID.get(b?.s)?.type === 'sum' && n >= 1 && n <= 200 && Number.isFinite(w) && w !== 0 && Math.abs(w) <= FORMAT_LIMITS.MAX_WEIGHT && !out.some(x => x.s === b.s && x.n === n)) out.push({ s: b.s, n, w });
  }
  return out.slice(0, 20);
}
const bonusTxt = b => `${STAT_BY_ID.get(b.s)?.label || b.s} ${b.n}+ ${b.w > 0 ? '+' : ''}${fmtNum(b.w)}`;
/**
 * Proveri i normalizuj leagueFormat (ručni unos, uvoz, stari podaci). Uvek vraća ispravan objekat:
 * nepoznate statistike iz kategorija i težina se izbacuju, preset se proverava prema sadržaju
 * (ako se ne poklapa, postaje "custom"), a kad nešto ne može da se popravi, vraća 9-cat H2H.
 */
function normalizeFormat(raw) {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_FORMAT, categories: [...DEFAULT_FORMAT.categories], weights: {}, unsupported: [], bonus: [] };
  const scoringType = SCORING_TYPES.includes(raw.scoringType) ? raw.scoringType : 'h2h_each';
  const points = isPointsType(scoringType);
  const source = typeof raw.source === 'string' && /^(manual|import:[a-z]+)$/.test(raw.source) ? raw.source : 'manual';
  const unsupported = [...new Set((Array.isArray(raw.unsupported) ? raw.unsupported : [])
    .map(x => String(x ?? '').replace(/\s+/g, ' ').trim().slice(0, FORMAT_LIMITS.UNSUPPORTED_LEN)).filter(Boolean))].slice(0, FORMAT_LIMITS.MAX_UNSUPPORTED);
  const kind = points ? 'points' : 'cat';
  const presetIn = FORMAT_PRESETS[raw.preset]?.kind === kind ? raw.preset : null;
  // postavka koja odgovara sadržaju (za "custom" koji je isti kao neka gotova postavka)
  const presetHit = test => Object.entries(FORMAT_PRESETS).find(([, x]) => x.kind === kind && test(x))?.[0] || 'custom';
  if (points) {
    const bonus = normBonus(raw.bonus);
    const weights = {};
    for (const [k, v] of Object.entries(raw.weights && typeof raw.weights === 'object' ? raw.weights : {})) {
      const n = +v;
      if (STAT_BY_ID.get(k)?.type === 'sum' && Number.isFinite(n) && n !== 0 && Math.abs(n) <= FORMAT_LIMITS.MAX_WEIGHT) weights[k] = Math.round(n * 100) / 100;
    }
    if (!Object.keys(weights).length) { const preset = presetIn || 'espn_points'; return { scoringType, categories: [], weights: { ...FORMAT_PRESETS[preset].weights }, preset, source, unsupported, bonus: [] }; }
    const preset = bonus.length ? 'custom' : presetIn && sameWeights(weights, FORMAT_PRESETS[presetIn].weights) ? presetIn : presetHit(x => sameWeights(weights, x.weights));
    return { scoringType, categories: [], weights, preset, source, unsupported, bonus };
  }
  const cats = [...new Set((Array.isArray(raw.categories) ? raw.categories : []).filter(id => STAT_BY_ID.has(id) && STAT_BY_ID.get(id).cat !== false))];
  if (cats.length < FORMAT_LIMITS.MIN_CATS) { const preset = presetIn || '9cat'; return { scoringType, categories: [...FORMAT_PRESETS[preset].categories], weights: {}, preset, source, unsupported, bonus: [] }; }
  const same = x => x.categories.length === cats.length && x.categories.every(id => cats.includes(id));
  const preset = presetIn && same(FORMAT_PRESETS[presetIn]) ? presetIn : presetHit(same);
  return { scoringType, categories: cats, weights: {}, preset, source, unsupported, bonus: [] }; // redosled ostaje kako je zadat
}

/** Podrazumevani format pri dodavanju lige: platforma + vrsta (kategorije ili poeni) */
function defaultFormatFor(platform, kind = 'cat') {
  if (kind !== 'points') return normalizeFormat({ scoringType: 'h2h_each', preset: '9cat' });
  const preset = platform === 'espn' ? 'espn_points' : platform === 'yahoo' ? 'yahoo_points' : 'custom';
  return normalizeFormat({ scoringType: 'h2h_points', preset, weights: preset === 'custom' ? { PTS: 1 } : undefined });
}
/** Stari zapis lige (lg.format = 'h2h-cat') -> leagueFormat */
const legacyFormat = () => normalizeFormat({ scoringType: 'h2h_each', categories: [...FORMAT_PRESETS['9cat'].categories], preset: '9cat', source: 'manual' });
/** Format u deljenom linku: "e.9cat", "e.c.PTS,REB,TPP", "p.espn_points", "p.c.PTS_1,REB_1.2,TO_-1" */
const FORMAT_CODES = { h2h_each: 'e', h2h_most: 'm', roto: 'r', h2h_points: 'p', season_points: 's' };
function encodeFormat(f) {
  const x = normalizeFormat(f), code = FORMAT_CODES[x.scoringType];
  if (x.preset !== 'custom') return `${code}.${x.preset}`;
  return isPointsType(x.scoringType) ? `${code}.c.${Object.entries(x.weights).map(([k, v]) => `${k}_${v}`).join(',')}${x.bonus.length ? `~${x.bonus.map(b => `${b.s}_${b.n}_${b.w}`).join(',')}` : ''}` : `${code}.c.${x.categories.join(',')}`;
}
/** Iz linka u format; neispravan zapis -> null (link bez formata) */
function decodeFormat(str) {
  const parts = String(str || '').split('.');
  const scoringType = Object.keys(FORMAT_CODES).find(k => FORMAT_CODES[k] === parts[0]);
  if (!scoringType || !parts[1]) return null;
  if (parts[1] !== 'c') return FORMAT_PRESETS[parts[1]] && FORMAT_PRESETS[parts[1]].kind === (isPointsType(scoringType) ? 'points' : 'cat') ? normalizeFormat({ scoringType, preset: parts[1] }) : null;
  const [rest, bon = ''] = parts.slice(2).join('.').split('~');
  const items = rest.split(',').filter(Boolean);
  if (isPointsType(scoringType)) {
    const weights = Object.fromEntries(items.map(it => { const i = it.lastIndexOf('_'); return [it.slice(0, i), +it.slice(i + 1)]; }));
    const bonus = bon.split(',').filter(Boolean).map(it => { const [st, n, w] = it.split('_'); return { s: st, n: +n, w: +w }; });
    return Object.keys(weights).length ? normalizeFormat({ scoringType, preset: 'custom', weights, bonus }) : null;
  }
  return items.length >= FORMAT_LIMITS.MIN_CATS ? normalizeFormat({ scoringType, preset: 'custom', categories: items }) : null;
}
const sameFormat = (a, b) => encodeFormat(a) === encodeFormat(b);

/* ---------- Uvoz (priprema za sledeću fazu): podešavanja ESPN lige -> leagueFormat ----------
   Ulaz: settings.scoringSettings iz ESPN API-ja (view mSettings): { scoringType, scoringItems: [{ statId, points, isReverseItem, pointsOverrides }] }.
   Još nije povezano sa interfejsom. */
const ESPN_SCORING_TYPES = { H2H_CATEGORY: 'h2h_each', H2H_MOST_CATEGORIES: 'h2h_most', ROTO: 'roto', ROTISSERIE: 'roto', H2H_POINTS: 'h2h_points', TOTAL_POINTS: 'season_points', POINTS: 'season_points' };
/** ESPN id statistike u podešavanjima lige -> naš id. Odnosi imaju svoj id (19 FG%, 20 FT%, 21 3P%, 35 A/TO). */
const ESPN_STAT_IDS = (() => {
  const m = { 19: 'FGP', 20: 'FTP', 21: 'TPP', 35: 'ATO' };
  for (const x of STAT_CATALOG) if (x.type === 'sum') m[x.espn[0]] = x.id;
  return m;
})();
/** Promašaji (23 FG, 24 FT, 25 trojke): [pogodak, pokušaj]. Provereno: 23 = 14 − 13 i 24 = 16 − 15 u valuesByStat. */
const ESPN_MISSED = { 23: ['FGM', 'FGA'], 24: ['FTM', 'FTA'], 25: ['TPM', 'TPA'] };
/** Statistike koje lige mogu da boduju, a mi ih nemamo u podacima (naziv za napomenu "Ne računa se") */
const ESPN_OTHER_STATS = { 22: 'Adjusted FG%' };
/** Retke stavke: projekcija ih nema, pa se u periodu Projekcija uzima prosek sezone */
const RARE_KEYS = ['QD', 'TF', 'FF', 'EJ', 'DQ'];
/** Statistike kojih nema u ESPN projekciji, a u projekciji se uzima prosek sezone (procena, označeno ≈ uz FPts) */
const PROJ_FROM_SEASON = [...RARE_KEYS, 'DD', 'TD'];
/**
 * Vraća { format, error }. error: 'empty' (nema podešavanja), 'type' (format bez trejdova ili gde se računa jedna utakmica, npr. H2H_SINGLE_SCORE).
 * Statistike koje nemamo idu u unsupported ("ESPN stat 7"), kategorije zadržavaju redosled iz lige.
 */
function mapEspnFormat(settings) {
  const sc = settings?.scoringSettings || settings;
  if (!sc || typeof sc !== 'object' || !Array.isArray(sc.scoringItems)) return { format: null, error: 'empty' };
  const scoringType = ESPN_SCORING_TYPES[sc.scoringType];
  if (!scoringType) return { format: null, error: 'type' };
  const unsupported = [], categories = [], weights = {};
  for (const it of sc.scoringItems) {
    const w = +(it?.points ?? Object.values(it?.pointsOverrides || {})[0] ?? 0);
    const miss = ESPN_MISSED[it?.statId];
    if (miss && isPointsType(scoringType)) { // promašaj = pokušaj − pogodak (provereno na zbirovima tima), računa se tačno
      if (w) { weights[miss[1]] = (weights[miss[1]] || 0) + w; weights[miss[0]] = (weights[miss[0]] || 0) - w; }
      continue;
    }
    const id = ESPN_STAT_IDS[it?.statId];
    if (!id) { unsupported.push(ESPN_OTHER_STATS[it?.statId] || `ESPN stat ${it?.statId}`); continue; }
    if (isPointsType(scoringType)) {
      if (!w) continue;
      if (STAT_BY_ID.get(id).type !== 'sum') { unsupported.push(STAT_BY_ID.get(id).label); continue; } // procenat u ligi na poene
      weights[id] = (weights[id] || 0) + w;
    } else if (STAT_BY_ID.get(id).cat === false) unsupported.push(STAT_BY_ID.get(id).en); // samo za poene (npr. QD), u kategorijama ne može tačno
    else if (!categories.includes(id)) categories.push(id);
  }
  const format = normalizeFormat({ scoringType, categories, weights, preset: 'custom', source: 'import:espn', unsupported });
  return { format, error: null };
}
/* ---------- Sleeper: scoring_settings -> leagueFormat (Sleeper košarka je samo na poene, H2H) ----------
   Ključevi provereni na api.sleeper.app/v1/stats/nba (isti nazivi kao u scoring_settings). */
const SLEEPER_STAT = { tf: 'TF', ff: 'FF', qd: 'QD', pts: 'PTS', reb: 'REB', oreb: 'OREB', dreb: 'DREB', ast: 'AST', stl: 'STL', blk: 'BLK', to: 'TO', tpm: 'TPM', tpa: 'TPA', fgm: 'FGM', fga: 'FGA', ftm: 'FTM', fta: 'FTA', pf: 'PF', dd: 'DD', td: 'TD', gs: 'GS', min: 'MIN' };
/** Zbirne stavke (npr. pts_reb_ast) = ista težina za svaku statistiku; promašaji = pokušaj − pogodak */
const SLEEPER_COMBO = { pts_reb: ['PTS', 'REB'], pts_ast: ['PTS', 'AST'], reb_ast: ['REB', 'AST'], pts_reb_ast: ['PTS', 'REB', 'AST'], blk_stl: ['BLK', 'STL'] };
const SLEEPER_MISSED = { fgmi: ['FGM', 'FGA'], ftmi: ['FTM', 'FTA'], tpmi: ['TPM', 'TPA'] };
const SLEEPER_OTHER = {};
/** Bonus za prag u jednoj utakmici: bonus_pt_40p = 40+ poena */
const SLEEPER_BONUS_STAT = { pt: 'PTS', reb: 'REB', ast: 'AST' }; // Sleeper ima samo ove pragove (ključevi u api.sleeper.app/stats/nba/2025: bonus_pt_40p, bonus_pt_50p, bonus_reb_20p, bonus_ast_15p)
function mapSleeperFormat(sc) {
  if (!sc || typeof sc !== 'object') return { format: null, error: 'empty' };
  const weights = {}, unsupported = [], bonus = [];
  const add = (id, w) => { weights[id] = Math.round(((weights[id] || 0) + w) * 1000) / 1000; };
  for (const [k, v] of Object.entries(sc)) {
    const w = +v;
    if (!w) continue;
    if (SLEEPER_STAT[k]) add(SLEEPER_STAT[k], w);
    else if (SLEEPER_COMBO[k]) SLEEPER_COMBO[k].forEach(id => add(id, w));
    else if (SLEEPER_MISSED[k]) { add(SLEEPER_MISSED[k][1], w); add(SLEEPER_MISSED[k][0], -w); }
    else if (/^bonus_([a-z0-9]+)_(\d+)p$/.test(k) && SLEEPER_BONUS_STAT[k.split('_')[1]]) bonus.push({ s: SLEEPER_BONUS_STAT[k.split('_')[1]], n: +k.match(/_(\d+)p$/)[1], w });
    else unsupported.push(SLEEPER_OTHER[k] || `Sleeper: ${k}`);
  }
  for (const k of Object.keys(weights)) if (!weights[k]) delete weights[k];
  if (!Object.keys(weights).length) return { format: null, error: 'empty' };
  return { format: normalizeFormat({ scoringType: 'h2h_points', categories: [], weights, preset: 'custom', source: 'import:sleeper', unsupported, bonus }), error: null };
}
/* ---------- Fantrax: getLeagueInfo.scoringSystem -> leagueFormat ----------
   Provereno na pravim ligama (H2H poeni): type 'HEAD_TO_HEAD_POINTS_BASED', stavke u scoringCategorySettings[].configs[] sa scoringCategory.code/shortName i points.
   Kategorije provereno (nov. 2026): 'ROTISSERIE' i 'HEAD_TO_HEAD_ROTI_MULTI_WIN' (H2H svaka kategorija). Nepoznat tip vraća grešku pa korisnik bira ručno. */
const FANTRAX_STAT = { PTS: 'PTS', REB: 'REB', OREB: 'OREB', DREB: 'DREB', AST: 'AST', ST: 'STL', STL: 'STL', BLK: 'BLK', TO: 'TO', '3PTM': 'TPM', '3PM': 'TPM', '3PTA': 'TPA', '3PA': 'TPA', '3PT%': 'TPP', '3P%': 'TPP', FGM: 'FGM', FGA: 'FGA', 'FG%': 'FGP', FTM: 'FTM', FTA: 'FTA', 'FT%': 'FTP', 'A/TO': 'ATO', 'AST/TO': 'ATO', PF: 'PF', DD: 'DD', '2D': 'DD', TD: 'TD', '3D': 'TD', '4D': 'QD', QD: 'QD', TF: 'TF', TECH: 'TF', FF: 'FF', EJ: 'EJ', DQ: 'DQ', GS: 'GS', MIN: 'MIN' }; // TF, FF, EJ, DQ: nazivi nisu provereni na pravoj Fantrax ligi
const FANTRAX_CODE = { INDIVIDUAL_POINTS: 'PTS', INDIVIDUAL_REBOUNDS: 'REB', INDIVIDUAL_ASSISTS: 'AST', INDIVIDUAL_STEALS: 'STL', INDIVIDUAL_BLOCKS: 'BLK', INDIVIDUAL_TURNOVERS: 'TO' };
function fantraxScoringType(type) {
  const x = String(type || '').toUpperCase();
  if (x.includes('POINT')) return x.includes('HEAD') ? 'h2h_points' : 'season_points';
  if (x.includes('ROTIS') || x === 'ROTO') return 'roto';
  // H2H kategorije: provereno 'HEAD_TO_HEAD_ROTI_MULTI_WIN' = svaka kategorija je pobeda (3 lige, nov. 2026). Jedna pobeda: SINGLE/ONE/MOST (naziv nije proveren)
  if (x.includes('HEAD') && (x.includes('CATEG') || x.includes('ROTI'))) {
    if (/SINGLE|ONE_WIN|MOST/.test(x)) return 'h2h_most';
    if (x.includes('MULTI') || x.includes('EACH') || x.includes('CATEG')) return 'h2h_each';
  }
  return null;
}
function mapFantraxFormat(sys) {
  const scoringType = fantraxScoringType(sys?.type);
  if (!scoringType) return { format: null, error: 'type' };
  const pts = isPointsType(scoringType), weights = {}, categories = [], unsupported = [];
  for (const g of sys.scoringCategorySettings || []) for (const c of g?.configs || []) {
    const sc = c?.scoringCategory || {}, id = FANTRAX_CODE[sc.code] || FANTRAX_STAT[String(sc.shortName || '').toUpperCase()];
    const w = +c.points || 0;
    if (pts && !w) continue;
    if (!id || (pts && STAT_BY_ID.get(id).type !== 'sum')) { unsupported.push(sc.name || sc.shortName || sc.code || 'Fantrax'); continue; }
    if (pts) weights[id] = Math.round(((weights[id] || 0) + w) * 1000) / 1000;
    else if (STAT_BY_ID.get(id).cat === false) unsupported.push(sc.name || sc.shortName);
    else if (!categories.includes(id)) categories.push(id);
  }
  if (pts ? !Object.keys(weights).length : !categories.length) return { format: null, error: 'empty' };
  return { format: normalizeFormat({ scoringType, categories, weights, preset: 'custom', source: 'import:fantrax', unsupported }), error: null };
}
/** Format lige (uvek ispravan); bez lige (brzo poređenje) za sada 9-cat H2H */
const leagueFormatOf = lg => (lg ? normalizeFormat(lg.leagueFormat || legacyFormat()) : normalizeFormat(null));

/* ---------- Modul formata: zajednički interfejs za sve prikaze ----------
   columns(): kolone za prikaz igrača (CATS)            compareSides(totals): rezultat poređenja
   summary(res): tekst i brojke za rezultat na vrhu       teamTotals(ids): zbir tima
   playerValue(p): vrednost igrača (z-score kod kategorija, FPts iznad zamene kod poena; modul vrednosti)
   Kategorije i poeni su dve implementacije (FMT_CAT, FMT_PTS); FMT() vraća onu za aktivni format. */
function catFromStat(id, w = null) {
  const x = STAT_BY_ID.get(id);
  return {
    key: id, label: x.label, type: x.type === 'ratio' ? 'pct' : 'sum', made: x.num, att: x.den, ratio: id === 'ATO',
    lowerIsBetter: w != null ? w < 0 : x.dir === 'low', lowVol: x.lowVol || 0, noProj: (x.proj === false && !(w != null && PROJ_FROM_SEASON.includes(id))) || NO_PROJ_KEYS.includes(x.num) || NO_PROJ_KEYS.includes(x.den), w, // poeni: DD/TD u projekciji iz proseka sezone (procena)
  };
}
const FPTS_COL = { key: 'FPTS', label: 'FPts', type: 'sum', fpts: true, lowerIsBetter: false, lowVol: 0, noProj: false, w: null };
let FMT_ACTIVE = normalizeFormat(null);
/** Postavi kolone (CATS) po aktivnom formatu; zove se na početku svakog prikaza i pre teksta za AI */
function syncCats(f = activeFormat()) {
  FMT_ACTIVE = f;
  const list = isPointsType(f.scoringType)
    ? [FPTS_COL, ...Object.entries(f.weights).map(([id, w]) => catFromStat(id, w))]
    : f.categories.map(id => catFromStat(id));
  CATS.length = 0; CATS.push(...orderCats(list));
  // punt: samo kategorije koje postoje u formatu; u ligama na poene punta nema
  if (state.punt?.size) for (const k of [...state.punt]) if (isPointsType(f.scoringType) || !f.categories.includes(k)) state.punt.delete(k);
  return f;
}
/* ---------- Redosled kolona: podrazumevano kao na platformi lige; prevlačenjem zaglavlja korisnik bira svoj (pamti se samo za tu ligu) ----------
   ESPN i Yahoo (a po njemu i Fantrax i Sleeper) prikazuju kategorije uvek istim redom (9-cat ESPN: FG% FT% 3PM REB AST STL BLK TO PTS; Yahoo: FG% FT% 3PTM PTS REB AST ST BLK TO),
   bez obzira na redosled u podešavanjima lige. Ostale platforme i ručne lige: redosled iz formata. FPts je uvek prva kolona. */
const COL_ORDER = {
  espn: ['FGM', 'FGA', 'FGP', 'FTM', 'FTA', 'FTP', 'TPM', 'TPA', 'TPP', 'OREB', 'DREB', 'REB', 'AST', 'STL', 'BLK', 'TO', 'ATO', 'PF', 'DD', 'TD', 'GS', 'MIN', 'PTS'],
  yahoo: ['FGM', 'FGA', 'FGP', 'FTM', 'FTA', 'FTP', 'TPM', 'TPA', 'TPP', 'PTS', 'OREB', 'DREB', 'REB', 'AST', 'STL', 'BLK', 'TO', 'ATO', 'PF', 'DD', 'TD', 'GS', 'MIN'],
};
// Fantrax i Sleeper vraćaju stavke bodovanja bez stalnog reda (npr. abecedno), pa se slažu kao Yahoo (PTS REB AST STL BLK TO)
COL_ORDER.fantrax = COL_ORDER.sleeper = COL_ORDER.yahoo;
const COLS_KEY = 'fbaTrade.cols.v1';
const colsLeague = () => (EMBED?.mini ? null : currentLeague());
/** Sačuvan redosled (ključevi kolona) za ligu, ili null = podrazumevani */
function customCols(lg = colsLeague()) {
  const v = lg ? lsGet(COLS_KEY)?.[lg.id] : null;
  return Array.isArray(v) && v.length ? v : null;
}
/** Kolone po redu iz liste ključeva; kolone kojih nema u listi zadržavaju svoj redosled i idu posle */
const byOrder = (list, order) => list.map((c, i) => ({ c, i, o: order.indexOf(c.key) }))
  .sort((a, b) => (a.o < 0) - (b.o < 0) || (a.o >= 0 && b.o >= 0 ? a.o - b.o : a.i - b.i)).map(x => x.c);
function defaultCats(list, lg = colsLeague()) {
  const fixed = list.filter(c => c.fpts), rest = list.filter(c => !c.fpts);
  const plat = COL_ORDER[lg?.platform];
  return [...fixed, ...(plat ? byOrder(rest, plat) : rest)];
}
function orderCats(list, lg = colsLeague()) {
  const base = defaultCats(list, lg), cust = customCols(lg);
  return cust ? [...base.filter(c => c.fpts), ...byOrder(base.filter(c => !c.fpts), cust)] : base;
}
/** Sačuvaj redosled za aktivnu ligu (isti kao podrazumevani = briše se) */
function setCols(keys) {
  const lg = colsLeague();
  if (!lg) return;
  const st = lsGet(COLS_KEY) || {};
  const def = defaultCats(CATS).filter(c => !c.fpts).map(c => c.key);
  if (!keys || keys.join() === def.join()) delete st[lg.id]; else st[lg.id] = keys;
  lsSet(COLS_KEY, st);
}
const isPointsFmt = () => isPointsType(FMT_ACTIVE.scoringType);
/* =====================================================================
   Utakmice: čiste funkcije (dabl-dablovi iz statistike utakmice, bonusi za prag, prosek za period)
   Provereno na ESPN utakmicama 300 igrača (23. 11. 2026): ESPN DD = utakmice sa 2+ kategorije od 10+
   (tripl-dabl se računa i kao dabl-dabl), TD = 3+. Sleeper isto (Jalen Johnson 2025-26: dd 49 = naša računica).
   Fantrax "Double Doubles plus Triple Doubles" (2D) po nazivu računa i tripl-dablove.
   ===================================================================== */
const MULTI_KEYS = ['PTS', 'REB', 'AST', 'STL', 'BLK'];
const multiCount = l => MULTI_KEYS.filter(k => (l?.[k] ?? 0) >= 10).length;
/** DD, TD i QD jedne utakmice (zbirno: tripl-dabl je i dabl-dabl) */
function derivedOf(line) {
  const n = multiCount(line);
  return { DD: n >= 2 ? 1 : 0, TD: n >= 3 ? 1 : 0, QD: n >= 4 ? 1 : 0 };
}
/** Poeni od bonusa za prag u jednoj utakmici (npr. 40+ poena); svaki prag se računa posebno (50 poena = i 40+ i 50+) */
const gameBonusPts = (line, bonus = []) => bonus.reduce((a, b) => a + ((line?.[b.s] ?? 0) >= b.n ? b.w : 0), 0);
/** Prosek po utakmici za period: { n, B: bonus, DD, TD, QD }; days = null za celu sezonu; null kad nema utakmica u periodu */
function periodAgg(games, bonus = [], days = null, now = Date.now()) {
  const list = days ? (games || []).filter(g => g.date >= now - days * 864e5) : (games || []);
  if (!list.length) return null;
  const a = { n: list.length, B: 0, DD: 0, TD: 0, QD: 0 };
  for (const g of list) { const d = derivedOf(g.line); a.B += gameBonusPts(g.line, bonus); a.DD += d.DD; a.TD += d.TD; a.QD += d.QD; }
  for (const k of ['B', 'DD', 'TD', 'QD']) a[k] /= list.length;
  return a;
}
/** FPts za red statistike; agg (iz utakmica) menja DD/TD/QD i dodaje bonus */
function fptsCalc(line, weights, agg = null) {
  if (!line) return null;
  let s = 0;
  for (const [k, w] of Object.entries(weights)) s += w * ((agg && k in agg && ['DD', 'TD', 'QD'].includes(k) ? agg[k] : line[k]) ?? 0);
  return s + (agg?.B || 0);
}
/** Da li se igrač u međuvremenu igrao: utakmica njegovog tima je završena (početak + 3 h) posle poslednjeg povlačenja */
const logsStale = (entry, teamGames, now = Date.now(), dayMs = 864e5) => !entry || now - entry.ts > dayMs || (teamGames || []).some(g => g.date + 3 * 36e5 > entry.ts && g.date + 3 * 36e5 < now);
/** Redovi game loga u profilu (kao ESPN). games: [{ date, gid, line }] (odigrane), sched: utakmice NBA tima [{ id, date }],
    done: vreme posle kog se utakmica smatra završenom (now − trajanje).
    -> { played: [{ date, gid, line } | { date, gid, dnp: true }] od najstarije, next: [{ id, date, live }] od najbliže }
    Utakmica u toku ostaje u "next" (live) dok se ne završi. Utakmice tima koje igrač nije odigrao su { dnp: true }
    (ne računaju se u proseke ni GP); posle prelaska u drugi tim samo od poslednje utakmice za stari tim. */
function gameLogRows(games, sched, now, done) {
  const ids = new Set((sched || []).map(g => String(g.id)));
  const fin = (games || []).filter(g => g.date <= done);
  const mine = new Set(fin.map(g => String(g.gid)));
  const other = fin.filter(g => g.gid != null && !ids.has(String(g.gid)));
  const from = other.length ? other[other.length - 1].date : -Infinity;
  const dnp = (sched || []).filter(g => g.date <= done && g.date > from && !mine.has(String(g.id))).map(g => ({ date: g.date, gid: String(g.id), dnp: true }));
  const played = [...fin, ...dnp].sort((a, b) => a.date - b.date);
  const next = (sched || []).filter(g => g.date > done).map(g => ({ ...g, live: g.date <= now }));
  return { played, next };
}
/* ==== kraj: Utakmice, čiste funkcije ==== */

/* =====================================================================
   Alerti i dostupnost: čiste funkcije (bez DOM-a i stanja aplikacije; testovi u tools/test_alerts.js)
   ===================================================================== */
/** Sleeper injury_status -> ključ iz podešavanja lige (reserve_allow_*) */
const SLEEPER_IR_KEY = { Out: 'out', IR: 'out', DTD: 'dtd', GTD: 'dtd', Questionable: 'dtd', Doubtful: 'doubtful', Sus: 'sus', Suspended: 'sus', NA: 'na', DNR: 'dnr', COV: 'cov' };
const SLEEPER_IR_KEYS = ['out', 'dtd', 'doubtful', 'sus', 'na', 'dnr', 'cov'];
const SLEEPER_IR_LABEL = { out: 'Out', dtd: 'DTD/GTD', doubtful: 'Doubtful', sus: 'Sus', na: 'NA', dnr: 'DNR', cov: 'COV' };
/** Sleeper injury_status -> zajednički status (ESPN nazivi), oznaka kako je ima Sleeper i ključ za IR pravilo lige */
const SLEEPER_ST = { Out: 'OUT', IR: 'INJURY_RESERVE', DTD: 'DAY_TO_DAY', GTD: 'DAY_TO_DAY', Questionable: 'QUESTIONABLE', Doubtful: 'DOUBTFUL', Probable: 'PROBABLE', Sus: 'SUSPENSION', Suspended: 'SUSPENSION', NA: 'OUT', DNR: 'OUT', COV: 'OUT' };
const sleeperStatus = s => (!s ? null : { st: SLEEPER_ST[s] || 'DAY_TO_DAY', lb: s, k: SLEEPER_IR_KEY[s] || 'other' });
/** Zajednički skup grupa: OK, DTD, OUT, SSPD */
const ST_GROUP = { DAY_TO_DAY: 'DTD', QUESTIONABLE: 'DTD', PROBABLE: 'DTD', DOUBTFUL: 'DTD', OUT: 'OUT', INJURY_RESERVE: 'OUT', SUSPENSION: 'SSPD' };
const stGroup = s => ST_GROUP[s] || 'OK';
const sleeperGroup = s => stGroup(sleeperStatus(s)?.st);
/** Status igrača u ligi iz zajedničkog modela.
    entry: igrač sa rostera uvezene lige ({ st, lb, k }) ili null; espnInj: status iz ESPN baze igrača;
    fromLeague: liga daje statuse; markEspn: kad se koristi ESPN status, označava se "(ESPN)" (platforma ga ne daje).
    -> { inj (zajednički naziv), g (grupa), lb (oznaka platforme ili null), key (za IR pravilo), espn (označi ESPN) } */
function resolveStatus(entry, espnInj, fromLeague, markEspn) {
  const useLeague = !!(fromLeague && entry);
  const inj = useLeague ? entry.st || 'ACTIVE' : espnInj || 'ACTIVE';
  const g = stGroup(inj);
  return { inj, g, lb: useLeague ? entry.lb || null : null, key: useLeague && entry.k ? entry.k : g === 'OK' ? 'healthy' : inj === 'INJURY_RESERVE' ? 'IR' : g, espn: !useLeague && !!markEspn };
}
/** "A, B ili C" (spoj je preveden: or / ili) */
const orJoin = (list, or) => (list.length > 1 ? `${list.slice(0, -1).join(', ')} ${or} ${list[list.length - 1]}` : list.join(''));
/** Pamćenje statusa jedne lige. mem: { [pid]: [grupa, od (ms, 0 = nepoznato), prethodna grupa, oznaka] } ili null (prvo pokretanje).
    list: [{ id, g, label }] trenutno stanje. Prvo pokretanje samo pamti, bez promena. Igrači koji nisu u listi se brišu. */
function trackStatus(mem, list, now) {
  const out = {};
  let changed = !mem;
  for (const x of list) {
    const cur = mem?.[x.id];
    if (!cur) { out[x.id] = [x.g, 0, null, x.label]; changed = true; }
    else if (cur[0] !== x.g) { out[x.id] = [x.g, now, cur[0], x.label]; changed = true; }
    else { out[x.id] = cur[3] === x.label ? cur : [cur[0], cur[1], cur[2], x.label]; if (cur[3] !== x.label) changed = true; }
  }
  if (mem && Object.keys(mem).some(id => !out[id])) changed = true;
  return { mem: out, changed };
}
/** Promena statusa za alert: samo jednom, u prozoru od hours sati posle promene */
const statusEvent = (rec, now, hours) => !!rec && rec[1] > 0 && rec[2] != null && now - rec[1] <= hours * 36e5;
/** IR pravilo lige (niz dozvoljenih ključeva ili null = nepoznato) -> 'ok' | 'bad' | 'unknown' */
const irVerdict = (rule, key) => (!rule ? 'unknown' : rule.includes(key) ? 'ok' : 'bad');
/** Redosled važnosti: rok, IR, nove povrede, minutaža, vesti, ponude; u grupi najnovije gore */
const ALERT_RANK = { dl: 0, irback: 1, ir: 1, inj: 2, back: 2, min: 3, news: 4, offer: 5 };
const sortAlerts = list => [...list].sort((a, b) => (ALERT_RANK[a.kind] ?? 9) - (ALERT_RANK[b.kind] ?? 9) || b.ts - a.ts);
/** Sakriveni alerti: ostaju samo ključevi koji su i dalje aktivni (kad uslov prestane, novi nastanak se opet prikazuje) */
const keepHidden = (hidden, activeKeys) => Object.fromEntries(Object.entries(hidden || {}).filter(([k]) => activeKeys.has(k)));
/** Koeficijent dostupnosti: utakmice igrača / utakmice njegovog tima (0 do 1), OUT = 0; bez podataka 1 */
const availFactor = (gp, teamGames, out) => (out ? 0 : teamGames > 0 ? Math.max(0, Math.min(1, (gp || 0) / teamGames)) : 1);
/** Sleeper rok za trejdove (nedelja lige) -> približan datum: početak te nedelje. monday = ponedeljak tekuće nedelje (ms), leg = tekuća nedelja */
const sleeperDeadline = (week, leg, monday) => (week > 0 && week < 40 && leg > 0 && monday > 0 ? monday + (week - leg) * 7 * 864e5 : null);
const STATUS_NEWS = /\b(questionable|doubtful|probable|out|available|injur\w*|return\w*|sidelined|miss\w*|ruled|game-time|status|upgraded|downgraded|surgery|mri|x-rays?|restriction|suspend\w*|cleared|illness|sore\w*|sprain\w*|strain\w*|trade request)\b|\([a-z ]+\)/i;
/** Izveštaj sa utakmice: statistička linija ("15 points (5-10 FG", "nine points", "with 16 points") */
const GAME_RECAP = /\(\d+-\d+ (FG|3Pt|FT)\b|\b(\d+|zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)[- ]points?\b/i;
/** U izveštaju sa utakmice vest je o statusu samo ako pominje povredu ili izlazak iz igre */
const RECAP_INJURY = /\b(injur\w*|sprain\w*|strain\w*|sore\w*|ankle|knee|hamstring|calf|groin|back spasms|concussion|illness|exit\w*|left (the|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\S*|ruled out|did not return|questionable|doubtful|sidelined|mri|x-rays?|surgery)\b/i;
/** Naslov vesti je o statusu igrača (povreda, povratak, suspenzija), a ne obična statistika sa utakmice. "Fouled out" nije status. */
const isStatusNews = h => {
  const s = String(h || '').replace(/\bfoul(ed|ing|s)? out\b/gi, '');
  return STATUS_NEWS.test(s) && (!GAME_RECAP.test(s) || RECAP_INJURY.test(s));
};
/* ==== kraj: Alerti, čiste funkcije ==== */

/* =====================================================================
   Vrednost igrača: čiste funkcije (bez DOM-a i stanja aplikacije; testovi u tools/test_value.js)
   Kategorije: z-score po utakmici u odnosu na bazen igrača sa rostera (broj timova × aktivna mesta).
   Poeni: FPts po utakmici iznad nivoa zamene.
   ===================================================================== */
/** Podesive konstante vrednosti (sve na jednom mestu) */
const VALUE = {
  DEFAULT_TEAMS: 12, DEFAULT_ACTIVE: 13,  // bazen bez lige: 12 × 13
  SMALL_SAMPLE_GP: 5,                    // manje utakmica u periodu = "mali uzorak"
  // vrednost za moj tim: težina kategorije po mom mestu u ligi (punt je uvek 0)
  NEED_WEIGHT: { bottom: 1.5, middle: 1, top: 0.6 },
};
/** Doprinos igrača u jednoj kategoriji po utakmici. Procenti (i odnosi): uticaj = pogoci − procenat bazena × pokušaji
    (isto što i (procenat igrača − procenat bazena) × pokušaji). cat: { key, pct, made, att, low } */
function catContribution(line, c, base) {
  if (!line) return 0;
  if (c.pct) { const att = +line[c.att] || 0, made = +line[c.made] || 0; return att > 0 ? made - (base ?? 0) * att : 0; }
  return +line[c.key] || 0;
}
/** Statistika bazena po kategoriji: { [key]: { base (ponderisani procenat), mean, sd } } */
function poolStats(lines, cats) {
  const out = {};
  for (const c of cats) {
    let base = null;
    if (c.pct) { let m = 0, a = 0; for (const l of lines) { m += +l[c.made] || 0; a += +l[c.att] || 0; } base = a > 0 ? m / a : 0; }
    const xs = lines.map(l => catContribution(l, c, base));
    const mean = xs.length ? xs.reduce((x, y) => x + y, 0) / xs.length : 0;
    const sd = xs.length ? Math.sqrt(xs.reduce((x, y) => x + (y - mean) ** 2, 0) / xs.length) : 0;
    out[c.key] = { base, mean, sd };
  }
  return out;
}
/** Z-score po kategorijama za jednog igrača: { total, by: { [key]: z } }. Manje je bolje (TO): obrnut znak. */
function zScores(line, cats, stats) {
  const by = {}; let total = 0;
  for (const c of cats) {
    const st = stats[c.key];
    const z = st.sd > 0 ? (catContribution(line, c, st.base) - st.mean) / st.sd : 0;
    by[c.key] = c.low ? -z : z; total += by[c.key];
  }
  return { total, by };
}
/** Kategorijska vrednost za sve igrače u 2 prolaza: prvi rangira sve, drugi računa prosek i SD samo na najboljih poolN.
    rows: [{ id, line }]. -> { stats, values: Map(id -> { total, by }) } */
function categoryValues(rows, cats, poolN) {
  const valid = rows.filter(r => r.line);
  const first = poolStats(valid.map(r => r.line), cats);
  const ranked = valid.map(r => ({ r, v: zScores(r.line, cats, first).total })).sort((a, b) => b.v - a.v);
  const pool = ranked.slice(0, Math.max(1, poolN)).map(x => x.r.line);
  const stats = poolStats(pool, cats);
  const values = new Map(valid.map(r => [r.id, zScores(r.line, cats, stats)]));
  return { stats, values };
}
/** Poenska vrednost: FPts po utakmici minus nivo zamene (prosek igrača rangiranih od poolN+1 do poolN+teams).
    rows: [{ id, fpts }] -> { repl, values: Map(id -> { total, fpts }) } */
function pointsValues(rows, poolN, teams) {
  const valid = rows.filter(r => r.fpts != null).sort((a, b) => b.fpts - a.fpts);
  const band = valid.slice(poolN, poolN + Math.max(1, teams));
  const repl = band.length ? band.reduce((x, r) => x + r.fpts, 0) / band.length : valid.length ? valid[valid.length - 1].fpts : 0;
  return { repl, values: new Map(valid.map(r => [r.id, { total: r.fpts - repl, fpts: r.fpts }])) };
}
/** Rang po vrednosti (1 = najbolji) za Map(id -> { total }) */
function valueRanks(values) {
  const order = [...values.entries()].sort((a, b) => b[1].total - a[1].total);
  return new Map(order.map(([id], i) => [id, i + 1]));
}
/** Vrednost za ostatak sezone: po utakmici × preostale utakmice × koeficijent dostupnosti (OUT = 0) */
const restOfSeasonValue = (perGame, gamesLeft, avail) => (perGame == null || gamesLeft == null ? null : perGame * gamesLeft * avail);
/** Težine kategorija za moj tim: punt = 0; donja trećina lige veća težina, gornja manja. ranks: { [key]: { rank, of } } ili null */
function needWeights(cats, ranks, punt, W = VALUE.NEED_WEIGHT) {
  const out = {};
  for (const c of cats) {
    if (punt?.has?.(c.key)) { out[c.key] = 0; continue; }
    const r = ranks?.[c.key];
    if (!r || !(r.of > 2)) { out[c.key] = 1; continue; }
    const third = r.of / 3;
    out[c.key] = r.rank > r.of - third ? W.bottom : r.rank <= third ? W.top : W.middle;
  }
  return out;
}
/** Vrednost uz težine: zbir z × težina */
const weightedValue = (by, weights) => Object.entries(by).reduce((s, [k, z]) => s + z * (weights[k] ?? 1), 0);
/* ==== kraj: Vrednost, čiste funkcije ==== */

/* =====================================================================
   Pojačanja sa FA: čiste funkcije (bez DOM-a i stanja aplikacije; testovi u tools/test_fa.js)
   Vrednost za moj tim dolazi iz modula vrednosti (z-score / FPts iznad zamene), ovde se samo meša, poredi i bira.
   ===================================================================== */
/** Podesive konstante alata (sve na jednom mestu) */
const FA = {
  BLEND: { proj: 0.5, season: 0.35, l15: 0.3, l7: 0.2 },  // mešavina perioda za vrednost igrača (FA alat, Pronađi trejd)
  BLEND_FULL_GP: { season: 20, l15: 6, l7: 3 },           // ispod ovoliko utakmica period dobija srazmerno manju težinu
  PROJ_FADE_GP: 25,     // projekcija pre sezone gubi težinu kako igrač igra: × (1 − utakmice u sezoni / 25), ali najmanje PROJ_FLOOR
  PROJ_FLOOR: 0.25,
  REAL_PROJ_FADE_GP: 15, // stvarna vrednost (otpuštanje, slobodno mesto): projekcija nestaje linearno do 15 utakmica u sezoni,
  REAL_PROJ_FLOOR: 0,    // bez donje granice; cena na tržištu zadržava PROJ_FADE_GP i PROJ_FLOOR
  DROP_PRICE_MARGIN: 0, // otpuštanje: cena mora biti ispod cene realne zamene + ovoliko (inače je igrač Trejd kandidat)
  MIN_GAIN: 0.05,       // kategorije: najmanje koliko kategorija više u proseku protiv ostalih timova da bi se predlog prikazao
  MIN_GAIN_PTS: 1.5,    // poeni: najmanja razlika FPts po utakmici
  TOP: 9,               // kartica u glavnoj listi (3 reda po 3)
  DROP_MAX_OWN: 50,     // automatski predlog za otpuštanje: samo igrači sa ESPN vlasništvom ispod ovog procenta
  TRADE_CAND: 3,        // najviše igrača sa oznakom "Trejd kandidat"
  PAGE: 25,             // redova po stranici u tabeli svih FA igrača
  WATCH: 5,             // igrača u listi "Prati"
  RISING: 8,            // igrača u listi "U usponu"
  STASH: 5,             // igrača u sekciji IR stash
  // signali "uskače u rotaciju": blago podižu rang (bonus po signalu, u jedinicama neto dobiti)
  SIG: { MIN_UP: 5, MIN_GP: 3, OWN_UP: 1, MATE_MIN: 20, BONUS: 0.015, BONUS_PTS: 0.5 },
  MANUAL_OFF: 0.5,      // ručni izbor kategorija: težina kategorija koje nisu izabrane (u očekivanim pobedama)
  PUBLIC_MAX_OWN: 60,   // javna lista "u usponu": samo igrači sa vlasništvom ispod ovog procenta
};
/** FA igrači = svi iz baze minus igrači na rosterima lige (uključujući IR). rosters: [[id...], ...] */
function freeAgentIds(allIds, rosters) {
  const taken = new Set(rosters.flat());
  return allIds.filter(id => !taken.has(id));
}
/** Težine perioda: osnovne težine, smanjene kad period ima malo utakmica; period bez podataka = 0; zbir = 1 (ili prazno) */
function blendWeights(gp, B = FA.BLEND, FULL = FA.BLEND_FULL_GP, floor = FA.PROJ_FLOOR, fadeGp = FA.PROJ_FADE_GP) {
  const w = {};
  for (const [k, base] of Object.entries(B)) {
    const g = gp[k];
    if (!(g > 0)) continue;
    w[k] = FULL[k] ? base * Math.min(1, g / FULL[k]) : base;
  }
  // projekcija pre sezone: što više odigranih utakmica, to manje vredi (sezona i poslednji dani pokazuju stvarnu ulogu)
  if (w.proj && gp.season > 0 && B.season) w.proj *= Math.max(floor, 1 - gp.season / fadeGp);
  if (!(w.proj > 0)) delete w.proj;
  const sum = Object.values(w).reduce((a, b) => a + b, 0);
  if (!(sum > 0)) return {};
  for (const k of Object.keys(w)) w[k] /= sum;
  return w;
}
/** Mešavina vrednosti po periodima: vals { proj, l15, l7: { total, by?, fpts? } | null }, w iz blendWeights -> { total, by?, fpts? } | null */
function blendValue(vals, w) {
  const keys = Object.keys(w).filter(k => vals[k]);
  if (!keys.length) return null;
  const sum = keys.reduce((a, k) => a + w[k], 0);
  const out = { total: 0 };
  for (const k of keys) {
    const f = w[k] / sum, v = vals[k];
    out.total += v.total * f;
    if (v.fpts != null) out.fpts = (out.fpts || 0) + v.fpts * f;
    if (v.by) { out.by = out.by || {}; for (const [c, z] of Object.entries(v.by)) out.by[c] = (out.by[c] || 0) + z * f; }
  }
  return out;
}
/** Signali rotacije -> [{ kind, ... }]. d: { minSeason, minRecent, recentGp, ownChg, matesOut: [ime] } */
function rotationSignals(d, S = FA.SIG) {
  const out = [];
  if (d.minSeason != null && d.minRecent != null && (d.recentGp || 0) >= S.MIN_GP && d.minRecent - d.minSeason >= S.MIN_UP) out.push({ kind: 'min', from: d.minSeason, to: d.minRecent });
  for (const name of d.matesOut || []) out.push({ kind: 'mate', name });
  if ((d.ownChg || 0) >= S.OWN_UP) out.push({ kind: 'own', chg: d.ownChg });
  return out;
}
/* ---------- Par (dolazi, odlazi) kao trejd 1 za 1: zbirovi mog tima pre i posle, pa poređenje sa ostalim timovima ----------
   cats: [{ key, pct, made, att, low }] (bez punt kategorija). Linije su po utakmici; tim = zbir linija aktivnih igrača. */
/** Mešavina linija po periodima: lines { proj, l15, l7 }, w iz blendWeights -> jedna linija po utakmici (ili null) */
function blendLine(lines, w) {
  const keys = Object.keys(w).filter(k => lines[k]);
  if (!keys.length) return null;
  const sum = keys.reduce((a, k) => a + w[k], 0), out = {};
  for (const k of keys) for (const [s, v] of Object.entries(lines[k])) if (typeof v === 'number' && Number.isFinite(v)) out[s] = (out[s] || 0) + v * (w[k] / sum);
  return out;
}
/** Zbir linija (tim) */
function sumLines(lines) {
  const out = {};
  for (const l of lines) if (l) for (const [k, v] of Object.entries(l)) if (typeof v === 'number') out[k] = (out[k] || 0) + v;
  return out;
}
/** Tim posle izmene: zbir − odlazi + dolazi */
function swapTotals(tot, inLine, outLine) {
  const out = { ...tot };
  for (const [k, v] of Object.entries(outLine || {})) if (typeof v === 'number') out[k] = (out[k] || 0) - v;
  for (const [k, v] of Object.entries(inLine || {})) if (typeof v === 'number') out[k] = (out[k] || 0) + v;
  return out;
}
/** Vrednost kategorije iz zbira: procenti ponderisano (made/att), ostalo zbir */
const totCat = (tot, c) => (c.pct ? (tot[c.att] > 0 ? (tot[c.made] || 0) / tot[c.att] : null) : tot[c.key] ?? 0);
/** Normalna raspodela (Abramowitz-Stegun) */
function normCdf(z) {
  const t = 1 / (1 + 0.2316419 * Math.abs(z)), d = 0.3989423 * Math.exp(-z * z / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - p : p;
}
/** Kontekst lige: rasipanje timova po kategoriji (SD zbirova svih timova). teams: [zbir] (moj tim uključen) */
function leagueSpread(teams, cats) {
  const sd = {};
  for (const c of cats) {
    const xs = teams.map(t => totCat(t, c)).filter(v => v != null);
    const m = xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
    const v = Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length || 1));
    sd[c.key] = v > 1e-9 ? v : (c.pct ? 0.01 : Math.max(0.5, Math.abs(m) * 0.05));
  }
  return sd;
}
/** Očekivane pobede u kategorijama protiv ostalih timova (prosek po protivniku): { total, by } (H2H: kategorije po meču; roto: isto, zbir po timovima je plasman) */
function expWins(tot, opps, cats, sd, weights = null) {
  const by = {}; let total = 0;
  if (!opps.length) return { total, by };
  for (const c of cats) {
    const w = weights ? weights[c.key] ?? 1 : 1, v = totCat(tot, c);
    if (!w || v == null) { by[c.key] = 0; continue; }
    let e = 0;
    for (const o of opps) { const ov = totCat(o, c); if (ov == null) { e += 0.5; continue; } const z = (v - ov) / sd[c.key]; e += normCdf(c.low ? -z : z); }
    by[c.key] = e / opps.length; total += by[c.key] * w;
  }
  return { total, by };
}
/** Ocena para: koliko kategorija više u proseku dobijam protiv ostalih timova posle izmene (poeni: razlika FPts).
    ctx { pts, cats, tot (moj tim), opps, sd, weights, base (expWins pre) } -> { gain, by (promena po kategoriji) } */
function pairGain(ctx, inLine, outLine) {
  if (ctx.pts) return { gain: (inLine?.FPTS || 0) - (outLine?.FPTS || 0), by: {} };
  const after = expWins(swapTotals(ctx.tot, inLine, outLine), ctx.opps, ctx.cats, ctx.sd, ctx.weights);
  const by = {};
  for (const c of ctx.cats) by[c.key] = (after.by[c.key] || 0) - (ctx.base.by[c.key] || 0);
  return { gain: after.total - ctx.base.total, by };
}
/** Rezultat kao u analizi trejda (1 za 1): po kategoriji poredi se igrač koji dolazi sa igračem koji odlazi;
    procenti: promena procenta mog tima, ispod tie (.001) je nerešeno. -> { win, lose, res: { [key]: 1 | -1 | 0 }, d: { [key]: { before, after, diff } } } */
function pairScore(cats, tot, inLine, outLine, tie = 0.001) {
  const after = swapTotals(tot, inLine, outLine), res = {}, d = {};
  let win = 0, lose = 0;
  for (const c of cats) {
    const b = totCat(tot, c), a = totCat(after, c);
    d[c.key] = { before: b, after: a, diff: a != null && b != null ? a - b : null };
    const diff = d[c.key].diff;
    let r = 0;
    if (diff != null && Math.abs(diff) >= (c.ratio ? 0.01 : c.pct ? tie : 0.05)) r = (c.low ? diff < 0 : diff > 0) ? 1 : -1;
    res[c.key] = r; if (r > 0) win++; else if (r < 0) lose++;
  }
  return { win, lose, res, d };
}
/** Presuda za mog igrača prema realnoj zameni sa waivera, po obe vrednosti: m { rv (stvarna), mv (cena), own, ir }, slot { rv, mv }.
    Stvarna ispod zamene i cena ispod cene zamene (+ margin), vlasništvo ispod praga -> 'drop'; stvarna ispod zamene, a cena viša
    (ili vlasništvo od praga naviše) -> 'trade' (Trejd kandidat, ne otpušta se); inače, zaključan ili na IR -> 'keep' */
function dropVerdict(m, slot, { locked = false, maxOwn = FA.DROP_MAX_OWN, margin = FA.DROP_PRICE_MARGIN } = {}) {
  if (locked || m.ir || !Number.isFinite(m.rv) || !Number.isFinite(slot?.rv) || !(m.rv < slot.rv)) return 'keep';
  return (m.own ?? 0) < maxOwn && Number.isFinite(m.mv) && m.mv < slot.mv + margin ? 'drop' : 'trade';
}
/** Vrednost za pravilo otpuštanja: tržišna vrednost (mv, ista kao u Pronađi trejd), a bez nje opšta vrednost */
const dropVal = m => m?.mv ?? m?.general ?? -Infinity;
/** Sme li igrač automatski da bude predložen za otpuštanje za FA igrača x:
    tržišna vrednost manja od tržišne vrednosti igrača koji dolazi, vlasništvo ispod praga, nije zaključan (IR igrači se ne šalju).
    Uz slot (realna zamena sa waivera { rv, mv }): po obe vrednosti (dropVerdict). */
const canDrop = (m, x, locks = new Set(), maxOwn = FA.DROP_MAX_OWN, slot = null) =>
  slot ? dropVerdict(m, slot, { locked: locks.has(m.id), maxOwn }) === 'drop'
    : !locks.has(m.id) && (m.own == null || m.own < maxOwn) && dropVal(m) < dropVal(x);
/** Predlozi: za svakog FA igrača njemu najbolji par za otpuštanje.
    fa [{ id, general, signals }], mine [{ id, general, own }], gain(fa, m) -> broj.
    picks (ručni izbor) važe za sve kartice, i bez praga, i krše pravila uz upozorenje; skipBy { [faId]: n } = "Predloži drugog".
    -> { list: [{ id, drop, gain, score, warn, alts }], eligible (da li iko sme da ode) } */
function faSuggest(fa, mine, gain, { picks = [], locks = new Set(), skipBy = {}, min = FA.MIN_GAIN, bonus = FA.SIG.BONUS, top = FA.TOP, maxOwn = FA.DROP_MAX_OWN, slot = null } = {}) {
  const out = [];
  let eligible = false;
  for (const x of fa) {
    const cands = picks.length ? picks : mine.filter(m => canDrop(m, x, locks, maxOwn, slot));
    if (!cands.length) continue;
    if (!picks.length) eligible = true;
    const ranked = cands.map(m => ({ m, g: gain(x, m) })).filter(y => y.g != null).sort((a, b) => b.g - a.g);
    if (!ranked.length) continue;
    const pick = ranked[(skipBy[x.id] || 0) % ranked.length];
    if (!picks.length && !(pick.g > min)) continue; // ručni izbor: prikaži najbolje i kad ne prelaze prag (kartica pokazuje šta gubiš)
    out.push({ id: x.id, drop: pick.m.id, gain: pick.g, score: pick.g + bonus * Math.min(2, (x.signals || []).length), warn: dropVal(pick.m) >= dropVal(x), alts: ranked.length });
  }
  out.sort((a, b) => b.score - a.score);
  return { list: out.slice(0, top), eligible: picks.length ? true : eligible };
}
/** Trejd kandidati: moji igrači koje bi FA igrač popravio (gain > min), ali ne smeju automatski da odu.
    Uz slot (realna zamena { rv, mv }): stvarna vrednost ispod zamene, a cena viša ili vlasništvo od praga naviše (dropVerdict = 'trade').
    Bez slota: vlasništvo od praga naviše ili vrednost veća od najboljeg FA igrača. Najslabiji za moj tim prvi. */
function tradeCandidates(mine, fa, gain, { locks = new Set(), min = FA.MIN_GAIN, maxOwn = FA.DROP_MAX_OWN, n = FA.TRADE_CAND, slot = null } = {}) {
  if (!fa.length) return [];
  const bestFa = Math.max(...fa.map(dropVal));
  return mine.filter(m => (slot ? dropVerdict(m, slot, { locked: locks.has(m.id), maxOwn }) === 'trade' : !locks.has(m.id) && ((m.own ?? 0) >= maxOwn || dropVal(m) > bestFa)))
    .map(m => ({ m, g: Math.max(...fa.map(x => gain(x, m) ?? -Infinity)) }))
    .filter(y => y.g > min).sort((a, b) => b.g - a.g).slice(0, n).map(y => ({ id: y.m.id, gain: y.g }));
}
/** Stranice: [stavke], stranica (1..), po stranici -> { rows, page, pages } */
function pageOf(items, page, per = FA.PAGE) {
  const pages = Math.max(1, Math.ceil(items.length / per)), p = Math.min(Math.max(1, page | 0), pages);
  return { rows: items.slice((p - 1) * per, p * per), page: p, pages };
}
/** Lista "Prati": igrači sa signalom koji ne prelaze prag, po vrednosti */
function watchList(fa, shownIds, n = FA.WATCH) {
  const shown = new Set(shownIds);
  return fa.filter(x => !shown.has(x.id) && (x.signals || []).length && x.value != null).sort((a, b) => b.value - a.value).slice(0, n);
}
/** IR stash: samo uz slobodno IR mesto; status mora da sme na IR po pravilu lige (irRule null = platforma ne daje: svi OUT statusi uz napomenu).
    fa [{ id, k (ključ statusa), out (OUT ili duže), healthy (vrednost kad je zdrav) }] -> [{ id, ... }] */
function irStash(fa, { irRule = null, freeIr = 0, n = FA.STASH } = {}) {
  if (!(freeIr > 0)) return [];
  return fa.filter(x => x.healthy != null && x.healthy > 0 && (irRule ? irRule.includes(x.k) : x.out)).sort((a, b) => b.healthy - a.healthy).slice(0, n);
}
/** Javna lista u usponu: vlasništvo ispod praga, najveći rast prvi. players [{ id, own: { pct, chg } }] */
function publicRising(players, max = FA.PUBLIC_MAX_OWN, n = 15) {
  return players.filter(p => p.own && p.own.pct < max && p.own.chg > 0).sort((a, b) => b.own.chg - a.own.chg).slice(0, n);
}
/* ==== kraj: FA, čiste funkcije ==== */

/* =====================================================================
   Fer trejd: čiste funkcije (motor za Pronađi trejd). Bez DOM-a i stanja aplikacije: ceo motor je jedna funkcija tfEngine(),
   pa isti kod radi u Web Workeru (šalje se kao tekst) i u testovima (tools/test_finder.js).
   Vrednost i linije igrača sprema aplikacija (mešavina perioda kao u FA alatu), motor samo kombinuje, filtrira i rangira.
   Ocena prihvatanja se koristi samo u algoritmu, nigde se ne prikazuje.
   ===================================================================== */
/** Podesive konstante (sve na jednom mestu) */
const TF = {
  STAR_POW: 1.2,          // dodatak za zvezde: pozitivna vrednost po utakmici S × (v / S)^STAR_POW, S = prosek pozitivnih vrednosti bazena
  LIMITS: { fair: [0.10, 0.15], slight: [0.125, 0.175], aggr: [0.15, 0.20] }, // razlika vrednosti [bez, sa igračem obeleženim U trejd]
  SLIDERS: ['fair', 'slight', 'aggr'],
  ENOUGH: 10,             // koliko trejdova bliže fer je "dovoljno" pre nego što se uzmu oni sa većim odstupanjem
  CAT_MAX_DIFF: 1,        // protivnik: porazi minus pobede najviše ovoliko (nerešeno se ne broji)
  PTS_MAX_LOSS: 1.5,      // poeni: protivnik ne sme da izgubi više FPts po utakmici
  OPP_PUNT_Z: 1.25,       // punt protivnika: poslednji ili pretposlednji i bar ovoliko SD ispod proseka lige
  SOFT_PENALTY: 0.25,     // "Dajem ako mora": kazna u rangu (očekivane pobede po meču)
  SOFT_PENALTY_PTS: 2.5,  // isto, poeni (FPts po utakmici)
  FORM_GAP: 1.0,          // Prodaj skupo / Kupi jeftino: forma (15 i 7 dana) bar ovoliko iznad / ispod projekcije (vrednost po utakmici, z)
  FORM_GAP_PTS: 4,        // isto, poeni (FPts po utakmici)
  FORM_BONUS: 0.15,       // prednost trejdu sa bar jednim takvim igračem (očekivane pobede), poeni: × 10; ne raste sa brojem igrača da ne gura velike trejdove
  FOCUS_W: 2,             // Popravi kategorije: težina izabranih kategorija
  KEEP_DROP: 0.12,        // Popravi kategorije: ostale kategorije ne smeju da padnu više od ovoliko (očekivane pobede)
  MIN_GAIN: 0.01, MIN_GAIN_PTS: 0.2, // trejd mora bar malo da pomogne mom timu
  MAX_SIDE: 4,            // do 4 igrača sa svake strane
  KEEP: 400,              // koliko najboljih trejdova se čuva za "Generiši novih 8"
  PER_PAGE: 8,
  // tržišna vrednost (za fer i ocenu prihvatanja): težine z-score-ova u bazenu (top igrači po vlasništvu)
  MARKET: { GEN: 0.45, PROD: 0.25, MIN: 0.15, OWN: 0.10, RANK: 0.05 }, // vlasništvo meri koliko je igrač poznat, ne koliko pomaže: manja težina
  MARKET_Z_MIN: -2,       // tržište ne kažnjava slabu efikasnost u kategorijama bez granice: z svake komponente najmanje -2
  PROD_W: { PTS: 1, TPM: 0.5, REB: 1.25, AST: 1.5, STL: 2, BLK: 2, TO: -0.5 }, // sirova produkcija za cenu na tržištu (kako je vide rang liste); stavka koje nema u statistici = 0 (poeni: FPts)
  MAX_DIFF: 1,            // razlika u broju igrača (Najbolje za mene, Popravi kategorije, Prodaj skupo, Kupi jeftino)
  MAX_DIFF_WIDE: 2,       // Konsolidacija i Dubina
  TOP_TOL: 0.20,          // moj najbolji igrač u trejdu sme biti najviše 20% vredniji od najboljeg kog dobijam
  TOP_TOL_OPP: 0.30,      // obrnuto za protivnika (ocena prihvatanja)
  SIZE_PEN: 0.13,         // kazna u rangu po igraču iznad 2 u trejdu (očekivane pobede): 2:2 −0,26, 3:3 −0,52, 4:4 −0,78. Fer granica je relativna (10% veće strane),
                          // pa veći trejd sme da donese veći apsolutni višak; ova kazna to izjednačava da dobri 1:1 i 2:2 ne nestanu iz top 8
  SIZE_PEN_PTS: 1.3,      // isto, poeni (FPts po utakmici)
  SIZE_PEN_WIDE: 0.07,    // Konsolidacija i Dubina (veća strana iznad 2, × 3): bez promene
  SIZE_PEN_WIDE_PTS: 0.7,
  VETO_MAX: 3,            // savet za veto na najviše toliko kartica od 8
  SLOT_FROM: 3, SLOT_TO: 5, // slobodno mesto (uvezena liga): prosek 3. do 5. najboljeg zdravog slobodnog igrača, ne najbolji (konzervativno)
  SLOT_WAIVER: 0.8,       // igrač na waiveru ulazi u taj prosek sa ovim umanjenjem (nije zagarantovan)
  GET_MORE_MAX: 2,        // na svakih 8 predloga najviše toliko trejdova gde dobijam više igrača nego što dajem (Najbolje za mene, Popravi kategorije, Prodaj skupo, Kupi jeftino)
  GIVE_MORE_MAX: 2,       // isto za trejdove gde dajem više igrača nego što dobijam (ista strategija, oba ograničenja važe zajedno)
  GET_MORE_STRATS: ['best', 'cats', 'sell', 'buy'],
  WINDOW_MARGIN: 0.06,    // odsecanje: gruba provera vrednosti sa ovolikom rezervom, pa tek onda tačan račun
  TIE: { count: 0.05, pct: 0.001, ratio: 0.01 },
  // povređeni igrači (OUT): vrednost po utakmicama posle očekivanog povratka; blage prednosti u rangu (očekivane pobede, poeni × 10)
  INJ: {
    DEFAULT_WEEKS: 6,     // nema procene ni u ESPN-u ni u vestima: oprezno, kao duža povreda
    PAST_DAYS: 3,         // ESPN datum je prošao, a igrač je i dalje OUT: povratak za toliko dana
    SHORT_WEEKS: 3,       // kratka povreda (za prednost kad imam slobodno IR mesto)
    IR_MIN_WEEKS: 2,      // na IR ide tek povreda od bar toliko nedelja; kraća zauzima aktivno mesto (vraća se za par dana, pa bi i FA i on brojali celu sezonu)
    PLAYOFF_LATE: 0.4,    // vraća se posle početka plejofa: vrednost za tim koji se bori za plejof × ovo
    CONTEND_EXTRA: 1,     // "bori se za plejof": plasman do broja timova u plejofu + ovoliko
    B_PRESSURE: 0.05,     // protivnik ima više povređenih nego IR mesta, a daje povređenog
    B_CONTEND: 0.04,      // protivnik se bori za plejof i daje povređenog za zdravog
    B_REBUILD: 0.04,      // protivnik je pri dnu tabele i daje povređenog
    B_MY_IR: 0.05,        // dobijam povređenog sa kratkom povredom, a imam slobodno IR mesto
    B_BUY: 0.15,          // isto u strategiji Kupi jeftino (jače)
    B_SELL_MY: 0.05,      // imam više povređenih nego IR mesta, a protivnik ima slobodno IR mesto i dobija mog povređenog
  },
};
function tfEngine() {
  'use strict';
  const normCdf = z => {
    const t = 1 / (1 + 0.2316419 * Math.abs(z)), d = 0.3989423 * Math.exp(-z * z / 2);
    const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
    return z > 0 ? 1 - p : p;
  };
  /** Dodatak za zvezde: vrh raste nelinearno (S = skala bazena), negativne vrednosti ostaju iste */
  const star = (v, S, pow) => (v > 0 && S > 0 ? S * Math.pow(v / S, pow) : v);
  /** Vrednost kategorije iz vektora zbira: c { k, m, a, pct } (indeksi u vektoru) */
  const catVal = (v, c) => (c.pct ? (v[c.a] > 0 ? v[c.m] / v[c.a] : null) : v[c.k]);
  const add = (out, v, s = 1) => { for (let i = 0; i < out.length; i++) out[i] += s * v[i]; return out; };
  const sumVec = (list, n) => { const o = new Float64Array(n); for (const v of list) add(o, v); return o; };
  /** Rezultat strane: tim pre i posle po kategoriji (kao analiza trejda; nerešeno ispod praga) -> { win, lose, res[] } */
  function sideResult(before, after, cats, idx, tie) {
    let win = 0, lose = 0; const res = new Array(cats.length).fill(0);
    for (const i of idx) {
      const c = cats[i], b = catVal(before, c), a = catVal(after, c);
      if (a == null || b == null) continue;
      const d = a - b, th = c.ratio ? tie.ratio : c.pct ? tie.pct : tie.count;
      if (Math.abs(d) < th - 1e-12) continue;
      const r = (c.low ? d < 0 : d > 0) ? 1 : -1;
      res[i] = r; if (r > 0) win++; else lose++;
    }
    return { win, lose, res };
  }
  /** Filter kategorija iz ugla protivnika: porazi minus pobede najviše maxDiff (nerešeno se ne broji) */
  const catFilterOk = (r, maxDiff) => r.lose - r.win <= maxDiff;
  /** Očekivane pobede protiv ostalih timova (prosek po protivniku, uz težine) */
  function expWins(tot, opps, cats, idx, sd, w) {
    let total = 0; const by = new Float64Array(cats.length);
    if (!opps.length) return { total, by };
    for (const i of idx) {
      const c = cats[i], v = catVal(tot, c), wi = w ? w[i] : 1;
      if (v == null || !wi) continue;
      let e = 0;
      for (const o of opps) { const ov = catVal(o, c); if (ov == null) { e += 0.5; continue; } const z = (v - ov) / (sd[i] || 1); e += normCdf(c.low ? -z : z); }
      by[i] = e / opps.length; total += by[i] * wi;
    }
    return { total, by };
  }
  /** Razlika vrednosti posle korekcija, u odnosu na veću stranu (0 = isto). a, b: šta svaka strana dobija */
  const valueGap = (a, b) => { const m = Math.max(a, b); return m > 0 ? Math.abs(a - b) / m : 1; };
  /** Korekcija za neravnomeran trejd: strana koja dobija više igrača otpušta najslabije (posle trejda), druga dobija najbolje slobodne.
      roster: [{ i, v }] aktivni (bez IR) rastuće po v; out: Set indeksa koji odlaze; inc: [{ v, ... }] koji dolaze; d: koliko otpušta -> izbačeni [{ v, ... }] */
  // slabiji: manja vrednost do kraja sezone, pa manja vrednost po utakmici (t)
  // redosled otpuštanja: prvo pravi kandidati za otpust (Trejd kandidat poslednji), najslabiji po stvarnoj vrednosti (bez nje po ceni)
  const wk = (a, b) => (a.tc ? 1 : 0) - (b.tc ? 1 : 0) || (a.rv ?? a.v) - (b.rv ?? b.v) || a.v - b.v || (a.t || 0) - (b.t || 0);
  function weakest(roster, out, inc, d) {
    if (d <= 0) return [];
    const pool = [];
    for (const x of roster) { if (!out.has(x.i)) pool.push(x); if (pool.length >= d) break; }
    for (const x of inc) pool.push(x);
    return pool.sort(wk).slice(0, d);
  }
  /** Sve kombinacije od 1 do maxK igrača iz cands (indeksi), uz obavezne (req) -> [[indeksi]] */
  function combos(cands, req, maxK) {
    const free = cands.filter(i => !req.includes(i)), out = [];
    if (req.length > maxK) return out;
    const pick = (start, cur, left) => {
      if (left === 0) { if (cur.length || req.length) out.push([...req, ...cur]); return; }
      for (let j = start; j <= free.length - left; j++) { cur.push(free[j]); pick(j + 1, cur, left - 1); cur.pop(); }
    };
    for (let k = Math.max(1, req.length); k <= maxK; k++) pick(0, [], k - req.length);
    return out;
  }
  /** Redosled: korist (score), pa korist za protivnika, pa manje igrača */
  const cmpRank = (x, y) => (Math.abs(y.s - x.s) > 1e-6 ? y.s - x.s : Math.abs(y.ob - x.ob) > 1e-6 ? y.ob - x.ob : x.n - y.n);
  /** Bliže fer prvo: uzmi stepen sa većim odstupanjem tek kad prethodnih nema dovoljno */
  function orderTiers(tiers, enough, keep) {
    let out = [];
    for (const list of tiers) { if (out.length >= enough) break; out = out.concat(list.sort(cmpRank)); }
    return out.slice(0, keep);
  }

  /**
   * Pretraga. inp: { pts, n (dužina vektora), cats [{ key, k, m, a, pct, low, ratio }], myIdx, oppIdx (kategorije za moj / njegov rezultat),
   *   fIdx (FPts u vektoru), mine / theirs [{ id, v (vrednost za ostatak sezone), vec, mark: 'lock'|'soft'|'trade'|null, ir }],
   *   fa [{ id, v, vec }] najbolji slobodni (ili nivo zamene) opadajuće, opps [vec] ostali timovi, sd [], w [] (moje težine), oppW [],
   *   limit [bez, sa] za izabrani klizač, limits [[bez, sa] po stepenu do izabranog], strategy, sell [id], buy [id], TF }
   * progress(0..1). -> { list: [{ g, r, md, od, mf, of, s, ob, n, tier, soft, ow }], stats }
   */
  function search(inp, progress = () => {}) {
    const T = inp.TF, n = inp.n, cats = inp.cats, pts = inp.pts;
    const MS = inp.maxSide || T.MAX_SIDE; // najviše igrača po strani (Mete za trejd: 2)
    const strat = inp.strategy || 'best';
    const mine = inp.mine, theirs = inp.theirs;
    const usable = (list, x) => x.mark !== 'lock' && (!x.ir || x.mark === 'trade');
    // igrač van do kraja sezone ne ulazi u predloge (ni moj ni njegov), osim ako je obeležen sa U trejd; ostali povređeni ulaze sa vrednošću posle povratka
    const fit = x => usable(null, x) && (!x.gone || x.mark === 'trade');
    const mC = mine.map((x, i) => i).filter(i => fit(mine[i])), tC = theirs.map((x, i) => i).filter(i => fit(theirs[i]));
    const mReq = mC.filter(i => mine[i].mark === 'trade'), tReq = tC.filter(i => theirs[i].mark === 'trade');
    const hasTrade = mReq.length + tReq.length > 0;
    const stats = { shapes: {}, conv: 0, pairs: 0, value: 0, cats: 0, gain: 0, strat: 0, myCombos: 0, theirCombos: 0, reqTooMany: mReq.length > MS || tReq.length > MS };
    const mCombos = combos(mC, mReq, MS), tCombos = combos(tC, tReq, MS);
    stats.myCombos = mCombos.length; stats.theirCombos = tCombos.length;
    // zbir tima: svi aktivni (bez IR); otpuštanje: samo igrači koji ispunjavaju pravila (drop: vlasništvo, slabiji od slobodnih, nije zaključan ni na IR)
    const myTot = sumVec(mine.filter(x => !x.ir).map(x => x.vec), n), thTot = sumVec(theirs.filter(x => !x.ir).map(x => x.vec), n);
    const dropOk = x => (x.drop ?? (!x.ir && x.mark !== 'lock'));
    const myRoster = mine.map((x, i) => ({ i, id: x.id, v: x.v, rv: x.rv, tc: x.tc, t: x.t, vec: x.vec })).filter(x => dropOk(mine[x.i])).sort(wk);
    const thRoster = theirs.map((x, i) => ({ i, id: x.id, v: x.v, rv: x.rv, tc: x.tc, gone: x.gone, t: x.t, vec: x.vec })).filter(x => dropOk(theirs[x.i])).sort(wk);
    const maxDiff = strat === 'cons' || strat === 'depth' ? T.MAX_DIFF_WIDE : T.MAX_DIFF;
    const myTopRule = ['best', 'cats', 'buy', 'cons'].includes(strat);
    const topI = inp.topId != null ? theirs.findIndex(x => x.id === inp.topId) : -1;
    // kazna za veličinu: ukupno igrača iznad 2; Konsolidacija i Dubina gledaju veću stranu (iznad 2, dvostruko), pa 2:1, 3:1 i 3:2 i dalje izlaze
    const wide = strat === 'cons' || strat === 'depth';
    const sizeStep = wide ? (pts ? T.SIZE_PEN_WIDE_PTS : T.SIZE_PEN_WIDE) : (pts ? T.SIZE_PEN_PTS : T.SIZE_PEN);
    const sizePen = (kG, kR) => sizeStep * (wide ? 3 * Math.max(0, Math.max(kG, kR) - 2) : Math.max(0, kG + kR - 2));
    const myBase = pts ? null : expWins(myTot, inp.opps, cats, inp.myIdx, inp.sd, inp.w);
    const fa = inp.fa, faV = k => fa.slice(0, k).reduce((s, x) => s + x.v, 0);
    const lim = inp.limits; // [[bez, sa], ...] po stepenu
    const maxL = lim[lim.length - 1][hasTrade ? 1 : 0];
    const sell = new Set(inp.sell || []), buy = new Set(inp.buy || []);
    const focus = new Set(inp.focus || []);
    const softPen = pts ? T.SOFT_PENALTY_PTS : T.SOFT_PENALTY, formBonus = pts ? T.FORM_BONUS * 10 : T.FORM_BONUS;
    const minGain = pts ? T.MIN_GAIN_PTS : T.MIN_GAIN;
    // njihove kombinacije po broju igrača, sortirane po zbiru vrednosti (za brzo traženje prozora vrednosti)
    const byK = {};
    for (const c of tCombos) { const k = c.length; (byK[k] || (byK[k] = [])).push({ c, v: c.reduce((s, i) => s + theirs[i].v, 0), top: Math.max(...c.map(i => theirs[i].v)) }); }
    for (const k of Object.keys(byK)) byK[k].sort((a, b) => a.v - b.v);
    const lowerBound = (arr, x) => { let lo = 0, hi = arr.length; while (lo < hi) { const mid = (lo + hi) >> 1; if (arr[mid].v < x) lo = mid + 1; else hi = mid; } return lo; };
    // gruba korekcija po (kG, kR): najslabiji sa trenutnog rostera i najbolji slobodni (tačno se računa kasnije)
    const roughDrop = (roster, d) => roster.slice(0, d).reduce((s, x) => s + x.v, 0);
    const tiers = lim.map(() => []);
    const W = 1 + T.WINDOW_MARGIN;
    let done = 0;
    /** Igrači koje dajem: zbir, najbolji, IR mesta, "Dajem ako mora" */
    const gInfo = g => { const gTopI = g.reduce((b, i) => (b == null || mine[i].v > mine[b].v ? i : b), null);
      return { kG: g.length, gV: g.reduce((s, i) => s + mine[i].v, 0), gSet: new Set(g), gAct: g.filter(i => !mine[i].ir).length, gSoft: g.some(i => mine[i].mark === 'soft'), gTopI, gTop: mine[gTopI].v }; };
    /** Dozvoljen oblik trejda za strategiju (broj igrača, Konsolidacija, Dubina, "Ne otpuštam nikoga") */
    const shapeOk = (kG, kR) => kG >= 1 && kR >= 1 && kG <= MS && kR <= MS && !(strat === 'cons' && !(kG > kR)) && !(strat === 'depth' && !(kR > kG))
      && !(inp.noDrop && kR > kG) && Math.abs(kR - kG) <= maxDiff;
    /** Ocena para (g, r) po svim pravilima -> { x: predlog ili null, myDrop, thDrop (ko bi bio otpušten, kad se stigne do toga) } */
    function evalPair(g, r, P, rV, rTop, quiet = false) {
      const { kG, gV, gSet, gAct, gSoft, gTopI, gTop } = P, kR = r.length, R = { x: null, myDrop: null, thDrop: null };
      // Mete za trejd: meta je najvredniji igrač kog dobijam (po ceni na tržištu)
      if (topI >= 0 && r.some(i => i !== topI && (theirs[i].mk ?? -Infinity) > (theirs[topI].mk ?? -Infinity))) return R;
      // najbolji igrač u trejdu: moj ne sme biti znatno bolji od najboljeg kog dobijam (Prodaj skupo: samo ako mu je forma iznad vrednosti); obrnuto za protivnika
      if (gTop > 0 && rTop < gTop * (1 - T.TOP_TOL)) { if (myTopRule) return R; if (strat === 'sell' && !sell.has(mine[gTopI].id)) return R; }
      if (rTop > 0 && gTop < rTop * (1 - T.TOP_TOL_OPP)) return R;
      // povređeni koji sme na IR, a primalac ima slobodno IR mesto: ide na IR (ne zauzima aktivno mesto i ne traži otpuštanje)
      const irR = inp.myIrFree > 0 ? r.filter(i => !theirs[i].ir && theirs[i].irOk).slice(0, inp.myIrFree) : [];
      const irG = inp.thIrFree > 0 ? g.filter(i => !mine[i].ir && mine[i].irOk).slice(0, inp.thIrFree) : [];
      const rOut = r.filter(i => !theirs[i].ir).length;
      const myD0 = rOut - gAct, thD0 = gAct - rOut; // trajno (kad se povređeni vrati): >0 ta strana otpušta; <0 dobija slobodna mesta
      const myD = myD0 - irR.length, thD = thD0 - irG.length; // sada (povređeni na IR-u)
      // privremeno mesto (dok je povređeni na IR-u) vredi samo za taj deo utakmica: udeo = 1 - deo utakmica posle povratka
      const wOf = (ids, side) => (ids.length ? ids.reduce((a, i) => a + (1 - (side[i].fr ?? 1)), 0) / ids.length : 0);
      const wR = wOf(irR, theirs), wG = wOf(irG, mine);
      // tačna korekcija: najslabiji posle trejda, najbolji slobodni
      // dolazeći igrači ulaze u izbor za otpuštanje samo ako ispunjavaju pravila; ako bi bili otpušteni, trejd se odbacuje (niko ne dobija igrača kog bi odmah otpustio)
      const rInc = r.filter(i => !theirs[i].ir && !irR.includes(i) && dropOk({ ...theirs[i], mark: null })).map(i => ({ v: theirs[i].v, rv: theirs[i].rv, tc: theirs[i].tc, t: theirs[i].t, vec: theirs[i].vec, id: theirs[i].id, inc: true }));
      const gInc = g.filter(i => !mine[i].ir && !irG.includes(i) && dropOk({ ...mine[i], mark: null })).map(i => ({ v: mine[i].v, rv: mine[i].rv, tc: mine[i].tc, t: mine[i].t, vec: mine[i].vec, id: mine[i].id, inc: true }));
      // otpuštanja: najslabiji odmah, a jači od njih tek kad se povređeni vrati sa IR-a (do tada igra)
      const myDrop = myD0 > 0 ? weakest(myRoster, gSet, rInc, myD0) : [];
      const thDrop = thD0 > 0 ? weakest(thRoster, new Set(r), gInc, thD0) : [];
      if (myDrop.length < Math.max(0, myD0) || thDrop.length < Math.max(0, thD0)) return R; // nema koga da otpusti
      R.myDrop = myDrop; R.thDrop = thDrop;
      // dodatak koji bi primalac odmah otpustio nije pravi trejd
      if (myDrop.some(x => x.inc) || thDrop.some(x => x.inc)) return R;
      // Trejd kandidat se ne otpušta: trejd prolazi samo ako ga pretvaranje prebaci na drugu stranu
      if (myDrop.some(x => x.tc) || thDrop.some(x => x.tc)) return R;
      const myFa = myD < 0 ? fa.slice(0, -myD) : [], thFa = thD < 0 ? fa.slice(0, -thD) : [];
      const myNow = Math.max(0, myD), thNow = Math.max(0, thD), myFaP = Math.max(0, -myD0), thFaP = Math.max(0, -thD0);
      // težina: otpušteni kasnije igra deo utakmica dok je povređeni na IR-u; privremeni slobodan igrač samo taj deo
      const myDw = k => (k < myNow ? 1 : 1 - wR), thDw = k => (k < thNow ? 1 : 1 - wG), myFw = k => (k < myFaP ? 1 : wR), thFw = k => (k < thFaP ? 1 : wG);
      const A = rV - myDrop.reduce((s, x, k) => s + x.v * myDw(k), 0) + myFa.reduce((s, x, k) => s + x.v * myFw(k), 0);
      const Bx = gV - thDrop.reduce((s, x, k) => s + x.v * thDw(k), 0) + thFa.reduce((s, x, k) => s + x.v * thFw(k), 0);
      const gap = valueGap(A, Bx);
      let tier = -1;
      for (let ti = 0; ti < lim.length; ti++) if (gap <= lim[ti][hasTrade ? 1 : 0] + 1e-12) { tier = ti; break; }
      if (tier < 0) return R;
      if (!quiet) stats.value++;
      // timovi posle trejda (po utakmici)
      const myAfter = new Float64Array(myTot), thAfter = new Float64Array(thTot);
      // IR igrači nisu u zbiru tima (ni pre ni posle): i kod novog tima idu na IR
      for (const i of g) if (!mine[i].ir) { add(myAfter, mine[i].vec, -1); add(thAfter, mine[i].vec); }
      for (const i of r) if (!theirs[i].ir) { add(thAfter, theirs[i].vec, -1); add(myAfter, theirs[i].vec); }
      myDrop.forEach((x, k) => add(myAfter, x.vec, -myDw(k)));
      thDrop.forEach((x, k) => add(thAfter, x.vec, -thDw(k)));
      // prazna mesta u zbiru tima: najbolji slobodan igrač (uvezena liga) ili nivo zamene (bez lige i manuelne lige), kao u analizi trejda
      myFa.forEach((x, k) => add(myAfter, x.vec, myFw(k)));
      thFa.forEach((x, k) => add(thAfter, x.vec, thFw(k)));
      // filter iz ugla protivnika
      let ob, ow = [];
      if (pts) {
        const fd = thAfter[inp.fIdx] - thTot[inp.fIdx];
        if (fd < -T.PTS_MAX_LOSS) return R;
        ob = fd;
      } else {
        const or = sideResult(thTot, thAfter, cats, inp.oppIdx, T.TIE);
        if (!catFilterOk(or, T.CAT_MAX_DIFF)) return R;
        ob = 0; for (const i of inp.oppIdx) { ob += or.res[i] * (inp.oppW[i] ?? 1); if (or.res[i] > 0) ow.push(i); }
      }
      if (!quiet) stats.cats++; if (!quiet) { const sh = `${kG}:${kR}`; stats.shapes[sh] = (stats.shapes[sh] || 0) + 1; } // dijagnostika: oblici koji prolaze fer granicu i filter kategorija
      // korist za moj tim
      let gain;
      if (pts) gain = myAfter[inp.fIdx] - myTot[inp.fIdx];
      else if (inp.opps.length) {
        const aw = expWins(myAfter, inp.opps, cats, inp.myIdx, inp.sd, inp.w);
        gain = aw.total - myBase.total;
        if (strat === 'cats' && focus.size) { let bad = false; for (const i of inp.myIdx) if (!focus.has(i) && aw.by[i] - myBase.by[i] < -T.KEEP_DROP) { bad = true; break; } if (bad) return R; }
      } else {
        const mr = sideResult(myTot, myAfter, cats, inp.myIdx, T.TIE);
        gain = 0; let fine = 0;
        for (const i of inp.myIdx) {
          gain += mr.res[i] * (inp.w ? inp.w[i] : 1);
          const c = cats[i], bv = catVal(myTot, c), av = catVal(myAfter, c);
          if (bv != null && av != null) fine += Math.max(-2, Math.min(2, (av - bv) / inp.sd[i] * (c.low ? -1 : 1)));
        }
        gain += 0.05 * fine / (inp.myIdx.length || 1); // bez lige: rezultat po kategorijama, a za iste rezultate veća razlika u kategorijama
      }
      if (!(gain > minGain)) return R;
      // rezultat na kartici (moj tim pre i posle) bar nerešen; Popravi kategorije sme gore (namerno žrtvuje kategorije)
      if (!pts && strat !== 'cats') { const mr = sideResult(myTot, myAfter, cats, inp.myIdx, T.TIE); if (mr.win < mr.lose) return R; }
      if (pts && myAfter[inp.fIdx] - myTot[inp.fIdx] < 0) return R;
      if (!quiet) stats.gain++;
      let s = gain - sizePen(kG, kR);
      // povređeni: blage prednosti u rangu (pritisak na roster, plasman, slobodno IR mesto); glavna situacija ide u "Zašto bi prihvatio"
      const IJ = T.INJ, SB = inp.sit, bm = pts ? 10 : 1;
      let sit = null, sitB = 0;
      const bump = (k, b) => { if (!(b > 0)) return; s += b * bm; if (b > sitB) { sitB = b; sit = k; } };
      const rInj = r.some(i => theirs[i].out && !theirs[i].gone), gInj = g.some(i => mine[i].out && !mine[i].gone);
      const rShortIR = !!IJ && irR.some(i => theirs[i].wk != null && theirs[i].wk <= IJ.SHORT_WEEKS);
      if (IJ && SB && rInj) {
        if (SB.oppPressure) bump('pressure', IJ.B_PRESSURE);
        if (SB.oppContend && g.some(i => !mine[i].out)) bump('contend', IJ.B_CONTEND);
        if (SB.oppBottom) bump('rebuild', IJ.B_REBUILD);
      }
      if (rShortIR) bump('myir', strat === 'buy' ? IJ.B_BUY : IJ.B_MY_IR);
      if (IJ && SB && gInj && SB.myPressure && irG.length) bump('sellmy', IJ.B_SELL_MY);
      if (strat === 'sell') { const k = g.filter(i => sell.has(mine[i].id)).length; if (!k) return R; s += formBonus; }
      // Kupi jeftino: igrač u lošoj formi ili dobar igrač sa kratkom povredom koji ide na moj slobodan IR
      if (strat === 'buy') { const k = r.filter(i => buy.has(theirs[i].id)).length; if (!k && !rShortIR) return R; if (k) s += formBonus; }
      if (gSoft) s -= softPen;
      if (!quiet) stats.strat++;
      R.x = { g: g.map(i => mine[i].id), r: r.map(i => theirs[i].id), md: myDrop.map(x => x.id), od: thDrop.map(x => x.id),
        mf: myFa.length, of: thFa.length, s, gain, ob, n: kG + kR, tier, soft: gSoft, ow,
        irIn: irR.map(i => theirs[i].id), irOut: irG.map(i => mine[i].id), sit,
        // kasnija otpuštanja (poslednja u md/od) i privremena slobodna mesta (poslednja u mf/of), sa udelom utakmica dok je povređeni na IR-u
        mdl: myDrop.length - myNow, odl: thDrop.length - thNow, mft: myFa.length - myFaP, oft: thFa.length - thFaP, wr: wR, wg: wG,
        core: core(g, mine) + '|' + core(r, theirs), top: gTopI, rtop: r.reduce((b, i) => (b == null || theirs[i].v > theirs[b].v ? i : b), null), shape: `${kG}:${kR}` };
      return R;
    }
    /** Otpušteni igrači ulaze u trejd umesto na waiver: igrač kog bi strana otpustila, a drugoj strani vredi više od njene zamene sa waivera,
        ide drugoj strani (bez popune slobodnog mesta). Pretvoreni trejd prolazi sva pravila ponovo; Konsolidacija i Dubina zadržavaju svoj oblik. */
    function convert(g, r, R) {
      const slotV = fa[0] ? fa[0].v : 0, by = (a, b) => b.v - a.v;
      if (!R.myDrop || !R.thDrop || R.myDrop.some(x => x.inc) || R.thDrop.some(x => x.inc)) return null;
      let addR = R.thDrop.filter(x => !x.gone && (x.tc || x.v > slotV)).sort(by), addG = R.myDrop.filter(x => x.tc || x.v > slotV).sort(by);
      if (strat === 'cons') addR = addR.slice(0, Math.max(0, g.length - r.length - 1)); // i dalje dajem više igrača
      if (strat === 'depth') addG = addG.slice(0, Math.max(0, r.length - g.length - 1)); // i dalje dobijam više igrača
      if (!addR.length && !addG.length) return null;
      const g2 = [...g, ...addG.map(x => x.i)], r2 = [...r, ...addR.map(x => x.i)];
      if (!shapeOk(g2.length, r2.length)) return null;
      const x = evalPair(g2, r2, gInfo(g2), r2.reduce((s, i) => s + theirs[i].v, 0), Math.max(...r2.map(i => theirs[i].v)), true).x;
      if (x) { x.conv = true; stats.conv++; }
      return x;
    }
    for (const g of mCombos) {
      if (++done % 200 === 0) progress(done / mCombos.length);
      const P = gInfo(g), kG = P.kG, gV = P.gV;
      for (let kR = 1; kR <= MS; kR++) {
        const arr = byK[kR]; if (!arr) continue;
        if (!shapeOk(kG, kR)) continue; // Konsolidacija, Dubina, "Ne otpuštam nikoga", razlika u broju igrača
        const d0 = kR - kG;
        const myAdjR = d0 > 0 ? -roughDrop(myRoster, d0) : d0 < 0 ? faV(-d0) : 0;
        const oppAdjR = d0 > 0 ? faV(d0) : d0 < 0 ? -roughDrop(thRoster, -d0) : 0;
        const B = gV + oppAdjR; // šta on (grubo) dobija
        if (!(B > 0)) continue;
        // |A − B| ≤ L × max(A, B), A = rV + myAdj: rV između B(1 − L) − myAdj i B / (1 − L) − myAdj (uz rezervu)
        const L = Math.min(0.95, maxL * W + T.WINDOW_MARGIN);
        const lo = B * (1 - L) - myAdjR - Math.abs(myAdjR) * 0.5 - Math.abs(oppAdjR) * 0.5, hi = B / (1 - L) - myAdjR + Math.abs(myAdjR) * 0.5 + Math.abs(oppAdjR) * 0.5;
        for (let j = lowerBound(arr, lo); j < arr.length && arr[j].v <= hi; j++) {
          const r = arr[j].c;
          stats.pairs++;
          const R = evalPair(g, arr[j].c, P, arr[j].v, arr[j].top);
          const x = (R.myDrop?.length || R.thDrop?.length ? convert(g, arr[j].c, R) : null) || R.x; // pretvoreni trejd umesto originalnog, ako prolazi
          if (!x) continue;
          const tier = x.tier;
          tiers[tier].push(x);
          if (tiers[tier].length > 12000) { tiers[tier].sort(cmpRank); tiers[tier].length = T.KEEP * 10; }
        }
      }
    }
    progress(1);
    // strane od 8: raznovrsnost i najviše 2 trejda gde dobijam više igrača (Najbolje za mene, Popravi kategorije, Prodaj skupo, Kupi jeftino) zajedno, po strani
    const list = paginate(orderTiers(tiers, T.ENOUGH, Infinity), T.PER_PAGE, 3, T.GET_MORE_STRATS.includes(strat) ? T.GET_MORE_MAX : null, T.KEEP, T.GET_MORE_STRATS.includes(strat) ? T.GIVE_MORE_MAX : null);
    return { list: list.slice(0, T.KEEP), stats, hasTrade };
  }
  /** Jezgro trejda: igrači koji nešto vrede (ili su označeni za trejd); dodaci bez vrednosti ne prave novi predlog */
  const core = (idx, side) => idx.filter(i => side[i].v > 0 || side[i].mark === 'trade').map(i => side[i].id).sort().join(',');
  /** Slaganje strana od per predloga, redom po rangu, uz pravila koja važe na svakoj strani posebno:
      isto jezgro samo jednom; najviše cap predloga sa istim glavnim igračem kog daješ, istim kog dobijaš i istog oblika (raznovrsnost);
      najviše moreCap trejdova gde dobijam više igrača (null = bez ograničenja).
      Kad strana ne može da se popuni: prvo popuštaju raznovrsnost, pa ograničenje za više dobijenih igrača (bolje 8 predloga nego manje).
      keep: koliko predloga ukupno (ostali se ne slažu). */
  function paginate(list, per = 8, cap = 3, moreCap = null, keep = Infinity, lessCap = null) {
    const seen = new Set(), pool = [];
    for (const x of list) { if (x.core != null) { if (seen.has(x.core)) continue; seen.add(x.core); } pool.push(x); }
    const more = x => !!(x.r && x.g && x.r.length > x.g.length), less = x => !!(x.r && x.g && x.g.length > x.r.length), keys = x => [`g${x.top}`, `r${x.rtop}`, `s${x.shape}`];
    const used = new Uint8Array(pool.length), out = [];
    let first = 0;
    while (out.length < pool.length && out.length < keep) {
      const page = [], cnt = new Map(); let nm = 0, nl = 0;
      for (const [div, mc] of [[true, true], [false, true], [false, false]]) {
        for (let i = first; i < pool.length && page.length < per; i++) {
          if (used[i]) continue;
          const x = pool[i];
          if (mc && moreCap != null && more(x) && nm >= moreCap) continue;
          if (mc && lessCap != null && less(x) && nl >= lessCap) continue;
          if (div && keys(x).some(k => (cnt.get(k) || 0) >= cap)) continue;
          used[i] = 1; page.push(x); if (more(x)) nm++; if (less(x)) nl++;
          for (const k of keys(x)) cnt.set(k, (cnt.get(k) || 0) + 1);
        }
        if (page.length >= per) break;
      }
      while (first < pool.length && used[first]) first++;
      if (!page.length) break;
      out.push(...page);
    }
    return out;
  }
  /** Raznovrsnost (bez ograničenja za neravnomerne trejdove) i samo ograničenje 2 od 8 za više dobijenih igrača (bez raznovrsnosti): za testove */
  const diversify = (list, per = 8, cap = 3) => paginate(list, per, cap, null);
  const capGetMore = (list, per = 8, cap = 2) => paginate(list, per, Infinity, cap);
  /** Stranica rezultata (8 po 8, bez ponavljanja) */
  const pageItems = (list, page, per) => list.slice(page * per, page * per + per);
  return { star, sideResult, catFilterOk, expWins, valueGap, weakest, combos, orderTiers, cmpRank, search, pageItems, normCdf, diversify, capGetMore, paginate };
}
/** Tržišna vrednost po utakmici: z-score-ovi u bazenu (poolN igrača sa najvećim vlasništvom), težine W { GEN, PROD, MIN, OWN, RANK }.
    rows [{ id, gen (opšta vrednost), prod (PTS + REB + AST ili FPts), min, own (% vlasništva), rank (po vlasništvu) }]
    -> { score: Map(id -> ocena), repl (ocena nivoa zamene: prosek igrača oko mesta poolN), S (prosek pozitivnih ocena iznad zamene) } */
function tfMarket(rows, { W, poolN, teams, zMin = -2 }) {
  const comp = r => [r.gen || 0, r.prod || 0, r.min || 0, r.own || 0, -Math.log(r.rank || 9999)];
  const pool = [...rows].sort((a, b) => (b.own || 0) - (a.own || 0)).slice(0, poolN).map(comp);
  const K = [0, 1, 2, 3, 4], wv = [W.GEN, W.PROD, W.MIN, W.OWN, W.RANK];
  const mu = K.map(k => pool.reduce((s, c) => s + c[k], 0) / (pool.length || 1));
  const sd = K.map(k => Math.sqrt(pool.reduce((s, c) => s + (c[k] - mu[k]) ** 2, 0) / (pool.length || 1)) || 1);
  const score = new Map(rows.map(r => { const c = comp(r); return [r.id, K.reduce((s, k) => s + wv[k] * Math.max(zMin, (c[k] - mu[k]) / sd[k]), 0)]; }));
  const sorted = [...score.values()].sort((a, b) => b - a), band = sorted.slice(poolN, poolN + teams);
  const repl = band.length ? band.reduce((a, b) => a + b, 0) / band.length : (sorted[sorted.length - 1] ?? 0);
  const pos = sorted.slice(0, poolN).map(v => v - repl).filter(v => v > 0);
  return { score, repl, S: pos.length ? pos.reduce((a, b) => a + b, 0) / pos.length : 1 };
}
/** Ocene predloga: ključ predloga (alat, liga, igrači koje dajem i dobijam, bez redosleda) */
const tfRateKey = (tool, lgId, give, get) => `${tool}|${lgId || 'quick'}|${[...give].map(Number).sort((a, b) => a - b).join(',')}|${[...get].map(Number).sort((a, b) => a - b).join(',')}`;
/** Ocene predloga: { v: 1, items } + nova ocena -> { all, rating }. Ista ocena ponovo briše ocenu; nova zamenjuje staru za isti predlog;
    najviše max ocena (najstarija ispada). Ne menja ulaz. */
function tfRateApply(all, entry, max = 500) {
  const items = (all?.v === 1 && Array.isArray(all.items) ? all.items : []).filter(x => x.k !== entry.k);
  const old = (all?.items || []).find(x => x.k === entry.k);
  if (old && old.rating === entry.rating) return { all: { v: 1, items }, rating: 0 };
  items.push(entry);
  while (items.length > max) items.shift();
  return { all: { v: 1, items }, rating: entry.rating };
}
/** Broj nedelja iz vesti ("out two to three weeks", "re-evaluated in 10 days", "out at least a month") -> nedelje (sredina raspona) ili null */
const TF_NUM = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, couple: 2, few: 3, several: 4 };
function tfNewsWeeks(text) {
  const m = String(text || '').toLowerCase().match(/\b(?:out|miss|sidelined|return in|back in|re-?evaluated in|reassessed in)\b[^.]{0,30}?\b(\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|couple|few|several)(?:\s+of)?(?:\s*(?:-|to|or)\s*(\d+|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve))?\s*(?:more\s+|additional\s+)?(days?|weeks?|months?)\b/);
  if (!m) return null;
  const n = x => (x == null ? null : /^\d+$/.test(x) ? +x : TF_NUM[x]);
  const a = n(m[1]), b = n(m[2]), v = b != null ? (a + b) / 2 : a;
  if (!(v > 0)) return null;
  return m[3].startsWith('day') ? v / 7 : m[3].startsWith('month') ? v * 4.3 : v;
}
const TF_GONE = /\b(out for the (?:season|year|remainder)|season-ending|miss the (?:rest|remainder) of the season|stepping away from basketball|retire[sd]?|retirement)\b/i;
/** Povreda igrača koji je OUT: s { g (grupa statusa), ret ([godina, mesec, dan, van sezone] iz ESPN-a | 0 | undefined), news (tekst poslednje vesti), now, T (TF.INJ) }
    -> null (nije OUT) | { gone (van do kraja sezone), ret (ms), src: 'espn' | 'news' | 'default' } */
function tfInjury(s) {
  if (s.g !== 'OUT') return null;
  const T = s.T, day = 864e5, r = Array.isArray(s.ret) ? s.ret : null;
  if ((r && r[3]) || (s.news && TF_GONE.test(s.news))) return { gone: true, ret: null, src: r && r[3] ? 'espn' : 'news' };
  if (r && r[0] > 0) { const d = Date.UTC(r[0], r[1] - 1, r[2]); return { gone: false, ret: Math.max(d, s.now + T.PAST_DAYS * day), src: 'espn' }; }
  const w = tfNewsWeeks(s.news);
  if (w != null) return { gone: false, ret: s.now + w * 7 * day, src: 'news' };
  return { gone: false, ret: s.now + T.DEFAULT_WEEKS * 7 * day, src: 'default' };
}
/** Plejof: vraća se posle početka plejofa, a tim se bori za plejof -> PLAYOFF_LATE, inače 1 */
const tfLate = (inj, pStart, contend, T) => (pStart && inj && !inj.gone && inj.ret > pStart && contend ? T.PLAYOFF_LATE : 1);
/** Udeo preostalih utakmica koje igra: utakmice njegovog tima posle povratka / preostale utakmice (dates: datumi preostalih utakmica, ms) */
const tfInjFrac = (inj, dates) => (!inj ? 1 : inj.gone || !dates.length ? 0 : dates.filter(d => d > inj.ret).length / dates.length);
/** Sirova produkcija po utakmici: zbir statistike × težina (PROD_W); stavka koje nema u liniji = 0 */
const tfProd = (l, W) => Object.entries(W).reduce((s, [k, w]) => s + w * (+l?.[k] || 0), 0);
/** Tab Analize trejda za predlog (Sačuvaj / Otvori u analizi): sačuvani tab (savedId) ili tab sa istim igračima -> tab ili null.
    tabs [{ id, teams: [{ ids }, { ids }] }] (0 = Daješ, 1 = Dobijaš) */
function tfTabFor(tabs, g, r, savedId) {
  const key = (a, b) => `${[...a].sort().join(',')}|${[...b].sort().join(',')}`, k = key(g, r);
  return tabs.find(tb => savedId != null && tb.id === savedId) || tabs.find(tb => key(tb.teams[0].ids, tb.teams[1].ids) === k) || null;
}
/** Vrednost slobodnog mesta: prosek from. do to. najboljeg zdravog slobodnog igrača; igrač na waiveru sa umanjenjem wMul (vrednost i statistika).
    fas [{ id, v, vec, waiver }] zdravi slobodni, opadajuće po v -> { v, vec, picks: [{ id, w }] } ili null (premalo slobodnih) */
function tfSlotValue(fas, from, to, wMul) {
  const picks = fas.slice(from - 1, to);
  if (!picks.length) return null;
  const wOf = f => (f.waiver ? wMul : 1), n = picks.length;
  const v = picks.reduce((s, f) => s + (f.v >= 0 ? f.v * wOf(f) : f.v / wOf(f)), 0) / n; // umanjenje: pozitivna vrednost manja, negativna još manja
  const vec = picks[0].vec.map((_, i) => picks.reduce((s, f) => s + f.vec[i] * wOf(f), 0) / n);
  return { v, vec, picks: picks.map(f => ({ id: f.id, w: wOf(f) })) };
}
/** Sme li igrač da bude otpušten (moje i protivnikovo otpuštanje u Pronađi trejd): nije na IR ni zaključan, vlasništvo ispod praga
    i tržišna vrednost v manja od tržišne vrednosti najboljeg slobodnog igrača ili nivoa zamene (bar) */
const tfDropOk = (e, bar, maxOwn) => !e.ir && e.mark !== 'lock' && (e.own ?? 0) < maxOwn && (e.v ?? Infinity) < bar;
/** Savet za veto lige: igrač na granici rostera sa strane koja daje manje (nije u trejdu, nije zaključan ni na IR,
    vlasništvo ispod praga, tržišna vrednost v ispod najboljeg slobodnog / nivoa zamene (bar) i ispod nivoa zamene) -> najslabiji takav ili null */
function tfVetoPick(side, used, bar, maxOwn) {
  return side.filter(e => !used.has(e.id) && !e.ir && e.mark !== 'lock' && (e.own ?? 0) < maxOwn && (e.v ?? 0) < bar && (e.v ?? 0) < 0).sort((a, b) => a.v - b.v)[0] || null;
}
/** Savet za veto na stranici: picks [igrač za dopunu | null] po kartici -> Set indeksa kartica sa savetom
    (najviše max, gde je dopuna najočiglednija: najniža tržišna vrednost) */
function tfVetoShown(picks, max) {
  return new Set(picks.map((c, i) => ({ c, i })).filter(x => x.c).sort((a, b) => a.c.v - b.c.v).slice(0, max).map(x => x.i));
}
/* ==== kraj: Fer trejd, čiste funkcije ==== */

/* =====================================================================
   Mete za trejd: čiste funkcije (ponderi, ocena, stranice sa najviše 2 igrača istog vlasnika, lista želja, ulaz za mogući trejd).
   Testovi: tools/test_targets.js (zajedno sa delom Fer trejd).
   ===================================================================== */
const TT = {
  REFINE: 40,            // posle grubog rangiranja (ponderi 1 i 2) toliko kandidata dobija ostale pondere
  TRADE_MAX_SIDE: 2,     // mogući trejd u izveštaju: najviše 2 igrača sa svake strane
  PER_PAGE: 9,           // kartica po stranici na računaru (3 reda po 3)
  PER_PAGE_PHONE: 8,     // kartica po stranici na telefonu
  MAX_OWNER: 2,          // najviše igrača istog vlasnika na jednoj stranici
  // ponderi: ocena = zbir (jačina × deo od 0 do 1); glavni (cat do inj) su znatno jači od dodatnih (playoff do close)
  W: { cat: 1, unreach: 0.6, willing: 0.3, form: 0.25, cheap: 0.25, inj: 0.25, playoff: 0.08, stable: 0.06, fragile: 0.08, close: 0.08 },
  NEG: ['unreach', 'fragile'],   // ponderi koji oduzimaju
  UNREACH_OWNER: [1, 0.6],       // nedostižnost: najbolji i drugi igrač vlasnika po ceni na tržištu
  STAR_TOP: 15,                  // zvezda: među prvih toliko igrača lige po ceni (pun deo); do 2× toliko pola
  WILL: { surplus: 0.4, need: 0.3, pressure: 0.15, bottom: 0.15 }, // delovi spremnosti vlasnika (zbir najviše 1)
  TOP_THIRD: 1 / 3,              // jak / slab u kategoriji: gornja / donja trećina lige
  CAT_FULL: 0.05,                // korist: pun deo (1) od igrača na granici gornjih 5% kandidata naviše
  CHEAP_RANKS: 30,               // jeftina meta: po stvarnoj vrednosti ovoliko mesta iznad mesta po ceni na tržištu = pun deo
  STRONG_Z: 0.6,                 // igrač nosi kategoriju: z u mešavini perioda bar ovoliko
  FORM_FULL: 3, FORM_FULL_PTS: 5, // forma (15 i 7 dana minus sezona): pun deo kod ove razlike (z, ili FPts)
  MIN_UP: 4, MIN_FULL: 8,        // skok minuta (7 dana minus sezona): od 4 se računa, pun deo na 8
  MATE_OUT: 0.5,                 // saigrač na istoj poziciji je OUT: deo forme i uloge
  INJ_HIGH: 0.5,                 // "visoko na tabeli": u gornjoj polovini
  PLAYOFF_LOW: 0.5,              // utakmice u plejofu kad nisam visoko na tabeli: × ovo
  STABLE_CV: [0.12, 0.35],       // varijacija minuta (poslednjih 10): ispod prve granice pun deo, iznad druge 0
  STABLE_GAMES: 6,               // najmanje utakmica za stabilnost
  FRAGILE: [0.85, 0.6],          // udeo odigranih utakmica: iznad prve 0, ispod druge pun minus
  CLOSE_SD: 0.15,                // blizina: do sledećeg tima na tabeli kategorije manje od ovoliko SD-a
  SOLO_WEAK_W: 1.5,              // samo moj tim: težina slabih kategorija (ostale 1)
};
const ttClamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
/** Deo od 0 do 1: od "from" (0) do "full" (1); radi i kad je full < from (obrnuto) */
const ttUnit = (x, from, full) => (x == null || !Number.isFinite(x) ? null : ttClamp((x - from) / (full - from)));
/** Kandidati: igrači sa tuđih rostera (i IR), bez igrača van do kraja sezone. rosters: [{ owner, players: [{ id, ir }] }], gone: id -> bool */
function ttCandidates(rosters, gone = () => false) {
  const out = [], seen = new Set();
  for (const r of rosters) for (const x of r.players || []) {
    if (seen.has(x.id) || gone(x.id)) continue;
    seen.add(x.id); out.push({ id: x.id, owner: r.owner, ir: !!x.ir });
  }
  return out;
}
/** Nedostižnost 0..1: najbolji ili drugi igrač vlasnika po ceni, ili zvezda iz vrha lige */
function ttUnreach(ownerRank, leagueRank, T = TT) {
  const o = ownerRank >= 1 && ownerRank <= T.UNREACH_OWNER.length ? T.UNREACH_OWNER[ownerRank - 1] : 0;
  const s = leagueRank != null && leagueRank <= T.STAR_TOP ? 1 : leagueRank != null && leagueRank <= 2 * T.STAR_TOP ? 0.5 : 0;
  return Math.max(o, s);
}
/** Spremnost vlasnika 0..1. d: { surplus 0..1 (udeo igračevih kategorija u kojima je vlasnik jak), need 0..1 (udeo vlasnikovih slabih
    kategorija u kojima sam ja jak), pressure (više povređenih nego IR mesta), bottom (pri dnu tabele) } */
function ttWilling(d, T = TT) {
  const W = T.WILL;
  return ttClamp((d.surplus || 0) * W.surplus + (d.need || 0) * W.need + (d.pressure ? W.pressure : 0) + (d.bottom ? W.bottom : 0));
}
/** Forma i uloga 0..1: najjači od forme (razlika), skoka minuta i saigrača koji je OUT */
function ttForm(d, T = TT) {
  const f = ttUnit(d.formDiff, 0, d.pts ? T.FORM_FULL_PTS : T.FORM_FULL) ?? 0;
  const m = d.minUp != null && d.minUp >= T.MIN_UP ? ttUnit(d.minUp, 0, T.MIN_FULL) : 0;
  return Math.max(f, m, d.mateOut ? T.MATE_OUT : 0);
}
/** Povređeni kao investicija: 1 samo kad je povređen (nije van do kraja sezone), sme na IR, dobar je, a ja sam visoko i imam slobodno IR mesto */
const ttInjInvest = d => (d.out && !d.gone && d.irOk && d.good && d.myHigh && d.myIrFree > 0 ? 1 : 0);
/** Stabilnost minuta 0..1 iz minuta poslednjih utakmica (koeficijent varijacije); premalo utakmica = null (preskače se) */
function ttStable(mins, T = TT) {
  const xs = (mins || []).filter(v => Number.isFinite(v) && v > 0);
  if (xs.length < T.STABLE_GAMES) return null;
  const m = xs.reduce((a, b) => a + b, 0) / xs.length, sd = Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length);
  return ttUnit(sd / m, T.STABLE_CV[1], T.STABLE_CV[0]);
}
/** Krhkost 0..1 iz udela odigranih utakmica ove sezone (gp od n mogućih) */
const ttFragile = (gp, n, T = TT) => (n > 0 ? ttUnit(gp / n, T.FRAGILE[0], T.FRAGILE[1]) : null);
/** Ocena: zbir pondera (deo null = preskače se). parts { cat (−1..1), unreach, willing, form, cheap, inj, playoff, stable, fragile, close } -> { s, by: [{ k, c }] od najjačeg } */
function ttScore(parts, T = TT) {
  let s = 0; const by = [];
  for (const [k, v] of Object.entries(parts)) {
    if (v == null || !Number.isFinite(v)) continue;
    const c = (T.NEG.includes(k) ? -1 : 1) * (T.W[k] || 0) * v;
    s += c; by.push({ k, c });
  }
  return { s, by: by.sort((a, b) => b.c - a.c) };
}
/** Grubo rangiranje (ponderi 1 i 2) */
const ttCoarse = (cat, unreach, T = TT) => T.W.cat * cat - T.W.unreach * unreach;
/** Sledeća stranica: redom po oceni, bez već prikazanih, najviše maxOwner igrača istog vlasnika (bez vlasnika: bez ograničenja) */
function ttPage(list, shown = new Set(), per = TT.PER_PAGE, maxOwner = TT.MAX_OWNER) {
  const out = [], cnt = {};
  for (const x of list) {
    if (out.length >= per) break;
    if (shown.has(x.id)) continue;
    if (x.owner != null) { if ((cnt[x.owner] || 0) >= maxOwner) continue; cnt[x.owner] = (cnt[x.owner] || 0) + 1; }
    out.push(x);
  }
  return out;
}
/** Lista želja: { [liga]: [id] } -> nova lista sa dodatim ili uklonjenim igračem */
function ttWishToggle(all, scope, id) {
  const cur = new Set(all?.[scope] || []);
  if (cur.has(id)) cur.delete(id); else cur.add(id);
  return { ...(all || {}), [scope]: [...cur] };
}
const ttWishHas = (all, scope, id) => !!all?.[scope]?.includes(id);
/** Vlasnik igrača sa liste želja: 'mine' (moj tim), ključ protivnika, 'fa' (uvezena liga, niko ga nema) ili null. opps: { [ključ]: { players: [{ id }] } } */
function ttOwnerOf(id, myIds, opps, synced) {
  if (myIds.has(id)) return 'mine';
  const k = Object.keys(opps || {}).find(o => opps[o].players?.some(y => y.id === id));
  return k || (synced ? 'fa' : null);
}
/** Lista želja po koloni Vlasnik: abecedno (dir 'asc' A do Ž), bez vlasnika uvek na dnu, isti vlasnik po redu dodavanja */
function ttWishOrder(ids, nameOf, dir = 'asc') {
  const sg = dir === 'asc' ? 1 : -1;
  return ids.map((id, i) => ({ id, i, n: nameOf(id) || '' })).sort((a, b) => (!a.n) - (!b.n) || a.n.localeCompare(b.n) * sg || a.i - b.i).map(x => x.id);
}
/** Ulaz za mogući trejd: isti kao Pronađi trejd (Najbolje za mene, Fer), sa ovim igračem obeleženim U trejd */
function ttTradeInput(inp, id, mk = {}, T = TF) {
  return { ...inp, theirs: inp.theirs.map(x => ({ ...x, mark: x.id === id ? 'trade' : x.mark, mk: mk[x.id] ?? x.mk })), strategy: 'best', limits: [T.LIMITS.fair], focus: [], w: null,
    maxSide: TT.TRADE_MAX_SIDE, topId: id };
}
/** Samo moj tim (bez drugih timova): korist = zbir razlika z po kategoriji (ulazi umesto mog najslabijeg), slabe kategorije veća težina */
function ttSoloGain(byIn, byOut, weights) {
  let g = 0;
  for (const [k, w] of Object.entries(weights)) g += w * ((byIn?.[k] || 0) - (byOut?.[k] || 0));
  return g;
}
/** Režim: 'league' (ima drugih timova sa igračima) ili 'solo' (samo moj tim ili bez lige) */
const ttMode = (hasLeague, oppCount) => (hasLeague && oppCount > 0 ? 'league' : 'solo');
/* ==== kraj: Mete za trejd, čiste funkcije ==== */

/** Fantasy poeni po utakmici za jedan red statistike (null statistike, npr. DD u projekciji, ne donose poene).
 *  Liga na poene sa bonusima ili QD: kad imamo utakmice igrača, DD/TD/QD i bonus se računaju iz utakmica za isti period. */
function fptsOf(line, weights = FMT_ACTIVE.weights) {
  if (!line) return null;
  if (line._fpts != null && weights === FMT_ACTIVE.weights) return line._fpts; // mešavina perioda i nivo zamene: FPts već izračunati kao u Pronađi trejd
  if (weights !== FMT_ACTIVE.weights || line._pid == null) return fptsCalc(line, weights);
  return fptsCalc(line, weights, needsGames() ? playerAgg(line._pid, line._sid) : null) + platformAdj(line._pid, weights);
}
/** Sleeper liga: TF i FF po utakmici su sa ESPN-a, a prosek lige koristi Sleeperov zbir (oznaka uz kolonu u utakmicama profila) */
const srcMarkHTML = c => (['TF', 'FF'].includes(c.key) && isSynced() && currentLeague().import.adj
  ? ` <span class="src-mark" data-tip="${esc(t('Broj po utakmici je sa ESPN-a. Prosek lige koristi zbir sezone sa platforme {p}.', { p: srcName(currentLeague()) }))}">(ESPN)</span>` : '');
/** Sleeper liga: tehničke i flagrantne po Sleeperovoj statistici. Sleeper daje samo zbir sezone, pa se razlika
    u odnosu na ESPN (po utakmici) dodaje na prosek svakog perioda. Ostale lige: 0. */
function platformAdj(pid, weights) {
  const adj = currentLeague()?.import?.adj?.[pid];
  if (!adj || !(weights.TF || weights.FF)) return 0;
  const S = state.byId.get(pid)?.stats[PERIODS[0].statId(CONFIG.SEASON)];
  if (!S?.GP || !adj.gp) return 0;
  return (weights.TF || 0) * (adj.tf / adj.gp - (S.TF || 0)) + (weights.FF || 0) * (adj.ff / adj.gp - (S.FF || 0));
}
/* ---------- Utakmice za FPts: bonusi za prag i QD (ostalo stiže tačno iz ESPN proseka) ---------- */
const BONUS_DAYS = { l7: 7, l15: 15, l30: 30 };
/** Format traži utakmice: bonusi za prag ili četvorostruki dabl-dabl (ESPN polje 39 nismo mogli da proverimo, pa ga računamo sami) */
const needsGames = () => isPointsFmt() && (FMT_ACTIVE.bonus?.length > 0 || !!FMT_ACTIVE.weights.QD);
const perOfSid = sid => PERIODS.find(x => x.statId(CONFIG.SEASON) === sid)?.key;
/** Prosek iz utakmica za igrača i period (projekcija: cela sezona, kao procena); bez utakmica: sačuvan prosek (localStorage) */
function playerAgg(pid, sid) {
  const per = perOfSid(sid), games = state.gameLogs.get(pid);
  if (games) return periodAgg(games, FMT_ACTIVE.bonus, BONUS_DAYS[per] || null);
  return bonusAvgGet(pid, per === 'proj' ? 'season' : per);
}
/** Sačuvani proseci bonusa po igraču (za rang lige pre nego što se utakmice učitaju): { [formatKey]: { [pid]: { ts, season: agg, l7, l15, l30 } } } */
const BONUS_AVG_KEY = 'fbaTrade.bonusAvg.v1';
let bonusAvgMem = null;
const fmtKeyNow = () => encodeFormat(FMT_ACTIVE);
function bonusAvgGet(pid, per) {
  bonusAvgMem ||= lsGet(BONUS_AVG_KEY) || {};
  return bonusAvgMem[fmtKeyNow()]?.[pid]?.[per] || null;
}
function bonusAvgSave(ids) {
  bonusAvgMem ||= lsGet(BONUS_AVG_KEY) || {};
  const k = fmtKeyNow(), m = bonusAvgMem[k] || (bonusAvgMem[k] = {});
  for (const id of ids) {
    const g = state.gameLogs.get(id);
    if (!g) continue;
    m[id] = { ts: Date.now(), season: periodAgg(g, FMT_ACTIVE.bonus), l7: periodAgg(g, FMT_ACTIVE.bonus, 7), l15: periodAgg(g, FMT_ACTIVE.bonus, 15), l30: periodAgg(g, FMT_ACTIVE.bonus, 30) };
  }
  // najviše 3 formata, stariji se brišu
  const keys = Object.keys(bonusAvgMem);
  if (keys.length > 3) keys.filter(x => x !== k).slice(0, keys.length - 3).forEach(x => delete bonusAvgMem[x]);
  lsSet(BONUS_AVG_KEY, bonusAvgMem);
}
/** Igrači za koje trebaju utakmice: roster otvorene lige (moj i protivnici) i AKTIVNI tab trejda */
function bonusPlayerIds() {
  const r = state.rosters || {};
  const ids = new Set([...(r.my?.players || []), ...Object.values(r.opps || {}).flatMap(o => o.players || [])].map(x => x.id));
  for (const side of activeTab()?.teams || []) (side.ids || []).forEach(id => ids.add(id));
  return [...ids].filter(id => state.byId.has(id));
}
let bonusRun = false;
async function ensureBonusLogs() {
  if (bonusRun || !needsGames() || !state.byId?.size) return;
  const need = bonusPlayerIds().filter(id => !state.gameLogs.has(id));
  if (!need.length) return;
  bonusRun = true;
  try { await ensureLogs(need); bonusAvgSave(need); } finally { bonusRun = false; }
  render();
}
const bonusPending = () => needsGames() && (bonusRun || bonusPlayerIds().some(id => !state.gameLogs.has(id) && !bonusAvgGet(id, 'season')));
/** Oznaka "procena" uz FPts u projekciji (bonusi i retke stavke iz proseka sezone) */
const projEstimate = () => state.period === 'proj' && isPointsFmt() && (FMT_ACTIVE.bonus?.length > 0 || Object.keys(FMT_ACTIVE.weights).some(k => PROJ_FROM_SEASON.includes(k)));
const projEstHTML = () => (projEstimate() ? `<span class="i est" data-tip="${esc(t('Procena: projekcija nema bonuse, dabl-dablove ni retke stavke (tehničke, flagrantne...). Za njih uzimamo prosek po utakmici iz ove sezone.'))}">≈</span>` : '');

/* ---------- Keš utakmica (IndexedDB, po igraču) i povlačenje sa ESPN-a ----------
   Ponovo se povlači najviše jednom dnevno ili posle nove utakmice igrača (po rasporedu). Zahtevi idu jedan po jedan
   sa pauzom od 300 ms; posle greške ili 429 ESPN se ne zove 10 minuta i koristi se keš (i zastareo). */
const LOGS = { DB: 'rosterswing', STORE: 'gamelogs', PAUSE_MS: 300, BACKOFF_MS: 10 * 60e3, TEAMS_PER_CALL: 4, MAX_IDS: 40 };
const logNet = { calls: 0, bytes: 0, idb: 0, backoffUntil: 0 }; // brojač za proveru (window.logNet u konzoli)
let logDb = null;
function idbOpen() {
  if (logDb) return logDb;
  logDb = new Promise(res => {
    try {
      const rq = indexedDB.open(LOGS.DB, 1);
      rq.onupgradeneeded = () => rq.result.createObjectStore(LOGS.STORE, { keyPath: 'pid' });
      rq.onsuccess = () => res(rq.result);
      rq.onerror = () => res(null);
    } catch { res(null); }
  });
  return logDb;
}
async function idbGetMany(ids) {
  const db = await idbOpen(), out = new Map();
  if (!db) return out;
  await new Promise(res => {
    try {
      const tx = db.transaction(LOGS.STORE, 'readonly'), st = tx.objectStore(LOGS.STORE);
      for (const id of ids) { const rq = st.get(id); rq.onsuccess = () => { if (rq.result?.season === CONFIG.SEASON) out.set(id, rq.result); }; }
      tx.oncomplete = res; tx.onerror = res; tx.onabort = res;
    } catch { res(); }
  });
  return out;
}
async function idbPutMany(entries) {
  const db = await idbOpen();
  if (!db || !entries.length) return;
  await new Promise(res => {
    try {
      const tx = db.transaction(LOGS.STORE, 'readwrite'), st = tx.objectStore(LOGS.STORE);
      for (const e of entries) st.put(e);
      tx.oncomplete = res; tx.onerror = res; tx.onabort = res;
    } catch { res(); }
  });
}
const sleepMs = ms => new Promise(r => setTimeout(r, ms));
/** Jedan zahtev: utakmice igrača (games = ID-jevi utakmica ove sezone za filter); vraća Map pid -> [{ date, gid, line }] */
async function fetchLogsCall(ids, games, gameDate) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), CONFIG.FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(CONFIG.API_URL, { headers: { 'X-Fantasy-Filter': JSON.stringify(CONFIG.GAMELOG_FILTER(ids, games)) }, signal: ctrl.signal });
    logNet.calls++;
    if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status });
    const txt = await res.text();
    logNet.bytes += txt.length;
    const out = new Map();
    for (const raw of JSON.parse(txt).players || []) {
      const p = raw.player, list = [];
      for (const st of p.stats || []) {
        if (st.statSplitTypeId !== 5 || st.seasonId !== CONFIG.SEASON || !st.stats) continue;
        const date = gameDate.get(String(st.externalId));
        if (date == null) continue; // utakmica nije u rasporedu -> ne možemo pouzdano da je datiramo
        const line = {};
        for (const [k, sid] of Object.entries(STAT)) line[k] = +st.stats[sid] || 0;
        if (line.GP > 0) list.push({ date, gid: String(st.externalId), line }); // i nastup od par sekundi (0 min): ESPN ga broji u GP, pa i mi (inače broj ne odgovara i povlači se ponovo)
      }
      out.set(p.id, list.sort((a, b) => a.date - b.date));
    }
    return out;
  } finally { clearTimeout(timer); }
}
let logQueue = Promise.resolve();
/** Utakmice za igrače: memorija -> IndexedDB -> ESPN (samo što fali ili je zastarelo). Posle poziva state.gameLogs ima sve tražene (ili null kad nema podataka). */
function ensureLogs(ids) {
  const job = logQueue.then(() => ensureLogsNow([...new Set(ids)])).catch(e => console.warn('Utakmice:', e.message));
  logQueue = job;
  return job;
}
async function ensureLogsNow(ids) {
  if (!state.schedule) await loadSchedule().catch(() => null);
  const sched = state.schedule || {};
  const want = ids.filter(id => !state.gameLogs.has(id) || state.gameLogs.get(id) === null);
  if (!want.length) return;
  const cached = await idbGetMany(want);
  logNet.idb += cached.size;
  const fetchIds = [];
  for (const id of want) {
    const c = cached.get(id), p = state.byId.get(id);
    if (c) state.gameLogs.set(id, c.games); // i zastareo keš se odmah koristi
    if (!c || logsStale(c, sched[p?.tid])) fetchIds.push(id);
  }
  if (!fetchIds.length || !Object.keys(sched).length || Date.now() < logNet.backoffUntil) {
    for (const id of want) if (!state.gameLogs.has(id)) state.gameLogs.set(id, null);
    return;
  }
  const gameDate = new Map(Object.values(sched).flat().map(g => [String(g.id), g.date]));
  // po NBA timu (filter po utakmicama tima drastično smanjuje odgovor), do 4 tima po zahtevu
  const byTeam = new Map();
  for (const id of fetchIds) { const tid = state.byId.get(id)?.tid; const k = sched[tid] ? tid : 'x'; byTeam.set(k, [...(byTeam.get(k) || []), id]); }
  const groups = [], teams = [...byTeam.keys()].filter(k => k !== 'x');
  for (let i = 0; i < teams.length; i += LOGS.TEAMS_PER_CALL) {
    const tids = teams.slice(i, i + LOGS.TEAMS_PER_CALL), pids = tids.flatMap(k => byTeam.get(k));
    for (let j = 0; j < pids.length; j += LOGS.MAX_IDS) groups.push({ pids: pids.slice(j, j + LOGS.MAX_IDS), games: tids.flatMap(k => sched[k].map(g => +g.id)) });
  }
  if (byTeam.has('x')) groups.push({ pids: byTeam.get('x'), games: null });
  const save = [], redo = [];
  try {
    for (const [i, g] of groups.entries()) {
      if (i) await sleepMs(LOGS.PAUSE_MS);
      const got = await fetchLogsCall(g.pids, g.games, gameDate);
      for (const id of g.pids) {
        const list = got.get(id) || [];
        // promenio tim tokom sezone: utakmice za stari tim nisu u filteru, pa se igrač povlači bez filtera
        const gp = Math.round(state.byId.get(id)?.stats[PERIODS[0].statId(CONFIG.SEASON)]?.GP || 0);
        if (g.games && list.length < gp) { redo.push(id); continue; }
        state.gameLogs.set(id, list); save.push({ pid: id, season: CONFIG.SEASON, ts: Date.now(), games: list });
      }
    }
    if (redo.length) {
      await sleepMs(LOGS.PAUSE_MS);
      const got = await fetchLogsCall(redo, null, gameDate);
      for (const id of redo) { const list = got.get(id) || []; state.gameLogs.set(id, list); save.push({ pid: id, season: CONFIG.SEASON, ts: Date.now(), games: list }); }
    }
  } catch (e) {
    logNet.backoffUntil = Date.now() + LOGS.BACKOFF_MS; // greška ili 429: pauza, koristi se keš
    console.warn('Utakmice nisu učitane:', e.message);
  }
  await idbPutMany(save);
  for (const id of want) if (!state.gameLogs.has(id)) state.gameLogs.set(id, null); // ne pokušavaj u krug u ovoj sesiji
}
/** Statistike sa težinom kojih nema u projekciji (za napomenu u periodu Projekcija) */
const projMissing = () => (state.period === 'proj' ? CATS.filter(c => c.noProj).map(c => c.label) : []);
/** Napomena "Ne računa se: ..." (statistike lige koje nemamo + one kojih nema u projekciji) */
function notCountedList() {
  return [...FMT_ACTIVE.unsupported, ...projMissing().map(l => t('{s} (nema u projekciji)', { s: l })), ...(bonusPending() ? [t('bonusi po utakmici (učitavam utakmice…)')] : [])];
}
CATS.push(...FORMAT_PRESETS['9cat'].categories.map(id => catFromStat(id))); // do prvog syncCats: 9-cat
const notCountedHTML = () => { const l = notCountedList(); return l.length ? `<div class="score-note nc">${t('Ne računa se: {list}.', { list: esc(l.join(', ')) })}</div>` : ''; };



/* =====================================================================
   Jezik (SR / EN)
   Tekstovi u kodu su na srpskom; t() vraća engleski prevod iz rečnika EN
   (ključ = srpski tekst, {x} = vrednost). Nedostajući prevod -> srpski tekst.
   ===================================================================== */
const LANG_KEY = 'fbaTrade.lang.v1';
/**
 * Ugrađen alat na javnoj početnoj (/ i /sr/): samo brzo poređenje, jezik određuje stranica,
 * adresa se ne menja (hash ostaje za aplikaciju). window.RS_EMBED = { lang, app: '<putanja do /app/>' }
 */
const EMBED = window.RS_EMBED || null;
/** Javna početna za jezik, relativno od /app/ (sajt ne zavisi od osnovne putanje) */
const publicHome = () => (LANG === 'sr' ? '../sr/?home' : '../?home');      // logo u aplikaciji: početna bez preusmeravanja u ligu
const publicAnalyzer = () => (LANG === 'sr' ? '../sr/trade-analyzer/' : '../trade-analyzer/'); // analiza trejda bez lige
/** Link (?lang) > sačuvan izbor > browser: srpski za jezike regiona, inače engleski */
function detectLang() {
  if (EMBED) return EMBED.lang === 'sr' ? 'sr' : 'en';
  const q = new URLSearchParams(location.hash.slice(1)).get('lang');
  if (q === 'sr' || q === 'en') return q;
  try { const saved = JSON.parse(localStorage.getItem(LANG_KEY)); if (saved === 'sr' || saved === 'en') return saved; } catch {}
  const langs = (navigator.languages || [navigator.language || '']).map(l => String(l).toLowerCase());
  return langs.some(l => /^(sr|hr|bs|sh|cnr|me|mk|sl)\b/.test(l)) ? 'sr' : 'en';
}
let LANG = detectLang();
document.documentElement.lang = LANG;
/** Engleski prevodi (ključ = srpski tekst). Novi tekst u UI -> dodati i ovde. */
const EN = {
  "Analiza trejda": "Trade analyzer",
  "Dodaj tim": "Add team",
  "Dodaj tim u Ligi": "Add a team in League",
  "Izaberi protivnika sa kojim trejduješ.": "Pick the opponent you are trading with.",
  "Još nema unetih timova. Dodaj ih na stranici Liga.": "No teams entered yet. Add them on the League page.",
  "Kad uneseš bar 3 tima (sa svojim), uz svaki tim vidiš dve najjače i dve najslabije kategorije.": "Once you enter at least 3 teams (yours included), each team shows its two strongest and two weakest categories.",
  "Mesto i skor unosiš u podešavanjima lige.": "Enter your place and record in league settings.",
  "Mete za trejd": "Trade targets",
  "Moj tim ukratko": "My team at a glance",
  "Moje mesto": "My place",
  "Nazad na Pregled": "Back to Overview",
  "Nazad na Moj tim": "Back to My team",
  "Nazad na Ligu": "Back to League",
  "Nazad na Analizu trejda": "Back to Trade analysis",
  "Nazad na Istoriju trejdova": "Back to Trade history",
  "Nađi bolji trejd sa ovim timom": "Find a better trade with this team",
  "Nađi mete za slabe kategorije": "Find targets for weak categories",
  "Nađi trejd za njega": "Find a trade for him",
  "Nađi zamenu": "Find a replacement",
  "Nema otvorenih trejdova.": "No open trades.",
  "Nema upozorenja za tvoje igrače.": "No alerts for your players.",
  "Opcije": "Options",
  "Otvoreni trejdovi": "Open trades",
  "Otvori u analizi": "Open in Trade analyzer",
  "Pogledaj kako tim sada stoji": "See how your team looks now",
  "Poslednji trejdovi": "Recent trades",
  "Počni od svog tima": "Start with your team",
  "Pregled": "Overview",
  "Pronađi trejd": "Find a trade",
  "Proširi na druge timove": "Search other teams",
  "Roster protivnika": "Opponent roster",
  "Stranice lige": "League pages",
  "Sve lige": "All leagues",
  "Tabela lige": "Standings",
  "Trejduj ga": "Trade him",
  "Trejduj": "Trade",
  "Trejduj sa ovim timom": "Trade with this team",
  "Unesi igrače sa svog rostera ({a} aktivnih + {b} IR). Posle toga ovde vidiš kategorije tima, upozorenja i otvorene trejdove.": "Enter the players on your roster ({a} active + {b} IR). Then you will see your team categories, alerts and open trades here.",
  "Unesi još timova da vidiš gde si jak a gde slab": "Enter more teams to see where you are strong and weak",
  "Unesi svoj roster": "Enter your roster",
  "Uneto {a} od {b} timova": "{a} of {b} teams entered",
  "Upozorenja": "Alerts",
  "Otvori ovaj trejd u mojoj ligi": "Open this trade in my league",
  "U kojoj ligi da otvorim trejd?": "Which league should this trade open in?",
  "Trejd se otvara u novom tabu izabrane lige, sa istim stranama. Postojeći trejdovi ostaju netaknuti.": "The trade opens in a new tab of the chosen league, with the same sides. Your existing trades stay as they are.",
  "Uredi roster": "Edit roster",
  "Uredi roster u Ligi": "Edit roster in League",
  "Zbir aktivnih igrača. Uneto {a} od {b} timova.": "Sum of active players. {a} of {b} teams entered.",
  "jak": "strong",
  "slab": "weak",
  "{n}. od {m}": "{n} of {m}",
  "Želim ga": "I want him",
  "upravo": "just now",
  "pre {n} min": "{n} min ago",
  "pre {n} h": "{n} h ago",
  "pre {n} d": "{n} d ago",
  "Podešavanja i rezervna kopija": "Settings and backup",
  "Podešavanja": "Settings",
  "Podaci: javni {src} fantasy API (nezvaničan). Prosek po utakmici.": "Data: public {src} fantasy API (unofficial). Per-game averages.",
  "Sezona": "Season",
  "7 dana": "7 days",
  "15 dana": "15 days",
  "30 dana": "30 days",
  "Projekcija": "Projection",
  "Daješ": "You give",
  "Dobijaš": "You get",
  "Moj tim": "My team",
  "Protivnik": "Opponent",
  "{src} je vratio grešku {n}": "{src} returned error {n}",
  "{src} je vratio praznu listu igrača": "{src} returned an empty player list",
  "{src} ne odgovara (isteklo vreme)": "{src} is not responding (timed out)",
  "Mrežna greška: proveri internet konekciju": "Network error: check your internet connection",
  "{n} ut. ove nedelje ({a}–{b}, pon–ned) · preostalo: {left}": "{n} games this week ({a}–{b}, Mon–Sun) · remaining: {left}",
  "{n} ut.": "{n} G",
  "prošla sezona: {a}/{b}": "last season: {a}/{b}",
  "prošla sezona: nema podataka": "last season: no data",
  "Ove sezone: {a}/{b} utakmica ({p}%)": "This season: {a}/{b} games ({p}%)",
  " · približno, raspored nedostupan": " · approximate, schedule unavailable",
  "{src} sporo odgovara, još učitavam…": "{src} is slow, still loading…",
  "Učitavam igrače ({src})…": "Loading players ({src})…",
  "{n} igrača · ažurirano {ago} · sezona {s}": "{n} players · updated {ago} · season {s}",
  "Osveži podatke": "Refresh data",
  "U redu": "OK",
  "Prikazujem sačuvane podatke od {ago}.": "Showing saved data from {ago}.",
  "Pokušaj ponovo": "Try again",
  "Nema sačuvanih podataka.": "No saved data.",
  "Neravnomeran trejd: izaberi koga izbacuješ ({n}) u kartici Daješ, dotle rezultat nije realan.": "Uneven trade: pick who you drop ({n}) in the You give card; until then the result isn't realistic.",
  "Dodaj igrače u Daješ i Dobijaš da vidiš poređenje.": "Add players to You give and You get to see the comparison.",
  "Trejd ti donosi {w} {kat}, gubiš {l}": "The trade gains you {w} {kat}, you lose {l}",
  "{n} nerešeno": "{n} tied",
  "Čuva samo ideju u Istoriju; rosteri se ne menjaju": "Saves the idea to History only; rosters don't change",
  "Sačuvaj ideju": "Save idea",
  "Kopiraj link": "Copy link",
  "Tek ovo menja sačuvane rostere": "Only this changes your saved rosters",
  "Trejd se dogodio": "Trade happened",
  "Ovo je ideja za trejd: tvoj sačuvani roster se ne menja dok ne klikneš „Trejd se dogodio”.": "This is a trade idea: your saved roster doesn't change until you click “Trade happened”.",
  "Vrati kategoriju": "Bring the category back",
  "Punt: isključi iz rezultata": "Punt: exclude from the score",
  "Igrač": "Player",
  "Minuti u izabranom periodu. Pređi mišem ili tapni na broj za trend: sezona → 30 → 15 → 7 dana. Poslednjih 15 dana vs sezona: zeleno ↑ / crveno ↓ = ±{a} min ili više, ↑↑ / ↓↓ = ±{b} min ili više (bar {g} utakmice).": "Minutes in the selected period. Hover or tap the number for the trend: season → 30 → 15 → 7 days. Last 15 days vs season: green ↑ / red ↓ = ±{a} min or more, ↑↑ / ↓↓ = ±{b} min or more (at least {g} games).",
  "{c} po periodu": "{c} by period",
  "vs sez.": "vs season",
  "ut.": "G",
  "Bolje u poslednjih 15 dana: {d} (prag {r})": "Better over the last 15 days: {d} (threshold {r})",
  "Lošije u poslednjih 15 dana: {d} (prag {r})": "Worse over the last 15 days: {d} (threshold {r})",
  "Rast {m} min u poslednjih 15 dana": "Up {m} min over the last 15 days",
  "Pad {m} min u poslednjih 15 dana": "Down {m} min over the last 15 days",
  "Bez bitne promene (prag ±{a} min)": "No significant change (threshold ±{a} min)",
  "Minuti po periodu": "Minutes by period",
  "Prevuci gore/dole": "Drag up/down",
  "Pomeri igrača": "Move player",
  "Nema podataka za ovaj period, ne računa se": "No data for this period, not counted",
  "Izbacuješ": "Drop",
  "Waiver": "Waiver",
  "Odlazi": "Leaving",
  "Dolazi": "Arriving",
  "IR": "IR",
  "Ukloni": "Remove",
  "Učitavam igrače…": "Loading players…",
  "Nema podataka": "No data",
  "Ukupno": "Total",
  "bolje u {n} kat.": "better in {n} cat.",
  "Koga daješ…": "Who do you give…",
  "Koga dobijaš…": "Who do you get…",
  "Igrači iz linka nisu pronađeni u listi.": "Players from the link were not found in the list.",
  "Još nema igrača. Kucaj ime iznad.": "No players yet. Type a name above.",
  "Bez podataka za period „{p}“, ne računa se: {list}": "No data for period “{p}”, not counted: {list}",
  "Izbacuješ {a}/{b}": "Drop {a}/{b}",
  "Protivnik izbacuje {a}/{b}": "Opponent drops {a}/{b}",
  "Daješ više igrača nego što dobijaš, pa ti posle trejda ostaje slobodno mesto. Igrač sa waivera menja tvoj tim, ali ne i rezultat trejda.": "You give more players than you get, so you have an open spot after the trade. A waiver pickup changes your team, not the trade score.",
  "Koga izbacuješ sa svog rostera…": "Who do you drop from your roster…",
  "Koga uzimaš sa waivera… (opciono)": "Who do you pick up from waivers… (optional)",
  "Waiver dodatak {a}/{b} · opciono": "Waiver pickup {a}/{b} · optional",
  "Protivnik: {n}": "Opponent: {n}",
  "Nije na rosteru tvog tima: {list}": "Not on your roster: {list}",
  "Nije na rosteru {team}: {list}": "Not on {team}'s roster: {list}",
  "Već je na tvom rosteru: {list}": "Already on your roster: {list}",
  "Klik: punt": "Click: punt",
  "Poređenje kategorija": "Category comparison",
  "klik na kategoriju = punt": "click a category = punt",
  "Kat.": "Cat.",
  "Razlika": "Difference",
  "Na osnovu proseka ({per}) trejd ti se <span class=\"w\">isplati</span>: dobijaš {w}, gubiš {l} {kat}.": "Based on averages ({per}) the trade <span class=\"w\">pays off</span>: you gain {w}, lose {l} {kat}.",
  "Na osnovu proseka ({per}) trejd ti se <span class=\"l\">ne isplati</span>: dobijaš {w}, gubiš {l} {kat}.": "Based on averages ({per}) the trade <span class=\"l\">doesn't pay off</span>: you gain {w}, lose {l} {kat}.",
  "Na osnovu proseka ({per}) trejd je izjednačen: {w} : {l}.": "Based on averages ({per}) the trade is even: {w} : {l}.",
  "Napomena: bez podataka za ovaj period i ne računaju se: {list}.": "Note: no data for this period, not counted: {list}.",
  "Izveštaj": "Report",
  "punt {list}": "punt {list}",
  "{n} aktivnih": "{n} active",
  "Pre trejda": "Before trade",
  "Posle trejda": "After trade",
  "Ukloni sa rostera": "Remove from roster",
  "Prebaci na IR": "Move to IR",
  "Vrati sa IR": "Bring back from IR",
  "Ukloni waiver": "Remove waiver",
  "IR · ne računa se u zbirove ({a}/{b})": "IR · not counted in totals ({a}/{b})",
  "Koga izbacuješ ({a}/{b}) biraš gore, u kartici Daješ.": "Pick who you drop ({a}/{b}) above, in the You give card.",
  "Waiver dodatak (opciono, {a}/{b}) biraš gore, u kartici Dobijaš.": "Pick the waiver pickup (optional, {a}/{b}) above, in the You get card.",
  "Izaberi sačuvanog protivnika ili unesi novog.": "Pick a saved opponent or add a new one.",
  "nije izabran": "not selected",
  "Roster je pun ({a} + {b} IR). Ukloni igrača da dodaš novog.": "Roster is full ({a} + {b} IR). Remove a player to add a new one.",
  "Dodaj igrača na roster…": "Add a player to the roster…",
  "{a}/{b} aktivnih · {c}/{d} IR": "{a}/{b} active · {c}/{d} IR",
  "Ažurirano: {d}": "Updated: {d}",
  "Roster možda nije aktuelan, proveri izmene.": "Roster may be out of date, check for changes.",
  "Unesi svoj roster ({a} aktivnih + {b} IR). Čuva se samo u ovom browseru.": "Enter your roster ({a} active + {b} IR). Saved only in this browser.",
  "Unesi roster protivnika ({a} aktivnih + {b} IR). Čuva se samo u ovom browseru.": "Enter the opponent's roster ({a} active + {b} IR). Saved only in this browser.",
  "Prikaz rostera": "Roster view",
  "Posle trejda (pregled)": "After trade (preview)",
  "Sačuvan roster": "Saved roster",
  "Samo pregled: sačuvan roster se ne menja dok trejd ne potvrdiš.": "Preview only: the saved roster doesn't change until you confirm the trade.",
  "Ovo je tvoj sačuvani roster, bez trejda.": "This is your saved roster, without the trade.",
  "Bez podataka za izabrani period, ne računa se: {list}": "No data for the selected period, not counted: {list}",
  "Trejd se dogodio: ažuriraj rostere": "Trade happened: update rosters",
  "Ime tima, npr. Marko": "Team name, e.g. Mike",
  "Napravi": "Create",
  "Sačuvaj": "Save",
  "Otkaži": "Cancel",
  "Izaberi protivnika": "Pick an opponent",
  "Novi protivnik…": "New opponent…",
  "Preimenuj": "Rename",
  "Obriši": "Delete",
  "Već postoji tim sa tim imenom": "A team with that name already exists",
  "Obrisati tim „{n}”?": "Delete team “{n}”?",
  "Roster ovog protivnika ({n} igrača) biće obrisan iz ovog browsera. Ovo ne može da se vrati, osim iz rezervne kopije.": "This opponent's roster ({n} players) will be deleted from this browser. This can't be undone, except from a backup.",
  "moj roster: {n} igrača · protivnici: {o}{names} · istorija: {h}": "my roster: {n} players · opponents: {o}{names} · history: {h}",
  "Zatvori": "Close",
  "Jezik": "Language",
  "Svi tvoji podaci (moj roster, protivnici, IR oznake, istorija, punt i podešavanja) čuvaju se samo u ovom browseru. Napravi rezervnu kopiju pre brisanja podataka ili prelaska na drugi uređaj.": "All your data (my roster, opponents, IR flags, history, punts and settings) is stored only in this browser. Make a backup before clearing data or switching devices.",
  "Izvezi podatke": "Export data",
  "Trenutno: {s}": "Currently: {s}",
  "Kopiraj podatke u clipboard": "Copy data to clipboard",
  "Uvezi podatke": "Import data",
  "Nalepi tekst rezervne kopije. Postojeći podaci biće zamenjeni tek posle potvrde.": "Paste the backup text. Existing data is replaced only after you confirm.",
  "Proveri i uvezi": "Check and import",
  "Kopirano ({k} KB). Sačuvaj ga negde, npr. u beleške ili mejl sebi.": "Copied ({k} KB). Keep it somewhere, e.g. in notes or an email to yourself.",
  "Clipboard nije dostupan: tekst je u polju ispod, kopiraj ga ručno (Ctrl/Cmd+C).": "Clipboard unavailable: the text is in the field below, copy it manually (Ctrl/Cmd+C).",
  "Tekst nije ispravan JSON. Proveri da si nalepio ceo tekst.": "The text isn't valid JSON. Check that you pasted all of it.",
  "Ovo nije rezervna kopija ove aplikacije.": "This isn't a backup from this app.",
  "Kopija je iz novije verzije aplikacije.": "The backup is from a newer version of the app.",
  "Kopija sadrži nepoznate podatke.": "The backup contains unknown data.",
  "Roster u kopiji nije u ispravnom formatu.": "The roster in the backup has an invalid format.",
  "Istorija u kopiji nije u ispravnom formatu.": "The history in the backup has an invalid format.",
  "Zameniti postojeće podatke?": "Replace existing data?",
  "Uvozi se kopija{d}: <b>{s}</b>.": "Importing the backup{d}: <b>{s}</b>.",
  " od {d}": " from {d}",
  "Trenutni podaci u ovom browseru ({s}) biće <b>zamenjeni</b>.": "The current data in this browser ({s}) will be <b>replaced</b>.",
  "Zameni i uvezi": "Replace and import",
  "IR mesta su puna": "IR spots are full",
  "Imaš već {n} igrača na IR. Prvo vrati nekog sa IR.": "You already have {n} players on IR. Bring one back from IR first.",
  "Aktivna mesta su puna": "Active spots are full",
  "Imaš već {n} aktivnih. Prebaci nekog na IR ili ga ukloni pre nego što vratiš ovog igrača.": "You already have {n} active. Move someone to IR or remove them before bringing this player back.",
  "Prvo izaberi koga izbacuješ": "Pick who to drop first",
  "posle trejda {n} aktivnih, izaberi još {k} za izbacivanje.": "{n} active after the trade, pick {k} more to drop.",
  "Odlaze": "Leaving",
  "Dolaze": "Arriving",
  "Tvoj roster nije unet, pa se nijedan roster ne menja: trejd se samo čuva u Istoriju.": "Your roster isn't entered, so no roster changes: the trade is only saved to History.",
  "Protivnik nije izabran, menja se samo tvoj roster.": "No opponent selected, only your roster changes.",
  "Trejd se dogodio?": "Did the trade happen?",
  "Sačuvani rosteri biće trajno izmenjeni kao gore, trejd ide u Istoriju kao obavljen, a polja Daješ / Dobijaš se prazne.": "Saved rosters will be permanently changed as above, the trade goes to History as completed, and the You give / You get fields are cleared.",
  "Da, ažuriraj rostere": "Yes, update rosters",
  "Trejd se dogodio: sačuvani rosteri su ažurirani, a trejd je u Istoriji kao obavljen.": "Trade happened: saved rosters are updated and the trade is in History as completed.",
  "Trejd": "Trade",
  "Link kopiran": "Link copied",
  "Kopiraj link:": "Copy link:",
  "Obrisati sačuvani trejd od {d}?": "Delete the saved trade from {d}?",
  "raspored nije dostupan (potreban za datume utakmica)": "schedule unavailable (needed for game dates)",
  "{src} ne odgovara": "{src} is not responding",
  "obavljen sa {n}": "completed with {n}",
  "obavljen": "completed",
  "ideja": "idea",
  "Obriši trejd": "Delete trade",
  "Od trejda: učitavam…": "Since trade: loading…",
  "Od trejda: greška ({e})": "Since trade: error ({e})",
  "Od trejda": "Since trade",
  "{a}–{b} ut.": "{a}–{b} G",
  "Od trejda: još nema utakmica": "Since trade: no games yet",
  "Snimak": "Snapshot",
  "Sada": "Now",
  "Trejd od {d}": "Trade from {d}",
  "„Od trejda” = prosek samo utakmica posle datuma čuvanja, iz statistike po utakmici ({src}).": "“Since trade” = average of only the games after the save date, from per-game stats ({src}).",
  "Istorija trejdova": "Trade history",
  "{n} sačuvano": "{n} saved",
  "prazno": "empty",
  "Još nema sačuvanih trejdova. Klikni „Sačuvaj ideju” ili „Trejd se dogodio” ispod rezultata.": "No saved trades yet. Click “Save idea” or “Trade happened” below the score.",
  "Nema igrača za „{q}“": "No players for “{q}”",
  "Procenat na malom broju šuteva skoro ne utiče na tim.": "A percentage on very few shots barely affects the team.",
  "mali obim": "low volume",
  "Dobijaš − Daješ, iz tvoje perspektive": "You get − You give, from your perspective",
  "Razlika u sekciji Moj tim: ceo roster pre i posle trejda (ponderisano)": "Difference from the My team section: whole roster before and after the trade (weighted)",
  "Uticaj na moj tim": "Impact on my team",
  "Otvoren deljeni trejd, prikazan iz tvog ugla.": "Shared trade opened, shown from your side.",
  "Dodaj u moj tim": "Add to my team",
  "{n} nije na tvom rosteru.": "{n} is not on your roster.",
  "Dok u Daješ nema igrača sa tvog rostera, sekcija Moj tim ne menja ništa (nije tvoj trejd).": "Until You give has a player from your roster, the My team section doesn't change anything (it's not your trade).",
  "Maksimalan broj igrača u timu ({n}). Izbaci nekoga ili ga prebaci na IR da bi dodao novog.": "Maximum number of players on the team ({n}). Drop someone or move them to IR to add a new one.",
  "Nisu svi igrači iz Daješ na tvom rosteru ({list}), pa se Moj tim ne menja.": "Not all You give players are on your roster ({list}), so My team doesn't change.",
  "Nisu svi igrači iz Dobijaš na rosteru tima {team} ({list}), pa se njegov roster ne menja.": "Not all You get players are on {team}'s roster ({list}), so their roster doesn't change.",
  "Dodaj sve ({n})": "Add all ({n})",
  "Dodaj na roster": "Add to roster",
  "Dok svi igrači iz Daješ nisu na tvom rosteru, sekcija Moj tim se ne menja.": "Until all You give players are on your roster, the My team section doesn't change.",
  "tim: bez promene": "team: no change",
  "tim: {d}": "team: {d}",
  "tim: {a} → {b}": "team: {a} → {b}",
  "obavezno": "required",
  "opciono": "optional",
  "Koga izbacuje sa svog rostera…": "Who do they drop from their roster…",
  "Izbacuje": "Drops",
  "{n} nije na rosteru tima {team}.": "{n} is not on {team}'s roster.",
  "Posle trejda imaš {n} aktivnih (max {m}). Izaberi koga izbacuješ u kartici Daješ, dotle Razlika nije realna.": "After the trade you have {n} active (max {m}). Pick who you drop in the You give card; until then the Difference isn't realistic.",
  "Posle trejda tim ima {n} aktivnih (max {m}). Izaberi koga izbacuje ({k}) gore, u kartici Dobijaš, dotle Razlika nije realna.": "After the trade they have {n} active (max {m}). Pick who they drop ({k}) above, in the You get card; until then the Difference isn't realistic.",
  "Izbačen": "Dropped",
  "Moja liga": "My league",
  "Drugo": "Other",
  "H2H kategorije ({n}-cat)": "H2H categories ({n}-cat)",
  "{n}-cat H2H": "{n}-cat H2H",
  "Roto": "Roto",
  "H2H poeni": "H2H points",
  "Nastavi": "Continue",
  "Liga": "League",
  "Dodaj ligu…": "Add league…",
  "Brzo poređenje": "Quick compare",
  "Profil": "Profile",
  "Podešavanja lige": "League settings",
  "Za {f} lige": "Built for {f} leagues",
  "{n}. mesto": "{n}th place",
  "{a}/{b} igrača": "{a}/{b} players",
  "{n} protivnika": "{n} opponents",
  "Zdravo, {n}": "Hi, {n}",
  "Zdravo": "Hi",
  "Sačuvaj svoju ligu i tim da vidiš kako trejd utiče na tvoj roster, ili samo brzo uporedi dva paketa igrača.": "Save your league and team to see how a trade affects your roster, or just quickly compare two sets of players.",
  "Dodaj svoju ligu": "Add your league",
  "Samo uporedi trejd": "Just compare a trade",
  "Dodaj ligu": "Add league",
  "Uporedi trejd bez čuvanja": "Compare a trade without saving",
  "Naziv lige": "League name",
  "npr. Liga sa posla": "e.g. Work league",
  "Platforma": "Platform",
  "Broj timova": "Number of teams",
  "Tvoje ime (opciono)": "Your name (optional)",
  "Napravi ligu": "Create league",
  "Ime": "Name",
  "Tvoje ime": "Your name",
  "Sačuvano na ovom uređaju": "Saved on this device",
  "Podaci postoje samo u ovom browseru; na drugim uređajima ih nema dok ih ne preneseš izvozom i uvozom.": "Your data exists only in this browser; other devices don't have it until you move it with export and import.",
  "Prijava i sinhronizacija, uskoro": "Sign in and sync, coming soon",
  "Lige": "Leagues",
  "Još nema liga.": "No leagues yet.",
  "Obriši sve podatke": "Delete all data",
  "Briše profil, sve lige, rostere i istoriju iz ovog browsera.": "Deletes the profile, all leagues, rosters and history from this browser.",
  "Obrisati sve podatke?": "Delete all data?",
  "Profil, sve lige, rosteri, protivnici i istorija biće trajno obrisani iz ovog browsera. Ovo ne može da se vrati, osim iz rezervne kopije.": "The profile, all leagues, rosters, opponents and history will be permanently deleted from this browser. This can't be undone, except from a backup.",
  "Obriši sve": "Delete all",
  "Sačuvaj svoj tim i vidi kako trejd utiče na njega": "Save your team and see how this trade changes it",
  "Dodaj svoju ligu": "Add your league",
  "Moje lige": "My leagues",
  "Naziv mog tima": "My team name",
  "Format": "Format",
  "uskoro": "coming soon",
  "Tabela (opciono)": "Standings (optional)",
  "Mesto": "Place",
  "Skor": "Record",
  "npr. 42-30-3": "e.g. 42-30-3",
  "Timova u plejofu": "Playoff teams",
  "Nedelja plejofa": "Playoff week",
  "Stanje mog tima": "My team status",
  "Borim se za vrh": "Contending",
  "Sredina": "Middle",
  "Rebuild": "Rebuilding",
  "Napomena": "Note",
  "Uvezi rostere sa {p}, uskoro": "Import rosters from {p}, coming soon",
  "Dupliraj ligu": "Duplicate league",
  "Obriši ligu": "Delete league",
  "{n} (kopija)": "{n} (copy)",
  "Obrisati ligu „{n}”?": "Delete league “{n}”?",
  "Roster, protivnici i istorija ove lige biće trajno obrisani iz ovog browsera. Ovo ne može da se vrati, osim iz rezervne kopije.": "This league's roster, opponents and history will be permanently deleted from this browser. This can't be undone, except from a backup.",
  "nema liga": "no leagues",
  "{l}: {names} · istorija: {h}": "{l}: {names} · history: {h}",
  "{n} igrača": "{n} players",
  "Dodati ligu „{n}”?": "Add league “{n}”?",
  "Liga iz kopije{d} biće dodata postojećim ligama; ništa se ne prepisuje.": "The league from the backup{d} will be added to your existing leagues; nothing is overwritten.",
  "{n} (uvoz)": "{n} (imported)",
  "Ceo profil sa svim ligama. Trenutno: {s}": "The whole profile with all leagues. Currently: {s}",
  "Nalepi tekst rezervne kopije. Kopija celog profila zamenjuje postojeće podatke (uz potvrdu); kopija jedne lige se dodaje postojećim.": "Paste the backup text. A whole-profile backup replaces existing data (after confirmation); a single-league backup is added to the existing ones.",
  "Izvezi samo ovu ligu": "Export this league only",
  "kako se tvoj tim zove u ligi": "what your team is called in the league",
  "Novi trejd": "New trade",
  "Trejdovi": "Trades",
  "Zatvori trejd": "Close trade",
  "Planiraj novi trejd": "Plan a new trade",
  "Zatvoriti trejd?": "Close trade?",
  "H2H, svaka kategorija": "H2H, each category",
  "H2H, jedna pobeda nedeljno": "H2H, one win per week",
  "H2H, jedna pobeda": "H2H, one win",
  "Svaka kategorija je posebna pobeda ili poraz u nedeljnom meču.": "Each category is its own win or loss in the weekly matchup.",
  "Ko osvoji više kategorija, nosi jednu pobedu za celu nedelju (Most categories / One win).": "Whoever wins more categories takes one win for the whole week (Most categories / One win).",
  "Poredak po zbirovima cele sezone u svakoj kategoriji, bez nedeljnih mečeva.": "Standings by full-season totals in each category, no weekly matchups.",
  "Statistike donose fantasy poene, a nedeljni meč dobija ko skupi više poena.": "Stats earn fantasy points, and the weekly matchup goes to whoever scores more.",
  "Poeni za celu sezonu": "Season points",
  "Fantasy poeni se sabiraju cele sezone, bez nedeljnih mečeva.": "Fantasy points add up over the whole season, no weekly matchups.",
  "Poeni": "Points",
  "Sezonski poeni": "Season points",
  "ESPN (pre 2020)": "ESPN (pre-2020)",
  "ručno bodovanje": "custom scoring",
  "9 kategorija": "9 categories",
  "8 kategorija (bez TO)": "8 categories (no TO)",
  "ESPN bodovanje": "ESPN scoring",
  "ESPN bodovanje (lige pre 2020)": "ESPN scoring (leagues before 2020)",
  "Yahoo bodovanje": "Yahoo scoring",
  "Ne računa se: {list}.": "Not counted: {list}.",
  "Prevuci za redosled": "Drag to reorder",
  "manje je bolje": "lower is better",
  "Pomeri gore": "Move up",
  "Pomeri dole": "Move down",
  "Kategorije": "Categories",
  "Svoje kategorije": "Custom categories",
  "Čekiraj kategorije svoje lige (najmanje 2) i složi ih redom kao u ligi.": "Check your league's categories (at least 2) and order them as in your league.",
  "Svoje bodovanje": "Custom scoring",
  "Bodovanje": "Scoring",
  "Prepiši bodovanje iz podešavanja svoje lige.": "Copy the scoring from your league settings.",
  "Proveri bodovanje u podešavanjima svoje lige, lige ga često menjaju.": "Check the scoring in your league settings, leagues often change it.",
  "Format lige": "League format",
  "Liga boduje još nešto što nije na listi? (opciono)": "Does your league score something not on the list? (optional)",
  "npr. bonus za 40 poena": "e.g. 40-point bonus",
  "Te statistike nemamo u podacima: ne računaju se, ali se navode uz rezultat.": "We do not have these stats in our data: they are not counted, but they are listed with the result.",
  "Ne podržavamo formate bez trejdova i formate gde se računa samo jedna utakmica nedeljno (npr. Yahoo High Score).": "We do not support formats without trades or formats that count only one game per week (e.g. Yahoo High Score).",
  "Izaberi bar 2 kategorije.": "Pick at least 2 categories.",
  "Upiši bar jednu težinu za poene.": "Enter at least one points weight.",
  "Promeniti format lige?": "Change the league format?",
  "Sa {a} na {b}.": "From {a} to {b}.",
  "Rezultat, tabele, izveštaj i tekst za AI odmah se preračunavaju po novom formatu. Punt za kategorije kojih više nema se briše. Otvoreni trejdovi ostaju.": "The score, tables, report and AI text are recalculated right away for the new format. Punts for categories that no longer exist are removed. Open trades stay.",
  "Promeni format": "Change format",
  "Važi za brzo poređenje u ovom browseru. Za ligu se format bira u podešavanjima lige.": "Applies to quick compare in this browser. For a league, pick the format in league settings.",
  "Trejd je poslat za {a}, prikazan u formatu tvoje lige ({b}).": "The trade was sent for {a}, shown in your league's format ({b}).",
  "Ne pitaj me ponovo": "Don't ask me again",
  "Trejd {x} biće uklonjen. Sačuvani trejdovi u istoriji ostaju.": "Trade {x} will be removed. Saved trades in history stay.",
  "U koju ligu da svrstam trejd?": "Which league should this trade go to?",
  "Otvara se deljeni trejd, u novom tabu. Postojeći trejdovi ostaju netaknuti.": "The shared trade opens in a new tab. Your existing trades stay untouched.",
  "prepoznato": "recognized",
  "Neovisan trejd (bez lige)": "Standalone trade (no league)",
  "brzo poređenje": "quick compare",
  "Igrača u rosteru (bez IR)": "Roster spots (without IR)",
  "IR mesta": "IR spots",
  "Trejd bez lige": "Trade without a league",
  "Kopiraj za AI analizu": "Copy for AI analysis",
  "Zalepi u ChatGPT, Claude, Gemini ili bilo koji AI čet i dobićeš dugoročno mišljenje o trejdu": "Paste into ChatGPT, Claude, Gemini or any AI chat and get a long-term opinion on the trade",
  "Pripremam podatke...": "Preparing data...",
  "Povlačim vesti i sastavljam tekst.": "Fetching news and building the text.",
  "Otvori svoj AI (ChatGPT, Claude, Gemini...)": "Open your AI (ChatGPT, Claude, Gemini...)",
  "Zalepi tekst (dugo pritisni na telefonu i izaberi Zalepi, ili Ctrl+V / Cmd+V na računaru)": "Paste the text (long-press on your phone and choose Paste, or Ctrl+V / Cmd+V on a computer)",
  "Pošalji i sačekaj odgovor": "Send it and wait for the answer",
  "Kopirano!": "Copied!",
  "Kopiraj tekst": "Copy the text",
  "Automatsko kopiranje nije uspelo. Označi tekst i kopiraj ga.": "Automatic copy did not work. Select the text and copy it.",
  "Označi sve": "Select all",
  "Zameni strane": "Swap sides",
  "Daješ postaje Dobijaš i obrnuto": "You give becomes You get, and the other way around",
  "FPts iz {s}": "FPts from {s}",
  "FPts po utakmici": "FPts per game",
  "Fantasy poeni po utakmici": "Fantasy points per game",
  "Fantasy poeni po utakmici, zbir aktivnih igrača, {p}. Tri statistike koje timu donose najviše poena.": "Fantasy points per game, sum of active players, {p}. The three stats that bring your team the most points.",
  "Kad uneseš bar 3 tima (sa svojim), uz svaki tim vidiš i rang po poenima.": "Once you enter at least 3 teams (yours included), each team also shows its points rank.",
  "Nedeljni meč nosi samo jednu pobedu: dovoljno je da osvojiš većinu od {n} kategorija.": "The weekly matchup is worth a single win: you only need to take most of the {n} categories.",
  "Odakle dolaze poeni": "Where the points come from",
  "Poeni mog tima": "My team points",
  "Poeni se sabiraju cele sezone, pa broj odigranih utakmica znači više nego u nedeljnim mečevima.": "Points add up over the whole season, so games played matter more than in weekly matchups.",
  "Popravljaš se u {w} {kat}, slabiš u {l}": "You improve in {w} {kat}, you get weaker in {l}",
  "Rang se prikazuje kad uneseš bar 3 tima.": "Rank shows once you enter at least 3 teams.",
  "Roto računa zbir cele sezone, pa broj odigranih utakmica znači više nego u H2H.": "Roto counts season totals, so games played matter more than in H2H.",
  "Statistika": "Stat",
  "bolje": "better",
  "lošije": "worse",
  "poeni po utakmici po statistici, sortirano po razlici": "points per game by stat, sorted by difference",
  "{n} FPts": "{n} FPts",
  "{s} (nema u projekciji)": "{s} (not in projections)",
  "{s}: {w} po jedinici": "{s}: {w} per unit",
  'Liga je povezana sa platformom {p}. Naziv, timovi, roster mesta i tabela dolaze iz lige. Platforma ne daje format koji prepoznajemo, pa ga biraš ovde (procena).': 'This league is linked to {p}. Name, teams, roster spots and standings come from the league. The platform does not provide a format we recognize, so you choose it here (estimate).',
  'Yahoo liga se ne osvežava sama: rosteri, tabela i protivnici se ne povlače sa Yahoo-a. Posle svake promene u ligi ažuriraj timove ručno (Nalepi tim ponovo). Uskoro stiže verzija koja sve povlači automatski.': 'Yahoo leagues do not update on their own: rosters, standings and opponents are not pulled from Yahoo. After every change in your league, update the teams by hand (paste the team again). A version that pulls everything automatically is coming soon.',
  'Ubaci u Daješ': 'Add to You give',
  'Ubaci u Dobijaš': 'Add to You get',
  'Prikaz timova': 'Team view',
  'Jedan ispod drugog, sa statistikom': 'One below the other, with stats',
  'Jedan pored drugog, samo igrači': 'Side by side, players only',
  'Prikaži statistiku': 'Show stats',
  "Ponuda je poslata {d}": "Offer sent {d}",
  "Prihvaćeno": "Accepted",
  "Odbijeno": "Rejected",
  "Kad protivnik odgovori, upiši ishod. Ponuda te čeka i u Istoriji trejdova, i kad zatvoriš ovaj tab.": "When your opponent answers, record the outcome. The offer also waits for you in Trade history, even if you close this tab.",
  "Ponuda je poslata": "Offer sent",
  "Kad pošalješ ovu ponudu na {p}, klikni „Ponuda je poslata”. Rosteri se ne menjaju ručno, povlače se sa {p}.": "Once you send this offer on {p}, click “Offer sent”. Rosters are not edited by hand, they are pulled from {p}.",
  "Ponuda je u Istoriji trejdova. Kad protivnik odgovori, klikni Prihvaćeno ili Odbijeno.": "The offer is in Trade history. When your opponent answers, click Accepted or Rejected.",
  "Ponuda je u Istoriji kao odbijena.": "The offer is in History as rejected.",
  "Ponuda prihvaćena?": "Offer accepted?",
  "Trejd ide u Istoriju kao prihvaćen. Sledećih {n} minuta rosteri prikazuju timove posle trejda, da vidiš kako sada izgledaju i kako stojiš po kategorijama.": "The trade goes to History as accepted. For the next {n} minutes the rosters show both teams after the trade, so you can see how they look now and where you stand by category.",
  "Posle toga rosteri se vraćaju na stanje sa {p}, dok {p} ne obradi trejd. Tada promena postaje trajna. Dok je aplikacija otvorena, proveravamo {p} na svakih {n} minuta.": "After that the rosters go back to what {p} shows until {p} processes the trade. Then the change becomes permanent. While the app is open, we check {p} every {n} minutes.",
  "Trejd je u Istoriji kao prihvaćen. Rosteri privremeno prikazuju timove posle trejda.": "The trade is in History as accepted. Rosters temporarily show the teams after the trade.",
  "{p} je obradio trejd {x}. Rosteri su sada trajno promenjeni.": "{p} processed the trade {x}. Rosters are now permanently updated.",
  "Privremeni prikaz posle prihvaćenog trejda ({x}), do {time}. Posle toga rosteri se vraćaju na stanje sa {p}, dok {p} ne obradi trejd.": "Temporary view after the accepted trade ({x}), until {time}. After that rosters go back to what {p} shows until {p} processes the trade.",
  "Vrati odmah": "Restore now",
  "Prihvaćen trejd ({x}) čeka da ga {p} obradi. Proveravamo na svakih {n} minuta.": "Accepted trade ({x}) is waiting for {p} to process it. We check every {n} minutes.",
  "Poslate ponude koje čekaju odgovor": "Sent offers waiting for an answer",
  "sa {n}": "with {n}",
  "ponuda poslata": "offer sent",
  "prihvaćen": "accepted",
  "čeka {p}": "waiting for {p}",
  "odbijen": "rejected",
  "Otvori u analizi trejda": "Open in trade analysis",
  "Statistika od trejda": "Stats since the trade",
  "Još nema sačuvanih trejdova. Klikni „Sačuvaj ideju” ili „Ponuda je poslata” ispod rezultata.": "No saved trades yet. Click “Save idea” or “Offer sent” below the score.",
  "Klik na trejd otvara ga u analizi trejda. 📊 prikazuje statistiku od trejda.": "Click a trade to open it in trade analysis. 📊 shows stats since the trade.",
  "Trejd možeš da gledaš i porediš, ali ponuda može da se pošalje samo za igrače iz tvog tima i tima protivnika.": "You can view and compare this trade, but an offer can only be sent for players from your team and your opponent’s team.",
  "{x} nije u tvom timu.": "{x} is not on your team.",
  "{x} nisu u tvom timu.": "{x} are not on your team.",
  "Izaberi protivnika ispod.": "Pick an opponent below.",
  "{x} nije u timu {team}.": "{x} is not on {team}.",
  "{x} nisu u timu {team}.": "{x} are not on {team}.",
  "Procena plasmana": "Rank projection",
  "Kraj sezone, posle trejda": "End of season, after trade",
  "Mesto od {n} timova. Svi timovi su projektovani na celu sezonu istim tempom, a tvom timu je dodata razlika iz trejda (Dobijaš − Daješ po utakmici × preostale utakmice njihovih NBA timova). FG% i FT% iz pogodaka i pokušaja. Procena uzima u obzir koliko igrač inače propušta utakmica, a trenutni status (OUT, DTD) se ne gleda. Računaju se isti igrači kao u tabeli kategorija, uključujući slobodno mesto i otpuštanja.": "Rank out of {n} teams. All teams are projected to the full season at their current pace, and your team gets the trade difference (You get − You give per game × remaining games of their NBA teams). FG% and FT% from makes and attempts. The estimate accounts for how often a player usually misses games, and the current status (OUT, DTD) is not used. It counts the same players as the category table, including the open spot and drops.",
  "Prikaz": "View",
  "Sortiraj po {c}": "Sort by {c}",
  "Snaga trenutnog rostera": "Current roster strength",
  "od sada": "from now on",
  "Koliko je jak tvoj roster od danas: proseci po utakmici igrača koje sada imaš, poređeni sa trenutnim rosterima ostalih timova. Ne zavisi od broja odigranih utakmica ni od igrača koji su ranije bili u timu. Na ovo utiče trejd.": "How strong your roster is from today: per-game averages of the players you have now, compared with the other teams' current rosters. It does not depend on games played or on players who were on the team earlier. Trades change this.",
  "Prosek po utakmici, zbir aktivnih igrača koje sada imaš ({p}). Rang među trenutnim rosterima {n} timova.": "Per game, sum of the active players you have now ({p}). Rank among the current rosters of {n} teams.",
  "Stvarni plasman u sezoni": "Actual season standing",
  "od početka sezone": "since the season started",
  "Gde tim stvarno stoji u kategorijama od početka sezone, po ukupnim brojkama iz {p}. Računaju se i igrači koji više nisu u timu i broj odigranih utakmica (više utakmica = veći zbirovi, i više izgubljenih lopti). Trejd ovo ne menja.": "Where the team actually stands in each category since the season started, from {p} totals. Players who are no longer on the team count too, and so do games played (more games = bigger totals, and more turnovers). Trades do not change this.",
  "Ukupno od početka sezone iz {p}, svi timovi lige, sa svim igračima koji su igrali za tim. FG% i FT% iz pogodaka i pokušaja.": "Totals since the season started from {p}, all teams in the league, with every player who played for the team. FG% and FT% from makes and attempts.",
  "Prevuci levo ili desno da promeniš redosled kolona.": "Drag left or right to reorder columns.",
  "Klik sortira po {c}. Prevuci levo ili desno da promeniš redosled kolona.": "Click to sort by {c}. Drag left or right to reorder columns.",
  "Redosled kolona je sačuvan samo za ovu ligu. Podrazumevani redosled vraćaš u podešavanjima lige.": "Column order saved for this league only. You can restore the default order in league settings.",
  "Vrati podrazumevani redosled kolona": "Restore default column order",
  "kao na platformi {p}": "as on {p}",
  "kao u formatu lige": "as in the league format",
  "Vraćen je podrazumevani redosled kolona.": "Default column order restored.",
  "Format lige je sada preuzet sa platforme {p}: {f}.": "The league format is now taken from {p}: {f}.",
  "Ova liga je iz sezone koja je završena ({s}). Rosteri su sa kraja te sezone. Za tekuću sezonu uvezi novi ID lige: {p} pravi novu ligu svake sezone.": "This league is from a finished season ({s}). Rosters are from the end of that season. For the current season, import the new league ID: {p} creates a new league every season.",
  "Bonusi po utakmici": "Per-game bonuses",
  "bonusi po utakmici (učitavam utakmice…)": "per-game bonuses (loading games…)",
  "Profil igrača: {n}": "Player profile: {n}",
  "Zdrav": "Healthy",
  "Vlasnik": "Manager",
  "Slobodan igrač": "Free agent",
  "U ligama": "Rostered",
  "Rang ({p})": "Rank ({p})",
  "Proseci": "Averages",
  "Nema statistike za ovu sezonu.": "No stats this season.",
  "Učitavam utakmice…": "Loading games…",
  "Utakmice trenutno nisu dostupne.": "Games are not available right now.",
  "Datum": "Date",
  "Protiv": "Opp",
  "Bonus u ovoj utakmici: {n} FPts": "Bonus in this game: {n} FPts",
  "Još nije igrao ove sezone.": "Has not played this season yet.",
  "Prikaži manje": "Show less",
  "Prikaži sve ({n})": "Show all ({n})",
  "FPts po utakmici uključuju bonuse lige ({list}). Utakmice sa bonusom su označene.": "FPts per game include the league bonuses ({list}). Games with a bonus are highlighted.",
  "Prikaži još ({n})": "Show {n} more",
  "Nema skorijih vesti.": "No recent news.",
  "Učitavam vesti…": "Loading news…",
  "Utakmice": "Games",
  "Vesti": "News",
  "Pregled sezone (ESPN)": "Season outlook (ESPN)",
  "Status": "Status",
  "Dodaj u Daješ": "Add to Give",
  "Dodaj u Dobijaš": "Add to Get",
  "Dodato u trejd": "Added to the trade",
  "Bonus": "Bonus",
  "sledeća utakmica": "next game",
  "u toku": "in progress",
  "Nije igrao": "Did not play",
  "Prethodni igrač: {n}": "Previous player: {n}",
  "Sledeći igrač: {n}": "Next player: {n}",
  "Procena: projekcija nema bonuse, dabl-dablove ni retke stavke (tehničke, flagrantne...). Za njih uzimamo prosek po utakmici iz ove sezone.": "Estimate: the projection has no bonuses, double-doubles or rare items (technical, flagrant...). For those we use the per-game average from this season.",
  "DD, TD i QD su dabl-dabl, tripl-dabl i četvorostruki dabl-dabl (tripl-dabl se računa i kao dabl-dabl). TF, FF, EJ i DQ su tehničke, flagrantne, izbacivanja i isključenja.": "DD, TD and QD are double-double, triple-double and quadruple-double (a triple-double also counts as a double-double). TF, FF, EJ and DQ are technical fouls, flagrant fouls, ejections and disqualifications.",
  "Poeni za prag u jednoj utakmici, npr. 40+ poena = 2. Računa se iz statistike svake utakmice.": "Points for reaching a threshold in one game, e.g. 40+ points = 2. Calculated from each game's stats.",
  "Prag": "Threshold",
  "poena": "points",
  "Ukloni bonus": "Remove bonus",
  "Dodaj bonus": "Add bonus",
  "{n} bod.": "{n} pts",
  "{n} je zdrav, a još je na IR. Vrati ga u postavu.": "{n} is healthy but still on IR. Move him back to your lineup.",
  "{n} je {s}, više nije OUT, a još je na IR.": "{n} is {s}, no longer OUT, but still on IR.",
  "{n} je OUT već {m} utakmica.": "{n} has been OUT for {m} games.",
  "{n} je OUT već {d}.": "{n} has been OUT for {d}.",
  "{n} je OUT na duže.": "{n} is OUT long term.",
  "{n} se vratio, ponovo je zdrav.": "{n} is back and healthy again.",
  "{n}: novi status {s}.": "{n}: new status {s}.",
  "{n}: minutaža naglo pada, {a} → {b} min poslednjih 15 dana.": "{n}: minutes dropping sharply, {a} → {b} min in the last 15 days.",
  "Ponuda {o} čeka odgovor već {d}.": "Offer {o} has been waiting for an answer for {d}.",
  "Otvori trejd": "Open trade",
  "Rok za trejdove (opciono)": "Trade deadline (optional)",
  "Ako ga uneseš, 7 dana pre roka dobijaš upozorenje.": "If you enter it, you get an alert 7 days before the deadline.",
  "Rok za trejdove: nedelja {w}, oko {d} (približno, još {n}).": "Trade deadline: week {w}, around {d} (approximate, {n} left).",
  "Rok za trejdove je verovatno prošao (nedelja {w}).": "The trade deadline has probably passed (week {w}).",
  "platforma ne daje": "not provided by the platform",
  "(opšte pravilo platforme)": "(platform-wide rule)",
  "odmah": "immediately",
  "nedelja {w}, oko {d} (približno)": "week {w}, around {d} (approximate)",
  "Na IR mestu sme": "Allowed on IR",
  "Period obrade trejda": "Trade review period",
  "Rok za trejdove": "Trade deadline",
  "bonusi za prag": "threshold bonuses",
  "3D i 4D (da li daju i niže bonuse)": "3D and 4D (whether they also give the lower bonuses)",
  "Približno: {l}. Ove stavke bodovanja sa platforme {p} nismo mogli da proverimo na pravoj ligi.": "Approximate: {l}. We could not verify these {p} scoring items on a real league.",
  "Procena uzima u obzir koliko igrač inače propušta utakmica. Trenutni status (OUT, DTD) se ne gleda, ne računa se samo igrač koji je van do kraja sezone.": "The estimate accounts for how often a player usually misses games. The current status (OUT, DTD) is not used; only a player who is out for the season is not counted.",
  "Procena: komesar, LM ili glasanje lige mogu da obore trejd.": "Estimate: the commissioner, LM or a league vote can still cancel the trade.",
  "{p} obrađuje trejd oko {d}": "{p} processes the trade around {d}",
  "procena": "estimate",
  "{n} je {s}, a ova liga na IR dozvoljava samo: {l}.": "{n} is {s}, but this league only allows these on IR: {l}.",
  "{n} na IR-u više nije OUT, proveri da li možeš da ga zadržiš tamo.": "{n} is on IR but no longer OUT, check whether you can keep him there.",
  "Prebaci ga na IR, mesto je slobodno.": "Move him to IR, a spot is free.",
  "Ako tvoja liga to dozvoljava i imaš slobodno IR mesto, prebaci ga na IR.": "If your league allows it and you have a free IR spot, move him to IR.",
  "Sakrij": "Dismiss",
  "Otvoreni tabovi analize": "Open trade analysis tabs",
  "(IR: procena, platforma ne daje broj mesta)": "(IR: estimate, the platform does not provide the number of spots)",
  "{n} je na IR mestu, a više nema oznaku {l}. Dok je tamo, ne možeš da dodaješ nove igrače.": "{n} is in an IR spot but no longer has an {l} designation. While he is there, you cannot add new players.",
  "Broj po utakmici je sa ESPN-a. Prosek lige koristi zbir sezone sa platforme {p}.": "Per-game numbers are from ESPN. The league average uses the {p} season total.",
  "izjednačeno": "level",
  "{n} pob. ispred": "{n} W ahead",
  "{n} pob. iza": "{n} W behind",
  "{n} poena ispred": "{n} pts ahead",
  "{n} poena iza": "{n} pts behind",
  "linija plejofa": "playoff line",
  "U zoni plejofa (top {n}).": "In the playoff zone (top {n}).",
  "{n} mesta do zone plejofa (top {m}).": "{n} spots from the playoff zone (top {m}).",
  "Unesi mesto i skor u podešavanjima lige da vidiš gde stojiš.": "Enter your place and record in the league settings to see where you stand.",
  "Trka za plejof": "Playoff race",
  "Forma rostera": "Roster health",
  "zdravih": "healthy",
  "ili": "or",
  "Platforma lige ne daje status igrača, pa je prikazan status sa ESPN-a.": "The league platform does not provide player status, so the ESPN status is shown.",
  "Iz lige": "From league",
  "samo za čitanje": "read only",
  "Tvoji izbori": "Your choices",
  "dostupno za uvezene lige.": "available for imported leagues.",
  "Kako da uvezem ligu?": "How do I import a league?",
  "Period obrade trejda i IR pravila lige": "Trade review period and league IR rules",
  "IR pravila lige u upozorenjima": "League IR rules in alerts",
  "Puna tabela lige i stvarni plasman u sezoni": "Full league standings and actual season standing",
  "Prepoznavanje prihvaćenog trejda i datum obrade": "Detecting accepted trades and the processing date",
  "Osvežavanje rostera i statusa sa platforme": "Refreshing rosters and statuses from the platform",
  "Ukupna vrednost: daješ {a}, dobijaš {b}": "Total value: you give {a}, you get {b}",
  "(iznad zamene, po utakmici)": "(above replacement, per game)",
  "Informativno. Zbir ne uzima u obzir da strana koja dobija više igrača mora nekoga da otpusti.": "For information only. The sum does not account for the side getting more players having to drop someone.",
  "{v} FPts iznad zamene": "{v} FPts above replacement",
  "Koliko fantasy poena po utakmici igrač donosi više od igrača koga bi lako našao na waiveru. 0 je nivo zamene.": "How many more fantasy points per game the player brings than one you could easily find on waivers. 0 is replacement level.",
  "Koliko igrač doprinosi u kategorijama tvoje lige u odnosu na igrače koji su na rosterima. 0 je prosečan igrač sa rostera. Ispod je doprinos po kategoriji: plus je iznad proseka, minus ispod. Oko +1 je jasno iznad proseka, +2 i više među najboljima. Vrednost je zbir svih kategorija.": "How much the player contributes in your league categories compared to rostered players. 0 is an average rostered player. Below is the contribution per category: plus is above average, minus below. Around +1 is clearly above average, +2 or more is among the best. The value is the sum of all categories.",
  "Vrednost ({p})": "Value ({p})",
  "Manje od {n} utakmica u ovom periodu.": "Fewer than {n} games in this period.",
  "mali uzorak": "small sample",
  "Alati": "Tools",
  "Pojačanja sa FA": "Free agent pickups",
  "Za igrača kog želiš ili kategoriju koja ti fali, predlaže trejdove sa timovima iz tvoje lige koji imaju smisla za obe strane.": "For a player you want or a category you need, suggests trades with teams in your league that make sense for both sides.",
  "Pokazuje igrače iz drugih timova u tvojoj ligi koji najviše pomažu tvom timu, i kojim timovima bi trejd takođe odgovarao.": "Shows players on other teams in your league who help your team the most, and which teams a trade could also suit.",
  "Iz tvoje uvezene lige pronalazi slobodne igrače koji odgovaraju tvom timu, uključujući one kojima minutaža raste.": "Uses your imported league to find free agents who fit your team, including players whose minutes are growing.",
  "Po kategorijama, u odnosu na prosečnog igrača sa rostera:": "By category, compared to an average rostered player:",
  'Vrednost': 'Value',
  'Fantasy poeni po utakmici iznad igrača kojeg možeš da nađeš na waiveru.': 'Fantasy points per game above a replacement-level player you could find on waivers.',
  'Nivo zamene': 'Replacement level',
  'Doprinos u kategorijama tvoje lige u odnosu na prosečnog igrača sa rostera. Oko +1 je jasno iznad proseka, +2 i više među najboljima. Vrednost je zbir svih kategorija.': 'Contribution in your league\'s categories compared to an average rostered player. Around +1 is clearly above average, +2 or more is among the best. The value is the sum of all categories.',
  "Radi samo za uvezene lige, jer su nam potrebni svi rosteri.": "Works only for imported leagues, because we need all rosters.",
  "Na waiveru do {d}": "On waivers until {d}",
  "Slobodan": "Free agent",
  "Minuti {a} → {b} u poslednjih 7 dana": "Minutes {a} → {b} in the last 7 days",
  "{n} je OUT": "{n} is OUT",
  "Vlasništvo raste: +{n}%": "Ownership rising: +{n}%",
  "{a} → {b} FPts po utakmici": "{a} → {b} FPts per game",
  "Razlika FPts po utakmici: igrač koji dolazi minus igrač koji odlazi (sezona, 15 i 7 dana i projekcija).": "Difference in FPts per game: incoming player minus outgoing player (season, 15 and 7 days and projection).",
  "Neto dobit za tvoj tim: vrednost igrača koji dolazi minus vrednost igrača koji odlazi, po potrebama tvog tima (sezona, 15 i 7 dana i projekcija).": "Net gain for your team: value of the incoming player minus value of the outgoing player, weighted by your team's needs (season, 15 and 7 days and projection).",
  "Neto": "Net",
  "{n} ut. u narednih 7 dana": "{n} games in the next 7 days",
  "Predlog za otpuštanje": "Suggested drop",
  "najslabiji aktivni igrač za tvoj tim": "weakest active player for your team",
  "Svi aktivni igrači su zaključani.": "All active players are locked.",
  "Predloži drugog": "Suggest another",
  "Otpuštaš": "Dropping",
  "Neka platforma predloži": "Let us suggest",
  "Zaključan: nikad se ne predlaže za otpuštanje": "Locked: never suggested as a drop",
  "Zaključaj: nikad ne predlaži za otpuštanje": "Lock: never suggest as a drop",
  "Ko odlazi": "Who goes",
  "Izaberi sam": "Pick myself",
  "Ime igrača sa tvog rostera": "Player name from your roster",
  "Izabrao si {n} igrača, pa tražimo isto toliko pojačanja.": "You picked {n} players, so we look for the same number of pickups.",
  "Katanci: igrači koje nikad ne otpuštam": "Locks: players I never drop",
  "Šta tvom timu treba": "What your team needs",
  "Proceni sam": "Auto",
  "Biram kategorije": "Pick categories",
  "Izaberi kategorije koje ti trebaju. Punt kategorije se ne računaju.": "Pick the categories you need. Punted categories are not counted.",
  "Istaknute su kategorije koje tvom timu najviše trebaju: slabe po plasmanu u ligi i po trenutnom rosteru, i one koje gubiš zbog OUT igrača. Punt kategorije se ne računaju.": "Highlighted are the categories your team needs most: weak in the league standings and in your current roster, plus those you lose because of OUT players. Punted categories are not counted.",
  "Proveri da li tvoja liga dozvoljava ovaj status na IR-u.": "Check whether your league allows this status on IR.",
  "Broj IR mesta je procena. Proveri u podešavanjima lige.": "The number of IR spots is an estimate. Check your league settings.",
  "vrednost kad je zdrav": "value when healthy",
  "Povratak": "Return",
  "Uzmi i stavi na IR": "Stash on IR",
  "slobodnih IR mesta: {n}": "free IR spots: {n}",
  "Trenutno nema povređenih slobodnih igrača sa visokom vrednošću koji smeju na IR.": "No injured free agents with high value who can go on IR right now.",
  "U usponu": "Rising",
  "Ned.": "Wk",
  "Utakmice ove nedelje meča (preostale)": "Games left this matchup week",
  "Vlasn.": "Own.",
  "Vlasništvo u ESPN ligama i promena": "Rostered in ESPN leagues and change",
  "Svi slobodni igrači": "All free agents",
  "{n} igrača · {p}": "{n} players · {p}",
  "Prikaži još": "Show more",
  "Tvoj tim u ovoj ligi nema igrača. Izaberi svoj tim u podešavanjima lige.": "Your team in this league has no players. Choose your team in the league settings.",
  "Trenutno nema pojačanja koja bi ti pomogla": "No pickups would help your team right now",
  "Nijedan slobodan igrač ne donosi dovoljno više od igrača koji bi otišao. Ne spuštamo kriterijum da bi lista bila puna.": "No free agent adds enough over the player who would go. We do not lower the bar just to fill the list.",
  "Prati": "Watch",
  "Proveravam waiver u ligi…": "Checking league waivers…",
  "Predlozi su po FPts po utakmici (mešavina sezone, poslednjih 15 i 7 dana i projekcije), u odnosu na igrača koji odlazi.": "Suggestions use FPts per game (a blend of the season, the last 15 and 7 days and the projection), compared with the player who goes.",
  "Predlozi su po vrednosti za tvoj tim (mešavina sezone, poslednjih 15 i 7 dana i projekcije), u odnosu na igrača koji odlazi.": "Suggestions use value for your team (a blend of the season, the last 15 and 7 days and the projection), compared with the player who goes.",
  "Najbolja kombinacija": "Best combination",
  "Najbolja pojačanja": "Best pickups",
  "Pre": "Before",
  "Posle": "After",
  "FPts tima po utakmici": "team FPts per game",
  "Ove nedelje meča: {a} ut. za igrača koji dolazi, {b} za igrača koji odlazi.": "This matchup week: {a} games for the incoming player, {b} for the outgoing player.",
  "Procena za ovu nedelju": "Estimate for this week",
  "Nedelja meča iz lige: od {a} do {b}": "Matchup week from your league: {a} to {b}",
  "Nedelja meča od ponedeljka do nedelje: od {a} do {b}": "Matchup week Monday to Sunday: {a} to {b}",
  "Preostala preuzimanja ove nedelje: {n}.": "Pickups left this week: {n}.",
  "Limit lige za preuzimanja: {n} dnevno.": "League pickup limit: {n} per day.",
  "Preostala preuzimanja ove sezone: {n}.": "Pickups left this season: {n}.",
  "Tvoj tim pre i posle": "Your team before and after",
  "po utakmici, {p}": "per game, {p}",
  "Zašto": "Why",
  "Bolja vrednost za tvoj tim od igrača koji odlazi.": "Better value for your team than the player who goes.",
  "Streaming": "Streaming",
  "Poslednja vest": "Latest news",
  "{d} FPts po utakmici": "{d} FPts per game",
  "Dobijaš {w} {k}, gubiš {l}": "You win {w} {k}, lose {l}",
  "Najviše ti popravlja {c}": "Helps you most in {c}",
  "{n} vredi više od igrača koji dolazi.": "{n} is worth more than the incoming player.",
  "Trejd kandidat": "Trade candidate",
  "{n} ti slabo odgovara, ali ima vrednost za trejd.": "{n} is a poor fit for your team, but has trade value.",
  "Automatski": "Automatic",
  "ili izaberi igrača": "or pick a player",
  "dodaj igrača": "add a player",
  "Za svakog slobodnog igrača biramo njemu najbolji par: tvoj igrač koji je slabiji od realne zamene sa waivera i po stvarnoj vrednosti i po ceni na tržištu, sa ESPN vlasništvom ispod {n}%, koji nije zaključan ni na IR-u.": "For each free agent we pick the best match to drop: a player weaker than the realistic waiver replacement in both real value and market price, with ESPN ownership under {n}%, not locked and not on IR.",
  "Izbor važi za sve kartice. Ako izabereš više igrača, za svaku karticu biramo onog koji najviše odgovara.": "Your choice applies to all cards. If you pick several players, each card uses the one that fits best.",
  "Tvoj roster": "Your roster",
  "nikad ne predlaži za otpuštanje": "never suggest dropping",
  "Dobijaš u proseku {p}% mečeva u ovoj kategoriji": "You win {p}% of matchups in this category on average",
  "Istaknute su kategorije u kojima tvoj tim, sa trenutnim rosterom, gubi više od pola mečeva protiv ostalih timova lige. Punt kategorije se ne računaju.": "Highlighted are the categories where your current roster loses more than half of its matchups against the other teams in the league. Punted categories are not counted.",
  "Napomene": "Notes",
  "Stranice": "Pages",
  "Prethodna": "Previous",
  "Sledeća": "Next",
  "Tvoj roster je jači od onoga što je trenutno na waiveru": "Your roster is stronger than what's on waivers right now",
  "Nijedan tvoj igrač nije slabiji od realne zamene sa waivera i po stvarnoj vrednosti i po ceni na tržištu uz vlasništvo ispod {n}%. Igrači sa niskom stvarnom vrednošću, a višom cenom su Trejd kandidati. Ako ipak želiš nekog da otpustiš, izaberi ga gore.": "None of your players is weaker than the realistic waiver replacement in both real value and market price with ownership under {n}%. Players with low real value but a higher price are trade candidates. If you still want to drop someone, pick them above.",
  "Nijedna izmena ne popravlja tvoj tim dovoljno u odnosu na ostale timove lige. Ne spuštamo kriterijum da bi lista bila puna.": "No move improves your team enough against the other teams in the league. We don't lower the bar just to fill the list.",
  "Svaka izmena se računa kao trejd 1 za 1: FPts tvog tima po utakmici pre i posle (mešavina sezone, poslednjih 15 i 7 dana i projekcije).": "Each move is calculated as a 1 for 1 trade: your team's FPts per game before and after (a blend of the season, last 15 and last 7 days and the projection).",
  "Svaka izmena se računa kao trejd 1 za 1: zbirovi tvog tima pre i posle, pa koliko kategorija više dobijaš protiv ostalih timova lige (mešavina sezone, poslednjih 15 i 7 dana i projekcije).": "Each move is calculated as a 1 for 1 trade: your team totals before and after, then how many more categories you win against the other teams in the league (a blend of the season, last 15 and last 7 days and the projection).",
  "Do kraja nedelje meča: {a} ut. za {n1}, {b} za {n2}.": "Until the end of the matchup week: {a} games for {n1}, {b} for {n2}.",
  "Period": "Period",
  "Dolazi i odlazi": "In and out",
  "po utakmici": "per game",
  "Izmena popravlja tvoj tim u odnosu na ostale timove lige.": "The move improves your team against the other teams in the league.",
  'Ceo tim pre i posle': 'Whole team before and after',
  'Razlika između igrača koji dolazi i igrača koji odlazi, po utakmici, u izabranom periodu.': 'Difference between the player coming in and the player leaving, per game, in the selected period.',
  'Zbir proseka po utakmici svih aktivnih igrača tvog tima, pre i posle izmene, u izabranom periodu.': 'Sum of per-game averages of all active players on your team, before and after the move, in the selected period.',
  'Utakmice do kraja nedelje meča': 'Games left in the matchup week',
  'Ukupno do kraja nedelje meča': 'Total for the rest of the matchup week',
  'Igrač sa više utakmica ove nedelje donosi više ukupno, i kad je slabiji po utakmici.': 'A player with more games this week adds more in total, even if he is weaker per game.',
  "Dodaj igrača…": "Add a player…",
  "Tvoj tim": "Your team",
  "Poništi sve": "Reset all",
  "Dodaj igrače svog tima.": "Add your team's players.",
  "Dodaj igrače protivnika.": "Add the other team's players.",
  "U ovoj ligi još nema protivnika.": "This league has no other teams yet.",
  "Dodaj protivnika": "Add a team",
  "Roster ovog tima nije unet.": "This team's roster is not entered.",
  "Unesi roster": "Enter roster",
  "Koliko u tvoju korist": "How much in your favor",
  "Tražim trejdove…": "Searching for trades…",
  "Prekini": "Stop",
  "Strategija": "Strategy",
  "Fer: razlika u vrednosti do 10%. Malo u moju korist: do 12,5%. Agresivno: do 15%. Ako obeležiš igrača sa U trejd, granica je 5% šira. Alat uvek prvo nudi trejdove bliže fer.": "Fair: value difference up to 10%. Slightly in my favor: up to 12.5%. Aggressive: up to 15%. If you mark a player with Trade, the limit is 5% wider. The tool always offers trades closer to fair first.",
  "Pronađi trejdove": "Find trades",
  "Dobija {d} FPts po utakmici.": "They gain {d} FPts per game.",
  "Za njega je trejd skoro ravnopravan po FPts.": "For them the trade is almost even in FPts.",
  "Trejd je za njega ravnopravan po vrednosti.": "For them the trade is even in value.",
  "Dobija {c}, gde je {n}. u ligi.": "They gain {c}, where they rank {o} in the league.",
  "Dobija {c}, gde je slabiji od tebe.": "They gain {c}, where they are weaker than you.",
  "Dobija {c}.": "They gain {c}.",
  "Dajem ako mora": "Only for a good price",
  "Otpuštaš: {n}": "You drop: {n}",
  "Dobijaš slobodno mesto za igrača sa waivera.": "You get an open spot for a waiver pickup.",
  "Zašto bi prihvatio": "Why they might accept",
  "Obeležio si više od 4 igrača sa U trejd na jednoj strani.": "You marked more than 4 players with Trade on one side.",
  "Previše zaključanih igrača: nema koga da ponudiš ili koga da tražiš.": "Too many locked players: there is nobody to offer or nobody to ask for.",
  "Granica vrednosti je previše stroga za ova dva tima.": "The value limit is too strict for these two teams.",
  "Svaki trejd koji je fer po vrednosti protivniku previše smanjuje FPts.": "Every trade that is fair in value costs the other team too many FPts.",
  "Svaki trejd koji je fer po vrednosti protivniku previše šteti u kategorijama.": "Every trade that is fair in value hurts the other team too much in categories.",
  "Protivnik trenutno nema ono što tvom timu treba.": "The other team does not have what your team needs right now.",
  "Nijedan trejd sa tvojim igračima u formi iznad projekcije ne prolazi pravila fer trejda.": "No trade with your players who are playing above their projection passes the fair trade rules.",
  "Nijedan tvoj igrač nema formu znatno iznad projekcije.": "None of your players is playing well above their projection.",
  "Nijedan trejd sa njegovim igračima u lošoj formi ne prolazi pravila fer trejda.": "No trade with their slumping players passes the fair trade rules.",
  "Protivnik nema igrača sa dobrom projekcijom i formom znatno ispod nje.": "The other team has no player with a good projection who is playing well below it.",
  "Nijedan trejd ne prolazi pravila fer trejda sa ovim izborom.": "No trade passes the fair trade rules with these choices.",
  "probaj Agresivno": "try Aggressive",
  "zaključaj manje igrača": "lock fewer players",
  "izaberi drugu strategiju": "pick another strategy",
  "ili drugog protivnika": "or another team",
  "Nema trejdova koji prolaze": "No trades pass",
  "Šta možeš da promeniš": "What you can change",
  "Obeleži igrače ako želiš, izaberi strategiju i klikni Pronađi trejdove.": "Mark players if you want, pick a strategy and click Find trades.",
  "Promenio si izbor. Klikni Pronađi trejdove za nove predloge.": "You changed your choices. Click Find trades for new suggestions.",
  "Predlozi": "Suggestions",
  "Generiši novih 8": "Generate 8 more",
  "Generiši novih {n}": "Generate {n} more",
  "Izaberi tim sa kojim tražiš trejd.": "Pick the team you want to trade with.",
  "Za veto lige: dodaj {p} da bude {a}:{a}.": "For league veto: add {p} to make it {a} for {a}.",
  "Ili unesi oba tima ručno": "Or enter both teams manually",
  "Unesi oba tima": "Enter both teams",
  "Ručna": "Manual",
  "To su svi predlozi za ovaj izbor.": "Those are all suggestions for these choices.",
  "Rok za trejdove je prošao. Alat i dalje radi, za razmišljanje i sledeću sezonu.": "The trade deadline has passed. The tool still works, for planning and next season.",
  "Predlozi su trejdovi fer po vrednosti za obe strane, rangirani po tome koliko FPts po utakmici dobija tvoj tim (mešavina sezone, poslednjih 15 i 7 dana i projekcije).": "Suggestions are trades that are fair in value for both sides, ranked by how many FPts per game your team gains (a blend of the season, last 15 and last 7 days and the projection).",
  "Predlozi su trejdovi fer po vrednosti za obe strane, rangirani po tome koliko kategorija više dobijaš protiv ostalih timova lige (mešavina sezone, poslednjih 15 i 7 dana i projekcije).": "Suggestions are trades that are fair in value for both sides, ranked by how many more categories you win against the other teams in your league (a blend of the season, last 15 and last 7 days and the projection).",
  "Tvoje lige": "Your leagues",
  "Sačuvaj kao ligu": "Save as a league",
  "Najbolje za mene": "Best for me",
  "Popravi kategorije": "Improve categories",
  "Prodaj skupo": "Sell high",
  "Kupi jeftino": "Buy low",
  "Konsolidacija": "Consolidate",
  "Dubina": "Depth",
  "Trejdovi koji najviše popravljaju tvoj tim u odnosu na ostale timove lige.": "Trades that improve your team the most against the other teams in your league.",
  "Izaberi kategorije koje ti trebaju. Dobijaju veću težinu, a ostale ne smeju previše da padnu.": "Pick the categories you need. They get more weight, and the others cannot drop too much.",
  "Prednost trejdovima u kojima daješ igrače čija je forma (15 i 7 dana) znatno iznad projekcije.": "Prefers trades where you give players whose form (last 15 and 7 days) is well above their projection.",
  "Prednost trejdovima u kojima dobijaš igrače sa dobrom projekcijom čija je forma trenutno znatno ispod nje.": "Prefers trades where you get players with a good projection whose current form is well below it.",
  "Samo trejdovi u kojima daješ više igrača nego što dobijaš, za jačeg igrača i slobodno mesto.": "Only trades where you give more players than you get, for a stronger player and an open spot.",
  "Samo trejdovi u kojima dobijaš više igrača nego što daješ.": "Only trades where you get more players than you give.",
  "Fer": "Fair",
  "Malo u moju korist": "Slightly in my favor",
  "Agresivno": "Aggressive",
  "Zaključaj": "Lock",
  "U trejd": "Trade",
  "Igrač nikad ne ide u trejd.": "This player is never traded.",
  "Ne želim ga.": "I do not want him.",
  "Igrač sme u trejd, ali samo kad trejd donosi jasno veću korist.": "This player can be traded, but only when the trade brings a clearly bigger gain.",
  "Igrač mora biti u trejdu.": "This player must be in the trade.",
  "Želim ga, mora biti u trejdu.": "I want him, he must be in the trade.",
  "Nađi trejd sa ovim timom": "Find a trade with this team",
  "Nazad na Pronađi trejd": "Back to Find a trade",
  "Slobodno mesto: {p} (najbolji slobodan).": "Open spot: {p} (best free agent).",
  "Slobodno mesto: nivo zamene.": "Open spot: replacement level.",
  "Slobodno mesto": "Open spot",
  "Prosek igrača koje lako nađeš na waiveru": "Average of players you can easily find on waivers",
  "Slobodno mesto · najbolji slobodan": "Open spot · best free agent",
  "Daješ više igrača nego što dobijaš: slobodno mesto popunjavaš igračem sa waivera i to ulazi u rezultat. Uvezena liga: najbolji slobodan igrač, inače nivo zamene. Svog igrača sa waivera biraš u sekciji Moj tim.": "You give more players than you get: you fill the open spot from waivers, and that counts in the score. Imported league: the best free agent, otherwise replacement level. You pick your own waiver player in the My team section.",
  "Koga protivnik izbacuje menja njegov tim, ne tvoj rezultat.": "Who your opponent drops changes their team, not your score.",
  "Daješ više igrača nego što dobijaš, pa ti posle trejda ostaje slobodno mesto. Igrač sa waivera ulazi u rezultat trejda. Dok ga ne izabereš, računa se najbolji slobodan igrač (uvezena liga) ili nivo zamene.": "You give more players than you get, so you have an open spot after the trade. A waiver pickup counts in the trade score. Until you pick one, the best free agent (imported league) or replacement level is used.",
  "Ista mešavina perioda kao na kartici u Pronađi trejd. Izaberi period da vidiš samo njega.": "The same blend of periods as the card in Find a trade. Pick a period to see only that period.",
  "Mešavina": "Blend",
  "Mešavina kao na kartici u Pronađi trejd (sezona, 15 i 7 dana i projekcija)": "Blend as on the Find a trade card (season, 15 and 7 days and projection)",
  "Predlažu se samo trejdovi u kojima ne dobijaš više igrača nego što daješ, pa ne moraš nikog da otpustiš.": "Only trades where you do not get more players than you give, so you do not have to drop anyone.",
  "Dubina uvek dobija više igrača, a uključeno je Ne otpuštam nikoga.": "Depth always gets more players, and Don't drop anyone is on.",
  "Rosteri su se promenili, pokreni pretragu ponovo.": "Rosters have changed, run the search again.",
  "Sačuvano u Analizi trejda": "Saved in Trade analyzer",
  "Ne otpuštam nikoga": "Don't drop anyone",
  "Sačuvano": "Saved",
  "Otvori": "Open",
  "Daješ više igrača nego što dobijaš: slobodno mesto popunjavaš igračem sa waivera i to ulazi u rezultat. Uvezena liga: realna zamena (prosek 3. do 5. najboljeg zdravog slobodnog igrača), inače nivo zamene. Svog igrača sa waivera biraš u sekciji Moj tim.": "You give more players than you get: you fill the open spot from waivers, and that counts in the score. Imported league: a realistic replacement (average of the 3rd to 5th best healthy free agent), otherwise replacement level. You pick your own waiver player in the My team section.",
  "Prosek 3. do 5. najboljeg zdravog slobodnog igrača u ligi (igrač na waiveru se računa sa umanjenjem jer nije zagarantovan). Najbolji slobodan igrač bi bio previše optimističan.": "Average of the 3rd to 5th best healthy free agent in the league (a player on waivers counts with a discount because he is not guaranteed). The best free agent would be too optimistic.",
  'Realna zamena sa waivera': 'Realistic waiver replacement',
  'Prosek 3. do 5. najboljeg zdravog slobodnog': 'Average of the 3rd to 5th best healthy free agent',
  'Slobodno mesto: realna zamena sa waivera.': 'Open spot: realistic waiver replacement.',
  'Protivnik otpušta: {list}': 'Opponent drops: {list}',
  'ide na IR': 'goes to IR',
  'do kraja sezone': 'out for the season',
  'nema procene': 'no estimate',
  'povratak za oko {n} {u}': 'back in about {n} {u}',
  'Ima {n} {k}, a {m} IR {s}.': 'Has {n} {k} and {m} IR {s}.',
  'Bori se za plejof i treba mu produkcija sada.': 'Fighting for the playoffs and needs production now.',
  'Pri dnu je tabele, pa mu je manje važno da čeka povratak.': 'Near the bottom of the standings, so waiting for a return matters less.',
  'Ima slobodno IR mesto, pa može da sačeka povratak.': 'Has an open IR spot, so he can wait for the return.',
  'Za povređenog igrača odmah dobija zdravog.': 'Gets a healthy player right away for an injured one.',
  'Ovo bih uradio': "I'd do this",
  'Ovo je loše': 'This is bad',
  'Ocena sačuvana': 'Rating saved',
  'Ocene predloga': 'Proposal ratings',
  'Tvoje ocene 👍 i 👎 sa kartica u Pronađi trejd i Pojačanja sa FA. Čuvaju se samo u ovom browseru i ne menjaju predloge. Trenutno: {n}.': 'Your 👍 and 👎 ratings from the cards in Find a trade and Free agent pickups. They are saved only in this browser and do not change the proposals. Now: {n}.',
  'Izvezi ocene predloga': 'Export proposal ratings',
  'Obriši ocene': 'Delete ratings',
  'Još nema ocena': 'No ratings yet',
  'Obrisati ocene predloga?': 'Delete proposal ratings?',
  'Sve ocene ({n}) biće trajno obrisane iz ovog browsera. Ovo ne može da se vrati, osim iz izvezenog fajla.': 'All ratings ({n}) will be permanently deleted from this browser. This cannot be undone, except from an exported file.',
  'Ocene su obrisane': 'Ratings deleted',
  'Kad se {ir} vrati sa IR-a, otpuštaš: {n}': 'When {ir} returns from IR, you drop: {n}',
  'Dok je {ir} na IR-u, slobodno mesto popunjava igrač sa waivera.': 'While {ir} is on IR, a waiver pickup fills the open spot.',
  'kad se {n} vrati': 'when {n} returns',
  'dok je {n} na IR-u': 'while {n} is on IR',
  "Bez drugih timova: kandidati su svi NBA igrači koji nisu na tvom rosteru. Kartica pokazuje šta igrač donosi tvom timu, ako uđe umesto tvog najslabijeg igrača.": "Without other teams, the candidates are all NBA players who are not on your roster. Each card shows what the player brings to your team if he replaces your weakest player.",
  "Blizu si sledećeg tima u {c}": "You are close to the next team in {c}",
  "Daješ i dobijaš": "You give and you get",
  "Dodaj igrače sa svog rostera da vidiš mete.": "Add the players on your roster to see targets.",
  "Dodaj na listu želja": "Add to wishlist",
  "Forma i uloga": "Form and role",
  "Forma ispod sezone u poslednjih 15 i 7 dana": "Form below his season level in the last 15 and 7 days",
  "Igrači sa drugih timova u ligi koji najviše dižu FPts tvog tima, a realno ih je dobiti. Za svakog tražimo i fer trejd sa tvojim rosterom.": "Players on other teams in your league who add the most FPts to your team and are realistic to get. For each one we also look for a fair trade from your roster.",
  "Igrači sa drugih timova u ligi koji najviše popravljaju kategorije koje ti trebaju, a realno ih je dobiti. Za svakog tražimo i fer trejd sa tvojim rosterom.": "Players on other teams in your league who improve the categories you need the most and are realistic to get. For each one we also look for a fair trade from your roster.",
  "Ili unesi svoj tim": "Or enter your team",
  "Istaknute su kategorije u kojima je tvoj roster najslabiji. Punt kategorije se ne računaju.": "Highlighted are the categories where your roster is weakest. Punted categories do not count.",
  "Klikni ♡ na kartici da igrača sačuvaš ovde.": "Tap ♡ on a card to save the player here.",
  "Lista želja": "Wishlist",
  "Mete": "Targets",
  "Mogući trejd": "Possible trade",
  "Mogući trejd: računam…": "Possible trade: calculating…",
  "Nema fer trejda sa tvojim rosterom": "No fair trade with your roster",
  "Nema posebnog razloga, osim fer vrednosti trejda.": "No special reason, other than a fair trade value.",
  "Nema utakmica.": "No games.",
  "Nije ni u jednom unetom timu": "Not on any team you entered",
  "Nijedan igrač ne popravlja tvoj tim u odnosu na sadašnje stanje.": "No player improves your team compared to how it stands now.",
  "Plejof": "Playoffs",
  "Poslednje utakmice": "Last games",
  "Povreda": "Injury",
  "Predloži trejd sa ovim igračem": "Suggest trades with this player",
  "Procena bez protivnika: ulazi umesto {n}": "Estimate without an opponent: replaces {n}",
  "Razlika u zbiru tvog tima posle trejda, po utakmici, u izabranom periodu.": "Change in your team totals after the trade, per game, in the selected period.",
  "Sada u tvom timu": "Now on your team",
  "Stabilni minuti": "Stable minutes",
  "Stabilnost minuta: {p}%": "Minutes stability: {p}%",
  "Stvarna vrednost veća od cene na tržištu": "Real value above his market price",
  "To su sve mete za ovaj izbor.": "Those are all targets for this choice.",
  "Trenutno nema meta koje bi ti pomogle": "No targets would help you right now",
  "U formi: poslednjih 15 i 7 dana iznad sezone": "In form: last 15 and 7 days above his season",
  "Ukloni sa liste želja": "Remove from wishlist",
  "Unesi roster tima u kome je igrač. Igrač je već dodat i biće obeležen sa U trejd.": "Enter the roster of the team that has this player. The player is already added and will be marked Trade.",
  "Vlasnik ima višak u {c}": "The manager has a surplus in {c}",
  "Vlasnik ima {n} {k}, a {m} IR {s}": "The manager has {n} {k} and {m} IR {s}",
  "Vlasnik je pri dnu tabele": "The manager is near the bottom of the standings",
  "Vlasniku treba {c}, gde si ti jak": "The manager needs {c}, where you are strong",
  "Zašto bi vlasnik pristao": "Why the manager would accept",
  "Zbir proseka po utakmici svih aktivnih igrača tvog tima, pre i posle trejda, u izabranom periodu.": "Per game totals of all active players on your team, before and after the trade, in the selected period.",
  "za": "for",
  "{d} FPts po utakmici umesto {n}": "{d} FPts per game over {n}",
  "{n} {u} u nedeljama plejofa": "{n} {u} in the playoff weeks",
  "{r}, a ti imaš slobodno IR mesto": "{r}, and you have a free IR spot",
  "Nazad na Mete za trejd": "Back to Trade targets",
  "Dodaj svog igrača…": "Add your player…",
  "Igrači sa drugih timova u ligi koji najviše dižu FPts tvog tima, a realno ih je dobiti. Klikni na ime za izveštaj i mogući fer trejd.": "Players on other teams in your league who add the most FPts to your team and are realistic to get. Tap a name for the report and a possible fair trade.",
  "Igrači sa drugih timova u ligi koji najviše popravljaju kategorije koje ti trebaju, a realno ih je dobiti. Klikni na ime za izveštaj i mogući fer trejd.": "Players on other teams in your league who improve the categories you need the most and are realistic to get. Tap a name for the report and a possible fair trade.",
  "Izaberi drugi trejd sa ovim igračem": "Choose another trade with this player",
  "Klik uklanja": "Click to remove",
  "Ne dam:": "Untouchable:",
  "Nema fer trejda do 2 za 2 sa tvojim rosterom": "No fair trade up to 2 for 2 with your roster",
  "Ovi igrači ne ulaze ni u jedan trejd sa bilo kojim timom u ligi. Isti Lock kao u Pronađi trejd.": "These players stay out of every trade with any team in the league. Same Lock as in Find a trade.",
  "Predloži trejd": "Suggest trades",
  "Računam mogući trejd…": "Calculating a possible trade…",
  "Ukloniti i zaključane igrače za celu ligu?": "Also remove the players locked for the whole league?",
  "Važi za sve protivnike u ovoj ligi": "Applies to all opponents in this league",
  "Zadrži": "Keep",
  "Zeleno: FPts, jer igrač diže FPts tvog tima.": "Green: FPts, because the player adds FPts to your team.",
  "Zeleno: kategorija koja ti treba, a igrač je u njoj jak.": "Green: a category you need where the player is strong.",
  "ako uđe umesto {n}": "if he replaces {n}",
  "do 2 za 2, Najbolje za mene, Fer": "up to 2 for 2, Best for me, Fair",
  "nijedan igrač": "no players",
  "Šta ti donosi": "What he brings you",
  "Rezultat za ostatak sezone, kao u Pronađi trejd. Tabele prate izabrani period.": "Result for the rest of the season, as in Find a trade. The tables follow the selected period.",
  "Kako se računa slobodno mesto": "How the open spot is counted",
  "Realna zamena": "Realistic replacement",
  "Izaberi igrača": "Pick a player",
  "Ne računaj": "Don't count",
  "Ne računa se": "Not counted",
  "Mesto ostaje prazno, poredi se samo ko ide i ko dolazi.": "The spot stays empty, only who leaves and who arrives is compared.",
  "Koga uzimaš sa waivera…": "Who do you pick up from waivers…",
  "Dok ne izabereš igrača, računa se realna zamena.": "Until you pick a player, the realistic replacement counts.",
  "Ne znamo da li je igrač stvarno slobodan u tvojoj ligi.": "We do not know if the player is really free in your league.",
  "Daješ više igrača nego što dobijaš. Slobodno mesto se ne računa: poredi se samo ko ide i ko dolazi.": "You give more players than you get. The open spot is not counted: only who leaves and who arrives is compared.",
  "Daješ više igrača nego što dobijaš. Slobodno mesto popunjava igrač kog izabereš u redu Slobodno mesto. Dok ga ne izabereš, računa se realna zamena.": "You give more players than you get. The open spot is filled by the player you pick in the Open spot row. Until you pick one, the realistic replacement counts.",
  "Daješ više igrača nego što dobijaš. Slobodno mesto se računa kao realna zamena sa waivera (uvezena liga) ili nivo zamene. U redu Slobodno mesto možeš da izabereš svog igrača ili da se mesto ne računa.": "You give more players than you get. The open spot counts as a realistic waiver replacement (imported league) or replacement level. In the Open spot row you can pick your own player or not count the spot.",
  "Kako se računa slobodno mesto biraš gore, u redu Slobodno mesto u kartici Dobijaš.": "You choose how the open spot is counted above, in the Open spot row of the You get card.",
  "Dok ne izabereš igrača, računa se nivo zamene.": "Until you pick a player, replacement level counts.",
  "Daješ više igrača nego što dobijaš. Slobodno mesto popunjava igrač kog izabereš u redu Slobodno mesto. Dok ga ne izabereš, računa se nivo zamene.": "You give more players than you get. The open spot is filled by the player you pick in the Open spot row. Until you pick one, replacement level counts.",
  "{n} je van do kraja sezone i ne računa se.": "{n} is out for the season and is not counted.",
  "{n} su van do kraja sezone i ne računaju se.": "{n} are out for the season and are not counted.",
  'Novo: javi nam ako nešto nije uvezeno kako treba.': 'New: let us know if something was not imported correctly.',
  // Uvezena liga: podešavanja i kontekst cele lige
  'na {n}. mestu ({r})': 'in place {n} ({r})',
  'Liga: ti si {a}': 'League: you are {a}',
  '{name} je {a}': '{name} is {a}',
  'Poeni za celu sezonu: ti si {a}. od {m}{o}': 'Season points for: you rank {a} of {m}{o}',
  ', {name} je {b}.': ', {name} ranks {b}.',
  'Tvoj plasman po kategorijama: najjači {s}, najslabiji {w}': 'Your league rank by category: strongest {s}, weakest {w}',
  '{name} po kategorijama: najjači {s}, najslabiji {w}': '{name} by category: strongest {s}, weakest {w}',
  'Procena plasmana posle trejda: {list}': 'Estimated rank after the trade: {list}',
  'Procena plasmana posle trejda: plasman po kategorijama se ne menja.': 'Estimated rank after the trade: no category rank changes.',
  'Liga je povezana sa platformom {p}. Naziv, timovi, format, roster mesta i tabela dolaze iz lige i menjaju se samo tamo.': 'This league is linked to {p}. Name, teams, format, roster spots and standings come from the league and can only be changed there.',
  'Roster': 'Roster',
  '{a} aktivnih + {b} IR': '{a} active + {b} IR',
  '(iz plasmana)': '(from standings)',
  'Liga na platformi': 'League on platform',
  'sezona {s}': 'season {s}',
  'Poslednje osvežavanje': 'Last refresh',
  'Prekini vezu sa platformom {p}': 'Unlink from {p}',
  'Prekinuti vezu sa platformom {p}?': 'Unlink from {p}?',
  'Liga ostaje sa poslednjim povučenim podacima i postaje obična liga: rosteri, tabela i podešavanja se dalje menjaju ručno, a osvežavanje prestaje. Vezu možeš ponovo da uspostaviš dugmetom Uvezi ligu.': 'The league keeps the last synced data and becomes a regular league: rosters, standings and settings are edited by hand from now on and refreshing stops. You can link it again with the Import league button.',
  'Prekini vezu': 'Unlink',
  // Uvoz lige (faza 3.7)
  "Roster se povlači iz ESPN-a": "Roster is pulled from ESPN",
  "Roster se povlači sa platforme {p}": "Roster is pulled from {p}",
  "Osveži iz ESPN-a": "Refresh from ESPN",
  "Osveži sa platforme {p}": "Refresh from {p}",
  "Kako?": "How?",
  "Osveženo {ago}": "Refreshed {ago}",
  "Osvežavam…": "Refreshing…",
  "Rok za trejdove je prošao.": "The trade deadline has passed.",
  "{n} h": "{n} h",
  "Rok za trejdove: {d} (još {n}).": "Trade deadline: {d} ({n} left).",
  "{p} trenutno ne odgovara. Prikazujem podatke od osvežavanja {ago}.": "{p} is not responding right now. Showing data from the refresh {ago}.",
  "{p} više ne dozvoljava čitanje ove lige, verovatno je postala privatna. Prikazujem poslednje povučene podatke ({ago}).": "{p} no longer lets us read this league, it was probably made private. Showing the last data we pulled ({ago}).",
  "Kako da liga ponovo bude javna": "How to make the league public again",
  "U H2H ligi ovo je samo informativno: nedeljni mečevi se računaju posebno.": "In an H2H league this is for information only: weekly matchups are scored separately.",
  "Tim": "Team",
  "Procena plasmana u ligi posle trejda": "Estimated league rank after the trade",
  "Procena čeka raspored utakmica.": "The estimate is waiting for the game schedule.",
  "Procena": "Estimate",
  "Promena": "Change",
  "Procena: (Dobijaš − Daješ) po utakmici × preostale utakmice NBA timova, dodato na zbir tvog tima iz {p}. Ostali timovi ostaju isti. FG% i FT% se računaju iz pogodaka i pokušaja.": "Estimate: (You get − You give) per game × remaining games of the NBA teams, added to your team totals from {p}. Other teams stay the same. FG% and FT% are computed from makes and attempts.",
  "U H2H ligi ovo je samo informativno.": "In an H2H league this is for information only.",
  "Uskoro": "Coming soon",
  "ESPN javna liga": "ESPN public league",
  "Uvozimo timove, rostere, bodovanje i tabelu preko ID-ja lige.": "We import teams, rosters, scoring and standings from the league ID.",
  "Sleeper liga": "Sleeper league",
  "Unesi korisničko ime ili ID lige.": "Enter a username or league ID.",
  "Fantrax javna liga": "Fantrax public league",
  "Unesi ID lige ili link ka ligi.": "Enter the league ID or a link to the league.",
  "Yahoo, CBS ili druga platforma: Nalepi roster": "Yahoo, CBS or another platform: Paste roster",
  "Kopiraj stranicu tima i nalepi tekst. Igrače prepoznajemo sami.": "Copy the team page and paste the text. We recognize the players for you.",
  "Ručni unos": "Manual entry",
  "Napravi ligu i sam unesi igrače.": "Create a league and enter players yourself.",
  "ESPN privatna liga": "ESPN private league",
  "Za sada uvozimo samo javne lige.": "For now we only import public leagues.",
  "Pogledaj kako da ligu označiš kao javnu.": "See how to make your league public.",
  "Yahoo automatski uvoz": "Yahoo automatic import",
  "Do tada koristi Nalepi roster.": "Until then, use Paste roster.",
  "Uvezi ESPN ligu": "Import ESPN league",
  "ID lige ili link ka ligi": "League ID or link to the league",
  "npr. 123456 ili link sa leagueId=": "e.g. 123456 or a link with leagueId=",
  "Gde da nađem ID?": "Where do I find the ID?",
  "Ne vidim ID lige. Unesi broj (npr. 123456) ili link ka ligi u kome piše leagueId=.": "We can't see a league ID. Enter a number (e.g. 123456) or a league link that contains leagueId=.",
  "Uvezi Sleeper ligu": "Import Sleeper league",
  "Sleeper korisničko ime, ID lige ili link": "Sleeper username, league ID or link",
  "npr. korisnicko_ime ili 1180226123456789012": "e.g. username or 1180226123456789012",
  "Unesi Sleeper korisničko ime (bez razmaka) ili ID lige.": "Enter a Sleeper username (no spaces) or a league ID.",
  "Uvezi Fantrax ligu": "Import Fantrax league",
  "npr. link sa /league/ u adresi": "e.g. a link with /league/ in the address",
  "Ne vidim ID lige. Nalepi link ka ligi (deo posle /league/).": "We can't see a league ID. Paste the league link (the part after /league/).",
  "Samo javne lige. Ne tražimo lozinku, prijavu ni kolačiće.": "Public leagues only. We never ask for a password, login or cookies.",
  "Uvezi": "Import",
  "Ova liga je privatna. LM mora da je označi kao javnu.": "This league is private. The LM needs to make it public.",
  "Pogledaj kako": "See how",
  "Ova liga nije javna. Komesar mora da uključi javni pregled lige.": "This league isn't public. The commissioner needs to turn on public viewing.",
  "Liga nije pronađena. Proveri ID.": "League not found. Check the ID.",
  "Korisnik nije pronađen na Sleeperu. Proveri korisničko ime.": "User not found on Sleeper. Check the username.",
  "Ovaj korisnik nema NBA ligu na Sleeperu za ovu sezonu.": "This user has no NBA league on Sleeper this season.",
  "Ovaj korisnik ima više liga. Izaberi jednu:": "This user has several leagues. Pick one:",
  "ESPN trenutno ne odgovara, probaj ponovo.": "ESPN isn't responding right now, try again.",
  "{p} trenutno ne odgovara, probaj ponovo.": "{p} isn't responding right now, try again.",
  "Povlačim ligu ({p})…": "Pulling the league ({p})…",
  "Liga je već dodata": "League already added",
  "„{n}” već postoji u tvojim ligama.": "“{n}” is already in your leagues.",
  "Otvori ligu": "Open league",
  "Neke stavke bodovanja ne podržavamo, rezultat je približan": "Some scoring items aren't supported, so results are approximate",
  "Nismo prepoznali {n} igrača sa rostera: {list}.": "We couldn't match {n} roster players: {list}.",
  "Koji je tvoj tim?": "Which team is yours?",
  "{n} timova": "{n} teams",
  "Ne prepoznajemo format ove lige. Izaberi ga ručno.": "We don't recognize this league's format. Pick it manually.",
  "Izaberi format lige.": "Pick the league format.",
  "Možeš da ga promeniš kasnije u podešavanjima lige.": "You can change it later in league settings.",
  "Izaberi svoj tim.": "Pick your team.",
  "Nalepi ponovo: {n}": "Paste again: {n}",
  "Nalepi roster": "Paste roster",
  "Na svojoj platformi (Yahoo, CBS, Fantrax…) otvori stranicu sa rosterom jednog tima.": "On your platform (Yahoo, CBS, Fantrax…) open the roster page of one team.",
  "Označi celu stranicu (Ctrl+A, na Macu Cmd+A) i kopiraj (Ctrl+C ili Cmd+C).": "Select the whole page (Ctrl+A, Cmd+A on a Mac) and copy it (Ctrl+C or Cmd+C).",
  "Nalepi ovde. Statistike, pozicije i statuse ignorišemo, tražimo samo imena igrača.": "Paste it here. We ignore stats, positions and statuses and only look for player names.",
  "Ime tima": "Team name",
  "kako se tim zove u ligi": "the team's name in the league",
  "Ovo je moj tim": "This is my team",
  "Tekst sa stranice tima": "Text from the team page",
  "Nalepi ovde…": "Paste here…",
  "Prepoznaj igrače": "Find players",
  "Upiši naziv lige.": "Enter the league name.",
  "Upiši ime tima.": "Enter the team name.",
  "Nalepi tekst sa stranice tima.": "Paste the text from the team page.",
  "Prepoznajem igrače…": "Finding players…",
  "Nismo našli nijedno ime igrača. Proveri da li si nalepio stranicu sa rosterom.": "We didn't find any player names. Check that you pasted the roster page.",
  "Preskoči": "Skip",
  "Upiši ime igrača ili ostavi prazno": "Type a player name or leave empty",
  "Proveri igrače": "Check players",
  "Prepoznato igrača: {n}. Skini kvačicu sa onih koji nisu u timu.": "Players found: {n}. Untick anyone who isn't on the team.",
  "Više mogućih igrača": "Several possible players",
  "Neprepoznate linije": "Unrecognized lines",
  "Upiši ime igrača (predlozi se pojavljuju dok kucaš) ili ostavi prazno da preskočiš.": "Type the player's name (suggestions appear as you type) or leave it empty to skip.",
  "Sačuvaj i dodaj još jedan tim": "Save and add another team",
  "Sačuvaj tim": "Save team",
  "Izaberi bar jednog igrača.": "Pick at least one player.",
  "Uvoz: {p}": "Import: {p}",
  "Liga {id}, sezona {s}.": "League {id}, season {s}.",
  "Roster, tabela i broj mesta dolaze sa platforme.": "Rosters, standings and roster spots come from the platform.",
  "Rosteri su nalepljeni. Svaki tim možeš da nalepiš ponovo na stranici Liga.": "Rosters were pasted. You can paste any team again on the League page.",
  "Trejd ide u Istoriju kao obavljen. Rosteri se ne menjaju ručno: povlače se iz {p} kad platforma obradi trejd.": "The trade goes to History as done. Rosters aren't edited by hand: they are pulled from {p} once the platform processes the trade.",
  "Sačuvaj u Istoriju": "Save to History",
  "Liga je uvezena, ali tvoj tim još nije izabran. Izaberi ga u podešavanjima lige.": "The league is imported, but your team isn't picked yet. Pick it in league settings.",
  "Nalepi ponovo": "Paste again",
  "Nalepi tim": "Paste team",
  "Trejd je u Istoriji kao obavljen. Rosteri se osvežavaju sa platforme.": "The trade is in History as done. Rosters refresh from the platform.",
  "Uvezi ligu": "Import league",
  "Uvoz lige": "League import",
  "Uvezi u ovu ligu": "Import into this league",
  "Uvoz ide u ligu „{n}”: rosteri i timovi se zamenjuju podacima sa platforme, a istorija i otvoreni trejdovi ostaju.": "Importing into “{n}”: rosters and teams are replaced with data from the platform, while history and open trades stay.",
  "Rosteri i timovi lige „{n}” biće zamenjeni podacima sa platforme. Istorija i otvoreni trejdovi ostaju.": "Rosters and teams of “{n}” will be replaced with data from the platform. History and open trades stay.",
  "Rosteri su nalepljeni. Svaki tim možeš da nalepiš ponovo na stranici Liga, ili uvezi celu ligu sa ESPN-a.": "Rosters were pasted. You can paste any team again on the League page, or import the whole league from ESPN.",
  "Povuci timove i rostere sa ESPN-a ili nalepi roster sa Yahoo, CBS i drugih platformi. Ova liga postaje uvezena, istorija i otvoreni trejdovi ostaju.": "Pull teams and rosters from ESPN or paste a roster from Yahoo, CBS and other platforms. This league becomes imported, while history and open trades stay.",
};
function t(sr, vars) {
  let out = (LANG === 'en' && EN[sr]) || sr;
  if (vars) out = out.replace(/\{(\w+)\}/g, (m, k) => (vars[k] ?? m));
  return out;
}
/** Množina: srpski (1 / 2-4 / 5+) i engleski (1 / više) */
function plural(n, sr, en) {
  if (LANG === 'en') return n === 1 ? en[0] : en[1];
  return n % 10 === 1 && n % 100 !== 11 ? sr[0] : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? sr[1] : sr[2];
}
const LOCALE = () => (LANG === 'en' ? 'en-US' : 'sr-Latn');
/** Srpski: evropski datum bez razmaka (23.11.2026.), engleski ostaje po en-US. utc = čitaj dan po UTC (datumi bez vremena) */
const pad2 = n => String(n).padStart(2, '0');
function euDate(v, { year = false, time = false, utc = false } = {}) {
  const d = new Date(v);
  const D = utc ? d.getUTCDate() : d.getDate(), M = (utc ? d.getUTCMonth() : d.getMonth()) + 1, Y = utc ? d.getUTCFullYear() : d.getFullYear();
  return `${D}.${M}.${year ? `${Y}.` : ''}${time ? ` ${pad2(d.getHours())}:${pad2(d.getMinutes())}` : ''}`;
}
function setLang(l) {
  LANG = l;
  document.documentElement.lang = l;
  try { localStorage.setItem(LANG_KEY, JSON.stringify(l)); } catch {}
  applyStaticText();
  saveState();
  render();
}
/** Statični tekst u HTML-u (zaglavlje, futer) */
function applyStaticText() {
  const gear = document.querySelector('.gear');
  if (gear) { gear.title = t('Podešavanja i rezervna kopija'); gear.setAttribute('aria-label', t('Podešavanja')); }
  if (EMBED) return;
  document.title = t('Moje lige') + ' | RosterSwing';
  window.RSNav?.setLang(LANG); // zajedničko zaglavlje prati jezik aplikacije
  const ft = document.querySelector('footer.appfoot');
  if (ft) ft.textContent = t('Podaci: javni {src} fantasy API (nezvaničan). Prosek po utakmici.', { src: DATA_SOURCE.name });
  document.querySelectorAll('[data-langsel]').forEach(sel => { sel.value = LANG; });
}

/* =====================================================================
   Uvoz lige: čiste funkcije (bez DOM-a i mreže). Testovi: node tools/test_import.js
   ===================================================================== */
/** ESPN league ID iz broja ili URL-a (…?leagueId=123456…). Vraća string ili null. */
function parseEspnLeagueId(input) {
  const s = String(input ?? '').trim();
  if (/^\d{3,12}$/.test(s)) return s;
  const m = s.match(/[?&#]leagueId=(\d{3,12})\b/i);
  return m ? m[1] : null;
}
/** Fantrax league ID: deo URL-a posle /league/ ili sam ID (slova i brojevi) */
function parseFantraxLeagueId(input) {
  const s = String(input ?? '').trim();
  const m = s.match(/fantrax\.com\/(?:fantasy|newui\/fantasy)?\/?league\/([a-z0-9]{6,24})/i) || s.match(/[?&]leagueId=([a-z0-9]{6,24})\b/i);
  if (m) return m[1].toLowerCase();
  return /^[a-z0-9]{6,24}$/i.test(s) && /[a-z]/i.test(s) && /\d/.test(s) ? s.toLowerCase() : null;
}
/** Sleeper: URL lige ili broj lige -> { leagueId }; inače korisničko ime -> { username }; prazno -> null */
function parseSleeperInput(input) {
  const s = String(input ?? '').trim();
  if (!s) return null;
  const m = s.match(/sleeper\.(?:com|app)\/leagues\/(\d{6,25})/i);
  if (m) return { leagueId: m[1] };
  if (/^\d{10,25}$/.test(s)) return { leagueId: s };
  return /^[A-Za-z0-9_.-]{2,30}$/.test(s) ? { username: s } : null;
}

const NAME_SUFFIXES = new Set(['jr', 'sr', 'ii', 'iii', 'iv', 'v']);
/** Ključ imena: bez dijakritika, tačaka, apostrofa i sufiksa (Jr., III); "Jokic, Nikola" -> "nikola jokic" */
function nameKey(raw) {
  let s = String(raw ?? '');
  if (/^[^,]+,\s*[^,]+$/.test(s.trim())) { const [last, first] = s.split(','); s = `${first} ${last}`; } // Fantrax: "Prezime, Ime"
  s = s.toLowerCase().replace(/đ/g, 'dj').replace(/ø/g, 'o').replace(/ł/g, 'l').replace(/ß/g, 'ss')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/['’`.]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  const w = s.split(' ').filter(Boolean);
  while (w.length > 2 && NAME_SUFFIXES.has(w[w.length - 1])) w.pop();
  return w.join(' ');
}
/** Indeks imena za prepoznavanje: pun ključ, "inicijal + prezime" i spojeno ime (PJ = P.J.) */
function buildNameIndex(pool) {
  const full = new Map(), short = new Map();
  const add = (m, k, id) => { if (!k) return; const a = m.get(k) || []; if (!a.includes(id)) a.push(id); m.set(k, a); };
  for (const p of pool) {
    const k = nameKey(p.name); if (!k) continue;
    const w = k.split(' ');
    add(full, k, p.id);
    if (w.length >= 2) add(short, `${w[0][0]} ${w.slice(1).join(' ')}`, p.id);
  }
  return { full, short, byId: new Map(pool.map(p => [p.id, p])) };
}
/**
 * Jedno ime -> { id } (jednoznačno), { ambiguous: [ids] } ili null.
 * Hvata i "N. Jokic" / "N Jokic" kada samo jedan igrač odgovara.
 */
function matchName(raw, index) {
  const k = nameKey(raw); if (!k) return null;
  const hit = index.full.get(k);
  if (hit) return hit.length === 1 ? { id: hit[0] } : { ambiguous: hit };
  const w = k.split(' ');
  if (w.length >= 2 && w[0].length === 1) {
    const s = index.short.get(k);
    if (s) return s.length === 1 ? { id: s[0] } : { ambiguous: s };
  }
  // nadimak ili puno ime: "Ron Holland" = "Ronald Holland II", "Nicolas Claxton" = "Nic Claxton"; isto prezime, jedno ime počinje drugim, samo jedan igrač
  if (w.length >= 2 && w[0].length >= 3) {
    const rest = w.slice(1).join(' ');
    const c = (index.short.get(`${w[0][0]} ${rest}`) || []).filter(id => {
      const f = nameKey(index.byId.get(id)?.name || '').split(' ')[0] || '';
      return f.length >= 3 && (f.startsWith(w[0]) || w[0].startsWith(f));
    });
    if (c.length === 1) return { id: c[0] };
  }
  return null;
}
/** Reči koje nisu deo imena (pozicije, statusi, zaglavlja tabela, timske skraćenice) */
const ROSTER_NOISE = new Set(('pg sg sf pf c g f gf fc util ut bn be bench ir il inj injured gtd dtd o out q p d ques prob susp sspd na nr ' +
  'starters starter reserves players player pos position status opp team stats totals total season proj projected rank ' +
  'min fgm fga fg ftm fta ft pm pts reb ast stl blk to tov gp gs ' +
  'atl bos bkn brk cha chi cle dal den det gs gsw hou ind lac lal mem mia mil min no nop ny nyk okc orl phi phx pho por sac sa sas tor uta utah was wsh ' +
  'vs at am pm fa w l add drop trade edit').split(' '));
/**
 * Tekst sa stranice tima (bilo koja platforma) -> { matched: [{ id, text }], ambiguous: [{ text, ids }], unmatched: [text] }.
 * U svakom redu traži 2 do 4 uzastopne reči koje čine ime (najduže prvo); brojke, pozicije i statusi se preskaču.
 */
function parseRosterText(text, index) {
  const matched = [], ambiguous = [], unmatched = [], seen = new Set();
  for (const lineRaw of String(text ?? '').split(/\r?\n/)) {
    const line = lineRaw.replace(/\t/g, ' ').replace(/\s+/g, ' ').trim();
    if (!line || !/[A-Za-zÀ-ž]{2}/.test(line)) continue;
    // reči sa slovima (i inicijali sa tačkom); brojke i znakovi su granice
    const words = line.split(/[\s,()|/•·]+/).filter(Boolean);
    const isWord = w => /^[A-Za-zÀ-ž][A-Za-zÀ-ž'’.-]*$/.test(w);
    let found = false;
    for (let i = 0; i < words.length; i++) {
      for (let len = 4; len >= 2; len--) {
        const seg = words.slice(i, i + len);
        if (seg.length < len || !seg.every(isWord)) continue;
        const m = matchName(seg.join(' '), index);
        if (!m) continue;
        if (m.id != null) { if (!seen.has(m.id)) { seen.add(m.id); matched.push({ id: m.id, text: seg.join(' ') }); } }
        else ambiguous.push({ text: seg.join(' '), ids: m.ambiguous });
        found = true; i += len - 1; break;
      }
    }
    if (found) continue;
    // red koji liči na ime (2-4 reči sa velikim slovom, bez šuma), a nije prepoznat
    const cand = words.filter(w => isWord(w) && !ROSTER_NOISE.has(nameKey(w)));
    if (cand.length >= 2 && cand.length <= 4 && cand.every(w => /^[A-ZÀ-Ž]/.test(w)) && words.length <= 8) unmatched.push(cand.join(' '));
  }
  return { matched, ambiguous, unmatched };
}

/**
 * Plasman po kategoriji (1 = najbolji). teams: [{ id, vals: { key: vrednost } }], cats: [{ key, lowerIsBetter, made?, att? }].
 * Odnosi (made/att) se računaju ponderisano iz zbirova kad zbirovi postoje, inače iz gotove vrednosti.
 * Nerešeno deli bolji plasman. Vraća { [teamId]: { [key]: rank } }.
 */
function rotoRanks(teams, cats) {
  const out = Object.fromEntries(teams.map(t => [t.id, {}]));
  for (const c of cats) {
    const val = t => (c.made && c.att && t.vals[c.made] != null && t.vals[c.att] > 0 ? t.vals[c.made] / t.vals[c.att] : t.vals[c.key]);
    const list = teams.map(t => ({ id: t.id, v: val(t) })).filter(x => x.v != null && Number.isFinite(x.v));
    for (const x of list) {
      const better = list.filter(y => (c.lowerIsBetter ? y.v < x.v - 1e-9 : y.v > x.v + 1e-9)).length;
      out[x.id][c.key] = better + 1;
    }
  }
  return out;
}
/** Procena plasmana posle trejda: totale tima myId promeni za delta (po ključu, i za made/att), pa rangiraj ponovo */
function rotoProjection(teams, myId, delta, cats) {
  const before = rotoRanks(teams, cats)[myId] || {};
  const moved = teams.map(t => (t.id !== myId ? t : { ...t, vals: Object.fromEntries(Object.entries(t.vals).map(([k, v]) => [k, v != null && delta[k] != null ? v + delta[k] : v])) }));
  const after = rotoRanks(moved, cats)[myId] || {};
  return cats.map(c => ({ key: c.key, before: before[c.key] ?? null, after: after[c.key] ?? null }));
}
/* ==== kraj: Uvoz lige, čiste funkcije ==== */

/* =====================================================================
   Pomoćne funkcije
   ===================================================================== */
const $ = sel => document.querySelector(sel);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
/** Uklanja dijakritike: Jokić -> jokic, Dončić -> doncic, Đ -> dj */
const norm = s => String(s).toLowerCase()
  .replace(/đ/g, 'dj').replace(/ø/g, 'o').replace(/ł/g, 'l').replace(/ß/g, 'ss')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
const initials = name => name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
const fmt1 = v => (v == null ? '-' : v.toFixed(1));
const fmtPct = v => (v == null ? '-' : v.toFixed(3).replace(/^0/, ''));
const lsGet = k => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
/** Format brzog poređenja (bez lige): pamti se u browseru. Mini poređenje na početnoj je uvek 9-cat. */
const QUICK_FMT_KEY = 'fbaTrade.quickFormat.v1';
const quickFormat = () => normalizeFormat(lsGet(QUICK_FMT_KEY));
const setQuickFormat = f => { try { localStorage.setItem(QUICK_FMT_KEY, JSON.stringify(normalizeFormat(f))); } catch { /* bez pamćenja */ } };
/** Format koji važi sada: liga, brzo poređenje ili mini (9-cat) */
const activeFormat = () => (EMBED?.mini ? normalizeFormat(null) : currentLeague() ? leagueFormatOf(currentLeague()) : quickFormat());
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* pun / blokiran */ } };
const timeAgo = ts => {
  const m = Math.round((Date.now() - ts) / 60000);
  if (m < 1) return t('upravo');
  if (m < 60) return t('pre {n} min', { n: m });
  const h = Math.round(m / 60);
  return h < 24 ? t('pre {n} h', { n: h }) : t('pre {n} d', { n: Math.round(h / 24) });
};

/* =====================================================================
   Podaci: učitavanje, kompaktovanje, keš
   ===================================================================== */
/** Iz sirovog ESPN igrača pravi mali objekat sa samo potrebnim poljima. */
function compactPlayer(raw) {
  const p = raw.player || raw;
  const stats = {};
  let prevGP = null;
  const wanted = new Set(PERIODS.map(per => per.statId(CONFIG.SEASON)));
  for (const s of p.stats || []) {
    if (s.id === PREV_SEASON_STAT_ID && s.averageStats) { prevGP = +s.averageStats[STAT.GP] || 0; continue; }
    if (!wanted.has(s.id) || !s.averageStats) continue;
    const a = s.averageStats, o = {};
    for (const [k, id] of Object.entries(STAT)) o[k] = +a[id] || 0;
    // ESPN projekcija nema neke statistike (uvek 0): null = nepoznato, ne računa se
    if (s.id === PROJ_STAT_ID) for (const k of NO_PROJ_KEYS) o[k] = null;
    stats[s.id] = o;
  }
  const season = stats[PERIODS[0].statId(CONFIG.SEASON)], proj = stats[PROJ_STAT_ID];
  if (season && proj) for (const k of PROJ_FROM_SEASON) proj[k] = season[k];
  return {
    id: p.id,
    name: p.fullName,
    tid: p.proTeamId,
    team: PRO_TEAMS[p.proTeamId] ?? '?',
    pos: POSITIONS[p.defaultPositionId] ?? '?',
    inj: p.injuryStatus || 'ACTIVE',
    slots: p.eligibleSlots || [],
    own: p.ownership ? { pct: +p.ownership.percentOwned || 0, chg: +p.ownership.percentChange || 0 } : null,
    newsTs: p.lastNewsDate || null,
    outlook: (p.seasonOutlook || '').replace(/<[^>]+>/g, '').slice(0, 600),
    prevGP,
    stats,
  };
}

/** Raspored: { [proTeamId]: [{ id: gameId, date: ms }] } sortirano po datumu */
async function fetchSchedule() {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), CONFIG.FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(CONFIG.SCHEDULE_URL, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`raspored: HTTP ${res.status}`);
    const data = await res.json();
    const teams = {};
    for (const t of data?.settings?.proTeams || []) {
      if (!t.id) continue; // 0 = FA
      const games = new Map();
      for (const list of Object.values(t.proGamesByScoringPeriod || {}))
        for (const g of list) games.set(g.id, { id: g.id, date: g.date, h: g.homeProTeamId, a: g.awayProTeamId }); // h/a: domaćin i gost (protivnik u profilu igrača)
      teams[t.id] = [...games.values()].sort((a, b) => a.date - b.date);
    }
    if (!Object.keys(teams).length) throw new Error('raspored je prazan');
    return teams;
  } finally {
    clearTimeout(timer);
  }
}

async function loadSchedule(force = false) {
  const cached = lsGet(CONFIG.SCHEDULE_CACHE_KEY);
  if (cached?.teams) state.schedule = cached.teams;
  if (!force && cached?.teams && Date.now() - cached.ts < CONFIG.CACHE_TTL_MS) { render(); return; }
  try {
    const teams = await fetchSchedule();
    state.schedule = teams;
    lsSet(CONFIG.SCHEDULE_CACHE_KEY, { ts: Date.now(), teams });
  } catch (e) {
    console.warn('Raspored nije učitan:', e.message); // funkcije koje zavise od rasporeda koriste fallback
  }
  render();
}

async function fetchPlayers() {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), CONFIG.FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(CONFIG.API_URL, {
      headers: { 'X-Fantasy-Filter': JSON.stringify(CONFIG.FILTER) },
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(t('{src} je vratio grešku {n}', { src: DATA_SOURCE.name, n: res.status }));
    const data = await res.json();
    const list = Array.isArray(data) ? data : data.players;
    if (!Array.isArray(list) || list.length === 0) throw new Error(t('{src} je vratio praznu listu igrača', { src: DATA_SOURCE.name }));
    return list.map(compactPlayer).filter(p => p.id && p.name);
  } catch (e) {
    if (e.name === 'AbortError') throw new Error(t('{src} ne odgovara (isteklo vreme)', { src: DATA_SOURCE.name }));
    if (e instanceof TypeError) throw new Error(t('Mrežna greška: proveri internet konekciju'));
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/* =====================================================================
   Stanje aplikacije
   ===================================================================== */
const state = {
  players: [],          // kompaktni igrači
  byId: new Map(),
  loadedAt: 0,
  loading: false,
  error: null,          // poruka greške
  stale: false,         // prikazujemo stari keš posle greške
  slow: false,
  period: 'season',
  teams: [],            // [{ name, ids: [playerId] }]
  schedule: null,       // { [proTeamId]: [{ id, date }] } ili null ako nije učitan
  punt: new Set(),      // ključevi kategorija isključenih iz rezultata (iz aktivne lige)
  scope: 'quick',       // id aktivne lige ili 'quick' (brzo poređenje, ništa se ne čuva)
};
state.histView = null;                              // id otvorenog trejda
state.histOpen = false;
state.gameLogs = new Map();                         // playerId -> [{ date, line }]
state.gameLogStatus = { loading: false, error: null };
state.ui = { myOpen: true, oppOpen: false, ...(lsGet(CONFIG.UI_KEY) || {}) };
const saveUI = () => lsSet(CONFIG.UI_KEY, state.ui);

/* =====================================================================
   Profil i lige (samo lokalno; struktura je spremna da profil kasnije postane nalog)
   profil { schema, id, name, created, settings{lang}, leagues[], lastLeagueId }
   liga { id, name, teamName, platform, format, leagueFormat (vidi normalizeFormat), teams, slots{active, ir}, standings{...}, teamState, note,
          punt[], roster, opps{}, oppSel, history[], balance, externalLeagueId, accountId, created, updated }
   Keš igrača i rasporeda je globalan (van profila).
   ===================================================================== */
const SCHEMA_VERSION = 2;
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const nowISO = () => new Date().toISOString();
const emptyRoster = name => ({ name, players: [], updated: null });
const emptyBalance = () => ({ my: { drops: [], waivers: [] }, opp: { drops: [], waivers: [] } });

function newLeague(fields = {}) {
  return {
    id: uid(), name: '', teamName: '', platform: PLATFORMS[0].id, format: FORMATS[0].id, leagueFormat: legacyFormat(), teams: 12,
    slots: { active: ROSTER_DEFAULT.ACTIVE, ir: ROSTER_DEFAULT.IR },
    standings: { rank: null, record: '', playoffTeams: null, playoffWeek: null, updated: null },
    teamState: null, note: '', punt: [],
    roster: emptyRoster('Moj tim'), opps: {}, oppSel: null, history: [], balance: emptyBalance(),
    externalLeagueId: null, accountId: null, // čekaju prijavu i uvoz lige
    created: nowISO(), updated: nowISO(),
    ...fields,
  };
}
function newProfile(name = '') {
  return { schema: SCHEMA_VERSION, id: uid(), name, created: nowISO(), settings: { lang: LANG }, leagues: [], lastLeagueId: null };
}

let profile = lsGet(CONFIG.PROFILE_KEY);
const saveProfile = () => { if (profile) lsSet(CONFIG.PROFILE_KEY, profile); };
const currentLeague = () => (state.scope !== 'quick' && profile ? profile.leagues.find(l => l.id === state.scope) || null : null);
const touchLeague = lg => { if (lg) lg.updated = nowISO(); };

/** Podaci stare verzije (pre profila): roster, protivnici, istorija, punt, balans, trejd */
const LEGACY_KEYS = () => [CONFIG.ROSTERS_KEY, CONFIG.MYTEAM_KEY, CONFIG.HISTORY_KEY, CONFIG.PUNT_KEY, CONFIG.BALANCE_KEY, CONFIG.STATE_KEY];
const hasLegacy = () => LEGACY_KEYS().some(k => localStorage.getItem(k) != null);

/** Naziv lige za prikaz: podrazumevani naziv ("Moja liga" / "My league") prati jezik stranice */
const DEFAULT_LEAGUE_NAMES = ['Moja liga', 'My league'];
const lgName = l => (l && DEFAULT_LEAGUE_NAMES.includes(l.name) ? t('Moja liga') : l?.name || '');

/**
 * Migracija: stari podaci -> profil + liga "Moja liga". Pre toga sve stare ključeve čuva
 * pod LEGACY_BACKUP_KEY, da se ništa ne izgubi. Vraća id nove lige ili null.
 */
function migrateLegacy() {
  if (!hasLegacy()) return null;
  const old = Object.fromEntries(LEGACY_KEYS().map(k => [k, lsGet(k)]).filter(([, v]) => v != null));
  lsSet(CONFIG.LEGACY_BACKUP_KEY, { date: nowISO(), data: old });
  const r = old[CONFIG.ROSTERS_KEY] || { my: emptyRoster('Moj tim'), opps: {}, oppSel: null };
  if (!r.my?.players?.length && old[CONFIG.MYTEAM_KEY]?.roster?.length) {
    // još stariji format "Moj tim": lista ID-jeva
    r.my = { ...emptyRoster('Moj tim'), players: old[CONFIG.MYTEAM_KEY].roster.slice(0, 15).map((id, i) => ({ id, ir: i >= 13 })), updated: nowISO() };
  }
  const lg = newLeague({
    name: t('Moja liga'), roster: r.my || emptyRoster('Moj tim'), opps: r.opps || {}, oppSel: r.oppSel || null,
    history: old[CONFIG.HISTORY_KEY] || [], punt: old[CONFIG.PUNT_KEY] || [], balance: { ...emptyBalance(), ...(old[CONFIG.BALANCE_KEY] || {}) },
  });
  if (!profile) profile = newProfile('');
  profile.leagues.push(lg);
  profile.lastLeagueId = lg.id;
  const st = old[CONFIG.STATE_KEY];
  if (st) lsSet(CONFIG.TRADE_KEY, { scope: lg.id, period: st.period || 'season', teams: (st.teams || []).map(x => ({ ids: x.ids || [] })) });
  saveProfile();
  LEGACY_KEYS().forEach(k => localStorage.removeItem(k));
  return lg.id;
}

/** Poveži radni prostor sa ligom (ili sa brzim poređenjem, koje ništa ne čuva) */
function bindScope(scope) {
  state.scope = scope;
  const lg = currentLeague();
  if (!lg) {
    state.scope = 'quick';
    state.rosters = { my: emptyRoster('Moj tim'), opps: {}, oppSel: null };
    state.history = [];
    state.punt = new Set();
  } else {
    state.rosters = { my: lg.roster, opps: lg.opps, oppSel: lg.oppSel };
    state.history = lg.history;
    state.punt = new Set(lg.punt || []);
    profile.lastLeagueId = lg.id;
    saveProfile();
  }
  activateTab(scopeTabs().active);
  state.sharedOpen = false;
  state.histView = null;
  state.gameLogs = new Map();
}

/* Čuvanje ide u aktivnu ligu; u brzom poređenju se ništa ne čuva */
function saveRosters() {
  const lg = currentLeague(); if (!lg) return;
  lg.roster = state.rosters.my; lg.opps = state.rosters.opps; lg.oppSel = state.rosters.oppSel;
  touchLeague(lg); saveProfile();
}
function saveHistory() { const lg = currentLeague(); if (!lg) return; lg.history = state.history; touchLeague(lg); saveProfile(); }
/* =====================================================================
   Tabovi trejdova: više nacrta po ligi (i u brzom poređenju), da se ništa ne gubi.
   tab { id, teams: [Daješ, Dobijaš], balance: izbor Izbacuješ/Waiver, created, shared? }
   state.teams i state.balance uvek pokazuju na AKTIVNI tab, pa ostatak koda radi kao ranije.
   ===================================================================== */
let tradeStore = null;
const newTab = (lists = [[], []], balance = null) => ({
  id: uid(), created: nowISO(),
  teams: [GIVE, GET].map(i => ({ ...newTeam(), ids: [...new Set(lists[i] || [])] })),
  balance: balance || emptyBalance(),
});
function tradeStoreGet() {
  if (tradeStore) return tradeStore;
  tradeStore = lsGet(CONFIG.TRADES_KEY);
  if (!tradeStore) {
    // migracija: jedan stari trejd -> prvi tab te lige
    tradeStore = { period: 'season', scopes: {} };
    const old = lsGet(CONFIG.TRADE_KEY);
    if (old?.scope) {
      const lg = profile?.leagues.find(l => l.id === old.scope);
      const tab = newTab((old.teams || []).map(x => x.ids || []), lg?.balance ? { ...emptyBalance(), ...lg.balance } : null);
      tradeStore.period = old.period || 'season';
      tradeStore.scopes[old.scope] = { active: tab.id, tabs: [tab] };
    }
    lsSet(CONFIG.TRADES_KEY, tradeStore);
    if (lsGet(CONFIG.TRADES_KEY)) localStorage.removeItem(CONFIG.TRADE_KEY); // stari ključ tek kad je novi upisan
  }
  if (PERIODS.some(p => p.key === tradeStore.period)) state.period = tradeStore.period;
  // normalizacija jednom pri učitavanju (state.teams mora ostati ista referenca kao tab.teams)
  Object.values(tradeStore.scopes || {}).forEach(s => (s.tabs || []).forEach(tb => {
    tb.teams = [GIVE, GET].map(i => normTeam(tb.teams?.[i]));
    tb.balance = { ...emptyBalance(), ...(tb.balance || {}) };
  }));
  return tradeStore;
}
/** Tabovi opsega (lige ili 'quick'); uvek bar jedan */
function scopeTabs(scope = state.scope) {
  const st = tradeStoreGet();
  let s = st.scopes[scope];
  if (!s || !s.tabs?.length) { const tab = newTab(); s = st.scopes[scope] = { active: tab.id, tabs: [tab] }; }
  return s;
}
const activeTab = () => { const s = scopeTabs(); return s.tabs.find(x => x.id === s.active) || s.tabs[0]; };
function activateTab(id) {
  const s = scopeTabs();
  const tab = s.tabs.find(x => x.id === id) || s.tabs[0];
  s.active = tab.id;
  state.teams = tab.teams;
  state.balance = tab.balance;
  state.mix = !!tab.mix; // otvoreno iz Pronađi trejd: mešavina perioda kao na kartici
  if (tab.opp && state.rosters?.opps?.[tab.opp] && state.rosters.oppSel !== tab.opp) { state.rosters.oppSel = tab.opp; saveRosters(); } // tab iz Pronađi trejd pamti protivnika
  setQuickTeam(tab);
}
/** Bez lige: moj tim iz Pronađi trejd (samo za taj tab, ništa se ne čuva u rosterima) */
function setQuickTeam(tab) {
  if (state.scope !== 'quick' || !state.rosters) return;
  state.rosters.my = { ...emptyRoster('Moj tim'), players: (tab.myTeam || []).map(id => ({ id, ir: false })) };
}
function persistTrades() { const st = tradeStoreGet(); st.period = state.period; lsSet(CONFIG.TRADES_KEY, st); }
const saveBalance = () => persistTrades();

/** Novi tab (prazan ili sa trejdom) u aktivnom opsegu, i postaje aktivan */
function addTab(lists, balance, extra = {}) {
  const s = scopeTabs();
  const tab = { ...newTab(lists, balance), ...extra };
  s.tabs.push(tab);
  activateTab(tab.id);
  persistTrades();
  return tab;
}
/** Zatvori tab; ako je bio aktivan, aktivan postaje susedni; uvek ostaje bar jedan */
function removeTab(id) {
  const s = scopeTabs();
  const i = s.tabs.findIndex(x => x.id === id);
  if (i < 0) return;
  s.tabs.splice(i, 1);
  if (!s.tabs.length) s.tabs.push(newTab());
  if (s.active === id) s.active = s.tabs[Math.max(0, i - 1)].id;
  activateTab(s.active);
  persistTrades();
}
const tabHasPlayers = tb => tb.teams.some(x => x.ids.length);

const isPunt = c => !isPointsFmt() && state.punt.has(c.key); // liga na poene nema punt
const puntCls = c => (isPunt(c) ? ' punt' : '');
function togglePunt(key) {
  if (isPointsFmt() || !CATS.some(c => c.key === key)) return; // u ligama na poene punta nema
  if (state.punt.has(key)) state.punt.delete(key); else state.punt.add(key);
  // ne dozvoli punt svih kategorija
  if (state.punt.size >= CATS.length) state.punt.delete(key);
  const lg = currentLeague();
  if (lg) { lg.punt = [...state.punt]; saveProfile(); }
  render();
}

/* ---------- Trajnost (GP%) ---------- */
const gamesDone = tid => {
  const games = state.schedule?.[tid];
  if (!games) return null;
  const cutoff = Date.now() - CONFIG.GAME_DONE_AFTER_MS;
  let n = 0;
  for (const g of games) { if (g.date <= cutoff) n++; else break; }
  return n;
};

/**
 * Moguće utakmice = broj utakmica koje je igračev NBA tim odigrao (iz rasporeda).
 * APROKSIMACIJA (fallback kad raspored nije dostupan): najveći GP među igračima istog tima.
 */
function possibleGames(p) {
  const fromSchedule = gamesDone(p.tid);
  if (fromSchedule != null) return { n: fromSchedule, approx: false };
  let max = 0;
  const sid = PERIODS[0].statId(CONFIG.SEASON);
  for (const q of state.players) if (q.tid === p.tid) max = Math.max(max, q.stats[sid]?.GP || 0);
  return { n: max, approx: true };
}

function durability(p) {
  if (!p.tid) return null; // slobodan igrač: nema tima
  const gp = Math.round(p.stats[PERIODS[0].statId(CONFIG.SEASON)]?.GP || 0);
  const { n, approx } = possibleGames(p);
  if (!n) return null;
  const pct = Math.min(gp / n, 1);
  const shown = Math.round(pct * 100) / 100; // boja prati prikazani procenat (84.6% -> 85% = zeleno)
  const cls = shown >= DURABILITY.GOOD ? 'good' : shown >= DURABILITY.OK ? 'ok' : 'bad';
  return { gp, n, pct, cls, approx };
}

/* ---------- Utakmice ove nedelje ---------- */
const etDateFmt = new Intl.DateTimeFormat('en-CA', { timeZone: WEEK_TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const etDate = ms => etDateFmt.format(ms); // "YYYY-MM-DD"
/** Datumi (ET) od ponedeljka do nedelje tekuće nedelje */
function currentWeekDates() {
  const [y, m, d] = etDate(Date.now()).split('-').map(Number);
  const today = new Date(Date.UTC(y, m - 1, d));
  const monOffset = (today.getUTCDay() + 6) % 7; // 0 = ponedeljak
  return Array.from({ length: 7 }, (_, i) => new Date(Date.UTC(y, m - 1, d - monOffset + i)).toISOString().slice(0, 10));
}
function weekGames(tid) {
  const games = state.schedule?.[tid];
  if (!games) return null;
  const week = new Set(currentWeekDates());
  const inWeek = games.filter(g => week.has(etDate(g.date)));
  const cutoff = Date.now() - CONFIG.GAME_DONE_AFTER_MS;
  return { total: inWeek.length, left: inWeek.filter(g => g.date > cutoff).length };
}
function weekGamesHTML(p) {
  if (!p.tid) return '';
  const w = weekGames(p.tid);
  if (!w) return '';
  const [mon, , , , , , sun] = currentWeekDates();
  const d = iso => (LANG === 'en' ? new Date(`${iso}T12:00:00Z`).toLocaleDateString(LOCALE(), { day: 'numeric', month: 'numeric', timeZone: 'UTC' }) : euDate(`${iso}T12:00:00Z`, { utc: true }));
  const tip = t('{n} ut. ove nedelje ({a}–{b}, pon–ned) · preostalo: {left}', { n: w.total, a: d(mon), b: d(sun), left: w.left });
  // Roto i poeni za celu sezonu: nedeljni raspored manje znači, pa oznaka nije istaknuta
  const quiet = ['roto', 'season_points'].includes(FMT_ACTIVE.scoringType);
  return `<span class="badge wk${quiet ? ' quiet' : ''}" data-tip="${esc(tip)}">${t('{n} ut.', { n: w.total })}</span>`;
}

function durabilityHTML(p) {
  const d = durability(p);
  const prev = p.prevGP != null ? t('prošla sezona: {a}/{b}', { a: Math.round(p.prevGP), b: CONFIG.PREV_SEASON_GAMES }) : t('prošla sezona: nema podataka');
  if (!d) return p.prevGP != null ? `<span class="badge" data-tip="${prev}">–</span>` : '';
  const pct = Math.round(d.pct * 100);
  const tip = `${t('Ove sezone: {a}/{b} utakmica ({p}%)', { a: d.gp, b: d.n, p: pct })}${d.approx ? t(' · približno, raspored nedostupan') : ''} · ${prev}`;
  return `<span class="badge gp-${d.cls}" data-tip="${esc(tip)}"><span class="frac">${d.gp}/${d.n} · </span>${pct}%</span>`;
}

function setPlayers(players, ts) {
  // glavna lista (top 600) + igrači sa uvezenih rostera van nje (keš, vidi ensurePlayers)
  state.baseIds = new Set(players.map(p => p.id));
  players = [...players, ...extrasGet().filter(p => !state.baseIds.has(p.id))];
  state.players = players;
  state.byId = new Map(players.map(p => [p.id, p]));
  state.loadedAt = ts;
  for (const p of players) {
    p._n = norm(p.name);
    // red statistike zna čiji je i koji period (za bonuse po utakmici); ne upisuje se u keš
    for (const [sid, line] of Object.entries(p.stats || {})) if (line && line._pid == null) Object.defineProperties(line, { _pid: { value: p.id }, _sid: { value: sid } });
  }
}


/** Strana trejda: ids = igrači na toj strani. drops/waivers postoje samo u starim sačuvanim trejdovima (istorija). */
const newTeam = () => ({ ids: [], drops: [], waivers: [] });
const normTeam = t => ({ ...newTeam(), ...t, ids: t?.ids || [], drops: t?.drops || [], waivers: t?.waivers || [] });

const ids = s => (s || '').split(',').map(Number).filter(Boolean);

/* =====================================================================
   Rutiranje preko hash-a: #home, #league-{id}, #quick (+ parametri trejda posle "&").
   Link bez rute (deljeni trejd: #per=…&t=…&s=1) otvara poslednju ligu ili brzo poređenje.
   ===================================================================== */
state.view = 'quick';
function parseRoute() {
  const first = location.hash.slice(1).split('&')[0];
  if (first === 'home') return { view: 'home' };
  if (first === 'quick') return { view: 'quick' };
  const m = first.match(/^league-([\w-]+?)(?:\/([\w-]+))?$/);
  if (!m) return null;
  // bez stranice: stari link sa trejdom vodi na Analizu, inače Pregled
  const pg = m[2] ? pageOfSlug(m[2]) : null;
  const page = pg && pageReady(pg) ? pg : new URLSearchParams(location.hash.slice(1)).has('t') ? 'trade' : 'overview';
  return { view: 'league', id: m[1], page };
}
/** Bez rute: poslednja liga; bez liga: početni ekran (ako profil postoji) ili brzo poređenje (novi korisnik) */
function defaultRoute() {
  const last = profile?.leagues.find(l => l.id === profile.lastLeagueId) || profile?.leagues[0];
  if (last) return { view: 'league', id: last.id };
  return profile ? { view: 'home' } : { view: 'quick' };
}
const routeToken = () => (state.view === 'home' ? 'home' : state.scope === 'quick' ? 'quick' : `league-${state.scope}/${PAGE_SLUG[state.page] || state.page}`);

function applyRoute() {
  if (EMBED?.targets) { state.view = 'quick'; document.body.dataset.view = 'quick'; if (state.scope !== 'quick' || !state.rosters) bindScope('quick'); loadState(); render(); return; } // javna stranica Mete za trejd
  if (EMBED?.finder) { state.view = 'quick'; document.body.dataset.view = 'quick'; if (state.scope !== 'quick' || !state.rosters) bindScope('quick'); loadState(); render(); return; } // javna stranica Pronađi trejd
  if (EMBED) {
    state.view = 'quick';
    document.body.dataset.view = 'quick';
    if (state.scope !== 'quick' || !state.rosters) bindScope('quick');
    loadState();
    // trejd iz linka (#per=…&t=…): novi tab ili prebacivanje na isti; postojeći tabovi se ne gaze
    const hp = new URLSearchParams(location.hash.slice(1));
    // deljeni link (s=1): obrađuje ga aplikacija (prepoznavanje lige, izbor lige, ugao primaoca)
    if (hp.get('s') === '1') { location.replace(new URL(EMBED.app, location.href).href + location.hash); return; }
    if (hp.get('so') === '1') { state.sharedOpen = true; history.replaceState(null, '', location.pathname + location.search); }
    if (hp.has('t')) {
      const lists = hp.get('t').split('|').map(ids);
      if (PERIODS.some(p => p.key === hp.get('per'))) state.period = hp.get('per');
      const key = l => l.map(x => [...x].sort().join(',')).join('|');
      const s = scopeTabs();
      const same = s.tabs.find(tb => key(tb.teams.map(x => x.ids)) === key([lists[GIVE] || [], lists[GET] || []]));
      if (same) activateTab(same.id);
      else if (!tabHasPlayers(activeTab())) { state.teams.forEach((tm, i) => { tm.ids = [...new Set(lists[i] || [])]; }); }
      else addTab([lists[GIVE] || [], lists[GET] || []]);
      state.teams[GET].ids = state.teams[GET].ids.filter(id => !state.teams[GIVE].ids.includes(id));
      // iz Pronađi trejd: otpuštanja (moja | protivnikova), moj tim (za procente i slobodno mesto) i ista mešavina perioda kao kartica
      const tb = activeTab();
      if (hp.has('d')) { const [md, od] = hp.get('d').split('|').map(ids); state.balance.my = { drops: md || [], waivers: [] }; state.balance.opp = { drops: od || [], waivers: [] }; }
      if (hp.has('m')) { tb.myTeam = ids(hp.get('m')); setQuickTeam(tb); }
      if (hp.get('mix') === '1') { tb.mix = true; state.mix = true; }
      history.replaceState(null, '', location.pathname + location.search);
    }
    persistTrades();
    render();
    return;
  }
  const hp = new URLSearchParams(location.hash.slice(1));
  // sa javne početne: "Add your league" otvara dodavanje lige, trejd iz brzog poređenja prelazi u nju
  const addLeague = hp.get('addleague') === '1';
  if (addLeague) {
    history.replaceState(null, '', location.hash.replace(/&addleague=1/, ''));
    setTimeout(openAddLeague, 0);
  }
  if (hp.get('s') === '1') { handleSharedLink(hp); return; }
  let r = parseRoute() || defaultRoute();
  if (r.view === 'league' && !profile?.leagues.some(l => l.id === r.id)) r = { view: 'home' };
  // Brzo poređenje živi na javnoj početnoj: trejd iz linka ide u njen tab, pa prelazak tamo
  if (r.view === 'quick' && !addLeague) {
    bindScope('quick'); loadState(); persistTrades();
    location.replace(publicAnalyzer());
    return;
  }
  if (r.view === 'league' && state.scope !== r.id) clearBack();
  if (r.view === 'league' && (state.scope !== r.id || state.page !== r.page)) state.ui.ltEdit = null;
  state.view = r.view;
  if (r.page) state.page = r.page;
  document.body.dataset.view = r.view;
  document.body.dataset.page = r.view === 'league' ? state.page : '';
  if (r.view === 'league' && state.scope !== r.id) bindScope(r.id);
  if (r.view === 'quick' && (state.scope !== 'quick' || !state.rosters)) bindScope('quick');
  if (!state.rosters) bindScope('quick'); // početni ekran pri prvom učitavanju: prazan radni prostor
  if (r.view === 'home') {
    if (!state.teams?.length) activateTab(scopeTabs().active); // početni ekran direktno
    history.replaceState(null, '', '#home');
  } else {
    loadState();
    saveState(); // normalizuje adresu: ruta + trejd aktivnog taba
  }
  hideTip(); if (!addLeague) closeModal(); closePopMenu();
  render();
  if (state.view === 'league') restoreScroll(); else window.scrollTo(0, 0);
  const after = state.afterRoute; state.afterRoute = null; after?.(); // npr. sledeći tim u Nalepi roster posle pravljenja lige
  maybeAutoSync();
}

/** Navigacija. Svaka liga čuva svoje tabove trejdova, pa promena lige ništa ne briše. */
function navigate(view, id) {
  if (view === 'quick') { location.href = publicAnalyzer(); return true; } // brzo poređenje je /trade-analyzer/
  location.hash = view === 'league' ? `league-${id}` : view;
  return true;
}

/* ---------- Deljeni link: uvek novi tab, uz izbor lige ---------- */
/** Da li je trejd "prepoznat" u ligi: igrači sa jedne strane su svi na mom rosteru */
function shareMatch(lg, lists) {
  const mine = new Set(rosterIds(lg.roster && { players: lg.roster.players }));
  const all = arr => arr.length > 0 && arr.every(id => mine.has(id));
  return { own: all(lists[GIVE]), theirs: all(lists[GET]) };
}

function handleSharedLink(hp) {
  const lists = (hp.get('t') || '|').split('|').map(ids);
  // mv=1: moj trejd iz brzog poređenja prelazi u ligu koju izaberem, strane ostaju iste
  const keep = hp.get('mv') === '1';
  state.pendingFormat = decodeFormat(hp.get('f')); // format iz linka (null: link bez formata)
  const om = { r: 'repl', p: 'pick', n: 'none' }[hp.get('o')];
  state.pendingSpot = om ? { mode: om, w: om === 'pick' ? ids(hp.get('w') || '') : [] } : null; // slobodno mesto iz linka
  const per = hp.get('per');
  if (PERIODS.some(p => p.key === per)) { state.period = per; tradeStoreGet().period = per; persistTrades(); }
  const leagues = profile?.leagues || [];
  // osnovni prikaz ispod pitanja: poslednja liga / brzo poređenje
  const base = defaultRoute();
  history.replaceState(null, '', base.view === 'league' ? `#league-${base.id}` : `#${base.view}`);
  if (!leagues.length) { openSharedIn('quick', lists); return; }
  const matches = leagues.map(lg => ({ lg, m: shareMatch(lg, lists) })).map(x => ({ ...x, ok: x.m.own || x.m.theirs }));
  if (!keep && leagues.length === 1 && matches[0].ok) { openSharedIn(leagues[0].id, lists); return; }
  state.sharedOpen = false;
  applyRoute(); // prikaži osnovni ekran, pa pitaj
  const ordered = [...matches.filter(x => x.ok), ...matches.filter(x => !x.ok)];
  showModal({
    title: keep ? t('U kojoj ligi da otvorim trejd?') : t('U koju ligu da svrstam trejd?'),
    body: `<p>${keep ? t('Trejd se otvara u novom tabu izabrane lige, sa istim stranama. Postojeći trejdovi ostaju netaknuti.') : t('Otvara se deljeni trejd, u novom tabu. Postojeći trejdovi ostaju netaknuti.')}</p>
      <div class="share-pick">
        ${ordered.map(({ lg, ok }) => `<button type="button" class="pp-league" data-share-to="${lg.id}"><span>${esc(lgName(lg))} ${ok ? `<span class="slot-tag tag-in">${t('prepoznato')}</span>` : ''}</span><span class="pbadge">${esc(platformLabel(lg.platform))}</span></button>`).join('')}
        ${keep ? '' : `<button type="button" class="pp-league indep" data-share-to="quick"><span>${t('Neovisan trejd (bez lige)')}</span><span class="hint">${t('brzo poređenje')}</span></button>`}
      </div>`,
    cancel: t('Otkaži'),
  });
  state.pendingShare = lists;
  state.pendingKeep = keep;
}

/** Otvori deljeni trejd u novom tabu izabrane lige (ili brzog poređenja). Strane se okreću po rosteru te lige. */
function openSharedIn(scope, lists, keep = false) {
  closeModal();
  const sentF = state.pendingFormat; state.pendingFormat = null;
  state.pendingShare = null; state.pendingKeep = false;
  if (scope === 'quick' && sentF) setQuickFormat(sentF); // bez lige: format iz linka
  state.view = scope === 'quick' ? 'quick' : 'league';
  document.body.dataset.view = state.view;
  bindScope(scope);
  const lg = currentLeague();
  // moji igrači su u "Daješ" -> moj trejd, bez okretanja; keep (iz mog brzog poređenja): nikad se ne okreće
  const own = keep || (lg ? shareMatch(lg, lists).own : false);
  const oriented = own ? lists : [lists[GET], lists[GIVE]];
  const s = scopeTabs();
  const key = lists2 => lists2.map(l => [...l].sort().join(',')).join('|');
  const same = s.tabs.find(tb => key(tb.teams.map(x => x.ids)) === key(oriented));
  if (same) activateTab(same.id); // isti trejd je već otvoren: samo ga prikaži
  else {
    addTab(oriented, null, { shared: true });
    s.tabs = s.tabs.filter(x => x.id === s.active || tabHasPlayers(x)); // prazni tabovi nemaju svrhu
    persistTrades();
  }
  state.sharedOpen = !own;
  // slobodno mesto iz linka važi samo za ovaj tab i samo kad trejd nije okrenut (to je pošiljaočevo mesto)
  const ps = state.pendingSpot; state.pendingSpot = null;
  if (ps && own && !same) { const tb = activeTab(); tb.spotMode = ps.mode; if (ps.w.length) state.balance.my.waivers = [...ps.w]; persistTrades(); }
  // u ligi važi format lige; ako je trejd poslat za drugi format, tab to pamti (jedan red iznad rezultata)
  if (lg && sentF && !sameFormat(sentF, leagueFormatOf(lg))) { activeTab().sentFormat = encodeFormat(sentF); persistTrades(); }
  // isti igrač ne može biti na obe strane
  state.teams[GET].ids = state.teams[GET].ids.filter(id => !state.teams[GIVE].ids.includes(id));
  if (scope === 'quick' && !EMBED) { persistTrades(); location.replace(`${publicAnalyzer()}${own ? '' : '#so=1'}`); return; } // nezavisan trejd: /trade-analyzer/, sa obaveštenjem o uglu
  state.page = 'trade';
  document.body.dataset.page = 'trade';
  saveState();
  hideTip();
  render();
  window.scrollTo(0, 0);
}

/** Link sadrži samo trejd: per=period, t=daješ|dobijaš (isti format kao ranije, stari linkovi rade). */
function saveState() {
  persistTrades();
  if (EMBED) return; // ugrađen alat ne menja adresu javne stranice
  const q = new URLSearchParams();
  q.set('per', state.period);
  q.set('t', state.teams.map(tm => tm.ids.join(',')).join('|'));
  if (LANG === 'en') q.set('lang', 'en'); // primalac linka vidi isti jezik
  if (state.view === 'home') return;
  if (state.view === 'league' && state.page !== 'trade') { q.delete('t'); }
  history.replaceState(null, '', `#${routeToken()}&${q.toString().replace(/%7C/gi, '|').replace(/%2C/gi, ',')}`);
}

/** Aktivni tab opsega; adresa (osvežavanje stranice) nosi trejd aktivnog taba. Period je zajednički. */
function loadState() {
  const hash = new URLSearchParams(EMBED ? '' : location.hash.slice(1));
  const period = hash.get('per') || tradeStoreGet().period;
  activateTab(scopeTabs().active);
  if (hash.has('t')) {
    const lists = hash.get('t').split('|').map(ids);
    state.teams.forEach((tm, i) => { tm.ids = [...new Set(lists[i] || [])]; });
  }
  // isti igrač ne može biti na obe strane
  state.teams[GET].ids = state.teams[GET].ids.filter(id => !state.teams[GIVE].ids.includes(id));
  state.period = PERIODS.some(p => p.key === period) ? period : 'season';
}

const giveIds = () => state.teams[GIVE].ids;
const getIds = () => state.teams[GET].ids;
const takenIds = () => new Set([...giveIds(), ...getIds()]);

async function loadPlayers(force = false) {
  CONFIG.OLD_CACHE_KEYS.forEach(k => localStorage.removeItem(k));
  const cached = lsGet(CONFIG.CACHE_KEY);
  if (!force && cached?.players?.length && Date.now() - cached.ts < CONFIG.CACHE_TTL_MS) {
    setPlayers(cached.players, cached.ts);
    render();
    loadInjuryDates();
    return;
  }
  if (cached?.players?.length && !state.players.length) setPlayers(cached.players, cached.ts);
  state.loading = true; state.error = null; state.slow = false;
  render();
  const slowTimer = setTimeout(() => { state.slow = true; renderStatus(); }, CONFIG.SLOW_NOTICE_MS);
  try {
    const players = await fetchPlayers();
    const ts = Date.now();
    setPlayers(players, ts);
    lsSet(CONFIG.CACHE_KEY, { ts, players });
    state.stale = false;
  } catch (e) {
    state.error = e.message;
    state.stale = state.players.length > 0;
  } finally {
    clearTimeout(slowTimer);
    state.loading = false; state.slow = false;
    render();
  }
  loadInjuryDates();
}

/* ---------- Procena povratka povređenih (ESPN kona_playercard: injuryDetails.expectedReturnDate, outForSeason) ---------- */
const INJ_RET_KEY = `fbaTrade.injRet.v1.${CONFIG.SEASON}`; // { ts, m: { [pid]: [godina, mesec, dan, van do kraja sezone 0|1] } }, bez imena
let injRetBusy = false;
/** Datumi povratka za sve igrače koji nisu ACTIVE (po 50 u zahtevu); keš važi dok se igrači ne osveže */
async function loadInjuryDates() {
  if (injRetBusy || !state.players.length) return;
  const c = lsGet(INJ_RET_KEY);
  const have = c && c.ts >= (state.loadedAt || 0) && Date.now() - c.ts < CONFIG.CACHE_TTL_MS ? c : { ts: Date.now(), m: {} };
  const need = state.players.filter(p => p.inj && p.inj !== 'ACTIVE' && !(p.id in have.m)).map(p => p.id);
  state.injRet = have.m;
  if (!need.length) return;
  injRetBusy = true;
  try {
    const url = CONFIG.API_URL.replace('view=kona_player_info', 'view=kona_playercard');
    for (let i = 0; i < need.length; i += 50) {
      const ids = need.slice(i, i + 50);
      const data = await fetchJSON(url, { headers: { 'X-Fantasy-Filter': JSON.stringify({ players: { filterIds: { value: ids } } }) } });
      for (const id of ids) have.m[id] = 0; // nema podataka: ne pita se ponovo do osvežavanja
      for (const e of data?.players || []) {
        const d = e.player?.injuryDetails, r = d?.expectedReturnDate;
        if (e.player?.id) have.m[e.player.id] = Array.isArray(r) && r.length === 3 ? [+r[0], +r[1], +r[2], d.outForSeason ? 1 : 0] : d?.outForSeason ? [0, 0, 0, 1] : 0;
      }
    }
    lsSet(INJ_RET_KEY, have); state.injRet = have.m; state.injVer = (state.injVer || 0) + 1;
    render();
  } catch (e) { console.warn('Procena povratka nije učitana:', e.message); } finally { injRetBusy = false; }
}

/* =====================================================================
   Proračun
   ===================================================================== */
const currentStatId = () => PERIODS.find(p => p.key === state.period).statId(CONFIG.SEASON);

/** Analiza trejda otvorena iz Pronađi trejd: ista mešavina perioda kao na kartici (sezona, 15 i 7 dana i projekcija), dok korisnik ne izabere period */
const mixOn = () => !!state.mix && (state.page === 'trade' || state.view === 'quick' && !EMBED?.finder && !EMBED?.targets); // brza analiza (/trade-analyzer/) je uvek analiza trejda
let mixCache = { B: null, m: new Map() };
function mixLine(p) {
  const B = tfBase();
  if (mixCache.B !== B) mixCache = { B, m: new Map() };
  if (mixCache.m.has(p.id)) return mixCache.m.get(p.id);
  const b = B.lineOf(p);
  // GP iz sezone (za prikaz); FPts kao u pretrazi (poeni svakog perioda pa mešavina)
  const l = b ? { ...b, GP: statOf(p, 'season')?.GP || b.GP || 1, ...(B.pts ? { _fpts: b.FPTS } : {}) } : null;
  mixCache.m.set(p.id, l);
  return l;
}
/** Statistika igrača za trenutni period ili null ako nema podataka (GP = 0). */
function playerLine(p) {
  if (p && mixOn()) return mixLine(p);
  const s = p?.stats[currentStatId()];
  return s && s.GP > 0 ? s : null;
}

/** Zbirovi tima (sve statistike iz kataloga koje se sabiraju) + FPts. Igrači bez podataka se ne računaju. */
const SUM_KEYS = STAT_CATALOG.filter(x => x.type === 'sum').map(x => x.id);
/** Statistika kojoj u ovom periodu nema podataka (npr. DD u projekciji) */
const noData = c => state.period === 'proj' && c.noProj && !mixOn();

/** Pretvara zbirove u vrednosti kategorija. Odnosi uvek preko made/att, nikad prosek procenata. */
function catValues(sum, counted) {
  const vals = {};
  for (const c of CATS) {
    vals[c.key] = noData(c) ? null : c.type === 'pct'
      ? (sum[c.att] > 0 ? sum[c.made] / sum[c.att] : null)
      : (counted ? sum[c.key] : null);
  }
  return vals;
}

/**
 * Zbir: plus igrači se dodaju, minus igrači oduzimaju (i FGM/FGA, FTM/FTA).
 * lineOf(p) daje statistiku igrača ili null (nema podataka -> ne računa se, ide u missing).
 */
function sumPlayers(plusIds, minusIds = [], lineOf = playerLine, extra = []) {
  const sum = Object.fromEntries([...SUM_KEYS, 'FPTS'].map(k => [k, 0]));
  let counted = 0;
  const missing = [];
  const apply = (id, sign) => {
    const p = state.byId.get(id);
    const line = lineOf(p);
    if (!line) { missing.push(p ? p.name : `#${id}`); return; }
    if (sign > 0) counted++;
    for (const k of SUM_KEYS) sum[k] += sign * (line[k] ?? 0);
    if (isPointsFmt()) sum.FPTS += sign * fptsOf(line);
  };
  plusIds.forEach(id => apply(id, 1));
  minusIds.forEach(id => apply(id, -1));
  for (const line of extra) { if (!line) continue; counted++; for (const k of SUM_KEYS) sum[k] += line[k] ?? 0; if (isPointsFmt()) sum.FPTS += fptsOf(line); } // slobodno mesto na nivou zamene
  return { sum, vals: catValues(sum, counted || minusIds.length > 0), counted, missing };
}

/**
 * Slotovi za neravnomeran trejd, jedno pravilo za sva stanja rostera (kind: 'my' ili 'opp'):
 * - "Izbacuješ": kad strana dobija više igrača nego što daje; broj slotova = razlika u broju igrača
 * - "Waiver dodatak": kad daje više nego što dobija; broj = razlika; uvek opciono
 * Da li je "Izbacuješ" obavezan (roster bi imao više aktivnih nego što liga dozvoljava) računa rosterPlan.
 */
/** Dolazeći povređeni koji idu na IR ove strane (slobodno IR mesto, status sme na IR), isto pravilo kao u Pronađi trejd */
function irBoundIds(kind) {
  const lg = currentLeague();
  if (!lg || !state.players.length || !state.rosters) return [];
  const other = kind === 'my' ? 'opp' : 'my';
  return tfIrBound(lg, state.teams[KINDS[kind].in].ids, rosterOf(other), tfIrFree(lg, rosterOf(kind), kind === 'my'));
}
/* ---------- Slobodno mesto (dajem više igrača nego što dobijam): kako se računa ----------
   'repl' = realna zamena sa waivera (uvezena liga) ili nivo zamene, 'pick' = igrač kog izabereš, 'none' = ne računa se.
   Izbor se pamti po ligi; deljeni link ga postavlja samo za svoj tab (tab.spotMode). Izabrani igrač je u balance.my.waivers taba. */
const SPOT_KEY = 'fbaTrade.openSpot.v1'; // { [liga | 'quick']: 'repl' | 'pick' | 'none' }
const SPOT_MODES = ['repl', 'pick', 'none'];
const spotScope = () => currentLeague()?.id || 'quick';
function spotMode() {
  const tb = state.teams ? activeTab() : null;
  if (tb && SPOT_MODES.includes(tb.spotMode)) return tb.spotMode;
  const m = (lsGet(SPOT_KEY) || {})[spotScope()];
  return SPOT_MODES.includes(m) ? m : 'repl';
}
function setSpotMode(m) {
  if (!SPOT_MODES.includes(m)) return;
  const all = lsGet(SPOT_KEY) || {};
  all[spotScope()] = m; lsSet(SPOT_KEY, all);
  const tb = activeTab(); if (tb) delete tb.spotMode;
  persistTrades();
}
function slotPlan(kind) {
  const outSide = state.teams[KINDS[kind].out].ids, inSide = state.teams[KINDS[kind].in].ids;
  const both = outSide.length > 0 && inSide.length > 0;
  const irB = both ? irBoundIds(kind) : [];
  // povređeni na IR ne zauzima aktivno mesto dok je povređen; kad se vrati, zauzima (kao u Pronađi trejd)
  const dP = inSide.length - outSide.length, dT = dP - irB.length; // trajno / dok je na IR-u
  const dropSlots = both ? Math.max(0, dP) : 0, laterSlots = both ? dropSlots - Math.max(0, dT) : 0; // poslednjih laterSlots: tek kad se vrati
  const waiverSlots = both ? Math.max(0, -dT) : 0, tempSlots = both ? waiverSlots - Math.max(0, -dP) : 0; // poslednjih tempSlots: samo dok je na IR-u
  const B = irB.length ? tfBase() : null;
  const w = irB.length ? irB.reduce((a, id) => a + (1 - B.fracOf(state.byId.get(id))), 0) / irB.length : 0; // udeo utakmica dok je na IR-u
  const trade = takenIds(), bal = state.balance[kind];
  const onRoster = new Set(rosterIds(rosterOf(kind)));
  const drops = [...new Set(bal.drops)].filter(id => !trade.has(id)).slice(0, dropSlots);
  // waiver dodatak ne ulazi u rezultat trejda (tamo se računa koga protivnik izbacuje), samo u to kako se menja moj tim;
  // koga protivnik uzima sa waivera nije bitno (njegov tim), pa za 'opp' nema waivera
  const waivers = kind === 'opp' || spotMode() !== 'pick' ? [] : [...new Set(bal.waivers)].filter(id => !trade.has(id) && !drops.includes(id) && !onRoster.has(id)).slice(0, waiverSlots);
  const nowN = dropSlots - laterSlots;
  return { dropSlots, waiverSlots, drops, waivers, laterSlots, tempSlots, w, irB, nowDrops: drops.slice(0, nowN), laterDrops: drops.slice(nowN) };
}
/** Linija igrača pomnožena udelom utakmica (zbirne kolone; procenti se računaju iz zbira) */
const scaleLine = (line, s) => { if (!line) return null; const o = { ...line }; for (const k of SUM_KEYS) o[k] = (line[k] ?? 0) * s; return o; };
const scaledLines = (ids, s) => ids.map(id => scaleLine(playerLine(state.byId.get(id)), s)).filter(Boolean);
const irNames = ids => ids.map(id => state.byId.get(id)?.name || '').join(', ');
const slotIds = (kind = 'my') => { const sp = slotPlan(kind); return [...sp.drops, ...sp.waivers]; };

/**
 * Zbir strane trejda: ko dobija više igrača, mora nekog da izbaci, i taj igrač se računa uz ono što ta strana daje.
 * Daješ = moji igrači + koga ja izbacujem; Dobijaš = njegovi igrači + koga on izbacuje.
 * (Tako se vidi koliko on stvarno dobija u odnosu na ono čega se odriče, tj. da li će pristati.)
 */
function teamTotals(team, ti) {
  if (ti === GIVE) { const sp = slotPlan('my'); return sumPlayers([...team.ids, ...sp.nowDrops], [], playerLine, scaledLines(sp.laterDrops, 1 - sp.w)); } // kasnije otpušten igra dok je povređeni na IR-u
  // Dobijaš: njegovi igrači + moje slobodno mesto (dajem više nego što dobijam), kao u Pronađi trejd;
  // koga protivnik izbacuje menja njegov tim, ne moj rezultat
  const f = freeFill('my');
  return sumPlayers([...team.ids, ...f.permIds], [], playerLine, [...replExtras(f.permRepl), ...freeTempLines(f)]);
}
/**
 * Slobodna mesta strane koja dobija manje igrača: izabrani waiver, a ostala mesta najbolji slobodan igrač
 * (uvezena liga) ili nivo zamene (manuelna liga i bez lige), isto kao u Pronađi trejd.
 * -> { ids: izabrani + automatski, auto: automatski izabrani slobodni, repl: broj mesta na nivou zamene, n: broj mesta }
 */
function freeFill(kind = 'my') {
  const sp = slotPlan(kind), n = sp.waiverSlots, rest = n - sp.waivers.length;
  // Ne računaj: mesto ostaje prazno (nula), poredi se samo ko ide i ko dolazi
  if (kind === 'my' && n > 0 && spotMode() === 'none') return { ids: [], auto: [], repl: 0, n, permIds: [], permRepl: 0, tempIds: [], tempRepl: 0, w: sp.w, irB: sp.irB, none: true };
  let ids = [...sp.waivers], auto = [], repl = 0;
  if (rest > 0 && state.players.length) {
    const taken = new Set([...takenIds(), ...sp.waivers, ...slotPlan('opp').drops]);
    auto = tfBase().fa.filter(f => f.id != null && !taken.has(f.id)).slice(0, rest).map(f => f.id);
    ids = [...sp.waivers, ...auto]; repl = rest - auto.length;
  }
  // poslednjih tempSlots mesta (redom: izabrani, najbolji slobodni, nivo zamene) postoje samo dok je povređeni na IR-u
  const permN = n - sp.tempSlots, permIds = ids.slice(0, permN), tempIds = ids.slice(permN);
  const permRepl = Math.max(0, Math.min(repl, permN - permIds.length)), tempRepl = repl - permRepl;
  return { ids, auto, repl, n, permIds, permRepl, tempIds, tempRepl, w: sp.w, irB: sp.irB };
}
/** Privremena slobodna mesta (dok je povređeni na IR-u), pomnožena udelom tih utakmica */
const freeTempLines = f => (f.tempIds.length || f.tempRepl ? [...scaledLines(f.tempIds, f.w), ...replExtras(f.tempRepl).map(l => scaleLine(l, f.w))] : []);
/** Red statistike nivoa zamene za trenutni period ili mešavinu (keš) */
let replLineCache = { key: null, line: null };
function replLineNow() {
  const B = tfBase(), key = [B.key, mixOn() ? 'mix' : state.period].join('|');
  if (replLineCache.key !== key) replLineCache = { key, line: mixOn() ? B.replLine() : B.replLine(playerLine, fptsOf) };
  return replLineCache.line;
}
const replExtras = n => (n > 0 && replLineNow() ? Array(n).fill(replLineNow()) : []);
/** Zbir mog tima posle trejda (sa slobodnim mestom na nivou zamene) */
const planAfterTotals = plan => {
  const f = plan.fill, tmp = new Set(f?.tempIds || []);
  // privremeni slobodni samo za utakmice dok je povređeni na IR-u; kasnije otpušten igra baš te utakmice
  const extra = [...replExtras(f ? f.permRepl : plan.fillRepl || 0), ...(f ? freeTempLines(f) : []), ...scaledLines(plan.dropsLater || [], plan.w || 0)];
  return sumPlayers(plan.activeAfter.filter(id => !tmp.has(id)), [], playerLine, extra);
};

/** Zaokruživanje na prikazanu preciznost: iste prikazane brojke = nerešeno (bez boje u tabelama). */
const cmpKey = (cat, v) => (v == null ? null : Math.round(v * (cat.ratio ? 100 : cat.type === 'pct' ? 1000 : 10)));
/** Razlike se računaju iz nezaokruženih vrednosti; EPS samo uklanja šum zaokruživanja u float-u. */
const EPS = 1e-9;
/** Procenti: promena mog tima ispod ovoga (.001) = "bez promene" i nerešeno u rezultatu (A/TO: 0.01) */
const TEAM_PCT_TIE = 0.001;
const teamTieOf = c => (c.ratio ? 0.01 : TEAM_PCT_TIE);

/** Vrednost kategorije mog tima pre i posle trejda, ili null kad roster nije unet / trejd nije moj */
function myTeamValues(c) {
  if (!state.rosters?.my?.players.length) return null;
  const plan = rosterPlan('my');
  if (!plan?.tradeTouches) return null;
  const before = sumPlayers(plan.activeBefore).vals[c.key], after = planAfterTotals(plan).vals[c.key];
  return before == null || after == null ? null : { before, after };
}
/** Promena mog tima (posle − pre) za kategoriju, ili null */
function myTeamDelta(c) {
  const v = myTeamValues(c);
  return v ? v.after - v.before : null;
}

/**
 * Za svaku kategoriju: rezultat po timu ('win' | 'lose' | ''), pobednik i razlika.
 * Učestvuju samo timovi sa bar jednim igračem koji ima podatke.
 */
function compare(totals) {
  const active = totals.map((t, i) => (t.counted > 0 ? i : -1)).filter(i => i >= 0);
  const res = { cats: {}, score: totals.map(() => 0), ties: 0, active, points: null };
  // poeni: rezultat je razlika FPts po utakmici (Dobijaš − Daješ); kolone se i dalje boje po statistici
  if (isPointsFmt() && active.length >= 2) {
    const give = totals[GIVE].vals.FPTS ?? 0, get = totals[GET].vals.FPTS ?? 0;
    res.points = { give, get, diff: get - give, contrib: pointsContrib(totals) };
  }
  for (const cat of CATS) {
    const marks = totals.map(() => '');
    if (isPunt(cat)) { res.cats[cat.key] = { marks, winner: null, runnerUp: null, margin: null, punted: true }; continue; }
    // FG%/FT% sa unetim rosterom: ako se procenat mog tima skoro ne menja, kategorija je nerešena
    const td = cat.type === 'pct' ? myTeamDelta(cat) : null;
    if (td != null && Math.abs(td) < teamTieOf(cat)) { res.cats[cat.key] = { marks, winner: null, runnerUp: null, margin: null, teamTie: true }; res.ties++; continue; }
    // sa unetim rosterom procenat ide onoj strani za koju se procenat mog tima menja (kao kartica u Pronađi trejd)
    if (td != null && active.length === 2) {
      const winner = (cat.lowerIsBetter ? td < 0 : td > 0) ? GET : GIVE, other = winner === GET ? GIVE : GET;
      marks[winner] = 'win'; marks[other] = 'lose'; res.score[winner]++;
      const a = totals[GET].vals[cat.key], b = totals[GIVE].vals[cat.key];
      res.cats[cat.key] = { marks, winner, runnerUp: other, margin: a != null && b != null ? Math.abs(a - b) : Math.abs(td) };
      continue;
    }
    // Kad se ne računa uticaj na moj tim: FG%/FT% sa oznakom "mali obim" skoro ne utiče na tim, pa je nerešeno
    if (td == null && lowVolume(cat, totals)) { res.cats[cat.key] = { marks, winner: null, runnerUp: null, margin: null, lowVolTie: true }; res.ties++; continue; }
    const entries = active.map(i => ({ i, v: totals[i].vals[cat.key] })).filter(en => en.v != null);
    let winner = null, margin = null, runnerUp = null;
    if (entries.length >= 2) {
      // porede se nezaokružene vrednosti, ali iste prikazane brojke (npr. 1.9 i 1.9) su nerešeno
      entries.sort((a, b) => (cat.lowerIsBetter ? a.v - b.v : b.v - a.v));
      const kBest = cmpKey(cat, entries[0].v), kWorst = cmpKey(cat, entries[entries.length - 1].v);
      // dve strane: i razlika koja se prikazuje kao 0 (tabela "=") je nerešeno
      const zeroDiff = entries.length === 2 && fmtDelta(cat, entries[0].v - entries[1].v).zero;
      // dve strane: nerešeno tek kad se razlika prikazuje kao 0 (ispod 0.05, kao kartica u Pronađi trejd), i kad su zaokruženi zbirovi isti
      const two = entries.length === 2;
      if (two ? !zeroDiff : kBest !== kWorst && !zeroDiff) {
        const bestOnes = two ? [entries[0]] : entries.filter(en => cmpKey(cat, en.v) === kBest);
        const worstOnes = two ? [entries[1]] : entries.filter(en => cmpKey(cat, en.v) === kWorst);
        if (bestOnes.length === 1) {
          winner = bestOnes[0].i;
          runnerUp = entries[1].i;
          margin = Math.abs(entries[0].v - entries[1].v); // nezaokruženo
          marks[winner] = 'win';
          res.score[winner]++;
        } else {
          res.ties++;
        }
        if (worstOnes.length === 1) marks[worstOnes[0].i] = 'lose';
      } else {
        res.ties++;
      }
    }
    res.cats[cat.key] = { marks, winner, runnerUp, margin };
  }
  return res;
}

/** Poeni: doprinos svake statistike sa težinom (poeni koje donosi Daješ / Dobijaš i razlika), sortirano po veličini razlike */
function pointsContrib(totals) {
  return CATS.filter(c => !c.fpts).map(c => {
    const give = c.w * (totals[GIVE].sum[c.key] ?? 0), get = c.w * (totals[GET].sum[c.key] ?? 0);
    return { c, give, get, diff: get - give, none: noData(c) };
  }).sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
}
const fmtPts = v => `${v > 0.05 ? '+' : v < -0.05 ? '−' : ''}${Math.abs(v).toFixed(1)}`;
/** Modul formata (vidi opis kod catFromStat): dve implementacije sa istim interfejsom */
const FMT_CAT = {
  columns: () => CATS,
  compareSides: totals => compare(totals),
  summary: res => ({ kind: 'cat', get: res.score[GET], give: res.score[GIVE], ties: res.ties }),
  teamTotals: ids => sumPlayers(ids),
  playerValue: p => playerValue(p)?.total ?? null, // z-score igrača (modul vrednosti)
};
const FMT_PTS = {
  ...FMT_CAT,
  summary: res => (res.points ? { kind: 'pts', diff: res.points.diff, give: res.points.give, get: res.points.get } : null),
  playerValue: p => playerValue(p)?.total ?? null, // FPts iznad zamene (modul vrednosti)
};
const FMT = () => (isPointsFmt() ? FMT_PTS : FMT_CAT);
/** Napomena ispod rezultata po tipu lige */
function formatNoteHTML() {
  const f = FMT_ACTIVE, n = CATS.filter(c => !isPunt(c)).length;
  const txt = f.scoringType === 'h2h_most' ? t('Nedeljni meč nosi samo jednu pobedu: dovoljno je da osvojiš većinu od {n} kategorija.', { n })
    : f.scoringType === 'roto' ? t('Roto računa zbir cele sezone, pa broj odigranih utakmica znači više nego u H2H.')
    : f.scoringType === 'season_points' ? t('Poeni se sabiraju cele sezone, pa broj odigranih utakmica znači više nego u nedeljnim mečevima.') : '';
  return txt ? `<div class="score-note fnote">${txt}</div>` : '';
}

/* =====================================================================
   Render
   ===================================================================== */
const searchUI = new Map(); // ključ pretrage ("0", "0:d", "1:w"...) -> { query, sel, results }

function render() {
  if (EMBED?.mini) return; // mini poređenje na početnoj ima svoj prikaz (RSMini)
  syncCats();
  if (FMT_ACTIVE.bonus?.length) setTimeout(ensureBonusLogs, 0);
  document.body.classList.toggle('many-cats', CATS.length > 9);
  if (EMBED?.finder) { const f = document.activeElement?.dataset?.search, c = document.activeElement?.selectionStart; renderStatus(); renderBanner(); renderFinderEmbed(); restoreFocus(f, c); return; }
  if (EMBED?.targets) { const f = document.activeElement?.dataset?.search, c = document.activeElement?.selectionStart; renderStatus(); renderBanner(); renderTargetsEmbed(); restoreFocus(f, c); return; }
  const focused = document.activeElement?.dataset?.search;
  const caret = document.activeElement?.selectionStart;
  renderHeader();
  renderStatus();
  renderBanner();
  if (!EMBED) renderNav();
  if (state.view === 'home') { renderHome(); renderHeader(); return; }
  renderWsHead(); // drugi red: liga, period, profil, podešavanja
  renderPeriods();
  renderHeader();
  renderLeagueBar();
  linkBudget = { page: 0, cards: new Set() };
  if (!EMBED) $('#backbar').innerHTML = state.view === 'league' ? backbarHTML() : '';
  if (state.view === 'league' && state.page !== 'trade') { renderPage(); restoreFocus(focused, caret); return; }
  autoOppForSynced();
  renderTradeTabs();
  const totals = state.teams.map(teamTotals);
  const cmp = FMT().compareSides(totals);
  renderTradeWarn();
  renderScore(totals, cmp);
  renderTeams(totals, cmp);
  renderCompare(totals, cmp);
  renderNudge();
  renderReport(totals, cmp);
  renderRosterViewBar();
  renderRosterSection('my');
  renderRosterSection('opp');
  restoreFocus(focused, caret);
}
/** Vrati fokus pretrage posle re-rendera */
function restoreFocus(focused, caret) {
  if (focused != null) {
    const inp = document.querySelector(`[data-search="${focused}"]`);
    if (inp && !inp.disabled && document.activeElement !== inp) { inp.focus(); try { inp.setSelectionRange(caret, caret); } catch {} updateDropdown(focused); }
  }
}

const initialsOf = name => (name || '').trim().split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();

function renderHeader() {
  const lg = currentLeague();
  const hl = $('#hleague');
  if (hl) hl.innerHTML = EMBED || state.view === 'home' ? '' : leaguePickerHTML(); // liga je kontekst, bira se u zaglavlju
  const nm = profile?.name?.trim();
  // čip profila je u gornjoj navigaciji (levo od jezika)
  document.querySelectorAll('button.pchip[data-action="profile"]').forEach(el => {
    el.innerHTML = `<span class="pav">${nm ? esc(initialsOf(nm)) : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg>'}</span><span class="pname">${nm ? esc(nm) : t('Profil')}</span>`;
    el.setAttribute('aria-label', t('Profil'));
  });
}

/* ---------- Izbirač: lige + brzo poređenje, sa brojem otvorenih trejdova ---------- */
/** Broj otvorenih trejdova (tabova sa igračima) u ligi / brzom poređenju */
const openTrades = scope => (tradeStoreGet().scopes[scope]?.tabs || []).filter(tabHasPlayers).length;
const openN = n => `${n} ${plural(n, ['otvoren trejd', 'otvorena trejda', 'otvorenih trejdova'], ['open trade', 'open trades'])}`;

/** Red liga iznad trejdova: sve lige + brzo poređenje, sa brojem otvorenih trejdova */
function renderLeagueBar() {
  const leagues = profile?.leagues || [];
  const chip = (attrs, name, scope, cls = '', title = '') => {
    const n = openTrades(scope);
    const on = scope === state.scope;
    return `<button type="button" class="lchip ${cls} ${on ? 'on' : ''}" ${attrs} ${on ? 'aria-current="page"' : ''} title="${esc(title || name)}${n ? ` · ${esc(openN(n))}` : ''}">
      <span class="nm">${esc(name)}</span>${n ? `<span class="cnt">${n}</span>` : ''}</button>`;
  };
  $('#leaguebar').innerHTML = `<nav class="lbar" aria-label="${t('Lige')}">
    ${leagues.map(l => chip(`data-open-league="${l.id}"`, lgName(l), l.id, '', [lgName(l), platformLabel(l.platform), l.teamName].filter(Boolean).join(' · '))).join('')}
    ${leagues.length ? '<span class="lsep" aria-hidden="true"></span>' : ''}
    ${chip('data-nav="quick"', t('Brzo poređenje'), 'quick', 'quick', t('Trejd bez lige'))}
    <button type="button" class="lchip add" data-action="add-league" title="${t('Dodaj ligu')}" aria-label="${t('Dodaj ligu')}">＋</button>
  </nav>`;
  // aktivna liga vidljiva u redu (samo vodoravno, stranica se ne pomera)
  const bar = $('#leaguebar .lbar'), on = bar?.querySelector('.lchip.on');
  if (on && (on.offsetLeft < bar.scrollLeft || on.offsetLeft + on.offsetWidth > bar.scrollLeft + bar.clientWidth)) bar.scrollLeft = on.offsetLeft - 16;
}

/** Naslov radnog prostora: liga (naziv, tim, platforma) ili brzo poređenje */
function quickFormatChipHTML() {
  const f = quickFormat();
  const gear = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>';
  return `<span class="fbar"><button type="button" class="fchip" data-action="quick-format" title="${esc(formatSummary(f))}">${esc(formatShort(f))}</button><button type="button" class="gear fgear" data-action="quick-format" title="${esc(t('Format lige'))}" aria-label="${esc(t('Format lige'))}">${gear}</button></span>`;
}
/** Brzo poređenje: izbor formata u popupu (ista komponenta kao u ligi), pamti se u browseru */
function openQuickFormat() {
  showModal({
    title: t('Format lige'),
    wide: true,
    body: `<p class="hint">${t('Važi za brzo poređenje u ovom browseru. Za ligu se format bira u podešavanjima lige.')}</p><div class="form">${formatPickerHTML('qf', quickFormat(), null)}</div>`,
    confirm: t('Sačuvaj'),
    onConfirm: () => { const fp = readFormatPicker('qf'); if (fp.error) return false; setQuickFormat(fp.f); render(); },
  });
}
function renderWsHead() {
  if (EMBED) { const fb = $('#fmtbar'); if (fb && !EMBED.mini) fb.innerHTML = quickFormatChipHTML(); return; } // na /trade-analyzer/ period i format su u samom alatu
  const el = $('#wshead');
  const lg = currentLeague();
  // profil je u gornjoj navigaciji (levo od jezika); ovde periodi i podešavanja lige, u istom redu kao ime lige
  const right = `<div class="wsh-r"><div class="seg" id="periods" role="group" aria-label="Period"></div>
    ${state.view === 'league' && lg ? `<button type="button" class="gear" data-action="league-settings" title="${esc(t('Podešavanja lige'))}" aria-label="${esc(t('Podešavanja lige'))}">⚙</button>` : ''}</div>`;
  if (state.view === 'league' && lg) {
    // red 1: ime, platforma, osvežavanje; red 2 (ispod imena): format i moj tim
    el.innerHTML = `<div class="wsh"><div class="wsh-t"><div class="wsh-l1"><h1>${esc(lgName(lg))}</h1>
      <span class="pbadge${isSynced(lg) ? ' synced' : ''}">${esc(platformLabel(lg.platform))}</span>${syncChipHTML(lg)}</div>
      <div class="wsh-meta"><button type="button" class="fchip" data-action="league-settings" title="${esc(formatSummary(leagueFormatOf(lg)))}">${esc(formatShort(leagueFormatOf(lg)))}</button>${lg.teamName ? `<span class="wsh-team">${esc(lg.teamName)}</span>` : ''}</div></div>${right}</div>${importBarsHTML(lg)}`;
  } else {
    el.innerHTML = `<div class="wsh"><div class="wsh-t"><div class="wsh-l1"><h1>${t('Brzo poređenje')}</h1></div><div class="wsh-meta">${quickFormatChipHTML()}</div></div>${right}</div>`;
  }
}

/* ---------- Tabovi trejdova ---------- */
const lastName = id => { const n = state.byId.get(id)?.name || ''; const w = n.trim().split(/\s+/); return w.length > 1 ? w.slice(1).join(' ') : n; };
function tabTitle(tb) {
  const side = list => !list.length ? '…' : list.length === 1 ? lastName(list[0]) : `${lastName(list[0])} +${list.length - 1}`;
  if (!tabHasPlayers(tb)) return t('Novi trejd');
  return `${side(tb.teams[GIVE].ids)} ⇄ ${side(tb.teams[GET].ids)}`;
}
function renderTradeTabs() {
  const s = scopeTabs();
  $('#tradetabs').innerHTML = `<div class="ttabs" role="tablist" aria-label="${t('Trejdovi')}">
    ${s.tabs.map(tb => `<div class="ttab ${tb.id === s.active ? 'on' : ''}">
      <button type="button" class="ttab-go" role="tab" aria-selected="${tb.id === s.active}" data-tab="${tb.id}" title="${esc(tabTitle(tb))}">${tb.shared ? '🔗 ' : ''}${esc(tabTitle(tb))}</button>
      <button type="button" class="ttab-x" data-tab-close="${tb.id}" aria-label="${t('Zatvori trejd')}" title="${t('Zatvori trejd')}">✕</button></div>`).join('')}
    <button type="button" class="ttab-new" data-action="tab-new">＋ ${t('Planiraj novi trejd')}</button></div>`;
  // aktivan tab uvek vidljiv u redu (samo vodoravno)
  const bar = $('#tradetabs .ttabs'), on = bar?.querySelector('.ttab.on');
  if (on && (on.offsetLeft < bar.scrollLeft || on.offsetLeft + on.offsetWidth > bar.scrollLeft + bar.clientWidth)) bar.scrollLeft = on.offsetLeft - 16;
}
function switchTab(id) {
  activateTab(id);
  state.sharedOpen = false;
  state.histView = null;
  searchUI.clear();
  saveState(); render();
}
/** "Ne pitaj me ponovo" za zatvaranje taba trejda: pamti se samo u ovom browseru */
const CLOSE_SKIP_KEY = 'fbaTrade.skipCloseConfirm';
const skipCloseConfirm = () => { try { return localStorage.getItem(CLOSE_SKIP_KEY) === '1'; } catch { return false; } };
function closeTab(id) {
  const tb = scopeTabs().tabs.find(x => x.id === id);
  if (!tb) return;
  const go = () => { removeTab(id); state.sharedOpen = false; saveState(); render(); };
  if (!tabHasPlayers(tb) || skipCloseConfirm()) { go(); return; }
  showModal({
    title: t('Zatvoriti trejd?'),
    body: `<p>${t('Trejd {x} biće uklonjen. Sačuvani trejdovi u istoriji ostaju.', { x: `<b>${esc(tabTitle(tb))}</b>` })}</p>
      <label class="modal-check"><input type="checkbox" id="close-skip"> ${t('Ne pitaj me ponovo')}</label>`,
    confirm: t('Zatvori'), danger: true,
    onConfirm: m => { if (m.querySelector('#close-skip')?.checked) { try { localStorage.setItem(CLOSE_SKIP_KEY, '1'); } catch { /* bez pamćenja */ } } go(); },
  });
}

/** Brzo poređenje: kad se doda prvi igrač, jedan nenametljiv red sa pozivom da se sačuva liga */
function renderNudge() {
  const el = $('#nudge');
  const show = state.view === 'quick' && (giveIds().length || getIds().length);
  el.innerHTML = !show ? '' : EMBED
    ? `<div class="nudge"><span>${t('Sačuvaj svoj tim i vidi kako trejd utiče na njega')}</span>
      <a class="btn" href="${esc(EMBED.app)}#home&lang=${LANG}">＋ ${t('Dodaj svoju ligu')}</a></div>`
    : `<div class="nudge"><span>${t('Sačuvaj svoj tim i vidi kako trejd utiče na njega')}</span>
    <button type="button" class="linkbtn" data-action="add-league">＋ ${t('Dodaj ligu')}</button></div>`;
}

/* ---------- Početni ekran ---------- */
function leagueCardHTML(lg) {
  const active = lg.roster.players.filter(x => !x.ir).length;
  const st = lg.standings || {};
  const place = st.rank ? t('{n}. mesto', { n: st.rank }) : '';
  return `<button type="button" class="lcard" data-open-league="${lg.id}">
    <div class="lc-top"><span class="lc-name">${esc(lgName(lg))}</span><span class="pbadge">${esc(platformLabel(lg.platform))}</span></div>
    ${lg.teamName ? `<div class="lc-team">${esc(lg.teamName)}</div>` : ''}
    ${place || st.record ? `<div class="lc-standing">${[place, esc(st.record || '')].filter(Boolean).join(' · ')}</div>` : ''}
    <div class="lc-stats">
      <span>${t('{a}/{b} igrača', { a: active, b: lg.slots?.active ?? ROSTER_DEFAULT.ACTIVE })}</span>
      <span>${(n => `${n} ${plural(n, ['protivnik', 'protivnika', 'protivnika'], ['opponent', 'opponents'])}`)(Object.keys(lg.opps || {}).length)}</span>
      <span>${trejdova((lg.history || []).length)}</span>
      ${openTrades(lg.id) ? `<span class="lc-open">${openN(openTrades(lg.id))}</span>` : ''}
    </div>
    <div class="lc-upd">${t('Ažurirano: {d}', { d: fmtShortDate(lg.updated) })}</div>
  </button>`;
}

function renderHome() {
  const el = $('#home');
  const nm = profile?.name?.trim();
  const leagues = profile?.leagues || [];
  const hello = `<div class="hello-row"><h1 class="hello">${nm ? t('Zdravo, {n}', { n: esc(nm) }) : t('Zdravo')}</h1></div>`;
  if (!leagues.length) {
    el.innerHTML = `${hello}<div class="empty-home">
      <p>${t('Sačuvaj svoju ligu i tim da vidiš kako trejd utiče na tvoj roster, ili samo brzo uporedi dva paketa igrača.')}</p>
      <div class="eh-actions"><button type="button" class="btn" data-action="add-league">＋ ${t('Dodaj svoju ligu')}</button>
      <button type="button" class="linkbtn big" data-nav="quick">${t('Samo uporedi trejd')}</button></div></div>`;
    return;
  }
  el.innerHTML = `${hello}<div class="lgrid">
    ${leagues.map(leagueCardHTML).join('')}
    <button type="button" class="lcard add" data-action="add-league"><span class="plus">＋</span><span>${t('Dodaj ligu')}</span></button>
    <button type="button" class="lcard quick" data-nav="quick"><span class="lc-name">${t('Brzo poređenje')}</span><span class="lc-team">${t('Uporedi trejd bez čuvanja')}</span></button>
  </div>`;
}

/** Izbor formata lige: ključan podatak, od njega kasnije zavisi šta se računa i prikazuje
 *  (kategorije vs poeni, broj kategorija). Neaktivni formati su vidljivi sa oznakom "uskoro". */
/** Broj mesta u rosteru (aktivni + IR), po pravilima lige */
const SLOT_RANGE = { active: [8, 30], ir: [0, 10] }; // velike dynasty lige (Sleeper 22 + taxi, Fantrax bez limita za IR)
function slotsFieldHTML(prefix, slots = {}) {
  const opts = (k, cur) => { const [a, b] = SLOT_RANGE[k]; let h = ''; for (let n = a; n <= b; n++) h += `<option value="${n}" ${n === cur ? 'selected' : ''}>${n}</option>`; return h; };
  return `<div class="form-row">
      <label>${t('Igrača u rosteru (bez IR)')}<select id="${prefix}-sa">${opts('active', slots.active ?? ROSTER_DEFAULT.ACTIVE)}</select></label>
      <label>${t('IR mesta')}<select id="${prefix}-si">${opts('ir', slots.ir ?? ROSTER_DEFAULT.IR)}</select></label>
    </div>`;
}
const readSlots = prefix => ({ active: +document.getElementById(`${prefix}-sa`).value || ROSTER_DEFAULT.ACTIVE, ir: +document.getElementById(`${prefix}-si`).value });

/* ---------- Izbor formata lige (ista komponenta: Dodaj ligu, Podešavanja lige, brzo poređenje) ---------- */
const SCORING_INFO = {
  h2h_each: { sr: 'H2H, svaka kategorija', short: 'H2H', d: 'Svaka kategorija je posebna pobeda ili poraz u nedeljnom meču.' },
  h2h_most: { sr: 'H2H, jedna pobeda nedeljno', short: 'H2H, jedna pobeda', d: 'Ko osvoji više kategorija, nosi jednu pobedu za celu nedelju (Most categories / One win).' },
  roto: { sr: 'Roto', short: 'Roto', d: 'Poredak po zbirovima cele sezone u svakoj kategoriji, bez nedeljnih mečeva.' },
  h2h_points: { sr: 'H2H poeni', short: 'Poeni', d: 'Statistike donose fantasy poene, a nedeljni meč dobija ko skupi više poena.' },
  season_points: { sr: 'Poeni za celu sezonu', short: 'Sezonski poeni', d: 'Fantasy poeni se sabiraju cele sezone, bez nedeljnih mečeva.' },
};
const PRESET_SHORT = { espn_points: 'ESPN', espn_points_classic: 'ESPN (pre 2020)', yahoo_points: 'Yahoo' };
const fmtNum = v => `${v < 0 ? '−' : ''}${Math.abs(Math.round(v * 100) / 100)}`; // prikaz težine (pravi minus)
/** Kratak naziv formata za čip i naslove: "9-cat H2H", "12-cat Roto", "Poeni · ESPN" */
function formatShort(f) {
  const x = normalizeFormat(f), info = SCORING_INFO[x.scoringType];
  if (isPointsType(x.scoringType)) return `${t(info.short)} · ${PRESET_SHORT[x.preset] ? t(PRESET_SHORT[x.preset]) : t('ručno bodovanje')}`;
  return `${x.categories.length}-cat ${t(info.short)}`;
}
/** Opis formata: "H2H, svaka kategorija, 11 kategorija: PTS, ..." ili "H2H poeni, ESPN bodovanje: PTS 1, ..." */
function formatSummary(f) {
  const x = normalizeFormat(f), info = SCORING_INFO[x.scoringType];
  const lbl = id => STAT_BY_ID.get(id)?.label || id;
  const body = isPointsType(x.scoringType)
    ? `${t(info.sr)}, ${x.preset !== 'custom' ? t(FORMAT_PRESETS[x.preset].srLabel) : t('ručno bodovanje')}: ${Object.entries(x.weights).map(([k, v]) => `${lbl(k)} ${fmtNum(v)}`).join(', ')}${x.bonus.length ? `. ${t('Bonusi po utakmici')}: ${x.bonus.map(bonusTxt).join(', ')}` : ''}`
    : `${t(info.sr)}, ${x.categories.length} ${plural(x.categories.length, ['kategorija', 'kategorije', 'kategorija'], ['category', 'categories'])}: ${x.categories.map(lbl).join(', ')}`;
  return `${body}.${x.unsupported.length ? ` ${t('Ne računa se: {list}.', { list: x.unsupported.join(', ') })}` : ''}`;
}

/** Radni format po komponenti (prefix): { f, platform, touched }. f nije normalizovan dok se ne sačuva. */
const fmtDrafts = new Map();
const WEIGHT_STATS = () => STAT_CATALOG.filter(x => x.type === 'sum');
/** Statistike za bonuse za prag u editoru bodovanja */
const BONUS_STATS = ['PTS', 'REB', 'AST', 'STL', 'BLK', 'TPM'];
const verifiedPoints = platform => ['espn', 'yahoo'].includes(platform);

function formatPickerHTML(prefix, fmt, platform = null) {
  fmtDrafts.set(prefix, { f: clone(normalizeFormat(fmt)), platform, touched: false });
  return `<fieldset class="fmt fpick" data-fpick="${prefix}">${fpickInner(prefix)}</fieldset>`;
}
function fpickInner(prefix) {
  const d = fmtDrafts.get(prefix), f = d.f, pts = isPointsType(f.scoringType);
  const radio = (name, val, cur, label, desc = '') => `<label class="radio fp-r"><input type="radio" name="${prefix}-${name}" value="${val}" data-fp-${name}="${val}" ${val === cur ? 'checked' : ''}>
    <span><b>${label}</b>${desc ? `<small>${desc}</small>` : ''}</span></label>`;
  const types = SCORING_TYPES.map(id => radio('type', id, f.scoringType, esc(t(SCORING_INFO[id].sr)), esc(t(SCORING_INFO[id].d)))).join('');
  let detail;
  if (!pts) {
    const sel = f.categories;
    const row = (x, on, i) => `<li class="fp-cat ${on ? 'on' : ''}" data-fp-cat="${x.id}">
      ${on ? `<span class="fp-h" data-fp-drag title="${esc(t('Prevuci za redosled'))}" aria-hidden="true">⋮⋮</span>` : '<span class="fp-h off" aria-hidden="true"></span>'}
      <label><input type="checkbox" data-fp-check="${x.id}" ${on ? 'checked' : ''}> <b>${esc(x.label)}</b> <span>${esc(LANG === 'en' ? x.en : x.sr)}${x.dir === 'low' ? ` · ${esc(t('manje je bolje'))}` : ''}</span></label>
      ${on ? `<span class="fp-mv"><button type="button" class="linkbtn" data-fp-move="-1" ${i === 0 ? 'disabled' : ''} aria-label="${esc(t('Pomeri gore'))}">↑</button><button type="button" class="linkbtn" data-fp-move="1" ${i === sel.length - 1 ? 'disabled' : ''} aria-label="${esc(t('Pomeri dole'))}">↓</button></span>` : ''}</li>`;
    detail = `<div class="fp-sub"><div class="fp-t">${t('Kategorije')}</div>
      <div class="fp-presets">${radio('preset', '9cat', f.preset, esc(t('9 kategorija')))}${radio('preset', '8cat', f.preset, esc(t('8 kategorija (bez TO)')))}${radio('preset', 'custom', f.preset, esc(t('Svoje kategorije')))}</div>
      ${f.preset === 'custom' ? `<p class="hint">${t('Čekiraj kategorije svoje lige (najmanje 2) i složi ih redom kao u ligi.')}</p>
        <ul class="fp-cats">${sel.map((id, i) => row(STAT_BY_ID.get(id), true, i)).join('')}${STAT_CATALOG.filter(x => !sel.includes(x.id) && x.cat !== false).map(x => row(x, false)).join('')}</ul>` : ''}</div>`;
  } else {
    const presets = ['espn_points', 'espn_points_classic', 'yahoo_points'].map(id => radio('preset', id, f.preset, esc(t(FORMAT_PRESETS[id].srLabel)))).join('') + radio('preset', 'custom', f.preset, esc(t('Svoje bodovanje')));
    detail = `<div class="fp-sub"><div class="fp-t">${t('Bodovanje')}</div>
      <div class="fp-presets">${presets}</div>
      ${!verifiedPoints(d.platform) && d.platform ? `<p class="hint">${t('Prepiši bodovanje iz podešavanja svoje lige.')}</p>` : ''}
      <div class="fp-weights">${WEIGHT_STATS().map(x => `<label title="${esc(LANG === 'en' ? x.en : x.sr)}"><span>${esc(x.label)}</span><input type="number" step="0.1" inputmode="decimal" data-fp-w="${x.id}" value="${f.weights[x.id] ?? ''}" placeholder="0"></label>`).join('')}</div>
      <p class="hint">${t('DD, TD i QD su dabl-dabl, tripl-dabl i četvorostruki dabl-dabl (tripl-dabl se računa i kao dabl-dabl). TF, FF, EJ i DQ su tehničke, flagrantne, izbacivanja i isključenja.')}</p>
      <div class="fp-bonus"><div class="fp-t2">${t('Bonusi po utakmici')}</div>
        <p class="hint">${t('Poeni za prag u jednoj utakmici, npr. 40+ poena = 2. Računa se iz statistike svake utakmice.')}</p>
        ${(f.bonus || []).map((b, i) => `<div class="fp-brow" data-fp-bi="${i}">
          <select data-fp-bs aria-label="${esc(t('Statistika'))}">${BONUS_STATS.map(id => `<option value="${id}" ${id === b.s ? 'selected' : ''}>${esc(STAT_BY_ID.get(id).label)}</option>`).join('')}</select>
          <label><input type="number" min="1" max="200" step="1" inputmode="numeric" data-fp-bn value="${b.n}" aria-label="${esc(t('Prag'))}">+</label>
          <span>=</span><label><input type="number" step="0.5" inputmode="decimal" data-fp-bw value="${b.w}" aria-label="${esc(t('Poeni'))}"> ${t('poena')}</label>
          <button type="button" class="linkbtn" data-fp-brm aria-label="${esc(t('Ukloni bonus'))}">✕</button></div>`).join('')}
        <button type="button" class="linkbtn" data-fp-badd>＋ ${t('Dodaj bonus')}</button></div>
      <p class="hint fp-check">${t('Proveri bodovanje u podešavanjima svoje lige, lige ga često menjaju.')}</p></div>`;
  }
  return `<legend>${t('Format lige')}</legend>
    <div class="fp-types">${types}</div>
    ${detail}
    <label class="fp-uns">${t('Liga boduje još nešto što nije na listi? (opciono)')}<input type="text" data-fp-uns maxlength="200" value="${esc(f.unsupported.join(', '))}" placeholder="${esc(t('npr. bonus za 40 poena'))}">
      <small class="hint">${t('Te statistike nemamo u podacima: ne računaju se, ali se navode uz rezultat.')}</small></label>
    <p class="fp-sum" aria-live="polite">${esc(formatSummary(f))}</p>
    <p class="hint fp-foot">${t('Ne podržavamo formate bez trejdova i formate gde se računa samo jedna utakmica nedeljno (npr. Yahoo High Score).')}</p>
    <p class="fp-err" hidden></p>`;
}
const fpickEl = prefix => document.querySelector(`[data-fpick="${prefix}"]`);
function fpickRender(prefix) {
  const el = fpickEl(prefix); if (!el) return;
  el.innerHTML = fpickInner(prefix);
}
const fpickSum = prefix => { const el = fpickEl(prefix)?.querySelector('.fp-sum'); if (el) el.textContent = formatSummary(fmtDrafts.get(prefix).f); };
/** Platforma promenjena (Dodaj ligu / Podešavanja): podrazumevano bodovanje, dok korisnik ne izabere svoje */
function fpickPlatform(prefix, platform) {
  const d = fmtDrafts.get(prefix); if (!d) return;
  d.platform = platform;
  if (isPointsType(d.f.scoringType) && !d.touched) d.f = { ...clone(defaultFormatFor(platform, 'points')), scoringType: d.f.scoringType, unsupported: d.f.unsupported, bonus: d.f.bonus || [] };
  fpickRender(prefix);
}
/** Pročitaj izbor: { f } ili { error } (prikazuje grešku u komponenti) */
function readFormatPicker(prefix) {
  const d = fmtDrafts.get(prefix), el = fpickEl(prefix);
  const err = msg => { const e = el?.querySelector('.fp-err'); if (e) { e.textContent = msg; e.hidden = false; e.scrollIntoView({ block: 'nearest' }); } return { error: msg }; };
  if (!isPointsType(d.f.scoringType) && d.f.preset === 'custom' && d.f.categories.length < FORMAT_LIMITS.MIN_CATS) return err(t('Izaberi bar 2 kategorije.'));
  if (isPointsType(d.f.scoringType) && !Object.values(d.f.weights).some(v => +v)) return err(t('Upiši bar jednu težinu za poene.'));
  return { f: normalizeFormat(d.f) };
}
const fpPrefixOf = el => el.closest('[data-fpick]')?.dataset.fpick;
document.addEventListener('change', e => {
  const fp = e.target.closest('[data-fa-pick]');
  if (fp) { // Izaberi sam: ime sa mog rostera (autocomplete iz datalist), može više igrača
    const lg = currentLeague(), v = fp.value.trim().toLowerCase();
    const x = (lg?.roster?.players || []).filter(y => !y.ir).map(y => state.byId.get(y.id)).find(p => p && p.name.toLowerCase() === v);
    if (x) { const u = faUi(); if (!u.picks.includes(x.id)) u.picks.push(x.id); render(); setTimeout(() => document.querySelector('[data-fa-pick]')?.focus(), 0); }
    return;
  }
  if (e.target.id === 'al-platform' || e.target.id === 'ls-platform' || e.target.id === 'pa-platform') { fpickPlatform(e.target.id.slice(0, 2), e.target.value); return; }
  const prefix = fpPrefixOf(e.target); if (!prefix) return;
  const d = fmtDrafts.get(prefix), el = e.target;
  if (el.dataset.fpType) {
    const nt = el.dataset.fpType, wasPts = isPointsType(d.f.scoringType);
    if (wasPts !== isPointsType(nt)) { d.f = { ...clone(defaultFormatFor(d.platform, isPointsType(nt) ? 'points' : 'cat')), unsupported: d.f.unsupported }; d.touched = false; }
    d.f.scoringType = nt;
    fpickRender(prefix);
  } else if (el.dataset.fpPreset) {
    const pr = el.dataset.fpPreset;
    if (isPointsType(d.f.scoringType)) d.touched = true; // izabrano bodovanje se ne menja sa platformom
    if (pr !== 'custom') { d.f.preset = pr; if (isPointsType(d.f.scoringType)) { d.f.weights = { ...FORMAT_PRESETS[pr].weights }; d.f.bonus = []; } else d.f.categories = [...FORMAT_PRESETS[pr].categories]; }
    else d.f.preset = 'custom';
    fpickRender(prefix);
  } else if (el.dataset.fpCheck) {
    const id = el.dataset.fpCheck;
    d.f.categories = el.checked ? [...d.f.categories, id] : d.f.categories.filter(x => x !== id);
    fpickRender(prefix);
    fpickEl(prefix)?.querySelector(`[data-fp-check="${id}"]`)?.focus();
  }
});
document.addEventListener('input', e => {
  const prefix = fpPrefixOf(e.target); if (!prefix) return;
  const d = fmtDrafts.get(prefix), el = e.target;
  if (el.dataset.fpW) {
    const v = el.value.trim() === '' ? null : +el.value;
    if (v == null || !Number.isFinite(v) || v === 0) delete d.f.weights[el.dataset.fpW]; else d.f.weights[el.dataset.fpW] = v;
    d.touched = true;
    // izmenjena težina: postavka postaje "Svoje bodovanje"
    const hit = Object.entries(FORMAT_PRESETS).find(([, x]) => x.kind === 'points' && sameWeights(d.f.weights, x.weights));
    d.f.preset = hit && !d.f.bonus?.length ? hit[0] : 'custom';
    fpickEl(prefix).querySelectorAll('[data-fp-preset]').forEach(r => { r.checked = r.value === d.f.preset; });
    fpickSum(prefix);
  } else if (el.matches('[data-fp-uns]')) {
    d.f.unsupported = el.value.split(',').map(x => x.trim()).filter(Boolean);
    fpickSum(prefix);
  } else if (el.matches('[data-fp-bn], [data-fp-bw]')) {
    const b = d.f.bonus?.[+el.closest('[data-fp-bi]').dataset.fpBi];
    if (b) { b[el.matches('[data-fp-bn]') ? 'n' : 'w'] = +el.value; d.touched = true; fpBonusPreset(prefix); }
  }
});
/** Bonus u bodovanju: postavka postaje "Svoje bodovanje" */
function fpBonusPreset(prefix) {
  const d = fmtDrafts.get(prefix);
  if (d.f.bonus?.length) d.f.preset = 'custom';
  fpickEl(prefix)?.querySelectorAll('[data-fp-preset]').forEach(r => { r.checked = r.value === d.f.preset; });
  fpickSum(prefix);
}
document.addEventListener('change', e => {
  const el = e.target.closest('[data-fp-bs]'); if (!el) return;
  const prefix = fpPrefixOf(el), d = fmtDrafts.get(prefix), b = d.f.bonus?.[+el.closest('[data-fp-bi]').dataset.fpBi];
  if (b) { b.s = el.value; d.touched = true; fpBonusPreset(prefix); }
});
document.addEventListener('click', e => {
  const el = e.target.closest('[data-fp-badd], [data-fp-brm]'); if (!el) return;
  const prefix = fpPrefixOf(el), d = fmtDrafts.get(prefix);
  d.f.bonus ||= [];
  if (el.matches('[data-fp-badd]')) d.f.bonus.push({ s: 'PTS', n: 40, w: 2 });
  else d.f.bonus.splice(+el.closest('[data-fp-bi]').dataset.fpBi, 1);
  d.touched = true;
  if (d.f.bonus.length) d.f.preset = 'custom';
  fpickRender(prefix);
});
document.addEventListener('click', e => {
  const b = e.target.closest('[data-fp-move]'); if (!b) return;
  const prefix = fpPrefixOf(b), d = fmtDrafts.get(prefix), id = b.closest('[data-fp-cat]').dataset.fpCat;
  const list = d.f.categories, i = list.indexOf(id), j = i + +b.dataset.fpMove;
  if (j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  fpickRender(prefix);
  fpickEl(prefix)?.querySelector(`[data-fp-cat="${id}"] [data-fp-move="${b.dataset.fpMove}"]`)?.focus();
});
// prevlačenje reda za redosled (miš i prst, pointer događaji)
document.addEventListener('pointerdown', e => {
  const h = e.target.closest('[data-fp-drag]'); if (!h) return;
  e.preventDefault();
  const li = h.closest('[data-fp-cat]'), ul = li.parentElement, prefix = fpPrefixOf(li);
  li.classList.add('dragging');
  const move = ev => {
    const over = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('.fp-cat.on');
    if (!over || over === li || over.parentElement !== ul) return;
    const r = over.getBoundingClientRect();
    ul.insertBefore(li, ev.clientY < r.top + r.height / 2 ? over : over.nextSibling);
  };
  const up = () => {
    document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up);
    fmtDrafts.get(prefix).f.categories = [...ul.querySelectorAll('.fp-cat.on')].map(x => x.dataset.fpCat);
    fpickRender(prefix);
  };
  document.addEventListener('pointermove', move); document.addEventListener('pointerup', up);
});

/* ---------- Podešavanja lige ---------- */
const TEAM_STATES = [
  { id: 'contend', sr: 'Borim se za vrh' }, { id: 'middle', sr: 'Sredina' }, { id: 'rebuild', sr: 'Rebuild' },
];

const isoDay = ms => { const d = new Date(ms); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; };
function openLeagueSettings() {
  const lg = currentLeague(); if (!lg) return;
  if (isSynced(lg)) { openSyncedSettings(lg); return; } // uvezena liga: sve dolazi iz lige
  const st = lg.standings || {};
  const num = v => (v == null || v === '' ? '' : v);
  showModal({
    title: t('Podešavanja lige'),
    wide: true,
    body: `<div class="form">
      ${importSettingsHTML(lg)}
      <label>${t('Naziv lige')}<input type="text" id="ls-name" maxlength="40" value="${esc(lgName(lg))}"></label>
      <label>${t('Naziv mog tima')}<input type="text" id="ls-team" maxlength="40" value="${esc(lg.teamName || '')}"></label>
      <div class="form-row">
        <label>${t('Platforma')}<select id="ls-platform">${PLATFORMS.map(p => `<option value="${p.id}" ${p.id === lg.platform ? 'selected' : ''}>${esc(platformLabel(p.id))}</option>`).join('')}</select></label>
        <label>${t('Broj timova')}<input type="number" id="ls-teams" min="2" max="30" value="${num(lg.teams)}"></label>
      </div>
      ${formatPickerHTML('ls', leagueFormatOf(lg), lg.platform)}
      ${slotsFieldHTML('ls', lg.slots)}
      <label>${t('Rok za trejdove (opciono)')}<input type="date" id="ls-deadline" value="${lg.deadline ? isoDay(lg.deadline) : ''}"><span class="hint">${t('Ako ga uneseš, 7 dana pre roka dobijaš upozorenje.')}</span></label>
      ${importOnlyHTML(t('Period obrade trejda i IR pravila lige'))}
      <fieldset class="fmt"><legend>${t('Tabela (opciono)')}${st.updated ? ` <span class="hint">${t('Ažurirano: {d}', { d: fmtShortDate(st.updated) })}</span>` : ''}</legend>
        <div class="form-row">
          <label>${t('Mesto')}<input type="number" id="ls-rank" min="1" max="30" value="${num(st.rank)}"></label>
          <label>${t('Skor')}<input type="text" id="ls-record" maxlength="20" placeholder="${t('npr. 42-30-3')}" value="${esc(st.record || '')}"></label>
        </div>
        <div class="form-row">
          <label>${t('Timova u plejofu')}<input type="number" id="ls-pteams" min="1" max="30" value="${num(st.playoffTeams)}"></label>
          <label>${t('Nedelja plejofa')}<input type="number" id="ls-pweek" min="1" max="30" value="${num(st.playoffWeek)}"></label>
        </div>
      </fieldset>
      <label>${t('Stanje mog tima')}<select id="ls-state"><option value="">–</option>${TEAM_STATES.map(s => `<option value="${s.id}" ${s.id === lg.teamState ? 'selected' : ''}>${t(s.sr)}</option>`).join('')}</select></label>
      <label>${t('Napomena')}<textarea id="ls-note" rows="3" maxlength="500">${esc(lg.note || '')}</textarea></label>
      ${colsResetHTML(lg)}
      <div class="ls-export"><button type="button" class="linkbtn" data-action="export-league">⤓ ${t('Izvezi samo ovu ligu')}</button> <span class="hint export-msg"></span></div>
      <div class="ls-actions"><button type="button" class="linkbtn" data-action="league-dup">${t('Dupliraj ligu')}</button>
        <button type="button" class="linkbtn danger" data-action="league-del">${t('Obriši ligu')}</button></div>
    </div>`,
    confirm: t('Sačuvaj'),
    onConfirm: () => {
      const v = id => document.getElementById(id).value;
      const name = v('ls-name').trim();
      if (!name) { document.getElementById('ls-name').focus(); return false; }
      const toNum = x => (x === '' ? null : Math.max(0, Math.round(+x)) || null);
      const newSt = { rank: toNum(v('ls-rank')), record: v('ls-record').trim(), playoffTeams: toNum(v('ls-pteams')), playoffWeek: toNum(v('ls-pweek')) };
      const changed = ['rank', 'record', 'playoffTeams', 'playoffWeek'].some(k => (newSt[k] ?? '') !== (st[k] ?? ''));
      const fp = readFormatPicker('ls');
      if (fp.error) return false;
      const oldF = leagueFormatOf(lg);
      // sve vrednosti se čitaju odmah: prozor za potvrdu formata zatvara ovaj
      const vals = {
        name, teamName: v('ls-team').trim(), platform: v('ls-platform'),
        teams: Math.max(2, Math.min(30, +v('ls-teams') || lg.teams || 12)),
        leagueFormat: fp.f,
        slots: readSlots('ls'),
        deadline: v('ls-deadline') ? new Date(`${v('ls-deadline')}T23:59:00`).getTime() || null : null,
        teamState: v('ls-state') || null, note: v('ls-note').trim(),
        standings: { ...newSt, updated: changed ? nowISO() : st.updated || null },
      };
      const apply = () => {
        Object.assign(lg, vals);
        applyFormatChange(lg, oldF);
        touchLeague(lg); saveProfile(); render();
      };
      if (sameFormat(oldF, fp.f)) { apply(); return; }
      // promena formata: potvrda, pa se sve odmah preračunava (otvoreni trejdovi ostaju)
      setTimeout(() => showModal({
        title: t('Promeniti format lige?'),
        body: `<p>${t('Sa {a} na {b}.', { a: `<b>${esc(formatShort(oldF))}</b>`, b: `<b>${esc(formatShort(fp.f))}</b>` })}</p>
          <p>${t('Rezultat, tabele, izveštaj i tekst za AI odmah se preračunavaju po novom formatu. Punt za kategorije kojih više nema se briše. Otvoreni trejdovi ostaju.')}</p>`,
        confirm: t('Promeni format'), onConfirm: apply,
      }), 0);
    },
  });
}

/** Posle promene formata: punt samo za kategorije koje postoje u novom formatu (u ligama na poene punta nema) */
function applyFormatChange(lg, oldF) {
  const f = leagueFormatOf(lg);
  if (sameFormat(oldF, f)) return;
  lg.punt = isPointsType(f.scoringType) ? [] : (lg.punt || []).filter(k => f.categories.includes(k));
  if (currentLeague() === lg) state.punt = new Set(lg.punt);
}

function duplicateLeague() {
  const lg = currentLeague(); if (!lg) return;
  const copy = { ...clone(lg), id: uid(), name: t('{n} (kopija)', { n: lgName(lg) }), created: nowISO(), updated: nowISO(), externalLeagueId: null, accountId: null };
  if (isSynced(lg)) delete copy.import; // kopija uvezene lige je obična liga (ručno uređivanje, bez osvežavanja)
  profile.leagues.push(copy); saveProfile();
  closeModal();
  navigate('league', copy.id);
}

function deleteLeague() {
  const lg = currentLeague(); if (!lg) return;
  showModal({
    title: t('Obrisati ligu „{n}”?', { n: esc(lgName(lg)) }),
    body: `<p>${t('Roster, protivnici i istorija ove lige biće trajno obrisani iz ovog browsera. Ovo ne može da se vrati, osim iz rezervne kopije.')}</p>`,
    confirm: t('Obriši'), danger: true,
    onConfirm: () => {
      profile.leagues = profile.leagues.filter(l => l.id !== lg.id);
      if (profile.lastLeagueId === lg.id) profile.lastLeagueId = profile.leagues[0]?.id || null;
      saveProfile();
      delete tradeStoreGet().scopes[lg.id]; persistTrades();
      const cs = lsGet(COLS_KEY); if (cs?.[lg.id]) { delete cs[lg.id]; lsSet(COLS_KEY, cs); } // i redosled kolona te lige
      for (const k of ['fbaTrade.statusSeen.v2', 'fbaTrade.alertsHidden.v1', 'fbaTrade.faLocks.v1']) { const m = lsGet(k); if (m?.[lg.id]) { delete m[lg.id]; lsSet(k, m); } } // statusi, sakriveni alerti i zaključani FA igrači te lige
      bindScope('quick');
      location.hash = 'home';
    },
  });
}

/* ---------- Ručni unos lige (kratak korak; profil se pravi u pozadini). Izbor načina: openAddLeague u modulu uvoza ---------- */
function openManualLeague() {
  const needName = !profile?.name?.trim();
  showModal({
    title: t('Dodaj ligu'),
    wide: true,
    body: `<div class="form">
      <label>${t('Naziv lige')}<input type="text" id="al-name" maxlength="40" placeholder="${t('npr. Liga sa posla')}"></label>
      <label>${t('Naziv mog tima')}<input type="text" id="al-team" maxlength="40" placeholder="${t('kako se tvoj tim zove u ligi')}"></label>
      <div class="form-row">
        <label>${t('Platforma')}<select id="al-platform">${PLATFORMS.map(p => `<option value="${p.id}">${esc(platformLabel(p.id))}</option>`).join('')}</select></label>
        <label>${t('Broj timova')}<input type="number" id="al-teams" min="2" max="30" value="12"></label>
      </div>
      ${formatPickerHTML('al', defaultFormatFor(PLATFORMS[0].id, 'cat'), PLATFORMS[0].id)}
      ${slotsFieldHTML('al')}
      ${needName ? `<label>${t('Tvoje ime (opciono)')}<input type="text" id="al-me" maxlength="30"></label>` : ''}
      </div>`,
    confirm: t('Napravi ligu'),
    onConfirm: () => {
      const name = document.getElementById('al-name').value.trim();
      if (!name) { document.getElementById('al-name').focus(); return false; }
      const fmt = readFormatPicker('al');
      if (fmt.error) return false;
      createLeague({
        name,
        teamName: document.getElementById('al-team').value.trim(),
        leagueFormat: fmt.f,
        platform: document.getElementById('al-platform').value,
        teams: Math.max(2, Math.min(30, +document.getElementById('al-teams').value || 12)),
        slots: readSlots('al'),
      }, document.getElementById('al-me')?.value.trim());
    },
  });
  setTimeout(() => document.getElementById('al-name')?.focus(), 30);
}

/** Napravi ligu (i profil ako ne postoji); trenutni trejd iz brzog poređenja prelazi u novu ligu */
function createLeague(fields, myName = '') {
  if (!profile) profile = newProfile('');
  if (myName && !profile.name) profile.name = myName;
  const lg = newLeague(fields);
  profile.leagues.push(lg);
  profile.lastLeagueId = lg.id;
  const carried = state.scope === 'quick' && (giveIds().length || getIds().length);
  if (carried) {
    // trenutni trejd iz brzog poređenja prelazi u novu ligu (kao njen prvi tab)
    const tab = activeTab();
    tradeStoreGet().scopes[lg.id] = { active: tab.id, tabs: [{ ...clone(tab), balance: emptyBalance() }] };
    removeTab(tab.id);
  }
  saveProfile();
  location.hash = `league-${lg.id}/${carried ? 'trade' : 'overview'}`;
  return lg;
}

/* =====================================================================
   Uvoz lige (samo javne lige): ESPN, Sleeper i Fantrax (iza zastavice), Nalepi roster.
   Nikad ne tražimo lozinku, kolačiće (espn_s2, SWID) ni tokene.
   Čuva se samo: naziv lige i timova, skraćenice, skor, mesto, zbirovi statistika timova (valuesByStat)
   i ID-jevi igrača. Bez imena vlasnika (members) i bez GUID-ova vlasnika.
   lg.import { source: 'espn' | 'sleeper' | 'fantrax' | 'paste', extId, season, syncedAt, error, myTid, deadline, playoffTeams,
               teams: [{ tid, name, abbrev, record{ w, l, t }, seed, pf, vals{ PTS, FGM, FGA, ... } }] }
   ===================================================================== */
const IMPORT = {
  TEMP_SWAP_MS: 10 * 60 * 1000,           // prihvaćen trejd: rosteri prikazuju timove posle trejda ovoliko dugo
  PENDING_SYNC_MS: 10 * 60 * 1000,        // prihvaćen trejd čeka platformu: proveravaj ovoliko često dok je aplikacija otvorena
  TTL_MS: 10 * 60 * 1000,                 // pri otvaranju lige osveži ako je starije od ovoga (bez stalnog povlačenja)
  DEADLINE_WARN_DAYS: 7,
  EXTRAS_KEY: `fbaTrade.extras.v1.${CONFIG.SEASON}`, // igrači sa uvezenih rostera koji nisu u top 600
  EXTRAS_MAX: 500,
  NAMES_KEY: `fbaTrade.names.v1.${CONFIG.SEASON}`,   // svi aktivni igrači (ID, ime, tim) za prepoznavanje imena
  NAMES_TTL_MS: 24 * 60 * 60 * 1000,                 // najviše jednom dnevno
  NAMES_URL: `https://lm-api-reads.fantasy.espn.com/apis/v3/games/fba/seasons/${CONFIG.SEASON}/players?view=players_wl`,
  ESPN_URL: (id, season) => `https://lm-api-reads.fantasy.espn.com/apis/v3/games/fba/seasons/${season}/segments/0/leagues/${id}?view=mTeam&view=mRoster&view=mSettings&view=mStandings`,
  SLEEPER: 'https://api.sleeper.app/v1',
  SLEEPER_NAMES_KEY: 'fbaTrade.sleeperNames.v2',
  SLEEPER_STATUS_TTL_MS: 6 * 60 * 60 * 1000,        // Sleeper statusi povreda: najviše na svakih 6 sati
  FANTRAX: 'https://www.fantrax.com/fxea/general',
  FANTRAX_NAMES_KEY: 'fbaTrade.fantraxNames.v1',
  FLAGS_KEY: 'rs.importFlags',            // {"sleeper":true,"fantrax":true} samo za testiranje (dok se ne potvrdi na pravoj ligi)
};
const importFlag = k => { try { return !!(JSON.parse(localStorage.getItem(IMPORT.FLAGS_KEY) || '{}') || {})[k]; } catch { return false; } };
/* ---------- Adapteri platformi ----------
   Jedini deo koda koji zna kako izgledaju podaci ESPN-a, Sleepera i Fantraxa. Svaki adapter povlači ligu i prevodi je
   u zajednički model (applyImport upisuje lg.import i rostere). Ostatak aplikacije čita samo zajednički model i pita
   samo da li je liga uvezena (isSynced) ili ručna, nikad koja je platforma. Nova platforma (npr. Yahoo posle prijave)
   = novi unos ovde + forma za uvoz.

   Zajednički model, lg.import:
     source, extId, season, syncedAt, error, myTid, teams [{ tid, name, abbrev, record, seed, pf, vals }]
     playoffTeams, playoffWeek, week
     stFrom: 'league' (status igrača dolazi iz lige) | null (platforma ne daje: ESPN status uz oznaku "(ESPN)")
     stMarkFa: true = za igrače van rostera lige ESPN status se označava "(ESPN)"
     irRule: dozvoljeni ključevi statusa na IR mestu | null (platforma ne daje); irLabels: ključ -> oznaka
     irNote: pravilo je opšte pravilo platforme (nije u podešavanjima lige); irLock: dok je nedozvoljen igrač na IR, nema dodavanja
     irSlotsKnown: false = broj IR mesta je procena
     reviewHours, vetoVotes, deadline (ms), deadlineApprox, deadlineWeek
     fmtUnverified: neke stavke bodovanja su približne; adj: zbir sezone sa platforme po igraču (TF, FF)
     acqLimit: { n, per: 'week' | 'day', used } limit preuzimanja po meču (used samo za 'week') | null (platforma ne daje)
     acqSeason: { n, used } limit preuzimanja za sezonu | null
     periods: [[početak ms, kraj ms], …] nedelje meča iz lige | null (od ponedeljka do nedelje)
     waiverDays: koliko dana je otpušten igrač na waiveru (lista se pravi iz transakcija) | null
   Adapter.waivers(lg): igrači na waiveru u ovoj ligi, Map(id -> do kada, ms ili null) | null (platforma ne daje)
   Roster igrač: { id, ir, st (zajednički status, bez ACTIVE), lb (oznaka platforme), k (ključ za IR pravilo) } */
const IMPORT_MODEL = 2;
const ADAPTERS = {
  espn: {
    label: 'ESPN', seasonEnd: true, // ESPN broji sezonu po godini kraja (2027 = 2026-27)
    fetch: q => fetchEspnLeague(q.extId, q.season).then(d => parseEspnLeague(d, q.extId, q.season)),
    lockText: () => t('Roster se povlači iz ESPN-a'), syncText: () => t('Osveži iz ESPN-a'),
    // ESPN: na IR mesto samo oznake O (OUT) i IR; opšte pravilo ESPN-a (potvrdila podrška), nije u API-ju
    common: { stFrom: 'league', stMarkFa: false, irRule: ['OUT', 'IR'], irLabels: null, irNote: true, irLock: true, irSlotsKnown: true, deadlineApprox: false, fmtUnverified: false },
    legacy: imp => ({ stFrom: imp.stLive ? 'league' : null }), // lige uvezene pre statusa iz lige: ESPN baza dok se ne osveže
    waivers: lg => espnWaivers(lg),
  },
  sleeper: {
    label: 'Sleeper',
    fetch: q => fetchSleeperLeague(q),
    common: { stFrom: 'league', stMarkFa: true, irLabels: SLEEPER_IR_LABEL, irNote: false, irLock: false, irSlotsKnown: true, deadlineApprox: true, fmtUnverified: false },
    legacy: imp => ({ irRule: imp.irAllow || null, reviewHours: imp.reviewDays != null ? imp.reviewDays * 24 : imp.reviewHours ?? null }),
    legacyPlayer: x => (typeof x.st === 'string' && !x.k ? { ...x, ...sleeperStatus(x.st) } : x), // stari Sleeper status ("Questionable") -> zajednički
    waivers: lg => sleeperWaivers(lg),
  },
  fantrax: {
    label: 'Fantrax',
    fetch: q => fetchFantraxLeague(q),
    // Fantrax ne daje status igrača, IR pravilo, broj IR mesta, period obrade ni rok
    common: { stFrom: null, stMarkFa: true, irRule: null, irLabels: null, irNote: false, irLock: false, irSlotsKnown: false, deadlineApprox: false, fmtUnverified: true, reviewHours: null, deadline: null },
  },
};
const SYNC_SOURCES = Object.keys(ADAPTERS);
const SOURCE_LABEL = Object.fromEntries(SYNC_SOURCES.map(k => [k, ADAPTERS[k].label]));
/** Ime platforme uvezene lige (za tekstove) */
const srcName = lg => SOURCE_LABEL[lg?.import?.source] || '';
/** Sezona za prikaz (2026-27): neke platforme broje po godini kraja, ostale po godini početka */
const seasonLabel = (src, season) => {
  const y = String(season ?? '');
  if (!/^\d{4}$/.test(y)) return y;
  const a = ADAPTERS[src]?.seasonEnd ? +y - 1 : +y;
  return `${a}-${String(a + 1).slice(2)}`;
};
const isSynced = (lg = currentLeague()) => !!lg?.import && SYNC_SOURCES.includes(lg.import.source);
const isPasted = (lg = currentLeague()) => lg?.import?.source === 'paste';
const rosterLocked = () => isSynced(currentLeague());
const lockText = (lg = currentLeague()) => ADAPTERS[lg?.import?.source]?.lockText?.() || t('Roster se povlači sa platforme {p}', { p: srcName(lg) });
const syncBtnText = src => ADAPTERS[src]?.syncText?.() || t('Osveži sa platforme {p}', { p: SOURCE_LABEL[src] || '' });
/** Uvezene lige sačuvane pre zajedničkog modela: dopuni polja iz adaptera (jednom, pri učitavanju) */
function normalizeImport(lg) {
  const imp = lg?.import, A = isSynced(lg) && ADAPTERS[imp.source];
  if (!A || imp.model === IMPORT_MODEL) return false;
  Object.assign(imp, A.common, A.legacy?.(imp) || {}, { model: IMPORT_MODEL });
  if (A.legacyPlayer) for (const r of [lg.roster, ...Object.values(lg.opps || {})]) if (r?.players) r.players = r.players.map(A.legacyPlayer);
  delete imp.stLive; delete imp.irAllow; delete imp.reviewDays; delete lg.fmtAdopted;
  return true;
}
/** Vodič za uvoz (javna stranica; otvara se u novom tabu da se ništa ne izgubi) */
const howtoUrl = anchor => `${LANG === 'sr' ? '../sr/how-to-import/' : '../how-to-import/'}${anchor ? `#${anchor}` : ''}`;
const howtoLink = (anchor, label) => `<a class="howto" href="${howtoUrl(anchor)}" target="_blank" rel="noopener">${label || t('Kako?')}</a>`;
/** Ručna liga: diskretna napomena na mestu funkcije koja postoji samo u uvezenim ligama */
const importOnlyHTML = what => `<p class="hint imp-only">${what}: ${t('dostupno za uvezene lige.')} <a class="howto" href="${howtoUrl()}" target="_blank" rel="noopener">${t('Kako da uvezem ligu?')}</a></p>`;
const recTxt = r => (r ? `${r.w}-${r.l}${r.t ? `-${r.t}` : ''}` : '');
/** Skor tima za prikaz: u roto ligi nema pobeda i poraza, pa se prikazuju roto bodovi iz tabele (Fantrax getStandings.points, npr. "79") */
const standTxt = (tm, pts = false) => (tm && !pts && !(tm.record?.w || tm.record?.l || tm.record?.t) && tm.pf > 0 ? t('{n} bod.', { n: fmtNum(tm.pf) }) : recTxt(tm?.record));
const cleanName = x => String(x ?? '').replace(/\s+/g, ' ').trim().slice(0, 40);
const importErr = code => Object.assign(new Error(code), { code });
/** Sezona: iz linka (seasonId=…) ako je navedena, inače tekuća */
const seasonFromInput = s => { const m = String(s || '').match(/[?&#]seasonId=(\d{4})\b/); return m ? +m[1] : CONFIG.SEASON; };

/** fetch bez kolačića, sa istekom; greške: private (401/403), notfound (404), network, empty (nije JSON) */
async function fetchJSON(url, opts = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), CONFIG.FETCH_TIMEOUT_MS);
  try {
    let res;
    try { res = await fetch(url, { ...opts, signal: ctrl.signal, credentials: 'omit' }); } catch { throw importErr('network'); }
    if (res.status === 401 || res.status === 403) throw importErr('private');
    if (res.status === 404) throw importErr('notfound');
    if (!res.ok) throw importErr('network');
    try { return await res.json(); } catch { throw importErr('empty'); }
  } finally { clearTimeout(timer); }
}

/* ---------- ESPN ---------- */
async function fetchEspnLeague(id, season) {
  let data;
  try { data = await fetchJSON(IMPORT.ESPN_URL(id, season)); } catch (e) { throw importErr(e.code === 'empty' ? 'private' : e.code); }
  // privatna liga bez prijave: prazan odgovor ili bez timova
  if (!data || !Array.isArray(data.teams) || !data.teams.length || !data.settings) throw importErr('private');
  return data;
}
/** Igrači na waiveru u ESPN ligi (status WAIVERS u kona_player_info lige), sa datumom kad izlaze sa waivera */
async function espnWaivers(lg) {
  const f = { players: { filterStatus: { value: ['WAIVERS'] }, limit: 300, sortPercOwned: { sortPriority: 1, sortAsc: false }, filterStatsForSplitTypeIds: { value: [0] }, filterStatsForExternalIds: { value: [0] } } };
  const data = await fetchJSON(`https://lm-api-reads.fantasy.espn.com/apis/v3/games/fba/seasons/${lg.import.season}/segments/0/leagues/${encodeURIComponent(lg.import.extId)}?view=kona_player_info`, { headers: { 'X-Fantasy-Filter': JSON.stringify(f) } });
  return new Map((data?.players || []).filter(x => x?.status === 'WAIVERS' && x.id).map(x => [x.id, +x.waiverProcessDate || null]));
}
/** valuesByStat (zbirovi cele sezone, ESPN id) -> naši ključevi (samo statistike koje se sabiraju) */
function espnTeamVals(vbs) {
  if (!vbs) return null;
  const v = {};
  for (const x of STAT_CATALOG) if (x.type === 'sum' && vbs[x.espn[0]] != null) v[x.id] = +vbs[x.espn[0]] || 0;
  return Object.keys(v).length ? v : null;
}
/** ESPN odgovor -> naš oblik. Ne uzima members (prava imena) ni owners / primaryOwner (GUID). */
function parseEspnLeague(data, extId, season) {
  const s = data.settings || {};
  const fmt = mapEspnFormat(s);
  let active = 0, ir = 0;
  for (const [k, v] of Object.entries(s.rosterSettings?.lineupSlotCounts || {})) { if (+k === IR_SLOT) ir += +v || 0; else active += +v || 0; } // 12 = klupa (BE), 13 = IR
  const raw = new Map(); // playerId -> igrač iz rostera (rezerva kad ga ESPN ne vrati po ID-ju); ne čuva se
  const teams = (data.teams || []).map(tm => {
    const rec = tm.record?.overall || {};
    const players = [];
    for (const e of tm.roster?.entries || []) {
      if (!e?.playerId) continue;
      // status iz same lige (svežiji od keša igrača); ACTIVE / NORMAL se ne čuva
      const inj = e.playerPoolEntry?.player?.injuryStatus;
      players.push(inj && INJURY[inj] ? { id: e.playerId, ir: e.lineupSlotId === IR_SLOT, st: inj } : { id: e.playerId, ir: e.lineupSlotId === IR_SLOT });
      if (e.playerPoolEntry?.player) raw.set(e.playerId, e.playerPoolEntry);
    }
    return {
      tid: tm.id, name: cleanName(tm.name || [tm.location, tm.nickname].filter(Boolean).join(' ')) || `Team ${tm.id}`, abbrev: cleanName(tm.abbrev).slice(0, 6),
      record: { w: +rec.wins || 0, l: +rec.losses || 0, t: +rec.ties || 0 }, seed: +tm.playoffSeed || null, pf: Math.round((+rec.pointsFor || 0) * 10) / 10,
      vals: espnTeamVals(tm.valuesByStat), players,
    };
  });
  const dl = +s.tradeSettings?.deadlineDate;
  // limit preuzimanja: po meču (matchupLimitPerScoringPeriod = po danu) i za sezonu; -1 / 0 = bez limita
  const aq = s.acquisitionSettings || {}, wk = +data.status?.currentMatchupPeriod || null;
  const acqUsed = {}, acqSeasonUsed = {};
  for (const tm of data.teams || []) { acqUsed[tm.id] = +tm.transactionCounter?.matchupAcquisitionTotals?.[wk] || 0; acqSeasonUsed[tm.id] = +tm.transactionCounter?.acquisitions || 0; }
  const acq = +aq.matchupAcquisitionLimit > 0 ? { n: +aq.matchupAcquisitionLimit, per: aq.matchupLimitPerScoringPeriod ? 'day' : 'week', used: acqUsed } : null;
  const acqSeason = +aq.acquisitionLimit > 0 ? { n: +aq.acquisitionLimit, used: acqSeasonUsed } : null;
  return {
    acq, acqSeason,
    source: 'espn', extId: String(extId), season, name: cleanName(s.name) || `ESPN ${extId}`, size: +s.size || teams.length,
    format: fmt.format, fmtError: fmt.error, slots: { active: Math.max(1, active) || ROSTER_DEFAULT.ACTIVE, ir },
    deadline: dl > 0 ? dl : null, playoffTeams: +s.scheduleSettings?.playoffTeamCount || null, teams, raw, scoringType: s.scoringSettings?.scoringType || null,
    // period obrade trejda (sati) i broj glasova za obaranje; Fantrax i ručne lige ovo nemaju
    reviewHours: Number.isFinite(+s.tradeSettings?.revisionHours) && s.tradeSettings?.revisionHours != null ? +s.tradeSettings.revisionHours : null, vetoVotes: +s.tradeSettings?.vetoVotesRequired || null,
    // nedelja plejofa = posle poslednje nedelje regularnog dela; tekuća nedelja iz statusa lige
    playoffWeek: +s.scheduleSettings?.matchupPeriodCount ? +s.scheduleSettings.matchupPeriodCount + 1 : null, week: +data.status?.currentMatchupPeriod || null,
  };
}

/* ---------- Spisak imena (prepoznavanje imena: Nalepi roster, Sleeper, Fantrax) ---------- */
let namePool = null;
/** Svi aktivni igrači iz ESPN-a (više od 1000) + igrači koje već imamo. Keš najviše jednom dnevno. */
async function loadNamePool() {
  if (namePool) return namePool;
  const c = lsGet(IMPORT.NAMES_KEY);
  let list = c?.list?.length && Date.now() - c.ts < IMPORT.NAMES_TTL_MS ? c.list : null;
  if (!list) {
    try {
      const data = await fetchJSON(IMPORT.NAMES_URL, { headers: { 'X-Fantasy-Filter': JSON.stringify({ filterActive: { value: true } }) } });
      list = (Array.isArray(data) ? data : []).filter(p => p?.id && p.fullName).map(p => [p.id, p.fullName, p.proTeamId || 0, p.defaultPositionId || 0, p.eligibleSlots || []]);
      if (list.length) lsSet(IMPORT.NAMES_KEY, { ts: Date.now(), list });
    } catch (e) { console.warn('Spisak imena nije učitan:', e.message); }
    if (!list?.length) list = c?.list || [];
  }
  const map = new Map(list.map(([id, name, tid, pos, slots]) => [id, { id, name, tid, pos, slots }]));
  for (const p of state.players) if (!map.has(p.id)) map.set(p.id, { id: p.id, name: p.name, tid: p.tid, pos: 0, slots: p.slots });
  namePool = [...map.values()];
  return namePool;
}
/** Igrač iz spiska imena u obliku ESPN igrača (rezerva za ensurePlayers) */
const poolRaw = p => ({ id: p.id, fullName: p.name, proTeamId: p.tid, defaultPositionId: p.pos, eligibleSlots: p.slots || [] });
const poolRawMap = (pool, ids) => { const by = new Map(pool.map(p => [p.id, p])); return new Map(ids.filter(id => by.has(id)).map(id => [id, poolRaw(by.get(id))])); };

/* ---------- Igrači sa uvezenih rostera koji nisu u top 600 ---------- */
const extrasGet = () => lsGet(IMPORT.EXTRAS_KEY)?.players || [];
async function fetchPlayersByIds(ids) {
  const out = [];
  for (let i = 0; i < ids.length; i += 100) {
    const f = { players: { filterIds: { value: ids.slice(i, i + 100) }, filterStatsForSplitTypeIds: CONFIG.FILTER.players.filterStatsForSplitTypeIds, filterStatsForExternalIds: CONFIG.FILTER.players.filterStatsForExternalIds } };
    const data = await fetchJSON(CONFIG.API_URL, { headers: { 'X-Fantasy-Filter': JSON.stringify(f) } });
    const list = Array.isArray(data) ? data : data?.players || [];
    out.push(...list.map(compactPlayer).filter(p => p.id && p.name));
  }
  return out;
}
const waitPlayers = async (ms = 30000) => { const t0 = Date.now(); while (!state.baseIds && !state.error && Date.now() - t0 < ms) await new Promise(r => setTimeout(r, 200)); };
/** Dovuci igrače koji nisu u glavnoj listi (sa statistikom, po ID-ju); bez odgovora: osnovni podaci iz rostera / spiska imena */
async function ensurePlayers(ids, raw = new Map()) {
  await waitPlayers();
  const need = [...new Set(ids)].filter(id => id && !state.baseIds?.has(id));
  if (!need.length) return 0;
  let got = [];
  try { got = await fetchPlayersByIds(need); } catch (e) { console.warn('Igrači van liste nisu učitani:', e.message); }
  const have = new Set(got.map(p => p.id));
  for (const id of need) {
    if (have.has(id) || !raw.get(id)) continue;
    const p = compactPlayer(raw.get(id));
    if (p.id && p.name) { got.push(p); have.add(id); }
  }
  lsSet(IMPORT.EXTRAS_KEY, { ts: Date.now(), players: [...got, ...extrasGet().filter(p => !have.has(p.id))].slice(0, IMPORT.EXTRAS_MAX) });
  if (state.baseIds) setPlayers(state.players.filter(p => state.baseIds.has(p.id)), state.loadedAt);
  loadInjuryDates();
  return got.length;
}

/* ---------- Upis uvoza u ligu ---------- */
function applyImport(lg, parsed, myTid) {
  const now = nowISO();
  const me = parsed.teams.find(x => x.tid === myTid) || null;
  const ros = tm => ({ name: tm.name, players: tm.players.map(x => ({ ...x })), updated: now });
  lg.import = {
    ...ADAPTERS[parsed.source].common, model: IMPORT_MODEL,
    source: parsed.source, extId: parsed.extId, season: parsed.season, syncedAt: now, error: null, myTid: me ? me.tid : null,
    deadline: parsed.deadline ?? null, playoffTeams: parsed.playoffTeams, playoffWeek: parsed.playoffWeek || null, week: parsed.week || null,
    reviewHours: parsed.reviewHours ?? null, vetoVotes: parsed.vetoVotes ?? null, deadlineWeek: parsed.deadlineWeek || null, adj: parsed.adj || null,
    ...(parsed.irRule !== undefined ? { irRule: parsed.irRule } : {}),
    // čuva se samo za moj tim: limit i koliko je iskorišćeno
    acqLimit: parsed.acq && me ? { n: parsed.acq.n, per: parsed.acq.per, used: parsed.acq.used[me.tid] ?? null } : null,
    acqSeason: parsed.acqSeason && me ? { n: parsed.acqSeason.n, used: parsed.acqSeason.used[me.tid] ?? null } : null,
    periods: parsed.periods?.length ? parsed.periods : null, waiverDays: parsed.waiverDays ?? null,
    teams: parsed.teams.map(({ players, ...x }) => x),
  };
  delete lg.fmtAdopted;
  lg.teamState = null; // stanje tima se računa iz plasmana u ligi
  const clampN = (v, [a, b]) => Math.max(a, Math.min(b, Math.round(+v) || a));
  lg.name = parsed.name || lg.name;
  lg.platform = parsed.source; lg.externalLeagueId = parsed.extId; lg.teams = Math.max(2, Math.min(30, parsed.size || 12));
  lg.slots = { active: clampN(parsed.slots.active, SLOT_RANGE.active), ir: clampN(parsed.slots.ir, SLOT_RANGE.ir) };
  lg.roster = me ? ros(me) : emptyRoster('Moj tim');
  lg.opps = Object.fromEntries(parsed.teams.filter(x => x !== me).map(x => [`e${x.tid}`, ros(x)]));
  if (!lg.opps[lg.oppSel]) lg.oppSel = null;
  if (me) lg.teamName = me.name;
  lg.standings = { rank: me?.seed || null, record: me ? standTxt(me, isPointsType(parsed.format?.scoringType || leagueFormatOf(lg).scoringType)) : '', playoffTeams: parsed.playoffTeams || null, playoffWeek: parsed.playoffWeek || null, updated: now };
  if (currentLeague() === lg) state.rosters = { my: lg.roster, opps: lg.opps, oppSel: lg.oppSel };
  touchLeague(lg); saveProfile();
}
/** Promena "mog tima" u uvezenoj ligi: moj roster postaje protivnik i obrnuto */
function setMyImportTeam(lg, tid) {
  const imp = lg.import;
  const tm = imp?.teams.find(x => x.tid === tid);
  if (!tm || imp.myTid === tid) return;
  if (imp.myTid != null) lg.opps[`e${imp.myTid}`] = { ...lg.roster, name: imp.teams.find(x => x.tid === imp.myTid)?.name || lg.roster.name };
  lg.roster = lg.opps[`e${tid}`] || emptyRoster(tm.name);
  delete lg.opps[`e${tid}`];
  if (lg.oppSel === `e${tid}`) lg.oppSel = null;
  imp.myTid = tid; lg.teamName = tm.name;
  lg.standings = { ...(lg.standings || {}), rank: tm.seed || null, record: standTxt(tm, isPointsType(leagueFormatOf(lg).scoringType)) };
  if (currentLeague() === lg) state.rosters = { my: lg.roster, opps: lg.opps, oppSel: lg.oppSel };
  touchLeague(lg); saveProfile();
}

/* ---------- Sinhronizacija (bez stalnog povlačenja: pri otvaranju ako je starije od 10 min, ili dugmetom) ---------- */
state.syncing = null;
state.syncTried = {};
async function fetchImport(src, q) {
  if (!ADAPTERS[src]) throw importErr('network');
  return ADAPTERS[src].fetch(q);
}
async function syncLeague(lg, { auto = false } = {}) {
  if (!isSynced(lg) || state.syncing) return;
  state.syncing = lg.id; state.syncTried[lg.id] = Date.now();
  render();
  try {
    const imp = lg.import;
    const parsed = await fetchImport(imp.source, { extId: imp.extId, leagueId: imp.extId, season: imp.season });
    const oldF = leagueFormatOf(lg);
    // format uvek dolazi iz lige kad ga platforma daje i prepoznajemo ga; inače ostaje izabran pri uvozu (procena)
    if (parsed.format && !parsed.fmtError && !sameFormat(oldF, parsed.format)) {
      const wasPicked = oldF.source !== `import:${parsed.source}`;
      lg.leagueFormat = parsed.format; applyFormatChange(lg, oldF);
      if (wasPicked && (!auto || currentLeague() === lg)) setTimeout(() => toast(t('Format lige je sada preuzet sa platforme {p}: {f}.', { p: srcName(lg), f: formatShort(parsed.format) })), 50);
    }
    const temp = imp.temp;
    const pend = (lg.history || []).filter(h => ['sent', 'accepted'].includes(histStatus(h)) && !h.confirmed);
    applyImport(lg, parsed, parsed.teams.some(x => x.tid === imp.myTid) ? imp.myTid : null);
    checkOffers(lg);
    if (DEBUG) debugSyncLog(lg, pend);
    if (temp) { lg.import.temp = temp; refreshTempSwap(lg); }
    await ensurePlayers(parsed.teams.flatMap(x => x.players.map(p => p.id)), parsed.raw);
  } catch (e) {
    // liga je postala privatna ili platforma ne odgovara: podaci ostaju, prikazuje se upozorenje
    if (lg.import) { lg.import.error = e.code || 'network'; saveProfile(); }
    if (!auto) console.warn('Osvežavanje lige nije uspelo:', e.code || e.message);
  } finally {
    state.syncing = null;
    render();
  }
}
/** Samo sa ?debug u adresi: šta je aplikacija videla pri osvežavanju (trejdovi koji čekaju, gde su igrači, da li je trejd prepoznat) */
const DEBUG = /[?&]debug\b/.test(location.search);
function debugSyncLog(lg, pend) {
  const teamOf = id => (lg.roster.players.some(x => x.id === id) ? `${lg.teamName || 'moj tim'} (moj tim)` : Object.values(lg.opps).find(o => o.players.some(x => x.id === id))?.name || 'nije ni u jednom timu');
  const nm = (h, id) => h.names?.[id] || state.byId.get(id)?.name || id;
  console.groupCollapsed(`[RosterSwing debug] ${SOURCE_LABEL[lg.import.source]} · ${lg.name} · ${new Date().toLocaleString()}`);
  console.info(`Liga ${lg.import.extId}, timova: ${lg.import.teams.length}, trejdova koji čekaju: ${pend.length}`);
  for (const h of pend) {
    console.info(`${offerTitle(h)} · status: ${histStatus(h)} · prepoznat kao obrađen: ${h.confirmed ? 'da' : 'ne'}`);
    console.table([...h.teams[GIVE].ids.map(id => ({ strana: 'Daješ', igrač: nm(h, id), tim: teamOf(id) })), ...h.teams[GET].ids.map(id => ({ strana: 'Dobijaš', igrač: nm(h, id), tim: teamOf(id) }))]);
  }
  console.groupEnd();
}
function maybeAutoSync() {
  const lg = currentLeague();
  if (state.view !== 'league' || !isSynced(lg)) return;
  if (offerTick(lg)) return;
  const age = Date.now() - (Date.parse(lg.import.syncedAt) || 0);
  if (age > IMPORT.TTL_MS && Date.now() - (state.syncTried[lg.id] || 0) > IMPORT.TTL_MS) syncLeague(lg, { auto: true });
}

/* ---------- Prikaz: oznaka sinhronizacije, rok za trejdove, upozorenja ---------- */
function syncChipHTML(lg) {
  if (!isSynced(lg)) return '';
  const busy = state.syncing === lg.id;
  const ago = lg.import.syncedAt ? t('Osveženo {ago}', { ago: timeAgo(Date.parse(lg.import.syncedAt)) }) : '';
  return `<span class="sync-chip${lg.import.error ? ' warn' : ''}">${busy ? `<span class="spinner"></span>${t('Osvežavam…')}` : `${lg.import.error ? '⚠ ' : ''}${esc(ago)}`}
    <button type="button" class="linkbtn" data-action="league-sync" ${busy ? 'disabled' : ''} title="${esc(syncBtnText(lg.import.source))}">↻ <span class="sc-l">${esc(syncBtnText(lg.import.source))}</span></button></span>`;
}
const daysTxt = n => `${n} ${plural(n, ['dan', 'dana', 'dana'], ['day', 'days'])}`;
const fmtDateTime = ms => (LANG === 'en' ? new Date(ms).toLocaleString(LOCALE(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : euDate(ms, { time: true }));
const dayDate = ms => (LANG === 'en' ? new Date(ms).toLocaleDateString(LOCALE(), { day: 'numeric', month: 'short' }) : euDate(ms));
/** Tekst roka za trejdove: tačan (ESPN, ručno uneto) ili približan (Sleeper daje samo nedelju lige) */
function deadlineText(R) {
  const ms = R.deadline - Date.now();
  const left = ms < 864e5 ? t('{n} h', { n: Math.max(1, Math.round(ms / 36e5)) }) : daysTxt(Math.round(ms / 864e5));
  if (R.deadlineApprox) return t('Rok za trejdove: nedelja {w}, oko {d} (približno, još {n}).', { w: R.deadlineWeek, d: esc(dayDate(R.deadline)), n: left });
  return t('Rok za trejdove: {d} (još {n}).', { d: esc(R.synced ? fmtDateTime(R.deadline) : dayDate(R.deadline)), n: left });
}
function deadlineBarHTML(lg) {
  const R = leagueRules(lg);
  if (!R.deadline) return ''; // platforma ne daje rok (Fantrax) ili ga korisnik nije uneo
  const ms = R.deadline - Date.now();
  if (ms < 0) return `<div class="banner info dl-bar"><span>⏱ ${R.deadlineApprox ? t('Rok za trejdove je verovatno prošao (nedelja {w}).', { w: R.deadlineWeek }) : t('Rok za trejdove je prošao.')}</span></div>`;
  if (ms > IMPORT.DEADLINE_WARN_DAYS * 864e5) return '';
  return `<div class="banner warn dl-bar"><span>⏱ ${deadlineText(R)}</span></div>`;
}
function syncErrorBarHTML(lg) {
  const err = isSynced(lg) && lg.import.error;
  if (!err) return '';
  const p = SOURCE_LABEL[lg.import.source];
  const when = lg.import.syncedAt ? timeAgo(Date.parse(lg.import.syncedAt)) : '';
  if (err === 'network') return `<div class="banner warn"><span>⚠ ${t('{p} trenutno ne odgovara. Prikazujem podatke od osvežavanja {ago}.', { p, ago: when })}</span><button type="button" data-action="league-sync">${t('Pokušaj ponovo')}</button></div>`;
  return `<div class="banner warn"><span>⚠ ${t('{p} više ne dozvoljava čitanje ove lige, verovatno je postala privatna. Prikazujem poslednje povučene podatke ({ago}).', { p, ago: when })}
    ${howtoLink(lg.import.source, t('Kako da liga ponovo bude javna'))}</span></div>`;
}
/** Trake ispod zaglavlja lige: Pregled i Analiza trejda */
/** Yahoo liga (nalepljena ili ručna): ništa se ne povlači samo, upozorenje na svim stranicama lige */
const yahooBarHTML = lg => (lg?.platform === 'yahoo' && !isSynced(lg)
  ? `<div class="banner warn yahoo-bar"><span>⚠ ${t('Yahoo liga se ne osvežava sama: rosteri, tabela i protivnici se ne povlače sa Yahoo-a. Posle svake promene u ligi ažuriraj timove ručno (Nalepi tim ponovo). Uskoro stiže verzija koja sve povlači automatski.')}</span>
      <button type="button" data-action="paste-open">${t('Nalepi tim')}</button></div>`
  : '');
const importBarsHTML = lg => yahooBarHTML(lg) + offerBarsHTML(lg) + (lg && ['overview', 'trade'].includes(state.page) ? syncErrorBarHTML(lg) + deadlineBarHTML(lg) : '');

/* ---------- Plasman po kategorijama iz zbirova cele sezone (svi timovi lige) ---------- */
const rankCats = () => CATS.filter(c => !c.fpts && !isPunt(c));
/** Plasman jednog tima po kategorijama (podrazumevano moj tim) */
function importRanks(lg = currentLeague(), tid = lg?.import?.myTid) {
  if (isPointsFmt() || tid == null || !lg?.import) return null;
  const teams = (lg.import.teams || []).filter(x => x.vals);
  if (teams.length < 2 || !teams.some(x => x.tid === tid)) return null;
  const cats = rankCats();
  const mine = rotoRanks(teams.map(x => ({ id: x.tid, vals: x.vals })), cats)[tid] || {};
  const list = cats.filter(c => mine[c.key] != null).map(c => ({ c, rank: mine[c.key], of: teams.length }));
  return list.length ? list : null;
}
function importRanksHTML(lg = currentLeague(), tid = lg?.import?.myTid, teamName = '') {
  const ranks = importRanks(lg, tid);
  if (!ranks) return '';
  const sw = strongWeak(ranks);
  const tag = c => (sw.strong.some(x => x.c === c) ? `<span class="slot-tag tag-in">${t('jak')}</span>` : sw.weak.some(x => x.c === c) ? `<span class="slot-tag tag-out">${t('slab')}</span>` : '');
  const h2h = FMT_ACTIVE.scoringType !== 'roto';
  const src = SOURCE_LABEL[lg.import.source] || '';
  return `<section class="pcard season-ranks${teamName ? ' lt-ranks' : ''}"><h3>${t('Stvarni plasman u sezoni')} <span class="cchip season">${t('od početka sezone')}</span><span class="i" data-tip="${esc(t('Gde tim stvarno stoji u kategorijama od početka sezone, po ukupnim brojkama iz {p}. Računaju se i igrači koji više nisu u timu i broj odigranih utakmica (više utakmica = veći zbirovi, i više izgubljenih lopti). Trejd ovo ne menja.', { p: src }))}">ⓘ</span>${teamName ? ` <span class="hint">${esc(teamName)}</span>` : ''}</h3>
    <div class="catgrid">${ranks.map(x => `<div class="catcell"><span class="cl">${x.c.label}</span><b>${t('{n}. od {m}', { n: x.rank, m: x.of })}</b>${tag(x.c)}</div>`).join('')}</div>
    <p class="pnote">${t('Ukupno od početka sezone iz {p}, svi timovi lige, sa svim igračima koji su igrali za tim. FG% i FT% iz pogodaka i pokušaja.', { p: src })}${h2h ? ` ${t('U H2H ligi ovo je samo informativno: nedeljni mečevi se računaju posebno.')}` : ''}</p></section>`;
}
/** Tabela lige iz uvoza */
function standingsHTML(lg) {
  const list = [...(lg?.import?.teams || [])].sort((a, b) => (a.seed || 99) - (b.seed || 99));
  if (!list.length) return '';
  const pts = isPointsFmt();
  return `<div class="tscroll"><table class="stand"><thead><tr><th>#</th><th>${t('Tim')}</th><th>${t('Skor')}</th>${pts ? `<th>${t('Poeni')}</th>` : ''}</tr></thead><tbody>
    ${list.map(x => `<tr class="${x.tid === lg.import.myTid ? 'me' : ''}"><td>${x.seed || '–'}</td><td>${esc(x.name)}${x.abbrev ? ` <span class="hint">${esc(x.abbrev)}</span>` : ''}</td><td>${standTxt(x, pts)}</td>${pts ? `<td>${fmtNum(x.pf)}</td>` : ''}</tr>`).join('')}
    </tbody></table></div>`;
}

/* ---------- Analiza: procena plasmana posle trejda (roto; u H2H samo informativno) ---------- */
const gamesLeft = tid => { const g = state.schedule?.[tid]; const done = gamesDone(tid); return g && done != null ? Math.max(0, g.length - done) : null; };
/** Koliko puta je cela NBA sezona veća od odigranog dela (ukupno utakmica / odigrano, prosek svih NBA timova), ili null */
function seasonFactor() {
  let done = 0, total = 0;
  for (const tid of Object.keys(state.schedule || {})) {
    const d = gamesDone(tid);
    if (d == null) continue;
    done += d; total += state.schedule[tid].length;
  }
  return done > 0 && total >= done ? total / done : null;
}
/** Koliko preostalih utakmica igrač realno igra: utakmice igrača / utakmice njegovog NBA tima, OUT = 0.
    Status iz platforme lige (Sleeper status sa rostera), inače ESPN. */
function playerAvail(p, lg = currentLeague()) {
  const out = playerStatus(p, lg).g === 'OUT';
  const d = durability(p);
  return availFactor(d?.gp ?? 0, d?.n ?? 0, out);
}
/** Van do kraja sezone: samo kad izvor to eksplicitno kaže (ESPN injuryDetails.outForSeason). Sleeper i Fantrax nemaju takav podatak,
    a tekst vesti se ne koristi za ovo. */
const seasonOut = p => !!(p && Array.isArray(state.injRet?.[p.id]) && state.injRet[p.id][3]);
/** Dostupnost za procenu plasmana: koliko utakmica igrač inače odigra (trajnost), bez trenutnog statusa (OUT, DTD se ne gledaju) */
const projAvail = p => { const d = durability(p); return availFactor(d?.gp ?? 0, d?.n ?? 0, false); };
/** Procena plasmana posle trejda: [{ key, c, before, after }] (+ gone: imena igrača van do kraja sezone) ili null (nema uvoza, rasporeda ili trejda).
    Isti igrači kao u tabeli kategorija: Daješ + koga izbacujem, Dobijaš + slobodno mesto po izboru (realna zamena, izabran igrač ili ništa). */
function rankProjection(lg = currentLeague()) {
  if (!lg?.import?.teams?.length || isPointsFmt() || lg.import.myTid == null || !state.schedule) return null;
  const teams = lg.import.teams.filter(x => x.vals);
  if (teams.length < 2 || !teams.some(x => x.tid === lg.import.myTid) || (!giveIds().length && !getIds().length)) return null;
  const delta = {}, gone = [];
  const addLine = (line, g, a, sign) => { for (const k of SUM_KEYS) if (line[k] != null) delta[k] = (delta[k] || 0) + sign * line[k] * g * a; };
  const add = (id, sign, share = 1) => {
    const p = state.byId.get(id);
    if (!p) return;
    if (seasonOut(p)) { if (!gone.includes(p.name)) gone.push(p.name); return; }
    const line = playerLine(p), g = gamesLeft(p.tid);
    if (!line || !g) return;
    addLine(line, g, projAvail(p) * share, sign);
  };
  const sp = slotPlan('my'), ff = freeFill('my');
  [...giveIds(), ...sp.nowDrops].forEach(id => add(id, -1));
  sp.laterDrops.forEach(id => add(id, -1, 1 - sp.w)); // kasnije otpušten igra dok je povređeni na IR-u
  [...getIds(), ...ff.permIds].forEach(id => add(id, 1));
  ff.tempIds.forEach(id => add(id, 1, ff.w));
  // realna zamena (nivo zamene): nema svoj NBA tim, pa srednji broj preostalih utakmica
  const rl = replLineNow(), gl = Object.keys(state.schedule).map(gamesLeft).filter(x => x != null).sort((a, b) => a - b), gMed = gl.length ? gl[gl.length >> 1] : 0;
  if (rl && gMed) { for (let k = 0; k < ff.permRepl; k++) addLine(rl, gMed, 1, 1); for (let k = 0; k < ff.tempRepl; k++) addLine(rl, gMed, ff.w, 1); }
  // zbirovi timova su do danas, a razlika iz trejda je za ostatak sezone: svi timovi se prvo projektuju na celu sezonu
  const f = seasonFactor();
  if (!f) return null;
  const full = vals => Object.fromEntries(Object.entries(vals).map(([k, v]) => [k, v != null && SUM_KEYS.includes(k) ? v * f : v]));
  const cats = rankCats();
  const res = rotoProjection(teams.map(x => ({ id: x.tid, vals: full(x.vals) })), lg.import.myTid, delta, cats)
    .filter(x => x.before != null).map(x => ({ ...x, c: cats.find(y => y.key === x.key) }));
  res.gone = gone;
  return res;
}
/** Red iznad procene: igrači van do kraja sezone se ne računaju */
const goneTxt = gone => (!gone?.length ? '' : gone.length === 1 ? t('{n} je van do kraja sezone i ne računa se.', { n: gone[0] }) : t('{n} su van do kraja sezone i ne računaju se.', { n: joinList(gone) }));

/* ---------- Vrednost igrača: po ligi i periodu (čita samo zajednički model lige), keš dok se liga ili baza igrača ne osveže ----------
   Budući alati (Pronađi trejd, Mete, Pojačanja sa FA) traže vrednost za bilo koji period: leagueValues(lg, period). */
const valueCache = new Map();
/** Bazen: broj timova × aktivna roster mesta (bez IR); bez lige 12 × 13 */
const valuePool = lg => {
  const teams = (lg && lg.teams) || VALUE.DEFAULT_TEAMS, active = (lg && lg.slots?.active) || VALUE.DEFAULT_ACTIVE;
  return { teams, active, n: teams * active };
};
const valueCats = f => f.categories.map(id => { const c = catFromStat(id); return { key: id, label: c.label, pct: c.type === 'pct', made: c.made, att: c.att, low: c.lowerIsBetter, noProj: c.noProj }; });
/** Red statistike igrača za period; u projekciji statistike koje projekcija nema (npr. DD) uzimaju se iz proseka sezone */
function valueLine(p, per, cats) {
  const line = statOf(p, per);
  if (!line || per !== 'proj' || !cats?.some(c => c.noProj)) return line;
  const season = statOf(p, 'season'), out = { ...line };
  for (const c of cats) if (c.noProj) for (const k of c.pct ? [c.made, c.att] : [c.key]) out[k] = season?.[k] ?? 0;
  return out;
}
/** Vrednosti svih igrača iz baze: { pts, per, pool, cats, values: Map(id -> { total, by?, fpts?, rank, gp, small }), ms } */
function leagueValues(lg = currentLeague(), per = state.period) {
  const f = leagueFormatOf(lg), pool = valuePool(lg), pts = isPointsType(f.scoringType);
  const key = [lg?.id || 'quick', per, encodeFormat(f), pool.teams, pool.active, state.loadedAt, state.players.length, lg?.import?.syncedAt || ''].join('|');
  const hit = valueCache.get(key);
  if (hit) return hit;
  const t0 = performance.now();
  let values, cats = [], repl = null;
  if (pts) {
    // bodovanje aktivne lige ide kroz fptsOf (bonusi i dodaci kao u koloni FPts); druga liga: samo težine
    const w = sameFormat(f, FMT_ACTIVE) ? FMT_ACTIVE.weights : f.weights;
    const r = pointsValues(state.players.map(p => { const l = statOf(p, per); return { id: p.id, fpts: l ? fptsOf(l, w) : null }; }), pool.n, pool.teams);
    values = r.values; repl = r.repl;
  } else {
    cats = valueCats(f);
    values = categoryValues(state.players.map(p => ({ id: p.id, line: valueLine(p, per, cats) })), cats, pool.n).values;
  }
  const ranks = valueRanks(values);
  for (const [id, v] of values) { const gp = statOf(state.byId.get(id), per)?.GP || 0; Object.assign(v, { rank: ranks.get(id), gp, small: per !== 'proj' && gp < VALUE.SMALL_SAMPLE_GP }); }
  const res = { pts, per, pool, cats, repl, values, ms: performance.now() - t0 };
  if (valueCache.size > 30) valueCache.clear();
  valueCache.set(key, res);
  return res;
}
/** Vrednost jednog igrača ili null (nema podataka za period) */
const playerValue = (p, lg = currentLeague(), per = state.period) => (p ? leagueValues(lg, per).values.get(p.id) || null : null);
/** Vrednost za ostatak sezone: po utakmici × preostale utakmice × koeficijent dostupnosti */
function playerRestValue(p, lg = currentLeague(), per = state.period) {
  const v = playerValue(p, lg, per);
  return v ? restOfSeasonValue(v.total, gamesLeft(p.tid), playerAvail(p, lg)) : null;
}
/** Vrednost za moj tim (računa se, ne prikazuje se još): težine po potrebi mog tima, punt = 0. Poeni: isto kao opšta. */
function myTeamValue(p, lg = currentLeague(), per = state.period) {
  const v = playerValue(p, lg, per);
  if (!v || !v.by) return v ? v.total : null;
  const cur = lg && lg === currentLeague();
  const ranks = cur ? Object.fromEntries((catRanks('my') || []).map(x => [x.c.key, { rank: x.rank, of: x.of }])) : null;
  return weightedValue(v.by, needWeights(leagueValues(lg, per).cats, ranks, cur ? state.punt : new Set(lg?.punt || [])));
}
/** +8.4 / −1.1 (pravi minus) */
const fmtVal = v => (v == null ? '-' : `${v < -0.05 ? '−' : '+'}${Math.abs(v).toFixed(1)}`);

/* ---------- Kontekst cele lige za izveštaj i tekst za AI (samo uvezene lige) ---------- */
/** { me, opp, teams (po tabeli), ranks { tid: { kat: mesto } }, cats, leaders, pts, pfRank, val } ili null */
function leagueCtx(lg = currentLeague()) {
  if (!isSynced(lg) || !lg.import.teams?.length) return null;
  const imp = lg.import, all = imp.teams;
  const me = all.find(x => x.tid === imp.myTid) || null;
  const oppKey = state.rosters?.oppSel;
  const opp = oppKey ? all.find(x => `e${x.tid}` === oppKey) || null : null;
  const pts = isPointsFmt();
  const cats = pts ? [] : rankCats();
  const withVals = all.filter(x => x.vals);
  const ranks = cats.length && withVals.length >= 2 ? rotoRanks(withVals.map(x => ({ id: x.tid, vals: x.vals })), cats) : null;
  const val = (tm, c) => (c.made && c.att && tm.vals?.[c.att] > 0 ? tm.vals[c.made] / tm.vals[c.att] : tm.vals?.[c.key] ?? null);
  const leaders = ranks ? cats.map(c => { const best = withVals.filter(x => ranks[x.tid]?.[c.key] === 1); return best.length ? { c, teams: best, v: val(best[0], c) } : null; }).filter(Boolean) : [];
  const byPf = [...all].sort((a, b) => b.pf - a.pf);
  const pfRank = tm => (tm ? byPf.indexOf(tm) + 1 : null);
  return { lg, imp, me, opp, teams: [...all].sort((a, b) => (a.seed || 99) - (b.seed || 99)), ranks, cats, leaders, pts, pfRank, byPf, val };
}
/** Jake i slabe kategorije tima po plasmanu u ligi: { strong: [{c, r}], weak: [...] } */
function teamRankSplit(ctx, tm, n = 3) {
  const r = ctx.ranks?.[tm?.tid];
  if (!r) return null;
  const list = ctx.cats.filter(c => r[c.key] != null).map(c => ({ c, r: r[c.key] })).sort((a, b) => a.r - b.r);
  return { strong: list.slice(0, n), weak: list.slice(-n).reverse(), all: list };
}
const rankListTxt = l => l.map(x => `${x.c.label} ${x.r}.`).join(', ');
/** Vrednost kategorije iz zbira cele sezone za prikaz (procenat .471, A/TO 1.85, zbir 7608) */
const totalTxt = (c, v) => (v == null ? '-' : c.type === 'pct' ? (c.ratio ? v.toFixed(2) : fmtPct(v)) : String(Math.round(v)));

/** Redovi za vrh izveštaja (HTML) */
function leagueReportLines() {
  const ctx = leagueCtx();
  if (!ctx?.me) return [];
  const out = [];
  const pos = tm => t('na {n}. mestu ({r})', { n: tm.seed || '?', r: standTxt(tm, isPointsFmt()) });
  out.push(`🏆 ${t('Liga: ti si {a}', { a: pos(ctx.me) })}${ctx.opp ? `, ${t('{name} je {a}', { name: `<b>${esc(ctx.opp.name)}</b>`, a: pos(ctx.opp) })}` : ''}.`);
  if (ctx.pts) {
    const m = ctx.lg.teams;
    out.push(t('Poeni za celu sezonu: ti si {a}. od {m}{o}', { a: ctx.pfRank(ctx.me), m, o: ctx.opp ? t(', {name} je {b}.', { name: esc(ctx.opp.name), b: ctx.pfRank(ctx.opp) }) : '.' }));
  } else {
    const mine = teamRankSplit(ctx, ctx.me);
    if (mine) out.push(t('Tvoj plasman po kategorijama: najjači {s}, najslabiji {w}', { s: rankListTxt(mine.strong), w: rankListTxt(mine.weak) }));
    const his = ctx.opp && teamRankSplit(ctx, ctx.opp);
    if (his) out.push(t('{name} po kategorijama: najjači {s}, najslabiji {w}', { name: `<b>${esc(ctx.opp.name)}</b>`, s: rankListTxt(his.strong), w: rankListTxt(his.weak) }));
    const proj = rankProjection();
    if (proj) {
      const ch = proj.filter(x => x.after !== x.before);
      out.push((ch.length ? t('Procena plasmana posle trejda: {list}', { list: ch.map(x => `${x.c.label} ${x.before}. → ${x.after}.`).join(', ') }) : t('Procena plasmana posle trejda: plasman po kategorijama se ne menja.')) + (proj.gone?.length ? ` ${esc(goneTxt(proj.gone))}` : ''));
    }
  }
  return out;
}

/** Odeljak za AI: tabela cele lige, plasman oba tima, lideri lige, procena posle trejda */
function leagueAIText() {
  const ctx = leagueCtx();
  if (!ctx) return '';
  const { lg, imp, me, opp } = ctx;
  const lines = [];
  const tag = tm => (tm === me ? L(' (ja)', ' (me)') : tm === opp ? L(' (protivnik)', ' (opponent)') : '');
  lines.push(`${L('Tabela', 'Standings')} (${L('mesto, tim, skor', 'place, team, record')}${ctx.pts ? L(', poeni za celu sezonu', ', season points for') : ''}):`);
  lines.push(...ctx.teams.map(x => `${x.seed || '-'}. ${x.name}${tag(x)} ${standTxt(x, ctx.pts)}${ctx.pts ? ` · ${fmtNum(x.pf)}` : ''}`));
  const info = [];
  if (imp.playoffTeams) info.push(L(`U plejof ide ${imp.playoffTeams} timova`, `${imp.playoffTeams} teams make the playoffs`));
  if (imp.playoffWeek) info.push(L(`plejof počinje u ${imp.playoffWeek}. nedelji`, `playoffs start in week ${imp.playoffWeek}`));
  if (imp.week) info.push(L(`sada je ${imp.week}. nedelja`, `it is now week ${imp.week}`));
  if (imp.deadline) info.push(imp.deadline < Date.now() ? L('rok za trejdove je prošao', 'the trade deadline has passed') : L(`rok za trejdove: ${aiDate(new Date(imp.deadline).toISOString())}`, `trade deadline: ${aiDate(new Date(imp.deadline).toISOString())}`));
  if (info.length) lines.push(`${info.join(', ')}.`);
  if (ctx.pts) {
    lines.push(L(`Poeni za celu sezonu, mesto: ja ${ctx.pfRank(me) || '-'}. od ${lg.teams}${opp ? `, protivnik ${ctx.pfRank(opp)}.` : ''}`, `Season points for, rank: me ${ctx.pfRank(me) || '-'} of ${lg.teams}${opp ? `, opponent ${ctx.pfRank(opp)}` : ''}`));
    lines.push(`${L('Najviše poena', 'Most points')}: ${ctx.byPf.slice(0, 3).map(x => `${x.name}${tag(x)} ${fmtNum(x.pf)}`).join(', ')}`);
  } else if (ctx.ranks) {
    const rk = tm => ctx.cats.filter(c => ctx.ranks[tm.tid]?.[c.key] != null).map(c => `${c.label} ${ctx.ranks[tm.tid][c.key]}`).join(', ');
    lines.push(`\n${L(`Plasman po kategorijama (zbir cele sezone iz ${SOURCE_LABEL[imp.source]}, 1 = najbolji od ${lg.teams})`, `Rank by category (season totals from ${SOURCE_LABEL[imp.source]}, 1 = best of ${lg.teams})`)}:`);
    if (me) lines.push(`${L('Ja', 'Me')} (${me.name}): ${rk(me)}`);
    if (opp) lines.push(`${L('Protivnik', 'Opponent')} (${opp.name}): ${rk(opp)}`);
    lines.push(`\n${L('Lideri lige po kategorijama (zbir cele sezone)', 'League leaders by category (season totals)')}:`);
    lines.push(...ctx.leaders.map(x => `${x.c.label}: ${x.teams.map(tm => `${tm.name}${tag(tm)}`).join(', ')} (${totalTxt(x.c, x.v)})${me && x.teams.includes(me) ? '' : me ? L(`; ja ${totalTxt(x.c, ctx.val(me, x.c))}`, `; me ${totalTxt(x.c, ctx.val(me, x.c))}`) : ''}`));
    const proj = rankProjection();
    if (proj) lines.push(`\n${L('Procena mog plasmana posle trejda (preostale utakmice, ostali timovi isti; trenutni status igrača se ne gleda, samo koliko inače igra)', 'Estimated rank after the trade (remaining games, other teams unchanged; current player status is not used, only how often he usually plays)')}: ${proj.map(x => `${x.c.label} ${x.before}→${x.after}`).join(', ')}${proj.gone?.length ? `. ${goneTxt(proj.gone)}` : ''}`);
  }
  return lines.join('\n');
}

/* ---------- Podešavanja uvezene lige: sve iz lige, menja se samo moj tim i napomena ---------- */
function openSyncedSettings(lg) {
  const imp = lg.import, f = leagueFormatOf(lg), st = lg.standings || {}, src = SOURCE_LABEL[imp.source];
  const fromLeague = f.source === `import:${imp.source}`; // false: platforma ne daje format koji prepoznajemo, izabran je pri uvozu (procena)
  const sit = teamSituation(lg);
  const season = seasonLabel(imp.source, imp.season);
  const row = (k, v) => (v == null || v === '' ? '' : `<div class="ro-row"><span>${k}</span><b>${v}</b></div>`);
  showModal({
    title: t('Podešavanja lige'), wide: true,
    body: `<div class="form">
      <div class="banner info ro-note"><span>🔗 ${fromLeague ? t('Liga je povezana sa platformom {p}. Naziv, timovi, format, roster mesta i tabela dolaze iz lige i menjaju se samo tamo.', { p: src }) : t('Liga je povezana sa platformom {p}. Naziv, timovi, roster mesta i tabela dolaze iz lige. Platforma ne daje format koji prepoznajemo, pa ga biraš ovde (procena).', { p: src })}</span></div>
      <div class="ro-head">${t('Iz lige')} <span class="hint">${t('samo za čitanje')}</span></div>
      <div class="ro-grid">
        ${row(t('Naziv lige'), esc(lgName(lg)))}
        ${row(t('Platforma'), esc(src))}
        ${row(t('Broj timova'), lg.teams)}
        ${fromLeague ? row(t('Format'), `<span title="${esc(formatSummary(f))}">${esc(formatShort(f))}</span>`) : ''}
        ${row(t('Roster'), t('{a} aktivnih + {b} IR', { a: lg.slots?.active, b: lg.slots?.ir ?? 0 }) + (imp.irSlotsKnown === false ? ` <span class="hint">${t('(IR: procena, platforma ne daje broj mesta)')}</span>` : ''))}
        ${row(t('Mesto'), st.rank ? t('{n}. od {m}', { n: st.rank, m: lg.teams }) : '')}
        ${row(t('Skor'), esc(st.record || ''))}
        ${row(t('Timova u plejofu'), st.playoffTeams)}
        ${row(t('Nedelja plejofa'), st.playoffWeek)}
        ${row(t('Stanje mog tima'), sit ? `${esc(stateLabel(sit.state))} <span class="hint">${t('(iz plasmana)')}</span>` : '')}
        ${rulesRowsHTML(lg, row)}
        ${row(t('Liga na platformi'), `${esc(imp.extId)} · ${t('sezona {s}', { s: esc(season) })}`)}
        ${row(t('Poslednje osvežavanje'), imp.syncedAt ? esc(timeAgo(Date.parse(imp.syncedAt))) : '')}
      </div>
      ${fromLeague ? '' : `<div class="ro-head">${t('Format')} <span class="hint">${t('procena')}</span></div>${formatPickerHTML('ls', f, lg.platform)}`}
      ${approxScoringHTML(lg)}
      <div class="ro-head">${t('Tvoji izbori')}</div>
      <label>${t('Moj tim')}<select id="ls-myteam">${imp.myTid == null ? '<option value="">–</option>' : ''}${[...imp.teams].sort((a, b) => a.name.localeCompare(b.name)).map(x => `<option value="${esc(String(x.tid))}" ${x.tid === imp.myTid ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>
      <label>${t('Napomena')}<textarea id="ls-note" rows="3" maxlength="500">${esc(lg.note || '')}</textarea></label>
      <div class="ls-sync"><button type="button" class="linkbtn" data-action="league-sync">↻ ${esc(syncBtnText(imp.source))}</button>
        <button type="button" class="linkbtn" data-action="league-unlink">⛓ ${t('Prekini vezu sa platformom {p}', { p: esc(src) })}</button></div>
      ${colsResetHTML(lg)}
      <div class="ls-export"><button type="button" class="linkbtn" data-action="export-league">⤓ ${t('Izvezi samo ovu ligu')}</button> <span class="hint export-msg"></span></div>
      <div class="ls-actions"><button type="button" class="linkbtn" data-action="league-dup">${t('Dupliraj ligu')}</button>
        <button type="button" class="linkbtn danger" data-action="league-del">${t('Obriši ligu')}</button></div>
    </div>`,
    confirm: t('Sačuvaj'),
    onConfirm: () => {
      if (!fromLeague) {
        const fp = readFormatPicker('ls');
        if (fp.error) return false;
        const oldF = leagueFormatOf(lg);
        lg.leagueFormat = fp.f;
        applyFormatChange(lg, oldF);
      }
      lg.note = document.getElementById('ls-note').value.trim();
      const tidV = document.getElementById('ls-myteam').value;
      const tm = tidV ? imp.teams.find(x => String(x.tid) === tidV) : null;
      if (tm) setMyImportTeam(lg, tm.tid);
      touchLeague(lg); saveProfile(); render();
    },
  });
}
/** Pravila iz lige (IR, obrada trejda, rok): tačno ono što platforma daje, ili "platforma ne daje" */
function rulesRowsHTML(lg, row) {
  const R = leagueRules(lg), no = `<span class="hint">${t('platforma ne daje')}</span>`;
  const ir = R.irRule ? `${esc(irRuleText(R))}${R.irNote ? ` <span class="hint">${t('(opšte pravilo platforme)')}</span>` : ''}` : no;
  const rev = R.reviewHours == null ? no : R.reviewHours === 0 ? t('odmah') : R.reviewHours % 24 === 0 ? daysTxt(R.reviewHours / 24) : t('{n} h', { n: R.reviewHours });
  const dl = !R.deadline ? no : R.deadlineApprox ? t('nedelja {w}, oko {d} (približno)', { w: R.deadlineWeek, d: esc(dayDate(R.deadline)) }) : esc(fmtDateTime(R.deadline));
  return row(t('Na IR mestu sme'), ir) + row(t('Period obrade trejda'), rev) + row(t('Rok za trejdove'), dl);
}
/** Fantrax: stavke bodovanja čiji nazivi ili pravila nisu provereni na pravoj ligi računaju se približno */
function approxScoringHTML(lg) {
  if (!isSynced(lg) || !lg.import.fmtUnverified) return '';
  const f = leagueFormatOf(lg), w = f.weights || {};
  const items = ['TF', 'FF', 'EJ', 'DQ'].filter(k => w[k]);
  if (f.bonus?.length) items.push(t('bonusi za prag'));
  if (w.TD || w.QD) items.push(t('3D i 4D (da li daju i niže bonuse)'));
  return items.length ? `<p class="hint approx-note">≈ ${t('Približno: {l}. Ove stavke bodovanja sa platforme {p} nismo mogli da proverimo na pravoj ligi.', { l: esc(items.join(', ')), p: esc(srcName(lg)) })}</p>` : '';
}
/** Podešavanja lige: vraćanje podrazumevanog redosleda kolona (vidi se samo kad je redosled promenjen) */
const colsResetHTML = lg => (customCols(lg) ? `<div class="ls-cols"><button type="button" class="linkbtn" data-action="cols-reset">↺ ${t('Vrati podrazumevani redosled kolona')}</button>
  <span class="hint">${COL_ORDER[lg.platform] ? t('kao na platformi {p}', { p: esc(platformLabel(lg.platform)) }) : t('kao u formatu lige')}</span></div>` : '');
/** Prekid veze sa platformom: liga ostaje sa poslednjim podacima kao obična (ručna) liga */
function unlinkLeague() {
  const lg = currentLeague();
  if (!isSynced(lg)) return;
  const p = SOURCE_LABEL[lg.import.source];
  showModal({
    title: t('Prekinuti vezu sa platformom {p}?', { p: esc(p) }),
    body: `<p>${t('Liga ostaje sa poslednjim povučenim podacima i postaje obična liga: rosteri, tabela i podešavanja se dalje menjaju ručno, a osvežavanje prestaje. Vezu možeš ponovo da uspostaviš dugmetom Uvezi ligu.')}</p>`,
    confirm: t('Prekini vezu'),
    onConfirm: () => {
      const f = leagueFormatOf(lg);
      lg.leagueFormat = { ...f, source: 'manual' };
      delete lg.import;
      touchLeague(lg); saveProfile(); render();
    },
  });
}

/* ---------- Dodaj ligu: izbor načina ---------- */
/** Uvoz u postojeću ligu (id) umesto pravljenja nove; null = nova liga */
let importInto = null;
const importTargetLeague = () => (importInto ? profile?.leagues.find(l => l.id === importInto) || null : null);
function openAddLeague(intoId = null) {
  importInto = typeof intoId === 'string' ? intoId : null;
  const into = importTargetLeague();
  const card = ({ id, icon, title, desc, how, soon = false, beta = false }) => `<div class="imp-card${soon ? ' soon' : ''}">
      ${soon ? '<div class="imp-main" aria-disabled="true">' : `<button type="button" class="imp-main" data-action="imp-go" data-imp="${id}">`}
        <span class="imp-ic" aria-hidden="true">${icon}</span><span class="imp-tx"><b>${title}${soon ? ` <span class="soon-tag">${t('Uskoro')}</span>` : ''}${beta ? ` <span class="soon-tag beta-tag" title="${esc(t('Novo: javi nam ako nešto nije uvezeno kako treba.'))}">Beta</span>` : ''}</b><span>${desc}</span></span>
      ${soon ? '</div>' : '</button>'}${how ? `<span class="imp-how">${howtoLink(how)}</span>` : ''}</div>`;
  const cards = [
    card({ id: 'espn', icon: 'ESPN', title: t('ESPN javna liga'), desc: t('Uvozimo timove, rostere, bodovanje i tabelu preko ID-ja lige.'), how: 'espn' }),
    card({ id: 'sleeper', icon: 'SLP', title: t('Sleeper liga'), desc: t('Unesi korisničko ime ili ID lige.'), how: 'sleeper' }),
    card({ id: 'fantrax', icon: 'FTX', title: t('Fantrax javna liga'), desc: t('Unesi ID lige ili link ka ligi.'), how: 'fantrax' }),
    card({ id: 'paste', icon: '📋', title: t('Yahoo, CBS ili druga platforma: Nalepi roster'), desc: t('Kopiraj stranicu tima i nalepi tekst. Igrače prepoznajemo sami.'), how: 'paste' }),
    !into && card({ id: 'manual', icon: '✎', title: t('Ručni unos'), desc: t('Napravi ligu i sam unesi igrače.'), how: 'paste' }),
    card({ id: 'espn-private', icon: '🔒', title: t('ESPN privatna liga'), desc: `${t('Za sada uvozimo samo javne lige.')} ${howtoLink('espn', t('Pogledaj kako da ligu označiš kao javnu.'))}`, soon: true }),
    card({ id: 'yahoo', icon: 'Y!', title: t('Yahoo automatski uvoz'), desc: t('Do tada koristi Nalepi roster.'), how: 'yahoo', soon: true }),
  ].filter(Boolean).join('');
  const intro = into ? `<p class="hint">${t('Uvoz ide u ligu „{n}”: rosteri i timovi se zamenjuju podacima sa platforme, a istorija i otvoreni trejdovi ostaju.', { n: esc(lgName(into)) })}</p>` : '';
  showModal({ title: into ? t('Uvezi u ovu ligu') : t('Dodaj ligu'), wide: true, body: `${intro}<div class="imp-grid">${cards}</div>`, cancel: t('Otkaži') });
}
function openImportMethod(k) {
  closeModal();
  if (k === 'manual') openManualLeague();
  else if (k === 'paste') openPaste({ leagueId: importTargetLeague()?.id || null });
  else if (IMPORTERS[k]) openImport(k);
}

/* ---------- Uvoz preko ID-ja (ESPN; Sleeper i Fantrax iza zastavice) ---------- */
const IMPORTERS = {
  espn: {
    title: () => t('Uvezi ESPN ligu'), label: () => t('ID lige ili link ka ligi'), ph: () => t('npr. 123456 ili link sa leagueId='),
    idLink: () => howtoLink('espn-id', t('Gde da nađem ID?')),
    parse: s => { const id = parseEspnLeagueId(s); return id ? { extId: id, season: seasonFromInput(s) } : null; },
    bad: () => t('Ne vidim ID lige. Unesi broj (npr. 123456) ili link ka ligi u kome piše leagueId=.'),
    privateText: () => t('Ova liga je privatna. LM mora da je označi kao javnu.'), downText: () => t('ESPN trenutno ne odgovara, probaj ponovo.'),
  },
  sleeper: {
    title: () => t('Uvezi Sleeper ligu'), label: () => t('Sleeper korisničko ime, ID lige ili link'), ph: () => t('npr. korisnicko_ime ili 1180226123456789012'),
    idLink: () => howtoLink('sleeper', t('Gde da nađem ID?')),
    parse: s => parseSleeperInput(s),
    bad: () => t('Unesi Sleeper korisničko ime (bez razmaka) ili ID lige.'),
  },
  fantrax: {
    title: () => t('Uvezi Fantrax ligu'), label: () => t('ID lige ili link ka ligi'), ph: () => t('npr. link sa /league/ u adresi'),
    idLink: () => howtoLink('fantrax', t('Gde da nađem ID?')),
    parse: s => { const id = parseFantraxLeagueId(s); return id ? { extId: id } : null; },
    bad: () => t('Ne vidim ID lige. Nalepi link ka ligi (deo posle /league/).'),
  },
};
function openImport(src, preset = '') {
  const im = IMPORTERS[src];
  showModal({
    title: im.title(), wide: true,
    body: `<div class="form"><label>${im.label()}<input type="text" id="imp-in" autocomplete="off" spellcheck="false" value="${esc(preset)}" placeholder="${esc(im.ph())}"></label>
      <div class="imp-help">${im.idLink()}</div>
      <p class="hint">${t('Samo javne lige. Ne tražimo lozinku, prijavu ni kolačiće.')}</p>
      <div class="imp-msg" id="imp-msg" role="status" aria-live="polite"></div></div>`,
    confirm: t('Uvezi'),
    onConfirm: m => { runImport(src, m); return false; },
  });
  setTimeout(() => document.getElementById('imp-in')?.focus(), 30);
}
function importErrorHTML(code, src, extra) {
  const p = SOURCE_LABEL[src];
  const im = IMPORTERS[src] || {};
  if (code === 'private') return `${im.privateText?.() || t('Ova liga nije javna. Komesar mora da uključi javni pregled lige.')} ${howtoLink(src, t('Pogledaj kako'))}`;
  if (code === 'notfound') return `${t('Liga nije pronađena. Proveri ID.')} ${IMPORTERS[src].idLink()}`;
  if (code === 'nouser') return t('Korisnik nije pronađen na Sleeperu. Proveri korisničko ime.');
  if (code === 'noleagues') return t('Ovaj korisnik nema NBA ligu na Sleeperu za ovu sezonu.');
  if (code === 'choose') return `${t('Ovaj korisnik ima više liga. Izaberi jednu:')}<div class="imp-pick">${(extra || []).map(l => `<button type="button" class="linkbtn" data-action="imp-pick-league" data-src="${src}" data-id="${esc(l.id)}">${esc(l.name)}</button>`).join('')}</div>`;
  return im.downText?.() || t('{p} trenutno ne odgovara, probaj ponovo.', { p });
}
async function runImport(src, m) {
  const im = IMPORTERS[src];
  const inp = document.getElementById('imp-in'), msg = document.getElementById('imp-msg'), ok = m.querySelector('[data-modal-ok]');
  const q = im.parse(inp.value);
  if (!q) { msg.innerHTML = `<span class="err">${im.bad()}</span>`; inp.focus(); return; }
  ok.disabled = true;
  msg.innerHTML = `<span class="spinner"></span> ${t('Povlačim ligu ({p})…', { p: SOURCE_LABEL[src] })}`;
  try {
    const parsed = await fetchImport(src, q);
    if (!document.body.contains(m)) return; // prozor je zatvoren u međuvremenu
    const dup = profile?.leagues.find(l => l.id !== importInto && l.import?.source === src && l.import.extId === parsed.extId && String(l.import.season) === String(parsed.season));
    if (dup) {
      showModal({
        title: t('Liga je već dodata'), body: `<p>${t('„{n}” već postoji u tvojim ligama.', { n: esc(lgName(dup)) })}</p>`,
        confirm: t('Otvori ligu'), onConfirm: () => { location.hash = `league-${dup.id}/overview`; },
      });
      return;
    }
    openTeamPicker(parsed);
  } catch (e) {
    if (!document.body.contains(m)) return;
    ok.disabled = false;
    msg.innerHTML = `<span class="err">${importErrorHTML(e.code || 'network', src, e.leagues)}</span>`;
  }
}
/** Posle uvoza: "Koji je tvoj tim?" (i format, ako ga ne prepoznajemo) */
function openTeamPicker(parsed) {
  const f = parsed.format;
  const unsup = f?.unsupported?.length ? `<div class="banner warn"><span>⚠ ${t('Neke stavke bodovanja ne podržavamo, rezultat je približan')}: ${esc(f.unsupported.join(', '))}.</span></div>` : '';
  const teams = [...parsed.teams].sort((a, b) => (a.seed || 99) - (b.seed || 99));
  const ended = parsed.ended ? `<div class="banner warn"><span>⚠ ${t('Ova liga je iz sezone koja je završena ({s}). Rosteri su sa kraja te sezone. Za tekuću sezonu uvezi novi ID lige: {p} pravi novu ligu svake sezone.', { s: esc(seasonLabel(parsed.source, parsed.season)), p: SOURCE_LABEL[parsed.source] })}</span></div>` : '';
  const missing = parsed.unmatched?.length ? `<p class="hint">${t('Nismo prepoznali {n} igrača sa rostera: {list}.', { n: parsed.unmatched.length, list: esc(parsed.unmatched.slice(0, 8).join(', ')) })}</p>` : '';
  showModal({
    title: t('Koji je tvoj tim?'), wide: true,
    body: `<p><b>${esc(parsed.name)}</b> · ${t('{n} timova', { n: parsed.size })}${f ? ` · ${esc(formatShort(f))}` : ''}</p>${ended}${unsup}${missing}
      ${f ? '' : `<p class="hint">${parsed.fmtError ? t('Ne prepoznajemo format ove lige. Izaberi ga ručno.') : t('Izaberi format lige.')}</p>${formatPickerHTML('imp', defaultFormatFor(parsed.source, parsed.source === 'sleeper' ? 'points' : 'cat'), parsed.source)}`}
      <div class="imp-teams" role="radiogroup" aria-label="${esc(t('Koji je tvoj tim?'))}">${teams.map(x => `<label class="imp-team"><input type="radio" name="imp-team" value="${esc(String(x.tid))}">
        <span class="it-name">${esc(x.name)}</span><span class="it-meta">${esc([x.abbrev, standTxt(x, !f || isPointsType(f.scoringType)), t('{n} igrača', { n: x.players.length })].filter(Boolean).join(' · '))}</span></label>`).join('')}</div>
      <p class="hint">${t('Možeš da ga promeniš kasnije u podešavanjima lige.')}</p>
      ${importTargetLeague() ? `<p class="hint">${t('Rosteri i timovi lige „{n}” biće zamenjeni podacima sa platforme. Istorija i otvoreni trejdovi ostaju.', { n: esc(lgName(importTargetLeague())) })}</p>` : ''}
      <div class="imp-msg" id="imp-msg2" role="status"></div>`,
    confirm: importTargetLeague() ? t('Uvezi u ovu ligu') : t('Napravi ligu'),
    onConfirm: () => {
      const sel = document.querySelector('input[name="imp-team"]:checked');
      if (!sel) { document.getElementById('imp-msg2').innerHTML = `<span class="err">${t('Izaberi svoj tim.')}</span>`; return false; }
      let fmt = f;
      if (!fmt) { const fp = readFormatPicker('imp'); if (fp.error) return false; fmt = fp.f; }
      const tm = parsed.teams.find(x => String(x.tid) === sel.value);
      const into = importTargetLeague();
      importInto = null;
      let lg;
      if (into) {
        // postojeća liga postaje uvezena: naziv, istorija, punt i tabovi trejdova ostaju
        lg = into;
        const oldF = leagueFormatOf(lg);
        lg.leagueFormat = fmt;
        applyFormatChange(lg, oldF);
        if (currentLeague() !== lg) location.hash = `league-${lg.id}/overview`;
      } else lg = createLeague({ name: parsed.name, leagueFormat: fmt, platform: parsed.source });
      applyImport(lg, parsed, tm.tid);
      render();
      ensurePlayers(parsed.teams.flatMap(x => x.players.map(p => p.id)), parsed.raw).then(() => render());
    },
  });
}

/* ---------- Sleeper (iza zastavice; imena igrača se prepoznaju po imenu, Sleeper nema ESPN ID) ---------- */
const sleeperGet = path => fetchJSON(`${IMPORT.SLEEPER}${path}`);
/** Sleeper igrači: ID -> ime i ID -> status povrede (injury_status). ~2,5 MB, najviše na svakih 6 sati (statusi). */
async function sleeperNames() {
  const c = lsGet(IMPORT.SLEEPER_NAMES_KEY);
  if (c?.map && c.inj && Date.now() - c.ts < IMPORT.SLEEPER_STATUS_TTL_MS) return c;
  const data = await sleeperGet('/players/nba');
  const map = {}, inj = {};
  for (const [id, p] of Object.entries(data || {})) {
    const n = p?.full_name || [p?.first_name, p?.last_name].filter(Boolean).join(' ');
    if (n) map[id] = n;
    if (p?.injury_status) inj[id] = String(p.injury_status).slice(0, 12);
  }
  const out = { ts: Date.now(), map, inj };
  lsSet(IMPORT.SLEEPER_NAMES_KEY, out);
  return out;
}
/** Sleeper zbir sezone za tehničke i flagrantne (po igraču): { [sleeperId]: { tf, ff, gp } }; null kad nije dostupno */
async function sleeperSeasonStats(season) {
  try {
    const d = await sleeperGet(`/stats/nba/regular/${encodeURIComponent(season)}`);
    const out = {};
    for (const [id, v] of Object.entries(d || {})) if (v?.gp > 0) out[id] = { tf: +v.tf || 0, ff: +v.ff || 0, gp: +v.gp };
    return out;
  } catch { return null; }
}
async function fetchSleeperLeague(q) {
  let leagueId = q.leagueId;
  if (!leagueId) {
    let user;
    try { user = await sleeperGet(`/user/${encodeURIComponent(q.username)}`); } catch (e) { throw importErr(e.code === 'network' ? 'network' : 'nouser'); }
    if (!user?.user_id) throw importErr('nouser');
    const st = await sleeperGet('/state/nba').catch(() => null);
    const leagues = await sleeperGet(`/user/${user.user_id}/leagues/nba/${st?.season || CONFIG.SEASON - 1}`);
    if (!Array.isArray(leagues) || !leagues.length) throw importErr('noleagues');
    if (leagues.length > 1) throw Object.assign(importErr('choose'), { leagues: leagues.map(l => ({ id: l.league_id, name: cleanName(l.name) || l.league_id })) });
    leagueId = leagues[0].league_id;
  }
  const [info, rosters, users] = await Promise.all([sleeperGet(`/league/${leagueId}`), sleeperGet(`/league/${leagueId}/rosters`), sleeperGet(`/league/${leagueId}/users`)]);
  if (!info?.league_id || (info.sport && info.sport !== 'nba')) throw importErr('notfound');
  const [sp, pool] = await Promise.all([sleeperNames(), loadNamePool()]);
  const names = sp.map, injMap = sp.inj || {};
  const index = buildNameIndex(pool);
  const espnOf = {}; // sleeperId -> ESPN id (za Sleeperovu statistiku)
  // ime tima: team_name ili displayName (dozvoljeno); owner_id se ne čuva
  const teamName = r => { const u = (users || []).find(x => x.user_id === r.owner_id); return cleanName(u?.metadata?.team_name || u?.display_name) || `Team ${r.roster_id}`; };
  const unmatched = [], ids = [];
  const teams = (Array.isArray(rosters) ? rosters : []).map(r => {
    // taxi (dynasty) se ne računa u roster mesta, kao IR: brojimo ga u rezervna mesta
    const ir = new Set([...(r.reserve || []), ...(r.taxi || [])]), players = [];
    for (const pid of r.players || []) {
      const hit = names[pid] ? matchName(names[pid], index) : null;
      if (hit?.id) { players.push({ id: hit.id, ir: ir.has(pid), ...(sleeperStatus(injMap[pid]) || {}) }); ids.push(hit.id); espnOf[pid] = hit.id; } else unmatched.push(names[pid] || pid);
    }
    const s = r.settings || {};
    return { tid: r.roster_id, name: teamName(r), abbrev: '', record: { w: +s.wins || 0, l: +s.losses || 0, t: +s.ties || 0 }, seed: null, pf: (+s.fpts || 0) + (+s.fpts_decimal || 0) / 100, vals: null, players };
  });
  [...teams].sort((a, b) => b.record.w - a.record.w || b.pf - a.pf).forEach((x, i) => { x.seed = i + 1; });
  const pos = (info.roster_positions || []).filter(x => x !== 'IR');
  const fmt = mapSleeperFormat(info.scoring_settings);
  const st = info.settings || {};
  // tehničke / flagrantne po Sleeperu (zbir sezone) samo kad ih liga boduje
  let adj = null;
  if (fmt.format?.weights && (fmt.format.weights.TF || fmt.format.weights.FF)) {
    const ss = await sleeperSeasonStats(info.season);
    if (ss) { adj = {}; for (const [sid, eid] of Object.entries(espnOf)) if (ss[sid]) adj[eid] = ss[sid]; }
  }
  // rok za trejdove: Sleeper daje samo nedelju lige (trade_deadline), datum je približan
  const dlWeek = +st.trade_deadline || null;
  const monday = Date.parse(`${currentWeekDates()[0]}T00:00:00-05:00`);
  return {
    irRule: SLEEPER_IR_KEYS.filter(k => +st[`reserve_allow_${k}`] === 1), reviewHours: st.trade_review_days != null ? +st.trade_review_days * 24 : null,
    deadlineWeek: dlWeek && dlWeek < 40 ? dlWeek : null, adj,
    source: 'sleeper', extId: String(leagueId), season: String(info.season || ''), name: cleanName(info.name) || 'Sleeper', size: +info.total_rosters || teams.length,
    format: fmt.format, fmtError: null, slots: { active: pos.length || ROSTER_DEFAULT.ACTIVE, ir: (+st.reserve_slots || 0) + (+st.taxi_slots || 0) },
    deadline: dlWeek && dlWeek < 40 ? sleeperDeadline(dlWeek, +st.leg || 0, monday) : null, playoffTeams: +st.playoff_teams || null, teams, raw: poolRawMap(pool, ids), unmatched,
    playoffWeek: +st.playoff_week_start || null, week: +st.leg || null, ended: info.status === 'complete',
    waiverDays: st.waiver_clear_days != null ? +st.waiver_clear_days : null,
  };
}

/** Sleeper ne daje listu waivera: igrači otpušteni u poslednjih waiver_clear_days dana (transakcije ove i prošle nedelje) */
async function sleeperWaivers(lg) {
  const days = lg.import.waiverDays, wk = lg.import.week;
  if (days == null || !wk) return null;
  const since = Date.now() - days * 864e5;
  const lists = await Promise.all([wk, wk - 1].filter(x => x > 0).map(w => sleeperGet(`/league/${encodeURIComponent(lg.import.extId)}/transactions/${w}`).catch(() => [])));
  const dropped = new Map(); // sleeperId -> vreme otpuštanja
  for (const tx of lists.flat()) if (tx?.status === 'complete' && tx.drops && +tx.status_updated >= since) for (const pid of Object.keys(tx.drops)) dropped.set(pid, Math.max(dropped.get(pid) || 0, +tx.status_updated));
  if (!dropped.size) return new Map();
  const [sp, pool] = await Promise.all([sleeperNames(), loadNamePool()]);
  const index = buildNameIndex(pool), out = new Map();
  for (const [pid, ts] of dropped) { const hit = sp.map[pid] ? matchName(sp.map[pid], index) : null; if (hit?.id) out.set(hit.id, ts + days * 864e5); }
  return out;
}

/* ---------- Fantrax (iza zastavice; javne lige, igrači po imenu "Prezime, Ime") ---------- */
async function fantraxNames() {
  const c = lsGet(IMPORT.FANTRAX_NAMES_KEY);
  if (c?.map && Date.now() - c.ts < IMPORT.NAMES_TTL_MS) return c.map;
  const data = await fetchJSON(`${IMPORT.FANTRAX}/getPlayerIds?sport=NBA`);
  const map = {};
  for (const [k, p] of Object.entries(data || {})) { const id = p?.fantraxId || p?.id || k; if (p?.name) map[id] = p.name; }
  lsSet(IMPORT.FANTRAX_NAMES_KEY, { ts: Date.now(), map });
  return map;
}
/** Fantrax tabela -> seed, skor i poeni timova. Prihvata niz ili { standings | rows | teams: [...] }; skor "7-2-0" ili polja win/loss/tie. */
function applyFantraxStandings(teams, data) {
  const rows = Array.isArray(data) ? data : data?.standings || data?.rows || data?.teams || (data && typeof data === 'object' && !data.error ? Object.values(data).find(Array.isArray) : null);
  if (!Array.isArray(rows)) return;
  const num = v => { const n = parseFloat(String(v ?? '').replace(/,/g, '')); return Number.isFinite(n) ? n : null; };
  for (const r of rows) {
    if (!r || typeof r !== 'object') continue;
    const tm = teams.find(x => String(x.tid) === String(r.teamId ?? r.id ?? r.team_id)) || teams.find(x => x.name && x.name === cleanName(r.teamName ?? r.name));
    if (!tm) continue;
    const rec = String(r.points ?? r.record ?? '').match(/^(\d+)-(\d+)(?:-(\d+))?$/);
    if (rec) tm.record = { w: +rec[1], l: +rec[2], t: +(rec[3] || 0) };
    else if (num(r.win ?? r.wins) != null) tm.record = { w: num(r.win ?? r.wins), l: num(r.loss ?? r.losses) || 0, t: num(r.tie ?? r.ties) || 0 };
    const rank = num(r.rank);
    if (rank) tm.seed = rank;
    const pf = num(r.totalPointsFor ?? r.pointsFor ?? r.fantasyPoints ?? r.fpts ?? (rec ? null : r.points));
    if (pf != null) tm.pf = pf;
  }
  if (!teams.some(x => x.seed)) [...teams].sort((a, b) => b.record.w - a.record.w || b.pf - a.pf).forEach((x, i) => { if (x.record.w + x.record.l + x.pf) x.seed = i + 1; });
}
/** Tekuća nedelja (scoring period) po datumu; getTeamRosters.period je u nekim ligama dan sezone, pa se ne koristi */
function fantraxWeek(periods, now = Date.now()) {
  const p = (periods || []).find(x => Date.parse(x.startDate) <= now && now <= Date.parse(x.endDate));
  return p ? +p.number || null : null;
}
async function fetchFantraxLeague(q) {
  const id = encodeURIComponent(q.extId || q.leagueId);
  let info;
  try { info = await fetchJSON(`${IMPORT.FANTRAX}/getLeagueInfo?leagueId=${id}`); } catch (e) { throw importErr(e.code === 'empty' ? 'notfound' : e.code); }
  // nepostojeća liga: 200 sa porukom o grešci
  if (!info || info.error || info.errors || info.message) throw importErr(/permission|privat|public/i.test(JSON.stringify(info || '')) ? 'private' : 'notfound');
  const ros = await fetchJSON(`${IMPORT.FANTRAX}/getTeamRosters?leagueId=${id}`);
  const [names, pool] = await Promise.all([fantraxNames(), loadNamePool()]);
  const index = buildNameIndex(pool);
  const tinfo = info.teamInfo || {};
  const unmatched = [], ids = [];
  const teams = Object.entries(ros?.rosters || {}).map(([tid, r]) => {
    const players = [];
    for (const it of r?.rosterItems || []) {
      const n = names[it.id], hit = n ? matchName(n, index) : null;
      if (hit?.id) { players.push({ id: hit.id, ir: /^(IR|INJ)/i.test(String(it.status || '')) || it.position === 'IR' }); ids.push(hit.id); } else unmatched.push(n ? n.replace(/^([^,]+),\s*(.+)$/, '$2 $1') : it.id); // "Prezime, Ime" -> "Ime Prezime"
    }
    return { tid, name: cleanName(r?.teamName || tinfo[tid]?.name) || `Team ${tid}`, abbrev: '', record: { w: 0, l: 0, t: 0 }, seed: null, pf: 0, vals: null, players };
  });
  if (!teams.length) throw importErr('private');
  // tabela (nije obavezna): niz { teamId, rank, points: "W-L-T", totalPointsFor }; greška se preskače
  const stand = await fetchJSON(`${IMPORT.FANTRAX}/getStandings?leagueId=${id}`).catch(() => null);
  applyFantraxStandings(teams, stand);
  const fmt = mapFantraxFormat(info.scoringSystem);
  const ri = info.rosterInfo || {}, po = info.playoffs || {};
  // IR mesta Fantrax ne vraća: najveći broj igrača na IR u nekom timu (bar podrazumevano)
  const irMax = Math.max(0, ...teams.map(x => x.players.filter(p => p.ir).length));
  return {
    source: 'fantrax', extId: String(q.extId || q.leagueId), season: String(info.seasonYear || info.season || CONFIG.SEASON), name: cleanName(info.leagueName || info.name) || 'Fantrax', size: teams.length,
    format: fmt.format, fmtError: fmt.error, slots: { active: +ri.maxTotalPlayers || ROSTER_DEFAULT.ACTIVE, ir: Math.max(ROSTER_DEFAULT.IR, irMax) }, deadline: null,
    playoffTeams: po.used === false ? null : +po.numPlayoffTeams || null, playoffWeek: po.used === false ? null : +po.firstPlayoffPeriod || null, week: fantraxWeek(info.scoringPeriods),
    ended: !!info.endDate && Date.parse(info.endDate) + 864e5 < Date.now(), teams, raw: poolRawMap(pool, ids), unmatched,
    periods: (info.scoringPeriods || []).map(x => [Date.parse(x.startDate), Date.parse(x.endDate)]).filter(([a, b]) => a > 0 && b > a),
  };
}

/* ---------- Nalepi roster (Yahoo, CBS i druge platforme): jedan tim po jedan ---------- */
let pasteFlow = null;
const PASTE_PLATFORMS = ['yahoo', 'cbs', 'fantrax', 'sleeper', 'espn', 'other'];
function openPaste({ leagueId = null, target = null } = {}) {
  const lg = leagueId ? profile?.leagues.find(l => l.id === leagueId) || null : null;
  const isNew = !lg;
  const tgt = lg && target ? (target === 'my' ? lg.roster : lg.opps[target]) : null;
  const hasMine = !!lg?.roster.players.length;
  showModal({
    title: tgt ? t('Nalepi ponovo: {n}', { n: esc(target === 'my' ? lg.teamName || tgt.name : tgt.name) }) : t('Nalepi roster'), wide: true,
    body: `<ol class="paste-steps">
        <li>${t('Na svojoj platformi (Yahoo, CBS, Fantrax…) otvori stranicu sa rosterom jednog tima.')}</li>
        <li>${t('Označi celu stranicu (Ctrl+A, na Macu Cmd+A) i kopiraj (Ctrl+C ili Cmd+C).')}</li>
        <li>${t('Nalepi ovde. Statistike, pozicije i statuse ignorišemo, tražimo samo imena igrača.')}</li></ol>
      <div class="form">
      ${isNew ? `<label>${t('Naziv lige')}<input type="text" id="pa-league" maxlength="40" placeholder="${t('npr. Liga sa posla')}"></label>
        <div class="form-row"><label>${t('Platforma')}<select id="pa-platform">${PASTE_PLATFORMS.map(p => `<option value="${p}">${esc(platformLabel(p))}</option>`).join('')}</select></label>
          <label>${t('Broj timova')}<input type="number" id="pa-teams" min="2" max="30" value="12"></label></div>
        ${formatPickerHTML('pa', defaultFormatFor('yahoo', 'cat'), 'yahoo')}${slotsFieldHTML('pa')}` : ''}
      ${tgt ? '' : `<label>${t('Ime tima')}<input type="text" id="pa-name" maxlength="30" placeholder="${t('kako se tim zove u ligi')}"></label>
        <label class="check"><input type="checkbox" id="pa-mine" ${hasMine ? '' : 'checked'}> ${t('Ovo je moj tim')}</label>`}
      <label>${t('Tekst sa stranice tima')}<textarea id="pa-text" rows="8" placeholder="${t('Nalepi ovde…')}"></textarea></label>
      <div class="imp-msg" id="pa-msg" role="status" aria-live="polite"></div></div>`,
    confirm: t('Prepoznaj igrače'),
    onConfirm: m => { pasteParse(m, { lg, target, isNew }); return false; },
  });
  setTimeout(() => document.getElementById(isNew ? 'pa-league' : tgt ? 'pa-text' : 'pa-name')?.focus(), 30);
}
async function pasteParse(m, ctx) {
  const v = id => document.getElementById(id)?.value ?? '';
  const msg = document.getElementById('pa-msg');
  const err = (txt, focus) => { msg.innerHTML = `<span class="err">${txt}</span>`; if (focus) document.getElementById(focus)?.focus(); };
  const data = { text: v('pa-text') };
  if (ctx.isNew) {
    data.leagueName = v('pa-league').trim();
    if (!data.leagueName) return err(t('Upiši naziv lige.'), 'pa-league');
    const fp = readFormatPicker('pa');
    if (fp.error) return;
    Object.assign(data, { fmt: fp.f, platform: v('pa-platform'), teams: Math.max(2, Math.min(30, +v('pa-teams') || 12)), slots: readSlots('pa') });
  }
  if (!ctx.target) {
    data.name = v('pa-name').trim();
    if (!data.name) return err(t('Upiši ime tima.'), 'pa-name');
    data.mine = !!document.getElementById('pa-mine')?.checked;
  }
  if (!data.text.trim()) return err(t('Nalepi tekst sa stranice tima.'), 'pa-text');
  msg.innerHTML = `<span class="spinner"></span> ${t('Prepoznajem igrače…')}`;
  const pool = await loadNamePool();
  if (!document.body.contains(m)) return;
  const index = buildNameIndex(pool);
  const res = parseRosterText(data.text, index);
  if (!res.matched.length && !res.ambiguous.length) return err(t('Nismo našli nijedno ime igrača. Proveri da li si nalepio stranicu sa rosterom.'), 'pa-text');
  pasteFlow = { ...ctx, data, res, pool, index, byId: new Map(pool.map(p => [p.id, p])) };
  pasteConfirm();
}
function pasteConfirm() {
  const f = pasteFlow, { res } = f;
  const P = id => state.byId.get(id) || f.byId.get(id) || { id, name: `#${id}` };
  const team = p => PRO_TEAMS[p.tid] || 'FA';
  const ok = x => `<li class="pa-ok"><label><input type="checkbox" data-pa-keep value="${x.id}" checked>${avatarHTML(P(x.id))}<span class="pa-n"><b>${esc(P(x.id).name)}</b><small>${esc(team(P(x.id)))} · ${esc(x.text)}</small></span></label></li>`;
  const amb = (x, i) => `<li class="pa-amb"><span class="pa-line">${esc(x.text)}</span><select data-pa-amb="${i}"><option value="">${t('Preskoči')}</option>${x.ids.map(id => `<option value="${id}">${esc(P(id).name)} (${esc(team(P(id)))})</option>`).join('')}</select></li>`;
  const un = (txt, i) => `<li class="pa-un"><span class="pa-line">${esc(txt)}</span><input type="text" list="pa-names" data-pa-un="${i}" autocomplete="off" placeholder="${esc(t('Upiši ime igrača ili ostavi prazno'))}"></li>`;
  showModal({
    title: t('Proveri igrače'), wide: true,
    body: `<p>${t('Prepoznato igrača: {n}. Skini kvačicu sa onih koji nisu u timu.', { n: res.matched.length })}</p>
      <ul class="pa-list">${res.matched.map(ok).join('')}</ul>
      ${res.ambiguous.length ? `<h4 class="pa-h">${t('Više mogućih igrača')}</h4><ul class="pa-list">${res.ambiguous.map(amb).join('')}</ul>` : ''}
      ${res.unmatched.length ? `<h4 class="pa-h">${t('Neprepoznate linije')}</h4><p class="hint">${t('Upiši ime igrača (predlozi se pojavljuju dok kucaš) ili ostavi prazno da preskočiš.')}</p><ul class="pa-list">${res.unmatched.map(un).join('')}</ul>` : ''}
      <datalist id="pa-names">${f.pool.map(p => `<option value="${esc(p.name)}"></option>`).join('')}</datalist>
      <div class="pa-more"><button type="button" class="linkbtn" data-action="paste-save-more">＋ ${t('Sačuvaj i dodaj još jedan tim')}</button></div>
      <div class="imp-msg" id="pa-msg2" role="status"></div>`,
    confirm: t('Sačuvaj tim'),
    onConfirm: () => pasteSave(false),
  });
}
function pasteSave(more) {
  const f = pasteFlow;
  if (!f) return;
  const ids = [...document.querySelectorAll('[data-pa-keep]:checked')].map(x => +x.value);
  document.querySelectorAll('[data-pa-amb]').forEach(s => { if (s.value) ids.push(+s.value); });
  document.querySelectorAll('[data-pa-un]').forEach(inp => {
    const q = inp.value.trim();
    if (!q) return;
    const id = f.pool.find(p => p.name === q)?.id ?? matchName(q, f.index)?.id;
    if (id) ids.push(id);
  });
  const list = [...new Set(ids)];
  if (!list.length) { document.getElementById('pa-msg2').innerHTML = `<span class="err">${t('Izaberi bar jednog igrača.')}</span>`; return false; }
  closeModal();
  let lg = f.lg;
  if (lg && !profile.leagues.includes(lg)) lg = null; // liga je u međuvremenu obrisana
  const created = !lg;
  if (!lg) lg = createLeague({ name: f.data.leagueName || t('Moja liga'), platform: f.data.platform || 'other', leagueFormat: f.data.fmt, teams: f.data.teams || 12, slots: f.data.slots, import: { source: 'paste' } });
  const now = nowISO();
  const players = list.map(id => ({ id, ir: false }));
  if (f.target) {
    const r = f.target === 'my' ? lg.roster : lg.opps[f.target];
    if (r) { r.players = players; r.updated = now; }
  } else if (f.data.mine) {
    if (lg.roster.players.length) lg.opps[`p${uid()}`] = { ...lg.roster, name: lg.teamName || lg.roster.name }; // dosadašnji "moj tim" postaje protivnik
    lg.roster = { name: f.data.name, players, updated: now };
    lg.teamName = f.data.name;
  } else lg.opps[`p${uid()}`] = { name: f.data.name, players, updated: now };
  if (!lg.import) lg.import = { source: 'paste' };
  if (currentLeague() === lg) state.rosters = { my: lg.roster, opps: lg.opps, oppSel: lg.oppSel };
  touchLeague(lg); saveProfile();
  pasteFlow = null;
  ensurePlayers(list, poolRawMap(f.pool, list)).then(() => render());
  render();
  if (more) { const next = () => openPaste({ leagueId: lg.id }); if (created) state.afterRoute = next; else setTimeout(next, 0); }
  return true;
}
/** Podešavanja lige: deo za uvezenu ligu (moj tim, osvežavanje) */
function importSettingsHTML(lg) {
  if (isSynced(lg)) {
    const imp = lg.import;
    const season = seasonLabel(imp.source, imp.season);
    return `<fieldset class="fmt"><legend>${t('Uvoz: {p}', { p: SOURCE_LABEL[imp.source] })}</legend>
      <label>${t('Moj tim')}<select id="ls-myteam">${imp.myTid == null ? '<option value="">–</option>' : ''}${[...imp.teams].sort((a, b) => a.name.localeCompare(b.name)).map(x => `<option value="${esc(String(x.tid))}" ${x.tid === imp.myTid ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>
      <p class="hint">${t('Liga {id}, sezona {s}.', { id: esc(imp.extId), s: esc(season) })}${imp.syncedAt ? ` ${t('Osveženo {ago}', { ago: timeAgo(Date.parse(imp.syncedAt)) })}.` : ''} ${t('Roster, tabela i broj mesta dolaze sa platforme.')}</p>
      <div><button type="button" class="linkbtn" data-action="league-sync">↻ ${esc(syncBtnText(imp.source))}</button></div></fieldset>`;
  }
  const btn = `<div><button type="button" class="btn" data-action="league-import">⤓ ${t('Uvezi ligu')}</button></div>`;
  if (isPasted(lg)) return `<fieldset class="fmt"><legend>${t('Uvoz lige')}</legend><p class="hint">${t('Rosteri su nalepljeni. Svaki tim možeš da nalepiš ponovo na stranici Liga, ili uvezi celu ligu sa ESPN-a.')}</p>${btn}</fieldset>`;
  return `<fieldset class="fmt"><legend>${t('Uvoz lige')}</legend><p class="hint">${t('Povuci timove i rostere sa ESPN-a ili nalepi roster sa Yahoo, CBS i drugih platformi. Ova liga postaje uvezena, istorija i otvoreni trejdovi ostaju.')}</p>${btn}</fieldset>`;
}
/** Enter u polju za ID pokreće uvoz */
document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.id === 'imp-in') { e.preventDefault(); document.querySelector('#modal [data-modal-ok]')?.click(); } });
/* ==== kraj: Uvoz lige ==== */

function renderPeriods() {
  const mix = mixOn();
  $('#periods').innerHTML = (mix ? `<button type="button" class="mix" aria-pressed="true" title="${esc(t('Ista mešavina perioda kao na kartici u Pronađi trejd. Izaberi period da vidiš samo njega.'))}">${t('Mešavina')}</button>` : '') + PERIODS.map(p =>
    `<button type="button" data-period="${p.key}" aria-pressed="${!mix && p.key === state.period}">${p.label}</button>`).join('');
}

function renderStatus() {
  const el = $('#status');
  if (!el) return;
  if (state.loading) {
    el.innerHTML = `<div class="spinner"></div><span>${state.slow ? t('{src} sporo odgovara, još učitavam…', { src: DATA_SOURCE.name }) : t('Učitavam igrače ({src})…', { src: DATA_SOURCE.name })}</span>`;
    return;
  }
  const info = state.loadedAt
    ? t('{n} igrača · ažurirano {ago} · sezona {s}', { n: state.players.length, ago: timeAgo(state.loadedAt), s: `${CONFIG.SEASON - 1}-${String(CONFIG.SEASON).slice(2)}` })
    : '';
  el.innerHTML = `<span class="grow">${info}</span><button class="linkbtn" data-action="refresh" type="button">↻ ${t('Osveži podatke')}</button>`;
}

function renderBanner() {
  const el = $('#banner');
  const sentF = currentLeague() && activeTab()?.sentFormat ? decodeFormat(activeTab().sentFormat) : null;
  const notice = (sentF ? `<div class="banner info"><span>${t('Trejd je poslat za {a}, prikazan u formatu tvoje lige ({b}).', { a: esc(formatShort(sentF)), b: esc(formatShort(activeFormat())) })}</span><button type="button" class="x" data-action="sentfmt-close" aria-label="${t('Zatvori')}">✕</button></div>` : '')
    + (state.sharedOpen ? `<div class="banner info"><span>🔗 ${t('Otvoren deljeni trejd, prikazan iz tvog ugla.')}</span><button type="button" class="x" data-action="shared-close" aria-label="${t('Zatvori')}">✕</button></div>` : '')
    + (state.notice ? `<div class="banner ok"><span>✔ ${esc(t(state.notice))}</span>${state.noticeLink && !EMBED ? linkHTML(state.noticeLink, { cls: 'linkbtn' }) : ''}<button type="button" data-action="notice-close">${t('U redu')}</button></div>` : '');
  if (!state.error) { el.innerHTML = notice; return; }
  el.innerHTML = state.stale
    ? `<div class="banner warn"><span>⚠ ${esc(state.error)}. ${t('Prikazujem sačuvane podatke od {ago}.', { ago: timeAgo(state.loadedAt) })}</span><button data-action="refresh" type="button">${t('Pokušaj ponovo')}</button></div>`
    : `<div class="banner err"><span>✕ ${esc(state.error)}. ${t('Nema sačuvanih podataka.')}</span><button data-action="refresh" type="button">${t('Pokušaj ponovo')}</button></div>`;
}

const puntNote = () => (state.punt.size ? ` · <span class="punt-note">${t('punt {list}', { list: CATS.filter(isPunt).map(c => c.label).join(', ') })}</span>` : '');

function renderTradeWarn() {
  const plan = state.rosters.my.players.length ? rosterPlan('my') : null;
  const miss = plan ? plan.missingDrops : 0;
  $('#tradewarn').innerHTML = miss > 0
    ? `<div class="banner warn"><span>⚖ ${t('Neravnomeran trejd: izaberi koga izbacuješ ({n}) u kartici Daješ, dotle rezultat nije realan.', { n: miss })}</span></div>` : '';
}

/** Srpski oblik reči "kategorija" uz broj */
const kat = n => plural(n, ['kategoriju', 'kategorije', 'kategorija'], ['category', 'categories']);
/** "u 1 kategoriji", "u 3 kategorije", "u 5 kategorija" */
const katU = n => plural(n, ['kategoriji', 'kategorije', 'kategorija'], ['category', 'categories']);

/** Apsolutna vrednost razlike u formatu procenta: .035 (tri decimale, bez vodeće nule) */
const fmtPctAbs = v => Math.abs(v).toFixed(3).replace(/^0/, '');
/** Razlika za prikaz: računa se nezaokruženo, zaokružuje tek ovde. FG%/FT%: "+.035"; ostalo: "+1.6". zero = prikaz je nula */
function fmtDelta(c, v) {
  const shown = c.ratio ? Math.abs(v).toFixed(2) : c.type === 'pct' ? fmtPctAbs(v) : Math.abs(v).toFixed(1);
  const zero = Number(shown) === 0;
  return { zero, txt: zero ? shown : `${v > 0 ? '+' : '−'}${shown}` };
}

/** Promena kategorije iz moje perspektive (Dobijaš − Daješ) */
function myDeltaText(c, totals) {
  const g = totals[GET].vals[c.key], d = totals[GIVE].vals[c.key];
  if (g == null || d == null) return '';
  return fmtDelta(c, g - d).txt;
}

/** Rezultat iz moje perspektive: kategorija je moja ako je Dobijaš bolji od Daješ (TO: manje je bolje). */
function renderScore(totals, cmp) {
  const el = $('#score');
  if (cmp.active.length < 2) {
    el.innerHTML = `<div class="score-empty">${state.players.length || !state.loading ? t('Dodaj igrače u Daješ i Dobijaš da vidiš poređenje.') : '<div class="skeleton" style="height:48px"></div>'}</div>`;
    return;
  }
  const win = cmp.score[GET], lose = cmp.score[GIVE];
  const verdict = win > lose ? 'good' : win < lose ? 'bad' : '';
  const per = mixOn() ? t('Mešavina kao na kartici u Pronađi trejd (sezona, 15 i 7 dana i projekcija)') : PERIODS.find(p => p.key === state.period).label;
  const pts = cmp.points;
  const head = pts
    // poeni: razlika FPts po utakmici, ispod obe strane
    ? `<div class="score-pts ${pts.diff > 0.05 ? 'good' : pts.diff < -0.05 ? 'bad' : ''}"><span class="big">${fmtPts(pts.diff)}</span> <span class="u">${t('FPts po utakmici')}</span></div>
      <div class="score-verdict">${SIDES[GIVE].name} ${pts.give.toFixed(1)} · ${SIDES[GET].name} ${pts.get.toFixed(1)}</div>`
    : FMT_ACTIVE.scoringType === 'roto'
      ? `<div class="score-row"><div class="score-team get"><span class="pts">${win}</span><span class="nm">${t('bolje')}</span></div><span class="score-sep">:</span>
          <div class="score-team give"><span class="pts">${lose}</span><span class="nm">${t('lošije')}</span></div></div>
        <div class="score-verdict ${verdict}">${t('Popravljaš se u {w} {kat}, slabiš u {l}', { w: win, kat: katU(win), l: lose })}${cmp.ties ? ` · ${t('{n} nerešeno', { n: cmp.ties })}` : ''}</div>`
      : `<div class="score-row">
      <div class="score-team get"><span class="pts">${win}</span><span class="nm">${SIDES[GET].name}</span></div>
      <span class="score-sep">:</span>
      <div class="score-team give"><span class="pts">${lose}</span><span class="nm">${SIDES[GIVE].name}</span></div>
    </div>
    <div class="score-verdict ${verdict}">${t('Trejd ti donosi {w} {kat}, gubiš {l}', { w: win, kat: kat(win), l: lose })}${cmp.ties ? ` · ${t('{n} nerešeno', { n: cmp.ties })}` : ''}</div>`;
  el.innerHTML = `${head}
    <div class="score-note">${per} · ${esc(formatShort(FMT_ACTIVE))}${puntNote()}</div>${formatNoteHTML()}${notCountedHTML()}
    ${state.scope === 'quick'
      // Brzo poređenje: ništa se ne čuva; deljenje linka i zamena strana
      ? `<div class="score-actions"><button type="button" class="linkbtn" data-action="swap-sides" title="${esc(t('Daješ postaje Dobijaš i obrnuto'))}">⇄ ${t('Zameni strane')}</button><button type="button" class="linkbtn" data-action="share">🔗 ${t('Kopiraj link')}</button></div>
        ${profile?.leagues?.length ? `<div class="score-actions"><button type="button" class="btn" data-action="open-in-league">${t('Otvori ovaj trejd u mojoj ligi')} →</button></div>` : ''}`
      : `<div class="score-actions"><button type="button" class="linkbtn" data-action="save-trade" title="${t('Čuva samo ideju u Istoriju; rosteri se ne menjaju')}">★ ${t('Sačuvaj ideju')}</button><button type="button" class="linkbtn" data-action="share">🔗 ${t('Kopiraj link')}</button></div>
    ${rosterLocked() ? offerActionsHTML() : `<div class="score-actions"><button type="button" class="btn ok" data-action="trade-done" title="${t('Tek ovo menja sačuvane rostere')}">✔ ${t('Trejd se dogodio')}</button></div>
    <div class="score-hint">${t('Ovo je ideja za trejd: tvoj sačuvani roster se ne menja dok ne klikneš „Trejd se dogodio”.')}</div>`}`}`;
}

function avatarHTML(p) {
  return `<span class="av" data-ini="${esc(initials(p.name))}"><img src="${CONFIG.HEADSHOT_URL(p.id)}" alt="" loading="lazy" onerror="this.remove()"></span>`; // inicijali (::before) se vide dok se slika učitava i kad je nema
}

/** Procena povratka povređenog (OUT), kao na kartici Pronađi trejd: "povratak za oko 2 nedelje", "nema procene", "do kraja sezone" */
function injRetText(p, lg = currentLeague()) {
  const inj = p && state.players.length ? tfBase(lg).injOfP(p) : null;
  if (!inj) return '';
  if (inj.gone) return t('do kraja sezone');
  if (inj.src === 'default') return t('nema procene');
  const days = Math.max(1, Math.round((inj.ret - Date.now()) / 864e5));
  if (days < 7) return t('povratak za oko {n} {u}', { n: days, u: plural(days, ['dan', 'dana', 'dana'], ['day', 'days']) });
  const w = Math.max(1, Math.round(days / 7));
  return t('povratak za oko {n} {u}', { n: w, u: plural(w, ['nedelju', 'nedelje', 'nedelja'], ['week', 'weeks']) });
}
const injRetHTML = p => { const x = injRetText(p); return x ? ` <span class="inj-ret">${esc(x)}</span>` : ''; };
function injHTML(p) {
  const s = playerStatus(p), i = INJURY[s.inj];
  return i ? `<span class="inj ${i.cls}" title="${esc(s.lb ? s.lb : s.inj)}${s.espn ? ' (ESPN)' : ''}">${i.short}</span>` : '';
}

/** Zaglavlje kategorije: klik = punt */
const catTh = c => (isPointsFmt()
  ? `<th class="${c.fpts ? 'fpts' : 'wth'}" ${c.fpts ? `title="${esc(t('Fantasy poeni po utakmici'))}"` : `data-col="${c.key}" title="${esc(`${t('{s}: {w} po jedinici', { s: c.label, w: fmtNum(c.w) })}. ${t('Prevuci levo ili desno da promeniš redosled kolona.')}`)}"`}>${c.label}${c.fpts ? projEstHTML() : ''}</th>`
  : `<th class="catth${puntCls(c)}" data-punt="${c.key}" data-col="${c.key}" title="${esc(`${isPunt(c) ? t('Vrati kategoriju') : t('Punt: isključi iz rezultata')}. ${t('Prevuci levo ili desno da promeniš redosled kolona.')}`)}">${c.label}</th>`);

const minTip = () => t('Minuti u izabranom periodu. Pređi mišem ili tapni na broj za trend: sezona → 30 → 15 → 7 dana. Poslednjih 15 dana vs sezona: zeleno ↑ / crveno ↓ = ±{a} min ili više, ↑↑ / ↓↓ = ±{b} min ili više (bar {g} utakmice).', { a: MINUTES.ALERT, b: MINUTES.STRONG, g: MINUTES.MIN_GP });
/** Zaglavlje tabela Daješ / Dobijaš: klik na kategoriju = punt */
function headerRow() {
  return `<tr><th>${t('Igrač')}</th><th class="minth" data-tip="${esc(minTip())}">MIN<span class="i">ⓘ</span></th>${CATS.map(catTh).join('')}<th>GP</th></tr>`;
}

/* ---------- Sortiranje roster tabela (samo prikaz; pamti se po tabeli i ligi) ---------- */
const SORT_KEY = 'fbaTrade.sort.v1';
const sortStore = () => lsGet(SORT_KEY) || {};
/** Tabela: Moj tim (stranica tima i analiza), protivnik u analizi, svaki tim na stranici Liga */
const sortTableId = kind => (kind === 'lt' ? `lt:${state.leagueTeam}` : kind);
const sortScope = () => currentLeague()?.id || (EMBED?.targets ? 'quick' : null); // javna Mete za trejd: lista želja bez lige
function sortOf(kind) {
  const sc = sortScope();
  const s = sc ? sortStore()[sc]?.[sortTableId(kind)] : null;
  return s && sortCols(kind).includes(s.col) ? s : null;
}
function setSort(kind, s) {
  const sc = sortScope();
  if (!sc) return;
  const st = sortStore(), m = st[sc] || (st[sc] = {});
  if (s) m[sortTableId(kind)] = s; else delete m[sortTableId(kind)];
  lsSet(SORT_KEY, st);
}
const sortCols = kind => ['MIN', ...CATS.map(c => c.key), 'GP', ...(kind === 'fa' ? ['WK', 'OWN'] : []), ...(kind === 'ttw' ? ['OWNER'] : [])]; // FA tabela: + utakmice ove nedelje i vlasništvo
/** Vrednost za sortiranje u izabranom periodu; null = bez podataka (uvek na dnu) */
function sortVal(p, key) {
  if (key === 'OWN') return p?.own ? p.own.pct : null;
  if (key === 'WK') return p ? faWeekLeft(p.tid) : null;
  const line = p && playerLine(p);
  if (!line || !(line.GP > 0)) return null;
  if (key === 'MIN') return line.MIN ?? null;
  if (key === 'GP') return line.GP;
  const c = CATS.find(x => x.key === key);
  const v = c ? catValue(line, c) : null;
  return v != null && Number.isFinite(v) ? v : null;
}
/** Igrači po aktivnoj koloni (bez sortiranja: sačuvan redosled). Bez podataka idu dole u oba smera. */
function sortIds(kind, ids) {
  const s = sortOf(kind);
  if (!s) return ids;
  const sign = s.dir === 'asc' ? 1 : -1;
  return ids.map((id, i) => ({ id, i, v: sortVal(state.byId.get(id), s.col) }))
    .sort((a, b) => (a.v == null) - (b.v == null) || (a.v != null && b.v != null ? (a.v - b.v) * sign : 0) || a.i - b.i)
    .map(x => x.id);
}
/** Prvi klik: najveće gore (TO i kolone gde je manje bolje: najmanje gore), drugi klik obrnuto */
function clickSort(kind, col) {
  const s = sortOf(kind);
  const first = col === 'OWNER' || CATS.find(c => c.key === col)?.lowerIsBetter ? 'asc' : 'desc'; // OWN i WK: najveće gore; Vlasnik (lista želja): A do Ž
  setSort(kind, { col, dir: s?.col === col ? (s.dir === 'asc' ? 'desc' : 'asc') : first });
  render();
}
/** Pre ručnog pomeranja: prikazani (sortirani) redosled postaje sačuvan, a sortiranje se briše */
function freezeSort(kind) {
  if (!sortOf(kind)) return;
  const r = rosterOf(kind);
  const by = new Map(r.players.map(x => [x.id, x]));
  const ids = ir => sortIds(kind, r.players.filter(x => !!x.ir === ir).map(x => x.id));
  r.players = [...ids(false), ...ids(true)].map(id => by.get(id));
  setSort(kind, null);
}
/** Zaglavlje roster tabela: klik na statističku kolonu sortira (kategorije se ovde ne gase) */
function rosterHeaderRow(kind) {
  const s = sortOf(kind);
  const th = (key, label, extra = '', cls = '', col = false) => {
    const on = s?.col === key;
    const tip = col ? t('Klik sortira po {c}. Prevuci levo ili desno da promeniš redosled kolona.', { c: label }) : t('Sortiraj po {c}', { c: label });
    return `<th class="sortth ${cls}${on ? ' sorted' : ''}" data-sort="${key}" data-skind="${kind}"${col ? ` data-col="${key}"` : ''} aria-sort="${on ? (s.dir === 'asc' ? 'ascending' : 'descending') : 'none'}" title="${esc(tip)}">${label}${extra}${on ? `<span class="sarr">${s.dir === 'asc' ? '▲' : '▼'}</span>` : ''}</th>`;
  };
  return `<tr><th>${t('Igrač')}</th>${th('MIN', 'MIN', `<span class="i" data-tip="${esc(minTip())}">ⓘ</span>`, 'minth')}${CATS.map(c => th(c.key, c.label, c.fpts ? projEstHTML() : '', c.fpts ? 'fpts' : '', !c.fpts)).join('')}${th('GP', 'GP')}</tr>`;
}

/** Strelica trenda za igrača i kategoriju, ili '' */
/** Vrednost kategorije u jednom periodu (procenti preko made/att), ili null */
function catValue(st, c) {
  if (!st || st.GP <= 0) return null;
  if (c.fpts) return fptsOf(st);
  if (c.type === 'pct') return st[c.att] > 0 && st[c.made] != null ? st[c.made] / st[c.att] : null;
  return st[c.key] ?? null;
}
/** Vrednost kategorije za prikaz: procenat ".512", A/TO "2.61", ostalo "23.4" */
const fmtCat = (c, v) => (v == null ? '-' : c.ratio ? v.toFixed(2) : c.type === 'pct' ? fmtPct(v) : fmt1(v));
/** Da li je promena u odnosu na sezonu bitna (isti prag kao za strelicu) */
function bigChange(c, sv, v) {
  if (sv == null || v == null) return false;
  if (c.type === 'pct' && !c.ratio) return Math.abs(v - sv) >= TREND.PCT_ABS;
  return sv > 0 && Math.abs(v - sv) / sv >= TREND.COUNT_REL && Math.abs(v - sv) >= TREND.MIN_ABS;
}

function trendHTML(p, c) {
  if (state.period !== 'season') return '';
  const s = p.stats[PERIODS[0].statId(CONFIG.SEASON)], r = p.stats[TREND.RECENT_STAT_ID];
  if (!s || !r || s.GP <= 0 || r.GP < TREND.MIN_GP) return '';
  const sv = catValue(s, c), rv = catValue(r, c);
  if (!bigChange(c, sv, rv)) return '';
  const up = rv > sv;
  const good = c.lowerIsBetter ? !up : up;
  return `<span class="trend ${good ? 'good' : 'bad'}" data-tip="${c.label}" data-tip-html="${esc(catTipHTML(p, c, sv, rv))}">${up ? '↑' : '↓'}</span>`;
}

/** Tooltip za strelicu kategorije: ista tabela kao za minute (period / vrednost / vs sezona / utakmice) */
function catTipHTML(p, c, sv, rv) {
  const labels = Object.fromEntries(PERIODS.map(x => [x.key, x.label]));
  const fmt = v => fmtCat(c, v);
  const diffTxt = d => `${d > 0 ? '+' : d < 0 ? '−' : '±'}${fmtDelta(c, d).txt.replace(/^[+−]/, '')}`;
  const goodDir = d => (c.lowerIsBetter ? d < 0 : d > 0);
  const rows = MINUTES.TREND_KEYS.map(k => {
    const st = p.stats[PERIODS.find(x => x.key === k).statId(CONFIG.SEASON)];
    const v = catValue(st, c);
    const d = v != null && k !== 'season' ? v - sv : null;
    const cls = d != null && bigChange(c, sv, v) ? (goodDir(d) ? 'up' : 'down') : '';
    return `<tr class="${k === 'l15' ? 'key' : ''}"><td>${labels[k]}</td><td>${v == null ? '–' : fmt(v)}</td>
      <td class="${cls}">${d == null ? '' : diffTxt(d)}</td><td>${st?.GP > 0 ? Math.round(st.GP) : 0}</td></tr>`;
  }).join('');
  const d = rv - sv, good = goodDir(d);
  const rule = c.type === 'pct' && !c.ratio ? `±${fmtPctAbs(TREND.PCT_ABS)}` : `±${TREND.COUNT_REL * 100}%`;
  return `<div class="tt-title">${t('{c} po periodu', { c: c.label })}</div>
    <table class="tt"><thead><tr><th></th><th>${c.label}</th><th>${t('vs sez.')}</th><th>${t('ut.')}</th></tr></thead><tbody>${rows}</tbody></table>
    <div class="tt-foot ${good ? 'up' : 'down'}">${d > 0 ? '↑' : '↓'} ${good ? t('Bolje u poslednjih 15 dana: {d} (prag {r})', { d: diffTxt(d), r: rule }) : t('Lošije u poslednjih 15 dana: {d} (prag {r})', { d: diffTxt(d), r: rule })}</div>`;
}

/** Tooltip za minute: mala tabela period / MIN / razlika od sezone / utakmice */
function minutesTipHTML(p, delta, level) {
  const labels = Object.fromEntries(PERIODS.map(x => [x.key, x.label]));
  const st = k => p.stats[PERIODS.find(x => x.key === k).statId(CONFIG.SEASON)];
  const season = st('season')?.GP > 0 ? st('season').MIN : null;
  const rows = MINUTES.TREND_KEYS.map(k => {
    const s = st(k), has = s && s.GP > 0;
    const d = has && season != null && k !== 'season' ? Math.round((s.MIN - season) * 10) / 10 : null;
    const cls = d == null ? '' : d >= MINUTES.ALERT ? 'up' : d <= -MINUTES.ALERT ? 'down' : '';
    return `<tr class="${k === 'l15' ? 'key' : ''}"><td>${labels[k]}</td><td>${has ? s.MIN.toFixed(1) : '–'}</td>
      <td class="${cls}">${d == null ? '' : `${d > 0 ? '+' : d < 0 ? '−' : '±'}${Math.abs(d).toFixed(1)}`}</td><td>${has ? Math.round(s.GP) : 0}</td></tr>`;
  }).join('');
  const verdict = level
    ? `<div class="tt-foot ${delta > 0 ? 'up' : 'down'}">${(delta > 0 ? '↑' : '↓').repeat(level)} ${t(delta > 0 ? 'Rast {m} min u poslednjih 15 dana' : 'Pad {m} min u poslednjih 15 dana', { m: Math.abs(delta).toFixed(1) })}</div>`
    : `<div class="tt-foot">${t('Bez bitne promene (prag ±{a} min)', { a: MINUTES.ALERT })}</div>`;
  return `<div class="tt-title">${t('Minuti po periodu')}</div>
    <table class="tt"><thead><tr><th></th><th>MIN</th><th>${t('vs sez.')}</th><th>${t('ut.')}</th></tr></thead><tbody>${rows}</tbody></table>${verdict}`;
}

/** MIN ćelija: minuti za izabrani period + kompaktan trend (sezona → 30 → 15 → 7 dana) */
function minutesCell(p, line) {
  const byKey = k => p.stats[PERIODS.find(x => x.key === k).statId(CONFIG.SEASON)];
  const trend = MINUTES.TREND_KEYS.map(k => { const st = byKey(k); return st && st.GP > 0 ? st.MIN : null; });
  const [season, , l15] = trend;
  const enough = (byKey('l15')?.GP || 0) >= MINUTES.MIN_GP;
  // razlika na prikazanoj preciznosti (29.3 -> 26.3 je tačno 3.0)
  const delta = season != null && l15 != null && enough ? Math.round((l15 - season) * 10) / 10 : 0;
  const level = Math.abs(delta) >= MINUTES.STRONG ? 2 : Math.abs(delta) >= MINUTES.ALERT ? 1 : 0;
  const dir = !level ? '' : delta > 0 ? 'up' : 'down';
  const arrow = !level ? '' : (delta > 0 ? '↑' : '↓').repeat(level);
  const known = trend.filter(v => v != null);
  const val = line ? fmt1(line.MIN) : '-';
  return `<td class="mintd ${dir ? `min-${dir}` : ''}" ${known.length ? `data-tip="Minuti" data-tip-html="${esc(minutesTipHTML(p, delta, level))}"` : ''}>${arrow ? `<span class="minarrow">${arrow}</span>` : ''}${known.length ? `<span class="minval">${val}</span>` : val}</td>`;
}

/** Generički red igrača: slika, ime, oznake, MIN, 9 kategorija sa trendom, GP */
function playerRowHTML(p, { tags = [], cls = '', actions = '', sign = '', drag = '', attrs = '', punt = true, markOf = null, pctSub = false } = {}) {
  const line = playerLine(p);
  const pcOf = c => (punt ? puntCls(c) : '') + (markOf ? ` ${markOf(c) || ''}`.trimEnd() : ''); // roster tabele: ugašena kategorija se ne boji; markOf: boja polja (izveštaj FA)
  const cells = CATS.map(c => {
    const pc = pcOf(c) ? ` class="${pcOf(c).trim()}"` : '';
    if (!line) return `<td${pc}>-</td>`;
    const tr = trendHTML(p, c);
    const v = catValue(line, c);
    if (c.type === 'pct' || v == null) return `<td${pc}>${tr}${fmtCat(c, v)}${pctSub && c.type === 'pct' && line[c.att] != null ? `<span class="sub">${(line[c.made] || 0).toFixed(1)}/${line[c.att].toFixed(1)}</span>` : ''}</td>`;
    return `<td class="${c.fpts ? 'fpts' : ''}${pcOf(c)}">${tr}${sign}${fmt1(v)}</td>`;
  }).join('');
  const tagHTML = tags.map(tg => `<span class="slot-tag ${tg.cls}">${tg.raw ? tg.text : t(tg.text)}</span>`).join('');
  return `<tr class="${line ? '' : 'nodata'} ${cls}" ${attrs}>
    <td><div class="pl">${drag ? `<span class="drag" data-drag="${drag}" title="${t('Prevuci gore/dole')}" aria-label="${t('Pomeri igrača')}">≡</span>` : ''}<span class="pm-open" data-pm="${p.id}">${avatarHTML(p)}</span><div class="txt">${tagHTML ? `<span class="tags">${tagHTML}</span>` : ''}<button type="button" class="nm pm-open" data-pm="${p.id}" title="${esc(t('Profil igrača: {n}', { n: p.name }))}">${esc(p.name)}</button>
      <span class="meta">${p.team} · ${posTxt(p)} ${injHTML(p)}${mixOn() ? injRetHTML(p) : ''} ${durabilityHTML(p)} ${weekGamesHTML(p)} ${line ? '' : `<span class="flag" title="${t('Nema podataka za ovaj period, ne računa se')}">0 GP</span>`}</span>
      </div>${actions ? `<span class="acts">${actions}</span>` : ''}</div></td>
    ${minutesCell(p, line)}${cells}<td>${line ? Math.round(line.GP) : '0'}</td></tr>`;
}

const SLOT_LABEL = { d: { text: 'Izbacuješ', cls: 'tag-out' }, w: { text: 'Waiver', cls: 'tag-in' } };

/** Red igrača u trejdu (ili starom sačuvanom trejdu: 'd' / 'w') */
function playerRow(p, ti, kind = 'recv') {
  const slot = SLOT_LABEL[kind];
  const mine = ti === GIVE && rosterIds(state.rosters.my).includes(p.id);
  const opp = ti === GET && rosterIds(rosterOf('opp')).includes(p.id);
  const tags = slot ? [slot] : mine ? [{ text: 'Moj tim', cls: 'tag-mine' }] : opp ? [{ text: esc(rosterOf('opp').name), cls: 'tag-mine', raw: true }] : [];
  if (!slot && irBoundIds(ti === GET ? 'my' : 'opp').includes(p.id)) tags.push({ text: 'ide na IR', cls: 'tag-ir' }); // povređeni ide na IR primaoca, kao na kartici
  return playerRowHTML(p, { tags, sign: kind === 'd' ? '−' : '',
    actions: `<button class="rm" type="button" data-action="remove" data-team="${ti}" data-id="${p.id}" aria-label="${t('Ukloni')} ${esc(p.name)}">✕</button>` });
}

function searchBoxHTML(key, placeholder, label = '') {
  const disabled = !state.players.length;
  const ui = searchUI.get(key) || { query: '' };
  return `<div class="search ${label ? 'slot-search' : ''}">
    ${label}
    <div class="search-in">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
      <input type="search" data-search="${key}" placeholder="${disabled ? (state.loading ? t('Učitavam igrače…') : t('Nema podataka')) : placeholder}" autocomplete="off" autocorrect="off" spellcheck="false"
        value="${esc(ui.query)}" ${disabled ? 'disabled' : ''} role="combobox" aria-expanded="false" aria-controls="dd-${key}">
      <ul class="dd" id="dd-${key}" role="listbox" hidden></ul>
    </div>
  </div>`;
}

/**
 * Ćelija zbira strane: blaga pozadina samo za stranu koja je bolja u kategoriji, lošija ostaje neutralna.
 * Boja je ishod za mene: bolji Dobijaš = zeleno, bolji Daješ (gubim tu kategoriju) = crveno.
 */
const sideCellCls = (mark, ti) => (mark === 'win' ? (ti === GET ? 'better-me' : 'better-them') : '');

/** Red "Slobodno mesto: nivo zamene" sa statistikom nivoa zamene (iste kolone kao red igrača) */
function replRowHTML(tail = '<td></td>', extraTag = '', sel = '') {
  const line = replLineNow();
  const cells = CATS.map(c => { const v = line ? catValue(line, c) : null; return `<td class="${c.fpts ? 'fpts' : ''}">${fmtCat(c, v)}</td>`; }).join('');
  const real = !!tfBase().slot?.slot; // uvezena liga: realna zamena sa waivera; inače nivo zamene
  const tip = real ? ` data-tip="${esc(t('Prosek 3. do 5. najboljeg zdravog slobodnog igrača u ligi (igrač na waiveru se računa sa umanjenjem jer nije zagarantovan). Najbolji slobodan igrač bi bio previše optimističan.'))}"` : '';
  return `<tr class="arriving repl-row"><td><div class="pl"><div class="txt"><span class="tags"><span class="slot-tag tag-in">${t('Slobodno mesto')}</span>${extraTag ? ` <span class="slot-tag tag-ir">${esc(extraTag)}</span>` : ''}${sel}</span><span class="nm"${tip}>${t(real ? 'Realna zamena sa waivera' : 'Nivo zamene')}</span>
    <span class="meta">${t(real ? 'Prosek 3. do 5. najboljeg zdravog slobodnog' : 'Prosek igrača koje lako nađeš na waiveru')}</span></div></div></td><td>${line?.MIN != null ? fmt1(line.MIN) : '-'}</td>${cells}${tail}</tr>`;
}
/** Birač za slobodno mesto: Realna zamena / Izaberi igrača / Ne računaj (padajući meni, ne razbija red ni na telefonu) */
function spotSelHTML() {
  const m = spotMode(), real = !!tfBase().slot?.slot;
  const opt = (v, label) => `<option value="${v}"${m === v ? ' selected' : ''}>${esc(label)}</option>`;
  return ` <select class="spot-sel" data-spot-sel aria-label="${esc(t('Kako se računa slobodno mesto'))}" title="${esc(t('Kako se računa slobodno mesto'))}">${opt('repl', t(real ? 'Realna zamena' : 'Nivo zamene'))}${opt('pick', t('Izaberi igrača'))}${opt('none', t('Ne računaj'))}</select>`;
}
/** Redovi slobodnog mesta u kartici Dobijaš, po izboru (birač je u prvom redu) */
function spotRowsHTML(f) {
  const mode = spotMode(), sp = slotPlan('my'), lg = currentLeague();
  const tmp = k => (k >= f.n - sp.tempSlots ? t('dok je {n} na IR-u', { n: irNames(f.irB) }) : '');
  const rows = [];
  let k = 0;
  const sel = () => (k === 0 ? spotSelHTML() : '');
  if (mode === 'none') {
    for (; k < f.n; k++) rows.push(`<tr class="arriving repl-row spot-none"><td><div class="pl"><div class="txt"><span class="tags"><span class="slot-tag tag-in">${t('Slobodno mesto')}</span>${sel()}</span><span class="nm">${t('Ne računa se')}</span>
      <span class="meta">${t('Mesto ostaje prazno, poredi se samo ko ide i ko dolazi.')}</span></div></div></td><td>-</td>${CATS.map(() => '<td>-</td>').join('')}<td></td></tr>`);
    return rows.join('');
  }
  for (const id of sp.waivers) {
    const p = state.byId.get(id); if (!p) continue;
    const tg = tmp(k);
    rows.push(playerRowHTML(p, { tags: [{ text: 'Slobodno mesto', cls: 'tag-in' }, ...(tg ? [{ text: esc(tg), raw: true, cls: 'tag-ir' }] : [])], cls: 'slot-w spot-pick',
      actions: `${sel()}<button class="rm" type="button" data-action="bal-w-remove" data-kind="my" data-id="${id}" aria-label="${esc(t('Ukloni'))} ${esc(p.name)}">✕</button>` }));
    k++;
  }
  for (const id of f.auto) { const p = state.byId.get(id); if (p) { rows.push(playerRowHTML(p, { tags: [{ text: t('Slobodno mesto · najbolji slobodan'), raw: true, cls: 'tag-in' }], cls: 'slot-w' })); k++; } }
  for (let r = 0; r < f.repl; r++, k++) {
    if (mode === 'pick' && r === 0) {
      // Izaberi igrača: pretraga u redu; dok ne izabereš, računa se realna zamena (statistika u redu)
      const line = replLineNow(), tg = tmp(k);
      const cells = CATS.map(c => `<td class="${c.fpts ? 'fpts' : ''}">${fmtCat(c, line ? catValue(line, c) : null)}</td>`).join('');
      const note = lg && !isSynced(lg) ? ` ${t('Ne znamo da li je igrač stvarno slobodan u tvojoj ligi.')}` : '';
      rows.push(`<tr class="arriving repl-row spot-pickrow"><td><div class="pl"><div class="txt"><span class="tags"><span class="slot-tag tag-in">${t('Slobodno mesto')}</span>${tg ? ` <span class="slot-tag tag-ir">${esc(tg)}</span>` : ''}${sel()}</span>
        ${searchBoxHTML('my-w', t('Koga uzimaš sa waivera…'))}<span class="meta">${tfBase().slot?.slot ? t('Dok ne izabereš igrača, računa se realna zamena.') : t('Dok ne izabereš igrača, računa se nivo zamene.')}${note}</span></div></div></td><td>${line?.MIN != null ? fmt1(line.MIN) : '-'}</td>${cells}<td></td></tr>`);
    } else rows.push(replRowHTML(undefined, tmp(k), sel()));
  }
  return rows.join('');
}
/** Napomena ispod kartice Dobijaš kad dajem više igrača nego što dobijam */
function spotNoteText() {
  const m = spotMode();
  return m === 'none' ? t('Daješ više igrača nego što dobijaš. Slobodno mesto se ne računa: poredi se samo ko ide i ko dolazi.')
    : m === 'pick' ? (tfBase().slot?.slot ? t('Daješ više igrača nego što dobijaš. Slobodno mesto popunjava igrač kog izabereš u redu Slobodno mesto. Dok ga ne izabereš, računa se realna zamena.') : t('Daješ više igrača nego što dobijaš. Slobodno mesto popunjava igrač kog izabereš u redu Slobodno mesto. Dok ga ne izabereš, računa se nivo zamene.'))
      : t('Daješ više igrača nego što dobijaš. Slobodno mesto se računa kao realna zamena sa waivera (uvezena liga) ili nivo zamene. U redu Slobodno mesto možeš da izabereš svog igrača ili da se mesto ne računa.');
}
function totalRow(t, cmp, ti) {
  const tt = window.t; // parametar t zaklanja funkciju prevoda
  const cells = CATS.map(c => {
    const mark = sideCellCls(cmp.cats[c.key].marks[ti], ti);
    const v = t.vals[c.key];
    if (c.type === 'pct') {
      return `<td class="${mark}${puntCls(c)}">${fmtCat(c, v)}<span class="sub">${t.sum[c.made].toFixed(1)}/${t.sum[c.att].toFixed(1)}</span></td>`;
    }
    return `<td class="${mark}${puntCls(c)}${c.fpts ? ' fpts' : ''}">${fmtCat(c, v)}</td>`;
  }).join('');
  return `<tr class="total"><td>${tt('Ukupno')} <span class="meta" style="color:var(--muted);font-weight:500;font-size:11px">(${t.counted})</span></td><td></td>${cells}<td></td></tr>`;
}

function renderTeams(totals, cmp) {
  const html = state.teams.map((team, ti) => {
    const tot = totals[ti];
    const players = team.ids.map(id => state.byId.get(id)).filter(Boolean);
    const unknown = team.ids.length - players.length;
    const better = cmp.active.length >= 2 ? cmp.score[ti] : null;
    const warn = tradeWarnings(ti);
    // strana koja dobija više igrača izbacuje nekog sa svog rostera: Daješ = ja izbacujem, Dobijaš = protivnik izbacuje
    const kind = ti === GIVE ? 'my' : 'opp';
    const sp = slotPlan(kind);
    // protivnikova otpuštanja nisu u tabeli Dobijaš (ne dobijam ih): napomena ispod tabele, sa profilom igrača
    const slotRows = ti === GET ? '' : sp.drops.map(id => state.byId.get(id)).filter(Boolean).map(p => playerRowHTML(p, {
      tags: [{ text: ti === GIVE ? 'Izbacuješ' : 'Izbacuje', cls: 'tag-out' }, ...(sp.laterDrops.includes(p.id) ? [{ text: esc(t('kad se {n} vrati', { n: irNames(sp.irB) })), raw: true, cls: 'tag-ir' }] : [])], cls: 'slot-d',
      actions: `<button class="rm" type="button" data-action="bal-d-remove" data-kind="${kind}" data-id="${p.id}" aria-label="${t('Ukloni')}">✕</button>` })).join('');
    const slotInputs = slotInputHTML(kind, 'd');
    // Dobijaš: moje slobodno mesto (dajem više nego što dobijam) ulazi u rezultat, kao u Pronađi trejd
    let fillRows = '', fillNote = '';
    if (ti === GET) {
      const f = freeFill('my');
      fillRows = f.n > 0 ? spotRowsHTML(f) : '';
      if (f.n > 0) fillNote = `<div class="card-warn soft">${spotNoteText()}</div>`;
      const od = sp.drops.map(id => state.byId.get(id)).filter(Boolean);
      if (od.length) fillNote += `<div class="card-warn soft opp-drops">${t('Protivnik otpušta: {list}', { list: od.map(p => `${pmLink(p.id, p.name)}<button class="rm" type="button" data-action="bal-d-remove" data-kind="opp" data-id="${p.id}" aria-label="${esc(t('Ukloni'))}">✕</button>`).join(', ') })}<br><span class="meta">${t('Koga protivnik izbacuje menja njegov tim, ne tvoj rezultat.')}</span></div>`;
    }
    return `<section class="card" data-team-card="${ti}">
      <div class="card-h">
        <span class="dot" style="background:${SIDES[ti].color}"></span>
        <div class="side-title"><b style="color:${SIDES[ti].color}">${SIDES[ti].name}</b><small>${esc(sideSubtitle(ti))}</small></div>
        ${cmp.points ? `<span class="team-badge ${ti === GET && cmp.points.diff > 0.05 ? 'lead' : ''}">${t('{n} FPts', { n: (ti === GET ? cmp.points.get : cmp.points.give).toFixed(1) })}</span>`
          : better != null ? `<span class="team-badge ${ti === GET && cmp.score[GET] > cmp.score[GIVE] ? 'lead' : ''}">${t('bolje u {n} kat.', { n: better })}</span>` : ''}
      </div>
      ${searchBoxHTML(String(ti), ti === GIVE ? t('Koga daješ…') : t('Koga dobijaš…'))}
      ${players.length
        ? `<div class="tscroll"><table><thead>${headerRow()}</thead><tbody>${players.map(p => playerRow(p, ti)).join('')}${slotRows}${fillRows}</tbody>
           <tfoot>${totalRow(tot, cmp, ti)}</tfoot></table></div>`
        : `<div class="empty-team">${unknown ? t('Igrači iz linka nisu pronađeni u listi.') : t('Još nema igrača. Kucaj ime iznad.')}</div>`}
      ${slotInputs}${fillNote}
      ${warn}
      ${tot.missing.length && players.length ? `<div class="card-warn">⚠ ${t('Bez podataka za period „{p}“, ne računa se: {list}', { p: PERIODS.find(p => p.key === state.period).label, list: tot.missing.map(esc).join(', ') })}</div>` : ''}
    </section>`;
  });
  $('#teams').innerHTML = html.join('');
}

/**
 * Polje za sledeći slobodan slot (which: 'd' = Izbacuješ, 'w' = Waiver dodatak).
 * Ista komponenta za sva stanja rostera: pretraga koja prvo nudi igrače sa rostera.
 * "Izbacuješ" je obavezan (crveno) samo dok bi roster imao više aktivnih od limita lige; inače opcion.
 */
function slotInputHTML(kind, which, wrapCls = 'balance top') {
  const sp = slotPlan(kind);
  const plan = rosterOf(kind)?.players.length ? rosterPlan(kind) : null;
  if (which === 'd') {
    if (sp.drops.length >= sp.dropSlots) return '';
    const req = !!plan && plan.missingDrops > 0, later = sp.drops.length >= sp.dropSlots - sp.laterSlots; // sledeći slot: tek kad se povređeni vrati sa IR-a
    const label = `<span class="slot-tag ${req && !later ? 'slot-d-tag' : 'slot-opt-tag'}">${t(kind === 'my' ? 'Izbacuješ {a}/{b}' : 'Protivnik izbacuje {a}/{b}', { a: sp.drops.length + 1, b: sp.dropSlots })} · ${later ? esc(t('kad se {n} vrati', { n: irNames(sp.irB) })) : req ? t('obavezno') : t('opciono')}</span>`;
    return `<div class="${wrapCls}">${searchBoxHTML(`${kind}-d`, kind === 'my' ? t('Koga izbacuješ sa svog rostera…') : t('Koga izbacuje sa svog rostera…'), label)}</div>`;
  }
  if (sp.waivers.length >= sp.waiverSlots) return '';
  return `<div class="${wrapCls}">${searchBoxHTML(`${kind}-w`, t('Koga uzimaš sa waivera… (opciono)'),
    `<span class="slot-tag slot-w-tag">${t('Waiver dodatak {a}/{b} · opciono', { a: sp.waivers.length + 1, b: sp.waiverSlots })}</span>`)}</div>`;
}

/** Podnaslov strane (ime protivnika kad je izabran) */
const sideSubtitle = ti => (ti === GET && rosterOf('opp') ? t('Protivnik: {n}', { n: rosterOf('opp').name }) : SIDES[ti].sub);
/** Upozorenja ispod strane trejda: igrač nije na rosteru koji ga daje */
/** Dugme za dodavanje na roster; kad nema mesta, izgleda neaktivno, a hover/tap pokazuje zašto */
function addButtonHTML({ action, kind = 'my', id = '', label, n = 1, cls = 'linkbtn addmy' }) {
  const room = hasRoom(rosterOf(kind), n);
  return `<button type="button" class="${cls} ${room ? '' : 'is-disabled'}" data-action="${action}" data-kind="${kind}" ${id !== '' ? `data-id="${id}"` : ''}
    ${room ? '' : `aria-disabled="true" data-tip="${esc(fullTip())}"`}>＋ ${label}</button>`;
}
const addMyButton = id => addButtonHTML({ action: 'add-to-my', id, label: t('Dodaj u moj tim') });

function tradeWarnings(ti) {
  if (EMBED) return ''; // javna početna: bez rostera, nema upozorenja o rosteru
  if (ti === GIVE) {
    // Daješ: igrač koji nije na mom rosteru ne utiče na Moj tim; ponudi da ga dodam
    const mine = new Set(rosterIds(state.rosters.my));
    const notMine = giveIds().filter(id => !mine.has(id));
    const dropsOff = slotPlan('my').drops.filter(id => !mine.has(id));
    const note = id => `<div class="card-warn row">⚠ ${t('{n} nije na tvom rosteru.', { n: esc(state.byId.get(id)?.name || id) })} ${addMyButton(id)}</div>`;
    return notMine.map(note).join('')
      + (notMine.length ? `<div class="card-warn soft">${t('Dok svi igrači iz Daješ nisu na tvom rosteru, sekcija Moj tim se ne menja.')}</div>` : '')
      + dropsOff.map(note).join('');
  }
  const r = rosterOf('opp');
  if (!r || !r.players.length) {
    const alreadyMine = getIds().filter(id => rosterIds(state.rosters.my).includes(id));
    return alreadyMine.length ? `<div class="card-warn">⚠ ${t('Već je na tvom rosteru: {list}', { list: alreadyMine.map(id => esc(state.byId.get(id)?.name || id)).join(', ') })}</div>` : '';
  }
  const notOn = state.teams[ti].ids.filter(id => !rosterIds(r).includes(id));
  const alreadyMine = ti === GET ? state.teams[GET].ids.filter(id => rosterIds(state.rosters.my).includes(id)) : [];
  const nm = id => esc(state.byId.get(id)?.name || id);
  return [
    notOn.length ? `<div class="card-warn">⚠ ${t('Nije na rosteru {team}: {list}', { team: esc(r.name), list: notOn.map(nm).join(', ') })}</div>` : '',
    alreadyMine.length ? `<div class="card-warn">⚠ ${t('Već je na tvom rosteru: {list}', { list: alreadyMine.map(nm).join(', ') })}</div>` : '',
  ].join('');
}

/**
 * Promena kategorije "od -> do" na prikazanoj preciznosti, iz moje perspektive:
 * zeleno ako je bolje za mene (TO: manje je bolje), crveno ako je lošije, sivo "=" ako je isto.
 */
function deltaCellHTML(c, from, to, extraCls = '', sub = '') {
  const a = from?.vals?.[c.key], b = to?.vals?.[c.key];
  const subHTML = sub ? `<span class="sub dsub">${sub}</span>` : '';
  if (a == null || b == null) return `<td class="dcell ${extraCls}${puntCls(c)}">–${subHTML}</td>`;
  const v = b - a, f = fmtDelta(c, v);
  if (Math.abs(v) <= EPS || f.zero) return `<td class="dcell eq ${extraCls}${puntCls(c)}">=${subHTML}</td>`;
  const good = c.lowerIsBetter ? v < 0 : v > 0;
  return `<td class="dcell ${good ? 'pos' : 'neg'} ${extraCls}${puntCls(c)}">${f.txt}${subHTML}</td>`;
}

/** Odnos (FG%, FT%, 3P%, A/TO) na malom imeniocu na bilo kojoj strani; prag je u katalogu (lowVol). U poenima ne postoji. */
function lowVolume(c, totals) {
  if (c.type !== 'pct' || !c.lowVol || isPointsFmt()) return false;
  return totals.some(tot => tot.counted > 0 && tot.sum[c.att] < c.lowVol);
}

/** Povezana liga: protivnik je tim čiji roster ima sve igrače koje dobijam (izveštaj i AI tekst tako uvek imaju njegov roster i plasman) */
let autoOppKey = null; // proverava se samo kad se promene igrači koje dobijam (ručno "Izaberi protivnika" ostaje prazno)
function autoOppForSynced() {
  const lg = currentLeague();
  if (!isSynced(lg) || !getIds().length) return;
  const ids = getIds();
  const key = `${lg.id}:${ids.join(',')}`;
  if (key === autoOppKey) return;
  autoOppKey = key;
  const cur = rosterOf('opp');
  if (cur && ids.every(id => rosterIds(cur).includes(id))) return;
  const hits = Object.entries(state.rosters.opps).filter(([, r]) => ids.every(id => rosterIds(r).includes(id)));
  if (hits.length !== 1) return;
  state.rosters.oppSel = hits[0][0];
  if (state.balance) state.balance.opp = { drops: [], waivers: [] };
  saveRosters();
}
function renderCompare(totals, cmp) {
  const el = $('#compare');
  if (cmp.active.length < 2) { el.innerHTML = ''; return; }
  if (cmp.points) { el.innerHTML = contribHTML(cmp.points); return; }
  const rows = CATS.map(c => {
    const r = cmp.cats[c.key];
    const tds = state.teams.map((_, i) => {
      const v = totals[i].vals[c.key];
      return `<td class="${sideCellCls(r.marks[i], i)}${puntCls(c)}">${fmtCat(c, v)}</td>`;
    }).join('');
    // Razlika iz moje perspektive: Dobijaš − Daješ
    // FG%/FT% sa unetim rosterom: sitno ispod, koliko se menja procenat mog tima
    const tv = c.type === 'pct' ? myTeamValues(c) : null;
    const sub = tv == null ? '' : Math.abs(tv.after - tv.before) < teamTieOf(c)
      ? t('tim: bez promene')
      : t('tim: {d}', { d: fmtDelta(c, tv.after - tv.before).txt });
    const sameShown = cmpKey(c, totals[GIVE].vals[c.key]) === cmpKey(c, totals[GET].vals[c.key]) && totals[GIVE].vals[c.key] != null;
    let diff = r.punted ? `<td class="dcell punt">punt</td>` : sameShown && tv == null ? `<td class="dcell eq${puntCls(c)}">=</td>` : deltaCellHTML(c, totals[GIVE], totals[GET], '', sub);
    if (!r.punted && tv == null && lowVolume(c, totals)) diff = diff.replace(/(<span class="sub dsub">|<\/td>$)/, ` <span class="lowvol" data-tip="${esc(t('Procenat na malom broju šuteva skoro ne utiče na tim.'))}">${t('mali obim')}</span>$1`);
    return `<tr class="${r.punted ? 'punt-row' : ''}"><td class="catth${puntCls(c)}" data-punt="${c.key}" title="${t('Klik: punt')}"><b>${c.label}</b></td>${tds}${diff}</tr>`;
  }).join('');
  // uvezena liga: isti okvir prebacuje se na procenu plasmana u ligi posle trejda
  const proj = isSynced(currentLeague()) ? rankProjection() : null;
  const rank = proj?.length && state.ui.cmpView === 'rank';
  const seg = proj?.length ? `<div class="seg small cmp-seg" role="group" aria-label="${t('Prikaz')}">
      <button type="button" data-action="cmp-view" data-v="cats" aria-pressed="${!rank}">${t('Poređenje kategorija')}</button>
      <button type="button" data-action="cmp-view" data-v="rank" aria-pressed="${rank}">${t('Procena plasmana')}</button></div>` : '';
  el.innerHTML = rank
    ? `<div class="section-t cmp-head"><span>${t('Procena plasmana u ligi posle trejda')} <span class="i" data-tip="${esc(t('Procena uzima u obzir koliko igrač inače propušta utakmica. Trenutni status (OUT, DTD) se ne gleda, ne računa se samo igrač koji je van do kraja sezone.'))}">ⓘ</span></span>${seg}</div>${rankProjHTML(proj)}`
    : `<div class="section-t cmp-head"><span>${t('Poređenje kategorija')} <span class="hint">· ${t('klik na kategoriju = punt')}</span></span>${seg}</div>
    <div class="card"><div class="tscroll"><table class="cmp"><thead><tr><th>${t('Kat.')}</th>${SIDES.map(sd => `<th style="color:${sd.color}">${sd.name}</th>`).join('')}<th title="${esc(t('Dobijaš − Daješ, iz tvoje perspektive'))}">${t('Razlika')}</th></tr></thead>
    <tbody>${rows}</tbody></table></div></div>`;
}
/** Tabela procene plasmana (kategorije redom kao u Poređenju) */
function rankProjHTML(proj) {
  const lg = currentLeague(), of = lg.import.teams.filter(x => x.vals).length;
  const rows = proj.map(x => {
    const d = x.before - x.after, cls = d > 0 ? 'win' : d < 0 ? 'lose' : '';
    return `<tr><td class="catth"><b>${x.c.label}</b></td><td>${x.before}.</td><td class="${cls}">${x.after}.</td><td class="${cls}">${d > 0 ? `▲ ${d}` : d < 0 ? `▼ ${-d}` : '='}</td></tr>`;
  }).join('');
  const h2h = FMT_ACTIVE.scoringType !== 'roto';
  const gl = goneTxt(proj.gone);
  return `${gl ? `<p class="pnote rp-gone">${esc(gl)}</p>` : ''}<div class="card"><div class="tscroll"><table class="cmp rproj"><thead><tr><th>${t('Kat.')}</th><th>${t('Sada')}</th><th title="${esc(t('Kraj sezone, posle trejda'))}">${t('Posle trejda')}</th><th>${t('Promena')}</th></tr></thead><tbody>${rows}</tbody></table></div>
    <p class="pnote rp-note">${t('Mesto od {n} timova. Svi timovi su projektovani na celu sezonu istim tempom, a tvom timu je dodata razlika iz trejda (Dobijaš − Daješ po utakmici × preostale utakmice njihovih NBA timova). FG% i FT% iz pogodaka i pokušaja. Procena uzima u obzir koliko igrač inače propušta utakmica, a trenutni status (OUT, DTD) se ne gleda. Računaju se isti igrači kao u tabeli kategorija, uključujući slobodno mesto i otpuštanja.', { n: of })}${h2h ? ` ${t('U H2H ligi ovo je samo informativno.')}` : ''}</p></div>`;
}

/** Poeni: tabela doprinosa umesto Poređenja kategorija */
function contribHTML(pts) {
  const cell = v => `<td>${v < -0.05 ? '−' : ''}${Math.abs(v).toFixed(1)}</td>`; // pravi minus, ne crtica
  const rows = pts.contrib.map(x => {
    const d = x.diff, f = Math.abs(d) < 0.05;
    return `<tr><td class="catth"><b>${x.c.label}</b> <span class="wt">×${fmtNum(x.c.w)}</span></td>${x.none ? '<td>–</td><td>–</td><td class="dcell">–</td>' : `${cell(x.give)}${cell(x.get)}<td class="dcell ${f ? 'eq' : d > 0 ? 'pos' : 'neg'}">${f ? '=' : fmtPts(d)}</td>`}</tr>`;
  }).join('');
  const tot = `<tr class="total"><td><b>FPts</b></td>${cell(pts.give)}${cell(pts.get)}<td class="dcell ${Math.abs(pts.diff) < 0.05 ? 'eq' : pts.diff > 0 ? 'pos' : 'neg'}">${fmtPts(pts.diff)}</td></tr>`;
  return `<div class="section-t">${t('Odakle dolaze poeni')} <span class="hint">· ${t('poeni po utakmici po statistici, sortirano po razlici')}</span></div>
    <div class="card"><div class="tscroll"><table class="cmp contrib"><thead><tr><th>${t('Statistika')}</th>${SIDES.map(sd => `<th style="color:${sd.color}">${sd.name}</th>`).join('')}<th title="${esc(t('Dobijaš − Daješ, iz tvoje perspektive'))}">${t('Razlika')}</th></tr></thead>
    <tbody>${rows}${tot}</tbody></table></div></div>`;
}

/* =====================================================================
   Liga kao merilo: rang igrača po kategorijama i profil mog tima (z-score),
   i situacija tima iz tabele (mesto, skor, plejof).
   ===================================================================== */
const BENCH = {
  MIN_GP: 5,            // igrač ulazi u rang liste sa bar 5 utakmica u periodu
  RANK_TOP: 15,         // "vrh lige" u kategoriji: top 15
  TEAM_Z: 1.5,          // jača / slabija kategorija tima: z-zbir iznad / ispod ±1.5
};
let benchCache = null;
/**
 * Merilo za izabrani period: "realno posedovani" igrači (top teams × aktivna mesta po % owned).
 * sum kategorije: z = (v − prosek) / sd; FG% / FT%: uticaj = pogođeni − prosečan% × pokušaji (kao u fantasy rangiranju).
 */
function bench() {
  const lg = currentLeague();
  const size = (lg?.teams || 12) * ROSTER.ACTIVE;
  const key = `${state.period}|${state.loadedAt}|${size}|${encodeFormat(FMT_ACTIVE)}`;
  if (benchCache?.key === key) return benchCache;
  const withLine = state.players.map(p => ({ p, l: playerLine(p) })).filter(x => x.l && x.l.GP >= BENCH.MIN_GP);
  const pool = [...withLine].sort((a, b) => (b.p.own?.pct || 0) - (a.p.own?.pct || 0)).slice(0, size);
  const cats = {};
  for (const c of CATS) {
    let pp = null, vals;
    if (c.type === 'pct') {
      const m = pool.reduce((a, x) => a + (x.l[c.made] ?? 0), 0), at = pool.reduce((a, x) => a + (x.l[c.att] ?? 0), 0);
      pp = at ? m / at : 0;
      vals = pool.map(x => (x.l[c.made] ?? 0) - pp * (x.l[c.att] ?? 0));
    } else vals = pool.map(x => catValue(x.l, c) ?? 0);
    const mean = vals.reduce((a, b) => a + b, 0) / (vals.length || 1);
    const sd = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / (vals.length || 1)) || 1;
    cats[c.key] = { mean, sd, pp };
  }
  const raw = (l, c) => (c.type === 'pct' ? (l[c.made] ?? 0) - cats[c.key].pp * (l[c.att] ?? 0) : catValue(l, c) ?? 0);
  // rang lista po kategoriji među svim igračima sa dovoljno utakmica
  const ranks = {};
  for (const c of CATS) {
    const sorted = [...withLine].sort((a, b) => (c.lowerIsBetter ? raw(a.l, c) - raw(b.l, c) : raw(b.l, c) - raw(a.l, c)));
    ranks[c.key] = new Map(sorted.map((x, i) => [x.p.id, i + 1]));
  }
  benchCache = { key, size: pool.length, cats, raw, ranks, total: withLine.length };
  return benchCache;
}
/** z-score igrača u kategoriji (TO: manje je bolje, pa je z obrnut) */
function playerZ(p, c) {
  const l = playerLine(p); if (!l) return null;
  const b = bench(), s = b.cats[c.key];
  const z = (b.raw(l, c) - s.mean) / s.sd;
  return c.lowerIsBetter ? -z : z;
}
/** Kategorije u kojima je igrač u vrhu lige: [{ c, rank }] (najviše 3, samo aktivne kategorije) */
function leaderCats(p) {
  const b = bench();
  return CATS.filter(c => !isPunt(c) && !c.lowerIsBetter && (!isPointsFmt() || c.fpts)).map(c => ({ c, rank: b.ranks[c.key].get(p.id) }))
    .filter(x => x.rank && x.rank <= BENCH.RANK_TOP).sort((a, b) => a.rank - b.rank).slice(0, 3);
}
/** Profil tima: zbir z-score-ova po kategoriji (0 = prosečan tim lige) */
function teamZ(ids) {
  const out = {};
  for (const c of CATS) out[c.key] = ids.reduce((a, id) => { const p = state.byId.get(id); const z = p ? playerZ(p, c) : null; return a + (z || 0); }, 0);
  return out;
}
/** Jače / slabije kategorije mog tima (bez punta), ili null kad roster nije unet */
function myTeamProfile() {
  const r = currentLeague() ? state.rosters?.my : null;
  if (!r || !r.players.length) return null;
  if (isPointsFmt()) return null; // liga na poene: nema jakih i slabih kategorija
  // isto pravilo kao Pregled: tvrdnje "jak / slab u odnosu na ligu" tek sa bar 3 uneta tima
  if (enteredTeams().length < 3) return null;
  const ids = r.players.filter(x => !x.ir).map(x => x.id);
  const z = teamZ(ids);
  const list = CATS.filter(c => !isPunt(c)).map(c => ({ c, z: z[c.key] })).sort((a, b) => b.z - a.z);
  return { z, strong: list.filter(x => x.z >= BENCH.TEAM_Z), weak: list.filter(x => x.z <= -BENCH.TEAM_Z).reverse(), list };
}

/** Situacija tima: izabrano stanje ima prednost; ako nije izabrano, procena iz tabele (mesto / skor / plejof) */
function teamSituation(lg = currentLeague()) {
  if (!lg) return null;
  const st = lg.standings || {}, teams = lg.teams || 0;
  let inferred = null, inPO = null, pct = null;
  if (st.record) {
    const [w, l, tie] = st.record.split(/[-–\s/]+/).map(Number);
    if (Number.isFinite(w) && Number.isFinite(l) && w + l + (tie || 0) > 0) pct = (w + (tie || 0) / 2) / (w + l + (tie || 0));
  }
  if (st.rank && teams) {
    if (st.playoffTeams) inPO = st.rank <= st.playoffTeams;
    const frac = st.rank / teams;
    inferred = frac <= 1 / 3 ? 'contend' : frac > 2 / 3 ? 'rebuild' : 'middle';
    if (inPO === false && frac > 0.5) inferred = 'rebuild';
  } else if (pct != null) {
    inferred = pct >= 0.6 ? 'contend' : pct < 0.4 ? 'rebuild' : 'middle';
  }
  const explicit = lg.teamState || null;
  if (!explicit && !inferred) return null;
  return { state: explicit || inferred, explicit, inferred, rank: st.rank, teams, record: st.record, inPO, pct };
}
const stateLabel = id => { const s = TEAM_STATES.find(x => x.id === id); return s ? t(s.sr) : ''; };

/* =====================================================================
   Izveštaj o trejdu: pravila u kodu, samo ESPN podaci, bez presude.
   Sve što zavisi od lige čita se iz aktivne lige (ROSTER, punt, stanje tima, rosteri).
   ===================================================================== */
const REPORT = {
  MAX_PLUS: 5, MAX_RISK: 3,        // moj deo
  OPP_PLUS: 3, OPP_RISK: 2,        // deo za protivnika
  MIN_RISE: 3,                     // uloga raste: 15 dana > sezona + 3 min
  BIG_MIN: 30,                     // stabilna uloga
  GP_GOOD: 0.85, GP_BAD: 0.70,     // pouzdan / nepouzdan (GP%)
  MISSED: 3,                       // propustio 3+ utakmice tima zaredom
  OWN_DROP: -3,                    // % owned pada više od 3 (ESPN: promena za 7 dana)
  SMALL_SAMPLE: 5,                 // manje od 5 utakmica u izabranom periodu
  REGULAR_MIN: 25,                 // "igra redovno": GP% 85%+ i 25+ min
  BENCH_MIN: 20,                   // izbačeni "igra malo": manje od 20 min ili GP% ispod 70%
  HOT_CATS: 3, COLD_CATS: 3,       // trend u 3+ kategorije
  // pragovi razlika po kategoriji: CAT_STEPS
  VALUE_W: { PTS: 1, REB: 1.2, AST: 1.5, STL: 3, BLK: 3, TPM: 1, TO: -1 }, // "najbolji igrač u trejdu" (gruba vrednost)
};
/**
 * Koliko razlike je "vredno pomena" po kategoriji (po utakmici): n = primetno, b = veliko.
 * team = FG% / FT% kao promena procenta mog tima (kad je roster unet); bez rostera važe n / b za razliku igrača.
 * tr = trend poslednjih 15 dana u odnosu na sezonu (minAtt = najmanje pokušaja po utakmici da bi procenat bio trend).
 * Ispod n se razlika u izveštaju ne pominje. Uključene su i kategorije koje sadašnji format nema (za buduće formate).
 */
const CAT_STEPS = {
  PTS: { n: 3, b: 6, tr: 3 },
  REB: { n: 1.5, b: 3, tr: 1.5 },
  AST: { n: 1.2, b: 2.5, tr: 1.2 },
  TPM: { n: 0.6, b: 1.2, tr: 0.6 },
  STL: { n: 0.3, b: 0.6, tr: 0.4 },
  BLK: { n: 0.3, b: 0.6, tr: 0.4 },
  TO: { n: 1.0, b: 2.0, tr: 0.8 },
  FGP: { n: 0.02, b: 0.04, team: [0.003, 0.006], tr: 0.04, minAtt: 5 },
  FTP: { n: 0.03, b: 0.06, team: [0.003, 0.006], tr: 0.06, minAtt: 2 },
  // ostale statistike iz kataloga formata (lige sa više kategorija i lige na poene)
  OREB: { n: 0.7, b: 1.5, tr: 0.7 }, DREB: { n: 1.2, b: 2.5, tr: 1.2 },
  FGM: { n: 1, b: 2, tr: 1 }, FTM: { n: 1, b: 2, tr: 1 }, TPP: { n: 0.03, b: 0.06, team: [0.003, 0.006], tr: 0.05, minAtt: 3 },
  ATO: { n: 0.4, b: 0.8, tr: 0.4 }, DD: { n: 0.15, b: 0.3, tr: 0.15 }, TD: { n: 0.05, b: 0.1, tr: 0.05 },
  MIN: { n: 3, b: 5, tr: 3 }, PF: { n: 0.5, b: 1, tr: 0.5 },
  FGA: { n: 2, b: 4, tr: 2 }, FTA: { n: 1.5, b: 3, tr: 1.5 }, TPA: { n: 1.5, b: 3, tr: 1.5 }, GS: { n: 0.2, b: 0.4, tr: 0.2 },
  // poeni: razlika FPts po utakmici (zbir strane); trend igrača je relativan (vidi reportTrend)
  FPTS: { n: 1.5, b: 4, tr: 3 },
};
/** 0 = zanemarljivo, 1 = primetno, 2 = veliko */
function catStep(c, diff, team = false) {
  const s = CAT_STEPS[c.key];
  if (!s || diff == null) return 0;
  const [n, b] = team && s.team ? s.team : [s.n, s.b];
  const a = Math.abs(diff);
  return a >= b - EPS ? 2 : a >= n - EPS ? 1 : 0;
}
/** Trend kategorije za izveštaj (strožiji od strelica u tabeli): razlika ≥ tr, a za procente i dovoljno pokušaja */
function reportTrend(c, S, R) {
  const s = CAT_STEPS[c.key]; if (!s) return false;
  const sv = catValue(S, c), rv = catValue(R, c);
  if (sv == null || rv == null) return false;
  if (c.type === 'pct' && Math.min(S[c.att], R[c.att]) < (s.minAtt || 0)) return false;
  if (c.fpts) return Math.abs(rv - sv) >= Math.max(s.tr, 0.12 * Math.abs(sv)) - EPS; // poeni: bar 3 FPts i bar 12% proseka
  return Math.abs(rv - sv) >= s.tr - EPS;
}

/** Vesti iz poslednjih 7 dana: pojmovi (u naslovu ili tekstu) -> kratka činjenica. Bez nagađanja povratka. */
const NEWS_FLAGS = [
  { terms: ['requested a trade', 'trade request', 'request a trade', 'requests a trade'], sr: 'zatražio trejd', en: 'requested a trade' },
  { terms: ['season-ending', 'out for the season', 'miss the rest of the season'], sr: 'van stroja do kraja sezone', en: 'out for the season' },
  { terms: ['out indefinitely'], sr: 'van stroja na neodređeno', en: 'out indefinitely' },
  { terms: ['surgery'], sr: 'vest o operaciji', en: 'surgery news' },
  { terms: ['suspended', 'suspension'], sr: 'suspendovan', en: 'suspended' },
  { terms: ['g league'], skip: ['recalled'], sr: 'poslat u G ligu', en: 'sent to the G League' },
  { terms: ['minutes restriction', 'minute restriction', 'minutes limit'], sr: 'igra sa ograničenjem minuta', en: 'on a minutes restriction' },
  { terms: ['personal reasons'], sr: 'odsutan iz ličnih razloga', en: 'away for personal reasons' },
];

/** Tekstovi izveštaja: 2-3 varijante po pravilu, da ne zvuči šablonski. {x} = vrednost. */
const RT = {
  head: { sr: ['Dobijaš: {get} · Daješ: {give}'], en: ['You get: {get} · You give: {give}'] },
  real: { sr: ['Stvarna razmena: {give} za {get}.'], en: ['Actual swap: {give} for {get}.'] },
  freeSpot: { sr: ['slobodno mesto'], en: ['an open roster spot'] },
  plus: { sr: ['Plusevi'], en: ['Upside'] },
  risk: { sr: ['Rizici'], en: ['Risks'] },
  oppHead: { sr: ['Za protivnika ({name})'], en: ['For your opponent ({name})'] },
  oppAnon: { sr: ['protivnik'], en: ['opponent'] },
  // plusevi
  minRise: {
    sr: ['{name}: uloga mu raste, {a} → {b} min poslednjih 15 dana.', '{name} dobija sve više minuta: {a} → {b} min u poslednjih 15 dana.', '{name}: minutaža ide gore, {a} → {b} min poslednjih 15 dana.'],
    en: ['{name}: role is growing, {a} → {b} min over the last 15 days.', '{name} is getting more minutes: {a} → {b} min in the last 15 days.', '{name}\'s minutes are trending up: {a} → {b} min over the last 15 days.'],
  },
  bigMin: {
    sr: ['{name} igra {m} min po utakmici {per}, stabilna uloga.', '{name} je sigurno na terenu: {m} min po utakmici {per}.'],
    en: ['{name} plays {m} min a game {per}, a stable role.', '{name} is locked into the rotation: {m} min a game {per}.'],
  },
  giveUnsure: {
    sr: ['Rešavaš se igrača čiji povratak je neizvestan ({name}, {why}).', 'Igrač koga daješ ({name}) ima neizvestan povratak ({why}).'],
    en: ['You move on from a player whose return is uncertain ({name}, {why}).', 'You give {name}, and his return is uncertain ({why}).'],
  },
  giveMinDown: {
    sr: ['Igraču koga daješ ({name}) pada minutaža: {a} → {b} min poslednjih 15 dana.', 'Igraču koga daješ ({name}) se smanjuje uloga ({a} → {b} min).'],
    en: ['You give {name} while his minutes drop: {a} → {b} min over the last 15 days.', 'You move on from {name}, whose role is shrinking ({a} → {b} min).'],
  },
  giveLowGp: {
    sr: ['Igrač koga daješ ({name}) odigrao je {gp} od {n} utakmica tima.', 'Igrač koga daješ ({name}) igrao je samo {gp} od {n} utakmica.'],
    en: ['You give {name}, who played {gp} of {n} team games.', 'You move on from {name}, who played only {gp} of {n} games.'],
  },
  oGiveUnsure: { sr: ['Rešava se igrača čiji povratak je neizvestan ({name}, {why}).'], en: ['Moves on from a player whose return is uncertain ({name}, {why}).'] },
  oGiveMinDown: { sr: ['Igraču koga daje ({name}) se smanjuje uloga ({a} → {b} min).'], en: ['Moves on from {name}, whose role is shrinking ({a} → {b} min).'] },
  oGiveLowGp: { sr: ['Igrač koga daje ({name}) odigrao je {gp} od {n} utakmica.'], en: ['Moves on from {name}, who played {gp} of {n} games.'] },
  gpGood: {
    sr: ['{name} je pouzdan: odigrao {gp} od {n} utakmica tima.', '{name} skoro nikad ne propušta: {gp} od {n} utakmica.'],
    en: ['{name} is reliable: played {gp} of {n} team games.', '{name} rarely misses: {gp} of {n} games.'],
  },
  trendUp: {
    sr: ['Poslednjih 15 dana {name} skače u {cat} ({r} vs {s} sezona).', '{name} je u usponu u {cat}: {r} poslednjih 15 dana, {s} za sezonu.'],
    en: ['Over the last 15 days {name} is up in {cat} ({r} vs {s} season).', '{name} is trending up in {cat}: {r} over the last 15 days, {s} for the season.'],
  },
  dtd: {
    sr: ['{name}: sitna povreda ({st}), uloga ostaje ista kad se vrati.', '{name} je {st}, ali sa {m} min po utakmici uloga ga čeka.'],
    en: ['{name}: minor injury ({st}), the role stays the same when he returns.', '{name} is {st}, but with {m} min a game the role is waiting for him.'],
  },
  regularPack: {
    sr: ['{n} igrača koji igraju redovno, za jednog boljeg i jednog koji ne igra.', 'Dobijaš {n} igrača koji redovno igraju, a izbacuješ nekoga ko skoro ne igra.'],
    en: ['{n} players who play regularly, for one better player and one who barely plays.', 'You get {n} regular rotation players and drop someone who barely plays.'],
  },
  dropVs: {
    sr: ['Umesto {drop} ({dm} min, igrao {dg} od {dn}) dobijaš {inc} ({im} min, {ig} od {in}). Minuti {per}.'],
    en: ['Instead of {drop} ({dm} min, played {dg} of {dn}) you get {inc} ({im} min, {ig} of {in}). Minutes {per}.'],
  },
  room: {
    sr: ['Imaš mesta, ne moraš nikoga da izbaciš. {who} su čist dodatak.', 'Roster ima mesta ({n}/{max} posle trejda), pa ne izbacuješ nikoga. {who} su čist dodatak.'],
    en: ['You have room, no need to drop anyone. {who} are pure additions.', 'Your roster has room ({n}/{max} after the trade), so nobody gets dropped. {who} are pure additions.'],
  },
  bestIn: {
    sr: ['Dobijaš najboljeg igrača u trejdu ({name}) i oslobađaš mesto za waiver.', 'Najjači igrač u trejdu ({name}) dolazi kod tebe, a dobijaš i slobodno mesto.'],
    en: ['You get the best player in the trade ({name}) and open a spot for the waiver wire.', 'The best player in the trade ({name}) comes to you, plus a free roster spot.'],
  },
  bestInW: {
    sr: ['Dobijaš najboljeg igrača u trejdu ({name}), a na oslobođeno mesto dolazi {w}.', 'Najjači igrač u trejdu ({name}) dolazi kod tebe, plus {w} sa waivera.'],
    en: ['You get the best player in the trade ({name}), and {w} fills the open spot.', 'The best player in the trade ({name}) comes to you, plus {w} off waivers.'],
  },
  moreMin: {
    sr: ['{name} igra više {per}: {a} min po utakmici, naspram {b} kod igrača koga daješ.', 'Veća uloga {per}: {name} ima {a} min, a igrač koga daješ {b}.'],
    en: ['{name} plays more {per}: {a} min a game, versus {b} for the player you give.', 'Bigger role {per}: {name} plays {a} min, the player you give {b}.'],
  },
  // period za poređenje minutaže (oba igrača uvek iz istog perioda)
  perL15: { sr: ['u poslednjih 15 dana'], en: ['over the last 15 days'] },
  perSeason: { sr: ['ove sezone'], en: ['this season'] },
  gpBetter: {
    sr: ['{name} je pouzdaniji: odigrao {gp} od {n}, naspram {sgp} od {sn} kod igrača koga daješ.'],
    en: ['{name} is more reliable: played {gp} of {n}, versus {sgp} of {sn} for the player you give.'],
  },
  giveMoreMin: {
    sr: ['Igrač koga daješ ({name}) igra više {per}: {a} min naspram {b}.'],
    en: ['You give {name}, who plays more {per}: {a} min versus {b}.'],
  },
  giveMoreGp: {
    sr: ['Daješ pouzdanijeg igrača: {name} je odigrao {gp} od {n}, naspram {rgp} od {rn}.'],
    en: ['You give the more reliable player: {name} played {gp} of {n}, versus {rgp} of {rn}.'],
  },
  ptsGain: { sr: ['Dobijaš {d} FPts po utakmici, najviše iz {src}.', 'Trejd ti donosi {d} FPts po utakmici, najviše iz {src}.'], en: ['You gain {d} FPts per game, mostly from {src}.', 'The trade adds {d} FPts per game, mostly from {src}.'] },
  ptsLoss: { sr: ['Gubiš poene: {d} FPts po utakmici. Najveći minus: {src}.'], en: ['You lose points: {d} FPts per game. Biggest drop: {src}.'] },
  ptsDrag: { sr: ['Poeni koje gubiš: {src} po utakmici.'], en: ['Points you lose: {src} per game.'] },
  ptsHelp: { sr: ['Ipak dobijaš poene iz {src}.'], en: ['You still gain points from {src}.'] },
  oPtsGain: { sr: ['Dobija {d} FPts po utakmici, najviše iz {src}.'], en: ['Gains {d} FPts per game, mostly from {src}.'] },
  oPtsLoss: { sr: ['Gubi poene: {d} FPts po utakmici. Najveći minus: {src}.'], en: ['Loses points: {d} FPts per game. Biggest drop: {src}.'] },
  oPtsDrag: { sr: ['Poeni koje gubi: {src} po utakmici.'], en: ['Points he loses: {src} per game.'] },
  oPtsHelp: { sr: ['Ipak dobija poene iz {src}.'], en: ['He still gains points from {src}.'] },
  profileGain: { sr: ['{who} donosi {list}.'], en: ['{who} brings {list}.'] },
  profileGainMany: { sr: ['Igrači koje dobijaš donose {list}.'], en: ['The players you get bring {list}.'] },
  oProfileGain: { sr: ['Dobija {list}.'], en: ['Gets {list}.'] },
  scorerOut: {
    sr: ['{name} je mnogo bolji strelac koga daješ ({list}).', 'Daješ mnogo boljeg strelca: {name} ({list}).'],
    en: ['{name} is the much better scorer you give up ({list}).', 'You give up the much better scorer: {name} ({list}).'],
  },
  shooterOut: { sr: ['{name} daje više trojki ({list}).'], en: ['{name} makes more threes ({list}).'] },
  scorerOutMild: { sr: ['{name} je bolji strelac ({list}).'], en: ['{name} is the better scorer ({list}).'] },
  lossProfileMild: { sr: ['Posle trejda imaš nešto {list}.'], en: ['After the trade you have somewhat {list}.'] },
  needHelp: { sr: ['Malo pomaže tamo gde si slab: {list}.'], en: ['It helps a bit where you are weak: {list}.'] },
  lossWeakMild: { sr: ['Malo slabiš kategoriju koja ti već fali: {list}.'], en: ['You slightly weaken a category you already lack: {list}.'] },
  lossProfile: { sr: ['Posle trejda imaš {list}.', 'Pazi, posle trejda imaš {list}.'], en: ['After the trade you have {list}.', 'Careful, after the trade you have {list}.'] },
  oLossProfile: { sr: ['Posle trejda ima {list}.'], en: ['After the trade he has {list}.'] },
  posLine: { sr: ['Pozicije: daješ {give}, dobijaš {get}.'], en: ['Positions: you give {give}, you get {get}.'] },
  posFill: {
    sr: ['Popunjavaš poziciju {pos}: na rosteru si imao samo {n} takva igrača.', 'Dobijaš {pos}, a imao si samo {n} igrača na toj poziciji.'],
    en: ['You fill the {pos} spot: you only had {n} such players.', 'You get a {pos}, and you only had {n} players there.'],
  },
  posFlexIn: {
    sr: ['Više pozicija: {who}. Lakše se uklapa u postavu nego {single}, što je blaga prednost.', 'Dobijaš fleksibilnost u postavi: {who}, a {single} igra samo na jednoj poziciji.'],
    en: ['More than one position: {who}. Easier to fit into your lineup than {single}, a slight edge.', 'You gain lineup flexibility: {who}, while {single} plays only one position.'],
  },
  posFlexInMild: { sr: ['Više pozicija: {who}, pa je postava nešto fleksibilnija.'], en: ['More than one position: {who}, so your lineup gets a bit more flexible.'] },
  posFlexOut: { sr: ['Daješ igrača sa više pozicija: {who}, pa je postava manje fleksibilna.'], en: ['You give a player with more than one position: {who}, so your lineup gets less flexible.'] },
  oPosFlexIn: { sr: ['Dobija fleksibilnost u postavi: {who}, a {single} igra samo na jednoj poziciji.'], en: ['Gains lineup flexibility: {who}, while {single} plays only one position.'] },
  oPosFlexInMild: { sr: ['Više pozicija: {who}, pa mu je postava nešto fleksibilnija.'], en: ['More than one position: {who}, so their lineup gets a bit more flexible.'] },
  oPosFlexOut: { sr: ['Daje igrača sa više pozicija: {who}, pa mu je postava manje fleksibilna.'], en: ['Gives a player with more than one position: {who}, so their lineup gets less flexible.'] },
  posNone: { sr: ['Posle trejda ostaješ bez igrača na poziciji {pos}.'], en: ['After the trade you have no players left at {pos}.'] },
  posThin: {
    sr: ['Posle trejda ostaješ sa {n} igrača na poziciji {pos}.'],
    en: ['After the trade you are left with {n} players at {pos}.'],
  },
  leaderIn: { sr: ['{name} je u vrhu lige: {list}.', 'Dolazi igrač iz vrha lige: {name} ({list}).'], en: ['{name} is among the league leaders: {list}.', 'A league leader is coming: {name} ({list}).'] },
  leaderOut: { sr: ['Daješ igrača iz vrha lige: {name} ({list}).', '{name} je u vrhu lige ({list}), a daješ ga.'], en: ['You give a league leader: {name} ({list}).', '{name} is among the league leaders ({list}), and you give him.'] },
  needFix: { sr: ['Popravljaš slabu tačku tima: {list}.', 'Trejd pogađa ono što ti fali: {list}.'], en: ['You fix a weak spot of your team: {list}.', 'The trade hits what you lack: {list}.'] },
  lossStrong: { sr: ['Gubiš u {list}, ali tu ti je tim jak, pa to lakše podnosi.'], en: ['You lose in {list}, but your team is strong there, so it can absorb it.'] },
  lossWeak: { sr: ['Gubiš u kategoriji koja ti je već slaba: {list}.', 'Pazi, slabiš ono što ti već fali: {list}.'], en: ['You lose in a category that is already weak for you: {list}.', 'Careful, you weaken what you already lack: {list}.'] },
  teamLine: { sr: ['Tvoj tim u odnosu na ligu: jak u {strong}{weakPart}.'], en: ['Your team vs the league: strong in {strong}{weakPart}.'] },
  teamLineWeak: { sr: ['Tvoj tim u odnosu na ligu: slab u {weak}.'], en: ['Your team vs the league: weak in {weak}.'] },
  weakPart: { sr: [', slab u {weak}'], en: [', weak in {weak}'] },
  sitLine: { sr: ['{table}Naglasak: {state}{how}.'], en: ['{table}Focus: {state}{how}.'] },
  sitTable: { sr: ['Tabela: {rank}. od {teams}{rec}{po}. '], en: ['Standings: {rank} of {teams}{rec}{po}. '] },
  sitRec: { sr: [', skor {r}'], en: [', record {r}'] },
  sitIn: { sr: [', u zoni plejofa'], en: [', in a playoff spot'] },
  sitOut: { sr: [', van zone plejofa'], en: [', outside the playoff spots'] },
  sitGuess: { sr: [' (procena iz tabele)'], en: [' (estimated from the standings)'] },
  sitMismatch: { sr: ['. Po tabeli bi više odgovaralo: {s}'], en: ['. The standings point more to: {s}'] },
  bestIn1: {
    sr: ['Dobijaš jačeg igrača po zbiru brojki: {name} ({line}).', 'Dolazi igrač sa većim ukupnim doprinosom: {name} ({line}).'],
    en: ['You get the stronger player by total numbers: {name} ({line}).', 'The player with the bigger overall impact is coming to you: {name} ({line}).'],
  },
  // rizici
  bestOut1: {
    sr: ['Daješ jačeg igrača po zbiru brojki: {name} ({line}).', 'Daješ igrača sa većim ukupnim doprinosom: {name} ({line}).'],
    en: ['You give the stronger player by total numbers: {name} ({line}).', 'You give the player with the bigger overall impact: {name} ({line}).'],
  },
  giveRise: {
    sr: ['Igraču koga daješ ({name}) uloga raste: {a} → {b} min poslednjih 15 dana.', 'Daješ igrača u usponu: {name}, {a} → {b} min poslednjih 15 dana.'],
    en: ['You give {name} while his role grows: {a} → {b} min over the last 15 days.', 'You give a player on the rise: {name}, {a} → {b} min over the last 15 days.'],
  },
  giveHot: {
    sr: ['Igrač koga daješ ({name}) je u dobroj formi: poslednjih 15 dana skače u {list}.'],
    en: ['You give {name} in good form: up in {list} over the last 15 days.'],
  },
  out: { sr: ['{name} je trenutno van stroja ({st}).', '{name} trenutno ne igra ({st}).'], en: ['{name} is currently out ({st}).', '{name} is not playing right now ({st}).'] },
  irCan: { sr: ['Može na IR mesto.'], en: ['He can go to an IR spot.'] },
  irFull: { sr: ['IR mesta su ti puna ({a}/{b}), zauzima aktivno mesto.'], en: ['Your IR spots are full ({a}/{b}), so he takes an active spot.'] },
  outStats: { sr: ['Brojke su iz utakmica koje je odigrao, sada ne donosi ništa.'], en: ['His numbers come from games he played, right now he adds nothing.'] },
  missed: {
    sr: ['{name} nije igrao poslednjih {n} utakmica tima.', '{name} je propustio {n} utakmica tima zaredom.'],
    en: ['{name} has missed the last {n} team games.', '{name} has sat out {n} straight team games.'],
  },
  minDown: {
    sr: ['{name}: minutaža pada, {a} → {b} min poslednjih 15 dana.', '{name}: pazi na ulogu, {a} → {b} min u poslednjih 15 dana.'],
    en: ['{name}\'s minutes are dropping: {a} → {b} min over the last 15 days.', 'Watch {name}\'s role: {a} → {b} min over the last 15 days.'],
  },
  missedShort: { sr: ['propustio {n} utakmica zaredom'], en: ['missed {n} straight games'] },
  news: { sr: ['{name}: {fact} ({d}).'], en: ['{name}: {fact} ({d}).'] },
  trendDown: {
    sr: ['{name}: brojke u padu poslednjih 15 dana ({list}).', '{name} je u padu poslednjih 15 dana: {list}.'],
    en: ['{name}\'s numbers are down over the last 15 days: {list}.', 'Watch the dip for {name} over the last 15 days: {list}.'],
  },
  ownDrop: {
    sr: ['{name}: ljudi ga masovno izbacuju u {src} ligama ({chg}% za 7 dana).'],
    en: ['Managers are dropping {name} in {src} leagues ({chg}% over 7 days).'],
  },
  sample: {
    sr: ['Mali uzorak: {name} ima samo {n} utakmica u periodu {per}.'],
    en: ['Small sample: {name} has only {n} games in the {per} window.'],
  },
  hot: {
    sr: ['Ako {name} zadrži ovaj ritam, ovo je krađa. Pazi, uzorak je 15 dana.', '{name} igra iznad svog proseka poslednjih 15 dana. Pazi, uzorak je mali.'],
    en: ['If {name} keeps this pace, it is a steal. Careful, the sample is 15 days.', '{name} is playing above his average over the last 15 days. Careful, the sample is small.'],
  },
  overLimit: {
    sr: ['Posle trejda imaš {n} igrača, limit je {max}. Izaberi koga izbacuješ.'],
    en: ['After the trade you have {n} players, the limit is {max}. Pick who you drop.'],
  },
  bestOut: {
    sr: ['Daješ najboljeg igrača u trejdu ({name}). Zajedno donose više, ali u H2H kategorijama jedan jak igrač često vredi više od dva prosečna.'],
    en: ['You give the best player in the trade ({name}). Together they add more, but in H2H categories one strong player is often worth more than two average ones.'],
  },
  depth: {
    sr: ['Gubiš dubinu: {list} igraju redovno.', 'Pazi na dubinu rostera, daješ igrače koji igraju redovno ({list}).'],
    en: ['You lose depth: {list} play regularly.', 'Watch your depth, you give regular rotation players ({list}).'],
  },
  candidate: {
    sr: ['Najmanje igra na tvom rosteru {per}: {name} ({m} min). Ako njega izbaciš, menjaš {give} za {get}.'],
    en: ['Lowest minutes on your roster {per}: {name} ({m} min). If you drop him, you swap {give} for {get}.'],
  },
  pickHim: { sr: ['Izaberi ga'], en: ['Pick him'] },
  newsTip: { sr: ['Vest'], en: ['News'] },
  ruleNote: { sr: ['Automatska analiza po pravilima, iz {src} podataka. Ne presuđuje, samo opisuje.'], en: ['Automatic rule-based analysis from {src} data. It describes, it does not judge.'] },
  noData: { sr: ['Nema dovoljno podataka za izveštaj.'], en: ['Not enough data for a report.'] },
};
/** Kategorija rečima (za opis profila igrača): SR u genitivu, uz "više" */
const CAT_SKILL = {
  PTS: ['poena', 'points'], REB: ['skokova', 'rebounds'], AST: ['asistencija', 'assists'], TPM: ['trojki', 'threes'],
  STL: ['ukradenih lopti', 'steals'], BLK: ['blokada', 'blocks'],
  TO: ['izgubljenih lopti', 'turnovers'], FGM: ['pogođenih šuteva', 'made field goals'], FGA: ['pokušaja šuta', 'field goal attempts'],
  FTM: ['pogođenih slobodnih bacanja', 'made free throws'], FTA: ['slobodnih bacanja', 'free throw attempts'], TPA: ['pokušaja za tri', 'three-point attempts'],
  OREB: ['ofanzivnih skokova', 'offensive rebounds'], DREB: ['defanzivnih skokova', 'defensive rebounds'], DD: ['dabl-dablova', 'double-doubles'],
  TD: ['tripl-dablova', 'triple-doubles'], PF: ['ličnih grešaka', 'personal fouls'], MIN: ['minuta', 'minutes'], GS: ['utakmica u startnoj petorci', 'games started'],
};
/** Izvor poena rečima: "skokova", "manje izgubljenih lopti" (statistika sa negativnom težinom donosi poene kad je ima manje) */
const ptsSourceWord = c => (c.w < 0 ? `${L('manje', 'fewer')} ${skillOf(c)}` : skillOf(c));
const skillOf = c => (CAT_SKILL[c.key] || [c.label, c.label])[LANG === 'en' ? 1 : 0];
/** Profil rečima: "više skokova i asistencija (REB +3.4, AST +1.3), bolji šut (FG% +.024) i manje izgubljenih lopti (TO −1.7)" */
function profilePhrase(items, gain) {
  items = [...items].sort((a, b) => CATS.indexOf(a.c) - CATS.indexOf(b.c)); // prirodan redosled: PTS, REB, AST...
  const nums = list => list.map(x => `${x.c.label} ${x.label}`).join(', ');
  const cnt = items.filter(x => x.c.type === 'sum' && !x.c.lowerIsBetter);
  const pct = items.filter(x => x.c.type === 'pct' && !x.c.ratio); // procenti šuta
  const ato = items.filter(x => x.c.ratio); // A/TO nije šut
  const to = items.filter(x => x.c.lowerIsBetter);
  const parts = [];
  if (cnt.length) parts.push(`${gain ? L('više', 'more') : L('manje', 'fewer')} ${joinList(cnt.map(x => skillOf(x.c)))} (${nums(cnt)})`);
  if (pct.length) parts.push(`${gain ? L('bolji šut', 'better shooting') : L('slabiji šut', 'worse shooting')} (${nums(pct)})`);
  if (ato.length) parts.push(`${gain ? L('bolji odnos asistencija i izgubljenih lopti', 'a better assist to turnover ratio') : L('slabiji odnos asistencija i izgubljenih lopti', 'a worse assist to turnover ratio')} (${nums(ato)})`);
  if (to.length) parts.push(`${gain ? L('manje', 'fewer') : L('više', 'more')} ${joinList(to.map(x => skillOf(x.c)))} (${nums(to)})`);
  return joinList(parts);
}
/** Varijanta teksta: stabilna za isti trejd (seed), da se ne menja pri svakom osvežavanju */
function rt(key, vars = {}, seed = 0) {
  const list = RT[key][LANG] || RT[key].sr;
  let s = list[Math.abs(seed) % list.length];
  for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(v);
  return s;
}
const joinList = arr => (arr.length <= 1 ? arr.join('') : `${arr.slice(0, -1).join(', ')} ${LANG === 'en' ? 'and' : 'i'} ${arr[arr.length - 1]}`);
const shortDate = iso => (LANG === 'en' ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : euDate(iso));
const minTxt = v => String(Math.round(v));
const n1r = v => (+v || 0).toFixed(1);

/** Sve što pravila znaju o jednom igraču */
function playerFacts(p) {
  const st = k => { const s = p.stats[PERIODS.find(x => x.key === k).statId(CONFIG.SEASON)]; return s && s.GP > 0 ? s : null; };
  const S = st('season'), R = st('l15');
  const recentOk = R && R.GP >= MINUTES.MIN_GP;
  const minS = S ? S.MIN : null, minR = recentOk ? R.MIN : null;
  const minDelta = minS != null && minR != null ? Math.round((minR - minS) * 10) / 10 : 0;
  const dur = durability(p);
  const trends = S && recentOk ? CATS.filter(c => !isPunt(c) && (!isPointsFmt() || c.fpts)).map(c => { // poeni: samo trend FPts
    const sv = catValue(S, c), rv = catValue(R, c);
    if (!reportTrend(c, S, R)) return null;
    const up = rv > sv;
    return { c, sv, rv, up, good: c.lowerIsBetter ? !up : up, rel: c.type === 'pct' ? Math.abs(rv - sv) / 0.03 : Math.abs(rv - sv) / (sv || 1) };
  }).filter(Boolean) : [];
  const line = playerLine(p) || S;
  const value = !line ? 0 : isPointsFmt() ? fptsOf(line) : Object.entries(REPORT.VALUE_W).reduce((a, [k, w]) => a + w * (line[k] || 0), 0);
  const flags = [];
  for (const n of newsOf(p.id)) {
    if (!isRecent(n.published)) continue;
    const txt = `${n.headline} ${n.story}`.toLowerCase();
    for (const f of NEWS_FLAGS) {
      if (flags.some(x => x.f === f)) continue;
      if (f.terms.some(term => txt.includes(term)) && !(f.skip || []).some(s => txt.includes(s))) flags.push({ f, n });
    }
  }
  return { p, S, R, minS, minR, minDelta, dur, trends, value, flags, missed: missedStreak(p), periodGP: playerLine(p)?.GP ?? 0 };
}

/** Trend u ligi na poene: jedna kolona (FPts), pa je i jedan trend dovoljan */
const trendMin = n => (isPointsFmt() ? 1 : n);
const trendLbl = x => (x.c.fpts ? `FPts ${x.sv.toFixed(1)} → ${x.rv.toFixed(1)}` : x.c.label);
const statusLabel = p => stLabel(playerStatus(p));
const newsTipHTML = n => `<b>${esc(shortDate(n.published))}</b> ${esc(n.headline)}`;
const seedOf = (...ids) => ids.flat().reduce((a, x) => (a * 31 + (+x || 0)) % 100003, 7);

/**
 * Stavke izveštaja za jednu stranu.
 * side: 'my' (dobijam Dobijaš, dajem Daješ) ili 'opp' (obrnuto).
 * Vraća { pluses, risks, real, candidate }; stavka = { text, pri, tags[], tip?, action? }
 */
function reportItems(side, totals, cmp) {
  const me = side === 'my';
  const recvIds = me ? getIds() : giveIds(), sendIds = me ? giveIds() : getIds();
  const recv = recvIds.map(id => state.byId.get(id)).filter(Boolean).map(playerFacts);
  const send = sendIds.map(id => state.byId.get(id)).filter(Boolean).map(playerFacts);
  const pluses = [], risks = [];
  const add = (list, pri, text, tags = [], extra = {}) => list.push({ pri, text, tags, ...extra });
  const seed = seedOf(recvIds, sendIds);
  const lg = currentLeague();
  const irOn = !!lg && ROSTER.IR > 0;
  const myRoster = me ? rosterOf('my') : rosterOf('opp');
  const winSide = me ? GET : GIVE, loseSide = me ? GIVE : GET;
  const K = key => (me ? key : `o${key[0].toUpperCase()}${key.slice(1)}`); // protivnik: tekst u trećem licu

  // Poređenje, ne apsolutne vrednosti: minuti i pouzdanost su plus samo kad su bolji od strane koja odlazi
  const minOf = f => f.minR ?? f.minS ?? 0; // samo za jednog igrača (bez poređenja)
  // Poređenje minutaže: svi igrači iz istog perioda (poslednjih 15 dana ako ga imaju svi, inače sezona), period se navodi
  const minPer = list => (list.every(f => f.minR != null) ? 'l15' : 'season');
  const minIn = (f, per) => (per === 'l15' ? f.minR : f.minS) ?? 0;
  const perTxt = per => rt(per === 'l15' ? 'perL15' : 'perSeason');
  const topBy = (list, fn) => list.filter(f => !isOut(f.p)).sort((a, b) => fn(b) - fn(a))[0];
  const gpOf = f => (f.dur && !f.dur.approx && f.dur.n >= 5 ? f.dur.pct : null);
  const sendTopMin = topBy(send, f => f.minS ?? 0), recvTopMin = topBy(recv, f => f.minS ?? 0);
  const sendTopGp = topBy(send.filter(f => gpOf(f) != null), gpOf), recvTopGp = topBy(recv.filter(f => gpOf(f) != null), gpOf);
  // ---- plusevi: igrači koji dolaze ----
  for (const f of recv) {
    const nm = esc(f.p.name), s = seed + f.p.id;
    if (f.minDelta > REPORT.MIN_RISE) add(pluses, 1, rt('minRise', { name: nm, a: minTxt(f.minS), b: minTxt(f.minR) }, s), ['future']);
    else if (me && f === recvTopMin && sendTopMin && (pp => minIn(f, pp) - minIn(sendTopMin, pp) >= REPORT.MIN_RISE)(minPer([f, sendTopMin]))) {
      const pp = minPer([f, sendTopMin]);
      add(pluses, 2, rt('moreMin', { name: nm, per: perTxt(pp), a: minTxt(minIn(f, pp)), b: minTxt(minIn(sendTopMin, pp)) }, s), ['future']);
    }
    else if (!me && minOf(f) >= REPORT.BIG_MIN && !isOut(f.p)) add(pluses, 2, rt('bigMin', { name: nm, m: minTxt(minOf(f)), per: perTxt(f.minR != null ? 'l15' : 'season') }, s), ['future']);
    const gp = gpOf(f);
    if (me && f === recvTopGp && gp >= REPORT.GP_GOOD && sendTopGp && gp - gpOf(sendTopGp) >= 0.10)
      add(pluses, 5, rt('gpBetter', { name: nm, gp: f.dur.gp, n: f.dur.n, sgp: sendTopGp.dur.gp, sn: sendTopGp.dur.n }, s), ['gp', 'future']);
    else if (!me && gp != null && gp >= REPORT.GP_GOOD && !isOut(f.p)) add(pluses, 5, rt('gpGood', { name: nm, gp: f.dur.gp, n: f.dur.n }, s), ['gp', 'future']);
    const up = f.trends.filter(x => x.good && x.up && x.c.type === 'sum').sort((a, b) => b.rel - a.rel)[0]; // rast (ne pad TO)
    if (up) add(pluses, 6, rt('trendUp', { name: nm, cat: up.c.label, r: up.rv.toFixed(1), s: up.sv.toFixed(1) }, s), ['future']);
    if (stGroup(injOf(f.p)) === 'DTD' && (f.minS ?? 0) >= REPORT.REGULAR_MIN)
      add(pluses, 7, rt('dtd', { name: nm, st: statusLabel(f.p), m: minTxt(f.minS) }, s));
  }
  // ---- plusevi: igrači koji odlaze (neizvestan povratak, pad minuta, nizak GP%) ----
  for (const f of send) {
    const nm = esc(f.p.name), s = seed + f.p.id;
    const why = isOut(f.p) ? statusLabel(f.p) : f.flags[0] ? (LANG === 'en' ? f.flags[0].f.en : f.flags[0].f.sr) : f.missed >= REPORT.MISSED ? rt('missedShort', { n: f.missed }) : null;
    if (why) add(pluses, 3, rt(K('giveUnsure'), { name: nm, why: esc(why) }, s), ['future'], f.flags[0] ? { tip: newsTipHTML(f.flags[0].n) } : {});
    else if (f.minDelta < -REPORT.MIN_RISE) add(pluses, 3, rt(K('giveMinDown'), { name: nm, a: minTxt(f.minS), b: minTxt(f.minR) }, s), ['future']);
    else if (f.dur && !f.dur.approx && f.dur.pct < REPORT.GP_BAD && f.dur.n >= 5) add(pluses, 3, rt(K('giveLowGp'), { name: nm, gp: f.dur.gp, n: f.dur.n }, s), ['gp']);
  }
  // ---- poeni: razlika FPts po utakmici i dva najveća izvora (liga na poene nema kategorije) ----
  if (isPointsFmt()) {
    const d = (totals[winSide].vals.FPTS ?? 0) - (totals[loseSide].vals.FPTS ?? 0);
    const contrib = pointsContrib(totals).filter(x => !x.none).map(x => ({ ...x, d: me ? x.diff : -x.diff }));
    const nums = list => list.slice(0, 2).map(x => `${x.c.label} ${fmtPts(x.d)}`).join(', ');
    const words = list => `${joinList(list.slice(0, 2).map(x => ptsSourceWord(x.c)))} (${nums(list)})`;
    const pos = contrib.filter(x => x.d > 0.05).sort((a, b) => b.d - a.d), neg = contrib.filter(x => x.d < -0.05).sort((a, b) => a.d - b.d);
    const step = catStep(FPTS_COL, d);
    if (d > 0 && step && pos.length) add(pluses, step === 2 ? 1.6 : 2.4, rt(K('ptsGain'), { d: fmtPts(d), src: words(pos) }, seed), ['now']);
    else if (d < 0 && step && neg.length) add(risks, step === 2 ? 2.2 : 3.8, rt(K('ptsLoss'), { d: fmtPts(d), src: nums(neg) }, seed), ['now']);
    // i kad je ukupno u plusu: statistika koja najviše vuče nazad (bar 1.5 FPts po utakmici)
    if (d >= 0 && neg[0] && neg[0].d <= -1.5) add(risks, 6, rt(K('ptsDrag'), { src: nums(neg) }, seed), ['now']);
    else if (d < 0 && pos[0] && pos[0].d >= 1.5) add(pluses, 6, rt(K('ptsHelp'), { src: words(pos) }, seed), ['now']);
  }
  // ---- kategorije (samo aktivne kategorije lige) ----
  const gains = [], losses = [];
  for (const c of isPointsFmt() ? [] : CATS) {
    if (isPunt(c)) continue;
    const g = totals[winSide].vals[c.key], d = totals[loseSide].vals[c.key];
    if (g == null || d == null) continue;
    let diff = g - d, label = '', team = false;
    if (c.type === 'pct') {
      const td = me ? myTeamDelta(c) : null;
      if (td != null) { // roster unet: računa se promena mog tima, ne sirova razlika igrača
        diff = td; team = true; label = LANG === 'en' ? `team ${fmtDelta(c, td).txt}` : `tim ${fmtDelta(c, td).txt}`;
      } else {
        if (lowVolume(c, totals)) continue; // mali obim šuteva: procenat nije ni plus ni rizik
        label = fmtDelta(c, diff).txt;
      }
    } else label = fmtDelta(c, diff).txt;
    const step = catStep(c, diff, team);
    if (!step) continue; // razlika ispod praga za tu kategoriju se ne pominje
    const s = CAT_STEPS[c.key], bigAt = team && s.team ? s.team[1] : s.b;
    const good = c.lowerIsBetter ? diff < 0 : diff > 0;
    (good ? gains : losses).push({ c, label, rel: Math.abs(diff) / bigAt, big: step === 2, step });
  }
  gains.sort((a, b) => b.rel - a.rel); losses.sort((a, b) => b.rel - a.rel);
  // profil: šta donose igrači koji dolaze (sve kategorije gde dobijam, rečima + brojka)
  if (gains.length) {
    const list = profilePhrase(gains, true);
    const key = !me ? 'oProfileGain' : recv.length === 1 ? 'profileGain' : 'profileGainMany';
    add(pluses, 2.4, rt(key, { who: recv[0] ? esc(recv[0].p.name) : '', list }, seed), ['now']);
  }
  // šta gubim: strelac (PTS / 3PM) posebno, ostalo kao profil
  const bigLoss = losses; // svi gubici iznad praga kategorije (primetni i veliki)
  const scoring = bigLoss.filter(x => ['PTS', 'TPM'].includes(x.c.key));
  const rest = bigLoss.filter(x => !scoring.includes(x));
  const vsTxt = x => `${x.c.label} ${valTxt(x.c, totals[loseSide].vals[x.c.key])} ${LANG === 'en' ? 'vs' : 'naspram'} ${valTxt(x.c, totals[winSide].vals[x.c.key])}`;
  const oneForOne = send.length === 1 && recv.length === 1 && !slotIds('my').length; // zbirovi = baš ta dva igrača
  const scoreKey = !scoring.some(x => x.c.key === 'PTS') ? 'shooterOut' : scoring.some(x => x.big) ? 'scorerOut' : 'scorerOutMild'; // "strelac" samo uz PTS
  if (me && scoring.length && oneForOne) add(risks, 3.8, rt(scoreKey, { name: esc(send[0].p.name), list: scoring.map(vsTxt).join(', ') }, seed), ['now']);
  const lossList = me && oneForOne ? rest : bigLoss;
  if (lossList.length) add(risks, lossList.some(x => x.big) ? 6 : 7.5, rt(me ? (lossList.some(x => x.big) ? 'lossProfile' : 'lossProfileMild') : 'oLossProfile', { list: profilePhrase(lossList, false) }, seed), ['now']);

  // ---- rizici: igrači koji dolaze ----
  for (const f of recv) {
    const nm = esc(f.p.name), s = seed + f.p.id;
    if (isOut(f.p)) {
      let txt = rt('out', { name: nm, st: statusLabel(f.p) }, s);
      if (me && irOn && canIR(f.p)) {
        const r = myRoster;
        txt += ' ' + (r && r.players.length && irCount(r) >= ROSTER.IR ? rt('irFull', { a: irCount(r), b: ROSTER.IR }) : rt('irCan'));
      }
      if (['season', 'l30'].includes(state.period)) txt += ' ' + rt('outStats');
      add(risks, 1, txt, ['now']);
    }
    if (f.missed != null && f.missed >= REPORT.MISSED) add(risks, 2, rt('missed', { name: nm, n: f.missed }, s), ['gp']);
    if (f.minDelta < -REPORT.MIN_RISE && !isOut(f.p)) add(risks, 2.5, rt('minDown', { name: nm, a: minTxt(f.minS), b: minTxt(f.minR) }, s), ['future']);
    if (f.flags.length) {
      const facts = f.flags.map(x => (LANG === 'en' ? x.f.en : x.f.sr));
      const news = [...new Set(f.flags.map(x => x.n))];
      add(risks, 3, rt('news', { name: nm, fact: facts.join(', '), d: shortDate(news[0].published) }, s), [], { tip: news.map(newsTipHTML).join('<br>') });
    }
    const down = f.trends.filter(x => !x.good);
    if (down.length >= trendMin(REPORT.COLD_CATS)) add(risks, 4, rt('trendDown', { name: nm, list: down.map(trendLbl).join(', ') }, s));
    if (f.p.own && f.p.own.chg < REPORT.OWN_DROP) add(risks, 5, rt('ownDrop', { name: nm, src: DATA_SOURCE.name, chg: f.p.own.chg.toFixed(1) }, s));
    if (state.period !== 'proj' && f.periodGP > 0 && f.periodGP < REPORT.SMALL_SAMPLE)
      add(risks, 7, rt('sample', { name: nm, n: Math.round(f.periodGP), per: PERIODS.find(x => x.key === state.period).label.toLowerCase() }, s));
    if (f.trends.filter(x => x.good && x.up && x.c.type === 'sum').length >= trendMin(REPORT.HOT_CATS)) add(risks, 8, rt('hot', { name: nm }, s), ['future']);
  }

  // ---- igrači koje dajem: šta gubim (da izveštaj ne gleda samo igrače koji dolaze) ----
  const keyLine = f => { const l = playerLine(f.p) || f.S; return l ? `${n1r(l.PTS)} PTS, ${n1r(l.REB)} REB, ${n1r(l.AST)} AST` : ''; };
  for (const f of me ? send : []) { // samo moj deo (tekst je u drugom licu)
    if (isOut(f.p)) continue;
    const nm = esc(f.p.name), s = seed + f.p.id;
    if (f.minDelta > REPORT.MIN_RISE) add(risks, 3.6, rt('giveRise', { name: nm, a: minTxt(f.minS), b: minTxt(f.minR) }, s), ['future']);
    const hot = f.trends.filter(x => x.good && x.up && x.c.type === 'sum');
    if (hot.length >= trendMin(2)) add(risks, 6.2, rt('giveHot', { name: nm, list: hot.slice(0, 3).map(trendLbl).join(', ') }, s), ['future']);
    const gp2 = recvTopMin ? minPer([f, recvTopMin]) : null;
    if (recvTopMin && minIn(f, gp2) - minIn(recvTopMin, gp2) >= REPORT.MIN_RISE && f.minDelta <= REPORT.MIN_RISE)
      add(risks, 5.8, rt('giveMoreMin', { name: nm, per: perTxt(gp2), a: minTxt(minIn(f, gp2)), b: minTxt(minIn(recvTopMin, gp2)) }, s), ['future']);
    const gp = gpOf(f);
    if (gp != null && recvTopGp && gp - gpOf(recvTopGp) >= 0.10)
      add(risks, 6.8, rt('giveMoreGp', { name: nm, gp: f.dur.gp, n: f.dur.n, rgp: recvTopGp.dur.gp, rn: recvTopGp.dur.n }, s), ['gp']);
  }
  // "jači igrač po zbiru brojki" je uklonjen: sirov zbir vrednuje blokadu kao poen. Vraća se u fazi 4 sa pravom vrednošću igrača.

  // ---- igrači u odnosu na vrh lige ----
  if (me) {
    const lc = f => leaderCats(f.p).map(x => `#${x.rank} ${x.c.label}`).join(', ');
    for (const f of recv) { const l = lc(f); if (l) add(pluses, 2.6, rt('leaderIn', { name: esc(f.p.name), list: l }, seed + f.p.id), ['now']); }
    for (const f of send) { const l = lc(f); if (l) add(risks, 3.9, rt('leaderOut', { name: esc(f.p.name), list: l }, seed + f.p.id), ['now']); }
  }
  // ---- kategorije tima: gde sam jak / slab u odnosu na ligu ----
  const prof = me ? myTeamProfile() : null;
  if (prof) {
    const weakKeys = new Set(prof.weak.map(x => x.c.key)), strongKeys = new Set(prof.strong.map(x => x.c.key));
    const fix = gains.filter(x => weakKeys.has(x.c.key)), hitWeak = losses.filter(x => weakKeys.has(x.c.key)), hitStrong = losses.filter(x => strongKeys.has(x.c.key));
    const lbl = list => joinList(list.map(x => `${x.c.label} (${x.label})`));
    if (fix.length) { const big = fix.some(x => x.big); add(pluses, big ? 1.8 : 4.4, rt(big ? 'needFix' : 'needHelp', { list: lbl(fix) }, seed), ['now', 'future']); }
    if (hitWeak.length) { const big = hitWeak.some(x => x.big); add(risks, big ? 2.8 : 5.6, rt(big ? 'lossWeak' : 'lossWeakMild', { list: lbl(hitWeak) }, seed), ['now']); }
    if (hitStrong.length) add(pluses, 4.6, rt('lossStrong', { list: joinList(hitStrong.map(x => x.c.label)) }, seed), ['now']);
  }

  // ---- pozicije: šta daješ / dobijaš i uklapanje u roster ----
  let posLine = '';
  const posOf = list => [...new Set(list.flatMap(f => posList(f.p)))];
  const posWho = list => joinList(list.map(f => `${esc(f.p.name)} (${posTxt(f.p)})`));
  if (me && recv.length && send.length) {
    posLine = rt('posLine', { give: posWho(send), get: posWho(recv) });
    const plan = lg ? rosterPlan('my') : null;
    if (plan?.tradeTouches) {
      const count = ids => { const m = {}; ids.forEach(id => { const p = state.byId.get(id); if (!p) return; posList(p).forEach(ps => { m[ps] = (m[ps] || 0) + 1; }); }); return m; };
      const before = count(plan.activeBefore), after = count(plan.activeAfter);
      const recvPos = posOf(recv), sendPos = posOf(send);
      const fill = recvPos.filter(ps => !sendPos.includes(ps) && (before[ps] || 0) <= 2).sort((a, b) => (before[a] || 0) - (before[b] || 0))[0];
      if (fill) add(pluses, 3.2, rt('posFill', { pos: fill, n: before[fill] || 0 }, seed), ['now']);
      const thin = sendPos.filter(ps => (after[ps] || 0) <= 1 && (after[ps] || 0) < (before[ps] || 0))[0];
      if (thin) add(risks, 5.2, rt(after[thin] ? 'posThin' : 'posNone', { pos: thin, n: after[thin] || 0 }, seed), ['now']);
    }
  }

  // ---- više pozicija: blaga prednost (lakše se uklapa u postavu, npr. PF/C može i u F i u C mesto) ----
  if (recv.length && send.length) {
    const nPos = f => posList(f.p).length;
    const flexIn = recv.filter(f => nPos(f) > 1 && !isOut(f.p)), flexOut = send.filter(f => nPos(f) > 1);
    const avg = list => list.reduce((a, f) => a + nPos(f), 0) / list.length;
    const who = list => joinList(list.map(f => `${esc(f.p.name)} (${posTxt(f.p)})`));
    const single = list => joinList(list.filter(f => nPos(f) === 1).map(f => `${esc(f.p.name)} (${posTxt(f.p)})`));
    if (flexIn.length && avg(recv) > avg(send)) add(pluses, 6, rt(K(send.every(f => nPos(f) === 1) ? 'posFlexIn' : 'posFlexInMild'), { who: who(flexIn), single: single(send) }, seed), ['now']);
    else if (flexOut.length && avg(send) > avg(recv)) add(risks, 7, rt(K('posFlexOut'), { who: who(flexOut) }, seed), ['now']);
  }

  // ---- paket: neravnomeran trejd (samo moj deo; izbačeni i waiver već su u zbirovima) ----
  let real = '', candidate = null;
  if (me) {
    const plan = rosterPlan('my');
    const sp = slotPlan('my');
    const names = ids => joinList(ids.map(id => esc(state.byId.get(id)?.name || '?')));
    if (sp.dropSlots > 0) {
      if (sp.drops.length) {
        real = rt('real', { give: `${names(sendIds)} + ${names(sp.drops)}`, get: names(recvIds) });
        const drop = playerFacts(state.byId.get(sp.drops[0]));
        const dp = minPer([...recv, drop]);
        const weakest = [...recv].sort((a, b) => minIn(a, dp) - minIn(b, dp))[0];
        if (weakest && drop.dur && weakest.dur) {
          const better = minIn(weakest, dp) >= minIn(drop, dp) && weakest.dur.pct >= drop.dur.pct;
          add(better ? pluses : risks, better ? 2.5 : 6.5, rt('dropVs', {
            drop: esc(drop.p.name), dm: minTxt(minIn(drop, dp)), dg: drop.dur.gp, dn: drop.dur.n,
            inc: esc(weakest.p.name), im: minTxt(minIn(weakest, dp)), ig: weakest.dur.gp, in: weakest.dur.n, per: perTxt(dp),
          }), ['future', 'gp']);
        }
        const regular = recv.every(f => f.dur && f.dur.pct >= REPORT.GP_GOOD && (f.minR ?? f.minS ?? 0) >= REPORT.REGULAR_MIN);
        const benchDrop = (drop.minR ?? drop.minS ?? 0) < REPORT.BENCH_MIN || (drop.dur && drop.dur.pct < REPORT.GP_BAD);
        if (regular && benchDrop && recv.length >= 2) add(pluses, 1.5, rt('regularPack', { n: recv.length === 2 ? (LANG === 'en' ? 'Two' : 'Dva') : recv.length }, seed), ['future', 'gp']);
      } else if (plan?.tradeTouches && plan.pre.length > ROSTER.ACTIVE) {
        // kandidat za izbacivanje: najmanje minuta poslednjih 15 dana, bez igrača iz trejda i OUT igrača koji mogu na slobodno IR mesto
        const trade = takenIds();
        const freeIR = irOn && irCount(plan.r) < ROSTER.IR;
        const pool = plan.pre.filter(id => !trade.has(id)).map(id => state.byId.get(id)).filter(Boolean)
          .filter(p => !(freeIR && canIR(p))).map(playerFacts);
        const cp = minPer(pool);
        const c = pool.sort((a, b) => minIn(a, cp) - minIn(b, cp))[0];
        if (c) candidate = { id: c.p.id, text: rt('candidate', { name: esc(c.p.name), per: perTxt(cp), m: minTxt(minIn(c, cp)), give: `${names(sendIds)} + ${esc(c.p.name)}`, get: names(recvIds) }) };
        add(risks, 9, rt('overLimit', { n: plan.pre.length, max: ROSTER.ACTIVE }));
      } else if (plan?.tradeTouches) {
        add(pluses, 3.5, rt('room', { who: names(plan.incoming.length ? plan.incoming : recvIds), n: plan.pre.length, max: ROSTER.ACTIVE }, seed), ['future']);
      }
    } else if (sp.waiverSlots > 0) {
      real = spotMode() === 'none' ? rt('real', { give: names(sendIds), get: names(recvIds) }) : rt('real', { give: names(sendIds), get: `${names(recvIds)} + ${sp.waivers.length ? names(sp.waivers) : rt('freeSpot')}` });
      const regularOut = send.filter(f => f.dur && f.dur.pct >= REPORT.GP_GOOD && (f.minR ?? f.minS ?? 0) >= REPORT.REGULAR_MIN);
      if (regularOut.length >= 2 || (regularOut.length && send.length > recv.length)) add(risks, 5.5, rt('depth', { list: joinList(regularOut.map(f => esc(f.p.name))) }, seed), ['depth']);
    }
  }

  // ---- stanje tima menja naglasak ----
  const ts = me ? teamSituation(lg)?.state : null; // izabrano stanje, ili procena iz tabele
  const seasonLong = ['roto', 'season_points'].includes(FMT_ACTIVE.scoringType);
  const shift = it => {
    let pri = it.pri;
    if (ts === 'rebuild') { if (it.tags.includes('future')) pri -= 2.2; if (it.tags.includes('bestOut')) pri += 20; }
    if (ts === 'contend') { if (it.tags.includes('now') || it.tags.includes('gp')) pri -= 2.2; if (it.tags.includes('bestOut')) pri = -1; }
    if (seasonLong && it.tags.includes('gp')) pri -= 1.5; // roto i poeni za celu sezonu: odigrane utakmice znače više
    return pri;
  };
  const order = list => list.map((it, i) => ({ ...it, i, p2: shift(it) })).sort((a, b) => a.p2 - b.p2 || a.i - b.i);
  const uniq = list => { const seen = new Set(); return list.filter(it => !seen.has(it.text) && seen.add(it.text)); };
  return { pluses: uniq(order(pluses)), risks: uniq(order(risks)), real, candidate, posLine };
}

/** Izveštaj kao podaci (koristi ga i prikaz i tekst za AI) */
function buildReport(totals, cmp) {
  if (cmp.active.length < 2) return null;
  const names = ids => ids.map(id => state.byId.get(id)?.name).filter(Boolean).join(', ');
  const my = reportItems('my', totals, cmp);
  const res = {
    head: rt('head', { get: esc(names(getIds())), give: esc(names(giveIds())) }),
    real: my.real, candidate: my.candidate, posLine: my.posLine, ctx: reportContext(),
    pluses: my.pluses.slice(0, REPORT.MAX_PLUS), risks: my.risks.slice(0, REPORT.MAX_RISK), opp: null,
  };
  const oppR = currentLeague() ? rosterOf('opp') : null;
  if (oppR) {
    const o = reportItems('opp', totals, cmp);
    res.opp = { name: oppR.name || rt('oppAnon'), pluses: o.pluses.slice(0, REPORT.OPP_PLUS), risks: o.risks.slice(0, REPORT.OPP_RISK) }; // samo za tekst za AI (ugao protivnika); u običnom izveštaju se ne prikazuje
  }
  return res;
}

/** Redovi konteksta: situacija iz tabele i profil tima u odnosu na ligu */
function reportContext() {
  const out = [...leagueReportLines()]; // uvezena liga: tabela, plasman oba tima, procena
  const sit = teamSituation();
  if (sit) {
    const table = sit.rank && sit.teams ? rt('sitTable', { rank: sit.rank, teams: sit.teams, rec: sit.record ? rt('sitRec', { r: esc(sit.record) }) : '', po: sit.inPO == null ? '' : rt(sit.inPO ? 'sitIn' : 'sitOut') })
      : sit.record ? `${LANG === 'en' ? 'Record' : 'Skor'} ${esc(sit.record)}. ` : '';
    const opposite = sit.explicit && sit.inferred && sit.explicit !== sit.inferred && [sit.explicit, sit.inferred].includes('contend') && [sit.explicit, sit.inferred].includes('rebuild');
    out.push(rt('sitLine', { table, state: stateLabel(sit.state), how: sit.explicit ? (opposite ? rt('sitMismatch', { s: stateLabel(sit.inferred) }) : '') : rt('sitGuess') }));
  }
  const prof = myTeamProfile();
  if (prof && (prof.strong.length || prof.weak.length)) {
    const s = prof.strong.slice(0, 3).map(x => x.c.label).join(', '), w = prof.weak.slice(0, 3).map(x => x.c.label).join(', ');
    out.push(s ? rt('teamLine', { strong: s, weakPart: w ? rt('weakPart', { weak: w }) : '' }) : rt('teamLineWeak', { weak: w }));
  }
  return out;
}

function reportListHTML(cls, title, items) {
  if (!items.length) return '';
  return `<div class="rp-block ${cls}"><div class="rp-t">${title}</div><ul>${items.map(it =>
    `<li${it.tip ? ` class="has-tip" data-tip="${esc(rt('newsTip'))}" data-tip-html="${esc(it.tip)}"` : ''}>${it.text}${it.tip ? ' <span class="rp-i">ⓘ</span>' : ''}</li>`).join('')}</ul></div>`;
}

/** Zbir vrednosti strana trejda po utakmici (informativno; presuda ostaje po kategorijama ili FPts): { give, get }.
    Vrednost za ostatak sezone (playerRestValue) se ne prikazuje, koriste je budući alati. */
function tradeValueSums() {
  const sum = (ids, fn) => { const xs = ids.map(id => fn(state.byId.get(id))).filter(v => v != null); return xs.length ? xs.reduce((a, b) => a + b, 0) : null; };
  return { give: sum(giveIds(), p => playerValue(p)?.total ?? null), get: sum(getIds(), p => playerValue(p)?.total ?? null) };
}
const valUnit = v => (isPointsFmt() ? `${fmtVal(v)} FPts` : fmtVal(v));
function reportValueHTML() {
  const V = tradeValueSums();
  if (V.give == null && V.get == null) return '';
  return `<div class="rp-value"><div>${t('Ukupna vrednost: daješ {a}, dobijaš {b}', { a: valUnit(V.give), b: valUnit(V.get) })}${isPointsFmt() ? ` <span class="hint">${t('(iznad zamene, po utakmici)')}</span>` : ''}</div>
    <p class="rp-vnote">${t('Informativno. Zbir ne uzima u obzir da strana koja dobija više igrača mora nekoga da otpusti.')}</p></div>`;
}
function renderReport(totals, cmp) {
  const el = $('#report');
  const r = buildReport(totals, cmp);
  ensureReportData();
  if (!r) { el.innerHTML = ''; return; }
  state.lastReport = r;
  const missing = cmp.active.flatMap(i => totals[i].missing);
  el.innerHTML = `<div class="section-t">${t('Izveštaj')}</div>
    <div class="report rp">
      ${r.ctx.length ? `<div class="rp-ctx">${r.ctx.map(x => `<div>${x}</div>`).join('')}</div>` : ''}
      <div class="rp-head">${r.head}</div>
      ${r.real ? `<div class="rp-real">${r.real}</div>` : ''}
      ${r.posLine ? `<div class="rp-real">${r.posLine}</div>` : ''}
      ${r.candidate ? `<div class="rp-cand"><span>${r.candidate.text}</span> <button type="button" class="btn small" data-action="pick-drop" data-id="${r.candidate.id}">${rt('pickHim')}</button></div>` : ''}
      ${reportValueHTML()}
      ${reportListHTML('plus', rt('plus'), r.pluses)}
      ${reportListHTML('risk', rt('risk'), r.risks)}
      ${!r.pluses.length && !r.risks.length ? `<p class="hint">${rt('noData')}</p>` : ''}
      ${missing.length ? `<p class="hint">${t('Napomena: bez podataka za ovaj period i ne računaju se: {list}.', { list: missing.map(esc).join(', ') })}</p>` : ''}
      <p class="rp-note">${rt('ruleNote', { src: DATA_SOURCE.name })}</p>
    </div>
    <div id="aicopy"></div>`;
  renderAICopy();
}

/* =====================================================================
   Kopiraj za AI analizu: svi podaci + uputstvo kao običan tekst, za lepljenje u bilo koji AI čet.
   Na sajtu nema AI-a ni API ključeva. Sve se čita iz aktivne lige i aktivnog taba.
   ===================================================================== */
const AI = { MAX_CHARS: 12000, NEWS_SENTENCES: 2 };
const L = (sr, en) => (LANG === 'en' ? en : sr);
const STATUS_TXT = {
  ACTIVE: ['aktivan', 'active'], DAY_TO_DAY: ['DTD (dnevna procena)', 'DTD (day-to-day)'], QUESTIONABLE: ['upitan', 'questionable'],
  PROBABLE: ['verovatno igra', 'probable'], DOUBTFUL: ['verovatno ne igra', 'doubtful'], OUT: ['OUT (van stroja)', 'OUT'], INJURY_RESERVE: ['IR (povređen)', 'injured reserve'], SUSPENSION: ['suspendovan', 'suspended'],
};
const statusTxt = p => { const st = playerStatus(p), s = STATUS_TXT[st.inj]; return `${st.lb || (s ? L(s[0], s[1]) : st.inj)}${st.espn ? ' (ESPN)' : ''}`; };
const n1 = v => (v == null ? '-' : (+v).toFixed(1));
const n1m = v => (v == null ? '-' : `${v < -0.05 ? '−' : ''}${Math.abs(v).toFixed(1)}`); // pravi minus
const pct3 = v => (v == null ? '-' : fmtPct(v));
/** Prve rečenice teksta (kraj rečenice = . ! ? pa razmak i veliko slovo; "averaging 23.5" se ne seče) */
const firstSentences = (s, n) => String(s || '').trim().split(/(?<=[.!?])\s+(?=[A-Z"“(])/).slice(0, n).join(' ').trim();
const aiDate = iso => (LANG === 'en' ? new Date(iso).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' }) : euDate(iso, { year: true }));

/** Kategorije jednog reda statistike, npr. "PTS 23.9, REB 6.1, ... FG% .500 (7.8/15.5), FT% .720 (6.4/8.9)" */
function catLineTxt(st, proj = false) {
  if (!st || !(st.GP > 0)) return L('nema podataka', 'no data');
  return CATS.map(c => {
    if (proj && c.noProj) return `${c.label} -`; // projekcija nema ovu statistiku
    const v = catValue(st, c);
    return c.type === 'pct' ? `${c.label} ${fmtCat(c, v)} (${n1(st[c.made])}/${n1(st[c.att])})` : `${c.label} ${fmtCat(c, v)}`;
  }).join(', ');
}
/** Liga na poene: FPts igrača po periodima (sezona, 30, 15, 7 dana, projekcija) */
function fptsPeriodsTxt(p) {
  return PERIODS.map(x => { const s = statOf(p, x.key); return s ? `${x.label.toLowerCase()} ${n1(fptsOf(s))}` : null; }).filter(Boolean).join(' · ');
}
/** Bodovanje lige na poene, npr. "PTS 1, 3PM 1, FGM 2, FGA −1" */
const weightsTxt = f => Object.entries(f.weights).map(([k, w]) => `${STAT_BY_ID.get(k)?.label || k} ${fmtNum(w)}`).join(', ');
/** Rečenice o formatu lige za AI (C5) */
function aiFormatSentences(f = FMT_ACTIVE) {
  const out = [];
  if (isPointsType(f.scoringType)) {
    out.push(f.scoringType === 'season_points'
      ? L(`Liga na poene (zbir cele sezone). Bodovanje: ${weightsTxt(f)}.`, `Points league (season total). Scoring: ${weightsTxt(f)}.`)
      : L(`Liga na poene (H2H). Bodovanje: ${weightsTxt(f)}.`, `Points league (H2H). Scoring: ${weightsTxt(f)}.`));
    out.push(L('Proceni trejd po fantasy poenima po utakmici, dostupnosti i rasporedu, ne po kategorijama.', 'Evaluate the trade by fantasy points per game, availability and schedule, not by categories.'));
    if (f.scoringType === 'season_points') out.push(L('Poeni se sabiraju cele sezone, pa je broj odigranih utakmica presudan.', 'Points add up over the whole season, so the number of games played is decisive.'));
  } else {
    const cats = CATS.map(c => c.label).join(', ');
    const inv = CATS.filter(c => c.lowerIsBetter).map(c => c.label);
    const catTxt = `${cats}${inv.length ? L(` (${inv.join(', ')}: manje je bolje)`, ` (${inv.join(', ')}: lower is better)`) : ''}`;
    const ratios = CATS.filter(c => c.type === 'pct').map(c => c.label);
    const ratioTxt = ratios.length ? ' ' + L(`${joinList(ratios)} se računa${ratios.length > 1 ? 'ju' : ''} ponderisano (zbir brojioca / zbir imenioca, npr. ukupno pogođeno / ukupno pokušano).`,
      `${joinList(ratios)} ${ratios.length > 1 ? 'are' : 'is'} weighted (total numerator / total denominator, e.g. total made / total attempted).`) : '';
    if (f.scoringType === 'roto') {
      out.push(L(`Ovo je Roto liga: poredak se određuje po sezonskim zbirovima u svakoj kategoriji, pa su dostupnost i broj utakmica igrača presudni. Kategorije: ${catTxt}.${ratioTxt}`,
        `This is a Roto league: standings are set by season totals in each category, so player availability and games played are decisive. Categories: ${catTxt}.${ratioTxt}`));
    } else {
      out.push(L(`Liga je H2H, svaka kategorija je posebna pobeda. Kategorije: ${catTxt}.${ratioTxt}`, `The league is H2H, each category is a separate win. Categories: ${catTxt}.${ratioTxt}`));
      if (f.scoringType === 'h2h_most') {
        out[0] = out[0].replace(L('svaka kategorija je posebna pobeda', 'each category is a separate win'), L('pobeđuje tim koji osvoji više kategorija', 'the team that wins more categories wins the week'));
        out.push(L('Nedeljni meč nosi samo jednu pobedu, pa je cilj osvojiti većinu kategorija; puntovanje je češće i isplativije.', 'The weekly matchup is worth a single win, so the goal is to take most categories; punting is more common and pays off more.'));
      }
    }
  }
  if (f.unsupported.length) out.push(L(`Liga boduje i ${joinList(f.unsupported)}, te statistike nisu u podacima ispod.`, `The league also scores ${joinList(f.unsupported)}, those stats are not in the data below.`));
  const pm = projMissing();
  if (pm.length) out.push(L(`Projekcija nema: ${pm.join(', ')}, pa se za izabrani period ne računaju.`, `The projection lacks: ${pm.join(', ')}, so they are not counted for the selected period.`));
  return out.join(' ');
}
const statOf = (p, key) => { const s = p.stats[PERIODS.find(x => x.key === key).statId(CONFIG.SEASON)]; return s && s.GP > 0 ? s : null; };

/** Blok jednog igrača u trejdu */
function aiPlayerBlock(p, tag = '') {
  const f = playerFacts(p);
  const lines = [`- ${p.name}${tag ? ` [${tag}]` : ''} (${p.team}, ${posTxt(p)})`];
  const pv = playerValue(p);
  if (pv) lines.push(`  ${L('Vrednost', 'Value')} (${PERIODS.find(x => x.key === state.period).label.toLowerCase()}): ${isPointsFmt() ? L(`${fmtVal(pv.total)} FPts iznad zamene po utakmici`, `${fmtVal(pv.total)} FPts above replacement per game`) : L(`${fmtVal(pv.total)} (zbir z-score po kategorijama lige, 0 = prosečan igrač sa rostera)`, `${fmtVal(pv.total)} (sum of z-scores across league categories, 0 = average rostered player)`)}, #${pv.rank}${pv.small ? L(' (mali uzorak)', ' (small sample)') : ''}${pv.by ? ` · ${Object.entries(pv.by).sort((a, b) => b[1] - a[1]).map(([k, z]) => `${leagueValues().cats.find(c => c.key === k)?.label || k} ${fmtVal(z)}`).join(', ')}` : ''}`);
  lines.push(`  ${L('Pozicije', 'Positions')}: ${posList(p).join(', ')}${posList(p).length > 1 ? L(' (može na više mesta u postavi)', ' (fits several lineup spots)') : ''} · ${L('Status', 'Status')}: ${statusTxt(p)}`);
  const gp = [];
  if (f.dur) gp.push(L(`ova sezona ${f.dur.gp}/${f.dur.n} (${Math.round(f.dur.pct * 100)}%)`, `this season ${f.dur.gp}/${f.dur.n} (${Math.round(f.dur.pct * 100)}%)`));
  if (p.prevGP != null) gp.push(L(`prošla sezona ${Math.round(p.prevGP)}/${CONFIG.PREV_SEASON_GAMES} (${Math.round(p.prevGP / CONFIG.PREV_SEASON_GAMES * 100)}%)`, `last season ${Math.round(p.prevGP)}/${CONFIG.PREV_SEASON_GAMES} (${Math.round(p.prevGP / CONFIG.PREV_SEASON_GAMES * 100)}%)`));
  if (gp.length) lines.push(`  GP%: ${gp.join(' · ')}`);
  const mins = MINUTES.TREND_KEYS.map(k => { const s = statOf(p, k); return s ? `${PERIODS.find(x => x.key === k).label.toLowerCase()} ${n1(s.MIN)}` : null; }).filter(Boolean);
  if (mins.length) lines.push(`  MIN: ${mins.join(' · ')}`);
  if (isPointsFmt()) lines.push(`  ${L('FPts po utakmici', 'FPts per game')}: ${fptsPeriodsTxt(p) || '-'}`);
  lines.push(`  ${L('Sezona', 'Season')}: ${catLineTxt(statOf(p, 'season'))}`);
  const r = statOf(p, 'l15');
  if (r) lines.push(`  ${L('Poslednjih 15 dana', 'Last 15 days')} (${Math.round(r.GP)} ${L('ut.', 'g')}): ${catLineTxt(r)}`);
  const pr = statOf(p, 'proj');
  if (pr) lines.push(`  ${L('Projekcija za sezonu', 'Season projection')}: ${catLineTxt(pr, true)}`);
  if (f.missed) lines.push(`  ${L('Propustio utakmica tima zaredom', 'Missed team games in a row')}: ${f.missed}`);
  const rk = CATS.filter(c => !isPointsFmt() || c.fpts).map(c => ({ c, r: bench().ranks[c.key].get(p.id) })).filter(x => x.r);
  if (rk.length) lines.push(`  ${L(`Rang u ligi (od ${bench().total} igrača, izabrani period)`, `League rank (of ${bench().total} players, selected period)`)}: ${rk.map(x => `${x.c.label} #${x.r}`).join(', ')}`);
  if (p.own) { const ch = Math.abs(p.own.chg) < 0.05 ? '0.0' : `${p.own.chg > 0 ? '+' : '−'}${Math.abs(p.own.chg).toFixed(1)}`; lines.push(`  ${L('% u ligama', '% rostered')}: ${n1(p.own.pct)}% (${ch} ${L('za 7 dana', 'over 7 days')})`); }
  return lines.join('\n');
}

function aiRosterLine(id, ir) {
  const p = state.byId.get(id); if (!p) return null;
  const f = playerFacts(p);
  return `- ${p.name} (${p.team}, ${posTxt(p)})${injOf(p) !== 'ACTIVE' ? ` · ${statusTxt(p)}` : ''} · MIN ${n1(f.minS)}${f.minR != null ? ` / 15d ${n1(f.minR)}` : ''}${f.dur ? ` · GP% ${Math.round(f.dur.pct * 100)}%` : ''} · ${catLineTxt(f.S)}${ir ? ' · IR' : ''}`;
}

/** Zbir tima po kategorijama (aktivni igrači) */
const teamVals = ids => sumPlayers(ids).vals;
const valTxt = (c, v) => fmtCat(c, v);

/** Tri najjače i tri najslabije kategorije mog tima, samo ako postoje bar 3 uneta tima (z-score zbira) */
function teamProfile(myIds) {
  const teams = [myIds, ...Object.values(state.rosters.opps || {}).map(r => r.players.filter(x => !x.ir).map(x => x.id))].filter(x => x.length);
  if (teams.length < 3) return null;
  const vals = teams.map(teamVals);
  const z = CATS.filter(c => !isPunt(c)).map(c => {
    const arr = vals.map(v => v[c.key]).filter(v => v != null);
    const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
    const sd = Math.sqrt(arr.reduce((a, b) => a + (b - mean) ** 2, 0) / arr.length) || 1;
    const zz = ((vals[0][c.key] ?? mean) - mean) / sd;
    return { c, z: c.lowerIsBetter ? -zz : zz };
  }).sort((a, b) => b.z - a.z);
  return { best: z.slice(0, 3).map(x => x.c.label), worst: z.slice(-3).reverse().map(x => x.c.label), n: teams.length };
}

/** 4.1 Uputstvo za AI, sastavljeno iz aktivne lige */
function aiInstructions(uneven) {
  const lg = currentLeague();
  const plan = lg ? rosterPlan('my') : null;
  const sp = slotPlan('my');
  // "predloži koga da izbacim" samo kad izbacivanje treba, a nije izabrano (ili roster nije unet)
  const askDrop = sp.dropSlots > 0 && !sp.drops.length && (!plan?.tradeTouches || plan.pre.length > ROSTER.ACTIVE);
  const pts = isPointsFmt();
  const out = [L('Ti si iskusan analitičar za fantasy NBA košarku.', 'You are an experienced fantasy NBA basketball analyst.')];
  if (!lg) {
    out.push(L(`Nemam podatke o ligi i rosteru korisnika. Format za poređenje: ${formatShort(FMT_ACTIVE)}. Proceni trejd samostalno i reci koja pitanja bi promenila odgovor.`,
      `I have no data about the user's league or roster. Comparison format: ${formatShort(FMT_ACTIVE)}. Evaluate the trade on its own and say which questions would change your answer.`));
    out.push(`${aiFormatSentences()} ${L('Trejdovi se rade na duže staze, za ostatak sezone.', 'Trades are made for the long run, for the rest of the season.')}`);
  } else {
    const ir = ROSTER.IR;
    out.push(L(`Liga: ${lgName(lg)}, platforma ${platformLabel(lg.platform)}, format ${formatShort(leagueFormatOf(lg))}, ${lg.teams} timova.`,
      `League: ${lgName(lg)}, platform ${platformLabel(lg.platform)}, format ${formatShort(leagueFormatOf(lg))}, ${lg.teams} teams.`));
    out.push(aiFormatSentences());
    out.push(L(`Roster: ${ROSTER.ACTIVE} aktivnih mesta${ir ? ` + ${ir} IR mesta` : ''}. Trejdovi se rade na duže staze, za ostatak sezone.`,
      `Roster: ${ROSTER.ACTIVE} active spots${ir ? ` + ${ir} IR spots` : ''}. Trades are made for the long run, for the rest of the season.`));
    if (lg.teamName) out.push(L(`Moj tim: ${lg.teamName}.`, `My team: ${lg.teamName}.`));
    const st = lg.standings || {};
    const parts = [];
    if (st.rank) parts.push(L(`Trenutno sam ${st.rank}. od ${lg.teams} timova`, `I am currently ${st.rank} of ${lg.teams} teams`));
    if (st.record) parts.push(L(`skor ${st.record}`, `record ${st.record}`));
    const sentences = parts.length ? [parts.join(', ') + '.'] : [];
    if (st.playoffTeams) sentences.push(L(`U plejof ide ${st.playoffTeams} timova${st.playoffWeek ? `, plejof počinje u ${st.playoffWeek}. nedelji` : ''}.`, `${st.playoffTeams} teams make the playoffs${st.playoffWeek ? `, which start in week ${st.playoffWeek}` : ''}.`));
    else if (st.playoffWeek) sentences.push(L(`Plejof počinje u ${st.playoffWeek}. nedelji.`, `The playoffs start in week ${st.playoffWeek}.`));
    if (sentences.length) out.push(`${sentences.join(' ')} ${L('Proceni da li mi treba pomoć odmah ili mogu da igram na duže staze.', 'Judge whether I need help right away or can play the long game.')}`);
    const tsx = TEAM_STATES.find(s => s.id === lg.teamState);
    if (tsx) out.push(L(`Stanje mog tima: ${t(tsx.sr)}.`, `My team's situation: ${t(tsx.sr)}.`));
    if (state.punt.size) out.push(L(`Puntujem: ${CATS.filter(isPunt).map(c => c.label).join(', ')}. Te kategorije se ne računaju.`, `I am punting: ${CATS.filter(isPunt).map(c => c.label).join(', ')}. Those categories do not count.`));
    if (lg.note) out.push(L(`Napomena: ${lg.note}`, `Note: ${lg.note}`));
    if (isSynced(lg)) out.push(pts
      ? L('Imaš podatke cele lige: tabelu i poene svih timova. Iskoristi ih: koliko sam blizu plejofa ili vrha, koliko je protivnik blizu, i da li mu trejd realno pomaže s obzirom na njegov plasman.',
        'You have data for the whole league: standings and points of every team. Use it: how close I am to the playoffs or the top, how close the opponent is, and whether the trade really helps them given their position.')
      : L('Imaš podatke cele lige: tabelu, plasman svakog tima po kategorijama i lidere lige. Iskoristi ih: koliko sam blizu plejofa ili vrha, u kojim kategorijama realno mogu da dobijem ili izgubim mesta u ligi, gde mi mali dobitak ništa ne menja jer sam daleko od susednog tima, šta treba protivniku s obzirom na njegov plasman i da li mu ovaj trejd pomaže.',
        'You have data for the whole league: standings, every team\'s rank in each category and the league leaders. Use it: how close I am to the playoffs or the top, in which categories I can realistically gain or lose places in the league, where a small gain changes nothing because I am far from the next team, what the opponent needs given their position and whether this trade helps them.'));
  }
  out.push(L('Proceni ovaj trejd iz moje perspektive. Najvažniji kriterijumi: minutaža i uloga igrača sada i u budućnosti, zdravlje i pouzdanost, pa tek onda trenutne brojke.',
    'Evaluate this trade from my perspective. Most important criteria: each player\'s minutes and role now and going forward, health and reliability, and only then current numbers.'));
  if (lg && pts) out.push(L(`Analiziraj kako se igrači koje dobijam uklapaju u moj roster: pozicije, koliko poena po utakmici donose i od kojih statistika, dostupnost i broj utakmica, da li dupliram ono što već imam, i da li mi roster${ROSTER.IR ? ' i IR mesta' : ''} dozvoljava${ROSTER.IR ? 'ju' : ''} ovaj trejd.`,
    `Analyze how the players I get fit my roster: positions, how many points per game they bring and from which stats, availability and games played, whether I am doubling up on what I already have, and whether my roster${ROSTER.IR ? ' and IR spots' : ''} allow this trade.`));
  else if (lg) out.push(L(`Analiziraj kako se igrači koje dobijam uklapaju u moj roster: pozicije, kategorije u kojima sam već jak ili slab, da li dupliram ono što već imam, i da li mi roster${ROSTER.IR ? ' i IR mesta' : ''} dozvoljava${ROSTER.IR ? 'ju' : ''} ovaj trejd.`,
    `Analyze how the players I get fit my roster: positions, categories where I am already strong or weak, whether I am doubling up on what I already have, and whether my roster${ROSTER.IR ? ' and IR spots' : ''} allow this trade.`));
  out.push(L('Igrači sa više pozicija (npr. PF/C) lakše se uklapaju u postavu: računaj to kao blagu prednost u odnosu na igrača sa jednom pozicijom.',
    'Players with more than one position (e.g. PF/C) are easier to fit into a lineup: count that as a slight edge over a player with a single position.'));
  if (uneven) out.push(lg
    ? L(`Trejd nije ravnomeran, proceni ga kao paket: računaj i igrača koga izbacujem ili dodajem sa waivera.${askDrop ? ' Nisam naveo koga izbacujem, predloži koga sa rostera da izbacim i zašto.' : ''} Uporedi šta je bolje za moj tim: jedan jači igrač ili više solidnih koji igraju redovno, s obzirom na stanje mog tima, veličinu rostera i ${pts ? 'poene koji mi trebaju' : 'kategorije koje mi trebaju'}.`,
      `The trade is uneven, so evaluate it as a package: count the player I drop or add from waivers.${askDrop ? ' I have not said who I drop, so suggest who from my roster to drop and why.' : ''} Compare what is better for my team: one stronger player or several solid players who play regularly, given my team's situation, roster size and ${pts ? 'the points I need' : 'the categories I need'}.`)
    : L('Trejd nije ravnomeran, proceni ga kao paket: računaj i igrača koji se izbacuje ili dodaje sa waivera. Uporedi šta je bolje: jedan jači igrač ili više solidnih koji igraju redovno.',
      'The trade is uneven, so evaluate it as a package: count the player who gets dropped or added from waivers. Compare what is better: one stronger player or several solid players who play regularly.'));
  out.push(L(`Ako možeš da pretražuješ internet, proveri najnovije vesti za sve igrače u trejdu, a posebno pažljivo za igrače koje dobijam${lg ? ', kao i za ključne igrače mog rostera' : ''}: povrede, promene uloge, glasine o trejdovima u NBA. Navedi šta si našao i od kog datuma. Ako ne možeš da pretražuješ internet, reci to na početku i osloni se na vesti ispod.`,
    `If you can browse the internet, check the latest news for every player in the trade, and especially carefully for the players I get${lg ? ', as well as the key players on my roster' : ''}: injuries, role changes, NBA trade rumors. Say what you found and from what date. If you cannot browse, say so at the start and rely on the news below.`));
  out.push(L('Budi iskren, i kad je trejd loš za mene, reci.', 'Be honest, and if the trade is bad for me, say so.'));
  const oppKnown = !!(lg && rosterOf('opp')?.players.length);
  out.push(oppKnown
    ? L(`Planiram da pošaljem ovu ponudu, pa na kraju pogledaj trejd i iz ugla protivnika. Njegov roster je ispod: proceni kako trejd menja njegov tim (${pts ? 'poeni' : 'kategorije'}, pozicije, dubina, povrede) i da li mu odgovara.`,
      `I plan to send this offer, so at the end look at the trade from the opponent's side too. Their roster is below: judge how the trade changes their team (${pts ? 'points' : 'categories'}, positions, depth, injuries) and whether it suits them.`)
    : L('Planiram da pošaljem ovu ponudu, pa na kraju pogledaj trejd i iz ugla druge strane. Nemam njegov roster, pa razmišljaj kao tipičan menadžer i reci šta bi o njegovom timu trebalo da znam da bi procena bila tačnija.',
      'I plan to send this offer, so at the end look at the trade from the other side too. I do not have their roster, so think like a typical manager and say what I should know about their team to make the read more accurate.'));
  // Ugao protivnika: opisno, sa razlozima, šta mu se neće svideti, šta bi tražio, da li se isplati i zamenski trejdovi
  const syncedOpp = !!(lg && isSynced(lg) && oppKnown);
  const posTxt = syncedOpp ? L(` i svoj plasman u ligi iz odeljka CELA LIGA (${pts ? 'mesto na tabeli i poeni' : 'mesto na tabeli i gde je jak ili slab po kategorijama'}): da li se bori za plejof ili vrh, ili mu više znače budući igrači`,
    ` and their place in the league from the WHOLE LEAGUE section (${pts ? 'standings and points' : 'standings and where they are strong or weak by category'}): whether they are fighting for the playoffs or the top, or care more about future value`) : '';
  const oppSub = oppKnown
    ? L([`Kako i zašto bi mogao da razmišlja o ovoj ponudi, s obzirom na svoj roster${posTxt}.`,
        'Šta mu se verovatno neće svideti i zbog čega bi mogao da odbije.',
        'Šta bi mogao da traži zauzvrat ili kao dodatak, gledajući moj i njegov roster: koji igrač sa mog rostera mu realno treba i zašto.',
        'Da li se meni isplati da mu to dam: šta gubim, šta dobijam ako trejd prođe, i gde je granica posle koje treba odustati.',
        'Zamenski trejdovi: 1 do 3 konkretna predloga sa imenima igrača sa mog i njegovog rostera, koji bi njemu bili prihvatljiviji, a meni i dalje dobri, uz jednu rečenicu zašto.'],
      [`How and why they might think about this offer, given their roster${posTxt}.`,
        'What they will probably not like and why they might decline.',
        'What they might ask for in return or as an add-on, looking at my roster and theirs: which player from my roster they really need and why.',
        'Whether it is worth it for me to give that: what I lose, what I gain if the trade goes through, and where the line is after which I should walk away.',
        'Alternative trades: 1 to 3 concrete offers naming players from my roster and theirs that they would accept more easily and that are still good for me, with one sentence on why.'])
    : L(['Kako bi tipičan menadžer razmišljao o ovoj ponudi i zašto.',
        'Šta mu se verovatno neće svideti i zbog čega bi mogao da odbije.',
        'Šta bi mogao da traži zauzvrat ili kao dodatak, gledajući moj roster.',
        'Da li se meni isplati da mu to dam i gde je granica posle koje treba odustati.',
        'Zamenski trejdovi: 1 do 3 konkretna predloga sa igračima sa mog rostera, i šta bi trebalo da znam o njegovom timu da predlozi budu tačniji.'],
      ['How a typical manager would think about this offer and why.',
        'What they will probably not like and why they might decline.',
        'What they might ask for in return or as an add-on, looking at my roster.',
        'Whether it is worth it for me to give that, and where the line is after which I should walk away.',
        'Alternative trades: 1 to 3 concrete offers using players from my roster, and what I should know about their team to make them more accurate.']);
  const oppStep = `${L('Ugao protivnika. Ovaj deo napiši opisno, kao da mi objašnjavaš kako razmišlja čovek sa druge strane:', 'The opponent\'s side. Write this part descriptively, as if explaining how the person on the other side thinks:')}\n${oppSub.map((x, i) => `   ${'abcde'[i]}) ${x}`).join('\n')}`;
  out.push(L('Odgovori ovim redom:', 'Answer in this order:'));
  const steps = lg
    ? L(['Kratka preporuka: prihvati / odbij / pregovaraj, u jednoj rečenici', 'Šta dobijam dugoročno', 'Šta rizikujem', 'Uklapanje u moj roster', 'Kako trejd utiče na moj tim po kategorijama', 'Ako je odgovor pregovaraj: najbolji kontra-predlog u jednoj rečenici (ostale opcije daj u uglu protivnika)'],
      ['Short recommendation: accept / decline / negotiate, in one sentence', 'What I gain long term', 'What I risk', 'Fit with my roster', 'How the trade affects my team by category', 'If the answer is negotiate: the best counteroffer in one sentence (give the other options in the opponent\'s side)'])
    : L(['Kratka preporuka: prihvati / odbij / pregovaraj, u jednoj rečenici', 'Šta se dobija dugoročno', 'Šta se rizikuje', 'Pitanja o ligi i rosteru koja bi promenila odgovor', 'Kako trejd utiče po kategorijama', 'Ako je odgovor pregovaraj: najbolji kontra-predlog u jednoj rečenici (ostale opcije daj u uglu protivnika)'],
      ['Short recommendation: accept / decline / negotiate, in one sentence', 'What is gained long term', 'What is at risk', 'Questions about the league and roster that would change the answer', 'How the trade affects each category', 'If the answer is negotiate: the best counteroffer in one sentence (give the other options in the opponent\'s side)']);
  if (lg && isSynced(lg) && !pts) steps[4] = L('Kako trejd utiče na moj tim po kategorijama i na moj plasman u ligi', 'How the trade affects my team by category and my place in the league');
  if (pts) steps[4] = lg ? L('Kako trejd menja fantasy poene mog tima po utakmici', 'How the trade changes my team\'s fantasy points per game') : L('Kako trejd menja fantasy poene po utakmici', 'How the trade changes fantasy points per game');
  steps.push(oppStep);
  out.push(steps.map((s, i) => `${i + 1}. ${s}`).join('\n'));
  out.push(L('Odgovori na srpskom, jasno. Prve tačke kratko, a ugao protivnika opisno i sa razlozima.', 'Reply in English, clearly. Keep the first points short, and write the opponent\'s side descriptively, with reasons.'));
  return out.join('\n');
}

/** Ceo tekst za AI. shortRosterNews: vesti za igrače sa rostera samo naslov i datum (kad je tekst predugačak). */
function buildAIText(shortRosterNews = false) {
  syncCats(); // kolone po formatu aktivne lige (ako tekst nastaje van prikaza)
  const lg = currentLeague(), pts = isPointsFmt();
  const totals = state.teams.map(teamTotals);
  const cmp = FMT().compareSides(totals);
  const sp = slotPlan('my');
  const uneven = sp.dropSlots > 0 || sp.waiverSlots > 0;
  const per = PERIODS.find(p => p.key === state.period).label;
  const S = [];
  const sec = (title, body) => { if (body && body.trim()) S.push(`=== ${title} ===\n${body.trim()}`); };

  sec(L('UPUTSTVO', 'INSTRUCTIONS'), aiInstructions(uneven));

  // 4.2 Liga i kontekst
  const ctx = [];
  if (lg) {
    const st = lg.standings || {};
    ctx.push(`${L('Liga', 'League')}: ${lgName(lg)}`);
    if (lg.teamName) ctx.push(`${L('Moj tim', 'My team')}: ${lg.teamName}`);
    ctx.push(`${L('Platforma', 'Platform')}: ${platformLabel(lg.platform)}`);
    ctx.push(`${L('Format', 'Format')}: ${formatSummary(leagueFormatOf(lg))}`);
    ctx.push(`${L('Broj timova', 'Teams')}: ${lg.teams}`);
    ctx.push(`${L('Roster', 'Roster')}: ${ROSTER.ACTIVE} ${L('aktivnih', 'active')}${ROSTER.IR ? ` + ${ROSTER.IR} IR` : ''}`);
    if (st.rank) ctx.push(`${L('Mesto', 'Place')}: ${st.rank}/${lg.teams}`);
    if (st.record) ctx.push(`${L('Skor', 'Record')}: ${st.record}`);
    if (st.playoffTeams) ctx.push(`${L('Timova u plejofu', 'Playoff teams')}: ${st.playoffTeams}`);
    if (st.playoffWeek) ctx.push(`${L('Nedelja plejofa', 'Playoff week')}: ${st.playoffWeek}`);
    const tsx = TEAM_STATES.find(s => s.id === lg.teamState);
    if (tsx) ctx.push(`${L('Stanje mog tima', 'Team situation')}: ${t(tsx.sr)}`);
    if (state.punt.size) ctx.push(`Punt: ${CATS.filter(isPunt).map(c => c.label).join(', ')}`);
    if (lg.note) ctx.push(`${L('Napomena', 'Note')}: ${lg.note}`);
  } else {
    ctx.push(L(`Brzo poređenje, bez lige. Format: ${formatSummary(FMT_ACTIVE)}`, `Quick compare, no league. Format: ${formatSummary(FMT_ACTIVE)}`));
  }
  if (state.loadedAt) ctx.push(`${L('Podaci od', 'Data as of')}: ${LANG === 'en' ? new Date(state.loadedAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) : euDate(state.loadedAt, { year: true, time: true })}`);
  ctx.push(`${L('Izabrani period za poređenje', 'Selected comparison period')}: ${per}`);
  ctx.push(`${L('Vesti', 'News')}: Rotowire (${L('preko ESPN-a, na engleskom', 'via ESPN')})`);
  sec(L('LIGA I KONTEKST', 'LEAGUE AND CONTEXT'), ctx.join('\n'));
  if (lg && isSynced(lg)) sec(L(`CELA LIGA (uvezeno sa ${SOURCE_LABEL[lg.import.source]})`, `WHOLE LEAGUE (imported from ${SOURCE_LABEL[lg.import.source]})`), leagueAIText());

  // 4.3 Trejd
  const tr = [];
  const block = (title, ids, tag) => { if (ids.length) tr.push(`${title}:\n${ids.map(id => state.byId.get(id)).filter(Boolean).map(p => aiPlayerBlock(p, tag)).join('\n')}`); };
  block(L('DAJEŠ', 'I GIVE'), giveIds());
  block(L('DOBIJAŠ', 'I GET'), getIds());
  block(L('IZBACUJEŠ (sa mog rostera)', 'I DROP (from my roster)'), sp.drops);
  block(L('PROTIVNIK IZBACUJE (sa svog rostera, jer dobija više igrača; računa se u trejd)', 'OPPONENT DROPS (from their roster, because they get more players; counts in the trade)'), slotPlan('opp').drops);
  block(L('MOJ IGRAČ ZA SLOBODNO MESTO (sa waivera, računa se u rezultat)', 'MY PLAYER FOR THE OPEN SPOT (from waivers, counted in the score)'), sp.waivers);
  if (sp.waiverSlots > 0) {
    const m = spotMode(), rest = sp.waiverSlots - sp.waivers.length, real = !!tfBase().slot?.slot;
    const replTxt = real ? L('realna zamena sa waivera (prosek 3. do 5. najboljeg zdravog slobodnog igrača u ligi)', 'a realistic waiver replacement (average of the 3rd to 5th best healthy free agent in the league)') : L('nivo zamene (prosek igrača koje lako nađeš na waiveru)', 'replacement level (average of players you can easily find on waivers)');
    tr.push(m === 'none' ? L('SLOBODNO MESTO: dajem više igrača nego što dobijam, a slobodno mesto se ne računa (poredi se samo ko ide i ko dolazi).', 'OPEN SPOT: I give more players than I get, and the open spot is not counted (only who leaves and who arrives is compared).')
      : rest > 0 ? L(`SLOBODNO MESTO: dajem više igrača nego što dobijam, ${rest > 1 ? `${rest} mesta se računaju` : 'mesto se računa'} kao ${replTxt}.`, `OPEN SPOT: I give more players than I get, ${rest > 1 ? `${rest} spots count` : 'the spot counts'} as ${replTxt}.`) : '');
    if (!tr[tr.length - 1]) tr.pop();
  }
  const VS = tradeValueSums();
  if (VS.give != null || VS.get != null) tr.push(L(`UKUPNA VREDNOST (informativno, presuda je po ${isPointsFmt() ? 'FPts' : 'kategorijama'}): dajem ${valUnit(VS.give)}, dobijam ${valUnit(VS.get)}. Zbir ne uzima u obzir da strana koja dobija više igrača mora nekoga da otpusti.`,
    `TOTAL VALUE (informational, the verdict is by ${isPointsFmt() ? 'FPts' : 'categories'}): I give ${valUnit(VS.give)}, I get ${valUnit(VS.get)}. The sum does not account for the side getting more players having to drop someone.`));
  const rep = state.lastReport;
  if (uneven) {
    if (rep?.real) tr.push(stripTags(rep.real));
    const plan = lg ? rosterPlan('my') : null;
    if (plan?.tradeTouches) tr.push(L(`Mesta na mom rosteru: ${plan.activeBefore.length}/${ROSTER.ACTIVE} pre trejda, ${plan.activeAfter.length}/${ROSTER.ACTIVE} posle${plan.missingDrops ? ` (još nisam izabrao koga izbacujem, bez toga bi bilo ${plan.pre.length}/${ROSTER.ACTIVE})` : ''}.`,
      `Spots on my roster: ${plan.activeBefore.length}/${ROSTER.ACTIVE} before the trade, ${plan.activeAfter.length}/${ROSTER.ACTIVE} after${plan.missingDrops ? ` (I have not picked who to drop yet, without that it would be ${plan.pre.length}/${ROSTER.ACTIVE})` : ''}.`));
  }
  if (cmp.active.length >= 2 && cmp.points) {
    const P = cmp.points;
    const rows = [`FPts: ${L('Daješ', 'Give')} ${n1(P.give)} · ${L('Dobijaš', 'Get')} ${n1(P.get)} · ${L('Razlika', 'Diff')} ${fmtPts(P.diff)}`,
      ...P.contrib.map(x => `${x.c.label} (${fmtNum(x.c.w)} ${L('po jedinici', 'per unit')}): ${L('Daješ', 'Give')} ${x.none ? '-' : n1m(x.give)} · ${L('Dobijaš', 'Get')} ${x.none ? '-' : n1m(x.get)} · ${L('Razlika', 'Diff')} ${x.none ? '-' : fmtPts(x.diff)}`)];
    tr.push(`${L('ODAKLE DOLAZE POENI (FPts po utakmici po statistici, sortirano po razlici', 'WHERE THE POINTS COME FROM (FPts per game by stat, sorted by difference')}, ${per}${uneven ? L(', računa i izbačenog / waiver igrača', ', includes the dropped / waiver player') : ''}):\n${rows.join('\n')}`);
  } else if (cmp.active.length >= 2) {
    const rows = CATS.map(c => {
      const d = totals[GIVE].vals[c.key], g = totals[GET].vals[c.key];
      const diff = d != null && g != null ? fmtDelta(c, g - d).txt : '-';
      const tv = c.type === 'pct' ? myTeamValues(c) : null;
      const team = tv ? ` · ${L('uticaj na moj tim', 'impact on my team')} ${Math.abs(tv.after - tv.before) < TEAM_PCT_TIE ? L('bez promene', 'no change') : fmtDelta(c, tv.after - tv.before).txt}` : '';
      const low = !tv && lowVolume(c, totals) ? ` (${L('mali obim šuteva', 'low shot volume')})` : '';
      return `${c.label}: ${L('Daješ', 'Give')} ${valTxt(c, d)} · ${L('Dobijaš', 'Get')} ${valTxt(c, g)} · ${L('Razlika', 'Diff')} ${diff}${team}${low}${isPunt(c) ? ' · punt' : ''}`;
    });
    tr.push(`${L('POREĐENJE KATEGORIJA', 'CATEGORY COMPARISON')} (${per}${uneven ? L(', računa i izbačenog / waiver igrača', ', includes the dropped / waiver player') : ''}):\n${rows.join('\n')}`);
  }
  sec(L('TREJD', 'TRADE'), tr.join('\n\n'));

  // 4.4 Vesti
  const tradeSet = [...new Set([...giveIds(), ...getIds(), ...sp.drops, ...sp.waivers, ...slotPlan('opp').drops])];
  const nl = [];
  for (const id of tradeSet) {
    const p = state.byId.get(id), items = newsOf(id);
    if (p && items.length) nl.push(`${p.name}:\n${items.map(n => `- ${aiDate(n.published)}: ${n.headline}${n.story ? ` ${firstSentences(n.story, AI.NEWS_SENTENCES)}` : ''}`).join('\n')}`);
  }
  const rosterIdsAll = lg ? [...rosterIds(rosterOf('my')), ...rosterIds(rosterOf('opp'))].filter(id => !tradeSet.includes(id)) : [];
  for (const id of [...new Set(rosterIdsAll)]) {
    const p = state.byId.get(id), items = newsOf(id).filter(n => isRecent(n.published));
    if (p && items.length) nl.push(`${p.name} (${L('roster', 'roster')}):\n${items.map(n => `- ${aiDate(n.published)}: ${n.headline}${!shortRosterNews && n.story ? ` ${firstSentences(n.story, AI.NEWS_SENTENCES)}` : ''}`).join('\n')}`);
  }
  sec(L('VESTI (original, engleski)', 'NEWS'), nl.join('\n\n'));

  // 4.5 Moj roster
  const my = lg ? rosterOf('my') : null;
  if (my && my.players.length) {
    const plan = rosterPlan('my');
    const act = my.players.filter(x => !x.ir), irs = my.players.filter(x => x.ir);
    const lines = [`${L('Zauzetost', 'Occupancy')}: ${act.length}/${ROSTER.ACTIVE} ${L('aktivnih', 'active')}${ROSTER.IR ? `, ${irs.length}/${ROSTER.IR} IR` : ''}`];
    lines.push(...my.players.map(x => aiRosterLine(x.id, x.ir)).filter(Boolean));
    if (plan?.tradeTouches) {
      const before = teamVals(plan.activeBefore), after = teamVals(plan.activeAfter);
      lines.push(`\n${L('Moj tim pre / posle trejda', 'My team before / after the trade')} (${per}):`);
      lines.push(...CATS.map(c => `${c.label}: ${valTxt(c, before[c.key])} → ${valTxt(c, after[c.key])} (${before[c.key] != null && after[c.key] != null ? fmtDelta(c, after[c.key] - before[c.key]).txt : '-'})${isPunt(c) ? ' · punt' : ''}`));
      lines.push(`${L('Zauzetost posle trejda', 'Occupancy after the trade')}: ${plan.activeAfter.length}/${ROSTER.ACTIVE} ${L('aktivnih', 'active')}${ROSTER.IR ? `, ${plan.irIds.filter(id => !plan.dropsRemove.includes(id)).length}/${ROSTER.IR} IR` : ''}`);
    } else if (plan) {
      lines.push(L('\nIgrači iz "Daješ" nisu svi na mom rosteru, pa poređenje pre / posle nije urađeno.', '\nNot all "I give" players are on my roster, so no before / after comparison.'));
    }
    const base = plan ? plan.activeBefore : act.map(x => x.id);
    const prof = teamValsTxt(base);
    lines.push(`\n${L('Profil mog tima (zbir pre trejda)', 'My team profile (totals before the trade)')}: ${prof}`);
    const tz = teamZ(base), b = bench(), enoughTeams = !pts && enteredTeams().length >= 3;
    const zl = CATS.filter(c => !isPunt(c)).map(c => ({ c, z: tz[c.key] })).sort((a, c2) => c2.z - a.z);
    const zf = x => `${x.c.label} ${x.z >= 0 ? '+' : '−'}${Math.abs(x.z).toFixed(1)}`;
    if (enoughTeams) lines.push(L(`Moj tim u odnosu na ligu (zbir z-score-ova po kategoriji, merilo: ${b.size} najposedovanijih igrača; 0 = prosečan tim, + jače, − slabije): ${zl.map(zf).join(', ')}`,
      `My team vs the league (sum of z-scores per category, benchmark: the ${b.size} most rostered players; 0 = average team, + stronger, − weaker): ${zl.map(zf).join(', ')}`));
    const tp = pts ? null : teamProfile(base);
    if (pts) { const top = topPointSources(base); if (top) lines.push(L(`Statistike koje mom timu donose najviše poena: ${top}.`, `Stats that bring my team the most points: ${top}.`)); }
    if (tp) lines.push(L(`Najjače kategorije (u odnosu na ${tp.n} uneta tima): ${tp.best.join(', ')}. Najslabije: ${tp.worst.join(', ')}.`, `Strongest categories (vs ${tp.n} entered teams): ${tp.best.join(', ')}. Weakest: ${tp.worst.join(', ')}.`));
    sec(L('MOJ ROSTER', 'MY ROSTER'), lines.join('\n'));
  }

  // 4.6 Protivnik
  const opp = lg ? rosterOf('opp') : null;
  if (opp && opp.players.length) {
    const act = opp.players.filter(x => !x.ir), irs = opp.players.filter(x => x.ir);
    const lines = [`${L('Protivnik', 'Opponent')}: ${opp.name} · ${act.length}/${ROSTER.ACTIVE} ${L('aktivnih', 'active')}${ROSTER.IR ? `, ${irs.length}/${ROSTER.IR} IR` : ''}`];
    lines.push(...opp.players.map(x => { const p = state.byId.get(x.id); if (!p) return null; const f = playerFacts(p); return `- ${p.name} (${p.team}, ${posTxt(p)})${injOf(p) !== 'ACTIVE' ? ` · ${statusTxt(p)}` : ''} · MIN ${n1(f.minS)}${f.dur ? ` · GP% ${Math.round(f.dur.pct * 100)}%` : ''}${x.ir ? ' · IR' : ''}`; }).filter(Boolean));
    lines.push(`${L('Zbir protivnika', 'Opponent totals')}: ${teamValsTxt(act.map(x => x.id))}`);
    sec(L('PROTIVNIČKI ROSTER', 'OPPONENT ROSTER'), lines.join('\n'));
  }

  // 4.7 Osnovni izveštaj
  if (rep) {
    const li = items => items.map(it => `- ${stripTags(it.text)}`).join('\n');
    const parts = [...(rep.ctx || []).map(stripTags), stripTags(rep.head)];
    if (rep.real) parts.push(stripTags(rep.real));
    if (rep.posLine) parts.push(stripTags(rep.posLine));
    if (rep.candidate) parts.push(stripTags(rep.candidate.text));
    if (rep.pluses.length) parts.push(`${rt('plus')}:\n${li(rep.pluses)}`);
    if (rep.risks.length) parts.push(`${rt('risk')}:\n${li(rep.risks)}`);
    if (rep.opp && (rep.opp.pluses.length || rep.opp.risks.length)) {
      parts.push(stripTags(rt('oppHead', { name: rep.opp.name })));
      if (rep.opp.pluses.length) parts.push(`${rt('plus')}:\n${li(rep.opp.pluses)}`);
      if (rep.opp.risks.length) parts.push(`${rt('risk')}:\n${li(rep.opp.risks)}`);
    }
    sec(L('OSNOVNI IZVEŠTAJ (automatska analiza po pravilima)', 'BASIC REPORT (automatic rule-based analysis)'), parts.join('\n'));
  }
  return S.join('\n\n');
}
/** Liga na poene: tri statistike koje zbiru (sum iz sumPlayers) donose najviše poena */
const pointSources = sum => CATS.filter(c => !c.fpts && !noData(c)).map(c => ({ c, v: c.w * (sum[c.key] ?? 0) })).sort((a, b) => b.v - a.v).slice(0, 3);
const topPointSources = ids => { const l = pointSources(sumPlayers(ids).sum); return l.length ? l.map(x => `${x.c.label} ${n1(x.v)} FPts`).join(', ') : ''; };
const teamValsTxt = ids => { const v = teamVals(ids); return CATS.map(c => `${c.label} ${valTxt(c, v[c.key])}`).join(', '); };

/** Tekst za AI uz vesti: igrači u trejdu + igrači sa rostera sa vešću u poslednjih 7 dana */
async function prepareAIText() {
  const sp = slotPlan('my');
  const lg = currentLeague();
  const trade = [...new Set([...giveIds(), ...getIds(), ...sp.drops, ...sp.waivers, ...slotPlan('opp').drops])];
  const roster = lg ? [...rosterIds(rosterOf('my')), ...rosterIds(rosterOf('opp'))]
    .filter(id => !trade.includes(id)).filter(id => { const p = state.byId.get(id); return p?.newsTs && isRecent(new Date(p.newsTs).toISOString()); }) : [];
  const needLogs = trade.filter(id => !state.gameLogs.has(id));
  await Promise.all([...[...trade, ...new Set(roster)].map(fetchNews), needLogs.length ? fetchGameLogsQuiet(needLogs) : null]);
  render(); // osveži izveštaj (state.lastReport) sa vestima
  let text = buildAIText();
  if (text.length > AI.MAX_CHARS) text = buildAIText(true);
  return text;
}

function renderAICopy() {
  const el = $('#aicopy');
  if (!el) return;
  el.innerHTML = `<button type="button" class="aibtn" data-action="ai-copy">
      <span class="aibtn-t">🤖 ${t('Kopiraj za AI analizu')}</span>
      <span class="aibtn-s">${t('Zalepi u ChatGPT, Claude, Gemini ili bilo koji AI čet i dobićeš dugoročno mišljenje o trejdu')}</span>
    </button>`;
}

async function copyForAI() {
  showModal({ title: t('Pripremam podatke...'), body: `<div class="ai-wait"><span class="spin"></span> ${t('Povlačim vesti i sastavljam tekst.')}</div>`, cancel: null });
  const textPromise = prepareAIText();
  let ok = false;
  try {
    // Safari traži da kopiranje počne u samom kliku: ClipboardItem prima obećanje teksta
    if (window.ClipboardItem && navigator.clipboard?.write) {
      await navigator.clipboard.write([new ClipboardItem({ 'text/plain': textPromise.then(s => new Blob([s], { type: 'text/plain' })) })]);
      ok = true;
    }
  } catch { ok = false; }
  const text = await textPromise;
  if (!ok) { try { await navigator.clipboard.writeText(text); ok = true; } catch { ok = false; } }
  state.aiText = text;
  const steps = `<ol class="ai-steps">
      <li>${t('Otvori svoj AI (ChatGPT, Claude, Gemini...)')}</li>
      <li>${t('Zalepi tekst (dugo pritisni na telefonu i izaberi Zalepi, ili Ctrl+V / Cmd+V na računaru)')}</li>
      <li>${t('Pošalji i sačekaj odgovor')}</li></ol>`;
  showModal({
    title: ok ? `<span class="ai-ok">✓ ${t('Kopirano!')}</span>` : t('Kopiraj tekst'),
    wide: !ok,
    body: ok ? steps : `<p>${t('Automatsko kopiranje nije uspelo. Označi tekst i kopiraj ga.')}</p>
      <textarea class="ai-text" readonly rows="10">${esc(text)}</textarea>
      <button type="button" class="btn small" data-action="ai-select">${t('Označi sve')}</button>${steps}`,
    cancel: t('Zatvori'),
  });
}

/* =====================================================================
   Rosteri: Moj tim (i protivnik) pre i posle trejda
   ===================================================================== */
const KINDS = {
  my: { srTitle: 'Moj tim', out: GIVE, in: GET, get title() { return t(this.srTitle); } },
  opp: { srTitle: 'Protivnik', out: GET, in: GIVE, get title() { return t(this.srTitle); } },
};
/** Roster za vrstu: 'my' ili 'opp' (izabrani protivnik, ili null) */
const rosterOf = kind => (kind === 'my' ? state.rosters.my : kind === 'lt' ? state.rosters.opps[state.leagueTeam] || null : state.rosters.opps[state.rosters.oppSel] || null);
const rosterIds = r => (r ? r.players.map(x => x.id) : []);
const activeCount = r => r.players.filter(x => !x.ir).length;
const irCount = r => r.players.filter(x => x.ir).length;

/**
 * Plan rostera posle trejda.
 * - odlaze: igrači sa rostera koji su na izlaznoj strani trejda (moj: Daješ, protivnik: Dobijaš)
 * - dolaze: igrači sa ulazne strane, idu na aktivna mesta
 * - IR igrači se ne računaju; IR igrač koji odlazi ne oslobađa aktivno mesto
 * - više aktivnih od limita lige -> obavezno "Koga izbacuješ"; manje -> opcioni "Waiver dodatak"
 */
function rosterPlan(kind) {
  const r = rosterOf(kind);
  if (!r) return null;
  const outSet = new Set(state.teams[KINDS[kind].out].ids);
  const onRoster = new Set(rosterIds(r));
  const activeBefore = r.players.filter(x => !x.ir).map(x => x.id);
  const irIds = r.players.filter(x => x.ir).map(x => x.id);
  // Trejd je "moj" tek kad su SVI igrači sa izlazne strane (moj: Daješ, protivnik: Dobijaš) na ovom rosteru.
  // Dok nisu: niko ne odlazi, niko ne dolazi, Moj tim se ne menja (samo obaveštenje + "Dodaj sve").
  const notOnRoster = [...outSet].filter(id => !onRoster.has(id));
  // i kad izlazna strana još nije popunjena: igrači sa druge strane već dolaze u pregled "Posle trejda"
  const allIn = (outSet.size > 0 || state.teams[KINDS[kind].in].ids.length > 0) && notOnRoster.length === 0;
  const outIds = allIn ? rosterIds(r).filter(id => outSet.has(id)) : [];
  const incoming = allIn ? state.teams[KINDS[kind].in].ids.filter(id => !onRoster.has(id)) : [];
  const irIn = allIn ? irBoundIds(kind).filter(id => incoming.includes(id)) : []; // ide na IR: nije u aktivnom rosteru
  const pre = [...activeBefore.filter(id => !outIds.includes(id)), ...incoming.filter(id => !irIn.includes(id))];
  const sp = slotPlan(kind);
  // Izabrani "Izbacuješ": oduzima se samo ako je igrač stvarno na rosteru (i samo kad je trejd moj)
  const dropsRemove = allIn ? sp.drops.filter(id => onRoster.has(id)) : [];   // brišu se sa rostera (i IR)
  const drops = dropsRemove.filter(id => pre.includes(id));                    // aktivni -> utiču na zbir
  const dropsOff = sp.drops.filter(id => !onRoster.has(id));                    // nisu na rosteru -> napomena
  const requiredDrops = allIn ? Math.min(sp.dropSlots, Math.max(0, pre.length - ROSTER.ACTIVE)) : 0;
  const waivers = allIn ? sp.waivers : [];
  // slobodno mesto bez izabranog waivera: najbolji slobodan (uvezena liga) ili nivo zamene, kao u Pronađi trejd
  const fill = kind === 'my' && allIn ? freeFill('my') : { auto: [], repl: 0, permIds: [], permRepl: 0, tempIds: [], tempRepl: 0, w: 0 };
  const dropsLater = drops.filter(id => sp.laterDrops.includes(id));
  const activeAfter = [...pre.filter(id => !drops.includes(id)), ...waivers, ...fill.auto];
  const tradeTouches = allIn;
  return { r, activeBefore, irIds: [...irIds, ...irIn], irIn, outIds, incoming, drops, dropsRemove, dropsOff, dropSlots: sp.dropSlots, requiredDrops,
    waivers, waiverSlots: sp.waiverSlots, pre, activeAfter, notOnRoster, tradeTouches, fillAuto: fill.auto, fillRepl: fill.repl, fill, dropsLater, w: sp.w,
    missingDrops: Math.max(0, requiredDrops - drops.length) };
}

const fmtShortDate = iso => (!iso ? '–' : LANG === 'en' ? new Date(iso).toLocaleDateString(LOCALE(), { day: 'numeric', month: 'short', year: 'numeric' }) : euDate(iso, { year: true }));
const isStale = iso => iso && Date.now() - new Date(iso).getTime() > ROSTER.STALE_DAYS * 864e5;

/** Red rostera u istom stilu kao gornje tabele, sa oznakama i akcijama */
/** Red rostera; sačuvani igrači (ne DOLAZI/WAIVER) imaju ručicu za pomeranje */
function rosterRow(p, kind, { tags = [], cls = '', actions = '', saved = false, ir = false } = {}) {
  return playerRowHTML(p, { tags, cls, actions, punt: false,
    drag: saved ? `${kind}:${p.id}` : '',
    attrs: saved ? `data-rid="${p.id}" data-rir="${ir ? 1 : 0}" data-rkind="${kind}"` : '' });
}

/** Tri reda ispod rostera: Pre / Posle / Razlika (iste kolone kao tabele igrača) */
function summaryRows(before, after, showAfter) {
  const puntCls = () => ''; // roster tabele: ugašena kategorija se ne boji
  const cells = tot => CATS.map(c => {
    const v = tot.vals[c.key];
    return `<td class="${puntCls(c).trim()}${c.fpts ? ' fpts' : ''}">${c.type === 'pct' ? `${fmtCat(c, v)}<span class="sub">${tot.sum[c.made].toFixed(1)}/${tot.sum[c.att].toFixed(1)}</span>` : fmtCat(c, v)}</td>`;
  }).join('');
  if (!showAfter) return `<tr class="total"><td>${t('Ukupno')} <span class="cnt">(${t('{n} aktivnih', { n: before.counted })})</span></td><td></td>${cells(before)}<td></td></tr>`;
  const diff = CATS.map(c => {
    const b = before.vals[c.key], a = after.vals[c.key];
    if (a == null || b == null) return `<td class="${puntCls(c).trim()}">-</td>`;
    const d = a - b, f = fmtDelta(c, d);
    const better = c.lowerIsBetter ? d < 0 : d > 0;
    return `<td class="${f.zero ? '' : better ? 'win' : 'lose'}${puntCls(c)}">${f.txt}</td>`;
  }).join('');
  return `<tr class="sumrow"><td>${t('Pre trejda')} <span class="cnt">(${before.counted})</span></td><td></td>${cells(before)}<td></td></tr>
    <tr class="sumrow"><td>${t('Posle trejda')} <span class="cnt">(${after.counted})</span></td><td></td>${cells(after)}<td></td></tr>
    <tr class="total"><td>${t('Razlika')}</td><td></td>${diff}<td></td></tr>`;
}

function rosterTableHTML(kind, plan) {
  const P = id => state.byId.get(id);
  // Analiza trejda: →IR i ✕ menjaju sačuvan roster, isto kao na stranicama Moj tim i Liga (osim u uvezenoj ligi)
  // uvezena liga: roster se povlači iz lige, pa nema →IR ni ✕ (ručne i nalepljene lige ih imaju)
  const locked = rosterLocked();
  const rm = id => (locked ? '' : rosterRmBtn(kind, id));
  const irBtn = (id, toIr) => (locked ? '' : rosterIrBtn(kind, id, toIr));
  // ⇄: igrač odmah ide gore u trejd (moj tim -> Daješ, protivnik -> Dobijaš)
  const trBtn = id => (kind === 'my' || kind === 'opp') && !takenIds().has(id)
    ? `<button class="mini trade" type="button" data-action="r-trade" data-kind="${kind}" data-id="${id}" title="${esc(kind === 'my' ? t('Ubaci u Daješ') : t('Ubaci u Dobijaš'))}" aria-label="${esc(kind === 'my' ? t('Ubaci u Daješ') : t('Ubaci u Dobijaš'))}">⇄<span class="tlabel">${t('Trejduj')}</span></button>` : '';
  const outSet = new Set(plan.outIds), dropSet = new Set(plan.dropsRemove || []);
  // Pregled: igrači koji ostaju na svojim mestima (sačuvani redosled), a dole redom
  // ODLAZI, IZBAČEN, DOLAZI, WAIVER. U prikazu "Sačuvan roster" plan je prazan, pa svi ostaju na mestu.
  const stay = [], leaving = [], dropped = [];
  const irRow = id => P(id) && rosterRow(P(id), kind, { tags: [{ text: 'IR', cls: 'tag-ir' }], cls: 'ir', actions: trBtn(id) + irBtn(id, false) + rm(id), saved: true, ir: true });
  for (const id of sortIds(kind, plan.activeBefore)) {
    const p = P(id); if (!p) continue;
    if (outSet.has(id)) leaving.push({ id, ir: false });
    else if (dropSet.has(id)) dropped.push({ id, ir: false });
    else stay.push(rosterRow(p, kind, { actions: trBtn(id) + irBtn(id, true) + rm(id), saved: true }));
  }
  const irStay = [];
  for (const id of sortIds(kind, plan.irIds.filter(id => !(plan.irIn || []).includes(id)))) {
    if (outSet.has(id)) leaving.push({ id, ir: true });
    else if (dropSet.has(id)) dropped.push({ id, ir: true });
    else irStay.push(id);
  }
  const rows = [...stay];
  if (irStay.length) {
    rows.push(`<tr class="irhead"><td colspan="${CATS.length + 3}">${t('IR · ne računa se u zbirove ({a}/{b})', { a: plan.irIds.length, b: ROSTER.IR })}</td></tr>`);
    irStay.forEach(id => rows.push(irRow(id)));
  }
  const moved = (list, text) => list.map(({ id, ir }) => P(id) && rosterRow(P(id), kind, {
    tags: [...(ir ? [{ text: 'IR', cls: 'tag-ir' }] : []), { text, cls: 'tag-out' }], cls: `leaving ${ir ? 'ir' : ''}`,
    actions: irBtn(id, !ir) + rm(id), saved: true, ir })).filter(Boolean);
  rows.push(...moved(leaving, 'Odlazi'), ...moved(dropped, 'Izbačen'));
  for (const id of plan.incoming) {
    const p = P(id); if (!p) continue;
    rows.push(rosterRow(p, kind, { tags: [{ text: 'Dolazi', cls: 'tag-in' }, ...((plan.irIn || []).includes(id) ? [{ text: 'ide na IR', cls: 'tag-ir' }] : [])], cls: 'arriving' }));
  }
  for (const id of plan.waivers) {
    const p = P(id); if (!p) continue;
    rows.push(rosterRow(p, kind, { tags: [{ text: 'Waiver', cls: 'tag-in' }], cls: 'arriving',
      actions: `<button class="rm" type="button" data-action="bal-w-remove" data-kind="${kind}" data-id="${id}" aria-label="${t('Ukloni waiver')}">✕</button>` }));
  }
  const tmpT = plan.fill?.irB?.length ? t('dok je {n} na IR-u', { n: irNames(plan.fill.irB) }) : '';
  for (const id of plan.fillAuto || []) { const p = P(id); if (p) rows.push(rosterRow(p, kind, { tags: [{ text: 'Slobodno mesto', cls: 'tag-in' }, ...(plan.fill.tempIds.includes(id) ? [{ text: esc(tmpT), raw: true, cls: 'tag-ir' }] : [])], cls: 'arriving' })); }
  for (let k = 0; k < (plan.fillRepl || 0); k++) rows.push(replRowHTML(undefined, k >= (plan.fill?.permRepl ?? plan.fillRepl) ? tmpT : ''));
  return rows.filter(Boolean).join('');
}

function balanceHTML(kind, plan) {
  const nm = id => esc(state.byId.get(id)?.name || id);
  if (kind === 'my') {
    // Moj tim: slotovi se biraju gore (Daješ / Dobijaš), ovde samo napomena i upozorenje
    const notes = [];
    if (plan.dropSlots) notes.push(t('Koga izbacuješ ({a}/{b}) biraš gore, u kartici Daješ.', { a: slotPlan('my').drops.length, b: plan.dropSlots }));
    const warn = plan.missingDrops > 0
      ? `<div class="card-warn strong">⚠ ${t('Posle trejda imaš {n} aktivnih (max {m}). Izaberi koga izbacuješ u kartici Daješ, dotle Razlika nije realna.', { n: plan.pre.length, m: ROSTER.ACTIVE })}</div>` : '';
    // dajem više igrača: kako se računa slobodno mesto bira se gore, u redu Slobodno mesto (kartica Dobijaš)
    if (plan.waiverSlots) notes.push(t('Kako se računa slobodno mesto biraš gore, u redu Slobodno mesto u kartici Dobijaš.'));
    const waiver = '';
    return (notes.length ? `<div class="balance"><span class="hint">${notes.join(' ')}</span></div>` : '') + waiver + warn;
  }
  // Protivnik: ista komponenta za slotove, ovde u sekciji
  const sp = slotPlan(kind);
  const chosen = [
    ...sp.drops.map(id => `<span class="chip ${plan.dropsOff.includes(id) ? 'off' : ''}"><span class="slot-tag tag-out">${t('Izbacuje')}</span> ${nm(id)}
      <button type="button" data-action="bal-d-remove" data-kind="${kind}" data-id="${id}" aria-label="${t('Ukloni')}">✕</button></span>`),
    ...sp.waivers.map(id => `<span class="chip"><span class="slot-tag tag-in">Waiver</span> ${nm(id)}
      <button type="button" data-action="bal-w-remove" data-kind="${kind}" data-id="${id}" aria-label="${t('Ukloni')}">✕</button></span>`),
  ].join('');
  const offNotes = plan.dropsOff.map(id => `<div class="card-warn row">⚠ ${t('{n} nije na rosteru tima {team}.', { n: nm(id), team: esc(plan.r.name) })}
    ${addButtonHTML({ action: 'add-to-roster', kind, id, label: t('Dodaj na roster') })}</div>`).join('');
  const warn = plan.missingDrops > 0
    ? `<div class="card-warn strong">⚠ ${t('Posle trejda tim ima {n} aktivnih (max {m}). Izaberi koga izbacuje ({k}) gore, u kartici Dobijaš, dotle Razlika nije realna.', { n: plan.pre.length, m: ROSTER.ACTIVE, k: plan.missingDrops })}</div>` : '';
  // koga protivnik izbacuje bira se gore, u kartici Dobijaš (ovde samo prikaz); njegovo slobodno mesto samo kao napomena (ne menja moj rezultat)
  const of = plan.tradeTouches ? freeFill('opp') : { n: 0 };
  const inputs = of.n > 0 ? `<div class="balance"><span class="hint">${tfFreeSlotText([...of.auto.map(id => ({ id })), ...Array.from({ length: of.repl }, () => tfBase().slot)])}</span></div>` : '';
  return (chosen ? `<div class="chips slot-chips">${chosen}</div>` : '') + inputs + offNotes + warn;
}

/* ---------- Prikaz Moj tim / Protivnik: jedan ispod drugog ili jedan pored drugog (samo desktop) ---------- */
const SPLIT_MQ = window.matchMedia ? matchMedia('(min-width: 1100px)') : { matches: false };
const isSplit = () => state.ui.rosterLayout === 'split' && SPLIT_MQ.matches;
SPLIT_MQ.addEventListener?.('change', () => { if (state.view === 'league' && state.page === 'trade') render(); });
const ICON_STACK = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="4" y="4" width="16" height="7" rx="1.5"/><rect x="4" y="13" width="16" height="7" rx="1.5"/></svg>';
const ICON_SPLIT = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="4" width="8" height="16" rx="1.5"/><rect x="13" y="4" width="8" height="16" rx="1.5"/></svg>';
function renderRosterViewBar() {
  const el = $('#rviewbar');
  if (!el) return;
  document.getElementById('rosters')?.classList.toggle('split', isSplit());
  if (!currentLeague()) { el.innerHTML = ''; return; }
  const split = state.ui.rosterLayout === 'split';
  const b = (v, icon, label) => `<button type="button" class="ic" data-action="rlayout" data-v="${v}" aria-pressed="${split === (v === 'split')}" title="${esc(label)}" aria-label="${esc(label)}">${icon}</button>`;
  el.innerHTML = `<div class="rview" role="group" aria-label="${esc(t('Prikaz timova'))}">${b('stack', ICON_STACK, t('Jedan ispod drugog, sa statistikom'))}${b('split', ICON_SPLIT, t('Jedan pored drugog, samo igrači'))}</div>
`;
}

function renderRosterSection(kind) {
  const el = $(`#${kind === 'my' ? 'myteam' : 'oppteam'}`);
  if (!el) return;
  const open = isSplit() || (kind === 'my' ? state.ui.myOpen : state.ui.oppOpen);
  const r = rosterOf(kind);
  // split: izabran protivnik se bira u zaglavlju, da igrači oba tima počinju u istoj visini
  const inTitle = kind === 'opp' && r && isSplit();
  const head = kind === 'opp' && !inTitle ? oppPickerHTML() : '';
  // uvezene lige se same ažuriraju, pa nema ručnog uređivanja rostera
  const edit = !rosterLocked() && (r || kind === 'my') ? `<div class="edit-roster">${linkHTML('trade-edit-roster', { attrs: `data-kind="${kind}"`, label: `✎ ${kind === 'my' ? t('Uredi roster') : t('Uredi roster u Ligi')}` })}</div>` : '';
  let body = '', hint = '';
  if (!r) {
    body = `<div class="empty-team">${oppList().length ? t('Izaberi protivnika sa kojim trejduješ.') : t('Još nema unetih timova. Dodaj ih na stranici Liga.')}</div>
      ${!oppList().length ? `<div class="edit-roster">${linkHTML('trade-edit-roster', { attrs: 'data-kind="opp"', label: `＋ ${t('Dodaj tim u Ligi')}` })}</div>` : ''}`;
    hint = t('nije izabran');
  } else {
    const plan = rosterPlan(kind);
    const addBox = edit;
    hint = t('{a}/{b} aktivnih · {c}/{d} IR', { a: activeCount(r), b: ROSTER.ACTIVE, c: irCount(r), d: ROSTER.IR });
    const updText = `${t('Ažurirano: {d}', { d: fmtShortDate(r.updated) })}${isStale(r.updated) ? ` <span class="stale">· ${t('Roster možda nije aktuelan, proveri izmene.')}</span>` : ''}`;
    const updated = `<div class="r-meta">${updText}</div>`;
    if (!r.players.length) {
      body = `${updated}<div class="empty-team cta">${t(kind === 'my' ? 'Unesi svoj roster ({a} aktivnih + {b} IR). Čuva se samo u ovom browseru.' : 'Unesi roster protivnika ({a} aktivnih + {b} IR). Čuva se samo u ovom browseru.', { a: ROSTER.ACTIVE, b: ROSTER.IR })}</div>${addBox}`;
    } else {
      const before = sumPlayers(plan.activeBefore), after = planAfterTotals(plan);
      const missing = [...new Set([...before.missing, ...after.missing])];
      // Pregled posle trejda (samo prikaz) ili sačuvan roster kakav jeste
      // dugmad Posle trejda / Sačuvan roster stoje uvek (bez trejda oba prikaza su ista)
      const view = state.ui.rosterView?.[kind] || 'after';
      const showPlan = view === 'after' ? plan : { ...plan, outIds: [], incoming: [], drops: [], dropsRemove: [], waivers: [] };
      const toggle = `<div class="view-row">
          <div class="seg small" role="group" aria-label="${t('Prikaz rostera')}">
            <button type="button" data-rview="${kind}:after" aria-pressed="${view === 'after'}">${t('Posle trejda (pregled)')}</button>
            <button type="button" data-rview="${kind}:saved" aria-pressed="${view === 'saved'}">${t('Sačuvan roster')}</button>
          </div>
          <span class="r-meta in-row">${updText}</span>
          <span class="preview-note">${view === 'after' ? t('Samo pregled: sačuvan roster se ne menja dok trejd ne potvrdiš.') : t('Ovo je tvoj sačuvani roster, bez trejda.')}</span>
        </div>`;
      // Nisu svi igrači sa izlazne strane na rosteru -> samo obaveštenje, roster se ne menja
      const notAll = plan.notOnRoster.length && !plan.tradeTouches
        ? `<div class="notall"><span>⚠ ${kind === 'my'
            ? t('Nisu svi igrači iz Daješ na tvom rosteru ({list}), pa se Moj tim ne menja.', { list: plan.notOnRoster.map(id => esc(state.byId.get(id)?.name || id)).join(', ') })
            : t('Nisu svi igrači iz Dobijaš na rosteru tima {team} ({list}), pa se njegov roster ne menja.', { team: esc(r.name), list: plan.notOnRoster.map(id => esc(state.byId.get(id)?.name || id)).join(', ') })}</span>
            ${rosterLocked() ? '' : addButtonHTML({ action: 'add-all', kind, label: plan.notOnRoster.length > 1 ? t('Dodaj sve ({n})', { n: plan.notOnRoster.length }) : t('Dodaj na roster'), n: plan.notOnRoster.length })}</div>`
        : '';
      body = `${addBox}${notAll}${toggle}
        <div class="tscroll"><table class="rtable"><thead>${isSplit() ? splitHeaderRow() : rosterHeaderRow(kind)}</thead><tbody>${rosterTableHTML(kind, showPlan)}</tbody></table></div>
        ${view === 'after' || (kind === 'opp' && (plan.dropSlots || plan.waiverSlots)) ? balanceHTML(kind, plan) : ''}
        <div class="tscroll"><table class="rtable sumtable"><tbody>${summaryRows(before, after, view === 'after')}</tbody></table></div>
        ${missing.length ? `<div class="card-warn">⚠ ${t('Bez podataka za izabrani period, ne računa se: {list}', { list: missing.map(esc).join(', ') })}</div>` : ''}
        ${plan.tradeTouches && giveIds().length && getIds().length && !rosterLocked() ? `<div class="r-done"><button type="button" class="btn ok" data-action="trade-done">✔ ${t('Trejd se dogodio: ažuriraj rostere')}</button></div>` : ''}`;
    }
  }
  el.innerHTML = `<details class="card fold" data-fold="${kind}" ${open ? 'open' : ''}>
    <summary><span>${KINDS[kind].title}${inTitle ? `: ${oppSelectHTML()}` : kind === 'opp' && r ? `: ${esc(r.name)}` : ''}</span><span class="hint">${hint}</span></summary>
    <div class="fold-body">${head}${body}</div></details>`;
}

// split: kolona Igrač sa dugmetom koje vraća prikaz sa statistikom
const splitHeaderRow = () => `<tr><th><div class="th-split"><span>${t('Igrač')}</span><button type="button" class="linkbtn rview-stats" data-action="rlayout" data-v="stack">${t('Prikaži statistiku')}</button></div></th></tr>`;

/* ---------- Protivnik: sačuvani timovi po imenu ---------- */
const oppList = () => Object.entries(state.rosters.opps).sort((a, b) => a[1].name.localeCompare(b[1].name, 'sr'));

function oppPickerHTML() {
  // Analiza: ovde se samo bira protivnik; timovi se dodaju, preimenuju i brišu na stranici Liga
  if (!oppList().length) return '';
  return `<div class="opp-pick">${oppSelectHTML()}${state.rosters.oppSel ? linkHTML('trade-better') : ''}</div>`;
}
function oppSelectHTML() {
  const sel = state.rosters.oppSel;
  const opts = oppList().map(([oid, o]) => `<option value="${oid}" ${oid === sel ? 'selected' : ''}>${esc(o.name)}</option>`).join('');
  return `<select data-opp-select aria-label="${t('Izaberi protivnika')}">
        <option value="">${t('Izaberi protivnika')}</option>${opts}
      </select>`;
}

function oppSave() {
  const inp = document.querySelector('[data-opp-name]');
  const name = inp?.value.trim();
  if (!name) { inp?.focus(); return; }
  const dup = oppList().find(([oid, o]) => o.name.toLowerCase() === name.toLowerCase() && oid !== state.rosters.oppSel);
  if (dup) { inp.setCustomValidity(t('Već postoji tim sa tim imenom')); inp.reportValidity(); return; }
  if (state.ui.oppEdit === 'new') {
    const oid = `o${Date.now()}`;
    state.rosters.opps[oid] = emptyRoster(name);
    state.rosters.oppSel = oid;
  } else if (rosterOf('opp')) {
    rosterOf('opp').name = name;
  }
  state.ui.oppEdit = null;
  state.balance.opp = { drops: [], waivers: [] };
  saveRosters(); saveUI(); saveBalance(); render();
}

function oppDelete() {
  const r = rosterOf('opp');
  if (!r) return;
  showModal({
    title: t('Obrisati tim „{n}”?', { n: esc(r.name) }),
    body: `<p>${t('Roster ovog protivnika ({n} igrača) biće obrisan iz ovog browsera. Ovo ne može da se vrati, osim iz rezervne kopije.', { n: r.players.length })}</p>`,
    confirm: t('Obriši'), danger: true,
    onConfirm: () => {
      delete state.rosters.opps[state.rosters.oppSel];
      state.rosters.oppSel = null;
      saveRosters(); render();
    },
  });
}

/* ---------- Rezervna kopija: izvoz / uvoz (ceo profil ili jedna liga) ---------- */
const trejdova = n => `${n} ${plural(n, ['trejd', 'trejda', 'trejdova'], ['trade', 'trades'])}`;
const ligaN = n => `${n} ${plural(n, ['liga', 'lige', 'liga'], ['league', 'leagues'])}`;

/** Kratak opis profila za izvoz/uvoz */
function backupSummary(p) {
  const leagues = p?.leagues || [];
  if (!leagues.length) return t('nema liga');
  return t('{l}: {names} · istorija: {h}', {
    l: ligaN(leagues.length),
    names: leagues.map(l => `${esc(lgName(l))} (${t('{n} igrača', { n: l.roster?.players?.length || 0 })})`).join(', '),
    h: trejdova(leagues.reduce((a, l) => a + (l.history?.length || 0), 0)),
  });
}

/* ---------- Panel profila ---------- */
function openProfile() {
  const nm = profile?.name?.trim() || '';
  const leagues = profile?.leagues || [];
  showModal({
    title: t('Profil'),
    wide: true, cancel: t('Zatvori'),
    body: `<div class="pp-id"><span class="pav big" id="pp-av">${nm ? esc(initialsOf(nm)) : '?'}</span>
        <label class="pp-name">${t('Ime')}<input type="text" data-pname maxlength="30" value="${esc(nm)}" placeholder="${t('Tvoje ime')}"></label></div>
      <div class="pp-local"><span class="local-badge">🔒 ${t('Sačuvano na ovom uređaju')}</span>
        <p>${t('Podaci postoje samo u ovom browseru; na drugim uređajima ih nema dok ih ne preneseš izvozom i uvozom.')}</p>
        <button type="button" class="btn ghost" disabled>${t('Prijava i sinhronizacija, uskoro')}</button></div>
      <div class="set-block"><b>${t('Lige')}</b>
        ${leagues.length ? `<div class="pp-leagues">${leagues.map(l => `<button type="button" class="pp-league" data-open-league="${l.id}"><span>${esc(lgName(l))}</span><span class="pbadge">${esc(platformLabel(l.platform))}</span></button>`).join('')}</div>` : `<p>${t('Još nema liga.')}</p>`}
        <button type="button" class="linkbtn" data-action="add-league">＋ ${t('Dodaj ligu')}</button></div>
      <div class="set-block"><b>${t('Izvezi podatke')}</b><p>${t('Ceo profil sa svim ligama. Trenutno: {s}', { s: backupSummary(profile) })}</p>
        <div><button type="button" class="btn" data-action="export">${t('Kopiraj podatke u clipboard')}</button> <span class="hint export-msg" id="export-msg"></span></div></div>
      <div class="set-block"><b>${t('Ocene predloga')}</b><p>${t('Tvoje ocene 👍 i 👎 sa kartica u Pronađi trejd i Pojačanja sa FA. Čuvaju se samo u ovom browseru i ne menjaju predloge. Trenutno: {n}.', { n: rateAll().items.length })}</p>
        <div class="rate-set"><button type="button" class="btn" data-action="rate-export"${rateAll().items.length ? '' : ' disabled'}>${t('Izvezi ocene predloga')}</button> <button type="button" class="linkbtn danger" data-action="rate-wipe"${rateAll().items.length ? '' : ' disabled'}>${t('Obriši ocene')}</button>${rateAll().items.length ? '' : ` <span class="hint">${t('Još nema ocena')}</span>`}</div></div>
      <div class="set-block"><b>${t('Uvezi podatke')}</b><p>${t('Nalepi tekst rezervne kopije. Kopija celog profila zamenjuje postojeće podatke (uz potvrdu); kopija jedne lige se dodaje postojećim.')}</p>
        <textarea id="import-text" spellcheck="false" placeholder='{"app":"fbaTrade", ...}'></textarea>
        <div id="import-msg" class="hint"></div>
        <button type="button" class="btn" data-action="import">${t('Proveri i uvezi')}</button></div>
      <div class="set-block danger-zone"><b>${t('Obriši sve podatke')}</b><p>${t('Briše profil, sve lige, rostere i istoriju iz ovog browsera.')}</p>
        <button type="button" class="linkbtn danger" data-action="wipe-all">${t('Obriši sve podatke')}</button></div>`,
  });
  const m = document.getElementById('modal');
  if (m) { m.classList.add('panel'); const box = m.querySelector('.modal-box'); box.scrollTop = 0; box.focus({ preventScroll: true }); }
}

function wipeAll() {
  showModal({
    title: t('Obrisati sve podatke?'),
    body: `<p>${t('Profil, sve lige, rosteri, protivnici i istorija biće trajno obrisani iz ovog browsera. Ovo ne može da se vrati, osim iz rezervne kopije.')}</p>`,
    confirm: t('Obriši sve'), danger: true,
    onConfirm: () => {
      Object.keys(localStorage).filter(k => k.startsWith(CONFIG.APP_PREFIX) && k !== CONFIG.CACHE_KEY && k !== CONFIG.SCHEDULE_CACHE_KEY).forEach(k => localStorage.removeItem(k));
      history.replaceState(null, '', `${location.pathname}${location.search}#quick`);
      location.reload();
    },
  });
}

/** Izvoz: kind 'profile' (ceo profil sa svim ligama) ili 'league' (samo aktivna liga) */
async function exportData(btn, kind = 'profile') {
  const lg = currentLeague();
  const payload = kind === 'league' && lg
    ? { ...CONFIG.BACKUP_FORMAT, version: SCHEMA_VERSION, kind: 'league', exported: nowISO(), league: lg }
    : { ...CONFIG.BACKUP_FORMAT, version: SCHEMA_VERSION, kind: 'profile', exported: nowISO(), profile: profile || newProfile('') };
  const text = JSON.stringify(payload);
  const msg = btn?.parentElement?.querySelector('.export-msg') || document.getElementById('export-msg');
  try {
    await navigator.clipboard.writeText(text);
    if (msg) msg.textContent = `✓ ${t('Kopirano ({k} KB). Sačuvaj ga negde, npr. u beleške ili mejl sebi.', { k: Math.max(1, Math.round(text.length / 1024)) })}`;
  } catch {
    const ta = document.getElementById('import-text');
    if (ta) { ta.value = text; ta.select(); }
    if (msg) msg.textContent = t('Clipboard nije dostupan: tekst je u polju ispod, kopiraj ga ručno (Ctrl/Cmd+C).');
  }
}

/** Liga je validna ako ima naziv i roster sa listom igrača */
const validLeague = l => l && typeof l.name === 'string' && Array.isArray(l.roster?.players) && typeof (l.opps || {}) === 'object' && Array.isArray(l.history || []);

/** Stari format (verzija 1: ključevi localStorage) -> jedna liga */
function leagueFromLegacy(data) {
  const r = data[CONFIG.ROSTERS_KEY] || {};
  return newLeague({
    name: t('Moja liga'), roster: r.my || emptyRoster('Moj tim'), opps: r.opps || {}, oppSel: r.oppSel || null,
    history: data[CONFIG.HISTORY_KEY] || [], punt: data[CONFIG.PUNT_KEY] || [], balance: { ...emptyBalance(), ...(data[CONFIG.BALANCE_KEY] || {}) },
  });
}

/** Provera rezervne kopije; vraća { kind: 'profile'|'league', profile|league } ili { error } */
function parseBackup(text) {
  let obj;
  try { obj = JSON.parse(text.trim()); } catch { return { error: t('Tekst nije ispravan JSON. Proveri da si nalepio ceo tekst.') }; }
  if (obj?.app !== CONFIG.BACKUP_FORMAT.app) return { error: t('Ovo nije rezervna kopija ove aplikacije.') };
  if (obj.version > SCHEMA_VERSION) return { error: t('Kopija je iz novije verzije aplikacije.') };
  if (obj.kind === 'league') return validLeague(obj.league) ? { kind: 'league', league: obj.league, exported: obj.exported } : { error: t('Roster u kopiji nije u ispravnom formatu.') };
  if (obj.kind === 'profile') {
    const p = obj.profile;
    if (!p || !Array.isArray(p.leagues) || !p.leagues.every(validLeague)) return { error: t('Kopija sadrži nepoznate podatke.') };
    return { kind: 'profile', profile: p, exported: obj.exported };
  }
  // stara verzija 1: { data: { ključ: vrednost } } -> uvozi se kao nova liga
  if (obj.data && typeof obj.data === 'object' && Object.keys(obj.data).every(k => k.startsWith(CONFIG.APP_PREFIX))) {
    return { kind: 'league', league: leagueFromLegacy(obj.data), exported: obj.exported, legacy: true };
  }
  return { error: t('Kopija sadrži nepoznate podatke.') };
}

/** Uvoz: profil zamenjuje postojeće (uz potvrdu); jedna liga se DODAJE postojećim */
function importData() {
  const text = document.getElementById('import-text')?.value || '';
  const msg = document.getElementById('import-msg');
  const res = parseBackup(text);
  if (res.error) { msg.textContent = `✕ ${res.error}`; msg.classList.add('err'); return; }
  const when = res.exported ? t(' od {d}', { d: fmtShortDate(res.exported) }) : '';
  if (res.kind === 'league') {
    const lg = res.league;
    showModal({
      title: t('Dodati ligu „{n}”?', { n: esc(lgName(lg)) }),
      body: `<p>${t('Liga iz kopije{d} biće dodata postojećim ligama; ništa se ne prepisuje.', { d: when })}</p>`,
      confirm: t('Dodaj ligu'),
      onConfirm: () => {
        if (!profile) profile = newProfile('');
        const copy = { ...newLeague(), ...clone(lg), id: uid(), updated: nowISO() };
        copy.leagueFormat = leagueFormatOf(copy);
        if (profile.leagues.some(l => l.name === copy.name)) copy.name = t('{n} (uvoz)', { n: copy.name });
        normalizeImport(copy); profile.leagues.push(copy); profile.lastLeagueId = copy.id; saveProfile();
        location.hash = `league-${copy.id}`;
      },
    });
    return;
  }
  showModal({
    title: t('Zameniti postojeće podatke?'),
    body: `<p>${t('Uvozi se kopija{d}: <b>{s}</b>.', { d: when, s: backupSummary(res.profile) })}</p>
      <p>${t('Trenutni podaci u ovom browseru ({s}) biće <b>zamenjeni</b>.', { s: backupSummary(profile) })}</p>`,
    confirm: t('Zameni i uvezi'), danger: true,
    onConfirm: () => {
      lsSet(CONFIG.PROFILE_KEY, { ...res.profile, schema: SCHEMA_VERSION });
      localStorage.removeItem(CONFIG.TRADE_KEY); localStorage.removeItem(CONFIG.TRADES_KEY);
      history.replaceState(null, '', `${location.pathname}${location.search}#home`);
      location.reload();
    },
  });
}

/* ---------- Modal u stranici (umesto browser confirm) ---------- */
function showModal({ title, body, confirm = t('U redu'), cancel = t('Otkaži'), danger = false, onConfirm, wide = false, cls = '' }) {
  closeModal();
  const m = document.createElement('div');
  m.id = 'modal';
  m.innerHTML = `<div class="modal-back" data-modal-close></div>
    <div class="modal-box ${wide ? 'wide' : ''} ${cls}" tabindex="-1" role="dialog" aria-modal="true" aria-labelledby="modal-t">
      <h3 id="modal-t">${title}</h3><div class="modal-body">${body}</div>
      <div class="modal-actions">${cancel ? `<button type="button" class="linkbtn" data-modal-close>${cancel}</button>` : ''}
        ${onConfirm ? `<button type="button" class="btn ${danger ? 'danger' : ''}" data-modal-ok>${confirm}</button>` : ''}</div>
    </div>`;
  document.body.appendChild(m);
  m._onConfirm = onConfirm;
  (m.querySelector('[data-modal-ok]') || m.querySelector('[data-modal-close]:not(.modal-back)'))?.focus();
  return m;
}
const closeModal = () => {
  const m = document.getElementById('modal');
  if (!m) return;
  const pm = m.classList.contains('pm-modal');
  m.remove();
  // profil igrača je dodao history state: skini ga da Nazad ne bi bio "prazan" korak
  if (pm && pmHist) { pmHist = false; if (history.state?.pm) history.back(); }
};
document.addEventListener('click', e => {
  if (e.target.closest('[data-modal-close]')) { closeModal(); return; }
  if (e.target.closest('#modal [data-link]')) setTimeout(closeModal, 0); // npr. "Prebaci na IR" iz Svi alerti
  if (e.target.closest('[data-modal-ok]')) {
    const m = document.getElementById('modal');
    const keep = m?._onConfirm?.(m) === false; // onConfirm može da vrati false da modal ostane otvoren
    if (!keep) closeModal();
  }
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') { closePopMenu(); if (document.getElementById('modal')) closeModal(); } });

/** Ima li mesta za još n aktivnih igrača (limit lige, ROSTER.ACTIVE). Novi igrač uvek ide na aktivno mesto; na IR se prebacuje dugmetom. */
const hasRoom = (r, n = 1) => !!r && activeCount(r) + n <= ROSTER.ACTIVE;
const fullTip = () => t('Maksimalan broj igrača u timu ({n}). Izbaci nekoga ili ga prebaci na IR da bi dodao novog.', { n: ROSTER.ACTIVE });

function addToRoster(kind, id) {
  if (rosterLocked()) return false;
  const r = rosterOf(kind);
  if (!r || rosterIds(r).includes(id) || !hasRoom(r)) return false;
  r.players.push({ id, ir: false });
  r.updated = new Date().toISOString();
  saveRosters();
  return true;
}

/** Dodaj sve igrače sa izlazne strane koji nisu na rosteru (samo ako ima mesta za sve) */
function addAllToRoster(kind) {
  const plan = rosterPlan(kind);
  if (!plan || !hasRoom(plan.r, plan.notOnRoster.length)) return;
  for (const id of plan.notOnRoster) addToRoster(kind, id);
}

/** Prebaci na IR / vrati sa IR (poštuje limit aktivnih i IR mesta lige) */
function toggleIR(kind, id) {
  if (rosterLocked()) return;
  const r = rosterOf(kind);
  const x = r?.players.find(y => y.id === id);
  if (!x) return;
  if (!x.ir && irCount(r) >= ROSTER.IR) {
    showModal({ title: t('IR mesta su puna'), body: `<p>${t('Imaš već {n} igrača na IR. Prvo vrati nekog sa IR.', { n: ROSTER.IR })}</p>`, cancel: t('U redu') });
    return;
  }
  if (x.ir && activeCount(r) >= ROSTER.ACTIVE) {
    showModal({ title: t('Aktivna mesta su puna'), body: `<p>${t('Imaš već {n} aktivnih. Prebaci nekog na IR ili ga ukloni pre nego što vratiš ovog igrača.', { n: ROSTER.ACTIVE })}</p>`, cancel: t('U redu') });
    return;
  }
  x.ir = !x.ir;
  r.updated = new Date().toISOString();
  saveRosters();
  render();
}

/* ---------- Trejd obavljen: primeni na rostere + sačuvaj u istoriju ---------- */
function tradeDone() {
  if (!giveIds().length || !getIds().length) return;
  if (rosterLocked()) {
    // uvezena liga: rosteri dolaze sa platforme, trejd se samo čuva u Istoriju
    showModal({
      title: t('Trejd se dogodio?'),
      body: `<p>${SIDES[GIVE].name}: <b>${namesOf(giveIds())}</b><br>${SIDES[GET].name}: <b>${namesOf(getIds())}</b></p>
        <p>${t('Trejd ide u Istoriju kao obavljen. Rosteri se ne menjaju ručno: povlače se iz {p} kad platforma obradi trejd.', { p: SOURCE_LABEL[currentLeague().import.source] })}</p>`,
      confirm: t('Sačuvaj u Istoriju'),
      onConfirm: () => {
        saveTrade({ done: true, opp: rosterOf('opp')?.name || null });
        removeTab(activeTab().id);
        saveState();
        state.notice = 'Trejd je u Istoriji kao obavljen. Rosteri se osvežavaju sa platforme.';
        state.noticeLink = null;
        syncLeague(currentLeague());
        render();
      },
    });
    return;
  }
  const nm = id => esc(state.byId.get(id)?.name || `#${id}`);
  const list = ids => (ids.length ? ids.map(nm).join(', ') : '–');
  const plans = ['my', 'opp'].map(k => [k, rosterPlan(k)]).filter(([, pl]) => pl && pl.r.players.length);
  const blocked = plans.filter(([, pl]) => pl.missingDrops > 0);
  if (blocked.length) {
    showModal({ title: t('Prvo izaberi koga izbacuješ'),
      body: blocked.map(([k, pl]) => `<p><b>${k === 'my' ? t('Moj tim') : esc(pl.r.name)}</b>: ${t('posle trejda {n} aktivnih, izaberi još {k} za izbacivanje.', { n: pl.pre.length, k: pl.missingDrops })}</p>`).join(''),
      cancel: t('U redu') });
    return;
  }
  const block = ([k, pl]) => `<div class="done-block"><b>${k === 'my' ? t('Moj tim') : t('Protivnik: {n}', { n: esc(pl.r.name) })}</b>
    <div>${t('Odlaze')}: ${list(pl.outIds)}</div><div>${t('Dolaze')}: ${list(pl.incoming)}</div>
    ${pl.dropsRemove.length ? `<div>${t('Izbacuješ')}: ${list(pl.dropsRemove)}</div>` : ''}${pl.waivers.length ? `<div>Waiver: ${list(pl.waivers)}</div>` : ''}</div>`;
  const notes = [];
  if (!plans.some(([k]) => k === 'my')) notes.push(t('Tvoj roster nije unet, pa se nijedan roster ne menja: trejd se samo čuva u Istoriju.'));
  else if (!plans.some(([k]) => k === 'opp')) notes.push(t('Protivnik nije izabran, menja se samo tvoj roster.'));
  showModal({
    title: t('Trejd se dogodio?'),
    body: `<p>${SIDES[GIVE].name}: <b>${list(giveIds())}</b><br>${SIDES[GET].name}: <b>${list(getIds())}</b></p>${plans.map(block).join('')}
      ${notes.map(n => `<p class="hint">${n}</p>`).join('')}<p>${t('Sačuvani rosteri biće trajno izmenjeni kao gore, trejd ide u Istoriju kao obavljen, a polja Daješ / Dobijaš se prazne.')}</p>`,
    confirm: t('Da, ažuriraj rostere'),
    onConfirm: () => applyTrade(plans),
    wide: true,
  });
}

function applyTrade(plans) {
  const opp = rosterOf('opp');
  saveTrade({ done: true, opp: opp?.name || null });
  const now = new Date().toISOString();
  for (const [, pl] of plans) {
    const gone = new Set([...pl.outIds, ...pl.dropsRemove]);
    pl.r.players = pl.r.players.filter(x => !gone.has(x.id));
    for (const id of [...pl.incoming, ...pl.waivers]) pl.r.players.push({ id, ir: false });
    pl.r.updated = now;
  }
  removeTab(activeTab().id); // trejd je obavljen: njegov tab se zatvara, ostali tabovi vide novi roster
  saveRosters(); saveState();
  state.notice = 'Trejd se dogodio: sačuvani rosteri su ažurirani, a trejd je u Istoriji kao obavljen.';
  state.noticeLink = 'trade-after-done';
  render();
}

function removeFromRoster(kind, id) {
  const r = rosterOf(kind);
  if (!r || rosterLocked()) return;
  r.players = r.players.filter(x => x.id !== id);
  r.updated = new Date().toISOString();
  saveRosters();
}

/* =====================================================================
   Istorija trejdova
   ===================================================================== */
const clone = o => JSON.parse(JSON.stringify(o));
const fmtDate = iso => fmtShortDate(iso);
const tradePlayerIds = (teams, slots) => [...new Set([...teams.flatMap(t => [...t.ids, ...(t.drops || []), ...(t.waivers || [])]), ...(slots?.drops || []), ...(slots?.waivers || []), ...(slots?.oppDrops || [])])];

/**
 * Link za deljenje nosi trejd iz MOG ugla + oznaku s=1. Ko ga otvori, aplikacija proveri njegov roster
 * (loadState): ako su igrači iz Daješ njegovi, prikaz ostaje; inače se strane zamene (ugao primaoca).
 * Sadrži samo trejd (strane i period, + jezik); rosteri, istorija i punt ostaju lokalno.
 */
function shareURL() {
  const q = new URLSearchParams();
  q.set('per', state.period);
  q.set('t', `${giveIds().join(',')}|${getIds().join(',')}`);
  // slobodno mesto (dajem više nego što dobijam): izbor (r | p | n) i izabrani igrač
  if (state.balance && slotPlan('my').waiverSlots > 0) { const m = spotMode(); q.set('o', m[0]); if (m === 'pick' && slotPlan('my').waivers.length) q.set('w', slotPlan('my').waivers.join(',')); }
  if (LANG === 'en') q.set('lang', 'en');
  if (!EMBED?.mini) q.set('f', encodeFormat(activeFormat())); // format za koji je trejd poslat
  q.set('s', '1'); // oznaka: otvoreno preko deljenog linka
  // i iz brzog poređenja link vodi u aplikaciju: ona prepozna ligu, pita gde da ga svrsta i okrene strane
  const base = EMBED ? new URL(EMBED.app, location.href).href : `${location.origin}${location.pathname}`;
  return `${base}#${q.toString().replace(/%7C/gi, '|').replace(/%2C/gi, ',')}`;
}

async function shareLink(btn) {
  saveState();
  const url = shareURL();
  try {
    if (navigator.share && matchMedia('(hover: none)').matches) await navigator.share({ title: t('Trejd'), url });
    else { await navigator.clipboard.writeText(url); btn.textContent = `✓ ${t('Link kopiran')}`; setTimeout(() => render(), 1500); }
  } catch (e) {
    if (e.name !== 'AbortError') prompt(t('Kopiraj link:'), url);
  }
}

function saveTrade(meta = {}) {
  const totals = state.teams.map(teamTotals);
  state.history.unshift({
    ...meta,
    id: Date.now(),
    date: new Date().toISOString(),
    period: state.period,
    teams: state.teams.map((tm, i) => ({ name: SIDES[i].srName, ids: [...tm.ids] })),
    slots: { drops: slotPlan('my').drops, waivers: slotPlan('my').waivers, oppDrops: slotPlan('opp').drops },
    names: Object.fromEntries(tradePlayerIds(state.teams, { drops: [...slotPlan('my').drops, ...slotPlan('opp').drops] }).map(id => [id, state.byId.get(id)?.name || `#${id}`])),
    snapshot: totals.map(tot => ({ vals: tot.vals, sum: tot.sum, counted: tot.counted })),
  });
  saveHistory();
  state.histOpen = true;
  render();
  return state.history[0].id;
}

function openTrade(id) {
  const h = state.history.find(x => x.id === id);
  if (!h) return;
  // stari trejdovi (Tim A/B) se otvaraju kao Daješ/Dobijaš: prve dve strane
  // sačuvan trejd se otvara u NOVOM tabu (ili u tabu koji je već otvoren za njega), postojeći nacrti ostaju
  const open = scopeTabs().tabs.find(x => x.histId === id);
  if (open) activateTab(open.id);
  else addTab([GIVE, GET].map(i => h.teams[i]?.ids || []), { ...emptyBalance(), my: { drops: [...(h.slots?.drops || [])], waivers: [...(h.slots?.waivers || [])] }, opp: { drops: [...(h.slots?.oppDrops || [])], waivers: [] } }, { histId: id });
  if (h.oppKey && state.rosters.opps[h.oppKey]) { state.rosters.oppSel = h.oppKey; saveRosters(); }
  state.period = h.period;
  state.histView = null;
  saveState();
}

/* ---------- Ponude u uvezenim ligama: poslata → prihvaćena / odbijena ---------- */
const histStatus = h => h.status || (h.done ? 'done' : 'idea');
const sameIds = (a = [], b = []) => a.length === b.length && a.every(x => b.includes(x));
const offerTitle = h => `${(h.teams[GIVE]?.ids || []).map(id => h.names?.[id] || state.byId.get(id)?.name || id).join(', ')} ⇄ ${(h.teams[GET]?.ids || []).map(id => h.names?.[id] || state.byId.get(id)?.name || id).join(', ')}`;
const sentOffers = (lg = currentLeague()) => (lg?.history || []).filter(h => histStatus(h) === 'sent');
const waitingOffers = (lg = currentLeague()) => (lg?.history || []).filter(h => histStatus(h) === 'accepted' && !h.confirmed);
/** Poslata ponuda vezana za aktivan tab (samo dok su u tabu isti igrači kao u ponudi) */
function tabOffer(tab = activeTab()) {
  const h = tab?.histId && state.history.find(x => x.id === tab.histId);
  return h && histStatus(h) === 'sent' && sameIds(h.teams[GIVE]?.ids, tab.teams[GIVE].ids) && sameIds(h.teams[GET]?.ids, tab.teams[GET].ids) ? h : null;
}
function offerActionsHTML() {
  const p = SOURCE_LABEL[currentLeague().import.source];
  const h = tabOffer();
  if (h) return `<div class="offer-state">📨 ${t('Ponuda je poslata {d}', { d: fmtDate(h.date) })}${h.opp ? ` · ${esc(h.opp)}` : ''}</div>
    <div class="score-actions"><button type="button" class="btn ok" data-action="offer-accept" data-id="${h.id}">✔ ${t('Prihvaćeno')}</button><button type="button" class="btn danger" data-action="offer-reject" data-id="${h.id}">✕ ${t('Odbijeno')}</button></div>
    <div class="score-hint">${t('Kad protivnik odgovori, upiši ishod. Ponuda te čeka i u Istoriji trejdova, i kad zatvoriš ovaj tab.')}</div>`;
  const why = offerBlockers();
  if (why.length) return `<div class="score-actions"><button type="button" class="btn ghost" disabled>📨 ${t('Ponuda je poslata')}</button></div>
    <div class="score-hint offer-block">⚠ ${why.join(' ')} ${t('Trejd možeš da gledaš i porediš, ali ponuda može da se pošalje samo za igrače iz tvog tima i tima protivnika.')}</div>`;
  return `<div class="score-actions"><button type="button" class="btn ok" data-action="offer-sent">📨 ${t('Ponuda je poslata')}</button></div>
    <div class="score-hint">${t('Kad pošalješ ovu ponudu na {p}, klikni „Ponuda je poslata”. Rosteri se ne menjaju ručno, povlače se sa {p}.', { p })}</div>`;
}
/** Zašto ponuda ne može da se pošalje: igrači iz Daješ moraju biti u mom timu, iz Dobijaš u timu izabranog protivnika */
function offerBlockers() {
  const ids = r => new Set((r?.players || []).map(x => x.id));
  const mine = ids(rosterOf('my')), opp = rosterOf('opp'), theirs = ids(opp);
  const nm = list => list.map(id => esc(state.byId.get(id)?.name || `#${id}`)).join(', ');
  const out = [];
  const notMine = giveIds().filter(id => !mine.has(id));
  if (notMine.length) out.push(t(notMine.length === 1 ? '{x} nije u tvom timu.' : '{x} nisu u tvom timu.', { x: nm(notMine) }));
  if (!opp) out.push(t('Izaberi protivnika ispod.'));
  else {
    const notTheirs = getIds().filter(id => !theirs.has(id));
    if (notTheirs.length) out.push(t(notTheirs.length === 1 ? '{x} nije u timu {team}.' : '{x} nisu u timu {team}.', { x: nm(notTheirs), team: esc(opp.name) }));
  }
  return out;
}
function offerSent() {
  if (!giveIds().length || !getIds().length || offerBlockers().length) return;
  const tab = activeTab();
  const id = saveTrade({ status: 'sent', opp: rosterOf('opp')?.name || null, oppKey: state.rosters.oppSel || null });
  tab.histId = id;
  persistTrades();
  state.notice = 'Ponuda je u Istoriji trejdova. Kad protivnik odgovori, klikni Prihvaćeno ili Odbijeno.';
  state.noticeLink = null;
  render();
}
/** Zatvori tabove vezane za ponudu (u aktivnoj ligi) */
function closeOfferTabs(id) {
  scopeTabs().tabs.filter(x => x.histId === id).forEach(x => removeTab(x.id));
  saveState();
}
function offerReject(id) {
  const h = state.history.find(x => x.id === id);
  if (!h) return;
  h.status = 'rejected'; h.answered = nowISO();
  saveHistory();
  closeOfferTabs(id);
  state.notice = 'Ponuda je u Istoriji kao odbijena.';
  state.noticeLink = null;
  render();
}
function offerAccept(id) {
  const lg = currentLeague(), h = state.history.find(x => x.id === id);
  if (!h || !isSynced(lg)) return;
  const p = SOURCE_LABEL[lg.import.source];
  showModal({
    title: t('Ponuda prihvaćena?'),
    body: `<p><b>${esc(offerTitle(h))}</b></p>
      <p>${t('Trejd ide u Istoriju kao prihvaćen. Sledećih {n} minuta rosteri prikazuju timove posle trejda, da vidiš kako sada izgledaju i kako stojiš po kategorijama.', { n: Math.round(IMPORT.TEMP_SWAP_MS / 60000) })}</p>
      <p>${t('Posle toga rosteri se vraćaju na stanje sa {p}, dok {p} ne obradi trejd. Tada promena postaje trajna. Dok je aplikacija otvorena, proveravamo {p} na svakih {n} minuta.', { p, n: Math.round(IMPORT.PENDING_SYNC_MS / 60000) })}</p>`,
    confirm: t('Prihvaćeno'),
    onConfirm: () => {
      h.status = 'accepted'; h.answered = nowISO();
      saveHistory();
      startTempSwap(lg, h);
      closeOfferTabs(id);
      state.notice = 'Trejd je u Istoriji kao prihvaćen. Rosteri privremeno prikazuju timove posle trejda.';
      state.noticeLink = null;
      render();
    },
  });
}
/** Igrači trejda u rosterima lige: moj tim daje i dobija, protivnik obrnuto (objekti igrača se prenose) */
function applySwap(lg) {
  const tp = lg.import?.temp, h = tp && (lg.history || []).find(x => x.id === tp.histId);
  if (!h) return;
  const give = h.teams[GIVE].ids, get = h.teams[GET].ids, opp = lg.opps[tp.oppKey];
  const pick = (r, ids) => (r?.players || []).filter(x => ids.includes(x.id)).map(x => ({ ...x, ir: false }));
  const out = pick(lg.roster, give), inc = pick(opp, get);
  const move = (r, gone, come, ids) => {
    if (!r) return;
    r.players = r.players.filter(x => !gone.includes(x.id));
    ids.forEach(id => { if (!r.players.some(x => x.id === id)) r.players.push(come.find(x => x.id === id) || { id, ir: false }); });
  };
  move(lg.roster, give, inc, get);
  move(opp, get, out, give);
}
function startTempSwap(lg, h) {
  const get = h.teams[GET].ids;
  const oppKey = h.oppKey && lg.opps[h.oppKey] ? h.oppKey : Object.keys(lg.opps).find(k => get.every(id => lg.opps[k].players.some(x => x.id === id))) || null;
  lg.import.temp = { histId: h.id, until: Date.now() + IMPORT.TEMP_SWAP_MS, oppKey };
  refreshTempSwap(lg);
}
/** Posle osvežavanja: sačuvaj stanje sa platforme kao rezervu i ponovo primeni trejd (dok važi privremeni prikaz) */
function refreshTempSwap(lg) {
  const tp = lg.import.temp, h = (lg.history || []).find(x => x.id === tp?.histId);
  if (!tp || !h || h.confirmed || Date.now() > tp.until) { delete lg.import.temp; saveProfile(); return; }
  tp.backup = { my: clone(lg.roster.players), opp: tp.oppKey && lg.opps[tp.oppKey] ? clone(lg.opps[tp.oppKey].players) : null };
  applySwap(lg);
  saveProfile();
}
/** Kraj privremenog prikaza: rosteri se vraćaju na stanje sa platforme i liga se osvežava */
function endTempSwap(lg, { sync = true } = {}) {
  const tp = lg?.import?.temp;
  if (!tp) return;
  if (tp.backup) {
    lg.roster.players = tp.backup.my;
    if (tp.oppKey && lg.opps[tp.oppKey] && tp.backup.opp) lg.opps[tp.oppKey].players = tp.backup.opp;
  }
  delete lg.import.temp;
  saveProfile();
  if (sync) syncLeague(lg, { auto: true }); else render();
}
/** Posle povlačenja lige: ponuda koju je platforma obradila (igrači su promenili tim) postaje trajno prihvaćena */
function checkOffers(lg) {
  const mine = new Set(lg.roster.players.map(x => x.id));
  const done = (lg.history || []).filter(h => ['sent', 'accepted'].includes(histStatus(h)) && !h.confirmed
    && h.teams[GET].ids.length && h.teams[GET].ids.every(id => mine.has(id)) && h.teams[GIVE].ids.every(id => !mine.has(id)));
  if (!done.length) return;
  done.forEach(h => { h.status = 'accepted'; h.answered = h.answered || nowISO(); h.confirmed = nowISO(); });
  if (lg.import.temp && done.some(h => h.id === lg.import.temp.histId)) delete lg.import.temp;
  if (currentLeague() === lg) done.forEach(h => scopeTabs().tabs.filter(x => x.histId === h.id).forEach(x => removeTab(x.id)));
  state.notice = t('{p} je obradio trejd {x}. Rosteri su sada trajno promenjeni.', { p: SOURCE_LABEL[lg.import.source], x: done.map(offerTitle).join('; ') });
  state.noticeLink = null;
  touchLeague(lg); saveProfile();
}
/** Periodična provera: kraj privremenog prikaza i osvežavanje dok prihvaćen trejd čeka platformu. true = pokrenuto osvežavanje */
function offerTick(lg = currentLeague()) {
  if (!isSynced(lg) || state.syncing) return false;
  const tp = lg.import.temp;
  if (tp && Date.now() > tp.until) { endTempSwap(lg); return true; }
  if (!tp && waitingOffers(lg).length && Date.now() - (Date.parse(lg.import.syncedAt) || 0) > IMPORT.PENDING_SYNC_MS) { syncLeague(lg, { auto: true }); return true; }
  return false;
}
setInterval(() => { if (state.view === 'league') offerTick(); }, 30000);
function offerBarsHTML(lg) {
  if (!isSynced(lg)) return '';
  const p = SOURCE_LABEL[lg.import.source], tp = lg.import.temp;
  const th = tp && (lg.history || []).find(x => x.id === tp.histId);
  if (th) return `<div class="banner info"><span>⏳ ${t('Privremeni prikaz posle prihvaćenog trejda ({x}), do {time}. Posle toga rosteri se vraćaju na stanje sa {p}, dok {p} ne obradi trejd.', { x: esc(offerTitle(th)), time: new Date(tp.until).toLocaleTimeString(LOCALE(), { hour: '2-digit', minute: '2-digit' }), p })}</span><button type="button" data-action="temp-end">${t('Vrati odmah')}</button></div>`;
  const w = waitingOffers(lg);
  if (w.length && ['overview', 'trade', 'history'].includes(state.page)) {
    const eta = w.map(h => processEta(lg, h)).filter(Boolean).sort((a, b) => b - a)[0];
    return `<div class="banner info"><span>⏳ ${t('Prihvaćen trejd ({x}) čeka da ga {p} obradi. Proveravamo na svakih {n} minuta.', { x: esc(w.map(offerTitle).join('; ')), p, n: Math.round(IMPORT.PENDING_SYNC_MS / 60000) })}${eta ? ` <span title="${esc(processTip())}">${esc(processTxt(lg, eta))} (${t('procena')}).</span>` : ''}</span></div>`;
  }
  return '';
}

function deleteTrade(id) {
  const h = state.history.find(x => x.id === id);
  if (!h || !confirm(t('Obrisati sačuvani trejd od {d}?', { d: fmtDate(h.date) }))) return;
  state.history = state.history.filter(x => x.id !== id);
  if (state.histView === id) state.histView = null;
  saveHistory();
  render();
}

/** Statistika po utakmici (split 5) za date igrače; datum utakmice iz rasporeda (ID utakmice). */
async function loadGameLogs(ids) {
  const need = ids.filter(id => !state.gameLogs.has(id));
  if (!need.length) { render(); return; }
  state.gameLogStatus = { loading: true, error: null };
  render();
  await ensureLogs(need);
  state.gameLogStatus = { loading: false, error: need.some(id => state.gameLogs.get(id) === null) ? t('{src} ne odgovara', { src: DATA_SOURCE.name }) : null };
  render();
}

/* ---------- Profil igrača (modal): klik na ime ili sliku igrača bilo gde (rosteri, trejd, Liga, Istorija, pretraga, upozorenja) ----------
   Desktop: modal (Esc, klik van, ✕), strelice levo i desno van modala listaju igrače iz iste tabele (i ← →).
   Telefon: preko celog ekrana; dugme Nazad zatvara (history state). Bez lige (/trade-analyzer/): bez dela o vlasniku. */
let pmState = null; // { id, list, all, newsAll, sort: { col, dir } | null }
let pmHist = false;  // dodat je history state za modal (Nazad ga zatvara)
const PM = { GAMES: 7, NEXT: 3, NEWS: 2 };
/** Dugme sa imenom igrača koje otvara profil (za tekst: istorija, upozorenja) */
const pmLink = (id, name) => `<button type="button" class="pm-link" data-pm="${id}">${esc(name)}</button>`;
/** Čiji je igrač u otvorenoj ligi: { kind: 'my' | 'opp' | 'fa', name, opp }; bez lige null */
function playerOwner(id) {
  if (!currentLeague()) return null;
  const r = state.rosters || {};
  if (r.my?.players.some(x => x.id === id)) return { kind: 'my', name: currentLeague()?.teamName || t('Moj tim') };
  for (const [oid, o] of Object.entries(r.opps || {})) if (o.players.some(x => x.id === id)) return { kind: 'opp', name: o.name, opp: oid };
  return { kind: 'fa', name: t('Slobodan igrač') };
}
const gameBonus = line => (isPointsFmt() ? gameBonusPts(line, FMT_ACTIVE.bonus) : 0);
/** FPts jedne utakmice: DD/TD/QD iz statistike utakmice + bonus za prag */
const gameFpts = line => fptsCalc(line, FMT_ACTIVE.weights, { ...derivedOf(line), B: gameBonus(line) });
/** Protivnik u utakmici: "@BOS" (gost) ili "BOS" (domaćin) */
function gameOpp(p, gameId) {
  const g = (state.schedule?.[p.tid] || []).find(x => String(x.id) === String(gameId));
  if (!g || g.h == null) return '';
  const home = g.h === p.tid;
  return `${home ? '' : '@'}${PRO_TEAMS[home ? g.a : g.h] ?? '?'}`;
}
const pmDate = ms => (LANG === 'en' ? new Date(ms).toLocaleDateString(LOCALE(), { day: 'numeric', month: 'numeric' }) : euDate(ms));
const hasBonusCol = () => isPointsFmt() && FMT_ACTIVE.bonus?.length > 0;
/** Vrednost kolone za jednu utakmicu (za prikaz i sortiranje) */
function gameVal(c, line) {
  if (c.fpts) return gameFpts(line);
  if (c.type === 'pct') return line[c.att] > 0 ? line[c.made] / line[c.att] : null;
  if (['DD', 'TD', 'QD'].includes(c.key)) return derivedOf(line)[c.key];
  return catValue({ ...line, GP: 1 }, c);
}
/** Ćelija kategorije za jednu utakmicu: procenti kao pogoci-pokušaji (9-22) */
function gameCell(c, line) {
  if (c.fpts) return `<td class="fpts">${fmt1(gameFpts(line))}</td>`;
  if (c.type === 'pct') return `<td>${Math.round(line[c.made] ?? 0)}-${Math.round(line[c.att] ?? 0)}</td>`;
  const v = gameVal(c, line);
  return `<td>${v == null ? '-' : c.ratio ? v.toFixed(2) : Math.round(v * 10) / 10}</td>`;
}
/** Dugme za trejd: moj igrač u Daješ, protivnikov u Dobijaš; bez lige oba; free agent bez dugmeta */
function pmActHTML(p, own) {
  if (EMBED?.mini) return ''; // javna stranica (lista u usponu): profil bez lige i bez trejda
  const b = (side, label) => `<button type="button" class="btn ${side === GIVE ? 'give' : 'get'}" data-pm-add="${side}" data-id="${p.id}">${own ? '⇄' : '＋'} ${label}</button>`;
  if (!own) return b(GIVE, t('Dodaj u Daješ')) + b(GET, t('Dodaj u Dobijaš'));
  if (own.kind === 'my') return b(GIVE, t('Trejduj'));
  if (own.kind === 'opp') return b(GET, t('Trejduj'));
  return '';
}
/** Trejduj iz profila: sa stranice Analiza trejda (i bez lige) ide u aktivni trejd; protivnikov igrač tamo ide u aktivni trejd
 *  samo ako protivnik nije izabran ili je isti, inače nova analiza. Sa svih ostalih stranica (Moj tim, Liga, Istorija...) uvek nova analiza. */
function pmAddToTrade(id, side) {
  const own = playerOwner(id);
  const opp = own?.kind === 'opp' ? own.opp : null;
  const inTrade = state.view !== 'league' || state.page === 'trade';
  activateTab(scopeTabs().active);
  if (!inTrade) {
    openInAnalysis(side === GIVE ? [[id], []] : [[], [id]], { opp });
    // moj igrač u novoj analizi: protivnik prazan (korisnik ga bira)
    if (!opp) { state.rosters.oppSel = null; saveRosters(); if (state.balance) state.balance.opp = { drops: [], waivers: [] }; persistTrades(); }
  }
  else if (opp && side === GET) {
    const cur = state.rosters.oppSel;
    if (cur && cur !== opp) openInAnalysis([[], [id]], { opp });
    else {
      if (!cur) { state.rosters.oppSel = opp; saveRosters(); }
      if (!takenIds().has(id)) state.teams[GET].ids.push(id);
    }
  } else if (!takenIds().has(id)) state.teams[side].ids.push(id);
  // analiza mora da pokaže aktivni trejd, ne trejd iz istorije ili deljeni link
  state.histView = null; state.sharedOpen = false; searchUI.clear();
  saveState(); persistTrades();
  closeModal();
  if (!inTrade) { setBack('trade'); goPage('trade'); } else render();
  toast(t('Dodato u trejd'));
}
/** Profil: vrednost igrača u zaglavlju (samo vrednost i rang), za izabrani period; objašnjenje i raspodela su u tooltipu */
function pmValueFact(p, per) {
  const v = playerValue(p);
  if (!v) return '';
  const val = isPointsFmt() ? t('{v} FPts iznad zamene', { v: fmtVal(v.total) }) : fmtVal(v.total);
  const tip = esc(pmValueTip(v));
  return `<span class="pm-val"><small>${t('Vrednost ({p})', { p: per.label.toLowerCase() })} <span class="i q" data-tip="${esc(t('Vrednost'))}" data-tip-html="${tip}">?</span></small><b class="${v.total >= 0 ? 'up' : 'down'}" data-tip="${esc(t('Vrednost'))}" data-tip-html="${tip}">${val} · #${v.rank}</b>${v.small ? ` <em class="small-tag" data-tip="${esc(t('Manje od {n} utakmica u ovom periodu.', { n: VALUE.SMALL_SAMPLE_GP }))}">${t('mali uzorak')}</em>` : ''}</span>`;
}
/** Tooltip vrednosti: kratko objašnjenje, ispod raspodela po kategorijama (od najveće, punt sivo) ili FPts i nivo zamene */
function pmValueTip(v) {
  const lv = leagueValues();
  if (isPointsFmt()) {
    return `<div class="vt-p">${esc(t('Fantasy poeni po utakmici iznad igrača kojeg možeš da nađeš na waiveru.'))}</div>`
      + `<div class="vt-b"><span>${esc(t('FPts po utakmici'))} <b>${fmt1(v.fpts ?? 0)}</b></span><i>·</i><span>${esc(t('Nivo zamene'))} <b>${fmt1(lv.repl ?? 0)}</b></span></div>`;
  }
  const lbl = k => lv.cats.find(c => c.key === k)?.label || k;
  const items = Object.entries(v.by || {}).sort((a, b) => b[1] - a[1]);
  return `<div class="vt-p">${esc(t('Doprinos u kategorijama tvoje lige u odnosu na prosečnog igrača sa rostera. Oko +1 je jasno iznad proseka, +2 i više među najboljima. Vrednost je zbir svih kategorija.'))}</div>`
    + (items.length ? `<div class="vt-b">${items.map(([k, z]) => `<span class="${isPunt({ key: k }) ? 'punt' : z >= 0.05 ? 'up' : z <= -0.05 ? 'down' : ''}">${esc(lbl(k))} ${fmtVal(z)}</span>`).join('<i>·</i>')}</div>` : '');
}
function playerModalHTML(p) {
  const own = playerOwner(p.id), ps = playerStatus(p), inj = INJURY[ps.inj];
  const per = PERIODS.find(x => x.key === state.period);
  const chg = p.own ? Math.round(p.own.chg * 10) / 10 : 0;
  const act = pmActHTML(p, own);
  const head = `<div class="pm-head">
      <div class="pm-photo"><span>${esc(initials(p.name))}</span><img src="${CONFIG.HEADSHOT_URL(p.id)}" alt="" onerror="this.remove()"></div>
      <div class="pm-id"><div class="pm-team">${esc(p.team)} · ${esc(posTxt(p))}</div>
        <div class="pm-facts">
          <span><small>${t('Status')}</small><b class="${inj ? `inj ${inj.cls}` : 'ok'}">${inj ? esc(ps.lb || ps.inj.replace(/_/g, ' ').toLowerCase().replace(/^./, x => x.toUpperCase())) : t('Zdrav')}${inj && ps.espn ? ` <span class="src-mark" data-tip="${esc(t('Platforma lige ne daje status igrača, pa je prikazan status sa ESPN-a.'))}">(ESPN)</span>` : ''}</b></span>
          ${own ? `<span><small>${t('Vlasnik')}</small><b>${esc(own.name)}</b></span>` : ''}
          ${p.own ? `<span><small>${t('U ligama')}</small><b>${p.own.pct.toFixed(1)}% <em class="${chg > 0 ? 'up' : chg < 0 ? 'down' : ''}">(${chg > 0 ? '+' : ''}${chg.toFixed(1)})</em></b></span>` : ''}
          ${pmValueFact(p, per)}
        </div>${act ? `<div class="pm-act">${act}</div>` : ''}</div></div>`;
  // proseci po periodima
  const bcol = hasBonusCol();
  const rows = PERIODS.map(x => ({ x, st: statOf(p, x.key) })).filter(r => r.st);
  const avg = rows.length ? `<section class="pm-sec"><h4>${t('Proseci')}</h4><div class="tscroll"><table class="pm-tbl"><thead><tr><th></th><th>MIN</th>${CATS.map(c => `<th class="${c.fpts ? 'fpts' : ''}">${c.label}</th>${c.fpts && bcol ? `<th>${t('Bonus')}</th>` : ''}`).join('')}<th>GP</th></tr></thead><tbody>
      ${rows.map(({ x, st }) => { const est = x.key === 'proj' && isPointsFmt() && (bcol || Object.keys(FMT_ACTIVE.weights).some(k => PROJ_FROM_SEASON.includes(k)));
        const ag = bcol ? playerAgg(p.id, x.statId(CONFIG.SEASON)) : null;
        return `<tr class="${x.key === state.period ? 'cur' : ''}"><th>${esc(x.label)}</th><td>${fmt1(st.MIN)}</td>${CATS.map(c => { const v = catValue(st, c); return `<td class="${c.fpts ? 'fpts' : ''}">${c.fpts && est ? `<span class="est" data-tip="${esc(t('Procena: projekcija nema bonuse, dabl-dablove ni retke stavke (tehničke, flagrantne...). Za njih uzimamo prosek po utakmici iz ove sezone.'))}">≈</span>` : ''}${v == null ? '-' : fmtCat(c, v)}</td>${c.fpts && bcol ? `<td>${ag ? fmt1(ag.B) : '-'}</td>` : ''}`; }).join('')}<td>${Math.round(st.GP)}</td></tr>`; }).join('')}
    </tbody></table></div></section>` : `<p class="pnote">${t('Nema statistike za ovu sezonu.')}</p>`;
  // utakmice
  const games = state.gameLogs.get(p.id);
  const sched = state.schedule?.[p.tid] || [];
  let log;
  if (games === undefined) log = `<p class="pnote"><span class="spinner"></span> ${t('Učitavam utakmice…')}</p>`;
  else if (games === null) log = `<p class="pnote">${t('Utakmice trenutno nisu dostupne.')}</p>`;
  else {
    const srt = pmState.sort;
    const now = Date.now(), rowsG = gameLogRows(games, sched, now, now - CONFIG.GAME_DONE_AFTER_MS);
    const recent = [...rowsG.played].reverse();
    let list = pmState.all ? recent : recent.slice(0, PM.GAMES);
    const colOf = key => CATS.find(c => c.key === key);
    if (srt) {
      const v = g => (srt.col === 'date' ? g.date : g.dnp ? null : srt.col === 'MIN' ? g.line.MIN : srt.col === 'BONUS' ? gameBonus(g.line) : gameVal(colOf(srt.col), g.line));
      const sign = srt.dir === 'asc' ? 1 : -1;
      list = list.map((g, i) => ({ g, i, v: v(g) })).sort((a, b) => (a.v == null) - (b.v == null) || (a.v != null && b.v != null ? (a.v - b.v) * sign : 0) || a.i - b.i).map(x => x.g);
    }
    // sledeće utakmice: najdalja gore, najbliža odmah iznad poslednje odigrane; utakmica u toku ostaje ovde dok se ne završi
    const upcoming = !srt || (srt.col === 'date' && srt.dir === 'desc') ? rowsG.next.slice(0, PM.NEXT).reverse() : [];
    const sth = (key, label, cls = '', extra = '') => { const on = srt?.col === key; return `<th class="sortth ${cls}${on ? ' sorted' : ''}" data-pm-sort="${key}" aria-sort="${on ? (srt.dir === 'asc' ? 'ascending' : 'descending') : 'none'}" title="${esc(t('Sortiraj po {c}', { c: label }))}">${label}${extra}${on ? `<span class="sarr">${srt.dir === 'asc' ? '▲' : '▼'}</span>` : ''}</th>`; };
    const ncol = CATS.length + 3 + (bcol ? 1 : 0);
    log = `<div class="tscroll"><table class="pm-tbl pm-log"><thead><tr>${sth('date', t('Datum'), 'dt')}<th class="op">${t('Protiv')}</th>${sth('MIN', 'MIN')}${CATS.map(c => sth(c.key, c.type === 'pct' && !c.ratio ? c.label.replace('%', '') : c.label, c.fpts ? 'fpts' : '', srcMarkHTML(c)) + (c.fpts && bcol ? sth('BONUS', t('Bonus')) : '')).join('')}</tr></thead><tbody>
      ${upcoming.map(g => `<tr class="next${g.live ? ' live' : ''}"><td class="dt">${pmDate(g.date)}</td><td class="op">${esc(gameOpp(p, g.id))}</td><td colspan="${ncol - 2}" class="nx">${g.live ? t('u toku') : t('sledeća utakmica')}</td></tr>`).join('')}
      ${list.map(g => { if (g.dnp) return `<tr class="dnp" title="${esc(t('Nije igrao'))}"><td class="dt">${pmDate(g.date)}</td><td class="op">${esc(gameOpp(p, g.gid))}</td><td>-</td>${CATS.map(c => '<td>-</td>' + (c.fpts && bcol ? '<td>-</td>' : '')).join('')}</tr>`; const b = gameBonus(g.line); return `<tr${b ? ` class="bonus" title="${esc(t('Bonus u ovoj utakmici: {n} FPts', { n: fmtNum(b) }))}"` : ''}><td class="dt">${pmDate(g.date)}</td><td class="op">${esc(gameOpp(p, g.gid || sched.find(x => x.date === g.date)?.id))}</td><td>${Math.round(g.line.MIN)}</td>${CATS.map(c => gameCell(c, g.line) + (c.fpts && bcol ? `<td>${b ? `+${fmtNum(b)}` : '0'}</td>` : '')).join('')}</tr>`; }).join('')}
    </tbody></table></div>
    ${!rowsG.played.some(g => !g.dnp) ? `<p class="pnote">${t('Još nije igrao ove sezone.')}</p>` : ''}${!recent.length ? '' : recent.length > PM.GAMES ? `<button type="button" class="linkbtn pm-more" data-pm-more="games">${pmState.all ? t('Prikaži manje') : t('Prikaži sve ({n})', { n: recent.length })}</button>` : ''}
    ${bcol ? `<p class="pnote">${t('FPts po utakmici uključuju bonuse lige ({list}). Utakmice sa bonusom su označene.', { list: FMT_ACTIVE.bonus.map(bonusTxt).join(', ') })}</p>` : ''}`;
  }
  // vesti
  const news = newsOf(p.id), nShown = pmState.newsAll ? news : news.slice(0, PM.NEWS);
  const newsHTML = state.news.has(p.id)
    ? news.length ? `${nShown.map(n => `<article class="pm-news"><time>${n.published ? esc(fmtDateTime(Date.parse(n.published))) : ''}</time><b>${esc(n.headline || '')}</b>${n.story ? `<p>${esc(stripTags(n.story))}</p>` : ''}</article>`).join('')}
        ${news.length > PM.NEWS ? `<button type="button" class="linkbtn pm-more" data-pm-more="news">${pmState.newsAll ? t('Prikaži manje') : t('Prikaži još ({n})', { n: news.length - PM.NEWS })}</button>` : ''}` : `<p class="pnote">${t('Nema skorijih vesti.')}</p>`
    : `<p class="pnote"><span class="spinner"></span> ${t('Učitavam vesti…')}</p>`;
  return `${head}${avg}
    <section class="pm-sec"><h4>${t('Utakmice')}</h4>${log}</section>
    <section class="pm-sec"><h4>${t('Vesti')}</h4>${newsHTML}</section>
    ${p.outlook ? `<section class="pm-sec"><h4>${t('Pregled sezone (ESPN)')}</h4><p class="pm-outlook">${esc(p.outlook)}</p></section>` : ''}`;
}
/** Strelice za prethodnog i sledećeg igrača: van modala (desktop), u traci na dnu (telefon) */
function pmNavHTML() {
  const i = pmState.list.indexOf(pmState.id);
  const prev = i > 0 ? state.byId.get(pmState.list[i - 1]) : null, next = i >= 0 && i < pmState.list.length - 1 ? state.byId.get(pmState.list[i + 1]) : null;
  const nav = (x, dir) => (x ? `<button type="button" class="pm-nav ${dir}" data-pm-go="${x.id}" aria-label="${esc(dir === 'prev' ? t('Prethodni igrač: {n}', { n: x.name }) : t('Sledeći igrač: {n}', { n: x.name }))}">
      <span class="pm-arr" aria-hidden="true">${dir === 'prev' ? '‹' : '›'}</span>${avatarHTML(x)}<small>${esc(x.name)}</small></button>` : '');
  return nav(prev, 'prev') + nav(next, 'next');
}
function refreshPlayerModal(top = false) {
  const m = document.getElementById('modal');
  if (!pmState || !m?.querySelector('.pm-box')) return;
  const p = state.byId.get(pmState.id);
  if (!p) return;
  m.querySelector('#modal-t').textContent = p.name;
  const box = m.querySelector('.modal-box'), y = top ? 0 : box.scrollTop; // modal-box je element koji se skroluje
  m.querySelector('.modal-body').innerHTML = playerModalHTML(p);
  m.querySelector('.pm-navs').innerHTML = pmNavHTML();
  box.scrollTop = y;
}
/** Otvori profil igrača; list = igrači iz iste tabele (za strelice) */
async function openPlayerModal(id, list = []) {
  const p = state.byId.get(id);
  if (!p) return;
  const same = pmState && document.getElementById('modal')?.querySelector('.pm-box');
  pmState = { id, list: list.length ? list : same ? pmState.list : [id], all: false, newsAll: false, sort: null };
  if (same) refreshPlayerModal(true);
  else {
    const m = showModal({ title: esc(p.name), body: playerModalHTML(p), cancel: t('Zatvori'), wide: true, cls: 'pm-box' });
    m.classList.add('pm-modal');
    m.querySelector('.modal-box').insertAdjacentHTML('afterbegin', `<button type="button" class="pm-x" data-modal-close aria-label="${esc(t('Zatvori'))}">✕</button>`);
    m.insertAdjacentHTML('beforeend', `<div class="pm-navs">${pmNavHTML()}</div>`);
    // fokus na X bez skrolovanja (fokus na Zatvori je spuštao profil na dno)
    m.querySelector('.pm-x').focus({ preventScroll: true }); m.querySelector('.modal-box').scrollTop = 0;
    // dugme Nazad (telefon, browser) zatvara profil umesto da napusti stranicu
    try { history.pushState({ ...(history.state || {}), pm: 1 }, ''); pmHist = true; } catch { pmHist = false; }
  }
  const jobs = [];
  if (!state.schedule) jobs.push(loadSchedule().catch(() => null));
  if (!state.gameLogs.has(id) || state.gameLogs.get(id) === null) jobs.push(ensureLogs([id]));
  if (!state.news.has(id)) jobs.push(fetchNews(id).catch(() => null));
  if (!jobs.length) return;
  await Promise.all(jobs);
  if (pmState?.id === id) refreshPlayerModal();
}
window.addEventListener('popstate', () => {
  if (!pmHist) return;
  pmHist = false; // Nazad je već skinuo state
  if (document.getElementById('modal')?.querySelector('.pm-box')) closeModal();
});
document.addEventListener('click', e => {
  const go = e.target.closest('[data-pm-go]');
  if (go) { openPlayerModal(+go.dataset.pmGo); return; }
  const add = e.target.closest('[data-pm-add]');
  if (add) { pmAddToTrade(+add.dataset.id, +add.dataset.pmAdd); return; }
  const more = e.target.closest('[data-pm-more]');
  if (more && pmState) { if (more.dataset.pmMore === 'games') pmState.all = !pmState.all; else pmState.newsAll = !pmState.newsAll; refreshPlayerModal(); return; }
  const so = e.target.closest('[data-pm-sort]');
  if (so && pmState) {
    const col = so.dataset.pmSort, cur = pmState.sort;
    const first = col === 'date' ? 'desc' : CATS.find(c => c.key === col)?.lowerIsBetter ? 'asc' : 'desc';
    pmState.sort = cur?.col === col ? { col, dir: cur.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: first };
    if (pmState.sort.col === 'date' && pmState.sort.dir === 'desc') pmState.sort = null; // podrazumevano: najnovija gore
    refreshPlayerModal();
    return;
  }
  const el = e.target.closest('[data-pm]');
  if (!el || el.closest('.pm-box')) return;
  e.preventDefault(); e.stopPropagation();
  const scope = el.closest('tbody, .alerts, .hist-item, .card, section, [role="listbox"]') || document;
  const list = [...new Set([...scope.querySelectorAll('[data-pm]')].map(x => +x.dataset.pm))];
  closePopMenu?.();
  openPlayerModal(+el.dataset.pm, list);
}, true);
document.addEventListener('keydown', e => {
  if (!pmState || !document.getElementById('modal')?.querySelector('.pm-box') || e.target.matches?.('input, textarea, select')) return;
  const i = pmState.list.indexOf(pmState.id), to = e.key === 'ArrowLeft' ? pmState.list[i - 1] : e.key === 'ArrowRight' ? pmState.list[i + 1] : null;
  if (to != null) { e.preventDefault(); openPlayerModal(to); }
});

/* ---------- Vesti i propuštene utakmice (za izveštaj i tekst za AI) ---------- */
state.news = new Map(); // playerId -> { ts, items: [{ headline, story, published }] }
const stripTags = s => String(s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
async function fetchNews(id) {
  const c = state.news.get(id);
  if (c && Date.now() - c.ts < CONFIG.NEWS_TTL_MS) return c.items;
  try {
    const res = await fetch(CONFIG.NEWS_URL(id));
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();
    const items = (data.feed || []).filter(f => f.type === CONFIG.NEWS_TYPE)
      .map(f => ({ headline: stripTags(f.headline), story: stripTags(f.story || f.description), published: f.published }))
      .filter(x => x.headline)
      .sort((a, b) => new Date(b.published) - new Date(a.published)) // uvek najnovije prve
      .slice(0, CONFIG.NEWS_KEEP);
    state.news.set(id, { ts: Date.now(), items });
    return items;
  } catch (e) {
    console.warn('Vesti nisu učitane:', id, e.message); // izveštaj radi i bez vesti
    if (!c) state.news.set(id, { ts: Date.now() - CONFIG.NEWS_TTL_MS + 60000, items: [] }); // probaj ponovo za minut
    return c?.items || [];
  }
}
const newsOf = id => state.news.get(id)?.items || [];
const isRecent = (iso, days = CONFIG.NEWS_RECENT_DAYS) => iso && Date.now() - new Date(iso).getTime() <= days * 864e5;

/** Broj utakmica tima zaredom koje igrač nije odigrao (od poslednje utakmice sa minutima), ili null */
function missedStreak(p) {
  const games = state.gameLogs.get(p?.id), team = state.schedule?.[p?.tid];
  if (!games || !team) return null;
  const last = games.length ? games[games.length - 1].date : 0;
  const cutoff = Date.now() - CONFIG.GAME_DONE_AFTER_MS;
  return team.filter(g => g.date > last && g.date <= cutoff).length;
}

/** Igrači u trejdu (obe strane + Izbacuješ / Waiver): vesti i utakmice se povlače u pozadini, bez greške na ekranu */
let reportDataBusy = false;
function ensureReportData() {
  if (reportDataBusy || !state.players.length) return;
  const ids = [...new Set([...giveIds(), ...getIds(), ...slotIds('my')])];
  const needNews = ids.filter(id => { const c = state.news.get(id); return !c || Date.now() - c.ts >= CONFIG.NEWS_TTL_MS; });
  const needLogs = ids.filter(id => !state.gameLogs.has(id));
  if (!needNews.length && !needLogs.length) return;
  reportDataBusy = true;
  Promise.all([
    Promise.all(needNews.map(fetchNews)),
    needLogs.length ? fetchGameLogsQuiet(needLogs) : null,
  ]).finally(() => { reportDataBusy = false; render(); });
}
/** Statistika po utakmici bez statusa i bez greške na ekranu (za propuštene utakmice) */
/** Utakmice bez prikaza statusa (tekst za AI, profil igrača): isti keš i ista pravila kao ostalo */
const fetchGameLogsQuiet = ids => ensureLogs(ids);

/** Prosek igrača samo za utakmice POSLE datuma trejda (utakmice tog dana se ne računaju). */
function sinceLine(p, sinceMs) {
  const games = state.gameLogs.get(p?.id);
  if (!games) return null;
  const after = games.filter(g => g.date > sinceMs);
  if (!after.length) return null;
  const avg = { GP: after.length };
  for (const k of [...SUM_KEYS, 'MIN']) avg[k] = after.reduce((a, g) => a + g.line[k], 0) / after.length;
  return avg;
}

/** Status zapisa iz istorije (isti na Pregledu i u Istoriji trejdova) */
/** Procena kada platforma obrađuje prihvaćen trejd: prihvatanje + period revizije lige. null: nepoznato, bez revizije ili je prošlo. */
function processEta(lg, h) {
  if (!isSynced(lg)) return null;
  const R = leagueRules(lg), at = Date.parse(h.answered || '');
  const eta = R.reviewHours > 0 && at > 0 ? at + R.reviewHours * 36e5 : null;
  return eta && eta > Date.now() ? eta : null;
}
const processTip = () => t('Procena: komesar, LM ili glasanje lige mogu da obore trejd.');
const processTxt = (lg, eta) => t('{p} obrađuje trejd oko {d}', { p: SOURCE_LABEL[lg.import.source], d: dayDate(eta) });
function histTagHTML(h, withOpp = true) {
  const lg = currentLeague(), P = isSynced(lg) ? SOURCE_LABEL[lg.import.source] : '';
  const st = histStatus(h), w = withOpp && h.opp ? ` ${t('sa {n}', { n: esc(h.opp) })}` : '';
  if (st === 'sent') return `<span class="sent-tag">${t('ponuda poslata')}${w}</span>`;
  if (st === 'accepted') {
    const eta = h.confirmed ? null : processEta(lg, h);
    return `<span class="done-tag">${t('prihvaćen')}${w}</span>${h.confirmed ? '' : eta ? ` · <span class="sent-tag" title="${esc(processTip())}">${esc(processTxt(lg, eta))} (${t('procena')})</span>` : ` · <span class="sent-tag">${t('čeka {p}', { p: P })}</span>`}`;
  }
  if (st === 'rejected') return `<span class="rej-tag">${t('odbijen')}${w}</span>`;
  if (st === 'done') return `<span class="done-tag">${withOpp && h.opp ? t('obavljen sa {n}', { n: esc(h.opp) }) : t('obavljen')}</span>`;
  return `<span class="idea-tag">${t('ideja')}</span>`;
}
function renderHistory() {
  const synced = isSynced(currentLeague());
  const tag = h => histTagHTML(h);
  const list = state.history.map(h => {
    const sideName = (tm, i) => (SIDES[i] && (!tm.name || tm.name === SIDES[i].srName) ? SIDES[i].name : tm.name || '');
    // imena su dugmad za profil, pa red nije jedno dugme (dugme u dugmetu browser razbija); klik van imena otvara trejd
    const sides = h.teams.map((tm, i) => `<div class="hs ${i === GIVE ? 'give' : i === GET ? 'get' : ''}"><span class="hs-l">${esc(sideName(tm, i))}</span><span class="hs-p">${tm.ids.map(id => (state.byId.has(id) ? pmLink(id, state.byId.get(id).name) : esc(h.names?.[id] || id))).join(', ') || '–'}</span></div>`).join('<span class="hs-arrow" aria-hidden="true">⇄</span>');
    const per = PERIODS.find(x => x.key === h.period)?.label || h.period;
    const answer = synced && histStatus(h) === 'sent'
      ? `<span class="hist-answer"><button type="button" class="btn ok small" data-action="offer-accept" data-id="${h.id}">✔ ${t('Prihvaćeno')}</button><button type="button" class="btn danger small" data-action="offer-reject" data-id="${h.id}">✕ ${t('Odbijeno')}</button></span>` : '';
    return `<li class="${state.histView === h.id ? 'active' : ''}">
      <div class="hist-open" data-action="hist-open" data-id="${h.id}" title="${esc(t('Otvori u analizi trejda'))}">
        <button type="button" class="hist-date" data-action="hist-open" data-id="${h.id}">${fmtDate(h.date)} · ${per} · ${tag(h)}</button><div class="hist-sides">${sides}</div></div>
      ${answer}
      <button type="button" class="iconbtn" data-action="hist-stats" data-id="${h.id}" aria-pressed="${state.histView === h.id}" aria-label="${t('Statistika od trejda')}" title="${t('Statistika od trejda')}">📊</button>
      <button type="button" class="iconbtn" data-action="hist-del" data-id="${h.id}" aria-label="${t('Obriši trejd')}">🗑</button></li>`;
  }).join('');

  let detail = '';
  const h = state.history.find(x => x.id === state.histView);
  if (h) {
    const since = new Date(h.date).getTime();
    const per = PERIODS.find(x => x.key === h.period)?.label || h.period;
    const st = state.gameLogStatus;
    const nowP = state.period;
    const blocks = h.teams.map((t0, ti) => {
      const tm = normTeam(t0);
      // novi format: slots (izbacuješ ide u Daješ; u Dobijaš ide koga protivnik izbacuje, a kod starijih zapisa waiver); stari format: waivers +, drops −
      // oppDrops postoji od kad protivnik izbacuje; stariji zapisi su u Dobijaš računali waiver
      const extra = h.slots ? (ti === GIVE ? h.slots.drops : (h.slots.oppDrops ?? h.slots.waivers)) || [] : tm.waivers;
      const plus = [...tm.ids, ...extra], minus = h.slots ? [] : tm.drops;
      const snap = h.snapshot[ti];
      const cur = sumPlayers(plus, minus);
      const sinceT = sumPlayers(plus, minus, p => sinceLine(p, since));
      const gamesSince = plus.map(id => sinceLine(state.byId.get(id), since)?.GP || 0);
      const row = (label, tt, cls = '') => `<tr class="${cls}"><td>${label}</td>${CATS.map(c => {
        const v = tt?.vals?.[c.key];
        return `<td class="${puntCls(c).trim()}">${fmtCat(c, v)}</td>`;
      }).join('')}</tr>`;
      const sinceLabel = st.loading ? t('Od trejda: učitavam…')
        : st.error ? t('Od trejda: greška ({e})', { e: esc(st.error) })
        : sinceT.counted ? `${t('Od trejda')} <span class="cnt">(${t('{a}–{b} ut.', { a: Math.min(...gamesSince.filter(Boolean)), b: Math.max(...gamesSince) })})</span>`
        : t('Od trejda: još nema utakmica');
      const nm = SIDES[ti] && (!t0.name || t0.name === SIDES[ti].srName) ? SIDES[ti].name : t0.name || '';
      return `<div class="hist-team"><div class="hist-tn" style="color:${TEAM_COLORS[ti] || 'var(--muted)'}">${esc(nm)}</div>
        <div class="tscroll"><table><thead><tr><th></th>${CATS.map(catTh).join('')}</tr></thead><tbody>
        ${row(`${t('Snimak')} <span class="cnt">(${fmtDate(h.date)}, ${per})</span>`, snap)}
        ${row(`${t('Sada')} <span class="cnt">(${PERIODS.find(x => x.key === nowP).label})</span>`, cur)}
        ${row(sinceLabel, sinceT.counted ? sinceT : null, 'total')}
        </tbody></table></div></div>`;
    }).join('');
    detail = `<div class="hist-detail">
      <div class="hist-dh">${t('Trejd od {d}', { d: fmtDate(h.date) })} <button type="button" class="linkbtn" data-action="hist-close">${t('Zatvori')}</button></div>
      <p class="hint" style="padding:0 12px">${t('„Od trejda” = prosek samo utakmica posle datuma čuvanja, iz statistike po utakmici ({src}).', { src: DATA_SOURCE.name })}</p>
      ${blocks}</div>`;
  }

  const empty = synced ? t('Još nema sačuvanih trejdova. Klikni „Sačuvaj ideju” ili „Ponuda je poslata” ispod rezultata.') : t('Još nema sačuvanih trejdova. Klikni „Sačuvaj ideju” ili „Trejd se dogodio” ispod rezultata.');
  return `<h2 class="page-t">${t('Istorija trejdova')} <span class="hint">${state.history.length ? t('{n} sačuvano', { n: state.history.length }) : t('prazno')}</span></h2>
    <section class="card hist-page">
      ${list ? `<ul class="hist-list">${list}</ul><p class="hint hist-help">${t('Klik na trejd otvara ga u analizi trejda. 📊 prikazuje statistiku od trejda.')}</p>` : `<div class="empty-team">${empty}</div>`}
      ${detail}
      ${isSynced(currentLeague()) || !currentLeague() ? '' : importOnlyHTML(t('Prepoznavanje prihvaćenog trejda i datum obrade'))}
    </section>`;
}

/* =====================================================================
   Pretraga / autocomplete
   ===================================================================== */
function searchResults(query, taken = takenIds(), prefer = null) {
  const q = norm(query);
  // prazan upit: ponudi igrače sa rostera (npr. u Daješ prvo moj tim)
  if (!q) return prefer ? [...prefer].map(id => state.byId.get(id)).filter(p => p && !taken.has(p.id)).slice(0, CONFIG.DROPDOWN_MAX * 2) : [];
  const tokens = q.split(' ');
  const pref = [], starts = [], rest = [];
  for (const p of state.players) {
    if (taken.has(p.id)) continue;
    if (!tokens.every(t => p._n.includes(t))) continue;
    if (prefer?.has(p.id)) pref.push(p);
    else (p._n.split(' ').some(w => w.startsWith(tokens[0])) ? starts : rest).push(p);
  }
  // Lista je sortirana po % owned; prvo igrači sa rostera, pa oni čije ime počinje upitom
  return [...pref, ...starts, ...rest].slice(0, CONFIG.DROPDOWN_MAX);
}

/** Za ključ pretrage: koje igrače nuditi prve i kojom oznakom */
function searchPrefer(key) {
  const ds = key.match(/^(my|opp)-d$/);
  if (ds) { const r = rosterOf(ds[1]); return r?.players.length ? { set: new Set(rosterIds(r)), label: ds[1] === 'my' ? t('Moj tim') : r.name } : null; }
  if (key === String(GIVE)) return { set: new Set(rosterIds(state.rosters.my)), label: t('Moj tim') };
  if (key === String(GET) && rosterOf('opp')) return { set: new Set(rosterIds(rosterOf('opp'))), label: rosterOf('opp').name };
  return null;
}

function updateDropdown(key) {
  const inp = document.querySelector(`[data-search="${key}"]`);
  const dd = document.getElementById(`dd-${key}`);
  if (!inp || !dd) return;
  const ui = searchUI.get(key) || { query: '', sel: 0 };
  ui.query = inp.value;
  const results = searchFor(key, ui.query);
  ui.results = results;
  ui.sel = Math.min(ui.sel || 0, Math.max(results.length - 1, 0));
  searchUI.set(key, ui);
  const pref = searchPrefer(key);
  // "Dodaj u moj tim" u rezultatima, osim u pretrazi koja već dodaje na roster
  const showAddMy = !/^(my|opp|lt)-add$/.test(key) && key !== 'my-w' && !key.startsWith('tf-') && !key.startsWith('tt-') && !rosterLocked();
  const myIds = new Set(rosterIds(state.rosters.my));
  const myRoom = hasRoom(state.rosters.my);
  if (!results.length && !norm(ui.query)) { dd.hidden = true; inp.setAttribute('aria-expanded', 'false'); return; }
  dd.hidden = false;
  inp.setAttribute('aria-expanded', 'true');
  dd.innerHTML = results.length
    ? results.map((p, k) => `<li role="option" data-pick="${p.id}" data-key="${key}" aria-selected="${k === ui.sel}">
        ${avatarHTML(p)}<div class="dd-main"><div>${esc(p.name)} ${pref?.set.has(p.id) ? `<span class="slot-tag tag-mine">${esc(pref.label)}</span>` : ''}</div><div class="meta">${p.team} · ${posTxt(p)} ${injHTML(p)}${key === 'my-w' && statOf(p, 'season')?.MIN != null ? ` · ${fmt1(statOf(p, 'season').MIN)} min` : ''}</div></div>
        <button type="button" class="dd-prof" data-pm="${p.id}" title="${esc(t('Profil igrača: {n}', { n: p.name }))}" aria-label="${esc(t('Profil igrača: {n}', { n: p.name }))}">ⓘ</button>
        ${showAddMy && !myIds.has(p.id) ? `<button type="button" class="dd-addmy ${myRoom ? '' : 'is-disabled'}" data-addmy="${p.id}" ${myRoom ? `title="${esc(t('Dodaj u moj tim'))}"` : `aria-disabled="true" title="${esc(fullTip())}"`}>＋ ${t('Moj tim')}</button>` : ''}</li>`).join('')
    : `<li class="empty">${t('Nema igrača za „{q}“', { q: esc(ui.query) })}</li>`;
  if (key === 'my-w') placeFixedDD(inp, dd);
  dd.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
}

/**
 * Lista u redu Slobodno mesto je unutar tabele koja se skroluje (overflow), pa bi bila odsečena.
 * Zato je postavljamo fiksno uz polje: ispod njega, ili iznad kad dole nema mesta.
 */
function placeFixedDD(inp, dd) {
  const r = (inp.closest('.search-in') || inp).getBoundingClientRect();
  const vw = window.innerWidth, vh = window.innerHeight;
  const w = Math.min(Math.max(r.width, 300), vw - 16);
  const below = vh - r.bottom - 12, above = r.top - 12;
  const up = below < 220 && above > below;
  dd.classList.add('dd-fixed');
  Object.assign(dd.style, {
    visibility: r.bottom < 0 || r.top > vh ? 'hidden' : '',
    left: `${Math.max(8, Math.min(r.left, vw - w - 8))}px`, width: `${w}px`, right: 'auto',
    top: up ? 'auto' : `${r.bottom + 4}px`, bottom: up ? `${vh - r.top + 4}px` : 'auto',
    maxHeight: `${Math.max(140, Math.min(320, up ? above : below))}px`,
  });
}
const refixDD = () => document.querySelectorAll('.dd.dd-fixed:not([hidden])').forEach(dd => {
  const inp = document.querySelector(`[aria-controls="${dd.id}"]`);
  if (inp) placeFixedDD(inp, dd);
});
window.addEventListener('scroll', refixDD, { capture: true, passive: true });
window.addEventListener('resize', refixDD);

/** Pretraga zavisi od cilja: roster isključuje samo igrače već na rosteru */
function searchFor(key, query) {
  if (key.startsWith('tf-')) return searchResults(query, tfTaken());
  if (key === 'tt-lock') return ttLockSearch(query);
  if (key.startsWith('tt-')) return searchResults(query, ttTaken(key));
  const ds = key.match(/^(my|opp)-d$/);
  if (ds) {
    // Izbacuješ: bez igrača iz trejda (Daješ i Dobijaš) i već izabranih; prvo igrači sa rostera
    const ex = new Set([...takenIds(), ...slotIds(ds[1])]);
    const r = rosterOf(ds[1]);
    return searchResults(query, ex, r?.players.length ? new Set(rosterIds(r)) : null);
  }
  if (key === 'my-w') return spotSearch(query);
  const m = key.match(/^(my|opp|lt)-(add|w)$/);
  if (m) {
    const r = rosterOf(m[1]);
    const ex = new Set(rosterIds(r));
    if (m[2] === 'w') for (const id of [...takenIds(), ...slotIds(m[1])]) ex.add(id);
    return searchResults(query, ex);
  }
  const pref = searchPrefer(key);
  return searchResults(query, new Set([...takenIds(), ...slotIds('my'), ...slotIds('opp')]), pref?.set || null);
}

/** Slobodno mesto, Izaberi igrača: uvezena liga = pravi slobodni igrači lige; manuelna liga i bez lige = igrači koji nisu ni na jednom
    unetom rosteru. Redosled po skrivenoj vrednosti (stvarna vrednost za ostatak sezone, kao u Pojačanjima sa FA, pa povređeni padaju); prazan upit nudi najbolje. */
function spotSearch(query) {
  const lg = currentLeague(), B = tfBase();
  const ex = new Set([...takenIds(), ...slotIds('my'), ...slotIds('opp')]);
  const rosters = lg ? [lg.roster, ...Object.values(lg.opps || {})] : [state.rosters?.my, rosterOf('opp')];
  for (const r of rosters) for (const x of r?.players || []) ex.add(x.id);
  const tokens = norm(query) ? norm(query).split(' ') : [];
  const rv = new Map();
  for (const p of state.players) if (!ex.has(p.id) && tokens.every(tk => p._n.includes(tk))) { const v = B.real(p); if (v != null) rv.set(p.id, v); }
  return [...rv.keys()].sort((a, b) => rv.get(b) - rv.get(a)).slice(0, CONFIG.DROPDOWN_MAX).map(id => state.byId.get(id));
}

/** Ključ pretrage -> gde ide igrač: "0" = tim 0 dobija, "0:d" = izbacuje, "0:w" = waiver */
function pickPlayer(key, id) {
  if (key.startsWith('tf-')) { tfPick(key, id); return; } // Pronađi trejd bez lige
  if (key.startsWith('tt-')) { ttPick(key, id); return; } // Mete za trejd: moj tim bez lige, Dodaj protivnika
  const ds = key.match(/^(my|opp)-d$/);
  if (ds) {
    state.balance[ds[1]].drops.push(id); saveBalance();
    searchUI.set(key, { query: '', sel: 0 }); render();
    document.querySelector(`[data-search="${key}"]`)?.focus();
    return;
  }
  const m = key.match(/^(my|opp|lt)-(add|w)$/);
  if (m) {
    if (m[2] === 'add') addToRoster(m[1], id);
    else { state.balance[m[1]].waivers.push(id); saveBalance(); }
    searchUI.set(key, { query: '', sel: 0 }); render();
    document.querySelector(`[data-search="${key}"]`)?.focus();
    return;
  }
  if (takenIds().has(id)) return;
  const ti = +key, team = state.teams[ti];
  if (!team) return;
  team.ids.push(id);
  searchUI.set(key, { query: '', sel: 0 });
  saveState();
  render();
  document.querySelector(`[data-search="${key}"]`)?.focus();
}

function removePlayer(ti, id) {
  state.teams[ti].ids = state.teams[ti].ids.filter(x => x !== id);
  saveState();
  render();
}

/* =====================================================================
   Stranice lige: liga je kontekst (bira se u zaglavlju), alati su stranice koje dele iste podatke.
   Ruta: #league-{id}/{stranica}. Stavka se prikazuje u navigaciji tek kad je alat spreman (ready).
   ===================================================================== */
const NAV_ICON = {
  overview: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg>',
  team: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg>',
  league: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M8 6h13M8 12h13M8 18h13"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/></svg>',
  history: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/></svg>',
  finder: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3M8 11h6M11 8v6"/></svg>',
  targets: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/></svg>',
  fa: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="9" cy="8" r="4"/><path d="M2 21c1.2-3.5 3.8-5.5 7-5.5s5.8 2 7 5.5M19 8v6M16 11h6"/></svg>',
  trades: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 8h14l-4-4M20 16H6l4 4"/></svg>',
};
/** Zastavice alata: alat se pali ovde (kasnije se ovde zaključava za plaćeni plan) */
const FEATURES = { faPickups: true, tradeFinder: true, tradeTargets: true };
const featureOn = k => !!FEATURES[k];
/** Adresa stranice kad se razlikuje od id-ja (#league-{id}/free-agents) */
const PAGE_SLUG = { fa: 'free-agents', finder: 'find-trade', targets: 'trade-targets' };
const pageOfSlug = s => Object.keys(PAGE_SLUG).find(k => PAGE_SLUG[k] === s) || s;
const APP_PAGES = [
  { id: 'overview', sr: 'Pregled', ready: true },
  { id: 'team', sr: 'Moj tim', ready: true },
  { id: 'league', sr: 'Liga', ready: true },
  // grupa ALATI: redosled u meniju; zaključani alati (ready: false) otvaraju kratak opis, Istorija je uvek poslednja
  { id: 'trade', sr: 'Analiza trejda', group: 'trades', ready: true },
  { id: 'finder', sr: 'Pronađi trejd', group: 'trades', ready: featureOn('tradeFinder'), soon: 'Za igrača kog želiš ili kategoriju koja ti fali, predlaže trejdove sa timovima iz tvoje lige koji imaju smisla za obe strane.' },
  { id: 'targets', sr: 'Mete za trejd', group: 'trades', ready: featureOn('tradeTargets'), soon: 'Pokazuje igrače iz drugih timova u tvojoj ligi koji najviše pomažu tvom timu, i kojim timovima bi trejd takođe odgovarao.' },
  { id: 'fa', sr: 'Pojačanja sa FA', group: 'trades', ready: featureOn('faPickups'), soon: 'Iz tvoje uvezene lige pronalazi slobodne igrače koji odgovaraju tvom timu, uključujući one kojima minutaža raste.' },
  { id: 'history', sr: 'Istorija trejdova', group: 'trades', ready: true },
];
const pageReady = id => !!APP_PAGES.find(p => p.id === id && p.ready);
const pageLabel = id => t(APP_PAGES.find(p => p.id === id)?.sr || 'Pregled');
const tradePages = () => APP_PAGES.filter(p => p.group === 'trades' && p.ready);
const toolPages = () => APP_PAGES.filter(p => p.group === 'trades');
/** Zaključan alat: mali modal sa opisom, bez forme */
function openToolSoon(id) {
  const pg = APP_PAGES.find(p => p.id === id);
  if (!pg?.soon) return;
  showModal({ title: `${esc(t(pg.sr))} <span class="soon-tag">${t('Uskoro')}</span>`, body: `<p>${esc(t(pg.soon))}</p>`, cancel: null, confirm: t('U redu'), onConfirm: () => {} });
}

/**
 * Registar veza između stranica: izvor, uslov (proverava ga mesto prikaza), tekst, cilj, kontekst koji se prenosi.
 * on: false = upisano, isključeno dok alat ne postoji. replaces: veza koja zamenjuje drugu kad se uključi.
 * row: dugme uz red (ne broji se u ograničenje preporuka).
 */
const LINKS = [
  { id: 'ov-open-trade', from: 'overview', sr: 'Otvori u analizi', to: 'trade', ctx: ['tab'], row: true, on: true },
  { id: 'ov-ir', from: 'overview', sr: 'Prebaci na IR', to: 'team', ctx: ['player'], row: true, on: true },
  { id: 'ov-ir-back', from: 'overview', sr: 'Vrati sa IR', to: 'team', ctx: ['player'], row: true, on: true },
  { id: 'ov-few-teams', from: 'overview', sr: 'Unesi još timova da vidiš gde si jak a gde slab', to: 'league', ctx: [], on: true },
  { id: 'ov-empty', from: 'overview', sr: 'Unesi svoj roster', to: 'team', ctx: [], on: true },
  { id: 'team-trade', from: 'team', sr: 'Trejduj ga', to: 'trade', ctx: ['player'], row: true, on: true },
  { id: 'league-trade-with', from: 'league', sr: 'Trejduj sa ovim timom', to: 'trade', ctx: ['team'], row: true, on: true },
  { id: 'league-want', from: 'league', sr: 'Želim ga', to: 'trade', ctx: ['player', 'team'], row: true, on: true },
  { id: 'trade-edit-roster', from: 'trade', sr: 'Uredi roster', to: 'team', ctx: ['tab', 'team'], row: true, on: true },
  { id: 'trade-after-done', from: 'trade', sr: 'Pogledaj kako tim sada stoji', to: 'overview', ctx: [], on: true },
  { id: 'public-add-league', from: 'public', sr: 'Dodaj svoju ligu', to: 'app', ctx: ['tab'], on: true }, // javna početna (renderNudge)
  // isključene dok alati ne postoje
  { id: 'ov-weak-targets', from: 'overview', sr: 'Nađi mete za slabe kategorije', to: 'targets', ctx: ['cats'], on: false },
  { id: 'team-min-drop', from: 'team', sr: 'Nađi zamenu', to: 'finder', ctx: ['player'], row: true, on: false },
  { id: 'team-trade-finder', from: 'team', sr: 'Trejduj ga', to: 'finder', ctx: ['player'], row: true, replaces: 'team-trade', on: false },
  { id: 'league-finder', from: 'league', sr: 'Pronađi trejd', to: 'finder', ctx: ['team'], row: true, on: true },
  { id: 'targets-find', from: 'targets', sr: 'Nađi trejd za njega', to: 'finder', ctx: ['player', 'team'], row: true, on: false },
  { id: 'finder-open', from: 'finder', sr: 'Otvori u analizi', to: 'trade', ctx: ['tab', 'fromSearch'], row: true, on: false },
  { id: 'finder-empty', from: 'finder', sr: 'Proširi na druge timove', to: 'targets', ctx: [], on: false },
  { id: 'trade-better', from: 'trade', sr: 'Nađi trejd sa ovim timom', to: 'finder', ctx: ['team'], row: true, on: true },
];
const linkDef = id => LINKS.find(l => l.id === id);
/** Veza je aktivna: uključena, cilj postoji i nije je zamenila druga aktivna veza */
function linkOn(id) {
  const l = linkDef(id);
  if (!l || !l.on || (l.to !== 'app' && !pageReady(l.to))) return false;
  return !LINKS.some(x => x.replaces === id && x.on && pageReady(x.to));
}
/** Ograničenje preporuka: najviše 1 po kartici i 2 po stranici (dugmad uz redove se ne broje) */
let linkBudget = { page: 0, cards: new Set() };
function linkHTML(id, { attrs = '', cls = 'linkbtn', card = null, label = null } = {}) {
  if (!linkOn(id)) return '';
  const l = linkDef(id);
  if (!l.row) {
    if (linkBudget.page >= 2 || (card && linkBudget.cards.has(card))) return '';
    linkBudget.page++; if (card) linkBudget.cards.add(card);
  }
  return `<button type="button" class="${cls}" data-link="${id}" ${attrs}>${label || t(l.sr)}</button>`;
}

/* ---------- Navigacija između stranica: "Nazad" i pozicija skrola ---------- */
state.page = 'overview';
state.scrollMem = {};
state.leagueTeam = null; // tim otvoren na stranici Liga
state.back = (() => { try { return JSON.parse(sessionStorage.getItem('rs.back')); } catch { return null; } })();
const pageKey = () => `${state.scope}/${state.page}`;
const pageHash = (page, id = state.scope) => `#league-${id}/${PAGE_SLUG[page] || page}`;
function setBack(target) {
  state.back = { hash: location.hash, page: state.page, scope: state.scope, target };
  try { sessionStorage.setItem('rs.back', JSON.stringify(state.back)); } catch {}
}
function clearBack() { state.back = null; try { sessionStorage.removeItem('rs.back'); } catch {} }
function goPage(page, { back = false } = {}) {
  if (back) setBack(page);
  state.scrollMem[pageKey()] = scrollY;
  const h = pageHash(page);
  if (location.hash.split('&')[0] === h) { state.page = page; saveState(); render(); restoreScroll(); }
  else location.hash = h;
}
function restoreScroll() {
  const y = state.scrollMem[pageKey()] || 0;
  requestAnimationFrame(() => window.scrollTo(0, y));
}
addEventListener('scroll', () => { if (state.view === 'league') state.scrollMem[pageKey()] = scrollY; }, { passive: true });

/** "Nazad na …" po stranici (srpski padež) */
const BACK_LABEL = { finder: 'Nazad na Pronađi trejd', targets: 'Nazad na Mete za trejd', overview: 'Nazad na Pregled', team: 'Nazad na Moj tim', league: 'Nazad na Ligu', trade: 'Nazad na Analizu trejda', history: 'Nazad na Istoriju trejdova' };
function backbarHTML() {
  const b = state.back;
  if (!b || b.scope !== state.scope || b.target !== state.page) return '';
  return `<div class="backbar"><button type="button" class="linkbtn" data-action="go-back">← ${t(BACK_LABEL[b.page] || 'Nazad na Pregled')}</button></div>`;
}

/** Analiza: svaka veza otvara NOVI tab; ako tab sa istim igračima postoji, prebacuje na njega. Postojeći tabovi se ne gaze. */
function openInAnalysis(lists, { opp = null } = {}) {
  if (opp && state.rosters.opps[opp]) { state.rosters.oppSel = opp; saveRosters(); state.balance && (state.balance.opp = { drops: [], waivers: [] }); }
  const key = l => l.map(x => [...x].sort().join(',')).join('|');
  const s = scopeTabs();
  const same = s.tabs.find(tb => key(tb.teams.map(x => x.ids)) === key(lists));
  if (same) activateTab(same.id); else addTab(lists);
  if (opp) state.balance.opp = { drops: [], waivers: [] };
  state.histView = null; state.sharedOpen = false; searchUI.clear();
  persistTrades();
}

/** Izvršavanje veze iz registra, sa kontekstom iz data-* atributa */
function followLink(id, ds) {
  if (!linkOn(id)) return;
  const l = linkDef(id);
  const pid = ds.player ? +ds.player : null;
  switch (id) {
    case 'ov-open-trade': setBack('trade'); activateTab(ds.tab); state.histView = null; searchUI.clear(); persistTrades(); goPage('trade'); return;
    case 'ov-ir': case 'ov-ir-back': closeModal(); state.ui.highlight = pid; setBack('team'); goPage('team'); return;
    case 'ov-few-teams': case 'ov-empty': setBack(l.to); goPage(l.to); return;
    case 'team-trade': setBack('trade'); openInAnalysis([[pid], []]); goPage('trade'); return;
    case 'league-trade-with': setBack('trade'); openInAnalysis([[], []], { opp: ds.opp }); goPage('trade'); return;
    case 'league-want': setBack('trade'); openInAnalysis([[], [pid]], { opp: ds.opp }); goPage('trade'); return;
    case 'trade-edit-roster':
      if (ds.kind === 'opp') { state.leagueTeam = state.rosters.oppSel || null; setBack('league'); goPage('league'); }
      else { setBack('team'); goPage('team'); }
      return;
    case 'league-finder': openFinder({ opp: ds.opp }); return;
    case 'trade-better': openFinder({ opp: state.rosters.oppSel }); return;
    case 'trade-after-done': state.notice = null; state.noticeLink = null; setBack('overview'); goPage('overview'); return;
  }
}

/* ---------- Zbirovi timova i rang među unetim timovima ---------- */
const activeIdsOf = r => (r ? r.players.filter(x => !x.ir).map(x => x.id) : []);
/** Uneti timovi lige: moj (ako ima igrača) + protivnici sa igračima */
function enteredTeams() {
  const list = [];
  if (state.rosters.my?.players.length) list.push({ id: 'my', name: t('Moj tim'), r: state.rosters.my });
  for (const [oid, o] of oppList()) if (o.players.length) list.push({ id: oid, name: o.name, r: o });
  return list.map(x => ({ ...x, tot: sumPlayers(activeIdsOf(x.r)) }));
}
/** Rang kategorija za tim među unetim timovima (1 = najbolji); null ako je uneto manje od 3 tima */
function catRanks(teamId, teams = enteredTeams()) {
  if (teams.length < 3) return null;
  const me = teams.find(x => x.id === teamId);
  if (!me) return null;
  return CATS.filter(c => !isPunt(c)).map(c => {
    const v = me.tot.vals[c.key];
    if (v == null) return null;
    const better = teams.filter(x => x.tot.vals[c.key] != null && (c.lowerIsBetter ? x.tot.vals[c.key] < v - EPS : x.tot.vals[c.key] > v + EPS)).length;
    return { c, rank: better + 1, of: teams.length };
  }).filter(Boolean);
}
const strongWeak = ranks => {
  const s = [...ranks].sort((a, b) => a.rank - b.rank);
  return { strong: s.slice(0, 2), weak: s.slice(-2).reverse() };
};
const catVal = (c, v) => (v == null ? '–' : fmtCat(c, v));
const enteredCount = () => (state.rosters.my?.players.length ? 1 : 0) + oppList().filter(([, o]) => o.players.length).length;

/** Rezultat taba (bez menjanja aktivnog taba) */
function tabScore(tab) {
  const keep = [state.teams, state.balance];
  state.teams = tab.teams; state.balance = tab.balance;
  try {
    const totals = state.teams.map(teamTotals), cmp = FMT().compareSides(totals);
    return cmp.active.length >= 2 ? { get: cmp.score[GET], give: cmp.score[GIVE], ties: cmp.ties, points: cmp.points } : null;
  } finally { [state.teams, state.balance] = keep; }
}
const namesOf = ids => (ids.length ? ids.map(id => esc(state.byId.get(id)?.name || `#${id}`)).join(', ') : '…');

/* ---------- Vesti za moj roster (upozorenja na Pregledu) ---------- */
let rosterNewsBusy = false;
function ensureRosterNews() {
  if (rosterNewsBusy || !state.players.length) return;
  const need = rosterIds(state.rosters.my).filter(id => { const c = state.news.get(id); return !c || Date.now() - c.ts >= CONFIG.NEWS_TTL_MS; });
  if (!need.length) return;
  rosterNewsBusy = true;
  Promise.all(need.map(fetchNews)).finally(() => { rosterNewsBusy = false; if (state.page === 'overview') render(); });
}

/* ---------- Alerti (Pregled): pravila lige, pamćenje statusa po ligi, sakrivanje ---------- */
const ALERT = { STATUS_HOURS: 72, LONG_OUT_DAYS: 7, LONG_OUT_GAMES: 4, NEWS_HOURS: 24, OFFER_DAYS: 2, MAX: 4, HIDDEN_NEWS_MS: 2 * 864e5 };
const LONG_OUT_FLAGS = ['out for the season', 'out indefinitely', 'surgery news'];
/** Vest o statusu igrača (povreda, povratak, ograničenje), ne izveštaj sa utakmice */
const STATUS_SEEN_KEY = 'fbaTrade.statusSeen.v2';   // { [leagueId]: { [pid]: [grupa, od, prethodna, oznaka] } }, bez imena
const ALERTS_HIDDEN_KEY = 'fbaTrade.alertsHidden.v1'; // { [leagueId]: { [ključ alerta]: kada je sakriven } }

/** Pravila lige: iz podešavanja platforme (uvezene lige) ili od korisnika (ručne i nalepljene). null = nepoznato. */
function leagueRules(lg = currentLeague()) {
  const imp = isSynced(lg) ? lg.import : null;
  if (!imp) return { synced: false, irSlots: lg?.slots?.ir ?? null, irRule: null, irLabels: null, irNote: false, irLock: false, reviewHours: null, deadline: lg?.deadline || null, deadlineApprox: false, deadlineWeek: null };
  return {
    synced: true,
    irSlots: imp.irSlotsKnown === false ? null : lg.slots?.ir ?? null, // platforma ne daje broj IR mesta: procena, ne koristi se u alertima
    irRule: imp.irRule || null, irLabels: imp.irLabels || null, irNote: !!imp.irNote, irLock: !!imp.irLock,
    reviewHours: imp.reviewHours ?? null, deadline: imp.deadline || null, deadlineApprox: !!imp.deadlineApprox, deadlineWeek: imp.deadlineWeek || null,
  };
}
const irRuleList = R => R.irRule.map(k => R.irLabels?.[k] || k);
const irRuleText = R => irRuleList(R).join(', ');

/* ---------- Status igrača iz zajedničkog modela (uvezena liga: iz lige, ručna: ESPN baza) ---------- */
const leagueEntryCache = new WeakMap();
/** Igrač sa bilo kog rostera uvezene lige, po ID-ju (keš se pravi iznova kad se roster promeni) */
function leagueEntry(lg, id) {
  const rs = [lg.roster, ...Object.values(lg.opps || {})];
  let c = leagueEntryCache.get(lg);
  if (!c || c.rs.length !== rs.length || c.rs.some((r, i) => r !== rs[i] || r?.players !== c.ps[i])) {
    const map = new Map();
    for (const r of rs) for (const x of r?.players || []) map.set(x.id, x);
    c = { rs, ps: rs.map(r => r?.players), map }; leagueEntryCache.set(lg, c);
  }
  return c.map.get(id) || null;
}
/** Status igrača u ligi: { inj, g, lb, key, espn }. Isti igrač u dve lige može imati različit status. */
function playerStatus(p, lg = currentLeague()) {
  const imp = isSynced(lg) ? lg.import : null;
  const fromLeague = imp?.stFrom === 'league';
  return resolveStatus(fromLeague ? leagueEntry(lg, p.id) : null, p.inj, fromLeague, !!imp && (!fromLeague || imp.stMarkFa));
}
const injOf = (p, lg) => playerStatus(p, lg).inj;
const stShort = inj => (INJURY[inj]?.short === 'O' ? 'OUT' : INJURY[inj]?.short || inj);
/** Kratka oznaka za prikaz: kako je ima platforma lige, uz "(ESPN)" kad platforma ne daje status */
const stLabel = s => (s.g === 'OK' ? '' : `${s.lb || stShort(s.inj)}${s.espn ? ' (ESPN)' : ''}`);
/** Status igrača u ligi za alerte: { g: OK | DTD | OUT | SSPD, label, key (za IR pravilo) } */
function leagueStatus(lg, x, p) {
  const s = playerStatus(p, lg);
  return { g: s.g, label: stLabel(s), key: s.key };
}
function leagueStatusMem(lg, rows) {
  const all = lsGet(STATUS_SEEN_KEY) || {};
  const { mem, changed } = trackStatus(all[lg.id] || null, rows.map(({ x, s }) => ({ id: x.id, g: s.g, label: s.label })), Date.now());
  if (changed) { all[lg.id] = mem; lsSet(STATUS_SEEN_KEY, all); }
  return mem;
}
/** Aktivni alerti za moj roster, po važnosti (sakriveni su izbačeni) */
function rosterAlerts() {
  const lg = currentLeague(), r = state.rosters.my;
  if (!lg || !r?.players.length || !state.players.length) return [];
  const now = Date.now(), R = leagueRules(lg), out = [], manual = !isSynced(lg);
  const rows = r.players.map(x => { const p = state.byId.get(x.id); return p ? { x, p, s: leagueStatus(lg, x, p) } : null; }).filter(Boolean);
  const mem = leagueStatusMem(lg, rows);
  const irFree = R.irSlots != null ? irCount(r) < R.irSlots : null;
  for (const { x, p, s } of rows) {
    const n = esc(p.name), rec = mem[x.id], since = rec?.[1] || 0, f = playerFacts(p), lbl = esc(s.label);
    if (x.ir) {
      // igrač na IR mestu sa statusom koji liga tamo ne dozvoljava
      const v = irVerdict(R.irRule, s.key);
      const txt = v === 'bad' && R.irLock ? t('{n} je na IR mestu, a više nema oznaku {l}. Dok je tamo, ne možeš da dodaješ nove igrače.', { n, l: esc(orJoin(irRuleList(R), t('ili'))) })
        : v === 'bad' ? (s.g === 'OK' ? t('{n} je zdrav, a još je na IR. Vrati ga u postavu.', { n }) : t('{n} je {s}, a ova liga na IR dozvoljava samo: {l}.', { n, s: lbl, l: esc(irRuleText(R)) }))
        : v === 'unknown' && s.g !== 'OUT' ? t('{n} na IR-u više nije OUT, proveri da li možeš da ga zadržiš tamo.', { n }) : '';
      if (txt) out.push({ key: `irback:${x.id}:${since}:${s.label}`, p, ts: since || now, kind: 'irback', txt, btn: manual ? linkHTML('ov-ir-back', { attrs: `data-player="${p.id}"` }) : '' });
      continue;
    }
    let irAlert = false;
    if (s.g === 'OUT' && R.irSlots !== 0 && irFree !== false && irVerdict(R.irRule, s.key) !== 'bad') {
      // dugo OUT: 7+ dana od promene statusa, 4+ propuštene utakmice ili vest o operaciji / kraju sezone
      const days = since ? Math.floor((now - since) / 864e5) : null, missed = f.missed;
      const long = (days != null && days >= ALERT.LONG_OUT_DAYS) || (missed != null && missed >= ALERT.LONG_OUT_GAMES) || f.flags.some(fl => LONG_OUT_FLAGS.includes(fl.f.en));
      if (long) {
        const howLong = missed >= ALERT.LONG_OUT_GAMES ? t('{n} je OUT već {m} utakmica.', { n, m: missed }) : days >= ALERT.LONG_OUT_DAYS ? t('{n} je OUT već {d}.', { n, d: daysTxt(days) }) : t('{n} je OUT na duže.', { n });
        const sure = irFree === true && irVerdict(R.irRule, s.key) === 'ok';
        out.push({ key: `ir:${x.id}:${since}`, p, ts: since || now, kind: 'ir', txt: `${howLong} ${sure ? t('Prebaci ga na IR, mesto je slobodno.') : t('Ako tvoja liga to dozvoljava i imaš slobodno IR mesto, prebaci ga na IR.')}`,
          btn: manual ? linkHTML('ov-ir', { attrs: `data-player="${p.id}"` }) : '' });
        irAlert = true;
      }
    }
    // nova promena statusa: jednom, 72 h posle promene; oznaka kako je ima platforma lige
    if (statusEvent(rec, now, ALERT.STATUS_HOURS) && !irAlert) {
      const txt = s.g === 'OK' ? t('{n} se vratio, ponovo je zdrav.', { n }) : t('{n}: novi status {s}.', { n, s: lbl });
      out.push({ key: `st:${x.id}:${since}`, p, ts: since, kind: s.g === 'OK' ? 'back' : 'inj', txt: `${txt} <span class="al-ago">${timeAgo(since)}</span>` });
    }
    // nagli pad minuta (↓↓): poslednjih 15 dana vs sezona
    if (f.minS != null && f.minR != null && f.minR <= f.minS - MINUTES.STRONG) out.push({ key: `min:${x.id}`, p, ts: now, kind: 'min', txt: t('{n}: minutaža naglo pada, {a} → {b} min poslednjih 15 dana.', { n, a: Math.round(f.minS), b: Math.round(f.minR) }) });
    // vest iz poslednja 24 h (o statusu igrača, bez izveštaja sa utakmica); najnovija po igraču
    const it = newsOf(p.id).find(v => isRecent(v.published, ALERT.NEWS_HOURS / 24) && (isStatusNews(v.headline) || f.flags.some(fl => fl.n === v)));
    if (it) out.push({ key: `news:${x.id}:${it.published}`, p, ts: Date.parse(it.published) || 0, kind: 'news', txt: `${n}: ${esc(it.headline)}`, tip: newsTipHTML(it) });
  }
  // rok za trejdove za 7 dana ili manje (samo kad je rok poznat)
  if (R.deadline && R.deadline > now && R.deadline - now <= IMPORT.DEADLINE_WARN_DAYS * 864e5) {
    out.push({ key: `dl:${R.deadline}`, ts: now, kind: 'dl', txt: deadlineText(R), btn: `<a class="linkbtn" href="${pageHash('trade')}" data-goto="trade">${t('Analiza trejda')}</a>` });
  }
  // poslata ponuda bez odgovora duže od 2 dana
  for (const h of sentOffers(lg)) {
    const at = new Date(h.date).getTime();
    if (!(at > 0) || now - at <= ALERT.OFFER_DAYS * 864e5) continue;
    out.push({ key: `offer:${h.id}`, ts: at, kind: 'offer', txt: t('Ponuda {o} čeka odgovor već {d}.', { o: `<b>${esc(offerTitle(h))}</b>`, d: daysTxt(Math.floor((now - at) / 864e5)) }),
      btn: `<button type="button" class="linkbtn" data-action="ov-hist" data-id="${h.id}">${t('Otvori trejd')}</button>` });
  }
  // sakriveni: važe dok se ne desi nova promena (novi ključ); vesti se pamte 2 dana jer stižu tek posle učitavanja
  const hiddenAll = lsGet(ALERTS_HIDDEN_KEY) || {}, before = hiddenAll[lg.id] || {};
  const active = new Set([...out.map(a => a.key), ...Object.keys(before).filter(k => k.startsWith('news:') && now - before[k] < ALERT.HIDDEN_NEWS_MS)]);
  const hid = keepHidden(before, active);
  if (Object.keys(hid).length !== Object.keys(before).length) { hiddenAll[lg.id] = hid; lsSet(ALERTS_HIDDEN_KEY, hiddenAll); }
  return sortAlerts(out.filter(a => !hid[a.key]));
}
function hideAlert(key) {
  const lg = currentLeague();
  if (!lg || !key) return;
  const all = lsGet(ALERTS_HIDDEN_KEY) || {};
  (all[lg.id] ||= {})[key] = Date.now();
  lsSet(ALERTS_HIDDEN_KEY, all);
  if (document.querySelector('#modal .alerts')) { closeModal(); if (rosterAlerts().length) showAllAlerts(); }
  render();
}
const ALERT_ICON = { news: '📰', min: '⏬', ir: '⚕', irback: '⚕', inj: '🩹', back: '✅', dl: '⏱', offer: '📨' };
/** Lista alerta. Kartica na Pregledu: X u gornjem desnom uglu (tooltip Sakrij), dugme akcije u istom redu. Modal: dugme Sakrij. */
const alertsListHTML = (list, { compact = false } = {}) => `<ul class="alerts${compact ? ' compact' : ''}">${list.map(a => {
  const txt = `${ALERT_ICON[a.kind] || '•'} ${a.p ? a.txt.replace(esc(a.p.name), pmLink(a.p.id, a.p.name)) : a.txt}`;
  const hide = `data-action="al-hide" data-key="${esc(a.key)}"`;
  return `<li class="al-${a.kind}" ${a.tip ? `data-tip-html="${esc(a.tip)}"` : ''}>${compact
    ? `<span class="al-txt">${txt}${a.btn ? ` ${a.btn}` : ''}</span><button type="button" class="al-xbtn" ${hide} title="${esc(t('Sakrij'))}" aria-label="${esc(t('Sakrij'))}">✕</button>`
    : `<span>${txt}</span><span class="al-act">${a.btn || ''}<button type="button" class="linkbtn al-x" ${hide}>${t('Sakrij')}</button></span>`}</li>`;
}).join('')}</ul>`;
/** Svi aktivni alerti, isti izgled kao kartica */
function showAllAlerts() {
  const list = rosterAlerts();
  showModal({ title: t('Upozorenja'), wide: true, cancel: t('Zatvori'),
    body: list.length ? alertsListHTML(list) : `<p class="pnote">${t('Nema upozorenja za tvoje igrače.')}</p>` });
}

/* ---------- Stranica: Pregled ---------- */
/** Kartica Moj tim ukratko: lestvica (3 tima oko mene, linija plejofa) i forma rostera. Fiksne visine, kao kartica Upozorenja. */
function teamGlanceHTML(lg, r) {
  const st = lg.standings || {}, n = lg.teams || '?';
  const head = `<h3 class="tg-h"><span>${esc(lg.teamName || t('Moj tim'))}</span>${st.rank ? `<span class="tg-tag">${t('{n}. od {m}', { n: st.rank, m: n })}</span>` : ''}</h3>`;
  // lestvica: uvezena liga ima celu tabelu
  const teams = isSynced(lg) ? [...lg.import.teams].sort((a, b) => (a.seed || 99) - (b.seed || 99)) : [];
  const mi = teams.findIndex(x => x.tid === lg.import?.myTid);
  const pts = isPointsFmt(), poTeams = st.playoffTeams || lg.import?.playoffTeams || null;
  let ladder;
  if (mi >= 0 && teams.length >= 2) {
    const me = teams[mi], hasRec = tm => tm.record && tm.record.w + tm.record.l + tm.record.t > 0;
    const gap = tm => {
      if (hasRec(tm) && hasRec(me)) { const g = Math.abs((tm.record.w - tm.record.l) - (me.record.w - me.record.l)) / 2; return g ? { g: fmtNum(g), unit: 'W' } : null; }
      const d = Math.abs((tm.pf || 0) - (me.pf || 0)); return d ? { g: fmtNum(Math.round(d * 10) / 10), unit: 'P' } : null;
    };
    const rel = (tm, above) => { const x = gap(tm); if (!x) return `<span class="tg-gap">${t('izjednačeno')}</span>`;
      return `<span class="tg-gap ${above ? 'up' : 'dn'}">${x.unit === 'W' ? t(above ? '{n} pob. ispred' : '{n} pob. iza', { n: x.g }) : t(above ? '{n} poena ispred' : '{n} poena iza', { n: x.g })}</span>`; };
    const i0 = Math.max(0, Math.min(mi - 1, teams.length - 3));
    const shown = teams.slice(i0, i0 + 3);
    const rows = shown.map((tm, k) => {
      const isMe = tm === me, seed = tm.seed || i0 + k + 1;
      const line = poTeams && seed === poTeams && k < shown.length - 1 ? `<li class="tg-cut" aria-hidden="true"><span>${t('linija plejofa')}</span></li>` : '';
      return `<li class="tg-row${isMe ? ' me' : ''}"><span class="tg-seed">${seed}</span><span class="tg-name">${esc(tm.name)}</span>${isMe ? '<span></span>' : rel(tm, k < shown.indexOf(me))}<span class="tg-rec">${standTxt(tm, pts)}</span></li>${line}`;
    }).join('');
    const mySeed = me.seed || mi + 1;
    const po = poTeams ? `<p class="tg-po">${mySeed <= poTeams ? t('U zoni plejofa (top {n}).', { n: poTeams }) : t('{n} mesta do zone plejofa (top {m}).', { n: mySeed - poTeams, m: poTeams })}</p>` : '';
    ladder = `<ol class="tg-ladder">${rows}</ol>${po}`;
  } else {
    // ručna i nalepljena liga: mesto i skor iz podešavanja
    const po = st.rank && poTeams ? `<p class="tg-po">${st.rank <= poTeams ? t('U zoni plejofa (top {n}).', { n: poTeams }) : t('{n} mesta do zone plejofa (top {m}).', { n: st.rank - poTeams, m: poTeams })}</p>` : '';
    ladder = st.rank || st.record
      ? `${st.record ? `<div class="tg-manual"><b>${esc(st.record)}</b><span>${t('Skor')}</span></div>` : ''}${po}`
      : `<p class="tg-po">${t('Unesi mesto i skor u podešavanjima lige da vidiš gde stojiš.')}</p>`;
  }
  // forma rostera: status iz platforme lige (Sleeper, ESPN liga) ili ESPN
  const groups = { OK: [], DTD: [], OUT: [] };
  for (const x of r.players) { const p = state.byId.get(x.id); if (!p) continue; const g = leagueStatus(lg, x, p).g; (g === 'OK' ? groups.OK : g === 'DTD' ? groups.DTD : groups.OUT).push(p.name); }
  const tile = (k, label, cls) => `<div class="tg-tile ${cls}" ${groups[k].length && k !== 'OK' ? `data-tip="${esc(groups[k].join(', '))}"` : ''}><b>${groups[k].length}</b><span>${label}</span></div>`;
  return `<section class="pcard ov-glance">${head}
    <div class="tg-lbl">${t('Trka za plejof')}</div>${ladder}
    <div class="tg-lbl">${t('Forma rostera')}</div>
    <div class="tg-form">${tile('OK', t('zdravih'), 'ok')}${tile('DTD', 'DTD', 'dtd')}${tile('OUT', 'OUT', 'out')}</div>
    <div class="tg-foot">${t('{a}/{b} aktivnih · {c}/{d} IR', { a: activeCount(r), b: ROSTER.ACTIVE, c: irCount(r), d: ROSTER.IR })} · ${t('Ažurirano: {d}', { d: fmtShortDate(r.updated) })}</div></section>`;
}
/** Kartice na vrhu Pregleda imaju istu visinu: alerti koji ne staju se kriju, ostaju u Prikaži sve */
function fitAlerts(root) {
  const card = root.querySelector('.ov-alerts'), ul = card?.querySelector('.alerts');
  if (!ul) return;
  const lis = [...ul.children];
  lis.forEach(li => { li.hidden = false; });
  const bottom = ul.getBoundingClientRect().bottom;
  let shown = 0;
  lis.forEach((li, i) => { if (i > 0 && li.getBoundingClientRect().bottom > bottom + 1) li.hidden = true; else shown++; });
  const btn = card.querySelector('.al-all');
  if (btn) btn.hidden = +card.dataset.total <= shown;
}
window.addEventListener('resize', () => { if (state.page === 'overview' && state.view === 'league') fitAlerts($('#page')); });

function renderOverview() {
  const lg = currentLeague(), r = state.rosters.my;
  const H = `<h2 class="page-t">${t('Pregled')}</h2>`;
  if (!r.players.length && isSynced(lg)) {
    return `${H}<div class="pcard empty-cta"><h3>${t('Koji je tvoj tim?')}</h3>
      <p>${t('Liga je uvezena, ali tvoj tim još nije izabran. Izaberi ga u podešavanjima lige.')}</p>
      <button type="button" class="btn" data-action="league-settings">⚙ ${t('Podešavanja lige')}</button></div>`;
  }
  if (!r.players.length) {
    return `${H}<div class="pcard empty-cta"><h3>${t('Počni od svog tima')}</h3>
      <p>${t('Unesi igrače sa svog rostera ({a} aktivnih + {b} IR). Posle toga ovde vidiš kategorije tima, upozorenja i otvorene trejdove.', { a: ROSTER.ACTIVE, b: ROSTER.IR })}</p>
      ${linkHTML('ov-empty', { cls: 'btn', card: 'empty' })}</div>`;
  }
  ensureRosterNews();
  const summary = teamGlanceHTML(lg, r);

  const teams = enteredTeams();
  const me = teams.find(x => x.id === 'my');
  const ranks = catRanks('my', teams);
  const rk = ranks ? Object.fromEntries(ranks.map(x => [x.c.key, x])) : {};
  const sw = ranks ? strongWeak(ranks) : null;
  const tag = c => !sw ? '' : sw.strong.some(x => x.c === c) ? `<span class="slot-tag tag-in">${t('jak')}</span>` : sw.weak.some(x => x.c === c) ? `<span class="slot-tag tag-out">${t('slab')}</span>` : '';
  // poeni: ukupni FPts tima i tri statistike koje donose najviše poena
  const fptsRank = teams.length >= 3 && me ? teams.filter(x => (x.tot.vals.FPTS ?? 0) > (me.tot.vals.FPTS ?? 0) + EPS).length + 1 : null;
  const topSrc = me ? pointSources(me.tot.sum) : [];
  const cats = isPointsFmt() ? `<section class="pcard"><h3>${t('Poeni mog tima')}</h3>
    <div class="catgrid"><div class="catcell fpts"><span class="cl">FPts</span><b>${catVal(FPTS_COL, me?.tot.vals.FPTS)}</b>${fptsRank ? `<span class="rk">${t('{n}. od {m}', { n: fptsRank, m: teams.length })}</span>` : ''}</div>
      ${topSrc.map(x => `<div class="catcell"><span class="cl">${x.c.label}</span><b>${x.v.toFixed(1)}</b><span class="rk">${t('FPts iz {s}', { s: x.c.label })}</span></div>`).join('')}</div>
    <p class="pnote">${t('Fantasy poeni po utakmici, zbir aktivnih igrača, {p}. Tri statistike koje timu donose najviše poena.', { p: PERIODS.find(p => p.key === state.period).label.toLowerCase() })}${teams.length < 3 ? ` ${t('Rang se prikazuje kad uneseš bar 3 tima.')}` : ''}</p>${notCountedHTML()}</section>`
  : `<section class="pcard now-cats"><h3>${t('Snaga trenutnog rostera')} <span class="cchip now">${t('od sada')}</span><span class="i" data-tip="${esc(t('Koliko je jak tvoj roster od danas: proseci po utakmici igrača koje sada imaš, poređeni sa trenutnim rosterima ostalih timova. Ne zavisi od broja odigranih utakmica ni od igrača koji su ranije bili u timu. Na ovo utiče trejd.'))}">ⓘ</span></h3>
    <div class="catgrid">${CATS.map(c => `<div class="catcell${puntCls(c)}"><span class="cl">${c.label}</span><b>${catVal(c, me?.tot.vals[c.key])}</b>
      ${rk[c.key] ? `<span class="rk">${t('{n}. od {m}', { n: rk[c.key].rank, m: rk[c.key].of })}</span>` : ''}${tag(c)}</div>`).join('')}</div>
    ${ranks ? `<p class="pnote">${t('Prosek po utakmici, zbir aktivnih igrača koje sada imaš ({p}). Rang među trenutnim rosterima {n} timova.', { n: teams.length, p: PERIODS.find(p => p.key === state.period).label.toLowerCase() })}</p>`
      : `<p class="pnote">${t('Zbir aktivnih igrača. Uneto {a} od {b} timova.', { a: teams.length, b: lg.teams || '?' })}</p>${linkHTML('ov-few-teams', { card: 'cats' })}`}${notCountedHTML()}</section>`;

  const alerts = rosterAlerts();
  const alertsCard = `<section class="pcard ov-alerts" data-total="${alerts.length}"><h3>${t('Upozorenja')}${alerts.length ? ` <span class="ov-cnt">${alerts.length}</span>` : ''}</h3>${alerts.length
    ? `${alertsListHTML(alerts.slice(0, ALERT.MAX), { compact: true })}<button type="button" class="linkbtn al-all" data-action="all-alerts" ${alerts.length > ALERT.MAX ? '' : 'hidden'}>${t('Prikaži sve ({n})', { n: alerts.length })} →</button>`
    : `<p class="pnote">${t('Nema upozorenja za tvoje igrače.')}</p>`}${isSynced(lg) ? '' : importOnlyHTML(t('IR pravila lige u upozorenjima'))}</section>`;

  const tabs = scopeTabs().tabs.filter(tabHasPlayers);
  const tradesCard = `<section class="pcard"><h3>${t('Otvoreni trejdovi')}</h3>${tabs.length
    ? `<ul class="olist">${tabs.map(tb => { const sc = tabScore(tb); return `<li><button type="button" class="orow" data-link="ov-open-trade" data-tab="${tb.id}">
        <span class="os"><span class="give-t">${namesOf(tb.teams[GIVE].ids)}</span> → <span class="get-t">${namesOf(tb.teams[GET].ids)}</span></span>
        ${sc?.points ? `<span class="osc"><b class="${sc.points.diff > 0.05 ? 'w' : sc.points.diff < -0.05 ? 'l' : ''}">${fmtPts(sc.points.diff)}</b> ${t('FPts po utakmici')}</span>`
          : sc ? `<span class="osc"><span class="get-t">${t('Dobijaš')}</span> <b class="${sc.get > sc.give ? 'w' : ''}">${sc.get}</b> : <b class="${sc.give > sc.get ? 'l' : ''}">${sc.give}</b> <span class="give-t">${t('Daješ')}</span>${sc.ties ? `<small>${t('{n} nerešeno', { n: sc.ties })}</small>` : ''}</span>` : ''}</button></li>`; }).join('')}</ul>`
    : `<p class="pnote">${t('Nema otvorenih trejdova.')}</p>`}</section>`;

  const hist = state.history.slice(0, 3);
  const histCard = hist.length ? `<section class="pcard"><h3>${t('Poslednji trejdovi')}</h3><ul class="olist">${hist.map(h => `<li><button type="button" class="orow" data-action="ov-hist" data-id="${h.id}">
      <span class="os"><span class="hist-date">${fmtDate(h.date)} · ${histTagHTML(h, false)}</span><br>${(h.teams[GIVE]?.ids || []).map(id => esc(h.names?.[id] || state.byId.get(id)?.name || id)).join(', ') || '–'} → ${(h.teams[GET]?.ids || []).map(id => esc(h.names?.[id] || state.byId.get(id)?.name || id)).join(', ') || '–'}</span></button></li>`).join('')}</ul></section>` : '';

  const ranksCard = isSynced(lg) ? importRanksHTML(lg) : isPointsFmt() ? '' : importOnlyHTML(t('Stvarni plasman u sezoni'));
  return `${H}<div class="pgrid ov-top">${summary}${alertsCard}</div>${cats}${ranksCard}<div class="pgrid">${tradesCard}${histCard}</div>`;
}

/* ---------- Uređivanje sačuvanog rostera (Moj tim i timovi u Ligi) ---------- */
/** kind: 'my' ili 'lt' (tim otvoren u Ligi). rowActions(p, x) vraća dugmad uz red. */
function savedRosterTable(kind, rowActions) {
  const r = rosterOf(kind);
  const P = id => state.byId.get(id);
  const hl = state.ui.highlight;
  const rows = [];
  const ordered = ir => { const by = new Map(r.players.map(x => [x.id, x])); return sortIds(kind, r.players.filter(y => !!y.ir === ir).map(y => y.id)).map(id => by.get(id)); };
  for (const x of ordered(false)) { const p = P(x.id); if (p) rows.push(rosterRow(p, kind, { actions: rowActions(p, x), saved: true, cls: hl === p.id ? 'hl' : '' })); }
  const ir = ordered(true);
  if (ir.length) {
    rows.push(`<tr class="irhead"><td colspan="${CATS.length + 3}">${t('IR · ne računa se u zbirove ({a}/{b})', { a: ir.length, b: ROSTER.IR })}</td></tr>`);
    for (const x of ir) { const p = P(x.id); if (p) rows.push(rosterRow(p, kind, { tags: [{ text: 'IR', cls: 'tag-ir' }], cls: `ir ${hl === p.id ? 'hl' : ''}`, actions: rowActions(p, x), saved: true, ir: true })); }
  }
  const tot = sumPlayers(activeIdsOf(r));
  return `<div class="tscroll"><table class="rtable"><thead>${rosterHeaderRow(kind)}</thead><tbody>${rows.join('')}</tbody>
    <tfoot>${summaryRows(tot, tot, false)}</tfoot></table></div>`;
}
function rosterEditorHTML(kind, rowActions, emptyText) {
  const r = rosterOf(kind);
  const addBox = rosterLocked() ? `<div class="full-note lock">🔒 ${esc(lockText())}</div>` : hasRoom(r)
    ? searchBoxHTML(`${kind}-add`, t('Dodaj igrača na roster…'))
    : `<div class="full-note" data-tip="${esc(fullTip())}">🔒 ${t('Maksimalan broj igrača u timu ({n}). Izbaci nekoga ili ga prebaci na IR da bi dodao novog.', { n: ROSTER.ACTIVE })}</div>`;
  const meta = `<div class="r-meta">${t('{a}/{b} aktivnih · {c}/{d} IR', { a: activeCount(r), b: ROSTER.ACTIVE, c: irCount(r), d: ROSTER.IR })} · ${t('Ažurirano: {d}', { d: fmtShortDate(r.updated) })}${isStale(r.updated) ? ` <span class="stale">· ${t('Roster možda nije aktuelan, proveri izmene.')}</span>` : ''}</div>`;
  return `${meta}${addBox}${r.players.length ? savedRosterTable(kind, rowActions) : `<div class="empty-team cta">${emptyText}</div>`}`;
}
/** Dugmad uz igrača u rosteru (isto na Moj tim, Liga i Analiza trejda) */
const rosterIrBtn = (kind, id, toIr) => `<button class="mini" type="button" data-action="r-ir" data-kind="${kind}" data-id="${id}" title="${toIr ? t('Prebaci na IR') : t('Vrati sa IR')}">${toIr ? '→IR' : '←IR'}</button>`;
const rosterRmBtn = (kind, id) => `<button class="rm" type="button" data-action="r-remove" data-kind="${kind}" data-id="${id}" aria-label="${t('Ukloni sa rostera')}" title="${t('Ukloni sa rostera')}">✕</button>`;
const rosterBtns = (kind, p, x) => (rosterLocked() ? '' : rosterIrBtn(kind, p.id, !x.ir) + rosterRmBtn(kind, p.id)); // uvezena liga: roster se ne menja ručno

/* =====================================================================
   Stranica: Pojačanja sa FA (#league-{id}/free-agents). Radi samo u uvezenim ligama (svi rosteri su poznati);
   čita samo zajednički model lige. Ručna liga: stranica je zamagljena, uz poruku i link za uvoz.
   ===================================================================== */
state.fa = {}; // po ligi: { need: 'auto' | 'manual', cats: [], picks: [], skipBy: { [faId]: n }, page: 1 }
const faUi = (lg = currentLeague()) => state.fa[lg.id] || (state.fa[lg.id] = { need: 'auto', cats: [], picks: [], skipBy: {}, page: 1, sig: '' });
const FA_LOCK_KEY = 'fbaTrade.faLocks.v1'; // { [leagueId]: [id] } igrači koje nikad ne otpuštam (lični izbor, samo u ovom browseru)
const faLocks = lg => new Set((lsGet(FA_LOCK_KEY) || {})[lg.id] || []);
function toggleFaLock(lg, id) {
  const all = lsGet(FA_LOCK_KEY) || {}, s = new Set(all[lg.id] || []);
  if (s.has(id)) s.delete(id); else s.add(id);
  all[lg.id] = [...s]; lsSet(FA_LOCK_KEY, all);
}
const faLockedText = () => t('Radi samo za uvezene lige, jer su nam potrebni svi rosteri.');

/* ---------- Waiver u ligi: adapter platforme (ESPN lista, Sleeper iz transakcija), keš 10 minuta ---------- */
const faWaiverCache = new Map();
function faWaivers(lg) {
  const get = ADAPTERS[lg.import?.source]?.waivers;
  if (!get) return { map: null };
  let c = faWaiverCache.get(lg.id);
  if (!c || (!c.loading && Date.now() - c.ts > 10 * 60 * 1000)) {
    c = { ts: Date.now(), map: c?.map ?? null, loading: true };
    faWaiverCache.set(lg.id, c);
    get(lg).then(m => { c.map = m; }).catch(e => { console.warn('Waiver lista nije učitana:', e.message); }).finally(() => { c.loading = false; if (state.page === 'fa' || state.page === 'finder') render(); });
  }
  return c;
}

/* ---------- Nedelja meča i utakmice ---------- */
/** Nedelja meča: iz lige (periods), inače od ponedeljka do nedelje (ET). -> { a, b } u ms */
function faWeek(lg = currentLeague(), now = Date.now()) {
  const p = (lg?.import?.periods || []).find(([a, b]) => a <= now && now <= b);
  if (p) return { a: p[0], b: p[1], league: true };
  const d = currentWeekDates();
  return { a: Date.parse(`${d[0]}T00:00:00-05:00`), b: Date.parse(`${d[6]}T23:59:59-05:00`), league: false };
}
/** Preostale utakmice NBA tima do kraja nedelje meča (ili null bez rasporeda) */
function faWeekLeft(tid, lg = currentLeague()) {
  const games = state.schedule?.[tid];
  if (!games) return null;
  const w = faWeek(lg), cut = Date.now() - CONFIG.GAME_DONE_AFTER_MS;
  return games.filter(g => g.date > cut && g.date >= w.a && g.date <= w.b).length;
}
/** Utakmice u narednih 7 dana */
function faNext7(tid) {
  const games = state.schedule?.[tid];
  if (!games) return null;
  const now = Date.now() - CONFIG.GAME_DONE_AFTER_MS, end = Date.now() + 7 * 864e5;
  return games.filter(g => g.date > now && g.date <= end).length;
}

/* ---------- Model stranice ---------- */
/** Ključ statusa FA igrača u jeziku IR pravila lige (igrač nije na rosteru, pa ima samo ESPN status: OUT -> out, SUSPENSION -> sus) */
const FA_IR_ALIAS = { suspension: 'sus', injury_reserve: 'ir', sspd: 'sus' };
function faIrKey(st, rule) {
  if (!rule) return st.key;
  const want = new Map(rule.map(r => [String(r).toLowerCase(), r]));
  for (const c of [st.key, st.inj, st.g].filter(Boolean).map(x => String(x).toLowerCase())) {
    if (want.has(c)) return want.get(c);
    if (FA_IR_ALIAS[c] && want.has(FA_IR_ALIAS[c])) return want.get(FA_IR_ALIAS[c]);
  }
  return st.key;
}
/** Sve što stranica prikazuje. Par (dolazi, odlazi) se računa kao trejd 1 za 1: zbirovi mog tima pre i posle
    (mešavina sezone, 15 i 7 dana i projekcije), pa poređenje sa ostalim timovima lige po kategorijama (poeni: FPts po utakmici). */
function faModel(lg = currentLeague()) {
  const MB = tfBase(lg), mvOf = p => MB.market(p), rvOf = p => MB.real(p); // cena na tržištu i stvarna vrednost (kao u Pronađi trejd) za pravilo otpuštanja
  const slot = { mv: MB.slot.v, rv: MB.slot.rv }; // realna zamena sa waivera
  const pts = isPointsFmt(), ui = faUi(lg);
  const LV = { proj: leagueValues(lg, 'proj'), l15: leagueValues(lg, 'l15'), l7: leagueValues(lg, 'l7'), season: leagueValues(lg, 'season') };
  const allCats = pts ? [] : LV.proj.cats.map(c => ({ ...c, ratio: !!CATS.find(k => k.key === c.key)?.ratio }));
  const cats = allCats.filter(c => !isPunt({ key: c.key }));
  const weights = !pts && ui.need === 'manual' && ui.cats.length ? Object.fromEntries(cats.map(c => [c.key, ui.cats.includes(c.key) ? 1 : FA.MANUAL_OFF])) : null;
  const gpOf = p => ({ proj: statOf(p, 'proj') ? 1 : 0, season: statOf(p, 'season')?.GP || 0, l15: statOf(p, 'l15')?.GP || 0, l7: statOf(p, 'l7')?.GP || 0 });
  // linija po utakmici (mešavina perioda) i opšta vrednost (vrednost u ligi, bez potreba mog tima)
  const lines = new Map();
  const lineOf = p => {
    if (lines.has(p.id)) return lines.get(p.id);
    const w = blendWeights(gpOf(p)), per = { proj: valueLine(p, 'proj', allCats), season: statOf(p, 'season'), l15: statOf(p, 'l15'), l7: statOf(p, 'l7') };
    const l = blendLine(per, w);
    if (l && pts) { const keys = Object.keys(w).filter(k => per[k]), sum = keys.reduce((a, k) => a + w[k], 0); l.FPTS = keys.reduce((a, k) => a + fptsOf(per[k]) * w[k] / sum, 0); }
    lines.set(p.id, l);
    return l;
  };
  const generalOf = p => blendValue({ proj: LV.proj.values.get(p.id), season: LV.season.values.get(p.id), l15: LV.l15.values.get(p.id), l7: LV.l7.values.get(p.id) }, blendWeights(gpOf(p)))?.total ?? null;
  // timovi: aktivni igrači bez IR-a; OUT igrači sada ne donose ništa (zato se vidi i šta gubim zbog njih)
  const teamLines = r => (r?.players || []).filter(x => !x.ir).map(x => state.byId.get(x.id)).filter(p => p && playerStatus(p, lg).g !== 'OUT').map(lineOf);
  const my = lg.roster?.players || [];
  const tot = sumLines(teamLines(lg.roster));
  const opps = Object.values(lg.opps || {}).filter(r => r?.players?.length).map(r => sumLines(teamLines(r)));
  const sd = pts ? {} : leagueSpread([tot, ...opps], cats);
  const ctx = { pts, cats, tot, opps, sd, weights };
  ctx.base = pts ? { total: 0, by: {} } : expWins(tot, opps, cats, sd, weights);
  // saigrači koji su OUT, po NBA timu (signal "uskače u rotaciju")
  const outMates = new Map();
  for (const q of state.players) {
    if (!q.tid || (statOf(q, 'season')?.MIN || 0) < FA.SIG.MATE_MIN || playerStatus(q, lg).g !== 'OUT') continue;
    (outMates.get(q.tid) || outMates.set(q.tid, []).get(q.tid)).push(q);
  }
  const rosters = [lg.roster, ...Object.values(lg.opps || {})].map(r => (r?.players || []).map(x => x.id));
  const faIds = freeAgentIds(state.players.map(p => p.id), rosters);
  const wv = faWaivers(lg), irRule = leagueRules(lg).irRule;
  const fa = [];
  for (const id of faIds) {
    const p = state.byId.get(id);
    if (!p) continue;
    const st = playerStatus(p, lg), pos = new Set(posList(p));
    const mates = (outMates.get(p.tid) || []).filter(q => q.id !== p.id && posList(q).some(x => pos.has(x))).slice(0, 2).map(q => q.name);
    const l7 = statOf(p, 'l7'), season = statOf(p, 'season');
    const signals = rotationSignals({ minSeason: season?.MIN ?? null, minRecent: l7?.MIN ?? null, recentGp: l7?.GP || 0, ownChg: p.own?.chg || 0, matesOut: mates });
    const recent = (statOf(p, 'l15')?.GP || 0) + (l7?.GP || 0) > 0;
    const healthy = Math.max(LV.season.values.get(id)?.total ?? -Infinity, LV.proj.values.get(id)?.total ?? -Infinity);
    const general = generalOf(p);
    fa.push({ id, p, st, line: lineOf(p), general, mv: mvOf(p), rv: rvOf(p), value: general, signals, recent, out: st.g === 'OUT', k: faIrKey(st, irRule), healthy: Number.isFinite(healthy) ? healthy : null, waiver: wv.map?.has(id) ? wv.map.get(id) || true : false });
  }
  const locks = faLocks(lg);
  const mine = my.filter(x => !x.ir).map(x => { const p = state.byId.get(x.id); if (!p) return null; const out = playerStatus(p, lg).g === 'OUT'; return { id: x.id, p, out, line: out ? null : lineOf(p), general: generalOf(p), mv: mvOf(p), rv: rvOf(p), own: p.own?.pct ?? null }; }).filter(Boolean);
  const gains = new Map();
  const pairOf = (x, m) => { const k = `${x.id}|${m.id}`; if (!gains.has(k)) gains.set(k, pairGain(ctx, x.line, m.line)); return gains.get(k); };
  const gain = (x, m) => pairOf(x, m).gain;
  // u glavnu listu: zdravi FA koji su igrali u poslednjih 15 dana (OUT igrači idu u IR stash)
  const pool = fa.filter(x => x.line && x.general != null && x.recent && !x.out);
  const picks = ui.picks.map(id => mine.find(m => m.id === id)).filter(Boolean);
  const min = pts ? FA.MIN_GAIN_PTS : FA.MIN_GAIN;
  const S = faSuggest(pool, mine, gain, { picks, locks, skipBy: ui.skipBy, min, bonus: pts ? FA.SIG.BONUS_PTS : FA.SIG.BONUS, slot });
  const sugg = S.list.map(s => ({ ...s, by: pairOf(pool.find(x => x.id === s.id), mine.find(m => m.id === s.drop)).by }));
  const tc = tradeCandidates(mine, pool, gain, { locks, min, slot });
  const watch = sugg.length ? [] : watchList(pool, [], FA.WATCH);
  const R = leagueRules(lg);
  const freeIr = Math.max(0, (lg.slots?.ir || 0) - (my.filter(x => x.ir).length));
  const stash = irStash(fa, { irRule: R.irRule, freeIr, n: FA.STASH + 4 }); // višak: prikaz izbacuje igrače koji su van do kraja sezone (iz vesti)
  const rising = fa.filter(x => x.signals.some(s => s.kind !== 'mate') && x.general != null && !x.out).sort((a, b) => b.general - a.general).slice(0, FA.RISING);
  const byId = new Map(fa.map(x => [x.id, x]));
  return { pts, ui, cats, allCats, weights, ctx, fa, byId, mine, picks, sugg, eligible: S.eligible, tc, watch, stash, freeIr, R, rising, locks, wv, LV, lineOf };
}

/* ---------- Prikaz ---------- */
const faTag = x => (x.waiver ? `<span class="slot-tag tag-waiver" ${x.waiver !== true ? `data-tip="${esc(t('Na waiveru do {d}', { d: fmtShortDate(new Date(x.waiver).toISOString()) }))}"` : ''}>${t('Waiver')}</span>` : `<span class="slot-tag tag-fa">${t('Slobodan')}</span>`);
const faTagObj = x => ({ text: x.waiver ? 'Waiver' : 'Slobodan', cls: x.waiver ? 'tag-waiver' : 'tag-fa' });
/** Razlog (signali) jednom rečenicom po signalu */
function faReasons(x) {
  return x.signals.map(s => (s.kind === 'min' ? t('Minuti {a} → {b} u poslednjih 7 dana', { a: Math.round(s.from), b: Math.round(s.to) })
    : s.kind === 'mate' ? t('{n} je OUT', { n: esc(s.name) })
    : t('Vlasništvo raste: +{n}%', { n: s.chg.toFixed(1) })));
}
/** "Dobijaš 5 kategorija, gubiš 3" (kao rezultat u analizi trejda) */
const faWL = (w, l) => t('Dobijaš {w} {k}, gubiš {l}', { w, l, k: plural(w, ['kategoriju', 'kategorije', 'kategorija'], ['category', 'categories']) });
/** Labela kategorije po ključu */
const faCatLabel = k => CATS.find(c => c.key === k)?.label || k;
/** Rezultat izmene za izabrani period (isti proračun na kartici i u izveštaju): moj aktivni tim (bez IR-a) pre i posle,
    po kategoriji kao u analizi trejda (procenti: ispod .001 nerešeno). -> { win, lose, res, B, A, fd, cats, active } */
function faResult(lg, inId, outId, per = state.period, base = null) {
  return withPeriod(per, () => {
    const active = (lg.roster?.players || []).filter(y => !y.ir).map(y => y.id);
    const B = base || sumPlayers(active), A = sumPlayers([...active.filter(id => id !== outId), inId]);
    const cats = CATS.filter(c => !isPunt(c) && !c.fpts);
    let win = 0, lose = 0;
    const res = {};
    for (const c of cats) {
      const b = B.vals[c.key], a = A.vals[c.key];
      if (a == null || b == null) { res[c.key] = 0; continue; }
      const d = a - b, zero = c.type === 'pct' ? Math.abs(d) < teamTieOf(c) : fmtDelta(c, d).zero;
      res[c.key] = zero ? 0 : (c.lowerIsBetter ? d < 0 : d > 0) ? 1 : -1;
      if (res[c.key] > 0) win++; else if (res[c.key] < 0) lose++;
    }
    return { win, lose, res, B, A, fd: (A.vals.FPTS ?? 0) - (B.vals.FPTS ?? 0), cats, active };
  });
}
/** Rezultat para za izabrani period u zaglavlju (kao izveštaj) + najveće promene za moj tim (po utakmici) */
function faPairView(M, x, d) {
  const lg = currentLeague();
  if (!M.baseB) M.baseB = withPeriod(state.period, () => sumPlayers((lg.roster?.players || []).filter(y => !y.ir).map(y => y.id)));
  const R = faResult(lg, x.id, d?.id ?? null, state.period, M.baseB);
  if (M.pts) {
    const diff = R.fd, li = playerLine(x.p), lo = d ? playerLine(d.p) : null;
    const ch = CATS.filter(c => !c.fpts && c.w).map(c => ({ c, v: ((li?.[c.key] || 0) - (lo?.[c.key] || 0)) })).filter(y => Math.abs(y.v * y.c.w) >= 0.3)
      .sort((a, b) => Math.abs(b.v * b.c.w) - Math.abs(a.v * a.c.w)).slice(0, 3);
    return { head: t('{d} FPts po utakmici', { d: `${diff >= 0 ? '+' : '−'}${Math.abs(diff).toFixed(1)}` }), up: diff >= 0,
      changes: ch.map(y => `<span class="${(y.c.w > 0) === (y.v > 0) ? 'up' : 'down'}">${y.c.label} ${y.v > 0 ? '+' : '−'}${Math.abs(y.v).toFixed(1)}</span>`).join(' · '), chips: '' };
  }
  const sdOf = c => M.ctx.sd[c.key] || (c.type === 'pct' ? 0.01 : 1);
  const dOf = c => (R.A.vals[c.key] != null && R.B.vals[c.key] != null ? R.A.vals[c.key] - R.B.vals[c.key] : 0);
  const big = R.cats.filter(c => R.res[c.key]).sort((a, b) => Math.abs(dOf(b)) / sdOf(b) - Math.abs(dOf(a)) / sdOf(a)).slice(0, 3);
  const chg = c => (c.type === 'pct' ? `${c.label} ${fmtCat(c, R.B.vals[c.key])} → ${fmtCat(c, R.A.vals[c.key])}` : `${c.label} ${fmtDelta(c, dOf(c)).txt}`);
  return {
    head: faWL(R.win, R.lose), up: R.win >= R.lose,
    changes: big.map(c => `<span class="${R.res[c.key] > 0 ? 'up' : 'down'}">${chg(c)}</span>`).join(' · '),
    chips: R.cats.map(c => { const r = R.res[c.key]; return `<span class="fa-chip ${r > 0 ? 'up' : r < 0 ? 'down' : 'tie'}">${r > 0 ? '✓' : r < 0 ? '✗' : '='} ${esc(c.label)}</span>`; }).join(''),
    R,
  };
}
/** Kad nema signala: kategorije koje par najviše popravlja (po promeni očekivanih pobeda) */
function faWhyCats(M, s) {
  if (M.pts || !s.by) return [];
  const top = Object.entries(s.by).filter(([, v]) => v > 0.02).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k]) => faCatLabel(k));
  return top.length ? [t('Najviše ti popravlja {c}', { c: top.join(', ') })] : [];
}
const faWarnTxt = (d) => t('{n} vredi više od igrača koji dolazi.', { n: esc(d.p.name) });
function faCardHTML(M, s, i) {
  const x = M.byId.get(s.id), d = M.mine.find(m => m.id === s.drop);
  if (!x) return '';
  const p = x.p, g7 = faNext7(p.tid), why = [...faReasons(x), ...faWhyCats(M, s)], v = faPairView(M, x, d);
  const auto = !M.picks.length;
  return `<article class="fa-card">
    <div class="fa-rank">${i + 1}</div>
    <div class="fa-main">
      <div class="fa-in"><span class="pm-open" data-pm="${p.id}">${avatarHTML(p)}</span><div class="fa-id">
        <button type="button" class="nm pm-open" data-pm="${p.id}">${esc(p.name)}</button>
        <span class="meta">${p.team} · ${posTxt(p)} ${faTag(x)} ${injHTML(p)}</span></div></div>
      <div class="fa-out"><span class="slot-tag tag-out">${t('Odlazi')}</span> ${d ? `<button type="button" class="nm pm-open" data-pm="${d.id}">${esc(d.p.name)}</button> <span class="meta">${d.p.team} · ${posTxt(d.p)}</span>` : '–'}
        ${auto && s.alts > 1 ? `<button type="button" class="linkbtn fa-next" data-action="fa-next-drop" data-id="${p.id}" title="${esc(t('Predloži drugog'))}">↻ ${t('Predloži drugog')}</button>` : ''}</div>
      ${s.warn && d ? `<p class="pnote warn fa-warn">⚠ ${faWarnTxt(d)}</p>` : ''}
      <div class="fa-score ${v.up ? 'up' : 'down'}"><b>${v.head}</b>${v.changes ? `<span class="fa-changes">${v.changes}</span>` : ''}</div>
      ${v.chips ? `<div class="fa-chips">${v.chips}</div>` : ''}
      ${why.length ? `<div class="fa-why">${why.map(w => `<span>${w}</span>`).join('')}</div>` : ''}
      <div class="fa-foot"><span class="meta">${g7 == null ? '' : t('{n} ut. u narednih 7 dana', { n: g7 })}</span>
        <span class="fa-btns">${d ? rateBtnsHTML(tfRateKey('fa', currentLeague()?.id, [d.id], [p.id]), 'fa-rate', i) : ''}<button type="button" class="linkbtn pm-open" data-pm="${p.id}">${t('Profil')}</button><button type="button" class="btn small" data-action="fa-report" data-in="${p.id}" data-out="${d?.id || ''}">${t('Izveštaj')}</button></span></div>
    </div></article>`;
}
/** Odlazi: Automatski ili ručni izbor (važi za sve kartice); moj roster sa katancima i oznakom Trejd kandidat */
function faDropHTML(M) {
  const auto = !M.picks.length;
  const opts = M.mine.filter(m => !M.picks.some(x => x.id === m.id)).map(m => `<option value="${esc(m.p.name)}"></option>`).join('');
  const tcIds = new Set(M.tc.map(x => x.id));
  const roster = M.mine.map(m => {
    const on = M.locks.has(m.id);
    return `<span class="fa-rost ${on ? 'on' : ''}"><button type="button" class="fa-lock ${on ? 'on' : ''}" data-action="fa-lock" data-id="${m.id}" aria-pressed="${on}" title="${esc(on ? t('Zaključan: nikad se ne predlaže za otpuštanje') : t('Zaključaj: nikad ne predlaži za otpuštanje'))}">${on ? '🔒' : '🔓'}</button><button type="button" class="nm pm-open" data-pm="${m.id}">${esc(m.p.name)}</button>${tcIds.has(m.id) ? `<span class="slot-tag tag-tc">${t('Trejd kandidat')}</span>` : ''}</span>`;
  }).join('');
  const tcNotes = M.tc.map(x => { const m = M.mine.find(y => y.id === x.id); return `<li>${t('{n} ti slabo odgovara, ali ima vrednost za trejd.', { n: esc(m.p.name) })} <button type="button" class="linkbtn" data-action="tf-from-fa" data-id="${x.id}">${t('Pronađi trejd')}</button></li>`; }).join('');
  return `<section class="pcard fa-drop">
    <div class="fa-drop-row"><b>${t('Odlazi')}:</b>
      <button type="button" class="fa-opt ${auto ? 'on' : ''}" data-action="fa-auto-drop" aria-pressed="${auto}">${t('Automatski')}</button>
      ${M.picks.map(m => `<span class="chip on">${esc(m.p.name)}<button type="button" data-action="fa-unpick" data-id="${m.id}" aria-label="${esc(t('Ukloni'))}">✕</button></span>`).join('')}
      <span class="fa-pick"><input type="text" data-fa-pick list="fa-pick-list" placeholder="${esc(auto ? t('ili izaberi igrača') : t('dodaj igrača'))}" aria-label="${esc(t('Ime igrača sa tvog rostera'))}" autocomplete="off"></span><datalist id="fa-pick-list">${opts}</datalist></div>
    <p class="pnote">${auto ? t('Za svakog slobodnog igrača biramo njemu najbolji par: tvoj igrač koji je slabiji od realne zamene sa waivera i po stvarnoj vrednosti i po ceni na tržištu, sa ESPN vlasništvom ispod {n}%, koji nije zaključan ni na IR-u.', { n: FA.DROP_MAX_OWN }) : t('Izbor važi za sve kartice. Ako izabereš više igrača, za svaku karticu biramo onog koji najviše odgovara.')}</p>
    <div class="fa-roster"><span class="hint">${t('Tvoj roster')} · 🔒 ${t('nikad ne predlaži za otpuštanje')}</span><div class="fa-lock-list">${roster}</div></div>
    ${tcNotes ? `<ul class="fa-tc">${tcNotes}</ul>` : ''}</section>`;
}
/** Šta mom timu treba: Proceni sam (auto) ili ručni izbor kategorija; punt se ne računa */
function faNeedHTML(M) {
  if (M.pts) return '';
  const manual = M.ui.need === 'manual';
  const chips = M.allCats.map(c => {
    const punt = isPunt({ key: c.key });
    if (manual) return `<button type="button" class="fa-need ${punt ? 'punt' : M.ui.cats.includes(c.key) ? 'on' : ''}" data-action="fa-cat" data-k="${c.key}" ${punt ? 'disabled' : ''} aria-pressed="${M.ui.cats.includes(c.key)}">${esc(c.label)}</button>`;
    const e = M.ctx.base.by[c.key];
    return `<span class="fa-need ${punt ? 'punt' : e != null && e < 0.5 ? 'on' : ''}" ${!punt && e != null ? `title="${esc(t('Dobijaš u proseku {p}% mečeva u ovoj kategoriji', { p: Math.round(e * 100) }))}"` : ''}>${esc(c.label)}</span>`;
  }).join('');
  return `<div class="fa-needbar"><div class="seg small" role="group" aria-label="${esc(t('Šta tvom timu treba'))}">
      <button type="button" data-action="fa-need" data-v="auto" aria-pressed="${!manual}">${t('Proceni sam')}</button><button type="button" data-action="fa-need" data-v="manual" aria-pressed="${manual}">${t('Biram kategorije')}</button></div>
    <div class="fa-needs">${chips}</div>
    <span class="i" data-tip="${esc(manual ? t('Izaberi kategorije koje ti trebaju. Punt kategorije se ne računaju.') : t('Istaknute su kategorije u kojima tvoj tim, sa trenutnim rosterom, gubi više od pola mečeva protiv ostalih timova lige. Punt kategorije se ne računaju.'))}">ⓘ</span></div>`;
}
const FA_GONE = /\b(out for the (?:season|year|remainder)|season-ending|stepping away from basketball|retire[sd]?|retirement)\b/i;
const FA_BACK = /\b(?:(?:could|should|expected to|likely to|hopes? to|aiming to)\s+)?(?:return|be back)\b[^.]{0,70}|\bout (?:at least |another |for )?(?:\w+[- ]){0,2}(?:weeks?|months?)\b[^.]{0,30}|\bre-?evaluated in [^.]{0,40}/i;
function faStashHTML(M) {
  if (!M.freeIr) return '';
  const note = [!M.R.irRule ? t('Proveri da li tvoja liga dozvoljava ovaj status na IR-u.') : '', M.R.irSlots == null ? t('Broj IR mesta je procena. Proveri u podešavanjima lige.') : ''].filter(Boolean).join(' ');
  // van do kraja sezone ili se povlači (po poslednjoj vesti): nema smisla držati ga na IR-u
  const gone = x => { const nw = state.news.get(x.id)?.items?.[0]; return nw && FA_GONE.test(`${nw.headline} ${nw.story || ''}`); };
  const rows = M.stash.filter(x => !gone(x)).slice(0, FA.STASH).map(x => {
    const nw = state.news.get(x.id)?.items?.[0];
    const back = nw ? (`${nw.headline} ${nw.story || ''}`.match(FA_BACK) || [])[0] : null;
    return `<li class="fa-stash-row"><span class="pm-open" data-pm="${x.id}">${avatarHTML(x.p)}</span><div class="fa-id"><button type="button" class="nm pm-open" data-pm="${x.id}">${esc(x.p.name)}</button>
      <span class="meta">${x.p.team} · ${posTxt(x.p)} ${faTag(x)} ${injHTML(x.p)} · ${t('vrednost kad je zdrav')} ${fmtVal(x.healthy)}</span>
      ${nw ? `<span class="fa-news">${esc(nw.headline).slice(0, 160)}</span>` : ''}${back ? `<span class="fa-back">${t('Povratak')}: ${esc(back)}</span>` : ''}</div></li>`;
  }).join('');
  return `<section class="pcard fa-stash"><h3>${t('Uzmi i stavi na IR')} <span class="hint">${t('slobodnih IR mesta: {n}', { n: M.freeIr })}</span></h3>
    ${note ? `<p class="pnote warn">⚠ ${note}</p>` : ''}${rows ? `<ul class="fa-list">${rows}</ul>` : `<p class="pnote">${t('Trenutno nema povređenih slobodnih igrača sa visokom vrednošću koji smeju na IR.')}</p>`}</section>`;
}
/** Izbor perioda (Sezona, 7, 15, 30 dana, Projekcija) za karticu ili izveštaj; attrs = dodatni data-* atributi */
const faPerSeg = (cur, action, attrs = '', cls = '') => `<div class="seg small fa-per ${cls}" role="group" aria-label="${esc(t('Period'))}">${['season', 'l7', 'l15', 'l30', 'proj'].map(k => `<button type="button" data-action="${action}" data-per="${k}" ${attrs} aria-pressed="${k === cur}">${PERIODS.find(y => y.key === k).label}</button>`).join('')}</div>`;
/** Period kartice (U usponu, Svi slobodni igrači): sopstveni izbor ili period iz zaglavlja */
const faCardPer = (M, k) => M.ui[k] || state.period;
/** U usponu: tabela kao Moj tim (izabrani period, trend strelice) + Napomene; telefon: napomene ispod reda */
function faRisingHTML(M) {
  if (!M.rising.length) return '';
  const per = faCardPer(M, 'risePer');
  return withPeriod(per, () => faRisingInner(M, per));
}
function faRisingInner(M, per) {
  const ids = sortIds('rise', M.rising.map(x => x.id));
  const cols = CATS.length + 3;
  const rows = ids.map(id => {
    const x = M.byId.get(id), notes = faReasons(x).map(w => `<span>${w}</span>`).join('');
    return playerRowHTML(x.p, { tags: [faTagObj(x)], punt: false }).replace(/<\/tr>\s*$/, `<td class="fa-notes">${notes}</td></tr>`)
      + `<tr class="fa-note-row"><td colspan="${cols + 1}"><div class="fa-notes">${notes}</div></td></tr>`;
  }).join('');
  const head = rosterHeaderRow('rise').replace(/<\/tr>$/, `<th class="fa-notes-th">${t('Napomene')}</th></tr>`);
  return `<section class="card fa-rising"><div class="card-h"><div class="side-title"><b>${t('U usponu')}</b><small>${PERIODS.find(x => x.key === state.period).label}</small></div>${faPerSeg(per, 'fa-card-per', 'data-card="risePer"', 'fa-card-per')}</div>
    <div class="tscroll fa-scroll"><table class="rtable fa-table fa-rise-t"><thead>${head}</thead><tbody>${rows}</tbody></table></div></section>`;
}
/** Brojevi stranica: 1 … 4 5 6 … 20 */
function faPagerHTML(page, pages) {
  if (pages <= 1) return '';
  const nums = [...new Set([1, page - 1, page, page + 1, pages].filter(n => n >= 1 && n <= pages))].sort((a, b) => a - b);
  let prev = 0, html = '';
  for (const n of nums) { if (n - prev > 1) html += '<span class="pg-gap">…</span>'; html += `<button type="button" class="pg ${n === page ? 'on' : ''}" data-action="fa-page" data-p="${n}" ${n === page ? 'aria-current="page"' : ''}>${n}</button>`; prev = n; }
  return `<nav class="fa-pager" aria-label="${esc(t('Stranice'))}"><button type="button" class="pg" data-action="fa-page" data-p="${page - 1}" ${page <= 1 ? 'disabled' : ''} aria-label="${esc(t('Prethodna'))}">‹</button>${html}<button type="button" class="pg" data-action="fa-page" data-p="${page + 1}" ${page >= pages ? 'disabled' : ''} aria-label="${esc(t('Sledeća'))}">›</button></nav>`;
}
/** Tabela svih FA igrača: kolone kao Moj tim + utakmice ove nedelje i vlasništvo; 25 po stranici, sortiranje preko celog spiska */
function faTableHTML(M, lg) {
  const per = faCardPer(M, 'allPer');
  return withPeriod(per, () => faTableInner(M, lg, per));
}
function faTableInner(M, lg, per) {
  // podrazumevano: po opštoj vrednosti; igrači bez utakmica u izabranom periodu na dnu
  const ids = sortIds('fa', M.fa.filter(x => x.p.stats && Object.keys(x.p.stats).length)
    .sort((a, b) => !playerLine(a.p) - !playerLine(b.p) || (b.general ?? -99) - (a.general ?? -99)).map(x => x.id));
  // promena sortiranja ili perioda vraća na stranicu 1
  const sig = `${JSON.stringify(sortOf('fa'))}|${state.period}`;
  if (M.ui.sig !== sig) { M.ui.sig = sig; M.ui.page = 1; }
  const pg = pageOf(ids, M.ui.page);
  M.ui.page = pg.page;
  const s = sortOf('fa');
  const th = (key, label, tip) => `<th class="sortth${s?.col === key ? ' sorted' : ''}" data-sort="${key}" data-skind="fa" title="${esc(tip)}">${label}${s?.col === key ? `<span class="sarr">${s.dir === 'asc' ? '▲' : '▼'}</span>` : ''}</th>`;
  const head = rosterHeaderRow('fa').replace(/<\/tr>$/, `${th('WK', t('Ned.'), t('Utakmice ove nedelje meča (preostale)'))}${th('OWN', t('Vlasn.'), t('Vlasništvo u ESPN ligama i promena'))}</tr>`);
  const rows = pg.rows.map(id => {
    const x = M.byId.get(id), p = x.p, wk = faWeekLeft(p.tid, lg), own = p.own;
    const extra = `<td>${wk ?? '–'}</td><td class="fa-own">${own ? `${own.pct.toFixed(0)}%${own.chg ? ` <em class="${own.chg > 0 ? 'up' : 'down'}">${own.chg > 0 ? '+' : '−'}${Math.abs(own.chg).toFixed(1)}</em>` : ''}` : '–'}</td>`;
    return playerRowHTML(p, { tags: [faTagObj(x)], punt: false }).replace(/<\/tr>\s*$/, `${extra}</tr>`);
  }).join('');
  return `<section class="card fa-all" id="fa-all"><div class="card-h"><div class="side-title"><b>${t('Svi slobodni igrači')}</b><small>${t('{n} igrača · {p}', { n: ids.length, p: PERIODS.find(x => x.key === state.period).label })}</small></div>${faPerSeg(per, 'fa-card-per', 'data-card="allPer"', 'fa-card-per')}</div>
    <div class="tscroll fa-scroll"><table class="rtable fa-table"><thead>${head}</thead><tbody>${rows}</tbody></table></div>
    ${faPagerHTML(pg.page, pg.pages)}</section>`;
}
/** Ručna liga: zamagljena stranica sa porukom preko nje */
function faLockedHTML() {
  const fake = Array.from({ length: 3 }, (_, i) => `<article class="fa-card"><div class="fa-rank">${i + 1}</div><div class="fa-main"><div class="fa-in"><span class="av"></span><div class="fa-id"><b>██████ ████</b><span class="meta">███ · ██</span></div></div><div class="fa-score up"><b>████████ ${5 - i}</b></div><div class="fa-chips"><span class="fa-chip up">✓ ███</span><span class="fa-chip up">✓ ███</span></div></div></article>`).join('');
  return `<div class="fa-locked"><div class="fa-blur" aria-hidden="true">${fake}</div>
    <div class="fa-lockmsg"><b>🔒 ${t('Pojačanja sa FA')}</b><p>${faLockedText()}</p><a class="btn" href="${howtoUrl()}" target="_blank" rel="noopener">${t('Kako da uvezem ligu?')}</a></div></div>`;
}
function renderFaPage() {
  const lg = currentLeague();
  const title = `<h2 class="page-t">${t('Pojačanja sa FA')}${lg.teamName ? ` <span class="hint">${esc(lg.teamName)}</span>` : ''}</h2>`;
  if (!isSynced(lg)) return title + faLockedHTML();
  if (!state.players.length) return `${title}<p class="pnote">${t('Učitavam igrače…')}</p>`;
  if (!lg.roster?.players.length) return `${title}<p class="pnote">${t('Tvoj tim u ovoj ligi nema igrača. Izaberi svoj tim u podešavanjima lige.')}</p>`;
  const M = faModel(lg);
  // vesti za IR stash (povratak): učitavaju se jednom, pa se stranica osveži
  const needNews = M.stash.map(x => x.id).filter(id => !state.news.get(id));
  if (needNews.length) Promise.all(needNews.map(fetchNews)).then(() => { if (state.page === 'fa') render(); });
  const watch = M.watch.length ? `<h4>${t('Prati')}</h4><ul class="fa-list">${M.watch.map(x => `<li class="fa-stash-row"><span class="pm-open" data-pm="${x.id}">${avatarHTML(x.p)}</span><div class="fa-id"><button type="button" class="nm pm-open" data-pm="${x.id}">${esc(x.p.name)}</button><span class="meta">${x.p.team} · ${posTxt(x.p)} ${faTag(x)}</span><span class="fa-why">${faReasons(x).map(w => `<span>${w}</span>`).join('')}</span></div></li>`).join('')}</ul>` : '';
  const list = M.sugg.length
    ? `<div class="fa-cards">${M.sugg.map((s, i) => faCardHTML(M, s, i)).join('')}</div>`
    : !M.eligible
      ? `<div class="pcard fa-none"><b>${t('Tvoj roster je jači od onoga što je trenutno na waiveru')}</b><p class="pnote">${t('Nijedan tvoj igrač nije slabiji od realne zamene sa waivera i po stvarnoj vrednosti i po ceni na tržištu uz vlasništvo ispod {n}%. Igrači sa niskom stvarnom vrednošću, a višom cenom su Trejd kandidati. Ako ipak želiš nekog da otpustiš, izaberi ga gore.', { n: FA.DROP_MAX_OWN })}</p>${watch}</div>`
      : `<div class="pcard fa-none"><b>${t('Trenutno nema pojačanja koja bi ti pomogla')}</b><p class="pnote">${t('Nijedna izmena ne popravlja tvoj tim dovoljno u odnosu na ostale timove lige. Ne spuštamo kriterijum da bi lista bila puna.')}</p>${watch}</div>`;
  const wnote = M.wv.loading && !M.wv.map ? `<span class="hint">${t('Proveravam waiver u ligi…')}</span>` : '';
  return `${title}
    <p class="pnote fa-lead">${M.pts ? t('Svaka izmena se računa kao trejd 1 za 1: FPts tvog tima po utakmici pre i posle (mešavina sezone, poslednjih 15 i 7 dana i projekcije).') : t('Svaka izmena se računa kao trejd 1 za 1: zbirovi tvog tima pre i posle, pa koliko kategorija više dobijaš protiv ostalih timova lige (mešavina sezone, poslednjih 15 i 7 dana i projekcije).')} ${wnote}</p>
    ${faNeedHTML(M)}${faDropHTML(M)}
    <h3 class="fa-h">${t('Najbolja pojačanja')}</h3>${list}
    ${faStashHTML(M)}${faRisingHTML(M)}${faTableHTML(M, lg)}`;
}

/* ---------- Izveštaj (sa kartice): kao analiza trejda 1 za 1, sa sopstvenim izborom perioda ---------- */
/** Privremeno drugi period (sav proračun koji čita state.period), pa vraćanje */
function withPeriod(per, fn) {
  const old = state.period;
  state.period = per;
  try { return fn(); } finally { state.period = old; }
}
const FA_REP_VIEW_KEY = 'fbaTrade.faRepView.v1'; // donja tabela izveštaja: 'diff' (Razlika) ili 'team' (Ceo tim pre i posle), lični izbor
const faRepView = () => (lsGet(FA_REP_VIEW_KEY) === 'team' ? 'team' : 'diff');
function faReport(inId, outId, per = state.period) {
  const lg = currentLeague(), pIn = state.byId.get(inId), pOut = outId ? state.byId.get(outId) : null;
  if (!pIn) return;
  const M = faModel(lg), x = M.byId.get(inId), view = faRepView();
  const warn = M.picks.length && pOut ? dropVal(M.mine.find(m => m.id === outId)) >= dropVal(x) : false;
  const R = faResult(lg, inId, outId, per);
  const body = withPeriod(per, () => {
    const { B, A, res, win, lose, fd } = R, pts = isPointsFmt();
    const verdict = pts
      ? `<div class="fa-verdict ${fd >= 0 ? 'up' : 'down'}">${t('{d} FPts po utakmici', { d: `${fd >= 0 ? '+' : '−'}${Math.abs(fd).toFixed(1)}` })}</div>`
      : `<div class="fa-verdict ${win >= lose ? 'up' : 'down'}">${faWL(win, lose)}</div>`;
    const colCls = c => `${c.fpts ? 'fpts' : ''}${puntCls(c)}`;
    const hdr = `<tr><th>${t('Igrač')}</th><th>MIN</th>${CATS.map(c => `<th class="${colCls(c)}">${c.label}</th>`).join('')}<th>GP</th></tr>`;
    // gornja tabela: po kategoriji bolji igrač zeleno, slabiji crveno (TO i slično: manje je bolje); isto ili punt bez boje; MIN i GP bez boje
    const lIn = playerLine(pIn), lOut = pOut ? playerLine(pOut) : null;
    const better = c => {
      if (!lIn || !lOut || isPunt(c)) return 0;
      const a = cmpKey(c, catValue(lIn, c)), b = cmpKey(c, catValue(lOut, c));
      if (a == null || b == null || a === b) return 0;
      return (c.lowerIsBetter ? a < b : a > b) ? 1 : -1;
    };
    const prow = (p, tag, sgn) => playerRowHTML(p, { tags: [tag], punt: true, pctSub: true, markOf: c => { const r = better(c) * sgn; return r > 0 ? 'better-me' : r < 0 ? 'better-them' : ''; } });
    const minW = 240 + (CATS.length + 2) * 64; // od ove širine nema skrola (inače skrol samo tada)
    const tbl = (cls, head, rows) => `<div class="tscroll"><table class="rtable fa-rep-t ${cls}" style="min-width:${minW}px"><thead>${head}</thead><tbody>${rows}</tbody></table></div>`;
    const players = tbl('fa-rep-pl', hdr, `${prow(pIn, { text: 'Dolazi', cls: 'tag-in' }, 1)}${pOut ? prow(pOut, { text: 'Odlazi', cls: 'tag-out' }, -1) : ''}`);
    // donja tabela: Razlika (dolazi minus odlazi, po utakmici) ili Ceo tim pre i posle
    const sgnCls = (c, d, zero) => (zero || isPunt(c) ? '' : (c.lowerIsBetter ? d < 0 : d > 0) ? 'win' : 'lose');
    let bottom;
    if (view === 'diff') {
      const cell = c => {
        const a = lIn ? catValue(lIn, c) : null, b = lOut ? catValue(lOut, c) : (pOut ? null : 0);
        if (a == null || b == null) return `<td class="${colCls(c)}">-</td>`;
        const f = fmtDelta(c, a - b);
        return `<td class="${colCls(c)} ${sgnCls(c, a - b, f.zero)}">${f.txt}</td>`;
      };
      const dm = lIn && lOut && lIn.MIN != null && lOut.MIN != null ? fmtDelta({ type: 'sum' }, lIn.MIN - lOut.MIN).txt : '';
      bottom = tbl('fa-rep', `<tr><th></th><th>MIN</th>${CATS.map(c => `<th class="${colCls(c)}">${c.label}</th>`).join('')}<th>GP</th></tr>`,
        `<tr class="total"><td>${t('Razlika')}</td><td>${dm}</td>${CATS.map(cell).join('')}<td></td></tr>`);
    } else {
      const v = (vals, c) => `<td class="${colCls(c)}">${fmtCat(c, vals[c.key])}</td>`;
      const dcell = c => {
        const b = B.vals[c.key], a = A.vals[c.key];
        if (a == null || b == null) return `<td class="${colCls(c)}">-</td>`;
        const f = fmtDelta(c, a - b), r = c.fpts ? (f.zero ? 0 : a > b ? 1 : -1) : res[c.key] ?? 0;
        return `<td class="${colCls(c)} ${r > 0 ? 'win' : r < 0 ? 'lose' : ''}">${f.txt}</td>`;
      };
      bottom = tbl('fa-rep', `<tr><th></th><th></th>${CATS.map(c => `<th class="${colCls(c)}">${c.label}</th>`).join('')}<th></th></tr>`,
        `<tr><td>${t('Pre')}</td><td></td>${CATS.map(c => v(B.vals, c)).join('')}<td></td></tr>
        <tr><td>${t('Posle')}</td><td></td>${CATS.map(c => v(A.vals, c)).join('')}<td></td></tr>
        <tr class="total"><td>${t('Razlika')}</td><td></td>${CATS.map(dcell).join('')}<td></td></tr>`);
    }
    return { verdict, players, bottom };
  });
  const tip = view === 'diff' ? t('Razlika između igrača koji dolazi i igrača koji odlazi, po utakmici, u izabranom periodu.') : t('Zbir proseka po utakmici svih aktivnih igrača tvog tima, pre i posle izmene, u izabranom periodu.');
  const vseg = `<div class="fa-rep-view"><div class="seg small" role="group" aria-label="${esc(t('Prikaz'))}">${[['diff', 'Razlika'], ['team', 'Ceo tim pre i posle']].map(([k, l]) => `<button type="button" data-action="fa-rep-view" data-v="${k}" data-per="${per}" data-in="${inId}" data-out="${outId || ''}" aria-pressed="${k === view}">${t(l)}</button>`).join('')}</div><span class="i" data-tip="${esc(tip)}">ⓘ</span></div>`;
  // streaming: utakmice do kraja nedelje meča za oba igrača, pa procena ukupno (prosek po utakmici u izabranom periodu × broj utakmica)
  const gIn = faWeekLeft(pIn.tid, lg), gOut = pOut ? faWeekLeft(pOut.tid, lg) : null;
  const lIn = statOf(pIn, per), lOut = pOut ? statOf(pOut, per) : null;
  let week = '';
  if (gIn != null) {
    const w = faWeek(lg), cats = CATS.filter(c => !isPunt(c) && !c.fpts);
    const d = ms => (LANG === 'en' ? new Date(ms).toLocaleDateString(LOCALE(), { day: 'numeric', month: 'short' }) : euDate(new Date(ms).toISOString()));
    week = `<p class="fa-games">${t('Utakmice do kraja nedelje meča')}: <b>${esc(pIn.name)} ${gIn}</b>${pOut ? `, <b>${esc(pOut.name)} ${gOut ?? '–'}</b>` : ''}</p>
      <h5 class="fa-week-h">${t('Ukupno do kraja nedelje meča')}</h5>`;
    if (isPointsFmt()) {
      const a = lIn ? fptsOf(lIn) * gIn : 0, b = lOut && gOut ? fptsOf(lOut) * gOut : 0;
      week += `<div class="fa-week"><b class="${a >= b ? 'up' : 'down'}">${a >= b ? '+' : '−'}${Math.abs(a - b).toFixed(1)} FPts</b></div>`;
    } else {
      const cnt = cats.filter(c => c.type !== 'pct' && !c.ratio).map(c => {
        const a = (lIn?.[c.key] || 0) * gIn, b = (lOut?.[c.key] || 0) * (gOut || 0), dd = a - b, f = fmtDelta(c, dd);
        return `<span class="${f.zero ? '' : (c.lowerIsBetter ? dd < 0 : dd > 0) ? 'up' : 'down'}">${f.txt} ${c.label}</span>`;
      });
      week += `<div class="fa-week">${cnt.join(' · ')}</div>`;
    }
    week += `<p class="pnote fa-week-note">${t('Igrač sa više utakmica ove nedelje donosi više ukupno, i kad je slabiji po utakmici.')}</p>
      <p class="pnote">${w.league ? t('Nedelja meča iz lige: od {a} do {b}', { a: d(w.a), b: d(w.b) }) : t('Nedelja meča od ponedeljka do nedelje: od {a} do {b}', { a: d(w.a), b: d(w.b) })}</p>`;
  }
  const L = lg.import?.acqLimit, S = lg.import?.acqSeason;
  const acq = L?.per === 'week' && L.used != null ? t('Preostala preuzimanja ove nedelje: {n}.', { n: Math.max(0, L.n - L.used) })
    : L?.per === 'day' ? t('Limit lige za preuzimanja: {n} dnevno.', { n: L.n }) : '';
  const acqS = S?.used != null ? t('Preostala preuzimanja ove sezone: {n}.', { n: Math.max(0, S.n - S.used) }) : '';
  const s = M.sugg.find(y => y.id === inId && y.drop === outId);
  const why = x ? [...faReasons(x), ...(s ? faWhyCats(M, s) : [])] : [];
  const seg = faPerSeg(per, 'fa-rep-per', `data-in="${inId}" data-out="${outId || ''}"`, 'fa-rep-per');
  showModal({
    title: `${esc(pIn.name)} <span class="hint">⇄ ${pOut ? esc(pOut.name) : '–'}</span>`, cls: 'fa-rep-box', wide: true, cancel: null, confirm: t('Zatvori'), onConfirm: () => {},
    body: `${warn ? `<p class="pnote warn">⚠ ${t('{n} vredi više od igrača koji dolazi.', { n: esc(pOut.name) })}</p>` : ''}${body.verdict}
      <div class="fa-rep-h"><h4>${t('Dolazi i odlazi')} <span class="hint">${t('po utakmici')}</span></h4>${seg}</div>${body.players}
      ${vseg}${body.bottom}
      <h4>${t('Zašto')}</h4>${why.length ? `<div class="fa-why">${why.map(w => `<span>${w}</span>`).join('')}</div>` : `<p class="pnote">${t('Izmena popravlja tvoj tim u odnosu na ostale timove lige.')}</p>`}
      <div class="fa-rep-news" id="fa-rep-news"><p class="pnote">${t('Učitavam vesti…')}</p></div>
      ${week ? `<h4>${t('Streaming')}</h4>${week}` : ''}
      ${acq || acqS ? `<p class="fa-acq">${[acq, acqS].filter(Boolean).join(' ')}</p>` : ''}`,
  });
  document.getElementById('modal')?.classList.add('fa-rep-modal');
  fetchNews(inId).then(() => {
    const el = document.getElementById('fa-rep-news'), nw = state.news.get(inId)?.items?.[0];
    if (el) el.innerHTML = nw ? `<h4>${t('Poslednja vest')}</h4><p class="fa-news"><b>${esc(nw.headline || '')}</b> ${esc(nw.story || '')}</p>` : '';
  });
}

/* =====================================================================
   Pronađi trejd (#league-{id}/find-trade i javna stranica /trade-finder/ bez lige).
   Čita samo zajednički model lige (moj roster, rosteri protivnika, uvezeni plasman ako postoji), bez provere platforme.
   Motor (tfEngine) radi u Web Workeru; ovde se spremaju linije i vrednosti igrača, oznake, strategije i kartice.
   ===================================================================== */
const TF_MARK_KEY = 'fbaTrade.tfMarks.v1';   // { [liga|quick]: { [protivnik]: { mine: { pid: mark }, theirs: { pid: mark } } } } (lični izbor)
const TF_QUICK_KEY = 'fbaTrade.tfQuick.v1';  // javna stranica bez lige: { my: [id], opp: [id] }
const TF_STRATS = [
  { id: 'best', sr: 'Najbolje za mene', tip: 'Trejdovi koji najviše popravljaju tvoj tim u odnosu na ostale timove lige.' },
  { id: 'cats', sr: 'Popravi kategorije', tip: 'Izaberi kategorije koje ti trebaju. Dobijaju veću težinu, a ostale ne smeju previše da padnu.' },
  { id: 'sell', sr: 'Prodaj skupo', tip: 'Prednost trejdovima u kojima daješ igrače čija je forma (15 i 7 dana) znatno iznad projekcije.' },
  { id: 'buy', sr: 'Kupi jeftino', tip: 'Prednost trejdovima u kojima dobijaš igrače sa dobrom projekcijom čija je forma trenutno znatno ispod nje.' },
  { id: 'cons', sr: 'Konsolidacija', tip: 'Samo trejdovi u kojima daješ više igrača nego što dobijaš, za jačeg igrača i slobodno mesto.' },
  { id: 'depth', sr: 'Dubina', tip: 'Samo trejdovi u kojima dobijaš više igrača nego što daješ.' },
];
const TF_SLIDER = [{ id: 'fair', sr: 'Fer' }, { id: 'slight', sr: 'Malo u moju korist' }, { id: 'aggr', sr: 'Agresivno' }];
const TF_MARKS = {
  lock: { sr: 'Zaključaj', ic: '🔒', tipMine: 'Igrač nikad ne ide u trejd.', tipTheirs: 'Ne želim ga.' },
  soft: { sr: 'Dajem ako mora', ic: '💲', tipMine: 'Igrač sme u trejd, ali samo kad trejd donosi jasno veću korist.' },
  trade: { sr: 'U trejd', ic: '⇄', tipMine: 'Igrač mora biti u trejdu.', tipTheirs: 'Želim ga, mora biti u trejdu.' },
};
state.tf = { strat: 'best', focus: [], slider: 'fair', res: null, page: 0, busy: false, prog: 0, worker: null, oppBy: {}, ms: 0 };

/** Kontekst: liga (moj roster i izabrani protivnik) ili javna stranica (dva tima iz pretrage) */
function tfCtx() {
  const lg = currentLeague();
  if (!lg) {
    const q = lsGet(TF_QUICK_KEY) || { my: [], opp: [] };
    return { lg: null, scopeKey: 'quick', oppKey: 'quick', quick: true, my: q.my.map(id => ({ id, ir: false })), opp: q.opp.map(id => ({ id, ir: false })), oppName: t('Protivnik'), q };
  }
  const opps = Object.entries(lg.opps || {}).sort((a, b) => a[1].name.localeCompare(b[1].name, 'sr'));
  // protivnik nije izabran dok ga korisnik ne izabere (ili dok alat ne otvori veza sa izabranim timom)
  let oppKey = state.tf.oppBy[lg.id] || null;
  if (oppKey && !lg.opps[oppKey]) oppKey = null;
  const o = oppKey ? lg.opps[oppKey] : null;
  return { lg, scopeKey: lg.id, oppKey, opps, my: lg.roster?.players || [], opp: o?.players || [], oppName: o?.name || '' };
}
/** Lock mojih igrača važi za celu ligu (svi protivnici): čuva se pod ključem TF_LOCK_K. "Dajem ako mora" i "U trejd" ostaju po protivniku. */
const TF_LOCK_K = '@lock';
/** Sve oznake; stari Lock mog igrača kod bilo kog protivnika prelazi u Lock za celu ligu (jednom) */
function tfMarksAll() {
  const all = lsGet(TF_MARK_KEY) || {};
  let ch = false;
  for (const sc of Object.values(all)) {
    if (!sc || typeof sc !== 'object') continue;
    for (const [k, m] of Object.entries(sc)) {
      if (k === TF_LOCK_K || !m?.mine) continue;
      for (const [id, v] of Object.entries(m.mine)) if (v === 'lock') { (sc[TF_LOCK_K] || (sc[TF_LOCK_K] = {}))[id] = 'lock'; delete m.mine[id]; ch = true; }
    }
  }
  if (ch) lsSet(TF_MARK_KEY, all);
  return all;
}
/** Moji zaključani igrači u ligi: { pid: 'lock' } */
const tfLocks = scopeKey => tfMarksAll()[scopeKey]?.[TF_LOCK_K] || {};
function tfMarks(ctx) {
  const sc = tfMarksAll()[ctx.scopeKey] || {}, m = sc[ctx.oppKey || '-'];
  const mine = { ...(m?.mine || {}) };
  for (const id of Object.keys(sc[TF_LOCK_K] || {})) mine[id] = 'lock';
  return { mine, theirs: m?.theirs || {} };
}
function tfSetMark(ctx, side, id, mark) {
  const all = tfMarksAll(), sc = all[ctx.scopeKey] || (all[ctx.scopeKey] = {}), k = ctx.oppKey || '-';
  const m = sc[k] || (sc[k] = { mine: {}, theirs: {} });
  if (side === 'mine') {
    const lk = sc[TF_LOCK_K] || (sc[TF_LOCK_K] = {}), cur = lk[id] ? 'lock' : m.mine[id];
    delete lk[id]; delete m.mine[id];
    if (mark && cur !== mark) { if (mark === 'lock') lk[id] = 'lock'; else m.mine[id] = mark; }
  } else if (!mark || m[side][id] === mark) delete m[side][id]; else m[side][id] = mark;
  lsSet(TF_MARK_KEY, all);
}
/** Poništi sve: oznake za ovog protivnika; Lock za celu ligu samo kad je locks = true */
function tfResetMarks(ctx, locks = false) {
  const all = tfMarksAll(); if (!all[ctx.scopeKey]) return;
  delete all[ctx.scopeKey][ctx.oppKey || '-'];
  if (locks) delete all[ctx.scopeKey][TF_LOCK_K];
  lsSet(TF_MARK_KEY, all);
}

/** Model za pretragu: linije (mešavina perioda kao u FA alatu), vrednost za ostatak sezone, slobodni igrači, ostali timovi, punt i slabosti protivnika */
/** Osnova za Pronađi trejd i analizu trejda otvorenu iz njega (ne zavisi od izabranih timova): mešavina perioda po igraču,
    opšta i tržišna vrednost, granica otpuštanja, slobodni igrači i nivo zamene. Keš po ligi i podacima. */
let tfBaseCache = null;
function tfBase(lg = currentLeague()) {
  const key = [lg?.id || 'quick', fmtKeyNow(), state.loadedAt, state.players.length, lg?.import?.syncedAt || '', Object.keys(state.schedule || {}).length, lg && isSynced(lg) ? faWaivers(lg).map?.size ?? -1 : '', state.injVer || 0, state.news?.size || 0].join('|');
  if (tfBaseCache?.key === key) return tfBaseCache;
  const pts = isPointsFmt();
  const LV = { proj: leagueValues(lg, 'proj'), season: leagueValues(lg, 'season'), l15: leagueValues(lg, 'l15'), l7: leagueValues(lg, 'l7') };
  const vcats = pts ? [] : LV.proj.cats.map(c => ({ ...c, ratio: !!CATS.find(k => k.key === c.key)?.ratio }));
  const keys = [...new Set([...vcats.flatMap(c => (c.pct ? [c.made, c.att] : [c.key])), 'FPTS'])], ki = Object.fromEntries(keys.map((k, i) => [k, i]));
  const cats = vcats.map(c => ({ key: c.key, label: c.label, pct: c.pct, low: c.low, ratio: c.ratio, k: c.pct ? null : ki[c.key], m: c.pct ? ki[c.made] : null, a: c.pct ? ki[c.att] : null }));
  const gpOf = p => ({ proj: statOf(p, 'proj') ? 1 : 0, season: statOf(p, 'season')?.GP || 0, l15: statOf(p, 'l15')?.GP || 0, l7: statOf(p, 'l7')?.GP || 0 });
  // povređeni (OUT): očekivani povratak (ESPN, pa vesti, pa oprezna procena) i udeo preostalih utakmica koje igra posle povratka
  const now = Date.now(), injMap = state.injRet || {}, injCache = new Map();
  const injOfP = p => {
    if (!p) return null;
    if (injCache.has(p.id)) return injCache.get(p.id);
    const nw = state.news?.get(p.id)?.items?.[0];
    const v = tfInjury({ g: playerStatus(p, lg).g, ret: injMap[p.id], news: nw ? `${nw.headline} ${nw.story || ''}` : '', now, T: TF.INJ });
    injCache.set(p.id, v); return v;
  };
  const datesLeft = tid => { const g = state.schedule?.[tid], done = gamesDone(tid); return g && done != null ? g.slice(done).map(x => x.date) : []; };
  const fracOf = p => { const inj = injOfP(p); return inj ? tfInjFrac(inj, datesLeft(p.tid)) : 1; };
  // dostupnost do kraja sezone: zdrav = kao do sada; povređen = trajnost × udeo utakmica posle povratka (umesto 0)
  const availT = p => { if (!injOfP(p)) return playerAvail(p, lg); const d = durability(p); return availFactor(d?.gp ?? 0, d?.n ?? 0, false) * fracOf(p); };
  const lines = new Map();
  const rawLine = p => {
    if (!p) return null;
    if (lines.has(p.id)) return lines.get(p.id);
    const w = blendWeights(gpOf(p)), per = { proj: valueLine(p, 'proj', vcats), season: statOf(p, 'season'), l15: statOf(p, 'l15'), l7: statOf(p, 'l7') };
    const l = blendLine(per, w);
    if (l && pts) { const ks = Object.keys(w).filter(k => per[k]), sum = ks.reduce((a, k) => a + w[k], 0); l.FPTS = ks.reduce((a, k) => a + fptsOf(per[k]) * w[k] / sum, 0); }
    lines.set(p.id, l);
    return l;
  };
  // linija za zbir tima (pretraga, kartica, analiza): povređenom se zbirovi množe udelom utakmica posle povratka (prosek do kraja sezone)
  const scaled = new Map();
  const lineOf = p => {
    if (!p) return null;
    if (scaled.has(p.id)) return scaled.get(p.id);
    const l = rawLine(p), f = l ? fracOf(p) : 1;
    const out = l && f < 1 ? Object.fromEntries(Object.entries(l).map(([k, v]) => [k, typeof v === 'number' && k !== 'GP' && k !== 'MIN' && !/%|PCT/i.test(k) ? v * f : v])) : l;
    scaled.set(p.id, out); return out;
  };
  const vecOf = l => keys.map(k => +l?.[k] || 0);
  // opšta vrednost po utakmici iznad nivoa zamene (kategorije: z-score minus igrači oko mesta broj timova × aktivna mesta)
  const genRaw = new Map();
  for (const p of state.players) { const v = blendValue({ proj: LV.proj.values.get(p.id), season: LV.season.values.get(p.id), l15: LV.l15.values.get(p.id), l7: LV.l7.values.get(p.id) }, blendWeights(gpOf(p))); if (v) genRaw.set(p.id, v.total); }
  const pool = LV.proj.pool, sorted = [...genRaw.entries()].sort((a, b) => b[1] - a[1]);
  const band = sorted.slice(pool.n, pool.n + pool.teams);
  // nivo zamene po opštoj vrednosti (prosek igrača oko mesta broj timova × aktivna mesta)
  const repl = pts ? 0 : band.length ? band.reduce((s, x) => s + x[1], 0) / band.length : 0;
  // uvezena liga: stvarni slobodni igrači (zdravi i igraju)
  const synced = lg && isSynced(lg);
  const faIds = synced ? freeAgentIds(state.players.map(p => p.id), [lg.roster, ...Object.values(lg.opps || {})].map(r => (r?.players || []).map(x => x.id))).filter(id => { const p = state.byId.get(id); return p && playerAvail(p, lg) > 0 && (statOf(p, 'l15')?.GP || 0) > 0; }) : []; // povređeni i oni koji ne igraju nisu zamena
  // otpuštanje kao u FA alatu: vlasništvo ispod praga i slabiji od najboljeg slobodnog (uvezena liga) ili od nivoa zamene
  const faBest = faIds.map(id => genRaw.get(id)).filter(v => v != null).sort((a, b) => b - a)[0];
  const dropBar = synced && faBest != null ? faBest : repl;
  // tržišna vrednost: kako igrača vide menadžeri (opšta vrednost, produkcija, minuti, vlasništvo i rang po vlasništvu)
  const W = TF.MARKET, lineMin = p => { const l = rawLine(p); return +(l?.MIN ?? statOf(p, 'season')?.MIN ?? 0) || 0; };
  const prodOf = p => { const l = rawLine(p); if (!l) return 0; return pts ? +l.FPTS || 0 : tfProd(l, TF.PROD_W); };
  const ownOf = p => p.own?.pct ?? 0;
  const ownRank = new Map([...state.players].sort((a, b) => ownOf(b) - ownOf(a)).map((p, i) => [p.id, i + 1]));
  const mk = tfMarket(state.players.filter(p => genRaw.has(p.id)).map(p => ({ id: p.id, gen: genRaw.get(p.id), prod: prodOf(p), min: lineMin(p), own: ownOf(p), rank: ownRank.get(p.id) })), { W, poolN: pool.n, teams: pool.teams, zMin: TF.MARKET_Z_MIN });
  const mScore = mk.score, replM = mk.repl, S = mk.S;
  const gl = Object.keys(state.schedule || {}).map(tid => gamesLeft(tid)).filter(x => x != null).sort((a, b) => a - b);
  const gMed = gl.length ? gl[gl.length >> 1] : 1;
  // vrednost za ostatak sezone: tržišna vrednost po utakmici iznad nivoa zamene (kontinuirana, negativna ostaje negativna) × utakmice × dostupnost
  const market = p => { const m = mScore.get(p.id); if (m == null) return null; const g = gamesLeft(p.tid); return tfEngineLocal().star(m - replM, S, TF.STAR_POW) * (g ?? gMed) * availT(p); };
  const ros = p => market(p) ?? 0;
  // stvarna vrednost: samo produkcija u kategorijama lige (z-score, u poenima FPts), bez vlasništva, imena i minuta; projekcija nestaje posle 15 utakmica
  const realPG = new Map();
  for (const p of state.players) { const v = blendValue({ proj: LV.proj.values.get(p.id), season: LV.season.values.get(p.id), l15: LV.l15.values.get(p.id), l7: LV.l7.values.get(p.id) }, blendWeights(gpOf(p), FA.BLEND, FA.BLEND_FULL_GP, FA.REAL_PROJ_FLOOR, FA.REAL_PROJ_FADE_GP)); if (v) realPG.set(p.id, v.total); }
  const rSorted = [...realPG.values()].sort((a, b) => b - a), rBand = rSorted.slice(pool.n, pool.n + pool.teams);
  const replR = rBand.length ? rBand.reduce((a, b) => a + b, 0) / rBand.length : 0;
  const rPos = rSorted.slice(0, pool.n).map(v => v - replR).filter(v => v > 0), SR = rPos.length ? rPos.reduce((a, b) => a + b, 0) / rPos.length : 1;
  const real = p => { const r = realPG.get(p.id); if (r == null) return null; const g = gamesLeft(p.tid); return tfEngineLocal().star(r - replR, SR, TF.STAR_POW) * (g ?? gMed) * availT(p); };
  // slobodni igrači: uvezena liga = svi minus rosteri lige; inače nivo zamene iz bazena
  const bandPs = band.map(x => state.byId.get(x[0])).filter(Boolean);
  const replVec = keys.map((k, i) => bandPs.reduce((s, p) => s + vecOf(lineOf(p))[i], 0) / (bandPs.length || 1));
  const replV = bandPs.reduce((s, p) => s + ros(p), 0) / (bandPs.length || 1);
  const replRV = bandPs.reduce((s, p) => s + (real(p) ?? 0), 0) / (bandPs.length || 1);
  const wvMap = synced ? faWaivers(lg).map : null;
  const faAll = synced ? faIds.map(id => state.byId.get(id)).filter(p => p && genRaw.has(p.id) && realPG.has(p.id) && playerStatus(p, lg).g !== 'OUT')
    .map(p => ({ id: p.id, v: ros(p), rv: real(p), vec: vecOf(lineOf(p)), p, waiver: !!wvMap?.has(p.id) })).sort((a, b) => b.rv - a.rv) : [];
  // slobodno mesto (realna zamena sa waivera): uvezena liga = 3. do 5. zdravi slobodni po stvarnoj vrednosti (waiver umanjen);
  // v = njihova cena na tržištu (fer granica), rv = njihova stvarna vrednost (otpuštanje); manuelna liga, bez lige ili premalo slobodnih = nivo zamene iz bazena
  const slotSV = tfSlotValue(faAll, TF.SLOT_FROM, TF.SLOT_TO, TF.SLOT_WAIVER);
  const slotRV = slotSV ? tfSlotValue(faAll.map(f => ({ ...f, v: f.rv })), TF.SLOT_FROM, TF.SLOT_TO, TF.SLOT_WAIVER).v : replRV;
  const slot = slotSV ? { id: null, v: slotSV.v, rv: slotRV, vec: slotSV.vec, slot: true, picks: slotSV.picks } : { id: null, v: replV, rv: replRV, vec: replVec, repl: true };
  const fa = Array.from({ length: TF.MAX_SIDE }, () => slot); // svako slobodno mesto vredi isto
  // otpuštanje (moje, protivnikovo i dopuna za veto): tržišna vrednost manja od najboljeg slobodnog (uvezena liga) ili nivoa zamene, vlasništvo ispod praga
  const faBestV = synced ? Math.max(-Infinity, ...faIds.map(id => state.byId.get(id)).filter(p => p && genRaw.has(p.id)).map(ros)) : -Infinity;
  const dropBarV = Number.isFinite(faBestV) ? faBestV : replV;
  // otpuštanje (moje i protivnikovo): obe vrednosti ispod realne zamene; niska stvarna, a viša cena = Trejd kandidat (ne otpušta se)
  const verdictOf = (p, x = {}, mark = null) => dropVerdict({ ir: x.ir, own: ownOf(p), mv: ros(p), rv: real(p) }, { mv: slot.v, rv: slot.rv }, { locked: mark === 'lock' });
  // nivo zamene kao red statistike (analiza trejda): prosek igrača iz pojasa zamene, FPts kao u pretrazi
  // slobodno mesto kao red statistike (analiza trejda): isti igrači i umanjenja kao u pretrazi; procenti se ne umanjuju (računaju se iz pogođenih / pokušaja)
  const slotPs = slotSV ? slotSV.picks.map(x => ({ p: state.byId.get(x.id), w: x.w })).filter(x => x.p) : bandPs.map(p => ({ p, w: 1 }));
  const replLine = (lineFn = lineOf, fp = l => +l?.FPTS || 0) => { const out = {}, n = slotPs.length; for (const { p, w } of slotPs) { const l = lineFn(p); if (!l) continue; for (const [k, v] of Object.entries(l)) if (typeof v === 'number' && Number.isFinite(v)) out[k] = (out[k] || 0) + v * (/%|PCT/i.test(k) ? 1 : w) / n; if (pts) out._fpts = (out._fpts || 0) + fp(l) * w / n; } return n ? out : null; };
  tfBaseCache = { key, lg, pts, LV, vcats, keys, ki, cats, gpOf, lineOf, vecOf, genRaw, pool, dropBar, dropBarV, market, ros, real, ownOf, verdictOf, bandPs, replVec, replV, fa, faAll, slot, replLine, synced, injOfP, fracOf };
  return tfBaseCache;
}
/* ---------- Povređeni u trejdu: IR mesta, plasman i plejof (isto za Pronađi trejd i analizu trejda) ---------- */
/** Broj IR mesta lige; est = platforma ne daje broj (Fantrax), pa je procena */
function tfIrSlots(lg) {
  if (!lg) return { n: 0, est: false, R: null };
  const R = leagueRules(lg), n = +(R.irSlots ?? lg.slots?.ir ?? 0) || 0;
  return { n, est: !!R.synced && R.irSlots == null && n > 0, R };
}
/** Sme li igrač na IR: OUT, nije van do kraja sezone, status dozvoljen pravilom lige (pravilo nepoznato = sme, uz procenu) */
function tfIrOk(lg, p) {
  if (!lg || !p) return false;
  const inj = tfBase(lg).injOfP(p);
  if (!inj || inj.gone) return false;
  if ((inj.ret - Date.now()) / (7 * 864e5) < TF.INJ.IR_MIN_WEEKS) return false; // kratka povreda: ostaje u aktivnom rosteru
  const R = leagueRules(lg);
  return !R.irRule || R.irRule.includes(playerStatus(p, lg).key);
}
/** Slobodna IR mesta rostera (protivnik: samo uvezena liga, jer ručna liga nema njegov IR) */
function tfIrFree(lg, roster, own) {
  if (!lg || !roster) return 0;
  const S = tfIrSlots(lg);
  if (!own && !S.R.synced) return 0;
  return Math.max(0, S.n - (roster.players || []).filter(x => x.ir).length);
}
/** Ko od dolazećih igrača ide na IR primaoca: redom, dok ima slobodnih IR mesta (igrač koji je već na IR-u prethodnog tima se ne broji) */
function tfIrBound(lg, inIds, fromRoster, free) {
  if (!(free > 0)) return [];
  const onIr = new Set((fromRoster?.players || []).filter(x => x.ir).map(x => x.id));
  return inIds.filter(id => !onIr.has(id) && tfIrOk(lg, state.byId.get(id))).slice(0, free);
}
/** Plasman timova uvezene lige (seed, a bez njega procenat pobeda pa poeni) -> Map(tid -> mesto) ili null */
function tfRanks(lg) {
  const teams = lg?.import?.teams || [];
  if (teams.length < 2) return null;
  if (teams.every(x => x.seed)) return new Map(teams.map(x => [x.tid, x.seed]));
  const pct = x => { const r = x.record || {}, n = (r.w || 0) + (r.l || 0) + (r.t || 0); return n ? ((r.w || 0) + 0.5 * (r.t || 0)) / n : null; };
  if (teams.every(x => pct(x) == null && !x.pf)) return null;
  const sorted = [...teams].sort((a, b) => (pct(b) ?? 0) - (pct(a) ?? 0) || (b.pf || 0) - (a.pf || 0));
  return new Map(sorted.map((x, i) => [x.tid, i + 1]));
}
/** Približan početak plejofa (ms): ponedeljak ove nedelje + (nedelja plejofa − trenutna nedelja lige) × 7 dana, ili null */
function tfPlayoffStart(lg) {
  const pw = lg?.import?.playoffWeek, wk = lg?.import?.week;
  if (!(pw > 0) || !(wk > 0)) return null;
  const d = new Date(); d.setHours(0, 0, 0, 0);
  return d.getTime() - ((d.getDay() + 6) % 7) * 864e5 + (pw - wk) * 7 * 864e5;
}
function tfModel(ctx) {
  const lg = ctx.lg, B = tfBase(lg);
  const { pts, LV, vcats, keys, ki, cats, gpOf, lineOf, vecOf, genRaw, pool, dropBar, dropBarV, market, ros, real, ownOf, verdictOf, replVec, fa } = B;
  // povređeni: IR mesta, plasman (bori se za plejof / pri dnu), povratak posle početka plejofa
  const irS = tfIrSlots(lg), oppR = lg && ctx.oppKey ? lg.opps?.[ctx.oppKey] || null : null, synced = !!(lg && isSynced(lg));
  const myIrFree = lg ? tfIrFree(lg, lg.roster, true) : 0, thIrFree = lg ? tfIrFree(lg, oppR, false) : 0;
  const ranks = synced ? tfRanks(lg) : null, pT = lg?.import?.playoffTeams || lg?.standings?.playoffTeams || null;
  const oTid = ctx.oppKey?.startsWith('e') ? +ctx.oppKey.slice(1) : null;
  const myRank = (synced ? ranks?.get(lg.import.myTid) : null) ?? lg?.standings?.rank ?? null, oppRank = ranks?.get(oTid) ?? null;
  const contend = rk => (rk != null && pT ? rk <= pT + TF.INJ.CONTEND_EXTRA : null);
  const myContend = contend(myRank) ?? true, oppContend = contend(oppRank) === true; // moj plasman nepoznat: oprezno, kao da se borim
  const nT = ranks ? ranks.size : null, oppBottom = !!(oppRank != null && nT && oppRank > nT - Math.max(2, Math.floor(nT / 4)));
  const pStart = lg ? tfPlayoffStart(lg) : null;
  const injN = r => (r?.players || []).filter(x => B.injOfP(state.byId.get(x.id))).length;
  const sit = synced && oppR ? { oppPressure: injN(oppR) > irS.n, oppContend, oppBottom, myPressure: injN(lg.roster) > irS.n, oppInjN: injN(oppR), irSlots: irS.n } : null;
  const wkOf = inj => (inj && !inj.gone ? (inj.ret - Date.now()) / (7 * 864e5) : null);
  const entry = (x, marks, side) => { const p = state.byId.get(x.id); if (!p) return null; const mark = marks[x.id] || null;
    const vd = verdictOf(p, x, mark); // drop: sme da bude otpušten; tc: Trejd kandidat (u pretrazi samo ako pređe na drugu stranu)
    const inj = B.injOfP(p), L = tfLate(inj, pStart, side === 'theirs' ? myContend : oppContend, TF.INJ), late = L < 1;
    // plejof utiče na vrednost (fer granica), a statistika ostaje ista kao u analizi trejda (kartica i analiza daju isti rezultat)
    return { id: x.id, v: ros(p) * L, rv: real(p) ?? 0, t: genRaw.get(x.id) ?? -99, vec: vecOf(lineOf(p)), mark, ir: !!x.ir,
      out: !!inj, gone: !!inj?.gone, wk: wkOf(inj), fr: B.fracOf(p), irOk: tfIrOk(lg, p), late, drop: vd !== 'keep', tc: vd === 'trade', p }; };
  const marks = tfMarks(ctx);
  const mine = ctx.my.map(x => entry(x, marks.mine, 'mine')).filter(Boolean), theirs = ctx.opp.map(x => entry(x, marks.theirs, 'theirs')).filter(Boolean);
  // ostali timovi (za korist mog tima): svi uneti timovi lige osim mog; bez lige direktno poređenje dve strane
  const teamVec = r => { const s = new Array(keys.length).fill(0); for (const x of (r?.players || []).filter(y => !y.ir)) { const v = vecOf(lineOf(state.byId.get(x.id))); v.forEach((a, i) => { s[i] += a; }); } return s; };
  const opps = lg ? Object.values(lg.opps || {}).filter(r => r.players?.length).map(teamVec) : [];
  const myVec = lg ? teamVec(lg.roster) : teamVec({ players: ctx.my });
  const oppVec = teamVec({ players: ctx.opp });
  const cv = (v, c) => (c.pct ? (v[c.a] > 0 ? v[c.m] / v[c.a] : null) : v[c.k]);
  const sd = cats.map(c => { const xs = [myVec, ...opps].map(v => cv(v, c)).filter(v => v != null); const m = xs.reduce((a, b) => a + b, 0) / (xs.length || 1); const s = Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length || 1)); return s > 1e-9 ? s : c.pct ? 0.01 : Math.max(0.5, Math.abs(m) * 0.05); });
  const myIdx = cats.map((c, i) => i).filter(i => !(lg ? state.punt.has(cats[i].key) : false));
  // protivnik: plasman iz uvoza (punt = poslednji ili pretposlednji i ubedljivo ispod proseka; slabe kategorije veća težina)
  const oppRanks = {}; const oppPunt = new Set();
  const oppTid = lg && isSynced(lg) && ctx.oppKey?.startsWith('e') ? +ctx.oppKey.slice(1) : null;
  const teams = oppTid != null ? (lg.import.teams || []).filter(x => x.vals) : [];
  if (!pts && teams.length >= 3 && teams.some(x => x.tid === oppTid)) {
    const rc = vcats.map(c => ({ key: c.key, lowerIsBetter: c.low, made: c.made, att: c.att, type: c.pct ? 'pct' : 'sum' }));
    const rk = rotoRanks(teams.map(x => ({ id: x.tid, vals: x.vals })), rc)[oppTid] || {};
    const valOf = (tm, c) => (c.pct ? (tm.vals[c.att] > 0 ? tm.vals[c.made] / tm.vals[c.att] : null) : tm.vals[c.key] ?? null);
    for (const c of vcats) {
      if (rk[c.key] == null) continue;
      oppRanks[c.key] = { rank: rk[c.key], of: teams.length };
      const xs = teams.map(tm => valOf(tm, c)).filter(v => v != null), m = xs.reduce((a, b) => a + b, 0) / xs.length;
      const s = Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length), mine0 = valOf(teams.find(x => x.tid === oppTid), c);
      const z = s > 0 && mine0 != null ? (mine0 - m) / s * (c.low ? -1 : 1) : 0;
      if (rk[c.key] >= teams.length - 1 && z <= -TF.OPP_PUNT_Z) oppPunt.add(c.key);
    }
  } else if (!pts && lg) {
    const ranks = catRanks(ctx.oppKey);
    if (ranks) for (const x of ranks) oppRanks[x.c.key] = { rank: x.rank, of: x.of };
  }
  const oppIdx = cats.map((c, i) => i).filter(i => !oppPunt.has(cats[i].key));
  const oppW = cats.map(c => {
    const r = oppRanks[c.key];
    if (r && r.of > 2) { const third = r.of / 3; return r.rank > r.of - third ? VALUE.NEED_WEIGHT.bottom : r.rank <= third ? VALUE.NEED_WEIGHT.top : VALUE.NEED_WEIGHT.middle; }
    // bez plasmana: u odnosu na moj tim (slabiji od mene = veća težina)
    const a = cv(oppVec, c), b = cv(myVec, c);
    if (a == null || b == null) return 1;
    return (c.low ? a > b : a < b) ? VALUE.NEED_WEIGHT.bottom : VALUE.NEED_WEIGHT.top;
  });
  // forma i projekcija (Prodaj skupo / Kupi jeftino)
  const gap = pts ? TF.FORM_GAP_PTS : TF.FORM_GAP;
  const form = p => blendValue({ l15: LV.l15.values.get(p.id), l7: LV.l7.values.get(p.id) }, blendWeights(gpOf(p), { l15: 0.6, l7: 0.4 }))?.total ?? null;
  const proj = p => LV.proj.values.get(p.id) || null;
  const sell = mine.filter(x => { const f = form(x.p), pr = proj(x.p); return f != null && pr && f - pr.total >= gap; }).map(x => x.id);
  const buy = theirs.filter(x => { const f = form(x.p), pr = proj(x.p); return f != null && pr && pr.rank <= pool.n && pr.total - f >= gap; }).map(x => x.id);
  return { pts, keys, ki, cats, mine, theirs, fa, opps, sd, myIdx, oppIdx, oppW, oppRanks, oppPunt, sell, buy, lineOf, vecOf, marks, ctx, hasOppRanks: Object.keys(oppRanks).length > 0, myVec, oppVec, replVec, genRaw, dropBar, dropBarV, market, ownOf, myIrFree, thIrFree, sit, irEst: irS.est, irSlots: irS.n, injOfP: B.injOfP, pStart };
}
let tfE = null;
const tfEngineLocal = () => tfE || (tfE = tfEngine());
/** Ulaz za motor (bez objekata igrača, da ide u Worker) */
function tfInput(M) {
  const S = state.tf, si = TF.SLIDERS.indexOf(S.slider);
  const strip = x => ({ id: x.id, v: x.v, rv: x.rv, t: x.t, vec: x.vec, mark: x.mark, ir: x.ir, out: x.out, gone: x.gone, wk: x.wk, fr: x.fr, irOk: x.irOk, drop: x.drop, tc: x.tc });
  const focus = S.strat === 'cats' ? M.cats.map((c, i) => (S.focus.includes(c.key) ? i : -1)).filter(i => i >= 0) : [];
  return {
    pts: M.pts, n: M.keys.length, cats: M.cats, myIdx: M.myIdx, oppIdx: M.oppIdx, fIdx: M.ki.FPTS,
    mine: M.mine.map(strip), theirs: M.theirs.map(strip), fa: M.fa.map(x => ({ id: x.id, v: x.v, vec: x.vec })), replVec: M.replVec,
    opps: M.opps, sd: M.sd, w: focus.length ? M.cats.map((c, i) => (focus.includes(i) ? TF.FOCUS_W : 1)) : null, oppW: M.oppW,
    limits: TF.SLIDERS.slice(0, si + 1).map(k => TF.LIMITS[k]), strategy: S.strat, focus, sell: M.sell, buy: M.buy, TF, noDrop: tfNoDrop(M.ctx),
    myIrFree: M.myIrFree, thIrFree: M.thIrFree, sit: M.sit,
  };
}
/** Potpis ulaza: rezultat važi dok se ništa od ovoga ne promeni */
const tfSig = (ctx) => JSON.stringify([ctx.scopeKey, ctx.oppKey, ctx.my, ctx.opp, tfMarks(ctx), state.tf.strat, state.tf.focus, state.tf.slider, tfNoDrop(ctx), fmtKeyNow(), state.loadedAt, [...(state.punt || [])], +tfBase(ctx.lg).slot.v.toFixed(3), +(tfBase(ctx.lg).slot.rv ?? 0).toFixed(3)]); // slobodno mesto se menja kad stigne waiver lista
/** "Ne otpuštam nikoga": lični izbor po ligi (trajno) */
const TF_NODROP_KEY = 'fbaTrade.tfNoDrop.v1';
const tfNoDrop = ctx => !!(lsGet(TF_NODROP_KEY) || {})[ctx.scopeKey];
function tfSetNoDrop(ctx, on) { const all = lsGet(TF_NODROP_KEY) || {}; if (on) all[ctx.scopeKey] = true; else delete all[ctx.scopeKey]; lsSet(TF_NODROP_KEY, all); }
/** Worker iz teksta motora (jedan fajl, bez dodatnog preuzimanja) */
function tfWorker() {
  const src = `const E=(${tfEngine.toString()})();onmessage=e=>{const t0=Date.now();const r=E.search(e.data,p=>postMessage({p}));postMessage({done:r,ms:Date.now()-t0});};`;
  return new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
}
function tfStop() { const S = state.tf; if (S.worker) { S.worker.terminate(); S.worker = null; } S.busy = false; S.prog = 0; }
function tfRun() {
  const ctx = tfCtx(); tfStop();
  if (!state.players.length || !ctx.my.length || !ctx.opp.length) return;
  const M = tfModel(ctx), inp = tfInput(M), sig = tfSig(ctx), S = state.tf;
  S.busy = true; S.prog = 0; S.res = null; S.page = 0;
  const t0 = performance.now();
  const done = (r, ms) => { S.busy = false; S.worker = null; S.res = { ...r, sig, ms: ms ?? performance.now() - t0 }; S.ms = S.res.ms; S.saved = {}; S.resKey = tfSessKey(ctx); S.notice = null; tfSessSave(ctx); renderTfAll(); };
  try {
    const w = tfWorker(); S.worker = w;
    w.onmessage = e => { if (e.data.done) { w.terminate(); done(e.data.done, e.data.ms); } else { S.prog = e.data.p; const b = document.getElementById('tf-prog-bar'); if (b) b.style.width = `${Math.round(S.prog * 100)}%`; } };
    w.onerror = () => { w.terminate(); S.worker = null; setTimeout(() => done(tfEngineLocal().search(inp)), 0); };
    w.postMessage(inp);
  } catch {
    setTimeout(() => done(tfEngineLocal().search(inp)), 30); // bez Workera: isto računanje na stranici
  }
  renderTfAll();
}
const renderTfAll = () => { if (EMBED?.finder) renderFinderEmbed(); else if (state.page === 'finder') render(); else if (ttVisible()) ttRender(); };

/* ---------- Stanje stranice u sesiji (sessionStorage): predlozi, stranica, izbor; nova sesija kreće ispočetka ---------- */
const TF_SESS_KEY = 'fbaTrade.tfSession.v1';
const tfSessAll = () => { try { return JSON.parse(sessionStorage.getItem(TF_SESS_KEY)) || {}; } catch { return {}; } };
const tfSessPut = v => { // pun sessionStorage: izbaci najstarije protivnike dok ne stane
  for (let keys = Object.keys(v.e || {}); ; keys.shift()) {
    try { sessionStorage.setItem(TF_SESS_KEY, JSON.stringify(v)); return; } catch { if (keys.length <= 1) return; delete v.e[keys[0]]; }
  }
};
const tfSessKey = ctx => `${ctx.scopeKey}|${ctx.oppKey || '-'}`;
const tfRosterSig = ctx => JSON.stringify([ctx.my.map(x => [x.id, !!x.ir]), ctx.opp.map(x => [x.id, !!x.ir])]);
/** Izbor koji određuje predloge (bez vremena učitavanja podataka) */
const tfChoiceSig = ctx => JSON.stringify([tfMarks(ctx), state.tf.strat, state.tf.focus, state.tf.slider, tfNoDrop(ctx), fmtKeyNow(), [...(state.punt || [])]]);
const tfTradeKey = x => `${[...x.g].sort().join(',')}|${[...x.r].sort().join(',')}`;
function tfSessSave(ctx) {
  const S = state.tf; if (!S.res || S.resKey !== tfSessKey(ctx)) return;
  const all = tfSessAll(); all.e = all.e || {}; all.last = all.last || {};
  const k = tfSessKey(ctx); delete all.e[k]; // poslednji korišćen ide na kraj (najstariji se prvi izbacuje)
  all.e[k] = { rs: tfRosterSig(ctx), cs: tfChoiceSig(ctx), res: { list: S.res.list, stats: S.res.stats, hasTrade: S.res.hasTrade, ms: S.res.ms }, page: S.page, strat: S.strat, focus: S.focus, slider: S.slider, saved: S.saved || {} };
  all.last[ctx.scopeKey] = ctx.oppKey || null;
  tfSessPut(all);
}
/** Povratak na stranicu: isto stanje i isti predlozi bez ponovnog računanja; ako su se rosteri promenili, predlozi se brišu uz poruku */
function tfSessRestore() {
  const S = state.tf; if (S.busy) return;
  const lg = currentLeague(), all = tfSessAll();
  if (lg && !state.tf.oppBy[lg.id] && all.last?.[lg.id] && lg.opps?.[all.last[lg.id]]) state.tf.oppBy[lg.id] = all.last[lg.id];
  const ctx = tfCtx(), key = tfSessKey(ctx);
  const en = all.e?.[key];
  if (S.res && S.resKey === key && (!en || en.rs === tfRosterSig(ctx))) return; // već u memoriji, rosteri isti
  if (!en) { if (S.resKey !== key) { S.res = null; S.resKey = null; S.notice = null; } return; }
  if (en.rs !== tfRosterSig(ctx)) { delete all.e[key]; tfSessPut(all); S.res = null; S.resKey = null; S.notice = 'rosters'; return; }
  S.strat = en.strat; S.focus = en.focus || []; S.slider = en.slider; S.page = en.page || 0; S.saved = en.saved || {}; S.notice = null;
  // oznake ili prekidač promenjeni u međuvremenu: predlozi ostaju, uz poruku da je izbor promenjen
  S.res = { ...en.res, sig: en.cs === tfChoiceSig(ctx) ? tfSig(ctx) : 'stale' }; S.resKey = key;
}
/* ---------- Ocene predloga (👍 / 👎): samo u ovom browseru, ne utiču na predloge; služe za kasnije podešavanje konstanti ---------- */
const RATE_KEY = 'fbaTrade.tfRatings.v1', RATE_MAX = 500;
const rateAll = () => { const a = lsGet(RATE_KEY); return a?.v === 1 && Array.isArray(a.items) ? a : { v: 1, items: [] }; };
const rateOf = k => rateAll().items.find(x => x.k === k)?.rating || 0;
/** Liga i format za ocenu: bez imena menadžera i owner GUID-ova (samo imena timova) */
const rateLeague = (lg, cats) => ({ id: lg?.id || 'quick', platform: lg?.platform || null, format: isPointsFmt() ? 'points' : 'cats', cats: (cats || []).map(c => c.key), teams: lg ? 1 + Object.keys(lg.opps || {}).length : 2 });
const ratePlayer = (B, id) => { const p = state.byId.get(id); return p ? { id, name: p.name, price: +(B.ros(p)).toFixed(2), real: +(B.real(p) ?? 0).toFixed(2) } : { id }; };
const r2 = v => (Number.isFinite(v) ? +v.toFixed(3) : null);
/** Dugmad 👍 / 👎 (kind: 'tf' = Pronađi trejd, 'fa' = Pojačanja sa FA; i = indeks kartice) */
function rateBtnsHTML(k, action, i) {
  const r = rateOf(k), b = (val, ic, label) => `<button type="button" class="rate-btn ${val > 0 ? 'up' : 'down'}${r === val ? ' on' : ''}" data-action="${action}" data-i="${i}" data-r="${val}" aria-pressed="${r === val}" title="${esc(t(label))}" aria-label="${esc(t(label))}">${ic}</button>`;
  return `<span class="rate-btns">${b(1, '👍', 'Ovo bih uradio')}${b(-1, '👎', 'Ovo je loše')}</span>`;
}
/** Sačuva ocenu i osveži samo dugmad na kartici (bez novog prikaza) */
function rateSave(entry, el) {
  const { all, rating } = tfRateApply(rateAll(), entry, RATE_MAX);
  lsSet(RATE_KEY, all);
  el.closest('.rate-btns')?.querySelectorAll('.rate-btn').forEach(b => { const on = +b.dataset.r === rating; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
  if (rating) toast(t('Ocena sačuvana'), 2000);
}
function tfRate(i, rating, el) {
  const S = state.tf, x = S.res?.list[i], ctx = tfCtx(); if (!x) return;
  const M = tfModel(ctx), B = tfBase(ctx.lg), pl = id => ratePlayer(B, id), sum = ids => r2(ids.reduce((a, id) => a + B.ros(state.byId.get(id) || {}), 0));
  rateSave({ k: tfRateKey('finder', ctx.lg?.id, x.g, x.r), ts: new Date().toISOString(), tool: 'finder', rating,
    league: rateLeague(ctx.lg, M.cats), strategy: S.strat, slider: S.slider, focus: [...(S.focus || [])],
    give: x.g.map(pl), get: x.r.map(pl), myDrop: x.md.map(pl), thDrop: x.od.map(pl), conv: !!x.conv, shape: x.shape || `${x.g.length}:${x.r.length}`,
    result: { gain: r2(x.gain), score: r2(x.s), oppGain: r2(x.ob), tier: x.tier, rank: i + 1, page: Math.floor(i / TF.PER_PAGE) + 1, priceGive: sum(x.g), priceGet: sum(x.r), freeMine: x.mf, freeTheirs: x.of, slotPrice: r2(B.slot.v), slotReal: r2(B.slot.rv) },
    myTeam: ctx.lg?.roster?.name || null, opp: ctx.oppName || null }, el);
}
function faRate(i, rating, el) {
  const lg = currentLeague(); if (!lg) return;
  const M = faModel(lg), s = M.sugg[i]; if (!s) return;
  const B = tfBase(lg), pl = id => ratePlayer(B, id);
  rateSave({ k: tfRateKey('fa', lg.id, [s.drop], [s.id]), ts: new Date().toISOString(), tool: 'fa', rating,
    league: rateLeague(lg, M.cats), strategy: M.ui.need || null, slider: null, focus: M.weights ? Object.keys(M.weights).filter(k => M.weights[k] === 1) : [],
    give: [pl(s.drop)], get: [pl(s.id)], myDrop: [], thDrop: [], conv: false, shape: '1:1', manual: M.picks.length > 0,
    result: { gain: r2(s.gain), score: r2(s.score), warn: !!s.warn, rank: i + 1, slotPrice: r2(B.slot.v), slotReal: r2(B.slot.rv) },
    myTeam: lg.roster?.name || null, opp: null }, el);
}
/** Izvoz ocena u JSON fajl */
function rateExport() {
  const a = rateAll(); if (!a.items.length) return;
  const d = new Date(), pad = n => String(n).padStart(2, '0');
  const blob = new Blob([JSON.stringify({ app: 'RosterSwing', kind: 'proposal-ratings', v: 1, exported: d.toISOString(), items: a.items }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob), link = Object.assign(document.createElement('a'), { href: url, download: `rosterswing-ocene-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.json` });
  document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function rateWipe() {
  const n = rateAll().items.length; if (!n) return;
  showModal({
    title: t('Obrisati ocene predloga?'),
    body: `<p>${t('Sve ocene ({n}) biće trajno obrisane iz ovog browsera. Ovo ne može da se vrati, osim iz izvezenog fajla.', { n })}</p>`,
    confirm: t('Obriši ocene'), danger: true,
    onConfirm: () => { localStorage.removeItem(RATE_KEY); toast(t('Ocene su obrisane')); },
  });
}
/** Sačuvaj predlog kao nov tab Analize trejda (otpuštanja, slobodno mesto i mešavina perioda), bez prelaska na Analizu */
function tfSaveTrade(i) {
  const S = state.tf, x = S.res?.list[i], ctx = tfCtx(); if (!x || ctx.quick) return;
  const k = tfTradeKey(x);
  const s = scopeTabs();
  let tab = tfTabFor(s.tabs, x.g, x.r, S.saved?.[k]); // isti trejd se ne čuva dvaput
  if (!tab) {
    tab = { ...newTab([x.g, x.r], { ...emptyBalance(), my: { drops: [...x.md], waivers: [] }, opp: { drops: [...x.od], waivers: [] } }), mix: true, opp: ctx.oppKey };
    s.tabs.push(tab); persistTrades(); // aktivan tab Analize se ne menja
  }
  S.saved = { ...(S.saved || {}), [k]: tab.id }; tfSessSave(ctx);
  renderTfAll();
  toast(t('Sačuvano u Analizi trejda'), 5000, { label: t('Otvori'), on: () => tfOpen(i) });
}

/* ---------- Prikaz ---------- */
function tfRowHTML(x, side, marks, quick) {
  const p = x.p || state.byId.get(x.id); if (!p) return '';
  const cur = marks[x.id] || '';
  const kinds = side === 'mine' ? ['lock', 'soft', 'trade'] : ['lock', 'trade'];
  const btns = kinds.map(k => { const M = TF_MARKS[k], tip = t(side === 'mine' ? M.tipMine : M.tipTheirs) + (side === 'mine' && k === 'lock' && !quick ? ` ${t('Važi za sve protivnike u ovoj ligi')}` : ''), on = cur === k;
    return `<button type="button" class="tf-mk mk-${k} ${on ? 'on' : ''}" data-action="tf-mark" data-side="${side}" data-id="${p.id}" data-m="${k}" aria-pressed="${on}" title="${esc(`${t(M.sr)}: ${tip}`)}" aria-label="${esc(t(M.sr))}"><span class="ic" aria-hidden="true">${M.ic}</span><span class="lb">${t(M.sr)}</span></button>`; }).join('');
  return `<li class="tf-row ${cur ? `m-${cur}` : ''}"><span class="pm-open" data-pm="${p.id}">${avatarHTML(p)}</span>
    <div class="tf-id"><button type="button" class="nm pm-open" data-pm="${p.id}">${esc(p.name)}</button><span class="meta">${p.team} · ${posTxt(p)} ${injHTML(p)}${x.ir ? ' <span class="slot-tag tag-ir">IR</span>' : ''}</span></div>
    <div class="tf-marks" role="group" aria-label="${esc(p.name)}">${btns}${quick ? `<button type="button" class="tf-rm" data-action="tf-q-rm" data-side="${side === 'mine' ? 'my' : 'opp'}" data-id="${p.id}" aria-label="${esc(t('Ukloni'))}">✕</button>` : ''}</div></li>`;
}
function tfTeamHTML(ctx, side, marks) {
  const list = side === 'mine' ? ctx.my : ctx.opp;
  const rows = list.map(x => tfRowHTML(x, side, marks[side], ctx.quick)).join('');
  const search = ctx.quick ? searchBoxHTML(side === 'mine' ? 'tf-my' : 'tf-opp', t('Dodaj igrača…')) : '';
  if (side === 'mine') {
    return `<section class="card tf-team"><div class="card-h"><div class="side-title"><b>${ctx.quick ? t('Tvoj tim') : t('Moj tim')}</b><small>${ctx.quick ? '' : esc(ctx.lg.teamName || ctx.lg.roster?.name || '')}</small></div>
      <button type="button" class="linkbtn" data-action="tf-reset">${t('Poništi sve')}</button></div>
      ${rows ? `<ul class="tf-list">${rows}</ul>` : `<p class="pnote tf-empty">${ctx.quick ? t('Dodaj igrače svog tima.') : t('Tvoj tim u ovoj ligi nema igrača. Izaberi svoj tim u podešavanjima lige.')}</p>`}${search}</section>`;
  }
  const sel = ctx.quick ? `<b>${t('Protivnik')}</b>` : ctx.opps.length
    ? `<select data-tf-opp aria-label="${esc(t('Izaberi protivnika'))}"><option value="" ${ctx.oppKey ? '' : 'selected'}>${t('Izaberi protivnika')}</option>${ctx.opps.map(([k, o]) => `<option value="${k}" ${k === ctx.oppKey ? 'selected' : ''}>${esc(o.name)}</option>`).join('')}</select>` : `<b>${t('Protivnik')}</b>`;
  let body;
  if (rows) body = `<ul class="tf-list">${rows}</ul>`;
  else if (ctx.quick) body = `<p class="pnote tf-empty">${t('Dodaj igrače protivnika.')}</p>`;
  else if (ctx.opps.length && !ctx.oppKey) body = `<p class="pnote tf-empty">${t('Izaberi tim sa kojim tražiš trejd.')}</p>`;
  else if (!ctx.opps.length) body = `<p class="pnote tf-empty">${t('U ovoj ligi još nema protivnika.')} <button type="button" class="btn small" data-action="tf-add-opp">${t('Dodaj protivnika')}</button></p>`;
  else body = `<p class="pnote tf-empty">${t('Roster ovog tima nije unet.')} <button type="button" class="btn small" data-action="tf-enter-roster" data-opp="${ctx.oppKey}">${t('Unesi roster')}</button></p>`;
  return `<section class="card tf-team"><div class="card-h"><div class="side-title tf-oppsel">${sel}</div></div>${body}${search}</section>`;
}
function tfControlsHTML(M) {
  const S = state.tf;
  const strats = TF_STRATS.map(s => `<button type="button" class="tf-strat ${S.strat === s.id ? 'on' : ''}" data-action="tf-strat" data-v="${s.id}" aria-pressed="${S.strat === s.id}" data-tip="${esc(t(s.tip))}">${t(s.sr)}</button>`).join('');
  const cats = S.strat === 'cats' && M && !M.pts ? `<div class="tf-focus">${M.cats.map(c => { const on = S.focus.includes(c.key), punt = !M.myIdx.includes(M.cats.indexOf(c)); return `<button type="button" class="fa-need ${punt ? 'punt' : on ? 'on' : ''}" data-action="tf-focus" data-k="${c.key}" aria-pressed="${on}" ${punt ? 'disabled' : ''}>${esc(c.label)}</button>`; }).join('')}</div>` : '';
  const slider = `<div class="seg small tf-slider" role="group" aria-label="${esc(t('Koliko u tvoju korist'))}">${TF_SLIDER.map(x => `<button type="button" data-action="tf-slider" data-v="${x.id}" aria-pressed="${S.slider === x.id}">${t(x.sr)}</button>`).join('')}</div>`;
  const nd = tfNoDrop(tfCtx());
  const noDrop = `<button type="button" class="tf-toggle" data-action="tf-nodrop" aria-pressed="${nd}" data-tip="${esc(t('Predlažu se samo trejdovi u kojima ne dobijaš više igrača nego što daješ, pa ne moraš nikog da otpustiš.'))}"><span class="box" aria-hidden="true">${nd ? '✓' : ''}</span>${t('Ne otpuštam nikoga')}</button>`;
  const busy = S.busy ? `<div class="tf-busy"><div class="tf-prog"><i id="tf-prog-bar" style="width:${Math.round(S.prog * 100)}%"></i></div><span class="hint">${t('Tražim trejdove…')}</span><button type="button" class="linkbtn" data-action="tf-stop">${t('Prekini')}</button></div>` : '';
  return `<section class="pcard tf-ctrl"><div class="tf-strats" role="group" aria-label="${esc(t('Strategija'))}">${strats}</div>${cats}
    <div class="tf-ctrl-row">${slider}${noDrop}<span class="i" data-tip="${esc(t('Fer: razlika u vrednosti do 10%. Malo u moju korist: do 12,5%. Agresivno: do 15%. Ako obeležiš igrača sa U trejd, granica je 5% šira. Alat uvek prvo nudi trejdove bliže fer.'))}">ⓘ</span>
      <button type="button" class="btn" data-action="tf-run" ${S.busy || !M ? 'disabled' : ''}>${t('Pronađi trejdove')}</button></div>${busy}</section>`;
}
/** Linije za prikaz na kartici: izabrani period u zaglavlju (kao FA kartica); slobodno mesto / nivo zamene iz mešavine */
function tfCardView(M, x) {
  const keys = M.keys, E = tfEngineLocal();
  const vec = p => M.vecOf(M.lineOf(p)); // ista mešavina kao u pretrazi (sezona, 15 i 7 dana i projekcija), pa se kartica i redosled slažu
  const my = M.ctx.my.filter(y => !y.ir).map(y => state.byId.get(y.id)).filter(Boolean);
  const before = keys.map(() => 0); for (const p of my) vec(p).forEach((v, i) => { before[i] += v; });
  const after = [...before];
  const addP = (p, s) => vec(p).forEach((v, i) => { after[i] += s * v; });
  const irSet = new Set([...M.ctx.my, ...M.ctx.opp].filter(y => y.ir).map(y => y.id));
  for (const id of x.g) if (!irSet.has(id)) addP(state.byId.get(id), -1);
  for (const id of x.r) if (!irSet.has(id)) addP(state.byId.get(id), 1);
  // kasnija otpuštanja i privremena slobodna mesta: samo deo utakmica dok je povređeni na IR-u, kao u pretrazi
  const mdNow = x.md.length - (x.mdl || 0), mfP = x.mf - (x.mft || 0), wr = x.wr || 0;
  x.md.forEach((id, k) => addP(state.byId.get(id), k < mdNow ? -1 : -(1 - wr)));
  for (let k = 0; k < x.mf; k++) { const s = k < mfP ? 1 : wr; (M.fa[k]?.vec || M.replVec).forEach((a, i) => { after[i] += s * a; }); } // slobodno mesto: najbolji slobodan ili nivo zamene, kao u pretrazi
  if (M.pts) {
    const pl = id => M.lineOf(state.byId.get(id));
    const sumC = (ids, k) => ids.reduce((s, id) => s + (+pl(id)?.[k] || 0), 0);
    const d = after[M.ki.FPTS] - before[M.ki.FPTS];
    const ch = CATS.filter(c => !c.fpts && c.w).map(c => ({ c, v: sumC(x.r, c.key) - sumC(x.g, c.key) })).filter(y => Math.abs(y.v * y.c.w) >= 0.5).sort((a, b) => Math.abs(b.v * b.c.w) - Math.abs(a.v * a.c.w)).slice(0, 3);
    return { wl: `${d >= 0 ? '+' : '−'}${Math.abs(d).toFixed(1)} FPts`, head: t('{d} FPts po utakmici', { d: `${d >= 0 ? '+' : '−'}${Math.abs(d).toFixed(1)}` }), up: d >= 0, changes: ch.map(y => `<span class="${(y.c.w > 0) === (y.v > 0) ? 'up' : 'down'}">${y.c.label} ${y.v > 0 ? '+' : '−'}${Math.abs(y.v).toFixed(1)}</span>`).join(' · '), chips: '' };
  }
  const r = E.sideResult(before, after, M.cats, M.myIdx, TF.TIE);
  const cv = (v, c) => (c.pct ? (v[c.a] > 0 ? v[c.m] / v[c.a] : null) : v[c.k]);
  const big = M.myIdx.filter(i => r.res[i]).sort((a, b) => Math.abs(cv(after, M.cats[b]) - cv(before, M.cats[b])) / M.sd[b] - Math.abs(cv(after, M.cats[a]) - cv(before, M.cats[a])) / M.sd[a]).slice(0, 3);
  const fc = c => ({ ratio: c.ratio, type: c.pct ? 'pct' : 'sum' });
  const chg = i => { const c = M.cats[i], b = cv(before, c), a = cv(after, c); return c.pct ? `${c.label} ${fmtCat(fc(c), b)} → ${fmtCat(fc(c), a)}` : `${c.label} ${fmtDelta(fc(c), a - b).txt}`; };
  return {
    wl: `${r.win}:${r.lose}`, head: faWL(r.win, r.lose), up: r.win >= r.lose,
    changes: big.map(i => `<span class="${r.res[i] > 0 ? 'up' : 'down'}">${chg(i)}</span>`).join(' · '),
    chips: M.myIdx.map(i => { const v = r.res[i]; return `<span class="fa-chip ${v > 0 ? 'up' : v < 0 ? 'down' : 'tie'}">${v > 0 ? '✓' : v < 0 ? '✗' : '='} ${esc(M.cats[i].label)}</span>`; }).join(''),
  };
}
/** "Zašto bi prihvatio": kategorija koju dobija, a u kojoj je najslabiji */
function tfWhy(M, x) {
  // povređeni: situacija koja je glavni razlog (pritisak na roster, plasman, slobodno IR mesto)
  if (x.sit === 'pressure' && M.sit) return t('Ima {n} {k}, a {m} IR {s}.', { n: M.sit.oppInjN, k: plural(M.sit.oppInjN, ['povređenog igrača', 'povređena igrača', 'povređenih igrača'], ['injured player', 'injured players']), m: M.sit.irSlots, s: plural(M.sit.irSlots, ['mesto', 'mesta', 'mesta'], ['spot', 'spots']) });
  if (x.sit === 'contend') return t('Bori se za plejof i treba mu produkcija sada.');
  if (x.sit === 'rebuild') return t('Pri dnu je tabele, pa mu je manje važno da čeka povratak.');
  if (x.sit === 'sellmy') return t('Ima slobodno IR mesto, pa može da sačeka povratak.');
  if (x.sit === 'myir') return t('Za povređenog igrača odmah dobija zdravog.');
  if (M.pts) return x.ob > 0.05 ? t('Dobija {d} FPts po utakmici.', { d: `+${x.ob.toFixed(1)}` }) : t('Za njega je trejd skoro ravnopravan po FPts.');
  const won = x.ow.map(i => M.cats[i]);
  if (!won.length) return t('Trejd je za njega ravnopravan po vrednosti.');
  if (M.hasOppRanks) {
    const best = [...won].sort((a, b) => (M.oppRanks[b.key]?.rank || 0) - (M.oppRanks[a.key]?.rank || 0))[0], r = M.oppRanks[best.key];
    if (r) return t('Dobija {c}, gde je {n}. u ligi.', { c: best.label, n: r.rank, o: ordinalEn(r.rank) });
  }
  const weak = won.filter(c => M.oppW[M.cats.indexOf(c)] > 1);
  if (weak.length) return t('Dobija {c}, gde je slabiji od tebe.', { c: weak.slice(0, 2).map(c => c.label).join(', ') });
  return t('Dobija {c}.', { c: won.slice(0, 3).map(c => c.label).join(', ') });
}
/** Savet za veto lige (samo prikaz): neravnomeran trejd za tačno jednog igrača, a strana koja daje manje ima igrača na granici rostera
    (vlasništvo ispod praga, slabiji od najboljeg slobodnog ili nivoa zamene i tržišna vrednost ispod nivoa zamene) -> igrač ili null */
function tfVetoCand(M, x) {
  const nG = x.g.length, nR = x.r.length;
  if (Math.abs(nG - nR) !== 1) return null;
  const side = nG < nR ? M.mine : M.theirs, used = new Set([...x.g, ...x.r, ...x.md, ...x.od]);
  return tfVetoPick(side.map(e => ({ ...e, own: M.ownOf(e.p) })), used, M.dropBarV, FA.DROP_MAX_OWN);
}
/** "Slobodno mesto: X (najbolji slobodan)" ili "Slobodno mesto: nivo zamene", za svako mesto */
function tfFreeSlotText(list) {
  return list.map(f => (f.id != null && state.byId.get(f.id) ? t('Slobodno mesto: {p} (najbolji slobodan).', { p: esc(state.byId.get(f.id).name) }) : f.slot ? t('Slobodno mesto: realna zamena sa waivera.') : t('Slobodno mesto: nivo zamene.'))).join(' ');
}
function tfVetoHTML(x, c) {
  return c ? `<p class="pnote tf-veto">${t('Za veto lige: dodaj {p} da bude {a}:{a}.', { p: `<b>${esc(c.p.name)}</b>`, a: Math.max(x.g.length, x.r.length) })}</p>` : '';
}
const ordinalEn = n => { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`; };
/** Otpuštanja i slobodno mesto za predlog (kartica Pronađi trejd, izveštaj Meta za trejd) */
function tfDropText(M, x) {
  const nmL = ids => ids.map(id => esc(state.byId.get(id)?.name || '')).join(', ');
  const mdNow = x.md.length - (x.mdl || 0), mfP = x.mf - (x.mft || 0), irN = nmL(x.irIn || []);
  return [mdNow ? t('Otpuštaš: {n}', { n: nmL(x.md.slice(0, mdNow)) }) : '',
    x.mdl ? t('Kad se {ir} vrati sa IR-a, otpuštaš: {n}', { ir: irN, n: nmL(x.md.slice(mdNow)) }) : '',
    mfP ? tfFreeSlotText(M.fa.slice(0, mfP)) : '',
    x.mft ? t('Dok je {ir} na IR-u, slobodno mesto popunjava igrač sa waivera.', { ir: irN }) : ''].filter(Boolean).join(' ');
}
function tfCardHTML(M, x, i, veto = null) {
  const v = tfCardView(M, x);
  // povređeni: status (sa "(ESPN)" kad liga ne daje status) i procena povratka; "ide na IR" kad ide na slobodno IR mesto primaoca
  const injTxt = p => (M.injOfP(p) ? `<span class="tf-inj">${esc(stLabel(playerStatus(p, M.ctx.lg)))}, ${esc(injRetText(p, M.ctx.lg))}</span>` : '');
  const toIr = new Set([...(x.irIn || []), ...(x.irOut || [])]);
  const pl = (id, soft) => { const p = state.byId.get(id); if (!p) return ''; return `<li>${avatarHTML(p)}<span class="tf-pn"><b>${esc(p.name)}</b><small>${p.team} · ${posTxt(p)}${soft ? ` <span class="slot-tag tag-soft" title="${esc(t('Dajem ako mora'))}">💲 ${t('Dajem ako mora')}</span>` : ''}${toIr.has(id) ? ` <span class="slot-tag tag-ir">${t('ide na IR')}</span>` : ''}</small>${injTxt(p)}</span></li>`; };
  const soft = id => M.marks.mine[id] === 'soft';
  const drop = tfDropText(M, x);
  // Sačuvaj: nov tab u Analizi trejda bez prelaska; bez lige nema tabova lige, pa ni dugmeta
  const saved = !!state.tf.saved?.[tfTradeKey(x)];
  const saveBtn = M.ctx.quick ? '' : saved ? `<span class="slot-tag tag-in tf-saved">✓ ${t('Sačuvano')}</span><button type="button" class="btn small sec" disabled>${t('Sačuvaj')}</button>` : `<button type="button" class="btn small sec" data-action="tf-save" data-i="${i}">${t('Sačuvaj')}</button>`;
  return `<article class="tf-card${saved ? ' saved' : ''}" data-action="tf-open" data-i="${i}">
    <div class="tf-sides"><div><span class="slot-tag tag-out">${t('Daješ')}</span><ul>${x.g.map(id => pl(id, soft(id))).join('')}</ul></div>
      <div><span class="slot-tag tag-in">${t('Dobijaš')}</span><ul>${x.r.map(id => pl(id, false)).join('')}</ul></div></div>
    ${drop ? `<p class="pnote tf-drop">${drop}</p>` : ''}${toIr.size && M.irEst ? `<p class="pnote tf-drop">${t('Broj IR mesta je procena. Proveri u podešavanjima lige.')}</p>` : ''}
    <div class="fa-score ${v.up ? 'up' : 'down'}"><b>${v.head}</b>${v.changes ? `<span class="fa-changes">${v.changes}</span>` : ''}</div>
    ${v.chips ? `<div class="fa-chips">${v.chips}</div>` : ''}
    <p class="tf-why"><b>${t('Zašto bi prihvatio')}:</b> ${tfWhy(M, x)}</p>${tfVetoHTML(x, veto)}
    <div class="tf-foot">${rateBtnsHTML(tfRateKey('finder', M.ctx.lg?.id, x.g, x.r), 'tf-rate', i)}${saveBtn}<button type="button" class="btn small" data-action="tf-open" data-i="${i}">${t('Otvori u analizi')}</button></div></article>`;
}
function tfEmptyHTML(M, res) {
  const st = res.stats, S = state.tf, why = [];
  if (S.strat === 'depth' && tfNoDrop(M.ctx)) why.push(t('Dubina uvek dobija više igrača, a uključeno je Ne otpuštam nikoga.'));
  else if (st.reqTooMany) why.push(t('Obeležio si više od 4 igrača sa U trejd na jednoj strani.'));
  else if (!st.myCombos || !st.theirCombos) why.push(t('Previše zaključanih igrača: nema koga da ponudiš ili koga da tražiš.'));
  else if (!st.value) why.push(t('Granica vrednosti je previše stroga za ova dva tima.'));
  else if (!st.cats) why.push(M.pts ? t('Svaki trejd koji je fer po vrednosti protivniku previše smanjuje FPts.') : t('Svaki trejd koji je fer po vrednosti protivniku previše šteti u kategorijama.'));
  else if (!st.gain) why.push(t('Protivnik trenutno nema ono što tvom timu treba.'));
  else if (S.strat === 'sell') why.push(M.sell.length ? t('Nijedan trejd sa tvojim igračima u formi iznad projekcije ne prolazi pravila fer trejda.') : t('Nijedan tvoj igrač nema formu znatno iznad projekcije.'));
  else if (S.strat === 'buy') why.push(M.buy.length ? t('Nijedan trejd sa njegovim igračima u lošoj formi ne prolazi pravila fer trejda.') : t('Protivnik nema igrača sa dobrom projekcijom i formom znatno ispod nje.'));
  else why.push(t('Nijedan trejd ne prolazi pravila fer trejda sa ovim izborom.'));
  const tips = [S.slider !== 'aggr' ? t('probaj Agresivno') : '', Object.values(M.marks.mine).concat(Object.values(M.marks.theirs)).some(m => m === 'lock') ? t('zaključaj manje igrača') : '', t('izaberi drugu strategiju'), !M.ctx.quick ? t('ili drugog protivnika') : ''].filter(Boolean);
  return `<div class="pcard fa-none tf-none"><b>${t('Nema trejdova koji prolaze')}</b><p class="pnote">${why.join(' ')}</p><p class="pnote">${t('Šta možeš da promeniš')}: ${tips.join(', ')}.</p></div>`;
}
function tfResultsHTML(M, ctx) {
  const S = state.tf, res = S.res;
  if (S.busy) return '';
  if (!res && S.notice === 'rosters') return `<p class="pnote tf-hint">${t('Rosteri su se promenili, pokreni pretragu ponovo.')}</p>`;
  if (!res) return `<p class="pnote tf-hint">${t('Obeleži igrače ako želiš, izaberi strategiju i klikni Pronađi trejdove.')}</p>`;
  if (res.sig !== tfSig(ctx)) return `<p class="pnote tf-hint">${t('Promenio si izbor. Klikni Pronađi trejdove za nove predloge.')}</p>`;
  if (!res.list.length) return tfEmptyHTML(M, res);
  const items = tfEngineLocal().pageItems(res.list, S.page, TF.PER_PAGE);
  const more = (S.page + 1) * TF.PER_PAGE < res.list.length;
  const picks = items.map(x => tfVetoCand(M, x)), shown = tfVetoShown(picks, TF.VETO_MAX); // savet samo gde je dopuna najočiglednija
  return `<h3 class="fa-h">${t('Predlozi')}</h3><div class="tf-cards">${items.map((x, k) => tfCardHTML(M, x, S.page * TF.PER_PAGE + k, shown.has(k) ? picks[k] : null)).join('')}</div>
    <div class="tf-more">${more ? `<button type="button" class="btn sec" data-action="tf-more">${t('Generiši novih 8')}</button>` : `<span class="hint">${t('To su svi predlozi za ovaj izbor.')}</span>`}</div>`;
}
/** Telo alata (liga i javna stranica) */
function tfBodyHTML() {
  if (state.players.length) tfSessRestore();
  const ctx = tfCtx(), marks = tfMarks(ctx);
  const ready = state.players.length && ctx.my.length && ctx.opp.length;
  const M = ready ? tfModel(ctx) : null;
  return `<div class="tf-split">${tfTeamHTML(ctx, 'mine', marks)}${tfTeamHTML(ctx, 'theirs', marks)}</div>
    ${tfControlsHTML(M)}<div id="tf-results">${M ? tfResultsHTML(M, ctx) : ''}</div>`;
}
function renderFinderPage() {
  const lg = currentLeague();
  const R = leagueRules(lg);
  const dl = R.deadline && R.deadline < Date.now() ? `<div class="banner info dl-bar"><span>⏱ ${t('Rok za trejdove je prošao. Alat i dalje radi, za razmišljanje i sledeću sezonu.')}</span></div>` : '';
  return `<h2 class="page-t">${t('Pronađi trejd')}${lg.teamName ? ` <span class="hint">${esc(lg.teamName)}</span>` : ''}</h2>${dl}
    <p class="pnote fa-lead">${isPointsFmt() ? t('Predlozi su trejdovi fer po vrednosti za obe strane, rangirani po tome koliko FPts po utakmici dobija tvoj tim (mešavina sezone, poslednjih 15 i 7 dana i projekcije).') : t('Predlozi su trejdovi fer po vrednosti za obe strane, rangirani po tome koliko kategorija više dobijaš protiv ostalih timova lige (mešavina sezone, poslednjih 15 i 7 dana i projekcije).')}</p>
    ${state.players.length ? tfBodyHTML() : `<p class="pnote">${t('Učitavam igrače…')}</p>`}`;
}
/** Javna stranica /trade-finder/: izbor lige gore, pa alat bez lige */
function renderFinderEmbed() {
  const el = document.getElementById('tf-app'); if (!el) return;
  // iz Mete za trejd (Dodaj protivnika): pretraga kreće sama, jednom, kad su igrači učitani
  let auto = false; try { auto = state.players.length && sessionStorage.getItem(TF_AUTORUN_KEY) === '1'; if (auto) sessionStorage.removeItem(TF_AUTORUN_KEY); } catch {}
  if (auto) { state.tf.strat = 'best'; state.tf.slider = 'fair'; state.tf.focus = []; tfRun(); return; }
  syncCats();
  const leagues = profile?.leagues || [];
  const lgBar = document.getElementById('tf-leagues');
  // Tvoje lige: kartice (ime, platforma, moj tim, format), cela kartica vodi na Pronađi trejd u ligi; bez liga se sekcija ne prikazuje
  if (lgBar) {
    lgBar.hidden = !leagues.length;
    lgBar.innerHTML = leagues.length ? `<h2 class="tf-sec-h">${t('Tvoje lige')}</h2><div class="tf-lgrid">${leagues.map(l => `<a class="lcard tf-lcard" href="${esc(EMBED.app)}#league-${l.id}/find-trade&lang=${LANG}">
      <span class="lc-top"><span class="lc-name">${esc(lgName(l))}</span><span class="pbadge">${esc(isSynced(l) ? platformLabel(l.platform) : t('Ručna'))}</span></span>
      ${l.teamName ? `<span class="lc-team">${esc(l.teamName)}</span>` : ''}<span class="lc-fmt">${esc(formatShort(leagueFormatOf(l)))}</span></a>`).join('')}</div>` : '';
  }
  const mh = document.getElementById('tf-manual-h');
  if (mh) mh.textContent = leagues.length ? t('Ili unesi oba tima ručno') : t('Unesi oba tima');
  const ctx = tfCtx();
  const save = ctx.my.length && ctx.opp.length ? `<button type="button" class="btn sec" data-action="tf-save-league">${t('Sačuvaj kao ligu')}</button>` : '';
  el.innerHTML = `${state.players.length ? tfBodyHTML() : `<p class="pnote">${state.error ? esc(state.error) : t('Učitavam igrače…')}</p>`}<div class="tf-save">${save}</div>`;
  const fb = document.getElementById('fmtbar'); if (fb) fb.innerHTML = quickFormatChipHTML();
  renderPeriods();
}
/** Otvori Pronađi trejd sa izabranim protivnikom (i igračima obeleženim U trejd): veze iz Analize, Lige, FA i budućih Meta za trejd */
function openFinder({ opp = null, want = null, give = null, run = false, back = 'finder' } = {}) {
  const lg = currentLeague(); if (!lg) return;
  if (opp && lg.opps[opp]) state.tf.oppBy[lg.id] = opp;
  const ctx = tfCtx();
  if (want) tfSetMark(ctx, 'theirs', want, 'trade');
  if (give) tfSetMark(ctx, 'mine', give, 'trade');
  state.tf.res = null;
  if (run) { state.tf.strat = 'best'; state.tf.slider = 'fair'; } // Mete za trejd: isti izbor kao mogući trejd na kartici
  setBack(back); goPage('finder');
  if (run) tfRun();
}
window.openFinder = openFinder;
function tfOpen(i) { const x = state.tf.res?.list[i]; if (x) tfOpenX(x, tfCtx()); }
/** Otvori predlog u Analizi trejda (Pronađi trejd i Mete za trejd): otpuštanja, slobodno mesto, mešavina perioda */
function tfOpenX(x, ctx) {
  // analiza dobija i otpuštanja, slobodno mesto računa sama (najbolji slobodan ili nivo zamene), a rezultat je za istu mešavinu perioda kao kartica
  if (ctx.quick) { const base = EMBED?.ta || '../trade-analyzer/'; location.href = `${base}#per=${state.period}&t=${x.g.join(',')}|${x.r.join(',')}&d=${x.md.join(',')}|${x.od.join(',')}&m=${ctx.my.filter(y => !y.ir).map(y => y.id).join(',')}&mix=1`; return; }
  setBack('trade');
  const savedId = state.tf.saved?.[tfTradeKey(x)], savedTab = savedId ? tfTabFor(scopeTabs().tabs, x.g, x.r, savedId) : null;
  if (savedTab) { // već sačuvan: otvori postojeći tab
    if (ctx.oppKey && state.rosters.opps[ctx.oppKey]) { state.rosters.oppSel = ctx.oppKey; saveRosters(); }
    activateTab(savedTab.id);
  } else {
    openInAnalysis([x.g, x.r], { opp: ctx.oppKey });
    state.balance.my = { drops: [...x.md], waivers: [] }; state.balance.opp = { drops: [...x.od], waivers: [] };
    activeTab().mix = true; activeTab().opp = ctx.oppKey; state.mix = true;
  }
  persistTrades();
  goPage('trade');
}
function tfSaveLeague() {
  const q = lsGet(TF_QUICK_KEY) || { my: [], opp: [] };
  if (!q.my.length || !q.opp.length) return;
  const fmt = quickFormat();
  if (!profile) profile = newProfile('');
  const lg = newLeague({ name: t('Moja liga'), teamName: t('Moj tim'), leagueFormat: fmt, roster: { name: t('Moj tim'), players: q.my.map(id => ({ id, ir: false })), updated: nowISO() } });
  const k = `o${Date.now()}`;
  lg.opps[k] = { name: t('Protivnik'), players: q.opp.map(id => ({ id, ir: false })), updated: nowISO() };
  lg.oppSel = k;
  profile.leagues.push(lg); profile.lastLeagueId = lg.id; saveProfile();
  location.href = `${EMBED?.app || '../app/'}#league-${lg.id}/find-trade&lang=${LANG}`;
}
/** Akcije alata (vraća true ako je obrađeno) */
function tfAction(a, el) {
  const S = state.tf, ctx = tfCtx();
  switch (a) {
    case 'tf-mark': tfSetMark(ctx, el.dataset.side, +el.dataset.id, el.dataset.m); break;
    case 'tf-reset': {
      tfResetMarks(ctx);
      if (Object.keys(tfLocks(ctx.scopeKey)).length) showModal({ title: t('Poništi sve'), body: `<p>${t('Ukloniti i zaključane igrače za celu ligu?')}</p>`, confirm: t('Ukloni'), cancel: t('Zadrži'), onConfirm: () => { tfResetMarks(ctx, true); renderTfAll(); } });
      break;
    }
    case 'tf-strat': S.strat = el.dataset.v; break;
    case 'tf-focus': { const k = el.dataset.k; S.focus = S.focus.includes(k) ? S.focus.filter(x => x !== k) : [...S.focus, k]; break; }
    case 'tf-slider': S.slider = el.dataset.v; break;
    case 'tf-nodrop': tfSetNoDrop(ctx, !tfNoDrop(ctx)); break;
    case 'tf-run': tfRun(); return true;
    case 'tf-stop': tfStop(); break;
    case 'tf-more': S.page++; tfSessSave(ctx); break;
    case 'tf-save': tfSaveTrade(+el.dataset.i); return true;
    case 'tf-rate': tfRate(+el.dataset.i, +el.dataset.r, el); return true;
    case 'tf-open': tfOpen(+el.dataset.i); return true;
    case 'tf-enter-roster': state.leagueTeam = el.dataset.opp; setBack('finder'); goPage('league'); return true;
    case 'tf-add-opp': state.ui.ltEdit = 'new'; setBack('finder'); goPage('league'); return true;
    case 'tf-q-rm': { const q = lsGet(TF_QUICK_KEY) || { my: [], opp: [] }; q[el.dataset.side] = q[el.dataset.side].filter(id => id !== +el.dataset.id); lsSet(TF_QUICK_KEY, q); break; }
    case 'tf-save-league': tfSaveLeague(); return true;
    case 'tf-from-fa': openFinder({ give: +el.dataset.id }); return true;
    default: return false;
  }
  renderTfAll();
  return true;
}
/** Pretraga na javnoj stranici: igrač ide u Tvoj tim ili Protivnik */
function tfPick(key, id) {
  const q = lsGet(TF_QUICK_KEY) || { my: [], opp: [] }, side = key === 'tf-my' ? 'my' : 'opp';
  if (q.my.includes(id) || q.opp.includes(id)) return;
  q[side].push(id); lsSet(TF_QUICK_KEY, q);
  searchUI.set(key, { query: '', sel: 0 });
  renderTfAll();
  document.querySelector(`[data-search="${key}"]`)?.focus();
}
const tfTaken = () => { const q = lsGet(TF_QUICK_KEY) || { my: [], opp: [] }; return new Set([...q.my, ...q.opp]); };

/* =====================================================================
   Mete za trejd (#league-{id}/trade-targets i javna stranica /trade-targets/ bez lige).
   Igrači sa tuđih rostera koji najviše popravljaju moj tim, a realno ih je dobiti (ostatak sezone).
   Čita samo zajednički model lige (rosteri, plasman ako postoji), bez provere platforme. Ponderi i jačine: TT (čiste funkcije).
   Brzina: grubo rangiranje svih kandidata (ponderi 1 i 2), pa za najboljih TT.REFINE ostali ponderi i mogući trejd (Web Worker).
   ===================================================================== */
const TT_WISH_KEY = 'fbaTrade.ttWish.v1'; // { [liga|quick]: [id] } lista želja (lični izbor)
const TT_UI = {};                          // po ligi: { need, cats, page, refine }
state.tt = { M: null, sig: null, trades: new Map(), tms: new Map(), tkey: null, pending: null, worker: null, msModel: 0, msTrades: 0, logsAsked: new Set(), add: null };
const ttScope = lg => lg?.id || 'quick';
const ttUi = lg => TT_UI[ttScope(lg)] || (TT_UI[ttScope(lg)] = { need: 'auto', cats: [], page: 0, refine: TT.REFINE });
const ttMyRoster = lg => (lg ? lg.roster?.players || [] : (lsGet(TF_QUICK_KEY)?.my || []).map(id => ({ id, ir: false })));
const ttWishAll = () => lsGet(TT_WISH_KEY) || {};
const ttCap = s => (s ? s[0].toUpperCase() + s.slice(1) : s);
/** Plasman mog tima u ligi: { rank, n } ili null (uvezena liga: tabela; ručna: mesto iz podešavanja) */
function ttMyRank(lg) {
  if (!lg) return null;
  const R = isSynced(lg) ? tfRanks(lg) : null;
  if (R && lg.import?.myTid != null && R.get(lg.import.myTid)) return { rank: R.get(lg.import.myTid), n: R.size };
  return lg.standings?.rank && lg.teams ? { rank: +lg.standings.rank, n: +lg.teams } : null;
}

/** Model stranice (keš dok se ulaz ne promeni) */
function ttGet(lg = currentLeague()) {
  const B = tfBase(lg), ui = ttUi(lg);
  const sig = JSON.stringify([ttScope(lg), B.key, ui.need, ui.cats, ui.refine, [...(state.punt || [])], ttMyRoster(lg).map(x => [x.id, !!x.ir]),
    lg ? Object.entries(lg.opps || {}).map(([k, o]) => [k, (o.players || []).map(x => [x.id, !!x.ir])]) : 0]);
  const full = sig + state.gameLogs.size; // poslednje utakmice menjaju samo ocenu (stabilnost minuta), ne i moguće trejdove
  if (state.tt.full === full && state.tt.M) return state.tt.M;
  const t0 = performance.now();
  const M = ttModel(lg, B, ui);
  state.tt.msModel = performance.now() - t0;
  state.tt.M = M; state.tt.sig = sig; state.tt.full = full;
  return M;
}
function ttModel(lg, B, ui) {
  const pts = B.pts, LV = B.LV, P = id => state.byId.get(id);
  const oppsE = lg ? Object.entries(lg.opps || {}).filter(([, o]) => o.players?.length) : [];
  const mode = ttMode(!!lg, oppsE.length), solo = mode === 'solo';
  const allCats = pts ? [] : LV.proj.cats.map(c => ({ ...c, ratio: !!CATS.find(k => k.key === c.key)?.ratio }));
  const cats = allCats.filter(c => !isPunt({ key: c.key }));
  const manual = !pts && ui.need === 'manual' && ui.cats.length > 0;
  const outNow = p => playerStatus(p, lg).g === 'OUT';
  const vb = p => blendValue({ proj: LV.proj.values.get(p.id), season: LV.season.values.get(p.id), l15: LV.l15.values.get(p.id), l7: LV.l7.values.get(p.id) }, blendWeights(B.gpOf(p)));
  // timovi: aktivni bez IR-a; moji OUT igrači sada ne donose ništa (zato se vide i kategorije koje gubim zbog njih), kao u FA alatu
  const teamLines = r => (r?.players || []).filter(x => !x.ir).map(x => P(x.id)).filter(p => p && !outNow(p)).map(p => B.lineOf(p));
  const myR = { players: ttMyRoster(lg) }, myIds = new Set(myR.players.map(x => x.id));
  const tot = sumLines(teamLines(myR));
  const teams = oppsE.map(([k, o]) => ({ k, o, tot: sumLines(teamLines(o)) }));
  const sd = pts ? {} : leagueSpread([tot, ...teams.map(x => x.tot)], cats);
  const weights = manual ? Object.fromEntries(cats.map(c => [c.key, ui.cats.includes(c.key) ? 1 : FA.MANUAL_OFF])) : null;
  const ctx = { pts, cats, tot, opps: teams.map(x => x.tot), sd, weights };
  ctx.base = pts || solo ? { total: 0, by: {} } : expWins(tot, ctx.opps, cats, sd, weights);
  // slabe kategorije: liga = dobijam manje od pola mečeva; samo moj tim = donja trećina zbira z mog tima
  const myAct = myR.players.filter(x => !x.ir).map(x => P(x.id)).filter(Boolean);
  let weak;
  if (pts) weak = new Set();
  else if (!solo) weak = new Set(cats.filter(c => (ctx.base.by[c.key] ?? 1) < 0.5).map(c => c.key));
  else {
    const z = Object.fromEntries(cats.map(c => [c.key, myAct.filter(p => !outNow(p)).reduce((a, p) => a + (vb(p)?.by?.[c.key] || 0), 0)]));
    const ord = [...cats].sort((a, b) => z[a.key] - z[b.key]);
    weak = new Set(ord.slice(0, Math.max(1, Math.round(cats.length * TT.TOP_THIRD))).map(c => c.key));
  }
  const need = manual ? new Set(ui.cats) : weak;
  const soloW = Object.fromEntries(cats.map(c => [c.key, manual ? (ui.cats.includes(c.key) ? 1 : FA.MANUAL_OFF) : weak.has(c.key) ? TT.SOLO_WEAK_W : 1]));
  // kandidat ulazi umesto mog najslabijeg aktivnog igrača (po stvarnoj vrednosti)
  const weakest = [...myAct].sort((a, b) => (B.real(a) ?? -1e9) - (B.real(b) ?? -1e9))[0] || null;
  const wLine = weakest && !outNow(weakest) ? B.lineOf(weakest) : null, wBy = weakest ? vb(weakest)?.by : null;
  const gone = id => !!B.injOfP(P(id))?.gone;
  const cands = solo
    ? state.players.filter(p => !myIds.has(p.id) && B.genRaw.has(p.id) && ((statOf(p, 'season')?.GP || 0) > 0 || statOf(p, 'proj')) && !gone(p.id)).map(p => ({ id: p.id, owner: null, ir: false }))
    : ttCandidates(oppsE.map(([k, o]) => ({ owner: k, players: o.players })), gone);
  const gainOf = p => {
    const l = B.lineOf(p); if (!l) return null;
    if (pts) return { gain: (l.FPTS || 0) - (wLine?.FPTS || 0), by: {} };
    if (solo) { const f = B.fracOf(p), by = Object.fromEntries(Object.entries(vb(p)?.by || {}).map(([k, v]) => [k, v * f])); const d = {}; for (const c of cats) d[c.key] = (by[c.key] || 0) - (wBy?.[c.key] || 0); return { gain: ttSoloGain(by, wBy, soloW), by: d }; }
    return pairGain(ctx, l, wLine);
  };
  // cena na tržištu: rang u ligi (svi rosteri) i kod vlasnika
  const mk = p => B.market(p) ?? -1e9;
  const rostered = solo ? [] : [...myR.players, ...oppsE.flatMap(([, o]) => o.players)].map(x => P(x.id)).filter(Boolean);
  const lRank = new Map([...rostered].sort((a, b) => mk(b) - mk(a)).map((p, i) => [p.id, i + 1]));
  const oRank = new Map();
  for (const [k, o] of oppsE) [...o.players].map(x => P(x.id)).filter(Boolean).sort((a, b) => mk(b) - mk(a)).forEach((p, i) => oRank.set(p.id, i + 1));
  // grubo rangiranje (ponderi 1 i 2)
  let list = cands.map(c => { const p = P(c.id); if (!p) return null; const g = gainOf(p); return g && g.gain > 0 ? { ...c, p, gain: g.gain, by: g.by } : null; }).filter(Boolean);
  // korist 0..1: deli se sa korišću igrača na granici najboljih (TT.CAT_FULL), da jedna zvezda ne spljošti sve ostale
  const gs = list.map(x => x.gain).sort((a, b) => b - a), maxG = Math.max(1e-9, gs[Math.min(gs.length - 1, Math.floor(gs.length * TT.CAT_FULL))] || 0);
  for (const x of list) { x.cat = ttClamp(x.gain / maxG); x.unreach = solo ? null : ttUnreach(oRank.get(x.id), lRank.get(x.id)); x.coarse = ttCoarse(x.cat, x.unreach || 0); }
  list.sort((a, b) => b.coarse - a.coarse);
  const coarseN = list.length;
  list = list.slice(0, ui.refine);
  // ostali ponderi za izabrane
  const n = teams.length + 1, top = Math.max(1, Math.ceil(n * TT.TOP_THIRD));
  const catRank = (tm, c) => 1 + [tot, ...teams.map(x => x.tot)].filter(o => o !== tm && totCat(o, c) != null && totCat(tm, c) != null && (c.low ? totCat(o, c) < totCat(tm, c) - EPS : totCat(o, c) > totCat(tm, c) + EPS)).length;
  const myRk = Object.fromEntries(cats.map(c => [c.key, catRank(tot, c)]));
  const irS = lg ? tfIrSlots(lg) : { n: 0 }, synced = !!(lg && isSynced(lg));
  const ranks = synced ? tfRanks(lg) : null, mr = ttMyRank(lg);
  const myHigh = !!(mr && mr.rank <= mr.n * TT.INJ_HIGH), myIrFree = lg ? tfIrFree(lg, lg.roster, true) : 0;
  const pStart = lg ? tfPlayoffStart(lg) : null;
  const outMates = new Map();
  for (const q of state.players) { if (!q.tid || (statOf(q, 'season')?.MIN || 0) < FA.SIG.MATE_MIN || !outNow(q)) continue; (outMates.get(q.tid) || outMates.set(q.tid, []).get(q.tid)).push(q); }
  // jeftina meta: mesto po stvarnoj vrednosti i po ceni (iste skale nisu, mesta jesu), među igračima na rosterima (bez lige: među kandidatima)
  const pool = solo ? list.map(x => x.p) : rostered, rv = p => B.real(p) ?? -1e9;
  const mRank = new Map([...pool].sort((a, b) => mk(b) - mk(a)).map((p, i) => [p.id, i + 1]));
  const rRank = new Map([...pool].sort((a, b) => rv(b) - rv(a)).map((p, i) => [p.id, i + 1]));
  const poGames = p => { if (!pStart) return null; const g = state.schedule?.[p.tid]; return g ? g.filter(x => x.date >= pStart).length : null; };
  const poMax = Math.max(1, ...list.map(x => poGames(x.p) || 0));
  for (const x of list) {
    const p = x.p, v = vb(p), inj = B.injOfP(p);
    const strong = pts ? [] : cats.filter(c => (v?.by?.[c.key] || 0) >= TT.STRONG_Z).sort((a, b) => (v.by[b.key] || 0) - (v.by[a.key] || 0)).slice(0, 3);
    x.strong = strong.map(c => c.key);
    // 3. spremnost vlasnika (samo sa drugim timovima)
    let willing = null, wd = null;
    if (!solo) {
      const tm = teams.find(y => y.k === x.owner);
      const surplusCats = strong.filter(c => catRank(tm.tot, c) <= top), ownerWeak = cats.filter(c => catRank(tm.tot, c) > n - top);
      const needCats = ownerWeak.filter(c => myRk[c.key] <= top);
      const injN = tm.o.players.filter(y => B.injOfP(P(y.id))).length;
      const oRk = String(x.owner).startsWith('e') ? ranks?.get(+String(x.owner).slice(1)) ?? null : null, nT = ranks?.size || 0;
      wd = { surplus: strong.length ? surplusCats.length / strong.length : 0, need: ownerWeak.length ? needCats.length / ownerWeak.length : 0,
        pressure: synced && injN > irS.n, bottom: !!(oRk && nT && oRk > nT - Math.max(2, Math.floor(nT / 4))),
        surplusCats: surplusCats.map(c => c.label), needCats: needCats.map(c => c.label), injN, irN: irS.n };
      willing = ttWilling(wd);
    }
    x.wd = wd;
    // 4. forma i uloga
    const formV = blendValue({ l15: LV.l15.values.get(p.id), l7: LV.l7.values.get(p.id) }, blendWeights(B.gpOf(p), { l15: 0.6, l7: 0.4 }))?.total;
    const seasonV = LV.season.values.get(p.id)?.total;
    const l7 = statOf(p, 'l7'), season = statOf(p, 'season');
    const minUp = l7 && season && (l7.GP || 0) >= FA.SIG.MIN_GP && l7.MIN != null && season.MIN != null ? l7.MIN - season.MIN : null;
    const pos = new Set(posList(p)), mate = (outMates.get(p.tid) || []).find(q => q.id !== p.id && posList(q).some(y => pos.has(y)));
    x.fd = { formDiff: formV != null && seasonV != null ? formV - seasonV : null, minUp, mateOut: !!mate, pts, mate: mate?.name, minFrom: season?.MIN, minTo: l7?.MIN };
    const form = ttForm(x.fd);
    // 5. jeftina meta: stvarna vrednost veća od cene
    const cheap = mRank.has(p.id) && rRank.has(p.id) ? ttUnit(mRank.get(p.id) - rRank.get(p.id), 0, TT.CHEAP_RANKS) : null;
    // 6. povređeni kao investicija
    const good = (B.genRaw.get(p.id) ?? -99) >= B.dropBar;
    const injP = solo ? null : ttInjInvest({ out: !!inj, gone: !!inj?.gone, irOk: lg ? tfIrOk(lg, p) : false, good, myHigh, myIrFree });
    // 7. utakmice u plejofu (liga daje datume)
    const pg = solo ? null : poGames(p);
    const playoff = pg == null ? null : ttClamp(pg / poMax) * (myHigh ? 1 : TT.PLAYOFF_LOW);
    // 8. stabilnost minuta (poslednje utakmice, kad su učitane)
    const logs = state.gameLogs.get(p.id);
    const stable = logs ? ttStable(logs.slice(-10).map(g => g.line?.MIN)) : null;
    // 9. izdržljivost
    const d = durability(p), fragile = d ? ttFragile(d.gp, d.n) : null;
    // 10. blizina u kategoriji (liga): do sledećeg tima iznad mene malo
    let close = null, closeCats = [];
    if (!solo && !pts && strong.length) {
      closeCats = strong.filter(c => { const me = totCat(tot, c); if (me == null) return false; const better = [...teams.map(y => totCat(y.tot, c))].filter(o => o != null && (c.low ? o < me - EPS : o > me + EPS)); if (!better.length) return false; const next = c.low ? Math.max(...better) : Math.min(...better); return Math.abs(next - me) < TT.CLOSE_SD * (sd[c.key] || 1); });
      close = closeCats.length / strong.length;
    }
    x.closeCats = closeCats.map(c => c.label); x.pg = pg;
    x.parts = { cat: x.cat, unreach: x.unreach, willing, form, cheap, inj: injP, playoff, stable, fragile, close };
    const sc = ttScore(x.parts); x.score = sc.s; x.by2 = sc.by;
  }
  list.sort((a, b) => b.score - a.score);
  // poslednje utakmice za stabilnost minuta: učitaj jednom za izabrane, pa se stranica osveži
  const ask = list.map(x => x.id).filter(id => !state.gameLogs.has(id) && !state.tt.logsAsked.has(id));
  if (ask.length) { ask.forEach(id => state.tt.logsAsked.add(id)); ensureLogs(ask).then(() => { if (ttVisible()) ttRender(); }); }
  return { lg, B, mode, solo, pts, ui, cats, allCats, weights, ctx, weak, need, list, byId: new Map(list.map(x => [x.id, x])), coarseN, weakest, myHigh, myIrFree, teams, oppsE };
}
const ttVisible = () => !!EMBED?.targets || state.page === 'targets';
const ttRender = () => { if (EMBED?.targets) renderTargetsEmbed(); else if (state.page === 'targets') render(); };
if (typeof matchMedia === 'function') matchMedia('(max-width:640px)').addEventListener?.('change', () => { if (ttVisible()) ttRender(); }); // 9 ili 8 kartica

/* ---------- Mogući trejd: računa se tek u izveštaju, za jednog igrača (isti motor kao Pronađi trejd, Web Worker) ---------- */
const ttTradeCtx = (lg, owner) => { const o = lg.opps[owner]; return { lg, scopeKey: lg.id, oppKey: owner, my: lg.roster?.players || [], opp: o?.players || [], oppName: o?.name || '' }; };
/** Ulazi za motor: po vlasniku jednom model, pa igrač obeležen U trejd, do 2 za 2, meta najvredniji igrač kog dobijam (cena na tržištu) */
function ttInputs(M, ids) {
  const S = state.tf, keep = [S.strat, S.slider, S.focus];
  S.strat = 'best'; S.slider = 'fair'; S.focus = [];
  try {
    const out = [];
    for (const id of ids) {
      const x = M.byId.get(id); if (!x?.owner) continue;
      let m = state.tt.tms.get(x.owner);
      if (!m) { const TM = tfModel(ttTradeCtx(M.lg, x.owner)); m = { TM, inp: tfInput(TM) }; state.tt.tms.set(x.owner, m); }
      const mk = Object.fromEntries(m.inp.theirs.map(y => [y.id, M.B.market(state.byId.get(y.id)) ?? null]));
      out.push({ id, inp: ttTradeInput(m.inp, id, mk) });
    }
    return out;
  } finally { [S.strat, S.slider, S.focus] = keep; }
}
function ttWorker() {
  const src = `const E=(${tfEngine.toString()})();onmessage=e=>{const t0=Date.now(),r=E.search(e.data);postMessage({x:r.list[0]||null,ms:Date.now()-t0});};`;
  return new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
}
/** Rezultat važi dok se ne promeni model, "Ne otpuštam nikoga" ili oznake u ligi (Lock) */
const ttTradeKey = M => JSON.stringify([state.tt.sig, tfNoDrop({ scopeKey: M.lg.id }), tfMarksAll()[M.lg.id] || {}]);
/** Mogući trejd za igrača: { done, x } (x = predlog ili null); ako nije izračunat, pokreće računanje i vraća done: false */
function ttTradeFor(M, id) {
  const T = state.tt, k = ttTradeKey(M);
  if (T.tkey !== k) { if (T.worker) { T.worker.terminate(); T.worker = null; } T.tkey = k; T.trades = new Map(); T.tms = new Map(); T.pending = null; }
  if (T.trades.has(id)) return { done: true, x: T.trades.get(id) };
  if (T.pending !== id) ttStartTrade(M, id, k);
  return { done: false };
}
function ttStartTrade(M, id, k) {
  const T = state.tt;
  if (T.worker) { T.worker.terminate(); T.worker = null; }
  const [q] = ttInputs(M, [id]);
  if (!q) { T.trades.set(id, null); return; }
  T.pending = id;
  const t0 = performance.now();
  const fin = x => {
    T.worker = null; if (T.pending === id) T.pending = null;
    if (T.tkey !== k) return;
    T.trades.set(id, x); T.msTrades = performance.now() - t0;
    const R = T.rep; if (R?.id === id && document.getElementById('tt-rep-news')) ttReport(id, R.per); // otvoren izveštaj: mogući trejd stiže
  };
  const local = () => fin(tfEngineLocal().search(q.inp).list[0] || null);
  try {
    const w = ttWorker(); T.worker = w;
    w.onmessage = e => { w.terminate(); if (T.worker === w || T.pending === id) fin(e.data.x); };
    w.onerror = () => { w.terminate(); setTimeout(local, 0); };
    w.postMessage(q.inp);
  } catch { setTimeout(local, 30); }
}

/* ---------- Prikaz ---------- */
/** Razlozi (najjači ponderi), jednom rečenicom po ponderu */
function ttReasonOf(M, x, k) {
  const nm = n => esc(n);
  switch (k) {
    case 'cat': {
      if (M.pts) return t('{d} FPts po utakmici umesto {n}', { d: `+${x.gain.toFixed(1)}`, n: nm(M.weakest?.name || '–') });
      const wt = ([c, v]) => v * (M.weights?.[c] ?? 1); // ručni izbor: prvo izabrane kategorije
      const top = Object.entries(x.by || {}).filter(([, v]) => v > 0.02).sort((a, b) => wt(b) - wt(a)).slice(0, 2).map(([c]) => faCatLabel(c));
      return top.length ? t('Najviše ti popravlja {c}', { c: top.join(', ') }) : '';
    }
    case 'willing': {
      const w = x.wd; if (!w) return '';
      if (w.surplusCats.length && w.surplus * TT.WILL.surplus >= w.need * TT.WILL.need) return t('Vlasnik ima višak u {c}', { c: w.surplusCats.join(', ') });
      if (w.needCats.length) return t('Vlasniku treba {c}, gde si ti jak', { c: w.needCats.join(', ') });
      if (w.pressure) return t('Vlasnik ima {n} {k}, a {m} IR {s}', { n: w.injN, k: plural(w.injN, ['povređenog igrača', 'povređena igrača', 'povređenih igrača'], ['injured player', 'injured players']), m: w.irN, s: plural(w.irN, ['mesto', 'mesta', 'mesta'], ['spot', 'spots']) });
      if (w.bottom) return t('Vlasnik je pri dnu tabele');
      return '';
    }
    case 'form': {
      const f = x.fd;
      if (f.minUp != null && f.minUp >= TT.MIN_UP) return t('Minuti {a} → {b} u poslednjih 7 dana', { a: Math.round(f.minFrom), b: Math.round(f.minTo) });
      if (f.mateOut) return t('{n} je OUT', { n: nm(f.mate) });
      return t('U formi: poslednjih 15 i 7 dana iznad sezone');
    }
    case 'cheap': return t('Stvarna vrednost veća od cene na tržištu');
    case 'inj': return t('{r}, a ti imaš slobodno IR mesto', { r: esc(ttCap(injRetText(x.p, M.lg))) });
    case 'playoff': return x.pg ? t('{n} {u} u nedeljama plejofa', { n: x.pg, u: plural(x.pg, ['utakmica', 'utakmice', 'utakmica'], ['game', 'games']) }) : '';
    case 'stable': return t('Stabilni minuti');
    case 'close': return x.closeCats.length ? t('Blizu si sledećeg tima u {c}', { c: x.closeCats.join(', ') }) : '';
    default: return '';
  }
}
const ttReasons = (M, x, max = 2) => (x.by2 || []).filter(b => b.c > 0.001).map(b => ttReasonOf(M, x, b.k)).filter(Boolean).slice(0, max);
/** Statistika u dva reda (nazivi kolona, pa brojevi), kao red zbira u tabelama; zeleno samo kategorija koja mi treba, a igrač je u njoj jak */
function ttStatsHTML(M, x) {
  const line = playerLine(x.p);
  const good = c => (M.pts ? c.fpts && x.gain > 0 : M.need.has(c.key) && x.strong.includes(c.key));
  const cols = [{ label: 'MIN', v: line?.MIN != null ? fmt1(line.MIN) : '-', hi: false }, ...CATS.map(c => ({ label: c.label, v: line ? fmtCat(c, catValue(line, c)) : '-', hi: !isPunt(c) && good(c), punt: isPunt(c) }))];
  const tip = M.pts ? t('Zeleno: FPts, jer igrač diže FPts tvog tima.') : t('Zeleno: kategorija koja ti treba, a igrač je u njoj jak.');
  return `<div class="tt-stat-wrap"><table class="tt-stat" title="${esc(tip)}"><thead><tr>${cols.map(c => `<th class="${c.punt ? 'punt' : ''}">${esc(c.label)}</th>`).join('')}</tr></thead>
    <tbody><tr>${cols.map(c => `<td class="${c.hi ? 'hi' : ''}${c.punt ? ' punt' : ''}">${c.v}</td>`).join('')}</tr></tbody></table></div>`;
}
/** Promena mojih kategorija ako uđe umesto mog najslabijeg (izabrani period u zaglavlju); procena bez protivnika */
function ttSoloChange(M, x) {
  const act = ttMyRoster(M.lg).filter(y => !y.ir).map(y => y.id), out = M.weakest?.id;
  const Bt = sumPlayers(act), A = sumPlayers([...act.filter(id => id !== out), x.id]);
  if (M.pts) { const d = (A.vals.FPTS ?? 0) - (Bt.vals.FPTS ?? 0); return `<div class="fa-score ${d >= 0 ? 'up' : 'down'}"><b>${t('{d} FPts po utakmici', { d: `${d >= 0 ? '+' : '−'}${Math.abs(d).toFixed(1)}` })}</b></div>`; }
  const cats = CATS.filter(c => !isPunt(c) && !c.fpts);
  let w = 0, l = 0;
  const chips = cats.map(c => { const b = Bt.vals[c.key], a = A.vals[c.key]; if (a == null || b == null) return ''; const d = a - b, zero = c.type === 'pct' ? Math.abs(d) < teamTieOf(c) : fmtDelta(c, d).zero, r = zero ? 0 : (c.lowerIsBetter ? d < 0 : d > 0) ? 1 : -1; if (r > 0) w++; else if (r < 0) l++; return `<span class="fa-chip ${r > 0 ? 'up' : r < 0 ? 'down' : 'tie'}">${r > 0 ? '✓' : r < 0 ? '✗' : '='} ${esc(c.label)}</span>`; }).join('');
  return `<div class="fa-score ${w >= l ? 'up' : 'down'}"><b>${faWL(w, l)}</b></div><div class="fa-chips">${chips}</div>`;
}
function ttHeartHTML(M, id) {
  const on = ttWishHas(ttWishAll(), ttScope(M.lg), id);
  return `<button type="button" class="tt-heart ${on ? 'on' : ''}" data-action="tt-wish" data-id="${id}" aria-pressed="${on}" title="${esc(on ? t('Ukloni sa liste želja') : t('Dodaj na listu želja'))}" aria-label="${esc(on ? t('Ukloni sa liste želja') : t('Dodaj na listu želja'))}">${on ? '♥' : '♡'}</button>`;
}
function ttBtnsHTML(M, id) {
  return `<button type="button" class="btn sec tt-big" data-action="tt-suggest" data-id="${id}">${t('Predloži trejd sa ovim igračem')}</button><button type="button" class="btn tt-big" data-action="tt-trade-tab" data-id="${id}">${t('Trejduj')}</button>`;
}
function ttCardHTML(M, x, i) {
  const p = x.p, st = playerStatus(p, M.lg), ret = injRetText(p, M.lg);
  const owner = x.owner ? M.lg.opps[x.owner]?.name : null;
  const why = ttReasons(M, x);
  const rate = M.solo ? '' : rateBtnsHTML(tfRateKey('targets', M.lg?.id, [], [p.id]), 'tt-rate', i);
  return `<article class="tt-card">
    <div class="tt-corner">${rate}${ttHeartHTML(M, p.id)}</div>
    <div class="tt-head"><span class="pm-open" data-pm="${p.id}">${avatarHTML(p)}</span>
      <div class="tt-id"><button type="button" class="nm" data-action="tt-report" data-id="${p.id}">${esc(p.name)}</button>
        <span class="meta">${p.team} · ${posTxt(p)} ${injHTML(p)}</span>
        ${st.g !== 'OK' ? `<span class="tf-inj">${esc(stLabel(st))}${ret ? `, ${esc(ret)}` : ''}</span>` : ''}
        ${owner ? `<span class="tt-owner">${t('Vlasnik')}: <b>${esc(owner)}</b></span>` : ''}</div></div>
    ${ttStatsHTML(M, x)}
    ${M.solo ? `<p class="pnote tt-solo-note">${t('Procena bez protivnika: ulazi umesto {n}', { n: esc(M.weakest?.name || '–') })}</p>${ttSoloChange(M, x)}` : ''}
    ${why.length ? `<div class="fa-why">${why.map(w => `<span>${w}</span>`).join('')}</div>` : ''}
    <div class="tt-acts">${ttBtnsHTML(M, p.id)}</div></article>`;
}
/** Šta mom timu treba: Proceni sam ili ručni izbor kategorija (punt se ne računa) */
function ttNeedHTML(M) {
  if (M.pts) return '';
  const manual = M.ui.need === 'manual';
  const chips = M.allCats.map(c => {
    const punt = isPunt({ key: c.key });
    if (manual) return `<button type="button" class="fa-need ${punt ? 'punt' : M.ui.cats.includes(c.key) ? 'on' : ''}" data-action="tt-cat" data-k="${c.key}" ${punt ? 'disabled' : ''} aria-pressed="${M.ui.cats.includes(c.key)}">${esc(c.label)}</button>`;
    return `<span class="fa-need ${punt ? 'punt' : M.weak.has(c.key) ? 'on' : ''}">${esc(c.label)}</span>`;
  }).join('');
  const tip = manual ? t('Izaberi kategorije koje ti trebaju. Punt kategorije se ne računaju.')
    : M.solo ? t('Istaknute su kategorije u kojima je tvoj roster najslabiji. Punt kategorije se ne računaju.') : t('Istaknute su kategorije u kojima tvoj tim, sa trenutnim rosterom, gubi više od pola mečeva protiv ostalih timova lige. Punt kategorije se ne računaju.');
  return `<div class="fa-needbar tt-needbar"><div class="seg small" role="group" aria-label="${esc(t('Šta tvom timu treba'))}">
      <button type="button" data-action="tt-need" data-v="auto" aria-pressed="${!manual}">${t('Proceni sam')}</button><button type="button" data-action="tt-need" data-v="manual" aria-pressed="${manual}">${t('Biram kategorije')}</button></div>
    <div class="fa-needs">${chips}</div><span class="i" data-tip="${esc(tip)}">ⓘ</span></div>`;
}
/** "Ne dam": moji zaključani igrači za celu ligu (isti Lock kao u Pronađi trejd) */
function ttLockHTML(lg) {
  if (!lg) return '';
  const lk = tfLocks(lg.id), mine = new Set((lg.roster?.players || []).map(x => x.id));
  const ids = Object.keys(lk).map(Number).filter(id => mine.has(id));
  const chips = ids.map(id => { const p = state.byId.get(id); return p ? `<button type="button" class="chip tt-lock-chip" data-action="tt-unlock" data-id="${id}" title="${esc(t('Klik uklanja'))}">🔒 ${esc(p.name)} <span aria-hidden="true">✕</span></button>` : ''; }).join('');
  return `<div class="tt-lockbar"><span class="tt-lock-l">${t('Ne dam:')}</span><span class="i" data-tip="${esc(t('Ovi igrači ne ulaze ni u jedan trejd sa bilo kojim timom u ligi. Isti Lock kao u Pronađi trejd.'))}">ⓘ</span>
    ${chips || `<span class="hint">${t('nijedan igrač')}</span>`}<span class="tt-lock-add">${searchBoxHTML('tt-lock', t('Dodaj svog igrača…'))}</span></div>`;
}
/** Pretraga "Ne dam": samo moji igrači koji nisu zaključani */
function ttLockSearch(query) {
  const lg = currentLeague(); if (!lg) return [];
  const lk = tfLocks(lg.id), avail = new Set((lg.roster?.players || []).map(x => x.id).filter(id => !lk[id]));
  return searchResults(query, new Set(state.players.map(p => p.id).filter(id => !avail.has(id))), avail);
}
/** Stranica kartica: redom po oceni, bez prethodnih stranica, najviše 2 igrača istog vlasnika */
const TT_PHONE_MQ = '(max-width:640px)';
/** Broj kartica po stranici: 9 na računaru, 8 na telefonu */
const ttPer = () => (typeof matchMedia === 'function' && matchMedia(TT_PHONE_MQ).matches ? TT.PER_PAGE_PHONE : TT.PER_PAGE);
function ttPageItems(M, per = ttPer()) {
  const shown = new Set(); let items = [];
  for (let k = 0; k <= M.ui.page; k++) { items = ttPage(M.list, shown, per); items.forEach(x => shown.add(x.id)); }
  return { items, per, off: shown.size - items.length, more: ttPage(M.list, shown, per).length > 0 || M.list.length < M.coarseN };
}
/** Vlasnik igrača sa liste želja: ključ protivnika, 'mine', 'fa' ili null (nije ni u jednom unetom timu) */
const ttWishOwner = (M, id) => ttOwnerOf(id, new Set(ttMyRoster(M.lg).map(x => x.id)), M.lg?.opps, !!(M.lg && isSynced(M.lg)));
const ttWishOwnerName = (M, o) => (o === 'mine' ? t('Tvoj tim') : o === 'fa' ? t('Slobodan') : o ? M.lg.opps[o]?.name || '' : '');
/** Lista želja: tabela kao Moj tim (kolone formata lige, period iz zaglavlja), Vlasnik, dugmad i srce; sortiranje kao ostale tabele */
function ttWishHTML(M) {
  const ids = (ttWishAll()[ttScope(M.lg)] || []).filter(id => state.byId.has(id));
  if (!ids.length) return `<section class="pcard tt-wish"><h3>${t('Lista želja')}</h3><p class="pnote">${t('Klikni ♡ na kartici da igrača sačuvaš ovde.')}</p></section>`;
  const own = new Map(ids.map(id => [id, ttWishOwner(M, id)]));
  const s = sortOf('ttw');
  const order = s?.col === 'OWNER'
    ? ttWishOrder(ids, id => ttWishOwnerName(M, own.get(id)), s.dir)
    : sortIds('ttw', ids);
  const head = rosterHeaderRow('ttw').replace('</tr>', `<th class="sortth tt-wown-h${s?.col === 'OWNER' ? ' sorted' : ''}" data-sort="OWNER" data-skind="ttw" title="${esc(t('Sortiraj po {c}', { c: t('Vlasnik') }))}">${t('Vlasnik')}${s?.col === 'OWNER' ? `<span class="sarr">${s.dir === 'asc' ? '▲' : '▼'}</span>` : ''}</th><th class="tt-wact-h"></th></tr>`);
  const ic = (a, id, label, sym) => `<button type="button" class="btn small sec tt-wbtn" data-action="${a}" data-id="${id}" title="${esc(label)}" aria-label="${esc(label)}"><span class="tt-wic" aria-hidden="true">${sym}</span><span class="tt-wtx">${esc(label)}</span></button>`;
  const rows = order.map(id => {
    const p = state.byId.get(id), o = own.get(id);
    const ownTxt = o === 'mine' ? `<span class="slot-tag tag-mine">${t('Tvoj tim')}</span>`
      : o === 'fa' ? `<span class="slot-tag tag-fa">${t('Slobodan')}</span> <a class="linkbtn" href="${pageHash('fa')}" data-goto="fa">${t('Pojačanja sa FA')}</a>`
        : o ? esc(M.lg.opps[o]?.name || '') : M.lg ? `<span class="hint">${t('Nije ni u jednom unetom timu')}</span>` : '';
    const btns = o === 'mine' || o === 'fa' ? '' : `${ic('tt-suggest', id, t('Predloži trejd'), '⇄')}${ic('tt-trade-tab', id, t('Trejduj'), '＋')}`;
    const row = playerRowHTML(p, { punt: true }).replace(`class="nm pm-open" data-pm="${id}"`, `class="nm" data-action="tt-report" data-id="${id}"`);
    return row.replace(/<\/tr>\s*$/, `<td class="tt-wown">${ownTxt}</td><td class="tt-wact"><span class="tt-wbtns">${btns}${ttHeartHTML(M, id)}</span></td></tr>`);
  }).join('');
  return `<section class="pcard tt-wish"><h3>${t('Lista želja')} <span class="hint">${ids.length}</span></h3>
    <div class="tscroll tt-wscroll"><table class="rtable tt-wtable"><thead>${head}</thead><tbody>${rows}</tbody></table></div></section>`;
}
/** Telo alata (liga i javna stranica). Mogući trejd se ne računa ovde, nego tek u izveštaju. */
function ttBodyHTML(lg) {
  const M = ttGet(lg);
  const { items, more, per, off } = ttPageItems(M);
  const lead = M.solo
    ? t('Bez drugih timova: kandidati su svi NBA igrači koji nisu na tvom rosteru. Kartica pokazuje šta igrač donosi tvom timu, ako uđe umesto tvog najslabijeg igrača.')
    : M.pts ? t('Igrači sa drugih timova u ligi koji najviše dižu FPts tvog tima, a realno ih je dobiti. Klikni na ime za izveštaj i mogući fer trejd.')
      : t('Igrači sa drugih timova u ligi koji najviše popravljaju kategorije koje ti trebaju, a realno ih je dobiti. Klikni na ime za izveštaj i mogući fer trejd.');
  const list = items.length
    ? `<div class="tt-cards">${items.map((x, k) => ttCardHTML(M, x, off + k)).join('')}</div>
      <div class="tf-more">${more ? `<button type="button" class="btn sec" data-action="tt-more">${t('Generiši novih {n}', { n: per })}</button>` : `<span class="hint">${t('To su sve mete za ovaj izbor.')}</span>`}</div>`
    : `<div class="pcard fa-none"><b>${t('Trenutno nema meta koje bi ti pomogle')}</b><p class="pnote">${t('Nijedan igrač ne popravlja tvoj tim u odnosu na sadašnje stanje.')}</p></div>`;
  return `<p class="pnote fa-lead">${lead}</p>${ttLockHTML(lg)}${ttNeedHTML(M)}<h3 class="fa-h">${t('Mete')}</h3>${list}${ttWishHTML(M)}`;
}
function renderTargetsPage() {
  const lg = currentLeague();
  const title = `<h2 class="page-t">${t('Mete za trejd')}${lg.teamName ? ` <span class="hint">${esc(lg.teamName)}</span>` : ''}</h2>`;
  if (!state.players.length) return `${title}<p class="pnote">${t('Učitavam igrače…')}</p>`;
  if (!lg.roster?.players.length) return `${title}<p class="pnote">${t('Tvoj tim u ovoj ligi nema igrača. Izaberi svoj tim u podešavanjima lige.')}</p>`;
  return title + ttBodyHTML(lg);
}
/** Javna stranica /trade-targets/: lige gore, pa moj tim (pretraga) i alat bez lige */
function renderTargetsEmbed() {
  const el = document.getElementById('tt-app'); if (!el) return;
  syncCats();
  const leagues = profile?.leagues || [];
  const lgBar = document.getElementById('tt-leagues');
  if (lgBar) {
    lgBar.hidden = !leagues.length;
    lgBar.innerHTML = leagues.length ? `<h2 class="tf-sec-h">${t('Tvoje lige')}</h2><div class="tf-lgrid">${leagues.map(l => `<a class="lcard tf-lcard" href="${esc(EMBED.app)}#league-${l.id}/trade-targets&lang=${LANG}">
      <span class="lc-top"><span class="lc-name">${esc(lgName(l))}</span><span class="pbadge">${esc(isSynced(l) ? platformLabel(l.platform) : t('Ručna'))}</span></span>
      ${l.teamName ? `<span class="lc-team">${esc(l.teamName)}</span>` : ''}<span class="lc-fmt">${esc(formatShort(leagueFormatOf(l)))}</span></a>`).join('')}</div>` : '';
  }
  const mh = document.getElementById('tt-manual-h');
  if (mh) mh.textContent = t('Ili unesi svoj tim');
  const my = ttMyRoster(null);
  const roster = `<section class="pcard tt-my"><h3>${t('Tvoj tim')} <span class="hint">${my.length}</span></h3>
    ${searchBoxHTML('tt-my', t('Dodaj igrača…'))}
    ${my.length ? `<div class="chips tt-mychips">${my.map(x => { const p = state.byId.get(x.id); return p ? `<span class="chip">${esc(p.name)}<button type="button" data-action="tt-q-rm" data-id="${x.id}" aria-label="${esc(t('Ukloni'))}">✕</button></span>` : ''; }).join('')}</div>` : `<p class="pnote">${t('Dodaj igrače sa svog rostera da vidiš mete.')}</p>`}</section>`;
  const body = state.players.length ? (my.length ? ttBodyHTML(null) : '') : `<p class="pnote">${state.error ? esc(state.error) : t('Učitavam igrače…')}</p>`;
  const save = my.length ? `<div class="tf-save"><button type="button" class="btn sec" data-action="tt-save-league">${t('Sačuvaj kao ligu')}</button></div>` : '';
  el.innerHTML = roster + body + save;
  const fb = document.getElementById('fmtbar'); if (fb) fb.innerHTML = quickFormatChipHTML();
  renderPeriods();
}
function ttSaveLeague() {
  const my = (lsGet(TF_QUICK_KEY) || {}).my || [];
  if (!my.length) return;
  if (!profile) profile = newProfile('');
  const lg = newLeague({ name: t('Moja liga'), teamName: t('Moj tim'), leagueFormat: quickFormat(), roster: { name: t('Moj tim'), players: my.map(id => ({ id, ir: false })), updated: nowISO() } });
  profile.leagues.push(lg); profile.lastLeagueId = lg.id; saveProfile();
  location.href = `${EMBED?.app || '../app/'}#league-${lg.id}/trade-targets&lang=${LANG}`;
}

/* ---------- Izveštaj (modal) ---------- */
/** Moj tim pre i posle mogućeg trejda za period (kao analiza trejda: otpuštanja, slobodno mesto, povređeni na IR-u) */
function ttTeamAB(M, x, tr) {
  const act = ttMyRoster(M.lg).filter(y => !y.ir).map(y => y.id);
  const Bt = sumPlayers(act);
  if (!tr) { const A = sumPlayers([...act.filter(id => id !== M.weakest?.id), x.id]); return { B: Bt, A }; }
  const mdNow = tr.md.length - (tr.mdl || 0), mfP = tr.mf - (tr.mft || 0), wr = tr.wr || 0;
  const irSet = new Set([...(M.lg.roster?.players || []), ...(M.lg.opps[x.owner]?.players || [])].filter(y => y.ir).map(y => y.id));
  const now = tr.md.slice(0, mdNow), later = tr.md.slice(mdNow);
  const ids = [...act.filter(id => !tr.g.includes(id) && !tr.md.includes(id)), ...tr.r.filter(id => !irSet.has(id))];
  const repl = M.B.replLine(playerLine, fptsOf);
  const extra = [...Array.from({ length: mfP }, () => repl), ...Array.from({ length: tr.mft || 0 }, () => scaleLine(repl, wr)), ...scaledLines(later, wr)];
  return { B: Bt, A: sumPlayers(ids, [], playerLine, extra.filter(Boolean)), now };
}
function ttReport(id, per = state.period) {
  const lg = currentLeague(), M = ttGet(lg), p = state.byId.get(id);
  if (!p) return;
  const x = M.byId.get(id) || null, R = x?.owner && !M.solo ? ttTradeFor(M, id) : null, tr = R?.done ? R.x : null;
  state.tt.rep = { id, per };
  const view = faRepView(), pts = isPointsFmt();
  const owner = x?.owner ? lg.opps[x.owner]?.name : null;
  const body = withPeriod(per, () => {
    const colCls = c => `${c.fpts ? 'fpts' : ''}${puntCls(c)}`;
    const hdr = `<tr><th>${t('Igrač')}</th><th>MIN</th>${CATS.map(c => `<th class="${colCls(c)}">${c.label}</th>`).join('')}<th>GP</th></tr>`;
    const minW = 240 + (CATS.length + 2) * 64;
    const tbl = (cls, head, rows) => `<div class="tscroll"><table class="rtable fa-rep-t ${cls}" style="min-width:${minW}px"><thead>${head}</thead><tbody>${rows}</tbody></table></div>`;
    const me = tbl('fa-rep-pl', hdr, playerRowHTML(p, { punt: true, pctSub: true }));
    // poslednje utakmice
    const logs = state.gameLogs.get(id);
    const games = logs?.length ? `<div class="tscroll"><table class="rtable tt-games"><thead><tr><th>${t('Datum')}</th><th>MIN</th>${CATS.map(c => `<th class="${colCls(c)}">${c.label}</th>`).join('')}</tr></thead><tbody>${logs.slice(-5).reverse().map(g => `<tr><td>${pmDate(g.date)}</td><td>${g.line?.MIN != null ? Math.round(g.line.MIN) : '-'}</td>${CATS.map(c => gameCell(c, g.line || {})).join('')}</tr>`).join('')}</tbody></table></div>` : `<p class="pnote">${state.gameLogs.has(id) ? t('Nema utakmica.') : t('Učitavam utakmice…')}</p>`;
    // mogući trejd: Daješ / Dobijaš (zbir strane obojen: bolja strana u kategoriji) i moj tim pre i posle
    let trade = '';
    if (tr || M.solo) {
      const AB = ttTeamAB(M, x || { id, owner: null }, tr);
      let sides = '';
      if (tr) {
        const sum = ids => sumPlayers(ids).vals, g = sum(tr.g), r = sum(tr.r);
        const better = c => { if (isPunt(c)) return 0; const a = cmpKey(c, r[c.key]), b = cmpKey(c, g[c.key]); if (a == null || b == null || a === b) return 0; return (c.lowerIsBetter ? a < b : a > b) ? 1 : -1; };
        const rowP = (pid, tag) => playerRowHTML(state.byId.get(pid), { tags: [tag], punt: true, pctSub: true });
        const sumRow = (vals, label, sgn) => `<tr class="total"><td>${label}</td><td></td>${CATS.map(c => { const b = better(c) * sgn; return `<td class="${colCls(c)} ${b > 0 ? 'better-me' : b < 0 ? 'better-them' : ''}">${fmtCat(c, vals[c.key])}</td>`; }).join('')}<td></td></tr>`;
        sides = `<h4>${t('Daješ i dobijaš')} <span class="hint">${t('po utakmici')}</span></h4>${tbl('fa-rep-pl', hdr, `${tr.g.map(pid => rowP(pid, { text: 'Daješ', cls: 'tag-out' })).join('')}${sumRow(g, t('Daješ'), -1)}${tr.r.map(pid => rowP(pid, { text: 'Dobijaš', cls: 'tag-in' })).join('')}${sumRow(r, t('Dobijaš'), 1)}`)}`;
      }
      const { B: Bt, A } = AB;
      const res = {}; let win = 0, lose = 0;
      for (const c of CATS.filter(k => !isPunt(k) && !k.fpts)) { const b = Bt.vals[c.key], a = A.vals[c.key]; if (a == null || b == null) continue; const d = a - b, zero = c.type === 'pct' ? Math.abs(d) < teamTieOf(c) : fmtDelta(c, d).zero; res[c.key] = zero ? 0 : (c.lowerIsBetter ? d < 0 : d > 0) ? 1 : -1; if (res[c.key] > 0) win++; else if (res[c.key] < 0) lose++; }
      const fd = (A.vals.FPTS ?? 0) - (Bt.vals.FPTS ?? 0);
      let verdict = pts ? `<div class="fa-verdict ${fd >= 0 ? 'up' : 'down'}">${t('{d} FPts po utakmici', { d: `${fd >= 0 ? '+' : '−'}${Math.abs(fd).toFixed(1)}` })}</div>` : `<div class="fa-verdict ${win >= lose ? 'up' : 'down'}">${faWL(win, lose)}</div>`;
      const v = (vals, c) => `<td class="${colCls(c)}">${fmtCat(c, vals[c.key])}</td>`;
      const dcell = c => { const b = Bt.vals[c.key], a = A.vals[c.key]; if (a == null || b == null) return `<td class="${colCls(c)}">-</td>`; const f = fmtDelta(c, a - b), r = c.fpts ? (f.zero ? 0 : a > b ? 1 : -1) : res[c.key] ?? 0; return `<td class="${colCls(c)} ${r > 0 ? 'win' : r < 0 ? 'lose' : ''}">${f.txt}</td>`; };
      const head2 = `<tr><th></th><th></th>${CATS.map(c => `<th class="${colCls(c)}">${c.label}</th>`).join('')}<th></th></tr>`;
      const bottom = view === 'diff' ? tbl('fa-rep', head2, `<tr class="total"><td>${t('Razlika')}</td><td></td>${CATS.map(dcell).join('')}<td></td></tr>`)
        : tbl('fa-rep', head2, `<tr><td>${t('Pre')}</td><td></td>${CATS.map(c => v(Bt.vals, c)).join('')}<td></td></tr><tr><td>${t('Posle')}</td><td></td>${CATS.map(c => v(A.vals, c)).join('')}<td></td></tr><tr class="total"><td>${t('Razlika')}</td><td></td>${CATS.map(dcell).join('')}<td></td></tr>`);
      const tip = view === 'diff' ? t('Razlika u zbiru tvog tima posle trejda, po utakmici, u izabranom periodu.') : t('Zbir proseka po utakmici svih aktivnih igrača tvog tima, pre i posle trejda, u izabranom periodu.');
      const vseg = `<div class="fa-rep-view"><div class="seg small" role="group" aria-label="${esc(t('Prikaz'))}">${[['diff', 'Razlika'], ['team', 'Ceo tim pre i posle']].map(([k, l]) => `<button type="button" data-action="tt-rep-view" data-v="${k}" data-per="${per}" data-id="${id}" aria-pressed="${k === view}">${t(l)}</button>`).join('')}</div><span class="i" data-tip="${esc(tip)}">ⓘ</span></div>`;
      const m = tr ? state.tt.tms.get(x.owner) : null, drop = m ? tfDropText(m.TM, tr) : '';
      if (m) { const cv = tfCardView(m.TM, tr); verdict = `<div class="fa-verdict ${cv.up ? 'up' : 'down'}">${cv.head}</div><p class="pnote">${t('Rezultat za ostatak sezone, kao u Pronađi trejd. Tabele prate izabrani period.')}</p>`; } // isti rezultat kao kartica u Pronađi trejd i analiza otvorena iz nje
      const acts = tr ? `<div class="tt-rep-btns tt-trade-btns"><button type="button" class="btn sec" data-action="tt-other" data-id="${id}">${t('Izaberi drugi trejd sa ovim igračem')}</button><button type="button" class="btn" data-action="tt-open-trade" data-id="${id}">${t('Otvori u analizi')}</button></div>` : '';
      trade = `<h4>${tr ? `${t('Mogući trejd')} <span class="hint">${t('do 2 za 2, Najbolje za mene, Fer')}</span>` : t('Procena bez protivnika: ulazi umesto {n}', { n: esc(M.weakest?.name || '–') })}</h4>${verdict}${drop ? `<p class="pnote tf-drop">${drop}</p>` : ''}${sides}<h4>${t('Tvoj tim')}</h4>${vseg}${bottom}${acts}`;
    } else if (R && !R.done) trade = `<h4>${t('Mogući trejd')}</h4><p class="pnote tt-calc" role="status"><span class="tt-spin" aria-hidden="true"></span>${t('Računam mogući trejd…')}</p>`;
    else if (R) trade = `<h4>${t('Mogući trejd')}</h4><p class="pnote">${t('Nema fer trejda do 2 za 2 sa tvojim rosterom')}</p><div class="tt-rep-btns tt-trade-btns"><button type="button" class="btn sec" data-action="tt-other" data-id="${id}">${t('Izaberi drugi trejd sa ovim igračem')}</button></div>`;
    // šta mi donosi po kategorijama (ako uđe umesto mog najslabijeg), u ligi uz mogući trejd
    const brings = x && !M.solo ? `<h4>${t('Šta ti donosi')} <span class="hint">${t('ako uđe umesto {n}', { n: esc(M.weakest?.name || '–') })}</span></h4>${ttSoloChange(M, x)}` : '';
    trade = brings + trade;
    return { me, games, trade };
  });
  // zašto bi vlasnik pristao, forma i uloga, povreda, plejof
  const parts = [];
  if (x?.wd) { const w = x.wd, a = []; if (w.surplusCats.length) a.push(t('Vlasnik ima višak u {c}', { c: w.surplusCats.join(', ') })); if (w.needCats.length) a.push(t('Vlasniku treba {c}, gde si ti jak', { c: w.needCats.join(', ') })); if (w.pressure) a.push(ttReasonOf(M, { ...x, wd: { ...w, surplusCats: [], needCats: [] } }, 'willing')); if (w.bottom) a.push(t('Vlasnik je pri dnu tabele')); parts.push(`<h4>${t('Zašto bi vlasnik pristao')}</h4>${a.length ? `<div class="fa-why">${a.map(s => `<span>${s}</span>`).join('')}</div>` : `<p class="pnote">${t('Nema posebnog razloga, osim fer vrednosti trejda.')}</p>`}`); }
  if (x) { const f = []; if (x.fd.minUp != null && Math.abs(x.fd.minUp) >= 1) f.push(t('Minuti {a} → {b} u poslednjih 7 dana', { a: Math.round(x.fd.minFrom), b: Math.round(x.fd.minTo) })); if (x.fd.mateOut) f.push(t('{n} je OUT', { n: esc(x.fd.mate) })); if (x.fd.formDiff != null) f.push(x.fd.formDiff >= 0 ? t('U formi: poslednjih 15 i 7 dana iznad sezone') : t('Forma ispod sezone u poslednjih 15 i 7 dana')); if (x.parts.stable != null) f.push(t('Stabilnost minuta: {p}%', { p: Math.round(x.parts.stable * 100) })); parts.push(`<h4>${t('Forma i uloga')}</h4><div class="fa-why">${f.map(s => `<span>${s}</span>`).join('')}</div>`); }
  const st = playerStatus(p, lg), ret = injRetText(p, lg);
  if (st.g !== 'OK') parts.push(`<h4>${t('Povreda')}</h4><p>${esc(stLabel(st))}${ret ? `, ${esc(ret)}` : ''}</p>`);
  if (x?.pg) parts.push(`<h4>${t('Plejof')}</h4><p>${ttReasonOf(M, x, 'playoff')}</p>`);
  const seg = faPerSeg(per, 'tt-rep-per', `data-id="${id}"`, 'fa-rep-per');
  showModal({
    title: `${esc(p.name)} <span class="hint">${p.team} · ${posTxt(p)}${owner ? ` · ${esc(owner)}` : ''}</span>`, cls: 'fa-rep-box', wide: true, cancel: null, confirm: t('Zatvori'), onConfirm: () => {},
    body: `<div class="fa-rep-h"><h4>${t('Statistika')} <span class="hint">${t('po utakmici')}</span></h4>${seg}</div>${body.me}
      <h4>${t('Poslednje utakmice')}</h4>${body.games}
      ${body.trade}${parts.join('')}
      <div class="fa-rep-news" id="tt-rep-news"><p class="pnote">${t('Učitavam vesti…')}</p></div>
      <div class="tt-rep-btns">${ttBtnsHTML(M, id)}</div>`,
  });
  document.getElementById('modal')?.classList.add('fa-rep-modal');
  if (!state.gameLogs.has(id)) ensureLogs([id]).then(() => { if (document.getElementById('tt-rep-news')) ttReport(id, per); });
  fetchNews(id).then(() => {
    const el = document.getElementById('tt-rep-news'), items = state.news.get(id)?.items || [];
    if (el) el.innerHTML = items.length ? `<h4>${t('Vesti')}</h4>${items.slice(0, 2).map(nw => `<p class="fa-news"><b>${esc(nw.headline || '')}</b> ${esc(nw.story || '')}</p>`).join('')}` : '';
  });
}

/* ---------- Dodaj protivnika (samo moj tim): roster tima u kome je igrač, pa Pronađi trejd ---------- */
function ttAddOpp(id) {
  state.tt.add = { id, ids: [id] };
  const lg = currentLeague();
  showModal({
    title: t('Dodaj protivnika'), cls: 'tt-add-box', wide: true, confirm: t('Pronađi trejd'),
    body: `<p class="pnote">${t('Unesi roster tima u kome je igrač. Igrač je već dodat i biće obeležen sa U trejd.')}</p>
      ${lg ? `<label class="tt-add-name">${t('Ime tima')} <input type="text" data-tt-name maxlength="30" placeholder="${esc(t('Ime tima, npr. Marko'))}"></label>` : ''}
      ${searchBoxHTML('tt-opp', t('Dodaj igrača…'))}<div id="tt-add-list" class="chips tt-mychips">${ttAddListHTML()}</div>`,
    onConfirm: () => ttAddOppSave(),
  });
  document.getElementById('modal')?.classList.add('tt-add-modal');
}
const ttAddListHTML = () => (state.tt.add?.ids || []).map(id => { const p = state.byId.get(id); return p ? `<span class="chip ${id === state.tt.add.id ? 'on' : ''}">${esc(p.name)}${id === state.tt.add.id ? ` <span class="slot-tag tag-tc">⇄ ${t('U trejd')}</span>` : `<button type="button" data-action="tt-add-rm" data-id="${id}" aria-label="${esc(t('Ukloni'))}">✕</button>`}</span>` : ''; }).join('');
function ttAddOppSave() {
  const A = state.tt.add; if (!A) return;
  const lg = currentLeague();
  if (lg) {
    const name = document.querySelector('[data-tt-name]')?.value.trim() || t('Protivnik');
    const oid = `o${Date.now()}`;
    state.rosters.opps[oid] = { ...emptyRoster(name), players: A.ids.map(id => ({ id, ir: false })), updated: nowISO() };
    saveRosters();
    state.tt.add = null;
    openFinder({ opp: oid, want: A.id, run: true });
    return;
  }
  const q = lsGet(TF_QUICK_KEY) || { my: [], opp: [] };
  q.opp = A.ids.filter(id => !q.my.includes(id)); lsSet(TF_QUICK_KEY, q);
  tfSetMark({ scopeKey: 'quick', oppKey: 'quick' }, 'theirs', A.id, 'trade');
  try { sessionStorage.setItem(TF_AUTORUN_KEY, '1'); } catch {}
  state.tt.add = null;
  location.href = EMBED?.finderUrl || (LANG === 'sr' ? '../trade-finder/' : '../trade-finder/');
}
const TF_AUTORUN_KEY = 'fbaTrade.tfAutoRun.v1'; // Mete za trejd (bez lige) -> Pronađi trejd: pretraga kreće sama
function ttPick(key, id) {
  if (key === 'tt-lock') { // Ne dam: Lock za celu ligu
    const lg = currentLeague(); if (!lg) return;
    if (!tfLocks(lg.id)[id]) tfSetMark({ scopeKey: lg.id, oppKey: null }, 'mine', id, 'lock');
    searchUI.set(key, { query: '', sel: 0 }); ttRender();
    document.querySelector(`[data-search="${key}"]`)?.focus();
    return;
  }
  if (key === 'tt-my') {
    const q = lsGet(TF_QUICK_KEY) || { my: [], opp: [] };
    if (!q.my.includes(id)) { q.my.push(id); q.opp = (q.opp || []).filter(x => x !== id); lsSet(TF_QUICK_KEY, q); }
    searchUI.set(key, { query: '', sel: 0 }); ttRender();
    document.querySelector(`[data-search="${key}"]`)?.focus();
    return;
  }
  if (key === 'tt-opp' && state.tt.add) {
    if (!state.tt.add.ids.includes(id)) state.tt.add.ids.push(id);
    searchUI.set(key, { query: '', sel: 0 });
    const inp = document.querySelector('[data-search="tt-opp"]'); if (inp) { inp.value = ''; document.getElementById('dd-tt-opp')?.setAttribute('hidden', ''); inp.focus(); }
    const el = document.getElementById('tt-add-list'); if (el) el.innerHTML = ttAddListHTML();
  }
}
const ttTaken = key => (key === 'tt-opp' ? new Set([...(state.tt.add?.ids || []), ...ttMyRoster(currentLeague()).map(x => x.id)]) : new Set(ttMyRoster(null).map(x => x.id)));

/* ---------- Akcije ---------- */
function ttRate(i, rating, el) {
  const lg = currentLeague(); if (!lg) return;
  const M = ttGet(lg), P = ttPageItems(M), x = P.items[i - P.off]; if (!x) return;
  const B = tfBase(lg), pl = id => ratePlayer(B, id), tr = state.tt.trades.get(x.id) || null;
  rateSave({ k: tfRateKey('targets', lg.id, [], [x.id]), ts: new Date().toISOString(), tool: 'targets', rating,
    league: rateLeague(lg, M.cats), strategy: M.ui.need, slider: null, focus: M.ui.need === 'manual' ? [...M.ui.cats] : [],
    give: tr ? tr.g.map(pl) : [], get: [pl(x.id)], myDrop: tr ? tr.md.map(pl) : [], thDrop: tr ? tr.od.map(pl) : [], conv: false, shape: tr ? `${tr.g.length}:${tr.r.length}` : null,
    result: { score: r2(x.score), gain: r2(x.gain), parts: Object.fromEntries(Object.entries(x.parts).map(([k, v]) => [k, r2(v)])), rank: i + 1, trade: tr ? tr.r.map(Number) : null },
    myTeam: lg.roster?.name || null, opp: x.owner ? lg.opps[x.owner]?.name || null : null }, el);
}
function ttAction(a, el) {
  const lg = currentLeague(), ui = ttUi(lg), id = +el.dataset.id;
  switch (a) {
    case 'tt-need': ui.need = el.dataset.v; ui.page = 0; break;
    case 'tt-cat': { const k = el.dataset.k; ui.cats = ui.cats.includes(k) ? ui.cats.filter(x => x !== k) : [...ui.cats, k]; ui.page = 0; break; }
    case 'tt-more': {
      ui.page++;
      const M = ttGet(lg), shown = new Set(), per = ttPer();
      for (let k = 0; k < ui.page; k++) ttPage(M.list, shown, per).forEach(x => shown.add(x.id));
      if (ttPage(M.list, shown, per).length < per && M.list.length < M.coarseN) ui.refine += TT.REFINE; // kraj izabranih: sledećih 40
      break;
    }
    case 'tt-wish': lsSet(TT_WISH_KEY, ttWishToggle(ttWishAll(), ttScope(lg), id)); break;
    case 'tt-report': ttReport(id); return true;
    case 'tt-rep-per': closeModal(); ttReport(id, el.dataset.per); return true;
    case 'tt-rep-view': lsSet(FA_REP_VIEW_KEY, el.dataset.v); closeModal(); ttReport(id, el.dataset.per); return true;
    case 'tt-open-trade': { const M = ttGet(lg), x = M.byId.get(id), tr = state.tt.trades.get(id); if (x && tr) { closeModal(); tfOpenX(tr, ttTradeCtx(lg, x.owner)); } return true; }
    case 'tt-other': { closeModal(); const x = ttGet(lg).byId.get(id); if (x?.owner) openFinder({ opp: x.owner, want: id, run: true, back: 'targets' }); return true; }
    case 'tt-unlock': tfSetMark({ scopeKey: lg.id, oppKey: null }, 'mine', id, null); break;
    case 'tt-suggest': {
      closeModal();
      const owner = lg ? Object.keys(lg.opps || {}).find(k => lg.opps[k].players?.some(y => y.id === id)) : null;
      if (owner) openFinder({ opp: owner, want: id, run: true, back: 'targets' }); else ttAddOpp(id);
      return true;
    }
    case 'tt-trade-tab': {
      closeModal();
      if (!lg) { const my = ttMyRoster(null).map(x => x.id); location.href = `${EMBED?.ta || '../trade-analyzer/'}#t=|${id}${my.length ? `&m=${my.join(',')}` : ''}`; return true; }
      const owner = Object.keys(lg.opps || {}).find(k => lg.opps[k].players?.some(y => y.id === id)) || null;
      setBack('trade'); openInAnalysis([[], [id]], { opp: owner });
      if (!owner) { state.rosters.oppSel = null; saveRosters(); }
      persistTrades(); goPage('trade');
      return true;
    }
    case 'tt-rate': ttRate(+el.dataset.i, +el.dataset.r, el); return true;
    case 'tt-add-rm': if (state.tt.add) { state.tt.add.ids = state.tt.add.ids.filter(x => x !== id); const box = document.getElementById('tt-add-list'); if (box) box.innerHTML = ttAddListHTML(); } return true;
    case 'tt-q-rm': { const q = lsGet(TF_QUICK_KEY) || { my: [], opp: [] }; q.my = q.my.filter(x => x !== id); lsSet(TF_QUICK_KEY, q); break; }
    case 'tt-save-league': ttSaveLeague(); return true;
    default: return false;
  }
  ttRender();
  return true;
}

/* ---------- Stranica: Moj tim ---------- */
function renderTeamPage() {
  const lg = currentLeague();
  return `<h2 class="page-t">${t('Moj tim')}${lg.teamName ? ` <span class="hint">${esc(lg.teamName)}</span>` : ''}${isPasted(lg) ? ` <button type="button" class="linkbtn" data-action="paste-open" data-target="my">📋 ${t('Nalepi ponovo')}</button>` : ''}</h2>
    <section class="card">${rosterEditorHTML('my', (p, x) => linkHTML('team-trade', { cls: 'mini trade', attrs: `data-player="${p.id}" title="${esc(t('Trejduj ga'))}" aria-label="${esc(t('Trejduj ga'))}"`, label: '⇄' }) + rosterBtns('my', p, x),
      t('Unesi svoj roster ({a} aktivnih + {b} IR). Čuva se samo u ovom browseru.', { a: ROSTER.ACTIVE, b: ROSTER.IR }))}${isSynced(lg) ? '' : importOnlyHTML(t('Osvežavanje rostera i statusa sa platforme'))}</section>`;
}

/* ---------- Stranica: Liga ---------- */
function renderLeaguePage() {
  const lg = currentLeague();
  const teams = enteredTeams();
  const opps = oppList();
  const st = lg.standings || {};
  const table = `<section class="pcard"><h3>${t('Tabela lige')}</h3>
    <div class="ov-team">${st.rank || st.record
      ? `${st.rank ? `<span>${t('Moje mesto')}: <b>${t('{n}. od {m}', { n: st.rank, m: lg.teams || '?' })}</b></span>` : ''}${st.record ? `<span>${t('Skor')}: <b>${esc(st.record)}</b></span>` : ''}`
      : `<span class="pnote">${t('Mesto i skor unosiš u podešavanjima lige.')}</span>`}
      <button type="button" class="linkbtn" data-action="league-settings">⚙ ${t('Podešavanja lige')}</button>
      ${isSynced(lg) ? '' : `<button type="button" class="btn" data-action="league-import">⤓ ${t('Uvezi ligu')}</button>`}</div>
    ${isSynced(lg) ? standingsHTML(lg) : importOnlyHTML(t('Puna tabela lige i stvarni plasman u sezoni'))}</section>${importRanksHTML(lg)}`; // puna tabela i plasman po kategorijama (uvoz lige)
  const form = state.ui.ltEdit === 'new' ? `<div class="pcard lt-form"><input type="text" data-lt-name maxlength="30" placeholder="${t('Ime tima, npr. Marko')}">
      <button type="button" class="btn" data-action="lt-save">${t('Napravi')}</button><button type="button" class="linkbtn" data-action="lt-cancel">${t('Otkaži')}</button></div>` : '';
  const card = ([oid, o]) => {
    const ranks = isPointsFmt() ? null : catRanks(oid, teams);
    const sw = ranks ? strongWeak(ranks) : null;
    const tm = teams.find(x => x.id === oid);
    const fp = isPointsFmt() && tm ? tm.tot.vals.FPTS : null;
    const fpRank = fp != null && teams.length >= 3 ? teams.filter(x => (x.tot.vals.FPTS ?? 0) > fp + EPS).length + 1 : null;
    return `<div class="tcard ${state.leagueTeam === oid ? 'on' : ''}">
      <button type="button" class="tcard-open" data-action="lt-open" data-id="${oid}">
        <span class="tc-name">${esc(o.name)}</span>
        <span class="tc-meta">${t('{n} igrača', { n: o.players.length })} · ${t('Ažurirano: {d}', { d: fmtShortDate(o.updated) })}</span>
        ${fp != null ? `<span class="tc-sw"><b>${fp.toFixed(1)}</b> ${t('FPts po utakmici')}${fpRank ? ` · ${t('{n}. od {m}', { n: fpRank, m: teams.length })}` : ''}</span>` : ''}
        ${sw ? `<span class="tc-sw"><span class="slot-tag tag-in">${t('jak')}</span> ${sw.strong.map(x => x.c.label).join(', ')} <span class="slot-tag tag-out">${t('slab')}</span> ${sw.weak.map(x => x.c.label).join(', ')}</span>` : ''}
      </button>
      ${linkHTML('league-trade-with', { attrs: `data-opp="${oid}"` })}${linkHTML('league-finder', { attrs: `data-opp="${oid}"` })}</div>`;
  };
  const sel = state.leagueTeam && state.rosters.opps[state.leagueTeam] ? state.leagueTeam : null;
  let editor = '';
  if (sel) {
    const o = state.rosters.opps[sel];
    const synced = isSynced(lg);
    const rename = state.ui.ltEdit === 'rename'
      ? `<div class="opp-form"><input type="text" data-lt-name maxlength="30" value="${esc(o.name)}"><button type="button" class="btn" data-action="lt-save">${t('Sačuvaj')}</button><button type="button" class="linkbtn" data-action="lt-cancel">${t('Otkaži')}</button></div>` : '';
    editor = `<section class="card lt-editor" id="lt-editor"><div class="card-h"><div class="side-title"><b>${esc(o.name)}</b><small>${t('Roster protivnika')}</small></div>
      ${isPasted(lg) ? `<button type="button" class="linkbtn" data-action="paste-open" data-target="${sel}">📋 ${t('Nalepi ponovo')}</button>` : ''}
      ${synced ? '' : `<button type="button" class="linkbtn" data-action="lt-rename">${t('Preimenuj')}</button><button type="button" class="linkbtn danger" data-action="lt-delete">${t('Obriši')}</button>`}
      <button type="button" class="iconbtn" data-action="lt-close" aria-label="${t('Zatvori')}">✕</button></div>${rename}
      ${rosterEditorHTML('lt', (p, x) => `${linkHTML('league-want', { cls: 'mini want', attrs: `data-player="${p.id}" data-opp="${sel}"` })}${rosterBtns('lt', p, x)}`,
        t('Unesi roster protivnika ({a} aktivnih + {b} IR). Čuva se samo u ovom browseru.', { a: ROSTER.ACTIVE, b: ROSTER.IR }))}</section>`;
    // povezana liga: plasman ovog tima po kategorijama, ispod njegovog rostera
    const tm = synced ? lg.import.teams.find(x => `e${x.tid}` === sel) : null;
    if (tm) editor += importRanksHTML(lg, tm.tid, tm.name);
  }
  return `<h2 class="page-t">${t('Liga')} <span class="hint">${t('Uneto {a} od {b} timova', { a: enteredCount(), b: lg.teams || '?' })}</span></h2>
    ${table}
    <div class="tgrid">${opps.map(card).join('')}
      ${isSynced(lg) ? '' : `<button type="button" class="tcard add" data-action="lt-new"><span class="plus">＋</span> ${t('Dodaj tim')}</button>`}
      ${isPasted(lg) ? `<button type="button" class="tcard add" data-action="paste-open"><span class="plus">📋</span> ${t('Nalepi tim')}</button>` : ''}</div>
    ${form}${editor}
    ${teams.length < 3 && !isSynced(lg) ? `<p class="pnote">${isPointsFmt() ? t('Kad uneseš bar 3 tima (sa svojim), uz svaki tim vidiš i rang po poenima.') : t('Kad uneseš bar 3 tima (sa svojim), uz svaki tim vidiš dve najjače i dve najslabije kategorije.')}</p>` : ''}${opps.length ? notCountedHTML() : ''}`;
}

/** Sadržaj stranice lige (sve osim Analize, koja koristi postojeće sekcije) */
function renderPage() {
  const el = $('#page');
  const html = state.page === 'fa' ? renderFaPage() : state.page === 'finder' ? renderFinderPage() : state.page === 'targets' ? renderTargetsPage() : state.page === 'team' ? renderTeamPage() : state.page === 'league' ? renderLeaguePage() : state.page === 'history' ? renderHistory() : renderOverview();
  el.innerHTML = html;
  if (state.page === 'overview') fitAlerts(el);
  const hl = state.ui.highlight;
  if (hl && state.page === 'team') {
    const row = el.querySelector('tr.hl');
    if (row) requestAnimationFrame(() => row.scrollIntoView({ block: 'center' }));
    state.ui.highlight = null; // istaknut jednom, posle skoka
  }
}

/* ---------- Navigacija: bočni meni (računar) i donja traka (telefon) ---------- */
function renderNav() {
  const side = $('#sidenav'), bottom = $('#bottomnav');
  if (state.view !== 'league') { side.innerHTML = ''; bottom.innerHTML = ''; return; }
  const n = openTrades(state.scope);
  const badge = n ? `<span class="nbadge" title="${esc(t('Otvoreni tabovi analize'))}" data-tip="${esc(t('Otvoreni tabovi analize'))}" aria-label="${esc(`${t('Otvoreni tabovi analize')}: ${n}`)}">${n}</span>` : '';
  // Istorija: broj poslatih ponuda koje čekaju odgovor
  const ns = sentOffers().length;
  const histBadge = ns ? `<span class="nbadge sent" title="${esc(t('Poslate ponude koje čekaju odgovor'))}">${ns}</span>` : '';
  // title: tooltip kad je bočni meni skupljen u ikonice (ispod 1024 px)
  const item = (id, icon, label, extra = '') => `<a href="${pageHash(id)}" class="nitem ${state.page === id ? 'on' : ''}" data-goto="${id}" title="${esc(label)}" ${state.page === id ? 'aria-current="page"' : ''}>${icon}<span class="nlabel">${label}</span>${extra}</a>`;
  const tp = toolPages();
  const soonItem = p => `<button type="button" class="nitem soon" data-action="tool-soon" data-tool="${p.id}" title="${esc(`${t(p.sr)} · ${t('Uskoro')}`)}">${NAV_ICON[p.id] || NAV_ICON.trades}<span class="nlabel">${t(p.sr)}<small class="soon-sub">${t('Uskoro')}</small></span></button>`;
  side.innerHTML = `<nav class="snav" aria-label="${t('Stranice lige')}">
    ${item('overview', NAV_ICON.overview, t('Pregled'))}${item('team', NAV_ICON.team, t('Moj tim'))}${item('league', NAV_ICON.league, t('Liga'))}
    <div class="ngroup">${t('Alati')}</div>
    ${tp.map(p => (p.ready ? item(p.id, NAV_ICON[p.id] || NAV_ICON.trades, t(p.sr), p.id === 'trade' ? badge : p.id === 'history' ? histBadge : '') : soonItem(p))).join('')}</nav>`;
  const tradesOn = tp.some(p => p.ready && p.id === state.page);
  bottom.innerHTML = `<nav class="bnav" aria-label="${t('Stranice lige')}">
    ${item('overview', NAV_ICON.overview, t('Pregled'))}${item('team', NAV_ICON.team, t('Moj tim'))}${item('league', NAV_ICON.league, t('Liga'))}
    <button type="button" class="nitem ${tradesOn ? 'on' : ''}" data-action="trades-menu">${NAV_ICON.trades}<span>${t('Alati')}</span>${badge}</button></nav>`;
}

/* ---------- Izbirač lige u zaglavlju ---------- */
function leaguePickerHTML() {
  const lg = currentLeague();
  if (!profile?.leagues.length) return '';
  return `<button type="button" class="lpick" data-action="league-menu" aria-haspopup="menu">
    <span class="lp-name">${lg ? esc(lgName(lg)) : t('Moje lige')}</span>${lg ? `<span class="pbadge">${esc(platformLabel(lg.platform))}</span>` : ''}<span class="lp-caret" aria-hidden="true">▾</span></button>`;
}
function openPopMenu(anchor, html) {
  closePopMenu();
  const m = Object.assign(document.createElement('div'), { id: 'popmenu', className: 'popmenu', innerHTML: html });
  m.setAttribute('role', 'menu');
  document.body.appendChild(m);
  const r = anchor.getBoundingClientRect(), w = m.offsetWidth, h = m.offsetHeight;
  const left = Math.max(8, Math.min(r.right - w, innerWidth - w - 8));
  const top = r.bottom + 6 + h > innerHeight - 8 ? Math.max(8, r.top - h - 6) : r.bottom + 6;
  m.style.left = `${left}px`; m.style.top = `${top}px`;
  m.querySelector('button,a')?.focus();
}
const closePopMenu = () => document.getElementById('popmenu')?.remove();
function leagueMenu(anchor) {
  const leagues = profile?.leagues || [];
  openPopMenu(anchor, `${leagues.map(l => { const n = openTrades(l.id); return `<button type="button" role="menuitem" class="pm-item ${l.id === state.scope ? 'on' : ''}" data-open-league="${l.id}">
      <span>${esc(lgName(l))}</span>${n ? `<span class="cnt">${n}</span>` : ''}</button>`; }).join('')}
    <div class="pm-sep"></div>
    ${currentLeague() ? `<button type="button" role="menuitem" class="pm-item" data-action="league-settings">⚙ ${t('Podešavanja lige')}</button>` : ''}
    <a role="menuitem" class="pm-item" href="#home" data-nav="home">${t('Sve lige')}</a>
    <a role="menuitem" class="pm-item" href="${publicAnalyzer()}">${t('Brzo poređenje')}</a>
    <button type="button" role="menuitem" class="pm-item" data-action="add-league">＋ ${t('Dodaj ligu')}</button>`);
}
function playerMenu(anchor, kind, id) {
  const r = rosterOf(kind), x = r?.players.find(y => y.id === id);
  if (!x) return;
  const trade = kind === 'my' ? linkHTML('team-trade', { cls: 'pm-item', attrs: `role="menuitem" data-player="${id}"` }) : '';
  openPopMenu(anchor, `${trade}
    <button type="button" role="menuitem" class="pm-item" data-action="r-ir" data-kind="${kind}" data-id="${id}">${x.ir ? t('Vrati sa IR') : t('Prebaci na IR')}</button>
    <button type="button" role="menuitem" class="pm-item danger" data-action="r-remove" data-kind="${kind}" data-id="${id}">${t('Ukloni')}</button>`);
}

/* ---------- Timovi u Ligi: dodavanje, preimenovanje, brisanje ---------- */
function ltSave() {
  const inp = document.querySelector('[data-lt-name]');
  const name = inp?.value.trim();
  if (!name) { inp?.focus(); return; }
  const editing = state.ui.ltEdit === 'rename' ? state.leagueTeam : null;
  if (oppList().some(([oid, o]) => o.name.toLowerCase() === name.toLowerCase() && oid !== editing)) { inp.setCustomValidity(t('Već postoji tim sa tim imenom')); inp.reportValidity(); return; }
  if (editing) state.rosters.opps[editing].name = name;
  else { const oid = `o${Date.now()}`; state.rosters.opps[oid] = emptyRoster(name); state.leagueTeam = oid; }
  state.ui.ltEdit = null;
  saveRosters(); render();
  if (!editing) document.querySelector('[data-search="lt-add"]')?.focus();
}
function ltDelete() {
  const oid = state.leagueTeam, o = state.rosters.opps[oid];
  if (!o) return;
  showModal({
    title: t('Obrisati tim „{n}”?', { n: esc(o.name) }),
    body: `<p>${t('Roster ovog protivnika ({n} igrača) biće obrisan iz ovog browsera. Ovo ne može da se vrati, osim iz rezervne kopije.', { n: o.players.length })}</p>`,
    confirm: t('Obriši'), danger: true,
    onConfirm: () => {
      delete state.rosters.opps[oid];
      if (state.rosters.oppSel === oid) state.rosters.oppSel = null;
      state.leagueTeam = null;
      saveRosters(); render();
    },
  });
}

/* ---------- Rezervna kopija starih podataka pri prvom pokretanju nove verzije (ne briše se) ---------- */
const PRE_NAV_BACKUP_KEY = 'fbaTrade.backup.beforeRosterSwing';
function backupBeforeNav() {
  try {
    if (localStorage.getItem(PRE_NAV_BACKUP_KEY) != null) return;
    const data = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k.startsWith('fbaTrade.') && !k.startsWith('fbaTrade.players') && !k.startsWith('fbaTrade.backup') && !k.startsWith('fbaTrade.schedule')) data[k] = localStorage.getItem(k);
    }
    if (Object.keys(data).length) localStorage.setItem(PRE_NAV_BACKUP_KEY, JSON.stringify({ date: nowISO(), data }));
  } catch (e) { console.warn('Rezervna kopija nije sačuvana:', e.message); }
}

/* =====================================================================
   Događaji (delegirani)
   ===================================================================== */
document.addEventListener('click', e => {
  // meni (⋯, izbirač lige) se zatvara klikom bilo gde; stavka menija se izvršava ispod
  const inMenu = e.target.closest('#popmenu');
  if (!inMenu && !e.target.closest('[data-pmenu],[data-action="league-menu"],[data-action="trades-menu"]')) closePopMenu();
  if (inMenu && e.target.closest('button,a')) setTimeout(closePopMenu, 0);
  const lk = e.target.closest('[data-link]');
  if (lk) { e.preventDefault(); followLink(lk.dataset.link, lk.dataset); return; }
  const pm = e.target.closest('[data-pmenu]');
  if (pm) { const [k, id] = pm.dataset.pmenu.split(':'); if (document.getElementById('popmenu')) closePopMenu(); else playerMenu(pm, k, +id); return; }
  const pg = e.target.closest('[data-goto]');
  if (pg) { e.preventDefault(); closeModal(); clearBack(); goPage(pg.dataset.goto); return; } // stavka navigacije: bez "Nazad"; Pronađi trejd vraća stanje iz sesije
  const nav = e.target.closest('[data-nav]');
  if (nav) { e.preventDefault(); navigate(nav.dataset.nav); return; }
  const ol = e.target.closest('[data-open-league]');
  if (ol) { navigate('league', ol.dataset.openLeague); return; }
  const tg = e.target.closest('[data-tab]');
  if (tg) { switchTab(tg.dataset.tab); return; }
  const tx = e.target.closest('[data-tab-close]');
  if (tx) { closeTab(tx.dataset.tabClose); return; }
  const sh = e.target.closest('[data-share-to]');
  if (sh && state.pendingShare) { openSharedIn(sh.dataset.shareTo, state.pendingShare, state.pendingKeep); return; }
  const rv = e.target.closest('[data-rview]');
  if (rv) {
    const [k, v] = rv.dataset.rview.split(':');
    state.ui.rosterView = { ...(state.ui.rosterView || {}), [k]: v };
    saveUI(); render(); return;
  }
  const pt = e.target.closest('[data-punt]');
  if (pt) { togglePunt(pt.dataset.punt); return; }
  const el = e.target.closest('[data-action],[data-period]');
  if (!el) return;
  if (el.dataset.period) { if (state.mix) { const tb = activeTab(); if (tb) delete tb.mix; state.mix = false; } state.period = el.dataset.period; for (const u of Object.values(state.fa)) { u.risePer = null; u.allPer = null; } saveState(); render(); return; } // zaglavlje: kartice FA opet prate period iz zaglavlja
  if (el.dataset.action?.startsWith('tf-') && tfAction(el.dataset.action, el)) return; // Pronađi trejd
  if (el.dataset.action?.startsWith('tt-') && ttAction(el.dataset.action, el)) return; // Mete za trejd
  const ti = +el.dataset.team;
  switch (el.dataset.action) {
    case 'refresh': loadPlayers(true); loadSchedule(true); break;
    case 'go-back': { const b = state.back; clearBack(); if (b) location.hash = b.hash; break; }
    case 'league-menu': if (document.getElementById('popmenu')) closePopMenu(); else leagueMenu(el); break;
    case 'trades-menu': if (document.getElementById('popmenu')) closePopMenu(); else openPopMenu(el, toolPages().map(p => { if (!p.ready) return `<button type="button" role="menuitem" class="pm-item soon" data-action="tool-soon" data-tool="${p.id}"><span>${t(p.sr)}</span><span class="soon-tag">${t('Uskoro')}</span></button>`; const n = p.id === 'history' ? sentOffers().length : p.id === 'trade' ? openTrades(state.scope) : 0; return `<a role="menuitem" class="pm-item" href="${pageHash(p.id)}" data-goto="${p.id}"><span>${t(p.sr)}</span>${n ? `<span class="cnt${p.id === 'history' ? ' sent' : ''}">${n}</span>` : ''}</a>`; }).join('')); break;
    case 'tool-soon': closePopMenu(); openToolSoon(el.dataset.tool); break;
    // Pojačanja sa FA
    case 'fa-report': faReport(+el.dataset.in, +el.dataset.out || null); break;
    case 'fa-rate': faRate(+el.dataset.i, +el.dataset.r, el); break;
    case 'rate-export': rateExport(); break;
    case 'rate-wipe': rateWipe(); break;
    case 'fa-card-per': { const u = faUi(); u[el.dataset.card] = el.dataset.per; if (el.dataset.card === 'allPer') u.page = 1; render(); break; }
    case 'fa-rep-per': faReport(+el.dataset.in, +el.dataset.out || null, el.dataset.per); break;
    case 'fa-rep-view': lsSet(FA_REP_VIEW_KEY, el.dataset.v); faReport(+el.dataset.in, +el.dataset.out || null, el.dataset.per); break;
    case 'fa-next-drop': { const u = faUi(), id = +el.dataset.id; u.skipBy[id] = (u.skipBy[id] || 0) + 1; render(); break; }
    case 'fa-auto-drop': faUi().picks = []; faUi().skipBy = {}; render(); break;
    case 'fa-unpick': { const u = faUi(); u.picks = u.picks.filter(id => id !== +el.dataset.id); render(); break; }
    case 'fa-lock': toggleFaLock(currentLeague(), +el.dataset.id); faUi().skipBy = {}; render(); break;
    case 'fa-need': faUi().need = el.dataset.v; render(); break;
    case 'fa-cat': { const u = faUi(), k = el.dataset.k; u.cats = u.cats.includes(k) ? u.cats.filter(x => x !== k) : [...u.cats, k]; render(); break; }
    case 'fa-page': { faUi().page = +el.dataset.p; render(); document.getElementById('fa-all')?.scrollIntoView({ block: 'start' }); break; }
    case 'all-alerts': showAllAlerts(); break;
    case 'al-hide': hideAlert(el.dataset.key); break;
    case 'open-in-league': location.href = shareURL() + '&mv=1'; break; // isti izbor lige kao za deljeni link, bez okretanja strana
    case 'ov-hist': { const id = +el.dataset.id; closeModal(); setBack('trade'); openTrade(id); goPage('trade'); break; }
    case 'lt-open': state.leagueTeam = state.leagueTeam === el.dataset.id ? null : el.dataset.id; state.ui.ltEdit = null; render();
      if (state.leagueTeam) document.getElementById('lt-editor')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); break;
    case 'lt-close': state.leagueTeam = null; state.ui.ltEdit = null; render(); break;
    case 'lt-new': state.ui.ltEdit = 'new'; render(); document.querySelector('[data-lt-name]')?.focus(); break;
    case 'lt-rename': state.ui.ltEdit = 'rename'; render(); document.querySelector('[data-lt-name]')?.focus(); break;
    case 'lt-cancel': state.ui.ltEdit = null; render(); break;
    case 'lt-save': ltSave(); break;
    case 'lt-delete': ltDelete(); break;
    case 'ai-copy': copyForAI(); break;
    case 'swap-sides': {
      // Daješ <-> Dobijaš (isti tab); izbor Izbacuješ / Waiver ne važi za obrnut trejd
      const [a, b] = [giveIds(), getIds()];
      state.teams[GIVE].ids = [...b]; state.teams[GET].ids = [...a];
      state.balance.my = { drops: [], waivers: [] };
      state.sharedOpen = false; searchUI.clear();
      saveState(); render(); break;
    }
    case 'ai-select': { const ta = document.querySelector('#modal .ai-text'); ta?.focus(); ta?.select(); try { document.execCommand('copy'); } catch {} break; }
    case 'pick-drop': {
      const sp = slotPlan('my'), id = +el.dataset.id;
      state.balance.my.drops = [...sp.drops, id].slice(0, Math.max(1, sp.dropSlots));
      saveBalance(); render(); break;
    }
    case 'tab-new': addTab(); state.sharedOpen = false; state.histView = null; searchUI.clear(); saveState(); render(); break;
    case 'save-trade': if (currentLeague()) saveTrade(); break;
    case 'trade-done': if (currentLeague()) tradeDone(); break;
    case 'offer-sent': if (rosterLocked()) offerSent(); break;
    case 'cmp-view': state.ui.cmpView = el.dataset.v === 'rank' ? 'rank' : 'cats'; saveUI(); render(); break;
    case 'offer-accept': offerAccept(+el.dataset.id); break;
    case 'offer-reject': offerReject(+el.dataset.id); break;
    case 'temp-end': endTempSwap(currentLeague()); break;
    case 'add-to-roster': if (!el.classList.contains('is-disabled')) { addToRoster(el.dataset.kind, +el.dataset.id); render(); } break;
    case 'add-to-my': if (!el.classList.contains('is-disabled')) { addToRoster('my', +el.dataset.id); render(); } break;
    case 'add-all': if (!el.classList.contains('is-disabled')) { addAllToRoster(el.dataset.kind); render(); } break;
    case 'profile': openProfile(); break;
    case 'wipe-all': wipeAll(); break;
    case 'add-league': openAddLeague(); break;
    case 'imp-go': openImportMethod(el.dataset.imp); break;
    case 'imp-pick-league': { const inp = document.getElementById('imp-in'); if (inp) { inp.value = el.dataset.id; document.querySelector('#modal [data-modal-ok]')?.click(); } break; }
    case 'league-sync': syncLeague(currentLeague()); break;
    case 'league-unlink': closeModal(); unlinkLeague(); break;
    case 'league-import': if (currentLeague()) { closeModal(); openAddLeague(currentLeague().id); } break;
    case 'paste-open': if (currentLeague()) openPaste({ leagueId: currentLeague().id, target: el.dataset.target || null }); break;
    case 'paste-save-more': pasteSave(true); break;
    case 'league-settings': openLeagueSettings(); break;
    case 'quick-format': openQuickFormat(); break;
    case 'sentfmt-close': { const tb = activeTab(); if (tb) { delete tb.sentFormat; persistTrades(); } render(); break; }
    case 'league-dup': duplicateLeague(); break;
    case 'league-del': deleteLeague(); break;
    case 'export': exportData(el, 'profile'); break;
    case 'export-league': exportData(el, 'league'); break;
    case 'cols-reset': {
      setCols(null);
      el.closest('.ls-cols')?.replaceWith(Object.assign(document.createElement('p'), { className: 'hint', textContent: t('Vraćen je podrazumevani redosled kolona.') }));
      render(); break;
    }
    case 'import': importData(); break;
    case 'r-ir': toggleIR(el.dataset.kind, +el.dataset.id); break;
    case 'rlayout': state.ui.rosterLayout = el.dataset.v === 'split' ? 'split' : 'stack'; saveUI(); render(); break;
    case 'r-trade': { const id = +el.dataset.id, ti = el.dataset.kind === 'my' ? GIVE : GET;
      if (!takenIds().has(id)) { state.teams[ti].ids.push(id); saveState(); render(); } break; }
    case 'notice-close': state.notice = null; state.noticeLink = null; render(); break;
    case 'shared-close': state.sharedOpen = false; render(); break;
    case 'share': shareLink(el); break;
    case 'hist-open': { const id = +el.dataset.id; setBack('trade'); openTrade(id); goPage('trade'); break; }
    case 'hist-stats': { const id = +el.dataset.id; state.histView = state.histView === id ? null : id; render(); if (state.histView) { const h = state.history.find(x => x.id === id); if (h) loadGameLogs(tradePlayerIds(h.teams, h.slots)); } break; }
    case 'hist-del': deleteTrade(+el.dataset.id); break;
    case 'hist-close': state.histView = null; render(); break;
    case 'opp-rename': state.ui.oppEdit = 'rename'; render(); document.querySelector('[data-opp-name]')?.focus(); break;
    case 'opp-delete': oppDelete(); break;
    case 'opp-save': oppSave(); break;
    case 'opp-cancel': state.ui.oppEdit = null; render(); break;
    case 'r-remove': removeFromRoster(el.dataset.kind, +el.dataset.id); render(); break;
    case 'bal-d-remove': state.balance[el.dataset.kind].drops = state.balance[el.dataset.kind].drops.filter(x => x !== +el.dataset.id); saveBalance(); render(); break;
    case 'bal-w-remove': state.balance[el.dataset.kind].waivers = state.balance[el.dataset.kind].waivers.filter(x => x !== +el.dataset.id); saveBalance(); render(); break;
    case 'remove': removePlayer(ti, +el.dataset.id); break;
  }
});

// mousedown (ne click) da blur inputa ne zatvori dropdown pre izbora
document.addEventListener('mousedown', e => {
  const add = e.target.closest('[data-addmy]');
  if (add) {
    e.preventDefault(); e.stopPropagation();
    if (add.classList.contains('is-disabled')) return; // pun roster: poruka je u title
    const key = add.closest('[data-key]')?.dataset.key;
    addToRoster('my', +add.dataset.addmy);
    render();
    if (key) { document.querySelector(`[data-search="${key}"]`)?.focus(); updateDropdown(key); }
    return;
  }
  const li = e.target.closest('[data-pick]');
  if (!li) return;
  e.preventDefault();
  pickPlayer(li.dataset.key, +li.dataset.pick);
});

document.addEventListener('input', e => {
  if (e.target.dataset.search != null) { const key = e.target.dataset.search; const ui = searchUI.get(key) || {}; ui.sel = 0; searchUI.set(key, ui); updateDropdown(key); }
});

document.addEventListener('input', e => {
  if (!e.target.matches?.('[data-pname]')) return;
  if (!profile) profile = newProfile('');
  profile.name = e.target.value.trim();
  saveProfile();
  const av = document.getElementById('pp-av'); if (av) av.textContent = profile.name ? initialsOf(profile.name) : '?';
  renderHeader();
  if (state.view === 'home') renderHome();
});
document.addEventListener('keydown', e => {
  const inp = e.target;
  if (inp.matches?.('[data-opp-name]')) { inp.setCustomValidity(''); if (e.key === 'Enter') { e.preventDefault(); oppSave(); } return; }
  if (inp.matches?.('[data-lt-name]')) { inp.setCustomValidity(''); if (e.key === 'Enter') { e.preventDefault(); ltSave(); } if (e.key === 'Escape') { state.ui.ltEdit = null; render(); } return; }
  if (inp.dataset?.search == null) return;
  const key = inp.dataset.search;
  const ui = searchUI.get(key);
  if (!ui || !ui.results) return;
  const n = ui.results.length;
  if (e.key === 'ArrowDown' && n) { e.preventDefault(); ui.sel = (ui.sel + 1) % n; updateDropdown(key); }
  else if (e.key === 'ArrowUp' && n) { e.preventDefault(); ui.sel = (ui.sel - 1 + n) % n; updateDropdown(key); }
  else if (e.key === 'Enter' && n) { e.preventDefault(); pickPlayer(key, ui.results[ui.sel].id); }
  else if (e.key === 'Escape') { inp.value = ''; ui.query = ''; updateDropdown(key); }
});

document.addEventListener('focusout', e => {
  if (e.target.dataset?.search == null) return;
  const dd = document.getElementById(`dd-${e.target.dataset.search}`);
  setTimeout(() => { if (document.activeElement !== e.target && dd) dd.hidden = true; }, 120);
});
document.addEventListener('focusin', e => { if (e.target.dataset?.search != null) updateDropdown(e.target.dataset.search); });
// split prikaz: timovi su uvek otvoreni, klik na zaglavlje ih ne sklapa
document.addEventListener('click', e => {
  if (isSplit() && e.target.closest('#rosters summary') && !e.target.closest('select')) e.preventDefault();
}, true);
// otvoreno/zatvoreno stanje sklopivih sekcija
document.addEventListener('toggle', e => {
  const f = e.target.dataset?.fold;
  if (f === 'my') { state.ui.myOpen = e.target.open; saveUI(); }
  if (f === 'opp') { state.ui.oppOpen = e.target.open; saveUI(); }
  if (f === 'hist') { state.histOpen = e.target.open; }
}, true);
document.addEventListener('change', e => {
  if (e.target.matches('[data-spot-sel]')) { setSpotMode(e.target.value); render(); return; }
  if (e.target.matches('[data-langsel]')) {
    const inModal = !!e.target.closest('#modal');
    setLang(e.target.value);
    if (inModal) openProfile();
    return;
  }
  if (e.target.matches('[data-tf-opp]')) { const lg = currentLeague(); if (lg) { if (e.target.value) state.tf.oppBy[lg.id] = e.target.value; else delete state.tf.oppBy[lg.id]; tfStop(); state.tf.res = null; state.tf.resKey = null; const all = tfSessAll(); if (all.last) { all.last[lg.id] = e.target.value || null; tfSessPut(all); } render(); } return; }
  if (e.target.matches('[data-opp-select]')) {
    const v = e.target.value;
    if (v === '__new') { state.ui.oppEdit = 'new'; }
    else { state.rosters.oppSel = v || null; state.ui.oppEdit = null; saveRosters(); }
    state.balance.opp = { drops: [], waivers: [] }; saveBalance();
    state.ui.oppOpen = true; saveUI();
    render();
    if (v === '__new') document.querySelector('[data-opp-name]')?.focus();
    return;
  }
  const k = e.target.dataset?.drop;
  if (k == null) return;
  const d = state.balance[k].drops;
  d[+e.target.dataset.idx] = e.target.value ? +e.target.value : null;
  state.balance[k].drops = d.filter(Boolean);
  saveBalance(); render();
});
if (!EMBED?.mini) window.addEventListener('hashchange', applyRoute); // i na /trade-analyzer/: link nalepljen u isti tab

/* ---------- Klik na zaglavlje roster tabele: sortiranje (ⓘ kod MIN samo otvara objašnjenje) ---------- */
document.addEventListener('click', e => {
  const th = e.target.closest('th[data-sort]');
  if (!th || e.target.closest('[data-tip]')) return;
  clickSort(th.dataset.skind, th.dataset.sort);
});

/* ---------- Pomeranje igrača u rosteru (≡): miš i dodir ---------- */
let drag = null;
function clearDropMarks() { document.querySelectorAll('.drop-before,.drop-after').forEach(x => x.classList.remove('drop-before', 'drop-after')); }
document.addEventListener('pointerdown', e => {
  const h = e.target.closest('[data-drag]');
  if (!h) return;
  e.preventDefault();
  const row = h.closest('tr');
  drag = { kind: row.dataset.rkind, id: +row.dataset.rid, ir: row.dataset.rir, row, target: null, before: true, pointerId: e.pointerId };
  row.classList.add('dragging');
  document.body.classList.add('is-dragging');
});
document.addEventListener('pointermove', e => {
  if (!drag || e.pointerId !== drag.pointerId) return;
  e.preventDefault();
  // automatsko skrolovanje kad je prst/miš blizu ivice ekrana
  if (e.clientY < 70) scrollBy(0, -12); else if (e.clientY > innerHeight - 70) scrollBy(0, 12);
  const el = document.elementFromPoint(e.clientX, e.clientY)?.closest('tr[data-rid]');
  clearDropMarks();
  drag.target = null;
  if (!el || el === drag.row || el.dataset.rkind !== drag.kind || el.dataset.rir !== drag.ir) return; // samo unutar iste grupe (aktivni / IR)
  const r = el.getBoundingClientRect();
  drag.before = e.clientY < r.top + r.height / 2;
  drag.target = +el.dataset.rid;
  el.classList.add(drag.before ? 'drop-before' : 'drop-after');
}, { passive: false });
function endDrag() {
  if (!drag) return;
  const d = drag; drag = null;
  d.row.classList.remove('dragging'); document.body.classList.remove('is-dragging'); clearDropMarks();
  if (d.target == null) return;
  freezeSort(d.kind); // ručno pomeranje: prikazani redosled ostaje, strelica sa zaglavlja nestaje
  const r = rosterOf(d.kind);
  const from = r.players.findIndex(x => x.id === d.id);
  if (from < 0) return;
  const [moved] = r.players.splice(from, 1);
  let to = r.players.findIndex(x => x.id === d.target);
  if (!d.before) to++;
  r.players.splice(to, 0, moved);
  saveRosters(); // redosled je deo rostera; datum "Ažurirano" se ne menja zbog premeštanja
  render();
}
document.addEventListener('pointerup', endDrag);
document.addEventListener('pointercancel', endDrag);

/* ---------- Redosled kolona: prevlačenje zaglavlja levo/desno (miš: povuci; dodir: zadrži pa povuci) ---------- */
let colDrag = null, colSwallow = 0;
const clearColMarks = () => document.querySelectorAll('.col-drop-before,.col-drop-after').forEach(x => x.classList.remove('col-drop-before', 'col-drop-after'));
function stopColDrag() {
  if (!colDrag) return;
  clearTimeout(colDrag.timer);
  colDrag.th.classList.remove('col-dragging'); document.body.classList.remove('is-coldrag'); clearColMarks();
  colDrag = null;
}
function startColDrag() {
  colDrag.on = true;
  colDrag.th.classList.add('col-dragging'); document.body.classList.add('is-coldrag');
  hideTip();
  if (colDrag.touch) navigator.vibrate?.(15);
}
document.addEventListener('pointerdown', e => {
  const th = e.target.closest('th[data-col]');
  if (!th || e.button > 0 || e.target.closest('[data-tip]')) return;
  stopColDrag();
  colDrag = { th, key: th.dataset.col, x: e.clientX, y: e.clientY, id: e.pointerId, touch: e.pointerType !== 'mouse', on: false, target: null, before: true };
  if (colDrag.touch) colDrag.timer = setTimeout(() => { if (colDrag && !colDrag.on) startColDrag(); }, 450);
});
document.addEventListener('pointermove', e => {
  if (!colDrag || e.pointerId !== colDrag.id) return;
  if (!colDrag.on) {
    const dx = e.clientX - colDrag.x, dy = e.clientY - colDrag.y;
    if (Math.hypot(dx, dy) < 8) return;
    // dodir pre dugog pritiska = skrolovanje tabele; miš uspravno = nije prevlačenje
    if (colDrag.touch || Math.abs(dx) < Math.abs(dy)) { stopColDrag(); return; }
    startColDrag();
  }
  e.preventDefault();
  const tr = colDrag.th.parentElement;
  const sc = tr.closest('.tscroll');
  if (sc) { const r = sc.getBoundingClientRect(); if (e.clientX < r.left + 30) sc.scrollLeft -= 10; else if (e.clientX > r.right - 30) sc.scrollLeft += 10; }
  // kolona ispod pokazivača (po x, i kad je prst ispod zaglavlja)
  const el = [...tr.querySelectorAll('th[data-col]')].find(x => { const r = x.getBoundingClientRect(); return e.clientX >= r.left && e.clientX < r.right; });
  clearColMarks(); colDrag.target = null;
  if (!el || el === colDrag.th) return;
  const r = el.getBoundingClientRect();
  colDrag.before = e.clientX < r.left + r.width / 2;
  colDrag.target = el.dataset.col;
  el.classList.add(colDrag.before ? 'col-drop-before' : 'col-drop-after');
}, { passive: false });
// dodir: dok traje prevlačenje kolone stranica se ne skroluje, a dugi pritisak ne otvara meni
document.addEventListener('touchmove', e => { if (colDrag?.on) e.preventDefault(); }, { passive: false });
document.addEventListener('contextmenu', e => { if (colDrag) e.preventDefault(); });
function endColDrag(e) {
  if (!colDrag || e.pointerId !== colDrag.id) return;
  const d = colDrag; stopColDrag();
  if (!d.on) return;
  colSwallow = Date.now() + 500; // klik posle prevlačenja ne sortira i ne gasi kategoriju
  if (!d.target) return;
  const keys = CATS.filter(c => !c.fpts).map(c => c.key).filter(k => k !== d.key);
  keys.splice(keys.indexOf(d.target) + (d.before ? 0 : 1), 0, d.key);
  setCols(keys);
  render();
  if (customCols()) toast(t('Redosled kolona je sačuvan samo za ovu ligu. Podrazumevani redosled vraćaš u podešavanjima lige.'));
}
/** Kratka poruka dole na ekranu (nestaje sama) */
let toastTimer = 0;
function toast(msg, ms = 4500, action = null) {
  let el = document.getElementById('toast');
  if (!el) { el = Object.assign(document.createElement('div'), { id: 'toast', role: 'status' }); document.body.appendChild(el); }
  el.textContent = msg;
  if (action) {
    const b = Object.assign(document.createElement('button'), { type: 'button', className: 'toast-act', textContent: action.label });
    b.addEventListener('click', () => { el.classList.remove('on'); action.on(); });
    el.append(' ', b);
  }
  el.classList.add('on');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('on'), ms);
}
document.addEventListener('pointerup', endColDrag);
document.addEventListener('pointercancel', e => { if (colDrag && e.pointerId === colDrag.id && !colDrag.on) stopColDrag(); else endColDrag(e); });
document.addEventListener('click', e => {
  if (Date.now() < colSwallow && e.target.closest('th')) { colSwallow = 0; e.stopImmediatePropagation(); e.preventDefault(); }
}, true);

/* ---------- Tooltip: hover na desktopu, tap na telefonu ([data-tip]) ---------- */
const tipEl = Object.assign(document.createElement('div'), { id: 'tip', hidden: true });
document.body.appendChild(tipEl);
let tipOwner = null;
function showTip(el) {
  tipOwner = el;
  if (el.dataset.tipHtml) tipEl.innerHTML = el.dataset.tipHtml; else tipEl.textContent = el.dataset.tip;
  tipEl.hidden = false;
  tipEl.style.left = '0px'; tipEl.style.top = '0px'; // meri punu širinu, pa tek onda postavi
  const r = el.getBoundingClientRect(), t = tipEl.getBoundingClientRect();
  const left = Math.max(8, Math.min(r.left + r.width / 2 - t.width / 2, innerWidth - t.width - 8));
  let top = r.top - t.height - 6 < 8 ? r.bottom + 6 : r.top - t.height - 6;
  top = Math.max(8, Math.min(top, innerHeight - t.height - 8)); // nikad van ekrana
  tipEl.style.left = `${left}px`; tipEl.style.top = `${top}px`;
}
const hideTip = () => { tipEl.hidden = true; tipOwner = null; };
const canHover = () => matchMedia('(hover: hover)').matches;
document.addEventListener('click', e => {
  const el = e.target.closest('[data-tip]');
  // Na touch uređaju drugi tap na isti element zatvara; na desktopu hover već prikazuje.
  if (el && (el !== tipOwner || canHover())) showTip(el); else hideTip();
}, true);
document.addEventListener('mouseover', e => {
  if (!canHover()) return;
  const el = e.target.closest('[data-tip]');
  if (el) showTip(el); else if (tipOwner) hideTip();
});
addEventListener('scroll', hideTip, { passive: true });

/* ===================================================================== */
/* Pokretanje: migracija starih podataka, pa poslednja korišćena liga */
// formati lige: postojeće lige dobijaju 9-cat H2H, svaka liga se proverava (i posle uvoza kopije)
if (profile?.leagues?.length) {
  let changed = false;
  for (const lg of profile.leagues) {
    const f = leagueFormatOf(lg); if (JSON.stringify(f) !== JSON.stringify(lg.leagueFormat)) { lg.leagueFormat = f; changed = true; }
    if (normalizeImport(lg)) changed = true; // uvezene lige sačuvane pre zajedničkog modela
  }
  if (changed) saveProfile();
}
if (!profile || profile.schema !== SCHEMA_VERSION) {
  if (profile && profile.schema !== SCHEMA_VERSION) profile.schema = SCHEMA_VERSION; // buduće migracije šeme idu ovde
  migrateLegacy();
}
if (!EMBED) backupBeforeNav();
applyStaticText();
if (EMBED?.mini) {
  /** Mini poređenje na početnoj: ista pretraga i isto računanje kao alat, bez prikaza alata */
  window.RSMini = {
    ready: () => state.players.length > 0,
    error: () => (state.players.length ? null : state.error),
    search: (q, taken = []) => searchResults(q, new Set(taken)).slice(0, 6).map(p => ({ id: p.id, name: p.name, team: p.team, pos: posTxt(p) })),
    name: id => state.byId.get(id)?.name || '',
    labels: () => CATS.map(c => c.label),
    /** Javna lista u usponu (stranica Pojačanja sa FA): ESPN vlasništvo ispod praga, najveći rast prvi */
    rising: () => publicRising(state.players).map(p => ({ id: p.id, name: p.name, team: p.team, pos: posTxt(p), ini: initials(p.name), img: CONFIG.HEADSHOT_URL(p.id),
      pct: p.own.pct, chg: p.own.chg, minSeason: statOf(p, 'season')?.MIN ?? null, minRecent: statOf(p, 'l7')?.MIN ?? null })),
    openPlayer: id => openPlayerModal(id),
    /** Igrač za karticu: slika, tim, pozicija i 9 kategorija (već formatirano) */
    player(id) {
      const p = state.byId.get(id); if (!p) return null;
      const l = playerLine(p);
      return { id, name: p.name, team: p.team, pos: posTxt(p), ini: initials(p.name), img: CONFIG.HEADSHOT_URL(id),
        min: l ? fmt1(l.MIN) : '-',
        vals: CATS.map(c => (!l ? '-' : c.type === 'pct' ? fmtPct(l[c.att] > 0 ? l[c.made] / l[c.att] : null) : fmt1(l[c.key]))) };
    },
    score(give, get) {
      const totals = [sumPlayers(give), sumPlayers(get)], cmp = compare(totals);
      if (cmp.active.length < 2) return null;
      const f = (c, v) => (c.type === 'pct' ? fmtPct(v) : fmt1(v));
      return {
        get: cmp.score[GET], give: cmp.score[GIVE], ties: cmp.ties,
        cats: CATS.map(c => ({ label: c.label, res: cmp.cats[c.key].winner == null ? 0 : cmp.cats[c.key].winner === GET ? 1 : -1,
          give: f(c, totals[GIVE].vals[c.key]), getv: f(c, totals[GET].vals[c.key]), delta: myDeltaText(c, totals) })),
      };
    },
  };
} else applyRoute();
loadPlayers();
if (!EMBED?.mini || EMBED.rising) loadSchedule(); // javna lista u usponu: raspored za profil igrača
