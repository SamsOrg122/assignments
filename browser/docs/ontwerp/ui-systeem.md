# Ontwerpsysteem

Tougather ziet eruit zoals hij eruitziet omdat het venster doorschijnend is. Op
Windows staat er `backgroundMaterial: 'acrylic'` onder, op macOS `vibrancy:
'sidebar'`, en dat betekent dat de achtergrond van deze app letterlijk je
bureaublad is. Een dichte kleur zou dat materiaal doodslaan, dus is elk vlak in
de zijbalk een halftransparante laag: een vulling, een glans die van boven
wegvalt, een haarlijn op de bovenrand en een zachte schaduw. Daarbovenop staat
één ding dat juist nooit doorschijnend is — het plafond met het eiland eruit —
omdat daar een pagina onder ligt die je niet wilt zien doorschemeren. De rest
volgt uit die twee keuzes: kleine radii op bedieningselementen en grote op
zwevende panelen, optische lettergroottes zodat kleine tekst niet dichtslibt en
grote tekst niet uit elkaar valt, en heel weinig beweging, want een browser die
beweegt terwijl jij leest is een browser die in de weg staat.

Dit document legt vast wat er al impliciet gekozen is in `renderer/style.css`,
`renderer/island.css`, `renderer/newtab.css` en `renderer/glyph.js`, en vult aan
wat er ontbreekt zodra er panelen, instellingen, downloads of een echt
assistentenlogboek bij komen.

---

## 1. Drie lagen, drie stylesheets

De app tekent op drie plekken die elkaar niet kunnen zien. Dat is geen detail:
het bepaalt waar een component mag staan en wat hij mag doen.

| Laag | Waar | Achtergrond | Stylesheet |
| --- | --- | --- | --- |
| Zijbalkrenderer | het hele venster, breedte 264px in gebruik | transparant, het venstermateriaal komt eronderdoor | `style.css` |
| Eiland | eigen `WebContentsView`, precies zo groot als de pil | transparant, alleen de pil is dicht | `island.css` |
| Pagina's van ons | sandboxed tabblad (`newtab.html`, later `fout.html`) | ondoorzichtig, geen venstermateriaal | `newtab.css` |

Drie gevolgen die telkens terugkomen:

- **Een pagina tekent altijd over de zijbalk heen.** Een `WebContentsView` is een
  native laag. Elke overlay in de zijbalkrenderer die buiten de 264px uitsteekt
  is onzichtbaar, tenzij het hoofdproces de pagina wegneemt. Dat is precies wat
  `setPaletteOpen()` doet, en het is de enige manier.
- **Het eiland heeft geen ruimte buiten zichzelf.** `island.js` meet zijn eigen
  kaart op en stuurt de maat via `island:size`. Alles wat uit die kaart steekt —
  een tooltip, een uitklaplijst, een schaduw — wordt geknipt door de rand van de
  view. Wat daar groeit, moet `meet()` aanroepen.
- **Niets kan van de ene laag naar de andere bewegen.** Drie compositors. Een
  element dat uit de zijbalk het eiland in vliegt bestaat niet; probeer het niet
  na te bootsen met twee animaties die toevallig aansluiten.

**Regel voor tokens.** Een token dat in twee van de drie stylesheets voorkomt,
hoort in `renderer/tokens.css` (nieuw, zie §10). Nu staan de drie lettertype-
stacks driemaal woordelijk uitgeschreven en `--plafond` tweemaal. Dat is de
eerste plek waar dit systeem uit elkaar loopt.

---

## 2. Kleurtokens

### 2.1 Wat er al staat

`style.css` definieert een rollenpalet, geen kleurenpalet. De namen zeggen
waarvóór een kleur is, niet wat hij is. Dat blijft zo.

| Token | Licht | Donker | Waarvoor |
| --- | --- | --- | --- |
| `--text` | `rgba(0,0,0,.86)` | `rgba(255,255,255,.92)` | alle tekst die je moet lezen |
| `--muted` | `rgba(0,0,0,.46)` | `rgba(255,255,255,.5)` | tekst in rust, labels, inactieve iconen |
| `--faint` | `rgba(0,0,0,.3)` | `rgba(255,255,255,.32)` | plaatshouders, toetsaanduidingen, decoratie |
| `--fill` | `rgba(255,255,255,.42)` | `rgba(255,255,255,.06)` | rustend vlak, hover |
| `--fill-hover` | `.62` | `.1` | hover op een vlak dat al gevuld is |
| `--fill-active` | `.82` | `.14` | het verheven glasplaatje |
| `--stroke` | `rgba(0,0,0,.07)` | `rgba(255,255,255,.09)` | haarrand en scheidingslijn |
| `--accent` | `#007aff` | `#0a84ff` | selectie, focus, primaire actie |
| `--danger` | `#ff3b30` | `#ff453a` | vernietigend, als vlak of stip |
| `--card` | `rgba(255,255,255,.7)` | `rgba(30,31,34,.72)` | zwevend paneel |
| `--scrim` | `rgba(255,255,255,.28)` | `rgba(0,0,0,.28)` | het waas onder een modale laag |
| `--glass-sheen` | `rgba(255,255,255,.55)` | `rgba(255,255,255,.1)` | de glans bovenaan een vlak |
| `--glass-line` | `rgba(255,255,255,.85)` | `rgba(255,255,255,.13)` | de haarlijn op de bovenrand |
| `--plafond` | `#17181b` | idem | de strook bovenin en het eiland, altijd donker |
| `--assistent` | `#ff9f0a` | idem | dat een assistent aan het werk is |
| `--ws-0…5` | zes tinten | idem, iets lichter | de kleur van een workspace |

Let op de asymmetrie in de vullingen: in het lichte thema zijn het witte lagen
op een donkerder materiaal, in het donkere thema witte lagen op een donker
materiaal. Beide bouwen dus op met wit. Dat is geen slordigheid maar wat
acrylic doet — een vlak wordt lichter naarmate het dichter bij je staat.

`island.css` heeft een eigen, Nederlandstalig setje (`--tekst`, `--zacht`,
`--gevaar-vlak`, `--gevaar-tekst`, `--ga-vlak`, `--glans`) omdat het eiland één
vaste, donkere omgeving is die niet met het thema meebeweegt. De splitsing
`--gevaar-vlak` / `--gevaar-tekst` is daar de goede vondst: een vlakkleur en een
tekstkleur van hetzelfde begrip zijn niet dezelfde kleur.

### 2.2 Wat erbij moet

Aan te vullen in `:root` van `tokens.css`, met de donkere waarden in het
bijbehorende media-blok. Namen sluiten aan bij wat er staat: Engels voor
generieke rollen, Nederlands waar het ding in dit project een eigen naam heeft
(`--plafond`, `--assistent`).

