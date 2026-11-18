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
    PLAYER_LIMIT: 600,
    // filterStatsForSplitTypeIds [0..3] izbacuje split 5 (po utakmicama), a ExternalIds
    // ostavlja samo prošlu i tekuću sezonu. Payload: ~24 MB -> ~0,6 MB (gzip).
    FILTER: {
      players: {
        limit: 600,
        sortPercOwned: { sortPriority: 1, sortAsc: false },
        filterStatsForSplitTypeIds: { value: [0, 1, 2, 3] },
        filterStatsForExternalIds: { value: [SEASON - 1, SEASON] },
      },
    },
    // Raspored NBA timova (datumi utakmica). Javan, CORS radi.
    SCHEDULE_URL: `https://lm-api-reads.fantasy.espn.com/apis/v3/games/fba/seasons/${SEASON}?view=proTeamSchedules_wl`,
    SCHEDULE_CACHE_KEY: `fbaTrade.schedule.v1.${SEASON}`,
    // Utakmica se računa kao odigrana kad prođe ovoliko od početka (izbegava utakmice u toku).
    GAME_DONE_AFTER_MS: 3.5 * 60 * 60 * 1000,
    PREV_SEASON_GAMES: 82,
    FETCH_TIMEOUT_MS: 25000,
    SLOW_NOTICE_MS: 5000,
    CACHE_KEY: `fbaTrade.players.v5.${SEASON}`, // v5: + statistike za druge formate (OREB, DREB, 3PA, PF, GS, DD, TD); u projekciji ih nema (null)
    OLD_CACHE_KEYS: [`fbaTrade.players.v2.${SEASON}`, `fbaTrade.players.v3.${SEASON}`, `fbaTrade.players.v4.${SEASON}`],
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
    GAMELOG_FILTER: ids => ({ players: { filterIds: { value: ids }, filterStatsForSplitTypeIds: { value: [5] } } }),
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
};
/** Statistike kojih nema u ESPN projekciji (provereno: 0 kod svih 348 igrača sa projekcijom) */
const NO_PROJ_KEYS = ['OREB', 'DREB', 'PF', 'GS', 'DD', 'TD'];
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
const isOut = p => ['OUT', 'INJURY_RESERVE', 'SUSPENSION'].includes(p.inj);
const canIR = p => (p.slots || []).includes(IR_SLOT) && IR_STATUSES.includes(p.inj);

/** defaultPositionId -> pozicija */
const POSITIONS = { 1: 'PG', 2: 'SG', 3: 'SF', 4: 'PF', 5: 'C' };

/** injuryStatus -> kratka oznaka (ACTIVE/NORMAL se ne prikazuju) */
const INJURY = {
  DAY_TO_DAY: { short: 'DTD', cls: 'dtd' }, QUESTIONABLE: { short: 'Q', cls: 'dtd' }, PROBABLE: { short: 'P', cls: 'dtd' },
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
const DEFAULT_FORMAT = Object.freeze({ scoringType: 'h2h_each', categories: FORMAT_PRESETS['9cat'].categories, weights: {}, preset: '9cat', source: 'manual', unsupported: [] });
const FORMAT_LIMITS = { MIN_CATS: 2, MAX_UNSUPPORTED: 20, UNSUPPORTED_LEN: 40, MAX_WEIGHT: 100 };

const sameWeights = (a, b) => { const ka = Object.keys(a), kb = Object.keys(b); return ka.length === kb.length && ka.every(k => b[k] === a[k]); };

/**
 * Proveri i normalizuj leagueFormat (ručni unos, uvoz, stari podaci). Uvek vraća ispravan objekat:
 * nepoznate statistike iz kategorija i težina se izbacuju, preset se proverava prema sadržaju
 * (ako se ne poklapa, postaje "custom"), a kad nešto ne može da se popravi, vraća 9-cat H2H.
 */
function normalizeFormat(raw) {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_FORMAT, categories: [...DEFAULT_FORMAT.categories], weights: {}, unsupported: [] };
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
    const weights = {};
    for (const [k, v] of Object.entries(raw.weights && typeof raw.weights === 'object' ? raw.weights : {})) {
      const n = +v;
      if (STAT_BY_ID.get(k)?.type === 'sum' && Number.isFinite(n) && n !== 0 && Math.abs(n) <= FORMAT_LIMITS.MAX_WEIGHT) weights[k] = Math.round(n * 100) / 100;
    }
    if (!Object.keys(weights).length) { const preset = presetIn || 'espn_points'; return { scoringType, categories: [], weights: { ...FORMAT_PRESETS[preset].weights }, preset, source, unsupported }; }
    const preset = presetIn && sameWeights(weights, FORMAT_PRESETS[presetIn].weights) ? presetIn : presetHit(x => sameWeights(weights, x.weights));
    return { scoringType, categories: [], weights, preset, source, unsupported };
  }
  const cats = [...new Set((Array.isArray(raw.categories) ? raw.categories : []).filter(id => STAT_BY_ID.has(id)))];
  if (cats.length < FORMAT_LIMITS.MIN_CATS) { const preset = presetIn || '9cat'; return { scoringType, categories: [...FORMAT_PRESETS[preset].categories], weights: {}, preset, source, unsupported }; }
  const same = x => x.categories.length === cats.length && x.categories.every(id => cats.includes(id));
  const preset = presetIn && same(FORMAT_PRESETS[presetIn]) ? presetIn : presetHit(same);
  return { scoringType, categories: cats, weights: {}, preset, source, unsupported }; // redosled ostaje kako je zadat
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
  return isPointsType(x.scoringType) ? `${code}.c.${Object.entries(x.weights).map(([k, v]) => `${k}_${v}`).join(',')}` : `${code}.c.${x.categories.join(',')}`;
}
/** Iz linka u format; neispravan zapis -> null (link bez formata) */
function decodeFormat(str) {
  const parts = String(str || '').split('.');
  const scoringType = Object.keys(FORMAT_CODES).find(k => FORMAT_CODES[k] === parts[0]);
  if (!scoringType || !parts[1]) return null;
  if (parts[1] !== 'c') return FORMAT_PRESETS[parts[1]] && FORMAT_PRESETS[parts[1]].kind === (isPointsType(scoringType) ? 'points' : 'cat') ? normalizeFormat({ scoringType, preset: parts[1] }) : null;
  const items = parts.slice(2).join('.').split(',').filter(Boolean);
  if (isPointsType(scoringType)) {
    const weights = Object.fromEntries(items.map(it => { const i = it.lastIndexOf('_'); return [it.slice(0, i), +it.slice(i + 1)]; }));
    return Object.keys(weights).length ? normalizeFormat({ scoringType, preset: 'custom', weights }) : null;
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
const ESPN_OTHER_STATS = { 7: 'Ejections', 8: 'Flagrant fouls', 10: 'Technical fouls', 12: 'Disqualifications', 22: 'Adjusted FG%', 39: 'Quadruple-doubles' };
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
    } else if (!categories.includes(id)) categories.push(id);
  }
  const format = normalizeFormat({ scoringType, categories, weights, preset: 'custom', source: 'import:espn', unsupported });
  return { format, error: null };
}
/* ---------- Sleeper: scoring_settings -> leagueFormat (Sleeper košarka je samo na poene, H2H) ----------
   Ključevi provereni na api.sleeper.app/v1/stats/nba (isti nazivi kao u scoring_settings). */
const SLEEPER_STAT = { pts: 'PTS', reb: 'REB', oreb: 'OREB', dreb: 'DREB', ast: 'AST', stl: 'STL', blk: 'BLK', to: 'TO', tpm: 'TPM', tpa: 'TPA', fgm: 'FGM', fga: 'FGA', ftm: 'FTM', fta: 'FTA', pf: 'PF', dd: 'DD', td: 'TD', gs: 'GS', min: 'MIN' };
/** Zbirne stavke (npr. pts_reb_ast) = ista težina za svaku statistiku; promašaji = pokušaj − pogodak */
const SLEEPER_COMBO = { pts_reb: ['PTS', 'REB'], pts_ast: ['PTS', 'AST'], reb_ast: ['REB', 'AST'], pts_reb_ast: ['PTS', 'REB', 'AST'], blk_stl: ['BLK', 'STL'] };
const SLEEPER_MISSED = { fgmi: ['FGM', 'FGA'], ftmi: ['FTM', 'FTA'], tpmi: ['TPM', 'TPA'] };
const SLEEPER_OTHER = { tf: 'Technical fouls', ff: 'Flagrant fouls', bonus_pt_40p: '40+ points bonus', bonus_pt_50p: '50+ points bonus', bonus_reb_20p: '20+ rebounds bonus', bonus_ast_15p: '15+ assists bonus' };
function mapSleeperFormat(sc) {
  if (!sc || typeof sc !== 'object') return { format: null, error: 'empty' };
  const weights = {}, unsupported = [];
  const add = (id, w) => { weights[id] = Math.round(((weights[id] || 0) + w) * 1000) / 1000; };
  for (const [k, v] of Object.entries(sc)) {
    const w = +v;
    if (!w) continue;
    if (SLEEPER_STAT[k]) add(SLEEPER_STAT[k], w);
    else if (SLEEPER_COMBO[k]) SLEEPER_COMBO[k].forEach(id => add(id, w));
    else if (SLEEPER_MISSED[k]) { add(SLEEPER_MISSED[k][1], w); add(SLEEPER_MISSED[k][0], -w); }
    else unsupported.push(SLEEPER_OTHER[k] || `Sleeper: ${k}`);
  }
  for (const k of Object.keys(weights)) if (!weights[k]) delete weights[k];
  if (!Object.keys(weights).length) return { format: null, error: 'empty' };
  return { format: normalizeFormat({ scoringType: 'h2h_points', categories: [], weights, preset: 'custom', source: 'import:sleeper', unsupported }), error: null };
}
/** Format lige (uvek ispravan); bez lige (brzo poređenje) za sada 9-cat H2H */
const leagueFormatOf = lg => (lg ? normalizeFormat(lg.leagueFormat || legacyFormat()) : normalizeFormat(null));

/* ---------- Modul formata: zajednički interfejs za sve prikaze ----------
   columns(): kolone za prikaz igrača (CATS)            compareSides(totals): rezultat poređenja
   summary(res): tekst i brojke za rezultat na vrhu       teamTotals(ids): zbir tima
   playerValue(p): vrednost igrača (FPts kod poena; z-score kod kategorija dolazi u fazi 4)
   Kategorije i poeni su dve implementacije (FMT_CAT, FMT_PTS); FMT() vraća onu za aktivni format. */
