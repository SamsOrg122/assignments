# Tabblad-animaties

Dit document doet twee dingen. Eerst repareert het de reden waarom er op dit
moment geen enkele animatie in de tabbladlijst mogelijk is: `app.js:77` vervangt
de lijst bij elke statusupdate met `replaceChildren()`, en een openstaande pagina
stuurt die updates voortdurend. Daarna beschrijft het de choreografie die daarna
pas kán bestaan.

Het bouwt voort op `ui-systeem.md` §6 (beweging), op `richting-verstilling.md`
§10.1 en §10.2 (de verzoening en het samenvoegen van `pushState`) en op
`richting-instrument.md` §1.1 en §1.2 (verzoenen op id, FLIP met
`Element.animate`). Die stukken herhaal ik niet; waar ik ervan afwijk staat
waarom.

**Eén regel vooraf, want die verklaart de rest van dit document:**

> **CSS voor standen, `Element.animate` voor gebeurtenissen.** Een stand is iets
> wat waar blijft — aangewezen, ingedrukt, actief, ladend — en hoort in een
> `transition`. Een gebeurtenis vindt één keer plaats — een rij komt binnen, een
> gat valt dicht, een titel wisselt, een lijst wisselt van workspace — en heeft
> geen stand om vanaf te transitioneren. Die hoort in `Element.animate`.

---

## 1. Waarom `replaceChildren()` alles kapotmaakt

Kort, want alle drie de richtingen zeggen dit al. De volledigheid zit hem in de
laatste twee regels, die er nog nergens staan:

- Een transitie heeft een beginwaarde nodig op een element dat er al was. Een vers
  element wordt meteen op zijn eindwaarde getekend, dus er is geen intree.
- Een verwijderd element is weg vóór het eerste frame, dus er is geen uittree.
- `:active` overleeft de `mousedown` niet. Er zit een IPC-rondgang plus een
  hertekening tussen jouw klik en het antwoord, en in die tijd is de rij waarop je
  drukt vervangen. Er is dus letterlijk geen bevestiging dat een klik geland is.
- Focus verdwijnt, en met focus een halfgetypte workspacenaam.
- `maakGlyph()` start per hertekening een nieuwe `requestAnimationFrame`-lus, die
  zichzelf pas na drie frames opruimt (`glyph.js:76-78`). De stand `klaar` — de
  enige eenmalige animatie in dat bestand — begint bij elke `pushState` opnieuw en
  staat daardoor als een eeuwige puls in beeld: hij vertelt het tegenovergestelde
  van wat hij bedoelt.
- **Er is geen manier om te weten wat er veranderd is.** De renderer krijgt een
  lijst en tekent hem. Choreografie begint bij het verschil tussen twee standen,
  en dat verschil bestaat nu nergens.
- **Elke lopende animatie is fase-loos.** `@keyframes kloppen` op `.tab .bezig`
  springt bij elke update terug naar frame 0, en dat geldt voor alles wat er ooit
  bij komt.

De fase-truc uit `ui-systeem.md` §6.4 (`--fase` met een negatieve
`animation-delay`) repareert alleen het laatste punt, en alleen voor animaties die
zichzelf herhalen. De rest heeft een element nodig dat blijft bestaan.

---

## 2. De verzoening

### 2.1 Het model

Eén `Map` van tabblad-id naar een klein object met de elementen van die rij en de
laatst getekende stand. `nextId` loopt per venster op en wordt nooit hergebruikt
(`main.js:84`), dus het id is een veilige sleutel: er komt nooit een nieuw tabblad
met het id van een oud.

```js
// --- de tabbladlijst verzoenen ----------------------------------------
//
// Het hoofdproces stuurt de volledige lijst, en zes webContents-events per
// tabblad voeden die. Wij vervangen die lijst niet maar leggen hem naast wat er
// staat. Dat is geen snelheidsoptimalisatie: het is de voorwaarde waaronder
// beweging in deze lijst überhaupt kan bestaan. Een rij die blijft bestaan kan
// aanwijzen, indrukken, focus en een lopende animatie overleven.
/** @type {Map<number, Rij>} */
const rijen = new Map();

// Rij = { li, merk, titel, eigenaar, sluit, glyph, hand, titelTekst, laadt,
//         adem, flip }
```

### 2.2 De handtekening: nul werk als er niets verandert

Dit is de toevoeging die geen van de drie richtingen heeft, en hij is bij twintig
tabbladen het verschil tussen "verzoenen is goedkoper" en "verzoenen kost bijna
niets".

```js
// Alles wat een rij laat zien, in één string. Bij een statusupdate waarin aan
// deze rij niets veranderde — en dat is verreweg de meeste updates, want
// did-navigate-in-page vuurt bij elke history-push van elke openstaande SPA —
// kost de rij precies één stringvergelijking en nul DOM-schrijfacties.
// Een regelinvoer als scheider: die kan niet in een titel of een URL zitten,
// dus twee verschillende standen kunnen nooit dezelfde handtekening opleveren.
function handtekening(tab, actief) {
  return [tab.title, tab.url, tab.owner, tab.modus, tab.loading, tab.leeg, actief]
    .join('\n');
}
```

`classList.toggle(x, bool)` en `setAttribute` zijn idempotent, dus zonder deze
controle zou het ook wérken — maar dan doet elke rij bij elke update zes DOM-
aanroepen die niets veranderen. Met de handtekening doet een rustige lijst niets.

### 2.3 De verzoening zelf

```js
let vorigeVolgorde = '';
let vorigActiveId = null;
let vorigeWorkspace = null;
let vorigeWorkspaceIndex = 0;
let eersteVulling = true;

function verzoen(staat) {
  const { tabs, activeId, activeWorkspaceId } = staat;

  const volgorde = tabs.map((t) => t.id).join(',');
  const wisselt = vorigeWorkspace !== null && activeWorkspaceId !== vorigeWorkspace;

  // Alleen als de samenstelling of de volgorde wijzigt kan er iets verschuiven.
  // Bij elke andere update meten we niets op en animeren we niets. Dat scheelt
  // twee geforceerde layouts per statusupdate, en een drukke SPA levert er
  // tientallen per seconde aan.
  const structuur = volgorde !== vorigeVolgorde;
  const vooraf = structuur && !wisselt ? meet() : null;

  // Meer dan een handvol nieuwe rijen tegelijk is geen intree meer maar een
  // golf. Sessieherstel en een workspacewissel leveren precies die situatie op.
  const nieuw = tabs.reduce((n, t) => n + (rijen.has(t.id) ? 0 : 1), 0);
  const magIntree = !eersteVulling && !wisselt && nieuw <= 4;

  if (wisselt) sluitGaten(false);

  const gezien = new Set();
  let vorige = null;

  for (const tab of tabs) {
    let rij = rijen.get(tab.id);
    if (!rij) {
      rij = maakRij(tab);
      rijen.set(tab.id, rij);
      // Precies één keer, want een rij ontstaat precies één keer.
      if (magIntree) beweeg(rij.li, INTREE, { duration: DUUR_RIJ, easing: ZACHT });
    }
    werkBij(rij, tab, tab.id === activeId);

    // insertBefore verplaatst alleen wat werkelijk verkeerd staat. append() zou
    // elke rij elke ronde verplaatsen, en een verplaatste node verliest focus en
    // :active — precies wat we hier aan het repareren zijn.
    const anker = volgendeRij(vorige ? vorige.nextSibling : tablist.firstChild);
    if (rij.li !== anker) tablist.insertBefore(rij.li, anker);
    vorige = rij.li;
    gezien.add(tab.id);
  }

  for (const [id, rij] of rijen) {
    if (gezien.has(id)) continue;
    rijen.delete(id);
    // De tekenlus hangt aan dit canvas. Hem expliciet stoppen is zekerder dan
    // wachten tot hij zelf merkt dat hij losgekoppeld is, en het scheelt drie
    // frames tekenen aan iets wat niemand meer ziet.
    rij.glyph?.stop();
    rij.adem?.cancel();
    if (muisBoven && !wisselt) vervangDoorGat(rij.li);
    else rij.li.remove();
  }

  if (activeId !== vorigActiveId) {
    // Alleen bij een echte wisseling scrollen. Bij elke pushState scrollen zou
    // de lijst onder je muis vandaan trekken terwijl er ergens een pagina laadt.
    rijen.get(activeId)?.li.scrollIntoView({ block: 'nearest' });
  }

  if (vooraf) schuifDicht(vooraf);
  zetPlaat(activeId);
  if (wisselt) wisselIn(staat);

  vorigeVolgorde = volgorde;
  vorigActiveId = activeId;
  vorigeWorkspace = activeWorkspaceId;
  vorigeWorkspaceIndex = staat.workspaces.findIndex((w) => w.id === activeWorkspaceId);
  eersteVulling = false;
}
```

