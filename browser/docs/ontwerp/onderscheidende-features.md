# Onderscheidende features

Dit document beschrijft de dingen waarvoor iemand van zijn huidige browser
overstapt. Niet de gaten uit `CLAUDE.md` — contextmenu, downloads, geschiedenis —
die moeten er sowieso komen en maken niemand enthousiast.

De keuze is door twee dingen bepaald. Ten eerste: de enige echte asymmetrie in
deze browser is dat een tabblad een **eigenaar** kan hebben. Alles wat daar niet
op leunt, kan Arc ook, en dan is er geen reden om te wisselen. Elke feature
hieronder maakt dus of gebruik van het feit dat er iemand anders in een tabblad
werkt, of betaalt een rekening die daardoor ontstaat (de zijbalk loopt vol, je
weet niet wat hij gedaan heeft, je moet kunnen meekijken).

Ten tweede: de layout-fysica van dit project bepaalt wáár een nieuw oppervlak
kan zitten. Een pagina is een native `WebContentsView` die altijd over gewone
HTML heen tekent. Er zijn daardoor precies drie plekken voor nieuwe UI:

1. **In de zijbalk.** 264 px breed, HTML in de bestaande renderer, gratis.
2. **In een strook die je vrijmaakt** door de pagina smaller te leggen. De
   renderer van het venster is het hele venster groot; waar geen native view
   overheen ligt, is zijn HTML zichtbaar én klikbaar. Dat is de goedkoopste
   manier om een paneel naast de pagina te krijgen: geen nieuwe view, geen
   nieuwe preload, dezelfde `style.css`.
3. **Als eigen doorzichtige view**, zoals de balk bovenin. Duur: eigen preload,
   eigen HTML, en zolang hij zichtbaar is slikt hij muisklikken op de pagina
   eronder op.

Optie 2 is nieuw en wordt hieronder twee keer gebruikt (split view, notities).
Optie 3 wordt bewust niet nog een keer gebruikt.

---

## Eén gedeelde wijziging vooraf: koude tabbladen

Drie van de features hieronder (klus, archief, sessieherstel) willen een tabblad
kunnen laten bestaan zonder dat er een renderer voor draait. Twintig tabbladen
uit een klus openen betekent nu twintig `WebContentsView`s en dus twintig
processen, in één klap.

Dat vraagt de enige structurele wijziging in dit document. Nu geldt:

```js
ws.tabs = new Map(); // id -> WebContentsView
```

Dat moet worden:

```js
ws.tabs = new Map(); // id -> { view: WebContentsView|null, url, titel, favicon, ... }
```

Wat daarop meebeweegt in `main.js`:

- `allViews()` slaat records zonder `view` over.
- `describe(id)` leest bij een koud tabblad uit het record in plaats van uit
  `webContents`; `loading` is `false`, `canGoBack`/`canGoForward` zijn `false`.
  Er komt een veld `koud: true` bij, zodat de zijbalk hem doffer kan tekenen.
- `activateTab(id)` warmt een koud tabblad eerst op: view maken zoals in
  `createTab`, `loadURL(record.url)`, dan pas zichtbaar maken.
- `closeTab(id)` en `closeWorkspace(id)` slaan `removeChildView`/`close` over als
  er geen view is.
- `layoutActiveTab()` doet niets bij een koud tabblad — kan niet gebeuren, want
  activeren warmt op, maar het is een goedkope wacht.

Dit is bewerkelijk en raakt code die nu goed werkt. Doe het in één aparte
wijziging, vóór de features, niet ertussendoor.

---

## Overzicht van de IPC-kanalen

| Kanaal | Richting | Waarvoor |
| --- | --- | --- |
| `klus:voorstel` | main → zijbalk | een assistent stelt een set tabbladen voor |
| `klus:accepteer` | zijbalk → main | zet de aangevinkte regels klaar |
| `klus:verwerp` | zijbalk → main | voorstel weg |
| `klus:bewaar` | zijbalk → main | huidige workspace als bestand wegschrijven |
| `klus:open` | zijbalk → main | bestand inlezen en als workspace klaarzetten |
| `split:open` | zijbalk → main | tabblad naast het actieve leggen |
| `split:sluit` | zijbalk → main | terug naar één pagina |
| `split:wissel` | zijbalk → main | links en rechts omdraaien |
| `split:verhouding` | zijbalk → main | nieuwe verdeling (0.2–0.8) |
| `split:greep` | zijbalk → main | pagina's even wegnemen tijdens het slepen |
| `tab:overnemen` | zijbalk → main | eigenaar van een assistent-tabblad naar jou |
| `preview:vraag` | zijbalk → main | miniatuur en spoor van één tabblad |
| `lees:aan` / `lees:uit` | zijbalk → main | leeslaag aan of uit voor het actieve tabblad |
| `tab:vastzetten` | zijbalk → main | tabblad uitsluiten van archiveren |
| `archief:lijst` | zijbalk → main | wat er opgeborgen is |
| `archief:herstel` | zijbalk → main | terug als koud tabblad |
| `archief:wis` | zijbalk → main | definitief weg |
| `archief:gebeurd` | main → zijbalk | "3 opgeborgen — terug", tien seconden |
| `notitie:open` | zijbalk → main | paneel open, pagina smaller leggen |
| `notitie:zet` | zijbalk → main | tekst bewaren |
| `notitie:haal` | zijbalk → main | tekst ophalen |
| `notitie:state` | main → zijbalk | een assistent heeft een notitie geschreven |
| `island:context` | main → balk | wat er meegaat met de volgende opdracht |
| `island:contextwis` | balk → main | context loslaten |