function catFromStat(id, w = null) {
  const x = STAT_BY_ID.get(id);
  return {
    key: id, label: x.label, type: x.type === 'ratio' ? 'pct' : 'sum', made: x.num, att: x.den, ratio: id === 'ATO',
    lowerIsBetter: w != null ? w < 0 : x.dir === 'low', lowVol: x.lowVol || 0, noProj: x.proj === false || NO_PROJ_KEYS.includes(x.num) || NO_PROJ_KEYS.includes(x.den), w,
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
  CATS.length = 0; CATS.push(...list);
  // punt: samo kategorije koje postoje u formatu; u ligama na poene punta nema
  if (state.punt?.size) for (const k of [...state.punt]) if (isPointsType(f.scoringType) || !f.categories.includes(k)) state.punt.delete(k);
  return f;
}
const isPointsFmt = () => isPointsType(FMT_ACTIVE.scoringType);
/** Fantasy poeni po utakmici za jedan red statistike (null statistike, npr. DD u projekciji, ne donose poene) */
function fptsOf(line, weights = FMT_ACTIVE.weights) {
  if (!line) return null;
  let s = 0;
  for (const [k, w] of Object.entries(weights)) s += w * (line[k] ?? 0);
  return s;
}
/** Statistike sa težinom kojih nema u projekciji (za napomenu u periodu Projekcija) */
const projMissing = () => (state.period === 'proj' ? CATS.filter(c => c.noProj).map(c => c.label) : []);
/** Napomena "Ne računa se: ..." (statistike lige koje nemamo + one kojih nema u projekciji) */
function notCountedList() {
  return [...FMT_ACTIVE.unsupported, ...projMissing().map(l => t('{s} (nema u projekciji)', { s: l }))];
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
  "Analiza trejda": "Trade analysis",
  "Dodaj tim": "Add team",
  "Dodaj tim u Ligi": "Add a team in League",
  "Izaberi protivnika sa kojim trejduješ.": "Pick the opponent you are trading with.",
  "Još nema unetih timova. Dodaj ih na stranici Liga.": "No teams entered yet. Add them on the League page.",
  "Kad uneseš bar 3 tima (sa svojim), uz svaki tim vidiš dve najjače i dve najslabije kategorije.": "Once you enter at least 3 teams (yours included), each team shows its two strongest and two weakest categories.",
  "Kategorije mog tima": "My team categories",
  "Mesto i skor unosiš u podešavanjima lige.": "Enter your place and record in league settings.",
  "Mete za trejd": "Trade targets",
  "Moj tim ukratko": "My team at a glance",
  "Moje mesto": "My place",
  "Nazad na Pregled": "Back to Overview",
  "Nazad na Moj tim": "Back to My team",
  "Nazad na Ligu": "Back to League",
  "Nazad na Analizu trejda": "Back to Trade analysis",
  "Nađi bolji trejd sa ovim timom": "Find a better trade with this team",
  "Nađi mete za slabe kategorije": "Find targets for weak categories",
  "Nađi trejd za njega": "Find a trade for him",
  "Nađi zamenu": "Find a replacement",
  "Nema otvorenih trejdova.": "No open trades.",
  "Nema upozorenja za tvoje igrače.": "No alerts for your players.",
  "Opcije": "Options",
  "Otvoreni trejdovi": "Open trades",
  "Otvori u analizi": "Open in analysis",
  "Pogledaj kako tim sada stoji": "See how your team looks now",
  "Poslednji trejdovi": "Recent trades",
  "Počni od svog tima": "Start with your team",
  "Pregled": "Overview",
  "Pronađi trejd": "Find a trade",
  "Proširi na druge timove": "Search other teams",
  "Rang među {n} unetih timova. Zbir aktivnih igrača, {p}.": "Rank among {n} entered teams. Sum of active players, {p}.",
  "Roster protivnika": "Opponent roster",
  "Stranice lige": "League pages",
  "Sve lige": "All leagues",
  "Tabela lige": "Standings",
  "Trejduj ga": "Trade him",
  "Trejduj sa ovim timom": "Trade with this team",
  "Unesi igrače sa svog rostera ({a} aktivnih + {b} IR). Posle toga ovde vidiš kategorije tima, upozorenja i otvorene trejdove.": "Enter the players on your roster ({a} active + {b} IR). Then you will see your team categories, alerts and open trades here.",
  "Unesi još timova da vidiš gde si jak a gde slab": "Enter more teams to see where you are strong and weak",
  "Unesi svoj roster": "Enter your roster",
  "Uneto {a} od {b} timova": "{a} of {b} teams entered",
  "Upozorenja": "Alerts",
  "Svi alerti": "All alerts",
  "Otvori ovaj trejd u mojoj ligi": "Open this trade in my league",
  "U kojoj ligi da otvorim trejd?": "Which league should this trade open in?",
  "Trejd se otvara u novom tabu izabrane lige, sa istim stranama. Postojeći trejdovi ostaju netaknuti.": "The trade opens in a new tab of the chosen league, with the same sides. Your existing trades stay as they are.",
  "Svi alerti ({n})": "See all alerts ({n})",
  "Svi igrači sa tvog rostera, i oni na IR. Najnovije gore.": "All players on your roster, including IR. Newest first.",
  "Uredi roster": "Edit roster",
  "Uredi roster u Ligi": "Edit roster in League",
  "Zbir aktivnih igrača. Uneto {a} od {b} timova.": "Sum of active players. {a} of {b} teams entered.",
  "jak": "strong",
  "slab": "weak",
  "{n} je {s}, a IR mesto je slobodno.": "{n} is {s} and an IR spot is free.",
  "{n}. od {m}": "{n} of {m}",
  "{n}: minutaža pada, {a} → {b} min poslednjih 15 dana.": "{n}: minutes dropping, {a} → {b} min in the last 15 days.",
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
  "npr. tehničke greške, bonus za 40 poena": "e.g. technical fouls, 40-point bonus",
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
  'Liga je povezana sa platformom {p}. Naziv, timovi, roster mesta i tabela dolaze iz lige. Format bodovanja biraš ovde.': 'This league is linked to {p}. Name, teams, roster spots and standings come from the league. Choose the scoring format here.',
  'Yahoo liga se ne osvežava sama: rosteri, tabela i protivnici se ne povlače sa Yahoo-a. Posle svake promene u ligi ažuriraj timove ručno (Nalepi tim ponovo). Uskoro stiže verzija koja sve povlači automatski.': 'Yahoo leagues do not update on their own: rosters, standings and opponents are not pulled from Yahoo. After every change in your league, update the teams by hand (paste the team again). A version that pulls everything automatically is coming soon.',
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
  "Plasman u ligi po kategorijama": "League rank by category",
  "Zbir cele sezone iz {p}, svi timovi lige. FG% i FT% iz pogodaka i pokušaja.": "Season totals from {p}, all teams in the league. FG% and FT% from makes and attempts.",
  "U H2H ligi ovo je samo informativno: nedeljni mečevi se računaju posebno.": "In an H2H league this is for information only: weekly matchups are scored separately.",
  "Tim": "Team",
  "Procena plasmana u ligi posle trejda": "Estimated league rank after the trade",
  "Procena čeka raspored utakmica.": "The estimate is waiting for the game schedule.",
  "Procena": "Estimate",
  "Promena": "Change",
  "Procena: (Dobijaš − Daješ) po utakmici × preostale utakmice NBA timova, dodato na zbir tvog tima iz {p}. Ostali timovi ostaju isti. FG% i FT% se računaju iz pogodaka i pokušaja.": "Estimate: (You get − You give) per game × remaining games of the NBA teams, added to your team totals from {p}. Other teams stay the same. FG% and FT% are computed from makes and attempts.",
  "U H2H ligi ovo je samo informativno.": "In an H2H league this is for information only.",
  "Uskoro": "Soon",
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
        for (const g of list) games.set(g.id, { id: g.id, date: g.date });
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
  const d = iso => new Date(`${iso}T12:00:00Z`).toLocaleDateString(LOCALE(), { day: 'numeric', month: 'numeric', timeZone: 'UTC' });
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
  for (const p of players) p._n = norm(p.name);
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
  const m = first.match(/^league-([\w-]+?)(?:\/(\w+))?$/);
  if (!m) return null;
  // bez stranice: stari link sa trejdom vodi na Analizu, inače Pregled
  const page = m[2] && pageReady(m[2]) ? m[2] : new URLSearchParams(location.hash.slice(1)).has('t') ? 'trade' : 'overview';
  return { view: 'league', id: m[1], page };
}
/** Bez rute: poslednja liga; bez liga: početni ekran (ako profil postoji) ili brzo poređenje (novi korisnik) */
function defaultRoute() {
  const last = profile?.leagues.find(l => l.id === profile.lastLeagueId) || profile?.leagues[0];
  if (last) return { view: 'league', id: last.id };
  return profile ? { view: 'home' } : { view: 'quick' };
}
const routeToken = () => (state.view === 'home' ? 'home' : state.scope === 'quick' ? 'quick' : `league-${state.scope}/${state.page}`);

function applyRoute() {
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
}

/* =====================================================================
   Proračun
   ===================================================================== */
const currentStatId = () => PERIODS.find(p => p.key === state.period).statId(CONFIG.SEASON);

/** Statistika igrača za trenutni period ili null ako nema podataka (GP = 0). */
function playerLine(p) {
  const s = p?.stats[currentStatId()];
  return s && s.GP > 0 ? s : null;
}

/** Zbirovi tima (sve statistike iz kataloga koje se sabiraju) + FPts. Igrači bez podataka se ne računaju. */
const SUM_KEYS = STAT_CATALOG.filter(x => x.type === 'sum').map(x => x.id);
/** Statistika kojoj u ovom periodu nema podataka (npr. DD u projekciji) */
const noData = c => state.period === 'proj' && c.noProj;

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
function sumPlayers(plusIds, minusIds = [], lineOf = playerLine) {
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
  return { sum, vals: catValues(sum, counted || minusIds.length > 0), counted, missing };
}

/**
 * Slotovi za neravnomeran trejd, jedno pravilo za sva stanja rostera (kind: 'my' ili 'opp'):
 * - "Izbacuješ": kad strana dobija više igrača nego što daje; broj slotova = razlika u broju igrača
 * - "Waiver dodatak": kad daje više nego što dobija; broj = razlika; uvek opciono
 * Da li je "Izbacuješ" obavezan (roster bi imao više aktivnih nego što liga dozvoljava) računa rosterPlan.
 */
function slotPlan(kind) {
  const outSide = state.teams[KINDS[kind].out].ids, inSide = state.teams[KINDS[kind].in].ids;
  const both = outSide.length > 0 && inSide.length > 0;
  const dropSlots = both ? Math.max(0, inSide.length - outSide.length) : 0;
  const waiverSlots = both ? Math.max(0, outSide.length - inSide.length) : 0;
  const trade = takenIds(), bal = state.balance[kind];
  const onRoster = new Set(rosterIds(rosterOf(kind)));
  const drops = [...new Set(bal.drops)].filter(id => !trade.has(id)).slice(0, dropSlots);
  // waiver dodatak ne ulazi u rezultat trejda (tamo se računa koga protivnik izbacuje), samo u to kako se menja moj tim;
  // koga protivnik uzima sa waivera nije bitno (njegov tim), pa za 'opp' nema waivera
  const waivers = kind === 'opp' ? [] : [...new Set(bal.waivers)].filter(id => !trade.has(id) && !drops.includes(id) && !onRoster.has(id)).slice(0, waiverSlots);
  return { dropSlots, waiverSlots, drops, waivers };
}
const slotIds = (kind = 'my') => { const sp = slotPlan(kind); return [...sp.drops, ...sp.waivers]; };

/**
 * Zbir strane trejda: ko dobija više igrača, mora nekog da izbaci, i taj igrač se računa uz ono što ta strana daje.
 * Daješ = moji igrači + koga ja izbacujem; Dobijaš = njegovi igrači + koga on izbacuje.
 * (Tako se vidi koliko on stvarno dobija u odnosu na ono čega se odriče, tj. da li će pristati.)
 */
function teamTotals(team, ti) {
  const sp = slotPlan(ti === GIVE ? 'my' : 'opp');
  return sumPlayers([...team.ids, ...sp.drops]);
}

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
  const before = sumPlayers(plan.activeBefore).vals[c.key], after = sumPlayers(plan.activeAfter).vals[c.key];
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
      if (kBest !== kWorst && !zeroDiff) {
        const bestOnes = entries.filter(en => cmpKey(cat, en.v) === kBest);
        const worstOnes = entries.filter(en => cmpKey(cat, en.v) === kWorst);
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
  playerValue: () => null, // z-score igrača: faza 4
};
const FMT_PTS = {
  ...FMT_CAT,
  summary: res => (res.points ? { kind: 'pts', diff: res.points.diff, give: res.points.give, get: res.points.get } : null),
  playerValue: p => { const l = playerLine(p); return l ? fptsOf(l) : null; },
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
  document.body.classList.toggle('many-cats', CATS.length > 9);
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
  renderRosterSection('my');
  renderRosterSection('opp');
  renderHistory();
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
  // čip profila postoji i na Sve lige i u redu lige: popuni svaki (posle promene prikaza stari ostaje u skrivenom delu)
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
  const right = `<div class="wsh-r"><div class="seg" id="periods" role="group" aria-label="Period"></div>
    <button type="button" class="pchip" data-action="profile" id="pchip"></button>
    ${state.view === 'league' && lg ? `<button type="button" class="gear" data-action="league-settings" title="${esc(t('Podešavanja lige'))}" aria-label="${esc(t('Podešavanja lige'))}">⚙</button>` : ''}</div>`;
  if (state.view === 'league' && lg) {
    el.innerHTML = `<div class="wsh"><div class="wsh-t"><h1>${esc(lgName(lg))}</h1>
      <span class="pbadge${isSynced(lg) ? ' synced' : ''}">${esc(platformLabel(lg.platform))}</span>${syncChipHTML(lg)}<button type="button" class="fchip" data-action="league-settings" title="${esc(formatSummary(leagueFormatOf(lg)))}">${esc(formatShort(leagueFormatOf(lg)))}</button>${lg.teamName ? `<span class="wsh-team">${esc(lg.teamName)}</span>` : ''}</div>${right}</div>${importBarsHTML(lg)}`;
  } else {
    el.innerHTML = `<div class="wsh"><div class="wsh-t"><h1>${t('Brzo poređenje')}</h1>${quickFormatChipHTML()}</div>${right}</div>`;
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
  const hello = `<div class="hello-row"><h1 class="hello">${nm ? t('Zdravo, {n}', { n: esc(nm) }) : t('Zdravo')}</h1><button type="button" class="pchip" data-action="profile"></button></div>`;
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
const SLOT_RANGE = { active: [8, 20], ir: [0, 6] };
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
    ? `${t(info.sr)}, ${x.preset !== 'custom' ? t(FORMAT_PRESETS[x.preset].srLabel) : t('ručno bodovanje')}: ${Object.entries(x.weights).map(([k, v]) => `${lbl(k)} ${fmtNum(v)}`).join(', ')}`
    : `${t(info.sr)}, ${x.categories.length} ${plural(x.categories.length, ['kategorija', 'kategorije', 'kategorija'], ['category', 'categories'])}: ${x.categories.map(lbl).join(', ')}`;
  return `${body}.${x.unsupported.length ? ` ${t('Ne računa se: {list}.', { list: x.unsupported.join(', ') })}` : ''}`;
}

/** Radni format po komponenti (prefix): { f, platform, touched }. f nije normalizovan dok se ne sačuva. */
const fmtDrafts = new Map();
const WEIGHT_STATS = () => STAT_CATALOG.filter(x => x.type === 'sum');
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
        <ul class="fp-cats">${sel.map((id, i) => row(STAT_BY_ID.get(id), true, i)).join('')}${STAT_CATALOG.filter(x => !sel.includes(x.id)).map(x => row(x, false)).join('')}</ul>` : ''}</div>`;
  } else {
    const presets = ['espn_points', 'espn_points_classic', 'yahoo_points'].map(id => radio('preset', id, f.preset, esc(t(FORMAT_PRESETS[id].srLabel)))).join('') + radio('preset', 'custom', f.preset, esc(t('Svoje bodovanje')));
    detail = `<div class="fp-sub"><div class="fp-t">${t('Bodovanje')}</div>
      <div class="fp-presets">${presets}</div>
      ${!verifiedPoints(d.platform) && d.platform ? `<p class="hint">${t('Prepiši bodovanje iz podešavanja svoje lige.')}</p>` : ''}
      <div class="fp-weights">${WEIGHT_STATS().map(x => `<label title="${esc(LANG === 'en' ? x.en : x.sr)}"><span>${esc(x.label)}</span><input type="number" step="0.1" inputmode="decimal" data-fp-w="${x.id}" value="${f.weights[x.id] ?? ''}" placeholder="0"></label>`).join('')}</div>
      <p class="hint fp-check">${t('Proveri bodovanje u podešavanjima svoje lige, lige ga često menjaju.')}</p></div>`;
  }
  return `<legend>${t('Format lige')}</legend>
    <div class="fp-types">${types}</div>
    ${detail}
    <label class="fp-uns">${t('Liga boduje još nešto što nije na listi? (opciono)')}<input type="text" data-fp-uns maxlength="200" value="${esc(f.unsupported.join(', '))}" placeholder="${esc(t('npr. tehničke greške, bonus za 40 poena'))}">
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
  if (isPointsType(d.f.scoringType) && !d.touched) d.f = { ...clone(defaultFormatFor(platform, 'points')), scoringType: d.f.scoringType, unsupported: d.f.unsupported };
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
    if (pr !== 'custom') { d.f.preset = pr; if (isPointsType(d.f.scoringType)) d.f.weights = { ...FORMAT_PRESETS[pr].weights }; else d.f.categories = [...FORMAT_PRESETS[pr].categories]; }
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
    d.f.preset = hit ? hit[0] : 'custom';
    fpickEl(prefix).querySelectorAll('[data-fp-preset]').forEach(r => { r.checked = r.value === d.f.preset; });
    fpickSum(prefix);
  } else if (el.matches('[data-fp-uns]')) {
    d.f.unsupported = el.value.split(',').map(x => x.trim()).filter(Boolean);
    fpickSum(prefix);
  }
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
      <label>${t('Naziv mog tima')}<input type="text" id="ls-team" maxlength="40" value="${esc(lg.teamName || '')}" ${isSynced(lg) ? 'readonly' : ''}></label>
      <div class="form-row">
        <label>${t('Platforma')}<select id="ls-platform" ${isSynced(lg) ? 'disabled' : ''}>${PLATFORMS.map(p => `<option value="${p.id}" ${p.id === lg.platform ? 'selected' : ''}>${esc(platformLabel(p.id))}</option>`).join('')}</select></label>
        <label>${t('Broj timova')}<input type="number" id="ls-teams" min="2" max="30" value="${num(lg.teams)}" ${isSynced(lg) ? 'readonly' : ''}></label>
      </div>
      ${formatPickerHTML('ls', leagueFormatOf(lg), lg.platform)}
      ${isSynced(lg) ? `<fieldset class="plain" disabled>${slotsFieldHTML('ls', lg.slots)}</fieldset>` : slotsFieldHTML('ls', lg.slots)}
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
        teamState: v('ls-state') || null, note: v('ls-note').trim(),
        standings: { ...newSt, updated: changed ? nowISO() : st.updated || null },
      };
      const myTid = document.getElementById('ls-myteam')?.value;
      const apply = () => {
        Object.assign(lg, vals);
        if (isSynced(lg) && myTid) { const tm = lg.import.teams.find(x => String(x.tid) === myTid); if (tm) setMyImportTeam(lg, tm.tid); }
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
  TTL_MS: 10 * 60 * 1000,                 // pri otvaranju lige osveži ako je starije od ovoga (bez stalnog povlačenja)
  DEADLINE_WARN_DAYS: 7,
  EXTRAS_KEY: `fbaTrade.extras.v1.${CONFIG.SEASON}`, // igrači sa uvezenih rostera koji nisu u top 600
  EXTRAS_MAX: 500,
  NAMES_KEY: `fbaTrade.names.v1.${CONFIG.SEASON}`,   // svi aktivni igrači (ID, ime, tim) za prepoznavanje imena
  NAMES_TTL_MS: 24 * 60 * 60 * 1000,                 // najviše jednom dnevno
  NAMES_URL: `https://lm-api-reads.fantasy.espn.com/apis/v3/games/fba/seasons/${CONFIG.SEASON}/players?view=players_wl`,
  ESPN_URL: (id, season) => `https://lm-api-reads.fantasy.espn.com/apis/v3/games/fba/seasons/${season}/segments/0/leagues/${id}?view=mTeam&view=mRoster&view=mSettings&view=mStandings`,
  SLEEPER: 'https://api.sleeper.app/v1',
  SLEEPER_NAMES_KEY: 'fbaTrade.sleeperNames.v1',
  FANTRAX: 'https://www.fantrax.com/fxea/general',
  FANTRAX_NAMES_KEY: 'fbaTrade.fantraxNames.v1',
  FLAGS_KEY: 'rs.importFlags',            // {"sleeper":true,"fantrax":true} samo za testiranje (dok se ne potvrdi na pravoj ligi)
};
const importFlag = k => { try { return !!(JSON.parse(localStorage.getItem(IMPORT.FLAGS_KEY) || '{}') || {})[k]; } catch { return false; } };
const SYNC_SOURCES = ['espn', 'sleeper', 'fantrax'];
const SOURCE_LABEL = { espn: 'ESPN', sleeper: 'Sleeper', fantrax: 'Fantrax' };
const isSynced = (lg = currentLeague()) => !!lg?.import && SYNC_SOURCES.includes(lg.import.source);
const isPasted = (lg = currentLeague()) => lg?.import?.source === 'paste';
const rosterLocked = () => isSynced(currentLeague());
const lockText = (lg = currentLeague()) => (lg?.import?.source === 'espn' ? t('Roster se povlači iz ESPN-a') : t('Roster se povlači sa platforme {p}', { p: SOURCE_LABEL[lg?.import?.source] || '' }));
const syncBtnText = src => (src === 'espn' ? t('Osveži iz ESPN-a') : t('Osveži sa platforme {p}', { p: SOURCE_LABEL[src] || '' }));
/** Vodič za uvoz (javna stranica; otvara se u novom tabu da se ništa ne izgubi) */
const howtoUrl = anchor => `${LANG === 'sr' ? '../sr/how-to-import/' : '../how-to-import/'}${anchor ? `#${anchor}` : ''}`;
const howtoLink = (anchor, label) => `<a class="howto" href="${howtoUrl(anchor)}" target="_blank" rel="noopener">${label || t('Kako?')}</a>`;
const recTxt = r => (r ? `${r.w}-${r.l}${r.t ? `-${r.t}` : ''}` : '');
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
      players.push({ id: e.playerId, ir: e.lineupSlotId === IR_SLOT });
      if (e.playerPoolEntry?.player) raw.set(e.playerId, e.playerPoolEntry);
    }
    return {
      tid: tm.id, name: cleanName(tm.name || [tm.location, tm.nickname].filter(Boolean).join(' ')) || `Team ${tm.id}`, abbrev: cleanName(tm.abbrev).slice(0, 6),
      record: { w: +rec.wins || 0, l: +rec.losses || 0, t: +rec.ties || 0 }, seed: +tm.playoffSeed || null, pf: Math.round((+rec.pointsFor || 0) * 10) / 10,
      vals: espnTeamVals(tm.valuesByStat), players,
    };
  });
  const dl = +s.tradeSettings?.deadlineDate;
  return {
    source: 'espn', extId: String(extId), season, name: cleanName(s.name) || `ESPN ${extId}`, size: +s.size || teams.length,
    format: fmt.format, fmtError: fmt.error, slots: { active: Math.max(1, active) || ROSTER_DEFAULT.ACTIVE, ir },
    deadline: dl > 0 ? dl : null, playoffTeams: +s.scheduleSettings?.playoffTeamCount || null, teams, raw, scoringType: s.scoringSettings?.scoringType || null,
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
  return got.length;
}