Twee dingen aan de ankerlus die de moeite van het benoemen waard zijn.

**Waarom `insertBefore` en niet `append`.** `richting-instrument.md` §1.1 gebruikt
`tablist.append(rij.li)` voor elke rij. `append` op een node die al in de DOM zit
is een verwijdering plus een invoeging, dus dat verplaatst alle twintig rijen bij
elke ronde. Een verplaatste node verliest focus en `:active`. De ankervariant van
`richting-verstilling.md` §10.1 raakt alleen aan wat werkelijk verkeerd staat, en
in de praktijk staat er meestal niets verkeerd: `createTab` zet nieuwe tabbladen
achteraan in de `Map` (`main.js:400`), dus de volgorde wijzigt alleen bij
toevoegen en verwijderen.

**Waarom `volgendeRij`.** Er staan straks twee soorten niet-rijen tussen de rijen:
de plaat (§5.3) en de gaten (§5.2). Die horen niet bij de volgorde.

```js
// De plaat en de gaten staan tussen de rijen maar horen niet bij de volgorde.
// De nodeType-controle omdat firstChild een tekstknoop kan zijn zodra iemand
// ooit witruimte in index.html zet.
function volgendeRij(node) {
  while (node && (node.nodeType !== 1 || !node.classList.contains('tab'))) {
    node = node.nextSibling;
  }
  return node;
}
```

### 2.4 Een rij maken, en een rij bijwerken

```js
function maakRij(tab) {
  const li = document.createElement('li');
  li.className = 'tab';
  li.dataset.id = tab.id;
  // Een stabiel id, want aria-activedescendant verwijst ernaar (§9). Met
  // replaceChildren was dat onmogelijk: het id wees elke ronde naar een node
  // die niet meer bestond.
  li.id = `tab-${tab.id}`;
  li.setAttribute('role', 'option');
  li.setAttribute('aria-selected', 'false');
  li.onclick = () => { browser.activateTab(tab.id); addressIsDirty = false; };

  const eigenaar = document.createElement('span');
  eigenaar.className = 'eigenaar';

  const titel = document.createElement('span');
  titel.className = 'titel';

  const sluit = document.createElement('button');
  sluit.className = 'sluit';
  sluit.type = 'button';
  sluit.setAttribute('aria-label', 'Tabblad sluiten');
  sluit.append(icoon(KRUISJE));
  sluit.onclick = (e) => {
    e.stopPropagation();
    favicons.delete(tab.id);
    browser.closeTab(tab.id);
  };

  const rij = { li, titel, eigenaar, sluit, merk: null, glyph: null, hand: null,
                titelTekst: undefined, laadt: false, adem: null, flip: null };
  zetMerk(rij, tab);
  li.append(rij.merk, eigenaar, titel, sluit);
  return rij;
}

function werkBij(rij, tab, actief) {
  const hand = handtekening(tab, actief);
  if (rij.hand === hand) return;
  rij.hand = hand;

  zetMerk(rij, tab);
  rij.li.classList.toggle('ladend', tab.loading);
  rij.li.classList.toggle('agent', Boolean(tab.owner));
  rij.li.setAttribute('aria-selected', String(actief));
  rij.li.title = tab.leeg ? 'Nieuw tabblad' : `${tab.title}\n${tab.url}`;
  rij.eigenaar.textContent = tab.owner ?? '';

  zetTitel(rij, tab.leeg ? 'Nieuw tabblad' : tab.title);

  // De glyph bestaat één keer per rij en houdt zijn eigen tekenlus.
  rij.glyph?.zet(tab.modus ?? 'rust');

  zetAdem(rij, tab.loading);
}
```

`aria-selected` en niet `aria-current`: de lijst wordt een `role="listbox"` (§9),
en daarin is `aria-selected` de voorgeschreven stand. Alle selectors die in
`richting-verstilling.md` §6 `[aria-current="true"]` heten, heten hier
`[aria-selected="true"]`. Eén attribuut dat zowel de toegankelijkheidsstand als de
opmaak draagt; twee zou uiteen gaan lopen.

**Het merk wisselt van soort.** Als `stopAgent(false)` de eigenaar op `null` zet
(`main.js:600`), wordt een assistententabblad een gewoon tabblad — canvas wordt
afbeelding. Dat is de enige structurele wijziging binnen een rij:

```js
// Een assistent draagt zijn glyph, een gewoon tabblad zijn favicon. Alleen als
// de sóórt wisselt vervangen we het element; bij elke update vervangen zou ons
// terugbrengen waar we vandaan komen.
function zetMerk(rij, tab) {
  const wil = tab.owner ? 'canvas' : 'img';
  if (rij.merk?.localName === wil) return;

  rij.glyph?.stop();
  rij.glyph = null;
  rij.adem?.cancel();
  rij.adem = null;
  rij.laadt = false;

  const el = document.createElement(wil);
  el.className = 'merk';
  if (wil === 'canvas') {
    el.setAttribute('aria-hidden', 'true');
    rij.glyph = maakGlyph(el, { n: 3, zijde: 16 });
    rij.glyph.zet(tab.modus ?? 'rust');
  } else {
    el.alt = '';
    // Een 404 op een favicon-URL levert nu het gebroken-afbeeldingicoon op; in
    // een lijst van twintig rijen zijn dat er zomaar drie die er de hele dag
    // staan. Het attribuut weghalen zet bovendien de :not([src])-selector van
    // het ademende laadvakje weer aan.
    el.onerror = () => el.removeAttribute('src');
    const favicon = favicons.get(tab.id);
    if (favicon) el.src = favicon;
  }
  rij.merk?.replaceWith(el);
  rij.merk = el;
}
```

### 2.5 Wat er in `main.js` bij hoort

Ongewijzigd overgenomen uit `richting-verstilling.md` §10.2 en
`richting-instrument.md` §1.3: `pushState()` samenvoegen per tick met
`setImmediate`. De verzoening maakt een hertekening onschadelijk, maar het
serialiseren van alle tabbladen én alle workspaces bij elke history-push van een
SPA blijft zonde. Eén stand per tick is precies zo waar.

**Er is voor dit hele document geen nieuw IPC-kanaal nodig.** Alles wat de
choreografie moet weten staat al in de payload van `tabs:state`: welke ids er
weg zijn, welke erbij, welke actief is, en welke workspace actief is. Dat is een
resultaat en geen toeval — de renderer leidt het verschil af uit twee opeenvolgende
standen, en dat is precies wat verzoenen betekent.

