# Sessieherstel en data op schijf

Tougather onthoudt zichzelf op één plek en op één manier: het hoofdproces schrijft
periodiek één JSON-bestand met de volledige stand van alle vensters, en leest dat
bij het starten terug. Dat volgt de architectuur die er al is — state stroomt één
kant op, het hoofdproces is de enige waarheid, de renderer tekent alleen — dus de
renderer bewaart niets en heeft ook geen stem in wat er hersteld wordt. Het
schrijven gebeurt uitgesteld en alleen als er echt iets veranderd is, want een
browser vuurt bij elke pagina tientallen `did-navigate`-achtige events af en dat
mag geen schijfverkeer worden. Herstellen doet de app zonder te vragen, maar
zonder pagina's te laden: de tabbladen staan er meteen, de bytes komen pas als je
erop klikt. Zo is opstarten na twintig tabbladen even snel als na één, en kan een
pagina die de app heeft laten crashen dat niet meteen opnieuw doen. Het tabblad
van een assistent is de uitzondering: dat wordt teruggezet als jouw tabblad, want
een half afgemaakte opdracht stilzwijgend hervatten is precies wat deze app niet
doet.

Alles hieronder is geschreven tegen **Electron 33.4.11**, de versie in
`node_modules`. Waar een API in die versie niet bestaat of ik iets niet heb
kunnen nagaan, staat dat er expliciet bij.

---

## 1. Wat we onthouden

Per **app**:

- `volgendeWorkspaceId` — de teller waar nieuwe workspaces hun id uit krijgen.
  Die moet de app overleven, zie §9.
- `onschoneStarts` — hoe vaak we achter elkaar na een crash zijn opgestart.
- `prullenbak` — partities van gesloten workspaces die nog opgeruimd moeten worden.

Per **venster**: schermpositie en -maat, of het gemaximaliseerd of fullscreen
was, welke workspace actief was.

Per **workspace**: id, naam, kleurindex, partitienaam, welk tabblad actief was.

Per **tabblad**: url, titel, favicon-url, scrollpositie, en — als het van een
assistent was — wie de eigenaar was en welke opdracht er liep.

Bewust **niet** onthouden:

- **De terug/vooruit-geschiedenis van een tabblad.** In Electron 33 heeft
  `webContents.navigationHistory` geen `restore()` (gecontroleerd in
  `electron.d.ts`: wel `getAllEntries`, `goToIndex`, `removeEntryAtIndex`, geen
  `restore`), en een `NavigationEntry` bevat daar alleen `title` en `url`. Er is
  dus geen manier om een geschiedenis terug te zetten. Wegschrijven zonder dat we
  hem kunnen gebruiken is dode data. Een hersteld tabblad begint met een lege
  geschiedenis en grijze terug-knop. Zodra Electron wordt geüpgraded naar een
  versie mét `navigationHistory.restore()` is dit het eerste wat erbij kan.
- **Formulierinhoud en POST-resultaten.** Een pagina die het resultaat van een
  POST toont kunnen we niet heropenen zonder die POST opnieuw te doen. Zo'n
  tabblad komt terug op de nieuw-tabblad-pagina met de titel die het had.
- **Wat er in `localStorage`, cookies en IndexedDB van een site staat.** Dat
  bewaart Chromium al zelf in `persist:ws-N`; daar hoeven wij niets voor te doen.

---

## 2. Waar het staat en in welk formaat

Onder `app.getPath('userData')`:

```
userData/
  sessie/
    staat.json        de huidige stand
    vorige.json       de stand zoals hij bij de vorige start werd gevonden
    staat.json.<pid>.tmp   bestaat alleen tijdens een schrijfactie
```

Een eigen map `sessie/`, niet los in `userData`, zodat het opruimen van het
tijdelijke bestand na een crash (`*.tmp` verwijderen bij het starten) zonder
risico kan: in die map staat verder niets van Chromium.

`staat.json`, ingesprongen weggeschreven met `JSON.stringify(staat, null, 2)` —
leesbaarheid weegt hier zwaarder dan een paar kilobytes, dit bestand wordt met de
hand gedebugd:

```json
{
  "versie": 1,
  "schoon": false,
  "opgeslagen": "2026-09-08T20:11:04.512Z",
  "volgendeWorkspaceId": 7,
  "onschoneStarts": 0,
  "prullenbak": [
    { "partitie": "persist:ws-4", "sinds": "2026-09-08T19:02:11.004Z" }
  ],
  "vensters": [
    {
      "bounds": { "x": 120, "y": 60, "width": 1280, "height": 840 },
      "gemaximaliseerd": false,
      "fullscreen": false,
      "actieveWorkspace": 3,
      "workspaces": [
        {
          "id": 3,
          "naam": "Werk",
          "kleurIndex": 2,
          "partitie": "persist:ws-3",
          "actiefTabblad": 12,
          "tabbladen": [
            {
              "id": 12,
              "url": "https://voorbeeld.nl/artikel",
              "titel": "Een artikel",
              "favicon": "https://voorbeeld.nl/favicon.ico",
              "scroll": { "x": 0, "y": 1840 },
              "eigenaar": null,
              "opdracht": null
            },
            {
              "id": 13,
              "url": null,
              "titel": "Nieuw tabblad",
              "favicon": null,
              "scroll": null,
              "eigenaar": "Kim",
              "opdracht": "zoek een goede monitorarm"
            }
          ]
        }
      ]
    }
  ]
}
```

