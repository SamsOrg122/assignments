'use strict';

/**
 * Wanneer een volgende stap zonder nieuwe vraag mag.
 *
 * ── DE REGEL ────────────────────────────────────────────────────────────
 * Stap 1 vraagt toestemming, net als elke andere handeling die jouw kant
 * raakt. De stappen erna vragen niets — maar alleen omdat de gebruiker
 * daarvóór zelf op Volgende heeft gedrukt, op hetzelfde tabblad, binnen
 * dezelfde reeks, in de goede volgorde. Alles wat daar niet aan voldoet is
 * geen vervolg maar een nieuwe reeks, en die begint bij stap 1.
 *
 * ── WAAROM DIT GEEN "ALTIJD TOESTAAN" IS ────────────────────────────────
 * Bij "altijd toestaan" zet je één keer een vinkje en gebeurt de rest buiten
 * je om. Hier gebeurt er niets zonder dat er op jouw scherm, per stap, een
 * knop wordt ingedrukt die jij indrukt — met Stoppen ernaast. Vijf keer
 * dezelfde vraag zou strenger lijken en slapper zijn: vijf vragen achter
 * elkaar leert mensen doorklikken.
 *
 * ── WAAROM HET EEN EIGEN BESTAND IS ─────────────────────────────────────
 * Omdat het de plek is waar die belofte staat of valt, en omdat het dan een
 * gewone functie is die een reeks kan uitproberen zonder venster, zonder
 * pagina en zonder gebruiker. Zie test/hersens.js.
 */

/**
 * @param reeks  wat er loopt: { tabId, van, stap, open } of null
 * @param vraag  { tabId, stap, van } zoals de client het vroeg
 * @returns {{vragen: true}|{vragen: false}|{bezwaar: string}}
 */
function oordeel(reeks, vraag) {
  const tabId = Number(vraag.tabId);
  const n = Math.floor(Number(vraag.stap));
  const totaal = Math.floor(Number(vraag.van));

  if (!Number.isFinite(tabId)) return { bezwaar: 'Dat is geen pagina.' };
  if (!Number.isFinite(n) || !Number.isFinite(totaal) || n < 1 || totaal < 1 || n > totaal) {
    return { bezwaar: `Stap ${vraag.stap} van ${vraag.van} bestaat niet.` };
  }

  // Een reeks van één stap is geen reeks. Hij mag, maar hij vraagt gewoon.
  if (n === 1) return { vragen: true };

  if (!reeks || reeks.tabId !== tabId) {
    return { bezwaar: `Er loopt geen uitleg op pagina ${tabId}. Begin bij stap 1.` };
  }
  if (reeks.van !== totaal) {
    return { bezwaar: `Deze uitleg ging over ${reeks.van} stappen, niet ${totaal}.` };
  }
  if (n !== reeks.stap + 1) {
    return { bezwaar: `De vorige stap was ${reeks.stap}; ${n} slaat er een over.` };
  }
  if (!reeks.open) {
    return { bezwaar: 'De gebruiker is nog niet verder, of is gestopt. Begin niet aan de volgende stap.' };
  }
  return { vragen: false };
}

module.exports = { oordeel };
