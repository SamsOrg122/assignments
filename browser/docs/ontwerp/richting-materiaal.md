# Richting B — Materiaal

Bouwt voort op `docs/ontwerp/ui-systeem.md`. Wat daar staat (de drie lagen, de
optische lettertypestacks, de radii-ladder, de componentklassen, de beslisboom in
§9, de nieuwe bestanden in §10) blijft gelden en herhaal ik hier niet. Waar deze
richting een regel uit dat document **omkeert**, staat dat er expliciet bij met de
reden. Dat gebeurt twee keer: bij de rand (§2.3, tegen ui-systeem §5) en bij de
maat van het eiland (§6.2, tegen ui-systeem §6.3).

---

## 0. De bewering

Tougather ziet er nu uit als een verzameling nette vlakken. Deze richting maakt
er een stapel van.

Het idee in één zin: **elk vlak in deze app heeft precies één eigenschap die
ertoe doet — hoe hoog het boven het bureaublad hangt — en alles wat je ziet is
een functie van dat ene getal.** Vulling, glans, rand, schaduw en vervaging kies
je niet los; je kiest een hoogte en de rest volgt. Dat is het verschil tussen
een sfeer en een systeem. Nu is `--fill-active` een kleur die iemand mooi vond;
straks is het niveau 3, en dan weet je meteen ook welke rand en welke schaduw
erbij horen, en welke beweging.

Twee materialen, en ze mengen nooit:

| Materiaal | Waar | Wat het doet |
| --- | --- | --- |
| **Glas** | de hele zijbalk, de commandobalk | halftransparant, gelaagd, licht vangt de randen |
| **Chassis** | het plafond en het eiland | dicht, donker in beide thema's, geen glans, geen hoogte |

Het chassis staat niet op de hoogte-as. Het is niet een hoger vlak, het is het
frame waar het glas in hangt. Daarom mag het eiland eruit gegoten worden en
daarom mag het plafond een schaduw op de zijbalk werpen zonder zelf ergens op te
liggen. Dat de huidige code al besloot dat `--plafond` buiten de licht/donker-
blokken staat, is precies deze gedachte — hij was alleen nog niet uitgesproken.

En de pagina is een derde ding: geen laag maar een venster. Hij hangt op y=44,
heeft een hoek van 12px en laat langs de rechter- en onderrand het materiaal
zien. Hij hoort nergens bij en dat is goed.

---

## 1. De hoogte-as

Zes standen. Alles wat je tekent kiest er één.

| Stand | Naam | Waarvoor | Vulling | Rand | Schaduw |
| --- | --- | --- | --- | --- | --- |
| **z0** | materiaal | niets tekenen | — | — | — |
| **z-** | ingelegd | trog, gleuf, leeg tabbladslot, ingedrukte knop | `--laag-in` | alleen bodemlijn | `--schaduw-in` |
| **z1** | plaat | de zijbalk zelf, rustend vlak | `--laag-1` | `--rand` | — |
| **z2** | aangeraakt | hover | `--laag-2` | `--rand` | `--schaduw-2` |
| **z3** | verheven | actief tabblad, actieve workspace, veld met focus | `--laag-3` | `--rand` + echte rim | `--schaduw-3` |
| **z4** | zwevend | commandobalk, straks popovers | `--paneel` + `backdrop-filter` | `--rand` + echte rim | `--schaduw-4` |

De belangrijkste toevoeging is **z-**, en die ontbreekt nu volledig. Zonder iets
dat *onder* het vlak ligt is alles boven en leest niets als een stapel. Een trog
is wat een verheven plaatje betekenis geeft: je ziet de gleuf waar hij uit komt.
Concreet krijgen we drie troggen: de knoprij, de lege-tabbladplek (`#new-tab`) en
elke ingedrukte staat.

Regel: **een element mag hoogstens één stand per keer verspringen.** Rust → hover
is z1→z2, hover → ingedrukt is z2→z-, ingedrukt loslaten op een tabblad is
z-→z3. Twee standen tegelijk (rust → verheven) is de enige uitzondering en
gebeurt alleen bij het wisselen van tabblad, waar de beweging sowieso niet mag
(§7.3).

---

## 2. Kleur en transparantie

Alles hieronder hoort in `renderer/tokens.css` (ui-systeem §10). Elk token dat in
het donkere blok staat, staat óók in `:root` — ui-systeem §2.3, en dat blijft.

`light-dark()` zou dit halveren en werkt in Chromium 130, maar hij hangt aan de
`color-scheme`-eigenschap en niet aan de mediaquery. Dat maakt een latere
handmatige themakeuze juist makkelijker (`html[data-thema="donker"] {
color-scheme: dark }`), maar het maakt de tokens minder greppelbaar en het
vermengt licht en donker in één regel. Niet doen zolang de tokens nog verhuizen.

### 2.1 De hoogteladder

De huidige trap is rekenkundig netjes en perceptueel scheef: licht loopt
.42/.62/.82 (stappen van .20 wit) en donker .06/.10/.14 (stappen van .04). In
licht is de bovenste stand daardoor vrijwel dicht — 82% wit plus een glans van
.55 plus een lijn van .85 — en slaat het acrylic dood op precies de plek waar je
het meest kijkt. In donker is dezelfde stand een verschil van 8% wit, en de
zwarte schaduw eronder doet op een donkere doorschijnende ondergrond niets.
Dezelfde regel, twee verschillende ontwerpen.

Hier is de trap perceptueel gelijk gemaakt in plaats van numeriek. Licht wordt
lager (het materiaal blijft leven), donker wordt hoger en leunt op de rand in
plaats van op de schaduw.

```css
:root {
  /* Lichte stand. De zijbalk is zelf een plaat (§4.3); alle waarden hieronder
     stapelen dáárop, niet rechtstreeks op het bureaublad. Daarom kunnen ze lager
     dan nu: --laag-3 op --zijbalk komt effectief op ~.71 wit uit, tegen .82 nu,
     en dat is de bovengrens waarboven het acrylic verdwijnt. */
  --zijbalk:  rgba(255, 255, 255, 0.16);
  --laag-in:  rgba(0, 0, 0, 0.055);
  --laag-1:   rgba(255, 255, 255, 0.30);
  --laag-2:   rgba(255, 255, 255, 0.46);
  --laag-3:   rgba(255, 255, 255, 0.66);
  --paneel:   rgba(252, 253, 255, 0.76);

  /* De glans die van boven wegvalt. Lager dan de huidige .55, want de rand
     (§2.3) doet nu een deel van het werk dat de glans in z'n eentje deed. */
  --glans: rgba(255, 255, 255, 0.42);
}

@media (prefers-color-scheme: dark) {
  :root {
    --zijbalk:  rgba(255, 255, 255, 0.03);
    /* Ingelegd is in donker zwart en niet minder-wit: een gleuf is een plek waar
       geen licht komt, en in donker is 'minder wit' geen zichtbaar verschil. */
    --laag-in:  rgba(0, 0, 0, 0.24);
    --laag-1:   rgba(255, 255, 255, 0.055);
    --laag-2:   rgba(255, 255, 255, 0.10);
    --laag-3:   rgba(255, 255, 255, 0.18);
    --paneel:   rgba(34, 35, 39, 0.80);

    --glans: rgba(255, 255, 255, 0.055);
  }
}
```

De stappen zijn nu .16 → .20 in licht en .045 → .08 in donker. Dat lijkt scheef
en is het niet: bovenop een donkere ondergrond levert 8% extra wit ongeveer
evenveel waargenomen verschil op als 20% extra wit bovenop een al lichte
ondergrond. Weber, niet rekenkunde.

### 2.2 Wat het glas glas maakt

```css
:root {
  --glas-vlak:   linear-gradient(180deg, var(--glans), transparent 62%);
  --glas-paneel: linear-gradient(180deg, var(--glans), transparent 34%);
}
```

Twee gradiënten, precies zoals ui-systeem §5 ze al beschrijft; alleen de
uitvalpunten zijn iets verschoven omdat de vulling lager is.

### 2.3 De rand — dit is de kern

**Hier keer ik ui-systeem §5 om.** Daar staat: alleen een haarlijn bovenaan, want
"een lijn rondom leest als een omlijning en dan is het geen glas meer maar een
kaartje met een randje". Dat klopt voor een *gelijkmatige* lijn. Het klopt niet
voor een lijn die van boven naar beneden uitdooft. Dat is precies het verschil
tussen een omlijning en een afschuining, en het is het enige waaraan je op een
schermafdruk ziet of iets van glas is of van papier.

Vier tokens, en de verhouding ertussen is het ontwerp:

```css
:root {
  /* Licht komt van boven. De bovenrand vangt het vol, de zijkanten strijkend,
     de onderrand krijgt alleen wat terugkaatst van het vlak eronder. */
  --rand-top:   rgba(255, 255, 255, 0.92);
  --rand-zij:   rgba(255, 255, 255, 0.42);
  --rand-bodem: rgba(255, 255, 255, 0.16);
  /* De donkere buitenlijn die de vorm afsluit. Zonder deze zweeft niets; met
     deze heeft het glas dikte. In donker is dit de sterkste van de vier. */
  --rand-kant:  rgba(0, 0, 0, 0.06);
}

@media (prefers-color-scheme: dark) {
  :root {
    --rand-top:   rgba(255, 255, 255, 0.16);
    --rand-zij:   rgba(255, 255, 255, 0.07);
    --rand-bodem: rgba(255, 255, 255, 0.03);
    --rand-kant:  rgba(0, 0, 0, 0.30);
  }
}
```

**De goedkope rim** — vier `inset`-schaduwen, geen extra element, volgt de
afronding. Dit is wat elk vlak in een lijst krijgt.

```css
:root {
  --rand:
    inset 0 1px 0 var(--rand-top),
    inset 1px 0 0 var(--rand-zij),
    inset -1px 0 0 var(--rand-zij),
    inset 0 -1px 0 var(--rand-bodem);
}
```

**De echte rim** — een gradiëntrand van 1px die de hoek helemaal rond loopt en
dus ook in de bochten van kleur verandert. Duurder (een pseudo-element plus een
mask per instantie) en daarom alleen op vlakken waarvan er precies één is: het
actieve tabblad, de actieve workspace, de kaart van de commandobalk, het veld met
focus.

```css
/* Een rand die van boven licht is en naar onderen uitdooft, ook in de bochten.
   Met vier inset-schaduwen doven de zijlijnen juist in de hoeken uit; met deze
   mask-truc loopt de kleur door. Alleen gebruiken waar er één van is. */
.rim {
  position: relative;
}

.rim::before {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: inherit;
  padding: 1px;
  background: linear-gradient(
    180deg,
    var(--rand-top),
    var(--rand-zij) 38%,
    var(--rand-bodem)
  );
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
  pointer-events: none;
}
```

`mask-composite: exclude` werkt in Chromium 120+, dus in Electron 33 (Chromium
130). Niet nagemeten in deze app; de `-webkit-`-regel staat erbij zodat een
mislukking een gevulde rechthoek oplevert die je meteen ziet in plaats van niets.

### 2.4 Schaduw

In licht doet de schaduw het werk, in donker de rand. Dat is geen compromis maar
natuurkunde: op een donkere doorschijnende ondergrond is een zwarte schaduw
onzichtbaar. Daarom is de donkere ladder in vulling en rand groter gemaakt (§2.1,
§2.3) en in schaduw kleiner.

