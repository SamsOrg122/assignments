# Pagina-basis

De vorm van dit ontwerp volgt uit één eigenschap van Tougather: een tabblad is
een `WebContentsView`, een native laag die altijd over de HTML van de zijbalk
heen tekent. Alles wat *over* de pagina moet verschijnen kan dus maar op twee
manieren: als native menu (`Menu.popup`, dat zweeft boven alle lagen) of als een
eigen `WebContentsView` met eigen preload, zoals de balk bovenin al is. Alles wat
*naast* de pagina past hoort daarentegen gewoon in de zijbalk-renderer, want daar
is het goedkoop. Die driedeling bepaalt per onderdeel de bouwvorm: het
contextmenu en de historielijst worden native menu's, de zoekbalk wordt een
derde view, en de zoomchip blijft HTML in de zijbalk.

De tweede eigenschap die alles stuurt: een tabblad is `sandbox: true` en heeft
géén preload, dus een pagina kan zelf nooit IPC sturen. Elke handeling hieronder
draait daarom in het hoofdproces op de `webContents` van het tabblad waar de
gebeurtenis vandaan kwam — op `tabId`, niet op `this.activeWebContents`. Dat is
geen muggenzifterij: een assistent werkt in zijn eigen tabblad terwijl jij in een
ander tabblad iets kopieert, en `activeWebContents` wijst dan naar het verkeerde.

Alle codefragmenten hieronder zijn schetsen die in `BrowserWindowController`
horen, tenzij er een ander bestand bij staat.

---

## 1. Contextmenu

### Waar het aan hangt

In `createTab()`, bij de andere `wc.on(...)`-regels:

```js
// De pagina is sandboxed en heeft geen preload, dus het menu kan alleen hier
// gebouwd worden. params komt van Chromium en zegt precies waar je op stond.
wc.on('context-menu', (_e, params) => this.toonPaginaMenu(id, params));
```

`toonPaginaMenu` vraagt het sjabloon op bij een nieuw hoofdprocesbestand en popt
het:

```js
toonPaginaMenu(tabId, params) {
  const ws = this.workspaceOf(tabId);
  const wc = ws?.tabs.get(tabId)?.webContents;
  if (!wc) return;

  const menu = Menu.buildFromTemplate(bouwPaginaMenu({ ctrl: this, tabId, wc, params }));
  // Geen x/y: die van params zijn paginacoördinaten en de view staat met een
  // zijbalk en een plafond ernaast, dus ze zouden hier verschoven landen.
  // Zonder x/y popt het menu op de muis, en dat is precies de bedoeling.
  menu.popup({ window: this.win, sourceType: params.menuSourceType });
  this.openMenu = menu;
  menu.once('menu-will-close', () => { if (this.openMenu === menu) this.openMenu = null; });
}
```

`params.x` en `params.y` gaan wél ongewijzigd door naar `wc.copyImageAt(x, y)` en
`wc.inspectElement(x, y)`: die verwachten juist paginacoördinaten.

In `closeTab()` en in `stopAgent()` hoort `this.openMenu?.closePopup(this.win)`,
anders blijft een menu open staan boven een tabblad dat niet meer bestaat.

### Roles of clicks

**Geen `role`-items, overal een expliciete `click`.** Een role als `copy` werkt op
de gefocuste `webContents` van het venster, en dit venster heeft er drie soorten:
de zijbalk, het eiland en de tabbladen. Welke er precies focus heeft op het moment
dat je een menu-item kiest is niet af te dwingen. `click: () => wc.copy()` wijst
onmiskenbaar naar het juiste tabblad. De prijs is dat de sneltoets niet vanzelf in
het item staat; die zetten we er met `accelerator` bij en met
`registerAccelerator: false` (Windows/Linux) zodat het menu de toets alleen toont
en niet kaapt.

### Nieuw bestand: `menu-pagina.js` (hoofdproces)

Hoofdprocescode, dus Node is toegestaan; dit bestand wordt nooit door een
sandboxed tabblad geladen. Het exporteert één functie die een sjabloon teruggeeft:

```js
function bouwPaginaMenu({ ctrl, tabId, wc, params }) { /* → MenuItemConstructorOptions[] */ }
```

De secties komen alleen in het sjabloon als ze van toepassing zijn, met
`{ type: 'separator' }` ertussen. Volgorde en inhoud:

**Link** — als `params.linkURL` gevuld is:

| Label | Actie |
| --- | --- |
| Openen in nieuw tabblad | `ctrl.createTab(params.linkURL, ws, { activeer: false })` |
| Openen in je systeembrowser | `shell.openExternal(params.linkURL)` |
| Link kopiëren | `clipboard.writeText(params.linkURL)` |
| Linktekst kopiëren | `clipboard.writeText(params.linkText)`, alleen als die niet leeg is |

Het nieuwe tabblad komt bewust op de achtergrond (`activeer: false`): dat is wat
je in elke browser verwacht, en het is hier precies dezelfde route die een
assistent gebruikt.

**Afbeelding** — als `params.mediaType === 'image' && params.hasImageContents`:

