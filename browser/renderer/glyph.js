// Het gloeiende icoontje van een assistent. Gedeeld door de balk bovenin en de
// zijbalk, zodat een tabblad dezelfde staat toont als de balk. Geen module-
// systeem: beide plekken laden dit met een gewone <script>.
//
// De kleur zegt wát hij doet, de beweging zegt het nog eens. Je moet van een
// halve meter afstand kunnen zien of hij zoekt of leest, zonder te lezen.

// De echte kleuren staan als kanalen in tokens.css (--modus-zoeken enzovoort),
// zodat CSS en dit canvas dezelfde bron delen. Dit is de terugval voor het geval
// die stylesheet er niet is; de waarden hieronder zijn er een kopie van.
const GLYPH_KLEUREN = {
  zoeken: [255, 92, 88], // rood
  lezen: [244, 198, 70], // geel
  analyseren: [58, 206, 150], // groen
  debuggen: [92, 156, 255], // blauw
  actie: [255, 148, 38], // oranje, hij heeft jou nodig
  klaar: [58, 206, 150],
  invoer: [168, 178, 196],
  rust: [138, 146, 162],
};

// Uitgelezen bij het wisselen van staat, niet per beeld: getComputedStyle dwingt
// een herberekening van de opmaak af en dit draait zestig keer per seconde.
function kleurVan(modus) {
  const kanaal = getComputedStyle(document.documentElement)
    .getPropertyValue(`--modus-${modus}`)
    .trim();
  const delen = kanaal.split(/[\s,]+/).map(Number);
  if (delen.length === 3 && delen.every(Number.isFinite)) return delen;
  return GLYPH_KLEUREN[modus] ?? GLYPH_KLEUREN.rust;
}

function maakGlyph(canvas, opties = {}) {
  const { n = 7, zijde = 26 } = opties;
  const ctx = canvas.getContext('2d');
  const midden = (n - 1) / 2;
  const gap = zijde < 20 ? 1 : 1.2;
  const cel = (zijde - 4 - (n - 1) * gap) / n;

  // Vaste ruis per cel: het twinkelen volgt zo elke keer hetzelfde patroon en
  // oogt daardoor rustig in plaats van willekeurig.
  const ruis = [];
  for (let i = 0; i < n * n; i++) ruis.push(((Math.sin(i * 127.1) * 43758.5453) % 1 + 1) % 1);

  let modus = 'rust';
  let kleur = kleurVan(modus);
  let begon = performance.now() / 1000;
  let frames = 0;

  function helderheid(x, y, t) {
    const i = y * n + x;
    const dx = x - midden;
    const dy = y - midden;
    const straal = Math.hypot(dx, dy);

    switch (modus) {
      case 'debuggen': {
        const f = Math.sin(t * 2.1 + ruis[i] * Math.PI * 2);
        return 0.12 + 0.88 * Math.max(0, f) ** 3;
      }
      case 'zoeken': {
        const lijn = ((t * 0.85) % 1) * (n + 2) - 1;
        return Math.max(0.08, 1 - Math.abs(x - lijn) * 0.75);
      }
      case 'lezen': {
        const lijn = ((t * 0.65) % 1) * (n + 2) - 1;
        return Math.max(0.08, 1 - Math.abs(y - lijn) * 0.75);
      }
      case 'analyseren': {
        if (straal < 0.9 || straal > midden + 0.4) return 0.07;
        const hoek = Math.atan2(dy, dx);
        const d = Math.abs(((hoek - t * 2.4 + Math.PI) % (Math.PI * 2)) - Math.PI);
        return Math.max(0.07, 1 - d * 0.85);
      }
      case 'actie': {
        // Trage, brede hartslag: die vraagt aandacht zonder te knipperen.
        const p = (Math.sin(t * 2.6) + 1) / 2;
        return 0.2 + 0.8 * p * Math.max(0.35, 1 - straal * 0.18);
      }
      case 'klaar': {
        const front = (t - begon) * 5.5;
        return straal < front ? 0.95 : 0.12;
      }
      case 'invoer':
        return 0.2 + 0.6 * Math.max(0, Math.sin(t * 3 - straal * 0.9));
      default:
        return 0.1 + 0.12 * Math.max(0, Math.sin(t * 1.1 - straal * 0.6));
    }
  }

  function teken(nu) {
    // Stopt vanzelf zodra het icoontje uit de DOM verdwijnt. De tabbladlijst
    // wordt bij elke statusupdate opnieuw getekend, dus zonder dit zou elke
    // hertekening een tekenlus achterlaten.
    frames += 1;
    if (frames > 3 && !canvas.isConnected) return;

    const t = nu / 1000;
    const [r, g, b] = kleur;
    const dpr = window.devicePixelRatio || 1;

    if (canvas.width !== Math.round(zijde * dpr)) {
      canvas.width = Math.round(zijde * dpr);
      canvas.height = Math.round(zijde * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, zijde, zijde);

    const totaal = n * cel + (n - 1) * gap;
    const start = (zijde - totaal) / 2;
    ctx.shadowColor = `rgb(${r} ${g} ${b})`;

    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const h = Math.min(1, Math.max(0, helderheid(x, y, t)));
        // De gloed groeit mee met de helderheid van de cel; donkere cellen
        // blijven zo schoon en alleen de heldere gloeien echt.
        ctx.shadowBlur = h * (zijde < 20 ? 4 : 6);
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${0.08 + h * 0.92})`;
        ctx.fillRect(start + x * (cel + gap), start + y * (cel + gap), cel, cel);
      }
    }
    requestAnimationFrame(teken);
  }
  requestAnimationFrame(teken);

  return {
    zet(nieuw) {
      if (nieuw === modus) return;
      modus = nieuw in GLYPH_KLEUREN ? nieuw : 'rust';
      kleur = kleurVan(modus);
      begon = performance.now() / 1000;
    },
  };
}
