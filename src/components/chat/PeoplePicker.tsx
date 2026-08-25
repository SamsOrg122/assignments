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
 * It hands the chosen person's id back rather than routing itself. The caller
 * owns what happens next — open the conversation, close the rail on a phone —
 * and a picker that navigates on its own can only ever be used once.
 */

import { useMemo, useState } from "react";
import { Dialog, fieldClass } from "@/components/ui/Dialog";
import { HUMANS, useChat } from "@/lib/chat";
import { LOCAL_USER } from "@/lib/realtime";

export function PeoplePicker({
  onPick,
  onClose,
}: {
  onPick: (personId: string) => void;
  onClose: () => void;
}) {
  const channels = useChat((s) => s.channels);
  const [query, setQuery] = useState("");

  const people = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return HUMANS.filter((person) => person.id !== LOCAL_USER.id)
      .filter((person) => !needle || person.name.toLowerCase().includes(needle))
      .map((person) => ({
        person,
        /*
         * `openDM` returns the conversation you already have with someone
         * rather than making a second one, so half these rows open history
         * and half start something. Saying which before the click is the
         * difference between a picker and a slot machine.
         */
        existing: channels.some(
          (c) => c.kind === "dm" && c.memberIds.includes(person.id),
        ),
      }));
  }, [query, channels]);

  const choose = (personId: string) => {
    onPick(personId);
    onClose();
  };

  return (
    <Dialog
      title="Message someone"
      description="Opens your conversation with them, or starts one if there isn't one yet."
      onClose={onClose}
      width={420}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          // Type three letters and press Enter. Without this the field is
          // decoration for anyone who does not reach for the mouse.
          if (people[0]) choose(people[0].person.id);
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
        {people.map(({ person, existing }) => (
          <li key={person.id}>
            <button
              type="button"
              onClick={() => choose(person.id)}
              className="flex w-full items-center gap-2 rounded-md px-2 py-[var(--ui-row-y)] text-left text-[13px] text-fg-muted transition-colors duration-150 hover:bg-surface-2 hover:text-fg"
            >
              <span
                aria-hidden="true"
                className="grid size-[18px] shrink-0 place-items-center rounded-full font-mono text-[8.5px]"
                style={{
                  background: `${person.color}22`,
                  color: person.color,
                  boxShadow: `inset 0 0 0 1px ${person.color}55`,
                }}
              >
                {person.initials}
              </span>
              <span className="truncate">{person.name}</span>
              <span className="ml-auto shrink-0 font-mono text-[10px] text-fg-subtle">
                {existing ? "open" : "new"}
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
    </Dialog>
  );
}
