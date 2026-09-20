/*
 * De woorden van de browser, in twee talen.
 *
 * ── WAAROM GEEN BIBLIOTHEEK ─────────────────────────────────────────────
 * De renderer heeft geen build-stap en geen framework, en daar is dit geen
 * uitzondering op. Wat een i18n-bibliotheek hier zou toevoegen is pluralisatie
 * en datumopmaak; het eerste hebben we nauwelijks en het tweede doet
 * `Intl` al. Wat overblijft is een object met zinnen erin, en dat is dit.
 *
 * ── HOE HET WERKT ───────────────────────────────────────────────────────
 * Statische tekst in de HTML draagt `data-t="sleutel"`; `pasTaalToe()` loopt
 * daarlangs en vult hem in. Voor een titel, een aria-label of een placeholder
 * zijn er `data-t-titel`, `data-t-aria` en `data-t-plek`. Tekst die pas
 * tijdens het draaien ontstaat vraagt `t('sleutel')`.
 *
 * ── DE REGELS VOOR EEN SLEUTEL ──────────────────────────────────────────
 *   · Een sleutel die in `nl` staat hoort ook in `en` te staan. `test/taal.js`
 *     weigert het als dat niet zo is — een half vertaalde knop is erger dan
 *     een onvertaalde, want je ziet hem pas als je hem nodig hebt.
 *   · Een zin met een getal of een naam erin krijgt `{iets}` als gat en geen
 *     losse stukken die aan elkaar geplakt worden. Zinsvolgorde is per taal
 *     anders, en dat is nou juist het hele punt.
 *   · Eigennamen worden niet vertaald. Tougather heet in beide talen
 *     Tougather, en Ctrl heet Ctrl.
 */

const TALEN = ['nl', 'en'];

