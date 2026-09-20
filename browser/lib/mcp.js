// De deur naar buiten: een AI-client mag deze browser bedienen.
//
// ─────────────────────────────────────────────────────────────────────────
// WAAROM DIT ZO KLEIN IS, EN WAT ER MET OPZET NIET IN ZIT
//
// De verleiding is een client alles te laten doen wat jij kunt. Dat is precies
// wat niet kan, en de reden is niet vaag maar aanwijsbaar: jouw workspaces
// dragen jouw logins. Een client die daar een tabblad mag openen, kan naar je
// mail navigeren en die pagina lezen — en dan staat er in het logboek keurig
// "tabblad geopend", terwijl er in werkelijkheid post is meegelezen. Er is geen
// lijst van verboden adressen die dat afvangt; die lijst is altijd te kort.
//
// Dus krijgt de client een eigen workspace met een sessie die niet op schijf
// staat. Geen koekjes, geen logins, weg zodra de verbinding sluit. Hij kan naar
// je mail navigeren en krijgt dan wat een vreemde krijgt: een aanmeldscherm.
//
// Wat hij hier kan: pagina's openen, lezen en sluiten, in díé workspace. Wat hij
// niet kan, en niet per ongeluk: klikken, typen, formulieren versturen, iets
// downloaden, of ook maar kijken in de workspaces waar jij in werkt. Dat komt
// pas als er een scherm is dat per handeling toestemming vraagt.
//
// De verbinding staat standaard uit, luistert alleen op deze machine, en elke
// aanvraag moet een sleutel meesturen die per keer wordt aangemaakt.
// ─────────────────────────────────────────────────────────────────────────

const http = require('node:http');
const crypto = require('node:crypto');
const { t } = require('../renderer/taal.js');
const fs = require('node:fs');
const path = require('node:path');
const { app } = require('electron');

// Waar de brug zijn poort en sleutel vandaan haalt. Bewust een bestand en niet
// de configuratie van de client: die zou blijven werken nadat jij de deur hebt
// dichtgedaan. Dit bestand verdwijnt mét de verbinding.
const verbindingsPad = () => path.join(app.getPath('userData'), 'mcp-verbinding.json');

