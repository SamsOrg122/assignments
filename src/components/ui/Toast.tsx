"use client";

import { useUI } from "@/lib/ui-store";

export function Toast() {
  const toast = useUI((s) => s.toast);
  if (!toast) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-6 z-[90] flex justify-center px-4 print:hidden"
      role="status"
      aria-live="polite"
    >
      <div className="anim-slide-up rounded-md border border-line-strong bg-surface-2 px-3.5 py-2 text-[12.5px] text-fg shadow-[0_12px_40px_-8px_rgba(0,0,0,0.8)]">
        {toast.message}
      </div>
    </div>
  );
}
