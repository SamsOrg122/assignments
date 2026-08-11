import type { MetadataRoute } from "next";

/**
 * What makes this installable.
 *
 * `standalone` rather than `browser`: installed from a phone's home screen it
 * should open as the workspace, not as a tab wearing a chrome bar. The start
 * URL is the library rather than the storefront — someone who has installed
 * the app has already read the storefront.
 *
 * The mark is declared twice on purpose. `maskable` lets Android crop it into
 * whatever shape the launcher uses without eating the figures; `any` is the
 * same file for everywhere that doesn't crop.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Tougather",
    short_name: "Tougather",
    description:
      "Write, present, draw and organise in one place. Your work is kept in this browser and works offline.",
    start_url: "/library",
    scope: "/",
    display: "standalone",
    background_color: "#121215",
    theme_color: "#121215",
    orientation: "any",
    categories: ["productivity", "education", "business"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Library", url: "/library" },
      { name: "Chat", url: "/chat" },
    ],
  };
}
