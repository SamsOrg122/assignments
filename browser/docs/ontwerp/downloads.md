# Downloads

Downloads zijn in deze browser geen aparte pagina en geen balk die onderin
wegschuift, maar een paneel in de zijbalk plus één klein teken in het eiland.
Dat komt door de architectuur: de pagina is een native `WebContentsView` die
altijd over gewone HTML heen tekent, dus alles wat over de pagina zou moeten
liggen kost of een extra view, of het wegnemen van de pagina (zoals de
commandobalk doet met `ui:palette`). De zijbalk heeft dat probleem niet — die
staat links van het paginagebied en tekent gewoon. Downloads zijn bovendien
precies hetzelfde soort ding als een tabblad van een assistent: iets dat
doorloopt terwijl jij ergens anders kijkt. Ze horen dus in dezelfde zijbalk als
de tabbladen en ze lenen hetzelfde signaal in het eiland. Verder is de leidende
gedachte dat een download een **eigenaar** heeft, net als een tabblad: wat de
assistent binnenhaalt is niet zomaar hetzelfde als wat jij binnenhaalt, en dat
mag je aan de lijst kunnen zien voordat je een `.exe` opent.

Dit ontwerp gaat uit van Electron 33 (`electron@33.4.11` in `node_modules`).
Alle genoemde methodes zijn nagelezen in `node_modules/electron/electron.d.ts`;
waar ik iets niet zeker weet staat dat expliciet in de laatste paragraaf.

---

## 1. Uitgangspunten

1. **Geen native opslaandialoog, tenzij je erom vraagt.** Standaard landt een
   download meteen in de downloadmap, zoals Chrome. Een modale dialoog per
   download onderbreekt precies het werken-terwijl-het-loopt waar deze browser
   voor is.
2. **De beslissing valt synchroon.** `will-download` is het enige moment waarop
   je het pad kunt zetten. Je kunt daar niet op de renderer wachten. Alles wat
   "eerst even vragen" is, gebeurt dus ná de start met `item.pause()`.
3. **Een download erft de eigenaar van het tabblad waar hij vandaan komt.**
4. **De lijst leeft in het hoofdproces.** De renderer tekent alleen. Dat is
   dezelfde eenrichtingsstroom als `pushState()`, maar via een eigen kanaal en
   met een eigen klok, want voortgang komt veel vaker binnen dan tabbladstate.
5. **Wij scannen niets.** Er is geen Safe Browsing. Wat we wél doen is een
   bestand markeren als afkomstig van internet, en bij riskante types eerst
   vragen.

---

## 2. Waar het aan de architectuur hangt

### 2.1 Eén handler per sessie, niet per workspace

`will-download` staat op de **sessie**, en een sessie hoort bij een
partitienaam. `addWorkspace()` geeft workspace 1 de partitie `persist:ws-1` —
in *elk* venster, want `nextWorkspaceId` loopt per controller. Twee vensters
delen dus dezelfde sessie. Zou je de handler per workspace koppelen, dan draait
hij bij het tweede venster twee keer voor dezelfde download en krijg je twee
rijen, twee paden en één kapot bestand.

Daarom een module-niveau koppeling in `main.js`, met een `Set` als slot:

```js
// Een sessie hoort bij een partitienaam, niet bij een venster: workspace 1 van
// twee vensters is dezelfde 'persist:ws-1'. De handler mag er dus één keer op.
const gekoppeldeSessies = new Set();

function koppelDownloads(partitie) {
  const ses = session.fromPartition(partitie);
  if (gekoppeldeSessies.has(partitie)) return ses;
  ses.on('will-download', (event, item, wc) => neemDownloadAan(event, item, wc));
  gekoppeldeSessies.add(partitie);
  return ses;
}
```

Aan te roepen aan het eind van `addWorkspace()`. `session.fromPartition()` maakt
de sessie meteen aan in plaats van bij het eerste tabblad; dat is goedkoop en
het scheelt een tweede moment waarop je eraan moet denken.

### 2.2 Van webContents naar venster en tabblad

De registry `windows` kent alleen de webContents van de zijbalk en die van het
eiland. De derde parameter van `will-download` is de webContents van het
**tabblad**, en die staat er niet in. Geen tweede registry aanleggen; gewoon
zoeken. Een download begint hooguit een paar keer per minuut, en een lijst die
je afloopt kan niet verouderen zoals een tweede registry dat wel kan:

```js
// De registry 'windows' kent alleen de twee webContents met een preload. Een
// download komt uit een tabblad, dus die zoeken we op in de vensters zelf.
function bronVan(wc) {
  if (!wc || wc.isDestroyed()) return null;
  for (const controller of new Set(windows.values())) {
    for (const ws of controller.workspaces.values()) {
      for (const [tabId, view] of ws.tabs) {
        if (view.webContents === wc) return { controller, ws, tabId };
      }
    }
  }
  return null;
}
```

Is de bron niet te vinden (een gesloten tabblad, of een download die het
hoofdproces zelf met `session.downloadURL()` startte), dan valt hij toe aan het
eerste open venster en aan de actieve workspace daarvan, met eigenaar `null`.
Is er helemaal geen venster meer, dan `item.cancel()` — een download zonder
plek om hem te tonen is erger dan geen download.

---

## 3. De levensloop van één download

```
session 'will-download'   →  naam schoonmaken, map kiezen, pad reserveren,
  (synchroon!)                item.setSavePath(pad)   of   setSaveDialogOptions()
                              record aanmaken, meteen naar de UI duwen
        │
item 'updated' (progressing) →  ontvangen/totaal/snelheid bijwerken, 4×/s duwen
        │                       eerste tik: riskant of te groot? → item.pause()
        │
item 'updated' (interrupted) →  staat 'onderbroken', hervatbaar = ETag||LastModified
        │
item 'done' (completed)      →  herkomst markeren (Windows), staat 'klaar',
        │                       taakbalkbalk uit, eiland even groen
item 'done' (cancelled)      →  restbestand opruimen, staat 'geannuleerd'
item 'done' (interrupted)    →  staat 'mislukt', knop 'Opnieuw'
```

