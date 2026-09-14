# Richting A — Verstilling

Dit is één van meerdere richtingen. Hij bouwt voort op `docs/ontwerp/ui-systeem.md`
en herhaalt dat niet: waar dat document een ladder, een token of een regel al
uitschrijft, staat hier alleen wat deze richting daaraan *verandert* en waarom.
Verwijzingen als "§4.1" zijn naar `ui-systeem.md`, tenzij anders vermeld.

Geschreven tegen Electron 33.4.11 / Chromium 130. Waar ik een API niet heb
geverifieerd staat dat er met zoveel woorden bij; §12 verzamelt alles wat nog
gemeten moet worden.

---

## 1. De these

Het venster is doorschijnend. Dat is niet een eigenschap van deze app, dat *is*
de app: onder elk vlak in de zijbalk ligt het bureaublad van de gebruiker, en
elke laag die je erop tekent haalt daar iets vanaf. De huidige zijbalk tekent
zeven dingen die allemaal even hard roepen — een adresveld met glans en haarlijn,
een tabbladlijst waarin elke rij een eigen kaartje is, een actief tabblad dat 82%
wit is, een chiprij met halo's, een plusknop, een kloppend stipje, een gloeiende
glyph. Het resultaat is niet druk omdat er te veel functie is, maar omdat er te
veel *materiaal* is.

Verstilling draait dat om met één ruilhandel: **minder vlakken, meer precisie.**
Hiërarchie komt uit gewicht en maat in plaats van uit vullingen. Er is precies
één verheven vlak in de hele zijbalk. Er is precies één bewegend ding in de hele
app, en dat is de glyph — het enige waar de eigenaar tevreden over is. In rust
beweegt er nergens iets, ook niet een beetje.

De maatstaf is niet "ziet het er mooi uit op een schermafdruk" maar "merk je het
niet op terwijl je leest". Dat is een andere maatstaf, en §11 is eerlijk over wat
hij kost.

---

## 2. De vijf regels

Alles hieronder volgt uit deze vijf. Als een detail hierna en een regel hier
elkaar tegenspreken, wint de regel.

1. **Eén verheven vlak.** Het glasrecept uit §5 (vulling + glans + haarlijn +
   schaduw) staat op precies één element tegelijk: het actieve tabblad. De actieve
   workspace, het veld met focus en de gekozen regel in de commandobalk krijgen
   een vulling en een zwaarder gewicht, geen glans en geen schaduw. Nu dragen die
   drie hetzelfde recept en betekent "verheven" niets meer.
2. **Hiërarchie is gewicht, dan maat, dan kleur.** `font-weight` komt in de hele
   `style.css` nul keer voor; kleur draagt in z'n eentje het hele onderscheid, en
   kleurcontrast is op een doorschijnende ondergrond juist het zwakste middel dat
   er is. 400 tegenover 500 doet meer dan `--muted` tegenover `--text`, en kost
   geen contrast.
3. **Eén rij, één rail.** Alles wat je in de zijbalk kunt aanwijzen is 32px hoog
   en begint op x=24. Nu zijn er drie hoogtes (28/30/34), drie tussenruimtes
   (2/3/8) en drie kantlijnen (20/24,5/25).
4. **Verplaatsingsbudget: 4px.** Niets in de zijbalk beweegt verder dan 4px, en
   layout beweegt nooit. Wat verder moet, verandert zonder overgang.
5. **De glyph is de enige lus.** Elke andere doorlopende animatie verdwijnt: het
   kloppende stipje, de glans over de regel in het eiland. En de glyph loopt
   alleen zolang er werkelijk iets gebeurt — in de stand `rust` tekent hij één
   frame en vraagt geen volgend frame aan.

---

## 3. Kleur en transparantie

### 3.1 De transparantietrap, met het rekenwerk erbij

De trap staat nu numeriek netjes en visueel niet: licht `.42 → .62 → .82`
(stappen van .20 wit), donker `.06 → .10 → .14` (stappen van .04). Dezelfde regel
levert daardoor twee verschillende ontwerpen op — in licht is het actieve tabblad
vrijwel dicht en slaat het acrylic dood, in donker is het een verschil van 8% wit
dat nauwelijks bestaat.

Perceptueel gelijk maken betekent: de *contrastverhouding* tussen ondergrond en
vlak moet in beide thema's hetzelfde zijn, niet het alfagetal. Wit met dekking `a`
op een ondergrond `b` composeert naar `a + (1-a)·b`. Ik ga uit van een acrylic-
ondergrond die in licht rond sRGB 0.55 uitkomt en in donker rond 0.16.

**Dat zijn aannames, geen metingen.** De echte ondergrond is het bureaublad van de
gebruiker en die ken ik niet. Het rekenwerk hieronder is met de hand gedaan
volgens de WCAG-formule voor relatieve luminantie; het bewijst niet dat het klopt,
het bewijst dat de twee thema's *bij dezelfde aanname* uitkomen op hetzelfde
verschil — en dat is precies wat er nu niet zo is.

| | licht α | contrast t.o.v. ondergrond | donker α | contrast t.o.v. ondergrond |
| --- | --- | --- | --- | --- |
| `--fill` (hover) | .16 | 1,26 : 1 | .06 | 1,20 : 1 |
| `--fill-hover` | .26 | 1,44 : 1 | .10 | 1,37 : 1 |
| `--fill-active` (de plaat) | .46 | 1,86 : 1 | .20 | 1,92 : 1 |

Ter vergelijking, met dezelfde aannames: de huidige waarden geven voor de plaat
2,79 : 1 in licht tegenover 1,57 : 1 in donker — bijna een factor twee verschil.
De nieuwe waarden liggen binnen 3% van elkaar.

Twee gevolgen die belangrijker zijn dan de getallen zelf:

- Het lichte thema wordt **doorzichtiger**, niet dichter. Het acrylic blijft leven
  op de plek waar je het meest kijkt.
- Het donkere thema krijgt zijn verheffing **niet uit een schaduw**. Een zwarte
  schaduw op een donkere doorschijnende ondergrond doet niets; daar moet de
  haarlijn het werk overnemen, en die staat daarom relatief veel sterker.

### 3.2 De tokens

Deze vervangen de blokken in `renderer/style.css:1-80`. Namen die er al zijn
blijven; nieuwe namen volgen §2.2 (Engels voor generieke rollen, Nederlands waar
het ding in dit project een eigen naam heeft).

