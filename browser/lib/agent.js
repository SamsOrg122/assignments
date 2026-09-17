// De assistent: jouw eigen abonnement, op jouw eigen computer.
//
// ─────────────────────────────────────────────────────────────────────────
// HET IDEE
//
// Je typt een opdracht in de balk. Wij starten de agent die jij al hebt staan —
// Claude Code — als kindproces op deze machine, met onze eigen brug erin
// geschreven. Hij denkt op jouw abonnement. Elke handeling die hij wil doen komt
// terug in deze browser en gaat langs hetzelfde toestemmingsscherm als een
// client van buiten.
//
// Waarom niet zelf een model aanroepen: dan betaalden wij per opdracht, en een
// agent die pagina's leest en doorklikt verbrandt veel. Belangrijker nog, dan
// zou jouw tekst langs onze server gaan. Nu gaat hij rechtstreeks van jouw
// computer naar jouw aanbieder, en wij zien er niets van.
//
// ─────────────────────────────────────────────────────────────────────────
// WAT DE AGENT HIER WÉL EN NIET MAG
//
// Claude Code kan normaal ook je bestanden lezen, schrijven en een shell
// starten. Dat hoort hier niet: jij vraagt iets over het web, niet over je
// schijf. Dus worden al zijn eigen stukken gereedschap uitgezet en blijft
// alleen onze lijst over. Zijn eigen MCP-servers blijven ook buiten beeld; wat
// jij elders hebt aangesloten gaat deze opdracht niets aan.
//
// Wat overblijft is precies de lijst uit lib/mcp.js, met dezelfde grens: vier
// dingen mag hij vrij in zijn eigen lege workspace, en alles wat jouw kant
// raakt vraagt het elke keer opnieuw.
//
// ─────────────────────────────────────────────────────────────────────────
// OPZETTEN
//
// Niets. Staat de agent op deze computer, dan vinden we hem en werkt het. Staat
// hij er niet, dan zeggen we dat met één regel over hoe je hem haalt. Er is
// geen sleutel om te plakken en geen bestand om te bewerken: de brug wordt per
// opdracht geschreven en de deur gaat daarna weer dicht.
// ─────────────────────────────────────────────────────────────────────────

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

// Waar de agent aan te herkennen is als hij nog niet is aangemeld. Zijn eigen
// zin verwijst naar /login, en dat is een opdracht binnen zijn eigen scherm —
// hier heb je er niets aan.
const NIET_AANGEMELD = /not logged in|please run \/login/i;

// Meer dan één soort agent kan hier komen te staan. De volgorde is de voorkeur.
const KANDIDATEN = [
  { naam: 'Claude Code', bestanden: ['claude.exe', 'claude.cmd', 'claude'], soort: 'claude' },
];

// Waar we zoeken buiten PATH om. Een gebruiker die met de installatie meeging
// heeft hem hier staan, ook als zijn PATH in deze sessie nog niet bijgewerkt is.
const EXTRA_PLEKKEN = () => [
  process.env.APPDATA && path.join(process.env.APPDATA, 'npm'),
  process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Programs', 'claude'),
  process.env.HOME && path.join(process.env.HOME, '.local', 'bin'),
  process.env.USERPROFILE && path.join(process.env.USERPROFILE, '.local', 'bin'),
  '/usr/local/bin',
  '/opt/homebrew/bin',
].filter(Boolean);

/**
 * Het echte programma achter een doorgeefluik.
 *
 * Een .cmd van npm bevat de regel die het echte programma aanroept, met %dp0%
 * voor de eigen map. Die halen we eruit. Lukt dat niet, dan geven we het
 * doorgeefluik zelf terug en merkt de beller het bij het starten.
 */
function echteUitvoerbare(pad) {
  if (!pad.toLowerCase().endsWith('.cmd')) return pad;
  let inhoud;
  try {
    inhoud = fs.readFileSync(pad, 'utf8');
  } catch {
    return pad;
  }
  const map = path.dirname(pad);
  for (const regel of inhoud.split(/\r?\n/)) {
    const treffer = regel.match(/"([^"]+\.exe)"/i);
    if (!treffer) continue;
    const vol = path.normalize(treffer[1].replace(/%dp0%/gi, map + path.sep));
    try {
      if (fs.statSync(vol).isFile()) return vol;
    } catch {
      // Staat er niet; volgende regel.
    }
  }
  return pad;
}

