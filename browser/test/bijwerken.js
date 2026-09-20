/*
 * Kijken of er een nieuwere versie is.
 *
 *   node test/bijwerken.js
 *
 * Geen Electron en geen netwerk: `fetch` wordt vervangen door een nepversie
 * die vastlegt wat eruit zou gaan en teruggeeft wat erin zou komen. Dat laatste
 * is hier belangrijker dan gewoonlijk — een reeks die écht naar GitHub belt is
 * een reeks die stuk gaat als GitHub het even niet doet, en die bovendien elke
 * keer dat iemand hem draait zijn IP-adres achterlaat.
 *
 * Waar het hier vooral over gaat is het vergelijken van versies. Dat is het
 * soort code dat er in vijf regels goed uitziet en in één geval stilletjes het
 * omgekeerde doet — en dat ene geval is dan precies degene die niet te horen
 * krijgt dat hij een jaar achterloopt.
 */

const { kijk, vergelijk, nieuwsteUit, BRON } = require('../lib/bijwerken.js');

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

/** Een nep-GitHub die één antwoord geeft en de aanvraag bewaart. */
function nepHaal(antwoord) {
  const gezien = [];
  const haal = async (url, opties) => {
    gezien.push({ url, opties });
    if (antwoord instanceof Error) throw antwoord;
    return {
      ok: antwoord.ok !== false,
      status: antwoord.status ?? 200,
      json: async () => antwoord.lijf,
    };
  };
  haal.gezien = gezien;
  return haal;
}

const uitgave = (tag, extra = {}) => ({
  tag_name: tag, html_url: `https://example.invalid/${tag}`, ...extra,
});

console.log('\nVersies vergelijken');
zegtIs('gelijk is gelijk', vergelijk('0.1.0', '0.1.0'), 0);
zegtIs('een hogere patch is nieuwer', vergelijk('0.1.1', '0.1.0'), 1);
zegtIs('en andersom ouder', vergelijk('0.1.0', '0.1.1'), -1);
zegtIs('een hogere minor telt zwaarder dan een patch', vergelijk('0.2.0', '0.1.9'), 1);
zegtIs('en een major zwaarder dan een minor', vergelijk('1.0.0', '0.9.9'), 1);
// Het geval waar tekstvergelijking de mist in gaat: "10" komt vóór "9".
zegtIs('tien is nieuwer dan negen, niet ouder', vergelijk('0.10.0', '0.9.0'), 1);
zegtIs('en honderd nieuwer dan tweeëntwintig', vergelijk('1.100.0', '1.22.0'), 1);
zegtIs('een v ervoor maakt niet uit', vergelijk('v0.2.0', '0.2.0'), 0);
// Semver: een voorproefje is ouder dan de versie zelf.
zegtIs('een beta is ouder dan de echte', vergelijk('0.2.0-beta.1', '0.2.0'), -1);
zegtIs('en de echte nieuwer dan de beta', vergelijk('0.2.0', '0.2.0-beta.1'), 1);
zegtIs('twee betas op volgorde', vergelijk('0.2.0-beta.2', '0.2.0-beta.1'), 1);
zegtIs('rommel telt als nul en niet als nieuwer', vergelijk('kapot', '0.0.1'), -1);

console.log('\nDe juiste uitgave uit de lijst');
// Er staan ook uitgaves van de desktopapp in dezelfde repo. Die tellen niet,
// en dat is geen detail: anders zou een desktopversie 2.0 de browser laten
// denken dat hij ver achterloopt.
const lijst = [
  uitgave('desktop-v9.9.9'),
  uitgave('browser-v0.1.0'),
  uitgave('browser-v0.3.0'),
  uitgave('browser-v0.2.0'),
];
zegtIs('pakt de nieuwste browser-uitgave', nieuwsteUit(lijst).versie, '0.3.0');
zegtIs('en niet die van de desktopapp', nieuwsteUit([uitgave('desktop-v9.9.9')]), null);
zegtIs('een concept telt niet mee',
  nieuwsteUit([uitgave('browser-v0.1.0'), uitgave('browser-v0.9.0', { draft: true })]).versie, '0.1.0');
