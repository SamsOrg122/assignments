# Bouwplan: het visuele werk en de MCP-connector

Dit document beslist. De negen ontwerpen eronder beschrijven; dit zegt wat er
gebouwd wordt, in welke volgorde, en wat er niet gebouwd wordt.

Het bouwt voort op `ui-systeem.md` (lagen, tokens, typografie, radii, glas,
beweging, `prefers-reduced-motion`) en herhaalt daar niets van. De drie
richtingsdocumenten, `tabblad-animaties.md`, `eiland-verfijning.md`,
`instellingen-scherm.md`, `mcp-connector.md` en `mcp-beveiliging.md` blijven
staan als uitwerking; waar dit document ervan afwijkt staat de reden erbij.

Alles is geschreven tegen **Electron 33.4.11 (Chromium 130)**. Waar een API niet
in deze app gedraaid is, staat dat er expliciet bij, en §6 verzamelt het.

---

## 1. De richting

### 1.1 In één alinea

**Verstilling.** De zijbalk wordt één kolom met één rijhoogte, één rail waar alle
inkt op begint, en precies één verheven vlak in beeld — het actieve tabblad. De
hiërarchie komt uit gewicht (400 tegenover 500) en uit tekstkleur, niet uit
gestapelde vullingen; er is geen tweede statuskleur naast een signaal dat al
kleur draagt; er beweegt niets zolang er niets gebeurt. Het eiland zit in rust
volledig ín het plafond en kost nul paginapixels. Wat verstilling zelf niet
oplost — hij is te zwak in het lichte thema, hij is afhankelijk van
venstermateriaal dat we niet in de hand hebben, en hij levert bijna geen
tabbladanimatie op, wat de helft van de opdracht was — wordt gerepareerd met drie
gerichte ingrepen uit de twee verliezers: een zijbalkplaat met bekende
helderheid, een gedeeld overgangsrecept met een bijna kritisch gedempte curve, en
FLIP met `Element.animate` op uitsluitend `transform`.

### 1.2 Wat er uit materiaal mee gaat

| Uit | Wat | Waar het landt |
| --- | --- | --- |
| §4.3 | `#sidebar { background-color: var(--zijbalk) }` plus `box-shadow: inset -1px 0 0 var(--rand-kant)` | stap 2 |
| §4.3 | `box-shadow: var(--schaduw-plafond)` op `#drag-strip` | stap 2 |
| §2.3 | de vier `inset`-schaduwen als één `--rand`-token, op elke aanwijsbare rij | stap 2 |
| §2.3 | de dure rim (`::before` + `mask-composite: exclude`), **één instantie**, op `#plaat` | stap 5 |
| §2.4 | schaduwen met negatieve spread | stap 1 |
| §2.6 | `--modus-*` als losse kanalen, `glyph.js` leest ze met `getComputedStyle` | stap 1 + stap 6 |
| §4.6 | `.ws .close` van `display: none` naar `opacity: 0` + `pointer-events: none` | stap 11 |
| §5.5 | `merk.onerror = () => merk.removeAttribute('src')` | stap 6 |
| §7.1 | `--ease-zacht` (`linear()`, ζ=0.90, ω₀=26) als de enige curve, en `--overgang-vlak` als het enige overgangsrecept — mét `opacity` erin | stap 1 |

### 1.3 Wat er uit instrument mee gaat

| Uit | Wat | Waar het landt |
| --- | --- | --- |
| §1.2 | FLIP met `Element.animate` op alleen `transform`, een eenmalige intree-klasse, en géén uittree | stap 5 |
| §5.1b | het gegoten hoekje bij (264, 44) via `#drag-strip::after` | stap 2 |
| §5.2 | `#reload` wordt een stopknop zolang `tab.loading` waar is | stap 7 |
| §6.3 | `role="listbox"` op `#tablist`, `role="option"` + `aria-selected` op de rijen, één tabstop, `aria-activedescendant` | stap 5 |
| §6.5 | de titel van een ladend tabblad zakt één trede | stap 6 |
| §7.4c | de glyph als vast verticaal anker in alle eilandvormen | stap 8 |
| §7.5 | `island:reveal`, `island:dismiss`, `island:cancel` | stap 10 |
| §7.7 | de klem van `layoutIsland()` op de breedte van de vensterknoppen | stap 8 |
| §10 | de volgorde van invoeren: tokens → typografie → rail → verzoening → tabblad → voet → eiland | §2 |

### 1.4 Wat er uitdrukkelijk niet mee gaat

- `--ease-veer` (420ms, 4,6% doorschot) op wat dan ook. Eén curve in de hele app.
- `@keyframes aandacht` — een oneindig pulserende modusrand op een lijstrij.
- De gekleurde onderrand per assistentrij, en de kraal met radial-gradient
  lichtpunt.
- Instruments monogrammen, de sectiekop `TABBLADEN 7` in kapitalen, en de
  voortgangslijn van 1,1s onder de actieve rij.
- Verstillings `.tab:hover .merk { opacity: 0 }`. Het favicon is waarop je scant;
  dat mag niet doven onder je cursor. Het sluitkruisje houdt zijn eigen plek in
  de flexrij en kost daarmee permanent ~20px titelbreedte. Dat is de goede prijs:
  ruimte betalen is goedkoper dan verf betalen, en het verschuift nooit.
- Verstillings dichtgeklapte workspacelijst. De contextwissel is de kernfunctie;
  die verstop je niet achter een chevron.
- Instruments tweelaagse adresbalk met `color: transparent` op de `<input>`. Zie
  §1.5.

### 1.5 Vier plekken waar de bronnen elkaar tegenspreken, en hoe ik het beslecht

Dit is het deel dat een bouwplan moet doen en dat een ontwerpdocument niet kan.

**1. De zijbalkplaat.** De jury zegt op één plek "niet stelen: de `--zijbalk`-plaat
onder `#sidebar`, die slaat het venstermateriaal dood" en op een andere plek "dit
is de belangrijkste diefstal: `#sidebar { background-color: var(--zijbalk) }`".

*Besluit: de plaat komt er, op lage alfa.* Het bezwaar geldt materiaals eigen
waarden (.16 licht / .03 donker), niet het idee. `--zijbalk: rgba(255,255,255,.10)`
in licht laat het bureaublad ruim leven, geeft twintig regels tekst een bekende
ondergrond, en is het enige dat overblijft als `backgroundMaterial: 'acrylic'`
niet gehonoreerd wordt. Prijs: de drie vullingsalfa's moeten opnieuw geijkt,
tegen vier achtergronden (lichte foto, donkere foto, effen wit, transparantie
uit). Reken op een middag.

*Eerlijk erbij:* in het donkere thema koopt `rgba(255,255,255,.02)` vrijwel geen
verzekering. De echte verzekering daar is de terugvalkleur van het venster zelf —
`backgroundColor: '#00000000'` (`main.js:101`) levert bij uitgeschakelde
transparantie geen bekende grond op. Dat is een aparte reparatie en hij staat in
§6 als meting, niet als aanname.

**2. De adresbalk.** Instrument §5.3 legt een `#adres-weergave` over de input en
maakt de inputtekst transparant; verstilling §4 wisselt de wáárde (host in rust,
volledige URL bij focus). De jury noemt allebei, en kiest later expliciet voor
verstilling.

*Besluit: de waardewissel, met één toevoeging.* `kortAdres()` gooit bij
verstilling het pad weg, en daar had instrument gelijk in: je ziet dan niet meer
op welke pagina van een site je bent. Dus:

```js
// In rust host + pad, bij focus de volledige URL. Eén laag, één waarheid: een
// tweede weergave-element betekent color: transparent op een <input> en twee
// weergaven van dezelfde waarde die uit elkaar kunnen lopen zodra het veld
// horizontaal scrolt. Wat we daarmee opgeven is het verschil in gewicht tussen
// host en pad — dat kan niet binnen één input, en het is de goedkoopste helft.
function kortAdres(url) {
  try {
    const u = new URL(url);
    // Bij een interne pagina is het schema juist het informatieve deel.
    if (u.protocol === 'tougather:') return url;
    const host = u.host.replace(/^www\./, '');
    const pad = u.pathname === '/' ? '' : u.pathname;
    return (host + pad).slice(0, 90);
  } catch {
    return url;
  }
}
```

`focus` zet `huidigeUrl` terug en selecteert; `blur` zet `addressIsDirty = false`
en herstelt `kortAdres(huidigeUrl)`. Dat repareert meteen dat half getypte invoer
nu blijft staan terwijl de pagina doornavigeert.

**3. De hoogte van het eiland.** De jury vraagt om instruments morph 44 → 51 → 44.
`eiland-verfijning.md` §3.2 wijst 51 af.