// Wat een client mag vragen. Deze lijst is de hele afspraak: staat een naam er
// niet in, dan bestaat hij niet.
const GEREEDSCHAP = [
  {
    naam: 'open_pagina',
    zegt: 'Opent een webadres in de eigen workspace van de client en geeft de titel terug.',
    invoer: {
      type: 'object',
      properties: { url: { type: 'string', description: 'Een http- of https-adres.' } },
      required: ['url'],
    },
  },
  {
    naam: 'lees_pagina',
    zegt: 'Geeft de leesbare tekst van een geopende pagina terug.',
    invoer: {
      type: 'object',
      properties: {
        id: { type: 'number', description: 'Het id uit lijst_paginas of open_pagina.' },
        maximum: { type: 'number', description: 'Hoogstens zoveel tekens. Standaard 20000.' },
      },
      required: ['id'],
    },
  },
  {
    naam: 'lijst_paginas',
    zegt: 'Alle pagina\'s die de client zelf heeft geopend.',
    invoer: { type: 'object', properties: {} },
  },
  {
    naam: 'sluit_pagina',
    zegt: 'Sluit een pagina die de client heeft geopend.',
    invoer: {
      type: 'object',
      properties: { id: { type: 'number' } },
      required: ['id'],
    },
  },

  // ── Hieronder raakt het jouw kant, en vraagt elke keer ─────────────────
  {
    naam: 'lees_jouw_pagina',
    vraagt: true,
    zegt: 'Leest een pagina uit één van jouw eigen workspaces. Vraagt elke keer '
      + 'toestemming en noemt daarbij welke pagina het is.',
    invoer: {
      type: 'object',
      properties: { id: { type: 'number', description: 'Het id uit jouw_paginas.' } },
      required: ['id'],
    },
  },
  {
    naam: 'jouw_paginas',
    zegt: 'De titels van jouw eigen tabbladen, zonder de inhoud. Genoeg om te '
      + 'kunnen vragen welke pagina bedoeld wordt.',
    invoer: { type: 'object', properties: {} },
  },
  {
    naam: 'klik',
    vraagt: true,
    zegt: 'Klikt op het element met deze zichtbare tekst, op een pagina van de '
      + 'client zelf. Vraagt elke keer toestemming en laat zien wat er wordt '
      + 'aangeklikt.',
    invoer: {
      type: 'object',
      properties: {
        id: { type: 'number' },
        tekst: { type: 'string', description: 'De zichtbare tekst van de knop of link.' },
      },
      required: ['id', 'tekst'],
    },
  },
  /*
   * Wijzen is niet klikken, en dat verschil is het hele gereedschap.
   *
   * De assistent in dit product neemt je scherm niet over. Wat hij wél kan is
   * naast je aanwijzer gaan staan en zeggen: dáár. Dan doe jij het, op jouw
   * pagina, met jouw hand — en wat er gebeurt is wat jij deed.
   *
   * Het vraagt toestemming zoals alles wat jouw tabbladen raakt, en de vraag
   * is een andere dan bij lezen, want dit is ook een andere: er gaat niets
   * naar de client toe, er komt iets op jouw scherm bij.
   */
  {
    naam: 'bekijk_jouw_pagina',
    vraagt: true,
    zegt: 'Geeft de indeling van een pagina van jou terug: wat er staat, welke '
      + 'rol het heeft, en een ref per ding zodat er naar gewezen kan worden. '
      + 'Geen veldwaarden, nooit. Vraagt elke keer toestemming.',
    invoer: {
      type: 'object',
      properties: { id: { type: 'number', description: 'Het id uit jouw_paginas.' } },
      required: ['id'],
    },
  },
  {
    naam: 'wijs_aan',
    vraagt: true,
    zegt: 'Zet een ring om iets op een pagina van jou en schrijft er één zin '
      + 'bij. Klikt niet, typt niet en navigeert niet — het wijst alleen aan. '
      + 'De ref komt uit bekijk_jouw_pagina. Vraagt elke keer toestemming.',
    invoer: {
      type: 'object',
      properties: {
        id: { type: 'number', description: 'Het id uit jouw_paginas.' },
        ref: { type: 'string', description: 'De ref uit de snapshot, bijvoorbeeld e12.' },
        tekst: {
          type: 'string',
          description: 'Eén korte zin bij de ring. Hoogstens 160 tekens.',
        },
      },
      required: ['id', 'ref'],
    },
  },
  {
    naam: 'wijs_stap',
    vraagt: true,
    zegt: 'Eén stap van een uitleg in meerdere stappen. Wijst iets aan met "3 '
      + 'van 5" erbij en een knop, en geeft pas antwoord als de gebruiker op '
      + 'Volgende of op Stoppen heeft gedrukt — dus roep hem gewoon achter '
      + 'elkaar aan voor stap 1, 2, 3. Het antwoord zegt wat er gedrukt is; '
      + 'bij "gestopt" is de uitleg voorbij en begin je niet aan de volgende. '
      + 'Alleen stap 1 vraagt toestemming: op Volgende drukken ís de '
      + 'toestemming voor de stap erna. Hij wacht hoogstens twee minuten; '
      + 'daarna komt er "te laat" terug en is de uitleg ook voorbij.',
    invoer: {
      type: 'object',
      properties: {
        id: { type: 'number', description: 'Het id uit jouw_paginas.' },
        ref: { type: 'string', description: 'De ref uit de snapshot, bijvoorbeeld e12.' },
        tekst: { type: 'string', description: 'Eén korte zin bij deze stap. Hoogstens 160 tekens.' },
        stap: { type: 'number', description: 'De hoeveelste stap dit is, vanaf 1.' },
        van: { type: 'number', description: 'Hoeveel stappen er in totaal zijn.' },
      },
      required: ['id', 'ref', 'stap', 'van'],
    },
  },
  {
    naam: 'wijs_niet_meer',
    zegt: 'Haalt de ring en de zin weer weg. Vraagt niets, want er gaat alleen '
      + 'iets af het scherm.',
    invoer: {
      type: 'object',
      properties: { id: { type: 'number' } },
      required: ['id'],
    },
  },
  {
    naam: 'typ',
    vraagt: true,
    zegt: 'Typt tekst in een veld op een pagina van de client zelf. Vraagt elke '
      + 'keer toestemming en toont wat er getypt wordt. Wachtwoord- en '
      + 'betaalvelden worden altijd geweigerd.',
    invoer: {
      type: 'object',
      properties: {
        id: { type: 'number' },
        veld: { type: 'string', description: 'Het label, de placeholder of de naam van het veld.' },
        tekst: { type: 'string' },
      },
      required: ['id', 'veld', 'tekst'],
    },
  },
];

