// Toestemming per handeling.
//
// ─────────────────────────────────────────────────────────────────────────
// WAAR DIT TEGEN GEBOUWD IS
//
// Niet tegen een client die iets doms doet. Tegen een vraag die zo vaak komt dat
// je hem wegklikt zonder te lezen, en dan één keer ja zegt tegen het verkeerde.
// Een slot waar je omheen went is geen slot. Vandaar vier regels die hier
// afgedwongen worden en niet aan de goede wil van de aanroeper hangen:
//
//   1. VRAGEN IS ZELDZAAM. Wat de client in zijn eigen lege workspace doet vraagt
//      niets. Alleen wat jouw kant raakt komt hier langs.
//
//   2. DE VRAAG IS CONCREET. Niet "mag de client klikken" maar wélke knop, op
//      wélke pagina, in wélke workspace. Een vraag die je niet kunt beoordelen is
//      geen vraag maar een formaliteit.
//
//   3. NEE IS DE UITKOMST BIJ TWIJFEL. Geen antwoord binnen de tijd is nee. Het
//      venster sluiten is nee. Een tweede vraag terwijl er al een openstaat is
//      nee, want anders stapelt een client vragen tot je de bovenste wegklikt.
//
//   4. JA GELDT ÉÉN KEER. Er is geen "altijd toestaan". Dat is de knop waarmee
//      elk toestemmingsscherm ter wereld uiteindelijk zichzelf uitschakelt.
//
// En er is een categorie die hier niet eens langskomt: wachtwoordvelden,
// betaalgegevens, downloads. Daar is geen goede vraag voor te stellen, want de
// enige eerlijke vraag zou zijn "vertrouw je dit volledig", en daar hoort geen
// knop bij.
// ─────────────────────────────────────────────────────────────────────────

// Zestig seconden. Lang genoeg om te lezen wat er staat, kort genoeg dat een
// vergeten vraag niet de hele zitting open blijft hangen.
const WACHTTIJD_MS = 60000;

class Toestemming {
  /** @param {(stand: object) => void} bijWijziging  om het scherm bij te werken */
  constructor(bijWijziging) {
    this.bijWijziging = bijWijziging;
    this.open = null;
    this.volgend = 1;
    this.geschiedenis = [];
  }

  stand() {
    return {
      open: this.open
        ? {
          id: this.open.id,
          wat: this.open.wat,
          kop: this.open.kop,
          regels: this.open.regels,
          waarschuwing: this.open.waarschuwing,
          verlooptOp: this.open.verlooptOp,
        }
        : null,
    };
  }

  /**
   * Vraagt het, en wacht op je antwoord.
   *
   * @returns {Promise<{goed: boolean, reden: string}>}
   */
  vraag({ wat, kop, regels, waarschuwing }) {
    // Eén tegelijk. Een client die vragen stapelt zou de bovenste kunnen laten
    // wegklikken terwijl de echte eronder zit.
    if (this.open) {
      return Promise.resolve({ goed: false, reden: 'er stond al een vraag open' });
    }

    const id = this.volgend++;
    const verlooptOp = Date.now() + WACHTTIJD_MS;

    return new Promise((klaar) => {
      const beslis = (goed, reden) => {
        if (this.open?.id !== id) return;
        clearTimeout(this.open.klok);
        this.open = null;
        this.geschiedenis.push({ id, wat, goed, reden, op: Date.now() });
        if (this.geschiedenis.length > 50) this.geschiedenis.shift();
        this.bijWijziging(this.stand());
        klaar({ goed, reden });
      };

      this.open = {
        id,
        wat,
        kop,
        regels,
        waarschuwing,
        verlooptOp,
        beslis,
        klok: setTimeout(() => beslis(false, 'geen antwoord binnen een minuut'), WACHTTIJD_MS),
      };
      this.bijWijziging(this.stand());
    });
  }

  /** Het antwoord uit het scherm. Een id dat niet klopt wordt genegeerd. */
  antwoord(id, goed) {
    if (!this.open || this.open.id !== Number(id)) return false;
    this.open.beslis(Boolean(goed), goed ? 'door jou toegestaan' : 'door jou geweigerd');
    return true;
  }

  /** Alles wat openstaat weigeren; hoort bij de noodstop en bij afsluiten. */
  breekAf(reden = 'afgebroken') {
    if (this.open) this.open.beslis(false, reden);
  }
}

module.exports = { Toestemming, WACHTTIJD_MS };
