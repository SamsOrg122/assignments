"use client";

/**
 * The other ways in.
 *
 * Two behaviours, and the difference is which screen this is on.
 *
 * In Settings (`panel`) it renders nothing unless the project actually has a
 * provider switched on. An absent option there means absent, and a dead
 * button in a control panel is just noise.
 *
 * On the sign-in page (`stage`) Google and Microsoft are always drawn. That
 * is a deliberate reversal of what this file used to do, and it needs saying
 * why: the door is the one screen where the *shape* of the choice is the
 * design. A sign-in page that is a lone email field until somebody flips a
 * switch in a dashboard does not look configurable, it looks broken — and it
 * changes shape under people the day it is turned on.
 *
 * The honesty that rule was protecting is kept where it belongs: pressing a
 * provider the project has not enabled yet says so in a sentence, rather
 * than handing the browser to Supabase and letting it land on an error page
 * nobody can read. Nothing else changes when it *is* enabled — the same
 * button starts working, which is the point.
 *
 * The SAML row still appears only once the typed address matches a domain
 * with a connection registered, because that one really is addressed to
 * particular people and to nobody else.
 */

import { useState } from "react";
import { useAuthOptions } from "@/lib/db/use-config";
import {
  availableProviders,
  signInWithProvider,
  signInWithSSO,
  type ProviderChoice,
} from "@/lib/auth/providers";
import { Icon } from "@/components/ui/Icon";
import { BrandMark } from "./BrandMark";
import { cn } from "@/lib/cn";

/**
 * The two the door always shows.
 *
 * Not "every provider we know how to talk to" — a column of six ways in is a
 * decision nobody wants to make at a login screen. These are the two accounts
 * the people this is for already have.
 */
const DOOR = ["google", "azure"];

const DOOR_LABELS: Record<string, string> = {
  google: "Google",
  azure: "Microsoft",
};

export function SingleSignOn({
  email,
  destination = "/library",
  variant = "panel",
}: {
  /** What has been typed so far, for the SAML domain match. */
  email: string;
  destination?: string;
  /**
   * `stage` is the sign-in page's dark treatment, where these buttons sit
   * *above* the password fields rather than below them — on a screen whose
   * whole job is getting in, the one-click way in should not be the thing
   * you scroll past the typing to find.
   */
  variant?: "panel" | "stage";
}) {
  const options = useAuthOptions();
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const enabled = availableProviders();
  const at = email.indexOf("@");
  const domain = at < 0 ? "" : email.slice(at + 1).trim().toLowerCase();
  const sso = options.ssoDomains.includes(domain) ? domain : null;

  const stage = variant === "stage";

  /*
   * What the door offers, in a fixed order.
   *
   * Google then Microsoft, always, whether or not they answer yet — so the
   * page looks the same before and after somebody enables them, and anything
   * else the project has switched on follows behind. Off the stage the list
   * is only what genuinely works.
   */
  const providers: Array<ProviderChoice & { ready: boolean }> = stage
    ? [
        ...DOOR.map((id) => ({
          id,
          label: DOOR_LABELS[id],
          ready: enabled.some((p) => p.id === id),
        })),
        ...enabled
          .filter((p) => !DOOR.includes(p.id))
          .map((p) => ({ ...p, ready: true })),
      ]
    : enabled.map((p) => ({ ...p, ready: true }));

  if (!providers.length && !sso) return null;

  const go = async (label: string, run: () => Promise<{ ok: boolean; reason?: string }>) => {
    setBusy(label);
    setProblem(null);
    const result = await run();
    // On success the browser is already leaving, so there is nothing to reset.
    if (!result.ok) {
      setBusy(null);
      setProblem(result.reason ?? "That didn't work.");
    }
  };

  /* The rule reads as "or do it the other way", so which side of the buttons
     it belongs on follows from which side the alternative is. On the stage
     the buttons come first and the typing is the alternative; in the panel
     it is the other way round. */
  const rule = (
    <div className="flex items-center gap-2">
      <span
        className="h-px flex-1"
        style={{ background: stage ? "var(--pad-edge)" : "var(--color-line)" }}
      />
      <span
        className="font-mono text-[10px]"
        style={{ color: stage ? "var(--pad-ink-3)" : "var(--color-fg-subtle)" }}
      >
        or
      </span>
      <span
        className="h-px flex-1"
        style={{ background: stage ? "var(--pad-edge)" : "var(--color-line)" }}
      />
    </div>
  );

  return (
    <div className={stage ? "" : "mt-3.5"}>
      {!stage && rule}

      <div className={cn("flex flex-col", stage ? "gap-2" : "mt-2.5 gap-1.5")}>
        {sso && (
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => go("sso", () => signInWithSSO(sso, destination))}
            className={cn(
              "flex items-center justify-center gap-2 disabled:opacity-60",
              stage
                ? "pad-chip px-4 py-2.5 text-[13px]"
                : "rounded-sm border border-accent/50 bg-accent-soft px-2.5 py-1.5 text-[12.5px] text-accent transition-colors duration-150 hover:border-accent",
            )}
          >
            <Icon name="lock" size={stage ? 13 : 11} />
            {busy === "sso" ? "Taking you there…" : `Continue with ${sso}`}
          </button>
        )}

        {/*
          * Equal weight, and one filled block on the screen.
          *
          * Google used to be a filled block here on the argument that it is
          * the button rather than one of the buttons. That held while it was
          * the only prominent thing above the fold — but "Sign in" at the
          * bottom of the form is filled too, and two identical white blocks
          * on one small panel is not emphasis, it is a question about which
          * one is the real one. So the ways in are quiet blocks of the same
          * weight, and the single loud thing on the page stays the button
          * that submits what you typed.
          */}
        {providers.map((provider) => {
          return (
            <button
              key={provider.id}
              type="button"
              disabled={busy !== null}
              onClick={() =>
                go(provider.id, () =>
                  provider.ready
                    ? signInWithProvider(provider.id, destination)
                    : // Not a failure to apologise for — a fact about this
                      // deployment, said in the words somebody needs to know
                      // what to do next.
                      Promise.resolve({
                        ok: false as const,
                        reason: `${provider.label} sign-in isn't switched on for this site yet. Use your email and password below.`,
                      }),
                )
              }
              className={cn(
                "flex items-center justify-center gap-2.5 disabled:opacity-60",
                stage
                  ? "pad-chip px-4 py-2.5 text-[13px]"
                  : "rounded-sm border border-line px-2.5 py-1.5 text-[12.5px] text-fg-muted transition-colors duration-150 hover:border-line-strong hover:text-fg",
              )}
            >
              <BrandMark id={provider.id} size={stage ? 16 : 14} />
              {busy === provider.id
                ? "Taking you there…"
                : `Continue with ${provider.label}`}
            </button>
          );
        })}
      </div>

      {problem && (
        <p className="mt-2 text-[12px] leading-relaxed text-danger" role="alert">
          {problem}
        </p>
      )}

      {stage && <div className="mt-6">{rule}</div>}
    </div>
  );
}
