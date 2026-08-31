"use client";

/**
 * The team assistant, running inside a normal channel.
 *
 * Everything you send here goes through the same `askAI` seam as the rest of
 * the app, but with the workspace in context: members and their roles, what the
 * team has agreed to remember, the files it has read, and every project. When
 * an exchange produces something worth keeping, it offers to remember it — and
 * that entry lands *unconfirmed*, so an inferred fact never quietly becomes
 * workspace truth.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { askAI, type AIChange } from "@/lib/ai";
import { useTeamContext } from "@/lib/ai/use-team-context";
import { useTeam, KNOWLEDGE_LABELS, type KnowledgeKind } from "@/lib/team";
import { useChat, type Message, type MessageAttachment } from "@/lib/chat";
import { AI_USER_ID } from "@/lib/chat/seed";
import { useProjects } from "@/lib/store";
import { useUI } from "@/lib/ui-store";
import { uid } from "@/lib/factories";
import { cn } from "@/lib/cn";
import { Icon } from "@/components/ui/Icon";
import {
  AttachButton,
  AttachmentChips,
  DropZone,
  FileCard,
  useFileAttachments,
} from "./attachments";

const PROMPTS = [
  "Catch me up on this team",
  "Who is my supervisor?",
  "When is the deadline?",
  "What's in the brief?",
];

export function TeamAssistant({ channelId }: { channelId: string }) {
  const messages = useChat((s) => s.messages);
  const team = useTeamContext();
  const remember = useTeam((s) => s.remember);
  const projects = useProjects((s) => s.projects);
  const notify = useUI((s) => s.notify);

  const [draft, setDraft] = useState("");
  const [streaming, setStreaming] = useState("");
  const [pending, setPending] = useState<AIChange | null>(null);
  const [busy, setBusy] = useState(false);
  const files = useFileAttachments();

  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const history = messages
    .filter((m) => m.channelId === channelId)
    .sort((a, b) => a.at - b.at);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [history.length, streaming]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const ask = useCallback(
    async (text: string) => {
      const question = text.trim();
      if (!question || busy) return;

      // The question is an ordinary message, so it persists like any other —
      // attachments included, which is what makes them re-readable later.
      const attached = files.files;
      useChat.getState().send(channelId, question, {
        attachments: attached.length ? (attached as MessageAttachment[]) : undefined,
      });
      files.clear();
      setDraft("");
      setPending(null);
      setStreaming("");
      setBusy(true);

      const controller = new AbortController();
      abortRef.current = controller;

      const context = {
        projectId: "",
        projectName: team.workspaceName,
        projectKind: "doc" as const,
        blocks: [],
        workspace: projects.map((p) => ({
          id: p.id,
          name: p.name,
          kind: p.kind,
          summary: `${p.blocks.length} blocks`,
        })),
        // Files attached to *this* question join the workspace's own for the
        // duration of the answer. They are not silently added to the team's
        // permanent record — sharing a file in a chat isn't the same act as
        // putting it in the workspace, and conflating the two is how a
        // shared memory fills with things nobody meant to keep.
        team: attached.length
          ? {
              ...team,
              files: [
                ...team.files,
                ...attached.map((f) => ({
                  id: f.id,
                  name: f.name,
                  text: f.text,
                  status: f.status,
                })),
              ],
              focusFiles: attached.map((f) => f.id),
            }
          : team,
        words: 0,
      };

      let answer = "";
      let change: AIChange | null = null;

      try {
        for await (const chunk of askAI(question, context, controller.signal)) {
          if (controller.signal.aborted) return;
          if (chunk.type === "text") {
            answer += chunk.value;
            setStreaming(answer);
          } else if (chunk.type === "change") {
            change = chunk.value;
          }
        }
      } catch (err) {
        if ((err as Error)?.name === "AbortError") return;
        answer = answer || "Something went wrong answering that.";
      }

      // Commit the finished answer as a real message so it survives a reload.
      const reply: Message = {
        id: uid(),
        channelId,
        authorId: AI_USER_ID,
        body: answer,
        at: Date.now(),
      };
      useChat.setState((s) => ({ messages: [...s.messages, reply] }));
      setStreaming("");
      setPending(change);
      setBusy(false);
    },
    [busy, channelId, team, projects, files],
  );

  const acceptLearning = () => {
    if (!pending || pending.kind !== "remember") return;
    remember({
      kind: pending.entry.kind as KnowledgeKind,
      subject: pending.entry.subject,
      body: pending.entry.body,
      source: "chat",
      sourceRef: channelId,
      // Even an explicit "remember that" stays unconfirmed until someone
      // checks it on the Team page — the memory is shared, so the bar is
      // higher than one person's phrasing.
      confirmed: false,
    });
    setPending(null);
    notify("Added to what the team knows");
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {history.map((m) => (
          <Bubble key={m.id} message={m} />
        ))}

        {streaming && (
          <Bubble
            message={{
              id: "streaming",
              channelId,
              authorId: AI_USER_ID,
              body: streaming,
              // Never rendered — the bubble only lands a timestamp once it's
              // committed as a real message.
              at: 0,
            }}
            streaming
          />
        )}

        {busy && !streaming && (
          <p className="anim-shimmer px-1 py-2 text-body text-fg-subtle">
            Reading the workspace…
          </p>
        )}

        {pending?.kind === "remember" && (
          <div className="anim-slide-up mt-3 rounded-md border border-line-strong bg-surface-2 p-3">
            <p className="mb-1.5 flex items-center gap-2 text-body text-fg">
              <Icon name="sparkle" size={11} className="text-accent" />
              Remember this for the whole team?
            </p>
            <p className="mb-1 text-body text-fg">
              <span className="font-medium">{pending.entry.subject}</span> —{" "}
              {pending.entry.body}
            </p>
            <p className="mb-2.5 text-meta text-fg-subtle">
              Filed as{" "}
              {KNOWLEDGE_LABELS[pending.entry.kind as KnowledgeKind] ?? "a fact"}
              . It stays marked unconfirmed until someone checks it.
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={acceptLearning}
                className="rounded-sm bg-accent px-2.5 py-1 text-body font-medium text-on-accent transition-[filter] duration-150 hover:brightness-110"
              >
                Remember
              </button>
              <button
                type="button"
                onClick={() => setPending(null)}
                className="rounded-sm border border-line px-2.5 py-1 text-body text-fg-muted transition-colors duration-150 hover:border-line-strong hover:text-fg"
              >
                Don&apos;t
              </button>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {history.length <= 1 && !busy && (
        <div className="flex flex-wrap gap-1.5 border-t border-line px-3 py-2.5">
          {PROMPTS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => void ask(p)}
              className="rounded-sm border border-line px-2 py-1 text-meta text-fg-muted transition-colors duration-150 hover:border-line-strong hover:text-fg"
            >
              {p}
            </button>
          ))}
        </div>
      )}

      <DropZone
        onFiles={(list) => void files.add(list)}
        className="border-t border-line px-3 py-2.5"
        hint="Drop a file and ask about it"
      >
        <AttachmentChips files={files.files} onRemove={files.remove} />
        <div className="flex items-end gap-2 rounded-md border border-line bg-surface px-2.5 py-1.5 transition-colors focus-within:border-line-strong">
          <AttachButton
            onFiles={(list) => void files.add(list)}
            busy={files.busy}
            label="Attach a file to this question"
          />
          <textarea
            ref={inputRef}
            rows={1}
            value={draft}
            aria-label="Message"
            placeholder="Ask the team assistant…"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void ask(draft);
              }
            }}
            className="max-h-32 min-h-[22px] w-full resize-none bg-transparent py-1 text-[13.5px] leading-relaxed text-fg outline-none placeholder:text-fg-subtle"
          />
          <button
            type="button"
            onClick={() => void ask(draft)}
            disabled={(!draft.trim() && !files.files.length) || busy}
            aria-label="Send message"
            className={cn(
              "mb-0.5 grid size-6 shrink-0 place-items-center rounded-sm transition-colors duration-150",
              (draft.trim() || files.files.length) && !busy
                ? "bg-accent text-on-accent hover:brightness-110"
                : "border border-line text-fg-subtle",
            )}
          >
            <Icon name="arrow-up" size={12} />
          </button>
        </div>
      </DropZone>
    </div>
  );
}

function Bubble({
  message,
  streaming,
}: {
  message: Message;
  streaming?: boolean;
}) {
  const isAssistant = message.authorId === AI_USER_ID;

  return (
    <div className={cn("mb-3 flex gap-2.5", !isAssistant && "justify-end")}>
      {isAssistant && (
        <span
          aria-hidden="true"
          className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full border border-line bg-surface-2 text-accent"
        >
          <Icon name="sparkle" size={12} />
        </span>
      )}
      <div
        className={cn(
          "max-w-[76%] rounded-md px-3 py-2 text-[13.5px] leading-relaxed",
          isAssistant
            ? "border border-line bg-surface text-fg"
            : "bg-accent-soft text-fg",
        )}
      >
        {message.body && <Markdownish text={message.body} />}
        {message.attachments
          ?.filter((a) => a.kind === "file")
          .map((a) => (
            <div key={a.id} className={message.body ? "mt-2" : undefined}>
              <FileCard file={a} />
            </div>
          ))}
        {streaming && (
          <span className="anim-shimmer ml-0.5 inline-block h-3.5 w-1.5 translate-y-0.5 bg-accent" />
        )}
      </div>
    </div>
  );
}

/** The same restrained subset the inline popover renders. */
function Markdownish({ text }: { text: string }) {
  return (
    <>
      {text.split("\n").map((line, i) =>
        line.trim() === "" ? (
          <span key={i} className="block h-2" />
        ) : (
          <p key={i} className={line.startsWith("•") ? "pl-1" : undefined}>
            {line
              .split(/(\*\*[^*]+\*\*|_[^_]+_)/g)
              .map((part, j) =>
                part.startsWith("**") && part.endsWith("**") ? (
                  <strong key={j} className="font-medium">
                    {part.slice(2, -2)}
                  </strong>
                ) : part.startsWith("_") && part.endsWith("_") && part.length > 2 ? (
                  <em key={j} className="text-fg-subtle">
                    {part.slice(1, -1)}
                  </em>
                ) : (
                  <span key={j}>{part}</span>
                ),
              )}
          </p>
        ),
      )}
    </>
  );
}
