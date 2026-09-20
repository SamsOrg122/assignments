/*
 * De gereedschapskist: wat erin mag, en wat de agent ervan te zien krijgt.
 *
 *   node test/kist.js
 *
 * Geen Electron nodig, en dat is de opzet: de regels in lib/kist.js beslissen
 * wat er op de computer van de gebruiker gestart wordt. Dat hoort na te kijken
 * te zijn zonder een venster te openen.
 *
 * Waar het hier om gaat is niet of de configuratie goed geformatteerd is, maar
 * of de grens staat: een server die uit staat mag niet in de aanroep voorkomen,
 * onze eigen brug mag niet overschreven worden, en een geheim mag niet in wat
 * naar de zijbalk gaat.
 */

const kist = require('../lib/kist.js');
const { houding, HOUDING, HOUDING_GRENS, bouwArgumenten, Opdracht } = require('../lib/agent.js');

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

/** Een server zoals hij in de kist staat. */
const server = (naam, extra = {}) => ({
  naam, commando: 'npx', argumenten: ['-y', `@x/${naam}`], omgeving: {}, gereedschap: [], aan: true, ...extra,
});

/* ── Een commandoregel in stukken ─────────────────────────────────────── */

kop('Een commandoregel in stukken');
zegtIs('gewone woorden', kist.splitsRegel('npx -y @x/server'), ['npx', '-y', '@x/server']);
zegtIs('aanhalingstekens houden een pad heel',
  kist.splitsRegel('node "/home/ik/mijn map/server.js"'),
  ['node', '/home/ik/mijn map/server.js']);
zegtIs('enkele aanhalingstekens ook', kist.splitsRegel("sh 'a b'"), ['sh', 'a b']);
zegtIs('dubbele witruimte levert geen leeg stuk', kist.splitsRegel('  a   b  '), ['a', 'b']);
zegtIs('een leeg aanhalingsteken is een leeg argument', kist.splitsRegel('a ""'), ['a', '']);
// Wat er niet gebeurt is het punt: hier wordt niets uitgevoerd, dus een pijp is
// gewoon een teken. `spawn` start zonder shell.
zegtIs('een pijp is tekst en geen pijp', kist.splitsRegel('a | b'), ['a', '|', 'b']);
zegtIs('en een puntkomma ook', kist.splitsRegel('a; rm -rf /'), ['a;', 'rm', '-rf', '/']);

/* ── De omgeving ──────────────────────────────────────────────────────── */

kop('De omgeving');
zegtIs('een regel per variabele',
  kist.leesOmgeving('TOKEN=abc\nHOST=example.com'),
  { ok: true, omgeving: { TOKEN: 'abc', HOST: 'example.com' } });
zegtIs('een waarde met een = erin blijft heel',
  kist.leesOmgeving('A=b=c').omgeving, { A: 'b=c' });
zegtIs('lege regels en commentaar worden overgeslagen',
  kist.leesOmgeving('\n# iets\nA=1\n').omgeving, { A: '1' });
zegt('een regel zonder = is een vergissing en geen lege waarde',
  kist.leesOmgeving('zomaar-een-token').code === 'omgeving');
zegt('een naam met een streepje mag niet', kist.leesOmgeving('MIJN-TOKEN=1').code === 'omgeving');
zegt('een lege naam mag niet', kist.leesOmgeving('=1').code === 'omgeving');

/* ── De keuring ───────────────────────────────────────────────────────── */

kop('De keuring');
zegt('een gewone server komt erdoor', kist.keurServer({ naam: 'agenda', commando: 'npx -y @x/a' }).ok);
zegt('en staat uit, ook al typte je hem net zelf in',
  kist.keurServer({ naam: 'agenda', commando: 'npx' }).server.aan === false);
zegtIs('het commando wordt gesplitst',
  kist.keurServer({ naam: 'a', commando: 'node server.js --poort 9' }).server,
  { naam: 'a', commando: 'node', argumenten: ['server.js', '--poort', '9'], omgeving: {}, gereedschap: [], aan: false });
