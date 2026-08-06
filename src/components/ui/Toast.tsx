"use client";

import { useUI } from "@/lib/ui-store";

export function Toast() {
  const toast = useUI((s) => s.toast);
  if (!toast) return null;

  return (
    <div
      // Above the bottom-centre selection bars, not on top of them: on the
      // board almost every action both changes the selection and announces
      // itself, so the two would collide constantly at the same height.
      className="pointer-events-none fixed inset-x-0 bottom-20 z-[90] flex justify-center px-4 print:hidden"
      role="status"
      aria-live="polite"
    >
      <div className="anim-slide-up rounded-md border border-line-strong bg-surface-2 px-3.5 py-2 text-[12.5px] text-fg shadow-[0_12px_40px_-8px_rgba(0,0,0,0.8)]">
        {toast.message}
      </div>
    </div>
  );
}
