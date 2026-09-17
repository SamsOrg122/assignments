'use strict';

/**
 * Wat er binnenkomt.
 *
 * Eén lijst voor het hele programma en niet één per venster: een download
 * hoort bij de computer, niet bij het raam waar je toevallig in stond. Elk
 * venster schrijft zich in met `opVerandering` en krijgt dezelfde lijst.
 *
 * ── DE LIJST STAAT NERGENS OP SCHIJF ────────────────────────────────────
 * Alleen in het geheugen, en hij is weg als de browser dichtgaat. Dat is
 * niet uit luiheid: het is wat maakt dat een download uit een privéworkspace
 * geen spoor achterlaat dat die workspace zelf niet mocht achterlaten. Het
 * bestand staat er natuurlijk wel — je hebt het opgehaald — maar er is geen
 * geschiedenis die zegt waar het vandaan kwam.
 *
 * ── WAAROM NIET ALLES TE OPENEN IS ──────────────────────────────────────
 * Een pdf openen we, een .exe niet. `shell.openPath` is precies hetzelfde
 * als dubbelklikken in de verkenner, en een browser die één klik zet tussen
 * "een site stuurde je dit" en "het draait nu" is een browser die die klik
 * te goedkoop maakt. Voor die bestanden is er alleen "toon in map": daar
 * doe je het zelf, op je eigen risico, met alles wat je systeem er zelf nog
 * omheen zegt. Zie `UITVOERBAAR`.
 */

const path = require('node:path');
const fs = require('node:fs');
const { shell } = require('electron');

// Alles wat op een dubbelklik iets kán draaien — programma's, installers,
// scripts, snelkoppelingen. De lijst is bewust ruim: te veel "toon in map" is
// een kleine ergernis, te weinig is een browser die iets start.
const UITVOERBAAR = new Set([
  'exe', 'msi', 'msix', 'com', 'scr', 'bat', 'cmd', 'pif', 'cpl', 'msc', 'hta',
  'reg', 'lnk', 'url', 'inf', 'ps1', 'psm1', 'vbs', 'vbe', 'wsf', 'wsh', 'js',
  'jse', 'jar', 'app', 'dmg', 'pkg', 'mpkg', 'command', 'workflow', 'scpt',
  'deb', 'rpm', 'appimage', 'run', 'bin', 'elf', 'so', 'dll', 'sh', 'bash',
  'zsh', 'fish', 'py', 'rb', 'pl', 'php', 'apk', 'desktop', 'action', 'osx',
]);

/** Kan dit bestand opengaan met één klik, of alleen in de map getoond worden? */
function magOpen(naam) {
  const ext = path.extname(naam).slice(1).toLowerCase();
  // Geen extensie is geen geruststelling: op Unix hangt het uitvoerbaar zijn
  // aan een bit en niet aan de naam.
  return ext !== '' && !UITVOERBAAR.has(ext);
}

/**
 * Een plek in `map` die nog vrij is: "rapport.pdf", dan "rapport (1).pdf".
 *
 * Twee keer hetzelfde bestand ophalen moet twee bestanden opleveren. Zou de
 * tweede de eerste overschrijven, dan is een klik op een verkeerde link genoeg
 * om iets kwijt te raken dat je al had.
 */
function vrijePlek(map, gevraagd) {
  const naam = path.basename(String(gevraagd || 'download'));
  const ext = path.extname(naam);
  const romp = path.basename(naam, ext) || 'download';
  let plek = path.join(map, `${romp}${ext}`);
  for (let n = 1; fs.existsSync(plek) && n < 1000; n += 1) {
    plek = path.join(map, `${romp} (${n})${ext}`);
  }
  return plek;
}

/** De host waar het vandaan kwam, of een lege string als dat niet te zien is. */
function hostVan(url) {
  try {
    return new URL(url).host;
  } catch {
    return '';
  }
}

class Downloads {
  constructor() {
    /** @type {Map<number, object>} de platte regels die de zijbalk tekent */
    this.regels = new Map();
    /** @type {Map<number, Electron.DownloadItem>} alleen wat nog loopt */
    this.levend = new Map();
    this.luisteraars = new Set();
    this.volgende = 1;
    this.tik = null;
    // Waar bestanden landen. Los te zetten zodat een reeks niet in de echte
    // downloadmap van wie hem draait gaat schrijven.
    this.map = null;
  }

  opVerandering(fn) {
    this.luisteraars.add(fn);
    return () => this.luisteraars.delete(fn);
  }