```css
:root {
  /* Statuskleuren. Bewust in twee smaken: een verzadigde voor stippen, randen
     en pictogrammen, en een donkerdere voor tekst. Op een doorschijnende
     ondergrond haalt de verzadigde variant het contrast voor tekst niet. */
  --ok: #34c759;
  --ok-text: #1c7c37;
  --warn: #ff9500;
  --warn-text: #9a5000;
  --danger-text: #c0261c;

  /* Tekst op een gevuld accentvlak. Staat apart, want dit is niet --text: op
     accentblauw hoort in beide thema's wit. */
  --on-accent: #ffffff;
  --duim: #ffffff;

  /* Een rand die twee vlakken van gelijke helderheid moet scheiden, zoals een
     uitklaplijst boven een kaart. --stroke is daarvoor te zacht. */
  --stroke-strong: rgba(0, 0, 0, 0.14);

  /* Ingedrukt: het glasplaatje zakt in plaats van dat het oplicht. */
  --shadow-press: inset 0 1px 2px rgba(0, 0, 0, 0.1);
  --shadow-popover: 0 8px 28px rgba(0, 0, 0, 0.12), 0 1px 3px rgba(0, 0, 0, 0.07);
  --duim-schaduw: 0 1px 2px rgba(0, 0, 0, 0.25);

  /* Skelet en zijn glans. Zelfde idee als de glans over de regel in het eiland,
     maar zwakker: dit is een plaatshouder, geen mededeling. */
  --skelet: rgba(0, 0, 0, 0.07);
  --skelet-glans: rgba(255, 255, 255, 0.5);

  /* De halo om een veld met focus. Stond in style.css op 11% en in newtab.css
     op 15%; dit is het compromis, op één plek. */
  --ring: 0 0 0 3px color-mix(in srgb, var(--accent) 14%, transparent);
}

@media (prefers-color-scheme: dark) {
  :root {
    --ok: #30d158;
    --ok-text: #4ee07a;
    --warn: #ff9f0a;
    --warn-text: #ffb43f;
    --danger-text: #ff6961;

    --stroke-strong: rgba(255, 255, 255, 0.16);
    --shadow-press: inset 0 1px 2px rgba(0, 0, 0, 0.3);
    --shadow-popover: 0 10px 34px rgba(0, 0, 0, 0.45), 0 1px 4px rgba(0, 0, 0, 0.3);
    --duim-schaduw: 0 1px 2px rgba(0, 0, 0, 0.5);

    --skelet: rgba(255, 255, 255, 0.07);
    --skelet-glans: rgba(255, 255, 255, 0.12);
  }
}
```

`--on-accent` en `--duim` staan bewust ook in het donkere blok niet opnieuw: ze
zijn in beide thema's wit.

### 2.3 Regels

- **Elk token dat in het donkere blok staat, staat óók in `:root`.** Anders
  breekt een latere handmatige themakeuze (`html[data-thema="donker"]`), die niet
  via `prefers-color-scheme` loopt.
- **Kleur is nooit de enige drager.** Een workspace heeft een stip én een naam,
  een assistent een kleur én een regel tekst. Ook omdat het contrast tegen een
  onbekende bureaubladachtergrond niet te garanderen valt.
- **`--faint` is decoratief.** Alles wat je echt moet kunnen lezen zit op
  `--muted` of hoger.
- **Geen losse hexwaarden buiten `:root`.** Ook niet in `main.js`; zie §10 voor
  hoe het hoofdproces aan de twee kleuren komt die het nodig heeft.
- **`color-mix(in srgb, X n%, transparent)`** is de manier om een token te
  verdunnen. Staat al in `style.css` en werkt in Chromium 130 (Electron 33).

---

## 3. Typografie

### 3.1 De optische maten

Apple levert SF Pro in drie optische snedes; Windows 11 doet hetzelfde met Segoe
UI Variable. Kleine tekst krijgt een snede met open vormen en ruimere spatiëring
zodat hij niet dichtslibt, grote tekst een snede met strakke spatiëring zodat hij
niet uit elkaar valt. `style.css` vraagt daarom per maat een andere familie aan
in plaats van overal dezelfde:

```css
--font-small:   -apple-system, BlinkMacSystemFont, "SF Pro Text",
                "Segoe UI Variable Small", "Segoe UI", system-ui, sans-serif;
--font-text:    …, "SF Pro Text",    "Segoe UI Variable Text",    …;
--font-display: …, "SF Pro Display", "Segoe UI Variable Display", …;
```

**Grens:** Small tot en met 12px, Text van 13 tot en met 16px, Display vanaf
17px. Nooit Display op 12px en nooit Small op 20px — dan werkt het tegen je.

**Onzeker, en belangrijk:** de drie familienamen bestaan alleen op Windows 11.
Op Windows 10 en op Linux valt alles terug op Segoe UI respectievelijk de
systeemfont, en verdwijnt het onderscheid. Het ontwerp mag daar dus niet op
leunen: geen regel die alleen klopt als Display er is. Ik weet ook niet zeker of
`font-optical-sizing: auto` iets doet bij deze drie *benoemde* families (bij een
echte variabele font met `opsz`-as wel); ga ervan uit van niet, en kies de
familie zelf. Zet gewicht altijd met `font-weight`, niet met een familienaam als
"Segoe UI Variable Display Semibold" — springt het gewicht zichtbaar, dan is de
familie er niet.

### 3.2 De schaal

Alles hieronder komt uit wat er al staat; er is niets bij verzonnen behalve de
twee koptekstmaten die nog niet voorkwamen.

| Rol | Familie | Grootte / regel | Gewicht | Tracking | Waar het nu staat |
| --- | --- | --- | --- | --- | --- |
| `micro` | small | 10px / 1.2 | 500 | `+0.01em` | `#new-tab kbd` |
| `caption` | small | 11px / 1.3 | 400 | `0` | `.result .kind`, `#vorige` |
| `meta` | small | 12px / 1.4 | 400 | `-0.002em` | `#hint`, knoppen in het eiland |
| `body` | text | 13px / 1.45 | 400 | `-0.006em` | de hele zijbalk |
| `body-groot` | text | 14px / 1.5 | 400 | `-0.01em` | `newtab`, `#huidig` |
| `lead` | text | 15px / 1.4 | 400 | `-0.012em` | `#palette-input`, `#zoek` |
| `titel-s` | display | 17px / 1.3 | 600 | `-0.016em` | nieuw (paneelkoppen) |
| `titel-m` | display | 20px / 1.25 | 600 | `-0.02em` | nieuw (foutpagina) |
| `titel-l` | display | 29px / 1.15 | 600 | `-0.026em` | `#groet` |

De tracking loopt mee met de grootte: klein blijft neutraal, groot trekt aan.
Dat is dezelfde curve die de optische snedes zelf al toepassen; wij helpen alleen
mee.

**Gewichten:** 400 voor lopende tekst, 500 voor labels en toetsen, 600 voor
koppen. Geen 700 — Segoe UI Variable Display op 700 is een ander soort app.

**Cijfers die in een kolom staan** (tabbladtellers, downloadgroottes, tijden)
krijgen `font-variant-numeric: tabular-nums`, anders dansen ze bij elke update.

`-webkit-font-smoothing: antialiased` staat op alle drie de `body`-regels. Dat
doet alleen iets op macOS; op Windows is het genegeerd. Laten staan, niet
uitbreiden.

---

## 4. Radii en maten

### 4.1 De ladder

