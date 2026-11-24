#!/usr/bin/env python3
"""
Pravi javne stranice RosterSwing sajta kao obične HTML fajlove (sav tekst je u HTML-u, zbog pretrage).

Pokretanje (iz korena projekta):  python3 tools/build_pages.py
Pravi: index.html, sr/index.html (početna), trade-analyzer/, sr/trade-analyzer/ (analiza trejda bez lige),
privacy/, sr/privacy/, about/, sr/about/, robots.txt, sitemap.xml

Prelazak na sopstveni domen: promeni samo SITE_URL ispod i ponovo pokreni skriptu.
Linkovi između stranica su relativni, pa sajt radi na bilo kojoj osnovnoj putanji.
"""
import hashlib
import json
import os
import re
from html import escape

# ---------------------------------------------------------------------------
# KONFIGURACIJA (jedino mesto)
# ---------------------------------------------------------------------------
SITE_URL = 'https://banecvenic.github.io/fantasy-trade-analyzer/'   # kanonska osnova, sa kosom crtom na kraju
CONTACT_URL = 'https://github.com/banecvenic/fantasy-trade-analyzer/issues'
UPDATED = '2026-11-17'

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# stranica -> putanja po jeziku (relativno od korena sajta)
PAGES = {
    'home':     {'en': '', 'sr': 'sr/'},
    'analyzer': {'en': 'trade-analyzer/', 'sr': 'sr/trade-analyzer/'},
    'privacy': {'en': 'privacy/', 'sr': 'sr/privacy/'},
    'about':   {'en': 'about/', 'sr': 'sr/about/'},
    'howto':   {'en': 'how-to-import/', 'sr': 'sr/how-to-import/'},
    'fa':      {'en': 'free-agents/', 'sr': 'sr/free-agents/'},
    'finder':  {'en': 'trade-finder/', 'sr': 'sr/trade-finder/'},
}

# Alati sa početne: ready=False prikazuje "Coming soon"; kad alat postoji, ready=True i href (relativno od korena sajta)
TOOLS = {
    'finder':  {'ready': False, 'href': None},   # Find the player your team needs
    'builder': {'ready': True, 'href': None, 'page': 'finder'},   # Build a trade between two teams: /trade-finder/ (po jeziku)
    'fa':      {'ready': True, 'href': None, 'pick': True},   # Free agent pickups: otvara "Izaberi ligu" (nav.js), radi samo za uvezene lige
}

# ---------------------------------------------------------------------------
# TEKSTOVI
# T = stranica /trade-analyzer/ (i zajednički delovi), HOME = početna
# ---------------------------------------------------------------------------
HOME = {
    'en': {
        'title': 'RosterSwing | Fantasy Basketball Tools for Smarter Trades',
        'desc': 'Free fantasy basketball tools: analyze trades category by category, see how they change your roster, and find the players your team needs.',
        'h1': 'Fantasy basketball tools for smarter trades',
        'lead': 'Analyze trades category by category, see how they change your roster, and find the players your team needs.',
        'cta': 'Analyze a Trade',
        'cta2': 'Add your league',
        'og_image': 'assets/og-home-en.png',
        'og_alt': 'RosterSwing Fantasy Basketball Tools',
        'preview_label': 'Example trade analysis',
        'pv': {'give': 'You give', 'get': 'You get', 'pg': 'Your guard', 'c': 'Their center', 'plus': 'Pluses', 'risk': 'Risks',
               'p1': 'Gain rebounds and blocks (+3.1 REB, +1.2 BLK).', 'p2': 'Better shooting: team FG% +.006.', 'r1': 'You give up assists (−3.4 AST).',
               'verdict': 'The trade gains you 6 categories, you lose 3', 'win': 'you win it', 'lose': 'you lose it', 'tie': 'tie'},
        'mini_h': 'Try a quick trade',
        'mini_lead': 'Up to 2 players per side. Season averages per game.',
        'mini_fmt': '9-cat · other formats in the full analysis',
        'mini_give_ph': 'Who do you give…', 'mini_get_ph': 'Who do you get…',
        'mini_loading': 'Loading players…', 'mini_error': 'Players could not be loaded. Try again later.', 'mini_none': 'No players found',
        'mini_full': 'See full analysis', 'mini_hint': 'Add a player on each side to see the score.', 'mini_remove': 'Remove',
        'mini_stats': 'Full stats', 'mini_open': 'Open the full analysis', 'mini_win': 'you win it', 'mini_lose': 'you lose it', 'mini_tie': 'tie', 'mini_ties': '{n} tied', 'mini_cat': 'Cat.', 'mini_diff': 'Diff', 'mini_total': 'Total',
        'league_h': 'Add your league and team',
        'league_p': 'Save your roster and see how every trade changes your team, with your league roster size and IR spots. Manual entry for now.',
        'league_cta': 'Add your league',
        'ba': {'title': 'My team before and after', 'before': 'Before', 'after': 'After', 'diff': 'Difference'},
        'finder_h': 'Find the player your team needs',
        'finder_p': 'Pick the categories you want to improve and see players on other teams who bring them.',
        'builder_h': 'Build a trade between two teams',
        'builder_p': 'Pick your team and one more, mark who you will not trade, and get fair trade ideas from 1 for 1 up to 4 for 4.',
        'fa_h': 'Find free agents who fit your team',
        'fa_p': 'Uses your imported league to find free agents who fit your team, including players whose minutes are growing.',
        'fa_cta': 'Choose a league', 'learn_more': 'Learn more',
        'soon': 'Coming soon', 'open_tool': 'Open',
        'my_league': 'My league', 'continue_bar': 'Continue where you left off',
        'continue_btn': 'Continue: {name}',
    },
    'sr': {
        'title': 'RosterSwing | Alati za fantasy košarku',
        'desc': 'Besplatni alati za fantasy košarku: analiziraj trejdove po kategorijama, vidi kako menjaju tvoj roster i nađi igrače koji trebaju tvom timu.',
        'h1': 'Alati za fantasy košarku i pametnije trejdove',
        'lead': 'Analiziraj trejdove po kategorijama, vidi kako menjaju tvoj roster i nađi igrače koji trebaju tvom timu.',
        'cta': 'Analiziraj trejd',
        'cta2': 'Dodaj svoju ligu',
        'og_image': 'assets/og-home-sr.png',
        'og_alt': 'RosterSwing alati za fantasy košarku',
        'preview_label': 'Primer analize trejda',
        'pv': {'give': 'Daješ', 'get': 'Dobijaš', 'pg': 'Tvoj bek', 'c': 'Njihov centar', 'plus': 'Plusevi', 'risk': 'Rizici',
               'p1': 'Dobijaš skokove i blokade (+3.1 REB, +1.2 BLK).', 'p2': 'Bolji šut: FG% tima +.006.', 'r1': 'Gubiš asistencije (−3.4 AST).',
               'verdict': 'Trejd ti donosi 6 kategorija, gubiš 3', 'win': 'dobijaš', 'lose': 'gubiš', 'tie': 'nerešeno'},
        'mini_h': 'Probaj brzi trejd',
        'mini_lead': 'Do 2 igrača po strani. Prosek po utakmici za sezonu.',
        'mini_fmt': '9-cat · drugi formati u punoj analizi',
        'mini_give_ph': 'Koga daješ…', 'mini_get_ph': 'Koga dobijaš…',
        'mini_loading': 'Učitavam igrače…', 'mini_error': 'Igrači nisu učitani. Pokušaj kasnije.', 'mini_none': 'Nema igrača',
        'mini_full': 'Pogledaj celu analizu', 'mini_hint': 'Dodaj igrača na svaku stranu da vidiš rezultat.', 'mini_remove': 'Ukloni',
        'mini_stats': 'Cela statistika', 'mini_open': 'Otvori celu analizu', 'mini_win': 'dobijaš', 'mini_lose': 'gubiš', 'mini_tie': 'nerešeno', 'mini_ties': '{n} nerešeno', 'mini_cat': 'Kat.', 'mini_diff': 'Razlika', 'mini_total': 'Ukupno',
        'league_h': 'Dodaj svoju ligu i tim',
        'league_p': 'Sačuvaj roster i vidi kako svaki trejd menja tvoj tim, sa veličinom rostera i IR mestima tvoje lige. Za sada se roster unosi ručno.',
        'league_cta': 'Dodaj svoju ligu',
        'ba': {'title': 'Moj tim pre i posle', 'before': 'Pre', 'after': 'Posle', 'diff': 'Razlika'},
        'finder_h': 'Nađi igrača koji treba tvom timu',
        'finder_p': 'Izaberi kategorije koje hoćeš da popraviš i vidi igrače iz drugih ekipa koji ih donose.',
        'builder_h': 'Napravi trejd između dva tima',
        'builder_p': 'Izaberi svoj i još jedan tim, označi koga ne daješ i dobij fer predloge trejdova, od 1 za 1 do 4 za 4.',
        'fa_h': 'Nađi slobodne igrače za svoj tim',
        'fa_p': 'Iz tvoje uvezene lige pronalazi slobodne igrače koji odgovaraju tvom timu, uključujući one kojima minutaža raste.',
        'fa_cta': 'Izaberi ligu', 'learn_more': 'Saznaj više',
        'soon': 'Uskoro', 'open_tool': 'Otvori',
        'my_league': 'Moja liga', 'continue_bar': 'Nastavi gde si stao',
        'continue_btn': 'Nastavi: {name}',
    },
}

