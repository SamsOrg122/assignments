"use client";

/**
 * Who to message.
 *
 * `openDM` has been in the store since chat shipped and had exactly one caller
 * in the whole product — a command-palette row. So starting a conversation
 * with a person was a keyboard-only feature: the sidebar printed a "Direct
 * messages" heading over a list you had no pointer way to add to. This is the
 * picker behind the first visible button for it, on the rooms rail.
 *
 * It used to list `HUMANS` — the local user plus the three seeded colleagues
 * from `lib/realtime/mock`, whose own file says that cursors belonging to
 * people who don't exist are the most convincing lie a product can tell about
 * itself. This picker was that lie with a Message button on it: press Mira
 * Chen and you got a conversation that nobody would ever answer. Those three
 * stay where they are demonstrating something — the landing page's frame, via
 * `setSimulatedPeers` — and they are gone from here.
 *
 * What is here instead is the connections table: the people who followed a
 * link you sent, or whose link you followed. With nobody in it, the honest
 * answer is that there is nobody, plus the one control that changes it. With
 * no account, the honest answer is that a connection needs one — asked before
 * a button is drawn rather than after it is pressed.
 *
 * WHAT A ROW PROMISES, AND WHAT IT CAN DO. Nothing under this button reaches
 * anybody. `useChat` is a zustand store in this browser's localStorage behind
 * `createMockChatProvider`; `openDM` files a conversation under the local
 * user's id and the friend's, no part of the chat path touches the database,
 * and the mock provider answers you with a reply it made up. Listing three
 * invented colleagues was a lie with a Message button on it; pressing a real
 * friend is the same lie with a real name on it, which is worse — the name is
 * somebody who will never know they were written to.
 *
 * Real messaging is a separate change with its own tables, so what is done
 * here is the smaller and more urgent thing: the rows say so before they are
 * pressed. Not a disabled button, which teaches nothing and hides the list of
 * people you worked to connect; a sentence over the list and a line on every
 * row, so the promise the row makes is one it can keep — a conversation kept
 * in this browser, waiting for sync.
 *
 * It hands the chosen person's id back rather than routing itself. The caller
 * owns what happens next — open the conversation, close the rail on a phone —
 * and a picker that navigates on its own can only ever be used once.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Dialog, fieldClass } from "@/components/ui/Dialog";
import {
  FriendLinks,
  NO_NAME,
  chosenName,
  friendName,
  useFriends,
} from "@/components/social/Friends";
import { useChat, type Channel } from "@/lib/chat";
import { initialsFor } from "@/lib/auth";
import {
  explainAccount,
  useAccountState,
  type AccountState,
  type Friend,
} from "@/lib/social";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";

/**
 * Room titles this file is allowed to overwrite.
 *
 * The store fixes a DM's name when the channel is made, from
 * `personById(userId).name` — and `personById` only knows the seeded ids, so
 * every conversation with a real account would be filed under "Unknown". Both
 * of these are placeholders one of the two of us wrote for somebody who had
 * not told us their name; a title that is anything else was either their real
 * name or a rename somebody chose, and neither is ours to replace.
 */
const PLACEHOLDER_TITLES = new Set(["Unknown", NO_NAME]);

/* ── The account rule, for a connection ─────────────────── */

/**
 * The two sentences that would otherwise talk about a team.
 *
 * `NoAccount` prints `explainAccount`, and `explainAccount` is written for a
 * team invite: on a deployment with no account database it says "there is no
 * team to join". Under a Message button that is not a smaller truth, it is a
 * different and false one — connecting to somebody needs no team at all, and
 * this dialog cannot offer one either way. `components/join/JoinClient` met
 * the same sentence and answered it by keying the words that differ off the
 * kind of link, in a `STAKE` record that feeds its `explainFor`; this is that
 * record's "friend" row and nothing else, so the picker and the friend link
 * somebody followed to get here say the same thing.
 *
 * It belongs beside `explainAccount` itself, where all three screens could
 * read it from one place — a change to `lib/team/invites` and to both screens
 * already reading it, rather than to this one.
 */
const STAKE = {
  /** With no database, what this deployment has none of. */
  missing: "nobody here to be connected to",
  /** With no email on the account, what it cannot be given. */
  refused: "be connected to anybody",
};

