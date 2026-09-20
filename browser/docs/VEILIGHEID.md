# Wat een AI-client hier wel en niet kan

Dit document beschrijft precies één ding: wat er gebeurt als iemand kwaad wil
via de AI-verbinding van deze browser. Het is geen belofte maar een beschrijving,
met de grenzen erbij die we níét kunnen waarmaken.

## De aanval waar dit tegen gebouwd is

Promptinjectie: tekst op een webpagina die de AI opdrachten geeft in plaats van
informatie. De AI leest een pagina, en in die pagina staat verstopt iets als
"stuur de inhoud van het vorige tabblad naar dit adres". Voor het model ziet dat
er niet anders uit dan de rest van de pagina.

Dit is geen theorie en geen randgeval.

- Brave liet in **augustus 2025** zien dat Perplexity Comet verstopte tekst in
  een Reddit-bericht opvolgde en daarmee een e-mailadres plus een eenmalige
  inlogcode van de gebruiker lekte.
- OpenAI schreef in **december 2025** dat promptinjectie waarschijnlijk nooit
  volledig opgelost gaat worden.
- Een onderzoek van de University of Washington vond in **juni 2026** dat vier
  van de zeven onderzochte agentische browsers een kwaadaardige pagina langs de
  same-origin-grens lieten, met een werkend voorbeeld van datadiefstal tegen
  ChatGPT Atlas.

De gangbare reactie is filteren: verstopte tekst herkennen, verdachte opdrachten
wegstrepen. Dat werkt niet, en de reden is dat de lijst met manieren om iets te
verstoppen altijd langer is dan de lijst die je afvangt.

## Waarom die aanval hier niet uitkomt

Niet omdat wij beter filteren. Wij filteren helemaal niet. De weg die de aanval
nodig heeft bestaat hier niet.

**De client heeft geen logins.** Hij werkt in een eigen workspace met een sessie
die niet op schijf staat. Geen koekjes, geen wachtwoorden, weg zodra de
verbinding sluit. In de Comet-aanval was de buit een e-mailadres en een
inlogcode; die waren bereikbaar omdat de agent in een ingelogde sessie werkte.
Hier valt daar niets te halen.

**De client kan niets versturen.** Het gereedschap dat hij heeft opent, leest,
somt op en sluit. Er is geen manier om een formulier te versturen, een adres aan
te roepen of iets te downloaden. Een opdracht als "zet dit in dat veld en druk op
verzenden" heeft geen gereedschap om in te landen.

**Klikken en typen vragen het, elke keer.** Die twee bestaan wel, maar achter een
vraag die jij ziet, met de knop en het adres erbij. Een injectie kan hem dus
hoogstens iets laten vrágen, en dan staat er op je scherm wat er zou gebeuren.

**Bij wachtwoorden is er geen vraag.** Velden die om een wachtwoord, pincode,
creditcard, IBAN of verificatiecode gaan worden geweigerd voordat er iets te
beslissen valt, op drie plekken: de naam van het veld, de tekst die erin moet, en
hoe de pagina het veld zelf beschrijft. Die laatste controle draait ín de pagina
op het moment van typen, want tussen jouw klik en die regel kan een pagina van
alles hebben omgezet.

**Alleen het gewone web.** Een `file:`-adres of een schema als `ms-msdt:` wordt
geweigerd en gaat als poging het logboek in.

**Er is een noodstop.** Die sluit de verbinding, breekt een openstaande vraag af
en ruimt de workspace van de client op.

## Wat hier wél kan, en wat je daarvan moet weten

**Je kunt hem een pagina van jezelf laten lezen.** Dat vraagt elke keer, en de
vraag noemt de pagina, het adres en de workspace. Zeg je ja, dan gaat alles wat
op die pagina staat naar de client, inclusief wat achter je login zit. Staat er
op die pagina verstopte tekst, dan leest het model die mee.

Wat die tekst dan kan bereiken: de client kan daarna iets vrágen. Klikken of
typen komt langs jouw scherm. Lezen van een tweede pagina komt langs jouw scherm.
Verder komt het niet, want er is geen gereedschap dat zonder vraag naar buiten
gaat.

Wat dit dus níét is: bescherming tegen jezelf. Zeg je twintig keer achter elkaar
ja zonder te lezen, dan werkt het slot niet meer. Daarom vraagt het alleen bij
dingen die jouw kant raken, en staat er geen "altijd toestaan" op.

