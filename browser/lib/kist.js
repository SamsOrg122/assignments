'use strict';

/**
 * De gereedschapskist: ánder gereedschap dan het onze, voor de assistent.
 *
 * ── WAT DIT OPLOST ──────────────────────────────────────────────────────
 * De browser was tot nu toe alleen MCP-server: een client mocht bij ons naar
 * binnen, maar de assistent in de balk kwam nergens anders. Dat is precies één
 * kant te weinig. Wie zijn agenda, zijn repo of zijn notities via MCP heeft
 * aangesloten, wil "zet dit in mijn agenda" kunnen typen in de balk waar hij
 * toch al staat, en niet in een tweede programma ernaast.
 *
 * ── WAT ER NIET VERANDERT ───────────────────────────────────────────────
 * `--strict-mcp-config` blijft staan. Wat je elders hebt aangesloten komt dus
 * nog steeds niet zomaar mee: je zet het hier neer, met de hand, één keer. Dat
 * is met opzet omslachtiger dan overnemen. Een browser die stilletjes alles
 * meepakt wat er in je ~/.claude.json staat, geeft een pagina die je opent
 * toegang tot je hele leven zonder dat je dat ooit hebt gezegd.
 *
 * Een server die uit staat zit niet in de configuratie — hij bestaat niet voor
 * de agent. Dat is beter dan hem meesturen en zijn gereedschap weigeren: een
 * geweigerd gereedschap is een agent die blijft hangen op een vraag die in deze
 * modus niemand kan stellen.
 *
 * ── WAAR HET NIET GELDT ─────────────────────────────────────────────────
 * - **De gids niet.** Die kijkt naar je pagina en wijst aan. Een gids met een
 *   shell is geen gids.
 * - **Een client van buiten niet.** Anders is de browser een doorgeefluik naar
 *   jouw andere gereedschap, en dat heeft niemand gevraagd.
 * - **De API-rug niet.** Die lus draait in dit proces en roept onze eigen deur
 *   aan; er is geen kindproces om een tweede server aan te hangen. Het scherm
 *   zegt dat, in plaats van stil minder te doen.
 *
 * ── EN DE TOESTEMMING DAN ───────────────────────────────────────────────
 * Bij een klik op jouw tabblad vraagt de browser het per keer, want hij weet
 * wat er gaat gebeuren. Bij `mcp__notion__update_page` weet hij dat niet: hij
 * kan niet beschrijven wat een vreemde server doet, en een vraag die "weet je
 * het zeker?" zegt zonder te zeggen waarover, is een vraag waar je op leert
 * klikken. Dus ligt de toestemming waar hij eerlijk kan liggen: bij het
 * aanzetten van die ene server, en bij het zien van elke aanroep in de regel
 * eronder — met de servernaam ervoor, zodat "dit was niet de browser" te zien
 * is. En de noodstop haalt de stekker eruit.
 *
 * ── GEHEIMEN ────────────────────────────────────────────────────────────
 * Een server heeft vaak een token nodig. Dat staat dus niet in
 * `voorkeuren.json`, want dat bestand gaat als geheel naar de zijbalk. Het gaat
 * door de sleutelbos van het systeem, net als de API-sleutel, en naar buiten
 * gaan alleen de namen van de variabelen — nooit hun waarde. Zie lib/sleutel.js
 * voor waarom dat zo geregeld is.
 */

const fs = require('node:fs');
const path = require('node:path');

const MAX_SERVERS = 6;
const MAX_ARGUMENTEN = 24;
const MAX_OMGEVING = 10;
const MAX_GEREEDSCHAP = 30;

// Een naam wordt letterlijk `mcp__<naam>__<gereedschap>`, dus hij moet passen in
// wat een gereedschapsnaam mag zijn en mag geen dubbele lage streep bevatten —
// anders is niet meer te zeggen waar de servernaam ophoudt.
const NAAM = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/;
const OMGEVING_SLEUTEL = /^[A-Za-z_][A-Za-z0-9_]*$/;
const GEREEDSCHAP_NAAM = /^[a-z0-9][a-z0-9_-]*$/i;