| Label | Actie |
| --- | --- |
| Afbeelding kopiëren | `wc.copyImageAt(params.x, params.y)` |
| Afbeeldingsadres kopiëren | `clipboard.writeText(params.srcURL)` |
| Afbeelding openen in nieuw tabblad | `ctrl.createTab(params.srcURL, ws, { activeer: false })`, alleen bij `/^https?:/i` |

`srcURL` kan een `data:`- of `blob:`-URL zijn; die openen we niet als tabblad,
dan verbergen we dat item met `visible: false`.

**Selectie** — als `params.selectionText` niet leeg is:

| Label | Actie |
| --- | --- |
| Kopiëren | `wc.copy()` |
| Zoeken naar "…" | `ctrl.createTab(naarZoekURL(params.selectionText, zoekmachine), ws)` |
| Zoeken op deze pagina | `ctrl.openFind(tabId, params.selectionText)` |

Kopiëren gaat via `wc.copy()` en níét via `clipboard.writeText(params.selectionText)`:
Chromium kapt `selectionText` af (in de orde van duizend tekens — exacte grens niet
geverifieerd) en levert alleen platte tekst. `selectionText` is goed genoeg voor
het *label* — afkappen op ~30 tekens met een ellips — en voor een zoekopdracht,
niet voor het klembord.

**Bewerkbaar veld** — als `params.isEditable`:

Eerst de spelling, als `params.misspelledWord` gevuld is: maximaal vijf items uit
`params.dictionarySuggestions` die elk `wc.replaceMisspelling(woord)` aanroepen,
of één uitgeschakeld item "Geen suggesties". Daarna de bewerkregels, met `enabled`
uit `params.editFlags`:

| Label | Actie | `enabled` |
| --- | --- | --- |
| Ongedaan maken | `wc.undo()` | `editFlags.canUndo` |
| Opnieuw | `wc.redo()` | `editFlags.canRedo` |
| Knippen | `wc.cut()` | `editFlags.canCut` |
| Kopiëren | `wc.copy()` | `editFlags.canCopy` |
| Plakken | `wc.paste()` | `editFlags.canPaste` |
| Plakken zonder opmaak | `wc.pasteAndMatchStyle()` | `editFlags.canPaste && editFlags.canEditRichly` |
| Alles selecteren | `wc.selectAll()` | `editFlags.canSelectAll` |