const MAX_TEKENS = 20000;

// Waar geen goede vraag bij te stellen is. De enige eerlijke vraag zou zijn
// "vertrouw je dit volledig", en daar hoort geen knop bij. Dit wordt geweigerd
// vóórdat er iets te beslissen valt, en de poging komt in het logboek.
const NOOIT_TYPEN = /wachtwoord|password|passwd|pincode|pin\b|creditcard|card.?number|kaartnummer|cvc|cvv|iban|rekeningnummer|bsn|burgerservice|sofinummer|social.?security|2fa|otp|verificatiecode|authenticator/i;

// Een veld dat het zelf al zegt. type="password" is de duidelijkste, maar een
// autocomplete-hint van een betaalformulier telt net zo hard.
const NOOIT_VELDSOORT = /^(password)$/i;
const NOOIT_AANVULLING = /cc-|new-password|current-password|one-time-code/i;

class McpDeur {
  /**
   * @param {object} o
   * @param {() => any} o.controller  het venster waar dit voor werkt
   * @param {(regel: object) => void} o.meld  elke handeling, voor het logboek
   */
  constructor({ controller, meld }) {
    this.geefController = controller;
    this.meld = meld;
    this.server = null;
    this.poort = null;
    this.sleutel = null;
    this.werkruimteId = null;
    this.laatsteAanraking = null;
    // Zie beperkTot(): null is "alles mag wat er is".
    this.beperking = null;
  }

  get aan() {
    return Boolean(this.server);
  }

  stand() {
    return {
      aan: this.aan,
      poort: this.poort,
      sleutel: this.sleutel,
      werkruimteId: this.werkruimteId,
      gereedschap: GEREEDSCHAP.map((g) => g.naam),
      beperking: this.beperking ? [...this.beperking] : null,
      laatste: this.laatsteAanraking,
    };
  }

  async open() {
    if (this.server) return this.stand();

    // Een nieuwe sleutel per keer. Een sleutel die blijft staan is een sleutel
    // die in een oud configuratiebestand blijft werken nadat jij dacht dat je
    // de deur dicht had gedaan.
    this.sleutel = crypto.randomBytes(24).toString('base64url');

    this.server = http.createServer((verzoek, antwoord) => this.behandel(verzoek, antwoord));

    await new Promise((klaar, mis) => {
      this.server.once('error', mis);
      // Alleen deze machine. 0 laat het systeem een vrije poort kiezen, zodat er
      // niets vastligt dat een ander programma kan bezetten of raden.
      this.server.listen(0, '127.0.0.1', klaar);
    });
    this.poort = this.server.address().port;

    // Alleen leesbaar voor deze gebruiker: hierin staat de sleutel.
    fs.writeFileSync(
      verbindingsPad(),
      JSON.stringify({ poort: this.poort, sleutel: this.sleutel }, null, 2),
      { mode: 0o600 },
    );

    this.meld({ soort: 'open', tekst: `Verbinding open op poort ${this.poort}` });
    return this.stand();
  }