/**
 * Zoekt de agent op deze computer.
 *
 * @param {object} o
 * @param {string} o.pad        de PATH om te doorzoeken
 * @param {Function} o.bestaat  bestandscontrole, injecteerbaar voor de toetsen
 * @returns {{naam: string, pad: string, soort: string}|null}
 */
function zoekAgent(o = {}) {
  const {
    pad = process.env.PATH ?? '',
    extra = EXTRA_PLEKKEN(),
    bestaat = (p) => {
      try {
        return fs.statSync(p).isFile();
      } catch {
        return false;
      }
    },
  } = o;

  // Aangewezen door de omgeving. Een .js of .mjs draaien we met Electron als
  // node, zodat een toetsprogramma geen losse node nodig heeft.
  const aangewezen = o.aangewezen ?? process.env.TOUGATHER_AGENT;
  if (aangewezen) {
    return /\.(mjs|cjs|js)$/i.test(aangewezen)
      ? {
        naam: 'Aangewezen agent',
        pad: process.execPath,
        voor: [aangewezen],
        env: { ELECTRON_RUN_AS_NODE: '1' },
        soort: 'aangewezen',
      }
      : { naam: 'Aangewezen agent', pad: aangewezen, soort: 'aangewezen' };
  }

  const mappen = [...String(pad).split(path.delimiter), ...extra].filter(Boolean);
  for (const kandidaat of KANDIDATEN) {
    for (const map of mappen) {
      for (const bestand of kandidaat.bestanden) {
        const vol = path.join(map, bestand);
        if (bestaat(vol)) {
          return { naam: kandidaat.naam, pad: echteUitvoerbare(vol), soort: kandidaat.soort };
        }
      }
    }
  }
  return null;
}

/**
 * De brug, als configuratie voor de agent.
 *
 * Electron draait zichzelf als node, zodat er op deze computer geen losse node
 * hoeft te staan. De brug zoekt zelf de poort en de sleutel op; die staan hier
 * met opzet niet in, want een configuratie blijft ergens liggen en een sleutel
 * hoort dat niet te doen.
 */
function bouwBrugConfig({ elektron, brug, naam = 'tougather' }) {
  return JSON.stringify({
    mcpServers: {
      [naam]: {
        command: elektron,
        args: [brug],
        env: { ELECTRON_RUN_AS_NODE: '1' },
      },
    },
  });
}

// Wat de agent moet weten over waar hij is. Kort: een lange uitleg kost bij
// elke opdracht tokens van de gebruiker en leest het model toch maar half.
const HOUDING = [
  'Je werkt in Tougather Browser, op de computer van de gebruiker.',
  'Je hebt alleen het gereedschap van tougather. Er is geen shell en geen bestandssysteem.',
  'Open en lees pagina\'s in je eigen workspace; dat kost de gebruiker niets.',
  'De tabbladen van de gebruiker zijn iets anders: lees_jouw_pagina, klik en typ',
  'vragen elke keer om toestemming en kunnen geweigerd worden. Vraag daar alleen',
  'om als het echt nodig is en zeg erbij waarom.',
  'Antwoord kort, en in de taal waarin de opdracht gesteld is.',
].join(' ');

/*
 * De gids is een andere houding, niet een andere assistent.
 *
 * Een opdracht is "doe dit voor mij" en mag daarvoor pagina's openen. Een
 * vraag over deze pagina is "waar staat dat" en mag dat juist niet: de
 * gebruiker kijkt naar zijn eigen scherm en verwacht dat het blijft staan.
 * Daarom staat hier expliciet wat hij niet doet — en daarom krijgt een
 * gidsronde ook een kortere lijst gereedschap mee, want een houding is een
 * instructie en geen grendel.
 *
 * Het laatste zinnetje is het hele punt van de gids: antwoorden in woorden is
 * de helft, de andere helft is laten zien waar.
 */
const GIDS_HOUDING = [
  'Je bent de gids in Tougather Browser. De gebruiker kijkt naar een pagina en',
  'stelt er een vraag over. Jij legt uit en wijst aan; je klikt niet, je typt',
  'niet en je navigeert nergens heen.',
  'Werk zo: bekijk_jouw_pagina geeft je de indeling met refs erin. Kies de ref',
  'die het antwoord is en roep wijs_aan aan met een uitleg van hoogstens twee',
  'zinnen. Die tekst komt naast de aanwijzer op het scherm van de gebruiker te',
  'staan, dus schrijf hem alsof je naast iemand zit.',
  'Wijs precies één ding aan. Weet je het niet, zeg dat dan en wijs niets aan.',
  'Antwoord kort, en in de taal waarin de vraag gesteld is.',
].join(' ');

