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
   *
   * ── DE AFSLUITER BESTAAT VANAF DE EERSTE REGEL ─────────────────────────
   * Niet pas na het inladen, en dat is geen detail. Tussen "kijken of het er
   * staat" en "aanroepen" zitten twee await's, en in die tussentijd kan de
   * pagina wegnavigeren. Gebeurde dat, dan sloot de navigatie niets af — de
   * afsluiter bestond nog niet — en liep de aanroep daarna tegen een vers
   * document aan, waar `__gids` nog niet in zit. De beller kreeg dan "niet
   * geladen" terug in plaats van "genavigeerd": een antwoord dat klinkt als
   * een fout in het inladen terwijl er niets mis was.
   *
   * Op Electron 33 viel dat toevallig goed uit en op 44 niet. Zo'n race is
   * niet stuk gegaan bij het bijwerken; hij werd zichtbaar.
   */
  roep(functie, argumenten = [], geduld = GEDULD_MS) {
    if (this.wc.isDestroyed()) return Promise.resolve({ status: 'weg' });

    let af = false;
    let klaar;
    const uit = new Promise((r) => { klaar = r; });

    const sluit = (reden) => {
      if (af) return;
      af = true;
      this.openstaand.delete(sluit);
      if (klok) clearTimeout(klok);
      klaar({ status: reden });
    };
    // Eerst registreren, dan pas iets doen dat kan wachten.
    this.openstaand.add(sluit);
    const klok = geduld > 0 ? setTimeout(() => sluit('te laat'), geduld) : null;

    void (async () => {
      await this.zorgDatHetErIs();
      if (af) return;
      if (this.wc.isDestroyed()) { sluit('weg'); return; }

      const args = argumenten.map((a) => JSON.stringify(a)).join(',');
      const code = `(globalThis.__gids ? globalThis.__gids.${functie}(${args}) : { status: 'niet geladen' })`;

      try {
        const waarde = await this.wc.executeJavaScriptInIsolatedWorld(WERELD, [{ code }]);
        if (af) return;
        af = true;
        this.openstaand.delete(sluit);
        if (klok) clearTimeout(klok);
        klaar(waarde);
      } catch (fout) {
        sluit('mislukt: ' + String(fout && fout.message ? fout.message : fout).split('\n')[0]);
      }
    })();

    return uit;
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

  /**
   * Wijs iets aan, met een zin erbij.
   *
   * Eerst in beeld brengen en dán wijzen: een ring om iets dat honderd pixels
   * onder de vouw ligt is een ring die niemand ziet, en `zoek` geeft in dat
   * geval keurig "ok" terug — met `plaats` op iets anders dan `viewport`.
   * Ook als het doel bedekt is, want dan wijst de ring naar iets dat onder
   * een cookiebalk ligt. De scroll is `smooth`, dus er zit een wachtje
   * tussen: kort genoeg dat het één beweging blijft, lang genoeg dat de ring
   * op de goede plek aankomt.
   *
   * De ring blijft daarna zelf meebewegen; dit is het enige moment waarop
   * deze kant iets over positie hoeft te weten.
   */
  async wijs(ref, tekst, opties) {
    const plek = await this.zoek(ref);
    if (plek.status !== 'ok') return plek;

    if (plek.plaats !== 'viewport' || plek.bedekt) {
      await this.roep('scrollNaar', [ref]);
      await this.wachtTotInBeeld(ref);
    }
    return this.roep('wijs', [ref, String(tekst || ''), opties ?? null]);
  }

  /**
   * Eén stap van een reeks: wijzen, en dan wachten tot de gebruiker verder
   * wil. Het antwoord is 'volgende', 'gestopt', 'te laat' of 'genavigeerd'.
   *
   * Die laatste twee komen van hier en niet uit de pagina: een reeks kan een
   * kwartier open blijven staan en in die tijd kan er van alles gebeuren met
   * het tabblad.
   */
  async wijsStap(ref, tekst, stap, van, woorden) {
    const uit = await this.wijs(ref, tekst, { stap, van, woorden });
    if (uit.status !== 'ok') return uit;
    // De laatste stap heeft geen 'volgende' nodig: wie 'Klaar' leest, drukt
    // erop om de aanwijzing weg te halen, en dat mag ook Escape zijn.
    const antwoord = await this.wacht('wachtOpStap');
    // Tussen het wijzen en het wachten zit één rondje naar de pagina en
    // terug. Wordt de aanwijzing er precies dán afgehaald, dan vindt het
    // wachten geen laag meer en zegt de pagina 'niets gewezen'. Voor wie dit
    // vroeg is dat hetzelfde als stoppen — hij wees, en het is weg — dus het
    // heet hier ook zo. Anders zou een reeks twee woorden hebben voor
    // dezelfde uitkomst, afhankelijk van een milliseconde.
    const status = antwoord.status === 'niets gewezen' ? 'gestopt' : antwoord.status;
    return { ...uit, antwoord: status };
  }

  /**
   * Wachten tot het doel er echt is, in plaats van tot een getal.
   *
   * De eerste versie hiervan sliep 420 ms en wees daarna. Dat is een gok, en
   * de gok was mis: `scrollIntoView` is `smooth`, en op een lange pagina duurt
   * dat langer. De testreeks ving het — hij wachtte zelf 700 ms — maar een
   * product dat op een timer staat werkt op een korte pagina en niet op een
   * lange, en dat is precies het soort fout dat pas bij een gebruiker opvalt.
   *
   * Dus: kijken tot het zo is. Met een dak erop, want een doel in een
   * container die niet scrollt komt nooit in beeld en dan is wijzen naar waar
   * het staat beter dan helemaal niet wijzen.
   */
  async wachtTotInBeeld(ref, msMax = 1600) {
    const tot = Date.now() + msMax;
    for (;;) {
      const nu = await this.roep('zoek', [ref]);
      if (nu.status !== 'ok') return nu;
      if (nu.plaats === 'viewport') return nu;
      if (Date.now() >= tot) return nu;
      await new Promise((k) => setTimeout(k, 80));
    }
  }

  /**
   * Iets zeggen zonder per se iets aan te wijzen.
   *
   * Dit is de weg waarlangs het antwoord van de assistent in het wolkje bij
   * de aanwijzer terechtkomt. Geen scrollen eerst: er is geen doel, er is
   * alleen een zin.
   */
  zeg(tekst, opties) {
    return this.roep('zeg', [String(tekst || ''), opties ?? null]);
  }

  /**
   * Wachten tot de gebruiker in het wolkje iets terugvraagt.
   *
   * Zonder onze eigen korte klok: hier zit iemand te lezen en na te denken.
   * `in-pagina.js` heeft zijn eigen klok, en een navigatie sluit hem af.
   */
  wachtOpVraag() {
    return this.wacht('wachtOpVraag');
  }

  verberg() {
    return this.roep('verberg');
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
