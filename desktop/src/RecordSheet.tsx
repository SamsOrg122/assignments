/**
 * Recording, watched.
 *
 * Everything that matters happens in Rust — the microphone, the slicing, the
 * upload, the reading back. This is the window on it: a level meter that moves
 * because somebody is making noise, the words as they land, and two buttons.
 *
 * Three things it says out loud, each because the alternative is a person
 * being misled about what they have:
 *
 *   1. the words arrive about half a minute behind. A live transcript that
 *      pauses for thirty seconds looks broken unless somebody has been told
 *      it is a paragraph at a time;
 *   2. the meter is the microphone, not the transcript. Bars can move while
 *      no words come back — that is a connection problem, and seeing both at
 *      once is what tells you which half is failing;
 *   3. the dates in it do not go into the agenda, and that is stated when the
 *      document lands rather than left to be discovered. See the note at the
 *      top of `record/commands.rs`.
 */

import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  recordCancel,
  recordStart,
  recordStop,
  type RecordDone,
} from "./notes";

type Phase = "idle" | "starting" | "recording" | "reading" | "done" | "failed";

export function RecordSheet() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [heard, setHeard] = useState("");
  const [level, setLevel] = useState(0);
  const [problem, setProblem] = useState<string | null>(null);
  const [done, setDone] = useState<RecordDone | null>(null);
  const [since, setSince] = useState(0);
  const started = useRef(0);
  const words = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const wordsIn = listen<string>("record:heard", (event) => setHeard(event.payload));
    const meter = listen<number>("record:level", (event) => setLevel(event.payload));
    // A slice that failed is not the recording failing, so this is shown
    // beside the words rather than replacing them.
    const trouble = listen<string>("record:problem", (event) => setProblem(event.payload));
    return () => {
      void wordsIn.then((off) => off());
      void meter.then((off) => off());
      void trouble.then((off) => off());
    };
  }, []);

  useEffect(() => {
    if (phase !== "recording") return;
    const tick = setInterval(() => setSince(Date.now() - started.current), 500);
    return () => clearInterval(tick);
  }, [phase]);

  // Follow the transcript down, so the newest paragraph is the visible one.
  useEffect(() => {
    const box = words.current;
    if (box) box.scrollTop = box.scrollHeight;
  }, [heard]);

  const begin = async () => {
    setPhase("starting");
    setProblem(null);
    setHeard("");
    setDone(null);
    try {
      await recordStart();
      started.current = Date.now();
      setSince(0);
      setPhase("recording");
    } catch (error) {
      setProblem(String(error));
      setPhase("failed");
    }
  };

  const finish = async () => {
    setPhase("reading");
    try {
      setDone(await recordStop());
      setPhase("done");
    } catch (error) {
      setProblem(String(error));
      setPhase("failed");
    }
  };

  const clock = `${Math.floor(since / 60000)}:${String(Math.floor(since / 1000) % 60).padStart(2, "0")}`;

  return (
    <div className="sheet record">
      {phase === "idle" || phase === "failed" ? (
        <>
          <h2>Record a conversation</h2>
          <p>
            The microphone is opened here, on this computer. The words are read
            back on tougather.com using your own account — no key is kept in
            this app — and what comes out is a document with a summary, the
            points, and everything that was said.
          </p>
          <p className="quiet">
            It arrives about half a minute behind: the recording is sent up a
            paragraph at a time, which is what makes it work in a window that
            has no speech recognition of its own.
          </p>
          {problem ? <p className="bad">{problem}</p> : null}
          <button type="button" className="go" onClick={() => void begin()}>
            Start recording
          </button>
        </>
      ) : phase === "starting" ? (
        <p className="quiet">Opening the microphone…</p>
      ) : phase === "reading" ? (
        <>
          <h2>Reading it back</h2>
          <p className="quiet">
            {heard.split(/\s+/).filter(Boolean).length} words. Writing the
            summary and checking every quoted line against what was actually
            said — this takes a moment on a long conversation.
          </p>
        </>
      ) : phase === "done" && done ? (
        <>
          <h2>{done.name ?? "Nothing to write down"}</h2>
          <p>
            {done.name
              ? `${done.words} words, ${Math.round(done.seconds / 60)} minute${Math.round(done.seconds / 60) === 1 ? "" : "s"}. It is on its way to your library.`
              : `${done.words} words.`}
          </p>
          <p className="quiet">{done.note}</p>
          <button type="button" className="go" onClick={() => void begin()}>
            Record another
          </button>
        </>
      ) : (
        <>
          <div className="live">
            <span className="dot" aria-hidden />
            <span className="clock">{clock}</span>
            {/* The meter is the microphone. Bars moving with no words arriving
                is a connection problem, and showing both is what makes that
                readable rather than mysterious. */}
            <span className="meter" aria-label="Microphone level">
              {[0, 1, 2, 3, 4, 5, 6].map((bar) => (
                <span
                  key={bar}
                  className={level * 7 > bar ? "bar on" : "bar"}
                />
              ))}
            </span>
          </div>
          <div className="words" ref={words}>
            {heard ? (
              <p>{heard}</p>
            ) : (
              <p className="quiet">
                Listening. The first words appear after about half a minute.
              </p>
            )}
          </div>
          {problem ? <p className="bad">{problem}</p> : null}
          <div className="ends">
            <button type="button" className="go" onClick={() => void finish()}>
              Stop and keep it
            </button>
            <button
              type="button"
              className="link"
              onClick={() => {
                void recordCancel();
                setPhase("idle");
                setHeard("");
              }}
            >
              Throw it away
            </button>
          </div>
        </>
      )}
    </div>
  );
}
