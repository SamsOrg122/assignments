/*
 * Wat de gids in een pagina ziet, en niets meer.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WAAR DIT DRAAIT, EN WAAROM DAAR
 *
 * Niet in de pagina en niet in de preload, maar in een eigen isolated world
 * (1000), waar het hoofdproces dit bestand in spuit met
 * `executeJavaScriptInIsolatedWorld`. Drie dingen volgen daaruit, en alle drie
 * zijn gemeten in plaats van gehoopt:
 *
 *   1. De pagina ziet hier niets van. `typeof globalThis.__gids` is in de
 *      pagina zelf `undefined`. Een site kan dit dus niet uitlezen, niet
 *      slopen, en niet doen alsof hij het is.
 *   2. Wat hier staat blijft staan tussen twee aanroepen. Dus wordt dit
 *      bestand één keer per document geladen en daarna alleen nog aangeroepen.
 *   3. Er is hier géén `ipcRenderer`. Wij kunnen niets omhoog sturen uit
 *      onszelf. Alles is vraag-en-antwoord: het hoofdproces roept, wij
 *      antwoorden. Een gebeurtenis — de gebruiker klikt op het doel — komt
 *      omhoog als een Promise die later oplost, en dat werkt.
 *
 * De reden dat het niet gewoon in `renderer/tabblad-preload.js` staat: een
 * preload met `sandbox: true` kan niets inladen. Geen buurbestand, geen
 * `node:path`, alleen `electron`. Gemeten. En er is geen build-stap in dit
 * project. Alles in de preload proppen zou dus betekenen: één bestand van
 * duizend regels dat áltijd in elke pagina meeloopt. Zo niet.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WAT HIER NIET IN KOMT
 *
 * De waarde van een invoerveld. Nooit, van geen enkel veld. Niet omdat
 * wachtwoorden bijzonder zijn maar omdat een half ingevuld formulier dat
 * niemand ooit verstuurd heeft niemands zaken is. Wat wél meegaat is hoe het
 * veld heet, want daar wijst de gids naar.
 *
 * En geen zoekvraag uit het adres: `?q=...` gaat eraf, want dat is vaak het
 * enige persoonlijke aan een URL.
 * ─────────────────────────────────────────────────────────────────────────
 */