/* ---------- Upis uvoza u ligu ---------- */
function applyImport(lg, parsed, myTid) {
  const now = nowISO();
  const me = parsed.teams.find(x => x.tid === myTid) || null;
  const ros = tm => ({ name: tm.name, players: tm.players.map(x => ({ ...x })), updated: now });
  lg.import = {
    source: parsed.source, extId: parsed.extId, season: parsed.season, syncedAt: now, error: null, myTid: me ? me.tid : null,
    deadline: parsed.deadline, playoffTeams: parsed.playoffTeams, playoffWeek: parsed.playoffWeek || null, week: parsed.week || null,
    teams: parsed.teams.map(({ players, ...x }) => x),
  };
  lg.teamState = null; // stanje tima se računa iz plasmana u ligi
  const clampN = (v, [a, b]) => Math.max(a, Math.min(b, Math.round(+v) || a));
  lg.name = parsed.name || lg.name;
  lg.platform = parsed.source; lg.externalLeagueId = parsed.extId; lg.teams = Math.max(2, Math.min(30, parsed.size || 12));
  lg.slots = { active: clampN(parsed.slots.active, SLOT_RANGE.active), ir: clampN(parsed.slots.ir, SLOT_RANGE.ir) };
  lg.roster = me ? ros(me) : emptyRoster('Moj tim');
  lg.opps = Object.fromEntries(parsed.teams.filter(x => x !== me).map(x => [`e${x.tid}`, ros(x)]));
  if (!lg.opps[lg.oppSel]) lg.oppSel = null;
  if (me) lg.teamName = me.name;
  lg.standings = { rank: me?.seed || null, record: me ? recTxt(me.record) : '', playoffTeams: parsed.playoffTeams || null, playoffWeek: parsed.playoffWeek || null, updated: now };
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
  lg.standings = { ...(lg.standings || {}), rank: tm.seed || null, record: recTxt(tm.record) };
  if (currentLeague() === lg) state.rosters = { my: lg.roster, opps: lg.opps, oppSel: lg.oppSel };
  touchLeague(lg); saveProfile();
}

