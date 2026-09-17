/*
 * De tweede rug: de API van de gebruiker zelf.
 *
 *   xvfb-run -a npx electron --no-sandbox test/api.js
 *
 * Er gaat hier geen enkele aanroep het net op. `fetch` wordt vervangen door
 * een nepversie die vastlegt wat eruit zou gaan en teruggeeft wat erin zou
 * komen. Dat is precies wat er te testen valt: de vorm van de aanroep, de
 * lus die gereedschap pakt en terugkoppelt, en wat er gebeurt als het misgaat.
 *
 * Electron is nodig voor één ding: `safeStorage`, waar lib/sleutel.js de
 * sleutel mee versleutelt.
 */

const { app } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { ApiOpdracht, naarGereedschap, foutTekst, STANDAARD_MODEL } = require('../lib/api.js');
const sleutel = require('../lib/sleutel.js');

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

/** Een nep-fetch die een rij antwoorden afwerkt en de aanroepen bewaart. */
function nepHaal(antwoorden) {
  const gezien = [];
  const haal = async (url, opties) => {
    gezien.push({ url, opties, lijf: JSON.parse(opties.body) });
    const volgende = antwoorden.shift() ?? { ok: true, status: 200, lijf: { content: [] } };
    return {
      ok: volgende.ok !== false,
      status: volgende.status ?? 200,
      json: async () => volgende.lijf,
    };
  };
  haal.gezien = gezien;
  return haal;
}

/** Een deur die alleen onthoudt wat er geroepen werd. */
function nepDeur(uitkomsten = {}) {
  const geroepen = [];
  return {
    geroepen,
    async roep(naam, arg) {
      geroepen.push({ naam, arg });
      const uit = uitkomsten[naam];
      if (uit instanceof Error) throw uit;
      return uit ?? { ok: true };
    },
  };
}

const wacht = (fn) => new Promise((klaar) => {
  const meldingen = [];
  fn(meldingen, () => klaar(meldingen));
});

