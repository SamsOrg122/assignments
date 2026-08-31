"use client";

/**
 * Channel settings.
 *
 * Name, purpose, who's in it, and how to get out. All in one panel because
 * these are one decision — "what is this channel, and who is it for" — and
 * splitting them across three menus is how a group ends up with the wrong
 * people in it.
 *
 * The passcode section is deliberately blunt about what it does. See the note
 * on `Channel.passcodeHash`: it is a latch, not a lock, and a UI that implies
 * otherwise is worse than no UI at all. The invite link that used to sit two
 * rows above it was the opposite kind of control, and it is gone — the note
 * where it stood says why.
 *
 * NOTHING BORDERED INSIDE SOMETHING BORDERED. A dialog is a layer floating
 * above the page, which is one of the three things a border is allowed to
 * mean — so the dialog keeps its edge and everything inside it gives one up.
 * That was the member list's box and the rule under every row in it, the
 * latch's card, and the honest-caveat box nested a third deep inside both of
 * those. The inputs keep their borders and always will: a field is the shape
 * your text goes inside, and that is the first of the three cases.
 *
 * What replaces them is space and ink. The latch is a region, so it gets a
 * heading and `--space-5` of air; the caveat is the most important sentence
 * on this panel and is now carried by warn ink at reading size instead of by
 * a tinted box around 11px type, which is more of it and not less.
 */

import { useState } from "react";
import Link from "next/link";
import { personById, useChat, type Channel } from "@/lib/chat";
import { friendName } from "@/components/social/Friends";
import { LOCAL_USER } from "@/lib/realtime";
import { usePeople } from "@/lib/team";
import { useUI } from "@/lib/ui-store";
import { Button, Dialog, Row, fieldClass } from "@/components/ui/Dialog";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";

