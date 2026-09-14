# Geschiedenis en bladwijzers

Dit onderdeel ziet eruit zoals het eruitziet omdat drie eisen elkaar knijpen:
geen build-stap, weinig dependencies, en geschiedenis die per workspace
gescheiden is zoals de cookies dat al zijn. Een database (`better-sqlite3`) is
een native module — dat betekent prebuilds per platform per Electron-ABI en een
`electron-rebuild` in het pad, oftewel precies de build-stap die dit project niet
wil. Tegelijk is de dataset klein: één mens, één machine, tienduizenden regels,
geen concurrency. Daarom: **een append-only JSONL-logboek per workspace op schijf,
en een index in het geheugen van het hoofdproces**. Zoeken is dan een lineaire
scan over een Map van hooguit een paar tienduizend unieke adressen, wat in V8
onder de vijf milliseconden blijft — sneller dan een IPC-heen-en-weer. Bladwijzers
zijn zo klein dat één JSON-bestand volstaat dat bij elke wijziging in zijn geheel
wordt herschreven. De UI volgt de bestaande vorm: geschiedenis duikt op in de
commandobalk waar je toch al typt, bladwijzers hangen als tegels in de zijbalk
waar je toch al kijkt, en de volledige lijsten krijgen één interne pagina die
gewoon een tabblad is.

## 0. Beslissingen in één oogopslag

| Vraag | Keuze | Waarom |
| --- | --- | --- |
| Opslag geschiedenis | JSONL, één bestand per partitie | append is goedkoop, tekst is te repareren, geen dependency |
| Opslag bladwijzers | één `bladwijzers.json`, volledig herschreven | te klein om ingewikkeld over te doen |
| Index | volledig in geheugen in het hoofdproces | zoeken moet sneller zijn dan typen |
| Scheiding | op partitienaam (`persist:ws-1`), niet op workspace-id | precies zo gescheiden als de cookies, geen millimeter meer |
| Bladwijzers: mappen of tags | **tags**, plus een platte rij vastgezette tegels | een boom in 264px zonder framework is veel code voor weinig |
| Aparte pagina | ja, één pagina met twee secties, als gewoon tabblad | terug/vooruit werkt, je kunt hem vastzetten |
| Adres van die pagina | eigen schema `tougather://archief/…` | echte origin, schone adresbalk, controleerbare afzender bij IPC |

## 1. Waar het staat en in welk formaat

### Mappen

Alles onder `app.getPath('userData')`:

```
<userData>/archief/
  geschiedenis/
    persist_ws-1.jsonl
    persist_ws-2.jsonl
  bladwijzers.json
  status.json
  favicons/            (pas in stap 2, zie §6)
```

De partitienaam is de sleutel, en die bevat een dubbele punt — illegaal in een
Windows-bestandsnaam. Saneren met `partitie.replace(/[^a-z0-9-]+/gi, '_')`, dus
`persist:ws-1` wordt `persist_ws-1.jsonl`.

Let op wat die sleutel betekent: `nextWorkspaceId` begint in **elk** venster bij
1, dus twee vensters hebben allebei een `persist:ws-1` en delen nu al hun
cookies. De geschiedenis erft dat exact. Dat is geen nieuwe fout maar wel een
bestaande die zichtbaarder wordt; als de workspace-identiteit ooit vensteroverstijgend
wordt (nodig voor sessieherstel, punt 6 op de lijst in `CLAUDE.md`), verhuist
dit bestand mee zonder dat het formaat verandert.

### Geschiedenis: JSON Lines

Eerste regel is een kop, daarna één bezoek per regel:

```
{"versie":1,"partitie":"persist:ws-1"}
{"i":"m8x2q1","t":1757356812345,"u":"https://nl.wikipedia.org/wiki/Elektron","k":"Elektron — Wikipedia","f":"https://nl.wikipedia.org/static/favicon/wikipedia.ico"}
{"i":"m8x2q2","t":1757356840111,"u":"https://linear.app/tougather","k":"Tougather · Linear","a":"Kim"}
```

Korte sleutels, want dit bestand wordt lang: `i` id, `t` tijdstip in ms, `u` url,
`k` kop (titel), `f` favicon-url (weggelaten als onbekend), `a` de assistent die
het bezocht (weggelaten als jij het was). Het id is base36 van `Date.now()` plus
een teller, uniek binnen het bestand; verwijderen werkt erop.

Eén regel = één JSON-object betekent dat een halve regel na een crash maar één
bezoek kost. De lader doet per regel een `try { JSON.parse } catch { overslaan }`
en zet bij een overgeslagen regel de vlag `vuil`, zodat het bestand bij de
eerstvolgende gelegenheid schoon wordt weggeschreven.

