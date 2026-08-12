"use client";

/**
 * The browser has stopped saving.
 *
 * Every other warning in this app can be a quiet line in Settings. This one
 * cannot: the work on screen is no longer being written down, and every
 * minute somebody keeps typing is a minute they will lose. So it sits across
 * the top of the app, it does not dismiss, and it says the two things that
 * actually help — take the file now, and here is what to delete.
 *
 * It appears only when a write has genuinely been refused. Not "you are near
 * the limit", not a percentage: a bar that cries wolf is a bar people learn to
 * scroll past, and this is the one they must not.
 */

import { useSyncExternalStore } from "react";
import Link from "next/link";
import {
  noStorageProblem,
  storageIsFull,
  subscribeStorageFull,
} from "@/lib/persistence/versioned";
import { formatBytes } from "@/lib/persistence";
import { Icon } from "@/components/ui/Icon";

export function StorageAlarm() {
  const full = useSyncExternalStore(
    subscribeStorageFull,
    storageIsFull,
    noStorageProblem,
  );
  if (!full) return null;

  return (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-danger/40 bg-danger/[0.09] px-4 py-2 text-[12.5px] text-fg"
    >
      <Icon name="lock" size={13} className="shrink-0 text-danger" />
      <span>
        <strong className="font-medium">This browser is out of room.</strong>{" "}
        Your latest changes are still on screen but are no longer being saved —
        the last write was {formatBytes(full.bytes)} and the browser refused it.
      </span>
      <Link
        href="/settings#keeping"
        className="ml-auto shrink-0 rounded-sm border border-danger/50 px-2 py-1 text-[12px] text-fg transition-colors hover:bg-danger/10"
      >
        Export a backup now
      </Link>
    </div>
  );
}
