/**
 * The storefront.
 *
 * Deliberately outside the app shell: no sidebar, no palette, no stores. The
 * `storefront` class pins the dark identity, so someone whose app preference
 * is light still sees the brand here rather than a washed-out landing page.
 *
 * The arrival sits here rather than on the landing page, because "the first
 * time you come to the site" is not the same as "the first time you see the
 * home page" — plenty of people land on a guide or the pricing from a search.
 * It plays once ever, on whichever of these they reach first.
 */

import { Arrival } from "@/components/landing/Arrival";

export default function MarketingLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="storefront relative min-h-full w-full overflow-x-clip">
      <Arrival />
      {children}
    </div>
  );
}