### 2.6 Wat het kost

| Situatie | Kosten |
| --- | --- |
| Statusupdate zonder structuurwijziging (verreweg de meeste) | 20 stringvergelijkingen. Nul DOM-schrijfacties, nul metingen, nul geforceerde layouts, nul animaties. |
| Statusupdate mét structuurwijziging | 2 geforceerde layouts (één meting vooraf, één achteraf), ≤ N gecomposite `transform`-animaties, 1 CSS-transitie op de plaat. |
| Doorlopend | 1 rAF-lus per assistent die niet in rust staat. 1 opacity-animatie per ladend tabblad, allemaal op dezelfde klok. Verder niets. |

Ter vergelijking met wat er nu staat: 20 `<li>`-elementen bouwen, 20 canvassen
aanmaken en 20 rAF-lussen starten per statusupdate, plus een volledige
herberekening van de layout van de kolom.

---

## 3. Wanneer er überhaupt iets mag bewegen

Eén drempel, en hij zit vóór alles:

```js
const structuur = volgorde !== vorigeVolgorde;
```

Verandert de samenstelling of de volgorde van de ids niet, dan verschuift er
niets, dus meten we niets en animeren we niets. Dit is de belangrijkste regel van
dit document en tegelijk de goedkoopste. `richting-instrument.md` §1.2 meet bij
elke verzoening alle rijen op met `getBoundingClientRect()`; bij een openstaande
SPA zijn dat twee geforceerde layouts per statusupdate, tientallen keren per
seconde, terwijl er in negenennegentig van de honderd gevallen niets te animeren
valt.

---

## 4. De tokens die dit document toevoegt

```css
:root {
  /* Een rij die binnenkomt, een gat dat dichtvalt, de plaat die verhuist. Dit
     is het enige getal in dit document dat op meer dan één plek staat, en dat
     is opzet: die drie bewegingen horen exact even lang te duren. */
  --duur-rij: 160ms;
  /* De tabbladlijst die van workspace wisselt. Eén beweging op de container. */
  --duur-wissel: 200ms;
}
```

`--ease-zacht` komt woordelijk uit `richting-materiaal.md` §7.1 (ζ = 0.90,
ω₀ = 26, bemonsterd op 12 punten) en is de enige curve in dit document.
`--ease-veer` uit datzelfde hoofdstuk komt hier niet in voor: 4,6% doorschot op
een rij in een lijst waarin je leest is precies waar `ui-systeem.md` §6.2 voor
waarschuwt.

Twee opmerkingen bij het gebruik.

**De curve is een vorm, de duur staat los.** `--ease-zacht` is uitgerekend voor
280ms; hem op 160ms toepassen comprimeert de vorm en verandert niets aan het
karakter. Het restdoorschot van 0,1% bij 91,7% is op een verplaatsing van 32px
0,03 pixel, dus niet bestaand.

**Eén curve voor alles wat verschuift, en dat is een eis en geen voorkeur.** De
plaat verhuist via een CSS-transitie en de rij eronder via `Element.animate`. Die
twee moeten dezelfde duur én dezelfde curve hebben, anders lopen ze tijdens
dezelfde beweging zichtbaar uit elkaar. Om te voorkomen dat ze uit elkaar groeien
lezen we ze allebei uit dezelfde bron:

```js
// Element.animate accepteert geen var(), maar wel de uitgeschreven waarde die
// we uit de stylesheet lezen. Eén bron, net als bij de modus-kleuren in
// richting-materiaal §2.6. Zonder dit lopen de plaat (CSS-transitie) en de rij
// eronder (FLIP via Element.animate) tijdens dezelfde beweging uit elkaar.
const stijl = getComputedStyle(document.documentElement);
const ZACHT = stijl.getPropertyValue('--ease-zacht').trim() || 'ease-out';
const DUUR_RIJ = parseFloat(stijl.getPropertyValue('--duur-rij')) || 160;
const DUUR_WISSEL = parseFloat(stijl.getPropertyValue('--duur-wissel')) || 200;
```

En één doorgeefluik voor beweging-uit, want het blok voor
`prefers-reduced-motion` in `style.css` raakt alleen CSS:

```js
// Een animatie die via Element.animate loopt trekt zich niets aan van het
// media-blok in style.css. Eén plek waar dat afgevangen wordt, zodat niemand
// het ergens vergeet.
const rustig = matchMedia('(prefers-reduced-motion: reduce)');
function beweeg(el, keyframes, opties) {
  if (rustig.matches) return null;
  return el.animate(keyframes, opties);
}
```

---

## 5. De choreografie

### 5.1 Een tabblad dat verschijnt

Een nieuw tabblad landt altijd onderaan de lijst: `createTab` doet
`ws.tabs.set(id, view)` en een `Map` bewaart invoegvolgorde. `#tablist` is
`flex: 1` in een flexkolom, dus de lijst heeft een vaste hoogte en een rij erbij
duwt niets weg. **Er is dus geen hoogte om te animeren bij een intree**, en dat
is geen tekortkoming maar een geschenk: de intree kan puur `opacity` en
`transform` zijn en kan de kolom niet laten schokken.

```js
// Van links, niet van boven. Een nieuw tabblad komt onderaan de lijst binnen en
// er is boven hem niets bewogen; naar beneden inschuiven zou suggereren dat hij
// uit de rij erboven komt. Van links is de richting waarin de zijbalk zelf
// leest, en zegt 'hier is iets bij gekomen' zonder een herkomst te verzinnen.
const INTREE = [
  { opacity: 0, transform: 'translateX(-6px)' },
  { opacity: 1, transform: 'none' },
];
```

160ms, `--ease-zacht`. Niet bij de eerste vulling, niet bij een workspacewissel,
en niet als er meer dan vier rijen tegelijk bij komen — zie de `magIntree`-regel
in §2.3.

### 5.2 Een tabblad dat verdwijnt, en het gat dat dichtvalt

**De rij zelf heeft geen uittree.** Je hebt op sluiten geklikt; de rij is weg, in
hetzelfde frame. Een rij die nog 90ms staat te vervagen terwijl het tabblad al
gesloten is, liegt over de toestand van de app. Dat is de regel uit
`richting-instrument.md` §1.2 en die staat.

Wat de opdracht "inclusief de hoogte die dicht valt" vraagt, zit niet in de rij
die weggaat maar in de rijen eronder. Die schuiven omhoog, en dat is het gat dat
dichtvalt.

```js
// Contentruimte, niet vensterruimte. rect.top verschuift ook als de lijst
// scrolt, en scrollen is geen verplaatsing die we willen animeren; scrollTop
// erbij optellen haalt dat eruit. rect.top telt wél een lópende FLIP mee, en
// dat is precies wat we willen: een onderbroken verplaatsing gaat verder waar
// hij was in plaats van te springen.
function meet() {
  const s = tablist.scrollTop;
  const kaart = new Map();
  for (const [id, rij] of rijen) {
    kaart.set(id, rij.li.getBoundingClientRect().top + s);
  }
  return kaart;
}

function schuifDicht(vooraf) {
  if (rustig.matches) return;
  // Eerst álle lopende verplaatsingen weg, dán meten. Anders meet de tweede
  // meting de transform van de eerste mee en klopt het verschil niet.
  for (const rij of rijen.values()) {
    rij.flip?.cancel();
    rij.flip = null;
  }
  const s = tablist.scrollTop;
  for (const [id, rij] of rijen) {
    const was = vooraf.get(id);
    if (was === undefined) continue; // nieuw; die komt binnen met zijn eigen intree
    const verschil = was - (rij.li.getBoundingClientRect().top + s);
    if (Math.abs(verschil) < 1) continue;
    rij.flip = rij.li.animate(
      [{ transform: `translateY(${verschil}px)` }, { transform: 'none' }],
      { duration: DUUR_RIJ, easing: ZACHT },
    );
  }
}
```

