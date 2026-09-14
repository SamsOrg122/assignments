// De grendel: stap 1 uit docs/ontwerp/ROUTEKAART.md.
//
// Electron keurt permissieverzoeken standaard goed. Zonder dit bestand kan elke
// site die je opent camera, microfoon en locatie krijgen zonder dat je iets ziet.
// Even ernstig, en minder bekend: window.open('ms-msdt:...') gaat op Windows
// linea recta naar de schema-afhandeling van het besturingssysteem, en daar komt
// geen vraag aan te pas.
//
// Dit is met opzet de botte versie: alles wat een vraag zou opleveren wordt
// geweigerd, er is nog geen opslag en geen UI. Dat komt bij het permissiescherm
// (stap 7). Tot die tijd faalt het in de veilige richting, en dat is beter dan
// de situatie van vandaag.

const { session } = require('electron');

// Alleen wat ongevaarlijk is en zonder vragen mag. De rest wordt geweigerd,
// óók de dingen die een gebruiker misschien wil — die kunnen pas terug als er
// een scherm is om ze in te vragen.
const TOEGESTAAN = new Set([
  'clipboard-sanitized-write',
  'fullscreen',
  'pointerLock',
  'storage-access',
  'top-level-storage-access',
]);

// Gemeten op Electron 33.4.11: getCurrentPosition() roept géén van beide
// callbacks aan, ook niet als je 'geolocation' hier wél toestaat. Chromium's
// locatiedienst heeft een Google API-sleutel nodig die in de build gebakken moet
// zijn. Een pagina die op het antwoord wacht, wacht dus eeuwig — dat is een
// bestaande beperking van Electron en niet iets wat deze grendel veroorzaakt.

const WEB = new Set(['http:', 'https:']);

// Sessies worden gedeeld tussen vensters, dus dit mag per partitie precies één
// keer gebeuren: Electron houdt per sessie één permissiehandler en de tweede
// registratie vervangt de eerste zonder foutmelding.
const gegrendeld = new Set();

/**
 * Beoordeelt waar een url heen wil.
 *   web       gewoon internet, mag
 *   intern    onze eigen pagina's op schijf, mag
 *   extern    een ander programma (mailto:, ms-msdt:, steam:) — nu nooit
 *   verboden  onparseerbaar
 */
function beoordeelURL(url, eigenBasis) {
  if (url === 'about:blank') return 'web';
  let ontleed;
  try {
    ontleed = new URL(url);
  } catch {
    return 'verboden';
  }
  if (WEB.has(ontleed.protocol)) return 'web';
  if (ontleed.protocol === 'devtools:') return 'intern';
  // De app die met de browser meekomt. Eigen terrein, net als onze bestanden
  // op schijf: hij wordt uit app/ geserveerd en gaat nergens anders heen.
  if (ontleed.protocol === 'tougather:') return 'intern';
  // Alleen ónze bestanden, niet zomaar elk pad op de schijf.
  if (ontleed.protocol === 'file:' && eigenBasis && url.startsWith(eigenBasis)) return 'intern';
  return 'extern';
}

function grendelSessie(partitie) {
  const ses = partitie ? session.fromPartition(partitie) : session.defaultSession;
  const sleutel = partitie || 'standaard';
  if (gegrendeld.has(sleutel)) return ses;
  gegrendeld.add(sleutel);

  ses.setPermissionRequestHandler((_wc, permissie, terug) => terug(TOEGESTAAN.has(permissie)));
  ses.setPermissionCheckHandler((_wc, permissie) => TOEGESTAAN.has(permissie));

  // Losse handlers, want deze lopen niet via de permissieroute hierboven.
  ses.setDevicePermissionHandler(() => false);
  ses.setBluetoothPairingHandler((_details, terug) => terug({ confirmed: false }));
  // Een lege keuze betekent: geen scherm gedeeld.
  ses.setDisplayMediaRequestHandler((_verzoek, terug) => terug({}));

  return ses;
}

/**
 * Houdt een tabblad binnen het web. Een pagina die naar een ander programma
 * probeert te springen wordt tegengehouden; `meld` mag dat laten zien.
 */
function grendelNavigatie(wc, eigenBasis, meld) {
  const bewaak = (gebeurtenis, url) => {
    const doel = url ?? gebeurtenis?.url;
    if (!doel) return;
    const soort = beoordeelURL(doel, eigenBasis);
    if (soort === 'web' || soort === 'intern') return;
    gebeurtenis.preventDefault();
    if (meld) meld(doel, soort);
  };

  wc.on('will-navigate', bewaak);
  // Deze krijgt alleen een details-object; de url zit erin.
  wc.on('will-frame-navigate', (details) => bewaak(details, details.url));
  wc.on('will-redirect', bewaak);
}

module.exports = { TOEGESTAAN, beoordeelURL, grendelSessie, grendelNavigatie };
