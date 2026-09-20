# De gids

Een assistent die naast je aanwijzer woont, je vraag over deze pagina
beantwoordt, en er dan naar wijst. Hij klikt niet, typt niet en navigeert niet;
hij legt uit en wijst aan.

Dit document is de stand van zaken. Het is geschreven na fase 0 en 2 en het
wordt per fase bijgewerkt.

## Wat er af is

| Fase | Wat | Stand |
| --- | --- | --- |
| 0 | Verkenning en zeven metingen | af |
| 2 | TabBridge: snapshot, refs, oplossen, scrollen, wachten op een klik | af |
| 1 | De overlay in de pagina: ring, uitleg, punt — en de deur ernaartoe | af |
| 3 | De hersens: sneltoets, model, gereedschap | af |
| 4 | Terugval op beeld | nog niet |
| 5 | Meerdere stappen | af |

## Wat fase 1 werd

Het ontwerp uit fase 0 had de buddy, de bubbel en het invoerveld in een
chrome-laag op eigen maat, en de highlight en de cursor in de pagina. Dat
eerste deel is er nog niet: er is nog geen invoerveld, want er is nog geen
hersens om iets aan te vragen (fase 3). Wat er wél is, is het deel dat op de
pagina hoort, en dat is precies het deel waar de twee lastige metingen over
gingen.

In de pagina (`lib/gids/in-pagina.js`):

- Een gastheer op `documentElement` — niet op `body`, want een pagina mag zijn
  body vervangen en dan is de overlay weg zonder dat iemand het merkt.
- Een **gesloten** shadow root eronder, met `adoptedStyleSheets`. De shadow
  root houdt de opmaak van de pagina buiten; `adoptedStyleSheets` is de enige
  manier die langs de CSP van de pagina komt (meting 2). Een `<style>` wordt
  ook binnen een shadow root geweigerd.
- `pointer-events: none` op alles. Dít is waarom de overlay in de pagina zit
  en niet in een laag erboven: een `WebContentsView` is niet klik-doorlatend
  te krijgen (meting 1), en een laag die elke klik opslokt maakt elke website
  onbruikbaar. De reeks test het: `elementFromPoint` op het midden van de knop
  levert de knop op en niet onze ring.
- Meebewegen op `scroll` en `resize`, niet op een `requestAnimationFrame`-lus.
  Een lus die altijd loopt is een lus die ook loopt als er niets gebeurt.
- Alle animatie via `el.animate`, want CSS-animaties uit een `<style>` komen
  de CSP niet door.

Aan de kant van het hoofdproces (`lib/gids/brug.js`):

- `wijs(ref, tekst)` brengt het doel eerst in beeld en wijst dan. Eerst stond
  daar `setTimeout(420)`; dat is een gok, en de gok was mis — `scrollIntoView`
  is `smooth` en op een lange pagina duurt dat langer. De reeks ving het omdat
  hij zelf 700 ms wachtte. Nu kijkt `wachtTotInBeeld` tot het zo is, met een
  dak erop voor een doel dat nooit in beeld komt.

En de draad die er nog helemaal niet was. `lib/gids/` was af, getest, en niet
aangesloten: een snapshot die niemand kon opvragen en een ring die niemand kon
laten zetten. Er staan nu drie stukken gereedschap in de MCP-deur —
`bekijk_jouw_pagina`, `wijs_aan`, `wijs_niet_meer` — met elk hun eigen vraag.

Die vragen zijn met opzet drie verschillende vragen:

| | Wat er gebeurt | Wat de vraag zegt |
| --- | --- | --- |
| `lees_jouw_pagina` | de tekst gaat naar de client | alles, ook wat achter een login staat |
| `bekijk_jouw_pagina` | de indeling gaat naar de client | koppen en knoppen, geen lopende tekst, nooit een veldwaarde |
| `wijs_aan` | er komt iets op jouw scherm bij | er gaat niets naartoe; er wordt niet geklikt of getypt |

`wijs_niet_meer` vraagt niets: er gaat alleen iets áf het scherm, en een vraag
waar "nee" het verkeerde antwoord op is, is geen vraag.

## Wat fase 3 werd

Ctrl+Shift+G, dezelfde balk bovenin waar je al een opdracht typt, met een
andere vraag erin: *Vraag iets over deze pagina*. Wat je typt gaat als
`island:vraag` naar `startGids` en die start dezelfde agent als een opdracht —
op het abonnement van de gebruiker, geen proxy, geen sleutel van ons.

