# Extensies

Dit ontwerp ziet er zo uit omdat Electron veel minder van Chrome-extensies
ondersteunt dan mensen aannemen. Er is geen extensiesysteem dat je "aanzet": er
is één methode, `session.loadExtension(pad)`, die een uitgepakte map in één
sessie laadt, plus een handjevol `chrome.*`-API's. Alles wat een gebruiker een
extensie noemt — het knopje in de balk, het popupje eronder, het badge-getal,
de installatie vanuit de Web Store, het aan- en uitzetten, de bijwerking —
bestaat in Electron niet en moeten wij zelf bouwen of laten vallen. Daarom is
dit ontwerp voor de helft een lijst van wat er *niet* kan, en voor de andere
helft een kleine, eerlijke schil: installeren vanaf een map, per workspace aan-
of uitzetten (want een workspace *is* een sessie, en extensies laden per
sessie), een strook iconen onder in de zijbalk, en een popup als eigen
`WebContentsView`. Extensies staan na installatie overal uit. Dat is geen
voorzichtigheid maar de kern van het idee: een extensie die in één workspace aan
staat, ziet alles wat je in die workspace doet — ook wat de assistent er doet.

Alles hieronder is nagekeken tegen de Electron die in deze repo staat
(`node_modules/electron/dist/version` = **33.4.11**, Chromium 130) en tegen
`docs/api/extensions.md` van tag `v33.4.11`. Waar ik iets niet zeker weet, staat
dat er expliciet bij onder "Onzeker".

---

## 1. Wat Electron werkelijk ondersteunt

### De API zelf

Op `Session` (Electron 33, `electron.d.ts` regels 11735–11847):

| Methode / event | Betekenis |
| --- | --- |
| `ses.loadExtension(pad, { allowFileAccess })` → `Promise<Extension>` | Laadt een **uitgepakte** map. Gooit bij een kapot manifest. |
| `ses.removeExtension(id)` | Laadt hem weer uit. Synchroon. |
| `ses.getExtension(id)` → `Extension \| null` | |
| `ses.getAllExtensions()` → `Extension[]` | |
| `ses.on('extension-loaded', (e, extension) => …)` | Ook bij herladen na een crash of `chrome.runtime.reload()`. |
| `ses.on('extension-ready', (e, extension) => …)` | Pas hier draait de achtergrondpagina. |
| `ses.on('extension-unloaded', (e, extension) => …)` | |

Het `Extension`-object heeft `id`, `name`, `version`, `path`, `url`
(`chrome-extension://<id>/`) en `manifest` (kopie van de manifestdata).

Harde randvoorwaarden, letterlijk uit de documentatie en de typings:

- **Alleen uitgepakt.** `.crx` werkt niet. Er is geen Web Store, geen
  installatieprotocol, geen handtekeningcontrole.
- **Alleen persistente sessies.** Laden in een in-memory sessie gooit. Onze
  `persist:ws-N` is persistent, dus dat komt goed.
- **Niet onthouden.** "Loaded extensions will not be automatically remembered
  across exits." Elke start opnieuw `loadExtension` aanroepen. Wij moeten dus
  zelf bijhouden wat er geïnstalleerd is.
- **Pas na `app.whenReady()`.** Geldt voor alle vier de methoden.
- `allowFileAccess` staat standaard op `false`. **Laten staan** — zie
  Veiligheid.

### Welke manifestsleutels Electron leest

`name`, `version`, `author`, `short_name`, `manifest_version`, `permissions`,
`host_permissions` (MV3), `content_scripts`, `default_locale`, `devtools_page`,
`background` (**alleen MV2**), `minimum_chrome_version`.

Alles wat daar niet staat wordt genegeerd. Dus ook: `action` /
`browser_action` (het knopje), `options_ui`, `commands` (sneltoetsen),
`omnibox`, `declarative_net_request`, `web_accessible_resources`,
`chrome_url_overrides`, `side_panel`. Genegeerd betekent hier: het bestand mag
er staan, Electron doet er niets mee. De inhoud kunnen wíj wel lezen (het is
gewoon JSON op schijf) en daar bouwen we de toolbar en de popup mee.

### Welke `chrome.*`-API's werken

| Namespace | Status in Electron 33 |
| --- | --- |
| `chrome.devtools.inspectedWindow` / `.network` / `.panels` | Volledig |
| `chrome.scripting` | Volledig |
| `chrome.webRequest` | Volledig, maar Electrons eigen `session.webRequest` gaat vóór |
| `chrome.storage` | **Alleen `.local`** — geen `sync`, geen `managed` |
| `chrome.runtime` | `lastError`, `id`, `getManifest`, `getURL`, `getBackgroundPage`, `getPlatformInfo`, `connect`, `sendMessage`, `reload`, `onStartup`, `onInstalled`, `onSuspend`, `onSuspendCanceled`, `onConnect`, `onMessage` |
| `chrome.tabs` | `sendMessage`, `reload`, `executeScript`, plus *gedeeltelijk* `query` en `update`. Tab-id `-1` gooit een fout |
| `chrome.extension` | `lastError`, `getURL`, `getBackgroundPage` |
| `chrome.management` | `getAll`, `get`, `getSelf`, `getPermissionWarningsById`, `getPermissionWarningsByManifest`, `onEnabled`, `onDisabled` |

En dat is de hele lijst. **Bestaat niet:** `chrome.action` / `browserAction`,
`contextMenus`, `alarms`, `notifications`, `cookies`, `windows`, `bookmarks`,
`history`, `downloads`, `commands`, `omnibox`, `declarativeNetRequest`,
`i18n` (zie Onzeker), `permissions`, `identity`, `proxy`, `privacy`,
`sidePanel`, `offscreen`, `webNavigation`.

