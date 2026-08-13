/**
 * The storefront's search pages, in one table.
 *
 * Twenty pages — eight comparisons, eight guides, four hubs — written in two
 * languages. Every one of them needs the same six things said about it in four
 * different places: the `<title>`, the meta description, the hreflang pair, the
 * sitemap entry, the breadcrumb, and the card another page renders when it
 * links here. Left to the pages, those six drift apart within a month: a title
 * gets rewritten and the sitemap keeps the old URL, or a Dutch page points at
 * an English counterpart that points back at a third page.
 *
 * So the pages own their prose and nothing else. Everything a *machine* reads
 * about a page is declared once here, and `pageMetadata`, `sitemap.ts`,
 * `robots.ts`, `Breadcrumbs` and `RelatedPages` all read from this table.
 *
 * Two rules this file enforces rather than documents:
 *
 * 1. `Slug` is a union of the twenty literal paths. A typo in a link, a hub or
 *    a counterpart is a type error, not a 404 discovered in production.
 * 2. Counterparts must be reciprocal. Google discards a one-way hreflang pair
 *    silently — no warning, no report — so a broken pair would look exactly
 *    like a working one. There is a check at the bottom of this file that
 *    throws in development rather than letting that ship.
 *
 * Facts belong in `src/lib/impact/config.ts` and in the page copy. Nothing in
 * here is a claim about the product except the prices, which are read from that
 * config rather than retyped.
 */

import type { Metadata } from "next";
import { CURRENCY, PLANS } from "@/lib/impact/config";

/* ── Where the site lives ───────────────────────────────── */

/**
 * Kept identical to the `metadataBase` in `src/app/layout.tsx`. Next resolves
 * relative metadata fields against that base on its own, but JSON-LD and the
 * sitemap need real absolute strings, and those two must not be able to
 * disagree with the canonical tag.
 */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://tougather.com"
).replace(/\/+$/, "");

/** `/compare/notion` → `https://tougather.com/compare/notion`. */
export function absoluteUrl(path: string): string {
  return path === "/" ? `${SITE_URL}/` : `${SITE_URL}${path}`;
}

/* ── The table ──────────────────────────────────────────── */

export type Lang = "en" | "nl";

export interface PageEntry {
  /** The path, with a leading slash and no trailing one. Also the canonical. */
  readonly slug: Slug;
  readonly lang: Lang;
  /**
   * The whole `<title>`, brand included or deliberately left out.
   *
   * `pageMetadata` passes these through `title.absolute`, so the root layout's
   * `"%s · Tougather"` template does not apply. Two reasons: half of these
   * titles already say Tougather where the strategist wanted it, and appending
   * it again would both stutter and push a 56-character title to 68, past what
   * a result actually shows.
   */
  readonly title: string;
  readonly description: string;
  /** What `PageShell`'s `title` prop gets. The one `<h1>` on the page. */
  readonly h1: string;
  /** Short label for breadcrumbs, the footer, and related cards. */
  readonly nav: string;
  /** One plain line, rendered by hub pages and related blocks. */
  readonly summary: string;
  /** The hub this page sits under. `null` on the hubs themselves. */
  readonly hub: Slug | null;
  /** The same page in the other language. Always set, always reciprocal. */
  readonly counterpart: Slug;
  /**
   * What `RelatedPages` renders, from the strategist's internal link map.
   *
   * Same language throughout, on purpose: language switching is hreflang and a
   * UI switcher, not a body link. An EN→NL link in the content sends a
   * relevance signal we do not want.
   */
  readonly related: readonly Slug[];
}