**Media** — als `params.mediaType` `audio` of `video` is: alleen "Adres kopiëren"
(`params.srcURL`). Afspelen, pauzeren en herhalen zitten er niet in; zie
[Wat dit niet oplost](#wat-dit-niet-oplost).

**Pagina** — altijd, onderaan:

| Label | Actie |
| --- | --- |
| Terug | `wc.navigationHistory.goBack()`, `enabled: wc.navigationHistory.canGoBack()` |
| Vooruit | `wc.navigationHistory.goForward()`, `enabled: canGoForward()` |
| Opnieuw laden | `wc.reload()` |
| Adres kopiëren | `clipboard.writeText(wc.getURL())` |
| Zoeken op deze pagina | `ctrl.openFind(tabId)` |
| Inzoomen / Uitzoomen / Werkelijke grootte (130%) | `ctrl.zoomStap(tabId, 'in' \| 'uit' \| 'reset')` |
| Afdrukken… | `ctrl.print(tabId)` |
| Opslaan als pdf… | `ctrl.opslaanAlsPdf(tabId)` |
| Element inspecteren | `wc.inspectElement(params.x, params.y)` |

Het zoompercentage staat in het label van "Werkelijke grootte" en niet in een
`sublabel`: `sublabel` gedraagt zich niet op alle platforms gelijk.

### De zijbalk zelf

`this.win.webContents` stuurt hetzelfde `context-menu`-event. Daar is één klein
menu genoeg, opgebouwd uit dezelfde bouwstenen: bij `params.isEditable` de
bewerkregels, plus één eigen item **Plakken en gaan** dat
`ctrl.go(clipboard.readText())` doet. Buiten een invoerveld: geen menu (`return`),
want een leeg standaardmenu op een zijbalk is rommel.

### Wat er misgaat

- Een menu dat open staat terwijl het tabblad navigeert of sluit blijft hangen —
  vandaar `this.openMenu` en `closePopup`.
- `params.frame` kan `null` zijn (frame al weg). We gebruiken het niet, maar wie
  er later iets per frame bij bouwt moet erop rekenen.
- Op een pagina die zelf `contextmenu` afvangt (`preventDefault`) krijgt Chromium
  het event nooit en verschijnt er geen menu. Dat is correct gedrag, maar het
  voelt als een bug; er is geen "toon toch het browsermenu"-toets in dit ontwerp.

---

## 2. Zoeken op de pagina

### Bouwvorm: een derde WebContentsView

De balk moet zichtbaar zijn *terwijl* je de pagina ziet, dus de truc van de
commandobalk (`setPaletteOpen`, pagina even wegnemen) kan hier niet. Een overlay
in de zijbalk-renderer verdwijnt onder de pagina. Blijft over: een eigen laag,
precies zoals het eiland er al een is.

In de constructor, na het eiland:

```js
// Zelfde reden als bij het eiland: dit moet over de pagina heen, en dat kan
// alleen als eigen laag. Hij staat er altijd, maar meestal onzichtbaar.
this.findView = new WebContentsView({
  webPreferences: {
    preload: path.join(__dirname, 'preload-find.js'),
    contextIsolation: true,
    nodeIntegration: false,
  },
});
this.findView.setBackgroundColor('#00000000');
const findId = this.findView.webContents.id;
windows.set(findId, this);
this.win.on('closed', () => windows.delete(findId));
this.findView.setVisible(false);
this.findView.webContents.loadFile(path.join(__dirname, 'renderer', 'find.html'));
this.win.contentView.addChildView(this.findView);
```

Omdat nieuwe tabbladen er bovenop komen wordt `raiseIsland()` een
`raiseOverlays()` die eerst het eiland en dan de zoekbalk opnieuw toevoegt. Elke
huidige aanroep van `raiseIsland()` wordt die nieuwe.

### Layout

Rechtsboven in het paginagebied, net binnen de afgeronde hoek:

```js
const FIND_MARGE = 12;

layoutFind() {
  const { width } = this.win.getContentBounds();
  const { width: w, height: h } = this.findSize; // komt via find:size, net als het eiland
  this.findView.setBounds({
    x: Math.round(width - CONTENT_GAP - FIND_MARGE - w),
    y: TOPBAR_HEIGHT + FIND_MARGE,
    width: w,
    height: h,
  });
}
```

`layoutFind()` hoort in dezelfde `resize`-handler als `layoutIsland()`.
Beginmaat: `{ width: 340, height: 46 }`; de balk meet zichzelf op en meldt via
`find:size`, exact zoals `island:size` werkt, omdat het hoofdproces de breedte van
een tellertje als "12/143" niet kan raden.

### Toestand in de controller

```js
// De balk hoort bij één tabblad. Wissel je van tabblad, dan gaat hij dicht:
// een teller die bij een andere pagina hoort is erger dan geen teller.
this.find = null; // of { tabId, tekst, matchCase, requestId }
```

- `openFind(tabId = this.activeId, prefill = '')` — zet `this.find`, maakt de view
  zichtbaar, `layoutFind()`, `raiseOverlays()`, stuurt `find:state`
  `{ open: true, tekst: prefill, matchCase }` en focust
  `this.findView.webContents.focus()`. Bij een `prefill` meteen zoeken.
- `findQuery(tekst, matchCase)` — lege tekst betekent `stopFindInPage('clearSelection')`
  en teller op nul.
- `findStep(richting)` — `+1` / `-1`.
- `closeFind()` — `stopFindInPage('clearSelection')` op het tabblad,
  `setVisible(false)`, `this.find = null`.

Het zoeken zelf:

```js
zoek(opnieuw, vooruit = true) {
  const wc = this.workspaceOf(this.find.tabId)?.tabs.get(this.find.tabId)?.webContents;
  if (!wc || !this.find.tekst) return;
  this.find.requestId = wc.findInPage(this.find.tekst, {
    findNext: opnieuw,
    forward: vooruit,
    matchCase: this.find.matchCase,
  });
}
```

> **Onzeker.** De documentatie zegt bij `findNext`: "Whether to begin a new text
> finding session with this request. Should be `true` for initial requests, and
> `false` for follow-up requests." Dat leest tegen-intuïtief (elders in
> Chromium betekent *find next* juist "volgende treffer"). Ik neem de
> documentatie letterlijk: een nieuwe of gewijzigde zoekterm gaat met
> `findNext: true`, doortikken naar de volgende of vorige treffer met
> `findNext: false` plus `forward`. Bij het bouwen als eerste uitproberen; als
> het omgekeerd blijkt, wisselt alleen deze ene vlag om.

Resultaten, per tabblad geregistreerd in `createTab()`:

```js
wc.on('found-in-page', (_e, r) => {
  // Alleen het laatste verzoek van het tabblad waar de balk bij hoort telt;
  // tijdens typen lopen er meerdere verzoeken tegelijk en de oude komen later.
  if (this.find?.tabId !== id || r.requestId !== this.find.requestId) return;
  this.sendFind('find:result', { treffers: r.matches, actief: r.activeMatchOrdinal });
});
```

`r.finalUpdate` gebruiken we niet om te filteren maar wel om te weten dat het
tellen klaar is: tussenresultaten laten de teller live oplopen, net als in Chrome.

### De balk zelf

Nieuwe bestanden `renderer/find.html`, `find.css`, `find.js`, met `preload-find.js`.
Uiterlijk: dezelfde donkere pil als het eiland — `--plafond` als achtergrond,
`--tekst` en `--zacht` voor tekst, radius 14, eigen `:root`-variabelen in
`find.css` zoals `island.css` dat ook doet. Geen holle hoekjes, want deze pil
groeit niet uit het plafond; wel een zachte slagschaduw omdat hij op een pagina
ligt die wit kan zijn.

