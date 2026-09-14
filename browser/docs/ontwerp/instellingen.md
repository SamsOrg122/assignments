# Instellingen en voorkeuren

Een workspace in Tougather is geen mapje met tabbladen, het is een **sessie**:
`session.fromPartition('persist:ws-N')`, met eigen cookies, eigen logins, eigen
opslag. Daarmee ligt de belangrijkste vraag van dit ontwerp al vast. Een
instelling die over die sessie gaat — wat er naar buiten lekt, wie je camera mag,
waar bestanden terechtkomen — hoort **per workspace**, want de Electron-API's
waarmee je hem uitvoert (`setPermissionRequestHandler`, `setDownloadPath`,
`clearStorageData`) hangen zelf al aan een `Session`. Een instelling die over
*jou* gaat — je ogen, je vingers — hoort **globaal**, want jij zit niet in een
workspace. Dat is de hele regel, en hij is niet verzonnen om netjes te klinken:
hij valt samen met waar Electron zijn knoppen heeft zitten. Het gevolg is dat
"per workspace" bijna gratis is en "globaal" één regel code, en dat elke
instelling die zich er niet naar voegt (het thema) een eerlijke uitzondering met
een reden moet zijn.

De rest van het ontwerp is klein gehouden met opzet: dertien knoppen, één
opslagbestand voor voorkeuren en één voor permissies, één schrijver (het
hoofdproces), geen Bewaar-knop.

---

## 1. De verdeling

| Instelling | Waar | Waarom daar |
| --- | --- | --- |
| Zoekmachine | globale standaard, **per workspace** te overschrijven | Een zoekopdracht is het meest lekkende dat je doet. In je werk-workspace naar je werkgever, privé naar DuckDuckGo. `main.js` regel 18-20 zegt dit zelf al vooruit. |
| Wat een nieuw tabblad toont | **per workspace** | Werk opent het intranet, privé opent de lege pagina. Kost niets: `createTab()` leest het toch al. |
| Downloadmap | globale standaard, **per workspace** te overschrijven | `session.setDownloadPath()` zit op de sessie. Werkbestanden horen niet in dezelfde map als de rest, maar bijna niemand wil dat per workspace instellen — dus erven. |
| Bij afsluiten wissen | **per workspace** | Alleen zinnig als eenheid van wissen = eenheid van sessie. Dat is precies een workspace. |
| Permissies (camera, microfoon, locatie, notificaties, scherm) | **per workspace**, standaard + uitzonderingen per site | `setPermissionRequestHandler` staat op de sessie. Dezelfde site kan in je werk-workspace de camera hebben en privé niet, zonder dat wij daar iets voor bouwen. |
| Mag de assistent hier werken | **per workspace** | Een assistent die in je bank-workspace rondklikt is een ander risico dan in je research-workspace. Aan/uit is het minimale antwoord daarop. |
| Thema | **globaal** | Zie hieronder: kan niet anders zonder herbouw. |
| Sneltoetsen | **globaal** | Ze worden afgevangen in het hoofdproces op *elke* webContents. Per workspace zou betekenen dat dezelfde toets iets anders doet afhankelijk van welk tabblad vooraan staat. Dat is geen instelling, dat is een val. |
| Bij starten | **globaal** | Gaat over de app, niet over een workspace. |
| Assistentprofiel (naam, model, sleutel) | **globaal** | Een API-sleutel hoort bij jou, niet bij een sessie. Hem per workspace bewaren betekent hem meerdere keren bewaren. |

### Waarom het thema niet per workspace kan

`nativeTheme.themeSource` is een eigenschap van de **module**, niet van een
venster of een view: één waarde voor het hele proces. Het venstermateriaal
(`backgroundMaterial: 'acrylic'` op Windows, `vibrancy: 'sidebar'` op macOS) en
`setTitleBarOverlay()` zitten op het **venster**. Er is geen enkele van deze drie
die een `WebContentsView` als bereik kent. Een thema per workspace zou dus
betekenen: `themeSource` afschaffen, alle `prefers-color-scheme`-queries in
`style.css`, `island.css` en `newtab.css` vervangen door een klasse op `<html>`
die main per view zet, en dan alsnog een zijbalk met een venstermateriaal in de
verkeerde kleur eromheen. Voor drie stand-opties is dat de prijs niet waard. Het
thema is globaal; de kleur van de workspace (`--ws-0` t/m `--ws-5`) doet het
onderscheidende werk al.

### Wat er bewust niet in zit

Geen eigen zoekmachine met een URL-sjabloon (validatie, en niemand kan
controleren of jouw sjabloon klopt voordat er iets misgaat), geen proxy, geen
user-agent, geen taal- of spellingsinstellingen, geen zoom per site, geen
inhoudsblokkering, geen import/export, geen synchronisatie. Elk daarvan is een
eigen ontwerp; ze hier los meenemen levert een scherm vol schakelaars op waarvan
de helft niets doet.

---

## 2. Alle opties, precies

### Globaal

