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
      /*
       * The one rule this bar draws, and it stays.
       *
       * A sticky heading does not earn a line — what stops content showing
       * through a sticky heading is its bg-canvas. This is not that. It is
       * permanent furniture the page scrolls past, which is the ceiling case,
       * and its ground is deliberately bg-canvas/85 under a blur, so content
       * *does* show through. The line is the only thing telling you where the
       * page stops and the chrome starts while a document slides underneath
       * it. Make the ground opaque and this border should go with it.
       */
      className={cn(
        "sticky top-0 z-20 flex h-12 shrink-0 items-center gap-2 px-3 sm:px-4",
        "border-b border-line bg-canvas/85 backdrop-blur-md print:hidden",
      )}
    >
      {/*
        * The toggle, at every width and in both directions.
        *
        * It used to take `lg:hidden` while the sidebar was open, and the
        * sidebar's own X is `lg:hidden` always — so on a desktop the sidebar
        * could be opened with a pointer and closed only with ⌘B. Somebody who
        * had never found that shortcut had no way back to a full-width
        * document once they had opened the column.
        */}
      <button
        type="button"
        onClick={toggleSidebar}
        className="rounded-sm p-1.5 text-fg-subtle transition-colors duration-150 hover:text-fg"
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