/**
 * Een commandoregel in stukken, zoals een shell dat zou doen — en verder niets.
 *
 * Alleen aanhalingstekens en witruimte. Geen `|`, geen `&&`, geen `$(…)`: die
 * tekens komen hier gewoon als tekst mee en gaan als één argument door. Dat is
 * niet armoede maar het punt. Wat de gebruiker intypt wordt met `spawn` zonder
 * shell gestart, dus er is niets dat een pijp of een puntkomma zou uitvoeren.
 */
function splitsRegel(tekst) {
  const uit = [];
  let nu = '';
  let bezig = false;
  let quote = null;
  for (const teken of String(tekst ?? '')) {
    if (quote) {
      if (teken === quote) quote = null;
      else nu += teken;
      continue;
    }
    if (teken === '"' || teken === "'") {
      quote = teken;
      bezig = true;
      continue;
    }
    if (/\s/.test(teken)) {
      if (bezig) uit.push(nu);
      nu = '';
      bezig = false;
      continue;
    }
    nu += teken;
    bezig = true;
  }
  if (bezig) uit.push(nu);
  return uit;
}

/**
 * `SLEUTEL=waarde` per regel, naar een object.
 *
 * Een regel zonder `=` is een vergissing en geen lege variabele: dan heeft
 * iemand een token geplakt zonder de naam ervoor, en dat hoort te vertellen.
 */
function leesOmgeving(tekst) {
  const omgeving = {};
  for (const rauw of String(tekst ?? '').split(/\r?\n/)) {
    const regel = rauw.trim();
    if (!regel || regel.startsWith('#')) continue;
    const knip = regel.indexOf('=');
    if (knip < 1) return { ok: false, code: 'omgeving' };
    const sleutel = regel.slice(0, knip).trim();
    if (!OMGEVING_SLEUTEL.test(sleutel)) return { ok: false, code: 'omgeving' };
    if (Object.keys(omgeving).length >= MAX_OMGEVING) return { ok: false, code: 'omgevingVol' };
    omgeving[sleutel] = regel.slice(knip + 1).trim();
  }
  return { ok: true, omgeving };
}

/**
 * Eén server nakijken voordat hij de kist in gaat.
 *
 * Geeft een code terug en geen zin: welke taal die zin heeft is aan het scherm,
 * niet aan dit bestand. Zie `kist.fout*` in renderer/taal.js.
 */
function keurServer(rauw, { bestaand = [], brugNaam = 'tougather' } = {}) {
  const naam = String(rauw?.naam ?? '').trim().toLowerCase();
  if (!naam || naam.length > 24 || !NAAM.test(naam)) return { ok: false, code: 'naam' };
  if (naam === brugNaam) return { ok: false, code: 'naamGereserveerd' };
  if (bestaand.some((s) => s.naam === naam)) return { ok: false, code: 'naamBezet' };
  if (bestaand.length >= MAX_SERVERS) return { ok: false, code: 'vol' };

  // Commando en argumenten mogen als één regel binnenkomen of al gesplitst.
  const stukken = Array.isArray(rauw?.argumenten) && rauw.commando
    ? [String(rauw.commando), ...rauw.argumenten.map((a) => String(a))]
    : splitsRegel(rauw?.commando ?? rauw?.regel);
  if (!stukken.length || !stukken[0]) return { ok: false, code: 'commando' };
  if (stukken.length - 1 > MAX_ARGUMENTEN) return { ok: false, code: 'argumenten' };
  if (stukken.some((s) => /[\r\n\0]/.test(s))) return { ok: false, code: 'commando' };

  const omgeving = rauw?.omgeving && typeof rauw.omgeving === 'object' && !Array.isArray(rauw.omgeving)
    ? { ok: true, omgeving: rauw.omgeving }
    : leesOmgeving(rauw?.omgeving ?? '');
  if (!omgeving.ok) return omgeving;
  for (const [s, w] of Object.entries(omgeving.omgeving)) {
    if (!OMGEVING_SLEUTEL.test(s) || /[\r\n\0]/.test(String(w))) return { ok: false, code: 'omgeving' };
  }

  const gereedschap = (Array.isArray(rauw?.gereedschap)
    ? rauw.gereedschap
    : splitsRegel(rauw?.gereedschap)
  ).map((g) => String(g).trim()).filter(Boolean);
  if (gereedschap.length > MAX_GEREEDSCHAP) return { ok: false, code: 'gereedschap' };
  if (gereedschap.some((g) => !GEREEDSCHAP_NAAM.test(g))) return { ok: false, code: 'gereedschap' };

  return {
    ok: true,
    server: {
      naam,
      commando: stukken[0],
      argumenten: stukken.slice(1),
      omgeving: Object.fromEntries(
        Object.entries(omgeving.omgeving).map(([s, w]) => [s, String(w)]),
      ),
      gereedschap,
      // Uit, ook al heb je hem net zelf ingetypt. Toevoegen is beschrijven; het
      // aanzetten is de toestemming, en die hoort een eigen handeling te zijn.
      aan: false,
    },
  };
}

