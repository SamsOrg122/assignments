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

export default nextConfig;
