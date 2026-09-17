const kaart = document.getElementById('kaart');
const tekstEl = document.getElementById('tekst');
const vorigeEl = document.getElementById('vorige');
const huidigEl = document.getElementById('huidig');
const invoer = document.getElementById('invoer');
const stopKnop = document.getElementById('stop');
const gaKnop = document.getElementById('ga');
const glyph = maakGlyph(document.getElementById('glyph'), { n: 7, zijde: 26 });

let modus = 'rust';
let laatsteRegel = '';

function meet() {
  // In rust bestaat de balk niet: maat nul, en het hoofdproces geeft de laag dan
  // ook nul pixels. Een WebContentsView vangt klikken in zijn hele rechthoek,
  // ook waar hij doorzichtig is, dus alles wat hier overhangt is dode ruimte
  // midden bovenaan elke website.
  if (modus === 'rust') {
    eiland.meldGrootte(0, 0);
    return;
  }
  // Het hoofdproces kan de maat van deze balk niet raden, dus meten we hem zelf
  // op en geven we hem door.
  const marge = 12;
  eiland.meldGrootte(Math.ceil(kaart.offsetWidth + marge * 2), Math.ceil(kaart.offsetHeight + marge));
}

function zetModus(nieuw) {
  modus = nieuw;
  glyph.zet(nieuw);
  // Ook als attribuut: de kleur zit in een canvas en daar valt van buiten niets
  // aan af te lezen. Zo is de stand te zien zonder de tekening te ontleden.
  document.body.dataset.modus = nieuw;
  // In rust krimpt de kaart tot precies het plafond; zie de opmerking in
  // island.css over klikken die deze laag opslokt.
  kaart.dataset.vorm = nieuw === 'rust' ? 'rust' : 'pil';
}

function toonRegel(tekst, bezig) {
  if (laatsteRegel && laatsteRegel !== tekst) {
    vorigeEl.textContent = laatsteRegel;
    vorigeEl.classList.add('zichtbaar');
  }
  huidigEl.textContent = tekst;
  huidigEl.classList.toggle('bezig', Boolean(bezig));
  laatsteRegel = tekst;
}

/*
 * Het veld heeft twee vragen.
 *
 * "Geef een opdracht" is werk dat hij zelf gaat doen, in zijn eigen tabblad.
 * "Vraag iets over deze pagina" gaat over de pagina waar jij naar kijkt, en
 * dan wijst hij het antwoord aan in plaats van iets te doen. Het is hetzelfde
 * veld met een andere belofte, dus de placeholder verandert mee en het
 * antwoord gaat naar een ander kanaal.
 */
let invoerModus = 'opdracht';

function naarInvoer(wat = 'opdracht') {
  invoerModus = wat === 'gids' ? 'gids' : 'opdracht';
  zetModus('invoer');
  tekstEl.hidden = true;
  stopKnop.hidden = true;
  gaKnop.hidden = true;
  invoer.hidden = false;
  invoer.value = '';
  invoer.placeholder = invoerModus === 'gids'
    ? 'Vraag iets over deze pagina'
    : 'Geef een opdracht';
  invoer.focus();
  meet();
}

function naarRust() {
  invoer.hidden = true;
  tekstEl.hidden = false;
  stopKnop.hidden = true;
  gaKnop.hidden = true;
  vorigeEl.textContent = '';
  vorigeEl.classList.remove('zichtbaar');
  huidigEl.classList.remove('bezig');
  huidigEl.textContent = 'Ctrl J';
  laatsteRegel = '';
  zetModus('rust');
  meet();
}

eiland.onStand((stand) => {
  if (stand.modus === 'rust') {
    naarRust();
    return;
  }
  invoer.hidden = true;
  tekstEl.hidden = false;
  zetModus(stand.modus);
  toonRegel(stand.regel, stand.bezig);

  // Bij 'actie' heeft hij jou nodig: inloggen, betalen, bevestigen. Dan is
  // doorgaan een knop en geen stap die vanzelf gebeurt.
  // Doorgaan hoort bij een vráág, niet bij een kleur. Oranje betekent "hij
  // heeft jou nodig", en dat is soms een mededeling in plaats van een keuze.
  const wacht = stand.vraag ?? (stand.modus === 'actie');
  gaKnop.hidden = !wacht;
  stopKnop.hidden = !(stand.bezig || wacht);
  stopKnop.textContent = wacht ? 'Niet nu' : 'Stop';
  meet();
});

eiland.onFocus((wat) => naarInvoer(wat));

kaart.addEventListener('mousedown', (e) => {
  if (e.target === stopKnop || e.target === gaKnop || e.target === invoer) return;
  if (invoer.hidden && modus === 'rust') naarInvoer();
});

invoer.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const tekst = invoer.value.trim();
    if (tekst) {
      if (invoerModus === 'gids') eiland.vraagOverPagina(tekst);
      else eiland.geefOpdracht(tekst);
    }
  } else if (e.key === 'Escape') {
    naarRust();
  }
});

stopKnop.onclick = () => eiland.stop();
gaKnop.onclick = () => eiland.ga();

// De beginstand moet expliciet gezet worden: onStand draait pas als het
// hoofdproces iets te melden heeft, en tot die tijd zou de kaart zonder
// data-vorm de volle hoogte houden en over de pagina hangen.
zetModus('rust');

// Lettertypes kunnen later klaar zijn dan het eerste meetmoment.
if (document.fonts?.ready) document.fonts.ready.then(meet);
window.addEventListener('load', meet);
meet();
