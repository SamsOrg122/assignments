# Het instellingenscherm en de knop ernaartoe

`instellingen.md` beantwoordt de vraag *welke* voorkeuren er zijn, waar ze op
schijf staan, hoe ze zonder races geschreven worden en hoe een wijziging bij alle
vensters aankomt. `ROUTEKAART.md` §1.1, §1.3, §1.4, §1.7 en §1.11 beantwoorden de
vraag hoe kanalen heten, wie sneltoetsen afvangt, welke registry er is, wie
schrijft en hoe een interne pagina gebouwd wordt. `ui-systeem.md` levert de
componenten en `richting-verstilling.md` (met de gestolen onderdelen uit
`richting-materiaal.md` en `richting-instrument.md`) de visuele taal.

Dit document beantwoordt wat daar tussenuit valt en wat de app nu letterlijk niet
heeft: **waar de knop zit, wat er opengaat, hoe het scherm is ingedeeld, hoe het
eruitziet, hoe je er met alleen het toetsenbord doorheen komt, en welke knoppen
er precies in staan.** Het herhaalt de opslaglaag niet en verzint geen tweede
kanaalnaam voor iets dat al een naam heeft.

Waar dit document en `instellingen.md` elkaar tegenspreken staat dat er
uitdrukkelijk bij, met de reden. Dat gebeurt op drie plekken: de instantie is
**per workspace** en niet per venster (§3.2), de openingskanaalnaam wordt
`pref:open` in plaats van `ui:instellingen` (§9.1), en de aparte registry
`instellingenViews` vervalt (§3.3).

Alles hieronder is geschreven tegen **Electron 33.4.11**. Wat ik in
`node_modules/electron/electron.d.ts` heb nagekeken staat in §12 met regelnummer;
wat ik niet heb kunnen nakijken staat daar ook, als meting.

---

## 1. Twee vaste punten

**Dit scherm is een pagina, geen zijbalkonderdeel.** Dat is niet hetzelfde soort
oppervlak. De zijbalk is doorschijnend en leeft van het venstermateriaal; een
pagina in een tabblad is ondoorzichtig en heeft niets achter zich. De
vullingstrap van de richting (`--fill: .16 → --fill-hover: .26 → --fill-active:
.46`) is een trap van *witte lagen op een onbekende ondergrond*. Op deze pagina
is de ondergrond bekend. De richting geldt hier dus in zijn regels — één rij, één
rail, hiërarchie uit gewicht, verplaatsingsbudget, geen animatie in rust — maar
niet in zijn alfa's. §5.1 rekent de trap opnieuw uit tegen een bekende grond, en
komt daardoor op vier vaste kleuren in plaats van vier alfa's.

**Dit scherm hoort bij één workspace.** De helft van de opties gaat over de
sessie waarin je zit. Dat is de reden dat het een tabblad is en niet een venster,
en het is de reden dat er per workspace hoogstens één van openstaat (§3.2). De
kop van het scherm zegt altijd bij welke workspace je bent, ook als je intussen
elders bent gaan werken.

---

## 2. De ingang

### 2.1 De knop: rechts in de voetregel, naast "Nieuwe workspace"

De zijbalk kent drie soorten inhoud. `#controls` en `#address` gaan over **de
pagina die voor je staat**. `#tablist` en `#new-tab` gaan over **je werk**. De
voet gaat over **de app**: welke wereld je in zit, en hoe hij is afgesteld. De
tandwielknop hoort in die derde groep, en nergens anders.

```html
<footer id="voet">
  <ol id="workspace-list" role="listbox" aria-label="Workspaces"></ol>

  <div id="voet-acties">
    <button id="new-workspace" class="rij" type="button">
      <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3.5v9M3.5 8h9" /></svg>
      <span class="label">Nieuwe workspace</span>
    </button>
    <button id="instellingen" class="rij rij--icoon" type="button"
            title="Instellingen (Ctrl ,)" aria-label="Instellingen">
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path d="M3 5.5h10M3 10.5h10M9.5 3.5v4M6.5 8.5v4" />
      </svg>
    </button>
  </div>
</footer>
```

```css
/* De knop deelt de rij die er al staat. Netto kost deze ingang nul verticale
   pixels, en dat is precies wat een functie mag kosten die je een paar keer per
   maand gebruikt. */
#voet-acties {
  display: flex;
  gap: 2px;
}

#new-workspace { flex: 1; }

.rij--icoon {
  width: var(--rij);
  padding: 0;
  justify-content: center;
}
```

Vier redenen dat hij dáár staat, en niet ergens anders:

- **Naast de workspaces, want dat is wat je bewerkt.** De bovenste twee groepen
  van het scherm gaan over de workspace waarvan de rij acht pixels hoger staat.
  De afstand tussen de knop en het onderwerp is één rij.
- **Niet in `#controls`.** Die drie knoppen — straks vier, want
  `permissies-en-privacy.md` §7 zet het slotje erbij — gaan zonder uitzondering
  over de pagina die voor je staat. Een tandwiel ertussen verzwakt die betekenis
  voor de andere vier.
- **Niet in het plafond.** Dat is sleepgebied (`-webkit-app-region: drag`), het
  systeem tekent er de vensterknoppen op, en het eiland groeit eruit. Een knop
  daar vecht met alle drie.
- **Niet per tabbladrij, en niet achter een `...`-menu.** Er is nog geen
  contextmenu (`ROUTEKAART.md` stap 3), en een menuknop toevoegen om er één
  regel in te zetten is duurder dan de knop zelf.

### 2.2 Het pictogram: schuiven, geen tandwiel

Verstilling §5.2 zet elk zijbalkicoon binnen x,y ∈ [3, 13] van
`viewBox="0 0 16 16"`. Een tandwiel met zes tanden binnen een vak van 10×10 bij
`stroke-width: 1.6` is op 16 pixels een grijze vlek: de tanden zijn dan 0,8 pixel
diep en de streek is 1,6 breed. Twee sporen met twee grepen overleeft die maat
wél, staat in dezelfde lijntaal als de andere drie knoppen, en is sinds iOS 7 net
zo goed leesbaar als een tandwiel.

Het pad hierboven loopt van x=3 tot x=13 en van y=3,5 tot y=12,5. Dat is
hetzelfde inktvak als de herlaadcirkel, en na de hertekening van de twee chevrons
uit verstilling §5.2 lezen alle vier de knoppen als één set.

### 2.3 Ctrl + , via de router, niet via de renderer

De sneltoets hangt in `lib/sneltoetsen.js` (`ROUTEKAART.md` §1.3) en wordt op
elke webContents gebonden. Dat is niet dezelfde toets als "Ctrl+, in `app.js`":
de zijbalkrenderer ziet geen enkele toetsaanslag zolang de focus in een pagina
staat, en in een instellingenscherm sta je per definitie in een pagina. Zonder de
router zou de sneltoets die het scherm opent niet werken vanuit het scherm zelf.

Twee gedragsregels die bij deze actie horen en die de router moet kennen:

- **Ctrl + , terwijl het scherm van deze workspace al openstaat** activeert dat
  tabblad en zet de focus in het zoekveld (`pref:goto` met sectie `null`). Hij
  opent geen tweede.
- **Escape hoort de pagina te bereiken zodra er geen laag openstaat.**
  `ROUTEKAART.md` §1.6 zegt dat Escape één betekenis heeft — sluit de bovenste
  laag — en dat geen enkel ander bestand hem mag afvangen. Dat klopt zolang er
  een laag ís. Staat er geen vraag, geen zoekbalk en geen commandobalk open, dan
  moet de router Escape ongemoeid doorlaten, want dit scherm gebruikt hem om het
  zoekveld te wissen en om een sneltoetsopname af te breken (§6.4). Dat is een
  eis aan `lib/sneltoetsen.js`, en hij staat hier omdat hij anders bij niemand
  staat.

### 2.4 De commandobalk

De derde ingang is de goedkoopste en waarschijnlijk de meest gebruikte: Ctrl+K,
typen wat je zoekt, Enter. Dat werkt alleen als de secties zélf resultaten zijn —
"instellingen" als los resultaat is één extra stap.

```js
// Een sectie is een plek, net als een tabblad of een workspace, en hoort dus in
// dezelfde lijst. Wie 'downl' typt wil naar de downloadmap, niet naar een scherm
// waarin hij daarna nog moet zoeken.
const INSTELLINGSSECTIES = [
  { id: 'workspace',  label: 'Deze workspace' },
  { id: 'sites',      label: 'Wat sites hier mogen' },
  { id: 'uiterlijk',  label: 'Uiterlijk' },
  { id: 'starten',    label: 'Starten en tabbladen' },
  { id: 'zoeken',     label: 'Zoeken en adresbalk' },
  { id: 'downloads',  label: 'Downloads' },
  { id: 'privacy',    label: 'Privacy en taal' },
  { id: 'sneltoetsen',label: 'Sneltoetsen' },
  { id: 'assistent',  label: 'Assistent' },
  { id: 'connectors', label: 'Connectors' },
];
```

In `huidigeResultaten()` komen ze onder de tabbladen en boven de workspaces, met
`hint: 'Instellingen'` en `label: 'Instellingen · ' + sectie.label`. Ze matchen op
hun eigen label én op het woord "instellingen", zodat beide manieren van zoeken
werken. `kiesResultaat` roept `browser.openInstellingen(sectie.id)` aan.

### 2.5 Diepe links vanaf de plek van het probleem

Elke groep heeft een id, en dat id is een anker: `tougather://instellingen#privacy`.
Daarmee kunnen andere schermen naar de juiste regel wijzen in plaats van naar het
scherm:

