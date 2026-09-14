# Richting C — Instrument

Dit is geen tweede ontwerpsysteem. `docs/ontwerp/ui-systeem.md` blijft de basis:
de drie lagen (§1), het glasrecept (§5), het tooltipbeleid (§7.6), de lege
staten (§7.7), de foutpagina (§7.8), de icoonregels (§7.10), `tokens.css` en
`tokens.js` (§10). Wat hier staat is een **keuze binnen die ruimte**: welke
waarden de tokens krijgen, welke maat waar hoort, wat er weg mag, en hoe het
beweegt. Waar dit document en `ui-systeem.md` elkaar tegenspreken staat dat er
expliciet bij, met de reden.

Alles is geschreven tegen Electron 33.4.11 / Chromium 130. Waar ik een API niet
heb nagekeken staat dat erbij; §11 verzamelt alles wat gemeten moet worden.

---

## 0. De richting in één alinea

Tougather is een werkplek waar assistenten in werken. De gebruiker kijkt niet
naar de app, hij leest hem: welk tabblad is van mij, welk van Kim, wat doet Kim
nu, in welke workspace zit ik, laadt er iets. Dat zijn vijf vragen die je in een
oogopslag beantwoord wilt hebben, niet na een halve seconde ontcijferen. Een
instrument is daarop gebouwd: **elke pixel draagt een aflezing, elke beweging
meldt een verandering en is dan klaar.** Geen sfeer, geen naijlen, geen tweede
element dat hetzelfde zegt als het eerste. Mooi wordt het van precisie —
uitlijning, ritme, één maat, één rail — en niet van zachtheid.

Zes besluiten volgen daaruit. De rest van dit document is de uitwerking.

| # | Besluit | Wat het vervangt |
| --- | --- | --- |
| 1 | De lijst wordt verzoend op id, nooit meer vervangen | `tablist.replaceChildren()` (app.js:77) |
| 2 | Hiërarchie komt van **gewicht en vlak**, niet van verbleking | `--muted` als enige onderscheid |
| 3 | Eén rijhoogte (30px) en één rail voor de hele kolom | 28 / 30 / 33 / 34 door elkaar |
| 4 | Elk signaal heeft precies één drager | glyphkleur naast oranje `.bezig` |
| 5 | Het eiland verandert van maat in twee fasen, met morph | maat in één sprong, inhoud in hetzelfde frame |
| 6 | Beweging is 90–180ms, remt af, en herhaalt zich nooit vanzelf | 140ms `ease` overal, animaties die per pushState herstarten |

---

## 1. De voorwaarde: de lijst moet blijven staan

Dit staat vooraan omdat er niets uit dit document werkt zonder. Zolang
`onState` de lijst met `replaceChildren()` vervangt, is elk element bij elke
`pushState()` nieuw. Een nieuw element wordt meteen op zijn eindwaarde getekend,
dus er is geen intree; een verwijderd element is weg vóór het eerste frame, dus
er is geen uittree; `:active` overleeft de klik niet; focus en een halfgetypte
workspacenaam verdwijnen; en `maakGlyph()` begint per hertekening opnieuw, zodat
de stand `klaar` — de enige eenmalige animatie in `glyph.js` — nooit afloopt.

### 1.1 Verzoenen op id

Ongeveer zestig regels vanilla JS in `app.js`, binnen alle projectregels.

```js
// --- de tabbladlijst verzoenen ---------------------------------------
// Het hoofdproces stuurt de volledige lijst; wij vervangen die niet maar leggen
// hem naast wat er staat. Een rij die blijft bestaan kan aanwijzen, indrukken,
// focus en een lopende animatie overleven — een rij die bij elke pushState
// opnieuw geboren wordt kan dat geen van alle. Dat is de reden, niet de snelheid.
const rijen = new Map(); // tabId -> { li, titel, merk, glyph }

function verzoenTabbladen(tabs, activeId) {
  const vorige = meetRijen(); // FLIP: waar stond alles vóór deze ronde?
  const gezien = new Set();

  for (const tab of tabs) {
    let rij = rijen.get(tab.id);
    if (!rij) {
      rij = maakRij(tab);
      rijen.set(tab.id, rij);
      // Speelt precies één keer af, omdat dit element precies één keer ontstaat.
      rij.li.classList.add('komt');
    }
    werkRijBij(rij, tab, tab.id === activeId);
    // append verplaatst een bestaande node; dat is meteen de herordening.
    tablist.append(rij.li);
    gezien.add(tab.id);
  }

  for (const [id, rij] of rijen) {
    if (gezien.has(id)) continue;
    rijen.delete(id);
    rij.li.remove();
  }

  schuifDicht(vorige);
}

function werkRijBij(rij, tab, actief) {
  // Alleen wat verandert aanraken. textContent onvoorwaardelijk zetten breekt
  // een selectie en een lopende teksttransitie zonder dat er iets wijzigt.
  zetTekst(rij.titel, tab.leeg ? 'Nieuw tabblad' : tab.title || hostVan(tab.url));
  rij.li.title = tab.owner ? `${tab.owner}: ${tab.title}\n${tab.url}` : `${tab.title}\n${tab.url}`;
  rij.li.classList.toggle('ladend', tab.loading);
  rij.li.classList.toggle('agent', Boolean(tab.owner));
  rij.li.setAttribute('aria-selected', String(actief));
  // De glyph bestaat één keer per rij en houdt zijn eigen tekenlus. Hem opnieuw
  // maken zou 'klaar' eeuwig opnieuw laten beginnen en lussen laten stapelen.
  if (rij.glyph) rij.glyph.zet(tab.modus ?? 'rust');
  if (tab.modus) rij.li.style.setProperty('--modus-kleur', `var(--modus-${tab.modus})`);
}

function zetTekst(el, tekst) {
  if (el.textContent !== tekst) el.textContent = tekst;
}
```

`nextId` loopt per venster op en wordt nooit hergebruikt (main.js:84), dus een id
is een veilige sleutel: er komt nooit een nieuw tabblad met het id van een oud.

### 1.2 FLIP, en waarom dat geen layoutanimatie is

`ui-systeem.md` §6.3 verbiedt animatie op layout, en terecht. FLIP animeert
alleen `transform`: de rijen staan meteen op hun eindpositie en worden visueel
teruggeduwd. De kolom schokt dus niet, hij schuift.

```js
const rustig = window.matchMedia('(prefers-reduced-motion: reduce)');

function meetRijen() {
  const kaart = new Map();
  for (const [id, rij] of rijen) kaart.set(id, rij.li.getBoundingClientRect().top);
  return kaart;
}

function schuifDicht(vorige) {
  // Element.animate loopt buiten CSS om, dus het blok voor reduced motion in
  // style.css raakt het niet. Hier zelf afzien van beweging.
  if (rustig.matches) return;
  for (const [id, rij] of rijen) {
    const was = vorige.get(id);
    if (was === undefined) continue; // nieuw; die komt binnen met .komt
    const verschil = was - rij.li.getBoundingClientRect().top;
    if (Math.abs(verschil) < 1) continue;
    rij.li.animate(
      [{ transform: `translateY(${verschil}px)` }, { transform: 'none' }],
      { duration: 150, easing: 'cubic-bezier(0.15, 0.9, 0.25, 1)' },
    );
  }
}
```

**Uittree bestaat niet in deze richting.** Klik je een tabblad weg, dan is de rij
weg — meteen, in hetzelfde frame — en het gat sluit in 150ms. Een rij die nog
90ms staat te vervagen terwijl hij al gesloten is, liegt over de toestand van de
app. Dat is precies het soort vriendelijkheid dat een instrument niet heeft.

### 1.3 Wat er nog meer bij hoort in het hoofdproces

`pushState()` wordt gevoed door zes webContents-events per tabblad (main.js:388-397)
en `did-navigate-in-page` vuurt bij elke history-push van een SPA. Verzoenen maakt
de hertekening onschadelijk, maar het serialiseren van alle tabbladen én alle
workspaces blijft zonde. Eén samenvoeging per tick:

```js
// Een SPA vuurt did-navigate-in-page tientallen keren per seconde. De renderer
// hoeft die niet allemaal te zien: één stand per tick is precies zo waar.
pushState() {
  if (this.pushGepland) return;
  this.pushGepland = true;
  setImmediate(() => {
    this.pushGepland = false;
    this.stuurStand();
  });
}
```

---

## 2. Kleur

### 2.1 Twee palletten die elkaar niet mogen raken

De app heeft twee kleursystemen met verschillende betekenissen, en die lopen nu
door elkaar: `--accent` en `--ws-0` zijn allebei `#007aff`, de glyphkleur
`rgb(62,210,128)` ligt bovenop `--ws-2` (`#34c759`), en er lopen zes verschillende
blauwen door de app (`#007aff`, `#0a84ff`, `#2f6fd0`, `#4c9bff`, `#589eff`,
`#6084ba`). Dan betekent één kleur op één rij twee dingen.

**Het besluit: kleur mag maar in drie systemen voorkomen, en die overlappen niet.**

| Systeem | Wie | Waar zichtbaar |
| --- | --- | --- |
| Bediening | `--accent`, `--danger` | selectie, focus, primaire knop, vernietigen |
| Toestand van de assistent | `--modus-*` | glyph, de modusbalk op een rij, het eiland |
| Context | `--ws-0…5` | workspacemonogram, en verder niets |

De modus-tokens spiegelen `GLYPH_KLEUREN` in `glyph.js` exact. Canvas heeft
getallen nodig, CSS heeft een token nodig, en er is bewust geen build-stap — dus
twee bronnen met een commentaar dat naar elkaar wijst, precies zoals
`ui-systeem.md` §10 dat voor `tokens.js` afspreekt.

```css
:root {
  /* Deze zes spiegelen GLYPH_KLEUREN in renderer/glyph.js. Canvas heeft rgb-
     getallen nodig en CSS een token; er is geen build-stap om dat te delen.
     Wijzig je er één, wijzig je ze allebei. */
  --modus-zoeken:     #ff5c58;
  --modus-lezen:      #f2c840;
  --modus-analyseren: #3ed280;
  --modus-klaar:      #3ed280;
  --modus-debuggen:   #589eff;
  --modus-actie:      #ff9628;
  --modus-invoer:     #78a8ff;
  --modus-rust:       #6084ba;

  /* Stond als #ff9f0a apart naast de oranje glyph. Eén oranje. */
  --assistent: var(--modus-actie);
}
```

En de workspacekleuren schuiven weg van alles hierboven. Violet, magenta, teal,
brons, olijf en leisteen: zes tinten die geen van alle in de buurt komen van
accentblauw, gevaarsrood, of een van de zes modus-kleuren.