const TABLE = {
  /* ── English comparisons ── */

  "/compare/microsoft-365": {
    slug: "/compare/microsoft-365",
    lang: "en",
    title: "Microsoft 365 alternative? Here's how Tougather compares",
    description:
      "Compare Tougather with Microsoft 365 feature by feature — docs, sheets, slides, board and chat — and see what you actually pay per year.",
    h1: "Tougather vs Microsoft 365: what you get, what you give up",
    nav: "Microsoft 365",
    summary:
      "What Tougather covers of the Office suite, what it does not cover at all, and what each costs a year.",
    hub: "/compare",
    counterpart: "/nl/vergelijk/microsoft-365",
    related: [
      "/compare/google-workspace",
      "/compare/excel",
      "/guides/work-offline",
      "/guides/spreadsheet-formulas",
    ],
  },
  "/compare/google-workspace": {
    slug: "/compare/google-workspace",
    lang: "en",
    title: "Google Workspace alternative: how Tougather compares",
    description:
      "See where Tougather matches Google Workspace and where it doesn't, across docs, sheets, slides, whiteboard and chat.",
    h1: "Tougather vs Google Workspace: an honest feature comparison",
    nav: "Google Workspace",
    summary:
      "Where Tougather matches Google Workspace, where it does not, and what happens to Gmail if you switch.",
    hub: "/compare",
    counterpart: "/nl/vergelijk/google-workspace",
    related: [
      "/compare/microsoft-365",
      "/compare/notion",
      "/guides/work-offline",
    ],
  },
  "/compare/notion": {
    slug: "/compare/notion",
    lang: "en",
    title: "Notion alternative with real spreadsheets and slides",
    description:
      "Notion handles notes and databases. See what changes when your docs, spreadsheets, slides and board live in one tool.",
    h1: "Tougather vs Notion: where each one actually wins",
    nav: "Notion",
    summary:
      "Notion's databases against Tougather's spreadsheet, slides and board, with the trade going both ways.",
    hub: "/compare",
    counterpart: "/nl/vergelijk/notion",
    related: [
      "/compare/google-workspace",
      "/compare/excel",
      "/guides/work-offline",
      "/guides/pitch-deck",
    ],
  },
  "/compare/excel": {
    slug: "/compare/excel",
    lang: "en",
    title: "Excel alternative: what you gain and what you lose",
    description:
      "Compare Tougather's spreadsheet with Excel on formulas, file compatibility and offline use, so you know before you switch.",
    h1: "Tougather vs Excel: a spreadsheet comparison for real work",
    nav: "Excel",
    summary:
      "Formulas, .xlsx files and how many rows hold up — including the sizes where Excel is still the right tool.",
    hub: "/compare",
    counterpart: "/nl/vergelijk/excel",
    related: [
      "/compare/microsoft-365",
      "/compare/google-workspace",
      "/guides/spreadsheet-formulas",
    ],
  },

  /* ── English guides ── */

  "/guides/write-a-thesis": {
    slug: "/guides/write-a-thesis",
    lang: "en",
    title: "Write your thesis step by step, without losing the plot",
    description:
      "Follow a nine-step thesis plan from topic to final draft, with a chapter outline and a week-by-week schedule you can copy.",
    h1: "How to write a thesis, step by step",
    nav: "Write a thesis",
    summary:
      "Nine steps from topic to final draft, with a chapter outline and a week-by-week schedule.",
    hub: "/guides",
    counterpart: "/nl/gidsen/scriptie-schrijven",
    related: [
      "/guides/spreadsheet-formulas",
      "/guides/work-offline",
      "/compare/microsoft-365",
    ],
  },
  "/guides/pitch-deck": {
    slug: "/guides/pitch-deck",
    lang: "en",
    title: "Build a pitch deck investors will actually read",
    description:
      "Work through a 12-slide pitch deck outline with what belongs on each slide, plus the numbers investors ask about first.",
    h1: "How to build a pitch deck, slide by slide",
    nav: "Pitch deck",
    summary:
      "Twelve slides, what belongs on each one, and the numbers investors ask about before anything else.",
    hub: "/guides",
    counterpart: "/nl/gidsen/pitch-deck",
    related: [
      "/guides/spreadsheet-formulas",
      "/compare/google-workspace",
      "/compare/notion",
    ],
  },
  "/guides/spreadsheet-formulas": {
    slug: "/guides/spreadsheet-formulas",
    lang: "en",
    title: "The 20 spreadsheet formulas you will actually use",
    description:
      "Copy 20 working formulas — SUM, IF, VLOOKUP, XLOOKUP, SUMIF and more — each with a plain example you can paste into a sheet.",
    h1: "Spreadsheet formulas that cover most everyday work",
    nav: "Spreadsheet formulas",
    summary:
      "Twenty formulas with a worked example each: SUM, IF, VLOOKUP, XLOOKUP, SUMIF and the rest.",
    hub: "/guides",
    counterpart: "/nl/gidsen/formules",
    related: [
      "/compare/excel",
      "/guides/write-a-thesis",
      "/guides/pitch-deck",
    ],
  },
  "/guides/work-offline": {
    slug: "/guides/work-offline",
    lang: "en",
    title: "How to keep working when the internet drops out",
    description:
      "Set up offline access in Google Docs, Microsoft 365, Notion and Tougather, and learn what syncs back once you reconnect.",
    h1: "Working offline: what still works when the wifi doesn't",
    nav: "Work offline",
    summary:
      "Setting up offline access in Google Docs, Microsoft 365, Notion and Tougather, and what syncs on reconnect.",
    hub: "/guides",
    counterpart: "/nl/gidsen/offline",
    related: [
      "/compare/google-workspace",
      "/compare/notion",
      "/guides/write-a-thesis",
    ],
  },

  /* ── Dutch comparisons ── */

  "/nl/vergelijk/microsoft-365": {
    slug: "/nl/vergelijk/microsoft-365",
    lang: "nl",
    title: "Microsoft 365 alternatief: zo verhoudt Tougather zich",
    description:
      "Vergelijk Tougather met Microsoft 365 op functies en prijs, en zie per onderdeel wat je mist en wat je bespaart per jaar.",
    h1: "Tougather vs. Microsoft 365: wat je krijgt en wat je inlevert",
    nav: "Microsoft 365",
    summary:
      "Wat Tougather van het Office-pakket dekt, wat helemaal niet, en wat beide per jaar kosten.",
    hub: "/nl/vergelijk",
    counterpart: "/compare/microsoft-365",
    related: [
      "/nl/vergelijk/google-workspace",
      "/nl/vergelijk/excel",
      "/nl/gidsen/offline",
      "/nl/gidsen/formules",
    ],
  },
  "/nl/vergelijk/google-workspace": {
    slug: "/nl/vergelijk/google-workspace",
    lang: "nl",
    title: "Google Workspace alternatief: zo verschilt Tougather",
    description:
      "Bekijk per functie waar Tougather Google Workspace evenaart en waar niet: documenten, spreadsheets, slides, bord en chat.",
    h1: "Tougather vs. Google Workspace: een eerlijke vergelijking",
    nav: "Google Workspace",
    summary:
      "Waar Tougather Google Workspace evenaart, waar niet, en wat er met Gmail gebeurt als je overstapt.",
    hub: "/nl/vergelijk",
    counterpart: "/compare/google-workspace",
    related: [
      "/nl/vergelijk/microsoft-365",
      "/nl/vergelijk/notion",
      "/nl/gidsen/offline",
    ],
  },
  "/nl/vergelijk/notion": {
    slug: "/nl/vergelijk/notion",
    lang: "nl",
    title: "Notion alternatief met echte spreadsheets en slides",
    description:
      "Notion is sterk in notities en databases. Zie wat er verandert als documenten, spreadsheets, slides en bord in één tool zitten.",
    h1: "Tougather vs. Notion: waar elk van beide wint",
    nav: "Notion",
    summary:
      "De databases van Notion tegenover de spreadsheet, slides en het bord van Tougather.",
    hub: "/nl/vergelijk",
    counterpart: "/compare/notion",
    related: [
      "/nl/vergelijk/google-workspace",
      "/nl/vergelijk/excel",
      "/nl/gidsen/offline",
      "/nl/gidsen/pitch-deck",
    ],
  },
  "/nl/vergelijk/excel": {
    slug: "/nl/vergelijk/excel",
    lang: "nl",
    title: "Excel alternatief: wat je wint en wat je inlevert",
    description:
      "Vergelijk de spreadsheet van Tougather met Excel op formules, xlsx-bestanden en offline werken, zodat je weet waar je aan begint.",
    h1: "Tougather vs. Excel: spreadsheets vergeleken voor echt werk",
    nav: "Excel",
    summary:
      "Formules, xlsx-bestanden en hoeveel rijen het houdt, inclusief de formaten waarbij Excel beter blijft.",
    hub: "/nl/vergelijk",
    counterpart: "/compare/excel",
    related: [
      "/nl/vergelijk/microsoft-365",
      "/nl/vergelijk/google-workspace",
      "/nl/gidsen/formules",
    ],
  },

  /* ── Dutch guides ── */

  "/nl/gidsen/scriptie-schrijven": {
    slug: "/nl/gidsen/scriptie-schrijven",
    lang: "nl",
    title: "Scriptie schrijven: het stappenplan van start tot inleveren",
    description:
      "Volg een stappenplan van onderwerp tot eindversie, met een hoofdstukindeling en een weekplanning die je meteen kunt overnemen.",
    h1: "Scriptie schrijven: stappenplan van onderwerp tot eindversie",
    nav: "Scriptie schrijven",
    summary:
      "Een stappenplan van onderwerp tot eindversie, met hoofdstukindeling en weekplanning.",
    hub: "/nl/gidsen",
    counterpart: "/guides/write-a-thesis",
    related: [
      "/nl/gidsen/formules",
      "/nl/gidsen/offline",
      "/nl/vergelijk/microsoft-365",
    ],
  },
  "/nl/gidsen/pitch-deck": {
    slug: "/nl/gidsen/pitch-deck",
    lang: "nl",
    title: "Pitch deck maken: 12 slides die investeerders lezen",
    description:
      "Loop een pitch deck van 12 slides door, met per slide wat erin hoort en welke cijfers Nederlandse investeerders als eerste vragen.",
    h1: "Pitch deck maken: slide voor slide",
    nav: "Pitch deck",
    summary:
      "Twaalf slides, wat er per slide in hoort, en welke cijfers Nederlandse investeerders het eerst vragen.",
    hub: "/nl/gidsen",
    counterpart: "/guides/pitch-deck",
    related: [
      "/nl/gidsen/formules",
      "/nl/vergelijk/google-workspace",
      "/nl/vergelijk/notion",
    ],
  },
  "/nl/gidsen/formules": {
    slug: "/nl/gidsen/formules",
    lang: "nl",
    title: "De 20 formules die je in een spreadsheet echt nodig hebt",
    description:
      "Kopieer 20 formules met uitleg en voorbeeld: SOM, ALS, VERT.ZOEKEN, X.ZOEKEN en SOM.ALS, inclusief de Engelse naam erbij.",
    h1: "Spreadsheetformules die je dagelijks gebruikt",
    nav: "Formules",
    summary:
      "Twintig formules met uitleg en voorbeeld, met de Engelse naam er steeds naast.",
    hub: "/nl/gidsen",
    counterpart: "/guides/spreadsheet-formulas",
    related: [
      "/nl/vergelijk/excel",
      "/nl/gidsen/scriptie-schrijven",
      "/nl/gidsen/pitch-deck",
    ],
  },
  "/nl/gidsen/offline": {
    slug: "/nl/gidsen/offline",
    lang: "nl",
    title: "Offline werken: doorwerken als het internet uitvalt",
    description:
      "Zet offline toegang aan in Google Docs, Microsoft 365, Notion en Tougather, en lees wat er synchroniseert zodra je weer online bent.",
    h1: "Offline werken: wat blijft werken zonder internet",
    nav: "Offline werken",
    summary:
      "Offline toegang aanzetten in Google Docs, Microsoft 365, Notion en Tougather, en wat er daarna synchroniseert.",
    hub: "/nl/gidsen",
    counterpart: "/guides/work-offline",
    related: [
      "/nl/vergelijk/google-workspace",
      "/nl/vergelijk/notion",
      "/nl/gidsen/scriptie-schrijven",
    ],
  },

  /* ── Hubs ──
   *
   * These do not rank and are not meant to. They exist to give a crawler a
   * two-click path to every child and to give a reader somewhere to land from
   * the footer. `related` is the children, in the order the hub should list
   * them, plus the sibling hub. */

  "/compare": {
    slug: "/compare",
    lang: "en",
    title: "Compare Tougather with the tools you already use",
    description:
      "Pick a tool and see the side-by-side: Microsoft 365, Google Workspace, Notion and Excel, each compared on features and price.",
    h1: "Tougather compared with the tools you already use",
    nav: "Compare",
    summary:
      "Four side-by-side comparisons: Microsoft 365, Google Workspace, Notion and Excel.",
    hub: null,
    counterpart: "/nl/vergelijk",
    related: [
      "/compare/microsoft-365",
      "/compare/google-workspace",
      "/compare/notion",
      "/compare/excel",
      "/guides",
    ],
  },
  "/guides": {
    slug: "/guides",
    lang: "en",
    title: "Guides for writing, presenting and working with data",
    description:
      "Start with a thesis plan, a pitch deck outline, 20 spreadsheet formulas or an offline setup — each guide is a step-by-step walkthrough.",
    h1: "Guides for writing, presenting and working with data",
    nav: "Guides",
    summary:
      "Step-by-step guides for writing, presenting and working with data.",
    hub: null,
    counterpart: "/nl/gidsen",
    related: [
      "/guides/write-a-thesis",
      "/guides/pitch-deck",
      "/guides/spreadsheet-formulas",
      "/guides/work-offline",
      "/compare",
    ],
  },
  "/nl/vergelijk": {
    slug: "/nl/vergelijk",
    lang: "nl",
    title: "Vergelijk Tougather met de tools die je nu gebruikt",
    description:
      "Kies een tool en bekijk de vergelijking: Microsoft 365, Google Workspace, Notion en Excel, steeds op functies en prijs.",
    h1: "Tougather vergeleken met de tools die je nu gebruikt",
    nav: "Vergelijken",
    summary:
      "Vier vergelijkingen naast elkaar: Microsoft 365, Google Workspace, Notion en Excel.",
    hub: null,
    counterpart: "/compare",
    related: [
      "/nl/vergelijk/microsoft-365",
      "/nl/vergelijk/google-workspace",
      "/nl/vergelijk/notion",
      "/nl/vergelijk/excel",
      "/nl/gidsen",
    ],
  },
  "/nl/gidsen": {
    slug: "/nl/gidsen",
    lang: "nl",
    title: "Gidsen over schrijven, presenteren en werken met data",
    description:
      "Begin met een scriptieplanning, een pitch deck van 12 slides, 20 formules of offline werken — elke gids is een stappenplan.",
    h1: "Gidsen over schrijven, presenteren en werken met data",
    nav: "Gidsen",
    summary:
      "Gidsen stap voor stap over schrijven, presenteren en werken met data.",
    hub: null,
    counterpart: "/guides",
    related: [
      "/nl/gidsen/scriptie-schrijven",
      "/nl/gidsen/pitch-deck",
      "/nl/gidsen/formules",
      "/nl/gidsen/offline",
      "/nl/vergelijk",
    ],
  },
} as const;