### Bladwijzers: één document

```json
{
  "versie": 1,
  "items": [
    {
      "id": "b-m8x2q1",
      "url": "https://linear.app/tougather",
      "titel": "Tougather · Linear",
      "f": "https://linear.app/favicon.ico",
      "tags": ["werk", "planning"],
      "vast": true,
      "ws": "persist:ws-1",
      "t": 1757356812345
    }
  ]
}
```

`ws` is de partitie waar de bladwijzer bij hoort; de waarde `"*"` betekent
"overal zichtbaar", zodat je tien kernsites niet zes keer hoeft toe te voegen.
De volgorde van `items` is de volgorde van de vastgezette tegels. Geen `map`-veld:
zie §0.

### status.json

```json
{ "versie": 1, "gepauzeerd": ["persist:ws-2"] }
```

Meer niet. Zodra er echte instellingen zijn, verhuist dit daarheen.

### Schrijven

- **Toevoegen** gaat gebufferd. Nieuwe regels gaan in een array per partitie;
  1500 ms na de laatste, of bij 25 wachtende regels, één
  `fs.promises.appendFile(pad, regels.join('\n') + '\n')`. Geen open write-stream
  per workspace: dan houd je bestandsdescriptors vast voor workspaces waar je al
  een uur niet bent geweest.
- **Verwijderen** kan niet in een append-only bestand, dus verwijderen gebeurt in
  het geheugen en zet `vuil = true`. Een vuil bestand wordt in zijn geheel
  herschreven: `fs.promises.writeFile(pad + '.tmp', …)` gevolgd door
  `fs.promises.rename(pad + '.tmp', pad)`. Rename is atomair binnen hetzelfde
  volume, dus een crash halverwege laat het oude bestand heel. Herschrijven is
  zeldzaam en 10 MB wegschrijven duurt tientallen milliseconden — prima.
- **Afsluiten**: `app.on('before-quit')` wacht *niet* op een promise. De laatste
  spoeling moet dus synchroon: `fs.appendFileSync` voor de buffers en
  `fs.writeFileSync` + `fs.renameSync` voor vuile bestanden. Dat is de enige plek
  in dit ontwerp waar synchrone I/O staat, en er staat een comment bij waarom.

### Laden en snelheid

Per partitie lui laden, bij het eerste bezoek of de eerste zoekvraag. `readFile`
+ `split('\n')` is voor 10 MB zo'n 50 ms; komt er ooit meer, dan is
`node:readline` over een `createReadStream` de volgende stap zonder dat het
formaat verandert. Tot het geladen is gaan nieuwe bezoeken in een wachtrij.

In het geheugen twee structuren per partitie:

```js
// Chronologisch logboek: dit is wat de archiefpagina toont, en wat naar schijf gaat.
/** @type {Array<Bezoek>} */ const bezoeken = [];

// Per uniek adres samengevat: dit is wat de commandobalk doorzoekt. Veel kleiner
// dan het logboek — je bezoekt dezelfde twintig sites de hele dag — en dus snel
// genoeg om lineair te scannen zonder index.
/** @type {Map<string, {url, titel, f, aantal, laatst, zoek}>} */ const plaatsen = new Map();
```

`zoek` is `(titel + '\n' + url).toLowerCase()`, één keer berekend. Zoeken splitst
de vraag op spaties en eist dat élke term als substring in `zoek` zit. Rangschikken
met een frecency-score:

```js
const dagen = (Date.now() - p.laatst) / 86400000;
const score = (2 * p.aantal + (titelTreffer ? 3 : 0)) / (1 + dagen / 14);
```

Sorteren, top N teruggeven. Wordt dit ooit traag (>50 000 unieke adressen), dan
is een emmer-index op de eerste letter van elke term de goedkope volgende stap;
niet nu bouwen.

### Snoeien

Bij het laden en bij elke herschrijving: gooi weg wat ouder is dan 90 dagen, en
als er dan nog meer dan 40 000 bezoeken staan, houd de nieuwste 40 000. Dat trimt
ook `plaatsen`, want die is afgeleid — een adres dat je een jaar geleden één keer
bezocht verdwijnt dus echt, inclusief zijn telling. Beide getallen als constante
bovenin `geschiedenis.js`.

## 2. Bezoeken registreren

Dit hangt aan de bestaande `createTab()` in `main.js`. Die registreert nu al een
rij events in een lus met arg-loze handlers; de nieuwe hebben argumenten nodig en
komen er dus los onder.