  /**
   * @param {string} reden
   * @param {object} [opties]
   * @param {boolean} [opties.behoudWerkruimte]  laat staan wat er geopend is
   *
   * Dat laatste is er voor de assistent van de gebruiker zelf. Een client van
   * buiten hoort niets achter te laten, maar wat jij zélf hebt laten opzoeken
   * wil je daarna nog kunnen lezen. De sessie staat toch niet op schijf.
   */
  sluit(reden = 'gesloten', opties = {}) {
    if (!this.server) return this.stand();
    this.server.close();
    this.server = null;
    this.poort = null;
    this.sleutel = null;

    // Weg met het bestandje. Blijft het staan, dan wijst het naar een deur die
    // er niet meer is, en dan lijkt een oude sleutel nog geldig.
    try {
      fs.unlinkSync(verbindingsPad());
    } catch {
      // Al weg, of nooit geschreven.
    }

    // De workspace van de client gaat mee. Wat hij had staan is daarmee weg, en
    // dat is de bedoeling: er hoort niets van hem te blijven liggen.
    const ctrl = this.geefController();
    if (ctrl && this.werkruimteId != null && !opties.behoudWerkruimte) {
      ctrl.sluitMcpWerkruimte(this.werkruimteId);
    }
    this.werkruimteId = null;

    this.meld({ soort: 'dicht', tekst: `Verbinding ${reden}` });
    return this.stand();
  }

  behandel(verzoek, antwoord) {
    const stuur = (code, lijf) => {
      const tekst = JSON.stringify(lijf);
      antwoord.writeHead(code, {
        'content-type': 'application/json; charset=utf-8',
        'content-length': Buffer.byteLength(tekst),
      });
      antwoord.end(tekst);
    };

    const kop = verzoek.headers.authorization ?? '';
    const gegeven = kop.startsWith('Bearer ') ? kop.slice(7) : '';
    // Vergelijken in vaste tijd: een gewone vergelijking lekt via hoe lang hij
    // duurt hoeveel tekens er klopten.
    const goed = this.sleutel
      && gegeven.length === this.sleutel.length
      && crypto.timingSafeEqual(Buffer.from(gegeven), Buffer.from(this.sleutel));
    if (!goed) return stuur(401, { fout: 'Geen geldige sleutel' });

    if (verzoek.method !== 'POST') return stuur(405, { fout: 'Alleen POST' });

    let lijf = '';
    verzoek.on('data', (stuk) => {
      lijf += stuk;
      // Een client die eindeloos blijft sturen krijgt de deur dicht.
      if (lijf.length > 1e6) verzoek.destroy();
    });
    verzoek.on('end', async () => {
      let vraag;
      try {
        vraag = JSON.parse(lijf || '{}');
      } catch {
        return stuur(400, { fout: 'Onleesbare vraag' });
      }

      if (verzoek.url === '/gereedschap') return stuur(200, { gereedschap: GEREEDSCHAP });
      if (verzoek.url !== '/roep') return stuur(404, { fout: 'Onbekend pad' });

      try {
        const uitkomst = await this.roep(vraag.naam, vraag.argumenten ?? {});
        stuur(200, { uitkomst });
      } catch (e) {
        stuur(200, { fout: String(e.message ?? e) });
      }
    });
  }

  /**
   * De deur tijdelijk smaller maken.
   *
   * Een gidsronde mag kijken en wijzen, verder niets. Dat staat ook in de
   * houding die de agent meekrijgt, maar een houding is een instructie en geen
   * grendel: dit is de grendel. `null` haalt hem er weer af.
   *
   * Het geldt voor de hele deur en niet per client, want de deur kan niet zien
   * wie er belt. De browser zet hem daarom alleen als hij de deur zelf voor
   * deze ronde heeft opengedaan; stond hij al open voor een eigen client van
   * de gebruiker, dan blijft die client werken en is de lijst gereedschap van
   * de agent de enige beperking. Zie startGids in main.js.
   */
  beperkTot(namen) {
    this.beperking = Array.isArray(namen) && namen.length ? new Set(namen) : null;
    return this.stand();
  }