zegtIs('een voorproefje ook niet',
  nieuwsteUit([uitgave('browser-v0.1.0'), uitgave('browser-v0.9.0', { prerelease: true })]).versie, '0.1.0');
zegtIs('een tag zonder getallen wordt overgeslagen',
  nieuwsteUit([uitgave('browser-vlatest'), uitgave('browser-v0.1.0')]).versie, '0.1.0');
zegtIs('en een lege lijst geeft niets', nieuwsteUit([]), null);
zegtIs('net als iets dat geen lijst is', nieuwsteUit({ tag_name: 'browser-v1.0.0' }), null);

console.log('\nWat er de deur uit gaat');
(async () => {
  const haal = nepHaal({ lijf: [uitgave('browser-v0.2.0')] });
  const uit = await kijk({ huidig: '0.1.0', haal });
  zegtIs('er is er één nieuwer', uit.status, 'nieuw');
  zegtIs('en we weten welke', uit.versie, '0.2.0');
  zegt('met een adres erbij', typeof uit.url === 'string' && uit.url.length > 0);

  const aanvraag = haal.gezien[0];
  zegtIs('naar GitHub en nergens anders', aanvraag.url, BRON);
  zegt('met een useragent waarin de versie staat',
    aanvraag.opties.headers['user-agent'].includes('0.1.0'));
  zegt('en verder geen koppen die iets over jou zeggen',
    Object.keys(aanvraag.opties.headers).sort().join(',') === 'accept,user-agent');
  zegt('het is een GET zonder lijf', !aanvraag.opties.body && !aanvraag.opties.method);

  console.log('\nAls je al bij bent');
  zegtIs('dezelfde versie is niet nieuwer',
    (await kijk({ huidig: '0.2.0', haal: nepHaal({ lijf: [uitgave('browser-v0.2.0')] }) })).status, 'bij');
  // Iemand die een eigen build draait die vóórloopt hoort niet te horen dat
  // hij achterloopt.
  zegtIs('een nieuwere eigen versie ook niet',
    (await kijk({ huidig: '0.9.0', haal: nepHaal({ lijf: [uitgave('browser-v0.2.0')] }) })).status, 'bij');

  console.log('\nAls het misgaat');
  const stukAntwoord = await kijk({ huidig: '0.1.0', haal: nepHaal({ ok: false, status: 403 }) });
  zegtIs('een fout van GitHub is onbekend en niet "bij"', stukAntwoord.status, 'onbekend');
  zegt('en er staat bij wat er misging', String(stukAntwoord.fout).includes('403'));

  const geenNet = await kijk({ huidig: '0.1.0', haal: nepHaal(new Error('getaddrinfo ENOTFOUND')) });
  zegtIs('geen verbinding is ook onbekend', geenNet.status, 'onbekend');

  const rommel = await kijk({
    huidig: '0.1.0',
    haal: async () => ({ ok: true, status: 200, json: async () => { throw new Error('geen json'); } }),
  });
  zegtIs('en iets dat geen JSON is ook', rommel.status, 'onbekend');

  const leeg = await kijk({ huidig: '0.1.0', haal: nepHaal({ lijf: [uitgave('desktop-v1.0.0')] }) });
  zegtIs('een lijst zonder browser-uitgave levert niets op', leeg.status, 'onbekend');

  console.log(`\n${goed} goed, ${stuk.length} stuk`);
  if (stuk.length) { console.log('\nStuk:'); for (const s of stuk) console.log(`  - ${s}`); }
  console.log(stuk.length ? '\nBIJWERKEN: STUK' : '\nBIJWERKEN: GOED');
  process.exit(stuk.length ? 1 : 0);
})();
