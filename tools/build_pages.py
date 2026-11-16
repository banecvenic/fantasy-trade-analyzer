#!/usr/bin/env python3
"""
Pravi javne stranice RosterSwing sajta kao obične HTML fajlove (sav tekst je u HTML-u, zbog pretrage).

Pokretanje (iz korena projekta):  python3 tools/build_pages.py
Pravi: index.html, sr/index.html, privacy/, sr/privacy/, about/, sr/about/, robots.txt, sitemap.xml

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
    'home':    {'en': '', 'sr': 'sr/'},
    'privacy': {'en': 'privacy/', 'sr': 'sr/privacy/'},
    'about':   {'en': 'about/', 'sr': 'sr/about/'},
}

# ---------------------------------------------------------------------------
# TEKSTOVI
# ---------------------------------------------------------------------------
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


def head(lang, page, title, desc, depth, extra=''):
    r = rel(depth)
    canon = SITE_URL + PAGES[page][lang]
    alt = ''.join(f'<link rel="alternate" hreflang="{l}" href="{SITE_URL + PAGES[page][l]}">\n' for l in ('en', 'sr'))
    alt += f'<link rel="alternate" hreflang="x-default" href="{SITE_URL + PAGES[page]["en"]}">\n'
    t = T[lang]
    og_img = SITE_URL + t['og_image']
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
<meta property="og:image:alt" content="{escape(t['og_alt'])}">
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


def header(lang, page, depth):
    r = rel(depth)
    t = T[lang]
    other = 'sr' if lang == 'en' else 'en'
    home = r + PAGES['home'][lang] if PAGES['home'][lang] else (r or './')
    other_href = r + PAGES[page][other] if PAGES[page][other] else (r or './')
    app = f'{r}app/'
    # "My leagues" -> "Continue: [liga]" kad u browseru postoji profil sa ligom
    return f'''<body class="pub">
<header class="site-h">
  <div class="wrap">
    <a class="brand" href="{home}" aria-label="RosterSwing"><img class="brand-mark" src="{r}assets/favicon.svg" width="24" height="24" alt="RosterSwing"><img class="brand-word" src="{r}assets/wordmark.svg" width="96" height="16" alt=""><span class="brand-desc">Fantasy Basketball Tools</span></a>
    <nav class="site-nav" aria-label="{'Glavni meni' if lang == 'sr' else 'Main'}">
      <a class="lang-link" href="{other_href}" hreflang="{other}" lang="{other}">{t['lang_other']}</a>
      <a class="leagues-link" id="leagues-link" href="{app}#home&amp;lang={lang}">{t['my_leagues']}</a>
    </nav>
  </div>
</header>
<script>
(function(){{try{{var p=JSON.parse(localStorage.getItem('fbaTrade.profile.v2'));var l=p&&p.leagues&&(p.leagues.find(function(x){{return x.id===p.lastLeagueId}})||p.leagues[0]);
if(l){{var a=document.getElementById('leagues-link');a.textContent={json.dumps(t['continue'])}.replace('{{name}}',l.name);a.title=a.textContent;a.href='{app}#league-'+l.id+'&lang={lang}';}}}}catch(e){{}}}})();
</script>
'''


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


def jsonld_home(lang):
    t = T[lang]
    app = {
        '@context': 'https://schema.org',
        '@type': 'WebApplication',
        'name': 'RosterSwing ' + ('Fantasy Basketball Trade Analyzer' if lang == 'en' else 'kalkulator za fantasy trejdove'),
        'alternateName': 'RosterSwing',
        'url': SITE_URL + PAGES['home'][lang],
        'description': t['desc'],
        'applicationCategory': 'SportsApplication',
        'operatingSystem': 'Any',
        'browserRequirements': 'Requires JavaScript',
        'inLanguage': lang,
        'isAccessibleForFree': True,
        'offers': {'@type': 'Offer', 'price': '0', 'priceCurrency': 'USD'},
    }
    faq = {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        'inLanguage': lang,
        'mainEntity': [{'@type': 'Question', 'name': q, 'acceptedAnswer': {'@type': 'Answer', 'text': a}} for q, a in t['faq']],
    }
    dump = lambda o: json.dumps(o, ensure_ascii=False, indent=1).replace('</', '<\\/')
    return f'<script type="application/ld+json">\n{dump(app)}\n</script>\n<script type="application/ld+json">\n{dump(faq)}\n</script>\n'


# Stari linkovi (#league-…, #home, #quick, deljeni trejd #per=…&t=…&s=1) vode u aplikaciju sa istim stanjem
REDIRECT = '''<script>
(function(){var h=location.hash;if(/^#(home|quick|league-)/.test(h)||/(^#|&)(t|s|per)=/.test(h)){location.replace('{app}'+h);}})();
</script>
'''


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


def home(lang):
    t = T[lang]
    depth = 0 if lang == 'en' else 1
    r = rel(depth)
    app = f'{r}app/'
    extra = REDIRECT.replace('{app}', app) + jsonld_home(lang)
    pre_periods, pre_score, pre_teams = prerender(lang)
    steps = ''.join(f'<li><h3>{escape(a)}</h3><p>{escape(b)}</p></li>' for a, b in t['steps'])
    feats = ''.join(f'<li><h3>{escape(a)}</h3><p>{escape(b)}</p></li>' for a, b in t['feats'])
    faq = ''.join(f'<details><summary><h3>{escape(q)}</h3></summary><div class="a"><p>{escape(a)}</p></div></details>' for q, a in t['faq'])
    return head(lang, 'home', t['title'], t['desc'], depth, extra) + header(lang, 'home', depth) + f'''
<main class="wrap">
  <section class="hero">
    <div class="stripe" aria-hidden="true"><i style="background:var(--rs-red)"></i><i style="background:var(--rs-green)"></i><i style="background:var(--rs-blue)"></i></div>
    <h1>{escape(t['h1'])}</h1>
    <p>{escape(t['lead'])}</p>
    <a class="cta" href="#tool" id="cta">{escape(t['cta'])}</a>
  </section>

  <section class="tool" id="tool" aria-labelledby="tool-h">
    <h2 id="tool-h">{escape(t['tool_h'])}</h2>
    <p class="lead">{escape(t['tool_lead'])}</p>
    <div class="tool-periods"><div class="seg" id="periods" role="group" aria-label="Period">{pre_periods}</div></div>
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
    <div hidden><span id="hleague"></span><button type="button" id="pchip"></button><section id="home"></section><div id="leaguebar"></div><div id="wshead"></div><div id="tradetabs"></div><div id="myteam"></div><div id="oppteam"></div><div id="history"></div></div>
  </section>

  <section aria-labelledby="how-h">
    <h2 id="how-h">{escape(t['how_h'])}</h2>
    <ol class="steps">{steps}</ol>
  </section>

  <section aria-labelledby="what-h">
    <h2 id="what-h">{escape(t['what_h'])}</h2>
    <ul class="feats">{feats}</ul>
  </section>

  <section aria-labelledby="faq-h">
    <h2 id="faq-h">{escape(t['faq_h'])}</h2>
    <div class="faq">{faq}</div>
  </section>
</main>
''' + footer(lang, depth) + f'''<script>window.RS_EMBED={{lang:'{lang}',app:'{app}'}};</script>
<script src="{r}assets/app.js" defer></script>
<script>
document.getElementById('cta').addEventListener('click',function(e){{e.preventDefault();document.getElementById('tool').scrollIntoView({{behavior:'smooth'}});
var f=function(){{var i=document.querySelector('[data-search="0"]');if(i)i.focus({{preventScroll:true}});}};setTimeout(f,350);}});
</script>
</body>
</html>
'''


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
        write(PAGES['privacy'][lang] + 'index.html', doc(lang, 'privacy', PRIVACY[lang], 1 if lang == 'en' else 2))
        write(PAGES['about'][lang] + 'index.html', doc(lang, 'about', ABOUT[lang], 1 if lang == 'en' else 2))
    # /app/ nije u mapi sajta i ima <meta name="robots" content="noindex"> (ne blokira se ovde, da bi pretraživač video noindex)
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