```css
:root {
  color-scheme: light dark;

  /* --- maten ------------------------------------------------------------- */
  --sidebar-width: 264px;
  --topbar-height: 44px;
  /* Eén rijhoogte voor alles wat je kunt aanwijzen, en één rail waar alle inkt
     op begint. Dit zijn de twee getallen die de kolom bij elkaar houden. */
  --rij: 32px;
  --rij-vulling: 12px;
  --rail: 24px;   /* = 12px zijbalkvulling + 12px rijvulling */
  --blok: 12px;   /* de enige verticale afstand tussen blokken */

  /* Vijf radii, niet tien. Een verschil van 1px is geen keuze maar slordigheid;
     §4.1 schrijft er negen voor en dat is er vier te veel voor deze richting. */
  --radius-icon: 6px;      /* sluitkruisje, 16px-vak */
  --radius-control: 8px;   /* icoonknop */
  --radius-rij: 10px;      /* tabblad, workspacerij, adresveld, chip */
  --radius-content: 12px;  /* spiegelt CONTENT_RADIUS in main.js:14 */
  --radius-card: 18px;     /* commandobalk, en --hoek in island.css */

  /* --- tekst ------------------------------------------------------------- */
  --text: rgba(0, 0, 0, 0.88);
  /* Omhoog van .46. De inactieve rijen zijn juist de rijen die je scant om te
     vinden waar je heen wilt; die stonden onder de leesdrempel terwijl de enige
     rij die je niet hoeft te lezen goed leesbaar was. */
  --muted: rgba(0, 0, 0, 0.58);
  --faint: rgba(0, 0, 0, 0.34);

  /* --- vlakken ----------------------------------------------------------- */
  --fill: rgba(255, 255, 255, 0.16);
  --fill-hover: rgba(255, 255, 255, 0.26);
  --fill-active: rgba(255, 255, 255, 0.46);
  --skelet: rgba(0, 0, 0, 0.08);

  --stroke: rgba(0, 0, 0, 0.08);
  --stroke-strong: rgba(0, 0, 0, 0.14);

  /* --- betekenis --------------------------------------------------------- */
  --accent: #007aff;
  --danger: #ff3b30;
  --danger-text: #c0261c;
  --on-accent: #ffffff;

  /* --- panelen ----------------------------------------------------------- */
  --card: rgba(255, 255, 255, 0.72);
  /* Een wit waas over een zijbalk die zelf uit witte lagen bestaat duwt niets
     terug; het verkleint juist het verschil tussen de zijbalk en de kaart
     erboven. Een scrim moet donkerder én iets kouder zijn dan waar hij overheen
     ligt, ook in het lichte thema. */
  --scrim: rgba(22, 24, 28, 0.14);

  /* --- glas -------------------------------------------------------------- */
  --glass-sheen: rgba(255, 255, 255, 0.4);
  --glass-line: rgba(255, 255, 255, 0.7);
  /* Eén token met de hele schaduwlijst erin, want in het donkere thema valt het
     tweede deel weg en `none` mag niet los in een box-shadow-lijst staan. */
  --plaat-schaduw: inset 0 1px 0 var(--glass-line), 0 1px 2px rgba(0, 0, 0, 0.05);
  --shadow-press: inset 0 1px 2px rgba(0, 0, 0, 0.09);
  --shadow-card: 0 12px 40px rgba(0, 0, 0, 0.16), 0 1px 4px rgba(0, 0, 0, 0.07);
  --ring: 0 0 0 3px color-mix(in srgb, var(--accent) 18%, transparent);

  /* --- het plafond ------------------------------------------------------- */
  /* Staat buiten de licht/donker-blokken: het plafond is altijd donker. Deze
     drie horen samen met island.css in tokens.css (§10) — nu staan --plafond en
     de drie fontstacks in twee bestanden woordelijk uitgeschreven. */
  --plafond: #17181b;
  --plafond-tekst: #f2f4f7;
  --plafond-zacht: #9aa1ac;
  --assistent: #ff9f0a;

  /* --- workspaces -------------------------------------------------------- */
  /* Weggetrokken bij --accent en bij de glyph-kleuren: --ws-0 was letterlijk
     #007aff en --ws-2 lag bovenop het groen van 'analyseren'. Kleur is in deze
     app betekenisdrager, dus twee betekenissen op dezelfde kleur is een fout. */
  --ws-0: #3a7d6c;  /* diepgroen */
  --ws-1: #b8792e;  /* amber */
  --ws-2: #7b5ea7;  /* violet */
  --ws-3: #b0526b;  /* roos */
  --ws-4: #6b7a3f;  /* olijf */
  --ws-5: #5a6b7d;  /* leisteen */
}

@media (prefers-color-scheme: dark) {
  :root {
    --text: rgba(255, 255, 255, 0.92);
    --muted: rgba(255, 255, 255, 0.52);
    --faint: rgba(255, 255, 255, 0.34);

    --fill: rgba(255, 255, 255, 0.06);
    --fill-hover: rgba(255, 255, 255, 0.1);
    --fill-active: rgba(255, 255, 255, 0.2);
    --skelet: rgba(255, 255, 255, 0.08);

    --stroke: rgba(255, 255, 255, 0.1);
    --stroke-strong: rgba(255, 255, 255, 0.16);

    --accent: #0a84ff;
    --danger: #ff453a;
    --danger-text: #ff6961;

    --card: rgba(28, 29, 33, 0.74);
    --scrim: rgba(0, 0, 0, 0.34);

    --glass-sheen: rgba(255, 255, 255, 0.07);
    /* Hier zit de asymmetrie die het donkere thema nu mist: de haarlijn draagt
       de verheffing, want een zwarte schaduw doet op deze ondergrond niets. */
    --glass-line: rgba(255, 255, 255, 0.22);
    --plaat-schaduw: inset 0 1px 0 var(--glass-line);
    --shadow-press: inset 0 1px 2px rgba(0, 0, 0, 0.32);
    --shadow-card: 0 16px 48px rgba(0, 0, 0, 0.5), 0 1px 4px rgba(0, 0, 0, 0.35);

    --ws-0: #58a894;
    --ws-1: #d69a4e;
    --ws-2: #a184cd;
    --ws-3: #d4788e;
    --ws-4: #93a45f;
    --ws-5: #8496a8;
  }
}
```

Over `--muted`: zwart op .58 over wit haalt 5,3 : 1, tegen 3,1 : 1 bij de huidige
.46 (met de hand gerekend, over zuiver wit — dat is de *bovengrens*, want het
echte vlak is acrylic over een onbekend bureaublad). In donker blijft wit op .52
staan; daar haalt hetzelfde token bij een ondergrond van sRGB 0.16 ongeveer 5,3 :
1 en is er geen reden om hem op te schroeven. De asymmetrie tussen de twee
thema's is dus geen slordigheid maar het gevolg van de rekensom.

Over de workspacekleuren: die zijn op het oog gekozen op hoekafstand, niet
gemeten op ΔE. Dat ze onverzadigder zijn dan de huidige set is opzet — een
verzadigde stip is in deze richting het luidste ding in de kolom — en het is
tegelijk de zwakste plek van dit palet. Zie §11.

### 3.3 De glyph-kleuren

`renderer/glyph.js:8-17` blijft grotendeels staan; de vierkantjes zijn wat er
goed is. Twee wijzigingen, allebei omdat er zes verschillende blauwen door de app
lopen en `--accent` daardoor niets meer betekent:

```js
// 'rust' en 'invoer' stonden op twee blauwen die geen van beide iets betekenden
// en allebei in de buurt van --accent lagen. Neutraal grijsblauw: de rustende
// glyph hoort geen kleur te claimen, want kleur zegt hier wát hij doet.
rust: [104, 116, 130],
invoer: [148, 162, 180],
```

`--ga-vlak: #2f6fd0` in `island.css:9` vervalt en wordt `--accent`; `caret-color:
#4c9bff` in `island.css:143` idem. Daarmee blijven er drie blauwen over: het
accent (twee themawaarden) en het blauw van de stand `debuggen`, en die laatste
is een statuskleur en geen ornament.

---

## 4. Typografie

§3.1 en §3.2 leggen de optische snedes en de schaal al vast. Wat ontbreekt is de
toewijzing: welke maat waar, en waarom. Nu staat de hele zijbalk op 13px/400 en
komt `font-weight` er niet in voor.

**Drie maten doen negentig procent van het werk.** 11px voor labels die naast iets
anders staan, 13px voor alles wat je leest, 14px voor de ene regel in het eiland
die de aandacht mag hebben. Alle andere maten uit de schaal komen pas in beeld bij
panelen die er nog niet zijn.

| Waar | Selector | Familie | Maat | Gewicht | Kleur | Waarom |
| --- | --- | --- | --- | --- | --- | --- |
| tabbladtitel, actief | `.tab[aria-current="true"] .titel` | text | 13 | **500** | `--text` | het gewicht draagt "dit is waar je bent", niet de plaat |
| tabbladtitel, rust | `.tab .titel` | text | 13 | 400 | `--muted` | de lijst die je scant, dus leesbaar |
| eigenaarlabel | `.tab .eigenaar` | small | 11 | 500 | `--muted` | een label vóór een titel, geen deel ervan |
| adres | `#address` | text | 13 | 400 | `--text` | |
| "Nieuw tabblad" | `#new-tab .label` | text | 13 | 400 | `--muted` | een actie, dus niet zwaarder dan de items erboven |
| toetsaanduiding | `kbd` | small | 10 | 500, `+0.02em` | `--faint` | |
| workspacenaam in de voet | `#ws-huidig .naam` | small | 12 | 500 | `--text` | containerlabel: klein en zwaar, niet groot en bleek |
| workspacenaam in de lijst | `.ws .naam` | text | 13 | 400 | `--muted` | in de lijst is het een gewone rij |
| tabbladteller | `.ws .aantal` | small | 11 | 400, `tabular-nums` | `--faint` | anders dansen de cijfers bij elke update |
| eiland: huidige regel | `#huidig` | text | 14 | 400 | `--plafond-tekst` | |
| eiland: vorige regel | `#vorige` | small | 11 | 400 | `--plafond-zacht` | |
| eiland: knoppen | `#stop`, `#ga` | small | 12 | 500 | | |
| commandobalk: invoer | `#palette-input` | text | 15 | 400 | `--text` | |
| commandobalk: label | `.result .label` | text | 13 | 400 | `--muted` → `--text` | |
| commandobalk: soort | `.result .kind` | small | 11 | 400 | `--faint` | |

```css
body {
  /* 13/1.45 blijft de basis; wat erbij komt is dat er nu ook een gewicht is om
     mee te werken. */
  font: 400 13px/1.45 var(--font-text);
  letter-spacing: -0.006em;
}

.tab .titel { font-weight: 400; }
.tab[aria-current="true"] .titel { font-weight: 500; color: var(--text); }

.tab .eigenaar {
  flex: none;
  font-family: var(--font-small);
  font-size: 11px;
  font-weight: 500;
  color: var(--muted);
}

kbd {
  /* Het randje eromheen is de enige omlijning in de hele kolom en trekt daarom
     meer aandacht dan de actie waar hij bij hoort. Maat en gewicht zeggen al
     genoeg dat dit een toets is. */
  font-family: var(--font-small);
  font-size: 10px;
  font-weight: 500;
  letter-spacing: 0.02em;
  color: var(--faint);
  border: 0;
  padding: 0;
}
```

**De adresbalk krijgt twee gedaanten.** Een `<input>` kan geen deel van zijn eigen
waarde apart opmaken, dus de manier om host en pad te onderscheiden is de waarde
zelf wisselen — niet met kleur binnen één string, wat toch niet kan.

```js
// In rust toont de adresbalk alleen de host; bij focus de volledige URL. Zo komt
// het onderscheid uit inhoud in plaats van uit kleur, en kleur is op glas het
// zwakste middel dat we hebben. Dit lost meteen op dat een halve ingetypte
// invoer nu blijft staan tot je Enter drukt: blur zet hem terug.
function kortAdres(url) {
  try { return new URL(url).host.replace(/^www\./, ''); } catch { return url; }
}

address.addEventListener('focus', () => {
  address.value = huidigeUrl;
  address.select();
});

address.addEventListener('blur', () => {
  addressIsDirty = false;
  address.value = kortAdres(huidigeUrl);
});
```