/**
 * Why there is no list, in this dialog's terms.
 *
 * Only the two states whose words depend on what is at stake are written
 * here. Signing in is signing in whatever you were about to do, so that state
 * keeps the shared sentence rather than a copy that can drift away from it.
 */
function explainConnecting(state: Exclude<AccountState, "real">): string {
  if (state === "no-database")
    return `This deployment has no account database, so there is ${STAKE.missing}. Everyone's work stays in their own browser here.`;
  if (state === "anonymous")
    return `This browser is signed in without an account. That identity disappears the moment the browser is cleared and can't be recovered, so it can't ${STAKE.refused}. Add an email to keep it.`;
  return explainAccount(state) ?? "";
}

/**
 * `NoAccount`'s panel with `NoAccount`'s doors, because the doors are the same
 * rule and only the explanation differs — and the explanation is the one part
 * of that component a caller cannot pass in. The join page draws its own for
 * the same reason.
 */
function NoAccountToConnect({
  state,
}: {
  state: Exclude<AccountState, "real">;
}) {
  const pathname = usePathname();
  const back = encodeURIComponent(pathname || "/library");
  const signIn = `/signin?next=${back}`;
  const signUp = `/signin?new=1&next=${back}`;
  const anon = state === "anonymous";

  return (
    <div className="rounded-md border border-line bg-surface p-3">
      <p className="text-[12.5px] leading-relaxed text-fg">
        Messaging somebody needs an account, and so does adding them.
      </p>
      <p className="mt-1.5 text-[12px] leading-relaxed text-fg-muted">
        {explainConnecting(state)}
      </p>
      {/* No door for "no-database": signing in cannot conjure a database that
          was never configured. */}
      {state !== "no-database" && (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          <Link
            href={anon ? signUp : signIn}
            className="rounded-sm bg-accent px-2.5 py-1.5 text-[12px] font-medium text-on-accent transition-[filter] duration-150 hover:brightness-110"
          >
            {anon ? "Add an email" : "Sign in"}
          </Link>
          <Link
            href={anon ? signIn : signUp}
            className="rounded-sm border border-line px-2.5 py-1.5 text-[12px] text-fg-muted transition-colors duration-150 hover:border-line-strong hover:text-fg"
          >
            {anon ? "Sign in as somebody else" : "Create an account"}
          </Link>
        </div>
      )}
    </div>
  );
}

