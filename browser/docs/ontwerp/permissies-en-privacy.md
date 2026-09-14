# Permissies en privacy

Dit onderdeel ziet eruit zoals het eruitziet omdat een pagina in Tougather een
native laag is. Chromium tekent een `WebContentsView` altijd over gewone HTML
heen, dus de plek waar een browser normaal zijn permissievraag neerzet — een
bubbel onder de adresbalk, over de pagina heen — bestaat hier niet. Er zijn
precies twee plekken die wél over een pagina heen kunnen: de zijbalk (die naast
de pagina ligt, dus botst nooit) en de balk bovenin (een eigen view die al boven
alles hangt). Daarom valt het ontwerp in tweeën uiteen: **de vraag** leeft in de
balk bovenin, want die moet je zien terwijl je naar de pagina kijkt, en **het
beheer** leeft in de zijbalk, want dat is een lijst die je rustig doorloopt. Dat
is geen compromis: de balk is al de plek waar de browser jou iets vraagt (de
stand `actie` van de assistent), dus een permissievraag hoort daar thuis.

Het tweede uitgangspunt: het besluit hoort bij de **sessie**, niet bij het
venster. Een workspace is een `persist:ws-N`-partitie, en die partitie is gedeeld
tussen alle vensters. Toestemming die je in workspace "Werk" geeft, geldt daarom
in workspace "Werk" en nergens anders — ook niet in een tweede venster met
dezelfde site open in een andere workspace. Dat is precies wat je wilt: een
site die je camera mag zien op je werkaccount hoeft dat niet op je eigen account.

Derde uitgangspunt: **falen doen we dicht**. De tabel hieronder is een
toelatingslijst. Alles wat er niet in staat — ook permissienamen die Electron in
een latere versie toevoegt — wordt geweigerd zonder te vragen.

---

## 1. Wat er nu misgaat

Drie concrete gaten in de huidige code:

1. **Geen enkele permissiehandler.** `main.js` roept nergens
   `setPermissionRequestHandler` aan. Electrons standaard is: alles goedkeuren,
   zonder te vragen. Camera, microfoon, locatie, meldingen, klembord lezen —
   elke site krijgt het.

2. **`shell.openExternal` op alles wat niet http is.** In `createTab()`:

   ```js
   wc.setWindowOpenHandler(({ url: target }) => {
     if (/^https?:/i.test(target)) this.createTab(target, ws);
     else shell.openExternal(target);   // <- alles: mailto:, ms-msdt:, shell:, file:
     return { action: 'deny' };
   });
   ```

   Een pagina die `window.open('ms-msdt:...')` doet, geeft dat linea recta aan
   de OS-schema-afhandeling. Op Windows is dat een bekende weg naar het
   uitvoeren van code. Dit is ernstiger dan het permissiegat, want er komt geen
   vraag aan te pas.

3. **Een popup uit een assistenttabblad kapert je beeld.** Dezelfde handler
   roept `createTab(target, ws)` zonder `owner` en zonder `activeer: false`.
   Doet de pagina waarin Kim werkt een `window.open()`, dan springt jouw scherm
   naar een tabblad dat van jou lijkt maar van hem is. Precies wat het hele
   ontwerp van eigenaarschap moet voorkomen.

Verder: `toURL()` laat elk schema door dat op `/^[a-z][a-z0-9+.-]*:/i` matcht
(`search.js`, `SCHEMA`), dus de adresbalk aanvaardt `file:`, `javascript:`,
`devtools:`. En de user agent bevat `Electron/33.4.11 Tougather/0.1.0`: dat is
zowel een vingerafdruk als een reden voor sites om je een kapotte pagina te
sturen.

---

## 2. De vorm van een besluit

Een besluit heeft drie standen, en dat is bewust niet twee:

| stand | betekenis |
| --- | --- |
| `vragen` | nog niets besloten; de vraag komt in de balk bovenin |
| `toestaan` | onthouden, geldt tot je hem intrekt |
| `blokkeren` | onthouden, er wordt niet meer gevraagd |

Plus één stand die niet op schijf komt: `deze-keer`. Die leeft in het geheugen,
per (partitie, origin, sleutel), en vervalt zodra het laatste tabblad met dat
origin in die workspace weg navigeert of sluit — en sowieso bij het afsluiten
van de app.

**De sleutel** is `partitie → origin → permissiesleutel`.

- *partitie*: `persist:ws-1`, de string die de workspace al gebruikt. Niet het
  workspace-id, want dat loopt per venster en begint in elk nieuw venster weer
  op 1 (zie `nextWorkspaceId = 1` in de constructor). Twee vensters delen dus
  `persist:ws-1` — de partitie is de echte identiteit, het id niet.
- *origin*: `new URL(details.requestingUrl).origin`, dus `https://meet.google.com`
  inclusief poort. Bewust niet eTLD+1: strenger, en we hebben geen
  public-suffix-lijst in huis om `.co.uk` correct te knippen. Kost meer vragen,
  levert minder verrassingen op.
- *permissiesleutel*: de Electron-permissienaam, behalve `media`, dat we splitsen
  in `media.video` en `media.audio` (zie §4).

## 3. De beleidstabel

Eén tabel, in `permissies.js`, die alles bepaalt. Wat er niet in staat, wordt
geweigerd.