Afspraken over dit formaat:

- `versie` staat vooraan en is een geheel getal. Bij het lezen: is `versie`
  hoger dan wat deze build kent, dan negeren we het bestand volledig (een oudere
  build mag een nieuwer bestand niet half interpreteren) en schrijven we er niet
  overheen tot de gebruiker iets doet. Is hij lager, dan draait er een
  migratiefunctie per stap: `migraties[1] = (s) => …`.
- `url: null` betekent: een leeg tabblad, dus `NEWTAB`. Het interne `file://`-pad
  van `newtab.html` staat nooit in het bestand — dat pad verandert per installatie
  en per platform.
- `schoon` is alleen `true` in het allerlaatste bestand dat we vóór het afsluiten
  schrijven. Elke andere schrijfactie zet hem op `false`. Zie §6.
- Tabblad-ids zijn per venster uniek en worden overgenomen, zodat de
  faviconcache van de renderer en `owners` blijven kloppen. Bij het herstellen
  zet de controller `this.nextId = max(id) + 1`.
- Workspace-ids zijn app-breed uniek en worden **nooit** hergebruikt, want ze
  zitten in de partitienaam. Zie §9.

---

## 3. Nieuwe bestanden

| Bestand | Draait in | Wat het doet |
| --- | --- | --- |
| `sessie.js` | hoofdproces | Laden, valideren, migreren, uitgesteld en atomair wegschrijven. Node mag hier: dit wordt nooit met een sandboxed tabblad gedeeld. |
| `partities.js` | hoofdproces | Sessiemappen van verwijderde workspaces opsporen en verwijderen. Apart omdat dit als enige onderdeel mappen weggooit. |
| `renderer/slaap.html` | tabblad (sandboxed) | Wat een nog niet geladen tabblad toont. Geen preload, geen Node. |
| `renderer/slaap.css` | tabblad | Bijbehorende stijl, kleuren uit `:root` zoals overal. |
| `renderer/slaap.js` | tabblad | Leest titel/url uit de query van de eigen URL en zet ze met `textContent` in de pagina. |

`sessie.js` en `partities.js` staan naast `main.js` in de root, net als de twee
preloads. **Vergeet ze niet in `package.json` te zetten**: `build.files` is nu
`["main.js", "preload.js", "preload-island.js", "renderer/**"]` en somt de
rootbestanden stuk voor stuk op, dus zonder aanvulling zit sessieherstel niet in
de gebouwde app en faalt hij pas bij de gebruiker.

Bestaande bestanden die aanpassing nodig hebben: `main.js` (§10), `preload.js`
(§11), `renderer/app.js`, `renderer/index.html`, `renderer/style.css` (§12) en
`renderer/island.js` (§8).

---

## 4. Wanneer we schrijven

`sessie.js` biedt twee ingangen:

```js
sessie.plan();       // uitgesteld, mag vaak worden aangeroepen
sessie.nu({ schoon: true });  // synchroon, alleen op afsluitpaden
```

`plan()` is een trailing debounce van **4 seconden** met een harde bovengrens van
**20 seconden**. De bovengrens is er voor pagina's die uit zichzelf blijven
navigeren (`did-navigate-in-page` bij elke scrollstap op sommige sites); zonder
die grens zou de debounce nooit aflopen.

Wie roept `plan()` aan:

- de bestaande eventlus in `createTab()` — `did-navigate`, `did-navigate-in-page`,
  `page-title-updated`, `did-stop-loading` (níet `did-start-loading`: dat levert
  alleen een tussenstand op);
- `page-favicon-updated`;
- `createTab`, `closeTab`, `activateTab`;
- `createWorkspace`, `closeWorkspace`, `renameWorkspace`, `activateWorkspace`;
- `win.on('move')` en `win.on('resize')`.

Daarnaast een **hartslag** van 60 seconden (`setInterval`). Die is er niet voor de
tabbladen — die veroorzaken zelf events — maar voor de scrollpositie: scrollen
levert in het hoofdproces geen enkel signaal op, dus zonder hartslag zou je een
uur kunnen lezen zonder dat er iets wordt vastgelegd. Het maximale verlies bij een
crash is daarmee ongeveer één minuut plus de debounce.

Elke schrijfactie vergelijkt de nieuwe JSON-tekst met de laatst weggeschreven
tekst en slaat de schijf over als die gelijk is. De hartslag kost daardoor in
rust niets.