Van links naar rechts in één rij: een vergrootglas-svg (zelfde stijl als de
knoppen in `index.html`), het invoerveld, de teller `3/48` in `--zacht`, een
`Aa`-knop voor hoofdlettergevoelig (aan/uit, aan = `--ga-vlak`), `‹` en `›`, en
een `✕`. Bij nul treffers kleurt de teller naar `--gevaar-tekst` en toont "0/0".

Toetsen in `find.js`: `Enter` volgende, `Shift+Enter` vorige, `Escape` dicht,
`Ctrl/Cmd+F` opnieuw selecteren van de tekst.

`preload-find.js`:

```js
contextBridge.exposeInMainWorld('zoekbalk', {
  meldGrootte: (b, h) => ipcRenderer.invoke('find:size', b, h),
  zoek: (tekst, matchCase) => ipcRenderer.invoke('find:query', tekst, matchCase),
  stap: (richting) => ipcRenderer.invoke('find:step', richting),
  sluit: () => ipcRenderer.invoke('find:close'),
  onStand: (fn) => ipcRenderer.on('find:state', (_e, s) => fn(s)),
  onResultaat: (fn) => ipcRenderer.on('find:result', (_e, r) => fn(r)),
});
```

### Wat er misgaat

- **De view slikt muisklikken in zijn hele rechthoek**, ook waar hij doorzichtig
  is. Houd de view daarom exact zo groot als de pil plus een paar pixels voor de
  schaduw; elke pixel marge is een dode zone op de pagina.
- Chromium scrollt een treffer meestal naar het midden, maar een treffer die
  bovenaan blijft staan kan achter de balk vallen.
- Zoeken werkt niet in de ingebouwde pdf-viewer en niet in tekst op een `<canvas>`.
- Bij een navigatie in hetzelfde tabblad blijft de balk staan maar zijn de
  treffers weg; de teller moet dan op nul en de zoekopdracht opnieuw. Haak op
  `did-navigate` van dat tabblad.
- `Escape` in de pagina komt niet in de zijbalk-renderer aan; die route loopt via
  de sneltoetsen in §5.

---

## 3. Zoom per site

### Ladder in factoren, niet in niveaus

Electron heeft `wc.setZoomLevel(level)` (schaal = `1.2 ^ level`) en
`wc.setZoomFactor(factor)` (1.3 = 130%). We rekenen in factoren, want de UI toont
percentages en een vaste ladder leest netter dan `1.2 ^ n`:

```js
// Dezelfde stappen als Chrome. Geen vrije waarden: dan staat er straks 113%.
const ZOOMLADDER = [0.5, 0.67, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3];
```

`zoomStap(tabId, 'in' | 'uit' | 'reset')` zoekt de dichtstbijzijnde trede,
schuift één op, roept `wc.setZoomFactor(nieuw)` aan, slaat op en doet
`pushState()` — dat laatste omdat andere tabbladen op hetzelfde domein
meeveranderen (zie hieronder) en de zijbalk dat moet kunnen laten zien.

### Onthouden

Chromium's zoombeleid is *per origin per sessie*. Elke workspace heeft een eigen
`persist:ws-N`, dus dezelfde site kan in twee workspaces een andere zoom hebben —
dat is verdedigbaar en we volgen het, in plaats van ertegenin te werken. De sleutel
is daarom `partition` + origin:

```js
// zoom-opslag.js — hoofdproces
// { "persist:ws-1": { "https://news.ycombinator.com": 1.25 } }
```

Nieuw bestand `zoom-opslag.js` met `laad()`, `lees(partition, origin)`,
`schrijf(partition, origin, factor)` en een schrijfactie die 400 ms debounced naar
`path.join(app.getPath('userData'), 'zoom.json')` gaat. Een factor van precies 1
wordt gewist in plaats van opgeslagen, anders groeit het bestand met elke site die
je ooit bezocht.

Toepassen bij navigatie, in `createTab()`:

```js
wc.on('did-navigate', (_e, url) => {
  // Chromium onthoudt zoom per origin binnen een sessie, maar niet over een
  // herstart heen. Deze regel maakt het wél blijvend.
  const origin = veiligeOrigin(url);           // null bij file:, data:, about:
  if (origin) wc.setZoomFactor(lees(ws.partition, origin) ?? 1);
});
```

Ctrl+wiel, in `createTab()`:

```js
wc.on('zoom-changed', (_e, richting) => this.zoomStap(id, richting === 'in' ? 'in' : 'uit'));
```

> **Onzeker.** Ik weet niet zeker of Electron bij ctrl+wiel de zoom zélf al
> toepast en `zoom-changed` alleen als melding stuurt, of dat het event puur een
> haakje is waarop de app moet reageren. Bij het bouwen eerst kijken wat
> `getZoomFactor()` doet zonder eigen afhandeling: past Electron het al toe, dan
> wordt deze handler alleen nog opslaan, anders doet hij ook de stap.
>
> **Onzeker.** Ik ga ervan uit dat een zoomniveau niet in de sessie op schijf
> bewaard blijft (het staat in de HostZoomMap van de browsercontext, niet in de
> cookiejar). Klopt dat niet, dan is `zoom.json` overbodig; controleren door de
> app te herstarten voordat dit bestand er is.