| Vandaan | Naar |
| --- | --- |
| het sitepaneel achter het slotje (`permissies-en-privacy.md` §7), regel "Alle uitzonderingen" | `#sites` |
| het downloadpaneel (`downloads.md` §9), regel "Downloadmap" | `#downloads` |
| het eiland, als een assistent geweigerd wordt omdat `assistentMag` uit staat | `#workspace` |
| een connector die toestemming nodig heeft | `#connectors` |

Een diepe link **wist eerst het zoekveld** en scrollt dan naar de sectie
(§6.5). Anders wijst hij naar een groep die op dat moment door een filter
verborgen is, en dat is de ergste soort dode link: er gebeurt zichtbaar niets.

---

## 3. Tabblad, paneel of venster

### 3.1 Het blijft een tabblad, en nu met een echt adres

`instellingen.md` §8 kiest een pagina in een tabblad en geeft daar drie goede
redenen voor (de zijbalk is 264px, een overlay neemt je pagina weg, en er is nog
geen tweede venster). Die redenen staan. Wat verandert is de techniek:
`ROUTEKAART.md` §1.11 legt vast dat elke interne pagina met rechten op het
`tougather:`-schema draait, in de sessie `persist:intern`, met één
`preload-intern.js` en één navigatieslot.

Voor dit scherm betekent dat concreet:

- URL: `tougather://instellingen`, sectie als fragment (`#downloads`).
- Rol in de registry `neven`: `'instellingen'`. Elke handler begint met
  `nevenVan(e, 'instellingen')` en niet met `controllerFor(e)`.
- De drie sloten uit `instellingen.md` §8 blijven, maar staan één keer in
  `lib/intern.js` in plaats van in dit ontwerp.

Bijvangst die het noemen waard is: met een echt adres is de adresbalk niet langer
een probleem dat verborgen moet worden. `describe()` hoeft de URL niet leeg te
maken; `tougather://instellingen` is kort, eerlijk en te kopiëren. Wel moet
`kortAdres()` uit verstilling §4 het schema kennen, anders leest de adresbalk in
rust alleen `instellingen`:

```js
// Bij een interne pagina is het schema juist het informatieve deel: 'nu.nl'
// zegt genoeg zonder schema, 'instellingen' zonder schema zegt niets.
function kortAdres(url) {
  try {
    const u = new URL(url);
    if (u.protocol === 'tougather:') return url;
    return u.host.replace(/^www\./, '');
  } catch {
    return url;
  }
}
```

### 3.2 Eén per workspace, niet één per venster

Dit wijkt af van `instellingen.md` §8 ("Per venster staat er hoogstens één open").

Het scherm is workspace-gebonden: `bereik: 'workspace'` betekent altijd de
workspace van het verzoekende tabblad. Staat het scherm open in *Persoonlijk* en
druk je Ctrl+, terwijl je in *Werk* zit, dan zijn er twee mogelijkheden en ze
zijn allebei fout: je springt naar *Persoonlijk* (je bent je pagina kwijt én je
bewerkt de verkeerde workspace), of je krijgt hetzelfde scherm dat over een
andere workspace gaat dan de kop zegt.

**Besluit: hoogstens één per workspace.** `openInstellingen(sectie)` zoekt in de
tabbladen van de *huidige* workspace naar een tabblad met
`url.startsWith(INSTELLINGEN)`. Gevonden: activeren en `pref:goto` sturen. Niet
gevonden: aanmaken. Prijs: bij zes workspaces kunnen er in theorie zes
openstaan. In de praktijk is dat er één, ze zijn goedkoop, en ze gaan mee dicht
als de workspace dichtgaat.

### 3.3 `instellingenViews` vervalt

`instellingen.md` §9 wil een aparte map `webContentsId → { controller, partitie }`.
`ROUTEKAART.md` §1.4 heeft die map al, alleen heet hij `neven` en houdt hij
`{ controller, rol }` bij. Eén veld erbij is goedkoper dan een tweede registry:

```js
// lib/registry.js — de partitie hoort bij het record omdat 'bereik: workspace'
// de workspace van dit tabblad bedoelt en niet de actieve. Zonder dit veld moet
// elke pref-handler de tabbladen aflopen om te vinden waar hij vandaan komt.
neven.set(wc.id, { controller, rol: 'instellingen', partitie: ws.partitie });
```

### 3.4 Hoe het tabblad in de lijst staat

Titel: **Instellingen**. Geen favicon — en dat is precies het geval waar de lege
faviconplaatshouder als uitgevinkt selectievakje leest. Voor een interne pagina
is er geen reden om te raden: hij heeft een bekend merkteken.

`describe()` krijgt er één veld bij (`ROUTEKAART.md` §1.10 laat `describe()`
groeien):

```js
intern: url.startsWith(INSTELLINGEN) ? 'instellingen' : null,
```

en `renderTab()` tekent bij `tab.intern` hetzelfde SVG-pictogram als de knop, in
het 16px-vak, in `--muted` (en `--text` op de actieve rij). Dat is dezelfde
oplossing als de glyph bij een assistententabblad: het merk zegt wat voor soort
ding dit is. De algemene reparatie van het lege vak (het ademende laadvakje bij
`:not([src])`, plus `merk.onerror = () => merk.removeAttribute('src')`) blijft
gewoon staan voor gewone tabbladen.

### 3.5 Het eiland hangt over de bovenkant, en dat is gerekend

De pagina staat op `y = TOPBAR_HEIGHT` (44). Het eiland is een eigen view op
`y = 0` met de hoogte die hij zelf meldt. In de gekozen richting is dat:

| Vorm | Hoogte van het eiland | Bedekt van deze pagina |
| --- | --- | --- |
| rust | 44px (in het plafond) | 0px |
| regel (assistent praat) | 51px | 7px |
| kaart (invoerveld open) | ± 66–70px | 22–26px |

Horizontaal staat hij gecentreerd boven het paginagebied, 300px breed in de vorm
regel en 380px in de vorm kaart. Bij een venster van 1280 is het paginagebied
1006px breed, dus de band die bedekt kan raken is x ≈ 313…693 van de pagina.

**Regel die daaruit volgt:** in de bovenste 28 pixels van deze pagina staat geen
bedieningselement, ergens in de breedte. De kolom begint op `padding-top: 56px`,
dus de titel staat op y=56 en er is niets te raken. Diezelfde 28 pixels zijn de
reden dat `scroll-margin-top` op elke sectiekop 32px is (§6.5) en dat er in dit
scherm **niets sticky** is (§4.2).

---

## 4. De indeling

### 4.1 Eén kolom, geen index

Het scherm heeft tien groepen. De reflex is een linkerindex zoals macOS
Systeeminstellingen. Dat is hier fout, om één reden die zwaarder weegt dan alle
argumenten vóór: **er staat al een verticale navigatiekolom van 264 pixels, tien
pixels naar links.** Een tweede rail pal daarnaast maakt van het venster twee
kolommen chroom naast één kolom inhoud. macOS heeft dat probleem niet, want daar
staat Systeeminstellingen in een eigen venster zonder zijbalk ernaast.

Dus: **één kolom, vaste volgorde, en het zoekveld ís de navigatie.** Tien groepen
van twee tot acht rijen is ongeveer twee schermen scrollen. Dat is te overzien,
en wie precies weet wat hij zoekt typt drie letters.

```
#blad {
  width: min(680px, 100%);
  margin: 0 auto;
  padding: 56px 24px 96px;
}
```

Bij een venster van 1280 is het paginagebied 1006px, dus de kolom is 680 inclusief
padding en staat gecentreerd. Bij het minimale venster (720 breed) is het
paginagebied 446px en vult de kolom hem helemaal. Onder 520px paginabreedte
klappen de rijen (§5.4).

### 4.2 Niets is sticky

Een vastgeplakt zoekveld boven aan de kolom komt in de band te liggen die het
eiland kan bedekken (§3.5). Het veld loopt over de volle kolombreedte, dus zijn
midden — precies waar je klikt — verdwijnt onder de pil zodra een assistent praat.
Dat is geen randgeval: het is de hele belofte van deze app dat er iemand aan het
werk is terwijl jij iets anders doet.

Daarom scrollt alles gewoon weg, en zijn er twee manieren om terug te komen:
`/` zet de focus in het zoekveld en scrollt naar boven, en Ctrl+, doet hetzelfde
(§2.3). Dat is minder machinerie, het botst met niets, en het past bij een
richting die dingen weghaalt.

Voor de volledigheid, mocht iemand later toch een vastgeplakte sectiekop willen:
die moet links uitgelijnd en kort zijn. Een kop van hooguit 130px begint bij een
venster van 1280 op x≈187 en eindigt ruim voor x=313, dus buiten de band van het
eiland. Dat is de enige vorm die kan.

### 4.3 De volgorde, en waarom die het argument is

`instellingen.md` zet de workspace eerst en "Overal" daarna, omdat de volgorde het
argument van dat ontwerp zichtbaar maakt. Met tien groepen blijft dat staan: de
twee workspacegroepen zijn compact en de scheiding is expliciet.

```
Instellingen                                    titel-m, 20/600

[  Zoek in instellingen                     ]   veld--groot, 40px
                                                (2 instellingen gevonden — live)

Deze workspace · ● Persoonlijk                  titel-s, 17/600 + stip
  ┌ Workspace ───────────────────────────────┐
  ┌ Wat sites hier mogen ────────────────────┐

Overal                                          titel-s, 17/600
  ┌ Uiterlijk ───────────────────────────────┐
  ┌ Starten en tabbladen ────────────────────┐
  ┌ Zoeken en adresbalk ─────────────────────┐
  ┌ Downloads ───────────────────────────────┐
  ┌ Privacy en taal ─────────────────────────┐
  ┌ Sneltoetsen ─────────────────────────────┐
  ┌ Assistent ───────────────────────────────┐
  ┌ Connectors ──────────────────────────────┐

  Tougather 0.1.0 · Electron 33.4.11 · Chromium 130
  Je instellingen staan in …\Tougather   Open map
  Deze workspace terugzetten      Alles terugzetten
  ────────────────────────────────────────────────
  (statusregel, aria-live, meestal leeg)
```