---

## 5. De zijbalk als compositie

### 5.1 Wat er weg mag

Dit is de kern van deze richting, dus het staat als lijst en niet als proza.
Zeventien dingen, en geen ervan kost functie:

1. De achtergrond op `.favicon` (`style.css:259`). Leeg moet leeg zijn; nu leest
   het als een uitgevinkt selectievakje, en achter een PNG met transparantie
   piept het afgeronde vierkantje eronder vandaan.
2. Het kloppende stipje `.bezig` en `@keyframes kloppen` (`style.css:280-299`).
   Het staat 15px naast een glyph die een andere kleur heeft; twee statuskleuren
   op één rij spreken elkaar tegen. De glyph beweegt al — dat ís de melding.
3. Het voorvoegsel `Kim · ` in dezelfde snede als de titel (`app.js:134`). Het
   wordt een apart, kleiner label.
4. Het permanente kanaal van 29px voor het sluitkruisje. Dat neemt de plaats van
   het favicon over bij hover.
5. De 2px tussenruimte in `#tablist`. Rijen die elkaar raken lezen als één kolom;
   met een spleet ertussen leest elke rij als een los kaartje.
6. De glasplaat op `.ws[aria-current="true"]` (`style.css:436-441`).
7. De halo `box-shadow: 0 0 0 3px` om elke workspacestip (`style.css:422`).
8. De horizontale chiprij zelf, plus `#new-workspace` als losse knop.
9. Het hovervlak op `#new-tab` (`style.css:359-362`) — een actie hoort er niet
   uit te zien als een item — en het randje om `<kbd>`.
10. De glans en de haarlijn op `#address` in rust (`style.css:189-190`).
11. De `border` op `#address`, die 1px layout verschuift zodra de focusrand komt.
12. `--shadow-tab` in het donkere thema.
13. De glans die over `#huidig` trekt in het eiland (`island.css:116-134`).
14. "Ctrl J" als lopende tekst in de rustende balk — en de rustpil zelf (§8).
15. `#reload` als losse knop; die verhuist naar het rechteruiteinde van de
    adresbalk, waar hij ook stopknop kan zijn zolang er geladen wordt.
16. `#palette-results:empty { display: none }` (`style.css:562-564`).
17. De witte `--scrim` in het lichte thema.

Wat ervoor terugkomt is één ding: een tandwiel rechts in `#controls`
(`margin-left: auto`). Dat is de plek waar elke browser zijn "meer"-knop heeft, en
`#controls` gebruikt na het verdwijnen van `#reload` nog maar 62 van de 240px.

### 5.2 Verhoudingen en ritme

```
264  totale breedte
 12  vulling links   ┐
240  kolom           ├── één kolom, geen inspringingen erbinnen
 12  vulling rechts  ┘
 24  rail: waar alle inkt begint (12 vulling + 12 rijvulling)
 32  elke aanwijsbare rij
 12  elke afstand tussen blokken
```

```css
#sidebar {
  position: fixed;
  inset: 0 auto 0 0;
  width: var(--sidebar-width);
  display: flex;
  flex-direction: column;
  gap: var(--blok);
  /* Nu is padding-top exact --topbar-height, dus de eerste knoprij raakt de
     onderrand van het zwarte plafond: de opvallendste naad in het beeld, en er
     staat geen lucht omheen. Tien pixel is genoeg om hem te laten ademen. */
  padding: calc(var(--topbar-height) + 10px) 12px 12px;
}

#controls {
  display: flex;
  align-items: center;
  gap: 2px;
  flex: none;
}

#controls button {
  width: var(--rij);
  height: var(--rij);
  display: grid;
  place-items: center;
  border-radius: var(--radius-control);
  color: var(--muted);
  transition: background-color var(--duur-vlak) var(--ease-vlak),
    color var(--duur-vlak) var(--ease-vlak),
    opacity var(--duur-vlak) var(--ease-vlak);
}

/* De terug- en vooruitknop wisselen bij elke navigatie tussen aan en uit, en het
   verschil tussen die twee is precies opacity — die stond niet in de lijst, dus
   de sprong was hard. Dit zijn bovendien de weinige elementen in de zijbalk die
   nooit hertekend worden, dus hier werkt een overgang gewoon. */
#controls button:disabled { opacity: 0.32; }
#controls button:hover:not(:disabled) { background-color: var(--fill); color: var(--text); }
#controls button:active:not(:disabled) { background-color: var(--fill-hover); box-shadow: var(--shadow-press); }

/* Instellingen hoort hier en niet in de voet: die is 240px breed en al vol, en
   een tandwiel tegen de plusknop van workspaces leest als 'instellingen van deze
   workspace' terwijl het venster- en app-breed is. */
#instellingen { margin-left: auto; }
```

De rail van 24px klopt voor drie van de vier blokken vanzelf: `.tab` en
`#new-tab` krijgen `padding: 0 var(--rij-vulling)`, dus hun icoonvak begint op
12 + 12 = 24. Voor `#controls` klopt het omdat de inkt van de terug-chevron
5,5px binnen zijn 16px-vak begint en dat vak 8px binnen een knop van 32px staat:
12 + 8 + 5,5 = 25,5. Een halve pixel te ver, en dat is binnen wat hinting toch al
verschuift.

**Wat daar wél mis is:** de drie iconen in `index.html:15-24` delen geen inktvak.
De chevrons lopen van x=5,5 tot x=10, de herlaadcirkel van x=3 tot x=13. Naast
elkaar leest dat als drie verschillende maten. Regel voor de hele set: **elk
zijbalk-icoon wordt getekend binnen x,y ∈ [3, 13] van de viewBox van 16, en de
optische massa vult dat vak.** De twee chevrons zijn nu te smal en moeten opnieuw
worden getekend; dat is de enige reden dat de rij nu onrustig is.

```css
#address-rij {
  position: relative;
  flex: none;
}

#address {
  width: 100%;
  height: var(--rij);
  padding: 0 34px 0 var(--rij-vulling);
  /* Geen border maar een inset-lijn: een border van 1px duwt de tekst 1px naar
     binnen zodra de focusrand erbij komt, en dan trilt de rail. */
  border: 0;
  border-radius: var(--radius-rij);
  background-color: transparent;
  box-shadow: inset 0 0 0 1px var(--stroke);
  color: var(--text);
  caret-color: var(--accent);
  font: inherit;
  transition: background-color var(--duur-vlak) var(--ease-vlak),
    box-shadow var(--duur-vlak) var(--ease-vlak);
}

#address::placeholder { color: var(--faint); }
#address:hover { background-color: var(--fill); }

#address:focus {
  outline: none;
  background-color: var(--fill-hover);
  /* 11% accent op een doorschijnende ondergrond over een willekeurig bureaublad
     is praktisch onzichtbaar; §7.2 stelt 14% voor en dat is nog steeds aan de
     lage kant voor dít materiaal. */
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 55%, transparent),
    var(--ring);
}

/* Herladen én stoppen op dezelfde plek: er is nu geen enkele manier om een
   hangende pagina af te breken vanuit de zijbalk. */
#herlaad {
  position: absolute;
  top: 50%;
  right: 6px;
  transform: translateY(-50%);
  width: 20px;
  height: 20px;
  display: grid;
  place-items: center;
  border-radius: var(--radius-icon);
  color: var(--faint);
}

#herlaad:hover { color: var(--text); background-color: var(--fill); }
```

---

## 6. Het tabblad als object

Zes standen, en ze mogen elkaar niet nabootsen. Dat is nu het probleem: hover en
actief zijn beide "een gevuld vlak", en het verschil is alleen hoeveel wit.

| Stand | Vlak | Tekst | Icoon |
| --- | --- | --- | --- |
| rust | niets | 13/400 `--muted` | favicon 16px, geen achtergrond |
| aanwijzen | `--fill` | 13/400 `--text` | favicon wijkt voor het kruisje |
| indrukken | `--fill-hover` + `--shadow-press` | idem | idem |
| actief | de plaat | 13/**500** `--text` | favicon |
| ladend | zoals de stand eronder | **titel blijft staan** | ademend vakje |
| van een assistent | zoals de stand eronder | eigenaarlabel + titel | glyph i.p.v. favicon |

```css
#tablist {
  flex: 1;
  list-style: none;
  margin: 0;
  padding: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  /* Geen gap: rijen die elkaar raken lezen als één kolom. */
}

/* De scrollbalk staat op 0 en er komt niets voor terug, dus bij twintig
   tabbladen is er geen enkele aanwijzing dat de lijst doorloopt. Een verloop van
   12px aan het uiteinde waar nog iets zit zegt dat wel, zonder een balk. */
#tablist::-webkit-scrollbar { width: 0; }
#tablist.kan-omhoog { mask-image: linear-gradient(180deg, transparent 0, #000 12px); }
#tablist.kan-omlaag { mask-image: linear-gradient(0deg, transparent 0, #000 12px); }
#tablist.kan-omhoog.kan-omlaag {
  mask-image: linear-gradient(180deg, transparent 0, #000 12px,
    #000 calc(100% - 12px), transparent 100%);
}