| Sleutel | Waarden | Standaard | Uitvoering |
| --- | --- | --- | --- |
| `thema` | `systeem` \| `licht` \| `donker` | `systeem` | `nativeTheme.themeSource = waarde` |
| `zoekmachine` | sleutel uit `ZOEKMACHINES` in `renderer/search.js` | `google` | doorgegeven aan `naarZoekURL()` |
| `bijStarten` | `nieuw` \| `herstel` | `nieuw` | `herstel` staat uit met uitleg zolang sessieherstel er niet is |
| `downloadmap` | absoluut pad | `app.getPath('downloads')` | `ses.setDownloadPath(pad)` |
| `vraagWaarheen` | `true` \| `false` | `false` | `item.setSaveDialogOptions({ defaultPath })` in `will-download` |
| `sneltoetsen` | zes acties → toetscombinatie | zie §7 | gelezen in `before-input-event` |
| `assistent` | `{ naam, model }` | `{ naam: 'Kim', model: null }` | vervangt de constante `ASSISTENT` in `main.js` |

De sleutel van de assistent staat **niet** in dit bestand. Zie §4.

### Per workspace

Elke waarde kent naast zijn eigen waarden ook `null`: **erf van globaal**. Dat is
de beginstand.

| Sleutel | Waarden | Erft |
| --- | --- | --- |
| `zoekmachine` | `null` \| sleutel | ja |
| `nieuwTabblad` | `null` (de lege pagina) \| `https://…` | nee, `null` is hier gewoon "leeg" |
| `downloadmap` | `null` \| absoluut pad | ja |
| `bijAfsluitenWissen` | `niets` \| `cookiesEnOpslag` | nee |
| `assistentMag` | `true` \| `false` | nee, standaard `true` |
| `permissies` | `{ standaard: {…}, sites: {…} }` | nee, zie §6 |

`null` betekent altijd erven, een ontbrekende sleutel ook. Alleen een waarde die
er staat én niet `null` is, overschrijft. Dat onderscheid expliciet houden is
waar voorkeurensystemen normaal gesproken uit elkaar vallen: "niet ingesteld" en
"ingesteld op niets" moeten twee dingen zijn.

---

## 3. Waar het op schijf woont

Alles onder `app.getPath('userData')`:

```
voorkeuren.json     globale waarden + de overschrijvingen per workspace
permissies.json     wat je per site hebt toegestaan of geweigerd
geheimen.bin        de sleutel van de assistent, via safeStorage
```

Drie bestanden en niet één, om drie verschillende redenen. `permissies.json`
groeit vanzelf door op knoppen te klikken en wordt dus veel vaker geschreven;
raakt hij beschadigd, dan moeten je instellingen niet mee omvallen.
`geheimen.bin` is versleuteld en mag nooit meekomen als iemand zijn
`voorkeuren.json` in een bugrapport plakt.

```json
{
  "versie": 1,
  "globaal": {
    "thema": "systeem",
    "zoekmachine": "google",
    "bijStarten": "nieuw",
    "downloadmap": null,
    "vraagWaarheen": false,
    "sneltoetsen": { "tab:nieuw": "Ctrl+T", "tab:sluit": "Ctrl+W" },
    "assistent": { "naam": "Kim", "model": null }
  },
  "workspaces": {
    "ws-1": { "zoekmachine": null, "nieuwTabblad": null, "downloadmap": null,
              "bijAfsluitenWissen": "niets", "assistentMag": true }
  }
}
```

### De sleutel per workspace is de partitie, niet het id

`this.nextWorkspaceId` begint bij **1 in elke controller en bij elke start**.
Workspace 1 van het tweede venster is dus hetzelfde getal als workspace 1 van het
eerste — en, belangrijker, ze delen `persist:ws-1` en dus hun cookies. Het
numerieke id is geen identiteit; de partitienaam wel. Daarom is de sleutel in
`voorkeuren.json` en `permissies.json` de partitie zonder voorvoegsel: `ws-1`.

Dat is niet alleen de veilige keuze, het is de juiste: permissies horen bij een
sessie, en twee workspaces die dezelfde sessie delen hóren dezelfde permissies te
hebben. Zodra sessieherstel er is en workspaces een stabiel eigen id krijgen,
moet die sleutel meeverhuizen — dit ontwerp hangt daarop. Tot dan geldt: een
workspace die je sluit en opnieuw aanmaakt kan de partitie van een oude erven, en
dan erft hij ook zijn instellingen. Bekend, niet opgelost.

---

## 4. Lezen en schrijven zonder races

**Eén schrijver.** Alleen het hoofdproces raakt de bestanden aan. Geen enkele
renderer krijgt een pad of een fs-methode; ze sturen een waarde en krijgen de
nieuwe stand terug. Daarmee bestaat er binnen één proces geen race.

**Laden gebeurt synchroon, één keer.** In `app.whenReady()`, vóór de eerste
`new BrowserWindowController()`, met `fs.readFileSync`. Asynchroon laden betekent
dat het eerste venster met standaardwaarden tekent en daarna verspringt: het
verkeerde thema, de verkeerde sneltoetslabels. Het bestand is een paar kilobyte
en wordt precies één keer gelezen.

**Schrijven is uitgesteld, geserialiseerd en atomair.**

