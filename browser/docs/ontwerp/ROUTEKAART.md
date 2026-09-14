# Routekaart

Er liggen negen ontwerpen. Elk afzonderlijk is bruikbaar; samen zijn ze het
niet. Ze voegen ruim honderd IPC-kanalen toe aan een `main.js` van 594 regels
met zeventien handlers, ze verbouwen met z'n zessen dezelfde vijf methoden
(`describe`, `createTab`, `activateTab`, `closeTab`, `addWorkspace`), ze zetten
twee keer dezelfde sessiehandler, ze definiëren twee keer dezelfde functie met
een andere signatuur, en vier van hen hangen hun opslag aan een sleutel die twee
andere aan het vervangen zijn.

Dit document doet drie dingen. Het legt de dwarsbesluiten vast waar de negen
ontwerpen elkaar tegenspreken (§1), het zet ze in een volgorde die te bouwen is
(§2), en het splitst `main.js` zodat er ruimte voor is (§3). Daarna: wat de
criticus vond en wat ermee gebeurt (§4), de drie dingen om nu te beginnen (§5),
en wat er eerst gemeten moet worden (§6).

**Status van dit document.** De negen ontwerpen blijven staan zoals ze zijn;
niemand herschrijft ze. Waar een ontwerp en deze routekaart elkaar tegenspreken,
wint deze routekaart, en dan hoort er bij het bouwen één regel in het betrokken
ontwerp: *"zie ROUTEKAART.md §x"*. Twee punten in `CLAUDE.md` verouderen
hierdoor (de uitbouwvolgorde, en het commentaar bij de `windows`-registry als
§1.4 anders zou uitvallen) — dat zijn projectregels, dus die worden gevraagd en
niet stilzwijgend gewijzigd.

Alles hieronder is geschreven tegen **Electron 33.4.11**. Waar ik een API niet
heb geverifieerd staat dat er expliciet bij, en §6 verzamelt alles wat gemeten
moet worden voordat er code op gebouwd wordt.

---

## 1. Wat hier wordt vastgelegd

Tien besluiten. Ze kosten samen een paar dagen werk, ze leveren niets zichtbaars
op, en zonder hen loopt elk volgend ontwerp vast op het vorige.

### 1.1 IPC-kanalen zijn Engels, de rest is Nederlands

`CLAUDE.md` schrijft `domein:actie` voor en geeft als voorbeelden `tab:new`,
`nav:back`, `island:size`. De bestaande eenentwintig kanalen zijn zonder
uitzondering Engels. De negen ontwerpen leveren daarnaast `download:pauzeer`,
`pref:lees`, `klus:accepteer`, `perm:vraag`, naast `hist:search`, `find:query`
en `sessie:wake-all` — twee talen in hetzelfde domein (`perm:ask` tegenover
`perm:vraag`), soms in hetzelfde document.

**Besluit: het werkwoord in een kanaalnaam is Engels.** Commentaar, methodenamen
(`volgendeStap`, `beschrijfDownload`), veldnamen in payloads en bestandsnamen
blijven Nederlands, precies zoals nu. De reden is niet smaak maar vindbaarheid:
een kanaal is een string die je in twee bestanden tegelijk moet kunnen greppen,
en de bestaande eenentwintig zetten de norm.

Concreet betekent dat voor de ontwerpen:

| In het ontwerp | Wordt |
| --- | --- |
| `download:pauzeer / hervat / annuleer / opnieuw / toon / wis / opruimen / map` | `download:pause / resume / cancel / retry / show / clear / clear-all / folder` |
| `download:toestaan / weiger / paneel` | vervallen — zie §1.6 (`ask:*`) en `ui:open` |
| `pref:lees / zet / map / terug / toon / gewijzigd` | `pref:get / set / folder / reset / reveal / changed` |
| `perm:vraag / antwoord / lijst / zet / vergeet` | `ask:show / ask:answer` (§1.6) en `perm:list / set / forget` |
| `perm:ask / answer / state / set / forget` | idem — `perm:ask`/`perm:answer` gaan op in `ask:*` |
| `sessie:*` | `session:wake-all / discard / dismiss / state` |
| `klus:*`, `notitie:*`, `archief:*`, `lees:*` | `task:*`, `note:*`, `shelf:*`, `read:*` |
| `page:melding`, `ui:melding` | één kanaal: `ui:notice` |
| `ui:palette`, `ui:overlay`, `ui:palette-open` | `ui:overlay` (invoke, teller) en `ui:open` (main → zijbalk) |

De sneltoetstabel uit `instellingen.md` §7 gebruikt sleutels die op kanalen
lijken maar het niet zijn (`tab:nieuw`, `ui:palet`). Die worden puntnamen —
`tab.nieuw`, `ui.palet` — zodat niemand ze in `main.js` gaat zoeken als kanaal.

### 1.2 Eén sessie-opzet, één keer per partitie

Vier ontwerpen roepen `session.fromPartition()` aan in `addWorkspace()` en
hangen er elk hun eigen dingen aan: `hardenSession` (permissies), permissie-
handlers plus `setDownloadPath` plus `will-download` (instellingen),
`koppelDownloads` (downloads), `ws.ses` plus `extensies.pasToe` plus een
`extension-ready`-luisteraar (extensies). Elk met een eigen idempotentie-slot.

Electron houdt per `Session` **precies één** `setPermissionRequestHandler` en
één `setPermissionCheckHandler`; de tweede registratie vervangt de eerste zonder
fout. Twee `will-download`-luisteraars die allebei synchroon iets zetten
(`setSavePath` tegenover `setSaveDialogOptions`) sluiten elkaar uit. Beide falen
stil, en de permissieversie faalt in de richting die veilig lijkt.

**Besluit: één functie `bereidSessieVoor(partitie)` in `lib/sessies.js`, met een
module-brede `Set` als slot, en dat is de enige plek waar een `Session` wordt
ingericht.** Alles wat de sessie nodig heeft registreert zich daar, in vaste
volgorde:

```js
// lib/sessies.js — de enige plek waar een Session wordt ingericht. Sessies zijn
// gedeeld tussen vensters, dus dit mag per partitie precies één keer gebeuren.
const gereed = new Set();

function bereidSessieVoor(partitie) {
  const ses = session.fromPartition(partitie);
  if (gereed.has(partitie)) return ses;
  gereed.add(partitie);

  permissies.harden(ses, partitie);   // beide permissiehandlers, device/bluetooth/display
  identiteit.zet(ses);                // setUserAgent(ua, acceptLanguages)
  downloads.koppel(ses, partitie);    // de enige will-download
  privacy.koppel(ses, partitie);      // webRequest: ping, referer, Sec-GPC
  extensies.pasToe(ses, partitie);    // later; leeg tot stap 11
  return ses;
}
```

Volgorde is betekenisvol: harden staat vooraan omdat er daarna pas iets mag
laden. `addWorkspace()` roept deze functie aan direct nadat de partitiestring
gemaakt is, en `app.whenReady()` roept hem aan voor `session.defaultSession`
vóór het eerste venster.

`setDownloadPath()` verdwijnt volledig. De downloadmap wordt per item gezet in
`will-download` (`item.setSavePath`), omdat de map van de **eigenaar** afhangt
en een sessie-instelling dat verschil niet kent. `instellingen.md` levert de
*waarde* via `voorkeuren.js`; het registreert zelf niets.

### 1.3 Eén sneltoetsrouter

Drie ontwerpen hangen elk een eigen `before-input-event` per webContents op —
`paginaSneltoetsen(wc, ctrl, tabId)` uit pagina-basis, `paginaSneltoetsen(wc)`
uit geschiedenis (zelfde naam, andere signatuur), en `sneltoetsen(wc, controller)`
uit instellingen dat `devtoolsSneltoets` vervangt. Drie luisteraars zien elkaars
`preventDefault()` niet, dus één toets kan twee dingen doen.

**Besluit: `lib/sneltoetsen.js` met één tabel en één functie
`bindSneltoetsen(wc, ctx)`, aangeroepen op élke webContents die het venster
maakt** — zijbalk, eiland, elk tabblad, elke nevenview. `devtoolsSneltoets()`
gaat erin op. De tabel is één array van `{ actie, standaard, vast, doet }` en
`voorkeuren.js` mag er zes overschrijven. De `keydown`-luisteraar in
`renderer/app.js` verliest al zijn globale toetsen en houdt alleen wat binnen de
commandobalk hoort (pijltjes, Enter, Escape terwijl het palet open staat).

De toetsverdeling, met twee wijzigingen ten opzichte van de ontwerpen:

| Toets | Actie | Opmerking |
| --- | --- | --- |
| `Ctrl+T` / `Ctrl+W` / `Ctrl+L` / `Ctrl+K` / `Ctrl+J` | tabblad, sluiten, adres, palet, eiland | herbindbaar; werken nu ook terwijl de pagina focus heeft |
| `Ctrl+N` | nieuw venster | nieuw, zie §2 stap 4 |
| `Ctrl+Shift+T` | laatst gesloten tabblad terug | nieuw |
| `Ctrl+Tab` / `Ctrl+Shift+Tab` | volgend/vorig tabblad | nieuw |
| **`Ctrl+1`…`Ctrl+9`** | **naar het zoveelste tabblad** | **wijziging**: dit ging naar workspaces |
| **`Ctrl+Shift+1`…`9`** | **naar de zoveelste workspace** | **wijziging** ten opzichte van `app.js` en instellingen §7 |
| `Ctrl+F` / `Ctrl+P` / `Ctrl+D` / `Ctrl+H` / `Ctrl+O` / `Ctrl+,` | zoeken, printen, bladwijzer, geschiedenis, bestand openen, instellingen | |
| `Ctrl+Shift+J` | downloadpaneel | niet `Ctrl+J`, dat is het eiland |
| `Ctrl` + `+` / `-` / `0`, `Alt+←` / `Alt+→` | zoom, terug/vooruit | |
| `F11` | volledig scherm | |
| `F12`, `Ctrl+Shift+I` | devtools | vast |
| `Escape` | zie §1.6 | vast |