T = {
    'en': {
        'title': 'Fantasy Basketball Trade Analyzer | RosterSwing',
        'desc': 'Compare fantasy basketball trades category by category. See what each side gains and gives up, and how the deal would change your roster.',
        'h1': 'Fantasy Basketball Trade Analyzer',
        'lead': 'See what a trade does to your roster. Compare both sides and check which categories get stronger or weaker before you make the move.',
        'cta': 'Analyze a Trade',
        'og_image': 'assets/og-en.png',
        'og_alt': 'RosterSwing Fantasy Basketball Trade Analyzer',
        'locale': 'en_US',
        'lang_other': 'Srpski',
        'my_leagues': 'My leagues',
        'continue': 'Continue: {name}',
        'your_leagues': 'Your leagues',
        'add_league': 'Save your league',
        'tool_h': 'Compare a trade',
        'tool_lead': 'Add players to You give and You get. Per game stats for 9-category head to head leagues.',
        'loading': 'Loading players…',
        'how_h': 'How it works',
        'steps': [
            ('Add the players you give', 'Type a name in You give. One player or a whole package.'),
            ('Add the players you get', 'Fill in You get. The fantasy basketball trade calculator adds up both sides per game.'),
            ('Read the result', 'See which categories get stronger or weaker, the score across all 9 categories, and a short report on minutes, trends and injuries.'),
        ],
        'what_h': 'What you get',
        'feats': [
            ('Category by category comparison', 'Points, rebounds, assists, threes, steals, blocks, FG%, FT% and turnovers, with the difference for each one.'),
            ('Weighted FG% and FT%', 'Percentages come from makes and attempts, so a high percentage on a few shots does not count as much as volume.'),
            ('Minutes and trends', 'Switch between season, last 7, 15 and 30 days, and projections. See who is playing more or less lately.'),
            ('Injuries and news', 'Injury status, missed games and the latest player news in the trade report.'),
            ('Impact on your team', 'Add your league and roster to see your team before and after the trade, with roster size and IR spots from your league.'),
            ('Text for AI analysis', 'Copy a ready summary of the trade with stats, news and your roster, and paste it into the AI assistant you use.'),
        ],
        'faq_h': 'Frequently asked questions',
        # početna: pitanja o sajtu
        'faq': [
            ('Where does the data come from?',
             'Player stats, projections and news come from publicly available ESPN fantasy data. Numbers are averages per game for the period you pick.'),
            ('Does it work for Yahoo leagues?',
             'Yes. The tools compare players, not platforms, so they work for Yahoo, ESPN and other leagues with 9-category scoring. You can set your league roster size, including IR spots. Stats always come from the same source.'),
            ('Do I need an account?',
             'No. Leagues, rosters and trades are saved only in your browser on this device. There is no account and no server that stores your data.'),
        ],
        # /trade-analyzer/: pitanja o kalkulatoru
        'faq_ta': [
            ('How are FG% and FT% calculated?',
             'From the total makes and attempts of all players on each side, not by averaging percentages. A player who shoots 60% on 3 attempts moves the result less than one who shoots 50% on 15 attempts. With your roster added, the tool also shows how much your team percentage changes.'),
            ('What is 9-cat?',
             '9-cat is the most common category format in fantasy basketball: points, rebounds, assists, three pointers, steals, blocks, field goal percentage, free throw percentage and turnovers. In head to head leagues you win or lose each category every week. For turnovers, fewer is better.'),
            ('Is this fantasy basketball trade calculator free?',
             'Yes. RosterSwing is free to use. There is nothing to buy and no sign-up.'),
            ('What does "low volume" mean?',
             'A percentage built on very few attempts, under 3 field goal or 1.5 free throw attempts per game on one side. It barely changes a team percentage, so when the trade does not change your saved roster, that category counts as a tie in the score. With your roster added, a category also counts as a tie when your team percentage changes by less than .001.'),
        ],
        'guide_h': 'How to evaluate a 9-cat trade',
        'guide': [
            ('Count category by category', 'In 9-cat head to head you win categories, not points. Start from the totals of each side in every category. A trade that wins five categories by a little can help more than one that wins two by a lot.'),
            ('Percentages are weighted', 'FG% and FT% are not averages of player percentages. They come from total makes and attempts, so a high-volume shooter moves your team percentage much more than a player who rarely shoots. Look at how your team percentage changes, not only at the players.'),
            ('Minutes and role', 'Stats follow minutes. Compare both players over the same period, the whole season or the last 15 days, and check whether a role is growing or shrinking. A player whose minutes just went up can be worth more than his season averages show.'),
            ('Games played and health', 'A player who misses games does not help your weekly totals. Check how many games each player has played and the latest injury news before you accept.'),
            ('2-for-1 trades and your roster spot', 'When you get two players for one, someone has to leave your roster, so count that player as part of the trade. When you get one player for two, you open a spot for the waiver wire, and that spot has value too.'),
            ('Punting', 'If you punt a category, take it out of the comparison. A trade that only loses your punted categories can be a clear win for your build.'),
            ('Your team, not a vacuum', 'The same trade can be good for one team and bad for another. Gains in categories where you are weak matter more than gains where you already lead your league.'),
        ],
        'save_row': 'Save your team and see how this trade changes it',
        'footer_about': 'About',
        'footer_privacy': 'Privacy',
        'footer_fa': 'Free agent pickups',
        'footer_howto': 'How to import a league',
        'footer_contact': 'Contact',
        'disclaimer': 'RosterSwing is not affiliated with ESPN, Yahoo or the NBA. Stats come from publicly available sources.',
        'skip': 'Skip to the trade analyzer',
        'pre': {'periods': ['Season', '7 days', '15 days', '30 days', 'Projection'], 'score': 'Add players to You give and You get to see the comparison.',
                'give': ('You give', 'My team', 'Who do you give…'), 'get': ('You get', 'Opponent', 'Who do you get…'), 'empty': 'No players yet. Type a name above.'},
    },
    'sr': {
        'title': 'Fantasy košarka: kalkulator za trejdove | RosterSwing',
        'desc': 'Uporedi fantasy trejd po kategorijama. Vidi šta dobijaš, šta daješ i kako bi izgledao tvoj tim posle trejda.',
        'h1': 'Kalkulator za fantasy trejdove',
        'lead': 'Vidi šta trejd radi tvom rosteru. Uporedi obe strane i proveri koje kategorije jačaju, a koje slabe, pre nego što povučeš potez.',
        'cta': 'Analiziraj trejd',
        'og_image': 'assets/og-sr.png',
        'og_alt': 'RosterSwing kalkulator za fantasy trejdove',
        'locale': 'sr_RS',
        'lang_other': 'English',
        'my_leagues': 'Moje lige',
        'continue': 'Nastavi: {name}',
        'your_leagues': 'Tvoje lige',
        'add_league': 'Sačuvaj svoju ligu',
        'tool_h': 'Uporedi trejd',
        'tool_lead': 'Dodaj igrače u Daješ i Dobijaš. Prosek po utakmici, za lige sa 9 kategorija (H2H).',
        'loading': 'Učitavam igrače…',
        'how_h': 'Kako radi',
        'steps': [
            ('Dodaj igrače koje daješ', 'Ukucaj ime u polje Daješ. Jedan igrač ili ceo paket.'),
            ('Dodaj igrače koje dobijaš', 'Popuni Dobijaš. Kalkulator za fantasy trejdove sabira obe strane po utakmici.'),
            ('Pročitaj rezultat', 'Vidi koje kategorije jačaju, a koje slabe, rezultat u svih 9 kategorija i kratak izveštaj o minutaži, formi i povredama.'),
        ],
        'what_h': 'Šta dobijaš',
        'feats': [
            ('Poređenje po kategorijama', 'Poeni, skokovi, asistencije, trojke, ukradene, blokade, FG%, FT% i izgubljene lopte, uz razliku za svaku.'),
            ('Ponderisani FG% i FT%', 'Procenti se računaju iz pogođenih i ukupnih šuteva, pa visok procenat na malo šuteva ne vredi koliko obim.'),
            ('Minutaža i forma', 'Sezona, poslednjih 7, 15 i 30 dana, i projekcija. Vidi ko u poslednje vreme igra više, a ko manje.'),
            ('Povrede i vesti', 'Status povrede, propuštene utakmice i najnovije vesti o igraču u izveštaju o trejdu.'),
            ('Uticaj na tvoj tim', 'Dodaj ligu i roster i vidi tim pre i posle trejda, sa veličinom rostera i IR mestima iz tvoje lige.'),
            ('Tekst za AI analizu', 'Kopiraj gotov sažetak trejda sa brojkama, vestima i tvojim rosterom i nalepi ga u AI asistenta koga koristiš.'),
        ],
        'faq_h': 'Česta pitanja',
        'faq': [
            ('Odakle su podaci?',
             'Statistika, projekcije i vesti o igračima dolaze iz javno dostupnih ESPN fantasy podataka. Brojke su prosek po utakmici za period koji izabereš.'),
            ('Da li radi za Yahoo lige?',
             'Radi. Alati porede igrače, ne platforme, pa rade za Yahoo, ESPN i druge lige sa 9 kategorija. Možeš da podesiš veličinu rostera svoje lige, uključujući IR mesta. Statistika uvek dolazi iz istog izvora.'),
            ('Da li mi treba nalog?',
             'Ne treba. Lige, rosteri i trejdovi čuvaju se samo u tvom browseru, na ovom uređaju. Nema naloga i nema servera koji čuva tvoje podatke.'),
        ],
        'faq_ta': [
            ('Kako se računaju FG% i FT%?',
             'Iz zbira pogođenih i ukupnih šuteva svih igrača na strani, a ne kao prosek procenata. Igrač koji šutira 60% na 3 pokušaja manje pomera rezultat od igrača koji šutira 50% na 15 pokušaja. Kad uneseš roster, alat pokazuje i koliko se menja procenat tvog tima.'),
            ('Šta je 9-cat?',
             '9-cat je najčešći format sa kategorijama u fantasy košarci: poeni, skokovi, asistencije, trojke, ukradene lopte, blokade, procenat šuta iz igre, procenat slobodnih bacanja i izgubljene lopte. U H2H ligama svake nedelje dobijaš ili gubiš svaku kategoriju. Kod izgubljenih lopti, manje je bolje.'),
            ('Da li je kalkulator za fantasy trejdove besplatan?',
             'Jeste. RosterSwing je besplatan. Nema plaćanja i nema registracije.'),
            ('Šta znači „mali obim“?',
             'Procenat na vrlo malo šuteva, ispod 3 šuta iz igre ili 1.5 slobodnih bacanja po utakmici na jednoj strani. Takav procenat skoro ne menja procenat tima, pa se, kad trejd ne menja tvoj uneti roster, ta kategorija računa kao nerešena. Sa unetim rosterom, kategorija je nerešena i kad se procenat tima menja manje od .001.'),
        ],
        'guide_h': 'Kako proceniti 9-cat trejd',
        'guide': [
            ('Broji kategoriju po kategoriju', 'U 9-cat H2H ligama dobijaš kategorije, ne poene. Kreni od zbira obe strane u svakoj kategoriji. Trejd koji dobija pet kategorija za malo može da pomogne više od trejda koji dobija dve za mnogo.'),
            ('Procenti su ponderisani', 'FG% i FT% nisu prosek procenata igrača. Računaju se iz ukupno pogođenih i ukupno pokušanih šuteva, pa šuter sa mnogo pokušaja pomera procenat tima mnogo više od igrača koji retko šutira. Gledaj kako se menja procenat tvog tima, ne samo igrača.'),
            ('Minutaža i uloga', 'Brojke prate minute. Poredi oba igrača u istom periodu, cela sezona ili poslednjih 15 dana, i proveri da li uloga raste ili pada. Igrač kome su minuti upravo porasli može da vredi više nego što pokazuje prosek sezone.'),
            ('Odigrane utakmice i zdravlje', 'Igrač koji propušta utakmice ne pomaže tvom nedeljnom zbiru. Pre nego što prihvatiš, proveri koliko je utakmica svaki igrač odigrao i najnovije vesti o povredama.'),
            ('Trejd 2 za 1 i mesto na rosteru', 'Kad dobijaš dva igrača za jednog, neko mora da ode sa rostera, pa i njega računaj kao deo trejda. Kad dobijaš jednog za dva, oslobađaš mesto za waiver, a i to mesto ima vrednost.'),
            ('Punt', 'Ako puntuješ kategoriju, izbaci je iz poređenja. Trejd koji gubi samo kategorije koje puntuješ može da bude čista dobit za tvoj tim.'),
            ('Tvoj tim, ne trejd sam za sebe', 'Isti trejd može da bude dobar za jedan tim, a loš za drugi. Dobitak u kategorijama u kojima si slab vredi više od dobitka tamo gde već vodiš u ligi.'),
        ],
        'save_row': 'Sačuvaj svoj tim i vidi kako trejd utiče na njega',
        'footer_about': 'O sajtu',
        'footer_privacy': 'Privatnost',
        'footer_fa': 'Pojačanja sa FA',
        'footer_howto': 'Kako uvesti ligu',
        'footer_contact': 'Kontakt',
        'disclaimer': 'RosterSwing nije povezan sa ESPN, Yahoo ni NBA. Statistika dolazi iz javno dostupnih izvora.',
        'skip': 'Pređi na kalkulator',
        'pre': {'periods': ['Sezona', '7 dana', '15 dana', '30 dana', 'Projekcija'], 'score': 'Dodaj igrače u Daješ i Dobijaš da vidiš poređenje.',
                'give': ('Daješ', 'Moj tim', 'Koga daješ…'), 'get': ('Dobijaš', 'Protivnik', 'Koga dobijaš…'), 'empty': 'Još nema igrača. Kucaj ime iznad.'},
    },
}