1. Elke wijziging past de stand in het geheugen meteen aan en roept `plan()` aan.
2. `plan()` zet een `setTimeout` van 250 ms; nog een wijziging binnen die tijd
   vervangt de timer. Een gebruiker die aan een schuifknop of een tekstveld zit
   schrijft anders tientallen keren per seconde.
3. De schrijfactie hangt aan een ketting: `bezig = bezig.then(schrijf)`. Twee
   flushes kunnen zo nooit door elkaar lopen.
4. `schrijf()` doet `writeFile(pad + '.tmp')` en daarna `rename(pad + '.tmp', pad)`.
   Vervangen door hernoemen is de enige manier om nooit een half bestand op schijf
   te hebben. **Let op Windows:** die hernoeming kan `EPERM`/`EBUSY` geven als een
   virusscanner of back-uptool het doelbestand net open heeft. Twee keer opnieuw
   proberen met 50 ms ertussen, en daarna opgeven: een mislukte
   voorkeurenschrijving mag nooit een uitzondering opleveren die de app raakt. De
   waarde staat in het geheugen en werkt gewoon.
5. `app.on('before-quit')`: timer wissen en synchroon wegschrijven met
   `fs.writeFileSync`. Een uitgestelde timer vuurt niet meer na afsluiten, en
   `before-quit` kan niet op een promise wachten. Dit is de enige plek waar
   synchroon schrijven mag.

**Twee exemplaren van de app.** `main.js` heeft nu geen
`app.requestSingleInstanceLock()`. Zonder die vergrendeling schrijven twee
processen om de beurt over elkaars voorkeuren heen, en erger: ze openen dezelfde
`persist:ws-N`-sessies, wat Chromium niet aankan. De vergrendeling hoort er sowieso
te komen; dit ontwerp gaat ervan uit dat hij er is. Komt hij er niet, dan is
"laatste schrijver wint" het gedrag en moet dat hier staan — bij dezen.

**Kapot bestand.** `JSON.parse` in een `try/catch`. Mislukt het, dan wordt het
bestand hernoemd naar `voorkeuren.kapot.json` (niet weggegooid) en start de app
met standaardwaarden. Elke waarde wordt bij het lezen getoetst aan een tabel van
toegestane waarden; wat niet klopt valt terug op de standaard. Een met de hand
bewerkt bestand kan zo geen onbekende zoekmachine, geen raar pad en geen
onmogelijke toets naar binnen duwen.

**Geheimen.** De sleutel van de assistent gaat door
`safeStorage.encryptString()` en het resultaat in `geheimen.bin`. Eerst
`safeStorage.isEncryptionAvailable()` controleren — op Linux is dat afhankelijk
van de keyring en kan het `false` zijn. Is het `false`, dan slaan we niets op en
zegt het scherm dat: liever geen sleutel dan een sleutel in platte tekst.

---

## 5. Hoe een wijziging bij alle vensters aankomt

De registry `windows` mapt webContents-id → controller en bevat elke controller
**twee keer** (zijbalk én balk bovenin). Ontdubbelen met
`new Set(windows.values())`, dan per controller versturen:

```
zendVoorkeurenNaarAlles()
  → voor elke controller in new Set(windows.values())
      → win.webContents.send('pref:gewijzigd', stand)     de zijbalk
      → island.webContents.send('pref:gewijzigd', stand)  de balk bovenin
      → elke open instellingenpagina van dit venster
```

De lading is de hele stand — `{ globaal, workspaces, actieveWorkspace }` — en de
ontvanger tekent opnieuw. Dat is dezelfde vorm als `pushState()`: state stroomt
één kant op en de renderer houdt geen eigen waarheid.

Wat elke ontvanger ermee doet:

- **Zijbalk:** het label in `#new-tab kbd` (nu hardgecodeerd op `Ctrl T`) en de
  hints in de commandobalk. Zonder dit liegt dat label zodra iemand de sneltoets
  wijzigt.
- **Balk bovenin:** de tekst `Ctrl J` in `naarRust()` in `island.js`, om dezelfde
  reden. Vraagt één methode extra in `preload-island.js`.
- **Instellingenpagina:** alles.

Wat het hoofdproces zelf doet bij een wijziging:

| Sleutel | Actie in main |
| --- | --- |
| `thema` | `nativeTheme.themeSource = waarde`. De bestaande `nativeTheme.on('updated')` zet de titelbalk al goed. |
| `zoekmachine` | Niets bewaren; `toURL()` leest hem per aanroep. Open nieuw-tabblad-pagina's herladen, zie hieronder. |
| `downloadmap` | `session.fromPartition(partitie).setDownloadPath(pad)` voor de betrokken workspaces. |
| `bijAfsluitenWissen` | Alleen onthouden; uitgevoerd bij afsluiten en bij `closeWorkspace()`. |
| `permissies` | Niets. De handlers lezen live uit de store. |
| `assistentMag` | Niets. `startAgent()` kijkt zelf. |
| `sneltoetsen` | Niets. De `before-input-event`-handler leest live. |
| `nieuwTabblad`, `bijStarten`, `vraagWaarheen`, `assistent` | Niets; worden gelezen op het moment dat ze tellen. |