/**
 * Every path this file knows about. A page author importing anything from here
 * gets a compile error for a slug that is not in the table, which is the whole
 * reason the table is typed this tightly.
 */
export type Slug = keyof typeof TABLE;

/**
 * The registry.
 *
 * Typed as a total record so TypeScript checks two things at once: that every
 * `Slug` has an entry, and that every `hub`, `counterpart` and `related` value
 * is itself a real slug.
 */
export const PAGES: Readonly<Record<Slug, PageEntry>> = TABLE;

/** Registry order — the order the sitemap and the footer use. */
export const SLUGS = Object.keys(TABLE) as Slug[];

/** The four hubs, in the order the footer lists them. */
export const HUBS: Slug[] = SLUGS.filter((slug) => PAGES[slug].hub === null);

/* ── Reading the table ──────────────────────────────────── */

export function page(slug: Slug): PageEntry {
  return PAGES[slug];
}

/** The children of a hub, in registry order. Empty for a non-hub slug. */
export function childrenOf(hub: Slug): PageEntry[] {
  return SLUGS.map((s) => PAGES[s]).filter((p) => p.hub === hub);
}

/** What `RelatedPages` renders — the strategist's link map, resolved. */
export function relatedTo(slug: Slug): PageEntry[] {
  return PAGES[slug].related.map((s) => PAGES[s]);
}

