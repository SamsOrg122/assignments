"use client";

/**
 * Following a link — the only screen in the app a stranger sees first.
 *
 * It answers in one order, and the order is the design: what this link is,
 * then whether this browser may use it and why not, then one button, then
 * where you landed and the way in. Nothing is asked before the first
 * question is answered, and nothing happens on load — a link that accepted
 * itself would be spent by a back button, and would give somebody a
 * membership before telling them what it was for.
 *
 * Every refusal has its own sentence, and every one of those sentences is
 * written in the migration, next to the check that produces it — expired,
 * revoked, used up, your own link, no such link. They are passed through
 * verbatim rather than reworded here: two places deciding what "used up"
 * means to a reader is how they come to disagree. "Something went wrong" is
 * the failure this page exists to avoid, and it never appears.
 *
 * Already a member is a *success*, not a refusal. The database counts no use
 * on that path, so a reload of this page is free — and telling somebody
 * standing inside the workspace that they could not get in is the bug the
 * flag exists to prevent.
 *
 * The token normally arrives as the path segment (see the page's doc comment
 * for why that is acceptable). It is also read from the fragment, because
 * `linkFor` in `lib/team/invites` mints `/join#t_…` — a link made there and
 * opened here still works, and the sign-in round trip rewrites it into the
 * path form, which is the one that survives a navigation.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { TopBar } from "@/components/shell/TopBar";
import { Icon, type IconName } from "@/components/ui/Icon";
import { ROLE_HINTS, ROLE_LABELS, type Role } from "@/lib/team";
import {
  JOIN_PATH,
  acceptInvite,
  explainAccount,
  tokenFromHash,
  tokenKind,
  useAccountState,
  type LinkKind,
} from "@/lib/team/invites";
import { acceptFriend } from "@/lib/social";

/**
 * What each kind of link is for, said before anything is asked.
 *
 * `blind` is the awkward part told straight: neither the team's name nor the
 * sender's is knowable until the link is used, because no query can look a
 * link up by its token. That is deliberate — an invite gets forwarded, and a
 * link that answered "who is this from" to whoever held it would tell a
 * group chat exactly what it had been handed.
 */
const ABOUT: Record<
  LinkKind,
  { icon: IconName; eyebrow: string; title: string; what: string; blind: string; go: string }
> = {
  team: {
    icon: "users",
    eyebrow: "Team invite",
    title: "Somebody has invited you into their team",
    what: "A team here is one shared workspace: the projects, the files and the chat sit inside it, and everyone in it works on the same ones. Following this puts your account in that workspace, with the role the link was made with.",
    blind: "Which team, and who sent it, appear the moment you are in. A link cannot be looked up without being used — on purpose, so that an invite pasted into a group chat tells the people who read it nothing.",
    go: "Join the team",
  },
  friend: {
    icon: "link",
    eyebrow: "Friend link",
    title: "Somebody wants to be connected to you",
    what: "Connecting is mutual and it is small: from then on the two of you can see each other's name instead of an id. There is no request to approve and no follower — and either of you can undo it later, which removes it for both.",
    blind: "Whose link this is appears when you accept. A link cannot be looked up without being used, so holding one tells you nothing about the person who made it.",
    go: "Connect",
  },
};

/**
 * Why an account is needed, for the two states where the short sentence from
 * `explainAccount` is not the whole answer.
 *
 * `explainAccount` stays the one place that says *what* the rule is — this
 * page has room to say why, which a line next to a button does not.
 */
const WHY = {
  "signed-out":
    "A team place, or a connection to a person, has to hang off an identity that still exists tomorrow. Signing in takes a moment and this link is not lost by it: you come back to this page afterwards.",
  anonymous:
    "This browser was signed in the moment you first opened the app, so your work had somewhere to live. That identity exists only here. There is no address on it, so clearing this browser — or opening the app on your phone — loses it for good, and nothing can bring it back. A place in a team that quietly evaporates with a browser is worse than none.",
} as const;

