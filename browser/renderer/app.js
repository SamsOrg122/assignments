const mesh = document.getElementById('mesh');
const tablist = document.getElementById('tablist');
const urlKnop = document.getElementById('url');
const urlTekst = urlKnop.querySelector('.dom');
const backBtn = document.getElementById('back');
const forwardBtn = document.getElementById('forward');
const workspaceList = document.getElementById('workspace-list');
const werkbankKnop = document.getElementById('werkbank');
const appPlekken = document.getElementById('app-plekken');
const favs = document.getElementById('favs');
const tabcount = document.getElementById('tabcount');
const sidebar = document.getElementById('sidebar');
const showSidebar = document.getElementById('show-sidebar');

const palette = document.getElementById('palette');
const paletteInput = document.getElementById('palette-input');
const paletteResults = document.getElementById('palette-results');
const settings = document.getElementById('settings');

const favicons = new Map();

// De renderer houdt geen tabbladstate bij; dit is de laatst ontvangen stand.
let laatsteStaat = {
  tabs: [], activeId: null, workspaces: [], activeWorkspaceId: null,
  werkbankOpen: false, werkbankPad: null, werkbankPlekken: [],
  paneel: null, paneelHoogte: 0, balkApps: [], geluid: [],
  mcp: { aan: false, log: [] }, toestemming: { open: null }, sessies: [],
  paletten: [], bewegingen: [],
};
let prefs = {};

/*
 * De taal meteen invullen, met die van het systeem.
 *
 * Niet pas als de voorkeuren binnen zijn: elk stuk vaste tekst dat alleen een
 * `data-t` heeft en geen woorden ertussen zou tot dat moment leeg staan — en
 * als dat ophalen ooit mislukt, blijft het leeg. Zodra de voorkeuren er zijn
 * wordt het alsnog de taal die jij koos; dat is één regel later.
 */
zetTaal(navigator.language);

// --- mesh --------------------------------------------------------------

// Tien vlekken, elk met eigen plaats, maat en tempo in style.css. Hun kleur komt
// uit het palet van de actieve workspace, dat als data-palet op de body staat.
for (let n = 1; n <= 10; n++) {
  const blob = document.createElement('div');
  blob.className = `blob b${n}`;
  mesh.append(blob);
}

// --- icoontjes ---------------------------------------------------------

function icoon(d) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('aria-hidden', 'true');
  const pad = document.createElementNS(ns, 'path');
  pad.setAttribute('d', d);
  svg.append(pad);
  return svg;
}

const KRUISJE = 'M4.5 4.5 11.5 11.5M11.5 4.5 4.5 11.5';
const CHEVRON = 'M4.5 9.5 8 6l3.5 3.5';
// Twee vlakken naast elkaar.
const SPLITS = 'M2.8 3.4h10.4v9.2H2.8zM8 3.4v9.2';
const SLOTJE = 'M4.6 7.2V5.4a3.4 3.4 0 0 1 6.8 0v1.8M3.4 7.2h9.2v6H3.4z';

// De plekken van de app. De namen komen uit het hoofdproces, de tekeningen
// hier: het hoofdproces hoort niet over vormen te gaan.
const PLEK_ICONEN = {
  persoon: 'M8 8.4a2.6 2.6 0 1 0 0-5.2 2.6 2.6 0 0 0 0 5.2M3.1 13.2c.6-2.1 2.5-3.4 4.9-3.4s4.3 1.3 4.9 3.4',
  huis: 'M2.6 7.4 8 3l5.4 4.4V13H2.6zM6.4 13V9.4h3.2V13',
  agenda: 'M3 4.4h10v8.2H3zM3 7h10M5.6 2.8v2.4M10.4 2.8v2.4',
  mensen: 'M2.8 13v-1.2a2.6 2.6 0 0 1 2.6-2.6h1.6a2.6 2.6 0 0 1 2.6 2.6V13M6.2 3a2.2 2.2 0 1 0 0 4.4 2.2 2.2 0 0 0 0-4.4M10.8 9.4h.4a2.4 2.4 0 0 1 2.4 2.4V13',
  groep: 'M8 3.2a2 2 0 1 0 0 4 2 2 0 0 0 0-4M3.4 13v-.9A2.4 2.4 0 0 1 5.8 9.7h4.4a2.4 2.4 0 0 1 2.4 2.4v.9',
  lijst: 'M5.6 4.4h7.8M5.6 8h7.8M5.6 11.6h7.8M2.8 4.4h.01M2.8 8h.01M2.8 11.6h.01',
  tandwiel: 'M8 5.8a2.2 2.2 0 1 0 0 4.4 2.2 2.2 0 0 0 0-4.4M8 2.6v1.4M8 12v1.4M2.6 8h1.4M12 8h1.4M4.2 4.2l1 1M10.8 10.8l1 1M11.8 4.2l-1 1M5.2 10.8l-1 1',
};
const POTLOOD = 'M10.6 3.4 12.6 5.4 5.5 12.5 3 13l.5-2.5zM9.2 4.8l2 2';

function host(url) {
  try {
    return new URL(url).host.replace(/^www\./, '');
  } catch {
    return url;
  }
}

// --- vensterknoppen en zijbalk -----------------------------------------

// De werkbank. Aan en uit met dezelfde knop, en met Ctrl+Shift+O.
werkbankKnop.onclick = () => browser.wisselWerkbank();

document.getElementById('win-close').onclick = () => browser.close();
document.getElementById('win-min').onclick = () => browser.minimize();
document.getElementById('win-max').onclick = () => browser.maximize();

function zetZijbalk(weg) {
  document.body.classList.toggle('zijbalk-weg', weg);
  showSidebar.hidden = !weg;
  browser.setZijbalkWeg(weg);
}

document.getElementById('hide-sidebar').onclick = () => zetZijbalk(true);
showSidebar.onclick = () => zetZijbalk(false);

// --- knoppen -----------------------------------------------------------

document.getElementById('new-tab').onclick = () => browser.newTab();
document.getElementById('new-workspace').onclick = () => browser.newWorkspace();
document.getElementById('open-settings').onclick = () => openInstellingen();
backBtn.onclick = () => browser.back();
forwardBtn.onclick = () => browser.forward();
document.getElementById('reload').onclick = () => browser.reload();

// De adresbalk is een knop: klikken opent de commandobalk. Daar typ je één keer,
// en die kan meer dan alleen een adres.
urlKnop.onclick = () => openPalette(laatsteStaat.tabs.find((t) => t.id === laatsteStaat.activeId)?.url ?? '');

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (paletteIsOpen()) sluitPalette();
  else if (!settings.hidden) sluitInstellingen();
  else if (laatsteStaat.paneel) browser.zetPaneel(laatsteStaat.paneel);
  else sluitWorkspacePop();
});

browser.onOpen((wat) => {
  if (wat === 'adres' || wat === 'palet') {
    paletteIsOpen() ? sluitPalette() : openPalette(wat === 'adres' ? huidigeUrl() : '');
  } else if (wat === 'geschiedenis') {
    // Geen eigen scherm: dezelfde balk, met de geschiedenis erin. Deze browser
    // heeft één plek waar je typt en die kan meer dan een adres.
    if (paletteIsOpen() && paletteModus === 'geschiedenis') sluitPalette();
    else openPalette('', 'geschiedenis');
  } else if (wat === 'instellingen') {
    openInstellingen();
  } else if (wat === 'zoek') {
    openZoek();
  } else if (wat === 'downloads') {
    // De lijst heeft geen eigen scherm: hij staat bovenin de zijbalk. De
    // sneltoets brengt je er dus heen in plaats van iets te openen.
    if (dlSectie.hidden) return;
    dlSectie.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    dlLijst.querySelector('.dl')?.classList.add('gewezen');
    setTimeout(() => dlLijst.querySelector('.gewezen')?.classList.remove('gewezen'), 1200);
  }
});

/* ── Zoeken op deze pagina ───────────────────────────────────────────────
 *
 * Het veld staat in de zijbalk omdat de pagina een native laag is die over
 * elke overlay heen tekent; zie de uitleg bij `#zoekrij` in index.html.
 *
 * Twee dingen die makkelijk misgaan en hier dus expliciet staan:
 *
 *   · Elke toetsaanslag begint een nieuwe zoektocht, bovenaan de pagina.
 *     Enter vraagt om de volgende (`volgende: true`) en springt verder.
 *     Andersom springt het veld tijdens het typen door de pagina heen, wat
 *     niemand bedoelt.
 *   · Het veld leegmaken is niet hetzelfde als sluiten. Leeg betekent: haal
 *     de markeringen weg maar laat het veld openstaan.
 */
const zoekrij = document.getElementById('zoekrij');
const zoekveld = document.getElementById('zoekveld');
const zoektelling = document.getElementById('zoektelling');

function openZoek() {
  zoekrij.hidden = false;
  zoekveld.focus();
  zoekveld.select();
  if (zoekveld.value) browser.zoekOpPagina(zoekveld.value, {});
}

// Wegleggen zonder het hoofdproces erbij: dat is wat er moet gebeuren als het
// hoofdproces zelf zegt dat de zoektocht voorbij is, bijvoorbeeld omdat je van
// tabblad wisselt. Anders zou het antwoord daarop weer een opdracht worden.
function wisZoek() {
  zoekrij.hidden = true;
  zoektelling.textContent = '';
}

function sluitZoek() {
  wisZoek();
  browser.stopZoeken();
}

zoekveld.addEventListener('input', () => {
  const term = zoekveld.value;
  if (!term) {
    zoektelling.textContent = '';
    browser.stopZoeken();
    return;
  }
  browser.zoekOpPagina(term, {});
});

zoekveld.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { e.preventDefault(); sluitZoek(); return; }
  if (e.key !== 'Enter' || !zoekveld.value) return;
  e.preventDefault();
  browser.zoekOpPagina(zoekveld.value, { volgende: true, terug: e.shiftKey });
});

document.getElementById('zoek-volgende').onclick = () =>
  zoekveld.value && browser.zoekOpPagina(zoekveld.value, { volgende: true });
document.getElementById('zoek-vorige').onclick = () =>
  zoekveld.value && browser.zoekOpPagina(zoekveld.value, { volgende: true, terug: true });
document.getElementById('zoek-dicht').onclick = sluitZoek;

browser.onZoekUitslag(({ treffers, welke, dicht }) => {
  if (dicht) { zoekveld.value = ''; wisZoek(); return; }
  // "0" en "niets" zijn twee verschillende dingen: leeg veld is niets, een
  // term zonder treffer is nul, en dat laatste hoort te blijven staan.
  if (!zoekveld.value) { zoektelling.textContent = ''; return; }
  zoektelling.textContent = treffers ? `${welke}/${treffers}` : t('zoek.geen');
  zoektelling.dataset.leeg = treffers ? '' : 'ja';
});

