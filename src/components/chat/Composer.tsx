"use client";

/**
 * The composer.
 *
 * Two things it does that a chat box normally can't: `@` mentions a
 * collaborator, and `#` attaches a *live* Library project — the reason chat
 * belongs in this app rather than beside it.
 */

import { useMemo, useRef, useState } from "react";
import { PEOPLE, useChat, type MessageAttachment } from "@/lib/chat";
import { LOCAL_USER } from "@/lib/realtime";
import { useProjects } from "@/lib/store";
import { KINDS } from "@/lib/kinds";
import { fuzzyMatch } from "@/lib/fuzzy";
import { cn } from "@/lib/cn";
import { Icon } from "@/components/ui/Icon";

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
  const projects = useProjects((s) => s.projects);

  const [body, setBody] = useState("");
  const [attachments, setAttachments] = useState<MessageAttachment[]>([]);
  const [trigger, setTrigger] = useState<Trigger | null>(null);
  const [active, setActive] = useState(0);
  const ref = useRef<HTMLTextAreaElement>(null);
  const typingUntil = useRef(0);

  const suggestions = useMemo(() => {
    if (!trigger) return [];
    if (trigger.kind === "mention")
      return PEOPLE.filter((p) => p.id !== LOCAL_USER.id)
        .map((p) => ({ id: p.id, label: p.name, hint: "person" }))
        .filter((o) => !trigger.query || fuzzyMatch(trigger.query, o.label));
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
  }, [trigger, projects]);

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

  const submit = () => {
    if (!body.trim() && attachments.length === 0) return;
    send(channelId, body, { parentId, attachments: attachments.length ? attachments : undefined });
    setBody("");
    setAttachments([]);
    setTrigger(null);
  };

  return (
    <div className="relative border-t border-line px-3 py-2.5">
      {trigger && suggestions.length > 0 && (
        <div className="anim-pop absolute bottom-full left-3 z-30 mb-1.5 w-[280px] overflow-hidden rounded-md border border-line-strong bg-surface p-1 shadow-[0_20px_60px_-12px_rgba(0,0,0,0.6)]">
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
              <span className="truncate text-[12.5px] text-fg">{option.label}</span>
              <span className="ml-auto shrink-0 font-mono text-[9.5px] text-fg-subtle">
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
                className="flex items-center gap-1.5 rounded-sm border border-line bg-surface-2 px-2 py-1 text-[11.5px] text-fg-muted"
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

      <div className="flex items-end gap-2 rounded-md border border-line bg-surface px-2.5 py-1.5 transition-colors focus-within:border-line-strong">
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
          onKeyDown={(e) => {
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
              if (e.key === "Escape") {
                e.preventDefault();
                setTrigger(null);
                return;
              }
            }
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          className="max-h-32 min-h-[22px] w-full resize-none bg-transparent py-1 text-[13.5px] leading-relaxed text-fg outline-none placeholder:text-fg-subtle"
        />

        <button
          type="button"
          onClick={submit}
          disabled={!body.trim() && attachments.length === 0}
          aria-label="Send message"
          className={cn(
            "mb-0.5 grid size-6 shrink-0 place-items-center rounded-sm transition-colors duration-150",
            body.trim() || attachments.length
              ? "bg-accent text-white hover:brightness-110"
              : "border border-line text-fg-subtle",
          )}
        >
          <Icon name="arrow-up" size={12} />
        </button>
      </div>

    </div>
  );
}