*Besluit: 44 → 92, en het is een afwijking van de jury met een reden.* De zeven
pixels van instrument bestonden om `#vorige` kwijt te kunnen, en `#vorige`
verdwijnt (`eiland-verfijning.md` §4.4: de vorige regel vertelt niets dat je niet
net gelezen hebt). Zeven pixels van elke website permanent onklikbaar voor een
strook waar niets in past, is de slechtste van beide werelden. Het *principe* van
de jury blijft volledig staan: de hoogte mag meebewegen, de breedte niet, en de
breedte is vast per vorm. Alleen doet de hoogte dan ook iets — een echte
knoprij met de 16px lucht tussen gevaarlijk en primair die `ui-systeem.md` §7.1
eist. Vier van de zes vormen blijven op 44 en kosten nul paginapixels; alleen
`invoer`, `vraag` en `geblokkeerd` hangen, en dat zijn precies de drie waarin het
eiland iets van jóú wil.

**4. De workspacekleuren.** De jury verwerpt verstillings aardetinten en vraagt om
Apple's verzadigde palet; materiaal §2.6 eist drie paletten die elkaar nergens
raken.

*Besluit: het bestaande Apple-palet blijft, met één substitutie.* `--ws-0` was
letterlijk `#007aff`, dus letterlijk `--accent` — dat is de botsing die telt,
want de plaat van het actieve tabblad en de stip van de eerste workspace staan in
dezelfde kolom. `--ws-0` wordt systemIndigo. De overlap tussen het
workspace-palet en de modus-kleuren blijft bestaan en dat is bewust: die twee
delen nooit een oppervlak (modus zit op een canvas van 16px in een tabbladrij en
in het eiland, workspace op een stip in de voet), en er een derde uitgevonden
palet tegenaan gooien is precies waar de jury verstilling op afrekende.

### 1.6 De tokens die hieruit volgen

Nieuw bestand `renderer/tokens.css`, als eerste stylesheet geladen door
`index.html`, `island.html` en `newtab.html` (`ui-systeem.md` §10). Alleen wat
nieuw of gewijzigd is staat hier; de rest komt woordelijk uit `ui-systeem.md` §2
en `richting-verstilling.md` §3.2.

```css
:root {
  /* --- de plaat onder de kolom ------------------------------------------- */
  /* Laag genoeg om het venstermateriaal te laten leven, hoog genoeg om twintig
     regels tekst een bekende ondergrond te geven. Dit is de enige verzekering
     als backgroundMaterial: 'acrylic' niet gehonoreerd wordt. */
  --zijbalk: rgba(255, 255, 255, 0.10);

  /* --- vlakken, opnieuw geijkt tegen die plaat --------------------------- */
  /* Verstilling §3.2 zet deze op .16/.26/.46; dat was gerekend zonder plaat en
     de jury noemt het lichte thema daarmee terecht de zwakke helft. */
  --fill: rgba(255, 255, 255, 0.22);
  --fill-hover: rgba(255, 255, 255, 0.34);
  --fill-active: rgba(255, 255, 255, 0.62);
  --muted: rgba(0, 0, 0, 0.58);   /* was .46; dit is de tekst die je scant */

  /* --- de rand ------------------------------------------------------------ */
  /* Licht komt van boven: de bovenrand vangt het vol, de zijkanten strijkend,
     de onderrand krijgt alleen wat terugkaatst. Een lijn die uitdooft is een
     afschuining; een gelijkmatige lijn is een omlijning. */
  --rand-top: rgba(255, 255, 255, 0.92);
  --rand-zij: rgba(255, 255, 255, 0.42);
  --rand-bodem: rgba(255, 255, 255, 0.16);
  --rand-kant: rgba(0, 0, 0, 0.06);
  --rand:
    inset 0 1px 0 var(--rand-top),
    inset 1px 0 0 var(--rand-zij),
    inset -1px 0 0 var(--rand-zij),
    inset 0 -1px 0 var(--rand-bodem);

  /* --- schaduw ------------------------------------------------------------ */
  /* Negatieve spread: de schaduw begint kleiner dan zijn element en waaiert dan
     pas uit. Zonder dat wordt het op een licht bureaublad een grijze vlek. */
  --schaduw-rij: 0 1px 2px rgba(0, 0, 0, 0.05), 0 6px 14px -4px rgba(0, 0, 0, 0.10);
  --schaduw-card: 0 2px 6px rgba(0, 0, 0, 0.07), 0 24px 56px -12px rgba(0, 0, 0, 0.24);
  --schaduw-plafond: 0 6px 14px -6px rgba(0, 0, 0, 0.34);
  --shadow-press: inset 0 1px 2px rgba(0, 0, 0, 0.09);

  /* --- beweging ----------------------------------------------------------- */
  --duur-tik: 120ms;
  --duur-vlak: 140ms;
  --duur-rij: 160ms;
  --duur-wissel: 200ms;
  --duur-morph: 240ms;
  --fase-morph: 60ms;

  /* Bijna kritisch gedempt: ζ=0.90, ω₀=26, uitgerekend voor 280ms, bemonsterd
     op twaalf punten. Remt af zonder zichtbaar door te schieten. De 1.001 op
     91,7% is 0,1% doorschot — op 380px is dat 0,4 pixel. */
  --ease-zacht: linear(
    0, 0.128 8.3%, 0.361 16.7%, 0.578 25%, 0.742 33.3%, 0.853 41.7%,
    0.923 50%, 0.963 58.3%, 0.984 66.7%, 0.995 75%, 1 83.3%, 1.001 91.7%, 1
  );

  /* Eén recept, zodat niemand ooit nog per selector een lijst schrijft. Met
     opacity erin: op #controls button is het verschil tussen aan en uit juist
     opacity: 0.32, dus zonder dit knipperen terug en vooruit hard bij élke
     navigatie. En overal background-color, nooit background, anders loopt de
     glans op het ene element wel mee en op het andere niet. */
  --overgang-vlak:
    background-color var(--duur-vlak) var(--ease-zacht),
    color var(--duur-vlak) var(--ease-zacht),
    box-shadow var(--duur-vlak) var(--ease-zacht),
    opacity var(--duur-vlak) var(--ease-zacht);

  /* --- workspaces --------------------------------------------------------- */
  /* --ws-0 was #007aff en dus letterlijk --accent. De plaat van het actieve
     tabblad en de stip van de eerste workspace staan in dezelfde kolom; dat is
     de enige botsing die er werkelijk toe doet. */
  --ws-0: #5856d6;
  --ws-1: #ff9500;
  --ws-2: #34c759;
  --ws-3: #af52de;
  --ws-4: #ff2d55;
  --ws-5: #32ade6;

  /* --- modi van de assistent ---------------------------------------------- */
  /* Als kanalen, zodat glyph.js ze met getComputedStyle kan lezen én CSS ze via
     rgb(var(--modus-x)) kan gebruiken. Eén bron voor het canvas en voor CSS,
     zonder build-stap, zoals CLAUDE.md eist. Voorwaarde: island.html laadt
     dezelfde tokens.css. Deze acht staan buiten de licht/donker-blokken: ze
     worden altijd op --plafond of op een gloeiend canvas getekend. */
  --modus-rust: 138 146 162;
  --modus-invoer: 168 178 196;
  --modus-debuggen: 92 156 255;
  --modus-zoeken: 255 92 88;
  --modus-lezen: 244 198 70;
  --modus-analyseren: 58 206 150;
  --modus-actie: 255 148 38;
  --modus-klaar: 58 206 150;
}

@media (prefers-color-scheme: dark) {
  :root {
    --zijbalk: rgba(255, 255, 255, 0.02);
    --fill: rgba(255, 255, 255, 0.06);
    --fill-hover: rgba(255, 255, 255, 0.10);
    --fill-active: rgba(255, 255, 255, 0.16);
    --muted: rgba(255, 255, 255, 0.56);

    --rand-top: rgba(255, 255, 255, 0.16);
    --rand-zij: rgba(255, 255, 255, 0.07);
    --rand-bodem: rgba(255, 255, 255, 0.03);
    --rand-kant: rgba(0, 0, 0, 0.30);

    --schaduw-rij: 0 1px 2px rgba(0, 0, 0, 0.30), 0 8px 18px -5px rgba(0, 0, 0, 0.45);
    --schaduw-card: 0 2px 8px rgba(0, 0, 0, 0.40), 0 28px 64px -14px rgba(0, 0, 0, 0.62);
    --schaduw-plafond: 0 6px 16px -6px rgba(0, 0, 0, 0.62);

    --ws-0: #5e5ce6;
    --ws-1: #ff9f0a;
    --ws-2: #30d158;
    --ws-3: #bf5af2;
    --ws-4: #ff375f;
    --ws-5: #64d2ff;
  }
}
```

`--assistent` (`#ff9f0a`) verdwijnt. Dat token bestond voor `.tab .bezig`, en dat
stipje verdwijnt in stap 6: de glyph zegt al dat er iets gebeurt én wat.

---

## 2. De volgorde

Elke stap is op zichzelf verzendbaar en laat de app werkend achter. De duren zijn
ruw en gaan uit van één persoon die de codebase kent.

