// Het menu onder de rechtermuisknop.
//
// ─────────────────────────────────────────────────────────────────────────
// WAAROM DIT EEN SYSTEEMMENU IS EN GEEN GLAZEN
//
// Niet uit gemak. Een pagina is in deze browser een WebContentsView: een native
// laag die over álles heen tekent wat de renderer maakt. Een menu dat wij zelf
// zouden tekenen valt daar dus onder, precies op de plek waar je rechts hebt
// geklikt. De enige uitwegen zijn de pagina wegnemen — wat de commandobalk doet
// en wat voor een contextmenu belachelijk is, je wilt juist zien waar je klikte
// — of er een extra native laag voor optuigen, zoals de balk van de assistent er
// een is. Dat laatste kan en is het uiteindelijke ontwerp, maar een browser
// zonder rechtermuisknop is kapot, en dit werkt vandaag.
//
// Wat het menu wél eigen maakt zijn twee regels die geen andere browser heeft:
// bewaren in je notitieblok, en openen in een privéworkspace.
// ─────────────────────────────────────────────────────────────────────────

const { Menu, clipboard } = require('electron');

// Lange selecties passen niet in een menuregel. Afkappen op een woordgrens leest
// beter dan hard afhakken midden in een woord.
function kort(tekst, max = 32) {
  const schoon = String(tekst ?? '').replace(/\s+/g, ' ').trim();
  if (schoon.length <= max) return schoon;
  const gehakt = schoon.slice(0, max);
  const spatie = gehakt.lastIndexOf(' ');
  return (spatie > max / 2 ? gehakt.slice(0, spatie) : gehakt) + '…';
}

/**
 * Hangt het menu aan een pagina.
 *
 * @param {import('electron').WebContents} wc
 * @param {object} ctrl  het venster waar deze pagina bij hoort
 * @param {object} hulp
 * @param {(tekst: string) => string} hulp.zoekURL
 * @param {(tekst: string) => void} hulp.bewaarInNotitie
 */
function bouwMenu(p, wc, ctrl, { zoekURL, bewaarInNotitie }) {
  {
    const items = [];
    const streep = () => {
      if (items.length && items[items.length - 1].type !== 'separator') items.push({ type: 'separator' });
    };

    // ── Waar je op klikte ──────────────────────────────────────────────
    if (p.linkURL) {
      items.push(
        { label: 'Openen in nieuw tabblad', click: () => ctrl.createTab(p.linkURL, ctrl.workspace, { activeer: false }) },
        { label: 'Openen in privéworkspace', click: () => ctrl.openInPrive(p.linkURL) },
        { label: 'Link kopiëren', click: () => clipboard.writeText(p.linkURL) },
      );
    }

    if (p.mediaType === 'image' && p.srcURL) {
      streep();
      items.push(
        { label: 'Afbeelding openen in nieuw tabblad', click: () => ctrl.createTab(p.srcURL, ctrl.workspace, { activeer: false }) },
        { label: 'Afbeelding kopiëren', click: () => wc.copyImageAt(p.x, p.y) },
        { label: 'Adres van afbeelding kopiëren', click: () => clipboard.writeText(p.srcURL) },
      );
    }

    if (p.selectionText) {
      streep();
      items.push(
        { label: 'Kopiëren', role: 'copy' },
        { label: `Zoeken naar "${kort(p.selectionText)}"`, click: () => ctrl.createTab(zoekURL(p.selectionText), ctrl.workspace, { activeer: false }) },
        // De regel die van dit menu iets van deze browser maakt: wat je leest
        // gaat met één klik naar je eigen notitieblok, zonder een tabblad te
        // verlaten en zonder ergens te plakken.
        { label: 'Bewaren in je notitie', click: () => bewaarInNotitie(p.selectionText) },
      );
    }

    if (p.isEditable) {
      streep();
      items.push(
        { label: 'Ongedaan maken', role: 'undo', enabled: p.editFlags.canUndo },
        { label: 'Opnieuw', role: 'redo', enabled: p.editFlags.canRedo },
        { type: 'separator' },
        { label: 'Knippen', role: 'cut', enabled: p.editFlags.canCut },
        { label: 'Kopiëren', role: 'copy', enabled: p.editFlags.canCopy },
        { label: 'Plakken', role: 'paste', enabled: p.editFlags.canPaste },
        { label: 'Alles selecteren', role: 'selectAll' },
      );
    }

    // ── De pagina zelf ────────────────────────────────────────────────
    streep();
    items.push(
      { label: 'Terug', enabled: wc.navigationHistory.canGoBack(), click: () => wc.navigationHistory.goBack() },
      { label: 'Vooruit', enabled: wc.navigationHistory.canGoForward(), click: () => wc.navigationHistory.goForward() },
      { label: 'Opnieuw laden', click: () => wc.reload() },
    );

    if (!p.selectionText && !p.isEditable) {
      items.push({ label: 'Adres van deze pagina kopiëren', click: () => clipboard.writeText(wc.getURL()) });
    }

    streep();
    items.push({ label: 'Inspecteren', click: () => wc.inspectElement(p.x, p.y) });

    return items;
  }
}

function hangMenu(wc, ctrl, hulp) {
  wc.on('context-menu', (_e, p) => {
    const items = bouwMenu(p, wc, ctrl, hulp);

    // De coördinaten uit deze gebeurtenis gaan over de pagina, en popup() wil ze
    // over het venster. Zonder dit verschil komt het menu linksboven uit in
    // plaats van waar je klikte.
    const vlak = ctrl.paginaBounds();
    Menu.buildFromTemplate(items).popup({
      window: ctrl.win,
      x: Math.round(p.x + (vlak?.x ?? 0)),
      y: Math.round(p.y + (vlak?.y ?? 0)),
    });
  });
}

module.exports = { hangMenu, bouwMenu, kort };