Het verschil met een opdracht zit in drie dingen, en het derde is het enige
dat een echte garantie is:

1. **Een andere houding.** `GIDS_HOUDING` in `lib/agent.js`: hij legt uit en
   wijst aan, hij klikt niet, typt niet en navigeert nergens heen. Hij wijst
   precies één ding aan, en weet hij het niet, dan zegt hij dat en wijst hij
   niets aan.
2. **Een kortere lijst gereedschap.** `GIDS_GEREEDSCHAP` is vier namen:
   `jouw_paginas`, `bekijk_jouw_pagina`, `wijs_aan`, `wijs_niet_meer`. Die
   lijst gaat als `--allowedTools` mee. Let op wat er niet in staat:
   `lees_jouw_pagina` ook niet — de indeling is genoeg om iets aan te kunnen
   wijzen, en de lopende tekst van jouw pagina hoeft daar niet voor naar een
   model.
3. **Een grendel op de deur.** `mcp.beperkTot(GIDS_GEREEDSCHAP)`. Een houding
   is een instructie en een `--allowedTools` is een lijst die de client zelf
   bijhoudt; dit is het slot aan onze kant, vóór alles, nog voordat er een
   venster wordt opgezocht. Hij geldt voor de hele deur en niet per client,
   want de deur kan niet zien wie er belt — dus zet de browser hem alleen als
   hij de deur zélf voor deze ronde heeft opengedaan. Stond hij al open voor
   een eigen client van de gebruiker, dan blijft die werken en is punt 2 de
   enige beperking. Dat is eerlijker dan een grendel die stilletjes iemand
   anders afknijpt.

Het tabblad gaat als getal in de opdracht mee en wordt niet door de agent
gekozen: anders landt "waar zet ik dit uit" op een ander tabblad dan het
tabblad waar je naar keek toen je het vroeg. Een privétabblad wordt geweigerd
voordat er iets start, en een pagina van de browser zelf ook — daar valt niets
aan te wijzen dat je niet al ziet.

En de weg terug: Escape haalt de aanwijzing weg. Alleen als er iets staat,
anders zou deze browser elke Escape van elke pagina inpikken. Wegnavigeren
doet hetzelfde, want dan zat de overlay in de oude pagina.

`test/hersens.js` legt het vast, en draait zonder Electron: het gaat over de
vorm van een aanroep en over een grendel.

## Wat fase 5 werd

`wijs_stap(id, ref, tekst, stap, van)`. Hij wijst iets aan met "2 van 4"
eronder, een knop **Volgende** en een knop **Stoppen**, en hij geeft pas
antwoord als er op een van de twee gedrukt is. Daarmee is de lus van de
assistent vanzelf de lus van de gebruiker: drie stappen zijn drie aanroepen
achter elkaar, en er hoeft tussen twee aanroepen niets bewaard te worden
behalve de vraag of er doorgedrukt is.

**De voet is de enige plek in de hele overlay die een klik opvangt.** Overal
elders staat `pointer-events: none`, want een laag die elke klik op elke
website opslokt maakt die website onbruikbaar (meting 1 gaat daarover). De
uitzondering is precies zo groot als de twee knoppen, en `test/gids.js` meet
dat: terwijl een reeks openstaat levert `elementFromPoint` op het doel nog
steeds de knop van de pagina op.

**Alleen stap 1 vraagt toestemming.** Dat lijkt losser en is het niet: de
knop Volgende staat op jouw scherm, wordt door jou ingedrukt, per stap, met
Stoppen ernaast. Vijf keer dezelfde vraag zou strenger lijken en slapper
zijn — vijf vragen achter elkaar leert mensen doorklikken. De regel die
bepaalt wanneer een stap zonder vraag mag staat in `lib/gids/reeks.js`, als
gewone functie zonder venster en zonder pagina, en `test/hersens.js` probeert
hem uit: een stap op een ander tabblad, een stap die er een overslaat, een
reeks die ineens langer wordt, en een stap waarvoor niemand op Volgende heeft
gedrukt worden allemaal geweigerd.

Wachten heeft een dak: twee minuten. Daarna komt er `te laat` terug en is de
uitleg voorbij. Dat is geen keuze maar een noodzaak — een Promise in een
pagina blijft na wegnavigeren openstaan (zie de kop van `brug.js`).