/**
 * The two halves of an hreflang pair, whichever half you start from.
 *
 * Both `pageMetadata` and the sitemap need this, and they must agree — a
 * canonical that says one thing and a sitemap alternate that says another is
 * how a language pair gets thrown away.
 */
export function counterparts(slug: Slug): { en: PageEntry; nl: PageEntry } {
  const self = PAGES[slug];
  const other = PAGES[self.counterpart];
  return self.lang === "en" ? { en: self, nl: other } : { en: other, nl: self };
}

/**
 * `<html lang>`, before first paint.
 *
 * The interface is English everywhere, so the root layout can say `lang="en"`
 * and mean it. The storefront is the exception: ten of these pages are written
 * in Dutch, and a Dutch page announced in an English voice is unusable in a
 * way that looks perfectly fine on screen. A screen reader reads this
 * attribute, not the words.
 *
 * A script rather than markup because only the root layout renders `<html>`,
 * and it has no idea which page is inside it. The paths come from the registry
 * rather than from a `/nl` prefix test, so a Dutch page parked somewhere else
 * would still be announced correctly — and an English page under `/nl` would
 * not be mislabelled.
 */
export const PAGE_LANGUAGE_SCRIPT = `try{
  var dutch=${JSON.stringify(
    Object.values(PAGES)
      .filter((page) => page.lang === "nl")
      .map((page) => page.slug),
  )};
  var path=location.pathname.replace(/\\/+$/,"")||"/";
  document.documentElement.lang=dutch.indexOf(path)>=0?"nl":"en";
}catch(e){}`;

