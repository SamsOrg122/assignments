/**
 * The mark.
 *
 * Four people, arms out, standing in a ring. The artwork arrived as a 1.1 MB
 * render — white shapes inside a wide bloom on a black background — which is
 * fine as a picture and impossible as an interface element: a baked-in black
 * background disappears on a light page, and the glow turns to mush at the
 * sizes a nav and a tab actually use.
 *
 * So the silhouette is lifted out of it once, at build time, and shipped as a
 * transparent mask. The colour then comes from `currentColor` like any other
 * glyph, which is what lets one file serve the dark shell, the light theme and
 * a white tile without three separate exports drifting apart.
 *
 * `mask` needs the `-webkit-` twin: Safari still only implements the prefixed
 * property, and without it the mark renders as a solid coloured square.
 */

import { cn } from "@/lib/cn";

const SRC = "/logo.png";

export function Logo({
  size = 20,
  className,
}: {
  /** Rendered edge length in pixels. Square, always. */
  size?: number;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn("inline-block shrink-0 bg-current", className)}
      style={{
        width: size,
        height: size,
        WebkitMaskImage: `url(${SRC})`,
        maskImage: `url(${SRC})`,
        WebkitMaskRepeat: "no-repeat",
        maskRepeat: "no-repeat",
        WebkitMaskPosition: "center",
        maskPosition: "center",
        WebkitMaskSize: "contain",
        maskSize: "contain",
      }}
    />
  );
}

/**
 * The mark on its tile, as the tab icon and the sidebar wear it.
 *
 * A bare mark on a transparent ground takes whatever is behind it, which in a
 * sidebar is fine and on a browser tab is a coin flip. The tile makes it the
 * same object everywhere.
 */
export function LogoTile({
  size = 20,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center rounded-xs bg-fg text-canvas",
        className,
      )}
      style={{ width: size, height: size }}
    >
      <Logo size={Math.round(size * 0.74)} />
    </span>
  );
}