### 3.1 De aanname (synchroon)

```js
neemDownloadAan(event, item, wc) {
  const bron = bronVan(wc);
  const controller = bron?.controller ?? eersteVenster();
  if (!controller) return item.cancel();

  const ws = bron?.ws ?? controller.workspace;
  const owner = bron ? controller.owners.get(bron.tabId) ?? null : null;
  const naam = veiligeBestandsnaam(item.getFilename());
  const map = controller.downloadMap(ws, owner);
  const riskant = isRiskant(naam);

  // Hierna kun je het pad niet meer zetten: buiten deze callback is Electrons
  // eigen routine al begonnen. Alles wat "eerst even vragen" heet, gebeurt dus
  // verderop met pause(), niet hier met wachten.
  if (controller.vraagAltijd && !owner) {
    item.setSaveDialogOptions({
      title: 'Opslaan als',
      defaultPath: path.join(map, naam),
      properties: ['createDirectory', 'showOverwriteConfirmation'],
    });
  } else {
    const pad = vrijPad(map, naam, gereserveerd);
    gereserveerd.add(pad);
    item.setSavePath(pad);
  }
  controller.voegDownloadToe(item, { ws, owner, tabId: bron?.tabId ?? null, riskant });
}
```

`event.preventDefault()` breekt de download meteen af. Wij gebruiken dat maar op
één plek: als er ooit een harde regel komt van het type "assistenten mogen niet
downloaden". Alles wat een afweging is, kan hier niet — het is synchroon.

Waarom niet gewoon `session.setDownloadPath(map)` en Chromium zelf laten
nummeren? Omdat de map bij ons van de **eigenaar** afhangt (een assistent krijgt
een eigen submap) en van de workspace, en een sessie-instelling kent dat verschil
niet: de assistent deelt de sessie met jouw tabbladen. Bijkomend voordeel: we
kennen het doelpad al vóór de eerste byte en kunnen het meteen tonen.

### 3.2 De abonnementen

```js
item.on('updated', (_e, staat) => { … });     // 'progressing' | 'interrupted'
item.once('done', (_e, staat) => { … });      // 'completed' | 'cancelled' | 'interrupted'
```

Uit `item` halen we per tik: `getReceivedBytes()`, `getTotalBytes()` (0 = onbekend),
`getCurrentBytesPerSecond()`, `getPercentComplete()`, `isPaused()`, `canResume()`,
`getSavePath()`, `getETag()`, `getLastModifiedTime()`, `getState()`.

---

## 4. Waar de bestanden landen

Volgorde van keuze, eerste die iets oplevert wint:

| # | Bron | Voorbeeld |
| --- | --- | --- |
| 1 | Eigen map van de workspace | `D:\Werk\Downloads` |
| 2 | Eigen standaardmap van de gebruiker | `D:\Binnengehaald` |
| 3 | `app.getPath('downloads')` | `C:\Users\…\Downloads` |

En daarbovenop: is er een eigenaar, dan komt er een submap bij:
`<gekozen map>/Tougather/<naam van de assistent>/`. Zo hoef je nooit te raden
of jij dat bestand hebt gehaald of hij, en kun je zijn hele oogst in één keer
weggooien.

Waarom een map **per workspace** kan, maar niet standaard aan staat: workspaces
zijn identiteiten, en werkbestanden en privébestanden door elkaar in één map is
precies wat een workspace probeert te voorkomen. Maar een browser waarin je
bestanden op wisselende plekken belanden is erger, dus leeg = de standaardmap.

Bestaat de map niet meer (externe schijf eruit), dan valt hij terug op
`app.getPath('downloads')`. `setSavePath()` maakt ontbrekende mappen zelf
recursief aan, maar op een verdwenen station lukt dat niet en krijg je een
nietszeggende `interrupted`; een `fs.existsSync()` vooraf is één regel.

### 4.1 Een andere map kiezen

In de voet van het paneel staat **Map…**. Dat gaat via `download:map` naar:

```js
const { canceled, filePaths } = await dialog.showOpenDialog(this.win, {
  title: 'Downloadmap kiezen',
  defaultPath: this.downloadMap(this.workspace, null),
  buttonLabel: 'Kies map',
  properties: ['openDirectory', 'createDirectory'],
});
```

Twee klikken: eerst voor deze workspace, met `Alt` ingedrukt (of via het
tweede knopje **Overal**) voor de standaardmap. Lopende downloads verhuizen
niet mee; hun pad staat al vast.

Op macOS is dit een sheet aan het venster en dus modaal. Dat is hier
acceptabel: het is een expliciete handeling en de download loopt intussen door.

### 4.2 Waar de instellingen staan

`app.getPath('userData')/downloads.json`, geschreven met een debounce van 500 ms
naar `downloads.json.tmp` en dan `fs.renameSync()`, zodat een crash halverwege
geen half bestand achterlaat.

```json
{
  "versie": 1,
  "standaardmap": null,
  "vraagAltijd": false,
  "mapPerPartitie": { "persist:ws-2": "D:\\Werk\\Downloads" }
}
```

Let op de sleutel: **de partitienaam, niet het workspace-id.** Workspace-ids
lopen per venster en worden nog nergens bewaard; de partitie is wat de sessie
werkelijk identificeert.

De lijst met downloads zelf gaat hier **niet** in. Zie §14.

---

## 5. Naamconflicten en onveilige namen