### UI

Een chip in de zijbalk, direct onder de adresbalk, alleen zichtbaar als de zoom
niet 100% is:

```html
<div id="zoom" hidden>
  <button id="zoom-uit" type="button" aria-label="Uitzoomen">…</button>
  <button id="zoom-terug" type="button">130%</button>
  <button id="zoom-in" type="button" aria-label="Inzoomen">…</button>
</div>
```

Zelfde vormtaal als `#controls`: hoogte 28, `border-radius: var(--radius-field)`,
`background: var(--fill)`, tekst in `--muted`. Het percentage is zelf de knop die
terugzet naar 100%.

`describe()` krijgt er één veld bij:

```js
zoom: leeg ? 1 : Math.round(wc.getZoomFactor() * 100) / 100,
```

en `app.js` zet in `onState` `zoomEl.hidden = !active || active.zoom === 1`.

### Wat er misgaat

- Zoom is per origin, dus twee tabbladen op dezelfde site in dezelfde workspace
  veranderen samen. Dat is Chrome-gedrag, maar het verrast wie het niet weet.
- Tussen `did-navigate` en het toepassen zit een frame: een pagina kan kort op
  100% verschijnen en dan verspringen. Alternatief is toepassen in
  `did-start-navigation` op de doel-URL, maar ik weet niet zeker of die instelling
  de commit overleeft — als de flikkering hindert, is dat het eerste experiment.
- `file:`- en `about:`-pagina's hebben geen bruikbare origin (`"null"`); die slaan
  we niet op, dus onze eigen nieuw-tabblad-pagina onthoudt geen zoom.
- De zijbalk en het eiland zoomen niet mee. Dat is bewust — dit is paginazoom,
  geen UI-schaal — maar iemand gaat het vragen.

---

## 4. Printen en opslaan als pdf

### Afdrukken

```js
print(tabId) {
  const wc = this.webContentsVan(tabId);
  if (!wc || this.printBezig) return;
  this.printBezig = true;
  // silent: false → de systeemprintdialoog. Electron heeft geen eigen
  // printvoorbeeld, en dat gaan we ook niet namaken.
  wc.print({ silent: false, printBackground: false }, (ok, reden) => {
    this.printBezig = false;
    if (!ok && reden && reden !== 'cancelled') this.send('page:melding', `Afdrukken lukte niet: ${reden}`);
  });
}
```

De meest voorkomende `reden` is dat er geen printer is. Voor zulke berichten is er
nog niets in de UI; dit ontwerp voegt het smalst mogelijke ding toe: een kanaal
`page:melding` naar de zijbalk, die de tekst 3 seconden onder de adresbalk toont
in `--muted`, in dezelfde regelhoogte als `#new-tab`. Geen toaststapel, geen
animatiesysteem — dat hoort bij een ontwerp over meldingen, niet hier.

### Opslaan als pdf

```js
async opslaanAlsPdf(tabId) {
  const wc = this.webContentsVan(tabId);
  if (!wc) return;
  // Eerst vragen waar, dan pas renderen: annuleer je, dan is er niets gedaan.
  const { canceled, filePath } = await dialog.showSaveDialog(this.win, {
    title: 'Opslaan als pdf',
    defaultPath: path.join(app.getPath('downloads'), `${bestandsnaam(wc.getTitle())}.pdf`),
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  });
  if (canceled || !filePath) return;

  const data = await wc.printToPDF({
    pageSize: 'A4',
    printBackground: true,
    margins: { top: 0.4, bottom: 0.4, left: 0.4, right: 0.4 },
  });
  await fs.writeFile(filePath, data);
  this.send('page:melding', 'Opgeslagen als pdf');
}
```

`bestandsnaam()` haalt `\ / : * ? " < > |` weg, knipt op 80 tekens en valt terug
op `'pagina'` bij een lege titel. `dialog` en `node:fs/promises` komen er als
import bij in `main.js`.

> **Onzeker.** De typings van Electron 33 geven `printToPDF` als
> `Promise<Buffer>`; in nieuwere versies is dat een `Uint8Array`. `fs.writeFile`
> accepteert beide, dus dit maakt hier niets uit, maar niet ergens `Buffer`
> veronderstellen.
>
> **Onzeker.** Of `print()` en `printToPDF()` werken op een view die niet
> zichtbaar is (het tabblad van een assistent) heb ik niet geverifieerd.
> `printToPDF` gaat langs de printpijplijn en niet langs de tekenlaag, dus het zou
> moeten kunnen; `print()` met een dialoog boven een onzichtbaar tabblad is
> sowieso verwarrend. Daarom: beide alleen aanbieden via het contextmenu en
> Ctrl+P, en die gaan per definitie over een zichtbaar tabblad.