| # | Stap | Raakt | Ruw |
| --- | --- | --- | --- |
| 1 | Tokens en het overgangsrecept | nieuw `tokens.css`; `style.css`, `island.css`, `index.html`, `island.html`, `newtab.html` | ½ dag |
| 2 | Typografie, de plaat, het plafond | `style.css`, `index.html` | 1 dag |
| 3 | De inkt: iconen, het lege faviconvak | `index.html`, `style.css`, `app.js` | ½ dag |
| 4 | **De verzoening** | `app.js`, `glyph.js`, `main.js` | 1 dag |
| 5 | Beweging in de lijst: intree, FLIP, de plaat | `app.js`, `style.css`, `index.html` | 1½ dag |
| 6 | Laden en de glyph | `app.js`, `glyph.js`, `style.css` | 1½ dag |
| 7 | Adresbalk, stopknop, sneltoetsrouter | `app.js`, `main.js`, nieuw `lib/sneltoetsen.js`, `preload.js` | 1½ dag |
| 8 | Eiland: de klem, het vangnet, de vorm | `main.js`, `island.html`, `island.css`, `island.js` | 1 dag |
| 9 | Eiland: inhoudsovergangen, protocol, morph | `island.js`, `island.css` | 2 dagen |
| 10 | Eiland: de vier kanalen en de rail voor één assistent | `main.js`, `preload-island.js`, `island.js` | 1 dag |
| 11 | De workspacevoet wordt een lijst | `index.html`, `style.css`, `app.js` | 1 dag |
| 12 | De ingang naar instellingen | `index.html`, `style.css`, `app.js`, `main.js` | ½ dag + het scherm zelf |

Samen ongeveer **dertien werkdagen** voor het visuele deel, exclusief het
instellingenscherm zelf (dat is `ROUTEKAART.md` stap 7 en hangt aan de
opslaglaag).

### Stap 1 — Tokens en het overgangsrecept (½ dag)

`renderer/tokens.css` uit §1.6, als eerste `<link>` in alle drie de HTML-bestanden.
`style.css` en `island.css` houden alleen wat echt van hen is. Meteen erbij:
`#controls button` en `.tab` gaan allebei over op `transition: var(--overgang-vlak)`.

**Wat je ziet:** de terug- en vooruitknop knipperen niet meer bij elke navigatie.
Dat is één woord (`opacity`) en je ziet het honderden keren per dag.

**Wat je meteen moet controleren, met één regel in de console van de zijbalk:**
of `el.style.setProperty()` werkelijk buiten `style-src 'self'` valt. De
CSSOM-weg valt daar volgens de spec buiten en de jury heeft dat besloten, maar
het is in deze app niet gedraaid. Stap 5 heeft er precies één plek voor nodig
(`plaat.style.transform`); blijkt het geblokkeerd, dan is de uitwijk
`plaat.animate([...], { fill: 'forwards' })`.

### Stap 2 — Typografie, de plaat, het plafond (1 dag)

Dit is de goedkoopste zichtbare winst die er is: `font-weight` komt op dit moment
nul keer voor in `style.css`.

```css
body { font: 400 13px/1.45 var(--font-text); }

/* De hiërarchie zit in gewicht en kleur, niet in een tweede vulling. */
.tab .titel { font-weight: 400; color: var(--muted); }
.tab[aria-selected="true"] .titel { font-weight: 500; color: var(--text); }
.tab .eigenaar { font-family: var(--font-small); font-size: 11px; font-weight: 500; color: var(--muted); }

/* Het randje om kbd is de enige omlijning in de hele kolom en trekt daarom meer
   aandacht dan de actie waar hij bij hoort. Maat en gewicht zeggen genoeg. */
#new-tab kbd { border: 0; padding: 0; font-size: 10px; font-weight: 500; letter-spacing: 0.02em; color: var(--faint); }

/* De kolom krijgt een bekend beginvlak. Zonder dit staat de leesbaarheid van
   twintig regels tekst op iemands bureaubladfoto, en is backdrop-filter in de
   commandobalk voor het eerst zinvol: er is nu iets om te vervagen. */
#sidebar {
  background-color: var(--zijbalk);
  box-shadow: inset -1px 0 0 var(--rand-kant);
}

/* Het plafond ligt op de zijbalk, niet erin. */
#drag-strip { box-shadow: var(--schaduw-plafond); }

/* Het driehoekje venstermateriaal tussen plafond, zijbalk en de 12px-ronding
   van de pagina. layoutActiveTab() zet de pagina op x=264,y=44 en
   setBorderRadius(12) maakt die hoek doorzichtig, dus daar komt de
   zijbalkrenderer onderdoor. Tweede kleurstop een halve pixel later, anders zie
   je de trapjes in de boog. */
#drag-strip::after {
  content: "";
  position: absolute;
  top: 100%;
  left: var(--sidebar-width);
  width: var(--radius-content);
  height: var(--radius-content);
  background: radial-gradient(circle var(--radius-content) at 100% 100%,
    transparent var(--radius-content), var(--plafond) calc(var(--radius-content) + 0.5px));
}
```

**Twee correcties op wat de bronnen beweren, en ze zijn niet cosmetisch:**

- `--schaduw-plafond` werkt **niet** "over de volle breedte". De pagina is een
  native `WebContentsView` bóven de zijbalkrenderer, dus alles wat onder y=44 en
  rechts van x=264 valt is onzichtbaar. De schaduw bestaat uitsluitend in de
  264px-kolom en in de contentmarge rechts (`CONTENT_GAP`, 10px). Dat is nog
  steeds precies de naad die hij moest oplossen.
- Het hoekje bij (264, 44) is **puur visueel**. `electron.d.ts` zegt bij
  `setBorderRadius` expliciet: *"The area cutout of the view's border still
  captures clicks."* Je kunt het venster daar dus niet aan verslepen. Dat er
  werkelijk een driehoekje bureaublad staat is afgeleid uit de code
  (`layoutActiveTab` + `setBorderRadius(12)`), niet op een schermafdruk
  gecontroleerd. Eén schermafdruk werk.

Hier hoort ook het opnieuw ijken van `--fill`, `--fill-hover` en `--fill-active`
tegen de vier achtergronden uit §1.5. Reken die middag mee.

### Stap 3 — De inkt (½ dag)

De eigenaar noemt dit zelf: het lege faviconvak leest als een uitgevinkt
selectievakje.

```css
/* Leeg is leeg. Een vlak op de plek van een favicon is een mededeling die er
   niet is. Het vakje komt alléén terug als er werkelijk iets laadt (stap 6). */
.tab .merk { width: 16px; height: 16px; flex: none; border-radius: 4px; background: none; }
```

Verder: de drie SVG's in `index.html` binnen één inktvak, x,y ∈ [3, 13] van
`viewBox="0 0 16 16"`. Nu lopen de chevrons van x=5,5 tot x=10 en de
herlaadcirkel van x=3 tot x=13, dus drie knoppen naast elkaar lezen als drie
verschillende maten. Onder 12px opgetekend gaat `stroke-width` naar 1.8
(`ui-systeem.md` §7.10). En elke rij die je kunt aanwijzen krijgt `--rand`.

### Stap 4 — De verzoening (1 dag)

Zie §3. Levert visueel nul op en is de voorwaarde voor stap 5, 6 en 11.

### Stap 5 — Beweging in de lijst (1½ dag)

`beweeg()` als enige doorgeefluik voor `Element.animate` (het `reduced-motion`-blok
in `style.css` raakt alleen CSS), de drempel `volgorde !== vorigeVolgorde`, de
intree van links, de FLIP met `+ scrollTop`, en `#plaat`.

De plaat is de plek waar materiaals dure rim gratis wordt: er is per definitie
precies één actief tabblad, dus precies één verheven vlak, dus het
pseudo-element met `mask-composite: exclude` bestaat gegarandeerd één keer in de
hele app in plaats van één keer per rij.

```css
#plaat::before {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: inherit;
  padding: 1px;
  background: linear-gradient(180deg, var(--rand-top), var(--rand-zij) 38%, var(--rand-bodem));
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  /* De -webkit-regel blijft ernaast staan zodat een mislukking een zichtbare
     gevulde rechthoek geeft in plaats van niets. */
  -webkit-mask-composite: xor;
  mask-composite: exclude;
  pointer-events: none;
}
```

`mask-composite: exclude` hoort in Chromium 120+ te werken, dus in Electron 33
(Chromium 130). **Niet in deze app gedraaid.**

Hier hoort ook de toegankelijkheid uit instrument §6.3 thuis, en pas hier: één
`tabindex="0"` op `#tablist` met `role="listbox"`, `role="option"` +
`aria-selected` op de rijen, `aria-activedescendant="tab-7"`, pijltoetsen
erbinnen. Dat hangt volledig aan een element-id dat tussen twee updates blijft
bestaan, en dat was met `replaceChildren()` onmogelijk.

### Stap 6 — Laden en de glyph (1½ dag)

Ademen op één klok (`rij.adem.currentTime = performance.now() % ADEM`), de
titelwissel, `merk.onerror`, `.tab.ladend .titel { opacity: 0.72 }`.

Opacity en niet een kleur: dat werkt in alle vier de combinaties (rust,
aanwijzen, actief, assistent) zonder vier regels, en het is één trede zachter,
dus "ladend" blijft afleesbaar met beweging uit.