`item.getFilename()` komt uit `Content-Disposition` of uit de URL. Dat is invoer
van de server. Chromium maakt hem zelf al schoon, maar wij zetten het pad, dus
wij zijn ook zelf verantwoordelijk. In `downloads.js`:

```js
const VERBODEN = /[<>:"/\\|?*\u0000-\u001f]/g;
const GERESERVEERD = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i;

function veiligeBestandsnaam(ruw) {
  // Zonder deze stap kan een server met '..\..\Opstarten\x.lnk' buiten de
  // downloadmap schrijven. basename() knipt elk pad eraf, wat er ook in staat.
  let naam = path.basename(String(ruw || '')).replace(VERBODEN, '_');
  naam = naam.replace(/[. ]+$/, '');   // Windows kapt die zelf af, dan klopt onze naam niet meer
  if (!naam || naam === '.' || naam === '..') naam = 'download';
  if (GERESERVEERD.test(naam)) naam = `_${naam}`;
  if (naam.length > 180) {
    const ext = path.extname(naam).slice(0, 20);
    naam = naam.slice(0, 180 - ext.length) + ext;
  }
  return naam;
}
```

Bij een botsing nummeren we zoals Chrome: `rapport.pdf`, `rapport (1).pdf`,
`rapport (2).pdf`.

```js
function vrijPad(map, naam, gereserveerd) {
  const ext = path.extname(naam);
  const stam = naam.slice(0, naam.length - ext.length);
  for (let n = 0; n < 1000; n++) {
    const kandidaat = path.join(map, n === 0 ? naam : `${stam} (${n})${ext}`);
    // Lopende downloads tellen mee: hun bestand staat er misschien nog niet, en
    // twee tegelijk gestarte downloads zouden anders hetzelfde pad krijgen.
    if (!gereserveerd.has(kandidaat) && !fs.existsSync(kandidaat)) return kandidaat;
  }
  return path.join(map, `${stam} (${Date.now()})${ext}`);
}
```

`gereserveerd` is één module-brede `Set` van paden van nog lopende downloads;
een pad gaat eruit in `done` (welke afloop dan ook). Synchrone `fs.existsSync`
is hier geen luiheid maar een eis: we zitten in een synchrone callback.

We **overschrijven nooit**. Wil je toch overschrijven, dan kan dat alleen via
"Opslaan als" met `showOverwriteConfirmation`, waar het besturingssysteem het
vraagt.

---

## 6. Gevaarlijke bestandstypen

Er is geen Safe Browsing en geen virusscanner. Wat we hebben is een lijst met
extensies die op een van de drie platforms uitvoerbaar zijn, en de markering van
de herkomst.

```js
const RISKANTE_EXTENSIES = new Set([
  // Windows
  'exe','msi','msix','appx','bat','cmd','com','scr','pif','cpl','msc','hta',
  'ps1','psm1','vbs','vbe','js','jse','wsf','wsh','reg','lnk','url','inf','dll','ocx',
  // macOS
  'dmg','pkg','app','command',
  // Linux
  'sh','deb','rpm','appimage','run',
  // Schijfkopieën: één dubbelklik en de inhoud is gemount
  'iso','img','vhd','vhdx','jar',
]);
```

`js` staat erin omdat Windows Script Host een gedownload `.js`-bestand gewoon
uitvoert bij dubbelklikken.

**Gedrag.** Een riskant bestand wordt niet geweigerd, maar gepauzeerd en aan jou
voorgelegd. De rij komt in de staat `wacht` met de regel "Dit is een programma"
en twee knoppen: **Bewaar** en **Verwijder**.

```js
item.on('updated', (_e, staat) => {
  // Pauzeren gebeurt hier en niet in will-download: vóór de eerste byte doet
  // pause() nog niets, en dan loopt hij ongevraagd door.
  if (d.riskant && !d.gevraagd) {
    d.gevraagd = true;
    item.pause();
    d.staat = 'wacht';
    this.duwDownloads(true);
  }
  …
});
```

Er staan dan een paar honderd kilobytes op schijf. Bij **Verwijder** gaat het
restbestand weg (`item.cancel()`, daarna `fs.rm(pad, { force: true })`).

**Herkomst markeren.** Op Windows schrijven we na afloop de alternate data
stream die SmartScreen en Defender laat aanslaan bij het openen:

```js
// Zonder deze markering ziet Windows een gedownloade .exe als een gewoon
// bestand en blijft SmartScreen stil. Het is de enige echte controle die we
// hebben, want wij scannen zelf niets.
function schrijfHerkomst(pad, url, referrer) {
  if (process.platform !== 'win32') return;
  try {
    fs.writeFileSync(`${pad}:Zone.Identifier`,
      `[ZoneTransfer]\r\nZoneId=3\r\nReferrerUrl=${referrer}\r\nHostUrl=${url}\r\n`);
  } catch { /* FAT en exFAT kennen geen streams; dan gaat het zonder markering */ }
}
```

Op macOS zou het equivalent `com.apple.quarantine` zijn. Dat is een xattr en
Node kan die niet zelf zetten; het zou een `spawn('xattr', …)` kosten. **Niet in
dit ontwerp**, wel expliciet als gat benoemd.

**In de UI.** De volledige naam wordt getoond, nooit in het midden afgekapt, en
de extensie staat als apart label rechts van de naam. Anders leest
`factuur.pdf.exe` in een smalle zijbalk als `factuur.pdf…`, en dat is precies de
truc waar dit tegen moet beschermen.

---

## 7. Pauzeren, hervatten, annuleren, opnieuw

| Actie | API | Kanttekening |
| --- | --- | --- |
| Pauzeren | `item.pause()`, `item.isPaused()` | Werkt pas als er data loopt. |
| Hervatten | `item.resume()`, `item.canResume()` | Zie hieronder. |
| Annuleren | `item.cancel()` | Levert `done` met `cancelled`. |
| Opnieuw | `wc.downloadURL(url)` | Nieuwe download, nieuw record. |