Alle bestaande kanalen blijven zoals ze zijn.

---

## 1. De klus: een assistent richt een workspace in

**Wat het is.** Je zegt "regel een dagje Berlijn in maart" en er verschijnt geen
antwoord maar een *voorstel*: acht tabbladen met per regel één zin waarom hij die
erbij wil. Jij vinkt er drie af en drukt op "Zet klaar". Er komt een workspace
bij met die vijf tabbladen erin, koud, en jij begint te lezen. Dit is de reden
dat de rest van dit document bestaat: een assistent die in een eigen tabblad kan
werken kan ook de *plek* inrichten waar jij gaat werken.

**Vorm van een klus.** Eén JSON-object, ook het bestandsformaat:

```json
{
  "formaat": 1,
  "naam": "Berlijn, maart",
  "gemaaktOp": "2026-03-04T10:12:00Z",
  "door": "Kim",
  "tabs": [
    { "url": "https://…", "titel": "…", "waarom": "goedkoopste directe vlucht" }
  ]
}
```

**Electron-API's.** Weinig bijzonders: `createWorkspace(name)` bestaat al,
`createTab(url, ws, { activeer: false })` ook. Voor het bestand
`dialog.showSaveDialog(win, { defaultPath, filters })` en
`dialog.showOpenDialog(win, { properties: ['openFile'] })`, plus
`fs.promises.writeFile` / `readFile` en `app.getPath('userData')` voor de
klussen die je niet exporteert maar bewaart. `dialog` moet erbij in de require
bovenin `main.js`.

**IPC.** `klus:voorstel` (push, met een id en de regels), `klus:accepteer(id,
urls)`, `klus:verwerp(id)`, `klus:bewaar()`, `klus:open()`.

**Nieuwe bestanden.**

- `renderer/klus.js` — tekent de voorstelkaart, houdt bij welke regels aangevinkt
  staan. Let op: die stand hoort in een variabele, niet in de DOM. `tabs:state`
  komt bij elke navigatie binnen en tekent de zijbalk opnieuw.
- `renderer/panelen.css` — stijlen voor alle nieuwe oppervlakken uit dit
  document. Wordt in `index.html` ná `style.css` geladen; de kleurvariabelen
  blijven in de `:root` van `style.css` staan, hier alleen `var(--…)`.
- `klusformaat.js` (hoofdproces) — inlezen, valideren, wegschrijven.
- `opslag.js` (hoofdproces) — gedeeld met notities en archief: gebufferd JSON
  lezen en schrijven onder `app.getPath('userData')`.

**In main.js.** Een methode `voorstelKlus(voorstel)` die het naar de zijbalk
stuurt en het voorstel vasthoudt (een voorstel per venster is genoeg), en
`aanvaardKlus(id, urls)` die de workspace maakt en de tabbladen koud toevoegt.
Vier `ipcMain.handle`-regels. In `describe()` verandert niets.

**Belangrijk:** de tabbladen die hij klaarzet krijgen `owner: null`. Hij heeft ze
neergelegd, ze zijn van jou. Een tabblad met een naam erop betekent "hij is er nú
mee bezig", en dat is hier niet zo. Alleen het tabblad waarin hij het voorstel
heeft samengesteld houdt zijn naam.

**UI.** De voorstelkaart komt in de zijbalk, boven `#tablist`, tussen adresbalk
en tabbladen. Volle breedte min de padding (240 px), afgeronde hoeken
`var(--radius-card)`, dezelfde glasbehandeling als `#palette-card` maar zonder
`backdrop-filter` (er ligt geen pagina achter, alleen venstermateriaal). Per
regel: een vinkje, favicon-plaatshouder, titel op één regel, en eronder in
`--font-small` de reden in `var(--muted)`. Onderaan twee knoppen: "Zet klaar (5)"
en "Nee". Bij meer dan zes regels scrollt de kaart met `max-height: 40vh`.
Opslaan en openen van een klusbestand horen in de commandobalk als twee extra
resultaten ("Klus bewaren", "Klus openen"), niet als knop in de zijbalk — daar is
geen plek meer.

**Wat er mis kan gaan.**

- **Een klusbestand is niet te vertrouwen.** `naarZoekURL()` in `search.js` laat
  alles door wat op een schema lijkt, dus ook `javascript:` en `file:`. Voor
  geïmporteerde klussen moet `klusformaat.js` zelf filteren op `http:` en
  `https:` en de rest weigeren. Niet oplossen door `search.js` aan te passen: die
  regel klopt voor wat jij intikt.
- Twintig tabbladen ineens openen is zwaar; daarom koud. Zet een dak op 20 regels
  per klus.