| Event | Wat het doet |
| --- | --- |
| `did-navigate` `(e, url, httpResponseCode)` | opent een nieuw *lopend* bezoek voor dit tabblad |
| `did-navigate-in-page` `(e, url, isMainFrame)` | idem, maar alleen als `isMainFrame` en de url anders is dan de lopende |
| `page-title-updated` `(e, titel)` | vult `k` van het lopende bezoek aan |
| `page-favicon-updated` `(e, favicons)` | vult `f` aan met `favicons[0]` |

Een bezoek wordt niet meteen weggeschreven. De titel komt bijna altijd ná
`did-navigate`, en de favicon nog later. Het lopende bezoek staat daarom in
`lopend: Map<tabId, Bezoek>` en gaat pas het logboek in bij: het volgende
`did-navigate` in datzelfde tabblad, `closeTab()`, of 3000 ms zonder verandering.
Komt er daarna alsnog een titel binnen, dan verandert alleen het object in het
geheugen en wordt het bestand `vuil` — op schijf loopt zo'n titel dus hooguit tot
de volgende herschrijving achter. Dat is het bewust geaccepteerde randgeval.

Coalesceren tegen SPA-ruis: `did-navigate-in-page` vuurt op sommige sites bij elke
scrollstap. Regel: dezelfde url binnen 2 s in hetzelfde tabblad vervangt het
lopende bezoek in plaats van er een nieuw naast te zetten, en alleen `isMainFrame`
telt.

**Wat er niet in gaat**, gecontroleerd vóór het opnemen:

- schema's `data:`, `blob:`, `javascript:`, `about:`, `chrome:`, `devtools:`
- de nieuw-tabblad-pagina (`url.startsWith(NEWTAB)`) en alles onder `file://`
  binnen de app-map — die zijn interne meubels, geen bezoek
- alles op `tougather:` — het archief hoort niet in zijn eigen lijst
- urls met inloggegevens erin (`user:pass@host`), die worden overgeslagen in plaats
  van gestript, want strippen levert een adres op dat niet meer werkt
- mislukte navigaties: er wordt niets aan `did-fail-load` gehangen, dus wat
  Chromium nooit als navigatie afmaakt komt er ook niet in

**Assistent-tabbladen** worden wél opgenomen, met `a: "Kim"`. Dat is het hele punt
van deze browser: je moet later kunnen nazien wat hij heeft opengeslagen terwijl
jij ergens anders was. De eigenaar komt uit de bestaande `this.owners.get(tabId)`
op het moment van opnemen. Op de archiefpagina is er een filter "alleen van Kim"
en in de commandobalk krijgt zo'n resultaat de hint `Kim · bezocht`.

Pauzeren: `hist:pause` zet de partitie in `status.json`; `noteer()` keert dan
meteen terug. De vastgezette tegels en bladwijzers blijven gewoon werken.

## 3. Interne pagina's: het `tougather:`-schema

De archiefpagina heeft IPC nodig en dus een preload — maar tabbladen zijn
`sandbox: true` zonder preload, en dat moet zo blijven. Twee dingen lossen dat op.

**Een eigen schema.** Bovenaan `main.js`, vóór `app.whenReady()`:

```js
protocol.registerSchemesAsPrivileged([
  { scheme: 'tougather', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);
```

`standard: true` geeft de pagina een echte origin (`tougather://archief`), en dat
is wat je nodig hebt om in een IPC-handler te kunnen controleren wie er belt.

**Een eigen sessie.** De archiefpagina draait niet in `persist:ws-N` maar in
`persist:archief`, zodat een website nooit dezelfde sessie deelt met een pagina
die een preload heeft. Het schema wordt dus maar één keer geregistreerd, op die
ene sessie, in plaats van bij elke nieuwe workspace opnieuw:

```js
const ses = session.fromPartition('persist:archief');
ses.protocol.handle('tougather', (req) => {
  const { host, pathname } = new URL(req.url);
  if (host !== 'archief') return new Response('', { status: 404 });
  const naam = BESTANDEN[pathname] ?? null;         // witte lijst, geen padrekenwerk
  if (!naam) return new Response('', { status: 404 });
  return net.fetch(pathToFileURL(path.join(__dirname, 'renderer', naam)).href);
});
```

Een witte lijst in plaats van paden samenstellen: `..` in een pad is de klassieke
manier om zo'n handler het hele bestandssysteem te laten uitserveren.

Dat de archieftab een andere partitie heeft dan zijn workspace vraagt één
aanpassing in `createTab()`: `opties.partitie` die `ws.partition` overstemt. De
pagina weet daardoor zelf niet in welke workspace hij hangt — dat hoeft ook niet,
want het hoofdproces leidt dat af uit `event.sender` via de bestaande `windows`-
registry, precies zoals nu al gebeurt.