**Hervatten liegt makkelijk.** De Electron-documentatie is er duidelijk over: als
de server geen range-requests aankan en geen `Last-Modified` én `ETag` meestuurt,
gooit `resume()` alles weg en begint van voren. Wij weten dat, dus zeggen we het:

```js
d.hervatbaar = Boolean(item.getETag() || item.getLastModifiedTime());
```

Is dat `false`, dan heet de knop **Opnieuw beginnen** in plaats van **Hervat**,
en toont de rij "kan niet hervatten". Een knop die "Hervat" heet en stiekem bij 0
begint is erger dan geen knop.

**Twee soorten `interrupted`.** Komt hij binnen via `updated`, dan is de download
te hervatten en staat de rij op `onderbroken` met een **Hervat**-knop. Komt hij
via `done`, dan is het voorbij: staat `mislukt`, knop **Opnieuw**. Dat verschil
is het enige dat Electron over de oorzaak prijsgeeft — er is geen interrupt-reden
in de API, dus we kunnen "schijf vol", "netwerk weg" en "server weigert" niet uit
elkaar houden. De rij zegt dus "Onderbroken", niet waarom.

**Opnieuw** gaat het liefst via de webContents van het oorspronkelijke tabblad
(`wc.downloadURL(url)`), want die doet wél de herkomstcontroles die
`session.downloadURL()` overslaat — dat staat zo in de documentatie. Bestaat dat
tabblad niet meer, dan `session.fromPartition(partitie).downloadURL(url)`, zodat
de cookies van de workspace in elk geval meegaan.

**Na een herstart hervatten** kan met `session.createInterruptedDownload({ path,
urlChain, offset, length, mimeType, lastModified, eTag, startTime })`. Daarvoor
zou je die velden bij `done`/`interrupted` moeten wegschrijven. Bewust **niet in
deze ronde**: het hangt aan sessieherstel (stap 6 in CLAUDE.md) en het is de
enige plek waar ik de precieze volgorde niet zeker weet (zie §16).

---

## 8. Van wie is deze download?

Dit is de vraag die deze browser anders maakt dan andere. Het antwoord is
mechanisch eenvoudig en juist daarom betrouwbaar:

> **De eigenaar van een download is de eigenaar van het tabblad waar hij vandaan
> komt.** `owner = controller.owners.get(tabId) ?? null`

Een assistent werkt per definitie in zijn eigen tabblad, dus alles wat daar
vandaan komt is van hem. Er is geen extra boekhouding nodig en er is geen manier
om ernaast te zitten zolang die aanname klopt.

Wat er dan anders gaat bij `owner !== null`:

1. **Andere map.** `<map>/Tougather/<naam>/`. Zie §4.
2. **Nooit een dialoog.** `vraagAltijd` geldt niet voor een assistent: een modale
   opslaandialoog die uit het niets opduikt terwijl jij ergens anders typt is
   precies wat deze browser niet doet. Zijn downloads gaan altijd stil naar zijn
   map.
3. **Nooit automatisch openen.** `shell.openPath()` gebeurt alleen op jouw klik,
   nooit vanuit de agentlogica.
4. **Riskant wordt een `actie`-stap.** Haalt hij een uitvoerbaar bestand op, dan
   wordt niet alleen de rij gepauzeerd, maar gaat het eiland naar
   `modus: 'actie'` — oranje, met de regel `Kim wil zetup.exe bewaren`. Dat is
   precies de bestaande afspraak uit CLAUDE.md: hij werkt zelfstandig en vraagt
   alleen bij betalen, verwijderen en versturen. Een programma binnenhalen hoort
   in dat rijtje. De knoppen **Ga door** en **Niet nu** in het eiland doen dan
   `download:toestaan` respectievelijk `download:weiger`.
5. **Een grensbedrag.** Boven `AGENT_MAX_BYTES` (voorstel: 512 MB, uit
   `item.getTotalBytes()`) wordt óók gepauzeerd en gevraagd, ook als het type
   ongevaarlijk is. Een assistent die ongemerkt je schijf volzet is een
   realistischer probleem dan een assistent die een virus haalt. Is de grootte
   onbekend (`0`), dan controleren we op elke tik `getReceivedBytes()` tegen
   dezelfde grens.
6. **De eigenaar blijft in de geschiedenis staan.** `stopAgent()` zet
   `owners.set(tabId, null)` als hij niet is afgemaakt, maar het
   download-record houdt de naam die het bij de start kreeg. De lijst moet
   waarheid vertellen over wie het bestand heeft gehaald, ook nadat de assistent
   het tabblad heeft losgelaten.
7. **Zijn cookies zijn jouw cookies.** De assistent werkt in de sessie van de
   workspace en downloadt dus als jou, met jouw logins. Dat is geen bug — het is
   wat hem bruikbaar maakt — maar het staat hier zodat niemand zich later
   verbaast.

In de rij staat de eigenaar vóór de bestandsnaam, precies zoals de tabbladen dat
al doen (`Kim · rapport.pdf`), in `--assistent`.

---

## 9. De UI: het paneel in de zijbalk

### 9.1 Waar het zit

In `renderer/index.html`, **tussen `#new-tab` en `<footer id="workspaces">`**.
De zijbalk is een flexkolom; het paneel krijgt `flex: none` met
`max-height: 44%` en een eigen scroll, `#tablist` houdt `flex: 1` en krimpt.
Omdat `#tablist` al `overflow-y: auto` heeft, is zijn automatische minimumhoogte
al 0 en kan hij ook echt krimpen.

Het paneel heeft `hidden` zolang er geen enkele download is — ook geen lege kop.
De zijbalk is 264 px breed; vaste chroom voor iets wat er niet is, is daar te
duur.

