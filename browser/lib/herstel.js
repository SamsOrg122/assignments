// Sessieherstel: waar je gebleven was, terug na het afsluiten.
//
// ─────────────────────────────────────────────────────────────────────────
// WAT HIER WEL EN NIET IN GAAT, EN WAAROM
//
// Wel: je workspaces, hun namen, hun uiterlijk, en per workspace de adressen van
// je tabbladen met de volgorde en welk tabblad vooraan stond.
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

let pad = null;
let timer = null;
let wachtend = null;

function zetPad(map) {
  pad = path.join(map, BESTAND);
}

function lees() {
  try {
    const rauw = JSON.parse(fs.readFileSync(pad, 'utf8'));
    return Array.isArray(rauw?.workspaces) ? rauw : null;
  } catch {
    // Nog nooit geschreven, of onleesbaar. Beginnen met een leeg tabblad is
    // vervelend; niet kunnen starten is erger.
    return null;
  }
}

async function schrijfNu() {
  if (!wachtend || !pad) return;
  const inhoud = JSON.stringify(wachtend, null, 2);
  wachtend = null;
  const tijdelijk = `${pad}.tmp`;
  // Eerst ernaast, dan omnoemen: valt de stroom uit tijdens het schrijven, dan
  // staat de vorige stand er nog heel.
  await fsp.writeFile(tijdelijk, inhoud, 'utf8');
  await fsp.rename(tijdelijk, pad);
}

/**
 * Legt de huidige stand vast. Mag zo vaak aangeroepen worden als er iets
 * verandert; het schrijven zelf wordt uitgesteld.
 *
 * @param {Array} workspaces  [{ naam, palet, beweging, actief, tabbladen: [url] }]
 */
function bewaar(workspaces) {
  if (!pad) return;
  wachtend = { versie: 1, op: Date.now(), workspaces };
  clearTimeout(timer);
  timer = setTimeout(() => schrijfNu().catch(() => {}), RUST_MS);
}

/** Meteen wegschrijven, voor het afsluiten. */
function flush() {
  clearTimeout(timer);
  if (!wachtend || !pad) return;
  try {
    fs.writeFileSync(`${pad}.tmp`, JSON.stringify(wachtend, null, 2), 'utf8');
    fs.renameSync(`${pad}.tmp`, pad);
    wachtend = null;
  } catch {
    // Bij het afsluiten valt er niets meer te melden.
  }
}

function wis() {
  clearTimeout(timer);
  wachtend = null;
  try {
    fs.unlinkSync(pad);
  } catch {
    // Stond er al niet.
  }
}

module.exports = { zetPad, lees, bewaar, flush, wis, RUST_MS };