Drie dingen die hier anders zijn dan in `richting-instrument.md` §1.2, met de
reden erbij:

1. **`+ scrollTop`.** Zonder dat vecht de FLIP met `scrollIntoView`. Sluit je een
   tabblad boven het actieve terwijl de lijst gescrold staat, dan verandert de
   scrollpositie én de rijvolgorde, en meet de kale `rect.top` allebei door elkaar
   heen. Het gevolg is dat de hele lijst wegschiet in plaats van dat één gat
   dichtvalt.
2. **Eerst annuleren, dan meten.** Zonder dat is een tweede sluiting binnen 160ms
   een sprong: de nieuwe startpositie zou de transform van de vorige meetellen.
3. **De handgreep bewaren in `rij.flip`.** Twee overlappende `animate()`-aanroepen
   op dezelfde eigenschap laten allebei doorlopen; de laatste wint, maar de eerste
   blijft resources kosten. Bij twintig rijen die snel achter elkaar sluiten is dat
   het begin van het kaartenhuis.

**Een uitgewerkt geval, want het is het bewijs dat het mechanisme klopt.** Je hebt
tien tabbladen en sluit het actieve, nummer vijf. `closeTab` kiest de opvolger
(`order[index + 1]`, `main.js:474`), dus zes wordt actief. Rijen zes tot en met
tien schuiven één rijhoogte omhoog. De plaat (§5.3) staat op de positie van rij
vijf, en de nieuwe actieve rij komt precies dáár terecht: de plaat verroert zich
niet en de opvolger schuift eronder. Sluit je het laatste tabblad, dan kiest
`closeTab` de voorganger, beweegt er niets onder de plaat en verhuist de plaat één
rij omhoog. Beide gevallen komen uit dezelfde twee regels code en allebei zien ze
eruit zoals ze horen.

**Opruimen bij twintig tabbladen.** Eén extra ingreep, en het is de enige plek in
dit document waar ik een echte gedragskeuze maak in plaats van een technische:

```js
// Sluit je vijf tabbladen achter elkaar weg, dan schuift bij elke klik de rij
// eronder onder je cursor door, en sluit je uiteindelijk iets wat je niet
// bedoelde. Zolang de muis boven de lijst hangt houden we het gat open; zodra
// hij weg is valt alles in één beweging dicht. Chrome doet dit in zijn tabstrip,
// Safari niet — dit is dus een keuze en geen conventie.
let muisBoven = false;
tablist.addEventListener('mouseenter', () => { muisBoven = true; });
tablist.addEventListener('mouseleave', () => { muisBoven = false; sluitGaten(true); });
addEventListener('blur', () => { muisBoven = false; sluitGaten(true); });

function vervangDoorGat(li) {
  const gat = document.createElement('div');
  gat.className = 'gat';
  gat.setAttribute('aria-hidden', 'true');
  tablist.insertBefore(gat, li);
  li.remove();
}

function sluitGaten(metBeweging) {
  const gaten = tablist.querySelectorAll('.gat');
  if (!gaten.length) return;
  const vooraf = metBeweging ? meet() : null;
  for (const gat of gaten) gat.remove();
  if (vooraf) schuifDicht(vooraf);
  // De plaat hangt aan offsetTop van de actieve rij, en die is net verschoven.
  zetPlaat(vorigActiveId);
}
```

```css
/* Geen inhoud, geen rand, geen muisdoel: alleen de hoogte van de rij die hier
   stond, tot de muis de lijst verlaat. flex: none omdat #tablist een flexkolom
   is en een leeg blok anders tot nul krimpt. */
.gat { height: var(--rij); flex: none; pointer-events: none; }
```

Dit werkt alleen zolang de gaten precies de hoogte van een rij hebben, dus alleen
zolang `#tablist` geen `gap` heeft — wat `richting-verstilling.md` §6 sowieso al
voorschrijft ("rijen die elkaar raken lezen als één kolom"). Blijft de `gap: 2px`
uit `style.css:238` staan, dan wordt het `calc(var(--rij) + 2px)` en is dat een
tweede plek waar dezelfde afstand staat.

**Dit is de enige stap in dit document die je kunt overslaan.** Zonder de gaten
valt elk gat meteen dicht in 160ms en werkt alles verder precies hetzelfde.

### 5.3 De nadruk verhuist: de plaat

Het actieve tabblad is nu een achtergrond op een rij. Bij een wisseling betekent
dat: de oude rij dooft in 120ms uit en de nieuwe licht in 120ms op, dus er staan
120ms lang **twee half opgelichte rijen** in de kolom. Dat is precies de
mededeling die je niet wilt — de vraag is "waar ben ik", en het antwoord is even
"op twee plekken tegelijk".

De verzoening maakt de goede oplossing ineens goedkoop. Er is per definitie
precies één actief tabblad, dus precies één verheven vlak, dus dat vlak kan een
eigen element zijn dat verhuist.

```html
<ol id="tablist" role="listbox" aria-label="Tabbladen" tabindex="0">
  <div id="plaat" aria-hidden="true"></div>
</ol>
```

```css
#tablist { position: relative; }

/* Het enige verheven vlak in de app, en nu ook letterlijk één element. Twee
   voordelen tegelijk: de nadruk verhuist als één object in plaats van dat er
   even twee rijen oplichten, en het dure randje uit richting-materiaal §2.3
   (het pseudo-element met mask-composite) bestaat gegarandeerd één keer in de
   hele app in plaats van één keer per rij. */
#plaat {
  position: absolute;
  top: 0;
  left: 0;
  z-index: 0;
  width: 100%;
  height: var(--rij);
  border-radius: var(--radius-rij);
  background-color: var(--fill-active);
  background-image: var(--glas-vlak);
  box-shadow: var(--plaat-schaduw);
  /* De rij eronder vangt de klik, niet de plaat. */
  pointer-events: none;
  transition: transform var(--duur-rij) var(--ease-zacht);
}

#plaat[hidden] { display: none; }

/* Een sprong over meer dan vier rijen is geen verplaatsing meer maar een streep
   in je ooghoek. Dan zet hij zich neer in plaats van te reizen. */
#plaat.spring { transition: none; }

/* De rijen liggen erbovenop: de plaat is hun ondergrond, niet hun buurman. */
.tab { position: relative; z-index: 1; }

/* De actieve rij tekent zijn eigen vlak niet meer. Wat overblijft is wat aan de
   rij zelf hangt: kleur, gewicht, en de indruk. */
.tab[aria-selected="true"] { color: var(--text); }
.tab[aria-selected="true"] .titel { font-weight: 500; }
/* Zonder dit zou de hovervulling ván de rij bóvenop de plaat komen te liggen en
   de actieve rij bij aanwijzen lichter maken dan hij is. */
.tab[aria-selected="true"]:hover { background-color: transparent; }
```