PRIVACY = {
    'en': {
        'title': 'Privacy Policy | RosterSwing',
        'desc': 'How RosterSwing handles your data: no accounts, no server, everything you enter stays in your browser.',
        'h1': 'Privacy Policy',
        'upd': 'Last updated: November 23, 2026',
        'body': f'''
<p>RosterSwing is a free set of fantasy basketball tools. It has no accounts, no sign-up and no server of its own that receives your data.</p>
<h2>What is stored and where</h2>
<p>Everything you enter is saved <strong>only in your browser</strong> (localStorage and IndexedDB) on the device you use:</p>
<ul>
<li>leagues and league settings (name, platform, roster size, standings you type in),</li>
<li>your roster and the opponent rosters you add,</li>
<li>open trades, trade history and saved trade ideas,</li>
<li>your profile name, if you enter one, and your language choice,</li>
<li>a temporary copy of player stats and per game stats (box scores), so the page loads faster and makes fewer requests.</li>
</ul>
<p>We do not receive, see or keep any of this. If you clear your browser data for this site, it is deleted. You can make a backup and delete everything from the settings in the app.</p>
<h2>What is loaded from other services</h2>
<p>To show stats, your browser connects directly to these services. Like any website, they can see your IP address and basic browser information:</p>
<ul>
<li><strong>ESPN</strong> fantasy data: player stats, projections, team schedules and player news,</li>
<li><strong>ESPN</strong> image server: player photos,</li>
<li><strong>ESPN, Sleeper and Fantrax</strong> public league data, only when you import a league: teams, rosters, scoring and standings,</li>
<li><strong>Google Fonts</strong>: the Inter font,</li>
<li><strong>GitHub Pages</strong>: hosts this website.</li>
</ul>
<p>RosterSwing does not use analytics, advertising or tracking cookies.</p>
<h2>Importing leagues</h2>
<p>We import only <strong>public</strong> leagues, from data that ESPN, Sleeper and Fantrax show to anyone. We never ask for your password, cookies (such as ESPN espn_s2 or SWID) or login tokens.</p>
<p>From an imported league we keep only what the tools need: team names and abbreviations, rosters, scoring settings and standings. We do not keep the real names of league members or their account IDs.</p>
<h2>Shared links and AI text</h2>
<p>A shared trade link contains only player IDs, the stats period, the scoring format and the language. Your rosters and history are not in the link.</p>
<p>"Copy for AI analysis" puts the text on your clipboard. Nothing is sent anywhere unless you paste it yourself.</p>
<h2>Contact</h2>
<p>Questions about privacy: <a href="{CONTACT_URL}" rel="noopener">{CONTACT_URL.replace('https://', '')}</a>.</p>
''',
    },
    'sr': {
        'title': 'Politika privatnosti | RosterSwing',
        'desc': 'Kako RosterSwing postupa sa tvojim podacima: bez naloga, bez servera, sve što uneseš ostaje u tvom browseru.',
        'h1': 'Politika privatnosti',
        'upd': 'Poslednja izmena: 23. novembar 2026.',
        'body': f'''
<p>RosterSwing je besplatan skup alata za fantasy košarku. Nema naloga, nema registracije i nema sopstveni server koji prima tvoje podatke.</p>
<h2>Šta se čuva i gde</h2>
<p>Sve što uneseš čuva se <strong>samo u tvom browseru</strong> (localStorage i IndexedDB) na uređaju koji koristiš:</p>
<ul>
<li>lige i podešavanja lige (naziv, platforma, veličina rostera, tabela koju uneseš),</li>
<li>tvoj roster i rosteri protivnika koje dodaš,</li>
<li>otvoreni trejdovi, istorija trejdova i sačuvane ideje,</li>
<li>ime profila, ako ga uneseš, i izabrani jezik,</li>
<li>privremena kopija statistike igrača i statistike po utakmici, da se stranica brže učita i šalje manje zahteva.</li>
</ul>
<p>Mi ništa od ovoga ne primamo, ne vidimo i ne čuvamo. Ako obrišeš podatke browsera za ovaj sajt, sve se briše. U podešavanjima aplikacije možeš da napraviš rezervnu kopiju i da obrišeš sve.</p>
<h2>Šta se učitava sa drugih servisa</h2>
<p>Da bi prikazao statistiku, tvoj browser se direktno povezuje sa ovim servisima. Kao i svaki sajt, oni mogu da vide tvoju IP adresu i osnovne podatke o browseru:</p>
<ul>
<li><strong>ESPN</strong> fantasy podaci: statistika, projekcije, raspored utakmica i vesti o igračima,</li>
<li><strong>ESPN</strong> server za slike: fotografije igrača,</li>
<li><strong>ESPN, Sleeper i Fantrax</strong> javni podaci lige, samo kad uvoziš ligu: timovi, rosteri, bodovanje i tabela,</li>
<li><strong>Google Fonts</strong>: font Inter,</li>
<li><strong>GitHub Pages</strong>: hostuje ovaj sajt.</li>
</ul>
<p>RosterSwing ne koristi analitiku, reklame ni kolačiće za praćenje.</p>
<h2>Uvoz liga</h2>
<p>Uvozimo samo <strong>javne</strong> lige, iz podataka koje ESPN, Sleeper i Fantrax prikazuju svima. Nikad ne tražimo lozinku, kolačiće (kao ESPN espn_s2 ili SWID) ni tokene za prijavu.</p>
<p>Iz uvezene lige čuvamo samo ono što alatima treba: imena i skraćenice timova, rostere, bodovanje i tabelu. Ne čuvamo prava imena članova lige ni ID-jeve njihovih naloga.</p>
<h2>Deljeni linkovi i tekst za AI</h2>
<p>Deljeni link trejda sadrži samo ID igrača, period statistike, format bodovanja i jezik. Tvoji rosteri i istorija nisu u linku.</p>
<p>„Kopiraj za AI analizu“ stavlja tekst u tvoj clipboard. Ništa se nikud ne šalje dok ga sam ne nalepiš.</p>
<h2>Kontakt</h2>
<p>Pitanja o privatnosti: <a href="{CONTACT_URL}" rel="noopener">{CONTACT_URL.replace('https://', '')}</a>.</p>
''',
    },
}

ABOUT = {
    'en': {
        'title': 'About RosterSwing | Fantasy Basketball Tools',
        'desc': 'RosterSwing makes free fantasy basketball tools. The first one is a trade analyzer for 9-category leagues.',
        'h1': 'About RosterSwing',
        'body': f'''
<p>RosterSwing makes free fantasy basketball tools for people who play in category leagues and want to check a move with numbers before they make it.</p>
<h2>What is available</h2>
<ul>
<li><strong>Trade analyzer</strong>: compare both sides of a trade category by category, with weighted FG% and FT%, minutes, trends, injuries and news.</li>
<li><strong>Your leagues</strong>: save your leagues and rosters in the browser and see your team before and after a trade.</li>
</ul>
<h2>Data</h2>
<p>Stats, projections and player news come from publicly available ESPN fantasy data. RosterSwing is not affiliated with ESPN, Yahoo or the NBA.</p>
<h2>Contact</h2>
<p>Ideas, bugs or questions: <a href="{CONTACT_URL}" rel="noopener">{CONTACT_URL.replace('https://', '')}</a>.</p>
''',
    },
    'sr': {
        'title': 'O sajtu | RosterSwing',
        'desc': 'RosterSwing pravi besplatne alate za fantasy košarku. Prvi je kalkulator za trejdove u ligama sa 9 kategorija.',
        'h1': 'O sajtu RosterSwing',
        'body': f'''
<p>RosterSwing pravi besplatne alate za fantasy košarku, za one koji igraju lige sa kategorijama i žele da provere potez brojkama pre nego što ga povuku.</p>
<h2>Šta postoji</h2>
<ul>
<li><strong>Kalkulator za trejdove</strong>: poređenje obe strane trejda po kategorijama, sa ponderisanim FG% i FT%, minutažom, formom, povredama i vestima.</li>
<li><strong>Tvoje lige</strong>: sačuvaj lige i rostere u browseru i vidi tim pre i posle trejda.</li>
</ul>
<h2>Podaci</h2>
<p>Statistika, projekcije i vesti o igračima dolaze iz javno dostupnih ESPN fantasy podataka. RosterSwing nije povezan sa ESPN, Yahoo ni NBA.</p>
<h2>Kontakt</h2>
<p>Ideje, greške ili pitanja: <a href="{CONTACT_URL}" rel="noopener">{CONTACT_URL.replace('https://', '')}</a>.</p>
''',
    },
}


# ---------------------------------------------------------------------------
# VODIČ: kako uvesti ligu (/how-to-import/, /sr/how-to-import/)
# Slike: assets/howto/<ime>.png. Dok slika ne postoji, na stranici je samo HTML komentar (ništa se ne vidi).
# ---------------------------------------------------------------------------
HOWTO_SHOTS = {
    'espn-league-id.png': ('ESPN league page with leagueId in the address bar', 'ESPN stranica lige sa leagueId u adresi'),
    'espn-settings-basic.png': ('ESPN League > Settings > Basic on the website', 'ESPN League > Settings > Basic na sajtu'),
    'espn-viewable-public.png': ('"Make league viewable to public" set to Yes', '"Make league viewable to public" na Yes'),
    'fantrax-public.png': ('Fantrax Misc settings with "Allow public to view league"', 'Fantrax Misc podešavanja sa "Allow public to view league"'),
    'sleeper-league-url.png': ('Sleeper league address with the league ID', 'Sleeper adresa lige sa ID-jem lige'),
    'paste-select-all.png': ('Team roster page with the whole page selected', 'Stranica rostera tima sa označenom celom stranicom'),
    'rosterswing-paste.png': ('RosterSwing Paste roster window with recognized players', 'RosterSwing prozor Nalepi roster sa prepoznatim igračima'),
}


def shot(name, lang, depth):
    alt = HOWTO_SHOTS[name][0 if lang == 'en' else 1]
    sr_name = name.replace('.png', '-sr.png')  # srpska verzija slike (npr. ekran aplikacije na srpskom), ako postoji
    if lang == 'sr' and os.path.exists(os.path.join(ROOT, 'assets', 'howto', sr_name)):
        name = sr_name
    if os.path.exists(os.path.join(ROOT, 'assets', 'howto', name)):
        return f'<figure class="shot"><img src="{rel(depth)}assets/howto/{name}" alt="{escape(alt)}" loading="lazy"></figure>'
    return f'<!-- slika: assets/howto/{name} ({escape(alt)}) -->'  # dok slike nema, na stranici se ništa ne prikazuje


LM_MSG = {
    'en': "Hey, could you set our ESPN league to 'viewable to public'? It's under League > Settings > Basic on the website. It doesn't let anyone join, it just lets tools like RosterSwing read rosters so I can analyze trades.",
    'sr': "Ćao, možeš li da podesiš našu ESPN ligu da bude 'viewable to public'? Nalazi se pod League > Settings > Basic na sajtu. To nikome ne dozvoljava da uđe u ligu, samo omogućava alatima kao što je RosterSwing da čitaju rostere, pa mogu da analiziram trejdove.",
}