```css
:root {
  --ws-0: #7c5cff; /* violet    */
  --ws-1: #d6529b; /* magenta   */
  --ws-2: #12a594; /* teal      */
  --ws-3: #b3801f; /* brons     */
  --ws-4: #6f9a2e; /* olijf     */
  --ws-5: #5f7d9a; /* leisteen  */
}

@media (prefers-color-scheme: dark) {
  :root {
    --ws-0: #9b82ff;
    --ws-1: #ea6cae;
    --ws-2: #2cc0ae;
    --ws-3: #d29b32;
    --ws-4: #8bb843;
    --ws-5: #7f9bb6;
  }
}
```

Zes vrije tinten zijn er niet meer, en dat is eerlijk gezegd krap: brons ligt in
de buurt van `--modus-lezen` en olijf in de buurt van `--modus-analyseren`, alleen
donkerder en doffer. Dat is de reden dat het workspacemonogram in §5.4 **geen
optie** is maar de eigenlijke drager: kleur is daar de bevestiging, niet de
boodschap. `ui-systeem.md` §2.3 zegt dat al; hier is het afdwingbaar geworden.

### 2.2 De transparantietrap, perceptueel in plaats van rekenkundig

Nu is licht `.42 → .62 → .82` (stappen van .20 wit) en donker `.06 → .10 → .14`
(stappen van .04). Rekenkundig netjes, visueel twee verschillende ontwerpen: in
licht wordt het actieve tabblad 82% wit met een glans van .55 en een lijn van
.85, dus vrijwel dicht — precies daar waar je het meeste kijkt slaat het acrylic
dood. In donker is dezelfde stand een verschil van 8% wit met een zwarte schaduw
die op een donkere doorschijnende ondergrond niets doet.

**Licht wordt lichter aangezet, donker sterker, en de verhoging komt in donker
van een randje in plaats van van een schaduw.**

```css
:root {
  color-scheme: light dark;

  /* Tekst. --muted gaat omhoog: de rijen die je scant zijn de inactieve, dus
     die moeten leesbaar zijn. Het onderscheid actief/inactief komt van gewicht
     en vlak (§3), niet van verbleking. */
  --text:  rgba(0, 0, 0, 0.88);
  --muted: rgba(0, 0, 0, 0.58);
  --faint: rgba(0, 0, 0, 0.38);

  /* Vullingen. Lager dan voorheen: onder een vlak van 66% wit leeft het acrylic
     nog, onder 82% niet meer. De trap is met opzet niet lineair — van niets naar
     iets is een grotere stap dan van iets naar meer. */
  --fill:        rgba(255, 255, 255, 0.30);
  --fill-hover:  rgba(255, 255, 255, 0.46);
  --fill-active: rgba(255, 255, 255, 0.66);

  --stroke:        rgba(0, 0, 0, 0.09);
  --stroke-strong: rgba(0, 0, 0, 0.15);

  --glass-sheen: rgba(255, 255, 255, 0.38);
  --glass-line:  rgba(255, 255, 255, 0.72);

  /* Klein en dichtbij. Een grote zachte schaduw wordt op een licht bureaublad
     een grijze vlek; de hoogte moet uit de lijn komen, niet uit de wolk. */
  --shadow-tab:   0 1px 1px rgba(0, 0, 0, 0.04), 0 4px 10px rgba(0, 0, 0, 0.06);
  --shadow-press: inset 0 1px 2px rgba(0, 0, 0, 0.10);
  --shadow-card:  0 12px 40px rgba(0, 0, 0, 0.16), 0 2px 6px rgba(0, 0, 0, 0.07);

  --accent: #007aff;
  --danger: #ff3b30;
  --card:   rgba(255, 255, 255, 0.72);

  /* Een scrim hoort de laag eronder terug te duwen. Wit waas over een zijbalk
     die zelf uit witte lagen bestaat doet het omgekeerde: dan smelt het paneel
     erin. Dus in beide thema's donker, in licht alleen zwakker. */
  --scrim: rgba(0, 0, 0, 0.14);
}

@media (prefers-color-scheme: dark) {
  :root {
    --text:  rgba(255, 255, 255, 0.94);
    --muted: rgba(255, 255, 255, 0.60);
    --faint: rgba(255, 255, 255, 0.36);

    /* Hogere top: een verschil van 8% wit is op een donkere ondergrond geen
       verheven plaatje. .18 is wat je nog als glas leest zonder dat het dichtslaat. */
    --fill:        rgba(255, 255, 255, 0.05);
    --fill-hover:  rgba(255, 255, 255, 0.10);
    --fill-active: rgba(255, 255, 255, 0.18);

    --stroke:        rgba(255, 255, 255, 0.10);
    --stroke-strong: rgba(255, 255, 255, 0.17);

    /* Weinig glans, sterke lijn: in het donker doet een verloop over het vlak
       niets en doet de rand alles. */
    --glass-sheen: rgba(255, 255, 255, 0.06);
    --glass-line:  rgba(255, 255, 255, 0.20);

    /* Zwart op halfdoorzichtig donker is onzichtbaar. De verhoging komt hier
       van een lichte rand rondom plus een smalle zoom eronder. */
    --shadow-tab:   0 0 0 1px rgba(255, 255, 255, 0.05), 0 4px 12px rgba(0, 0, 0, 0.28);
    --shadow-press: inset 0 1px 2px rgba(0, 0, 0, 0.35);
    --shadow-card:  0 16px 50px rgba(0, 0, 0, 0.5), 0 2px 8px rgba(0, 0, 0, 0.35);

    --accent: #0a84ff;
    --danger: #ff453a;
    --card:   rgba(28, 29, 32, 0.76);
    --scrim:  rgba(0, 0, 0, 0.34);
  }
}
```

De `--modus-*` en `--ws-*` uit §2.1 staan in beide blokken; §2.3 van
`ui-systeem.md` eist dat, anders breekt een latere handmatige themakeuze.

### 2.3 Wat kleur niet meer mag

- **Niet twee dragers voor hetzelfde signaal.** De stip `.bezig` in
  `--assistent` naast een glyph in de moduskleur verdwijnt (style.css:280-287).
  Zie §6.6.
- **Niet als enige drager.** Een workspace heeft een monogram, een modus heeft
  een `title` en een `aria-label`, een fout heeft tekst.
- **`--faint` is decoratief.** Nooit de enige tekst in een rij. Dat is nu wel zo
  bij `Laden…` (style.css:269-271), en dat vervalt in §6.5.
- **Geen tweede blauw.** `#ga` in het eiland (`--ga-vlak: #2f6fd0`) wordt
  `--accent`, en de caret in `#invoer` (`#4c9bff`) ook. Anders haal je de
  betekenis uit de accentkleur.

---

## 3. Typografie

`font-weight` komt in `style.css` nul keer voor. De hele zijbalk staat op 13px/400
en de enige hiërarchie is kleur. Op een doorschijnende ondergrond boven een
onbekend bureaublad is kleurcontrast juist het zwakste middel dat er is. Dit is
de goedkoopste helft van "visueel beter".

`ui-systeem.md` §3.2 schrijft de schaal al voor. Hier de invulling per plek —
niets nieuws verzonnen, alleen toegewezen.

| Plek | Familie | Maat / regel | Gewicht | Kleur |
| --- | --- | --- | --- | --- |
| Sectiekop (`TABBLADEN`) | small | 10 / 1.2, `+0.06em`, uppercase | 600 | `--faint` |
| Toetsaanduiding `<kbd>` | small | 10 / 1.2, `+0.01em` | 500 | `--faint` |
| Workspacemonogram | small | 11 / 1, `+0.02em` | 600 | de ws-kleur |
| Tellers, tijden, groottes | small | 11 / 1.3, `tabular-nums` | 500 | `--muted` |
| Tabbladtitel, inactief | text | 13 / 1.4 | **400** | `--text` |
| Tabbladtitel, actief | text | 13 / 1.4 | **500** | `--text` |
| Host in de adresbalk | text | 13 / 1.4 | **500** | `--text` |
| Pad in de adresbalk | text | 13 / 1.4 | 400 | `--muted` |
| `Nieuw tabblad` | text | 13 / 1.4 | 400 | `--muted` |
| Regel in het eiland | text | 14 / 1.35 | 500 | `--tekst` |
| Vorige regel in het eiland | small | 11 / 1.25 | 400 | `--zacht` |
| Invoer in de commandobalk | text | 15 / 1.4 | 400 | `--text` |

Drie dingen die dat oplost:

1. **Actief versus inactief is niet langer een kleurverschil.** Een inactieve
   tabbladtitel staat op `--text`/400 en is dus gewoon leesbaar; de actieve staat
   op 500 met het glasplaatje eronder. Dat is de omkering van de huidige
   situatie, waarin juist de enige rij die je níét hoeft te lezen de best
   leesbare is.
2. **De adresbalk wordt afleesbaar.** Host in 500, de rest in 400/`--muted`. Dat
   kan niet in één `<input>`, dus er ligt een weergavelaag overheen die verdwijnt
   zodra het veld focus krijgt — zie §5.3.
3. **De sectiekop geeft de kolom een anker.** 10px/600 in kapitalen met ruime
   tracking is het cockpitlabel: het roept niet, maar het scheidt wel. Dat is de
   plek waar het aantal tabbladen komt te staan.

Het risico staat in `ui-systeem.md` §3.1 en geldt hier extra hard: de optische
snedes bestaan alleen op Windows 11 en macOS. Valt alles terug op Segoe UI of
DejaVu Sans, dan is 400 tegenover 500 een veel zwakker verschil dan bedoeld en
draagt alleen het glasplaatje de hiërarchie nog. Zie §9.2.

---

## 4. Maat, raster en radii

### 4.1 Eén rijhoogte

De zijbalk heeft nu 28 (workspacechip), 30 (icoonknop), 33 (adresbalk) en 34
(tabblad, `#new-tab`) door elkaar, met tussenafstanden van 2, 3, 8 en 12. Drie
maten en drie afstanden in één kolom van 264px leveren geen ritme op maar ruis.

**Alles wat een rij is, is 30px hoog.** Icoonknop, adresbalk, tabblad,
workspacechip. Tussen rijen in een lijst 2px, tussen blokken 12px.

| Maat | Waarvoor |
| --- | --- |
| 16px | favicon, glyph in de zijbalk, sluitkruisje in een chip |
| 20px | sluitkruisje in een tabblad |
| 24px | `#new-tab` — bewust lager dan een rij, want het is geen item (§5.5) |
| 30px | elke rij in de zijbalk |
| 44px | `TOPBAR_HEIGHT`, het plafond |
| 54px | het invoerveld van de commandobalk |

