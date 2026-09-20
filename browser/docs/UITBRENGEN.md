# Uitbrengen, ondertekenen en bijwerken

Drie dingen die aan elkaar vastzitten, in de volgorde waarin ze moeten
gebeuren. De middelste is de enige die geld kost en de enige die niet vanuit
een sessie te doen is: daar is een identiteit voor nodig, en een identiteit
hoort van een mens te zijn.

## 1. Uitbrengen — werkt

`.github/workflows/browser.yml`, met de hand gestart en met `publish_release`
aangevinkt. Hij bouwt voor macOS (twee architecturen), Windows en Linux,
controleert dat elk bestand waar de site naar linkt ook echt in de stapel zit,
en zet er een uitgave van met de tag `browser-v<versie>`.

Tags worden nooit vanuit een sessie gezet; dat doet die workflow.

## 2. Ondertekenen — jouw beurt

Deze browser is niet ondertekend. Dat is geen technische schuld maar een
ontbrekend certificaat, en de gevolgen staan op de downloadpagina:

- **Windows** toont "Windows protected your PC" bij de eerste start.
  *Meer info → Toch uitvoeren* komt erlangs.
- **macOS** weigert de app en wil dat je hem in Systeeminstellingen →
  Privacy en beveiliging goedkeurt.
- En het echte gevolg, dat niemand ziet: **er is niets te controleren.** Wie
  een installer onderschept en er iets anders voor in de plaats zet, is niet
  te onderscheiden van ons. Daarom haalt deze browser niets binnen en vervangt
  hij zichzelf niet; zie punt 3.

### Wat je nodig hebt

| Waar | Wat | Ongeveer |
| --- | --- | --- |
| Windows | Een code-signing-certificaat (OV, of EV voor minder SmartScreen) | een paar honderd euro per jaar |
| macOS | Apple Developer Program, met een *Developer ID Application*-certificaat | 99 dollar per jaar |
| Linux | Niets. AppImage en deb worden niet ondertekend verwacht | — |

### Wat je daarna instelt

Zet deze als *repository secrets* in GitHub. De workflow geeft ze al door;
zolang ze leeg zijn slaat electron-builder het ondertekenen over, en zodra ze
er staan is elke volgende build ondertekend zonder dat er een regel verandert.

| Geheim | Wat erin gaat |
| --- | --- |
| `WINDOWS_CERT` | het `.pfx`-bestand, base64-gecodeerd |
| `WINDOWS_CERT_PASSWORD` | het wachtwoord van dat bestand |
| `MAC_CERT` | het `.p12`-bestand met je Developer ID, base64-gecodeerd |
| `MAC_CERT_PASSWORD` | het wachtwoord van dat bestand |
| `APPLE_ID` | het e-mailadres van je Apple-account |
| `APPLE_APP_SPECIFIC_PASSWORD` | een app-specifiek wachtwoord, niet je gewone |
| `APPLE_TEAM_ID` | je team-id van tien tekens |

Base64 maak je zo, en het resultaat plak je als geheim — niet het bestand:

```bash
base64 -i certificaat.p12 | pbcopy      # macOS
base64 -w0 certificaat.pfx              # Linux
```

### En één regel die nog om moet

`package.json` staat klaar: `hardenedRuntime` aan en
`build/entitlements.mac.plist` erbij, want zonder die twee komt een
ondertekende Electron-app niet langs Apple. Wat er nog níét staat is
`"notarize": true` onder `mac`. Dat is met opzet: electron-builder laat de
hele mac-build stuklopen als notariseren aanstaat en de Apple-geheimen
ontbreken, en een build die kapotgaat aan iets dat nog niet bestaat is erger
dan een build zonder stempel. Zet hem erbij op het moment dat de drie
`APPLE_*`-geheimen er zijn.

## 3. Bijwerken — kijkt en zegt het, meer niet

`lib/bijwerken.js`. Hoogstens een paar keer per dag één GET naar
`api.github.com`, op zoek naar een uitgave met een hogere versie dan deze.
Staat er een, dan zegt de balk het één keer en staat het in Instellingen, met
een knop die de uitgavepagina in een tabblad opent.

Hij haalt niets binnen en vervangt niets, en dat blijft zo tot punt 2 af is.
Een programma dat zichzelf ongecontroleerd vervangt is precies het gedrag waar
een handtekening voor bestaat: zonder die handtekening kan niemand — ook wij
niet — nakijken dat wat er binnenkwam is wat wij hebben gemaakt. Een updater
bouwen vóór het ondertekenen is de verkeerde volgorde.

Wat er de deur uit gaat: je IP-adres en de versie die je draait, naar GitHub.
Niet welke pagina's je open hebt, niet wie je bent, en niets langs een server
van ons. Het staat in Instellingen en het gaat uit als je dat wilt.

`test/bijwerken.js` legt drieëndertig dingen vast zonder één byte het net op
te sturen, waaronder dat 0.10.0 nieuwer is dan 0.9.0 — dat is het geval waarin
een tekstvergelijking stilletjes het omgekeerde zegt, en precies degene die
het dan niet te horen krijgt is degene die het hardst achterloopt.

### Wat er daarna pas kan

Als er ondertekend wordt, kan dit uitgroeien tot echt bijwerken:
`electron-updater` leest een `latest-*.yml` naast de uitgave, controleert de
handtekening en vervangt de app. De workflow gooit die bestanden nu bewust weg
bij het verzamelen — "een updater die niet bestaat" staat er letterlijk bij.
Dat is de regel die dan omgaat.
