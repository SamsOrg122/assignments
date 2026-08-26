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
 * It hands the chosen person's id back rather than routing itself. The caller
 * owns what happens next — open the conversation, close the rail on a phone —
 * and a picker that navigates on its own can only ever be used once.
 */

import { useMemo, useState } from "react";
import { Dialog, fieldClass } from "@/components/ui/Dialog";
import {
  FriendLinks,
  NO_NAME,
  NoAccount,
  friendName,
  useFriends,
} from "@/components/social/Friends";
import { useChat, type Channel } from "@/lib/chat";
import { initialsFor } from "@/lib/auth";
import { useAccountState, type Friend } from "@/lib/social";
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
        <NoAccount
          lead="Messaging somebody needs an account, and so does adding them."
          state={state}
        />
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
            {people.map((row) => (
              <li key={row.person.userId}>
                <button
                  type="button"
                  onClick={() => choose(row)}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-[var(--ui-row-y)] text-left text-[13px] text-fg-muted transition-colors duration-150 hover:bg-surface-2 hover:text-fg"
                >
                  <span
                    aria-hidden="true"
                    className="grid size-[18px] shrink-0 place-items-center rounded-full border border-line-strong font-mono text-[8.5px] text-fg-subtle"
                  >
                    {/* No colour is invented for a real person: a profile row
                        has no such column, and one derived from a hash of an
                        id is decoration pretending to be identity. */}
                    {row.person.displayName ? (
                      initialsFor(row.person.displayName)
                    ) : (
                      <Icon name="users" size={9} />
                    )}
                  </span>
                  <span
                    className={cn(
                      "truncate",
                      row.person.displayName ? undefined : "text-fg-subtle",
                    )}
                  >
                    {friendName(row.person)}
                  </span>
                  <span className="ml-auto shrink-0 font-mono text-[10px] text-fg-subtle">
                    {row.channel ? "open" : "new"}
                  </span>
                </button>
              </li>
            ))}

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