### De nieuw-tabblad-pagina is sandboxed en heeft geen preload

`renderer/newtab.js` roept `naarZoekURL(zoek.value)` aan zonder motor en krijgt
dus altijd Google. Die pagina heeft geen preload en mag er ook geen krijgen — dat
is precies de reden dat `search.js` geen Node gebruikt. Oplossing zonder IPC: de
motor gaat mee in de URL.

```js
// main.js
const newtabURL = (ws) => `${NEWTAB}?motor=${encodeURIComponent(motorVan(ws))}`;

// renderer/newtab.js
const motor = new URLSearchParams(location.search).get('motor');
const doel = naarZoekURL(zoek.value, motor);
```

`describe()` blijft werken: `url.startsWith(NEWTAB)` is nog steeds waar met een
query erachter, dus zo'n tabblad heet nog steeds leeg. Bij een wijziging loopt
main één keer over alle views heen en herlaadt degene waarvan `getURL()` met
`NEWTAB` begint, met de nieuwe query. Zonder die herlading houdt een al open
nieuw tabblad de oude zoekmachine tot je hem ververst.

---

## 6. Permissies

Vijf soorten die de gebruiker ziet, de rest gaat dicht:

| Getoond | Electron-permissie (letterlijk) |
| --- | --- |
| Camera en microfoon | `media`, gesplitst via `details.mediaTypes` (`'video'` / `'audio'`) |
| Locatie | `geolocation` |
| Meldingen | `notifications` |
| Scherm delen | `display-capture` |
| Bestanden op je schijf | `fileSystem` |

Alles wat daar niet in staat — `midi`, `midiSysex`, `hid`, `serial`, `usb`,
`idle-detection`, `window-management`, `keyboardLock`, `pointerLock`,
`openExternal`, `storage-access`, `clipboard-read`, `unknown` — wordt geweigerd
zonder te vragen. De namen komen uit `electron.d.ts` 33.4.11 en zijn per handler
verschillend: `setPermissionRequestHandler` kent onder meer `display-capture`,
`window-management`, `keyboardLock`, `speaker-selection` en `fileSystem`, terwijl
`setPermissionCheckHandler` die niet kent maar wél `hid`, `serial`, `usb` en
`deprecated-sync-clipboard-read`. Twee lijsten dus, niet één.

Per workspace: elke soort heeft een standaard `vragen` of `weigeren`
(begintoestand: `vragen`, behalve `display-capture` en `fileSystem`, die beginnen
op `weigeren`), en daarnaast een lijst uitzonderingen per herkomst.

```json
{ "versie": 1,
  "ws-1": { "https://meet.google.com": { "camera": "toestaan", "microfoon": "toestaan" },
            "https://nu.nl": { "meldingen": "weigeren" } } }
```

Bij het aanmaken van een workspace, in `addWorkspace()`:

```js
const ses = session.fromPartition(partitie);
ses.setPermissionRequestHandler((wc, permissie, callback, details) => { … });
ses.setPermissionCheckHandler((wc, permissie, herkomst, details) => { … });
```

Regels in de handlers:

- `details.isMainFrame === false` → weigeren zonder vragen. Een ingesloten frame
  van een advertentienetwerk hoort geen vraag te kunnen stellen.
- Herkomst = `new URL(details.requestingUrl).origin` bij de request-handler, en
  het meegeleverde `requestingOrigin` bij de check-handler. Alleen `https:` en
  `http:` krijgen ooit een `true`.
- `setPermissionCheckHandler` moet **synchroon een boolean** teruggeven en kan dus
  nooit vragen: alleen een opgeslagen `toestaan` levert `true`, `vragen` levert
  `false`. Dat betekent dat `navigator.permissions.query()` "denied" zegt voor iets
  wat je nog nooit gevraagd is. Dat is de eerlijke uitkomst van een API die geen
  derde antwoord kent.

**De vraag zelf hoort niet in dit ontwerp.** Dit ontwerp levert de opslag, de
standaarden, het scherm waarin je beslissingen terugziet en intrekt, en de twee
handlers. Wie het vraagmoment ontwerpt (roadmap-punt 1) krijgt twee kanalen:
`perm:vraag` (main → UI, met herkomst, soort en een id) en `perm:antwoord`
(UI → main, met dat id, `toestaan`/`weigeren` en `onthouden: boolean`). Bij
`onthouden` schrijft dit ontwerp de regel weg; anders geldt het antwoord alleen
voor deze vraag. Zonder dat vraagmoment werkt alles hier al: dan is `vragen`
gelijk aan `weigeren` en zet je permissies met de hand aan in het scherm.

---

## 7. Sneltoetsen

Zes acties zijn te herbinden. De rest niet, en dat staat er ook bij.

| Actie | Standaard | Nu |
| --- | --- | --- |
| `tab:nieuw` | `Ctrl+T` / `Cmd+T` | in `app.js` |
| `tab:sluit` | `Ctrl+W` / `Cmd+W` | bestaat niet |
| `nav:adres` | `Ctrl+L` / `Cmd+L` | in `app.js` |
| `ui:palet` | `Ctrl+K` / `Cmd+K` | in `app.js` |
| `island:focus` | `Ctrl+J` / `Cmd+J` | in `app.js` |
| `ui:instellingen` | `Ctrl+,` / `Cmd+,` | bestaat niet |