```css
--radius-icon:    6px;   /* sluitkruisje in een rij */
--radius-control: 8px;   /* icoonknop van 28–30px */
--radius-pill:    9px;   /* workspacechip, resultaatrij */
--radius-tab:    10px;   /* bestaat */
--radius-field:  11px;   /* bestaat */
--radius-content:12px;   /* spiegelt CONTENT_RADIUS in main.js */
--radius-panel:  14px;   /* uitklaplijst, veld op de nieuw-tabblad-pagina */
--radius-island: 17px;   /* --hoek in island.css */
--radius-card:   18px;   /* bestaat */
```

**Concentrische regel:** binnenradius = buitenradius − afstand tot de rand. Een
kaart van 18px met 6px padding krijgt rijen van 12px; een segmentbalk van 11px
met 2px padding krijgt segmenten van 9px. Waar dat nu niet klopt (`.result` heeft
9px binnen een kaart van 18px met 6px padding) blijft het staan tot iemand die
regel toch aanraakt — het is geen bug, alleen niet de regel.

De hoek van de pagina (`CONTENT_RADIUS = 12`, via `view.setBorderRadius()`) en
`--radius-content` moeten hetzelfde getal zijn: de zijbalk tekent langs die hoek.

### 4.2 Hoogtes en raster

Alles op een raster van 4px, met 2px als halve stap voor spleten tussen
elementen. Canonieke hoogtes, allemaal al in gebruik:

| Hoogte | Waarvoor |
| --- | --- |
| 17 / 20px | sluitkruisje in een chip / in een tabblad |
| 24px | `.knop--klein` |
| 28px | workspacechip, compacte knop |
| 30px | icoonknop in de zijbalk |
| 33 / 34px | invoerveld, tabbladrij, `#new-tab` |
| 38px | resultaatrij in de commandobalk |
| 44px | `TOPBAR_HEIGHT`, het plafond |
| 50 / 54px | prominent veld (`newtab`, commandobalk) |

Zijbalkinsprong: 12px links en rechts, 8px tussen blokken, 2px tussen rijen in
een lijst. Verander dat niet per paneel.

---

## 5. Glas

Het recept dat nu op vier plekken los is uitgeschreven, in vier niveaus.

```css
:root {
  /* Bij een bedieningselement valt de glans na tweederde weg; bij een groot
     paneel eerder, anders wordt het een verlopend vlak in plaats van licht dat
     langs de bovenrand strijkt. */
  --glas-vlak:   linear-gradient(180deg, var(--glass-sheen), transparent 65%);
  --glas-paneel: linear-gradient(180deg, var(--glass-sheen), transparent 40%);
  --glas-lijn:   inset 0 1px 0 var(--glass-line);
  /* Op een verzadigd vlak is de witte haarlijn te hard; daar een zwakkere. */
  --glas-lijn-kleur: inset 0 1px 0 rgba(255, 255, 255, 0.28);
}
```

**Niveau 0 — het materiaal.** Niets tekenen. `body { background: transparent }`.
Dit is de standaard: een vlak dat je niet nodig hebt, teken je niet.

**Niveau 1 — rustend vlak.** Alleen `background-color: var(--fill)`. Geen glans,
geen lijn, geen schaduw. Voor hovervlakken, faviconplaatshouders, de
segmentbalk. Een hovervlak dat glanst suggereert dat het ergens op ligt, en dat
is niet zo.

**Niveau 2 — verheven plaatje.** Het actieve tabblad, de actieve workspace, een
veld met focus.

```css
.glas-verheven {
  background-color: var(--fill-active);
  background-image: var(--glas-vlak);
  box-shadow: var(--glas-lijn), var(--shadow-tab);
}
```

**Niveau 3 — zwevend paneel.** De commandobalk, straks popovers en menu's.

```css
.glas-paneel {
  background-color: var(--card);
  background-image: var(--glas-paneel);
  backdrop-filter: blur(34px) saturate(180%);
  border: 1px solid var(--stroke);
  border-radius: var(--radius-card);
  box-shadow: var(--glas-lijn), var(--shadow-card);
}
```

**Niveau 4 — het plafond.** `background: var(--plafond)`, dicht, geen glans,
geen schaduw. Het plafond en het eiland zijn hetzelfde materiaal; dat de holle
hoekjes in `island.css` werken hangt erop dat `#drag-strip` exact dezelfde kleur
heeft. Verander `--plafond` dus nooit op één van de twee plekken.

Waarom de haarlijn alleen bovenaan zit: licht komt van boven. Een lijn rondom
leest als een omlijning en dan is het geen glas meer maar een kaartje met een
randje.

**Waar `backdrop-filter` wél en niet werkt.** Hij vervaagt alleen wat er in
dezelfde renderer al getekend is. Een paneel in de zijbalk vervaagt dus de
zijbalk eronder, en zeker niet de pagina — die is een native laag. Of hij het
acrylic *achter* het venster meepakt weet ik niet; ik ga ervan uit van niet.
Test dat voordat je er een ontwerp op bouwt, want het scheelt of `--card`
op 0.7 alfa mooi of vlak uitvalt.

---

## 6. Beweging

### 6.1 Duur en curve

```css
:root {
  --duur-tik:  120ms;  /* dekking van iets kleins dat onder de muis verschijnt */
  --duur-vlak: 140ms;  /* achtergrond, kleur, rand van een bedieningselement */
  --duur-paneel: 160ms;/* een paneel dat komt of gaat */
  --duur-schuif: 240ms;/* informatie die van plek wisselt */

  --ease-vlak:    ease;                            /* kleur en dekking */
  --ease-entree:  cubic-bezier(0.2, 0.8, 0.2, 1);  /* komt binnen, remt af */
  --ease-vertrek: cubic-bezier(0.4, 0, 1, 1);      /* gaat weg, geen naijlen */
  --ease-rond:    linear;                          /* wat blijft rondlopen */
}
```

Alle vier de duren staan al in de code (120 bij het sluitkruisje, 140 overal bij
hover, 160 bij `omhoog`, 240 bij `#vorige`). De entree-curve ook. Nieuw is
alleen dat ze een naam krijgen.

### 6.2 Wanneer wel

- **Als je iets aanwijst of aanzet**, zodat de verandering niet knippert:
  achtergrond, kleur, rand, schaduw. 140ms.
- **Als er iets binnenkomt** dat er net nog niet was: paneel, melding, lijst.
  160ms, hoogstens 6–8px verplaatsing, `--ease-entree`.
- **Als informatie van plek wisselt** en je het verband moet zien, zoals de
  vorige regel in het eiland die naar boven zakt. 240ms.
- **Zolang er echt iets gebeurt**: de glans over de regel in het eiland (2.4s
  lineair), het kloppende stipje (1.5s), de glyph. Deze stoppen zodra het werk
  stopt. Een doorlopende animatie op een stilstaande toestand is onrust.

### 6.3 Wanneer niet

