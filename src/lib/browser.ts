/**
 * Where the browser comes from, and what is true about it.
 *
 * One module, because the download appears in four places — the hero, the
 * download page, the pricing table and the footer — and four copies of a
 * filename is four chances for one of them to 404 after a release.
 *
 * The facts below are read out of `browser/` rather than written from memory:
 * the version is `browser/package.json`, the artefact names are what
 * `electron-builder` produces from the `build` block in that same file, and
 * the caveats are `browser/CLAUDE.md`'s own "Bekende gaten" section. There is
 * a check script — `scripts/browser-version-agrees.mjs` — that fails the build
 * when the first of those drifts, because a version mismatch here is five dead
 * links and no error anywhere.
 */

/**
 * Must equal `version` in `browser/package.json`.
 *
 * `electron-builder` names every artefact from it, so this is not a label —
 * it is half of every URL below.
 */
export const BROWSER_VERSION = "0.1.0";

/**
 * The engine, said once.
 *
 * ── WHY THESE ARE HERE AND NOT ON THE PAGE ──────────────────────────────
 * The homepage printed "33 Electron · Chromium from late 2024" for a whole
 * release after the browser moved to 44. Nothing caught it: the sentence was
 * hand-typed into a component, it was true when written, and no check reads
 * prose. On the one page in this product whose argument is that its numbers
 * can be verified, that is the worst possible thing to be wrong about.
 *
 * So the major lives here with the download URLs, `browser-version-agrees.mjs`
 * fails the build when it stops matching `browser/package.json`, and the page
 * interpolates it.
 *
 * Must equal the major of `electron` in `browser/package.json`.
 */
export const ELECTRON_MAJOR = 44;

/**
 * The Chromium that Electron major ships, as its own constant because it is
 * the number a reader actually cares about and it cannot be derived from the
 * other one — the Electron-to-Chromium mapping lives in Electron's release
 * notes and nowhere in this repository. Checked by hand at the same moment
 * the upgrade is done; `browser/README.md` carries the same figure.
 */
export const CHROMIUM_MAJOR = 152;

const REPO = "https://github.com/SamsOrg122/assignments";

/** Every build, for anyone who wants a format that is not offered here. */
export const BROWSER_RELEASES_URL = `${REPO}/releases/latest`;

const asset = (name: string) =>
  `${REPO}/releases/download/browser-v${BROWSER_VERSION}/${name}`;

export type PlatformId = "mac-arm" | "mac-intel" | "windows" | "linux-appimage" | "linux-deb";

export interface Build {
  id: PlatformId;
  /** What somebody calls the machine they are sitting at. */
  label: string;
  /** The distinction they have to make, when there is one. */
  note?: string;
  href: string;
  /**
   * What the file actually weighs, for the button.
   *
   * Measured from the published release, not estimated — and
   * `scripts/browser-assets-present.mjs` fails the next release if the real
   * file has drifted more than a tenth away from what this says. A number on
   * a button is a promise about someone's data allowance.
   */
  size: string;
}

/**
 * What to offer, per machine.
 *
 * Direct links to files rather than to a releases page, for the reason the
 * desktop note's list already gives: a page listing seven files with names
 * like `aarch64` and `amd64` is a puzzle to somebody who wanted a browser, and
 * a "Download" that lands you on a list is not a download.
 *
 * The names are electron-builder's defaults for this `build` block: NSIS takes
 * the explicit `artifactName`, and the rest fall out of `productName` and
 * `version`. If a target is ever renamed, it is renamed here too.
 */
export const BUILDS: Build[] = [
  {
    id: "mac-arm",
    label: "macOS",
    note: "Apple silicon",
    href: asset(`Tougather-${BROWSER_VERSION}-arm64.dmg`),
    size: "103 MB",
  },
  {
    id: "mac-intel",
    label: "macOS",
    note: "Intel",
    href: asset(`Tougather-${BROWSER_VERSION}.dmg`),
    size: "107 MB",
  },
  {
    id: "windows",
    label: "Windows",
    note: "installs without admin rights",
    href: asset(`Tougather-Setup-${BROWSER_VERSION}.exe`),
    size: "86 MB",
  },
  {
    id: "linux-appimage",
    label: "Linux",
    note: "AppImage",
    href: asset(`Tougather-${BROWSER_VERSION}.AppImage`),
    size: "113 MB",
  },
  {
    id: "linux-deb",
    label: "Linux",
    note: ".deb",
    href: asset(`tougather_${BROWSER_VERSION}_amd64.deb`),
    size: "79 MB",
  },
];