/**
 * Een lijst van schijf of uit een oudere versie, teruggebracht tot wat mag.
 *
 * Alles wat niet door de keuring komt valt weg. Een half geldige server stil
 * repareren zou betekenen dat de agent iets start wat de gebruiker niet heeft
 * opgeschreven.
 */
function schoon(lijst, { brugNaam = 'tougather' } = {}) {
  const uit = [];
  for (const rauw of Array.isArray(lijst) ? lijst : []) {
    const gekeurd = keurServer(rauw, { bestaand: uit, brugNaam });
    if (!gekeurd.ok) continue;
    uit.push({ ...gekeurd.server, aan: Boolean(rauw?.aan) });
  }
  return uit;
}

/** Alleen wat aan staat. De rest bestaat niet voor de agent. */
function aanIn(kist) {
  return (Array.isArray(kist) ? kist : []).filter((s) => s.aan);
}

/**
 * De configuratie voor `--mcp-config`: onze brug, en wat de gebruiker aanzette.
 *
 * Onze brug staat eerst en wordt nooit overschreven; de keuring houdt een
 * server met onze naam al buiten de deur, en hier staat het nog een keer in de
 * vorm van code.
 */
function bouwConfig({ elektron, brug, brugNaam = 'tougather', kist = [] }) {
  const mcpServers = {
    [brugNaam]: { command: elektron, args: [brug], env: { ELECTRON_RUN_AS_NODE: '1' } },
  };
  for (const s of aanIn(kist)) {
    if (s.naam === brugNaam) continue;
    mcpServers[s.naam] = {
      command: s.commando,
      args: s.argumenten ?? [],
      ...(Object.keys(s.omgeving ?? {}).length ? { env: { ...s.omgeving } } : {}),
    };
  }
  return JSON.stringify({ mcpServers });
}

/**
 * Wat er in `--allowedTools` komt.
 *
 * Een servernaam zonder gereedschap erachter laat alles van die server toe;
 * dat is gemeten, niet aangenomen. Wie het smaller wil, noemt de stukken op en
 * krijgt precies die. Beide vormen staan hier omdat beide een gebruiker zijn:
 * "mijn agenda mag alles" en "alleen lezen".
 */
function bouwToestaan({ brugNaam = 'tougather', gereedschap = [], kist = [] }) {
  const uit = gereedschap.map((g) => `mcp__${brugNaam}__${g}`);
  for (const s of aanIn(kist)) {
    if (s.gereedschap?.length) uit.push(...s.gereedschap.map((g) => `mcp__${s.naam}__${g}`));
    else uit.push(`mcp__${s.naam}`);
  }
  return uit;
}

/**
 * De naam zoals hij op het scherm hoort.
 *
 * Ons eigen gereedschap heet gewoon zoals het heet. Dat van een ander krijgt
 * zijn server ervoor, want het verschil tussen "de browser deed dit" en "jouw
 * agenda deed dit" is het enige dat hier telt.
 */
function toonNaam(volledig, brugNaam = 'tougather') {
  const naam = String(volledig ?? '');
  const onze = `mcp__${brugNaam}__`;
  if (naam.startsWith(onze)) return naam.slice(onze.length);
  const deel = naam.match(/^mcp__([^_]+(?:_[^_]+)*)__(.+)$/);
  if (deel) return `${deel[1]} · ${deel[2]}`;
  return naam;
}

/**
 * Wat de zijbalk mag weten. Namen van variabelen, nooit waarden.
 */
function veilig(kist) {
  return (Array.isArray(kist) ? kist : []).map((s) => ({
    naam: s.naam,
    regel: [s.commando, ...(s.argumenten ?? [])].join(' '),
    omgevingNamen: Object.keys(s.omgeving ?? {}),
    gereedschap: [...(s.gereedschap ?? [])],
    aan: Boolean(s.aan),
  }));
}

