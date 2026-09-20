/*
 * De gereedschapskist in de echte browser.
 *
 *   node test/kist-echt.js
 *
 * test/kist.js kijkt of de regels kloppen. Dit kijkt of ze ook staan waar ze
 * moeten staan: in de echte IPC, in de echte stand die naar de zijbalk gaat, en
 * in het echte bestand op schijf.
 *
 * De vraag die dit moet beantwoorden is er één: komt een token dat je hier
 * invult óóit aan de kant van een renderer terecht? Dat is met een nepobject
 * niet te bewijzen — `veilig()` kan honderd keer kloppen terwijl er ergens
 * anders per ongeluk `kist.alles()` in de stand staat. Dus wordt het hier van
 * buitenaf gevraagd, aan het echte scherm.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { even, vrijePoort, wachtOpZijbalken, waarde, startApp, stopApp } = require('./cdp.js');

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
const kop = (wat) => console.log(`\n${wat}`);

// Iets dat niet in een zin thuishoort, zodat een treffer in de hele stand geen
// toeval kan zijn.
const TOKEN = 'zzq-geheim-9f3a1c';

/** De kist zoals de zijbalk hem kent. */
const kistIn = (zijbalk) => waarde(zijbalk, 'JSON.stringify(laatsteStaat.assistent.kist ?? [])')
  .then((t) => JSON.parse(t ?? '[]'));

async function draai() {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'tougather-kist-'));
  const poort = await vrijePoort();
  const kind = startApp(userData, poort);

  try {
    const [zijbalk] = await wachtOpZijbalken(poort, 1);
    if (!zijbalk) throw new Error('geen zijbalk');
    await even(600);

    kop('Toevoegen');
    zegtIs('de kist begint leeg', await kistIn(zijbalk), []);

    const uit = JSON.parse(await waarde(zijbalk, `(async () => JSON.stringify(await browser.kistVoeg({
      naam: 'agenda',
      commando: 'npx -y @x/agenda-mcp',
      omgeving: 'AGENDA_TOKEN=${TOKEN}',
      gereedschap: 'lees maak',
    })))()`) ?? '{}');
    zegtIs('toevoegen geeft geen fout', uit.fout, null);

    await even(300);
    const na = await kistIn(zijbalk);
    zegtIs('er staat er één', na.length, 1);
    zegtIs('met de regel die je intypte', na[0]?.regel, 'npx -y @x/agenda-mcp');
    zegtIs('en de stukken die je noemde', na[0]?.gereedschap, ['lees', 'maak']);
    zegtIs('de naam van de variabele komt mee', na[0]?.omgevingNamen, ['AGENDA_TOKEN']);
    // Toevoegen is beschrijven; het aanzetten is de toestemming.
    zegt('en hij staat uit', na[0]?.aan === false);

    kop('Wat de renderer niet mag weten');
    // Niet alleen de kist: de héle stand, want een geheim lekt nooit op de plek
    // waar je het verwacht.
    const alles = await waarde(zijbalk, 'JSON.stringify(laatsteStaat)');
    zegt('het token staat nergens in de stand', !String(alles ?? '').includes(TOKEN));
    const dom = await waarde(zijbalk, 'document.getElementById("settings-body").textContent');
    zegt('en nergens op het scherm', !String(dom ?? '').includes(TOKEN));

    kop('Aan en uit');
    await waarde(zijbalk, "(async () => { await browser.kistAan('agenda', true); return 1 })()");
    await even(300);
    zegt('aanzetten komt in de stand terug', (await kistIn(zijbalk))[0]?.aan === true);
    await waarde(zijbalk, "(async () => { await browser.kistAan('agenda', false); return 1 })()");
    await even(300);
    zegt('en uitzetten ook', (await kistIn(zijbalk))[0]?.aan === false);

    kop('Wat het scherm ervan maakt');
    await waarde(zijbalk, "(async () => { await browser.kistAan('agenda', true); return 1 })()");
    await even(300);
    const rij = await waarde(zijbalk, 'document.querySelectorAll("#kist-lijst .kistrij").length');
    zegtIs('er staat één rij', rij, 1);
    zegt('en die is te zien als aan',
      await waarde(zijbalk, 'document.querySelector("#kist-lijst .kistrij").classList.contains("aan")') === true);
    const onder = await waarde(zijbalk, 'document.querySelector("#kist-lijst .onder").textContent');
    zegt('met de stukken en de variabele eronder',
      String(onder ?? '').includes('lees') && String(onder ?? '').includes('AGENDA_TOKEN'));
    zegt('de lege-regel verdwijnt',
      await waarde(zijbalk, 'document.getElementById("uitleg-kist-leeg").hidden') === true);

    kop('Wat er niet in mag');
    const fout = async (server) => JSON.parse(await waarde(zijbalk,
      `(async () => JSON.stringify(await browser.kistVoeg(${JSON.stringify(server)})))()`) ?? '{}').fout;
    zegtIs('een naam met een streepje', await fout({ naam: 'mijn-ding', commando: 'npx' }), 'naam');
    zegtIs('onze eigen naam', await fout({ naam: 'tougather', commando: 'npx' }), 'naamGereserveerd');
    zegtIs('dezelfde naam twee keer', await fout({ naam: 'agenda', commando: 'npx' }), 'naamBezet');
    zegtIs('een regel zonder = in de omgeving',
      await fout({ naam: 'b', commando: 'npx', omgeving: 'losse-tekst' }), 'omgeving');
    await even(300);
    zegtIs('en er is niets bij gekomen', (await kistIn(zijbalk)).length, 1);

    kop('Terug na een herstart');
    await stopApp(kind);
    const poort2 = await vrijePoort();
    const kind2 = startApp(userData, poort2);
    try {
      const [weer] = await wachtOpZijbalken(poort2, 1);
      await even(600);
      const terug = await kistIn(weer);
      zegtIs('de server staat er nog', terug.length, 1);
      zegtIs('met dezelfde regel', terug[0]?.regel, 'npx -y @x/agenda-mcp');
      zegt('en dezelfde stand', terug[0]?.aan === true);
      zegtIs('de variabele ook', terug[0]?.omgevingNamen, ['AGENDA_TOKEN']);
      // Op een Linux zonder sleutelbos staat het plat; dan hoort het bestand
      // dat te zeggen in plaats van te doen alsof het versleuteld is.
      const rauw = fs.readFileSync(path.join(userData, 'kist.dat'));
      const plat = rauw.subarray(0, 5).toString('utf8') === 'plat:';
      zegt('en het bestand is versleuteld, of zegt eerlijk dat het dat niet is',
        plat ? rauw.toString('utf8').includes(TOKEN) : !rauw.toString('latin1').includes(TOKEN));

      kop('Weghalen');
      await waarde(weer, "(async () => { await browser.kistWeg('agenda'); return 1 })()");
      await even(300);
      zegtIs('de kist is weer leeg', await kistIn(weer), []);
      zegt('en het bestand is weg', !fs.existsSync(path.join(userData, 'kist.dat')));
    } finally {
      await stopApp(kind2);
    }
  } finally {
    await stopApp(kind);
    fs.rmSync(userData, { recursive: true, force: true });
  }
}

draai().then(() => {
  console.log(`\n${goed} goed, ${stuk.length} stuk`);
  if (stuk.length) {
    for (const s of stuk) console.log(`  · ${s}`);
    console.log('\nKIST-ECHT: STUK');
    process.exit(1);
  }
  console.log('\nKIST-ECHT: GOED');
}).catch((e) => {
  console.log(`\nKIST-ECHT: STUK — ${e.stack}`);
  process.exit(1);
});
