'use strict';

/**
 * Kijken of er een nieuwere versie is.
 *
 * ── WAT DIT WEL IS, EN VOORAL WAT NIET ──────────────────────────────────
 * Dit haalt niets binnen en vervangt niets. Het kijkt of er een nieuwer
 * uitgebracht pakket bestaat en zegt het; downloaden doe je zelf, met de
 * knop die je ook de eerste keer gebruikte.
 *
 * Dat is geen halfheid maar de enige eerlijke vorm zolang deze browser niet
 * ondertekend is. Een programma dat zichzelf ongecontroleerd vervangt is
 * precies het gedrag waar een handtekening voor bestaat: zonder die
 * handtekening kan niemand — ook wij niet — nakijken dat wat er binnenkwam
 * is wat wij hebben gemaakt. Een updater bouwen vóór het ondertekenen is de
 * verkeerde volgorde. Zie docs/UITBRENGEN.md.
 *
 * ── WAT ER DE DEUR UIT GAAT ─────────────────────────────────────────────
 * Eén GET naar api.github.com, met een useragent waar de naam en de versie
 * van deze browser in staan. GitHub ziet dus je IP-adres en welke versie je
 * draait. Niet welke pagina's je open hebt, niet wie je bent, en er gaat
 * niets langs een server van ons. Het staat in de instellingen en het gaat
 * uit als je dat wilt.
 */

const BRON = 'https://api.github.com/repos/SamsOrg122/assignments/releases?per_page=20';

/** Onze uitgaves heten zo; die van de desktopapp anders. */
const MERK = 'browser-v';

/** Hoe lang we op GitHub wachten voordat we het opgeven. */
const GEDULD_MS = 8000;

/**
 * Twee versies vergelijken. Geeft 1 als `a` nieuwer is, -1 als `b` dat is.
 *
 * Geen semver-bibliotheek: onze versies zijn drie getallen en een eventuele
 * staart als `-beta.2`. Die staart telt als ouder dan dezelfde versie zonder,
 * want zo werkt semver en zo hoort 0.2.0-beta.1 niet nieuwer te lijken dan
 * 0.2.0.
 */
function vergelijk(a, b) {
  const ontleed = (v) => {
    const [kern, staart] = String(v ?? '').trim().replace(/^v/, '').split('-');
    const delen = kern.split('.').map((n) => Number.parseInt(n, 10) || 0);
    return { delen: [delen[0] ?? 0, delen[1] ?? 0, delen[2] ?? 0], staart: staart ?? '' };
  };
  const x = ontleed(a);
  const y = ontleed(b);
  for (let i = 0; i < 3; i += 1) {
    if (x.delen[i] !== y.delen[i]) return x.delen[i] > y.delen[i] ? 1 : -1;
  }
  if (x.staart === y.staart) return 0;
  if (!x.staart) return 1;
  if (!y.staart) return -1;
  return x.staart > y.staart ? 1 : -1;
}

/** De nieuwste uitgave van de browser uit een lijst van GitHub. */
function nieuwsteUit(lijst) {
  if (!Array.isArray(lijst)) return null;
  let beste = null;
  for (const uit of lijst) {
    if (!uit || uit.draft || uit.prerelease) continue;
    const tag = String(uit.tag_name ?? '');
    if (!tag.startsWith(MERK)) continue;
    const versie = tag.slice(MERK.length);
    if (!/^\d+\.\d+\.\d+/.test(versie)) continue;
    if (!beste || vergelijk(versie, beste.versie) > 0) {
      beste = { versie, url: String(uit.html_url ?? '') };
    }
  }
  return beste;
}

/**
 * Eén keer kijken.
 *
 * `haal` is injecteerbaar zodat een reeks geen netwerk nodig heeft — en
 * zodat er in een reeks nooit per ongeluk echt naar GitHub gebeld wordt.
 */
async function kijk({ huidig, haal = globalThis.fetch, bron = BRON } = {}) {
  const afbreker = new AbortController();
  const klok = setTimeout(() => afbreker.abort(), GEDULD_MS);
  try {
    const antwoord = await haal(bron, {
      signal: afbreker.signal,
      headers: {
        accept: 'application/vnd.github+json',
        // GitHub wil een useragent. Hierin staat wat er toch al uit af te
        // leiden was: dat dit deze browser is, en welke versie.
        'user-agent': `Tougather-Browser/${huidig}`,
      },
    });
    if (!antwoord.ok) {
      return { status: 'onbekend', fout: `GitHub gaf ${antwoord.status}` };
    }
    const nieuwste = nieuwsteUit(await antwoord.json());
    if (!nieuwste) return { status: 'onbekend', fout: 'geen uitgave gevonden' };
    return vergelijk(nieuwste.versie, huidig) > 0
      ? { status: 'nieuw', versie: nieuwste.versie, url: nieuwste.url }
      : { status: 'bij', versie: nieuwste.versie };
  } catch (e) {
    // Geen net, een afgebroken aanroep, of iets dat geen JSON was. Geen van
    // drieën is iets waar een browser over hoort te klagen: je was aan het
    // browsen, niet aan het bijwerken.
    return { status: 'onbekend', fout: String(e?.message ?? e).slice(0, 120) };
  } finally {
    clearTimeout(klok);
  }
}

module.exports = { kijk, vergelijk, nieuwsteUit, BRON, MERK, GEDULD_MS };
