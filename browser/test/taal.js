/*
 * De woorden, in twee talen.
 *
 *   node test/taal.js
 *
 * De belangrijkste regel hier is de saaiste: elke sleutel die in de ene taal
 * staat, staat ook in de andere. Een half vertaalde knop valt niet op — je
 * ziet hem pas als je hem nodig hebt, en dan staat er iets in de verkeerde
 * taal of, erger, de sleutel zelf. Dit is precies het soort fout dat een
 * reeks moet vangen omdat een mens het niet doet.
 */

const { WOORDEN, TALEN, t, zetTaal, kiesTaal, pasTaalToe, taalNu } = require('../renderer/taal.js');

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

console.log('\nAlles in beide talen');
for (const a of TALEN) {
  for (const b of TALEN) {
    if (a === b) continue;
    const mist = Object.keys(WOORDEN[a]).filter((k) => !(k in WOORDEN[b]));
    zegtIs(`alles uit ${a} staat ook in ${b}`, mist, []);
  }
}
zegt('en er staat ook echt wat in', Object.keys(WOORDEN.nl).length > 100);

console.log('\nDe gaten in een zin');
// Een zin met een getal of een naam erin heeft in beide talen dezelfde gaten.
// Staat er in het Engels {name} waar het Nederlands {naam} zegt, dan valt er
// straks een lege plek in de zin en merkt niemand het.
const gatenVan = (zin) => [...String(zin).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
const scheef = [];
for (const sleutel of Object.keys(WOORDEN.nl)) {
  for (const taal of TALEN) {
    const hier = gatenVan(WOORDEN[taal][sleutel]);
    const daar = gatenVan(WOORDEN.nl[sleutel]);
    if (JSON.stringify(hier) !== JSON.stringify(daar)) scheef.push(`${sleutel} (${taal})`);
  }
}
zegtIs('elke zin heeft in beide talen dezelfde gaten', scheef, []);

console.log('\nEen zin opvragen');
zetTaal('nl');
zegtIs('de taal staat op nl', taalNu(), 'nl');
zegtIs('een gewone zin', t('zij.nieuwTabblad'), 'Nieuw tabblad');
zetTaal('en');
zegtIs('en in het Engels', t('zij.nieuwTabblad'), 'New tab');
zegtIs('een gat wordt gevuld', t('ws.tabbladen', { aantal: 3 }), '3 tabs');
zegtIs('een gat zonder waarde blijft staan en verdwijnt niet',
  t('ws.tabbladen', { iets: 3 }), '{aantal} tabs');
zegtIs('zonder waarden komt de zin ongemoeid terug',
  t('ws.tabbladen'), '{aantal} tabs');

console.log('\nWat er gebeurt als er iets ontbreekt');
// Een sleutel die niet bestaat geeft de sleutel terug en niet een lege
// string: een knop zonder tekst valt niet op, een knop met "inst.bewaren"
// erop wel. Dat is met opzet lelijk.
zegtIs('een onbekende sleutel geeft zichzelf terug', t('bestaat.niet'), 'bestaat.niet');

console.log('\nWelke taal bij welk systeem');
zegtIs('nl-NL wordt nl', kiesTaal('nl-NL'), 'nl');
zegtIs('nl wordt nl', kiesTaal('nl'), 'nl');
zegtIs('en-GB wordt en', kiesTaal('en-GB'), 'en');
zegtIs('iets wat we niet spreken wordt Engels', kiesTaal('fr-FR'), 'en');
zegtIs('en niets ook', kiesTaal(''), 'en');
zegtIs('zetTaal neemt een systeemtaal ook aan', (zetTaal('nl-NL'), taalNu()), 'nl');

console.log('\nDe vaste tekst in het scherm');
// Een nagebouwd document, en dat mag hier: dit test onze eigen lus over vier
// lijstjes, niet hoe een browser een DOM opbouwt. Wat er wél echt getest
// hoort te worden — of de opmaak klopt — is iets voor een schermafdruk.
function nepEl(data) {
  return { dataset: data, textContent: '', title: '', placeholder: '', attrs: {},
    setAttribute(n, v) { this.attrs[n] = v; } };
}
const knop = nepEl({ t: 'zij.nieuwTabblad' });
const titel = nepEl({ tTitel: 'zij.terug' });
const aria = nepEl({ tAria: 'zij.sluiten' });
const veld = nepEl({ tPlek: 'cmd.plek' });
const nepDoc = {
  querySelectorAll(kies) {
    if (kies === '[data-t]') return [knop];
    if (kies === '[data-t-titel]') return [titel];
    if (kies === '[data-t-aria]') return [aria];
    if (kies === '[data-t-plek]') return [veld];
    return [];
  },
};

zetTaal('nl');
pasTaalToe(nepDoc);
zegtIs('tekst wordt ingevuld', knop.textContent, 'Nieuw tabblad');
zegtIs('een titel ook', titel.title, 'Terug');
zegtIs('een aria-label ook', aria.attrs['aria-label'], 'Sluiten');
zegtIs('en een placeholder ook', veld.placeholder, 'Ga naar, zoek, of spring naar een tabblad');

zetTaal('en');
pasTaalToe(nepDoc);
zegtIs('en na een wissel staat er iets anders', knop.textContent, 'New tab');
zegtIs('ook in de titel', titel.title, 'Back');

console.log('\nWat niet vertaald hoort te worden');
// Eigennamen en toetsen blijven staan. Een sleutel die "Tougather" of "Ctrl"
// in de ene taal anders spelt dan in de andere is bijna zeker een vergissing.
for (const sleutel of Object.keys(WOORDEN.nl)) {
  const nl = WOORDEN.nl[sleutel];
  const en = WOORDEN.en[sleutel];
  if (nl.includes('Tougather') !== en.includes('Tougather')) {
    stuk.push(`Tougather raakt zoek in ${sleutel}`);
  }
}
zegt('Tougather heet in beide talen Tougather',
  !stuk.some((s) => s.startsWith('Tougather raakt zoek')));

console.log(`\n${goed} goed, ${stuk.length} stuk`);
if (stuk.length) { console.log('\nStuk:'); for (const s of stuk) console.log(`  - ${s}`); }
console.log(stuk.length ? '\nTAAL: STUK' : '\nTAAL: GOED');
process.exit(stuk.length ? 1 : 0);