/* ── Downloads ───────────────────────────────────────────────────────────
 *
 * De lijst komt kant-en-klaar uit het hoofdproces; hier staat alleen hoe hij
 * eruitziet. Drie dingen die een keuze zijn en geen toeval:
 *
 *   · De kop verdwijnt als er niets is. Een lege sectie die elke dag ruimte
 *     kost voor iets dat er zelden is, is ruimte die de tabbladen beter
 *     kunnen gebruiken.
 *   · "Lijst wissen" haalt regels weg, nooit bestanden. Dat staat ook op de
 *     knop, want een wisknop naast een bestandsnaam leest anders.
 *   · Niet elk bestand krijgt een klik die het opent. Wat kan draaien —
 *     programma's, installers, scripts — krijgt alleen "toon in map". Het
 *     hoofdproces beslist dat (lib/downloads.js) en zegt het met `kanOpenen`;
 *     hier wordt het alleen getekend.
 */
const dlSectie = document.getElementById('downloads');
const dlLijst = document.getElementById('dl-lijst');
const dlElementen = new Map();

const MAP_UIT = 'M2.8 12.6V4.2h3.6l1.2 1.6h5.6v6.8zM8 11V7.4M6.4 8.8 8 7.2l1.6 1.6';
const PAUZE = 'M6 4v8M10 4v8';
const HERVAT = 'M5.5 3.8 12 8l-6.5 4.2z';

/** "1,2 MB". Eén cijfer achter de komma is genoeg om te zien dat het loopt. */
function maat(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  const eenheden = ['kB', 'MB', 'GB', 'TB'];
  let waarde = n / 1024;
  let i = 0;
  while (waarde >= 1024 && i < eenheden.length - 1) { waarde /= 1024; i += 1; }
  return `${waarde.toFixed(waarde < 10 ? 1 : 0).replace('.', ',')} ${eenheden[i]}`;
}

/** De regel onder de naam: hoever, en waar het vandaan komt. */
function dlOnderschrift(d) {
  const waar = d.host ? ` · ${d.host}` : '';
  if (d.status === 'bezig' || d.status === 'gepauzeerd') {
    const hoever = d.totaal > 0
      ? t('dl.vanTotaal', { gedaan: maat(d.ontvangen), totaal: maat(d.totaal) })
      : maat(d.ontvangen);
    return `${d.status === 'gepauzeerd' ? `${t('dl.gepauzeerd')} · ` : ''}${hoever}${waar}`;
  }
  if (d.status === 'klaar') return `${maat(d.ontvangen)}${waar}`;
  return `${t(d.status === 'gestopt' ? 'dl.gestopt' : 'dl.mislukt')}${waar}`;
}

function maakDownload(d) {
  const li = document.createElement('li');
  li.className = 'dl';
  li.dataset.id = d.id;

  const naam = document.createElement('span');
  naam.className = 'dl-naam';

  const onder = document.createElement('span');
  onder.className = 'dl-onder';

  const balk = document.createElement('span');
  balk.className = 'dl-balk';
  const vulling = document.createElement('i');
  balk.append(vulling);

  const tekst = document.createElement('span');
  tekst.className = 'dl-tekst';
  tekst.append(naam, onder, balk);

  // Twee knoppen: eentje die met de download zelf te maken heeft (pauzeren of
  // in de map tonen) en eentje die hem uit de lijst haalt.
  const doe = document.createElement('button');
  doe.className = 'ib dl-doe';
  doe.type = 'button';

  const weg = document.createElement('button');
  weg.className = 'ib dl-weg';
  weg.type = 'button';
  weg.title = t('dl.uitLijst');
  weg.setAttribute('aria-label', weg.title);
  weg.append(icoon(KRUISJE));
  weg.onclick = (e) => {
    e.stopPropagation();
    browser.wisDownload(d.id);
  };

  li.append(tekst, doe, weg);
  return { li, naam, onder, vulling, doe, weg };
}

function werkDownloadBij(el, d) {
  el.li.dataset.status = d.status;
  if (el.naam.textContent !== d.naam) el.naam.textContent = d.naam;
  el.naam.title = d.naam;
  el.onder.textContent = dlOnderschrift(d);

  const loopt = d.status === 'bezig' || d.status === 'gepauzeerd';
  const deel = loopt && d.totaal > 0 ? Math.min(1, d.ontvangen / d.totaal) : 0;
  el.li.classList.toggle('loopt', loopt);
  // Een download zonder bekende lengte krijgt geen balk die liegt: dan blijft
  // hij op nul staan en vertelt het onderschrift het verhaal.
  el.vulling.style.setProperty('width', `${Math.round(deel * 100)}%`);

  el.doe.replaceChildren();
  if (loopt) {
    const uit = d.status === 'gepauzeerd';
    el.doe.append(icoon(uit ? HERVAT : PAUZE));
    el.doe.title = t(uit ? 'dl.verder' : 'dl.pauzeren');
    el.doe.onclick = (e) => { e.stopPropagation(); browser.pauzeerDownload(d.id); };
  } else if (d.status === 'klaar') {
    el.doe.append(icoon(MAP_UIT));
    el.doe.title = t('dl.inMap');
    el.doe.onclick = (e) => { e.stopPropagation(); browser.toonDownload(d.id); };
  }
  el.doe.hidden = !loopt && d.status !== 'klaar';
  el.doe.setAttribute('aria-label', el.doe.title || '');

  // Klikken op de regel opent het bestand, maar alleen als het hoofdproces dat
  // goed vindt. Anders is de regel gewoon tekst en doet de knop het werk.
  el.li.classList.toggle('opent', Boolean(d.kanOpenen));
  el.li.onclick = d.kanOpenen ? () => browser.openDownload(d.id) : null;
  el.li.title = d.kanOpenen
    ? t('dl.openen')
    : d.status === 'klaar' ? t('dl.nietOpenen') : '';
}

function tekenDownloads(lijst) {
  const gezien = new Set();
  let vorige = null;
  for (const d of lijst) {
    gezien.add(d.id);
    let el = dlElementen.get(d.id);
    if (!el) {
      el = maakDownload(d);
      dlElementen.set(d.id, el);
    }
    werkDownloadBij(el, d);
    // Op volgorde zetten zonder de lijst opnieuw op te bouwen: een rij die
    // al goed staat wordt niet aangeraakt, en verliest dus geen focus.
    const hoort = vorige ? vorige.nextSibling : dlLijst.firstChild;
    if (el.li !== hoort) dlLijst.insertBefore(el.li, hoort);
    vorige = el.li;
  }
  for (const [id, el] of dlElementen) {
    if (gezien.has(id)) continue;
    el.li.remove();
    dlElementen.delete(id);
  }
  dlSectie.hidden = lijst.length === 0;
}

document.getElementById('dl-wis').onclick = () => browser.wisDownloads();
browser.onDownloads(tekenDownloads);
// Een zijbalk die net herladen is weet nog niet wat er al liep.
browser.downloads().then(tekenDownloads).catch(() => {});

browser.onFavicon(({ id, favicon }) => {
  favicons.set(id, favicon);
  const e = tabElementen.get(id);
  if (e && favicon && e.merk.tagName === 'IMG') e.merk.src = favicon;
});

const huidigeUrl = () => laatsteStaat.tabs.find((t) => t.id === laatsteStaat.activeId)?.url ?? '';

/** Alles wat uit de stand getekend wordt, in één greep. */
function tekenAlles() {
  const state = laatsteStaat;
  tekenTabbladen(state.tabs ?? [], state.activeId);
  tekenWerkbank();
  tekenVraag();
  tekenMcp();
  tekenAccount();
  tekenAgent();
  tekenKist();
  tekenVersie();
  tekenToetsen();
  tekenApprij();
  tekenPaneel();
  tekenWorkspaces();

  // Zit je in de app, dan zegt de balk de naam van de plek. "tougather.com" is
  // waar dat vandaan komt en niet waar je bent.
  const plek = huidigePlek();
  const actief = state.tabs.find((tab) => tab.id === state.activeId);
  const leeg = !plek && (!actief || !actief.url);
  urlTekst.textContent = plek ? `Tougather · ${plek.naam}`
    : leeg ? t('zij.adres') : host(actief.url);
  urlTekst.classList.toggle('leeg', leeg);
  urlKnop.title = leeg ? t('zij.adres') : actief.url;

  tabcount.textContent = state.tabs.length || '';
  if (actief) {
    backBtn.disabled = !actief.canGoBack;
    forwardBtn.disabled = !actief.canGoForward;
  }
}

browser.onState((state) => {
  laatsteStaat = state;
  tekenAlles();
});

// --- tabbladen ---------------------------------------------------------

/**
 * De lijst wordt bijgewerkt, niet opnieuw opgebouwd. Dat is geen optimalisatie
 * maar een voorwaarde: het hoofdproces stuurt bij elke gebeurtenis in elke
 * pagina een volledige stand. Met replaceChildren kon niets in- of uitlopen,
 * verloor een ingedrukte rij zijn :active, verdween de focus, en startte elk
 * gloeiend icoontje telkens een nieuwe tekenlus.
 */
const tabElementen = new Map();

function maakTab(tab) {
  const li = document.createElement('li');
  li.className = 'tab';
  li.dataset.id = tab.id;
  li.onclick = () => browser.activateTab(tab.id);

  const fi = document.createElement('span');
  fi.className = 'fi';

  let merk;
  let glyph = null;
  if (tab.owner) {
    // Het gloeiende icoontje van een assistent: de kleur zegt waar hij mee bezig
    // is, ook als je naar iets anders kijkt.
    merk = document.createElement('canvas');
    merk.className = 'glyph';
    glyph = maakGlyph(merk, { n: 5, zijde: 18 });
  } else {
    merk = document.createElement('img');
    merk.alt = '';
    // Een favicon die 404't laat Chromium als omlijnd vakje staan.
    merk.onerror = () => merk.removeAttribute('src');
  }
  fi.append(merk);

  const eigenaar = tab.owner ? document.createElement('span') : null;
  if (eigenaar) eigenaar.className = 'eigenaar';

  const titel = document.createElement('span');
  titel.className = 't';

  // Naast elkaar zetten. Op het actieve tabblad heeft dit geen betekenis, want
  // dat ís al de ene helft; daar wordt de knop verborgen.
  const sp = document.createElement('button');
  sp.className = 'sp';
  sp.type = 'button';
  sp.append(icoon(SPLITS));
  sp.onclick = (e) => {
    e.stopPropagation();
    browser.zetBuur(tab.id);
  };

  const sluit = document.createElement('button');
  sluit.className = 'x';
  sluit.type = 'button';
  sluit.title = t('zij.tabbladSluiten');
  sluit.append(icoon(KRUISJE));
  sluit.onclick = (e) => {
    e.stopPropagation();
    favicons.delete(tab.id);
    browser.closeTab(tab.id);
  };

  li.append(fi);
  if (eigenaar) li.append(eigenaar);
  li.append(titel, sp, sluit);
  return { li, merk, glyph, eigenaar, titel };
}