zegt('een hoofdletter in de naam wordt kleine letter',
  kist.keurServer({ naam: 'Agenda', commando: 'npx' }).server.naam === 'agenda');
zegt('een naam met een streepje mag niet', kist.keurServer({ naam: 'mijn-agenda', commando: 'npx' }).code === 'naam');
zegt('een naam met een cijfer vooraan mag niet', kist.keurServer({ naam: '1a', commando: 'npx' }).code === 'naam');
// Dubbele lage streep zou de naam en het gereedschap in mcp__x__y door elkaar
// laten lopen: dan is niet meer te zeggen waar de server ophoudt.
zegt('een dubbele lage streep mag niet', kist.keurServer({ naam: 'a__b', commando: 'npx' }).code === 'naam');
zegt('een enkele lage streep wel', kist.keurServer({ naam: 'mijn_repo', commando: 'npx' }).ok);
zegt('onze eigen naam is bezet',
  kist.keurServer({ naam: 'tougather', commando: 'npx' }).code === 'naamGereserveerd');
zegt('een naam die er al staat mag niet twee keer',
  kist.keurServer({ naam: 'agenda', commando: 'npx' }, { bestaand: [server('agenda')] }).code === 'naamBezet');
zegt('zonder commando komt hij er niet in', kist.keurServer({ naam: 'a', commando: '  ' }).code === 'commando');
zegt('een nieuwe regel in het commando mag niet',
  kist.keurServer({ naam: 'a', commando: 'npx', argumenten: ['x\ny'] }).code === 'commando');
zegt('een nieuwe regel in een waarde mag niet',
  kist.keurServer({ naam: 'a', commando: 'npx', omgeving: { T: 'x\ny' } }).code === 'omgeving');
zegt('vol is vol',
  kist.keurServer({ naam: 'zeven', commando: 'npx' }, {
    bestaand: ['a', 'b', 'c', 'd', 'e', 'f'].map((n) => server(n)),
  }).code === 'vol');
zegtIs('een lijst stukken mag als regel worden ingetypt',
  kist.keurServer({ naam: 'a', commando: 'npx', gereedschap: 'lees zoek' }).server.gereedschap,
  ['lees', 'zoek']);
zegt('een stuk met een punt erin mag niet',
  kist.keurServer({ naam: 'a', commando: 'npx', gereedschap: 'lees.alles' }).code === 'gereedschap');

/* ── Opschonen ────────────────────────────────────────────────────────── */

kop('Opschonen');
zegtIs('een half geldige server wordt niet gerepareerd maar weggelaten',
  kist.schoon([server('goed'), { naam: 'FOUT-NAAM', commando: 'npx' }]).map((s) => s.naam),
  ['goed']);
zegt('en de stand blijft staan zoals hij was',
  kist.schoon([server('a', { aan: true })])[0].aan === true);
zegt('een tweede met dezelfde naam valt weg',
  kist.schoon([server('a'), server('a')]).length === 1);
zegtIs('geen lijst geeft een lege kist', kist.schoon(null), []);

/* ── De aanroep ───────────────────────────────────────────────────────── */

kop('De aanroep');
const drie = [server('agenda'), server('notities', { aan: false }), server('repo', { gereedschap: ['lees'] })];
const config = JSON.parse(kist.bouwConfig({ elektron: '/e', brug: '/b', kist: drie }));

zegt('onze brug staat er altijd in', Boolean(config.mcpServers.tougather));
zegtIs('en wijst naar Electron als node',
  config.mcpServers.tougather, { command: '/e', args: ['/b'], env: { ELECTRON_RUN_AS_NODE: '1' } });
