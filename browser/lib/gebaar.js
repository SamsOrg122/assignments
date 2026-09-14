// Swipen tussen workspaces met de linkermuisknop.
//
// ─────────────────────────────────────────────────────────────────────────
// WAAROM DIT EEN TOESTANDSMACHINE IS EN GEEN PAAR IF-JES
//
// Een tabblad is een native laag; muisgebeurtenissen daarin komen als losse
// meldingen binnen in het hoofdproces en niet als een gebeurtenis met een
// begin en een eind. Wat "een swipe" is moet je dus zelf samenstellen uit
// ingedrukt, bewogen, losgelaten — en dan op de goede momenten vergeten.
//
// Het lastige is niet het herkennen maar het NIET herkennen. Op dezelfde plek
// sleept iemand tekst, een plaatje, een schuifbalk. Drie eisen samen houden die
// uit elkaar, en ze doen alle drie werk:
//
//   AFSTAND     Ver genoeg om niet per ongeluk te zijn.
//   RECHTUIT    Veel meer zijwaarts dan omhoog; tekst selecteren over meerdere
//               regels loopt schuin, een swipe niet.
//   SNEL        Binnen zeven tienden van een seconde. Dit is het verschil dat
//               het echte werk doet: tekst selecteren doe je precies, en dus
//               langzaam. Een swipe is een zwiep.
//
// En pas bij loslaten, niet halverwege. Zo maakt de pagina zijn eigen sleep
// gewoon af en gebeurt er niets terwijl je nog bezig bent.
// ─────────────────────────────────────────────────────────────────────────

// Ongeveer een duim breed op een gewoon scherm. Korter en je raakt het per
// ongeluk; langer en het voelt als duwen in plaats van zwiepen.
const AFSTAND = 150;

// Zijwaarts moet minstens tweeënhalf keer zo veel zijn als omhoog of omlaag.
const RECHTUIT = 2.5;

// Zeven tienden van een seconde. Een zwiep haalt dat ruim; precisiewerk niet.
const SNEL_MS = 700;

/**
 * Was dit een veeg, en welke kant op?
 *
 * Geeft -1 (naar de vorige), 1 (naar de volgende) of 0 (geen veeg). Alle drie
 * de eisen hierboven moeten kloppen; elk daarvan houdt iets anders buiten de
 * deur, en met twee van de drie glipt er van alles doorheen.
 *
 * @param {number} dx  zijwaarts, negatief is naar links
 * @param {number} dy  omhoog of omlaag
 * @param {number} ms  hoe lang de knop ingedrukt was
 */
function beoordeel(dx, dy, ms, opties = {}) {
  const { afstand = AFSTAND, rechtuit = RECHTUIT, snelMs = SNEL_MS } = opties;
  if (!Number.isFinite(dx) || !Number.isFinite(dy) || !Number.isFinite(ms)) return 0;
  if (ms > snelMs) return 0;
  if (Math.abs(dx) < afstand) return 0;
  if (Math.abs(dx) < Math.abs(dy) * rechtuit) return 0;

  // Naar links vegen betekent: de volgende workspace komt van rechts in beeld.
  // Dat is hoe bladeren werkt, en hoe activateWorkspace zijn richting al
  // rekende.
  return dx < 0 ? 1 : -1;
}

module.exports = { beoordeel, AFSTAND, RECHTUIT, SNEL_MS };
