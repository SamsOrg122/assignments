const { contextBridge, ipcRenderer } = require('electron');

// Bewust een kleine, expliciete API. De UI krijgt geen toegang tot ipcRenderer zelf.
contextBridge.exposeInMainWorld('browser', {
  newTab: (url) => ipcRenderer.invoke('tab:new', url),
  closeTab: (id) => ipcRenderer.invoke('tab:close', id),
  heropenTab: () => ipcRenderer.invoke('tab:heropen'),
  zoekOpPagina: (term, opties) => ipcRenderer.invoke('zoek:doe', term, opties),
  stopZoeken: () => ipcRenderer.invoke('zoek:stop'),
  gaAanmelden: () => ipcRenderer.invoke('app:aanmelden'),
  zoekAgent: () => ipcRenderer.invoke('agent:zoek'),
  veeg: (maat) => ipcRenderer.send('gebaar:veeg', maat),
  activateTab: (id) => ipcRenderer.invoke('tab:activate', id),

  go: (input) => ipcRenderer.invoke('nav:go', input),
  back: () => ipcRenderer.invoke('nav:back'),
  forward: () => ipcRenderer.invoke('nav:forward'),
  reload: () => ipcRenderer.invoke('nav:reload'),

  newWorkspace: (name) => ipcRenderer.invoke('ws:new', name),
  newPriveWorkspace: () => ipcRenderer.invoke('ws:new', null, { prive: true }),

  // Een workspace wegleggen en later terughalen. Wegleggen sluit hem ook: het
  // punt is dat je hem kwijt kunt zonder hem te verliezen.
  legWeg: (wsId) => ipcRenderer.invoke('sessie:leg-weg', wsId),
  haalTerug: (id) => ipcRenderer.invoke('sessie:haal-terug', id),
  gooiSessieWeg: (id) => ipcRenderer.invoke('sessie:gooi-weg', id),
  hernoemSessie: (id, naam) => ipcRenderer.invoke('sessie:hernoem', id, naam),
  activateWorkspace: (id) => ipcRenderer.invoke('ws:activate', id),
  closeWorkspace: (id) => ipcRenderer.invoke('ws:close', id),
  renameWorkspace: (id, name) => ipcRenderer.invoke('ws:rename', id, name),

  // Het uiterlijk van één workspace: welk palet erachter beweegt en hoe hard.
  zetWorkspacePalet: (id, palet) => ipcRenderer.invoke('ws:palet', id, palet),
  zetWorkspaceBeweging: (id, beweging) => ipcRenderer.invoke('ws:beweging', id, beweging),

  // De commandobalk moet de pagina even kunnen wegnemen, anders tekent die
  // native kindview er dwars overheen.
  setPaletteOpen: (open) => ipcRenderer.invoke('ui:palette', open),

  // De werkbank is de Tougather-app als eigen laag. Zonder argument wisselt hij.
  wisselWerkbank: () => ipcRenderer.invoke('ui:werkbank'),
  zetWerkbank: (open) => ipcRenderer.invoke('ui:werkbank', open),
  gaWerkbank: (pad) => ipcRenderer.invoke('ui:werkbank-ga', pad),

  // De panelen onder de bovenbalk. Dezelfde naam nog eens sluit hem weer.
  zetPaneel: (naam) => ipcRenderer.invoke('ui:paneel', naam),

  // Een tabblad stilzetten zonder ernaartoe te gaan.
  dempTab: (id, gedempt) => ipcRenderer.invoke('tab:demp', id, gedempt),

  // Een tabblad naast het actieve zetten, of de splitsing opheffen.
  zetBuur: (id) => ipcRenderer.invoke('tab:buur', id),

  // De verbinding met een AI-client. De noodstop staat er los van, want die
  // moet werken ook als er verder niets meer reageert.
  zetMcp: (aan) => ipcRenderer.invoke('mcp:zet', aan),
  mcpNoodstop: () => ipcRenderer.invoke('mcp:noodstop'),
  antwoordToestemming: (id, goed) => ipcRenderer.invoke('toestemming:antwoord', id, goed),

  // De stand van de assistent, ook hier: de bovenbalk toont hem.
  onAssistent: (fn) => ipcRenderer.on('balk:assistent', (_e, stand) => fn(stand)),

  // De balk bovenin is een eigen laag; alleen het hoofdproces kan hem de focus
  // geven, dus dat loopt via hier.
  focusIsland: () => ipcRenderer.invoke('island:focus'),

  // Het ontwerp tekent de vensterknoppen zelf; alleen het hoofdproces kan het
  // venster bedienen.
  minimize: () => ipcRenderer.invoke('win:minimize'),
  maximize: () => ipcRenderer.invoke('win:maximize'),
  close: () => ipcRenderer.invoke('win:close'),
  setZijbalkWeg: (weg) => ipcRenderer.invoke('ui:sidebar', weg),

  voorkeuren: () => ipcRenderer.invoke('pref:get'),
  zetVoorkeur: (sleutel, waarde) => ipcRenderer.invoke('pref:set', sleutel, waarde),
  onVoorkeuren: (fn) => ipcRenderer.on('pref:changed', (_e, v) => fn(v)),

  // Sneltoetsen worden in het hoofdproces afgehandeld zodat ze ook werken als de
  // focus in een pagina ligt; dit is hoe die hier weer binnenkomen.
  onOpen: (fn) => ipcRenderer.on('ui:open', (_e, wat) => fn(wat)),
  // De telling van `findInPage` komt asynchroon terug, dus als bericht en
  // niet als antwoord op de aanroep.
  onZoekUitslag: (fn) => ipcRenderer.on('zoek:uitslag', (_e, u) => fn(u)),

  // De gids. Nog geen knop en geen sneltoets: dit is er om vanuit de console
  // te kunnen zien wat een assistent van een pagina zou zien.
  //
  //   await browser.gids.snapshot()
  //   await browser.gids.zoek('e9')
  //
  // Zonder tabId gaat het over het tabblad waar je nu naar kijkt.
  gids: {
    snapshot: (tabId) => ipcRenderer.invoke('gids:snapshot', tabId),
    zoek: (ref, tabId) => ipcRenderer.invoke('gids:zoek', ref, tabId),
    scroll: (ref, tabId) => ipcRenderer.invoke('gids:scroll', ref, tabId),
  },

  onState: (fn) => ipcRenderer.on('tabs:state', (_e, state) => fn(state)),
  onFavicon: (fn) => ipcRenderer.on('tabs:favicon', (_e, data) => fn(data)),
});