### Wat er misgaat

- Er is geen printvoorbeeld. Electron bouwt dat niet en wij ook niet.
- De pdf volgt de print-stylesheet van de site, niet wat je op het scherm ziet.
  Pagina's die pas laden bij scrollen komen half leeg uit de pdf.
- De systeemprintdialoog is een apart venster; op Windows kan hij achter het
  hoofdvenster verdwijnen als je erlangs klikt.

---

## 5. Selecteren, kopiëren en sneltoetsen

Het echte probleem hier is niet het kopiëren maar de *focus*. Zodra je in de
pagina klikt, gaan toetsaanslagen naar de `webContents` van dat tabblad en niet
naar de zijbalk-renderer. De `keydown`-luisteraar in `app.js` hoort dan niets
meer. Er is al één gat langs deze weg gedicht — `devtoolsSneltoets()` gebruikt
`before-input-event` — en dat is precies het patroon dat hier verder moet.

Nieuwe functie in `main.js`, naast `devtoolsSneltoets`:

```js
// Toetsen die in de pagina worden ingedrukt komen nooit in de zijbalk-renderer
// aan; die view heeft de focus. Vandaar dat ook deze sneltoetsen hier liggen.
function paginaSneltoetsen(wc, ctrl, tabId) {
  wc.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    const mod = input.control || input.meta;
    const k = input.key.toLowerCase();

    if (mod && k === 'f') { e.preventDefault(); ctrl.openFind(tabId); }
    if (mod && k === 'p') { e.preventDefault(); ctrl.print(tabId); }
    if (mod && (k === '=' || k === '+')) { e.preventDefault(); ctrl.zoomStap(tabId, 'in'); }
    if (mod && (k === '-' || k === '_')) { e.preventDefault(); ctrl.zoomStap(tabId, 'uit'); }
    if (mod && k === '0') { e.preventDefault(); ctrl.zoomStap(tabId, 'reset'); }
    if (input.key === 'Escape' && ctrl.find?.tabId === tabId) ctrl.closeFind();
  });
}
```

Twee dingen om te weten:

1. `input.key` is `'='` of `'+'` afhankelijk van shift en indeling; daarom beide,
   en op een toetsenbord met een aparte numerieke `+` desnoods ook `input.code`.
2. Dit raakt een gat dat er al zat: ook `Ctrl+T`, `Ctrl+K`, `Ctrl+L` en `Ctrl+J`
   werken vandaag niet zolang de pagina focus heeft, want die zitten alleen in
   `app.js`. Ze horen in dezelfde router thuis. Ik zet ze hier niet in, omdat
   tabbladen en de commandobalk andermans ontwerp zijn — maar wie deze functie
   bouwt, bouwt de plek waar ze horen.

**Knippen, kopiëren, plakken en alles selecteren** staan bewust *niet* in die
lijst. Dat zijn editorcommando's van Blink en die werken in de pagina zonder dat
wij iets doen; op macOS blijft bovendien het standaardmenu van Electron staan
(`Menu.setApplicationMenu(null)` draait alleen als `!isMac`) en dat levert
Cmd+C/V/X/A via zijn rollen.

> **Onzeker.** Of Blink `Ctrl+C` ook zonder applicatiemenu overal afhandelt, heb
> ik niet op alle drie de platforms geverifieerd. Blijkt het ergens niet zo, dan
> is de vangnetregel `if (mod && k === 'c') wc.copy()` — maar alleen daar
> toevoegen waar het echt nodig is, want pagina's met een eigen `copy`-handler
> raken erdoor van slag.

Kopiëren via het menu gaat altijd langs `wc.copy()`, zodat opmaak en HTML-smaak
op het klembord blijven staan zoals Chromium ze zet.

---

## 6. Terug- en vooruit-historie vasthouden

### Waarom een native menu

De knoppen staan in de zijbalk, dus een HTML-dropdown lijkt logisch. Maar de
zijbalk is 264 px breed en een lijst met paginatitels wil breder zijn; alles wat
buiten die kolom uitsteekt valt achter de pagina-view. Een `Menu.popup` zweeft
boven alle lagen en is bovendien precies het ding dat elke browser hier gebruikt.

### Renderer

In `index.html` niets nieuws; in `app.js` een lange-drukherkenning op de bestaande
`#back` en `#forward`:

```js
function historieKnop(knop, richting, gewoon) {
  let timer = null;
  let geopend = false;

  const open = () => {
    geopend = true;
    const r = knop.getBoundingClientRect();
    // De zijbalk-renderer beslaat het hele venster, dus css-pixels hier zijn
    // vensterpixels daar. Het menu hangt onder de knop.
    browser.toonHistorie(richting, Math.round(r.left), Math.round(r.bottom + 4));
  };

  knop.addEventListener('mousedown', () => { geopend = false; timer = setTimeout(open, 420); });
  knop.addEventListener('mouseup', () => clearTimeout(timer));
  knop.addEventListener('mouseleave', () => clearTimeout(timer));
  knop.addEventListener('contextmenu', (e) => { e.preventDefault(); open(); });
  knop.onclick = () => { if (!geopend) gewoon(); };
}
```

