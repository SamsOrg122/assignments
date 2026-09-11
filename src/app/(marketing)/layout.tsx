/**
 * The storefront.
 *
 * Deliberately outside the app shell: no sidebar, no palette, no stores. The
 * `storefront` class carries the glass palette — light by default now, and
 * following the reader's own appearance preference into dark rather than
 * pinning one. See the block by that name in globals.css for why that
 * reversed.
 *
 * The arrival sits here rather than on the landing page, because "the first
 * time you come to the site" is not the same as "the first time you see the
 * home page" — plenty of people land on a guide or the pricing from a search.
 * It plays once ever, on whichever of these they reach first.
 */

import { Arrival } from "@/components/landing/Arrival";
import { Mesh } from "@/components/landing/Mesh";

export default function MarketingLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="storefront relative min-h-full w-full overflow-x-clip">
      {/*
        * The mesh is mounted here rather than on the landing page, for the
        * same reason the arrival is: a guide reached from a search result is
        * as much the storefront as the home page is, and a background that
        * only exists on one page makes the rest look like a different site.
        *
        * It is `position: fixed`, so it costs nothing to have it on every
        * page — it is painted once and never scrolls.
        */}
      <Mesh />
      <Arrival />
      {/* Above the mesh. Without a stacking context the blurred fields paint
          over the content they are supposed to be behind. */}
      <div className="relative z-[1]">{children}</div>
    </div>
  );
}