// Welke rij naast het actieve tabblad staat, en wat de knop dan zegt.
function zetBuurStand(el, tab) {
  const buur = laatsteStaat.buurId === tab.id;
  const actief = laatsteStaat.activeId === tab.id;
  el.li.classList.toggle('buur', buur);
  const sp = el.li.querySelector('.sp');
  if (!sp) return;
  sp.hidden = actief;
  sp.title = t(buur ? 'zij.nietNaastElkaar' : 'zij.naastElkaar');
  sp.setAttribute('aria-label', sp.title);
  sp.setAttribute('aria-pressed', String(buur));
}

function werkTabBij(e, tab, isActief) {
  e.li.classList.toggle('agent', Boolean(tab.owner));
  e.li.setAttribute('aria-current', String(isActief));
  zetBuurStand(e, tab);

  if (tab.owner) {
    e.li.dataset.modus = tab.modus ?? 'rust';
    e.li.title = t('zij.werktIn', { naam: tab.owner });
    if (e.eigenaar && e.eigenaar.textContent !== tab.owner) e.eigenaar.textContent = tab.owner;
    if (e.glyph) e.glyph.zet(tab.modus ?? 'rust');
  }

  const naam = tab.loading ? 'Laden…' : tab.title;
  if (e.titel.textContent !== naam) e.titel.textContent = naam;

  const favicon = favicons.get(tab.id);
  if (favicon && e.merk.tagName === 'IMG' && e.merk.getAttribute('src') !== favicon) {
    e.merk.src = favicon;
  }
}

function tekenTabbladen(tabs, activeId) {
  const gezien = new Set();
  let vorige = null;

  for (const tab of tabs) {
    gezien.add(tab.id);
    let e = tabElementen.get(tab.id);
    if (!e) {
      e = maakTab(tab);
      tabElementen.set(tab.id, e);
      e.li.classList.add('komt');
    }
    werkTabBij(e, tab, tab.id === activeId);

    // Alleen verplaatsen als hij ergens anders staat: een insertBefore die niets
    // verplaatst breekt wel de lopende animatie af.
    const doelPlek = vorige ? vorige.nextSibling : tablist.firstChild;
    if (doelPlek !== e.li) tablist.insertBefore(e.li, doelPlek);
    vorige = e.li;
  }

  for (const [id, e] of [...tabElementen]) {
    if (gezien.has(id)) continue;
    tabElementen.delete(id);
    e.li.classList.remove('komt');
    e.li.classList.add('gaat');
    // Twee wegen naar hetzelfde einde: het einde van de animatie, en anders de
    // klok. Bij prefers-reduced-motion staat animation op none en komt
    // animationend nooit — zonder deze klok bleef de rij eeuwig staan.
    const weg = () => e.li.remove();
    e.li.addEventListener('animationend', weg, { once: true });
    setTimeout(weg, 400);
  }
}

// --- favorieten --------------------------------------------------------

function tekenFavorieten() {
  const lijst = prefs.favorieten ?? [];
  favs.replaceChildren(
    ...lijst.slice(0, 8).map((fav) => {
      const knop = document.createElement('button');
      knop.className = 'fav';
      knop.type = 'button';
      knop.title = fav.naam || fav.url;
      knop.onclick = () => browser.newTab(fav.url);

      const letter = document.createElement('span');
      letter.className = 'letter';
      letter.textContent = (fav.naam || host(fav.url) || '?').charAt(0).toUpperCase();
      knop.append(letter);
      return knop;
    }),
  );
}

// --- de vraag van een AI-client ----------------------------------------

const vraag = document.getElementById('vraag');
const vraagKop = document.getElementById('vraag-kop');
const vraagRegels = document.getElementById('vraag-regels');
const vraagWaarschuwing = document.getElementById('vraag-waarschuwing');
const vraagKlok = document.getElementById('vraag-klok');

let vraagTikker = null;

const beantwoord = (goed) => {
  const open = laatsteStaat.toestemming?.open;
  if (open) browser.antwoordToestemming(open.id, goed);
};

document.getElementById('vraag-ja').onclick = () => beantwoord(true);
document.getElementById('vraag-nee').onclick = () => beantwoord(false);

// Escape is weigeren. Enter is met opzet niets: dan zou een druk op de
// spatiebalk of de returntoets, halverwege iets anders, toestemming geven.
document.addEventListener('keydown', (e) => {
  if (!laatsteStaat.toestemming?.open) return;
  if (e.key === 'Escape') {
    e.preventDefault();
    e.stopPropagation();
    beantwoord(false);
  }
}, true);

function tekenVraag() {
  const open = laatsteStaat.toestemming?.open ?? null;
  vraag.hidden = !open;
  clearInterval(vraagTikker);
  if (!open) return;

  vraagKop.textContent = open.kop;
  vraagRegels.replaceChildren(...open.regels.map((r) => {
    const li = document.createElement('li');
    li.textContent = r;
    return li;
  }));
  vraagWaarschuwing.textContent = open.waarschuwing;

  // Zichtbaar aftellen. Niet om te haasten, maar zodat duidelijk is dat niets
  // doen ook een antwoord is, en welk antwoord dat is.
  const tik = () => {
    const over = Math.max(0, Math.round((open.verlooptOp - Date.now()) / 1000));
    vraagKlok.textContent = over
      ? `Geen antwoord binnen ${over} ${over === 1 ? 'seconde' : 'seconden'} betekent nee.`
      : 'Verlopen.';
  };
  tik();
  vraagTikker = setInterval(tik, 1000);

  // De weigerknop krijgt de aandacht, niet de knop die toestaat.
  document.getElementById('vraag-nee').focus();
}

// --- de verbinding met een AI-client ------------------------------------

const mcpAan = document.getElementById('mcp-aan');
const mcpStand = document.getElementById('mcp-stand');
const mcpOpen = document.getElementById('mcp-open');
const mcpConfig = document.getElementById('mcp-config');
const mcpLog = document.getElementById('mcp-log');

// Wat je in het configuratiebestand van je client zet. Er staat met opzet geen
// sleutel in: die maakt de browser per keer aan en zet hem apart, zodat een oude
// configuratie nooit een deur opent die jij hebt dichtgedaan.
function configTekst() {
  const pad = (laatsteStaat.mcp?.brug ?? 'tougather-mcp.mjs').replace(/\\/g, '\\\\');
  return JSON.stringify({
    mcpServers: {
      tougather: { command: 'node', args: [pad] },
    },
  }, null, 2);
}

mcpAan.onchange = () => browser.zetMcp(mcpAan.checked);

document.getElementById('mcp-noodstop').onclick = () => {
  browser.mcpNoodstop();
};

document.getElementById('mcp-kopieer').onclick = async (e) => {
  await navigator.clipboard.writeText(configTekst());
  const knopje = e.currentTarget;
  knopje.textContent = t('inst.mcpGekopieerd');
  setTimeout(() => { knopje.textContent = t('inst.mcpKopieer'); }, 1600);
};

const klok = (op) => new Date(op).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

function tekenMcp() {
  const m = laatsteStaat.mcp ?? { aan: false, log: [] };
  mcpAan.checked = Boolean(m.aan);
  mcpStand.textContent = m.aan ? t('inst.mcpOpen', { poort: m.poort }) : t('inst.mcpDicht');
  mcpOpen.hidden = !m.aan;
  if (!m.aan) return;

  mcpConfig.textContent = configTekst();

  // Nieuwste bovenaan: dat is wat je komt halen als je hier kijkt.
  const regels = [...(m.log ?? [])].reverse();
  if (!regels.length) {
    const leeg = document.createElement('li');
    leeg.className = 'leeg';
    leeg.textContent = t('inst.mcpLeeg');
    mcpLog.replaceChildren(leeg);
    return;
  }

  mcpLog.replaceChildren(...regels.map((r) => {
    const li = document.createElement('li');
    li.dataset.soort = r.soort;
    const tijd = document.createElement('span');
    tijd.className = 'tijd';
    tijd.textContent = klok(r.op);
    const tekst = document.createElement('span');
    tekst.textContent = r.tekst;
    li.append(tijd, tekst);
    return li;
  }));
}

// --- bovenbalk ---------------------------------------------------------

const paneel = document.getElementById('paneel');
const notitieVeld = document.getElementById('notitie');
const notitieStand = document.getElementById('notitie-stand');
const appsRaster = document.getElementById('apps-raster');
const appsUitleg = document.getElementById('apps-uitleg');
const bbRegel = document.querySelector('#bb-assistent .bb-regel');

// De glyph in de balk is dezelfde tekening als in de zijbalk en op de balk van
// de assistent: één bestand, drie plekken.
const balkGlyph = maakGlyph(document.querySelector('#bb-assistent .glyph'), { n: 5, zijde: 17 });

document.getElementById('bb-assistent').onclick = () => browser.focusIsland();

// De stand van de assistent. In rust zegt de balk niets bijzonders; zodra hij
// werkt staat daar wat hij doet, en bij 'actie' dat hij op jou wacht.
browser.onAssistent((stand) => {
  const modus = stand?.modus ?? 'rust';
  document.body.dataset.assistent = modus === 'actie' ? 'actie' : (stand?.bezig ? 'bezig' : 'rust');
  balkGlyph.zet(modus);
  bbRegel.textContent = stand?.regel || 'Klaar wanneer jij bent';
  document.getElementById('bb-assistent').title = stand?.regel
    ? `Assistent: ${stand.regel}`
    : 'Assistent';
});

// De tekening per app in de balk. Namen en hoogtes komen uit het hoofdproces;
// vormen horen hier.
const APP_ICONEN = {
  geluid: 'M4.4 6.2h2.2l3-2.4v8.4l-3-2.4H4.4zM11 6.4a2.4 2.4 0 0 1 0 3.2',
  notitie: 'M3.6 2.6h8.8v10.8H3.6zM5.8 5.6h4.4M5.8 8h4.4M5.8 10.4h2.6',
  apps: 'M4.4 2.9a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3M11.6 2.9a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3M4.4 10.1a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3M11.6 10.1a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3',
};

const bbKnoppen = document.getElementById('bb-knoppen');

// De rij apps. Elk pictogram is een schakelaar naar zijn eigen paneel, en mag
// een stip dragen als die app iets te melden heeft.
function tekenApprij() {
  const apps = laatsteStaat.balkApps ?? [];
  const open = laatsteStaat.paneel ?? null;
  const geluid = laatsteStaat.geluid ?? [];

  bbKnoppen.replaceChildren(...apps.map((app) => {
    const knop = document.createElement('button');
    knop.className = 'bb-knop';
    knop.type = 'button';
    knop.id = 'bb-' + app.id;
    knop.setAttribute('aria-pressed', String(open === app.id));
    knop.append(icoon(APP_ICONEN[app.id] ?? APP_ICONEN.apps));
    knop.onclick = () => browser.zetPaneel(app.id);

    let melding = '';
    if (app.id === 'geluid' && geluid.length) {
      const klinkt = geluid.filter((g) => g.klinkt && !g.gedempt).length;
      knop.dataset.stand = klinkt ? 'klinkt' : 'gedempt';
      const stip = document.createElement('span');
      stip.className = 'bb-stip';
      knop.append(stip);
      melding = klinkt
        ? t(klinkt === 1 ? 'paneel.eenSpeelt' : 'paneel.spelen', { aantal: klinkt })
        : t('paneel.gedempt');
    }

    // De naam komt uit het hoofdproces en is daar Nederlands; hier hoort hij
    // in de taal van dit scherm. Valt er geen vertaling te vinden, dan staat
    // die naam er alsnog — beter iets in de verkeerde taal dan niets.
    const naam = WOORDEN[taalNu()]?.[`paneel.${app.id}`] ?? app.naam;
    knop.title = naam + melding;
    knop.setAttribute('aria-label', naam + melding);
    return knop;
  }));
}

