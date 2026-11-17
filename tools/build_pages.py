#!/usr/bin/env python3
"""
Pravi javne stranice RosterSwing sajta kao obične HTML fajlove (sav tekst je u HTML-u, zbog pretrage).

Pokretanje (iz korena projekta):  python3 tools/build_pages.py
Pravi: index.html, sr/index.html (početna), trade-analyzer/, sr/trade-analyzer/ (analiza trejda bez lige),
privacy/, sr/privacy/, about/, sr/about/, robots.txt, sitemap.xml

Prelazak na sopstveni domen: promeni samo SITE_URL ispod i ponovo pokreni skriptu.
Linkovi između stranica su relativni, pa sajt radi na bilo kojoj osnovnoj putanji.
"""
import json
import os
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
}

# Alati sa početne: ready=False prikazuje "Coming soon"; kad alat postoji, ready=True i href (relativno od korena sajta)
TOOLS = {
    'finder':  {'ready': False, 'href': None},   # Find the player your team needs
    'builder': {'ready': False, 'href': None},   # Build a trade between two teams
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
               'verdict': 'The trade gains you 6 categories, you lose 3'},
        'mini_h': 'Try a quick trade',
        'mini_lead': 'Up to 2 players per side. Season averages per game.',
        'mini_give_ph': 'Who do you give…', 'mini_get_ph': 'Who do you get…',
        'mini_loading': 'Loading players…', 'mini_error': 'Players could not be loaded. Try again later.', 'mini_none': 'No players found',
        'mini_full': 'See full analysis', 'mini_hint': 'Add a player on each side to see the score.', 'mini_remove': 'Remove',
        'league_h': 'Add your league and team',
        'league_p': 'Save your roster and see how every trade changes your team, with your league roster size and IR spots. Manual entry for now.',
        'league_cta': 'Add your league',
        'ba': {'title': 'My team before and after', 'before': 'Before', 'after': 'After', 'diff': 'Difference'},
        'finder_h': 'Find the player your team needs',
        'finder_p': 'Pick the categories you want to improve and see players on other teams who bring them.',
        'builder_h': 'Build a trade between two teams',
        'builder_p': 'Pick your team and one more, and get trade ideas: 1 for 1, 2 for 1 and 2 for 2.',
        'soon': 'Coming soon', 'open_tool': 'Open',
        'continue_bar': 'Continue where you left off',
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
               'verdict': 'Trejd ti donosi 6 kategorija, gubiš 3'},
        'mini_h': 'Probaj brzi trejd',
        'mini_lead': 'Do 2 igrača po strani. Prosek po utakmici za sezonu.',
        'mini_give_ph': 'Koga daješ…', 'mini_get_ph': 'Koga dobijaš…',
        'mini_loading': 'Učitavam igrače…', 'mini_error': 'Igrači nisu učitani. Pokušaj kasnije.', 'mini_none': 'Nema igrača',
        'mini_full': 'Pogledaj celu analizu', 'mini_hint': 'Dodaj igrača na svaku stranu da vidiš rezultat.', 'mini_remove': 'Ukloni',
        'league_h': 'Dodaj svoju ligu i tim',
        'league_p': 'Sačuvaj roster i vidi kako svaki trejd menja tvoj tim, sa veličinom rostera i IR mestima tvoje lige. Za sada se roster unosi ručno.',
        'league_cta': 'Dodaj svoju ligu',
        'ba': {'title': 'Moj tim pre i posle', 'before': 'Pre', 'after': 'Posle', 'diff': 'Razlika'},
        'finder_h': 'Nađi igrača koji treba tvom timu',
        'finder_p': 'Izaberi kategorije koje hoćeš da popraviš i vidi igrače iz drugih ekipa koji ih donose.',
        'builder_h': 'Napravi trejd između dva tima',
        'builder_p': 'Izaberi svoj i još jedan tim i dobij predloge trejdova 1 za 1, 2 za 1 i 2 za 2.',
        'soon': 'Uskoro', 'open_tool': 'Otvori',
        'continue_bar': 'Nastavi gde si stao',
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
        'faq': [
            ('How are FG% and FT% calculated?',
             'From the total makes and attempts of all players on each side, not by averaging percentages. A player who shoots 60% on 3 attempts moves the result less than one who shoots 50% on 15 attempts. With your roster added, the tool also shows how much your team percentage changes.'),
            ('What is 9-cat?',
             '9-cat is the most common category format in fantasy basketball: points, rebounds, assists, three pointers, steals, blocks, field goal percentage, free throw percentage and turnovers. In head to head leagues you win or lose each category every week. For turnovers, fewer is better.'),
            ('Is this fantasy basketball trade calculator free?',
             'Yes. RosterSwing is free to use. There is nothing to buy and no sign-up.'),
            ('Where does the data come from?',
             'Player stats, projections and news come from publicly available ESPN fantasy data. Numbers are averages per game for the period you pick.'),
            ('Does it work for Yahoo leagues?',
             'Yes. The analyzer compares players, not platforms, so it works for Yahoo, ESPN and other leagues with 9-category scoring. You can set your league roster size, including IR spots. Stats always come from the same source.'),
            ('Do I need an account?',
             'No. Leagues, rosters and trades are saved only in your browser on this device. There is no account and no server that stores your data.'),
            ('What does "low volume" mean?',
             'A percentage built on very few attempts, under 3 field goal or 1.5 free throw attempts per game on one side. It barely changes a team percentage, so when no roster is added, that category counts as a tie in the score.'),
        ],
        'save_row': 'Save your team and see how this trade changes it',
        'footer_about': 'About',
        'footer_privacy': 'Privacy',
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
            ('Kako se računaju FG% i FT%?',
             'Iz zbira pogođenih i ukupnih šuteva svih igrača na strani, a ne kao prosek procenata. Igrač koji šutira 60% na 3 pokušaja manje pomera rezultat od igrača koji šutira 50% na 15 pokušaja. Kad uneseš roster, alat pokazuje i koliko se menja procenat tvog tima.'),
            ('Šta je 9-cat?',
             '9-cat je najčešći format sa kategorijama u fantasy košarci: poeni, skokovi, asistencije, trojke, ukradene lopte, blokade, procenat šuta iz igre, procenat slobodnih bacanja i izgubljene lopte. U H2H ligama svake nedelje dobijaš ili gubiš svaku kategoriju. Kod izgubljenih lopti, manje je bolje.'),
            ('Da li je kalkulator za fantasy trejdove besplatan?',
             'Jeste. RosterSwing je besplatan. Nema plaćanja i nema registracije.'),
            ('Odakle su podaci?',
             'Statistika, projekcije i vesti o igračima dolaze iz javno dostupnih ESPN fantasy podataka. Brojke su prosek po utakmici za period koji izabereš.'),
            ('Da li radi za Yahoo lige?',
             'Radi. Alat poredi igrače, ne platforme, pa radi za Yahoo, ESPN i druge lige sa 9 kategorija. Možeš da podesiš veličinu rostera svoje lige, uključujući IR mesta. Statistika uvek dolazi iz istog izvora.'),
            ('Da li mi treba nalog?',
             'Ne treba. Lige, rosteri i trejdovi čuvaju se samo u tvom browseru, na ovom uređaju. Nema naloga i nema servera koji čuva tvoje podatke.'),
            ('Šta znači „mali obim“?',
             'Procenat na vrlo malo šuteva, ispod 3 šuta iz igre ili 1.5 slobodnih bacanja po utakmici na jednoj strani. Takav procenat skoro ne menja procenat tima, pa se, dok roster nije unet, ta kategorija računa kao nerešena.'),
        ],
        'save_row': 'Sačuvaj svoj tim i vidi kako trejd utiče na njega',
        'footer_about': 'O sajtu',
        'footer_privacy': 'Privatnost',
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
        'upd': 'Last updated: November 17, 2026',
        'body': f'''
<p>RosterSwing is a free set of fantasy basketball tools. It has no accounts, no sign-up and no server of its own that receives your data.</p>
<h2>What is stored and where</h2>
<p>Everything you enter is saved <strong>only in your browser</strong> (local storage) on the device you use:</p>
<ul>
<li>leagues and league settings (name, platform, roster size, standings you type in),</li>
<li>your roster and the opponent rosters you add,</li>
<li>open trades, trade history and saved trade ideas,</li>
<li>your profile name, if you enter one, and your language choice,</li>
<li>a temporary copy of player stats, so the page loads faster.</li>
</ul>
<p>We do not receive, see or keep any of this. If you clear your browser data for this site, it is deleted. You can make a backup and delete everything from the settings in the app.</p>
<h2>What is loaded from other services</h2>
<p>To show stats, your browser connects directly to these services. Like any website, they can see your IP address and basic browser information:</p>
<ul>
<li><strong>ESPN</strong> fantasy data: player stats, projections, team schedules and player news,</li>
<li><strong>ESPN</strong> image server: player photos,</li>
<li><strong>Google Fonts</strong>: the Inter font,</li>
<li><strong>GitHub Pages</strong>: hosts this website.</li>
</ul>
<p>RosterSwing does not use analytics, advertising or tracking cookies.</p>
<h2>Shared links and AI text</h2>
<p>A shared trade link contains only player IDs, the stats period and the language. Your rosters and history are not in the link.</p>
<p>"Copy for AI analysis" puts the text on your clipboard. Nothing is sent anywhere unless you paste it yourself.</p>
<h2>Contact</h2>
<p>Questions about privacy: <a href="{CONTACT_URL}" rel="noopener">{CONTACT_URL.replace('https://', '')}</a>.</p>
''',
    },
    'sr': {
        'title': 'Politika privatnosti | RosterSwing',
        'desc': 'Kako RosterSwing postupa sa tvojim podacima: bez naloga, bez servera, sve što uneseš ostaje u tvom browseru.',
        'h1': 'Politika privatnosti',
        'upd': 'Poslednja izmena: 17. novembar 2026.',
        'body': f'''
<p>RosterSwing je besplatan skup alata za fantasy košarku. Nema naloga, nema registracije i nema sopstveni server koji prima tvoje podatke.</p>
<h2>Šta se čuva i gde</h2>
<p>Sve što uneseš čuva se <strong>samo u tvom browseru</strong> (lokalna memorija) na uređaju koji koristiš:</p>
<ul>
<li>lige i podešavanja lige (naziv, platforma, veličina rostera, tabela koju uneseš),</li>
<li>tvoj roster i rosteri protivnika koje dodaš,</li>
<li>otvoreni trejdovi, istorija trejdova i sačuvane ideje,</li>
<li>ime profila, ako ga uneseš, i izabrani jezik,</li>
<li>privremena kopija statistike igrača, da se stranica brže učita.</li>
</ul>
<p>Mi ništa od ovoga ne primamo, ne vidimo i ne čuvamo. Ako obrišeš podatke browsera za ovaj sajt, sve se briše. U podešavanjima aplikacije možeš da napraviš rezervnu kopiju i da obrišeš sve.</p>
<h2>Šta se učitava sa drugih servisa</h2>
<p>Da bi prikazao statistiku, tvoj browser se direktno povezuje sa ovim servisima. Kao i svaki sajt, oni mogu da vide tvoju IP adresu i osnovne podatke o browseru:</p>
<ul>
<li><strong>ESPN</strong> fantasy podaci: statistika, projekcije, raspored utakmica i vesti o igračima,</li>
<li><strong>ESPN</strong> server za slike: fotografije igrača,</li>
<li><strong>Google Fonts</strong>: font Inter,</li>
<li><strong>GitHub Pages</strong>: hostuje ovaj sajt.</li>
</ul>
<p>RosterSwing ne koristi analitiku, reklame ni kolačiće za praćenje.</p>
<h2>Deljeni linkovi i tekst za AI</h2>
<p>Deljeni link trejda sadrži samo ID igrača, period statistike i jezik. Tvoji rosteri i istorija nisu u linku.</p>
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
    'sr': {'home': 'Početna', 'tools': 'Alati', 'leagues': 'Moje lige', 'analyzer': 'Analiza trejda', 'finder': 'Igrač za tim', 'builder': 'Trejd između dva tima',
           'soon': 'Uskoro', 'quick': 'Brzo poređenje', 'all': 'Sve lige', 'add': 'Dodaj ligu'},
    'en': {'home': 'Home', 'tools': 'Tools', 'leagues': 'My leagues', 'analyzer': 'Trade analyzer', 'finder': 'Player for your team', 'builder': 'Trade between two teams',
           'soon': 'Coming soon', 'quick': 'Quick compare', 'all': 'All leagues', 'add': 'Add league'},
}
NAV_ICON = {
    'analyzer': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 8h14l-4-4M20 16H6l4 4"/></svg>',
    'finder': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
    'builder': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="8" cy="8" r="3"/><circle cx="16" cy="16" r="3"/><path d="M11 8h6v5M13 16H7v-5"/></svg>',
    'quick': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M13 2 4 14h7l-1 8 9-12h-7z"/></svg>',
    'all': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>',
    'add': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
    'caret': '<svg class="caret" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>',
}
TOOL_PAGES = {'finder': TOOLS['finder'], 'builder': TOOLS['builder']}


def gnav_html(lang, root, page=None, app_page=False):
    """Isto zaglavlje na svim stranicama: logo, Početna, Alati ▾, Moje lige ▾, jezik (na kraju)."""
    n = NAV_T[lang]
    pre = 'sr/' if lang == 'sr' else ''
    home = f'{root}{pre}' or './'
    ta = f'{root}{pre}trade-analyzer/'
    app = '' if app_page else f'{root}app/'
    def tool_item(key):
        t = TOOL_PAGES[key]
        if t['ready'] and t['href']:
            return f'<a role="menuitem" class="pm-item" href="{root}{t["href"]}">{NAV_ICON[key]}<span data-t="{key}">{n[key]}</span></a>'
        return f'<span class="pm-item off" aria-disabled="true">{NAV_ICON[key]}<span data-t="{key}">{n[key]}</span><span class="soon" data-t="soon">{n["soon"]}</span></span>'
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
          {tool_item('finder')}
          {tool_item('builder')}
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
    <label class="langsel" title="Jezik / Language">{GLOBE}{langsel}</label>
  </div>
</header>
"""


def header(lang, page, depth):
    return f'<body class="pub" data-pubpage="{page}">\n' + gnav_html(lang, rel(depth), page) + f'<script src="{rel(depth)}assets/nav.js"></script>\n'


def write_app_header():
    """Isto zaglavlje i u aplikaciji (app/index.html, između oznaka GNAV)"""
    path = os.path.join(ROOT, 'app', 'index.html')
    html = open(path, encoding='utf-8').read()
    a, b = html.index('<!-- GNAV -->'), html.index('<!-- /GNAV -->')
    html = html[:a] + '<!-- GNAV -->\n' + gnav_html('sr', '../', app_page=True) + html[b:]
    open(path, 'w', encoding='utf-8').write(html)
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


def jsonld_faq(lang):
    return ld({
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        'inLanguage': lang,
        'mainEntity': [{'@type': 'Question', 'name': q, 'acceptedAnswer': {'@type': 'Answer', 'text': a}} for q, a in T[lang]['faq']],
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
    chips = ''.join(f'<span class="mc {"good" if x > 0 else "bad"}">{"+" if x > 0 else "−"} {c}</span>' for c, x in cats)
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
    action = (f'<a class="cta2" href="{{root}}{tool["href"]}">{escape(h["open_tool"])}</a>' if tool['ready'] and tool['href']
              else f'<span class="soon">{escape(h["soon"])}</span>')
    return f"""<section class="feature" aria-labelledby="{key}-h"><h2 id="{key}-h">{escape(h[key + '_h'])}</h2><p class="lead">{escape(h[key + '_p'])}</p>{action}</section>"""


def home(lang):
    t = T[lang]; h = HOME[lang]
    depth = 0 if lang == 'en' else 1
    r = rel(depth)
    app = f'{r}app/'
    ta = page_href('analyzer', lang, depth)
    extra = REDIRECT.replace('{app}', app).replace('{ta}', ta).replace('{lang}', lang) + jsonld_faq(lang)
    faq = ''.join(f'<details><summary><h3>{escape(q)}</h3></summary><div class="a"><p>{escape(a)}</p></div></details>' for q, a in t['faq'])
    mini_txt = json.dumps({k: h[k] for k in ('mini_give_ph', 'mini_get_ph', 'mini_loading', 'mini_error', 'mini_none', 'mini_hint', 'mini_remove')}, ensure_ascii=False)
    add_league = f'{app}#home&amp;addleague=1&amp;lang={lang}'
    return head(lang, 'home', h['title'], h['desc'], depth, extra, og=h) + header(lang, 'home', depth) + f"""
<div class="continue-bar" id="continue-bar" hidden><div class="wrap"><span>{escape(h['continue_bar'])}</span><a class="cta" id="continue-btn" href="{app}">…</a></div></div>
<script>
(function(){{if(!/[?&]home\\b/.test(location.search))return;try{{var p=JSON.parse(localStorage.getItem('fbaTrade.profile.v2'));var l=p&&p.leagues&&(p.leagues.find(function(x){{return x.id===p.lastLeagueId}})||p.leagues[0]);if(!l)return;
var b=document.getElementById('continue-btn');b.textContent={json.dumps(h['continue_btn'])}.replace('{{name}}',l.name);b.href='{app}#league-'+l.id+'/overview&lang={lang}';document.getElementById('continue-bar').hidden=false;}}catch(e){{}}}})();
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
    <p class="lead">{escape(h['mini_lead'])}</p>
    <div class="mini-sides">
      <div class="mini-side" data-side="0"><label class="give-t" for="mini-0">{escape(t['pre']['give'][0])}</label><div class="mini-chips"></div>
        <div class="mini-in"><input id="mini-0" type="search" autocomplete="off" spellcheck="false" placeholder="{escape(h['mini_give_ph'])}" role="combobox" aria-expanded="false" aria-controls="mini-dd-0"><ul class="dd" id="mini-dd-0" role="listbox" hidden></ul></div></div>
      <div class="mini-side" data-side="1"><label class="get-t" for="mini-1">{escape(t['pre']['get'][0])}</label><div class="mini-chips"></div>
        <div class="mini-in"><input id="mini-1" type="search" autocomplete="off" spellcheck="false" placeholder="{escape(h['mini_get_ph'])}" role="combobox" aria-expanded="false" aria-controls="mini-dd-1"><ul class="dd" id="mini-dd-1" role="listbox" hidden></ul></div></div>
    </div>
    <div class="mini-result" id="mini-result" aria-live="polite"><span class="mini-hint">{escape(h['mini_hint'])}</span></div>
    <a class="cta" id="mini-full" href="{ta}">{escape(h['mini_full'])}</a>
  </section>

  <section class="feature feature-league" aria-labelledby="league-h">
    <div><h2 id="league-h">{escape(h['league_h'])}</h2><p class="lead">{escape(h['league_p'])}</p><a class="cta2" href="{add_league}">{escape(h['league_cta'])}</a></div>
    {before_after_html(lang)}
  </section>

  <div class="feature-grid">{tool_card(lang, 'finder').replace('{root}', r)}{tool_card(lang, 'builder').replace('{root}', r)}</div>

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
    extra = jsonld_app(lang)
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
    <div class="tool-periods"><div class="seg" id="periods" role="group" aria-label="Period">{pre_periods}</div></div>
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
    <ol class="steps">{steps}</ol>
  </section>

  <section aria-labelledby="what-h">
    <h2 id="what-h">{escape(t['what_h'])}</h2>
    <ul class="feats">{feats}</ul>
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


def write(path, content):
    full = os.path.join(ROOT, path)
    os.makedirs(os.path.dirname(full) or ROOT, exist_ok=True)
    with open(full, 'w', encoding='utf-8') as f:
        f.write(content)
    print('  ', path)


def main():
    for lang in ('en', 'sr'):
        write(PAGES['home'][lang] + 'index.html', home(lang))
        write(PAGES['analyzer'][lang] + 'index.html', analyzer(lang))
        write(PAGES['privacy'][lang] + 'index.html', doc(lang, 'privacy', PRIVACY[lang], 1 if lang == 'en' else 2))
        write(PAGES['about'][lang] + 'index.html', doc(lang, 'about', ABOUT[lang], 1 if lang == 'en' else 2))
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
