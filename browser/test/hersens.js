/*
 * De hersens van de gids: wat er in de aanroep staat, en wat de deur weigert.
 *
 *   node test/hersens.js
 *
 * Dit is de enige reeks in deze map die geen Electron nodig heeft — hij gaat
 * over de vorm van een aanroep en over een grendel, en allebei zijn dat gewone
 * functies. Waarom hij bestaat: een gidsronde is dezelfde agent als een
 * opdracht met een andere houding en een kortere lijst gereedschap. Dat "en"
 * is het soort verschil dat je bij een volgende wijziging kwijtraakt zonder
 * dat er iets stukgaat — tot iemand vraagt waar hij iets uitzet en de
 * assistent een pagina opent.
 */

const {
  bouwArgumenten, HOUDING, GIDS_HOUDING, GIDS_GEREEDSCHAP,
} = require('../lib/agent.js');

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

/** De waarde die achter een vlag staat. */
const na = (arg, vlag) => arg[arg.indexOf(vlag) + 1];
/** Alle waarden achter een vlag die er meerdere heeft. */
function alleNa(arg, vlag) {
  const begin = arg.indexOf(vlag);
  if (begin < 0) return [];
  const uit = [];
  for (let i = begin + 1; i < arg.length && !arg[i].startsWith('--'); i += 1) uit.push(arg[i]);
  return uit;
}

console.log('\nDe gewone opdracht');
const gewoon = bouwArgumenten({
  opdracht: 'zoek iets op',
  brugConfig: '{}',
  gereedschap: ['open_pagina', 'lees_pagina'],
});
zegtIs('de opdracht staat achter -p', na(gewoon, '-p'), 'zoek iets op');
zegtIs('de houding is de gewone', na(gewoon, '--append-system-prompt'), HOUDING);
zegt('eigen gereedschap staat uit', na(gewoon, '--tools') === '');
zegt('en alleen onze brug telt', gewoon.includes('--strict-mcp-config'));
zegt('geen sessie op schijf', gewoon.includes('--no-session-persistence'));
zegt('en geen slash-commando\'s', gewoon.includes('--disable-slash-commands'));

console.log('\nDe gidsronde');
const gids = bouwArgumenten({
  opdracht: 'waar zet ik dit uit?',
  brugConfig: '{}',
  gereedschap: GIDS_GEREEDSCHAP,
  houding: GIDS_HOUDING,
});
zegtIs('krijgt de gidshouding mee', na(gids, '--append-system-prompt'), GIDS_HOUDING);
zegt('en dat is een andere dan de gewone', GIDS_HOUDING !== HOUDING);
zegtIs('met precies het gereedschap van de gids', alleNa(gids, '--allowedTools'), [
  'mcp__tougather__jouw_paginas',
  'mcp__tougather__bekijk_jouw_pagina',
  'mcp__tougather__wijs_aan',
  'mcp__tougather__wijs_stap',
  'mcp__tougather__wijs_niet_meer',
]);

console.log('\nWat een gidsronde niet mag');
// Dit is de kern. Een gids die een pagina kan openen, kan klikken of kan typen
// is geen gids meer; en de tekst van jouw pagina heeft hij niet nodig om iets
// aan te kunnen wijzen.
for (const verboden of ['open_pagina', 'lees_pagina', 'sluit_pagina', 'klik', 'typ', 'lees_jouw_pagina']) {
  zegt(`${verboden} zit er niet in`, !GIDS_GEREEDSCHAP.includes(verboden));
}

console.log('\nDe houding zegt het ook');
const h = GIDS_HOUDING.toLowerCase();
zegt('dat hij niet klikt', h.includes('klikt niet'));
zegt('dat hij niet typt', h.includes('typt niet'));
zegt('dat hij nergens heen navigeert', h.includes('navigeert'));
zegt('en dat hij één ding aanwijst', h.includes('precies één ding'));
zegt('en wanneer hij stappen gebruikt', h.includes('wijs_stap'));
zegt('en dat gestopt ook echt stoppen betekent', h.includes('dring niet aan'));
// De gids hoeft niet te wijzen om te antwoorden. Stond dat er niet, dan gaat
// hij naar iets zoeken om een ring omheen te zetten bij elke vraag.
zegt('dat hij ook alleen in woorden mag antwoorden', h.includes('alleen in woorden'));
zegt('en dat zijn tekst in een wolkje terechtkomt', h.includes('wolkje'));

console.log('\nWanneer een volgende stap zonder vraag mag');
// De regel waar de belofte "geen altijd toestaan" op staat of valt. Een reeks
// die loopt: stap 1 van 3 is gewezen en de gebruiker heeft op Volgende gedrukt.
const { oordeel } = require('../lib/gids/reeks.js');
const loopt = { tabId: 7, van: 3, stap: 1, open: true };
const wacht = { tabId: 7, van: 3, stap: 1, open: false };