De vlag `geopend` is nodig omdat de `click` ná de lange druk alsnog afgaat; zonder
die vlag navigeer je terug én zie je de lijst.

### Hoofdproces

```js
toonHistorie(richting, x, y) {
  const wc = this.activeWebContents;
  if (!wc) return;
  const geschiedenis = wc.navigationHistory;
  const nu = geschiedenis.getActiveIndex();
  const alles = geschiedenis.getAllEntries();

  const indexen = richting === 'terug'
    ? [...alles.keys()].slice(0, nu).reverse()
    : [...alles.keys()].slice(nu + 1);

  const items = indexen.slice(0, 12).map((i) => ({
    label: label(alles[i]),
    click: () => geschiedenis.goToIndex(i),
  }));
  if (items.length === 0) items.push({ label: 'Niets', enabled: false });

  Menu.buildFromTemplate(items).popup({ window: this.win, x, y });
}
```

`label()` neemt `entry.title || entry.url`, kapt af op 60 tekens, en vervangt de
interne nieuw-tabblad-URL (`NEWTAB`) door "Nieuw tabblad" — dat pad hoort net zo
min in een menu als in de adresbalk.

### Wat er misgaat

- `NavigationEntry` heeft in Electron 33 alleen `title` en `url`. Geen favicons in
  de lijst, terwijl Chrome die wel toont; die zouden uit de faviconcache van de
  renderer moeten komen en als `NativeImage` mee terug. Niet in dit ontwerp.
- In een native menu bestaat middelklikken niet, dus "open deze historiestap in
  een nieuw tabblad" kan niet.
- De x/y kloppen alleen zolang de zijbalk-renderer zelf niet gezoomd is.
- Lange druk botst met slepen; de knoppen zijn geen sleepdoelen, dus dat valt mee,
  maar op een touchpad met tap-to-click voelt 420 ms lang. Waarde is een knop om
  aan te draaien.

---

## 7. Wat er in main.js bij moet

**Imports.** `clipboard` en `dialog` uit `electron`, `node:fs/promises`, plus
`require('./menu-pagina.js')` en `require('./zoom-opslag.js')`.

**Constanten.** `FIND_MARGE = 12`. De zoomladder staat in `zoom-opslag.js`.

**Constructor.** De `findView` aanmaken, in `windows` registreren, opruimen bij
`closed`, `layoutFind()` toevoegen aan de bestaande `resize`-handler.

**`raiseIsland()` → `raiseOverlays()`**, die eiland én zoekbalk opnieuw bovenop
zet; alle bestaande aanroepen mee omzetten.

**`createTab()`** krijgt vier luisteraars en één aanroep erbij: `context-menu`,
`found-in-page`, `zoom-changed`, `did-navigate` (voor de zoom — apart van de
bestaande lus die alleen `pushState()` doet), en `paginaSneltoetsen(wc, this, id)`.

**`describe()`** krijgt `zoom`.

**`activateTab()`** sluit de zoekbalk als die bij een ander tabblad hoort.
**`closeTab()`** doet hetzelfde en sluit een open contextmenu.

**Nieuwe methoden.** `webContentsVan(tabId)`, `toonPaginaMenu`, `openFind`,
`findQuery`, `findStep`, `closeFind`, `zoek`, `layoutFind`, `setFindSize`,
`sendFind`, `zoomStap`, `print`, `opslaanAlsPdf`, `toonHistorie`.

**Bij het opstarten** één keer `zoomOpslag.laad()` afwachten in
`app.whenReady()`, vóór het eerste venster, zodat het eerste tabblad al de goede
zoom krijgt.

### Nieuwe bestanden

| Bestand | Proces | Wat |
| --- | --- | --- |
| `menu-pagina.js` | hoofd | bouwt het sjabloon voor het paginacontextmenu |
| `zoom-opslag.js` | hoofd | leest/schrijft `zoom.json` in `app.getPath('userData')` |
| `preload-find.js` | preload | de API van de zoekbalk, verder niets |
| `renderer/find.html` | renderer | de pil |
| `renderer/find.css` | renderer | eigen `:root`-variabelen, zoals `island.css` |
| `renderer/find.js` | renderer | invoer, teller, toetsen, zelf opmeten |

Gewijzigd: `main.js`, `preload.js`, `renderer/index.html`, `renderer/app.js`,
`renderer/style.css`. `package.json` heeft `files: ["main.js", "preload.js",
"preload-island.js", "renderer/**"]` — daar moeten `preload-find.js`,
`menu-pagina.js` en `zoom-opslag.js` bij, anders ontbreken ze in de build.

### IPC-kanalen