/** BCP-47 for `inLanguage` and `og:locale`. British English: this repo spells
 *  "organise" and "colour", and an en-US tag would contradict the copy. */
const BCP47: Record<Lang, string> = { en: "en-GB", nl: "nl-NL" };
const OG_LOCALE: Record<Lang, string> = { en: "en_GB", nl: "nl_NL" };

/* ── Breadcrumbs ────────────────────────────────────────── */

export interface Crumb {
  name: string;
  href: string;
}

/**
 * Home → hub → page. The Dutch pages start at `/` as well, because `/` is the
 * only homepage there is: the fixed page set has no `/nl` root, and inventing
 * a crumb that 404s to make the trail look tidier would be worse than the
 * language change at the second step.
 */
export function breadcrumbTrail(slug: Slug): Crumb[] {
  const entry = PAGES[slug];
  const crumbs: Crumb[] = [{ name: "Tougather", href: "/" }];
  if (entry.hub) {
    const hub = PAGES[entry.hub];
    crumbs.push({ name: hub.nav, href: hub.slug });
  }
  crumbs.push({ name: entry.nav, href: entry.slug });
  return crumbs;
}

/* ── Metadata ───────────────────────────────────────────── */

/**
 * Everything Next puts in `<head>` for one of these pages.
 *
 * Paths are left relative on purpose: `metadataBase` in the root layout turns
 * them into absolute URLs, so the origin is configured in exactly one place
 * and a staging deployment does not emit canonicals pointing at production.
 *
 * `x-default` points at the English URL. It is the fallback a searcher gets
 * when neither `en` nor `nl` matches them, and English is the wider net. The
 * docs for this version never mention `x-default`; it is in the type file
 * (`alternative-urls-types.d.ts`, `type UnmatchedLang = 'x-default'`) and it
 * emits the link tag, which is what matters.
 *
 * No `images` here. There is no 1200×630 card in this repo — `public/logo.png`
 * is a 512-square mark, which crops badly into every social preview.
 * FOUNDER: adding `src/app/(marketing)/opengraph-image.tsx` (see `next/og`)
 * gives all twenty pages a card at once, and this function needs no change.
 */