`Ctrl+1..9` naar tabbladen is de reeks die alle vier de referentiebrowsers
gebruiken; workspaces zijn hier het bijzondere geval en verdienen de langere
combinatie. Dit spreekt `instellingen.md` §7 tegen, dat `Ctrl+1..9` juist aan
workspaces vastzet als niet-herbindbaar.

**Onzeker:** op macOS blijft het applicatiemenu staan, en een menu-accelerator
wint vermoedelijk van `before-input-event`. Zodra het macOS-menu er is (stap 4)
worden de toetsen daar als `accelerator` in gezet en registreert de router ze op
dat platform niet. Meten voordat je erop bouwt.

### 1.4 Eén registry, en de invariant uit CLAUDE.md blijft staan

`CLAUDE.md` zegt dat `windows` alleen de twee webContents mét preload kent en
dat `controllerFor()` daarom sluitend is. Vier ontwerpen breken dat elk anders:
pagina-basis zet zijn `findView` erin, geschiedenis zet elke archieftab erin
(en noemt zelf het lek dat daarbij hoort), instellingen maakt een aparte map
`instellingenViews`, extensies houdt zijn popup er bewust buiten met de juiste
reden ("die registry geeft toegang tot álle kanalen"), en permissies legt er nog
een omgekeerde index naast.

**Besluit: extensies heeft gelijk. `windows` houdt zijn invariant.** Er komt
één tweede registry voor alles wat een preload heeft maar geen zijbalk of eiland
is:

```js
// lib/registry.js
const windows = new Map();      // wc.id -> controller  (alleen zijbalk + eiland)
const neven = new Map();        // wc.id -> { controller, rol }
const tabbladen = new Map();    // wc.id -> { controller, ws, tabId }

const controllerFor = (e) => windows.get(e.sender.id) ?? null;
// Een nevenview mag alleen de kanalen van zijn eigen rol. Zonder deze controle
// zou de zoekbalk tab:close kunnen aanroepen.
const nevenVan = (e, rol) => (neven.get(e.sender.id)?.rol === rol ? neven.get(e.sender.id).controller : null);
const bronVan = (wc) => tabbladen.get(wc?.id) ?? null;
```

`rol` is `'find' | 'instellingen' | 'archief' | 'ext-popup'`. Elke handler van
een nevenview begint met `nevenVan(e, '<rol>')` in plaats van `controllerFor(e)`,
en daarnaast blijft de origincontrole op `event.senderFrame` staan voor de
interne pagina's. Twee sloten, en het tweede is een grep-bare functie in plaats
van een afspraak per document.