HOWTO = {
    'en': {
        'title': 'How to Import Your Fantasy Basketball League | RosterSwing',
        'desc': 'Import a public ESPN fantasy basketball league into RosterSwing, or paste rosters from Yahoo, CBS and other platforms. Step by step, no password needed.',
        'h1': 'How to import your fantasy basketball league',
        'intro': 'RosterSwing reads public leagues only. We never ask for your password, login or cookies. Pick your platform below.',
        'toc': [('espn', 'ESPN'), ('yahoo', 'Yahoo'), ('fantrax', 'Fantrax'), ('sleeper', 'Sleeper'), ('paste', 'Paste roster (CBS, Yahoo, others)'), ('faq', 'FAQ')],
        'open_app': 'Add your league',
        'copy': 'Copy message', 'copied': 'Copied',
        'espn': '''<h2 id="espn">ESPN</h2>
<p>ESPN leagues are private by default. Only the League Manager (LM) can make a league public, and only on the ESPN website, not in the app.</p>
<ol class="hsteps">
<li>Open your league on <strong>fantasy.espn.com</strong> in a browser.</li>
<li>Go to <strong>League</strong> &gt; <strong>Settings</strong> &gt; <strong>Basic</strong>.</li>
<li>Find <strong>Make league viewable to public</strong> and set it to <strong>Yes</strong>, then save.</li>
<li>In RosterSwing, click <strong>Add your league</strong> &gt; <strong>ESPN public league</strong> and paste the league ID or the league link.</li>
</ol>
{shot:espn-settings-basic.png}
{shot:espn-viewable-public.png}
<p>A public league can be viewed, not joined. Nobody can join your league or change anything because of this setting, and the LM can switch it back at any time.</p>
<h3 id="espn-id">Where to find the league ID</h3>
<p>Open the league on the ESPN website and look at the address bar. The number after <code>leagueId=</code> is the league ID, for example <code>leagueId=123456</code>. You can also paste the whole link, RosterSwing finds the ID for you.</p>
{shot:espn-league-id.png}
<div class="lm-box"><h3>Not the LM?</h3><p>Send this message to your League Manager:</p><blockquote id="lm-msg">{lm}</blockquote><button type="button" class="btn-copy" data-copy="lm-msg">{copy}</button></div>''',
        'yahoo': '''<h2 id="yahoo">Yahoo</h2>
<p>Automatic Yahoo import is coming soon. Until then, use <a href="#paste">Paste roster</a>: it takes about a minute per team.</p>
<p>When the Yahoo import arrives, the league will need to be publicly viewable. The commissioner turns this on with the <strong>Make League Publicly Viewable</strong> option in the league settings. This is not the same as <strong>Publish League</strong>, which is a different setting.</p>''',
        'fantrax': '''<h2 id="fantrax">Fantrax</h2>
<p>In RosterSwing choose <strong>Fantrax public league</strong> and enter the league ID or link. We import teams, rosters, scoring and standings. To make the league public, the commissioner goes to <strong>Commissioner</strong> &gt; <strong>League Setup</strong> &gt; <strong>Misc</strong> and turns on <strong>Allow public to view league</strong>.</p>
{shot:fantrax-public.png}
<p>The league ID is the part of the league address after <code>/league/</code>, for example <code class="wrap">fantrax.com/fantasy/league/<strong>abc123xyz</strong>/home</code>.</p>''',
        'sleeper': '''<h2 id="sleeper">Sleeper</h2>
<p>In RosterSwing choose <strong>Sleeper league</strong>. We import teams, rosters, standings and the points scoring. Sleeper leagues need no settings change. The league ID is the long number in the league address, for example <code class="wrap">sleeper.com/leagues/<strong>1180226123456789012</strong></code>, or you can enter your Sleeper username.</p>
{shot:sleeper-league-url.png}''',
        'paste': '''<h2 id="paste">Paste roster (CBS, Yahoo and other platforms)</h2>
<p>Works with any platform that shows a roster page. You paste one team at a time.</p>
<ol class="hsteps">
<li>Open the roster page of one team on your platform (Yahoo, CBS, Fantrax or any other).</li>
<li>Select the whole page with <strong>Ctrl+A</strong> (<strong>Cmd+A</strong> on a Mac) and copy it with <strong>Ctrl+C</strong> (<strong>Cmd+C</strong>).</li>
<li>In RosterSwing, click <strong>Add your league</strong> &gt; <strong>Paste roster</strong>, paste the text and click <strong>Find players</strong>.</li>
<li>Check the players. Pick the right player where a name fits more than one, and type the names we could not read.</li>
<li>Click <strong>Save and add another team</strong> to paste the next team.</li>
</ol>
{shot:paste-select-all.png}
{shot:rosterswing-paste.png}
<p>Stats, positions and injury statuses in the pasted text are ignored. Only player names are used. Pasted leagues stay editable, and you can paste any team again when its roster changes.</p>''',
        'faq_h': 'FAQ',
        'faq': [
            ('Is my data safe?', 'Yes. RosterSwing never asks for your password, login or cookies. We read only what a public league shows to everyone, and your leagues are saved in your own browser. We do not store real names of league members.'),
            ('Why only public leagues?', 'Reading a private league needs your login cookies. We do not want to ask for them or keep them, so for now we import public leagues only.'),
            ('Will private leagues be supported?', 'Private leagues are coming. Until then, the LM can make the league public, or you can use Paste roster.'),
            ('Can strangers join my league if it is public?', 'No. Public means viewable, not joinable. Nobody can join or change anything, and the LM can switch the setting back at any time.'),
        ],
    },
    'sr': {
        'title': 'Kako da uvezeš fantasy basketball ligu | RosterSwing',
        'desc': 'Uvezi javnu ESPN fantasy basketball ligu u RosterSwing, ili nalepi rostere sa Yahoo, CBS i drugih platformi. Korak po korak, bez lozinke.',
        'h1': 'Kako da uvezeš svoju fantasy basketball ligu',
        'intro': 'RosterSwing čita samo javne lige. Nikad ne tražimo lozinku, prijavu ni kolačiće. Izaberi svoju platformu ispod.',
        'toc': [('espn', 'ESPN'), ('yahoo', 'Yahoo'), ('fantrax', 'Fantrax'), ('sleeper', 'Sleeper'), ('paste', 'Nalepi roster (CBS, Yahoo, ostali)'), ('faq', 'Česta pitanja')],
        'open_app': 'Dodaj svoju ligu',
        'copy': 'Kopiraj poruku', 'copied': 'Kopirano',
        'espn': '''<h2 id="espn">ESPN</h2>
<p>ESPN lige su podrazumevano privatne. Samo League Manager (LM) može da označi ligu kao javnu, i to samo na ESPN sajtu, ne u aplikaciji.</p>
<ol class="hsteps">
<li>Otvori svoju ligu na <strong>fantasy.espn.com</strong> u browseru.</li>
<li>Idi na <strong>League</strong> &gt; <strong>Settings</strong> &gt; <strong>Basic</strong>.</li>
<li>Nađi <strong>Make league viewable to public</strong>, podesi na <strong>Yes</strong> i sačuvaj.</li>
<li>U RosterSwingu klikni <strong>Dodaj ligu</strong> &gt; <strong>ESPN javna liga</strong> i nalepi ID lige ili link ka ligi.</li>
</ol>
{shot:espn-settings-basic.png}
{shot:espn-viewable-public.png}
<p>Javnu ligu svako može da vidi, ali ne i da uđe u nju. Zbog ovog podešavanja niko ne može da se priključi ligi ni da bilo šta promeni, a LM može da ga vrati kad god hoće.</p>
<h3 id="espn-id">Gde da nađem ID lige</h3>
<p>Otvori ligu na ESPN sajtu i pogledaj adresu u browseru. Broj posle <code>leagueId=</code> je ID lige, na primer <code>leagueId=123456</code>. Možeš da nalepiš i ceo link, RosterSwing sam nalazi ID.</p>
{shot:espn-league-id.png}
<div class="lm-box"><h3>Nisi LM?</h3><p>Pošalji ovu poruku League Manageru:</p><blockquote id="lm-msg">{lm}</blockquote><button type="button" class="btn-copy" data-copy="lm-msg">{copy}</button></div>''',
        'yahoo': '''<h2 id="yahoo">Yahoo</h2>
<p>Automatski uvoz sa Yahoo stiže uskoro. Do tada koristi <a href="#paste">Nalepi roster</a>: treba oko minut po timu.</p>
<p>Za Yahoo uvoz liga će morati da bude javno vidljiva. Komesar to uključuje opcijom <strong>Make League Publicly Viewable</strong> u podešavanjima lige. To nije isto što i <strong>Publish League</strong>, to je drugo podešavanje.</p>''',
        'fantrax': '''<h2 id="fantrax">Fantrax</h2>
<p>U RosterSwingu izaberi <strong>Fantrax javna liga</strong> i unesi ID ili link lige. Uvozimo timove, rostere, bodovanje i tabelu. Da bi liga bila javna, komesar ide na <strong>Commissioner</strong> &gt; <strong>League Setup</strong> &gt; <strong>Misc</strong> i uključuje <strong>Allow public to view league</strong>.</p>
{shot:fantrax-public.png}
<p>ID lige je deo adrese lige posle <code>/league/</code>, na primer <code class="wrap">fantrax.com/fantasy/league/<strong>abc123xyz</strong>/home</code>.</p>''',
        'sleeper': '''<h2 id="sleeper">Sleeper</h2>
<p>U RosterSwingu izaberi <strong>Sleeper liga</strong>. Uvozimo timove, rostere, tabelu i bodovanje na poene. Za Sleeper ligu ne treba menjati podešavanja. ID lige je dugačak broj u adresi lige, na primer <code class="wrap">sleeper.com/leagues/<strong>1180226123456789012</strong></code>, a možeš da uneseš i svoje Sleeper korisničko ime.</p>
{shot:sleeper-league-url.png}''',
        'paste': '''<h2 id="paste">Nalepi roster (CBS, Yahoo i druge platforme)</h2>
<p>Radi sa svakom platformom koja ima stranicu rostera. Nalepljuješ jedan po jedan tim.</p>
<ol class="hsteps">
<li>Na svojoj platformi (Yahoo, CBS, Fantrax ili bilo kojoj drugoj) otvori stranicu rostera jednog tima.</li>
<li>Označi celu stranicu sa <strong>Ctrl+A</strong> (na Macu <strong>Cmd+A</strong>) i kopiraj sa <strong>Ctrl+C</strong> (<strong>Cmd+C</strong>).</li>
<li>U RosterSwingu klikni <strong>Dodaj ligu</strong> &gt; <strong>Nalepi roster</strong>, nalepi tekst i klikni <strong>Prepoznaj igrače</strong>.</li>
<li>Proveri igrače. Gde ime odgovara za više igrača, izaberi pravog, a imena koja nismo pročitali upiši sam.</li>
<li>Klikni <strong>Sačuvaj i dodaj još jedan tim</strong> za sledeći tim.</li>
</ol>
{shot:paste-select-all.png}
{shot:rosterswing-paste.png}
<p>Statistike, pozicije i statusi povreda u nalepljenom tekstu se ignorišu, koriste se samo imena igrača. Nalepljene lige ostaju izmenjive, a svaki tim možeš ponovo da nalepiš kad mu se roster promeni.</p>''',
        'faq_h': 'Česta pitanja',
        'faq': [
            ('Da li su moji podaci bezbedni?', 'Jesu. RosterSwing nikad ne traži lozinku, prijavu ni kolačiće. Čitamo samo ono što javna liga pokazuje svima, a lige se čuvaju u tvom browseru. Ne čuvamo prava imena članova lige.'),
            ('Zašto samo javne lige?', 'Za čitanje privatne lige trebali bi nam kolačići tvoje prijave. Ne želimo da ih tražimo ni da ih čuvamo, pa za sada uvozimo samo javne lige.'),
            ('Da li će privatne lige biti podržane?', 'Privatne lige stižu. Do tada LM može da označi ligu kao javnu, ili možeš da koristiš Nalepi roster.'),
            ('Da li nepoznati ljudi mogu da uđu u ligu ako je javna?', 'Ne. Javna znači da se vidi, ne da se u nju ulazi. Niko ne može da se priključi ni da bilo šta promeni, a LM može da vrati podešavanje kad god hoće.'),
        ],
    },
}


