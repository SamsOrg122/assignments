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

  globalThis.__gids = {
    versie: VERSIE,
    maakSnapshot,
    zoek,
    hermatch,
    scrollNaar,
    wachtOpKlik,
    stand: () => ({ snapshotId, verouderd, knopen: register.size }),
  };

  return 'geladen';
})();