**Synchroon en direct** schrijven op deze vier paden, allemaal via dezelfde
functie:

| Trigger | Waarom |
| --- | --- |
| `app.on('before-quit')` | Het normale afsluiten. Hier gaat `schoon: true` mee. |
| `app.on('session-end')` | Windows sluit af of logt uit. In `electron.d.ts` gemarkeerd `@platform win32`. |
| `powerMonitor.on('shutdown')` | Hetzelfde op Linux en macOS. Volgens de Electron-documentatie alleen daar; de typings geven een listener zonder event-object, dus **uitstellen kan niet** — schrijven en klaar. |
| `powerMonitor.on('suspend')` | De klep gaat dicht. Niet met `schoon: true`: de app leeft nog. |

Hoeveel tijd het besturingssysteem ons na `session-end` of `shutdown` gunt weet ik
niet zeker; ik ga uit van "minder dan een seconde". Daarom staat er op die paden
`fs.writeFileSync` en geen enkele `await`.

### Het venster dat als laatste dicht gaat

Dit is de valkuil van elk sessieherstel. Als `win.on('close')` meteen een nieuwe
momentopname wegschrijft, dan wist het sluiten van je laatste venster je hele
sessie — want op dat moment zijn er nul vensters over. De volgorde op Windows is
`close` → `closed` → `window-all-closed` → `app.quit()` → `before-quit`, dus de
schade is al aangericht voordat `before-quit` iets kan doen.

Oplossing: `win.on('close')` schrijft niets. Het legt de momentopname van dat
venster in `laatstGesloten` (met tijdstempel) en roept `plan()` aan.

- Blijft de app draaien, dan schrijft de debounce 4 seconden later de overgebleven
  vensters weg en valt het gesloten venster er vanzelf uit. Klopt.
- Sluit de app af, dan schrijft `before-quit` de nog open vensters **plus** alles
  in `laatstGesloten` van de laatste 5 seconden, in de oorspronkelijke volgorde.
  Klopt ook.

---

## 5. Atomair schrijven

Eén functie in `sessie.js`, gebruikt door zowel het async- als het syncpad:

```js
function schrijfAtomisch(pad, tekst) {
  const tijdelijk = `${pad}.${process.pid}.tmp`;
  const fd = fs.openSync(tijdelijk, 'w');
  try {
    fs.writeFileSync(fd, tekst, 'utf8');
    // Zonder fsync staat de inhoud alleen in de cache van het OS. Bij een
    // stroomuitval krijg je dan een bestand met de juiste naam en de verkeerde
    // (of lege) inhoud, en dat is erger dan geen bestand.
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  hernoemMetPogingen(tijdelijk, pad);
}
```

Waarom zo:

- Nooit rechtstreeks over `staat.json` heen schrijven. Een `writeFile` die
  halverwege afbreekt laat een half bestand achter dat geldig JSON kán lijken.
- Het tijdelijke bestand staat in **dezelfde map**, anders is `rename` een kopie
  over een volumegrens en niet meer één stap.
- De pid in de naam voorkomt dat twee processen elkaars tijdelijke bestand
  overschrijven. Dat hoort niet te kunnen, zie §10 over de single-instance lock,
  maar het kost niets.
- `fs.renameSync` vervangt op Windows het doelbestand (MoveFileEx met
  REPLACE_EXISTING). Het vervangt de mapingang in één stap. Of dat onder een
  stroomuitval op NTFS ook echt onsplitsbaar is durf ik niet te garanderen —
  daarom is er een tweede generatie (`vorige.json`) als vangnet.
- `hernoemMetPogingen` doet drie pogingen. Op Windows kan `rename` `EPERM` of
  `EBUSY` geven omdat een virusscanner of de zoekindexeerder het doelbestand
  net open heeft. Op het asyncpad met 20/60/150 ms ertussen; op het syncpad
  bij het afsluiten drie pogingen direct achter elkaar en daarna opgeven —
  een momentopname verliezen is beter dan het afsluiten laten hangen.
- De map zelf fsyncen (`fs.openSync(map, 'r')` + `fsyncSync`) maakt de rename op
  macOS en Linux pas echt duurzaam. Op Windows kun je een map niet zo openen; daar
  slaan we die stap over. Dat is geen keuze maar een beperking van het platform.

`vorige.json` wordt precies één keer per app-run geschreven: direct nadat
`staat.json` bij het starten met goed gevolg is gelezen en gevalideerd. Dat is
dan de sessie zoals je hem verliet, ook nadat je in de nieuwe sessie al van alles
hebt opengezet — precies wat "vorige sessie openen" nodig heeft. En het is de
terugval als `staat.json` onleesbaar blijkt.

---

## 6. Lezen en crash herkennen

Bij `app.whenReady()`, vóórdat er een venster bestaat:

