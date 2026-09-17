/*
 * Wat er binnenkomt, tegen een echte server en een echte sessie.
 *
 *   xvfb-run -a npx electron --no-sandbox test/downloads.js
 *
 * De drie dingen die hier vastliggen zijn de drie dingen die stilletjes fout
 * kunnen gaan: dat twee bestanden met dezelfde naam twee bestanden blijven,
 * dat de lijst het einde ook echt meldt, en dat een .exe geen regel wordt die
 * je met één klik kunt starten.
 */

const { app, BrowserWindow, session } = require('electron');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { Downloads, magOpen, vrijePlek } = require('../lib/downloads.js');

const INHOUD = 'x'.repeat(4096);

function server() {
  const s = http.createServer((req, res) => {
    const naam = req.url === '/programma' ? 'installer.exe' : 'rapport.pdf';
    res.writeHead(200, {
      'content-type': 'application/octet-stream',
      'content-length': String(Buffer.byteLength(INHOUD)),
      'content-disposition': `attachment; filename="${naam}"`,
    });
    res.end(INHOUD);
  });
  return new Promise((k) => s.listen(0, '127.0.0.1', () =>
    k({ basis: `http://127.0.0.1:${s.address().port}`, stop: () => s.close() })));
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
  const map = fs.mkdtempSync(path.join(os.tmpdir(), 'tougather-dl-'));

  console.log('\nNamen');
  // Geen echte download nodig: dit is rekenwerk over een map.
  fs.writeFileSync(path.join(map, 'bezet.txt'), 'a');
  zegtIs('een vrije naam blijft zoals hij is',
    path.basename(vrijePlek(map, 'vrij.txt')), 'vrij.txt');
  zegtIs('een bezette naam krijgt een nummer',
    path.basename(vrijePlek(map, 'bezet.txt')), 'bezet (1).txt');
  zegtIs('een pad in de naam telt niet mee',
    path.basename(vrijePlek(map, '../../etc/passwd')), 'passwd');

  console.log('\nWat er open mag');
  zegt('een pdf mag open', magOpen('rapport.pdf'));
  zegt('een exe niet', !magOpen('installer.exe'));
  zegt('een shellscript niet', !magOpen('doe.sh'));
  zegt('EXE in hoofdletters ook niet', !magOpen('INSTALLER.EXE'));
  zegt('iets zonder extensie ook niet', !magOpen('start'));

  console.log('\nOphalen');
  const dl = new Downloads();
  dl.map = map;
  const ses = session.fromPartition(`test-downloads-${Date.now()}`);
  dl.bewaak(ses);

  const win = new BrowserWindow({ show: false, webPreferences: { session: ses } });
  await win.loadURL('about:blank');

  /** Eén download, en de regel zoals hij eruitziet als hij af is. */
  const haal = (pad) => new Promise((klaar) => {
    const klok = setTimeout(() => { los(); klaar({ status: 'te laat' }); }, 6000);
    const los = dl.opVerandering((lijst) => {
      const eerste = lijst[0];
      if (!eerste || eerste.status === 'bezig' || eerste.status === 'gepauzeerd') return;
      clearTimeout(klok);
      los();
      klaar(eerste);
    });
    win.webContents.downloadURL(`${basis}${pad}`);
  });

  const een = await haal('/document');
  zegtIs('de download komt af', een.status, 'klaar');
  zegtIs('met de naam uit de content-disposition', een.naam, 'rapport.pdf');
  zegtIs('en alle bytes', een.ontvangen, Buffer.byteLength(INHOUD));
  zegt('het bestand staat er ook echt', fs.existsSync(path.join(map, 'rapport.pdf')));
  zegt('en het mag open', een.kanOpenen === true);

  const twee = await haal('/document');
  zegtIs('dezelfde naam nog eens overschrijft niets', twee.naam, 'rapport (1).pdf');
  zegt('dus staan er nu twee', fs.existsSync(path.join(map, 'rapport (1).pdf')));

  const drie = await haal('/programma');
  zegtIs('een programma komt gewoon binnen', drie.status, 'klaar');
  zegt('maar krijgt geen klik die hem start', drie.kanOpenen === false);

  console.log('\nDe lijst');
  zegtIs('drie regels, nieuwste bovenaan', dl.lijst().map((d) => d.naam),
    ['installer.exe', 'rapport (1).pdf', 'rapport.pdf']);
  zegt('open() weigert wat niet open mag', dl.open(drie.id) === false);

  dl.wis();
  zegtIs('wissen maakt de lijst leeg', dl.lijst().length, 0);
  zegt('en laat de bestanden staan', fs.existsSync(path.join(map, 'installer.exe')));

  stop();
  fs.rmSync(map, { recursive: true, force: true });
  console.log(`\n${goed} goed, ${stuk.length} stuk`);
  if (stuk.length) { console.log('\nStuk:'); for (const s of stuk) console.log(`  - ${s}`); }
  console.log(stuk.length ? '\nDOWNLOADS: STUK' : '\nDOWNLOADS: GOED');
  app.exit(stuk.length ? 1 : 0);
});

app.on('window-all-closed', () => app.quit());
