"use client";

/**
 * The people you actually know.
 *
 * WHERE THIS BELONGS — and it is not there yet. It is a component, not a
 * page, and it is drawn for the narrowest column in the app: the chat rail
 * (`src/components/chat/RoomsRail.tsx`), under the direct-message list, where
 * "who can I message" and "how do I get somebody here" are the same question.
 * That rail is 236px wide on a desktop and full width on a phone, so nothing
 * here has a fixed width, every row wraps, and the panel scrolls with its host
 * rather than owning a scroller of its own. It fits a settings pane or /more
 * unchanged. It is mounted in the chat rail, under the direct messages —
 * which is where a connection belongs, and what the join page has always told
 * people it would be. The person picker imports two of the exports below
 * rather than the whole panel, because a dialog you opened to start a message
 * is not the place to be offered Remove.
 *
 * The account rule is asked before any button is drawn. Connecting needs an
 * account with an email on it — an anonymous identity lives in one browser's
 * storage and is gone for good when that is cleared, so a connection made to
 * one is a connection that quietly evaporates. `useAccountState` asks the auth
 * server, and until it has answered this says "checking" rather than guessing.
 * Nobody should press "invite someone" and get a refusal they could have been
 * told about first.
 *
 * The link is shown exactly once. Only its SHA-256 is stored, so no query —
 * not this one, not the founder's — can read a link back out of a row. The
 * list below can say a link exists, when it dies and whether anyone used it,
 * and it cannot say what to paste. That is a real cost of not keeping tokens,
 * and it is said out loud rather than papered over: lost link, new link.
 *
 * `FriendLinks` and `useFriends` are exported because the person picker in the
 * chat rail needs the same two things — the list of who you know, and the one
 * control that fixes an empty one. Two copies of "mint, copy, revoke" is two
 * places for the wording and the refusals to drift apart.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { initialsFor } from "@/lib/auth";
import { useAuth } from "@/lib/auth/store";
import { cn } from "@/lib/cn";
import { formatDate, formatNumber } from "@/lib/format";
import { explainFor } from "@/lib/team/invites";
import {
  MAX_DAYS,
  createFriendLink,
  listFriendLinks,
  listFriends,
  removeFriend,
  revokeFriendLink,
  useAccountState,
  type AccountState,
  type Friend,
  type FriendLink,
  type Outcome,
} from "@/lib/social";
import { useUI } from "@/lib/ui-store";

/* ── Names ──────────────────────────────────────────────── */

/**
 * What to call somebody who has never set a name.
 *
 * A real answer rather than a blank or an id: the connection exists, the
 * person is real, and the row has to say something. It fills itself in the
 * moment they set one — `listFriends` reads the profile every time.
 */
export const NO_NAME = "no name yet";

/**
 * The name they actually set, or null.
 *
 * The trim is the whole reason this is a function rather than a field read.
 * A name of only spaces is truthy, so an avatar that guards on the raw field
 * calls `initialsFor("   ")` — which finds no words and falls back to "YO",
 * the reader's own initials, printed on somebody else's row next to a label
 * that has already given up and said "no name yet". One test, both places.
 */
export const chosenName = (person: {
  displayName: string | null;
}): string | null => person.displayName?.trim() || null;

/**
 * The label for a person, wherever one is needed — a row, a room title. Takes
 * the one field it reads rather than a whole `Friend`, so a caller holding
 * only a name (a profile, a member row) can use the same wording.
 */
export const friendName = (person: { displayName: string | null }): string =>
  chosenName(person) ?? NO_NAME;

/* ── Reading ────────────────────────────────────────────── */

export interface FriendsRead {
  /** Null while the first read is in flight, and while `enabled` is false. */
  outcome: Outcome<Friend[]> | null;
  busy: boolean;
  reload: () => Promise<void>;
}

