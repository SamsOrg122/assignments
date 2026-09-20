/*
 * De browser van buitenaf starten en er via de debugpoort tegen praten.
 *
 * Twee reeksen doen dat — meerdere vensters en de taal — en beide hebben
 * dezelfde vier dingen nodig: een vrije poort, de app starten in een eigen
 * user-data-dir, wachten tot de zijbalken er zijn, en één stukje JavaScript
 * in zo'n zijbalk uitvoeren. Dat staat daarom hier en niet twee keer.
 *
 * Dit is geen reeks; het is gereedschap voor reeksen.
 */

const { spawn } = require('node:child_process');
const http = require('node:http');
const net = require('node:net');
const path = require('node:path');

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

/** Alle pagina's die de browser op dit moment open heeft. */
async function pagina(poort, eindigtOp) {
  try {
    const lijst = await haalJson(`http://127.0.0.1:${poort}/json/list`);
    return lijst.filter((d) => d.type === 'page' && d.url.split('#')[0].endsWith(eindigtOp));
  } catch {
    return [];
  }
}

/** De zijbalken: één per venster. */
const zijbalken = (poort) => pagina(poort, 'renderer/index.html');

/** Wachten tot er er zoveel zijn, of opgeven en teruggeven wat er is. */
async function wachtOp(poort, eindigtOp, hoeveel, msMax = 20000) {
  const eind = Date.now() + msMax;
  for (;;) {
    const gevonden = await pagina(poort, eindigtOp);
    if (gevonden.length >= hoeveel) return gevonden;
    if (Date.now() > eind) return gevonden;
    await even(250);
  }
}

const wachtOpZijbalken = (poort, hoeveel, msMax) =>
  wachtOp(poort, 'renderer/index.html', hoeveel, msMax);

/** Eén stukje JavaScript in een pagina van de browser zelf. */
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

/** De waarde die eruit kwam, of undefined als het misging. */
const waarde = async (doel, uitdrukking) => (await inPagina(doel, uitdrukking))?.result?.value;

function startApp(userData, poort, extra = []) {
  return spawn('npx',
    ['electron', '.', '--no-sandbox', '--disable-backgrounding-occluded-windows',
      `--remote-debugging-port=${poort}`, `--user-data-dir=${userData}`, ...extra],
    { cwd: path.join(__dirname, '..'), stdio: ['ignore', 'ignore', 'ignore'] });
}

async function stopApp(kind) {
  if (!kind || kind.exitCode !== null) return;
  kind.kill('SIGTERM');
  await new Promise((k) => { kind.on('exit', k); setTimeout(k, 4000); });
}

/**
 * Iets laten doen waarvan geen antwoord meer komt.
 *
 * Een pagina die zichzelf sluit kan niet meer vertellen dat het gelukt is:
 * de target is weg voordat het antwoord terug is. Wachten op dat antwoord is
 * dus acht seconden wachten op niets.
 */
async function zonderAntwoord(doel, uitdrukking) {
  const ws = new WebSocket(doel.webSocketDebuggerUrl);
  await new Promise((k, m) => { ws.onopen = k; ws.onerror = m; });
  ws.send(JSON.stringify({
    id: 1, method: 'Runtime.evaluate', params: { expression: uitdrukking },
  }));
  await even(200);
  try { ws.close(); } catch { /* al weg */ }
}

/**
 * Eén stuk gereedschap door de MCP-deur, zoals een client het zou doen.
 *
 * Met de echte sleutel over de echte poort, want dat is het enige wat
 * bewijst dat die deur doet wat het scherm erover zegt.
 */
async function roepDeur(poort, sleutel, naam, argumenten = {}) {
  const antwoord = await fetch(`http://127.0.0.1:${poort}/roep`, {
    method: 'POST',
    headers: { authorization: `Bearer ${sleutel}`, 'content-type': 'application/json' },
    body: JSON.stringify({ naam, argumenten }),
  });
  return { status: antwoord.status, ...(await antwoord.json().catch(() => ({}))) };
}

module.exports = {
  roepDeur, zonderAntwoord,
  even, vrijePoort, pagina, zijbalken, wachtOp, wachtOpZijbalken,
  inPagina, waarde, startApp, stopApp,
};
