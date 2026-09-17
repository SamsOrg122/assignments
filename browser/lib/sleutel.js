'use strict';

/**
 * De API-sleutel van de gebruiker.
 *
 * ── WAAROM DIT EEN EIGEN BESTAND IS EN GEEN VOORKEUR ────────────────────
 * `voorkeuren.alles()` gaat als geheel naar de zijbalk. Een sleutel die daar
 * in staat, staat dus ook in een renderer, in elke stand die daar langskomt
 * en in elke foutmelding die hem meeneemt. Dit bestand verlaat het
 * hoofdproces niet: naar buiten gaat alleen `heeft()`, een ja of een nee.
 *
 * ── WAAROM SAFESTORAGE ──────────────────────────────────────────────────
 * Op Windows, macOS en de meeste Linux-desktops kan Electron een geheim door
 * de sleutelbos van het systeem laten versleutelen. Dan staat er op schijf
 * geen leesbare sleutel maar een blok bytes dat alleen deze gebruiker op deze
 * computer terugkrijgt. Waar dat niet kan — een Linux zonder keyring — valt
 * het terug op platte tekst, en dan staat dat er ook bij: liegen over waar je
 * geheim staat is erger dan het niet kunnen versleutelen.
 *
 * ── WAAR HIJ HEEN GAAT ──────────────────────────────────────────────────
 * Naar api.anthropic.com, en nergens anders. Niet langs onze server, niet
 * langs /api, niet in een logregel. Zie lib/api.js.
 */

const { app, safeStorage } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

let pad = null;
let onthouden = null;

function bestand() {
  if (!pad) pad = path.join(app.getPath('userData'), 'sleutel.dat');
  return pad;
}

/** Kan het systeem dit geheim voor ons versleutelen? */
function kanVersleutelen() {
  try {
    return safeStorage.isEncryptionAvailable();
  } catch {
    return false;
  }
}

/**
 * De sleutel wegschrijven. Een lege tekst wist hem.
 *
 * Het bestand krijgt 0600: de versleuteling is de eerste laag, maar een
 * bestand dat de hele machine kan lezen is ook zonder inhoud al een fout.
 */
function zet(nieuw) {
  const tekst = String(nieuw ?? '').trim();
  onthouden = tekst || null;
  try {
    if (!tekst) {
      fs.rmSync(bestand(), { force: true });
      return { bewaard: false, versleuteld: false };
    }
    const versleuteld = kanVersleutelen();
    const inhoud = versleuteld
      ? safeStorage.encryptString(tekst)
      : Buffer.from(`plat:${tekst}`, 'utf8');
    fs.writeFileSync(bestand(), inhoud, { mode: 0o600 });
    return { bewaard: true, versleuteld };
  } catch {
    // Schijf vol of geen rechten. De sleutel werkt deze draai nog wel, want
    // hij staat in het geheugen; hij komt alleen niet terug na een herstart.
    return { bewaard: false, versleuteld: false };
  }
}

/** De sleutel, of null. Blijft in het hoofdproces. */
function lees() {
  if (onthouden !== null) return onthouden;
  try {
    const rauw = fs.readFileSync(bestand());
    const tekst = rauw.subarray(0, 5).toString('utf8') === 'plat:'
      ? rauw.subarray(5).toString('utf8')
      : safeStorage.decryptString(rauw);
    onthouden = tekst.trim() || null;
  } catch {
    onthouden = null;
  }
  return onthouden;
}

/** Wat de zijbalk mag weten: of er een staat, en hoe hij bewaard is. */
function heeft() {
  const s = lees();
  return {
    aanwezig: Boolean(s),
    // De laatste vier tekens, zodat je kunt zien wélke sleutel er staat
    // zonder dat er iets bruikbaars op het scherm komt.
    staart: s ? s.slice(-4) : '',
    versleuteld: Boolean(s) && kanVersleutelen(),
  };
}

function wis() {
  return zet('');
}

/** Alleen voor reeksen: het pad verleggen zodat er niets echts wordt geraakt. */
function zetPadVoorTest(nieuwPad) {
  pad = nieuwPad;
  onthouden = null;
}

module.exports = { zet, lees, heeft, wis, kanVersleutelen, zetPadVoorTest };
