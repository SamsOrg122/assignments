import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/seo";

/**
 * robots.txt, generated.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * This file replaces `public/robots.txt`, which has been deleted.
 *
 * They cannot coexist: both resolve to `/robots.txt`, and Next treats a public
 * file colliding with a route as a build error rather than picking a winner.
 * The route is the half worth keeping, because the sitemap URL below is built
 * from the same `SITE_URL` the canonical tags and the sitemap use — a static
 * file would hard-code an origin that is wrong on every preview deployment.
 * The one rule the old file carried, the `/v` disallow, is preserved verbatim
 * below along with the reason it exists.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Everything the storefront publishes is allowed. Everything behind it is not,
 * and the list is not about secrecy — a crawler cannot reach any of it anyway,
 * because the work lives in this browser. It is about the index: these routes
 * either render an empty shell to anything without local data (`/library`,
 * `/p/…`), or return JSON (`/api/…`), or are a step in a flow that means
 * nothing out of context (`/signin`, `/checkout`). Each one indexed is a
 * result that disappoints whoever clicks it.
 */

const APP_SURFACES = [
  "/library",
  "/p/",
  "/chat",
  "/kit",
  "/team",
  "/settings",
  "/admin",
  // The two hubs. Both render an empty shell to anything without local data,
  // exactly like /library, and /more is a list of doors into a workspace a
  // crawler does not have.
  "/due",
  "/more",
  "/present",
  "/notes",
  "/study",
  "/agenda",
  "/assignments",
  "/community",
  // Anchored with `$`: a Disallow is a *prefix* match, so a bare "/f" would
  // also hide a future /features or /faq. Both of these are leaf routes.
  "/f$",
  // A shared project lives in the URL fragment, which a crawler never receives
  // — so /v is always an empty page to anything indexing it. Kept out of the
  // index so that empty page never becomes a search result for someone's
  // project name.
  "/v$",
  "/api",
  "/auth",
  "/signin",
  "/checkout",
  // The offline fallback. It is a shell that says the connection dropped;
  // indexed, it is that sentence in a result for the brand name.
  "/offline",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      // `/` covers the storefront and every page in the registry. A crawler
      // resolves the most specific match, so the disallows below still win on
      // the paths they name.
      allow: "/",
      disallow: APP_SURFACES,
    },
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
