"use client";

import { useUI } from "@/lib/ui-store";
import { cn } from "@/lib/cn";
import { Icon } from "@/components/ui/Icon";

export function TopBar({
  children,
  right,
}: {
  children: React.ReactNode;
  right?: React.ReactNode;
}) {
  const { sidebarOpen, toggleSidebar, openPalette } = useUI();

  return (
    <header
      className={cn(
        "sticky top-0 z-20 flex h-12 shrink-0 items-center gap-2 px-3 sm:px-4",
        "border-b border-line bg-canvas/85 backdrop-blur-md print:hidden",
      )}
    >
      <button
        type="button"
        onClick={toggleSidebar}
        className={cn(
          "rounded-sm p-1.5 text-fg-subtle transition-colors duration-150 hover:text-fg",
          sidebarOpen && "lg:hidden",
        )}
        aria-label={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
      >
        <Icon name="panel-left" size={15} />
      </button>

      <div className="flex min-w-0 flex-1 items-center gap-2">{children}</div>

      <div className="flex shrink-0 items-center gap-2">
        {right}
        <button
          type="button"
          onClick={() => openPalette()}
          className="rounded-sm p-1.5 text-fg-subtle transition-colors duration-150 hover:text-fg sm:hidden"
          aria-label="Open command palette"
        >
          <Icon name="search" size={15} />
        </button>
      </div>
    </header>
  );
}