Winst: bij een venster van 840px hoog passen er bij 34+2 pixels pitch 20
tabbladen in de lijst en bij 30+2 pitch 23. Dat is geen enorme sprong, maar het
is de goede kant op en de kolom wordt er meteen rustiger van omdat alles op
dezelfde lijn zit.

### 4.2 Vier radii, niet tien

Nu staan er 4, 5, 6, 7, 8, 9, 10, 11, 17 en 18 in de twee stylesheets, waarvan
drie als variabele. Een verschil van 1px leest niet als een keuze.
`ui-systeem.md` §4.1 zet de ladder al op negen sporten; **deze richting gebruikt
er vier**, en de rest van de ladder blijft gereserveerd voor panelen die er nog
niet zijn.

```css
:root {
  --radius-icon:    6px;  /* sluitkruisje, alles kleiner dan 24px       */
  --radius-control: 8px;  /* elke rij van 30px: knop, veld, tabblad, chip */
  --radius-content:12px;  /* spiegelt CONTENT_RADIUS in main.js          */
  --radius-card:   16px;  /* zwevend paneel én het eiland                */
}
```

Dat betekent: `--radius-tab` en `--radius-field` verdwijnen als aparte tokens en
worden `--radius-control`. Het eiland gaat van `--hoek: 17px` naar
`--radius-card: 16px`, zodat de pil en de commandobalk dezelfde vorm hebben — ze
zijn allebei "een zwevend paneel", en dat ze nu 1px verschillen is toeval.

**Concentrisch:** binnenradius = buitenradius − afstand tot de rand. De
commandobalkkaart is 16 met 6px padding, dus de resultaatrijen zijn 10 — niet 9
zoals nu. In een tabbladrij van 8 met 7px marge is het sluitkruisje 6 (een
kruisje van 20px kan geen 1px radius hebben; 6 is hier de praktische ondergrens).

### 4.3 De rail

De zijbalk heeft drie bijna gelijke linkerkantlijnen: inkt van het terugicoon op
~24,5px, tekst in de adresbalk op 25px, faviconvak op 20px. Vier pixels verschil
leest niet als inspringing maar als een trillende rand.

**Eén rail op 20px.** Alles wat een pictogram of favicon is, begint daar; alle
tekst die ernaast staat begint op 44px (20 + 16 + 8 gap).

```css
#sidebar {
  /* 10px lucht boven de knoppen: nu is padding-top exact --topbar-height, dus
     raakt de eerste knoprij de onderrand van het zwarte plafond. Dat is de meest
     opvallende naad in het beeld en er stond geen enkele ruimte omheen. */
  padding: calc(var(--topbar-height) + 10px) 12px 12px;
  gap: 12px;
}

/* Icoonvakken links uitlijnen op de rail: 12 padding + 8 binnenmarge = 20. */
#controls button { width: 30px; height: 30px; }
#controls svg    { width: 16px; height: 16px; }
#address         { padding: 0 8px 0 44px; } /* zie §5.3: er staat een icoon links */
.tab             { padding: 0 8px; }        /* 12 + 8 = 20, favicon start op de rail */
```

Alle blokafstanden worden 12px. De scheidingslijn boven de footer wordt optisch
gecentreerd in die 12 (`padding-top: 11px`, `margin-top: -1px` op de rand), zodat
er niet ineens 16px staat waar 12 hoort.

---

## 5. De zijbalk als compositie

```
┌── plafond, 44px, altijd donker ─────────────────────────┐
│  ■ Persoonlijk                    │  (eiland, eigen laag)│   ← §5.1
├───────────────────────────────────┘                      │
│  (10px)                                                  │
│  ◀  ▶  ⟳                                    ⚙   30px      │   ← §5.2
│  (12px)                                                  │
│  🔒 github.com /anthropics/claude        30px            │   ← §5.3
│  (12px)                                                  │
│  TABBLADEN                                    7          │   ← §5.4
│  (6px)                                                   │
│  ▌◧ Pull requests · anthropics/claude       30px         │
│    ◧ Segoe UI Variable — Microsoft Learn                 │
│  ▌◧ Kim zoekt naar CSS mask-image                        │
│  …                                                       │
│  (6px)                                                   │
│  +  Nieuw tabblad                     Ctrl T   24px      │   ← §5.5
│  (12px)                                                  │
│  ──────────────────────────────────────────────          │
│  (11px)                                                  │
│  PE  WK  KL                                    +   30px  │   ← §5.6
│  (12px)                                                  │
└──────────────────────────────────────────────────────────┘
```

### 5.1 Het plafond wordt de kop van de app

De linkerkant van `#drag-strip` is nu 264 × 44 pixels zwart met niets erin,
terwijl het eiland twintig pixels verderop met twee holle hoekjes uit datzelfde
plafond komt. De zorgvuldigste plek van het ontwerp staat naast de slordigste.

Twee ingrepen.

**a. De werkruimtenaam gaat in het plafond.** Dat is de enige plek in de app die
altijd zichtbaar is en niets doet, en het is precies het soort aflezing dat een
instrument bovenaan zet: in welke wereld zit ik. Bijkomend gevolg: de chips
onderin hoeven hun naam niet meer te dragen, dus ze kunnen allemaal even breed
zijn en de strip verspringt nooit meer (§5.6).

```css
#plafondkop {
  position: fixed;
  top: 0;
  left: 0;
  width: var(--sidebar-width);
  height: var(--topbar-height);
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 0 12px 0 20px; /* dezelfde rail als de rest van de kolom */
  color: #e8ebef;         /* het plafond is altijd donker, dus altijd lichte tekst */
  font-size: 13px;
  font-weight: 500;
  pointer-events: none;   /* het blijft een sleepgebied */
}

/* De stoplichten van macOS staan op x:18, y:16 (main.js:112) en zouden hier
   dwars doorheen lopen. app.js zet data-platform op <html> uit navigator. */
:root[data-platform="mac"] #plafondkop { padding-left: 78px; }

#plafondkop .stip {
  width: 8px;
  height: 8px;
  flex: none;
  border-radius: 50%;
  background: var(--ws-kleur);
}
```

**b. De naad bij x=264 wordt gegoten in plaats van gestapeld.** De pagina begint
op `(264, 44)` met een hoek van 12px (`CONTENT_RADIUS`), dus tussen plafond,
zijbalk en die ronding blijft een driehoekje venstermateriaal over. Dezelfde
truc als de holle hoekjes van het eiland vult dat:

```css
/* Het plafond loopt door in de hoek van de pagina, net zoals het eiland eruit
   groeit. Zonder dit blijft er een driehoekje bureaublad tussen plafond,
   zijbalk en de ronding van de pagina staan. */
#drag-strip::after {
  content: "";
  position: absolute;
  top: 100%;
  left: var(--sidebar-width);
  width: var(--radius-content);
  height: var(--radius-content);
  background: radial-gradient(
    circle var(--radius-content) at 100% 100%,
    transparent var(--radius-content),
    var(--plafond) var(--radius-content)
  );
}
```

Dit werkt omdat de pagina buiten haar eigen ronding niets tekent en de
zijbalkrenderer daar dus doorheen komt. Twee kanttekeningen, allebei uit de
Electron-typings: `setBorderRadius()` draagt de notitie *"The area cutout of the
view's border still captures clicks"* (electron.d.ts:14269), dus dit hoekje is
puur visueel — je kunt het venster daar niet aan verslepen. En ik heb niet op een
scherm nagekeken of dat driehoekje er in de praktijk ook echt staat; ik leid het
af uit `layoutActiveTab()` (main.js:261-271).

### 5.2 Knoprij, met de ingang naar instellingen

Er is nergens een knop naar instellingen en in de footer past er ook geen bij:
`#workspace-list` is `flex: 1` binnen 240px en loopt nu al over. Een derde
element van 30px daar haalt de strip verder leeg. `#controls` gebruikt 94 van de
240px en heeft ruimte zat, staat op de plek waar elke browser zijn "meer"-knop
heeft, en het tandwiel gaat over de app en niet over deze workspace — wat het
naast `#new-workspace` wél zou suggereren.

```css
#controls { display: flex; align-items: center; gap: 2px; }
#instellingen { margin-left: auto; }
```

De knop is de minst belangrijke helft. De vindbaarheid komt van twee andere
dingen: `Ctrl ,` in `app.js`, en een regel **Instellingen** in de commandobalk —
die is nu een zoeklijst zonder één enkel commando erin, terwijl hij "commandobalk"
heet.

Een nieuw kanaal, Engels werkwoord conform `CLAUDE.md` en ROUTEKAART §1.1:

```js
// pref:open activeert een bestaand instellingen-tabblad in plaats van een tweede
// te openen. Vijf identieke rijen in een lijst waar je toch al zoekt is erger
// dan geen knop.
ipcMain.handle('pref:open', (e) => controllerFor(e)?.openSettings());
```

`preload.js` krijgt er één methode bij: `openSettings: () => ipcRenderer.invoke('pref:open')`.

**En:** `#reload` wordt een schakelaar. `tab.loading` zit al in de state
(main.js:332) maar wordt nergens getoond behalve als bleke titel. Laadt de
actieve pagina, dan toont dezelfde knop een kruis en heet hij "Stoppen"
(`wc.stop()`). Dat is een aflezing én een ontbrekende functie, voor nul extra
ruimte.

### 5.3 De adresbalk toont waar je bent

De adresbalk beantwoordt precies één vraag en doet dat nu niet: `addressIsDirty`
wordt bij `blur` niet teruggezet, dus half getypte invoer blijft staan terwijl de
pagina verder navigeert, en Escape doet niets.

**Twee lagen, één waarheid.** Het `<input>` blijft het bewerkveld; erover ligt
een weergave die de waarheid toont zolang je niet typt.

```html
<div id="adresveld">
  <svg id="adres-slot" viewBox="0 0 16 16" aria-hidden="true">…</svg>
  <input id="address" type="text" spellcheck="false" autocomplete="off"
         placeholder="Zoek of voer een adres in" aria-label="Adresbalk" />
  <div id="adres-weergave" aria-hidden="true">
    <span class="host"></span><span class="pad"></span>
  </div>
</div>
```