export function pageMetadata(slug: Slug): Metadata {
  const entry = PAGES[slug];
  const { en, nl } = counterparts(slug);

  const shared = {
    title: entry.title,
    description: entry.description,
    url: entry.slug,
    siteName: "Tougather",
    locale: OG_LOCALE[entry.lang],
  };

  return {
    // `absolute` skips the root layout's "%s · Tougather" template. See the
    // note on `PageEntry.title` for why.
    title: { absolute: entry.title },
    description: entry.description,
    alternates: {
      canonical: entry.slug,
      languages: {
        en: en.slug,
        nl: nl.slug,
        "x-default": en.slug,
      },
    },
    // `openGraph.type` is a discriminated union in this version, so the branch
    // is real rather than a ternary on one field: a hub is a listing, a child
    // page is an article.
    openGraph:
      entry.hub === null
        ? { type: "website", ...shared }
        : { type: "article", ...shared },
  };
}

/* ── JSON-LD ────────────────────────────────────────────── */

/**
 * Plain objects, not markup. `LongForm`'s `JsonLd` component serialises them
 * and escapes every `<` as a unicode point, the way the Next JSON-LD guide
 * requires; keeping the builders free of React means they can be diffed and
 * checked as data.
 *
 * What is deliberately absent, everywhere below:
 *
 * - **`aggregateRating` and `review`.** We have no ratings. Structured data
 *   that claims stars nobody left is a manual-action risk and, more to the
 *   point, a lie in a machine-readable format.
 * - **`author`.** The About page says in as many words that the founder's name
 *   is not published yet. A byline would have to be invented.
 * - **`datePublished` / `dateModified`.** Optional arguments rather than
 *   defaults, because `new Date()` here would stamp every page with the build
 *   time and claim twenty documents were revised by a CSS fix.
 * - **`image`.** Same reason as the Open Graph card above.
 */