/* ---------- Sinhronizacija (bez stalnog povlačenja: pri otvaranju ako je starije od 10 min, ili dugmetom) ---------- */
state.syncing = null;
state.syncTried = {};
async function fetchImport(src, q) {
  if (src === 'espn') return parseEspnLeague(await fetchEspnLeague(q.extId, q.season), q.extId, q.season);
  if (src === 'sleeper') return fetchSleeperLeague(q);
  if (src === 'fantrax') return fetchFantraxLeague(q);
  throw importErr('network');
}
async function syncLeague(lg, { auto = false } = {}) {
  if (!isSynced(lg) || state.syncing) return;
  state.syncing = lg.id; state.syncTried[lg.id] = Date.now();
  render();
  try {
    const imp = lg.import;
    const parsed = await fetchImport(imp.source, { extId: imp.extId, leagueId: imp.extId, season: imp.season });
    const oldF = leagueFormatOf(lg);
    // format iz platforme se osvežava samo dok ga korisnik nije ručno menjao
    if (parsed.format && leagueFormatOf(lg).source === `import:${parsed.source}` && !sameFormat(oldF, parsed.format)) { lg.leagueFormat = parsed.format; applyFormatChange(lg, oldF); }
    applyImport(lg, parsed, parsed.teams.some(x => x.tid === imp.myTid) ? imp.myTid : null);
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
function maybeAutoSync() {
  const lg = currentLeague();
  if (state.view !== 'league' || !isSynced(lg)) return;
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
const fmtDateTime = ms => new Date(ms).toLocaleString(LOCALE(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
function deadlineBarHTML(lg) {
  const dl = lg?.import?.deadline;
  if (!dl) return '';
  const ms = dl - Date.now();
  if (ms < 0) return `<div class="banner info dl-bar"><span>⏱ ${t('Rok za trejdove je prošao.')}</span></div>`;
  if (ms > IMPORT.DEADLINE_WARN_DAYS * 864e5) return '';
  const left = ms < 864e5 ? t('{n} h', { n: Math.max(1, Math.round(ms / 36e5)) }) : daysTxt(Math.ceil(ms / 864e5));
  return `<div class="banner warn dl-bar"><span>⏱ ${t('Rok za trejdove: {d} (još {n}).', { d: esc(fmtDateTime(dl)), n: left })}</span></div>`;
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
const importBarsHTML = lg => yahooBarHTML(lg) + (lg?.import && ['overview', 'trade'].includes(state.page) ? syncErrorBarHTML(lg) + deadlineBarHTML(lg) : '');

/* ---------- Plasman po kategorijama iz zbirova cele sezone (svi timovi lige) ---------- */
const rankCats = () => CATS.filter(c => !c.fpts && !isPunt(c));
function importRanks(lg = currentLeague()) {
  if (isPointsFmt() || lg?.import?.myTid == null) return null;
  const teams = (lg.import.teams || []).filter(x => x.vals);
  if (teams.length < 2 || !teams.some(x => x.tid === lg.import.myTid)) return null;
  const cats = rankCats();
  const mine = rotoRanks(teams.map(x => ({ id: x.tid, vals: x.vals })), cats)[lg.import.myTid] || {};
  const list = cats.filter(c => mine[c.key] != null).map(c => ({ c, rank: mine[c.key], of: teams.length }));
  return list.length ? list : null;
}
function importRanksHTML(lg = currentLeague()) {
  const ranks = importRanks(lg);
  if (!ranks) return '';
  const sw = strongWeak(ranks);
  const tag = c => (sw.strong.some(x => x.c === c) ? `<span class="slot-tag tag-in">${t('jak')}</span>` : sw.weak.some(x => x.c === c) ? `<span class="slot-tag tag-out">${t('slab')}</span>` : '');
  const h2h = FMT_ACTIVE.scoringType !== 'roto';
  return `<section class="pcard"><h3>${t('Plasman u ligi po kategorijama')}</h3>
    <div class="catgrid">${ranks.map(x => `<div class="catcell"><span class="cl">${x.c.label}</span><b>${t('{n}. od {m}', { n: x.rank, m: x.of })}</b>${tag(x.c)}</div>`).join('')}</div>
    <p class="pnote">${t('Zbir cele sezone iz {p}, svi timovi lige. FG% i FT% iz pogodaka i pokušaja.', { p: SOURCE_LABEL[lg.import.source] || '' })}${h2h ? ` ${t('U H2H ligi ovo je samo informativno: nedeljni mečevi se računaju posebno.')}` : ''}</p></section>`;
}
/** Tabela lige iz uvoza */
function standingsHTML(lg) {
  const list = [...(lg?.import?.teams || [])].sort((a, b) => (a.seed || 99) - (b.seed || 99));
  if (!list.length) return '';
  const pts = isPointsFmt();
  return `<div class="tscroll"><table class="stand"><thead><tr><th>#</th><th>${t('Tim')}</th><th>${t('Skor')}</th>${pts ? `<th>${t('Poeni')}</th>` : ''}</tr></thead><tbody>
    ${list.map(x => `<tr class="${x.tid === lg.import.myTid ? 'me' : ''}"><td>${x.seed || '–'}</td><td>${esc(x.name)}${x.abbrev ? ` <span class="hint">${esc(x.abbrev)}</span>` : ''}</td><td>${recTxt(x.record)}</td>${pts ? `<td>${fmtNum(x.pf)}</td>` : ''}</tr>`).join('')}
    </tbody></table></div>`;
}

/* ---------- Analiza: procena plasmana posle trejda (roto; u H2H samo informativno) ---------- */
const gamesLeft = tid => { const g = state.schedule?.[tid]; const done = gamesDone(tid); return g && done != null ? Math.max(0, g.length - done) : null; };
/** Procena plasmana posle trejda: [{ key, c, before, after }] ili null (nema uvoza, rasporeda ili trejda) */
function rankProjection(lg = currentLeague()) {
  if (!lg?.import?.teams?.length || isPointsFmt() || lg.import.myTid == null || !state.schedule) return null;
  const teams = lg.import.teams.filter(x => x.vals);
  if (teams.length < 2 || !teams.some(x => x.tid === lg.import.myTid) || (!giveIds().length && !getIds().length)) return null;
  const delta = {};
  const add = (id, sign) => {
    const p = state.byId.get(id), line = p && playerLine(p), g = p ? gamesLeft(p.tid) : null;
    if (!line || !g) return;
    for (const k of SUM_KEYS) if (line[k] != null) delta[k] = (delta[k] || 0) + sign * line[k] * g;
  };
  getIds().forEach(id => add(id, 1));
  giveIds().forEach(id => add(id, -1));
  const cats = rankCats();
  return rotoProjection(teams.map(x => ({ id: x.tid, vals: x.vals })), lg.import.myTid, delta, cats)
    .filter(x => x.before != null).map(x => ({ ...x, c: cats.find(y => y.key === x.key) }));
}
function rotoProjHTML() {
  const lg = currentLeague();
  if (!lg?.import?.teams?.length || isPointsFmt() || lg.import.myTid == null) return '';
  if (!lg.import.teams.some(x => x.vals && x.tid === lg.import.myTid) || (!giveIds().length && !getIds().length)) return '';
  const head = `<div class="section-t">${t('Procena plasmana u ligi posle trejda')}</div>`;
  if (!state.schedule) return `${head}<div class="card"><p class="pnote rp-note">${t('Procena čeka raspored utakmica.')}</p></div>`;
  const proj = rankProjection(lg) || [];
  const rows = proj.map(x => {
    const d = x.before - x.after, cls = d > 0 ? 'win' : d < 0 ? 'lose' : '';
    return `<tr><td>${x.c.label}</td><td>${x.before}.</td><td class="${cls}">${x.after}.</td><td class="${cls}">${d > 0 ? `▲ ${d}` : d < 0 ? `▼ ${-d}` : '='}</td></tr>`;
  }).join('');
  const h2h = FMT_ACTIVE.scoringType !== 'roto';
  return `${head}<div class="card"><div class="tscroll"><table class="cmp rproj"><thead><tr><th>${t('Kat.')}</th><th>${t('Sada')}</th><th>${t('Procena')}</th><th>${t('Promena')}</th></tr></thead><tbody>${rows}</tbody></table></div>
    <p class="pnote rp-note">${t('Procena: (Dobijaš − Daješ) po utakmici × preostale utakmice NBA timova, dodato na zbir tvog tima iz {p}. Ostali timovi ostaju isti. FG% i FT% se računaju iz pogodaka i pokušaja.', { p: SOURCE_LABEL[lg.import.source] || '' })}${h2h ? ` ${t('U H2H ligi ovo je samo informativno.')}` : ''}</p></div>`;
}

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
  const pos = tm => t('na {n}. mestu ({r})', { n: tm.seed || '?', r: recTxt(tm.record) });
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
      out.push(ch.length ? t('Procena plasmana posle trejda: {list}', { list: ch.map(x => `${x.c.label} ${x.before}. → ${x.after}.`).join(', ') }) : t('Procena plasmana posle trejda: plasman po kategorijama se ne menja.'));
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
  lines.push(...ctx.teams.map(x => `${x.seed || '-'}. ${x.name}${tag(x)} ${recTxt(x.record)}${ctx.pts ? ` · ${fmtNum(x.pf)}` : ''}`));
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
    if (proj) lines.push(`\n${L('Procena mog plasmana posle trejda (preostale utakmice, ostali timovi isti)', 'Estimated rank after the trade (remaining games, other teams unchanged)')}: ${proj.map(x => `${x.c.label} ${x.before}→${x.after}`).join(', ')}`);
  }
  return lines.join('\n');
}

/* ---------- Podešavanja uvezene lige: sve iz lige, menja se samo moj tim i napomena ---------- */
function openSyncedSettings(lg) {
  const imp = lg.import, f = leagueFormatOf(lg), st = lg.standings || {}, src = SOURCE_LABEL[imp.source];
  const fromLeague = f.source === `import:${imp.source}`; // Sleeper / Fantrax: format je izabran ručno pri uvozu
  const sit = teamSituation(lg);
  const season = /^\d{4}$/.test(String(imp.season)) && imp.source === 'espn' ? `${imp.season - 1}-${String(imp.season).slice(2)}` : String(imp.season || '');
  const row = (k, v) => (v == null || v === '' ? '' : `<div class="ro-row"><span>${k}</span><b>${v}</b></div>`);
  showModal({
    title: t('Podešavanja lige'), wide: true,
    body: `<div class="form">
      <div class="banner info ro-note"><span>🔗 ${fromLeague ? t('Liga je povezana sa platformom {p}. Naziv, timovi, format, roster mesta i tabela dolaze iz lige i menjaju se samo tamo.', { p: src }) : t('Liga je povezana sa platformom {p}. Naziv, timovi, roster mesta i tabela dolaze iz lige. Format bodovanja biraš ovde.', { p: src })}</span></div>
      <label>${t('Moj tim')}<select id="ls-myteam">${imp.myTid == null ? '<option value="">–</option>' : ''}${[...imp.teams].sort((a, b) => a.name.localeCompare(b.name)).map(x => `<option value="${esc(String(x.tid))}" ${x.tid === imp.myTid ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>
      <div class="ro-grid">
        ${row(t('Naziv lige'), esc(lgName(lg)))}
        ${row(t('Platforma'), esc(src))}
        ${row(t('Broj timova'), lg.teams)}
        ${fromLeague ? row(t('Format'), `<span title="${esc(formatSummary(f))}">${esc(formatShort(f))}</span>`) : ''}
        ${row(t('Roster'), t('{a} aktivnih + {b} IR', { a: lg.slots?.active, b: lg.slots?.ir ?? 0 }))}
        ${row(t('Mesto'), st.rank ? t('{n}. od {m}', { n: st.rank, m: lg.teams }) : '')}
        ${row(t('Skor'), esc(st.record || ''))}
        ${row(t('Timova u plejofu'), st.playoffTeams)}
        ${row(t('Nedelja plejofa'), st.playoffWeek)}
        ${row(t('Stanje mog tima'), sit ? `${esc(stateLabel(sit.state))} <span class="hint">${t('(iz plasmana)')}</span>` : '')}
        ${row(t('Liga na platformi'), `${esc(imp.extId)} · ${t('sezona {s}', { s: esc(season) })}`)}
        ${row(t('Poslednje osvežavanje'), imp.syncedAt ? esc(timeAgo(Date.parse(imp.syncedAt))) : '')}
      </div>
      ${fromLeague ? '' : formatPickerHTML('ls', f, lg.platform)}
      <label>${t('Napomena')}<textarea id="ls-note" rows="3" maxlength="500">${esc(lg.note || '')}</textarea></label>
      <div class="ls-sync"><button type="button" class="linkbtn" data-action="league-sync">↻ ${esc(syncBtnText(imp.source))}</button>
        <button type="button" class="linkbtn" data-action="league-unlink">⛓ ${t('Prekini vezu sa platformom {p}', { p: esc(src) })}</button></div>
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
    card({ id: 'sleeper', icon: 'SLP', title: t('Sleeper liga'), desc: t('Unesi korisničko ime ili ID lige.'), how: 'sleeper', beta: true }),
    card({ id: 'fantrax', icon: 'FTX', title: t('Fantrax javna liga'), desc: t('Unesi ID lige ili link ka ligi.'), how: 'fantrax', beta: true }),
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
  if (code === 'private') return src === 'espn'
    ? `${t('Ova liga je privatna. LM mora da je označi kao javnu.')} ${howtoLink('espn', t('Pogledaj kako'))}`
    : `${t('Ova liga nije javna. Komesar mora da uključi javni pregled lige.')} ${howtoLink(src, t('Pogledaj kako'))}`;
  if (code === 'notfound') return `${t('Liga nije pronađena. Proveri ID.')} ${IMPORTERS[src].idLink()}`;
  if (code === 'nouser') return t('Korisnik nije pronađen na Sleeperu. Proveri korisničko ime.');
  if (code === 'noleagues') return t('Ovaj korisnik nema NBA ligu na Sleeperu za ovu sezonu.');
  if (code === 'choose') return `${t('Ovaj korisnik ima više liga. Izaberi jednu:')}<div class="imp-pick">${(extra || []).map(l => `<button type="button" class="linkbtn" data-action="imp-pick-league" data-src="${src}" data-id="${esc(l.id)}">${esc(l.name)}</button>`).join('')}</div>`;
  return src === 'espn' ? t('ESPN trenutno ne odgovara, probaj ponovo.') : t('{p} trenutno ne odgovara, probaj ponovo.', { p });
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
  const missing = parsed.unmatched?.length ? `<p class="hint">${t('Nismo prepoznali {n} igrača sa rostera: {list}.', { n: parsed.unmatched.length, list: esc(parsed.unmatched.slice(0, 8).join(', ')) })}</p>` : '';
  showModal({
    title: t('Koji je tvoj tim?'), wide: true,
    body: `<p><b>${esc(parsed.name)}</b> · ${t('{n} timova', { n: parsed.size })}${f ? ` · ${esc(formatShort(f))}` : ''}</p>${unsup}${missing}
      ${f ? '' : `<p class="hint">${parsed.source === 'espn' ? t('Ne prepoznajemo format ove lige. Izaberi ga ručno.') : t('Izaberi format lige.')}</p>${formatPickerHTML('imp', defaultFormatFor(parsed.source, parsed.source === 'sleeper' ? 'points' : 'cat'), parsed.source)}`}
      <div class="imp-teams" role="radiogroup" aria-label="${esc(t('Koji je tvoj tim?'))}">${teams.map(x => `<label class="imp-team"><input type="radio" name="imp-team" value="${esc(String(x.tid))}">
        <span class="it-name">${esc(x.name)}</span><span class="it-meta">${esc([x.abbrev, recTxt(x.record), t('{n} igrača', { n: x.players.length })].filter(Boolean).join(' · '))}</span></label>`).join('')}</div>
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
async function sleeperNames() {
  const c = lsGet(IMPORT.SLEEPER_NAMES_KEY);
  if (c?.map && Date.now() - c.ts < IMPORT.NAMES_TTL_MS) return c.map;
  const data = await sleeperGet('/players/nba'); // ~2,5 MB, najviše jednom dnevno; čuva se samo ID -> ime
  const map = {};
  for (const [id, p] of Object.entries(data || {})) { const n = p?.full_name || [p?.first_name, p?.last_name].filter(Boolean).join(' '); if (n) map[id] = n; }
  lsSet(IMPORT.SLEEPER_NAMES_KEY, { ts: Date.now(), map });
  return map;
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
  const [names, pool] = await Promise.all([sleeperNames(), loadNamePool()]);
  const index = buildNameIndex(pool);
  // ime tima: team_name ili displayName (dozvoljeno); owner_id se ne čuva
  const teamName = r => { const u = (users || []).find(x => x.user_id === r.owner_id); return cleanName(u?.metadata?.team_name || u?.display_name) || `Team ${r.roster_id}`; };
  const unmatched = [], ids = [];
  const teams = (Array.isArray(rosters) ? rosters : []).map(r => {
    const ir = new Set(r.reserve || []), players = [];
    for (const pid of r.players || []) {
      const hit = names[pid] ? matchName(names[pid], index) : null;
      if (hit?.id) { players.push({ id: hit.id, ir: ir.has(pid) }); ids.push(hit.id); } else unmatched.push(names[pid] || pid);
    }
    const s = r.settings || {};
    return { tid: r.roster_id, name: teamName(r), abbrev: '', record: { w: +s.wins || 0, l: +s.losses || 0, t: +s.ties || 0 }, seed: null, pf: (+s.fpts || 0) + (+s.fpts_decimal || 0) / 100, vals: null, players };
  });
  [...teams].sort((a, b) => b.record.w - a.record.w || b.pf - a.pf).forEach((x, i) => { x.seed = i + 1; });
  const pos = (info.roster_positions || []).filter(x => x !== 'IR');
  const fmt = mapSleeperFormat(info.scoring_settings);
  const st = info.settings || {};
  return {
    source: 'sleeper', extId: String(leagueId), season: String(info.season || ''), name: cleanName(info.name) || 'Sleeper', size: +info.total_rosters || teams.length,
    format: fmt.format, fmtError: null, slots: { active: pos.length || ROSTER_DEFAULT.ACTIVE, ir: +st.reserve_slots || 0 },
    deadline: null, playoffTeams: +st.playoff_teams || null, teams, raw: poolRawMap(pool, ids), unmatched,
    playoffWeek: +st.playoff_week_start || null, week: +st.leg || null,
  };
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
    const pf = num(r.pointsFor ?? r.fantasyPoints ?? r.fpts ?? (rec ? null : r.points));
    if (pf != null) tm.pf = pf;
  }
  if (!teams.some(x => x.seed)) [...teams].sort((a, b) => b.record.w - a.record.w || b.pf - a.pf).forEach((x, i) => { if (x.record.w + x.record.l + x.pf) x.seed = i + 1; });
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
  // tabela (nije obavezna): oblik odgovora nije proveren na pravoj ligi, pa se čita oprezno i greška se preskače
  const stand = await fetchJSON(`${IMPORT.FANTRAX}/getStandings?leagueId=${id}`).catch(() => null);
  applyFantraxStandings(teams, stand);
  return {
    source: 'fantrax', extId: String(q.extId || q.leagueId), season: String(info.season || info.year || CONFIG.SEASON), name: cleanName(info.leagueName || info.name) || 'Fantrax', size: teams.length,
    format: null, fmtError: null, slots: { active: ROSTER_DEFAULT.ACTIVE, ir: ROSTER_DEFAULT.IR }, deadline: null, playoffTeams: null, teams, raw: poolRawMap(pool, ids), unmatched,
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
    const season = /^\d{4}$/.test(String(imp.season)) && imp.source === 'espn' ? `${imp.season - 1}-${String(imp.season).slice(2)}` : String(imp.season || '');
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
  $('#periods').innerHTML = PERIODS.map(p =>
    `<button type="button" data-period="${p.key}" aria-pressed="${p.key === state.period}">${p.label}</button>`).join('');
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
  const per = PERIODS.find(p => p.key === state.period).label;
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
    <div class="score-actions"><button type="button" class="btn ok" data-action="trade-done" title="${t('Tek ovo menja sačuvane rostere')}">✔ ${t('Trejd se dogodio')}</button></div>
    <div class="score-hint">${t('Ovo je ideja za trejd: tvoj sačuvani roster se ne menja dok ne klikneš „Trejd se dogodio”.')}</div>`}`;
}

function avatarHTML(p) {
  return `<span class="av" data-ini="${esc(initials(p.name))}"><img src="${CONFIG.HEADSHOT_URL(p.id)}" alt="" loading="lazy" onerror="this.remove()"></span>`; // inicijali (::before) se vide dok se slika učitava i kad je nema
}

function injHTML(p) {
  const i = INJURY[p.inj];
  return i ? `<span class="inj ${i.cls}" title="${esc(p.inj)}">${i.short}</span>` : '';
}

/** Zaglavlje kategorije: klik = punt */
const catTh = c => (isPointsFmt()
  ? `<th class="${c.fpts ? 'fpts' : 'wth'}" ${c.fpts ? `title="${esc(t('Fantasy poeni po utakmici'))}"` : `title="${esc(t('{s}: {w} po jedinici', { s: c.label, w: fmtNum(c.w) }))}"`}>${c.label}</th>`
  : `<th class="catth${puntCls(c)}" data-punt="${c.key}" title="${isPunt(c) ? t('Vrati kategoriju') : t('Punt: isključi iz rezultata')}">${c.label}</th>`);

function headerRow() {
  return `<tr><th>${t('Igrač')}</th><th class="minth" data-tip="${esc(t('Minuti u izabranom periodu. Pređi mišem ili tapni na broj za trend: sezona → 30 → 15 → 7 dana. Poslednjih 15 dana vs sezona: zeleno ↑ / crveno ↓ = ±{a} min ili više, ↑↑ / ↓↓ = ±{b} min ili više (bar {g} utakmice).', { a: MINUTES.ALERT, b: MINUTES.STRONG, g: MINUTES.MIN_GP }))}">MIN<span class="i">ⓘ</span></th>${CATS.map(catTh).join('')}<th>GP</th></tr>`;
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
function playerRowHTML(p, { tags = [], cls = '', actions = '', sign = '', drag = '', attrs = '' } = {}) {
  const line = playerLine(p);
  const cells = CATS.map(c => {
    const pc = puntCls(c) ? ` class="${puntCls(c).trim()}"` : '';
    if (!line) return `<td${pc}>-</td>`;
    const tr = trendHTML(p, c);
    const v = catValue(line, c);
    if (c.type === 'pct' || v == null) return `<td${pc}>${tr}${fmtCat(c, v)}</td>`;
    return `<td class="${c.fpts ? 'fpts' : ''}${puntCls(c)}">${tr}${sign}${fmt1(v)}</td>`;
  }).join('');
  const tagHTML = tags.map(tg => `<span class="slot-tag ${tg.cls}">${tg.raw ? tg.text : t(tg.text)}</span>`).join('');
  return `<tr class="${line ? '' : 'nodata'} ${cls}" ${attrs}>
    <td><div class="pl">${drag ? `<span class="drag" data-drag="${drag}" title="${t('Prevuci gore/dole')}" aria-label="${t('Pomeri igrača')}">≡</span>` : ''}${avatarHTML(p)}<div class="txt">${tagHTML ? `<span class="tags">${tagHTML}</span>` : ''}<span class="nm" title="${esc(p.name)}">${esc(p.name)}</span>
      <span class="meta">${p.team} · ${posTxt(p)} ${injHTML(p)} ${durabilityHTML(p)} ${weekGamesHTML(p)} ${line ? '' : `<span class="flag" title="${t('Nema podataka za ovaj period, ne računa se')}">0 GP</span>`}</span>
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
    const slotRows = sp.drops.map(id => state.byId.get(id)).filter(Boolean).map(p => playerRowHTML(p, {
      tags: [{ text: ti === GIVE ? 'Izbacuješ' : 'Izbacuje', cls: 'tag-out' }], cls: 'slot-d',
      actions: `<button class="rm" type="button" data-action="bal-d-remove" data-kind="${kind}" data-id="${p.id}" aria-label="${t('Ukloni')}">✕</button>` })).join('');
    const slotInputs = slotInputHTML(kind, 'd');
    return `<section class="card" data-team-card="${ti}">
      <div class="card-h">
        <span class="dot" style="background:${SIDES[ti].color}"></span>
        <div class="side-title"><b style="color:${SIDES[ti].color}">${SIDES[ti].name}</b><small>${esc(sideSubtitle(ti))}</small></div>
        ${cmp.points ? `<span class="team-badge ${ti === GET && cmp.points.diff > 0.05 ? 'lead' : ''}">${t('{n} FPts', { n: (ti === GET ? cmp.points.get : cmp.points.give).toFixed(1) })}</span>`
          : better != null ? `<span class="team-badge ${ti === GET && cmp.score[GET] > cmp.score[GIVE] ? 'lead' : ''}">${t('bolje u {n} kat.', { n: better })}</span>` : ''}
      </div>
      ${searchBoxHTML(String(ti), ti === GIVE ? t('Koga daješ…') : t('Koga dobijaš…'))}
      ${players.length
        ? `<div class="tscroll"><table><thead>${headerRow()}</thead><tbody>${players.map(p => playerRow(p, ti)).join('')}${slotRows}</tbody>
           <tfoot>${totalRow(tot, cmp, ti)}</tfoot></table></div>`
        : `<div class="empty-team">${unknown ? t('Igrači iz linka nisu pronađeni u listi.') : t('Još nema igrača. Kucaj ime iznad.')}</div>`}
      ${slotInputs}
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
    const req = !!plan && plan.missingDrops > 0;
    const label = `<span class="slot-tag ${req ? 'slot-d-tag' : 'slot-opt-tag'}">${t(kind === 'my' ? 'Izbacuješ {a}/{b}' : 'Protivnik izbacuje {a}/{b}', { a: sp.drops.length + 1, b: sp.dropSlots })} · ${req ? t('obavezno') : t('opciono')}</span>`;
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
function autoOppForSynced() {
  const lg = currentLeague();
  if (!isSynced(lg) || !getIds().length) return;
  const ids = getIds();
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
  el.innerHTML = `<div class="section-t">${t('Poređenje kategorija')} <span class="hint">· ${t('klik na kategoriju = punt')}</span></div>
    <div class="card"><div class="tscroll"><table class="cmp"><thead><tr><th>${t('Kat.')}</th>${SIDES.map(sd => `<th style="color:${sd.color}">${sd.name}</th>`).join('')}<th title="${esc(t('Dobijaš − Daješ, iz tvoje perspektive'))}">${t('Razlika')}</th></tr></thead>
    <tbody>${rows}</tbody></table></div></div>${rotoProjHTML()}`;
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
const shortDate = iso => { const d = new Date(iso); return LANG === 'en' ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : `${d.getDate()}.${d.getMonth() + 1}`; };
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
const statusLabel = p => INJURY[p.inj]?.short === 'O' ? 'OUT' : (INJURY[p.inj]?.short || p.inj);
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
    if (['DAY_TO_DAY', 'QUESTIONABLE', 'PROBABLE'].includes(f.p.inj) && (f.minS ?? 0) >= REPORT.REGULAR_MIN)
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
      real = rt('real', { give: names(sendIds), get: `${names(recvIds)} + ${sp.waivers.length ? names(sp.waivers) : rt('freeSpot')}` });
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
    res.opp = { name: oppR.name || rt('oppAnon'), pluses: o.pluses.slice(0, REPORT.OPP_PLUS), risks: o.risks.slice(0, REPORT.OPP_RISK) };
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
      ${reportListHTML('plus', rt('plus'), r.pluses)}
      ${reportListHTML('risk', rt('risk'), r.risks)}
      ${!r.pluses.length && !r.risks.length ? `<p class="hint">${rt('noData')}</p>` : ''}
      ${r.opp && (r.opp.pluses.length || r.opp.risks.length) ? `<div class="rp-opp"><div class="rp-head small">${rt('oppHead', { name: esc(r.opp.name) })}</div>
        ${reportListHTML('plus', rt('plus'), r.opp.pluses)}${reportListHTML('risk', rt('risk'), r.opp.risks)}</div>` : ''}
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
  PROBABLE: ['verovatno igra', 'probable'], OUT: ['OUT (van stroja)', 'OUT'], INJURY_RESERVE: ['IR (povređen)', 'injured reserve'], SUSPENSION: ['suspendovan', 'suspended'],
};
const statusTxt = p => { const s = STATUS_TXT[p.inj]; return s ? L(s[0], s[1]) : p.inj; };
const n1 = v => (v == null ? '-' : (+v).toFixed(1));
const n1m = v => (v == null ? '-' : `${v < -0.05 ? '−' : ''}${Math.abs(v).toFixed(1)}`); // pravi minus
const pct3 = v => (v == null ? '-' : fmtPct(v));
/** Prve rečenice teksta (kraj rečenice = . ! ? pa razmak i veliko slovo; "averaging 23.5" se ne seče) */
const firstSentences = (s, n) => String(s || '').trim().split(/(?<=[.!?])\s+(?=[A-Z"“(])/).slice(0, n).join(' ').trim();
const aiDate = iso => { const d = new Date(iso); return d.toLocaleDateString(LANG === 'en' ? 'en-US' : 'sr-Latn', { day: 'numeric', month: LANG === 'en' ? 'short' : 'numeric', year: 'numeric' }); };

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
  return `- ${p.name} (${p.team}, ${posTxt(p)})${p.inj !== 'ACTIVE' ? ` · ${statusTxt(p)}` : ''} · MIN ${n1(f.minS)}${f.minR != null ? ` / 15d ${n1(f.minR)}` : ''}${f.dur ? ` · GP% ${Math.round(f.dur.pct * 100)}%` : ''} · ${catLineTxt(f.S)}${ir ? ' · IR' : ''}`;
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
  out.push(L(`Ako možeš da pretražuješ internet, proveri najnovije vesti za igrače u trejdu${lg ? ' i za ključne igrače mog rostera' : ''}: povrede, promene uloge, glasine o trejdovima u NBA. Navedi šta si našao i od kog datuma. Ako ne možeš da pretražuješ internet, reci to na početku i osloni se na vesti ispod.`,
    `If you can browse the internet, check the latest news for the players in the trade${lg ? ' and for the key players on my roster' : ''}: injuries, role changes, NBA trade rumors. Say what you found and from what date. If you cannot browse, say so at the start and rely on the news below.`));
  out.push(L('Budi iskren, i kad je trejd loš za mene, reci.', 'Be honest, and if the trade is bad for me, say so.'));
  const oppKnown = !!(lg && rosterOf('opp')?.players.length);
  out.push(oppKnown
    ? L(`Planiram da pošaljem ovu ponudu, pa na kraju pogledaj trejd i iz ugla protivnika. Njegov roster je ispod: proceni kako trejd menja njegov tim (${pts ? 'poeni' : 'kategorije'}, pozicije, dubina, povrede) i da li mu odgovara.`,
      `I plan to send this offer, so at the end look at the trade from the opponent's side too. Their roster is below: judge how the trade changes their team (${pts ? 'points' : 'categories'}, positions, depth, injuries) and whether it suits them.`)
    : L('Planiram da pošaljem ovu ponudu, pa na kraju pogledaj trejd i iz ugla druge strane. Nemam njegov roster, pa razmišljaj kao tipičan menadžer i reci šta bi o njegovom timu trebalo da znam da bi procena bila tačnija.',
      'I plan to send this offer, so at the end look at the trade from the other side too. I do not have their roster, so think like a typical manager and say what I should know about their team to make the read more accurate.'));
  const oppStep = L('Pogled iz ugla protivnika: zašto bi mogao da odbije, kako vidi trejd s obzirom na svoj tim, da li sam preterao ili tražim previše, šta bi mogao da traži zauzvrat ili kao dodatak, i sve načine na koje bi mogao da razmišlja, uključujući ono što ja iz svog ugla možda ne vidim',
    'The opponent\'s view: why they might decline, how they see the trade given their team, whether I am asking too much, what they might ask for in return or as an add-on, and every way they might think about it, including what I may be missing from my side');
  out.push(L('Odgovori ovim redom:', 'Answer in this order:'));
  const steps = lg
    ? L(['Kratka preporuka: prihvati / odbij / pregovaraj, u jednoj rečenici', 'Šta dobijam dugoročno', 'Šta rizikujem', 'Uklapanje u moj roster', 'Kako trejd utiče na moj tim po kategorijama', 'Ako je odgovor pregovaraj: konkretan kontra-predlog'],
      ['Short recommendation: accept / decline / negotiate, in one sentence', 'What I gain long term', 'What I risk', 'Fit with my roster', 'How the trade affects my team by category', 'If the answer is negotiate: a concrete counteroffer'])
    : L(['Kratka preporuka: prihvati / odbij / pregovaraj, u jednoj rečenici', 'Šta se dobija dugoročno', 'Šta se rizikuje', 'Pitanja o ligi i rosteru koja bi promenila odgovor', 'Kako trejd utiče po kategorijama', 'Ako je odgovor pregovaraj: konkretan kontra-predlog'],
      ['Short recommendation: accept / decline / negotiate, in one sentence', 'What is gained long term', 'What is at risk', 'Questions about the league and roster that would change the answer', 'How the trade affects each category', 'If the answer is negotiate: a concrete counteroffer']);
  if (lg && isSynced(lg) && !pts) steps[4] = L('Kako trejd utiče na moj tim po kategorijama i na moj plasman u ligi', 'How the trade affects my team by category and my place in the league');
  if (pts) steps[4] = lg ? L('Kako trejd menja fantasy poene mog tima po utakmici', 'How the trade changes my team\'s fantasy points per game') : L('Kako trejd menja fantasy poene po utakmici', 'How the trade changes fantasy points per game');
  steps.push(oppStep + (lg && isSynced(lg) && oppKnown
    ? L(`. Uzmi u obzir i njegov plasman u ligi iz odeljka CELA LIGA (${pts ? 'mesto na tabeli i poeni' : 'mesto na tabeli i gde je jak ili slab po kategorijama'}): da li se bori za plejof ili vrh, ili mu više znače budući igrači, i da li mu trejd pomaže baš tamo gde mu treba`,
      `. Also use their place in the league from the WHOLE LEAGUE section (${pts ? 'standings and points' : 'standings and where they are strong or weak by category'}): whether they are fighting for the playoffs or the top, or care more about future value, and whether the trade helps them exactly where they need it`)
    : ''));
  out.push(steps.map((s, i) => `${i + 1}. ${s}`).join('\n'));
  out.push(L('Odgovori na srpskom, kratko i jasno.', 'Reply in English, short and clear.'));
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
  if (state.loadedAt) ctx.push(`${L('Podaci od', 'Data as of')}: ${new Date(state.loadedAt).toLocaleString(LANG === 'en' ? 'en-US' : 'sr-Latn', { dateStyle: 'medium', timeStyle: 'short' })}`);
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
  block(L('MOJ WAIVER DODATAK (menja moj tim, ne računa se u trejd)', 'MY WAIVER ADD (changes my team, not counted in the trade)'), sp.waivers);
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
    lines.push(...opp.players.map(x => { const p = state.byId.get(x.id); if (!p) return null; const f = playerFacts(p); return `- ${p.name} (${p.team}, ${posTxt(p)})${p.inj !== 'ACTIVE' ? ` · ${statusTxt(p)}` : ''} · MIN ${n1(f.minS)}${f.dur ? ` · GP% ${Math.round(f.dur.pct * 100)}%` : ''}${x.ir ? ' · IR' : ''}`; }).filter(Boolean));
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
  const allIn = outSet.size > 0 && notOnRoster.length === 0;
  const outIds = allIn ? rosterIds(r).filter(id => outSet.has(id)) : [];
  const incoming = allIn ? state.teams[KINDS[kind].in].ids.filter(id => !onRoster.has(id)) : [];
  const pre = [...activeBefore.filter(id => !outIds.includes(id)), ...incoming];
  const sp = slotPlan(kind);
  // Izabrani "Izbacuješ": oduzima se samo ako je igrač stvarno na rosteru (i samo kad je trejd moj)
  const dropsRemove = allIn ? sp.drops.filter(id => onRoster.has(id)) : [];   // brišu se sa rostera (i IR)
  const drops = dropsRemove.filter(id => pre.includes(id));                    // aktivni -> utiču na zbir
  const dropsOff = sp.drops.filter(id => !onRoster.has(id));                    // nisu na rosteru -> napomena
  const requiredDrops = allIn ? Math.min(sp.dropSlots, Math.max(0, pre.length - ROSTER.ACTIVE)) : 0;
  const waivers = allIn ? sp.waivers : [];
  const activeAfter = [...pre.filter(id => !drops.includes(id)), ...waivers];
  const tradeTouches = allIn;
  return { r, activeBefore, irIds, outIds, incoming, drops, dropsRemove, dropsOff, dropSlots: sp.dropSlots, requiredDrops,
    waivers, waiverSlots: sp.waiverSlots, pre, activeAfter, notOnRoster, tradeTouches,
    missingDrops: Math.max(0, requiredDrops - drops.length) };
}

const fmtShortDate = iso => (iso ? new Date(iso).toLocaleDateString(LOCALE(), LANG === 'en' ? { day: 'numeric', month: 'short', year: 'numeric' } : { day: 'numeric', month: 'numeric', year: 'numeric' }) : '–');
const isStale = iso => iso && Date.now() - new Date(iso).getTime() > ROSTER.STALE_DAYS * 864e5;

/** Red rostera u istom stilu kao gornje tabele, sa oznakama i akcijama */
/** Red rostera; sačuvani igrači (ne DOLAZI/WAIVER) imaju ručicu za pomeranje */
function rosterRow(p, kind, { tags = [], cls = '', actions = '', saved = false, ir = false } = {}) {
  return playerRowHTML(p, { tags, cls, actions,
    drag: saved ? `${kind}:${p.id}` : '',
    attrs: saved ? `data-rid="${p.id}" data-rir="${ir ? 1 : 0}" data-rkind="${kind}"` : '' });
}

/** Tri reda ispod rostera: Pre / Posle / Razlika (iste kolone kao tabele igrača) */
function summaryRows(before, after, showAfter) {
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
  // Analiza trejda: →IR i ✕ menjaju sačuvan roster, isto kao na stranicama Moj tim i Liga
  const rm = id => rosterRmBtn(kind, id);
  const irBtn = (id, toIr) => rosterIrBtn(kind, id, toIr);
  const outSet = new Set(plan.outIds), dropSet = new Set(plan.dropsRemove || []);
  // Pregled: igrači koji ostaju na svojim mestima (sačuvani redosled), a dole redom
  // ODLAZI, IZBAČEN, DOLAZI, WAIVER. U prikazu "Sačuvan roster" plan je prazan, pa svi ostaju na mestu.
  const stay = [], leaving = [], dropped = [];
  const irRow = id => P(id) && rosterRow(P(id), kind, { tags: [{ text: 'IR', cls: 'tag-ir' }], cls: 'ir', actions: irBtn(id, false) + rm(id), saved: true, ir: true });
  for (const id of plan.activeBefore) {
    const p = P(id); if (!p) continue;
    if (outSet.has(id)) leaving.push({ id, ir: false });
    else if (dropSet.has(id)) dropped.push({ id, ir: false });
    else stay.push(rosterRow(p, kind, { actions: irBtn(id, true) + rm(id), saved: true }));
  }
  const irStay = [];
  for (const id of plan.irIds) {
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
    rows.push(rosterRow(p, kind, { tags: [{ text: 'Dolazi', cls: 'tag-in' }], cls: 'arriving' }));
  }
  for (const id of plan.waivers) {
    const p = P(id); if (!p) continue;
    rows.push(rosterRow(p, kind, { tags: [{ text: 'Waiver', cls: 'tag-in' }], cls: 'arriving',
      actions: `<button class="rm" type="button" data-action="bal-w-remove" data-kind="${kind}" data-id="${id}" aria-label="${t('Ukloni waiver')}">✕</button>` }));
  }
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
    // dajem više igrača: slobodno mesto popunjavam sa waivera; to menja moj tim, ne rezultat trejda
    const waiver = plan.waiverSlots ? `<div class="balance"><span class="hint">${t('Daješ više igrača nego što dobijaš, pa ti posle trejda ostaje slobodno mesto. Igrač sa waivera menja tvoj tim, ali ne i rezultat trejda.')}</span>
      ${slotPlan('my').waivers.map(id => `<span class="chip"><span class="slot-tag tag-in">Waiver</span> ${nm(id)}
        <button type="button" data-action="bal-w-remove" data-kind="my" data-id="${id}" aria-label="${t('Ukloni')}">✕</button></span>`).join('')}
      ${slotInputHTML('my', 'w', 'balance')}</div>` : '';
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
  // koga protivnik izbacuje bira se gore, u kartici Dobijaš (ovde samo prikaz); njegov waiver nas ne zanima
  const inputs = '';
  return (chosen ? `<div class="chips slot-chips">${chosen}</div>` : '') + inputs + offNotes + warn;
}

function renderRosterSection(kind) {
  const el = $(`#${kind === 'my' ? 'myteam' : 'oppteam'}`);
  if (!el) return;
  const open = kind === 'my' ? state.ui.myOpen : state.ui.oppOpen;
  const r = rosterOf(kind);
  const head = kind === 'opp' ? oppPickerHTML() : '';
  const edit = r || kind === 'my' ? `<div class="edit-roster">${linkHTML('trade-edit-roster', { attrs: `data-kind="${kind}"`, label: `✎ ${kind === 'my' ? t('Uredi roster') : t('Uredi roster u Ligi')}` })}</div>` : '';
  let body = '', hint = '';
  if (!r) {
    body = `<div class="empty-team">${oppList().length ? t('Izaberi protivnika sa kojim trejduješ.') : t('Još nema unetih timova. Dodaj ih na stranici Liga.')}</div>
      ${!oppList().length ? `<div class="edit-roster">${linkHTML('trade-edit-roster', { attrs: 'data-kind="opp"', label: `＋ ${t('Dodaj tim u Ligi')}` })}</div>` : ''}`;
    hint = t('nije izabran');
  } else {
    const plan = rosterPlan(kind);
    const addBox = edit;
    hint = t('{a}/{b} aktivnih · {c}/{d} IR', { a: activeCount(r), b: ROSTER.ACTIVE, c: irCount(r), d: ROSTER.IR });
    const updated = `<div class="r-meta">${t('Ažurirano: {d}', { d: fmtShortDate(r.updated) })}${isStale(r.updated) ? ` <span class="stale">· ${t('Roster možda nije aktuelan, proveri izmene.')}</span>` : ''}</div>`;
    if (!r.players.length) {
      body = `${updated}<div class="empty-team cta">${t(kind === 'my' ? 'Unesi svoj roster ({a} aktivnih + {b} IR). Čuva se samo u ovom browseru.' : 'Unesi roster protivnika ({a} aktivnih + {b} IR). Čuva se samo u ovom browseru.', { a: ROSTER.ACTIVE, b: ROSTER.IR })}</div>${addBox}`;
    } else {
      const before = sumPlayers(plan.activeBefore), after = sumPlayers(plan.activeAfter);
      const missing = [...new Set([...before.missing, ...after.missing])];
      // Pregled posle trejda (samo prikaz) ili sačuvan roster kakav jeste
      const view = plan.tradeTouches ? (state.ui.rosterView?.[kind] || 'after') : 'saved';
      const showPlan = view === 'after' ? plan : { ...plan, outIds: [], incoming: [], drops: [], dropsRemove: [], waivers: [] };
      const toggle = plan.tradeTouches ? `<div class="view-row">
          <div class="seg small" role="group" aria-label="${t('Prikaz rostera')}">
            <button type="button" data-rview="${kind}:after" aria-pressed="${view === 'after'}">${t('Posle trejda (pregled)')}</button>
            <button type="button" data-rview="${kind}:saved" aria-pressed="${view === 'saved'}">${t('Sačuvan roster')}</button>
          </div>
          <span class="preview-note">${view === 'after' ? t('Samo pregled: sačuvan roster se ne menja dok trejd ne potvrdiš.') : t('Ovo je tvoj sačuvani roster, bez trejda.')}</span>
        </div>` : '';
      // Nisu svi igrači sa izlazne strane na rosteru -> samo obaveštenje, roster se ne menja
      const notAll = plan.notOnRoster.length && !plan.tradeTouches
        ? `<div class="notall"><span>⚠ ${kind === 'my'
            ? t('Nisu svi igrači iz Daješ na tvom rosteru ({list}), pa se Moj tim ne menja.', { list: plan.notOnRoster.map(id => esc(state.byId.get(id)?.name || id)).join(', ') })
            : t('Nisu svi igrači iz Dobijaš na rosteru tima {team} ({list}), pa se njegov roster ne menja.', { team: esc(r.name), list: plan.notOnRoster.map(id => esc(state.byId.get(id)?.name || id)).join(', ') })}</span>
            ${rosterLocked() ? '' : addButtonHTML({ action: 'add-all', kind, label: plan.notOnRoster.length > 1 ? t('Dodaj sve ({n})', { n: plan.notOnRoster.length }) : t('Dodaj na roster'), n: plan.notOnRoster.length })}</div>`
        : '';
      body = `${updated}${addBox}${notAll}${toggle}
        <div class="tscroll"><table class="rtable"><thead>${headerRow()}</thead><tbody>${rosterTableHTML(kind, showPlan)}</tbody></table></div>
        ${view === 'after' || (kind === 'opp' && (plan.dropSlots || plan.waiverSlots)) ? balanceHTML(kind, plan) : ''}
        <div class="tscroll"><table class="rtable sumtable"><tbody>${summaryRows(before, after, view === 'after')}</tbody></table></div>
        ${missing.length ? `<div class="card-warn">⚠ ${t('Bez podataka za izabrani period, ne računa se: {list}', { list: missing.map(esc).join(', ') })}</div>` : ''}
        ${plan.tradeTouches && giveIds().length && getIds().length ? `<div class="r-done"><button type="button" class="btn ok" data-action="trade-done">✔ ${t('Trejd se dogodio: ažuriraj rostere')}</button></div>` : ''}`;
    }
  }
  el.innerHTML = `<details class="card fold" data-fold="${kind}" ${open ? 'open' : ''}>
    <summary><span>${KINDS[kind].title}${kind === 'opp' && r ? `: ${esc(r.name)}` : ''}</span><span class="hint">${hint}</span></summary>
    <div class="fold-body">${head}${body}</div></details>`;
}

/* ---------- Protivnik: sačuvani timovi po imenu ---------- */
const oppList = () => Object.entries(state.rosters.opps).sort((a, b) => a[1].name.localeCompare(b[1].name, 'sr'));

function oppPickerHTML() {
  const sel = state.rosters.oppSel;
  const opts = oppList().map(([oid, o]) => `<option value="${oid}" ${oid === sel ? 'selected' : ''}>${esc(o.name)} (${o.players.length})</option>`).join('');
  // Analiza: ovde se samo bira protivnik; timovi se dodaju, preimenuju i brišu na stranici Liga
  if (!oppList().length) return '';
  return `<div class="opp-pick">
      <select data-opp-select aria-label="${t('Izaberi protivnika')}">
        <option value="">${t('Izaberi protivnika')}</option>${opts}
      </select>
    </div>`;
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
        profile.leagues.push(copy); profile.lastLeagueId = copy.id; saveProfile();
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
function showModal({ title, body, confirm = t('U redu'), cancel = t('Otkaži'), danger = false, onConfirm, wide = false }) {
  closeModal();
  const m = document.createElement('div');
  m.id = 'modal';
  m.innerHTML = `<div class="modal-back" data-modal-close></div>
    <div class="modal-box ${wide ? 'wide' : ''}" tabindex="-1" role="dialog" aria-modal="true" aria-labelledby="modal-t">
      <h3 id="modal-t">${title}</h3><div class="modal-body">${body}</div>
      <div class="modal-actions">${cancel ? `<button type="button" class="linkbtn" data-modal-close>${cancel}</button>` : ''}
        ${onConfirm ? `<button type="button" class="btn ${danger ? 'danger' : ''}" data-modal-ok>${confirm}</button>` : ''}</div>
    </div>`;
  document.body.appendChild(m);
  m._onConfirm = onConfirm;
  (m.querySelector('[data-modal-ok]') || m.querySelector('[data-modal-close]:not(.modal-back)'))?.focus();
  return m;
}
const closeModal = () => document.getElementById('modal')?.remove();
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
}

function openTrade(id) {
  const h = state.history.find(x => x.id === id);
  if (!h) return;
  // stari trejdovi (Tim A/B) se otvaraju kao Daješ/Dobijaš: prve dve strane
  // sačuvan trejd se otvara u NOVOM tabu, postojeći nacrti ostaju
  addTab([GIVE, GET].map(i => h.teams[i]?.ids || []), { ...emptyBalance(), my: { drops: [...(h.slots?.drops || [])], waivers: [...(h.slots?.waivers || [])] }, opp: { drops: [...(h.slots?.oppDrops || [])], waivers: [] } });
  state.period = h.period;
  state.histView = id;
  state.histOpen = true;
  saveState();
  render();
  loadGameLogs(tradePlayerIds(h.teams, h.slots));
  $('#history').scrollIntoView({ behavior: 'smooth', block: 'start' });
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
  try {
    if (!state.schedule) await loadSchedule();
    if (!state.schedule) throw new Error(t('raspored nije dostupan (potreban za datume utakmica)'));
    const gameDate = new Map(Object.values(state.schedule).flat().map(g => [String(g.id), g.date]));
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), CONFIG.FETCH_TIMEOUT_MS);
    const res = await fetch(CONFIG.API_URL, { headers: { 'X-Fantasy-Filter': JSON.stringify(CONFIG.GAMELOG_FILTER(need)) }, signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error(t('{src} je vratio grešku {n}', { src: DATA_SOURCE.name, n: res.status }));
    const data = await res.json();
    for (const raw of data.players || []) {
      const p = raw.player, games = [];
      for (const st of p.stats || []) {
        if (st.statSplitTypeId !== 5 || st.seasonId !== CONFIG.SEASON || !st.stats) continue;
        const date = gameDate.get(String(st.externalId));
        if (date == null) continue; // utakmica nije u rasporedu -> ne možemo pouzdano da je datiramo
        const line = {};
        for (const [k, sid] of Object.entries(STAT)) line[k] = +st.stats[sid] || 0;
        if (line.GP > 0 && line.MIN > 0) games.push({ date, line }); // računaju se samo utakmice sa minutima
      }
      state.gameLogs.set(p.id, games.sort((a, b) => a.date - b.date));
    }
    for (const id of need) if (!state.gameLogs.has(id)) state.gameLogs.set(id, []);
    state.gameLogStatus = { loading: false, error: null };
  } catch (e) {
    state.gameLogStatus = { loading: false, error: e.name === 'AbortError' ? t('{src} ne odgovara', { src: DATA_SOURCE.name }) : e.message };
  }
  render();
}

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
async function fetchGameLogsQuiet(ids) {
  try {
    if (!state.schedule) await loadSchedule();
    if (!state.schedule) return;
    const gameDate = new Map(Object.values(state.schedule).flat().map(g => [String(g.id), g.date]));
    const res = await fetch(CONFIG.API_URL, { headers: { 'X-Fantasy-Filter': JSON.stringify(CONFIG.GAMELOG_FILTER(ids)) } });
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();
    for (const raw of data.players || []) {
      const p = raw.player, games = [];
      for (const st of p.stats || []) {
        if (st.statSplitTypeId !== 5 || st.seasonId !== CONFIG.SEASON || !st.stats) continue;
        const date = gameDate.get(String(st.externalId));
        if (date == null) continue;
        const line = {};
        for (const [k, sid] of Object.entries(STAT)) line[k] = +st.stats[sid] || 0;
        if (line.GP > 0 && line.MIN > 0) games.push({ date, line });
      }
      state.gameLogs.set(p.id, games.sort((a, b) => a.date - b.date));
    }
    for (const id of ids) if (!state.gameLogs.has(id)) state.gameLogs.set(id, []);
  } catch (e) {
    console.warn('Utakmice nisu učitane:', e.message);
    for (const id of ids) if (!state.gameLogs.has(id)) state.gameLogs.set(id, null); // ne pokušavaj u krug
  }
}

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

function renderHistory() {
  const el = $('#history');
  const list = state.history.map(h => {
    const sideName = (tm, i) => (SIDES[i] && (!tm.name || tm.name === SIDES[i].srName) ? SIDES[i].name : tm.name || '');
    const sides = h.teams.map((tm, i) => `<b>${esc(sideName(tm, i))}</b>: ${tm.ids.map(id => esc(h.names?.[id] || state.byId.get(id)?.name || id)).join(', ') || '–'}`).join(' ⇄ ');
    const per = PERIODS.find(x => x.key === h.period)?.label || h.period;
    return `<li class="${state.histView === h.id ? 'active' : ''}">
      <button type="button" class="hist-open" data-action="hist-open" data-id="${h.id}">
        <span class="hist-date">${fmtDate(h.date)} · ${per}${h.done ? ` · <span class="done-tag">${h.opp ? t('obavljen sa {n}', { n: esc(h.opp) }) : t('obavljen')}</span>` : ` · <span class="idea-tag">${t('ideja')}</span>`}</span><span class="hist-sides">${sides}</span></button>
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

  el.innerHTML = `<details class="card fold" data-fold="hist" ${state.histOpen ? 'open' : ''}>
    <summary><span>${t('Istorija trejdova')}</span><span class="hint">${state.history.length ? t('{n} sačuvano', { n: state.history.length }) : t('prazno')}</span></summary>
    <div class="fold-body">
      ${list ? `<ul class="hist-list">${list}</ul>` : `<div class="empty-team">${t('Još nema sačuvanih trejdova. Klikni „Sačuvaj ideju” ili „Trejd se dogodio” ispod rezultata.')}</div>`}
      ${detail}
    </div></details>`;
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
  const showAddMy = !/^(my|opp|lt)-add$/.test(key) && !rosterLocked();
  const myIds = new Set(rosterIds(state.rosters.my));
  const myRoom = hasRoom(state.rosters.my);
  if (!results.length && !norm(ui.query)) { dd.hidden = true; inp.setAttribute('aria-expanded', 'false'); return; }
  dd.hidden = false;
  inp.setAttribute('aria-expanded', 'true');
  dd.innerHTML = results.length
    ? results.map((p, k) => `<li role="option" data-pick="${p.id}" data-key="${key}" aria-selected="${k === ui.sel}">
        ${avatarHTML(p)}<div class="dd-main"><div>${esc(p.name)} ${pref?.set.has(p.id) ? `<span class="slot-tag tag-mine">${esc(pref.label)}</span>` : ''}</div><div class="meta">${p.team} · ${posTxt(p)} ${injHTML(p)}</div></div>
        ${showAddMy && !myIds.has(p.id) ? `<button type="button" class="dd-addmy ${myRoom ? '' : 'is-disabled'}" data-addmy="${p.id}" ${myRoom ? `title="${esc(t('Dodaj u moj tim'))}"` : `aria-disabled="true" title="${esc(fullTip())}"`}>＋ ${t('Moj tim')}</button>` : ''}</li>`).join('')
    : `<li class="empty">${t('Nema igrača za „{q}“', { q: esc(ui.query) })}</li>`;
  dd.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
}

/** Pretraga zavisi od cilja: roster isključuje samo igrače već na rosteru */
function searchFor(key, query) {
  const ds = key.match(/^(my|opp)-d$/);
  if (ds) {
    // Izbacuješ: bez igrača iz trejda (Daješ i Dobijaš) i već izabranih; prvo igrači sa rostera
    const ex = new Set([...takenIds(), ...slotIds(ds[1])]);
    const r = rosterOf(ds[1]);
    return searchResults(query, ex, r?.players.length ? new Set(rosterIds(r)) : null);
  }
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

/** Ključ pretrage -> gde ide igrač: "0" = tim 0 dobija, "0:d" = izbacuje, "0:w" = waiver */
function pickPlayer(key, id) {
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
  trades: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 8h14l-4-4M20 16H6l4 4"/></svg>',
};
const APP_PAGES = [
  { id: 'overview', sr: 'Pregled', ready: true },
  { id: 'team', sr: 'Moj tim', ready: true },
  { id: 'league', sr: 'Liga', ready: true },
  { id: 'trade', sr: 'Analiza trejda', group: 'trades', ready: true },
  { id: 'targets', sr: 'Mete za trejd', group: 'trades', ready: false },  // rezervisano
  { id: 'finder', sr: 'Pronađi trejd', group: 'trades', ready: false },   // rezervisano
];
const pageReady = id => !!APP_PAGES.find(p => p.id === id && p.ready);
const pageLabel = id => t(APP_PAGES.find(p => p.id === id)?.sr || 'Pregled');
const tradePages = () => APP_PAGES.filter(p => p.group === 'trades' && p.ready);

/**
 * Registar veza između stranica: izvor, uslov (proverava ga mesto prikaza), tekst, cilj, kontekst koji se prenosi.
 * on: false = upisano, isključeno dok alat ne postoji. replaces: veza koja zamenjuje drugu kad se uključi.
 * row: dugme uz red (ne broji se u ograničenje preporuka).
 */
const LINKS = [
  { id: 'ov-open-trade', from: 'overview', sr: 'Otvori u analizi', to: 'trade', ctx: ['tab'], row: true, on: true },
  { id: 'ov-ir', from: 'overview', sr: 'Prebaci na IR', to: 'team', ctx: ['player'], row: true, on: true },
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
  { id: 'league-finder', from: 'league', sr: 'Trejduj sa ovim timom', to: 'finder', ctx: ['team'], row: true, replaces: 'league-trade-with', on: false },
  { id: 'targets-find', from: 'targets', sr: 'Nađi trejd za njega', to: 'finder', ctx: ['player', 'team'], row: true, on: false },
  { id: 'finder-open', from: 'finder', sr: 'Otvori u analizi', to: 'trade', ctx: ['tab', 'fromSearch'], row: true, on: false },
  { id: 'finder-empty', from: 'finder', sr: 'Proširi na druge timove', to: 'targets', ctx: [], on: false },
  { id: 'trade-better', from: 'trade', sr: 'Nađi bolji trejd sa ovim timom', to: 'finder', ctx: ['team', 'cats'], on: false },
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
const pageHash = (page, id = state.scope) => `#league-${id}/${page}`;
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
const BACK_LABEL = { overview: 'Nazad na Pregled', team: 'Nazad na Moj tim', league: 'Nazad na Ligu', trade: 'Nazad na Analizu trejda' };
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
    case 'ov-ir': state.ui.highlight = pid; setBack('team'); goPage('team'); return;
    case 'ov-few-teams': case 'ov-empty': setBack(l.to); goPage(l.to); return;
    case 'team-trade': setBack('trade'); openInAnalysis([[pid], []]); goPage('trade'); return;
    case 'league-trade-with': setBack('trade'); openInAnalysis([[], []], { opp: ds.opp }); goPage('trade'); return;
    case 'league-want': setBack('trade'); openInAnalysis([[], [pid]], { opp: ds.opp }); goPage('trade'); return;
    case 'trade-edit-roster':
      if (ds.kind === 'opp') { state.leagueTeam = state.rosters.oppSel || null; setBack('league'); goPage('league'); }
      else { setBack('team'); goPage('team'); }
      return;
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

/** Upozorenja o mojim igračima: OUT van IR dok je IR slobodan, pad minutaže, rizične vesti.
    Poređana po datumu, najnovije gore (stanje rostera i minutaža važe danas). all: sve vesti svih igrača sa rostera, i sa IR. */
function rosterAlerts({ all = false } = {}) {
  const r = state.rosters.my;
  if (!r?.players.length || !state.players.length) return [];
  const out = [], now = Date.now();
  const irFree = irCount(r) < ROSTER.IR;
  for (const x of r.players) {
    const p = state.byId.get(x.id); if (!p) continue;
    if (!x.ir && irFree && canIR(p)) out.push({ p, ts: now, kind: 'ir', txt: t('{n} je {s}, a IR mesto je slobodno.', { n: esc(p.name), s: esc(statusLabel(p)) }) });
  }
  for (const x of r.players) {
    const p = state.byId.get(x.id); if (!p || (x.ir && !all)) continue;
    const f = playerFacts(p);
    if (!x.ir && f.minS != null && f.minR != null && f.minR <= f.minS - MINUTES.ALERT) out.push({ p, ts: now, kind: 'min', txt: t('{n}: minutaža pada, {a} → {b} min poslednjih 15 dana.', { n: esc(p.name), a: Math.round(f.minS), b: Math.round(f.minR) }) });
    for (const fl of all ? f.flags : f.flags.slice(0, 1)) {
      out.push({ p, ts: Date.parse(fl.n.published) || 0, kind: 'news', txt: `${esc(p.name)}: ${esc(LANG === 'en' ? fl.f.en : fl.f.sr)} (${esc(shortDate(fl.n.published))})`, tip: newsTipHTML(fl.n) });
    }
  }
  out.sort((a, b) => b.ts - a.ts);
  return all ? out : out.slice(0, 5);
}
const alertIcon = a => (a.kind === 'news' ? '📰' : a.kind === 'min' ? '⏬' : '⚕');
const alertsListHTML = list => `<ul class="alerts">${list.map(a => `<li class="al-${a.kind}" ${a.tip ? `data-tip-html="${esc(a.tip)}"` : ''}><span>${alertIcon(a)} ${a.txt}</span>
    ${a.kind === 'ir' ? linkHTML('ov-ir', { attrs: `data-player="${a.p.id}"` }) : ''}</li>`).join('')}</ul>`;
/** Svi alerti igrača sa mog rostera, najnoviji gore */
function showAllAlerts() {
  const list = rosterAlerts({ all: true });
  showModal({ title: t('Svi alerti'), wide: true, cancel: t('Zatvori'),
    body: list.length ? `<p class="pnote">${t('Svi igrači sa tvog rostera, i oni na IR. Najnovije gore.')}</p>${alertsListHTML(list)}` : `<p class="pnote">${t('Nema upozorenja za tvoje igrače.')}</p>` });
}

/* ---------- Stranica: Pregled ---------- */
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
  const st = lg.standings || {};
  const place = st.rank ? t('{n}. od {m}', { n: st.rank, m: lg.teams || '?' }) : '';
  const summary = `<section class="pcard"><h3>${t('Moj tim ukratko')}</h3>
    <div class="ov-team"><b>${esc(lg.teamName || t('Moj tim'))}</b>
      <span>${t('{a}/{b} aktivnih · {c}/{d} IR', { a: activeCount(r), b: ROSTER.ACTIVE, c: irCount(r), d: ROSTER.IR })}</span>
      ${place ? `<span>${t('Mesto')}: ${place}</span>` : ''}${st.record ? `<span>${t('Skor')}: ${esc(st.record)}</span>` : ''}</div>
    <div class="r-meta">${t('Ažurirano: {d}', { d: fmtShortDate(r.updated) })}</div></section>`;

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
  : `<section class="pcard"><h3>${t('Kategorije mog tima')}</h3>
    <div class="catgrid">${CATS.map(c => `<div class="catcell${puntCls(c)}"><span class="cl">${c.label}</span><b>${catVal(c, me?.tot.vals[c.key])}</b>
      ${rk[c.key] ? `<span class="rk">${t('{n}. od {m}', { n: rk[c.key].rank, m: rk[c.key].of })}</span>` : ''}${tag(c)}</div>`).join('')}</div>
    ${ranks ? `<p class="pnote">${t('Rang među {n} unetih timova. Zbir aktivnih igrača, {p}.', { n: teams.length, p: PERIODS.find(p => p.key === state.period).label.toLowerCase() })}</p>`
      : `<p class="pnote">${t('Zbir aktivnih igrača. Uneto {a} od {b} timova.', { a: teams.length, b: lg.teams || '?' })}</p>${linkHTML('ov-few-teams', { card: 'cats' })}`}${notCountedHTML()}</section>`;

  const alerts = rosterAlerts();
  const allN = alerts.length ? rosterAlerts({ all: true }).length : 0;
  const alertsCard = `<section class="pcard"><h3>${t('Upozorenja')}</h3>${alerts.length
    ? `${alertsListHTML(alerts)}<button type="button" class="linkbtn al-all" data-action="all-alerts">${t('Svi alerti ({n})', { n: allN })} →</button>`
    : `<p class="pnote">${t('Nema upozorenja za tvoje igrače.')}</p>`}</section>`;

  const tabs = scopeTabs().tabs.filter(tabHasPlayers);
  const tradesCard = `<section class="pcard"><h3>${t('Otvoreni trejdovi')}</h3>${tabs.length
    ? `<ul class="olist">${tabs.map(tb => { const sc = tabScore(tb); return `<li><button type="button" class="orow" data-link="ov-open-trade" data-tab="${tb.id}">
        <span class="os"><span class="give-t">${namesOf(tb.teams[GIVE].ids)}</span> → <span class="get-t">${namesOf(tb.teams[GET].ids)}</span></span>
        ${sc?.points ? `<span class="osc"><b class="${sc.points.diff > 0.05 ? 'w' : sc.points.diff < -0.05 ? 'l' : ''}">${fmtPts(sc.points.diff)}</b> ${t('FPts po utakmici')}</span>`
          : sc ? `<span class="osc"><span class="get-t">${t('Dobijaš')}</span> <b class="${sc.get > sc.give ? 'w' : ''}">${sc.get}</b> : <b class="${sc.give > sc.get ? 'l' : ''}">${sc.give}</b> <span class="give-t">${t('Daješ')}</span>${sc.ties ? `<small>${t('{n} nerešeno', { n: sc.ties })}</small>` : ''}</span>` : ''}</button></li>`; }).join('')}</ul>`
    : `<p class="pnote">${t('Nema otvorenih trejdova.')}</p>`}</section>`;

  const hist = state.history.slice(0, 3);
  const histCard = hist.length ? `<section class="pcard"><h3>${t('Poslednji trejdovi')}</h3><ul class="olist">${hist.map(h => `<li><button type="button" class="orow" data-action="ov-hist" data-id="${h.id}">
      <span class="os"><span class="hist-date">${fmtDate(h.date)} · ${h.done ? t('obavljen') : t('ideja')}</span><br>${(h.teams[GIVE]?.ids || []).map(id => esc(h.names?.[id] || state.byId.get(id)?.name || id)).join(', ') || '–'} → ${(h.teams[GET]?.ids || []).map(id => esc(h.names?.[id] || state.byId.get(id)?.name || id)).join(', ') || '–'}</span></button></li>`).join('')}</ul></section>` : '';

  return `${H}<div class="pgrid">${summary}${alertsCard}</div>${cats}${importRanksHTML(lg)}<div class="pgrid">${tradesCard}${histCard}</div>`;
}

/* ---------- Uređivanje sačuvanog rostera (Moj tim i timovi u Ligi) ---------- */
/** kind: 'my' ili 'lt' (tim otvoren u Ligi). rowActions(p, x) vraća dugmad uz red. */
function savedRosterTable(kind, rowActions) {
  const r = rosterOf(kind);
  const P = id => state.byId.get(id);
  const hl = state.ui.highlight;
  const rows = [];
  for (const x of r.players.filter(y => !y.ir)) { const p = P(x.id); if (p) rows.push(rosterRow(p, kind, { actions: rowActions(p, x), saved: true, cls: hl === p.id ? 'hl' : '' })); }
  const ir = r.players.filter(y => y.ir);
  if (ir.length) {
    rows.push(`<tr class="irhead"><td colspan="${CATS.length + 3}">${t('IR · ne računa se u zbirove ({a}/{b})', { a: ir.length, b: ROSTER.IR })}</td></tr>`);
    for (const x of ir) { const p = P(x.id); if (p) rows.push(rosterRow(p, kind, { tags: [{ text: 'IR', cls: 'tag-ir' }], cls: `ir ${hl === p.id ? 'hl' : ''}`, actions: rowActions(p, x), saved: true, ir: true })); }
  }
  const tot = sumPlayers(activeIdsOf(r));
  return `<div class="tscroll"><table class="rtable"><thead>${headerRow()}</thead><tbody>${rows.join('')}</tbody>
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

/* ---------- Stranica: Moj tim ---------- */
function renderTeamPage() {
  const lg = currentLeague();
  return `<h2 class="page-t">${t('Moj tim')}${lg.teamName ? ` <span class="hint">${esc(lg.teamName)}</span>` : ''}${isPasted(lg) ? ` <button type="button" class="linkbtn" data-action="paste-open" data-target="my">📋 ${t('Nalepi ponovo')}</button>` : ''}</h2>
    <section class="card">${rosterEditorHTML('my', (p, x) => linkHTML('team-trade', { cls: 'mini trade', attrs: `data-player="${p.id}" title="${esc(t('Trejduj ga'))}" aria-label="${esc(t('Trejduj ga'))}"`, label: '⇄' }) + rosterBtns('my', p, x),
      t('Unesi svoj roster ({a} aktivnih + {b} IR). Čuva se samo u ovom browseru.', { a: ROSTER.ACTIVE, b: ROSTER.IR }))}</section>`;
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
    ${standingsHTML(lg)}</section>${importRanksHTML(lg)}`; // puna tabela i plasman po kategorijama (uvoz lige)
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
      ${linkHTML('league-trade-with', { attrs: `data-opp="${oid}"` })}</div>`;
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
  const html = state.page === 'team' ? renderTeamPage() : state.page === 'league' ? renderLeaguePage() : renderOverview();
  el.innerHTML = html;
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
  const badge = n ? `<span class="nbadge" aria-label="${esc(openN(n))}">${n}</span>` : '';
  // title: tooltip kad je bočni meni skupljen u ikonice (ispod 1024 px)
  const item = (id, icon, label, extra = '') => `<a href="${pageHash(id)}" class="nitem ${state.page === id ? 'on' : ''}" data-goto="${id}" title="${esc(label)}" ${state.page === id ? 'aria-current="page"' : ''}>${icon}<span class="nlabel">${label}</span>${extra}</a>`;
  const tp = tradePages();
  side.innerHTML = `<nav class="snav" aria-label="${t('Stranice lige')}">
    ${item('overview', NAV_ICON.overview, t('Pregled'))}${item('team', NAV_ICON.team, t('Moj tim'))}${item('league', NAV_ICON.league, t('Liga'))}
    <div class="ngroup">${t('Trejdovi')}</div>
    ${tp.map(p => item(p.id, NAV_ICON.trades, t(p.sr), p.id === 'trade' ? badge : '')).join('')}</nav>`;
  const tradesOn = tp.some(p => p.id === state.page);
  bottom.innerHTML = `<nav class="bnav" aria-label="${t('Stranice lige')}">
    ${item('overview', NAV_ICON.overview, t('Pregled'))}${item('team', NAV_ICON.team, t('Moj tim'))}${item('league', NAV_ICON.league, t('Liga'))}
    ${tp.length === 1
      ? `<a href="${pageHash(tp[0].id)}" class="nitem ${tradesOn ? 'on' : ''}" data-goto="${tp[0].id}">${NAV_ICON.trades}<span>${t('Trejdovi')}</span>${badge}</a>`
      : `<button type="button" class="nitem ${tradesOn ? 'on' : ''}" data-action="trades-menu">${NAV_ICON.trades}<span>${t('Trejdovi')}</span>${badge}</button>`}</nav>`;
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
  if (pg) { e.preventDefault(); clearBack(); goPage(pg.dataset.goto); return; } // stavka navigacije: novi početak, bez "Nazad"
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
  if (el.dataset.period) { state.period = el.dataset.period; saveState(); render(); return; }
  const ti = +el.dataset.team;
  switch (el.dataset.action) {
    case 'refresh': loadPlayers(true); loadSchedule(true); break;
    case 'go-back': { const b = state.back; clearBack(); if (b) location.hash = b.hash; break; }
    case 'league-menu': if (document.getElementById('popmenu')) closePopMenu(); else leagueMenu(el); break;
    case 'trades-menu': if (document.getElementById('popmenu')) closePopMenu(); else openPopMenu(el, tradePages().map(p => `<a role="menuitem" class="pm-item" href="${pageHash(p.id)}" data-goto="${p.id}">${t(p.sr)}</a>`).join('')); break;
    case 'all-alerts': showAllAlerts(); break;
    case 'open-in-league': location.href = shareURL() + '&mv=1'; break; // isti izbor lige kao za deljeni link, bez okretanja strana
    case 'ov-hist': { const id = +el.dataset.id; setBack('trade'); openTrade(id); goPage('trade'); break; }
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
    case 'import': importData(); break;
    case 'r-ir': toggleIR(el.dataset.kind, +el.dataset.id); break;
    case 'notice-close': state.notice = null; state.noticeLink = null; render(); break;
    case 'shared-close': state.sharedOpen = false; render(); break;
    case 'share': shareLink(el); break;
    case 'hist-open': openTrade(+el.dataset.id); break;
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
// otvoreno/zatvoreno stanje sklopivih sekcija
document.addEventListener('toggle', e => {
  const f = e.target.dataset?.fold;
  if (f === 'my') { state.ui.myOpen = e.target.open; saveUI(); }
  if (f === 'opp') { state.ui.oppOpen = e.target.open; saveUI(); }
  if (f === 'hist') { state.histOpen = e.target.open; }
}, true);
document.addEventListener('change', e => {
  if (e.target.matches('[data-langsel]')) {
    const inModal = !!e.target.closest('#modal');
    setLang(e.target.value);
    if (inModal) openProfile();
    return;
  }
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

/* ---------- Tooltip: hover na desktopu, tap na telefonu ([data-tip]) ---------- */
const tipEl = Object.assign(document.createElement('div'), { id: 'tip', hidden: true });
document.body.appendChild(tipEl);
let tipOwner = null;
function showTip(el) {
  tipOwner = el;
  if (el.dataset.tipHtml) tipEl.innerHTML = el.dataset.tipHtml; else tipEl.textContent = el.dataset.tip;
  tipEl.hidden = false;
  const r = el.getBoundingClientRect(), t = tipEl.getBoundingClientRect();
  const left = Math.max(8, Math.min(r.left + r.width / 2 - t.width / 2, innerWidth - t.width - 8));
  const top = r.top - t.height - 6 < 8 ? r.bottom + 6 : r.top - t.height - 6;
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
  for (const lg of profile.leagues) { const f = leagueFormatOf(lg); if (JSON.stringify(f) !== JSON.stringify(lg.leagueFormat)) { lg.leagueFormat = f; changed = true; } }
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
if (!EMBED?.mini) loadSchedule();