function tekenPaneel() {
  const naam = laatsteStaat.paneel ?? null;
  const hoogte = laatsteStaat.paneelHoogte ?? 0;

  document.documentElement.style.setProperty('--paneel-hoogte', hoogte + 'px');
  paneel.hidden = !naam;

  for (const app of laatsteStaat.balkApps ?? []) {
    const sectie = document.getElementById('paneel-' + app.id);
    if (sectie) sectie.hidden = naam !== app.id;
  }

  if (naam === 'notitie') {
    notitieVeld.focus();
    // De cursor achteraan, niet op teken nul: je komt hier om verder te
    // schrijven, niet om vooraan te beginnen.
    const eind = notitieVeld.value.length;
    notitieVeld.setSelectionRange(eind, eind);
  }
  if (naam === 'apps') tekenApps();
  if (naam === 'geluid') tekenGeluid();
}

// --- geluid ------------------------------------------------------------

const geluidLijst = document.getElementById('geluid-lijst');
const geluidStand = document.getElementById('geluid-stand');

const LUID = 'M4.4 6.2h2.2l3-2.4v8.4l-3-2.4H4.4zM11 6.4a2.4 2.4 0 0 1 0 3.2';
const STIL = 'M4.4 6.2h2.2l3-2.4v8.4l-3-2.4H4.4zM11 6.4l2.6 3.2M13.6 6.4 11 9.6';

// Wat er klinkt, met per rij één knop om het stil te zetten en één om ernaartoe
// te gaan. Dempen zonder te wisselen is het hele punt: je wilt van dat geluid af
// zonder je eigen werk kwijt te raken.
function tekenGeluid() {
  const bronnen = laatsteStaat.geluid ?? [];
  geluidStand.textContent = bronnen.length
    ? t(bronnen.length === 1 ? 'paneel.bron' : 'paneel.bronnen', { aantal: bronnen.length })
    : '';

  if (!bronnen.length) {
    const leeg = document.createElement('li');
    leeg.className = 'gl-leeg';
    leeg.textContent = t('paneel.stil');
    geluidLijst.replaceChildren(leeg);
    return;
  }

  geluidLijst.replaceChildren(...bronnen.map((bron) => {
    const li = document.createElement('li');
    li.className = 'gl-rij';
    li.dataset.id = bron.id;
    li.dataset.gedempt = String(bron.gedempt);

    const tekst = document.createElement('button');
    tekst.className = 'gl-tekst';
    tekst.type = 'button';
    tekst.title = t('paneel.naarTab', { ws: bron.wsNaam });
    const titel = document.createElement('span');
    titel.className = 'gl-titel';
    titel.textContent = bron.titel;
    const waar = document.createElement('span');
    waar.className = 'gl-waar';
    waar.textContent = [bron.host, bron.wsNaam].filter(Boolean).join(' · ');
    tekst.append(titel, waar);
    tekst.onclick = () => {
      if (bron.wsId !== laatsteStaat.activeWorkspaceId) browser.activateWorkspace(bron.wsId);
      browser.activateTab(bron.id);
      browser.zetPaneel('geluid');
    };

    const demp = document.createElement('button');
    demp.className = 'gl-demp';
    demp.type = 'button';
    demp.title = t(bron.gedempt ? 'paneel.hoorbaar' : 'paneel.demp');
    demp.setAttribute('aria-label', demp.title);
    demp.append(icoon(bron.gedempt ? STIL : LUID));
    demp.onclick = () => browser.dempTab(bron.id, !bron.gedempt);

    li.append(tekst, demp);
    return li;
  }));
}

// --- de notitie --------------------------------------------------------

// Bewaren gaat via de voorkeuren, die al atomair schrijven en zichzelf
// uitstellen. Eén tekstveld heeft geen eigen opslagmachinerie nodig.
let notitieTimer = null;

notitieVeld.addEventListener('input', () => {
  notitieStand.textContent = t('paneel.notitieBezig');
  clearTimeout(notitieTimer);
  notitieTimer = setTimeout(() => {
    browser.zetVoorkeur('notitie', notitieVeld.value);
    notitieStand.textContent = t('paneel.notitieBewaard');
  }, 400);
});

// Escape sluit het paneel, maar niet terwijl je in het veld typt en er nog een
// commandobalk of instellingenscherm open kan staan; die gaan voor.
notitieVeld.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    e.stopPropagation();
    browser.zetPaneel('notitie');
  }
});

// --- apps en extensies -------------------------------------------------

// Wat er in deze browser zit. De werkbank en zijn plekken komen uit de stand,
// zodat deze lijst niet apart bijgehouden hoeft te worden. Wat er nog niet is
// staat er ook in, met de reden erbij: een lege plek waar iets komt is
// eerlijker dan een raster dat doet alsof het compleet is.
const NOG_NIET = [
  { naam: 'Extensies', hint: 'Nog niet gebouwd', pad: PLEK_ICONEN.lijst },
  { naam: 'Opnemen', hint: 'Wacht op geluidsapparatuur', pad: PLEK_ICONEN.mensen },
];

function tekenApps() {
  const plekken = laatsteStaat.werkbankPlekken ?? [];
  const tegels = [];

  for (const plek of plekken) {
    tegels.push(appTegel({
      naam: plek.naam,
      hint: 'Tougather',
      pad: PLEK_ICONEN[plek.icoon] ?? PLEK_ICONEN.lijst,
      bijKlik: () => {
        browser.zetPaneel('apps');
        browser.gaWerkbank(plek.pad);
      },
    }));
  }

  tegels.push(appTegel({
    naam: 'Notitie',
    hint: 'In deze balk',
    pad: 'M3.6 2.6h8.8v10.8H3.6zM5.8 5.6h4.4M5.8 8h4.4M5.8 10.4h2.6',
    bijKlik: () => browser.zetPaneel('notitie'),
  }));

  for (const n of NOG_NIET) {
    tegels.push(appTegel({ ...n, uit: true }));
  }

  appsRaster.replaceChildren(...tegels);
  appsUitleg.textContent =
    `${plekken.length + 1} van de ${plekken.length + 1 + NOG_NIET.length} werken. ` +
    'De rest staat erbij met de reden erachter.';
}

function appTegel({ naam, hint, pad, bijKlik, uit = false }) {
  const knop = document.createElement('button');
  knop.className = 'app-tegel';
  knop.type = 'button';
  knop.disabled = Boolean(uit);
  knop.title = uit ? `${naam}: ${hint}` : `${naam} openen`;

  const ic = document.createElement('span');
  ic.className = 'at-ic';
  ic.append(icoon(pad));

  const tekst = document.createElement('span');
  tekst.className = 'at-tekst';
  const n = document.createElement('span');
  n.className = 'at-naam';
  n.textContent = naam;
  const h = document.createElement('span');
  h.className = 'at-hint';
  h.textContent = hint;
  tekst.append(n, h);

  knop.append(ic, tekst);
  if (bijKlik) knop.onclick = bijKlik;
  return knop;
}

// --- workspaces --------------------------------------------------------

const wsPop = document.getElementById('ws-pop');
const wsPopList = document.getElementById('ws-pop-list');

// Welke workspace op scherp staat om gesloten te worden. Sluiten neemt al zijn
// tabbladen mee, dus dat vraagt twee klikken; de rij zegt tussendoor wat de
// tweede gaat doen.
let gewapend = null;
let ontwapenen = null;

const letter = (naam) => (String(naam).trim()[0] || '?').toUpperCase();
const tabbladen = (n) => t(n === 1 ? 'ws.eenTabblad' : 'ws.tabbladen', { aantal: n });

// De naam van de plek waar je in de app bent, of null als je er niet bent.
function huidigePlek() {
  if (!laatsteStaat.werkbankOpen) return null;
  const plekken = laatsteStaat.werkbankPlekken ?? [];
  return plekken.find((p) => p.pad === laatsteStaat.werkbankPad) ?? null;
}

function tekenWerkbank() {
  const open = Boolean(laatsteStaat.werkbankOpen);
  werkbankKnop.setAttribute('aria-pressed', String(open));
  werkbankKnop.setAttribute('aria-expanded', String(open));
  werkbankKnop.title = open ? 'Terug naar je tabblad' : 'Tougather openen';
  document.body.classList.toggle('werkbank-open', open);

  // De rijen staan er alleen als je binnen bent. Ze zitten in één wikkel omdat
  // de uitklap met grid-template-rows werkt, en die heeft één kind nodig om
  // van nul naar zijn eigen hoogte te kunnen groeien.
  const plekken = laatsteStaat.werkbankPlekken ?? [];
  const wikkel = document.createElement('div');
  for (const plek of plekken) {
    const li = document.createElement('li');
    const knop = document.createElement('button');
    knop.className = 'plek';
    knop.type = 'button';
    knop.dataset.pad = plek.pad;
    const hier = open && plek.pad === laatsteStaat.werkbankPad;
    knop.setAttribute('aria-current', String(hier));
    knop.title = hier ? `Je bent in ${plek.naam}` : `Naar ${plek.naam}`;
    knop.onclick = () => browser.gaWerkbank(plek.pad);

    const ic = document.createElement('span');
    ic.className = 'pi';
    ic.append(icoon(PLEK_ICONEN[plek.icoon] ?? PLEK_ICONEN.lijst));

    const naam = document.createElement('span');
    naam.className = 't';
    naam.textContent = plek.naam;

    knop.append(ic, naam);
    li.append(knop);
    wikkel.append(li);
  }
  // Wie je bent, onderaan de rij. Hier en niet in de instellingen: dit is de
  // plek waar je werk opengaat, en "onder welk account werk ik nu" hoort bij
  // dat openen, niet bij een voorkeurenscherm.
  const account = laatsteStaat.account;
  const li = document.createElement('li');
  const knop = document.createElement('button');
  knop.className = 'plek account';
  knop.type = 'button';
  knop.id = 'app-account';

  const ic = document.createElement('span');
  ic.className = 'pi';
  ic.append(icoon(PLEK_ICONEN.persoon));

  const naam = document.createElement('span');
  naam.className = 't';

  if (account?.account) {
    // Het adres onderscheidt je als je twee accounts hebt; de naam is wat
    // anderen zien. Het adres wint, want daar meld je je mee aan.
    naam.textContent = account.email || account.naam || t('inst.aangemeld');
    knop.title = account.wacht
      ? t('inst.nietBevestigd')
      : t('inst.aangemeldAls', { wie: account.email || account.naam });
    knop.dataset.stand = account.wacht ? 'wacht' : 'aan';
  } else {
    naam.textContent = t('inst.aanmelden');
    knop.title = t('inst.aanmeldenTitel');
    knop.dataset.stand = 'uit';
  }
  knop.onclick = () => browser.gaAanmelden();

  knop.append(ic, naam);
  li.append(knop);
  wikkel.append(li);

  appPlekken.replaceChildren(wikkel);
}