```css
#adresveld { position: relative; height: 30px; }

#adres-slot {
  position: absolute;
  left: 8px;
  top: 7px;
  width: 16px;
  height: 16px;
  color: var(--muted);
  pointer-events: none;
}

#address {
  width: 100%;
  height: 100%;
  padding: 0 8px 0 44px; /* icoon op de rail, tekst op 44 */
  border: 1px solid var(--stroke);
  border-radius: var(--radius-control);
  background-color: var(--fill);
  background-image: var(--glas-vlak);
  box-shadow: var(--glas-lijn);
  color: var(--text);
  caret-color: var(--accent);
  font: inherit;
  transition:
    background-color var(--duur-vlak) var(--ease-vlak),
    border-color var(--duur-vlak) var(--ease-vlak),
    box-shadow var(--duur-vlak) var(--ease-vlak);
}

/* Zolang je niet typt is de tekst van het veld onzichtbaar en tekent de
   weergavelaag hem opnieuw: de host in 500, de rest zacht. Eén <input> kan geen
   twee gewichten dragen, en dit is de enige plek waar dat echt iets oplevert. */
#adresveld:not(:focus-within) #address { color: transparent; }
#adresveld:focus-within #adres-weergave { display: none; }

#adres-weergave {
  position: absolute;
  inset: 0 8px 0 44px;
  display: flex;
  align-items: center;
  overflow: hidden;
  white-space: nowrap;
  pointer-events: none;
}

#adres-weergave .host { font-weight: 500; color: var(--text); }
#adres-weergave .pad  { color: var(--muted); overflow: hidden; text-overflow: ellipsis; }

#address:hover { background-color: var(--fill-hover); }

#address:focus {
  outline: none;
  background-color: var(--fill-active);
  border-color: color-mix(in srgb, var(--accent) 46%, transparent);
  /* 11% is op een doorschijnende ondergrond over een willekeurig bureaublad
     praktisch onzichtbaar; ui-systeem §7.2 noemt 14% als compromis en dat is
     voor dit materiaal nog aan de lage kant. */
  box-shadow: var(--glas-lijn), 0 0 0 3px color-mix(in srgb, var(--accent) 18%, transparent);
}
```

Bijbehorend gedrag in `app.js`: `blur` en `Escape` zetten `addressIsDirty = false`
en herstellen `address.value` uit `laatsteStaat`. Het slotpictogram leest `https`
uit de URL en wordt anders een waarschuwingsdriehoek in `--warn`.

### 5.4 De sectiekop

Eén rij van 18px die twee dingen doet die nu nergens staan: hij scheidt de lijst
van de adresbalk zonder een lijn te trekken, en hij zegt hoeveel tabbladen er
open zijn — wat je nu alleen kunt weten door blind te scrollen, omdat
`#tablist::-webkit-scrollbar { width: 0 }` de scrollbalk weghaalt zonder
vervanging.

```css
#lijstkop {
  flex: none;
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  height: 18px;
  padding: 0 8px;
  margin-bottom: 6px;
  font-family: var(--font-small);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--faint);
}

/* Zonder tabular-nums danst dit getal bij elke wijziging. */
#tabtal { font-variant-numeric: tabular-nums; }
```

En de lijst krijgt een randvervaging in plaats van niets, zodat je ziet dát er
meer is:

```css
#tablist {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
  scrollbar-width: none;
}

/* Alleen maskeren aan de kant waar werkelijk iets buiten beeld valt, anders
   vervaagt de bovenste rij ook als er niets te scrollen is. app.js zet deze twee
   attributen bij scroll en na elke verzoening. */
#tablist[data-boven] { mask-image: linear-gradient(180deg, transparent 0, #000 14px); }
#tablist[data-onder] { mask-image: linear-gradient(0deg,   transparent 0, #000 14px); }
#tablist[data-boven][data-onder] {
  mask-image: linear-gradient(180deg, transparent 0, #000 14px, #000 calc(100% - 14px), transparent 100%);
}
```

```js
function zetRanden() {
  const t = tablist;
  t.toggleAttribute('data-boven', t.scrollTop > 2);
  t.toggleAttribute('data-onder', t.scrollTop + t.clientHeight < t.scrollHeight - 2);
}
tablist.addEventListener('scroll', zetRanden, { passive: true });
```

Plus: bij een echte wisseling van het actieve id scrollt de lijst ernaartoe.
Alleen bij een wisseling — anders scrollt de lijst bij elke `pushState` van een
ladende pagina onder je muis vandaan.

```js
if (activeId !== vorigActiefId) {
  rijen.get(activeId)?.li.scrollIntoView({ block: 'nearest' });
  vorigActiefId = activeId;
}
```

### 5.5 `#new-tab` is een actie, geen item

Nu heeft hij exact de geometrie en het hovergedrag van een tabblad: 34px, dezelfde
radius, dezelfde padding, dezelfde `--fill` bij hover. De lijst lijkt daardoor
altijd één tabblad meer te bevatten dan er is.

```css
#new-tab {
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
  height: 24px;
  padding: 0 8px;
  margin-top: 6px;
  border-radius: var(--radius-icon);
  color: var(--muted);
  /* Geen hoverplaat: een actie hoort niet dezelfde vorm aan te nemen als de
     items erboven. Alleen de kleur reageert. */
  transition: color var(--duur-vlak) var(--ease-vlak);
}

#new-tab:hover { color: var(--text); }
#new-tab:active { color: var(--muted); }
#new-tab svg { width: 14px; height: 14px; }
#new-tab kbd {
  margin-left: auto;
  font-family: var(--font-small);
  font-size: 10px;
  font-weight: 500;
  color: var(--faint);
  border: 1px solid var(--stroke);
  border-radius: 4px;
  padding: 0 4px;
}
```

### 5.6 De footer: monogrammen in plaats van stippen

De strip is nu krap omdat er drie maatvoeringen doorheen lopen (stippen van 9px
naast pictogrammen van 14-16, chips van 28 onder rijen van 34, afstanden van 3
onder afstanden van 2 en 8) en omdat elke stip een halo van `0 0 0 3px` draagt,
dus optisch 15px is in een chip met 8px binnenmarge. Twee naburige halo's komen
tot op ~3px bij elkaar.

Erger is wat de strip níét kan: een niet-actieve workspace is een stip van 9px
zonder tekst, de kleuren herhalen na zes (`colorIndex = (id - 1) % 6`), en de
naam verhuist bij een wisseling van de ene chip naar de andere — dus veranderen
alle chipbreedtes in één frame en schuift de hele rij. Bij hover op de actieve
chip komt daar nog 24px bij, want `.close` schakelt van `display: none` naar
`display: grid`.

**Elke chip is een vierkant van 30px met twee letters.** Altijd even breed, dus
niets verspringt ooit. De naam staat in het plafond (§5.1).

```css
#workspaces {
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
  padding-top: 11px;
  border-top: 1px solid var(--stroke);
}

#workspace-list {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 4px;
  overflow-x: auto;
  scrollbar-width: none;
  mask-image: linear-gradient(90deg, #000 calc(100% - 12px), transparent 100%);
}

.ws {
  position: relative;
  flex: none;
  width: 30px;
  height: 30px;
  display: grid;
  place-items: center;
  border-radius: var(--radius-control);
  /* Kleur bevestigt, het monogram vertelt. Zes tinten zijn niet genoeg om zeven
     workspaces uit elkaar te houden, en achter acrylic al helemaal niet. */
  background-color: color-mix(in srgb, var(--ws-kleur) 14%, transparent);
  color: var(--ws-kleur);
  font-family: var(--font-small);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.02em;
  transition:
    background-color var(--duur-vlak) var(--ease-vlak),
    box-shadow var(--duur-vlak) var(--ease-vlak);
}

.ws:hover:not([aria-current="true"]) {
  background-color: color-mix(in srgb, var(--ws-kleur) 24%, transparent);
}

.ws[aria-current="true"] {
  background-color: var(--fill-active);
  background-image: var(--glas-vlak);
  box-shadow: var(--glas-lijn), var(--shadow-tab),
    inset 0 0 0 1px color-mix(in srgb, var(--ws-kleur) 55%, transparent);
}

/* Het sluitkruisje neemt het monogram over in plaats van ernaast te komen: de
   chip mag niet breder worden, want dan schuift de hele strip onder je muis. */
.ws .close {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  border-radius: inherit;
  background: var(--fill-active);
  color: var(--muted);
  opacity: 0;
  pointer-events: none;
  transition: opacity var(--duur-tik) var(--ease-vlak);
}

.ws[aria-current="true"]:hover .close { opacity: 1; pointer-events: auto; }
.ws .close[data-armed="true"] { opacity: 1; pointer-events: auto; background: var(--danger); color: #fff; }

/* Onder 12px verdwijnt een streek van 1.6 in een viewBox van 16; zie
   ui-systeem §7.10. Die regel stond op papier en niet in de CSS. */
.ws .close svg { width: 11px; height: 11px; stroke-width: 1.8; }
```

Het monogram in `app.js`:

```js
// Twee letters: de beginletters van de eerste twee woorden, anders de eerste
// twee tekens. 'Persoonlijk' wordt PE, 'Werk klant' wordt WK.
function monogram(naam) {
  const woorden = naam.trim().split(/\s+/);
  const letters = woorden.length > 1 ? woorden[0][0] + woorden[1][0] : naam.trim().slice(0, 2);
  return letters.toUpperCase();
}
```

De bewapende sluitknop legt zich nu alleen uit in een systeemtooltip, die na
ongeveer een seconde verschijnt terwijl de bewapening na 2,5s vervalt. In deze
richting hoort die uitleg zichtbaar te zijn: een strookmelding boven de footer
(`ui:notice`, ROUTEKAART §1.1) met de tekst *"Nog een keer klikken sluit
Werk klant en 12 tabbladen"*.

---

## 6. Het tabblad als object

Zes standen, en elke stand heeft precies één drager.

| Stand | Vlak | Titel | Faviconvak | Extra |
| --- | --- | --- | --- | --- |
| Rust | geen | `--text` / 400 | favicon of leeg | — |
| Aanwijzen | `--fill` | idem | idem | sluitkruisje vervaagt in beeld |
| Indrukken | `--fill-hover` + `--shadow-press` | idem | idem | — |
| Actief | glasplaatje | `--text` / **500** | idem | sluitkruisje blijft staan |
| Ladend | onveranderd | `--muted`, **titel blijft staan** | ademt als er geen favicon is | 2px voortgangslijn, alleen op de actieve rij |
| Van een assistent | onveranderd | `--text` / 400 | glyph in de moduskleur | 2px modusbalk links |

```css
.tab {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  height: 30px;
  padding: 0 8px;
  border-radius: var(--radius-control);
  color: var(--text);
  font-weight: 400;
  transition:
    background-color var(--duur-vlak) var(--ease-vlak),
    box-shadow var(--duur-vlak) var(--ease-vlak),
    color var(--duur-vlak) var(--ease-vlak);
}

.tab:hover { background-color: var(--fill); }

/* Er is nu geen enkele :active-stand in de hele app, en button { cursor: default }
   haalt ook de cursorwissel weg. Tussen de klik en het antwoord van het
   hoofdproces zit een IPC-rondgang; in dat gat bevestigt niets dat je geraakt hebt. */
.tab:active {
  background-color: var(--fill-hover);
  box-shadow: var(--shadow-press);
}

.tab[aria-selected="true"] {
  background-color: var(--fill-active);
  background-image: var(--glas-vlak);
  box-shadow: var(--glas-lijn), var(--shadow-tab);
  font-weight: 500;
}

/* Leeg is leeg. Een grijs afgerond vierkantje van 16px links in een rij naast
   tekst is in elke desktop-UI een uitgevinkt selectievakje, en achter een PNG
   met transparantie piept het als lichte plaat onder het logo uit. */
.tab .favicon {
  width: 16px;
  height: 16px;
  flex: none;
  border-radius: 3px;
  background: none;
}

.tab .title {
  flex: 1;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
```