```css
:root {
  --schaduw-in: inset 0 1px 3px rgba(0, 0, 0, 0.10);
  --schaduw-2:  0 1px 1px rgba(0, 0, 0, 0.04);
  --schaduw-3:  0 1px 2px rgba(0, 0, 0, 0.05), 0 6px 14px -4px rgba(0, 0, 0, 0.10);
  --schaduw-4:  0 2px 6px rgba(0, 0, 0, 0.07), 0 24px 56px -12px rgba(0, 0, 0, 0.24);
  /* Het plafond ligt op de zijbalk, niet erin. Dit is de enige schaduw die het
     chassis werpt. */
  --schaduw-plafond: 0 6px 14px -6px rgba(0, 0, 0, 0.34);
}

@media (prefers-color-scheme: dark) {
  :root {
    --schaduw-in: inset 0 1px 3px rgba(0, 0, 0, 0.40);
    --schaduw-2:  0 1px 1px rgba(0, 0, 0, 0.20);
    --schaduw-3:  0 1px 2px rgba(0, 0, 0, 0.30), 0 8px 18px -5px rgba(0, 0, 0, 0.45);
    --schaduw-4:  0 2px 8px rgba(0, 0, 0, 0.40), 0 28px 64px -14px rgba(0, 0, 0, 0.62);
    --schaduw-plafond: 0 6px 16px -6px rgba(0, 0, 0, 0.62);
  }
}
```

Let op de negatieve spread in `--schaduw-3` en `--schaduw-4`. Dat is wat
ui-systeem §11 bedoelt met "veel spread wordt op een licht bureaublad een grijze
vlek": een schaduw die kleiner begint dan zijn element en dan pas uitwaaiert
blijft schoon.

### 2.5 Tekst

```css
:root {
  --text:  rgba(0, 0, 0, 0.88);
  --muted: rgba(0, 0, 0, 0.60);
  --faint: rgba(0, 0, 0, 0.38);
}

@media (prefers-color-scheme: dark) {
  :root {
    --text:  rgba(255, 255, 255, 0.94);
    --muted: rgba(255, 255, 255, 0.58);
    --faint: rgba(255, 255, 255, 0.34);
  }
}
```

`--muted` gaat van .46 naar .60 in licht en van .50 naar .58 in donker. Reden:
`--muted` is de kleur van élke inactieve tabbladtitel, en dat is precies de lijst
die je scant om te vinden waar je heen wilt. Op .46 haalt dat op wit ongeveer
3,5:1 (met de hand gerekend volgens WCAG, niet gemeten) en door acrylic over een
willekeurig bureaublad wordt het slechter. Op .60 zit het rond 5,5:1 en blijft er
genoeg ruimte over naar `--text`.

Dat kan alleen omdat het onderscheid actief/inactief in deze richting van
**gewicht** komt en niet meer van verbleking (§3). Zolang kleur de hele
hiërarchie in haar eentje moet dragen, kun je `--muted` niet ophogen zonder het
verschil weg te gooien.

### 2.6 Drie kleurpaletten, drie taken

