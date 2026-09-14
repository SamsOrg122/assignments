// Wat is een adres en wat is een zoekopdracht? Die regel stond eerder drie keer
// in de codebase, met de zoekmachine er twee keer hard ingebakken. Nu op één
// plek, gedeeld door het hoofdproces, de zijbalk en de nieuw-tabblad-pagina.
//
// Die laatste draait sandboxed zonder preload, dus dit bestand mag niets van
// Node gebruiken; de export onderaan is daarom voorwaardelijk.

const ZOEKMACHINES = {
  google: { naam: 'Google', url: 'https://www.google.com/search?q=' },
  duckduckgo: { naam: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=' },
  bing: { naam: 'Bing', url: 'https://www.bing.com/search?q=' },
};

// Zodra er instellingen zijn, komt deze keuze daarvandaan.
const STANDAARD_ZOEKMACHINE = 'google';

const SCHEMA = /^[a-z][a-z0-9+.-]*:/i;
// Iets met een punt en zonder spaties behandelen we als domein.
const DOMEIN = /^[^\s]+\.[^\s]{2,}$/;

function isAdres(waarde) {
  const tekst = String(waarde).trim();
  return SCHEMA.test(tekst) || DOMEIN.test(tekst);
}

// Geeft null bij lege invoer; de aanroeper bepaalt zelf wat er dan moet gebeuren.
function naarZoekURL(waarde, motor = STANDAARD_ZOEKMACHINE) {
  const tekst = String(waarde).trim();
  if (!tekst) return null;
  if (SCHEMA.test(tekst)) return tekst;
  if (DOMEIN.test(tekst)) return `https://${tekst}`;
  const machine = ZOEKMACHINES[motor] ?? ZOEKMACHINES[STANDAARD_ZOEKMACHINE];
  return machine.url + encodeURIComponent(tekst);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ZOEKMACHINES, STANDAARD_ZOEKMACHINE, isAdres, naarZoekURL };
}
