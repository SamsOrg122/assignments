'use strict';

/**
 * De tweede rug voor de assistent: de API van de gebruiker zelf.
 *
 * ── WAAROM DIT ER IS ────────────────────────────────────────────────────
 * De eerste rug is `lib/agent.js`: de agent die al op je computer staat,
 * aangemeld op je eigen abonnement. Die is beter — hij kost niets extra en
 * er komt geen sleutel aan te pas. Maar niet iedereen heeft er een, en dan
 * stond de assistent hier stil.
 *
 * Wat niet verschuift: de sleutel is van de gebruiker en de aanroep gaat van
 * deze computer rechtstreeks naar api.anthropic.com. Niets ervan komt langs
 * een server van ons, en er zit geen sleutel van ons in de download. Dat is
 * dezelfde belofte als hiervoor, langs een andere weg.
 *
 * ── WAAROM ER HIER GEEN POORT OPENGAAT ──────────────────────────────────
 * De agent is een kindproces, dus die moet ergens aankloppen: vandaar de
 * MCP-deur op localhost met een sleutel. Deze lus draait ín het hoofdproces
 * en roept `deur.roep()` gewoon aan. Dezelfde toestemmingsvragen, dezelfde
 * grendel, dezelfde weigeringen — alleen zonder poort. Dat is één stuk
 * aanvalsoppervlak minder voor wie deze weg kiest.
 *
 * ── WAAROM NIET STREAMEND ───────────────────────────────────────────────
 * Omdat het antwoord hier in een balk van één regel terechtkomt, en omdat een
 * SSE-lezer die niemand tegen de echte API heeft kunnen houden meer kans op
 * een stille fout geeft dan hij aan snelheid oplevert. Per beurt komt er één
 * antwoord binnen; het gereedschap onderweg meldt zich wél meteen, en dat is
 * waar je tijdens het wachten naar kijkt.
 */

const API = 'https://api.anthropic.com/v1/messages';
const VERSIE = '2023-06-01';

// Het model dat je krijgt als je niets kiest.
const STANDAARD_MODEL = 'claude-sonnet-5';

// Waar de lus stopt met zichzelf. Een assistent die twintig keer achter
// elkaar gereedschap pakt is een assistent die vastzit, en dat hoort de
// gebruiker te merken als "hij kwam er niet uit" en niet als een rekening.
const MAX_BEURTEN = 12;

const MAX_TOKENS = 2048;

// Een gereedschapsuitkomst is voor het model en niet voor een logboek: alles
// erboven is tokens van de gebruiker voor iets dat toch wordt afgekapt.
const MAX_UITKOMST = 12000;

/** Onze gereedschapslijst in de vorm die de API verwacht. */
function naarGereedschap(stukken) {
  return stukken.map((g) => ({
    name: g.naam,
    description: g.zegt,
    input_schema: g.invoer ?? { type: 'object', properties: {} },
  }));
}

/**
 * Wat er misging, in gewone taal.
 *
 * Nooit met de sleutel erin, en nooit met het hele antwoord van de server:
 * dat is soms een pagina html en daar staat de balk niet op te wachten.
 */
function foutTekst(status, lijf) {
  const bericht = String(lijf?.error?.message ?? '').slice(0, 160);
  if (status === 401) return 'De API-sleutel werd geweigerd. Controleer hem in Instellingen.';
  if (status === 403) return 'Deze sleutel mag hier niet bij.';
  if (status === 429) return 'Te veel aanvragen op deze sleutel. Even wachten.';
  if (status === 400) return `De aanvraag werd geweigerd${bericht ? `: ${bericht}` : ''}.`;
  if (status >= 500) return 'De API gaf een fout. Later nog eens proberen.';
  return bericht || `Er ging iets mis (${status}).`;
}

class ApiOpdracht {
  /**
   * @param sleutel   de sleutel van de gebruiker; verlaat dit object niet
   * @param deur      de McpDeur — alleen `roep()` wordt gebruikt
   * @param stukken   de gereedschapsdefinities die deze ronde mag gebruiken
   * @param houding   de systeemtekst
   * @param opMelding dezelfde meldingen als lib/agent.js: begin, zegt, doet,
   *                  mislukt, klaar, fout, afgelopen
   * @param haal      injecteerbaar, zodat een reeks geen netwerk nodig heeft
   */
  constructor({ sleutel, model, deur, stukken, houding, opMelding, haal = globalThis.fetch }) {
    this.sleutel = sleutel;
    this.model = model || STANDAARD_MODEL;
    this.deur = deur;
    this.stukken = stukken ?? [];
    this.houding = houding;
    this.opMelding = opMelding ?? (() => {});
    this.haal = haal;
    this.afbreker = null;
    this.gestopt = false;
  }

