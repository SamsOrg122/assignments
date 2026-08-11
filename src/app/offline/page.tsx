import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Offline",
  robots: { index: false, follow: false },
};

/**
 * The page the service worker falls back to when a navigation can't be served.
 *
 * Deliberately static and dependency-free — it has to render from the cache
 * with no network and no data — and deliberately not an apology. Work made in
 * this browser is still here; what is missing is anything that needed the
 * server, and saying which is which is the entire job of this screen.
 */
export default function OfflinePage() {
  return (
    <main className="grid min-h-dvh place-items-center px-5 py-16">
      <div className="w-full max-w-[420px]">
        <p className="label-mono mb-2.5">No connection</p>
        <h1 className="mb-3 text-[24px] leading-tight font-medium tracking-[-0.02em] text-fg">
          You&apos;re offline, and your work is fine.
        </h1>
        <p className="mb-4 text-[13.5px] leading-relaxed text-fg-muted">
          Everything you have made is stored in this browser and opens without a
          network. What needs a connection is syncing to your account, live
          sessions with other people, and the AI — those pick up on their own
          when the network comes back.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/library"
            className="rounded-sm bg-accent px-2.5 py-1.5 text-[12.5px] font-medium text-on-accent transition-[filter] duration-150 hover:brightness-110"
          >
            Open the library
          </Link>
          <Link
            href="/settings#keeping"
            className="rounded-sm border border-line px-2.5 py-1.5 text-[12.5px] text-fg-muted transition-colors duration-150 hover:border-line-strong hover:text-fg"
          >
            How your work is kept
          </Link>
        </div>
        <p className="mt-4 text-[12px] leading-relaxed text-fg-subtle">
          If this page keeps appearing while you clearly do have a connection,
          the stored copy of the app may be damaged. Settings → Keeping your
          work has a button that clears it and starts fresh.
        </p>
      </div>
    </main>
  );
}