En `stand()` geeft sindsdien de plek van de knop Volgende terug. Dat is de
enige plek van deze laag die een klik opvangt, dus het is ook de enige plek
waarvan de buitenkant mag weten waar hij ligt — om ernaar te kunnen wijzen,
en om hem te kunnen testen met een echte muisgebeurtenis.

## De zeven metingen

Alles hieronder is gemeten op Electron 33.4.11, niet gelezen of aangenomen. De
eerste twee hebben het ontwerp veranderd.

### 1. Een `WebContentsView` is niet klik-doorlatend te krijgen

`setIgnoreMouseEvents` bestaat alleen op `BaseWindow` en `BrowserWindow`. Op
`View` en `WebContentsView` niet — de hele eigen API van `WebContentsView` is
`setBackgroundColor`, `setBorderRadius` en `webContents`.

Dat sluit de voor de hand liggende overlay uit: een schermvullende doorzichtige
view over de pagina slokt élke klik op élke website op. `main.js:709` wist dat
al en lost het voor de balk bovenin op door hem in rust op 0×0 te zetten.

**Gevolg voor het ontwerp.** De buddy, de bubbel en het invoerveld komen in een
chrome-laag op eigen maat — dezelfde truc als de balk. De highlight, het label
en de vliegende cursor komen ín de pagina. Dat laatste is niet alleen een
uitwijk maar ook het betere antwoord; zie meting 5.

### 2. De CSP van de bezochte pagina geldt ook voor ons

Getest tegen een pagina met `style-src 'self'`, vanuit de isolated world:

| Manier | Zonder CSP | Met `style-src 'self'` |
| --- | --- | --- |
| `<style>` in een shadow root | werkt | **geblokkeerd** |
| `<style>` in `document.head` | werkt | **geblokkeerd** |
| `el.setAttribute('style', …)` | werkt | **geblokkeerd** |
| `adoptedStyleSheets` met een `CSSStyleSheet` | werkt | **werkt** |
| `el.style.setProperty(…)` | werkt | **werkt** |
| Web Animations (`el.animate`) | werkt | **werkt** |

Een shadow root beschermt dus niet tegen de CSP van de pagina; alleen CSSOM
komt erlangs. Alle opmaak van de gids in een pagina moet via
`adoptedStyleSheets` en `style.setProperty`, en alle animatie via
`el.animate`.

Dat is precies de discipline die de browser voor zijn eigen chrome al aanhoudt
(`CLAUDE.md`: `el.style.setProperty` mag, `setAttribute('style')` niet). De
regel die we onszelf hadden opgelegd blijkt de regel te zijn die het web ons
oplegt.

### 3. Beeld naar het model

Onbeslist. `mcp/tougather-mcp.mjs:49` geeft altijd `content: [{ type: 'text' }]`
terug; MCP kent ook `{ type: 'image', data, mimeType }`, dus onze kant is een
kleine wijziging. Of Claude Code beeld uit een MCP-resultaat dóórgeeft aan het
model is niet getest — daarvoor is een aangemelde agent nodig. **Fase 4 begint
met die meting, niet met code.**

### 4. Wat onze eigen laag kost

Een kindproces starten dat één regel `stream-json` uitspuugt en stopt:
**262–291 ms**. Dat is de bodem van onze kant, vóór Claude Code zelf opstart en
vóór het model iets zegt. De eis "eerste woord binnen 1,5 s" uit de spec is
daarmee niet vanzelfsprekend; meet hem op een machine met een aangemelde agent
voordat je hem belooft.

### 5. Zoom zit in `devicePixelRatio`, niet in de rects

| `setZoomLevel` | `zoomFactor` | `innerWidth` | `devicePixelRatio` | rect van dezelfde knop | maat van de view |
| --- | --- | --- | --- | --- | --- |
| 0 | 1 | 1180 | 1 | 8,127,58,21 | 1180×740 |
| 2 | 1.44 | 819 | 1.44 | 8,127,57,20 | 1180×740 |
| −2 | 0.694 | 1699 | 0.694 | 8,129,57,19 | 1180×740 |