```js
let plaatY = null;

function zetPlaat(activeId) {
  const rij = rijen.get(activeId);
  plaat.hidden = !rij;
  if (!rij) { plaatY = null; return; }

  // offsetTop en niet rect.top: dit is contentruimte, dus hij verandert niet als
  // de lijst scrolt. De plaat staat ín de scroller en scrolt dus vanzelf mee.
  const y = rij.li.offsetTop;
  if (y === plaatY) return;

  const eerste = plaatY === null;
  const sprong = !eerste && Math.abs(y - plaatY) > 4 * rij.li.offsetHeight;

  if (eerste || sprong || rustig.matches) {
    plaat.classList.add('spring');
    plaat.style.transform = `translateY(${y}px)`;
    // Dwingt de browser deze stand vast te leggen vóórdat de klasse eraf gaat;
    // anders ziet hij alleen het eindresultaat en transitioneert hij alsnog.
    void plaat.offsetHeight;
    plaat.classList.remove('spring');
    if (sprong) beweeg(plaat, [{ opacity: 0.4 }, { opacity: 1 }], { duration: 140, easing: ZACHT });
  } else {
    plaat.style.transform = `translateY(${y}px)`;
  }
  plaatY = y;
}
```

**Waarom de afstandsdrempel.** Binnen vier rijen kun je een object volgen. Daarbuiten
is een vlak dat 480 pixels doorkruist geen verplaatsing meer maar een veeg in je
ooghoek, en dat is precies wat over een werkdag gaat storen. Een sprong vanuit de
commandobalk naar een tabblad ergens onderaan hoort een sprong te zíjn. Hij komt
niet als niets op: 140ms van 40% naar volle dekking zegt "hij staat nu hier".

**Wat níét meebeweegt.** `font-weight` van 400 naar 500 klapt om. Gewicht
interpoleren kán met een variabele snede, maar dat verandert de tekstbreedte bij
elk frame en dus de layout — verboden door `ui-systeem.md` §6.3, en bij twintig
rijen ook echt zichtbaar. Het gewicht klapt om op het moment van de klik, dus
vóórdat de plaat gearriveerd is. Dat is goed: het gewicht is je bevestiging dat de
klik geland is, de plaat is de verhuizing.

**Waarom dit geen laagje extra kost.** De plaat vervangt vier declaraties op
`.tab[aria-selected="true"]` door één element dat er altijd is. De duurste
onderdelen — de glans, het randje, de schaduw — worden van twintig mogelijke
instanties teruggebracht naar één werkelijke instantie, voor de hele levensduur
van het venster.

**Herbruikbaar.** Zodra de workspace-strip een lijst wordt
(`richting-verstilling.md` §7), heeft die exact hetzelfde probleem. Maak er dus
een fabriekje van (`maakPlaat(container)`) in plaats van één globale `plaat`; het
is dezelfde twintig regels.

### 5.4 Wisselen van workspace

De hele lijst is een andere lijst: andere sessie, andere cookies, andere wereld.
`nextId` loopt per venster op over alle workspaces heen, dus geen enkel id keert
terug — de verzoening zou naïef álle rijen verwijderen en álle rijen toevoegen.
Twintig gelijktijdige intrees zijn geen intree maar ruis.

Dus: één beweging op de container, niet twintig op de rijen.

```js
// De oude rijen gaan in één frame weg. Dat is geen luiheid maar
// gelijkloop: de pagina wisselt via setVisible() ook zonder overgang, en een
// zijbalk die 200ms staat uit te faden boven een pagina die al gewisseld is,
// loopt uit de pas met precies het ding waar hij bij hoort. Wat je wél voelt is
// dat de nieuwe lijst binnenkomt, en uit de richting van de workspace die je
// koos: naar een latere workspace komt hij van rechts.
function wisselIn(staat) {
  const nu = staat.workspaces.findIndex((w) => w.id === staat.activeWorkspaceId);
  const richting = nu >= vorigeWorkspaceIndex ? 1 : -1;
  for (const a of tablist.getAnimations()) a.cancel();
  beweeg(
    tablist,
    [{ opacity: 0, transform: `translateX(${richting * 12}px)` },
     { opacity: 1, transform: 'none' }],
    { duration: DUUR_WISSEL, easing: ZACHT },
  );
}
```

**Overwogen en niet gedaan: een verschuiving per rij.** 20ms verschuiving over
twintig rijen is een golf van 400ms, en dan duurt elke workspacewissel bijna een
halve seconde voordat de kolom stilstaat. Met drie workspaces wissel je tientallen
keren per dag. Eén blok, één beweging.

**Overwogen en niet gedaan: de kleur van de workspace even door de lijst laten
trekken.** Dat is decoratie met een aflezing die je al hebt (de actieve rij in de
voet), en de jury heeft gekleurde signalen per rij al afgewezen.

**Let op:** dit animeert `opacity` en `transform` op de scroll-container, wat hem
200ms lang promoveert tot een eigen laag. Dat is bij een zeldzame, door de
gebruiker uitgelokte gebeurtenis prima, maar als `#tablist` ook nog een
`mask-image` draagt (het scrollverloop uit `richting-verstilling.md` §6) staan er
200ms lang drie dure eigenschappen op hetzelfde element. Zie §7.

### 5.5 Laden, en de overgang van laden naar klaar

**De titel blijft staan.** `Laden…` gooit de enige informatie weg die de rij
heeft, en omdat `did-navigate-in-page` bij elke history-push vuurt zou de regel
voortdurend heen en weer wisselen tussen een leesbare titel en grijze tekst. Dit
staat al zo in beide overgebleven richtingen.

Wat de laadstand zegt, zegt hij op twee manieren tegelijk — één stil, één in
beweging:

```css
/* Stil: één trede zachter. Zo is 'ladend' ook afleesbaar met beweging uit, en
   met opacity in plaats van een kleur werkt het in alle vier de combinaties
   (rust, aanwijzen, actief, assistent) zonder vier regels. */
.tab.ladend .titel { opacity: 0.72; }
.tab .titel { transition: opacity var(--duur-vlak) var(--ease-zacht); }

/* Nog geen favicon: een vakje in plaats van een gat. De beweging erop komt uit
   JS (zie hieronder), want een oneindige CSS-animatie kun je niet netjes laten
   eindigen. */
.tab.ladend .merk:not([src]) { background-color: var(--skelet); border-radius: 4px; }
```

En de beweging:

```js
const ADEM = 1400;

// Het ademende faviconvak loopt zolang er werkelijk iets laadt. Twee dingen die
// pas kunnen nu de rij blijft bestaan. Eén: hij loopt door over statusupdates
// heen in plaats van elke keer bij frame nul te beginnen. Twee, en dat is de
// reden dat dit geen CSS is: hij kan netjes eindigen. Een oneindige
// CSS-animatie stopt op een willekeurige waarde en springt terug; op een vakje
// dat tussen 45% en 100% dekking ademt is dat een zichtbare knal, elke keer als
// er een pagina klaar is.
function zetAdem(rij, laadt) {
  if (laadt === rij.laadt) return;
  rij.laadt = laadt;

  if (laadt) {
    rij.adem = beweeg(rij.merk, [{ opacity: 0.45 }, { opacity: 1 }], {
      duration: ADEM / 2,
      iterations: Infinity,
      direction: 'alternate',
      easing: 'ease-in-out',
    });
    // Alle ademende vakjes op dezelfde klok. Twintig die elk bij hun eigen
    // laadmoment beginnen twinkelen; twintig die samen ademen lezen als één
    // ding dat bezig is. Dit is de fase-truc uit ui-systeem §6.4, maar nu om
    // een andere reden: niet om een hertekening te overleven — die is er niet
    // meer — maar om te synchroniseren.
    if (rij.adem) rij.adem.currentTime = performance.now() % ADEM;
    return;
  }

  if (!rij.adem) return;
  const stand = Number(getComputedStyle(rij.merk).opacity);
  rij.adem.cancel();
  rij.adem = null;
  beweeg(rij.merk, [{ opacity: stand }, { opacity: 1 }], { duration: 140, easing: ZACHT });
}
```