  async roep(naam, arg) {
    const stuk = GEREEDSCHAP.find((g) => g.naam === naam);
    if (!stuk) throw new Error(`Onbekend gereedschap: ${naam}`);

    // De grendel gaat vóór alles. Wat niet mag hoeft niet eerst uitgezocht te
    // worden, en een weigering die van de stand van het venster afhangt is
    // geen weigering waar je op kunt bouwen.
    if (this.beperking && !this.beperking.has(naam)) {
      const bezwaar = `${naam} kan nu niet: de browser wijst iets aan en doet zolang alleen dat`;
      this.meld({ soort: 'geweigerd', naam, tekst: t('log.geweigerd', { wat: bezwaar }) });
      throw new Error(bezwaar);
    }

    const ctrl = this.geefController();
    if (!ctrl) throw new Error('Er is geen venster open');

    this.laatsteAanraking = { naam, op: Date.now() };
    this.meld({ soort: 'roep', naam, tekst: beschrijf(naam, arg) });

    const ws = ctrl.mcpWerkruimte();
    this.werkruimteId = ws.id;

    // Vrij, in zijn eigen lege workspace.
    if (naam === 'open_pagina') return ctrl.mcpOpen(arg.url);
    if (naam === 'lijst_paginas') return ctrl.mcpLijst();
    if (naam === 'lees_pagina') return ctrl.mcpLees(arg.id, Math.min(arg.maximum ?? MAX_TEKENS, MAX_TEKENS));
    if (naam === 'sluit_pagina') return ctrl.mcpSluit(arg.id);

    // Titels van jouw tabbladen mogen zonder vragen: zonder te weten wát er
    // open staat kan een client niet eens een zinnige vraag stellen, en een
    // titel is geen inhoud.
    if (naam === 'jouw_paginas') return ctrl.mcpJouwPaginas();

    // Ophouden met wijzen vraagt niets. Er gaat alleen iets áf het scherm, en
    // een toestemmingsvraag om iets weg te halen is een vraag waar nee het
    // verkeerde antwoord op is.
    if (naam === 'wijs_niet_meer') return ctrl.mcpWijsNietMeer(arg.id);

    // Hier begint jouw kant. Alles hieronder vraagt het eerst — behalve wat we
    // hoe dan ook weigeren. Een vraagscherm over een privétabblad zou de titel
    // ervan tonen, en dat is precies de inhoud die daar niet uit hoort.
    if (naam === 'lees_jouw_pagina' || naam === 'bekijk_jouw_pagina'
        || naam === 'wijs_aan' || naam === 'wijs_stap') {
      const bezwaar = ctrl.priveBezwaar(arg.id);
      if (bezwaar) {
        this.meld({ soort: 'geweigerd', naam, tekst: t('log.geweigerd', { wat: bezwaar }) });
        throw new Error(bezwaar);
      }
    }

    if (naam === 'typ') {
      const bezwaar = ctrl.typBezwaar(arg.veld, arg.tekst);
      if (bezwaar) {
        this.meld({ soort: 'geweigerd', naam, tekst: t('log.geweigerd', { wat: bezwaar }) });
        throw new Error(bezwaar);
      }
    }

    /*
     * Vragen — behalve als er al geantwoord is met een knop.
     *
     * Een uitleg in vijf stappen zou anders vijf keer hetzelfde vragen. Dat
     * is niet strenger maar juist slapper: vijf vragen achter elkaar leert
     * mensen doorklikken. De eerste stap vraagt; daarna is de knop Volgende
     * het antwoord, en die staat op je eigen scherm en wordt door jou
     * ingedrukt. Stoppen breekt de reeks af en dan vraagt stap 1 opnieuw.
     * De boekhouding staat in main.js, bij gidsStapOordeel.
     */
    let vragen = true;
    // Aanwijzen na een vraag die de gebruiker zelf in het wolkje typte vraagt
    // niet opnieuw: die vraag ging over deze pagina en is er zelf al een
    // handeling op. Zie magWijzen in lib/gids/reeks.js; het geldt voor één
    // beurt, op één tabblad.
    if (naam === 'wijs_aan') vragen = ctrl.gidsWijsOordeel(arg.id).vragen;
    if (naam === 'wijs_stap') {
      const oordeel = ctrl.gidsStapOordeel(arg.id, arg.stap, arg.van);
      if (oordeel.bezwaar) {
        this.meld({ soort: 'geweigerd', naam, tekst: t('log.geweigerd', { wat: oordeel.bezwaar }) });
        throw new Error(oordeel.bezwaar);
      }
      vragen = oordeel.vragen;
    }

    if (vragen) {
      const vraag = await ctrl.mcpVraagToestemming(naam, arg);
      if (!vraag.goed) {
        this.meld({ soort: 'geweigerd', naam, tekst: t('log.nietGedaan', { wat: vraag.reden }) });
        throw new Error(`Niet toegestaan: ${vraag.reden}`);
      }
    }
    this.meld({ soort: 'toegestaan', naam, tekst: t('log.toegestaan', { wat: beschrijf(naam, arg) }) });

    if (naam === 'lees_jouw_pagina') return ctrl.mcpLeesJouwPagina(arg.id, MAX_TEKENS);
    if (naam === 'klik') return ctrl.mcpKlik(arg.id, arg.tekst);
    if (naam === 'typ') return ctrl.mcpTyp(arg.id, arg.veld, arg.tekst);
    if (naam === 'bekijk_jouw_pagina') return ctrl.mcpBekijkJouwPagina(arg.id);
    if (naam === 'wijs_aan') return ctrl.mcpWijsAan(arg.id, arg.ref, arg.tekst);
    if (naam === 'wijs_stap') return ctrl.mcpWijsStap(arg.id, arg.ref, arg.tekst, arg.stap, arg.van);
    throw new Error(`Onbekend gereedschap: ${naam}`);
  }
}

