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

  async roep(naam, arg) {
    const ctrl = this.geefController();
    if (!ctrl) throw new Error('Er is geen venster open');
    const stuk = GEREEDSCHAP.find((g) => g.naam === naam);
    if (!stuk) throw new Error(`Onbekend gereedschap: ${naam}`);

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

    // Hier begint jouw kant. Alles hieronder vraagt het eerst — behalve wat we
    // hoe dan ook weigeren. Een vraagscherm over een privétabblad zou de titel
    // ervan tonen, en dat is precies de inhoud die daar niet uit hoort.
    if (naam === 'lees_jouw_pagina') {
      const bezwaar = ctrl.priveBezwaar(arg.id);
      if (bezwaar) {
        this.meld({ soort: 'geweigerd', naam, tekst: `Geweigerd: ${bezwaar}` });
        throw new Error(bezwaar);
      }
    }

    if (naam === 'typ') {
      const bezwaar = ctrl.typBezwaar(arg.veld, arg.tekst);
      if (bezwaar) {
        this.meld({ soort: 'geweigerd', naam, tekst: `Geweigerd: ${bezwaar}` });
        throw new Error(bezwaar);
      }
    }

    const vraag = await ctrl.mcpVraagToestemming(naam, arg);
    if (!vraag.goed) {
      this.meld({ soort: 'geweigerd', naam, tekst: `Niet gedaan: ${vraag.reden}` });
      throw new Error(`Niet toegestaan: ${vraag.reden}`);
    }
    this.meld({ soort: 'toegestaan', naam, tekst: `Toegestaan: ${beschrijf(naam, arg)}` });

    if (naam === 'lees_jouw_pagina') return ctrl.mcpLeesJouwPagina(arg.id, MAX_TEKENS);
    if (naam === 'klik') return ctrl.mcpKlik(arg.id, arg.tekst);
    if (naam === 'typ') return ctrl.mcpTyp(arg.id, arg.veld, arg.tekst);
    throw new Error(`Onbekend gereedschap: ${naam}`);
  }
}

// Wat er in het logboek komt te staan, in gewone taal. Niet "open_pagina({url})"
// maar wat er werkelijk gebeurt, want dat is wat je wilt kunnen nalezen.
function beschrijf(naam, arg) {
  if (naam === 'open_pagina') return `Opent ${arg.url}`;
  if (naam === 'lees_pagina') return `Leest pagina ${arg.id}`;
  if (naam === 'sluit_pagina') return `Sluit pagina ${arg.id}`;
  if (naam === 'lijst_paginas') return 'Vraagt welke pagina\'s open staan';
  if (naam === 'jouw_paginas') return 'Vraagt de titels van jouw tabbladen';
  if (naam === 'lees_jouw_pagina') return `Wil jouw pagina ${arg.id} lezen`;
  if (naam === 'klik') return `Wil klikken op "${arg.tekst}" in pagina ${arg.id}`;
  if (naam === 'typ') {
    // Wat op een geheim lijkt komt niet in het logboek, ook niet als het wordt
    // geweigerd. Het logboek staat op je scherm, en een geweigerd wachtwoord dat
    // daar leesbaar blijft staan is het wachtwoord alsnog kwijt.
    const geheim = NOOIT_TYPEN.test(String(arg.veld ?? '')) || NOOIT_TYPEN.test(String(arg.tekst ?? ''));
    const wat = geheim ? 'iets dat op een geheim lijkt' : `"${kort(arg.tekst)}"`;
    return `Wil ${wat} typen in "${arg.veld}"`;
  }
  return naam;
}

// Lange tekst in een logregel maakt hem onleesbaar, en juist die regel moet je
// in één oogopslag kunnen wegen.
const kort = (t) => {
  const s = String(t ?? '');
  return s.length > 40 ? s.slice(0, 40) + '…' : s;
};

module.exports = { McpDeur, GEREEDSCHAP, MAX_TEKENS, NOOIT_TYPEN, NOOIT_VELDSOORT, NOOIT_AANVULLING, beschrijf };