Praktisch gevolg: **de meeste populaire extensies werken niet.** Een
wachtwoordmanager wil `chrome.storage.sync`, `chrome.tabs` compleet en
`chrome.runtime` met een service worker. Een adblocker wil
`declarativeNetRequest` (MV3) of blokkerende `webRequest` plus `contextMenus`,
`i18n` en `browserAction` (MV2). Beide vallen om. Wat wél goed werkt zijn
**devtools-extensies** (React DevTools, Redux DevTools: die leunen precies op de
drie volledig ondersteunde `chrome.devtools.*`-namespaces) en **kleine
content-script-extensies** die een pagina aanpassen en hooguit
`chrome.storage.local` en `chrome.runtime.sendMessage` gebruiken.

### Manifest V2 versus V3

- **MV2** is de bruikbare kant. `background.scripts` / `background.page` wordt
  een echte achtergrondpagina: een verborgen `WebContents` waarvan
  `webContents.getType()` `'backgroundPage'` teruggeeft. Daar draaien de
  ondersteunde `chrome.*`-bindings.
- **MV3** laadt wel — `manifest_version` en `host_permissions` staan in de
  ondersteunde sleutels — maar `background.service_worker` staat er níet bij.
  In de praktijk start de service worker niet als extensiecontext met
  `chrome.*`-bindings: `chrome.runtime.onInstalled` vuurt niet en
  `chrome.runtime.onMessage` in de worker ontvangt niets, terwijl
  `sendMessage` vanuit het content script wel loopt (electron/electron#34178).
  Een MV3-extensie zonder achtergrondlogica (alleen `content_scripts` en/of
  `devtools_page`) kan dus werken; een MV3-extensie waarvan de kern in de
  service worker zit, is stuk. Een issue "Support for Manifest V3 Chrome
  Extensions" (electron/electron#49984, geopend februari 2026 tegen Electron 40)
  is gesloten als *not planned*. Reken er niet op dat dit vanzelf goed komt.

Chrome zelf heeft MV2 uitgefaseerd, dus we zitten in de vervelende hoek: het
formaat dat Electron ondersteunt is het formaat dat uitsterft. Zeg dat in de UI.

### Content scripts, popups, toolbar

- **Content scripts** worden door Chromium geïnjecteerd volgens
  `content_scripts` in het manifest, in elke pagina van díe sessie. Dat is het
  deel dat gewoon werkt en meteen ook het gevaarlijkste deel.
- **Popup**: Electron tekent geen balk en geen knop, en `chrome.action`
  bestaat niet. `action.default_popup` is voor Electron dode letter. Wij lezen
  hem zelf uit het manifest en laden `chrome-extension://<id>/<popup>` in een
  eigen `WebContentsView` in dezelfde sessie. Dat is de enige manier.
- **Toolbar**: idem. Icoon uit `action.default_icon` van schijf lezen, zelf
  tekenen. Geen badge (`setBadgeText` bestaat niet), geen
  `chrome.action.onClicked`: een extensie zónder `default_popup` doet bij een
  klik dus letterlijk niets, en dat moeten we in de UI durven zeggen.
- **Devtools**: `devtools_page` werkt. De extensie moet geladen zijn in de
  sessie van de pagina die je inspecteert. Onze DevTools-sneltoets
  (`devtoolsSneltoets`, main.js regel 61) opent DevTools op de webContents van
  het tabblad, dus in de workspace-sessie. Klopt vanzelf.

### Wat andere mensen hiervoor gebruiken

`electron-chrome-extensions` (samuelmaddock) bouwt bovenop Electron wél
`chrome.action`, `tabs`, `contextMenus`, `notifications`, `windows`, `cookies`,
`commands`, `webNavigation`, een `<browser-action-list>`-webcomponent en
service-worker-preloads. Twee blokkades voor ons: het vraagt **Electron ≥ 35**
(wij staan op 33, en het leunt op `session.registerPreloadScript` met
`type: 'service-worker'`, die in 33 niet bestaat — 33 heeft alleen
`setPreloads`), en het is **GPL-3** tenzij je een proprietary licentie via
sponsoring afneemt. Dat is een beslissing over het hele project, geen
implementatiedetail. Ik ontwerp hieronder daarom het pad zónder die
afhankelijkheid, en noem het alternatief in "Volgorde van bouwen".

> **Bij een Electron-upgrade:** vanaf **Electron 36** zijn `loadExtension`,
> `removeExtension`, `getExtension`, `getAllExtensions` en de drie
> `extension-*`-events verplaatst naar `session.extensions` en op `session` zelf
> afgeschreven. Houd de aanroepen daarom op één plek (`extensies.js`), dan is
> dat één regel werk.

---

## 2. Installeren zonder Chrome Web Store

### Twee soorten installatie

1. **Gekopieerd** (normaal). De gebruiker kiest een map met een `manifest.json`;
   wij kopiëren die naar onze eigen opslag. Voordeel: de map kan daarna niet
   onder ons vandaan verdwijnen of gewijzigd worden zonder dat wij het merken,
   en het pad — waar het extensie-id aan hangt — blijft stabiel.
2. **Gekoppeld** (ontwikkelen). We onthouden alleen het pad en laden vanaf de
   plek waar de gebruiker hem heeft staan. Met een **Herladen**-knop
   (`removeExtension` + `loadExtension`) om na een codewijziging opnieuw te
   laden. Dit is de tegenhanger van "Load unpacked" in Chrome.

Waar komt zo'n map vandaan? Uit een GitHub-release die je uitpakt, uit je eigen
projectmap, of uit een bestaande Chrome-installatie: Chrome bewaart extensies
**al uitgepakt** in
`%LOCALAPPDATA%\Google\Chrome\User Data\Default\Extensions\<id>\<versie>\`
(macOS: `~/Library/Application Support/Google/Chrome/…`). Die map kun je
rechtstreeks aan `loadExtension` geven. Noem dat in de installatie-UI, het
scheelt mensen veel gezoek.

**Web Store rechtstreeks: niet doen.** Een `.crx` van de store trekken via de
update-URL is tegen de voorwaarden van de store, en `loadExtension` kan een
`.crx` sowieso niet lezen. Een `.crx` is technisch een ZIP met een header, dus
zelf uitpakken kán — maar dat vraagt een zip-afhankelijkheid (Node heeft er geen
in de standaardbibliotheek) én je slaat de handtekeningcontrole over die de
enige reden is dat een `.crx` te vertrouwen zou zijn. Buiten scope. In de UI één
zin: *"Een .crx-bestand kan Tougather niet installeren. Pak de extensie uit tot
een map met manifest.json."*

### Waar het op schijf belandt

```
app.getPath('userData')/
  extensies/
    extensies.json                 <- onze administratie
    ublock-a3f19c/                 <- kopie van de uitgepakte extensie
      manifest.json
      …
  Partitions/
    ws-1/                          <- de sessie van workspace 1
      Local Extension Settings/<chromium-id>/    <- chrome.storage.local
```

Belangrijk gevolg van die laatste regel: **`chrome.storage.local` staat per
workspace apart.** Dezelfde extensie in twee workspaces heeft twee keer eigen
instellingen. Dat is precies wat je wil bij gescheiden sessies, maar het
verrast mensen. Zet het in de beheer-UI.

`extensies.json`:

```json
{
  "versie": 1,
  "extensies": [
    {
      "sleutel": "ublock-a3f19c",
      "bron": "kopie",
      "pad": null,
      "naam": "uBlock Origin",
      "versie": "1.52.2",
      "manifestVersie": 2,
      "geinstalleerd": "2026-09-08T18:22:11.000Z",
      "vingerafdruk": "sha256:…"
    }
  ],
  "aan": {
    "persist:ws-1": ["ublock-a3f19c"],
    "persist:ws-2": []
  }
}
```

Twee keuzes die uitleg verdienen:

- **Onze sleutel is de mapnaam, niet het Chromium-id.** Het id kennen we pas ná
  het laden, en voor een uitgepakte extensie leidt Chromium het af van het
  absolute pad (tenzij het manifest een `key` bevat). Zou je op het id
  administreren, dan is je administratie leeg voordat je iets geladen hebt.
- **Aan/uit hangt aan de partitiestring, niet aan het workspace-id.** De
  partitie is wat een workspace duurzaam maakt; het id (`nextWorkspaceId`,
  main.js regel 81) loopt per venster en begint elke start weer bij 1. Let op
  het bijeffect dat nu al bestaat: een tweede venster hergebruikt
  `persist:ws-1`, dus twee vensters delen die sessie — en daarmee ook de
  extensies die erin aan staan. Dat is bestaand gedrag, wij volgen het. Zodra
  sessieherstel (punt 6 op de routekaart in CLAUDE.md) workspaces een echte,
  unieke identiteit geeft, moet deze sleutel mee verhuizen.

### Het id verandert als het pad verandert

Chromium leidt het id van een uitgepakte extensie af uit het absolute pad. Dus:

- dezelfde map in twee sessies laden → **hetzelfde id**. Fijn: id's zijn
  vergelijkbaar tussen workspaces.
- de map verplaatsen (andere gebruikersnaam, `userData` verhuisd, app
  opnieuw geïnstalleerd op een ander pad) → **ander id** → `chrome.storage.local`
  van die extensie is wees. Onze eigen administratie overleeft het (die hangt
  aan de mapnaam), de instellingen ván de extensie niet.

Daarom kopiëren we naar een pad dat we zelf in de hand hebben en hernoemen we
die map nooit. Zie ook Onzeker, punt 3.

### Installeren, stap voor stap

```js
// extensies.js (hoofdproces)
const { dialog, session, shell } = require('electron');
const fs = require('node:fs/promises');

async function kiesMap(win) {
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    title: 'Map met de extensie kiezen',
    properties: ['openDirectory'],
  });
  return canceled ? null : filePaths[0];
}
```

1. Map kiezen (`dialog.showOpenDialog`, `properties: ['openDirectory']`).
2. `manifest.json` lezen en ontleden. Geen manifest of geen geldige JSON →
   afwijzen met een leesbare regel.
3. Naam oplossen. Begint `manifest.name` met `__MSG_`, dan de sleutel opzoeken
   in `_locales/<default_locale>/messages.json`.
4. **Rapport tonen** (zie 4.3) — onze vervanging van Chromes toestemmingsscherm.
   Electron toont er geen en vraagt niets; wat in `permissions` staat, krijgt de
   extensie.
5. Bij akkoord: mapnaam bepalen (slug van de naam + zes tekens hash van de
   bron), `fs.cp(bron, doel, { recursive: true })`. Weigeren boven een
   maximum (bijvoorbeeld 100 MB) — je kopieert per ongeluk zo een `node_modules`.
6. Regel bijschrijven in `extensies.json`. **Nergens aanzetten.** Installeren is
   niet aanzetten.

---

## 3. Per workspace aan en uit

### Laden

Een workspace *is* een sessie, dus dit valt netjes samen. In `addWorkspace()`
pakken we de sessie meteen op — nu gebeurt dat impliciet pas bij het eerste
tabblad:

```js
// main.js, in addWorkspace(), na het aanmaken van het workspace-object:
// De sessie nu al oppakken in plaats van bij het eerste tabblad: extensies
// horen geladen te zijn vóórdat er een pagina in staat, anders mist die
// pagina zijn content scripts.
ws.ses = session.fromPartition(ws.partition);
ws.extensiesGereed = extensies.pasToe(ws.ses);
```

`pasToe(ses)` doet het verschil tussen "wat hoort er aan te staan" en
`ses.getAllExtensions()`: wat te veel staat eruit met `removeExtension(id)`, wat
mist erbij met `loadExtension(pad, { allowFileAccess: false })`, elk in zijn
eigen `try/catch` zodat één kapotte extensie de rest niet meeneemt. Een mislukte
laadpoging wordt in de administratie gemarkeerd (`kapot: '<foutmelding>'`) en
komt in de beheer-UI terecht.

### Volgorde bij het opstarten

Dit is de scherpe rand. `createTab()` is synchroon en `loadExtension` is een
promise. Wordt een tabblad geladen voordat de extensie klaar is, dan mist die
pagina zijn content scripts en lijkt de extensie stuk.

- **Eerste workspace:** in `app.whenReady()` de extensies van `persist:ws-1`
  laden *voordat* `new BrowserWindowController()` draait. Dat is een `await` op
  één plek en dekt het gewone geval.
- **Later aangemaakte workspaces en aanzetten tijdens gebruik:** niet af te
  vangen met wachten. Daarom luisteren we op `extension-ready` en herladen we de
  tabbladen van die workspace die al geladen waren:

```js
ws.ses.on('extension-ready', () => {
  for (const [id, view] of ws.tabs) {
    // Niet het tabblad van een assistent: die is midden in zijn werk, en een
    // herlading gooit weg waar hij op staat te wachten.
    if (this.owners.get(id)) continue;
    if (view.webContents.getURL()) view.webContents.reload();
  }
});
```

### Uitzetten

`ses.removeExtension(id)` en de partitie uit `aan` halen. Let op: al
geïnjecteerde content scripts blijven in reeds geladen pagina's staan tot die
pagina herlaadt. Zeg dat in de UI ("werkt na herladen van de open tabbladen")
of herlaad meteen, met dezelfde uitzondering voor assistent-tabbladen.

### Noodrem

Eén handeling die in élke workspace alles uitzet (`ext:disable-all`). Nodig
omdat een extensie met `chrome.webRequest` al het verkeer in een workspace kan
blokkeren, en de gebruiker dan een browser heeft die niks meer laadt en niet
weet waarom.

---

## 4. De beheer-UI

Drie stukken: een strook in de zijbalk, een paneel als overlay, en de popup als
eigen native laag. Geen nieuw venster; deze app heeft er geen.

### 4.1 De strook in de zijbalk

Tussen `#new-tab` en `<footer id="workspaces">` in `renderer/index.html`:

```html
<div id="extensions" hidden>
  <ol id="extension-list"></ol>
  <button id="manage-extensions" type="button" title="Extensies beheren"
          aria-label="Extensies beheren">
    <svg viewBox="0 0 16 16" aria-hidden="true"><path d="…puzzelstuk…" /></svg>
  </button>
</div>
```

Vorm: precies die van `#workspaces` — `display:flex`, `gap:4px`,
`padding-top:8px`, `border-top:1px solid var(--stroke)`. Knoppen van 24×24 met
`border-radius:7px`, icoon 16×16, `opacity:.75` in rust, `var(--fill)` bij
hover, `var(--fill-active)` zolang zijn popup open staat. `hidden` zolang er
niets geïnstalleerd is: een browser zonder extensies hoort geen extensiebalk te
krijgen.

De strook toont alleen wat in de **actieve** workspace aan staat. Dat kan zonder
`main.js` verder aan te raken: `renderer/extensies.js` roept zelf
`browser.onState(...)` aan voor `activeWorkspaceId` (`ipcRenderer.on` staat
meerdere luisteraars toe, dus dat gaat langs `app.js` heen) en
`browser.onExtensions(...)` voor de lijst. Snijpunt van die twee is wat je
tekent. Eén conflict minder met de andere ontwerpen.