# Javna stranica /free-agents/ (Pojačanja sa FA)
FAPAGE = {
    'en': {
        'title': 'Fantasy Basketball Free Agent Pickups | RosterSwing',
        'desc': 'Free agent pickups for your fantasy basketball team: we read your imported league, compare free agents with your weakest player and suggest who to add and who to drop.',
        'h1': 'Fantasy Basketball Free Agent Pickups',
        'lead': 'We read every roster in your imported league, find the free agents who help your team the most and show who you would drop for them. Suggestions follow your categories, your punts and the players you never want to drop.',
        'cta': 'Choose a league',
        'ex_label': 'Example suggestion',
        'ex': {'in': 'Bench guard in a bigger role', 'in_meta': 'SG · Free agent', 'out': 'Your weakest active player', 'out_label': 'Drops', 'gain': 'Net', 'chips': ['✓ 3PM', '✓ AST', '✓ STL', '✗ BLK'],
               'why': 'Minutes 18 → 29 in the last 7 days', 'games': '4 games in the next 7 days'},
        'steps_h': 'How it works',
        'steps': [('Import your league', 'Add your public ESPN, Sleeper or Fantrax league. We need all rosters to know who is really free.'),
                  ('Choose the league', 'Pick the league in the Free agent pickups tool. Lock the players you never want to drop.'),
                  ('Get suggestions', 'See the best pickups for your team, sorted by net gain, with a short report for each one.')],
        'rising_h': 'Rising players this week',
        'rising_note': 'Players rostered in less than 60% of ESPN leagues, sorted by the biggest rise in ownership as ESPN shows it in its +/- column. Minutes compare the last 7 days with the season.',
        'rising_loading': 'Loading players…', 'rising_error': 'Players could not be loaded. Try again later.', 'rising_none': 'No rising players right now.',
        'rising_own': 'rostered', 'rising_min': 'min',
        'rising_cta': 'Import your league and see who fits your team',
        'faq_h': 'Frequently asked questions',
        'faq': [('How do you choose the suggestions?', 'We value every free agent for your team with a blend of the projection and the last 15 and 7 days, weighted by the categories your team needs and without your punted categories. A player is suggested only when he is clearly better than the player you would drop. Rising minutes, an injured teammate and growing ownership move a player up a little.'),
                ('Why only imported leagues?', 'To know who is really a free agent we need every roster in your league. Imported leagues give us all rosters and player statuses, and manual leagues usually have only some teams.'),
                ('What is an IR stash?', 'An injured free agent who is valuable when healthy. If you have a free IR spot and your league allows his status on IR, you can add him now and keep him on IR until he returns.'),
                ('Do you see waiver claims and transaction limits?', 'Where the platform shares it. ESPN gives the waiver list and the transaction limit, Sleeper gives recent drops, and Fantrax gives neither, so there every player is shown as a free agent.')],
    },
    'sr': {
        'title': 'Fantasy košarka: pojačanja sa waivera | RosterSwing',
        'desc': 'Pojačanja sa waivera za tvoj fantasy košarkaški tim: čitamo tvoju uvezenu ligu, poredimo slobodne igrače sa tvojim najslabijim igračem i predlažemo koga da uzmeš i koga da otpustiš.',
        'h1': 'Fantasy košarka: pojačanja sa waivera',
        'lead': 'Čitamo sve rostere tvoje uvezene lige, nalazimo slobodne igrače koji najviše pomažu tvom timu i pokazujemo koga bi za njih otpustio. Predlozi prate kategorije tvoje lige, tvoj punt i igrače koje nikad ne bi otpustio.',
        'cta': 'Izaberi ligu',
        'ex_label': 'Primer predloga',
        'ex': {'in': 'Bek sa klupe koji dobija veću ulogu', 'in_meta': 'SG · Slobodan', 'out': 'Tvoj najslabiji aktivni igrač', 'out_label': 'Odlazi', 'gain': 'Neto', 'chips': ['✓ 3PM', '✓ AST', '✓ STL', '✗ BLK'],
               'why': 'Minuti 18 → 29 u poslednjih 7 dana', 'games': '4 ut. u narednih 7 dana'},
        'steps_h': 'Kako radi',
        'steps': [('Uvezi ligu', 'Dodaj svoju javnu ESPN, Sleeper ili Fantrax ligu. Trebaju nam svi rosteri da znamo ko je stvarno slobodan.'),
                  ('Izaberi ligu', 'Izaberi ligu u alatu Pojačanja sa FA. Zaključaj igrače koje nikad ne bi otpustio.'),
                  ('Dobij predloge', 'Vidi najbolja pojačanja za svoj tim, sortirana po neto dobiti, uz kratak izveštaj za svako.')],
        'rising_h': 'Igrači u usponu ove nedelje',
        'rising_note': 'Igrači koji su u manje od 60% ESPN liga, po najvećem rastu vlasništva kako ga ESPN prikazuje u koloni +/-. Minuti porede poslednjih 7 dana sa sezonom.',
        'rising_loading': 'Učitavam igrače…', 'rising_error': 'Igrači nisu učitani. Pokušaj kasnije.', 'rising_none': 'Trenutno nema igrača u usponu.',
        'rising_own': 'u ligama', 'rising_min': 'min',
        'rising_cta': 'Uvezi ligu i vidi ko odgovara baš tvom timu',
        'faq_h': 'Česta pitanja',
        'faq': [('Kako biraš predloge?', 'Svakog slobodnog igrača vrednujemo za tvoj tim kao mešavinu projekcije i poslednjih 15 i 7 dana, po kategorijama koje tvom timu trebaju i bez punt kategorija. Igrač se predlaže samo kad je jasno bolji od igrača kog bi otpustio. Rast minuta, povređen saigrač i rast vlasništva ga blago podižu.'),
                ('Zašto samo za uvezene lige?', 'Da bismo znali ko je stvarno slobodan, trebaju nam svi rosteri tvoje lige. Uvezene lige daju sve rostere i statuse igrača, a ručne lige obično imaju samo neke timove.'),
                ('Šta je IR stash?', 'Povređen slobodan igrač koji vredi kad je zdrav. Ako imaš slobodno IR mesto i liga dozvoljava njegov status na IR-u, možeš da ga uzmeš sada i držiš na IR-u dok se ne vrati.'),
                ('Da li vidiš waiver i limit transakcija?', 'Gde platforma to daje. ESPN daje listu igrača na waiveru i limit transakcija, Sleeper daje skorašnja otpuštanja, a Fantrax ni jedno, pa su tamo svi igrači prikazani kao slobodni.')],
    },
}

COPY_JS = '''<script>
document.addEventListener('click', e => {
  const b = e.target.closest('[data-copy]'); if (!b) return;
  const txt = document.getElementById(b.dataset.copy).innerText;
  const done = () => { const o = b.textContent; b.textContent = b.dataset.done; setTimeout(() => { b.textContent = o; }, 1800); };
  if (navigator.clipboard) navigator.clipboard.writeText(txt).then(done, done); else done();
});
</script>
'''


def howto(lang):
    d = HOWTO[lang]
    depth = 1 if lang == 'en' else 2
    r = rel(depth)

    def fill(html):
        html = re.sub(r'\{shot:([\w.-]+)\}', lambda m: shot(m.group(1), lang, depth), html)
        return html.replace('{lm}', escape(LM_MSG[lang])).replace('{copy}', escape(d['copy'])).replace('data-copy="lm-msg"', f'data-copy="lm-msg" data-done="{escape(d["copied"])}"')
    toc = ''.join(f'<li><a href="#{a}">{escape(l)}</a></li>' for a, l in d['toc'])
    faq = ''.join(f'<h3>{escape(q)}</h3><p>{escape(a)}</p>' for q, a in d['faq'])
    faq_ld = ld({'@context': 'https://schema.org', '@type': 'FAQPage', 'inLanguage': lang,
                 'mainEntity': [{'@type': 'Question', 'name': q, 'acceptedAnswer': {'@type': 'Answer', 'text': a}} for q, a in d['faq']]})
    app = f'{r}app/#home&addleague=1'
    body = ''.join(fill(d[k]) for k in ('espn', 'yahoo', 'fantrax', 'sleeper', 'paste'))
    return head(lang, 'howto', d['title'], d['desc'], depth, extra=faq_ld) + header(lang, 'howto', depth) + f'''
<main class="wrap">
  <article class="doc howto">
    <h1>{escape(d['h1'])}</h1>
    <p>{escape(d['intro'])}</p>
    <nav class="howto-toc" aria-label="{escape(d['h1'])}"><ol>{toc}</ol></nav>
    <p><a class="btn" href="{app}">{escape(d['open_app'])}</a></p>
    {body}
    <h2 id="faq">{escape(d['faq_h'])}</h2>
    {faq}
  </article>
</main>
''' + footer(lang, depth) + COPY_JS + '</body>\n</html>\n'


# ---------------------------------------------------------------------------
# DELOVI STRANICE
# ---------------------------------------------------------------------------
def rel(depth):
    return '../' * depth


def head(lang, page, title, desc, depth, extra='', og=None):
    r = rel(depth)
    canon = SITE_URL + PAGES[page][lang]
    alt = ''.join(f'<link rel="alternate" hreflang="{l}" href="{SITE_URL + PAGES[page][l]}">\n' for l in ('en', 'sr'))
    alt += f'<link rel="alternate" hreflang="x-default" href="{SITE_URL + PAGES[page]["en"]}">\n'
    t = T[lang]
    og = og or t
    og_img = SITE_URL + og['og_image']
    return f'''<!doctype html>
<html lang="{lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{escape(title)}</title>
<meta name="description" content="{escape(desc)}">
<link rel="canonical" href="{canon}">
{alt}<meta name="theme-color" content="#131519">
<meta property="og:type" content="website">
<meta property="og:site_name" content="RosterSwing">
<meta property="og:title" content="{escape(title)}">
<meta property="og:description" content="{escape(desc)}">
<meta property="og:url" content="{canon}">
<meta property="og:image" content="{og_img}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="{escape(og['og_alt'])}">
<meta property="og:locale" content="{t['locale']}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{escape(title)}">
<meta name="twitter:description" content="{escape(desc)}">
<meta name="twitter:image" content="{og_img}">
<link rel="icon" href="{r}assets/favicon.svg" type="image/svg+xml">
<link rel="icon" href="{r}assets/favicon-16.png" sizes="16x16" type="image/png">
<link rel="icon" href="{r}assets/favicon-32.png" sizes="32x32" type="image/png">
<link rel="icon" href="{r}assets/favicon-64.png" sizes="64x64" type="image/png">
<link rel="apple-touch-icon" href="{r}assets/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="preload" as="style" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" onload="this.onload=null;this.rel='stylesheet'">
<noscript><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap"></noscript>
<link rel="stylesheet" href="{r}assets/app.css">
<link rel="stylesheet" href="{r}assets/site.css">
{extra}</head>
'''


GLOBE = '<svg class="globe" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.8 3.8 5.8 3.8 9s-1.3 6.2-3.8 9c-2.5-2.8-3.8-5.8-3.8-9S9.5 5.8 12 3z"/></svg>'


def page_href(page, lang, depth):
    r = rel(depth)
    return r + PAGES[page][lang] if PAGES[page][lang] else (r or './')


NAV_T = {
    'sr': {'home': 'Početna', 'tools': 'Alati', 'leagues': 'Moje lige', 'analyzer': 'Analiza trejda', 'builder': 'Pronađi trejd', 'finder': 'Mete za trejd', 'fa': 'Pojačanja sa FA',
           'soon': 'Uskoro', 'quick': 'Brzo poređenje', 'all': 'Sve lige', 'add': 'Dodaj ligu'},
    'en': {'home': 'Home', 'tools': 'Tools', 'leagues': 'My leagues', 'analyzer': 'Trade analyzer', 'builder': 'Find a trade', 'finder': 'Trade targets', 'fa': 'Free agent pickups',
           'soon': 'Coming soon', 'quick': 'Quick compare', 'all': 'All leagues', 'add': 'Add league'},
}
NAV_ICON = {
    'analyzer': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 8h14l-4-4M20 16H6l4 4"/></svg>',
    'builder': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3M8 11h6M11 8v6"/></svg>',
    'finder': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/></svg>',
    'fa': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="9" cy="8" r="4"/><path d="M2 21c1.2-3.5 3.8-5.5 7-5.5s5.8 2 7 5.5M19 8v6M16 11h6"/></svg>',
    'quick': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M13 2 4 14h7l-1 8 9-12h-7z"/></svg>',
    'all': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>',
    'add': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
    'caret': '<svg class="caret" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>',
}
TOOL_PAGES = {'builder': TOOLS['builder'], 'finder': TOOLS['finder'], 'fa': TOOLS['fa']}
# ključ na sajtu -> id alata u aplikaciji (APP_PAGES u app.js; isti opis kad je alat zaključan)
APP_TOOL_ID = {'builder': 'finder', 'finder': 'targets', 'fa': 'fa'}


def gnav_html(lang, root, page=None, app_page=False):
    """Isto zaglavlje na svim stranicama: logo, Početna, Alati ▾, Moje lige ▾, jezik (na kraju)."""
    n = NAV_T[lang]
    pre = 'sr/' if lang == 'sr' else ''
    home = f'{root}{pre}' or './'
    ta = f'{root}{pre}trade-analyzer/'
    app = '' if app_page else f'{root}app/'
    def tool_item(key):
        t = TOOL_PAGES[key]
        if t.get('pick'):  # alat za uvezene lige: "Izaberi ligu" (nav.js)
            return f'<button type="button" role="menuitem" class="pm-item" data-pick-league="{key}">{NAV_ICON[key]}<span data-t="{key}">{n[key]}</span></button>'
        if t.get('page'):  # javna stranica alata, adresa po jeziku (nav.js je menja kad se promeni jezik)
            return f'<a role="menuitem" class="pm-item" href="{root}{PAGES[t["page"]][lang]}" data-href="{key}">{NAV_ICON[key]}<span data-t="{key}">{n[key]}</span></a>'
        if t['ready'] and t['href']:
            return f'<a role="menuitem" class="pm-item" href="{root}{t["href"]}">{NAV_ICON[key]}<span data-t="{key}">{n[key]}</span></a>'
        return f'<button type="button" role="menuitem" class="pm-item off" data-tool-soon="{APP_TOOL_ID[key]}">{NAV_ICON[key]}<span data-t="{key}">{n[key]}</span><span class="soon" data-t="soon">{n["soon"]}</span></button>'
    if app_page:
        langsel = '<select data-langsel aria-label="Jezik / Language"><option value="sr">Srpski</option><option value="en">English</option></select>'
    else:
        opts = ''.join(f'<option value="{l}" data-go="{page_href(page, l, root.count("../"))}" {"selected" if l == lang else ""}>{nm}</option>' for l, nm in (('sr', 'Srpski'), ('en', 'English')))
        langsel = f'<select data-publang aria-label="Jezik / Language">{opts}</select>'
    return f"""<header class="top gnav" data-root="{root}" data-lang="{lang}" data-app-page="{'1' if app_page else ''}">
  <div class="wrap gnav-row">
    <a class="brand" href="{home}" data-href="home" aria-label="RosterSwing"><img class="brand-mark" src="{root}assets/favicon.svg" width="24" height="24" alt="RosterSwing"><img class="brand-word" src="{root}assets/wordmark.svg" width="96" height="16" alt=""></a>
    <nav class="gnav-links" aria-label="{'Glavni meni' if lang == 'sr' else 'Main'}">
      <a class="gl gl-home" href="{home}" data-href="home" data-t="home">{n['home']}</a>
      <div class="dd-wrap"><button type="button" class="gl" data-gmenu="tools" aria-haspopup="menu" aria-expanded="false"><span data-t="tools">{n['tools']}</span>{NAV_ICON['caret']}</button>
        <div class="gmenu" id="gmenu-tools" role="menu" hidden>
          <a role="menuitem" class="pm-item" href="{ta}" data-href="analyzer">{NAV_ICON['analyzer']}<span data-t="analyzer">{n['analyzer']}</span></a>
          {tool_item('builder')}
          {tool_item('finder')}
          {tool_item('fa')}
        </div></div>
      <div class="dd-wrap"><button type="button" class="gl" data-gmenu="leagues" aria-haspopup="menu" aria-expanded="false"><span data-t="leagues">{n['leagues']}</span>{NAV_ICON['caret']}</button>
        <div class="gmenu gmenu-leagues" id="gmenu-leagues" role="menu" hidden>
          <a role="menuitem" class="pm-item" href="{ta}" data-href="analyzer">{NAV_ICON['quick']}<span data-t="quick">{n['quick']}</span></a>
          <a role="menuitem" class="pm-item" href="{app}#home&amp;lang={lang}" data-href="all">{NAV_ICON['all']}<span data-t="all">{n['all']}</span></a>
          <div class="pm-sub" data-leagues></div>
          <div class="pm-sep"></div>
          <div data-league-settings></div>
          <a role="menuitem" class="pm-item" href="{app}#home&amp;addleague=1&amp;lang={lang}" data-href="add">{NAV_ICON['add']}<span data-t="add">{n['add']}</span></a>
        </div></div>
    </nav>
    {'<button type="button" class="pchip gnav-pchip" data-action="profile" aria-label="Profil"></button>' if app_page else ''}
    <label class="langsel" title="Jezik / Language">{GLOBE}{langsel}</label>
  </div>
</header>
"""