// Wat er in het logboek komt te staan, in gewone taal. Niet "open_pagina({url})"
// maar wat er werkelijk gebeurt, want dat is wat je wilt kunnen nalezen.
const SLEUTELS = {
  open_pagina: 'doet.open',
  lees_pagina: 'doet.lees',
  sluit_pagina: 'doet.sluit',
  lijst_paginas: 'doet.lijst',
  jouw_paginas: 'doet.jouwLijst',
  lees_jouw_pagina: 'doet.leesJouw',
  bekijk_jouw_pagina: 'doet.bekijkJouw',
  wijs_aan: 'doet.wijs',
  wijs_stap: 'doet.wijsStap',
  wijs_niet_meer: 'doet.wijsNiet',
  klik: 'doet.klik',
};

function beschrijf(naam, arg) {
  if (naam === 'typ') {
    // Wat op een geheim lijkt komt niet in het logboek, ook niet als het wordt
    // geweigerd. Het logboek staat op je scherm, en een geweigerd wachtwoord dat
    // daar leesbaar blijft staan is het wachtwoord alsnog kwijt.
    const geheim = NOOIT_TYPEN.test(String(arg.veld ?? '')) || NOOIT_TYPEN.test(String(arg.tekst ?? ''));
    const wat = geheim ? t('doet.geheim') : `"${kort(arg.tekst)}"`;
    return t('doet.typ', { wat, veld: arg.veld });
  }
  const sleutel = SLEUTELS[naam];
  if (!sleutel) return naam;
  return t(sleutel, { url: arg.url, id: arg.id, van: arg.van, tekst: arg.tekst });
}

// Lange tekst in een logregel maakt hem onleesbaar, en juist die regel moet je
// in één oogopslag kunnen wegen.
const kort = (t) => {
  const s = String(t ?? '');
  return s.length > 40 ? s.slice(0, 40) + '…' : s;
};

module.exports = { McpDeur, GEREEDSCHAP, MAX_TEKENS, NOOIT_TYPEN, NOOIT_VELDSOORT, NOOIT_AANVULLING, beschrijf };
