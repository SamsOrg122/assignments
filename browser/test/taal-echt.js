/*
 * De taal wisselen in de echte browser.
 *
 *   node test/taal-echt.js
 *
 * test/taal.js kijkt of de woordenlijst klopt. Dit kijkt of het woord ook
 * echt op het scherm komt — in de zijbalk, in de balk bovenin en op het
 * nieuwe tabblad, want dat zijn drie renderers die de taal elk langs een
 * andere weg te horen krijgen. Juist daar gaat zoiets stuk: twee van de drie
 * wisselen mee en de derde blijft staan, en dat zie je pas als je ernaar
 * zoekt.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { even, vrijePoort, wachtOp, wachtOpZijbalken, waarde, startApp, stopApp } = require('./cdp.js');

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
 * De tekst van het element dat bij deze sleutel hoort.
 *
 * De selector wordt aan de andere kant samengesteld met JSON.stringify, want
 * een sleutel heeft een punt erin en die mag in een CSS-attribuutselector niet
 * los staan — en aanhalingstekens door drie lagen quoting heen duwen is hoe je
 * een reeks krijgt die nergens meer over gaat.
 */
const tekstVan = (doel, sleutel) => waarde(doel,
  `document.querySelector('[data-t=' + JSON.stringify(${JSON.stringify(sleutel)}) + ']').textContent`);

/**
 * Het nieuwe tabblad dat er net bij kwam, zodra zijn script gedraaid heeft.
 *
 * Wachten tot de target bestaat is niet genoeg: dan staat de pagina er wel
 * maar heeft newtab.js nog niets gedaan, en dan meet je een leeg element.
 * De groet is het eerste dat dat script schrijft, dus daar wachten we op.
 */
async function verstTabblad(poort, alBekend, msMax = 8000) {
  const eind = Date.now() + msMax;
  for (;;) {
    const verse = (await wachtOp(poort, NIEUWTAB, alBekend.length + 1, 2000))
      .find((d) => !alBekend.includes(d.id));
    if (verse && await waarde(verse, "document.getElementById('groet').textContent !== ''")) {
      return verse;
    }
    if (Date.now() > eind) return verse ?? null;
    await even(150);
  }
}

const NIEUWTAB = 'renderer/newtab.html';
const BALK = 'renderer/island.html';

(async () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'tougather-taal-'));
  const poort = await vrijePoort();
  let kind = null;

  try {
    console.log('\nStarten');
    kind = startApp(userData, poort);
    const [zij] = await wachtOpZijbalken(poort, 1);
    zegt('de zijbalk staat er', Boolean(zij));
    if (!zij) throw new Error('de app kwam niet op');

    // Zonder voorkeurenbestand staat de taal op 'systeem', en wat daar
    // uitkomt hangt van de machine af. Dus eerst expliciet zetten — en het
    // tabblad dat al openstond telt daarna niet meer mee, want dat kreeg zijn
    // taal in het adres toen die nog iets anders was.
    await waarde(zij, "browser.zetVoorkeur('taal', 'nl')");
    await even(500);

    console.log('\nNederlands');
    zegtIs('het document staat op nl',
      await waarde(zij, 'document.documentElement.lang'), 'nl');
    zegtIs('de kop boven de tabbladen',
      await tekstVan(zij, 'zij.tabbladen'),
      'Tabbladen');
    zegtIs('en de knop eronder',
      await tekstVan(zij, 'zij.nieuwTabblad'),
      'Nieuw tabblad');

    const [balk] = await wachtOp(poort, BALK, 1);
    zegt('de balk bovenin staat er ook', Boolean(balk));
    zegtIs('en die staat ook op nl',
      await waarde(balk, 'document.documentElement.lang'), 'nl');

    // Een nieuw tabblad krijgt de taal in zijn adres mee.
    const voor = (await wachtOp(poort, NIEUWTAB, 1)).map((d) => d.id);
    await waarde(zij, 'browser.newTab()');
    const nlTab = await verstTabblad(poort, voor);
    zegt('een nieuw tabblad komt op', Boolean(nlTab));
    zegtIs('en staat in het Nederlands',
      await waarde(nlTab, 'document.documentElement.lang'), 'nl');
    zegtIs('met een Nederlandse groet',
      await waarde(nlTab, "['Nog wakker?','Goedemorgen','Goedemiddag','Goedenavond']"
        + ".includes(document.getElementById('groet').textContent)"), true);

    console.log('\nOmzetten naar Engels');
    await waarde(zij, "browser.zetVoorkeur('taal', 'en')");
    await even(800);

    zegtIs('de zijbalk staat op en',
      await waarde(zij, 'document.documentElement.lang'), 'en');
    zegtIs('de kop is vertaald',
      await tekstVan(zij, 'zij.tabbladen'),
      'Tabs');
    zegtIs('de knop ook',
      await tekstVan(zij, 'zij.nieuwTabblad'),
      'New tab');
    zegtIs('en het adresveld, dat geen vaste tekst is maar uit de stand komt',
      await waarde(zij, "document.getElementById('url').title"),
      'Search or enter an address');

    zegtIs('de balk bovenin gaat mee',
      await waarde(balk, 'document.documentElement.lang'), 'en');

    // Het tabblad dat al openstond blijft in zijn eigen taal: die pagina heeft
    // geen enkele deur naar de browser. Dat is een keuze en geen fout, dus hij
    // staat hier vast — en een níéuw tabblad hoort wél Engels te zijn.
    zegtIs('een tabblad dat al openstond blijft staan waar het stond',
      await waarde(nlTab, 'document.documentElement.lang'), 'nl');

    const voor2 = (await wachtOp(poort, NIEUWTAB, 1)).map((d) => d.id);
    await waarde(zij, 'browser.newTab()');
    const enTab = await verstTabblad(poort, voor2);
    zegt('en er komt weer een nieuw tabblad', Boolean(enTab));
    zegtIs('dat in het Engels staat',
      await waarde(enTab, 'document.documentElement.lang'), 'en');
    zegtIs('met een Engelse groet',
      await waarde(enTab, "['Still up?','Good morning','Good afternoon','Good evening']"
        + ".includes(document.getElementById('groet').textContent)"), true);

    console.log('\nEn na een herstart');
    await stopApp(kind);
    kind = startApp(userData, poort);
    const [opnieuw] = await wachtOpZijbalken(poort, 1);
    zegt('de browser komt weer op', Boolean(opnieuw));
    zegtIs('nog steeds in het Engels',
      await waarde(opnieuw, 'document.documentElement.lang'), 'en');
  } catch (e) {
    zegt(`de reeks liep vast: ${e.message}`, false);
  } finally {
    await stopApp(kind);
    fs.rmSync(userData, { recursive: true, force: true });
  }

  console.log(`\n${goed} goed, ${stuk.length} stuk`);
  if (stuk.length) { console.log('\nStuk:'); for (const s of stuk) console.log(`  - ${s}`); }
  console.log(stuk.length ? '\nTAAL-ECHT: STUK' : '\nTAAL-ECHT: GOED');
  process.exit(stuk.length ? 1 : 0);
})();