De glyph krijgt drie wijzigingen (`tabblad-animaties.md` §5.6):

1. De kleuren komen uit `tokens.css` via `getComputedStyle`, met een
   hardgecodeerde terugval. `getComputedStyle` is een web-API, dus `glyph.js`
   blijft geschikt voor het sandboxed tabblad dat hem deelt.
2. `helderheid()` krijgt zijn stand als parameter, zodat twee standen 220ms lang
   gemengd kunnen worden. Bij n=3 zijn dat negen extra sinussen per frame
   gedurende dertien frames.
3. De lus valt in slaap en wordt gewekt. Slaapvoorwaarde is niet "de stand is
   rust" maar "de stand is rust én de kruisovergang is af" — anders valt hij
   halverwege een kleurwissel stil. `klaar` slaapt zodra de cirkel de rand
   gehaald heeft. Plus `stop()`, zodat de verzoening een tekenlus expliciet kan
   beëindigen in plaats van drie frames te wachten op `canvas.isConnected`.

Dit raakt het enige onderdeel dat de eigenaar al goed vindt. Er hoort een visuele
controle bij en niet alleen een review.

`@keyframes kloppen` en `.tab .bezig` verdwijnen hier.

### Stap 7 — Adresbalk, stopknop, sneltoetsrouter (1½ dag)

`kortAdres()` uit §1.5. `#reload` wordt een stopknop zolang `tab.loading` waar
is — er is nu geen enkele manier om een hangende pagina af te breken. Nieuw
kanaal `nav:stop` → `this.activeWebContents?.stop()`, en één extra methode in
`preload.js`.

En de sneltoetsen gaan uit de zijbalkrenderer naar `lib/sneltoetsen.js`, met één
`bindSneltoetsen(wc, ctx)` op élke webContents, precies zoals `devtoolsSneltoets()`
op `main.js:64-70` het al doet. Nu sterven Ctrl+T, Ctrl+L, Ctrl+K, Ctrl+J en
Ctrl+1..9 zodra je in een pagina klikt, en dat doe je de hele dag. Zonder deze
stap is de toetsenbordnavigatie uit stap 5 een belofte op papier.

`devtoolsSneltoets()` gaat erin op. De `keydown`-luisteraar in `app.js` houdt
alleen wat binnen de commandobalk hoort (pijltjes, Enter, Escape terwijl het
palet openstaat).

**Onzeker:** op macOS blijft het applicatiemenu staan en wint een
menu-accelerator vermoedelijk van `before-input-event`. Meten voordat je erop
bouwt (`ROUTEKAART.md` §1.3 zegt dit al).

### Stap 8 — Eiland: de klem, het vangnet, de vorm (1 dag)

Dit is de stap die 37 pixels van elke website teruggeeft.

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

// Herstart de balk (crash, of een herlaadactie tijdens het bouwen), dan staat
// zijn laatst gemelde hoogte er nog en blijft er een onzichtbare strook over de
// pagina liggen die klikken vangt. De renderer weet daar niets van.
this.island.webContents.on('did-finish-load', () => {
  this.islandSize = { ...this.islandSize, height: TOPBAR_HEIGHT };
  this.layoutIsland();
});

// raiseIsland mag zijn removeChildView kwijt: addChildView herordent een view
// die de ouder al bevat naar boven (electron.d.ts:14224-14229). Nu wordt de balk
// bij élk nieuw tabblad kort uit de vensterboom gehaald.
raiseIsland() {
  if (this.island) this.win.contentView.addChildView(this.island);
}

// De vensterknoppen tekent het systeem rechtsboven; daar mag de balk nooit onder
// komen, anders kun je je venster niet sluiten zolang de assistent praat.
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

`CAPTION_BREEDTE = 150` is **een aanname** — drie knoppen van 46px bij 100%
schaling — en niet uitgemeten. `titleBarOverlay` zet wel de hoogte
(`main.js:44`) maar de breedte bepaalt het systeem.

Daarna `island.html` + `island.css` vervangen door de bouw uit
`eiland-verfijning.md` §3: een `#plafondrij` van exact `--plafond-hoogte` bovenaan
en een `#hangstrook` eronder, allebei met een vaste breedte, in een `#vorm` met
`overflow: hidden` en de twee holle hoekjes als pseudo-elementen van diezelfde
doos. Nog zonder morph: `island.js` zet `data-vorm` en `data-open` en meldt de
hoogte in één stap.

Dat lost instruments §7.4c bouwkundig op in plaats van met rekenwerk: het midden
van de 26px-glyph ligt in álle zes de vormen op y=22, omdat de bovenste rij
precies plafondhoogte is. Het blijft kloppen als er ooit een zevende vorm
bijkomt.

Twee regels die de rest dragen: **de breedte is van de renderer, de hoogte is van
het hoofdproces.** De view is altijd 407 breed (380 pil + 2×13 holte + 1 pixel
speling voor het doorschot van 0,1%), dus elke breedteverandering gebeurt binnen
één compositor en er gaat nooit een bericht over IPC voor de breedte. De hoogte
kent twee waarden, 44 en 92.

**Wat je ziet:** in rust nul paginapixels afgedekt, en de aansluiting op het
plafond klopt.

### Stap 9 — Eiland: inhoudsovergangen, protocol, morph (2 dagen)

Dit is het gevaarlijkste deel van het hele plan en het gaat stíl mis: een view
die te groot blijft staan ziet er precies hetzelfde uit en vangt intussen
muisklikken boven de website van iemand anders. `View` heeft geen
`setIgnoreMouseEvents` — geverifieerd, `electron.d.ts` regel 14207–14278 bevat de
hele klasse en de methode staat alleen op `BaseWindow` (3068) en `BrowserWindow`
(5681).

De drie dingen die het veilig maken:

1. **Er wordt niets gemeten.** Zes vormen met bekende maten, en die maten staan
   in CSS; `island.js` leest ze met `getComputedStyle`. Materiaals meetronde
   (pinnen, wisselen, meten, `await`, rAF) bestaat alleen omdat de maat van de
   inhoud afhangt, en dat is hier niet zo.
2. **Er wordt op de eigen `resize` gewacht, niet op een bevestiging.** De view
   *is* het venster van deze renderer. `await eiland.meldGrootte(...)` lost op
   zodra de handler geretourneerd is en `setBounds()` synchroon klaar is — dat
   zegt niets over wanneer de view er zo bij ligt. `window.addEventListener('resize')`
   met een timeout van 120ms ernaast wel. De timeout is geen luxe: vraagt de balk
   een maat die hij al heeft, dan komt er nooit een resize.
3. **Eén lus, één slot, één borging in `finally`.** De laatst gevraagde stand
   wint; tussenliggende standen worden overgeslagen. `Element.animate` en geen
   CSS-transitie met `transitionend`, want een transitie die niet start of die
   onderbroken wordt vuurt geen `transitionend` — dan blijft de `await` hangen en
   daarmee de view op 92. `animation.finished` lost altijd op of wijst altijd af.

De morph zelf: twee sporen op één klok, 60ms uit elkaar, en de volgorde keert om
op de terugweg. Bij openen loopt de breedte voor (hij gaat open en komt dan naar
beneden), bij sluiten de hoogte (hij trekt zich eerst terug in het plafond en
wordt daarna pas smal) — anders hangt er een smalle sliert onder het plafond uit.

Meet vóór deze stap het punt uit `eiland-verfijning.md` §5.3 (surface
synchronisation) met de DevTools van de island-view.

### Stap 10 — Eiland: de vier kanalen en de rail (1 dag)

`domein:actie`, werkwoord Engels, conform `ROUTEKAART.md` §1.1.

| Kanaal | Waarvoor |
| --- | --- |
| `island:reveal` | het tabblad van de spreker activeren. Zonder dit is "Klaar, kijk mee in zijn tabblad" een instructie zonder knop. |
| `island:dismiss` | een `geblokkeerd`-melding wegklikken. Zonder dit blijft die balk staan: `stopAgent` keert bij `!this.agent` terug vóór de `sendIsland({modus:'rust'})` op `main.js:528`, dus een geblokkeerde `mailto:`-link laat een onwegklikbare balk achter. |
| `island:cancel` | het invoerveld annuleren. `naarRust()` liegt nu lokaal tot de volgende `sendIsland` — tot 3,2 seconden. |
| `island:select` | een andere assistent de spreker maken; nu nog met één assistent, maar de bouw ligt er. |

En één die niemand noemde: `setPaletteOpen` neemt de balk mee. `#palette` is HTML
in de zijbalkrenderer en dus een laag ónder alle kindviews, dus de balk tekent er
dwars overheen.

Verder verdwijnt hier `Niet nu`. In `actie` heet `#stop` nu "Niet nu" maar roept
`island:stop` → `stopAgent(false)` aan: timer gewist, opdracht weg, geen weg
terug. Uitstel beloven en afbreken leveren is de ergste knop in de app.

