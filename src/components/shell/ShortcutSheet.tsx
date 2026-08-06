"use client";

/**
 * The keyboard reference.
 *
 * Ordered by where you are, not alphabetically: on a board, board shortcuts
 * come first. Everything is generated from `lib/shortcuts`, so a binding can't
 * be listed here without existing there.
 */

import { Dialog } from "@/components/ui/Dialog";
import { SHORTCUTS, type Surface } from "@/lib/shortcuts";

export function ShortcutSheet({
  surface,
  onClose,
}: {
  surface: Surface;
  onClose: () => void;
}) {
  // The surface you're on, then everything else in its declared order.
  const groups = [
    ...SHORTCUTS.filter((g) => g.where === surface),
    ...SHORTCUTS.filter((g) => g.where !== surface),
  ];

  return (
    <Dialog
      title="Keyboard"
      description="⌘ is Ctrl on Windows and Linux."
      width={720}
      onClose={onClose}
    >
      <div className="columns-1 gap-6 sm:columns-2">
        {groups.map((group) => (
          <section key={group.where} className="mb-5 break-inside-avoid">
            <h3 className="mb-1.5 text-[11px] tracking-wide text-fg-subtle">
              {group.title}
              {group.where === surface && group.where !== "global" && (
                <span className="ml-1.5 text-accent">· you&rsquo;re here</span>
              )}
            </h3>
            <dl className="space-y-0.5">
              {group.items.map((item) => (
                <div
                  key={item.keys + item.what}
                  className="flex items-baseline gap-3 rounded-sm px-1 py-1 odd:bg-surface-2/50"
                >
                  <dt className="w-[92px] shrink-0 font-mono text-[11px] text-fg">
                    {item.keys}
                  </dt>
                  <dd className="min-w-0 text-[12px] leading-snug text-fg-muted">
                    {item.what}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </Dialog>
  );
}