De scheiding *Deze workspace* / *Overal* is een kop van 17/600 met 32px lucht
erboven; de groepskoppen erbinnen zijn 13/500 in `--muted`, in gewone
zinsopmaak. **Geen kapitalen.** Een kop in 10px-kapitalen met tracking is precies
wat de jury bij richting-instrument afwees: een label dat luider is dan zijn
inhoud. Hier draagt het label wel informatie ("Downloads" tegenover "Privacy en
taal"), en dan is gewone zinsopmaak genoeg.

De naam van de workspace staat één keer, in de scheidingskop, met zijn gekleurde
stip ervoor. Geen tweede chip eronder: dat was dezelfde mededeling twee keer.

### 4.4 De statusregel onderaan

`instellingen.md` §12 noemt het zelf: mislukt de `rename` op Windows, dan werkt je
instelling wel maar is hij na een herstart weg, en "een zichtbare foutregel
onderaan het scherm zou de eerlijke aanvulling zijn". Die regel staat hier.

```html
<p id="status" role="status" aria-live="polite"></p>
```

Hij is meestal leeg en neemt dan geen hoogte in. Hij toont drie soorten bericht,
en niets anders:

| Wanneer | Tekst |
| --- | --- |
| wegschrijven mislukt (`EPERM`/`EBUSY` na twee pogingen) | Kon je instellingen niet bewaren. Ze werken tot je Tougather afsluit. |
| iets is uitgevoerd dat je niet ziet | Cookies en opslag van Persoonlijk gewist. |
| iets geldt pas later | De taal geldt voor pagina's die je hierna opent. |

Geen zwevende meldingen, geen animatie, geen wachtrij. Eén plek, `aria-live`
polite, en de tekst blijft staan tot er een volgende komt of tot je iets anders
verandert. Dat is de rustigste vorm die de informatie nog draagt.

---

## 5. Hoe het eruitziet

### 5.1 De vlakken: vier kleuren in plaats van vier alfa's

Verstilling §3.1 rekent zijn transparantietrap uit tegen een *aangenomen*
acrylic-ondergrond (sRGB 0,55 in licht en 0,16 in donker) en zegt er eerlijk bij
dat dat aannames zijn. Op deze pagina is de ondergrond geen aanname maar een
kleur die wij zelf zetten. Dan is dezelfde redenering geen schatting meer maar
rekenwerk, en levert hij vaste waarden op.

```css
/* instellingen.css, na tokens.css. Deze pagina is een ondoorzichtig tabblad:
   er zit geen venstermateriaal achter, dus een halftransparante witte laag
   mengt hier met niets. Vier vlakken met een bekende kleur, waarvan de
   onderlinge stappen in licht en donker even groot zijn. */
:root {
  --vlak-0: #f0f1f3;  /* de grond van de pagina */
  --vlak-1: #ffffff;  /* de groepskaart */
  --vlak-2: #f2f3f5;  /* rij onder de muis, binnen de kaart */
  --vlak-3: #e6e8ec;  /* ingedrukt, en het spoor van een segmentbalk */

  --kaart-schaduw: 0 1px 2px -1px rgba(0, 0, 0, 0.1);
}

@media (prefers-color-scheme: dark) {
  :root {
    --vlak-0: #1b1c1f;
    --vlak-1: #232529;
    --vlak-2: #2a2c31;
    --vlak-3: #313339;

    --kaart-schaduw: 0 1px 2px -1px rgba(0, 0, 0, 0.5);
  }
}
```

Met de WCAG-formule voor relatieve luminantie, met de hand uitgerekend:

| Stap | Licht | Donker | Verschil |
| --- | --- | --- | --- |
| kaart op de grond (`--vlak-1` op `--vlak-0`) | 1,13 : 1 | 1,11 : 1 | 2% |
| hover in de kaart (`--vlak-2` op `--vlak-1`) | 1,11 : 1 | 1,10 : 1 | 1% |
| ingedrukt (`--vlak-3` op `--vlak-1`) | 1,23 : 1 | 1,22 : 1 | 1% |

Dat is dezelfde discipline als verstilling §3.1 — dezelfde waargenomen stap in
beide thema's — maar hier klopt hij, want de ondergrond is bekend. `--vlak-0` is
bewust níét `--plafond` (#17181b): het plafond is chassis en moet in donker
zichtbaar donkerder blijven dan de pagina eronder, anders lopen de twee lagen
visueel in elkaar over.

`--text`, `--muted`, `--faint`, `--accent`, `--danger-text`, `--stroke`,
`--stroke-strong` en de bewegings- en radiustokens komen ongewijzigd uit
`tokens.css`. Ze zijn `rgba` over een ondergrond en werken op een dichte grond
net zo goed als op glas.

**Geen `backdrop-filter`, nergens op deze pagina.** Er is niets achter om te
vervagen — geen venstermateriaal, geen zijbalk, alleen onze eigen grond. Eén
regel `backdrop-filter` koopt hier een render surface ter grootte van de viewport
voor een effect dat nul pixels verandert.

### 5.2 De groepskaart

```css
.groep {
  border-radius: var(--radius-content);   /* 12px, zelfde hoek als de pagina */
  background-color: var(--vlak-1);
  /* De goedkope rim uit richting-materiaal §2.3: vier inset-schaduwen, geen
     pseudo-element, volgt de afronding. In licht is --rand-top wit op wit en
     dus onzichtbaar; in donker doet hij het hele werk, want een zwarte schaduw
     zegt daar niets. --rand-kant sluit de vorm aan de buitenkant af.
     De negatieve spread in --kaart-schaduw houdt de schaduw kleiner dan de
     kaart; zonder dat wordt hij op een lichte grond een grijze vlek. */
  box-shadow: var(--rand), 0 0 0 1px var(--rand-kant), var(--kaart-schaduw);
}

.groep + .groep { margin-top: 20px; }
```

De dure rim (`mask-composite: exclude`) hoort volgens de gekozen richting op
precies één vlak in de app: het actieve tabblad in de zijbalk. Hier staan tien
kaarten naast elkaar in dezelfde rol; dan is de goedkope variant niet alleen
goedkoper maar ook juister, want er is geen enkele reden dat de ene kaart zich
zou verheffen boven de andere.

### 5.3 De rij

De zijbalk heeft één rijhoogte, en die is 32px (`--rij`). Deze pagina wijkt daar
af, en dat is een bewuste afwijking met een reden: een zijbalkrij is een regel
die je scant, een instellingenrij is een formulierregel met een besturing erin.
Een keuzelijst van 30px in een rij van 32 heeft één pixel lucht boven en onder.

```css
:root {
  --rij-instelling: 40px;
  --kaart-vulling: 16px;
}

.rij {
  position: relative;
  display: grid;
  /* Label links, besturing rechts, altijd op dezelfde rechterkantlijn. De
     besturingskolom heeft een maximum: een keuzelijst van 500px breed leest
     als een tekstveld. */
  grid-template-columns: minmax(0, 1fr) minmax(0, 300px);
  align-items: center;
  gap: 16px;
  min-height: var(--rij-instelling);
  padding: 5px var(--kaart-vulling);
}

/* De scheidingslijn begint op de tekstrail en niet op de rand van de kaart:
   zo leest de kaart als één ding met regels erin, en niet als vier kaartjes. */
.rij + .rij::before {
  content: "";
  position: absolute;
  inset: 0 0 auto var(--kaart-vulling);
  height: 1px;
  background: var(--stroke);
}

.rij > .label { font-weight: 400; color: var(--text); }
.rij > .besturing { justify-self: end; width: 100%; }

/* Een tweede regel onder het label, alleen waar hij iets uitlegt dat het label
   niet kan. Niet standaard onder elke rij: dan leest niemand ze meer. */
.rij > .uitleg {
  grid-column: 1;
  font-family: var(--font-small);
  font-size: 11px;
  color: var(--muted);
}

.rij[aria-disabled="true"] > .label { color: var(--muted); }
```

Hiërarchie volgens regel 2 van de richting: **gewicht, dan maat, dan kleur.**
Labels op 13/400 in `--text`, uitleg op 11/400 in `--muted`, groepskoppen op
13/500 in `--muted`, scheidingskoppen op 17/600 in `--text`. De waarde in een
keuzelijst staat op 13/400 in `--text` — de gekozen waarde is informatie en hoort
niet bleker te zijn dan het label ernaast.

### 5.4 Smal venster

```css
/* Onder deze breedte past label plus besturing niet meer naast elkaar zonder
   dat een keuzelijst zijn eigen tekst gaat afkappen. Stapelen, en dan meteen
   over de volle breedte: half links uitgelijnd is dan lelijker dan vol. */
@media (max-width: 520px) {
  .rij {
    grid-template-columns: 1fr;
    gap: 6px;
    padding: 10px var(--kaart-vulling);
  }
  .rij > .besturing { justify-self: stretch; max-width: none; }
  #blad { padding: 44px 16px 80px; }
}
```

520px paginabreedte is een venster van ongeveer 794px. Onder het minimum
(`minWidth: 720`, dus 446px pagina) blijft alles bruikbaar.

### 5.5 De besturingen

**Keuzelijst: een echte `<select>`.** `ui-systeem.md` §7.3 verbiedt de native
`<select>` in de zijbalk om twee redenen: de popup is niet vorm te geven, en het
is onzeker of hij boven een `WebContentsView` uitkomt. Op deze pagina vervalt de
tweede reden helemaal — *wij zijn* die view, de popup hoort er per definitie
bovenop — en wordt de eerste een voordeel: het systeem tekent een systeemlijst,
met toetsenbordgedrag, typen-om-te-springen en schermlezerondersteuning die wij
niet hoeven te bouwen. `instellingen.md` §8 zegt dit ook al ("een `<select>` is
met het toetsenbord meteen goed"). De regel uit het ontwerpsysteem geldt daar
waar zijn reden geldt.

```css
.keuzevak { position: relative; }

.keuze {
  appearance: none;
  width: 100%;
  height: 30px;
  padding: 0 30px 0 10px;
  border: 1px solid var(--stroke-strong);
  border-radius: var(--radius-control);
  background-color: var(--vlak-1);
  color: var(--text);
  font: inherit;
  transition: var(--overgang-vlak);
}

.keuze:hover { background-color: var(--vlak-2); }
.keuze:focus-visible { outline: none; border-color: color-mix(in srgb, var(--accent) 55%, transparent); box-shadow: var(--ring); }

/* De chevron als broertje-SVG en niet als achtergrondafbeelding: dan is hij
   currentColor en volgt hij het thema zonder tweede bron. */
.keuzevak svg {
  position: absolute;
  right: 9px;
  top: 50%;
  transform: translateY(-50%);
  width: 12px;
  height: 12px;
  color: var(--muted);
  pointer-events: none;
}
```

**Schakelaar:** `.schakelaar` uit `ui-systeem.md` §7.4, ongewijzigd. Voor alles
dat meteen effect heeft.

**Segmentbalk:** `.segment` uit §7.5, met `--vlak-3` als spoor. Alleen voor de
permissierijen, want daar zijn de drie standen een schaal die je over vijf rijen
heen vergelijkt; een keuzelijst dwingt je dan vijf keer te openen om te zien wat
er staat. Voor alles wat een lijst is en geen schaal: `<select>`.

**Veld:** `.veld` uit §7.2, met de glasregels eruit.

```css
/* Glans en haarlijn suggereren licht dat van boven op een doorschijnend vlak
   valt. Op een dichte pagina is dat een leugen; vulling plus rand is hier het
   hele recept. */
.veld {
  background-image: none;
  box-shadow: none;
  background-color: var(--vlak-1);
  border-color: var(--stroke-strong);
}
.veld:focus { background-color: var(--vlak-1); box-shadow: var(--ring); }
```

**Padveld:** een leesregel plus een knop, geen invoerveld. Een pad met de hand
typen levert alleen typefouten op; kiezen doet `pref:folder`.

```js
// Alleen de laatste twee mappen; het volledige pad staat in title=. Een pad van
// 90 tekens in een kolom van 300 wordt anders drie keer afgekapt op de
// oninteressante helft.
function kortPad(pad) {
  const delen = String(pad).split(/[\\/]/).filter(Boolean);
  return delen.length > 2 ? '…' + pad.slice(pad.length - delen.slice(-2).join('/').length - 1) : pad;
}
```

**Knoppen:** `.knop--zacht` voor "Kies…", "Open map", "Beheren";
`.knop--gevaar` voor "Wis nu", "Terugzetten", "Vergeet". Het bewapenpatroon uit
`style.css` (`data-armed`, tweede klik voert uit, na 2,5s vergeten) geldt voor
alles wat niet terug te draaien is. Er komt geen dialoogvenster; die zijn er in
deze app niet en dit scherm gaat er geen introduceren.

### 5.6 Beweging

Er beweegt hier bijna niets, en dat is de bedoeling.

| Beweegt | Wat | Duur |
| --- | --- | --- |
| ja | `background-color` en `box-shadow` van een besturing onder de muis | `--duur-vlak` via `--overgang-vlak` |
| ja | de duim van een schakelaar | `--duur-vlak`, `--ease-zacht` |
| ja | scrollen naar een sectie bij een diepe link | `scroll-behavior: smooth` |
| nee | het tonen en verbergen van rijen door het filter | direct, `hidden` |
| nee | de kaarten, de koppen, de statusregel | — |

`--ease-zacht` uit richting-materiaal §7.1 (ζ=0,90, ω₀=26, 280ms) vervangt overal
het handmatige `cubic-bezier(0.32, 0, 0.67, 1)`: hij remt af zonder zichtbaar
door te schieten, wat precies is wat een schakelaarduim moet doen. `--ease-veer`
komt hier niet: 4,6% doorschot op een duim van 16 pixels is 0,7 pixel heen en
weer, wat je niet ziet maar wel voelt als onrust in een lijst van veertien
schakelaars.

Het filter animeert niet. Rijen die verdwijnen tijdens het typen zijn de
snelstwisselende inhoud van het hele scherm; elke overgang daarop is een
vertraging tussen jouw toetsaanslag en het antwoord.

### 5.7 Beperkte beweging en geforceerde kleuren

De app krijgt een eigen bewegingsinstelling (§7.3). Die kan geen media query
zijn, dus staat hij als attribuut op `<html>`:

```css
/* Alle duren staan als token, dus één blok zet ze allemaal op nul — zonder
   !important, zonder de keyframes te hoeven kennen. Wat overblijft zijn de twee
   benoemde animaties, en die staan hier expliciet. */
:root[data-beweging="beperkt"] {
  --duur-tik: 0ms;
  --duur-vlak: 0ms;
  --duur-wissel: 0ms;
  --duur-paneel: 0ms;
  --duur-schuif: 0ms;
  --verzet: 0px;
  scroll-behavior: auto;
}

:root[data-beweging="beperkt"] .schakelaar::after { transition: none; }

@media (forced-colors: active) {
  /* Windows-contrastthema's gooien vullingen weg. Dan moeten randen het werk
     doen, anders is een groepskaart onzichtbaar en zweven de rijen los. */
  .groep { border: 1px solid CanvasText; box-shadow: none; }
  .rij + .rij::before { background: CanvasText; }
  .keuze, .veld { border: 1px solid CanvasText; }
}
```

`prefers-reduced-motion: reduce` blijft daarnaast gewoon werken; de instelling
`systeem` zet geen attribuut en laat de media query het werk doen.

### 5.8 Eén ontworpen moment, en waar het valt

De gekozen richting heeft precies één ontworpen moment in de hele app: de glyph.
Dit scherm voegt er geen tweede aan toe, en dat is een keuze en geen tekort — een
instellingenscherm dat je wilt blijven bekijken is een instellingenscherm dat je
te vaak nodig hebt.

Waar het scherm wél karakter mag hebben, is de rij **Kleur** in de eerste groep.
Zes stippen, je kiest er een, en de verandering landt niet hier maar acht rijen
naar links: de stip in de voet van de zijbalk kleurt mee, meteen. Dat is de enige
plek in dit scherm waar je iets doet en het antwoord buiten het scherm valt, en
het is gratis — het volgt uit de bestaande `pushState()`.

---

## 6. Bediening met alleen het toetsenbord

### 6.1 De volgorde

1. `Ctrl + ,` opent het scherm en zet de focus in het zoekveld. Bestaat het
   scherm al voor deze workspace, dan wordt het geactiveerd en gaat de focus naar
   hetzelfde veld, met de inhoud geselecteerd.
2. Tab: zoekveld → (wisknopje, alleen als er tekst staat) → de eerste besturing
   van de eerste zichtbare groep → verder in documentvolgorde → de knoppen in de
   voet.
3. **Een rij is zelf niet focusbaar.** Elke rij heeft precies één tabstop: zijn
   besturing. Het label is een `<label for>`, dus klikken op de tekst zet de
   focus op de besturing en een schermlezer leest ze samen.
4. Shift+Tab loopt terug, zonder val. Er is geen modaliteit op dit scherm.

### 6.2 Springen zonder muis

| Toets | Doet |
| --- | --- |
| `/` (buiten een tekstveld) | focus naar het zoekveld, scroll naar boven |
| `Pijl omlaag` in het zoekveld | focus naar de eerste besturing van de eerste zichtbare groep |
| `Escape` in het zoekveld | wist het filter; is het al leeg, dan gebeurt er niets |
| `Home` / `End` | begin en eind van de pagina (standaardgedrag, niet afvangen) |
| `Ctrl + ,` | terug naar het zoekveld |

`Ctrl + F` gaat naar de zoekbalk van de browser en niet naar dit filter. Dat is
geen omissie maar het gevolg van `ROUTEKAART.md` §1.3: de router vangt hem af
vóór de pagina, op elke webContents. Twee dingen die "zoeken" heten op één toets
zou erger zijn dan `/` moeten leren.

### 6.3 Lange lijsten krijgen geen roving tabindex, maar een deksel

Twee lijsten kunnen lang worden: de permissie-uitzonderingen en de sneltoetsen.
De reflex is een samengesteld element met pijltoetsnavigatie en één tabstop. Dat
werkt niet zodra elke rij zelf een besturing bevat — dan vecht de pijltoets in de
rij met de pijltoets in de keuzelijst, en heb je een tweede laag regels nodig om
uit te leggen wanneer welke wint.

Goedkoper en beter: **de lijst is gewone tabvolgorde, maar hij is kort.**

- Uitzonderingen: hoogstens acht rijen zichtbaar, daarna een knop "Toon alle 23".
  De knop is één tabstop; wie er niet op drukt loopt door acht rijen, niet door
  drieëntwintig.
- Sneltoetsen: zes herbindbare rijen, elk één knop. De vaste sneltoetsen eronder
  zijn gewone tekst en dus geen tabstop — je kunt ze toch niet veranderen.

### 6.4 Een sneltoets opnemen, en het gevaar daarbij

De knop in de rij toont de huidige combinatie. Enter of spatie start de opname.

```
Nieuw tabblad          [ Ctrl T ]          → Enter →   [ Druk een combinatie ]
```

- De eerstvolgende toetsaanslag mét modificatietoets wordt de nieuwe combinatie.
- `Escape` breekt af en zet de oude terug. `Backspace` zet terug op de standaard.
- Weigeren, met de reden onder de rij in `--danger-text`: geen modificatietoets;
  een vaste combinatie (`F12`, `Ctrl+Shift+I`, `Escape`, `Ctrl+1..9`,
  `Ctrl+Shift+1..9`); `Ctrl+C/V/X/A/Z`, want die horen bij tekst; en een
  combinatie die al aan een andere actie hangt — dan noemt de melding welke.
- De opname stopt vanzelf bij blur, bij navigeren, en na tien seconden.

**Het gevaar zit in de router.** `before-input-event` draait in het hoofdproces,
vóór de pagina. Druk je Ctrl+T tijdens een opname, dan opent er een tabblad en de
pagina heeft de toets nooit gezien — de opname kan die aanslag niet vangen en al
helemaal niet tegenhouden. Dus moet de pagina de router tijdelijk stilzetten:

| Kanaal | Richting | Lading |
| --- | --- | --- |
| `pref:capture` | pagina → main, `invoke` | `boolean` |

Zolang `true`, slaat `bindSneltoetsen` alle **herbindbare** acties over voor
*deze* webContents. De vaste blijven staan: DevTools en Escape moeten altijd
werken, ook als er iets vastloopt. En omdat een blijvend gezette vlag elke
sneltoets in de app om zeep helpt, wordt hij ook opgeruimd door main zelf:
bij `destroyed`, bij `did-start-navigation`, bij `blur` van het venster, en door
een eigen klok van tien seconden. Het scherm is niet de enige partij die hem uit
mag zetten.

### 6.5 Diepe links en focus

```css
/* Het eiland kan de bovenste 26px van deze pagina bedekken; met deze marge
   landt een sectiekop daar altijd onder. */
.groep h2 { scroll-margin-top: 32px; }
```

Bij `pref:goto(sectie)` en bij een `#fragment` bij het laden:

1. het zoekveld wissen (anders wijst de link naar een verborgen groep),
2. `el.scrollIntoView({ block: 'start', behavior: mag ? 'smooth' : 'auto' })`,
3. focus naar `h2[tabindex="-1"]` van de groep, zodat de volgende Tab in de groep
   landt en een schermlezer de kop voorleest.

### 6.6 Focus overleeft een update

`pref:changed` duwt de hele stand bij elke wijziging — ook bij die van jezelf, en
ook bij die uit een tweede venster. `replaceChildren()` zou dan je focus, je
selectie en je halfgetypte naam opeten. Dat is exact de fout die
`richting-verstilling.md` §10.1 voor de tabbladlijst repareert, en hier is hij
erger, want hier zit je te typen.

```js
// Dezelfde regel als voor de tabbladlijst: rijen worden gemaakt op sleutel en
// daarna alleen nog bijgewerkt. Een besturing die de focus heeft wordt
// overgeslagen — anders overschrijft een push van jouw eigen wijziging het veld
// waar je nog in staat.
function werkRijBij(rij, waarde) {
  const el = rij.querySelector('.besturing > *');
  if (el === document.activeElement) return;
  if (el.type === 'checkbox') el.checked = waarde;
  else el.value = waarde ?? '';
}
```

Dat geldt onvoorwaardelijk voor het naamveld, het padveld en de sneltoetsknop in
opnamemodus. Voor de rest is de focuscontrole genoeg.

### 6.7 Het filter

- Matcht op het rijlabel, de groepsnaam, de zichtbare optielabels van een
  keuzelijst, én een lijst synoniemen per rij (`data-zoek="cookies opruimen
  vergeten"`). Zonder synoniemen vindt "cookies" de rij "Bij afsluiten" niet, en
  dat is precies waar mensen naar zoeken.
- Een rij die niet matcht krijgt `hidden`; een groep zonder zichtbare rijen ook;
  een scheidingskop verdwijnt als beide groepen eronder weg zijn.
- Boven de eerste groep staat een live regel: "2 instellingen gevonden"
  (`aria-live="polite"`, `tabular-nums`).
- Niets gevonden: de lege toestand uit `ui-systeem.md` §7.7, twee regels.
  *Geen instelling met «pdf»* / *Niet alles in Tougather is instelbaar. Escape
  wist het zoekveld.*
- Het filter wordt niet bewaard. Een filter dat een herstart overleeft verbergt
  instellingen waarvan je niet meer weet dat je ze verborgen hebt.

---

## 7. De optiecatalogus

Legenda: **B** = bereik (`ws` = deze workspace, `gl` = globaal). Rijen zonder
markering staan al in `instellingen.md` §2 en worden hier alleen geplaatst en
vormgegeven; **nieuw** betekent dat dit document ze toevoegt.

### 7.1 Groep "Workspace" (`#workspace`)

| Rij | Besturing | Waarden | Standaard | B | Uitvoering |
| --- | --- | --- | --- | --- | --- |
| Naam | veld, max 40 tekens | tekst | de huidige naam | ws | `ws:rename` (bestaat) |
| Kleur — **nieuw** | zes stippen, radiogroep | 0–5 | `colorIndex`, dus `(id-1) % 6` | ws | nieuw veld `kleur`; `pushState()` stuurt hem al mee als `colorIndex` |
| Zoekmachine | `<select>` | Zelfde als overal (Google) / Google / DuckDuckGo / Bing | erven | ws | uit `ZOEKMACHINES` in `renderer/search.js` |
| Nieuw tabblad | `<select>` + veld | De lege pagina / Een adres… | lege pagina | ws | `newtabURL(ws)` |
| Downloadmap | `<select>` + pad + Kies… | Zelfde als overal (Downloads) / Een andere map… | erven | ws | `ses.setDownloadPath()` |
| Bij afsluiten | `<select>` | Niets wissen / Cookies en opslag wissen | niets wissen | ws | `clearStorageData()` bij `before-quit` |
| Wis nu — **nieuw** | knop `.knop--gevaar`, bewapend | — | — | ws | `ws:clear` → `clearStorageData()` meteen, statusregel bevestigt |
| Trackerbescherming — **nieuw hier** | schakelaar | aan/uit | aan | ws | `permissies-en-privacy.md` §10; die legt hem per site vast, dit is de stand van de workspace |
| Kim mag in deze workspace werken | schakelaar | aan/uit | aan | ws | `startAgent()` weigert als hij uit staat |

De rij **Kleur** is nieuw omdat `colorIndex` nu automatisch uit het id volgt en
er dus geen enkele manier is om twee workspaces uit elkaar te trekken die
toevallig naast elkaar in de kleurcyclus vallen. De rij **Naam** is nieuw als
*plek*: hernoemen kan nu alleen met dubbelklikken op de naam in de voet, en dat
is niet te vinden en niet met het toetsenbord te doen. Beide schrijven naar
dezelfde `ws:rename` als de zijbalk; wie het laatst schrijft wint, en het veld
wordt niet bijgewerkt zolang het de focus heeft (§6.6).

**Wis nu** heeft een tekst nodig die niet liegt: de knop wist cookies,
localStorage, IndexedDB, cachestorage en serviceworkers van deze workspace, en
laat je tabbladen open. Onder de rij: *Je blijft dan overal in deze workspace
uitgelogd.*

### 7.2 Groep "Wat sites hier mogen" (`#sites`)

Acht rijen met een segmentbalk van drie standen — `Vragen | Toestaan |
Blokkeren` — precies de drie uit `permissies-en-privacy.md` §2. De sleutels
komen uit de beleidstabel §3 van dat document.

| Rij | Sleutel | Standaard | B |
| --- | --- | --- | --- |
| Camera | `media.video` | Vragen | ws |
| Microfoon | `media.audio` | Vragen | ws |
| Locatie | `geolocation` | Vragen | ws |
| Meldingen | `notifications` | Vragen | ws |
| Klembord lezen | `clipboard-read` | Vragen | ws |
| Scherm delen | `display-capture` | Blokkeren | ws |
| Bestanden op je schijf | `fileSystem` | Blokkeren | ws |
| Een ander programma openen | `openExternal` | Blokkeren | ws |

Onder de acht rijen, gescheiden door een lijn over de volle kaartbreedte, de
uitzonderingen per herkomst:

```
  meet.google.com          Camera, microfoon   Toestaan  ▾   Vergeet
  nu.nl                    Meldingen           Blokkeren ▾   Vergeet
  Toon alle 23
```

- Herkomst als tekst, met een gekleurde beginletter als merk. **Geen favicons:**
  die ophalen zou aan precies die site verklappen dat je zijn permissieregel
  bekijkt, en de CSP van deze pagina laat het terecht niet toe.
- Hoogstens acht, dan "Toon alle N" (§6.3).
- "Vergeet" is bewapend en verwijdert de hele regel voor die herkomst.
- Leeg: *Nog geen uitzonderingen* / *Sites waaraan je iets toestaat of weigert
  komen hier te staan.*

Zolang het vraagmoment (`ask:show`, `ROUTEKAART.md` §1.6) er niet is, gedraagt
`Vragen` zich als `Blokkeren`. Dat staat dan als één regel onder de kop van de
groep, en verdwijnt zodra het er wel is. Een stand die iets anders doet dan hij
zegt, moet dat zeggen.

### 7.3 Groep "Uiterlijk" (`#uiterlijk`)

| Rij | Besturing | Waarden | Standaard | B | Uitvoering |
| --- | --- | --- | --- | --- | --- |
| Thema | `<select>` | Systeem / Licht / Donker | Systeem | gl | `nativeTheme.themeSource` |
| Doorschijnend venster — **nieuw** | schakelaar | aan/uit | aan | gl | `win.setBackgroundMaterial('acrylic' \| 'none')`, op macOS `win.setVibrancy('sidebar' \| null)` |
| Beweging — **nieuw** | `<select>` | Systeem / Volledig / Beperkt | Systeem | gl | `data-beweging` op `<html>` in elke renderer |
| Standaard zoom — **nieuw** | `<select>` | 67 / 75 / 80 / 90 / 100 / 110 / 125 / 150 / 175 / 200% | 100% | gl | `wc.setZoomFactor()` bij `did-finish-load` |

**Doorschijnend venster** is de belangrijkste nieuwe rij van dit hele scherm, en
hij bestaat om de zwakste plek van de gekozen richting op te vangen. De hele
visuele opzet leunt erop dat `backgroundMaterial: 'acrylic'` gehonoreerd wordt.
Staat Windows-transparantie uit, draait de app via Remote Desktop, of staat de
batterijbesparing aan, dan gebeurt dat niet en kijk je tegen
`backgroundColor: '#00000000'` aan. Deze schakelaar maakt daar een keuze van in
plaats van een storing.

Uit betekent: materiaal op `'none'` én een dekkende vensterkleur zetten
(`win.setBackgroundColor()`), en de zijbalk krijgt `--zijbalk-dicht` in plaats
van zijn halftransparante plaat. Dat is één extra tokenpaar, en het is dezelfde
plaat die richting-materiaal §4.3 sowieso onder `#sidebar` wil hebben — alleen
dan op vol.

Onder de rij: *Uit als je bureaublad door je vensters heen schemert en dat je in
de weg zit, of als Windows transparantie uit heeft staan.*

**Beweging** kan geen media query zijn, want een gebruiker die zijn systeem niet
wil verzetten moet deze app toch stil kunnen krijgen. Alle duren staan als token,
dus het attribuut zet ze op nul (§5.7). Twee dingen die daar niet onder vallen en
hun eigen tak nodig hebben:

- `glyph.js` is een canvas met een eigen rAF-lus; die leest het attribuut
  naast `matchMedia('(prefers-reduced-motion: reduce)')` en tekent dan één frame
  per stand, precies zoals `ui-systeem.md` §6.5 al voorschrijft.
- `newtab.html` en `fout.html` hebben geen preload en kunnen `pref:changed` niet
  ontvangen. De stand gaat mee in de query, naast de zoekmachine die daar al zo
  meegaat: `?motor=duckduckgo&beweging=beperkt`.

**Standaard zoom** geldt alleen waar geen zoom per site is opgeslagen;
`ROUTEKAART.md` stap 7 legt vast dat zoom per site in de voorkeurenopslag zit
onder de partitiesleutel. Deze rij is de bodem waarop dat rust.

Niet in deze groep, en dat is opzettelijk: geen accentkleur (het accent betekent
in deze app precies één ding — selectie en focus — en een instelbare accentkleur
maakt daar decoratie van), geen zijbalkbreedte (264 zit in `lib/maten.js` en in
de layoutberekening van elke view), en geen dichtheidsstand (`ui-systeem.md` §12
sluit die uit).

### 7.4 Groep "Starten en tabbladen" (`#starten`)

| Rij | Besturing | Waarden | Standaard | B |
| --- | --- | --- | --- | --- |
| Bij starten | `<select>` | Een nieuw tabblad / Verdergaan waar je was | nieuw tabblad | gl |
| Begin in — **nieuw** | `<select>` | De laatst gebruikte workspace / een vaste uit de lijst | laatst gebruikte | gl |
| Als je het laatste tabblad sluit — **nieuw** | `<select>` | Een nieuw tabblad openen / Het venster sluiten | nieuw tabblad | gl |

"Verdergaan waar je was" staat uitgeschakeld met de reden eronder zolang
sessieherstel er niet is (`ROUTEKAART.md` stap 6) — dezelfde conventie als
`instellingen.md` §2. Dat is de enige uitgeschakelde rij in het hele scherm, en
dat moet zo blijven: een scherm met vijf grijze rijen is een scherm dat over
zichzelf gaat.

"Als je het laatste tabblad sluit" is de eerste instelbare regel in `closeTab()`,
waar nu onvoorwaardelijk `this.createTab(NEWTAB, ws)` staat.

### 7.5 Groep "Zoeken en adresbalk" (`#zoeken`)

| Rij | Besturing | Waarden | Standaard | B |
| --- | --- | --- | --- | --- |
| Zoekmachine | `<select>` | de sleutels uit `ZOEKMACHINES` | Google | gl |
| In de adresbalk — **nieuw** | `<select>` | Alleen de site (nu.nl) / Het volledige adres | alleen de site | gl |

De tweede rij is de ontsnapping voor verstilling §4. Het inkorten tot de host is
de juiste standaard — het is wat Safari doet, en het lost meteen op dat halve
ingetypte invoer blijft staan — maar het gooit wel het pad weg, en wie de hele
dag op paden let heeft daar een echte klacht. Eén keuzelijst is goedkoper dan het
gevecht.

### 7.6 Groep "Downloads" (`#downloads`)

| Rij | Besturing | Waarden | Standaard | B |
| --- | --- | --- | --- | --- |
| Bewaar in | pad + Kies… | absoluut pad | `app.getPath('downloads')` | gl |
| Vraag elke keer waar | schakelaar | aan/uit | uit | gl |
| Waarschuw bij risicovolle bestandstypen — **nieuw** | schakelaar | aan/uit | aan | gl |

De derde rij hoort bij `downloads.md` §6 (`RISKANTE_EXTENSIES`): daar wordt de
waarschuwing gebouwd, hier staat de knop die hem uitzet. Onder de rij de eerlijke
tekst: *Tougather kijkt alleen naar de bestandsextensie. Er is geen virusscanner
en geen Safe Browsing.*

Eén botsing die hier wordt opgelost: `downloads.md` §4.2 bewaart
`standaardmap` en `vraagAltijd` in een eigen `downloads.json`, en
`instellingen.md` §2 bewaart `downloadmap` en `vraagWaarheen` in
`voorkeuren.json`. Dat zijn twee namen voor twee keer dezelfde twee waarden.
`ROUTEKAART.md` §1.7 kiest één opslaglaag; dit scherm schrijft naar de
voorkeuren, en `downloads.js` leest daar. `downloads.json` houdt alleen de lijst,
of verdwijnt.

### 7.7 Groep "Privacy en taal" (`#privacy`)

| Rij | Besturing | Waarden | Standaard | B | Uitvoering |
| --- | --- | --- | --- | --- | --- |
| Taal die sites zien — **nieuw** | `<select>` | uit `app.getPreferredSystemLanguages()`, plus nl, en, de, fr | de systeemtaal | gl | `ses.setUserAgent(ua, acceptLanguages)` |
| Spellingcontrole — **nieuw** | schakelaar | aan/uit | **uit** | gl | `ses.setSpellCheckerEnabled()` |
| Woordenboek — **nieuw** | `<select>`, alleen zichtbaar als spelling aan staat | uit `ses.availableSpellCheckerLanguages` | volgt de taal hierboven | gl | `ses.setSpellCheckerLanguages()` |

Beide komen uit `ROUTEKAART.md` stap 7, die ze expliciet hier laat landen.
Spelling staat **uit** omdat Electrons speller zijn woordenboeken bij Google
ophaalt; dat staat als regel onder de schakelaar en niet in een voetnoot:
*Het woordenboek wordt bij Google opgehaald zodra je dit aanzet.*

Onder de drie rijen één alinea vaste tekst, geen besturing:

> Tougather stuurt altijd `Sec-GPC: 1` mee, kort de `Referer` naar andere sites
> in tot alleen het domein, en verbergt in de user agent dat dit Electron is.
> Dat staat vast en is niet uit te zetten.

Drie dingen die altijd aan staan als drie schakelaars tonen die niet bewegen is
theater; als één alinea is het informatie. Dezelfde vorm gebruikt §7.9 voor de
bevestigingsregel van de assistent.

### 7.8 Groep "Sneltoetsen" (`#sneltoetsen`)

Zes herbindbare acties, met de puntnamen uit `ROUTEKAART.md` §1.1 (dat zijn
namen van acties, geen kanalen):

| Actie | Sleutel | Standaard Windows/Linux | macOS |
| --- | --- | --- | --- |
| Nieuw tabblad | `tab.nieuw` | Ctrl T | Cmd T |
| Tabblad sluiten | `tab.sluit` | Ctrl W | Cmd W |
| Naar de adresbalk | `nav.adres` | Ctrl L | Cmd L |
| Commandobalk | `ui.palet` | Ctrl K | Cmd K |
| Balk bovenin | `island.focus` | Ctrl J | Cmd J |
| Instellingen | `ui.instellingen` | Ctrl , | Cmd , |

Daaronder, als gewone tekst in twee kolommen (geen tabstops, want er valt niets
te doen):

> **Vast.** Ctrl 1…9 naar het zoveelste tabblad · Ctrl Shift 1…9 naar de
> zoveelste workspace · Ctrl Shift T laatst gesloten tabblad terug · Ctrl Tab
> volgende tabblad · Ctrl N nieuw venster · Ctrl F zoeken op de pagina ·
> Ctrl D bladwijzer · Ctrl H geschiedenis · Ctrl P printen · Ctrl Shift J
> downloads · Ctrl + / − / 0 zoom · Alt ← / → terug en vooruit · F11 volledig
> scherm · F12 en Ctrl Shift I ontwikkelaarsgereedschap · Escape sluit de
> bovenste laag.

Plus één knop onderaan: **Alle sneltoetsen terugzetten** (bewapend).

Deze lijst wijkt af van `instellingen.md` §7, dat `Ctrl+1..9` aan workspaces
vastzet. `ROUTEKAART.md` §1.3 draait dat om — `Ctrl+1..9` gaat naar tabbladen,
workspaces krijgen `Ctrl+Shift+1..9` — en die beslissing wint. Het scherm toont
wat de router doet, niet wat een ouder document wilde.

Interactie en de router-vlag: §6.4.

### 7.9 Groep "Assistent" (`#assistent`)

| Rij | Besturing | Waarden | Standaard | B |
| --- | --- | --- | --- | --- |
| Naam | veld, max 24 tekens | tekst | Kim | gl |
| Model | `<select>` | wat er is | — | gl |
| Sleutel | wachtwoordveld + Bewaar / Verwijder | — | leeg | gl |

De sleutel gaat via `safeStorage.encryptString()` naar `geheimen.bin`. Is
`safeStorage.isEncryptionAvailable()` `false` (op Linux hangt dat aan de
keyring), dan staat de rij uitgeschakeld met de reden: *Je systeem biedt geen
versleutelde opslag aan. Liever geen sleutel dan een sleutel in platte tekst.*

Daaronder één alinea vaste tekst:

> Kim vraagt altijd om bevestiging voordat hij betaalt, iets verstuurt of iets
> verwijdert. Dat staat vast.

En de verwijzing terug: *Of hij in een workspace mag werken, staat bij die
workspace.* Met een link naar `#workspace` — dezelfde kant op als de diepe links
van buiten (§2.5).

**Meervoud.** `main.js` kent vandaag één `this.agent` per venster, dus deze groep
gaat over één assistent en heet daarom "Assistent" en niet "Assistenten". Komen er
meer, dan groeit hij zonder dat de indeling verandert: de drie rijen worden een
lijst van profielen met per profiel dezelfde drie rijen, en de rij "Kim mag in
deze workspace werken" wordt "Wie hier mag werken" met een reeks chips. Dat is de
enige plek in dit scherm die op groei is ontworpen, en het kost nu niets.

### 7.10 Groep "Connectors" (`#connectors`)

Zie §8. In het scherm is het één kaart met een rij per connector en één knop
eronder.

### 7.11 De voet

Geen groep, geen kaart: drie regels tekst met knoppen erin, in `--muted`.

| Regel | Knop |
| --- | --- |
| `Tougather 0.1.0 · Electron 33.4.11 · Chromium 130` | — |
| `Je instellingen staan in …\Tougather` | Open map (`pref:reveal`) |
| — | Deze workspace terugzetten · Alles terugzetten (beide bewapend) |

De versieregel komt uit `app.getVersion()` en `process.versions` in het
hoofdproces en rijdt mee in `pref:changed`; de pagina heeft geen `process`.

---

## 8. De plek van de MCP-connector

De connector zelf — wat hij is, hoe hij verbindt, welk gereedschap hij aanbiedt,
hoe je hem toevoegt — is een eigen ontwerp van iemand anders. Dit document levert
alleen zijn plek, en die plek bepaalt twee dingen die dat ontwerp nodig heeft:
waar de groep staat, en welk bereik een connector heeft.

### 8.1 Waar de groep staat en waarom daar

Direct onder **Assistent** en boven de voet. Een connector is geen browserfunctie
maar gereedschap van de assistent; hij hoort naast degene die hem gebruikt.
Iemand die "wat kan Kim allemaal" wil weten leest twee kaarten achter elkaar.

Staat `assistentMag` uit voor deze workspace, dan is de hele kaart gedimd met één
regel erboven: *Kim werkt niet in deze workspace, dus connectors doen hier
niets.* Dat maakt een afhankelijkheid zichtbaar die anders alleen blijkt uit het
uitblijven van gedrag.

### 8.2 Het bereik: globaal gedefinieerd, per workspace toegestaan

Dit is de enige echte ontwerpbeslissing die hier valt, en hij volgt de leidende
regel van `instellingen.md` §1 exact:

- **Wélke connectors er zijn** is globaal. Een connector heeft een adres, een
  configuratie en meestal een sleutel; dat hoort bij jou en niet bij een sessie.
  Hem per workspace bewaren betekent hem vier keer bewaren.
- **Of een connector hier gebruikt mag worden** hoort per workspace, om precies
  dezelfde reden als `assistentMag`: een connector die je bestanden kan lezen
  mag misschien wel in je research-workspace en niet in je bank-workspace.

Dat levert een kaart op waarin elke rij één schakelaar heeft — "mag in deze
workspace" — en waarin toevoegen, instellen en verwijderen achter **Beheren**
zitten, in het scherm van de andere specialist.

### 8.3 Hoe een rij eruitziet

```
  Bestanden            mcp://localhost:7331          Verbonden   [aan]  Beheren
  Agenda               calendar.example.com          Fout        [uit]  Beheren
  Notities             mcp://localhost:7402          Uit         [uit]  Beheren

  Connector toevoegen…
```

- Naam op 13/400 `--text`, herkomst eronder op 11/400 `--muted`.
- Status als **woord**, niet als stip: `Uit`, `Verbindt…`, `Verbonden`, `Fout`,
  `Toestemming nodig`. Kleur mag meedoen (`--muted`, `--ok-text`,
  `--danger-text`, `--warn-text`) maar draagt de betekenis nooit alleen — dat is
  regel uit `ui-systeem.md` §2.3, en op een scherm met tien statusregels is het
  bovendien de enige manier om ze uit elkaar te houden.
- `Fout` en `Toestemming nodig` krijgen één regel uitleg onder de rij, uit de
  connector zelf; het scherm verzint geen tekst.
- Leeg: *Nog geen connector* / *Een connector geeft je assistent gereedschap
  buiten de browser: je bestanden, je agenda, een database.*

### 8.4 Het contract, als voorstel

Dit is een **voorstel** aan de connectorspecialist, geen vaststaand ontwerp; wat
hier vastligt is alleen dat dit scherm de rijen tekent en de per-workspace
schakelaar bedient. Namen volgen `ROUTEKAART.md` §1.1 (domein Engels-werkwoord).

| Kanaal | Richting | Lading |
| --- | --- | --- |
| `mcp:list` | pagina → main, `invoke` | — → `[{ id, naam, herkomst, status, fout?, aanIn: ['ws-1', …] }]` |
| `mcp:enable` | pagina → main, `invoke` | `{ id, aan }` — altijd voor de workspace van dít tabblad |
| `mcp:open` | pagina → main, `invoke` | `{ id? }` — opent het beheerscherm van de connector; zonder id: toevoegen |
| `mcp:changed` | main → pagina, `send` | dezelfde lijst als `mcp:list` |

`status` is `'uit' | 'verbindt' | 'verbonden' | 'fout' | 'toestemming'`. Meer
heeft dit scherm niet nodig, en alles wat er meer in zit tekent het niet.

De lijst rijdt niet mee in `pref:changed`: een connector die verbinding maakt
verandert vaker van stand dan een voorkeur ooit, en `pref:changed` duwt de hele
voorkeurenstand. Eigen kanaal, eigen tempo — dezelfde afweging die
`ROUTEKAART.md` §1.10 voor downloads maakt.

---

## 9. Wat er in de code bij moet

### 9.1 IPC

De kanalen uit `instellingen.md` §9 met de Engelse werkwoorden uit
`ROUTEKAART.md` §1.1, plus vier nieuwe. Alles via een expliciete methode in
`preload-intern.js`; nooit `ipcRenderer` naar buiten.

| Kanaal | Richting | Lading | Nieuw? |
| --- | --- | --- | --- |
| `pref:get` | invoke | — → `{ globaal, workspace, versies, secties }` | hernoemd |
| `pref:set` | invoke | `{ bereik, sleutel, waarde }` | hernoemd |
| `pref:folder` | invoke | `{ bereik }` → pad of `null` | hernoemd |
| `pref:reset` | invoke | `{ bereik }` | hernoemd |
| `pref:reveal` | invoke | — | hernoemd |
| `pref:changed` | main → pagina | de hele stand | hernoemd |
| `pref:open` | zijbalk → main, invoke | `{ sectie? }` | **nieuw**, vervangt `ui:instellingen` |
| `pref:goto` | main → pagina, send | `sectie \| null` | **nieuw** |
| `pref:capture` | pagina → main, invoke | `boolean` | **nieuw**, §6.4 |
| `ws:clear` | pagina → main, invoke | — | **nieuw**, §7.1 |
| `perm:list` / `perm:set` / `perm:forget` | invoke | zie `permissies-en-privacy.md` | hernoemd |
| `mcp:list` / `mcp:enable` / `mcp:open` / `mcp:changed` | zie §8.4 | | voorstel |

`ui:instellingen` uit `instellingen.md` §9 vervalt: die naam heeft geen werkwoord
en zit in het domein `ui`, dat volgens `ROUTEKAART.md` §1.1 al twee bezette
kanalen heeft (`ui:overlay`, `ui:open`). `pref:open` heeft wel een werkwoord,
staat in het domein waar de rest van dit scherm ook in zit, en is te vinden door
op `pref:` te greppen.

### 9.2 Bovenop `instellingen.md` §11 en de routekaart

Alleen wat dít document toevoegt:

1. `openInstellingen(sectie)` op de controller zoekt binnen de **huidige
   workspace** (§3.2), niet binnen het venster.
2. `neven`-record voor rol `instellingen` krijgt het veld `partitie` (§3.3);
   `instellingenViews` vervalt.
3. `describe()` krijgt `intern`; `renderTab()` tekent daar een pictogram voor
   (§3.4).
4. `kortAdres()` in `app.js` krijgt de tak voor `tougather:` (§3.1).
5. `lib/sneltoetsen.js`: de opnamevlag per webContents (§6.4), plus de regel dat
   Escape doorgelaten wordt als er geen laag openstaat (§2.3).
6. `closeTab()` leest `sluitLaatsteTabblad` (§7.4).
7. `win.setBackgroundMaterial()` / `setVibrancy()` / `setBackgroundColor()` bij
   de schakelaar "Doorschijnend venster" (§7.3), plus het tokenpaar
   `--zijbalk-dicht`.
8. `data-beweging` naar alle renderers, en in de query van `newtab.html` en
   `fout.html` (§7.3).
9. `wc.setZoomFactor()` bij `did-finish-load` (§7.3).
10. `ses.setUserAgent(ua, acceptLanguages)`, `setSpellCheckerEnabled()`,
    `setSpellCheckerLanguages()` in de sessie-opzet van `ROUTEKAART.md` §1.2
    (§7.7).
11. `ws:clear` → `clearStorageData()` met de storages-lijst uit
    `instellingen.md` §11 punt 4, met de statusregel als bevestiging.
12. `app.getVersion()` en `process.versions` mee in `pref:changed` (§7.11).

### 9.3 Bestanden

`instellingen.md` §10 noemt ze al; twee verschuivingen door de routekaart:

- `preload-instellingen.js` bestaat niet; het is één rol in `preload-intern.js`.
- `renderer/instellingen.html` / `.css` / `.js` blijven, en `instellingen.css`
  laadt `tokens.css` en `ui.css` vóór zichzelf.
- Nieuw hier: niets. Dit scherm voegt geen bestand toe dat er niet al stond.

`package.json` → `build.files` moet meegroeien; `instellingen.md` §10 noemt dat
al voor de hoofdprocesmodules.

---

## 10. Wat er bewust niet in staat

- **Geen accentkleur, geen zijbalkbreedte, geen dichtheidsstand.** Zie §7.3.
- **Geen eigen zoekmachine met URL-sjabloon, geen proxy, geen user agent.**
  `instellingen.md` §1 sluit ze uit en dat blijft staan.
- **Geen zoeksuggesties-schakelaar.** De commandobalk bevraagt geen enkele
  server; er is niets om uit te zetten. Zodra dat verandert hoort de schakelaar
  er wél te zijn, in `#zoeken`, standaard uit.
- **Geen tabbladen koud maken na N minuten.** Het koude tabblad komt in het
  fundament (`ROUTEKAART.md` §1.8), maar de klok eromheen is een eigen ontwerp
  met een eigen meting. Een keuzelijst die nu al "Nooit" zegt en verder niets
  doet is erger dan een lege plek.
- **Geen logboekknop bij de assistent.** Zijn logboek en zijn noodstop horen bij
  routekaartpunt 2. Een uitgeschakelde knop naar iets dat niet bestaat is een
  belofte.
- **Geen import, export of synchronisatie.**
- **Geen bevestigingsdialoog.** Er zijn er geen in deze app; het bewapenpatroon
  is het antwoord (`ui-systeem.md` §7.1).
- **Geen Bewaar-knop.** `instellingen.md` §8 legt uit waarom, en §6.6 maakt het
  waar: elke wijziging geldt meteen, en de push overschrijft nooit een besturing
  waar je in staat.

---

## 11. Wat er mis kan gaan

- **De opnamevlag blijft hangen.** Zet `pref:capture(true)` en crasht de pagina,
  dan zijn alle herbindbare sneltoetsen dood tot je herstart. Daarom ruimt main
  hem zelf op bij `destroyed`, `did-start-navigation`, vensterblur en na tien
  seconden, en blijven de vaste sneltoetsen altijd staan. Dit is de gevaarlijkste
  regel code in dit scherm.
- **De popup van een `<select>` wordt geknipt.** Als een Chromium-selectpopup
  binnen de grenzen van de `WebContentsView` blijft in plaats van een eigen
  native venster te zijn, wordt een lijst onderaan de pagina afgekapt.
  Terugvaloptie: de eigen uitklaplijst uit `ui-systeem.md` §7.3, die hier gewoon
  kan omdat we een pagina zijn. Zie §12.
- **De popup krijgt het verkeerde thema.** Zet Tougather op donker terwijl
  Windows licht staat, dan is het goed mogelijk dat de systeemlijst licht
  opengaat. `color-scheme` op `:root` en op de `<select>` hoort dat op te lossen;
  niet nagekeken.
- **Materiaal uitzetten laat een doorzichtig venster achter.** Het venster is
  aangemaakt met `backgroundColor: '#00000000'`. Zet je alleen
  `setBackgroundMaterial('none')` en niet ook een dekkende achtergrondkleur, dan
  is de zijbalk mogelijk zwart of gevuld met wat er toevallig achter stond. De
  volgorde in de handler is: eerst de kleur, dan het materiaal.
- **Twee schermen op dezelfde partitie.** Twee vensters kunnen twee
  instellingenpagina's van dezelfde workspace open hebben. De uitzending naar
  alle vensters (`instellingen.md` §5) zorgt dat ze hetzelfde tonen, en §6.6
  zorgt dat de een de ander niet uit zijn veld tikt. Na `ROUTEKAART.md` §1.5
  (app-brede workspace-id) kan het geval alleen nog met twee vensters, niet meer
  met twee onafhankelijke workspaces.
- **Hernoemen op twee plekken.** De naam is te wijzigen in de zijbalk
  (dubbelklik) en hier. Beide gaan naar `ws:rename`, laatste schrijver wint, en
  het veld dat de focus heeft wordt niet overschreven. Meer garantie is er niet
  en meer is hier ook niet nodig.
- **Een diepe link naar een gefilterde groep.** Opgelost door het filter eerst te
  wissen (§6.5). Vergeet iemand dat bij een nieuwe ingang, dan is het symptoom
  "er gebeurt niets" en is de oorzaak onvindbaar.
- **Het eiland over het scherm.** 0 tot 26 pixels, in een band van 300–380px
  breed, gecentreerd boven het paginagebied (§3.5). De 56px kopmarge en de 32px
  `scroll-margin-top` hangen daaraan; wie de kop van dit scherm verandert, moet
  dat getal opnieuw nakijken.

---

## 12. Wat eerst gemeten moet worden

Geverifieerd in `node_modules/electron/electron.d.ts` versie 33.4.11:

| API | Regel |
| --- | --- |
| `BrowserWindow.setBackgroundMaterial('auto'\|'none'\|'mica'\|'acrylic'\|'tabbed')` | 2972 |
| `BrowserWindow.setBackgroundColor(string)` | 2961 |
| `BrowserWindow.setVibrancy(… \| null)` | 3286 |
| `WebContents.setZoomFactor(number)` / `setZoomLevel(number)` | 16733 / 16745 |
| `Session.setSpellCheckerEnabled(boolean)` | 11996 |
| `Session.setSpellCheckerLanguages(string[])` / `availableSpellCheckerLanguages` | 12006 / 12050 |
| `Session.setUserAgent(userAgent, acceptLanguages?)` | 12043 |
| `App.getPreferredSystemLanguages()` / `getVersion()` | 1258 / 1286 |
| `Shell.showItemInFolder(fullPath)` | 12244 |

Niet nagekeken, en in deze volgorde te meten:

1. **Wordt de popup van een `<select>` geknipt door de `WebContentsView`?** Eén
   pagina met een lijst van twintig opties onderaan het scherm. Dit bepaalt of
   §5.5 blijft staan of terugvalt op de eigen uitklaplijst.
2. **Volgt die popup `color-scheme` in het donkere thema op Windows?** Zelfde
   test, thema omgezet.
3. **Doet `setBackgroundMaterial('none')` op een lopend venster wat het belooft,
   en werkt `setBackgroundColor()` ná aanmaken nog?** Als het tweede niet werkt,
   is de schakelaar "Doorschijnend venster" een instelling die pas na een
   herstart geldt, en dan moet dat er staan.
4. **Ziet `before-input-event` élke toetsaanslag** — ook eentje die een pagina in
   zijn eigen renderer met `preventDefault()` opeet? `instellingen.md` §14 stelt
   die vraag al; de sneltoetsopname hangt eraan.
5. **Mag een sandboxed preload `ipcRenderer` en `contextBridge` gebruiken?**
   Idem; `ROUTEKAART.md` §1.11 zet er `lib/intern.js` op.
6. **Werkt `el.style.setProperty()` onder `style-src 'self'`?** De workspacekleur
   in de kleurrij (`--ws-color` per stip) gaat via een klasse `c0…c5`, precies
   zoals `app.js` het nu doet, dus dit scherm hangt er niet aan. Maar meet het
   één keer, dan hoeft niemand er meer omheen te ontwerpen.

---

## 13. Wat dit niet oplost

- **Het vraagmoment van permissies.** Dit scherm toont en herroept beslissingen;
  het stelt de vraag niet. Tot `ask:show` er is, gedraagt `Vragen` zich als
  `Blokkeren` en staat dat er letterlijk (§7.2).
- **Het beheerscherm van een connector.** Alleen zijn plek, zijn bereik en een
  voorstel voor vier kanalen (§8).
- **Zoom per site.** De keuze zit hier als bodemwaarde; het overzicht van sites
  met een afwijkende zoom hoort bij het sitepaneel achter het slotje.
- **Meerdere assistenten.** De groep is op groei ontworpen (§7.9), maar
  `main.js` kent één `this.agent` en dat lost dit document niet op.
- **Beleid voor organisaties, profielen, synchronisatie.** Geen van drieën, en
  geen van drieën is een gat dat dit scherm moet vullen.
- **Een instelling die niets doet.** Elke rij in §7 heeft een uitvoering, op één
  na — "Verdergaan waar je was" — en die staat uitgeschakeld met de reden. Als
  bij het bouwen blijkt dat een tweede rij nergens op aanhaakt, hoort hij eruit
  en niet grijs.
