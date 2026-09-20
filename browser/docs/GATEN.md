# Wat er nog niet is

De stand van zaken, bijgewerkt bij elke wijziging die er iets aan verandert.

`CLAUDE.md` heeft ook een lijstje "Bekende gaten". Dat is verouderd — het
noemt Electron 33 en zegt dat zoeken op de pagina, een downloadscherm en
geschiedenis niet gebouwd zijn. Die drie zijn er inmiddels, en de Electron in
`package.json` is 44. Dit bestand is de lijst die klopt; het andere is niet
bijgewerkt omdat aan `CLAUDE.md` niet geraakt wordt in deze sessies.

## Wel gebouwd, sinds dat lijstje

| Wat | Waar | Reeks |
| --- | --- | --- |
| Zoeken op de pagina (Ctrl+F) | `main.js`, `renderer/app.js` | `test/zoeken.js`, 12 |
| Downloads met voortgang | `lib/downloads.js` | `test/downloads.js`, 21 |
| Geschiedenis (Ctrl+H) | `lib/geschiedenis.js` | `test/geschiedenis.js`, 30 |
| De gids: vraag over deze pagina (Ctrl+Shift+G) | `lib/gids/`, `main.js` | `test/gids.js` 75, `test/hersens.js` 45 |
| De gids legt iets uit in stappen | `lib/gids/reeks.js`, `wijs_stap` | idem |
| De gids praat terug in een wolkje bij je aanwijzer, en je kunt doorvragen | `lib/gids/in-pagina.js` | idem |
| Eigen API-sleutel als tweede rug | `lib/api.js`, `lib/sleutel.js` | `test/api.js`, 34 |
| Meerdere vensters (Ctrl+N), en herstel per venster | `main.js`, `lib/herstel.js` | `test/vensters.js` 29, `test/vensters-echt.js` 9 |
| Alle sneltoetsen op één plek, en in beeld | `lib/sneltoetsen.js` | `test/toetsen.js`, 28 |
| Nederlands en Engels, en een eerste scherm dat het vraagt | `renderer/taal.js` | `test/taal.js` 26, `test/taal-echt.js` 20 |
| Zeggen dat er een nieuwere versie is | `lib/bijwerken.js` | `test/bijwerken.js`, 33 |

## Wat meerdere vensters nog niet doen

Ctrl+N opent er een, de commandobalk heeft er een regel voor, en bij het
starten komt elk venster terug zoals het stond. Wat er niet is:

- Een tabblad van het ene venster naar het andere slepen.
- Eén MCP-deur voor alle vensters. Elk venster heeft er nu een eigen, met een
  eigen poort. Voor een client die twee vensters tegelijk wil bedienen is dat
  te weinig, en voor één client is het te veel.
- Een venster heropenen dat je net sloot. Ctrl+Shift+T gaat over tabbladen.

## Wat er echt nog niet is

- **Extensies.** Electron kan een deel van MV2/MV3 laden, maar wat mensen
  bedoelen met "mijn extensies werken" is de hele API en een winkel erachter.
  Dat is geen avond werk en ook geen week; het is een eigen project. Er staat
  liever niets dan een halve ondersteuning waar je pas achter komt als je
  blocker stilletjes niets doet.
- **Ondertekenen.** Geen certificaat, dus Windows en macOS waarschuwen bij de
  eerste start — en, belangrijker, er valt niets na te kijken aan wat je
  binnenhaalt. Dit is het enige punt op deze lijst dat geld kost en niet
  vanuit een sessie te doen is. Wat er precies nodig is en waar het ingesteld
  wordt staat in `docs/UITBRENGEN.md`; de bouwstraat geeft de geheimen al
  door, dus zodra ze er staan is elke volgende build ondertekend.
- **Echt bijwerken.** Hij zégt nu dat er een nieuwere versie is, maar haalt
  niets binnen en vervangt niets. Dat is met opzet zolang er geen handtekening
  is: een programma dat zichzelf ongecontroleerd vervangt is precies waar een
  handtekening voor bestaat. `electron-updater` kan erop volgen, en dan gaat
  ook de regel om die `latest-*.yml` nu weggooit.
- **DRM-video.** Widevine zit er niet in; dat is een licentiekwestie.
- **Wachtwoordbeheer en synchronisatie.** Met opzet niet, voorlopig.
- **De gids, fase 4.** Terugval op beeld begint met een meting die een
  aangemelde agent nodig heeft: geeft Claude Code beeld uit een MCP-resultaat
  door aan het model? Zolang dat niet gemeten is, is het een plan en geen
  oplossing. Zie `docs/gids/ARCHITECTUUR.md`.
- **De browser is alleen MCP-server.** Dat de assistent via de browser bij
  ánder gereedschap kan, is niet gebouwd.
- **Twee talen en niet meer.** Nederlands en Engels. Een derde erbij is nu
  een lijst met zinnen en geen verbouwing, maar hij staat er niet.
- **Een nieuw tabblad dat al openstond wisselt niet mee.** Die pagina draait
  zonder preload — geen enkele deur naar de browser — dus zijn taal komt in
  het adres mee. Verversen helpt; automatisch verversen zou betekenen dat de
  browser onder je handen pagina's herlaadt.

## Hoe je alles draait

```bash
npm run test:gids
npm run test:inloggen
npm run test:zoeken
npm run test:downloads
npm run test:geschiedenis
npm run test:api
npm run test:bijwerken       # zonder Electron en zonder netwerk
npm run test:hersens         # zonder Electron
npm run test:toetsen         # zonder Electron
npm run test:taal            # zonder Electron
npm run test:vensters        # zonder Electron
npm run test:taal-echt       # start de hele app en praat via de debugpoort
npm run test:vensters-echt   # start de hele app en praat via de debugpoort
```

Als root heeft Electron `--no-sandbox` nodig, en een venster dat niet vooraan
staat tekent geen frames:

```bash
xvfb-run -a npx electron --no-sandbox --disable-backgrounding-occluded-windows test/gids.js
```