def header(lang, page, depth):
    return f'<body class="pub" data-pubpage="{page}">\n' + gnav_html(lang, rel(depth), page) + f'<script src="{rel(depth)}assets/nav.js"></script>\n'


def stamp_assets(html):
    """Oznaka verzije na CSS/JS (assets/app.js?v=1a2b3c4d): hash sadržaja fajla, pa se menja samo kad se fajl promeni.
    Browser tako posle objave odmah učitava novu verziju, bez ručnog osvežavanja."""
    def repl(m):
        name = m.group(1)
        full = os.path.join(ROOT, 'assets', name)
        if not os.path.exists(full):
            return m.group(0)
        v = hashlib.sha1(open(full, 'rb').read()).hexdigest()[:8]
        return f'assets/{name}?v={v}'
    return re.sub(r'assets/([\w.-]+\.(?:js|css))(?:\?v=[0-9a-f]+)?', repl, html)


def write_app_header():
    """Isto zaglavlje i u aplikaciji (app/index.html, između oznaka GNAV)"""
    path = os.path.join(ROOT, 'app', 'index.html')
    html = open(path, encoding='utf-8').read()
    a, b = html.index('<!-- GNAV -->'), html.index('<!-- /GNAV -->')
    html = html[:a] + '<!-- GNAV -->\n' + gnav_html('sr', '../', app_page=True) + html[b:]
    open(path, 'w', encoding='utf-8').write(stamp_assets(html))
    print('   app/index.html (zaglavlje)')


def footer(lang, depth):
    r = rel(depth)
    t = T[lang]
    pre = 'sr/' if lang == 'sr' else ''
    return f'''<footer class="site-f">
  <div class="wrap">
    <div class="f-top">
      <span class="f-brand"><img src="{r}assets/favicon.svg" width="24" height="24" alt="RosterSwing"> Fantasy Basketball Tools</span>
      <nav class="f-links" aria-label="Footer">
        <a href="{r}{pre}about/">{t['footer_about']}</a>
        <a href="{r}{pre}trade-finder/">{FINDER[lang]['footer']}</a>
        <a href="{r}{pre}free-agents/">{t['footer_fa']}</a>
        <a href="{r}{pre}how-to-import/">{t['footer_howto']}</a>
        <a href="{r}{pre}privacy/">{t['footer_privacy']}</a>
        <a href="{CONTACT_URL}" rel="noopener">{t['footer_contact']}</a>
      </nav>
    </div>
    <p class="f-note">{escape(t['disclaimer'])}</p>
  </div>
</footer>
'''


def ld(obj):
    return '<script type="application/ld+json">\n' + json.dumps(obj, ensure_ascii=False, indent=1).replace('</', '<\\/') + '\n</script>\n'


def jsonld_app(lang):
    t = T[lang]
    return ld({
        '@context': 'https://schema.org',
        '@type': 'WebApplication',
        'name': 'RosterSwing ' + ('Fantasy Basketball Trade Analyzer' if lang == 'en' else 'kalkulator za fantasy trejdove'),
        'alternateName': 'RosterSwing',
        'url': SITE_URL + PAGES['analyzer'][lang],
        'description': t['desc'],
        'applicationCategory': 'SportsApplication',
        'operatingSystem': 'Any',
        'browserRequirements': 'Requires JavaScript',
        'inLanguage': lang,
        'isAccessibleForFree': True,
        'offers': {'@type': 'Offer', 'price': '0', 'priceCurrency': 'USD'},
    })


def jsonld_faq(lang, key='faq'):
    return ld({
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        'inLanguage': lang,
        'mainEntity': [{'@type': 'Question', 'name': q, 'acceptedAnswer': {'@type': 'Answer', 'text': a}} for q, a in T[lang][key]],
    })


# Početna: stari linkovi lige -> /app/; stari i deljeni trejdovi bez lige -> /trade-analyzer/ sa istim trejdom;
# povratnik sa ligom -> poslednja liga (osim /?home). Radi samo skripta u browseru, sadržaj ostaje u HTML-u.
REDIRECT = """<script>
(function(){var h=location.hash,app='{app}',ta='{ta}';
if(/^#(home|league-)/.test(h)){location.replace(app+h);return;}
if(/(^#|&)s=1(&|$)/.test(h)){location.replace(app+h);return;}
if(/^#quick/.test(h)||/(^#|&)(t|per)=/.test(h)){location.replace(ta+'#'+h.slice(1).replace(/^quick&?/,''));return;}
if(/[?&]home\\b/.test(location.search))return;
try{var p=JSON.parse(localStorage.getItem('fbaTrade.profile.v2'));var l=p&&p.leagues&&(p.leagues.find(function(x){return x.id===p.lastLeagueId})||p.leagues[0]);
if(l)location.replace(app+'#league-'+l.id+'/overview&lang={lang}');}catch(e){}})();
</script>
"""


def prerender(lang):
    """Prazno stanje alata u HTML-u (isti izgled kao posle učitavanja), da se sadržaj ne pomera dok se JS učitava"""
    p = T[lang]['pre']
    periods = ''.join(f'<button type="button" aria-pressed="{str(i == 0).lower()}">{escape(x)}</button>' for i, x in enumerate(p['periods']))
    icon = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="m20 20-3.5-3.5"></path></svg>'
    def card(i, side, color):
        name, sub, ph = p[side]
        return (f'<section class="card" data-team-card="{i}"><div class="card-h"><span class="dot" style="background:var({color})"></span>'
                f'<div class="side-title"><b style="color:var({color})">{escape(name)}</b><small>{escape(sub)}</small></div></div>'
                f'<div class="search"><div class="search-in">{icon}<input type="search" placeholder="{escape(ph)}" aria-label="{escape(ph)}" disabled></div></div>'
                f'<div class="empty-team">{escape(p["empty"])}</div></section>')
    return periods, f'<div class="score-empty">{escape(p["score"])}</div>', card(0, 'give', '--give') + card(1, 'get', '--get')


def initials(name):
    return ''.join(w[0] for w in name.split()[:2]).upper()


def preview_html(lang):
    """Statičan prikaz analize trejda (HTML/CSS u stilu aplikacije), za hero"""
    h = HOME[lang]; v = h['pv']
    cats = [('PTS', -1), ('REB', 1), ('AST', -1), ('3PM', -1), ('STL', 1), ('BLK', 1), ('FG%', 1), ('FT%', 1), ('TO', 1)]
    # znak ishoda (ne smera kategorije): ✓ dobijaš, ✗ gubiš
    chips = ''.join(f'<span class="mc {"good" if x > 0 else "bad"}" title="{escape(v["win"] if x > 0 else v["lose"])}"><span aria-hidden="true">{"✓" if x > 0 else "✗"}</span> {c}<span class="sr-only"> ({escape(v["win"] if x > 0 else v["lose"])})</span></span>' for c, x in cats)
    return f"""<a class="preview" href="{{ta}}" aria-label="{escape(h['preview_label'])}">
      <span class="pv-label">{escape(h['preview_label'])}</span>
      <span class="pv-sides"><span class="pv-side"><span class="pv-av">{initials(v['pg'])}</span><span><small class="give-t">{escape(v['give'])}</small><b>{escape(v['pg'])}</b></span></span>
        <span class="pv-arrow" aria-hidden="true">⇄</span>
        <span class="pv-side"><span class="pv-av">{initials(v['c'])}</span><span><small class="get-t">{escape(v['get'])}</small><b>{escape(v['c'])}</b></span></span></span>
      <span class="pv-score"><span class="pv-n get">6</span><span class="pv-sep">:</span><span class="pv-n">3</span></span>
      <span class="pv-names"><span class="get-t">{escape(v['get'])}</span><span class="give-t">{escape(v['give'])}</span></span>
      <span class="pv-verdict">{escape(v['verdict'])}</span>
      <span class="mcats">{chips}</span>
      <span class="pv-rep"><span class="pv-t plus">{escape(v['plus'])}</span><span>{escape(v['p1'])}</span><span>{escape(v['p2'])}</span>
        <span class="pv-t risk">{escape(v['risk'])}</span><span>{escape(v['r1'])}</span></span>
    </a>"""


def before_after_html(lang):
    b = HOME[lang]['ba']
    rows = [('PTS', '112.4', '110.9', '−1.5', 'bad'), ('REB', '44.1', '47.2', '+3.1', 'good'), ('AST', '25.3', '21.9', '−3.4', 'bad'), ('BLK', '5.1', '6.3', '+1.2', 'good')]
    head_ = ''.join(f'<th>{c}</th>' for c, *_ in rows)
    line = lambda label, i, cls='': f'<tr class="{cls}"><td>{label}</td>' + ''.join(f'<td class="{r[4] if i == 3 else ""}">{r[i]}</td>' for r in rows) + '</tr>'
    return f"""<div class="ba"><div class="ba-t">{escape(b['title'])}</div><table class="ba-table" aria-label="{escape(b['title'])}"><thead><tr><th></th>{head_}</tr></thead>
      <tbody>{line(escape(b['before']), 1)}{line(escape(b['after']), 2)}{line(escape(b['diff']), 3, 'diff')}</tbody></table></div>"""


def tool_card(lang, key):
    h = HOME[lang]; tool = TOOLS[key]
    if tool.get('pick'):
        page = PAGES[key][lang]
        action = f'<div class="tool-acts"><button type="button" class="cta2" data-pick-league="{key}">{escape(h[key + "_cta"])}</button><a class="more-link" href="{{root}}{page}">{escape(h["learn_more"])}</a></div>'
    else:
        href = PAGES[tool['page']][lang] if tool.get('page') else tool['href']
        action = (f'<a class="cta2" href="{{root}}{href}">{escape(h["open_tool"])}</a>' if tool['ready'] and href
                  else f'<span class="soon">{escape(h["soon"])}</span>')
    # mali naziv alata iznad naslova: isto ime kao u meniju Alati
    return f"""<section class="feature" aria-labelledby="{key}-h"><span class="tool-name">{escape(NAV_T[lang][key])}</span><h2 id="{key}-h">{escape(h[key + '_h'])}</h2><p class="lead">{escape(h[key + '_p'])}</p>{action}</section>"""


