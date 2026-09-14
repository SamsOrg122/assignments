/**
 * Bouwt de app-kant van Tougather en zet hem in app/, waar het tougather://-
 * schema hem vandaan serveert. Zie lib/app-schema.js.
 *
 * Alles uit src/app/(app) gaat mee. Wat eruit blijft:
 *
 *   src/app/api          De serverkant. Daar staan OPENROUTER_API_KEY,
 *                        STRIPE_SECRET_KEY en SUPABASE_SERVICE_ROLE_KEY. Een
 *                        sleutel die je meelevert in een download is een
 *                        sleutel die iedereen heeft. De browser stuurt /api
 *                        door naar tougather.com; de interface is lokaal, de
 *                        rekening niet.
 *   src/app/(marketing)  De website. Die wordt de plek waar je deze browser
 *                        downloadt, dus die hoort er juist niet in te zitten.
 *   robots, sitemap,     Dingen voor crawlers en voor het installeren vanuit
 *   manifest             een browser. Deze browser ís de installatie.
 *
 * ── WAAROM DIT GEEN POWERSHELL MEER IS ─────────────────────────────────
 * Dit was `bouw-app.ps1`, en dat werkte alleen op de machine waarop het
 * geschreven is. De release wordt gebouwd op macOS, Windows én Linux, want
 * een dmg maak je alleen op een Mac. Een script met `src\app\api` erin maakt
 * op de twee andere een map die letterlijk zo heet, vindt niets om opzij te
 * zetten, en bouwt vrolijk de hele website de browser in — inclusief de
 * downloadpagina van zichzelf. Eén implementatie voor drie besturings-
 * systemen is de enige vorm die niet stilletjes het verkeerde doet.
 *
 * Die mappen gaan tijdens het bouwen opzij en komen daarna terug, ook als het
 * bouwen misgaat. Breekt het script er middenin af, draai het dan opnieuw:
 * het begint met terugzetten wat er nog opzij staat. `--alleen-herstellen`
 * doet alleen dat.
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const hier = path.dirname(fileURLToPath(import.meta.url));

const arg = (naam, standaard) => {
  const i = process.argv.indexOf(naam);
  return i === -1 ? standaard : process.argv[i + 1];
};

const bron = path.resolve(arg("--bron", path.join(hier, "..", "..")));
const doel = path.resolve(arg("--doel", path.join(hier, "..", "app")));
const alleenHerstellen = process.argv.includes("--alleen-herstellen");

// Naast de bron, niet erin: een map binnen de repo ziet `next build` staan.
const opzij = path.join(path.dirname(bron), ".bouw-opzij");

/** Wat er opzij gaat, met de naam waaronder het bewaard wordt. */
const weg = [
  { naam: "api", pad: path.join("src", "app", "api") },
  { naam: "marketing", pad: path.join("src", "app", "(marketing)") },
  { naam: "robots", pad: path.join("src", "app", "robots.ts") },
  { naam: "sitemap", pad: path.join("src", "app", "sitemap.ts") },
  { naam: "manifest", pad: path.join("src", "app", "manifest.ts") },
];

const bestaat = (p) => fs.existsSync(p);
const weggooien = (p) => fs.rmSync(p, { recursive: true, force: true });

function terugzetten() {
  for (const r of weg) {
    const bewaard = path.join(opzij, r.naam);
    const thuis = path.join(bron, r.pad);
    if (!bestaat(bewaard)) continue;
    weggooien(thuis);
    fs.renameSync(bewaard, thuis);
    console.log(`terug: ${r.pad}`);
  }
  const orig = path.join(bron, "next.config.ts.origineel");
  if (bestaat(orig)) {
    fs.renameSync(orig, path.join(bron, "next.config.ts"));
    console.log("terug: next.config.ts");
  }
}

const isApp =
  bestaat(path.join(bron, "src", "app")) &&
  bestaat(path.join(bron, "next.config.ts"));
if (!isApp) {
  console.error(`Geen Tougather-app gevonden in ${bron}.`);
  console.error(
    "Staat deze map als browser/ in de repo? Zo niet: --bron <pad naar de app>",
  );
  process.exit(1);
}

// Altijd eerst opruimen wat een vorige run heeft laten liggen.
if (bestaat(opzij)) terugzetten();
if (alleenHerstellen) process.exit(0);

if (!bestaat(path.join(bron, "node_modules"))) {
  console.error(`node_modules ontbreekt. Draai eerst 'npm install' in ${bron}`);
  process.exit(1);
}

/** Alleen voor de build die in Tougather Browser meegaat. */
const exportConfig = `import type { NextConfig } from "next";

/** Alleen voor de build die in Tougather Browser meegaat; zie browser/scripts/bouw-app.mjs. */
const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  typescript: { ignoreBuildErrors: true },
};

export default nextConfig;
`;

fs.mkdirSync(opzij, { recursive: true });
try {
  for (const r of weg) {
    const thuis = path.join(bron, r.pad);
    if (bestaat(thuis)) fs.renameSync(thuis, path.join(opzij, r.naam));
  }

  fs.copyFileSync(
    path.join(bron, "next.config.ts"),
    path.join(bron, "next.config.ts.origineel"),
  );
  fs.writeFileSync(path.join(bron, "next.config.ts"), exportConfig, "utf8");

  // `npx` heet op Windows npx.cmd, en spawnSync zoekt zonder shell niet naar
  // de .cmd. Vandaar shell: true — het commando heeft geen invoer van buiten.
  const gebouwd = spawnSync("npx", ["next", "build"], {
    cwd: bron,
    stdio: "inherit",
    shell: true,
  });
  if (gebouwd.status !== 0) throw new Error(`next build gaf ${gebouwd.status}`);

  const uit = path.join(bron, "out");
  if (!bestaat(uit)) throw new Error("de build schreef geen out/");

  weggooien(doel);
  fs.cpSync(uit, doel, { recursive: true });

  let n = 0;
  let bytes = 0;
  for (const f of fs.readdirSync(doel, { recursive: true, withFileTypes: true })) {
    if (!f.isFile()) continue;
    n += 1;
    bytes += fs.statSync(path.join(f.parentPath ?? f.path, f.name)).size;
  }
  console.log(`klaar: ${n} bestanden, ${(bytes / 1048576).toFixed(1)} MB in ${doel}`);
} finally {
  terugzetten();
  if (bestaat(opzij) && fs.readdirSync(opzij).length === 0) weggooien(opzij);
}