app.whenReady().then(async () => {
  console.log('\nDe gereedschapslijst');
  const stukken = [
    { naam: 'jouw_paginas', zegt: 'De titels van jouw tabbladen.', invoer: { type: 'object', properties: {} } },
  ];
  zegtIs('krijgt de vorm die de API wil', naarGereedschap(stukken), [
    { name: 'jouw_paginas', description: 'De titels van jouw tabbladen.', input_schema: { type: 'object', properties: {} } },
  ]);

  console.log('\nEén beurt, zonder gereedschap');
  const haal1 = nepHaal([{ lijf: { content: [{ type: 'text', text: 'Rechtsboven, bij Instellingen.' }] } }]);
  const meldingen1 = await wacht((uit, klaar) => {
    new ApiOpdracht({
      sleutel: 'sk-ant-geheim', deur: nepDeur(), stukken, houding: 'wees kort', haal: haal1,
      opMelding: (m) => { uit.push(m); if (m.soort === 'afgelopen') klaar(); },
    }).start('waar staat dat?');
  });
  zegtIs('meldt begin, zegt, klaar, afgelopen', meldingen1.map((m) => m.soort),
    ['begin', 'zegt', 'klaar', 'afgelopen']);
  zegtIs('en het antwoord is de tekst', meldingen1[2].tekst, 'Rechtsboven, bij Instellingen.');

  console.log('\nWat er de deur uit gaat');
  const a1 = haal1.gezien[0];
  zegtIs('naar de API van Anthropic en nergens anders', a1.url, 'https://api.anthropic.com/v1/messages');
  zegtIs('met de sleutel in de kop', a1.opties.headers['x-api-key'], 'sk-ant-geheim');
  zegtIs('en een versie erbij', a1.opties.headers['anthropic-version'], '2023-06-01');
  zegtIs('het standaardmodel als je niets kiest', a1.lijf.model, STANDAARD_MODEL);
  zegtIs('de houding staat in system', a1.lijf.system, 'wees kort');
  zegtIs('en de vraag in messages', a1.lijf.messages, [{ role: 'user', content: 'waar staat dat?' }]);
  zegt('de sleutel staat niet in het lijf', !JSON.stringify(a1.lijf).includes('sk-ant-geheim'));

  console.log('\nGereedschap pakken en terugkoppelen');
  const haal2 = nepHaal([
    { lijf: { content: [{ type: 'tool_use', id: 'tu_1', name: 'jouw_paginas', input: {} }] } },
    { lijf: { content: [{ type: 'text', text: 'Je hebt twee tabbladen open.' }] } },
  ]);
  const deur2 = nepDeur({ jouw_paginas: [{ id: 1 }, { id: 2 }] });
  const meldingen2 = await wacht((uit, klaar) => {
    new ApiOpdracht({
      sleutel: 'k', deur: deur2, stukken, haal: haal2,
      opMelding: (m) => { uit.push(m); if (m.soort === 'afgelopen') klaar(); },
    }).start('wat heb ik open?');
  });
  zegtIs('de deur werd één keer geroepen', deur2.geroepen.map((g) => g.naam), ['jouw_paginas']);
  zegtIs('en de balk zag hem bezig', meldingen2.map((m) => m.soort),
    ['begin', 'doet', 'zegt', 'klaar', 'afgelopen']);
  const tweede = haal2.gezien[1].lijf.messages;
  zegtIs('het gesprek groeide met twee berichten', tweede.length, 3);
  zegtIs('en de uitkomst ging terug als tool_result', tweede[2].content[0].type, 'tool_result');
  zegtIs('met hetzelfde id', tweede[2].content[0].tool_use_id, 'tu_1');
  zegt('en de uitkomst erin', tweede[2].content[0].content.includes('"id":1'));

  console.log('\nEen weigering is geen storing');
  // De browser weigert iets — een privétabblad, een grendel, een nee van de
  // gebruiker. Dat hoort het model te horen, niet de lus te breken.
  const haal3 = nepHaal([
    { lijf: { content: [{ type: 'tool_use', id: 'tu_2', name: 'jouw_paginas', input: {} }] } },
    { lijf: { content: [{ type: 'text', text: 'Dat mag ik niet zien.' }] } },
  ]);
  const deur3 = nepDeur({ jouw_paginas: new Error('Niet toegestaan: jij zei nee') });
  const meldingen3 = await wacht((uit, klaar) => {
    new ApiOpdracht({
      sleutel: 'k', deur: deur3, stukken, haal: haal3,
      opMelding: (m) => { uit.push(m); if (m.soort === 'afgelopen') klaar(); },
    }).start('kijk eens');
  });
  zegt('de lus gaat door', meldingen3.some((m) => m.soort === 'klaar'));
  zegt('en meldt dat het niet lukte', meldingen3.some((m) => m.soort === 'mislukt'));
  const derde = haal3.gezien[1].lijf.messages[2].content[0];
  zegt('het model krijgt de reden', derde.content.includes('jij zei nee'));
  zegt('als fout gemarkeerd', derde.is_error === true);

  console.log('\nAls het misgaat');
  const haal4 = nepHaal([{ ok: false, status: 401, lijf: { error: { message: 'invalid x-api-key' } } }]);
  const meldingen4 = await wacht((uit, klaar) => {
    new ApiOpdracht({
      sleutel: 'fout', deur: nepDeur(), stukken, haal: haal4,
      opMelding: (m) => { uit.push(m); if (m.soort === 'afgelopen') klaar(); },
    }).start('hoi');
  });
  zegt('401 wordt een zin die zegt wat je moet doen',
    meldingen4.some((m) => m.soort === 'fout' && m.tekst.includes('Instellingen')));
  zegt('en de lus stopt', meldingen4[meldingen4.length - 1].soort === 'afgelopen');
  zegt('429 zegt iets anders dan 500', foutTekst(429, {}) !== foutTekst(500, {}));
  zegt('en geen van beide is de rauwe status', !foutTekst(500, {}).includes('500'));

  console.log('\nGeen net');
  const meldingen5 = await wacht((uit, klaar) => {
    new ApiOpdracht({
      sleutel: 'k', deur: nepDeur(), stukken,
      haal: async () => { throw new Error('getaddrinfo ENOTFOUND'); },
      opMelding: (m) => { uit.push(m); if (m.soort === 'afgelopen') klaar(); },
    }).start('hoi');
  });
  zegt('wordt gemeld en niet verzwegen',
    meldingen5.some((m) => m.soort === 'fout' && m.tekst.includes('Kon de API niet bereiken')));

  console.log('\nDe sleutel op schijf');
  const map = fs.mkdtempSync(path.join(os.tmpdir(), 'tougather-sleutel-'));
  const pad = path.join(map, 'sleutel.dat');
  sleutel.zetPadVoorTest(pad);

  zegtIs('zonder sleutel is er niets', sleutel.heeft().aanwezig, false);
  sleutel.zet('sk-ant-abcdefghijkl');
  zegtIs('daarna wel', sleutel.heeft().aanwezig, true);
  zegtIs('en je ziet alleen de staart', sleutel.heeft().staart, 'ijkl');
  zegtIs('teruglezen geeft hem heel', sleutel.lees(), 'sk-ant-abcdefghijkl');

  // Opnieuw inlezen alsof de app net start: het geheugen leeg, alleen het
  // bestand. Dat is waar versleutelen iets moet betekenen.
  sleutel.zetPadVoorTest(pad);
  zegtIs('en na een herstart staat hij er nog', sleutel.lees(), 'sk-ant-abcdefghijkl');

  const opSchijf = fs.readFileSync(pad);
  if (sleutel.kanVersleutelen()) {
    zegt('op schijf staat hij niet leesbaar', !opSchijf.toString('utf8').includes('sk-ant-'));
  } else {
    // Geen sleutelbos op deze machine. Dan staat het er plat, en dat zegt de
    // uitleg in Instellingen er ook bij.
    zegt('zonder sleutelbos staat het er plat, en dat is eerlijk zo',
      opSchijf.toString('utf8').startsWith('plat:'));
  }
  zegtIs('de rechten zijn alleen voor deze gebruiker',
    fs.statSync(pad).mode & 0o777, 0o600);

  sleutel.wis();
  zegtIs('wissen laat niets staan', sleutel.heeft().aanwezig, false);
  zegt('en het bestand is weg', !fs.existsSync(pad));

  fs.rmSync(map, { recursive: true, force: true });
  console.log(`\n${goed} goed, ${stuk.length} stuk`);
  if (stuk.length) { console.log('\nStuk:'); for (const s of stuk) console.log(`  - ${s}`); }
  console.log(stuk.length ? '\nAPI: STUK' : '\nAPI: GOED');
  app.exit(stuk.length ? 1 : 0);
});

app.on('window-all-closed', () => app.quit());