def home(lang):
    t = T[lang]; h = HOME[lang]
    depth = 0 if lang == 'en' else 1
    r = rel(depth)
    app = f'{r}app/'
    ta = page_href('analyzer', lang, depth)
    extra = REDIRECT.replace('{app}', app).replace('{ta}', ta).replace('{lang}', lang) + jsonld_faq(lang)
    faq = ''.join(f'<details><summary><h3>{escape(q)}</h3></summary><div class="a"><p>{escape(a)}</p></div></details>' for q, a in t['faq'])
    mini_txt = json.dumps({k: h[k] for k in ('mini_give_ph', 'mini_get_ph', 'mini_loading', 'mini_error', 'mini_none', 'mini_hint', 'mini_remove', 'mini_stats', 'mini_open', 'mini_cat', 'mini_diff', 'mini_total', 'mini_win', 'mini_lose', 'mini_tie', 'mini_ties')}, ensure_ascii=False)
    add_league = f'{app}#home&amp;addleague=1&amp;lang={lang}'
    return head(lang, 'home', h['title'], h['desc'], depth, extra, og=h) + header(lang, 'home', depth) + f"""
<div class="continue-bar" id="continue-bar" hidden><div class="wrap"><span>{escape(h['continue_bar'])}</span><a class="cta" id="continue-btn" href="{app}">…</a></div></div>
<script>
(function(){{if(!/[?&]home\\b/.test(location.search))return;try{{var p=JSON.parse(localStorage.getItem('fbaTrade.profile.v2'));var l=p&&p.leagues&&(p.leagues.find(function(x){{return x.id===p.lastLeagueId}})||p.leagues[0]);if(!l)return;
var b=document.getElementById('continue-btn');b.textContent={json.dumps(h['continue_btn'])}.replace('{{name}}',/^(Moja liga|My league)$/.test(l.name)?{json.dumps(h['my_league'])}:l.name);b.href='{app}#league-'+l.id+'/overview&lang={lang}';document.getElementById('continue-bar').hidden=false;}}catch(e){{}}}})();
</script>
<main class="wrap">
  <section class="hero hero-home">
    <div class="hero-text">
      <div class="stripe" aria-hidden="true"><i style="background:var(--rs-red)"></i><i style="background:var(--rs-green)"></i><i style="background:var(--rs-blue)"></i></div>
      <h1>{escape(h['h1'])}</h1>
      <p>{escape(h['lead'])}</p>
      <div class="hero-actions">
        <a class="cta" href="{ta}">{escape(h['cta'])}</a>
        <a class="cta2" href="{add_league}">{escape(h['cta2'])}</a>
      </div>
    </div>
    {preview_html(lang).replace('{ta}', ta)}
  </section>

  <section class="mini" id="mini" aria-labelledby="mini-h" data-txt='{escape(mini_txt)}' data-app="{r}assets/app.js" data-lang="{lang}" data-ta="{ta}">
    <h2 id="mini-h">{escape(h['mini_h'])}</h2>
    <p class="lead">{escape(h['mini_lead'])} <span class="mini-fmt">{escape(h['mini_fmt'])}</span></p>
    <div class="mini-sides">
      <div class="mini-side give" data-side="0"><label class="give-t" for="mini-0">{escape(t['pre']['give'][0])}</label><div class="mini-cards"></div>
        <div class="mini-in"><input id="mini-0" type="search" autocomplete="off" spellcheck="false" placeholder="{escape(h['mini_give_ph'])}" role="combobox" aria-expanded="false" aria-controls="mini-dd-0"><ul class="dd" id="mini-dd-0" role="listbox" hidden></ul></div></div>
      <div class="mini-vs" aria-hidden="true">⇄</div>
      <div class="mini-side get" data-side="1"><label class="get-t" for="mini-1">{escape(t['pre']['get'][0])}</label><div class="mini-cards"></div>
        <div class="mini-in"><input id="mini-1" type="search" autocomplete="off" spellcheck="false" placeholder="{escape(h['mini_get_ph'])}" role="combobox" aria-expanded="false" aria-controls="mini-dd-1"><ul class="dd" id="mini-dd-1" role="listbox" hidden></ul></div></div>
    </div>
    <div class="mini-result" id="mini-result" aria-live="polite"><span class="mini-hint">{escape(h['mini_hint'])}</span></div>
    <details class="mini-stats" id="mini-stats" hidden><summary><span>{escape(h['mini_stats'])}</span><span class="chev" aria-hidden="true">▾</span></summary><div class="mini-table" id="mini-table"></div></details>
    <div class="mini-cta"><a class="cta" id="mini-full" href="{ta}">{escape(h['mini_full'])}</a></div>
  </section>

  <section class="feature feature-league" aria-labelledby="league-h">
    <div><h2 id="league-h">{escape(h['league_h'])}</h2><p class="lead">{escape(h['league_p'])}</p><a class="cta2" href="{add_league}">{escape(h['league_cta'])}</a></div>
    {before_after_html(lang)}
  </section>

  {tool_card(lang, 'builder').replace('{root}', r)}
  <div class="feature-grid">{tool_card(lang, 'finder').replace('{root}', r)}{tool_card(lang, 'fa').replace('{root}', r)}</div>

  <section aria-labelledby="faq-h">
    <h2 id="faq-h">{escape(t['faq_h'])}</h2>
    <div class="faq">{faq}</div>
  </section>
</main>
""" + footer(lang, depth) + f"""<script src="{r}assets/mini.js" defer></script>
</body>
</html>
"""


def analyzer(lang):
    t = T[lang]
    depth = 1 if lang == 'en' else 2
    r = rel(depth)
    app = f'{r}app/'
    extra = jsonld_app(lang) + jsonld_faq(lang, 'faq_ta')
    faq = ''.join(f'<details><summary><h3>{escape(q)}</h3></summary><div class="a"><p>{escape(a)}</p></div></details>' for q, a in t['faq_ta'])
    guide = ''.join(f'<div><h3>{escape(a)}</h3><p>{escape(b)}</p></div>' for a, b in t['guide'])
    pre_periods, pre_score, pre_teams = prerender(lang)
    steps = ''.join(f'<li><h3>{escape(a)}</h3><p>{escape(b)}</p></li>' for a, b in t['steps'])
    feats = ''.join(f'<li><h3>{escape(a)}</h3><p>{escape(b)}</p></li>' for a, b in t['feats'])
    return head(lang, 'analyzer', t['title'], t['desc'], depth, extra) + header(lang, 'analyzer', depth) + f"""
<main class="wrap">
  <section class="intro">
    <h1>{escape(t['h1'])}</h1>
    <p>{escape(t['lead'])}</p>
  </section>

  <section class="tool" id="tool" aria-label="{escape(t['tool_h'])}">
    <div class="tool-periods"><div class="seg" id="periods" role="group" aria-label="Period">{pre_periods}</div><div id="fmtbar" class="fmtbar"><span class="fbar"><span class="fchip static">9-cat H2H</span></span></div></div>
    <div id="tradetabs" class="tool-tabs"></div>
    <div class="tool-app">
      <div class="status" id="status">{escape(t['loading'])}</div>
      <div id="banner"></div>
      <div id="tradewarn"></div>
      <div class="score" id="score">{pre_score}</div>
      <div class="teams" id="teams">{pre_teams}</div>
      <div id="compare"></div>
      <div id="nudge"></div>
      <div id="report"></div>
    </div>
    <div hidden><span id="hleague"></span><button type="button" id="pchip"></button><section id="home"></section><div id="leaguebar"></div><div id="wshead"></div><div id="myteam"></div><div id="oppteam"></div><div id="history"></div></div>
  </section>

  <section aria-labelledby="how-h">
    <h2 id="how-h">{escape(t['how_h'])}</h2>
    <ol class="hsteps">{steps}</ol>
  </section>

  <section aria-labelledby="what-h">
    <h2 id="what-h">{escape(t['what_h'])}</h2>
    <ul class="feats">{feats}</ul>
  </section>

  <section aria-labelledby="guide-h">
    <h2 id="guide-h">{escape(t['guide_h'])}</h2>
    <div class="guide">{guide}</div>
  </section>

  <section aria-labelledby="faq-h">
    <h2 id="faq-h">{escape(t['faq_h'])}</h2>
    <div class="faq">{faq}</div>
  </section>
</main>
""" + footer(lang, depth) + f"""<script>window.RS_EMBED={{lang:'{lang}',app:'{app}'}};</script>
<script src="{r}assets/app.js" defer></script>
</body>
</html>
"""


def doc(lang, page, data, depth):
    upd = f'<p class="upd">{escape(data["upd"])}</p>' if data.get('upd') else ''
    return head(lang, page, data['title'], data['desc'], depth) + header(lang, page, depth) + f'''
<main class="wrap">
  <article class="doc">
    <h1>{escape(data['h1'])}</h1>
    {upd}{data['body']}
  </article>
</main>
''' + footer(lang, depth) + '</body>\n</html>\n'



def fa_public(lang):
    d = FAPAGE[lang]
    depth = 1 if lang == 'en' else 2
    r = rel(depth)
    app = f'{r}app/'
    ex = d['ex']
    faq = ''.join(f'<details><summary><h3>{escape(q)}</h3></summary><div class="a"><p>{escape(a)}</p></div></details>' for q, a in d['faq'])
    faq_ld = ld({'@context': 'https://schema.org', '@type': 'FAQPage', 'inLanguage': lang,
                 'mainEntity': [{'@type': 'Question', 'name': q, 'acceptedAnswer': {'@type': 'Answer', 'text': a}} for q, a in d['faq']]})
    steps = ''.join(f'<li><h3>{escape(a)}</h3><p>{escape(b)}</p></li>' for a, b in d['steps'])
    chips = ''.join(f'<span class="fa-chip {"down" if c.startswith("✗") else "up"}">{escape(c)}</span>' for c in ex['chips'])
    card = f"""<div class="fa-ex" aria-label="{escape(d['ex_label'])}"><div class="fa-ex-l">{escape(d['ex_label'])}</div>
      <article class="fa-card"><div class="fa-rank">1</div><div class="fa-main">
        <div class="fa-in"><span class="av" data-ini="SG"></span><div class="fa-id"><b>{escape(ex['in'])}</b><span class="meta">{escape(ex['in_meta'])}</span></div><div class="fa-gain up"><small>{escape(ex['gain'])}</small>+1.6</div></div>
        <div class="fa-out"><span class="slot-tag tag-out">{escape(ex['out_label'])}</span> {escape(ex['out'])}</div>
        <div class="fa-chips">{chips}</div><div class="fa-why"><span>{escape(ex['why'])}</span></div>
        <div class="fa-foot"><span class="meta">{escape(ex['games'])}</span></div></div></article></div>"""
    txt = json.dumps({k: d[k] for k in ('rising_loading', 'rising_error', 'rising_none', 'rising_own', 'rising_min')}, ensure_ascii=False)
    return head(lang, 'fa', d['title'], d['desc'], depth, extra=faq_ld) + header(lang, 'fa', depth) + f"""
<main class="wrap fa-pub">
  <section class="hero hero-fa">
    <div class="hero-text">
      <h1>{escape(d['h1'])}</h1>
      <p>{escape(d['lead'])}</p>
      <div class="hero-actions"><button type="button" class="cta" data-pick-league="fa">{escape(d['cta'])}</button></div>
    </div>
    {card}
  </section>
  <section aria-labelledby="steps-h">
    <h2 id="steps-h">{escape(d['steps_h'])}</h2>
    <ol class="hsteps">{steps}</ol>
  </section>
  <section class="fa-rise" id="fa-rise" aria-labelledby="rise-h" data-txt='{escape(txt)}' data-app="{r}assets/app.js" data-lang="{lang}">
    <h2 id="rise-h">{escape(d['rising_h'])}</h2>
    <p class="lead">{escape(d['rising_note'])}</p>
    <ol class="fa-rise-list" id="fa-rise-list"><li class="empty">{escape(d['rising_loading'])}</li></ol>
    <div class="mini-cta"><a class="cta2" href="{app}#home&amp;addleague=1&amp;lang={lang}">{escape(d['rising_cta'])}</a></div>
  </section>
  <section aria-labelledby="faq-h">
    <h2 id="faq-h">{escape(d['faq_h'])}</h2>
    <div class="faq">{faq}</div>
  </section>
</main>
""" + footer(lang, depth) + f"""<script src="{r}assets/fa-public.js" defer></script>
</body>
</html>
"""