`getBoundingClientRect()` blijft in CSS-pixels van de gezoomde pagina; de
native laag verandert niet mee. Een chrome-overlay moet dus elke coördinaat
vermenigvuldigen met `getZoomFactor()` en optellen bij `paginaBounds()`. Een
overlay ín de pagina hoeft niets. Tweede argument voor dezelfde keuze als
meting 1.

### 6. Een snapshot is goedkoop genoeg

Op een pagina met ~2100 interactieve knopen: **eerste 37–60 ms, daarna
19–56 ms**. `MutationObserver` en `document.elementFromPoint` werken gewoon in
een preload met `sandbox: true`.

Dat is ná een herschrijving. De eerste versie deed 178 ms, en dat kwam door
twee dingen: `getComputedStyle` per element (nu `el.checkVisibility()`, één
aanroep) en de naam plus `elementFromPoint` voor álle knopen in plaats van
alleen voor de driehonderd die het halen. Zie "twee rondes" hieronder.

### 7. Een sandboxed preload kan niets inladen

Geen buurbestand, geen `node:path`. Alleen `require('electron')`. En er is geen
build-stap in dit project.

Dat lijkt te dwingen tot alles-in-één-bestand-dat-altijd-meeloopt. Dat hoeft
niet, en de uitweg is meting 7b:

```
executeJavaScriptInIsolatedWorld(1000, [{ code }])
  ziet de DOM                                   ja
  wat je erin zet blijft staan tussen aanroepen  ja  (41 → 42)
  de pagina ziet het                            nee (undefined)
  het ziet de wereld van de preload             nee
  een Promise lost later alsnog op              ja  (302 ms voor een klik na 300 ms)
  een Promise die nooit oplost, na navigatie    blijft openstaan — een lek
```

Daarmee blijven bestanden gewoon bestanden: het hoofdproces leest
`in-pagina.js` van schijf en spuit het in bij de eerste vraag. En het levert de
belofte op die het product nodig heeft — **er staat niets in een pagina tot de
gebruiker erom vraagt**.

## Hoe het in elkaar zit

```
hoofdproces                              in de pagina (isolated world 1000)
───────────                              ──────────────────────────────────
lib/gids/brug.js                         lib/gids/in-pagina.js
  brugVoor(webContents)                    globalThis.__gids
  · laadt in bij de eerste vraag  ───────► · maakSnapshot()
  · zet een klok op elke aanroep            · zoek(ref)
  · sluit alles bij een navigatie           · hermatch(ref)
  · zoek(): hermatcht een kwijte ref        · scrollNaar(ref)
                                            · wachtOpKlik(ref, ms)
main.js
  ipcMain gids:snapshot / :zoek / :scroll
preload.js
  browser.gids.*
```

**Er is geen `ipcRenderer` in wereld 1000.** Alles is vraag-en-antwoord. Een
gebeurtenis uit de pagina — de gebruiker klikt op het doel — komt omhoog als
een Promise die later oplost. Dat werkt (meting 7b), maar een Promise die nooit
oplost blijft ook na wegnavigeren openstaan. Daarom heeft elke aanroep een klok
en sluit elke navigatie af wat er nog openstond. `test/gids.js` bewijst allebei.

## Het snapshotformaat

```
page: "Schaduw en frames"  url: 127.0.0.1/schaduw.html  viewport: 1280x800  scroll: 0/800
- main [ref=e1] rect=8,21,1264,248
- heading "Schaduw" [ref=e2] rect=8,21,1264,37
- button "Gewone knop" [ref=e3] rect=8,80,98,21
- button "In de schaduw" [ref=e4] [in shadow] rect=8,101,102,21
- button "In het frame" [ref=e5] [in frame "Eigen frame"] rect=16,130,87,21
- iframe "Chat van elders" [ref=e6] [cross-origin] rect=336,162,204,104
```

**Plat, met markers, en niet ingesprongen.** De spec tekent het met inspringing
als nesting. Dat kan hier niet eerlijk: `e4` staat in de shadow root van een
`div` die náást `e3` staat, en ingesprongen zou het lezen alsof de ene knop in
de andere zit. Een model dat dat gelooft wijst naar de verkeerde. Dus: één
regel per knoop, en waar hij vandaan komt staat er met zoveel woorden bij.

**Een landmark heeft geen naam tenzij iemand er een gaf.** `main` mag zijn naam
niet uit zijn eigen tekst halen; dat is de hele sectie eronder. Een kop wel —
een kop ís zijn tekst.