1. `sessie/*.tmp` opruimen — restanten van een schrijfactie die niet af kwam.
2. `staat.json` lezen en door `JSON.parse` halen. Fout, leeg of `versie` te hoog?
   Dan `vorige.json` proberen. Ook mis? Dan starten we met een lege staat. **Een
   kapot sessiebestand mag de app nooit laten falen**; het wordt hernoemd naar
   `staat.kapot-<tijdstempel>.json` zodat het te onderzoeken valt.
3. Valideren, niet vertrouwen. Elk veld dat we gebruiken wordt gecontroleerd:
   `bounds` moeten vier eindige getallen zijn, `url` moet met `http:`, `https:`
   of `null` beginnen (een `file:`- of `javascript:`-url uit een aangepast
   bestand laden we niet), namen worden op 40 tekens afgekapt zoals
   `renameWorkspace` dat al doet, ids moeten gehele getallen zijn.
4. `vorige.json` schrijven met wat er gelezen is.
5. `partities.opruimen(staat)` — zie §9. Dit moet hier, vóór het eerste venster,
   want daarna heeft Chromium bestanden in die mappen open.
6. Was `schoon` niet `true`, dan is de vorige run onzacht geëindigd:
   `onschoneStarts += 1`.
7. Meteen `staat.json` terugschrijven met `schoon: false`. Vanaf hier geldt: het
   bestand op schijf zegt "deze app draait nog".
8. Vensters herstellen. Is `vensters` leeg, dan één `new BrowserWindowController()`
   zoals nu.

`onschoneStarts` wordt op 0 gezet door een `setTimeout` van 60 seconden na het
starten: draait de app een minuut zonder om te vallen, dan was het incident
eenmalig. Dat is het verschil tussen "er ging een keer iets mis" en "we zitten in
een crashlus".

Bij het herstellen van `bounds`: controleer met
`screen.getDisplayMatching(bounds)` (het `screen`-object mag pas na `ready`
worden opgevraagd) of het venster nog op een aangesloten scherm valt. Zo niet,
dan de opgeslagen breedte en hoogte gebruiken maar `x`/`y` weglaten, zodat
Electron hem zelf plaatst. Anders staat je venster onzichtbaar op een monitor die
thuis is gebleven.

---

## 7. Herstellen: slapende tabbladen

Een hersteld tabblad krijgt wél meteen een `WebContentsView` — dan blijven
`allViews()`, `closeTab()`, `layoutActiveTab()` en `workspaceOf()` ongewijzigd
werken — maar er wordt geen `loadURL` op de echte url gedaan. In plaats daarvan
`renderer/slaap.html` met de gegevens in de query:

```js
const slaapURL = (rec) => `${SLAAP}?titel=${encodeURIComponent(rec.titel ?? '')}` +
  `&url=${encodeURIComponent(rec.url ?? '')}&koud=${koud ? 1 : 0}`;
```

De controller krijgt er een map bij:

```js
/** @type {Map<number, {url: string|null, titel: string, favicon: string|null,
 *   scroll: {x: number, y: number}|null, voormaligeEigenaar: string|null}>} */
this.sluimer = new Map();
```

**`describe(id)`** kijkt eerst in `sluimer`. Zit het tabblad daarin, dan komen
titel en url uit het record, is `loading` altijd `false`, zijn `canGoBack` en
`canGoForward` `false`, en gaat er een `slaapt: true` mee naar de renderer. De
`leeg`-test moet naast `NEWTAB` ook `SLAAP` als leeg herkennen, anders lekt het
interne bestandspad naar de adresbalk.

**`activateTab(id)`** krijgt er twee dingen bij:

```js
// De scroll van het tabblad dat je verlaat, nu meteen: straks is er geen
// aanleiding meer om ernaar te vragen.
this.leesScroll(ws.activeId);
// … bestaande code …
const slapend = this.sluimer.get(id);
if (slapend) this.wek(id, slapend);
```

`wek()` haalt het record uit `sluimer`, doet `wc.loadURL(record.url ?? NEWTAB)` en
onthoudt de scrollpositie tot de pagina staat. Klikken op een tabblad in de
zijbalk wekt het dus; er is geen apart kanaal voor nodig.

Favicons: het hoofdproces bewaart ze nu niet, alleen de renderer doet dat. Daar
moet een `this.favicons = new Map()` bij, gevuld in de bestaande
`page-favicon-updated`-handler. Bij het herstellen stuurt `pushState()` voor elk
slapend tabblad eenmalig `tabs:favicon` met de bewaarde url, zodat de zijbalk er
niet leeg uitziet. Geen nieuw kanaal.

### Scrollpositie

Uitlezen kan alleen via de pagina zelf; Electron heeft er geen API voor.

