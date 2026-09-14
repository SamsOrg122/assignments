/**
 * The storefront.
 *
 * Deliberately outside the app shell: no sidebar, no palette, no stores. The
 * `storefront` class carries the whole palette — paper, ink, one coral — and
 * redefines every token the shared components reach for, so an `Icon` or the
 * pricing table works here without a single conditional.
 *
 * ── WHAT LEFT, AND WHY ──────────────────────────────────────────────────
 * The drifting lilac mesh and the one-time arrival splash both lived here.
 * The mesh was the background of the design this replaced: colour smeared
 * behind everything, which reads as a template no matter how well it is
 * made. Colour now arrives inside objects — cards, widgets, the window — and
 * the ground is paper.
 *
 * The arrival went with it. It was a full-screen wordmark that had to be got
 * out of the way before the page could start, and the page now has its own
 * arrival: four things lift in over half a second and then it is still. One
 * entrance is enough, and it should be the one that shows the product.
 */

export default function MarketingLayout({ children }: LayoutProps<"/">) {
  return <div className="storefront relative min-h-full w-full overflow-x-clip">{children}</div>;
}
