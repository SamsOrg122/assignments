"use client";

/**
 * The live demo.
 *
 * Not a mock-up of the app — the app. It frames the real `/library` route in
 * an iframe, so what a visitor sees under the hero is pixel-for-pixel the
 * thing they get, and they can click into it: open a project, type in a
 * document, drag something on the board, press ⌘K.
 *
 * A hand-drawn approximation is easier and always ends up lying — it drifts
 * the moment the product moves, and it can't be clicked. Same origin, same
 * bundle, same store, so this stays true by construction.
 *
 * Loaded lazily and only once it's near the viewport: the storefront's whole
 * point is that it doesn't make you pay for the app before you've asked for
 * it, and mounting the editor above the fold would undo that.
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { ForestFallback } from "./mocks";
import { cn } from "@/lib/cn";

export function LiveDemo() {
  const holder = useRef<HTMLDivElement>(null);
  // No observer means no way to know when this nears the viewport, so load it
  // rather than never showing the demo at all. Decided at first render so the
  // effect never has to set state synchronously to correct it.
  const [mounted, setMounted] = useState(
    () => typeof window !== "undefined" && !("IntersectionObserver" in window),
  );
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const node = holder.current;
    if (!node || !("IntersectionObserver" in window)) return;

    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setMounted(true);
          io.disconnect();
        }
      },
      { rootMargin: "300px 0px" },
    );
    io.observe(node);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={holder} className="relative">
      <div className="glass overflow-hidden rounded-lg sm:rounded-xl">
        {/* Chrome. Reads as a window so the frame edge is obviously a frame,
            not a section border. */}
        <div className="flex items-center gap-2 border-b border-line px-3 py-2.5 sm:px-4">
          <span className="flex shrink-0 gap-1.5" aria-hidden="true">
            {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
              <span
                key={c}
                className="size-2.5 rounded-full opacity-55"
                style={{ background: c }}
              />
            ))}
          </span>

          <span className="mx-auto hidden max-w-[280px] min-w-0 flex-1 items-center justify-center gap-1.5 rounded-sm border border-line bg-black/25 px-2.5 py-1 sm:flex">
            <Icon name="focus" size={9} className="shrink-0 text-fg-subtle" />
            <span className="truncate font-mono text-[10.5px] text-fg-subtle">
              assignments/library
            </span>
          </span>

          <span className="ml-auto flex shrink-0 items-center gap-2 sm:ml-0">
            <span className="flex items-center gap-1.5 rounded-xs border border-accent/30 bg-accent-soft px-1.5 py-0.5 text-[10px] text-accent">
              <span className="size-1 animate-pulse rounded-full bg-accent" />
              live — click around
            </span>
          </span>
        </div>

        <div className="relative h-[clamp(440px,64vh,720px)] bg-canvas">
          {mounted ? (
            <iframe
              // The app ships empty; the demo frame asks for the samples.
              src="/library?demo=1"
              title="Assignments, running live"
              loading="lazy"
              onLoad={() => setReady(true)}
              className={cn(
                "size-full border-0 transition-opacity duration-500",
                ready ? "opacity-100" : "opacity-0",
              )}
            />
          ) : null}

          {/* Placeholder while the app boots — a still frame, not a spinner. */}
          <div
            aria-hidden="true"
            className={cn(
              "pointer-events-none absolute inset-0 grid place-items-center transition-opacity duration-500",
              ready ? "opacity-0" : "opacity-100",
            )}
          >
            <div className="absolute inset-0 opacity-40">
              <ForestFallback className="absolute inset-0" />
            </div>
            <span className="relative text-[12px] text-fg-subtle">
              Loading the workspace…
            </span>
          </div>
        </div>
      </div>

      <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-fg-subtle">
        <span>
          That&apos;s the real application, not a screenshot — open a project,
          type, press ⌘K.
        </span>
        <Link
          href="/library"
          className="inline-flex items-center gap-0.5 text-fg-muted underline decoration-line-strong underline-offset-2 transition-colors hover:text-fg"
        >
          Open it full size
          <Icon name="chevron-right" size={10} />
        </Link>
      </p>
    </div>
  );
}