**Twee rondes.** Eerst het goedkope werk voor alles: maat, zichtbaarheid, waar
het staat. Dan afkappen op driehonderd. Pas daarna het dure werk voor wat
overblijft: de naam, de vlaggen, en of er iets overheen ligt. Dat is het
verschil tussen 178 ms en 37 ms.

## Wat er niet in een snapshot komt

- **De waarde van een invoerveld. Nooit, van geen enkel veld.** Niet omdat
  wachtwoorden bijzonder zijn, maar omdat een half ingevuld formulier dat
  niemand verstuurd heeft niemands zaken is. Hoe het veld heet gaat wel mee,
  want daar wijst de gids naar.
- De zoekvraag uit het adres. `?q=…` gaat eraf.
- Elke tekst boven de tachtig tekens, afgekapt.
- Alles boven de driehonderd knopen, met `[+N knopen weggelaten]` erbij.
- Een gesloten shadow root. Die is met opzet dicht.
- De inhoud van een frame van een andere herkomst. Dat wordt één knoop met
  `[cross-origin]`, zodat de gids er tenminste naar kan wijzen.

## De belofte van `tabblad-preload.js` verschuift, en dit is hoe

Dat bestand zegt in zijn eigen kop: er komt niets de pagina in, en er gaan
alleen drie getallen naar buiten. Dat blijft waar voor de veeg, en het blijft
waar voor elke pagina waar de gids nooit voor geopend wordt — `in-pagina.js`
wordt pas ingeladen bij de eerste vraag, is na een navigatie weer weg, en is
voor de pagina zelf onzichtbaar.

Wat verschuift: als je de gids wél opent, leest hij de structuur van de pagina.
Niet de inhoud van je velden, niet je adres met vraag erachter, en niets dat
bewaard wordt. Dat hoort in `CLAUDE.md` onder "wat niet mag verschuiven" te
staan voordat fase 3 begint, en met de indicator uit de spec §2.2 erbij.

## Testen

```bash
npm run test:gids      # Electron, echte pagina's
npm run test:hersens   # gewoon node
```

`test:gids` draait Electron met echte fixtures achter een echte server met
echte CSP-koppen. 55 asserties: shadow roots, frames van dezelfde en van een
andere herkomst, onder de vouw, bedekt, een ref die verouderd is, wachten op
een klik, navigeren met iets dat openstaat, onzichtbaarheid voor de pagina, de
tijd op tweeduizend knopen, de overlay zelf, een uitleg in stappen met een
echte muisklik op de knop Volgende, en alle redactieregels hierboven.

Er staat geen nagebouwde DOM in. Shadow roots, frames, rects en
`elementFromPoint` zijn precies de vier dingen waarover een nabootsing het eens
is met zichzelf en oneens met Chromium.

`test:hersens` heeft geen Electron nodig: 38 asserties over de vorm van de
aanroep die een gidsronde start, over wat er niet in zijn lijst gereedschap
staat, over de regel die bepaalt wanneer een volgende stap zonder vraag mag,
en over de grendel op de deur.

Op een machine die als root draait heeft Electron `--no-sandbox` nodig, en een
venster dat niet vooraan staat tekent geen frames:

```bash
xvfb-run -a npx electron --no-sandbox --disable-backgrounding-occluded-windows test/gids.js
```

## Wat hierna moet, in volgorde

1. **Fase 4** begint met meting 3, niet met code: geeft Claude Code beeld uit
   een MCP-resultaat door aan het model? Zolang dat niet gemeten is, is een
   terugval op een schermafdruk een plan en geen oplossing. Daar is een
   aangemelde agent voor nodig, dus dat is werk voor een machine die er een
   heeft.

En twee dingen die eerst ergens anders moeten landen: de sneltoets hoort in
`lib/sneltoetsen.js` (ROUTEKAART §1.3) en de chrome-laag in de stapelvolgorde
van `lib/layout.js` (§1.9); geen van beide bestaat nog. De gids gebruikt
zolang `bindSneltoetsen` en de balk bovenin, en dat is een tijdelijke plek en
geen ontwerp.

Wat fase 3 níét werd, en met opzet: er is geen eigen invoerveld naast de
aanwijzer en geen buddy in een chrome-laag op eigen maat. De balk bovenin is
al de plek waar je tegen de assistent praat; een tweede veld op dezelfde vraag
is een tweede plek om te leren kennen.