export const buildById = (id: PlatformId): Build =>
  BUILDS.find((b) => b.id === id) ?? BUILDS[2]!;

/**
 * Which build this visitor probably wants.
 *
 * `navigator.userAgentData` first: it reports the platform without the decade
 * of lies in the UA string, and on Chromium — which is most of the people who
 * will read this page — it is there. The string is the fallback.
 *
 * Apple silicon cannot be detected from the user agent at all. Safari reports
 * "MacIntel" on every Mac ever made, including an M4. So the Mac answer is a
 * guess weighted by what is true of most Macs sold since 2020, and the page
 * shows the other one right beside it rather than hiding it behind a menu.
 */
export function guessPlatform(): PlatformId {
  if (typeof navigator === "undefined") return "windows";

  const data = (
    navigator as Navigator & { userAgentData?: { platform?: string } }
  ).userAgentData;
  const name = (data?.platform || navigator.platform || navigator.userAgent || "").toLowerCase();

  if (name.includes("mac")) return "mac-arm";
  if (name.includes("linux") || name.includes("android")) return "linux-appimage";
  return "windows";
}

/**
 * What has to be said before somebody downloads this, not after.
 *
 * Taken from `browser/CLAUDE.md` § "Bekende gaten" and `browser/README.md`
 * § "Een download maken", which are the two places where the people who built
 * it wrote down what it does not do yet. Putting them on the download page is
 * not modesty — an unsigned installer produces a blue full-screen warning on
 * Windows, and somebody who was not told is somebody who assumes they have
 * caught a virus.
 */
export const BROWSER_CAVEATS: Array<{ title: string; detail: string }> = [
  {
    title: "It is not signed yet",
    detail:
      "Windows shows a blue “Windows protected your PC” screen the first time; More info → Run anyway gets past it. macOS asks you to confirm in System Settings → Privacy & Security. Signing needs a certificate we have not bought yet.",
  },
  {
    title: "It does not update itself",
    detail:
      "There is no updater in this build, so a new version means downloading it again. For a browser on the open web that is the first thing on the list to fix.",
  },
  {
    title: "Nothing here updates itself, including the engine",
    detail:
      `It runs on Electron ${ELECTRON_MAJOR}, which carries Chromium ${CHROMIUM_MAJOR} — current when this build was cut, and a browser on the open web is only as safe as its last engine. With no updater, that gap opens by itself from the day you install it. Downloading a new version is how it closes.`,
  },
  {
    title: "No Netflix, Spotify or other DRM video",
    detail:
      "Widevine is not bundled. Anything that needs it will refuse to play, and that is a licensing question rather than a bug.",
  },
  {
    title: "No password manager, no sync, no extensions",
    detail:
      "Deliberately, for now. Each one is its own project rather than something added on the way past. Bookmarks work; history and find-in-page are not built yet.",
  },
];

/**
 * The four things the browser does that a normal one does not.
 *
 * Each is a claim the code makes good on, with the file that does it named, so
 * that the next person editing this page can check a sentence rather than
 * trust it. That is the same rule `lib/impact/config.ts` applies to numbers.
 */
export const BROWSER_PILLARS = [
  {
    id: "assistant",
    title: "An assistant in its own tab",
    line: "Give it a job with ⌘J. It opens its own tab and gets on with it while you keep working in yours — it never steals your screen.",
    proof: "browser/lib/agent.js",
  },
  {
    id: "subscription",
    title: "It thinks on your subscription",
    line: "The browser starts the agent already on your machine and it reasons on your own plan. Nothing is metered by us, and your text never passes a server of ours.",
    proof: "browser/lib/agent.js",
  },
  {
    id: "workspaces",
    title: "Workspaces that are really separate",
    line: "Each workspace has its own session, so you can be signed in to work in one and to your own account in another, at the same time, without incognito.",
    proof: "browser/main.js",
  },
  {
    id: "permission",
    title: "Permission for every single action",
    line: "The assistant works freely in its own empty workspace. Anything that touches your tabs asks, every time, for a minute at a time — and never on a password or payment field.",
    proof: "browser/lib/toestemming.js",
  },
] as const;
