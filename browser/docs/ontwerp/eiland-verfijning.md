# Het eiland, verfijnd

Het eiland is het gezicht van dit product. Het is ook het enige onderdeel dat op
twee compositors tegelijk staat: de vorm wordt getekend door de renderer van
`island.html`, de rechthoek waarbinnen die vorm mag bestaan wordt gezet door het
hoofdproces met `View.setBounds()`. Elke vloeiende vormverandering is dus een
afspraak tussen twee klokken die elkaar niet zien.

Dit document doet drie dingen. Het legt één regel vast die dat probleem grotendeels
laat verdwijnen (§2), het ontwerpt de vormen en de overgangen die daarop passen
(§3–§6), en het schrijft het protocol uit waarmee de view meebeweegt zonder te
schokken of achter te lopen (§5) — dat laatste is het moeilijkste deel en het
grootste hoofdstuk.

Wat er in `docs/ontwerp/ui-systeem.md` staat over lagen, tokens, typografie,
radii, glas en `prefers-reduced-motion` geldt hier onverkort en wordt niet
herhaald. Waar dit document van ui-systeem §6.3 afwijkt ("het eiland verandert van
maat in één stap") staat de reden erbij.

Alles is geschreven tegen **Electron 33.4.11 (Chromium 130)**. Waar een API niet
geverifieerd is, staat dat er expliciet bij; §13 verzamelt het.

---

## 1. Wat er nu misgaat, in getallen

De drie richtingsdocumenten (`richting-verstilling.md` §8.1, `richting-materiaal.md`
§6.1, `richting-instrument.md` §7.1) benoemen alle drie dezelfde vier fouten. Ik
herhaal ze niet, alleen de twee waar dit ontwerp op gebouwd is, met het rekenwerk
erbij.

**De view hangt permanent over de pagina.** In rust is `#kaart` hoog:
`padding: calc(44 - 8) 15px 11px` = 36 boven, 11 onder, met daartussen `#tekst`
= `#vorige` (14px, vast) plus `#huidig` (14px op `line-height: 1.4` uit de
`body`-shorthand = 19,6px), samen 33,6. Dat is 36 + 34 + 11 = **81px**. De pagina
begint op y=44 (`layoutActiveTab`, `TOPBAR_HEIGHT`). Er ligt dus in rust
**ongeveer 37 pixels view over de bovenkant van elke website**, de hele dag, en
die vangt klikken: `View` heeft geen `setIgnoreMouseEvents` (geverifieerd,
`node_modules/electron/electron.d.ts` regel 14207–14278 bevat de hele klasse; de
methode staat alleen op `BaseWindow` regel 3068 en `BrowserWindow` regel 5681), en
bij `setBorderRadius` staat er expliciet bij: *"The area cutout of the view's
border still captures clicks."*

**En het is niet te repareren door 44 te vragen.** `setIslandSize` klemt met
`Math.max(46, Math.round(height))` (`main.js:284-290`). Een balk die netjes om
44px vraagt krijgt er 46, en houdt dus 2px over de pagina. Die klem moet
`Math.max(TOPBAR_HEIGHT, …)` worden; dat is de kleinste en meest noodzakelijke
wijziging in dit hele document.

**De maat verandert vóórdat de view mee is.** `island.js` zet de HTML om en meldt
daarna pas (`island.js:35-44` tegenover `main.js:284`). Bij rust → invoer springt
de pil van ruim honderd pixels naar ruim tweehonderd, want een `<input>` zonder
opgegeven breedte pakt zijn standaard `size=20`. Dat is geen ontbrekende animatie
maar een zichtbare hapering: minstens één frame waarin de nieuwe inhoud in de oude
rechthoek staat en dus geknipt wordt.

---

## 2. De regel waar alles op rust

> **De breedte is van de renderer. De hoogte is van het hoofdproces.**

De view is altijd precies zo breed als de breedste vorm die er ooit in past. Hij
wordt nooit smaller, ook niet in rust. Daardoor gebeurt élke breedteverandering
volledig binnen één compositor — de pil wordt breder of smaller binnen een
rechthoek die al ruim genoeg is — en kan de breedte per definitie niet uit de pas
lopen met de view. Er gaat geen enkel bericht over IPC voor de breedte.

Alleen de hoogte kost paginapixels, en alleen de hoogte gaat over IPC. Hij kent
precies twee waarden: **44** (dicht: de pil zit volledig in het plafond, nul
paginapixels) en **92** (open: er hangt een strook van 48px onder het plafond).
Twee waarden, één volgorderegel, één borging. Dat is het hele protocol.

De prijs staat in §7.2 en is eerlijk: een strook van 406×44 in het plafond die
altijd klikken vangt in plaats van 133×81 die nu klikken vangt tot 37px over de
pagina. Chassis in plaats van inhoud.

En daar hangt een tweede regel aan, die het ontwerp meteen leesbaar maakt:

> **Breedte betekent: heeft hij iets te zeggen. Hoogte betekent: wil hij iets van
> jou.**

Twee assen, elk twee standen, en dat levert vier combinaties waarvan er drie
bestaan:

| | dicht (44px) | open (92px) |
| --- | --- | --- |
| **smal** | `rust` — een glyph in het plafond | bestaat niet |
| **breed** | `regel`, `klaar` — hij meldt | `invoer`, `vraag`, `geblokkeerd` — hij wacht op jou |

Dat "bestaat niet" is een regel en geen toeval: **er hangt nooit iets onder een
pil die niets zegt.**

---

## 3. De vormen

### 3.1 De vormtabel

| Vorm | Wanneer | Breedte pil | Hoogte view | Hangt over de pagina |
| --- | --- | --- | --- | --- |
| `rust` | niets aan de hand | 56 / 90 / 124 / 152 | 44 | 0 |
| `regel` | hij werkt (`zoeken`, `lezen`, `analyseren`, `debuggen`) | 380 | 44 | 0 |
| `klaar` | hij is klaar | 380 | 44 | 0 |
| `invoer` | jij typt een opdracht | 380 | 92 | 48 |
| `vraag` | hij heeft je hulp nodig (nu `actie`) | 380 | 92 | 48 |
| `geblokkeerd` | de grendel hield iets tegen | 380 | 92 | 48 |

De vier ruststandbreedtes horen bij één, twee, drie en meer assistenten (§6.1).

**Alle sprekende vormen zijn even breed.** Dat is bewust en het is sterker dan
verstillings drie vaste breedtes (`richting-verstilling.md` §8.2). Zodra de pil
open is verandert zijn silhouet niet meer, wat er ook gebeurt: geen enkele zin,
geen enkele knop, geen enkele standwissel maakt hem breder of smaller. Er is
precies één breedteverandering in de hele app — van glyph naar pil — en die draagt
daardoor alle betekenis. Bijkomend voordeel dat niet cosmetisch is: bij een vaste
breedte hoeft de tekst nooit opnieuw te worden ingedeeld tijdens een overgang, dus
er is geen ellipsis die aan het eind van een animatie verspringt en geen layout per
frame in de tekstkolom.

### 3.2 Waarom alleen drie vormen hangen

De regel is: **wat op één rij past, blijft in het plafond.** Het plafond is 44px
hoog, altijd donker, en het staat er toch al — een regel tekst en een glyph erin
kosten nul pixels van de pagina die je aan het lezen bent. Wat níét op één rij
past, hangt.

Er zijn precies drie dingen die niet op één rij passen, en het is geen toeval dat
het dezelfde drie zijn waarin het eiland iets van jou wil:

- **`invoer`** — het veld staat in de plafondrij, maar waar de opdracht terechtkomt
  (welk tabblad, welke workspace) en welke toetsen er gelden horen eronder. Je
  typt een paar seconden; dan mag het 48 pixels kosten.
- **`vraag`** — een vraag plus drie knoppen past niet naast elkaar, en juist hier
  mag het niet krap: `ui-systeem.md` §7.1 eist minstens 16px tussen een
  gevaarlijke en een primaire knop, en dit is de plek waar je onder tijdsdruk het
  verkeerde aanklikt.
- **`geblokkeerd`** — wat er geblokkeerd is staat in de plafondrij, wélk schema het
  was staat eronder, met de enige knop die hier hoort.

Dit is een bewuste afwijking van instruments hoogte-morph 44 → 51 → 44
(`richting-instrument.md` §7.2), die de jury als diefstal aanwees. Het *principe*
neem ik volledig over — de hoogte mag meebewegen, de breedte volgt de inhoud niet
— maar 51px is de slechtste van beide werelden: zeven pixels van elke website
permanent onklikbaar, voor een strook die te smal is om iets in te zetten. Die
zeven pixels bestonden alleen om de vorige regel (`#vorige`) kwijt te kunnen, en
die verdwijnt hier (§4.4). Als de hoogte pixels kost, moeten die pixels iets
dragen; anders kost hij er nul.

### 3.3 De geometrie: het anker is bouw, geen berekening

```css
:root {
  /* Chassis. Deze drie moeten gelijk zijn aan style.css en (straks) tokens.js.
     Loopt er één uiteen, dan valt de gegoten aansluiting zichtbaar uit elkaar. */
  --plafond-hoogte: 44px;
  --holte: 13px;
  --hoek: 18px;          /* was 17; gelijk aan --radius-card */

  --glyph: 26px;
  --rail-gap: 8px;
  --vulling-x: 15px;
  --binnen: 10px;        /* echte binnenmarge in de hangstrook, boven én onder */
  --knoprij: 28px;

  /* De vormtabel. island.js leest deze waarden met getComputedStyle, zodat de
     maat die getekend wordt en de maat die naar het hoofdproces gaat niet uit
     elkaar kunnen lopen — dat is precies de naad waar dit ontwerp op staat. */
  --b-open: 380px;
  --h-dicht: var(--plafond-hoogte);
  --h-open: calc(var(--plafond-hoogte) + var(--binnen) * 2 + var(--knoprij)); /* 92 */

  /* Wat er werkelijk past. 100vw is hier de breedte van de view zelf, dus deze
     ene regel vangt een smal venster op zonder dat het hoofdproces er iets over
     hoeft te melden. */
  --b-vak: calc(100vw - var(--holte) * 2);
}
```

De opbouw van de kaart is twee blokken onder elkaar:

```
y=0   ┌──────────────────────────────────────┐  ← plafondrij, exact 44px
      │  ◼ glyph      de regel        [knop] │     de glyph staat hier altijd
y=44  ├──────────────────────────────────────┤  ← hier begint de pagina
      │  onderregel              [knoppen]   │     hangstrook, 10 + 28 + 10
y=92  └──────────────────────────────────────┘
```

```css
/* De plafondrij is exact zo hoog als het plafond en staat altijd bovenaan. Het
   ankerpunt van de morph is daarmee geen uitgerekende padding maar een gevolg
   van de bouw: het midden van de glyph ligt in elke vorm op y=22, ook als er
   later een rij bij komt of afgaat. */
#plafondrij {
  height: var(--plafond-hoogte);
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 0 var(--vulling-x);
  /* Vaste breedte, los van de kaart. De kaart is wat groeit; de inhoud staat er
     al op eindmaat in en wordt onthuld. Zo wordt er tijdens een overgang niets
     opnieuw ingedeeld. */
  width: min(var(--b-open), var(--b-vak));
}

#hangstrook {
  height: calc(var(--binnen) * 2 + var(--knoprij));
  display: flex;
  align-items: center;
  gap: 10px;
  padding: var(--binnen) var(--vulling-x);
  width: min(var(--b-open), var(--b-vak));
}
```

Dit lost instruments punt §7.4c op de bouwkundige manier op in plaats van met
rekenwerk. De jury vroeg om een rustpadding waarmee het midden van de glyph in
alle vormen op dezelfde y ligt; met een rij van precies plafondhoogte bovenaan
klopt dat per constructie, in álle zes de vormen, en het blijft kloppen als er ooit
een zevende bijkomt.

**Verticaal is de glyph het anker; horizontaal rijdt hij mee met de rand waar hij
aan vastzit.** De pil is gecentreerd op de middellijn van het paginagebied, dus als
hij breder wordt schuift zijn linkerrand naar links en de glyph mee — hooguit
(380 − 56) / 2 = 162px, op dezelfde klok als de breedte. Dat leest als één ding
dat opengaat, niet als twee dingen die tegelijk bewegen. Een pil die links
verankerd blijft zou niet meer op zijn as hangen, en de as is wat hem een eiland
maakt.

### 3.4 De holle hoekjes zijn geen los onderdeel

De vraag "hoe lopen de holle hoekjes mee als de breedte verandert" heeft een
antwoord dat geen synchronisatie nodig heeft: **maak ze onderdeel van dezelfde
doos.** Dan kúnnen ze niet achterlopen.

```css
/* De doos waarin de pil en zijn twee aansluitingen samen leven. De horizontale
   padding is precies de holte, dus de hoekjes staan pal tegen de kaart aan en
   schuiven automatisch mee als de kaart breder wordt. En overflow: hidden klipt
   ze op de onderrand van de kaart — daardoor is er geen enkele uitzondering
   nodig voor de standen waarin de pil in het plafond zit: dan is de kaart 44
   hoog, is er niets onder het plafond, en zijn de hoekjes vanzelf nul hoog. */
#vorm {
  position: relative;
  padding: 0 var(--holte);
  overflow: hidden;
}

#vorm::before,
#vorm::after {
  content: "";
  position: absolute;
  top: var(--plafond-hoogte);
  width: var(--holte);
  height: var(--holte);
}

/* De tweede kleurstop een halve pixel later dan de eerste: met beide stops op
   dezelfde waarde is de boog hard afgesneden en zie je de trapjes. */
#vorm::before {
  left: 0;
  background: radial-gradient(circle var(--holte) at 0 100%,
    transparent var(--holte), var(--plafond) calc(var(--holte) + 0.5px));
}

#vorm::after {
  right: 0;
  background: radial-gradient(circle var(--holte) at 100% 100%,
    transparent var(--holte), var(--plafond) calc(var(--holte) + 0.5px));
}
```

Twee gevolgen die het ontwerp goedkoper maken dan de drie richtingen:

1. **`rust` heeft geen enkele uitzonderingsregel nodig.** Verstilling schrijft
   `background: none` plus `::before/::after { display: none }` plus een eigen
   padding voor de ruststand (`richting-verstilling.md` §8.2). Hier is de kaart in
   rust gewoon 44 hoog en dus onzichtbaar: hij is donker op een even donker
   plafond, zijn afgeronde onderhoeken snijden dat plafond aan tot op de
   plafondkleur die eronder ligt, en de hoekjes zijn tot nul geklipt. Er is niets
   uit te zetten.
2. **De aansluiting groeit mee terwijl de pil uit het plafond komt.** Bij een
   uitschuiving van 5px zie je de bovenste 5px van de holte, precies zoals bij
   materiaal dat uit een gleuf geduwd wordt. Zonder de klip zou de holte van 13px
   in zijn geheel naast een pil van 5px hangen — een wig plafondkleur naast niets.

Wat hier wél aan hangt: `--plafond` moet in `island.css` en `style.css` exact
gelijk blijven, want de holte tekent met die kleur tegen `#drag-strip` aan. Dat
staat al in `ui-systeem.md` §5 en is de reden dat beide bestanden `tokens.css`
horen te laden (§10 daar).

---

## 4. De morph

### 4.1 Twee sporen, één klok, 60ms uit elkaar

De vraag is hoe hoogte en breedte samen bewegen zonder te schokken. Het antwoord
is: ze bewegen niet tegelijk, ze bewegen met een vaste faseverschuiving, en de
volgorde keert om op de terugweg.

| Richting | Breedte | Hoogte | Wat je ziet |
| --- | --- | --- | --- |
| open | 0 → 240ms | 60 → 300ms | de pil gaat eerst open, dan komt hij naar beneden |
| dicht | 60 → 300ms | 0 → 240ms | hij trekt zich eerst terug in het plafond, dan wordt hij smal |

Een morph duurt dus 300ms van begin tot eind, met twee sporen van elk 240ms.

Waarom dit werkt: de rechteronderhoek van de pil beschrijft geen diagonaal maar
een boog. Een diagonaal leest als *inzoomen* — het hele ding wordt groter. Een
boog leest als *twee handelingen*: hij ging open, en toen kwam er iets uit. Dat is
precies wat er gebeurt, en het is de reden dat de twee assen in §2 twee
verschillende dingen betekenen.

En de omkering is geen symmetrie-esthetiek maar noodzaak: als de breedte bij het
sluiten voor zou lopen, zie je een smalle sliert onder het plafond uit hangen. De
pil moet altijd eerst terug in zijn gleuf en dan pas smal worden.

### 4.2 De curve

```css
:root {
  --duur-morph: 240ms;
  --fase-morph: 60ms;
  --duur-wissel: 110ms;   /* inhoud die uitgaat of binnenkomt */
}
```

De curve is `--ease-zacht` uit `richting-materiaal.md` §7.1 — de jury wees hem
aan, en om de goede reden. Het is een bijna kritisch gedempte veer (ζ=0.90, ω₀=26,
280ms, bemonsterd op twaalf punten) die afremt zonder zichtbaar door te schieten.
`--ease-veer` uit datzelfde document (4,6% doorschot) hoort hier expliciet niet:
een pil die naveert boven de pagina waarin je leest is precies het soort beweging
dat na drie uur gaat storen.

```css
--ease-zacht: linear(
  0, 0.128 8.3%, 0.361 16.7%, 0.578 25%, 0.742 33.3%, 0.853 41.7%,
  0.923 50%, 0.963 58.3%, 0.984 66.7%, 0.995 75%, 1 83.3%, 1.001 91.7%, 1
);
```

`linear()` is gedocumenteerd vanaf Chromium 113 en dus aanwezig in Electron 33;
niet in deze app gedraaid. Let op de 1.001 op 91,7%: dat is 0,1% doorschot, op 380
pixels 0,4 pixel. In §5.1 krijgt de view daarom één pixel speling, zodat een
afgeronde tussenwaarde nooit net buiten de rechthoek valt.

### 4.3 Inhoud gaat in en uit terwijl de vorm meebeweegt

Drie regels, en samen zijn ze genoeg.

**Eén. Wat weggaat duwt niets weg.** Alles wat wisselt ligt in dezelfde grid-cel
en kruist erin. Overgenomen uit `richting-instrument.md` §7.4b.

```css
/* Twee dingen op één plek, zodat een wissel een kruising is en geen sprong. */
#midden {
  display: grid;
  flex: 1;
  min-width: 0;
}

#midden > * {
  grid-area: 1 / 1;
  min-width: 0;
  transition:
    opacity var(--duur-wissel) var(--ease-zacht),
    translate var(--duur-wissel) var(--ease-zacht);
}

/* Niet display:none maar onzichtbaar-en-onaanraakbaar: anders is er geen
   beginwaarde om vandaan te kruisen. Uit de toetsenbordvolgorde halen doet
   island.js met inert, niet dit blok. */
#midden > [hidden] {
  display: block;
  opacity: 0;
  translate: 0 4px;
  pointer-events: none;
}
```

**Twee. De inhoud staat er al op eindmaat in; de vorm onthult hem.** De
plafondrij en de hangstrook hebben een vaste breedte (§3.3) en de kaart heeft
`overflow: hidden`. Tijdens een overgang wordt er dus niets opnieuw ingedeeld —
er is één layout aan het begin en één aan het eind, en daartussen alleen een doos
die van maat verandert. Dat is ook waarom de hangstrook altijd in de DOM staat en
niet `hidden` is: hij is er, hij is alleen geklipt.

**Drie. Wat weggaat vertrekt eerst, wat komt arriveert laatst.** De inhoud van de
hangstrook krijgt bij het openen 100ms vertraging, zodat hij verschijnt in een
doos die er al is; bij het sluiten vertrekt hij in de eerste 90ms, zodat de doos
leeg is voordat hij dichtklapt.

```css
#hangstrook > * {
  opacity: 0;
  translate: 0 -6px;
  transition:
    opacity var(--duur-wissel) var(--ease-zacht),
    translate var(--duur-wissel) var(--ease-zacht);
}

#vorm[data-open="true"] #hangstrook > * {
  opacity: 1;
  translate: 0 0;
  transition-delay: 100ms;
}
```

### 4.4 De regelwissel, en wat er verdwijnt

De regelwissel is nu half af: de oude regel zakt netjes naar `#vorige`, maar de
nieuwe wordt met `huidigEl.textContent = tekst` in één frame overschreven
(`island.js:30`). Je ziet dat er íets veranderd is, niet dat het hetzelfde spoor
is. Alle drie de richtingen repareren dat op dezelfde manier en die reparatie
neem ik over: uit, wisselen, weer in.

```js
// Uit en weer in, zodat je ziet dát er iets vervangen wordt. Zonder de gelijk-
// heidstest zou een pushState met dezelfde regel de tekst laten knipperen terwijl
// je hem aan het lezen bent, en dat gebeurt bij deze belasting vaak.
async function toonRegel(tekst) {
  if (tekst === laatsteRegel) return;
  laatsteRegel = tekst;
  regelEl.classList.add('wisselt');
  await pauze(DUUR_WISSEL);
  regelEl.textContent = tekst;
  regelEl.classList.remove('wisselt');
}
```

```css
#regel { transition: opacity var(--duur-wissel) var(--ease-zacht),
                     translate var(--duur-wissel) var(--ease-zacht); }
#regel.wisselt { opacity: 0; translate: 0 -4px; }
```

**Wat verdwijnt: `#vorige` en de glans.** De vorige regel als permanente
schaduwtekst is de reden dat instrument 51px hoogte nodig had, en hij vertelt
niets dat je niet net gelezen hebt. De geschiedenis van een assistent hoort in een
logboek dat je opvraagt (§14), niet als spook onder elke zin. En de glans over
`#huidig.bezig` (`island.css:116-134`) gaat weg omdat twee dingen die tegelijk
zeggen "er gebeurt iets" er één te veel zijn: de glyph zegt het ook, en die zegt
er bovendien bij *wat* er gebeurt. Dat scheelt tegelijk een oneindige
CSS-animatie over tekst die je aan het lezen bent. Dit is verstillings besluit
(`richting-verstilling.md` §8.4) en het is het juiste.

---

## 5. Het protocol

Dit is het deel waar het misgaat als het misgaat, en het gaat stil mis: een view
die te groot blijft staan ziet er precies hetzelfde uit en vangt intussen
muisklikken boven de website van iemand anders.

### 5.1 Twee invarianten

**I1 — de view omvat altijd de pil.** Op elk moment geldt
`pil ⊆ view`. Een frame waarin dat niet geldt is een frame met geknipte inhoud.

**I2 — in rust ligt de view strak om de pil.** Zodra er niets meer beweegt, is de
viewhoogte de hoogte van de huidige vorm. Een frame waarin dat niet geldt is een
frame waarin de pagina klikken kwijtraakt.

I1 is een eis per frame, I2 een eis per rustpunt. Ze spreken elkaar tegen tijdens
een overgang, en dat is precies wat het protocol regelt: **I1 wint tijdens de
beweging, I2 wint erna, en I2 wordt afgedwongen door iets dat niet van de
animatie afhangt.**

De breedte doet aan geen van beide mee, want die is constant:

```js
// De view is altijd zo breed als de breedste vorm plus twee holtes. Daarmee kan
// een breedteverandering per definitie niet buiten de view vallen, en hoeft er
// voor de breedte nooit iets over IPC. De ene extra pixel is voor het doorschot
// van 0,1% in --ease-zacht: een afgeronde tussenwaarde mag nooit net buiten de
// rechthoek uitkomen.
const VIEW_BREEDTE = Math.ceil(px('--b-open') + HOLTE * 2) + 1;   // 407
```

### 5.2 Er hoeft niet gemeten te worden

Materiaal noemt zijn eigen morph-protocol de gevaarlijkste code van de drie
documenten (`richting-materiaal.md` §6.2: maat pinnen, inhoud wisselen, meten,
`await`, rAF, transitioneren), en dat klopt. Maar die hele meetronde bestaat
alleen omdat de maat van de inhoud afhangt. Dat is hier niet zo: er zijn zes
vormen met bekende maten, en die maten staan in CSS.

```js
// Eén bron voor de vormtabel: island.css. Zou island.js zijn eigen getallen
// aanhouden, dan kan de maat die naar het hoofdproces gaat afwijken van de maat
// die getekend wordt — en dat is precies de naad waar dit ontwerp op staat.
// getComputedStyle is een web-API, dus dit blijft geschikt voor een view zonder
// Node, net als in glyph.js.
const px = (naam) =>
  parseFloat(getComputedStyle(document.documentElement).getPropertyValue(naam));

const HOLTE = px('--holte');
const DICHT = px('--h-dicht');            // 44
const OPEN = px('--h-open');              // 92
const HANGT = new Set(['invoer', 'vraag', 'geblokkeerd']);

const hoogteVan = (vorm) => (HANGT.has(vorm) ? OPEN : DICHT);
```

`parseFloat` op `"240ms"` levert 240 en op `"44px"` levert 44; dat is de goedkope
weg en het is de enige plek waar de eenheid impliciet is. Wie dat niet vertrouwt,
zet de duren als getal in een eigen token (`--duur-morph-ms: 240`).

Er is één maat die wél van de inhoud afhangt: de breedte van de ruststand, want
die groeit met het aantal assistenten. Die staat als vier vaste waarden in CSS,
gekozen met `[data-rail]` (§6.1), dus ook zonder meten en zonder CSSOM.

### 5.3 Wachten op je eigen resize, niet op een bevestiging

Bij het openen moet de view groter zijn vóórdat de pil groeit. De vraag is
waaróp je wacht.

- `await eiland.meldGrootte(...)` — `meldGrootte` is een `invoke`
  (`preload-island.js:8`) en dus awaitbaar, maar de belofte lost op zodra de
  handler in `main.js` teruggekeerd is. `setBounds()` is synchroon en zegt niets
  over wanneer de view er ook zo bij ligt. Dit is wat alle drie de richtingen
  gebruiken, en het is te vroeg.
- `view.on('bounds-changed', …)` → een nieuw kanaal terug naar de renderer. Dat
  event bestaat (geverifieerd, `electron.d.ts:14212-14220`: *"Emitted when the
  view's bounds have changed in response to being laid out"*), maar het is een
  gebeurtenis in het hoofdproces die daarna nog een IPC-hop nodig heeft. Twee
  sprongen, en nog steeds geen uitspraak over de renderer.
- **`window.addEventListener('resize', …)` in de balk zelf.** De view *is* het
  venster van deze renderer. Zodra `window.innerHeight` de nieuwe hoogte meldt,
  is deze pagina op de nieuwe maat ingedeeld en is het eerstvolgende frame dat
  hij tekent een frame op die maat. Geen extra kanaal, geen extra hop, en het
  signaal komt in het proces dat de animatie moet starten.

```js
// De view is het venster van deze pagina, dus 'resize' is het eerste moment
// waarop we de nieuwe rechthoek werkelijk hebben. Dat is dichterbij dan de
// belofte van meldGrootte, die alleen zegt dat setBounds() geretourneerd is.
//
// De race met een timeout is geen luxe maar een eis: vraagt de balk een maat die
// hij al heeft — of klemt layoutIsland() hem op een smal venster — dan komt er
// nooit een resize en zou de overgang hier blijven staan. Dat is de open vraag
// die verstilling §8.3 bij bounds-changed laat liggen.
function wachtOpResize(ms = 120) {
  return new Promise((klaar) => {
    const af = () => {
      window.removeEventListener('resize', af);
      clearTimeout(klok);
      klaar();
    };
    const klok = setTimeout(af, ms);
    window.addEventListener('resize', af);
  });
}

async function zetViewHoogte(h) {
  if (window.innerHeight === h && window.innerWidth === VIEW_BREEDTE) return;
  const gehoord = wachtOpResize();
  eiland.meldGrootte(VIEW_BREEDTE, h);
  await gehoord;
}
```

**Wat ik hierover niet geverifieerd heb:** dat Chromium de nieuwe rechthoek van de
view synchroniseert met het eerste frame dat op die maat getekend is (surface
synchronisation). Als dat níét zo is, kun je één frame oude inhoud in de nieuwe
rechthoek zien — bij het openen is dat een frame plafondkleur onder de pil, en dat
valt niet op. Bij het sluiten kan het niet gebeuren, want daar wordt de view pas
kleiner als de pil al klein is. Meet het één keer met de DevTools van de
island-view.

### 5.4 De lus: één slot, één borging

`island:state` kan midden in een overgang binnenkomen. Met de huidige
`AGENT_STAPPEN` (1300 tot 3200ms per stap) gebeurt dat zelden, maar `geblokkeerd`
komt uit een navigatie-grendel en die wacht nergens op, en Escape in het
invoerveld komt van een mens.

De oplossing is een lus met één slot: er draait hoogstens één morph, de laatst
gevraagde stand wint altijd, en tussenliggende standen worden overgeslagen in
plaats van afgespeeld.

```js
let staat = null;      // laatst ontvangen stand van het hoofdproces
let vormNu = 'rust';   // wat er werkelijk staat
let morfBezig = false;
let lopend = [];       // draaiende animaties, om te kunnen afbreken

eiland.onStand((nieuw) => {
  staat = nieuw;
  // Inhoud is losgekoppeld van vorm: de rijen staan altijd op eindbreedte, dus
  // tekst en knoppen mogen midden in een morph wisselen zonder iets te schokken.
  vulInhoud(nieuw);
  plan();
});

async function plan() {
  // Draait er al een morph, dan pikt die de nieuwste staat vanzelf op zodra hij
  // klaar is. Een tweede lus starten zou twee animaties op dezelfde eigenschap
  // geven en dat is precies hoe een view op de verkeerde maat blijft staan.
  if (morfBezig) return;
  morfBezig = true;
  try {
    while (staat && staat.vorm !== vormNu) await naarVorm(staat.vorm);
  } finally {
    morfBezig = false;
    // De borging staat in de finally: ook een afgebroken of mislukte overgang
    // moet eindigen met een view die strak om de pil ligt (invariant I2).
    await zetViewHoogte(hoogteVan(vormNu));
  }
}

async function naarVorm(doel) {
  const vanH = hoogteVan(vormNu);
  const naarH = hoogteVan(doel);
  const opent = naarH > vanH;

  // Groeien: eerst ruimte, anders knipt de rand van de view de eerste frames van
  // de animatie af. Dat is de hapering die je nu bij elke standwissel ziet.
  if (opent) await zetViewHoogte(naarH);

  const vanB = breedteVan(vormNu);
  const naarB = breedteVan(doel);
  vormNu = doel;
  // Vóór het animeren zetten, niet erna: dan zijn de CSS-rustwaarden al de
  // doelwaarden en landt de animatie er precies op in plaats van terug te
  // springen. Layout is synchroon, schilderen niet, dus hier wordt niets van
  // getekend.
  vorm.dataset.vorm = doel;
  vorm.dataset.open = String(HANGT.has(doel));

  await beweeg(vanB, naarB, vanH, naarH, opent);

  // Krimpen: pas teruggeven als de pil er niet meer is. Andersom knip je je
  // eigen animatie af en zie je een frame lege view om een kleine pil.
  if (!opent) await zetViewHoogte(naarH);
}

function beweeg(vanB, naarB, vanH, naarH, opent) {
  for (const a of lopend) a.cancel();

  // Twee sporen op één klok, 60ms uit elkaar. Bij openen loopt de breedte voor
  // (hij gaat open en komt dan naar beneden), bij sluiten de hoogte (hij trekt
  // zich eerst terug in het plafond en wordt daarna pas smal) — anders hangt er
  // een smalle sliert onder het plafond uit.
  const b = kaart.animate(
    [{ width: `${vanB}px` }, { width: `${naarB}px` }],
    { duration: DUUR, delay: opent ? 0 : FASE, easing: EASE, fill: 'backwards' },
  );
  const h = kaart.animate(
    [{ height: `${vanH}px` }, { height: `${naarH}px` }],
    { duration: DUUR, delay: opent ? FASE : 0, easing: EASE, fill: 'backwards' },
  );
  lopend = [b, h];

  // allSettled en niet all: cancel() laat .finished afwijzen, en een afgebroken
  // morph is hier geen fout maar de normale weg als er een nieuwe stand komt.
  return Promise.allSettled([b.finished, h.finished]);
}
```

Waarom `Element.animate` en niet een CSS-transitie met `transitionend`: een
transitie die niet start (omdat de waarde toevallig gelijk is) of die onderbroken
wordt vuurt geen `transitionend`, en dan blijft de `await` hangen en daarmee de
view op 92. Dat is exact het stille lek uit de inleiding van dit hoofdstuk, en
het zit in de voorstellen van materiaal (§6.2, `transitionend` met `{once:true}`)
en instrument (§7.3, `klaarMetTransitie`). `animation.finished` lost altijd op of
wijst altijd af, en `cancel()` is een expliciete uitweg.

`fill: 'backwards'` houdt de beginwaarde vast tijdens de vertraging van het
achterste spoor; na afloop (`fill: 'none'`, de standaard) valt de kaart terug op
zijn CSS-waarden, en die zijn al de doelwaarden.

### 5.5 De borging: wat er gebeurt als het toch misgaat

De borging in `finally` dekt de renderer af. Twee dingen dekt hij niet, en die
horen in het hoofdproces, want daar staat de rechthoek.

```js
// main.js — in de constructor, bij de island-view.
//
// Herstart de balk (crash, of een herlaadactie tijdens het bouwen), dan staat
// zijn laatst gemelde hoogte er nog en blijft er een onzichtbare strook over de
// pagina liggen die klikken vangt. De renderer weet daar niets van; hij begint
// juist met een schone lei. De veiligheid hoort dus hier.
this.island.webContents.on('did-finish-load', () => {
  this.islandSize = { ...this.islandSize, height: TOPBAR_HEIGHT };
  this.layoutIsland();
});
```

En de klem uit `setIslandSize` moet mee, anders is 44 niet aan te vragen:

```js
setIslandSize(width, height) {
  this.islandSize = {
    width: Math.max(120, Math.round(width)),
    // Was Math.max(46, …). Daardoor kreeg een balk die netjes om plafondhoogte
    // vroeg er 46, en bleef er permanent 2px over de pagina hangen.
    height: Math.max(TOPBAR_HEIGHT, Math.round(height)),
  };
  this.layoutIsland();
}
```

Daarnaast een wachthond in de balk zelf, voor het geval dat de lus door een fout
in `vulInhoud` nooit aan zijn `finally` toekomt:

```js
// Idempotent en goedkoop: zetViewHoogte doet niets als de maat al klopt. Dit is
// de laatste vangnetlaag onder invariant I2 — een view die te groot blijft staan
// merk je pas op de website van iemand anders.
clearTimeout(wachthond);
wachthond = setTimeout(() => {
  if (!morfBezig) zetViewHoogte(hoogteVan(vormNu));
}, 600);
```

### 5.6 Wat het protocol kost

| Overgang | IPC-aanroepen |
| --- | --- |
| `rust` → `regel` (44 → 44) | 0 |
| `regel` → `klaar` (44 → 44) | 0 |
| `vraag` → `geblokkeerd` (92 → 92) | 0 |
| `regel` → `vraag` (44 → 92) | 1 |
| `vraag` → `rust` (92 → 44) | 1 |

De meeste standwissels in een assistentcyclus zijn hoogtegelijk en kosten dus
niets. `ui-systeem.md` §6.3 waarschuwt dat een geanimeerde maat zestig
`island:size`-aanroepen per seconde wordt; dat argument geldt alleen als je per
frame meet, en dat doet dit ontwerp nergens. Hooguit één aanroep per overgang, en
meestal nul.

### 5.7 Wat dit protocol niet kan

- **Het venster dat tijdens een morph van maat verandert.** `layoutIsland()`
  klemt de breedte op de ruimte naast de vensterknoppen, en `--b-vak` volgt via
  `100vw`. De WAAPI-keyframes staan dan nog op de oude pixelwaarden en de kaart
  springt aan het eind naar de nieuwe. Oplossing: op `resize` de lopende
  animaties `cancel()`en en de doelvorm direct zetten. Een vensterresize is
  gebruikersactie; een sprong daarin valt niet op.
- **Een view die groter blijft dan de pil zolang een overgang loopt.** Tijdens de
  300ms van een sluitende morph vangt de doorzichtige onderkant klikken. Dat is
  de prijs van invariant I1 en hij is niet weg te ontwerpen zolang `View` geen
  `setIgnoreMouseEvents` heeft. 300ms is te verdedigen; permanent niet, en
  daarom is §5.5 geen extraatje.
- **Twee vensters.** Alles hierboven is per venster; de balk kent alleen zichzelf.
  Dat is nu al zo en verandert hier niet.

---

## 6. Meerdere assistenten, zonder dat het een lijst wordt

`main.js` kent één `this.agent` (`main.js:90`, `startAgent`, `volgendeStap`,
`stopAgent`). Twee assistenten tegelijk passen daar niet in, en geen van de drie
richtingen lost dat op. Het eiland moet er wel op ontworpen zijn, anders is de
tweede assistent later een verbouwing in plaats van een uitbreiding.

### 6.1 De rail: de glyphs staan naast elkaar, niet onder elkaar

Een lijst ontstaat zodra je per assistent een rij geeft. De uitweg is dat elke
assistent hetzelfde teken krijgt dat hij al heeft — zijn glyph — en dat die tekens
op één rij staan.

```
rust, één assistent      rust, drie assistenten
┌────────┐               ┌───────────────────────┐
│   ◼    │               │   ◼   ◼   ◼           │
└────────┘               └───────────────────────┘
   56px                            124px
```

```css
/* Vier ruststandbreedtes, gekozen met een data-attribuut in plaats van een
   berekende custom property: er zijn maar vier gevallen, en dan is een klasse
   goedkoper dan een CSSOM-schrijfactie waarvan het CSP-gedrag nog nagemeten
   moet worden (ui-systeem §6.4). */
#vorm[data-rail="1"] { --n: 1; }
#vorm[data-rail="2"] { --n: 2; }
#vorm[data-rail="3"] { --n: 3; }
#vorm[data-rail="meer"] { --n: 3; --extra: calc(var(--rail-gap) + 22px); }

#vorm[data-vorm="rust"] {
  --b-doel: calc(
    var(--vulling-x) * 2 +
    var(--glyph) * var(--n) + var(--rail-gap) * (var(--n) - 1) +
    var(--extra, 0px)
  );
}
```

Meer dan drie wordt drie plus een `+N`-chip van 22px. Boven de drie is het geen
overzicht meer maar een aantal, en dan hoor je een aantal te tonen.

De glyphs blijven in élke vorm 26px. Geen tweede maat, geen krimpende chips, geen
absolute positionering met `calc`-soep: de rail is een gewone flexrij in de
plafondrij, en dat is de reden dat er in de hele morph niets over de rail hoeft te
worden uitgerekend.

### 6.2 De spreker

Zodra er iets te melden is, is er precies één **spreker**: de assistent wiens
regel in de pil staat. Zijn glyph staat vooraan, de anderen erachter, in hun eigen
modus-kleur en met hun eigen beweging. Je ziet dus in één oogopslag dat er twee
werken, en welke van de twee praat.

```
regel, twee assistenten
┌──────────────────────────────────────────────┐
│  ◼  ◼   Zoekt naar dubbelglas         Stop   │
└──────────────────────────────────────────────┘
```

De volgorde van het sprekerschap is een prioriteit, geen wachtrij die je afwerkt:

1. `geblokkeerd` (komt niet van een assistent en moet weg te klikken zijn)
2. `vraag` — hij staat stil tot jij iets doet
3. `klaar` — hij is klaar en dat verjaart
4. `regel` — hij werkt gewoon door

Bij gelijke stand wint de meest recente gebeurtenis.

### 6.3 De wissel

Wisselt de spreker, dan **schuift** de pil niet van vorm maar van inhoud: de
inkomende glyph en de vertrekkende glyph wisselen van plek, de regel kruist, en
de vorm blijft waar hij is als beide standen even hoog zijn (en dat is
gebruikelijk). Twee elementen, één FLIP:

```js
// Twee glyphs wisselen van plek. Meten, verwisselen, en de sprong terugdraaien
// met een transform die daarna naar nul loopt: dat is één gecomposite beweging
// zonder dat er ook maar iets van layout schokt. Dezelfde techniek als de
// tabbladlijst (richting-instrument §1.2), hier op precies twee elementen.
function wisselSpreker(nieuweGlyph) {
  const voor = [...rail.children].map((el) => el.getBoundingClientRect().left);
  rail.prepend(nieuweGlyph);
  [...rail.children].forEach((el, i) => {
    const dx = voor[i] - el.getBoundingClientRect().left;
    if (!dx) return;
    el.animate(
      [{ translate: `${dx}px 0` }, { translate: '0 0' }],
      { duration: DUUR, easing: EASE },
    );
  });
}
```

### 6.4 De vier regels die het geen lijst laten worden

1. **Er hangt nooit meer dan één kaart.** Twee assistenten die tegelijk iets
   vragen leveren één pil met één vraag; de tweede kleurt zijn glyph oranje en
   wacht. Je beantwoordt er één, dan schuift de volgende erin.
2. **De spreker wisselt hoogstens één keer per 1,2 seconde.** Zonder die
   ondergrens flipt de pil heen en weer als twee assistenten binnen een halve
   seconde iets melden.
3. **De spreker wisselt nooit terwijl het invoerveld focus heeft.** Wat je typt
   raak je niet kwijt aan iemand anders' melding.
4. **Klikken op een glyph in de rail maakt hem de spreker** (`island:select` met
   zijn tabblad-id). Dat is de enige bediening die de rail heeft, en het is er
   ook de enige die nodig is.

### 6.5 Wat main.js hiervoor moet worden

Dit is echt werk in `main.js` en het valt buiten een zijbalk- of eilandwijziging;
het staat hier zodat het kanaal er meteen op ontworpen is en later niet hoeft te
veranderen.

- `this.agent` wordt `this.agents` — een `Map` op tabblad-id. `volgendeStap`,
  `resumeAgent` en `stopAgent` krijgen een id-argument; `agentTimer` gaat de
  agent-record in.
- `describe()` haalt `modus` uit `this.agents.get(id)` in plaats van uit
  `this.agent?.tabId === id`; dat is één regel en werkt meteen voor N.
- Er komt een `pushIsland()` naast `pushState()`, met dezelfde trailing debounce
  van 50ms uit `ROUTEKAART.md` §1.10. De balk krijgt de hele stand in één
  bericht, niet één assistent per bericht:

```js
// island:state beschrijft de hele balk en niet één assistent. Zo hoeft de balk
// nooit zelf te onthouden wie er nog meer werkt, en kan het hoofdproces later
// meer assistenten sturen zonder dat dit kanaal verandert.
{
  vorm: 'regel',            // rust | regel | klaar | invoer | vraag | geblokkeerd
  spreker: 3,               // tabblad-id, of null in rust en bij geblokkeerd
  assistenten: [
    { id: 3, naam: 'Kim', modus: 'zoeken', regel: 'Zoekt naar dubbelglas' },
    { id: 7, naam: 'Sam', modus: 'lezen',  regel: 'Leest de resultaten' },
  ],
  melding: null,            // alleen bij geblokkeerd: { titel, detail }
  doel: 'Nieuw tabblad in Persoonlijk',   // alleen bij invoer
}
```

Zolang `main.js` één assistent kent bevat `assistenten` één element en werkt
dezelfde balk ongewijzigd. Dat is de reden om het kanaal nu al zo te vormen.

---

## 7. Wat het eiland doet als er niets gebeurt

### 7.1 Het verdwijnt niet, maar het kost niets

Het mag niet helemaal verdwijnen, om drie redenen die alle drie iets kosten als je
ze weghaalt:

- **Het is de deur.** Ctrl J is de sneltoets, maar een sneltoets zonder zichtbaar
  aangrijpingspunt is een functie die alleen bestaat voor wie hem al kent. De
  glyph in het plafond is het enige wat zegt dat deze browser assistenten heeft.
- **Het is het ankerpunt van de morph.** Een pil die uit het niets tevoorschijn
  komt is een melding; een pil die uit een glyph groeit is hetzelfde ding dat
  opengaat. Zonder ruststand is er geen morph, alleen een verschijning.
- **Het is het geheugen** (§7.3).

Maar het kost niets: nul paginapixels, nul IPC-aanroepen, en nul draaiende
tekenlussen. Dat laatste is verstillings §9.3 en de jury wees het aan: in
`glyph.js` vraagt de `default`-tak onvoorwaardelijk een nieuw frame aan, dus een
glyph in rust pulseert de hele dag zonder iets te melden. In rust wordt er één
frame getekend en verder niets, en `zet()` start de lus weer op als er een stand
binnenkomt die beweegt. Met drie assistenten in rust scheelt dat drie permanente
rAF-lussen; met drie werkende assistenten zijn het er drie die iets betekenen.

Er komt uitdrukkelijk **geen sluimerstand** waarin de balk na een paar minuten
helemaal wegvalt. Een element dat verdwijnt en terugkomt is een element dat je
elke keer opnieuw moet vinden, en de winst zou nul zijn: de ruststand kost al
niets van wat schaars is.

### 7.2 Wat het wél kost, eerlijk

De view is 407 pixels breed en 44 hoog, altijd. Die rechthoek ligt in het plafond
en vangt daar klikken — dus je kunt het venster in dat gebied niet verslepen en
er niet op dubbelklikken om te maximaliseren.

Twee dingen daarover:

- **Het is minder erg dan nu.** Vandaag is de view ongeveer 133 breed en 81 hoog
  en hangt hij 37px over de pagina. Dit ontwerp ruilt 37 paginapixels in voor
  ongeveer 270 extra plafondpixels. Plafond is chassis; pagina is werk.
- **Er blijft ruim sleepruimte over.** Bij een venster van 1280 ligt de view
  ongeveer van x=569 tot x=976. Links daarvan zit 569px sleepstrook (waarvan 264
  boven de zijbalk) en rechts ruim 150 tot aan de vensterknoppen.

`-webkit-app-region: drag` op de `body` van de balk zou die 407 pixels
terugkopen. **Niet geverifieerd, en waarschijnlijk werkt het niet:** Electron
verzamelt sleepgebieden voor de webContents van het venster zelf, en of dat ook
voor een kindview gebeurt weet ik niet. Het is één regel om te proberen en één
schermafdruk om te controleren; werkt het niet, dan is de conclusie hierboven de
uitkomst en niet een tegenvaller.

### 7.3 De naklank

`klaar` staat nu 8 seconden en verdwijnt dan spoorloos (`AGENT_STAPPEN`, laatste
stap, `ms: 8000`). Kijk je net niet, dan is er geen enkel spoor dat er iets
gebeurd is. Dat is de plek waar dit ontwerp één ontworpen moment neerlegt — de
jury verweet verstilling terecht dat er nergens plezier zit — en het mag niets
kosten en nergens knipperen:

```css
/* Eén streepje onder de glyph: hij heeft iets afgemaakt en jij hebt er nog niet
   naar gekeken. Geen puls, geen badge, geen kleurvlak. Het verdwijnt zodra je
   zijn tabblad opent, en verder nooit vanzelf. */
.glyphvak[data-naklank]::after {
  content: "";
  position: absolute;
  left: 50%;
  bottom: -1px;
  width: 14px;
  height: 2px;
  translate: -50% 0;
  border-radius: 1px;
  background: rgb(var(--modus-klaar));
}

.glyphvak[data-naklank="vraag"]::after { background: rgb(var(--modus-actie)); }
```

Het streepje valt binnen de plafondrij (de glyph loopt van y=9 tot y=35, het
streepje staat op y≈36) en kost dus geen enkele pixel extra. Het wordt gewist door
`island:reveal` en door een nieuwe opdracht aan dezelfde assistent.

### 7.4 Hoe het terugkomt

- **Ctrl J** (`app.js:53` → `browser.focusIsland()` → `focusIsland()`): opent het
  invoerveld als de balk dicht is, en zet de focus op de primaire knop als er al
  een vraag hangt. Een sneltoets mag je niet op Stop laten landen, en hij mag ook
  geen openstaande vraag wegdrukken.
- **Klikken op de pil** in rust doet hetzelfde.
- **Klikken op een glyph in de rail** maakt die assistent de spreker (§6.4).
- **Het hoofdproces** stuurt vanzelf een stand zodra een assistent iets doet.

Escape in het invoerveld gaat via `island:cancel` (§9) en niet lokaal. `naarRust()`
zet de balk nu op rust zonder het hoofdproces iets te vertellen (`island.js:46-58`),
dus een lopende assistent verdwijnt uit beeld en de balk corrigeert zichzelf pas
bij de volgende `sendIsland` — tot 3,2 seconden later. Dat is instruments
constatering (§7.5) en de reparatie hoort hier thuis.

---

## 8. De standen, één voor één

| Vorm | Plafondrij (y 0–44) | Hangstrook (y 44–92) | Glyph |
| --- | --- | --- | --- |
| `rust` | de rail, verder niets | — | `rust`, stil |
| `regel` | glyph · rail · regel · `Stop` | — | modus, bewegend |
| `klaar` | glyph · rail · regel · `Open tabblad` | — | `klaar` |
| `invoer` | glyph · veld | doel links, `Enter` `Esc` rechts | `invoer` |
| `vraag` | glyph · rail · de vraag | `Open zijn tabblad` `Ga door` ··· `Stop` | `actie` |
| `geblokkeerd` | waarschuwingsteken · wat er tegengehouden is | het schema · `Sluiten` | geen |

Vier besluiten die hierin zitten:

**`Stop` staat er in `regel` altijd, als tekstknop zonder vlak.** Er is nu geen
enkele manier om een assistent te stoppen zonder de balk te raken, en een knop die
pas bij hover verschijnt is geen noodstop. Als tekst op `--gevaar-tekst` zonder
achtergrond is hij ingetogen genoeg voor een balk die minutenlang open staat; bij
hover krijgt hij `--gevaar-vlak`.

**`Niet nu` verdwijnt.** In `actie` heet `#stop` nu "Niet nu" maar roept
`island:stop` → `stopAgent(false)` aan: timer gewist, opdracht weg, geen weg
terug. Uitstel beloven en afbreken leveren is de ergste knop in de app. Hij heet
`Stop`, hij staat rechts, met minstens 16px lucht ertussen. Dat is instruments
besluit (§7.5) en het is niet onderhandelbaar.

**De primaire knop bij `vraag` is `Open zijn tabblad`.** Bij "Inloggen nodig om
verder te kunnen" is doorgaan pas zinvol nádat je bent ingelogd, en dat kan alleen
in een tabblad dat je op dit moment niet kunt bereiken. Kanaal `island:reveal`.

**`geblokkeerd` heeft geen glyph maar een waarschuwingsteken.** Twee redenen. Hij
komt niet van een assistent — hij komt uit `setWindowOpenHandler` en
`grendelNavigatie` (`main.js:379` en `385`) — dus een assistenten-glyph zou liegen.
En de glyphkleur voor `zoeken` is rood (`glyph.js:9`, rgb 255 92 88); een tweede
rode glyph voor "geblokkeerd" zou niet te onderscheiden zijn. Dat `zoeken` de
enige modus is die op een foutkleur lijkt is een aparte kwestie voor de
modus-tokens; hier is het alleen de reden dat deze stand geen glyph krijgt.

---

## 9. Kanalen en preload

Vier kanalen erbij, allemaal `domein:actie` met een Engels werkwoord
(`CLAUDE.md`, `ROUTEKAART.md` §1.1). Drie ervan schreef instrument al uit (§7.5);
de vierde hoort bij meerdere assistenten.

| Kanaal | Richting | Payload | Waarvoor |
| --- | --- | --- | --- |
| `island:reveal` | balk → main, `invoke` | — | het tabblad van de spreker activeren. Zonder dit is "Klaar, kijk mee in zijn tabblad" een instructie zonder knop. |
| `island:dismiss` | balk → main, `invoke` | — | een `geblokkeerd`-melding wegklikken. Zonder dit blijft die balk staan: `stopAgent` keert bij `!this.agent` terug vóór de `sendIsland({modus:'rust'})` op `main.js:528`. |
| `island:cancel` | balk → main, `invoke` | — | het invoerveld annuleren, de werkelijke stand terugsturen en de focus teruggeven aan het actieve tabblad. |
| `island:select` | balk → main, `invoke` | `id` | een andere assistent de spreker maken. |

```js
// preload-island.js — de balk mag nog steeds geen tabbladen openen of
// navigeren; hij vraagt om standen en geeft opdrachten door.
toon: () => ipcRenderer.invoke('island:reveal'),
sluitMelding: () => ipcRenderer.invoke('island:dismiss'),
annuleer: () => ipcRenderer.invoke('island:cancel'),
kies: (id) => ipcRenderer.invoke('island:select', id),
```

Verder in `main.js`:

```js
// stopAgent stuurt de rusttoestand nu ná de vroege return, dus een melding die
// niet van een assistent komt blijft eeuwig staan. De balk moet altijd terug
// kunnen naar rust, ook als er niets liep.
ipcMain.handle('island:dismiss', (e) => controllerFor(e)?.sendIsland(RUST));
ipcMain.handle('island:reveal', (e) => controllerFor(e)?.revealAgentTab());
ipcMain.handle('island:cancel', (e) => controllerFor(e)?.cancelIsland());
ipcMain.handle('island:select', (e, id) => controllerFor(e)?.selectAgent(id));
```

En twee bestaande dingen erbij, die op de rechthoek slaan:

```js
// De vensterknoppen tekent het systeem rechtsboven; daar mag de balk nooit
// onder komen, anders kun je je venster niet meer sluiten zolang de assistent
// praat. Liever uit het midden dan onbereikbare knoppen.
// De 150 is een aanname (drie knoppen van 46px bij 100% schaling) en niet
// uitgemeten; titleBarOverlay zet wel de hoogte maar de breedte bepaalt het
// systeem.
const CAPTION_BREEDTE = 150;

layoutIsland() {
  if (!this.island) return;
  const { width } = this.win.getContentBounds();
  const links = SIDEBAR_WIDTH + 12;
  const rechts = width - (isMac ? 12 : CAPTION_BREEDTE);
  const w = Math.max(120, Math.min(this.islandSize.width, rechts - links));
  let x = Math.round(SIDEBAR_WIDTH + (width - SIDEBAR_WIDTH - w) / 2);
  x = Math.max(links, Math.min(x, rechts - w));
  this.island.setBounds({ x, y: 0, width: w, height: this.islandSize.height });
}
```

Doordat de breedte van de view constant is, is `x` dat ook — voor een gegeven
venstermaat. De pil hangt dus altijd op dezelfde as en verspringt nooit zijdelings
tijdens een morph, ook niet als de klem actief is. Dat is de tweede winst van de
regel uit §2, en het is de reden dat er nergens een uitlijningsafspraak tussen de
balk en het hoofdproces nodig is.

```js
// raiseIsland mag zijn removeChildView kwijt: de typings zeggen expliciet dat
// addChildView een view die de ouder al bevat naar boven herordent
// (electron.d.ts:14224-14229). Nu wordt de balk bij élk nieuw tabblad kort uit
// de vensterboom gehaald, precies op het moment dat er al beweging in beeld is.
raiseIsland() {
  if (this.island) this.win.contentView.addChildView(this.island);
}
```

En één die niemand noemde: **de commandobalk.** `#palette` is HTML in de
zijbalk-renderer en dus een laag ónder alle kindviews, dus de balk tekent er
dwars overheen — een pil die boven een modale scrim zweeft, en in de hangende
standen bedekt hij ook nog de bovenkant van de kaart. `setPaletteOpen` neemt de
pagina al weg; laat hem de balk meenemen:

```js
setPaletteOpen(open) {
  this.paletteOpen = Boolean(open);
  this.tabs.get(this.activeId)?.setVisible(!this.paletteOpen);
  // De balk is een kindview en tekent dus over de commandobalk heen. Verbergen
  // is hier goedkoper en eerlijker dan dimmen: het palet is modaal.
  this.island.setVisible(!this.paletteOpen);
  if (!this.paletteOpen) this.raiseIsland();
}
```

---

## 10. `island.css`, in zijn geheel

Wat hieronder staat vervangt `renderer/island.css`. Het gaat ervan uit dat
`island.html` eerst `tokens.css` laadt, zoals `ui-systeem.md` §10 voorschrijft —
daar komen `--modus-*`, `--accent`, `--radius-control`, `--ease-zacht` en
`--overgang-vlak` vandaan.

```css
:root {
  /* Chassis. Gelijk aan style.css; loopt er één uiteen, dan valt de gegoten
     aansluiting zichtbaar uit elkaar. */
  --plafond-hoogte: 44px;
  --holte: 13px;
  --hoek: 18px;

  --plafond-tekst: #f2f4f7;
  /* Was #6f757e: ongeveer 3,8:1 op --plafond, met de hand gerekend volgens WCAG
     en niet gemeten. Dit is de enige plek in de app met een gegarandeerde
     ondoorzichtige ondergrond, en dus de enige zonder excuus. */
  --plafond-zacht: #949ba6;
  --gevaar-vlak: #46232a;
  --gevaar-tekst: #ff8078;

  --glyph: 26px;
  --rail-gap: 8px;
  --vulling-x: 15px;
  --binnen: 10px;
  --knoprij: 28px;

  --b-open: 380px;
  --b-vak: calc(100vw - var(--holte) * 2);
  --h-dicht: var(--plafond-hoogte);
  --h-open: calc(var(--plafond-hoogte) + var(--binnen) * 2 + var(--knoprij));

  --duur-morph: 240ms;
  --fase-morph: 60ms;
  --duur-wissel: 110ms;
}

* { box-sizing: border-box; margin: 0; }

body {
  /* Doorzichtig: alleen de pil en zijn hoekjes mogen zichtbaar zijn. De rest van
     deze laag laat het plafond en de pagina eronder door. */
  background: transparent;
  color: var(--plafond-tekst);
  font: 13px/1.45 var(--font-text);
  letter-spacing: -0.006em;
  -webkit-font-smoothing: antialiased;
  overflow: hidden;
  user-select: none;

  /* De pil hangt aan de middellijn van het paginagebied. Gecentreerd en niet
     links uitgelijnd, want de view is altijd breder dan de pil (zie §2) en dan
     zou de pil bij elke breedtewissel opzij schuiven. */
  display: grid;
  justify-content: center;
  align-content: start;

  /* ONGEVERIFIEERD, zie §13: als sleepgebieden ook voor een kindview verzameld
     worden, geeft dit de plafondstrook terug aan het venster. */
  -webkit-app-region: drag;
}

/* De doos waarin de pil en zijn twee aansluitingen samen leven; zie §3.4. */
#vorm {
  position: relative;
  padding: 0 var(--holte);
  overflow: hidden;
  -webkit-app-region: no-drag;
}

#vorm::before,
#vorm::after {
  content: "";
  position: absolute;
  top: var(--plafond-hoogte);
  width: var(--holte);
  height: var(--holte);
}

#vorm::before {
  left: 0;
  background: radial-gradient(circle var(--holte) at 0 100%,
    transparent var(--holte), var(--plafond) calc(var(--holte) + 0.5px));
}

#vorm::after {
  right: 0;
  background: radial-gradient(circle var(--holte) at 100% 100%,
    transparent var(--holte), var(--plafond) calc(var(--holte) + 0.5px));
}

/* Dit is het enige element dat van maat verandert. De inhoud staat er op
   eindmaat in en wordt onthuld; overflow: hidden is wat dat mogelijk maakt.
   island.js animeert width en height met Element.animate, dus hier staan alleen
   de rustwaarden. */
#kaart {
  width: min(var(--b-doel), var(--b-vak));
  height: var(--h-doel);
  overflow: hidden;
  background-color: var(--plafond);
  border-radius: 0 0 var(--hoek) var(--hoek);
}

#vorm[data-vorm] { --b-doel: min(var(--b-open), var(--b-vak)); --h-doel: var(--h-dicht); }
#vorm[data-open="true"] { --h-doel: var(--h-open); }

#vorm[data-rail="1"] { --n: 1; }
#vorm[data-rail="2"] { --n: 2; }
#vorm[data-rail="3"] { --n: 3; }
#vorm[data-rail="meer"] { --n: 3; --extra: calc(var(--rail-gap) + 22px); }

#vorm[data-vorm="rust"] {
  --b-doel: calc(
    var(--vulling-x) * 2 + var(--glyph) * var(--n) +
    var(--rail-gap) * (var(--n) - 1) + var(--extra, 0px)
  );
}

/* Precies zo hoog als het plafond, en altijd bovenaan: daardoor ligt het midden
   van de glyph in elke vorm op y=22 zonder dat er iets uitgerekend wordt. */
#plafondrij {
  height: var(--plafond-hoogte);
  width: min(var(--b-open), var(--b-vak));
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 0 var(--vulling-x);
}

#hangstrook {
  height: calc(var(--binnen) * 2 + var(--knoprij));
  width: min(var(--b-open), var(--b-vak));
  display: flex;
  align-items: center;
  gap: 10px;
  padding: var(--binnen) var(--vulling-x);
  font-family: var(--font-small);
  font-size: 12px;
  color: var(--plafond-zacht);
}

#hangstrook > * {
  opacity: 0;
  translate: 0 -6px;
  transition: opacity var(--duur-wissel) var(--ease-zacht),
              translate var(--duur-wissel) var(--ease-zacht);
}

#vorm[data-open="true"] #hangstrook > * {
  opacity: 1;
  translate: 0 0;
  transition-delay: 100ms;
}

/* De rail: gewone flexitems van vaste maat, in élke vorm 26px. Geen tweede maat
   en geen absolute positionering, want dan hoeft er in de morph niets over de
   rail te worden uitgerekend. */
#rail { display: flex; align-items: center; gap: var(--rail-gap); flex: none; }

.glyphvak {
  position: relative;
  width: var(--glyph);
  height: var(--glyph);
  flex: none;
}

.glyphvak canvas { display: block; width: 100%; height: 100%; }

.glyphvak[data-naklank]::after {
  content: "";
  position: absolute;
  left: 50%;
  bottom: -1px;
  width: 14px;
  height: 2px;
  translate: -50% 0;
  border-radius: 1px;
  background: rgb(var(--modus-klaar));
}

.glyphvak[data-naklank="vraag"]::after { background: rgb(var(--modus-actie)); }

/* Twee dingen op één plek, zodat een wissel een kruising is en geen sprong. */
#midden { display: grid; flex: 1; min-width: 0; }

#midden > * {
  grid-area: 1 / 1;
  min-width: 0;
  transition: opacity var(--duur-wissel) var(--ease-zacht),
              translate var(--duur-wissel) var(--ease-zacht);
}

#midden > [hidden] {
  display: block;
  opacity: 0;
  translate: 0 4px;
  pointer-events: none;
}

#regel {
  font-size: 14px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

#regel.wisselt { opacity: 0; translate: 0 -4px; }

/* Geen breedte uit size=20 meer: het veld vult de kolom van een pil met een
   vaste breedte. Dat is meteen de sprong van ~109 naar ~226px kwijt. */
#invoer {
  height: 22px;
  border: 0;
  background: none;
  color: var(--plafond-tekst);
  caret-color: var(--accent);
  font: inherit;
  font-size: 14px;
}

#invoer::placeholder { color: var(--plafond-zacht); }
#invoer:focus { outline: none; }
#invoer, #invoer::placeholder { user-select: text; }

/* De knoppen hadden geen enkele overgang terwijl alles in de zijbalk 120 tot
   140ms doet — dat leest als een ander programma, op de plek waar je onder
   tijdsdruk op Stop moet drukken. */
.knop {
  flex: none;
  border: 0;
  border-radius: var(--radius-control);
  padding: 5px 11px;
  font-family: var(--font-small);
  font-size: 12px;
  font-weight: 500;
  color: var(--plafond-tekst);
  background-color: transparent;
  cursor: default;
  transition: var(--overgang-vlak);
}

.knop--sterk { background-color: var(--accent); color: var(--on-accent); }
.knop--sterk:hover { filter: brightness(1.08); }

/* Ingetogen genoeg voor een balk die minutenlang open staat, en toch altijd
   aanwezig: een noodstop die pas bij hover verschijnt is geen noodstop. */
.knop--gevaar { color: var(--gevaar-tekst); }
.knop--gevaar:hover { background-color: var(--gevaar-vlak); }

/* Minstens 16px tussen gevaarlijk en primair (ui-systeem §7.1). */
.knop--gevaar { margin-left: auto; }
#hangstrook .knop--gevaar { margin-left: 16px; }

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation: none !important;
    transition: none !important;
  }
  /* De vorm wisselt dan in één stap, maar de volgorde van §5.4 blijft staan:
     eerst ruimte, dan tekenen, of andersom. Dat is geen beweging maar het
     voorkomen van geknipte inhoud. island.js zet DUUR en FASE op 0. */
}
```

---

## 11. Toegankelijkheid en reduced motion

**Live region.** `#regel` krijgt `aria-live="polite"` en `aria-atomic="true"`. De
regel wisselt elke paar seconden; `polite` is dan het maximum, `assertive` zou een
schermlezer bij elke stap onderbreken. In `rust` staat de regel leeg, dus er wordt
niets aangekondigd als er niets gebeurt.

**Toetsenbord.** De balk is een eigen `WebContentsView`, dus Tab vanuit de zijbalk
komt er nooit in en Tab erbinnen komt er nooit uit. De enige ingang is `Ctrl J`
(`focusIsland()` → `webContents.focus()` plus `island:focus`) en de enige uitgang
is Escape → `island:cancel`, waarna het hoofdproces de focus teruggeeft aan het
actieve tabblad. Zolang dat zo is:

- `Ctrl J` landt op het invoerveld als de balk dicht is, en op de primaire knop
  als er een vraag hangt. Nooit op `Stop`.
- De hangstrook krijgt `inert` zodra hij geklipt is, anders staan er
  onbereikbare knoppen in de tabvolgorde. `[hidden]` kan niet, want dan is er
  niets om mee te kruisen (§4.3).
- Focusringen volgen `ui-systeem.md` §8: `:focus-visible` met
  `outline: 2px solid var(--accent); outline-offset: 2px`. Op het donkere plafond
  is dat zichtbaar; het is de enige plek in de app waar de ondergrond bekend is.

**Reduced motion.** Het CSS-blok zet alle transities uit. Twee dingen die het niet
regelt en die hier expliciet horen:

1. **Het protocol blijft draaien.** `DUUR` en `FASE` worden 0, maar `naarVorm()`
   houdt zijn volgorde: eerst ruimte vragen bij het openen, pas ruimte teruggeven
   bij het sluiten. Dat is geen beweging maar het voorkomen van een geknipt of een
   klikvangend frame, en het is dus geen animatie om uit te zetten. Eén codepad,
   twee snelheden.
2. **De glyph is een canvas en trekt zich van CSS niets aan.** `ui-systeem.md`
   §6.5 schrijft al voor wat er moet gebeuren: één frame op een vaste `t`, geen
   nieuw frame aanvragen, opnieuw tekenen bij `zet()` en bij een wijziging van
   `matchMedia`. In dit ontwerp valt dat samen met de ruststand-optimalisatie uit
   §7.1 — dezelfde `loopt`-vlag doet beide.

**Contrast.** `--plafond-zacht` gaat van `#6f757e` naar `#949ba6` (ongeveer 3,8:1
naar ongeveer 6,3:1 op `--plafond`, met de hand gerekend en niet gemeten). Dat is
instruments §7.2 en het is terecht: dit is de enige plek in de app met een
gegarandeerde ondoorzichtige ondergrond.

---

## 12. Volgorde van invoeren

Elke stap is op zichzelf verzendbaar en laat de app werkend achter. De volgorde is
gekozen zodat het gevaarlijke deel (§5) pas komt als het meetbare deel er al is.

1. **De klem en het vangnet** — `setIslandSize` op `Math.max(TOPBAR_HEIGHT, …)`,
   `did-finish-load` op de island-view zet de hoogte terug, `raiseIsland` zonder
   `removeChildView`, `layoutIsland` met de klem op de vensterknoppen. Een half
   uur, en de balk hangt nog exact zoals hij hing.
2. **De vorm zonder morph** — `island.html` en `island.css` vervangen, `island.js`
   zet `data-vorm` en `data-open` en meldt de hoogte in één stap, zonder
   `Element.animate`. Nu is de ruststand al nul paginapixels en staan de holle
   hoekjes goed. Dit is de grootste zichtbare winst en de kleinste risico's.
3. **De inhoudsovergangen** — regelwissel, de kruising in `#midden`, de
   hangstrook die arriveert en vertrekt. Puur CSS plus tien regels JS.
4. **Het protocol** — §5.3 tot §5.5. Meet hier het punt uit §5.3 (surface
   synchronisation) en het punt uit §13 (`-webkit-app-region`) vóórdat je verder
   gaat.
5. **De morph** — §4.1, de twee sporen met faseverschil.
6. **De vier kanalen** — `island:reveal`, `island:dismiss`, `island:cancel`,
   `island:select`, plus `setPaletteOpen` die de balk meeneemt.
7. **De rail voor één assistent** — de plafondrij als flexrij met één `.glyphvak`,
   `[data-rail="1"]`, plus de naklank. Nog geen tweede assistent, wel de bouw
   ervoor.
8. **Meerdere assistenten** — §6.5 in `main.js`, en dan pas §6.3 in de balk.

Stap 1 en 2 samen zijn ongeveer een dag en halen de 37 pixels weg die er nu
permanent over elke website liggen. Als er maar één ding gebeurt, dan die twee.

---

## 13. Wat ik niet geverifieerd heb

- **`-webkit-app-region: drag` in een kindview.** Of Electron sleepgebieden ook
  verzamelt voor de webContents van een `WebContentsView` weet ik niet; ik vermoed
  van niet. §7.2 rekent voor dat het ontwerp ook zonder klopt.
- **Surface synchronisation bij `setBounds()`.** Of het eerste frame dat na een
  `resize` getekend wordt gegarandeerd samen met de nieuwe rechthoek
  gecomposit wordt. Zie §5.3 voor waarom een tegenvaller hier alleen bij het
  openen zichtbaar zou zijn, en dan als één frame plafondkleur.
- **`linear()` in Electron 33.** Gedocumenteerd vanaf Chromium 113, dus aanwezig
  in Chromium 130; niet in deze app gedraaid.
- **`Element.animate` op `width` en `height`.** Correct volgens de spec, maar dit
  is layout per frame op één element met acht kindknopen. Dat hoort ruim te
  kunnen; meet het één keer met drie draaiende glyphs erin. Valt het tegen, dan
  is de uitweg de pil in drie delen te tekenen (twee vaste kapjes met de radii,
  een middendeel met `scaleX`) — volledig gecomposit, maar drie elementen in
  plaats van één, en de hoogte moet dan met `clip-path` in plaats van met
  `height`. Doe dat niet vooraf.
- **`inert`.** Chromium 102+, dus aanwezig; niet in deze app gebruikt.
- **`el.style.setProperty()` onder `style-src 'self'`.** Dit ontwerp gebruikt het
  nergens — de vormtabel loopt via `[data-vorm]` en `[data-rail]`, precies om deze
  onzekerheid te vermijden. Maar `glyph.js` gaat de `--modus-*`-tokens wél met
  `getComputedStyle` lezen (jury-besluit, `richting-materiaal.md` §2.6), en dat is
  een leesactie en geen schrijfactie; die valt sowieso buiten CSP.
- **De `CAPTION_BREEDTE` van 150.** Aanname: drie knoppen van 46px bij 100%
  schaling. `titleBarOverlay` zet wel de hoogte (`main.js:44`) maar de breedte
  bepaalt het systeem.
- **`parseFloat` op tokens met eenheid.** `"240ms"` levert 240 en `"44px"` levert
  44; dat werkt, maar het leunt op de vorm van de waarde.

Wel geverifieerd, in `node_modules/electron/electron.d.ts`: de klasse `View`
begint op 14207 en heeft `bounds-changed` (14216–14220), `setBorderRadius` met de
notitie dat de uitsparing klikken blijft vangen (14269–14271), `setBounds` zonder
animatievlag (14272 — tegenover `BaseWindow.setBounds(bounds, animate?)` op 2982
en `BrowserWindow` op 5591), `addChildView` dat een bestaande kindview naar boven
herordent (14224–14229), en géén `setIgnoreMouseEvents` — die staat alleen op
`BaseWindow` (3068) en `BrowserWindow` (5681).

---

## 14. Wat dit niet oplost

- **Er is nog geen logboek.** `#vorige` verdwijnt (§4.4) en de geschiedenis van
  een assistent hoort in een zevende vorm — dezelfde pil, maar met een hangstrook
  die de laatste vijf regels draagt in plaats van een knoprij. De bouw ligt er
  (`--h-open` wordt dan een tweede waarde, de hangstrook een kolom), maar zolang
  de assistent `AGENT_STAPPEN` is valt er niets te loggen dat je niet net gezien
  hebt.
- **De assistent is nog geen model.** Alles hierboven werkt tegen `AGENT_STAPPEN`
  en verandert niet als er een echt model achter komt — met één uitzondering: een
  echt model levert veel meer standwissels per minuut, en dan wordt de
  50ms-debounce uit `ROUTEKAART.md` §1.10 op `pushIsland()` een eis in plaats van
  een verbetering.
- **De rustglyph is nog geen ingang naar instellingen.** Er is nergens een
  instellingenscherm of een knop ernaartoe, en dat is terecht opgemerkt — maar het
  eiland is er de plek niet voor. Het gaat over wat er nú gebeurt, niet over hoe
  de app is ingesteld. Die knop hoort in de knoprij van de zijbalk
  (`richting-instrument.md` §5.2).
- **Split view.** Zodra er twee pagina's naast elkaar staan verandert de vraag
  waar de as van de pil ligt volledig. `layoutIsland()` centreert nu over één
  paginagebied; met twee is er geen midden meer. Dat is een eigen ontwerp.
- **Twee vensters.** De balk kent alleen zijn eigen venster. Dat is nu al zo.
- **De rode glyph voor `zoeken`.** Rood betekent in elk besturingssysteem "fout",
  en `zoeken` is geen fout. Dit document ontwijkt het probleem alleen (§8:
  `geblokkeerd` krijgt geen glyph); oplossen hoort bij de `--modus-*`-tokens.