```js
async leesScroll(id) {
  const wc = this.tabs.get(id)?.webContents;
  if (!wc || wc.isDestroyed() || wc.isLoading() || this.sluimer.has(id)) return;
  try {
    const waarde = await Promise.race([
      wc.executeJavaScript('({ x: scrollX, y: scrollY })', false),
      new Promise((r) => setTimeout(() => r(null), 200)),
    ]);
    if (waarde) this.scroll.set(id, waarde);
  } catch {
    // De pagina navigeerde weg of weigert; een scrollpositie is niet belangrijk
    // genoeg om een opslagactie op te laten stuklopen.
  }
}
```

`executeJavaScript` draait in de hoofdwereld van de pagina, dus een site kan
`scrollX` overschrijven en liegen. Dat is alleen schadelijk voor zichzelf, maar
wil je het uitsluiten, dan bestaat
`executeJavaScriptInIsolatedWorld(worldId, [{ code }])` ook in Electron 33.

Terugzetten gebeurt op `did-finish-load`, met één herhaling na 400 ms omdat
afbeeldingen de layout nog verschuiven:

```js
wc.executeJavaScript(`scrollTo(${x}, ${y})`, false).catch(() => {});
```

Daarna geven we het op. Dit werkt goed op gewone documenten en werkt **niet** op
pagina's die hun inhoud pas na een netwerkaanroep opbouwen, op oneindige lijsten,
en op sites die hun eigen scrollherstel doen — daar spring je alsnog naar boven.
Dat accepteren we; de alternatieven (wachten tot de hoogte stabiel is, of een
scroll-anchor op een element bewaren) zijn veel meer machinerie voor een klein
verschil.

---

## 8. Herstel na een crash

Er zijn twee standen, en het verschil zit alleen in het actieve tabblad:

**Warm** (vorige run was `schoon: true`). Alle tabbladen komen slapend terug,
behalve het actieve tabblad van de actieve workspace: dat laadt meteen. Er staat
geen melding in beeld — dit is gewoon "verder waar je was", daar hoeft niet naar
gevraagd te worden. Vragen of je je eigen tabbladen terug wil is een vraag zonder
inhoud.

**Koud** (vorige run was onschoon, of `onschoneStarts >= 2`). Niets laadt, ook
het actieve tabblad niet. Je ziet `slaap.html` met de titel en de url van waar je
was en de regel "Deze pagina is nog niet geladen. Klik het tabblad in de zijbalk
aan om hem op te halen." En in de zijbalk verschijnt de herstelstrip:

```
┌──────────────────────────────────────┐
│ Tougather is vorige keer onverwacht  │
│ gestopt. 12 tabbladen staan klaar.   │
│ [Alles laden]  [Leeg beginnen]   [×] │
└──────────────────────────────────────┘
```

Waarom herstellen en dan tóch niet laden, in plaats van vragen: de tabbladen
terugzetten is bijna altijd wat je wil, dus dat doen we. Ze laden is wat een
crash kan herhalen, dus dat vraagt om één klik van jou. Bij `onschoneStarts >= 2`
staat "Leeg beginnen" vooraan en is de tekst "Tougather is twee keer achter
elkaar gestopt".

De strip zit in `index.html` tussen `#address` en `#tablist`, als
`<section id="herstel" hidden>` met `flex: none`, zodat de tabbladlijst zijn
scrollgebied houdt. Stijl uit bestaande variabelen: `--card` als achtergrond,
`--stroke` als rand, `--muted` voor de tekst, `--radius-tab` als straal, en
`--accent` op de knop "Alles laden". Er is geen nieuwe kleur nodig. Slapende
tabbladen krijgen `opacity: .62` op hun `.favicon` en `.title` via
`.tab[data-slaapt="true"]` — genoeg om ze te onderscheiden, niet zo veel dat ze
onleesbaar worden.

De commandobalk krijgt er, als `vorigeBeschikbaar` waar is, één regel bij:
"Vorige sessie openen" als `{ soort: 'sessie' }` in `huidigeResultaten()`.

**Eén tabblad dat crasht** is iets anders dan de app die crasht.
`app.on('render-process-gone', (e, wc, details))` geeft `details.reason` met
onder meer `'crashed'` en `'oom'`. Bij die twee: het tabblad terugzetten in
`sluimer` met zijn laatste url en `slaap.html` tonen met de regel "Deze pagina is
vastgelopen." Niet automatisch herladen — dat is de kortste weg naar een
tabblad dat elke drie seconden een proces sloopt.

### Het tabblad van een assistent

Een assistent wordt **nooit** hervat. Zijn stappen hebben gevolgen buiten de app
— straks een echt model dat formulieren invult en berichten klaarzet — en de
enige stand waarin hij nu al stopt (`actie`) is er juist omdat er dingen zijn die
hij zonder jouw woord niet doet. Een opdracht die door een crash halverwege bleef
staan zonder jouw akkoord hervatten is precies dat.

Wat er wel gebeurt:

