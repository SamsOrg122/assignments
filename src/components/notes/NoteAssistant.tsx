"use client";

/**
 * The assistant, beside the note.
 *
 * The same endpoint the desktop note talks to, so there is one set of rules
 * about what the model may do and one place they are enforced. What differs
 * is what happens when a document comes back: the desktop has to write it to
 * the account as a file and let the web app adopt it later, because a project
 * needs a workspace and Rust has never resolved one. Here the store is one
 * import away, so the document exists before the sentence describing it has
 * finished streaming, and the link goes straight to it.
 *
 * The transcript is deliberately not kept. A note assistant is asked one
 * thing at a time — "tidy this", "make a deck of it" — and each answer is
 * about the note as it is *now*; persisting the exchange would mean deciding
 * what happens to it when the note it refers to has been rewritten, and the
 * honest answer is that it stops meaning anything.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";
import { uid } from "@/lib/factories";
import { askAssistant, type AssistFile, type AssistNote } from "@/lib/ai/assist/client";
import { makeProject, reviewBlocks } from "@/lib/kit/artefact";
import { listen, speechProviderName, type SpeechSession } from "@/lib/speech";
import { AttachMenu } from "./AttachMenu";

type Turn =
  | { id: string; who: "you"; text: string }
  | { id: string; who: "ai"; text: string }
  | { id: string; who: "did"; text: string }
  | { id: string; who: "made"; text: string; name: string; projectId: string }
  | { id: string; who: "bad"; text: string };

/**
 * The things people actually ask a notepad, as buttons.
 *
 * Not a tutorial and not a menu of features — a blank prompt box next to a
 * note is a small blank-page problem of its own, and four openers are enough
 * to show what the thing is for. They fill the box rather than sending, so
 * the first one can be edited into the real question.
 */
/**
 * A recogniser's error code, in words somebody can act on.
 *
 * The codes come straight from the Web Speech API and are not for reading:
 * "not-allowed" is what Chrome says both when somebody denied the microphone
 * and when the speech service it quietly depends on is unreachable, which are
 * different problems with the same name. The sentence covers both rather than
 * confidently naming the wrong one.
 */
function sayWhy(code: string): string {
  if (/not-allowed/.test(code))
    return "This browser wouldn't let the page listen — check the microphone permission for this site.";
  if (/audio-capture/.test(code)) return "No microphone was found.";
  if (/network/.test(code)) return "The speech service couldn't be reached.";
  if (/language-not-supported/.test(code))
    return "This browser can't transcribe that language.";
  return `Couldn't hear you — ${code}`;
}

const OPENERS = [
  { label: "Summarise this note", prompt: "Summarise this note in a few lines." },
  { label: "Tidy the writing", prompt: "Tidy up the writing in this note. Keep my meaning and my voice." },
  {
    label: "Analyse the attached file",
    prompt:
      "Analyse the attached file. Make a document with the findings, a table of the numbers and a chart of it.",
  },
  {
    label: "Turn it into a deck",
    prompt: "Turn this note into a short presentation.",
  },
];