**Wat dit niet oplost:** `main.js` kent één `this.agent`. Twee gelijktijdig
werkende assistenten passen daar niet in. De rail is erop ontworpen
(`eiland-verfijning.md` §6), maar `startAgent`/`volgendeStap`/`stopAgent` moeten
daarvoor van één veld naar een `Map` — dat is een eigen wijziging en staat niet
in dit plan.

### Stap 11 — De workspacevoet wordt een lijst (1 dag)

De strip is krap, de stippen zijn 9px, en alleen de actieve workspace draagt zijn
naam — dus de andere zijn een gekleurd puntje zonder label, wat `ui-systeem.md`
§2.3 verbiedt ("kleur is nooit de enige drager").

De voet wordt een verticale lijst van rijen van 32px: stip 10px, naam, teller in
`tabular-nums`, en de "Nieuwe workspace"-rij eronder met de instellingenknop
ernaast (stap 12). **Niet** dichtgeklapt achter een chevron: dat kost een extra
klik op de kernfunctie, tientallen keren per dag.

Prijs, en die is echt: bij vier workspaces is dat 128px, oftewel vier
tabbladrijen. De lijst krijgt daarom `max-height: calc(4 * var(--rij))` en scrolt
daarboven.

Hier komt materiaal §4.6 binnen: `.ws .close` schakelt nu tussen `display: none`
en `display: grid`, waardoor de chip bij hover ~24px groeit, de hele strip opzij
schuift, en de `transition` eronder nooit draait. Het wordt `opacity: 0` plus
`pointer-events: none`, precies zoals `.tab .close`.

De lijst krijgt dezelfde verzoening en dezelfde plaat als `#tablist`. Maak
`zetPlaat` daarom in stap 5 al een fabriekje (`maakPlaat(container)`) in plaats
van één globale `plaat`; dat is dezelfde twintig regels.

### Stap 12 — De ingang naar instellingen (½ dag, plus het scherm)

De knop komt rechts in de voetregel, naast "Nieuwe workspace", en deelt die rij —
netto nul verticale pixels. Niet in `#controls` (die vier gaan zonder
uitzondering over de pagina die voor je staat) en niet in het plafond (dat is
sleepgebied, het systeem tekent er de vensterknoppen op, en het eiland groeit
eruit).

Het pictogram is twee schuiven met twee grepen, niet een tandwiel: zes tanden
binnen een vak van 10×10 bij `stroke-width: 1.6` zijn 0,8 pixel diep en dat is op
16px een grijze vlek.

```html
<button id="instellingen" class="rij rij--icoon" type="button"
        title="Instellingen (Ctrl ,)" aria-label="Instellingen">
  <svg viewBox="0 0 16 16" aria-hidden="true">
    <path d="M3 5.5h10M3 10.5h10M9.5 3.5v4M6.5 8.5v4" />
  </svg>
</button>
```

**Eerlijk over het scherm zelf:** dat is `ROUTEKAART.md` stap 7, het hangt aan de
opslaglaag (`lib/opslag.js`) en aan het `tougather:`-schema, en het is vijf dagen.
Een knop die naar een scherm leidt dat na herstart niets onthoudt, is erger dan
geen knop. Dus: de knop en de sneltoets komen pas mee als er een scherm is met
minstens drie regels die werkelijk bewaard worden. Tot die tijd is de derde
ingang — de commandobalk, waarin elke sectie een eigen resultaat is — de
goedkoopste en waarschijnlijk de meest gebruikte.

---

## 3. Het afstemmingsmechanisme voor de tabbladlijst

### 3.1 Waarom het alles blokkeert

`app.js:77` doet `tablist.replaceChildren(...)` bij elke statusupdate, en zes
`webContents`-events per tabblad voeden die — `did-navigate-in-page` vuurt bij
elke history-push van elke openstaande SPA. Gevolg:

- Een transitie heeft een beginwaarde nodig op een element dat er al was. Een
  vers element wordt meteen op zijn eindwaarde getekend: geen intree.
- Een verwijderd element is weg vóór het eerste frame: geen uittree.
- `:active` overleeft de `mousedown` niet. Er zit een IPC-rondgang plus een
  hertekening tussen je klik en het antwoord. Er is dus letterlijk geen
  bevestiging dat een klik geland is — en `button { cursor: default }`
  (`style.css:103`) haalt ook de cursorwissel weg.
- Focus verdwijnt, en met focus een halfgetypte workspacenaam.
- `maakGlyph()` start per hertekening een nieuwe `requestAnimationFrame`-lus die
  zichzelf pas na drie frames opruimt (`glyph.js:80-81`).
- `aria-activedescendant` kan niet bestaan: het verwijst naar een element-id dat
  elke ronde naar een verdwenen node wijst.
- En het zwaarste: **er is geen manier om te weten wát er veranderd is.**
  Choreografie begint bij het verschil tussen twee standen, en dat verschil
  bestaat nu nergens.

De fase-truc uit `ui-systeem.md` §6.4 repareert alleen het laatste puntje van dat
lijstje, en alleen voor animaties die zichzelf herhalen.

### 3.2 Wanneer het komt

**Stap 4, na de drie visuele stappen en vóór elke bewegingsstap.**

Niet eerder, omdat stap 1–3 (tokens, typografie, plaat, inkt) samen ongeveer de
helft van "visueel beter" leveren, geen enkele architectuur nodig hebben, en niet
opnieuw gedaan hoeven worden als de verzoening er later onder schuift. Wie eerst
de verzoening doet, levert twee dagen lang niets zichtbaars op.

Niet later, omdat stap 5, 6 en 11 er volledig aan hangen. Elke regel CSS uit
`tabblad-animaties.md` en elke `Element.animate` daarin is dode code zolang de
lijst vervangen wordt.

### 3.3 De kleinste versie die werkt

Ongeveer tachtig regels in `app.js`, plus drie in `main.js` en één methode in
`glyph.js`. Dit is wat er minimaal in moet; alles daarbuiten is choreografie en
hoort in stap 5 en 6.

```js
// --- de tabbladlijst verzoenen ----------------------------------------
//
// Het hoofdproces stuurt de volledige lijst en zes webContents-events per
// tabblad voeden die. Wij vervangen die lijst niet maar leggen hem naast wat er
// staat. Dat is geen snelheidsoptimalisatie: het is de voorwaarde waaronder
// beweging in deze lijst überhaupt kan bestaan. Een rij die blijft bestaan kan
// aanwijzen, indrukken, focus en een lopende animatie overleven.
/** @type {Map<number, {li, merk, titel, sluit, glyph, hand}>} */
const rijen = new Map();

// Alles wat een rij laat zien, in één string. Bij een update waarin aan deze rij
// niets veranderde — verreweg de meeste — kost de rij één stringvergelijking en
// nul DOM-schrijfacties. Een regelinvoer als scheider: die kan niet in een titel
// of een URL zitten, dus twee standen leveren nooit dezelfde handtekening op.
function handtekening(tab, actief) {
  return [tab.title, tab.url, tab.owner, tab.modus, tab.loading, tab.leeg, actief].join('\n');
}

function verzoen(staat) {
  const { tabs, activeId } = staat;
  const gezien = new Set();
  let vorige = null;

  for (const tab of tabs) {
    let rij = rijen.get(tab.id);
    if (!rij) {
      rij = maakRij(tab);
      rijen.set(tab.id, rij);
    }
    werkBij(rij, tab, tab.id === activeId);

    // insertBefore verplaatst alleen wat werkelijk verkeerd staat. append() zou
    // elke rij elke ronde verplaatsen, en een verplaatste node verliest focus en
    // :active — precies wat we hier aan het repareren zijn.
    const anker = vorige ? vorige.nextSibling : tablist.firstChild;
    if (rij.li !== anker) tablist.insertBefore(rij.li, anker);
    vorige = rij.li;
    gezien.add(tab.id);
  }

  for (const [id, rij] of rijen) {
    if (gezien.has(id)) continue;
    rijen.delete(id);
    // De tekenlus hangt aan dit canvas. Hem expliciet stoppen is zekerder dan
    // wachten tot hij zelf merkt dat hij losgekoppeld is.
    rij.glyph?.stop();
    rij.li.remove();
  }
}

function werkBij(rij, tab, actief) {
  const hand = handtekening(tab, actief);
  if (rij.hand === hand) return;
  rij.hand = hand;

  zetMerk(rij, tab);
  rij.li.classList.toggle('ladend', tab.loading);
  rij.li.classList.toggle('agent', Boolean(tab.owner));
  rij.li.setAttribute('aria-selected', String(actief));
  rij.titel.textContent = tab.leeg ? 'Nieuw tabblad' : tab.title;
  rij.glyph?.zet(tab.modus ?? 'rust');
}

// Een assistent draagt zijn glyph, een gewoon tabblad zijn favicon. Alleen als de
// sóórt wisselt vervangen we het element — dat gebeurt precies één keer, als
// stopAgent(false) de eigenaar op null zet (main.js:527).
function zetMerk(rij, tab) {
  const wil = tab.owner ? 'canvas' : 'img';
  if (rij.merk?.localName === wil) return;
  rij.glyph?.stop();
  rij.glyph = null;

  const el = document.createElement(wil);
  el.className = 'merk';
  if (wil === 'canvas') {
    el.setAttribute('aria-hidden', 'true');
    rij.glyph = maakGlyph(el, { n: 3, zijde: 16 });
    rij.glyph.zet(tab.modus ?? 'rust');
  } else {
    el.alt = '';
    // Een 404 op een favicon-URL levert nu het gebroken-afbeeldingicoon op; in
    // een lijst van twintig rijen zijn dat er zomaar drie die er de hele dag
    // staan. Het attribuut weghalen zet bovendien de :not([src])-selector van
    // het ademende laadvakje weer aan.
    el.onerror = () => el.removeAttribute('src');
    const favicon = favicons.get(tab.id);
    if (favicon) el.src = favicon;
  }
  rij.merk?.replaceWith(el);
  rij.merk = el;
}
```