**De titel die wisselt.** Een titel verandert als een pagina klaar is met laden of
als een SPA van route wisselt. Nu de rij blijft bestaan kan die wissel eindelijk
iets anders zijn dan een sprongsnede:

```js
// Een titel die wisselt is nieuws. Niet bij het vullen van een verse rij: daar
// is niets om vandaan te komen.
function zetTitel(rij, tekst) {
  if (rij.titelTekst === tekst) return;
  const eerste = rij.titelTekst === undefined;
  rij.titelTekst = tekst;
  rij.titel.textContent = tekst;
  if (!eerste) beweeg(rij.titel, [{ opacity: 0.35 }, { opacity: 1 }], { duration: 140, easing: ZACHT });
}
```

De nieuwe tekst komt op vanaf 35% dekking. Geen dip vooraf: er is geen moment
waarop de oude tekst nog zichtbaar hoort te zijn, want hij is niet meer waar.

**De favicon die aankomt** krijgt géén overgang. Hij zou tegen de ademanimatie in
vechten (allebei `opacity`), en een icoon van 16px dat verschijnt merkt niemand op.
Wat wel moet: `onerror` het `src`-attribuut laten weghalen (§2.4), zodat een 404
niet het gebroken-afbeeldingicoon oplevert en de `:not([src])`-selector hierboven
weer werkt.

### 5.6 Een assistent die van staat wisselt

De vierkantjes zijn wat er goed is aan deze app; dit hoofdstuk raakt ze niet aan.
Wat het aanraakt is het móment ertussen, en dat is nu een harde knip: `zet()` zet
`modus` en het volgende frame tekent in een andere kleur met een ander patroon.
Op een gloeiend vakje van 16 pixels leest dat als een storing en niet als nieuws —
het vlekje verspringt en je kijkt op zonder te weten waarnaar.

**De kleur én het patroon kruisen in 220ms.** Dat is de enige plek in de hele app
waar twee animaties over elkaar heen lopen, en het is de plek waar dat betekenis
draagt: één patroon dat oplost terwijl het andere opkomt, met de kleur die
er onderdoor mee wandelt.

Drie wijzigingen in `glyph.js`, en ze grijpen in elkaar.

**1. De kleuren komen uit `tokens.css`.** Overgenomen uit
`richting-materiaal.md` §2.6, ongewijzigd: `--modus-*` als losse kanalen,
uitgelezen met `getComputedStyle`, met een hardgecodeerde terugval. Voorwaarde is
dat `island.html` dezelfde `tokens.css` laadt, wat `ui-systeem.md` §10 al
voorschrijft. `getComputedStyle` is een web-API, dus `glyph.js` blijft geschikt
voor het sandboxed tabblad dat hem deelt.

**2. `helderheid()` krijgt zijn stand als parameter**, zodat er twee standen
tegelijk berekend kunnen worden:

```js
// De stand komt binnen in plaats van uit de scope: tijdens een overgang rekenen
// we 220ms lang twee standen door en mengen we ze. Bij n=3 zijn dat negen extra
// sinussen per frame gedurende dertien frames; dat is niets, en het is het
// verschil tussen een knip en een overgang.
function helderheid(x, y, t, welke, sinds) { … }
```

**3. De lus valt in slaap, en wordt gewekt.** `richting-verstilling.md` §9.3 wil
dat de rustlus stopt; dat is goed, en het botst met de kruisovergang: als de
overgang nog loopt terwijl de stand al `rust` is, zou hij halverwege een
kleurwissel stilvallen. De slaapvoorwaarde is dus niet "de stand is rust" maar "de
stand is rust én de overgang is af":

```js
const OVERGANG = 0.22; // seconden, want t in teken() is al in seconden
const meng = (a, b, p) => a.map((v, i) => v + (b[i] - v) * p);

let modus = 'rust';
let vorigeModus = 'rust';
let begon = performance.now() / 1000;
let vorigBegon = begon;
let kruisStart = -Infinity;
let gestopt = false;
let wakker = false;

function teken(nu) {
  if (gestopt || !canvas.isConnected) { wakker = false; return; }

  // Met beweging uit: één stilstaand beeld per stand, en per stand een eigen t,
  // want op één vaste waarde lichten 'zoeken' en 'lezen' dezelfde hoek op.
  const t = rustig.matches ? (STIL_T[modus] ?? 0.4) : nu / 1000;
  const p = rustig.matches ? 1 : Math.min(1, (t - kruisStart) / OVERGANG);

  const [r, g, b] = p >= 1
    ? kleur(modus)
    : meng(kleur(vorigeModus), kleur(modus), p);

  … // opzet van het canvas ongewijzigd

  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const h = p >= 1
        ? helderheid(x, y, t, modus, begon)
        : helderheid(x, y, t, vorigeModus, vorigBegon) * (1 - p)
          + helderheid(x, y, t, modus, begon) * p;
      … // tekenen ongewijzigd
    }
  }

  // In rust beweegt er niets. Eén frame en dan stil: dat is het verschil tussen
  // 'de app staat stil' en 'de app staat stil maar er pulseert iets onderin je
  // ooghoek'. Hetzelfde geldt voor 'klaar' zodra de cirkel de rand gehaald
  // heeft — daarna verandert er geen pixel meer en heeft een tekenlus geen
  // enkele reden om te blijven draaien.
  const klaarUit = modus === 'klaar' && (t - begon) * 5.5 > Math.hypot(midden, midden) + 0.5;
  if (rustig.matches || (p >= 1 && (modus === 'rust' || klaarUit))) { wakker = false; return; }
  requestAnimationFrame(teken);
}

function wek() {
  if (wakker || gestopt) return;
  wakker = true;
  requestAnimationFrame(teken);
}

// Wie beweging uit- of aanzet terwijl de app draait krijgt meteen het goede
// beeld in plaats van pas bij de volgende standwissel.
rustig.addEventListener('change', wek);

return {
  zet(nieuw) {
    const doel = nieuw in GLYPH_KLEUREN ? nieuw : 'rust';
    if (doel === modus) return;
    vorigeModus = modus;
    vorigBegon = begon;
    modus = doel;
    begon = performance.now() / 1000;
    kruisStart = begon;
    wek();
  },
  // De verzoening weet precies wanneer een rij weggaat; expliciet stoppen is
  // zekerder dan de canvas.isConnected-controle die er drie frames over doet.
  stop() { gestopt = true; },
};
```

`STIL_T` per stand komt uit `richting-verstilling.md` §9.4 en blijft daar staan.

**Wat er verdwijnt.** `@keyframes kloppen` en `.tab .bezig` (`style.css:283-299`).
De glyph zegt al dat er iets gebeurt, en hij zegt er ook nog bij wát. Twee
statussignalen naast elkaar op één rij is er één te veel, en het scheelt een
tweede oneindige animatie per assistentrij.

### 5.7 Aanwijzen en indrukken

Aanwijzen is een stand, dus CSS. Eén gedeeld recept, want anders schrijft iedereen
per selector een eigen lijst en gaan ze uiteenlopen:

```css
:root {
  /* Uit richting-materiaal §7.1. Met opacity erin, want dat is precies wat er
     nu ontbreekt op #controls button, waar het verschil tussen aan en uit
     opacity: 0.32 is — dus knipperen de terug- en vooruitknop hard bij élke
     navigatie. En overal background-color en nooit background, anders loopt de
     glans op het ene element wel mee en op het andere niet. */
  --overgang-vlak:
    background-color var(--duur-vlak) var(--ease-zacht),
    color var(--duur-vlak) var(--ease-zacht),
    box-shadow var(--duur-vlak) var(--ease-zacht),
    opacity var(--duur-vlak) var(--ease-zacht);
}

.tab { transition: var(--overgang-vlak); }
.tab:hover { background-color: var(--fill); color: var(--text); }

/* Indrukken moet in hetzelfde frame landen en pas bij loslaten uitlopen. Eén
   declaratie doet allebei: de transitie geldt op de weg terug, niet op de weg
   erheen. Dit is de eerste :active-stand in deze app — button { cursor: default }
   haalt ook de cursorwissel weg, dus er was tot nu toe geen enkel signaal dat
   een klik geland was, terwijl er een IPC-rondgang tussen klik en antwoord zit. */
.tab:active { background-color: var(--fill-hover); box-shadow: var(--shadow-press); transition-duration: 0s; }

/* opacity: 0 haalt een element niet uit de muisafhandeling; zonder
   pointer-events sluit een trackpad-tik zonder voorafgaande hover een tabblad
   dat je nooit hebt zien staan. */
.tab .sluit {
  opacity: 0;
  pointer-events: none;
  transition: opacity var(--duur-tik) var(--ease-zacht),
              background-color var(--duur-tik) var(--ease-zacht);
}
.tab:hover .sluit,
.tab:focus-within .sluit { opacity: 1; pointer-events: auto; }
```

Het kruisje houdt zijn plek in de flexrij en verdwijnt alleen in dekking. Het kost
daarmee permanent zo'n 20px titelbreedte — en dat is de goede prijs. De
alternatieven zijn het kruisje absoluut over de titel leggen (dan valt het over de
ellips, en het maskeren van de titel bij hover is precies de kostenpost waar de
jury `richting-materiaal.md` op afrekende) of het favicon laten wijken (dan dooft
onder je cursor het herkenningsteken waarop je aan het scannen bent). Ruimte
betalen is goedkoper dan verf betalen, en het verschuift nooit.

Deze hele paragraaf is dode CSS zonder §2. `:active` overleeft een
`replaceChildren()` niet, en dat is ook precies waarom er nu geen `:active`-stand
bestaat: hij zou niet gewerkt hebben.

---

## 6. Twintig tabbladen tegelijk

Zeven regels, en ze zijn samen het antwoord op "geen kaartenhuis van animaties".

1. **Niets beweegt zonder structuurwijziging.** De drempel uit §3. Een lijst waar
   alleen statusruis binnenkomt, staat volkomen stil.
2. **Eén curve en één duur voor alles wat verschuift.** `--ease-zacht` op
   `--duur-rij`. Twee bewegingen die tegelijk lopen — de plaat en de rij eronder —
   moeten glad op elkaar liggen, en dat kan alleen als ze identiek zijn.
3. **Geen verschuiving, nergens.** Een verschuiving vermenigvuldigt de duur met het
   aantal rijen. Bij twintig rijen is 20ms per rij een golf van 400ms.
4. **Hoogstens één animatie per rij per update.** Een nieuwe rij krijgt een intree
   en doet niet mee aan de FLIP (hij heeft geen beginpositie). Een verplaatste rij
   krijgt een FLIP en verder niets.
5. **Alleen `transform` en `opacity`.** Beide gecomposit. Negentien rijen die
   tegelijk 32 pixels omhoog schuiven is precies waar een compositor voor is; het
   leest bovendien als één blok, omdat ze allemaal hetzelfde verschil hebben.
6. **Elke lopende animatie heeft een reden om te stoppen.** De glyph slaapt in
   rust en na `klaar`. De ademanimatie loopt alleen zolang er laadt en eindigt
   netjes. `kloppen` en `glans` verdwijnen. Bij twintig tabbladen waarvan er twee
   een assistent hebben, staat het aantal permanent draaiende lussen op nul zodra
   beide assistenten stilstaan.
7. **Geen uittree.** Wat weg is, is weg.

En het getal dat je moet onthouden: **twee geforceerde layouts per structurele
wijziging**. Eén meting vóór de mutatie, één erna. Alle `getBoundingClientRect()`-
aanroepen binnen zo'n meetronde vallen samen, want na de eerste is de layout
schoon. Meet dat na met twintig rijen, twee draaiende glyphs en een SPA die
`did-navigate-in-page` staat te pompen; dat is de enige plek in dit document waar
een meting het ontwerp kan omgooien.

---

## 7. De View Transition API: nee

`document.startViewTransition()` is in Chromium 111 uitgeleverd, dus hij ís
aanwezig in Chromium 130 en daarmee in Electron 33. **Ik heb dat niet in deze app
gedraaid**, alleen nagegaan vanaf welke versie het geleverd is.

Hij wordt hier niet gebruikt, en dat is een ontwerpkeuze en geen
beschikbaarheidskwestie. Drie redenen, in volgorde van zwaarte:

1. **Er kan er maar één tegelijk lopen.** Roep je `startViewTransition` aan terwijl
   er een loopt, dan wordt de vorige overgeslagen. Onze bron van updates is een
   brandslang: zes webContents-events per tabblad, plus een `did-navigate-in-page`
   bij elke history-push van elke SPA. Het gevolg zou zijn dat de animatie er soms
   is en soms niet, zonder dat iemand kan voorspellen wanneer. Een animatie die er
   willekeurig wel of niet is, is slechter dan geen animatie.
2. **Hij maakt een momentopname van het hele document.** Deze renderer bevat straks
   tot twee levende canvassen met een eigen tekenlus, plus een gemaskeerde
   scroll-container. Elke wisseling zou de volledige kolom van 264 pixels
   vastleggen, en de rendering staat stil tot de callback rond is.
3. **Hij geeft je momentopnames, geen onderbreekbare beweging.** FLIP met
   `Element.animate` kan halverwege opnieuw beginnen vanaf de plek waar hij op dat
   moment staat (§5.2), en dat is precies wat je nodig hebt als iemand vijf
   tabbladen achter elkaar sluit.

Er is één plek waar hij op het eerste gezicht wél zou passen — de workspacewissel:
zeldzaam, door de gebruiker uitgelokt, en de hele container wisselt. Ook daar
niet, om een vierde reden: de pagina wisselt via een native `setVisible()` zonder
overgang, dus een zijbalk die 200ms staat over te vloeien loopt uit de pas met het
enige waar hij bij hoort. §5.4 doet daar bewust een harde snede plus een intree,
en dat is met twaalf regels `Element.animate` gedaan.

---

## 8. `prefers-reduced-motion`

Het globale blok in `style.css:616-623` blijft staan en dekt alles wat CSS is: de
hovertransities, de plaat, de dekking van het kruisje. Wat het niet dekt zijn de
drie plekken die buiten CSS om lopen, en die zijn hier alle drie op één plek
afgevangen:

- **`Element.animate`** — via `beweeg()` (§4). Eén doorgeefluik, dus intree, FLIP,
  titelwissel, ademen en de workspacewissel zijn in één keer geregeld en niemand
  kan het ergens vergeten.
- **De plaat springt in plaats van te verhuizen** — `zetPlaat` controleert
  `rustig.matches` expliciet, want de CSS-transitie is dan uit maar de klasse
  `spring` moet er dan óók om de eerste plaatsing heen.
- **`glyph.js`** — één stilstaand frame per stand, en per stand een eigen `t`
  (§5.6).

Wat er expliciet níét bij hoeft: `richting-verstilling.md` §9.4 zet met beweging
uit `opacity: 0.55` op het ademende vakje, omdat een gestopte CSS-animatie op zijn
beginwaarde blijft staan. Hier is het ademen een `Element.animate` die met beweging
uit gewoon niet start, dus het vakje staat op volle dekking en de laadstand wordt
gedragen door `background-color: var(--skelet)` plus de titel op 72%. Eén
CSS-regel minder, en geen stand die van een keyframe afhangt.