zegt('wat aan staat komt erin', Boolean(config.mcpServers.agenda));
// Het verschil tussen "erin en geweigerd" en "er niet in" is het verschil tussen
// een agent die blijft hangen en een agent die het gereedschap niet heeft.
zegt('wat uit staat bestaat niet voor de agent', !('notities' in config.mcpServers));
zegtIs('zonder omgeving komt er geen leeg env-blok mee',
  Object.keys(config.mcpServers.agenda), ['command', 'args']);
zegtIs('met omgeving wel',
  JSON.parse(kist.bouwConfig({
    elektron: '/e', brug: '/b', kist: [server('a', { omgeving: { T: '1' } })],
  })).mcpServers.a.env, { T: '1' });
zegt('een server die onze naam draagt overschrijft de brug niet',
  JSON.parse(kist.bouwConfig({
    elektron: '/e', brug: '/b', kist: [server('tougather', { commando: 'kwaad' })],
  })).mcpServers.tougather.command === '/e');

const toestaan = kist.bouwToestaan({ gereedschap: ['open_pagina', 'klik'], kist: drie });
zegt('ons eigen gereedschap staat er volledig in',
  toestaan.includes('mcp__tougather__open_pagina') && toestaan.includes('mcp__tougather__klik'));
zegt('een server zonder opsomming mag alles van zichzelf', toestaan.includes('mcp__agenda'));
zegt('een server met een opsomming precies die', toestaan.includes('mcp__repo__lees'));
zegt('en dan niet ook alles', !toestaan.includes('mcp__repo'));
zegt('wat uit staat staat er niet in', !toestaan.some((x) => x.startsWith('mcp__notities')));
zegtIs('een lege kist verandert niets',
  kist.bouwToestaan({ gereedschap: ['klik'] }), ['mcp__tougather__klik']);

/* ── Wat het scherm laat zien ─────────────────────────────────────────── */

kop('Wat het scherm laat zien');
const veilig = kist.veilig([server('agenda', { omgeving: { TOKEN: 'geheim-abc' }, gereedschap: ['lees'] })]);
zegtIs('de regel is weer één regel', veilig[0].regel, 'npx -y @x/agenda');
zegtIs('de namen van de variabelen komen mee', veilig[0].omgevingNamen, ['TOKEN']);
// Dit is de reden dat `veilig` bestaat. De hele stand gaat naar een renderer.
zegt('de waarde niet', !JSON.stringify(veilig).includes('geheim-abc'));

zegtIs('ons eigen gereedschap heet gewoon zoals het heet',
  kist.toonNaam('mcp__tougather__lees_pagina'), 'lees_pagina');
zegtIs('dat van een ander krijgt zijn server ervoor',
  kist.toonNaam('mcp__agenda__maak_afspraak'), 'agenda · maak_afspraak');
zegtIs('ook met een lage streep in de servernaam',
  kist.toonNaam('mcp__mijn_repo__lees'), 'mijn_repo · lees');
zegtIs('en iets wat er niet op lijkt blijft staan', kist.toonNaam('Bash'), 'Bash');

/* ── Wat de agent te horen krijgt ─────────────────────────────────────── */

kop('Wat de agent te horen krijgt');
zegt('een lege kist laat de houding ongemoeid', houding([]) === HOUDING);
zegt('de grenszin staat er dan in', HOUDING.includes(HOUDING_GRENS));
const met = houding(drie);
// "Er is geen shell en geen bestandssysteem" is niet waar meer zodra er een
// server bij staat die dat wél kan. Een systeemzin die niet klopt is erger dan
// geen systeemzin.
zegt('en verdwijnt zodra er iets aan staat', !met.includes(HOUDING_GRENS));
zegt('de namen van wat aan staat komen erin', met.includes('agenda') && met.includes('repo'));
zegt('en wat uit staat niet', !met.includes('notities'));
zegt('er staat bij dat het buiten de browser iets kan veranderen',
  met.toLowerCase().includes('buiten de browser'));

/* ── En de gids niet ──────────────────────────────────────────────────── */

