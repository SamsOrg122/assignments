import { useEffect, useRef, useState } from "react";
import { ask, cancel, onFrame, type Frame } from "./assistant";
import { Pixels } from "./Pixels";

/**
 * The assistant, in a 340-pixel window.
 *
 * A transcript and one box. No settings, no model picker, no history
 * sidebar — this is a thing you open, ask, and close again, and every
 * control that is not the box is a control in the way.
 *
 * Two things it says that a chat window usually does not. When it changes
 * the note, the line says so in the person's own terms and the note behind
 * this panel is already different — the reply is not the deliverable, the
 * note is. And when it makes a document, it says the document is on its way
 * to the account rather than pretending it is here: this window has no
 * renderer for a chart, and claiming otherwise would be the lie.
 */

type Turn =
  | { who: "you"; text: string }
  | { who: "it"; text: string; model?: string; done: boolean }
  | { who: "note"; text: string }
  | { who: "doc"; text: string }
  | { who: "bad"; text: string };

export function Assistant({
  noteId,
  onClose,
  onNotesChanged,
}: {
  noteId: string;
  onClose: () => void;
  /** A note was rewritten under us; the list and the open note must reload. */
  onNotesChanged: () => void;
}) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLTextAreaElement>(null);
  const foot = useRef<HTMLDivElement>(null);
  const changed = useRef(false);

  useEffect(() => {
    box.current?.focus();
  }, []);

  useEffect(() => {
    // Stay at the bottom as the answer fills in, the way a transcript does.
    foot.current?.scrollIntoView({ block: "end" });
  }, [turns]);

  useEffect(() => {
    let alive = true;
    const stop = onFrame((frame: Frame) => {
      if (!alive) return;
      setTurns((all) => fold(all, frame));
      if (frame.type === "did") changed.current = true;
      if (frame.type === "done") {
        setBusy(false);
        if (changed.current) {
          changed.current = false;
          onNotesChanged();
        }
      }
    });
    return () => {
      alive = false;
      void stop.then((off) => off());
    };
  }, [onNotesChanged]);

  const send = async () => {
    const prompt = draft.trim();
    if (!prompt || busy) return;
    setDraft("");
    setTurns((all) => [...all, { who: "you", text: prompt }]);
    setBusy(true);
    try {
      await ask(prompt, noteId);
    } catch (error) {
      setBusy(false);
      setTurns((all) => [...all, { who: "bad", text: String(error) }]);
    }
  };

  return (
    <div className="ai">
      <div className="ai-log">
        {turns.length === 0 ? (
          <div className="ai-blank">
            <p className="ai-blank-lead">Ask it to do something.</p>
            <ul className="ai-hints">
              <li>Tidy this into bullet points</li>
              <li>Analyse the spreadsheet I dropped</li>
              <li>Turn these notes into a short presentation</li>
            </ul>
            <p className="ai-blank-note">
              It can rewrite what is in the note, and it can make a document in
              your account — prose, tables, charts, slides — which opens in the
              full app.
            </p>
          </div>
        ) : (
          turns.map((turn, i) => <Line key={i} turn={turn} />)
        )}
        {busy ? (
          <p className="ai-thinking">
            <Pixels tone="blue" />
            Thinking
          </p>
        ) : null}
        <div ref={foot} />
      </div>

      <div className="ai-box">
        <textarea
          ref={box}
          value={draft}
          rows={2}
          placeholder="Ask, or tell it what to do…"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            // Enter sends; shift-enter is a new line. In a two-line box the
            // other way round would mean nobody ever finds how to send.
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
            if (e.key === "Escape") {
              e.preventDefault();
              onClose();
            }
          }}
        />
        <div className="ai-actions">
          <button type="button" className="link" onClick={onClose}>
            Back to the note
          </button>
          {busy ? (
            <button
              type="button"
              className="link"
              onClick={() => {
                void cancel();
                setBusy(false);
              }}
            >
              Stop
            </button>
          ) : (
            <button
              type="button"
              className="ai-send"
              disabled={!draft.trim()}
              onClick={() => void send()}
            >
              Ask
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Line({ turn }: { turn: Turn }) {
  if (turn.who === "you") return <p className="ai-you">{turn.text}</p>;
  if (turn.who === "note")
    return (
      <p className="ai-done">
        <span aria-hidden="true">✓</span> {turn.text} — the note is updated
      </p>
    );
  if (turn.who === "doc")
    return (
      <p className="ai-done">
        <span aria-hidden="true">✓</span> {turn.text} — on its way to your
        account, open it in the full app
      </p>
    );
  if (turn.who === "bad")
    return (
      <p className="ai-bad" role="alert">
        {turn.text}
      </p>
    );
  return <p className="ai-it">{turn.text}</p>;
}

/**
 * One frame folded into the transcript.
 *
 * Text arrives in pieces and belongs to the answer already being written, so
 * it appends to the last turn rather than making a new one — the whole point
 * of streaming is one paragraph growing, not forty one-word bubbles.
 */
function fold(all: Turn[], frame: Frame): Turn[] {
  const last = all[all.length - 1];

  if (frame.type === "model") {
    return [...all, { who: "it", text: "", model: frame.value, done: false }];
  }
  if (frame.type === "text") {
    if (last && last.who === "it" && !last.done) {
      return [...all.slice(0, -1), { ...last, text: last.text + frame.value }];
    }
    return [...all, { who: "it", text: frame.value, done: false }];
  }
  if (frame.type === "did") return [...all, { who: "note", text: frame.value }];
  if (frame.type === "made") return [...all, { who: "doc", text: frame.value }];
  if (frame.type === "error") return [...all, { who: "bad", text: frame.value }];

  // done: seal the open answer so the next one starts its own bubble.
  if (last && last.who === "it" && !last.done) {
    return [...all.slice(0, -1), { ...last, done: true }];
  }
  return all;
}