function tekenWorkspaces() {
  const { workspaces, activeWorkspaceId } = laatsteStaat;
  workspaceList.replaceChildren(
    ...workspaces.map((ws) => stripKnop(ws, ws.id === activeWorkspaceId)),
  );
  if (!wsPop.hidden) tekenWorkspacePop();

  // De hele achtergrond hoort bij de workspace waar je in staat. De overgang zit
  // in de --c-eigenschap, dus dit ene attribuut laat tien vlekken tegelijk over
  // ruim een seconde verkleuren.
  const actief = workspaces.find((ws) => ws.id === activeWorkspaceId);
  if (actief?.palet) document.body.dataset.palet = actief.palet;
  document.body.dataset.beweging = actief?.beweging ?? 'rustig';
  document.body.classList.toggle('prive', Boolean(actief?.prive));

  houdActieveInBeeld();
}

// De strip schuift zodra er meer workspaces zijn dan er passen. Dan moet de
// actieve er wel helemaal in staan: half afgesneden leest als kapot. Zelf
// rekenen in plaats van scrollIntoView, want die vindt een knop die net over de
// rand valt al dichtbij genoeg en laat hem dan staan.
function houdActieveInBeeld() {
  const huidig = workspaceList.querySelector('[aria-current="true"]');
  if (!huidig) return;
  const strip = workspaceList.getBoundingClientRect();
  const knop = huidig.getBoundingClientRect();
  const rand = 4;
  if (knop.left < strip.left + rand) {
    workspaceList.scrollLeft += knop.left - strip.left - rand;
  } else if (knop.right > strip.right - rand) {
    workspaceList.scrollLeft += knop.right - strip.right + rand;
  }
}

// Eén knop in de strip. De actieve draagt zijn naam en een chevron naar het
// overzicht; de rest draagt een gekleurde beginletter, zodat je ze uit elkaar
// houdt zonder de namen te kunnen lezen.
function stripKnop(ws, isActive) {
  const li = document.createElement('li');
  li.className = `ws p-${ws.palet ?? 'home'}${ws.prive ? ' prive' : ''}`;
  li.dataset.id = ws.id;
  // De naam ook als attribuut: in de strip staat hij alleen bij de actieve, maar
  // schermlezers en tests moeten weten waar elke knop heen gaat.
  li.dataset.naam = ws.name;
  li.setAttribute('aria-current', String(isActive));
  li.title = isActive
    ? `${ws.name}, ${tabbladen(ws.tabCount)} — klik voor het overzicht`
    : `Naar ${ws.name}, ${tabbladen(ws.tabCount)}`;
  li.onclick = () => {
    if (isActive) wisselWorkspacePop();
    else {
      sluitWorkspacePop();
      browser.activateWorkspace(ws.id);
    }
  };

  const stip = document.createElement('span');
  stip.className = 'dot-ws';
  if (ws.prive) stip.append(icoon(SLOTJE));
  else if (!isActive) stip.textContent = letter(ws.name);
  li.append(stip);

  if (isActive) {
    const naam = document.createElement('span');
    naam.className = 'name';
    naam.textContent = ws.name;

    const chev = document.createElement('span');
    chev.className = 'chev';
    chev.append(icoon(CHEVRON));

    li.append(naam, chev);
  }
  return li;
}

// --- het overzicht -----------------------------------------------------

function wisselWorkspacePop() {
  if (wsPop.hidden) openWorkspacePop();
  else sluitWorkspacePop();
}

function openWorkspacePop() {
  wsPop.hidden = false;
  tekenWorkspacePop();
}

function sluitWorkspacePop() {
  if (wsPop.hidden) return;
  wsPop.hidden = true;
  ontwapen();
}

function ontwapen() {
  clearTimeout(ontwapenen);
  gewapend = null;
}

function tekenWorkspacePop() {
  const { workspaces, activeWorkspaceId } = laatsteStaat;
  wsPopList.replaceChildren(
    ...workspaces.map((ws) => popRij(ws, ws.id === activeWorkspaceId, workspaces.length)),
  );

  // Een privéworkspace leg je niet weg; die gaat er juist over dat er niets
  // blijft staan. En een lege ook niet, want dan is er niets om terug te halen.
  const hier = workspaces.find((w) => w.id === activeWorkspaceId);
  const knop = document.getElementById('ws-pop-weg');

  // Tellen wat er wérkelijk weg te leggen valt, niet hoeveel tabbladen er staan.
  // Een leeg nieuw tabblad telt als tabblad maar heeft geen adres, en dan zou de
  // knop beloven wat het wegleggen daarna weigert.
  const teBewaren = laatsteStaat.tabs.filter((t) => /^https?:/.test(t.url ?? '')).length;
  const kan = hier && !hier.prive && teBewaren > 0;
  knop.disabled = !kan;
  knop.title = hier?.prive
    ? 'Een privéworkspace leg je niet weg; daar gaat hij juist niet over.'
    : kan ? 'Sluit deze workspace en bewaar hem om later terug te halen'
      : 'Er staat niets in om weg te leggen';

  tekenVerhuis();
  tekenUiterlijk();
  tekenSessies();
}

/**
 * Waar deze workspace naartoe kan.
 *
 * Eén knop per ander venster, en niets als er geen ander venster is. Wat er
 * verhuist is de hele workspace en niet één tabblad; de uitleg eronder zegt
 * waarom, want dat is precies wat je verwacht te kunnen en niet kunt.
 */
function tekenVerhuis() {
  const rij = document.getElementById('ws-pop-verhuis');
  const uitleg = document.getElementById('ws-verhuis-uitleg');
  if (!rij || !uitleg) return;

  const anderen = laatsteStaat.andereVensters ?? [];
  const hier = laatsteStaat.workspaces.find((w) => w.id === laatsteStaat.activeWorkspaceId);
  const kan = anderen.length > 0 && hier && laatsteStaat.workspaces.length > 1;
  rij.hidden = !kan;
  uitleg.hidden = !kan;
  if (!kan) return;

  rij.replaceChildren(...anderen.map((v) => {
    const knop = document.createElement('button');
    knop.type = 'button';
    knop.textContent = t('ws.verhuis', { nummer: v.nummer });
    knop.onclick = () => {
      sluitWorkspacePop();
      browser.verhuisWorkspace(hier.id, v.sleutel);
    };
    return knop;
  }));
}

// Wat er ligt te wachten. Een sessie is een lijstje adressen met een naam, geen
// archief van de pagina's zelf.
// Het uiterlijk van de workspace waar je nu in zit.
//
// Alleen die ene, en zijn naam staat erboven. Een kiezer die niet zegt waar hij
// over gaat verandert steeds iets anders dan je dacht.
function tekenUiterlijk() {
  const { workspaces, activeWorkspaceId } = laatsteStaat;
  const hier = workspaces.find((w) => w.id === activeWorkspaceId);
  const vak = document.getElementById('ws-uiterlijk');
  if (!hier) {
    vak.hidden = true;
    return;
  }

  // Een privéworkspace houdt zijn donkere palet. Dat is geen smaak maar het
  // teken waaraan je ziet waar je bent, dus daar valt niets te kiezen.
  vak.hidden = Boolean(hier.prive);
  if (hier.prive) return;

  document.getElementById('ws-uiterlijk-naam').textContent = hier.name;

  const paletten = laatsteStaat.paletten ?? [];
  document.getElementById('paletkiezer').replaceChildren(...paletten.map((p) => {
    const knop = document.createElement('button');
    knop.className = `palet p-${p.id}`;
    knop.type = 'button';
    knop.setAttribute('role', 'radio');
    knop.setAttribute('aria-checked', String(hier.palet === p.id));
    knop.title = p.naam;
    knop.setAttribute('aria-label', p.naam);
    // Drie tinten uit het palet zelf, zodat het vlakje toont wat je krijgt in
    // plaats van een naam die je moet onthouden. De kleuren staan in style.css
    // per palet; hier zetten we alleen de klasse.
    const vlak = document.createElement('i');
    knop.dataset.palet = p.id;
    knop.append(vlak);
    knop.onclick = () => browser.zetWorkspacePalet(hier.id, p.id);
    return knop;
  }));

  const namen = { stil: 'Stil', rustig: 'Rustig', levendig: 'Levendig' };
  const uitleg = {
    stil: 'De vlekken staan stil',
    rustig: 'Ze schuiven traag langs elkaar',
    levendig: 'En de kleuren verschuiven langzaam van tint',
  };
  document.getElementById('bewegingkiezer').replaceChildren(
    ...(laatsteStaat.bewegingen ?? []).map((b) => {
      const knop = document.createElement('button');
      knop.className = 'beweging';
      knop.type = 'button';
      knop.setAttribute('role', 'radio');
      knop.setAttribute('aria-checked', String((hier.beweging ?? 'rustig') === b));
      knop.textContent = namen[b] ?? b;
      knop.title = uitleg[b] ?? '';
      knop.onclick = () => browser.zetWorkspaceBeweging(hier.id, b);
      return knop;
    }),
  );
}

function tekenSessies() {
  const lijst = laatsteStaat.sessies ?? [];
  const vak = document.getElementById('ws-pop-sessies');
  vak.hidden = lijst.length === 0;
  if (!lijst.length) return;

  const sessielijst = document.getElementById('sessielijst');
  sessielijst.replaceChildren(...lijst.map((s) => {
    const li = document.createElement('li');
    li.className = 'sessie';
    li.dataset.id = s.id;

    const tekst = document.createElement('button');
    tekst.className = 'se-tekst';
    tekst.type = 'button';
    tekst.title = t('ws.terughalenTitel', { naam: s.naam, tabs: tabbladen(s.aantal) });
    const naam = document.createElement('span');
    naam.className = 'se-naam';
    naam.textContent = s.naam;
    const onder = document.createElement('span');
    onder.className = 'se-onder';
    // Waar het over ging is nuttiger dan wanneer je het wegzette. De hosts
    // zeggen in één blik of dit de sessie is die je zoekt.
    onder.textContent = s.hosts.length
      ? t('ws.sessieOnder', { aantal: s.aantal, hosts: s.hosts.join(', ') })
      : tabbladen(s.aantal);
    tekst.append(naam, onder);
    tekst.onclick = () => {
      sluitWorkspacePop();
      browser.haalTerug(s.id);
    };

    const weg = document.createElement('button');
    weg.className = 'se-weg';
    weg.type = 'button';
    const opScherp = sessieGewapend === s.id;
    if (opScherp) weg.dataset.armed = 'true';
    weg.title = t(opScherp ? 'ws.weggooienNogEens' : 'ws.sessieWeg');
    weg.setAttribute('aria-label', weg.title);
    weg.append(icoon(KRUISJE));
    weg.onclick = (e) => {
      e.stopPropagation();
      if (sessieGewapend === s.id) {
        clearTimeout(sessieOntwapenen);
        sessieGewapend = null;
        browser.gooiSessieWeg(s.id);
        return;
      }
      sessieGewapend = s.id;
      clearTimeout(sessieOntwapenen);
      sessieOntwapenen = setTimeout(() => {
        sessieGewapend = null;
        tekenSessies();
      }, 4000);
      tekenSessies();
    };

    li.append(tekst, weg);
    return li;
  }));
}

