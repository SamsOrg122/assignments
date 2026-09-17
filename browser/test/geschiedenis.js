/*
 * Waar je bent geweest — en vooral: wat er níét in komt.
 *
 *   xvfb-run -a npx electron --no-sandbox test/geschiedenis.js
 *
 * De helft van deze reeks gaat over weigeren. Een geschiedenis is de plek waar
 * een browser zijn beloftes het makkelijkst breekt: één vergeten vlag en een
 * privéworkspace staat er alsnog in. Dat is het soort fout dat niemand ziet
 * tot het te laat is, dus staat het hier vast.
 */

const { app } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { Geschiedenis, teltMee, GRENS } = require('../lib/geschiedenis.js');

let goed = 0;
const stuk = [];
const zegt = (wat, waar) => {
  if (waar) { goed += 1; console.log(`  ✓ ${wat}`); }
  else { stuk.push(wat); console.log(`  ✗ ${wat}`); }
};
const zegtIs = (wat, gekregen, verwacht) => {
  const ok = JSON.stringify(gekregen) === JSON.stringify(verwacht);
  if (!ok) console.log(`      gekregen: ${JSON.stringify(gekregen)}\n      verwacht: ${JSON.stringify(verwacht)}`);
  zegt(wat, ok);
};

/** Een geschiedenis met een eigen bestand, zodat een reeks niets aanraakt. */
function verse(map, naam = 'g.json') {
  const g = new Geschiedenis();
  g.pad = path.join(map, naam);
  g.geladen = true;
  return g;
}

app.whenReady().then(() => {
  const map = fs.mkdtempSync(path.join(os.tmpdir(), 'tougather-gesch-'));

  console.log('\nWat er niet in komt');
  const g = verse(map);
  zegt('een privéworkspace niet',
    g.bezoek('https://example.com/a', 'A', { prive: true }) === null);
  zegt('een tabblad van de assistent niet',
    g.bezoek('https://example.com/b', 'B', { vanAssistent: true }) === null);
  zegt('het nieuwe tabblad niet', g.bezoek('tougather://nieuw', '', {}) === null);
  zegt('devtools niet', g.bezoek('devtools://devtools/x', '', {}) === null);
  zegt('een bestand op schijf niet', g.bezoek('file:///etc/passwd', '', {}) === null);
  zegt('en about:blank niet', g.bezoek('about:blank', '', {}) === null);
  zegtIs('dus staat er nog niets in', g.regels.length, 0);
  zegt('teltMee laat https en http door', teltMee('http://x.nl') && teltMee('https://x.nl'));

  console.log('\nWat er wel in komt');
  zegt('een gewoon bezoek', Boolean(g.bezoek('https://voorbeeld.nl/een', 'Eén', {})));
  g.bezoek('https://voorbeeld.nl/twee', 'Twee', {});
  g.bezoek('https://anders.org/drie', 'Drie', {});
  zegtIs('nieuwste bovenaan', g.regels.map((r) => r.titel), ['Drie', 'Twee', 'Eén']);

  console.log('\nHetzelfde adres twee keer');
  // Eén keer verversen, of een site die zichzelf omleidt, hoort geen tweede
  // regel op te leveren.
  g.bezoek('https://anders.org/drie', 'Drie, maar later pas bekend', {});
  zegtIs('blijft één regel', g.regels.length, 3);
  zegtIs('met de nieuwste titel', g.regels[0].titel, 'Drie, maar later pas bekend');

  // Een pagina die je een uur later opnieuw opent is wél een nieuw bezoek.
  g.regels[0].tijd -= 3600 * 1000;
  g.bezoek('https://anders.org/drie', 'Drie', {});
  zegtIs('een uur later is een nieuw bezoek', g.regels.length, 4);

  console.log('\nTitels komen later binnen');
  g.bezoek('https://laat.nl/x', '', {});
  g.hernoem('https://laat.nl/x', 'Pas nu bekend');
  zegtIs('en worden alsnog ingevuld', g.regels[0].titel, 'Pas nu bekend');

  console.log('\nZoeken');
  zegtIs('op een woord uit de titel', g.zoek('twee').map((r) => r.url), ['https://voorbeeld.nl/twee']);
  zegtIs('op een stuk van het adres', g.zoek('anders.org').length, 2);
  zegtIs('twee woorden moeten allebei passen', g.zoek('anders drie').length, 2);
  zegtIs('en een woord dat nergens staat geeft niets', g.zoek('kumquat').length, 0);
  zegtIs('de limiet wordt gerespecteerd', g.zoek('', 2).length, 2);

  console.log('\nVergeten');
  const id = g.regels[0].id;
  zegt('één regel weg', g.verwijder(id) === true);
  zegt('dezelfde nog eens is geen fout', g.verwijder(id) === false);
  zegtIs('een hele site weg', g.verwijderHost('anders.org'), 2);
  zegt('en die staat er dan ook niet meer', g.zoek('anders.org').length === 0);

  console.log('\nBewaren');
  const bewaard = verse(map, 'bewaar.json');
  bewaard.bezoek('https://blijft.nl/a', 'Blijft', {});
  bewaard.bezoek('https://blijft.nl/b', 'Ook', {});
  bewaard.schrijfNu();
  const terug = new Geschiedenis();
  terug.pad = path.join(map, 'bewaar.json');
  terug.laad();
  zegtIs('komt in dezelfde volgorde terug', terug.regels.map((r) => r.titel), ['Ook', 'Blijft']);
  zegt('de ids zijn nieuw en komen niet uit het bestand',
    !JSON.parse(fs.readFileSync(path.join(map, 'bewaar.json'), 'utf8')).regels[0].id);

  const stukBestand = path.join(map, 'stuk.json');
  fs.writeFileSync(stukBestand, '{ dit is geen json');
  const naStuk = new Geschiedenis();
  naStuk.pad = stukBestand;
  naStuk.laad();
  zegtIs('een kapot bestand geeft een lege lijst en geen crash', naStuk.regels.length, 0);

  console.log('\nDe grens');
  const veel = verse(map, 'veel.json');
  // Sneller dan zesduizend keer bezoek(): die vouwt gelijke adressen samen en
  // plant een schrijfactie. Het gaat hier om het afkappen.
  veel.regels = Array.from({ length: GRENS + 50 }, (_v, i) => ({
    id: i + 1, url: `https://x.nl/${i}`, titel: `${i}`, tijd: Date.now() - i,
  }));
  veel.volgende = GRENS + 51;
  veel.bezoek('https://nieuw.nl/', 'Nieuw', {});
  zegtIs('de lijst groeit niet voorbij de grens', veel.regels.length, GRENS);
  zegtIs('en het nieuwste staat er nog steeds bovenaan', veel.regels[0].titel, 'Nieuw');

  const alles = verse(map, 'alles.json');
  alles.bezoek('https://weg.nl/', 'Weg', {});
  zegtIs('wissen telt wat er weg ging', alles.wis(), 1);
  zegtIs('en laat niets staan', alles.regels.length, 0);

  fs.rmSync(map, { recursive: true, force: true });
  console.log(`\n${goed} goed, ${stuk.length} stuk`);
  if (stuk.length) { console.log('\nStuk:'); for (const s of stuk) console.log(`  - ${s}`); }
  console.log(stuk.length ? '\nGESCHIEDENIS: STUK' : '\nGESCHIEDENIS: GOED');
  app.exit(stuk.length ? 1 : 0);
});

app.on('window-all-closed', () => app.quit());
