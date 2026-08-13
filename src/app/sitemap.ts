import type { MetadataRoute } from "next";
import { PAGES, SLUGS, absoluteUrl, counterparts } from "@/lib/seo";

/**
 * The sitemap.
 *
 * Two sources, one file: the marketing pages, which are hand-listed because
 * there are six of them and they change about once a year, and the twenty
 * search pages, which come from the registry so a new slug appears here
 * without anybody remembering to add it.
 *
 * What is *not* here, and why:
 *
 * - **`lastModified`.** We do not track a per-page edit date. `new Date()`
 *   would stamp every URL with the build time, which tells a crawler that all
 *   twenty-six pages changed the moment somebody deployed a CSS fix. That is
 *   false, and a sitemap caught lying about dates is one a crawler stops
 *   reading dates from. When these pages get a real `updated` value — the
 *   field `PageShell` already renders — it belongs here and nowhere else.
 * - **`priority` and `changeFrequency`.** Google has said for years that it
 *   ignores both. They are two more numbers to keep honest for no return.
 *
 * `alternates.languages` is here, and it is the part that earns its keep: it
 * repeats the hreflang pair from `pageMetadata` in a place a crawler reads
 * before it fetches either page. Both come from `counterparts()`, so they
 * cannot disagree.
 *
 * `/checkout` is deliberately absent. It is disallowed in `robots.ts`, and a
 * sitemap listing a URL that robots blocks is a contradiction a crawler
 * reports back as an error.
 */

/** The storefront routes that predate the registry. */
const MARKETING = [
  "/",
  "/pricing",
  "/about",
  "/impact",
  "/contact",
  "/legal",
] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  const marketing: MetadataRoute.Sitemap = MARKETING.map((path) => ({
    url: absoluteUrl(path),
  }));

  const search: MetadataRoute.Sitemap = SLUGS.map((slug) => {
    const { en, nl } = counterparts(slug);
    return {
      url: absoluteUrl(PAGES[slug].slug),
      alternates: {
        languages: {
          en: absoluteUrl(en.slug),
          nl: absoluteUrl(nl.slug),
          "x-default": absoluteUrl(en.slug),
        },
      },
    };
  });

  return [...marketing, ...search];
}
