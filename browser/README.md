# Tougather

Een browser met assistenten die naast je werken. Je geeft er een opdracht aan,
en die gaat aan de slag in zijn eigen tabblad terwijl jij in een ander tabblad
gewoon doorwerkt. Verder is het een gewone browser: tabbladen in een zijbalk,
workspaces met gescheiden sessies, echte Chromium-rendering. Eén codebase voor
macOS, Windows en Linux.

## Starten

```bash
npm install
npm start
```

## Bouwen

Deze map hoort als `browser/` in de Tougather-repo te staan. De app die in de
browser meegaat wordt gebouwd uit de repo eromheen.

```bash
npm install
npm run bouw-app
npm run dist:win
```

`bouw-app` bouwt de Tougather-app naar `app/`, zonder de serverkant en zonder de
website; `scripts/bouw-app.ps1` zegt wat er bewust buiten blijft. `dist:win`
levert daarna `dist/Tougather-Setup-0.1.0.exe` op: een installer die met één klik
in het eigen profiel installeert, zonder beheerdersrechten.

Een Mac-versie bouw je op een Mac met `npm run dist:mac`, Linux met
`npm run dist:linux`.

## Een download maken

- **Commit de broncode, niet de installer.** Een installer van tientallen
  megabytes hoort niet in git. Zet hem neer als release en laat tougather.com
  daarnaar linken.
- **Onderteken hem.** Zonder handtekening toont Windows eerst een blauw scherm
  dat de pc beschermd is, en haakt een groot deel van de mensen af. Daarvoor is
  een code-signing-certificaat nodig, of Azure Trusted Signing. Op de Mac is het
  een Apple Developer-account met notarisatie.
- **Laat hem zichzelf bijwerken.** Een browser zonder updates loopt binnen weken
  achter op beveiligingsfixes. `electron-updater` kan uit dezelfde releases lezen.
- **Houd Electron bij.** Op 14 september 2026 draait dit op Electron 33, met de
  Chromium van eind 2024; de nieuwste is 44. Voor een browser die mensen op het
  open web gebruiken is dat het eerste dat moet.

## Hoe het werkt

```
main.js            venster, workspaces, tabbladen, navigatie, assistenten
preload.js         contextBridge-API voor de zijbalk
preload-island.js  kleinere API voor de balk bovenin
renderer/          de UI zelf (gewone HTML/CSS/JS, geen build-stap)
```

Een venster is een `BrowserWindowController`. Die beheert **workspaces**, en een
workspace is een groep tabbladen met een eigen `session.fromPartition`. Daardoor
kun je in de ene workspace ingelogd zijn op je werkaccount en in de andere op je
eigen, tegelijk, zonder incognito.

Elk tabblad is een `WebContentsView` die als kindview over het rechterdeel van
het venster ligt; alleen het actieve staat zichtbaar. De zijbalk en de balk
bovenin worden getekend door twee aparte webContents. IPC-handlers leiden het
venster af uit `event.sender`, niet uit een globale variabele.

De **balk bovenin** is een eigen `WebContentsView` met een doorzichtige
achtergrond, die uit het plafond groeit. Dat moet wel: een pagina is een native
laag die altijd over gewone HTML heen tekent. Hij meet zichzelf op en geeft zijn
maat door aan het hoofdproces, want dat kan die niet raden.

Tabbladen hebben een **eigenaar**. Een tabblad van een assistent draagt zijn
naam en het gloeiende icoontje uit `renderer/glyph.js`, in de kleur van zijn
staat: rood zoeken, geel lezen, groen analyseren, blauw debuggen, oranje als hij
jou nodig heeft. Zo'n tabblad activeert zichzelf niet — jouw beeld blijft waar
het was.

De renderer heeft geen Node-toegang. Nieuwe functionaliteit gaat via een
expliciete methode in een preload, nooit door `ipcRenderer` bloot te stellen.

## De assistent

Je typt een opdracht in de balk bovenin met `Ctrl + J`. Daarna gebeurt dit:

1. De browser start de agent die op jouw computer staat, als kindproces. Nu is
   dat Claude Code.
2. Die denkt op **jouw** abonnement. Er gaat niets langs een server van ons, en
   er staat geen sleutel van ons in de weg.
3. Elke handeling die hij wil doen komt terug in deze browser, langs dezelfde
   grens als een client van buiten: vier dingen mag hij vrij in zijn eigen lege
   workspace, en alles wat jouw tabbladen raakt vraagt het elke keer opnieuw.
4. Je ziet in de balk wat hij zegt en doet, in dezelfde woorden als het logboek.

Waarom niet zelf een model aanroepen: dan betaalden wij per opdracht, en een
agent die pagina's leest en doorklikt verbrandt veel. Belangrijker nog, dan liep
jouw tekst langs onze server. Nu niet.

**Opzetten.** Niets, behalve dat de agent aangemeld moet zijn. Staat hij er, dan
vindt de browser hem en werkt het; staat hij er niet of is hij niet aangemeld,
dan zegt het scherm bij Instellingen precies welke ene regel je moet draaien. Er
is geen sleutel om te plakken en geen bestand om te bewerken: de verbinding
wordt per opdracht gelegd en gaat daarna weer dicht.

Wat de agent hier **niet** kan: een shell starten, bestanden lezen of schrijven,
of bij de MCP-servers die je elders hebt aangesloten. Dat staat allemaal uit in
de aanroep, en `shots/test-agent.mjs` plukt die aanroep uit elkaar om het na te
lopen. Zie `lib/agent.js`.

## Sneltoetsen en gebaren

| Toets | Actie |
| --- | --- |
| `Cmd/Ctrl + T` | nieuw tabblad |
| `Cmd/Ctrl + L` | naar adresbalk |
| `Cmd/Ctrl + R` | opnieuw laden |
| `Cmd/Ctrl + K` | commandobalk: tabbladen, workspaces, zoeken |
| `Cmd/Ctrl + J` | opdracht geven aan een assistent |
| `Cmd/Ctrl + 1…9` | naar de zoveelste workspace |
| `F12` | DevTools |
| `Cmd/Ctrl + ⇧ + T` | het laatst gesloten tabblad terug |
| `Cmd/Ctrl + ⇧ + O` | Tougather openen |

En met de muis: **sleep met de linkerknop naar links of rechts** om naar de
workspace ernaast te gaan. Dat werkt op een pagina en op de zijbalk. Een sleep
telt als veeg bij minstens 150 pixels zijwaarts, ruim meer zijwaarts dan omhoog,
en binnen zeven tienden van een seconde — die laatste eis doet het echte werk,
want tekst selecteren doe je langzaam. Zie `lib/gebaar.js`.

## Logische volgende stappen

- **Meerdere vensters.** De laag ligt er — `BrowserWindowController` en de
  registry — maar er is nog geen manier om een tweede venster te openen.
- **Downloads.** Luister op de sessie naar `will-download`.
- **Zoeken op de pagina.** `webContents.findInPage()`.
- **Je tabbladen over meerdere machines.** Sessieherstel schrijft nu naar deze
  computer. De stap daarna is dezelfde lijst onder je account, en daarvoor ligt
  de aansluiting klaar; zie `docs/ACCOUNTS.md`.

## Wat dit bewust niet doet

Geen wachtwoordbeheer, geen sync, geen extensies, geen Widevine (dus geen
Netflix of Spotify). Dat zijn stuk voor stuk aparte projecten; zie ze als losse
stappen, niet als iets dat je er even bij doet.