.tab {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  height: var(--rij);
  padding: 0 var(--rij-vulling);
  border-radius: var(--radius-rij);
  color: var(--muted);
  /* box-shadow staat bewust niet in deze lijst: alleen de actieve rij heeft er
     een, en die verandert niet door hover. Wat nooit verandert hoort niet in een
     transitielijst te staan. */
  transition: background-color var(--duur-vlak) var(--ease-vlak),
    color var(--duur-vlak) var(--ease-vlak);
}

.tab:hover { background-color: var(--fill); color: var(--text); }

/* Er bestaat nu nergens in deze app een :active-stand, en button { cursor:
   default } haalt ook de cursorwissel weg — er is dus letterlijk geen enkel
   signaal dat een klik geland is, terwijl er een IPC-rondgang plus een
   hertekening tussen klik en antwoord zit. */
.tab:active { background-color: var(--fill-hover); box-shadow: var(--shadow-press); }

/* Het enige verheven vlak in de app. */
.tab[aria-current="true"] {
  background-color: var(--fill-active);
  background-image: linear-gradient(180deg, var(--glass-sheen), transparent 62%);
  box-shadow: var(--plaat-schaduw);
  color: var(--text);
}

.tab[aria-current="true"]:active { box-shadow: var(--plaat-schaduw), var(--shadow-press); }

.tab .merk {
  width: 16px;
  height: 16px;
  flex: none;
  border-radius: 4px;
  /* Geen achtergrond. Leeg is leeg. */
  transition: opacity var(--duur-tik) var(--ease-vlak);
}

.tab .titel {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

/* Het kruisje neemt de plaats van het merk over in plaats van eigen breedte op te
   eisen. Dat scheelt 29px van de 216px die de rij binnenin heeft — precies wat
   het eigenaarlabel hierboven kost, dus per saldo verandert er niets aan de
   ruimte en wel iets aan de rust. */
.tab .sluit {
  position: absolute;
  left: var(--rij-vulling);
  width: 16px;
  height: 16px;
  display: grid;
  place-items: center;
  border-radius: var(--radius-icon);
  color: var(--muted);
  opacity: 0;
  /* opacity: 0 haalt een element niet uit de muisafhandeling; zonder dit sluit
     een trackpad-tik zonder voorafgaande hover een tabblad dat je nooit hebt
     zien staan. */
  pointer-events: none;
  transition: opacity var(--duur-tik) var(--ease-vlak);
}

.tab:hover .sluit,
.tab:focus-within .sluit { opacity: 1; pointer-events: auto; }
.tab:hover .merk,
.tab:focus-within .merk { opacity: 0; }

/* §7.10 schrijft 1.8 voor onder 12px; bij 10px zichtbaar tekent 1.6 in een
   viewBox van 16 nog 1,0 apparaatpixel en wordt het kruisje een vlek. */
.tab .sluit svg { width: 10px; height: 10px; stroke-width: 1.9; }

/* Zonder muis bestaat hover niet, en dan is de lijst niet op te ruimen. De prijs
   is dat het kruisje daar altijd zichtbaar is naast het favicon; dat is de goede
   prijs. */
@media (hover: none) {
  .tab .sluit { position: static; margin-left: auto; opacity: 1; pointer-events: auto; }
  .tab:hover .merk { opacity: 1; }
}
```

**Ladend.** De titel blijft staan. `Laden…` gooit de enige informatie weg die de
rij heeft, en omdat `did-navigate-in-page` bij elke history-push van een SPA
vuurt, wisselt de regel dan voortdurend tussen een leesbare titel en bleke grijze
tekst. Wat er in plaats daarvan gebeurt zit in het faviconvak (§7.9 beschrijft dat
al als "een ademend vlak in plaats van een leeg gat"):

```css
/* Nog geen favicon: een ademend vakje, want hier is de laadstand het enige wat
   te melden valt. Zodra app.js het src-attribuut zet valt deze regel weg. */
.tab.laadt img.merk:not([src]) {
  background-color: var(--skelet);
  animation: adem 1.4s var(--ease-vlak) infinite;
}

/* Wel een favicon: dan ademt het icoontje zelf, en blijft het herkenbaar. */
.tab.laadt img.merk[src] { animation: adem 1.4s var(--ease-vlak) infinite; }

@keyframes adem {
  0%, 100% { opacity: 0.45; }
  50% { opacity: 1; }
}
```

Dit is de enige lus in de zijbalk naast de glyph, en hij loopt alleen zolang er
werkelijk iets laadt. Voeg de fase-truc uit §6.4 toe zodra de lijst nog hertekend
wordt; met de keyed lijst uit §10 is dat niet meer nodig, want dan blijft het
element bestaan en loopt de animatie gewoon door.

**Van een assistent.** De glyph vervangt het favicon, en de eigenaar krijgt een
eigen label vóór de titel:

```html
<li class="tab agent" aria-current="false">
  <canvas class="merk glyph" aria-hidden="true"></canvas>
  <span class="eigenaar">Kim</span>
  <span class="titel">Vergelijkt wat hij gevonden heeft</span>
  <button class="sluit" type="button" aria-label="Tabblad sluiten">…</button>
</li>
```

Dat de eigenaar zichtbaar blijft is geen ornament maar een regel: §2.3 verbiedt
dat kleur de enige drager is, en zonder label zou "van wie is dit tabblad"
uitsluitend uit een gekleurd blokje van 16px komen.

**De glyph in de zijbalk is nu te klein om zijn eigen beweging te tonen.** Met
`n: 5, zijde: 16` en de vaste padding van 4 wordt een cel 1,6px, en op 1,6px met
1px ertussen is er geen patroon meer dat kan bewegen. Tegelijk tekent het eiland
met `n: 7` een héél ander raster, dus dezelfde stand ziet er op twee plekken
anders uit terwijl het commentaar bovenin `glyph.js` juist zegt dat dat de
bedoeling is.

De oplossing is niet één raster maar één **cel**:

```js
// De cel is overal even groot, het raster verschilt. Zo lezen de zijbalk (3×3)
// en het eiland (5×5) als hetzelfde materiaal op twee resoluties, in plaats van
// als twee verschillende iconen. De vaste padding van 4 kostte bij zijde 16 een
// kwart van de ruimte en liet 1,6px per cel over.
const rand = zijde * 0.1;
const cel = (zijde - 2 * rand) / (n + (n - 1) / 3.2);
const gap = cel / 3.2;
```

Bij `zijde 16, n 3` geeft dat cel 3,53 / gap 1,10; bij `zijde 26, n 5` cel 3,33 /
gap 1,04. De zijbalk roept dan `maakGlyph(merk, { n: 3, zijde: 16 })` en het
eiland `{ n: 5, zijde: 26 }`. De bewegingen zelf zijn al op `n` geschreven
(`lijn = ((t * 0.85) % 1) * (n + 2) - 1`), dus een veeg blijft een veeg.

---

## 7. De workspace-voet

De strip is nu de krapste en luidste plek van de app: stippen van 9px waar elk
ander pictogram 14-16px is, chips van 28px onder rijen van 34px, halo's die tot op
3px bij elkaar komen, en een horizontale scroll zonder scrollbalk. Bij vijf
workspaces past er al niets meer, en er is geen ruimte voor de instellingenknop
die er hoort te komen. Er is ook geen manier om een niet-actieve workspace te
sluiten of zijn naam te zien.

Verstilling ruilt de strip in voor **één rij die zegt waar je bent, en een lijst
die opengaat**:

```
┌────────────────────────────────┐
│  ● Persoonlijk              ⌄  │   ← altijd zichtbaar, 32px
└────────────────────────────────┘

opengeklapt, boven de rij:
   ● Persoonlijk              7
   ● Werk                     3
   ● Boodschappen             1
   + Nieuwe workspace
```

```css
#workspaces {
  flex: none;
  padding-top: var(--blok);
  border-top: 1px solid var(--stroke);
}

#ws-huidig {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  height: var(--rij);
  padding: 0 var(--rij-vulling);
  border-radius: var(--radius-rij);
  color: var(--muted);
  transition: background-color var(--duur-vlak) var(--ease-vlak);
}

#ws-huidig .naam {
  flex: 1;
  text-align: left;
  font-family: var(--font-small);
  font-size: 12px;
  font-weight: 500;
  color: var(--text);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

#ws-huidig:hover { background-color: var(--fill); }
#ws-huidig:active { background-color: var(--fill-hover); box-shadow: var(--shadow-press); }

/* Draaien is een transform en dus toegestaan; het is ook het enige wat in deze
   voet nog beweegt. */
#ws-huidig .chevron { transition: transform var(--duur-vlak) var(--ease-vlak); }
#ws-huidig[aria-expanded="true"] .chevron { transform: rotate(180deg); }

#workspace-list {
  flex: none;
  list-style: none;
  margin: 0 0 4px;
  padding: 0;
  max-height: 40vh;
  overflow-y: auto;
}

.ws {
  display: flex;
  align-items: center;
  gap: 10px;
  height: var(--rij);
  padding: 0 var(--rij-vulling);
  border-radius: var(--radius-rij);
  color: var(--muted);
  transition: background-color var(--duur-vlak) var(--ease-vlak),
    color var(--duur-vlak) var(--ease-vlak);
}

