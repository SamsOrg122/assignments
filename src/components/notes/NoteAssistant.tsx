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

/**
 * The things people actually ask a notepad, as buttons.
 *
 * Not a tutorial and not a menu of features — a blank prompt box next to a
 * note is a small blank-page problem of its own, and four openers are enough
 * to show what the thing is for. They fill the box rather than sending, so
 * the first one can be edited into the real question.
 */
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
      <header className="flex h-14 shrink-0 items-center gap-2.5 px-4">
        <span
          className="flex h-7 w-7 items-center justify-center rounded-[10px]"
          style={{ background: "var(--pad-slab-3)", color: "var(--pad-signal)" }}
        >
          <Icon name="sparkle" size={13} />
        </span>
        <span
          className="flex-1 text-[13px] font-medium"
          style={{ color: "var(--pad-ink)" }}
        >
          Assistant
        </span>
        <button
          type="button"
          onClick={onClose}
          className="pad-ghost p-1.5"
          aria-label="Close the assistant"
        >
          <Icon name="x" size={14} />
        </button>
      </header>

      <div
        className={cn(
          "flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-3",
          // Nothing said yet: keep the invitation down by the box it is
          // inviting you to type into, rather than stranded at the top of an
          // otherwise empty column.
          turns.length === 0 && "justify-end",
        )}
      >
        {turns.length === 0 ? (
          <div>
            <p
              className="text-[12.5px] leading-relaxed"
              style={{ color: "var(--pad-ink-2)" }}
            >
              Ask it to change what you have written, or to make something out
              of it — an analysis, a report, a deck. Attach a file and it reads
              that too.
            </p>
            <ul className="mt-4 grid gap-1.5">
              {OPENERS.map((opener, i) => (
                <li
                  key={opener.label}
                  className="pad-turn"
                  style={{ animationDelay: `${60 + i * 55}ms` }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setQuestion(opener.prompt);
                      box.current?.focus();
                    }}
                    className="pad-chip flex w-full items-center gap-2 px-3 py-2.5 text-left text-[12px]"
                  >
                    <Icon
                      name="arrow-right"
                      size={11}
                      className="shrink-0"
                      style={{ color: "var(--pad-signal)" }}
                    />
                    {opener.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <ul className="grid gap-3">
            {turns.map((turn) => (
              <li key={turn.id} className="pad-turn">
                <Bubble turn={turn} />
              </li>
            ))}
          </ul>
        )}

        {busy && (
          <p
            className="mt-3 flex items-center gap-2 text-[11.5px]"
            style={{ color: "var(--pad-ink-3)" }}
          >
            <span className="pad-thinking" aria-hidden>
              <i />
              <i />
              <i />
            </span>
            Thinking…
          </p>
        )}

        <div ref={foot} />
      </div>

      <div className="shrink-0 p-3">
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
            data-on={voice !== null}
            className="pad-chip flex shrink-0 items-center gap-1.5 px-2.5 py-1.5 text-[11.5px]"
          >
            <Icon
              name={voice ? "stop" : "mic"}
              size={11}
              style={voice ? { color: "var(--pad-signal)" } : undefined}
            />
            {voice ? "Listening…" : "Speak"}
          </button>
        </div>

        {deaf && (
          <p
            className="pad-turn mt-2 rounded-lg px-2.5 py-1.5 text-[10.5px] leading-relaxed"
            style={{ background: "var(--pad-slab-2)", color: "var(--pad-ink-2)" }}
            role="status"
          >
            {deaf}
          </p>
        )}

        {/*
          * The box and its button are one block, not a field with a button
          * beside it: the send control lives *inside* the field's border, so
          * the composer reads as a single object you type into.
          */}
        <div className={cn("pad-field mt-2.5 flex items-end gap-2 p-2", voice && "pad-live")}>
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
            className="min-h-[48px] w-full flex-1 resize-none bg-transparent px-1 py-0.5 text-[12.5px] leading-relaxed outline-none"
            style={{ color: "var(--pad-ink)" }}
          />
          <button
            type="button"
            onClick={() => (busy ? cancel() : void send(question))}
            disabled={!busy && !question.trim()}
            aria-label={busy ? "Stop" : "Ask"}
            className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center",
              busy ? "pad-chip" : "pad-primary disabled:opacity-30",
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
      <p
        className="ml-7 rounded-2xl rounded-br-md px-3.5 py-2.5 text-[12.5px] leading-relaxed whitespace-pre-wrap"
        style={{ background: "var(--pad-slab-3)", color: "var(--pad-ink)" }}
      >
        {turn.text}
      </p>
    );

  if (turn.who === "ai")
    return (
      <p
        className="px-0.5 text-[12.5px] leading-[1.65] whitespace-pre-wrap"
        style={{ color: "var(--pad-ink-2)" }}
      >
        {turn.text}
      </p>
    );

  /*
   * What it did, as a receipt rather than as a sentence.
   *
   * The brass rule down the left is the only place this palette raises its
   * voice, and it earns it: these two are the lines that say the note or the
   * account actually changed, which is the difference between a chat window
   * and a tool.
   */
  if (turn.who === "did")
    return (
      <p
        className="flex items-center gap-2 border-l-2 py-0.5 pl-2.5 text-[11.5px]"
        style={{ borderColor: "var(--pad-signal)", color: "var(--pad-ink-2)" }}
      >
        <Icon name="check" size={11} style={{ color: "var(--pad-signal)" }} />
        {turn.text}
      </p>
    );

  if (turn.who === "made")
    return (
      <div
        className="rounded-2xl border-l-2 px-3.5 py-3"
        style={{
          background: "var(--pad-slab-2)",
          borderColor: "var(--pad-signal)",
        }}
      >
        <p
          className="flex items-center gap-2 text-[11.5px]"
          style={{ color: "var(--pad-ink-2)" }}
        >
          <Icon name="check" size={11} style={{ color: "var(--pad-signal)" }} />
          {turn.text}
        </p>
        <Link
          href={`/p/${turn.projectId}`}
          className="pad-chip mt-2.5 inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium"
          style={{ color: "var(--pad-ink)" }}
        >
          Open {turn.name}
          <Icon name="arrow-right" size={11} />
        </Link>
      </div>
    );

  return (
    <p
      className="rounded-xl px-3 py-2 text-[11.5px] leading-relaxed"
      style={{ background: "var(--pad-slab-2)", color: "var(--pad-danger)" }}
      role="alert"
    >
      {turn.text}
    </p>
  );
}
