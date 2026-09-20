// Voorkeuren op schijf. Eén bestand in app.getPath('userData'), atomair
// geschreven: eerst naar een tijdelijk bestand, dan hernoemen. Zonder dat houd
// je bij een crash een half JSON-bestand over en start de app daarna niet meer
// met je instellingen maar met de standaardwaarden — stil, en juist dan merk je
// het niet.
//
// Schrijven is uitgesteld: een schuifje dat je heen en weer sleept mag niet
// twintig keer naar schijf.

const { app, nativeTheme } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const STANDAARD = {
  zoekmachine: 'google',
  // Het glasontwerp is licht bedoeld; donker is de variant, niet het uitgangspunt.
  // Daarom niet 'systeem' als standaard — dan zie je op een donkere machine iets
  // anders dan wat het ontwerp voorschrijft.
  thema: 'licht', // systeem | licht | donker
  // Waar je gebleven was, terug na het afsluiten. Standaard aan: een browser
  // waarin je twintig tabbladen opbouwt en die bij het sluiten alles weggooit,
  // dwingt je die twintig morgen opnieuw te zoeken. Privéworkspaces vallen hier
  // met opzet buiten; zie lib/herstel.js.
  startpagina: 'vorige', // nieuw | vorige
  assistentNaam: 'Kim',
  toonSneltoetsen: true,
  // De bewegende mesh achter de zijbalk. Mooi, maar het is ook een permanente
  // last voor de compositor en niet voor iedereen prettig.
  mesh: true,
  // Favorieten in de zijbalk: een lijst van { url, naam }.
  favorieten: [],
  // De MCP-connector bestaat nog niet; dit is de stand die het scherm toont.
  // Van buitenaf bijkleuren. Standaard uit: sinds de app met de browser meekomt
  // staan zijn kleuren in zijn eigen bron, en dat is de betere plek. Dit blijft
  // bestaan om een gehoste versie bij te kunnen trekken.
  appStijl: false,
  // Het notitieblok in de bovenbalk. Eén veld, dus geen eigen bestand.
  notitie: '',
  // Welke rug de assistent gebruikt. 'auto' neemt de agent op deze computer
  // als die er staat, en anders je eigen API-sleutel. De sleutel zelf staat
  // hier niet: zie lib/sleutel.js voor waarom niet.
  assistentBron: 'auto', // auto | agent | api
  // De taal van de browser zelf; websites en de app kiezen hun eigen. Zie
  // renderer/taal.js. 'systeem' betekent: kijk naar de taal van het systeem.
  taal: 'systeem', // systeem | nl | en
  // Of het eerste scherm al is geweest. Eén vraag, één keer.
  welkomGedaan: false,
  assistentModel: '',
};

let waarden = { ...STANDAARD };
let pad = null;
let timer = null;

function bestand() {
  if (!pad) pad = path.join(app.getPath('userData'), 'voorkeuren.json');
  return pad;
}

function laad() {
  try {
    const rauw = fs.readFileSync(bestand(), 'utf8');
    const gelezen = JSON.parse(rauw);
    // Alleen sleutels die we kennen. Een bestand van een nieuwere versie mag
    // geen onbekende dingen binnensmokkelen.
    for (const sleutel of Object.keys(STANDAARD)) {
      if (sleutel in gelezen) waarden[sleutel] = gelezen[sleutel];
    }
  } catch {
    // Bestaat nog niet, of is stuk. Beide keren: standaardwaarden, geen drama.
  }
  pasThemaToe();
  return waarden;
}

function schrijfNu() {
  clearTimeout(timer);
  timer = null;
  const doel = bestand();
  const tijdelijk = `${doel}.tmp`;
  try {
    fs.writeFileSync(tijdelijk, JSON.stringify(waarden, null, 2), 'utf8');
    fs.renameSync(tijdelijk, doel);
  } catch {
    // Schijf vol of geen rechten. Niet crashen op een instelling.
  }
}

function plan() {
  clearTimeout(timer);
  timer = setTimeout(schrijfNu, 400);
}

// nativeTheme stuurt prefers-color-scheme in álle renderers tegelijk, dus dit is
// de enige plek waar het thema gezet hoeft te worden.
function pasThemaToe() {
  nativeTheme.themeSource =
    waarden.thema === 'licht' ? 'light' : waarden.thema === 'donker' ? 'dark' : 'system';
}

function alles() {
  return { ...waarden };
}

function zet(sleutel, waarde) {
  if (!(sleutel in STANDAARD)) return alles();
  waarden[sleutel] = waarde;
  if (sleutel === 'thema') pasThemaToe();
  plan();
  return alles();
}

// Bij afsluiten mag er niets in de wachtrij blijven staan.
function flush() {
  if (timer) schrijfNu();
}

module.exports = { STANDAARD, laad, alles, zet, flush };