function popRij(ws, isActive, totaal) {
  const li = document.createElement('li');
  li.className = `wsrij p-${ws.palet ?? 'home'}${ws.prive ? ' prive' : ''}`;
  li.setAttribute('aria-current', String(isActive));
  li.onclick = () => {
    ontwapen();
    sluitWorkspacePop();
    if (!isActive) browser.activateWorkspace(ws.id);
  };

  const stip = document.createElement('span');
  stip.className = 'dot-ws';
  if (ws.prive) stip.append(icoon(SLOTJE));
  li.append(stip);

  if (ws.id === gewapend) {
    const waarschuwing = document.createElement('span');
    waarschuwing.className = 'waarschuwing';
    waarschuwing.textContent = t('ws.nogEens', { aantal: tabbladen(ws.tabCount) });
    li.append(waarschuwing);
  } else {
    const naam = document.createElement('span');
    naam.className = 'naam';
    naam.textContent = ws.name;
    li.append(naam);

    const telling = document.createElement('span');
    telling.className = 'telling';
    telling.textContent = ws.tabCount;
    li.append(telling, knop(POTLOOD, t('ws.naamWijzigen'), (e) => {
      e.stopPropagation();
      hernoem(naam, ws);
    }));
  }

  // De laatste workspace kan niet dicht: een venster zonder workspace bestaat
  // niet, en het hoofdproces weigert dat toch al.
  const sluit = knop(KRUISJE, t(ws.id === gewapend ? 'ws.klikNogEens' : 'ws.sluiten'), (e) => {
    e.stopPropagation();
    sluitWorkspace(ws);
  });
  sluit.disabled = totaal <= 1;
  if (ws.id === gewapend) sluit.dataset.armed = 'true';
  li.append(sluit);

  return li;
}

function knop(pad, titel, bijKlik) {
  const b = document.createElement('button');
  b.className = 'rknop';
  b.type = 'button';
  b.title = titel;
  b.setAttribute('aria-label', titel);
  b.append(icoon(pad));
  b.onclick = bijKlik;
  return b;
}

function hernoem(el, ws) {
  const origineel = el.textContent;
  el.contentEditable = 'plaintext-only';
  el.focus();
  getSelection().selectAllChildren(el);

  const stop = (bewaren) => {
    if (!el.isContentEditable) return;
    el.contentEditable = 'false';
    if (bewaren) browser.renameWorkspace(ws.id, el.textContent);
    else el.textContent = origineel;
  };

  el.onkeydown = (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') {
      e.preventDefault();
      stop(true);
      el.blur();
    } else if (e.key === 'Escape') {
      stop(false);
      el.blur();
    }
  };
  el.onclick = (e) => e.stopPropagation();
  el.onblur = () => stop(true);
}

function sluitWorkspace(ws) {
  if (gewapend === ws.id) {
    ontwapen();
    browser.closeWorkspace(ws.id);
    return;
  }
  gewapend = ws.id;
  clearTimeout(ontwapenen);
  ontwapenen = setTimeout(() => {
    gewapend = null;
    tekenWorkspacePop();
  }, 4000);
  tekenWorkspacePop();
}

document.getElementById('ws-pop-new').onclick = () => {
  sluitWorkspacePop();
  browser.newWorkspace();
};

// Welke weggelegde sessie op scherp staat om weggegooid te worden. Net als bij
// een workspace: één klik bewapent, de tweede doet het.
let sessieGewapend = null;
let sessieOntwapenen = null;

document.getElementById('ws-pop-weg').onclick = async () => {
  sluitWorkspacePop();
  try {
    await browser.legWeg();
  } catch (e) {
    // Een lege workspace valt niet weg te leggen. Dat is geen storing maar een
    // antwoord, dus het hoort in de titel van de knop en niet in een foutmelding.
    document.getElementById('ws-pop-weg').title = String(e.message ?? e);
  }
};

document.getElementById('ws-pop-prive').onclick = () => {
  sluitWorkspacePop();
  browser.newPriveWorkspace();
};

// Buiten het overzicht klikken sluit het. De pagina ligt als native laag over de
// renderer heen, dus een klik dáár bereikt ons nooit; het hoofdproces hoeft dat
// niet te weten, want het overzicht valt binnen de zijbalk.
document.addEventListener('mousedown', (e) => {
  if (wsPop.hidden) return;
  if (wsPop.contains(e.target) || workspaceList.contains(e.target)) return;
  sluitWorkspacePop();
});

// --- overlays ----------------------------------------------------------

// De pagina is een native laag die altijd over deze renderer heen tekent. Een
// overlay is dus alleen zichtbaar als het hoofdproces die laag even wegneemt.
const zetOverlay = (open) => browser.setPaletteOpen(open);

let keuze = 0;

const paletteIsOpen = () => !palette.hidden;

/*
 * De balk heeft twee standen. In 'alles' doet hij wat hij altijd deed en zijn
 * bezochte pagina's er één soort suggestie bij; in 'geschiedenis' gaat hij
 * alleen dáárover, en krijgt elke regel een knop om hem te vergeten. Eén
 * component, twee vullingen — een tweede scherm met een eigen zoekveld en een
 * eigen lijst zou hetzelfde zijn met meer onderdelen.
 */
let paletteModus = 'alles';

function openPalette(begin = '', modus = 'alles') {
  if (!settings.hidden) sluitInstellingen();
  paletteModus = modus;
  palette.hidden = false;
  palette.dataset.modus = modus;
  paletteInput.value = begin;
  paletteInput.placeholder = t(modus === 'geschiedenis' ? 'gesch.plek' : 'cmd.plek');
  keuze = 0;
  wisGeschiedenisWapen();
  tekenResultaten();
  verversGeschiedenis(begin.trim());
  paletteInput.focus();
  paletteInput.select();
  zetOverlay(true);
}

function sluitPalette() {
  palette.hidden = true;
  zetOverlay(false);
}

palette.addEventListener('mousedown', (e) => {
  if (e.target === palette) sluitPalette();
});

paletteInput.addEventListener('input', () => {
  keuze = 0;
  wisGeschiedenisWapen();
  tekenResultaten();
  verversGeschiedenis(paletteInput.value.trim());
});

/* ── Wat je al eens bezocht ──────────────────────────────────────────────
 *
 * Zoeken gebeurt in het hoofdproces: daar staat de lijst, en die is groter dan
 * wat de zijbalk wil vasthouden. Hier ligt alleen het laatste antwoord. De
 * vertraging is er omdat elke aanslag anders een bericht wordt, en het rondje
 * is korter dan de tijd tussen twee letters.
 */
let geschTreffers = [];
let geschKlok = null;
let geschVraag = null;

function verversGeschiedenis(term) {
  clearTimeout(geschKlok);
  geschKlok = setTimeout(async () => {
    const vraag = Symbol('vraag');
    geschVraag = vraag;
    const limiet = paletteModus === 'geschiedenis' ? 120 : 6;
    try {
      const uitslag = await browser.geschiedenis({ term, limiet });
      // Een antwoord op een vraag die inmiddels achterhaald is hoort niet meer
      // getekend te worden; anders knippert de lijst terug bij snel typen.
      if (geschVraag !== vraag) return;
      geschTreffers = uitslag;
      tekenResultaten();
    } catch {
      geschTreffers = [];
    }
  }, 110);
}

/** "Vandaag", "Gisteren", of de datum. Genoeg om je te oriënteren. */
function dagVan(tijd) {
  const toen = new Date(tijd);
  const nu = new Date();
  const dag = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const verschil = Math.round((dag(nu) - dag(toen)) / 86400000);
  if (verschil <= 0) return toen.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
  if (verschil === 1) return t('gesch.gisteren');
  if (verschil < 7) return toen.toLocaleDateString('nl-NL', { weekday: 'long' });
  return toen.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });
}

// De wisknop onderaan de geschiedenis werkt in twee stappen, net als het
// sluiten van een workspace: één klik bewapent, de tweede doet het.
let geschGewapend = false;
let geschOntwapenen = null;

function wisGeschiedenisWapen() {
  geschGewapend = false;
  clearTimeout(geschOntwapenen);
}

paletteInput.addEventListener('keydown', (e) => {
  const items = huidigeResultaten();
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    keuze = Math.min(keuze + 1, items.length - 1);
    tekenResultaten();
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    keuze = Math.max(keuze - 1, 0);
    tekenResultaten();
  } else if (e.key === 'Enter') {
    e.preventDefault();
    kiesResultaat(items[keuze]);
  }
});

function huidigeResultaten() {
  const vraag = paletteInput.value.trim();
  const naam = vraag.toLowerCase();
  const past = (tekst) => !naam || tekst.toLowerCase().includes(naam);

  const bezocht = geschTreffers.map((r) => ({
    soort: 'gesch',
    id: r.id,
    url: r.url,
    label: r.titel || r.url,
    onder: r.url,
    hint: dagVan(r.tijd),
  }));

  if (paletteModus === 'geschiedenis') {
    if (!bezocht.length) {
      return [{ soort: 'leeg', label: t(vraag ? 'gesch.nietsGevonden' : 'gesch.niets'), hint: '' }];
    }
    return [...bezocht, {
      soort: 'gesch-wis',
      label: t(geschGewapend ? 'gesch.nogEens' : 'gesch.wissen'),
      hint: t(geschGewapend ? 'gesch.zekerWeten' : 'gesch.alles'),
    }];
  }

  const tabbladen = laatsteStaat.tabs
    .filter((tab) => past(tab.title + ' ' + tab.url))
    .map((tab) => ({ soort: 'tab', id: tab.id, label: tab.title, hint: t('cmd.tabblad') }));

  const werkruimtes = laatsteStaat.workspaces
    .filter((ws) => ws.id !== laatsteStaat.activeWorkspaceId && past(ws.name))
    .map((ws) => ({ soort: 'ws', id: ws.id, label: ws.name, hint: t('cmd.workspace') }));

  const acties = [];
  if (past('instellingen') || past(t('cmd.instellingen'))) {
    acties.push({ soort: 'instellingen', label: t('cmd.instellingen'), hint: t('cmd.openen') });
  }
  if (past('nieuw venster') || past(t('cmd.nieuwVenster'))) {
    acties.push({ soort: 'venster', label: t('cmd.nieuwVenster'), hint: 'Ctrl N' });
  }
  if (past('venster terug') || past(t('cmd.vensterTerug'))) {
    acties.push({ soort: 'venster-terug', label: t('cmd.vensterTerug'), hint: 'Ctrl ⇧ N' });
  }
  if (huidigeUrl() && (past('favoriet') || past(t('cmd.favoriet', { host: host(huidigeUrl()) })))) {
    acties.push({
      soort: 'favoriet',
      label: t('cmd.favoriet', { host: host(huidigeUrl()) }),
      hint: t('cmd.toevoegen'),
    });
  }

  // Een pagina die al openstaat is een beter antwoord dan dezelfde pagina uit
  // de geschiedenis, dus die komt er onder en niet boven.
  const nogOpen = new Set(laatsteStaat.tabs.map((tab) => tab.url));
  const uitGeschiedenis = bezocht.filter((b) => !nogOpen.has(b.url));

  if (!vraag) return [...tabbladen, ...werkruimtes, ...acties];

  return [
    { soort: 'ga', vraag, label: vraag, hint: t(isAdres(vraag) ? 'cmd.gaNaar' : 'cmd.zoeken') },
    ...tabbladen,
    ...uitGeschiedenis,
    ...werkruimtes,
    ...acties,
  ];
}