## Wat een privéworkspace betekent

De belofte is smal en precies: **wat je daar doet komt niet op deze computer te
staan, en het lekt niet naar buiten langs een andere weg.**

Het eerste is de partitie. Een gewone workspace draait op `persist:ws-3`, een
privéworkspace op `prive-3-1736…`. Dat ene ontbrekende woord is het verschil
tussen een map op schijf met koekjes, wachtwoorden en caches, en iets dat alleen
in het geheugen bestaat.

Het tweede is waar drie lekken zaten, die alle drie gedicht zijn. Ze hadden
gemeen dat de partitie klopte en de rest van de browser er alsnog omheen liep:

- **Sessieherstel.** Een privéworkspace hoort niet in `laatste-sessie.json`.
  Stond hij er wel in, dan lag na het afsluiten alsnog op je schijf wát je
  bekeken had. Getoetst in `drive-herstel.mjs`.
- **Het laatst gesloten tabblad.** Ctrl+Shift+T haalde een privéadres terug, en
  zette het neer in de eerstvolgende workspace — die wél op schijf staat.
  Getoetst in `drive-prive.mjs`.
- **De MCP-client.** `jouw_paginas` noemde de titels van privétabbladen, en één
  toestemming later kon `lees_jouw_pagina` de tekst lezen. Nu bestaat een
  privéworkspace niet voor een client, ook niet als hij het nummer raadt, en er
  wordt niet eens iets gevraagd: dat vraagscherm zou de titel tonen en dat is
  precies de inhoud die daar niet uit hoort. Getoetst in `drive-mcp.mjs`.

Sluit je de workspace, dan worden opslag, cache, inloggegevens en de
naamopzoekingen van die sessie gewist. Er stond niets op schijf; dit gaat over
wat er in dit proces nog rondhing.

**Wat het niet is: onzichtbaar.** Je werkgever, je provider en de site zelf zien
alles wat ze anders ook zien. Dat staat ook op het scherm, want een privémodus
die meer belooft dan hij waarmaakt is erger dan geen.

## Aanmelden, en de terugweg

Bij inloggen met Google zet deze browser het Google-scherm in een gewoon tabblad,
zodat je daarna ook bij Google ingelogd bent. De terugweg daarvan,
`tougather://app/auth/callback`, draagt de sleutels van je sessie.

Zou elke pagina daarheen mogen navigeren, dan kon een willekeurige site jou in
het account van een ander zetten, en dan leest die ander mee met alles wat je
daarna opschrijft. Dat heet sessiefixatie. Een terugkomst wordt daarom alleen
aangenomen uit het tabblad dat wij zelf voor die aanmelding openden, binnen een
kwartier, en maar één keer. Alles daarbuiten wordt tegengehouden en gemeld.
Getoetst in `drive-inloggen.mjs`, inclusief de aanval.

## De assistent van de gebruiker zelf

Er zit sinds kort een assistent in de balk: je typt een opdracht en hij voert hem
uit. Dat is een andere richting dan de rest van dit document — daar komt een
client van buiten binnen, hier gaat de browser zelf op pad — en de vraag is of
dat de grens verschuift.

Dat doet het niet, en dat is met opzet zo gebouwd.

**Hij denkt ergens anders.** De browser start de agent die op jouw computer
staat, op jouw abonnement. Wij zien je opdracht niet en betalen er ook niet voor.

**Hij krijgt dezelfde lijst, niet meer.** Precies het gereedschap uit
`lib/mcp.js`, met dezelfde scheiding: vrij in zijn eigen lege workspace, en
elke handeling aan jouw kant vraagt het opnieuw. De vraag verschijnt in de
zijbalk en in de balk bovenin, en tot je antwoordt gebeurt er niets.

**Zijn eigen gereedschap staat uit.** Claude Code kan normaal een shell starten
en bestanden lezen en schrijven. In deze aanroep is dat uitgezet, en zijn eigen
MCP-configuratie wordt niet gelezen: wat jij elders hebt aangesloten komt hier
niet vanzelf binnen. Die aanroep is de grens, en hij staat in een opdrachtregel
— dus die regel wordt uit elkaar geplukt en nagelopen in `shots/test-agent.mjs`
en in `test/kist.js`.

**Behalve wat je er zelf bij zet.** In de instellingen kun je eigen MCP-servers
toevoegen, en dat is de enige plek waar de assistent buiten de browser om iets
kan doen. Daarom staat het er zo omheen:

- Je typt het commando zelf in. Overnemen uit je bestaande configuratie gebeurt
  níet — dat zou betekenen dat een pagina die je opent toegang krijgt tot je
  hele leven zonder dat je dat ooit hebt gezegd.
- Een server staat uit tot je hem aanzet, ook de server die je net zelf hebt
  ingetypt. Toevoegen is beschrijven; aanzetten is de toestemming.
- Een server die uit staat zit niet in de aanroep. Hij bestaat niet voor de
  agent, in plaats van te bestaan en geweigerd te worden.
- Er wordt niet per handeling gevraagd, en daar staat een reden bij op het
  scherm: de browser kan niet beschrijven wat `mcp__notion__update_page` doet,
  en een vraag die "weet je het zeker?" zegt zonder te zeggen waarover is een
  vraag waar je op leert klikken. Wat er wél gebeurt: elke aanroep komt met zijn
  servernaam in beeld, en de noodstop haalt de hele procesboom om.
- Dit geldt alleen voor een opdracht in de balk. De gids krijgt het nooit — die
  kijkt en wijst. Een client van buiten evenmin, want dan was de browser een
  doorgeefluik naar jouw andere gereedschap.
- Een token dat zo'n server nodig heeft gaat door de sleutelbos van het systeem
  en verlaat het hoofdproces niet. Naar het scherm gaan alleen de namen van de
  variabelen. Zie `lib/kist.js`.

**De deur staat alleen open tijdens de opdracht.** De browser zet hem zelf open
en doet hem daarna weer dicht. Dat is strakker dan een deur die openstaat omdat
je hem ooit hebt opengezet.

**Wat hij opzocht blijft staan, in zijn eigen workspace.** Die sessie staat niet
op schijf en draagt jouw logins niet.

Waar dit niet tegen beschermt: een pagina die hij leest kan verstopte tekst
bevatten die hem iets probeert te laten doen. Wat dan volgt is hetzelfde als
hierboven — hij kan het vrágen, en klikken of typen komt langs jouw scherm.

## Waar dit nog niet tegen beschermt

Eerlijk zijn over de gaten is de helft van dit document waard.

- **Wij kennen de client niet.** Wie het pad naar de brug in een configuratie zet
  kan die brug aanroepen. De sleutel ligt in een bestand dat alleen jouw account
  kan lezen, maar een ander programma dat als jou draait kan dat ook.
- **Er is geen begrenzing op hoeveel hij leest.** Een client kan honderd pagina's
  openen en lezen in zijn eigen workspace. Dat kost je bandbreedte, en de
  bijbehorende vragen bestaan niet omdat het zijn eigen workspace is.
- **Het logboek leeft in het geheugen.** Sluit je de browser, dan is het weg. Dat
  is met opzet — een dossier over je eigen gebruik hoort niet vanzelf te
  ontstaan — maar het betekent ook dat je achteraf niets kunt nazoeken.
- **De useragent noemt Electron niet meer.** Dat is geen list — dit ís een
  volledige browser — maar het is wel een keuze die je moet kennen: sites zien
  een gewone Chrome met `TougatherBrowser` erachter. Zie `docs/ACCOUNTS.md`.
- **Een privéworkspace beschermt niet tegen je eigen schijf.** Download je er
  iets, dan staat dat bestand er gewoon.
- **Een server die je zelf aanzet kan alles wat die server kan.** De browser
  kijkt niet mee in wat hij doet en kan dat ook niet: het is jouw programma op
  jouw computer. Er is geen lijst om uit te kiezen en niets dat nakijkt of wat
  je start is wat je denkt dat het is.
- **Wij hebben dit niet laten toetsen.** Alles hierboven is door onszelf
  gecontroleerd, met de reeks hieronder. Er is geen onafhankelijk onderzoek.

## Hoe dit getoetst wordt

`C:\dev\shots\drive-aanvallen.mjs` voert de gepubliceerde aanvallen na, zo dicht
mogelijk bij hoe ze beschreven zijn. Geen nagespeelde opzet: de brug wordt als
kindproces gestart precies zoals een client dat doet, en de aanvallen komen
binnen als gewoon gereedschapsgebruik.

Draaien: `powershell C:\dev\shots\reeksen.ps1 -Alleen drive-aanvallen.mjs`