Vast: `F12` en `Ctrl+Shift+I` (DevTools), `Ctrl+1`…`Ctrl+9` (naar de zoveelste
workspace), `Escape`. Ze staan grijs in de lijst met de reden erbij, zodat
niemand ernaar hoeft te zoeken.

**Ze worden afgevangen in het hoofdproces**, in dezelfde `before-input-event`
waar `devtoolsSneltoets()` nu in zit, en die op elke webContents wordt gezet:
zijbalk, balk bovenin én elk tabblad. Dat lost meteen een bestaande fout op: de
sneltoetsen zitten nu in een `keydown` op `document` in `renderer/app.js`, en die
renderer krijgt geen enkele toetsaanslag zolang de focus in een pagina staat.
`Ctrl+T` werkt vandaag alleen als je net in de zijbalk hebt geklikt. Verplaatsen
naar main maakt ze pas echt globaal — en is meteen het beste argument dat
sneltoetsen niet per workspace kunnen: ze worden afgehandeld op een plek waar de
pagina nog niets van weet.

Opslag als tekst in `Ctrl+Shift+T`-vorm, met `Ctrl` en `Cmd` als losse waarden
per platform. Vergelijken gebeurt tegen `input.control`, `input.meta`,
`input.shift`, `input.alt` en `input.key`. Match → `event.preventDefault()` op het
Electron-event, zodat de toets de pagina niet meer bereikt, en dan de actie op de
controller.

De opnamemodus in het scherm weigert: een combinatie zonder modificatietoets, de
vaste combinaties hierboven, alles wat al aan een andere actie hangt, en
`Ctrl+C/V/X/A/Z` (die horen bij tekst, niet bij ons). Backspace zet terug op de
standaard, Escape breekt af.

---

## 8. De UI

**Een eigen pagina in een tabblad**, `renderer/instellingen.html`, zoals de
nieuw-tabblad-pagina er ook een is.

Waarom niet als paneel in de zijbalk: de zijbalk is 264 px en een lijst met
sites en permissies past daar niet in. Waarom niet als overlay zoals de
commandobalk: die werkt alleen doordat main de pagina wegneemt
(`setPaletteOpen()`), en dat is prima voor twee seconden zoeken maar niet voor
een scherm waar je een minuut in zit — je verliest je pagina, en `paletteOpen` is
een boolean per venster die van alles gaat betekenen als je ondertussen van
workspace wisselt. Waarom niet een eigen venster: er is nog geen manier om een
tweede venster te openen, en de `windows`-registry gaat ervan uit dat elk venster
een controller met workspaces is. Een tabblad kost niets, ligt in de layout die er
al is, en heeft één eigenschap die de andere twee missen: **hij hoort bij de
workspace waarin je hem opende**, en dat is precies de context die dit scherm
nodig heeft.

Openen kan op drie manieren: `Ctrl+,`, een tandwielknop in de voettekst van de
zijbalk naast `#new-workspace`, en een regel "Instellingen" in de commandobalk.
Per venster staat er hoogstens één open: is er al een instellingentabblad, dan
wordt dat geactiveerd in plaats van een tweede geopend.

### Wat je ziet

Eén kolom, `width: min(680px, 88vw)`, gecentreerd, `padding: 56px 0 80px`. Geen
eigen navigatie, geen iconenrij: de pagina zit al in het kader van de app. De
optiek volgt `newtab.css` — een eigen `:root`-palet in `instellingen.css`, want
dit is een gewone pagina in een tabblad en niet het doorschijnende
venstermateriaal. Dat is dezelfde afweging die `newtab.css` bovenaan al
opschrijft; kleuren blijven variabelen in `:root`, geen losse hexwaarden eronder.

```
Instellingen
Je bewerkt ● Persoonlijk

┌─ Deze workspace ────────────────────────────────────────────┐
│ Zoekmachine            Zelfde als overal (Google)        ▾  │
│ Nieuw tabblad          De lege pagina                    ▾  │
│ Downloads              Zelfde als overal (Downloads)     ▾  │
│ Bij afsluiten          Niets wissen                      ▾  │
│ Assistent              [x] Kim mag in deze workspace werken │
└─────────────────────────────────────────────────────────────┘

┌─ Wat sites mogen vragen ────────────────────────────────────┐
│ Camera en microfoon    Vragen                            ▾  │
│ Locatie                Vragen                            ▾  │
│ Meldingen              Vragen                            ▾  │
│ Scherm delen           Weigeren                          ▾  │
│ Bestanden              Weigeren                          ▾  │
│ ─────────────────────────────────────────────────────────── │
│ meet.google.com   Camera, microfoon   Toestaan  ▾   Vergeet │
│ nu.nl             Meldingen           Weigeren  ▾   Vergeet │
└─────────────────────────────────────────────────────────────┘

┌─ Overal ────────────────────────────────────────────────────┐
│ Thema                  Systeem                           ▾  │
│ Zoekmachine            Google                            ▾  │
│ Bij starten            Nieuw venster                     ▾  │
│ Downloads              C:\Users\…\Downloads       Kies…     │
│                        [ ] Vraag elke keer waar             │
│ Sneltoetsen            Nieuw tabblad          [ Ctrl T ]    │
│                        …                                    │
│ Assistent              Kim · sleutel ingesteld    Wijzig    │
└─────────────────────────────────────────────────────────────┘

voorkeuren.json staat in …\Tougather   Open map   Alles terugzetten
```