- **Nooit op layout.** `width`, `height`, `top`, `left`, `margin`, `padding` en
  `gap` blijven onaangeroerd. De zijbalk is één flexkolom en één geanimeerde
  hoogte laat de hele lijst schokken. In het eiland is het erger: dat meet
  zichzelf op en stuurt bij elke tussenstand een `island:size` naar het
  hoofdproces, dus een geanimeerde maat wordt zestig IPC-aanroepen per seconde.
  Het eiland verandert van maat in één stap.
- **Nooit bij het wisselen van tabblad of workspace.** Dat is een native
  `setVisible()`; er is niets om aan te haken en een fade in de zijbalk zou uit
  de pas lopen met de pagina.
- **Nooit langer dan 240ms** voor iets dat op een klik volgt.
- **Nooit een animatie in een lijst die opnieuw getekend wordt**, tenzij je de
  fase meegeeft — zie hieronder.

### 6.4 Animaties in hertekende lijsten

`pushState()` stuurt de hele lijst en `app.js` doet `replaceChildren()`. Elk
element is dus telkens nieuw en begint vooraan in zijn cyclus. Het kloppende
stipje van een bezige assistent springt daardoor bij elke statusupdate terug naar
frame 0. Oplossing: geef de fase mee vanuit een klok die de hertekening
overleeft.

```js
// pushState tekent de lijst opnieuw, dus dit stipje is elke keer een nieuw
// element. Zonder een negatieve vertraging begint het klopje telkens overnieuw.
stip.style.setProperty('--fase', `${-(performance.now() % 1500)}ms`);
```

```css
.tab .bezig {
  animation: kloppen 1.5s ease-in-out infinite;
  animation-delay: var(--fase, 0ms);
}
```

Let op: `index.html` heeft `style-src 'self'`, dus een `style="…"`-attribuut
wordt geblokkeerd. `el.style.setProperty()` gaat via de CSSOM en valt daar voor
zover ik weet buiten; dat is ook waarom `app.js` de workspacekleuren via klassen
`c0…c5` doet. Controleer het in de console voordat je erop bouwt.

Hetzelfde geldt voor `maakGlyph()`: elke hertekening start een nieuwe
`requestAnimationFrame`-lus, die zichzelf pas na drie frames opruimt als het
canvas losgekoppeld is. Bij één assistent is dat niets, bij tien tabbladen met
een assistent en een drukke `pushState` lopen er kortstondig tientallen lussen.

### 6.5 prefers-reduced-motion

`style.css` zet alles uit met één blok, en dat blijft:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation: none !important; transition: none !important; }
}
```

Twee dingen die dat blok niet regelt:

**1. Beweging die de enige drager van betekenis is.** Als de animatie wegvalt,
moet de rusttoestand hetzelfde vertellen. `island.css` doet dat al goed: de
glans over de regel wordt teruggezet naar gewone tekst in plaats van naar
transparante tekst zonder verloop. Doe dat overal expliciet, ook waar het
toevallig al goed valt:

```css
@media (prefers-reduced-motion: reduce) {
  /* Zonder de keyframes zou dit stipje op zijn basiswaarde blijven staan; die
     zetten we hier hard, zodat 'bezig' ook stil zichtbaar blijft. */
  .tab .bezig { opacity: 1; transform: none; }
  .skelet { background-image: none; }
}
```

**2. `glyph.js` trekt zich er niets van aan.** Dat is een canvas met een eigen
rAF-lus; CSS raakt hem niet. De glyph is precies zo'n geval waarin beweging
betekenis draagt, dus hij mag niet zomaar verdwijnen — hij moet stilvallen op een
herkenbaar beeld:

```js
// De glyph tekent in een canvas, dus het CSS-blok voor reduced motion raakt hem
// niet. Wie beweging heeft uitgezet krijgt één stilstaand beeld per stand: de
// kleur zegt het dan alleen.
const rustig = window.matchMedia('(prefers-reduced-motion: reduce)');
```

In `teken()`: als `rustig.matches`, teken één frame op een vaste `t` (bijvoorbeeld
`0.25`, waar de meeste standen een leesbaar patroon hebben) en vraag géén nieuw
frame aan; teken opnieuw op `rustig.addEventListener('change', …)` en in `zet()`.
`matchMedia` is een web-API, dus dit blijft geschikt voor het sandboxed tabblad
dat `glyph.js` deelt.

---

## 7. Componenten

Alles hieronder hoort in `renderer/ui.css` (nieuw), met het gedrag dat CSS niet
kan in `renderer/ui.js` (nieuw). Beide worden als gewoon `<script>` /
`<link>` geladen; geen bundler, geen framework.

### 7.1 Knoppen

Vier varianten, want er zijn precies vier soorten actie in deze app: aanwijzen,
doen, hoofdzakelijk doen, en weggooien.

```css
.knop {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  height: 30px;
  padding: 0 12px;
  border-radius: var(--radius-control);
  color: var(--muted);
  white-space: nowrap;
  transition: background-color var(--duur-vlak) var(--ease-vlak),
    color var(--duur-vlak) var(--ease-vlak),
    box-shadow var(--duur-vlak) var(--ease-vlak);
}

.knop:hover:not(:disabled) { background-color: var(--fill); color: var(--text); }
/* Ingedrukt zakt het plaatje in; oplichten zou hetzelfde zeggen als hover. */
.knop:active:not(:disabled) { box-shadow: var(--shadow-press); }
.knop:disabled { opacity: 0.32; }

.knop--icoon { width: 30px; padding: 0; }
.knop--klein { height: 24px; padding: 0 9px; font-family: var(--font-small); font-size: 12px; }
.knop--breed { width: 100%; }

.knop--zacht {
  background-color: var(--fill);
  background-image: var(--glas-vlak);
  box-shadow: var(--glas-lijn);
  color: var(--text);
}
.knop--zacht:hover:not(:disabled) { background-color: var(--fill-hover); }

.knop--sterk {
  background-color: var(--accent);
  box-shadow: var(--glas-lijn-kleur);
  color: var(--on-accent);
}
/* Op een verzadigd vlak werkt een kleurverandering niet; helderheid wel. */
.knop--sterk:hover:not(:disabled) { filter: brightness(1.08); }
.knop--sterk:active:not(:disabled) { filter: brightness(0.94); }

.knop--gevaar {
  background-color: color-mix(in srgb, var(--danger) 16%, transparent);
  color: var(--danger-text);
}
```

`#controls` in de zijbalk is precies `.knop.knop--icoon`, en de knoppen in het
eiland zijn `.knop--klein` in een sterke en een gevaarlijke variant. Het eiland
gebruikt `filter: brightness(1.25)` — dat mag daar, omdat het vlak donker en klein
is; op een verzadigde kleur is 1.08 het maximum voordat het verkleurt.

**Waar ze staan.** In een paneel rechtsonder, de primaire rechts, 8px ertussen.
In de zijbalk over de volle breedte (`.knop--breed`), want 240px is te smal voor
twee knoppen naast elkaar. Een gevaarlijke knop staat nooit naast een primaire
zonder tussenruimte van minstens 16px.

