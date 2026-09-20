// Sessieherstel: waar je gebleven was, terug na het afsluiten.
//
// ─────────────────────────────────────────────────────────────────────────
// WAT HIER WEL EN NIET IN GAAT, EN WAAROM
//
// Wel: je vensters, per venster je workspaces, hun namen, hun uiterlijk, de
// partitie waarin ze stonden, en per workspace de adressen van je tabbladen
// met de volgorde en welk tabblad vooraan stond.
//
// NIET: privéworkspaces. Dat is geen omissie maar de hele belofte. Een
// privéworkspace draait op een sessie die niet op schijf staat; zou hij hier wél
// in komen, dan stond na het afsluiten alsnog op je schijf wát je bekeken had,
// en dan is "privé" een woord geworden in plaats van een eigenschap. Wie een
// privéworkspace wil bewaren, bedoelt eigenlijk een gewone.
//
// NIET: de inhoud van pagina's, formuliervelden of scrollposities. Dit is een
// lijst adressen. Alles daarbovenop is een kopie van je browsen op schijf, en
// dat is precies wat een browser níét hoort te doen zonder dat je erom vraagt.
//
// ── WAAROM DE PARTITIE ERIN STAAT ───────────────────────────────────────
// Een workspace ís zijn sessie: `persist:ws-3` is de map met de koekjes en de
// logins. Vroeger kreeg een herstelde workspace een nieuw nummer op volgorde,
// en dan kwam workspace 2 terug als `persist:ws-1` — met de koekjes van een
// ándere workspace. Eén workspace sluiten en herstarten was genoeg om overal
// uitgelogd te zijn, zonder dat iemand kon zien waarom. De naam gaat daarom
// mee, en wordt bij het teruglezen streng nagekeken: het is een string van
// schijf en die bepaalt welke map wordt opengedaan.
//
// ── WAAROM PER VENSTER ──────────────────────────────────────────────────
// Elk venster schrijft zijn eigen stand onder zijn eigen sleutel. Eén lijst
// voor alles zou betekenen dat het laatste venster dat iets verandert de rest
// overschrijft, en dan verlies je de tabbladen van het venster waar je nét
// niet in bezig was.
//
// Schrijven gebeurt met de stand van dát moment, niet bij het afsluiten alleen:
// een browser die vastloopt of wordt afgeschoten heeft geen afsluitmoment, en
// juist dan wil je je tabbladen terug.
// ─────────────────────────────────────────────────────────────────────────

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');

const BESTAND = 'laatste-sessie.json';

// Te vaak schrijven kost schijf en levert niets op; te weinig en je verliest de
// laatste minuut. Twee seconden na de laatste verandering is de afweging.
const RUST_MS = 2000;

// Meer vensters dan dit terugzetten is bijna zeker een fout in het bestand en
// niet een wens van de gebruiker. Twintig vensters openen bij het starten is
// erger dan er een paar niet terugzetten.
const MAX_VENSTERS = 8;

let pad = null;
let timer = null;
// sleutel (venster) -> lijst workspaces. Een Map, want de volgorde waarin
// vensters zich melden is de volgorde waarin ze terugkomen.
const standen = new Map();
let vuil = false;

function zetPad(map) {
  pad = path.join(map, BESTAND);
}

/**
 * Is dit een partitienaam die wij zelf ooit hebben uitgedeeld?
 *
 * Strenger dan nodig lijkt, maar dit is een string van schijf die bepaalt
 * welke map met koekjes wordt opengedaan. Alles wat er niet exact uitziet als
 * `persist:ws-<getal>` krijgt gewoon een nieuwe.
 */
function geldigePartitie(naam) {
  return typeof naam === 'string' && /^persist:ws-[1-9][0-9]{0,8}$/.test(naam);
}

/** Het nummer uit een partitienaam, of 0. */
function nummerVan(naam) {
  const m = geldigePartitie(naam) ? naam.match(/(\d+)$/) : null;
  return m ? Number(m[1]) : 0;
}

