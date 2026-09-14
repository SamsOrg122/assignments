// De Tougather-app in de kleuren van de browser.
//
// Dit overschrijft alléén de ontwerptokens die de app zelf op :root zet (zie
// src/app/globals.css, het @theme-blok van Tailwind). Geen enkele selector wijst
// naar een component. Dat is met opzet: hernoemen ze morgen een knop, dan
// verandert hier niets; hernoemen ze een token, dan valt die ene overschrijving
// weg en ziet de app er weer uit zoals hij zelf bedoeld was. Nooit half kapot.
//
// Wat hier NIET gebeurt, en waarom:
//
//   De app blijft donker. Zijn tekstkleuren zijn afgemeten tegen een donkere
//   ondergrond, met een controle in scripts/contrast-floors.mjs die daarop
//   staat. Er lichte tinten onder schuiven zou lichtgrijze tekst op licht glas
//   opleveren. Deze ondergrond is iets dónkerder dan de hunne, dus elke
//   verhouding die zij bewaken wordt beter, geen enkele slechter.
//
//   De letter verandert niet. De browser levert Outfit mee als bestand op
//   schijf, maar de app draait op https://tougather.com en haalt zijn letters
//   binnen de regels van zijn eigen CSP. Een bestand van deze schijf komt daar
//   niet doorheen. Die hoort dus in hun repo, niet hier.

const STIJL = `
/* Ingevoegd door Tougather Browser. Dubbele :root voor het gewicht; Tailwind
   zet zijn tokens in een laag, en niet-gelaagde regels winnen daarvan. */
:root:root {
  /* Ondergrond en vlakken, in de violette familie van de browser in plaats van
     neutraal grijs. Zo hoort de app bij het venster eromheen. */
  --color-canvas: #1c1a24;
  --color-surface: #24212e;
  --color-surface-2: #2b2836;
  --color-surface-3: #35313f;

  /* Eén accent, dat van de browser. */
  --color-accent: #b48cf0;
  --color-accent-dim: #9a6fe0;
  --color-accent-soft: rgba(180, 140, 240, 0.16);
  --color-on-accent: #1b1622;

  /* Rondingen een tikje ruimer, in de maat van de zijbalk. */
  --radius-xs: 5px;
  --radius-sm: 7px;
  --radius-md: 10px;
  --radius-lg: 14px;
}
`;

/**
 * Zet de stijl op een laag en houdt hem daar. insertCSS geldt per document, dus
 * na elke navigatie opnieuw; anders ben je hem kwijt zodra je binnen de app
 * doorklikt.
 *
 * @param {import('electron').WebContents} wc
 * @param {() => boolean} aan  of de gebruiker dit wil
 */
function volgDeBrowser(wc, aan) {
  let sleutel = null;

  const pasToe = async () => {
    if (wc.isDestroyed()) return;
    if (!aan()) return;
    try {
      sleutel = await wc.insertCSS(STIJL);
    } catch {
      // Een document dat alweer weg is. Niets aan de hand: de volgende
      // did-finish-load doet het opnieuw.
    }
  };

  wc.on('did-finish-load', pasToe);

  // Meteen ook, voor het geval de pagina al staat.
  if (!wc.isLoading()) pasToe();

  return {
    async ververs() {
      if (wc.isDestroyed()) return;
      if (sleutel) {
        try {
          await wc.removeInsertedCSS(sleutel);
        } catch {
          // Al weg met het vorige document.
        }
        sleutel = null;
      }
      if (aan()) await pasToe();
      else wc.reload();
    },
  };
}

module.exports = { STIJL, volgDeBrowser };
