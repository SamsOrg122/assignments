"use client";

/**
 * The composer.
 *
 * Two things it does that a chat box normally can't: `@` mentions a
 * collaborator, and `#` attaches a *live* Library project — the reason chat
 * belongs in this app rather than beside it.
 *
 * ONE EDGE, NOT TWO. The strip used to draw `border-t` across the page and the
 * input inside it drew its own border 10px lower — two hairlines doing one
 * job, and both of them drawn twice whenever a thread was open. The strip's
 * line is the one that goes. That direction and not the reverse: an input has
 * to look like an input, the border is its affordance rather than decoration,
 * and the input is full width so it is already the composer's edge.
 *
 * The send button loses the border it wore while disabled, because nothing
 * bordered sits inside something bordered. Its filled accent when there is
 * something to send is the one accent fill on this screen and it stays — that
 * is the fill answering "what do I press to start something", which is the
 * only question a filled accent is allowed to answer.
 */

import { useMemo, useRef, useState } from "react";
import {
  AI_USER_ID,
  mentionName,
  useChat,
  type MessageAttachment,
  type ProjectAttachment,
} from "@/lib/chat";
import { chosenName } from "@/components/social/Friends";
import { LOCAL_USER } from "@/lib/realtime";
import { usePeople } from "@/lib/team";
import { useProjects } from "@/lib/store";
import { KINDS } from "@/lib/kinds";
import { fuzzyMatch } from "@/lib/fuzzy";
import { cn } from "@/lib/cn";
import { Icon } from "@/components/ui/Icon";
import {
  AttachButton,
  AttachmentChips,
  DropZone,
  useFileAttachments,
} from "./attachments";

type Trigger = { kind: "mention" | "project"; query: string; from: number };