### 6.1 Het sluitkruisje kost geen breedte meer

Elke rij reserveert nu permanent 29px (kruisje 20 + gap 9) voor een knop die
alleen bij hover en op de actieve rij zichtbaar is. Van de 240px binnenbreedte
blijft ~170px voor de titel over. Absoluut positioneren geeft die 29px terug aan
elke rij die niet onder de muis ligt.

```css
.tab .close {
  position: absolute;
  right: 5px;
  top: 5px;
  width: 20px;
  height: 20px;
  display: grid;
  place-items: center;
  border-radius: var(--radius-icon);
  color: var(--muted);
  opacity: 0;
  /* opacity haalt een element niet uit de muisafhandeling: zonder dit sluit een
     trackpad-tik zonder voorafgaande hover een tabblad dat je nooit zag. */
  pointer-events: none;
  transition: opacity var(--duur-tik) var(--ease-vlak);
}

.tab:hover .close,
.tab[aria-selected="true"] .close { opacity: 1; pointer-events: auto; }
.tab .close:hover { background: var(--fill-hover); color: var(--text); }
.tab .close svg { width: 11px; height: 11px; stroke-width: 1.8; }

/* De titel loopt niet onder de knop door maar dooft ervoor uit. */
.tab:hover .title,
.tab[aria-selected="true"] .title {
  mask-image: linear-gradient(90deg, #000 calc(100% - 34px), transparent 100%);
}
```

### 6.2 De modusbalk vervangt de tweede stip

Op de rij van een bezige assistent staan nu twee statuskleuren die elkaar
tegenspreken: de glyph in de moduskleur en vijftien pixels verderop `.bezig`,
altijd oranje. Op één rij zie je groen en oranje, en er is geen manier om te
weten welke de waarheid is.

De stip verdwijnt. Wat ervoor terugkomt is een balk van 2px op de linkerrand, in
dezelfde moduskleur als de glyph — één signaal, twee dragers die het altijd eens
zijn, en scanbaar over de hele kolom zonder te lezen.

```css
.tab.agent::before {
  content: "";
  position: absolute;
  left: 0;
  top: 7px;
  bottom: 7px;
  width: 2px;
  border-radius: 0 2px 2px 0;
  background: var(--modus-kleur, var(--modus-rust));
}

.tab .glyph { background: none; }
```

`--modus-kleur` wordt gezet met `el.style.setProperty()`, via de CSSOM. Let op de
waarschuwing in `ui-systeem.md` §6.4: `index.html` heeft `style-src 'self'`, dus
een `style="…"`-attribuut wordt geblokkeerd; de CSSOM-weg valt daar voor zover ik
weet buiten, maar dat is niet in deze app nagemeten.

En het voorvoegsel `Kim · ` verdwijnt uit de titel (app.js:134). Van de ~170px
titelruimte gaat daar ~35px aan op, in exact hetzelfde gewicht en dezelfde kleur
als de titel, terwijl de gekleurde glyph en de modusbalk hetzelfde al zeggen. Wie
het toch moet lezen, leest de `title` of hoort het `aria-label`.

### 6.3 Toetsenbord en screenreader

Een browser waarvan het hele idee verticale tabbladen zijn, en die lijst is
uitsluitend met de muis te bedienen: `<li>` met een `onclick`, geen `tabindex`,
geen rol, `aria-current="false"` als string op alles wat niet actief is, geen
label op `#tablist`. Verzoening (§1) maakt focus pas mogelijk — een focusbaar
element in een lijst die per pushState vervangen wordt, verliest zijn focus bij
elke navigatie van elke openstaande pagina.

```html
<ol id="tablist" role="listbox" aria-label="Tabbladen" tabindex="0" aria-activedescendant="tab-7">
  <li class="tab" id="tab-7" role="option" aria-selected="true">…</li>
</ol>
```

Eén tabstop voor de hele lijst, pijltoetsen erbinnen, Enter activeert, Delete of
Ctrl+W sluit. `aria-selected` in plaats van `aria-current`, want dit is een
keuzelijst. De focusring is de standaard uit `ui-systeem.md` §8:

```css
#tablist:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
#tablist:focus-visible .tab[aria-selected="true"] {
  box-shadow: var(--glas-lijn), var(--shadow-tab),
    inset 0 0 0 2px color-mix(in srgb, var(--accent) 70%, transparent);
}
```

**En de sneltoetsen moeten uit de renderer weg.** `document.addEventListener('keydown')`
in `app.js` hangt aan het document van de zijbalk; zodra je in een pagina klikt
bestaat het toetsenbord niet meer, want een tabblad is een eigen
`WebContentsView` met een eigen focusketen. Ctrl+K is dan onbereikbaar op precies
het moment waarop je hem nodig hebt. Het patroon staat al in `main.js`:
`devtoolsSneltoets()` doet het via `before-input-event` per webContents
(main.js:64-70). Datzelfde per tabblad, voor Ctrl+T/L/K/J/W/,/1-9.

### 6.4 De glyph in de zijbalk

De vierkantjes zijn het beste wat de app heeft en blijven precies zoals ze zijn —
met twee correcties die ze juist zichtbaar maken.

**a. Het raster schaalt mee.** Nu is `cel = (zijde - 4 - (n - 1) * gap) / n` met
een vaste padding van 4. Bij `zijde: 16, n: 5` levert dat 1,6 pixel per cel met
1px ertussen op: geen patroon meer, alleen een gekleurd vlekje dat een beetje
flikkert. Precies het detail waar de eigenaar aan hecht, weggegooid.

```js
// De padding schaalt mee met de zijde: op 4 vaste pixels blijft er bij 16px
// niets over om een patroon in te tekenen. En onder 22px is zeven kolommen niet
// meer op te lossen, dus daar drie — hetzelfde gebaar, grover getekend.
const n = opties.n ?? (zijde >= 22 ? 7 : 3);
const rand = zijde * 0.12;
const gap = zijde * 0.05;
const cel = (zijde - rand * 2 - (n - 1) * gap) / n;
```

Bij `zijde: 16` wordt de cel dan 3,5px in plaats van 1,6px. In het eiland
(`zijde: 26, n: 7`) verandert er vrijwel niets, en dat is de bedoeling: dat is de
tekening die goed is.

Dat de zijbalk en het eiland daarmee een ander raster tekenen is een bewuste
ruil. Leesbaarheid op 16px wint van rasterpariteit, en de *beweging* blijft
herkenbaar: een verticale veeg blijft een verticale veeg bij drie kolommen.

**b. `prefers-reduced-motion`.** Een canvas met een eigen `requestAnimationFrame`
valt volledig buiten het CSS-blok in `style.css:616-623`. Wie beweging heeft
uitgezet krijgt nu in de zijbalk én in het eiland alsnog het element dat het
meest beweegt van alles. Simpelweg de lus stoppen mag niet, want hier draagt
beweging betekenis. `ui-systeem.md` §6.5 schrijft de oplossing al voor; hij is
alleen nooit gebouwd:

```js
// Deze glyph is canvas, dus het reduced-motion-blok in style.css raakt hem niet.
// Zijn beweging draagt betekenis, dus hij verdwijnt niet maar valt stil op één
// herkenbaar beeld per stand: t = 0.25 geeft in elke stand een leesbaar patroon.
const rustig = window.matchMedia('(prefers-reduced-motion: reduce)');

function teken(nu) {
  const t = rustig.matches ? 0.25 : nu / 1000;
  /* … tekenen … */
  if (!rustig.matches) requestAnimationFrame(teken);
}
rustig.addEventListener('change', () => requestAnimationFrame(teken));
```

`matchMedia` is een web-API, dus dit blijft geschikt voor het sandboxed tabblad
dat `glyph.js` meedeelt (CLAUDE.md, conventies).

### 6.5 Ladend

Nu gooit een ladende rij de titel weg en zet er `Laden…` in `--faint` voor in de
plaats. Bij elke navigatie in een open tabblad wisselt de regel dus van een
leesbare titel naar bleke grijze tekst en terug, en omdat `pushState()`
voortdurend vuurt zie je dat flikkeren. Bij drie tabbladen die tegelijk laden
staan er drie identieke regels `Laden…` en ben je je plaats kwijt.

**De titel blijft staan.** Is er nog geen titel, dan de hostnaam. Wat er
verandert is de kleur (één stap zachter) en het faviconvak.

```css
/* Titel blijft, kleur zakt één stap. Informatie weggooien om te melden dat er
   informatie onderweg is, is de verkeerde ruil. */
.tab.ladend .title { color: var(--muted); }

/* Alleen als er nog geen favicon is: een ademend vlak in plaats van een gat. */
.tab.ladend .favicon:not([src]) {
  background: var(--skelet);
  border-radius: 3px;
  animation: adem 1.4s ease-in-out infinite;
}

@keyframes adem {
  0%, 100% { opacity: 0.45; }
  50%      { opacity: 1; }
}

/* Een voortgangslijn alleen op de rij die je op dit moment bekijkt. Twintig
   bewegende haarlijnen in één kolom is geen aflezing meer maar geflikker. */
.tab.ladend[aria-selected="true"]::after {
  content: "";
  position: absolute;
  left: 8px;
  right: 8px;
  bottom: 2px;
  height: 2px;
  border-radius: 1px;
  background: linear-gradient(90deg, transparent, var(--accent), transparent);
  background-size: 40% 100%;
  background-repeat: no-repeat;
  animation: loopt 1.1s var(--ease-rond) infinite;
}

@keyframes loopt {
  from { background-position: -40% 0; }
  to   { background-position: 140% 0; }
}
```

En `<img>` krijgt een `onerror` die `src` weer weghaalt, zodat een kapotte
favicon-URL hetzelfde niets oplevert in plaats van het gebroken-afbeeldingicoon.

### 6.6 Wat er van het tabblad af mag

- de achtergrond onder het lege faviconvak;
- de stip `.bezig` en de keyframes `kloppen`;
- het voorvoegsel `Kim · ` in de titel;
- `Laden…` als vervanger van de titel;
- de 29px die het sluitkruisje permanent reserveert;
- `.tab.loading .title { color: var(--faint) }` (wordt `--muted`);
- de klasse `loading` zelf, ten gunste van `ladend` — de rest van de
  renderer is Nederlands, alleen deze klasse niet.