`tabbladen` is de omgekeerde index die permissies wil. `downloads.md` kiest
bewust het tegenovergestelde (lineair zoeken, "een tweede registry kan
verouderen") — dat argument vervalt zodra de index op precies één plek wordt
bijgehouden: `createTab()` vult, `closeTab()` en `wc.once('destroyed')` legen.
Dat is één bestand, niet vier.

### 1.5 De workspace-sleutel wordt nú stabiel, niet later

`this.nextWorkspaceId` begint bij **1 in elk venster en bij elke start**.
Instellingen, permissies, downloads, extensies en zoom sleutelen hun opslag
daarom op de partitienaam (`ws-1`) omdat het id instabiel is — terwijl
sessieherstel en onderscheidende-features die partitienaam juist aan het
vervangen zijn door een app-brede, nooit hergebruikte teller. Wie het eerst
bouwt, bepaalt of de andere vier hun bestanden kwijt zijn.

**Besluit: de app-brede teller komt in het fundament, vóórdat het eerste bestand
met een partitiesleutel bestaat.** Dan is er geen migratie: er is nog niets om
te migreren. Uitgesteld tot stap 6 kost dezelfde wijziging vijf migraties en een
paragraaf in vijf documenten.

Concreet: `userData/app.json` met `{ versie: 1, volgendeWorkspaceId: 7 }`, via
`lib/opslag.js` (§1.7). `addWorkspace()` haalt zijn id daaruit. Voor een
bestaande installatie: `volgendeWorkspaceId = max(bestaande ws-map in Partitions) + 1`,
en bestaande partities blijven waar ze zijn.

Bijvangst die het noemen waard is: hiermee delen twee vensters niet langer
`persist:ws-1`. Vijf ontwerpen besteden daar een risicoparagraaf aan, en
`instellingen.md` en `permissies-en-privacy.md` spreken elkaar erover tegen
(het ene noemt het de juiste keuze, het andere een botsing). Die hele discussie
vervalt.

### 1.6 Eén vraag, één wachtrij, één knoppenrij in het eiland

`island.js` heeft één `onStand`-handler, één `gaKnop` en één `stopKnop`. Drie
ontwerpen herbedraden die tegelijk: downloads wil er `download:toestaan` /
`download:weiger` op, permissies wil er Toestaan / Deze keer / Blokkeren op, en
sessieherstel wil er Opnieuw / kruisje op — dat laatste via een veld `hersteld`
op `island:state`, dat `island.js` bij `modus: 'rust'` nooit leest omdat die tak
meteen terugkeert.

Daar komen bij: HTTP-basisauthenticatie (§4), `will-prevent-unload` (§4), een
vastgelopen pagina (§4) en de bestaande `actie`-stap van de assistent. Dat zijn
zeven partijen voor twee knoppen.

**Besluit: één vraagmechanisme met twee kanalen, en het eiland tekent alleen wat
het krijgt.**

| Kanaal | Richting | Payload |
| --- | --- | --- |
| `ask:show` | main → eiland | `{ id, soort, regel, detail?, knoppen: [{ id, label, toon }] }` of `null` |
| `ask:answer` | eiland → main | `(id, knopId)` |

`soort` is `'permissie' | 'login' | 'download' | 'unload' | 'vastgelopen' |
'assistent' | 'hersteld'` en bepaalt alleen de kleur van de glyph. `toon` is
`'ga' | 'zacht' | 'gevaar'` en bepaalt de knopkleur uit `island.css`. Het
hoofdproces houdt één wachtrij per venster, één zichtbare vraag tegelijk, met de
regels die `permissies-en-privacy.md` §4/§6 al beschrijft: precies één antwoord
per vraag, klok van 60 s, id-controle tegen spoofing, wegvallen bij sluiten of
wegnavigeren van het tabblad.

Gevolgen: `perm:ask`/`perm:answer` vervallen als aparte kanalen; het eiland
krijgt géén `download:toestaan`; de assistentstap `actie` wordt een gewone
`ask:show` met knoppen "Ga door" en "Niet nu"; `island:state` houdt alleen de
regel en de modus van de assistent, en de vroege uitgang bij `'rust'` mag weg.
De vraag mag het eiland één regel hoger maken — dat is een gebeurtenis, geen
animatie, en `meet()` regelt de rest.

**Escape heeft één betekenis: sluit de bovenste laag.** Volgorde: native menu
(doet Chromium zelf) → extensiepopup → zoekbalk → openstaande vraag (telt als
"blokkeren, deze keer") → commandobalk. De router (§1.3) kent die volgorde; geen
enkel ander bestand mag Escape afvangen.

### 1.7 Eén opslaglaag

Zeven ontwerpen schrijven elk hun eigen atomaire schrijver: `zoom.json`,
`downloads.json`, `bladwijzers.json` + JSONL, `voorkeuren.json`,
`permissies.json`, `extensies.json`, `sessie/staat.json`, `archief.json`,
`notities.json`. Elk met een eigen debounce, een eigen tmp+rename, een eigen
antwoord op `EPERM`/`EBUSY` op Windows en een eigen kapot-bestand-beleid.
Daarnaast drie keer `app.requestSingleInstanceLock()` en drie keer een
`before-quit`-flush waarvan er één (`instellingen.md` §12) `preventDefault()`
doet en de hele keten een tweede keer laat draaien.

**Besluit: `lib/opslag.js` is de enige schrijver.**

```js
// Eén debounce, één tmp+rename met drie pogingen voor de virusscanner op
// Windows, één kapot-bestand-beleid, één synchrone spoeling bij het afsluiten.
opslag.registreer(naam, { standaard, valideer });  // 'voorkeuren', 'permissies', …
opslag.lees(naam);              // uit het geheugen; synchroon geladen bij het starten
opslag.zet(naam, data);         // geheugen bij, schrijfactie plannen (250 ms)
opslag.plan(naam);              // idem, na een wijziging in-place
opslag.flushSync();             // alles, synchroon — precies één aanroeper
opslag.vergeetPartitie(p);      // elke module haakt hier in; zie hieronder
```

Het JSONL-logboek van de geschiedenis is de enige uitzondering: append-only is
een ander patroon en zit in `geschiedenis.js`, maar zijn synchrone spoeling
wordt wél via `opslag.flushSync()` aangeroepen.

`app.on('before-quit')` staat **één keer**, in `main.js`, en doet in vaste
volgorde: (1) `opslag.flushSync()`, (2) `sessie.nu({ schoon: true })`, (3) als
er workspaces met "wissen bij afsluiten" zijn: één keer `preventDefault()`, de
`clearStorageData()`-beloften met een harde limiet van 2 seconden, dan
`app.exit(0)`. Eén handler, dus geen tweede ronde door de keten. En dat blijft
best effort: bij `app.exit()`, een crash of uitloggen uit Windows wordt er niets
gewist. Dat mag geen incognito heten en zo staat het ook in de UI.

`vergeetPartitie(p)` lost de andere botsing op: `closeWorkspace()` krijgt van
drie ontwerpen drie manieren om sessiedata weg te gooien. Er is er één —
prullenbak + `session.clearData()` — en elke module die iets op partitiesleutel
bewaart registreert een opruimfunctie. Anders erft een nieuwe workspace de
permissies van een oude terwijl zijn cookies wél weg zijn.

### 1.8 `ws.tabs` wordt een record, en een koud tabblad heeft geen view

`onderscheidende-features.md` verandert `ws.tabs` van `Map<id, WebContentsView>`
naar `Map<id, record>` en zegt er zelf bij dat dat een eigen wijziging hoort te
zijn. Vier andere ontwerpen lezen `ws.tabs.get(id).webContents` en breken stil.
`sessieherstel-en-data.md` heeft dezelfde refactor nodig zodra blijkt dat een
`WebContentsView` zonder `loadURL` toch een rendererproces kost — een aanname
die het document zelf niet geverifieerd heeft — en noemt beide toestanden anders
(`koud` tegenover `slaapt`).

**Besluit: de refactor komt in het fundament, en er is één toestand die `koud`
heet.**

```js
/** @type {Map<number, {id, view: WebContentsView|null, url, titel, favicon,
 *   koud: boolean, vastgezet: boolean, hoorbaar: boolean, gedempt: boolean,
 *   scroll: {x,y}|null, voormaligeEigenaar: string|null }>} */
ws.tabs
```

Een koud tabblad heeft **geen** view. Dat maakt de meting uit
`sessieherstel-en-data.md` §13 overbodig, laat `renderer/slaap.html` vervallen
(een koud tabblad is niet zichtbaar; activeren warmt het op) en geeft de klus,
het archief en het sessieherstel dezelfde structuur. `describe()` leest bij
`koud` uit het record: `loading: false`, `canGoBack/Forward: false`.
`allViews()` slaat records zonder view over, `layoutPagina()` en `closeTab()`
idem. Helper: `wcVan(tabId)` in plaats van `ws.tabs.get(id)?.webContents` op vijf
plekken.

Vandaag zijn er zes aanroepplekken. Na drie ontwerpen zijn het er twintig.

### 1.9 Eén layout-eigenaar en één stapelvolgorde

Drie ontwerpen herschrijven de layout alsof ze de enige zijn: pagina-basis maakt
van `raiseIsland()` een `raiseOverlays()` en zet `layoutFind()` in de
resize-handler, onderscheidende-features maakt van `layoutActiveTab()` een
`layoutPagina()` met split, extensies zet `layoutExtensiePopup()` in dezelfde
handler maar noemt geen raise-aanroep — waardoor zijn popup onder het
eerstvolgende nieuwe tabblad verdwijnt, want `createTab()` roept `raiseIsland()`
aan. En HTML5-fullscreen, dat `permissies-en-privacy.md` §3 toestaat, is van
niemand.

**Besluit: `lib/layout.js`, met de controller als argument, en één vaste
stapelvolgorde:**

```
pagina (links)  <  pagina (rechts, split)  <  notitiepaneel*  <  eiland  <  zoekbalk  <  extensiepopup
```

*(het notitiepaneel is HTML in de zijbalkrenderer en ligt dus per definitie
onder alle views; het staat hier alleen om de leesvolgorde compleet te maken.)*

`layout.js` bevat `layoutAlles(ctrl)` (roept de deelfuncties in volgorde aan),
`layoutPagina`, `layoutIsland`, `layoutFind`, `layoutExtensiePopup`,
`verhoogOverlays` en de fullscreen-afhandeling:

```js
// Onze bounds worden met de hand berekend, dus een pagina die fullscreen gaat
// blijft anders gewoon in zijn rechthoek staan met de zijbalk ernaast.
wc.on('enter-html-full-screen', () => ctrl.zetFullscreen(tabId, true));
wc.on('leave-html-full-screen', () => ctrl.zetFullscreen(tabId, false));
```

`zetFullscreen(true)` zet de view op `win.getContentBounds()`, verbergt eiland,
zoekbalk en extensiepopup, klapt een eventuele split dicht en onthoudt de vorige
stand; `false` draait alles terug via `layoutAlles()`. `F11` doet
`win.setFullScreen()` en loopt door dezelfde functie.

`setPaletteOpen()` wordt `setOverlay(open)` (teller, §1.10) en verbergt **alle**
zichtbare views, niet alleen `this.tabs.get(this.activeId)`. Anders zweeft er
straks een zoekbalk boven een weggenomen pagina.

### 1.10 `pushState()` wordt gebundeld, `describe()` mag groeien

Zes ontwerpen breiden `describe()` uit (`zoom`, `bladwijzer`, `slot`, `koud`,
`kant`, `lezen`, `heeftNotitie`, `hoorbaar`, `hersteldVan`), terwijl downloads en
extensies juist uitwijken naar een eigen kanaal met een eigen klok omdat
`pushState()` bij elke gebeurtenis de hele tabbladlijst hertekent en daarmee elke
glyph-animatie herstart.

**Besluit: de velden mogen erbij — de zijbalk heeft ze nodig — maar `pushState()`
krijgt een trailing debounce van 50 ms, met een directe push bij structurele
wijzigingen** (tabblad erbij, weg, geactiveerd, workspace gewisseld). Hoogfrequente
stromen (downloads 250 ms, extensies, permissiestand) houden hun eigen kanaal.
Daarnaast: `renderTab()` in `app.js` hertekent alleen rijen waarvan de payload
werkelijk veranderde, in plaats van `replaceChildren` over de hele lijst — dat is
de echte oorzaak, en het is twintig regels.

`hoorbaar` heeft geen event dat er betrouwbaar bij hoort (de naam van het
audio-event in Electron 33 ken ik niet zeker), dus dat veld komt van een
`setInterval` van 2 s die `wc.isCurrentlyAudible()` over de tabbladen van de
actieve workspace leest. Verandert er niets, dan gebeurt er ook niets.

### 1.11 Eén interne-pagina-mechanisme

Vier ontwerpen bouwen elk hun eigen platform voor "een pagina van onszelf met
rechten": het `tougather:`-schema met `persist:archief` en `preload-pagina.js`
(geschiedenis), een `file:`-pagina met `preload-instellingen.js` en drie sloten
(instellingen), de `findView` met `preload-find.js` (pagina-basis), en de
extensiepopup. Vier navigatiesloten, vier afzendercontroles, vier kansen op een
lek.

**Besluit: één mechanisme, `lib/intern.js`, gebouwd op het `tougather:`-schema.**

- `protocol.registerSchemesAsPrivileged([{ scheme: 'tougather', privileges:
  { standard: true, secure: true, supportFetchAPI: true } }])` op moduleniveau,
  vóór `whenReady`.
- Eén sessie `persist:intern` waar élke interne pagina in draait, met
  `ses.protocol.handle('tougather', …)` en een **witte lijst** van bestanden —
  geen padrekenwerk.
- Eén preload `preload-intern.js` die per pagina een andere set methoden
  blootstelt, gekozen op `location.host` (`archief`, `instellingen`).
- Eén navigatieslot (`will-navigate` → `preventDefault` + `createTab(doel)`,
  `setWindowOpenHandler` → altijd `deny`) en één afzendercontrole
  (`nevenVan(e, rol)` plus `new URL(e.senderFrame.url).host`).

De zoekbalk (`find`) en de extensiepopup krijgen géén `tougather:`-URL — de
eerste is een pil zonder navigatie, de tweede draait per definitie in de
workspace-sessie — maar ze gebruiken wél `neven` en `nevenVan`. De foutpagina,
de slaappagina en de leespagina hebben geen preload nodig en blijven
`file:`-bestanden.

**Onzeker** (uit `geschiedenis-en-bladwijzers.md` §13, ik heb het niet
geverifieerd): of `Session#protocol.handle` in 33 bestaat, of `net.fetch()` een
`file:`-URL accepteert binnen een protocol-antwoord, en of `event.senderFrame`
de vorm heeft die hier wordt aangenomen. Terugvalopties staan in dat document.
Dit is de eerste meting van stap 7.

### 1.12 Twee bronnen voor één kleur: niet doen

`ui-systeem.md` haalt `#00000000`, `#e8ebef` en de vier maten uit `main.js` en
zet ze in `renderer/tokens.js`, naast `tokens.css` — en flagt zelf dat de holle
hoekjes van het eiland zichtbaar breken als die twee uiteenlopen. Dat lost het
letterlijke verbod uit `CLAUDE.md` op zonder de reden ervan op te lossen.

**Besluit: de maten en de kleuren gaan uit elkaar.**

- Maten (`SIDEBAR_WIDTH`, `TOPBAR_HEIGHT`, `CONTENT_GAP`, `CONTENT_RADIUS`,
  `FIND_MARGE`, `SPLIT_GAP`, `SPLIT_MIN`, `NOTITIE_BREEDTE`) → `lib/maten.js`.
  Dat zijn getallen, geen kleuren; `CLAUDE.md` verbiedt daar niets over, en de
  layout hoort de waarheid te zijn.
- Kleuren → de zijbalk meldt ze. Nieuw kanaal `ui:colors` (zijbalk → main,
  invoke), verstuurd bij `did-finish-load` en opnieuw wanneer de zijbalk zelf
  een themawissel ziet:

  ```js
  // renderer/app.js
  const stijl = getComputedStyle(document.documentElement);
  browser.meldKleuren({
    plafond: stijl.getPropertyValue('--plafond').trim(),
    symbool: stijl.getPropertyValue('--plafond-symbool').trim(),
  });
  ```

  `main.js` cachet ze en roept `setTitleBarOverlay()` aan. Prijs: bij de
  allereerste render staat de titelbalk één frame op de standaardkleur.
  `ui-systeem.md` verwerpt dat om die reden; ik vind één frame goedkoper dan
  twee bronnen die stil uiteenlopen. `#00000000` blijft als
  `backgroundColor: 'transparent'` — dat is een sleutelwoord, geen hexwaarde.

`renderer/tokens.css` uit `ui-systeem.md` komt er wel, en wordt als eerste
stylesheet geladen door `index.html`, `island.html` en de pagina's. De grote
herschrijving van `style.css`/`island.css`/`newtab.css` komt niet: alleen de
gedeelde tokens verhuizen, de rest blijft staan tot iemand dat bestand toch
openslaat.

---

## 2. De volgorde

Elke stap is op zichzelf af, en geen stap begint aan iets dat een latere stap
moet terugdraaien. De schattingen zijn ruw en gaan uit van één iemand.

### Stap 1 — De grendel (½ dag)

**Wat.** Het permissiegat en het `openExternal`-gat dicht, zonder opslag, zonder
UI, zonder wachtrij. In `addWorkspace()` en voor `session.defaultSession`:

```js
ses.setPermissionRequestHandler((wc, permissie, cb) => cb(TOEGESTAAN.has(permissie)));
ses.setPermissionCheckHandler((wc, permissie) => TOEGESTAAN.has(permissie));
ses.setDevicePermissionHandler(() => false);
ses.setBluetoothPairingHandler((_d, cb) => cb({ confirmed: false }));
ses.setDisplayMediaRequestHandler((_r, cb) => cb({}));
```

`TOEGESTAAN` is de toelatingslijst uit `permissies-en-privacy.md` §3 met alleen
de regels die daar `toestaan` zijn: `clipboard-sanitized-write`, `fullscreen`,
`pointerLock`, `storage-access`, `top-level-storage-access`. Alles wat zou
vragen wordt geweigerd. Plus de strikte `setWindowOpenHandler` met
`beoordeelURL()` uit §9 van datzelfde document: altijd `{ action: 'deny' }`, een
popup uit een assistenttabblad erft de eigenaar en activeert niet, en
`shell.openExternal` gebeurt voorlopig **nooit** (`extern` → niets doen, met een
`ui:notice`). Plus `will-navigate` / `will-frame-navigate` / `will-redirect` op
elk tabblad.

**Waarom hier.** Dit is punt 1 van `CLAUDE.md`, het is een halve dag, en het
faalt in de veilige richting. `shell.openExternal` op elk niet-http-schema is
bovendien ernstiger dan het permissiegat: op Windows is `ms-msdt:` een bekende
weg naar code-uitvoering, en daar komt geen vraag aan te pas.

**Wat er eerst moet.** Niets. Dit is de enige stap die vóór het fundament mag
landen, juist omdat hij nergens van afhangt.

**Wat het niet oplost.** Je kunt hierna geen camera meer gebruiken, ook niet als
je dat wilt. `mailto:`-links doen niets. Dat is de bedoeling tot stap 7; zet het
in de release notes van je eigen build.

### Stap 2 — Fundament en de splitsing van main.js (3–4 dagen)

**Wat.** De tien besluiten uit §1, plus de splitsing uit §3. In één reeks kleine,
verifieerbare wijzigingen:

1. `lib/`-map, `package.json` `build.files` één keer goed (`["main.js",
   "preload*.js", "lib/**", "renderer/**"]`) — daarmee vervalt de
   "vergeet package.json niet"-paragraaf in alle negen ontwerpen.
2. `lib/registry.js`, `lib/maten.js`, `lib/url.js` (`toURL`, `beoordeelURL`,
   `isIntern`, `VERBODEN_SCHEMA`) — verplaatsen, niet herschrijven.
3. `lib/opslag.js` + `userData/app.json` + de app-brede workspace-teller (§1.5).
4. `lib/sessies.js` met `bereidSessieVoor()`; stap 1 verhuist erin.
5. `lib/sneltoetsen.js`; `devtoolsSneltoets` gaat erin op, `app.js` levert zijn
   globale toetsen in.
6. `ws.tabs` wordt een record (§1.8), `wcVan(tabId)`, `describe()` leest uit het
   record bij `koud`.
7. `lib/layout.js` (§1.9), inclusief fullscreen.
8. `pushState()`-bundeling en de diff in `renderTab()` (§1.10).
9. `ui:overlay` als teller, `ui:notice`, `ui:open`, `ui:colors`.
10. `app.requestSingleInstanceLock()` + `second-instance` (argv lezen, url of
    bestand openen, venster naar voren) + `app.on('open-url')` en
    `app.on('open-file')` op macOS. En het **sleep-slot**: `preventDefault` op
    `dragover`/`drop` in `app.js` én `will-navigate` op `this.win.webContents`,
    want een bestand op de zijbalk laten vallen navigeert vandaag de hele UI naar
    `file:///…` en dan is de app weg tot je herstart. Dat is geverifieerd: er
    staat nul afhandeling van `dragover`/`drop` in de renderer.
11. `renderer/tokens.css` met de gedeelde tokens.

**Waarom hier.** Zes ontwerpen raken dezelfde vijf methoden. Elke dag dat dit
wacht, wordt de wijziging groter en de samenvoeging riskanter. En de
workspace-sleutel is nu gratis en over drie maanden een migratie in vijf
bestanden.

**Wat er eerst moet.** Stap 1, zodat de sessie-opzet meteen op zijn plek staat.

**Wat er mis kan gaan.** Dit is een verplaatsing van werkende code zonder
gedragswijziging, en juist daarom verleidelijk om "meteen even" te verbeteren.
Niet doen: één commit per punt, telkens `npm start` en doorklikken. De enige
echte gedragswijzigingen zijn de sneltoetsverdeling (§1.3) en het feit dat twee
vensters geen partitie meer delen.

**Wat het niet oplost.** Niets zichtbaars. Er is na deze stap geen enkele nieuwe
functie.

### Stap 3 — Pagina-basis A: contextmenu, zoeken, pdf, foutpagina (3–4 dagen)

**Wat.** Uit `pagina-basis.md` de eerste helft:

- Het contextmenu (`wc.on('context-menu')` + `Menu.buildFromTemplate` in
  `lib/menu-pagina.js`), met expliciete `click`-handlers in plaats van `role`s,
  precies zoals dat document beschrijft. Inclusief het kleine adresbalkmenu met
  "Plakken en gaan".
- Zoeken op de pagina: `findInPage` / `stopFindInPage` / `found-in-page`, met de
  zoekbalk als tweede nevenview (`preload-find.js`, `renderer/find.*`), kanalen
  `find:open / query / step / close / size / state / result`.
- **PDF inline.** `webPreferences.plugins: true` in `createTab()`. Vandaag staat
  die op `false` en is er dus geen viewer, terwijl `pagina-basis.md` regel 331
  ervan uitgaat dat er een is en `downloads.md` een `.pdf` als download behandelt.
  Besluit: een pdf opent in het tabblad. `describe()` toont de gewone URL en de
  titel die Chromium geeft. Downloaden gebeurt alleen bij
  `Content-Disposition: attachment` of via "Link opslaan als" (stap 5).
- De foutpagina uit `ui-systeem.md` §7.8 op `did-fail-load`, met
  `isMainFrame`-controle en `errorCode -3` (ERR_ABORTED) overgeslagen.
- `ui:notice` als smalle meldingsregel onder de adresbalk.

**Waarom hier.** Dit is punt 3 en 4 van de lijst in `CLAUDE.md`, het is het
kleinste pakket dat een gebruiker onmiddellijk merkt, en de zoekbalk is de eerste
nevenview: hij bewijst of breekt het overlaymechanisme waar drie andere
ontwerpen op leunen (extensiepopup, split, fullscreen).

**Wat er eerst moet.** Stap 2 (nevenregistry, layout, sneltoetsrouter).

**Onzeker.** Of `plugins: true` in Electron 33 voldoende is voor de interne
pdf-viewer, of die viewer samengaat met `sandbox: true`, en of `findInPage` erin
werkt (`pagina-basis.md` gaat ervan uit van niet). Meet dit vóór de rest van de
stap: het antwoord bepaalt of "een pdf is een tabblad" of "een pdf is een
download" de regel wordt. Verder: de `findNext`-vlag van `findInPage` is
tegen-intuïtief gedocumenteerd; als het omgekeerd blijkt, wisselt één vlag.

**Wat het niet oplost.** Zoom, printen, opslaan als pdf en de historiemenu's uit
hetzelfde document staan hier niet in — die komen in stap 9. "Link opslaan
als…" en "Afbeelding opslaan als…" ontbreken tot stap 5.

### Stap 4 — Tabbladen, vensters en de dingen die elke browser heeft (5–7 dagen)

Dit is de stap die de criticus grotendeels heeft geschreven. Het zijn twaalf
kleine dingen die allemaal dezelfde twee functies raken en die stuk voor stuk
opvallen door hun afwezigheid.

**Tabbladbeheer.**
- Contextmenu op een tabblad in de zijbalk: sluiten, dupliceren, sluit andere,
  sluit rechts, vastzetten, dempen, **naar workspace verplaatsen**, kopieer
  adres, en (na stap 9) "naast dit tabblad leggen". Nieuw kanaal `tab:menu`
  (zijbalk → main, met `x`/`y` uit `getBoundingClientRect()`), gebouwd met
  `Menu.buildFromTemplate`. Dit lost meteen een botsing op:
  `onderscheidende-features.md` hangt zijn split-view-ingang op aan "de knop in
  het contextmenu van een tabblad" terwijl `pagina-basis.md` besluit dat de
  zijbalk geen contextmenu krijgt. Die regel van pagina-basis blijft staan voor
  *lege* zijbalkruimte; een tabblad krijgt er wél een.
- Slepen om te ordenen (HTML5 drag binnen `#tablist`, `tab:move(id, index)`).
  Let op: `closeTab()` rekent nu op de invoegvolgorde van de `Map` via
  `order[index + 1]`; dat blijft kloppen zolang herordenen de `Map` echt
  herbouwt.
- Middenklik sluit, `Ctrl`-klik opent op de achtergrond.
- `Ctrl+Shift+T`: een ring van 25 gesloten tabbladen per venster
  (`{ url, titel, wsKey, index, owner }`), gevuld in `closeTab()`, kanaal
  `tab:reopen`.
- Dempen: `hoorbaar` in `describe()` (§1.10), luidsprekertje in `renderTab()`,
  `tab:mute` → `wc.setAudioMuted()`. Dit is hier scherper dan in Chrome: het
  lawaai komt uit een tabblad dat je niet ziet en niet zelf hebt geopend.

**Vensters.**
- `Ctrl+N` → `window:new` → `new BrowserWindowController()`. Twee regels, en het
  maakt de risicoparagrafen over meerdere vensters in vijf ontwerpen eindelijk
  testbaar.
- `win.setTitle(titel + ' — Tougather')` bij elke `pushState`; anders heet elk
  venster in alt-tab hetzelfde.
- `F11` en `win.on('app-command')` voor `browser-backward` / `browser-forward`
  (Windows/Linux). **Onzeker:** of `app-command` ook vuurt terwijl de focus in een
  `WebContentsView` ligt; zo niet, dan blijven `Alt+←`/`Alt+→` uit de router het
  enige pad.
- macOS-applicatiemenu: `Menu.buildFromTemplate` met Bestand / Bewerken /
  Geschiedenis / Bladwijzers / Venster / Help. Nu draait
  `Menu.setApplicationMenu(null)` alleen als `!isMac`, dus op macOS staat er een
  menu dat "Electron" heet met `Cmd+W` als Close Window — precies de toets die de
  router aan `tab.sluit` geeft. Op macOS komen de toetsen als `accelerator` in
  het menu en registreert de router ze niet.

**Vragen die nu nergens landen** (alle vier via `ask:show`, §1.6):
- `will-prevent-unload`: "Deze pagina heeft niet-bewaard werk. Toch sluiten?"
  Electron negeert de dialoog standaard en sluit gewoon door. Dit raakt
  `closeTab`, `closeWorkspace`, `win.on('close')`, het herladen na een
  permissie-intrekking en het automatisch archiveren uit stap 10.
  **Onzeker:** of `webContents.close()` `beforeunload` überhaupt afvuurt; zo niet,
  dan moet `closeTab` eerst `wc.close()` proberen en op het event wachten.
- `app.on('login')` / `wc.on('login')` voor 401 en proxy-authenticatie:
  `event.preventDefault()` en `callback(gebruiker, wachtwoord)`. Zonder handler
  annuleert Electron het verzoek en krijg je een lege pagina zonder uitleg —
  intranet, routers, NAS'en, elke bedrijfsproxy. **Harde regel: een tabblad met
  een eigenaar krijgt deze vraag nooit; die wordt geweigerd** (`callback()` zonder
  argumenten). En: we bewaren geen wachtwoorden, ook niet "voor deze sessie" —
  er is geen kluis en die komt er ook niet (§4).
  **Onzeker:** de exacte parameters van het `login`-event in 33.
- `wc.on('unresponsive')` / `'responsive'`: "Deze pagina reageert niet" met
  Wachten / Sluiten (`wc.forcefullyCrashRenderer()`).
- Paginadialogen (`alert` / `confirm`): eerst **meten** wat Electron 33 doet met
  een `WebContentsView` die niet zichtbaar is. Levert dat een native modaal
  venster op boven het hoofdvenster, dan is de tussenoplossing dat we het
  betreffende tabblad eerst activeren, zodat je in elk geval ziet waar het
  vandaan komt. Een echte tab-modale dialoog kunnen we niet bouwen zonder de
  pagina te dimmen, en dat is een eigen ontwerpje.

**Verbindingsindicator.** Het slotje in `#controls` (dat permissies toch al
toevoegt) doet dubbel werk: bij `http:` toont het "Niet veilig" in `--danger`.
Geen certificaatscherm — `permissies-en-privacy.md` §14 verbiedt een
`certificate-error`-handler en die regel blijft staan. Gemengde inhoud
detecteren we niet; Chromium blokkeert actieve gemengde inhoud zelf.

**Vaste volgorde in de zijbalk**, zodat de volgende drie ontwerpen niet meer om
dezelfde twee regels in `index.html` hoeven te vechten:

```
#drag-strip · #controls (terug, vooruit, herladen, ⟵spacer⟶, slot, ster)
#address (+ later #suggesties) · #zoom · #pinned · #herstel
#tablist (flex: 1)
#downloads · #extensions · #new-tab · footer#workspaces (+ tandwiel)
```

Panelen die *binnen* de zijbalk over `#tablist` schuiven (`position: absolute`
in `#sidebar`): `#site-panel`, `#mark-pop`, `#kijkdoos`, `#ext-panel`. De
zijbalk is 264 px en hiermee vol; wat er daarna bij wil, moet iets anders eruit
duwen.

**Waarom hier.** Dit is het verschil tussen "een Electron-app met tabbladen" en
"een browser". Het is bovendien de stap die het meest van de bestaande code
hergebruikt: `closeTab()` heeft alles al in handen wat `Ctrl+Shift+T` nodig
heeft.

**Wat er eerst moet.** Stap 2 (router, registry, records) en stap 3 (het
menumechanisme staat er dan al).

### Stap 5 — Downloads, kern (3 dagen)

**Wat.** Uit `downloads.md`: `will-download` via `bereidSessieVoor`, de
mapketen, de naamontsmetting en `vrijPad`, riskante extensies met
pauzeren-en-vragen (via `ask:show`), Zone.Identifier op Windows, pauzeren /
hervatten / annuleren / opnieuw, het paneel in de zijbalk, eigenaarschap met de
zes afwijkende gedragingen voor een assistent, `downloads:state` met de klok van
250 ms, en `win.setProgressBar()`.

**Wat er niet in komt:** de druppel met voortgangsring in het eiland (het eiland
heeft één stem en die is van de assistent; het paneel en de taakbalk zijn
genoeg), `download:verplaats`, `app.dock.downloadFinished`, en hervatten na een
herstart. Daarmee vervalt ook de botsing waarin drie ontwerpen om dezelfde twee
knoppen in het eiland vechten.

**Waarom hier.** Punt 5 van `CLAUDE.md`, en zonder downloads is het contextmenu
uit stap 3 half af ("Link opslaan als…" ontbreekt).

**Wat er eerst moet.** Stap 2 (`bereidSessieVoor` is de enige will-download),
stap 3 (het contextmenu levert de twee opslaan-items), stap 4 (`ask:show`).

**Onzeker** (uit `downloads.md` §17, ongewijzigd): welke webContents binnenkomt
bij `session.downloadURL()`, of `item.pause()` werkt vóór de eerste byte, en of
Electron met een gezet `savePath` naar een tijdelijk `.crdownload` schrijft.
Nieuw daarbij: of een `{ action: 'deny' }` op `disposition === 'save-to-disk'`
in de window-open-handler nog steeds een `will-download` oplevert — dat is de
naad tussen permissies en downloads en geen van beide beschrijft hem.

### Stap 6 — Sessieherstel (3–4 dagen)

**Wat.** `sessieherstel-en-data.md`, met twee vereenvoudigingen: de app-brede
workspace-teller staat er al (stap 2), en een hersteld tabblad is **koud**
zonder view (§1.8), dus `renderer/slaap.*` vervalt en de niet-geverifieerde
aanname over lege views hoeft niet gemeten te worden. Verder ongewijzigd:
`staat.json` + `vorige.json`, atomair schrijven met `fsync` en herhaalpogingen,
de schoon-vlag en `onschoneStarts`, warm tegenover koud herstel, de herstelstrip,
scroll via `executeJavaScript`, `render-process-gone`, en het assistenttabblad
dat terugkomt als jouw tabblad met `voormaligeEigenaar`.

**Het opruimen van weespartities wordt een aparte, kleine wijziging**, ná de
rest van deze stap. Het is de enige code in alle negen documenten die mappen
verwijdert, het leunt op een niet-geverifieerde aanname over de mapnaam
(`Partitions/ws-N`), en het verdient een eigen commit met de handmatige
verificatie erbij. De `/^ws-\d+$/`-test en de wachttijd van 24 uur blijven de
twee sloten.

**Waarom hier.** Punt 6 van `CLAUDE.md`, en de stap ervoor (downloads) en erna
(instellingen) willen allebei dingen bewaren. Bovendien: `will-prevent-unload`
uit stap 4 moet er zijn vóórdat `win.on('close')` een momentopname stasht.

**Wat het niet oplost.** Geen terug/vooruit-geschiedenis per tabblad —
`navigationHistory` heeft in 33 geen `restore()` en een `NavigationEntry` bevat
alleen `title` en `url`. Sessiecookies overleven het afsluiten niet, dus een deel
van je tabbladen komt uitgelogd terug.

### Stap 7 — Instellingen en het permissiescherm (5 dagen)

**Wat.** Nu pas, want nu is er iets in te stellen. `voorkeuren.js` via
`opslag.js`, de instellingenpagina als interne pagina op
`tougather://instellingen` (§1.11), en de tweede helft van permissies: de opslag
in `permissies.json`, de vraag via `ask:show`, het slotje en het sitepaneel in
de zijbalk, intrekken-met-herladen, en het assistentbeleid zichtbaar via het veld
`slot` in `describe()`.

**Eén eigenaar voor permissies.** `permissies.js` is van
`permissies-en-privacy.md`: het schema `partitie → origin → sleutel → vier
standen`, de toelatingslijst met fail-closed default, en beide handlers.
`instellingen.md` §6 levert er alleen een *scherm* op — `perm:list`, `perm:set`,
`perm:forget` — en registreert zelf niets. Dat lost de gevaarlijkste botsing van
de set op: twee modules met dezelfde naam, hetzelfde bestand, twee
incompatibele sleutels en twee kapot-bestand-hernoemingen die elkaars
toestemmingen weggooien.

**Twee dingen die de ontwerpen naar elkaar doorschuiven en hier landen:**
- **Taal.** `ses.setUserAgent(ua, acceptLanguages)` in `identiteit.zet()` — één
  aanroep die tegelijk het `Electron/`-token uit de user agent haalt (permissies)
  en `Accept-Language` zet (nergens belegd). Standaard: de taal van het systeem,
  met een keuze in het scherm.
- **Spelling.** `permissies-en-privacy.md` zet `setSpellCheckerEnabled(false)`
  omdat Electrons speller woordenboeken bij Google haalt; `pagina-basis.md`
  bouwt een spellingsectie in het contextmenu die daarmee permanent leeg is.
  Besluit: de speller staat **uit** en er is één schakelaar met een taalkeuze
  (`session.setSpellCheckerLanguages`), met de regel eronder dat het woordenboek
  bij Google wordt opgehaald. Zolang hij uit staat toont het contextmenu geen
  spellingsectie in plaats van "Geen suggesties".

**Zoom** hoort volgens de leidende regel van `instellingen.md` globaal ("gaat het
over je ogen, dan globaal"), maar volgt Chromium en is per sessie per origin.
Besluit: zoom is een per-site-instelling, geen ogeninstelling, en wordt bewaard
in de voorkeurenopslag onder dezelfde partitiesleutel — niet in een eigen
`zoom.json`. Afwijking van de regel, hier opgeschreven.

**"Wissen bij afsluiten"** blijft, met de eerlijke tekst erbij: het is best
effort, het is geen incognito, en bij een crash of `app.exit()` gebeurt er niets.
Zie §1.7 voor de enige `before-quit`.

### Stap 8 — Geschiedenis en bladwijzers A (3 dagen)

**Wat.** Stap 1, 2 en 3 uit de eigen bouwvolgorde van
`geschiedenis-en-bladwijzers.md`: `geschiedenis.js` (JSONL per partitie) en
`bladwijzers.js`, opnemen in `createTab()`, de ster met popover en de vastgezette
tegels in de zijbalk, en geschiedenis plus bladwijzers in de commandobalk met de
generatietelling en selectie-op-sleutel.

**Eén verkleining.** Het ontwerp houdt 40 000 bezoeken plus hun lowercase
zoekstrings volledig in het geheugen van het hoofdproces — naar eigen opgave
25–40 MB per geladen workspace, en zes workspaces is zes keer dat, bovenop
achtergrondpagina's van extensies en herstelde tabbladen. Besluit: alleen de
`plaatsen`-Map (unieke adressen, dak op 5 000 per partitie) blijft in het
geheugen — dat is wat de commandobalk doorzoekt en het is één tot drie megabyte.
Het chronologische logboek wordt van schijf gelezen wanneer de archiefpagina
erom vraagt, met dezelfde cursor-paginering die er al in staat.

**Adresbalksuggesties** komen hier ook: `#address` krijgt een uitklaplijst en
inline aanvullen uit geschiedenis en bladwijzers. Wat er **niet** komt zijn
suggesties van de zoekmachine — dat is een verzoek naar Google bij elke
toetsaanslag en dat spreekt de privacylaag frontaal tegen.

**Wat er eerst moet.** Stap 7 (het interne-pagina-mechanisme en de
voorkeurenopslag).

### Stap 9 — Pagina-basis B (2 dagen)

Zoom met de ladder en de chip in de zijbalk, afdrukken (`wc.print`), opslaan als
pdf (`dialog.showSaveDialog` + `printToPDF`), en de historiemenu's bij lange druk
op terug/vooruit. Klein, aangenaam, en niets hangt ervan af — daarom hier en niet
in stap 3.

Eén ding dat nergens staat: een pagina die zélf `window.print()` aanroept.
**Onzeker** of Electron dat zonder applicatiemenu afhandelt; meten, en zo niet,
dan is het dezelfde `ctrl.print(tabId)` achter een event.

### Stap 10 — Bijwerken (2 dagen, plus een projectbeslissing)

`electron-updater` (electron-builder staat al in `devDependencies`, met
nsis/dmg/AppImage als targets), een publicatiedoel (GitHub releases is het
goedkoopste), en een melding via `ui:notice`: "Tougather is bijgewerkt — opnieuw
starten". Nooit stil herstarten.

**Dit is geen feature maar een voorwaarde om te mogen distribueren.** Een browser
die zijn eigen Chromium nooit vervangt, verzamelt elke bekende exploit — en juist
`permissies-en-privacy.md` en `extensies.md` bouwen hun hele veiligheidsredenering
op een actuele Chromium. Zolang jij de enige gebruiker bent kun je dit uitstellen;
op de dag dat iemand anders het installeert, kan dat niet meer.

**De projectbeslissing:** bijwerken werkt alleen met ondertekende builds. Op
macOS is codesigning + notarisatie verplicht (Apple Developer Program, jaarlijks),
op Windows is het formeel optioneel maar zonder certificaat slaat SmartScreen bij
elke installatie aan. Dat kost geld en dat is niet aan mij.

### Stap 11 — Onderscheidende features (een half jaar, in vijf wijzigingen)

`onderscheidende-features.md` is in zijn eentje een tweede project. Zijn eigen
volgorde klopt; de gedeelde structuurwijziging (koude tabbladen) staat al in stap
2, dus wat overblijft is:

1. **Split view.** Werkt zonder assistent en is meteen waardevol. Voegt een
   dimensie toe aan `closeTab()`, dat nu al vier takken heeft — dat is de plek
   waar dit fout gaat, dus lees die functie eerst. De zoekbalk krijgt hierbij één
   regel erbij: hij hoort bij de helft die focus heeft en sluit pas als geen van
   beide helften meer zichtbaar is.
2. **Leeslaag** (`renderer/lezen.js` als gedeelde extractor, geen Node).
3. **Kijkdoos** en **opdracht met context**.
4. **Archief** en **notities**, met `will-prevent-unload` uit stap 4 als
   voorwaarde: automatisch opbergen mag een pagina met onbewaard werk niet
   weggooien. Een browser die als enige zelf tabbladen opruimt moet méér
   waarschuwen dan de rest, niet minder.
5. **De klus.** Als laatste; zonder model erachter is een voorstel alleen zo goed
   als de lijst die je er zelf in stopt.

### Stap 12 — Extensies: eerst meten, dan opnieuw beslissen (½ dag, dan een besluit)

`extensies.md` is het duurste document met de kleinste kans dat de gebruiker
krijgt wat hij verwacht. MV3-extensies met een service worker draaien niet — dat
is het overgrote deel van de Web Store, en Electron heeft ondersteuning gesloten
als *not planned*. `chrome.action` bestaat niet, dus toolbar, popup en badge
moeten wij bouwen. En vier fundamentele vragen zijn ongemeten, waaronder of
content scripts überhaupt in onze `sandbox: true`-views geïnjecteerd worden. Is
dat antwoord "nee", dan is het hele document weg.

**Besluit: doe stap 1 en 2 van dat document — de kanarie-extensie met de vier
metingen, en `extensies.js` zonder enige UI, te bedienen vanuit de
DevTools-console — en beslis daarna opnieuw.** Bouw geen strook, geen paneel met
zes stipjes, geen popup-als-eigen-view voordat die metingen er zijn.

En wat mensen hier feitelijk willen (advertenties weg) kan native met
`session.webRequest` per workspace, voor een fractie van dit werk; dat staat in
`extensies.md` zelf als voetnoot en verdient een eigen, kleine beslissing.

---

## 3. `main.js`: wat het raakt, en de splitsing

### Welke stappen raken `main.js`

| Stap | Raakt `main.js` | Zwaarte |
| --- | --- | --- |
| 1 Grendel | `addWorkspace`, `createTab` (window-open + navigatie), `whenReady` | klein |
| 2 Fundament | alles — dit **is** de splitsing | groot |
| 3 Pagina-basis A | `createTab` (drie luisteraars), constructor (findView), `describe`, `activateTab`, `closeTab` | middel |
| 4 Tabbladen/vensters | `createTab`, `closeTab`, `describe`, `pushState`, `whenReady`, nieuwe methoden | groot |
| 5 Downloads | `addWorkspace` (via `sessies.js`), constructor, `win.on('closed')` | middel |
| 6 Sessieherstel | constructor (vensterstaat), `addWorkspace`, `describe`, `activateTab`, `createTab`, `whenReady` | groot |
| 7 Instellingen | `whenReady`, `createTab` (intern), `describe`, `toURL`, `startAgent` | middel |
| 8 Geschiedenis | `createTab` (vier events), `closeTab`, `describe` | klein |
| 9 Pagina-basis B | `createTab` (zoom), `describe`, nieuwe methoden | klein |
| 11 Features | `layoutPagina`, `activateTab`, `closeTab`, `describe`, `focusIsland` | groot |
| 12 Extensies | `addWorkspace` (via `sessies.js`), popup-methoden | middel |

Tien van de twaalf stappen raken `createTab()` of `describe()`. Dat is het
antwoord op de vraag.

### Moet `main.js` gesplitst worden? Ja, en vóór stap 3

594 regels met zeventien handlers is prima. Diezelfde 594 regels plus vijftien
hoofdprocesmodules, vijfenvijftig kanalen, drie nevenviews en een split-layout is
dat niet — dan is er geen bestand meer waarin iemand `createTab()` nog kan lezen.
Belangrijker dan de lengte: op dit moment is er geen bestand waarvan je kunt
zeggen "de layout woont hier" of "de sessie-opzet woont hier", en dat is precies
waarom vier ontwerpen elk hun eigen sessie-opzet meenemen.

De splitsing is een verplaatsing, geen herschrijving. Voorstel:

```
main.js                app-lifecycle en bedrading: single-instance, second-instance,
                       de volgorde in whenReady, de before-quit, vensters openen.
                       Doel: onder de 150 regels, en het blijft leesbaar als
                       inhoudsopgave van de app.
preload.js             ongewijzigd van rol; groeit mee
preload-island.js      idem
preload-find.js        stap 3
preload-intern.js      stap 7 (archief + instellingen, één bestand, rol uit location.host)
preload-ext-popup.js   stap 12, één methode

lib/venster.js         class BrowserWindowController. Blijft het grootste bestand,
                       maar is dan het enige grote bestand en heeft één eigenaar.
lib/tabblad.js         het Tabblad-record, describe(), en de helpers eromheen
lib/layout.js          layoutAlles, layoutPagina, layoutIsland, layoutFind,
                       layoutExtensiePopup, verhoogOverlays, fullscreen
lib/registry.js        windows, neven, tabbladen, controllerFor, nevenVan, bronVan
lib/ipc.js             élke ipcMain.handle-regel, gegroepeerd per domein. Eén plek
                       waar je ziet wat de renderers mogen; bevat zelf geen logica
lib/sessies.js         bereidSessieVoor(partitie)
lib/sneltoetsen.js     de toetsentabel + bindSneltoetsen(wc, ctx)
lib/opslag.js          atomair lezen/schrijven, debounce, flushSync, vergeetPartitie
lib/url.js             toURL, beoordeelURL, VERBODEN_SCHEMA, isIntern, NEWTAB/FOUT/tougather
lib/maten.js           SIDEBAR_WIDTH, TOPBAR_HEIGHT, CONTENT_GAP, CONTENT_RADIUS, …
lib/vragen.js          de wachtrij achter ask:show / ask:answer
lib/intern.js          het tougather:-schema, de witte lijst, het navigatieslot

# per stap erbij, allemaal in lib/:
lib/permissies.js  lib/privacy.js  lib/menu-pagina.js  lib/downloads.js
lib/sessie.js  lib/partities.js  lib/voorkeuren.js  lib/geschiedenis.js
lib/bladwijzers.js  lib/extensies.js  lib/klusformaat.js
```

Twee praktische winsten. `package.json` krijgt één keer
`"files": ["main.js", "preload*.js", "lib/**", "renderer/**"]` en daarmee vervalt
de "vergeet `build.files` niet"-paragraaf uit alle negen ontwerpen — die zou
anders negen keer apart goed moeten gaan. En `lib/ipc.js` maakt de vraag "wat
mag een renderer eigenlijk" weer beantwoordbaar met één bestand openslaan; bij
vijfenvijftig kanalen verspreid over `main.js` is dat niet meer zo.

Wat er **niet** gebeurt: de controller opsplitsen in vijf klassen, een
event-bus, een dependency-injectiepatroon. `venster.js` blijft een klasse met
methoden die elkaar aanroepen; dat werkt, en de negen ontwerpen zijn er allemaal
tegen geschreven.

---

## 4. Wat de criticus vond, en wat ermee gebeurt

### Overgenomen, met een stap erbij

| Bevinding | Waar |
| --- | --- |
| Ingebouwde pdf-viewer (`plugins: true`) | stap 3, met een meting vooraf |
| Basisauthenticatie en proxy-inloggen (`app.on('login')`) | stap 4, via `ask:show`, assistent krijgt hem nooit |
| `will-prevent-unload` | stap 4, en voorwaarde voor het automatisch archiveren |
| Geluid per tabblad: indicator en dempen | stap 4 |
| `Ctrl+Shift+T` | stap 4 |
| Tabbladbeheer: slepen, dupliceren, middenklik, contextmenu, naar workspace | stap 4 |
| Nieuw venster (`Ctrl+N`) | stap 4 |
| Volledig scherm (F11 én HTML5) | stap 4, eigenaar is `lib/layout.js` |
| Muisknoppen en `Alt+←/→` | stap 4 |
| `Ctrl+Tab` en `Ctrl+1…9` naar tabbladen | stap 4 / §1.3 |
| Verbindingsindicator "Niet veilig" | stap 4 |
| Vastgelopen pagina (`unresponsive`) | stap 4 |
| Slepen-en-neerzetten: het **slot** | stap 2 (dit is een echt gat, geen feature) |
| Slepen-en-neerzetten en `Ctrl+O`: de **functie** | stap 4 |
| Venstertitel (`win.setTitle`) | stap 4 |
| Standaardbrowser + `second-instance` + `open-url` | stap 2 |
| Taal en `Accept-Language` | stap 7, in dezelfde aanroep als de user agent |
| Auto-update | stap 10, met de signeringsbeslissing erbij |
| Zoeksuggesties in de adresbalk | stap 8, maar alleen uit eigen geschiedenis |
| macOS-applicatiemenu | stap 4 |
| Paginadialogen (`alert`/`confirm`) | stap 4, na een meting |

### Overgenomen maar verkleind

- **Trackingbescherming.** De ping-blokkade, het inkorten van de referer en
  `Sec-GPC` blijven (stap 7, één keer aanhangen in `bereidSessieVoor`). De
  **handgeschreven lijst van 150 trackerhosts vervalt**: hij breekt sites stil
  (consent- en recaptcha-hosts staan in de eigen risicolijst van dat document),
  vraagt eeuwig onderhoud, en vertraagt het deel dat wel dringend is. Wie
  blokkeren wil, krijgt dat als eigen beslissing terug.
- **Geheugen van de geschiedenisindex.** Van 25–40 MB per workspace naar één tot
  drie (§stap 8).
- **De archiefpagina.** Naar stap 8b, ná de commandobalk-integratie — het eerste
  wat een gebruiker wil ("onthoud waar ik was, laat me het terugvinden in
  `Ctrl+K`") zit in stap 8a.
- **De druppel in het eiland.** Vervalt; het downloadpaneel plus
  `win.setProgressBar()` doen hetzelfde werk zonder om de breedte van de pil te
  vechten.
- **Extensies.** Terug naar een onderzoeksopdracht met een beslismoment
  (stap 12).
- **Het ontwerpsysteem.** De gedeelde tokens en de drie-lagen-regels landen in
  stap 2; de herschrijving van `style.css`/`island.css`/`newtab.css` en de
  componentbibliotheek komen incrementeel, wanneer een component nodig is. Niet
  als één samenvoeging die niemand kan nakijken.

### Opgelost door een besluit in §1

De botsingen — dubbele `will-download`, dubbele `setPermissionRequestHandler`,
twee eigenaren van `permissies.json`, drie `before-input-event`-routers, vier
Escape-claimanten, drie `before-quit`-handlers, drie `toURL`-verbouwingen, drie
`setWindowOpenHandler`s, vier antwoorden op "hoe krijg ik iets boven de pagina",
zeven atomaire schrijvers, vier interne-pagina-platforms, twee modellen voor een
tabblad zonder pagina, twee talen in de kanaalnamen, twee bronnen voor dezelfde
kleur, en de vraag wie de knoppen van het eiland bezit — staan stuk voor stuk in
§1.1 t/m §1.12. Ik herhaal ze hier niet.

Twee zijn het noemen waard omdat ze *verdwijnen* in plaats van beslecht te
worden: de gedeelde `persist:ws-1` tussen twee vensters (weg met §1.5), en de
onzekerheid over lege `WebContentsView`s (weg met §1.8).

### Bewust laten vallen

- **Wachtwoordbeheer en formulier-invulhulp.** Chromium levert dit in Electron
  niet mee, en zelf een kluis bouwen is een eigen product met echte
  beveiligingseisen — `safeStorage` is genoeg voor één API-sleutel en niet voor
  je wachtwoorden. Een externe manager werkt hier alleen als extensie, en die
  draaien grotendeels niet (stap 12). **Gevolg dat expliciet in de README hoort:**
  workspaces met gescheiden sessies betekent dat je in elke workspace met de hand
  inlogt. Dat is een rem op de kernbelofte en dat mag niemand ontdekken door het
  te merken.
- **Widevine en DRM.** Netflix, Disney+, Spotify-web en veel bedrijfsvideo spelen
  niet af. Dat vraagt de castlabs-variant van Electron plus een VMP-certificaat
  en hun buildpijplijn; `npm run dist` bouwt op de gewone Electron. Non-goal,
  eerste alinea van de README.
- **Vertalen van een pagina.** Vraagt een dienst van buiten en dus paginatekst
  naar een derde partij. Dat spreekt `permissies-en-privacy.md` frontaal tegen.
  Bewuste weglating, opgeschreven zoals dat document het voor Safe Browsing en
  wachtwoordbeheer ook netjes doet.
- **Zoeksuggesties van de zoekmachine.** Zelfde reden.
- **Certificaatscherm en `certificate-error`-handler.** De weigering uit
  `permissies-en-privacy.md` §14 blijft staan. Maar dan hoort erbij: op een
  netwerk met zelf-ondertekende certificaten is Tougather onbruikbaar. Een
  bedrijfs-CA die in de certificaatopslag van het besturingssysteem staat werkt
  vermoedelijk wél, omdat Chromium die opslag leest — **dat heb ik niet
  geverifieerd** en het scheelt het verschil tussen "onbruikbaar op intranet" en
  "werkt met wat IT-werk", dus meet het.
- **Scherm delen.** `display-capture` blijft op weigeren tot er een bronkiezer
  ontworpen is; de handler wordt wel geregistreerd en roept meteen `callback({})`
  aan, zodat de belofte van de pagina niet hangt.
- **Sleep een download naar een map.** Vraagt `webContents.startDrag()` met een
  verplichte `NativeImage`. Los ontwerpje, geen prioriteit.
- **Meerdere assistenten tegelijk.** `main.js` houdt één `this.agent` bij. Dat
  naar een `Map` brengen hoort bij het ontwerp van de assistent zelf (punt 2 van
  `CLAUDE.md`), niet bij een van deze negen.
- **De macOS-tweevingerveeg** (`win.on('swipe')`), **beeld-in-beeld**,
  **muisgebaren**, **thema-editor**, **synchronisatie tussen apparaten**,
  **import uit Chrome/Firefox**. Cosmetisch of een eigen project.

---

## 5. De drie dingen om nu te bouwen

**1. De grendel (stap 1, ½ dag).**
Het is het enige in de hele verzameling dat de app vandaag onveilig maakt, en
het is een halve dag. Elke site die je opent kan nu camera, microfoon en locatie
krijgen zonder dat er iets gevraagd wordt, en `window.open('ms-msdt:…')` gaat
linea recta naar de OS-schema-afhandeling. Er komt geen UI aan te pas, het faalt
in de veilige richting, en zeven van de negen ontwerpen nemen aan dat dit er is.
Het staat niet voor niets als punt 1 in `CLAUDE.md`.

**2. Het fundament en de splitsing van `main.js` (stap 2, 3–4 dagen).**
Dit levert niets zichtbaars op en het is toch het belangrijkste werk in het
document. Zes ontwerpen verbouwen dezelfde vijf methoden; vier hangen hun opslag
aan een sleutel die twee andere aan het vervangen zijn; drie schrijven elk een
sneltoetsrouter. Zonder deze stap is de eerste die bouwt de baas over de andere
acht, en niemand weet wie dat is. En de workspace-sleutel is vandaag een teller
in één JSON-bestand; zodra `permissies.json`, `downloads.json` en
`voorkeuren.json` bestaan, is het een migratie in vijf bestanden waar niemand
zin in heeft. Doe dit terwijl het gratis is.

**3. Pagina-basis A: contextmenu, zoeken, pdf, foutpagina (stap 3, 3–4 dagen).**
Punt 3 en 4 van de eigen lijst in `CLAUDE.md`, en het kleinste pakket dat een
gebruiker onmiddellijk merkt — rechtermuisknop en `Ctrl+F` zijn de twee dingen
die je binnen een minuut mist. Er zit bovendien een technische reden achter: de
zoekbalk is de eerste nevenview met eigen preload, en die bewijst of breekt in
één keer het overlaymechanisme (`neven`-registry, stapelvolgorde, `raiseOverlays`,
klikken die door een doorzichtige view worden opgeslokt) waar de extensiepopup,
de split view en fullscreen alle drie op leunen. Werkt het niet zoals gedacht,
dan wil je dat weten na drie dagen en niet na drie maanden.

Wat daarna komt volgt de lijst in §2, en de eerste beslissing die je daarna moet
nemen is of stap 4 (browserbasis) of stap 5 (downloads) voorgaat. Mijn advies is
stap 4: downloads zonder contextmenu-items en zonder `will-prevent-unload` is
half werk, en stap 4 is de stap waarna dit ding als een browser voelt.

---

## 6. Wat eerst gemeten moet worden

Elk van deze is een halve dag of minder, en elk bepaalt of een ontwerpdeel
overeind blijft. Ze staan in volgorde van hoe erg het is als het antwoord anders
is dan aangenomen.

| # | Meting | Hangt ervan af |
| --- | --- | --- |
| 1 | Worden content scripts geïnjecteerd in een view met `sandbox: true`? | het hele extensieontwerp (stap 12) |
| 2 | Geeft `plugins: true` de interne pdf-viewer, en werkt hij met `sandbox: true`? | stap 3; het antwoord bepaalt of een pdf een tabblad of een download is |
| 3 | Slaat een `false` uit `setPermissionCheckHandler` de request-handler over? | stap 7; zo ja ziet de gebruiker nooit een vraag en lijkt de app stuk |
| 4 | Vuurt `webContents.close()` `beforeunload` af, en wat doet `will-prevent-unload`? | stap 4, en het automatisch archiveren in stap 11 |
| 5 | Wat doet een `alert()` uit een onzichtbare `WebContentsView`? | stap 4 |
| 6 | Bestaat `Session#protocol.handle`, en accepteert `net.fetch()` een `file:`-URL erin? | stap 7 en 8 (het interne-pagina-mechanisme) |
| 7 | Semantiek van de `findNext`-vlag bij `findInPage` | stap 3; één vlag |
| 8 | Past Electron ctrl+wiel-zoom zelf al toe? | stap 9; zo ja zoom je dubbel |
| 9 | Overleeft een zoomniveau een herstart binnen een persistente sessie? | stap 9; zo ja is de zoomopslag overbodig |
| 10 | Vuurt `win.on('app-command')` terwijl een `WebContentsView` focus heeft? | stap 4 |
| 11 | Wint een menu-accelerator op macOS van `before-input-event`? | §1.3 en stap 4 |
| 12 | Levert een `deny` op `disposition: 'save-to-disk'` nog een `will-download` op? | stap 5 |
| 13 | Werken `print()` en `printToPDF()` op een onzichtbare view? | stap 9 (hooguit een gemiste kans) |
| 14 | Levert `capturePage()` bruikbaar beeld op een view met `setVisible(false)`? | stap 11, kijkdoos (bewust niet fataal gemaakt) |
| 15 | Heet de partitiemap op schijf werkelijk `Partitions/ws-N`? | stap 6b, het opruimen van weespartities — de gevaarlijkste code in de set |
| 16 | Leest Chromium de certificaatopslag van het besturingssysteem? | of Tougather op een bedrijfsnetwerk bruikbaar is |
| 17 | Beweegt `backgroundMaterial: 'acrylic'` mee met `nativeTheme.themeSource`? | stap 7, themakeuze |
| 18 | Neemt `backdrop-filter` het venstermateriaal mee? | het glasrecept in `ui-systeem.md` |

Meting 1 en 2 zijn de twee die een heel ontwerp kunnen omgooien. Doe ze eerst,
ook al staan de bijbehorende stappen ver uit elkaar.

---

## 7. Wat deze routekaart niet oplost

- **De assistent.** Punt 2 van `CLAUDE.md` — een echt model met een zichtbaar
  logboek en een noodstop — staat in geen van de negen ontwerpen en ook niet
  hierin. Het is de reden dat dit product bestaat, het raakt `startAgent`,
  `AGENT_STAPPEN` en `this.agent`, en het verdient zijn eigen ontwerp. Zolang de
  assistent een geschreven reeks stappen is, zijn de veiligheidsredeneringen over
  "een tweede zelfstandige partij in dezelfde sessie" (extensies §6, permissies
  §8) theorie. Zodra hij echt is, zijn ze dat niet meer.
- **De schatting.** De dagen hierboven zijn ruw en gaan uit van iemand die deze
  codebase kent. Stap 11 is expliciet een half jaar en geen sprint.
- **Wie het bouwt.** Zes ontwerpen raken `describe`, `createTab`, `activateTab`,
  `closeTab` en `addWorkspace`. Deze routekaart legt de volgorde vast, maar één
  eigenaar voor die vijf methoden is een afspraak tussen mensen en niet iets wat
  een document kan regelen.
- **De prijs van de zijbalk.** Na stap 8 zit er in 264 pixels: navigatie, adres,
  zoom, vastgezette tegels, herstelstrip, tabbladen, downloads, extensies, nieuw
  tabblad en workspaces. De volgorde in stap 4 legt vast wat waar staat, maar
  niet wat er moet wijken als er iets bij wil. Dat wordt een echt probleem, en
  het eerlijke antwoord is dat de volgende feature die ruimte in de zijbalk wil,
  eerst iets anders moet opruimen.