export function Composer({
  channelId,
  parentId,
  placeholder,
}: {
  channelId: string;
  parentId?: string;
  placeholder: string;
}) {
  const send = useChat((s) => s.send);
  const setTyping = useChat((s) => s.setTyping);
  const memberIds = useChat(
    (s) => s.channels.find((c) => c.id === channelId)?.memberIds,
  );
  const { friends } = usePeople();
  const projects = useProjects((s) => s.projects);

  const [body, setBody] = useState("");
  const [attachments, setAttachments] = useState<ProjectAttachment[]>([]);
  const files = useFileAttachments();
  const [trigger, setTrigger] = useState<Trigger | null>(null);
  const [active, setActive] = useState(0);
  const ref = useRef<HTMLTextAreaElement>(null);
  const typingUntil = useRef(0);

  /**
   * Everybody there is to mention, before the query narrows it.
   *
   * The people in this room first, then the people you are connected to who
   * aren't. It used to be `HUMANS` — you and the three simulated colleagues
   * from `lib/realtime/mock` — which offered three people who don't exist and
   * left out the one person actually in the room, so the mention list in a DM
   * with a real friend was the only list in the app that couldn't name them.
   *
   * Kept separate from `suggestions` so the empty case can tell "nobody to
   * mention" from "nobody by that name", which are different problems with
   * different answers.
   */
  const mentionable = useMemo(() => {
    const here = (memberIds ?? []).filter(
      // The assistant answers everything said in its own room; @-ing it there
      // is a mention that changes nothing.
      (id) => id !== LOCAL_USER.id && id !== AI_USER_ID,
    );
    const inRoom = here.flatMap((id) => {
      const label = mentionName(id);
      return label ? [{ id, label, hint: "in this channel" }] : [];
    });
    const connected = (friends?.ok ? friends.value : []).flatMap((person) => {
      const label = chosenName(person);
      return label && !here.includes(person.userId)
        ? [{ id: person.userId, label, hint: "connected" }]
        : [];
    });
    return [...inRoom, ...connected];
    // `friends` earns its place here twice: it is half the list, and its
    // arrival is also the moment `mentionName` can start naming the other
    // half, since both come from the same read.
  }, [memberIds, friends]);

  const suggestions = useMemo(() => {
    if (!trigger) return [];
    if (trigger.kind === "mention")
      return mentionable.filter(
        (o) => !trigger.query || fuzzyMatch(trigger.query, o.label),
      );
    return projects
      .map((p) => ({
        id: p.id,
        label: p.name,
        hint: KINDS[p.kind].label,
        score: trigger.query ? (fuzzyMatch(trigger.query, p.name)?.score ?? -1) : 0,
      }))
      .filter((o) => o.score >= 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 6);
  }, [trigger, projects, mentionable]);

  /** Re-read the trigger from the text on every change, so it can't go stale. */
  const scan = (value: string, caret: number) => {
    const before = value.slice(0, caret);
    const match = /(^|\s)([@#])([\w-]*)$/.exec(before);
    if (!match) return setTrigger(null);
    setTrigger({
      kind: match[2] === "@" ? "mention" : "project",
      query: match[3],
      from: caret - match[3].length - 1,
    });
    setActive(0);
  };

  const applySuggestion = (option: { id: string; label: string }) => {
    if (!trigger) return;
    const caret = ref.current?.selectionStart ?? body.length;
    const head = body.slice(0, trigger.from);
    const tail = body.slice(caret);

    if (trigger.kind === "mention") {
      const next = `${head}@${option.label.split(" ")[0]} ${tail}`;
      setBody(next);
    } else {
      // A project reference becomes an attachment, not inline noise.
      setBody(`${head}${tail}`.replace(/\s{2,}/g, " "));
      setAttachments((a) =>
        a.some((x) => x.projectId === option.id)
          ? a
          : [...a, { kind: "project", projectId: option.id }],
      );
    }
    setTrigger(null);
    requestAnimationFrame(() => ref.current?.focus());
  };

  const all: MessageAttachment[] = [...attachments, ...files.files];

  const submit = () => {
    if (!body.trim() && all.length === 0) return;
    send(channelId, body, {
      parentId,
      attachments: all.length ? all : undefined,
    });
    setBody("");
    setAttachments([]);
    files.clear();
    setTrigger(null);
  };

  return (
    <DropZone
      onFiles={(list) => void files.add(list)}
      className="p-(--space-3)"
      hint="Drop to attach to this message"
    >
      {/* A mention with nothing to offer says so. Silence reads as a broken
          autocomplete, and the gap it leaves is what used to be filled with
          people who don't exist. */}
      {trigger && (suggestions.length > 0 || trigger.kind === "mention") && (
        <div className="anim-pop absolute bottom-full left-3 z-30 mb-1.5 w-[280px] overflow-hidden rounded-md border border-line-strong bg-surface p-1 shadow-[0_20px_60px_-12px_rgba(0,0,0,0.6)]">
          {suggestions.length === 0 && (
            <p className="px-2 py-1.5 text-body text-fg-subtle">
              {mentionable.length > 0
                ? "Nobody here by that name."
                : !friends
                  ? "Reading your people…"
                  : friends.ok
                    ? "Nobody to mention yet. Whoever is in this channel shows up here, and so do the people you're connected to."
                    : friends.reason}
            </p>
          )}
          {suggestions.map((option, i) => (
            <button
              key={option.id}
              type="button"
              onMouseMove={() => setActive(i)}
              onClick={() => applySuggestion(option)}
              className={cn(
                "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left transition-colors duration-100",
                i === active ? "bg-surface-2" : "hover:bg-surface-2/60",
              )}
            >
              <span className="truncate text-body text-fg">{option.label}</span>
              <span className="ml-auto shrink-0 text-meta text-fg-subtle">
                {option.hint}
              </span>
            </button>
          ))}
        </div>
      )}

      {attachments.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {attachments.map((a) => {
            const project = projects.find((p) => p.id === a.projectId);
            return (
              <span
                key={a.projectId}
                className="flex items-center gap-1.5 rounded-sm bg-surface-2 px-2 py-1 text-meta text-fg-muted"
              >
                <Icon
                  name={project ? KINDS[project.kind].icon : "file"}
                  size={10}
                />
                {project?.name ?? "Unknown"}
                <button
                  type="button"
                  onClick={() =>
                    setAttachments((list) =>
                      list.filter((x) => x.projectId !== a.projectId),
                    )
                  }
                  aria-label={`Remove ${project?.name ?? "attachment"}`}
                  className="text-fg-subtle transition-colors hover:text-danger"
                >
                  <Icon name="x" size={9} />
                </button>
              </span>
            );
          })}
        </div>
      )}

      <AttachmentChips files={files.files} onRemove={files.remove} />

      <div className="flex items-end gap-2 rounded-md border border-line bg-surface px-2.5 py-1.5 transition-colors focus-within:border-line-strong">
        <AttachButton onFiles={(list) => void files.add(list)} busy={files.busy} />
        <textarea
          ref={ref}
          rows={1}
          value={body}
          placeholder={placeholder}
          aria-label="Message"
          onChange={(e) => {
            setBody(e.target.value);
            scan(e.target.value, e.target.selectionStart ?? 0);
            // Throttle the typing signal — one ping per two seconds is plenty.
            if (Date.now() > typingUntil.current) {
              typingUntil.current = Date.now() + 2000;
              setTyping(channelId, true);
            }
          }}
          onBlur={() => setTyping(channelId, false)}
          onPaste={(e) => {
            // Only intercept when the clipboard actually carries a file —
            // pasting text must stay ordinary paste.
            if (e.clipboardData.files.length) {
              e.preventDefault();
              void files.add(e.clipboardData.files);
            }
          }}
          onKeyDown={(e) => {
            if (trigger) {
              // Escape closes the popup whether or not it has anything in it —
              // it can now be open with a notice instead of a list.
              if (e.key === "Escape") {
                e.preventDefault();
                setTrigger(null);
                return;
              }
            }
            if (trigger && suggestions.length > 0) {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((i) => (i + 1) % suggestions.length);
                return;
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((i) => (i - 1 + suggestions.length) % suggestions.length);
                return;
              }
              if (e.key === "Enter" || e.key === "Tab") {
                e.preventDefault();
                applySuggestion(suggestions[active]);
                return;
              }
            }
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          className="max-h-32 min-h-[22px] w-full resize-none bg-transparent py-1 text-body text-fg outline-none placeholder:text-fg-subtle"
        />

        <button
          type="button"
          onClick={submit}
          disabled={!body.trim() && all.length === 0}
          aria-label="Send message"
          className={cn(
            "mb-0.5 grid size-6 shrink-0 place-items-center rounded-sm transition-colors duration-150",
            body.trim() || all.length
              ? "bg-accent text-on-accent hover:brightness-110"
              : "text-fg-subtle",
          )}
        >
          <Icon name="arrow-up" size={12} />
        </button>
      </div>
    </DropZone>
  );
}