**Wat het niet oplost:** er is geen bevestigingsdialoog in deze app en die komt
er ook niet snel — Electron blokkeert `window.prompt` en een eigen modaal venster
vraagt om de pagina wegnemen. De bestaande oplossing (één klik bewapent, tweede
voert uit, na 2,5s vergeten) is het patroon voor vernietigende acties. Neem dat
over in plaats van een dialoog te verzinnen.

### 7.2 Invoervelden

`#address` is het model; dit generaliseert het.

```css
.veld {
  height: 33px;
  padding: 0 12px;
  border: 1px solid var(--stroke);
  border-radius: var(--radius-field);
  background-color: var(--fill);
  background-image: var(--glas-vlak);
  box-shadow: var(--glas-lijn);
  color: var(--text);
  caret-color: var(--accent);
  font: inherit;
  transition: background-color var(--duur-vlak) var(--ease-vlak),
    border-color var(--duur-vlak) var(--ease-vlak),
    box-shadow var(--duur-vlak) var(--ease-vlak);
}

.veld::placeholder { color: var(--faint); }
.veld:hover { background-color: var(--fill-hover); }

/* Geen outline maar rand plus halo: op glas zweeft een outline náást het veld
   in plaats van eromheen. Buiten velden blijft :focus-visible wel een outline. */
.veld:focus {
  outline: none;
  background-color: var(--fill-active);
  border-color: color-mix(in srgb, var(--accent) 42%, transparent);
  box-shadow: var(--glas-lijn), var(--ring);
}

.veld[aria-invalid="true"] { border-color: color-mix(in srgb, var(--danger) 55%, transparent); }
.veld[aria-invalid="true"]:focus { box-shadow: var(--glas-lijn), 0 0 0 3px color-mix(in srgb, var(--danger) 14%, transparent); }

.veld--klein { height: 28px; padding: 0 10px; }
.veld--groot { height: 40px; padding: 0 14px; font-size: 15px; }

textarea.veld { height: auto; min-height: 66px; padding: 8px 12px; resize: none; line-height: 1.45; }
```

Label erboven in `caption` op `--muted`, 6px eronder. Hint of fout eronder in
`meta`, gekoppeld met `aria-describedby`. Een fout verschijnt bij `blur` of bij
verzenden, nooit tijdens het typen.

**Let op in het eiland:** een veld dat meegroeit verandert de maat van de kaart,
en dus van de hele `WebContentsView`. `meet()` moet dan mee, maar niet per
toetsaanslag — verpak hem in één `requestAnimationFrame`:

```js
// island:size per toetsaanslag is zonde; één keer per frame is genoeg.
let gepland = false;
function meetStraks() {
  if (gepland) return;
  gepland = true;
  requestAnimationFrame(() => { gepland = false; meet(); });
}
```

### 7.3 Keuzelijsten

Twee vormen, en de keuze ertussen is een kwestie van aantal.

**Tot drie korte opties: een segmentbalk** (§7.5). Alles zichtbaar, geen popup,
geen laagprobleem.

**Meer dan drie: een uitklaplijst.** Geen native `<select>`. Twee redenen: de
popup is niet vorm te geven, en ik weet niet zeker of hij boven een
`WebContentsView` uitkomt — een `<select>`-popup is bij Chromium een eigen
native venster en zou er dus wel eens wél overheen kunnen tekenen, wat een
inconsistent beeld geeft met onze eigen panelen. Bouw hem als knop plus lijst:

```html
<button class="knop knop--zacht" aria-haspopup="listbox" aria-expanded="false">…</button>
<ul class="lijst" role="listbox" hidden>…</ul>
```

```css
.lijst {
  position: absolute;
  z-index: 10;
  min-width: 180px;
  max-height: 240px;
  overflow-y: auto;
  margin: 4px 0 0;
  padding: 4px;
  list-style: none;
  border: 1px solid var(--stroke-strong);
  border-radius: var(--radius-panel);
  background-color: var(--card);
  background-image: var(--glas-paneel);
  backdrop-filter: blur(28px) saturate(180%);
  box-shadow: var(--glas-lijn), var(--shadow-popover);
}

.lijst li {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 30px;
  padding: 0 10px;
  border-radius: var(--radius-pill); /* 14 buiten − 4 padding = 10; 9 leest hier beter */
  color: var(--muted);
}

.lijst li[aria-selected="true"] { background-color: var(--fill-hover); color: var(--text); }
.lijst li[data-gekozen="true"]::after { content: "✓"; margin-left: auto; color: var(--accent); }
```

**De harde beperking:** een lijst die buiten de 264px van de zijbalk uitsteekt is
onzichtbaar, want de pagina tekent eroverheen. Dus óf de lijst past binnen de
zijbalk, óf de pagina moet weg — zie het kanaal `ui:overlay` in §10. Voor een
lijst in het eiland geldt hetzelfde met een extra: hij moet ook nog in de gemeten
kaart passen, dus `meet()` erbij.

Toetsenbord (in `ui.js`): Pijl omhoog/omlaag verplaatst de selectie, Home/End
naar de uiteinden, Enter kiest, Escape sluit en geeft de focus terug aan de knop,
letters typen springt naar de eerste optie die begint met wat je typt.

### 7.4 Schakelaars

Voor instellingen die meteen effect hebben. Een `<input type="checkbox">` met
`appearance: none` — dan houd je label, focus en toetsenbord gratis.

```css
.schakelaar {
  appearance: none;
  position: relative;
  flex: none;
  width: 34px;
  height: 20px;
  border-radius: 10px;
  /* Uit-stand mengt met de tekstkleur, zodat hij in beide thema's klopt zonder
     een tweede token. */
  background-color: color-mix(in srgb, var(--text) 14%, transparent);
  box-shadow: var(--glas-lijn);
  transition: background-color var(--duur-vlak) var(--ease-vlak);
}

.schakelaar::after {
  content: "";
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--duim);
  box-shadow: var(--duim-schaduw);
  transition: transform var(--duur-vlak) var(--ease-entree);
}

.schakelaar:checked { background-color: var(--accent); }
.schakelaar:checked::after { transform: translateX(14px); }
```

Het label staat links, de schakelaar rechts, uitgelijnd op de rechterkant van de
rij; de rij is 34px hoog. Onder `prefers-reduced-motion` springt de duim
zonder overgang — dat mag, want de kleur zegt het ook.

Voor een instelling die pas werkt na bevestigen gebruik je géén schakelaar maar
een selectievakje plus knop. Een schakelaar die niets doet tot je ergens anders
klikt is een leugen.

### 7.5 Tabs binnen een paneel

Een segmentbalk, geen onderstreepte tabs: die laatste hebben ruimte nodig die de
zijbalk niet heeft, en een paneel van 240px breed met drie onderstreepte tabs is
niet te lezen.

```css
.segment {
  display: inline-flex;
  gap: 2px;
  padding: 2px;
  border-radius: var(--radius-field);
  background-color: var(--fill);
}

.segment button {
  height: 26px;
  padding: 0 12px;
  /* Concentrisch: 11 buiten − 2 padding = 9 binnen. */
  border-radius: var(--radius-pill);
  color: var(--muted);
  font-family: var(--font-small);
  font-size: 12px;
  transition: background-color var(--duur-vlak) var(--ease-vlak),
    color var(--duur-vlak) var(--ease-vlak);
}

.segment button[aria-selected="true"] {
  background-color: var(--fill-active);
  background-image: var(--glas-vlak);
  box-shadow: var(--glas-lijn), var(--shadow-tab);
  color: var(--text);
}
```