function tekenResultaten() {
  const items = huidigeResultaten();
  if (keuze > items.length - 1) keuze = Math.max(0, items.length - 1);

  paletteResults.replaceChildren(
    ...items.map((item, i) => {
      const li = document.createElement('li');
      li.className = `result${item.soort === 'gesch-wis' ? ' wis' : ''}`;
      li.setAttribute('aria-selected', String(i === keuze));

      const fi = document.createElement('span');
      fi.className = 'fi';
      if (item.soort === 'tab') {
        const img = document.createElement('img');
        img.alt = '';
        img.onerror = () => img.removeAttribute('src');
        const favicon = favicons.get(item.id);
        if (favicon) img.src = favicon;
        fi.append(img);
      }

      const label = document.createElement('span');
      label.className = 'label';
      label.textContent = item.label;
      // In de geschiedenis is de titel het antwoord en het adres de
      // bevestiging: twee pagina's met dezelfde titel zijn anders niet uit
      // elkaar te houden.
      if (item.onder && paletteModus === 'geschiedenis') {
        const onder = document.createElement('span');
        onder.className = 'onder';
        onder.textContent = item.onder;
        label.append(onder);
      }

      const hint = document.createElement('span');
      hint.className = 'hint';
      hint.textContent = item.hint;

      li.append(fi, label, hint);

      if (item.soort === 'gesch' && paletteModus === 'geschiedenis') {
        const weg = document.createElement('button');
        weg.className = 'result-weg';
        weg.type = 'button';
        weg.title = t('gesch.vergeet');
        weg.setAttribute('aria-label', weg.title);
        weg.append(icoon(KRUISJE));
        weg.onclick = async (e) => {
          e.stopPropagation();
          await browser.vergeetPagina(item.id);
          geschTreffers = geschTreffers.filter((r) => r.id !== item.id);
          tekenResultaten();
        };
        li.append(weg);
      }
      li.onmousemove = () => {
        if (keuze === i) return;
        keuze = i;
        tekenResultaten();
      };
      li.onclick = () => kiesResultaat(item);
      return li;
    }),
  );
}

async function kiesResultaat(item) {
  if (!item) return;
  if (item.soort === 'leeg') return;

  // Wissen sluit de balk niet: je wilt zien dat de lijst leeg is geworden.
  if (item.soort === 'gesch-wis') {
    if (!geschGewapend) {
      geschGewapend = true;
      clearTimeout(geschOntwapenen);
      geschOntwapenen = setTimeout(() => { geschGewapend = false; tekenResultaten(); }, 4000);
      tekenResultaten();
      return;
    }
    wisGeschiedenisWapen();
    await browser.wisGeschiedenis();
    geschTreffers = [];
    keuze = 0;
    tekenResultaten();
    return;
  }

  sluitPalette();
  if (item.soort === 'gesch') browser.go(item.url);
  else if (item.soort === 'tab') browser.activateTab(item.id);
  else if (item.soort === 'ws') browser.activateWorkspace(item.id);
  else if (item.soort === 'instellingen') openInstellingen();
  else if (item.soort === 'venster') browser.nieuwVenster();
  else if (item.soort === 'venster-terug') browser.heropenVenster();
  else if (item.soort === 'favoriet') {
    const url = huidigeUrl();
    const lijst = [...(prefs.favorieten ?? [])].filter((f) => f.url !== url);
    lijst.unshift({ url, naam: host(url) });
    browser.zetVoorkeur('favorieten', lijst.slice(0, 8));
  } else browser.go(item.vraag);
}

/* ── Het eerste begin ────────────────────────────────────────────────────
 *
 * Eén vraag, en die gaat over de taal van dit scherm zelf. Hij staat er dus
 * meteen in beide talen, en je ziet het antwoord terwijl je kiest: de kop
 * eronder verandert mee. Verder vraagt deze browser bij het starten niets —
 * alles wat hierna komt kan ook later, bij Instellingen.
 */
const welkom = document.getElementById('welkom');

function toonWelkom(aan) {
  if (welkom.hidden !== !aan) welkom.hidden = !aan;
  if (!aan) return;
  const talen = document.getElementById('welkom-talen');
  if (talen.children.length) return;

  // De namen staan hier in hun eigen taal en niet vertaald: "Nederlands" is
  // hoe je het herkent als je geen Engels leest, en andersom.
  talen.replaceChildren(...[['nl', 'Nederlands'], ['en', 'English']].map(([code, naam]) => {
    const knop = document.createElement('button');
    knop.className = 'welkom-taal';
    knop.type = 'button';
    knop.setAttribute('role', 'radio');
    knop.textContent = naam;
    knop.onclick = () => {
      browser.zetVoorkeur('taal', code);
      for (const b of talen.children) b.setAttribute('aria-checked', String(b === knop));
    };
    knop.setAttribute('aria-checked', String(prefs.taal === code));
    return knop;
  }));
}

document.getElementById('welkom-ga').onclick = () => {
  browser.zetVoorkeur('welkomGedaan', true);
  toonWelkom(false);
};

// --- instellingen ------------------------------------------------------

const velden = [...document.querySelectorAll('[data-pref]')];

function vulZoekmachines() {
  const select = document.getElementById('pref-zoekmachine');
  select.replaceChildren(
    ...Object.entries(ZOEKMACHINES).map(([sleutel, machine]) => {
      const optie = document.createElement('option');
      optie.value = sleutel;
      optie.textContent = machine.naam;
      return optie;
    }),
  );
}

/*
 * De taal van dit scherm.
 *
 * 'systeem' wordt hier opgelost en niet in het hoofdproces, want `navigator`
 * kent de taal van de app al en dat scheelt een bericht heen en terug. Een
 * wissel vraagt twee dingen: de vaste tekst opnieuw invullen (dat doet
 * zetTaal) en alles wat uit de stand komt opnieuw tekenen (dat doet
 * tekenAlles) — anders staat de halve zijbalk nog in de oude taal tot er
 * toevallig iets verandert.
 */
function volgTaal(keuze) {
  const gewisseld = zetTaal(keuze === 'systeem' || !keuze ? navigator.language : keuze);
  if (gewisseld && laatsteStaat.tabs) tekenAlles();
  return gewisseld;
}

function toonVoorkeuren(nieuw) {
  prefs = nieuw;
  volgTaal(nieuw.taal);
  toonWelkom(!nieuw.welkomGedaan);

  if (document.activeElement !== notitieVeld && typeof nieuw.notitie === 'string'
      && notitieVeld.value !== nieuw.notitie) {
    notitieVeld.value = nieuw.notitie;
    notitieStand.textContent = nieuw.notitie ? t('paneel.notitieBewaard') : '';
  }
  for (const veld of velden) {
    const waarde = prefs[veld.dataset.pref];
    if (veld.type === 'checkbox') veld.checked = Boolean(waarde);
    else if (waarde !== undefined) veld.value = waarde;
  }
  document.body.classList.toggle('rustig', !prefs.mesh);
  document.body.classList.toggle('geen-sneltoetsen', !prefs.toonSneltoetsen);
  document.getElementById('uitleg-start').textContent =
    prefs.startpagina === 'vorige' ? t('inst.startUitleg') : '';
  tekenAccount();
  tekenVersie();
  tekenFavorieten();
}

/**
 * Wat er over je account te zeggen valt, in de instellingen.
 *
 * Niet aangemeld is hier geen waarschuwing: de app werkt op dit apparaat ook
 * zonder, en dat is een echt antwoord en geen proefperiode.
 */
/**
 * Wat er over de assistent te zeggen valt.
 *
 * Er valt niets op te zetten: staat er een agent op deze computer, dan werkt
 * het. Staat er geen, dan is dat de enige regel die je hier hoeft te lezen.
 */
function tekenAgent() {
  const el = document.getElementById('uitleg-agent');
  if (!el) return;
  const a = laatsteStaat.assistent;
  if (!a?.agent) {
    el.textContent = t('inst.agentGeen');
  } else if (a.aangemeld === false) {
    el.textContent = t('inst.agentNietAan', { agent: a.agent });
  } else {
    el.textContent = t('inst.agentGoed', { naam: a.naam, agent: a.agent });
  }
  tekenSleutel();
}

/*
 * De sleutel, voor zover er iets over te zeggen valt.
 *
 * Het veld toont hem nooit terug. Wat er staat als er een sleutel bewaard is,
 * is de staart van vier tekens: genoeg om te zien wélke sleutel het is, te
 * weinig om er iets mee te kunnen. Zie lib/sleutel.js voor de rest.
 */
function tekenSleutel() {
  const el = document.getElementById('uitleg-sleutel');
  const veld = document.getElementById('sleutel-veld');
  if (!el || !veld) return;
  const stand = laatsteStaat.assistent?.sleutel;
  const rug = laatsteStaat.assistent?.rug;

  if (!stand?.aanwezig) {
    veld.placeholder = 'sk-ant-…';
    el.textContent = t('inst.sleutelGeen');
    return;
  }
  veld.placeholder = t('inst.sleutelStaat', { staart: stand.staart });
  const waar = t(stand.versleuteld ? 'inst.sleutelVeilig' : 'inst.sleutelPlat');
  const nu = t(rug === 'api' ? 'inst.sleutelInGebruik' : 'inst.sleutelAgentVoor');
  el.textContent = `${t('inst.sleutelBewaard', { waar })} ${nu}`;
}

document.getElementById('sleutel-bewaar').onclick = async () => {
  const veld = document.getElementById('sleutel-veld');
  const waarde = veld.value.trim();
  if (!waarde) return;
  await browser.zetSleutel(waarde);
  // Meteen leeg: een sleutel die in een veld blijft staan is een sleutel die
  // iemand over je schouder kan lezen.
  veld.value = '';
};

document.getElementById('sleutel-wis').onclick = async () => {
  document.getElementById('sleutel-veld').value = '';
  await browser.wisSleutel();
};