In `glyph.js` erbij, en het is drie regels:

```js
let gestopt = false;
// In teken(): if (gestopt || !canvas.isConnected) return;
// In de returnwaarde: stop() { gestopt = true; },
```

In `main.js`, `pushState()`:

```js
// Zes webContents-events per tabblad plus did-navigate-in-page bij elke
// history-push van elke SPA. Eén stand per tick is precies zo waar en scheelt
// het serialiseren van alle tabbladen én alle workspaces bij elke ruis.
pushState() {
  if (this.pushGepland) return;
  this.pushGepland = true;
  setImmediate(() => {
    this.pushGepland = false;
    if (this.win.isDestroyed()) return;
    this.send('tabs:state', { … });
  });
}
```

`setImmediate` is de goedkope eerste versie. `ROUTEKAART.md` §1.10 wil er
uiteindelijk een trailing debounce van 50ms van, met een directe push bij
structurele wijzigingen (tabblad erbij, weg, geactiveerd, workspace gewisseld).
Dat wordt pas een eis als er een echt model achter de assistent hangt.

### 3.4 Wat er in de kleinste versie bewust níét in zit

Alles hieronder is choreografie en hoort in stap 5, 6 en 11. Weglaten breekt
niets:

- de intree-klasse en de FLIP (`meet()` / `schuifDicht()`);
- `#plaat` als apart element — tot stap 5 blijft de vulling gewoon op
  `.tab[aria-selected="true"]` staan;
- de gaten die blijven staan zolang de muis boven de lijst hangt;
- het ademende faviconvak en de titelwissel;
- de kruisovergang en de slaapstand van de glyph;
- de workspacewissel als één beweging op de container.

### 3.5 Wat je er niet uit mag laten, ook niet in de kleinste versie

- **`insertBefore` in plaats van `append`.** `append()` op een node die al in de
  DOM zit is een verwijdering plus een invoeging, dus dat verplaatst alle twintig
  rijen elke ronde en dan verliest elke rij alsnog focus en `:active`.
- **`glyph.stop()`.** Zonder dat blijft er per gesloten assistententabblad een
  tekenlus draaien tot `canvas.isConnected` het na drie frames merkt — en met de
  verzoening weten we exact wanneer een rij weggaat.
- **De handtekening.** `classList.toggle(x, bool)` en `setAttribute` zijn
  idempotent, dus zonder de controle zou het ook wérken, maar dan doet elke rij
  bij elke update zes DOM-aanroepen die niets veranderen. Met de handtekening
  doet een rustige lijst niets.

### 3.6 Drie dingen om op te letten

- **De favicon loopt langs de handtekening heen.** `browser.onFavicon` komt op
  een eigen kanaal (`tabs:favicon`) en staat niet in `describe()`, dus hij mag
  niet door `werkBij` gefilterd worden. Schrijf hem direct naar `rijen.get(id).merk`.
- **`li.id = 'tab-' + tab.id`.** Stabiel, want `nextId` loopt per venster op en
  wordt nooit hergebruikt (`main.js:84`). `aria-activedescendant` in stap 5 hangt
  daaraan.
- **Meet het.** Twee geforceerde layouts per structurele wijziging is het getal
  waar stap 5 op leunt (één meting vóór de mutatie, één erna). Meet dat met
  twintig rijen, twee draaiende glyphs en een SPA die `did-navigate-in-page` staat
  te pompen. Dat is de enige plek in het visuele deel waar een meting het ontwerp
  kan omgooien.

---

## 4. MCP: mag dit aan?

### 4.1 Het oordeel

**Nee. Niet in de vorm die er ligt, en niet met leesrecht op een workspace waar
je ingelogd bent.**

Er is één configuratie die wél verdedigbaar is, en die is echt bruikbaar. Die
staat in §4.4. De rest van dit hoofdstuk zegt waarom de rest niet mag.

Drie dingen, in volgorde van zwaarte.

**1. Er zijn twee documenten en er is geen normatieve reconciliatie.**
`mcp-connector.md` en `mcp-beveiliging.md` beschrijven twee onverenigbare
systemen voor exact dezelfde functie: authenticatie (platte-tekst token plus
`hallo` tegenover zescijferige koppelcode plus `safeStorage`), gereedschapsnamen
(`read_page` tegenover `tabs.read`), standaardtoegang (connector §8.6 leest eigen
tabs vrij, beveiliging §6.1 zegt "nul workspaces, standaard"), en de
exfiltratiedrempel (512 bytes query+fragment tegenover 2 000 tekens URL). Wie
straks bouwt, bouwt uit `catalogus.js` — want dat is het document met de schema's
— en pakt het beleid dat daar in §8.6 naast staat. Het strengere document
verklaart zichzelf in §15 ongeldig zodra de ladder groeit, en in het zusterdocument
is hij al van zeven naar vijftien gegroeid vóórdat er één regel code bestaat.
Zolang niet één bestand beslist welke stand er in `lib/mcp/beleid.js` landt, is
niet vast te stellen wát er aan staat, en dan is de vraag "mag dit aan" niet te
beantwoorden.

**2. De toestemmingsgrens ligt op de verkeerde as.** Zowel connector §8.6 als
beveiliging §8.6 geven lezen op "eigen tabbladen" vrij, zonder vraag, en vragen
alleen per origin voor "jouw tabbladen". Maar eigenaarschap is
aanvaller-gecontroleerd: `open_tab('https://mail.example.com/inbox')` levert een
eigen tabblad op, in de workspace-sessie, ingelogd als jij. De per-origin-consent
is daarmee triviaal te omzeilen voor élke origin waarvan de aanvaller de URL
kent. Het gaat dus niet om wat je open hebt staan, maar om elke site waar je in
die workspace een cookie voor hebt. Het ontwerp geeft dat half toe (§9.9,
"leestoegang is de lek") en onderschat het.

**3. De maatregel die het gewicht draagt, wordt half door de aanvaller
geschreven.** `mcp-beveiliging.md` §9.2 noemt de vraagzin "de enige dragende
maatregel" en beschermt de verkeerde kant: de regel is dat de tekst niet van de
*client* mag komen. Maar partij 4 uit het eigen dreigingsmodel is de *pagina*, en
de pagina levert het opschrift aan — via de naamladder uit connector §7.6 die met
`aria-label` begint, 120 tekens vrije tekst, zonder stripping van stuurtekens.
`<button aria-label="Annuleren">Bevestig overboeking</button>` levert de vraag
"Claude Desktop wil op bank.example.com op 'Annuleren' klikken". Dat `aria-label`
bovenaan de ladder staat is normaal een voordeel en hier precies het nadeel: het
is het veld dat de gebruiker níét op zijn scherm ziet staan.

### 4.2 Wat er niet te dichten is

Deze staan grotendeels in `mcp-beveiliging.md` §15 en ze zijn daar eerlijk
opgeschreven. Ze verdwijnen niet met een betere implementatie.

- **We weten niet wie er aan de andere kant zit.** Windows heeft
  `GetNamedPipeClientProcessId`, Linux `SO_PEERCRED`, macOS `LOCAL_PEERPID` — Node
  stelt geen van drieën beschikbaar. Elke naam op elk scherm is een bewering van
  het programma zelf. Een native module zou het kunnen; dit project heeft bewust
  geen build-stap voor native code.
- **Pipe-kaping op Windows.** Een programma dat eerder start kan de naam claimen,
  is dan de *server*, en kan de client voeden met verzonnen pagina-inhoud. Dat is
  een injectiekanaal rechtstreeks naar het externe model, zonder pagina en zonder
  gebruiker. Niet te voorkomen.
- **Fysieke toegang verslaat de koppelcode.** De hele koppelbeveiliging verdedigt
  tegen een programma dat het scherm niet kan lezen. Iemand met dertig seconden
  aan je ontgrendelde machine leest het scherm wel.
- **Het logboek heeft geen integriteit.** Het wordt geschreven door het proces
  dat zou liegen en is bewerkbaar door de aanvaller die er sowieso al is.
- **Consent-moeheid is structureel.** Alle maatregelen gaan over handelingen;
  lezen is onthoudbaar. De grant is één blinde klik, de blast radius is permanent
  tot hij vervalt.