/* Geen halo. Twaalf pixel massa in plaats van negen plus drie ring: even
   zichtbaar, half zoveel getekend, en twee naburige stippen raken elkaar niet. */
.ws .stip,
#ws-huidig .stip {
  width: 10px;
  height: 10px;
  flex: none;
  border-radius: 50%;
  background: var(--ws-color);
}

.ws .naam { flex: 1; min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }

.ws .aantal {
  flex: none;
  font-family: var(--font-small);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  color: var(--faint);
}

.ws:hover { background-color: var(--fill); color: var(--text); }

/* De actieve workspace krijgt géén glasplaat: die is voorbehouden aan het
   actieve tabblad. Hier doet gewicht het werk, en dat is genoeg omdat de lijst
   maar één ding tegelijk laat zien. */
.ws[aria-current="true"] .naam { font-weight: 500; color: var(--text); }
```

Wat dit oplost, en dat is meer dan de smaakwinst:

- **Elke workspace heeft een naam in beeld.** Nu is een niet-actieve workspace een
  stip van 9px, en na zes workspaces herhalen de kleuren zich, dus workspace 7 is
  van workspace 1 niet te onderscheiden.
- **Elke workspace is te sluiten**, niet alleen die waar je in zit. De bewapening
  in twee klikken uit `app.js:238-254` blijft, maar de tekst "N tabbladen gaan
  dicht" komt in de rij te staan in plaats van in een systeemtooltip die na een
  seconde verschijnt terwijl de bewapening na 2,5 seconde vervalt.
- **Hernoemen wordt vindbaar.** Dubbelklikken op de naam van de actieve chip is nu
  de enige weg en er is geen enkele aanwijzing dat het bestaat.
- **De voet heeft geen horizontale scroll meer**, dus er valt niets meer weg.
- **De plusknop wordt een rij** en verdwijnt als los element.

Wat het kost: één klik extra om van workspace te wisselen. Dat is een reële prijs
op de kernfunctie van de app, en hij is alleen te dragen als Ctrl+1..9 werkt —
wat nu niet zo is zodra de pagina de focus heeft. Zie §10.

Openklappen duwt `#tablist` korter. Dat is layout, en §6.3 verbiedt layout
animeren; dus het gebeurt zonder overgang, in één frame. Dat is hier ook het
juiste: een andere workspace is een andere sessie, en dat mag een harde knip zijn.

---

## 8. Het eiland

### 8.1 Wat er nu misgaat

Drie dingen, en het derde is een fout en geen smaakkwestie.

1. De inhoud staat niet in de pil gecentreerd. `padding: calc(var(--plafond-hoogte)
   - 8px) 15px 11px` zet de rij op y=36 terwijl het plafond tot y=44 loopt: 8 van
   de 26 pixels van de glyph liggen ín het plafond. Het magische `- 8px` is de
   enige reden dat het er ongeveer goed uitziet.
2. De maat verandert vóórdat de view mee is. `island.js` zet de HTML meteen om en
   meldt daarna pas via `island:size`; bij rust → invoer springt de pil van ~109px
   naar ~226px, want een `<input>` zonder breedte pakt zijn standaard `size=20`.
   Dat is geen ontbrekende animatie maar een zichtbare hapering.
3. De view legt beslag op een strook van de pagina. `layoutIsland()` zet hem op
   y=0 met de gemeten hoogte, terwijl het paginagebied bij y=44 begint; de onderste
   ~30px liggen over de pagina en vangen daar muisklikken. Dat is niet te
   omzeilen: **`View` heeft geen `setIgnoreMouseEvents`** — geverifieerd in
   `node_modules/electron/electron.d.ts:14208-14277`, waar de hele klasse
   `addChildView`, `getBounds`, `removeChildView`, `setBackgroundColor`,
   `setBorderRadius`, `setBounds`, `setVisible` en `children` bevat en verder
   niets. `setIgnoreMouseEvents` staat alleen op `BaseWindow` (regel 3068) en
   `BrowserWindow` (regel 5681). De typings zeggen er bij `setBorderRadius` zelfs
   expliciet bij: *"The area cutout of the view's border still captures clicks."*

### 8.2 Drie vormen, drie breedtes

Verstillings antwoord op punt 3 is niet techniek maar ontwerp: **in rust hangt er
niets onder het plafond.** De glyph zit ín de donkere strook, op dezelfde
achtergrond, dus je ziet hem wel en hij ligt nergens overheen. De pil met zijn
holle hoekjes komt alleen tevoorschijn als er werkelijk iets te melden is — en dan
is de gegoten aansluiting, het zorgvuldigste detail van dit ontwerp, ineens ook
een gebeurtenis in plaats van meubilair.

| Vorm | Wanneer | Kaartbreedte | Kaarthoogte | Hangt onder het plafond |
| --- | --- | --- | --- | --- |
| `rust` | niets aan de hand | 26px (`max-content`) | 44px | 0px |
| `regel` | de assistent zegt iets | 300px | 84px | 40px |
| `kaart` | invoer, of hij wacht op jou | 380px | 84px | 40px |

```css
:root {
  --hoek: 18px;          /* was 17; gelijk aan --radius-card */
  --plafond-hoogte: 44px;
  --vulling: 13px;
  --pil-vulling: 9px;
  --glyph: 26px;
}

#kaart {
  position: absolute;
  top: 0;
  left: var(--vulling);
  /* Reken de bovenmarge uit in plaats van hem met een magische -8px goed te
     praten: plafond plus een echte binnenmarge, en onder dezelfde marge. Dan
     blijft het zwaartepunt in het midden van het zichtbare deel, ook als er
     ooit een tweede regel of een knoprij bijkomt. */
  padding: calc(var(--plafond-hoogte) + var(--pil-vulling)) 15px var(--pil-vulling);
  background: var(--plafond);
  border-radius: 0 0 var(--hoek) var(--hoek);
}

/* In rust is er geen pil: alleen de glyph, in het plafond. De achtergrond en de
   holle hoekjes vallen weg, dus de view is precies zo hoog als het plafond en
   ligt nergens over de pagina. */
#kaart[data-vorm="rust"] {
  width: max-content;
  padding: calc((var(--plafond-hoogte) - var(--glyph)) / 2) 0;
  background: none;
}

#kaart[data-vorm="rust"]::before,
#kaart[data-vorm="rust"]::after { display: none; }

/* Vaste breedtes per vorm. Nu meet de kaart zichzelf op elke inhoudswijziging,
   dus de balk ademt mee met elke zin die de assistent uitspreekt. Een balk die
   niet van maat verandert terwijl hij praat is rustiger dan een die dat wel
   doet, ook al staat er soms lucht rechts van de tekst. */
#kaart[data-vorm="regel"] { width: 300px; }
#kaart[data-vorm="kaart"] { width: 380px; }

#rij {
  display: flex;
  align-items: center;
  gap: 11px;
  min-height: var(--glyph);
  transition: opacity var(--duur-wissel) var(--ease-vlak);
}

#rij.weg { opacity: 0; }

#vorige {
  font-family: var(--font-small);
  font-size: 11px;
  /* 14px met een regelhoogte van 15,4px snijdt de staarten van g, j en p af.
     Zet de regelhoogte gelijk aan het vak in plaats van het vak te verkleinen. */
  line-height: 14px;
  height: 14px;
  color: var(--plafond-zacht);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  opacity: 0;
  transform: translateY(3px);
  transition: opacity var(--duur-schuif) var(--ease-vlak),
    transform var(--duur-schuif) var(--ease-entree);
}

#vorige.zichtbaar { opacity: 1; transform: none; }

#huidig {
  font-size: 14px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: opacity var(--duur-wissel) var(--ease-vlak);
}

#huidig.wisselt { opacity: 0; }

/* Vaste breedte, dus de kaart verandert niet per toetsaanslag. */
#invoer {
  flex: 1;
  min-width: 0;
  height: 22px;
  border: 0;
  background: none;
  color: var(--plafond-tekst);
  caret-color: var(--accent);
  font: inherit;
  font-size: 14px;
}

#stop, #ga {
  flex: none;
  border: 0;
  border-radius: var(--radius-control);
  padding: 5px 11px;
  font-family: var(--font-small);
  font-size: 12px;
  font-weight: 500;
  /* Deze twee knoppen hadden geen enkele overgang, terwijl alles in de zijbalk
     120ms doet — dat leest als een ander programma. En dit is de plek waar je
     onder tijdsdruk op Stop moet drukken. */
  transition: filter var(--duur-vlak) var(--ease-vlak),
    box-shadow var(--duur-vlak) var(--ease-vlak);
}

#stop { background: var(--gevaar-vlak); color: var(--gevaar-tekst); }
#ga { background: var(--accent); color: var(--on-accent); }

#stop:hover, #ga:hover { filter: brightness(1.18); }
#stop:active, #ga:active { filter: brightness(0.92); box-shadow: var(--shadow-press); }
```

### 8.3 Hoe hij tussen vormen overgaat