const WOORDEN = {
  nl: {
    /* ── Bovenbalk en panelen ─────────────────────────────────────── */
    'balk.assistent': 'Assistent',
    'balk.rust': 'Klaar wanneer jij bent',
    'balk.apps': 'Apps',
    'balk.opdracht': 'Geef een opdracht',
    'balk.vraag': 'Vraag iets over deze pagina',
    'balk.door': 'Ga door',
    'balk.stop': 'Stop',
    'balk.nietNu': 'Niet nu',

    'paneel.geluid': 'Geluid',
    'paneel.geluidUitleg': 'Alles wat in je tabbladen klinkt, ook in een workspace waar je nu niet bent.',
    'paneel.notitie': 'Notitie',
    'paneel.notitiePlek': 'Een gedachte, een adres, iets van straks. Bewaart zichzelf.',
    'paneel.notitieBewaard': 'bewaard',
    'paneel.apps': 'Apps',
    'paneel.appsHier': 'In deze browser',
    'paneel.stil': 'Er speelt niets.',
    'paneel.demp': 'Dit tabblad dempen',
    'paneel.hoorbaar': 'Geluid weer aanzetten',
    'paneel.naarTab': 'Naar dit tabblad in {ws}',
    'paneel.bron': '1 bron',
    'paneel.bronnen': '{aantal} bronnen',
    'paneel.notitieBezig': 'bezig met bewaren…',
    'paneel.eenSpeelt': ', 1 tabblad speelt',
    'paneel.spelen': ', {aantal} tabbladen spelen',
    'paneel.gedempt': ', gedempt',

    /* ── Zijbalk ──────────────────────────────────────────────────── */
    'zij.sluiten': 'Sluiten',
    'zij.minimaliseren': 'Minimaliseren',
    'zij.maximaliseren': 'Maximaliseren',
    'zij.verbergen': 'Zijbalk verbergen',
    'zij.tonen': 'Zijbalk tonen',
    'zij.terug': 'Terug',
    'zij.vooruit': 'Vooruit',
    'zij.herladen': 'Opnieuw laden',
    'zij.instellingen': 'Instellingen',
    'zij.tougatherOpenen': 'Tougather openen',
    'zij.adres': 'Zoek of voer een adres in',
    'zij.tabbladen': 'Tabbladen',
    'zij.nieuwTabblad': 'Nieuw tabblad',
    'zij.tabbladSluiten': 'Tabblad sluiten',
    'zij.naastElkaar': 'Naast het huidige tabblad zetten',
    'zij.nietNaastElkaar': 'Niet meer naast elkaar',
    'zij.werktIn': '{naam} werkt in dit tabblad',

    /* ── Zoeken op de pagina ──────────────────────────────────────── */
    'zoek.plek': 'Zoeken op deze pagina',
    'zoek.vorige': 'Vorige (Shift Enter)',
    'zoek.vorigeKort': 'Vorige treffer',
    'zoek.volgende': 'Volgende (Enter)',
    'zoek.volgendeKort': 'Volgende treffer',
    'zoek.sluiten': 'Sluiten (Esc)',
    'zoek.sluitenKort': 'Zoeken sluiten',
    'zoek.geen': 'geen',

    /* ── Downloads ────────────────────────────────────────────────── */
    'dl.kop': 'Downloads',
    'dl.wissen': 'Lijst wissen',
    'dl.uitLijst': 'Uit de lijst halen',
    'dl.pauzeren': 'Pauzeren',
    'dl.verder': 'Verder',
    'dl.inMap': 'Toon in map',
    'dl.openen': 'Openen',
    'dl.nietOpenen': 'Dit soort bestand openen we niet voor je; gebruik "toon in map"',
    'dl.gepauzeerd': 'Gepauzeerd',
    'dl.gestopt': 'Gestopt',
    'dl.mislukt': 'Mislukt',
    'dl.vanTotaal': '{gedaan} van {totaal}',

    /* ── Geschiedenis en commandobalk ─────────────────────────────── */
    'cmd.plek': 'Ga naar, zoek, of spring naar een tabblad',
    'cmd.label': 'Commandobalk',
    'cmd.gaNaar': 'Ga naar',
    'cmd.zoeken': 'Zoeken',
    'cmd.tabblad': 'Tabblad',
    'cmd.workspace': 'Workspace',
    'cmd.openen': 'Openen',
    'cmd.instellingen': 'Instellingen',
    'cmd.nieuwVenster': 'Nieuw venster',
    'cmd.favoriet': '{host} bij favorieten',
    'cmd.toevoegen': 'Toevoegen',

    'gesch.plek': 'Zoek in je geschiedenis',
    'gesch.niets': 'Nog niets bezocht',
    'gesch.nietsGevonden': 'Niets gevonden',
    'gesch.wissen': 'Geschiedenis wissen',
    'gesch.alles': 'Alles',
    'gesch.nogEens': 'Nog een keer: alles weg',
    'gesch.zekerWeten': 'Zeker weten',
    'gesch.vergeet': 'Deze pagina vergeten',
    'gesch.gisteren': 'Gisteren',

    /* ── Workspaces ───────────────────────────────────────────────── */
    'ws.kop': 'Workspaces',
    'ws.nieuw': 'Nieuwe workspace',
    'ws.veeg': 'Of veeg met de linkermuisknop naar links of rechts.',
    'ws.achtergrond': 'Achtergrond van',
    'ws.palet': 'Palet',
    'ws.beweging': 'Beweging',
    'ws.wegleggen': 'Deze workspace wegleggen',
    'ws.prive': 'Privéworkspace',
    'ws.priveUitleg': 'Wat je in een privéworkspace doet blijft niet op deze computer staan. '
      + 'Je werkgever, je provider en de site zelf zien het nog wel.',
    'ws.weggelegd': 'Weggelegd',
    'ws.naamWijzigen': 'Naam wijzigen',
    'ws.sluiten': 'Workspace sluiten',
    'ws.nogEens': 'Nog een keer: {aantal} dicht',
    'ws.klikNogEens': 'Klik nog eens om te sluiten',
    'ws.eenTabblad': '1 tabblad',
    'ws.tabbladen': '{aantal} tabbladen',
    'ws.terughalen': 'Terughalen',
    'ws.terughalenTitel': '{naam} terughalen, {tabs}',
    'ws.weggooien': 'Weggooien',
    'ws.weggooienTitel': '{naam} weggooien',
    'ws.weggooienNogEens': 'Nog een keer klikken: dan is hij weg',
    'ws.sessieWeg': 'Deze sessie weggooien',
    'ws.sessieOnder': '{aantal} · {hosts}',

    /* ── De vraag van een client ──────────────────────────────────── */
    'vraag.nee': 'Niet doen',
    'vraag.ja': 'Eén keer toestaan',
    'vraag.klok': 'Vervalt over {seconden} seconden.',

    /* ── Instellingen ─────────────────────────────────────────────── */
    'inst.kop': 'Instellingen',
    'inst.uiterlijk': 'Uiterlijk',
    'inst.taal': 'Taal',
    'inst.taalSysteem': 'Volg het systeem',
    'inst.taalNl': 'Nederlands',
    'inst.taalEn': 'Engels',
    'inst.taalUitleg': 'Geldt voor de browser zelf. Websites en Tougather kiezen hun eigen taal.',
    'inst.thema': 'Thema',
    'inst.themaSysteem': 'Volg het systeem',
    'inst.themaLicht': 'Licht',
    'inst.themaDonker': 'Donker',
    'inst.mesh': 'Bewegende achtergrond',
    'inst.sneltoetsenTonen': 'Sneltoetsen tonen in de zijbalk',
    'inst.appStijl': 'Tougather meekleuren met de browser',
    'inst.appStijlUitleg': 'Overschrijft alleen de kleuren en rondingen van de app, niet zijn opbouw. '
      + 'Uit laat hem er precies zo uitzien als op het web.',

    'inst.zoeken': 'Zoeken',
    'inst.zoekmachine': 'Zoekmachine',
    'inst.zoekmachineUitleg': 'Geldt voor de commandobalk en het zoekveld op een nieuw tabblad.',

    'inst.starten': 'Starten',
    'inst.bijOpenen': 'Bij het openen',
    'inst.startLeeg': 'Een leeg tabblad',
    'inst.startVorige': 'Waar ik gebleven was',
    'inst.startUitleg': 'Je workspaces en tabbladen komen terug. Privéworkspaces niet: '
      + 'die laten met opzet niets achter.',

    'inst.account': 'Account',
    'inst.aanmelden': 'Aanmelden',
    'inst.aanmeldenTitel': 'Aanmelden of een account maken',
    'inst.aangemeld': 'Aangemeld',
    'inst.aangemeldAls': 'Aangemeld als {wie}',
    'inst.nietBevestigd': 'Je account bestaat, maar het adres is nog niet bevestigd',
    'inst.accountOpenen': 'Account openen',
    'inst.accountUitleg': 'Aanmelden met Google gebeurt in een gewoon tabblad. Daardoor sta je '
      + 'daarna ook in deze browser bij Google ingelogd. Wat daarvoor in Supabase aan moet staat '
      + 'in docs/ACCOUNTS.md.',
    'inst.accountGeen': 'Je werkt op dit apparaat. Dat blijft werken; een account voegt toe dat je '
      + 'erbij kunt vanaf een andere machine.',
    'inst.accountWacht': 'Je account ({wie}) bestaat, maar het adres is nog niet bevestigd. '
      + 'Je werk loopt al mee.',
    'inst.accountAan': 'Aangemeld als {wie}. Je werk staat in je Tougather-account en is ook op een '
      + 'andere machine te openen.',

    'inst.assistenten': 'Assistenten',
    'inst.naam': 'Naam',
    'inst.naamUitleg': 'Zo heet hij in de zijbalk en in de balk bovenin.',
    'inst.denktMet': 'Denkt met',
    'inst.bronAuto': 'De agent, anders mijn sleutel',
    'inst.bronAgent': 'Alleen de agent',
    'inst.bronApi': 'Alleen mijn API-sleutel',
    'inst.sleutel': 'API-sleutel',
    'inst.bewaren': 'Bewaren',
    'inst.weghalen': 'Weghalen',
    'inst.model': 'Model',
    'inst.modelUitleg': 'Alleen voor de API-sleutel. Leeg betekent claude-sonnet-5. '
      + 'De agent op deze computer kiest zijn model zelf.',
    'inst.bronUitleg': '"De agent" is Claude Code op deze computer, op jouw abonnement. Een sleutel '
      + 'is de tweede weg: die aanroep gaat van hier rechtstreeks naar de API. Geen van beide komt '
      + 'langs onze server.',
    'inst.agentGeen': 'Er staat nog geen agent op deze computer. Installeer Claude Code, dan werkt '
      + 'het meteen; er valt verder niets in te stellen. Of zet hieronder je eigen API-sleutel.',
    'inst.agentNietAan': '{agent} staat er, maar is nog niet aangemeld. Voer eenmalig '
      + '"claude auth login" uit in een terminal; daarna werkt het.',
    'inst.agentGoed': '{naam} denkt met {agent}, op jouw abonnement en op deze computer. '
      + 'Er gaat niets langs onze server.',
    'inst.sleutelGeen': 'Er staat geen sleutel. Met een sleutel gaat de aanroep van deze computer '
      + 'rechtstreeks naar de API — niet langs onze server, en er zit geen sleutel van ons in de '
      + 'download.',
    'inst.sleutelStaat': 'Bewaard, eindigt op {staart}',
    'inst.sleutelVeilig': 'versleuteld met de sleutelbos van je systeem',
    'inst.sleutelPlat': 'in platte tekst, want dit systeem heeft geen sleutelbos die Electron kan gebruiken',
    'inst.sleutelBewaard': 'Bewaard, {waar}.',
    'inst.sleutelInGebruik': 'Hij wordt nu gebruikt.',
    'inst.sleutelAgentVoor': 'De agent op deze computer gaat voor.',

    'inst.sneltoetsen': 'Sneltoetsen',

    'inst.mcp': 'Verbinding met een AI-client',
    'inst.mcpUitleg': 'Hiermee kan een client als Claude Desktop of Claude Code deze browser '
      + 'bedienen via het Model Context Protocol, met jouw abonnement en dus zonder kosten per '
      + 'opdracht.',
    'inst.mcpAan': 'Verbinding openzetten',
    'inst.mcpStatus': 'Status',
    'inst.mcpDicht': 'Dicht',
    'inst.mcpOpen': 'Open op poort {poort}',
    'inst.mcpWerkruimte': 'De client krijgt een eigen, lege workspace. Die heeft geen koekjes en '
      + 'geen logins, en verdwijnt zodra je de verbinding sluit. Hij kan pagina’s openen, lezen '
      + 'en sluiten — verder niets. Klikken, typen, formulieren versturen en downloaden kan hij '
      + 'niet, en bij jouw eigen workspaces komt hij niet.',
    'inst.mcpConfig': 'Zet dit in het configuratiebestand van je client:',
    'inst.mcpKopieer': 'Kopieer',
    'inst.mcpGekopieerd': 'Gekopieerd',
    'inst.mcpSleutelUitleg': 'De sleutel staat er met opzet niet in. Die maakt de browser elke keer '
      + 'opnieuw aan en zet hem in een apart bestand, dat verdwijnt zodra je de verbinding sluit. '
      + 'Een oude configuratie kan dus nooit een deur openen die jij hebt dichtgedaan.',
    'inst.mcpWatDoet': 'Wat de client doet',
    'inst.mcpNoodstop': 'Noodstop',
    'inst.mcpLeeg': 'Nog niets gedaan.',

    /* ── Het eerste begin ─────────────────────────────────────────── */
    'welkom.kop': 'Welkom bij Tougather',
    'welkom.regel': 'Kies eerst de taal van de browser. Later te wijzigen bij Instellingen.',
    'welkom.ga': 'Aan de slag',
  },

  en: {
    'balk.assistent': 'Assistant',
    'balk.rust': 'Ready when you are',
    'balk.apps': 'Apps',
    'balk.opdracht': 'Give it a job',
    'balk.vraag': 'Ask about this page',
    'balk.door': 'Go ahead',
    'balk.stop': 'Stop',
    'balk.nietNu': 'Not now',

    'paneel.geluid': 'Sound',
    'paneel.geluidUitleg': 'Everything making noise in your tabs, including workspaces you are not in.',
    'paneel.notitie': 'Note',
    'paneel.notitiePlek': 'A thought, an address, something for later. Saves itself.',
    'paneel.notitieBewaard': 'saved',
    'paneel.apps': 'Apps',
    'paneel.appsHier': 'In this browser',
    'paneel.stil': 'Nothing is playing.',
    'paneel.demp': 'Mute this tab',
    'paneel.hoorbaar': 'Unmute this tab',
    'paneel.naarTab': 'Go to this tab in {ws}',
    'paneel.bron': '1 source',
    'paneel.bronnen': '{aantal} sources',
    'paneel.notitieBezig': 'saving…',
    'paneel.eenSpeelt': ', 1 tab playing',
    'paneel.spelen': ', {aantal} tabs playing',
    'paneel.gedempt': ', muted',

    'zij.sluiten': 'Close',
    'zij.minimaliseren': 'Minimise',
    'zij.maximaliseren': 'Maximise',
    'zij.verbergen': 'Hide sidebar',
    'zij.tonen': 'Show sidebar',
    'zij.terug': 'Back',
    'zij.vooruit': 'Forward',
    'zij.herladen': 'Reload',
    'zij.instellingen': 'Settings',
    'zij.tougatherOpenen': 'Open Tougather',
    'zij.adres': 'Search or enter an address',
    'zij.tabbladen': 'Tabs',
    'zij.nieuwTabblad': 'New tab',
    'zij.tabbladSluiten': 'Close tab',
    'zij.naastElkaar': 'Put beside the current tab',
    'zij.nietNaastElkaar': 'Stop showing side by side',
    'zij.werktIn': '{naam} is working in this tab',

    'zoek.plek': 'Find on this page',
    'zoek.vorige': 'Previous (Shift Enter)',
    'zoek.vorigeKort': 'Previous match',
    'zoek.volgende': 'Next (Enter)',
    'zoek.volgendeKort': 'Next match',
    'zoek.sluiten': 'Close (Esc)',
    'zoek.sluitenKort': 'Close find',
    'zoek.geen': 'none',

    'dl.kop': 'Downloads',
    'dl.wissen': 'Clear list',
    'dl.uitLijst': 'Remove from list',
    'dl.pauzeren': 'Pause',
    'dl.verder': 'Resume',
    'dl.inMap': 'Show in folder',
    'dl.openen': 'Open',
    'dl.nietOpenen': 'We do not open this kind of file for you; use “show in folder”',
    'dl.gepauzeerd': 'Paused',
    'dl.gestopt': 'Cancelled',
    'dl.mislukt': 'Failed',
    'dl.vanTotaal': '{gedaan} of {totaal}',

    'cmd.plek': 'Go to, search, or jump to a tab',
    'cmd.label': 'Command bar',
    'cmd.gaNaar': 'Go to',
    'cmd.zoeken': 'Search',
    'cmd.tabblad': 'Tab',
    'cmd.workspace': 'Workspace',
    'cmd.openen': 'Open',
    'cmd.instellingen': 'Settings',
    'cmd.nieuwVenster': 'New window',
    'cmd.favoriet': 'Bookmark {host}',
    'cmd.toevoegen': 'Add',

    'gesch.plek': 'Search your history',
    'gesch.niets': 'Nothing visited yet',
    'gesch.nietsGevonden': 'Nothing found',
    'gesch.wissen': 'Clear history',
    'gesch.alles': 'All of it',
    'gesch.nogEens': 'Once more: everything goes',
    'gesch.zekerWeten': 'Are you sure',
    'gesch.vergeet': 'Forget this page',
    'gesch.gisteren': 'Yesterday',

    'ws.kop': 'Workspaces',
    'ws.nieuw': 'New workspace',
    'ws.veeg': 'Or swipe left or right with the left mouse button.',
    'ws.achtergrond': 'Background of',
    'ws.palet': 'Palette',
    'ws.beweging': 'Motion',
    'ws.wegleggen': 'Put this workspace away',
    'ws.prive': 'Private workspace',
    'ws.priveUitleg': 'What you do in a private workspace is not kept on this computer. '
      + 'Your employer, your provider and the site itself still see it.',
    'ws.weggelegd': 'Put away',
    'ws.naamWijzigen': 'Rename',
    'ws.sluiten': 'Close workspace',
    'ws.nogEens': 'Once more: closes {aantal}',
    'ws.klikNogEens': 'Click again to close',
    'ws.eenTabblad': '1 tab',
    'ws.tabbladen': '{aantal} tabs',
    'ws.terughalen': 'Bring back',
    'ws.terughalenTitel': 'Bring {naam} back, {tabs}',
    'ws.weggooien': 'Throw away',
    'ws.weggooienTitel': 'Throw {naam} away',
    'ws.weggooienNogEens': 'Click once more and it is gone',
    'ws.sessieWeg': 'Throw this session away',
    'ws.sessieOnder': '{aantal} · {hosts}',

    'vraag.nee': 'Do not',
    'vraag.ja': 'Allow once',
    'vraag.klok': 'Expires in {seconden} seconds.',

    'inst.kop': 'Settings',
    'inst.uiterlijk': 'Appearance',
    'inst.taal': 'Language',
    'inst.taalSysteem': 'Follow the system',
    'inst.taalNl': 'Dutch',
    'inst.taalEn': 'English',
    'inst.taalUitleg': 'Applies to the browser itself. Websites and Tougather pick their own language.',
    'inst.thema': 'Theme',
    'inst.themaSysteem': 'Follow the system',
    'inst.themaLicht': 'Light',
    'inst.themaDonker': 'Dark',
    'inst.mesh': 'Moving background',
    'inst.sneltoetsenTonen': 'Show shortcuts in the sidebar',
    'inst.appStijl': 'Let Tougather take the browser’s colours',
    'inst.appStijlUitleg': 'Only overrides the app’s colours and corners, not how it is built. '
      + 'Off makes it look exactly as it does on the web.',

    'inst.zoeken': 'Search',
    'inst.zoekmachine': 'Search engine',
    'inst.zoekmachineUitleg': 'Applies to the command bar and the search field on a new tab.',

    'inst.starten': 'Starting up',
    'inst.bijOpenen': 'When it opens',
    'inst.startLeeg': 'An empty tab',
    'inst.startVorige': 'Where I left off',
    'inst.startUitleg': 'Your workspaces and tabs come back. Private workspaces do not: '
      + 'they deliberately leave nothing behind.',

    'inst.account': 'Account',
    'inst.aanmelden': 'Sign in',
    'inst.aanmeldenTitel': 'Sign in or create an account',
    'inst.aangemeld': 'Signed in',
    'inst.aangemeldAls': 'Signed in as {wie}',
    'inst.nietBevestigd': 'Your account exists, but the address is not confirmed yet',
    'inst.accountOpenen': 'Open account',
    'inst.accountUitleg': 'Signing in with Google happens in an ordinary tab. That also leaves you '
      + 'signed in to Google in this browser. What has to be switched on in Supabase is in '
      + 'docs/ACCOUNTS.md.',
    'inst.accountGeen': 'You are working on this device. That keeps working; an account adds being '
      + 'able to reach it from another machine.',
    'inst.accountWacht': 'Your account ({wie}) exists, but the address is not confirmed yet. '
      + 'Your work is already being kept.',
    'inst.accountAan': 'Signed in as {wie}. Your work is in your Tougather account and can be '
      + 'opened on another machine too.',

    'inst.assistenten': 'Assistants',
    'inst.naam': 'Name',
    'inst.naamUitleg': 'That is what it is called in the sidebar and in the bar at the top.',
    'inst.denktMet': 'Thinks with',
    'inst.bronAuto': 'The agent, otherwise my key',
    'inst.bronAgent': 'Only the agent',
    'inst.bronApi': 'Only my API key',
    'inst.sleutel': 'API key',
    'inst.bewaren': 'Save',
    'inst.weghalen': 'Remove',
    'inst.model': 'Model',
    'inst.modelUitleg': 'Only for the API key. Empty means claude-sonnet-5. The agent on this '
      + 'computer picks its own model.',
    'inst.bronUitleg': '“The agent” is Claude Code on this computer, on your own plan. A key is the '
      + 'second route: that call goes from here straight to the API. Neither passes a server of ours.',
    'inst.agentGeen': 'There is no agent on this computer yet. Install Claude Code and it works '
      + 'straight away; there is nothing else to set. Or put your own API key below.',
    'inst.agentNietAan': '{agent} is there, but not signed in yet. Run "claude auth login" once in '
      + 'a terminal and it works.',
    'inst.agentGoed': '{naam} thinks with {agent}, on your own plan and on this computer. '
      + 'Nothing passes a server of ours.',
    'inst.sleutelGeen': 'There is no key. With one, the call goes from this computer straight to '
      + 'the API — not past a server of ours, and there is no key of ours in the download.',
    'inst.sleutelStaat': 'Saved, ends in {staart}',
    'inst.sleutelVeilig': 'encrypted with your system’s keychain',
    'inst.sleutelPlat': 'in plain text, because this system has no keychain Electron can use',
    'inst.sleutelBewaard': 'Saved, {waar}.',
    'inst.sleutelInGebruik': 'It is being used now.',
    'inst.sleutelAgentVoor': 'The agent on this computer comes first.',

    'inst.sneltoetsen': 'Keyboard shortcuts',

    'inst.mcp': 'Connection to an AI client',
    'inst.mcpUitleg': 'This lets a client like Claude Desktop or Claude Code drive this browser '
      + 'over the Model Context Protocol, on your own plan and so without a cost per job.',
    'inst.mcpAan': 'Open the connection',
    'inst.mcpStatus': 'Status',
    'inst.mcpDicht': 'Closed',
    'inst.mcpOpen': 'Open on port {poort}',
    'inst.mcpWerkruimte': 'The client gets its own empty workspace. It has no cookies and no '
      + 'logins, and it disappears the moment you close the connection. It can open, read and '
      + 'close pages — nothing else. It cannot click, type, submit forms or download, and it '
      + 'cannot reach your own workspaces.',
    'inst.mcpConfig': 'Put this in your client’s configuration file:',
    'inst.mcpKopieer': 'Copy',
    'inst.mcpGekopieerd': 'Copied',
    'inst.mcpSleutelUitleg': 'The key is deliberately not in it. The browser makes a new one every '
      + 'time and puts it in a separate file, which disappears when you close the connection. So '
      + 'an old configuration can never open a door you have shut.',
    'inst.mcpWatDoet': 'What the client is doing',
    'inst.mcpNoodstop': 'Emergency stop',
    'inst.mcpLeeg': 'Nothing done yet.',

    'welkom.kop': 'Welcome to Tougather',
    'welkom.regel': 'First, pick the browser’s language. You can change it later in Settings.',
    'welkom.ga': 'Get started',
  },
};