Nu betekent dezelfde kleur op één rij twee dingen: `--accent` (#007aff) en
`--ws-0` (#007aff) zijn letterlijk identiek, de groene glyph (rgb 62,210,128)
ligt bovenop `--ws-2` (#34c759), en er lopen zes verschillende blauwen door de
app. In een app waar kleur *de* betekenisdrager is — de workspace-kleur zegt
welke context, de glyph-kleur zegt wat de assistent doet — is dat de duurste fout
die er is.

Drie paletten, en ze overlappen niet:

```css
:root {
  /* 1. Accent: selectie, focus, primaire actie. Eén blauw, nergens anders. */
  --accent: #007aff;
  --on-accent: #ffffff;
  --danger: #ff3b30;

  /* 2. Workspaces: welke wereld. Bewust zonder accentblauw, want de eerste
     workspace krijgt iedereen standaard en die mag niet de kleur van selectie
     hebben. Ook bewust zonder de modus-groen en de modus-oranje hieronder. */
  --ws-0: #ff6b57;
  --ws-1: #f0a020;
  --ws-2: #2f9e6e;
  --ws-3: #7d6bf0;
  --ws-4: #e0559b;
  --ws-5: #2bb0c4;

  /* 3. Modi van de assistent. Als kanalen, zodat glyph.js ze kan lezen én CSS ze
     via rgb(var(--modus-x)) kan gebruiken — één bron voor het canvas en de rand
     van de rij waar hij in werkt. Rust is expres kleurloos: kleur betekent in
     deze app 'er gebeurt iets'. */
  --modus-rust:       138 146 162;
  --modus-invoer:     168 178 196;
  --modus-debuggen:    92 156 255;
  --modus-zoeken:     255  92  88;
  --modus-lezen:      244 198  70;
  --modus-analyseren:  58 206 150;
  --modus-actie:      255 148  38;
  --modus-klaar:       58 206 150;
}

@media (prefers-color-scheme: dark) {
  :root {
    --accent: #0a84ff;
    --danger: #ff453a;

    --ws-0: #ff8674;
    --ws-1: #ffb43f;
    --ws-2: #3fc189;
    --ws-3: #9a8bff;
    --ws-4: #ff6fae;
    --ws-5: #45ccdf;
  }
}
```

De modi blijven in beide thema's gelijk, net als het chassis: ze worden altijd op
`--plafond` of op een gloeiend canvas getekend.

`--assistent` (#ff9f0a) verdwijnt. Dat token bestond om te zeggen "er werkt een
assistent", maar het staat nu naast een glyph die dat óók zegt en die daarbij ook
nog vertelt *wat* hij doet. Twee statuskleuren op één rij die elkaar
tegenspreken. Wat ervoor in de plaats komt staat in §5.6.

**glyph.js leest de kleuren uit CSS.** Dat kan zonder build-stap en het haalt de
laatste losse kleurwaarden uit de code, zoals CLAUDE.md voorschrijft:

```js
// De kleuren staan in tokens.css, niet hier: kleur is in deze app betekenis, en
// betekenis hoort op één plek te staan. Kanalen als "255 92 88", zodat dezelfde
// token in CSS met rgb(var(--modus-zoeken)) bruikbaar blijft.
function modusKleur(naam) {
  const ruw = getComputedStyle(document.documentElement)
    .getPropertyValue(`--modus-${naam}`)
    .trim();
  const kanalen = ruw.split(/\s+/).map(Number);
  return kanalen.length === 3 && kanalen.every(Number.isFinite)
    ? kanalen
    : [138, 146, 162];
}
```

Voorwaarde: `tokens.css` wordt door zowel `index.html` als `island.html` geladen.
Dat staat al zo in ui-systeem §10. `getComputedStyle` is een web-API, dus
`glyph.js` blijft geschikt voor het sandboxed tabblad (CLAUDE.md-regel over
gedeelde code).

### 2.7 De scrim

`--scrim` is in licht nu `rgba(255,255,255,.28)`: een wit waas over een zijbalk
die zelf al uit witte lagen bestaat. Dat verkleint het verschil tussen de zijbalk
en de kaart erboven in plaats van het te vergroten — de commandobalk zweeft niet,
hij smelt. In donker (zwart .28) werkt hetzelfde token wel.

```css
:root {
  /* Een scrim duwt terug wat eronder ligt. Wit op wit doet het omgekeerde, dus
     in licht een koele, iets donkerdere sluier plus een lichte vervaging: de
     zijbalk zakt weg in plaats van op te lichten. */
  --scrim: rgba(28, 32, 44, 0.14);
  --scrim-vervaging: blur(2px) saturate(0.9);
}

@media (prefers-color-scheme: dark) {
  :root {
    --scrim: rgba(0, 0, 0, 0.34);
    --scrim-vervaging: blur(2px) saturate(0.9);
  }
}
```

`backdrop-filter` op de scrim vervaagt alleen wat in dezelfde renderer getekend
is — de zijbalk dus, en dat is precies wat we willen. De pagina is er op dat
moment sowieso niet, want `setPaletteOpen(true)` haalt hem weg.

---

## 3. Typografie

`font-weight` komt nul keer voor in `style.css`. De hele zijbalk staat op 13px
en één gewicht: tabbladtitel, workspacenaam, adresbalk en "Nieuw tabblad" zijn
typografisch exact hetzelfde ding. Daardoor moet kleur in haar eentje de hele
hiërarchie dragen, en op een doorschijnende ondergrond is kleurcontrast juist het
zwakste middel dat je hebt.

**De regel voor deze richting: gewicht draagt de rangorde, kleur draagt de
staat.** Actief tegenover inactief is 500 tegenover 400. Beschikbaar tegenover
niet-beschikbaar is `--text` tegenover `--muted`. Twee onafhankelijke assen in
plaats van één overbelaste. Dat is niet alleen netter, het is op glas ook
robuuster: een gewichtsverschil overleeft elk bureaublad, een verschil van 15%
zwart niet.

De schaal is die uit ui-systeem §3.2 — ik verzin er geen nieuwe. Wat hier staat
is waar hij landt:

| Element | Familie | Maat / regel | Gewicht | Kleur |
| --- | --- | --- | --- | --- |
| `#address` | text | 13 / 1.45 | 400 | `--text` |
| `#address::placeholder` | text | 13 / 1.45 | 400 | `--faint` |
| `.tab .title` | text | 13 / 1.45 | **400** | `--muted` |
| `.tab[aria-current="true"] .title` | text | 13 / 1.45 | **500** | `--text` |
| `.tab.loading .title` | text | 13 / 1.45 | 400 | `--muted` |
| `#new-tab span` | text | 13 / 1.45 | 400 | `--muted` |
| `#new-tab kbd` | small | 10 / 1.2 | 500 | `--faint` |
| `.ws .name` | small | **11 / 1.3** | **500** | `--text` |
| `.result .label` | text | 13 / 1.45 | 400 | `--muted` |
| `.result[aria-selected] .label` | text | 13 / 1.45 | **500** | `--text` |
| `.result .kind` | small | 11 / 1.3 | 400 | `--faint` |
| `#palette-input` | text | 15 / 1.4 | 400 | `--text` |
| `#huidig` (eiland) | text | 14 / 1.4 | **500** | `--tekst` |
| `#vorige` (eiland) | small | 11 / **14px** | 400 | `--zacht` |
| `#stop`, `#ga` (eiland) | small | 12 / 1 | **500** | eigen |

Drie dingen die hierin een besluit zijn:

**De workspacenaam wordt 11px/500.** Hij is geen inhoud maar een containerlabel —
hij zegt in welke wereld je bent, niet wat er in staat. Kleiner en zwaarder is
precies wat een label doet; even groot als een tabbladtitel maakt hem tot een
zesde tabblad.

**Een ladende rij houdt zijn titel.** Nu gooit `renderTab` de paginatitel weg en
zet er `Laden…` in `--faint` voor in de plaats. Dat is dubbel mis: `--faint` is
volgens ui-systeem §2.3 decoratief en hier is het de enige tekst in de rij, en
omdat `did-navigate-in-page` bij elke `pushState()` van een SPA vuurt zie je de
regel voortdurend van leesbaar naar bleekgrijs en terug flikkeren. De titel
blijft staan; dat er iets laadt zegt de faviconplek (§5.5).

**Getallen die verspringen krijgen `font-variant-numeric: tabular-nums`.** Nu is
er nog niets dat telt; zodra de workspacechip een tabbladteller krijgt of er
downloads bij komen, is dit de regel.

---

## 4. De zijbalk als compositie

### 4.1 Twee rails, 8px uit elkaar

Er zijn nu drie bijna gelijke linkerkantlijnen: de inkt van het terug-pictogram
begint op ~24,5px, de tekst in de adresbalk op 25px, het favicon-vak van een
tabblad op 20px. Vier tot vijf pixels verschil is te klein om als bedoelde
inspringing te lezen en te groot om als uitlijning te lezen; het oog registreert
het als een trillende rand over de volle hoogte van de kolom.

In deze richting zijn er twee rails, en het verschil ertussen is een keuze:

- **Rail A — 12px. Waar een plaat begint.** De trog van de knoprij, de adresbalk,
  elke tabbladrij, elke workspacechip. Dit is de rand die je ziet zodra iets
  hoogte heeft.
- **Rail B — 20px. Waar inkt begint.** Het favicon, het eerste teken in de
  adresbalk, de eerste letter van een tabbladtitel is dan 20 + 16 + gap.

8px ertussen, één stap van het raster. Twee gevolgen in de code:

```css
/* Zonder rand komt de tekst op 12 + 8 = 20px uit, precies op rail B. De rand
   was toch al vervangen door licht (§2.3), dus dit kost niets. */
#address {
  padding: 0 8px;
  border: 0;
}
```

En de knoprij wordt één vlak in plaats van drie losse knoppen (§4.4). Dat is de
echte oplossing voor de wiebelende kantlijn: nu is de waargenomen linkerrand van
dat blok 12px zodra je hovert en 24,5px als je dat niet doet, want zonder
hovervlak zie je alleen de inkt van een chevron.

### 4.2 Verticaal ritme

De blokafstanden zijn nu 8, 12, 8 en 16 — vier verschillende waarden zonder dat
het verschil iets betekent — en bóven de eerste knoprij staat 0px lucht, want
`padding-top` is exact `--topbar-height`. De navigatieknoppen raken daardoor
letterlijk de onderrand van het donkere plafond: de meest opvallende naad in het
beeld, en er staat geen enkele ruimte omheen.

Eén blokafstand, 12px, overal:

```css
#sidebar {
  position: fixed;
  inset: 0 auto 0 0;
  width: var(--sidebar-width);
  display: flex;
  flex-direction: column;
  gap: 12px;
  /* 10px lucht onder het plafond: de knoprij hangt eronder in plaats van eraan
     vast te zitten. Onder blijft 12px, gelijk aan de blokafstand. */
  padding: calc(var(--topbar-height) + 10px) 12px 12px;
}
```

De verdeling wordt dan, van boven naar beneden: 54 / knoprij 30 / 12 / adresbalk
34 / 12 / tabbladlijst (rest, rijen 34, tussenruimte 2) / 12 / lege plek 34 / 12 /
voet. De adresbalk gaat van 33 naar 34px zodat hij exact even hoog is als een
tabbladrij — twee elementen van bijna dezelfde hoogte pal onder elkaar is één van
die dingen die je niet ziet maar wel voelt.

`#tablist` verliest zijn `margin: 4px 0 0` — die 4px maakte van de blokafstand
stiekem 12 op één plek en 8 op de rest.

### 4.3 De zijbalk is zelf een plaat

Dit is de bepalende ingreep van deze richting, en de duurste (§9.1).

`#sidebar` heeft nu geen achtergrond: elk vlak in de kolom stapelt rechtstreeks
op het bureaublad van de gebruiker. Dat maakt de hoogte-as onbetrouwbaar (je weet
nooit waar je vanaf begint) en de leesbaarheid onvoorspelbaar (`--muted` op een
foto is niet `--muted` op een egale kleur).

```css
/* De rail is een plaat, geen gat. Alles in de kolom stapelt hierop, dus de
   hoogte-as begint bij een bekend vlak in plaats van bij iemands bureaublad. */
#sidebar {
  background-color: var(--zijbalk);
  /* Alleen rechts een rand: dat is de enige kant waar de plaat ophoudt en de
     pagina begint. Boven zit het plafond, links en onder de vensterrand. */
  box-shadow: inset -1px 0 0 var(--rand-kant);
}

/* Het plafond ligt óp de plaat en zegt dat met een schaduw, niet met een naad. */
#drag-strip {
  position: fixed;
  inset: 0 0 auto 0;
  height: var(--topbar-height);
  background: var(--plafond);
  box-shadow: var(--schaduw-plafond);
  -webkit-app-region: drag;
}
```

De schaduw onder het plafond is het antwoord op de stompe aansluiting: de enige
plek waar dit ontwerp echt zorgvuldig is (de gegoten hoekjes van de pil) staat nu
20px naast de plek waar het het slordigst is. Een schaduw zegt "dit ligt erboven"
overtuigender dan een uitgesneden hoek, hij werkt over de volle breedte, en hij
kost één regel.

De pil komt nog steeds uit het plafond met zijn holle hoekjes, en die blijven
werken omdat `#drag-strip` en `#kaart` dezelfde `--plafond` gebruiken. Wat er wél
bij komt: de schaduw van het plafond loopt óók onder de pil door, en de pil moet
dus zijn eigen schaduw krijgen die daarop aansluit (§6.1).

### 4.4 De knoprij als trog

```css
/* Eén ingelegde groep in plaats van drie losse knoppen. Zonder trog is de
   linkerrand van dit blok 12px als je hovert en 24,5px als je dat niet doet,
   want dan zie je alleen de inkt van een chevron. Nu ligt hij altijd op 12. */
#controls {
  flex: none;
  display: flex;
  align-items: center;
  gap: 2px;
  width: max-content;
  padding: 2px;
  border-radius: var(--radius-field);
  background-color: var(--laag-in);
  box-shadow: var(--schaduw-in), inset 0 -1px 0 var(--rand-bodem);
}

#controls button {
  width: 30px;
  height: 30px;
  display: grid;
  place-items: center;
  /* Concentrisch: 11 buiten − 2 vulling = 9 binnen. */
  border-radius: var(--radius-pill);
  color: var(--muted);
  transition:
    background-color var(--duur-vlak) var(--ease-vlak),
    color var(--duur-vlak) var(--ease-vlak),
    box-shadow var(--duur-vlak) var(--ease-vlak),
    opacity var(--duur-vlak) var(--ease-vlak);
}

#controls button:hover:not(:disabled) {
  background-color: var(--laag-2);
  box-shadow: var(--rand);
  color: var(--text);
}

/* Ingedrukt zakt de knop terug de trog in. Dit is de eerste :active-stand in de
   hele app; tussen de klik en het antwoord van het hoofdproces zit een
   IPC-rondgang, en daar bevestigt nu niets dat de klik geland is. */
#controls button:active:not(:disabled) {
  background-color: var(--laag-in);
  box-shadow: var(--schaduw-in);
  transform: scale(0.94);
}

#controls button:disabled {
  opacity: 0.32;
}
```

`opacity` staat nu níét in de overgangslijst terwijl het verschil tussen aan en
uit juist `opacity: 0.32` is — dus de terug- en vooruitknop knipperen hard bij
elke navigatie. Eén woord toevoegen lost dat op; dat het ontbrak laat zien dat de
overgangslijsten per selector zijn overgeschreven in plaats van uit een gedeeld
recept te komen (§7.1).

De trog gaat 3 × 30 + 2 × 2 + 2 × 2 = 98px breed. Naast de trog blijft ~142px
over, en daar past de instellingenknop rechts uitgelijnd (§4.6).

### 4.5 De lege plek

`#new-tab` heeft nu exact dezelfde geometrie en hoverbehandeling als een tabblad —
hoogte 34, `--radius-tab`, `padding: 0 8px`, `gap: 9`, hover op `--fill`. Een
actie ziet er dan uit als een item, dus de lijst lijkt altijd één tabblad meer te
bevatten dan er is.

De materiaal-oplossing is niet "zachter maken" maar **omdraaien**: een nieuw
tabblad is een lege plek, dus teken een lege plek. Ingelegd in plaats van
verheven, precies de vorm van een tabbladrij, met de gleuf zichtbaar.

```css
/* Geen knop die op een tabblad lijkt, maar het gat waar het volgende tabblad uit
   komt. Ingelegd (z-) is het enige niveau dat niet als item leest, en het maakt
   de intree-animatie in §7.2 letterlijk kloppend: de nieuwe rij komt hier vandaan. */
#new-tab {
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
  height: 34px;
  padding: 0 8px;
  border-radius: var(--radius-tab);
  background-color: var(--laag-in);
  box-shadow: var(--schaduw-in);
  color: var(--faint);
  transition:
    background-color var(--duur-vlak) var(--ease-vlak),
    color var(--duur-vlak) var(--ease-vlak),
    box-shadow var(--duur-vlak) var(--ease-vlak);
}

#new-tab:hover {
  background-color: var(--laag-1);
  box-shadow: var(--rand);
  color: var(--muted);
}

#new-tab:active {
  background-color: var(--laag-in);
  box-shadow: var(--schaduw-in);
  transform: scale(0.994);
}

#new-tab svg { width: 16px; height: 16px; }
#new-tab span { flex: 1; text-align: left; }
```

Bij hover komt de gleuf omhoog tot de plaat-stand — hij vult zich alvast. Dat is
één stand omhoog en dus binnen de regel uit §1.

### 4.6 De voet

De workspace-strip staat op een andere maatvoering dan de rest van de kolom:
stippen van 9px waar elk ander pictogram 14–16px is, chips van 28px onder rijen
van 34px, onderlinge afstand 3px terwijl de tabbladen op 2px en de blokken op 8px
staan. De stip draagt bovendien een halo van `0 0 0 3px`, dus optisch 15px in een
chip met 8px binnenmarge, en de halo's van twee buurchips komen tot op ~3px bij
elkaar. Dat is de krapte.

```css
#workspaces {
  flex: none;
  display: flex;
  align-items: center;
  gap: 6px;
  padding-top: 12px;
  /* De scheidingslijn hoort bij het glas, dus dezelfde donkere kantlijn als de
     rechterrand van de plaat — niet een eigen grijstint. */
  border-top: 1px solid var(--rand-kant);
}

#workspace-list {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 4px;
  list-style: none;
  margin: 0;
  padding: 2px 0;
  overflow-x: auto;
  /* De scrollbalk staat op nul en er stond niets voor in de plaats, dus inhoud
     hield gewoon op halverwege een stip. Een verloop van 14px zegt dat er meer
     is, zonder een scrollbalk terug te zetten. */
  mask-image: linear-gradient(90deg, #000 calc(100% - 14px), transparent);
  scrollbar-width: none;
}

#workspace-list::-webkit-scrollbar { height: 0; }

.ws {
  flex: none;
  display: flex;
  align-items: center;
  gap: 7px;
  height: 32px;
  max-width: 132px;
  padding: 0 9px;
  border-radius: var(--radius-pill);
  color: var(--muted);
  transition:
    background-color var(--duur-vlak) var(--ease-vlak),
    color var(--duur-vlak) var(--ease-vlak),
    box-shadow var(--duur-vlak) var(--ease-vlak);
}

/* Geen halo maar een kraal: een bolletje met een lichtpunt linksboven en een
   donkere onderrand. Dat is dezelfde lichtinval als elk ander vlak in de kolom,
   alleen op 12px. De halo maakte de stip optisch 15px breed en botste met zijn
   buren; dit niet. */
.ws .dot {
  width: 12px;
  height: 12px;
  flex: none;
  border-radius: 50%;
  background:
    radial-gradient(circle at 32% 26%, rgba(255, 255, 255, 0.72), transparent 48%),
    var(--ws-kleur);
  box-shadow:
    inset 0 -1px 1px rgba(0, 0, 0, 0.20),
    0 1px 1.5px rgba(0, 0, 0, 0.16);
}

.ws:hover:not([aria-current="true"]) {
  background-color: var(--laag-1);
  box-shadow: var(--rand);
  color: var(--text);
}

.ws[aria-current="true"] {
  background-color: var(--laag-3);
  background-image: var(--glas-vlak);
  box-shadow: var(--rand), var(--schaduw-3);
  color: var(--text);
}

.ws:active {
  box-shadow: var(--schaduw-in);
  transform: scale(0.97);
}
```

Stip 12, chip 32, tussenruimte 4 — daarmee staat de voet op hetzelfde raster als
de rest: 12/16 iconen, 32/34 rijen, 4px halve stap.

**De sluitknop mag de layout niet meer verspringen.** `.ws .close` schakelt nu
tussen `display: none` en `display: grid`, en omdat de chip inhoud-breed is
(`flex: none`) groeit hij bij hover met ~24px en duwt hij alle chips rechts van
hem opzij. De `transition` die eronder staat draait bovendien nooit, want een
element dat van `display` wisselt animeert niet. `.tab .close` doet hetzelfde met
`opacity` en verschuift dus niets — dat is het juiste patroon:

```css
/* Zelfde mechanisme als bij een tabblad: altijd in de layout, alleen onzichtbaar.
   Met display: none groeit de chip bij hover en schuift de hele strip opzij. */
.ws .close {
  flex: none;
  width: 18px;
  height: 18px;
  display: grid;
  place-items: center;
  border-radius: var(--radius-icon);
  color: var(--faint);
  opacity: 0;
  pointer-events: none;
  transition: opacity var(--duur-tik) var(--ease-vlak);
}

.ws[aria-current="true"]:hover .close,
.ws .close[data-armed="true"] {
  opacity: 1;
  pointer-events: auto;
}

/* Onder 12px opgetekend heeft een lijn van 1.6 in een viewBox van 16 nog 0,9
   apparaatpixel over: dat wordt geen kruis maar een vlek. Zie ui-systeem §7.10. */
.ws .close svg { width: 10px; height: 10px; stroke-width: 1.8; }
.tab .close svg { width: 11px; height: 11px; stroke-width: 1.8; }
```

**En de instellingenknop.** Er is nergens een ingang naar instellingen en er is in
de huidige compositie ook geen plek waar er één past — de voet is 240px breed en
al gevuld. Een achtste ding erbij proppen maakt precies het probleem groter dat
de eigenaar noemt.

De ruimte staat bóven, niet onder: `#controls` gebruikt 98 van de 240px. Het
tandwiel komt daar rechts uitgelijnd te staan, **buiten** de trog:

Dit vraagt één wijziging in `index.html`: `#controls` wordt de trog met de drie
navigatieknoppen erin, en er komt een `<div id="controls-rij">` omheen die de
trog links en het tandwiel rechts houdt.

```css
#controls-rij {
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
}

/* Buiten de trog, en dus zichtbaar iets anders dan navigatie. Rechts, waar in
   elke browser de 'meer'-knop staat, en op de rij met de andere venster-brede
   bediening in plaats van tussen de workspaces, waar hij zou lezen als
   'instellingen van deze workspace'. */
#instellingen {
  margin-left: auto;
  width: 30px;
  height: 30px;
  display: grid;
  place-items: center;
  border-radius: var(--radius-control);
  color: var(--muted);
}
```

Kosten nul verticale pixels, en de knop staat niet in een strook die al te krap
is. Belangrijker dan de knop zijn trouwens de sneltoets (`Ctrl ,`) en een regel
"Instellingen" in de commandobalk — dat is de enige plek in deze app waar iets
vindbaar is. Beide vallen buiten deze richting; ze staan hier omdat een tandwiel
zonder die twee alsnog het enige spoor is.

### 4.7 Wat er weg mag

Zeven dingen, en de kolom wordt er alleen maar duidelijker van:

1. **De achtergrond van de lege faviconplaatshouder.** `.favicon { background:
   var(--fill) }` gebruikt hetzelfde token als de hoverstaat van de rij. Op een
   rustende rij is dat een lichte chip (het uitgevinkte selectievakje dat de
   eigenaar ziet), op hover verdwijnt hij (vlak en plaatshouder zijn identiek), op
   de actieve rij wordt hij donkerder dan zijn omgeving (een gaatje). Eén element
   dat licht, onzichtbaar én donker is binnen dezelfde lijst leest als een fout.
   Leeg is leeg; het vak reserveert alleen ruimte.
2. **De halo om de workspacestip.** Vervangen door de kraal (§4.6).
3. **De rand van de adresbalk.** Vervangen door licht (§2.3), en het levert
   meteen rail B op.
4. **De gereserveerde 29px voor de sluitknop.** Zie §5.4.
5. **`Kim · ` vóór de tabbladtitel.** De gloeiende glyph zegt het al, en het kost
   ~35px van de ~170px die de titel heeft.
6. **Het `.bezig`-stipje.** Zie §5.6.
7. **De vier `border-radius`-waarden die nergens op slaan.** De radii vormen nu
   geen ladder maar een bijna aaneengesloten reeks: 4, 5, 6, 7, 8, 9, 10, 11, 17,
   18, waarvan er drie als variabele bestaan en de rest losse getallen zijn.
   Verschillen van 1px lezen niet als een keuze maar als slordigheid — `.ws` 9px
   naast `#new-workspace` 9px naast `.tab` 10px in dezelfde kolom. De ladder uit
   ui-systeem §4.1 is al uitgeschreven; die overnemen is één keer zoeken en
   vervangen, en het haalt de laatste losse getallen weg die tegen de
   projectregel in gaan.

---

## 5. Het tabblad als object

Zes standen. Dit is het element dat er het vaakst staat en waar de hoogte-as het
meest waard is.

```css
.tab {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  height: 34px;
  padding: 0 8px;
  border-radius: var(--radius-tab);
  color: var(--muted);
  transition:
    background-color var(--duur-vlak) var(--ease-vlak),
    color var(--duur-vlak) var(--ease-vlak),
    box-shadow var(--duur-vlak) var(--ease-vlak),
    transform var(--duur-tik) var(--ease-vlak);
}
```

### 5.1 Rust — z0

Niets. Geen vulling, geen rand, geen schaduw. Alleen inkt op de plaat van de
zijbalk. Een lijst van twintig tabbladen mag geen lijst van twintig vlakken zijn.

### 5.2 Aanwijzen — z2

```css
.tab:hover {
  background-color: var(--laag-2);
  box-shadow: var(--rand), var(--schaduw-2);
  color: var(--text);
}
```

Rand plus een schaduw van 1px: net genoeg om te zeggen "dit komt los", niet
genoeg om te concurreren met het actieve tabblad.

### 5.3 Indrukken — z-

```css
/* Er bestaat nu geen enkele :active-stand in de hele applicatie. Tussen de klik
   en het antwoord van het hoofdproces zit een IPC-rondgang plus een hertekening,
   en in dat gat bevestigt niets dat de klik geland is. Dat is de grootste
   ontbrekende beweging in de app en de goedkoopste om te repareren. */
.tab:active {
  background-color: var(--laag-in);
  box-shadow: var(--schaduw-in);
  transform: scale(0.988);
  transition-duration: var(--duur-druk);
}
```

`scale(0.988)` op een rij van 240 × 34 is ongeveer 3px in de breedte — genoeg om
te voelen, te weinig om de tekst te zien springen.

**Let op de wisselwerking met §7.4.** Zolang de lijst met `replaceChildren()`
wordt herbouwd, gaat `:active` op een tabbladrij waarschijnlijk alsnog verloren
als er tussen `mousedown` en `mouseup` een `pushState` landt: Chromium hangt de
actieve keten aan het element dat de `mousedown` kreeg, en dat element bestaat dan
niet meer. Niet nagemeten in deze app. Op de stabiele elementen (`#controls`,
`#new-tab`, `#new-workspace`, de twee knoppen in het eiland) speelt dat sowieso
niet, dus daar werkt `:active` meteen.

### 5.4 Actief — z3

Het enige vlak in de zijbalk dat de echte rim krijgt, want er is er precies één
van en het is de plek waar de hoogte moet overtuigen.

```css
.tab[aria-current="true"] {
  background-color: var(--laag-3);
  background-image: var(--glas-vlak);
  box-shadow: var(--schaduw-3);
  color: var(--text);
}

.tab[aria-current="true"] .title {
  font-weight: 500;
}

/* De echte rim uit §2.3, alleen hier. In een lijst van twintig rijen is een
   pseudo-element met een mask per rij niet gratis; op één rij wel. */
.tab[aria-current="true"]::before {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: inherit;
  padding: 1px;
  background: linear-gradient(
    180deg,
    var(--rand-top),
    var(--rand-zij) 38%,
    var(--rand-bodem)
  );
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
  pointer-events: none;
}
```

**De sluitknop eist geen breedte meer op.** Elke rij reserveert nu permanent 29px
(kruisje 20 + gap 9) voor een knop die je meestal niet ziet; van de 240px
binnenbreedte blijft ~170px over voor de titel, en bij een assistent ~135px.

```css
.tab .close {
  position: absolute;
  right: 5px;
  top: 50%;
  translate: 0 -50%;
  width: 20px;
  height: 20px;
  display: grid;
  place-items: center;
  border-radius: var(--radius-icon);
  color: var(--muted);
  opacity: 0;
  /* opacity: 0 haalt een element niet uit de muisafhandeling. Bij een
     trackpad-tik zonder voorafgaande hover sluit je nu een tabblad zonder de knop
     ooit gezien te hebben. */
  pointer-events: none;
  transition:
    opacity var(--duur-tik) var(--ease-vlak),
    background-color var(--duur-tik) var(--ease-vlak);
}

.tab:hover .close,
.tab[aria-current="true"] .close {
  opacity: 1;
  pointer-events: auto;
}

/* De titel loopt onder het kruisje door en vervaagt daar, in plaats van 29px af
   te staan aan een knop die je meestal niet ziet. Levert ~29px titel op in het
   gewone geval. */
.tab:hover .title,
.tab[aria-current="true"] .title {
  mask-image: linear-gradient(90deg, #000 calc(100% - 36px), transparent calc(100% - 8px));
}
```

### 5.5 Ladend

De titel blijft staan (§3). Wat ademt is de faviconplek, en alleen als er geen
favicon is:

```css
.tab .favicon {
  width: 16px;
  height: 16px;
  flex: none;
  border-radius: 4px;
  /* Geen achtergrond. Leeg is leeg; zie §4.7. En bij een PNG met transparantie
     piepte de lichte vulling anders onder het logo vandaan. */
}

/* Een ademend vlak in plaats van een leeg gat, maar alleen zolang er ook echt
   niets staat: met favicon is de favicon zelf het bewijs dat er iets gebeurt. */
.tab.loading .favicon:not([src]) {
  background-color: var(--laag-in);
  box-shadow: var(--schaduw-in);
  animation: adem 1.4s var(--ease-vlak) infinite;
}

@keyframes adem {
  0%, 100% { opacity: 0.45; }
  50%      { opacity: 1; }
}
```

Een 404 op een favicon-URL levert nu het gebroken-afbeeldingicoon op; `merk.onerror
= () => merk.removeAttribute('src')` in `renderTab` maakt daar hetzelfde niets van
als bij een pagina zonder favicon, en zet de selector `:not([src])` weer aan.

### 5.6 Van een assistent

Nu staan er op de rij van een bezige assistent twee statuskleuren die elkaar
tegenspreken: de glyph in de kleur van de modus (groen bij analyseren, rood bij
zoeken) en 15px verderop `.bezig`, dat altijd oranje is. Op één rij zie je groen
en oranje naast elkaar en er is geen manier om te weten welke van de twee de
waarheid is.

`.bezig` verdwijnt. In plaats daarvan **kleurt de modus de rij zelf**: een
gekleurde onderrand van 1px en, op de actieve rij, een gekleurde bijmenging in de
vulling. Eén kleur per rij, en het is dezelfde kleur als de glyph, omdat het
dezelfde token is.

```css
/* De modus als klasse en niet als inline custom property: app.js doet dat bij de
   workspacekleuren al zo, precies omdat index.html style-src 'self' heeft. */
.tab.m-zoeken     { --modus: var(--modus-zoeken); }
.tab.m-lezen      { --modus: var(--modus-lezen); }
.tab.m-analyseren { --modus: var(--modus-analyseren); }
.tab.m-debuggen   { --modus: var(--modus-debuggen); }
.tab.m-actie      { --modus: var(--modus-actie); }
.tab.m-klaar      { --modus: var(--modus-klaar); }

/* Eén statuskleur per rij, en het is dezelfde token als de glyph tekent. De
   onderrand is de plek waar het glas het minste licht vangt, dus daar is een
   kleur zichtbaar zonder het vlak te verkleuren. */
.tab.agent {
  box-shadow: inset 0 -1px 0 rgb(var(--modus) / 0.55);
}

.tab.agent:hover {
  box-shadow: var(--rand), var(--schaduw-2), inset 0 -1px 0 rgb(var(--modus) / 0.7);
}

.tab.agent[aria-current="true"] {
  background-color: color-mix(in srgb, rgb(var(--modus)) 7%, var(--laag-3));
  box-shadow: var(--schaduw-3), inset 0 -1px 0 rgb(var(--modus) / 0.8);
}

/* 'Ik heb je hulp nodig' is de enige stand die aandacht mag vragen. De glyph
   klopt al; de rand doet met dezelfde hartslag mee. */
.tab.m-actie {
  animation: aandacht 2.4s var(--ease-vlak) infinite;
}

@keyframes aandacht {
  0%, 100% { box-shadow: inset 0 -1px 0 rgb(var(--modus) / 0.45); }
  50%      { box-shadow: inset 0 -2px 0 rgb(var(--modus) / 0.95); }
}

.tab .glyph { background: none; }
```

`rgb(var(--modus) / 0.55)` werkt omdat de tokens uit §2.6 losse kanalen zijn.
Dat is precies waarom ze zo zijn opgeschreven.

**De glyph in de zijbalk moet groter tekenen.** Met `n: 5, zijde: 16` en `gap: 1`
wordt een cel `(16 − 4 − 4) / 5 = 1,6` pixel. Dat is het detail waar de eigenaar
aan hecht, weggegooid: op 1,6px met 1px ertussen is er geen patroon meer dat kan
bewegen, alleen een vaag gekleurd blokje dat flikkert. Twee dingen:

```js
// De vaste 4 in de celberekening is bij zijde 26 een kwart van de ruimte en bij
// zijde 16 nog steeds, dus absoluut blijft er niets over. Laat hem meeschalen.
const rand = zijde * 0.14;
const cel = (zijde - rand * 2 - (n - 1) * gap) / n;
```

en `n: 3` in de zijbalk in plaats van 5. Dan is een cel `(16 − 4,5 − 2) / 3 =
3,2` pixel — een patroon dat je kunt zien bewegen. Dat het raster verschilt van
het eiland (7) is geen probleem zolang de *beweging* dezelfde is: een veeg blijft
een veeg. Dat het nu 5 tegenover 7 is, is wél een probleem, want twee bijna
gelijke rasters tekenen twee verschillende patronen die je niet als hetzelfde
herkent. 3 tegenover 7 leest als hetzelfde ding op twee afstanden.

---

## 6. Het eiland

### 6.1 De vorm

De inhoud van de pil staat niet in de pil gecentreerd. `padding: calc(var(--plafond-hoogte)
- 8px) 15px 11px` zet de rij op y=36 terwijl het plafond tot y=44 loopt, dus 8 van
de 26 pixels van de glyph liggen ín het plafond. Het magische `− 8px` is de enige
reden dat het er ongeveer goed uitziet, en zodra er een tweede regel bij komt
klopt de verhouding helemaal niet meer — boven staat een constante en onder een
andere.

```css
:root {
  --plafond-hoogte: 44px;
  --vulling-x: 14px;
  --vulling-y: 10px;
  /* De holte van de aansluiting is een eigen maat, niet toevallig gelijk aan de
     binnenmarge. island.js leest hem hieruit; nu staat 13 los in beide bestanden
     en levert 1px verschil een zichtbare naad op. */
  --holte: 14px;
  --hoek: 18px;
}

#kaart {
  position: absolute;
  top: 0;
  left: var(--holte);
  width: max-content;
  min-width: 120px;
  max-width: 520px;
  padding: calc(var(--plafond-hoogte) + var(--vulling-y)) var(--vulling-x) var(--vulling-y);
  border-radius: 0 0 var(--hoek) var(--hoek);
  background-color: var(--plafond);
  /* Eén lichtpunt dat de muis volgt. Dit is de enige plek in de app waar dat
     verantwoord is: precies één element, dat nooit door pushState hertekend
     wordt. In de tabbladlijst zou hetzelfde effect een pointermove-handler per
     rij kosten op een lijst die zichzelf voortdurend vervangt. */
  background-image: radial-gradient(
    140px 100px at var(--licht-x, 50%) 0%,
    rgba(255, 255, 255, 0.09),
    transparent 72%
  );
  /* Sluit aan op de schaduw die het plafond op de zijbalk werpt (§4.3), zodat de
     pil onderdeel van datzelfde gegoten stuk blijft en er niet los op ligt. */
  box-shadow: var(--schaduw-plafond);
}
```

Boven en onder nu allebei `--vulling-y`, gemeten vanaf de onderkant van het
plafond. De hoogtes worden daarmee:

| Stand | Rij | Kaarthoogte |
| --- | --- | --- |
| rust | glyph 22 + één regel 13px | 44 + 10 + 22 + 10 = **86** |
| invoer | glyph 26 + veld 26 | 44 + 10 + 26 + 10 = **90** |
| bezig / actie | glyph 26 + `#vorige` 14 + `#huidig` 20 | 44 + 10 + 34 + 10 = **98** |

Drie echte hoogtes in plaats van één, en dus iets om te animeren. Zie §6.3.

`#vorige` krijgt `line-height: 14px` bij zijn `height: 14px`; nu is de regelbox
15,4px in een vak van 14 en worden de staarten van g, j en p afgesneden — bij een
regel als "Zoekt naar bijzaken" zie je dat meteen.

En "Ctrl J" in de ruststand wordt een `<kbd>` met dezelfde behandeling als in
`#new-tab`: 10px `--font-small`, gewicht 500, een randje van `--rand-kant`. Nu
staat dezelfde soort informatie 44px van elkaar in twee tegenovergestelde vormen,
tegelijk in beeld.

### 6.2 Hoe het groeit

`View.setBounds()` kent geen animatie — geverifieerd in
`node_modules/electron/electron.d.ts:14271` (`setBounds(bounds: Rectangle):
void`, geen `animate`, geen duur). ui-systeem §6.3 leidt daaruit af dat het
eiland niet mag animeren, omdat een geanimeerde maat zestig `island:size`-aanroepen
per seconde wordt.

**Hier keer ik dat om, met een grens.** Dat argument geldt alleen als je *per
frame* meet. `meldGrootte` is een `invoke` (`preload-island.js:8`) en dus
awaitbaar, en dan zijn er precies twee IPC-aanroepen per overgang nodig in plaats
van zestig per seconde. De regel wordt: het *venster* verspringt in één stap, de
*inhoud* animeert binnen dat venster.

De volgorde is asymmetrisch, want de view is een venster op deze pagina: hij moet
groot zijn vóórdat er iets groots in getekend wordt, en klein pas nadat het weer
weg is.

```js
// Groeien en krimpen zijn niet symmetrisch. Nu wisselt island.js de HTML meteen
// om en meldt daarná pas de nieuwe maat, dus staat de inhoud er al terwijl de
// view nog de oude breedte heeft — minstens één frame geknipte inhoud bij elke
// standwissel, het duidelijkst bij rust → invoer.
// Eén bron voor de holte: nu staat 13 zowel in island.css als los in island.js,
// en 1px verschil geeft een zichtbare naad in de gegoten hoekjes.
const holte = parseFloat(getComputedStyle(kaart).getPropertyValue('--holte')) || 14;

async function naarMaat(vulInhoud) {
  const oudeBreedte = kaart.offsetWidth;
  const oudeHoogte = kaart.offsetHeight;

  // De inhoud wisselen en meten gebeurt binnen één taak, dus hier wordt niets
  // van getekend: layout is synchroon, schilderen niet.
  kaart.classList.add('meten');   // zet de overgangen even uit
  vulInhoud();
  const doelBreedte = kaart.offsetWidth;
  const doelHoogte = kaart.offsetHeight;

  if (doelBreedte >= oudeBreedte || doelHoogte >= oudeHoogte) {
    // Groeien: eerst ruimte vragen, dan pas laten zien dat je hem gebruikt.
    kaart.style.setProperty('--breedte', `${oudeBreedte}px`);
    kaart.style.setProperty('--hoogte', `${oudeHoogte}px`);
    await eiland.meldGrootte(doelBreedte + holte * 2, doelHoogte);
    requestAnimationFrame(() => {
      kaart.classList.remove('meten');
      kaart.style.setProperty('--breedte', `${doelBreedte}px`);
      kaart.style.setProperty('--hoogte', `${doelHoogte}px`);
    });
  } else {
    // Krimpen: eerst de vorm laten inzakken, en pas als dat klaar is de view
    // teruggeven. Andersom knip je je eigen animatie af.
    kaart.classList.remove('meten');
    kaart.style.setProperty('--breedte', `${doelBreedte}px`);
    kaart.style.setProperty('--hoogte', `${doelHoogte}px`);
    kaart.addEventListener(
      'transitionend',
      () => eiland.meldGrootte(doelBreedte + holte * 2, doelHoogte),
      { once: true },
    );
  }
}
```

```css
#kaart {
  width: var(--breedte, max-content);
  height: var(--hoogte, auto);
  overflow: hidden;
  transition:
    width var(--duur-morph) var(--ease-veer),
    height var(--duur-morph) var(--ease-veer);
}

#kaart.meten {
  width: max-content;
  height: auto;
  transition: none;
}
```

**Drie dingen die hierbij horen.**

*Eén.* Zolang de view groter is dan de pil vangt zijn doorzichtige deel
muisklikken op boven de pagina. `setIgnoreMouseEvents` bestaat alleen op
`BrowserWindow` en `BaseWindow` (`electron.d.ts:3068` en `:5681`), niet op `View`
— en de typings noteren bij `setBorderRadius` expliciet: *"The area cutout of the
view's border still captures clicks."* Voor de ~260ms van een overgang is dat
acceptabel; permanent niet. Daarom eindigt elke overgang met een `meldGrootte` die
de view weer strak om de pil legt, en daarom staat er geen enkele stand in dit
ontwerp waarin de view groter blijft dan de inhoud.

*Twee.* `el.style.setProperty()` gaat via de CSSOM en niet via het
`style`-attribuut. CSP `style-src 'self'` controleert het attribuut, niet de
CSSOM, dus dit hoort te mogen — maar ik heb het in deze app niet nagemeten, en
ui-systeem §6.4 markeert het ook als onzeker. **Controleer het in de console van
de eiland-view voordat je erop bouwt.** Valt het tegen, dan is de uitweg een
handvol vaste standhoogtes als klassen (`.st-rust`, `.st-invoer`, `.st-bezig`) met
de waarden uit de tabel in §6.1 — minder flexibel, geen CSSOM nodig.

*Drie.* `interpolate-size: allow-keywords` zou `height: auto` rechtstreeks
animeerbaar maken en scheelt de hele meetronde. Dat staat in Chromium 129, dus
Electron 33 (Chromium 130) heeft het. Niet in deze app geprobeerd; de gemeten
px-waarden hierboven zijn de veilige weg.

### 6.3 De morph

De glyph is het scharnier: hij staat altijd op dezelfde plek en beweegt nooit.
Alles eromheen wisselt van vorm. Dat maakt van drie losse standen één ding dat
verandert.

```css
/* Alleen de kolom naast de glyph wisselt; de glyph zelf blijft staan. Zonder een
   vast punt is een morph gewoon twee dingen die tegelijk gebeuren. */
#tekst, #invoer {
  grid-area: 1 / 1;
  transition:
    opacity var(--duur-morph) var(--ease-vlak),
    translate var(--duur-morph) var(--ease-veer);
}

#rij {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 11px;
}

#rij > .wissel {
  display: grid;
  min-width: 0;
}

#tekst[hidden], #invoer[hidden] {
  /* Niet display:none maar onzichtbaar-en-onaanraakbaar, anders is er geen
     beginwaarde om vandaan te animeren en springt de wissel. */
  display: block;
  opacity: 0;
  translate: 0 4px;
  pointer-events: none;
}
```

`[hidden]` overschrijven vergt `display` expliciet terugzetten; als alternatief
werkt `@starting-style` samen met `transition-behavior: allow-discrete` (beide
Chromium 117+, dus beschikbaar in Electron 33), maar dat is een tweede mechanisme
voor hetzelfde en niet in deze app geprobeerd.

**De regelwissel moet aan twee kanten kloppen.** Nu zakt de vorige regel netjes
weg maar komt de nieuwe hard binnen: `#vorige` komt met 240ms omhoog, terwijl
`huidigEl.textContent = tekst` de nieuwe regel in één frame vervangt. De overgang
vertelt de helft van het verhaal — er komt iets aan, maar wat er stond ging niet
weg, het werd overschreven. Juist bij een assistent, waar de opeenvolging van
regels het verhaal ís, is dat het verband dat je wilt zien.

```js
// De regel wisselt in twee halve stappen: de oude schuift omhoog naar #vorige en
// vervaagt, de nieuwe komt van onderen op. Nu wordt de nieuwe in één frame
// overschreven, dus zie je alleen dat er íets veranderd is en niet dat het
// hetzelfde spoor is.
function toonRegel(tekst, bezig) {
  if (laatsteRegel === tekst) return;
  huidigEl.classList.add('gaat');
  huidigEl.addEventListener('transitionend', () => {
    huidigEl.textContent = tekst;
    huidigEl.classList.remove('gaat');
    huidigEl.classList.toggle('bezig', Boolean(bezig));
  }, { once: true });
  if (laatsteRegel) {
    vorigeEl.textContent = laatsteRegel;
    vorigeEl.classList.add('zichtbaar');
  }
  laatsteRegel = tekst;
}
```

```css
#huidig {
  transition:
    opacity var(--duur-schuif) var(--ease-vlak),
    translate var(--duur-schuif) var(--ease-vlak);
}

#huidig.gaat {
  opacity: 0;
  translate: 0 -4px;
}
```

### 6.4 De knoppen

De twee knoppen in het eiland hebben geen enkele overgang, terwijl alles in de
zijbalk 120 tot 140ms doet — dat leest als een ander programma. En
`brightness(1.25)` op `--gevaar-vlak` (#3a1f21, een bijna zwart bruinrood) levert
een verschil dat je op een donker plafond nauwelijks ziet, terwijl hetzelfde
filter op `--ga-vlak` wél zichtbaar is. Twee knoppen naast elkaar die ongelijk
reageren, op de plek waar je onder tijdsdruk op Stop moet drukken.

```css
#stop, #ga {
  flex: none;
  border: 0;
  border-radius: var(--radius-control);
  padding: 5px 11px;
  font-family: var(--font-small);
  font-size: 12px;
  font-weight: 500;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.14);
  transition:
    background-color var(--duur-vlak) var(--ease-vlak),
    box-shadow var(--duur-vlak) var(--ease-vlak),
    transform var(--duur-druk) var(--ease-vlak);
}

/* Vlak omhoog in plaats van een filter: op #3a1f21 is brightness(1.25) bijna
   niets en op #2f6fd0 veel, dus reageren de twee knoppen nu ongelijk. */
#stop:hover { background-color: var(--gevaar-vlak-hover); }
#ga:hover   { background-color: var(--ga-vlak-hover); }

#stop:active, #ga:active {
  transform: scale(0.96);
  box-shadow: var(--schaduw-in);
}
```

```css
:root {
  --gevaar-vlak:       #3a1f21;
  --gevaar-vlak-hover: #4d272a;
  --gevaar-tekst:      #ff6b64;
  /* Hetzelfde accent als de rest van de app. Een primaire knop in een ánder
     blauw haalt de betekenis uit de accentkleur. */
  --ga-vlak:           #0a6fe0;
  --ga-vlak-hover:     #2183f5;
  /* #6f757e op #17181b haalt ~3,8:1 (met de hand gerekend, niet gemeten) en
     draagt de vorige regel én de plaatshouder. Dit is de enige plek in de app met
     een gegarandeerde ondoorzichtige ondergrond, dus de enige plek waar te laag
     contrast geen excuus heeft. */
  --zacht:             #8b929c;
}
```

`--ga-vlak` wordt afgeleid van `--accent` maar staat als eigen waarde, want het
eiland is een vaste donkere omgeving en `--accent` wisselt met het thema. Dat is
dezelfde afweging die `island.css` al maakt met `--tekst` en `--zacht`.

### 6.5 Wat het eiland niet mag

- **Niet groter blijven dan de pil.** Elke overgang eindigt met één
  `meldGrootte` (§6.2). Elke component die erbij komt roept `meet()` aan, met de
  rAF-bundeling uit ui-systeem §7.2.
- **Niet buiten zichzelf tekenen.** De view knipt alles. Een schaduw die uitsteekt
  bestaat niet — daarom is `--schaduw-plafond` op `#kaart` een schaduw naar
  beneden die binnen de gemeten hoogte valt, en niet een gloed rondom.
- **Niet over de vensterknoppen.** Bij `max-width: 520px` wordt de view ~548px
  breed en loopt zijn rechterrand tot ongeveer `(vensterbreedte + 810) / 2`. Bij
  een venster smaller dan ~1090px komt dat in de hoek waar Chromium de
  titelbalkoverlay tekent, en dan kun je je venster niet meer sluiten zolang de
  assistent praat. (De ~138px voor drie knoppen is een aanname; niet nagemeten.)
  De maat moet dus geklemd worden op de ruimte die naast de overlay overblijft,
  niet alleen op `width - SIDEBAR_WIDTH - 24` zoals `layoutIsland()` nu doet.

---

## 7. De bewegingstaal

Deze richting zegt: dingen hebben massa, ze veren na, ze komen ergens vandaan.
Dat is een uitspraak met een prijs, dus staat er hieronder net zo veel over wat
níét beweegt.

### 7.1 Tokens

Er is nu geen bewegingswoordenboek: 140ms staat op acht plekken letterlijk
uitgeschreven, 120ms op drie, plus losse 160 en 240. En op één plek na (`omhoog`)
is alles `ease` — de browserstandaard, die symmetrisch versnelt én vertraagt. Dat
is niet alleen inconsistent, het is meestal de verkeerde curve.

```css
:root {
  --duur-druk:   90ms;   /* indrukken en loslaten: zo direct mogelijk */
  --duur-tik:   110ms;   /* dekking van iets kleins */
  --duur-vlak:  160ms;   /* een vlak dat rijst of zakt */
  --duur-paneel: 220ms;  /* een paneel dat komt of gaat */
  --duur-schuif: 240ms;  /* informatie die van plek wisselt */
  --duur-morph:  260ms;  /* het eiland dat van vorm verandert */
  --duur-veer:   420ms;  /* iets dat een plek inneemt en naveert */

  /* Materiaal: snel loslaten, lang uitlopen. Dit is de standaardcurve van deze
     richting en vervangt overal het kale 'ease'. */
  --ease-vlak: cubic-bezier(0.32, 0.72, 0, 1);
  --ease-vertrek: cubic-bezier(0.4, 0, 1, 1);
  --ease-rond: linear;

  /* Een gedempte veer (ζ=0.70, ω₀=17, 420ms), uitgerekend en bemonsterd op 18
     punten. Doorschot 4,6%: genoeg om massa te suggereren, te weinig om een lijst
     te laten schudden. Eindwaarde exact 1, anders blijft er een restverschuiving
     staan. linear() werkt vanaf Chromium 113. */
  --ease-veer: linear(
    0, 0.065 5.6%, 0.214 11.1%, 0.393 16.7%, 0.568 22.2%, 0.72 27.8%,
    0.841 33.3%, 0.929 38.9%, 0.988 44.4%, 1.023 50%, 1.041 55.6%,
    1.046 61.1%, 1.043 66.7%, 1.037 72.2%, 1.029 77.8%, 1.021 83.3%,
    1.013 88.9%, 1.008 94.4%, 1
  );

  /* Bijna kritisch gedempt (ζ=0.90, ω₀=26, 280ms): remt af zonder zichtbaar
     door te schieten. Voor alles wat vaak gebeurt, zoals hover. */
  --ease-zacht: linear(
    0, 0.128 8.3%, 0.361 16.7%, 0.578 25%, 0.742 33.3%, 0.853 41.7%,
    0.923 50%, 0.963 58.3%, 0.984 66.7%, 0.995 75%, 1 83.3%, 1.001 91.7%, 1
  );
}
```

En de overgangslijsten komen uit één recept, niet per selector opnieuw:

```css
:root {
  --overgang-vlak:
    background-color var(--duur-vlak) var(--ease-vlak),
    color var(--duur-vlak) var(--ease-vlak),
    box-shadow var(--duur-vlak) var(--ease-vlak),
    opacity var(--duur-vlak) var(--ease-vlak);
}
```

Dat lost meteen twee bestaande fouten op: dat `#controls button` wél
`background` animeert en `.tab` `background-color` (waardoor de glans op het
actieve tabblad meeloopt en op een knop niet, zonder dat iemand dat gekozen heeft),
en dat `opacity` op de navigatieknoppen ontbrak terwijl juist dat het verschil
tussen aan en uit is.

### 7.2 Wat beweegt

| Wat | Duur | Curve | Waarom |
| --- | --- | --- | --- |
| hoogte (vulling, rand, schaduw) bij hover | `--duur-vlak` | `--ease-vlak` | de hele taal van deze richting is hoogte |
| indrukken en loslaten | `--duur-druk` | `--ease-vlak` | moet direct voelen, anders bevestigt het niets |
| een nieuw tabblad dat binnenkomt | `--duur-veer` | `--ease-veer` | het komt ergens vandaan: uit de lege plek eronder |
| een gesloten tabblad dat weggaat | `--duur-paneel` | `--ease-vertrek` | weg is weg, geen naijlen |
| herordenen (FLIP) | `--duur-veer` | `--ease-veer` | rijen hebben massa, ze schuiven, ze springen niet |
| de kaart van het eiland van vorm | `--duur-morph` | `--ease-veer` | §6.2 |
| de regelwissel in het eiland | `--duur-schuif` | `--ease-vlak` | §6.3 |
| de commandobalk die komt en gaat | `--duur-paneel` | `--ease-veer` / `--ease-vertrek` | §7.6 |
| glans over de regel, glyph, ademende favicon | doorlopend | `--ease-rond` | zolang er echt iets gebeurt |

De intree van een tabblad, concreet:

```css
/* Het komt uit de lege plek onder de lijst omhoog: naar boven, iets te ver, en
   dan terug. Dat is wat 'ergens vandaan komen' betekent — een fade zegt alleen
   dat er iets bij is gekomen. */
@keyframes tab-in {
  from {
    opacity: 0;
    translate: 0 8px;
    scale: 0.97;
  }
}

.tab.nieuw {
  animation: tab-in var(--duur-veer) var(--ease-veer);
}
```

De uittree kan niet als CSS-animatie, want het element is uit de DOM voordat er
een frame getekend is. Dat moet in JS:

```js
// Een uittree-animatie heeft een element nodig dat de state overleeft waarin het
// niet meer voorkomt. Dus houden we de rij nog even vast en ruimen we hem pas op
// als hij uitgespeeld is.
function verwijderRij(li) {
  li.classList.add('gaat');
  li.addEventListener('animationend', () => li.remove(), { once: true });
}
```

```css
@keyframes tab-uit {
  to {
    opacity: 0;
    translate: 0 -4px;
    scale: 0.98;
  }
}

.tab.gaat {
  animation: tab-uit var(--duur-paneel) var(--ease-vertrek) forwards;
  pointer-events: none;
}
```

### 7.3 Wat niet beweegt

- **Layout in de zijbalk.** `width`, `height`, `margin`, `padding` en `gap`
  blijven onaangeroerd; `transform`/`translate`/`scale` doen het werk. De enige
  uitzondering is de kaart van het eiland, en die heeft er een protocol voor
  (§6.2).
- **Het wisselen van tabblad of workspace.** Dat is een native `setVisible()`.
  Een fade in de zijbalk zou uit de pas lopen met de pagina, en er is niets om aan
  te haken. Wat er wél mag: de nieuwe actieve rij scrollt zichzelf in beeld —
  `li[aria-current="true"].scrollIntoView({ block: 'nearest', behavior:
  'smooth' })`, en alleen wanneer het actieve id daadwerkelijk *wijzigt*, anders
  scrollt de lijst bij elke `pushState` van een ladende pagina onder je muis
  vandaan.
- **De workspace-strip bij het wisselen.** Nu verspringt hij ongewild: de naam
  verhuist met `display` van de ene chip naar de andere, dus veranderen álle
  chipbreedtes in één frame en schuift de hele rij. `display` is niet te
  transitioneren, dus dat is geen keuze maar een bijwerking. Óf alle chips krijgen
  een vaste breedte en alleen de kleur wisselt, óf de naam blijft altijd staan en
  de strip scrollt. Niet: de layout laten springen en er een `transition` op
  zetten die toch nooit draait.
- **De rij onder je muis, tijdens het laden.** Zie §7.4.
- **Alles langer dan 420ms.** Ook een veer.

### 7.4 De harde voorwaarde

Zolang de tabbladlijst met `replaceChildren()` wordt herbouwd, is **niets** uit
§7.2 mogelijk. Niet moeilijk — onmogelijk. Een CSS-transitie heeft een
beginwaarde nodig op een element dat al bestond, en een uittree-animatie heeft een
element nodig dat de state overleeft waarin het niet meer voorkomt.
`replaceChildren` levert allebei niet: elk `li` is bij elke `pushState` nieuw en
wordt dus meteen op zijn eindwaarde getekend, en een gesloten tabblad is uit de
DOM voordat er een frame is. Een `animation` zou wel afspelen — maar dan bij
élke `pushState` voor élke rij, dus de hele lijst knippert zolang een pagina
laadt.

De transities die er nu staan (`.tab`, `.ws`, `.tab .close`) spelen daarom in de
praktijk nooit af. Dat is dode CSS die de indruk wekt dat beweging geregeld is, en
dat is gevaarlijker dan geen CSS: iemand leest die regels, denkt dat het er al is,
en zoekt de echte oorzaak niet.

**Deze richting bestaat niet zonder keyed reconciliatie.** Een `Map<id,
HTMLElement>` vasthouden, bestaande rijen ter plekke bijwerken, alleen echte
verschillen invoegen of verwijderen. Dat is ~40 regels vanilla JS, past binnen de
projectregels, en maakt in één keer mogelijk: intree, uittree, FLIP, een
meeschuivende selectieplaat, elke transitie op `[aria-current]`, `:active` dat de
klik overleeft, en een glyph die niet bij elke statusupdate opnieuw begint. Zonder
die stap is dit hoofdstuk een verlanglijst.

Er hoort een tweede stap bij: **`pushState()` samenvoegen per tick.** Zes
webContents-events per tabblad roepen elk direct `pushState` aan, en
`did-navigate-in-page` vuurt bij elke history-push van een SPA. De bezochte
website bepaalt nu hoe vaak jouw zijbalk hertekent. Keyed reconciliatie maakt de
hertekening onschadelijk, maar een vlag plus `setImmediate` in het hoofdproces
haalt de piek eraf zonder ook maar iets aan de state-stroom te veranderen.

En de fase-truc uit ui-systeem §6.4 (negatieve `animation-delay`) lost hiervan
alleen de doorlopende lussen op, niet de eenmalige animaties en niet de intree of
uittree. Hij blijft nodig voor de ademende favicon en de `aandacht`-puls, ook ná
keyed reconciliatie, omdat een rij die nieuw ingevoegd wordt naast bestaande rijen
anders uit de pas loopt.

### 7.5 prefers-reduced-motion

Het blok uit ui-systeem §6.5 blijft, en in deze richting valt er meer om.

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation: none !important;
    transition: none !important;
  }

  /* Zonder de keyframes zou dit op de beginwaarde blijven hangen; hier hard
     zetten zodat 'ladend' en 'hij heeft je nodig' ook stil zichtbaar zijn. */
  .tab.loading .favicon:not([src]) { opacity: 1; }
  .tab.m-actie { box-shadow: inset 0 -2px 0 rgb(var(--modus) / 0.9); }

  /* De veer is weg, dus de hoogte moet in één stap kloppen — niet halverwege
     blijven staan. Dat gebeurt vanzelf omdat de eindwaarden gewone CSS zijn en
     niet in de keyframes zitten. Dit is de reden dat elke stand hierboven als
     statische regel is opgeschreven en niet alleen als animatie. */
}
```

En **`glyph.js` valt hier volledig buiten**, want een canvas met een eigen
`requestAnimationFrame`-lus wordt door CSS niet geraakt. Wie beweging heeft
uitgezet krijgt in de zijbalk én in het eiland alsnog een continu bewegend,
gloeiend icoontje — precies het element dat het meest beweegt van alles. Simpelweg
de lus stopzetten mag niet: bij deze glyph *draagt* de beweging betekenis (zoeken
leest als een verticale veeg, lezen als een horizontale). Hij moet stilvallen op
één herkenbaar beeld per stand, met de `matchMedia`-oplossing uit ui-systeem §6.5
— één frame op een vaste `t`, opnieuw tekenen bij een `change`-event en in `zet()`.

Er hoort nog iets bij dat ui-systeem niet noemt: `maakGlyph` wordt per render
opnieuw aangeroepen en zet `begon` opnieuw op de huidige tijd. De stand `klaar` is
de enige eenmalige animatie in `glyph.js` — een cirkel die vanuit het midden naar
buiten groeit met `front = (t - begon) * 5.5` — en die begint dus bij elke
`pushState` opnieuw. De stand die "klaar" moet betekenen loopt in beeld als een
eeuwige puls: hij vertelt het tegenovergestelde van wat hij moet vertellen. Ook dat
is met keyed reconciliatie in één klap weg, omdat het canvas dan blijft bestaan.

### 7.6 De commandobalk

De commandobalk heeft nu een intree en geen uittree, en de intree is waarschijnlijk
niet eens zichtbaar: `openPalette` zet `palette.hidden = false` en roept dáárna
`browser.setPaletteOpen(true)` aan, wat een `invoke` is en dus asynchroon. De
pagina ligt er in die frames nog overheen, dus de eerste helft van de 160ms speelt
onzichtbaar af — je ziet de pagina verdwijnen en de kaart staat er al. Bij sluiten
is het één frame en is er geen tegenhanger.

De volgorde moet om, aan beide kanten:

```js
// De pagina is een native laag die over deze renderer heen tekent. Openen: eerst
// wachten tot hij weg is, dan pas tonen — anders speelt de intree onzichtbaar af.
// Sluiten: eerst de uittree helemaal afspelen, en pas daarna de pagina terug.
async function openPalette() {
  await browser.setPaletteOpen(true);
  palette.hidden = false;
  paletteInput.value = '';
  keuze = 0;
  tekenResultaten();
  paletteInput.focus();
  sidebar.inert = true;
}

async function sluitPalette() {
  paletteCard.classList.add('gaat');
  await new Promise((klaar) =>
    paletteCard.addEventListener('animationend', klaar, { once: true }),
  );
  paletteCard.classList.remove('gaat');
  palette.hidden = true;
  sidebar.inert = false;
  browser.setPaletteOpen(false);
}
```

En de kaart mag niet meer van hoogte springen bij elke toetsaanslag.
`tekenResultaten` doet `replaceChildren()` op elk input-event, dus bij het typen
van een woord van zes letters verspringt het paneel zes keer terwijl je erin
kijkt. Dat is de meest zichtbare beweging in de app en er staat geen enkele
boodschap tegenover. Hier kan het opgelost worden zonder de architectuur aan te
raken — de lijst is klein en stabiel genoeg om per rij bij te werken — en de lege
stand uit ui-systeem §7.7 houdt de kaart stabiel bij nul treffers in plaats van
hem te laten krimpen tot een kaal veld.

Twee kleinere dingen die er in deze richting bij horen: `#palette-card` gebruikt
`justify-content: center` over het hele venster terwijl `main.js` het eiland
centreert over alleen het paginagebied (`SIDEBAR_WIDTH + (width - SIDEBAR_WIDTH -
w) / 2`) — twee zwevende panelen aan twee middellijnen, 132px uit elkaar. Kies het
paginagebied, want de zijbalk is een rail en geen inhoud. En `.result` krijgt
dezelfde maten als `.tab` (34px hoog, favicon 16, `--radius-tab`) in plaats van
38/15/9: het is dezelfde inhoud in dezelfde app, en je ziet ze direct na elkaar
omdat het palet over de zijbalk ligt.

---

## 8. Toegankelijkheid onder deze richting

Deze richting legt méér betekenis in het materiaal, dus moet ze ook explicieter
zijn over wat er gebeurt als het materiaal wegvalt.

**Focus.** De focusring gaat van 11% naar 18% accent. Op een doorschijnende
ondergrond over een willekeurig bureaublad is 11% praktisch niet te zien, en
ui-systeem §8 noemt 14% zelf al een compromis. In deze richting krijgt een veld
met focus er bovendien een accentgekleurde rim bij, zodat het niet alleen een halo
eromheen is maar ook de rand van het glas van kleur verandert — dat is zichtbaar
tegen elke achtergrond, want het ligt óp het vlak in plaats van ernaast.

```css
:root {
  --ring: 0 0 0 3px color-mix(in srgb, var(--accent) 18%, transparent);
  --rand-focus: inset 0 0 0 1px color-mix(in srgb, var(--accent) 46%, transparent);
}

#address:focus {
  outline: none;
  background-color: var(--laag-3);
  box-shadow: var(--rand), var(--rand-focus), var(--schaduw-3), var(--ring);
}
```

**De tabbladlijst is niet focusbaar.** `.tab` is een `<li>` met `onclick` zonder
`tabindex`, dus de globale focusstijl raakt de belangrijkste lijst van de app
nooit. Dat is geen visueel probleem maar het maakt elke focusstijl in dit document
theoretisch, en het heeft dezelfde oorzaak als §7.4: er mág geen focusbaar element
in een lijst die zichzelf voortdurend vervangt, want de focus overleeft dat niet.
Keyed reconciliatie is dus ook hiervoor de voorwaarde.

**`forced-colors: active`** gooit elke vulling, glans, rand en schaduw weg. Deze
richting moet daarom twee keer getekend worden: één keer als materiaal, één keer
als lijnwerk. Dat is meer werk dan onder het huidige ontwerp, want er zit meer
betekenis in het materiaal.

```css
@media (forced-colors: active) {
  #sidebar { background: Canvas; box-shadow: none; }
  #controls, #new-tab { background: Canvas; border: 1px solid CanvasText; box-shadow: none; }
  .tab:hover, .ws:hover { background: Canvas; border: 1px solid CanvasText; }
  .tab[aria-current="true"], .ws[aria-current="true"] {
    background: Highlight;
    color: HighlightText;
    border: 1px solid HighlightText;
    box-shadow: none;
    background-image: none;
  }
  .tab[aria-current="true"]::before { display: none; }
  /* De modus-onderrand is hier onzichtbaar, dus moet de tekst het overnemen. */
  .tab.agent .title::after { content: " · " attr(data-modus); }
}
```

**`prefers-contrast: more`** krijgt het blok uit ui-systeem §8, met in deze
richting één toevoeging: `--zijbalk` gaat omhoog naar `rgba(255,255,255,.34)` in
licht en `rgba(255,255,255,.07)` in donker, zodat de plaat het bureaublad
daadwerkelijk afdekt en de tekst een bekende ondergrond krijgt.

---

## 9. Wat deze richting niet goed doet

Elke richting kost iets. Dit zijn de negen dingen die hij kost, in volgorde van
hoe zeker ik ben dat je er spijt van kunt krijgen.

### 9.1 Het bureaublad verdwijnt

De zijbalk wordt een plaat (§4.3). Dat is de ingreep waar alles hier op rust — de
hoogte-as heeft een bekend beginvlak nodig, en `--muted` op .60 is alleen
leesbaar als er iets onder ligt. Maar het is ook precies wat er nu mooi is: het
venstermateriaal is nu de *ondergrond* van de zijbalk, en straks is het een waas
achter een plaat. Op een schermafdruk met een goed bureaublad is de huidige app
opener dan wat hier staat.

Dat is een echte ruil, geen verbetering. Als het antwoord "nee, het bureaublad
moet erdoorheen" is, dan moet `--zijbalk` naar 0 en moeten `--muted`, `--laag-1`
en `--laag-2` allemaal omhoog om het verlies goed te maken — en dan is de app
lichter en platter dan wat hier staat.

### 9.2 De architectuurschuld moet eerst betaald, en dat levert niets zichtbaars op

Zonder keyed reconciliatie en zonder samengevoegde `pushState` is deze richting
niet alleen onvolledig, hij is **langzamer dan wat er nu staat**: rim-pseudo-
elementen, vier inset-schaduwen per vlak, een mask op de titel bij hover en een
`backdrop-filter` op de scrim — allemaal per rij, op een lijst die twintig keer per
seconde volledig herbouwd kan worden door een drukke website. Dat is dagen werk
waar je niets van ziet, vóórdat er één pixel mooier wordt. Dat is de duurste
eigenschap van deze richting en hij staat op de eerste dag.

### 9.3 Het donkere thema blijft de zwakke helft

Glas werkt doordat licht van randen weerkaatst. In het donkere thema is er weinig
licht: `--rand-top` is 16% wit, en een schaduw doet op een donkere doorschijnende
ondergrond vrijwel niets. Ik kan de *rangorde* in beide thema's gelijk maken — je
ziet in donker net zo goed wélk vlak hoger ligt — maar niet de *diepte*. Donker
blijft platter, hoe je de getallen ook draait. Iemand die alleen in donker werkt
krijgt van deze richting minder terug dan iemand die in licht werkt, en dat is
niet op te lossen met tokens.

### 9.4 Het eiland wordt mooier en meer in de weg

De pil gaat van ~73px naar 86–98px, omdat de inhoud nu echt onder het plafond
gecentreerd staat in plaats van er 8px in te hangen. Dat betekent dat hij 42 tot
54 pixels van de pagina bedekt in plaats van ~30, en dat vlak vangt klikken op —
`View` kent geen `setIgnoreMouseEvents`, en de typings noteren bij
`setBorderRadius` expliciet dat het uitgesneden deel klikken blijft opvangen.
Links en menu's in de bovenste centimeter van elke website worden dus over een
grotere strook onklikbaar, zonder dat er iets te zien is dat dat verklaart. Het
huidige ontwerp verbergt dat probleem door optisch fout te zijn.

### 9.5 De workspace-strip wordt beter en niet goed

Stippen van 12px in chips van 32px maken de strip leesbaar en maken hem eerder
vol. Reken het na: 240px binnenbreedte, min de plusknop (28) en de tussenruimte
(6), laat 206px over. De actieve chip is maximaal 132, een inactieve 32, met 4px
ertussen. Dat is de actieve plus **twee** buren. Bij vier workspaces schuift de
derde onder het verloop, bij zeven krijgen twee workspaces dezelfde kleur
(`colorIndex = (id - 1) % 6`), en er is nog steeds geen naam op een inactieve
chip — wat ui-systeem §2.3 expliciet verbiedt.

Deze richting maakt dat zichtbaarder in plaats van beter. De echte oplossing is
een ander component (een verticale lijst, of workspaces in de commandobalk), en
dat is een ontwerp op zich, geen kwestie van maatvoering.

### 9.6 Beweging met massa is beweging

Een veer schiet door. Doorschot in een lijst waar je in leest is precies waar
ui-systeem §6.2 voor waarschuwt, en de regel die dat beheerst — veren alleen op
dingen die jij zelf veroorzaakt hebt, nooit op dingen die vanzelf veranderen — is
een discipline die niemand afdwingt. Eén iemand die `--ease-veer` op een
statusupdate zet, en de zijbalk deint mee met een chatsite. De CSS beschermt daar
niet tegen; alleen het reviewen wel.

### 9.7 Er gaat verticale ruimte op

De correcte bovenmarge (+10), één blokafstand van 12 in plaats van 8, en chips van
32 in plaats van 28 kosten samen ongeveer 30–35px. Op een venster van 840px is dat
één tabbladrij van de ongeveer achttien die er passen. Dat is te verdedigen, maar
het is wel wat het is: de kolom wordt rustiger en er past minder in.

### 9.8 Acrylic is niet gegarandeerd

`backgroundMaterial: 'acrylic'` is een verzoek. Zet Windows transparantie uit,
staat de batterijbesparing aan, of draai je over remote desktop, dan valt het
venster terug op een egale kleur — en dan zijn `--zijbalk`, `--laag-1`, `--laag-2`
en `--laag-3` vier grijstinten op een vlak zonder textuur, waar de hele hoogte-as
op leunt. Ik heb niet nagemeten wat Electron 33 in dat geval precies rendert
(`backgroundColor: '#00000000'` staat er ook nog onder), en dat is het grootste
open gat in deze richting. Meten voordat je hem bouwt.

Hetzelfde geldt voor `backdrop-filter`: ui-systeem §11 vermoedt dat hij alleen
vervaagt wat in dezelfde renderer getekend is en niet het acrylic erachter. Als
dat klopt, valt `--paneel` op .76 vlakker uit dan het hier lijkt, en dan is de
commandobalk minder een glasplaat en meer een grijze kaart.

### 9.9 Dit ontwerp gaat over 264 pixels en een pil

De rest van het venster is iemands website, en die wordt hier niet mooier van. De
lijst met échte gaten in deze app — sneltoetsen die sterven zodra je in een pagina
klikt, een nieuw tabblad dat geen toetsenbordfocus krijgt, een geblokkeerde link
die een onwegklikbare balk achterlaat, "Niet nu" dat de assistent definitief
stopt, geen enkele `aria-live`, geen foutpagina, geen contextmenu — staat volledig
los van welke richting je kiest. Een mooiere zijbalk maakt die problemen niet
kleiner en kan ze wel toedekken. Als er tijd is voor één ding, is deze richting
niet het eerste ding.

---

## 10. Wat ik niet geverifieerd heb

Expliciet, zodat niemand hierop bouwt zonder het te controleren:

- **`mask-composite: exclude`** (§2.3) — hoort in Chromium 120+ te werken, dus in
  Electron 33 (Chromium 130). Niet in deze app geprobeerd.
- **`el.style.setProperty()` onder `style-src 'self'`** (§6.2) — CSP controleert
  het `style`-attribuut en niet de CSSOM, dus dit hoort te mogen; ui-systeem §6.4
  markeert het ook als onzeker. Controleer het in de console van de eiland-view.
- **`interpolate-size: allow-keywords`** (§6.2) — Chromium 129+, dus aanwezig.
  Niet geprobeerd; de gemeten px-waarden zijn de veilige weg.
- **`@starting-style` + `transition-behavior: allow-discrete`** (§6.3) — Chromium
  117+. Genoemd als alternatief, niet gebruikt.
- **Hoeveel frames de huidige eiland-hapering duurt** — met de DevTools van de
  eiland-view te zien (`devtoolsSneltoets` hangt er al aan, `main.js:153`).
- **Of `:active` op een tabbladrij een `pushState` tussen mousedown en mouseup
  overleeft** (§5.3) — vermoedelijk niet, niet nagemeten.
- **Wat Electron 33 rendert als Windows-transparantie uit staat** (§9.8) — het
  grootste open gat.
- **Of `backdrop-filter` het venstermateriaal meepakt** (§9.8) — ui-systeem §11
  vermoedt van niet.
- **De contrastgetallen** — `--muted` op .60 ≈ 5,5:1, `--zacht` #6f757e op
  `--plafond` ≈ 3,8:1: met de hand gerekend volgens de WCAG-formule, niet met een
  meter gemeten, en op een doorschijnende ondergrond sowieso alleen een
  bovengrens.
- **De ~138px die de Windows-titelbalkoverlay inneemt** (§6.5) — een aanname uit
  de standaardmaat van drie vensterknoppen, niet uitgemeten.
