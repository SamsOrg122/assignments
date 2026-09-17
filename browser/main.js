const { app, BrowserWindow, WebContentsView, ipcMain, Menu, nativeTheme, protocol, session } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
// Gedeeld met de renderer, zodat de adresbalk en de nieuw-tabblad-pagina
// dezelfde regel hanteren. Zie het bestand voor waarom het daar staat.
const { naarZoekURL, STANDAARD_ZOEKMACHINE } = require('./renderer/search.js');
const { beoordeelURL, grendelSessie, grendelNavigatie } = require('./lib/grendel.js');
const { brugVoor } = require('./lib/gids/brug.js');
const voorkeuren = require('./lib/voorkeuren.js');
const { volgDeBrowser } = require('./lib/app-stijl.js');
const { meldSchemaAan, bedienApp, appURL } = require('./lib/app-schema.js');
const { McpDeur, GEREEDSCHAP, NOOIT_TYPEN, NOOIT_VELDSOORT, NOOIT_AANVULLING, beschrijf } = require('./lib/mcp.js');
const { zoekAgent, vraagAanmelding, Opdracht, HOUDING, GIDS_HOUDING, GIDS_GEREEDSCHAP, NIET_AANGEMELD } = require('./lib/agent.js');
const { Toestemming } = require('./lib/toestemming.js');
const { downloads } = require('./lib/downloads.js');
const { geschiedenis } = require('./lib/geschiedenis.js');
const { ApiOpdracht, STANDAARD_MODEL } = require('./lib/api.js');
const sleutel = require('./lib/sleutel.js');
const { hangMenu } = require('./lib/menu.js');
const sessies = require('./lib/sessies.js');
const herstel = require('./lib/herstel.js');
const { isAanmeldStart, isTerugkomst, isGeweigerd, foutIn, Aanmelding, useragentVoor } = require('./lib/inloggen.js');
const { beoordeel } = require('./lib/gebaar.js');

const SIDEBAR_WIDTH = 272;
// De pagina zweeft in de mesh: marge rondom en afgeronde hoeken, zodat de
// achtergrond overal langs de rand zichtbaar blijft. Er is geen plafond meer;
// de vensterknoppen staan als stippen linksboven in de zijbalk.
const CONTENT_GAP = 10;
const CONTENT_RADIUS = 18;

// De bovenbalk. Hij staat boven het paginagebied en niet boven het hele venster:
// links houdt de zijbalk zijn eigen kop met de vensterknoppen.
const BALK_HOOGTE = 34;

// Wat elk paneel aan hoogte vraagt. Vaste maten, want de renderer moet dezelfde
// getallen kennen om zijn vlak te tekenen, en twee plekken die elkaar moeten
// raden gaan een keer uit elkaar lopen.
// De apps in de bovenbalk, op één plek. De renderer tekent deze rij en het
// hoofdproces maakt de ruimte vrij, dus beide kennen dezelfde hoogtes; twee
// lijsten die elkaar moeten raden lopen een keer uit elkaar.
const BALK_APPS = [
  { id: 'geluid', naam: 'Geluid', hoogte: 200 },
  { id: 'notitie', naam: 'Notitie', hoogte: 260 },
  { id: 'apps', naam: 'Apps', hoogte: 208 },
];

const PANEEL_HOOGTES = Object.fromEntries(BALK_APPS.map((a) => [a.id, a.hoogte]));

// Een nieuw tabblad begint op een eigen pagina, niet bij een zoekmachine.
const NEWTAB = pathToFileURL(path.join(__dirname, 'renderer', 'newtab.html')).href;