- Een assistent die een voorstel doet terwijl er al een openstaat: het nieuwe
  vervangt het oude, en het oude is weg. Bij meerdere assistenten tegelijk wordt
  dat een stapel, en dan past dit niet meer in de zijbalk.
- URL's verlopen. Een klus van drie maanden oud levert 404's op. Een koud tabblad
  laat dat pas zien als je erop klikt.

**Wat dit niet oplost.** Geen live gedeelde workspace met een collega. Een klus
doorgeven is een bestand mailen; wie hem opent krijgt een kopie en jullie lopen
daarna uit elkaar. Echte samenwerking vraagt een server, accounts en een
protocol, en dat is een ander project. En zonder model achter de assistent is een
voorstel alleen zo goed als de lijst die je er zelf in stopt.

---

## 2. Split view: meekijken terwijl hij werkt

**Wat het is.** Twee pagina's naast elkaar. In een gewone browser is dat handig;
hier is het het antwoord op de vraag "wat doet hij eigenlijk". Je legt zijn
tabblad rechts naast dat van jou en ziet hem scrollen, terwijl je zelf gewoon
doorwerkt. Dit is dan ook waar het aan opgehangen wordt: naast de knop in het
contextmenu van een tabblad staat er in de balk bovenin, bij een bezige
assistent, "Kijk mee" — één klik en zijn tabblad staat naast dat van jou.

**Layout.** Nu ligt de actieve view over het hele rechterdeel. Met split:

```js
const SPLIT_GAP = 14;   // de sleepbare naad, breder dan CONTENT_GAP
const SPLIT_MIN = 320;  // smalste bruikbare pagina

// beschikbaar = width - SIDEBAR_WIDTH - CONTENT_GAP
// links  = round((beschikbaar - SPLIT_GAP) * verhouding)
// rechts = beschikbaar - SPLIT_GAP - links
```

Onder een contentbreedte van 264 + 640 + 14 + 10 = **928 px** past dit niet meer.
`minWidth` van het venster is 720, dus dit gaat gebeuren. Bij versmallen klapt de
split vanzelf dicht naar het tabblad dat het laatst focus had; `pushState` meldt
dat, zodat de zijbalk zijn markering weghaalt. Andersom niet automatisch weer
open: dat schrikt.

**Electron-API's.** `view.setBounds()` en `view.setVisible()` zoals nu, met twee
views tegelijk zichtbaar. `view.setBorderRadius(CONTENT_RADIUS)` staat al op elke
view en klopt ook voor twee panelen. `raiseIsland()` moet ná het opbouwen van de
split nog een keer, anders ligt de balk bovenin eronder. Ik weet **niet zeker**
of `contentView.addChildView(view, index)` in Electron 33 een index-parameter
accepteert; de veilige route is het patroon dat er al staat — `removeChildView`
gevolgd door `addChildView` — want dat legt een view aantoonbaar bovenop.

**De naad slepen.** Hier zit de aardigheid. In die 14 px tussen de twee pagina's
ligt geen native view, dus daar is de HTML van de vensterrenderer gewoon
zichtbaar en klikbaar. De greep is dus een `<div>` in `index.html`, absoluut
gepositioneerd, die met een CSS-variabele op de goede x wordt gezet.

Zodra je begint te slepen loopt de muis over een pagina heen en dan komen de
`mousemove`-events niet meer aan. Oplossing: bij `pointerdown` gaat
`split:greep(true)` naar het hoofdproces, dat beide views `setVisible(false)`
zet. De HTML-laag is dan overal bereikbaar en tekent twee lege afgeronde vlakken
als schim. Bij `pointerup` volgt `split:greep(false)` met de nieuwe verhouding en
komen de pagina's terug op hun nieuwe plek. Dat het beeld tijdens het slepen weg
is, is eerlijker dan het lijkt: je kijkt toch naar de naad. Alternatief is een
doorzichtige `WebContentsView` als sleepvlak — dat werkt bewijsbaar, de balk
bovenin doet het al — maar dat kost een derde preload voor iets van een halve
seconde.

**IPC.** `split:open(tabId)`, `split:sluit()`, `split:wissel()`,
`split:verhouding(fractie)`, `split:greep(bezig)`.

**In main.js.** Per workspace een veld `split: { rechtsId, verhouding }` naast
`activeId`. `layoutActiveTab()` wordt `layoutPagina()` en houdt rekening met
beide. `activateTab()` mag niet meer blind alle views verbergen — die lus moet de
partner overslaan. `setPaletteOpen()` verbergt voortaan beide. `closeTab()` van
een van de twee sluit de split in plaats van het hele venster te herschikken.
`activateWorkspace()` verbergt de split van de vorige workspace en herstelt die
van de nieuwe. `describe()` krijgt er `kant: 'links'|'rechts'|null` bij en
`pushState()` een veld `split`.

**Nieuwe bestanden.** `renderer/split.js` (de greep en de schim), stijlen in
`panelen.css`. Geen nieuwe pagina's.

