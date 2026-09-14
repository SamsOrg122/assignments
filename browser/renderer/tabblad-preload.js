// Het enige dat in elke pagina meeloopt: kijken of je veegt.
//
// ─────────────────────────────────────────────────────────────────────────
// WAAROM DIT HIER MOET EN NIET IN HET HOOFDPROCES
//
// Het hoofdproces krijgt muisgebeurtenissen wél te zien, via 'input-event',
// maar die melding draagt alleen het soort — mouseDown, mouseUp — en geen
// coördinaten. Zonder coördinaten valt een veeg niet van een klik te
// onderscheiden. Ik heb dat eerst andersom gebouwd en het werkte niet, en dat
// staat hier zodat de volgende niet dezelfde middag kwijt is.
//
// Dus in de pagina, waar de muis wél een plaats heeft.
//
// WAT DIT NIET DOET
//
// Niets aan de pagina veranderen. De luisteraars vangen af in de capture-fase
// zodat een site ze niet kan wegnemen, maar ze roepen nooit preventDefault aan:
// tekst selecteren, slepen en klikken blijven precies doen wat ze deden.
//
// En er komt niets de pagina in. Geen contextBridge, geen globals. De pagina
// merkt hier niets van, en kan er dus ook niet mee sjoemelen.
//
// Er gaan alleen drie getallen naar buiten: hoe ver zijwaarts, hoe ver omhoog,
// hoeveel milliseconden. Geen adres, geen inhoud, geen plek op je scherm.
// ─────────────────────────────────────────────────────────────────────────

const { ipcRenderer } = require('electron');

let start = null;

addEventListener('pointerdown', (e) => {
  // Alleen de linkerknop, en alleen de aanwijzer waar je mee werkt. Een tweede
  // vinger of een tweede pen begint geen tweede veeg.
  if (e.button !== 0 || !e.isPrimary) {
    start = null;
    return;
  }
  // Schermcoördinaten: die blijven kloppen ook als de pagina onder je muis
  // scrollt of van maat verandert tijdens de veeg. En de tijd van de
  // gebeurtenis zelf, niet van dit moment: zie de kop van dit bestand.
  start = { x: e.screenX, y: e.screenY, t: e.timeStamp || Date.now() };
}, true);

addEventListener('pointerup', (e) => {
  const begin = start;
  start = null;
  if (!begin || e.button !== 0) return;
  ipcRenderer.send('gebaar:veeg', {
    dx: e.screenX - begin.x,
    dy: e.screenY - begin.y,
    ms: (e.timeStamp || Date.now()) - begin.t,
  });
}, true);

// Sleep je uit het venster, of pakt de pagina de aanwijzer af, dan is het geen
// veeg meer. Zonder dit telt terugkomen als het eind van iets dat je allang
// losgelaten had.
for (const soort of ['pointercancel', 'dragstart']) {
  addEventListener(soort, () => { start = null; }, true);
}