/**
 * Welk gereedschap een gidsronde krijgt. Kijken en wijzen, verder niets:
 * geen pagina openen, geen klik, geen toetsaanslag, en ook niet de tekst van
 * de pagina — de indeling is genoeg om iets aan te kunnen wijzen.
 */
const GIDS_GEREEDSCHAP = ['jouw_paginas', 'bekijk_jouw_pagina', 'wijs_aan', 'wijs_niet_meer'];

/**
 * De aanroep, helemaal uitgeschreven.
 *
 * Elk stuk hier houdt iets buiten de deur; zie de kop van dit bestand.
 */
function bouwArgumenten({ opdracht, brugConfig, gereedschap, brugNaam = 'tougather', houding = HOUDING }) {
  return [
    '-p', String(opdracht),
    '--output-format', 'stream-json',
    // stream-json in print-modus geeft pas losse berichten met --verbose; zonder
    // dat komt er één blok aan het eind en zie je onderweg niets.
    '--verbose',
    '--mcp-config', brugConfig,
    // Alleen onze brug. Wat de gebruiker elders heeft aangesloten gaat deze
    // opdracht niets aan.
    '--strict-mcp-config',
    // Al zijn eigen gereedschap uit: geen shell, geen bestanden, geen zoeken
    // buiten ons om. Een lege tekst is hoe je dat opgeeft.
    '--tools', '',
    // En onze lijst er expliciet in, zodat hij niet bij elke stap blijft staan
    // op een vraag die hij in deze modus niet kan stellen. De echte vraag stelt
    // de browser, aan jou.
    '--allowedTools', ...gereedschap.map((g) => `mcp__${brugNaam}__${g}`),
    '--disable-slash-commands',
    '--no-session-persistence',
    '--append-system-prompt', houding,
  ];
}

/**
 * Eén regel uit de stroom, vertaald naar wat er op het scherm hoort.
 *
 * Alles wat we niet kennen levert null op. De vorm van die stroom is niet van
 * ons, dus een onbekend bericht is geen fout maar iets om over heen te lopen.
 */
function leesRegel(regel, brugNaam = 'tougather') {
  let b;
  try {
    b = JSON.parse(regel);
  } catch {
    return null;
  }
  if (!b || typeof b !== 'object') return null;

  if (b.type === 'system' && b.subtype === 'init') return { soort: 'begin' };

  if (b.type === 'assistant') {
    const delen = b.message?.content ?? [];
    const uit = [];
    for (const deel of delen) {
      if (deel.type === 'text' && deel.text?.trim()) {
        uit.push({ soort: 'zegt', tekst: deel.text.trim() });
      }
      if (deel.type === 'tool_use') {
        uit.push({
          soort: 'doet',
          naam: String(deel.name ?? '').replace(`mcp__${brugNaam}__`, ''),
          invoer: deel.input ?? {},
        });
      }
    }
    return uit.length ? uit : null;
  }

  if (b.type === 'user') {
    const mis = (b.message?.content ?? []).find((d) => d.type === 'tool_result' && d.is_error);
    if (mis) {
      const tekst = typeof mis.content === 'string'
        ? mis.content
        : (mis.content ?? []).map((d) => d.text).filter(Boolean).join(' ');
      return { soort: 'mislukt', tekst: String(tekst ?? '').slice(0, 200) };
    }
    return null;
  }

  if (b.type === 'result') {
    return b.is_error || b.subtype !== 'success'
      ? { soort: 'fout', tekst: String(b.result ?? b.subtype ?? 'onbekende fout').slice(0, 200) }
      : { soort: 'klaar', tekst: String(b.result ?? '').trim().slice(0, 400) };
  }

  return null;
}

/**
 * Is de agent aangemeld?
 *
 * Eén aanroep van een seconde, zonder tokens: hij vraagt het aan zijn eigen
 * opslag, niet aan een server. De uitkomst null betekent "kan het niet zeggen"
 * en is niet hetzelfde als nee; dan proberen we het gewoon en laat de opdracht
 * zelf zien wat er mis is.
 */