/**
 * One account's answer, and never the account before it.
 *
 * Two rules, both about who an answer belongs to. Every read takes a
 * generation number, and one that comes back holding an old one is dropped:
 * two presses of "Try again" go out in order and come back in whichever order
 * the network feels like, and the loser used to win. And a change of account
 * clears what is on screen before the new read starts — signing out and back
 * in as somebody else otherwise leaves the last person's friends sitting
 * under the new session, which is the one wrong thing this could show. An
 * empty panel for a moment is not wrong; somebody else's list is.
 *
 * `read` is a module function in every caller, so it is stable and the
 * dependency below never re-fires.
 */
function useAccountRead<T>(
  read: () => Promise<Outcome<T>>,
  enabled: boolean,
): {
  outcome: Outcome<T> | null;
  busy: boolean;
  reload: () => Promise<void>;
} {
  const [outcome, setOutcome] = useState<Outcome<T> | null>(null);
  const [busy, setBusy] = useState(false);
  const generation = useRef(0);

  const reload = useCallback(async () => {
    const mine = ++generation.current;
    setBusy(true);
    const answer = await read();
    // A newer read owns the state now, so this one is an answer to a question
    // nobody is asking any more. `busy` stays true until that newer read
    // lands, which is the truth: something is still in flight.
    if (mine !== generation.current) return;
    setOutcome(answer);
    setBusy(false);
  }, [read]);

  // Who is signed in is the trigger, never the answer: signing out happens in
  // another tab and in Settings, and this list has to follow.
  const who = useAuth((s) => s.identity.id);

  useEffect(() => {
    // Anything already in flight was asked on behalf of the previous account.
    generation.current++;
    // Off the effect body — a synchronous setState here is the cascading
    // render the lint rule is about.
    void Promise.resolve().then(() => {
      setOutcome(null);
      if (enabled) return reload();
      // Nothing will be asked, so nothing is pending.
      setBusy(false);
    });
  }, [enabled, reload, who]);

  return { outcome, busy, reload };
}

/**
 * `listFriends` for a component, in the shape `useInvites` already has.
 *
 * `enabled` is not optional on purpose: it is the account rule, and taking it
 * as an argument means a caller cannot draw this list without having asked
 * the question first. A browser with no database, no session or an anonymous
 * one has nothing to ask about, and asking anyway puts a refusal in the
 * network log on every mount.
 *
 * It answers nothing about whether the question has settled — the caller is
 * already holding `useAccountState` for `enabled`, and asking again here would
 * be a second `getUser` round trip per mount for an answer it has.
 */
export function useFriends(enabled: boolean): FriendsRead {
  return useAccountRead(listFriends, enabled);
}

interface LinksRead {
  outcome: Outcome<FriendLink[]> | null;
  busy: boolean;
  reload: () => Promise<void>;
}

/** Links are only ever drawn where the account rule has already answered
 *  "real", so there is no `enabled` to pass — but the account can still
 *  change underneath one, and these are as account-scoped as the friends. */
function useFriendLinks(): LinksRead {
  return useAccountRead(listFriendLinks, true);
}

/* ── The account rule ───────────────────────────────────── */

/**
 * Why there is no button, and the way out of it.
 *
 * The sentence explaining the rule is `explainAccount`'s, from the library
 * that enforces it — this only adds a lead line saying which button is
 * missing, because "you need an account" reads differently over a friends
 * list than over a Message button. There is no door for "no-database":
 * signing in cannot conjure a database that was never configured.
 */
