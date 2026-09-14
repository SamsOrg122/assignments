# Tougather Browser

Een desktopbrowser op Electron. Tabbladen in een zijbalk, workspaces met
gescheiden sessies, de Tougather-app ingebouwd, en een assistent die denkt op
het abonnement van de gebruiker en per handeling toestemming vraagt.

Deze map hoort als `browser/` in de Tougather-repo te staan; de app die erin
meegaat wordt gebouwd uit de repo eromheen.

## Commando's

```bash
npm install
npm start          # electron .
npm run bouw-app   # de Tougather-app naar app/, uit de map erboven
npm run dist:win   # installer in dist/; dist:mac alleen op een Mac, dist:linux
```

`dist:*` weigert als `app/` ontbreekt: zonder die map pakt electron-builder een
browser in met een 404 waar Tougather hoort.

## Architectuur

```
main.js                      hoofdproces: venster, workspaces, tabbladen, layout, assistent
preload.js                   contextBridge-API voor de zijbalk
preload-island.js            kleinere API voor de balk bovenin
renderer/                    de UI: gewone HTML/CSS/JS, geen framework, geen build-stap
renderer/tabblad-preload.js  loopt in elke pagina mee, alleen voor de veeg; stelt niets bloot
lib/grendel.js               permissies en navigatie: wat een pagina mag
lib/app-schema.js            tougather://: app/ als origin, /api door naar www.tougather.com
lib/mcp.js                   de deur voor een AI-client en de lijst gereedschap
lib/toestemming.js           één vraag tegelijk, per handeling, een minuut geldig
lib/agent.js                 de assistent: de agent op deze computer, op het abonnement van de gebruiker
lib/inloggen.js              aanmelden met Google via een gewoon tabblad; de useragent
lib/herstel.js               sessieherstel; lib/sessies.js opgeslagen sessies
lib/gebaar.js                wat een veeg is; lib/menu.js het contextmenu
lib/voorkeuren.js            voorkeuren op schijf, atomair geschreven
mcp/                         de brug die een client zelf start; bij het bouwen uitgepakt uit app.asar
app/                         bouwresultaat van de Tougather-app; niet in git
docs/VEILIGHEID.md           waar de grens ligt en waar hij niet tegen beschermt
docs/ACCOUNTS.md             accounts en Google, en wat de eigenaar zelf moet aanzetten
```

Een venster is een `BrowserWindowController`; alle vensterstate zit daarin. De
IPC-handlers leiden het venster af uit `event.sender` via de registry `windows`,
die alleen de zijbalk en de balk kent. Iets dat uit een pagina komt, zoals de
veeg, zoekt zijn venster met `controllerVanLaag`.

Een workspace is een groep tabbladen met een eigen `session.fromPartition`.
Elk tabblad is een `WebContentsView`, een native laag waar geen CSS op werkt:
layout en animatie gaan met de hand via `setBounds` (`paginaBounds`, `helften`,
`schuifWissel`). De balk bovenin is een eigen doorzichtige view, want een
overlay in de zijbalk zou onder de pagina verdwijnen.

State stroomt één kant op: `pushState()` stuurt alles naar de zijbalk, die
opnieuw tekent. UI-stand die een hertekening moet overleven hoort in een
variabele, niet in de DOM.

## Wat niet mag verschuiven

Dit is de belofte van het product. Wie hier iets aan verandert, verandert wat de
browser de gebruiker belooft.

- **Privé is privé.** Een privéworkspace heeft een partitie zonder `persist:`,
  komt niet in het herstelbestand, komt niet terug met Ctrl+Shift+T, en bestaat
  niet voor een MCP-client of de assistent.
- **De assistent en een client werken in hun eigen workspace**, zonder logins.
  Alles wat de tabbladen van de gebruiker raakt vraagt per handeling; wachtwoord-
  en betaalvelden nooit. Geen "altijd toestaan".
- **De assistent start met zijn eigen gereedschap uit**: `--tools ""`,
  `--strict-mcp-config`, alleen `mcp__tougather__*` toegestaan, geen sessie op
  schijf. `test-agent.mjs` plukt die aanroep uit elkaar.
- **Geen sleutels in de browser.** `/api` blijft op de server; alleen de
  anonieme Supabase-sleutel komt hier.
- **De terugkomst van aanmelden** wordt alleen aangenomen uit het tabblad dat de
  browser er zelf voor opende, binnen een kwartier. Anders is het sessiefixatie.

## Conventies

- Geen frontend-framework en geen build-stap voor de renderer. Stel React of een
  bundler niet voor zonder te vragen.
- `contextIsolation: true` en `nodeIntegration: false` blijven aan. Nieuwe
  functionaliteit gaat via een expliciete methode in een preload.
- Commentaar is Nederlands en legt uit *waarom*, niet *wat*.
- IPC-kanalen heten `domein:actie`.
- Kleuren staan als tokens in `renderer/tokens.css`. De CSP staat geen
  style-attributen toe: `el.style.setProperty` mag, `setAttribute('style')` niet.
- Code die de zijbalk en een tabblad delen (`search.js`, `glyph.js`) gebruikt
  niets van Node.

## Toetsen

Een venster dat niet vooraan staat tekent geen frames, en een venster achter een
ander venster rekent zijn opmaak niet meer bij. `requestAnimationFrame`,
CSS-overgangen, smooth scroll en `innerWidth` na een `setBounds` liegen dan.
Start de app in een reeks daarom met `--disable-backgrounding-occluded-windows`,
en meet via de debugpoort aan iets dat geen frames nodig heeft.

Een ingespoten toetsaanslag via CDP bereikt `before-input-event` niet; een
ingespoten muisgebeurtenis bereikt de DOM wel. Stuur de muisgebeurtenissen van
één veeg in één keer, anders zitten er seconden tussen.

Start in een reeks nooit een echte agent: zet `TOUGATHER_AGENT` op een
programma dat een vaste stroom uitspuugt.

De reeksen zelf staan nog buiten deze map, met vaste paden van de machine waarop
ze gemaakt zijn.

## Bekende gaten

- Electron 33, met de Chromium van eind 2024. Voor een browser op het open web
  is bijwerken het eerste werk.
- Niet ondertekend, en er is geen automatisch bijwerken.
- Nog niet gebouwd: zoeken op de pagina, een eigen downloadscherm,
  geschiedenis, extensies. Favorieten zijn er wel.
- Meerdere vensters kan architectonisch, maar er is geen manier om er een te
  openen.
- De browser is alleen MCP-server. Dat de assistent via de browser bij ander
  gereedschap kan, is niet gebouwd.
