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
| 1 | De overlay: buddy, cursor, highlight, bubbel | nog niet |
| 3 | De hersens: sneltoets, model, gereedschap | nog niet |
| 4 | Terugval op beeld | nog niet |
| 5 | Meerdere stappen | nog niet |

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
npm run test:gids
```

Draait Electron met echte fixtures achter een echte server met echte
CSP-koppen. 37 asserties: shadow roots, frames van dezelfde en van een andere
herkomst, onder de vouw, bedekt, een ref die verouderd is, wachten op een klik,
navigeren met iets dat openstaat, onzichtbaarheid voor de pagina, de tijd op
tweeduizend knopen, en alle redactieregels hierboven.

Er staat geen nagebouwde DOM in. Shadow roots, frames, rects en
`elementFromPoint` zijn precies de vier dingen waarover een nabootsing het eens
is met zichzelf en oneens met Chromium.

## Wat hierna moet, in volgorde

1. **Fase 1, de overlay.** Chrome-laag op eigen maat voor de buddy; in de
   pagina voor de highlight, en dan alleen met `adoptedStyleSheets`.
2. **Fase 3, de hersens.** Vier gereedschappen op de bestaande MCP-brug —
   `wijs_aan`, `scroll_naar`, `vraag_schermafdruk`, `niet_gevonden` — en géén
   proxy. De assistent blijft op het abonnement van de gebruiker.
3. **Fase 4** begint met meting 3, niet met code.

En drie dingen die eerst ergens anders moeten landen: de sneltoets hoort in
`lib/sneltoetsen.js` (ROUTEKAART §1.3), de chrome-laag hoort in de
stapelvolgorde van `lib/layout.js` (§1.9), en geen van beide bestaat nog.
