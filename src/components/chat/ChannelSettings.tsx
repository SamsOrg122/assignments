"use client";

/**
 * Channel settings.
 *
 * Name, purpose, who's in it, how people get in, and how to get out. All in
 * one panel because these are one decision — "what is this channel, and who
 * is it for" — and splitting them across three menus is how a group ends up
 * with the wrong people in it.
 *
 * The passcode section is deliberately blunt about what it does. See the note
 * on `Channel.passcodeHash`: it is a latch, not a lock, and a UI that implies
 * otherwise is worse than no UI at all.
 */

import { useState } from "react";
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
  const rotateInvite = useChat((s) => s.rotateInvite);
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

  const inviteLink = channel.invite
    ? `${typeof window === "undefined" ? "" : window.location.origin}/chat/${channel.id}?join=${channel.invite.token}`
    : null;

  return (
    <Dialog
      title={isDM ? "Conversation" : `#${channel.name}`}
      description={
        isDM
          ? "Direct messages have no settings beyond what's here."
          : "Who this channel is for, and how people get into it."
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
        <ul className="flex flex-col rounded-sm border border-line">
          <li className="flex items-center gap-2.5 border-b border-line px-2.5 py-2 last:border-b-0">
            <Avatar id={LOCAL_USER.id} />
            <span className="flex-1 text-[12.5px] text-fg">
              {LOCAL_USER.name}
            </span>
            <span className="text-[11px] text-fg-subtle">you</span>
          </li>
          {members.map((id) => (
            <li
              key={id}
              data-member={id}
              className="flex items-center gap-2.5 border-b border-line px-2.5 py-2 last:border-b-0"
            >
              <Avatar id={id} />
              <span className="flex-1 truncate text-[12.5px] text-fg-muted">
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
            <p className="text-[12px] text-fg-subtle" role="status">
              Reading your people…
            </p>
          ) : !friends.ok ? (
            // A deployment with no database is a fact about where this is
            // running, not something that went wrong here — it reads plainly.
            // Anything else did go wrong, and gets the warning colour.
            <p
              className={cn(
                "text-[12px] leading-relaxed",
                friends.setup ? "text-fg-subtle" : "text-warn",
              )}
            >
              {friends.reason}
            </p>
          ) : candidates.length === 0 ? (
            <p className="text-[12px] leading-relaxed text-fg-subtle">
              {friends.value.length === 0
                ? "You're not connected to anybody yet, so there's nobody to add. Connect somebody first, from Message someone on the chat rail. The invite link below is a different door: it lets whoever opens it into this channel, without connecting the two of you."
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
                    className="flex items-center gap-1.5 rounded-sm border border-line px-2 py-1 text-[12px] text-fg-muted transition-colors hover:border-line-strong hover:text-fg"
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
          <Row
            label="Invite link"
            hint="Anyone with the link — and the passcode, if there is one — can join. Rotating it breaks every link already shared."
          >
            {inviteLink ? (
              <div className="flex items-center gap-2 rounded-sm border border-line bg-surface-2 px-2.5 py-2">
                <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-fg-muted">
                  {inviteLink}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard?.writeText(inviteLink);
                    notify("Invite link copied");
                  }}
                  className="shrink-0 rounded-xs border border-line px-2 py-1 text-[11px] text-fg-muted transition-colors hover:text-fg"
                >
                  Copy
                </button>
                <button
                  type="button"
                  onClick={() => {
                    rotateInvite(channel.id);
                    notify("Old links no longer work");
                  }}
                  className="shrink-0 rounded-xs border border-line px-2 py-1 text-[11px] text-fg-muted transition-colors hover:text-fg"
                >
                  Rotate
                </button>
              </div>
            ) : (
              <Button
                onClick={() => {
                  rotateInvite(channel.id);
                  notify("Invite link created");
                }}
              >
                Create an invite link
              </Button>
            )}
          </Row>

          {/* ── The latch ── */}
          <div className="mb-4 rounded-md border border-line bg-surface-2 p-3.5">
            <div className="flex items-start gap-2.5">
              <Icon
                name="focus"
                size={13}
                className={cn("mt-0.5 shrink-0", closed ? "text-accent" : "text-fg-subtle")}
              />
              <div className="min-w-0 flex-1">
                <p className="text-[12.5px] font-medium text-fg">
                  {closed ? "Closed group" : "Open to the workspace"}
                </p>
                <p className="mt-1 text-[11.5px] leading-relaxed text-fg-muted text-pretty">
                  {closed
                    ? "People need the passcode the first time they open this channel."
                    : "Anyone in the workspace can open this channel."}
                </p>

                {/*
                  The honest caveat, in the product rather than in a comment.
                  Promising privacy we can't deliver would be the worst thing
                  on this screen.
                */}
                <p className="mt-2 flex items-start gap-1.5 rounded-sm border border-warn/25 bg-warn/10 px-2 py-1.5 text-[11px] leading-relaxed text-warn">
                  <Icon name="focus" size={10} className="mt-0.5 shrink-0" />
                  A passcode keeps this group out of the way, not out of reach.
                  Messages aren&apos;t encrypted, and the code is checked in
                  your browser — anyone who can read the workspace data can
                  read this channel. Real access control needs the server.
                </p>

                <div className="mt-3 flex flex-wrap items-center gap-2">
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
                  <p className="mt-1.5 text-[11px] text-fg-subtle">
                    At least four characters.
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
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
      className="grid size-6 shrink-0 place-items-center rounded-full font-mono text-[9px] font-medium"
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
