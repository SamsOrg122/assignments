'use strict';

/**
 * Waar je bent geweest.
 *
 * ── WAT ER NIET IN KOMT ─────────────────────────────────────────────────
 * Dit is de plek waar een browser het makkelijkst een belofte breekt, dus
 * staat de lijst met uitzonderingen bovenaan en niet ergens onderin:
 *
 *   · Een privéworkspace komt hier niet in. Niet "anders gemarkeerd", niet
 *     "korter bewaard" — hij wordt niet aangeboden en er is geen weg naar
 *     binnen die hem alsnog opneemt.
 *   · Een tabblad van de assistent of van een AI-client ook niet. Dat is
 *     niet jouw browsen, en het zou jouw geschiedenis vullen met pagina's
 *     die jij nooit hebt gezien.
 *   · Onze eigen pagina's niet: het nieuwe tabblad, de app, devtools. Die
 *     zijn geen bezoek.
 *
 * ── WAAROM ÉÉN BESTAND EN GEEN DATABASE ─────────────────────────────────
 * Omdat het er een paar duizend zijn en niet een paar miljoen. `GRENS` kapt
 * de lijst af op wat een mens in een jaar in de zijbalk terugzoekt; daarmee
 * past alles in het geheugen, is zoeken een filter over een array, en is het
 * bewaren hetzelfde atomaire schrijfje als bij de voorkeuren. Een sqlite
 * erbij zou hier alleen een afhankelijkheid zijn.
 */

const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

// Hoeveel bezoeken we bewaren. Ruim een jaar voor wie hard browst, en nog
// altijd een bestand van een paar megabyte.
const GRENS = 6000;

// Twee keer dezelfde pagina binnen deze tijd is één bezoek. Zonder dit levert
// één keer verversen, of een site die zichzelf omleidt, drie regels op.
const SAMEN = 60 * 1000;

/** Wat nooit wordt opgeschreven, ongeacht wie het vraagt. */
function teltMee(url) {
  if (!url) return false;
  try {
    const p = new URL(url).protocol;
    return p === 'http:' || p === 'https:';
  } catch {
    return false;
  }
}

class Geschiedenis {
  constructor() {
    /** @type {Array<{id: number, url: string, titel: string, tijd: number}>} nieuwste eerst */
    this.regels = [];
    this.volgende = 1;
    this.pad = null;
    this.timer = null;
    this.geladen = false;
  }

  bestand() {
    if (!this.pad) this.pad = path.join(app.getPath('userData'), 'geschiedenis.json');
    return this.pad;
  }

  laad() {
    if (this.geladen) return;
    this.geladen = true;
    try {
      const gelezen = JSON.parse(fs.readFileSync(this.bestand(), 'utf8'));
      if (!Array.isArray(gelezen.regels)) return;
      this.regels = gelezen.regels
        .filter((r) => r && typeof r.url === 'string' && teltMee(r.url))
        .slice(0, GRENS)
        .map((r, i) => ({
          id: i + 1,
          url: r.url,
          titel: String(r.titel ?? ''),
          tijd: Number(r.tijd) || 0,
        }));
      this.volgende = this.regels.length + 1;
    } catch {
      // Bestaat nog niet, of is stuk. Beide keren: een lege geschiedenis is
      // geen ramp, en zeker geen reden om niet te starten.
    }
  }

  /**
   * Een bezoek opschrijven. `opties.prive` en `opties.vanAssistent` zijn geen
   * filters die je kunt vergeten mee te geven maar het antwoord op één vraag:
   * is dit van de gebruiker zelf?
   */
  bezoek(url, titel, opties = {}) {
    if (opties.prive || opties.vanAssistent) return null;
    if (!teltMee(url)) return null;

    const nu = Date.now();
    const eerste = this.regels[0];
    if (eerste && eerste.url === url && nu - eerste.tijd < SAMEN) {
      // Dezelfde pagina, net geweest: de titel bijwerken is genoeg. Die komt
      // vaak later binnen dan de navigatie.
      if (titel) eerste.titel = String(titel);
      eerste.tijd = nu;
      this.plan();
      return eerste;
    }

    const regel = { id: this.volgende++, url, titel: String(titel ?? ''), tijd: nu };
    this.regels.unshift(regel);
    if (this.regels.length > GRENS) this.regels.length = GRENS;
    this.plan();
    return regel;
  }

  /**
   * De titel van het laatste bezoek aan deze url bijstellen. Een pagina meldt
   * zijn titel meestal pas nadat hij geladen is, dus zonder dit staat de halve
   * geschiedenis vol met kale adressen.
   */
  hernoem(url, titel) {
    if (!titel) return;
    const regel = this.regels.find((r) => r.url === url);
    if (!regel || regel.titel === titel) return;
    regel.titel = String(titel);
    this.plan();
  }

  /** Nieuwste eerst, gefilterd op woorden uit `term`. */
  zoek(term = '', limiet = 200) {
    const woorden = String(term).toLowerCase().split(/\s+/).filter(Boolean);
    const uit = [];
    for (const r of this.regels) {
      if (uit.length >= limiet) break;
      if (!woorden.length) { uit.push(r); continue; }
      const hooi = `${r.titel} ${r.url}`.toLowerCase();
      if (woorden.every((w) => hooi.includes(w))) uit.push(r);
    }
    return uit;
  }

  verwijder(id) {
    const i = this.regels.findIndex((r) => r.id === Number(id));
    if (i < 0) return false;
    this.regels.splice(i, 1);
    this.plan();
    return true;
  }

  /** Alles van deze host weg. Eén site die je liever niet bewaard had. */
  verwijderHost(host) {
    const voor = this.regels.length;
    this.regels = this.regels.filter((r) => {
      try {
        return new URL(r.url).host !== host;
      } catch {
        return true;
      }
    });
    if (this.regels.length !== voor) this.plan();
    return voor - this.regels.length;
  }

  /** `sinds` is een tijdstip; zonder argument gaat alles weg. */
  wis(sinds = 0) {
    const voor = this.regels.length;
    this.regels = sinds ? this.regels.filter((r) => r.tijd < sinds) : [];
    if (this.regels.length !== voor) this.schrijfNu();
    return voor - this.regels.length;
  }

  plan() {
    if (this.timer) return;
    this.timer = setTimeout(() => this.schrijfNu(), 1200);
  }

  schrijfNu() {
    clearTimeout(this.timer);
    this.timer = null;
    const doel = this.bestand();
    const tijdelijk = `${doel}.tmp`;
    try {
      // Zonder de ids: die zijn van deze draai en worden bij het laden opnieuw
      // uitgedeeld. Ze in het bestand zetten nodigt uit ze ergens te bewaren.
      const kaal = this.regels.map((r) => ({ url: r.url, titel: r.titel, tijd: r.tijd }));
      fs.writeFileSync(tijdelijk, JSON.stringify({ regels: kaal }), 'utf8');
      fs.renameSync(tijdelijk, doel);
    } catch {
      // Schijf vol of geen rechten. Een browser hoort daar niet op te vallen.
    }
  }

  flush() {
    if (this.timer) this.schrijfNu();
  }
}

module.exports = { Geschiedenis, geschiedenis: new Geschiedenis(), teltMee, GRENS, SAMEN };
