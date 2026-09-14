// Inloggen met Google, en waarom dat hier anders loopt dan in een gewone app.
//
// ─────────────────────────────────────────────────────────────────────────
// WAT DE BEDOELING IS
//
// Je klikt in Tougather op "Ga verder met Google". Daarna wil je twee dingen
// tegelijk, en de meeste apps geven er maar één:
//
//   1. Een Tougather-account, ingelogd.
//   2. Ook ínlogd zijn bij Google in deze browser, zodat Gmail en Drive in een
//      gewoon tabblad meteen openstaan.
//
// Het tweede lukt alleen als het Google-scherm in een echt tabblad staat, in de
// sessie van je workspace. Een verborgen venster of de systeembrowser zet die
// koekjes ergens anders neer, en dan ben je daarna nergens ingelogd behalve in
// dat ene venster dat je nooit meer ziet.
//
// Dus: de app begint de aanmelding, wij vangen die navigatie af en zetten hem in
// een gewoon tabblad. Google zet zijn koekjes in jouw workspace. Supabase stuurt
// je daarna terug naar tougather://app/auth/callback, wij vangen dát af en geven
// het adres door aan de app. De app maakt het af — met de codeverifier die daar
// al stond, want daar begon het.
//
// ─────────────────────────────────────────────────────────────────────────
// WAAROM DIT STRENG IS
//
// Die terugkomst draagt de sleutels van je sessie. Zou elke pagina daarheen
// mogen navigeren, dan kon een willekeurige site jou in het account van een
// ander zetten — en dan leest die ander alles wat jij daarna opschrijft. Het is
// een bekende aanval en hij heet sessiefixatie.
//
// Daarom wordt een terugkomst alleen aangenomen als:
//   • jij zelf net een aanmelding begonnen bent,
//   • in precies het tabblad dat wij daarvoor openden,
//   • en binnen een kwartier.
// Alles daarbuiten gaat niet door en wordt gemeld in plaats van stilgeslikt.
// ─────────────────────────────────────────────────────────────────────────

// Een kwartier is ruim voor "waar was ik ook alweer, welk account" en kort
// genoeg dat een vergeten poging niet de hele middag open blijft staan.
const GELDIG_MS = 15 * 60 * 1000;

/**
 * Is dit het begin van een aanmelding bij een andere partij?
 *
 * Supabase stuurt je via /auth/v1/authorize naar Google, en via /auth/v1/sso
 * naar de inlog van een organisatie. Alleen die twee, en alleen over https.
 */
function isAanmeldStart(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') return false;
    return u.pathname === '/auth/v1/authorize' || u.pathname === '/auth/v1/sso';
  } catch {
    return false;
  }
}

/** Komt de aanmelding hier weer binnen? */
function isTerugkomst(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'tougather:' && u.hostname === 'app'
      && u.pathname === '/auth/callback';
  } catch {
    return false;
  }
}

/**
 * Wat er misging, als er iets misging.
 *
 * Supabase hangt een afwijzing aan het adres, soms in de zoekstring en soms
 * achter het hekje. Beide lezen, want welke van de twee het wordt hangt af van
 * de instelling van het project en niet van iets dat wij bepalen.
 */
function foutIn(url) {
  try {
    const u = new URL(url);
    const uitHek = new URLSearchParams((u.hash || '').replace(/^#/, ''));
    const beschrijving = u.searchParams.get('error_description')
      ?? uitHek.get('error_description');
    const kort = u.searchParams.get('error') ?? uitHek.get('error');
    if (!beschrijving && !kort) return null;
    return String(beschrijving || kort).replace(/\+/g, ' ');
  } catch {
    return null;
  }
}

/**
 * Houdt bij dat er één aanmelding loopt, en van welk tabblad.
 *
 * Eén tegelijk. Twee aanmeldingen door elkaar leveren twee terugkomsten op en
 * dan valt niet meer te zeggen welke bij jou hoort.
 */
class Aanmelding {
  constructor() {
    this.bezig = null;
  }

  begin(tabId, url) {
    this.bezig = { tabId, url, op: Date.now() };
  }

  /** Mag deze terugkomst, uit dit tabblad? */
  hoortBij(tabId) {
    if (!this.bezig) return false;
    if (this.bezig.tabId !== tabId) return false;
    if (Date.now() - this.bezig.op > GELDIG_MS) return false;
    return true;
  }

  klaar() {
    const was = this.bezig;
    this.bezig = null;
    return was;
  }

  get loopt() {
    return Boolean(this.bezig) && Date.now() - this.bezig.op <= GELDIG_MS;
  }
}

/**
 * De useragent zonder het woord Electron.
 *
 * Niet om te doen alsof: dit ís een volledige Chromium met tabbladen, een
 * adresbalk en eigen sessies. Maar Google weigert aanmeldingen van alles waar
 * "Electron" in staat, omdat dat meestal een ingebouwd venstertje in een andere
 * app is dat je wachtwoord wil zien. Het label klopt hier niet met wat het
 * beschrijft, en het label is wat de deur dichthoudt.
 *
 * Wat we er wél bij zetten is onze eigen naam. Een browser hoort te zeggen wie
 * hij is; dat doen Edge en Opera ook, en daar is niets stiekems aan.
 */
function useragentVoor(standaard, versie, naam = 'Tougather') {
  const zonder = String(standaard)
    .replace(/\s*Electron\/[\d.]+/i, '')
    // De naam van de app staat vlak vóór Chrome/ — precies de plek waar een
    // ingebouwd venstertje in een andere app zich meldt. Onze naam hoort
    // achteraan, zoals Edge en Opera dat doen, en niet twee keer.
    .replace(new RegExp('\\s*' + naam + '\\/[\\d.]+(?=\\s+Chrome\\/)', 'i'), '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return zonder.includes('TougatherBrowser')
    ? zonder
    : zonder + ' TougatherBrowser/' + versie;
}

module.exports = { isAanmeldStart, isTerugkomst, foutIn, Aanmelding, useragentVoor, GELDIG_MS };