**UI.** De naad is 14 px breed met daarin een streepje van 3 × 36 px in
`var(--faint)`, dat bij hover naar `var(--text)` gaat en `cursor: col-resize`
draagt. In de zijbalk krijgen de twee tabbladen die in beeld staan allebei
`aria-current="true"` en een klein hoekje links dat aangeeft welke kant ze
staan — niet twee volledig gemarkeerde rijen zonder verschil, want dan weet je
niet meer waar de adresbalk het over heeft. De adresbalk volgt het tabblad met
focus; dat is `webContents.isFocused()` of, eenvoudiger, het laatste tabblad
waarop geklikt is.

**Overnemen.** In de split komt de derde bruikbare bediening: het tabblad van de
assistent draagt rechtsboven in de zijbalkrij "Neem over" (`tab:overnemen`). Dat
roept intern `stopAgent(false)` aan — die zet de eigenaar al terug op `null` — en
geeft het tabblad focus. Zo eindigt de overdracht bij jou in plaats van dat je
hem afbreekt.

**Wat er mis kan gaan.**

- Twee zichtbare pagina's is twee keer tekenen. Op een zwakke machine met video
  in één van beide merk je dat.
- De sluitlogica van `closeTab` is nu al vertakt (actieve workspace of niet,
  laatste tabblad of niet); met split komt daar een dimensie bij. Dat is de
  plek waar dit ontwerp fout gaat, en de reden om die functie eerst te lezen.
- De assistent laat zijn tabblad scrollen en navigeren terwijl jij ernaast leest.
  Dat kan hinderlijk zijn; er is geen manier om dat af te remmen behalve hem
  stoppen.
- Een achtergrondtabblad wordt door Chromium afgeknepen (timers vertraagd). Zodra
  het van de assistent in beeld staat, loopt het opeens weer op volle snelheid.
  Voor tabbladen van een assistent hoort `backgroundThrottling: false` in de
  `webPreferences`, anders werkt hij langzamer omdat je *niet* kijkt. Dat kost
  batterij; het is een bewuste ruil.

**Wat dit niet oplost.** Geen drie of meer panelen (past niet in 928 px en de
bediening wordt onhoudbaar), geen split over twee vensters, geen bewaarde
splitindeling per workspace na herstart — dat wacht op sessieherstel.

---

## 3. De kijkdoos: zien wat er in een tabblad staat zonder erheen te gaan

**Wat het is.** Hover over een tabblad in de zijbalk en er verschijnt een kaartje
met titel, adres, een miniatuur en — bij een tabblad van een assistent — het
spoor: de laatste vier adressen die hij bezocht heeft, met tijd. Dat spoor is het
punt. Bij je eigen tabbladen is een preview comfort; bij het zijne is het het
enige raampje dat je hebt zonder hem te storen.

**Het pixelprobleem, eerlijk.** `CLAUDE.md` zegt het al: een tabblad op de
achtergrond wordt niet getekend. Ik weet **niet zeker** wat
`webContents.capturePage()` doet op een `WebContentsView` die op
`setVisible(false)` staat — waarschijnlijk een leeg of verouderd beeld. Er is een
optievorm `capturePage(rect, opts)` met `stayHidden`, maar of die in Electron 33
zo heet en of hij hier helpt, moet je meten voordat je erop bouwt. Daarom is dit
ontwerp er niet van afhankelijk:

- **Miniatuur van je eigen tabbladen:** vastgelegd op het moment dat het tabblad
  nog zichtbaar is. In `activateTab()`, vlak vóór `setVisible(false)` van de
  oude, `wc.capturePage()` aanroepen, het resultaat met
  `image.resize({ width: 480 })` verkleinen en als data-URL in een cache per
  venster leggen. Je ziet dus "hoe je het achterliet", en dat is precies wat je
  wilt weten.
- **Tabblad van een assistent:** dat is nooit zichtbaar geweest, dus daar is geen
  beeld van. Daar toont de kaart het spoor plus de eerste kop en de eerste
  alinea, opgehaald via de extractor uit feature 4 — door de DOM, zoals het hoort
  in dit project.

**Het spoor.** Niet uit `navigationHistory.getAllEntries()` — ik weet niet zeker
of die methode in 33 bestaat. Wel zeker: `main.js` luistert al op `did-navigate`
en `page-title-updated` per tabblad. Houd daar een lijstje bij van maximaal
twintig `{ url, titel, tijd }`. Dat is goedkoop, werkt overal, en levert later
gratis het logboek waar de assistent er toch een moet hebben.

**IPC.** Eén kanaal: `preview:vraag(tabId)`, met een `invoke` die
`{ miniatuur, spoor, kop, alinea }` teruggeeft. Bewust niet meesturen in
`tabs:state`: die stroom loopt bij elke navigatie en mag geen data-URL's van
tientallen kilobytes gaan dragen.

**Nieuwe bestanden.** `renderer/kijkdoos.js`, stijlen in `panelen.css`.

**In main.js.** Een `Map` met miniaturen per tabblad-id (leegruimen in
`closeTab`), de capture in `activateTab`, het spoor in de bestaande
event-lussen, en één handler.