/** De taal die nu geldt. Nederlands tot iemand iets anders zegt. */
let huidig = 'nl';

/**
 * Eén zin.
 *
 * Een onbekende sleutel geeft de sleutel terug en niet een lege string: een
 * knop zonder tekst valt niet op, een knop met "inst.bewaren" erop wel.
 */
function t(sleutel, vars) {
  const zin = (WOORDEN[huidig] && WOORDEN[huidig][sleutel])
    ?? WOORDEN.nl[sleutel]
    ?? sleutel;
  if (!vars) return zin;
  return zin.replace(/\{(\w+)\}/g, (heel, naam) => (naam in vars ? String(vars[naam]) : heel));
}

/** Welke van onze talen hoort bij deze systeemtaal? */
function kiesTaal(code) {
  const kort = String(code || '').slice(0, 2).toLowerCase();
  return TALEN.includes(kort) ? kort : 'en';
}

/**
 * Alle statische tekst onder `wortel` opnieuw invullen.
 *
 * Wordt bij elke taalwissel over het hele document gehaald. Dat is goedkoop —
 * het zijn honderd knopen — en het scheelt een boekhouding van wat er al
 * vertaald was.
 */
function pasTaalToe(wortel = document) {
  for (const el of wortel.querySelectorAll('[data-t]')) {
    el.textContent = t(el.dataset.t);
  }
  for (const el of wortel.querySelectorAll('[data-t-titel]')) {
    el.title = t(el.dataset.tTitel);
  }
  for (const el of wortel.querySelectorAll('[data-t-aria]')) {
    el.setAttribute('aria-label', t(el.dataset.tAria));
  }
  for (const el of wortel.querySelectorAll('[data-t-plek]')) {
    el.placeholder = t(el.dataset.tPlek);
  }
}

/** De taal omzetten en alles opnieuw tekenen. Geeft terug of er iets veranderde. */
function zetTaal(code) {
  const nieuw = TALEN.includes(code) ? code : kiesTaal(code);
  const anders = nieuw !== huidig;
  huidig = nieuw;
  if (typeof document !== 'undefined') {
    document.documentElement.lang = nieuw;
    pasTaalToe();
  }
  return anders;
}

const taalNu = () => huidig;

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { WOORDEN, TALEN, t, zetTaal, kiesTaal, pasTaalToe, taalNu };
}
