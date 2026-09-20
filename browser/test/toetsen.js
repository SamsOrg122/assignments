/*
 * De sneltoetsen: wat ze doen, en wat het scherm erover zegt.
 *
 *   node test/toetsen.js
 *
 * Geen Electron nodig — `lib/sneltoetsen.js` kent het venster niet, en dat is
 * precies waarom deze reeks bestaat. De vraag is niet of Chromium een toets
 * doorgeeft maar of de lijst die de instellingen tonen dezelfde lijst is die
 * de toetsen afhandelt. Twee lijsten die elkaar moeten raden lopen een keer
 * uit elkaar, en dan staat er een sneltoets in beeld die niets meer doet.
 */

const {
  SNELTOETSEN, toetsNaam, sneltoetsLijst, bindSneltoetsen,
} = require('../lib/sneltoetsen.js');

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

/** Een nep-webContents die één luisteraar onthoudt. */
function nepWc() {
  const wc = {
    luisteraar: null,
    devtools: 0,
    on(naam, fn) { if (naam === 'before-input-event') wc.luisteraar = fn; },
    toggleDevTools() { wc.devtools += 1; },
  };
  return wc;
}

/** Een nep-venster dat opschrijft wat er van hem gevraagd werd. */
function nepCtrl() {
  const gedaan = [];
  const noteer = (wat) => (...args) => gedaan.push(args.length ? [wat, ...args] : wat);
  return {
    gedaan,
    gewezenTab: null,
    activeId: 7,
    workspaces: new Map([[1, { id: 1 }], [2, { id: 2 }]]),
    createTab: noteer('nieuw tabblad'),
    closeTab: noteer('tabblad dicht'),
    heropenTab: noteer('tabblad terug'),
    vraagZijbalk: noteer('zijbalk'),
    focusIsland: noteer('balk'),
    wisselWerkbank: noteer('werkbank'),
    reload: noteer('herladen'),
    zoom: noteer('zoom'),
    activateWorkspace: noteer('workspace'),
    wijsNietMeer: noteer('aanwijzing weg'),
  };
}

/** Eén toetsaanslag, zoals Chromium hem aanlevert. */
function druk(wc, { key, control = true, shift = false, meta = false }) {
  let tegengehouden = false;
  wc.luisteraar({ preventDefault: () => { tegengehouden = true; } },
    { type: 'keyDown', key, control, shift, meta });
  return tegengehouden;
}

console.log('\nDe lijst zelf');
const paren = SNELTOETSEN.map((r) => `${r.shift ? 'shift+' : ''}${r.toets}`);
zegtIs('geen enkele toets zit er twee keer in', paren.length, new Set(paren).size);
zegt('elke regel doet iets', SNELTOETSEN.every((r) => typeof r.doe === 'function'));
zegt('en alles wat op het scherm komt heeft een omschrijving',
  SNELTOETSEN.filter((r) => !r.stil).every((r) => typeof r.wat === 'string' && r.wat.length > 2));

console.log('\nHoe ze heten');
zegtIs('op Windows en Linux is het Ctrl', toetsNaam({ toets: 't' }, false), 'Ctrl T');
zegtIs('met shift erbij', toetsNaam({ toets: 'g', shift: true }, false), 'Ctrl ⇧ G');
zegtIs('op een Mac is het de commandotoets', toetsNaam({ toets: 't' }, true), '⌘ T');
zegtIs('en = heet gewoon +', toetsNaam({ toets: '=' }, false), 'Ctrl +');

console.log('\nWat het scherm toont');
const lijst = sneltoetsLijst(false);
zegt('elke regel heeft een toets en een uitleg',
  lijst.every((r) => r.toets && r.wat));
zegt('de variant die hetzelfde doet staat er niet dubbel in',
  lijst.filter((r) => r.toets === 'Ctrl +').length === 1);
zegt('Ctrl 1–9 staat erbij, want dat is geen enkele toets',
  lijst.some((r) => r.toets === 'Ctrl 1–9'));
zegt('en Esc ook, want die hangt aan een voorwaarde',
  lijst.some((r) => r.toets === 'Esc'));

