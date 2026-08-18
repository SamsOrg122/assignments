import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    /**
     * Generated storefront visuals are still served from Higgsfield's CDN.
     * Tolerable for now because every slot renders its crafted fallback
     * *underneath* the image, so an expired or unreachable asset degrades to
     * the hand-built graphic rather than to a broken image.
     *
     * FOUNDER: for production, download the three assets into
     * `public/visuals/` and point the slots at local paths — then this block
     * can go. A landing page shouldn't depend on someone else's CDN.
     */
    remotePatterns: [
      {
        protocol: "https",
        hostname: "d8j0ntlcm91z4.cloudfront.net",
        pathname: "/**",
      },
    ],
  },
};

/**
 * Where the browser is allowed to talk to Supabase.
 *
 * The URL is a runtime setting — `/api/config` serves it, and a deployment
 * may point at a self-hosted instance on its own domain — so the policy is
 * built from whatever the environment names, falling back to the hosted
 * wildcard. Getting this wrong is loud rather than silent: sign-in stops
 * working and the console says exactly which origin was refused.
 */
function supabaseOrigin(): string {
  const raw =
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
  try {
    return raw ? new URL(raw).origin : "";
  } catch {
    return "";
  }
}

/**
 * The Content-Security-Policy.
 *
 * Read the `script-src` line before trusting the rest: it carries
 * `'unsafe-inline'`, and that is a real limit, not an oversight. This app
 * renders two inline boot scripts before first paint (theme and page
 * language) and the framework streams its own inline scripts on every page,
 * whose contents differ per page and so cannot be hashed. The only way to
 * drop `'unsafe-inline'` is a per-request nonce, and a nonce means every one
 * of the forty-odd marketing and guide pages stops being statically rendered.
 * That trade is the founder's to make, not mine to slip in here.
 *
 * So say plainly what this does and does not buy.
 *
 * It does not stop an inline event handler that got past the sanitiser. The
 * sanitiser remains the defence there, and it is tested.
 *
 * It does stop the things that actually turn a small hole into a breach:
 *
 *  - `script-src` has no wildcard, so an injected `<script src="…">` pointing
 *    anywhere off this origin does not load. That is most real XSS payloads.
 *  - `connect-src` is an allowlist, so script that does run cannot post
 *    somebody's document to an address of its choosing. This is the one that
 *    matters most for a workspace: the documents are the asset.
 *  - `base-uri` stops a `<base>` tag being injected to re-point every
 *    relative script URL on the page.
 *  - `form-action` stops a form being re-aimed at somebody else's server,
 *    which is how an injected sign-in box harvests a password.
 *  - `object-src 'none'` retires the plugin surface entirely.
 *  - `frame-ancestors` is the clickjacking one: without it somebody can put
 *    the editor in a transparent iframe over their own page and read whatever
 *    gets typed.
 *
 * `img-src` deliberately allows any https host. Documents carry images people
 * brought with them, and breaking those to close a channel that leaks a few
 * bytes at a time — while `connect-src` is shut — is the wrong trade.
 */
function contentSecurityPolicy(): string {
  const supabase = supabaseOrigin();
  const connect = [
    "'self'",
    supabase,
    // The hosted pattern, kept alongside so a deployment that configures
    // Supabase at runtime rather than at build time still works.
    "https://*.supabase.co",
    "wss://*.supabase.co",
    supabase.startsWith("https://") ? supabase.replace("https://", "wss://") : "",
  ].filter(Boolean);

  return [
    "default-src 'self'",
    // See the note above. Not a strict policy, and not pretending to be.
    "script-src 'self' 'unsafe-inline'",
    // React writes style attributes and the framework inlines critical CSS.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "media-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src ${connect.join(" ")}`,
    // The live demo frames the app itself; a code block previews its own HTML
    // through a sandboxed srcdoc frame.
    "frame-src 'self' blob: data:",
    // The service worker, and the blob URLs every export downloads through.
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'",
    "upgrade-insecure-requests",
  ].join("; ");
}

/**
 * Headers every response carries.
 *
 *  - `X-Content-Type-Options` stops a browser guessing that an uploaded file
 *    is really HTML and running it.
 *  - `Referrer-Policy` matters more than usual, because a share link carries
 *    the whole document after the `#`. Fragments are not sent in a Referer by
 *    any browser — but a policy that leaks the path of a viewer page to every
 *    image host is still telling strangers what somebody is reading.
 *  - `X-Frame-Options` says the same thing as `frame-ancestors` for the
 *    browsers that never learned the newer one.
 *  - `Permissions-Policy` turns off what this never asks for. The microphone
 *    is not in the list: dictation needs it.
 */
const SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Content-Security-Policy", value: contentSecurityPolicy() },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  {
    key: "Permissions-Policy",
    value: "camera=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
  },
];

nextConfig.headers = async () => [
  { source: "/:path*", headers: SECURITY_HEADERS },
];

export default nextConfig;