**Het navigatieslot.** `webPreferences` horen bij de webContents, niet bij de
navigatie: als die tab naar `https://…` gaat, blijft de preload eraan hangen.
Daarom op de archiefview:

```js
wc.on('will-navigate', (e, doel) => {
  if (doel.startsWith('tougather://archief/')) return;
  // Een pagina met preload mag nooit ergens anders belanden; die link opent
  // als gewoon tabblad in de workspace waar je bent.
  e.preventDefault();
  this.createTab(doel);
});
wc.setWindowOpenHandler(({ url }) => (this.createTab(url), { action: 'deny' }));
```

En in élke nieuwe IPC-handler een afzenderscontrole:

```js
function archiefVan(event) {
  if (new URL(event.senderFrame.url).origin !== 'tougather://archief') return null;
  return windows.get(event.sender.id) ?? null;
}
```

Openen gebeurt via `controller.openArchief(pad)`: bestaat er in deze workspace al
een tabblad op `tougather://archief/`, dan `loadURL` daarop en activeren; anders
een nieuw tabblad. `toURL()` krijgt er een tak bij, zodat `tougather://…` intypen
in de adresbalk ook daar terechtkomt in plaats van in de workspace-sessie te
mislukken.

De webContents-id van elke archieftab moet in `windows` (anders werkt
`controllerFor` niet) én er bij `closeTab()` weer uit. Dat laatste is nu nergens
nodig en dus makkelijk te vergeten — het is een lek dat pas na tientallen
geopende archieftabs opvalt.

## 4. De archiefpagina

Eén pagina, twee secties, bereikbaar op `tougather://archief/geschiedenis` en
`tougather://archief/bladwijzers`, met een segmentschakelaar bovenin die
`history.pushState` gebruikt zodat terug/vooruit in de zijbalk klopt. Vorm:
zelfde glasvlakken, zelfde variabelen uit `style.css` (de pagina laadt zijn eigen
`archief.css` die `:root` overneemt — kleuren blijven variabelen, geen hex).
CSP in de `<head>`: `default-src 'self'; img-src 'self' https: data:; style-src 'self'`.

### Sectie geschiedenis

```
┌──────────────────────────────────────────────────────────┐
│  Geschiedenis   Bladwijzers          [ Persoonlijk ▾ ]   │
│  ┌────────────────────────────┐  [Alles] [Van Kim]  Wis▾ │
│  │ 🔍 Zoek in geschiedenis    │                          │
│  └────────────────────────────┘                          │
│                                                          │
│  Vandaag                                                 │
│   14:22  ▣  Elektron — Wikipedia      nl.wikipedia.org ×  │
│   14:19  ▣  Tougather · Linear   Kim  linear.app       ×  │
│  Gisteren                                                │
│   …                                                      │
└──────────────────────────────────────────────────────────┘
```

- Gegroepeerd per dag met plakkende dagkoppen. Rij = tijd, favicon, titel,
  hostnaam, en een × die pas bij hover verschijnt (zelfde patroon als `.tab .close`).
- Klik opent in het huidige tabblad, Ctrl/Cmd-klik of middenklik in een nieuw.
- Alleen de eerste 200 rijen worden getekend; een sentinel onderaan met een
  `IntersectionObserver` haalt de volgende 200 op via `hist:list` met een cursor
  (`voor` = tijdstip van de laatste rij). Zonder dat wordt 40 000 `<li>` een
  seconde lang wit scherm.
- Zoeken filtert over het logboek (niet over `plaatsen`), 120 ms gedebouncet.
- De workspacekiezer rechtsboven toont de workspaces van dit venster. Standaard
  staat hij op de workspace waar je vandaan komt; je kúnt overschakelen. Dat is
  een bewuste keuze: de scheiding is er tegen vervuiling en tegen door elkaar
  lopende logins, niet als geheimhouding (zie §11).
- `Wis▾` opent een klein menu: Laatste uur / Vandaag / Laatste 7 dagen / Alles.
  Elke keuze gebruikt het bestaande bewapen-patroon van `sluitWorkspace()`: eerste
  klik kleurt de knop rood en zegt wat er weggaat, tweede klik binnen 2,5 s voert
  uit. Deze app heeft geen dialoogvensters en `window.confirm` is er niet.
- Een rij verwijderen is `hist:remove` met één id. Alles van één site verwijderen
  hoort in het contextmenu dat er nog niet is (punt 3 in `CLAUDE.md`); tot dan zit
  het achter een Alt-klik op de hostnaam, met dezelfde bewapening.

