/*
 * Aanmelden met Google, uitgeprobeerd.
 *
 * De belofte van dit hele mechanisme staat in docs/ACCOUNTS.md en is er één
 * die je niet aan de code kunt zien: log je in bij Google in een gewoon
 * tabblad, dan bén je daarna in deze browser bij Google ingelogd, en openen
 * gmail.com en drive.google.com zonder dat je nog iets hoeft te doen.
 *
 * Dat berust op één ding — dat het aanmeldscherm in de sessie van jóúw
 * workspace staat en niet in een venster dat je nooit meer ziet — en dat is
 * precies wat hier wordt nagespeeld: een neppe aanmeldserver die een koekje
 * neerzet, en daarna de vraag of een ander tabblad in dezelfde workspace dat
 * koekje meestuurt.
 *
 * De tweede helft is de deur. Het terugkomstadres draagt de sleutels van je
 * sessie, dus een terugkomst uit een tabblad dat jij niet begon hoort
 * geweigerd te worden. `docs/ACCOUNTS.md` verwees naar een reeks die deze
 * aanval nadeed; die reeks stond niet in deze map. Nu wel.
 *
 *   npm run test:inloggen
 */

const { app, BrowserWindow, WebContentsView, session } = require('electron');
const http = require('node:http');
const path = require('node:path');

const {
  isAanmeldStart,
  isTerugkomst,
  isGeweigerd,
  foutIn,
  Aanmelding,
  useragentVoor,
  GELDIG_MS,
} = require('../lib/inloggen.js');

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

/**
 * Een neppe Google plus een neppe Supabase.
 *
 * `/auth/v1/authorize` is waar de app heen navigeert; die doet alsof hij
 * Google is, zet een koekje zoals Google dat doet, en stuurt daarna terug.
 * `/ingelogd` is de tweede pagina, die alleen vertelt welk koekje hij kreeg —
 * dat is de hele meting.
 */
function server() {
  const s = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/auth/v1/authorize') {
      res.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        // Zoals een aanmeldserver het zet: voor het hele domein, en het
        // overleeft het sluiten van het tabblad.
        'set-cookie': 'SID=ingelogd-als-jij; Path=/; Max-Age=3600; SameSite=Lax',
      });
      res.end('<!doctype html><title>Aanmelden</title><p>ingelogd');
      return;
    }
    if (u.pathname === '/ingelogd') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(`<!doctype html><title>Wie ben ik</title><p id="k">${req.headers.cookie ?? 'geen koekje'}`);
      return;
    }
    res.writeHead(404);
    res.end('nee');
  });
  return new Promise((k) => s.listen(0, '127.0.0.1', () =>
    k({ basis: `http://127.0.0.1:${s.address().port}`, stop: () => s.close() })));
}

const laad = (view, url) => new Promise((k) => {
  view.webContents.once('did-finish-load', () => setTimeout(k, 80));
  view.webContents.loadURL(url);
});