zegtIs('stap 1 vraagt altijd', oordeel(null, { tabId: 7, stap: 1, van: 3 }), { vragen: true });
zegtIs('ook als er al een reeks loopt', oordeel(loopt, { tabId: 7, stap: 1, van: 3 }), { vragen: true });
zegtIs('stap 2 na een druk op Volgende vraagt niet',
  oordeel(loopt, { tabId: 7, stap: 2, van: 3 }), { vragen: false });

const bezwaar = (r, v) => oordeel(r, v).bezwaar ?? null;
zegt('stap 2 zonder dat er gedrukt is mag niet',
  Boolean(bezwaar(wacht, { tabId: 7, stap: 2, van: 3 })));
zegt('stap 2 zonder reeks mag niet',
  Boolean(bezwaar(null, { tabId: 7, stap: 2, van: 3 })));
zegt('stap 2 op een ánder tabblad mag niet',
  Boolean(bezwaar(loopt, { tabId: 8, stap: 2, van: 3 })));
zegt('stap 3 slaat er een over en mag niet',
  Boolean(bezwaar(loopt, { tabId: 7, stap: 3, van: 3 })));
zegt('een reeks die ineens langer wordt mag niet',
  Boolean(bezwaar(loopt, { tabId: 7, stap: 2, van: 9 })));
zegt('stap 0 bestaat niet', Boolean(bezwaar(loopt, { tabId: 7, stap: 0, van: 3 })));
zegt('stap 4 van 3 ook niet', Boolean(bezwaar(loopt, { tabId: 7, stap: 4, van: 3 })));
zegt('en een pagina die geen getal is ook niet',
  Boolean(bezwaar(loopt, { tabId: 'zeven', stap: 1, van: 3 })));

console.log('\nWijzen na een vraag die de gebruiker zelf typte');
// Het wolkje staat op het scherm van de gebruiker, in zijn eigen pagina. Wie
// daarin typt doet een handeling op het ding waar het over gaat, en dat is de
// toestemming om het antwoord daar ook aan te wijzen — één beurt, één tabblad.
const { magWijzen } = require('../lib/gids/reeks.js');
zegtIs('zonder gesprek vraagt hij gewoon',
  magWijzen(null, { tabId: 3 }), { vragen: true });
zegtIs('een gesprek waarin niemand net iets vroeg ook',
  magWijzen({ tabId: 3, gevraagd: false }, { tabId: 3 }), { vragen: true });
zegtIs('maar na een vraag in het wolkje niet',
  magWijzen({ tabId: 3, gevraagd: true }, { tabId: 3 }), { vragen: false });
zegtIs('en op een ánder tabblad weer wel',
  magWijzen({ tabId: 3, gevraagd: true }, { tabId: 4 }), { vragen: true });
zegtIs('een pagina die geen getal is vraagt ook gewoon',
  magWijzen({ tabId: 3, gevraagd: true }, { tabId: 'drie' }), { vragen: true });

console.log('\nDe grendel op de deur');
// Een houding is een instructie; dit is het slot. Zonder Electron: de deur
// heeft voor deze twee paden geen venster nodig.
const { McpDeur } = require('../lib/mcp.js');
const gemeld = [];
const deur = new McpDeur({ controller: () => null, meld: (m) => gemeld.push(m) });

zegtIs('zonder beperking staat er niets in de stand', deur.stand().beperking, null);
deur.beperkTot(GIDS_GEREEDSCHAP);
zegtIs('met beperking staat de lijst erin', deur.stand().beperking, GIDS_GEREEDSCHAP);

const probeer = async (naam) => {
  try {
    await deur.roep(naam, {});
    return 'gelukt';
  } catch (e) {
    return String(e.message ?? e);
  }
};

(async () => {
  zegt('open_pagina wordt geweigerd door de grendel',
    (await probeer('open_pagina')).includes('wijst iets aan'));
  zegt('en dat komt in het logboek te staan',
    gemeld.some((m) => m.soort === 'geweigerd' && m.naam === 'open_pagina'));
  // wijs_aan komt langs de grendel en valt daarna op iets anders om: er is
  // geen venster. Dat is precies het bewijs dat de grendel hem doorliet.
  zegt('wijs_aan komt langs de grendel',
    (await probeer('wijs_aan')) === 'Er is geen venster open');

  deur.beperkTot(null);
  zegtIs('en de grendel gaat er weer af', deur.stand().beperking, null);

  console.log(`\n${goed} goed, ${stuk.length} stuk`);
  if (stuk.length) { console.log('\nStuk:'); for (const s of stuk) console.log(`  - ${s}`); }
  console.log(stuk.length ? '\nHERSENS: STUK' : '\nHERSENS: GOED');
  process.exit(stuk.length ? 1 : 0);
})();