`View.setBounds()` kent geen animatie — geverifieerd, zie §8.1. De maat springt
dus altijd. Wat wél kan is **de sprong buiten beeld leggen**: de inhoud vervaagt
weg, de maat verspringt terwijl er niets te zien is, en de nieuwe inhoud komt op.
Twee keer 110ms, met de sprong in het gat ertussen.

De volgorde is het hele punt, en hij is asymmetrisch:

```js
// Groeien: eerst ruimte, anders knipt de rand van de view de nieuwe inhoud af.
// Krimpen: eerst tekenen, anders zie je een frame lege view rond een kleine pil.
// Nu gebeurt het altijd andersom — island.js zet de HTML om en meldt de maat pas
// daarna — en dat is de hapering die je bij elke standwissel ziet.
const RANG = { rust: 0, regel: 1, kaart: 2 };
const WISSEL = 110; // ms, gelijk aan --duur-wissel in island.css

const pauze = (ms) => new Promise((r) => setTimeout(r, ms));

async function naarVorm(vorm, vullen) {
  const groeit = RANG[vorm] > RANG[kaart.dataset.vorm ?? 'rust'];
  rij.classList.add('weg');
  await pauze(WISSEL);

  vullen();                       // hidden-vlaggen, tekst, knoppen
  kaart.dataset.vorm = vorm;

  if (groeit) await meet();
  rij.classList.remove('weg');
  await pauze(WISSEL);
  if (!groeit) await meet();
}

function meet() {
  // meldGrootte is een invoke (preload-island.js:8) en dus awaitbaar. Wat de
  // resolve NIET garandeert, is dat de compositor de nieuwe bounds al getekend
  // heeft — de handler in main.js keert terug zodra setBounds() geretourneerd is.
  // Zie hieronder voor de zekere variant.
  return eiland.meldGrootte(
    Math.ceil(kaart.offsetWidth + marge * 2),
    Math.ceil(kaart.offsetHeight),
  );
}
```

**De zekere variant.** `View` zendt een `bounds-changed`-event uit
(`electron.d.ts:14216`, "Emitted when the view's bounds have changed in response
to being laid out"). Dat is precies het signaal dat hier ontbreekt. Eén kanaal
erbij, in de vorm `domein:actie` met een Engels werkwoord:

```js
// main.js, in de constructor naast layoutIsland()
// De balk moet weten wannéér hij zijn nieuwe maat heeft, anders animeert hij
// inhoud in een view die nog de oude rechthoek is.
this.island.on('bounds-changed', () => {
  if (!this.win.isDestroyed()) this.island.webContents.send('island:bounds');
});
```

```js
// preload-island.js
onGemeten: (fn) => ipcRenderer.on('island:bounds', () => fn()),
```

Ik heb niet geverifieerd of `bounds-changed` ook vuurt wanneer `setBounds()` de
view op *dezelfde* maat zet; als dat niet zo is moet `meet()` een timeout naast de
belofte zetten, anders hangt de overgang bij een wissel die de maat niet
verandert. Dat is met de DevTools van de island-view in twee minuten na te gaan.

**De dubbele 13.** `--vulling: 13px` staat als getal ook in `island.js:16`
(`const marge = 13`), en de holle hoekjes zijn een `radial-gradient` die exact op
die waarde past — 1px verschil geeft een zichtbare naad. Eén bron:

```js
// De holle hoekjes passen exact op --vulling; twee bronnen voor dat getal
// betekent dat de gegoten aansluiting stukgaat zodra er één verschuift.
const marge = parseFloat(
  getComputedStyle(document.documentElement).getPropertyValue('--vulling'),
);
```

Hetzelfde geldt voor de 44, die apart staat in `style.css:5`, `island.css:18` en
`main.js:10`, en voor de drie minimumbreedtes van het eiland (`min-width: 96px` in
CSS, `Math.max(120, …)` in `setIslandSize` en nog eens in `layoutIsland`). §10 van
`ui-systeem.md` heeft daar `tokens.js` voor; deze richting heeft hem nodig, want
de rustvorm van 26px breed en 44px hoog loopt vast op beide ondergrenzen in
`main.js:284-290`. Die worden `Math.max(48, …)` en `Math.max(TOPBAR_HEIGHT, …)`.

### 8.4 De regel die wisselt

De enige echte inhoudsovergang van de app is nu half af: de oude regel zakt netjes
weg naar `#vorige`, maar de nieuwe regel wordt met `huidigEl.textContent = tekst`
in één frame vervangen. Dat vertelt de helft van het verhaal — er komt iets aan,
maar wat er stond ging niet weg, het werd overschreven. Bij een assistent is de
opeenvolging van regels juist het verhaal.

```js
// Uit en weer in, zodat je ziet dát er iets vervangen wordt. De vorige regel
// zakt tegelijk naar boven; samen is dat één beweging in plaats van twee halve.
async function toonRegel(tekst, bezig) {
  if (laatsteRegel === tekst) return;
  if (laatsteRegel) {
    vorigeEl.textContent = laatsteRegel;
    vorigeEl.classList.add('zichtbaar');
  }
  huidigEl.classList.add('wisselt');
  await pauze(WISSEL);
  huidigEl.textContent = tekst;
  huidigEl.classList.remove('wisselt');
  laatsteRegel = tekst;
}
```

De `bezig`-vlag stuurt niets visueels meer aan: de glans over de tekst
(`island.css:116-134`) verdwijnt. Twee dingen die tegelijk zeggen "er gebeurt
iets" — een bewegende glyph van 26px en een lichtstreep over de tekst — is er één
te veel, en de glyph is de betere van de twee omdat die ook nog zegt *wát* er
gebeurt.

### 8.5 Twee dingen die deze richting niet oplost in het eiland

- **'Niet nu' breekt de opdracht af.** In de stand `actie` heet `#stop` "Niet nu",
  maar hij roept `island:stop` → `stopAgent(false)` aan en dat gooit de hele
  opdracht weg. Uitstellen is precies wat je bij "Inloggen nodig" wilt. Dat is
  geen ontwerpvraag maar een gedragsfout, en hij hoort in een eigen ontwerp thuis.
- **Een geblokkeerde link zonder actieve assistent laat een onwegklikbare balk
  achter**: `stopAgent` keert bij `!this.agent` terug vóór de `sendIsland({modus:
  'rust'})` op `main.js:528`. Zolang 'geblokkeerd' en 'de assistent heeft je hulp
  nodig' dezelfde modus, hetzelfde kanaal en dezelfde kleur delen, kan geen enkel
  ontwerp die twee uit elkaar houden.

---

## 9. De bewegingstaal

### 9.1 Tokens

§6.1 geeft de namen; deze richting geeft ze andere waarden. Korter, en met een
curve die gekozen is in plaats van overgeërfd — op één plek na (`omhoog`,
`style.css:530`) staat nu overal `ease`, de browserstandaard, en die heeft een
luie staart die op 140ms als vertraging leest.

```css
:root {
  --duur-tik: 90ms;      /* iets kleins dat onder de muis verschijnt */
  --duur-vlak: 120ms;    /* achtergrond, kleur, rand van een bedieningselement */
  --duur-wissel: 110ms;  /* inhoud die weggaat of opkomt; twee keer = 220ms */
  --duur-paneel: 170ms;  /* een paneel dat komt of gaat */
  --duur-schuif: 220ms;  /* informatie die van plek wisselt */

  /* Symmetrisch en strak: hoort bij hover, dat twee kanten op gaat en waar een
     asymmetrische curve dus altijd één richting verkeerd doet. */
  --ease-vlak: cubic-bezier(0.32, 0, 0.67, 1);
  --ease-entree: cubic-bezier(0.16, 0.84, 0.24, 1);
  --ease-vertrek: cubic-bezier(0.5, 0, 0.9, 0.3);
  --ease-rond: linear;

  /* Het verplaatsingsbudget van deze richting. Wat verder moet, verplaatst niet
     maar verandert. */
  --verzet: 4px;
}
```

### 9.2 Wat beweegt, en wat niet

| Beweegt | Waarom | Duur |
| --- | --- | --- |
| `background-color`, `color` bij hover | anders knippert de rij onder je muis | `--duur-vlak` |
| `box-shadow` bij indrukken | de enige bevestiging dat de klik geland is | `--duur-vlak` |
| `opacity` van het sluitkruisje en het merk | ze wisselen van plaats, dus ze kruisen | `--duur-tik` |
| `opacity` van in-/uitgeschakelde navigatieknoppen | ze wisselen bij elke navigatie | `--duur-vlak` |
| `opacity` van `#rij` en `#huidig` in het eiland | de maatsprong ligt in het gat | `--duur-wissel` |
| `opacity` + `translateY(3px)` van `#vorige` | informatie die van plek wisselt | `--duur-schuif` |
| `transform: rotate` van de workspacechevron | zegt open/dicht zonder tekst | `--duur-vlak` |
| de commandobalk bij openen én sluiten | een paneel dat komt en gaat | `--duur-paneel` |
| de glyph | de betekenisdrager van de app | doorlopend |
| het ademende faviconvak, zolang er laadt | zegt "hier gebeurt iets" | 1,4s |

| Beweegt niet | Waarom |
| --- | --- |
| `width`, `height`, `top`, `left`, `margin`, `padding`, `gap` | layout animeren schokt de hele kolom; in het eiland wordt het bovendien zestig `island:size`-aanroepen per seconde |
| de maat van het eiland | `setBounds()` kent geen animatie — geverifieerd |
| wisselen van tabblad of workspace | dat is een native `setVisible()`, er is niets om aan te haken |
| de tabbladlijst bij openklappen van de workspaces | layout, en een harde knip past bij "andere sessie" |
| alles in rust | de app in rust heeft nul animaties, ook geen langzame |

### 9.3 Wat er verdwijnt

- `@keyframes kloppen` (`style.css:289-299`) — de glyph beweegt al.
- `@keyframes glans` (`island.css:127-134`) — idem, in het eiland.
- De rustpuls van de glyph zelf. In `glyph.js` valt de `default`-tak weg als
  lopende animatie:

```js
// In rust beweegt er niets. Eén frame, geen volgend frame aangevraagd: dat is
// het verschil tussen 'de app staat stil' en 'de app staat stil maar iets
// pulseert onderin je ooghoek'.
if (modus === 'rust' && !heeftNieuweStand) return;
```

- `omhoog` verplaatst 4px in plaats van 6 (`--verzet`), en krijgt eindelijk een
  tegenhanger:

```css
@keyframes omhoog {
  from { opacity: 0; transform: translateY(calc(var(--verzet) * -1)); }
}

@keyframes omlaag {
  to { opacity: 0; transform: translateY(calc(var(--verzet) * -1)); }
}

#palette-card { animation: omhoog var(--duur-paneel) var(--ease-entree); }
#palette.sluit #palette-card { animation: omlaag var(--duur-wissel) var(--ease-vertrek); }
```

De volgorde bij de commandobalk moet daarvoor om. Nu zet `openPalette()` eerst
`palette.hidden = false` en roept dáárna `browser.setPaletteOpen(true)` aan, wat
een `invoke` is en dus asynchroon: de pagina ligt er in die frames nog overheen,
dus de eerste helft van de entree speelt onzichtbaar af. Bij sluiten is er
helemaal geen uittree, en zelfs als die er was zou hij weggetekend worden zodra de
pagina terugkomt.

```js
// De pagina is een native laag en tekent over deze overlay heen. Dus: eerst de
// pagina weg, dan tonen — en bij sluiten eerst de animatie afmaken en pas daarna
// het kanaal, anders verdwijnt de uittree onder de pagina.
async function openPalette() {
  await browser.setOverlay(true);
  palette.hidden = false;
  paletteInput.value = '';
  keuze = 0;
  tekenResultaten();
  paletteInput.focus();
  sidebar.inert = true;
}

async function sluitPalette() {
  palette.classList.add('sluit');
  await pauze(110);
  palette.classList.remove('sluit');
  palette.hidden = true;
  sidebar.inert = false;
  await browser.setOverlay(false);
}
```

`setOverlay` is de naam uit §10 en uit `ROUTEKAART.md §1.1`: `ui:palette` en
`ui:overlay` gaan op in één kanaal `ui:overlay`, met een teller in plaats van een
booleaan.

### 9.4 prefers-reduced-motion

Deze richting is met opzet zo gebouwd dat "beweging uit" bijna geen informatie
kost — alles wat beweegt is een overgang tussen twee standen die allebei uit
zichzelf leesbaar zijn. Op één plek geldt dat niet, en dat is de glyph.

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation: none !important; transition: none !important; }

  /* Zonder de keyframes blijft een ademend vakje op zijn beginwaarde staan; die
     zetten we hier hard, zodat 'ladend' ook stil zichtbaar is. */
  .tab.laadt img.merk:not([src]) { background-color: var(--skelet); opacity: 0.55; }

  /* De vorige regel komt normaal met een verschuiving op; zonder beweging moet
     hij gewoon staan in plaats van 3px te laag te blijven hangen. */
  #vorige.zichtbaar { opacity: 1; transform: none; }
}
```

`glyph.js` valt buiten dat blok — een canvas met een eigen `requestAnimationFrame`
raakt CSS niet. §6.5 schrijft één stilstaand frame op een vaste `t` voor. Dat is
bijna goed, en op één punt niet: bij `t = 0.25` zetten `zoeken` en `lezen` allebei
een hoek aan en zijn ze niet uit elkaar te houden. Kies de `t` per stand:

```js
// Eén stilstaand beeld per stand — en per stand een ándere t, want op één vaste
// waarde lichten 'zoeken' en 'lezen' allebei dezelfde hoek op en zegt de
// stilstaande glyph niets meer. Deze waarden zijn op het oog gekozen bij n = 5;
// controleer ze visueel na, ze zijn niet berekend.
const STIL_T = {
  zoeken: 0.75, lezen: 1.15, analyseren: 0.5, debuggen: 0.9,
  actie: 0.6, invoer: 0.55, rust: 0.4,
};