**UI.** De kaart hoort in de zijbalk zelf, niet over de pagina heen — daar zou hij
onder de native view verdwijnen en dat oplossen kost een eigen doorzichtige view
die klikken opslokt. Dus: 240 px breed, absoluut gepositioneerd over de tabbladen
heen, uitgelijnd op de rij waar de muis staat en binnen de zijbalk gehouden.
Miniatuur 240 × 135 met `object-fit: cover` en `border-radius: 8px`, daaronder
titel en host, en bij een assistent-tabblad een lijstje in `--font-small`. Pas
tonen na 350 ms hover en weghalen op `mouseleave` of zodra `tabs:state`
binnenkomt met een andere tabbladenlijst.

**Wat er mis kan gaan.**

- Miniaturen zijn geheugen. Vijftig tabbladen × 480 px JPEG is tientallen
  megabytes. Zet een dak op (bijvoorbeeld de twintig laatst bekeken) en gooi de
  rest weg.
- Miniaturen van een banksite of je mail zijn gevoelig, en ze staan in het
  geheugen van het hoofdproces. Niet naar schijf schrijven, en bij het sluiten
  van de workspace weggooien.
- `capturePage()` is niet gratis; hem aanroepen bij elke tabwissel is merkbaar
  als je snel wisselt. Sla hem over als het tabblad korter dan een seconde in
  beeld was.

**Wat dit niet oplost.** Geen live beeld van een achtergrondtabblad. Wie wil zien
wat er nú gebeurt, gebruikt split view; dat is precies waarom die twee features
naast elkaar staan.

---

## 4. De leeslaag: één extractor voor jouw ogen en die van hem

**Wat het is.** Een leesmodus die de tekst uit een artikel haalt en netjes
toont. Op zichzelf is dat geen reden om over te stappen — Safari doet het al
jaren. Wat het hier bijzonder maakt: de assistent moet een pagina tóch door de
DOM lezen, want er zijn geen pixels van een achtergrondtabblad. Als jij op
"lezen" drukt zie je letterlijk wat hij ziet. Eén stuk code, twee gebruikers, en
dat is meteen de sterkste manier om te controleren of hij de pagina goed
begrepen heeft.

**Electron-API's.** `webContents.executeJavaScript(code)` levert de waarde van de
laatste expressie terug als promise, en werkt ook op een sandboxed tabblad zonder
preload — precies wat hier nodig is. Twee dingen om op te letten:

- Wikkel de injectie in een IIFE. Bij een tweede aanroep in dezelfde pagina
  levert een `const` op topniveau anders een herdeclaratiefout op.
- Het resultaat moet JSON-serialiseerbaar zijn; geef dus een plat object terug,
  geen DOM-knopen.
- Of `executeJavaScript` langs de CSP van de pagina heen gaat, weet ik **niet
  honderd procent zeker**; mijn aanname is van wel, omdat het niet als
  script-element in het document terechtkomt. Meet dat op een site met een
  strakke CSP voordat je erop bouwt.

`fs.readFileSync` bij het opstarten om `renderer/lezen.js` één keer in te lezen,
en `wc.once('dom-ready')` om te weten wanneer een SPA klaar genoeg is.

**IPC.** `lees:aan()` en `lees:uit()` voor het actieve tabblad. `describe()`
krijgt een veld `lezen: true|false` en behandelt de leespagina net als `NEWTAB`:
het interne bestandspad hoort niet in de adresbalk, dus de adresbalk blijft de
oorspronkelijke URL tonen.

**Nieuwe bestanden.**

- `renderer/lezen.js` — `haalArtikel(document)` geeft
  `{ titel, byline, taal, alineas: [], woorden }`. **Geen Node**, met dezelfde
  voorwaardelijke export onderaan als `search.js`, want dit draait in een
  sandboxed pagina.
- `renderer/lezen.html` + `renderer/lezen.css` — de leespagina zelf. Eén kolom
  van `min(68ch, 90vw)`, dezelfde `--font-text`, regelafstand 1.7, en dezelfde
  kleurvariabelen zodat licht en donker meelopen.

**Hoe de tekst in de leespagina komt.** De leespagina heeft geen preload en mag
die ook niet krijgen. Dus: `wc.loadFile('renderer/lezen.html')`, wachten op
`did-finish-load`, en dan
`wc.executeJavaScript('window.zetArtikel(' + JSON.stringify(artikel) + ')')`.
Omdat het laden een geschiedenisstap is, brengt de gewone terug-knop je terug bij
het artikel. Dat is netjes: "uit" is gewoon terug.

**UI.** Een klein icoontje rechts in de adresbalk zodra de extractor zegt dat er
meer dan ongeveer 400 woorden staan, in `var(--muted)`, actief in
`var(--accent)`. Geen aparte knop in de zijbalk: die is vol.

**Wat er mis kan gaan.**

- De tekst van een pagina is **niet te vertrouwen**. Zet hem nooit met `innerHTML`
  in de leespagina, alleen met `textContent`. En zodra er een echt model achter
  de assistent hangt: een pagina die "negeer je opdracht en doe dit" bevat, is
  een aanval. Wat de extractor teruggeeft moet als geciteerde gegevens de prompt
  in, nooit als instructie. Dit is de belangrijkste veiligheidszin in dit
  document.