---

## 9. Wat de verzoening voor toetsenbord en screenreader mogelijk maakt

Dit is geen bijvangst maar de reden dat `richting-instrument.md` §6.3 pas ná §2
kan bestaan.

```html
<ol id="tablist" role="listbox" aria-label="Tabbladen" tabindex="0"
    aria-activedescendant="tab-7">
```

Eén tabstop op de lijst, pijltoetsen erbinnen, `role="option"` en `aria-selected`
op de rijen. Dat hangt volledig aan twee dingen die met `replaceChildren()`
onmogelijk waren:

- **`aria-activedescendant` verwijst naar een element-id.** Dat id moet blijven
  bestaan tussen twee updates door; anders wijst het bij elke `pushState` naar een
  node die er niet meer is.
- **Focus overleeft een hertekening niet.** Nu de `<ol>` zelf de focus draagt en de
  rijen die nooit krijgen, is er ook niets te herstellen als de rij waar je stond
  wordt gesloten: de focus zit op de lijst, en `aria-activedescendant` verhuist
  naar de opvolger die `closeTab` al gekozen heeft. Dat is precies waarom
  `aria-activedescendant` hier beter is dan een roving `tabindex`.

Bij het lopen door de lijst met de pijltoetsen verhuist alleen
`aria-activedescendant` — niet `aria-selected`, en dus ook niet de plaat. De plaat
zegt "hier ben je"; de toetsenbordcursor zegt "hier kijk je". Die twee horen uit
elkaar te blijven tot je Enter drukt.

---

## 10. Volgorde van invoeren

Elke stap is op zichzelf verzendbaar en breekt niets.

1. **De verzoening plus `pushState` samenvoegen.** Levert visueel nul op en is de
   voorwaarde voor al het volgende. Ook de dag waarop `:active`, focus en de
   glyph-lussen gerepareerd worden zonder dat iemand het ziet. Een halve dag.
2. **De bewegingsdrempel, `beweeg()`, de intree en de FLIP.** `--duur-rij`,
   `--ease-zacht`, en de twee metingen. Vanaf hier beweegt er iets. Een halve dag.
3. **De plaat.** `#tablist { position: relative }`, één element, `zetPlaat`, en de
   vier declaraties die van `.tab[aria-selected]` af gaan. Een dag, waarvan het
   meeste het opnieuw ijken van de vullingsalfa's is.
4. **Laden.** Ademen op één klok, de titelwissel, `onerror`, `.ladend .titel`. Een
   halve dag.
5. **De glyph.** Kruisovergang, slapen in rust en na `klaar`, kleuren uit
   `tokens.css`, `stop()`. Een dag; dit is de fijnste code van de vijf en hij
   raakt het enige onderdeel dat de eigenaar al goed vindt, dus hier hoort een
   visuele controle bij en niet alleen een review.
6. **De workspacewissel, en optioneel de plakkende gaten.** Een halve dag, plus een
   halve dag als je de gaten neemt.

---

## 11. Wat ik niet geverifieerd heb

- **De View Transition API in Electron 33.** Ik weet dat hij in Chromium 111 is
  uitgeleverd en dat Electron 33 op Chromium 130 zit; ik heb het hier niet
  gedraaid. Voor dit document maakt het niet uit — §7 gebruikt hem sowieso niet.
- **`linear()` als easing in `Element.animate`.** Gedocumenteerd vanaf Chromium
  113 en geldig overal waar een `<easing-function>` mag staan, dus ook in
  `KeyframeAnimationOptions.easing`. Niet in deze app gedraaid. Valt hij weg, dan
  is het effect dat de curve terugvalt op lineair — lelijk, niet kapot. De
  terugval `|| 'ease-out'` in §4 vangt alleen het geval af dat de custom property
  helemaal leeg is.
- **`el.style.setProperty()` / `el.style.transform` onder `style-src 'self'`.** De
  jury heeft besloten dat de CSSOM buiten `style-src` valt en dat is naar mijn
  beste weten ook de specpositie, maar het is hier niet gedraaid. Dit document
  heeft er precies één plek voor nodig (`plaat.style.transform`); blijkt het toch
  geblokkeerd, dan is de uitwijk `plaat.animate([{ transform: … }], { duration: …,
  easing: ZACHT, fill: 'forwards' })`, want de Web Animations API valt daar zeker
  buiten. De rest van dit document gebruikt sowieso geen inline stijl.
- **Of `getComputedStyle(el).opacity` tijdens een lopende `Element.animate` de
  geanimeerde waarde teruggeeft.** Volgens spec wel (de berekende waarde
  weerspiegelt de animatie), en `zetAdem` leunt daarop voor het nette einde. Zo
  niet, dan leest hij 1 en is het einde weer een knal — controleer dat met één
  regel in de console.
- **Dat een reeks `getBoundingClientRect()`-aanroepen binnen één meetronde één
  geforceerde layout kost en niet N.** Dat is het gedocumenteerde gedrag, maar het
  is precies het getal waar §6 op leunt. Meet het met het Performance-paneel bij
  twintig rijen.
- **`Animation.currentTime` als setter om de ademanimaties te synchroniseren.**
  Standaard-API, hier niet uitgeprobeerd.
- **De combinatie `mask-image` op `#tablist` met draaiende canvassen erin.** De
  jury noemt dit al als de enige plek die vóór verzending gemeten moet worden, en
  §5.4 zet daar nog een opacity- plus transform-animatie op dezelfde container
  bovenop. Is dat te duur, dan is de uitwijk het masker alleen aanzetten tijdens
  het scrollen, of het onderste verloop laten vallen en alleen het bovenste
  houden.
- **`.gat` en de rijhoogte.** Klopt alleen als `#tablist` geen `gap` heeft. Dat is
  wat de gekozen richting voorschrijft, maar het staat vandaag anders in
  `style.css:238`.

---

## 12. Wat dit niet oplost

- **Twee gelijktijdige assistenten.** `main.js` kent één `this.agent`, dus een
  tweede assistent kan wel een tabblad met een glyph hebben maar geen tweede regel
  in het eiland. De rijen schalen naar N, het eiland niet. Dat is een eigen
  ontwerp.
- **Beweging tussen de lagen.** Zijbalk, eiland en pagina zijn drie compositors.
  Een tabblad dat in de zijbalk actief wordt, kan niet naar de pagina toe animeren,
  en dat gaat ook niet veranderen.
- **De pagina zelf wisselt hard.** `setVisible()` kent geen overgang. Alles in dit
  document is daaraan aangepast in plaats van ertegenin te werken.
- **Herordenen met slepen.** De FLIP staat er klaar voor, maar er is geen manier om
  een tabblad te verslepen. Komt die er, dan is dit hoofdstuk de helft van het
  werk.
- **Grote aantallen.** De verzoening is O(n) per update en tekent niets buiten
  beeld weg. Bij tweehonderd tabbladen is dat tweehonderd stringvergelijkingen per
  update — nog steeds niets, maar de tweehonderd `<li>`-elementen zelf worden dan
  het probleem, en dat lost alleen virtualisatie op. Dat is voor deze app een
  probleem dat nog niet bestaat.
- **De workspacevoet.** Die heeft precies dezelfde plaat, dezelfde verzoening en
  dezelfde `.close`-fout (`display: none` in plaats van `opacity: 0`, waardoor de
  chip bij hover 24px groeit en de hele strip opzij schuift). Dit document
  beschrijft het mechanisme; het toepassen op de voet hoort bij het ontwerp van de
  voet.