De workspace komt eerst en "Overal" daarna: de volgorde ís het argument van dit
ontwerp, zichtbaar gemaakt. Wat je hier verandert raakt meestal alleen deze
workspace.

Details die er toe doen:

- **Erven is een gewone `<select>`-optie**, met de geërfde waarde in het label:
  "Zelfde als overal (Google)". Geen eigen driestandenknop: een `<select>` is met
  het toetsenbord meteen goed, en de geërfde waarde staat er letterlijk, dus je
  hoeft nergens heen om te zien wat je erft.
- **Geen Bewaar-knop.** Elke wijziging geldt meteen. Een Bewaar-knop vereist
  vuil-state in een pagina die bij elke push opnieuw tekent, en er is niets te
  valideren over velden heen.
- **Geen favicons in de permissielijst.** De CSP van deze pagina blijft
  `default-src 'self'`, en favicons ophalen zou aan precies die sites verklappen
  dat je hun permissieregel bekijkt. Herkomst als tekst, met een gekleurde
  beginletter.
- **Hertekenen mag geen invoer opeten.** `CLAUDE.md` waarschuwt hiervoor en dit
  scherm is het gevoeligste geval: bij `pref:gewijzigd` worden alleen besturingen
  bijgewerkt die niet de focus hebben, en de sneltoetsopname en het padveld
  helemaal niet zolang ze actief zijn.
- **Alles terugzetten** werkt met twee klikken, hetzelfde bewapenen-patroon als
  de sluitknop van een workspace (`data-armed` in `style.css`).

### Rechten van de pagina

Het instellingentabblad is een `WebContentsView` met
`preload: preload-instellingen.js`, `contextIsolation: true`,
`nodeIntegration: false` en `sandbox: true`. Een preload in een sandboxed view
mag `ipcRenderer` en `contextBridge` gebruiken — dat is precies wat we nodig
hebben en niets meer. *Onzeker:* dat die subset in Electron 33 werkt zoals
gedocumenteerd is bij het bouwen als eerste te controleren; werkt het niet, dan is
`sandbox: false` met `contextIsolation: true` de terugvaloptie, wat voor een
`file:`-pagina van onszelf verdedigbaar is maar minder mooi.

De view krijgt **geen** `partition`, dus hij draait in de standaardsessie — samen
met de zijbalk-renderer, en gescheiden van elke website. Zou hij in
`persist:ws-N` draaien, dan deelt hij opslag met de sites in die workspace.

Drie sloten, want een pagina met een preload die naar een website navigeert, is
een website met onze IPC:

1. `wc.on('will-navigate', (e, url) => { if (!url.startsWith(INSTELLINGEN)) e.preventDefault(); })`
2. `wc.setWindowOpenHandler(() => ({ action: 'deny' }))`
3. Elke handler controleert `event.senderFrame?.url` (of `.origin`) en negeert
   alles wat niet van het instellingenbestand komt. `IpcMainInvokeEvent` heeft
   `senderFrame`; die kan `null` zijn als het frame intussen weg is — dan
   weigeren.

Verder moet `describe()` deze pagina net zo behandelen als de nieuw-tabblad-pagina:
geen `file://…/instellingen.html` in de adresbalk. Nu doet `describe()` dat via
`url.startsWith(NEWTAB)`; daar hoort een tweede interne URL bij, of beter een
vlag `intern` op het tabblad.

---

## 9. IPC-kanalen

Alles via een expliciete methode in een preload; geen `ipcRenderer` naar buiten.

| Kanaal | Richting | Lading |
| --- | --- | --- |
| `pref:lees` | invoke | — → `{ globaal, workspaces, actieveWorkspace }` |
| `pref:zet` | invoke | `{ bereik: 'globaal' \| 'workspace', sleutel, waarde }` |
| `pref:map` | invoke | `{ bereik }` → opent `dialog.showOpenDialog`, geeft het pad |
| `pref:terug` | invoke | `{ bereik }` — terug naar standaardwaarden |
| `pref:toon` | invoke | — → `shell.showItemInFolder(voorkeuren.json)` |
| `pref:gewijzigd` | main → renderer | de hele stand |
| `perm:lijst` | invoke | — → de permissies van de workspace van dit tabblad |
| `perm:zet` | invoke | `{ herkomst, soort, waarde }` |
| `perm:vergeet` | invoke | `{ herkomst, soort }` |
| `ui:instellingen` | invoke | — opent of activeert het instellingentabblad |