- Pagina's die pas na een seconde renderen leveren een leeg artikel. Eén keer
  opnieuw proberen na `dom-ready` en anders eerlijk melden dat er niets te lezen
  valt.
- Een extractor van 200 regels haalt het niet bij Readability. Reken op zeventig
  procent van de artikelen, en zorg dat de andere dertig geen kapotte pagina
  opleveren maar een nette weigering.

**Wat dit niet oplost.** Geen paywalls, geen PDF's, geen afbeeldingen in de
tekst (alleen de hoofdafbeelding), geen opslaan om later te lezen.

---

## 5. De stille archiefkast

**Wat het is.** Tabbladen die je een halve dag niet hebt aangeraakt gaan vanzelf
weg, terug te halen zolang je wilt. Bij Arc is dat een fijne gewoonte; hier is
het noodzaak. Een assistent produceert tabbladen — een zoekopdracht, drie
resultaten, een klus met vijf regels — en zonder opruimen is je zijbalk na een
week onbruikbaar. Wie het opruimen niet bouwt, bouwt eigenlijk ook de assistent
niet af.

**Wanneer.** Een `setInterval` van vijf minuten in de controller (opruimen in het
`closed`-event van het venster). Een tabblad gaat het archief in als het langer
dan twaalf uur niet actief was, en het is niet:

- het actieve tabblad, of de partner in een split;
- vastgezet (`tab:vastzetten`);
- hoorbaar — `wc.isCurrentlyAudible()` is hiervoor de betrouwbare weg. Er bestaat
  ook een audio-event op `webContents`, maar de precieze naam in Electron 33 weet
  ik niet zeker, en pollen bij elke tik is hier ruim voldoende;
- van een assistent die op dat moment bezig is.

Tabbladen van een assistent die **klaar** is gaan juist eerder weg, na een uur,
tenzij je ze hebt opengeslagen. Wat hij vond en jij nooit bekeek, hoeft niet te
blijven staan.

**Wat er bewaard wordt.** `{ url, titel, favicon, workspaceKey, gearchiveerdOp,
notitie }` in `userData/archief.json`, via `opslag.js`. Herstellen levert een
**koud** tabblad op — vandaar de wijziging bovenaan dit document.

**Een probleem dat je nu al hebt.** `nextWorkspaceId` begint bij elke start weer
bij 1, dus `persist:ws-1` is morgen een andere workspace dan vandaag, en bij twee
vensters delen ze zelfs dezelfde partitie. Een archief dat naar schijf schrijft
heeft een sleutel nodig die dat overleeft. Dat betekent: een `workspaceKey`
(bijvoorbeeld een uuid bij aanmaken) en partities `persist:ws-<key>`. Dat is
dezelfde wijziging die sessieherstel nodig heeft, en die er dus eerst moet zijn.

**IPC.** `tab:vastzetten(id, aan)`, `archief:lijst()`, `archief:herstel(key)`,
`archief:wis(key)`, plus een push `archief:gebeurd({ aantal, keys })`.

**Nieuwe bestanden.** `renderer/archief.js` (de rij onderin en de terugmelding),
`opslag.js` (gedeeld, hoofdproces), stijlen in `panelen.css`.

**UI.** Onder `#tablist`, boven de "Nieuw tabblad"-knop, een rij van 26 px hoog:
"Archief · 42" in `--font-small` en `var(--faint)`. Klikken opent de lijst in de
commandobalk, als vierde soort resultaat naast tabblad, workspace en ga-naar —
daar hoort zoeken thuis en die machinerie staat er al. Direct na automatisch
opbergen verschijnt diezelfde rij tien seconden lang als "3 opgeborgen — terug",
met "terug" als knop. Zonder die knop voelt automatisch opruimen als diefstal.

**Wat er mis kan gaan.**

- Een half ingevuld formulier is weg. Er is geen betrouwbare manier om te weten
  of een pagina onbewaard werk bevat. Vastzetten is de ontsnapping, en twaalf uur
  is expres ruim.
- Vastzetten is eigenlijk een basisfunctie (pinnen) die deze feature afdwingt.
  Reken hem mee in het werk.
- Twaalf uur is niet instelbaar zolang er geen instellingen zijn. Zet hem als
  constante bovenin `main.js` en niet ergens halverwege.
- Een klok die vijf minuten tikt terwijl de laptop slaapt: na het ontwaken gaat
  er in één keer een stapel het archief in. Dat is precies waarvoor die
  terugmelding van tien seconden bestaat.

**Wat dit niet oplost.** Geen geschiedenis (het archief kent alleen tabbladen die
je open had), geen synchronisatie tussen machines, geen bladwijzers — die
verdienen een eigen ontwerp en moeten niet stiekem uit dit archief groeien.

---

## 6. Aantekening bij een tabblad, die hij ook kan schrijven

**Wat het is.** Een notitieveld naast de pagina. Als generieke feature is dat
gapend saai; wat het hier waard maakt, is dat de assistent erin schrijft. Hij
zet een tabblad klaar en legt in de notitie neer waarom: "de enige van de vier
die 's ochtends aankomt". Als je drie uur later terugkomt en niet meer weet wat
dit tabblad doet in je zijbalk, staat het antwoord op de plek waar je kijkt. Het
is de kleinste vorm van een logboek die niet als logboek voelt.