/** Een tabblad zoals createTab er een maakt: eigen partitie, verder niets. */
function tabblad(win, partitie) {
  const view = new WebContentsView({
    webPreferences: {
      partition: partitie,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.contentView.addChildView(view);
  view.setBounds({ x: 0, y: 0, width: 900, height: 600 });
  return view;
}

app.whenReady().then(async () => {
  const { basis, stop } = await server();
  const win = new BrowserWindow({ width: 900, height: 600, show: true });

  // ── 1. De adressen die tellen ────────────────────────────────────────
  console.log('\nWelke adressen een aanmelding zijn');
  zegt('Supabase → Google telt als start',
    isAanmeldStart('https://p.supabase.co/auth/v1/authorize?provider=google'));
  zegt('de organisatie-inlog ook',
    isAanmeldStart('https://p.supabase.co/auth/v1/sso?domain=x.nl'));
  zegt('over http niet', !isAanmeldStart('http://p.supabase.co/auth/v1/authorize'));
  zegt('een willekeurige pagina niet', !isAanmeldStart('https://example.com/auth/v1/authorize/../x'));
  zegt('de terugkomst wordt herkend', isTerugkomst('tougather://app/auth/callback#access_token=x'));
  zegt('en een andere host niet', !isTerugkomst('tougather://kwaad/auth/callback'));
  zegt('en een ander pad niet', !isTerugkomst('tougather://app/auth/anders'));

  console.log('\nAls Google ons de deur wijst');
  zegt('de afwijzingspagina wordt herkend',
    isGeweigerd('https://accounts.google.com/v3/signin/rejected?dsh=1&rrk=2'));
  zegt('ook de oude vorm',
    isGeweigerd('https://accounts.google.com/signin/rejected?x=1'));
  zegt('en deniedsigninrejected',
    isGeweigerd('https://accounts.google.com/deniedsigninrejected'));
  zegt('een gewoon aanmeldscherm is geen afwijzing',
    !isGeweigerd('https://accounts.google.com/o/oauth2/v2/auth?client_id=x'));
  zegt('en een site die zich zo voordoet ook niet',
    !isGeweigerd('https://accounts.google.com.kwaad.nl/v3/signin/rejected'));

  console.log('\nWat er misging, uit beide plekken');
  zegtIs('uit de zoekstring',
    foutIn('tougather://app/auth/callback?error_description=Provider+is+not+enabled'),
    'Provider is not enabled');
  zegtIs('en van achter het hekje',
    foutIn('tougather://app/auth/callback#error=access_denied&error_description=Je+brak+af'),
    'Je brak af');
  zegtIs('geen fout is null', foutIn('tougather://app/auth/callback#access_token=x'), null);

  // ── 2. De deur ───────────────────────────────────────────────────────
  console.log('\nDe deur: alleen jouw eigen aanmelding komt binnen');
  const a = new Aanmelding();
  zegt('zonder begin komt niemand binnen', !a.hoortBij(7));
  a.begin(7, 'https://p.supabase.co/auth/v1/authorize');
  zegt('uit het tabblad dat wij openden wel', a.hoortBij(7));
  zegt('uit een ander tabblad niet', !a.hoortBij(8));
  a.klaar();
  zegt('en daarna niet nog een keer', !a.hoortBij(7));

  a.begin(9, 'https://p.supabase.co/auth/v1/authorize');
  a.bezig.op = Date.now() - GELDIG_MS - 1000;
  zegt('een aanmelding van een kwartier oud verloopt', !a.hoortBij(9));
  zegt('en telt niet meer als lopend', !a.loopt);

  // ── 3. De useragent ──────────────────────────────────────────────────
  console.log('\nDe useragent');
  const rauw = app.userAgentFallback;
  const ua = useragentVoor(rauw, '0.1.0', 'Tougather');
  zegt('Electron staat er niet meer in', !/electron/i.test(ua));
  zegt('onze naam staat achteraan', /TougatherBrowser\/0\.1\.0$/.test(ua));
  zegt('en niet vóór Chrome, waar een ingebouwd venstertje staat',
    !/Tougather\/[\d.]+\s+Chrome/i.test(ua));
  zegt('twee keer toepassen verandert niets',
    useragentVoor(ua, '0.1.0', 'Tougather') === ua);
  zegt('Chrome staat er nog in', /Chrome\/\d+/.test(ua));
  console.log(`      ${ua}`);

  // ── 4. De hele reden dat dit in een gewoon tabblad gebeurt ───────────
  //
  // Dit is de belofte uit docs/ACCOUNTS.md, nagespeeld: meld je aan in een
  // tabblad van je workspace, en elk ander tabblad in diezelfde workspace is
  // daarna ook aangemeld.
  console.log('\nAangemeld blijven, in de hele workspace');

  const werk = tabblad(win, 'persist:test-werk');
  await laad(werk, `${basis}/auth/v1/authorize?provider=google`);

  const tweede = tabblad(win, 'persist:test-werk');
  await laad(tweede, `${basis}/ingelogd`);
  const gezien = await tweede.webContents.executeJavaScript('document.getElementById("k").textContent');
  zegtIs('een tweede tabblad in dezelfde workspace is ook aangemeld',
    gezien, 'SID=ingelogd-als-jij');

  // En de andere helft van diezelfde belofte: een andere workspace deelt niets.
  const prive = tabblad(win, 'test-prive');
  await laad(prive, `${basis}/ingelogd`);
  const gezienPrive = await prive.webContents.executeJavaScript('document.getElementById("k").textContent');
  zegtIs('een andere workspace weet van niets', gezienPrive, 'geen koekje');

  // Een privéworkspace draait op een partitie zónder persist:, en die hoort
  // niets op schijf achter te laten.
  const opSchijf = await session.fromPartition('test-prive').cookies.get({});
  zegtIs('en een privésessie houdt geen koekjes vast', opSchijf.length, 0);

  const bewaard = await session.fromPartition('persist:test-werk').cookies.get({});
  zegt('terwijl de gewone workspace hem wél bewaart',
    bewaard.some((c) => c.name === 'SID'));

  // ── Klaar ────────────────────────────────────────────────────────────
  stop();
  console.log(`\n${goed} goed, ${stuk.length} stuk`);
  if (stuk.length) {
    console.log('\nStuk:');
    for (const s of stuk) console.log(`  - ${s}`);
  }
  console.log(stuk.length ? '\nINLOGGEN: STUK' : '\nINLOGGEN: GOED');
  app.exit(stuk.length ? 1 : 0);
});

app.on('window-all-closed', () => app.quit());
