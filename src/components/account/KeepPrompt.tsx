"use client";

/**
 * The one moment we ask where work should live.
 *
 * Not on first load — nobody can answer that before they have made anything.
 * It waits until there is work worth keeping, asks once, and takes either
 * answer as final. `choiceMade` is set by both buttons, including the one that
 * changes nothing, because "I'll stay here" is a decision and a prompt that
 * reappears after it is a nag.
 *
 * Two shapes, one condition. The wide row sits at the top of the Library; the
 * compact block sits in the sidebar, so the question is present while you are
 * actually working rather than only on the way in. Both are *in the layout* —
 * the app already has three bottom-anchored surfaces (selection bars, voice,
 * toasts), and a floating fourth is how a fair question becomes an obstacle.
 *
 * The lead is the cross-browser point, because that is the one thing local
 * storage genuinely cannot do and therefore the only honest reason to sign up.
 */

import Link from "next/link";
import { useAuth } from "@/lib/auth/store";
import { useProjects } from "@/lib/store";
import { SEED_TS } from "@/lib/seed";
import { accountsAvailable } from "@/lib/auth";
import { Icon } from "@/components/ui/Icon";

/** Whether there is anything of the user's own yet. */
function useHasOwnWork(): boolean {
  const projects = useProjects((s) => s.projects);
  return projects.some((p) => p.updatedAt > SEED_TS);
}

export function KeepPrompt() {
  const choiceMade = useAuth((s) => s.choiceMade);
  const keepOnDevice = useAuth((s) => s.keepOnDevice);
  const theirs = useHasOwnWork();

  if (choiceMade || !theirs) return null;

  return (
    <div className="anim-slide-up mb-5 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-line bg-surface px-3.5 py-3">
      <Icon name="users" size={13} className="shrink-0 text-fg-subtle" />
      <p className="min-w-0 flex-1 text-[13px] leading-snug text-fg-muted">
        <span className="text-fg">
          This is saved in this browser only.
        </span>{" "}
        Open Assignments on another computer — or in a different browser here —
        and none of it will be there. An account is what carries it across.
      </p>
      <span className="flex shrink-0 items-center gap-2">
        <Link
          href="/settings#account"
          className="rounded-sm bg-accent px-2.5 py-1.5 text-[12.5px] font-medium text-on-accent transition-[filter] duration-150 hover:brightness-110"
        >
          See the options
        </Link>
        <button
          type="button"
          onClick={keepOnDevice}
          className="rounded-sm border border-line px-2.5 py-1.5 text-[12.5px] text-fg-muted transition-colors duration-150 hover:border-line-strong hover:text-fg"
        >
          Keep it here
        </button>
      </span>
    </div>
  );
}

/**
 * The sidebar version. Same question, same one-time behaviour, sized for a
 * column — so someone who is deep in a document still gets asked once instead
 * of only ever seeing it on the Library page they may not return to.
 */
export function KeepPromptCompact() {
  const choiceMade = useAuth((s) => s.choiceMade);
  const keepOnDevice = useAuth((s) => s.keepOnDevice);
  const theirs = useHasOwnWork();

  if (choiceMade || !theirs) return null;

  return (
    <div className="anim-slide-up mx-2.5 mb-2 rounded-md border border-line bg-surface p-2.5">
      <p className="flex items-center gap-1.5 text-[11.5px] font-medium text-fg">
        <Icon name="users" size={11} className="shrink-0 text-fg-subtle" />
        Only in this browser
      </p>
      <p className="mt-1.5 text-[11.5px] leading-relaxed text-fg-muted">
        Your work won&apos;t be here on another computer or in another browser.
        {accountsAvailable()
          ? " An account carries it across."
          : " An account will carry it across."}
      </p>
      {/* Stacked, not side by side: the sidebar is resizable down to a width
          where two buttons in a row each wrap onto three lines. */}
      <Link
        href="/settings#account"
        className="mt-2.5 block rounded-sm bg-accent px-2 py-1.5 text-center text-[11.5px] font-medium text-on-accent transition-[filter] duration-150 hover:brightness-110"
      >
        See the options
      </Link>
      <button
        type="button"
        onClick={keepOnDevice}
        aria-label="Keep my work in this browser and stop asking"
        className="mt-1.5 w-full rounded-sm px-2 py-1 text-[11.5px] text-fg-subtle transition-colors duration-150 hover:text-fg"
      >
        Keep it here
      </button>
    </div>
  );
}