/*
 * De gereedschapskist op het scherm.
 *
 * Elke rij is één server: zijn naam, wat er gestart wordt, welke stukken mogen,
 * en de namen van zijn omgevingsvariabelen. De waardes staan er niet, en komen
 * ook nooit terug — die zitten in het hoofdproces achter de sleutelbos. Zie
 * lib/kist.js.
 *
 * Het schuifje is de toestemming. Daarom is het een schuifje per server en geen
 * knop die er één keer overheen gaat: de browser kan niet beschrijven wat een
 * vreemde server doet, dus is "deze staat aan" het enige dat eerlijk te zeggen
 * valt — en dat hoort dan wel te blijven staan waar je het kunt zien.
 */
function tekenKist() {
  const lijst = document.getElementById('kist-lijst');
  const leeg = document.getElementById('uitleg-kist-leeg');
  const omgeving = document.getElementById('uitleg-kist-omgeving');
  if (!lijst || !leeg) return;

  const a = laatsteStaat.assistent;
  const rijen = a?.kist ?? [];
  leeg.hidden = rijen.length > 0;

  if (omgeving) {
    omgeving.textContent = a?.kistVersleuteld === false
      ? `${t('inst.kistOmgevingUitleg')} ${t('inst.kistOmgevingPlat')}`
      : t('inst.kistOmgevingUitleg');
  }

  lijst.replaceChildren(...rijen.map((s) => {
    const li = document.createElement('li');
    li.className = 'kistrij';
    if (s.aan) li.classList.add('aan');

    const naam = document.createElement('strong');
    naam.textContent = s.naam;

    const regel = document.createElement('code');
    regel.textContent = s.regel;

    // Twee vakjes en geen samengestelde zin: welke stukken mogen en welke
    // variabelen hij meekrijgt zijn twee verschillende dingen, en op elf pixels
    // lopen ze in één regel aan elkaar vast.
    const onder = document.createElement('span');
    onder.className = 'onder';
    const stukken = document.createElement('span');
    stukken.textContent = s.gereedschap.length ? s.gereedschap.join(' ') : t('inst.kistAlles');
    onder.append(stukken);
    if (s.omgevingNamen.length) {
      const omg = document.createElement('span');
      omg.className = 'omgeving';
      omg.textContent = s.omgevingNamen.join(' ');
      onder.append(omg);
    }

    const schuif = document.createElement('label');
    schuif.className = 'schuif';
    const vink = document.createElement('input');
    vink.type = 'checkbox';
    vink.checked = s.aan;
    vink.setAttribute('aria-label', `${t('inst.kistAanzetten')}: ${s.naam}`);
    vink.onchange = () => browser.kistAan(s.naam, vink.checked);
    const woord = document.createElement('span');
    woord.textContent = t('inst.kistAanUit');
    schuif.append(vink, woord);

    // Geen rode knop: rood is hier de noodstop, en een lijstregel weghalen is
    // niet hetzelfde als een agent midden in zijn werk afbreken.
    const weg = document.createElement('button');
    weg.type = 'button';
    weg.className = 'stil';
    weg.textContent = t('inst.kistWeg');
    weg.onclick = () => browser.kistWeg(s.naam);

    li.append(naam, regel, onder, schuif, weg);
    return li;
  }));

  const el = document.getElementById('uitleg-kist');
  if (!el) return;
  // Wat er nog te zeggen valt: hoeveel er aan staan, en — als er iets aan staat
  // terwijl de API-sleutel de rug is — dat het deze ronde niet meedoet. Stil
  // minder doen dan er op het scherm staat is de ergste variant.
  const delen = [];
  if (rijen.length) {
    delen.push(t('inst.kistToe', { aantal: rijen.filter((s) => s.aan).length, totaal: rijen.length }));
  }
  if (rijen.some((s) => s.aan) && a?.rug === 'api') delen.push(t('inst.kistApiRug'));
  el.textContent = delen.join(' ');
}

document.getElementById('kist-toevoegen').onclick = async () => {
  const naam = document.getElementById('kist-naam');
  const regel = document.getElementById('kist-regel');
  const omgeving = document.getElementById('kist-omgeving');
  const stukken = document.getElementById('kist-gereedschap');
  const uitleg = document.getElementById('uitleg-kist');

  const uit = await browser.kistVoeg({
    naam: naam.value,
    commando: regel.value,
    omgeving: omgeving.value,
    gereedschap: stukken.value,
  });
  if (uit?.fout) {
    // De code komt uit lib/kist.js, de zin hoort hier. Een onbekende code is
    // geen reden om te zwijgen.
    const sleutel = `inst.kistFout${uit.fout.charAt(0).toUpperCase()}${uit.fout.slice(1)}`;
    uitleg.textContent = t(sleutel) === sleutel ? uit.fout : t(sleutel);
    return;
  }
  // Gelukt: de velden leeg, en de omgeving als eerste — daar staat het geheim.
  omgeving.value = '';
  naam.value = '';
  regel.value = '';
  stukken.value = '';
};

for (const id of ['kist-naam', 'kist-regel', 'kist-omgeving', 'kist-gereedschap']) {
  const veld = document.getElementById(id);
  if (!veld) continue;
  veld.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter' && id !== 'kist-omgeving') {
      document.getElementById('kist-toevoegen').click();
    }
  });
}

/**
 * De sneltoetsen in de instellingen.
 *
 * De rijen komen uit de stand en dus uit dezelfde lijst die de toetsen
 * afhandelt. Een browser die zijn sneltoetsen ergens opsomt en ze ergens
 * anders afhandelt, somt vroeg of laat een toets op die niets meer doet.
 */
function tekenToetsen() {
  const lijst = document.getElementById('toetsenlijst');
  const rijen = laatsteStaat.sneltoetsen ?? [];
  if (!lijst || !rijen.length) return;
  lijst.replaceChildren(...rijen.map((r) => {
    const li = document.createElement('li');
    const wat = document.createElement('span');
    wat.className = 'wat';
    wat.textContent = r.wat;
    const kbd = document.createElement('kbd');
    kbd.textContent = r.toets;
    li.append(wat, kbd);
    return li;
  }));
}

/**
 * Welke versie je draait, en of er een nieuwere is.
 *
 * Alle vier de uitkomsten krijgen hun eigen zin. "Kon het niet nakijken" is
 * er daar één van: stilte zou hier betekenen dat je denkt dat je bij bent
 * terwijl er niets gekeken is.
 */
function tekenVersie() {
  const el = document.getElementById('uitleg-versie');
  const stand = document.getElementById('uitleg-update');
  const halen = document.getElementById('update-halen');
  if (!el || !stand || !halen) return;

  el.textContent = laatsteStaat.versie
    ? t('inst.versieNu', { versie: laatsteStaat.versie })
    : '';

  const u = laatsteStaat.update;
  halen.hidden = !(u && u.status === 'nieuw' && u.url);
  halen.onclick = u && u.url ? () => { sluitInstellingen(); browser.newTab(u.url); } : null;

  if (!prefs.updateKijken && !u) stand.textContent = t('inst.updateUit');
  else if (!u) stand.textContent = '';
  else if (u.status === 'nieuw') stand.textContent = t('inst.updateNieuw', { versie: u.versie });
  else if (u.status === 'bij') stand.textContent = t('inst.updateBij');
  else if (u.status === 'uit') stand.textContent = t('inst.updateUit');
  else stand.textContent = t('inst.updateOnbekend');
}

document.getElementById('update-nu').onclick = async (e) => {
  const knop = e.currentTarget;
  knop.disabled = true;
  knop.textContent = t('inst.updateBezig');
  try {
    await browser.kijkUpdate();
  } finally {
    knop.disabled = false;
    knop.textContent = t('inst.updateNu');
  }
};

function tekenAccount() {
  const a = laatsteStaat.account;
  const uitleg = document.getElementById('uitleg-account');
  const knop = document.getElementById('account-knop');
  if (!uitleg || !knop) return;

  if (a?.account && a.wacht) {
    uitleg.textContent = t('inst.accountWacht', { wie: a.email ?? a.naam });
    knop.textContent = t('inst.accountOpenen');
  } else if (a?.account) {
    uitleg.textContent = t('inst.accountAan', { wie: a.email ?? a.naam });
    knop.textContent = t('inst.accountOpenen');
  } else {
    uitleg.textContent = t('inst.accountGeen');
    knop.textContent = t('inst.aanmelden');
  }
}

for (const veld of velden) {
  const gebeurtenis = veld.tagName === 'INPUT' && veld.type === 'text' ? 'input' : 'change';
  veld.addEventListener(gebeurtenis, () => {
    const waarde = veld.type === 'checkbox' ? veld.checked : veld.value;
    browser.zetVoorkeur(veld.dataset.pref, waarde);
  });
  // Anders vangt de overlay Escape af terwijl je in een veld typt.
  veld.addEventListener('keydown', (e) => e.stopPropagation());
}

// Het sleutelveld staat niet in `velden`: wat je daar typt gaat niet naar de
// voorkeuren maar naar een eigen bestand, en pas als je op Bewaren drukt.
document.getElementById('sleutel-veld').addEventListener('keydown', (e) => {
  e.stopPropagation();
  if (e.key === 'Enter') document.getElementById('sleutel-bewaar').click();
});

function openInstellingen() {
  // Opnieuw kijken of er een agent staat: dit scherm open je juist nadat je
  // er een hebt geïnstalleerd.
  browser.zoekAgent();
  if (paletteIsOpen()) sluitPalette();
  settings.hidden = false;
  zetOverlay(true);
  document.getElementById('pref-thema').focus();
}

function sluitInstellingen() {
  settings.hidden = true;
  zetOverlay(false);
}

document.getElementById('settings-close').onclick = () => sluitInstellingen();
document.getElementById('account-knop').onclick = () => {
  sluitInstellingen();
  browser.gaAanmelden();
};

settings.addEventListener('mousedown', (e) => {
  if (e.target === settings) sluitInstellingen();
});

/* Vegen tussen workspaces ------------------------------------------------

   Dezelfde veeg als op een pagina, maar dan hier. In een pagina doet
   renderer/tabblad-preload.js dit; de zijbalk is van onszelf en heeft dat
   omweggetje niet nodig.

   Afvangen in de capture-fase, en nooit preventDefault: knoppen, slepen en
   tekst selecteren blijven doen wat ze deden. Het oordeel zelf valt in het
   hoofdproces, zodat er maar één plek is waar staat wat een veeg is. */
let veegStart = null;

addEventListener('pointerdown', (e) => {
  // De tijd van de gebeurtenis, niet van dit moment: een drukke zijbalk zou
  // anders een zwiep als bedachtzaam slepen tellen. Zie tabblad-preload.js.
  veegStart = e.button === 0 && e.isPrimary
    ? { x: e.screenX, y: e.screenY, t: e.timeStamp || Date.now() }
    : null;
}, true);

addEventListener('pointerup', (e) => {
  const begin = veegStart;
  veegStart = null;
  if (!begin || e.button !== 0) return;
  browser.veeg({
    dx: e.screenX - begin.x,
    dy: e.screenY - begin.y,
    ms: (e.timeStamp || Date.now()) - begin.t,
  });
}, true);

addEventListener('pointercancel', () => { veegStart = null; }, true);

browser.onVoorkeuren(toonVoorkeuren);

vulZoekmachines();
browser.voorkeuren().then(toonVoorkeuren);
