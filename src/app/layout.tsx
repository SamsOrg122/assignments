import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
// KaTeX ships its own stylesheet and fonts; Next bundles both from here, so an
// equation renders offline and nothing is fetched from a CDN.
import "katex/dist/katex.min.css";
import { APPEARANCE_BOOT_SCRIPT } from "@/lib/appearance";

export const metadata: Metadata = {
  /*
   * Without this, Next resolves Open Graph and canonical URLs against
   * localhost and every link preview a shared page produces points at a
   * machine nobody else can reach.
   */
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://tougather.com",
  ),
  title: {
    default: "Tougather — everything, in one",
    template: "%s · Tougather",
  },
  description:
    "A beautiful, AI-native workspace for entrepreneurs and students. Write, present, draw and organise in one place — and a fixed share of every euro is set aside for planting trees.",
};

export const viewport: Viewport = {
  themeColor: "#121215",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${GeistSans.variable} ${GeistMono.variable} h-full antialiased`}
      // The boot script writes these attributes before React hydrates.
      suppressHydrationWarning
    >
      <body className="h-full">
        {/*
          A plain inline script, deliberately. `next/script` with
          `beforeInteractive` emits this as a data payload the Next runtime
          executes after hydration bootstraps — far too late to stop a
          light-mode user seeing a dark flash. Rendered this way it is real
          markup and runs before first paint. React dev-warns about script
          elements in components (they don't re-execute on client navigation),
          which is exactly the behaviour wanted here: this runs once, at load.
        */}
        <script dangerouslySetInnerHTML={{ __html: APPEARANCE_BOOT_SCRIPT }} />
        {children}
      </body>
    </html>
  );
}