- Het tabblad komt terug, maar als **jouw** tabblad: `owners.set(id, null)`.
- Het record onthoudt `voormaligeEigenaar: "Kim"`. `describe()` geeft dat mee als
  `hersteldVan`, waarop de zijbalk de titel als `Kim · <titel>` toont, met de
  tooltip "Kim was hier mee bezig toen de app stopte". Geen kloppend stipje, geen
  gloeiend icoontje, geen `agent`-klasse: er werkt niemand.
- Het tabblad blijft **altijd koud**, ook na een schone afsluiting. De url van een
  assistentstap opnieuw ophalen is bij een zoekresultaat onschuldig en bij een
  bevestigingspagina niet, en wij weten het verschil niet.
- De balk bovenin krijgt bij het starten één `island:state` met
  `{ modus: 'rust', regel: 'Kim stopte halverwege: zoek een goede monitorarm',
  bezig: false, hersteld: true }`. `island.js` toont bij `hersteld` twee knoppen:
  "Opnieuw", die de bestaande `eiland.geefOpdracht(opdracht)` aanroept, en een
  kruisje dat `eiland.stop()` aanroept. **Geen nieuw IPC-kanaal**: beide bestaan
  al. Wel moet `stopAgent()` in `main.js` ook `this.hersteldeOpdracht = null`
  zetten, want die functie keert nu meteen terug als `this.agent` leeg is.

---

## 9. Oude sessiepartities opruimen

Vandaag laat `closeWorkspace()` de map van `persist:ws-N` gewoon staan. Dat is nu
onzichtbaar, maar zodra ids een herstart overleven wordt het twee problemen: de
schijf loopt vol met logins van workspaces die niet meer bestaan, en — erger — een
nieuwe workspace kan het id van een verwijderde krijgen en dan erft hij diens
cookies.

**Eerst het id-probleem.** `nextWorkspaceId` staat nu in de controller en begint
bij elk venster opnieuw bij 1. Een tweede venster zou vandaag al `persist:ws-1`
delen met het eerste. Die teller moet naar de app-brede staat
(`volgendeWorkspaceId` in `staat.json`), en ids worden nooit hergebruikt. Bij het
migreren van een bestaande installatie: `volgendeWorkspaceId = max(bestaande id) + 1`.

**Dan het opruimen**, in drie stappen:

1. **Bij het sluiten** zet `closeWorkspace()` de partitie in `prullenbak` en
   roept, best effort, `session.fromPartition(p).clearData().catch(() => {})` aan
   (bestaat in Electron 33). Dat maakt je meteen uitgelogd, ook al staat de map er
   nog. De map zelf verwijderen we hier niet: Chromium heeft er bestanden in open
   zolang het proces draait.
2. **Bij de volgende start**, in `partities.opruimen(staat)`, vóór het eerste
   venster.
3. Wat er niet lukt, blijft staan voor de start daarna. Nooit een fout naar boven
   gooien: opruimen is onderhoud, geen functie.

Het pad hoeven we niet te raden. `session.getStoragePath()` bestaat in Electron 33
en geeft "the absolute file system path where data for this session is persisted
on disk". Maar `fromPartition()` **maakt** een sessie aan, en daarmee de map — dus
gebruiken we hem niet om te ontdekken wat er ligt. In plaats daarvan: vraag het
pad op van één partitie die we tóch levend houden, neem daar `path.dirname()` van,
en lees die map uit. Is er geen enkele levende workspace, dan valt hij terug op
`path.join(app.getPath('sessionData'), 'Partitions')` — `sessionData` is een
apart pad in `app.getPath()` en wijst standaard naar `userData`, maar niet altijd.

```js
function opruimen(staat) {
  const map = partitieMap(staat);            // zie hierboven
  if (!map) return;
  const levend = new Set([...uit(staat), ...uit(vorige)]);  // 'ws-3', 'ws-5', …
  for (const naam of fs.readdirSync(map)) {
    // Alleen onze eigen mappen. Chromium zet hier ook dingen neer die niet van
    // ons zijn, en dit is de enige plek in de app die mappen weggooit.
    if (!/^ws-\d+$/.test(naam)) continue;
    if (levend.has(naam)) continue;
    const pad = path.join(map, naam);
    // Een weespartitie kan ook een workspace zijn die vlak vóór een crash is
    // gemaakt en nooit is weggeschreven. Een dag wachten kost bijna niets.
    const inPrullenbak = prullenbak.has(naam);
    if (!inPrullenbak && Date.now() - fs.statSync(pad).mtimeMs < 24 * 3600e3) continue;
    try {
      fs.rmSync(pad, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    } catch { /* volgende keer weer */ }
  }
}
```

`maxRetries` en `retryDelay` zijn er niet voor de sier: op Windows houdt een
scanner net zo makkelijk een bestand vast.