Iconen: `action.default_icon` / `browser_action.default_icon` uit het manifest
(string of object per maat; neem 32, anders de grootste). Het hoofdproces leest
het bestand van schijf en stuurt een `data:`-URL mee in `ext:state`. Niet
`chrome-extension://…` in een `<img>`: de CSP van `index.html` staat dat schema
niet toe, en zonder `web_accessible_resources` mag een gewone pagina die
bestanden ook niet lezen. Een `data:`-URL past binnen de bestaande
`img-src 'self' https: data:`, dus de CSP hoeft niet losser.

### 4.2 Het beheerpaneel

Een overlay in de zijbalk-renderer, gebouwd als `#palette`: `position:fixed;
inset:0`, `var(--scrim)` erachter, een kaart met `var(--card)`,
`backdrop-filter`, `var(--radius-card)` en `var(--shadow-card)`. Dezelfde
`Escape`-afhandeling. Net als de commandobalk moet de pagina even weg, anders
tekent die native laag er dwars overheen — daarvoor bestaat `ui:palette` al en
dat kanaal doet exact dit. Hergebruiken; de naam dekt de lading dan wat minder
goed. Wie dat storend vindt hernoemt hem later naar `ui:overlay`, maar dat raakt
`main.js`, `preload.js` en `app.js` tegelijk.

Eén rij per geïnstalleerde extensie:

```
[icoon]  uBlock Origin  1.52.2                    ● ● ○ ○ ○ ○   ⟳   ×
         MV2 · gekopieerd · 3 API's ontbreken
```

- **Zes stipjes** = de workspaces, in de kleuren die er al zijn
  (`--ws-0` … `--ws-5`, klasse `.c0`–`.c5`, zelfde vorm als `.ws .dot`).
  Gevuld = aan in die workspace, hol = uit. Klikken schakelt. Dit is de hele
  bediening; geen tweede scherm, geen selectievakjes.
