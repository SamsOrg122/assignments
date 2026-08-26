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
 * the failure this page exists to avoid, and it never appears. The one
 * refusal that is not about the link at all is caught before it is printed —
 * see `UNFINISHED`.
 *
 * Already a member is a *success*, not a refusal. The database counts no use
 * on that path, so a reload of this page is free — and telling somebody
 * standing inside the workspace that they could not get in is the bug the
 * flag exists to prevent.
 *
 * THE TOKEN DOES NOT LEAVE THIS ORIGIN. It arrives as the path segment (see
 * the page's doc comment for why a path is acceptable), or in the fragment of
 * an older `/join#t_…` link. What it must never do is ride through sign-in in
 * `?next=`: that value reaches `callbackUrl`, which hands it to Google or
 * Microsoft as the OAuth `redirect_to`, so a token in `next` is a token typed
 * into somebody else's URL and written to somebody else's log. It waits in
 * `sessionStorage` instead — this tab, this origin, gone when the tab closes
 * — sign-in is sent to a plain `/join`, and `app/(app)/join/page.tsx` renders
 * this same component to pick it back up.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { TopBar } from "@/components/shell/TopBar";
import { Icon, type IconName } from "@/components/ui/Icon";
import { ROLE_HINTS, ROLE_LABELS, type Role } from "@/lib/team";
import {
  JOIN_PATH,
  acceptInvite,
  tokenFromHash,
  tokenKind,
  useAccountState,
  type LinkKind,
  explainFor,
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
 * A refusal that is not about the link.
 *
 * Migrations in this project are run by hand, so "the app is live and 0015
 * has not been applied yet" is an ordinary state of the world rather than an
 * accident. On such a deployment PostgREST answers every accept with "Could
 * not find the function public.accept_workspace_invite(token) in the schema
 * cache" — and `explainAuthErrorLine`, which the accept helpers run it
 * through, recognises the shape well enough to answer "run supabase/schema.sql
 * in the Supabase SQL editor". Both are true. Both are printed under "Not this
 * link" at somebody who was handed a link a minute ago, has no database and no
 * SQL editor, and now reads that they broke something and should run a script.
 *
 * So both shapes are caught, raw and explained: the person who can fix this is
 * never the person reading it, and the sentence should say so.
 */
const UNFINISHED = [
  // PostgREST, PGRST202, for a function that was never created.
  /could not find the (?:function|table)/i,
  /schema cache/i,
  // Either accept function named at all, however the message is worded.
  /accept_workspace_invite|accept_connection/i,
  // Postgres itself, if the call ever gets past PostgREST's cache.
  /(?:function|relation).*does not exist/i,
  // `explainAuthErrorLine`'s answers for the same two failures. Deliberately
  // matched on the instruction rather than the diagnosis: "run schema.sql" is
  // exactly the half a stranger cannot act on.
  /supabase\/schema\.sql|supabase sql editor/i,
];

const UNFINISHED_SAYS =
  "This deployment hasn't finished being set up: the part of the database that handles invite links isn't there yet. Nothing you did caused this, and the link itself is probably fine. Whoever runs this app has to finish it — tell them, and open the link again once they have.";

/**
 * Where the token waits while somebody signs in. `sessionStorage`, not the
 * URL: see the note at the top of this file for what a token in `?next=` is
 * handed to. Tab-scoped and origin-scoped, which is exactly the reach wanted.
 */
const STASH = "assignments:join:v1";

const stash = (token: string): void => {
  try {
    sessionStorage.setItem(STASH, token);
  } catch {
    // Storage switched off entirely. The link still works for somebody
    // already signed in; what is lost is only the resume, and `/join` says so
    // rather than showing an empty page.
  }
};

const stashed = (): string | null => {
  try {
    const held = sessionStorage.getItem(STASH);
    return held && tokenKind(held) ? held : null;
  } catch {
    return null;
  }
};

const forget = (): void => {
  try {
    sessionStorage.removeItem(STASH);
  } catch {
    // Nothing was ever written, for the same reason.
  }
};

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

/**
 * `token` is the path segment, or null on `/join`, where there is no segment
 * to have and the token is the one being carried back from sign-in.
 */
export function JoinClient({ token: segment }: { token: string | null }) {
  const resuming = segment === null;
  const path = segment === null ? null : fromPathToken(segment);
  const [carried, setCarried] = useState<string | null>(null);
  const [looked, setLooked] = useState(false);
  const { settled, state } = useAccountState();
  const [phase, setPhase] = useState<Phase>({ at: "idle" });

  useEffect(() => {
    if (path) return;
    // The stash is only read where there is no segment at all. A segment that
    // did not parse is a broken link, and answering it with some other link
    // this tab happens to be holding would join a stranger to the wrong thing.
    const found = tokenFromHash(window.location.hash) ?? (resuming ? stashed() : null);
    // Off the effect body: a synchronous setState here is the cascading
    // render the lint rule is about, and nothing is waiting a microtask.
    void Promise.resolve().then(() => {
      setCarried(found);
      setLooked(true);
    });
  }, [path, resuming]);

  const token = path ?? carried;

  /*
   * Held for the tab, so that signing in never has to carry the token in a
   * URL. Written here rather than on the click, because leaving for /signin
   * is a plain link: there is no one event to hang it off, and a keyboard
   * follow or a typed address has to find it on the way back just the same.
   */
  useEffect(() => {
    if (token) stash(token);
  }, [token]);

  // A fragment cannot be read on the server or before mount, so until the
  // effect has run there is no honest answer yet — and "this link is
  // incomplete", flashed for one frame at somebody whose link is fine, is
  // exactly the guessing this page is here to avoid.
  const reading = !path && !looked;
  const kind = token ? tokenKind(token) : null;

  /**
   * Where sign-in comes back to: `/join`, carrying nothing. The token is in
   * the stash by then, and the page there hands it to this component again.
   */
  const signIn = `/signin?next=${encodeURIComponent(JOIN_PATH)}`;
  const signUp = `/signin?new=1&next=${encodeURIComponent(JOIN_PATH)}`;

  const accept = async () => {
    if (!token || !kind) return;
    setPhase({ at: "working" });

    if (kind === "team") {
      const answer = await acceptInvite(token);
      if (answer.ok) forget();
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
    if (answer.ok) forget();
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

  // The account rule, in this link's words, or null when there is nothing to
  // say — no answer yet, or an account that may go ahead.
  const blocked =
    kind && settled && state !== null && state !== "real"
      ? explainFor(state, kind)
      : null;

  const unfinished =
    phase.at === "refused" &&
    UNFINISHED.some((shape) => shape.test(phase.reason));

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
                {resuming ? "There is no link waiting here" : "This link is incomplete"}
              </h1>
              <p className="mt-2 text-[12.5px] leading-relaxed text-fg-muted">
                {resuming
                  ? "This address is where an invite comes back to after you sign in, and nothing is being held for this tab. A link is held only in the tab it was opened in, so signing in somewhere else loses the hold — open the invite again from the message it arrived in."
                  : "The address does not carry an invite. Chat apps and mail clients break long links across lines, so a paste often arrives missing its end — copy the whole thing from the message, or ask whoever sent it for a new one."}
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

          {about && phase.at === "idle" && blocked && (
            <div className={card}>
              <p className="text-[13.5px] leading-relaxed text-fg">
                {blocked.rule}
              </p>

              {blocked.why && (
                <p className="mt-2 text-[12.5px] leading-relaxed text-fg-muted">
                  {blocked.why}
                </p>
              )}

              {state === "anonymous" && (
                <>
                  <p className="mt-2 text-[12.5px] leading-relaxed text-fg-muted">
                    Putting an email on it keeps everything already here — the
                    account is the same one, so nothing has to be moved.
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
                    You land back on this link afterwards.
                  </span>
                </div>
              )}
            </div>
          )}

          {/* One button.

              "working" is drawn whatever the account says, and that is the
              point of the condition rather than an untidiness in it: the
              account is re-read from the auth server while the accept is in
              flight, and a session that expires in that second used to flip
              `state` away from "real" and take the button, the label and
              every other live thing off the screen at once. The answer lands
              a moment later either way — something has to be on screen until
              it does. */}
          {about &&
            (phase.at === "working" ||
              (phase.at === "idle" && state === "real")) && (
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
                  ? phase.landing.name
                    ? phase.landing.already
                      ? `You were already in ${phase.landing.name}.`
                      : `You are in ${phase.landing.name}.`
                    : phase.landing.already
                      ? "You were already in this team."
                      : "You are in the team."
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

              {/* A workspace with no name is the same fact as a person with
                  no name, and was the one sentence on this card that shrugged
                  at it. */}
              {phase.landing.kind === "team" && !phase.landing.name && (
                <p className="mt-2 text-[12.5px] leading-relaxed text-fg-muted">
                  It came back without a name — it may never have been given
                  one. Opening it shows whose it is and what is in it.
                </p>
              )}

              {phase.landing.kind === "friend" && !phase.landing.name && (
                <p className="mt-2 text-[12.5px] leading-relaxed text-fg-muted">
                  They have not set a name yet, so there is nothing to show but
                  the connection itself. It will fill in when they do.
                </p>
              )}

              {phase.landing.kind === "friend" && (
                <p className="mt-2 text-[12.5px] leading-relaxed text-fg-muted">
                  Connections live in chat, in the rail beside your direct
                  messages. That is where this one is now.
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
               *
               * A friend goes to /chat, not /library: /library has nowhere
               * for a connection to appear, so it read as nothing having
               * happened.
               */}
              <p className="mt-3">
                <a
                  href={phase.landing.kind === "team" ? "/team" : "/chat"}
                  className="inline-flex items-center gap-1.5 rounded-sm bg-accent px-3 py-1.5 text-[12.5px] font-medium text-on-accent transition-[filter] duration-150 hover:brightness-110"
                >
                  {phase.landing.kind === "team" ? "Open the team" : "Open chat"}
                  <Icon name="arrow-right" size={12} />
                </a>
              </p>
            </div>
          )}

          {/* Why not. The sentence is the database's own, in its words —
              except the one that is about the deployment rather than the
              link, which nobody standing here can act on as written. */}
          {phase.at === "refused" && (
            <div className={card} role="status" aria-live="polite">
              <p className="label-mono flex items-center gap-1.5">
                <Icon name="x" size={12} className="text-fg-subtle" />
                {unfinished ? "Not ready yet" : "Not this link"}
              </p>
              <p className="mt-2 text-[13.5px] leading-relaxed text-warn">
                {unfinished ? UNFINISHED_SAYS : phase.reason}
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
                {/* The refusal a live session turns into while the accept is
                    in flight says "sign in first" and, without this, offered
                    nowhere to do it. */}
                {blocked && state !== "no-database" && (
                  <Link
                    href={signIn}
                    className="rounded-sm border border-line px-3 py-1.5 text-[12.5px] text-fg-muted transition-colors duration-150 hover:border-line-strong hover:text-fg"
                  >
                    Sign in
                  </Link>
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