### Sectie bladwijzers

Dezelfde lijstvorm, plus een rij tagchips onder het zoekveld die als filter werkt
(meerdere tags = EN). Een rij toont favicon, titel, host, tags, en bij hover een
potlood (opent dezelfde popover als in de zijbalk, §6) en een ×. Bovenaan de
vastgezette bladwijzers als aparte groep, versleepbaar om de volgorde te zetten
(HTML5 `dragstart`/`dragover`/`drop`, alles binnen één renderer, geen IPC tijdens
het slepen — alleen `mark:order` bij de drop).

## 5. Commandobalk (Ctrl+K)

`huidigeResultaten()` in `renderer/app.js` is nu synchroon en levert
`[ga, tabbladen, werkruimtes]`. Geschiedenis en bladwijzers komen van het
hoofdproces en zijn dus asynchroon. Nieuwe volgorde:

1. `Ga naar` / `Zoeken` (bestaand, altijd bovenaan)
2. Open tabbladen (bestaand)
3. Bladwijzers — hint `Bladwijzer`, max 5
4. Geschiedenis — hint `Bezocht` of `Kim · bezocht`, max 6
5. Workspaces (bestaand)
6. Commando's — `Geschiedenis openen`, `Bladwijzers openen`, hint `Commando`

Zonder tekst in het veld: open tabbladen, workspaces, en daaronder drie
vastgezette bladwijzers onder de kop `Vastgezet`. Geen geschiedenis bij lege
invoer; een leeg palet dat je laatste zes bezoeken uitstalt is een lek richting
wie er meekijkt.

De asynchronie moet netjes, anders springt de selectie onder je vingers weg:

```js
// Elke toetsaanslag krijgt een nummer. Een antwoord van het hoofdproces dat
// onderweg is ingehaald door een nieuwere vraag gooien we weg.
let generatie = 0;
// De selectie is een sleutel ('hist:https://…'), geen index: de lijst groeit
// als het antwoord binnenkomt, en dan wijst een index naar iets anders.
let keuzeSleutel = null;
```

`hist:search` wordt 90 ms gedebouncet; `mark:list` niet, want die lijst staat al
in de renderer (zie §6) en filtert lokaal. Het hoofdproces antwoordt uit het
geheugen, dus de echte kosten zijn de IPC-heen-en-weer, niet de zoekactie.

Verwijderen vanuit het palet: Shift+Delete op een gemarkeerd geschiedenisresultaat
roept `hist:remove` aan en tekent opnieuw. Sterretje toevoegen kan niet vanuit
het palet — dat hoort bij de pagina die je bekijkt, en dat is de ster in de zijbalk.

## 6. Zijbalk: ster, popover, vastgezette tegels

**De ster** wordt een vierde knop in `#controls`, met `margin-left: auto` zodat hij
rechts in die rij staat, los van terug/vooruit/herladen. Gevuld als de huidige
url een bladwijzer is, omlijnd als niet. Geen extra IPC-kanaal daarvoor:
`describe()` in `main.js` krijgt er een veld `bladwijzer` bij
(`bladwijzers.isBladwijzer(ws.partition, url)`, een Map-opzoeking), dus de
bestaande `tabs:state` draagt het al mee.

**De popover** (`#mark-pop`) opent bij een klik op de ster of met Ctrl+D: 240px
breed, links uitgelijnd onder de knop, met titelveld (geselecteerd bij openen),
tagveld met suggesties uit de bestaande tags, een schakelaar `Vastzetten`, een
rijtje workspace-stippen om hem te verplaatsen (inclusief een `∗` voor overal), en
`Verwijderen` in rood. Sluit op Escape of bij verlies van focus.

Belangrijk detail: dit hoeft **niet** via `ui:palette` de pagina weg te nemen. De
pagina-view begint op `x = SIDEBAR_WIDTH`; alles wat binnen die 264 pixels blijft,
tekent gewoon over de zijbalk. De commandobalk moest de pagina wél wegnemen omdat
hij over het volle venster gecentreerd staat. Een popover die breder wordt dan de
zijbalk verdwijnt dus meteen onder de pagina — dat is de val hier.

**Vastgezette tegels** komen tussen `#address` en `#tablist`:

```
┌ zijbalk ────────────────┐
│ ‹ › ⟳              ★    │
│ [ Zoek of adres…      ] │
│ ▣ ▣ ▣ ▣ ▣ ▣             │   ← #pinned, 6 per rij, 30px, max 2 rijen
│ ─────────────────────── │
│ ▣ Tabblad               │   ← #tablist, flex: 1
```