- **⟳** alleen bij gekoppelde (ontwikkel)extensies: herladen.
- **×** verwijdert, met dezelfde bewapening als het sluiten van een workspace
  (eerste klik kleurt hem `var(--danger)`, tweede voert uit, 2,5 seconde
  geheugen) — en met een vaste regel eronder: *"Verwijdert de map en alles wat
  de extensie in deze workspaces heeft opgeslagen."*
- De tweede regel is het rapport in het klein, en klikbaar: hij vouwt het
  volledige rapport uit.

Onderin twee knoppen: **Map met extensie kiezen…** en **Map koppelen
(ontwikkelen)**, plus de zin over `.crx`. Staat er nog niets, dan draagt het
lege paneel de waarschuwing: *"Extensies in Tougather zijn beperkt. Manifest
V3-extensies met een service worker werken niet."*

### 4.3 Het installatierapport

Electron vraagt niets en toont niets; het toestemmingsscherm van Chrome bestaat
hier niet. Dit rapport is onze vervanging, en het is ook de eerlijkste plek om
te zeggen dat de helft niet werkt. Het wordt gemaakt door
`extensie-rapport.js` (hoofdproces, leest schijf) en toont drie blokken:

**Wat deze extensie mag** — uit `permissions` en `host_permissions`, in gewone
taal: `<all_urls>` → *"Elke pagina lezen en aanpassen in de workspaces waar je
hem aanzet"*; `webRequest` → *"Al het netwerkverkeer zien"*; `cookies` →
*"Cookies lezen (werkt niet in Tougather)"*.

**Wat hier niet werkt** — het manifest en de meegeleverde `.js`-bestanden
worden gescand op `chrome.<namespace>`; alles buiten de tabel uit hoofdstuk 1
komt hier terecht. Plus de vaste gevallen: `manifest_version: 3` met
`background.service_worker`, `chrome.storage.sync`, een `action` zonder
`default_popup` (het knopje doet dan niets), badges.

**Waar hij komt te staan** — het doelpad, met een knop
`shell.showItemInFolder()`.

Afsluiten met één knop, **Installeren**, en de regel *"Daarna staat hij overal
uit."*

### 4.4 De popup

De popup is een extensiepagina, dus een echte native laag. In de controller:

```js
// main.js — schets
async function toonExtensiePopup(sleutel) {
  const info = extensies.zoek(sleutel);
  const ext = this.workspace.ses.getExtension(info.chromiumId);
  const popup = ext?.manifest?.action?.default_popup
             ?? ext?.manifest?.browser_action?.default_popup;
  if (!popup) return; // chrome.action.onClicked bestaat niet: dan gebeurt er niets

  this.verbergExtensiePopup();
  const view = new WebContentsView({
    webPreferences: {
      partition: this.workspace.partition,   // moet dezelfde sessie zijn
      preload: path.join(__dirname, 'preload-extensie-popup.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  view.setBorderRadius(CONTENT_RADIUS);
  view.webContents.loadURL(`${ext.url}${popup}`);
  …
}
```

- **Plek.** Linksonder tegen de zijbalk aan, boven de workspace-strook, want
  daar staat de knop: `x = SIDEBAR_WIDTH + 8`,
  `y = hoogte - CONTENT_GAP - popupHoogte`. Meegerekend in `layoutIsland()`'s
  buurman `layoutExtensiePopup()`, ook aangeroepen vanuit de bestaande
  `resize`-handler.
- **Maat.** Chrome meet de popup aan zijn inhoud, wij moeten dat nadoen. De
  popup meet zichzelf en meldt het via `ext:popup-size` — precies de truc die
  het eiland al gebruikt (`island:size`), en om dezelfde reden: het hoofdproces
  kan die maat niet raden. Klemmen op Chromes grenzen: minimaal 25×25, maximaal
  800×600.
- **Sluiten.** Bij een klik elders in de zijbalk (`ext:popup-close`), bij
  wisselen van tabblad of workspace, bij `win.on('blur')`, en op `Escape` via
  `before-input-event` op de webContents van de popup — hetzelfde patroon als
  `devtoolsSneltoets`. Sluiten betekent **vernietigen**
  (`removeChildView` + `webContents.close()`), niet verbergen: Chrome breekt een
  popup ook af, en extensies rekenen daarop.
- **Links in de popup**: `setWindowOpenHandler` → `createTab(url, ws)` en
  `{ action: 'deny' }`, gelijk aan wat `createTab` al doet.
- **Kapotte popups zichtbaar maken.** Veel popups roepen meteen
  `chrome.action.…` of `chrome.i18n.getMessage()` aan en blijven wit.
  `view.webContents.on('console-message', …)` opvangen, en bij een fout binnen
  twee seconden na laden een strook onder in het paneel: *"De popup van deze
  extensie gebruikt iets dat Tougather niet heeft."* Dat is beter dan een leeg
  vlak waar de gebruiker naar staart.

### 4.5 De optiespagina

`options_ui.page` of `options_page` uit het manifest, geopend als gewoon
tabblad in dezelfde workspace via `createTab(ext.url + pagina, ws)`. Werkt omdat
dat tabblad al in de juiste sessie zit. Zie Onzeker punt 2: of de
`chrome.*`-bindings ook in een **sandboxed** tabblad bestaan, moet gemeten
worden.

---

## 5. Kanalen, bestanden en wat er in main.js bij moet

### IPC-kanalen (`domein:actie`, domein `ext`)

Vanuit de zijbalk (`invoke`):