export function NoteAssistant({
  note,
  onApply,
  onClose,
}: {
  note: { id: string; body: string } | null;
  onApply: (change: AssistNote) => Promise<void>;
  onClose: () => void;
}) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [attached, setAttached] = useState<AssistFile[]>([]);
  const [voice, setVoice] = useState<SpeechSession | null>(null);
  const [deaf, setDeaf] = useState<string | null>(null);

  const stop = useRef<AbortController | null>(null);
  const foot = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  /*
   * Whatever was typed before dictation started.
   *
   * Both speech providers emit the transcript *so far* on every chunk, final
   * ones included — so what arrives replaces the dictated part rather than
   * extending it. Anything already in the box has to be held aside or the
   * first chunk would eat it.
   */
  const typedBefore = useRef("");

  useEffect(() => {
    foot.current?.scrollIntoView({ block: "end" });
  }, [turns]);

  useEffect(() => () => stop.current?.abort(), []);

  const cancel = useCallback(() => {
    stop.current?.abort();
    stop.current = null;
    setBusy(false);
  }, []);

  /*
   * Talking to it, rather than typing at it.
   *
   * Dictation lands in the box instead of sending straight off. A recogniser
   * mishears names and numbers, and a question that sends itself the moment
   * you stop speaking gives nobody the chance to fix "Ana" before it becomes
   * part of a document. So: speak, glance, press send.
   *
   * The seam underneath already falls back to a simulated provider when the
   * browser's recogniser is present but not actually working — Chrome routes
   * it through a network service that is missing offline and behind some
   * proxies. Which one answered is on screen while it listens, because
   * "listening" from a recogniser that cannot hear is the worst of the
   * possible lies.
   */
  const talk = async () => {
    if (voice) {
      const session = voice;
      setVoice(null);
      setDeaf(null);
      await session.stop().catch(() => "");
      return;
    }

    typedBefore.current = question.trim() ? `${question.trimEnd()} ` : "";
    setDeaf(null);
    try {
      const session = await listen({
        onChunk: ({ text }) => {
          // Replaced, not appended — see `typedBefore`.
          setQuestion(typedBefore.current + text);
          // Words are arriving, so whatever went wrong has been recovered
          // from. Leaving the warning up would be the app describing a
          // failure that is visibly not happening.
          if (text.trim()) setDeaf(null);
        },
        /*
         * Deliberately a line by the microphone rather than a turn in the
         * transcript, and deliberately not the end of the session.
         *
         * A microphone problem is not something the assistant said, so it
         * does not belong in the conversation. And the seam underneath
         * recovers from most of these on its own — it swaps to the simulated
         * provider a couple of seconds in — so tearing the session down here
         * would cancel the recovery, and announcing a failure permanently
         * would be a lie the moment words start arriving.
         */
        onError: (message) => setDeaf(sayWhy(message)),
      });
      setVoice(session);
    } catch (error) {
      setDeaf(sayWhy(String((error as Error).message ?? error)));
    }
  };

  // A panel that closes mid-sentence must not leave the microphone open.
  useEffect(() => () => voice?.cancel(), [voice]);

  const send = async (asked: string) => {
    const prompt = asked.trim();
    if (!prompt || busy) return;

    // Sending is done talking. Leaving the recogniser running would type the
    // next thing said into a box that is about to be answered into.
    if (voice) {
      const session = voice;
      setVoice(null);
      await session.stop().catch(() => "");
    }

    setQuestion("");
    setTurns((all) => [...all, { id: uid(), who: "you", text: prompt }]);
    setBusy(true);

    const controller = new AbortController();
    stop.current = controller;

    // One id for the whole answer, so each streamed fragment rewrites the
    // same turn rather than appending a hundred one-word bubbles.
    const answerId = uid();
    let answer = "";

    try {
      for await (const frame of askAssistant({
        prompt,
        note: { body: note?.body ?? "" },
        files: attached,
        signal: controller.signal,
      })) {
        if (controller.signal.aborted) break;

        if (frame.type === "text") {
          answer += frame.value;
          const text = answer;
          /*
           * Whether this is the first fragment is asked of the turns
           * themselves, not of a flag out here.
           *
           * A `let said = false` next to the loop reads fine and is wrong:
           * the updater runs when React gets round to it, by which point the
           * flag has already been set to true — so the first fragment takes
           * the "update the existing turn" branch, finds no turn with this
           * id, changes nothing, and the entire answer never appears. The
           * tool result still lands, which makes it look like the model
           * silently did the work without saying anything.
           */
          setTurns((all) =>
            all.some((t) => t.id === answerId)
              ? all.map((t) => (t.id === answerId ? { ...t, text } : t))
              : [...all, { id: answerId, who: "ai", text }],
          );
          continue;
        }

        if (frame.type === "note") {
          try {
            await onApply(frame.value);
            setTurns((all) => [...all, { id: uid(), who: "did", text: frame.value.label }]);
          } catch (error) {
            setTurns((all) => [
              ...all,
              {
                id: uid(),
                who: "bad",
                text: `Couldn't change the note — ${String((error as Error).message ?? error)}`,
              },
            ]);
          }
          continue;
        }

        if (frame.type === "artefact") {
          try {
            const blocks = reviewBlocks(frame.value.name, frame.value.blocks);
            const projectId = makeProject(frame.value.name, blocks);
            setTurns((all) => [
              ...all,
              {
                id: uid(),
                who: "made",
                text: frame.value.label,
                name: frame.value.name,
                projectId,
              },
            ]);
          } catch (error) {
            setTurns((all) => [
              ...all,
              { id: uid(), who: "bad", text: String((error as Error).message ?? error) },
            ]);
          }
          continue;
        }

        if (frame.type === "error") {
          setTurns((all) => [...all, { id: uid(), who: "bad", text: frame.value }]);
          continue;
        }

        if (frame.type === "done") break;
      }
    } finally {
      if (stop.current === controller) stop.current = null;
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface">
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-line px-3">
        <Icon name="sparkle" size={13} className="shrink-0 text-accent" />
        <span className="flex-1 text-[12.5px] font-medium text-fg">Assistant</span>
        <button
          type="button"
          onClick={onClose}
          className="rounded-xs p-1 text-fg-subtle transition-colors duration-150 hover:text-fg"
          aria-label="Close the assistant"
        >
          <Icon name="x" size={13} />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {turns.length === 0 ? (
          <div>
            <p className="text-[12px] leading-relaxed text-fg-subtle">
              Ask it to change what you have written, or to make something out
              of it — an analysis, a report, a deck. Attach a file and it reads
              that too.
            </p>
            <ul className="mt-3 grid gap-1">
              {OPENERS.map((opener) => (
                <li key={opener.label}>
                  <button
                    type="button"
                    onClick={() => {
                      setQuestion(opener.prompt);
                      box.current?.focus();
                    }}
                    className="w-full rounded-xs border border-line px-2 py-1.5 text-left text-[11.5px] text-fg-muted transition-colors duration-150 hover:border-line-strong hover:text-fg"
                  >
                    {opener.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <ul className="grid gap-2.5">
            {turns.map((turn) => (
              <li key={turn.id}>
                <Bubble turn={turn} />
              </li>
            ))}
          </ul>
        )}

        {busy && (
          <p className="mt-2.5 flex items-center gap-1.5 text-[11px] text-fg-subtle">
            <Icon name="sparkle" size={11} className="animate-pulse text-accent" />
            Thinking…
          </p>
        )}

        <div ref={foot} />
      </div>

      <div className="shrink-0 border-t border-line p-2.5">
        <div className="flex items-end justify-between gap-2">
          <AttachMenu
            attached={attached}
            onAttach={(file) =>
              setAttached((all) =>
                all.some((f) => f.id === file.id) ? all : [...all, file],
              )
            }
            onDetach={(id) => setAttached((all) => all.filter((f) => f.id !== id))}
          />

          <button
            type="button"
            onClick={() => void talk()}
            aria-pressed={voice !== null}
            title={
              voice
                ? `Listening via ${speechProviderName()} — click to stop`
                : "Dictate your question"
            }
            className={cn(
              "flex shrink-0 items-center gap-1 rounded-xs border px-1.5 py-1 text-[11px] transition-colors duration-150",
              voice
                ? "border-accent text-fg"
                : "border-line text-fg-subtle hover:text-fg",
            )}
          >
            <Icon
              name={voice ? "stop" : "mic"}
              size={11}
              className={voice ? "animate-pulse text-accent" : undefined}
            />
            {voice ? "Listening…" : "Speak"}
          </button>
        </div>

        {deaf && (
          <p className="mt-1.5 text-[10.5px] leading-relaxed text-warn" role="status">
            {deaf}
          </p>
        )}

        <div className="mt-2 flex items-end gap-1.5">
          <textarea
            ref={box}
            value={question}
            rows={2}
            placeholder="Ask about this note…"
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              // Enter sends, Shift+Enter is a newline — the shape every chat
              // box has, and the one people try first.
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send(question);
              }
            }}
            className="min-h-[52px] w-full flex-1 resize-none rounded-sm border border-line bg-canvas px-2 py-1.5 text-[12px] leading-relaxed text-fg outline-none focus:border-accent"
          />
          <button
            type="button"
            onClick={() => (busy ? cancel() : void send(question))}
            disabled={!busy && !question.trim()}
            aria-label={busy ? "Stop" : "Ask"}
            className={cn(
              "mb-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-sm transition-[filter,opacity] duration-150",
              busy
                ? "border border-line text-fg-muted hover:text-fg"
                : "bg-accent text-on-accent hover:brightness-110 disabled:opacity-40",
            )}
          >
            <Icon name={busy ? "stop" : "arrow-up"} size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

function Bubble({ turn }: { turn: Turn }) {
  if (turn.who === "you")
    return (
      <p className="ml-6 rounded-sm bg-surface-2 px-2.5 py-1.5 text-[12px] leading-relaxed whitespace-pre-wrap text-fg">
        {turn.text}
      </p>
    );

  if (turn.who === "ai")
    return (
      <p className="text-[12px] leading-relaxed whitespace-pre-wrap text-fg-muted">
        {turn.text}
      </p>
    );

  if (turn.who === "did")
    return (
      <p className="flex items-center gap-1.5 text-[11.5px] text-fg-subtle">
        <Icon name="check" size={11} className="shrink-0 text-accent" />
        {turn.text}
      </p>
    );

  if (turn.who === "made")
    return (
      <div className="rounded-sm border border-line px-2.5 py-2">
        <p className="flex items-center gap-1.5 text-[11.5px] text-fg-subtle">
          <Icon name="check" size={11} className="shrink-0 text-accent" />
          {turn.text}
        </p>
        <Link
          href={`/p/${turn.projectId}`}
          className="mt-1.5 flex items-center gap-1 text-[12px] text-accent hover:underline"
        >
          Open {turn.name}
          <Icon name="arrow-right" size={11} />
        </Link>
      </div>
    );

  return (
    <p className="text-[11.5px] leading-relaxed text-warn" role="alert">
      {turn.text}
    </p>
  );
}