- **En de kern: leestoegang tot een ingelogde workspace ís de lek.** Een injectie
  die alleen hoeft te lezen komt geen enkele vraag tegen, want dat is de
  toestemming die je gaf, correct uitgevoerd.

Dat laatste punt is geen bug die je repareert. Het is het gevolg van de functie.
Daarom is de enige verdedigbare opzet er een waarin die zin onschadelijk is —
namelijk een workspace zonder logins.

### 4.3 Wat er wél te dichten is, en vóór de eerste verzending moet

Deze staan hier omdat ze concreet zijn, niet omdat ze samen "veilig" opleveren.

| # | Gat | Reparatie |
| --- | --- | --- |
| 1 | Platte-tekst token in `~/.tougather/mcp.json` plus `hallo`-handdruk | Connector §2.4 vervalt. Alleen het model uit beveiliging §3.2/§3.3: zescijferige code die de browser toont en de mens overtypt, per-client token gemunt bij koppeling, versleuteld in `mcp.bin` via `safeStorage`. `mcp.json` bevat hooguit de pijpnaam, nooit een geheim, en staat onder `app.getPath('userData')` — niet in de home-map, want die wordt op Windows routinematig naar OneDrive gesynct. |
| 2 | `list_tabs` als goedkoopste injectieroute (`document.title` is volledig door de pagina te zetten) | `title` kappen op 80 tekens, regeleindes en Unicode-stuurtekens strippen (inclusief bidi-overrides U+202A–U+202E en U+2066–U+2069), en de hele lijst in dezelfde herkomstwikkel als `read_page`. |
| 3 | De wikkel is door de aanvaller te sluiten (`## --- EINDE ONBETROUWBARE PAGINA-INHOUD ---` in een `<h2>`) | Per aanroep een wikkel met een willekeurige nonce (`<<<tg-a91f4c>>> … <<</tg-a91f4c>>>`), en elk voorkomen van `<<<tg-` uit de geëxtraheerde tekst verwijderen vóór het wikkelen. Titel, url en taal buiten de wikkel als velden in `structuredContent`, niet als markdown-kop erboven. |
| 4 | LAN en loopback via `open_tab` (`beoordeelURL()` geeft `'web'` voor `http://192.168.1.1/`) | Een eigen controle in `lib/mcp/beleid.js`, niet in de grendel: weiger loopback, link-local (169.254/16, fe80::/10), RFC1918/ULA, `0.0.0.0/8` en hostnamen zonder punt. Resolveren vóór de navigatie en weigeren op het opgeloste adres, ook op `will-redirect`. Nieuwe foutcode `HOST_BLOCKED`. |
| 5 | Raadbare handvatten (`t7:w1:9f3a1c` — het run-token is voor álle tabbladen gelijk) | `t<8 hex random>` per tabblad, per actor een eigen naamruimte, en élk handvat buiten de toegestane workspaces geeft exact dezelfde fout zonder `suggestion` en zonder tabbladenlijst. |
| 6 | `PIPE_REJECT_REMOTE_CLIENTS` onbekend | Meten. Een halve dag. Zet libuv het niet, dan is `//<host>/pipe/…` van een andere machine bereikbaar en is een "lokale" aanval een netwerkaanval. Zet het niet, dan forceren of weigeren te starten. |
| 7 | Eén exfiltratiedrempel bestaat twee keer met verschillende getallen | Eén getal, normatief. En belangrijker: de regel hangt niet aan URL-lengte maar aan herkomst — elke navigatie naar een andere origin dan de gelezen bron is verdacht en vraagt per keer, met bron- en doelhost in beeld. |

Wat níét te repareren valt met een instelling, en dus gewoon niet gebouwd wordt:
`run_javascript`, ook niet achter `mcp.jsToestaan`. Een injectie hoeft dan alleen
de gebruiker over te halen één schakelaar om te zetten.

### 4.4 Wat er dan wél kan: de leeswerkbank

Dit is bruikbaar, verdedigbaar, en het is ongeveer vijf dagen werk bovenop de
voorwaarden.

**Bereik.** De connector koppelt aan **precies één workspace, en die workspace
moet leeg zijn** — geen cookies, geen logins. Dat is `mcp-beveiliging.md` §6.5,
en het is het beste idee in beide documenten. In v0 is het geen advies maar een
harde controle: `ses.cookies.get({})` moet leeg terugkomen, anders weigert de
koppeling. Op een lege partitie is die aanroep goedkoop; op een volle is hij
mogelijk traag (beveiliging §14, meting 5) — daarom is hij hier alleen een
poortwachter bij het koppelen en niet iets dat per aanroep draait.

**Vijf gereedschappen, meer niet:**

| Naam | Wat | Toestemming |
| --- | --- | --- |
| `browser_status` | draait de browser, en wat houdt hij vast | vrij |
| `list_tabs` | id, host, gekapte titel van de tabbladen in de toegestane workspace | vrij binnen die workspace |
| `read_page` | de tekst van één tabblad, via de leeslaag, in de wikkel met nonce | vrij binnen die workspace |
| `open_tab` | nieuw tabblad op een http(s)-URL die door de host-controle uit §4.3 punt 4 komt, `activeer: false` | vrij binnen die workspace |
| `close_tab` | alleen een tabblad dat de connector zelf geopend heeft | vrij binnen die workspace |

Namen: de Engelse underscore-namen uit `mcp-connector.md` §4, want die leest een
willekeurig model uit een willekeurige client. Beleid, ladder, authenticatie en
standaardwaarden: uit `mcp-beveiliging.md`. Dat is de reconciliatie, en hij moet
in één bestand staan.

**Wat er niet in zit, en waarom:** `snapshot`, `click`, `type_text`,
`select_option`, `navigate`, `page.screenshot`, `ask_user`, `claim_tab`,
`run_javascript`, de resource- en promptroute. `type_text` is een *uitvoerkanaal*
en geen invoerhandeling — de goedkoopste exfiltratieroute in het hele ontwerp is
een `<textarea>` op de pagina van de aanvaller, waar geen enkele URL-lengteregel
naar kijkt en waarvan noch de vraag noch het logboek de inhoud toont. `ask_user`
en het `reason`-veld van `claim_tab` voeren vrije clienttekst het eiland in — de
meest vertrouwde plek die er is, de enige laag die over een pagina heen kan
tekenen — en dat is een directe schending van beveiliging §9.2. Die twee horen er
niet te zijn zolang die regel geldt.

**Wat er wél omheen moet staan, en vóór het eerste gereedschap:**

1. **De strip in de zijbalk en de noodstop.** Zichtbaarheid en stoppen komen vóór
   alles wat kan lezen. Niet andersom, ooit. Met "gekoppeld sinds `<datum>`"
   permanent zichtbaar, zodat een stille nieuwe koppeling opvalt.
2. **Het logboek plus de logboekpagina**, met de tekst die er woordelijk boven
   hoort: *"Dit is wat Tougather gedaan heeft. Wat de connector daarna met de
   antwoorden heeft gedaan, staat hier niet en kunnen wij niet zien."*
3. **`lib/mcp/beleid.js` als enige bron, en hij handhaaft zichzelf.** Er is in dit
   project geen testloper (`package.json` heeft alleen `start` en `dist`), dus de
   controle draait bij het laden van de module en gooit:

   ```js
   // Een gereedschap zonder expliciete beleidsregel is standaard onbruikbaar,
   // niet standaard toegestaan. Zonder deze controle groeit catalogus.js en
   // groeit het beleid stilzwijgend mee — precies hoe de twee ontwerpdocumenten
   // uit elkaar zijn gelopen. Er is geen testloper, dus dit weigert te starten.
   for (const naam of Object.keys(GEREEDSCHAPPEN)) {
     if (!(naam in BELEID)) throw new Error(`lib/mcp/beleid.js: geen regel voor ${naam}`);
   }
   ```

### 4.5 Wat er daarna eventueel bij mag, en onder welke voorwaarde

**Lezen in een workspace mét logins** — pas als de toestemming-as verbouwd is:
niet op tab-eigenaarschap maar op (origin × ingelogd-in-deze-workspace). Een
`read_page` op een tabblad dat de connector zélf net geopend heeft, waarvan de
origin een cookie heeft in die workspace, vraagt dan dezelfde toestemming als een
tabblad van jou. De vraag toont host **en** pad, en het onthouden geldt per
pad-voorvoegsel — `github.com/mijnorg/…` is niet dezelfde toestemming als
`github.com/vreemde/…`. En het granten zelf achter een verse OS-authenticatie
(Windows Hello), niet achter twee muisklikken.

De eerlijke prijs daarvan: de connector wordt minder handig. Elke nieuwe origin
kost een vraag. Dat is niet te vermijden, en het is precies het punt.