**Belangrijk:** dit paneel heeft géén `ui:palette`-truc nodig. Het blijft binnen
de 264 px van de zijbalk en de pagina begint pas op `SIDEBAR_WIDTH`. Er ligt dus
niets overheen en er hoeft geen view verborgen te worden.

### 9.2 Hoe het eruitziet

```
┌────────────────────────────────────┐
│ ▾  Downloads              2 bezig  │   26px, klikbaar, aria-expanded
├────────────────────────────────────┤
│ ⤓  rapport.pdf              PDF    │
│    4,2 / 18,6 MB · 3,1 MB/s · 5 s  │   44px per rij
│ ▬▬▬▬▬▬▬▬░░░░░░░░░░░░░░░░░░░░░░░░░  │   2px lijn onderaan de rij
├────────────────────────────────────┤
│ ⚠  setup.exe                EXE    │
│    Kim · dit is een programma      │
│              [ Bewaar ] [ Verwijder ]│
├────────────────────────────────────┤
│ ✓  foto.jpg                 JPG    │
│    2,1 MB · zojuist                │
├────────────────────────────────────┤
│  Map…                    Wis lijst │   voet, alleen bij open paneel
└────────────────────────────────────┘
```

- De voortgang is een 2px-lijn onderaan de rij in `--accent`, niet een blok of
  een ring. Het is een vijfde rij in een lijst die al vol staat met tabbladen;
  hoe stiller hoe beter. Bij onbekende grootte een onbepaalde lijn (CSS-animatie,
  uit onder `prefers-reduced-motion`).
- Een rij van een assistent krijgt een 2px linkerrand in `--assistent` en zijn
  naam vóór de bestandsnaam.
- Een riskante rij krijgt die rand in `--danger`.
- De extensie staat rechts als klein label in `--font-small`, zodat de naam links
  mag afkappen zonder dat je de extensie kwijtraakt.

Knoppen per staat:

| Staat | Knoppen |
| --- | --- |
| `wacht` | Bewaar · Verwijder |
| `bezig` | Pauzeer · Annuleer |
| `gepauzeerd` | Hervat (of Opnieuw beginnen) · Annuleer |
| `onderbroken` | Hervat · Annuleer |
| `klaar` | Open · Toon in map · (bij hover) Wis |
| `geannuleerd`, `mislukt` | Opnieuw · Wis |

Knoppen verschijnen bij hover en bij toetsenbordfocus, net als de sluitknop van
een tabblad. Bij `wacht` staan ze **altijd** zichtbaar: die rij vraagt iets.

### 9.3 Openen en sluiten

- De kop klapt het paneel open en dicht. Dicht blijft de kop staan zolang er iets
  loopt, met de teller erin, zodat je het altijd terugvindt.
- **`Ctrl/Cmd + Shift + J`** klapt het paneel open en zet focus op de eerste rij.
  Niet `Ctrl+J` — dat is in deze browser het eiland, en dat blijft zo.
- Een nieuwe download klapt het paneel **niet** vanzelf open. Wel bij de eerste
  van een reeks als het paneel nog helemaal verborgen was: dan is het verschijnen
  zelf de melding.
- `downloads:open` (vanuit het eiland) klapt open en markeert de nieuwste rij.

### 9.4 De open/dicht-stand is een variabele, geen DOM-stand

`downloads:state` komt tot vier keer per seconde binnen en tekent de lijst
opnieuw, precies zoals `tabs:state` dat met de tabbladen doet. De open/dicht-
stand van het paneel en welke rij "bewapend" is, horen dus in een variabele in
`downloadpaneel.js`, niet in een class op een element — hetzelfde patroon als
`gewapend` in `app.js`.

---

## 10. De UI: het eiland

Het eiland is de plek voor "er loopt iets terwijl jij ergens anders kijkt", en
dat is precies wat een download is. Maar het eiland heeft één stem, en die is van
de assistent. Dus geen tekstregel voor downloads, maar een **druppel**: een
cirkel van 22 px rechts naast de pil-inhoud, met een voortgangsring.

```html
<!-- in island.html, als laatste kind van #rij -->
<button id="druppel" type="button" hidden aria-label="Downloads">
  <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3v7M5 7.5 8 10.5l3-3M4 12.5h8" /></svg>
</button>
```

```css
/* island.css */
#druppel {
  position: relative; width: 22px; height: 22px; flex: none; border: 0;
  border-radius: 50%; background: var(--ring-baan); color: var(--tekst);
}
/* De ring is de voortgang. Een conic-gradient scheelt een canvas en een
   tekenlus; --p wordt vanuit island.js gezet. */
#druppel::before {
  content: ""; position: absolute; inset: -3px; border-radius: 50%;
  background: conic-gradient(var(--ring) calc(var(--p, 0) * 1turn), transparent 0);
  mask: radial-gradient(circle, transparent 62%, #000 64%);
}
```

Nieuwe variabelen in de `:root` van `island.css` (die heeft een eigen set, want
het is een eigen document): `--ring`, `--ring-baan`, `--ring-klaar`,
`--ring-vraag`.

Gedrag:

- **Geen downloads:** `hidden`. De pil krimpt vanzelf terug, want `island.js`
  meet zichzelf op en meldt de nieuwe maat via `island:size`.
- **Bezig:** de ring loopt vol met de som van alle lopende downloads in dit
  venster. Grootte onbekend van alles → ring pulseert in plaats van te vullen.
- **Klaar:** ring vol in `--ring-klaar`, 4 seconden zichtbaar, dan weg.
- **Vraag:** `--ring-vraag` en een langzame hartslag. Loopt het om een download
  van een assistent, dan gaat de tekstregel er ook op (`modus: 'actie'`,
  zie §8.4).
- **Klik:** `eiland.toonDownloads()` → `download:paneel` → het venster stuurt
  `downloads:open` naar de zijbalk.

