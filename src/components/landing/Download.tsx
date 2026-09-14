"use client";

/**
 * The download.
 *
 * One button that already knows which file you want, and the other four
 * underneath it rather than behind a menu. That layout is the whole design:
 * "Download for macOS" answers the question for nine people in ten, and the
 * tenth — a Mac owner who is on Intel, somebody on Linux who wants a .deb — can
 * see their answer without pressing anything.
 *
 * ── WHY THE FIRST RENDER IS ALWAYS WINDOWS ──────────────────────────────
 * The platform is read in an effect, never during render. The server has no
 * navigator, so a lazy initialiser that touched it would give the server one
 * label and the browser another — a hydration mismatch React repairs by
 * throwing away the markup it was handed, which on a landing page is the most
 * expensive thing you can do to your own first paint. So the button is drawn
 * with the most common platform and corrected on the first commit, and the
 * correction is a word changing rather than a layout moving, because every
 * label is the same shape.
 *
 * ── AND WHY THE WARNINGS ARE ON THE PAGE, NOT AFTER IT ─────────────────
 * This build is unsigned. Windows answers an unsigned installer with a blue
 * full-screen "Windows protected your PC", and somebody who was not told
 * reasonably concludes they have just downloaded a virus. Saying so before the
 * click costs one line and saves the download.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import {
  BROWSER_RELEASES_URL,
  BROWSER_VERSION,
  BUILDS,
  buildById,
  guessPlatform,
  type PlatformId,
} from "@/lib/browser";
import { cn } from "@/lib/cn";

/**
 * Which build this visitor wants, resolved after mount.
 *
 * One hook rather than the same effect in two components, because the two must
 * agree: the big button offers one platform and the list underneath it hides
 * that same one, and two copies of this would eventually differ by a render.
 *
 * The deferral is the repository's convention for a first-commit state write —
 * setting state straight from an effect body cascades a render, and React's
 * lint says so. A microtask puts it after the paint instead.
 */
function usePlatform(): PlatformId {
  const [platform, setPlatform] = useState<PlatformId>("windows");
  useEffect(() => {
    void Promise.resolve().then(() => setPlatform(guessPlatform()));
  }, []);
  return platform;
}

export function DownloadButton({
  className,
  size = "big",
}: {
  className?: string;
  /** `big` is the hero's; `small` fits in a nav or a card. */
  size?: "big" | "small";
}) {
  const build = buildById(usePlatform());

  return (
    <a
      href={build.href}
      className={cn(
        "pill-cta group inline-flex items-center gap-2.5 rounded-full font-medium",
        size === "big" ? "px-6 py-3.5 text-[15px]" : "px-4 py-2.5 text-[13px]",
        className,
      )}
    >
      <Icon name="download" size={size === "big" ? 17 : 14} />
      <span>Download for {build.label}</span>
      {/* The size, quietly, in the button itself. A hundred megabytes is worth
          knowing before the click on a connection that makes it matter. */}
      <span className="text-[0.82em] opacity-70">{build.size}</span>
    </a>
  );
}

/**
 * Every build, named.
 *
 * Rendered as a row of quiet links rather than a dropdown: five short labels
 * fit on one line at any width that matters, and a menu would hide the two
 * cases — Intel Macs and Debian — that are the entire reason the list exists.
 */
export function OtherBuilds({ className }: { className?: string }) {
  const platform = usePlatform();

  return (
    <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-1.5", className)}>
      <span className="text-[12.5px] text-fg-subtle">Also for</span>
      {BUILDS.filter((b) => b.id !== platform).map((build) => (
        <a
          key={build.id}
          href={build.href}
          className="text-[12.5px] text-fg-muted underline decoration-line-strong underline-offset-2 transition-colors hover:text-fg"
        >
          {build.label}
          {build.note ? ` (${build.note})` : ""}
        </a>
      ))}
      <span className="text-[12.5px] text-fg-subtle">·</span>
      <Link
        href="/download"
        className="text-[12.5px] text-fg-muted underline decoration-line-strong underline-offset-2 transition-colors hover:text-fg"
      >
        What to expect on first run
      </Link>
    </div>
  );
}

/** The version, and a link that cannot go stale even when this one does. */
export function BuildLine({ className }: { className?: string }) {
  return (
    <p className={cn("text-[12.5px] text-fg-subtle", className)}>
      Version {BROWSER_VERSION} · free, and it stays free ·{" "}
      <a
        href={BROWSER_RELEASES_URL}
        className="underline decoration-line-strong underline-offset-2 transition-colors hover:text-fg-muted"
      >
        every build
      </a>
    </p>
  );
}
