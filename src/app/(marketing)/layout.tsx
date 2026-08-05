/**
 * The storefront.
 *
 * Deliberately outside the app shell: no sidebar, no palette, no stores. The
 * `storefront` class pins the dark identity, so someone whose app preference
 * is light still sees the brand here rather than a washed-out landing page.
 */

export default function MarketingLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="storefront relative min-h-full w-full overflow-x-clip">
      {children}
    </div>
  );
}
