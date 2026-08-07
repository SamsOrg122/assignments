"use client";

/**
 * The one moment we ask.
 *
 * Not on first load — nobody can answer "where should this live" before they
 * have made anything. It waits until there is work worth keeping, asks once,
 * and takes either answer as final. `choiceMade` is set by both buttons,
 * including the one that changes nothing, because "I'll stay here" is a
 * decision and a prompt that reappears after it is a nag.
 *
 * In the page rather than floating over it: the app already has three
 * bottom-anchored surfaces (selection bars, voice, toasts), and a fourth
 * competing for the same corner is how a good prompt becomes an obstacle.
 */

import Link from "next/link";
import { useAuth } from "@/lib/auth/store";
import { useProjects } from "@/lib/store";
import { SEED_TS } from "@/lib/seed";
import { accountsAvailable } from "@/lib/auth";
import { Icon } from "@/components/ui/Icon";

export function KeepPrompt() {
  const choiceMade = useAuth((s) => s.choiceMade);
  const keepOnDevice = useAuth((s) => s.keepOnDevice);
  const projects = useProjects((s) => s.projects);

  // "Worth keeping" means they have actually done something: a project of
  // their own, or an edit to one of the samples.
  const theirs = projects.some((p) => p.updatedAt > SEED_TS);
  if (choiceMade || !theirs) return null;

  return (
    <div className="anim-slide-up mb-5 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-line bg-surface px-3.5 py-3">
      <Icon name="check" size={13} className="shrink-0 text-fg-subtle" />
      <p className="min-w-0 flex-1 text-[13px] leading-snug text-fg-muted">
        <span className="text-fg">This is saved in your browser.</span> That
        works offline and nobody else can read it — but it won&apos;t follow you
        to another machine
        {accountsAvailable() ? ", unless you make an account" : ""}.
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