| sleutel | in de UI | standaard | assistent |
| --- | --- | --- | --- |
| `media.video` | Camera | vragen | weigeren |
| `media.audio` | Microfoon | vragen | weigeren |
| `geolocation` | Locatie | vragen | weigeren |
| `notifications` | Meldingen | vragen | weigeren |
| `clipboard-read` | Klembord lezen | vragen | weigeren |
| `openExternal` | Andere app openen | vragen | weigeren |
| `fileSystem` | Bestanden op je schijf | vragen | weigeren |
| `display-capture` | Scherm delen | weigeren | weigeren |
| `clipboard-sanitized-write` | — | toestaan | toestaan |
| `fullscreen` | — | toestaan | weigeren |
| `pointerLock` | — | toestaan | weigeren |
| `storage-access` | — | toestaan | toestaan |
| `top-level-storage-access` | — | toestaan | toestaan |
| `midi`, `midiSysex` | — | weigeren | weigeren |
| `idle-detection` | — | weigeren | weigeren |
| `window-management` | — | weigeren | weigeren |
| `keyboardLock` | — | weigeren | weigeren |
| `speaker-selection` | — | weigeren | weigeren |
| `hid`, `serial`, `usb` | — | weigeren | weigeren |
| `mediaKeySystem` | — | weigeren | weigeren |
| `unknown` en al het overige | — | weigeren | weigeren |

Toelichting bij de eigenaardige gevallen:

- **`display-capture` staat op weigeren en dat blijft even zo.** Sinds Electron
  30 werkt `getDisplayMedia()` alleen met een
  `session.setDisplayMediaRequestHandler()`, en die handler moet *een bron
  kiezen* (`desktopCapturer.getSources({ types: ['screen', 'window'] })`). Een
  bronkiezer met thumbnails is een eigen scherm dat óók over de pagina heen moet
  — hetzelfde native-laagprobleem, maar dan met een raster van vensters. Dat is
  een apart ontwerp. Tot dan: registreer de handler en roep hem meteen af met
  `callback({})`, plus een regel in de balk ("Scherm delen kan nog niet"). Niet
  de handler weglaten, want dan hangt de belofte van de pagina.
- **`storage-access` staat op toestaan.** Weigeren zou embedded logins slopen en
  levert niets op zolang we derde-partijcookies binnen een workspace toch niet
  blokkeren. Zodra we dat wel doen, gaat deze op `vragen`.
- **`fullscreen` op toestaan heeft een gevolg voor de layout.** Onze bounds
  worden met de hand berekend in `layoutActiveTab()`; een pagina die
  fullscreen gaat, vult niet het venster maar blijft in zijn rechthoek staan.
  Wie fullscreen toestaat, moet op `webContents.on('enter-html-full-screen')` de
  bounds naar `win.getContentBounds()` zetten en het eiland verbergen, en dat op
  `leave-html-full-screen` terugdraaien. Dat raakt de layout, dus stem het af
  met wie daaraan werkt.
- **`notifications` op Windows vraagt om `app.setAppUserModelId(app.getName())`
  bij het opstarten**, anders verschijnt een toegestane melding gewoon niet.

---

## 4. De twee handlers

### 4.1 `setPermissionRequestHandler` — de vraag

```js
// permissies.js
ses.setPermissionRequestHandler((wc, permissie, callback, details) => {
  // Elke aanroep moet precies één keer geantwoord worden. Nooit antwoorden
  // laat de belofte in de pagina eeuwig hangen; twee keer antwoorden gooit.
  const context = zoekTabblad(wc);           // venster, tabId, eigenaar, partitie
  const sleutels = sleutelsVoor(permissie, details);
  ...
});
```

De handler in stappen:

1. **Herken het tabblad.** `wc` is de webContents van het tabblad. We hebben een
   omgekeerde index nodig: `Map<webContents.id, { controller, tabId, partitie }>`,
   gevuld in `createTab()` en geleegd in `closeTab()` en op `wc.on('destroyed')`.
   Vinden we het tabblad niet (devtools, een view die we niet kennen) →
   `callback(false)`.