---

## 7. Het eiland

Het eiland is de statusregel van dit instrument: het zegt wat er in een tabblad
gebeurt waar je niet naar kijkt. Het moet daarom klein zijn als er niets is,
groot als er iets is, en de overgang moet je kunnen volgen — want die overgang
*is* het nieuws.

### 7.1 Wat er nu misgaat

1. `island.js` zet de HTML meteen om en meldt daarna pas via `island:size` de
   nieuwe maat, waarna `main.js` `setBounds()` doet (island.js:35-44 tegenover
   main.js:284-290). De inhoud is dus al veranderd terwijl de view nog de oude
   breedte heeft: minstens één frame geknipte inhoud bij elke standwissel, het
   duidelijkst bij rust → invoer, waar de pil van ~109px naar ~226px springt (een
   `<input>` zonder breedte pakt zijn standaard `size=20`).
2. De inhoud van de pil staat niet in de pil gecentreerd:
   `padding: calc(var(--plafond-hoogte) - 8px) 15px 11px` zet de rij op y=36
   terwijl het plafond tot y=44 loopt. Acht van de 26 pixels van de glyph liggen
   ín het plafond. Dat magische `- 8px` is de enige reden dat het er ongeveer
   goed uitziet.
3. `--vulling: 13px` staat ook als `const marge = 13` in `island.js:16`, en de
   minimumbreedte staat op drie plekken (`min-width: 96px`, twee maal
   `Math.max(120, …)`). De holle hoekjes zijn een radial-gradient die exact op
   `--vulling` past: 1px verschil geeft een zichtbare naad.

### 7.2 De vorm

```css
:root {
  --hoek: 16px;        /* gelijk aan --radius-card: pil en paneel zijn hetzelfde ding */
  --plafond-hoogte: 44px;
  --vulling: 12px;     /* op het raster van 4, en de enige bron — zie 7.6 */
  --binnen: 9px;       /* echte binnenmarge onder het plafond, boven én onder */
}

#kaart {
  position: absolute;
  top: 0;
  left: var(--vulling);
  min-width: 96px;
  max-width: 520px;
  background: var(--plafond);
  border-radius: 0 0 var(--hoek) var(--hoek);
  /* Boven het plafond plus een echte binnenmarge, onder dezelfde binnenmarge.
     Geen magisch getal meer: de inhoud staat gecentreerd in het zichtbare deel
     van de vorm, ook als er straks een tweede regel of een knoprij bij komt. */
  padding: calc(var(--plafond-hoogte) + var(--binnen)) 14px var(--binnen);
}
```

Bij een rij van 26px (de glyph) is de pil dan 44 + 9 + 26 + 9 = 88 hoog, waarvan
44 zichtbaar. In de stand `bezig`, met een vorige regel van 14 boven een huidige
van 19, is de tekstkolom 33 en wordt de pil 95, waarvan 51 zichtbaar. Dat is de
hoogte-morph: 44 → 51 → 44.

De tekstkleuren gaan omhoog. `--zacht: #6f757e` op `--plafond: #17181b` haalt
ongeveer 3,8:1 (met de hand gerekend volgens WCAG, niet gemeten) en draagt zowel
de vorige regel op 11px als de plaatshouder van het invoerveld op 14px. Dat is
onder 4,5:1 voor kleine tekst — en dit is de enige plek in de app met een
gegarandeerde, ondoorzichtige ondergrond, dus de enige plek zonder excuus.

```css
:root {
  --tekst: #f2f4f7;
  --zacht: #949ba6;   /* was #6f757e (3,8:1); haalt ~6,3:1 op --plafond */
  /* Werkt alleen als island.html tokens.css meelaadt — ui-systeem §10 schrijft
     dat al voor. Zolang dat niet zo is, is dit een dode verwijzing en houdt de
     knop de kleur niet: dan hier de hexwaarde van --accent herhalen, met een
     commentaar dat naar tokens.css wijst. */
  --ga-vlak: var(--accent);
  --gevaar-vlak: #46232a;
  --gevaar-tekst: #ff8078;
}
```

### 7.3 Het groeiprotocol

`View.setBounds()` kent geen animatie — geverifieerd in
`node_modules/electron/electron.d.ts:14272`: `setBounds(bounds: Rectangle): void`,
geen vlag, geen duur. `ui-systeem.md` §6.3 leidt daaruit af dat het eiland niet
mag animeren, omdat een geanimeerde maat zestig `island:size`-aanroepen per
seconde wordt. **Dat argument geldt alleen als je per frame meet.** Meet je één
keer, dan kost een overgang precies één IPC-aanroep.

`meldGrootte` is een `invoke` (preload-island.js:8) en dus awaitbaar. Daarmee:

```js
// Groeien en krimpen in twee fasen. De view kan niet animeren, de pil wel — dus
// zorgen we dat de view altijd de grootste van de twee maten heeft zolang de pil
// onderweg is. Groeien: eerst ruimte vragen, dan bewegen. Krimpen: eerst
// bewegen, dan de ruimte teruggeven.
async function naarStand(bouwOp) {
  const oud = { b: kaart.offsetWidth, h: kaart.offsetHeight };

  // Pin de huidige maat, wissel de inhoud, meet de nieuwe maat, zet hem terug.
  kaart.style.width = `${oud.b}px`;
  kaart.style.height = `${oud.h}px`;
  bouwOp();
  const nieuw = metenZonderPin();

  if (nieuw.b >= oud.b || nieuw.h >= oud.h) {
    await eiland.meldGrootte(nieuw.b + vulling * 2, nieuw.h);
    zetMaat(nieuw);                       // CSS-transitie binnen een view die al past
  } else {
    zetMaat(nieuw);
    await klaarMetTransitie(kaart);
    eiland.meldGrootte(nieuw.b + vulling * 2, nieuw.h);
  }
}

function metenZonderPin() {
  kaart.style.width = 'max-content';
  kaart.style.height = 'auto';
  const maat = { b: kaart.offsetWidth, h: kaart.offsetHeight };
  kaart.style.width = `${kaart.dataset.b}px`; // terug naar de pin
  kaart.style.height = `${kaart.dataset.h}px`;
  return maat;
}
```

```css
#kaart {
  /* Expliciete px-waarden, gezet door island.js: width: max-content en een
     hoogte uit de inhoud zijn niet te transitioneren. Chromium 130 heeft
     interpolate-size: allow-keywords, maar dat is hier niet nagemeten. */
  transition:
    width var(--duur-paneel) var(--ease-entree),
    height var(--duur-paneel) var(--ease-entree);
}
```

Dit is de enige plek in de hele app waar layout mag animeren, en de reden is
precies dat de vorm zelf de boodschap is: de pil groeit omdat er iets gebeurt.
`ui-systeem.md` §6.3 blijft verder gelden voor de zijbalk.

**Twee kosten, allebei echt.** Zolang de view groter is dan de pil vangt zijn
doorzichtige deel muisklikken boven de pagina; `setIgnoreMouseEvents` bestaat
alleen op `BrowserWindow` en `BaseWindow` (electron.d.ts:3068 en 5681), niet op
`View` — nagekeken. En de typings bij `setBorderRadius` zeggen expliciet dat de
uitsparing van een view nog steeds klikken vangt (electron.d.ts:14269), dus reken
erop dat de transparante rand dat ook doet. Voor 180ms is dat te verdedigen,
permanent niet — dus de shrink moet altijd doorgaan, ook als er intussen een
nieuwe stand binnenkomt.

### 7.4 De inhoud morpht

Alleen de breedte veranderen is geen overgang. Er zijn drie dingen die kunnen
bewegen zonder de layout van de pil te schokken, en die drie zijn genoeg.

**a. De regel wisselt in twee richtingen.** Nu zakt de vorige regel netjes weg
maar wordt de nieuwe met `huidigEl.textContent = tekst` in één frame vervangen.
De overgang vertelt de helft van het verhaal: er komt iets aan, maar wat er stond
ging niet weg — het werd overschreven. Juist bij een assistent is de opeenvolging
van regels het verhaal.

```css
#huidig {
  transition:
    opacity var(--duur-schuif) var(--ease-vlak),
    transform var(--duur-schuif) var(--ease-entree);
}

/* island.js zet .wisselt, wacht één frame, vervangt de tekst en haalt hem weg. */
#huidig.wisselt { opacity: 0; transform: translateY(-4px); }

#vorige {
  font-size: 11px;
  line-height: 14px; /* was height: 14px bij line-height 1.4 = 15,4: staarten
                        van g, j en p werden afgesneden */
  color: var(--zacht);
  opacity: 0;
  transform: translateY(3px);
  transition:
    opacity var(--duur-schuif) var(--ease-vlak),
    transform var(--duur-schuif) var(--ease-entree);
}

#vorige.zichtbaar { opacity: 1; transform: none; }
```

**b. De tekstkolom en het invoerveld kruisen.** Rust → invoer is nu een harde
wissel van `hidden`. In plaats daarvan liggen ze over elkaar in één grid-cel en
kruisen ze in 120ms, terwijl de pil in 180ms breder wordt.

```css
#veldrij { display: grid; }
#veldrij > * { grid-area: 1 / 1; transition: opacity var(--duur-tik) var(--ease-vlak); }
#veldrij > [hidden] { display: block; opacity: 0; pointer-events: none; }
```

(`[hidden]` op `display: block` zetten is bewust: anders is er niets om te
kruisen. Het element blijft wel uit de toetsenbordvolgorde via `inert`.)

**c. De glyph groeit niet mee.** Hij blijft 26px in elke stand. Eén ding in de
pil dat niet van maat verandert is het ankerpunt waar je oog op blijft staan
terwijl de rest schuift.

En het invoerveld krijgt een vaste breedte (`width: 260px`) in plaats van de
standaard `size=20`. Dan is de sprong rust → invoer een gekozen maat en geen
bijwerking van een HTML-standaard uit 1995.

### 7.5 De standen, en twee die er niet waren

| Stand | Glyph | Inhoud | Knoppen |
| --- | --- | --- | --- |
| `rust` | rust | `Ctrl J` als `<kbd>` | — |
| `invoer` | invoer | veld, 260px | — (Esc annuleert) |
| bezig (`zoeken`, `lezen`, `analyseren`, `debuggen`) | modus | vorige + huidige regel, met glans | Stop |
| `actie` | actie | regel + wat er van je gevraagd wordt | **Open zijn tabblad** · Ga door · Stop |
| `klaar` | klaar | regel | **Open zijn tabblad** |
| `geblokkeerd` | eigen, rood | wat er geblokkeerd is | Sluiten |