| Kanaal | Argumenten | Doet |
| --- | --- | --- |
| `ext:install` | — | Mapkiezer, rapport, kopiëren, bijschrijven |
| `ext:link` | — | Idem, maar koppelen in plaats van kopiëren |
| `ext:report` | `sleutel \| pad` | Rapport ophalen voor het installatiescherm of de rij |
| `ext:toggle` | `sleutel, workspaceId, aan` | Laden/lossen in die sessie, administratie bijwerken |
| `ext:reload` | `sleutel` | `removeExtension` + `loadExtension` in elke sessie waar hij aan staat |
| `ext:remove` | `sleutel` | Overal lossen, map weg, regel weg |
| `ext:disable-all` | — | Noodrem |
| `ext:popup` | `sleutel` | Popup openen |
| `ext:popup-close` | — | Popup sluiten |
| `ext:options` | `sleutel` | Optiespagina als tabblad |
| `ext:reveal` | `sleutel` | `shell.showItemInFolder` |

Vanuit de popup (`invoke`, eigen preload): `ext:popup-size` met `(breedte, hoogte)`.

Naar de zijbalk (`send`): `ext:state` met
`{ extensies: [{ sleutel, naam, versie, manifestVersie, bron, icoon, chromiumId, kapot, rapportKort, heeftPopup, heeftOpties }], aan: { '<partitie>': [sleutel] } }`,
en `ext:log` met `{ sleutel, niveau, regel }` voor kapotte popups en mislukte
laadpogingen.

**Let op de registry.** `controllerFor(event)` (main.js regel 550) zoekt in
`windows`, die alleen de zijbalk en het eiland kent — dat is precies waarom die
opzet nu sluitend is. De popup is een extensiepagina: **niet** in `windows`
zetten, want dan zou extensiecode `tab:new`, `nav:go` en `ws:close` kunnen
aanroepen. Aparte, kleine map:

```js
// Alleen voor het meten van de popup. Bewust niet in `windows`: die registry
// geeft toegang tot álle kanalen, en in een popup draait code van derden.
const popupVensters = new Map(); // wc.id -> controller
ipcMain.handle('ext:popup-size', (e, w, h) => popupVensters.get(e.sender.id)?.setExtensiePopupMaat(w, h));
```

En in `preload-extensie-popup.js` staat dan ook precies één methode. Wat een
extensie daarmee kan is haar eigen popup groter maken; dat is te overzien.

### Nieuwe bestanden

| Bestand | Proces | Inhoud |
| --- | --- | --- |
| `extensies.js` | hoofdproces | Administratie (`extensies.json`), installeren/verwijderen, `pasToe(ses)`, `loadExtension`/`removeExtension`, iconen als `data:`-URL |
| `extensie-rapport.js` | hoofdproces | Manifest lezen, namen lokaliseren, `chrome.*` scannen, rapport samenstellen |
| `preload-extensie-popup.js` | preload | Eén methode: `meldGrootte(b, h)` → `ext:popup-size` |
| `renderer/extensies.js` | renderer | Strook + paneel + rapportweergave, luistert zelf op `onState` en `onExtensions` |

Bestaande bestanden die meegaan: `main.js` (zie hieronder), `preload.js`
(methoden onder `browser.extensions = { … }`, met `onExtensions` en `onExtLog`
als luisteraars), `renderer/index.html` (de strook, de paneel-overlay, één
`<script>`), `renderer/style.css` (de nieuwe regels, plus één nieuwe variabele
`--waarschuwing` in `:root` voor het rapport — de amber die er is heet
`--assistent` en betekent iets anders). `package.json` mag ongemoeid: geen
nieuwe afhankelijkheden.

### Wat er in main.js bij moet

Kort, en zoveel mogelijk in `extensies.js`:

1. Bij de bestaande `require`: `dialog` en `session` uit `electron`, plus
   `./extensies.js` en `./extensie-rapport.js`.
2. In `app.whenReady()`: `await extensies.init()` (administratie lezen) en de
   extensies van de eerste workspace laden vóór `new BrowserWindowController()`.
3. In `addWorkspace()`: `ws.ses = session.fromPartition(ws.partition)`,
   `extensies.pasToe(ws.ses)` en de `extension-ready`-luisteraar met de
   herlaadregel.
4. In `closeWorkspace()`: de luisteraar afmelden. De sessie zelf blijft bestaan
   (dat doet Electron), dus de extensies hoeven niet gelost te worden.
5. Vier methoden op de controller: `toonExtensiePopup(sleutel)`,
   `verbergExtensiePopup()`, `layoutExtensiePopup()`,
   `setExtensiePopupMaat(b, h)`, plus `stuurExtensieStand()` die `ext:state`
   pusht.
6. In de bestaande `resize`-handler `layoutExtensiePopup()` erbij; in
   `activateTab()` en `activateWorkspace()` een `verbergExtensiePopup()`; in
   `win.on('closed')` de opruiming.
7. Een blok `ipcMain.handle('ext:…')` bij de andere, en de aparte
   `popupVensters`-map voor `ext:popup-size`.

`pushState()` blijft ongemoeid. De extensie-stand loopt over een eigen kanaal,
zodat dit ontwerp niet botst met de andere die aan die functie zitten.

---

## 6. Veiligheid

Dit is het deel dat niet weggeschreven mag worden.

**Een extensie die in een workspace aan staat, ziet die workspace volledig.**
Met `content_scripts` op `<all_urls>` leest en wijzigt ze elke pagina die je
daar opent: de inhoud van je mail, je bankoverzicht, alles wat je in een
formulier typt, en elke cookie die niet `httpOnly` is. Met `chrome.webRequest`
ziet ze bovendien elk verzoek dat de sessie doet, inclusief headers. En omdat
Electron géén toestemmingsscherm toont, krijgt ze dat op het moment dat je haar
aanzet, zonder dat er iets is gevraagd. Onze installatie- en aanzethandeling zíjn
de toestemming; daarom staat dat rapport er.

**Wat de grens wél houdt:**

