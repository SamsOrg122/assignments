/*
 * Herstel over meerdere vensters, en de partitie die meegaat.
 *
 *   node test/vensters.js
 *
 * Geen Electron nodig: dit gaat over een bestand op schijf en over wat er wel
 * en niet uit mag komen. Precies daarom verdient het een reeks — het is het
 * enige stuk van deze browser dat een string van schijf gebruikt om te
 * bepalen welke map met koekjes wordt opengedaan.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const herstel = require('../lib/herstel.js');

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

const map = fs.mkdtempSync(path.join(os.tmpdir(), 'tougather-vensters-'));
const bestand = path.join(map, 'laatste-sessie.json');
herstel.zetPad(map);

const groep = (naam, partitie, tabbladen) => ({
  naam, palet: 'home', beweging: 'rustig', partitie, actief: 0, tabbladen,
});

console.log('\nWat een partitienaam mag zijn');
// Dit is de poortwachter. Alles wat hier doorkomt wordt een map die opengaat.
zegt('persist:ws-1 mag', herstel.geldigePartitie('persist:ws-1'));
zegt('persist:ws-42 ook', herstel.geldigePartitie('persist:ws-42'));
zegt('een privépartitie niet', !herstel.geldigePartitie('prive-3-1700000000'));
zegt('een mcp-partitie niet', !herstel.geldigePartitie('mcp-2-1700000000'));
zegt('een pad erin niet', !herstel.geldigePartitie('persist:ws-../../etc'));
zegt('een lege naam niet', !herstel.geldigePartitie(''));
zegt('nul niet', !herstel.geldigePartitie('persist:ws-0'));
zegt('iets dat geen string is niet', !herstel.geldigePartitie({ toString: () => 'persist:ws-1' }));
zegtIs('het nummer komt eruit', herstel.nummerVan('persist:ws-7'), 7);
zegtIs('en uit iets ongeldigs komt nul', herstel.nummerVan('prive-7-1'), 0);

console.log('\nTwee vensters, twee standen');
herstel.bewaar('venster-a', [groep('Werk', 'persist:ws-1', ['https://a.nl/'])]);
herstel.bewaar('venster-b', [groep('Thuis', 'persist:ws-2', ['https://b.nl/'])]);
herstel.flush();

const opSchijf = JSON.parse(fs.readFileSync(bestand, 'utf8'));
zegtIs('het bestand is versie 2', opSchijf.versie, 2);
zegtIs('met twee vensters erin', opSchijf.vensters.length, 2);
zegtIs('in de volgorde waarin ze zich meldden',
  opSchijf.vensters.map((v) => v.workspaces[0].naam), ['Werk', 'Thuis']);

const terug = herstel.lees();
zegtIs('teruglezen geeft twee vensters', terug.vensters.length, 2);
zegtIs('en de partitie komt mee', terug.vensters[1][0].partitie, 'persist:ws-2');
zegtIs('het hoogste nummer klopt', herstel.hoogsteNummer(terug), 2);

console.log('\nEén venster dicht');
herstel.vergeetVenster('venster-a');
herstel.flush();
zegtIs('dan staat de ander er nog',
  herstel.lees().vensters.map((v) => v[0].naam), ['Thuis']);

console.log('\nEen bestand van de vorige versie');
// Versie 1 was één platte lijst workspaces. Dat was één venster, dus zo hoort
// het terug te komen — een oude vorm is geen reden om met niets te beginnen.
fs.writeFileSync(bestand, JSON.stringify({
  versie: 1,
  workspaces: [groep('Oud', undefined, ['https://oud.nl/'])],
}));
const oud = herstel.lees();
zegtIs('komt terug als één venster', oud.vensters.length, 1);
zegtIs('met de workspace erin', oud.vensters[0][0].naam, 'Oud');
zegtIs('en zonder partitie, dus die wordt nieuw', herstel.hoogsteNummer(oud), 0);

console.log('\nEen bestand dat niet deugt');
for (const [wat, inhoud] of [
  ['stuk json', '{ dit is geen json'],
  ['geen vensters en geen workspaces', '{"versie":2}'],
  ['een lege lijst', '{"versie":2,"vensters":[]}'],
  ['iets dat geen lijst is', '{"versie":2,"vensters":{"a":1}}'],
]) {
  fs.writeFileSync(bestand, inhoud);
  zegt(`${wat} geeft niets terug`, herstel.lees() === null);
}

fs.writeFileSync(bestand, JSON.stringify({
  versie: 2,
  vensters: [{ workspaces: [groep('Goed', 'persist:ws-3', ['https://a.nl/'])] }, { rommel: true }],
}));
const half = herstel.lees();
zegtIs('een venster zonder workspaces valt weg, de rest blijft', half.vensters.length, 1);
zegtIs('en dat is het goede', half.vensters[0][0].naam, 'Goed');

console.log('\nEen bestand met te veel vensters');
fs.writeFileSync(bestand, JSON.stringify({
  versie: 2,
  vensters: Array.from({ length: 40 }, (_v, i) => ({
    workspaces: [groep(`W${i}`, `persist:ws-${i + 1}`, ['https://a.nl/'])],
  })),
}));
zegtIs('er gaan er hoogstens MAX_VENSTERS open',
  herstel.lees().vensters.length, herstel.MAX_VENSTERS);

console.log('\nWissen');
herstel.wis();
zegt('het bestand is weg', !fs.existsSync(bestand));
zegt('en er valt niets te herstellen', herstel.lees() === null);

fs.rmSync(map, { recursive: true, force: true });
console.log(`\n${goed} goed, ${stuk.length} stuk`);
if (stuk.length) { console.log('\nStuk:'); for (const s of stuk) console.log(`  - ${s}`); }
console.log(stuk.length ? '\nVENSTERS: STUK' : '\nVENSTERS: GOED');
process.exit(stuk.length ? 1 : 0);