export function NoAccount({
  lead,
  state,
}: {
  lead: string;
  state: Exclude<AccountState, "real">;
}) {
  const pathname = usePathname();
  const back = encodeURIComponent(pathname || "/library");
  const signIn = `/signin?next=${back}`;
  const signUp = `/signin?new=1&next=${back}`;
  const anon = state === "anonymous";

  return (
    <div className="rounded-md border border-line bg-surface p-3">
      <p className="text-body leading-relaxed text-fg">{lead}</p>
      {/* In this panel's own terms. `explainAccount` is written for team
          invites, and "there is no team to join" is not a smaller truth in
          front of a list of people you know — it is a false one. Same rule,
          same sentence structure, one word of it different, from the one
          place that holds both. */}
      <p className="mt-1.5 text-body leading-relaxed text-fg-muted">
        {explainFor(state, "friend").rule}
      </p>
      {state !== "no-database" && (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          <Link
            href={anon ? signUp : signIn}
            className="rounded-sm bg-accent px-2.5 py-1.5 text-body font-medium text-on-accent transition-[filter] duration-150 hover:brightness-110"
          >
            {anon ? "Add an email" : "Sign in"}
          </Link>
          <Link
            href={anon ? signIn : signUp}
            className="rounded-sm border border-line px-2.5 py-1.5 text-body text-fg-muted transition-colors duration-150 hover:border-line-strong hover:text-fg"
          >
            {anon ? "Sign in as somebody else" : "Create an account"}
          </Link>
        </div>
      )}
    </div>
  );
}

/* ── Links ──────────────────────────────────────────────── */


/** How long a link may live. `MAX_DAYS` is the library's cap, not a guess. */
const LIFETIMES = [1, 7, 30, MAX_DAYS];

const lifetimeLabel = (days: number): string =>
  days === 1 ? "1 day" : `${days} days`;

const usesLine = (link: FriendLink): string => {
  // The common case has exactly one use, where "used 1 of 1 times" is arithmetic
  // nobody asked for.
  if (link.maxUses === 1) return link.uses > 0 ? "used" : "not used yet";
  if (link.maxUses !== null)
    return `used ${formatNumber(link.uses)} of ${formatNumber(link.maxUses)} times`;
  if (link.uses === 0) return "never used";
  return link.uses === 1 ? "used once" : `used ${formatNumber(link.uses)} times`;
};

const lifeLine = (link: FriendLink): string => {
  if (link.status === "revoked")
    return link.revokedAt === null
      ? "revoked"
      : `revoked ${formatDate(link.revokedAt)}`;
  if (link.status === "expired") return `expired ${formatDate(link.expiresAt)}`;
  if (link.status === "used-up") return "no uses left";
  return `expires ${formatDate(link.expiresAt)}`;
};

/**
 * Invite someone: make a link, copy it, watch it die.
 *
 * Draw this only where the account rule has already answered "real" — it does
 * not ask again, and the two places that use it both ask first.
 *
 * One use per link, which is `createFriendLink`'s own default and the reason
 * it has one: a friend link is sent to one person, and a link that still works
 * after they have used it works for whoever they forward it to. Making another
 * is one press, so there is no "how many people" control here — there is a
 * link per person, and the only thing to choose is how long it lives.
 */
