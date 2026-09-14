// Opgeslagen sessies: een workspace wegleggen en later terughalen.
//
// ─────────────────────────────────────────────────────────────────────────
// WAAROM DIT BESTAAT
//
// Dit is de functie die vrijwel geen enkele browser heeft, en het is wat mensen
// bedoelen als ze zeggen dat hun browser slecht is met tabbladen. Niemand houdt
// veertig tabbladen open omdat hij daar veertig dingen tegelijk mee doet. Hij
// houdt ze open omdat sluiten betekent dat hij ze kwijt is.
//
// Wegleggen moet dus twee beloftes waarmaken, en de tweede is de moeilijkste:
//
//   1. Sluiten mag niet voelen als verliezen. Naam, tabbladen, volgorde en welk
//      tabblad je open had: allemaal terug.
//   2. Wat je weglegt moet er over een half jaar nog zijn. Dus op schijf, in
//      gewone JSON die een mens kan lezen, en geschreven op een manier die een
//      half bestand oplevert als de stroom uitvalt: eerst ernaast, dan pas op
//      zijn plek.
//
// Wat er met opzet NIET in gaat: de inhoud van de pagina's. Een sessie is een
// lijstje adressen, geen archief. En privéworkspaces horen hier niet thuis — die
// hebben als hele punt dat er niets van blijft staan, en dat is geen uitzondering
// maar de definitie.
// ─────────────────────────────────────────────────────────────────────────

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');

const BESTAND = 'sessies.json';

// Genoeg om een werkweek aan sessies te bewaren zonder dat dit ongemerkt groeit
// tot een bestand dat je nooit meer doorleest.
const MAX_SESSIES = 50;

let pad = null;
let sessies = [];
let geladen = false;

function zetPad(map) {
  pad = path.join(map, BESTAND);
}

function laad() {
  if (geladen) return sessies;
  geladen = true;
  try {
    const rauw = JSON.parse(fs.readFileSync(pad, 'utf8'));
    sessies = Array.isArray(rauw?.sessies) ? rauw.sessies : [];
  } catch {
    // Nog niets weggelegd, of een bestand dat niet te lezen is. In beide
    // gevallen beginnen we leeg; een sessie kwijtraken is vervelend, maar de
    // browser niet kunnen starten is erger.
    sessies = [];
  }
  return sessies;
}

async function schrijf() {
  const tijdelijk = `${pad}.tmp`;
  const inhoud = JSON.stringify({ versie: 1, sessies }, null, 2);
  // Eerst ernaast, dan omnoemen. Valt de stroom uit tijdens het schrijven, dan
  // staat het oude bestand er nog heel; anders had je een halve lijst.
  await fsp.writeFile(tijdelijk, inhoud, 'utf8');
  await fsp.rename(tijdelijk, pad);
}

const alles = () => laad().map((s) => ({
  id: s.id,
  naam: s.naam,
  aantal: s.tabbladen.length,
  weggelegdOp: s.weggelegdOp,
  hosts: s.tabbladen.slice(0, 4).map((t) => t.host).filter(Boolean),
}));

/**
 * Legt een workspace weg.
 *
 * @param {object} ws           de workspace zoals het venster hem kent
 * @param {Array} tabbladen     [{ url, titel, host }], in de volgorde die je zag
 * @param {number|null} actief  welk tabblad vooraan stond, als index
 */
async function bewaar(ws, tabbladen, actief) {
  if (ws.prive) throw new Error('Een privéworkspace leg je niet weg; daar gaat hij juist niet over.');
  const bruikbaar = tabbladen.filter((t) => t.url && /^https?:/.test(t.url));
  if (!bruikbaar.length) throw new Error('Er staat niets in om weg te leggen.');

  laad();
  const sessie = {
    id: `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    naam: ws.name,
    palet: ws.palet ?? null,
    beweging: ws.beweging ?? 'rustig',
    weggelegdOp: Date.now(),
    actief: Math.min(Math.max(0, actief ?? 0), bruikbaar.length - 1),
    tabbladen: bruikbaar.map((t) => ({ url: t.url, titel: t.titel ?? '', host: t.host ?? '' })),
  };

  // Nieuwste vooraan: dat is wat je zoekt als je hier komt.
  sessies.unshift(sessie);
  if (sessies.length > MAX_SESSIES) sessies.length = MAX_SESSIES;
  await schrijf();
  return sessie;
}

function vind(id) {
  return laad().find((s) => s.id === id) ?? null;
}

async function verwijder(id) {
  laad();
  const voor = sessies.length;
  sessies = sessies.filter((s) => s.id !== id);
  if (sessies.length !== voor) await schrijf();
  return voor !== sessies.length;
}

async function hernoem(id, naam) {
  const s = vind(id);
  if (!s) return false;
  const schoon = String(naam ?? '').trim().slice(0, 60);
  if (!schoon) return false;
  s.naam = schoon;
  await schrijf();
  return true;
}

module.exports = { zetPad, alles, bewaar, vind, verwijder, hernoem, MAX_SESSIES };