export type JsonLdObject = Record<string, unknown>;

const ORGANIZATION: JsonLdObject = {
  "@type": "Organization",
  name: "Tougather",
  url: absoluteUrl("/"),
  logo: absoluteUrl("/logo.png"),
};

export function breadcrumbJsonLd(slug: Slug): JsonLdObject {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: breadcrumbTrail(slug).map((crumb, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: crumb.name,
      item: absoluteUrl(crumb.href),
    })),
  };
}

/**
 * The page itself: `Article` for a comparison or a guide, `WebPage` for a hub.
 *
 * The default follows the table — a page with a hub is an article, a hub is
 * not — so a page author only passes `type` to override it.
 */
export function pageJsonLd(
  slug: Slug,
  opts: {
    type?: "Article" | "WebPage";
    /** ISO 8601. Pass it only if you know it. */
    published?: string;
    modified?: string;
  } = {},
): JsonLdObject {
  const entry = PAGES[slug];
  /*
   * A hub calls itself what its children call it.
   *
   * The children point at the hub with `isPartOf: { "@type": "CollectionPage",
   * "@id": … }`, so a hub that described itself as a `WebPage` left one URL
   * described as two types across the graph, and the `@id` the children joined
   * on was never published by anything.
   *
   * The default for a child is `WebPage`, not `Article`. `Article` is the type
   * that earns a rich result, and it earns it with an author, a publication
   * date and an image. There is no published byline here and no per-page edit
   * date, so claiming the type would be asking for a result we cannot be given
   * and failing Google's own validator on the way. A caller who has those
   * facts can pass `{ type: "Article", published, modified }` and mean it.
   */
  const type = opts.type ?? (entry.hub === null ? "CollectionPage" : "WebPage");
  const url = absoluteUrl(entry.slug);

  const base: JsonLdObject = {
    "@context": "https://schema.org",
    "@type": type,
    // Only `Article` names its title `headline`; the page types use `name`.
    ...(type === "Article" ? { headline: entry.h1 } : { name: entry.h1 }),
    description: entry.description,
    inLanguage: BCP47[entry.lang],
    url,
    // Published so `isPartOf` on a child resolves to something real.
    "@id": url,
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    publisher: ORGANIZATION,
  };

  if (entry.hub) {
    const hub = PAGES[entry.hub];
    base.isPartOf = {
      "@type": "CollectionPage",
      "@id": absoluteUrl(hub.slug),
      name: hub.h1,
    };
  }
  if (opts.published) base.datePublished = opts.published;
  if (opts.modified) base.dateModified = opts.modified;

  return base;
}