type Landing =
  | { kind: "team"; name: string | null; role: Role | null; already: boolean }
  | { kind: "friend"; name: string | null; already: boolean };

type Phase =
  | { at: "idle" }
  | { at: "working" }
  | { at: "landed"; landing: Landing }
  | { at: "refused"; reason: string; setup: boolean };

/** The path segment, if it is one of ours. Next has already percent-decoded
 *  it, and a token is base64url, so anything that still needs decoding was
 *  never a token. */
const fromPathToken = (raw: string): string | null => {
  const trimmed = raw.trim();
  return tokenKind(trimmed) ? trimmed : null;
};

const card = "rounded-md border border-line bg-surface p-4";

export function JoinClient({ token: segment }: { token: string }) {
  const path = fromPathToken(segment);
  const [fragment, setFragment] = useState<string | null>(null);
  const [looked, setLooked] = useState(false);
  const { settled, state } = useAccountState();
  const [phase, setPhase] = useState<Phase>({ at: "idle" });

  useEffect(() => {
    if (path) return;
    const carried = tokenFromHash(window.location.hash);
    // Off the effect body: a synchronous setState here is the cascading
    // render the lint rule is about, and nothing is waiting a microtask.
    void Promise.resolve().then(() => {
      setFragment(carried);
      setLooked(true);
    });
  }, [path]);

  const token = path ?? fragment;
  // A fragment cannot be read on the server or before mount, so until the
  // effect has run there is no honest answer yet — and "this link is
  // incomplete", flashed for one frame at somebody whose link is fine, is
  // exactly the guessing this page is here to avoid.
  const reading = !path && !looked;
  const kind = token ? tokenKind(token) : null;

  /**
   * Where sign-in sends people back to — always the path form, even when the
   * token arrived in a fragment. A fragment would survive the round trip too,
   * but only by being carried inside `next`, and this is the address that
   * works when it is pasted, bookmarked or reached with the back button.
   */
  const backHere = token
    ? `${JOIN_PATH}/${encodeURIComponent(token)}`
    : JOIN_PATH;
  const signIn = `/signin?next=${encodeURIComponent(backHere)}`;
  const signUp = `/signin?new=1&next=${encodeURIComponent(backHere)}`;

  const accept = async () => {
    if (!token || !kind) return;
    setPhase({ at: "working" });

    if (kind === "team") {
      const answer = await acceptInvite(token);
      setPhase(
        answer.ok
          ? {
              at: "landed",
              landing: {
                kind: "team",
                name: answer.value.name,
                role: answer.value.role,
                already: answer.value.already,
              },
            }
          : { at: "refused", reason: answer.reason, setup: answer.setup === true },
      );
      return;
    }

    const answer = await acceptFriend(token);
    setPhase(
      answer.ok
        ? {
            at: "landed",
            landing: {
              kind: "friend",
              name: answer.value.name,
              already: answer.value.already,
            },
          }
        : { at: "refused", reason: answer.reason, setup: answer.setup === true },
    );
  };

  const about = kind ? ABOUT[kind] : null;

  return (
    <>
      <TopBar>
        <span className="text-[13px] font-medium text-fg">Joining</span>
      </TopBar>

      <main className="flex min-h-0 flex-1 justify-center overflow-y-auto p-4 sm:p-6">
        <div className="flex w-full max-w-[520px] flex-col gap-3 py-2 sm:py-6">
          {/* What this is. Kept on screen while the account question is
              answered and while a refusal is read — "this link has expired"
              means nothing without the sentence saying what it was for. */}
          {about && phase.at !== "landed" && (
            <div className={card}>
              <p className="label-mono flex items-center gap-1.5">
                <Icon name={about.icon} size={12} className="text-fg-subtle" />
                {about.eyebrow}
              </p>
              <h1 className="mt-2 text-[16px] leading-snug font-medium text-fg">
                {about.title}
              </h1>
              <p className="mt-2 text-[12.5px] leading-relaxed text-fg-muted">
                {about.what}
              </p>
              <p className="mt-2 text-[12px] leading-relaxed text-fg-subtle">
                {about.blind}
              </p>
            </div>
          )}

          {/* A link this page cannot read at all. Its own answer, because
              "expired" and "you pasted half of it" are different problems
              with different fixes. */}
          {!about && reading && (
            <p className="text-[12.5px] text-fg-subtle" role="status">
              Reading the link…
            </p>
          )}

          {!about && !reading && (
            <div className={card}>
              <p className="label-mono">Link</p>
              <h1 className="mt-2 text-[16px] leading-snug font-medium text-fg">
                This link is incomplete
              </h1>
              <p className="mt-2 text-[12.5px] leading-relaxed text-fg-muted">
                The address does not carry an invite. Chat apps and mail
                clients break long links across lines, so a paste often arrives
                missing its end — copy the whole thing from the message, or ask
                whoever sent it for a new one.
              </p>
              <p className="mt-3">
                <Link
                  href="/library"
                  className="text-[12.5px] text-fg-muted underline underline-offset-2 transition-colors hover:text-fg"
                >
                  Back to your work
                </Link>
              </p>
            </div>
          )}

          {/* The account question, asked before the button is drawn rather
              than answered by a refusal after it is pressed. */}
          {about && phase.at === "idle" && (!settled || state === null) && (
            <p className="text-[12.5px] text-fg-subtle" role="status">
              Checking this browser…
            </p>
          )}

          {about &&
            phase.at === "idle" &&
            settled &&
            state !== null &&
            state !== "real" && (
              <div className={card}>
                <p className="text-[13.5px] leading-relaxed text-fg">
                  {explainAccount(state)}
                </p>

                {state !== "no-database" && (
                  <p className="mt-2 text-[12.5px] leading-relaxed text-fg-muted">
                    {WHY[state]}
                  </p>
                )}

                {state === "anonymous" && (
                  <>
                    <p className="mt-2 text-[12.5px] leading-relaxed text-fg-muted">
                      Putting an email on it keeps everything already here —
                      the account is the same one, so nothing has to be moved.
                    </p>
                    {/* The trap this page would otherwise walk somebody into:
                        with email confirmation on, the address sits pending
                        until the link is clicked, so the account still has no
                        email and this page says the same thing again. */}
                    <p className="mt-2 text-[12px] leading-relaxed text-fg-subtle">
                      If you have just signed up: the address is not on the
                      account until you click the link in the email. Until you
                      do, this page will keep saying this.
                    </p>
                  </>
                )}

                {state !== "no-database" && (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Link
                      href={state === "anonymous" ? signUp : signIn}
                      className="rounded-sm bg-accent px-3 py-1.5 text-[12.5px] font-medium text-on-accent transition-[filter] duration-150 hover:brightness-110"
                    >
                      {state === "anonymous"
                        ? "Add an email to this browser"
                        : "Sign in"}
                    </Link>
                    <Link
                      href={state === "anonymous" ? signIn : signUp}
                      className="rounded-sm border border-line px-3 py-1.5 text-[12.5px] text-fg-muted transition-colors duration-150 hover:border-line-strong hover:text-fg"
                    >
                      {state === "anonymous"
                        ? "Sign in as somebody else"
                        : "Create an account"}
                    </Link>
                    <span className="text-[11.5px] text-fg-subtle">
                      You come back here afterwards.
                    </span>
                  </div>
                )}
              </div>
            )}

          {/* One button. */}
          {about && (phase.at === "idle" || phase.at === "working") && state === "real" && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void accept()}
                disabled={phase.at === "working"}
                className="rounded-sm bg-accent px-3 py-1.5 text-[12.5px] font-medium text-on-accent transition-[filter] duration-150 hover:brightness-110 disabled:opacity-40"
              >
                {phase.at === "working" ? "One moment…" : about.go}
              </button>
              <Link
                href="/library"
                className="text-[12px] text-fg-subtle underline underline-offset-2 transition-colors hover:text-fg"
              >
                Not now
              </Link>
            </div>
          )}

          {/* Where you landed. */}
          {phase.at === "landed" && (
            <div className={card} role="status" aria-live="polite">
              <p className="label-mono flex items-center gap-1.5">
                <Icon name="check" size={12} className="text-fg-subtle" />
                {phase.landing.already ? "Already done" : "Done"}
              </p>
              <h1 className="mt-2 text-[16px] leading-snug font-medium text-fg">
                {phase.landing.kind === "team"
                  ? phase.landing.already
                    ? `You were already in ${phase.landing.name ?? "this team"}.`
                    : `You are in ${phase.landing.name ?? "the team"}.`
                  : phase.landing.name
                    ? phase.landing.already
                      ? `You were already connected to ${phase.landing.name}.`
                      : `You are connected to ${phase.landing.name}.`
                    : phase.landing.already
                      ? "You were already connected."
                      : "You are connected."}
              </h1>

              {phase.landing.kind === "team" && phase.landing.role && (
                <p className="mt-2 text-[12.5px] leading-relaxed text-fg-muted">
                  {phase.landing.already ? "You are " : "You joined as "}
                  {ROLE_LABELS[phase.landing.role]}
                  {". "}
                  {ROLE_HINTS[phase.landing.role]}.
                </p>
              )}

              {phase.landing.kind === "friend" && !phase.landing.name && (
                <p className="mt-2 text-[12.5px] leading-relaxed text-fg-muted">
                  They have not set a name yet, so there is nothing to show but
                  the connection itself. It will fill in when they do.
                </p>
              )}

              {phase.landing.already && (
                <p className="mt-2 text-[12px] leading-relaxed text-fg-subtle">
                  Nothing changed, and the link was not spent — opening it
                  twice costs nothing.
                </p>
              )}

              {/*
               * A plain anchor, not a router push. Workspace lookups are
               * memoised per tab in `lib/db/supabase`, and the tab that
               * followed this link did those lookups before the membership
               * existed — a client navigation would arrive at a page still
               * holding the old answer. A load rebuilds all of it.
               */}
              <p className="mt-3">
                <a
                  href={phase.landing.kind === "team" ? "/team" : "/library"}
                  className="inline-flex items-center gap-1.5 rounded-sm bg-accent px-3 py-1.5 text-[12.5px] font-medium text-on-accent transition-[filter] duration-150 hover:brightness-110"
                >
                  {phase.landing.kind === "team"
                    ? "Open the team"
                    : "Back to your work"}
                  <Icon name="arrow-right" size={12} />
                </a>
              </p>
            </div>
          )}

          {/* Why not. The sentence is the database's own, in its words. */}
          {phase.at === "refused" && (
            <div className={card} role="status" aria-live="polite">
              <p className="label-mono flex items-center gap-1.5">
                <Icon name="x" size={12} className="text-fg-subtle" />
                Not this link
              </p>
              <p className="mt-2 text-[13.5px] leading-relaxed text-warn">
                {phase.reason}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {!phase.setup && (
                  <button
                    type="button"
                    onClick={() => void accept()}
                    className="rounded-sm border border-line px-3 py-1.5 text-[12.5px] text-fg-muted transition-colors duration-150 hover:border-line-strong hover:text-fg"
                  >
                    Try again
                  </button>
                )}
                <Link
                  href="/library"
                  className="text-[12.5px] text-fg-subtle underline underline-offset-2 transition-colors hover:text-fg"
                >
                  Back to your work
                </Link>
              </div>
            </div>
          )}
        </div>
      </main>
    </>
  );
}