- *Andere workspaces.* Aparte `persist:`-partitie, dus aparte cookies,
  aparte `localStorage`, aparte `chrome.storage.local`. Een extensie in je
  werk-workspace ziet je privé-workspace niet. **Dit is de belangrijkste
  veiligheidsmaatregel in dit hele ontwerp**, en het is de reden dat aan/uit per
  workspace gaat en niet per app. Advies in de UI: houd de workspace waar je
  bankiert extensievrij.
- *De UI zelf.* Zijbalk en eiland draaien in de standaardsessie, niet in een
  workspace-sessie. **Laad nooit een extensie in `session.defaultSession`.**
  Bovendien zijn onze eigen pagina's `file:`-URL's, en met
  `allowFileAccess: false` (de standaard, die zo moet blijven) mogen content
  scripts daar niet komen. Zou je die vlag aanzetten voor een devtools-extensie,
  dan geef je extensies toegang tot `renderer/newtab.html` en tot bestanden op
  schijf. Niet doen.
- *Onze IPC.* Tabbladen hebben geen preload en staan niet in `windows`; de popup
  heeft één preload met één methode en staat bewust ook niet in `windows`. Er is
  dus geen pad van extensiecode naar `tab:new` of `ws:close`.

**Wat de grens níet houdt:**

- Een extensie kan alles wat ze in de pagina ziet naar buiten sturen. Er is geen
  netwerkbeperking en er is geen `chrome.permissions`, dus ook geen manier om
  host-toegang achteraf in te perken.
- Er is **geen bijwerkmechanisme**. Twee kanten: wat je installeert blijft wat
  het is, dus de klassieke aanval "populaire extensie wordt verkocht en werkt
  zichzelf bij naar spyware" kan hier niet — maar beveiligingsfouten worden ook
  nooit gerepareerd. Zet de installatiedatum in het paneel, dan zie je hoe oud
  het spul is.
- Onze extensiemap is gewoon schrijfbaar voor alles wat onder jouw account
  draait. Optioneel, goedkoop met `node:crypto`: bij installatie een SHA-256
  over de bestandslijst en de inhoud opslaan (`vingerafdruk`), bij het starten
  hercontroleren en bij verschil de extensie niet laden maar melden. Voor
  gekoppelde ontwikkelmappen overslaan, die veranderen per definitie.
- **De assistent.** Zijn tabblad zit in dezelfde sessie als jouw tabbladen, dus
  een extensie leest ook wat hij doet, en injecteert ook in de pagina's waar hij
  doorheen werkt. Andersom kan de code van een extensie reageren op wat hij op
  een pagina uitvoert. Zolang de assistent een geschreven reeks stappen is, is
  dat theorie; zodra er een model achter hangt dat zelfstandig navigeert
  (punt 2 van de routekaart), zijn het twee zelfstandige partijen in dezelfde
  sessie. Overweeg dan een regel op appniveau: geen extensies in workspaces waar
  de assistent mag werken, of andersom.

**Standaarden die hieruit volgen:** installeren zet nooit aan; aanzetten is per
workspace; `allowFileAccess` blijft `false`; de strook in de zijbalk is
permanent zichtbaar zolang er iets aan staat, zodat je nooit vergeet dat er
iemand meekijkt; en de noodrem zet in één handeling alles overal uit.

---

## 7. Wat er mis kan gaan

- **Content scripts missen bij de eerste paginalading** als een tabblad eerder
  klaar is dan `loadExtension`. Opgevangen met de `extension-ready`-herlading,
  maar die herlading kan zelf hinderlijk zijn (formulier kwijt). Daarom niet in
  tabbladen met een eigenaar, en alleen bij tabbladen die al een URL hadden.
- **Geheugen.** Elke sessie waar een MV2-extensie aan staat, krijgt een eigen
  achtergrondpagina. Dezelfde extensie in vier workspaces = vier
  achtergrondpagina's. Zichtbaar te maken via
  `webContents.getAllWebContents().filter(wc => wc.getType() === 'backgroundPage')`;
  het is de moeite waard dat aantal in het paneel te tonen.
- **Een extensie blokkeert alles.** `chrome.webRequest` kan al het verkeer in
  die workspace tegenhouden. Zonder noodrem lijkt de browser dan stuk.
- **`loadExtension` gooit** bij een kapot manifest, of bij een sleutel die
  Electron niet aankan. Vangen, markeren, doorgaan. Nooit de app laten vallen op
  een extensie.
- **Achtergrondpagina crasht.** Via `app.on('web-contents-created')` de
  `'render-process-gone'` van pagina's van het type `backgroundPage` opvangen en
  in `ext:log` melden; Electron herlaadt zo'n extensie zelf (dat is precies wat
  `extension-loaded` "reloaded from a crash" betekent), dus niet zelf ook nog
  eens herladen.
- **Popup meet zichzelf verkeerd** en wordt afgeknipt, of blijft wit doordat
  `chrome.action` ontbreekt. Beide zichtbaar maken in plaats van verbergen.
- **Id-verschuiving** bij verhuizing van `userData`: instellingen van de
  extensie zijn weg, terwijl onze administratie zegt dat hij aan staat. Merkbaar
  te maken door het `chromiumId` na het laden te vergelijken met het opgeslagen
  id en bij verschil een regel in het paneel te zetten.
- **Twee vensters delen `persist:ws-1`** (bestaand gedrag, zie 2). Aan- of
  uitzetten in het ene venster werkt door in het andere. Het paneel moet daarom
  bij `extension-loaded`/`-unloaded` opnieuw pushen naar álle vensters, niet
  alleen naar het venster waar de klik vandaan kwam.

---

## 8. Wat dit niet oplost

- **Geen Chrome Web Store, geen `.crx`, geen bijwerken.** Er komt geen knop die
  "installeer uBlock Origin" doet.
- **Geen werkende MV3-extensies met een service worker.** Dat is het overgrote
  deel van wat er tegenwoordig in de store staat.