`bereik: 'workspace'` betekent altijd de workspace waar het **verzoekende
tabblad** in zit, niet de actieve. Main leidt die af uit `event.sender.id` via een
aparte map `instellingenViews: webContentsId → { controller, partitie }`, gevuld
bij het aanmaken van de pagina. De actieve workspace kan intussen veranderd zijn;
dan verandert dit scherm níét mee. Het hoort bij zijn eigen workspace en de kop
zegt welke.

`pref:lees` bestaat naast de push omdat een pagina die later opent niet op een
volgende wijziging wil wachten. Main duwt de stand ook bij `did-finish-load` van
de view, net als `pushState()` dat voor de zijbalk doet.

`pref:map` staat los omdat het een systeemvenster opent
(`dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'], defaultPath })`)
en dus als enige lang kan duren en afgebroken kan worden.

---

## 10. Nieuwe bestanden

```
voorkeuren.js               hoofdproces: standaarden, toetsing, laden, wegschrijven, erven
permissies.js               hoofdproces: de twee handlers + permissies.json
preload-instellingen.js     de API van de instellingenpagina
renderer/instellingen.html
renderer/instellingen.css
renderer/instellingen.js
```

`voorkeuren.js` en `permissies.js` draaien alleen in het hoofdproces en mogen dus
Node gebruiken; `renderer/instellingen.js` niet, en hij krijgt ook geen `require`.
De lijst met zoekmachines komt uit het bestaande `renderer/search.js`, dat de
pagina gewoon met een `<script src="search.js">` inlaadt, precies zoals
`newtab.html` doet — zo staat die lijst nog steeds op één plek.

**`package.json` moet mee.** Het `build.files`-veld noemt nu
`["main.js", "preload.js", "preload-island.js", "renderer/**"]`. `voorkeuren.js`,
`permissies.js` en `preload-instellingen.js` staan daar niet in en zouden
ontbreken in een gebouwde app — die start dan wel in ontwikkeling en crasht bij
`npm run dist`. Toevoegen, of de twee hoofdprocesmodules in `lib/` zetten en
`"lib/**"` toevoegen.

---

## 11. Wat er in main.js bij moet

1. `session`, `safeStorage`, `dialog` en `fs`/`path` erbij in de imports
   (regel 1); `session` wordt nu nergens gebruikt.
2. `app.requestSingleInstanceLock()` bovenaan `whenReady`, met `app.quit()` als
   hij niet lukt.
3. In `whenReady`, vóór het eerste venster: `voorkeuren.laad()`,
   `permissies.laad()`, `nativeTheme.themeSource = …`.
4. `app.on('before-quit')`: voorkeuren synchroon wegschrijven, en de workspaces
   met `bijAfsluitenWissen: 'cookiesEnOpslag'` wissen. Dat laatste is **async**
   (`ses.clearStorageData({ storages: ['cookies', 'localstorage', 'indexdb', 'cachestorage', 'serviceworkers'] })`)
   terwijl `before-quit` niet wacht. Eén keer `event.preventDefault()`, een vlag
   zetten, alle beloften afwachten en dan `app.quit()` opnieuw — anders sluit de
   app af voordat er iets gewist is. Dit is de lelijkste plek van het ontwerp.
5. `addWorkspace()`: sessie ophalen, permissiehandlers zetten, `setDownloadPath()`
   en de `will-download`-luisteraar aanhangen.
6. De module-variabele `let zoekmachine` (regel 20) verdwijnt. `toURL(input)`
   wordt `toURL(input, ws)`, en `NEWTAB` krijgt gezelschap van `newtabURL(ws)`.
   `AGENT_STAPPEN` gebruikt `zoekmachine` in zijn `url`-functie; die stap moet de
   workspace meekrijgen.
7. `createTab()`: een optie `intern` voor de instellingenpagina (eigen preload,
   geen partitie, navigatie op slot), plus registratie in `instellingenViews`.
8. `describe()`: de instellingenpagina niet als gewone URL tonen.
9. `openInstellingen()` op de controller (bestaat er al een, activeer die) en
   `stuurVoorkeuren()` ernaast; daarnaast een module-functie
   `zendVoorkeurenNaarAlles()`.
10. `devtoolsSneltoets(wc)` groeit uit tot `sneltoetsen(wc, controller)` die de
    ingestelde combinaties leest en de vaste erbij houdt.
11. `startAgent()` weigert als `assistentMag` uit staat, en gebruikt naam en model
    uit de voorkeuren in plaats van de constante `ASSISTENT`.
12. De nieuwe `ipcMain.handle`-regels uit §9.

Ook buiten `main.js`, maar niet door dit ontwerp te schrijven: `preload.js` krijgt
`openInstellingen()` en `onVoorkeuren()`, `preload-island.js` krijgt
`onVoorkeuren()`, en `renderer/index.html` een tandwielknop in `#workspaces`.

---

## 12. Wat er mis kan gaan

- **De preload lekt naar een website.** Het grootste risico van dit ontwerp. Drie
  sloten in §8, en de handlers weigeren als de afzender niet de instellingenpagina
  is. Faalt een van die drie, dan heeft een website onze voorkeuren-API.
