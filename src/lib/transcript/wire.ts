"use client";

/**
 * The one place the recorder is joined to the thing that files what it heard.
 *
 * `components/transcript/Recorder` keeps the landing code behind a seam —
 * `setTranscriptSink()` — and that is right: the bar has to record, and has to
 * keep an hour of somebody's meeting safe, whether or not anything downstream
 * of it exists. But a seam nobody registers against is a stop button that ends
 * in "Nothing is set up yet to turn a recording into a document", which is
 * exactly what this shipped as. `lib/transcript/land` holds the registration
 * (`landRecordings()`), and a module that is imported by nothing is never
 * evaluated, so the sink stayed null.
 *
 * WHY A SIDE-EFFECT IMPORT. Registering is a thing that has to happen once,
 * before the first recording ends, on any page a recording can be started
 * from. There is no component to hang it on — the bar lives in the shell and
 * must not import the landing code, or the seam it is built on stops meaning
 * anything — and doing it inside each entry point's own handler would put the
 * same three lines in every surface, where the fourth one added would forget
 * them. So this module is the wiring, its evaluation is the act, and
 * `import "@/lib/transcript/wire";` is how a surface performs it.
 *
 * WHO MUST IMPORT IT. Every surface that can start a recording, today:
 *
 *   - `components/shell/CommandPalette` — and through it the whole app shell,
 *     since the shell imports the palette on every page;
 *   - `app/(app)/notes/page`.
 *
 * A third entry point that calls `startTranscription()` without this import
 * records the meeting, keeps every word of it, and then cannot make anything
 * out of it. Nothing in the type system catches that. This paragraph is the
 * only thing that does.
 */

import { keyOf } from "@/lib/agenda/model";
import { supabase } from "@/lib/db/client";
import { isSimulated, transcriptOf, type Recording } from "@/lib/transcript";
import { landRecordings, type Findings } from "@/lib/transcript/land";

/**
 * Ask `/api/transcript` what was in the recording.
 *
 * The session token goes with it for the reason every other endpoint gets one:
 * the model key is server-side and the daily allowance is counted against an
 * account.
 *
 * `today` is this browser's day, sent rather than left to the server: the
 * server's clock is in UTC and a meeting recorded at half past midnight in
 * Amsterdam happens on a date UTC has not reached, which would move every
 * "next Tuesday" in it a day early.
 */
async function readBack(recording: Recording): Promise<Findings> {
  // `transcriptOf()` rather than the segments: it welds SIMULATED_BANNER to
  // the front of fabricated words, which is how the endpoint catches a
  // simulated recording even if the flag beside it were ever dropped.
  const text = transcriptOf(recording);

  const client = supabase();
  const token = client
    ? (await client.auth.getSession()).data.session?.access_token
    : undefined;

  let response: Response;
  try {
    response = await fetch("/api/transcript", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        text,
        today: keyOf(new Date()),
        simulated: isSimulated(recording),
      }),
    });
  } catch (error) {
    return unread(recording, String((error as Error).message ?? error));
  }

  const payload = (await response.json().catch(() => null)) as
    | (Findings & { error?: string })
    | null;

  if (!response.ok || !payload || typeof payload !== "object" || payload.error)
    return unread(
      recording,
      payload?.error ?? `the server answered ${response.status} and said nothing`,
    );

  /*
   * Handed on exactly as it came back, `simulated` included and untouched.
   *
   * It is tempting to OR it with the recording's own provenance here and be
   * doubly safe. It would be the opposite: `land()` decides that question from
   * three independent answers — the recording's provenance, the reading's
   * flag, and the mark on each individual fact — and folding two of them into
   * one here would leave it with two, then one, and the whole point of three
   * is that no single edit can turn the check off.
   */
  return payload;
}

/**
 * What to file when the reading never happened.
 *
 * The alternative is to throw, which the bar handles honestly enough — it
 * keeps the words and offers them for copying — but leaves an hour of a real
 * meeting sitting in a scratch store that nothing syncs and one "close"
 * dismisses. The transcript is the part that must not be losable, so the
 * document is still written, with the words in it in full.
 *
 * What must not happen is that document arriving silently: a transcript with
 * no appointments in it and no explanation reads exactly like a meeting where
 * nothing was arranged. So the reason is said twice, in the two places it is
 * read from — on the receipt, now, in the list of what was not filed; and in
 * the document, which is what somebody opens in a month when the panel is
 * long gone.
 */
function unread(recording: Recording, why: string): Findings {
  const said = why.trim() || "no reason was given";
  return {
    // Not `false`: a simulated recording that also failed to be read is still
    // simulated, and the banner on its document depends on this being right.
    simulated: isSimulated(recording),
    summary:
      "No summary was written, and nothing was taken out of this recording — " +
      "no appointments, no deadlines, no figures. Reading it back did not " +
      `work: ${said} Every word that was heard is in the transcript below, ` +
      "and anything arranged in this meeting is written down nowhere else.",
    dropped: [
      {
        title: "Nothing was read out of this recording",
        why: `reading it back did not work, and nothing was guessed in its place — ${said}`,
      },
    ],
  };
}

landRecordings(readBack);