(() => {
  const VERSIE = 1;
  if (globalThis.__gids && globalThis.__gids.versie === VERSIE) return 'al geladen';

  /** Hoeveel knopen er hoogstens in één snapshot gaan. */
  const MAX_KNOPEN = 300;
  /** Hoe lang een tekst mag zijn voordat hij wordt afgekapt. */
  const MAX_TEKST = 80;
  /** Hoe ver buiten het beeld nog "vlakbij" heet, in pixels. */
  const DICHTBIJ = 600;

  const INTERACTIEF = [
    'button', 'a[href]', 'input', 'select', 'textarea', 'summary',
    '[contenteditable=""]', '[contenteditable="true"]',
    '[tabindex]:not([tabindex="-1"])',
    '[role=button]', '[role=link]', '[role=tab]', '[role=menuitem]',
    '[role=menuitemcheckbox]', '[role=checkbox]', '[role=radio]',
    '[role=switch]', '[role=option]', '[role=combobox]', '[role=slider]',
    '[role=treeitem]', '[role=textbox]',
  ];

  /** Structuur: niet om naar te wijzen, wel om te weten waar je bent. */
  const STRUCTUUR = ['h1', 'h2', 'h3', 'nav', 'main', 'aside', 'form', 'dialog', '[role=tablist]'];

  /**
   * Rollen die hun naam niet uit hun eigen tekst mogen halen.
   *
   * Een kop is zijn tekst — dat is precies wat een kop is. Een `main` niet:
   * daar is de tekst alles wat erin staat.
   */
  const ZONDER_EIGEN_TEKST = new Set([
    'main', 'navigation', 'complementary', 'form', 'dialog', 'tablist', 'iframe',
  ]);

  const ALLES = [...INTERACTIEF, ...STRUCTUUR].join(',');

  const kort = (t) => {
    const s = String(t ?? '').replace(/\s+/g, ' ').trim();
    return s.length > MAX_TEKST ? s.slice(0, MAX_TEKST - 1) + '…' : s;
  };

  /**
   * De rol zoals een schermlezer hem zou noemen.
   *
   * Een expliciete `role` wint, want die heeft iemand met opzet gezet. Daarna
   * het element zelf. `input` is het enige dat uiteenvalt: een checkbox en een
   * tekstveld zijn twee dingen en het verschil bepaalt wat de gids zegt.
   */
  function rolVan(el) {
    const expliciet = el.getAttribute && el.getAttribute('role');
    if (expliciet) return expliciet.trim().split(/\s+/)[0];

    const tag = el.tagName.toLowerCase();
    if (tag === 'a') return 'link';
    if (tag === 'textarea') return 'textbox';
    if (tag === 'select') return 'combobox';
    if (tag === 'input') {
      const soort = (el.getAttribute('type') || 'text').toLowerCase();
      if (soort === 'checkbox' || soort === 'radio') return soort;
      if (soort === 'submit' || soort === 'button' || soort === 'reset') return 'button';
      if (soort === 'range') return 'slider';
      if (soort === 'password') return 'wachtwoordveld';
      return 'textbox';
    }
    if (tag === 'h1' || tag === 'h2' || tag === 'h3') return 'heading';
    if (tag === 'nav') return 'navigation';
    if (tag === 'aside') return 'complementary';
    return tag;
  }

  /**
   * De naam die een mens zou gebruiken, in de volgorde die de
   * toegankelijkheidsboom ook aanhoudt.
   *
   * `textContent` pas laat: een knop met een aria-label heeft dat label niet
   * voor niets, en de tekst erin kan een icoonnaam zijn die niemand uitspreekt.
   */
  function naamVan(el, wortel) {
    const label = el.getAttribute && el.getAttribute('aria-label');
    if (label) return kort(label);

    const doorId = el.getAttribute && el.getAttribute('aria-labelledby');
    if (doorId) {
      const stukken = doorId.split(/\s+/)
        .map((id) => (wortel.getElementById ? wortel.getElementById(id) : null))
        .filter(Boolean)
        .map((n) => n.textContent);
      if (stukken.length) return kort(stukken.join(' '));
    }

    if (el.labels && el.labels.length) return kort(el.labels[0].textContent);

    // Een landmark heeft geen naam tenzij iemand er een gegeven heeft. Zijn
    // tekst is de hele sectie eronder, en `main "Postvak in Opstellen Zoek in
    // post"` is geen naam maar een samenvatting die niemand gevraagd heeft —
    // en hij vervuilt elke regel waarin een model naar een naam zoekt.
    if (!ZONDER_EIGEN_TEKST.has(rolVan(el))) {
      const tekst = el.textContent;
      if (tekst && tekst.length < 400) {
        const s = kort(tekst);
        if (s) return s;
      }
    }

    for (const attr of ['title', 'placeholder', 'alt', 'name']) {
      const v = el.getAttribute && el.getAttribute(attr);
      if (v) return kort(v);
    }
    return '';
  }

  /** Wat er over de stand van een element te zeggen valt, in vaste volgorde. */
  function vlaggenVan(el, verborgenDoor) {
    const v = [];
    if (el.disabled || el.getAttribute?.('aria-disabled') === 'true') v.push('disabled');
    if (el.checked || el.getAttribute?.('aria-checked') === 'true') v.push('checked');
    const uit = el.getAttribute?.('aria-expanded');
    if (uit === 'true') v.push('expanded');
    if (uit === 'false') v.push('collapsed');
    if (el.selected || el.getAttribute?.('aria-selected') === 'true') v.push('selected');
    if (el === document.activeElement) v.push('focused');
    if (el.required) v.push('required');
    if (verborgenDoor) v.push('obscured');
    return v;
  }

  /**
   * Waar het element staat ten opzichte van wat je ziet.
   *
   * Dit is wat bepaalt of de gids eerst moet scrollen, dus het staat erbij en
   * wordt niet uit de rect afgeleid door het model.
   */
  function plaatsVan(r, breedte, hoogte) {
    if (r.bottom < 0) return 'above';
    if (r.top > hoogte) return 'below';
    if (r.right < 0) return 'left';
    if (r.left > breedte) return 'right';
    return 'viewport';
  }

  /** Hoe ver buiten beeld, voor de volgorde waarin we knopen weggooien. */
  function afstandVan(r, hoogte) {
    if (r.bottom < 0) return -r.bottom;
    if (r.top > hoogte) return r.top - hoogte;
    return 0;
  }

  /**
   * Zichtbaar, zo goedkoop mogelijk.
   *
   * `checkVisibility` doet in één aanroep wat anders drie uitlezingen van een
   * volledige stijl kost, en een stijl uitlezen dwingt Chromium tot werk dat
   * per element optelt. Op een pagina met tweeduizend knopen scheelt dat het
   * verschil tussen honderdtachtig milliseconden en twintig.
   */
  const zichtbaar = (el) => {
    if (el.getAttribute && el.getAttribute('aria-hidden') === 'true') return false;
    if (typeof el.checkVisibility === 'function') {
      return el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });
    }
    let stijl;
    try {
      stijl = getComputedStyle(el);
    } catch {
      return false;
    }
    if (!stijl) return false;
    if (stijl.display === 'none' || stijl.visibility === 'hidden') return false;
    return Number(stijl.opacity) !== 0;
  };

  /**
   * Alle knopen in één document, inclusief open shadow roots en frames van
   * dezelfde herkomst.
   *
   * `verschuiving` telt op bij elke rect: een element in een iframe meldt zijn
   * plaats ten opzichte van dát frame, en de gids wijst in het venster.
   */
  function verzamel(wortel, verschuiving, diepte, uit, context = null) {
    if (diepte > 5) return;

    let kandidaten;
    try {
      kandidaten = wortel.querySelectorAll(ALLES);
    } catch {
      return;
    }

    // Eerst alle rects in één ronde, dan pas iets anders aanraken. Door elkaar
    // lezen en schrijven dwingt de pagina tot een nieuwe layout per element, en
    // dan kost een snapshot geen twintig milliseconden maar twee seconden.
    const rects = [];
    for (const el of kandidaten) rects.push(el.getBoundingClientRect());

    const breedte = window.innerWidth;
    const hoogte = window.innerHeight;

    // Hier alleen wat goedkoop is: maat, zichtbaarheid, plaats. De naam, de
    // vlaggen en de vraag of er iets overheen ligt kosten echt werk, en die
    // stellen we uit tot na het afkappen op MAX_KNOPEN — anders betalen we
    // tweeduizend keer voor driehonderd antwoorden.
    for (let i = 0; i < kandidaten.length; i++) {
      const el = kandidaten[i];
      const r = rects[i];
      if (r.width <= 0 || r.height <= 0) continue;
      if (!zichtbaar(el)) continue;

      uit.push({
        el,
        wortel,
        context,
        rect: [
          Math.round(r.left + verschuiving.x),
          Math.round(r.top + verschuiving.y),
          Math.round(r.width),
          Math.round(r.height),
        ],
        // De plek binnen het eigen document, want daarmee wordt gemeten of er
        // iets overheen ligt. Voor een frame is dat een ander stelsel dan het
        // venster, en daarom staat het er los bij.
        eigenRect: [r.left, r.top, r.width, r.height],
        plaats: plaatsVan(r, breedte, hoogte),
        afstand: afstandVan(r, hoogte),
        diepte,
      });
    }

    // Open shadow roots. Die hangen níét aan de kiezer hierboven: de gastheer
    // is meestal een `<div>` zonder rol, dus hij komt er nooit in en de knop
    // erbinnen bleef onzichtbaar. Vandaar een eigen ronde langs alles wat een
    // root heeft. Eén doorloop over elementen die toch al in het geheugen
    // staan; de kosten zitten in de rects, niet hierin.
    let alle;
    try {
      alle = wortel.querySelectorAll('*');
    } catch {
      alle = [];
    }
    for (const el of alle) {
      // Een gesloten root is met opzet dicht en wij zijn hier te gast.
      if (el.shadowRoot) verzamel(el.shadowRoot, verschuiving, diepte + 1, uit, context ?? 'shadow');
    }

    // Frames apart, want die staan ook niet in de kiezer.
    let frames = [];
    try {
      frames = wortel.querySelectorAll('iframe, frame');
    } catch { /* geen */ }

    for (const frame of frames) {
      const fr = frame.getBoundingClientRect();
      if (fr.width <= 0 || fr.height <= 0) continue;
      const fx = Math.round(fr.left + verschuiving.x);
      const fy = Math.round(fr.top + verschuiving.y);

      let binnen = null;
      try {
        binnen = frame.contentDocument;
      } catch {
        binnen = null;
      }

      if (!binnen) {
        // Van een andere herkomst. We kunnen er niet in, en dat is hoe het
        // hoort. Eén knoop, zodat de gids er tenminste naar kan wijzen en kan
        // zeggen dat het antwoord daarbinnen ligt.
        uit.push({
          el: frame,
          wortel,
          context,
          vreemdFrame: true,
          rect: [fx, fy, Math.round(fr.width), Math.round(fr.height)],
          eigenRect: [fr.left, fr.top, fr.width, fr.height],
          plaats: plaatsVan(fr, breedte, hoogte),
          afstand: afstandVan(fr, hoogte),
          diepte,
        });
        continue;
      }

      const naamFrame = kort(frame.getAttribute('title') || frame.getAttribute('name') || 'frame');
      verzamel(binnen, { x: fx, y: fy }, diepte + 1, uit, `frame "${naamFrame}"`);
    }
  }

  /**
   * Wat een knoop kost om echt te beschrijven, pas gedaan voor de knopen die
   * het gehaald hebben.
   *
   * `textContent` op tweeduizend elementen is op zichzelf al werk, en
   * `elementFromPoint` dwingt een hit-test af. Driehonderd keer is prima,
   * tweeduizend keer is de helft van de rekening.
   */
  function beschrijf(k) {
    if (k.vreemdFrame) {
      return {
        ...k,
        rol: 'iframe',
        naam: kort(k.el.getAttribute('title') || k.el.getAttribute('name')
          || kortPad(k.el.getAttribute('src')) || 'frame'),
        vlaggen: ['cross-origin'],
        href: null,
      };
    }

    const el = k.el;
    // Alleen binnen het eigen document meten: een element in een frame kan
    // zichzelf niet tegen het venster aanhouden, en `elementFromPoint` van het
    // hoofddocument zou daar het frame zelf teruggeven.
    let bedekt = false;
    if (k.diepte === 0) {
      const [l, t, b, h] = k.eigenRect;
      const midX = l + b / 2;
      const midY = t + h / 2;
      if (midX >= 0 && midX <= window.innerWidth && midY >= 0 && midY <= window.innerHeight) {
        const boven = document.elementFromPoint(midX, midY);
        bedekt = Boolean(boven) && boven !== el && !el.contains(boven) && !boven.contains(el);
      }
    }

    const wortel = k.wortel && k.wortel.getElementById ? k.wortel : document;
    return {
      ...k,
      rol: rolVan(el),
      naam: naamVan(el, wortel),
      vlaggen: vlaggenVan(el, bedekt),
      href: el.tagName === 'A' ? kortPad(el.getAttribute('href')) : null,
    };
  }

  /** Een adres zonder de vraag erachter; zie de kop van dit bestand. */
  function kortPad(href) {
    if (!href) return null;
    try {
      const u = new URL(href, location.href);
      const pad = u.pathname + (u.hash || '');
      return kort(pad.length > 60 ? pad.slice(0, 59) + '…' : pad);
    } catch {
      return kort(String(href).slice(0, 60));
    }
  }

  // ── De boekhouding ────────────────────────────────────────────────────

  /** @type {Map<string, WeakRef<Element>>} */
  let register = new Map();
  /** Wat we van elke knoop onthouden om hem terug te vinden als hij weg is. */
  let kenmerken = new Map();
  let snapshotId = 0;
  let verouderd = false;
  let waarnemer = null;

  /**
   * Merken dat de pagina onder ons verandert.
   *
   * Niet om meteen iets te doen — wij kunnen niets omhoog sturen — maar zodat
   * het antwoord op de volgende vraag "verouderd" kan zijn in plaats van een
   * rect die nergens meer op slaat. Alleen childList: een pagina die tekst
   * bijwerkt heeft zijn knoppen nog.
   */
  function kijkMee() {
    if (waarnemer) waarnemer.disconnect();
    waarnemer = new MutationObserver((lijst) => {
      for (const m of lijst) {
        if (m.addedNodes.length || m.removedNodes.length) { verouderd = true; return; }
      }
    });
    try {
      waarnemer.observe(document.documentElement, { childList: true, subtree: true });
    } catch { /* een document dat al weg is */ }
  }

  function maakSnapshot() {
    const begin = performance.now();
    snapshotId += 1;
    register = new Map();
    kenmerken = new Map();
    verouderd = false;

    const rauw = [];
    verzamel(document, { x: 0, y: 0 }, 0, rauw);

    // De leesvolgorde vastleggen vóór er gesorteerd wordt. `beschrijf` maakt
    // straks nieuwe objecten, en dan is "waar stond dit" met een indexOf niet
    // meer te achterhalen — en O(n²) als je het tóch probeert.
    rauw.forEach((k, i) => { k.volgorde = i; });

    // Wat er overblijft als het er te veel zijn: eerst wat je ziet, dan wat er
    // vlak buiten staat, dan de rest. Binnen een groep de leesvolgorde.
    const rang = (k) => {
      if (k.plaats === 'viewport') return 0;
      if (k.afstand <= DICHTBIJ) return 1;
      return 2;
    };
    const gesorteerd = rauw.slice().sort((a, b) => (rang(a) - rang(b)) || (a.volgorde - b.volgorde));

    // Pas nu het dure werk, en alleen voor wat het gehaald heeft.
    const gekozen = gesorteerd.slice(0, MAX_KNOPEN).map(beschrijf);
    const weggelaten = gesorteerd.length - gekozen.length;

    // De ref pas nu toekennen, en in leesvolgorde: e1 bovenaan de pagina is
    // voor een mens die het logboek leest oneindig veel prettiger dan e1
    // ergens in het midden omdat dat toevallig het eerste in beeld was.
    const inLeesvolgorde = gekozen.slice().sort((a, b) => a.volgorde - b.volgorde);
    const regels = [];
    let n = 0;
    for (const k of inLeesvolgorde) {
      n += 1;
      const ref = `e${n}`;
      register.set(ref, new WeakRef(k.el));
      kenmerken.set(ref, { rol: k.rol, naam: k.naam, rect: k.rect });

      const stukken = [`- ${k.rol}`];
      if (k.naam) stukken.push(`"${k.naam}"`);
      stukken.push(`[ref=${ref}]`);
      for (const v of k.vlaggen) stukken.push(`[${v}]`);
      if (k.plaats !== 'viewport') stukken.push(`[${k.plaats}]`);
      // Waar het vandaan komt, als marker en niet als inspringing. Inspringen
      // leest als nesting, en dat is het hier niet: een knop in de shadow root
      // van een div staat naast de knop erboven, niet erin. Zo'n lijst laat een
      // model geloven dat iets in iets anders zit en daar wijst het dan naar.
      if (k.context) stukken.push(`[in ${k.context}]`);
      if (k.href) stukken.push(`href=${k.href}`);
      stukken.push(`rect=${k.rect.join(',')}`);
      regels.push(stukken.join(' '));
    }

    const kop = [
      `page: "${kort(document.title)}"`,
      `url: ${location.host}${kortPad(location.pathname) || ''}`,
      `viewport: ${window.innerWidth}x${window.innerHeight}`,
      `scroll: ${Math.round(window.scrollY)}/${Math.round(document.documentElement.scrollHeight)}`,
    ].join('  ');

    if (weggelaten > 0) regels.push(`[+${weggelaten} knopen weggelaten]`);

    kijkMee();

    return {
      snapshotId,
      tekst: [kop, ...regels].join('\n'),
      knopen: gekozen.length,
      weggelaten,
      ms: Math.round((performance.now() - begin) * 10) / 10,
    };
  }

  /** Het element achter een ref, of waarom het er niet is. */
  function pak(ref) {
    const zwak = register.get(ref);
    if (!zwak) return { status: 'onbekend' };
    const el = zwak.deref();
    if (!el) return { status: 'weg' };
    if (!el.isConnected) return { status: 'weg' };
    return { status: 'ok', el };
  }

  function zoek(ref) {
    const p = pak(ref);
    if (p.status !== 'ok') return { status: p.status, verouderd };

    const r = p.el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return { status: 'onzichtbaar', verouderd };

    const midX = r.left + r.width / 2;
    const midY = r.top + r.height / 2;
    let bedekt = false;
    if (midX >= 0 && midX <= window.innerWidth && midY >= 0 && midY <= window.innerHeight) {
      const boven = document.elementFromPoint(midX, midY);
      bedekt = Boolean(boven) && boven !== p.el && !p.el.contains(boven) && !boven.contains(p.el);
    }

    return {
      status: 'ok',
      verouderd,
      rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)],
      plaats: plaatsVan(r, window.innerWidth, window.innerHeight),
      bedekt,
    };
  }

  /**
   * Hetzelfde element terugvinden nadat de pagina zichzelf opnieuw getekend
   * heeft.
   *
   * Op rol en naam, en bij meerdere treffers de dichtstbijzijnde bij waar hij
   * stond. Dat laatste doet het werk op een lijst met twintig knoppen die
   * allemaal "Openen" heten.
   */
  function hermatch(ref) {
    const was = kenmerken.get(ref);
    if (!was) return { status: 'onbekend' };

    const rauw = [];
    verzamel(document, { x: 0, y: 0 }, 0, rauw);
    // Hier wél alles beschrijven: we zoeken op rol en naam, dus zonder die twee
    // valt er niets te vergelijken. Dit is de dure weg, en dat mag: hij loopt
    // alleen als een ref is kwijtgeraakt.
    const passend = rauw.map(beschrijf).filter((k) => k.rol === was.rol && k.naam === was.naam);
    if (!passend.length) return { status: 'weg' };

    const afstandTot = (k) => Math.hypot(k.rect[0] - was.rect[0], k.rect[1] - was.rect[1]);
    passend.sort((a, b) => afstandTot(a) - afstandTot(b));
    const beste = passend[0];

    register.set(ref, new WeakRef(beste.el));
    kenmerken.set(ref, { rol: beste.rol, naam: beste.naam, rect: beste.rect });
    return { status: 'ok', rect: beste.rect, kandidaten: passend.length };
  }

  function scrollNaar(ref) {
    const p = pak(ref);
    if (p.status !== 'ok') return { status: p.status };
    p.el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
    return { status: 'ok' };
  }

  /**
   * Wachten tot de gebruiker zelf op het doel klikt.
   *
   * Dit is de enige manier waarop een gebeurtenis uit de pagina omhoog komt:
   * een Promise die later oplost. Gemeten en het werkt — maar een Promise die
   * nóóit oplost blijft ook na wegnavigeren openstaan. Vandaar de eigen klok,
   * en vandaar dat elke wacht een reden teruggeeft in plaats van te blijven
   * hangen.
   */
  function wachtOpKlik(ref, msMax = 120000) {
    const p = pak(ref);
    if (p.status !== 'ok') return Promise.resolve({ status: p.status });

    return new Promise((klaar) => {
      let klok = null;
      const af = (status) => {
        clearTimeout(klok);
        p.el.removeEventListener('click', geklikt, true);
        klaar({ status });
      };
      const geklikt = () => af('geklikt');
      p.el.addEventListener('click', geklikt, true);
      klok = setTimeout(() => af('te laat'), msMax);
    });
  }

  /* ═══════════════════════════════════════════════════════════════════
     DE OVERLAY — fase 1

     Waarom hij hier staat en niet in een eigen laag boven de pagina: een
     `WebContentsView` is niet klik-doorlatend te krijgen (meting 1), dus een
     schermvullende laag zou élke klik op élke website opslokken. En een laag
     in het chroom zou elke coördinaat met de zoomfactor moeten
     vermenigvuldigen (meting 5). Hierbinnen hoeft geen van beide: de ring
     staat in dezelfde coördinaten als het ding waar hij omheen ligt, en
     `pointer-events: none` maakt hem doorlatend zonder dat er iets voor
     hoeft te wijken.

     Waarom een shadow root met `adoptedStyleSheets` en niet een `<style>`:
     de CSP van de bezochte pagina geldt ook voor ons (meting 2). Een
     `<style>` wordt geweigerd, ook binnen een shadow root; alleen CSSOM komt
     erlangs. De shadow root zelf is er voor het andere gevaar — de opmaak
     van de pagina mag hier niet bij.

     Wat hij niet doet: klikken, typen, navigeren. Hij wijst aan en legt uit.
     Dat is niet een beperking die we later opheffen maar wat de gids ís; de
     assistent in dit product neemt je scherm niet over.
     ═══════════════════════════════════════════════════════════════════ */

  /** Wat er in één zin bij de ring past. Langer hoort in het gesprek. */
  const MAX_UITLEG = 160;

  /** Wat er in het wolkje past als de gids gewoon antwoord geeft. */
  const MAX_ZIN = 420;

  /** Hoeveel een gesprek in het wolkje mag zijn. */
  const MAX_VRAAG = 200;

  /*
   * De woorden van het wolkje.
   *
   * Ze staan hier als terugval en komen verder bij elke aanroep mee uit het
   * hoofdproces, want dáár staat de woordenlijst en dáár is bekend welke taal
   * de gebruiker heeft gekozen. Deze overlay draait in een vreemde pagina en
   * kan niets van die lijst weten; wat er hier staat is wat je krijgt als er
   * niets meegestuurd wordt.
   */
  const WOORDEN = {
    vraagPlek: 'Vraag nog iets…',
    stoppen: 'Stoppen',
    volgende: 'Volgende',
    klaar: 'Klaar',
    vanTotaal: '{stap} van {van}',
  };

  /** De meegestuurde woorden overnemen, voor zover ze er zijn. */
  function zetWoorden(l, woorden) {
    if (!woorden || typeof woorden !== 'object') return;
    for (const sleutel of Object.keys(WOORDEN)) {
      if (typeof woorden[sleutel] === 'string' && woorden[sleutel]) l.woorden[sleutel] = woorden[sleutel];
    }
    l.vraagveld.placeholder = l.woorden.vraagPlek;
    l.stopKnop.textContent = l.woorden.stoppen;
  }

  const OPMAAK = `
    :host { all: initial }
    .laag {
      position: fixed; inset: 0; z-index: 2147483647;
      pointer-events: none;
      font: 400 13px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif;
      color: #fff;
    }
    .ring {
      position: absolute;
      border-radius: 10px;
      box-shadow: 0 0 0 2px #b48cf0, 0 0 0 6px rgba(180,140,240,.28),
                  0 10px 30px -10px rgba(20,10,40,.55);
      transition: top .28s cubic-bezier(.16,1,.3,1), left .28s cubic-bezier(.16,1,.3,1),
                  width .28s cubic-bezier(.16,1,.3,1), height .28s cubic-bezier(.16,1,.3,1);
    }
    /* Het wolkje. Het rijdt met je aanwijzer mee zolang er getypt wordt en
       blijft dan staan waar het staat — anders zou je het veld erin nooit
       kunnen raken, want het schuift weg zodra je ernaartoe beweegt. */
    .wolk {
      position: absolute; max-width: 320px; min-width: 130px;
      padding: 9px 13px 10px; border-radius: 14px;
      background: #221f2a; color: #fff;
      box-shadow: 0 18px 38px -16px rgba(10,6,20,.75), 0 0 0 1px rgba(255,255,255,.08);
      white-space: pre-wrap; overflow-wrap: anywhere;
    }
    /* Het puntje van de ballon. Een gedraaid vierkantje met dezelfde vulling,
       zodat er geen tweede kleur bij hoeft. */
    .staart {
      position: absolute; width: 12px; height: 12px;
      background: #221f2a; border-radius: 2px;
      transform: rotate(45deg);
    }
    /* De draad naar de ring. Hij is er alleen als het wolkje niet meer bij de
       aanwijzer staat en er wél iets aangewezen wordt: dan is dit wat "dit
       gaat daarover" zegt zonder dat je het wolkje hoeft te verslepen. */
    .draad { position: absolute; inset: 0; width: 100%; height: 100% }
    .draad line {
      stroke: #b48cf0; stroke-width: 1.5; stroke-dasharray: 3 4;
      stroke-linecap: round; opacity: .75;
    }
    .cursor { animation: knip 1s steps(1) infinite; opacity: .85 }
    @keyframes knip { 50% { opacity: 0 } }
    .punt { position: absolute; width: 22px; height: 22px;
            filter: drop-shadow(0 3px 8px rgba(10,6,20,.5)) }
    /* De voet van een reeks: welke stap dit is, en hoe je verder komt.
       pointer-events staat hier wél aan — op de knoppen en op het veld, en
       nergens anders. De laag eromheen blijft doorlatend, want een overlay
       die elke klik op elke website opslokt is een overlay die de website
       kapotmaakt. */
    .voet { display: flex; align-items: center; gap: 10px; margin-top: 8px }
    .telling { font-size: 11.5px; opacity: .72; font-variant-numeric: tabular-nums }
    .rek { flex: 1 }
    .knop {
      pointer-events: auto; cursor: pointer;
      font: inherit; font-size: 12px; color: #fff;
      border: 0; border-radius: 8px; padding: 5px 11px;
      background: rgba(255,255,255,.16);
    }
    .knop:hover { background: rgba(255,255,255,.28) }
    .knop.door { background: #b48cf0; color: #1b1526 }
    .knop.door:hover { background: #c4a2f6 }
    /* Doorvragen. Dit is waarom het een gesprek is en geen mededeling. */
    .vraagrij {
      display: flex; align-items: center; gap: 6px;
      margin-top: 9px; padding-top: 9px;
      border-top: 1px solid rgba(255,255,255,.14);
    }
    .vraagveld {
      pointer-events: auto;
      flex: 1; min-width: 0;
      font: inherit; font-size: 12.5px; color: #fff;
      border: 0; outline: 0; background: transparent;
    }
    .vraagveld::placeholder { color: rgba(255,255,255,.5) }
    .vraagknop {
      pointer-events: auto; cursor: pointer;
      display: grid; place-items: center;
      width: 24px; height: 24px; flex: none;
      border: 0; border-radius: 8px;
      background: rgba(255,255,255,.16); color: #fff;
    }
    .vraagknop:hover { background: #b48cf0; color: #1b1526 }
    .vraagknop svg { width: 14px; height: 14px; fill: none;
                     stroke: currentColor; stroke-width: 1.8;
                     stroke-linecap: round; stroke-linejoin: round }
    @media (prefers-reduced-motion: reduce) {
      .ring { transition: none }
      .cursor { animation: none }
    }
  `;

  /** Alles wat de overlay op dit moment is. Null als er niets staat. */
  let laag = null;

  /*
   * Waar de aanwijzer staat.
   *
   * Dit hangt aan het hele document en niet aan de overlay, en dat is met
   * opzet: het wolkje moet bij je aanwijzer kúnnen verschijnen op het moment
   * dat het antwoord er is, en dan is het te laat om nog te gaan kijken waar
   * je muis was. Vandaar dat de meting begint zodra dit bestand er is — en
   * dit bestand komt er pas als iemand de gids iets vraagt.
   *
   * Wat het kost: één passieve luisteraar die twee getallen bijwerkt. Verder
   * niets: geen lus, geen opslag, en met de pagina verdwijnt hij.
   */
  let muis = null;
  window.addEventListener('mousemove', (e) => {
    muis = { x: e.clientX, y: e.clientY };
    if (laag && laag.volgt) plaatsWolk(laag);
  }, { capture: true, passive: true });

  function bouwLaag() {
    if (laag) return laag;

    const gastheer = document.createElement('div');
    // Belangrijk-markeringen omdat de pagina alles mag hebben gestyled wat
    // een `div` heet. Dit zijn de vier die niet mogen verschuiven.
    gastheer.style.setProperty('all', 'initial', 'important');
    gastheer.style.setProperty('position', 'fixed', 'important');
    gastheer.style.setProperty('inset', '0', 'important');
    gastheer.style.setProperty('pointer-events', 'none', 'important');
    gastheer.style.setProperty('z-index', '2147483647', 'important');

    const schaduw = gastheer.attachShadow({ mode: 'closed' });
    const vel = new CSSStyleSheet();
    vel.replaceSync(OPMAAK);
    schaduw.adoptedStyleSheets = [vel];

    const NS = 'http://www.w3.org/2000/svg';
    const wortel = document.createElement('div');
    wortel.className = 'laag';

    const ring = document.createElement('div');
    ring.className = 'ring';

    const draad = document.createElementNS(NS, 'svg');
    draad.setAttribute('class', 'draad');
    const lijn = document.createElementNS(NS, 'line');
    draad.append(lijn);
    draad.style.setProperty('display', 'none');

    const punt = document.createElementNS(NS, 'svg');
    punt.setAttribute('viewBox', '0 0 24 24');
    punt.setAttribute('class', 'punt');
    const pad = document.createElementNS(NS, 'path');
    pad.setAttribute('d', 'M5 2.5l13.2 8.1-5.8 1.2-2.6 5.4z');
    pad.setAttribute('fill', '#fff');
    pad.setAttribute('stroke', 'rgba(0,0,0,.55)');
    pad.setAttribute('stroke-width', '1.1');
    pad.setAttribute('stroke-linejoin', 'round');
    punt.append(pad);

    // Het wolkje, en alles wat erin hangt. De staart staat erbuiten, want hij
    // moet aan de andere kant van de rand kunnen liggen.
    const wolk = document.createElement('div');
    wolk.className = 'wolk';
    const staart = document.createElement('div');
    staart.className = 'staart';
    staart.style.setProperty('display', 'none');

    const zin = document.createElement('span');
    const cursor = document.createElement('span');
    cursor.className = 'cursor';
    cursor.textContent = '▍';
    cursor.style.setProperty('display', 'none');

    const voet = document.createElement('div');
    voet.className = 'voet';
    const telling = document.createElement('span');
    telling.className = 'telling';
    const rek = document.createElement('span');
    rek.className = 'rek';
    const stopKnop = document.createElement('button');
    stopKnop.className = 'knop';
    stopKnop.type = 'button';
    stopKnop.textContent = WOORDEN.stoppen;
    const doorKnop = document.createElement('button');
    doorKnop.className = 'knop door';
    doorKnop.type = 'button';
    doorKnop.textContent = WOORDEN.volgende;
    voet.append(telling, rek, stopKnop, doorKnop);
    voet.style.setProperty('display', 'none');

    const vraagrij = document.createElement('div');
    vraagrij.className = 'vraagrij';
    const vraagveld = document.createElement('input');
    vraagveld.className = 'vraagveld';
    vraagveld.type = 'text';
    vraagveld.spellcheck = false;
    vraagveld.autocomplete = 'off';
    vraagveld.placeholder = WOORDEN.vraagPlek;
    vraagveld.maxLength = MAX_VRAAG;
    const vraagknop = document.createElement('button');
    vraagknop.className = 'vraagknop';
    vraagknop.type = 'button';
    const pijl = document.createElementNS(NS, 'svg');
    pijl.setAttribute('viewBox', '0 0 16 16');
    const pijlpad = document.createElementNS(NS, 'path');
    pijlpad.setAttribute('d', 'M8 13V3M4 7l4-4 4 4');
    pijl.append(pijlpad);
    vraagknop.append(pijl);
    vraagrij.append(vraagveld, vraagknop);
    vraagrij.style.setProperty('display', 'none');

    wolk.append(zin, cursor, voet, vraagrij);
    wortel.append(ring, draad, wolk, staart, punt);
    schaduw.append(wortel);
    // Op `documentElement` en niet op `body`: een pagina mag zijn body
    // vervangen, en dan is de overlay weg zonder dat iemand het merkt.
    document.documentElement.append(gastheer);

    laag = {
      gastheer, ring, wolk, staart, zin, cursor, lijn, draad, punt,
      voet, telling, stopKnop, doorKnop, vraagrij, vraagveld,
      ref: null, aan: null,
      // Waar het wolkje bij hoort: een rechthoek, of null voor "bij de
      // aanwijzer". En of het die aanwijzer volgt; waar die staat weet `muis`
      // hierboven, die al meet voordat er een laag is.
      anker: null,
      volgt: false,
      // Zie WOORDEN hierboven: dit is de terugval tot het hoofdproces iets
      // anders meestuurt.
      woorden: { ...WOORDEN },
      // Wat er getypt wordt, en waar we zijn.
      typt: null,
      // Wat de gebruiker op de voet antwoordde, en wie daarop wacht.
      antwoord: null,
      meld: null,
      // Wat de gebruiker terugvroeg, en wie daarop wacht.
      vraag: null,
      vraagMeld: null,
    };

    const geef = (wat) => {
      laag.antwoord = wat;
      const wie = laag.meld;
      laag.meld = null;
      if (wie) wie(wat);
    };
    doorKnop.addEventListener('click', (e) => { e.stopPropagation(); geef('volgende'); });
    stopKnop.addEventListener('click', (e) => { e.stopPropagation(); geef('gestopt'); });

    const stuur = () => {
      const tekst = vraagveld.value.trim().slice(0, MAX_VRAAG);
      if (!tekst) return;
      vraagveld.value = '';
      laag.vraag = tekst;
      const wie = laag.vraagMeld;
      laag.vraagMeld = null;
      if (wie) wie(tekst);
    };
    vraagknop.addEventListener('click', (e) => { e.stopPropagation(); stuur(); });
    // De toetsen van de pagina gaan deze niet aan: een site die op Enter
    // luistert hoort niet mee te krijgen wat je de gids vraagt.
    vraagveld.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') { e.preventDefault(); stuur(); }
    });

    return laag;
  }

  /**
   * Het wolkje neerzetten.
   *
   * Bij de aanwijzer zolang het meeloopt, en anders waar het al stond. Nooit
   * voorbij de rand, en nooit óver het ding waar het over gaat: past het niet
   * rechtsonder de aanwijzer, dan gaat het naar links of naar boven.
   */
  function plaatsWolk(l) {
    const zet = (el, naam, waarde) => el.style.setProperty(naam, waarde);
    // Waar het wolkje bij hoort: een rechthoek als er iets aangewezen wordt,
    // en anders de aanwijzer. Dat staat op de laag en niet in een argument,
    // want dit wordt ook aangeroepen door een tikker en door een scroll, en
    // die weten van geen anker.
    const vast = l.anker;
    const breedte = l.wolk.offsetWidth || 220;
    const hoogte = l.wolk.offsetHeight || 44;

    let x;
    let y;
    let staartKant = null;
    if (vast) {
      // Vastgezet bij een rechthoek: onder het doel, of erboven als daar geen
      // ruimte meer is. Dat is waar het wolkje begint als de aanwijzer nog
      // niet bewogen heeft.
      const onder = vast.bottom + 14;
      const past = onder + hoogte < window.innerHeight - 8;
      y = past ? onder : Math.max(8, vast.top - 14 - hoogte);
      x = vast.left;
      staartKant = past ? 'boven' : 'onder';
    } else if (muis) {
      const rechts = muis.x + 18;
      const naarLinks = rechts + breedte > window.innerWidth - 8;
      x = naarLinks ? muis.x - 18 - breedte : rechts;
      const onder = muis.y + 16;
      const naarBoven = onder + hoogte > window.innerHeight - 8;
      y = naarBoven ? Math.max(8, muis.y - 16 - hoogte) : onder;
      staartKant = naarBoven ? 'onder' : 'boven';
    } else {
      // Geen aanwijzer die ooit bewoog en niets aangewezen: dan is er geen
      // plek die ergens bij hoort, en staat het wolkje onderaan in beeld.
      // Beter daar dan in de hoek waar `position: absolute` het neerzet.
      x = (window.innerWidth - breedte) / 2;
      y = window.innerHeight - hoogte - 28;
    }

    x = Math.max(8, Math.min(x, window.innerWidth - breedte - 8));
    y = Math.max(8, Math.min(y, window.innerHeight - hoogte - 8));
    zet(l.wolk, 'left', x + 'px');
    zet(l.wolk, 'top', y + 'px');

    // De staart wijst naar waar het wolkje vandaan komt: de aanwijzer, of het
    // doel. Hij hangt half over de rand heen.
    const naar = muis && !vast ? muis : (vast ? { x: vast.left + 18, y: staartKant === 'boven' ? vast.bottom : vast.top } : null);
    if (!naar) {
      zet(l.staart, 'display', 'none');
    } else {
      const sx = Math.max(x + 10, Math.min(naar.x - 6, x + breedte - 22));
      const sy = staartKant === 'boven' ? y - 5 : y + hoogte - 7;
      zet(l.staart, 'display', 'block');
      zet(l.staart, 'left', sx + 'px');
      zet(l.staart, 'top', sy + 'px');
    }

    // En de draad naar de ring, zolang die er is en het wolkje niet meer
    // meeloopt. Tijdens het meelopen staat het wolkje er zelf al bovenop.
    if (l.ref && !l.volgt && l.ringMidden) {
      zet(l.draad, 'display', 'block');
      l.lijn.setAttribute('x1', String(Math.round(x + breedte / 2)));
      l.lijn.setAttribute('y1', String(Math.round(y + hoogte / 2)));
      l.lijn.setAttribute('x2', String(Math.round(l.ringMidden.x)));
      l.lijn.setAttribute('y2', String(Math.round(l.ringMidden.y)));
    } else {
      zet(l.draad, 'display', 'none');
    }
  }

  /**
   * De ring en de punt op hun plek zetten, en het wolkje bijtrekken.
   *
   * Alles in `style.setProperty`, want `setAttribute('style', …)` wordt door
   * de CSP van de pagina geweigerd (meting 2). Allemaal viewport-coördinaten,
   * want de laag staat `fixed` — dus wat `getBoundingClientRect()` zegt is
   * precies waar het hoort.
   */
  function plaats(l, r) {
    const marge = 6;
    const zet = (el, naam, waarde) => el.style.setProperty(naam, waarde);

    zet(l.ring, 'left', (r.left - marge) + 'px');
    zet(l.ring, 'top', (r.top - marge) + 'px');
    zet(l.ring, 'width', (r.width + marge * 2) + 'px');
    zet(l.ring, 'height', (r.height + marge * 2) + 'px');
    l.ringMidden = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    if (l.anker) l.anker = r;

    // De punt in de hoek van het doel, waar een hand hem zou neerzetten.
    zet(l.punt, 'left', (r.left + r.width * 0.5) + 'px');
    zet(l.punt, 'top', (r.top + r.height * 0.62) + 'px');

    // Heeft de aanwijzer nog niet bewogen, dan weten we niet waar hij is en
    // hoort het wolkje gewoon bij het doel te staan.
    plaatsWolk(l);
  }

  /** Alles uit het wolkje halen wat er nog in stond. */
  function leegWolk(l) {
    if (l.typt) { clearInterval(l.typt.klok); l.typt = null; }
    l.zin.textContent = '';
    l.cursor.style.setProperty('display', 'none');
  }

  /**
   * Zeggen wat je te zeggen hebt, letter voor letter.
   *
   * Waarom uitgetypt en niet in één keer: dit is een antwoord op een vraag
   * die je net stelde, en een blok tekst dat ineens verschijnt leest als een
   * mededeling. Uittypen leest als iemand die antwoordt. Wie dat niet wil
   * heeft `prefers-reduced-motion` aanstaan, en dan staat het er meteen.
   *
   * De snelheid schaalt mee met de lengte: een lang antwoord hoort niet
   * langer te duren dan een kort, want dan ga je wachten in plaats van lezen.
   */
  function typ(l, tekst, klaar) {
    leegWolk(l);
    const heel = String(tekst || '').slice(0, MAX_ZIN);
    const rustig = window.matchMedia
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (!heel || rustig) {
      l.zin.textContent = heel;
      if (klaar) klaar();
      return;
    }

    const stap = Math.max(6, Math.min(24, Math.round(1100 / heel.length)));
    l.cursor.style.setProperty('display', 'inline');
    l.typt = { i: 0, klok: null };
    l.typt.klok = setInterval(() => {
      if (!laag || laag !== l || !l.typt) return;
      // Per beeldje een paar letters bij een lang antwoord: één letter per
      // tik zou bij vierhonderd tekens een lus van seconden worden.
      const tegelijk = heel.length > 200 ? 3 : 1;
      l.typt.i = Math.min(heel.length, l.typt.i + tegelijk);
      l.zin.textContent = heel.slice(0, l.typt.i);
      if (l.volgt) plaatsWolk(l);
      if (l.typt.i < heel.length) return;
      clearInterval(l.typt.klok);
      l.typt = null;
      l.cursor.style.setProperty('display', 'none');
      if (klaar) klaar();
    }, stap);
  }

  /**
   * De gids zegt iets, zonder per se iets aan te wijzen.
   *
   * Het wolkje komt bij je aanwijzer staan en typt het antwoord uit; zodra
   * het uitgetypt is blijft het staan waar het staat. Dat laatste is geen
   * detail: een wolkje dat je aanwijzer blíjft volgen kun je nooit raken, en
   * er staat een veld in waar je in moet kunnen klikken.
   */
  function zeg(tekst, opties) {
    const l = bouwLaag();
    zetWoorden(l, opties && opties.woorden);
    const doorvragen = !opties || opties.doorvragen !== false;

    // Een nieuwe zin laat een wachter van de vorige niet achter.
    if (l.meld) { const wie = l.meld; l.meld = null; wie('gestopt'); }
    l.antwoord = null;

    l.wolk.style.setProperty('display', 'block');
    // Wordt er iets aangewezen, dan hoort het wolkje daar te blijven staan:
    // het gaat over dát ding. Alleen als er niets aangewezen wordt komt het
    // naar je aanwijzer toe — dan is de aanwijzer waar je kijkt.
    const bijDoel = l.ref ? pakRect(l.ref) : null;
    l.anker = bijDoel;
    l.volgt = Boolean(muis) && !bijDoel;
    l.vraagrij.style.setProperty('display', doorvragen ? 'flex' : 'none');
    plaatsWolk(l);

    typ(l, tekst, () => {
      // Uitgetypt: staan blijven, zodat het veld te raken is.
      if (!laag || laag !== l) return;
      l.volgt = false;
      plaatsWolk(l);
    });

    zweefAan(l);
    return { status: 'ok', volgt: l.volgt };
  }

  /** De rechthoek van een ref, of null. */
  function pakRect(ref) {
    const p = pak(ref);
    return p.status === 'ok' ? p.el.getBoundingClientRect() : null;
  }

  /**
   * Wijs iets aan.
   *
   * Geeft `rect` terug zodat de kant die het vroeg weet waar het terechtkwam
   * — en `verouderd` zodat duidelijk is of er sinds de snapshot iets aan de
   * pagina veranderd is.
   */
  function wijs(ref, tekst, opties) {
    const p = pak(ref);
    if (p.status !== 'ok') return { status: p.status, verouderd };

    const l = bouwLaag();
    zetWoorden(l, opties && opties.woorden);
    l.ref = ref;

    // Een reeks of niet. `van` is hoeveel stappen er zijn; één stap is geen
    // reeks en krijgt dus geen voet, want dan is er niets om op te drukken.
    const stap = Math.max(1, Math.floor(Number(opties && opties.stap) || 1));
    const van = Math.max(1, Math.floor(Number(opties && opties.van) || 1));
    const reeks = van > 1 && stap <= van;
    const zinnetje = String(tekst || '').slice(0, MAX_UITLEG);

    // Een nieuwe stap laat een wachter van de vorige niet achter.
    if (l.meld) { const wie = l.meld; l.meld = null; wie('gestopt'); }
    l.antwoord = null;

    l.voet.style.setProperty('display', reeks ? 'flex' : 'none');
    if (reeks) {
      l.telling.textContent = l.woorden.vanTotaal
        .replace('{stap}', String(stap)).replace('{van}', String(van));
      l.doorKnop.textContent = stap >= van ? l.woorden.klaar : l.woorden.volgende;
    }
    // Tijdens een reeks vraag je niet door: er loopt een uitleg, en die heeft
    // zijn eigen knoppen. Buiten een reeks mag het wel.
    l.vraagrij.style.setProperty('display', reeks ? 'none' : (opties && opties.doorvragen === false ? 'none' : 'flex'));
    l.wolk.style.setProperty('display', zinnetje || reeks ? 'block' : 'none');

    const rustig = window.matchMedia
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const eerste = !l.aan;
    const r = p.el.getBoundingClientRect();
    // Wijzen zet het wolkje bij het doel en niet bij je aanwijzer: het gaat
    // hier om dát ding, en een wolkje dat ergens anders hangt laat je zoeken.
    l.volgt = false;
    l.anker = r;
    plaats(l, r);
    if (zinnetje) typ(l, zinnetje, () => { if (laag === l) plaatsWolk(l); });
    else leegWolk(l);
    plaatsWolk(l);

    if (eerste && !rustig) {
      // Aankomen. De ring groeit op zijn plek, de punt vliegt van rechtsonder
      // aan — via `el.animate`, want CSS-animaties in een `<style>` komen de
      // CSP van de pagina niet door.
      l.ring.animate(
        [{ opacity: 0, transform: 'scale(1.12)' }, { opacity: 1, transform: 'none' }],
        { duration: 320, easing: 'cubic-bezier(.16,1,.3,1)', fill: 'both' },
      );
      l.punt.animate(
        [{ opacity: 0, transform: 'translate(48px, 60px)' }, { opacity: 1, transform: 'none' }],
        { duration: 520, easing: 'cubic-bezier(.22,1,.3,1)', fill: 'both' },
      );
      l.wolk.animate(
        [{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }],
        { duration: 300, delay: 120, easing: 'cubic-bezier(.16,1,.3,1)', fill: 'both' },
      );
    }

    zweefAan(l);
    return { status: 'ok', verouderd, rect: [r.left, r.top, r.width, r.height].map(Math.round) };
  }

  /**
   * Meebewegen met de pagina.
   *
   * Niet met een frameluspaneel maar met de twee gebeurtenissen die iets
   * kunnen verschuiven — scrollen en van maat veranderen — want een
   * `requestAnimationFrame`-lus die altijd loopt is een lus die ook loopt als
   * er niets gebeurt.
   */
  function zweefAan(l) {
    if (l.aan) return;
    const volg = () => {
      if (!laag) return;
      if (!laag.ref) return plaatsWolk(laag);
      const q = pak(laag.ref);
      if (q.status !== 'ok') return verberg();
      plaats(laag, q.el.getBoundingClientRect());
    };
    window.addEventListener('scroll', volg, { capture: true, passive: true });
    window.addEventListener('resize', volg, { passive: true });
    l.aan = () => {
      window.removeEventListener('scroll', volg, { capture: true });
      window.removeEventListener('resize', volg);
    };
  }

  /**
   * Wachten tot de gebruiker op de voet drukt.
   *
   * Dit is wat een reeks een reeks maakt: de volgende stap komt er pas als
   * iemand erom vraagt. Het is ook de toestemming voor die stap — daarom
   * staat in main.js dat een stap na de eerste alleen mag als hier
   * 'volgende' uit kwam.
   *
   * Eigen klok, net als bij wachtOpKlik: een Promise die nooit oplost blijft
   * ook na wegnavigeren openstaan.
   */
  function wachtOpStap(msMax = 120000) {
    if (!laag || !laag.ref) return Promise.resolve({ status: 'niets gewezen' });
    if (laag.antwoord) return Promise.resolve({ status: laag.antwoord });

    return new Promise((klaar) => {
      let klok = null;
      const af = (status) => {
        clearTimeout(klok);
        if (laag && laag.meld === melden) laag.meld = null;
        klaar({ status });
      };
      const melden = (wat) => af(wat);
      laag.meld = melden;
      klok = setTimeout(() => af('te laat'), msMax);
    });
  }

  /**
   * Wachten tot de gebruiker in het wolkje iets terugvraagt.
   *
   * Dit is wat er van een mededeling een gesprek maakt. Hetzelfde patroon als
   * wachtOpStap: eigen klok, en verbergen laat niemand hangen. De klok staat
   * ruimer, want hier is de gebruiker aan het lezen en aan het nadenken en
   * niet aan het doorklikken.
   */
  function wachtOpVraag(msMax = 300000) {
    if (!laag) return Promise.resolve({ status: 'niets gezegd' });
    if (laag.vraag) {
      const tekst = laag.vraag;
      laag.vraag = null;
      return Promise.resolve({ status: 'gevraagd', tekst });
    }

    return new Promise((klaar) => {
      let klok = null;
      const af = (status, tekst) => {
        clearTimeout(klok);
        if (laag && laag.vraagMeld === melden) laag.vraagMeld = null;
        if (laag && status === 'gevraagd') laag.vraag = null;
        klaar(tekst === undefined ? { status } : { status, tekst });
      };
      const melden = (wat) => (wat === null ? af('gestopt') : af('gevraagd', wat));
      laag.vraagMeld = melden;
      klok = setTimeout(() => af('te laat'), msMax);
    });
  }

  /** Weghalen, en niets achterlaten. */
  function verberg() {
    if (!laag) return { status: 'ok' };
    // Wie op een volgende stap of op een vraag wachtte krijgt nu zijn
    // antwoord. Anders blijft die Promise tot zijn klok afloopt hangen aan
    // een laag die er niet meer is, en dat is precies het lek waar de kop van
    // brug.js over gaat.
    if (laag.meld) { const wie = laag.meld; laag.meld = null; wie('gestopt'); }
    if (laag.vraagMeld) { const wie = laag.vraagMeld; laag.vraagMeld = null; wie(null); }
    if (laag.typt) clearInterval(laag.typt.klok);
    if (laag.aan) laag.aan();
    laag.gastheer.remove();
    laag = null;
    return { status: 'ok' };
  }

  globalThis.__gids = {
    versie: VERSIE,
    maakSnapshot,
    zoek,
    hermatch,
    scrollNaar,
    wachtOpKlik,
    wijs,
    zeg,
    wachtOpStap,
    wachtOpVraag,
    verberg,
    stand: () => ({
      snapshotId,
      verouderd,
      knopen: register.size,
      wijst: Boolean(laag && laag.ref),
      // Waar het veld staat waarin je kunt terugvragen, of null. Net als de
      // knop hierboven: het is een plek die een klik opvangt, dus de
      // buitenkant mag weten waar hij ligt.
      veld: (() => {
        if (!laag || laag.vraagrij.style.display === 'none') return null;
        const r = laag.vraagveld.getBoundingClientRect();
        return r.width ? [r.left, r.top, r.width, r.height].map(Math.round) : null;
      })(),
      // Of er een wolkje staat, en of het nog aan het typen is. De kant die
      // het vroeg kan daarop wachten in plaats van op een getal te gokken.
      zegt: Boolean(laag && laag.wolk.style.display !== 'none'),
      // Wat er nu staat. Tijdens het uittypen is dat nog niet de hele zin,
      // en dat is precies waarom het hier staat: zo kan de kant die het
      // vroeg zien dat hij klaar is in plaats van op een tijd te gokken.
      gezegd: laag ? laag.zin.textContent : '',
      typt: Boolean(laag && laag.typt),
      volgt: Boolean(laag && laag.volgt),
      // Wat er op de voet is geantwoord, of null. Zo kan de kant die het
      // vroeg zien of de gebruiker al verder wilde zonder erop te wachten.
      antwoord: (laag && laag.antwoord) || null,
      // Waar de knop Volgende staat, in venstercoördinaten, of null als er
      // geen reeks loopt. Het is de enige plek in deze hele laag die een klik
      // opvangt, dus het is ook de enige plek waarvan de buitenkant mag weten
      // waar hij ligt — om ernaar te wijzen, en om hem te kunnen testen.
      knop: (() => {
        if (!laag || laag.voet.style.display === 'none') return null;
        const r = laag.doorKnop.getBoundingClientRect();
        return r.width ? [r.left, r.top, r.width, r.height].map(Math.round) : null;
      })(),
    }),
  };

  return 'geladen';
})();