# ---------------------------------------------------------------------------
# /trade-finder/: javna stranica Pronađi trejd (alat radi i bez lige)
# ---------------------------------------------------------------------------
FINDER = {
    'en': {
        'title': 'Fantasy Basketball Trade Finder | RosterSwing',
        'desc': 'Find fair fantasy basketball trades between two teams. Mark who you will not trade, pick a strategy and get trade ideas that help your team and still make sense for the other manager.',
        'h1': 'Fantasy Basketball Trade Finder',
        'lead': 'Add your team and the team you want to trade with. RosterSwing checks every trade from 1 for 1 up to 4 for 4 and shows the ones that help you the most and are still fair enough for the other side to accept.',
        'footer': 'Trade finder',
        'tool_h': 'Trade finder',
        'loading': 'Loading players…',
        'ex_label': 'Example suggestion',
        'ex': {'give': [('Jalen Brunson', 'NYK · PG'), ('Rui Hachimura', 'LAC · SF/PF')], 'get': [('Pascal Siakam', 'IND · PF'), ('Jordan Poole', 'NOP · PG/SG')],
               'give_l': 'You give', 'get_l': 'You get', 'head': 'You win 6 categories, lose 3', 'changes': 'REB +4.1 · BLK +0.8 · AST −2.6',
               'chips': ['✓ FG%', '✓ FT%', '✗ 3PM', '✓ PTS', '✓ REB', '✗ AST', '✓ STL', '✓ BLK', '✗ TO'],
               'why': 'Why they might accept: they gain AST, where they are 11th in the league.', 'open': 'Open in analyzer'},
        'steps_h': 'How it works',
        'steps': [('Add both teams', 'Search for players and add your roster on the left and the other team on the right. With an imported league, both rosters are already there.'),
                  ('Mark players', 'Lock players you will not trade, mark players you would give only for a good price, and mark players who must be in the trade.'),
                  ('Pick a strategy and search', 'Choose Best for me, Improve categories, Sell high, Buy low, Consolidate or Depth, set how fair the trade must be, and get five ideas at a time.')],
        'faq_h': 'Frequently asked questions',
        'faq': [('How does the trade finder decide a trade is fair?', 'It compares rest of season value on both sides, including the roster spot a team must open or can fill. It also checks that the other team does not lose too many categories, ignoring categories they punt.'),
                ('Do I need to import my league?', 'No. You can add both teams by hand and use the default 9-cat format, or change the format. Importing an ESPN, Sleeper or Fantrax league adds real rosters, free agents and standings.'),
                ('What does Lock, Only for a good price and Trade mean?', 'Lock keeps a player out of every trade. Only for a good price lets a player be traded only when the gain is clearly bigger. Trade means the player must be part of every suggestion.'),
                ('Does it work for points leagues?', 'Yes. In points leagues it ranks trades by fantasy points per game and makes sure the other team does not lose too many points.'),
                ('Can I see the trade in more detail?', 'Yes. Open any suggestion in the trade analyzer to see category totals, weekly games and the full roster before and after the trade.')],
        'save_note': 'Like a trade setup? Save it as a league and come back to it later.',
    },
    'sr': {
        'title': 'Fantasy košarka: pronađi trejd | RosterSwing',
        'desc': 'Pronađi fer trejdove u fantasy košarci između dva tima. Označi koga ne daješ, izaberi strategiju i dobij predloge koji pomažu tvom timu, a imaju smisla i za drugog menadžera.',
        'h1': 'Fantasy košarka: pronađi trejd',
        'lead': 'Dodaj svoj tim i tim sa kojim želiš trejd. RosterSwing proverava sve trejdove od 1 za 1 do 4 za 4 i pokazuje one koji ti najviše pomažu, a dovoljno su fer da ih druga strana prihvati.',
        'footer': 'Pronađi trejd',
        'tool_h': 'Pronađi trejd',
        'loading': 'Učitavam igrače…',
        'ex_label': 'Primer predloga',
        'ex': {'give': [('Jalen Brunson', 'NYK · PG'), ('Rui Hachimura', 'LAC · SF/PF')], 'get': [('Pascal Siakam', 'IND · PF'), ('Jordan Poole', 'NOP · PG/SG')],
               'give_l': 'Daješ', 'get_l': 'Dobijaš', 'head': 'Dobijaš 6 kategorija, gubiš 3', 'changes': 'REB +4.1 · BLK +0.8 · AST −2.6',
               'chips': ['✓ FG%', '✓ FT%', '✗ 3PM', '✓ PTS', '✓ REB', '✗ AST', '✓ STL', '✓ BLK', '✗ TO'],
               'why': 'Zašto bi prihvatio: dobija AST, gde je 11. u ligi.', 'open': 'Otvori u analizi'},
        'steps_h': 'Kako radi',
        'steps': [('Dodaj oba tima', 'Pretraži igrače i dodaj svoj roster levo, a tim sa kojim praviš trejd desno. Sa uvezenom ligom oba rostera su već tu.'),
                  ('Označi igrače', 'Zaključaj igrače koje ne daješ, označi one koje daješ samo za dobru cenu i one koji moraju biti u trejdu.'),
                  ('Izaberi strategiju i traži', 'Izaberi Najbolje za mene, Popravi kategorije, Prodaj skupo, Kupi jeftino, Konsolidaciju ili Dubinu, podesi koliko trejd mora biti fer i dobij pet ideja odjednom.')],
        'faq_h': 'Česta pitanja',
        'faq': [('Kako alat odlučuje da je trejd fer?', 'Poredi vrednost obe strane do kraja sezone, uključujući mesto u rosteru koje tim mora da oslobodi ili može da popuni. Proverava i da drugi tim ne gubi previše kategorija, bez kategorija koje on puntuje.'),
                ('Da li moram da uvezem ligu?', 'Ne. Oba tima možeš da dodaš ručno i koristiš podrazumevani 9-cat format ili da ga promeniš. Uvoz ESPN, Sleeper ili Fantrax lige dodaje prave rostere, slobodne igrače i tabelu.'),
                ('Šta znače Zaključaj, Dajem ako mora i U trejd?', 'Zaključaj drži igrača van svakog trejda. Dajem ako mora dozvoljava trejd igrača samo kad je korist jasno veća. U trejd znači da igrač mora biti u svakom predlogu.'),
                ('Da li radi za lige na poene?', 'Da. U ligama na poene trejdove rangira po fantasy poenima po utakmici i pazi da drugi tim ne izgubi previše poena.'),
                ('Mogu li da vidim trejd detaljnije?', 'Da. Svaki predlog otvori u Analizi trejda i vidi zbir kategorija, utakmice po nedeljama i ceo roster pre i posle trejda.')],
        'save_note': 'Sviđa ti se ovakva postavka? Sačuvaj je kao ligu i vrati joj se kasnije.',
    },
}


def finder_public(lang):
    d = FINDER[lang]
    depth = 1 if lang == 'en' else 2
    r = rel(depth)
    app = f'{r}app/'
    ta = page_href('analyzer', lang, depth)
    ex = d['ex']
    faq = ''.join(f'<details><summary><h3>{escape(q)}</h3></summary><div class="a"><p>{escape(a)}</p></div></details>' for q, a in d['faq'])
    faq_ld = ld({'@context': 'https://schema.org', '@type': 'FAQPage', 'inLanguage': lang,
                 'mainEntity': [{'@type': 'Question', 'name': q, 'acceptedAnswer': {'@type': 'Answer', 'text': a}} for q, a in d['faq']]})
    steps = ''.join(f'<li><h3>{escape(a)}</h3><p>{escape(b)}</p></li>' for a, b in d['steps'])
    pl = lambda n, m: f'<li><span class="av" data-ini="{initials(n)}"></span><span class="tf-pn"><b>{escape(n)}</b><small>{escape(m)}</small></span></li>'
    chips = ''.join(f'<span class="fa-chip {"down" if c.startswith("✗") else "up"}">{escape(c)}</span>' for c in ex['chips'])
    card = f"""<div class="fa-ex tf-ex" aria-label="{escape(d['ex_label'])}"><div class="fa-ex-l">{escape(d['ex_label'])}</div>
      <article class="tf-card static">
        <div class="tf-sides"><div><span class="slot-tag tag-out">{escape(ex['give_l'])}</span><ul>{''.join(pl(n, m) for n, m in ex['give'])}</ul></div>
          <div><span class="slot-tag tag-in">{escape(ex['get_l'])}</span><ul>{''.join(pl(n, m) for n, m in ex['get'])}</ul></div></div>
        <div class="fa-score up"><b>{escape(ex['head'])}</b><span class="fa-changes">{escape(ex['changes'])}</span></div>
        <div class="fa-chips">{chips}</div>
        <p class="tf-why">{escape(ex['why'])}</p>
        <div class="tf-foot"><span class="btn small">{escape(ex['open'])}</span></div></article></div>"""
    return head(lang, 'finder', d['title'], d['desc'], depth, extra=faq_ld) + header(lang, 'finder', depth) + f"""
<main class="wrap tf-pub">
  <section class="hero hero-fa">
    <div class="hero-text">
      <h1>{escape(d['h1'])}</h1>
      <p>{escape(d['lead'])}</p>
    </div>
    {card}
  </section>

  <section class="tool" id="tool" aria-label="{escape(d['tool_h'])}">
    <div class="tf-leagues" id="tf-leagues"></div>
    <div class="tool-periods"><div class="seg" id="periods" role="group" aria-label="Period"></div><div id="fmtbar" class="fmtbar"><span class="fbar"><span class="fchip static">9-cat H2H</span></span></div></div>
    <div class="tool-app">
      <div class="status" id="status">{escape(d['loading'])}</div>
      <div id="banner"></div>
      <div id="tf-app"></div>
      <p class="pnote tf-save-note">{escape(d['save_note'])}</p>
    </div>
    <div hidden><span id="hleague"></span><button type="button" id="pchip"></button><section id="home"></section><div id="leaguebar"></div><div id="wshead"></div><div id="tradetabs"></div><div id="tradewarn"></div><div id="score"></div><div id="teams"></div><div id="compare"></div><div id="nudge"></div><div id="report"></div><div id="myteam"></div><div id="oppteam"></div><div id="history"></div></div>
  </section>

  <section aria-labelledby="steps-h">
    <h2 id="steps-h">{escape(d['steps_h'])}</h2>
    <ol class="hsteps">{steps}</ol>
  </section>

  <section aria-labelledby="faq-h">
    <h2 id="faq-h">{escape(d['faq_h'])}</h2>
    <div class="faq">{faq}</div>
  </section>
</main>
""" + footer(lang, depth) + f"""<script>window.RS_EMBED={{lang:'{lang}',app:'{app}',finder:true,ta:'{ta}'}};</script>
<script src="{r}assets/app.js" defer></script>
</body>
</html>
"""

def write(path, content):
    full = os.path.join(ROOT, path)
    os.makedirs(os.path.dirname(full) or ROOT, exist_ok=True)
    if path.endswith('.html'):
        content = stamp_assets(content)
    with open(full, 'w', encoding='utf-8') as f:
        f.write(content)
    print('  ', path)


def main():
    for lang in ('en', 'sr'):
        write(PAGES['home'][lang] + 'index.html', home(lang))
        write(PAGES['analyzer'][lang] + 'index.html', analyzer(lang))
        write(PAGES['privacy'][lang] + 'index.html', doc(lang, 'privacy', PRIVACY[lang], 1 if lang == 'en' else 2))
        write(PAGES['about'][lang] + 'index.html', doc(lang, 'about', ABOUT[lang], 1 if lang == 'en' else 2))
        write(PAGES['howto'][lang] + 'index.html', howto(lang))
        write(PAGES['fa'][lang] + 'index.html', fa_public(lang))
        write(PAGES['finder'][lang] + 'index.html', finder_public(lang))
    # /app/ nije u mapi sajta i ima <meta name="robots" content="noindex"> (ne blokira se ovde, da bi pretraživač video noindex)
    write_app_header()
    write('robots.txt', f'User-agent: *\nAllow: /\n\nSitemap: {SITE_URL}sitemap.xml\n')
    urls = []
    for page, paths in PAGES.items():
        for lang in ('en', 'sr'):
            alts = ''.join(f'\n    <xhtml:link rel="alternate" hreflang="{l}" href="{SITE_URL + paths[l]}"/>' for l in ('en', 'sr'))
            alts += f'\n    <xhtml:link rel="alternate" hreflang="x-default" href="{SITE_URL + paths["en"]}"/>'
            urls.append(f'  <url>\n    <loc>{SITE_URL + paths[lang]}</loc>\n    <lastmod>{UPDATED}</lastmod>{alts}\n  </url>')
    write('sitemap.xml', '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n' + '\n'.join(urls) + '\n</urlset>\n')


if __name__ == '__main__':
    main()