Nieuw kanaal `island:downloads` met een compacte samenvatting; de bestaande
`island:state` blijft ongemoeid, zodat de assistentregel en de druppel elkaar
niet overschrijven:

```js
{ aantal: 2, fractie: 0.34, staat: 'bezig' } // 'bezig' | 'vraag' | 'klaar' | 'geen'
```

---

## 11. Buiten het venster

- **Windows/Linux taakbalk:** `win.setProgressBar(fractie)`, met `-1` als er
  niets loopt en `2` (dus > 1, onbepaald) als geen enkele lopende download zijn
  grootte kent. Dit is het eerlijkste "je kijkt ergens anders"-signaal dat er is:
  het werkt als het venster geminimaliseerd is.
- **macOS dock:** `app.dock.downloadFinished(pad)` na een geslaagde download.
  Dat is het stuiterende Downloads-stapeltje; alleen zinvol als het bestand
  daadwerkelijk in de Downloads-map staat.
- **Geen `flashFrame()`** en **geen systeemmelding**. Het paneel, de druppel en
  de taakbalk zijn genoeg; een download is geen gebeurtenis die je uit een ander
  programma mag wegtrekken.

---

## 12. IPC-kanalen

Commando's zijn enkelvoud, pushes meervoud — dezelfde splitsing als `tab:new`
tegenover `tabs:state`.

| Kanaal | Richting | Payload | Doet |
| --- | --- | --- | --- |
| `download:pauzeer` | zijbalk → main | `id` | `item.pause()` |
| `download:hervat` | zijbalk → main | `id` | `item.resume()` |
| `download:annuleer` | zijbalk → main | `id` | `item.cancel()` |
| `download:opnieuw` | zijbalk → main | `id` | `wc.downloadURL(url)` |
| `download:toestaan` | zijbalk, eiland → main | `id` | `resume()` na een `wacht` |
| `download:weiger` | zijbalk, eiland → main | `id` | `cancel()` + restbestand weg |
| `download:toon` | zijbalk → main | `id` | `shell.showItemInFolder(pad)` |
| `download:open` | zijbalk → main | `id` | `shell.openPath(pad)` |
| `download:verplaats` | zijbalk → main | `id` | `showSaveDialog` + verplaatsen |
| `download:wis` | zijbalk → main | `id` | uit de lijst, bestand blijft |
| `download:opruimen` | zijbalk → main | — | alle afgeronde uit de lijst |
| `download:map` | zijbalk → main | `overal` (bool) | `showOpenDialog`, map instellen |
| `download:paneel` | eiland → main | — | stuurt `downloads:open` naar de zijbalk |
| `downloads:state` | main → zijbalk | `{ items, samenvatting }` | de hele lijst |
| `downloads:open` | main → zijbalk | `{ id }` | paneel openklappen |
| `island:downloads` | main → eiland | `{ aantal, fractie, staat }` | de druppel |

Alle `download:*`-handlers lopen via `controllerFor(e)`, precies als de rest, en
zoeken het record op met `controller.downloads.get(id)`. Een id van een ander
venster levert `undefined` en dus niets — de ids lopen per venster, net als
`nextId` voor tabbladen.

### Preload

`preload.js` erbij (Engelse namen, zoals de rest van dát bestand):

```js
pauseDownload:  (id) => ipcRenderer.invoke('download:pauzeer', id),
resumeDownload: (id) => ipcRenderer.invoke('download:hervat', id),
cancelDownload: (id) => ipcRenderer.invoke('download:annuleer', id),
retryDownload:  (id) => ipcRenderer.invoke('download:opnieuw', id),
allowDownload:  (id) => ipcRenderer.invoke('download:toestaan', id),
rejectDownload: (id) => ipcRenderer.invoke('download:weiger', id),
showDownload:   (id) => ipcRenderer.invoke('download:toon', id),
openDownload:   (id) => ipcRenderer.invoke('download:open', id),
moveDownload:   (id) => ipcRenderer.invoke('download:verplaats', id),
clearDownload:  (id) => ipcRenderer.invoke('download:wis', id),
clearDownloads: () => ipcRenderer.invoke('download:opruimen'),
chooseDownloadFolder: (overal) => ipcRenderer.invoke('download:map', overal),

onDownloads:     (fn) => ipcRenderer.on('downloads:state', (_e, s) => fn(s)),
onDownloadsOpen: (fn) => ipcRenderer.on('downloads:open', (_e, d) => fn(d)),
```

`preload-island.js` erbij (Nederlandse namen, zoals de rest van dát bestand):

```js
toonDownloads: () => ipcRenderer.invoke('download:paneel'),
toestaan: (id) => ipcRenderer.invoke('download:toestaan', id),
weigeren: (id) => ipcRenderer.invoke('download:weiger', id),
onDownloads: (fn) => ipcRenderer.on('island:downloads', (_e, d) => fn(d)),
```

Geen `ipcRenderer` naar buiten, geen generieke `invoke(kanaal, …)`.

---

## 13. Nieuwe bestanden, en wat er in `main.js` bij moet

### Nieuw

| Bestand | Wat erin staat |
| --- | --- |
| `downloads.js` (root = hoofdproces, net als `preload.js`) | `veiligeBestandsnaam()`, `vrijPad()`, `isRiskant()`, `RISKANTE_EXTENSIES`, `schrijfHerkomst()`, `leesInstellingen()`/`bewaarInstellingen()`. Alleen `node:fs`, `node:path` en `process.platform` — geen Electron, zodat het los te beproeven is. |
| `renderer/downloadpaneel.js` | Tekent `#downloads`, luistert op `onDownloads`, `formaatBytes()`, `formaatDuur()`. Geen Node. |
| `docs/ontwerp/downloads.md` | dit document |