Ik heb **niet geverifieerd** hoe de map van `persist:ws-3` precies heet. Ik ga
ervan uit dat het `ws-3` is (de partitienaam zonder `persist:`) binnen een map
`Partitions`, maar de code leest die naam liever op via `getStoragePath()` dan
dat hij hem samenstelt, en de `/^ws-\d+$/`-test staat er om te voorkomen dat een
verkeerde aanname iets anders opruimt. Controleer dit één keer met de hand voordat
de `rmSync` erin gaat.

---

## 10. Wat er in `main.js` bij moet

1. `require('./sessie.js')` en `require('./partities.js')` bovenaan.
2. `app.requestSingleInstanceLock()` in `whenReady`, met `app.quit()` als hij niet
   te krijgen is en een `second-instance`-handler die het bestaande venster naar
   voren haalt. Zonder die lock schrijven twee instanties over elkaars
   `staat.json` heen, en dat is precies de bug die je nooit reproduceert.
3. De opstartvolgorde in `whenReady`: `sessie.laad()` → `partities.opruimen()` →
   vensters herstellen of, bij een lege staat, één `new BrowserWindowController()`.
4. `BrowserWindowController(vensterStaat = null)`. Is er staat, dan `bounds`
   overnemen, workspaces en slapende tabbladen opbouwen, `this.nextId` op
   `max(id) + 1` zetten, en géén `createTab(NEWTAB)` in de
   `did-finish-load`-handler doen (die test op `this.tabs.size === 0` en klopt
   dan al vanzelf).
5. `addWorkspace(name)` haalt zijn id uit `sessie.nieuwWorkspaceId()` in plaats
   van uit `this.nextWorkspaceId++`, en krijgt een tweede parameter om bij het
   herstellen een bestaand id op te leggen.
6. Nieuwe velden op de controller: `this.sluimer`, `this.scroll`,
   `this.favicons`, `this.hersteldeOpdracht`.
7. `createTab()` krijgt de optie `{ slaapt: record }`; `describe()` en
   `activateTab()` zoals in §7.
8. `page-favicon-updated` slaat de favicon ook in `this.favicons` op.
9. `sessie.plan()` op de plekken uit §4, plus `win.on('move')`.
10. `win.on('close')` legt zijn momentopname in `laatstGesloten` (§4).
11. `app.on('before-quit')`, `app.on('session-end')`,
    `powerMonitor.on('shutdown')`, `powerMonitor.on('suspend')`.
12. `app.on('render-process-gone')` (§8).
13. `closeWorkspace()` vult de prullenbak en roept `clearData()` aan (§9).
14. `stopAgent()` wist ook `this.hersteldeOpdracht`.
15. `SLAAP`, naast de bestaande `NEWTAB`, als `pathToFileURL(...).href`.
16. De vijf nieuwe IPC-handlers uit §11.

---

## 11. IPC-kanalen

Allemaal `domein:actie`, met `sessie` als nieuw domein.

| Kanaal | Richting | Argumenten | Wat het doet |
| --- | --- | --- | --- |
| `sessie:state` | main → zijbalk (`send`) | `{ hersteld, onschoon, herhaald, slapend, vorigeBeschikbaar }` | Voedt de herstelstrip. Wordt één keer gestuurd na het herstellen en opnieuw als de strip van stand verandert. |
| `sessie:wake-all` | zijbalk → main (`invoke`) | — | Laadt alle slapende tabbladen van de actieve workspace en verbergt de strip. |
| `sessie:discard` | zijbalk → main (`invoke`) | — | Sluit alles wat hersteld is en begint met één leeg tabblad. |
| `sessie:dismiss` | zijbalk → main (`invoke`) | — | Alleen de strip weg; de tabbladen blijven slapend staan. |
| `sessie:restore` | zijbalk → main (`invoke`) | — | Opent `vorige.json` alsnog, als extra workspaces in het huidige venster. Voor de regel in de commandobalk. |

Bestaande kanalen die van vorm veranderen, niet van naam:

- `tabs:state` — elk tabblad krijgt er `slaapt: boolean` en
  `hersteldVan: string|null` bij.
- `island:state` — krijgt er `hersteld: boolean` bij.

`preload.js` groeit met vier methodes en één luisteraar; `ipcRenderer` blijft
onzichtbaar, zoals de regel wil:

```js
wakeAllTabs: () => ipcRenderer.invoke('sessie:wake-all'),
discardSession: () => ipcRenderer.invoke('sessie:discard'),
dismissRestore: () => ipcRenderer.invoke('sessie:dismiss'),
restorePrevious: () => ipcRenderer.invoke('sessie:restore'),
onSession: (fn) => ipcRenderer.on('sessie:state', (_e, s) => fn(s)),
```

`preload-island.js` verandert **niet**.

---

## 12. De renderer

`renderer/index.html`: de `<section id="herstel" hidden>` tussen `#address` en
`#tablist`, met een `<p>` voor de tekst en drie knoppen. Geen nieuwe scripts.