- **Geen badges, geen contextmenu-items, geen sneltoetsen (`commands`), geen
  omnibox, geen notificaties, geen `declarativeNetRequest`, geen
  `chrome.cookies`/`bookmarks`/`history`/`downloads`, geen `storage.sync`, geen
  `chrome.action.onClicked`.** Een extensie zonder `default_popup` doet bij een
  klik niets.
- **Geen echte adblocker via een extensie.** Wil je blokkeren, doe dat native
  met `session.webRequest` per workspace; dat is minder werk en het werkt wél.
- **Geen incognito, geen toestemmingsscherm van Chrome, geen
  handtekeningcontrole.** Ons rapport is een hulpmiddel, geen zandbak: het
  vertelt je wat een extensie mag, het houdt haar nergens van.
- **Geen synchronisatie van welke extensies aan staan** tussen apparaten, en tot
  er sessieherstel is ook geen stabiele identiteit van een workspace over
  herstarts heen. De aan/uit-lijst hangt aan `persist:ws-N` en dat is voorlopig
  het beste wat er is.

---

## 9. Onzeker — eerst meten

Vier dingen weet ik niet zeker uit de documentatie en de typings. Ze zijn alle
vier goedkoop te beproeven met één minimale MV2-extensie ("kanarie": een
`content_script` dat `document.title` aanpast, een achtergrondpagina die
`chrome.runtime.onMessage` beantwoordt, een `default_popup` die
`chrome.storage.local` schrijft, en een `devtools_page`).

1. **Content scripts in een `sandbox: true`-view.** Onze tabbladen worden
   aangemaakt met `sandbox: true` (main.js regel 352). Chromium injecteert
   content scripts in een geïsoleerde wereld, wat daar los van zou moeten staan,
   maar ik heb het niet bevestigd gezien. Meten: kanarie aanzetten, tabblad
   openen, kijken of de titel verandert. Werkt het niet, dan is dat een echte
   afweging — content scripts zijn de kern van extensies, `sandbox: true` is de
   kern van onze veiligheidsopzet.
2. **`chrome.*` in extensiepagina's die wij zelf laden** (popup, optiespagina),
   en of `sandbox: true` daar verschil maakt. Meten: popup openen, in de console
   `typeof chrome.storage` en `typeof chrome.runtime.sendMessage` opvragen. Als
   het alleen zonder sandbox werkt: `sandbox: false` uitsluitend voor de popup,
   en dat expliciet opschrijven als toegeving.
3. **Hoe het id precies tot stand komt.** Ik ga ervan uit dat Chromium het bij
   een uitgepakte extensie uit het absolute pad afleidt, tenzij het manifest een
   `key` bevat (dan komt het store-id eruit). Meten: dezelfde map onder twee
   paden laden en `extension.id` vergelijken; een map uit een Chrome-profiel
   laden en kijken of het id overeenkomt met dat van de store.
4. **Of `webContents.on('blur')` betrouwbaar vuurt voor een `WebContentsView`.**
   Zo niet, dan is het sluiten van de popup volledig afhankelijk van de andere
   vier aanleidingen. Meten voordat je erop bouwt.

Kleiner, ook onbekend: of `chrome.i18n.getMessage()` bestaat (de manifestsleutel
`default_locale` wordt ondersteund, de JS-API staat niet in de lijst — ik ga
uit van niet), en of de waarschuwingen die `loadExtension` bij het laden op de
console zet programmatisch te vangen zijn (ik denk van niet; ze gaan naar
stderr van het hoofdproces). Daarom doen we de manifestanalyse zelf.

---

## 10. Volgorde van bouwen

Dit hoort niet vóór punt 1 en 2 van de routekaart in CLAUDE.md
(`setPermissionRequestHandler` en de assistent met een logboek). Een extensie
mag pas in een workspace als het permissiegat dicht is; anders stapelen twee
dingen die "alles mogen" op elkaar.

1. **De kanarie-extensie en de vier metingen uit hoofdstuk 9.** Een halve dag,
   en het bepaalt of de rest zin heeft.
2. `extensies.js` + `extensie-rapport.js`, installeren en per workspace laden,
   nog helemaal zonder UI — te bedienen vanuit de DevTools-console van het
   hoofdproces.
3. Het paneel met de zes stipjes, plus het installatierapport.
4. De strook in de zijbalk, met alleen iconen (nog geen popup): klikken opent de
   optiespagina of doet niets, met uitleg.
5. De popup als eigen `WebContentsView`, inclusief meten en sluiten.
6. Vingerafdruk, noodrem, geheugenteller in het paneel.

Voor stap 3 en verder is er nog een keuze te maken die buiten dit ontwerp valt:
upgraden naar Electron ≥ 35 en `electron-chrome-extensions` erbij nemen. Dat
levert in één klap `chrome.action`, `contextMenus`, `windows`, `cookies`, een
echte toolbar en werkende MV3-service-workers op, en het kost een
Electron-upgrade (waarbij de extensie-API ook nog naar `session.extensions`
verhuist), een GPL-3-afhankelijkheid in het hoofdproces en een preload-bestand
uit een pakket in de renderer. Dat laatste schuurt met de regel "geen
build-stap". Het is een projectbeslissing, geen implementatiedetail; ik zou het
pas overwegen als uit stap 1 blijkt dat de eigen weg werkt maar te kaal is.

---

## Inspanning

**Groot.** Ruwweg: metingen een halve dag, hoofdprocesdeel
(`extensies.js`, `extensie-rapport.js`, de haken in `main.js`) twee tot drie
dagen, paneel en strook twee dagen, popup één tot twee dagen met de randen
(meten, sluiten, kapotte popups tonen). Het meeste risico zit niet in de code
maar in de verwachting: elke gebruiker die "extensies" leest, denkt aan de Web
Store. De UI moet dat vanaf de eerste zin rechtzetten.
