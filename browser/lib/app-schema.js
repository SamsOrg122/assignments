// Het tougather://-schema: de app zelf, uit bestanden die met de browser
// meekomen, in plaats van over het net van tougather.com.
//
// Twee soorten verzoeken komen hier binnen.
//
//   /api/…   gaat door naar de server. Daar staan OPENROUTER_API_KEY,
//            STRIPE_SECRET_KEY en SUPABASE_SERVICE_ROLE_KEY, en een sleutel die
//            je meelevert in een download is een sleutel die iedereen heeft.
//            De interface is van jou, de rekening blijft van de server.
//
//   al het   wordt een bestand uit de statische export. De app is bijna geheel
//   andere   clientkant — twaalf van de zestien pagina's zijn "use client" — dus
//            wat hier ligt is genoeg om hem echt te draaien.
//
// Waarom een eigen schema en niet file://: een schema geeft een echte origin.
// Daarmee gedragen IndexedDB, service workers en fetch zich als op het web, en
// dat is precies waar deze app op leunt: zijn hele opslag zit in de browser.

const path = require('node:path');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const { protocol, net } = require('electron');

const SCHEMA = 'tougather';
const HOST = 'app';
// Met www, want tougather.com stuurt daar met een 308 naartoe en dan doet elke
// aanroep van de app twee rondjes in plaats van één.
const API_BASIS = 'https://www.tougather.com';
const STARTPAD = '/library';

const TYPES = new Map(Object.entries({
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.wasm': 'application/wasm',
  '.map': 'application/json; charset=utf-8',
}));

/** Moet vóór app.whenReady(): daarna weigert Electron het. */
function meldSchemaAan() {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: SCHEMA,
      privileges: {
        standard: true,      // een echte origin, met alles wat daaraan hangt
        secure: true,        // telt als beveiligde context: service workers, crypto
        supportFetchAPI: true,
        corsEnabled: true,
        stream: true,
      },
    },
  ]);
}

const bestaat = (p) => {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
};

/**
 * Welk bestand hoort bij welk pad.
 *
 * De export schrijft /library als `library.html` en het omhulsel van een
 * project als `p/_.html`. Dat laatste is er één voor alle projecten: welk
 * project je opent staat in het adres, en de pagina leest dat daar ook uit.
 */
function bestandVoor(wortel, pad) {
  const schoon = decodeURIComponent(pad).replace(/^\/+/, '');

  // Nooit buiten de map. Een verzoek met ../ hoort nergens heen te kunnen.
  const binnen = (kandidaat) => {
    const vol = path.resolve(wortel, kandidaat);
    return vol === wortel || vol.startsWith(wortel + path.sep) ? vol : null;
  };

  const kandidaten = schoon === ''
    ? [STARTPAD.slice(1) + '.html']
    : [schoon, schoon + '.html', path.join(schoon, 'index.html')];

  for (const k of kandidaten) {
    const vol = binnen(k);
    if (vol && bestaat(vol)) return vol;
  }

  // Een project, een gedeeld document of een gesprek: één omhulsel voor alle.
  const omhulsels = [
    [/^p\//, 'p/_'],
    [/^chat\//, 'chat'],
    [/^join\//, 'join/_'],
  ];
  for (const [patroon, doel] of omhulsels) {
    if (!patroon.test(schoon)) continue;
    const rsc = schoon.endsWith('.txt');
    const vol = binnen(doel + (rsc ? '.txt' : '.html'));
    if (vol && bestaat(vol)) return vol;
  }

  const vierhonderdvier = binnen('404.html');
  return vierhonderdvier && bestaat(vierhonderdvier) ? vierhonderdvier : null;
}

/**
 * Zet het schema aan.
 *
 * @param {object} o
 * @param {string} o.wortel   map met de statische export
 * @param {Electron.Session} o.sessie  waar /api-verzoeken doorheen gaan, zodat
 *                                     koekjes en opslag bij elkaar horen
 */
function bedienApp({ wortel, sessie }) {
  const basis = path.resolve(wortel);

  // Per sessie, niet globaal. protocol.handle registreert op de standaardsessie,
  // en de werkbank draait in een eigen partitie; daar kwam dan niets aan en bleef
  // het venster leeg.
  const doelProtocol = sessie ? sessie.protocol : protocol;
  doelProtocol.handle(SCHEMA, async (verzoek) => {
    const url = new URL(verzoek.url);

    // Alleen onze eigen host. tougather://iets-anders/ hoort nergens heen.
    if (url.hostname !== HOST) {
      return new Response('Onbekende host', { status: 404 });
    }

    if (url.pathname.startsWith('/api/')) {
      const doel = API_BASIS + url.pathname + url.search;
      try {
        // De koppen gaan mee zoals de app ze zette, inclusief het bearer-token
        // waarmee de server weet wie er vraagt.
        const antwoord = await (sessie ?? net).fetch(doel, {
          method: verzoek.method,
          headers: verzoek.headers,
          body: verzoek.body,
          duplex: 'half',
          bypassCustomProtocolHandlers: true,
        });
        return antwoord;
      } catch (e) {
        return new Response(`De server is niet bereikbaar: ${e.message}`, {
          status: 502,
          headers: { 'content-type': 'text/plain; charset=utf-8' },
        });
      }
    }

    const bestand = bestandVoor(basis, url.pathname);
    if (!bestand) return new Response('Niet gevonden', { status: 404 });

    try {
      const inhoud = await fsp.readFile(bestand);
      const type = TYPES.get(path.extname(bestand).toLowerCase()) ?? 'application/octet-stream';
      return new Response(inhoud, {
        status: 200,
        headers: {
          'content-type': type,
          // De bestanden komen met de browser mee en veranderen alleen bij een
          // nieuwe versie, dus dit is veilig en scheelt werk bij elke start.
          'cache-control': url.pathname.startsWith('/_next/static/')
            ? 'public, max-age=31536000, immutable'
            : 'no-cache',
        },
      });
    } catch (e) {
      return new Response(`Kon het bestand niet lezen: ${e.message}`, { status: 500 });
    }
  });
}

const appURL = (pad = STARTPAD) => `${SCHEMA}://${HOST}${pad}`;

module.exports = { SCHEMA, HOST, API_BASIS, STARTPAD, meldSchemaAan, bedienApp, appURL, bestandVoor };
