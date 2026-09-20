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
  even, vrijePoort, wachtOpZijbalken, inPagina, waarde, roepDeur, zonderAntwoord,
  startApp, stopApp,
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

    console.log('\nEén deur voor alle vensters');
    // Elk venster had er eerst een eigen, met een eigen poort en een eigen
    // sleutel. Voor één client was dat te veel en voor een client die je hele
    // browser wilde bedienen te weinig: hij zag de helft niet.
    const deur = await waarde(twee[0], 'browser.zetMcp(true)');
    zegt('de deur gaat open', Boolean(deur && deur.aan));
    zegt('met een poort en een sleutel', Boolean(deur.poort) && Boolean(deur.sleutel));

    const deurTwee = await waarde(twee[1], 'browser.voorkeuren().then(() => 0)');
    zegtIs('het andere venster hoeft niets eigens te openen', deurTwee, 0);

    const paginas = await roepDeur(deur.poort, deur.sleutel, 'jouw_paginas');
    zegt('de deur antwoordt', paginas.status === 200 && Array.isArray(paginas.uitkomst));
    const rijen = paginas.uitkomst ?? [];
    zegt('en ziet tabbladen uit meer dan één venster',
      new Set(rijen.map((r) => r.venster)).size > 1);
    zegtIs('elk tabblad heeft zijn eigen nummer',
      rijen.length, new Set(rijen.map((r) => r.id)).size);

    // De sleutel is niet zomaar versiering.
    const zonder = await fetch(`http://127.0.0.1:${deur.poort}/roep`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ naam: 'jouw_paginas' }),
    });
    zegtIs('zonder sleutel komt er niemand binnen', zonder.status, 401);

    console.log('\nEen privéworkspace bestaat niet voor een client, in geen enkel venster');
    // Dit is het gat dat erin had kunnen sluipen toen de deur over alle
    // vensters ging kijken: de zoekopdracht vindt een tabblad overal, en als
    // de privécontrole alleen in één venster keek was een privétabblad in het
    // ándere venster ineens leesbaar.
    await waarde(twee[1], 'browser.newPriveWorkspace()');
    await even(1000);
    // `laatsteStaat` is een gewone variabele in app.js, en app.js is een
    // klassiek script: dus gewoon bij naam op te vragen. Dat is stabieler dan
    // op de volgende stand gaan wachten, want die kan al geweest zijn.
    const priveTab = await waarde(twee[1], 'laatsteStaat.activeId');
    zegt('er staat een privétabblad', typeof priveTab === 'number');

    const naPrive = await roepDeur(deur.poort, deur.sleutel, 'jouw_paginas');
    zegt('het staat niet in de lijst',
      !(naPrive.uitkomst ?? []).some((r) => String(r.id) === String(priveTab)));

    const gelezen = await roepDeur(deur.poort, deur.sleutel, 'bekijk_jouw_pagina', { id: Number(priveTab) });
    zegt('en eraan komen wordt geweigerd',
      typeof gelezen.fout === 'string' && gelezen.fout.toLowerCase().includes('priv'));

    await waarde(twee[0], 'browser.zetMcp(false)');
    const dicht = await fetch(`http://127.0.0.1:${deur.poort}/roep`, {
      method: 'POST',
      headers: { authorization: `Bearer ${deur.sleutel}` },
      body: '{}',
    }).then(() => 'open', () => 'dicht');
    zegtIs('en dicht is dicht', dicht, 'dicht');

    console.log('\nEen workspace verhuizen');
    // Een los tabblad kan niet verhuizen — zijn sessie zit eraan vast — dus
    // verhuist de hele workspace, met die sessie eronder.
    const voorHier = await waarde(twee[0], 'laatsteStaat.workspaces.length');
    await waarde(twee[0], 'browser.newWorkspace()');
    await even(900);
    zegtIs('er staat er een bij', await waarde(twee[0], 'laatsteStaat.workspaces.length'), voorHier + 1);

    const verhuisd = await waarde(twee[0],
      'browser.verhuisWorkspace(laatsteStaat.activeWorkspaceId, laatsteStaat.andereVensters[0].sleutel)');
    zegt('de verhuizing lukt', Boolean(verhuisd && verhuisd.verhuisd));
    await even(900);
    zegtIs('en het ene venster houdt er evenveel over als ervoor',
      await waarde(twee[0], 'laatsteStaat.workspaces.length'), voorHier);

    console.log('\nEen venster terughalen');
    // Ctrl+Shift+T doet dit met een tabblad; dit is dezelfde beweging één maat
    // groter. Een ingespoten toetsaanslag komt niet bij before-input-event, dus
    // hier langs de weg die de commandobalk ook neemt.
    await zonderAntwoord(twee[1], 'browser.close()');
    await even(1200);
    zegtIs('er staat er nog één', (await wachtOpZijbalken(poort, 1, 3000)).length, 1);

    await waarde(twee[0], 'browser.heropenVenster()');
    const terugTwee = await wachtOpZijbalken(poort, 2);
    zegtIs('en na het terughalen weer twee', terugTwee.length, 2);

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