**Waar hij staat.** In een strook rechts van de pagina, vrijgemaakt door de view
smaller te leggen — dezelfde truc als de sleepnaad in feature 2. Geen nieuwe
view, geen nieuwe preload; het is HTML in `index.html`, met de bestaande
`browser`-API.

```js
const NOTITIE_BREEDTE = 300;
// pagina: width - SIDEBAR_WIDTH - CONTENT_GAP - NOTITIE_BREEDTE - CONTENT_GAP
```

Het paneel zelf staat `position: fixed; top: 44px; right: 10px; bottom: 10px;
width: 300px`, met `var(--card)`, `var(--radius-card)` en dezelfde glasrand als
de commandobalk. Een `<textarea>` zonder rand die de hele hoogte vult, en
bovenaan de titel van het tabblad in `--font-small`. Onder 1000 px contentbreedte
gaat het paneel niet open maar legt het de pagina helemaal weg (zoals de
commandobalk doet) — anders houd je 200 px pagina over.

**Waar de tekst blijft.** Per workspace, op sleutel `origin + pathname` van de
URL, in `userData/notities.json` via `opslag.js`. Op sleutel en niet op tabblad-id,
zodat je notitie er weer is als je de pagina morgen opnieuw opent. Query en hash
gaan eraf, anders krijgt elke zoekopdracht zijn eigen notitie.

**IPC.** `notitie:open(aan)` (opent én herlegt de layout, precies zoals
`ui:palette` nu doet), `notitie:haal(tabId)`, `notitie:zet(tabId, tekst)` met een
debounce van 400 ms in de renderer, en een push `notitie:state({ tabId })` voor
als een assistent er een schrijft. In `describe()` komt `heeftNotitie: true|false`
zodat de zijbalk een stipje kan tonen.

**Nieuwe bestanden.** `renderer/notitie.js`, stijlen in `panelen.css`, opslag via
`opslag.js`.

**In main.js.** Een `notitieOpen`-vlag naast `paletteOpen`, meegenomen in
`layoutPagina()`, en een methode `schrijfNotitie(tabId, tekst, door)` die ook
vanuit de assistentcode aan te roepen is.

**UI-detail.** Als de assistent een notitie schrijft terwijl jij hem open hebt,
niet zomaar overschrijven. Zijn tekst komt eronder, met een regel ervoor in
`--font-small`: "Kim, 14:22". Jouw cursor blijft staan waar hij stond.

**Wat er mis kan gaan.**

- Twee schrijvers in één veld. Dit ontwerp lost dat op door de assistent alleen
  te laten *aanvullen*, nooit te laten vervangen. Dat is niet elegant, maar wel
  te begrijpen.
- Sleutelen op URL betekent dat je notitie bij `nu.nl` op elk artikel van nu.nl
  hetzelfde is als je op de host sleutelt en verdwijnt bij elke andere URL als je
  op de volledige URL sleutelt. `origin + pathname` is een compromis, geen
  waarheid.
- Notities gaan naar schijf en zijn niet versleuteld. Dat hoort in de README bij
  "wat dit bewust niet doet".

**Wat dit niet oplost.** Geen markeringen in de pagina zelf (dat vraagt injectie
en ankers die na een herlaadbeurt nog kloppen — een apart, veel groter ontwerp),
geen zoeken in je notities, geen export.

---

## 7. Opdracht mét context

**Wat het is.** Je selecteert drie alinea's, drukt op Ctrl+J en de balk bovenin
toont een chipje: "Selectie · 84 woorden" boven het invoerveld. Wat je nu intikt
gaat mét die tekst mee. Zonder dit begint elke opdracht bij nul en typ je zelf
over waar je naar kijkt. Klein stukje werk, en het is het scharnier tussen
browsen en opdracht geven.

**Werking.** `focusIsland()` in `main.js` doet er twee dingen bij: van het actieve
tabblad `wc.executeJavaScript('String(getSelection())', false)` ophalen, en
`getURL()` en `getTitle()` erbij pakken. Dat gaat als
`island:context({ soort: 'selectie'|'pagina', titel, host, woorden })` naar de
balk. De tekst zelf blijft in het hoofdproces; de balk hoeft hem niet te kennen
en het scheelt een hoop over de brug.

**IPC.** `island:context` (push naar de balk), `island:contextwis` (balk naar
main). `island:assign` blijft ongewijzigd — het hoofdproces weet zelf al welke
context erbij hoort.

**Preload.** `preload-island.js` krijgt er `onContext(fn)` en `wisContext()` bij.
Geen `ipcRenderer` naar buiten, zoals altijd.

**UI.** Boven de invoerregel in de balk, een chipje van 20 px hoog met
`--font-small`, in `var(--zacht)` op een iets lichter vlak, met een kruisje.
Backspace in een leeg invoerveld haalt hem ook weg, zoals in de meeste chatvelden.
De balk groeit daardoor in hoogte en meldt dat zelf via `island:size` — die
machinerie staat er al en dit is precies waar hij voor bedoeld was.