`renderer/downloadpaneel.js` moet **ná** `app.js` in `index.html` staan: het
gebruikt de `icoon()`-helper die daar op globaal niveau gedefinieerd is (gewone
scripts, geen modules — dezelfde afspraak als `search.js` en `glyph.js`).

Vergeet `package.json` niet: `"files"` bevat `main.js`, `preload*.js` en
`renderer/**`, maar niet een los `downloads.js` in de root. Dat moet erbij,
anders werkt het in de build wél in `npm start` en niet in de installer.

### Aanpassingen aan bestaande bestanden

**`main.js`**

1. Requires erbij: `session`, `dialog`, `fs`, plus `./downloads.js`.
2. Module-niveau: `const gekoppeldeSessies = new Set()`, `const gereserveerd =
   new Set()`, `koppelDownloads(partitie)`, `bronVan(wc)`,
   `neemDownloadAan(event, item, wc)`, `eersteVenster()`.
3. In `addWorkspace()`: `koppelDownloads(partitie)` na het aanmaken.
4. In de constructor: `this.downloads = new Map()`, `this.nextDownloadId = 1`,
   `this.downloadKlok = null`, plus de instellingen inlezen.
5. Nieuwe methodes op de controller: `voegDownloadToe()`, `beschrijfDownload()`,
   `duwDownloads(nu)`, `downloadMap(ws, owner)`, `zetDownloadMap()`,
   `rondDownloadAf()`.
6. In `pushState()` **niets** wijzigen. Downloads krijgen hun eigen kanaal en
   eigen klok; anders hertekent de tabbladlijst vier keer per seconde en start
   elke glyph-canvas van een assistententabblad steeds opnieuw.
7. `win.on('closed')`: lopende downloads afhandelen (zie §15).
8. De IPC-handlers uit §12, onderaan bij de andere.

**`preload.js` / `preload-island.js`** — de methodes uit §12.

**`renderer/index.html`** — het `<section id="downloads">` tussen `#new-tab` en
`<footer id="workspaces">`, plus `<script src="downloadpaneel.js">` ná `app.js`.
De CSP hoeft niet aangepast: het paneel laadt niets van buiten, en het
bestandsicoon is een inline `<path>`, geen `<img>`.

**`renderer/style.css`** — een blok `/* Downloads */`. Geen nieuwe kleuren nodig:
`--accent` voor de voortgang, `--danger` voor riskant en mislukt, `--assistent`
voor een rij van een assistent, `--fill`/`--stroke` voor de rest. Komt er toch
een kleur bij, dan in `:root` én in het `prefers-color-scheme: dark`-blok, nooit
los in een regel eronder.

**`renderer/island.html` / `island.css` / `island.js`** — de druppel uit §10.
`island.js` roept na elke wijziging `meet()` aan, anders klopt de breedte van de
pil niet meer.

**`renderer/app.js`** — alleen de sneltoets `Ctrl/Cmd + Shift + J`; die hoort bij
de bestaande `keydown`-luisteraar, niet in een tweede.

---

## 14. Het datamodel

Wat het hoofdproces per download bijhoudt (het `DownloadItem` zelf blijft daar en
gaat nooit over IPC — het is geen serialiseerbaar object):

```js
{
  id,                 // per venster oplopend, net als nextId voor tabbladen
  item,               // het DownloadItem; blijft in het hoofdproces
  tabId, partitie, workspaceId, owner,
  naam, pad, url, host, mime, ext,
  staat,              // 'wacht'|'bezig'|'gepauzeerd'|'onderbroken'|'klaar'|'geannuleerd'|'mislukt'
  ontvangen, totaal, snelheid,
  hervatbaar, riskant, gevraagd,
  gestart, geeindigd,
}
```

Wat er over `downloads:state` gaat is hetzelfde min `item`, plus een
samenvatting `{ bezig, vraagt, fractie, totaalSnelheid }` waarmee de kop en de
taakbalk gevoed worden. Bytes gaan als getal over de lijn; opmaken doet
`downloadpaneel.js`, want dat is presentatie.

**Duwsnelheid.** `updated` komt vaak binnen. Overgangen (staat verandert, nieuwe
download, klaar) gaan meteen; voortgang wordt gebundeld op 250 ms:

```js
duwDownloads(nu = false) {
  if (nu) { clearTimeout(this.downloadKlok); this.downloadKlok = null; return this.verstuurDownloads(); }
  if (this.downloadKlok) return;
  this.downloadKlok = setTimeout(() => { this.downloadKlok = null; this.verstuurDownloads(); }, 250);
}
```

**De lijst overleeft geen herstart.** Alleen de instellingen worden bewaard, de
geschiedenis niet. De bestanden staan op schijf en dáár hoort de geschiedenis
thuis; een eigen lijst die stilletjes uit de pas gaat lopen met de map is erger
dan geen lijst. Zodra er echte geschiedenis komt (stap 6 in CLAUDE.md) kan dit
mee.

---

## 15. Wat er mis kan gaan

- **Dezelfde partitie in twee vensters.** Zonder het slot van §2.1 loopt de
  handler dubbel. Dit is het makkelijkst te maken fout in dit hele ontwerp.
- **Twee downloads met dezelfde naam tegelijk.** Opgelost met `gereserveerd`,
  maar dat is een `Set` die je bij élke afloop moet legen — ook bij `cancelled`
  en `interrupted`, niet alleen bij `completed`. Vergeet je dat, dan tellen de
  nummers ongemerkt op.
- **Het venster gaat dicht terwijl er downloads lopen.** Is er nog een ander
  venster, dan verhuizen de records daarheen (nieuw id, zelfde `item`). Is dit
  het laatste, dan worden lopende downloads geannuleerd en hun restbestanden
  opgeruimd; op niet-macOS sluit `window-all-closed` de app toch af, en een
  half bestand achterlaten zonder iets te zeggen is het slechtste van twee.