export function FriendLinks() {
  const { outcome, busy, reload } = useFriendLinks();
  const notify = useUI((s) => s.notify);

  const [days, setDays] = useState(7);
  const [minting, setMinting] = useState(false);
  const [fresh, setFresh] = useState<{ url: string; expires: number } | null>(
    null,
  );
  const [refusal, setRefusal] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const linkRef = useRef<HTMLInputElement>(null);

  const create = async () => {
    setMinting(true);
    setRefusal(null);
    const made = await createFriendLink(days);
    setMinting(false);
    if (!made.ok) {
      setRefusal(made.reason);
      return;
    }
    setFresh({
      url: made.value,
      // The same arithmetic `createFriendLink` just sent to the database, so
      // this is the date on the row rather than an estimate of it. The row
      // below carries the database's own copy either way.
      expires: Date.now() + days * 86_400_000,
    });
    setCopied(false);
    await reload();
  };

  const copy = async () => {
    if (!fresh) return;
    try {
      await navigator.clipboard.writeText(fresh.url);
    } catch {
      // The clipboard is refused on an insecure origin and inside some
      // embedded browsers. Selecting the text is a copy somebody can finish
      // themselves, which beats a button that silently does nothing. No key is
      // named: this fires wherever the refusal happens, which is every
      // platform, and ⌘C is wrong on most of them.
      linkRef.current?.select();
      notify(
        "This browser wouldn't copy. The link is selected — copy it yourself.",
      );
      return;
    }
    setCopied(true);
    notify("Link copied");
    window.setTimeout(() => setCopied(false), 1600);
  };

  const revoke = async (link: FriendLink) => {
    const done = await revokeFriendLink(link.id);
    if (!done.ok) {
      notify(done.reason);
      return;
    }
    /*
     * The link in the box above cannot be matched to a row — minting hands
     * back a URL, not an id, and only the fingerprint was stored — so after a
     * revocation there is no way to prove the one on screen still works. It
     * goes. A Copy button for a link that may already be dead is exactly the
     * lie this panel exists to avoid, and making another is one press.
     */
    setFresh(null);
    notify("Link revoked");
    await reload();
  };

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => void create()}
          disabled={minting}
          className={cn(
            "rounded-sm px-2.5 py-1.5 text-body font-medium transition-[filter] duration-150",
            minting
              ? "border border-line text-fg-subtle"
              : "bg-accent text-on-accent hover:brightness-110",
          )}
        >
          {minting ? "Making…" : "Invite someone"}
        </button>
        <select
          value={days}
          aria-label="How long the link lives"
          onChange={(e) => setDays(Number(e.target.value))}
          className="rounded-sm border border-line bg-surface px-2 py-1.5 text-body text-fg-muted outline-none focus:border-accent"
        >
          {LIFETIMES.map((d) => (
            <option key={d} value={d} className="bg-surface">
              {lifetimeLabel(d)}
            </option>
          ))}
        </select>
      </div>

      <p className="text-meta leading-relaxed text-fg-subtle">
        A link connects one person — whoever opens it first and is signed in
        with an account. Send another for the next person.
      </p>

      {refusal && (
        <p className="text-body leading-relaxed text-warn">{refusal}</p>
      )}

      {fresh && (
        <div className="rounded-md border border-line bg-surface p-2.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <input
              ref={linkRef}
              value={fresh.url}
              readOnly
              aria-label="The link to send"
              onFocus={(e) => e.currentTarget.select()}
              className="min-w-0 flex-1 rounded-sm border border-line bg-surface-2 px-2 py-1.5 font-mono text-body text-fg outline-none focus:border-accent"
            />
            <button
              type="button"
              onClick={() => void copy()}
              className="flex items-center gap-1.5 rounded-sm border border-line px-2 py-1.5 text-body text-fg-muted transition-colors duration-150 hover:border-line-strong hover:text-fg"
            >
              <Icon name={copied ? "check" : "copy"} size={12} />
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <p className="mt-2 text-meta leading-relaxed text-fg-subtle">
            Works once, expires {formatDate(fresh.expires)}. This is the only
            time it can be shown — only a fingerprint of it is stored, so
            nobody can read it back out. Lose it and make another.
          </p>
        </div>
      )}

      {!outcome ? (
        <p className="text-body text-fg-subtle" role="status">
          Reading your links…
        </p>
      ) : !outcome.ok ? (
        <div className="rounded-md border border-line bg-surface p-2.5">
          <p className="text-body leading-relaxed text-warn">
            {outcome.reason}
          </p>
          {outcome.setup !== true && (
            <button
              type="button"
              onClick={() => void reload()}
              disabled={busy}
              className="mt-2 rounded-sm border border-line px-2 py-1 text-meta text-fg-muted transition-colors duration-150 hover:border-line-strong hover:text-fg disabled:opacity-40"
            >
              {busy ? "Trying…" : "Try again"}
            </button>
          )}
        </div>
      ) : outcome.value.length === 0 ? null : (
        <ul className="flex flex-col">
          {outcome.value.map((link) => (
            <li
              key={link.id}
              className="flex flex-wrap items-center gap-2 border-b border-line py-2 last:border-b-0"
            >
              <Icon
                name={link.status === "live" ? "link" : "lock"}
                size={12}
                className={cn(
                  "shrink-0",
                  link.status === "live" ? "text-fg-muted" : "text-fg-subtle",
                )}
              />
              <span className="min-w-0 flex-1">
                <span className="block text-meta text-fg-muted">
                  Made {formatDate(link.createdAt)}
                </span>
                <span className="block text-meta text-fg-subtle">
                  {lifeLine(link)} · {usesLine(link)}
                </span>
              </span>
              {link.status === "live" ? (
                <button
                  type="button"
                  onClick={() => void revoke(link)}
                  aria-label={`Revoke the link made ${formatDate(link.createdAt)}`}
                  className="rounded-sm border border-line px-2 py-1 text-meta text-fg-muted transition-colors duration-150 hover:border-line-strong hover:text-fg"
                >
                  Revoke
                </button>
              ) : (
                <span className="rounded-sm border border-line px-2 py-1 text-meta text-fg-subtle">
                  {link.status === "used-up" ? "used" : link.status}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {outcome?.ok && outcome.value.length > 0 && (
        <p className="text-meta leading-relaxed text-fg-subtle">
          Every link is listed, dead ones included — whether the one you sent
          was ever opened is as much the question as who can still use it.
        </p>
      )}
    </div>
  );
}

/* ── People ─────────────────────────────────────────────── */

/**
 * What can honestly be said about their account: they have one, they don't, or
 * it is not known.
 *
 * The team page learned this the hard way — an unreadable profile rendered as
 * an affirmative "no account" told a whole real team they were about to
 * evaporate, and an unapplied 0015 profiles policy reads exactly like a
 * browser-only account.
 *
 * `listFriends` now says which it is: null for a profile that did not come
 * back, a boolean for one that did. So the three states are read straight off
 * the field, and the old workaround — inferring "we could not read them" from
 * a missing name — is gone with the lie that made it necessary. It had a cost
 * of its own: a friend who really is anonymous and has never set a name was
 * being reported as unknown.
 */
type Account = "none" | "unknown" | "fine";

function accountOf(friend: Friend): Account {
  if (friend.anonymous === null) return "unknown";
  return friend.anonymous ? "none" : "fine";
}

function Face({ friend }: { friend: Friend }) {
  const name = chosenName(friend);
  return (
    <span
      aria-hidden="true"
      className="grid size-[22px] shrink-0 place-items-center rounded-full border border-line-strong font-mono text-[9px] text-fg-subtle"
    >
      {/* No colour is invented for a real person. The seeded colleagues each
          had one because somebody chose it; a profile row has no such column,
          and a colour picked from a hash of an id is decoration pretending to
          be identity. */}
      {name ? initialsFor(name) : <Icon name="users" size={11} />}
    </span>
  );
}

/**
 * One person, with the way to undo the connection.
 *
 * Remove asks first. It is symmetric — it takes the single shared row, so it
 * removes them from you and you from them — and undoing it needs a fresh link
 * from one of you. That is worth a second press.
 */
function PersonRow({
  friend,
  onRemoved,
}: {
  friend: Friend;
  onRemoved: () => Promise<void>;
}) {
  const notify = useUI((s) => s.notify);
  const [asking, setAsking] = useState(false);
  const [working, setWorking] = useState(false);
  const account = accountOf(friend);

  const remove = async () => {
    setWorking(true);
    const done = await removeFriend(friend.userId);
    setWorking(false);
    setAsking(false);
    if (!done.ok) {
      notify(done.reason);
      return;
    }
    notify(`Removed ${friendName(friend)}`);
    await onRemoved();
  };

  return (
    <li className="flex flex-wrap items-center gap-2 border-b border-line py-2 last:border-b-0">
      <Face friend={friend} />
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "block truncate text-body",
            chosenName(friend) ? "text-fg" : "text-fg-subtle",
          )}
        >
          {friendName(friend)}
        </span>
        <span className="block text-meta text-fg-subtle">
          connected {formatDate(friend.since)}
        </span>
        {/* Said plainly rather than hidden: there is nothing either of you can
            do to get this connection back once their browser is cleared, and
            the person who should know that is the one looking at the row.
            Said only when it has been read, though — see `accountOf`. */}
        {account === "none" && (
          <span className="block text-meta leading-relaxed text-warn">
            no account — this goes when their browser is cleared
          </span>
        )}
        {account === "unknown" && (
          <span className="block text-meta leading-relaxed text-fg-subtle">
            their profile couldn&apos;t be read, so whether they have an
            account is unknown
          </span>
        )}
      </span>

      {asking ? (
        <span className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => void remove()}
            disabled={working}
            className="rounded-sm border border-line px-2 py-1 text-meta text-warn transition-colors duration-150 hover:border-line-strong disabled:opacity-40"
          >
            {working ? "Removing…" : "Remove"}
          </button>
          <button
            type="button"
            onClick={() => setAsking(false)}
            className="rounded-sm px-1.5 py-1 text-meta text-fg-subtle transition-colors duration-150 hover:text-fg"
          >
            Keep
          </button>
        </span>
      ) : (
        <button
          type="button"
          onClick={() => setAsking(true)}
          aria-label={`Remove ${friendName(friend)}`}
          className="shrink-0 rounded-sm border border-line px-2 py-1 text-meta text-fg-muted transition-colors duration-150 hover:border-line-strong hover:text-fg"
        >
          Remove
        </button>
      )}
    </li>
  );
}

/**
 * The panel: who you know, and the link that adds somebody.
 *
 * Nothing is drawn until the account question has an answer. An empty list is
 * a real answer and says so — it is not a spinner that never resolves, and it
 * is not three invented colleagues.
 */
export function Friends({ className }: { className?: string }) {
  const { settled, state } = useAccountState();
  const ready = state === "real";
  const { outcome, busy, reload } = useFriends(ready);

  return (
    <section aria-label="People" className={cn("flex flex-col gap-2.5", className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-meta text-fg-subtle">People</span>
        {/*
         * Somebody opening a link you sent changes this list from another
         * browser, and nothing pushes that here. Rather than poll — a query
         * every few seconds for an event that happens twice a year — there is
         * a button, next to the list it refreshes.
         */}
        {ready && (
          <button
            type="button"
            onClick={() => void reload()}
            disabled={busy}
            aria-label="Check for anyone new"
            title="Check for anyone new"
            className="rounded-xs p-0.5 text-fg-subtle transition-colors duration-150 hover:text-fg disabled:opacity-40"
          >
            <Icon name="refresh" size={12} />
          </button>
        )}
      </div>

      {!settled || state === null ? (
        <p className="text-body text-fg-subtle" role="status">
          Checking this browser…
        </p>
      ) : !ready ? (
        <NoAccount
          lead="Connecting to people needs an account."
          state={state}
        />
      ) : !outcome ? (
        <p className="text-body text-fg-subtle" role="status">
          Reading your people…
        </p>
      ) : !outcome.ok ? (
        <div className="rounded-md border border-line bg-surface p-2.5">
          <p className="text-body leading-relaxed text-warn">
            {outcome.reason}
          </p>
          {outcome.setup !== true && (
            <button
              type="button"
              onClick={() => void reload()}
              disabled={busy}
              className="mt-2 rounded-sm border border-line px-2 py-1 text-meta text-fg-muted transition-colors duration-150 hover:border-line-strong hover:text-fg disabled:opacity-40"
            >
              {busy ? "Trying…" : "Try again"}
            </button>
          )}
        </div>
      ) : (
        <>
          {outcome.value.length === 0 ? (
            <p className="text-body leading-relaxed text-fg-muted">
              You are not connected to anybody yet. Send somebody a link and
              they appear here — and in the list of people you can message.
            </p>
          ) : (
            <ul className="flex flex-col">
              {outcome.value.map((friend) => (
                <PersonRow
                  key={friend.userId}
                  friend={friend}
                  onRemoved={reload}
                />
              ))}
            </ul>
          )}

          {/* Only the sending half. Accepting a link somebody sent *you*
              happens on the join page, which is where the database's own
              refusals get the room to be read. */}
          <FriendLinks />
        </>
      )}
    </section>
  );
}