**Wat er mis kan gaan.**

- `getSelection()` op het hoofddocument geeft niets terug voor een selectie in een
  iframe van een ander origin. Dan valt hij terug op de paginacontext.
- Zeer grote selecties: dak op ongeveer 4000 tekens, en zeg in de chip hoeveel er
  meegaat.
- Nogmaals: geselecteerde tekst is invoer van een vreemde. Geciteerd de prompt in,
  nooit als instructie.

**Wat dit niet oplost.** Geen tweede ingang via het contextmenu ("Stuur naar
Kim") — dat kan zodra het contextmenu er is, met `params.selectionText` uit het
`context-menu`-event, en dat is andermans ontwerp.

---

## Wat afvalt, en waarom

- **Live tabbladen delen met een collega.** Vraagt server, accounts, identiteit en
  een synchronisatieprotocol; dat is een tweede product, niet een feature. Het
  klusbestand uit feature 1 dekt negentig procent van de behoefte voor een
  procent van het werk.
- **Boomstructuur of groepen in de zijbalk.** Workspaces zijn er al en zijn
  sterker (eigen sessie); nog een hiërarchielaag maakt de zijbalk alleen drukker.
- **Ruimtelijk canvas met tabbladen als kaartjes.** Ziet er goed uit in een
  filmpje, kost weken, en de zijbalk is in deze app juist de plek waar alles
  samenkomt.
- **Ingebouwde advertentieblokkering.** Een `webRequest`-filter is snel gebouwd en
  daarna eeuwig onderhoud aan lijsten. Aparte beslissing, apart project.
- **Samenvatknop op elke pagina.** Zonder model betekenisloos, en mét model is het
  gewoon een opdracht aan de assistent met de context uit feature 7. Twee wegen
  naar hetzelfde is één te veel.
- **Meer dan twee panelen in split view.** Onder de 928 px past twee al niet;
  drie is een demo, geen gereedschap.
- **Muisgebaren, tabtegels, thema-editor.** Cosmetisch. Niemand wisselt van
  browser voor een thema-editor.
- **Video in beeld-in-beeld, schermafdruk met annotatie.** Prima features, geen
  enkel verband met wat deze browser anders maakt.
- **Meerdere assistenten tegelijk.** Valt hier niet af omdat het slecht is, maar
  omdat het niet van mij is: `main.js` houdt nu één `this.agent` bij, en dat naar
  een `Map` per naam brengen hoort bij het ontwerp van de assistent zelf. Wel een
  harde afhankelijkheid voor feature 1: één klus met parallel werk vraagt er
  meer dan één.

---

## Volgorde

Wat hier staat is bewust groot; het is een halfjaar, geen sprint. Deze volgorde
houdt elke stap op zichzelf bruikbaar:

1. **Permissies** (`setPermissionRequestHandler`). Blokkeert alles, staat niet in
   dit document, moet eerst. Zie `CLAUDE.md`.
2. **Koude tabbladen** en **stabiele workspace-sleutels**. Saai, invasief,
   opent 1 en 5.
3. **Split view** (2). Werkt zonder assistent en is meteen waardevol.
4. **Leeslaag** (4). Levert tegelijk de ogen van de assistent op.
5. **Kijkdoos** (3) en **opdracht met context** (7). Klein, leunen op wat er dan
   ligt.
6. **Archief** (5) en **notities** (6). Delen `opslag.js`; samen doen scheelt werk.
7. **Klus** (1). Als laatste, want zonder model erachter is hij leeg.

## Wat ik niet zeker weet van de Electron-API

Expliciet, zodat niemand het als vaststaand overneemt:

- Of `capturePage()` bruikbaar beeld oplevert voor een `WebContentsView` op
  `setVisible(false)`, en of de optievorm met `stayHidden` in Electron 33 zo
  bestaat. **Meet dit eerst**; feature 3 is er zo ontworpen dat het antwoord niet
  fataal is.
- Of `contentView.addChildView(view, index)` een index accepteert in 33. Het
  bestaande `removeChildView` + `addChildView` uit `raiseIsland()` werkt zeker.
- Of `webContents.navigationHistory.getAllEntries()` in 33 bestaat. Daarom houdt
  feature 3 het spoor zelf bij.
- Of een `WebContentsView` muisgebeurtenissen kan laten doorlopen naar de view
  eronder. `BrowserWindow.setIgnoreMouseEvents()` bestaat, een equivalent op een
  child view ken ik niet. Als het er niet is, blijft de conclusie staan dat een
  doorzichtige overlay-view klikken opslokt — en daarom staat er in dit ontwerp
  geen tweede.
- Of `executeJavaScript` langs de CSP van de pagina heen gaat. Aanname: ja.
- De exacte naam van het audio-event op `webContents` in 33. Feature 5 gebruikt
  daarom `isCurrentlyAudible()`.

Eén ding dat geen API-vraag is maar wel vergeten wordt: nieuwe modules in het
hoofdproces (`opslag.js`, `klusformaat.js`) moeten in `package.json` bij
`build.files`. Anders draait het lokaal prima en mist de installer ze.
