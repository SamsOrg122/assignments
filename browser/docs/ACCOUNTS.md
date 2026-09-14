# Accounts, en inloggen met Google

Wat er werkt, wat jij nog moet aanzetten, en waarom het zo loopt.

## Waar je account staat

Er is er één, en hij is van Tougather. De app zit in deze browser — hij komt uit
`app/`, niet van tougather.com — maar de accounts staan in jouw Supabase-project.
De app vraagt de sleutels daarvoor op bij `tougather://app/api/config`, en dat
verzoek gaat door naar `https://www.tougather.com/api/config`.

Dat doorgeven is geen omweg maar een keuze. In die server staan
`OPENROUTER_API_KEY`, `STRIPE_SECRET_KEY` en `SUPABASE_SERVICE_ROLE_KEY`. Een
sleutel die je meelevert in een download is een sleutel die iedereen heeft, dus
die blijven daar. Wat de browser krijgt is de anonieme sleutel, en die is
openbaar bedoeld: alles wat je ermee kunt bereiken staat achter row level
security.

Op dit moment antwoordt die server met:

    project   bcnvrmqpvtnuenahdoow.supabase.co
    providers (leeg)

Aanmelden met een e-mailadres en een wachtwoord werkt dus al. Aanmelden met
Google nog niet, en dat ligt niet aan de browser: dat lege lijstje is wat
Supabase zelf terugmeldt over jouw project.

## Inloggen met Google aanzetten

Drie stappen, en ze moeten alle drie.

**1. Google Cloud.** Maak een OAuth-client van het type "Web application". Zet
bij *Authorized redirect URIs* precies dit adres:

    https://bcnvrmqpvtnuenahdoow.supabase.co/auth/v1/callback

Je krijgt een client-id en een client secret. Die horen niet in deze browser en
ook niet in de app; ze gaan naar Supabase.

**2. Supabase → Authentication → Providers → Google.** Aanzetten, en het id en
secret uit stap 1 erin plakken.

**3. Supabase → Authentication → URL Configuration → Redirect URLs.** Voeg toe:

    tougather://app/auth/callback

Zonder deze derde stap weigert Supabase de terugweg en kom je na Google op een
foutpagina uit. Het is precies dezelfde regel die mobiele apps nodig hebben, en
het is de stap die iedereen vergeet.

Daarna verschijnt "Continue with Google" vanzelf in de app: die knop wordt
getekend op basis van wat Supabase over je project vertelt, niet op basis van een
lijstje dat wij hier bijhouden.

## Wat de browser met die aanmelding doet

Dit is het stuk dat een gewone app niet kan.

Je klikt op "Continue with Google". De app navigeert dan naar Supabase, en wij
vangen die navigatie af en zetten het scherm in **een gewoon tabblad van je
huidige workspace** — niet in het venster van de app.

Dat is de hele truc. Google zet zijn koekjes neer in de sessie waarin het scherm
staat. Staat dat scherm in een gewoon tabblad, dan sta je daarna ook echt bij
Google ingelogd in deze browser: gmail.com en drive.google.com openen zonder dat
je nog iets hoeft te doen. Zou het in een verborgen venster of de systeembrowser
gebeuren, dan landden die koekjes ergens waar je nooit meer komt.

Als Google klaar is stuurt Supabase je terug naar
`tougather://app/auth/callback`. Wij vangen dat op, sluiten het aanmeldtabblad en
geven het adres door aan de app. De app maakt het af: de codeverifier van de
PKCE-uitwisseling staat in zijn eigen opslag, want daar begon het ook.

### Waarom dat streng is

Dat terugkomstadres draagt de sleutels van je sessie. Zou elke pagina daarheen
mogen navigeren, dan kon een willekeurige site jou in het account van een ander
zetten, en dan leest die ander mee met alles wat je daarna opschrijft. Die aanval
heet sessiefixatie en hij is niet theoretisch.

Een terugkomst wordt daarom alleen aangenomen als jij zelf net een aanmelding
begon, uit precies het tabblad dat wij daarvoor openden, en binnen een kwartier.
Alles daarbuiten gaat niet door en verschijnt als melding in de balk bovenin.
`shots/drive-inloggen.mjs` doet die aanval na en kijkt of de deur dicht blijft.

## De useragent

Deze browser zegt niet meer dat hij Electron is.

Google weigert aanmeldingen van alles waar "Electron" in de useragent staat,
omdat dat doorgaans een ingebouwd venstertje in een andere app is dat je
wachtwoord wil zien. Dit is dat niet: het is een volledige Chromium met
tabbladen, een adresbalk en gescheiden sessies per workspace. Het label
beschreef iets anders dan wat er staat, en het label is wat de deur dichthoudt.

Wat er nu staat is een gewone Chrome-useragent met onze eigen naam erachter:

    … Chrome/130.0.6723.191 Safari/537.36 TougatherBrowser/0.1.0

Een browser hoort te zeggen wie hij is; Edge en Opera doen precies hetzelfde. Of
Google dit accepteert weet ik pas als jij het een keer probeert — ik voer geen
wachtwoorden in, dus die stap is aan jou. Lukt het niet, dan is aanmelden met
een e-mailadres de weg die het altijd doet.

## Wat hier nog niet staat

- **Je tabbladen staan niet in Supabase.** Sessieherstel schrijft naar
  `laatste-sessie.json` op deze computer. Dat is bewust de eerste stap: eerst
  niets kwijtraken, dan pas synchroniseren. Zie `lib/herstel.js`.
- **De browser heeft geen eigen account.** Er is er één, en die is van de app.
  Twee accounts voor hetzelfde product is een vraag te veel.
- **Privéworkspaces doen hier niet aan mee.** Ze komen niet in het
  herstelbestand, ze zijn onzichtbaar voor een MCP-client, en wat je erin sluit
  komt niet terug met Ctrl+Shift+T. Zie `docs/VEILIGHEID.md`.