export function ChannelSettings({
  channel,
  onClose,
}: {
  channel: Channel;
  onClose: () => void;
}) {
  const update = useChat((s) => s.updateChannel);
  const setPasscode = useChat((s) => s.setPasscode);
  const addMembers = useChat((s) => s.addMembers);
  const removeMember = useChat((s) => s.removeMember);
  const leaveChannel = useChat((s) => s.leaveChannel);
  const setArchived = useChat((s) => s.setArchived);
  const notify = useUI((s) => s.notify);

  const [name, setName] = useState(channel.name);
  const [topic, setTopic] = useState(channel.topic ?? "");
  const [description, setDescription] = useState(channel.description ?? "");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const isDM = channel.kind === "dm";
  const closed = channel.access === "closed" && Boolean(channel.passcodeHash);
  const members = channel.memberIds.filter((id) => id !== LOCAL_USER.id);
  /*
   * Who there is to add: the people you are actually connected to, minus the
   * ones already in the room. This offered Mira Chen, Dev Raman and Ana Silva
   * — the simulated colleagues from `lib/realtime/mock` — so the one control
   * on this panel for growing a channel could only ever add somebody who
   * doesn't exist. An empty answer is said out loud below rather than hiding
   * the control, because "there is nobody yet" is the thing worth knowing.
   */
  const { friends } = usePeople();
  const candidates = (friends?.ok ? friends.value : []).filter(
    (person) => !channel.memberIds.includes(person.userId),
  );

  return (
    <Dialog
      title={isDM ? "Conversation" : `#${channel.name}`}
      description={
        isDM
          ? "Direct messages have no settings beyond what's here."
          : "Who this channel is for, and who is in it."
      }
      onClose={onClose}
      width={560}
      footer={<Button variant="primary" onClick={onClose}>Done</Button>}
    >
      {!isDM && (
        <>
          <Row label="Name">
            <input
              value={name}
              aria-label="Channel name"
              onChange={(e) => setName(e.target.value)}
              onBlur={() => {
                const slug = name
                  .toLowerCase()
                  .replace(/[^a-z0-9]+/g, "-")
                  .replace(/^-|-$/g, "");
                if (slug && slug !== channel.name) update(channel.id, { name: slug });
                setName(slug || channel.name);
              }}
              className={fieldClass}
            />
          </Row>

          <Row label="Topic" hint="One line, shown next to the name.">
            <input
              value={topic}
              aria-label="Channel topic"
              onChange={(e) => setTopic(e.target.value)}
              onBlur={() => update(channel.id, { topic: topic.trim() })}
              className={fieldClass}
            />
          </Row>

          <Row
            label="Purpose"
            hint="Shown on the join screen, so someone can tell whether they're in the right place before they ask."
          >
            <textarea
              value={description}
              rows={2}
              aria-label="Channel purpose"
              onChange={(e) => setDescription(e.target.value)}
              onBlur={() => update(channel.id, { description: description.trim() })}
              className={cn(fieldClass, "resize-none leading-relaxed")}
            />
          </Row>
        </>
      )}

      {/* ── Members ── */}
      <Row label={`Members · ${channel.memberIds.length}`}>
        {/* A row in a list is not an object you pick up — it already has the
            list to belong to. Alignment is what makes these read as one thing:
            every avatar, name and control starts at the same x. */}
        <ul className="flex flex-col gap-(--space-2)">
          <li className="flex items-center gap-2.5">
            <Avatar id={LOCAL_USER.id} />
            <span className="flex-1 text-body text-fg">{LOCAL_USER.name}</span>
            <span className="text-meta text-fg-subtle">you</span>
          </li>
          {members.map((id) => (
            <li
              key={id}
              data-member={id}
              className="flex items-center gap-2.5"
            >
              <Avatar id={id} />
              <span className="flex-1 truncate text-body text-fg-muted">
                {personById(id).name}
              </span>
              {!isDM && (
                <button
                  type="button"
                  onClick={() => removeMember(channel.id, id)}
                  aria-label={`Remove ${personById(id).name}`}
                  className="rounded-xs p-1 text-fg-subtle transition-colors hover:text-danger"
                >
                  <Icon name="x" size={10} />
                </button>
              )}
            </li>
          ))}
        </ul>
      </Row>

      {!isDM && (
        <Row
          label="Add someone"
          hint="The people you're connected to. Adding somebody puts them in this list in your browser — it doesn't tell them, and they can't read the channel until chat syncs."
        >
          {!friends ? (
            <p className="text-body text-fg-subtle" role="status">
              Reading your people…
            </p>
          ) : !friends.ok ? (
            // A deployment with no database is a fact about where this is
            // running, not something that went wrong here — it reads plainly.
            // Anything else did go wrong, and gets the warning colour.
            <p
              className={cn(
                "text-body",
                friends.setup ? "text-fg-subtle" : "text-warn",
              )}
            >
              {friends.reason}
            </p>
          ) : candidates.length === 0 ? (
            <p className="text-body text-fg-subtle">
              {friends.value.length === 0
                ? "You're not connected to anybody yet, so there's nobody to add. Connect somebody first, from Message someone on the chat rail — that link connects the two of you, which is what puts a name in this list."
                : "Everybody you're connected to is already in this channel."}
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {candidates.map((person) => {
                const name = friendName(person);
                return (
                  <button
                    key={person.userId}
                    type="button"
                    onClick={() => {
                      addMembers(channel.id, [person.userId]);
                      notify(`${name} added to #${channel.name} — in this browser`);
                    }}
                    className="flex items-center gap-1.5 rounded-sm bg-surface-2 px-2 py-1 text-body text-fg-muted transition-colors hover:text-fg"
                  >
                    <Icon name="plus" size={10} />
                    {name}
                  </button>
                );
              })}
            </div>
          )}
        </Row>
      )}

      {!isDM && (
        <>
          {/*
            WHY THERE IS PROSE HERE AND NOT A LINK.

            This row held an "Invite link" of the shape /chat/<id>?join=<token>
            with Copy and Rotate beside it, under a hint promising that anyone
            holding it could join. Nothing in `src` reads a `join` parameter —
            the token was checked nowhere, by anything, ever — and the other
            half of that address is just as empty: a channel is a row in this
            browser's localStorage, so the id it names does not exist on the
            machine that opens it. It was an inert control sitting two rows
            above the one paragraph on this panel that tells the truth.

            Rewording it was the other option, and there is no true sentence
            that leaves it worth pressing: "copy a link that opens nothing" is
            a button that documents its own uselessness. So it is gone, and
            what stands here is the door that does open. That door is the
            workspace, not this room, and the two are deliberately not blurred
            together — a workspace invitation really does let somebody in, and
            it lets them into the workspace. Saying it grants this channel
            would be the same lie in a new place.
          */}
          <Row label="Getting somebody in">
            <p className="text-body text-fg-subtle">
              There is no link to this channel to send. It is kept in your
              browser, so this room&apos;s address opens nothing on anybody
              else&apos;s machine. Adding people above is the only way in, and
              it reaches them once chat syncs.
            </p>
            <p className="mt-(--space-2) text-body text-fg-subtle">
              The invitation that does work is for the workspace:{" "}
              <Link href="/team#join" className="underline hover:text-fg">
                members and invites
              </Link>{" "}
              mints a link that genuinely lets somebody in. It puts them in the
              workspace, not in this channel — a different door, and the only
              one that opens from outside today.
            </p>
          </Row>

          {/* ── The latch ── */}
          <div className="mt-(--space-5) mb-(--space-5)">
            <div className="flex items-start gap-2.5">
              <Icon
                name="focus"
                size={13}
                className={cn("mt-0.5 shrink-0", closed ? "text-accent" : "text-fg-subtle")}
              />
              <div className="min-w-0 flex-1">
                <p className="text-object text-fg">
                  {closed ? "Closed group" : "Open to the workspace"}
                </p>
                <p className="mt-(--space-1) text-body text-fg-muted text-pretty">
                  {closed
                    ? "People need the passcode the first time they open this channel."
                    : "Anyone in the workspace can open this channel."}
                </p>

                {/*
                  The honest caveat, in the product rather than in a comment.
                  Promising privacy we can't deliver would be the worst thing
                  on this screen.
                */}
                {/* The caveat carries itself: warn ink at reading size, with
                    the glyph beside it. It used to be 11px inside a tinted,
                    bordered box nested two containers deep — a treatment that
                    made the one true sentence on the panel the smallest thing
                    on it. No fill is doing the work here, which is as well:
                    none of surface, surface-2 or surface-3 clears 3:1. */}
                <p className="mt-(--space-3) flex items-start gap-1.5 text-body text-warn">
                  <Icon name="focus" size={10} className="mt-0.5 shrink-0" />
                  A passcode keeps this group out of the way, not out of reach.
                  Messages aren&apos;t encrypted, and the code is checked in
                  your browser — anyone who can read the workspace data can
                  read this channel. Real access control needs the server.
                </p>

                <div className="mt-(--space-3) flex flex-wrap items-center gap-2">
                  <input
                    type="password"
                    value={code}
                    placeholder={closed ? "New passcode" : "Set a passcode"}
                    aria-label="Channel passcode"
                    onChange={(e) => setCode(e.target.value)}
                    className={cn(fieldClass, "max-w-[200px] flex-1")}
                  />
                  <Button
                    disabled={code.trim().length < 4 || busy}
                    onClick={async () => {
                      setBusy(true);
                      await setPasscode(channel.id, code.trim());
                      setBusy(false);
                      setCode("");
                      notify(`#${channel.name} is now a closed group`);
                    }}
                  >
                    {closed ? "Change" : "Close this group"}
                  </Button>
                  {closed && (
                    <Button
                      onClick={async () => {
                        await setPasscode(channel.id, null);
                        notify(`#${channel.name} is open again`);
                      }}
                    >
                      Remove
                    </Button>
                  )}
                </div>
                {code.trim().length > 0 && code.trim().length < 4 && (
                  <p className="mt-(--space-2) text-body text-fg-subtle">
                    At least four characters.
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="mt-(--space-5) flex flex-wrap items-center gap-2">
            <Button
              onClick={() => {
                setArchived(channel.id, !channel.archived);
                notify(
                  channel.archived
                    ? `#${channel.name} restored`
                    : `#${channel.name} archived — history kept`,
                );
              }}
            >
              {channel.archived ? "Restore" : "Archive"}
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                leaveChannel(channel.id);
                onClose();
                notify(`You left #${channel.name}`);
              }}
            >
              Leave channel
            </Button>
          </div>
        </>
      )}
    </Dialog>
  );
}

function Avatar({ id }: { id: string }) {
  const person = personById(id);
  return (
    <span
      aria-hidden="true"
      className="grid size-6 shrink-0 place-items-center rounded-full text-meta font-medium"
      style={{
        background: `${person.color}22`,
        color: person.color,
        boxShadow: `inset 0 0 0 1px ${person.color}55`,
      }}
    >
      {person.initials}
    </span>
  );
}