`role="tablist"` op de balk, `role="tab"` met `aria-selected` op de knoppen,
`role="tabpanel"` met `[hidden]` op de inhoud. Rollende `tabindex`: alleen de
gekozen knop is `0`, de rest `-1`, en Pijl links/rechts verplaatst.

**Geen schuivende indicator.** Die kost een extra element, moet opnieuw gemeten
worden bij elke hertekening, en levert bij drie knoppen van 80px niets op.

### 7.6 Tooltips

Standaard blijft `title="…"`, zoals nu in `index.html` en `app.js`. Gratis,
systeemeigen, wacht uit zichzelf, en hij kan niet geknipt worden door een
`overflow: hidden`.

Een eigen tooltip alleen waar `title` niet kan: naast een pictogram zonder
begeleidende tekst dat je vaak nodig hebt, of in een rij waar de vertraging van
het systeem te lang aanvoelt.

```css
[data-tip] { position: relative; }

[data-tip]::after {
  content: attr(data-tip);
  position: absolute;
  top: calc(100% + 6px);
  left: 50%;
  transform: translateX(-50%);
  z-index: 20;
  max-width: 200px;
  padding: 4px 8px;
  border-radius: 7px;
  /* Het plafondmateriaal, in beide thema's. Zo is een tooltip herkenbaar niet
     onderdeel van het vlak waar hij boven hangt. */
  background: var(--plafond);
  color: var(--plafond-tekst);
  font-family: var(--font-small);
  font-size: 11px;
  white-space: nowrap;
  opacity: 0;
  pointer-events: none;
  transition: opacity var(--duur-tik) var(--ease-vlak) 400ms;
}

[data-tip]:hover::after,
[data-tip]:focus-visible::after { opacity: 1; }
```

(`--plafond-tekst` is nieuw en gelijk aan `--tekst` uit `island.css`: `#f2f4f7`.)

**Drie plekken waar dit niet mag:**

- In `#tablist`. Die heeft `overflow-y: auto` en knipt een `::after` weg.
- In het eiland, tenzij de kaart meegroeit. De view is exact zo groot als de pil.
  Voor een native `title` in het eiland weet ik niet zeker of Chromium hem als
  los OS-venster tekent (en dus ontsnapt) of binnen de view; ga uit van geknipt
  en test het.
- Boven het paginagebied. Daar tekent de pagina overheen.

Altijd onder het element, nooit ernaast: in een zijbalk van 264px valt zijwaarts
te snel buiten beeld.

### 7.7 Lege toestanden

Waar ze komen: de commandobalk zonder treffers (nu verdwijnt de lijst gewoon via
`#palette-results:empty`), en straks geschiedenis, downloads en bladwijzers.

```css
.leeg {
  display: grid;
  place-items: center;
  gap: 6px;
  padding: 28px 20px;
  text-align: center;
  color: var(--muted);
}

.leeg .titel { font-size: 13px; color: var(--text); }
.leeg .uitleg { font-family: var(--font-small); font-size: 12px; max-width: 34ch; text-wrap: balance; }
```

Twee regels, meer niet: wat er komt te staan, en hoe het er komt. Geen
illustratie, geen groot pictogram, geen uitroepteken. Voorbeelden:

| Plek | Titel | Uitleg |
| --- | --- | --- |
| Commandobalk | Geen tabblad of workspace met die naam | Enter zoekt op het web. |
| Geschiedenis | Nog niets bezocht | Pagina's die je opent verschijnen hier. |
| Downloads | Geen downloads | Bestanden die je opslaat komen hier te staan. |
| Logboek assistent | Nog geen opdracht gegeven | Ctrl J opent de balk bovenin. |

`text-wrap: balance` werkt vanaf Chromium 114, dus in Electron 33 prima.

### 7.8 Foutmeldingen

Drie hoogtes, en de keuze is: hoeveel van de app is stuk?

**1. Veldfout.** Onder het veld, `meta` op `--danger-text`, het veld krijgt
`aria-invalid="true"` en `aria-describedby`. Verschijnt bij `blur`, verdwijnt bij
de eerste correctie. Zegt wat er moet gebeuren, niet wat er fout is: "Voer een
adres of zoekopdracht in", niet "Ongeldige invoer".

**2. Strookmelding in de zijbalk.** Voor iets dat gebeurd is buiten je blikveld:
een download klaar, een assistent gestopt, een workspace niet te sluiten.

```css
.melding {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 9px 10px;
  border-radius: var(--radius-tab);
  background-color: var(--fill);
  box-shadow: var(--glas-lijn);
  font-family: var(--font-small);
  font-size: 12px;
  color: var(--text);
  animation: omhoog var(--duur-paneel) var(--ease-entree);
}

/* Een gekleurd streepje links in plaats van een gekleurd vlak: op glas wordt
   een gevuld vlak troebel, een streepje blijft scherp. */
.melding::before { content: ""; flex: none; width: 3px; align-self: stretch; border-radius: 2px; background: var(--melding-kleur, var(--accent)); }
.melding--fout { --melding-kleur: var(--danger); }
.melding--waarschuwing { --melding-kleur: var(--warn); }
.melding--gelukt { --melding-kleur: var(--ok); }
```

Hij staat onder `#tablist` en boven `#workspaces`, hoogstens twee regels, met een
sluitkruisje. Een gelukt-melding verdwijnt na 4s vanzelf; een fout blijft staan
tot je hem wegklikt.