**Handelen** (`click`, `type_text`) — mijn advies is dit voorlopig niet te bouwen.
Als het toch komt, dan met drie dingen tegelijk, en geen van drieën is optioneel:
de te typen tekst letterlijk in de vraag met een teller en de eerste 200 tekens
zichtbaar; een SHA-256 plus lengte in het logboek in plaats van alleen de lengte;
en een vraagzin die uit twee soorten materiaal is opgebouwd waarvan je het
verschil ook zíet — onze eigen feiten in gewone tekst (host, workspace, of het
element in een `<form>` zit en waarheen dat formulier post, wat wij zelf uit de
DOM weten), en het opschrift als geciteerde, op 40 tekens gekapte, van
stuurtekens ontdane string, met voorkeur voor de zíchtbare tekstinhoud boven
`aria-label`. Plus een test met een pagina die liegt over zijn eigen opschrift.

### 4.6 Wat de eigenaar hiervan moet meenemen

Je krijgt deze maand geen agent die in je werk-workspace dingen voor je doet. Je
kunt wel een leeswerkbank krijgen die in een bewust lege workspace pagina's
opent, leest en samenvat — en dat is voor onderzoek, documentatie doorlezen en
pagina's vergelijken echt bruikbaar. De reden dat het bij die stand blijft is niet
voorzichtigheid: het is dat de twee maatregelen die het gewicht dragen allebei op
een plek staan waar de aanvaller bij kan, en dat het ontwerp dat zelf zegt.

---

## 5. De drie dingen die als eerste gebouwd moeten worden

**1. Stap 1 en 2 samen: tokens, typografie, de zijbalkplaat en het plafond.**
Anderhalve dag. `font-weight` komt op dit moment nul keer voor in `style.css`;
400 tegenover 500 op de tabbladtitel, plus `--muted` van .46 naar .58, plus de
faviconachtergrond eruit, is ongeveer de helft van "visueel beter" voor een halve
middag. De plaat eronder is de enige verzekering tegen het geval dat
Windows-transparantie uit staat en `backgroundMaterial: 'acrylic'` gewoon niet
gehonoreerd wordt, en hij maakt `backdrop-filter` in de commandobalk voor het
eerst zinvol — er is nu iets om te vervagen. Geen architectuur nodig, niets dat
later opnieuw moet.

**2. De verzoening, in de kleinste versie uit §3.3.** Eén dag. Zonder dit is elke
transitie in de drie richtingsdocumenten en in `tabblad-animaties.md` dode CSS,
overleeft `:active` de klik niet, verdwijnt focus, kan `aria-activedescendant`
niet bestaan, en start `maakGlyph()` per hertekening een nieuwe rAF-lus. Bij twee
assistenten en twintig drukke tabbladen is dat geen esthetiek maar warmte. Het is
tachtig regels en het levert visueel niets op — dat is precies waarom het anders
blijft liggen.

**3. Eiland: de klem en het vangnet, plus de vorm zonder morph** (stap 8). Eén
dag. Er ligt op dit moment permanent ongeveer 37 pixels view over de bovenkant
van elke website, en die vangt klikken: `View` heeft geen `setIgnoreMouseEvents`
(geverifieerd in `electron.d.ts` 14207–14278) en bij `setBorderRadius` staat
expliciet dat de uitsparing klikken blijft vangen. Het is bovendien niet te
repareren door netjes om 44 te vragen, want `setIslandSize` klemt op
`Math.max(46, …)` — dat is één regel en het is de meest noodzakelijke wijziging
in het hele plan. De rest van die dag is de nieuwe bouw van `island.html` en
`island.css`, waarmee de ruststand nul paginapixels kost en de holle hoekjes
kloppen. De morph komt daarna; hij is het gevaarlijkste deel en hij hoeft niet
eerst.

---

## 6. Wat ik niet geverifieerd heb

Expliciet, zodat niemand hierop bouwt zonder te kijken. Electron 33.4.11,
Chromium 130.

- **`el.style.setProperty()` onder `style-src 'self'`.** CSP `style-src`
  controleert `<style>`-elementen en het `style`-attribuut in de markup, niet
  mutaties via de CSSOM; dat is de specpositie en de jury heeft het besloten.
  Niet in deze app gedraaid. Eén regel in de console, vóór stap 5.
- **`linear()` als easing**, in CSS en in `KeyframeAnimationOptions.easing`.
  Gedocumenteerd vanaf Chromium 113. Valt hij weg, dan valt de curve terug op
  lineair — lelijk, niet kapot.
- **`mask-composite: exclude`.** Hoort in Chromium 120+ te werken. De
  `-webkit-mask-composite: xor` staat ernaast zodat een mislukking een zichtbare
  gevulde rechthoek geeft in plaats van niets.
- **Dat een reeks `getBoundingClientRect()`-aanroepen binnen één meetronde één
  geforceerde layout kost en niet N.** Dat is het gedocumenteerde gedrag en het
  is het getal waar stap 5 op leunt. Meten met het Performance-paneel bij twintig
  rijen.
- **`getComputedStyle(el).opacity` tijdens een lopende `Element.animate`.**
  Volgens spec geeft die de geanimeerde waarde; het nette einde van de
  ademanimatie leunt daarop. Zo niet, dan leest hij 1 en is het einde weer een
  knal.
- **`mask-image` op `#tablist` met draaiende canvassen erin.** Een masker op een
  scroll-container duwt de gescrollde inhoud in een eigen render surface, en elk
  glyph-frame invalideert dat oppervlak. Alleen aanzetten bij echte overflow, en
  één keer meten met twintig rijen en een draaiende glyph.
- **Of het driehoekje bureaublad bij (264, 44) er werkelijk staat.** Afgeleid uit
  `layoutActiveTab()` plus `setBorderRadius(12)`, niet op een schermafdruk
  gecontroleerd. Eén schermafdruk werk.
- **`CAPTION_BREEDTE = 150`.** Aanname: drie knoppen van 46px bij 100% schaling.
  `titleBarOverlay` zet wel de hoogte maar de breedte bepaalt het systeem.
- **Surface synchronisation bij `View.setBounds()`.** Of het eerste frame dat na
  een `resize` getekend wordt gegarandeerd samen met de nieuwe rechthoek
  gecomposit wordt. Een tegenvaller is alleen bij het openen zichtbaar, als één
  frame plafondkleur.
- **`-webkit-app-region: drag` in een kindview.** Of Electron sleepgebieden ook
  verzamelt voor de webContents van een `WebContentsView`. Waarschijnlijk niet;
  het ontwerp klopt ook zonder.
- **Of `backgroundMaterial: 'acrylic'` gehonoreerd wordt, en of Electron het
  meldt als dat niet zo is.** Dit is het gat waar verstilling het meest last van
  heeft, want hij houdt als enige geen dekkend vlak over. De zijbalkplaat is de
  gedeeltelijke verzekering; `backgroundColor: '#00000000'` (`main.js:101`) is de
  resterende blootstelling.
- **Op macOS: of een menu-accelerator wint van `before-input-event`.** Raakt de
  sneltoetsrouter uit stap 7.
- **MCP, meting 1: welke DACL libuv op een Windows named pipe zet, en of
  `PIPE_REJECT_REMOTE_CLIENTS` aan staat.** Meten met een tweede proces en met
  `\\<host>\pipe\…` van een andere machine. Zolang dat niet gemeten is, is de
  aanname "named pipe = alleen lokaal" onbewezen, en dat is het verschil tussen
  lokale programma's en het hele netwerk.
- **MCP, meting 2: of er vanuit Node op enig platform een PID of gebruikersnaam
  van de tegenpartij te krijgen is zonder native module.** Ik ken geen weg. Kan
  het wél, dan wordt de hele koppeling sterker.

Wel geverifieerd, in `node_modules/electron/electron.d.ts`: de klasse `View`
begint op 14207, heeft `bounds-changed` (14216–14220), `setBorderRadius` met de
notitie dat de uitsparing klikken blijft vangen (14269–14271), `addChildView` dat
een bestaande kindview naar boven herordent (14224–14229), en géén
`setIgnoreMouseEvents` — die staat alleen op `BaseWindow` (3068) en
`BrowserWindow` (5681).

---

## 7. Wat dit plan niet oplost

- **Twee gelijktijdige assistenten.** `main.js` kent één `this.agent`. De rijen
  schalen naar N, het eiland niet. `eiland-verfijning.md` §6 ontwerpt de rail
  ervoor; het bouwen ervan staat niet in dit plan.
- **Het instellingenscherm zelf.** De ingang is een halve dag; het scherm is
  `ROUTEKAART.md` stap 7 en hangt aan de opslaglaag.
- **Beweging tussen de lagen.** Zijbalk, eiland en pagina zijn drie compositors.
  Wat in de een begint kan niet in de ander eindigen, en dat gaat niet
  veranderen.
- **De pagina zelf wisselt hard.** `setVisible()` kent geen overgang. Alles
  hierboven is daaraan aangepast in plaats van ertegenin te werken.
- **Contrastgarantie.** De achtergrond is het bureaublad van de gebruiker. De
  plaat maakt het voorspelbaarder; garanderen doet hij niets.
- **Een MCP-connector die in je werk-workspace mag handelen.** Zie §4.2. Dat is
  geen planningskwestie.