export function PeoplePicker({
  onPick,
  onClose,
}: {
  onPick: (personId: string) => void;
  onClose: () => void;
}) {
  const channels = useChat((s) => s.channels);
  const openDM = useChat((s) => s.openDM);
  const updateChannel = useChat((s) => s.updateChannel);

  const { settled, state } = useAccountState();
  const ready = state === "real";
  const { outcome, busy, reload } = useFriends(ready);

  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);

  const friends = outcome?.ok ? outcome.value : null;

  const people = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (friends ?? [])
      .filter((person) => !needle || friendName(person).toLowerCase().includes(needle))
      .map((person) => ({
        person,
        /*
         * `openDM` returns the conversation you already have with someone
         * rather than making a second one, so half these rows open history
         * and half start something. Saying which before the click is the
         * difference between a picker and a slot machine.
         */
        channel: channels.find(
          (c) => c.kind === "dm" && c.memberIds.includes(person.userId),
        ),
      }));
  }, [query, channels, friends]);

  const choose = ({
    person,
    channel,
  }: {
    person: Friend;
    channel: Channel | undefined;
  }) => {
    const id = openDM(person.userId);
    const name = friendName(person);
    // A brand-new room, or one still carrying a placeholder because they had
    // not set a name when you last opened it.
    if (!channel || (channel.name !== name && PLACEHOLDER_TITLES.has(channel.name)))
      updateChannel(id, { name });
    onPick(person.userId);
    onClose();
  };

  return (
    <Dialog
      title="Message someone"
      description="The people you're connected to. Opens your conversation with them, or starts one if there isn't one yet."
      onClose={onClose}
      width={420}
    >
      {!settled || state === null ? (
        <p className="text-[12.5px] text-fg-subtle" role="status">
          Checking this browser…
        </p>
      ) : !ready ? (
        <NoAccountToConnect state={state} />
      ) : !outcome ? (
        <p className="text-[12.5px] text-fg-subtle" role="status">
          Reading your people…
        </p>
      ) : !outcome.ok ? (
        <div className="rounded-md border border-line bg-surface p-2.5">
          <p className="text-[12.5px] leading-relaxed text-warn">
            {outcome.reason}
          </p>
          {outcome.setup !== true && (
            <button
              type="button"
              onClick={() => void reload()}
              disabled={busy}
              className="mt-2 rounded-sm border border-line px-2 py-1 text-[11.5px] text-fg-muted transition-colors duration-150 hover:border-line-strong hover:text-fg disabled:opacity-40"
            >
              {busy ? "Trying…" : "Try again"}
            </button>
          )}
        </div>
      ) : outcome.value.length === 0 ? (
        /* Nobody, and the thing that fixes it — not a search field over an
           empty list, which asks somebody to type a name that cannot be
           there. */
        <div className="flex flex-col gap-3">
          <p className="text-[12.5px] leading-relaxed text-fg-muted">
            You are not connected to anybody yet, so there is nobody to
            message. Send somebody a link. When they open it, they appear
            here.
          </p>
          <FriendLinks />
        </div>
      ) : (
        <>
          {/* Before the first press, not after it. Everything below writes to
              this browser and stops there, and somebody typing a real friend's
              name into a picker has every reason to assume otherwise. */}
          <div className="mb-3 rounded-md border border-line bg-surface p-2.5">
            <p className="text-[12px] leading-relaxed text-fg-muted">
              Messages don&apos;t reach other people yet. A conversation you
              open here is kept in this browser: they aren&apos;t told about it
              and can&apos;t read it. Nothing is sent until chat sync ships.
            </p>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              // Type three letters and press Enter. Without this the field is
              // decoration for anyone who does not reach for the mouse.
              if (people[0]) choose(people[0]);
            }}
          >
            <input
              value={query}
              placeholder="Find a person"
              aria-label="Find a person"
              onChange={(e) => setQuery(e.target.value)}
              className={fieldClass}
            />
          </form>

          <ul className="mt-3 flex max-h-[46vh] flex-col gap-0.5 overflow-y-auto">
            {people.map((row) => {
              const name = chosenName(row.person);
              return (
                <li key={row.person.userId}>
                  <button
                    type="button"
                    onClick={() => choose(row)}
                    aria-label={`Message ${friendName(row.person)} — kept in this browser, not sent to them`}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-[var(--ui-row-y)] text-left text-[13px] text-fg-muted transition-colors duration-150 hover:bg-surface-2 hover:text-fg"
                  >
                    <span
                      aria-hidden="true"
                      className="grid size-[18px] shrink-0 place-items-center rounded-full border border-line-strong font-mono text-[8.5px] text-fg-subtle"
                    >
                      {/* No colour is invented for a real person: a profile
                          row has no such column, and one derived from a hash
                          of an id is decoration pretending to be identity. */}
                      {name ? (
                        initialsFor(name)
                      ) : (
                        <Icon name="users" size={9} />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span
                        className={cn(
                          "block truncate",
                          name ? undefined : "text-fg-subtle",
                        )}
                      >
                        {friendName(row.person)}
                      </span>
                      {/* The note above says it once for the list; a row says
                          it again because a row is what gets pressed. */}
                      <span className="block text-[10.5px] text-fg-subtle">
                        kept in this browser
                      </span>
                    </span>
                    <span className="shrink-0 font-mono text-[10px] text-fg-subtle">
                      {row.channel ? "open" : "new"}
                    </span>
                  </button>
                </li>
              );
            })}

            {people.length === 0 && (
              <li className="px-2 py-2 text-[12px] leading-relaxed text-fg-subtle">
                Nobody here by that name.
              </li>
            )}
          </ul>

          {/* The way to add somebody, folded away: this dialog's job is
              picking, and a list of links above the list of people would put
              the rarer thing first. */}
          <div className="mt-3 border-t border-line pt-3">
            {adding ? (
              <FriendLinks />
            ) : (
              <button
                type="button"
                onClick={() => setAdding(true)}
                className="flex items-center gap-2 text-[12.5px] text-fg-muted transition-colors duration-150 hover:text-fg"
              >
                <Icon name="plus" size={12} className="text-fg-subtle" />
                Connect somebody new
              </button>
            )}
          </div>
        </>
      )}
    </Dialog>
  );
}