  start(opdracht) {
    this.afbreker = new AbortController();
    this.loop(String(opdracht ?? '')).catch((e) => {
      if (this.gestopt) return;
      this.opMelding({ soort: 'fout', tekst: String(e?.message ?? e).slice(0, 200) });
      this.opMelding({ soort: 'afgelopen' });
    });
    return this;
  }

  stop() {
    this.gestopt = true;
    this.afbreker?.abort();
  }

  async loop(opdracht) {
    this.opMelding({ soort: 'begin' });
    const berichten = [{ role: 'user', content: opdracht }];
    let laatsteTekst = '';

    for (let beurt = 0; beurt < MAX_BEURTEN; beurt += 1) {
      if (this.gestopt) return;
      const antwoord = await this.vraag(berichten);
      if (this.gestopt) return;
      if (!antwoord) return;

      const delen = Array.isArray(antwoord.content) ? antwoord.content : [];
      const gereedschap = [];

      for (const deel of delen) {
        if (deel.type === 'text' && deel.text?.trim()) {
          laatsteTekst = deel.text.trim();
          this.opMelding({ soort: 'zegt', tekst: laatsteTekst });
        }
        if (deel.type === 'tool_use') {
          this.opMelding({ soort: 'doet', naam: deel.name, invoer: deel.input ?? {} });
          gereedschap.push(deel);
        }
      }

      if (!gereedschap.length) {
        this.opMelding({ soort: 'klaar', tekst: laatsteTekst.slice(0, 400) });
        this.opMelding({ soort: 'afgelopen' });
        return;
      }

      berichten.push({ role: 'assistant', content: delen });
      const uitkomsten = [];
      for (const stuk of gereedschap) {
        if (this.gestopt) return;
        uitkomsten.push(await this.doe(stuk));
      }
      berichten.push({ role: 'user', content: uitkomsten });
    }

    // Hier zonder antwoord uitkomen is zelf een antwoord.
    this.opMelding({ soort: 'fout', tekst: 'Hij bleef gereedschap pakken zonder tot een antwoord te komen.' });
    this.opMelding({ soort: 'afgelopen' });
  }

  /**
   * Eén stuk gereedschap, langs dezelfde deur als een externe client.
   *
   * Een weigering is geen storing maar iets wat het model moet weten, dus die
   * gaat als `is_error` terug in het gesprek in plaats van de lus te breken.
   */
  async doe(stuk) {
    try {
      const uit = await this.deur.roep(stuk.name, stuk.input ?? {});
      return {
        type: 'tool_result',
        tool_use_id: stuk.id,
        content: JSON.stringify(uit ?? null).slice(0, MAX_UITKOMST),
      };
    } catch (e) {
      const tekst = String(e?.message ?? e).slice(0, 400);
      this.opMelding({ soort: 'mislukt', tekst });
      return { type: 'tool_result', tool_use_id: stuk.id, content: tekst, is_error: true };
    }
  }

  async vraag(berichten) {
    let antwoord;
    try {
      antwoord = await this.haal(API, {
        method: 'POST',
        signal: this.afbreker?.signal,
        headers: {
          'content-type': 'application/json',
          'x-api-key': this.sleutel,
          'anthropic-version': VERSIE,
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: MAX_TOKENS,
          system: this.houding,
          tools: naarGereedschap(this.stukken),
          messages: berichten,
        }),
      });
    } catch (e) {
      if (this.gestopt) return null;
      // Geen net, geen dns, of afgebroken. De oorzaak staat in de melding van
      // het systeem en die is bruikbaarder dan wat wij ervan zouden maken.
      this.opMelding({ soort: 'fout', tekst: `Kon de API niet bereiken: ${String(e?.message ?? e).slice(0, 120)}` });
      this.opMelding({ soort: 'afgelopen' });
      return null;
    }

    let lijf = null;
    try {
      lijf = await antwoord.json();
    } catch {
      lijf = null;
    }

    if (!antwoord.ok) {
      this.opMelding({ soort: 'fout', tekst: foutTekst(antwoord.status, lijf) });
      this.opMelding({ soort: 'afgelopen' });
      return null;
    }
    return lijf;
  }
}

module.exports = { ApiOpdracht, naarGereedschap, foutTekst, STANDAARD_MODEL, MAX_BEURTEN, MAX_UITKOMST };
