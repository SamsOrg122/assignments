/*
 * De brug naar één tabblad: wat de gids van een pagina mag vragen.
 *
 * `in-pagina.js` doet het kijken; dit bestand bepaalt wannéér er gekeken
 * wordt, en zorgt dat er niets blijft hangen.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * DE REGEL DIE DIT BESTAND BEWAAKT
 *
 * Er staat niets in de pagina tot de gebruiker erom vraagt. `in-pagina.js`
 * wordt pas ingeladen bij de eerste vraag, en na een navigatie is hij weg tot
 * de volgende. Een tabblad waar je de gids nooit voor opent heeft in zijn hele
 * leven geen letter van ons gezien.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * EN DE VAL DIE ERIN ZIT
 *
 * `executeJavaScriptInIsolatedWorld` geeft een Promise terug, en die Promise
 * blijft openstaan als de pagina wegnavigeert — gemeten: nog steeds open, geen
 * afwijzing, niets. Een wacht-op-klik die zo blijft liggen is een lek dat pas
 * opvalt als er honderd zijn. Dus: elke aanroep heeft een klok, en elke
 * navigatie sluit wat er nog openstond.
 */

const fs = require('node:fs');
const path = require('node:path');

/** De wereld waarin de gids woont. Niet 0 (de pagina) en niet die van de preload. */
const WERELD = 1000;

/** Hoe lang een gewone vraag mag duren voordat we hem opgeven. */
const GEDULD_MS = 5000;

/** De bron, één keer van schijf. */
let bron = null;
const lees = () => {
  if (bron === null) bron = fs.readFileSync(path.join(__dirname, 'in-pagina.js'), 'utf8');
  return bron;
};

/**
 * Eén tabblad, zolang het leeft.
 *
 * Per webContents één, want de boekhouding — is er ingeladen, wat staat er nog
 * open — gaat over dat ene document.
 */
class Paginabrug {
  /** @param {Electron.WebContents} wc */
  constructor(wc) {
    this.wc = wc;
    this.geladen = false;
    /** Wat er nu openstaat, zodat een navigatie het kan afsluiten. */
    this.openstaand = new Set();

    // Een nieuw document is een nieuwe wereld: wat we hadden ingeladen is weg,
    // en elke ref die we nog vasthielden slaat nergens meer op.
    this.opNavigatie = () => {
      this.geladen = false;
      for (const sluit of this.openstaand) sluit('genavigeerd');
      this.openstaand.clear();
    };
    wc.on('did-start-navigation', (_e, _url, _inPage, isMainFrame) => {
      if (isMainFrame) this.opNavigatie();
    });
    wc.once('destroyed', () => {
      for (const sluit of this.openstaand) sluit('weg');
      this.openstaand.clear();
    });
  }

  /**
   * Eén aanroep in de pagina, met een klok eromheen.
   *
   * De uitdrukking wordt als tekst samengesteld en de argumenten gaan er als
   * JSON in. Dat is de enige weg — er is geen kanaal naar die wereld — en het
   * is veilig zolang álles wat erin gaat door `JSON.stringify` komt. Doe dat
   * nooit met de hand.
   */
  async roep(functie, argumenten = [], geduld = GEDULD_MS) {
    if (this.wc.isDestroyed()) return { status: 'weg' };
    await this.zorgDatHetErIs();
    if (this.wc.isDestroyed()) return { status: 'weg' };

    const args = argumenten.map((a) => JSON.stringify(a)).join(',');
    const code = `(globalThis.__gids ? globalThis.__gids.${functie}(${args}) : { status: 'niet geladen' })`;

    return this.metKlok(this.wc.executeJavaScriptInIsolatedWorld(WERELD, [{ code }]), geduld);
  }

  /**
   * Wachten op iets dat de gebruiker doet, dus zonder onze eigen korte klok.
   *
   * `in-pagina.js` heeft zijn eigen klok voor dit geval; hier houden we hem
   * alleen bij zodat een navigatie hem kan afsluiten.
   */
  wacht(functie, argumenten = []) {
    return this.roep(functie, argumenten, 0);
  }

  metKlok(belofte, geduld) {
    return new Promise((klaar) => {
      let af = false;
      const sluit = (reden) => {
        if (af) return;
        af = true;
        this.openstaand.delete(sluit);
        clearTimeout(klok);
        klaar({ status: reden });
      };
      this.openstaand.add(sluit);

      const klok = geduld > 0 ? setTimeout(() => sluit('te laat'), geduld) : null;

      belofte.then(
        (waarde) => {
          if (af) return;
          af = true;
          this.openstaand.delete(sluit);
          clearTimeout(klok);
          klaar(waarde);
        },
        (fout) => sluit('mislukt: ' + String(fout && fout.message ? fout.message : fout).split('\n')[0]),
      );
    });
  }

  /**
   * Inladen als het er nog niet staat.
   *
   * Eerst kijken, dan pas inspuiten: het bestand is vijftien kilobyte en de
   * vraag ernaar kost een milliseconde. Wat er staat blijft staan tussen twee
   * aanroepen — gemeten — dus dit gebeurt één keer per document.
   */
  async zorgDatHetErIs() {
    if (this.geladen) return;
    try {
      const aanwezig = await this.wc.executeJavaScriptInIsolatedWorld(WERELD, [{
        code: '(globalThis.__gids ? globalThis.__gids.versie : 0)',
      }]);
      if (!aanwezig) {
        await this.wc.executeJavaScriptInIsolatedWorld(WERELD, [{ code: lees() }]);
      }
      this.geladen = true;
    } catch {
      // Een pagina die net wegnavigeert, of een devtools-scherm. De volgende
      // vraag probeert het opnieuw; stilletjes falen is hier het goede gedrag.
      this.geladen = false;
    }
  }

  // ── Wat de gids hiermee kan ───────────────────────────────────────────

  snapshot() {
    return this.roep('maakSnapshot');
  }

  /**
   * Een ref omzetten naar een plek, en hem terugzoeken als hij weg is.
   *
   * Dit is het hele stale-ref-verhaal op één plek. De aanroeper krijgt een
   * rect of een eerlijk "weg", nooit een rect die nergens op slaat.
   */
  async zoek(ref) {
    const eerst = await this.roep('zoek', [ref]);
    if (eerst.status === 'ok') return eerst;
    if (eerst.status !== 'weg' && eerst.status !== 'onzichtbaar') return eerst;

    const opnieuw = await this.roep('hermatch', [ref]);
    if (opnieuw.status !== 'ok') return { status: 'weg', hermatch: opnieuw.status };
    const nogmaals = await this.roep('zoek', [ref]);
    return { ...nogmaals, hermatcht: true, kandidaten: opnieuw.kandidaten };
  }

  scrollNaar(ref) {
    return this.roep('scrollNaar', [ref]);
  }

  wachtOpKlik(ref, msMax) {
    return this.wacht('wachtOpKlik', [ref, msMax]);
  }

  stand() {
    return this.roep('stand');
  }
}

/**
 * Eén brug per tabblad, opgeruimd als het tabblad weggaat.
 *
 * Een `WeakMap` op de webContents: dan hoeft niemand hier iets te
 * deregistreren en kan er ook niets achterblijven.
 */
const bruggen = new WeakMap();

function brugVoor(wc) {
  if (!wc || wc.isDestroyed()) return null;
  let b = bruggen.get(wc);
  if (!b) {
    b = new Paginabrug(wc);
    bruggen.set(wc, b);
  }
  return b;
}

module.exports = { brugVoor, Paginabrug, WERELD };