**3. Paginafout.** Een pagina die niet laadt is nu een leeg tabblad met een
Chromium-foutscherm. Nieuwe pagina `renderer/fout.html` + `renderer/fout.css`,
opgezet als `newtab` (ondoorzichtig, `titel-m`, een `.knop--zacht` "Opnieuw
proberen", de foutcode klein in `caption` onderaan). In `main.js`, in de lus die
nu al events aan `pushState()` hangt:

```js
wc.on('did-fail-load', (_e, code, beschrijving, url, isMainFrame) => {
  // -3 is ERR_ABORTED en gebeurt bij elke navigatie die je zelf onderbreekt.
  // Dat is geen fout om een pagina voor te tonen.
  if (!isMainFrame || code === -3) return;
  const q = new URLSearchParams({ code: String(code), beschrijving, url });
  wc.loadURL(`${FOUTPAGINA}?${q}`);
});
```

De handtekening van `did-fail-load` is `(event, errorCode, errorDescription,
validatedURL, isMainFrame, frameProcessId, frameRoutingId)`. De foutpagina is
sandboxed en heeft geen preload, dus "Opnieuw proberen" is `location.replace()`
met de URL uit de query — geen IPC nodig. Wat het niet oplost: de foutpagina
vervangt de geschiedenisingang, dus Terug gaat naar de pagina ervóór, niet naar
de mislukte poging.

### 7.9 Laadstaten

Vier soorten, van licht naar zwaar. Kies de lichtste die het uitlegt.

**1. Niets.** Onder ongeveer 200ms toon je geen laadstaat. Een spinner die
oplicht en meteen weer weg is, is erger dan even wachten.

**2. Het tabblad zelf.** De titel wordt `Laden…` en de titel verbleekt naar
`--faint` — dat staat er al. Aanvulling: zonder favicon een ademend vlak in
plaats van een leeg gat.

```css
.tab.loading .favicon { background: var(--skelet); animation: adem 1.4s ease-in-out infinite; }

@keyframes adem {
  0%, 100% { opacity: 0.5; }
  50% { opacity: 1; }
}
```

**3. Skelet voor panelen.** Als je weet welke vorm er komt, teken die vorm.
Hetzelfde glansrecept als in `island.css`, maar zwakker en sneller.

```css
.skelet {
  border-radius: 6px;
  background-color: var(--skelet);
  background-image: linear-gradient(100deg, transparent 35%, var(--skelet-glans) 50%, transparent 65%);
  background-size: 260% 100%;
  animation: skeletglans 1.6s var(--ease-rond) infinite;
}

@keyframes skeletglans {
  from { background-position: 160% 0; }
  to { background-position: -60% 0; }
}
```

Drie regels van 100%, 80% en 60% breed, in de hoogte van de echte tekst. Geen
grijze blokken die nergens op lijken.

**4. Voortgang met een getal.** Alleen als er een echt getal is — dus bij
downloads (`session.on('will-download')`, dan `item.getReceivedBytes()` en
`item.getTotalBytes()`). Een 3px balk onder de rij:

```css
.voortgang { height: 3px; border-radius: 2px; background: var(--fill); overflow: hidden; }
/* scaleX en niet width: breedte animeren is layout, en dat schokt de hele lijst. */
.voortgang i { display: block; height: 100%; transform-origin: left; transform: scaleX(var(--deel, 0)); background: var(--accent); transition: transform var(--duur-vlak) linear; }
```

Bij onbekende duur geen balk maar de glans — precies wat het eiland al doet met
`#huidig.bezig`. Dat is het model: de tekst zelf zegt dat er iets loopt, er komt
geen tweede element bij.

### 7.10 Iconen

- `viewBox="0 0 16 16"`, één `<path>` waar het kan, `aria-hidden="true"`.
- `fill: none`, `stroke: currentColor`, `stroke-width: 1.6`, ronde einden en
  hoeken. Staat al als globale `svg`-regel in `style.css`.
- Onder 12px opgetekend: `stroke-width: 1.8`, anders verdwijnt de lijn. Een
  sluitkruisje van 9px met streek 1.6 in een viewBox van 16 tekent 0,9 pixel.
- Optische maat: het icoon is 50–55% van de knop. 16 in 30, 14 in 28, 11 in 20.
- Geen icoonfont en geen sprite; `icoon(d)` in `app.js` is de fabriek. Nieuwe
  paden komen daar bij of in `ui.js`.

---

## 8. Focus, toetsenbord en contrast

**Focus.** `:focus-visible` met `outline: 2px solid var(--accent); outline-offset:
2px` blijft de standaard buiten velden; velden krijgen rand plus halo (§7.2).
Nooit `outline: none` zonder vervanging.

**Focusval in de commandobalk.** `#palette-card` is een `role="dialog"` met
`aria-modal="true"`, maar Tab kan er nu uit naar de zijbalk eronder. Zet de
zijbalk uit zolang hij open staat:

```js
// De commandobalk is modaal, maar de zijbalk staat er nog gewoon achter en is
// dus met Tab bereikbaar. inert haalt hem uit de toetsenbordvolgorde.
sidebar.inert = paletteIsOpen();
```

**Contrast is niet te garanderen.** De achtergrond is je bureaublad. Daarom:
`--faint` alleen decoratief, `--muted` als ondergrens voor tekst die ertoe doet,
en nooit informatie die alleen in kleur zit. Voor wie meer nodig heeft:

```css
@media (prefers-contrast: more) {
  :root {
    --muted: rgba(0, 0, 0, 0.62);
    --faint: rgba(0, 0, 0, 0.46);
    --stroke: rgba(0, 0, 0, 0.16);
    --fill: rgba(255, 255, 255, 0.7);
  }
}
```

(met een spiegelblok onder `prefers-color-scheme: dark`.)

**Geforceerde kleuren** (Windows-contrastthema's) gooien het hele glasidee weg.
Dan moeten randen het werk doen:

```css
@media (forced-colors: active) {
  .glas-verheven,
  .glas-paneel,
  .knop--zacht { border: 1px solid CanvasText; background-image: none; box-shadow: none; }
  .tab[aria-current="true"] { border: 1px solid Highlight; }
}
```

**Sneltoetsen** staan in `app.js` en horen zichtbaar te zijn waar de actie zit,
zoals `#new-tab kbd` dat doet: `micro` op `--faint` met een randje van `--stroke`.
Schrijf ze als `Ctrl T`, zonder plusteken — dat staat er al zo.

---

## 9. Wat waar hoort: een beslisboom

- Staat het in de zijbalk en past het binnen 264px? → gewone HTML in de
  zijbalkrenderer, niveau 1 of 2 glas.
- Steekt het buiten de zijbalk uit? → de pagina moet weg via `ui:overlay`,
  niveau 3 glas, en het is dan modaal — er kan er maar één tegelijk staan.
- Hoort het bij wat de assistent nú doet? → het eiland, en dan zo klein
  mogelijk, met `meet()` erachteraan.
- Is het een pagina op zich (nieuw tabblad, fout, straks instellingen)? → een
  eigen sandboxed HTML-bestand in `renderer/`, ondoorzichtig, `newtab.css` als
  voorbeeld.

---

## 10. Nieuwe bestanden, IPC en main.js

### Nieuwe bestanden

| Bestand | Wat erin zit |
| --- | --- |
| `renderer/tokens.css` | alle tokens uit §2–6. Als eerste stylesheet geladen door `index.html`, `island.html`, `newtab.html` en `fout.html`. `style.css`, `island.css` en `newtab.css` houden alleen wat echt van hen is. |
| `renderer/ui.css` | de componentklassen uit §7. Geladen door `index.html` en de pagina's die ze nodig hebben. |
| `renderer/ui.js` | het gedrag dat CSS niet kan: uitklaplijst, segmenttabs met pijltoetsen, meldingen, de fase-truc. Geen Node, voorwaardelijke export zoals `search.js`, geladen met een gewoon `<script>`. |
| `renderer/tokens.js` | de handvol maten en twee kleuren die het hoofdproces nodig heeft. |
| `renderer/fout.html` + `fout.css` | de foutpagina uit §7.8. |

**Waarom `tokens.js` apart bestaat.** In `main.js` staan nu `#00000000`,
`#e8ebef` en de maten `SIDEBAR_WIDTH`, `TOPBAR_HEIGHT`, `CONTENT_GAP`,
`CONTENT_RADIUS` los in de code, terwijl CLAUDE.md zegt dat kleuren als
CSS-variabelen horen te staan en niet in `main.js`. CSS kan geen JS lezen zonder
build-stap, en een build-stap is er niet. Dus: `tokens.js` volgt exact het
patroon van `search.js` — geen Node, `module.exports` onderaan achter een
`typeof`-controle — en draagt bovenaan een commentaar dat naar `tokens.css`
wijst, en andersom.

```js
// Deze getallen en de twee kleuren staan óók in renderer/tokens.css. CSS kan JS
// niet lezen zonder build-stap, en die is er bewust niet; dus zijn dit twee
// bronnen die je samen bijwerkt. De maten hier zijn de waarheid voor de layout,
// tokens.css is de waarheid voor wat je ziet.
const MATEN = { ZIJBALK: 264, PLAFOND: 44, MARGE: 10, HOEK: 12 };
const KLEUREN = { PLAFOND: '#17181b', PLAFOND_SYMBOOL: '#e8ebef', DOORZICHTIG: '#00000000' };
```

Overwogen en niet gedaan: de zijbalk zijn berekende kleuren laten melden via een
kanaal, zodat er één bron is. Dan wordt de titelbalkoverlay pas goed gezet ná de
eerste render, en bij een themawissel zie je hem omslaan. Twee bronnen met een
commentaar is hier het kleinere kwaad.

### IPC-kanalen

| Kanaal | Richting | Payload | Waarvoor |
| --- | --- | --- | --- |
| `ui:overlay` | renderer → main, `invoke` | `boolean` | de pagina wegnemen zolang er een overlay openstaat die buiten de zijbalk valt. Generaliseert `ui:palette`. |
| `ui:melding` | main → zijbalk, `send` | `{ soort, tekst, actie? }` | een strookmelding tonen voor iets dat in het hoofdproces gebeurde (download klaar, assistent gestopt). |
| `ui:thema` | renderer → main, `invoke` | `'systeem' \| 'licht' \| 'donker'` | later, als er instellingen zijn: zet `nativeTheme.themeSource`. |

Meer is er niet nodig. Een ontwerpsysteem is grotendeels CSS; dit is de lijm.

### Wat er in main.js bij moet

1. `require('./renderer/tokens.js')` in plaats van de losse constanten; `SIDEBAR_WIDTH`
   c.s. en `overlayKleuren()` lezen daaruit.
2. `paletteOpen` wordt een teller in plaats van een booleaan, met kanaal
   `ui:overlay`. Twee overlays die elkaar overlappen mogen elkaars pagina niet
   terugzetten:

   ```js
   // Een teller en geen booleaan: als een uitklaplijst boven de commandobalk
   // sluit, mag de pagina nog niet terug.
   setOverlay(open) {
     this.overlays = Math.max(0, this.overlays + (open ? 1 : -1));
     this.tabs.get(this.activeId)?.setVisible(this.overlays === 0);
   }
   ```

   `ui:palette` blijft voorlopig staan als alias, zodat het bestaande palet niet
   breekt; wie het palet aanpast, haalt hem weg.
3. `did-fail-load` → foutpagina (§7.8), plus `FOUTPAGINA` naast `NEWTAB`.
4. Optioneel, pas als er instellingen zijn: `ipcMain.handle('ui:thema', …)` →
   `nativeTheme.themeSource = …`. Let op dat `themeSource` doorwerkt in álle
   renderers, ook in de tabbladen — websites zien dan jouw keuze in plaats van
   die van het systeem.

`preload.js` krijgt er één methode bij (`setOverlay`) en één luisteraar
(`onMelding`); `preload-island.js` niets. Geen `ipcRenderer` bloot.

---

## 11. Wat er mis kan gaan

- **`backdrop-filter` en het venstermateriaal.** Vervaagt vermoedelijk alleen
  wat in dezelfde renderer getekend is, niet het acrylic erachter. Als dat zo is,
  valt `--card` op 0.7 alfa vlakker uit dan het nu lijkt. Meten voordat je er
  panelen op bouwt.
- **Native popups boven de pagina.** Van `<select>`-popups en native tooltips
  weet ik niet zeker of ze boven een `WebContentsView` uitkomen. Daarom bouwen we
  lijsten zelf; daarom mag je op `title` alleen leunen binnen de zijbalk.
- **Het eiland knipt alles wat uitsteekt.** Elke nieuwe component daar moet
  `meet()` aanroepen, en mag zijn maat niet animeren.
- **Hertekende lijsten.** Elke `pushState()` vervangt de tabbladen. Animaties
  beginnen opnieuw, en `maakGlyph()` start per hertekening een nieuwe rAF-lus die
  zichzelf pas na drie frames opruimt. Bij veel assistententabbladen is dat een
  echte kostenpost.
- **CSP staat geen inline stijl toe.** Custom properties zet je via
  `el.style.setProperty()`, niet via een `style`-attribuut. Test of de CSSOM-weg
  inderdaad buiten `style-src` valt voordat je erop bouwt.
- **Segoe UI Variable ontbreekt buiten Windows 11.** Dan valt de hele optische
  schaal terug op één snede. Niets in het ontwerp mag daarvan afhangen.
- **Tokens die alleen in het donkere blok staan** breken zodra er een handmatige
  themakeuze komt.
- **Schaduwen op glas.** `--shadow-card` met veel spread wordt op een licht
  bureaublad een grijze vlek. Houd de bestaande waarden aan of maak ze zachter,
  niet groter.
- **Twee bronnen voor dezelfde kleur** (`tokens.css` en `tokens.js`,
  `--plafond` in `style.css` en `island.css`). Loopt dat uiteen, dan breken de
  holle hoekjes van het eiland zichtbaar.

---

## 12. Wat dit niet oplost

- **Geen themakeuze.** Het thema volgt het systeem via `prefers-color-scheme`.
  Een schakelaar in instellingen kan later, en §2.3 zorgt dat dit systeem het
  niet in de weg zit — maar hij is er nu niet.
- **Geen contrastgarantie.** De achtergrond is het bureaublad van de gebruiker.
  Wij kunnen alleen ondergrenzen afspreken.
- **Geen componentbibliotheek.** Dit is CSS plus afspraken. Het gedrag van een
  uitklaplijst, een focusval of een meldingswachtrij moet nog geschreven worden;
  `ui.js` is de plek, niet dit document.
- **De dubbele tokens tussen `style.css` en `island.css` verdwijnen niet** zolang
  niemand die bestanden aanraakt. `island.css` houdt zijn Nederlandse namen
  (`--tekst`, `--zacht`, `--gevaar-vlak`) tot iemand hem toch openslaat; dan in
  één keer omzetten, niet half.
- **Geen animatie tussen de lagen.** Zijbalk, eiland en pagina zijn drie
  compositors. Wat in de een begint, kan niet in de ander eindigen.
- **Geen dichtheidsstand.** Eén maatvoering, geen compacte modus. Als die er ooit
  komt, is dat een tweede set hoogtes en niet een schaalfactor over alles heen.
- **Geen ontwerp voor split view.** Zodra er twee `WebContentsView`s naast elkaar
  staan, verandert de vraag waar overlays mogen staan volledig. Dat is een eigen
  ontwerp.
