"use client";

/**
 * A person, wherever one appears.
 *
 * Two shapes with one colour behind them: the disc with initials, for the
 * places somebody is the subject — the author of a message, a member row —
 * and the dot, for the places they are a detail on something else, like the
 * direct-message row named after them.
 *
 * The colour comes from `whoHue`, which derives it from the id so the same
 * person is the same colour on every screen. Every site here also prints the
 * name, so the colour is a way of finding a name you already know, never the
 * only thing saying who this is.
 */

import { whoHue } from "@/lib/hue";
import { cn } from "@/lib/cn";

export function Who({
  id,
  initials,
  name,
  size = 22,
  className,
}: {
  id: string;
  initials: string;
  /** Read out to a screen reader, which cannot use the colour or the stub. */
  name?: string;
  size?: number;
  className?: string;
}) {
  return (
    <span
      className={cn("who", className)}
      style={{ ["--hue" as string]: whoHue(id), width: size, height: size }}
      aria-label={name}
      role={name ? "img" : undefined}
      aria-hidden={name ? undefined : true}
    >
      {initials}
    </span>
  );
}

export function WhoDot({ id, className }: { id: string; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("size-1.5 shrink-0 rounded-full", className)}
      style={{ background: whoHue(id) }}
    />
  );
}