/**
 * Wat er op schijf staat, in de vorm van vandaag.
 *
 * Versie 1 had één platte lijst workspaces: dat was één venster, dus die komt
 * terug als één venster. Een bestand van een oudere versie hoort geen reden te
 * zijn om met niets te beginnen.
 */
function lees() {
  try {
    const rauw = JSON.parse(fs.readFileSync(pad, 'utf8'));
    if (Array.isArray(rauw?.vensters)) {
      const vensters = rauw.vensters
        .map((v) => (Array.isArray(v?.workspaces) ? v.workspaces : null))
        .filter(Boolean)
        .slice(0, MAX_VENSTERS);
      return vensters.length ? { versie: 2, vensters } : null;
    }
    if (Array.isArray(rauw?.workspaces)) {
      return rauw.workspaces.length ? { versie: 1, vensters: [rauw.workspaces] } : null;
    }
    return null;
  } catch {
    // Nog nooit geschreven, of onleesbaar. Beginnen met een leeg tabblad is
    // vervelend; niet kunnen starten is erger.
    return null;
  }
}

/** Het hoogste workspacenummer dat in dit bestand voorkomt. */
function hoogsteNummer(gelezen) {
  let hoogste = 0;
  for (const venster of gelezen?.vensters ?? []) {
    for (const groep of venster) hoogste = Math.max(hoogste, nummerVan(groep?.partitie));
  }
  return hoogste;
}

function watErStaat() {
  return {
    versie: 2,
    op: Date.now(),
    vensters: [...standen.values()].map((workspaces) => ({ workspaces })),
  };
}

async function schrijfNu() {
  if (!vuil || !pad) return;
  vuil = false;
  const inhoud = JSON.stringify(watErStaat(), null, 2);
  const tijdelijk = `${pad}.tmp`;
  // Eerst ernaast, dan omnoemen: valt de stroom uit tijdens het schrijven, dan
  // staat de vorige stand er nog heel.
  await fsp.writeFile(tijdelijk, inhoud, 'utf8');
  await fsp.rename(tijdelijk, pad);
}

/**
 * Legt de stand van één venster vast. Mag zo vaak aangeroepen worden als er
 * iets verandert; het schrijven zelf wordt uitgesteld.
 *
 * @param {number|string} venster  een sleutel die dit venster uniek maakt
 * @param {Array} workspaces  [{ naam, palet, beweging, partitie, actief, tabbladen: [url] }]
 */
function bewaar(venster, workspaces) {
  if (!pad) return;
  standen.set(venster, workspaces);
  vuil = true;
  clearTimeout(timer);
  timer = setTimeout(() => schrijfNu().catch(() => {}), RUST_MS);
}

/**
 * Een venster is dicht: zijn stand hoort niet meer bij morgen.
 *
 * De beller beslist wanneer dit geldt, en dat is niet altijd. Het láátste
 * venster sluiten is hoe je dit programma afsluit, en dan wil je je tabbladen
 * morgen terug — dus daar wordt dit niet aangeroepen. Een van de twee sluiten
 * is wél een keuze om er één over te houden. Zie main.js, bij 'closed'.
 */
function vergeetVenster(venster) {
  standen.delete(venster);
  vuil = true;
  clearTimeout(timer);
  timer = setTimeout(() => schrijfNu().catch(() => {}), RUST_MS);
}

/** Meteen wegschrijven, voor het afsluiten. */
function flush() {
  clearTimeout(timer);
  if (!vuil || !pad) return;
  try {
    fs.writeFileSync(`${pad}.tmp`, JSON.stringify(watErStaat(), null, 2), 'utf8');
    fs.renameSync(`${pad}.tmp`, pad);
    vuil = false;
  } catch {
    // Bij het afsluiten valt er niets meer te melden.
  }
}

function wis() {
  clearTimeout(timer);
  standen.clear();
  vuil = false;
  try {
    fs.unlinkSync(pad);
  } catch {
    // Stond er al niet.
  }
}

module.exports = {
  zetPad, lees, bewaar, vergeetVenster, flush, wis,
  geldigePartitie, nummerVan, hoogsteNummer,
  RUST_MS, MAX_VENSTERS,
};