- **Een tabblad sluiten tijdens een download.** Wij annuleren niets: de
  `DownloadItem` leeft in de sessie, niet in de webContents. De rij verliest
  alleen zijn `tabId`, waardoor **Opnieuw** terugvalt op de sessie.
- **De map verdwijnt** (externe schijf, netwerkshare). `existsSync` vooraf vangt
  de start af; verdwijnt hij halverwege, dan krijg je `interrupted` zonder reden.
- **Onbekende grootte** (`getTotalBytes() === 0`): geen percentage, geen
  resterende tijd, onbepaalde balk, en de taakbalk op onbepaald.
- **`resume()` begint van voren** bij servers zonder range-support. Zie §7.
- **De extensielijst is bot.** `factuur.pdf.exe` wordt gepakt, een `.7z` met een
  `.exe` erin niet. Een lijst die alles vangt bestaat niet.
- **Zone.Identifier faalt** op FAT/exFAT en op netwerkshares. Stil, in een
  `try`/`catch`; het bestand komt er wel, alleen zonder markering.
- **De renderer loopt achter.** Bij een afgeronde download die je meteen wist,
  kan er een klik binnenkomen voor een id dat niet meer bestaat. Elke handler
  begint dus met een `if (!d) return;` — geen throw.
- **Voortgang en tabbladstate door elkaar.** Zou je downloads meesturen in
  `pushState()`, dan hertekent de tabbladlijst vier keer per seconde en begint
  elke glyph-animatie van een assistententabblad opnieuw. Vandaar het aparte
  kanaal; dit is een echte valkuil, geen netheid.

---

## 16. Wat dit niet oplost

- **Geen reputatiecontrole.** Geen Safe Browsing, geen virusscan, geen hash-
  controle. De extensielijst plus Mark-of-the-Web is alles.
- **Geen quarantaine op macOS.** `com.apple.quarantine` blijft ongezet, dus
  Gatekeeper zwijgt bij een `.dmg` die via Tougather binnenkwam. Dit is het
  scherpste gat in dit ontwerp.
- **Geen geschiedenis over herstarts heen**, en dus ook geen hervatten na een
  herstart, ook al kan `createInterruptedDownload` dat in principe.
- **Geen "sleep het bestand hiervandaan naar een map".** Dat vraagt
  `webContents.startDrag({ file, icon })` vanuit het hoofdproces, mét een
  verplichte `NativeImage`. Los ontwerp.
- **Geen "Doelbestand opslaan als…" in een rechtermuisknopmenu.** Dat hangt aan
  het contextmenu (stap 3 in CLAUDE.md). De plumbing hier is er klaar voor: dat
  menu-item roept straks `wc.downloadURL(url)` aan en verder gebeurt alles zoals
  hier beschreven.
- **Geen bandbreedtelimiet, geen wachtrij, geen prioriteiten.** Tien downloads
  tegelijk zijn tien downloads tegelijk.
- **Geen instellingenscherm.** De map en "vraag altijd" zitten in de voet van het
  paneel. Zodra er echte instellingen zijn, verhuizen ze daarheen en blijft
  `downloads.json` het opslagformaat.
- **Geen downloads uit een `blob:`- of `data:`-URL die de pagina zelf
  fabriceert** — die komen wel via `will-download` binnen, maar `url` en `host`
  in de rij zeggen dan weinig, en **Opnieuw** werkt er niet voor. De knop is in
  dat geval verborgen.

---

## 17. Wat ik van de Electron-API niet zeker weet

Expliciet, zodat niemand hierop bouwt zonder het eerst te proberen:

1. **Welke `webContents` je krijgt bij een download die het hoofdproces zelf
   start** met `session.downloadURL()`. De typedefinitie zegt `WebContents`, maar
   ik weet niet of dat dan een bruikbare, aan een tabblad gekoppelde instantie
   is of iets losstaands. `bronVan()` moet daarom `null` aankunnen — dat doet het
   in dit ontwerp.
2. **Of Electron met een gezet `savePath` naar een tijdelijk bestand schrijft**
   (Chromium gebruikt normaal `.crdownload`) of rechtstreeks naar het doelpad.
   Dat bepaalt of `fs.existsSync()` een lopende download ziet. Het
   `gereserveerd`-mechanisme dekt beide gevallen af, juist omdat ik het niet weet.
3. **Of `item.pause()` al werkt vóór de eerste byte.** Vandaar dat het pauzeren
   in de eerste `updated`-tik gebeurt en niet in `will-download`. Werkt het daar
   wél, dan is dat een nette vereenvoudiging.
4. **De precieze volgorde bij `session.createInterruptedDownload()`.** Ik ga
   ervan uit dat het een `will-download` oplevert waarin je opnieuw
   `setSavePath()` moet zetten en daarna `resume()` moet aanroepen, maar dat heb
   ik niet nagelopen. Daarom staat hervatten-na-herstart buiten deze ronde.
5. **Of een lopende download blijft doorlopen als het tabblad wordt gesloten.**
   Ik ga ervan uit van wel, omdat het item aan de sessie hangt. Als dat niet zo
   is, moet het gedrag uit §15 anders: dan moet de rij meteen naar `mislukt`.
6. **Of `getCurrentBytesPerSecond()` een gemiddelde of een momentopname is.** De
   UI middelt daarom nog eens over de laatste drie tikken, zodat het cijfer niet
   staat te stuiteren.
7. **Of `app.dock.downloadFinished()` iets doet als het bestand buiten de
   Downloads-map staat.** De documentatie zegt alleen dat het het stapeltje laat
   stuiteren "if the filePath is inside the Downloads folder"; wij roepen het
   dus alleen aan als het pad daar daadwerkelijk onder valt.
