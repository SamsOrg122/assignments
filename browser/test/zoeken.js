/*
 * Zoeken op de pagina, tegen een echte pagina in een echte Chromium.
 *
 *   xvfb-run -a npx electron --no-sandbox test/zoeken.js
 *
 * Waarom dit een reeks verdient terwijl het "gewoon findInPage" is: de twee
 * vlaggen die erin gaan doen niet wat hun naam suggereert.
 *
 *   · `findNext: false` betekent niet "zoek niet verder" maar "tel deze
 *     sessie opnieuw". En juist die telronde komt er in een venster dat niet
 *     echt op een scherm staat soms niet: geen telling, geen markering, geen
 *     fout — de aanroep verdwijnt gewoon. Wij zeggen "begin opnieuw" daarom
 *     met een `stopFindInPage` en dan `findNext: true`. Dat breekt de sessie
 *     af en begint een nieuwe, en dat werkt wél altijd. `zoek()` hieronder
 *     doet precies wat `zoekOpPagina` in main.js doet.
 *   · `forward` gaat alleen over de richting van de sprong die `findNext`
 *     maakt, niet over waar de telling begint.
 *
 * En het opruimen: zonder `stopFindInPage('clearSelection')` blijft de hele
 * pagina geel nadat het veld dicht is. Dat het echt de sessie afbreekt is
 * hieronder te zien aan de teller, die daarna weer bij één begint.
 */

const { app, BrowserWindow, WebContentsView } = require('electron');
const http = require('node:http');

const PAGINA = `<!doctype html><meta charset="utf-8"><title>Zoeken</title>
<body style="font:16px system-ui">
  <p>appel peer appel banaan</p>
  <p>appel kiwi</p>
  <p style="margin-top:2000px">appel helemaal onderaan</p>
</body>`;

function server() {
  const s = http.createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(PAGINA);
  });
  return new Promise((k) => s.listen(0, '127.0.0.1', () =>
    k({ basis: `http://127.0.0.1:${s.address().port}/`, stop: () => s.close() })));
}

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

app.whenReady().then(async () => {
  const { basis, stop } = await server();
  const win = new BrowserWindow({ width: 900, height: 600, show: true, backgroundColor: '#fff' });
  const view = new WebContentsView({
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.contentView.addChildView(view);
  view.setBounds({ x: 0, y: 0, width: 900, height: 600 });
  const wc = view.webContents;

  await new Promise((k) => { wc.once('did-finish-load', () => setTimeout(k, 200)); wc.loadURL(basis); });

  let laatsteTerm = '';

  /**
   * Eén zoekopdracht zoals de zijbalk hem geeft, en de uitslag die erop volgt.
   * De klok is er omdat een uitslag die niet komt anders een reeks is die
   * blijft hangen in plaats van een reeks die stuk is.
   */
  const zoek = (term, opties = {}) => new Promise((klaar) => {
    let klok;
    const op = (_e, u) => {
      clearTimeout(klok);
      wc.off('found-in-page', op);
      klaar({ treffers: u.matches, welke: u.activeMatchOrdinal });
    };
    wc.on('found-in-page', op);
    klok = setTimeout(() => { wc.off('found-in-page', op); klaar({ status: 'te laat' }); }, 2500);

    if (opties.volgende !== true || term !== laatsteTerm) wc.stopFindInPage('clearSelection');
    laatsteTerm = term;
    wc.findInPage(term, { findNext: true, forward: opties.terug !== true, matchCase: false });
  });

  console.log('\nTellen');
  const eerste = await zoek('appel');
  zegtIs('vindt alle vier', eerste.treffers, 4);
  zegtIs('en staat op de eerste', eerste.welke, 1);

  console.log('\nVooruit en terug');
  const tweede = await zoek('appel', { volgende: true });
  zegtIs('volgende gaat naar de tweede', tweede.welke, 2);
  const derde = await zoek('appel', { volgende: true });
  zegtIs('en dan naar de derde', derde.welke, 3);
  const terug = await zoek('appel', { volgende: true, terug: true });
  zegtIs('terug gaat weer naar de tweede', terug.welke, 2);

  console.log('\nTypen begint bovenaan');
  // Dit is wat het makkelijkst verkeerd om staat. Tijdens het typen hoort elke
  // aanslag opnieuw te beginnen; anders wandelt het veld door de pagina
  // terwijl je nog aan het woord bezig bent.
  const opnieuw = await zoek('appel');
  zegtIs('zonder volgende begint hij weer bij de eerste', opnieuw.welke, 1);

  console.log('\nEen andere term is een andere telling');
  const kiwi = await zoek('kiwi', { volgende: true });
  zegtIs('kiwi staat er één keer', kiwi.treffers, 1);
  zegtIs('en de teller begint opnieuw', kiwi.welke, 1);

  console.log('\nNiets gevonden');
  const niets = await zoek('kumquat');
  zegtIs('geen treffer is nul en niet leeg', niets.treffers, 0);
  zegtIs('en er is dus ook geen huidige', niets.welke, 0);

  console.log('\nOpruimen');
  // Het bewijs dat `stopFindInPage` de sessie echt afbreekt en niet alleen de
  // kleur weghaalt: daarna telt de volgende zoektocht weer vanaf één, ook als
  // je om "de volgende" vraagt.
  await zoek('appel');
  await zoek('appel', { volgende: true });
  wc.stopFindInPage('clearSelection');
  laatsteTerm = '';
  const naSchoon = await zoek('appel', { volgende: true });
  zegtIs('na stopFindInPage begint de telling weer bij één', naSchoon.welke, 1);
  zegtIs('en de pagina telt nog steeds vier', naSchoon.treffers, 4);

  stop();
  console.log(`\n${goed} goed, ${stuk.length} stuk`);
  if (stuk.length) { console.log('\nStuk:'); for (const s of stuk) console.log(`  - ${s}`); }
  console.log(stuk.length ? '\nZOEKEN: STUK' : '\nZOEKEN: GOED');
  app.exit(stuk.length ? 1 : 0);
});

app.on('window-all-closed', () => app.quit());