- **Verloren schrijfacties.** Uitstel van 250 ms plus een harde crash betekent de
  laatste wijziging kwijt. Bewust: de andere kant is bij elke toetsaanslag naar
  schijf schrijven.
- **`rename` mislukt op Windows.** Twee keer opnieuw proberen, daarna stil
  doorgaan met de waarde in het geheugen. De gebruiker ziet zijn instelling
  werken, en na de herstart is hij weg. Onbevredigend maar beter dan een crash;
  een zichtbare foutregel onderaan het scherm zou de eerlijke aanvulling zijn.
- **Wissen bij afsluiten haalt het niet.** Zie punt 4 hierboven. Wordt het
  afsluiten om welke reden dan ook geforceerd (`app.exit()`, een crash, uitloggen
  uit Windows), dan blijft alles staan. Dit is geen incognito en mag zo ook niet
  heten.
- **Een partitie kan niet halverwege vluchtig worden.** `persist:ws-N` staat vast
  bij het aanmaken van de view; een bestaande workspace omzetten naar een sessie
  zonder `persist:` kan niet zonder al zijn tabbladen opnieuw te maken. Daarom is
  de instelling "wissen bij afsluiten" en niet "vluchtige workspace".
- **Twee vensters, dezelfde partitie.** Ze delen hun per-workspace-instellingen,
  ook al heten ze anders. De uitzending zorgt dat beide schermen hetzelfde tonen;
  verwarrend blijft het, en het is een gevolg van het bestaande partitieschema en
  niet van dit ontwerp.
- **Herbonden sneltoetsen botsen met een website.** We vangen af vóór de pagina.
  Een webapp die zelf `Ctrl+K` gebruikt verliest die. Dat doet elke browser, maar
  het is wel de reden dat de lijst kort is.
- **Het thema kan tegen het venstermateriaal in gaan.** Zet je Tougather op donker
  terwijl Windows licht staat, dan is het acrylic mogelijk nog licht.
  *Onzeker* — dit moet gewoon geprobeerd worden; verandert `backgroundMaterial`
  niet mee, dan is de eerlijke oplossing het thema niet te laten afwijken van het
  systeem, of het materiaal uit te zetten in die stand.
- **De workspacesleutel verschuift bij sessieherstel.** Zie §3. Wie sessieherstel
  bouwt moet de sleutel hier meenemen, anders zijn na die verandering alle
  instellingen en permissies onvindbaar (niet weg — onvindbaar, wat erger is).

## 13. Wat dit niet oplost

Geen synchronisatie tussen machines, geen import/export, geen profielen (een
workspace is een sessie, geen account), geen bedrijfsbeleid. Geen eigen
zoekmachine, geen proxy, geen user-agent, geen talen of spelling, geen zoom of
lettergrootte per site, geen inhoudsblokkering. Het lost het **vraagmoment** van
permissies niet op — alleen de opslag en het beheer erna. Het lost sessieherstel
niet op en levert zelfs een afhankelijkheid daarnaartoe. En het maakt de assistent
niet instelbaar voorbij aan/uit, een naam en een sleutel: zijn logboek en zijn
noodstop horen bij zijn eigen ontwerp.

## 14. Waar ik de Electron-API niet zeker van ben

Geverifieerd tegen `node_modules/electron/electron.d.ts`, versie **33.4.11**:
`session.setDownloadPath`, `setPermissionRequestHandler` en
`setPermissionCheckHandler` inclusief hun (verschillende) permissienamen,
`clearStorageData` met zijn `storages`-lijst, `will-download` met
`item.setSavePath`/`setSaveDialogOptions`, `nativeTheme.themeSource`,
`safeStorage.isEncryptionAvailable`/`encryptString`,
`app.requestSingleInstanceLock`, `app.getPath('downloads' | 'userData')`,
`dialog.showOpenDialog` met `properties: ['openDirectory', 'createDirectory']`,
en `IpcMainInvokeEvent.senderFrame` (met `origin`; kan `null` zijn).

Niet geverifieerd, expliciet onzeker:

- Of een **sandboxed preload** in Electron 33 `ipcRenderer` en `contextBridge`
  mag gebruiken. Zo werkt het volgens de documentatie, maar ik heb het hier niet
  uitgevoerd. Terugvaloptie in §8.
- Of `setDownloadPath()` invloed heeft op downloads die al bezig zijn. Ik ga
  ervan uit van niet, en dat het pad pas geldt vanaf de volgende download.
- Of `backgroundMaterial: 'acrylic'` meebeweegt met `nativeTheme.themeSource` of
  alleen met het systeemthema. Zie §12.
- Of `webContents.on('before-input-event')` op een `WebContentsView` élke
  toetsaanslag ziet, ook wanneer een pagina hem met `preventDefault()` in de
  renderer opeet. `main.js` gebruikt het al voor DevTools en dat werkt, maar of
  het voor alle gevallen sluitend is heb ik niet nagegaan.
- `session.setPreloads()` bestaat in 33 en zou een alternatief zijn voor een
  preload per view, maar is in latere versies vervangen door
  `registerPreloadScript`. Ik gebruik hem niet; dit staat er zodat niemand hem
  alsnog voorstelt.