`renderer/app.js`: een `browser.onSession()`-luisteraar die de strip vult en
`hidden` zet. Belangrijk — en dit is dezelfde valkuil als bij de bewapende
sluitknop van een workspace: de strip is UI-stand die een hertekening moet
overleven, dus hij staat in een variabele naast `laatsteStaat` en wordt niet uit
de DOM gelezen. `renderTab()` zet `li.dataset.slaapt` en gebruikt `tab.hersteldVan`
voor titel en tooltip.

`renderer/style.css`: `#herstel` en `.tab[data-slaapt="true"]`, met bestaande
variabelen.

`renderer/slaap.html`: dezelfde CSP-meta als `index.html`
(`default-src 'self'; img-src 'self' https: data:; style-src 'self'`).
`slaap.js` leest `location.search` met `URLSearchParams` en zet de waarden met
`textContent` in de DOM — nooit `innerHTML`, want die titel komt van een
willekeurige website.

---

## 13. Wat er mis kan gaan

- **`rename` faalt op Windows.** Virusscanner of zoekindexeerder. Drie pogingen,
  daarna overslaan; het oude bestand blijft geldig.
- **`userData` staat in een gesynchroniseerde map** (OneDrive, een netwerkschijf,
  een roaming profile). Dan is `rename` misschien geen enkele stap meer en kan
  `fsync` liegen. Hier hebben we geen antwoord op; `vorige.json` beperkt de schade
  tot één sessie.
- **Schijf vol.** Het schrijven van het tijdelijke bestand faalt, de rename komt
  er niet, `staat.json` blijft zoals hij was. Dat is de bedoelde uitkomst.
- **Een kapot `staat.json`.** Terugval op `vorige.json`, anders leeg starten. De
  app mag hier nooit op vastlopen.
- **Twee instanties.** Single-instance lock, anders wint de laatste schrijver en
  ben je de sessie van de andere kwijt.
- **Sessiecookies zijn weg.** Cookies zonder vervaldatum overleven het afsluiten
  niet, ook niet in een persistente partitie. Een deel van je herstelde tabbladen
  komt uitgelogd terug. Dat is browsergedrag, geen bug van dit ontwerp, maar het
  is wel wat je merkt.
- **Veel tabbladen, veel views.** Een slapend tabblad krijgt in dit ontwerp wél
  een `WebContentsView`. Of een `WebContentsView` waarop nooit `loadURL` is
  aangeroepen al een renderer-proces kost, **heb ik niet geverifieerd** en het is
  de aanname waar dit onderdeel op leunt. Meet het met vijftig herstelde
  tabbladen voordat dit vast staat. Valt het tegen, dan is de uitwijk: slapende
  tabbladen helemaal geen view geven en `ws.tabs` waarden laten bevatten die óf
  een view óf een record zijn — goedkoper, maar dan moeten `allViews()`,
  `closeTab()`, `layoutActiveTab()` en `workspaceOf()` allemaal mee.
- **De opruimer verwijdert te veel.** De `/^ws-\d+$/`-test en de wachttijd van
  24 uur voor weespartities zijn de twee sloten. Verifieer de mapnaam één keer met
  de hand voordat de `rmSync` in de code komt.
- **Scrollherstel mist.** Op dynamische pagina's spring je naar boven. Geaccepteerd.

---

## 14. Wat dit niet oplost

- **Geen geschiedenis, bladwijzers of downloads.** Dit onderdeel onthoudt alleen
  wat er open stond, niet waar je bent geweest. Het `sessie/`-formaat is er ook
  niet op ontworpen: geschiedenis hoort in een database, niet in een JSON-bestand
  dat elke minuut in zijn geheel wordt herschreven.
- **Geen terug/vooruit-geschiedenis per tabblad.** Kan niet in Electron 33, zie §1.
- **Geen "onlangs gesloten tabblad terug" (Ctrl+Shift+T).** De prullenbakstructuur
  zou het kunnen dragen, maar het is een eigen onderwerp met eigen UI.
- **Geen synchronisatie tussen apparaten**, en geen versleuteling: de titels en
  url's van je tabbladen staan leesbaar in `userData`. Dat is hetzelfde niveau als
  wat andere browsers doen, maar het is een keuze en geen vanzelfsprekendheid.
- **De assistent wordt niet hervat**, met opzet. Zie §8.
- **Meerdere vensters worden hersteld, maar zijn nog niet handmatig te openen.**
  Dat gat staat al in `CLAUDE.md`; dit ontwerp maakt het niet dicht, het houdt er
  alleen rekening mee.
- **Permissies.** Punt 1 van de uitbouwvolgorde staat nog open. Sessieherstel
  verandert daar niets aan en maakt het ook niet erger, maar een herstelde sessie
  betekent wel dat er bij het opstarten meteen weer pagina's laden die vandaag
  ongevraagd camera en microfoon zouden krijgen. Dat is een reden te meer om die
  handler eerst te bouwen.