`display: grid; grid-template-columns: repeat(6, 1fr); gap: 4px`, verborgen als er
niets vastgezet is, en na twaalf tegels een chevron die de bladwijzerpagina opent.
Bewust een tegelraster en geen lijst: het tabbladenlijstje heeft `flex: 1` en moet
de ruimte houden. Klik navigeert het actieve tabblad, Ctrl/Cmd-klik of middenklik
opent een nieuw tabblad, Alt-klik opent de popover om te bewerken. Slepen ordent;
een tabblad uit `#tablist` op het raster laten vallen maakt er een bladwijzer van,
en een tegel op een workspace-stip in de voettekst verplaatst hem naar die
workspace.

Alt-klik is een noodgreep. Zodra er een contextmenu is (`context-menu`-event +
`Menu.buildFromTemplate`), horen bewerken, verplaatsen en verwijderen daarin, en
kan Alt-klik weg.

De renderer houdt de bladwijzerlijst in een variabele — niet in de DOM, want
`tabs:state` hertekent voortdurend. Bij elke wijziging stuurt het hoofdproces
`mark:state` naar alle vensters, met per venster de lijst van de daar actieve
workspace.

## 7. Sneltoetsen

| Toets | Actie |
| --- | --- |
| Ctrl/Cmd+D | popover openen voor de huidige pagina |
| Ctrl/Cmd+H | `tougather://archief/geschiedenis` |
| Ctrl/Cmd+Shift+B | `tougather://archief/bladwijzers` |
| Shift+Delete | in het palet: dit geschiedenisresultaat verwijderen |

Hier zit een addertje dat dit onderdeel niet zelf veroorzaakt maar wel raakt: de
`keydown`-listener in `renderer/app.js` vuurt alleen als de **zijbalk** focus
heeft. Lees je een pagina, dan gaan toetsen naar die webContents en gebeurt er
niets — dat geldt vandaag al voor Ctrl+K. Ctrl+D moet werken terwijl je leest,
anders is de ster het enige pad. Oplossing in `main.js`: naast `devtoolsSneltoets(wc)`
een `paginaSneltoetsen(wc)` op elk tabblad, met dezelfde
`before-input-event`-aanpak, die Ctrl+D / Ctrl+H / Ctrl+K afvangt en doorgeeft aan
de controller (`e.preventDefault()` zodat de pagina hem niet ook krijgt). Voor
Ctrl+K betekent dat: `this.win.webContents.send('ui:palette-open')` en de renderer
opent hem, inclusief focus terug naar de zijbalk.

## 8. IPC-overzicht

Kanaalnamen volgen `domein:actie`, met Engelse acties zoals de bestaande
(`tab:new`, `ws:rename`, `ui:palette`).

| Kanaal | Richting | Argumenten → resultaat |
| --- | --- | --- |
| `hist:search` | invoke | `(vraag, limiet)` → `[{url, titel, f, aantal, laatst, a}]` |
| `hist:list` | invoke | `({vraag, voor, aantal, eigenaar, partitie})` → `{items, meer}` |
| `hist:remove` | invoke | `(ids[])` → `aantal` |
| `hist:clear` | invoke | `({vanaf, tot, host, partitie})` → `aantal` |
| `hist:pause` | invoke | `(aan)` → `boolean` |
| `hist:status` | invoke | `()` → `{gepauzeerd, aantal, partitie, workspaces}` |
| `mark:list` | invoke | `()` → `{items, tags}` |
| `mark:add` | invoke | `({url, titel, tags, vast})` → `item` |
| `mark:update` | invoke | `(id, velden)` → `item` |
| `mark:remove` | invoke | `(id)` → `boolean` |
| `mark:order` | invoke | `(ids[])` → `boolean` |
| `mark:move` | invoke | `(id, partitie)` → `boolean` |
| `mark:state` | push → renderer | `{items, tags}` na elke wijziging |
| `ui:archive` | invoke | `(pad)` opent/activeert de archieftab |
| `ui:palette-open` | push → zijbalk | vanuit `before-input-event` op een pagina |

De partitie komt bijna nooit uit de renderer maar wordt in het hoofdproces
afgeleid uit de controller; alleen de archiefpagina mag met haar workspacekiezer
expliciet een andere partitie meegeven, en alleen als `archiefVan(event)` klopt.

## 9. Nieuwe bestanden, en wat `main.js` erbij krijgt

Nieuw:

```
geschiedenis.js                 hoofdproces, Node, opslag + index + zoeken
bladwijzers.js                  hoofdproces, Node, één JSON-document
preload-pagina.js               contextBridge voor interne pagina's → window.archief
renderer/archief.html           twee secties, segmentschakelaar
renderer/archief.css            eigen vlakken, kleuren uit dezelfde variabelen
renderer/archief.js             lijst, zoeken, verwijderen, tags, slepen
docs/ontwerp/…                  dit document
```

`geschiedenis.js` en `bladwijzers.js` staan naast `main.js` en niet in `renderer/`,
omdat ze `node:fs` gebruiken en `renderer/` de map is die met sandboxed tabbladen
gedeeld wordt.

In `main.js`:

1. `protocol` en `net` erbij in de require bovenin; `protocol.registerSchemesAsPrivileged`
   op moduleniveau, vóór ready.
2. Constanten: `ARCHIEF_PARTITIE = 'persist:archief'`, `ARCHIEF_START = 'tougather://archief/geschiedenis'`.
3. In `app.whenReady()`: `geschiedenis.gereed(app.getPath('userData'))`,
   `bladwijzers.laad(...)`, en de `ses.protocol.handle`-registratie.
4. `createTab()`: `opties.partitie` (overstemt `ws.partition`) en `opties.preload`;
   de vier geschiedenis-events; bij een interne pagina het navigatieslot, de
   `windows.set(wc.id, this)` en `paginaSneltoetsen(wc)`.
5. `closeTab()`: `geschiedenis.sluitTab(id)` en `windows.delete(wc.id)` voor
   interne pagina's.
6. `describe()`: veld `bladwijzer`.
7. Nieuwe methoden op de controller: `openArchief(pad)`, `bladwijzerVoorActief()`,
   `meldBladwijzers()`.
8. `toURL()`: tak voor `tougather:`.
9. De handlers uit §8, met `archiefVan(event)` voor alles wat van de pagina komt.
10. `app.on('before-quit')` → `geschiedenis.flushSync()` en `bladwijzers.flushSync()`.
11. `app.requestSingleInstanceLock()` in `whenReady`, zie §10.

En in `package.json`: `build.files` somt de bestanden expliciet op
(`main.js`, `preload.js`, `preload-island.js`, `renderer/**`). De drie nieuwe
bestanden in de wortel moeten daarbij, anders werkt `npm start` prima en mist de
gebouwde app ze.

## 10. Wat er mis kan gaan

- **Twee instanties.** Zonder `app.requestSingleInstanceLock()` kunnen twee
  processen hetzelfde `bladwijzers.json` herschrijven en elkaars werk wissen. Er
  is geen bestandsvergrendeling in dit ontwerp; de lock is het antwoord.
- **Halve regel na een crash.** Opgevangen door per regel te parsen en de rest te
  laten staan; kost hooguit één bezoek.
- **Titels lopen achter op schijf.** Zie §2; alleen zichtbaar als je crasht tussen
  het wegschrijven en de eerstvolgende herschrijving.
- **SPA-ruis.** Sites die per scrollstap `did-navigate-in-page` vuren, blazen het
  logboek op. De coalesceerregel van 2 s vangt het meeste; blijkt het in de
  praktijk niet genoeg, dan is een lijstje uitzonderingshosts nodig — en dat is
  een hellend vlak dat ik hier expres niet inbouw.
- **Geheugen.** 40 000 bezoeken plus hun `zoek`-strings zijn ruwweg 25–40 MB per
  geladen workspace. Workspaces worden lui geladen, maar wie zes workspaces
  aandoet, heeft ze alle zes in het geheugen. Als dat knelt: workspaces die een
  uur niet gebruikt zijn weer uit het geheugen laten vallen (het bestand blijft).
- **Preload op de verkeerde pagina.** Het navigatieslot van §3 is de enige
  bescherming; valt die weg, dan heeft een website een `window.archief`. De
  origincontrole in elke handler is de tweede lijn.
- **`windows`-lek.** Elke archieftab zet een id in de registry; vergeet je hem
  eruit te halen bij sluiten, dan groeit die Map en wijst hij naar dode
  webContents.
- **De klok.** Alles is `Date.now()` in lokale tijd; zomertijd maakt één dag met
  23 of 25 uur en de dagkoppen op de pagina moeten dat via lokale datumgrenzen
  berekenen, niet via deling door 86 400 000.