// De brug wordt gestart door een programma buiten ons: de agent, of Claude
// Desktop. In een geïnstalleerde versie staat alles in app.asar, en daar kan een
// ander proces geen ES-module uit laden. Daarom pakt het bouwen mcp/ uit
// (asarUnpack in package.json), en wijzen we hier naar die uitgepakte kopie.
// Tijdens het ontwikkelen staat er geen app.asar in het pad en verandert er niets.
const BRUG = path.join(__dirname, 'mcp', 'tougather-mcp.mjs')
  .replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`);

// De werkbank: de Tougather-app zelf, als vast oppervlak in de browser. Een
// eigen sessie, los van de workspaces, want je bent er met één account
// ingelogd en dat hoort niet aan een tabbladgroep te hangen. In Electron leeft
// die opslag op schijf onder userData en wordt hij niet geruimd zoals een
// browser dat onder druk met best-effort opslag doet.
// De app komt van schijf, uit de statische export in app/. Alleen /api gaat
// nog het net op; zie lib/app-schema.js.
const WERKBANK_URL = appURL('');
const WERKBANK_PARTITIE = 'persist:werkbank';

// De plekken die de app zelf in zijn zijbalk zet, met zijn eigen woorden uit
// src/lib/i18n/dictionary.ts. Overnemen en niet verzinnen: als de app een rij
// hernoemt hoort de browser hetzelfde te zeggen, anders heb je twee namen voor
// één kamer.
const WERKBANK_PLEKKEN = [
  { pad: '/library', naam: 'Work', icoon: 'huis' },
  { pad: '/due', naam: 'Due', icoon: 'agenda' },
  { pad: '/chat', naam: 'Chat', icoon: 'mensen' },
  { pad: '/team', naam: 'People', icoon: 'groep' },
  { pad: '/more', naam: 'Everything', icoon: 'lijst' },
  { pad: '/settings', naam: 'Settings', icoon: 'tandwiel' },
];

// De app opent zijn eigen zijbalk alleen als het venster minstens zo breed is;
// zie AppShell.tsx, die zet hem bij het aankoppelen op basis van deze grens.
// Daaronder begint hij dichtgevouwen en hoeven wij niets te doen.
const APP_ZIJBALK_GRENS = 1024;
// Alles onder deze basis is van ons; daarbuiten is een file:-url geen eigen pagina.
const EIGEN_BASIS = pathToFileURL(path.join(__dirname, 'renderer')).href;

// Moet gebeuren voordat Electron klaar is; daarna weigert hij het schema.
meldSchemaAan();

// Waar weggelegde sessies terechtkomen. Naast de voorkeuren, in dezelfde map die
// een herinstallatie overleeft.
app.whenReady().then(() => {
  // Vóór de eerste sessie iets laadt. Zie lib/inloggen.js voor waarom het woord
  // Electron eruit moet: Google weigert er aanmeldingen van, en het beschrijft
  // deze browser ook niet.
  app.userAgentFallback = useragentVoor(app.userAgentFallback, app.getVersion(), app.getName());
  sessies.zetPad(app.getPath('userData'));
  herstel.zetPad(app.getPath('userData'));
});

// Komt uit de instellingen. Nog één keuze voor de hele app; per workspace kan
// later, maar dan moet toURL weten vanuit welk venster de vraag komt.
const zoekmachine = () => voorkeuren.alles().zoekmachine ?? STANDAARD_ZOEKMACHINE;

// Acrylic in plaats van mica: dat vervaagt wat er werkelijk achter het venster
// ligt, niet alleen het bureaublad, en leest daardoor als glas.
const VENSTERMATERIAAL = 'acrylic';

// Alleen de namen, niet de kleuren zelf: die staan als variabelen in
// renderer/tokens.css, waar volgens CLAUDE.md alle kleuren horen. Elke naam is
// een compleet palet van tien mesh-kleuren plus een accent, dus wisselen van
// workspace verkleurt de hele achtergrond.
// Elk met een naam, want in de kiezer moet er iets te lezen staan. De volgorde
// is de volgorde waarin nieuwe workspaces ze krijgen, en ook die van het rooster
// in de zijbalk.
const PALETTEN = [
  { id: 'home', naam: 'Ochtend' },
  { id: 'studio', naam: 'Studio' },
  { id: 'night', naam: 'Nacht' },
  { id: 'dune', naam: 'Duin' },
  { id: 'sea', naam: 'Zee' },
  { id: 'bos', naam: 'Bos' },
  { id: 'vuur', naam: 'Vuur' },
  { id: 'vorst', naam: 'Vorst' },
  { id: 'bloesem', naam: 'Bloesem' },
  { id: 'inkt', naam: 'Inkt' },
  { id: 'citrus', naam: 'Citrus' },
  { id: 'steen', naam: 'Steen' },
];

const PALET_IDS = PALETTEN.map((p) => p.id);

// Hoe hard de achtergrond beweegt. Per workspace, want de ene groep is om in te
// werken en de andere om in te lezen.
const BEWEGINGEN = ['stil', 'rustig', 'levendig'];

const isMac = process.platform === 'darwin';

// Alle open vensters, op het id van de webContents die de UI tekent. De
// IPC-handlers zoeken hier het venster op waar een bericht vandaan komt, zodat
// er geen globale "huidig venster" meer nodig is.
/** @type {Map<number, BrowserWindowController>} */
const windows = new Map();

// Geen native vensterknoppen: het ontwerp tekent ze zelf als stippen linksboven
// in de zijbalk, en die praten via win:* met dit proces.

// De naam van de assistent komt uit de instellingen; dit is de terugval.
const ASSISTENT = () => voorkeuren.alles().assistentNaam || 'Kim';

// Welke kleur hoort bij welke handeling. De kleuren staan in
// renderer/glyph.js: blauw debuggen, rood zoeken, geel lezen, groen
// analyseren, oranje als hij jou nodig heeft.
const AGENT_MODUS = {
  open_pagina: 'zoeken',
  lees_pagina: 'lezen',
  lees_jouw_pagina: 'lezen',
  lijst_paginas: 'debuggen',
  jouw_paginas: 'debuggen',
  sluit_pagina: 'debuggen',
  klik: 'analyseren',
  typ: 'analyseren',
};

// Eén regel in de balk is smal. Wat langer is wordt afgekapt op een spatie,
// want midden in een woord afbreken leest als een fout.
const kortRegel = (tekst, max = 78) => {
  const s = String(tekst ?? '').replace(/\s+/g, ' ').trim();
  if (s.length <= max) return s;
  const knip = s.slice(0, max);
  const spatie = knip.lastIndexOf(' ');
  return (spatie > 40 ? knip.slice(0, spatie) : knip) + '…';
};
// Sneltoetsen horen te werken waar je ook bent, en een pagina is een eigen
// webContents met eigen toetsafhandeling. Daarom hangt dit op élke webContents
// die het venster maakt — daarvoor deden Ctrl+T en Ctrl+W niets zodra je in een
// pagina had geklikt. preventDefault houdt ze weg bij de renderer, zodat niemand
// dezelfde toets twee keer afhandelt.
function bindSneltoetsen(wc, ctrl) {
  wc.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    const mod = input.control || input.meta;
    const toets = input.key.toLowerCase();

    // Escape haalt weg wat de gids aanwijst. Alleen als er iets staat: anders
    // zou deze browser elke Escape van elke pagina inpikken, en daar hangen op
    // sites dialogen en menu's aan.
    if (input.key === 'Escape' && !mod && !input.shift && ctrl && ctrl.gewezenTab !== null) {
      e.preventDefault();
      ctrl.wijsNietMeer();
      return;
    }

    // Zonder menubalk is dit de enige weg naar de DevTools.
    if (input.key === 'F12' || (mod && input.shift && toets === 'i')) {
      e.preventDefault();
      wc.toggleDevTools();
      return;
    }
    if (!mod || !ctrl) return;

    if (input.shift) {
      if (toets === 't') {
        e.preventDefault();
        ctrl.heropenTab();
      } else if (toets === 'o') {
        e.preventDefault();
        ctrl.wisselWerkbank();
      } else if (toets === 'j') {
        // Ctrl+J is hier al de balk bovenin. Downloads krijgen de toets
        // ernaast, en verder wijst de lijst zichzelf aan: hij klapt open zodra
        // er iets binnenkomt.
        e.preventDefault();
        ctrl.vraagZijbalk('downloads');
      } else if (toets === 'g') {
        // De gids: een vraag over de pagina waar je nu naar kijkt. Dezelfde
        // balk als een opdracht, met een andere vraag erin.
        e.preventDefault();
        ctrl.focusIsland('gids');
      }
      return;
    }

    const acties = {
      t: () => ctrl.createTab(),
      w: () => ctrl.closeTab(ctrl.activeId),
      l: () => ctrl.vraagZijbalk('adres'),
      k: () => ctrl.vraagZijbalk('palet'),
      // Ctrl+F opent het zoekveld in de zijbalk. Niet een strook over de
      // pagina: die pagina is een native laag en tekent over elke overlay
      // heen, en een tweede doorzichtige view voor één invoerveld is een
      // hoop machinerie voor iets dat in het chroom thuishoort. Deze browser
      // zet zijn tabbladen, zijn adres en zijn workspaces al in de zijbalk.
      f: () => ctrl.vraagZijbalk('zoek'),
      j: () => ctrl.focusIsland(),
      // Ctrl+H opent de commandobalk met de geschiedenis erin. Geen eigen
      // scherm: deze browser heeft één plek waar je typt, en die kan meer dan
      // een adres.
      h: () => ctrl.vraagZijbalk('geschiedenis'),
      r: () => ctrl.reload(),
      '=': () => ctrl.zoom(0.5),
      '+': () => ctrl.zoom(0.5),
      '-': () => ctrl.zoom(-0.5),
      0: () => ctrl.zoom(0, true),
    };

    if (acties[toets]) {
      e.preventDefault();
      acties[toets]();
      return;
    }

    // Ctrl+1 tot Ctrl+9 springt naar de zoveelste workspace.
    if (toets >= '1' && toets <= '9') {
      const ws = [...ctrl.workspaces.values()][Number(toets) - 1];
      if (ws) {
        e.preventDefault();
        ctrl.activateWorkspace(ws.id);
      }
    }
  });
}

/**
 * Eén venster met zijn eigen workspaces. Een workspace is een groep tabbladen
 * met een eigen sessie, dus eigen cookies en logins: je kunt in de ene ingelogd
 * zijn op je werkaccount en in de andere op je eigen, tegelijk.
 */
class BrowserWindowController {
  constructor() {
    /** @type {Map<number, {id: number, name: string, color: string, partition: string, tabs: Map<number, WebContentsView>, activeId: number|null}>} */
    this.workspaces = new Map();
    this.nextWorkspaceId = 1;
    // Tabblad-ids lopen per venster, niet per workspace. Zo botsen ze nooit in
    // de faviconcache van de renderer, die maar één sleutelruimte kent.
    this.nextId = 1;
    // Zolang de commandobalk open staat verbergen we de pagina; zie setPaletteOpen.
    this.paletteOpen = false;
    // De werkbank wordt pas gemaakt als je hem voor het eerst opent; een venster
    // dat je alleen om te browsen opent hoeft de app niet te laden.
    this.werkbank = null;
    this.werkbankOpen = false;
    this.werkbankPad = WERKBANK_PLEKKEN[0].pad;
    this.herstelGeprobeerd = false;
    // Waar je op deze pagina naar zoekt. Leeg betekent: er loopt niets.
    this.zoekTerm = '';
    // Op welk tabblad de gids iets aanwijst, of null. Er is er hoogstens één.
    this.gewezenTab = null;
    // Eén aanmelding tegelijk, en alleen uit het tabblad dat wij ervoor openden.
    // Of wij de MCP-deur zelf openden voor deze opdracht, en hem dus ook
    // weer dicht horen te doen.
    this.deurWasOpen = false;
    // Welke agent er op deze computer staat. Eén keer opzoeken bij het
    // starten, en opnieuw als je de instellingen opent: daar kijk je juist
    // nadat je er een hebt geïnstalleerd.
    this.agentGevonden = zoekAgent();
    // null zolang we het niet weten; dat is iets anders dan nee.
    this.agentAangemeld = null;
    this.vraagAanmelding();
    this.aanmelding = new Aanmelding();
    // Wie je bent volgens de app. Gelezen, niet ernaast bijgehouden.
    this.account = null;
    // Welk paneel onder de bovenbalk openstaat, of null.
    this.paneel = null;

    // Het tabblad dat naast het actieve staat, of null. Eén buur, niet meer:
    // drie kolommen in een venster van deze breedte levert drie stroken op waar
    // geen website op gerekend heeft.
    this.buurId = null;

    // De verbinding met een AI-client, en wat die heeft gedaan. Het logboek
    // blijft in het geheugen: het gaat over deze zitting, en het op schijf
    // zetten maakt van een hulpmiddel een dossier.
    this.mcpLog = [];
    this.mcp = new McpDeur({
      controller: () => this,
      meld: (regel) => this.mcpMeld(regel),
    });

    // De poort waar elke handeling langs moet die jouw kant raakt.
    this.toestemming = new Toestemming(() => this.toonVraag());
    this.appStijl = null;
    // De laatst gemeten maat van het paginagebied, als terugval; zie paginaBounds.
    this.laatsteMaat = null;
    this.appZijbalkGevouwen = false;
    // Wie hoort bij welk tabblad: null is van jou, een naam is van een assistent.
    /** @type {Map<number, string|null>} */
    this.owners = new Map();
    this.agent = null;
    this.islandSize = { width: 150, height: 78 };
    // Wat je net gesloten hebt, voor Ctrl+Shift+T. Begrensd, want dit houdt
    // alleen url en workspace vast en dat hoeft niet oneindig terug te lopen.
    this.gesloten = [];

    this.activeWorkspaceId = this.addWorkspace('Persoonlijk');

    const opties = {
      width: 1280,
      height: 840,
      minWidth: 720,
      minHeight: 460,
      // Ondoorzichtig: het glasontwerp tekent zijn eigen achtergrond met de mesh,
      // dus er is niets meer om doorheen te kijken. Een doorzichtig venster
      // zónder venstermateriaal gedraagt zich op Windows bovendien onvoorspelbaar.
      backgroundColor: '#efe9f3',
      titleBarStyle: 'hidden',
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
      },
    };

    // Op macOS blijven de echte stoplichten staan; die hóren daar. Op Windows
    // tekent de zijbalk ze zelf, dus daar geen native knoppen.
    if (isMac) opties.trafficLightPosition = { x: 18, y: 16 };

    this.win = new BrowserWindow(opties);

    // Het id vooraf vastleggen: in 'closed' is de webContents al weg.
    const hostId = this.win.webContents.id;
    windows.set(hostId, this);
    // Downloads zijn er één lijst voor het hele programma; elk venster kijkt
    // ernaar mee en meldt zich bij het sluiten weer af.
    const losDownloads = downloads.opVerandering((lijst) => this.send('downloads:staat', lijst));
    this.win.on('closed', () => { losDownloads(); windows.delete(hostId); });

    bindSneltoetsen(this.win.webContents, this);
    this.win.loadFile(path.join(__dirname, 'renderer', 'index.html'));

    // De balk is een eigen laag met een eigen preload: hij mag minder dan de
    // zijbalk. Doorzichtige achtergrond, want alleen de pil en zijn holle
    // hoekjes horen zichtbaar te zijn.
    this.island = new WebContentsView({
      webPreferences: {
        preload: path.join(__dirname, 'preload-island.js'),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    this.island.setBackgroundColor('#00000000');
    // Ook de balk stuurt IPC, dus ook zijn webContents moet naar dit venster
    // wijzen. Id vooraf vastleggen, want in 'closed' is hij al vernietigd.
    const islandId = this.island.webContents.id;
    windows.set(islandId, this);
    this.win.on('closed', () => windows.delete(islandId));

    bindSneltoetsen(this.island.webContents, this);
    this.island.webContents.loadFile(path.join(__dirname, 'renderer', 'island.html'));
    this.win.contentView.addChildView(this.island);
    this.layoutIsland();
    // 'resize' vuurt niet bij het herstellen uit de taakbalk, en zolang het
    // venster geminimaliseerd was heeft paginaBounds() niets gedaan. Dus meten
    // we ook opnieuw zodra het venster weer een maat heeft.
    const hermeet = () => {
      this.layoutActiveTab();
      this.layoutWerkbank();
      this.layoutIsland();
    };
    for (const gebeurtenis of ['resize', 'restore', 'show', 'maximize', 'unmaximize']) {
      this.win.on(gebeurtenis, hermeet);
    }

    // Niet 'once': ook na een herstart van de UI-renderer moet de zijbalk weer
    // gevuld raken, anders staat er een leeg venster met levende tabbladen.
    this.win.webContents.on('did-finish-load', () => {
      // Niet 'once': ook na een herstart van de UI-renderer moet de zijbalk weer
      // gevuld raken. Herstellen mag daarom maar één keer.
      if (this.tabs.size === 0 && !this.herstelGeprobeerd) {
        this.herstelGeprobeerd = true;
        if (!this.herstelVorigeSessie()) this.createTab(NEWTAB);
        return;
      }
      if (this.tabs.size === 0) this.createTab(NEWTAB);
      else this.pushState();
    });
  }

  // --- workspaces ------------------------------------------------------

  get workspace() {
    return this.workspaces.get(this.activeWorkspaceId);
  }

  // De rest van de klasse praat over "de tabbladen" en bedoelt altijd die van de
  // actieve workspace. Deze twee getters houden dat op één plek.
  get tabs() {
    return this.workspace.tabs;
  }

  get activeId() {
    return this.workspace.activeId;
  }

  *allViews() {
    for (const ws of this.workspaces.values()) yield* ws.tabs.values();
  }

  workspaceOf(tabId) {
    for (const ws of this.workspaces.values()) {
      if (ws.tabs.has(tabId)) return ws;
    }
    return null;
  }

  addWorkspace(name, opties = {}) {
    const { prive = false } = opties;
    const id = this.nextWorkspaceId++;

    // Een privéworkspace krijgt een partitie zónder 'persist:' ervoor. Dat ene
    // woord is het hele verschil: met is een map op schijf met koekjes,
    // wachtwoorden en caches die je morgen terugvindt; zonder leeft alles in
    // het geheugen en is het weg als de workspace dichtgaat.
    //
    // Wat dit níét is: onzichtbaar. Je werkgever, je provider en de site zelf
    // zien alles wat ze anders ook zien. Het scherm zegt dat er ook bij, want
    // een privémodus die meer belooft dan hij waarmaakt is erger dan geen.
    const partition = prive ? `prive-${id}-${Date.now()}` : `persist:ws-${id}`;

    // Grendelen vóórdat de workspace bestaat, dus zeker vóórdat er een tabblad
    // in kan laden: een sessie zonder permissiehandler keurt alles goed.
    downloads.bewaak(grendelSessie(partition));

    this.workspaces.set(id, {
      id,
      name: name || (prive ? 'Privé' : `Workspace ${id}`),
      colorIndex: (id - 1) % PALET_IDS.length,
      palet: prive ? 'prive' : PALET_IDS[(id - 1) % PALET_IDS.length],
      beweging: 'rustig',
      // Hier zit het hele punt: een eigen sessie per workspace.
      partition,
      prive,
      tabs: new Map(),
      activeId: null,
    });
    return id;
  }

  createWorkspace(name, opties = {}) {
    const id = this.addWorkspace(name, opties);
    this.activateWorkspace(id);
    return id;
  }

  activateWorkspace(id) {
    const ws = this.workspaces.get(id);
    if (!ws || id === this.activeWorkspaceId) return Promise.resolve();

    // De richting volgt de strip onderin: naar rechts in de lijst is naar
    // links wegschuiven, zoals bladeren.
    const orde = [...this.workspaces.keys()];
    const vanIndex = orde.indexOf(this.activeWorkspaceId);
    const naarIndex = orde.indexOf(id);
    const richting = naarIndex > vanIndex ? 1 : -1;

    // Niet via this.tabs: die getter wijst naar de actieve workspace, en bij het
    // sluiten van een workspace is dat er net eentje die niet meer bestaat.
    const oudeWs = this.workspaces.get(this.activeWorkspaceId);
    const vertrekker = oudeWs?.tabs.get(oudeWs.activeId) ?? null;

    this.buurId = null;
    this.activeWorkspaceId = id;
    if (ws.tabs.size === 0) {
      for (const view of this.allViews()) view.setVisible(false);
      this.createTab(NEWTAB);
      return Promise.resolve();
    }

    const doelId = ws.tabs.has(ws.activeId) ? ws.activeId : [...ws.tabs.keys()][0];
    const aankomer = ws.tabs.get(doelId);
    ws.activeId = doelId;

    return this.schuifWissel(vertrekker, aankomer, richting).then(() => {
      for (const view of this.allViews()) {
        if (view !== aankomer) view.setVisible(false);
      }
      this.pushState();
    });
  }

  /**
   * Schuift de ene laag eruit en de andere erin.
   *
   * Waarom zo en niet met een overgang in CSS: een tabblad is een native laag
   * van het besturingssysteem en daar werkt geen enkele stijlregel op. De enige
   * manier om die te laten bewegen is hem elk beeldje zelf verzetten. Dat kost
   * niets zolang het kort is, en het is wél echte beweging van het echte ding
   * in plaats van een plaatje ervan.
   */
  schuifWissel(vertrekker, aankomer, richting) {
    const bounds = this.paginaBounds();
    if (!bounds || !aankomer || vertrekker === aankomer) {
      if (aankomer) {
        if (bounds) aankomer.setBounds(bounds);
        aankomer.setVisible(true);
        this.raiseIsland();
      }
      return Promise.resolve();
    }

    const afstand = bounds.width + CONTENT_GAP;
    const duur = 260;
    const begin = Date.now();

    aankomer.setBounds({ ...bounds, x: bounds.x + afstand * richting });
    aankomer.setVisible(true);
    if (vertrekker) vertrekker.setVisible(true);
    this.raiseIsland();

    return new Promise((klaar) => {
      const stap = () => {
        if (this.win.isDestroyed()) return klaar();
        // Snel weg, zacht aankomen. Een lineaire schuif voelt als een dia die
        // wordt verschoven; dit voelt als bladeren.
        const t = Math.min(1, (Date.now() - begin) / duur);
        const e = 1 - Math.pow(1 - t, 3);
        const verzet = Math.round(afstand * (1 - e) * richting);

        aankomer.setBounds({ ...bounds, x: bounds.x + verzet });
        if (vertrekker) vertrekker.setBounds({ ...bounds, x: bounds.x + verzet - afstand * richting });

        if (t < 1) setTimeout(stap, 16);
        else {
          aankomer.setBounds(bounds);
          if (vertrekker) vertrekker.setBounds(bounds);
          klaar();
        }
      };
      stap();
    });
  }

  /**
   * Wist wat een privéworkspace in het geheugen had staan.
   *
   * De partitie draagt geen 'persist:', dus er stond al niets op schijf. Dit gaat
   * over wat er in dit proces nog rondhangt: caches, opslag, alles. Zonder dit
   * blijft dat tot het afsluiten in het geheugen zitten, en dat is precies de
   * periode waarin "ik heb het net gesloten" hoort te betekenen dat het weg is.
   */
  wisPriveSporen(ws) {
    if (!ws?.prive) return Promise.resolve();
    const ses = session.fromPartition(ws.partition);
    return Promise.all([
      ses.clearStorageData(),
      ses.clearCache(),
      ses.clearAuthCache(),
      ses.clearHostResolverCache(),
    ]).catch(() => {});
  }

  closeWorkspace(id) {
    // De laatste workspace blijft staan; een venster zonder workspace bestaat niet.
    if (this.workspaces.size <= 1) return;
    const ws = this.workspaces.get(id);
    if (!ws) return;

    for (const view of ws.tabs.values()) {
      this.win.contentView.removeChildView(view);
      view.webContents.close();
    }
    ws.tabs.clear();
    this.workspaces.delete(id);

    // Pas nu wissen: zolang er nog pagina's leven schrijven die er vrolijk in
    // terug. En ook de lijst voor Ctrl+Shift+T opschonen, want die verwijst naar
    // een workspace die niet meer bestaat — heropenen zou het adres dan in de
    // eerstvolgende workspace neerzetten, en die staat wél op schijf.
    this.gesloten = this.gesloten.filter((g) => g.wsId !== id);
    this.wisPriveSporen(ws);

    if (this.activeWorkspaceId === id) this.activateWorkspace([...this.workspaces.keys()][0]);
    else this.pushState();
  }

  renameWorkspace(id, name) {
    const ws = this.workspaces.get(id);
    if (!ws) return;
    const schoon = String(name ?? '').trim();
    if (schoon) ws.name = schoon.slice(0, 40);
    this.pushState();
  }

  // --- layout ----------------------------------------------------------

  // Waar de pagina begint. Met een ingeklapte zijbalk schuift hij naar links,
  // maar niet helemaal: er blijft ruimte voor de knop om hem terug te halen.
  get linkerrand() {
    return this.zijbalkWeg ? 46 : SIDEBAR_WIDTH;
  }

  // Geeft null zolang er niets te meten valt. Een geminimaliseerd venster meldt
  // een inhoudsmaat van nul bij nul; als we die doorzetten krijgt élk tabblad
  // nul bij nul, en dan is de pagina na het herstellen leeg tot de eerstvolgende
  // resize. Liever de vorige maat laten staan.
  paginaBounds() {
    if (this.win.isDestroyed() || this.win.isMinimized()) return null;
    let { width, height } = this.win.getContentBounds();

    // Een venster dat nog niet is uitgemeten meldt nul, en nul doorzetten zet
    // élke laag op nul. Erger: een laag die op dat moment wordt aangemaakt
    // blijft daar staan, want er komt geen resize meer die hem redt. De laatste
    // bruikbare maat is dan een veel betere gok dan niets doen.
    if (width <= 0 || height <= 0) {
      if (!this.laatsteMaat) return null;
      ({ width, height } = this.laatsteMaat);
    } else {
      this.laatsteMaat = { width, height };
    }
    // Rondom dezelfde gleuf, ook aan de kant van de zijbalk. Daardoor loopt de
    // mesh onder de pagina door in plaats van er hard tegenaan te stoppen, en
    // liggen zijbalk en pagina op één achtergrond in plaats van naast elkaar.
    const boven = BALK_HOOGTE + this.paneelHoogte;
    return {
      x: this.linkerrand + CONTENT_GAP,
      y: boven,
      width: Math.max(0, width - this.linkerrand - CONTENT_GAP * 2),
      height: Math.max(0, height - boven - CONTENT_GAP),
    };
  }

  // Élk tabblad krijgt zijn maat, ook een dat je niet ziet. Anders werkt een
  // assistent in een pagina van nul bij nul: responsieve sites tonen dan niets,
  // lui geladen inhoud komt nooit binnen, en alles wat hij eruit leest klopt niet.
  // Alleen de zichtbaarheid verschilt tussen voorgrond en achtergrond.
  /**
   * Het vlak van het actieve tabblad en dat van zijn buur.
   *
   * Zonder buur krijgt het actieve tabblad alles. Met buur wordt het vlak in
   * tweeën gedeeld, met dezelfde gleuf ertussen als eromheen — anders raken de
   * twee pagina's elkaar en lijkt het één rommelige pagina in plaats van twee.
   */
  helften() {
    const heel = this.paginaBounds();
    if (!heel) return null;
    if (!this.buurId || !this.tabs.has(this.buurId)) return { actief: heel, buur: null };

    const breedte = Math.floor((heel.width - CONTENT_GAP) / 2);
    return {
      actief: { ...heel, width: breedte },
      buur: { ...heel, x: heel.x + breedte + CONTENT_GAP, width: heel.width - breedte - CONTENT_GAP },
    };
  }

  layoutAlleTabs() {
    const vlak = this.helften();
    if (!vlak) return;
    for (const [id, view] of this.alleTabsMetId()) {
      // Élk tabblad krijgt een maat, ook een dat je niet ziet; zie de opmerking
      // bij createTab. Een buur krijgt zijn eigen helft, de rest die van het
      // actieve tabblad.
      view.setBounds(id === this.buurId && vlak.buur ? vlak.buur : vlak.actief);
    }
  }

  * alleTabsMetId() {
    for (const ws of this.workspaces.values()) {
      for (const paar of ws.tabs) yield paar;
    }
  }

  /**
   * Zet een tabblad naast het actieve, of haalt het daar weg.
   *
   * Hetzelfde tabblad nog eens betekent de splitsing opheffen, zodat de knop een
   * schakelaar is en niet een handeling met een aparte tegenhanger.
   */
  zetBuur(id) {
    const doel = id == null ? null : Number(id);
    if (doel != null && !this.tabs.has(doel)) return;
    if (doel === this.activeId) return;

    this.buurId = doel === this.buurId ? null : doel;

    // De buur moet zichtbaar zijn, anders staat er een lege helft.
    const buur = this.buurId ? this.tabs.get(this.buurId) : null;
    for (const [tabId, view] of this.alleTabsMetId()) {
      const hoort = tabId === this.activeId || tabId === this.buurId;
      view.setVisible(hoort && !this.paletteOpen && !this.werkbankOpen
        && !this.toestemming.stand().open);
    }
    if (buur) this.raiseIsland();

    this.layoutAlleTabs();
    this.pushState();
  }

  layoutActiveTab() {
    this.layoutAlleTabs();
  }

  setZijbalkWeg(weg) {
    this.zijbalkWeg = Boolean(weg);
    this.layoutActiveTab();
    this.layoutIsland();
  }

  layoutIsland() {
    if (!this.island) return;
    if (this.win.isDestroyed() || this.win.isMinimized()) return;
    const { width } = this.win.getContentBounds();
    if (width <= 0) return;
    const links = this.linkerrand;

    // In rust meldt de balk maat nul. Dan krijgt hij ook werkelijk nul pixels:
    // een WebContentsView vangt klikken in zijn hele rechthoek, ook waar hij
    // doorzichtig is, en View kent geen setIgnoreMouseEvents. Elke pixel die
    // hier overhangt is dode ruimte midden bovenaan elke website.
    if (this.islandSize.height <= 0 || this.islandSize.width <= 0) {
      this.island.setBounds({ x: links, y: 0, width: 0, height: 0 });
      return;
    }

    const beschikbaar = Math.max(120, width - links - CONTENT_GAP * 2 - 24);
    const w = Math.min(this.islandSize.width, beschikbaar);
    // Gecentreerd boven het paginagebied, niet boven het hele venster: met een
    // zijbalk links zou dat scheef staan.
    const x = Math.round(links + CONTENT_GAP + (width - links - CONTENT_GAP * 2 - w) / 2);
    this.island.setBounds({ x, y: BALK_HOOGTE + this.paneelHoogte, width: w, height: this.islandSize.height });
  }

  setIslandSize(width, height) {
    const h = Math.round(height);
    this.islandSize = h <= 0
      ? { width: 0, height: 0 }
      : { width: Math.max(120, Math.round(width)), height: h };
    this.layoutIsland();
  }

  // Nieuwe tabbladen komen als kindview bovenop; de balk moet daar weer overheen.
  raiseIsland() {
    if (!this.island) return;
    this.win.contentView.removeChildView(this.island);
    this.win.contentView.addChildView(this.island);
  }

  sendIsland(stand) {
    if (this.win.isDestroyed()) return;
    this.island.webContents.send('island:state', stand);
    // Dezelfde stand naar de zijbalk: de bovenbalk toont hem daar ook, en twee
    // afzonderlijke waarheden over wat de assistent doet is er één te veel.
    this.laatsteAssistent = stand;
    this.send('balk:assistent', stand);
  }

  focusIsland(modus = 'opdracht') {
    this.island.webContents.focus();
    this.island.webContents.send('island:focus', modus);
  }

  // --- tabs ------------------------------------------------------------

  send(channel, payload) {
    if (!this.win.isDestroyed()) this.win.webContents.send(channel, payload);
  }

  describe(id) {
    const view = this.tabs.get(id);
    if (!view) return null;
    const wc = view.webContents;
    const url = wc.getURL();
    // De nieuwe-tabblad-pagina is een intern bestand; dat pad hoort niet in de
    // adresbalk. Voor de gebruiker is zo een tabblad gewoon leeg.
    const leeg = url === '' || url.startsWith(NEWTAB);
    return {
      id,
      leeg,
      owner: this.owners.get(id) ?? null,
      busy: this.agent?.tabId === id,
      // Waar hij mee bezig is, zodat het icoontje in de zijbalk dezelfde staat
      // toont als de balk bovenin.
      modus: this.agent?.tabId === id ? this.agent.modus ?? 'rust' : null,
      title: leeg ? 'Nieuw tabblad' : wc.getTitle() || 'Nieuw tabblad',
      url: leeg ? '' : url,
      loading: leeg ? false : wc.isLoading(),
      canGoBack: wc.navigationHistory.canGoBack(),
      canGoForward: wc.navigationHistory.canGoForward(),
    };
  }

  pushState() {
    // Bij elke verandering vastleggen waar je bent. Het schrijven zelf wordt
    // uitgesteld, dus dit kost niets; en het gebeurt niet alleen bij afsluiten,
    // want een browser die vastloopt heeft geen afsluitmoment.
    this.bewaarVoorHerstel();

    this.send('tabs:state', {
      tabs: [...this.tabs.keys()].map((id) => this.describe(id)).filter(Boolean),
      activeId: this.activeId,
      workspaces: [...this.workspaces.values()].map((ws) => ({
        id: ws.id,
        name: ws.name,
        colorIndex: ws.colorIndex,
        palet: ws.palet,
        prive: Boolean(ws.prive),
        beweging: ws.beweging ?? 'rustig',
        vanMcp: Boolean(ws.vanMcp),
        tabCount: ws.tabs.size,
      })),
      activeWorkspaceId: this.activeWorkspaceId,
      paneel: this.paneel,
      // Waar de gids iets aanwijst, of null. De zijbalk gebruikt het om te
      // kunnen zeggen dat Escape het weghaalt.
      gewezenTab: this.gewezenTab,
      balkApps: BALK_APPS,
      buurId: this.buurId,
      paletten: PALETTEN,
      bewegingen: BEWEGINGEN,
      sessies: sessies.alles(),
      toestemming: this.toestemming.stand(),
      mcp: {
        ...this.mcp.stand(),
        // Het pad naar de brug, zodat het scherm de configuratie kan tonen die
        // je in je client plakt.
        brug: BRUG,
        log: this.mcpLog.slice(-30),
      },
      geluid: this.geluidsbronnen(),
      paneelHoogte: this.paneelHoogte,
      balkHoogte: BALK_HOOGTE,
      werkbankOpen: this.werkbankOpen,
      werkbankPad: this.werkbankPad,
      werkbankPlekken: WERKBANK_PLEKKEN,
      account: this.account,
      assistent: {
        naam: ASSISTENT(),
        agent: this.agentGevonden?.naam ?? null,
        aangemeld: this.agentAangemeld,
        // Alleen of er een sleutel staat en welke vier tekens erop eindigen.
        // De sleutel zelf verlaat het hoofdproces niet; zie lib/sleutel.js.
        sleutel: sleutel.heeft(),
        rug: this.kiesRug().soort,
      },
    });
  }

  createTab(url = NEWTAB, ws = this.workspace, opties = {}) {
    const { owner = null, activeer = true } = opties;
    const id = this.nextId++;
    const view = new WebContentsView({
      webPreferences: {
        partition: ws.partition,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        // Het enige dat in elke pagina meeloopt: kijken of je veegt. Zie
        // renderer/tabblad-preload.js voor wat het níét doet.
        preload: path.join(__dirname, 'renderer', 'tabblad-preload.js'),
      },
    });

    const wc = view.webContents;
    view.setBorderRadius(CONTENT_RADIUS);

    // Links met target=_blank openen als nieuw tabblad in dezelfde workspace,
    // ook als de gebruiker inmiddels naar een andere is gewisseld. Een popup uit
    // het tabblad van een assistent blijft van die assistent en pakt jouw beeld
    // niet af.
    wc.setWindowOpenHandler(({ url: doel }) => {
      const soort = beoordeelURL(doel, EIGEN_BASIS);
      if (soort === 'web' || soort === 'intern') {
        this.createTab(doel, ws, { owner, activeer: !owner });
      } else {
        // shell.openExternal gaat naar de schema-afhandeling van het systeem, en
        // ms-msdt: is daar een bekende weg naar code-uitvoering. Tot er een
        // scherm is om dit te vragen: nooit. Zie ROUTEKAART.md stap 1.
        this.sendIsland({ modus: 'actie', regel: 'Link naar een ander programma geblokkeerd', bezig: false });
      }
      return { action: 'deny' };
    });

    // De terugkomst van een aanmelding. will-redirect hoort er los bij: de
    // laatste stap is een omleiding van de server en die komt niet langs
    // will-navigate.
    for (const gebeurtenis of ['will-navigate', 'will-redirect']) {
      wc.on(gebeurtenis, (e, doel) => {
        if (!isTerugkomst(doel)) return;
        e.preventDefault();
        this.rondAanmeldenAf(id, doel);
      });
    }

    grendelNavigatie(wc, EIGEN_BASIS, () => {
      this.sendIsland({ modus: 'actie', regel: 'Navigatie naar een ander programma geblokkeerd', bezig: false });
    });

    // Alleen onze eigen nieuw-tabbladpagina is van glas: die is ervoor ontworpen
    // en laat de mesh eronder doorkomen. Een website krijgt een dekvlak, want
    // een site die zelf geen achtergrond zet zou anders zijn tekst boven op de
    // bewegende kleuren leggen, en dat is niet te lezen.
    const zetAchtergrond = () => {
      view.setBackgroundColor(wc.getURL() === NEWTAB ? '#00000000' : '#ffffffff');
    };
    zetAchtergrond();

    // Zodra er iets begint of stopt met klinken hoort de balk dat te weten.
    // Twee keer sturen, en dat is geen slordigheid: op het moment dat deze
    // gebeurtenis afgaat staat isCurrentlyAudible() nog op zijn oude waarde,
    // want Chromium zet die pas een tel later om. Zonder de tweede zending
    // bleef de balk stil tot er toevallig iets anders de stand uitzond.
    wc.on('audio-state-changed', () => {
      this.pushState();
      setTimeout(() => {
        if (!this.win.isDestroyed()) this.pushState();
      }, 400);
    });

    for (const event of [
      'page-title-updated',
      'did-navigate',
      'did-navigate-in-page',
      'did-start-loading',
      'did-stop-loading',
      'did-fail-load',
    ]) {
      wc.on(event, () => {
        zetAchtergrond();
        this.pushState();
      });
    }

    wc.on('page-favicon-updated', (_e, favicons) => {
      this.send('tabs:favicon', { id, favicon: favicons[0] ?? null });
    });

    // Geschiedenis. De twee vlaggen gaan mee bij elke aanroep en zijn geen
    // filter dat je kunt vergeten: een privéworkspace en een tabblad van een
    // assistent komen er niet in. Zie lib/geschiedenis.js.
    const vanMij = { prive: Boolean(ws.prive), vanAssistent: Boolean(owner) };
    wc.on('did-navigate', (_e, doel) => {
      geschiedenis.bezoek(doel, wc.getTitle(), vanMij);
      // De overlay zat in de oude pagina en is dus al weg; alleen wij wisten
      // dat nog niet.
      if (this.gewezenTab === id) { this.gewezenTab = null; this.pushState(); }
    });
    wc.on('did-navigate-in-page', (_e, doel, hoofdframe) => {
      if (hoofdframe) geschiedenis.bezoek(doel, wc.getTitle(), vanMij);
    });
    // De titel komt bijna altijd later dan de navigatie; zonder dit staat de
    // halve lijst vol kale adressen.
    wc.on('page-title-updated', (_e, titel) => {
      if (vanMij.prive || vanMij.vanAssistent) return;
      geschiedenis.hernoem(wc.getURL(), titel);
    });

    bindSneltoetsen(wc, this);
    hangMenu(wc, this, {
      zoekURL: (tekst) => naarZoekURL(tekst, zoekmachine()),
      bewaarInNotitie: (tekst) => this.bewaarInNotitie(tekst),
    });

    ws.tabs.set(id, view);
    this.owners.set(id, owner);
    this.win.contentView.addChildView(view);
    // Maat vóór het laden, zodat de pagina meteen in de goede afmeting rendert.
    // Kan null zijn als het venster net niets te meten heeft; dan doet de
    // eerstvolgende hermeting het alsnog.
    const beginmaat = this.paginaBounds();
    if (beginmaat) view.setBounds(beginmaat);
    this.raiseIsland();
    wc.loadURL(url);

    if (activeer && ws.id === this.activeWorkspaceId) {
      this.activateTab(id);
    } else {
      // Een tabblad van een assistent mag jouw beeld niet overnemen. Alleen als
      // er nog helemaal niets actief was, wordt het toch het actieve tabblad.
      if (ws.activeId === null) ws.activeId = id;
      view.setVisible(false);
      this.pushState();
    }
    return id;
  }

  activateTab(id) {
    const ws = this.workspaceOf(id);
    if (!ws) return;
    // Een zoektocht hoort bij een pagina. Wie naar een ander tabblad gaat
    // laat anders een gele pagina achter met een teller in de zijbalk die
    // over iets anders gaat.
    if (this.zoekTerm) this.stopZoeken({ dicht: true });
    for (const view of this.allViews()) view.setVisible(false);
    this.activeWorkspaceId = ws.id;
    ws.activeId = id;
    // Naar het tabblad gaan dat naast je stond betekent dat de splitsing
    // zichzelf opheft: anders zou hetzelfde tabblad in beide helften staan.
    if (Number(id) === this.buurId) this.buurId = null;
    for (const [tabId, view] of this.alleTabsMetId()) {
      const hoort = tabId === Number(id) || tabId === this.buurId;
      if (hoort) view.setVisible(!this.paletteOpen && !this.werkbankOpen);
    }
    ws.tabs.get(id).setVisible(!this.paletteOpen && !this.werkbankOpen);
    this.layoutActiveTab();
    this.pushState();
  }

  closeTab(id) {
    // Een buur die dichtgaat heft de splitsing op; anders blijft er een halve
    // pagina staan naast niets.
    if (Number(id) === this.buurId) this.buurId = null;
    const ws = this.workspaceOf(id);
    if (!ws) return;
    const view = ws.tabs.get(id);

    const order = [...ws.tabs.keys()];
    const index = order.indexOf(id);

    // Onthouden vóór het sluiten: daarna is de webContents weg.
    const url = view.webContents.getURL();
    // Uit privé onthouden we niet eens dát er iets was. Zonder deze regel kwam
    // het adres terug met Ctrl+Shift+T, en dan in de eerste de beste workspace
    // die wél op schijf staat.
    if (url && !url.startsWith(NEWTAB) && !ws.prive) {
      this.gesloten.push({ url, wsId: ws.id, owner: this.owners.get(id) ?? null });
      if (this.gesloten.length > 20) this.gesloten.shift();
    }

    this.win.contentView.removeChildView(view);
    view.webContents.close();
    ws.tabs.delete(id);
    this.owners.delete(id);

    if (ws.activeId !== id) {
      // Sloot je de buur terwijl je zelf blijft staan, dan komt er verder niets
      // langs dat de breedte terugzet; dan blijft je pagina op een halve helft.
      this.layoutAlleTabs();
      this.pushState();
      return;
    }

    const next = order[index + 1] ?? order[index - 1];
    if (next === undefined) {
      this.createTab(NEWTAB, ws);
    } else if (ws.id === this.activeWorkspaceId) {
      this.activateTab(next);
    } else {
      ws.activeId = next;
      this.pushState();
    }
  }

  // --- de deur naar een AI-client --------------------------------------

  mcpMeld(regel) {
    this.mcpLog.push({ ...regel, op: Date.now() });
    // Honderd regels is genoeg om terug te kijken zonder dat dit ongemerkt
    // groeit tot het geheugen kost.
    if (this.mcpLog.length > 100) this.mcpLog.splice(0, this.mcpLog.length - 100);
    this.pushState();
  }

  /**
   * De workspace van de client. Eén per verbinding, met een sessie die niet op
   * schijf staat: geen koekjes, geen logins, weg zodra de deur dichtgaat. Dat is
   * de hele grens. Een client kan hier naar je mail navigeren en krijgt dan wat
   * een vreemde krijgt, namelijk een aanmeldscherm.
   */
  mcpWerkruimte() {
    const bestaand = [...this.workspaces.values()].find((ws) => ws.vanMcp);
    if (bestaand) return bestaand;

    const id = this.nextWorkspaceId++;
    // Geen 'persist:' ervoor. Dat is het verschil tussen een sessie die blijft
    // en een die verdampt.
    const partition = `mcp-${id}-${Date.now()}`;
    grendelSessie(partition);

    const ws = {
      id,
      name: 'AI-client',
      colorIndex: (id - 1) % PALET_IDS.length,
      palet: PALETTEN[(id - 1) % PALET_IDS.length],
      partition,
      tabs: new Map(),
      activeId: null,
      vanMcp: true,
    };
    this.workspaces.set(id, ws);
    this.pushState();
    return ws;
  }

  sluitMcpWerkruimte(id) {
    const ws = this.workspaces.get(id);
    if (!ws?.vanMcp) return;
    // Sluit je de workspace waar de assistent in werkt, dan stopt hij ook. Er is
    // dan niets meer om in te werken.
    if (this.agent?.wsId === id) this.stopAgent(false);
    for (const [tabId, view] of ws.tabs) {
      this.win.contentView.removeChildView(view);
      view.webContents.close();
      this.owners.delete(tabId);
    }
    ws.tabs.clear();
    this.workspaces.delete(id);
    if (this.activeWorkspaceId === id) {
      this.activateWorkspace([...this.workspaces.keys()][0]);
    }
    this.pushState();
  }

  mcpOpen(url) {
    const soort = beoordeelURL(String(url ?? ''), EIGEN_BASIS);
    // Alleen het gewone web. Onze eigen pagina's en alles wat naar een ander
    // programma wijst horen niet bij wat een client mag openen.
    if (soort !== 'web') throw new Error(`Dat adres mag hier niet: ${url}`);

    const ws = this.mcpWerkruimte();
    const id = this.createTab(url, ws, { owner: 'AI-client', activeer: false });
    const view = ws.tabs.get(id);
    return new Promise((klaar) => {
      const wc = view.webContents;
      const af = () => {
        wc.off('did-finish-load', af);
        wc.off('did-fail-load', af);
        klaar({ id, url: wc.getURL(), titel: wc.getTitle() });
      };
      wc.on('did-finish-load', af);
      wc.on('did-fail-load', af);
      // Een pagina die blijft hangen mag de client niet laten wachten.
      setTimeout(af, 15000);
    });
  }

  mcpLijst() {
    const ws = this.mcpWerkruimte();
    return [...ws.tabs.keys()].map((id) => {
      const wc = ws.tabs.get(id).webContents;
      return { id, url: wc.getURL(), titel: wc.getTitle() };
    });
  }

  async mcpLees(id, maximum) {
    const ws = this.mcpWerkruimte();
    const view = ws.tabs.get(Number(id));
    if (!view) throw new Error(`Die pagina heeft de client niet open: ${id}`);

    // Alleen de leesbare tekst, niet de opbouw van de pagina. Wat een mens zou
    // lezen als hij ernaar keek.
    const tekst = await view.webContents.executeJavaScript(
      `(() => {
        const bron = document.querySelector('article, main') ?? document.body;
        return bron ? bron.innerText : '';
      })()`,
    );
    const heel = String(tekst ?? '');
    return {
      id: Number(id),
      url: view.webContents.getURL(),
      titel: view.webContents.getTitle(),
      tekens: heel.length,
      afgekapt: heel.length > maximum,
      tekst: heel.slice(0, maximum),
    };
  }

  mcpSluit(id) {
    const ws = this.mcpWerkruimte();
    const view = ws.tabs.get(Number(id));
    if (!view) throw new Error(`Die pagina heeft de client niet open: ${id}`);
    this.win.contentView.removeChildView(view);
    view.webContents.close();
    ws.tabs.delete(Number(id));
    this.owners.delete(Number(id));
    this.pushState();
    return { gesloten: Number(id) };
  }

  async zetMcp(aan) {
    if (aan) await this.mcp.open();
    else this.mcp.sluit('door jou gesloten');
    // Met opzet niet bewaard. Een deur naar buiten die zichzelf opent zodra je
    // de browser start, is een deur die op een dag openstaat zonder dat iemand
    // daarvoor koos. Elke zitting begint dicht.
    this.pushState();
    return this.mcp.stand();
  }

  /** De noodstop: deur dicht, workspace weg, alles wat hij deed afgebroken. */
  mcpNoodstop() {
    this.stopAgent(false);
    this.toestemming.breekAf('de noodstop is ingedrukt');
    this.mcp.sluit('met de noodstop afgebroken');
    this.pushState();
    return this.mcp.stand();
  }

  // --- swipen tussen workspaces ------------------------------------------

  /**
   * Een afgeronde veeg met de linkerknop wisselt van workspace.
   *
   * Wat er niet gebeurt: iets terwijl je nog sleept. Zie lib/gebaar.js voor hoe
   * een veeg wordt onderscheiden van tekst selecteren.
   */
  veegBinnen(maat) {
    // Staat de app of het palet eroverheen, dan hoort een veeg niets te doen:
    // de tabbladen zijn verborgen, en eentje zichtbaar maken zou er dwars
    // doorheen tekenen.
    if (this.werkbankOpen || this.paletteOpen) return;
    const richting = beoordeel(maat?.dx, maat?.dy, maat?.ms);
    if (richting) this.buurWorkspace(richting);
  }

  /**
   * De workspace ernaast, in de volgorde van de strip.
   *
   * Niet rond: aan het eind gebeurt er niets. Met twee workspaces zou rondgaan
   * links en rechts hetzelfde maken, en dan weet je nooit waar je heen gaat.
   */
  buurWorkspace(richting) {
    const orde = [...this.workspaces.keys()];
    const nu = orde.indexOf(this.activeWorkspaceId);
    const doel = orde[nu + richting];
    if (doel === undefined) return;
    this.activateWorkspace(doel);
  }

  // --- inloggen ----------------------------------------------------------

  /**
   * Zet het aanmeldscherm in een gewoon tabblad van je huidige workspace.
   *
   * Niet in de werkbank en niet in een verborgen venster: de koekjes die Google
   * daar neerzet zijn precies wat je daarna bij gmail.com nodig hebt.
   */
  beginAanmelden(url) {
    // De werkbank staat eroverheen; die moet weg, anders klik je straks op een
    // scherm dat je niet ziet.
    this.zetWerkbank(false);
    const tabId = this.createTab(url);
    this.aanmelding.begin(tabId, url);

    // Als Google ons halverwege de deur wijst, gebeurt dat op zijn eigen
    // pagina en niet in een terugkomst. Zonder dit zie je een Google-scherm
    // in een tabblad en moet je zelf raden wat er misging; zie isGeweigerd.
    const wc = this.tabs.get(tabId)?.webContents;
    if (wc) {
      const kijk = (_e, doel) => {
        if (!isGeweigerd(doel)) return;
        wc.off('did-navigate', kijk);
        this.sendIsland({
          modus: 'actie',
          regel: 'Google vertrouwt deze browser nog niet — aanmelden met een e-mailadres werkt wel',
          bezig: false,
        });
      };
      wc.on('did-navigate', kijk);
      wc.once('destroyed', () => wc.off('did-navigate', kijk));
    }
    this.sendIsland({
      modus: 'actie',
      regel: 'Aanmelden in een gewoon tabblad, zodat je daarna ook hier ingelogd bent',
      bezig: true,
    });
    return tabId;
  }

  /**
   * De terugkomst. Het adres draagt de sleutels van je sessie, dus dit is de
   * plek waar streng zijn telt; zie lib/inloggen.js.
   */
  rondAanmeldenAf(tabId, url) {
    if (!this.aanmelding.hoortBij(tabId)) {
      this.sendIsland({
        modus: 'actie',
        regel: 'Een aanmelding die je niet zelf begon is tegengehouden',
        bezig: false,
      });
      return;
    }
    this.aanmelding.klaar();

    const fout = foutIn(url);
    if (fout) {
      this.sendIsland({ modus: 'actie', regel: `Aanmelden ging niet door: ${fout}`, bezig: false });
      return;
    }

    // De app maakt het af: de codeverifier staat in zijn eigen opslag, want daar
    // begon de aanmelding ook.
    this.maakWerkbank();
    this.werkbank.webContents.loadURL(url);
    this.zetWerkbank(true);
    this.closeTab(tabId);
    this.sendIsland({ modus: 'actie', regel: 'Aangemeld', bezig: false });
  }

  /**
   * Wie je bent volgens de app. Uit zijn eigen opslag gelezen in plaats van
   * ernaast bijgehouden: twee plekken die hetzelfde moeten weten lopen uiteen,
   * en dan staat er een naam in de zijbalk van iemand die is uitgelogd.
   */
  async leesAccount() {
    if (!this.werkbank || this.werkbank.webContents.isDestroyed()) return null;
    try {
      const rauw = await this.werkbank.webContents.executeJavaScript(
        `localStorage.getItem('assignments:identity:v1')`, true,
      );
      const staat = JSON.parse(rauw ?? 'null')?.state?.identity;
      if (!staat) return null;
      return {
        naam: staat.name ?? null,
        email: staat.email ?? null,
        account: staat.kept === 'account',
        wacht: Boolean(staat.pending),
      };
    } catch {
      return null;
    }
  }

  /**
   * Haalt op wie je bent en stuurt het door als het veranderd is.
   *
   * Alleen bij verandering: pushState tekent de hele zijbalk opnieuw, en dat bij
   * elke navigatie in de app doen laat je knoppen knipperen zonder reden.
   */
  async ververAccount() {
    const nieuw = await this.leesAccount();
    if (JSON.stringify(nieuw) === JSON.stringify(this.account)) return;
    this.account = nieuw;
    this.pushState();
  }

  /** De aanmeldpagina van de app, die niet in de rij met plekken staat. */
  gaAanmelden() {
    this.maakWerkbank();
    this.werkbank.webContents.loadURL(appURL('/signin'));
    this.zetWerkbank(true);
  }

  // --- waar je gebleven was ---------------------------------------------

  /**
   * Legt vast wat er open staat, zonder de privéworkspaces.
   *
   * Die uitzondering is de hele belofte. Een privéworkspace draait op een sessie
   * die niet op schijf staat; zou hij hier wél in komen, dan stond na afsluiten
   * alsnog op je schijf wát je bekeken had.
   */
  bewaarVoorHerstel() {
    if (voorkeuren.alles().startpagina !== 'vorige') return;

    const groepen = [];
    for (const ws of this.workspaces.values()) {
      if (ws.prive || ws.vanMcp) continue;
      const volgorde = [...ws.tabs.keys()];
      const adressen = volgorde
        .map((id) => ws.tabs.get(id)?.webContents)
        .filter((wc) => wc && !wc.isDestroyed())
        .map((wc) => wc.getURL())
        .filter((u) => /^https?:/.test(u));
      if (!adressen.length) continue;
      groepen.push({
        naam: ws.name,
        palet: ws.palet,
        beweging: ws.beweging ?? 'rustig',
        actief: Math.max(0, volgorde.indexOf(ws.activeId)),
        tabbladen: adressen,
      });
    }
    herstel.bewaar(groepen);
  }

  /**
   * Zet terug wat er open stond. Geeft terug of er iets te herstellen viel.
   *
   * Alleen bij het starten, en alleen als je dat hebt gekozen: een browser die
   * uit zichzelf twintig tabbladen opent die je gisteren dichtdeed, is een
   * browser die niet luistert.
   */
  herstelVorigeSessie() {
    if (voorkeuren.alles().startpagina !== 'vorige') return false;
    const vorig = herstel.lees();
    if (!vorig?.workspaces?.length) return false;

    let eerste = null;
    for (const groep of vorig.workspaces) {
      const wsId = eerste === null ? this.activeWorkspaceId : this.addWorkspace(groep.naam);
      const ws = this.workspaces.get(wsId);
      if (eerste === null) {
        ws.name = groep.naam || ws.name;
        eerste = wsId;
      }
      if (PALET_IDS.includes(groep.palet)) ws.palet = groep.palet;
      if (BEWEGINGEN.includes(groep.beweging)) ws.beweging = groep.beweging;

      const ids = groep.tabbladen.map((url) => this.createTab(url, ws, { activeer: false }));
      ws.activeId = ids[groep.actief] ?? ids[0] ?? ws.activeId;

      // Het lege tabblad waarmee de workspace begon mag weg zodra er echte
      // tabbladen in staan; anders houd je bij elke start een lege over.
      for (const [id, view] of [...ws.tabs]) {
        if (ids.includes(id)) continue;
        if (view.webContents.getURL().startsWith(NEWTAB)) this.closeTab(id);
      }
    }

    if (eerste !== null) this.activateTab(this.workspaces.get(eerste).activeId);
    this.pushState();
    return true;
  }

  // --- uiterlijk per workspace ------------------------------------------

  zetWorkspacePalet(wsId, palet) {
    const ws = this.workspaces.get(Number(wsId));
    // Een privéworkspace houdt zijn eigen donkere palet: dat is geen smaak maar
    // het teken waaraan je ziet waar je bent.
    if (!ws || ws.prive || !PALET_IDS.includes(palet)) return;
    ws.palet = palet;
    this.pushState();
  }

  zetWorkspaceBeweging(wsId, beweging) {
    const ws = this.workspaces.get(Number(wsId));
    if (!ws || !BEWEGINGEN.includes(beweging)) return;
    ws.beweging = beweging;
    this.pushState();
  }

  // --- weggelegde sessies -----------------------------------------------

  /**
   * Legt de huidige workspace weg en sluit hem.
   *
   * Sluiten hoort erbij: het hele punt is dat je hem kwijt kunt zonder hem te
   * verliezen. Wegleggen zonder sluiten zou een kopie maken, en dan heb je twee
   * dingen die uit elkaar gaan lopen.
   */
  async legWeg(wsId) {
    const ws = this.workspaces.get(wsId ?? this.activeWorkspaceId);
    if (!ws) throw new Error('Die workspace bestaat niet');

    const volgorde = [...ws.tabs.keys()];
    const tabbladen = volgorde.map((id) => {
      const wc = ws.tabs.get(id).webContents;
      const url = wc.getURL();
      let host = '';
      try {
        host = new URL(url).host;
      } catch {
        // Een adres dat nog niet te ontleden is; dan zonder host.
      }
      return { url, titel: wc.getTitle() || '', host };
    });

    const sessie = await sessies.bewaar(ws, tabbladen, volgorde.indexOf(ws.activeId));

    // De laatste workspace blijft staan, net als bij gewoon sluiten; een venster
    // zonder workspace bestaat niet. Dan legen we hem in plaats van te sluiten.
    if (this.workspaces.size <= 1) {
      for (const id of volgorde) this.closeTab(id);
    } else {
      this.closeWorkspace(ws.id);
    }
    this.pushState();
    return sessie;
  }

  /** Haalt een weggelegde sessie terug als nieuwe workspace. */
  haalTerug(id) {
    const sessie = sessies.vind(id);
    if (!sessie) throw new Error('Die sessie bestaat niet meer');

    const wsId = this.addWorkspace(sessie.naam);
    const ws = this.workspaces.get(wsId);
    // Het uiterlijk hoort bij de sessie: kom je terug, dan ziet het er weer zo
    // uit als toen je hem wegzette.
    if (PALET_IDS.includes(sessie.palet)) ws.palet = sessie.palet;
    if (BEWEGINGEN.includes(sessie.beweging)) ws.beweging = sessie.beweging;
    const ids = sessie.tabbladen.map((t) => this.createTab(t.url, ws, { activeer: false }));
    ws.activeId = ids[sessie.actief] ?? ids[0] ?? null;
    this.activateWorkspace(wsId);
    this.pushState();
    return { workspace: wsId, tabbladen: ids.length };
  }

  async gooiSessieWeg(id) {
    const weg = await sessies.verwijder(id);
    this.pushState();
    return weg;
  }

  async hernoemSessie(id, naam) {
    const goed = await sessies.hernoem(id, naam);
    this.pushState();
    return goed;
  }

  // --- wat het contextmenu kan ------------------------------------------

  /**
   * Zet geselecteerde tekst onderaan je notitie en laat het blok even zien.
   *
   * Met een leeg regeltje ertussen en zonder aanhalingstekens of bronvermelding:
   * dit is een kladblok, geen citatensysteem. Wie de bron wil, plakt er zelf een
   * adres bij.
   */
  bewaarInNotitie(tekst) {
    const stuk = String(tekst ?? '').trim();
    if (!stuk) return;
    const nu = voorkeuren.alles().notitie ?? '';
    voorkeuren.zet('notitie', nu ? `${nu.replace(/\s+$/, '')}\n\n${stuk}` : stuk);
    // Open het blok, zodat je ziet dát het geland is. Stil bewaren laat je
    // twijfelen of er iets gebeurd is.
    if (this.paneel !== 'notitie') this.zetPaneel('notitie');
  }

  /**
   * Opent een adres in een verse privéworkspace. Handig voor precies het geval
   * waarvoor mensen normaal een tweede browser openen: even iets bekijken
   * zonder dat het bij je ingelogde zelf hoort.
   */
  openInPrive(url) {
    const soort = beoordeelURL(String(url ?? ''), EIGEN_BASIS);
    if (soort !== 'web' && soort !== 'intern') return;
    const id = this.addWorkspace(null, { prive: true });
    this.createTab(url, this.workspaces.get(id));
    this.activateWorkspace(id);
  }

  // --- toestemming per handeling ---------------------------------------

  /**
   * Een openstaande vraag neemt de pagina weg, net als de commandobalk.
   *
   * Dat is geen opmaak maar de kern: de vraag hoort in het chroom van de
   * browser te staan, waar geen pagina en geen client bij kan. Zou hij over een
   * website heen zweven, dan kan die website er iets overheen tekenen dat lijkt
   * op iets anders, en dan klik je op een knop waarvan je denkt te weten wat
   * hij doet.
   */
  toonVraag() {
    const vraag = this.toestemming.stand().open;
    // Loopt er een opdracht, dan hoort de balk het ook te zeggen: daar kijk je
    // naar terwijl hij bezig is, en daar staan de twee knoppen.
    if (this.agent) {
      this.sendIsland(vraag
        ? { modus: 'actie', vraag: true, regel: kortRegel(vraag.kop), bezig: false }
        : { modus: 'analyseren', regel: `${this.agent.naam} gaat verder`, bezig: true });
    }
    const view = this.tabs.get(this.activeId);
    if (view) view.setVisible(!vraag && !this.paletteOpen && !this.werkbankOpen);
    if (this.werkbank) this.werkbank.setVisible(this.werkbankOpen && !vraag && !this.paletteOpen);
    if (this.island) this.island.setVisible(!vraag && !this.werkbankOpen);
    this.pushState();
  }

  /** Stelt de vraag in gewone taal, met genoeg erbij om hem te kunnen wegen. */
  mcpVraagToestemming(naam, arg) {
    if (naam === 'lees_jouw_pagina') {
      const gevonden = this.zoekJouwTab(arg.id);
      if (!gevonden) return Promise.resolve({ goed: false, reden: 'die pagina bestaat niet' });
      return this.toestemming.vraag({
        wat: naam,
        kop: 'De AI-client wil een pagina van jou lezen',
        regels: [
          `Pagina: ${gevonden.titel}`,
          `Adres: ${gevonden.host || 'onbekend'}`,
          `Workspace: ${gevonden.wsNaam}`,
        ],
        waarschuwing: 'Alles wat op die pagina staat gaat naar de client. Ben je '
          + 'daar ingelogd, dan hoort daar ook alles bij wat achter die login zit.',
      });
    }

    if (naam === 'klik') {
      const view = this.mcpWerkruimte().tabs.get(Number(arg.id));
      return this.toestemming.vraag({
        wat: naam,
        kop: 'De AI-client wil ergens op klikken',
        regels: [
          `Klikt op: "${arg.tekst}"`,
          `Pagina: ${view?.webContents.getTitle() ?? 'onbekend'}`,
          `Adres: ${view ? hostVan(view.webContents.getURL()) : 'onbekend'}`,
        ],
        waarschuwing: 'Wat een knop doet staat niet altijd op de knop. Kijk waar '
          + 'de pagina staat voordat je dit toestaat.',
      });
    }

    /*
     * Kijken is niet lezen, en dat verschil staat in de vraag.
     *
     * `lees_jouw_pagina` stuurt de tekst van de pagina naar de client — alles,
     * inclusief wat achter een login staat. Dit stuurt de indeling: welke
     * knoppen er zijn, hoe ze heten, waar ze staan. Geen veldwaarde, nooit.
     * Dat is minder, en de vraag hoort dat te zeggen in plaats van dezelfde
     * schrik op te roepen als de zware.
     */
    if (naam === 'bekijk_jouw_pagina') {
      const gevonden = this.zoekJouwTab(arg.id);
      if (!gevonden) return Promise.resolve({ goed: false, reden: 'die pagina bestaat niet' });
      return this.toestemming.vraag({
        wat: naam,
        kop: 'De AI-client wil zien hoe jouw pagina in elkaar zit',
        regels: [
          `Pagina: ${gevonden.titel}`,
          `Adres: ${gevonden.host || 'onbekend'}`,
          `Workspace: ${gevonden.wsNaam}`,
        ],
        waarschuwing: 'De client krijgt de koppen, de knoppen en hun namen — niet '
          + 'de lopende tekst en nooit wat er in een veld staat.',
      });
    }

    /*
     * En wijzen is niet doen.
     *
     * Er gaat hier niets naar de client toe; er komt iets op jouw scherm bij.
     * De waarschuwing zegt daarom niet wat je kwijtraakt maar wat er straks
     * staat — en dat wat er straks staat een zin van een model is.
     */
    if (naam === 'wijs_aan') {
      const gevonden = this.zoekJouwTab(arg.id);
      if (!gevonden) return Promise.resolve({ goed: false, reden: 'die pagina bestaat niet' });
      return this.toestemming.vraag({
        wat: naam,
        kop: 'De AI-client wil iets aanwijzen op jouw pagina',
        regels: [
          `Pagina: ${gevonden.titel}`,
          `Zegt erbij: "${String(arg.tekst ?? '').slice(0, 80)}"`,
          `Workspace: ${gevonden.wsNaam}`,
        ],
        waarschuwing: 'Er wordt een ring om iets heen gezet met die zin erbij. Er '
          + 'wordt niet geklikt, niets getypt en nergens heen genavigeerd — en er '
          + 'gaat niets van de pagina naar de client.',
      });
    }

    if (naam === 'typ') {
      const view = this.mcpWerkruimte().tabs.get(Number(arg.id));
      return this.toestemming.vraag({
        wat: naam,
        kop: 'De AI-client wil iets typen',
        regels: [
          `In het veld: "${arg.veld}"`,
          `Tekst: "${String(arg.tekst).slice(0, 120)}"`,
          `Adres: ${view ? hostVan(view.webContents.getURL()) : 'onbekend'}`,
        ],
        waarschuwing: 'Deze tekst komt op een pagina te staan die niet van jou is.',
      });
    }

    return Promise.resolve({ goed: false, reden: 'daar is geen vraag voor' });
  }

  /**
   * Waarom er niet getypt mag worden, of null als het mag. Dit draait vóór de
   * vraag: er is geen goede manier om te vragen of een wachtwoord ergens in mag.
   */
  typBezwaar(veld, tekst) {
    const v = String(veld ?? '');
    if (NOOIT_TYPEN.test(v)) return `dit lijkt een wachtwoord- of betaalveld ("${v}")`;
    if (NOOIT_TYPEN.test(String(tekst ?? ''))) return 'de tekst zelf lijkt een wachtwoord of betaalgegeven';
    return null;
  }

  /**
   * Zegt waarom een tabblad niet van een client is. Voor privé, want daar gaat
   * het antwoord altijd nee zijn, en dan is vragen alleen maar lekken.
   */
  priveBezwaar(id) {
    for (const ws of this.workspaces.values()) {
      if (ws.prive && ws.tabs.has(Number(id))) {
        return 'Dat tabblad staat in een privéworkspace. Daar kan een client niet bij.';
      }
    }
    return null;
  }

  zoekJouwTab(id) {
    for (const ws of this.workspaces.values()) {
      if (ws.vanMcp) continue;
      // Een privéworkspace bestaat niet voor een client van buiten, ook niet
      // als hij het nummer raadt. Anders is één toestemming genoeg om te lezen
      // wat je juist niet wilde bewaren.
      if (ws.prive) continue;
      const view = ws.tabs.get(Number(id));
      if (!view || view.webContents.isDestroyed()) continue;
      return {
        view,
        wsNaam: ws.name,
        titel: view.webContents.getTitle() || 'Naamloos tabblad',
        host: hostVan(view.webContents.getURL()),
      };
    }
    return null;
  }

  /** Alleen titels, geen inhoud. Zonder dit kan een client niet eens vragen. */
  mcpJouwPaginas() {
    const rijen = [];
    for (const ws of this.workspaces.values()) {
      if (ws.vanMcp || ws.prive) continue;
      for (const [id, view] of ws.tabs) {
        if (view.webContents.isDestroyed()) continue;
        rijen.push({
          id,
          titel: view.webContents.getTitle() || 'Naamloos tabblad',
          host: hostVan(view.webContents.getURL()),
          workspace: ws.name,
        });
      }
    }
    return rijen;
  }

  async mcpLeesJouwPagina(id, maximum) {
    const gevonden = this.zoekJouwTab(id);
    if (!gevonden) throw new Error(`Die pagina bestaat niet: ${id}`);
    const tekst = await gevonden.view.webContents.executeJavaScript(
      `(() => {
        const bron = document.querySelector('article, main') ?? document.body;
        return bron ? bron.innerText : '';
      })()`,
    );
    const heel = String(tekst ?? '');
    return {
      id: Number(id),
      titel: gevonden.titel,
      host: gevonden.host,
      tekens: heel.length,
      afgekapt: heel.length > maximum,
      tekst: heel.slice(0, maximum),
    };
  }

  /*
   * ── De gids, aangesloten ────────────────────────────────────────────
   *
   * `lib/gids/` was af en getest en er liep geen enkele draad naartoe: een
   * snapshot die niemand kon opvragen en een ring die niemand kon laten
   * zetten. Dit zijn de drie regels die dat verhelpen. De brug doet het werk
   * — deze kant kiest alleen het tabblad en geeft de foutmelding die een mens
   * kan lezen.
   */

  /** De brug van een tabblad van jou, of een fout waar iets in staat. */
  gidsBrugVoor(id) {
    const gevonden = this.zoekJouwTab(id);
    if (!gevonden) throw new Error(`Die pagina bestaat niet: ${id}`);
    const brug = brugVoor(gevonden.view.webContents);
    if (!brug) throw new Error(`Die pagina is net weggegaan: ${id}`);
    return { brug, gevonden };
  }

  async mcpBekijkJouwPagina(id) {
    const { brug, gevonden } = this.gidsBrugVoor(id);
    const uit = await brug.snapshot();
    if (uit.status && uit.status !== 'ok') {
      throw new Error(`Kon die pagina niet bekijken: ${uit.status}`);
    }
    return {
      id: Number(id),
      titel: gevonden.titel,
      host: gevonden.host,
      knopen: uit.knopen,
      weggelaten: uit.weggelaten,
      indeling: uit.tekst,
    };
  }

  async mcpWijsAan(id, ref, tekst) {
    const { brug } = this.gidsBrugVoor(id);
    const uit = await brug.wijs(String(ref ?? ''), String(tekst ?? ''));
    if (uit.status !== 'ok') {
      // "weg" is de eerlijke uitkomst als de pagina zichzelf opnieuw getekend
      // heeft sinds de snapshot, en de client hoort dat te horen in plaats van
      // een ring te zien die er niet is.
      throw new Error(`Kon daar niet naar wijzen: ${uit.status}`);
    }
    // Onthouden waar de aanwijzing staat, zodat Escape hem kan weghalen. Er
    // is er hoogstens één tegelijk: wijzen op een tweede pagina haalt de
    // eerste weg, want twee ringen tegelijk wijst niets aan.
    if (this.gewezenTab !== null && this.gewezenTab !== Number(id)) {
      this.wijsNietMeer(this.gewezenTab);
    }
    this.gewezenTab = Number(id);
    this.pushState();
    return { id: Number(id), ref: String(ref), gewezen: true, rect: uit.rect };
  }

  async mcpWijsNietMeer(id) {
    const { brug } = this.gidsBrugVoor(id);
    await brug.verberg();
    if (this.gewezenTab === Number(id)) {
      this.gewezenTab = null;
      this.pushState();
    }
    return { id: Number(id), gewezen: false };
  }

  /**
   * Hetzelfde, maar van onze kant: Escape, of een pagina die wegnavigeert.
   * Stil, want dit is geen verzoek van een client dat een antwoord verdient.
   */
  wijsNietMeer(id = this.gewezenTab) {
    if (id === null) return false;
    try {
      const { brug } = this.gidsBrugVoor(id);
      brug.verberg().catch(() => {});
    } catch {
      // Het tabblad is al weg. Dan is de aanwijzing dat ook.
    }
    if (this.gewezenTab === Number(id)) {
      this.gewezenTab = null;
      this.pushState();
    }
    return true;
  }

  async mcpKlik(id, tekst) {
    const view = this.mcpWerkruimte().tabs.get(Number(id));
    if (!view) throw new Error(`Die pagina heeft de client niet open: ${id}`);
    const doelTekst = JSON.stringify(String(tekst));
    // Klikken op zichtbare tekst, niet op een selector. Een selector zegt jou
    // niets bij de vraag, en dan kun je hem ook niet wegen.
    const uitkomst = await view.webContents.executeJavaScript(`(() => {
      const wens = ${doelTekst}.trim().toLowerCase();
      const kandidaten = [...document.querySelectorAll('a, button, [role="button"], input[type="submit"], input[type="button"]')];
      const doel = kandidaten.find((el) => {
        const t = (el.innerText || el.value || el.getAttribute('aria-label') || '').trim().toLowerCase();
        return t === wens;
      }) ?? kandidaten.find((el) => {
        const t = (el.innerText || el.value || el.getAttribute('aria-label') || '').trim().toLowerCase();
        return t.includes(wens);
      });
      if (!doel) return { gelukt: false, reden: 'niets met die tekst gevonden' };
      doel.click();
      return { gelukt: true, opGeklikt: (doel.innerText || doel.value || '').trim().slice(0, 80) };
    })()`);
    if (!uitkomst.gelukt) throw new Error(uitkomst.reden);
    return uitkomst;
  }

  async mcpTyp(id, veld, tekst) {
    const view = this.mcpWerkruimte().tabs.get(Number(id));
    if (!view) throw new Error(`Die pagina heeft de client niet open: ${id}`);
    const wens = JSON.stringify(String(veld));
    const waarde = JSON.stringify(String(tekst));
    const nooitSoort = String(NOOIT_VELDSOORT);
    const nooitAanvulling = String(NOOIT_AANVULLING);

    // De weigering staat óók in de pagina, en niet alleen bij de vraag. Het veld
    // dat je zag bij het toestaan hoeft niet het veld te zijn dat er nu is: een
    // pagina kan tussen jouw klik en deze regel van alles hebben omgezet.
    const uitkomst = await view.webContents.executeJavaScript(`(() => {
      const wens = ${wens}.trim().toLowerCase();
      const velden = [...document.querySelectorAll('input, textarea')];
      const naamVan = (el) => [
        el.labels?.[0]?.innerText, el.placeholder, el.name, el.id, el.getAttribute('aria-label'),
      ].filter(Boolean).join(' ').toLowerCase();
      const doel = velden.find((el) => naamVan(el) === wens) ?? velden.find((el) => naamVan(el).includes(wens));
      if (!doel) return { gelukt: false, reden: 'geen veld met die naam gevonden' };
      if (${nooitSoort}.test(doel.type ?? '')) return { gelukt: false, reden: 'dat is een wachtwoordveld' };
      if (${nooitAanvulling}.test(doel.autocomplete ?? '')) {
        return { gelukt: false, reden: 'dat veld vraagt om een wachtwoord of betaalgegeven' };
      }
      doel.focus();
      doel.value = ${waarde};
      doel.dispatchEvent(new Event('input', { bubbles: true }));
      doel.dispatchEvent(new Event('change', { bubbles: true }));
      return { gelukt: true, veld: naamVan(doel).slice(0, 60) };
    })()`);
    if (!uitkomst.gelukt) throw new Error(uitkomst.reden);
    return uitkomst;
  }

  // --- geluid ----------------------------------------------------------

  /**
   * Wat er nu klinkt, over alle workspaces heen. Een tabblad dat in een andere
   * workspace speelt hoor je namelijk gewoon, dus het hoort ook in deze lijst.
   */
  geluidsbronnen() {
    const rijen = [];
    for (const ws of this.workspaces.values()) {
      for (const [id, view] of ws.tabs) {
        const wc = view.webContents;
        if (wc.isDestroyed()) continue;
        const klinkt = wc.isCurrentlyAudible();
        const gedempt = wc.isAudioMuted();
        // Een gedempt tabblad meldt zichzelf niet als hoorbaar, dus zonder deze
        // tweede voorwaarde zou dempen hem uit de lijst laten verdwijnen en had
        // je geen knop meer om hem terug te zetten.
        if (!klinkt && !gedempt) continue;
        rijen.push({
          id,
          wsId: ws.id,
          wsNaam: ws.name,
          titel: wc.getTitle() || 'Naamloos tabblad',
          host: (() => {
            try {
              return new URL(wc.getURL()).host;
            } catch {
              return '';
            }
          })(),
          klinkt,
          gedempt,
        });
      }
    }
    return rijen;
  }

  dempTab(id, gedempt) {
    for (const ws of this.workspaces.values()) {
      const view = ws.tabs.get(id);
      if (!view || view.webContents.isDestroyed()) continue;
      view.webContents.setAudioMuted(Boolean(gedempt));
      this.pushState();
      return;
    }
  }

  // --- bovenbalk -------------------------------------------------------

  get paneelHoogte() {
    return this.paneel ? (PANEEL_HOOGTES[this.paneel] ?? 0) : 0;
  }

  /**
   * Opent of sluit een paneel onder de bovenbalk. Dezelfde naam nog eens
   * betekent dicht, zodat de knop in de balk een schakelaar is.
   */
  zetPaneel(naam) {
    const nieuw = naam && PANEEL_HOOGTES[naam] && naam !== this.paneel ? naam : null;
    if (nieuw === this.paneel) return;
    this.paneel = nieuw;

    // De pagina krijgt minder ruimte in plaats van te verdwijnen: je houdt zicht
    // op waar je mee bezig was terwijl je een notitie maakt.
    this.layoutAlleTabs();
    this.layoutWerkbank();
    this.layoutIsland();
    this.pushState();
  }

  // --- werkbank --------------------------------------------------------

  maakWerkbank() {
    if (this.werkbank) return this.werkbank;

    // Grendelen vóórdat er iets in kan laden, net als bij een workspace.
    const ses = grendelSessie(WERKBANK_PARTITIE);

    // Eén keer per proces: het schema bedient elke sessie tegelijk.
    if (!BrowserWindowController.appBediend) {
      bedienApp({ wortel: path.join(__dirname, 'app'), sessie: ses });
      BrowserWindowController.appBediend = true;
    }

    // Een merkteken in de user agent, zodat de app kan zien dat hij hier draait
    // en niet in een willekeurige browser. Dat is de nette helft van "geef de
    // app dezelfde stijl": de browser zegt wie hij is, de app beslist zelf wat
    // hij daarmee doet. Zijn CSS van buitenaf overschrijven zou breken zodra de
    // app iets hernoemt, en dat is geen integratie maar een gok.
    if (!ses.getUserAgent().includes('TougatherBrowser')) {
      ses.setUserAgent(`${ses.getUserAgent()} TougatherBrowser/${app.getVersion()}`);
    }

    this.werkbank = new WebContentsView({
      webPreferences: {
        partition: WERKBANK_PARTITIE,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    this.werkbank.setBorderRadius(CONTENT_RADIUS);
    // Doorschijnend: de mesh van het venster hoort onder de app door te lopen,
    // net als onder het nieuw-tabblad. De app zet zelf data-schil="browser" op
    // het eigen schema en maakt zijn vlakken dan doorschijnend wit.
    this.werkbank.setBackgroundColor('#00000000');

    const wc = this.werkbank.webContents;

    // "Ga verder met Google" navigeert de app weg naar Supabase. Dat scherm
    // hoort in een gewoon tabblad te staan, niet hierin: alleen dan zet Google
    // zijn koekjes in de sessie van je workspace en ben je daarna ook in deze
    // browser bij Google ingelogd. Dat is de hele truc.
    wc.on('will-navigate', (e, doel) => {
      if (!isAanmeldStart(doel)) return;
      e.preventDefault();
      this.beginAanmelden(doel);
    });

    grendelNavigatie(wc, EIGEN_BASIS, () => {
      this.sendIsland({ modus: 'actie', regel: 'Navigatie naar een ander programma geblokkeerd', bezig: false });
    });

    // Een link uit de app die naar buiten wijst hoort een gewoon tabblad te
    // worden, niet de werkbank weg te navigeren.
    wc.setWindowOpenHandler(({ url }) => {
      const soort = beoordeelURL(url, EIGEN_BASIS);
      if (soort === 'web' || soort === 'intern') this.createTab(url);
      return { action: 'deny' };
    });

    for (const gebeurtenis of ['did-navigate', 'did-start-loading', 'did-stop-loading', 'did-fail-load']) {
      wc.on(gebeurtenis, () => this.pushState());
    }

    // Bijhouden waar de app is, ook als je binnen de app doorklikt. Anders
    // wijst de zijbalk naar een rij waar je allang niet meer bent.
    wc.on('did-navigate-in-page', () => {
      this.leesWerkbankPad();
      this.ververAccount();
    });
    wc.on('did-finish-load', () => {
      this.leesWerkbankPad();
      this.vouwAppZijbalk();
      this.ververAccount();
    });

    // De app in de kleuren van de browser, als je dat wilt. Alleen tokens; zie
    // lib/app-stijl.js voor wat er bewust níét wordt aangeraakt.
    this.appStijl = volgDeBrowser(wc, () => voorkeuren.alles().appStijl !== false);

    bindSneltoetsen(wc, this);
    hangMenu(wc, this, {
      zoekURL: (tekst) => naarZoekURL(tekst, zoekmachine()),
      bewaarInNotitie: (tekst) => this.bewaarInNotitie(tekst),
    });
    wc.loadURL(WERKBANK_URL + this.werkbankPad);
    this.win.contentView.addChildView(this.werkbank);
    return this.werkbank;
  }

  // Twee zijbalken naast elkaar is precies wat een ingebouwde app niet hoort te
  // zijn. De app vouwt zijn eigen zijbalk op met Ctrl+B, dus dat toetsen we één
  // keer aan in plaats van in zijn DOM te grijpen: zijn eigen sneltoets blijft
  // werken ook als hij zijn opbouw verandert.
  vouwAppZijbalk() {
    if (this.appZijbalkGevouwen || !this.werkbank) return;
    const { width } = this.werkbank.getBounds();
    if (width < APP_ZIJBALK_GRENS) {
      // Onder de grens begint hij al dicht; aantoetsen zou hem juist openen.
      this.appZijbalkGevouwen = true;
      return;
    }
    const wc = this.werkbank.webContents;
    for (const type of ['keyDown', 'char', 'keyUp']) {
      wc.sendInputEvent({ type, keyCode: 'b', modifiers: ['control'] });
    }
    this.appZijbalkGevouwen = true;
  }

  leesWerkbankPad() {
    if (!this.werkbank) return;
    try {
      const pad = new URL(this.werkbank.webContents.getURL()).pathname;
      const plek = WERKBANK_PLEKKEN.find((p) => pad === p.pad || pad.startsWith(p.pad + '/'));
      this.werkbankPad = plek ? plek.pad : pad;
    } catch {
      // Een adres dat nog niet te ontleden is; de vorige stand blijft staan.
    }
    this.pushState();
  }

  gaWerkbank(pad) {
    const doel = WERKBANK_PLEKKEN.some((p) => p.pad === pad) ? pad : WERKBANK_PLEKKEN[0].pad;
    const bestond = Boolean(this.werkbank);
    this.werkbankPad = doel;
    this.zetWerkbank(true);
    // Een verse werkbank laadt het pad al bij het aanmaken; een bestaande moet
    // er alsnog heen. Binnen de app blijft dat een gewone navigatie.
    if (bestond) this.werkbank.webContents.loadURL(WERKBANK_URL + doel);
  }

  zetWerkbank(open) {
    const aan = Boolean(open);
    if (aan === this.werkbankOpen && this.werkbank) return;
    this.werkbankOpen = aan;

    if (aan) this.maakWerkbank();
    if (this.werkbank) {
      this.werkbank.setVisible(aan);
      if (aan) {
        // Boven de tabbladen leggen, anders tekent een pagina eroverheen.
        this.win.contentView.addChildView(this.werkbank);
        this.layoutWerkbank();
        this.werkbank.webContents.focus();
      }
    }

    // Het tabblad eronder verdwijnt zolang de werkbank openstaat. Twee native
    // lagen op dezelfde plek vechten anders om elke klik.
    const view = this.tabs.get(this.activeId);
    if (view) view.setVisible(!aan && !this.paletteOpen);

    // De balk van de assistent hoort niet over de app te hangen.
    if (this.island) this.island.setVisible(!aan);

    this.pushState();
  }

  wisselWerkbank() {
    this.zetWerkbank(!this.werkbankOpen);
  }

  layoutWerkbank() {
    if (!this.werkbank || !this.werkbankOpen) return;
    const bounds = this.paginaBounds();
    if (bounds) this.werkbank.setBounds(bounds);
  }

  // --- commandobalk ----------------------------------------------------

  setPaletteOpen(open) {
    // De pagina is een native kindview en tekent altijd bovenop de UI. Een
    // overlay is dus alleen zichtbaar als we de pagina even wegnemen.
    this.paletteOpen = Boolean(open);
    const view = this.tabs.get(this.activeId);
    if (view) view.setVisible(!this.paletteOpen);
  }

  // --- assistent -------------------------------------------------------

  /* ── Welke rug ──────────────────────────────────────────────────────
   *
   * Twee wegen naar hetzelfde: de agent die al op deze computer staat, of de
   * API-sleutel van de gebruiker zelf. De eerste is de betere en staat daarom
   * voorop — die kost niets extra en er komt geen sleutel aan te pas. De
   * tweede is er voor wie geen agent heeft, en verandert niets aan de
   * belofte: de sleutel is van jou, de aanroep gaat van deze computer
   * rechtstreeks naar de API, en er zit nog steeds geen sleutel van ons in de
   * download.
   *
   * 'auto' kiest; 'agent' en 'api' zijn een keuze van de gebruiker en worden
   * niet stilletjes overruled. Iets anders doen dan er staat is erger dan
   * niets doen met een reden erbij.
   */
  kiesRug() {
    const voorkeur = voorkeuren.alles().assistentBron ?? 'auto';
    const agent = voorkeur === 'api' ? null : zoekAgent();
    const eigenSleutel = voorkeur === 'agent' ? null : sleutel.lees();

    if (agent && this.agentAangemeld !== false) return { soort: 'agent', agent };
    if (eigenSleutel) {
      return {
        soort: 'api',
        sleutel: eigenSleutel,
        model: voorkeuren.alles().assistentModel || STANDAARD_MODEL,
      };
    }
    // Niets bruikbaars. De reden hangt af van waar het op strandde, want
    // "geen agent" en "agent niet aangemeld" vragen om iets anders van je.
    if (agent && this.agentAangemeld === false) {
      return { soort: 'geen', reden: 'Claude Code is nog niet aangemeld. Voer eenmalig "claude auth login" uit, of zet een API-sleutel in Instellingen.' };
    }
    if (voorkeur === 'agent') {
      return { soort: 'geen', reden: 'Geen agent op deze computer, en de assistent staat op "alleen de agent". Zie Instellingen.' };
    }
    if (voorkeur === 'api') {
      return { soort: 'geen', reden: 'Er staat geen API-sleutel. Zet er een in Instellingen, bij Assistent.' };
    }
    return { soort: 'geen', reden: 'Geen agent op deze computer en geen API-sleutel. Zie Instellingen, bij Assistent.' };
  }

  /**
   * Eén ronde starten op de gekozen rug.
   *
   * De agent is een kindproces en moet ergens aankloppen, dus daar gaat de
   * MCP-deur voor open. De API-lus draait hiernaast in dit proces en roept de
   * deur gewoon aan — zonder poort. Dezelfde toestemmingsvragen, dezelfde
   * grendel, één stuk aanvalsoppervlak minder.
   */
  async startRonde(rug, { opdracht, gereedschap, houding, beperk = false }) {
    if (rug.soort === 'agent') {
      this.deurWasOpen = this.mcp.aan;
      if (!this.deurWasOpen) await this.zetMcp(true);
      if (beperk && !this.deurWasOpen) this.mcp.beperkTot(gereedschap);
      return new Opdracht({
        agent: rug.agent,
        // Electron draait zichzelf als node; zo hoeft er geen losse node te staan.
        elektron: process.execPath,
        brug: BRUG,
        gereedschap,
        houding,
        werkmap: this.agentWerkmap(),
        opMelding: (melding) => this.agentMelding(melding),
      }).start(opdracht);
    }

    // Geen deur nodig, dus ook geen deur die daarna dicht moet.
    this.deurWasOpen = this.mcp.aan;
    if (beperk) this.mcp.beperkTot(gereedschap);
    return new ApiOpdracht({
      sleutel: rug.sleutel,
      model: rug.model,
      deur: this.mcp,
      stukken: GEREEDSCHAP.filter((g) => gereedschap.includes(g.naam)),
      houding,
      opMelding: (melding) => this.agentMelding(melding),
    }).start(opdracht);
  }

  /**
   * Een opdracht, uitgevoerd door de agent die op deze computer staat.
   *
   * Niet door een model van ons: dan betaalden wij per opdracht en liep jouw
   * tekst langs onze server. Zie lib/agent.js voor wat hij hier wel en niet
   * mag, en waarom er niets op te zetten valt.
   */
  async startAgent(opdracht) {
    const tekst = String(opdracht ?? '').trim();
    if (!tekst) return;
    this.stopAgent(false);

    const rug = this.kiesRug();
    if (rug.soort === 'geen') {
      this.sendIsland({ modus: 'actie', vraag: false, regel: rug.reden, bezig: false });
      if (rug.reden.includes('auth login')) this.vraagAanmelding();
      return;
    }

    // De workspace waar hij werkt, meteen zichtbaar in de strip. Je hoort te
    // kunnen zien waar het gebeurt terwijl het gebeurt.
    const ws = this.mcpWerkruimte();
    const naam = rug.soort === 'agent' ? rug.agent.naam : 'De assistent';
    this.agent = { naam, wsId: ws.id, opdracht: tekst, loop: null, rug: rug.soort };
    this.sendIsland({ modus: 'debuggen', regel: `${naam} leest je opdracht`, bezig: true });

    this.agent.loop = await this.startRonde(rug, {
      opdracht: tekst,
      gereedschap: this.mcp.stand().gereedschap,
      houding: HOUDING,
    });

    this.pushState();
  }

  /* ── De gids ────────────────────────────────────────────────────────
   *
   * Een vraag over de pagina waar je nu naar kijkt. Dezelfde agent als een
   * opdracht, maar een andere houding en een kortere lijst gereedschap: hij
   * kijkt en wijst, hij opent niets en klikt niet. Zie GIDS_HOUDING in
   * lib/agent.js voor wat hij te horen krijgt.
   *
   * Het tabblad gaat als getal mee in de opdracht en wordt niet door de agent
   * gekozen. Anders zou "wijs eens aan waar ik dit uitzet" kunnen landen op
   * een ander tabblad dan het tabblad waar de gebruiker naar keek toen hij het
   * vroeg.
   */
  async startGids(vraag) {
    const tekst = String(vraag ?? '').trim();
    if (!tekst) return;

    const id = this.activeId;
    const gevonden = id === null ? null : this.zoekJouwTab(id);
    if (!gevonden) {
      this.sendIsland({ modus: 'actie', vraag: false, regel: 'Er staat geen pagina open om iets over te vragen.', bezig: false });
      return;
    }

    // Een privétabblad bestaat niet voor een client, en de gids is er een.
    const bezwaar = this.priveBezwaar(id);
    if (bezwaar) {
      this.sendIsland({ modus: 'actie', vraag: false, regel: bezwaar, bezig: false });
      return;
    }

    // Onze eigen pagina's zijn geen website: er valt niets aan te wijzen dat
    // de gebruiker niet al ziet.
    const url = gevonden.view.webContents.getURL();
    if (beoordeelURL(url, EIGEN_BASIS) !== 'web') {
      this.sendIsland({ modus: 'actie', vraag: false, regel: 'De gids werkt op een website, niet op een pagina van de browser zelf.', bezig: false });
      return;
    }

    this.stopAgent(false);

    const rug = this.kiesRug();
    if (rug.soort === 'geen') {
      this.sendIsland({ modus: 'actie', vraag: false, regel: rug.reden, bezig: false });
      if (rug.reden.includes('auth login')) this.vraagAanmelding();
      return;
    }

    const opdracht = [
      `De gebruiker kijkt naar pagina ${id}: ${gevonden.titel || gevonden.host} (${url}).`,
      `Zijn vraag is: ${tekst}`,
      `Bekijk die pagina en wijs het antwoord aan. Gebruik pagina ${id}, geen andere.`,
    ].join(' ');

    const naam = rug.soort === 'agent' ? rug.agent.naam : 'De gids';
    this.agent = { naam, wsId: this.activeWorkspaceId, opdracht: tekst, loop: null, gids: id, rug: rug.soort };
    this.sendIsland({ modus: 'debuggen', regel: `${naam} kijkt naar deze pagina`, bezig: true });

    this.agent.loop = await this.startRonde(rug, {
      opdracht,
      gereedschap: GIDS_GEREEDSCHAP,
      houding: GIDS_HOUDING,
      // De grendel, niet de instructie. Zie beperkTot() in lib/mcp.js.
      beperk: true,
    });

    this.pushState();
  }

  /** Opnieuw kijken of er inmiddels een agent staat, en of hij is aangemeld. */
  zoekAgentOpnieuw() {
    this.agentGevonden = zoekAgent();
    this.vraagAanmelding();
    this.pushState();
    return this.agentGevonden?.naam ?? null;
  }

  /** Op de achtergrond: is hij aangemeld? Kost geen tokens. */
  vraagAanmelding() {
    if (!this.agentGevonden) {
      this.agentAangemeld = null;
      return;
    }
    vraagAanmelding(this.agentGevonden).then((uit) => {
      if (this.win.isDestroyed()) return;
      this.agentAangemeld = uit ? uit.aangemeld : null;
      this.pushState();
    });
  }

  /**
   * Een lege map om de agent in te starten.
   *
   * Leeg met opzet: zo vindt hij geen CLAUDE.md en geen project om iets mee te
   * bedoelen. Hij gaat hier over het web, niet over een map met code.
   */
  agentWerkmap() {
    const map = path.join(app.getPath('userData'), 'agent-werkmap');
    try {
      fs.mkdirSync(map, { recursive: true });
      return map;
    } catch {
      return undefined;
    }
  }

  /** Wat de agent onderweg meldt, vertaald naar één regel in de balk. */
  agentMelding(melding) {
    if (!this.agent) return;
    const naam = this.agent.naam;

    if (melding.soort === 'begin') {
      this.sendIsland({ modus: 'debuggen', regel: `${naam} denkt na`, bezig: true });
      return;
    }
    // Zijn eigen zin over aanmelden verwijst naar een scherm dat hier niet
    // bestaat. Vertalen naar de stap die hier wél helpt.
    if (NIET_AANGEMELD.test(melding.tekst ?? '')) {
      this.agentAangemeld = false;
      this.sendIsland({ modus: 'actie', vraag: false, regel: 'Claude Code is nog niet aangemeld. Voer eenmalig "claude auth login" uit.', bezig: false });
      return;
    }
    if (melding.soort === 'zegt') {
      this.sendIsland({ modus: 'analyseren', regel: kortRegel(melding.tekst), bezig: true });
      return;
    }
    if (melding.soort === 'doet') {
      // Dezelfde woorden als in het logboek van de MCP-deur. Twee manieren om
      // hetzelfde te beschrijven is er één te veel.
      this.sendIsland({
        modus: AGENT_MODUS[melding.naam] ?? 'analyseren',
        regel: kortRegel(beschrijf(melding.naam, melding.invoer ?? {})),
        bezig: true,
      });
      return;
    }
    if (melding.soort === 'mislukt') {
      this.sendIsland({
        modus: 'actie', vraag: false, regel: kortRegel(`Dat lukte niet: ${melding.tekst}`), bezig: true,
      });
      return;
    }
    if (melding.soort === 'klaar' || melding.soort === 'fout') {
      // Een gidsronde werkte op jouw eigen tabblad; daar valt niets mee te
      // kijken in de workspace van de client, want die is niet gebruikt.
      const waar = !this.agent.gids && this.workspaces.get(this.agent.wsId)
        ? ', kijk mee in AI-client' : '';
      // En als er iets is aangewezen hoor je te weten hoe het weer weggaat,
      // precies op het moment dat het er staat.
      const esc = this.agent.gids && this.gewezenTab !== null ? ' · Esc haalt de aanwijzing weg' : '';
      this.sendIsland({
        modus: melding.soort === 'klaar' ? 'klaar' : 'actie',
        vraag: false,
        regel: kortRegel(`${melding.tekst || (melding.soort === 'klaar' ? `Klaar${waar}` : 'Het ging mis')}${esc}`),
        bezig: false,
      });
      return;
    }
    if (melding.soort === 'afgelopen') this.agentAfgelopen();
  }

  /**
   * "Ga door" in de balk: ja zeggen tegen de vraag die openstaat.
   *
   * Dezelfde vraag staat uitgebreider in de zijbalk. Hier kun je hem
   * beantwoorden zonder weg te kijken van waar je al naar keek.
   */
  resumeAgent() {
    const vraag = this.toestemming.stand().open;
    if (vraag) this.toestemming.antwoord(vraag.id, true);
  }

  /** Het kindproces is weg: deur dicht als wij hem openden, werk laten staan. */
  agentAfgelopen() {
    this.agent = null;
    // Wat de gids op het scherm zette blijft staan — daar was het om begonnen.
    // Alleen de grendel gaat eraf.
    this.mcp.beperkTot(null);
    if (!this.deurWasOpen && this.mcp.aan) {
      // De workspace blijft. Wat jij hebt laten opzoeken wil je nog lezen, en
      // die sessie staat toch niet op schijf.
      this.mcp.sluit('de opdracht is klaar', { behoudWerkruimte: true });
    }
    this.pushState();
  }
  // Het tabblad blijft staan; alleen de assistent laat het los. Wat hij heeft
  // opgezocht wil je immers nog kunnen lezen.
  stopAgent(afgemaakt) {
    const loop = this.agent?.loop;
    this.agent = null;
    // Het kindproces én wat hij zelf startte. Zonder dat blijft de brug als wees
    // achter en praat er nog iets tegen een deur die dicht hoort te gaan.
    if (loop) loop.stop();
    // Een vraag die openstond hoort niet te blijven hangen als de assistent al
    // gestopt is; dan sta je te antwoorden op iets dat niemand meer opvangt.
    if (this.toestemming.stand().open) this.toestemming.breekAf('de assistent is gestopt');
    if (!afgemaakt) this.sendIsland({ modus: 'rust', regel: '', bezig: false });
    if (loop) this.agentAfgelopen();
    else this.pushState();
  }

  // --- sneltoetsacties -------------------------------------------------

  // De zijbalk is een aparte renderer; alleen het hoofdproces kan hem de focus
  // geven, dus Ctrl+L en Ctrl+K lopen hierlangs.
  vraagZijbalk(wat) {
    if (this.win.isDestroyed()) return;
    this.win.webContents.focus();
    this.send('ui:open', wat);
  }

  /* ── Zoeken op de pagina ────────────────────────────────────────────
   *
   * `findInPage` telt en markeert; wij geven alleen door en sturen de telling
   * terug. Drie dingen die niet vanzelf gaan en hier dus staan:
   *
   *   · De telling komt asynchroon terug op `found-in-page`, per tabblad. De
   *     luisteraar hangt daarom aan de webContents van het tabblad en niet
   *     aan het venster, en hij wordt bij het volgende tabblad niet opnieuw
   *     aangehangen — vandaar de vlag.
   *   · `findNext` staat hier altijd aan, en "begin opnieuw" zeggen we met
   *     een `stopFindInPage` ervoor. Dat is niet hetzelfde als `findNext:
   *     false`: die vlag vraagt Chromium om een nieuwe telronde binnen een
   *     lopende sessie, en die ronde komt er in een venster dat niet echt op
   *     een scherm staat soms niet — geen telling, geen markering, geen
   *     fout. Een sessie afbreken en een nieuwe beginnen doet hetzelfde en
   *     doet het altijd. `test/zoeken.js` legt beide vast.
   *   · Een zoekterm blijft anders in de pagina gemarkeerd staan nadat het
   *     veld dicht is. `stopFindInPage('clearSelection')` is wat dat opruimt,
   *     en het moet ook lopen als je van tabblad wisselt.
   */
  zoekOpPagina(term, opties = {}) {
    const view = this.tabs.get(this.activeId);
    if (!view || view.webContents.isDestroyed()) return;
    const wc = view.webContents;

    const tekst = String(term ?? '');
    if (!tekst) return this.stopZoeken();

    if (!wc.__zoekLuistert) {
      wc.__zoekLuistert = true;
      wc.on('found-in-page', (_e, uitslag) => {
        this.send('zoek:uitslag', {
          treffers: uitslag.matches,
          welke: uitslag.activeMatchOrdinal,
        });
      });
    }

    // Een andere zoekterm dan de vorige is per definitie een nieuwe sessie:
    // anders zou de teller doorlopen op een woord dat er niet meer staat.
    const opnieuw = opties.volgende !== true || tekst !== this.zoekTerm;
    if (opnieuw) wc.stopFindInPage('clearSelection');

    this.zoekTerm = tekst;
    wc.findInPage(tekst, {
      findNext: true,
      forward: opties.terug !== true,
      matchCase: false,
    });
  }

  stopZoeken(opties = {}) {
    this.zoekTerm = '';
    for (const ws of this.workspaces.values()) {
      for (const view of ws.tabs.values()) {
        if (view.webContents.isDestroyed()) continue;
        view.webContents.stopFindInPage('clearSelection');
      }
    }
    this.send('zoek:uitslag', { treffers: 0, welke: 0, dicht: opties.dicht === true });
  }

  heropenTab() {
    const laatste = this.gesloten.pop();
    if (!laatste) return;
    const ws = this.workspaces.get(laatste.wsId) ?? this.workspace;
    this.createTab(laatste.url || NEWTAB, ws, { owner: laatste.owner });
  }

  // Zoomniveaus zijn logaritmisch: elke stap van 0,5 is ongeveer 20% erbij.
  // Chromium klemt zelf al, maar niet op een prettig bereik.
  zoom(stap, terug = false) {
    const wc = this.activeWebContents;
    if (!wc) return;
    wc.setZoomLevel(terug ? 0 : Math.max(-4, Math.min(6, wc.getZoomLevel() + stap)));
  }

  // --- navigatie -------------------------------------------------------

  // Wat de knoppen bovenin bedienen. Staat de werkbank open, dan is dát wat je
  // ziet, dus daar horen terug en vooruit ook heen te gaan.
  get activeWebContents() {
    if (this.werkbankOpen && this.werkbank) return this.werkbank.webContents;
    return this.tabs.get(this.activeId)?.webContents;
  }

  go(input) {
    // Geen return: de promise van loadURL rejecteert bij een afgebroken
    // navigatie, en dat hoort niet bij de renderer terecht te komen.
    this.activeWebContents?.loadURL(toURL(input));
  }

  back() {
    const wc = this.activeWebContents;
    if (wc?.navigationHistory.canGoBack()) wc.navigationHistory.goBack();
  }

  forward() {
    const wc = this.activeWebContents;
    if (wc?.navigationHistory.canGoForward()) wc.navigationHistory.goForward();
  }

  reload() {
    this.activeWebContents?.reload();
  }
}

// Alleen de host, want dat is wat je wilt zien bij een vraag: niet het hele
// adres met zijn parameters, maar waar het heen gaat.
function hostVan(url) {
  try {
    return new URL(url).host;
  } catch {
    return '';
  }
}

// --- adresbalk ---------------------------------------------------------

function toURL(input) {
  // Lege invoer betekent hier: geef me een leeg tabblad.
  return naarZoekURL(input, zoekmachine()) ?? NEWTAB;
}

// --- IPC ---------------------------------------------------------------

// De registry kent de webContents van de zijbalk én die van de balk bovenin;
// dat zijn de enige twee met een preload. Tabbladen zijn sandboxed views zonder
// preload en sturen dus nooit op deze kanalen, waardoor dit sluitend is.
function controllerFor(event) {
  return windows.get(event.sender.id) ?? null;
}

/**
 * Ook een tabblad terugvinden bij zijn venster.
 *
 * Het register kent alleen de zijbalk en de balk; een pagina staat er niet in.
 * Voor alles wat uit een pagina komt moeten we dus zoeken. Dat is een lus over
 * een handvol vensters en een handvol tabbladen, en dat mag: het gebeurt één
 * keer per muisklik, niet per beeldje.
 */
function controllerVanLaag(event) {
  const direct = windows.get(event.sender.id);
  if (direct) return direct;
  for (const ctrl of new Set(windows.values())) {
    for (const view of ctrl.allViews()) {
      if (view.webContents === event.sender) return ctrl;
    }
    if (ctrl.werkbank?.webContents === event.sender) return ctrl;
  }
  return null;
}

ipcMain.handle('tab:new', (e, url) => controllerFor(e)?.createTab(url ? toURL(url) : NEWTAB));
ipcMain.handle('tab:close', (e, id) => controllerFor(e)?.closeTab(id));
ipcMain.handle('tab:activate', (e, id) => controllerFor(e)?.activateTab(id));
ipcMain.handle('tab:heropen', (e) => controllerFor(e)?.heropenTab());
ipcMain.handle('zoek:doe', (e, term, opties) => controllerFor(e)?.zoekOpPagina(term, opties));
ipcMain.handle('zoek:stop', (e) => controllerFor(e)?.stopZoeken());

// Downloads. De lijst is van het programma en niet van een venster, dus deze
// hoeven het venster niet te weten — behalve de eerste, die een nieuw
// geopende zijbalk bijpraat over wat er al liep.
ipcMain.handle('downloads:lijst', () => downloads.lijst());
ipcMain.handle('downloads:pauzeer', (_e, id) => downloads.pauzeer(Number(id)));
ipcMain.handle('downloads:stop', (_e, id) => downloads.stop(Number(id)));
ipcMain.handle('downloads:open', (_e, id) => downloads.open(Number(id)));
ipcMain.handle('downloads:toon', (_e, id) => downloads.toon(Number(id)));
ipcMain.handle('downloads:wis', () => downloads.wis());
ipcMain.handle('downloads:wis-een', (_e, id) => downloads.wisEen(Number(id)));

// Geschiedenis. Ook deze lijst is van het programma en niet van een venster.
ipcMain.handle('gesch:zoek', (_e, opties) => geschiedenis.zoek(opties?.term ?? '', Number(opties?.limiet) || 60));
ipcMain.handle('gesch:verwijder', (_e, id) => geschiedenis.verwijder(id));
ipcMain.handle('gesch:verwijder-host', (_e, host) => geschiedenis.verwijderHost(String(host)));
ipcMain.handle('gesch:wis', () => geschiedenis.wis());

// De API-sleutel van de gebruiker. Alleen naar binnen: naar buiten gaat
// `heeft()`, en dat is een ja of een nee met vier tekens eraan.
ipcMain.handle('sleutel:zet', (e, waarde) => {
  const uit = sleutel.zet(waarde);
  controllerFor(e)?.pushState();
  return { ...uit, ...sleutel.heeft() };
});
ipcMain.handle('sleutel:stand', () => sleutel.heeft());
ipcMain.handle('sleutel:wis', (e) => {
  sleutel.wis();
  controllerFor(e)?.pushState();
  return sleutel.heeft();
});
ipcMain.handle('app:aanmelden', (e) => controllerFor(e)?.gaAanmelden());
ipcMain.handle('agent:zoek', (e) => controllerFor(e)?.zoekAgentOpnieuw());

/*
 * De gids, voorlopig alleen om aan te zetten vanuit de console van de zijbalk.
 *
 * Er staat nog geen knop en geen sneltoets op: dit is de onderkant, en die is
 * af voordat er iets bovenop komt. Wat het al wél kan is de hele reden dat het
 * bestaat — vraag `browser.gids.snapshot()` en je krijgt te zien wat een
 * assistent van de pagina zou zien, inclusief wat er níét in staat.
 *
 * De vorm is met opzet die van de latere aanroepen: een tabblad-id dat weg mag
 * blijven voor "het tabblad waar ik nu naar kijk". Zie lib/gids/brug.js.
 */
const gidsBrug = (ctrl, tabId) => {
  if (!ctrl) return null;
  const view = tabId == null ? ctrl.tabs.get(ctrl.activeId) : ctrl.tabs.get(Number(tabId));
  return view ? brugVoor(view.webContents) : null;
};

ipcMain.handle('gids:snapshot', async (e, tabId) =>
  (await gidsBrug(controllerFor(e), tabId)?.snapshot()) ?? { status: 'geen tabblad' });
ipcMain.handle('gids:zoek', async (e, ref, tabId) =>
  (await gidsBrug(controllerFor(e), tabId)?.zoek(ref)) ?? { status: 'geen tabblad' });
ipcMain.handle('gids:scroll', async (e, ref, tabId) =>
  (await gidsBrug(controllerFor(e), tabId)?.scrollNaar(ref)) ?? { status: 'geen tabblad' });

// Een veeg komt uit de pagina zelf; zie renderer/tabblad-preload.js. Geen
// handle maar send: er valt niets terug te melden en de pagina hoeft niet te
// weten of het iets deed.
ipcMain.on('gebaar:veeg', (e, maat) => controllerVanLaag(e)?.veegBinnen(maat));

ipcMain.handle('nav:go', (e, input) => {
  controllerFor(e)?.go(input);
});
ipcMain.handle('nav:back', (e) => controllerFor(e)?.back());
ipcMain.handle('nav:forward', (e) => controllerFor(e)?.forward());
ipcMain.handle('nav:reload', (e) => controllerFor(e)?.reload());

ipcMain.handle('ws:new', (e, name, opties) => controllerFor(e)?.createWorkspace(name, opties ?? {}));
ipcMain.handle('tab:buur', (e, id) => controllerFor(e)?.zetBuur(id));
ipcMain.handle('ws:palet', (e, id, palet) => controllerFor(e)?.zetWorkspacePalet(id, palet));
ipcMain.handle('ws:beweging', (e, id, beweging) => controllerFor(e)?.zetWorkspaceBeweging(id, beweging));
ipcMain.handle('sessie:leg-weg', (e, wsId) => controllerFor(e)?.legWeg(wsId));
ipcMain.handle('sessie:haal-terug', (e, id) => controllerFor(e)?.haalTerug(id));
ipcMain.handle('sessie:gooi-weg', (e, id) => controllerFor(e)?.gooiSessieWeg(id));
ipcMain.handle('sessie:hernoem', (e, id, naam) => controllerFor(e)?.hernoemSessie(id, naam));
ipcMain.handle('ws:activate', (e, id) => controllerFor(e)?.activateWorkspace(id));
ipcMain.handle('ws:close', (e, id) => controllerFor(e)?.closeWorkspace(id));
ipcMain.handle('ws:rename', (e, id, name) => controllerFor(e)?.renameWorkspace(id, name));

ipcMain.handle('ui:palette', (e, open) => controllerFor(e)?.setPaletteOpen(open));
ipcMain.handle('ui:paneel', (e, naam) => controllerFor(e)?.zetPaneel(naam));
ipcMain.handle('tab:demp', (e, id, gedempt) => controllerFor(e)?.dempTab(id, gedempt));
ipcMain.handle('mcp:zet', (e, aan) => controllerFor(e)?.zetMcp(aan));
ipcMain.handle('mcp:noodstop', (e) => controllerFor(e)?.mcpNoodstop());
ipcMain.handle('toestemming:antwoord', (e, id, goed) => controllerFor(e)?.toestemming.antwoord(id, goed));
ipcMain.handle('ui:werkbank-ga', (e, pad) => controllerFor(e)?.gaWerkbank(pad));
ipcMain.handle('ui:werkbank', (e, open) => {
  const ctrl = controllerFor(e);
  if (!ctrl) return;
  if (open === undefined) ctrl.wisselWerkbank();
  else ctrl.zetWerkbank(open);
});

ipcMain.handle('pref:get', () => voorkeuren.alles());
ipcMain.handle('pref:set', (_e, sleutel, waarde) => {
  const nieuw = voorkeuren.zet(sleutel, waarde);
  // Alle vensters bijwerken, niet alleen het venster dat het vroeg: een
  // instelling is van de app, en er kunnen er meer open staan.
  for (const ctrl of new Set(windows.values())) ctrl.send('pref:changed', nieuw);
  return nieuw;
});

ipcMain.handle('ui:sidebar', (e, weg) => controllerFor(e)?.setZijbalkWeg(weg));

// Het ontwerp tekent de vensterknoppen zelf, dus die moeten hierlangs.
ipcMain.handle('win:minimize', (e) => controllerFor(e)?.win.minimize());
ipcMain.handle('win:maximize', (e) => {
  const win = controllerFor(e)?.win;
  if (!win) return false;
  if (win.isMaximized()) win.unmaximize();
  else win.maximize();
  return win.isMaximized();
});
ipcMain.handle('win:close', (e) => controllerFor(e)?.win.close());

ipcMain.handle('island:size', (e, w, h) => controllerFor(e)?.setIslandSize(w, h));
ipcMain.handle('island:assign', (e, tekst) => controllerFor(e)?.startAgent(tekst));
// Een vraag over de pagina waar je naar kijkt. Een ander kanaal en niet een
// vlag op het vorige: het is een andere handeling met andere grenzen, en een
// kanaal dat twee dingen doet is er een die je moet lezen om te weten wat hij
// doet.
ipcMain.handle('island:vraag', (e, tekst) => controllerFor(e)?.startGids(tekst));
ipcMain.handle('island:stop', (e) => controllerFor(e)?.stopAgent(false));
ipcMain.handle('island:resume', (e) => controllerFor(e)?.resumeAgent());
ipcMain.handle('island:focus', (e) => controllerFor(e)?.focusIsland());

// --- app lifecycle -----------------------------------------------------

app.whenReady().then(() => {
  // Voorkeuren eerst: die zetten het thema, en dat moet staan vóórdat er een
  // venster tekent — anders zie je hem omklappen.
  voorkeuren.laad();

  // Dan grendelen, en pas daarna een venster. De standaardsessie wordt gebruikt
  // door alles wat geen eigen partitie heeft, waaronder de zijbalk en de balk.
  downloads.bewaak(grendelSessie(null));

  // Waar bestanden landen. De map van het systeem, zoals elke browser: het
  // "opslaan als"-venster is wat je doet als je niet weet waar iets heen moet.
  downloads.map = app.getPath('downloads');

  geschiedenis.laad();

  // De standaardmenubalk van Electron (File/Edit/View) hoort niet bij deze UI.
  // Op macOS blijft hij staan, anders verdwijnen ook Cmd+Q en Cmd+H.
  if (!isMac) Menu.setApplicationMenu(null);

  new BrowserWindowController();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) new BrowserWindowController();
  });
});

// Een uitgestelde schrijfactie mag niet met de app mee verdwijnen.
app.on('before-quit', () => {
  for (const ctrl of new Set(windows.values())) ctrl.agent?.loop?.stop();
  voorkeuren.flush();
  herstel.flush();
  geschiedenis.flush();
});

app.on('window-all-closed', () => {
  if (!isMac) app.quit();
});