function vraagAanmelding(agent, { maak = spawn, wachtMs = 8000 } = {}) {
  return new Promise((klaar) => {
    let af = false;
    const eindig = (uitkomst) => {
      if (af) return;
      af = true;
      klaar(uitkomst);
    };
    let kind;
    try {
      kind = maak(agent.pad, [...(agent.voor ?? []), 'auth', 'status', '--json'], {
        stdio: ['ignore', 'pipe', 'ignore'],
        windowsHide: true,
        env: { ...process.env, ...(agent.env ?? {}) },
      });
    } catch {
      return eindig(null);
    }
    let uit = '';
    kind.stdout.setEncoding('utf8');
    kind.stdout.on('data', (brok) => { uit += brok; });
    kind.on('error', () => eindig(null));
    kind.on('close', () => {
      try {
        const b = JSON.parse(uit);
        eindig({ aangemeld: Boolean(b.loggedIn), manier: b.authMethod ?? null });
      } catch {
        eindig(null);
      }
    });
    setTimeout(() => {
      try {
        kind.kill();
      } catch { /* al weg */ }
      eindig(null);
    }, wachtMs);
  });
}

/**
 * Eén lopende opdracht.
 *
 * Start het kindproces, knipt de uitvoer in regels, en meldt elk stukje. Meer
 * doet hij niet: wat er op het scherm gebeurt is aan de beller.
 */
class Opdracht {
  constructor({ agent, elektron, brug, gereedschap, opMelding, werkmap, brugNaam = 'tougather', houding = HOUDING, maak = spawn }) {
    this.agent = agent;
    this.elektron = elektron;
    this.brug = brug;
    this.gereedschap = gereedschap;
    this.opMelding = opMelding;
    this.werkmap = werkmap;
    this.brugNaam = brugNaam;
    this.houding = houding;
    this.maak = maak;
    this.kind = null;
    this.rest = '';
    this.fouten = '';
  }

  start(opdracht) {
    const argumenten = bouwArgumenten({
      opdracht,
      brugConfig: bouwBrugConfig({ elektron: this.elektron, brug: this.brug, naam: this.brugNaam }),
      gereedschap: this.gereedschap,
      brugNaam: this.brugNaam,
      houding: this.houding,
    });

    this.kind = this.maak(this.agent.pad, [...(this.agent.voor ?? []), ...argumenten], {
      // Een lege map: dan vindt hij geen CLAUDE.md en geen project om iets mee
      // te bedoelen. Hij hoort hier over het web te gaan, niet over een repo.
      cwd: this.werkmap ?? undefined,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      env: { ...process.env, ...(this.agent.env ?? {}) },
    });

    this.kind.stdout.setEncoding('utf8');
    this.kind.stdout.on('data', (brok) => this.slik(brok));
    this.kind.stderr.setEncoding('utf8');
    this.kind.stderr.on('data', (brok) => { this.fouten += brok; });

    this.kind.on('error', (e) => {
      this.opMelding({ soort: 'fout', tekst: `De agent wilde niet starten: ${e.message}` });
      this.kind = null;
    });
    this.kind.on('close', (code) => {
      this.slik('\n');
      // Een nette afsluiting heeft zijn eind al gemeld. Alleen als het misging
      // en er niets over te zeggen viel, zeggen we het hier alsnog.
      if (code !== 0 && this.kind) {
        this.opMelding({
          soort: 'fout',
          tekst: this.fouten.trim().split('\n').pop()?.slice(0, 200) || `De agent stopte met ${code}.`,
        });
      }
      this.kind = null;
      this.opMelding({ soort: 'afgelopen' });
    });
    return this;
  }

  slik(brok) {
    this.rest += brok;
    const regels = this.rest.split('\n');
    this.rest = regels.pop() ?? '';
    for (const regel of regels) {
      if (!regel.trim()) continue;
      const uit = leesRegel(regel, this.brugNaam);
      if (!uit) continue;
      for (const melding of Array.isArray(uit) ? uit : [uit]) this.opMelding(melding);
    }
  }

  get bezig() {
    return Boolean(this.kind);
  }

  /**
   * Stoppen, inclusief wat hij zelf gestart heeft.
   *
   * Op Windows neemt kill() alleen het proces zelf mee en blijft de brug als
   * wees achter. taskkill met /T ruimt de hele boom op.
   */
  stop() {
    const kind = this.kind;
    this.kind = null;
    if (!kind?.pid) return;
    if (process.platform === 'win32') {
      try {
        spawn('taskkill', ['/pid', String(kind.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
        return;
      } catch {
        // Dan maar op de gewone manier.
      }
    }
    try {
      kind.kill();
    } catch {
      // Al weg.
    }
  }
}

module.exports = {
  zoekAgent, vraagAanmelding, bouwArgumenten, bouwBrugConfig, leesRegel, Opdracht,
  KANDIDATEN, HOUDING, GIDS_HOUDING, GIDS_GEREEDSCHAP, NIET_AANGEMELD,
};
