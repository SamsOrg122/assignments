// Een browser zonder zijn app is een browser met een 404 waar Tougather hoort.
// electron-builder merkt dat niet: die pakt in wat er staat. Dus eerst kijken.
const fs = require('node:fs');
const path = require('node:path');

const app = path.join(__dirname, '..', 'app');
const nodig = ['library.html', '_next'];
const mist = nodig.filter((naam) => !fs.existsSync(path.join(app, naam)));

if (mist.length) {
  console.error('De Tougather-app ontbreekt in app/. Draai eerst: npm run bouw-app');
  process.exit(1);
}
console.log('app/ staat er; er kan verpakt worden.');