- **Favicons.** Vandaag bewaren we de url, niet het plaatje. Na een herstart is de
  faviconcache van de renderer leeg en zijn de vastgezette tegels blanco tot de
  site geladen is; daarom vallen ze terug op de eerste letter van de host in een
  gekleurd vakje. De echte oplossing (ophalen met `net.fetch`, verkleinen met
  `nativeImage.createFromBuffer(...).resize({ width: 32 })`, wegschrijven onder
  `archief/favicons/<host>.png` en serveren via `tougather://archief/favicon/<host>`)
  is stap 2 en niet nodig om dit af te maken.

## 11. Wat dit niet oplost

- **Geen privémodus.** Pauzeren is per workspace en zet alleen het opnemen stil;
  cookies, cache en localStorage blijven gewoon in `persist:ws-N` staan.
- **Geen geheimhouding tussen workspaces.** De bestanden staan onleesbaar-noch-
  versleuteld in `userData` en de archiefpagina kan naar een andere workspace
  schakelen. De scheiding is er tegen door elkaar lopende logins en tegen
  vervuilde suggesties, niet tegen iemand die je account al heeft.
- **Geen scrubbing van gevoelige urls.** Een herstellink met `?token=` belandt
  integraal in het logboek, net als in andere browsers. Titels van pagina's achter
  een login belanden er ook in.
- **Geen synchronisatie, geen import.** Bladwijzers uit Chrome of Firefox
  overnemen vraagt om een lezer voor het Netscape-bookmark-HTML-formaat; los
  toe te voegen later, het opslagformaat verandert er niet van.
- **Geen fuzzy zoeken.** Substring per term, geen typotolerantie, geen
  paginainhoud — alleen titel en adres.
- **Geen dedup over workspaces heen.** Dezelfde site in twee workspaces staat in
  twee bestanden en telt twee keer. Dat is gewild.
- **Geen ongedaan maken.** Verwijderen is meteen weg; de bewapening met twee
  klikken is het enige vangnet.

## 12. Volgorde van bouwen

1. `geschiedenis.js` en `bladwijzers.js` met hun bestandsformaat, plus opnemen in
   `createTab()`. Nog geen UI: te controleren met de bestanden in `userData`.
2. Ster, popover en vastgezette tegels in de zijbalk — het kortste pad naar iets
   dat je dagelijks gebruikt.
3. Geschiedenis en bladwijzers in de commandobalk, inclusief de generatietelling.
4. Het `tougather:`-schema, `preload-pagina.js` en het navigatieslot.
5. `renderer/archief.js`: eerst de geschiedenislijst met paginering en
   verwijderen, daarna de bladwijzersectie met tags.
6. Sneltoetsen via `before-input-event`, inclusief het repareren van Ctrl+K
   terwijl een pagina focus heeft.
7. Optioneel: faviconcache op schijf; `newtab.html` naar `tougather://` verhuizen
   zodat de nieuw-tabblad-pagina dezelfde tegels kan tonen (kan nu niet — die
   pagina is sandboxed zonder preload en `file://` mag niet bij het schema).

## 13. Waar ik de Electron-API niet zeker weet

- `session.protocol.handle(...)` op een `Session`-instantie: ik ben er redelijk
  zeker van dat `Session#protocol` bestaat in Electron 33, maar controleer het bij
  het bouwen. Bestaat het niet, dan is het alternatief het globale
  `protocol.handle`, dat op de standaardsessie werkt — en dan moet de
  archiefpagina in de standaardsessie draaien in plaats van in
  `persist:archief`, wat de isolatie van §3 afzwakt maar de rest van het ontwerp
  intact laat.
- `event.senderFrame` in een `ipcMain.handle`-callback: ik gebruik het hier voor
  de origincontrole. Als de naam of de vorm afwijkt, is `event.sender.getURL()`
  het bruikbare alternatief — minder precies bij iframes, maar interne pagina's
  hebben er geen.
- Of `net.fetch()` een `file://`-url zonder verdere opties accepteert binnen een
  `protocol.handle`-antwoord: dit is het patroon uit de documentatie zoals ik het
  ken, maar ik heb het niet in dit project uitgeprobeerd. Terugvaloptie:
  `fs.promises.readFile` en zelf een `Response` met het juiste `Content-Type`
  samenstellen (dan moet je de mime-types wel zelf bijhouden).
- `nativeImage.createFromBuffer(...).resize({ width: 32 })` en `.toPNG()` bestaan
  zeker; of `resize` een `quality`-optie heeft met de waarden `good/better/best`
  weet ik niet zeker en is voor 32 pixels ook niet belangrijk.
- Het exacte gedrag van `page-favicon-updated` bij sites die hun favicon pas na
  de eerste render zetten: de aanname is dat hij binnen de 3000 ms van de
  spoelvertraging binnenkomt. Dat is een gok over gedrag, geen API-feit.
