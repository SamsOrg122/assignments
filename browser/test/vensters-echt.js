/*
 * Een tweede venster, in de echte app.
 *
 *   node test/vensters-echt.js
 *
 * Dit is de enige reeks die de browser als geheel start en er van buitenaf
 * tegen praat, via de debugpoort. Dat is nodig omdat de vraag hier niet is of
 * een functie het goede teruggeeft maar of er echt een tweede venster
 * opengaat, en of je beide morgen terugkrijgt.
 *
 * Alles gebeurt in een eigen `--user-data-dir`, dus er wordt niets van de
 * machine waarop dit draait aangeraakt.
 *
 * Een ingespoten toetsaanslag komt niet bij `before-input-event`, dus Ctrl+N
 * zelf is hier niet te testen; wat wél te testen is, is de weg die die toets
 * neemt — `browser.nieuwVenster()`, dezelfde die de commandobalk gebruikt.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  even, vrijePoort, wachtOpZijbalken, inPagina, startApp, stopApp,
} = require('./cdp.js');

let goed = 0;
const stuk = [];
const zegt = (wat, waar) => {
  if (waar) { goed += 1; console.log(`  \u2713 ${wat}`); }
  else { stuk.push(wat); console.log(`  \u2717 ${wat}`); }
};
const zegtIs = (wat, gekregen, verwacht) => {
  const ok = JSON.stringify(gekregen) === JSON.stringify(verwacht);
  if (!ok) console.log(`      gekregen: ${JSON.stringify(gekregen)}\n      verwacht: ${JSON.stringify(verwacht)}`);
  zegt(wat, ok);
};

(async () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'tougather-echt-'));
  const poort = await vrijePoort();
  let kind = null;

  try {
    console.log('\nStarten');
    kind = startApp(userData, poort);
    const eerste = await wachtOpZijbalken(poort, 1);
    zegtIs('er staat één venster', eerste.length, 1);
    if (!eerste.length) throw new Error('de app kwam niet op');

    console.log('\nEen tweede venster');
    await inPagina(eerste[0], 'browser.nieuwVenster()');
    const twee = await wachtOpZijbalken(poort, 2);
    zegtIs('nu staan er twee', twee.length, 2);

    console.log('\nElk venster een eigen adres');
    // Twee verschillende pagina's, zodat er straks iets te herkennen valt.
    await inPagina(twee[0], "browser.go('http://127.0.0.1:1/een')");
    await inPagina(twee[1], "browser.go('http://127.0.0.1:1/twee')");
    // Die adressen laden niet — er luistert niets op poort 1. Dat hoeft ook
    // niet: het herstelbestand bewaart wat er in de balk staat, niet wat er
    // geladen is. Even wachten tot de uitgestelde schrijfactie is geweest.
    await even(4000);

    const bestand = path.join(userData, 'laatste-sessie.json');
    zegt('er is een herstelbestand', fs.existsSync(bestand));
    const stand = JSON.parse(fs.readFileSync(bestand, 'utf8'));
    zegtIs('het is versie 2', stand.versie, 2);
    zegtIs('met twee vensters', stand.vensters.length, 2);

    const partities = stand.vensters.flatMap((v) => v.workspaces.map((w) => w.partitie));
    zegtIs('elk met een eigen partitie', new Set(partities).size, partities.length);
    zegt('en die zien er uit zoals het hoort',
      partities.every((p) => /^persist:ws-[1-9][0-9]*$/.test(p)));

    console.log('\nAfsluiten en weer starten');
    await stopApp(kind);
    kind = startApp(userData, poort);
    const terug = await wachtOpZijbalken(poort, 2);
    zegtIs('beide vensters komen terug', terug.length, 2);

    const naStart = JSON.parse(fs.readFileSync(path.join(userData, 'laatste-sessie.json'), 'utf8'));
    const naPartities = naStart.vensters.flatMap((v) => v.workspaces.map((w) => w.partitie));
    zegtIs('en in dezelfde mappen als voor het afsluiten',
      [...new Set(naPartities)].sort(), [...new Set(partities)].sort());
  } catch (e) {
    zegt(`de reeks liep vast: ${e.message}`, false);
  } finally {
    await stopApp(kind);
    fs.rmSync(userData, { recursive: true, force: true });
  }

  console.log(`\n${goed} goed, ${stuk.length} stuk`);
  if (stuk.length) { console.log('\nStuk:'); for (const s of stuk) console.log(`  - ${s}`); }
  console.log(stuk.length ? '\nVENSTERS-ECHT: STUK' : '\nVENSTERS-ECHT: GOED');
  process.exit(stuk.length ? 1 : 0);
})();