Drie correcties die dit document als ontwerpbesluit vastlegt:

**`Niet nu` verdwijnt.** In de stand `actie` heet `#stop` nu "Niet nu", maar de
knop roept `island:stop` → `stopAgent(false)` aan: timer gewist, `this.agent` op
null, eigendom teruggegeven. Er is daarna geen weg terug, want "Ga door" bestaat
alleen zolang de assistent leeft. Uitstel beloven en afbreken leveren is de ergste
knop in de app. In deze richting heet hij "Stop" en staat hij rechts, apart, met
minstens 16px lucht ertussen (`ui-systeem.md` §7.1).

**De primaire actie bij `actie` is het tabblad openen.** Bij "Inloggen nodig om
verder te kunnen" is doorgaan pas zinvol nádat je bent ingelogd, en dat kan alleen
in een tabblad dat je nu niet kunt bereiken — het eiland kent `agent.tabId` wel,
maar er is geen kanaal om ermee te doen. Nieuw kanaal, Engels werkwoord:

```js
// De balk weet in welk tabblad hij werkt; de gebruiker kan er alleen niet heen.
// 'Klaar, kijk mee in zijn tabblad' is nu een instructie zonder knop.
ipcMain.handle('island:reveal', (e) => controllerFor(e)?.revealAgentTab());
```

**`geblokkeerd` wordt een eigen stand.** Nu deelt een geblokkeerde `mailto:`- of
`ms-msdt:`-link hetzelfde kanaal, dezelfde modus en dezelfde kleur als "de
assistent heeft je hulp nodig" (main.js:379 en 385). Zonder actieve assistent
levert dat een balk op die met geen enkele handeling weggaat: "Ga door" roept
`resumeAgent()` aan met `this.agent === null`, en "Niet nu" valt in `stopAgent`
op de vroege `return` bij regel 524 — vóór de `sendIsland({modus:'rust'})` op
regel 528. Twee knoppen die zichtbaar op hover reageren en niets doen. Een eigen
modus met één knop `Sluiten` (`island:dismiss`) lost dat op, en meteen de
kleurverwarring: geblokkeerd is `--danger`, hulp nodig is `--modus-actie`.

Escape in het invoerveld krijgt hetzelfde probleem als het niet apart wordt
afgehandeld: `naarRust()` zet de balk lokaal op rust zonder het hoofdproces iets
te vertellen, dus een lopende assistent verdwijnt uit beeld en de balk corrigeert
zichzelf pas bij de volgende `sendIsland`, tot 3,2 seconden later. Kanaal
`island:cancel`: annuleer alleen het veld en stuur de werkelijke stand terug.

### 7.6 De maten staan nog maar op één plek

```js
// Eén bron voor de marge: --vulling in island.css. De holle hoekjes zijn een
// radial-gradient die exact op dat getal past, dus 1px verschil tussen CSS en JS
// levert een zichtbare naad op precies de plek waar dit ontwerp zorgvuldig is.
const vulling = parseFloat(
  getComputedStyle(document.documentElement).getPropertyValue('--vulling'),
) || 12;
```

En `meet()` wordt per frame samengevoegd, zoals `ui-systeem.md` §7.2 al
voorschrijft — `island:size` per toetsaanslag is zonde.

### 7.7 De pil raakt de vensterknoppen niet meer

`layoutIsland()` centreert over het paginagebied en klemt alleen op
`width - SIDEBAR_WIDTH - 24`. Bij een pil van 546px (max-width 520 + twee keer
13) loopt de rechterrand tot `(vensterbreedte + 810) / 2`, en die komt in de
rechterbovenhoek zodra het venster smaller is dan ongeveer 1086px — precies waar
Chromium de titelbalkoverlay tekent. Dan schuift de pil over
minimaliseren/maximaliseren/sluiten heen en kun je je venster niet meer sluiten
zolang de assistent praat.

```js
// De vensterknoppen tekent het systeem rechtsboven; daar mag de pil nooit onder
// komen. Liever uit het midden dan onbereikbare knoppen.
const CAPTION_BREEDTE = 150; // aanname: drie knoppen van 46px plus lucht

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

Die 150 is een aanname (drie knoppen van 46px bij 100% schaling); niet gemeten.
`titleBarOverlay` zet wel de hoogte (main.js:44) maar de breedte bepaalt het
systeem.

En `raiseIsland()` mag de `removeChildView` kwijt: de typings zeggen expliciet
dat `addChildView` een view die de ouder al bevat herordent naar boven
(electron.d.ts:14226-14229). Nu wordt bij élk nieuw tabblad de balk kort uit de
vensterboom gehaald — precies het moment waarop er al beweging in beeld is. Of er
werkelijk een leeg frame valt heb ik niet nagekeken; dat het overbodig is, wel.

### 7.8 De commandobalk hangt aan dezelfde as

`#palette` centreert met `justify-content: center` over het hele venster,
`layoutIsland()` centreert over het paginagebied. Twee zwevende panelen in
dezelfde app aan twee middellijnen, 132px uit elkaar.

```css
/* Dezelfde as als het eiland: het paginagebied, want de zijbalk is een rail en
   geen inhoud. */
#palette {
  padding-left: var(--sidebar-width);
  justify-content: center;
}
```

Verder daar: de kaart houdt een vaste hoogte zolang hij open is (de lijst schuift
erbinnen) in plaats van bij elke toetsaanslag van maat te springen, `:empty`
wordt de lege staat uit `ui-systeem.md` §7.7, de resultaatrij krijgt dezelfde
maat als een tabbladrij (30px, favicon 16, radius 10) omdat het dezelfde soort
rij is, en `openPalette()` wacht op `browser.setOverlay(true)` vóórdat hij
`hidden` weghaalt — nu speelt de eerste helft van de 160ms `omhoog` af terwijl de
pagina er nog overheen ligt.

---

## 8. De bewegingstaal

### 8.1 De tokens

`ui-systeem.md` §6.1 geeft de namen; deze richting geeft ze snellere waarden en
één andere curve. Een instrument bevestigt en is klaar; hij begeleidt niet.

```css
:root {
  --duur-tik:    90ms;  /* dekking van iets kleins: sluitkruisje, crossfade   */
  --duur-vlak:  120ms;  /* achtergrond, rand, schaduw van een bedieningselement */
  --duur-rij:   150ms;  /* een rij die binnenkomt, een gat dat dichtschuift   */
  --duur-paneel:180ms;  /* een paneel, of het eiland dat van maat verandert   */
  --duur-schuif:220ms;  /* informatie die van plek wisselt (de regel in het eiland) */

  /* Geen kale ease: die versnelt én vertraagt symmetrisch, en daardoor voelt
     elke hover alsof hij op gang moet komen. Deze begint meteen. */
  --ease-vlak:    cubic-bezier(0.3, 0, 0.2, 1);
  --ease-entree:  cubic-bezier(0.15, 0.9, 0.25, 1);
  --ease-vertrek: cubic-bezier(0.4, 0, 1, 1);
  --ease-rond:    linear;
}
```

Deze vervangen acht letterlijke `140ms`, drie `120ms` en losse `160ms` en `240ms`
door de stylesheets heen. Belangrijker dan de eenheid is dat er nu een plek is
waar je de curve kíest: op één regel na (`omhoog`, style.css:530) staat nu overal
de browserstandaard, wat betekent dat niemand die keuze ooit gemaakt heeft.

Twee regels bij het gebruik:

- **`background-color`, nooit `background`.** `background` animeert ook
  `background-image`, dus op `.tab[aria-selected]` zou de glans meelopen en op
  `#controls button` niet — twee elementen die er hetzelfde uitzien gedragen zich
  dan anders. Nu wisselt de code daar zonder aanleiding tussen (style.css:165 en
  194 tegenover 238 en 310).
- **`opacity` hoort in elke lijst waar dekking verandert.** `#controls button`
  animeert `background` en `color`, maar het verschil tussen ingeschakeld en
  uitgeschakeld is `opacity: 0.32` (style.css:179) — dus de terug- en vooruitknop
  knipperen hard bij elke navigatie, op elementen die nooit hertekend worden en
  waar een overgang dus gewoon zou werken.

### 8.2 Wat beweegt

| Wat | Duur | Curve | Waarom |
| --- | --- | --- | --- |
| Hover op een rij of knop | 120 | `--ease-vlak` | zodat de verandering niet knippert |
| Indrukken (`:active`) | 0 in, 120 uit | `--ease-vlak` | een indruk moet meteen landen |
| Focusring | 120 | `--ease-vlak` | idem |
| Sluitkruisje in beeld | 90 | `--ease-vlak` | het volgt de muis, niet andersom |
| Nieuwe tabbladrij | 150 | `--ease-entree` | opacity + `translateX(-5px)`, één keer |
| Gat dat dichtschuift | 150 | `--ease-entree` | FLIP, alleen `transform` |
| Eiland van maat | 180 | `--ease-entree` | de vorm is de boodschap |
| Regel in het eiland | 220 | `--ease-schuif` | je moet het verband zien |
| Commandobalk komt/gaat | 180 | entree / vertrek | een paneel dat komt hoort ook te gaan |
| Glans over de bezige regel | 2.4s | `linear` | loopt zolang er echt iets loopt |
| Voortgangslijn op de actieve rij | 1.1s | `linear` | idem |
| De glyph | continu | eigen lus | idem, en hij is de aflezing |

### 8.3 Wat niet beweegt

- **Wisselen van tabblad of workspace.** Dat is een native `setVisible()`; er is
  niets om aan te haken en een fade in de zijbalk zou uit de pas lopen met de
  pagina.
- **De uittree van een rij.** Zie §1.2: een rij die nog vervaagt terwijl hij
  gesloten is, liegt.
- **Alles in de zijbalk dat layout is.** Hoogte, breedte, marge, `gap`, `display`.
  Het eiland is de enige uitzondering en §7.3 legt uit waarom.
- **De workspacestrip bij het wisselen.** Die verspringt nu ongewild, omdat de
  naam van de ene chip naar de andere verhuist. In deze richting kán hij niet
  meer verspringen, want elke chip is 30px (§5.6). Dat is de goede oplossing:
  niet de beweging temmen, maar de beweging wegnemen.
- **De kaart van de commandobalk bij het typen.** Vaste hoogte, de lijst schuift
  erbinnen.
- **De scrollpositie van de tabbladlijst**, behalve bij een echte wisseling van
  het actieve tabblad.

### 8.4 Beweging die zich nooit vanzelf herhaalt

Elke lopende animatie begint nu bij elke statusupdate opnieuw bij frame nul: het
kloppende stipje, de glans, en het ergst de stand `klaar` van de glyph — een
cirkel die vanuit het midden naar buiten groeit en dus bij elke `pushState`
opnieuw begint. De stand die "klaar" moet betekenen loopt in beeld als een
eeuwige puls: hij vertelt het tegenovergestelde van wat hij moet vertellen.

