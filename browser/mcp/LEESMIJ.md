# Een AI-client op deze browser aansluiten

Hiermee kan Claude Desktop, Claude Code of een andere client die het Model
Context Protocol spreekt deze browser bedienen. Met jouw abonnement, dus zonder
kosten per opdracht.

## Aanzetten

1. Open Tougather Browser, ga naar Instellingen en zet **Verbinding openzetten**
   aan bij *Verbinding met een AI-client*.
2. Kopieer de configuratie die daar verschijnt en zet die in het
   configuratiebestand van je client. Voor Claude Desktop is dat
   `%APPDATA%\Claude\claude_desktop_config.json`.
3. Herstart je client.

De configuratie ziet er zo uit, met het echte pad van jouw installatie:

```json
{
  "mcpServers": {
    "tougather": {
      "command": "node",
      "args": ["C:\\pad\\naar\\sidebar-browser\\mcp\\tougather-mcp.mjs"]
    }
  }
}
```

Er staat met opzet geen sleutel in. De browser maakt er per keer een aan en zet
die in `%APPDATA%\tougather\mcp-verbinding.json`, dat verdwijnt zodra je de
verbinding sluit. Een oude configuratie kan dus nooit een deur openen die jij
hebt dichtgedaan.

**Elke zitting begint dicht.** Start je de browser opnieuw, dan staat de
verbinding weer uit, ook als je hem gisteren aan had. Dat is geen vergeetachtig-
heid maar het punt: een deur naar buiten die zichzelf opent is een deur die op
een dag openstaat zonder dat iemand daarvoor koos.

## Wat een client kan

Vijf dingen die vrij zijn. Vier ervan raken alleen zijn eigen lege workspace;
de vijfde geeft titels van jouw tabbladen en geen inhoud, want zonder te weten
wát er open staat kan een client niet eens een zinnige vraag stellen.

| Gereedschap | Wat het doet |
| --- | --- |
| `open_pagina` | Opent een http- of https-adres en geeft de titel terug |
| `lees_pagina` | Geeft de leesbare tekst van een geopende pagina |
| `lijst_paginas` | Welke pagina's de client zelf open heeft |
| `sluit_pagina` | Sluit er één |
| `jouw_paginas` | De titels van jouw tabbladen, zonder inhoud |

En drie die jouw kant raken. Die vragen **elke keer** toestemming:

| Gereedschap | Wat de vraag laat zien |
| --- | --- |
| `lees_jouw_pagina` | Welke pagina, welk adres, welke workspace |
| `klik` | Op welke tekst geklikt wordt, en op welke pagina |
| `typ` | Welk veld, welke tekst, op welk adres |

## Toestemming per handeling

Het scherm ligt in het chroom van de browser en de pagina wordt eronder
weggenomen, dus geen website en geen client kan er iets overheen tekenen.

Vier regels die worden afgedwongen en niet aan goede wil hangen:

1. **Vragen is zeldzaam.** Wat de client in zijn eigen workspace doet vraagt
   niets. Een slot waar je omheen went is geen slot.
2. **De vraag is concreet.** Niet "mag de client klikken" maar wélke knop, op
   wélke pagina, in wélke workspace.
3. **Nee is de uitkomst bij twijfel.** Geen antwoord binnen een minuut is nee.
   Escape is nee. Een tweede vraag terwijl er één openstaat is nee, want anders
   stapelt een client vragen tot je de bovenste wegklikt.
4. **Ja geldt één keer.** Er is geen "altijd toestaan". Dat is de knop waarmee
   elk toestemmingsscherm ter wereld zichzelf uiteindelijk uitschakelt.

De weigerknop heeft de aandacht en het zwaarste gewicht. Toestaan is de
bijzondere handeling, niet de gewone.

### Waar geen vraag voor bestaat

Wachtwoordvelden, pincodes, creditcards, IBAN, verificatiecodes. Die worden
geweigerd vóórdat er iets te beslissen valt, op drie plekken: de naam van het
veld, de tekst die erin moet, en het veld zoals de pagina het zelf beschrijft
(`type="password"`, een autocomplete-hint van een betaalformulier). Die laatste
controle draait ín de pagina op het moment van typen, want tussen jouw klik en
die regel kan een pagina van alles hebben omgezet.

Er is geen goede vraag te stellen over een wachtwoord. De enige eerlijke zou
zijn "vertrouw je dit volledig", en daar hoort geen knop bij.

## Wat een client niet kan, en waarom

**Hij werkt in een eigen workspace.** Die heeft een sessie die niet op schijf
staat: geen koekjes, geen logins, weg zodra je de verbinding sluit. Opent hij
daar je mail, dan krijgt hij wat een vreemde krijgt, namelijk een aanmeldscherm.

Dat is de reden dat álles wat hij daar doet vrij is. Er valt niets te lekken.

**Bij jouw workspaces komt hij alleen als jij dat per keer toestaat.** Hij mag
zelf geen tabblad openen in een workspace van jou; hij kan alleen vragen of hij
een pagina mag lezen die jij al open hebt, en dan staat er in de vraag welke.

Waarom die grens daar ligt: zou hij zelf een tabblad mogen openen waar jij bent
ingelogd, dan kan hij naar je post navigeren en die lezen, en staat er in het
logboek keurig "tabblad geopend" terwijl er in werkelijkheid post is meegelezen.
Een lijst met verboden adressen vangt dat niet af; die lijst is altijd te kort.

**Hij komt niet bij je schijf en niet bij andere programma's.** Alleen `http:` en
`https:`. Een `file:`-adres of iets als `ms-msdt:` wordt geweigerd en gaat het
logboek in als poging.

**Je ziet wat hij doet.** Elke handeling komt in het logboek in het scherm, in
gewone taal: "Opent https://example.com", niet een functieaanroep. En er staat
een noodstop naast die de deur sluit, zijn workspace opruimt en alles afbreekt.

## Beproefd

De reeks `drive-mcp.mjs` start de brug precies zoals een client dat doet, als
kindproces over standaardinvoer, en valt de grens aan: jouw tabblad lezen met het
juiste id, een bestand van je schijf openen, een ander programma aanroepen, en
werken nadat de noodstop is ingedrukt.