| Kanaal | Richting | Van/naar | Payload |
| --- | --- | --- | --- |
| `find:open` | renderer → hoofd | zijbalk | `prefill?: string` |
| `find:query` | renderer → hoofd | zoekbalk | `tekst, matchCase` |
| `find:step` | renderer → hoofd | zoekbalk | `richting: 1 \| -1` |
| `find:close` | renderer → hoofd | zoekbalk | — |
| `find:size` | renderer → hoofd | zoekbalk | `breedte, hoogte` |
| `find:state` | hoofd → renderer | zoekbalk | `{ open, tekst, matchCase }` |
| `find:result` | hoofd → renderer | zoekbalk | `{ treffers, actief }` |
| `page:zoom` | renderer → hoofd | zijbalk | `'in' \| 'uit' \| 'reset'` |
| `page:print` | renderer → hoofd | zijbalk | — |
| `page:pdf` | renderer → hoofd | zijbalk | — |
| `page:melding` | hoofd → renderer | zijbalk | `tekst: string` |
| `nav:historie` | renderer → hoofd | zijbalk | `richting, x, y` |

Alle `renderer → hoofd`-kanalen gaan via `ipcMain.handle` en `controllerFor(e)`,
net als de bestaande. De zoekbalk-view komt in dezelfde `windows`-registry, dus
`controllerFor` blijft precies zoals hij is. Een sandboxed tabblad heeft nog steeds
geen preload en kan dus op geen van deze kanalen iets sturen.

**Aan `preload.js` toe te voegen** (expliciet, geen `ipcRenderer` naar buiten):

```js
openFind: (prefill) => ipcRenderer.invoke('find:open', prefill),
zoom: (richting) => ipcRenderer.invoke('page:zoom', richting),
print: () => ipcRenderer.invoke('page:print'),
opslaanAlsPdf: () => ipcRenderer.invoke('page:pdf'),
toonHistorie: (richting, x, y) => ipcRenderer.invoke('nav:historie', richting, x, y),
onMelding: (fn) => ipcRenderer.on('page:melding', (_e, tekst) => fn(tekst)),
```

---

## Wat dit niet oplost

- **Downloads.** "Link opslaan als…" en "Afbeelding opslaan als…" ontbreken in het
  contextmenu, want ze hebben `session.on('will-download')` en een plek om
  voortgang te tonen nodig. Zodra dat er is zijn het twee extra items met
  `wc.downloadURL(params.linkURL)`. Opslaan als pdf zit hier wél in, want dat
  gaat buiten de downloadpijplijn om.
- **Geschiedenis over tabbladen heen.** Alleen de historie ván een tabblad, geen
  Ctrl+H-scherm en geen opslag op schijf.
- **Printvoorbeeld.** Bestaat niet in Electron.
- **Mediabediening in het contextmenu** (afspelen, pauzeren, herhalen,
  picture-in-picture). `params.mediaFlags` vertelt de stand, maar Electron heeft
  geen API om het element te bedienen; dat zou `executeJavaScript` in het juiste
  frame vergen en dat is geen paginabasis meer.
- **Zoeken in de pdf-viewer** en in `<canvas>`.
- **Spellingtalen.** Er is een spellingchecker en er zijn suggesties, maar geen
  scherm om de taal te kiezen (`session.setSpellCheckerLanguages`); dat hoort bij
  instellingen.
- **Zoom van de UI zelf**, en zoom die de find-balk of het eiland meeneemt.
- **De zoekterm onthouden** tussen tabbladen of over een herstart heen.
- **Permissies.** Het eerste punt op de lijst in CLAUDE.md staat, en dit ontwerp
  raakt het niet aan: `printToPDF` en `findInPage` gaan buiten permissies om.

## Onzeker over de Electron-API

Op één plek verzameld, in volgorde van hoe erg het is als het anders blijkt:

1. **`findNext`-semantiek** bij `findInPage` (§2). Als het omgekeerd is, wisselt
   één vlag.
2. **Doet Electron ctrl+wiel-zoom zelf?** (§3) Zo ja, dan mag onze
   `zoom-changed`-handler alleen opslaan en niet ook stappen, anders zoom je
   dubbel.
3. **Overleeft een zoomniveau een herstart binnen een persistente sessie?** (§3)
   Zo ja, dan is `zoom-opslag.js` overbodig.
4. **Werken `print()` en `printToPDF()` op een onzichtbare view?** (§4) Beperkt
   nu tot zichtbare tabbladen, dus het kan hooguit een gemiste kans zijn.
5. **Handelt Blink `Ctrl/Cmd+C` overal af zonder applicatiemenu?** (§5)
6. **De afkaplengte van `params.selectionText`** — in de orde van duizend tekens.
   Daarom kopiëren we nooit via dat veld, dus de exacte grens doet er niet toe.
7. **Blokkeert `Menu.popup` op Windows/Linux?** In oudere Electron-versies deed
   het dat; in 33 ga ik ervan uit van niet. Als het wel zo is, moet het opruimen
   ná `popup()` anders lopen dan hierboven geschetst.
8. **`registerAccelerator: false`** staat in de typings als Windows/Linux. Op
   macOS kan een accelerator in een contextmenu dus mogelijk wél geregistreerd
   worden; als een menu-item daar een toets kaapt, is dat de oorzaak.
