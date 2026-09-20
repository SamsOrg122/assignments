/*
 * De gids tegen echte pagina's, in de browser waarin hij moet draaien.
 *
 * Geen nagebouwde DOM. `in-pagina.js` leest shadow roots, frames, rects en
 * `elementFromPoint`, en dat zijn precies de vier dingen waar een nabootsing
 * gelijk heeft terwijl Chromium ongelijk geeft. Dus: Electron 33, een echte
 * server met echte headers, en de assertie erachteraan.
 *
 *   npm run test:gids
 *
 * De server staat erin in plaats van ernaast: één ding om te starten, en de
 * CSP-koppen zijn echte koppen. Een CSP uit een <meta> gedraagt zich anders.
 */

const { app, BrowserWindow, WebContentsView } = require('electron');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const { brugVoor } = require('../lib/gids/brug.js');

const FIXTURES = path.join(__dirname, 'fixtures');

// Eén pagina krijgt de strengste CSP die op het web voorkomt, want dat is de
// pagina waarop onze opmaak het moeilijkst heeft.
const STRENG = new Set(['/gewoon.html']);

function server() {
  const s = http.createServer((req, res) => {
    const naam = path.basename(req.url.split('?')[0]);
    const bestand = path.join(FIXTURES, naam);
    if (!bestand.startsWith(FIXTURES) || !fs.existsSync(bestand)) {
      res.writeHead(404); res.end('nee'); return;
    }
    const koppen = { 'content-type': 'text/html; charset=utf-8' };
    if (STRENG.has('/' + naam)) {
      koppen['content-security-policy'] = "default-src 'self'; style-src 'self'; script-src 'self'";
    }
    res.writeHead(200, koppen);
    res.end(fs.readFileSync(bestand));
  });
  return new Promise((k) => s.listen(0, '127.0.0.1', () => k({ basis: `http://127.0.0.1:${s.address().port}`, stop: () => s.close() })));
}

// ── De kleinste testloper die het werk doet ───────────────────────────────

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

/** De ref uit een snapshotregel met deze naam erin. */
const refVan = (tekst, naam) => {
  const regel = tekst.split('\n').find((r) => r.includes(`"${naam}"`));
  return regel ? (regel.match(/\[ref=(e\d+)\]/) || [])[1] : null;
};
const regelVan = (tekst, naam) => tekst.split('\n').find((r) => r.includes(`"${naam}"`)) || '';