  /**
   * Hangt aan één sessie. Elke workspace heeft er een, dus dit wordt vaak
   * aangeroepen; de vlag houdt het bij één luisteraar per sessie.
   */
  bewaak(ses) {
    if (!ses || ses.__downloadsGehangen) return;
    ses.__downloadsGehangen = true;
    ses.on('will-download', (_e, item) => this.neem(item));
  }

  neem(item) {
    const id = this.volgende++;
    const map = this.map ?? path.dirname(item.getSavePath() || '.');
    const plek = vrijePlek(map, item.getFilename());

    // Zonder dit opent Chromium een "opslaan als"-venster per bestand. Elke
    // browser zet het gewoon in je downloadmap; het venster is wat je doet als
    // je niet weet waar iets heen moet, en dat weten we hier wel.
    try {
      item.setSavePath(plek);
    } catch {
      // Een item dat al onderweg was accepteert geen pad meer. Dan landt het
      // waar Chromium het wilde hebben en tekenen we dát.
    }

    const regel = {
      id,
      naam: path.basename(item.getSavePath() || plek),
      host: hostVan(item.getURL()),
      status: 'bezig',
      ontvangen: item.getReceivedBytes(),
      totaal: item.getTotalBytes(),
      pad: item.getSavePath() || plek,
      kanOpenen: false,
      begonnen: Date.now(),
    };
    this.regels.set(id, regel);
    this.levend.set(id, item);

    item.on('updated', (_e, staat) => {
      regel.ontvangen = item.getReceivedBytes();
      regel.totaal = item.getTotalBytes();
      regel.status = staat === 'interrupted' ? 'gepauzeerd' : item.isPaused() ? 'gepauzeerd' : 'bezig';
      this.melden();
    });

    item.once('done', (_e, staat) => {
      this.levend.delete(id);
      regel.pad = item.getSavePath() || regel.pad;
      regel.naam = path.basename(regel.pad);
      regel.ontvangen = item.getReceivedBytes();
      regel.totaal = item.getTotalBytes() || item.getReceivedBytes();
      regel.status = staat === 'completed' ? 'klaar' : staat === 'cancelled' ? 'gestopt' : 'stuk';
      regel.kanOpenen = regel.status === 'klaar' && magOpen(regel.naam);
      this.melden(true);
    });

    this.melden(true);
  }

  /**
   * De zijbalk hoeft niet elke 64 kilobyte een hertekening. Één bericht per
   * 120 milliseconden is genoeg voor een balk die vloeiend oogt, en het
   * scheelt bij een grote download duizenden berichten.
   */
  melden(nu = false) {
    if (nu) {
      if (this.tik) { clearTimeout(this.tik); this.tik = null; }
      for (const fn of this.luisteraars) fn(this.lijst());
      return;
    }
    if (this.tik) return;
    this.tik = setTimeout(() => {
      this.tik = null;
      for (const fn of this.luisteraars) fn(this.lijst());
    }, 120);
  }

  /** Nieuwste bovenaan: wat er net binnenkwam is waar je naar kijkt. */
  lijst() {
    return [...this.regels.values()].sort((a, b) => b.id - a.id);
  }

  pauzeer(id) {
    const item = this.levend.get(id);
    if (!item) return;
    if (item.isPaused()) item.resume();
    else item.pause();
    const regel = this.regels.get(id);
    if (regel) regel.status = item.isPaused() ? 'gepauzeerd' : 'bezig';
    this.melden(true);
  }

  stop(id) {
    this.levend.get(id)?.cancel();
  }

  /** Alleen wat af is en niet uit zichzelf iets kan starten. Zie boven. */
  open(id) {
    const regel = this.regels.get(id);
    if (!regel || !regel.kanOpenen) return false;
    shell.openPath(regel.pad);
    return true;
  }

  toon(id) {
    const regel = this.regels.get(id);
    if (!regel || regel.status !== 'klaar') return false;
    shell.showItemInFolder(regel.pad);
    return true;
  }

  /**
   * De lijst leegmaken haalt alleen de regels weg, nooit de bestanden. Een
   * knop die "wissen" heet en je bestanden opruimt is een val.
   */
  wis() {
    for (const [id] of this.regels) if (!this.levend.has(id)) this.regels.delete(id);
    this.melden(true);
  }

  wisEen(id) {
    if (this.levend.has(id)) return;
    this.regels.delete(id);
    this.melden(true);
  }
}

module.exports = { Downloads, downloads: new Downloads(), magOpen, vrijePlek, UITVOERBAAR };