kop('En de gids niet');
// Een gids met een shell is geen gids. Een gidsronde krijgt geen kist mee, en
// dan hoort er in de aanroep niets van te zien te zijn.
const gids = bouwArgumenten({
  opdracht: 'waar staat dat',
  brugConfig: kist.bouwConfig({ elektron: '/e', brug: '/b' }),
  gereedschap: ['wijs_aan'],
  toestaan: kist.bouwToestaan({ gereedschap: ['wijs_aan'] }),
});
zegt('zonder kist komt er geen vreemde server in de aanroep',
  !gids.join(' ').includes('agenda'));
zegtIs('en het toegestane gereedschap is precies onze eigen lijst',
  gids.filter((a) => a.startsWith('mcp__')), ['mcp__tougather__wijs_aan']);

/* ── Wat er echt gestart wordt ────────────────────────────────────────── */

kop('Wat er echt gestart wordt');

/**
 * Een spawn die niets start en alleen opschrijft waarmee hij geroepen werd.
 *
 * Hier gaat het om: bouwArgumenten los nakijken zegt nog niet dat Opdracht hem
 * ook zo aanroept. Dat is precies de naad waar een kist stil kan verdwijnen.
 */
function nepSpawn() {
  const gezien = [];
  const maak = (pad, argumenten) => {
    gezien.push({ pad, argumenten });
    const stroom = { setEncoding() {}, on() {} };
    return { stdout: stroom, stderr: stroom, on() {}, pid: 1, kill() {} };
  };
  maak.gezien = gezien;
  return maak;
}

const maak = nepSpawn();
new Opdracht({
  agent: { pad: '/bin/agent' },
  elektron: '/e',
  brug: '/b',
  gereedschap: ['open_pagina'],
  houding: houding(drie),
  kist: drie,
  opMelding() {},
  maak,
}).start('zet dit in mijn agenda');

const argv = maak.gezien[0].argumenten;
const mcpConfig = JSON.parse(argv[argv.indexOf('--mcp-config') + 1]);
zegt('de kist komt in de echte aanroep terecht', Boolean(mcpConfig.mcpServers.agenda));
zegt('en onze brug staat er nog steeds in', Boolean(mcpConfig.mcpServers.tougather));
zegt('wat uit staat komt er ook hier niet in', !('notities' in mcpConfig.mcpServers));
zegt('het toegestane gereedschap bevat de vreemde server',
  argv.includes('mcp__agenda') && argv.includes('mcp__repo__lees'));
zegt('en ons eigen gereedschap', argv.includes('mcp__tougather__open_pagina'));
// Dit blijft staan, kist of niet: zijn eigen shell en bestandssysteem gaan uit,
// en zijn eigen MCP-configuratie wordt niet gelezen.
zegtIs('zijn eigen gereedschap staat nog steeds uit',
  argv[argv.indexOf('--tools') + 1], '');
zegt('en zijn eigen MCP-configuratie blijft buiten beeld',
  argv.includes('--strict-mcp-config'));

const leeg = nepSpawn();
new Opdracht({
  agent: { pad: '/bin/agent' },
  elektron: '/e',
  brug: '/b',
  gereedschap: ['open_pagina'],
  opMelding() {},
  maak: leeg,
}).start('kijk eens');
const leegArgv = leeg.gezien[0].argumenten;
zegtIs('zonder kist is de configuratie alleen onze brug',
  Object.keys(JSON.parse(leegArgv[leegArgv.indexOf('--mcp-config') + 1]).mcpServers),
  ['tougather']);
zegtIs('en de houding de gewone', leegArgv[leegArgv.indexOf('--append-system-prompt') + 1], HOUDING);

/* ── Uitslag ──────────────────────────────────────────────────────────── */

console.log(`\n${goed} goed, ${stuk.length} stuk`);
if (stuk.length) {
  for (const s of stuk) console.log(`  · ${s}`);
  console.log('\nKIST: STUK');
  process.exit(1);
}
console.log('\nKIST: GOED');