/**
 * Wat de agent erover te horen krijgt.
 *
 * Zonder dit liegt de houding: daar staat "je hebt alleen het gereedschap van
 * tougather, er is geen shell en geen bestandssysteem". Klopt dat niet meer,
 * dan hoort het er niet meer te staan — en hoort er te staan wat er wél bij is
 * gekomen, want een model dat niet weet dat het een agenda heeft, gebruikt hem
 * niet.
 */
function houdingErbij(kist) {
  const aan = aanIn(kist);
  if (!aan.length) return '';
  const namen = aan.map((s) => s.naam).join(', ');
  return [
    `Behalve het gereedschap van tougather heb je ook wat de gebruiker zelf heeft aangesloten: ${namen}.`,
    'Dat is zijn eigen gereedschap en het kan buiten de browser iets veranderen.',
    'Gebruik het als de opdracht erom vraagt, niet om rond te kijken, en zeg wat je ermee gedaan hebt.',
  ].join(' ');
}

/* ── Op schijf ──────────────────────────────────────────────────────────
 *
 * Electron wordt hier pas opgehaald als het nodig is, zodat de regels hierboven
 * met gewone node te toetsen zijn. Zonder dat zou `test/kist.js` een venster
 * nodig hebben om een reguliere expressie na te kijken.
 */

let pad = null;
let onthouden = null;

function bestand() {
  if (!pad) {
    const { app } = require('electron');
    pad = path.join(app.getPath('userData'), 'kist.dat');
  }
  return pad;
}

function kanVersleutelen() {
  try {
    return require('electron').safeStorage.isEncryptionAvailable();
  } catch {
    return false;
  }
}

function schrijf(lijst) {
  onthouden = lijst;
  try {
    if (!lijst.length) {
      fs.rmSync(bestand(), { force: true });
      return;
    }
    const tekst = JSON.stringify(lijst);
    let inhoud;
    try {
      inhoud = kanVersleutelen()
        ? require('electron').safeStorage.encryptString(tekst)
        : Buffer.from(`plat:${tekst}`, 'utf8');
    } catch {
      inhoud = Buffer.from(`plat:${tekst}`, 'utf8');
    }
    fs.writeFileSync(bestand(), inhoud, { mode: 0o600 });
  } catch {
    // Schijf vol of geen rechten. Deze draai werkt het nog, want het staat in
    // het geheugen; het komt alleen niet terug na een herstart.
  }
}

/** De kist, uit het geheugen of van schijf. Blijft in het hoofdproces. */
function alles() {
  if (onthouden) return onthouden;
  let lijst = [];
  try {
    const rauw = fs.readFileSync(bestand());
    const tekst = rauw.subarray(0, 5).toString('utf8') === 'plat:'
      ? rauw.subarray(5).toString('utf8')
      : require('electron').safeStorage.decryptString(rauw);
    lijst = schoon(JSON.parse(tekst));
  } catch {
    lijst = [];
  }
  onthouden = lijst;
  return onthouden;
}

/** Toevoegen. Geeft de code van wat er mis was, of null. */
function voeg(rauw, { brugNaam = 'tougather' } = {}) {
  const gekeurd = keurServer(rauw, { bestaand: alles(), brugNaam });
  if (!gekeurd.ok) return gekeurd.code;
  schrijf([...alles(), gekeurd.server]);
  return null;
}

function zetAan(naam, aan) {
  schrijf(alles().map((s) => (s.naam === naam ? { ...s, aan: Boolean(aan) } : s)));
  return null;
}

function weg(naam) {
  schrijf(alles().filter((s) => s.naam !== naam));
  return null;
}

/** Alleen voor reeksen: het pad verleggen zodat er niets echts wordt geraakt. */
function zetPadVoorTest(nieuwPad) {
  pad = nieuwPad;
  onthouden = null;
}

module.exports = {
  MAX_SERVERS, MAX_ARGUMENTEN, MAX_OMGEVING, MAX_GEREEDSCHAP,
  splitsRegel, leesOmgeving, keurServer, schoon, aanIn,
  bouwConfig, bouwToestaan, toonNaam, veilig, houdingErbij,
  alles, voeg, zetAan, weg, kanVersleutelen, zetPadVoorTest,
};