const rustig = window.matchMedia('(prefers-reduced-motion: reduce)');
```

Voor `klaar` geldt iets aparts: dat is de enige eenmalige animatie in `glyph.js`
(een cirkel die vanuit het midden naar buiten groeit, `front = (t - begon) * 5.5`).
Stilzetten halverwege is een leugen — teken daar de *afgemaakte* stand, dus met
een `front` die groter is dan de halve diagonaal. Diezelfde stand is trouwens ook
zonder reduced motion kapot zolang `maakGlyph()` per hertekening opnieuw wordt
aangeroepen: `begon` gaat dan telkens terug naar nu, en de stand die "klaar" moet
betekenen loopt in beeld als een eeuwige puls. Zie §10.

---

## 10. Wat er eerst moet

Dit deel is geen ontwerp maar een voorwaarde. **Zonder deze twee ingrepen maakt
deze richting de app slechter, niet beter** — een subtiel ontwerp dat flikkert
leest als kapot, terwijl een luid ontwerp dat flikkert alleen als druk leest.

### 10.1 De tabbladlijst bijwerken in plaats van vervangen

`app.js:77` doet `tablist.replaceChildren(...)` bij elke statusupdate, en zes
webContents-events per tabblad voeden die. Elk `<li>` is dus bij elke history-push
van elke openstaande SPA een nieuw element. Gevolg: een CSS-transitie heeft geen
beginwaarde, `:active` overleeft de klik niet, focus verdwijnt, en de
`requestAnimationFrame`-lus van elke glyph begint opnieuw met een verse `begon`.

Elke transitie in dit document is dode CSS tot dit gefixt is.

```js
// Bijwerken in plaats van vervangen. Een transitie heeft een beginwaarde nodig op
// een element dat er al was, en :active heeft een element nodig dat de mousedown
// overleeft; replaceChildren levert allebei niet. Dit is ook wat de focus in de
// zijbalk redt: nu verdwijnt een contentEditable workspacenaam mét je invoer
// zodra er een pagina-event binnenkomt.
const rijen = new Map(); // id -> HTMLLIElement

