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
| De gids: vraag over deze pagina (Ctrl+Shift+G) | `lib/gids/`, `main.js` | `test/gids.js` 45, `test/hersens.js` 25 |
| Eigen API-sleutel als tweede rug | `lib/api.js`, `lib/sleutel.js` | `test/api.js`, 34 |

## Wat er echt nog niet is

- **Extensies.** Electron kan een deel van MV2/MV3 laden, maar wat mensen
  bedoelen met "mijn extensies werken" is de hele API en een winkel erachter.
  Dat is geen avond werk en ook geen week; het is een eigen project. Er staat
  liever niets dan een halve ondersteuning waar je pas achter komt als je
  blocker stilletjes niets doet.
- **Meerdere vensters.** Architectonisch kan het — alle vensterstand zit in
  `BrowserWindowController` en de registry kent er meer dan één. Wat er eerst
  moet gebeuren: workspace-ids zijn nu per venster en een partitie heet
  `persist:ws-<id>`. Twee vensters zouden dus dezelfde sessie delen voor twee
  verschillende workspaces, en dat breekt de belofte dat een workspace een
  eigen sessie is. De teller moet eerst globaal worden, en het herstelbestand
  moet daar tegen kunnen.
- **Ondertekenen en bijwerken.** Geen certificaat, geen updater. Voor een
  browser op het open web is dat het eerste werk.
- **DRM-video.** Widevine zit er niet in; dat is een licentiekwestie.
- **Wachtwoordbeheer en synchronisatie.** Met opzet niet, voorlopig.
- **De gids, fase 4 en 5.** Terugval op beeld begint met een meting die een
  aangemelde agent nodig heeft (geeft Claude Code beeld uit een MCP-resultaat
  door aan het model?), en meerdere stappen achter elkaar vraagt iets dat de
  stand vasthoudt tussen twee aanroepen. Zie `docs/gids/ARCHITECTUUR.md`.
- **De browser is alleen MCP-server.** Dat de assistent via de browser bij
  ánder gereedschap kan, is niet gebouwd.
- **De zijbalk is Nederlands.** `renderer/` en `main.js` kennen geen i18n,
  terwijl de site Engels is. Wie de browser downloadt komt in een andere taal
  terecht dan de pagina waar hij op klikte.

## Hoe je alles draait

```bash
npm run test:gids
npm run test:inloggen
npm run test:zoeken
npm run test:downloads
npm run test:geschiedenis
npm run test:api
npm run test:hersens     # de enige zonder Electron
```

Als root heeft Electron `--no-sandbox` nodig, en een venster dat niet vooraan
staat tekent geen frames:

```bash
xvfb-run -a npx electron --no-sandbox --disable-backgrounding-occluded-windows test/gids.js
```
