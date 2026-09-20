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

const { spawn } = require('node:child_process');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');

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

const even = (ms) => new Promise((k) => setTimeout(k, ms));

/** Een poort die nu vrij is. Niet waterdicht, wel genoeg voor een reeks. */
function vrijePoort() {
  return new Promise((k) => {
    const s = net.createServer();
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => k(port));
    });
  });
}

function haalJson(url) {
  return new Promise((klaar, mis) => {
    http.get(url, (a) => {
      let tekst = '';
      a.on('data', (b) => { tekst += b; });
      a.on('end', () => {
        try { klaar(JSON.parse(tekst)); } catch (e) { mis(e); }
      });
    }).on('error', mis);
  });
}

/** De zijbalken die nu openstaan: één per venster. */
async function zijbalken(poort) {
  try {
    const lijst = await haalJson(`http://127.0.0.1:${poort}/json/list`);
    return lijst.filter((t) => t.type === 'page' && t.url.endsWith('renderer/index.html'));
  } catch {
    return [];
  }
}

/** Wachten tot er er zoveel zijn, of opgeven. */
async function wachtOpZijbalken(poort, hoeveel, msMax = 20000) {
  const eind = Date.now() + msMax;
  for (;;) {
    const gevonden = await zijbalken(poort);
    if (gevonden.length >= hoeveel) return gevonden;
    if (Date.now() > eind) return gevonden;
    await even(250);
  }
}

/** Eén stukje JavaScript in een tabblad van de browser zelf. */
async function inPagina(doel, uitdrukking) {
  const ws = new WebSocket(doel.webSocketDebuggerUrl);
  await new Promise((k, m) => { ws.onopen = k; ws.onerror = m; });
  const antwoord = await new Promise((klaar, mis) => {
    const klok = setTimeout(() => mis(new Error('te laat')), 8000);
    ws.onmessage = (e) => {
      const b = JSON.parse(e.data);
      if (b.id !== 1) return;
      clearTimeout(klok);
      klaar(b.result);
    };
    ws.send(JSON.stringify({
      id: 1,
      method: 'Runtime.evaluate',
      params: { expression: uitdrukking, awaitPromise: true, returnByValue: true },
    }));
  });
  ws.close();
  return antwoord;
}

function startApp(userData, poort) {
  return spawn(process.execPath.includes('node') ? 'npx' : process.execPath,
    ['electron', '.', '--no-sandbox', '--disable-backgrounding-occluded-windows',
      `--remote-debugging-port=${poort}`, `--user-data-dir=${userData}`],
    { cwd: path.join(__dirname, '..'), stdio: ['ignore', 'ignore', 'ignore'] });
}

async function stopApp(kind) {
  if (!kind || kind.exitCode !== null) return;
  kind.kill('SIGTERM');
  await new Promise((k) => { kind.on('exit', k); setTimeout(k, 4000); });
}

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