// De kern: niets wordt getoond dat niet ook gebonden is.
const gebonden = new Set(SNELTOETSEN.filter((r) => !r.stil).map((r) => toetsNaam(r, false)));
const buiten = lijst.map((r) => r.toets).filter((t) => !gebonden.has(t));
zegtIs('alles wat getoond wordt is ook gebonden, op de drie losse na',
  buiten, ['Ctrl 1–9', 'F12', 'Esc']);

console.log('\nEn wat ze doen');
const wc = nepWc();
const ctrl = nepCtrl();
bindSneltoetsen(wc, ctrl, {
  nieuwVenster: () => ctrl.gedaan.push('nieuw venster'),
  heropenVenster: () => ctrl.gedaan.push('venster terug'),
});

zegt('Ctrl T wordt afgevangen', druk(wc, { key: 't' }) === true);
zegtIs('en opent een tabblad', ctrl.gedaan.pop(), 'nieuw tabblad');

druk(wc, { key: 'T', shift: true });
zegtIs('Ctrl ⇧ T haalt er een terug en niet een nieuwe', ctrl.gedaan.pop(), 'tabblad terug');

druk(wc, { key: 'n' });
zegtIs('Ctrl N opent een venster', ctrl.gedaan.pop(), 'nieuw venster');
druk(wc, { key: 'N', shift: true });
zegtIs('en Ctrl ⇧ N haalt er een terug', ctrl.gedaan.pop(), 'venster terug');

druk(wc, { key: 'f' });
zegtIs('Ctrl F opent het zoekveld', ctrl.gedaan.pop(), ['zijbalk', 'zoek']);

druk(wc, { key: 'j' });
zegtIs('Ctrl J is de balk', ctrl.gedaan.pop(), 'balk');
druk(wc, { key: 'j', shift: true });
zegtIs('en Ctrl ⇧ J de downloads', ctrl.gedaan.pop(), ['zijbalk', 'downloads']);

druk(wc, { key: 'g', shift: true });
zegtIs('Ctrl ⇧ G vraagt iets over deze pagina', ctrl.gedaan.pop(), ['balk', 'gids']);

druk(wc, { key: '3' });
zegtIs('Ctrl 3 bestaat niet als er maar twee workspaces zijn', ctrl.gedaan.length, 0);
druk(wc, { key: '2' });
zegtIs('Ctrl 2 springt naar de tweede', ctrl.gedaan.pop(), ['workspace', 2]);

console.log('\nWat er niet mag gebeuren');
zegt('zonder Ctrl doet een letter niets',
  druk(wc, { key: 't', control: false }) === false && ctrl.gedaan.length === 0);
zegt('een toets loslaten telt niet', (() => {
  wc.luisteraar({ preventDefault: () => {} }, { type: 'keyUp', key: 't', control: true });
  return ctrl.gedaan.length === 0;
})());
zegt('Escape doet niets zolang er niets wordt aangewezen',
  druk(wc, { key: 'Escape', control: false }) === false && ctrl.gedaan.length === 0);

ctrl.gewezenTab = 4;
zegt('en haalt de aanwijzing weg zodra er wel iets staat',
  druk(wc, { key: 'Escape', control: false }) === true && ctrl.gedaan.pop() === 'aanwijzing weg');

zegt('F12 opent de devtools ook zonder Ctrl',
  druk(wc, { key: 'F12', control: false }) === true && wc.devtools === 1);

// Een venster dat er niet is mag geen uitzondering opleveren; dat gebeurt bij
// het afbreken van een venster terwijl er nog een toets onderweg is.
const losseWc = nepWc();
bindSneltoetsen(losseWc, null, {});
zegt('zonder venster loopt er niets stuk',
  druk(losseWc, { key: 't' }) === false);

console.log(`\n${goed} goed, ${stuk.length} stuk`);
if (stuk.length) { console.log('\nStuk:'); for (const s of stuk) console.log(`  - ${s}`); }
console.log(stuk.length ? '\nTOETSEN: STUK' : '\nTOETSEN: GOED');
process.exit(stuk.length ? 1 : 0);