2. **Bepaal het origin.** `details.requestingUrl` als het er is, anders
   `details.securityOrigin`. Lukt `new URL(...)` niet, of is het schema geen
   `https:` → `callback(false)` zonder te vragen. (Chromium beperkt de sterke
   API's al tot secure contexts; deze regel maakt dat expliciet en dekt
   `file:`- en `data:`-pagina's af.)
3. **Weiger uit vreemde iframes.** `details.isMainFrame === false` én het origin
   van het frame wijkt af van dat van het hoofdframe → `callback(false)`. Het
   permissions-policy van Chromium gooit dit meestal al weg; dit is de riem
   naast de bretels, en het scheelt een vraag waar je op het scherm de bron niet
   van kunt zien.
4. **Splits `media`.** `details.mediaTypes` is een array met `'video'` en/of
   `'audio'`. Daaruit volgen één of twee sleutels.
5. **Zoek het besluit op** per sleutel, in volgorde: `deze-keer` (geheugen) →
   opgeslagen besluit → assistentbeleid (als het tabblad een eigenaar heeft) →
   standaard uit de tabel.
6. **Beslis.** Is één sleutel `weigeren` → `callback(false)`. Zijn alle sleutels
   `toestaan` → `callback(true)`. Anders: één vraag, voor alle sleutels samen.
7. **Stel de vraag** door hem in de wachtrij van het venster te zetten (§6).

> **Waarom één vraag voor camera én microfoon:** de callback is één boolean, geen
> object per mediatype. Vraagt een site `getUserMedia({ video: true, audio: true })`,
> dan kun je niet "camera ja, microfoon nee" antwoorden. De vraag luidt dus
> "meet.google.com wil je camera en microfoon gebruiken" en het antwoord slaat op
> beide. Wie alleen de camera wil geven, moet dat achteraf in het sitepaneel
> doen; de site moet dan opnieuw vragen en krijgt dan alsnog `false`.

**Tijdslimiet.** Een vraag die 60 seconden onbeantwoord blijft → `callback(false)`
en weg uit de wachtrij. Ook: sluit het tabblad, navigeert het weg
(`did-start-navigation` naar een ander origin), of sluit het venster → meteen
`callback(false)`. Zonder dit lekt elke onbeantwoorde vraag een callback en houdt
de pagina een belofte open die nooit rond komt.

### 4.2 `setPermissionCheckHandler` — de synchrone kant

```js
ses.setPermissionCheckHandler((wc, permissie, origin, details) => {
  // Synchroon: hier kan niets gevraagd worden, alleen opgezocht.
  return besluitVoor(partitie, origin, permissie, details) === 'toestaan';
});
```

Deze handler wordt aangeroepen voor `navigator.permissions.query()`, voor
`enumerateDevices()`-labels en op nog een paar plekken. Hij is **synchroon en
boolean**, en daar zit een echt probleem: Chromium kent drie standen (`granted`,
`denied`, `prompt`) en wij kunnen er twee teruggeven. Onze stand `vragen` is dus
niet uit te drukken.

De keuze die we maken:

- Voor `media.*` en `clipboard-read`: `vragen` → **false**. Anders lekken de
  labels van je camera's en microfoons via `enumerateDevices()` naar elke site
  die het vraagt, en dat is een vingerafdruk op zichzelf.
- Voor `geolocation` en `notifications`: `vragen` → **true**. Sites gebruiken
  `permissions.query()` om te beslissen of ze de knop tonen; `denied`
  teruggeven levert "je hebt dit geblokkeerd" op terwijl we het nog nooit
  gevraagd hebben. De echte vraag komt alsnog via de request-handler.
- Alles wat op `weigeren` staat: **false**.

Dat is een afweging tussen "de site liegt tegen de gebruiker" en "de site leest
je apparaatlijst". Zet die twee regels in `permissies.js` als een expliciete
kolom in de tabel (`checkBijVragen: true|false`), niet als een verstopte if.

### 4.3 De rest van de session-hardening

In dezelfde functie `hardenSession(ses, partitie)`:

```js
ses.setDevicePermissionHandler(() => false);          // USB, serieel, HID: nooit
ses.setBluetoothPairingHandler((_d, cb) => cb({ confirmed: false }));
ses.setDisplayMediaRequestHandler((_req, cb) => cb({}));   // zie §3
ses.setSpellCheckerEnabled(false);   // Electrons speller haalt woordenboeken bij Google
ses.setUserAgent(USER_AGENT);        // zonder "Electron/..." en "Tougather/..."
```

`setUserAgent` per sessie, of één keer `app.userAgentFallback` vóór het eerste
venster. Neem de bestaande string en knip er de twee tokens uit die ons
verklappen; hem helemaal verzinnen levert een nieuwe, unieke vingerafdruk op.

**Volgorde is kritiek.** De handlers moeten er staan vóór het eerste tabblad
laadt. Dus: `session.fromPartition(partition)` aanroepen in `addWorkspace()`,
direct nadat de partitiestring gemaakt is, en daar `hardenSession()` op
loslaten. Een module-brede `Set<string>` van al geharde partities houdt het
idempotent — `fromPartition` geeft steeds hetzelfde Session-object terug en
sessies zijn gedeeld tussen vensters, dus zonder die guard hangt er een
handler in met een verouderde closure.

En: `session.defaultSession` óók harden, met alles op weigeren. Daar draaien de
zijbalk en de balk bovenin. Die vragen niets, maar een lek in een van beide is
dan meteen ook niets waard.

---

## 5. Waar de besluiten staan

`path.join(app.getPath('userData'), 'permissies.json')`:

```json
{
  "versie": 1,
  "partities": {
    "persist:ws-1": {
      "https://meet.google.com": {
        "media.video": { "besluit": "toestaan", "sinds": 1757000000000 },
        "media.audio": { "besluit": "toestaan", "sinds": 1757000000000 },
        "notifications": { "besluit": "blokkeren", "sinds": 1757000012000 }
      }
    }
  }
}
```

- Synchroon inlezen bij het opstarten, vóór het eerste venster. Het is een klein
  bestand en het moet er zijn voordat er iets kan laden.
- Wegschrijven met 500 ms uitstel, en atomair: schrijf naar `permissies.json.tmp`
  en `fs.renameSync()` eroverheen. Een half geschreven bestand betekent hier dat
  iemand morgen zijn camera weggeeft.
- Kapot bestand → hernoem naar `permissies-kapot-<datum>.json`, begin leeg,
  meld het één keer in de balk. Nooit stilzwijgend met een lege lijst verder,
  want dat is een verzameling toestemmingen die geruisloos verdwijnt.
- `versie` staat er voor een latere migratie.
- Dit bestand is niet versleuteld en vertelt wie je camera mag zien. Dat is een
  bewuste keuze (geen sleutelbeheer in een browser die nog geen instellingen
  heeft), maar het hoort in de release notes.

Een partitie waarvan de workspace weg is, blijft in het bestand staan. Ruim hem
op wanneer `closeWorkspace()` draait, en dan meteen ook de sessiedata zelf —
anders houdt een gesloten workspace zijn cookies voor eeuwig.

---

## 6. De vraag: in de balk bovenin

De balk (`island.html`) groeit al met zijn inhoud mee en meldt zijn maat via
`island:size`. Een vraag maakt hem tijdelijk twee regels hoog en breder; de
bestaande `meet()` regelt dat vanzelf.

```
          ┌─────────────────────────────────────────────┐
          │ ▚▚  meet.google.com wil je camera en        │   <- glyph in de
          │     microfoon gebruiken                     │      stand 'vraag'
          │     [ Toestaan ] [ Deze keer ] [ Blokkeren ]│
          └─────────────────────────────────────────────┘
```

- **Drie knoppen, geen vinkje.** "Toestaan" = onthouden en toestaan. "Deze keer"
  = alleen voor deze sessie. "Blokkeren" = onthouden en blokkeren. Escape en een
  klik buiten de balk = blokkeren voor deze keer (dus niet onthouden). Dat is
  hetzelfde model als Safari en het scheelt een besturingselement in een balk
  die maar één regel breed is.
- De regel noemt het origin **zonder schema**, en met een titel-attribuut dat de
  volledige URL toont. Lange origins worden aan de kop afgekapt met een ellipsis
  aan de linkerkant, niet rechts: `…evil-lookalike.com` mag niet als
  `google.com…` op je scherm staan.
- **Een stand `vraag` in `GLYPH_KLEUREN`** (`glyph.js`), met een eigen kleur en
  de bestaande hartslagbeweging van `actie`. Niet dezelfde kleur als `actie`:
  oranje betekent al "de assistent heeft je nodig", en die twee mogen niet op
  elkaar lijken. `glyph.js` is de ene plek waar kleuren als losse getallen in JS
  staan; dat blijft zo, want canvas heeft componenten nodig en geen CSS-variabele.
- **Knopkleuren** hergebruiken wat `island.css` al heeft: "Toestaan" op
  `--ga-vlak`, "Blokkeren" op `--gevaar-vlak`/`--gevaar-tekst`. Eén nieuwe
  variabele in de `:root` van `island.css` voor de neutrale middenknop, bijv.
  `--zacht-vlak: rgba(255, 255, 255, 0.1)`.
- **Botsing met de assistent.** Draait Kim terwijl je eigen tabblad iets vraagt,
  dan wint de vraag de knoppenrij en zakt zijn regel naar de kleine grijze regel
  erboven (`#vorige`, die bestaat al). Zodra de vraag beantwoord is, keert zijn
  regel terug. Een assistenttabblad stelt zelf nooit een vraag (§8), dus verder
  botsen ze niet.
- **Meerdere vragen** komen in een wachtrij per venster, één zichtbaar tegelijk,
  in volgorde van binnenkomst.
- **Alleen het actieve tabblad mag vragen.** Wissel je van tabblad terwijl er een
  vraag staat, dan verdwijnt hij uit beeld maar blijft hij in de wachtrij
  (onbeantwoord, met zijn klok lopend). Kom je terug, dan staat hij er weer.
  Komt er een vraag uit een tabblad dat niet actief is en geen eigenaar heeft
  (dat kan: een achtergrondtabblad met een timer), dan blijft hij in de rij
  staan tot je dat tabblad opent — of tot de klok van 60 seconden hem weigert.

**Vertrouwen in het antwoord.** Het antwoord komt binnen via de preload van de
balk. Dat is een laag die met opzet weinig mag, dus:

- de vraag krijgt een id (`Symbol` kan niet over IPC — gebruik een teller plus
  het venster-id, bijv. `"3-17"`);
- `perm:answer` neemt dat id mee, en het hoofdproces controleert dat de
  bijbehorende vraag (a) bestaat, (b) bij het venster hoort dat uit
  `controllerFor(event)` komt, en (c) nog niet beantwoord is;
- klopt er iets niet, dan wordt het bericht genegeerd. De balk kan zo geen
  permissie geven aan een site die niets gevraagd heeft.

---

## 7. Het beheer: het slotje in de zijbalk

De zijbalk ligt links van `SIDEBAR_WIDTH` en de pagina begint erop. Alles wat we
binnen die kolom tekenen, blijft zichtbaar zonder de pagina te verbergen — géén
`setPaletteOpen`-truc nodig.

**Het knopje.** Een vierde knop in `#controls`, achter "Opnieuw laden": een
slotje. Zijn kleur zegt de stand van het huidige origin:

| kleur | betekenis |
| --- | --- |
| `var(--muted)` | niets gevraagd, niets besloten |
| `var(--ws-2)` (groen) | deze site heeft iets toegestaan |
| `var(--danger)` | deze site heeft iets geblokkeerd |
| `var(--assistent)` | een assistent vroeg hier iets, en kreeg nee |

Nieuwe variabelen in `:root` van `style.css`, zonder nieuwe hexwaarden:
`--perm-ja: var(--ws-2); --perm-nee: var(--danger); --perm-vraag: var(--assistent);`.

**Het paneel.** Klikken opent `#site-panel`, dat binnen de zijbalk over
`#tablist` schuift (`position: absolute` binnen `#sidebar`, dus nooit over de
pagina). Inhoud:

```
  meet.google.com
  Workspace Persoonlijk

  Camera            [ Vragen | Toestaan | Blokkeren ]
  Microfoon         [ Vragen | Toestaan | Blokkeren ]
  Locatie           [ Vragen | Toestaan | Blokkeren ]
  Meldingen         [ Vragen | Toestaan | Blokkeren ]
  Klembord lezen    [ Vragen | Toestaan | Blokkeren ]

  Trackers geblokkeerd op deze pagina        7
  Bescherming op deze site                   [aan]

  Vergeet deze site
```

- Er staan alleen rijen die ertoe doen: alles waarover al besloten is, plus wat
  deze site deze sessie gevraagd heeft, plus de vaste vijf hierboven. Niet
  twintig regels waarvan er achttien "Vragen" zeggen.
- "Vergeet deze site" is rood en werkt met hetzelfde bewapenen-in-twee-klikken
  als de sluitknop van een workspace (`gewapend`/`ontwapenen` in `app.js`). Het
  wist het besluit én de opslag van dat origin.
- Het paneel toont ook, als het tabblad een eigenaar heeft, één regel:
  "Assistenttabbladen vragen nooit om toestemming; wat zou vragen, wordt
  geweigerd." Zo is het beleid uit §8 zichtbaar op de plek waar je erover
  nadenkt.

**Zichtbaarheid in de tabbladenlijst.** `describe(id)` krijgt er één veld bij:
`slot: 'geen' | 'toegestaan' | 'geblokkeerd' | 'assistent-geweigerd'`. Bij
`toegestaan` tekent `renderTab()` een klein stipje in `--perm-ja` naast de titel
(hetzelfde formaat als `.bezig`); bij `assistent-geweigerd` een stipje in
`--perm-vraag` met een titel-attribuut "Kim vroeg om camera — geweigerd".

**Terugdraaien, en wat dat níet doet.** Zet je een permissie terug op Vragen of
Blokkeren, dan verandert dat alleen wat de handlers voortaan antwoorden.
Chromium vraagt tijdens een lopende `MediaStream` niets opnieuw: de camera
blijft aan. Er is geen Electron-API om een lopende stream te stoppen. Dus:

- na een intrekking herladen we elk tabblad in die partitie waarvan het origin
  overeenkomt (`wc.reload()`), en het paneel zegt dat vooraf: "Deze pagina wordt
  opnieuw geladen";
- "Vergeet deze site" doet daarnaast `ses.clearStorageData({ origin, storages:
  [...] })`, plus `ses.cookies.get({ domain })` en `remove()` per cookie, want
  cookies zitten aan een domein en niet aan een origin.

**Nooit** `setPermissionRequestHandler(null)` gebruiken om iets te resetten: dat
zet Electrons standaard terug, en die keurt alles goed. Resetten betekent hier
"de opslag leegmaken", niet "de handler weghalen".

---

## 8. Wat een assistent mag

Een assistent werkt in een tabblad dat je niet ziet. Een vraag over dat tabblad
is een vraag die je niet kunt beoordelen: je weet niet welke pagina er staat,
wat hij net gedaan heeft, of waarom hij nu je microfoon wil. Dus vragen we niet.

**De regel: een tabblad met een eigenaar krijgt alles geweigerd wat anders zou
vragen.** Kolom "assistent" in de tabel van §3. Geen wachtrij, geen dialoog,
onmiddellijk `callback(false)`, zodat zijn `getUserMedia()` netjes faalt en hij
daarop kan reageren in plaats van eeuwig te wachten.

Wat hij wél zonder vragen krijgt: `clipboard-sanitized-write` (hij kopieert
dingen), `storage-access` (anders werken embedded logins niet), en verder de
gewone dingen die geen permissie zijn — navigeren, lezen, formulieren invullen.

Wat er gebeurt bij een weigering:

1. De weigering wordt bij het tabblad genoteerd: `{ sleutel, origin, tijd }`.
2. `pushState()` zet `slot: 'assistent-geweigerd'` op dat tabblad, dus je ziet
   het stipje in de zijbalk zonder ernaartoe te gaan.
3. Wil hij verder, dan gebruikt hij de weg die er al ligt: `modus: 'actie'` in de
   balk bovenin, met de regel "Kim wil je camera gebruiken op meet.google.com".
   Klik je "Ga door", dan zet het hoofdproces het besluit op `deze-keer` voor dat
   origin in die partitie en herstart hij de stap. Dat hergebruikt precies de
   stand die er al is voor "hij heeft jou nodig", en het verschil met een gewone
   permissievraag is essentieel: je zegt hier ja tegen *Kim*, met zijn opdracht
   in beeld, niet tegen een pagina die je niet ziet.

**De eigenaar wordt gelezen op het moment van de vraag**, uit `this.owners`, niet
uit een closure van `createTab()`. `stopAgent()` zet de eigenaar op `null` en
dan is het weer jouw tabblad, met jouw rechten.

**Een popup uit een assistenttabblad erft zijn eigenaar** en wordt niet
geactiveerd — zie §9.

---

## 9. `setWindowOpenHandler` en navigatie

Eén beoordelingsfunctie, in `privacy.js`, gebruikt door alledrie de paden:

```js
// 'intern' = zelf openen, 'extern' = het OS vragen (na toestemming),
// 'weiger' = niets doen.
function beoordeelURL(doel) {
  let u;
  try { u = new URL(doel); } catch { return 'weiger'; }
  if (u.protocol === 'https:' || u.protocol === 'http:') return 'intern';
  // Onze eigen nieuw-tabblad-pagina is een file:-URL; alleen die.
  if (u.protocol === 'file:' && doel.startsWith(NEWTAB)) return 'intern';
  if (doel === 'about:blank') return 'intern';
  if (VERBODEN_SCHEMA.has(u.protocol)) return 'weiger';
  return 'extern';
}
```

`VERBODEN_SCHEMA` bevat in elk geval: `javascript:`, `data:`, `blob:`, `file:`
(voor alles buiten NEWTAB), `about:` (behalve `about:blank`), `chrome:`,
`chrome-extension:`, `devtools:`, `view-source:`, en op Windows de bekende
OS-schema's die code kunnen starten: `ms-msdt:`, `search-ms:`, `ms-officecmd:`,
`shell:`, `vbscript:`, `ms-appinstaller:`. De lijst is een startpunt en geen
garantie — daarom is `extern` *ook* een vraag en niet een doorgeefluik.

**De nieuwe window-open-handler:**

```js
wc.setWindowOpenHandler(({ url: doel, disposition }) => {
  if (disposition === 'save-to-disk') return { action: 'deny' };  // downloads: later
  const soort = beoordeelURL(doel);
  if (soort === 'intern') {
    // Erft de eigenaar: een popup uit Kims tabblad blijft van Kim, en pakt
    // jouw beeld dus niet af.
    const eigenaar = this.owners.get(id) ?? null;
    this.createTab(doel, ws, { owner: eigenaar, activeer: eigenaar === null });
  } else if (soort === 'extern') {
    this.vraagExtern(doel, id);       // permissie openExternal, zie hieronder
  }
  return { action: 'deny' };
});
```

Altijd `{ action: 'deny' }`. Een `allow` levert een echte `BrowserWindow` op met
onze standaard-webPreferences en zonder onze layout — dat willen we nooit.

**Navigatie binnen een tabblad:**

```js
wc.on('will-navigate', (e, doel) => {
  if (beoordeelURL(doel) === 'intern') return;
  e.preventDefault();
  if (beoordeelURL(doel) === 'extern') this.vraagExtern(doel, id);
});
wc.on('will-frame-navigate', ...);   // hetzelfde, maar ook voor iframes
wc.on('will-redirect', ...);         // een redirect naar een raar schema telt ook
```

`will-navigate` vuurt niet bij navigaties binnen dezelfde pagina en niet bij
`window.open`; daarvoor zijn de andere twee paden. Voeg dit toe in
`app.on('web-contents-created')` zodat ook webContents die we niet zelf maken
(mocht dat ooit gebeuren) meteen onder dezelfde regel vallen.

**`vraagExtern(url, tabId)`** loopt door dezelfde wachtrij als een permissie, met
de sleutel `openExternal`. De vraag in de balk toont het schema en het pad
afgekapt: "Deze pagina wil Mail openen — mailto:iemand@example.com". Pas na
"Toestaan" volgt `shell.openExternal(url)`. Onthouden mag per (partitie, origin,
schema), niet per origin in het algemeen: toestemming voor `mailto:` is geen
toestemming voor `zoommtg:`.

**`toURL()` in main.js** krijgt dezelfde beoordeling: typ je iets met een schema
dat niet `intern` is, dan wordt het niet geladen maar behandeld als
zoekopdracht. Dat zit in `main.js`, niet in `search.js` — `search.js` wordt
gedeeld met een sandboxed tabblad en mag niets over ons beleid weten.

---

## 10. Trackingbescherming zonder adblocker

Drie goedkope lagen. Geen EasyList, geen cosmetische filters, geen parser.

**1. Een handgeschreven lijst met trackerhosts**, in `trackers.js` als een
`Set` van hostnamen (± 150 stuks: `google-analytics.com`, `doubleclick.net`,
`connect.facebook.net`, `scorecardsresearch.com`, `hotjar.com`, `segment.io`,
`mixpanel.com`, `fullstory.com`, …). Matchen op achtervoegsel zonder regex:

```js
// Loopt van 'stats.g.doubleclick.net' naar 'g.doubleclick.net' naar
// 'doubleclick.net'. Kost het aantal labels, niet de lengte van de lijst.
function isTracker(host) {
  let rest = host;
  while (rest.includes('.')) {
    if (TRACKERS.has(rest)) return true;
    rest = rest.slice(rest.indexOf('.') + 1);
  }
  return false;
}
```

Aangesloten via `ses.webRequest.onBeforeRequest(filter, (details, cb) =>
cb({ cancel: true }))`. `details.resourceType` gebruiken we om
`mainFrame` altijd door te laten: een tracker blokkeren is één ding, een tabblad
laten stranden op een blanco pagina is iets anders.

**2. `resourceType === 'ping'` altijd blokkeren.** Dat is hyperlink auditing:
een pagina die na een klik een bericht naar een derde stuurt. Niemand mist het.

**3. Referer inkorten**, via `onBeforeSendHeaders`: bij een verzoek naar een
andere host dan de pagina wordt `Referer` teruggebracht tot het origin
(`https://example.com/`) in plaats van de volle URL met pad en querystring.
Daarnaast `Sec-GPC: 1` meesturen — juridisch afdwingbaar in een deel van de VS,
en gratis.

Wat we **niet** doen, en waarom:

- **Geen derde-partijcookies blokkeren.** Zou het `Cookie`-veld strippen op
  cross-site verzoeken betekenen, en dat sloopt SSO, ingebedde betaalvelden en
  half het zakelijke web. Workspaces geven al de scheiding die er het meest toe
  doet.
- **Geen eerste/derde-partijbepaling op eTLD+1.** Daar is een public-suffix-lijst
  voor nodig; die hebben we niet en een naïeve "laatste twee labels" is fout bij
  `.co.uk` en `.gov.au`. We vergelijken daarom op hostnaam-achtervoegsel, wat
  strenger noch losser is maar simpelweg iets anders — zeg dat in de UI ook zo
  ("Trackers geblokkeerd", niet "Derde partijen geblokkeerd").

**Aan/uit per workspace**, met een schakelaar in het sitepaneel voor één site.
Een geblokkeerd verzoek verhoogt een teller per tabblad, die op `did-navigate`
op nul gaat en meelift met `pushState()`. Die teller is de enige zichtbare
opbrengst; zonder telling weet niemand of het aanstaat.

---

## 11. IPC-kanalen

| kanaal | richting | payload |
| --- | --- | --- |
| `perm:ask` | main → balk | `{ id, origin, sleutels, tekst, workspace }` of `null` om te verbergen |
| `perm:answer` | balk → main | `(id, 'toestaan' \| 'deze-keer' \| 'blokkeren')` |
| `perm:state` | main → zijbalk | `{ origin, workspaceId, rijen, trackers, bescherming, assistentGeweigerd }` |
| `perm:set` | zijbalk → main | `(origin, sleutel, besluit)` |
| `perm:forget` | zijbalk → main | `(origin)` |
| `privacy:set` | zijbalk → main | `(origin \| null, aan)` — `null` is de hele workspace |

`perm:state` wordt gestuurd na elke `did-navigate`, na elk besluit en bij
tabbladwissel; de zijbalk hoeft er dus niets voor op te halen en houdt zelf geen
waarheid bij, net als bij `tabs:state`.

**Preloads.** `preload.js` krijgt vier methodes erbij (`onPermState`, `setPerm`,
`forgetSite`, `setPrivacy`), `preload-island.js` twee (`onVraag`, `antwoord`).
Geen `ipcRenderer` naar buiten, conform CLAUDE.md. De balk krijgt bewust géén
`setPerm`: hij mag antwoorden op een vraag die het hoofdproces gesteld heeft, en
verder niets.

---

## 12. Nieuwe bestanden en wat er in main.js bij moet

**Nieuw:**

| bestand | wat |
| --- | --- |
| `permissies.js` | beleidstabel, opslag, wachtrij, `hardenSession()`, beide handlers |
| `privacy.js` | `beoordeelURL()`, verboden schema's, webRequest-filters, referer |
| `trackers.js` | de `Set` met hostnamen, verder niets |
| `renderer/site.js` | het sitepaneel in de zijbalk |
| `renderer/site.css` | of erbij in `style.css`; kleuren als variabelen in `:root` |

**Let op `package.json`:** `build.files` staat nu op
`["main.js", "preload.js", "preload-island.js", "renderer/**"]`. Nieuwe
hoofdprocesbestanden in de wortel worden **niet meegepakt** door
electron-builder. `permissies.js`, `privacy.js` en `trackers.js` moeten erbij in
die lijst, anders start alleen de ontwikkelversie en crasht de installer-build
op een ontbrekende require.

**Aangepast (niet door mij, hier alleen beschreven):**

- `renderer/index.html` — slotknop in `#controls`, `#site-panel`, `<script
  src="site.js">`.
- `renderer/island.html` / `island.css` / `island.js` — de vraagregel met drie
  knoppen; `naarVraag()` en `naarRust()` naast de bestaande standen.
- `renderer/glyph.js` — de stand `vraag` in `GLYPH_KLEUREN`.
- `renderer/app.js` — het slotje bijwerken op `perm:state`, het stipje in
  `renderTab()`.

**In `main.js`:**

1. `session` erbij in de require uit `electron`.
2. `const { hardenSession, beslis, wachtrij } = require('./permissies.js')` en
   `const { beoordeelURL, filterVerzoeken } = require('./privacy.js')`.
3. Een module-brede omgekeerde index
   `const tabbladen = new Map()` — `webContents.id → { controller, tabId }`.
4. `addWorkspace()`: `hardenSession(session.fromPartition(partition), partition)`
   voordat de workspace in de Map gaat.
5. `app.whenReady()`: `hardenSession(session.defaultSession, 'default')`,
   `app.setAppUserModelId(...)`, de permissieopslag inlezen, en pas daarna het
   eerste venster.
6. `createTab()`: registreer in `tabbladen`, vervang de window-open-handler
   (§9), voeg `will-navigate` / `will-frame-navigate` / `will-redirect` toe, en
   `wc.on('destroyed', ...)` om de index en de wachtrij op te ruimen.
7. `closeTab()` / `closeWorkspace()`: wachtrij legen voor dat tabblad
   (`callback(false)`), index opruimen, en bij een workspace ook de opgeslagen
   besluiten en de sessiedata.
8. `describe()`: veld `slot` erbij.
9. `toURL()`: door `beoordeelURL()` heen; niet-intern wordt een zoekopdracht.
10. Nieuwe methodes op de controller: `toonVraag()`, `beantwoordVraag()`,
    `vraagExtern()`, `pushPermState()`.
11. De zes IPC-handlers uit §11, alle via `controllerFor(e)`.

---

## 13. Wat er mis kan gaan

- **Een callback die nooit geantwoord wordt.** De ergste fout in dit hele
  ontwerp: de pagina hangt, zonder foutmelding, voor altijd. Elk pad —
  tabblad dicht, venster dicht, navigatie weg, klok om, app afsluiten — moet
  eindigen in precies één `callback(...)`. Bouw dat als één functie
  `beantwoord(vraag, ja)` die zichzelf onschadelijk maakt na de eerste aanroep,
  en roep nergens anders de callback aan.
- **De check-handler die de request-handler overslaat.** Als Chromium bij een
  bepaalde permissie eerst synchroon checkt en bij `false` niet meer vraagt,
  ziet de gebruiker nooit een vraag en denkt hij dat de app stuk is. Dit moet
  per permissie getest worden (§14), niet aangenomen.
- **Vraagmoeheid.** Origin-per-origin en workspace-per-workspace betekent dat
  dezelfde site je in twee workspaces twee keer vraagt. Dat is met opzet, maar
  het is ook de meest waarschijnlijke reden dat iemand alles blind toestaat.
- **De vraag staat ver van de pagina.** Bovenin, gecentreerd boven het
  paginagebied, terwijl je muis bij de knop op de pagina staat. De kloppende
  glyph moet dat goedmaken; als dat in de praktijk niet werkt, is de volgende
  stap een korte animatie of het even dimmen van de pagina — niet het
  verplaatsen van de vraag, want er is geen andere laag.
- **Twee vensters, één sessie.** Een besluit in venster A geldt meteen in
  venster B. Verwacht, maar verwarrend als er in B een pagina open staat die
  al draait; die merkt het pas na een herlaad.
- **`persist:ws-1` in elk nieuw venster.** `nextWorkspaceId` begint per venster
  op 1, dus de eerste workspace van venster twee deelt zijn sessie — en dus zijn
  permissies — met de eerste van venster één. Dit ontwerp maakt die botsing
  zichtbaar maar lost hem niet op; dat hoort bij een ontwerp voor meerdere
  vensters.
- **Een te enthousiaste trackerlijst breekt sites.** Een geblokkeerde
  `consent`-of `recaptcha`-host levert een pagina op die niets doet en geen
  foutmelding geeft. Daarom de teller in het paneel en een schakelaar per site:
  als iemand meldt "deze site doet het niet", moet het antwoord binnen twee
  klikken te vinden zijn.
- **Referer inkorten breekt hotlink-beveiliging en enkele betaalformulieren.**
  Inkorten tot het origin is veiliger dan weglaten, maar niet gratis.

## 14. Wat dit niet oplost

- **Geen bescherming tegen een lek in Chromium zelf.** Sandbox staat aan,
  `contextIsolation` staat aan; een echte browser-exploit is buiten bereik van
  dit ontwerp.
- **Geen anti-fingerprinting.** De user agent opschonen haalt "Electron" weg,
  meer niet. Canvas, WebGL, lettertypen, schermmaat, tijdzone en client hints
  blijven allemaal leesbaar. Wie dat wil, bouwt iets heel anders.
- **Geen adblocker.** Advertenties blijven staan. Eerste-partij-analytics
  (`stats.example.com` op `example.com`) blijft draaien. Server-side tracking
  ziet dit ontwerp per definitie niet.
- **Geen phishing- of malwarelijst.** Electron heeft geen Safe Browsing. Een
  kwaadaardige site krijgt van ons geen waarschuwing, alleen minder rechten.
- **Geen wachtwoordbeheer, geen HTTPS-only-modus, geen certificaatscherm.** En
  belangrijk: voeg géén `certificate-error`-handler toe. Electron weigert nu
  slechte certificaten, en dat is precies goed; een handler die "doorgaan"
  aanbiedt is een achterdeur die niemand nodig heeft.
- **Geen manier om een lopende camerastream te stoppen.** Alleen herladen.
- **Geen scherm delen.** `display-capture` staat op weigeren tot de bronkiezer
  ontworpen is.
- **Geen instellingenscherm.** Alles staat per site en per workspace; er is geen
  centrale lijst "alle sites die je camera mogen". Dat hoort bij het
  instellingenontwerp en is hier bewust weggelaten.

## 15. Wat ik van de Electron-API niet zeker weet

Expliciet, zodat niemand hierop bouwt zonder te kijken. Dit is Electron 33.4.11.

- **De precieze inhoud van `details` per permissie.** `mediaTypes`,
  `securityOrigin`, `requestingUrl` en `isMainFrame` bestaan; of `requestingUrl`
  gevuld is bij élke permissie (en niet leeg bij een frame dat nog niets
  gecommit heeft) weet ik niet zeker. Log het één keer voor alle permissies
  voordat je erop bouwt, en val terug op `wc.getURL()`.
- **De permissie `fileSystem`** (File System Access API) en de bijbehorende
  velden `filePath` / `isDirectory` / `isWritable`: ik weet niet zeker of die in
  33 al door deze handler lopen of pas in een latere versie. Controleer dit voor
  je er UI voor bouwt.
- **Of een `false` uit de check-handler de request-handler overslaat.** De
  documentatie zegt dat de check-handler "de synchrone tegenhanger" is en
  gebruikt wordt bij onder meer `navigator.permissions.query()`. Of Chromium bij
  bijvoorbeeld `geolocation` eerst checkt en bij `false` niet meer vraagt, moet
  je meten. Dit bepaalt hoofdstuk 4.2 volledig.
- **`session.clearData(options)`** bestaat in deze reeks, maar de precieze namen
  in `dataTypes` en of `origins` alle opslagsoorten dekt, weet ik niet zeker. Het
  oudere `clearStorageData({ origin, storages })` is de veilige weg;
  vergelijk de twee voor je kiest.
- **Hoe een klik op een `mailto:`-link precies binnenkomt.** Ik weet niet zeker
  of Electron 33 dat als permissie `openExternal` aanbiedt, of alleen als een
  `will-navigate` met een onbekend schema. Behandel beide paden; ze komen in
  `vraagExtern()` toch samen.
- **`setDisplayMediaRequestHandler` met `{ useSystemPicker: true }`** — bestaat
  volgens mij, maar alleen op recente macOS. Niet op rekenen.
- **Of `select-hid-device` / `select-serial-port` / `select-usb-device` nog
  vuren** als de permissiecheck al `false` teruggaf. Zo ja, moeten die
  handlers óók geregistreerd worden, anders hangt de belofte.
- **Detecteren dát een site de camera nu gebruikt.** Ik ken geen Electron-API
  daarvoor (`media-started-playing` gaat over geluid dat de pagina afspeelt, niet
  over opnemen). Daarom zegt de UI "deze site mag je camera gebruiken" en niet
  "gebruikt nu je camera". Verzin daar geen indicator omheen die er niet is.
- **Geolocatie werkt in Electron via de geolocatiedienst van Google en vraagt om
  een API-sleutel bij het bouwen.** Zonder sleutel faalt een toegestane
  `getCurrentPosition()` alsnog. Test dat vóór je de vraag mooi maakt, anders
  bouw je een dialoog voor een functie die niet werkt.

## 16. Volgorde van bouwen

1. `permissies.js` met de tabel, de opslag en beide handlers — met een tijdelijk
   antwoord "alles wat vragen zou, weigeren". Daarmee is het gat uit §1.1 dicht,
   in één zitting, zonder één regel UI.
2. `privacy.js` met `beoordeelURL()`, de nieuwe window-open-handler en de
   navigatiegrendels. Daarmee is het gat uit §1.2 en §1.3 dicht.
3. De wachtrij en de vraag in de balk bovenin. Nu wordt "weigeren" "vragen".
4. Het slotje en het sitepaneel, inclusief intrekken en herladen.
5. Het assistentbeleid zichtbaar maken: `slot` in `describe()`, het stipje, en de
   route via `modus: 'actie'`.
6. Trackerlijst, ping-blokkade en referer inkorten, met de teller in het paneel.

Stap 1 en 2 zijn samen minder werk dan de rest en halen het grootste deel van
het risico weg. Doe ze eerst, ook als de rest blijft liggen.