function tekenTabbladen(tabs, activeId) {
  for (const [id, li] of rijen) {
    if (!tabs.some((t) => t.id === id)) {
      li.remove();
      rijen.delete(id);
    }
  }

  let vorige = null;
  for (const tab of tabs) {
    let li = rijen.get(tab.id);
    if (!li) {
      li = maakRij(tab);
      rijen.set(tab.id, li);
    }
    werkRijBij(li, tab, tab.id === activeId);
    // insertBefore verplaatst alleen wat werkelijk verkeerd staat; verplaatsen
    // kost focus en :active, dus doe het zo min mogelijk.
    const anker = vorige ? vorige.nextSibling : tablist.firstChild;
    if (li !== anker) tablist.insertBefore(li, anker);
    vorige = li;
  }
}
```

`werkRijBij` zet alleen wat veranderd is: `aria-current`, de klasse `laadt`, de
titel als hij anders is, en `glyph.zet(tab.modus)` in plaats van een nieuwe
`maakGlyph()`. Daarmee lopen er ook niet langer tientallen tekenlussen tegelijk,
en gaat de stand `klaar` één keer af in plaats van bij elke pushState opnieuw.

Wat er meteen bij hoort, want het is nu de enige plek waar het actieve tabblad
buiten beeld kan raken zonder dat iets dat verraadt:

```js
// Alleen scrollen als het actieve id werkelijk wijzigt. Bij elke pushState
// scrollen zou de lijst onder je muis vandaan trekken terwijl een pagina laadt.
if (activeId !== vorigActiveId) {
  rijen.get(activeId)?.scrollIntoView({ block: 'nearest' });
  vorigActiveId = activeId;
}
```

### 10.2 pushState samenvoegen

```js
// Zes webContents-events per tabblad roepen elk direct pushState aan, en
// did-navigate-in-page vuurt bij elke history-push van een SPA. De bezochte
// website bepaalt zo hoe vaak jouw zijbalk hertekent — één samenvoeging per tick
// haalt de piek eraf zonder iets aan de state-stroom te veranderen.
pushState() {
  if (this.stateGepland) return;
  this.stateGepland = true;
  setImmediate(() => {
    this.stateGepland = false;
    this.pushStateNu();
  });
}
```

### 10.3 Sneltoetsen die de pagina overleven

Deze richting haalt zichtbare bedieningselementen weg en leunt dus zwaarder op het
toetsenbord dan de huidige. Dat mag alleen als het toetsenbord werkt, en dat doet
het nu niet: de `keydown`-luisteraar hangt aan het document van de
zijbalk-renderer, terwijl een tabblad een eigen `WebContentsView` met een eigen
focusketen is. Zodra je in de pagina klikt gaan Ctrl+T, Ctrl+L, Ctrl+K, Ctrl+J en
Ctrl+1..9 nergens meer heen. Het patroon dat het wél goed doet staat al in de
codebase: `devtoolsSneltoets(wc)` op `main.js:64-70`, via `before-input-event` per
webContents.

Zonder deze fix zijn drie beloftes van dit document leeg: "Ctrl T" onder de
tabbladlijst, "Ctrl J" voor het eiland, en de extra klik naar een workspace die
door Ctrl+1..9 gecompenseerd zou worden.

### 10.4 Kleinigheden die hier langskomen

- `raiseIsland()` (`main.js:293-297`) hoeft de view niet eerst te verwijderen. De
  typings zeggen bij `addChildView` (`electron.d.ts:14226-14229`) expliciet: *"If
  the same View is added to a parent which already contains it, it will be
  reordered such that it becomes the topmost view."* De `removeChildView` ervoor
  riskeert een frame waarin het eiland uit de vensterboom is, en dat gebeurt bij
  élk nieuw tabblad.
- De commandobalk wordt over het paginagebied gecentreerd in plaats van over het
  venster, zodat hij dezelfde middellijn deelt met het eiland
  (`main.js:280`). Eén regel:

  ```css
  #palette {
    justify-content: center;
    /* Het eiland hangt boven het paginagebied; twee zwevende panelen op twee
       middellijnen die 132px uit elkaar liggen leest als een fout. */
    padding-left: var(--sidebar-width);
  }
  ```

- `.result` krijgt de maat van `.tab`: 32px hoog, favicon 16px, radius
  `--radius-content` (18 buiten − 6 vulling = 12, de concentrische regel uit
  §4.1). Nu zijn het 38px, 15px en 9px voor precies hetzelfde soort rij, en je
  ziet ze direct na elkaar.
- De gekozen regel in de commandobalk krijgt `--fill-active` plus gewicht 500, en
  hover krijgt `--fill`. Nu delen ze allebei `--fill-hover` en is toetsenbord-
  selectie niet van muis-hover te onderscheiden.
- `#palette-results:empty { display: none }` wordt de lege staat uit §7.7, zodat
  de kaart niet onder je cursor krimpt tijdens het typen. Plus een `min-height` op
  de kaart, want `tekenResultaten()` vervangt de lijst bij elke toetsaanslag en het
  paneel verspringt dus zes keer als je een woord van zes letters typt.

---

## 11. Wat deze richting niet goed doet

Elke richting kost iets. Dit zijn de rekeningen van deze, en ze zijn geen van
alle klein.

**1. De app wordt moeilijker te zíén.** Dat is geen bijwerking maar het
onvermijdelijke gevolg van de transparantietrap uit §3.1. Op een druk
bureaubladfoto door acrylic heen is een zijbalk die bijna niets tekent een
zijbalk die half verdwijnt. De één-plaat-regel betekent bovendien dat er precies
één element is met een gegarandeerde contrastbodem; alle andere rijen zijn tekst
op materiaal. Het lichte thema is hier duidelijk de zwakkere helft: `--fill-active`
op .46 is veel minder overtuigend "verheven" dan de huidige .82. Deze richting is
eerlijk gezegd beter in donker dan in licht.

**2. Ontdekbaarheid gaat achteruit, en niet een beetje.** Weggehaald: de zichtbare
herlaadknop uit `#controls`, het sluitkruisje tot je hovert, de tekst "Ctrl J" in
de rustende balk, de rustpil zelf, de chips van niet-actieve workspaces, de
plusknop voor een workspace als los element. Elk van die zes is iets wat een
nieuwe gebruiker nu ziet en straks moet raden. Een app zonder menubalk
(`main.js:608`), zonder contextmenu en zonder helpscherm verlegt de hele
ontdekbaarheid naar de UI zelf — en deze richting maakt die UI stiller.

**3. De workspacelijst achter een klap kost een klik op de kernfunctie.** Van
workspace wisselen is het idee waar deze browser om draait, en het gaat van één
klik naar twee. Ctrl+1..9 compenseert dat, maar alleen na §10.3, en een sneltoets
die je niet ziet compenseert niets voor wie hem niet kent.

**4. De onverzadigde workspacekleuren zijn een intern conflict.** Ze moesten weg
bij `--accent` en bij de glyph-kleuren, en ze moesten zachter om niet het luidste
ding in de kolom te zijn. Maar zes onverzadigde tinten op een stip van 10px zijn
moeilijk uit elkaar te houden — en de namen die dat zouden opvangen zitten achter
diezelfde klap uit punt 3. Dat is niet opgelost, alleen verplaatst.

**5. Zonder de architectuurfixes is dit een verslechtering.** §10 is geen bonus.
Subtiele overgangen op een lijst die bij elke history-push van elke SPA compleet
opnieuw wordt getekend, geven een app die knippert zonder dat je begrijpt waarom.
De huidige, luidere zijbalk verbergt dat probleem beter dan deze het zou doen.

**6. Er is geen plezier.** Deze richting heeft precies één memorabel moment — de
glyph — en verwijdert bewust alles wat ernaast zou kunnen staan. Dat is een
weddenschap: als het product op een schermafdruk *leuk* moet zijn, is
terughoudendheid de verkeerde hefboom. Verstilling wint pas na een uur gebruik, en
dat is niet het moment waarop iemand besluit of hij het mooi vindt.

**7. Aanraking krijgt een andere app.** Het `@media (hover: none)`-blok zet het
sluitkruisje permanent terug in de rij. Op een Windows-laptop met aanraakscherm
krijg je dus precies de drukkere lijst die deze richting elders wegneemt, en
niemand heeft die versie ontworpen — hij is een uitzondering, geen tweede
ontwerp.

**8. Reduced motion levert een app op zonder enige voortgangsfeedback.** Omdat de
glyph de enige lus is en die bij reduced motion stilvalt, blijft er van "er
gebeurt iets" niets over behalve tekst. Het stilstaande frame per stand is een
pleister. Een richting die meer statische signalen had gehad (een teller, een
balkje, een tweede kleurvlak) zou hier beter uit zijn gekomen.

**9. De vaste breedtes van het eiland kosten ruimte.** Een korte regel als
"Opdracht lezen" staat in een pil van 300px met veel lucht rechts. Dat is bewust —
een balk die niet ademt terwijl hij praat is rustiger — maar het is wel zichtbaar
lege ruimte, en op een smal venster is die 300px niet gratis.

**10. Wat deze richting niet raakt.** De dode strook boven elke pagina blijft
bestaan zodra het eiland iets zegt (40px, want `View` heeft geen
`setIgnoreMouseEvents`); "Niet nu" breekt nog steeds de opdracht af; de
geblokkeerde-link-balk hangt nog steeds vast; er is nog steeds geen manier om
vanuit het eiland naar het tabblad van de assistent te springen; en er is nog
steeds geen logboek van wat hij gedaan heeft. Dat zijn gedragsfouten, en een
visuele richting lost die niet op — hij maakt hooguit zichtbaarder dat ze er zijn.

---

## 12. Wat nog gemeten moet worden

Alles hieronder is aanname of afleiding, niet meting. Geen van deze punten
blokkeert het ontwerp, alle vier bepalen ze of een detail klopt.

1. **De ondergrondaanname van §3.1** (sRGB 0.55 licht / 0.16 donker onder het
   acrylic). Het hele contrastargument hangt eraan. Meet het met een
   schermafdruk over drie verschillende bureaubladen — licht, donker, en een
   drukke foto — en herzie de zes alfawaarden als de aanname er ver naast zit.
2. **Of `bounds-changed` ook vuurt bij een `setBounds()` die de maat niet
   verandert** (§8.3). Zo niet, dan hangt de overgang bij een vormwissel met
   gelijke maat en moet er een timeout naast.
3. **Of `mask-image` op een scroll-container met een verborgen scrollbalk in
   Chromium 130 doet wat er staat** (§6). Unprefixed `mask-image` bestaat vanaf
   Chromium 120, maar ik heb het hier niet gedraaid, en de maskerbox is de
   padding-box en scrollt dus niet mee — daarom staat de klassenwissel erin.
4. **Of `backdrop-filter` in de commandobalk het venstermateriaal achter het
   venster meepakt** (§11 van `ui-systeem.md`). Zo niet, dan valt `--card` op .72
   vlakker uit dan het hier lijkt, en moet de scrim iets zwaarder om het paneel
   toch los te laten komen.

Twee dingen zijn wél geverifieerd, en beide in
`node_modules/electron/electron.d.ts`: `View` kent alleen `addChildView`,
`getBounds`, `removeChildView`, `setBackgroundColor`, `setBorderRadius`,
`setBounds`, `setVisible` en `children` (regel 14208-14277) — geen animatie en
geen `setIgnoreMouseEvents`, dat staat alleen op `BaseWindow` (3068) en
`BrowserWindow` (5681) — en `addChildView` herordent een view die al kind is
(14226-14229), zodat de `removeChildView` in `raiseIsland()` overbodig is.