Verzoening (§1) lost dat op voor alles wat aan een element hangt. Voor het
zeldzame geval dat een element tóch opnieuw ontstaat, blijft de fase-truc uit
`ui-systeem.md` §6.4 beschikbaar:

```js
el.style.setProperty('--fase', `${-(performance.now() % 1500)}ms`);
```

### 8.5 `prefers-reduced-motion`

Het globale blok in `style.css:616-623` blijft, en er komen drie dingen bij die
het niet dekt:

```css
@media (prefers-reduced-motion: reduce) {
  /* Zonder keyframes blijft een element op zijn beginwaarde staan. Deze twee
     zouden dan onzichtbaar of half zichtbaar blijven, dus hier hard gezet. */
  .tab.ladend .favicon:not([src]) { opacity: 1; }
  .tab.ladend[aria-selected="true"]::after { display: none; }
  #vorige { opacity: 1; transform: none; }
}
```

Plus, in JS: `schuifDicht()` slaat de FLIP over (`Element.animate` valt buiten
CSS, §1.2), en `glyph.js` tekent één frame op `t = 0.25` (§6.4). Dat zijn precies
de drie plekken waar CSS het niet kan regelen.

---

## 9. Wat deze richting niet goed doet

Eerlijk, en dit is niet de korte lijst.

**9.1 Dichtheid kost rust.** Rijen van 30 in plaats van 34, een kop van 10px in
kapitalen, monogrammen, een teller, een voortgangslijn: er staat meer op minder
ruimte. Achter halftransparante lagen boven een druk bureaublad slaat dat sneller
om in ruis dan bij een luchtiger ontwerp. Wie drie tabbladen open heeft, krijgt
hier niets moois — alleen iets strakkers. De richting betaalt zich pas terug bij
vijftien tabbladen en twee assistenten, en dat is niet de eerste indruk.

**9.2 De hiërarchie leunt op een lettertype dat er niet altijd is.** Het hele
besluit "gewicht in plaats van kleur" (§3) staat of valt met een zichtbaar
verschil tussen 400 en 500. In Segoe UI Variable Text en SF Pro Text is dat er;
in Segoe UI op Windows 10 en in de systeemfont op Linux is het verschil veel
kleiner, en dan draagt alleen het glasplaatje de hiërarchie nog — terwijl ik juist
kleur als drager heb weggenomen. Dat is de zwakste plek van deze richting, op
precies de platforms waar niemand test.

**9.3 Het monogram lost het kleurprobleem op en maakt een nieuw.** "Werk" en
"Werk 2" worden allebei `WE`. Er is geen automatische disambiguatie en die is ook
niet te verzinnen zonder de chip breder te maken, wat het hele punt van §5.6 was.
De `title` redt het, maar dat is een tooltip en geen aflezing.

**9.4 De app zal niet aaibaar zijn.** 90 tot 180ms, curves die meteen beginnen,
geen uittree, geen naijlen. Niemand zal zeggen dat deze browser mooi beweegt. De
vierkantjes van de glyph zijn dan het enige plezierige in beeld, en die staan
straks in een omgeving die er nadrukkelijk niet bij past. Dat is een reële ruil:
deze richting kiest afleesbaarheid boven charme, en charme is wat mensen
onthouden.

**9.5 Het eiland-groeiprotocol koopt vloeiendheid met een dood vlak.** Tijdens de
180ms staat de view groter dan de pil, en het transparante deel vangt klikken
boven de pagina — `setIgnoreMouseEvents` bestaat niet op `View` en de typings
zeggen expliciet dat zelfs de uitsparing van `setBorderRadius` klikken vangt. Bij
een assistent die zes stappen doet zijn dat zes vensters van 180ms waarin de
bovenrand van de pagina niet reageert. Dat is klein maar niet nul, en het wordt
groter zodra iemand de duur verhoogt.

**9.6 De plafondkop kost sleepruimte en maakt een platformtak.** 264px van de
dragstrip wordt bedekt door een label (`pointer-events: none` houdt het
sleepbaar, maar dan is de naam ook niet klikbaar en kun je er dus nooit een menu
aan hangen zonder `-webkit-app-region: no-drag`, wat ik hier niet heb
uitgeprobeerd). En op macOS moet hij 78px inspringen voor de stoplichten, dus er
staat een platformvoorwaarde in de CSS die niemand op Windows ooit ziet breken.

**9.7 Er is geen tweede, luchtiger maat.** Instellingen, geschiedenis en
downloads worden straks lange leesbare lijsten, en die krijgen hier dezelfde
dichte maatvoering als een tabbladlijst. Dat gaat knellen. Als er ooit een
tweede maat komt is dat een tweede set hoogtes en geen schaalfactor over alles
heen — `ui-systeem.md` §12 zegt dat al, en deze richting maakt het waarschijnlijker
dat het nodig wordt.

**9.8 Verzoening is werk en een nieuwe soort fout.** `replaceChildren()` is nooit
verkeerd, alleen nooit mooi: de DOM klopt altijd met de state. Een `Map` van
rijen kan verouderen, een rij kan blijven hangen na een workspacewissel, een
attribuut kan vergeten worden bijgewerkt. Dat is ongeveer zestig regels extra plus
een klasse bugs die de app nu niet kan hebben. De winst is groot, maar hij is
niet gratis.

**9.9 Het lichte thema geeft dekking op.** `--fill-active` van .82 naar .66 laat
het acrylic leven, en dat is precies waarom dit ontwerp zo is opgezet — maar op
een bureaublad met een druk fotoachtergrond is een actieve rij van 66% wit
merkbaar minder rustig te lezen dan een van 82%. Er zijn achtergronden waarop
deze richting verliest.

**9.10 Wat hier ook niet in staat.** Geen themakeuze (het thema volgt het
systeem), geen contrastgarantie (de achtergrond is het bureaublad van de
gebruiker), geen componentbibliotheek, geen ontwerp voor split view, geen
animatie tussen de drie lagen. Dat zijn allemaal grenzen van `ui-systeem.md` §12
en deze richting verlegt er geen van.

---

## 10. Volgorde van invoeren

Elke stap levert op zichzelf iets zichtbaars op en breekt niets.

1. **Tokens.** `renderer/tokens.css` met §2, §4.2 en §8.1. De drie stylesheets
   laden hem als eerste. Nog niets aan de componenten veranderen.
2. **Typografie.** De gewichten uit §3 en de faviconachtergrond weg. Twee handvol
   regels, en het is meteen de helft van "visueel beter".
3. **De rail.** §4.3: één padding, één rijhoogte, één set radii. Hier verschuift
   het beeld het meest voor het minste werk.
4. **Verzoening.** §1. Vanaf hier zijn intree, `:active`, focus, scrollpositie en
   een niet-herstartende glyph mogelijk.
5. **Het tabblad.** §6, inclusief de modusbalk, het absolute sluitkruisje en de
   ladende stand.
6. **De footer en de sectiekop.** §5.4 en §5.6. Daarna is er ruimte voor het
   tandwiel uit §5.2.
7. **Het eiland.** §7, in deze volgorde: eerst de padding en `--vulling` (7.2 en
   7.6), dan de veiligheidsgrens (7.7), dan pas het groeiprotocol (7.3) en de
   morph (7.4). De eerste twee zijn correcties, de laatste twee zijn ontwerp.
8. **De plafondkop.** §5.1. Bewust als laatste: hij is het meest zichtbaar en het
   makkelijkst terug te draaien als hij niet blijkt te werken.

Wat hier níét in staat maar wel bij deze richting hoort, en in de routekaart al
een plek heeft: de sneltoetsen naar `before-input-event` (§6.3), de foutpagina
(`ui-systeem.md` §7.8), de strookmelding `ui:notice`, en `ui:overlay` als teller.

---

## 11. Wat ik niet geverifieerd heb

Geverifieerd in `node_modules/electron/electron.d.ts` van deze repo:

- `View.setBounds(bounds: Rectangle): void` — geen animatievlag, geen duur (14272).
- `View.setBorderRadius()` draagt de notitie dat de uitsparing nog steeds klikken
  vangt (14269).
- `View.addChildView()` herordent een view die de ouder al bevat naar boven
  (14226-14229), dus `removeChildView` ervoor is overbodig.
- `setIgnoreMouseEvents` bestaat alleen op `BrowserWindow` (5681) en `BaseWindow`
  (3068), niet op `View`.

Niet nagekeken, en het staat hier omdat er ontwerp op leunt:

1. **Hoeveel frames de huidige eilandsprong werkelijk knipt** (§7.1). Met de
   DevTools van de island-view te zien; `devtoolsSneltoets` hangt er al aan.
2. **Of `interpolate-size: allow-keywords` in Chromium 130 doet wat we willen.**
   Het protocol in §7.3 werkt zonder, met gemeten px-waarden, maar met zou het
   eenvoudiger zijn.
3. **Of de CSSOM-weg (`el.style.setProperty`) buiten `style-src 'self'` valt.**
   `ui-systeem.md` §6.4 stelt dezelfde vraag. §6.2 en §8.4 leunen erop.
4. **De breedte van de vensterknoppen op Windows** (§7.7). 150px is een aanname
   op basis van drie knoppen van 46px bij 100% schaling.
5. **Of `navigator.userAgent` in de zijbalkrenderer betrouwbaar "Macintosh"
   bevat** voor `data-platform` (§5.1). Anders moet dat via een preload-veld.
6. **Of het driehoekje venstermateriaal bij `(264, 44)` er in de praktijk staat**
   (§5.1b). Afgeleid uit `layoutActiveTab()`, niet op een scherm gezien.
7. **Of `-webkit-app-region: no-drag` binnen `#drag-strip` werkt** in deze
   Electron-versie (§9.6). Nu niet nodig, wel zodra de plafondkop klikbaar wordt.
8. **De contrastcijfers.** `--zacht` op `--plafond` (~3,8:1) en `--muted` op wit
   (~3,5:1) zijn met de hand volgens WCAG gerekend, niet met een meter. En achter
   acrylic boven een willekeurig bureaublad is geen enkel cijfer gegarandeerd —
   dat is precies waarom §2.3 zegt dat kleur nooit de enige drager mag zijn.
9. **Of de zes nieuwe workspacekleuren op acrylic werkelijk uit elkaar te houden
   zijn** (§2.1). Brons naast `--modus-lezen` en olijf naast `--modus-analyseren`
   zijn de twee om te bekijken.
10. **Of `mask-image` op `#tablist` de scrollprestaties raakt** bij twintig rijen
    met een canvas erin (§5.4). Een masker dwingt een aparte laag af.
