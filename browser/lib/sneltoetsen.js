'use strict';

/*
 * Alle sneltoetsen op één plek: wat ze doen én wat het scherm erover zegt.
 *
 * Deze map hoorde er altijd al te zijn — zie ROUTEKAART §1.3 — en de reden om
 * hem nu te maken is dat er een tweede lezer bij kwam: het lijstje in de
 * instellingen. Een browser die zijn sneltoetsen in een tabel opsomt en ze
 * ergens anders afhandelt, somt vroeg of laat een toets op die niets meer
 * doet, en dat merk je pas als iemand hem probeert.
 *
 * Wat hier níét in zit: het venster zelf. `hulp.nieuwVenster` komt van buiten,
 * zodat dit bestand niets van main.js hoeft te weten en een reeks het zonder
 * Electron kan uitproberen.
 */

/*
 * Ze hangen op élke webContents die het venster maakt, want een pagina is een
 * eigen webContents met eigen toetsafhandeling: daarvoor deden Ctrl+T en
 * Ctrl+W niets zodra je in een pagina had geklikt. `preventDefault` houdt ze
 * weg bij de renderer, zodat niemand dezelfde toets twee keer afhandelt.
 */
const SNELTOETSEN = [
  { toets: 't', wat: 'Nieuw tabblad', doe: (ctrl) => ctrl.createTab() },
  { toets: 'w', wat: 'Tabblad sluiten', doe: (ctrl) => ctrl.closeTab(ctrl.activeId) },
  {
    toets: 't', shift: true, wat: 'Laatst gesloten tabblad terug',
    doe: (ctrl) => ctrl.heropenTab(),
  },
  {
    // Dezelfde beweging één maat groter. Een venster sluiten is één klik en
    // twintig tabbladen terugzoeken zijn er twintig.
    toets: 'n', shift: true, wat: 'Laatst gesloten venster terug',
    doe: (_ctrl, hulp) => hulp.heropenVenster(),
  },
  {
    // Leeg, met één workspace: Ctrl+N hoort je tabbladen niet te verdubbelen.
    toets: 'n', wat: 'Nieuw venster',
    doe: (_ctrl, hulp) => hulp.nieuwVenster(),
  },
  { toets: 'l', wat: 'Naar de adresbalk', doe: (ctrl) => ctrl.vraagZijbalk('adres') },
  { toets: 'k', wat: 'Commandobalk', doe: (ctrl) => ctrl.vraagZijbalk('palet') },
  {
    // Niet een strook over de pagina: die pagina is een native laag en tekent
    // over elke overlay heen, en een tweede doorzichtige view voor één
    // invoerveld is een hoop machinerie voor iets dat in het chroom thuishoort.
    // Deze browser zet zijn tabbladen, zijn adres en zijn workspaces al in de
    // zijbalk.
    toets: 'f', wat: 'Zoeken op deze pagina', doe: (ctrl) => ctrl.vraagZijbalk('zoek'),
  },
  {
    // Geen eigen scherm: deze browser heeft één plek waar je typt, en die kan
    // meer dan een adres.
    toets: 'h', wat: 'Geschiedenis', doe: (ctrl) => ctrl.vraagZijbalk('geschiedenis'),
  },
  { toets: 'j', wat: 'Opdracht geven', doe: (ctrl) => ctrl.focusIsland() },
  {
    // De gids: een vraag over de pagina waar je nu naar kijkt. Dezelfde balk
    // als een opdracht, met een andere vraag erin.
    toets: 'g', shift: true, wat: 'Vraag over deze pagina',
    doe: (ctrl) => ctrl.focusIsland('gids'),
  },
  {
    // Ctrl+J is hier al de balk bovenin, dus downloads krijgen de toets
    // ernaast. Verder wijst de lijst zichzelf aan: hij klapt open zodra er
    // iets binnenkomt.
    toets: 'j', shift: true, wat: 'Downloads', doe: (ctrl) => ctrl.vraagZijbalk('downloads'),
  },
  { toets: 'o', shift: true, wat: 'Tougather openen', doe: (ctrl) => ctrl.wisselWerkbank() },
  { toets: 'r', wat: 'Herladen', doe: (ctrl) => ctrl.reload() },
  { toets: '=', wat: 'Inzoomen', doe: (ctrl) => ctrl.zoom(0.5) },
  { toets: '+', stil: true, doe: (ctrl) => ctrl.zoom(0.5) },
  { toets: '-', wat: 'Uitzoomen', doe: (ctrl) => ctrl.zoom(-0.5) },
  { toets: '0', wat: 'Zoom terug naar normaal', doe: (ctrl) => ctrl.zoom(0, true) },
];

/** Hoe een toets heet op dit systeem. Op een Mac is Ctrl niet de toets. */
function toetsNaam(regel, isMac) {
  const namen = { '=': '+', '-': '−', 0: '0' };
  const letter = namen[regel.toets] ?? regel.toets.toUpperCase();
  return `${isMac ? '⌘' : 'Ctrl'}${regel.shift ? ' ⇧' : ''} ${letter}`;
}

/** Wat het scherm erover mag zeggen. Zonder de varianten die hetzelfde doen. */
function sneltoetsLijst(isMac) {
  const uit = SNELTOETSEN.filter((r) => !r.stil)
    .map((r) => ({ toets: toetsNaam(r, isMac), wat: r.wat }));
  // Twee die geen letter hebben en dus niet in de tabel passen, maar die je
  // wél hoort te kennen.
  uit.push({ toets: `${isMac ? '⌘' : 'Ctrl'} 1–9`, wat: 'Naar de zoveelste workspace' });
  uit.push({ toets: 'F12', wat: 'Ontwikkelaarsgereedschap' });
  uit.push({ toets: 'Esc', wat: 'Aanwijzing van de gids weghalen' });
  return uit;
}

function bindSneltoetsen(wc, ctrl, hulp = {}) {
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

    const regel = SNELTOETSEN.find(
      (r) => r.toets === toets && Boolean(r.shift) === Boolean(input.shift),
    );
    if (regel) {
      e.preventDefault();
      regel.doe(ctrl, hulp);
      return;
    }
    if (input.shift) return;

    // Ctrl+1 tot Ctrl+9 springt naar de zoveelste workspace. Een reeks en geen
    // toets, dus die past niet in de lijst hierboven.
    if (toets >= '1' && toets <= '9') {
      const ws = [...ctrl.workspaces.values()][Number(toets) - 1];
      if (ws) {
        e.preventDefault();
        ctrl.activateWorkspace(ws.id);
      }
    }
  });
}


module.exports = { SNELTOETSEN, toetsNaam, sneltoetsLijst, bindSneltoetsen };
