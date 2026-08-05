/**
 * Renders one declared visual slot.
 *
 * If the slot has a real asset it shows it. If it doesn't, it shows the
 * crafted fallback the caller supplied — never a grey box, never a stand-in
 * image pretending to be final art. Both paths are first-class: the fallbacks
 * are hand-built vector and type, which is half the point of the page.
 *
 * The crafted graphic also stays *underneath* a real asset rather than being
 * replaced, so an unreachable image degrades to the hand-built visual instead
 * of to a hole in the page.
 */

import Image from "next/image";
import { isFilled, slot, type SlotId } from "@/lib/visuals/slots";
import { cn } from "@/lib/cn";

export function Visual({
  id,
  fallback,
  className,
  imageClassName,
  priority = false,
  sizes = "100vw",
}: {
  id: SlotId;
  /** Crafted graphic used until — and underneath — a real asset. */
  fallback: React.ReactNode;
  className?: string;
  imageClassName?: string;
  priority?: boolean;
  sizes?: string;
}) {
  const s = slot(id);

  // No `relative` here on purpose. `cn` is a plain join, so Tailwind's own
  // source order would decide between it and a caller's `absolute` — and
  // `relative` is emitted later, which would silently drop every caller out of
  // its intended position. Callers own their positioning.
  const wrapper = cn("overflow-hidden", className);

  if (!isFilled(s)) return <div className={wrapper}>{fallback}</div>;

  // Decorative slots paint as a background rather than an <img>. A background
  // that fails to load paints nothing at all, where a broken <img> leaves a
  // placeholder box over the layout — and these are atmosphere behind text
  // that already carries the meaning, so there is no alt text to lose.
  if (s.decorative)
    return (
      <div className={wrapper}>
        <div className="absolute inset-0">{fallback}</div>
        <div
          aria-hidden="true"
          className={cn("absolute inset-0 bg-cover bg-center", imageClassName)}
          style={{ backgroundImage: `url("${s.src}")` }}
        />
      </div>
    );

  return (
    <div className={wrapper}>
      <div className="absolute inset-0">{fallback}</div>
      <Image
        src={s.src}
        alt={s.alt}
        fill
        sizes={sizes}
        priority={priority}
        className={cn("object-cover", imageClassName)}
      />
    </div>
  );
}