/**
 * One question and the answer to it.
 *
 * `answer` is a plain string rather than a `ReactNode`, and that is the point:
 * `FAQ` in `LongForm.tsx` renders the same string this builder marks up, so
 * the answer in the markup is provably the answer on the page. Google requires
 * that, and the only way to guarantee it is to have one source for both.
 *
 * The cost is no inline formatting inside an answer. Write the formula or the
 * file name in plain text; if an answer genuinely needs markup, it is long
 * enough to be a section instead.
 */
export interface FaqItem {
  question: string;
  answer: string;
}

/**
 * Google restricted FAQ rich results in 2023 to government and health sites,
 * so this almost certainly shows nothing in a result. It is still worth
 * emitting: it costs a kilobyte, it describes the page accurately to anything
 * else reading the markup, and if a question does not earn its place with the
 * markup stripped out then the question should be cut, not the markup.
 */
export function faqJsonLd(items: readonly FaqItem[]): JsonLdObject {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    })),
  };
}

/**
 * The product, described once for every page that wants to describe it.
 *
 * Prices come from `src/lib/impact/config.ts` rather than being retyped, so
 * they cannot disagree with the pricing page. Two omissions worth naming:
 *
 * - No `availability`. Every Stripe price ID is still `null`
 *   (`src/lib/billing/index.ts`), so the plans are published prices, not a
 *   working checkout, and `InStock` would say otherwise.
 * - No metered AI rate. It is marked `status: "placeholder"` in the config and
 *   renders with a visible provisional marker in the UI; a provisional number
 *   has no business in structured data, where nothing can mark it.
 */
export function softwareApplicationJsonLd(): JsonLdObject {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Tougather",
    url: absoluteUrl("/"),
    applicationCategory: "BusinessApplication",
    // It runs in a browser and installs as a PWA. There is no native app —
    // no React Native, Capacitor, Expo, Electron or Tauri in package.json —
    // so naming an operating system here would be inventing a build.
    operatingSystem: "Web browser",
    description:
      "A workspace where documents, spreadsheets, slides, an infinite board and chat are one document model, in the browser.",
    publisher: ORGANIZATION,
    offers: PLANS.map((plan) => ({
      "@type": "Offer",
      name: plan.name,
      price: plan.price,
      priceCurrency: CURRENCY.code,
      description: plan.perSeat
        ? "Per seat, per month."
        : "Per month, flat.",
    })),
  };
}

/* ── The invariant ──────────────────────────────────────── */

/**
 * Three things the type system cannot check, checked here.
 *
 * `Slug` guarantees every `counterpart` and `related` value is a real page. It
 * cannot guarantee they are the *right* page — `/nl/gidsen` naming
 * `/nl/vergelijk` as its English counterpart type-checks perfectly, and that
 * exact mistake was in the first draft of this file. Google discards a
 * one-way hreflang pair without reporting it, so on the live site a broken
 * pair looks identical to a working one; nothing downstream would ever have
 * said so.
 *
 * Not guarded by `NODE_ENV`. Every page in this table is prerendered, so this
 * module is evaluated during `next build` — the throw fails the build, before
 * anything is deployed, rather than only failing for whoever happens to run
 * `next dev` next. Twenty iterations at module load, once.
 */
for (const slug of SLUGS) {
  const entry = PAGES[slug];
  const other = PAGES[entry.counterpart];
  if (other.counterpart !== slug) {
    throw new Error(
      `seo.ts: ${slug} names ${entry.counterpart} as its counterpart, but ` +
        `${other.slug} names ${other.counterpart}. hreflang pairs must be reciprocal.`,
    );
  }
  if (other.lang === entry.lang) {
    throw new Error(
      `seo.ts: ${slug} and its counterpart ${other.slug} are both "${entry.lang}". ` +
        `A counterpart is the same page in the other language.`,
    );
  }
  for (const related of entry.related) {
    if (PAGES[related].lang !== entry.lang) {
      throw new Error(
        `seo.ts: ${slug} lists ${related} as related, across languages. ` +
          `Language switching is hreflang and the footer, not a body link.`,
      );
    }
  }
}
