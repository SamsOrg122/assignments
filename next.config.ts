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
 * Headers every response carries.
 *
 * Not a Content-Security-Policy, and that omission is deliberate rather than
 * forgotten. This app renders two inline boot scripts before first paint — the
 * theme and the page language — and a policy that allows inline script to keep
 * them is a policy that also allows an injected one, which is the thing a CSP
 * is for. Doing it properly means per-request nonces, which means giving up
 * static rendering on every page that has one. That is a real trade and it
 * belongs in a commit of its own, with the nonce plumbing tested, rather than
 * as a line slipped in here that looks like protection and is not.
 *
 * What is here is the part that costs nothing and is not negotiable:
 *
 *  - `X-Content-Type-Options` stops a browser guessing that an uploaded file
 *    is really HTML and running it.
 *  - `frame-ancestors` is the clickjacking one that matters most here: without
 *    it somebody can put the editor in a transparent iframe over their own
 *    page and harvest whatever gets typed.
 *  - `Referrer-Policy` matters more than usual, because a share link carries
 *    the whole document after the `#`. Fragments are not sent in a Referer by
 *    any browser — but a policy that leaks the path of a viewer page to every
 *    image host is still telling strangers what somebody is reading.
 *  - `Permissions-Policy` turns off what this never asks for. The microphone
 *    is not in the list: dictation needs it.
 */
const SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Content-Security-Policy",
    value: "frame-ancestors 'self'",
  },
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