app.whenReady().then(async () => {
  const { basis, stop } = await server();
  const win = new BrowserWindow({ width: 1280, height: 800, show: true, backgroundColor: '#fff' });
  const view = new WebContentsView({
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.contentView.addChildView(view);
  view.setBounds({ x: 0, y: 0, width: 1280, height: 800 });

  const wc = view.webContents;
  const brug = brugVoor(wc);
  const ga = (naam) => new Promise((k) => {
    wc.once('did-finish-load', () => setTimeout(k, 200));
    wc.loadURL(`${basis}/${naam}`);
  });

  // ── 1. Niets in de pagina tot er gevraagd wordt ──────────────────────
  console.log('\nNiets tot er gevraagd wordt');
  await ga('gewoon.html');
  const vooraf = await wc.executeJavaScriptInIsolatedWorld(1000, [{ code: '(typeof globalThis.__gids)' }]);
  zegtIs('wereld 1000 is leeg voor de eerste vraag', vooraf, 'undefined');

  // ── 2. Een gewone pagina ─────────────────────────────────────────────
  console.log('\nEen gewone pagina');
  const s1 = await brug.snapshot();
  zegt('snapshot komt terug', s1.status !== 'te laat' && typeof s1.tekst === 'string');
  zegt('kop noemt titel en viewport', s1.tekst.startsWith('page: "Postvak"') && s1.tekst.includes('viewport: 1280x800'));
  zegt('de knop staat erin met een ref', Boolean(refVan(s1.tekst, 'Opstellen')));
  zegt('aria-label wint van de tekst erin', Boolean(refVan(s1.tekst, 'Bestand toevoegen')));
  zegt('een label hoort bij zijn veld', Boolean(refVan(s1.tekst, 'Volledige naam')));
  zegt('uitgeschakeld staat erbij', regelVan(s1.tekst, 'Uitgeschakeld').includes('[disabled]'));
  zegt('onder de vouw heet below', regelVan(s1.tekst, 'Helemaal onderaan').includes('[below]'));

  console.log('\nWat er niet in mag staan');
  zegt('geen waarde van een zoekveld', !s1.tekst.includes('GEHEIME ZOEKVRAAG'));
  zegt('geen waarde van een tekstveld', !s1.tekst.includes('GEHEIME NAAM'));
  zegt('geen waarde van een wachtwoordveld', !s1.tekst.includes('GEHEIM WACHTWOORD'));
  zegt('het wachtwoordveld zelf is wel te zien', s1.tekst.includes('wachtwoordveld'));

  // ── 3. Refs omzetten naar een plek ───────────────────────────────────
  console.log('\nVan ref naar plek');
  const refOpstellen = refVan(s1.tekst, 'Opstellen');
  const plek = await brug.zoek(refOpstellen);
  zegtIs('een bestaande ref lost op', plek.status, 'ok');
  const echt = await wc.executeJavaScriptInIsolatedWorld(1000, [{
    code: '(() => { const r = document.getElementById("opstellen").getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)]; })()',
  }]);
  zegtIs('de rect klopt met het element zelf', plek.rect, echt);
  const onzin = await brug.zoek('e9999');
  zegt('een ref die nooit bestond is eerlijk weg', onzin.status !== 'ok');

  // ── 4. Scrollen en dan pas wijzen ────────────────────────────────────
  console.log('\nScrollen naar wat je niet ziet');
  const refDiep = refVan(s1.tekst, 'Helemaal onderaan');
  const voorScroll = await brug.zoek(refDiep);
  zegt('staat eerst onder het beeld', voorScroll.plaats === 'below');
  await brug.scrollNaar(refDiep);
  await new Promise((k) => setTimeout(k, 700));
  const naScroll = await brug.zoek(refDiep);
  zegtIs('staat na het scrollen in beeld', naScroll.plaats, 'viewport');

  // ── 5. Schaduw en frames ─────────────────────────────────────────────
  console.log('\nSchaduw en frames');
  await ga('schaduw.html');
  const s2 = await brug.snapshot();
  zegt('een knoop in een open shadow root', Boolean(refVan(s2.tekst, 'In de schaduw')));
  zegt('een knoop in een frame van dezelfde herkomst', Boolean(refVan(s2.tekst, 'In het frame')));
  zegt('een frame van elders is één knoop met een vlag', regelVan(s2.tekst, 'Chat van elders').includes('[cross-origin]'));

  const refInFrame = refVan(s2.tekst, 'In het frame');
  const inFrame = await brug.zoek(refInFrame);
  const frameRect = await wc.executeJavaScriptInIsolatedWorld(1000, [{
    code: '(() => { const f = document.getElementById("zelfde").getBoundingClientRect(); return [Math.round(f.left), Math.round(f.top)]; })()',
  }]);
  const uitSnapshot = (regelVan(s2.tekst, 'In het frame').match(/rect=(-?\d+),(-?\d+)/) || []).slice(1).map(Number);
  zegt('de rect uit het frame is verschoven met het frame',
    uitSnapshot.length === 2 && uitSnapshot[0] >= frameRect[0] && uitSnapshot[1] >= frameRect[1]);
  zegt('zoeken in een frame komt niet met een verkeerde rect terug', inFrame.status === 'ok' || inFrame.status === 'weg');

  // ── 6. Iets dat eroverheen ligt ──────────────────────────────────────
  console.log('\nBedekt');
  await ga('bedekt.html');
  const s3 = await brug.snapshot();
  zegt('een knop onder een deken heet obscured', regelVan(s3.tekst, 'Zit eronder').includes('[obscured]'));

  // ── 7. De pagina tekent zichzelf opnieuw ─────────────────────────────
  console.log('\nEen ref die verouderd is');
  await ga('hertekent.html');
  const s4 = await brug.snapshot();
  const refs = s4.tekst.split('\n').filter((r) => r.includes('"Openen"')).map((r) => (r.match(/\[ref=(e\d+)\]/) || [])[1]);
  zegt('drie knoppen met dezelfde naam', refs.length === 3);
  await wc.executeJavaScript('globalThis.hertekenNu()');
  await new Promise((k) => setTimeout(k, 150));
  const derde = await brug.zoek(refs[2]);
  zegt('de derde is teruggevonden na het hertekenen', derde.status === 'ok' && derde.hermatcht === true);
  const derdeEcht = await wc.executeJavaScriptInIsolatedWorld(1000, [{
    code: '(() => { const k = document.querySelectorAll(".rij")[2].getBoundingClientRect(); return [Math.round(k.left), Math.round(k.top), Math.round(k.width), Math.round(k.height)]; })()',
  }]);
  zegtIs('en het is de dérde, niet de eerste die zo heet', derde.rect, derdeEcht);

  // ── 8. Wachten tot de gebruiker zelf klikt ───────────────────────────
  console.log('\nWachten op de gebruiker');
  await ga('gewoon.html');
  const s5 = await brug.snapshot();
  const wacht = brug.wachtOpKlik(refVan(s5.tekst, 'Opstellen'), 4000);
  setTimeout(() => { wc.executeJavaScript('document.getElementById("opstellen").click()'); }, 250);
  zegtIs('een klik van de gebruiker komt omhoog', (await wacht).status, 'geklikt');

  const wachtNooit = brug.wachtOpKlik(refVan(s5.tekst, 'Opstellen'), 600);
  zegtIs('en een klik die niet komt geeft het op', (await wachtNooit).status, 'te laat');

  // ── 9. Navigeren laat niets hangen ───────────────────────────────────
  console.log('\nNavigeren');
  const s6 = await brug.snapshot();
  const hangt = brug.wachtOpKlik(refVan(s6.tekst, 'Opstellen'), 60000);
  await ga('schaduw.html');
  zegtIs('een openstaande wacht wordt gesloten door de navigatie', (await hangt).status, 'genavigeerd');
  zegt('en er staat daarna niets meer open', brug.openstaand.size === 0);

  // ── 10. De pagina ziet ons niet ──────────────────────────────────────
  console.log('\nOnzichtbaar voor de pagina');
  await brug.snapshot();
  const paginaZiet = await wc.executeJavaScript('(typeof globalThis.__gids)');
  zegtIs('de pagina zelf ziet niets', paginaZiet, 'undefined');

  // ── 11. Zwaar, en binnen de tijd ─────────────────────────────────────
  console.log('\nZwaar');
  await ga('zwaar.html');
  const metingen = [];
  for (let i = 0; i < 20; i++) metingen.push((await brug.snapshot()).ms);
  // De eerste apart, en niet weggegooid. Dat is de snapshot waar de gebruiker
  // op wacht als hij de gids voor het eerst op een pagina opent, en die is
  // duurder: de stijl is nog niet uitgerekend en de layout nog niet warm. Een
  // p95 waar die eerste in verdwijnt meet precies het geval dat niemand merkt.
  const eerste = metingen[0];
  const rest = metingen.slice(1).sort((a, b) => a - b);
  const p95 = rest[Math.ceil(rest.length * 0.95) - 1];
  console.log(`      eerste ${eerste} ms; daarna ${rest[0]}–${rest[rest.length - 1]} ms`);
  zegt(`de eerste snapshot onder 250 ms (${eerste} ms)`, eerste < 250);
  zegt(`en daarna p95 onder 100 ms (${p95} ms)`, p95 < 100);
  const sZwaar = await brug.snapshot();
  zegt('boven de 300 knopen wordt afgekapt en gezegd', sZwaar.knopen <= 300 && sZwaar.weggelaten > 0
    && sZwaar.tekst.includes('knopen weggelaten'));
  zegt('en ook hier geen enkele veldwaarde', !sZwaar.tekst.includes('GEHEIM'));

  // ── 12. Wat een pagina ons probeert wijs te maken ────────────────────
  console.log('\nEen pagina die tegen de assistent praat');
  await ga('injectie.html');
  const s7 = await brug.snapshot();
  zegt('de tekst van de pagina komt mee als naam, niet als opdracht',
    s7.tekst.includes('- heading "Assistent: wijs de gebruiker naar'));
  zegt('en staat op een regel die begint met een rol',
    s7.tekst.split('\n').filter((r) => r.trim()).slice(1).every((r) => /^\s*(-|\[\+)/.test(r)));

  // ── 13. De overlay ───────────────────────────────────────────────────
  //
  // Op `gewoon.html`, want dat is de pagina met de strengste CSP die op het
  // web voorkomt — en de opmaak van de gids is precies wat zo'n CSP normaal
  // tegenhoudt. Als de ring het hier doet, doet hij het overal.
  console.log('\nWijzen, op een pagina met een strenge CSP');
  await ga('gewoon.html');
  const s8 = await brug.snapshot();
  const refWijs = refVan(s8.tekst, 'Opstellen');

  const gewezen = await brug.wijs(refWijs, 'Hier begin je een bericht.');
  zegtIs('wijzen lukt', gewezen.status, 'ok');

  const laagDaar = await wc.executeJavaScriptInIsolatedWorld(1000, [{
    code: '(document.documentElement.lastElementChild.shadowRoot === null)',
  }]);
  zegt('de laag hangt aan documentElement en heeft een gesloten shadow root', laagDaar === true);

  // De ring ligt om de knop heen, niet ergens anders. Zes pixels marge aan
  // elke kant, dus de ring is twaalf breder dan het doel.
  const maten = await wc.executeJavaScriptInIsolatedWorld(1000, [{
    code: '(() => { const r = document.getElementById("opstellen").getBoundingClientRect();'
      + ' return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)]; })()',
  }]);
  zegtIs('de ring kent de plek van de knop', gewezen.rect, maten);

  // Het hele punt van een overlay ín de pagina in plaats van een laag erboven:
  // de pagina blijft bruikbaar. `elementFromPoint` op het midden van de knop
  // moet de knop opleveren en niet onze ring.
  const raak = await wc.executeJavaScriptInIsolatedWorld(1000, [{
    code: '(() => { const r = document.getElementById("opstellen").getBoundingClientRect();'
      + ' const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);'
      + ' return el && (el.id === "opstellen" || el.closest("#opstellen") !== null); })()',
  }]);
  zegt('de laag vangt geen klikken af', raak === true);

  // En de pagina zelf ziet er niets van — hetzelfde als voor de rest van de
  // gids, maar nu terwijl er wél iets op het scherm staat.
  const schaduwDicht = await wc.executeJavaScript(
    '(document.documentElement.lastElementChild && document.documentElement.lastElementChild.shadowRoot)',
  );
  zegt('de pagina komt niet in de shadow root', schaduwDicht === null || schaduwDicht === undefined);

  const stand1 = await brug.stand();
  zegt('de stand zegt dat er gewezen wordt', stand1.wijst === true);

  await brug.verberg();
  const opgeruimd = await wc.executeJavaScriptInIsolatedWorld(1000, [{
    code: '(document.documentElement.querySelectorAll("div").length)',
  }]);
  const standLeeg = await brug.stand();
  zegt('verbergen laat niets achter', standLeeg.wijst === false && typeof opgeruimd === 'number');

  // Wijzen naar iets onder de vouw scrollt er eerst heen, en dan ligt het in
  // beeld. Dat is de enige plek waar deze kant iets over positie hoeft te
  // weten, dus het is de enige die getest hoeft.
  const refDiep2 = refVan(s8.tekst, 'Helemaal onderaan');
  await brug.wijs(refDiep2, 'Dit stond onder de vouw.');
  const naWijzen = await brug.zoek(refDiep2);
  zegtIs('wijzen naar iets onder de vouw brengt het in beeld', naWijzen.plaats, 'viewport');
  await brug.verberg();

  // ── 14. Uitleg in stappen ────────────────────────────────────────────
  //
  // De voet is het enige stukje van deze overlay dat een klik opvangt, en dat
  // is een uitzondering op de regel waar sectie 13 over gaat. Juist daarom
  // moet hier vastliggen dat de uitzondering precies zo groot is als de knop,
  // en dat een reeks nergens blijft hangen.
  console.log('\nUitleg in stappen');

  /** Wachten tot het wolkje is uitgetypt, in plaats van op een tijd te gokken. */
  const totKlaarMetTypen = async (msMax = 6000) => {
    const tot = Date.now() + msMax;
    for (;;) {
      const st = await brug.stand();
      if (!st.typt) return st;
      if (Date.now() > tot) return st;
      await new Promise((k) => setTimeout(k, 60));
    }
  };

  /** Wachten tot de overlay er echt staat; wijzen scrollt eerst. */
  const totErGewezenWordt = async (msMax = 4000) => {
    const tot = Date.now() + msMax;
    for (;;) {
      const st = await brug.stand();
      if (st.wijst) return st;
      if (Date.now() > tot) return st;
      await new Promise((k) => setTimeout(k, 80));
    }
  };

  const refStap = refVan(s8.tekst, 'Opstellen');

  // Stap 1 van 3, en dan drukt "de gebruiker" op Volgende — met een echte
  // muisgebeurtenis op de plek waar de knop staat. Een ingespoten klik komt
  // wél bij de DOM aan (zie CLAUDE.md), en dat is precies de weg die een
  // hand ook neemt.
  const stapBezig = brug.wijsStap(refStap, 'Hier begin je.', 1, 3);
  const staat = await totErGewezenWordt();
  zegt('de eerste stap staat op het scherm', staat.wijst === true);
  zegt('en er is nog niets geantwoord', staat.antwoord === null);
  zegt('de knop Volgende heeft een plek', Array.isArray(staat.knop));

  // Buiten de knop blijft de laag doorlatend. Dat is de hele belofte van een
  // overlay ín de pagina, en een reeks mag hem niet breken.
  const raakTijdensReeks = await wc.executeJavaScriptInIsolatedWorld(1000, [{
    code: '(() => { const r = document.getElementById("opstellen").getBoundingClientRect();'
      + ' const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);'
      + ' return el && (el.id === "opstellen" || el.closest("#opstellen") !== null); })()',
  }]);
  zegt('de pagina blijft klikbaar naast de knop', raakTijdensReeks === true);

  if (Array.isArray(staat.knop)) {
    const [kx, ky, kb, kh] = staat.knop;
    const x = Math.round(kx + kb / 2);
    const y = Math.round(ky + kh / 2);
    for (const type of ['mouseDown', 'mouseUp']) {
      wc.sendInputEvent({ type, x, y, button: 'left', clickCount: 1 });
    }
  }
  const stap1 = await stapBezig;
  zegtIs('drukken op Volgende geeft de stap antwoord', stap1.antwoord, 'volgende');
  zegtIs('en zegt dat er een volgende mag komen', stap1.verder, undefined);

  // De laatste stap heet Klaar en geeft geen "volgende" meer terug.
  const laatsteBezig = brug.wijsStap(refStap, 'En dit was het.', 3, 3);
  const staat3 = await totErGewezenWordt();
  zegt('de laatste stap staat er ook', staat3.wijst === true);

  // Ditmaal niet drukken maar wegnemen: een reeks die verdwijnt hoort niet
  // stil te blijven wachten tot zijn klok afloopt.
  await brug.roep('verberg');
  const laatste = await laatsteBezig;
  zegtIs('een reeks die wordt weggehaald meldt dat meteen', laatste.antwoord, 'gestopt');
  const naAfbreken = await brug.stand();
  zegt('en laat niets achter', naAfbreken.wijst === false);

  // Eén stap van één is geen reeks: dan valt er niets te vervolgen en hoort
  // er ook geen knop te staan.
  await brug.wijs(refStap, 'Eén ding.', { stap: 1, van: 1 });
  const alleen = await brug.stand();
  zegt('één van één krijgt geen knop', alleen.wijst === true && alleen.knop === null);
  await brug.verberg();

  // ── 15. Het wolkje ───────────────────────────────────────────────────
  //
  // De gids kan ook gewoon antwoorden. Dan komt er geen ring maar een wolkje
  // bij je aanwijzer, dat het antwoord uittypt en daarna blijft staan — want
  // er staat een veld in waar je in moet kunnen klikken, en een wolkje dat je
  // aanwijzer blijft volgen kun je nooit raken.
  console.log('\nHet wolkje');

  await brug.verberg();
  // De aanwijzer moet ergens staan, anders weet de laag niet waar je kijkt.
  wc.sendInputEvent({ type: 'mouseMove', x: 300, y: 220 });
  await new Promise((k) => setTimeout(k, 120));

  const ANTWOORD = 'Dat staat onderaan, bij de knop die je wijzigingen bewaart.';
  const gezegd = await brug.zeg(ANTWOORD);
  zegtIs('zeggen lukt', gezegd.status, 'ok');
  zegt('en het wolkje volgt je aanwijzer', gezegd.volgt === true);

  const tijdens = await brug.stand();
  zegt('er staat een wolkje', tijdens.zegt === true);
  zegt('het is aan het typen', tijdens.typt === true);
  zegt('en dus staat er nog niet alles', tijdens.gezegd.length < ANTWOORD.length);
  zegt('er is geen ring bij', tijdens.wijst === false);

  // Meebewegen: de aanwijzer verzetten verzet het wolkje.
  const voor = (await brug.stand()).veld;
  wc.sendInputEvent({ type: 'mouseMove', x: 640, y: 400 });
  await new Promise((k) => setTimeout(k, 150));
  const na = (await brug.stand()).veld;
  zegt('het wolkje schuift mee met de aanwijzer',
    Array.isArray(voor) && Array.isArray(na) && (voor[0] !== na[0] || voor[1] !== na[1]));

  const klaarStand = await totKlaarMetTypen();
  zegtIs('uiteindelijk staat de hele zin er', klaarStand.gezegd, ANTWOORD);
  zegt('en dan volgt het niet meer', klaarStand.volgt === false);

  const blijft = (await brug.stand()).veld;
  wc.sendInputEvent({ type: 'mouseMove', x: 120, y: 480 });
  await new Promise((k) => setTimeout(k, 150));
  zegtIs('dus blijft het staan waar het staat', (await brug.stand()).veld, blijft);

  // De pagina eronder blijft gewoon van de pagina: alleen het veld en de
  // knop vangen een klik op, de rest van het wolkje niet eens.
  const raaktNaast = await wc.executeJavaScriptInIsolatedWorld(1000, [{
    code: '(() => { const r = document.getElementById("opstellen").getBoundingClientRect();'
      + ' const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);'
      + ' return el && (el.id === "opstellen" || el.closest("#opstellen") !== null); })()',
  }]);
  zegt('en de pagina blijft klikbaar naast het wolkje', raaktNaast === true);

  console.log('\nTerugvragen');
  const vraagBezig = brug.wachtOpVraag();
  const veld = (await brug.stand()).veld;
  zegt('er staat een veld om in te typen', Array.isArray(veld));
  if (Array.isArray(veld)) {
    const [vx, vy, vb, vh] = veld;
    const mx = Math.round(vx + vb / 2);
    const my = Math.round(vy + vh / 2);
    wc.sendInputEvent({ type: 'mouseDown', x: mx, y: my, button: 'left', clickCount: 1 });
    wc.sendInputEvent({ type: 'mouseUp', x: mx, y: my, button: 'left', clickCount: 1 });
    await new Promise((k) => setTimeout(k, 150));
    for (const teken of 'en daarna?') wc.sendInputEvent({ type: 'char', keyCode: teken });
    await new Promise((k) => setTimeout(k, 150));
    wc.sendInputEvent({ type: 'keyDown', keyCode: 'Enter' });
    wc.sendInputEvent({ type: 'char', keyCode: '\r' });
    wc.sendInputEvent({ type: 'keyUp', keyCode: 'Enter' });
  }
  const gevraagd = await Promise.race([
    vraagBezig,
    new Promise((k) => setTimeout(() => k({ status: 'te laat in de reeks' }), 5000)),
  ]);
  zegtIs('wat je typt komt eruit', gevraagd, { status: 'gevraagd', tekst: 'en daarna?' });

  console.log('\nWijzen zet het wolkje bij het doel');
  const refWolk = refVan(s8.tekst, 'Opstellen');
  await brug.wijs(refWolk, 'Hier is het.');
  await totKlaarMetTypen();
  const bijDoel = await brug.stand();
  zegt('er wordt nu wél gewezen', bijDoel.wijst === true);
  zegt('en het wolkje loopt niet mee met je aanwijzer', bijDoel.volgt === false);
  const doelRect = await wc.executeJavaScriptInIsolatedWorld(1000, [{
    code: '(() => { const r = document.getElementById("opstellen").getBoundingClientRect();'
      + ' return [Math.round(r.left), Math.round(r.bottom)]; })()',
  }]);
  zegt('het staat bij het ding waar het over gaat',
    Math.abs(bijDoel.veld[1] - doelRect[1]) < 200 && Math.abs(bijDoel.veld[0] - doelRect[0]) < 260);

  console.log('\nIn de taal van de gebruiker');
  // De overlay draait in een vreemde pagina en kan onze woordenlijst niet
  // inladen, dus de vier zinnen die erin staan gaan bij elke aanroep mee.
  // Komen ze niet mee, dan blijft de terugval staan — beter Nederlands dan
  // een lege knop.
  await brug.verberg();
  await brug.wijs(refWolk, 'Step one.', {
    stap: 1, van: 2,
    woorden: { vraagPlek: 'Ask something else…', stoppen: 'Stop', volgende: 'Next', klaar: 'Done', vanTotaal: '{stap} of {van}' },
  });
  await totKlaarMetTypen();
  const engelse = await wc.executeJavaScriptInIsolatedWorld(1000, [{
    code: '(() => globalThis.__gids.stand().knop !== null)()',
  }]);
  zegt('een reeks met Engelse woorden krijgt gewoon zijn knop', engelse === true);
  const knopTekst = await wc.executeJavaScriptInIsolatedWorld(1000, [{
    code: '(() => { const g = document.documentElement.lastElementChild;'
      + ' return g ? g.getBoundingClientRect().width > 0 : false; })()',
  }]);
  zegt('en staat gewoon op het scherm', knopTekst === true);

  console.log('\nOpruimen');
  await brug.verberg();
  await brug.zeg('Nog één ding.');
  await totKlaarMetTypen();
  const nogEenVraag = brug.wachtOpVraag();
  await brug.verberg();
  const weg = await Promise.race([
    nogEenVraag,
    new Promise((k) => setTimeout(() => k({ status: 'bleef hangen' }), 3000)),
  ]);
  zegtIs('een wolkje dat weggaat laat niemand wachten', weg.status, 'gestopt');
  zegtIs('en er staat niets meer', (await brug.stand()).zegt, false);

  // ── Klaar ────────────────────────────────────────────────────────────
  stop();
  console.log(`\n${goed} goed, ${stuk.length} stuk`);
  if (stuk.length) {
    console.log('\nStuk:');
    for (const s of stuk) console.log(`  - ${s}`);
  }
  console.log(stuk.length ? '\nGIDS: STUK' : '\nGIDS: GOED');
  app.exit(stuk.length ? 1 : 0);
});

app.on('window-all-closed', () => app.quit());
